import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { approveDocument } from "../packages/core/src/approvals";
import { createDocumentVersion } from "../packages/core/src/documents";
import { initProject } from "../packages/core/src/project";
import { createHarnessConfig } from "../packages/core/src/settings";
import { createMcpConfig } from "../packages/integrations/src/mcp";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "rph-hermes-acceptance-"));
  initProject(root, { projectName: "Hermes Acceptance" });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("Hermes-like runtime acceptance", () => {
  it("sends natural-language runtime input to the active AI provider with actionable slash-command context", async () => {
    const captureFile = path.join(root, "fetch-capture.json");
    writeOpenAiEnv(root, "https://example.invalid/v1");

    const result = await runCli(["shell"], {
      cwd: root,
      stdinChunks: [
        { text: "다음에 뭐 하면 돼?\n", delayMs: 0 },
        { text: "/exit\n", delayMs: 50 }
      ],
      preloadFetchCapture: captureFile
    });

    expect(result.exitCode).toBe(0);
    const prompt = readCapturedPrompt(captureFile);
    expect(prompt).toContain("Current user message:");
    expect(prompt).toContain("다음에 뭐 하면 돼?");
    expect(prompt).toContain("Available command style:");
    expect(prompt).toContain("/pm start");
  }, 10000);

  it("runs a read-only agent tool loop for plain ask chat", async () => {
    const captureFile = path.join(root, "fetch-sequence.jsonl");
    writeOpenAiEnv(root, "https://example.invalid/v1");

    const result = await runCli(["ask", "팀에게 제품 상황을 설명해줘"], {
      cwd: root,
      preloadFetchSequence: captureFile
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("현재 단계는 SETUP입니다.");
    const payloads = fs.readFileSync(captureFile, "utf8").trim().split("\n").map((line) => JSON.parse(line) as { input: string });
    expect(payloads).toHaveLength(2);
    expect(payloads[1].input).toContain("Tool observation");
    const manifest = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "current-session.json"), "utf8")) as {
      activeTurn?: {
        status: string;
        toolCalls: Array<{ name: string; status: string; observation?: string }>;
      };
      toolTrace?: Array<{ name: string; status: string }>;
    };
    expect(manifest.activeTurn?.status).toBe("complete");
    expect(manifest.activeTurn?.toolCalls[0].name).toBe("workflow.get_status");
    expect(manifest.activeTurn?.toolCalls[0].status).toBe("succeeded");
    expect(manifest.activeTurn?.toolCalls[0].observation).toContain("\"stage\": \"SETUP\"");
    expect(manifest.toolTrace?.[0].name).toBe("workflow.get_status");
  }, 10000);

  it("executes safe read-only command proposals from the agent", async () => {
    writeOpenAiEnv(root, "https://example.invalid/v1");

    const result = await runCli(["ask", "안녕?"], {
      cwd: root,
      preloadFetchCommandProposal: true
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agent proposed command: /status");
    expect(result.stdout).toContain("agent action: /status");
    expect(result.stdout).toContain("현재 단계:");
  }, 10000);

  it("includes approved document body in runtime context assembly for follow-up planning", async () => {
    createDocumentVersion(root, "product-definition", {
      changeSummary: "approved source of truth",
      body: "# Approved Product Definition\n\n- 핵심 가설: 승인된 본문"
    });
    approveDocument(root, "product-definition", "pm");
    const captureFile = path.join(root, "fetch-capture.json");
    writeOpenAiEnv(root, "https://example.invalid/v1");

    const result = await runCli(["shell"], {
      cwd: root,
      stdinChunks: [
        { text: "지금 기준으로 다음 액션 플랜 정리해줘\n", delayMs: 0 },
        { text: "/exit\n", delayMs: 50 }
      ],
      preloadFetchCapture: captureFile
    });

    expect(result.exitCode).toBe(0);
    const prompt = readCapturedPrompt(captureFile);
    expect(prompt).toContain("승인된 본문");
  }, 10000);

  it("creates a current runtime session manifest when the shell starts", async () => {
    writeOpenAiEnv(root, "http://127.0.0.1:9/v1");

    const result = await runCli(["shell"], {
      cwd: root,
      stdinChunks: [
        { text: "/exit\n", delayMs: 0 }
      ]
    });

    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(path.join(root, ".rph", "runtime", "current-session.json"))).toBe(true);
  });

  it("updates the current runtime session manifest after command execution", async () => {
    writeOpenAiEnv(root, "http://127.0.0.1:9/v1");

    const result = await runCli(["shell"], {
      cwd: root,
      stdinChunks: [
        { text: "/status\n", delayMs: 0 },
        { text: "/exit\n", delayMs: 50 }
      ]
    });

    expect(result.exitCode).toBe(0);
    const manifestPath = path.join(root, ".rph", "runtime", "current-session.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      sessionId: string;
      lastCommand?: string;
      lastCommandOk?: boolean;
    };
    expect(manifest.lastCommand).toBe("/status");
    expect(manifest.lastCommandOk).toBe(true);
    expect(manifest.sessionId).toMatch(/^session-/);
  });

  it("resumes the same runtime session manifest across shell restarts", async () => {
    writeOpenAiEnv(root, "http://127.0.0.1:9/v1");

    const first = await runCli(["shell"], {
      cwd: root,
      stdinChunks: [
        { text: "/status\n", delayMs: 0 },
        { text: "/exit\n", delayMs: 50 }
      ]
    });
    expect(first.exitCode).toBe(0);
    const manifestPath = path.join(root, ".rph", "runtime", "current-session.json");
    const firstManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { sessionId: string };

    const second = await runCli(["shell"], {
      cwd: root,
      stdinChunks: [
        { text: "/exit\n", delayMs: 0 }
      ]
    });
    expect(second.exitCode).toBe(0);
    const secondManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { sessionId: string };
    expect(secondManifest.sessionId).toBe(firstManifest.sessionId);
  });

  it("blocks plain natural language while paused and recovers through resume", async () => {
    writeOpenAiEnv(root, "http://127.0.0.1:9/v1");

    const result = await runCli(["shell"], {
      cwd: root,
      stdinChunks: [
        { text: "/pause\n", delayMs: 0 },
        { text: "계속 진행해\n", delayMs: 50 },
        { text: "/resume\n", delayMs: 50 },
        { text: "/exit\n", delayMs: 50 }
      ]
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[blocked]");
    const manifest = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "current-session.json"), "utf8")) as {
      status: string;
      blocker: string | null;
    };
    expect(manifest.status).toBe("active");
    expect(manifest.blocker).toBeNull();
  });
});

describe("Hermes-like CLI contracts", () => {
  it("turns one product idea into a review-ready execution package", async () => {
    const result = await runCli(["productize", "AI 회의록을 액션아이템과 담당자 추적으로 바꾸는 SaaS"], { cwd: root });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Productize golden path complete");
    expect(result.stdout).toContain("documents: 11");
    expect(result.stdout).toContain("design artifacts: 5");
    expect(result.stdout).toContain("PR drafts: #1, #2");
    expect(fs.existsSync(path.join(root, ".rph", "golden-path", "latest.md"))).toBe(true);

    const productDefinition = fs.readFileSync(path.join(root, ".rph", "documents", "product-definition", "v1.0.0.md"), "utf8");
    const prBody = fs.readFileSync(path.join(root, ".rph", "prs", "issue-1.md"), "utf8");
    const qaReport = JSON.parse(fs.readFileSync(path.join(root, ".rph", "qa", "pr-1-report.json"), "utf8")) as {
      requirementStatus: string;
      designStatus: string;
      apiContractStatus: string;
      securityStatus: string;
      accessibilityStatus: string;
    };
    const qaMarkdown = fs.readFileSync(path.join(root, ".rph", "qa", "pr-1-report.md"), "utf8");

    expect(productDefinition).not.toMatch(/\bTBD\b/);
    expect(prBody).not.toMatch(/\bTBD\b/);
    expect(qaReport.requirementStatus).toBe("matched");
    expect(qaReport.designStatus).toBe("matched");
    expect(qaReport.apiContractStatus).toBe("matched");
    expect(qaReport.securityStatus).toBe("unknown");
    expect(qaReport.accessibilityStatus).toBe("unknown");
    expect(qaMarkdown).toContain("- security_status: unknown");
    expect(qaMarkdown).toContain("- accessibility_status: unknown");
  });

  it("routes natural-language productization requests through rph ask", async () => {
    const result = await runCli(["ask", "이 아이디어를 MVP spec과 FE/BE 작업으로 만들어줘: AI 회의록 액션아이템 SaaS"], { cwd: root });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agent action: /productize");
    expect(result.stdout).toContain("Productize golden path complete");
    expect(fs.existsSync(path.join(root, ".rph", "golden-path", "latest.json"))).toBe(true);
    const latest = JSON.parse(fs.readFileSync(path.join(root, ".rph", "golden-path", "latest.json"), "utf8")) as { idea: string };
    const productDefinition = fs.readFileSync(path.join(root, ".rph", "documents", "product-definition", "v1.0.0.md"), "utf8");
    expect(latest.idea).toBe("AI 회의록 액션아이템 SaaS");
    expect(productDefinition).toContain("AI 회의록 액션아이템 SaaS");
    expect(productDefinition).not.toContain("이 아이디어를 MVP spec과 FE/BE 작업으로 만들어줘");
  });

  it("continues the productize package through status and first approval by CLI", async () => {
    const productize = await runCli(["ask", "이 아이디어를 MVP spec과 FE/BE 작업으로 만들어줘: 승인 게이트 SaaS"], {
      cwd: root
    });
    expect(productize.exitCode).toBe(0);

    const statusBefore = await runCli(["status"], { cwd: root });
    expect(statusBefore.exitCode).toBe(0);
    expect(statusBefore.stdout).toContain("현재 단계: PM_PRODUCT_DEFINITION_REVIEW");
    expect(statusBefore.stdout).toContain("승인 필요: product-definition");

    const approve = await runCli(["docs", "approve", "product-definition", "--by", "user"], { cwd: root });
    expect(approve.exitCode).toBe(0);
    expect(approve.stdout).toContain("[승인 완료] product-definition");

    const statusAfter = await runCli(["status"], { cwd: root });
    expect(statusAfter.exitCode).toBe(0);
    expect(statusAfter.stdout).toContain("현재 단계: PM_PRODUCT_DEFINITION_APPROVED");
    expect(statusAfter.stdout).toContain("승인 완료: product-definition");
  });

  it("bootstraps an uninitialized folder from one productize request", async () => {
    const uninitializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-productize-bootstrap-"));
    try {
      const result = await runCli(["ask", "이 아이디어를 MVP spec과 FE/BE 작업으로 만들어줘: 고객 피드백 분석 SaaS"], {
        cwd: uninitializedRoot
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("RPH project initialized");
      expect(result.stdout).toContain("Productize golden path complete");
      expect(fs.existsSync(path.join(uninitializedRoot, ".rph", "project.json"))).toBe(true);
      expect(fs.existsSync(path.join(uninitializedRoot, ".rph", "golden-path", "latest.md"))).toBe(true);
      const latest = JSON.parse(fs.readFileSync(path.join(uninitializedRoot, ".rph", "golden-path", "latest.json"), "utf8")) as { idea: string };
      expect(latest.idea).toBe("고객 피드백 분석 SaaS");
    } finally {
      fs.rmSync(uninitializedRoot, { recursive: true, force: true });
    }
  });

  it("allows setup auto to bootstrap an uninitialized directory", async () => {
    const uninitializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-setup-bootstrap-"));
    try {
      const result = await runCli(["setup", "auto", "--guide"], { cwd: uninitializedRoot });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("RPH project initialized");
      expect(fs.existsSync(path.join(uninitializedRoot, ".rph", "project.json"))).toBe(true);
    } finally {
      fs.rmSync(uninitializedRoot, { recursive: true, force: true });
    }
  });

  it("allows pm start to bootstrap an uninitialized top-level workflow", async () => {
    const uninitializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-pm-start-bootstrap-"));
    try {
      const result = await runCli(["pm", "start"], { cwd: uninitializedRoot });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("RPH project initialized");
      expect(result.stdout).toContain("PM 워크플로우 시작");
      expect(result.stdout).toContain("현재 단계: PM_PRODUCT_DEFINITION_INTERVIEW");
      const state = JSON.parse(fs.readFileSync(path.join(uninitializedRoot, ".rph", "state.json"), "utf8")) as {
        currentStage: string;
      };
      expect(state.currentStage).toBe("PM_PRODUCT_DEFINITION_INTERVIEW");
    } finally {
      fs.rmSync(uninitializedRoot, { recursive: true, force: true });
    }
  });

  it("exits with code 2 and a suggestion for unknown commands", async () => {
    const result = await runCli(["unknown-command"], { cwd: root });

    expect(result.exitCode).toBe(2);
    expect(result.stdout + result.stderr).toMatch(/unknown command/i);
    expect(result.stdout + result.stderr).toContain("/help");
  });

  it("supports setup detect as a read-only detection pass", async () => {
    fs.writeFileSync(path.join(root, ".env"), [
      "OPENAI_API_KEY=test-openai",
      "GITHUB_TOKEN=test-github",
      "GITHUB_OWNER=king",
      "GITHUB_REPO=real-product-harness"
    ].join("\n"));

    const configPath = path.join(root, ".rph", "config.json");
    const before = fs.readFileSync(configPath, "utf8");
    const result = await runCli(["setup", "detect"], { cwd: root });
    const after = fs.readFileSync(configPath, "utf8");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("detected");
    expect(after).toBe(before);
  });

  it("supports setup apply as a mutating apply pass separate from detection", async () => {
    fs.writeFileSync(path.join(root, ".env"), "OPENAI_API_KEY=test-openai\n");

    const result = await runCli(["setup", "apply"], { cwd: root });
    const config = JSON.parse(fs.readFileSync(path.join(root, ".rph", "config.json"), "utf8")) as {
      activeAiProvider: string;
    };

    expect(result.exitCode).toBe(0);
    expect(config.activeAiProvider).toBe("openai");
    expect(result.stdout).toContain("applied");
  });

  it("supports setup check --live as a verification-only pass", async () => {
    const result = await runCli(["setup", "check", "--live"], { cwd: root });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Live connection check");
    expect(result.stdout).not.toContain("RPH Setup Auto");
  });
});

describe("Hermes-like MCP contract stability", () => {
  it("keeps stitch MCP URL aligned between harness config and generated .mcp config", () => {
    const harnessConfig = createHarnessConfig({
      STITCH_API_KEY: "stitch-key"
    } as NodeJS.ProcessEnv);
    const mcpConfig = createMcpConfig(["stitch"]);

    expect(harnessConfig.mcpServers.stitch.url).toBe(mcpConfig.mcpServers.stitch.url);
  });
});

function writeOpenAiEnv(projectRoot: string, baseUrl: string): void {
  fs.writeFileSync(path.join(projectRoot, ".env"), [
    "OPENAI_API_KEY=test-openai",
    `OPENAI_BASE_URL=${baseUrl}`
  ].join("\n"));
}

function readCapturedPrompt(captureFile: string): string {
  const payload = JSON.parse(fs.readFileSync(captureFile, "utf8")) as { input?: string };
  return payload.input ?? "";
}

async function runCli(
  args: string[],
  options: {
    cwd: string;
    stdinChunks?: Array<{ text: string; delayMs: number }>;
    preloadFetchCapture?: string;
    preloadFetchSequence?: string;
    preloadFetchCommandProposal?: boolean;
  }
): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}> {
  const repoRoot = path.resolve(__dirname, "..");
  const cliEntry = path.join(repoRoot, "dist", "apps", "cli", "src", "index.js");
  const preload = options.preloadFetchSequence
    ? createFetchSequenceStub(options.cwd, options.preloadFetchSequence)
    : options.preloadFetchCapture
      ? createFetchStub(options.cwd, options.preloadFetchCapture)
      : options.preloadFetchCommandProposal
        ? createFetchCommandProposalStub(options.cwd)
        : undefined;
  const nodeArgs = [...(preload ? ["--require", preload] : []), cliEntry, ...args];

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, nodeArgs, {
      cwd: options.cwd,
      env: { ...process.env },
      stdio: "pipe"
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });

    void writeChunks(child.stdin, options.stdinChunks ?? []);
  });
}

function createFetchCommandProposalStub(projectRoot: string): string {
  const preloadPath = path.join(projectRoot, "fetch-command-proposal-preload.cjs");
  fs.writeFileSync(preloadPath, [
    "global.fetch = async () => {",
    "  const text = JSON.stringify({ action: { type: 'command', command: '/status', safeToAutoRun: true, reason: 'read current state', message: '상태 확인 명령을 실행합니다.' } });",
    "  return new Response(JSON.stringify({",
    "    output: [{ type: 'message', content: [{ type: 'output_text', text }] }],",
    "    usage: { input_tokens: 10, output_tokens: 5 }",
    "  }), { status: 200, headers: { 'content-type': 'application/json' } });",
    "};"
  ].join("\n"));
  return preloadPath;
}

function createFetchStub(projectRoot: string, captureFile: string): string {
  const preloadPath = path.join(projectRoot, "fetch-preload.cjs");
  fs.writeFileSync(preloadPath, [
    "const fs = require('node:fs');",
    `const captureFile = ${JSON.stringify(captureFile)};`,
    "global.fetch = async (_url, init = {}) => {",
    "  const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};",
    "  fs.writeFileSync(captureFile, JSON.stringify(body));",
    "  return new Response(JSON.stringify({",
    "    output: [{ type: 'message', content: [{ type: 'output_text', text: '# next\\n\\n/run `/pm start`' }] }],",
    "    usage: { input_tokens: 10, output_tokens: 5 }",
    "  }), { status: 200, headers: { 'content-type': 'application/json' } });",
    "};"
  ].join("\n"));
  return preloadPath;
}

function createFetchSequenceStub(projectRoot: string, captureFile: string): string {
  const preloadPath = path.join(projectRoot, "fetch-sequence-preload.cjs");
  fs.writeFileSync(preloadPath, [
    "const fs = require('node:fs');",
    `const captureFile = ${JSON.stringify(captureFile)};`,
    "let callCount = 0;",
    "global.fetch = async (_url, init = {}) => {",
    "  callCount += 1;",
    "  const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};",
    "  fs.appendFileSync(captureFile, JSON.stringify(body) + '\\n');",
    "  const text = callCount === 1",
    "    ? JSON.stringify({ action: { type: 'tool_call', tool: 'workflow.get_status', args: {} } })",
    "    : JSON.stringify({ action: { type: 'respond', message: '현재 단계는 SETUP입니다.' } });",
    "  return new Response(JSON.stringify({",
    "    output: [{ type: 'message', content: [{ type: 'output_text', text }] }],",
    "    usage: { input_tokens: 10, output_tokens: 5 }",
    "  }), { status: 200, headers: { 'content-type': 'application/json' } });",
    "};"
  ].join("\n"));
  return preloadPath;
}

async function writeChunks(
  stdin: NodeJS.WritableStream,
  chunks: Array<{ text: string; delayMs: number }>
): Promise<void> {
  for (const chunk of chunks) {
    if (chunk.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, chunk.delayMs));
    }
    stdin.write(chunk.text);
  }
  stdin.end();
}
