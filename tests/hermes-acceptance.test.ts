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
  }
): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}> {
  const repoRoot = path.resolve(__dirname, "..");
  const cliEntry = path.join(repoRoot, "dist", "apps", "cli", "src", "index.js");
  const preload = options.preloadFetchCapture ? createFetchStub(options.cwd, options.preloadFetchCapture) : undefined;
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
