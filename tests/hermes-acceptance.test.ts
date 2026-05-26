import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadRuntimeActionApprovals, recordRuntimeActionApproval } from "../packages/core/src/agent-action-approvals";
import { approveDocument } from "../packages/core/src/approvals";
import {
  claimRuntimeHandoff,
  createRuntimeSessionManifest,
  loadRuntimeHandoffs,
  recordRuntimeHandoff,
  runtimeHandoffExecutionToken,
  saveRuntimeSession,
  startRuntimeHandoffWork
} from "../packages/core/src/agent-runtime";
import { startAgentLaneRun } from "../packages/core/src/agent-lane-runner";
import { approveDesignArtifact, createDesignArtifactVersion, syncStateDesignArtifacts } from "../packages/core/src/design";
import { createDocumentVersion, readDocumentIndex, syncStateDocuments } from "../packages/core/src/documents";
import { captureGitHubIssueApprovalSnapshot, captureGitHubPullRequestApprovalSnapshot } from "../packages/core/src/github";
import { createPullRequestDraft, createWorkIssue } from "../packages/core/src/issues";
import { initProject, loadState, saveState } from "../packages/core/src/project";
import { createHarnessConfig, writeConnectionReport } from "../packages/core/src/settings";
import { ConnectionCheck } from "../packages/core/src/types";
import { createMcpConfig } from "../packages/integrations/src/mcp";

let root: string;
const ERROR_COORDINATOR_TOML = "/Users/king/Desktop/awesome-codex-subagents/categories/09-meta-orchestration/error-coordinator.toml";

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
    expect(prompt).toContain("Role contracts:");
    expect(prompt).toContain("PM: Turn product intent into approved product definition");
  }, 10000);

  it("persists request-time provider failover in runtime chat and session records", async () => {
    writeOpenAiGeminiEnv(root);

    const result = await runCli(["shell"], {
      cwd: root,
      stdinChunks: [
        { text: "다음에 뭐 하면 돼?\n", delayMs: 0 },
        { text: "/exit\n", delayMs: 50 }
      ],
      preloadFetchProviderFallback: true
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("ai provider fallback: openai -> gemini");
    expect(result.stdout).toContain("Gemini request-time fallback body");
    const manifest = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "current-session.json"), "utf8")) as {
      sessionId: string;
      activeTurn?: {
        id: string;
        providerId?: string;
        providerAttempts?: unknown[];
        providerFallback?: {
          selectedProviderId: string;
          failures: Array<{ providerId: string; message: string }>;
        };
      };
    };
    expect(manifest.activeTurn?.providerId).toBe("gemini");
    expect(manifest.activeTurn?.providerAttempts).toEqual([
      expect.objectContaining({ providerId: "openai", status: "failed" }),
      expect.objectContaining({ providerId: "gemini", status: "passed" })
    ]);
    expect(manifest.activeTurn?.providerFallback?.selectedProviderId).toBe("gemini");
    expect(manifest.activeTurn?.providerFallback?.failures[0]).toMatchObject({
      providerId: "openai",
      message: expect.stringContaining("quota exceeded")
    });
    const chatFile = path.join(root, ".rph", "ai", "chat", `${manifest.sessionId}.jsonl`);
    const chatRecords = fs.readFileSync(chatFile, "utf8").trim().split("\n").map((line) => JSON.parse(line) as {
      agentTurnId?: string;
      providerId: string;
      providerAttempts?: unknown[];
      providerFallback?: {
        selectedProviderId: string;
        failures: Array<{ providerId: string; message: string }>;
      };
    });
    expect(chatRecords).toHaveLength(1);
    expect(chatRecords[0].agentTurnId).toBe(manifest.activeTurn?.id);
    expect(chatRecords[0].providerId).toBe("gemini");
    expect(chatRecords[0].providerAttempts).toEqual(manifest.activeTurn?.providerAttempts);
    expect(chatRecords[0].providerFallback).toEqual(manifest.activeTurn?.providerFallback);

    const status = await runCli(["ai", "status"], { cwd: root });
    expect(status.exitCode).toBe(0);
    expect(status.stdout).toContain("Latest AI provider outcome");
    expect(status.stdout).toContain("source=runtime-session");
    expect(status.stdout).toContain("provider=gemini");
    expect(status.stdout).toContain("attempts=openai:failed -> gemini:passed");
    expect(status.stdout).toContain("ai provider fallback: openai -> gemini");

    const agentStatus = await runCli(["agent", "status"], { cwd: root });
    expect(agentStatus.exitCode).toBe(0);
    expect(agentStatus.stdout).toContain("AI agent: openai");
    expect(agentStatus.stdout).toContain("Latest AI provider outcome");
    expect(agentStatus.stdout).toContain("source=runtime-session");
    expect(agentStatus.stdout).toContain("provider=gemini");
    expect(agentStatus.stdout).toContain("attempts=openai:failed -> gemini:passed");
    expect(agentStatus.stdout).toContain("ai provider fallback: openai -> gemini");
  }, 10000);

  it("persists request-time provider failover in ai run records", async () => {
    writeOpenAiGeminiEnv(root);

    const result = await runCli(["ai", "run", "--prompt", "연결된 provider로 한 줄 응답"], {
      cwd: root,
      preloadFetchProviderFallback: true
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("ai provider fallback: openai -> gemini");
    expect(result.stdout).toContain("ai_run:");
    const runDir = path.join(root, ".rph", "ai", "runs");
    const runFiles = fs.readdirSync(runDir).filter((file) => file.endsWith(".json"));
    expect(runFiles).toHaveLength(1);
    const runRecord = JSON.parse(fs.readFileSync(path.join(runDir, runFiles[0]), "utf8")) as {
      providerId: string;
      outputPreview: string;
      providerAttempts?: unknown[];
      providerFallback?: {
        selectedProviderId: string;
        failures: Array<{ providerId: string; message: string }>;
      };
    };
    expect(runRecord.providerId).toBe("gemini");
    expect(runRecord.providerAttempts).toEqual([
      expect.objectContaining({ providerId: "openai", status: "failed" }),
      expect.objectContaining({ providerId: "gemini", status: "passed" })
    ]);
    expect(runRecord.providerFallback?.selectedProviderId).toBe("gemini");
    expect(runRecord.providerFallback?.failures[0]).toMatchObject({
      providerId: "openai",
      message: expect.stringContaining("quota exceeded")
    });
    expect(runRecord.outputPreview).toContain("Gemini request-time fallback body");
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

  it("keeps read-only command proposals conversational unless execution is explicit", async () => {
    writeOpenAiEnv(root, "https://example.invalid/v1");

    const result = await runCli(["ask", "안녕?"], {
      cwd: root,
      preloadFetchCommandProposal: true
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agent proposed command: /status");
    expect(result.stdout).toContain("auto-run: skipped");
    expect(result.stdout).not.toContain("agent action: /status");
    expect(result.stdout).not.toContain("현재 단계:");
  }, 10000);

  it("auto-runs read-only command proposals inside runtime chat", async () => {
    writeOpenAiEnv(root, "https://example.invalid/v1");

    const result = await runCli(["shell"], {
      cwd: root,
      stdinChunks: [
        { text: "상태를 확인해줘\n", delayMs: 0 },
        { text: "/exit\n", delayMs: 50 }
      ],
      preloadFetchCommandProposal: true
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agent proposed command: /status");
    expect(result.stdout).toContain("agent action: /status");
    expect(result.stdout).toContain("execution-policy: runtime chat allowed read-only command");
    expect(result.stdout).toContain("현재 단계: SETUP");
    expect(result.stdout).not.toContain("auto-run: skipped");
  }, 10000);

  it("auto-runs current autonomous local command proposals inside runtime chat", async () => {
    writeOpenAiEnv(root, "https://example.invalid/v1");

    const result = await runCli(["shell"], {
      cwd: root,
      stdinChunks: [
        { text: "PM 작업을 시작해줘\n", delayMs: 0 },
        { text: "/exit\n", delayMs: 50 }
      ],
      preloadFetchLocalCommandProposal: true
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agent proposed command: /pm start");
    expect(result.stdout).toContain("agent action: /pm start");
    expect(result.stdout).toContain("execution-policy: runtime chat allowed current autonomous local command");
    expect(result.stdout).toContain("PM 워크플로우 시작");
    const state = JSON.parse(fs.readFileSync(path.join(root, ".rph", "state.json"), "utf8")) as {
      currentStage: string;
    };
    expect(state.currentStage).toBe("PM_PRODUCT_DEFINITION_INTERVIEW");
  }, 10000);

  it("blocks local command proposals that are not the current autonomous runtime step", async () => {
    writeOpenAiEnv(root, "https://example.invalid/v1");

    const result = await runCli(["shell"], {
      cwd: root,
      stdinChunks: [
        { text: "FE 작업을 바로 시작해줘\n", delayMs: 0 },
        { text: "/exit\n", delayMs: 50 }
      ],
      preloadFetchLocalCommandProposal: "/fe spec"
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agent proposed command: /fe spec");
    expect(result.stdout).toContain("auto-run: blocked because the proposed local command is not the current autonomous step");
    expect(result.stdout).not.toContain("FE spec");
    const state = JSON.parse(fs.readFileSync(path.join(root, ".rph", "state.json"), "utf8")) as {
      currentStage: string;
    };
    expect(state.currentStage).toBe("SETUP");
  }, 10000);

  it("keeps runtime chat user-approval command proposals explicit", async () => {
    writeOpenAiEnv(root, "https://example.invalid/v1");
    createDocumentVersion(root, "product-definition", {
      body: "ready for review",
      changeSummary: "runtime chat approval guard fixture"
    });

    const result = await runCli(["shell"], {
      cwd: root,
      stdinChunks: [
        { text: "제품 정의 승인까지 해줘\n", delayMs: 0 },
        { text: "/exit\n", delayMs: 50 }
      ],
      preloadFetchApprovalCommandProposal: "/docs approve product-definition"
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agent proposed command: /docs approve product-definition");
    expect(result.stdout).toContain("auto-run: blocked because user approval command requires explicit user action");
    expect(result.stdout).not.toContain("문서 승인 완료");
    const manifest = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "current-session.json"), "utf8")) as {
      status: string;
      blocker?: string;
    };
    expect(manifest.status).toBe("blocked");
    expect(manifest.blocker).toContain("user approval command requires explicit user action");
  }, 10000);

    it("executes local workflow command proposals when ask --execute is explicit", async () => {
      writeOpenAiEnv(root, "https://example.invalid/v1");

    const result = await runCli(["ask", "--execute", "연결된 에이전트가 제안한 로컬 명령을 실행해줘"], {
      cwd: root,
      preloadFetchLocalCommandProposal: true
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agent proposed command: /pm start");
    expect(result.stdout).toContain("execution-policy: ask --execute allowed local workflow command");
    expect(result.stdout).toContain("PM 워크플로우 시작");
    const state = JSON.parse(fs.readFileSync(path.join(root, ".rph", "state.json"), "utf8")) as {
      currentStage: string;
    };
      expect(state.currentStage).toBe("PM_PRODUCT_DEFINITION_INTERVIEW");
    }, 10000);

    it.each([
      {
        command: "/pm approve product-definition",
        setup: () => createDocumentVersion(root, "product-definition", {
          body: "ready for review",
          changeSummary: "approval bypass guard fixture"
        }),
        indexPath: () => path.join(root, ".rph", "documents", "product-definition", "index.json"),
        approvalsPath: () => path.join(root, ".rph", "approvals", "approvals.json")
      },
      {
        command: "/docs approve product-definition",
        setup: () => createDocumentVersion(root, "product-definition", {
          body: "ready for review",
          changeSummary: "docs approval bypass guard fixture"
        }),
        indexPath: () => path.join(root, ".rph", "documents", "product-definition", "index.json"),
        approvalsPath: () => path.join(root, ".rph", "approvals", "approvals.json")
      },
      {
        command: "/pd approve page-designs",
        setup: () => createDesignArtifactVersion(root, "page-designs", {
          body: "ready for review",
          changeSummary: "design approval bypass guard fixture"
        }),
        indexPath: () => path.join(root, ".rph", "design", "page-designs", "index.json"),
        approvalsPath: () => path.join(root, ".rph", "approvals", "design-approvals.json")
      }
    ])("does not auto-run user approval command proposals from ask --execute: $command", async ({ command, setup, indexPath, approvalsPath }) => {
      writeOpenAiEnv(root, "https://example.invalid/v1");
      setup();

      const result = await runCli(["ask", "--execute", "이 요청은 일반 대화로만 처리해줘"], {
        cwd: root,
        preloadFetchApprovalCommandProposal: command
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`agent proposed command: ${command}`);
      expect(result.stdout).toContain("auto-run: blocked because user approval command requires explicit user action");
      expect(result.stdout).not.toContain("[승인 완료]");
      const approvals = fs.existsSync(approvalsPath()) ? JSON.parse(fs.readFileSync(approvalsPath(), "utf8")) as unknown[] : [];
      expect(approvals).toHaveLength(0);
      const index = JSON.parse(fs.readFileSync(indexPath(), "utf8")) as {
        status: string;
        approvedVersion?: string | null;
      };
      expect(index.status).not.toBe("approved");
      expect(index.approvedVersion ?? null).toBeNull();
      const manifest = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "current-session.json"), "utf8")) as {
        status?: string;
        blocker?: string;
      };
      expect(manifest.status).toBe("blocked");
      expect(manifest.blocker).toContain("user approval command requires explicit user action");
    }, 10000);

    it("loads runtime chat env overlay without rewriting config files", async () => {
      fs.writeFileSync(path.join(root, ".rph", "config.json"), JSON.stringify(createHarnessConfig({} as NodeJS.ProcessEnv), null, 2));
      fs.mkdirSync(path.join(root, ".mcp"), { recursive: true });
      fs.writeFileSync(path.join(root, ".mcp", "config.json"), JSON.stringify(createMcpConfig([]), null, 2));
      writeOpenAiEnv(root, "https://example.invalid/v1");
      const configBefore = fs.readFileSync(path.join(root, ".rph", "config.json"), "utf8");
      const mcpBefore = fs.readFileSync(path.join(root, ".mcp", "config.json"), "utf8");

      const result = await runCli(["ask", "상태 알려줘"], {
        cwd: root,
        preloadFetchCommandProposal: true,
        env: withoutProviderEnv()
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("agent proposed command: /status");
      expect(fs.readFileSync(path.join(root, ".rph", "config.json"), "utf8")).toBe(configBefore);
      expect(fs.readFileSync(path.join(root, ".mcp", "config.json"), "utf8")).toBe(mcpBefore);
    }, 10000);

    it("queues external write proposals and executes them only after action approval", async () => {
    writeOpenAiEnv(root, "https://example.invalid/v1");
    fs.appendFileSync(path.join(root, ".env"), "\nNOTION_TOKEN=test-notion\nNOTION_PARENT_PAGE_ID=123456781234123412341234567890ab\n");

    const proposed = await runCli(["ask", "--execute", "Notion live workspace를 만들어줘"], {
      cwd: root,
      preloadFetchMutableNotionProposal: true
    });

    expect(proposed.exitCode).toBe(0);
    expect(proposed.stdout).toContain("agent proposed command: /notion setup --live");
    expect(proposed.stdout).toContain("external action approval required: action_");
    expect(proposed.stdout).toContain("approve: /agent approve-action action_");
    expect(proposed.stdout).not.toContain("Notion live workspace 생성");
    const approvalsPath = path.join(root, ".rph", "runtime", "action-approvals.json");
    const approvals = JSON.parse(fs.readFileSync(approvalsPath, "utf8")) as Array<{
      id: string;
      status: string;
      command: string;
    }>;
    expect(approvals).toHaveLength(1);
    expect(approvals[0].status).toBe("pending");
    expect(approvals[0].command).toContain("/notion setup --live");
    const blockedManifest = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "current-session.json"), "utf8")) as {
      status?: string;
      waitCondition?: { kind: string } | null;
      pendingExternalActionId?: string | null;
    };
    expect(blockedManifest.status).toBe("blocked");
    expect(blockedManifest.waitCondition?.kind).toBe("external_live_write");
    expect(blockedManifest.pendingExternalActionId).toBe(approvals[0].id);

    const approved = await runCli(["agent", "approve-action", approvals[0].id, "--by", "tester"], {
      cwd: root,
      preloadFetchMutableNotionProposal: true
    });

    expect(approved.exitCode).toBe(0);
    expect(approved.stdout).toContain(`external action approved: ${approvals[0].id}`);
    expect(approved.stdout).toContain("Notion live workspace 생성");
    expect(approved.stdout).toContain("readback: dashboard-page-id");
    expect(approved.stdout).toContain(`external action completed: ${approvals[0].id}`);
    const completedApprovals = JSON.parse(fs.readFileSync(approvalsPath, "utf8")) as Array<{
      status: string;
      completedAt?: string;
    }>;
    expect(completedApprovals[0].status).toBe("completed");
    expect(completedApprovals[0].completedAt).toBeTruthy();
    expect(fs.readFileSync(path.join(root, ".rph", "notion", "live-workspace.json"), "utf8")).not.toContain("test-notion");
    }, 10000);

    it("refuses to approve an external action that is not owned by the current runtime session", async () => {
      const action = recordRuntimeActionApproval(root, {
        sessionId: "session-a",
        command: "/notion sync --live",
        reason: "stale action from another session"
      });
      saveRuntimeSession(root, {
        ...createRuntimeSessionManifest(root, "session-b"),
        status: "blocked",
        waitCondition: {
          kind: "external_live_write",
          message: "external action pending",
          since: new Date().toISOString()
        },
        pendingExternalActionId: action.id,
        blocker: `external action pending: ${action.command}`
      });

      const result = await runCli(["agent", "approve-action", action.id, "--by", "tester"], {
        cwd: root
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain(`external action blocked: ${action.id}`);
      expect(result.stdout).toContain("belongs to session session-a");
      expect(loadRuntimeActionApprovals(root).find((record) => record.id === action.id)?.status).toBe("pending");
    });

    it("blocks Notion live setup approval when the approved parent page drifts before execution", async () => {
      writeOpenAiEnv(root, "https://example.invalid/v1");
      const originalParent = "123456781234123412341234567890ab";
      const driftedParent = "abcdefabcdefabcdefabcdefabcdefab";
      const normalizedOriginalParent = "12345678-1234-1234-1234-1234567890ab";
      const normalizedDriftedParent = "abcdefab-cdef-abcd-efab-cdefabcdefab";
      fs.appendFileSync(path.join(root, ".env"), `\nNOTION_TOKEN=test-notion\nNOTION_PARENT_PAGE_ID=${originalParent}\n`);

      const proposed = await runCli(["ask", "--execute", "Notion live workspace를 만들어줘"], {
        cwd: root,
        preloadFetchMutableNotionProposal: true
      });

      expect(proposed.exitCode).toBe(0);
      const action = loadRuntimeActionApprovals(root)[0];
      expect(action.approvedTargetId).toBe(`notion-parent:${normalizedOriginalParent}`);
      fs.writeFileSync(
        path.join(root, ".env"),
        fs.readFileSync(path.join(root, ".env"), "utf8").replace(originalParent, driftedParent)
      );

      const result = await runCli(["agent", "approve-action", action.id, "--by", "tester"], {
        cwd: root,
        preloadFetchMutableNotionProposal: true
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain(`external action blocked: ${action.id}`);
      expect(result.stdout).toContain(`approved notion target drifted from notion-parent:${normalizedOriginalParent} to notion-parent:${normalizedDriftedParent}`);
    expect(loadRuntimeActionApprovals(root).find((record) => record.id === action.id)?.status).toBe("failed");
    expect(fs.existsSync(path.join(root, ".rph", "notion", "live-workspace.json"))).toBe(false);
    }, 10000);

    it("blocks GitHub live issue approval when the approved local issue snapshot drifts before execution", async () => {
      saveState(root, {
        ...loadState(root),
        currentStage: "IMPLEMENTATION"
      });
      const issue = createWorkIssue(root, {
        workstream: "FE",
        title: "Build approved GitHub issue snapshot"
      });
      const snapshot = captureGitHubIssueApprovalSnapshot(root, "owner", "repo", issue);
      const action = recordRuntimeActionApproval(root, {
        sessionId: "session-github-issue",
        command: `/github create-issue --agent FE --title "${issue.title}" --live`,
        reason: "pending GitHub issue write",
        approvedTargetId: "owner/repo",
        approvedParameters: {
          owner: "owner",
          repo: "repo",
          command: "create-issue",
          title: issue.title,
          agent: issue.assigneeAgent,
          label: issue.label,
          localIssueNumber: String(issue.issueNumber),
          snapshotFingerprint: snapshot.fingerprint
        },
        approvedSnapshot: snapshot
      });
      saveRuntimeSession(root, {
        ...createRuntimeSessionManifest(root, "session-github-issue"),
        status: "blocked",
        waitCondition: {
          kind: "external_live_write",
          message: "external action pending",
          since: new Date().toISOString()
        },
        pendingExternalActionId: action.id,
        blocker: `external action pending: ${action.command}`
      });
      fs.appendFileSync(path.join(root, ".rph", "github", `issue-${issue.issueNumber}-body.md`), "\nMutated after approval\n");

      const result = await runCli(["agent", "approve-action", action.id, "--by", "tester"], {
        cwd: root,
        env: {
          GITHUB_OWNER: "owner",
          GITHUB_REPO: "repo",
          GITHUB_TOKEN: "test-token"
        }
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain(`external action blocked: ${action.id}`);
      expect(result.stdout).toContain("approved GitHub issue snapshot drifted");
      expect(loadRuntimeActionApprovals(root).find((record) => record.id === action.id)?.status).toBe("failed");
      expect(fs.existsSync(path.join(root, ".rph", "github", `live-issue-${issue.issueNumber}-readback.json`))).toBe(false);
      expect(fs.existsSync(path.join(root, ".rph", "github", "live-issue-latest-readback.json"))).toBe(false);
    }, 10000);

    it("blocks GitHub live PR approval when the approved local PR snapshot drifts before execution", async () => {
      saveState(root, {
        ...loadState(root),
        currentStage: "IMPLEMENTATION"
      });
      const issue = createWorkIssue(root, {
        workstream: "FE",
        title: "Build approved GitHub PR snapshot"
      });
      const pr = createPullRequestDraft(root, issue.issueNumber);
      const snapshot = captureGitHubPullRequestApprovalSnapshot(root, "owner", "repo", pr, issue);
      const action = recordRuntimeActionApproval(root, {
        sessionId: "session-github-pr",
        command: `/github create-pr --issue ${issue.issueNumber} --live`,
        reason: "pending GitHub PR write",
        approvedTargetId: "owner/repo",
        approvedParameters: {
          owner: "owner",
          repo: "repo",
          command: "create-pr",
          issue: String(issue.issueNumber),
          target: pr.targetBranch,
          localIssueNumber: String(issue.issueNumber),
          localPrNumber: String(pr.prNumber),
          sourceBranch: pr.sourceBranch,
          snapshotFingerprint: snapshot.fingerprint
        },
        approvedSnapshot: snapshot
      });
      saveRuntimeSession(root, {
        ...createRuntimeSessionManifest(root, "session-github-pr"),
        status: "blocked",
        waitCondition: {
          kind: "external_live_write",
          message: "external action pending",
          since: new Date().toISOString()
        },
        pendingExternalActionId: action.id,
        blocker: `external action pending: ${action.command}`
      });
      fs.appendFileSync(path.join(root, ".rph", "prs", `issue-${issue.issueNumber}.md`), "\nMutated after approval\n");

      const result = await runCli(["agent", "approve-action", action.id, "--by", "tester"], {
        cwd: root,
        env: {
          GITHUB_OWNER: "owner",
          GITHUB_REPO: "repo",
          GITHUB_TOKEN: "test-token"
        }
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain(`external action blocked: ${action.id}`);
      expect(result.stdout).toContain("approved GitHub PR snapshot drifted");
      expect(loadRuntimeActionApprovals(root).find((record) => record.id === action.id)?.status).toBe("failed");
      expect(fs.existsSync(path.join(root, ".rph", "github", `live-pr-${pr.prNumber}-readback.json`))).toBe(false);
      expect(fs.existsSync(path.join(root, ".rph", "github", "live-pr-latest-readback.json"))).toBe(false);
    }, 10000);

    it("approves a pending external action from natural-language ask execution", async () => {
      writeOpenAiEnv(root, "https://example.invalid/v1");
      fs.appendFileSync(path.join(root, ".env"), "\nNOTION_TOKEN=test-notion\nNOTION_PARENT_PAGE_ID=123456781234123412341234567890ab\n");

      const proposed = await runCli(["ask", "--execute", "Notion live workspace를 만들어줘"], {
        cwd: root,
        preloadFetchMutableNotionProposal: true
      });

      expect(proposed.exitCode).toBe(0);
      const approvalsPath = path.join(root, ".rph", "runtime", "action-approvals.json");
      const approvals = JSON.parse(fs.readFileSync(approvalsPath, "utf8")) as Array<{
        id: string;
        status: string;
      }>;
      expect(approvals).toHaveLength(1);
      expect(approvals[0].status).toBe("pending");

      const approved = await runCli(["ask", "--execute", "승인해"], {
        cwd: root,
        preloadFetchMutableNotionProposal: true
      });

      expect(approved.exitCode).toBe(0);
      expect(approved.stdout).toContain(`natural approval: external action ${approvals[0].id}`);
      expect(approved.stdout).toContain(`external action approved: ${approvals[0].id}`);
      expect(approved.stdout).toContain("Notion live workspace 생성");
      expect(approved.stdout).toContain("readback: dashboard-page-id");
      expect(approved.stdout).toContain(`external action completed: ${approvals[0].id}`);
      const completedApprovals = JSON.parse(fs.readFileSync(approvalsPath, "utf8")) as Array<{
        status: string;
        completedAt?: string;
      }>;
      expect(completedApprovals[0].status).toBe("completed");
      expect(completedApprovals[0].completedAt).toBeTruthy();
      expect(fs.readFileSync(path.join(root, ".rph", "notion", "live-workspace.json"), "utf8")).not.toContain("test-notion");
    }, 10000);

  it("does not treat question-shaped approval text as external action approval", async () => {
    writeRecoveryBriefFixture(root);

    const result = await runCli(["ask", "--execute", "승인해?"], { cwd: root, env: withoutProviderEnv() });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("natural approval: external action action-recovery");
    expect(result.stdout).not.toContain("external action approved: action-recovery");

    const approvals = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "action-approvals.json"), "utf8")) as Array<{ id: string; status: string }>;
    expect(approvals.find((record) => record.id === "action-recovery")?.status).toBe("pending");
  }, 10000);

  it("does not treat negated approval text as external action approval", async () => {
    writeRecoveryBriefFixture(root);

    const result = await runCli(["ask", "--execute", "승인하지마"], { cwd: root, env: withoutProviderEnv() });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("natural approval: external action action-recovery");
    expect(result.stdout).not.toContain("external action approved: action-recovery");

    const approvals = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "action-approvals.json"), "utf8")) as Array<{ id: string; status: string }>;
    expect(approvals.find((record) => record.id === "action-recovery")?.status).toBe("pending");
  }, 10000);

    it("rejects a pending external action from natural-language ask execution", async () => {
      writeOpenAiEnv(root, "https://example.invalid/v1");
      fs.appendFileSync(path.join(root, ".env"), "\nNOTION_TOKEN=test-notion\nNOTION_PARENT_PAGE_ID=123456781234123412341234567890ab\n");

      const proposed = await runCli(["ask", "--execute", "Notion live workspace를 만들어줘"], {
        cwd: root,
        preloadFetchMutableNotionProposal: true
      });

      expect(proposed.exitCode).toBe(0);
      const approvalsPath = path.join(root, ".rph", "runtime", "action-approvals.json");
      const approvals = JSON.parse(fs.readFileSync(approvalsPath, "utf8")) as Array<{
        id: string;
        status: string;
      }>;
      expect(approvals).toHaveLength(1);
      expect(approvals[0].status).toBe("pending");

      const rejected = await runCli(["ask", "--execute", "거절해"], { cwd: root });

      expect(rejected.exitCode).toBe(0);
      expect(rejected.stdout).toContain(`natural rejection: external action ${approvals[0].id}`);
      const rejectedApprovals = JSON.parse(fs.readFileSync(approvalsPath, "utf8")) as Array<{
        status: string;
        rejectedAt?: string;
      }>;
      expect(rejectedApprovals[0].status).toBe("rejected");
      expect(rejectedApprovals[0].rejectedAt).toBeTruthy();
      expect(fs.existsSync(path.join(root, ".rph", "notion", "live-workspace.json"))).toBe(false);
    }, 10000);

  it("does not approve or reject ambiguous multiple pending external actions from natural language", async () => {
    writeMultiplePendingExternalActions(root);
    const approvalsPath = path.join(root, ".rph", "runtime", "action-approvals.json");

    const approved = await runCli(["ask", "--execute", "승인해"], { cwd: root });
    expect(approved.exitCode).toBe(0);
    expect(approved.stdout).toContain("natural approval: multiple pending external actions");
    expect(approved.stdout).toContain("- action-one: /notion setup --live --title \"One\"");
    expect(approved.stdout).toContain("- action-two: /github setup-labels");
    expect(approved.stdout).toContain("명확히 선택하려면 /agent approve-action <action-id>");
    let approvals = JSON.parse(fs.readFileSync(approvalsPath, "utf8")) as Array<{
      id: string;
      status: string;
      approvedAt?: string;
      completedAt?: string;
      rejectedAt?: string;
    }>;
    expect(approvals.map((record) => [record.id, record.status])).toEqual([
      ["action-one", "pending"],
      ["action-two", "pending"]
    ]);
    expect(approvals.some((record) => record.approvedAt || record.completedAt)).toBe(false);

    const rejected = await runCli(["ask", "--execute", "거절해"], { cwd: root });
    expect(rejected.exitCode).toBe(0);
    expect(rejected.stdout).toContain("natural rejection: multiple pending external actions");
    expect(rejected.stdout).toContain("- action-one: /notion setup --live --title \"One\"");
    expect(rejected.stdout).toContain("- action-two: /github setup-labels");
    expect(rejected.stdout).toContain("명확히 선택하려면 /agent reject-action <action-id>");
    approvals = JSON.parse(fs.readFileSync(approvalsPath, "utf8")) as Array<{
      id: string;
      status: string;
      rejectedAt?: string;
    }>;
    expect(approvals.map((record) => [record.id, record.status])).toEqual([
      ["action-one", "pending"],
      ["action-two", "pending"]
    ]);
    expect(approvals.some((record) => record.rejectedAt)).toBe(false);
    expect(fs.existsSync(path.join(root, ".rph", "notion", "live-workspace.json"))).toBe(false);
  }, 10000);

  it("does not approve ambiguous multiple pending user approval targets from natural language", async () => {
    const feSpec = createDocumentVersion(root, "fe-technical-spec", {
      body: "FE spec ready for review",
      changeSummary: "ambiguous approval fixture"
    });
    const beSpec = createDocumentVersion(root, "be-technical-spec", {
      body: "BE spec ready for review",
      changeSummary: "ambiguous approval fixture"
    });
    const apiContract = createDocumentVersion(root, "api-contract", {
      body: "API contract ready for review",
      changeSummary: "ambiguous approval fixture"
    });
    let state = syncStateDocuments(loadState(root), feSpec);
    state = syncStateDocuments(state, beSpec);
    state = syncStateDocuments(state, apiContract);
    saveState(root, { ...state, currentStage: "SPRINT_PLANNING" });

    const result = await runCli(["ask", "--execute", "승인해"], { cwd: root });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("natural approval: multiple pending approval targets");
    expect(result.stdout).toContain("- /fe approve spec");
    expect(result.stdout).toContain("- /be approve spec");
    expect(result.stdout).toContain("- /be approve api-contract");
    expect(result.stdout).toContain("명확히 선택하려면 해당 승인 명령을 직접 입력하세요.");
    for (const docId of ["fe-technical-spec", "be-technical-spec", "api-contract"]) {
      const index = JSON.parse(fs.readFileSync(path.join(root, ".rph", "documents", docId, "index.json"), "utf8")) as {
        status: string;
        approvedVersion?: string | null;
      };
      expect(index.status).not.toBe("approved");
      expect(index.approvedVersion ?? null).toBeNull();
    }
    const sessionPath = path.join(root, ".rph", "runtime", "current-session.json");
    if (fs.existsSync(sessionPath)) {
      const manifest = JSON.parse(fs.readFileSync(sessionPath, "utf8")) as {
        status?: string;
        blocker?: string | null;
      };
      expect(manifest.status).not.toBe("complete");
      expect(manifest.blocker ?? null).toBeNull();
    }

    const rejected = await runCli(["ask", "--execute", "거절해"], { cwd: root });
    expect(rejected.exitCode).toBe(0);
    expect(rejected.stdout).toContain("natural rejection: pending external action not found");
    expect(rejected.stdout).not.toContain("[승인 완료]");
    for (const docId of ["fe-technical-spec", "be-technical-spec", "api-contract"]) {
      const index = JSON.parse(fs.readFileSync(path.join(root, ".rph", "documents", docId, "index.json"), "utf8")) as {
        status: string;
        approvedVersion?: string | null;
      };
      expect(index.status).not.toBe("approved");
      expect(index.approvedVersion ?? null).toBeNull();
    }
    expect(fs.existsSync(path.join(root, ".rph", "runtime", "action-approvals.json"))).toBe(false);
  }, 10000);

  it("fails closed when document approval and external action gates are both pending", async () => {
    const productDefinitionDraft = createDocumentVersion(root, "product-definition", {
      body: "ready for review",
      changeSummary: "mixed gate fixture"
    });
    saveState(root, { ...syncStateDocuments(loadState(root), productDefinitionDraft), currentStage: "PM_PRODUCT_DEFINITION_REVIEW" });
    writeRecoveryBriefFixture(root);

    const result = await runCli(["ask", "--execute", "승인해"], { cwd: root, env: withoutProviderEnv() });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("natural approval: multiple pending gate types");
    expect(result.stdout).toContain("- external action: action-recovery: /github create-repo --public");
    expect(result.stdout).toContain("- approval target: /docs approve product-definition");

    const approvals = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "action-approvals.json"), "utf8")) as Array<{ id: string; status: string }>;
    expect(approvals.find((record) => record.id === "action-recovery")?.status).toBe("pending");
    const productDefinition = JSON.parse(fs.readFileSync(path.join(root, ".rph", "documents", "product-definition", "index.json"), "utf8")) as {
      status: string;
      approvedVersion?: string | null;
    };
    expect(productDefinition.status).not.toBe("approved");
    expect(productDefinition.approvedVersion ?? null).toBeNull();
  }, 10000);

    it("queues mutable MCP command proposals for explicit external-action approval", async () => {
    writeOpenAiEnv(root, "https://example.invalid/v1");

    const proposed = await runCli(["ask", "--execute", "MCP tool write를 실행해줘"], {
      cwd: root,
      preloadFetchMutableMcpProposal: true
    });

    expect(proposed.exitCode).toBe(0);
    expect(proposed.stdout).toContain("agent proposed command: /mcp call stitch create_project");
    expect(proposed.stdout).toContain("external action approval required: action_");
    expect(proposed.stdout).toContain("target: mcp:stitch.create_project");
    const approvals = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "action-approvals.json"), "utf8")) as Array<{
      status: string;
      target: string;
      action: string;
      command: string;
      approvedSnapshot?: { kind?: string };
    }>;
    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toMatchObject({
      status: "pending",
      target: "mcp",
      action: "stitch.create_project",
      command: "/mcp call stitch create_project --args-json '{\"title\":\"Agent MCP Smoke\"}'"
    });
    expect(approvals[0].approvedSnapshot).toBeUndefined();
    const session = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "current-session.json"), "utf8")) as {
      status?: string;
      blocker?: string;
      pendingExternalActionId?: string;
    };
    expect(session.status).toBe("blocked");
    expect(session.blocker).toContain("external action approval required");
    expect(session.pendingExternalActionId).toBeTruthy();

    const direct = await runCli(["mcp", "call", "stitch", "create_project"], { cwd: root });
    expect(direct.exitCode).toBe(1);
    expect(direct.stderr).toContain("/mcp call requires --read-only");
  }, 10000);

  it("approves mutable MCP command proposals with snapshot drift checks and readback proof", async () => {
    fs.writeFileSync(path.join(root, ".env"), [
      "OPENAI_API_KEY=test-openai",
      "OPENAI_BASE_URL=https://example.invalid/v1",
      "STITCH_API_KEY=test-stitch"
    ].join("\n"));

    const proposed = await runCli(["ask", "--execute", "MCP tool write를 실행해줘"], {
      cwd: root,
      preloadFetchMutableMcpProposal: true
    });

    expect(proposed.exitCode).toBe(0);
    expect(proposed.stdout).toContain("external action approval required: action_");
    const approvalsPath = path.join(root, ".rph", "runtime", "action-approvals.json");
    const approvals = JSON.parse(fs.readFileSync(approvalsPath, "utf8")) as Array<{
      id: string;
      status: string;
      target: string;
      action: string;
      approvedSnapshot?: {
        kind?: string;
        version?: string;
        fingerprint?: string;
        serverId?: string;
        toolName?: string;
      };
    }>;
    expect(approvals).toHaveLength(1);
    const action = approvals[0];
    expect(action).toMatchObject({
      status: "pending",
      target: "mcp",
      action: "stitch.create_project",
      approvedSnapshot: {
        kind: "mcp.tool-call",
        version: "mcp-tool-call-v1",
        serverId: "stitch",
        toolName: "create_project"
      }
    });

    const approved = await runCli(["agent", "approve-action", action.id, "--by", "smoke"], {
      cwd: root,
      preloadFetchMutableMcpProposal: true
    });

    expect(approved.exitCode).toBe(0);
    expect(approved.stdout).toContain(`external action completed: ${action.id}`);
    expect(approved.stdout).toContain("readback: stitch.create_project");
    const completed = JSON.parse(fs.readFileSync(approvalsPath, "utf8"))[0] as {
      status: string;
      readbackStatus?: string;
      readbackActionApprovalId?: string;
      readbackApprovedFingerprint?: string;
      readbackArtifactPath?: string;
      verifiedTargetId?: string;
      fingerprint: string;
    };
    expect(completed.status).toBe("completed");
    expect(completed.readbackStatus).toBe("passed");
    expect(completed.verifiedTargetId).toBe("stitch.create_project");
    expect(completed.readbackActionApprovalId).toBe(action.id);
    expect(completed.readbackApprovedFingerprint).toBe(completed.fingerprint);
    expect(completed.readbackArtifactPath).toContain(`live-tool-call-${action.id}-readback.json`);
    const readback = JSON.parse(fs.readFileSync(completed.readbackArtifactPath ?? "", "utf8")) as {
      actionApprovalId?: string;
      approvedFingerprint?: string;
      approvedSnapshotFingerprint?: string;
      verified?: boolean;
      structuredContent?: { projectId?: string };
    };
    expect(readback).toMatchObject({
      actionApprovalId: action.id,
      approvedFingerprint: completed.fingerprint,
      approvedSnapshotFingerprint: action.approvedSnapshot?.fingerprint,
      verified: true,
      structuredContent: { projectId: "mutable-mcp-project" }
    });
    expect(JSON.stringify(readback)).not.toContain("test-stitch");
  }, 10000);

  it("persists agent handoff proposals as runtime continuation packets", async () => {
    writeOpenAiEnv(root, "https://example.invalid/v1");

    const result = await runCli(["ask", "PM 산출물을 FE에게 넘길 준비가 됐는지 정리해줘"], {
      cwd: root,
      preloadFetchHandoffProposal: true
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agent proposed handoff: Orchestrator -> FE");
    expect(result.stdout).toContain("handoff next command: /fe spec --ai");
    expect(result.stdout).toContain("handoff queued: handoff-");
    const manifest = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "current-session.json"), "utf8")) as {
      handoffPacket?: {
        toAgent: string;
        stage: string;
        nextCommand?: string;
        resumeCursor?: string;
        roleContract?: {
          role: string;
          allowedCommandPrefixes: string[];
        };
      };
    };
    expect(manifest.handoffPacket?.toAgent).toBe("FE");
    expect(manifest.handoffPacket?.roleContract?.role).toBe("FE");
    expect(manifest.handoffPacket?.roleContract?.allowedCommandPrefixes).toContain("/fe");
    expect(manifest.handoffPacket?.stage).toBe("FE_SPEC");
    expect(manifest.handoffPacket?.nextCommand).toBe("/fe spec --ai");
    expect(manifest.handoffPacket?.resumeCursor).toBe("agent-handoff:FE_SPEC:FE");
    const handoffs = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "handoffs.json"), "utf8")) as Array<{
      id: string;
      status: string;
      packet: {
        toAgent: string;
        nextCommand?: string;
      };
    }>;
    expect(handoffs).toHaveLength(1);
    expect(handoffs[0].status).toBe("pending");
    expect(handoffs[0].packet.toAgent).toBe("FE");
    expect(handoffs[0].packet.nextCommand).toBe("/fe spec --ai");
  }, 10000);

  it("rejects invalid handoff proposals before they enter the runtime queue", async () => {
    writeOpenAiEnv(root, "https://example.invalid/v1");

    const result = await runCli(["ask", "FE에게 넘길 handoff를 만들되 잘못된 명령이면 막아야 해"], {
      cwd: root,
      preloadFetchInvalidHandoffProposal: true
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agent proposed handoff: Orchestrator -> FE");
    expect(result.stdout).toContain("handoff next command: /be spec --ai");
    expect(result.stdout).toContain("handoff rejected:");
    expect(result.stdout).toContain("nextCommand /be spec --ai is not allowed for FE");
    expect(fs.existsSync(path.join(root, ".rph", "runtime", "handoffs.json"))).toBe(false);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "current-session.json"), "utf8")) as {
      status?: string;
      blocker?: string | null;
      handoffPacket?: unknown;
    };
    expect(manifest.status).toBe("blocked");
    expect(manifest.blocker).toContain("handoff rejected:");
    expect(manifest.handoffPacket).toBeNull();
  }, 10000);

  it("consumes a runtime handoff queue entry through the orchestration loop", async () => {
    const handoffPath = path.join(root, ".rph", "runtime", "handoffs.json");
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(handoffPath, JSON.stringify([
      {
        id: "handoff-test-1",
        sessionId: "session-test",
        status: "pending",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        packet: {
          fromAgent: "Orchestrator",
          toAgent: "PM",
          stage: "SETUP",
          summary: "Start PM lane from setup.",
          artifactRefs: [],
          acceptanceCriteria: ["PM lane starts"],
          blockers: [],
          nextCommand: "/pm start",
          resumeCursor: "stage:SETUP",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      }
    ], null, 2));

    const result = await runCli(["agent", "run", "--steps", "1"], { cwd: root });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("orchestration loop: max_steps=1");
    expect(result.stdout).toContain("orchestrator step 1: /pm start");
    expect(result.stdout).toContain("role runner: PM (SETUP) lane=lane-");
    expect(result.stdout).toContain("role prompt: PM lane runner");
    const orchestratorPid = result.stdout.match(/role orchestrator-pid: (\d+)/)?.[1];
    expect(orchestratorPid).toBeTruthy();
    expect(result.stdout).not.toContain("role worker-session:");
    expect(result.stdout).not.toContain("role worker-pid:");
    const state = JSON.parse(fs.readFileSync(path.join(root, ".rph", "state.json"), "utf8")) as {
      currentStage: string;
    };
    const handoffs = JSON.parse(fs.readFileSync(handoffPath, "utf8")) as Array<{ status: string; completedAt?: string }>;
    expect(state.currentStage).toBe("PM_PRODUCT_DEFINITION_INTERVIEW");
    expect(handoffs[0].status).toBe("completed");
    expect(handoffs[0].completedAt).toBeTruthy();
    const laneFiles = fs.readdirSync(path.join(root, ".rph", "runtime", "lanes")).filter((file) => file.endsWith(".json"));
    expect(laneFiles).toHaveLength(1);
    const lane = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "lanes", laneFiles[0]), "utf8")) as {
      status: string;
      role: string;
      stage: string;
      command: string;
      handoffId?: string;
      workerPid?: number;
      toolPolicy: {
        allowedCommandPrefixes: string[];
      };
      toolBudget?: {
        maxToolCalls: number;
        externalWriteBudget: number;
      };
      memory?: {
        scope: string;
        filePath: string;
        entriesAfter?: number;
      };
      merge?: {
        status: string;
      };
      executionMode?: string;
    };
    expect(lane.status).toBe("completed");
    expect(lane.role).toBe("PM");
    expect(lane.stage).toBe("SETUP");
    expect(lane.command).toBe("/pm start");
    expect(lane.handoffId).toBe("handoff-test-1");
    expect(lane.workerPid).toBeTruthy();
    expect(String(lane.workerPid)).not.toBe(orchestratorPid);
    expect(lane.merge?.status).toBe("merged");
    expect(lane.executionMode).toBe("command");
    expect(lane.toolPolicy.allowedCommandPrefixes).toContain("/pm");
    expect(lane.toolBudget?.maxToolCalls).toBe(8);
    expect(lane.toolBudget?.externalWriteBudget).toBe(0);
    expect(lane.memory?.scope).toBe("PM");
    expect(lane.memory?.entriesAfter).toBe(3);
    expect(fs.readFileSync(lane.memory?.filePath ?? "", "utf8")).toContain("\"event\":\"merged\"");

    const lanes = await runCli(["agent", "lanes"], { cwd: root, env: withoutProviderEnv() });
    expect(lanes.exitCode).toBe(0);
    expect(lanes.stdout).toContain("[completed] PM stage=SETUP");
    expect(lanes.stdout).toContain("execution: command");
    expect(lanes.stdout).toContain("memory: PM entries=3");
    expect(lanes.stdout).toContain("tool-budget: 7/8 calls, 4000 tokens");
    expect(lanes.stdout).toContain("allowed: /pm, /docs, /status, /next, /agent");
    expect(lanes.stdout).not.toContain("worker-session");
    expect(lanes.stdout).not.toContain("worker-pid");

    const debugLanes = await runCli(["agent", "lanes", "--debug"], { cwd: root, env: withoutProviderEnv() });
    expect(debugLanes.exitCode).toBe(0);
    expect(debugLanes.stdout).toContain(`worker-pid: ${lane.workerPid}`);
  }, 10000);

  it("reaps a dead worker lease and requeues the handoff before orchestration", async () => {
    const handoff = recordRuntimeHandoff(root, "session-dead-worker", {
      fromAgent: "Orchestrator",
      toAgent: "PM",
      stage: "SETUP",
      summary: "Recover a PM lane whose worker process died before completing.",
      artifactRefs: [],
      acceptanceCriteria: ["dead worker lease is requeued and consumed"],
      blockers: [],
      nextCommand: "/pm start",
      resumeCursor: "stage:SETUP",
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    const claimed = claimRuntimeHandoff(root, handoff.id, "dead-worker", 60_000, new Date("2026-05-26T00:00:00.000Z"));
    const claimToken = runtimeHandoffExecutionToken(claimed);
    const deadPid = 999999;
    const staleLane = startAgentLaneRun(root, {
      sessionId: claimed.sessionId,
      handoffId: claimed.id,
      workerId: "dead-worker",
      workerSessionId: claimed.workerSessionId,
      claimToken: claimToken.claimToken,
      workerPid: deadPid,
      attempt: claimed.attempts,
      packet: claimed.packet,
      command: claimed.packet.nextCommand ?? "",
      leaseExpiresAt: claimed.leaseExpiresAt
    });
    startRuntimeHandoffWork(
      root,
      claimed.id,
      { ...claimToken, laneRunId: staleLane.id },
      staleLane.id,
      60_000,
      new Date("2026-05-26T00:00:00.100Z")
    );

    const result = await runCli(["agent", "run", "--steps", "1"], { cwd: root, env: withoutProviderEnv() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`reaped dead worker lease: ${handoff.id} lane=${staleLane.id} pid=${deadPid} -> requeued`);
    expect(result.stdout).toContain("orchestrator step 1: /pm start");
    expect(result.stdout).toContain("lane result merged: lane-");
    const handoffs = loadRuntimeHandoffs(root);
    expect(handoffs.find((record) => record.id === handoff.id)).toMatchObject({
      status: "completed",
      attempts: 2
    });
    const lanes = fs.readdirSync(path.join(root, ".rph", "runtime", "lanes"))
      .filter((file) => file.endsWith(".json"))
      .map((file) => JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "lanes", file), "utf8")) as {
        id: string;
        status: string;
        workerPid?: number;
        error?: string;
        merge?: {
          status?: string;
        };
      });
    expect(lanes.find((lane) => lane.id === staleLane.id)).toMatchObject({
      status: "failed",
      workerPid: deadPid,
      error: `worker process is not alive: pid ${deadPid}`,
      merge: {
        status: "blocked"
      }
    });
    const recoveredLane = lanes.find((lane) => lane.id !== staleLane.id);
    expect(recoveredLane).toMatchObject({
      status: "completed",
      merge: {
        status: "merged"
      }
    });
  }, 10000);

  it("surfaces worker-pool health and recovery commands without raw session or pid details", async () => {
    const handoff = recordRuntimeHandoff(root, "session-dead-worker-ui", {
      fromAgent: "Orchestrator",
      toAgent: "PM",
      stage: "SETUP",
      summary: "Show a dead PM worker in the supervision UI.",
      artifactRefs: [],
      acceptanceCriteria: ["operator can see dead worker without raw claim details"],
      blockers: [],
      nextCommand: "/pm start",
      resumeCursor: "stage:SETUP",
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    const claimed = claimRuntimeHandoff(root, handoff.id, "dead-worker-ui", 60_000, new Date("2026-05-26T00:00:00.000Z"));
    const claimToken = runtimeHandoffExecutionToken(claimed);
    const deadPid = 2147483647;
    const staleLane = startAgentLaneRun(root, {
      sessionId: claimed.sessionId,
      handoffId: claimed.id,
      workerId: "dead-worker-ui",
      workerSessionId: claimed.workerSessionId,
      claimToken: claimToken.claimToken,
      workerPid: deadPid,
      attempt: claimed.attempts,
      packet: claimed.packet,
      command: claimed.packet.nextCommand ?? "",
      leaseExpiresAt: claimed.leaseExpiresAt
    });
    startRuntimeHandoffWork(
      root,
      claimed.id,
      { ...claimToken, laneRunId: staleLane.id },
      staleLane.id,
      60_000,
      new Date("2026-05-26T00:00:00.100Z")
    );

    const result = await runCli(["agent", "workers"], { cwd: root, env: withoutProviderEnv() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Worker pool");
    expect(result.stdout).toContain("- active leases: 1");
    expect(result.stdout).toContain("- dead workers: 1");
    expect(result.stdout).toContain("- completed pending merge: 0");
    expect(result.stdout).toContain(`handoff=${handoff.id} lane=${staleLane.id} role=PM stage=SETUP`);
    expect(result.stdout).toContain("status=running health=dead-worker worker=dead-worker-ui attempt=1");
    expect(result.stdout).toContain("process=dead");
    expect(result.stdout).toContain("command=/pm start");
    expect(result.stdout).toContain("next: rph agent recover --steps 1");
    expect(result.stdout).not.toContain("worker-session");
    expect(result.stdout).not.toContain(String(deadPid));
    expect(result.stdout).not.toContain(claimToken.claimToken);

    const shell = await runCli(["shell"], {
      cwd: root,
      env: withoutProviderEnv(),
      stdinChunks: [
        { text: "/agent workers\n", delayMs: 0 },
        { text: "/exit\n", delayMs: 50 }
      ]
    });
    expect(shell.exitCode).toBe(0);
    expect(shell.stdout).toContain("next: /agent recover --steps 1");
    expect(shell.stdout).not.toContain("next: rph agent recover --steps 1");
  }, 10000);

  it("renews a long-running worker lease so it is not stolen mid-flight", async () => {
    writeOpenAiEnv(root, "https://example.invalid/v1");
    const captureFile = path.join(root, "slow-lane-command-capture.json");
    const handoff = recordRuntimeHandoff(root, "session-slow-worker", {
      fromAgent: "Orchestrator",
      toAgent: "PM",
      stage: "SETUP",
      summary: "Slow PM lane should keep its lease while the worker is still alive.",
      artifactRefs: [],
      acceptanceCriteria: ["live worker lease remains owned until completion"],
      blockers: [],
      nextCommand: "/pm start",
      resumeCursor: "stage:SETUP",
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    const repoRoot = path.resolve(__dirname, "..");
    const cliEntry = path.join(repoRoot, "dist", "apps", "cli", "src", "index.js");
    const preload = createFetchLaneCommandProposalStub(
      root,
      captureFile,
      "/pm start",
      "slow lane still owns the lease while thinking",
      900
    );
    const child = spawn(process.execPath, [
      "--require",
      preload,
      cliEntry,
      "agent",
      "worker",
      "run",
      handoff.id,
      "--worker-id",
      "slow-worker",
      "--lease-ms",
      "300"
    ], {
      cwd: root,
      env: process.env,
      stdio: "pipe"
    });
    let childStdout = "";
    let childStderr = "";
    child.stdout.on("data", (chunk) => {
      childStdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      childStderr += chunk.toString();
    });
    const childExitPromise = waitForChild(child);

    try {
      await waitUntil(() => {
        const current = loadRuntimeHandoffs(root).find((record) => record.id === handoff.id);
        return current?.status === "running" && Boolean(current.laneRunId);
      });
      const running = loadRuntimeHandoffs(root).find((record) => record.id === handoff.id);
      const firstLease = running?.leaseExpiresAt;
      expect(firstLease).toBeTruthy();
      await sleep(650);
      const renewed = loadRuntimeHandoffs(root).find((record) => record.id === handoff.id);
      expect(renewed?.attempts).toBe(1);
      expect(Date.parse(renewed?.leaseExpiresAt ?? "")).toBeGreaterThan(Date.parse(firstLease ?? ""));

      const workers = await runCli(["agent", "workers"], { cwd: root, env: withoutProviderEnv() });
      expect(workers.exitCode).toBe(0);
      expect(workers.stdout).toContain("- active leases: 1");
      expect(workers.stdout).toContain("- healthy workers: 1");
      expect(workers.stdout).toContain("- dead workers: 0");
      expect(workers.stdout).toContain("status=running health=healthy worker=slow-worker attempt=1");
      expect(workers.stdout).toContain("process=alive");
      expect(workers.stdout).toContain("next: wait for worker heartbeat or completion");
      expect(workers.stdout).not.toContain("worker-session");
      expect(workers.stdout).not.toContain("claimToken");

      const scheduler = await runCli(["agent", "run", "--steps", "1"], { cwd: root, env: withoutProviderEnv() });
      expect(scheduler.exitCode).toBe(0);
      expect(scheduler.stdout).toContain(`handoff ${handoff.id} has active lease held by slow-worker`);
      expect(scheduler.stdout).not.toContain("role runner: PM");

      const childExit = await childExitPromise;
      expect(childExit).toBe(0);
      expect(childStderr).toBe("");
      expect(childStdout).toContain("role runner: PM (SETUP) lane=lane-");
      const completed = loadRuntimeHandoffs(root).find((record) => record.id === handoff.id);
      expect(completed).toMatchObject({
        status: "completed",
        attempts: 1,
        claimedBy: "slow-worker"
      });
      const laneFiles = fs.readdirSync(path.join(root, ".rph", "runtime", "lanes")).filter((file) => file.endsWith(".json"));
      expect(laneFiles).toHaveLength(1);
      const lane = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "lanes", laneFiles[0]), "utf8")) as {
        status: string;
        workerId?: string;
        merge?: {
          status?: string;
        };
      };
      expect(lane).toMatchObject({
        status: "completed",
        workerId: "slow-worker",
        merge: {
          status: "pending"
        }
      });
    } finally {
      if (child.exitCode === null) {
        child.kill();
      }
    }
  }, 10000);

  it("runs a provider-backed autonomous lane turn before executing a role-valid command proposal", async () => {
    const captureFile = path.join(root, "lane-agent-command-capture.json");
    writeOpenAiEnv(root, "https://example.invalid/v1");
    const handoffPath = path.join(root, ".rph", "runtime", "handoffs.json");
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(handoffPath, JSON.stringify([
      {
        id: "handoff-autonomous-lane",
        sessionId: "session-test",
        status: "pending",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        packet: {
          fromAgent: "Orchestrator",
          toAgent: "PM",
          stage: "SETUP",
          summary: "Let the PM lane decide whether to start.",
          artifactRefs: [],
          acceptanceCriteria: ["PM lane chooses a role-valid command"],
          blockers: [],
          nextCommand: "/pm start",
          resumeCursor: "stage:SETUP",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      }
    ], null, 2));

    const result = await runCli(["agent", "run", "--steps", "1"], {
      cwd: root,
      preloadFetchLaneCommandProposal: { captureFile }
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("role runner: PM (SETUP) lane=lane-");
    expect(result.stdout).toContain("role agent: autonomous turn agent_turn_");
    expect(result.stdout).toContain("agent proposed command: /pm start");
    expect(result.stdout).toContain("agent action: /pm start");
    const payload = JSON.parse(fs.readFileSync(captureFile, "utf8")) as {
      instructions?: string;
      input?: string;
    };
    expect(payload.instructions).toContain("PM lane runner");
    expect(payload.instructions).toContain("autonomous worker inside RPH");
    expect(payload.input).toContain("Lane queued command: /pm start");
    expect(payload.input).toContain("Lane acceptance: PM lane chooses a role-valid command");

    const state = JSON.parse(fs.readFileSync(path.join(root, ".rph", "state.json"), "utf8")) as {
      currentStage: string;
    };
    expect(state.currentStage).toBe("PM_PRODUCT_DEFINITION_INTERVIEW");
    const handoffs = JSON.parse(fs.readFileSync(handoffPath, "utf8")) as Array<{ status: string; laneRunId?: string }>;
    expect(handoffs[0].status).toBe("completed");
    const lane = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "lanes", `${handoffs[0].laneRunId}.json`), "utf8")) as {
      status: string;
      executionMode?: string;
      autonomousTurnId?: string;
      proposedCommand?: string;
      merge?: {
        status: string;
      };
      memory?: {
        entriesAfter?: number;
      };
    };
    expect(lane.status).toBe("completed");
    expect(lane.executionMode).toBe("autonomous");
    expect(lane.autonomousTurnId).toContain("agent_turn_");
    expect(lane.proposedCommand).toBe("/pm start");
    expect(lane.merge?.status).toBe("merged");
    expect(lane.memory?.entriesAfter).toBe(3);
  }, 10000);

  it("rejects cross-lane command proposals from an autonomous lane worker", async () => {
    const captureFile = path.join(root, "lane-cross-command-capture.json");
    writeOpenAiEnv(root, "https://example.invalid/v1");
    const handoffPath = path.join(root, ".rph", "runtime", "handoffs.json");
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(handoffPath, JSON.stringify([
      {
        id: "handoff-cross-lane",
        sessionId: "session-test",
        status: "pending",
        attempts: 0,
        maxAttempts: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        packet: {
          fromAgent: "Orchestrator",
          toAgent: "PM",
          stage: "SETUP",
          summary: "PM lane must not run FE commands.",
          artifactRefs: [],
          acceptanceCriteria: ["cross-lane proposal is rejected"],
          blockers: [],
          nextCommand: "/pm start",
          resumeCursor: "stage:SETUP",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      }
    ], null, 2));

    const result = await runCli(["agent", "run", "--steps", "1"], {
      cwd: root,
      preloadFetchLaneCommandProposal: { captureFile, command: "/fe spec --ai", reason: "wrong lane command" }
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("role agent: autonomous turn agent_turn_");
    expect(result.stdout).toContain("agent proposed command: /fe spec --ai");
    expect(result.stdout).toContain("role runner failed: lane command rejected:");
    expect(result.stdout).toContain("nextCommand /fe spec --ai is not allowed for PM");
    expect(result.stdout).not.toContain("FE spec");
    const state = JSON.parse(fs.readFileSync(path.join(root, ".rph", "state.json"), "utf8")) as {
      currentStage: string;
    };
    expect(state.currentStage).toBe("SETUP");
    const handoffs = JSON.parse(fs.readFileSync(handoffPath, "utf8")) as Array<{
      status: string;
      deadLetterReason?: string;
      laneRunId?: string;
    }>;
    expect(handoffs[0].status).toBe("dead_letter");
    expect(handoffs[0].deadLetterReason).toContain("lane command rejected:");
    const lane = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "lanes", `${handoffs[0].laneRunId}.json`), "utf8")) as {
      status: string;
      executionMode?: string;
      proposedCommand?: string;
      merge?: {
        status: string;
      };
    };
    expect(lane.status).toBe("failed");
    expect(lane.executionMode).toBe("autonomous");
    expect(lane.proposedCommand).toBe("/fe spec --ai");
    expect(lane.merge?.status).toBe("blocked");
  }, 10000);

  it("enforces active read-only TOML sandbox on autonomous lane command proposals", async () => {
    const captureFile = path.join(root, "lane-read-only-profile-capture.json");
    expect((await runCli(["agent", "import", ERROR_COORDINATOR_TOML], { cwd: root, env: withoutProviderEnv() })).exitCode).toBe(0);
    expect((await runCli(["agent", "use", "error-coordinator"], { cwd: root, env: withoutProviderEnv() })).exitCode).toBe(0);
    writeOpenAiEnv(root, "https://example.invalid/v1");
    const handoffPath = path.join(root, ".rph", "runtime", "handoffs.json");
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(handoffPath, JSON.stringify([
      {
        id: "handoff-read-only-profile",
        sessionId: "session-test",
        status: "pending",
        attempts: 0,
        maxAttempts: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        packet: {
          fromAgent: "Orchestrator",
          toAgent: "PM",
          stage: "SETUP",
          summary: "Read-only profile must not auto-run mutating lane commands.",
          artifactRefs: [],
          acceptanceCriteria: ["read-only TOML sandbox blocks mutating command execution"],
          blockers: [],
          nextCommand: "/pm start",
          resumeCursor: "stage:SETUP",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      }
    ], null, 2));

    const result = await runCli(["agent", "run", "--steps", "1"], {
      cwd: root,
      preloadFetchLaneCommandProposal: { captureFile }
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("role agent: autonomous turn agent_turn_");
    expect(result.stdout).toContain("agent proposed command: /pm start");
    expect(result.stdout).toContain("role runner failed: lane command rejected by active TOML sandbox");
    expect(result.stdout).not.toContain("agent action: /pm start");
    const payload = JSON.parse(fs.readFileSync(captureFile, "utf8")) as {
      instructions?: string;
      model?: string;
      reasoning?: { effort?: string };
    };
    expect(payload.instructions).toContain("Active custom TOML agent: error-coordinator");
    expect(payload.instructions).toContain("model=gpt-5.4 reasoning=high sandbox=read-only");
    expect(payload.model).toBe("gpt-5.4");
    expect(payload.reasoning?.effort).toBe("high");
    const handoffs = JSON.parse(fs.readFileSync(handoffPath, "utf8")) as Array<{
      status: string;
      deadLetterReason?: string;
      laneRunId?: string;
    }>;
    expect(handoffs[0].status).toBe("dead_letter");
    expect(handoffs[0].deadLetterReason).toContain("lane command rejected by active TOML sandbox");
    const lane = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "lanes", `${handoffs[0].laneRunId}.json`), "utf8")) as {
      status: string;
      executionMode?: string;
      proposedCommand?: string;
      executionProfile?: {
        name?: string;
        model?: string;
        modelReasoningEffort?: string;
        sandboxMode?: string;
      };
      merge?: {
        status: string;
      };
    };
    expect(lane.status).toBe("failed");
    expect(lane.executionMode).toBe("autonomous");
    expect(lane.proposedCommand).toBe("/pm start");
    expect(lane.executionProfile).toMatchObject({
      name: "error-coordinator",
      model: "gpt-5.4",
      modelReasoningEffort: "high",
      sandboxMode: "read-only"
    });
    expect(lane.merge?.status).toBe("blocked");
  }, 10000);

  it("blocks state-advancing /next --execute under active read-only TOML sandbox", async () => {
    const captureFile = path.join(root, "lane-read-only-next-execute-capture.json");
    expect((await runCli(["agent", "import", ERROR_COORDINATOR_TOML], { cwd: root, env: withoutProviderEnv() })).exitCode).toBe(0);
    expect((await runCli(["agent", "use", "error-coordinator"], { cwd: root, env: withoutProviderEnv() })).exitCode).toBe(0);
    writeOpenAiEnv(root, "https://example.invalid/v1");
    const handoffPath = path.join(root, ".rph", "runtime", "handoffs.json");
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(handoffPath, JSON.stringify([
      {
        id: "handoff-read-only-next-execute",
        sessionId: "session-test",
        status: "pending",
        attempts: 0,
        maxAttempts: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        packet: {
          fromAgent: "Orchestrator",
          toAgent: "PM",
          stage: "SETUP",
          summary: "Read-only profile must not auto-advance runtime state.",
          artifactRefs: [],
          acceptanceCriteria: ["read-only TOML sandbox blocks /next --execute"],
          blockers: [],
          nextCommand: "/next --execute",
          resumeCursor: "stage:SETUP",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      }
    ], null, 2));

    const result = await runCli(["agent", "run", "--steps", "1"], {
      cwd: root,
      preloadFetchLaneCommandProposal: {
        captureFile,
        command: "/next --execute",
        reason: "state advancing command must still obey the active sandbox"
      }
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agent proposed command: /next --execute");
    expect(result.stdout).toContain("role runner failed: lane command rejected by active TOML sandbox");
    expect(result.stdout).not.toContain("agent action: /next --execute");
    const handoffs = JSON.parse(fs.readFileSync(handoffPath, "utf8")) as Array<{
      status: string;
      deadLetterReason?: string;
      laneRunId?: string;
    }>;
    expect(handoffs[0].status).toBe("dead_letter");
    expect(handoffs[0].deadLetterReason).toContain("lane command rejected by active TOML sandbox");
    const lane = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "lanes", `${handoffs[0].laneRunId}.json`), "utf8")) as {
      status: string;
      proposedCommand?: string;
      executionProfile?: {
        name?: string;
        sandboxMode?: string;
      };
    };
    expect(lane.status).toBe("failed");
    expect(lane.proposedCommand).toBe("/next --execute");
    expect(lane.executionProfile).toMatchObject({
      name: "error-coordinator",
      sandboxMode: "read-only"
    });
  }, 10000);

  it("strips --ai from queued lane commands when no provider is configured", async () => {
    const handoffPath = path.join(root, ".rph", "runtime", "handoffs.json");
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(handoffPath, JSON.stringify([
      {
        id: "handoff-providerless-ai-command",
        sessionId: "session-test",
        status: "pending",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        packet: {
          fromAgent: "Orchestrator",
          toAgent: "PM",
          stage: "SETUP",
          summary: "Draft without AI when provider is absent.",
          artifactRefs: ["document:product-definition"],
          acceptanceCriteria: ["providerless fallback still creates a local draft"],
          blockers: [],
          nextCommand: "/pm draft product-definition --ai",
          resumeCursor: "stage:SETUP",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      }
    ], null, 2));

    const result = await runCli(["agent", "run", "--steps", "1"], { cwd: root, env: withoutProviderEnv() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("orchestrator step 1: /pm draft product-definition --ai");
    expect(result.stdout).toContain("role fallback command: /pm draft product-definition");
    expect(result.stdout).toContain("문서 초안 생성: product-definition");
    expect(result.stdout).not.toContain("role agent: autonomous turn");
    const handoffs = JSON.parse(fs.readFileSync(handoffPath, "utf8")) as Array<{
      status: string;
      laneRunId?: string;
    }>;
    expect(handoffs[0].status).toBe("completed");
    const lane = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "lanes", `${handoffs[0].laneRunId}.json`), "utf8")) as {
      status: string;
      command: string;
      executionMode?: string;
      executedCommand?: string;
      result?: {
        completedCommand?: string;
      };
    };
    expect(lane.status).toBe("completed");
    expect(lane.command).toBe("/pm draft product-definition --ai");
    expect(lane.executionMode).toBe("command");
    expect(lane.executedCommand).toBe("/pm draft product-definition");
    expect(lane.result?.completedCommand).toBe("/pm draft product-definition");
  }, 10000);

  it("dispatches multiple claimable handoffs through the parallel lane scheduler", async () => {
    const handoffPath = path.join(root, ".rph", "runtime", "handoffs.json");
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(handoffPath, JSON.stringify([
      {
        id: "handoff-parallel-pm",
        sessionId: "session-test",
        status: "pending",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        packet: {
          fromAgent: "Orchestrator",
          toAgent: "PM",
          stage: "SETUP",
          summary: "PM status lane.",
          artifactRefs: [],
          acceptanceCriteria: ["PM lane completes"],
          blockers: [],
          nextCommand: "/status",
          resumeCursor: "stage:SETUP",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      },
      {
        id: "handoff-parallel-fe",
        sessionId: "session-test",
        status: "pending",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        packet: {
          fromAgent: "Orchestrator",
          toAgent: "FE",
          stage: "SETUP",
          summary: "FE status lane.",
          artifactRefs: [],
          acceptanceCriteria: ["FE lane completes"],
          blockers: [],
          nextCommand: "/status",
          resumeCursor: "stage:SETUP",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      }
    ], null, 2));

    const result = await runCli(["agent", "run", "--steps", "2", "--concurrency", "2"], { cwd: root, env: withoutProviderEnv() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("orchestration loop: max_steps=2 concurrency=2");
    expect(result.stdout).toContain("parallel scheduler: dispatching 2 lane(s)");
    expect(result.stdout).toContain("integrator: integrated 2/2 lane result(s)");
    const handoffs = JSON.parse(fs.readFileSync(handoffPath, "utf8")) as Array<{
      status: string;
      laneRunId?: string;
    }>;
    expect(handoffs.map((handoff) => handoff.status)).toEqual(["completed", "completed"]);
    const lanes = handoffs.map((handoff) => JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "lanes", `${handoff.laneRunId}.json`), "utf8")) as {
      status: string;
      merge?: { status: string };
      toolBudget: { remainingToolCalls: number; maxToolCalls: number };
    });
    expect(lanes.map((lane) => lane.status)).toEqual(["completed", "completed"]);
    expect(lanes.map((lane) => lane.merge?.status)).toEqual(["merged", "merged"]);
    expect(lanes.map((lane) => lane.toolBudget.remainingToolCalls)).toEqual([7, 7]);
    const proofLedger = fs.readFileSync(path.join(root, ".rph", "proofs", "ledger.jsonl"), "utf8");
    expect(proofLedger).toContain("\"kind\":\"lane.batch-integrated\"");
    const state = JSON.parse(fs.readFileSync(path.join(root, ".rph", "state.json"), "utf8")) as {
      evidence?: { agentIntegration?: { status: string; mergedRunIds: string[]; runIds: string[] } };
    };
    expect(state.evidence?.agentIntegration?.status).toBe("integrated");
    expect(state.evidence?.agentIntegration?.mergedRunIds).toHaveLength(2);
    expect(state.evidence?.agentIntegration?.runIds).toHaveLength(2);
  }, 10000);

  it("materializes fan-out stage queue handoffs before the parallel lane scheduler", async () => {
    saveApprovedPdState(root);

    const result = await runCli(["agent", "run", "--steps", "2", "--concurrency", "2"], { cwd: root, env: withoutProviderEnv() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("orchestration loop: max_steps=2 concurrency=2");
    expect(result.stdout).toContain("parallel scheduler: dispatching 2 lane(s)");
    expect(result.stdout).toContain("integrator: integrated 2/2 lane result(s)");
    const handoffs = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "handoffs.json"), "utf8")) as Array<{
      status: string;
      laneRunId?: string;
      packet: {
        stage: string;
        nextCommand?: string;
        resumeCursor?: string;
      };
    }>;
    expect(handoffs.map((handoff) => handoff.packet.stage).sort()).toEqual(["BE_SPEC", "FE_SPEC"]);
    expect(handoffs.map((handoff) => handoff.packet.resumeCursor).sort()).toEqual(["stage-queue:BE_SPEC", "stage-queue:FE_SPEC"]);
    expect(handoffs.map((handoff) => handoff.status)).toEqual(["completed", "completed"]);
    const lanes = handoffs.map((handoff) => JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "lanes", `${handoff.laneRunId}.json`), "utf8")) as {
      command: string;
      status: string;
      merge?: { status: string };
    });
    expect(lanes.map((lane) => lane.command).sort()).toEqual(["/be spec --ai", "/fe spec --ai"]);
    expect(lanes.map((lane) => lane.status)).toEqual(["completed", "completed"]);
    expect(lanes.map((lane) => lane.merge?.status)).toEqual(["merged", "merged"]);
  }, 10000);

  it("exposes the runtime execution graph as a first-class agent surface", async () => {
    saveApprovedPdState(root);

    const status = await runCli(["agent", "graph", "status"], { cwd: root, env: withoutProviderEnv() });
    const verbose = await runCli(["agent", "graph", "status", "--verbose"], { cwd: root, env: withoutProviderEnv() });

    expect(status.exitCode).toBe(0);
    expect(status.stdout).toContain("Runtime execution graph");
    expect(status.stdout).toContain("- file: .rph/runtime/execution-graph.json");
    expect(status.stdout).toContain("- source: runtime-execution-graph");
    expect(status.stdout).toContain("- graph: graph:");
    expect(status.stdout).toMatch(/- digest: [a-f0-9]{12}/);
    expect(status.stdout).toContain("- active=stage:PD_APPROVED");
    expect(status.stdout).toContain("- next: /fe spec --ai");
    expect(status.stdout).toContain("Top blockers:");
    expect(status.stdout).toContain("details: rph agent graph status --verbose | rph agent graph json");
    expect(status.stdout).not.toContain("Graph edges:");
    expect(verbose.exitCode).toBe(0);
    expect(verbose.stdout).toContain("stage:FE_SPEC [ready fan-out]");
    expect(verbose.stdout).toContain("stage:SPRINT_PLANNING [blocked fan-in]");
    expect(verbose.stdout).toContain("Graph edges:");
    const graph = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "execution-graph.json"), "utf8")) as {
      version: number;
      summary: { fanInNodeIds: string[]; fanOutNodeIds: string[] };
    };
    expect(graph.version).toBe(1);
    expect(graph.summary.fanOutNodeIds).toContain("stage:PD_APPROVED");
    expect(graph.summary.fanInNodeIds).toContain("stage:SPRINT_PLANNING");
  }, 10000);

  it("fails closed on an unreadable runtime execution graph until refresh repairs it", async () => {
    saveApprovedPdState(root);
    const graphFile = path.join(root, ".rph", "runtime", "execution-graph.json");
    fs.writeFileSync(graphFile, "{not-json");

    const status = await runCli(["agent", "graph", "status"], { cwd: root, env: withoutProviderEnv() });
    expect(status.exitCode).toBe(1);
    expect(status.stdout).toContain("execution graph file is unreadable JSON");
    expect(status.stdout).toContain("next: rph agent graph refresh");

    const refresh = await runCli(["agent", "graph", "refresh"], { cwd: root, env: withoutProviderEnv() });
    expect(refresh.exitCode).toBe(0);
    expect(refresh.stdout).toContain("Runtime execution graph");
    expect(JSON.parse(fs.readFileSync(graphFile, "utf8"))).toMatchObject({
      version: 1,
      source: "runtime-execution-graph"
    });
  }, 10000);

  it("automatically refreshes an old runtime execution graph schema on status", async () => {
    saveApprovedPdState(root);
    const graphFile = path.join(root, ".rph", "runtime", "execution-graph.json");
    const staleGraph = JSON.parse(fs.readFileSync(graphFile, "utf8")) as Record<string, unknown>;
    fs.writeFileSync(graphFile, JSON.stringify({
      ...staleGraph,
      source: "runtime-stage-queue"
    }, null, 2));

    const status = await runCli(["agent", "graph", "status"], { cwd: root, env: withoutProviderEnv() });

    expect(status.exitCode).toBe(0);
    expect(status.stdout).toContain("- source: runtime-execution-graph");
    expect(JSON.parse(fs.readFileSync(graphFile, "utf8"))).toMatchObject({
      source: "runtime-execution-graph"
    });
  }, 10000);

  it("automatically refreshes a stale runtime execution graph from another session on status", async () => {
    saveApprovedPdState(root);
    const graphFile = path.join(root, ".rph", "runtime", "execution-graph.json");
    const staleGraph = JSON.parse(fs.readFileSync(graphFile, "utf8")) as Record<string, unknown>;
    fs.writeFileSync(graphFile, JSON.stringify({
      ...staleGraph,
      graphId: "graph:stale-session",
      sessionId: "stale-session",
      currentStage: "SETUP"
    }, null, 2));

    const status = await runCli(["agent", "graph", "status"], { cwd: root, env: withoutProviderEnv() });

    expect(status.exitCode).toBe(0);
    expect(status.stdout).toContain("- session: session-approved-pd");
    expect(status.stdout).toContain("- active=stage:PD_APPROVED");
    expect(JSON.parse(fs.readFileSync(graphFile, "utf8"))).toMatchObject({
      graphId: "graph:session-approved-pd",
      sessionId: "session-approved-pd",
      currentStage: "PD_APPROVED"
    });
  }, 10000);

  it("reconciles fan-in queue state after parallel lane integration without bypassing engineering approvals", async () => {
    saveApprovedPdState(root);

    const result = await runCli(["agent", "run", "--steps", "2", "--concurrency", "2"], { cwd: root, env: withoutProviderEnv() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("parallel scheduler: dispatching 2 lane(s)");
    expect(result.stdout).toContain("integrator: integrated 2/2 lane result(s)");
    const manifest = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "current-session.json"), "utf8")) as {
      stageQueue?: Array<{
        stage: string;
        status: string;
        blockers: string[];
        fanIn?: {
          reducerStatus: string;
          pendingPrerequisites: string[];
          readyPrerequisites: string[];
        };
      }>;
    };
    const fe = manifest.stageQueue?.find((entry) => entry.stage === "FE_SPEC");
    const be = manifest.stageQueue?.find((entry) => entry.stage === "BE_SPEC");
    const sprint = manifest.stageQueue?.find((entry) => entry.stage === "SPRINT_PLANNING");
    expect(fe?.status).toBe("completed");
    expect(be?.status).toBe("completed");
    expect(sprint?.status).toBe("blocked");
    expect(sprint?.fanIn?.reducerStatus).toBe("blocked");
    expect(sprint?.fanIn?.pendingPrerequisites).toEqual([]);
    expect(sprint?.fanIn?.readyPrerequisites).toEqual(["PD_APPROVED", "FE_SPEC", "BE_SPEC"]);
    expect(sprint?.blockers).toEqual(expect.arrayContaining([
      "required approval missing: fe-technical-spec",
      "required approval missing: be-technical-spec",
      "required approval missing: api-contract"
    ]));
  }, 10000);

  it("dispatches a ready fan-in reducer handoff and advances only after engineering approvals exist", async () => {
    saveApprovedPdState(root);
    await runCli(["agent", "run", "--steps", "2", "--concurrency", "2"], { cwd: root, env: withoutProviderEnv() });
    approveSprintInputs(root);

    const result = await runCli(["agent", "run", "--steps", "1"], { cwd: root, env: withoutProviderEnv() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("orchestrator step 1: /agent reduce SPRINT_PLANNING");
    expect(result.stdout).toContain("fan-in reducer complete: PD_APPROVED -> SPRINT_PLANNING");
    const state = JSON.parse(fs.readFileSync(path.join(root, ".rph", "state.json"), "utf8")) as {
      currentStage: string;
    };
    expect(state.currentStage).toBe("SPRINT_PLANNING");
    const handoffs = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "handoffs.json"), "utf8")) as Array<{
      status: string;
      packet: {
        stage: string;
        resumeCursor?: string;
        nextCommand?: string;
        fanIn?: { sourceLaneRunIds: string[] };
      };
    }>;
    const reducer = handoffs.find((handoff) => handoff.packet.resumeCursor === "fan-in:SPRINT_PLANNING");
    expect(reducer).toMatchObject({
      status: "completed",
      packet: expect.objectContaining({
        stage: "SPRINT_PLANNING",
        nextCommand: "/agent reduce SPRINT_PLANNING",
        fanIn: expect.objectContaining({
          sourceLaneRunIds: expect.arrayContaining([
            expect.stringMatching(/^lane-/),
            expect.stringMatching(/^lane-/)
          ])
        })
      })
    });
    expect(handoffs.filter((handoff) => handoff.packet.resumeCursor === "fan-in:SPRINT_PLANNING")).toHaveLength(1);
  }, 10000);

  it("blocks a lane before command execution when its tool budget is exhausted", async () => {
    const handoffPath = path.join(root, ".rph", "runtime", "handoffs.json");
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(handoffPath, JSON.stringify([
      {
        id: "handoff-budget-exhausted",
        sessionId: "session-test",
        status: "pending",
        attempts: 0,
        maxAttempts: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        packet: {
          fromAgent: "Orchestrator",
          toAgent: "PM",
          stage: "SETUP",
          summary: "Budget exhausted lane.",
          artifactRefs: [],
          acceptanceCriteria: ["budget blocks execution"],
          blockers: [],
          nextCommand: "/status",
          resumeCursor: "stage:SETUP",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      }
    ], null, 2));

    const result = await runCli(["agent", "worker", "run", "handoff-budget-exhausted", "--max-tool-calls", "0"], {
      cwd: root,
      env: withoutProviderEnv()
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("tool budget blocked: lane tool budget exhausted");
    const handoffs = JSON.parse(fs.readFileSync(handoffPath, "utf8")) as Array<{
      status: string;
      deadLetterReason?: string;
      laneRunId?: string;
    }>;
    expect(handoffs[0].status).toBe("dead_letter");
    expect(handoffs[0].deadLetterReason).toContain("tool budget exhausted");
    const lane = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "lanes", `${handoffs[0].laneRunId}.json`), "utf8")) as {
      status: string;
      error?: string;
      toolBudget: { remainingToolCalls: number; maxToolCalls: number };
    };
    expect(lane.status).toBe("failed");
    expect(lane.error).toContain("tool budget exhausted");
    expect(lane.toolBudget).toMatchObject({ remainingToolCalls: 0, maxToolCalls: 0 });
  }, 10000);

  it("does not reclaim a mailbox item while the handoff lease is active", async () => {
    const handoffPath = path.join(root, ".rph", "runtime", "handoffs.json");
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    const futureLease = new Date(Date.now() + 60_000).toISOString();
    fs.writeFileSync(handoffPath, JSON.stringify([
      {
        id: "handoff-active-lease",
        sessionId: "session-test",
        status: "running",
        attempts: 1,
        maxAttempts: 3,
        claimedBy: "lane-worker:PM:handoff-active-lease",
        claimedAt: new Date().toISOString(),
        heartbeatAt: new Date().toISOString(),
        leaseExpiresAt: futureLease,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        packet: {
          fromAgent: "Orchestrator",
          toAgent: "PM",
          stage: "SETUP",
          summary: "Do not steal a healthy PM lane.",
          artifactRefs: [],
          acceptanceCriteria: ["single active PM lane"],
          blockers: [],
          nextCommand: "/pm start",
          resumeCursor: "stage:SETUP",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      }
    ], null, 2));

    const result = await runCli(["agent", "run", "--steps", "1"], { cwd: root });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("orchestration blocked: handoff handoff-active-lease has active lease held by lane-worker:PM:handoff-active-lease");
    const handoffs = JSON.parse(fs.readFileSync(handoffPath, "utf8")) as Array<{
      status: string;
      claimedBy?: string;
      leaseExpiresAt?: string;
    }>;
    expect(handoffs[0].status).toBe("running");
    expect(handoffs[0].claimedBy).toBe("lane-worker:PM:handoff-active-lease");
    expect(handoffs[0].leaseExpiresAt).toBe(futureLease);
    const laneDir = path.join(root, ".rph", "runtime", "lanes");
    const laneFiles = fs.existsSync(laneDir) ? fs.readdirSync(laneDir).filter((file) => file.endsWith(".json")) : [];
    expect(laneFiles).toHaveLength(0);
  }, 10000);

  it("reclaims a stale handoff lease and launches a replacement lane", async () => {
    const handoffPath = path.join(root, ".rph", "runtime", "handoffs.json");
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(handoffPath, JSON.stringify([
      {
        id: "handoff-stale-lease",
        sessionId: "session-test",
        status: "running",
        attempts: 1,
        maxAttempts: 3,
        claimedBy: "lane-worker:PM:dead-worker",
        claimedAt: "2026-01-01T00:00:00.000Z",
        heartbeatAt: "2026-01-01T00:00:10.000Z",
        leaseExpiresAt: "2026-01-01T00:00:20.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        packet: {
          fromAgent: "Orchestrator",
          toAgent: "PM",
          stage: "SETUP",
          summary: "Recover stale PM lane.",
          artifactRefs: [],
          acceptanceCriteria: ["stale lease is reclaimed"],
          blockers: [],
          nextCommand: "/pm start",
          resumeCursor: "stage:SETUP",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      }
    ], null, 2));

    const result = await runCli(["agent", "run", "--steps", "1"], { cwd: root });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("role runner: PM (SETUP) lane=lane-");
    expect(result.stdout).toContain("role worker: lane-worker:PM:handoff-stale-lease");
    const handoffs = JSON.parse(fs.readFileSync(handoffPath, "utf8")) as Array<{
      status: string;
      claimedBy?: string;
      attempts?: number;
      completedAt?: string;
    }>;
    expect(handoffs[0].status).toBe("completed");
    expect(handoffs[0].claimedBy).toBe("lane-worker:PM:handoff-stale-lease");
    expect(handoffs[0].attempts).toBe(2);
    expect(handoffs[0].completedAt).toBeTruthy();
    const laneFiles = fs.readdirSync(path.join(root, ".rph", "runtime", "lanes")).filter((file) => file.endsWith(".json"));
    expect(laneFiles).toHaveLength(1);
  }, 10000);

  it("keeps direct worker completion separate until control-plane reattaches the lane result", async () => {
    const handoffPath = path.join(root, ".rph", "runtime", "handoffs.json");
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(handoffPath, JSON.stringify([
      {
        id: "handoff-worker-direct",
        sessionId: "session-test",
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        packet: {
          fromAgent: "Orchestrator",
          toAgent: "PM",
          stage: "SETUP",
          summary: "Direct worker should not merge its own result.",
          artifactRefs: [],
          acceptanceCriteria: ["worker completion is separate from merge"],
          blockers: [],
          nextCommand: "/pm start",
          resumeCursor: "stage:SETUP",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      }
    ], null, 2));

    const result = await runCli(["agent", "worker", "run", "handoff-worker-direct", "--worker-id", "test-worker-direct"], { cwd: root });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("role runner: PM (SETUP) lane=lane-");
    expect(result.stdout).toContain("role worker: test-worker-direct");
    const handoffs = JSON.parse(fs.readFileSync(handoffPath, "utf8")) as Array<{
      status: string;
      claimedBy?: string;
      laneRunId?: string;
      completedAt?: string;
    }>;
    expect(handoffs[0].status).toBe("completed");
    expect(handoffs[0].claimedBy).toBe("test-worker-direct");
    expect(handoffs[0].laneRunId).toBeTruthy();
    expect(handoffs[0].completedAt).toBeTruthy();
    const lane = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "lanes", `${handoffs[0].laneRunId}.json`), "utf8")) as {
      status: string;
      exitOk?: boolean;
      memory?: {
        filePath: string;
        entriesAfter?: number;
      };
      merge?: {
        status: string;
      };
    };
    expect(lane.status).toBe("completed");
    expect(lane.exitOk).toBe(true);
    expect(lane.merge?.status).toBe("pending");
    expect(lane.memory?.entriesAfter).toBe(2);
    expect(fs.readFileSync(lane.memory?.filePath ?? "", "utf8")).toContain("\"event\":\"completed\"");
    fs.writeFileSync(path.join(root, ".rph", "runtime", "lanes", "corrupt-lane.json"), "{not-json");

    const workers = await runCli(["agent", "workers"], { cwd: root, env: withoutProviderEnv() });
    expect(workers.exitCode).toBe(0);
    expect(workers.stdout).toContain("- completed pending merge: 1");
    expect(workers.stdout).toContain("- unreadable lane files: 1");
    expect(workers.stdout).toContain("Completed lane results pending merge:");
    expect(workers.stdout).toContain(`lane=${handoffs[0].laneRunId} handoff=handoff-worker-direct role=PM stage=SETUP`);
    expect(workers.stdout).toContain("next: rph agent recover --steps 1");

    const reattach = await runCli(["agent", "run", "--steps", "1"], { cwd: root, env: withoutProviderEnv() });
    expect(reattach.exitCode).toBe(0);
    expect(reattach.stdout).toContain("integrator: integrated 1/1 pending lane result(s) reattached during orchestration");
    const mergedLane = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "lanes", `${handoffs[0].laneRunId}.json`), "utf8")) as {
      merge?: {
        status: string;
        summary?: string;
      };
      memory?: {
        filePath: string;
        entriesAfter?: number;
      };
    };
    expect(mergedLane.merge?.status).toBe("merged");
    expect(mergedLane.merge?.summary).toBe("integrator accepted lane result");
    expect(mergedLane.memory?.entriesAfter).toBe(3);
    expect(fs.readFileSync(mergedLane.memory?.filePath ?? "", "utf8")).toContain("\"event\":\"merged\"");
  }, 10000);

  it("rebinds reclaimed pool slot work without leaking stale slot ownership", async () => {
    const handoffPath = path.join(root, ".rph", "runtime", "handoffs.json");
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(handoffPath, JSON.stringify([
      {
        id: "handoff-slot-reclaim",
        sessionId: "session-slot-reclaim",
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        packet: {
          fromAgent: "Orchestrator",
          toAgent: "PM",
          stage: "SETUP",
          summary: "Slot ownership should move to the successful retry.",
          artifactRefs: [],
          acceptanceCriteria: ["failed slot is retained as dead and retry owns a new slot"],
          blockers: [],
          nextCommand: "/pm start",
          resumeCursor: "stage:SETUP",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      }
    ], null, 2));

    const failed = await runCli([
      "agent",
      "worker",
      "run",
      "handoff-slot-reclaim",
      "--worker-id",
      "slot-worker-one",
      "--max-tool-calls",
      "0"
    ], {
      cwd: root,
      env: {
        ...withoutProviderEnv(),
        RPH_WORKER_POOL_ID: "pool-reclaim",
        RPH_WORKER_SLOT_ID: "pool-reclaim:slot-1",
        RPH_WORKER_SLOT_INDEX: "1"
      }
    });

    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toContain("role slot: pool-reclaim:slot-1");
    expect(failed.stdout).toContain("tool budget blocked: lane tool budget exhausted");
    const afterFailure = loadRuntimeHandoffs(root).find((record) => record.id === "handoff-slot-reclaim");
    expect(afterFailure).toMatchObject({
      status: "pending",
      attempts: 1
    });
    expect(afterFailure?.slotId).toBeUndefined();
    const failedSlots = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "worker-slots.json"), "utf8")) as {
      poolId: string;
      slots: Array<{ slotIndex: number; status: string; role?: string; handoffId?: string; failureDisposition?: string; failureReason?: string }>;
    };
    expect(failedSlots.poolId).toBe("pool-reclaim");
    expect(failedSlots.slots.find((slot) => slot.slotIndex === 1)).toMatchObject({
      status: "dead",
      role: "PM",
      handoffId: "handoff-slot-reclaim",
      failureDisposition: "requeued"
    });
    expect(failedSlots.slots.find((slot) => slot.slotIndex === 1)?.failureReason).toContain("tool budget exhausted");

    const retry = await runCli([
      "agent",
      "worker",
      "run",
      "handoff-slot-reclaim",
      "--worker-id",
      "slot-worker-two"
    ], {
      cwd: root,
      env: {
        ...withoutProviderEnv(),
        RPH_WORKER_POOL_ID: "pool-reclaim",
        RPH_WORKER_SLOT_ID: "pool-reclaim:slot-2",
        RPH_WORKER_SLOT_INDEX: "2"
      }
    });

    expect(retry.exitCode).toBe(0);
    expect(retry.stdout).toContain("role slot: pool-reclaim:slot-2");
    const completed = loadRuntimeHandoffs(root).find((record) => record.id === "handoff-slot-reclaim");
    expect(completed).toMatchObject({
      status: "completed",
      attempts: 2,
      claimedBy: "slot-worker-two",
      poolId: "pool-reclaim",
      slotId: "pool-reclaim:slot-2",
      slotIndex: 2
    });
    const lanes = fs.readdirSync(path.join(root, ".rph", "runtime", "lanes"))
      .filter((file) => file.endsWith(".json"))
      .map((file) => JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "lanes", file), "utf8")) as {
        status: string;
        poolId?: string;
        slotId?: string;
        slotIndex?: number;
        workerId?: string;
        claimToken?: string;
        workerSessionId?: string;
      });
    expect(lanes.find((lane) => lane.status === "completed")).toMatchObject({
      poolId: "pool-reclaim",
      slotId: "pool-reclaim:slot-2",
      slotIndex: 2,
      workerId: "slot-worker-two"
    });
    expect(lanes.find((lane) => lane.status === "failed")).toMatchObject({
      poolId: "pool-reclaim",
      slotId: "pool-reclaim:slot-1",
      slotIndex: 1,
      workerId: "slot-worker-one"
    });
    const completedSlots = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "worker-slots.json"), "utf8")) as {
      slots: Array<{
        slotIndex: number;
        status: string;
        role?: string;
        handoffId?: string;
        workerId?: string;
        claimToken?: string;
        workerSessionId?: string;
        pid?: number;
      }>;
    };
    expect(completedSlots.slots.find((slot) => slot.slotIndex === 1)).toMatchObject({
      status: "dead",
      role: "PM",
      handoffId: "handoff-slot-reclaim",
      workerId: "slot-worker-one"
    });
    expect(completedSlots.slots.find((slot) => slot.slotIndex === 2)).toMatchObject({
      status: "completed",
      role: "PM",
      handoffId: "handoff-slot-reclaim",
      workerId: "slot-worker-two"
    });
    expect(JSON.stringify(completedSlots)).not.toContain("claimToken");
    expect(JSON.stringify(completedSlots)).not.toContain("workerSessionId");
  }, 10000);

  it("runs a foreground worker pool that polls handoffs and persists daemon state", async () => {
    const handoff = recordRuntimeHandoff(root, "session-worker-pool", {
      fromAgent: "Orchestrator",
      toAgent: "PM",
      stage: "SETUP",
      summary: "Foreground pool should consume queued PM work.",
      artifactRefs: [],
      acceptanceCriteria: ["worker pool dispatches and exits after idle timeout"],
      blockers: [],
      nextCommand: "/pm start",
      resumeCursor: "stage:SETUP",
      createdAt: "2026-01-01T00:00:00.000Z"
    });

    const result = await runCli([
      "agent",
      "pool",
      "run",
      "--concurrency",
      "1",
      "--poll-ms",
      "50",
      "--idle-ms",
      "50"
    ], { cwd: root, env: withoutProviderEnv() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("worker pool started: pool-");
    expect(result.stdout).toContain("worker pool config: concurrency=1 poll_ms=50 idle_ms=50");
    expect(result.stdout).toContain("worker pool cycle 1");
    expect(result.stdout).toContain("orchestrator step 1: /pm start");
    expect(result.stdout).toContain("worker pool stopped: idle timeout (50ms)");
    const handoffs = loadRuntimeHandoffs(root);
    expect(handoffs.find((record) => record.id === handoff.id)).toMatchObject({
      status: "completed",
      attempts: 1
    });
    const pool = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "worker-pool.json"), "utf8")) as {
      poolId: string;
      status: string;
      concurrency: number;
      pollMs: number;
      idleMs: number;
      cycles: number;
      dispatched: number;
      pid: number;
      mode?: string;
      stopReason?: string;
    };
    expect(pool).toMatchObject({
      status: "stopped",
      concurrency: 1,
      pollMs: 50,
      idleMs: 50,
      mode: "foreground",
      dispatched: 1,
      stopReason: "idle timeout (50ms)"
    });
    expect(pool.cycles).toBeGreaterThanOrEqual(2);
    const slots = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "worker-slots.json"), "utf8")) as {
      poolId: string;
      slots: Array<{
        slotId: string;
        slotIndex: number;
        status: string;
        role?: string;
        stage?: string;
        handoffId?: string;
        laneRunId?: string;
        workerId?: string;
        claimToken?: string;
        workerSessionId?: string;
        pid?: number;
      }>;
    };
    expect(slots.poolId).toBe(pool.poolId);
    expect(slots.slots).toHaveLength(1);
    expect(slots.slots[0]).toMatchObject({
      slotId: `${pool.poolId}:slot-0`,
      slotIndex: 0,
      status: "completed",
      role: "PM",
      stage: "SETUP",
      handoffId: handoff.id
    });
    expect(slots.slots[0].laneRunId).toBeTruthy();
    expect(slots.slots[0].workerId).toContain(`${pool.poolId}:slot-0`);
    expect(JSON.stringify(slots)).not.toContain("claimToken");
    expect(JSON.stringify(slots)).not.toContain("workerSessionId");
    expect(JSON.stringify(slots)).not.toContain(String(pool.pid));

    const status = await runCli(["agent", "pool", "status"], { cwd: root, env: withoutProviderEnv() });
    expect(status.exitCode).toBe(0);
    expect(status.stdout).toContain("Worker pool daemon");
    expect(status.stdout).toContain("- status=stopped pool=pool-");
    expect(status.stdout).toContain("- mode=foreground");
    expect(status.stdout).toContain("- slots=slot-0:completed/PM");
    expect(status.stdout).toContain("- cycles=");
    expect(status.stdout).toContain("dispatched=1");
    expect(status.stdout).toContain("next: rph agent pool start");
    expect(status.stdout).not.toContain("debug-pid");
    expect(status.stdout).not.toContain(String(pool.pid));

    const debugStatus = await runCli(["agent", "pool", "status", "--debug"], { cwd: root, env: withoutProviderEnv() });
    expect(debugStatus.exitCode).toBe(0);
    expect(debugStatus.stdout).toContain(`- debug-pid=${pool.pid}`);

    const workers = await runCli(["agent", "workers"], { cwd: root, env: withoutProviderEnv() });
    expect(workers.exitCode).toBe(0);
    expect(workers.stdout).toContain("- pool daemon: stopped");
    expect(workers.stdout).toContain("- pool slots: slot-0:completed/PM");
    expect(workers.stdout).toContain("dispatched=1");
    expect(workers.stdout).not.toContain(String(pool.pid));
  }, 10000);

  it("assigns distinct durable slots when the worker pool dispatches concurrent handoffs", async () => {
    const pmHandoff = recordRuntimeHandoff(root, "session-worker-pool-parallel", {
      fromAgent: "Orchestrator",
      toAgent: "PM",
      stage: "SETUP",
      summary: "Parallel pool PM lane.",
      artifactRefs: [],
      acceptanceCriteria: ["PM lane completes in a pool slot"],
      blockers: [],
      nextCommand: "/status",
      resumeCursor: "stage:SETUP",
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    const feHandoff = recordRuntimeHandoff(root, "session-worker-pool-parallel", {
      fromAgent: "Orchestrator",
      toAgent: "FE",
      stage: "SETUP",
      summary: "Parallel pool FE lane.",
      artifactRefs: [],
      acceptanceCriteria: ["FE lane completes in a distinct pool slot"],
      blockers: [],
      nextCommand: "/status",
      resumeCursor: "stage:SETUP",
      createdAt: "2026-01-01T00:00:00.000Z"
    });

    const result = await runCli([
      "agent",
      "pool",
      "run",
      "--concurrency",
      "2",
      "--poll-ms",
      "50",
      "--idle-ms",
      "50"
    ], { cwd: root, env: withoutProviderEnv() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("worker pool config: concurrency=2 poll_ms=50 idle_ms=50");
    expect(result.stdout).toContain("parallel scheduler: dispatching 2 lane(s)");
    expect(result.stdout).toContain("role slot: pool-");
    const pool = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "worker-pool.json"), "utf8")) as {
      poolId: string;
      dispatched: number;
    };
    expect(pool.dispatched).toBe(2);
    const handoffs = loadRuntimeHandoffs(root);
    const pm = handoffs.find((record) => record.id === pmHandoff.id);
    const fe = handoffs.find((record) => record.id === feHandoff.id);
    expect(pm).toMatchObject({
      status: "completed",
      poolId: pool.poolId,
      slotId: `${pool.poolId}:slot-0`,
      slotIndex: 0
    });
    expect(fe).toMatchObject({
      status: "completed",
      poolId: pool.poolId,
      slotId: `${pool.poolId}:slot-1`,
      slotIndex: 1
    });
    const slots = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "worker-slots.json"), "utf8")) as {
      poolId: string;
      slots: Array<{ slotId: string; slotIndex: number; status: string; role?: string; handoffId?: string; workerId?: string }>;
    };
    expect(slots.poolId).toBe(pool.poolId);
    expect(slots.slots).toHaveLength(2);
    expect(slots.slots[0]).toMatchObject({
      slotId: `${pool.poolId}:slot-0`,
      slotIndex: 0,
      status: "completed",
      role: "PM",
      handoffId: pmHandoff.id
    });
    expect(slots.slots[1]).toMatchObject({
      slotId: `${pool.poolId}:slot-1`,
      slotIndex: 1,
      status: "completed",
      role: "FE",
      handoffId: feHandoff.id
    });
    expect(new Set(slots.slots.map((slot) => slot.slotId)).size).toBe(2);

    const workers = await runCli(["agent", "workers"], { cwd: root, env: withoutProviderEnv() });
    expect(workers.exitCode).toBe(0);
    expect(workers.stdout).toContain("- pool slots: slot-0:completed/PM slot-1:completed/FE");
    expect(workers.stdout).toContain("dispatched=2");
  }, 10000);

  it("dispatches new pool work into a free slot when another slot has an active lease", async () => {
    const activeHandoff = recordRuntimeHandoff(root, "session-worker-pool-partial", {
      fromAgent: "Orchestrator",
      toAgent: "PM",
      stage: "SETUP",
      summary: "Slot zero is already occupied by a healthy worker.",
      artifactRefs: [],
      acceptanceCriteria: ["active slot remains owned"],
      blockers: [],
      nextCommand: "/status",
      resumeCursor: "stage:SETUP",
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    const claimed = claimRuntimeHandoff(root, activeHandoff.id, "slot-zero-worker", 60_000, new Date(), {
      poolId: "pool-partial",
      slotId: "pool-partial:slot-0",
      slotIndex: 0
    });
    const claimToken = runtimeHandoffExecutionToken(claimed);
    const activeLane = startAgentLaneRun(root, {
      sessionId: claimed.sessionId,
      handoffId: claimed.id,
      workerId: "slot-zero-worker",
      workerSessionId: claimed.workerSessionId,
      claimToken: claimToken.claimToken,
      workerPid: process.pid,
      poolId: "pool-partial",
      slotId: "pool-partial:slot-0",
      slotIndex: 0,
      attempt: claimed.attempts,
      packet: claimed.packet,
      command: claimed.packet.nextCommand ?? "",
      leaseExpiresAt: claimed.leaseExpiresAt
    });
    startRuntimeHandoffWork(root, claimed.id, { ...claimToken, laneRunId: activeLane.id }, activeLane.id, 60_000);
    const pendingHandoff = recordRuntimeHandoff(root, "session-worker-pool-partial", {
      fromAgent: "Orchestrator",
      toAgent: "FE",
      stage: "SETUP",
      summary: "New work should take the free pool slot.",
      artifactRefs: [],
      acceptanceCriteria: ["new work is assigned to slot one"],
      blockers: [],
      nextCommand: "/status",
      resumeCursor: "stage:SETUP",
      createdAt: "2026-01-01T00:00:00.000Z"
    });

    const result = await runCli([
      "agent",
      "pool",
      "run",
      "--concurrency",
      "2",
      "--poll-ms",
      "50",
      "--max-cycles",
      "1"
    ], {
      cwd: root,
      env: {
        ...withoutProviderEnv(),
        RPH_WORKER_POOL_ID: "pool-partial"
      }
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("role slot: pool-partial:slot-1");
    expect(result.stdout).toContain("worker pool failed: unfinished work remains");
    const handoffs = loadRuntimeHandoffs(root);
    expect(handoffs.find((record) => record.id === activeHandoff.id)).toMatchObject({
      status: "running",
      poolId: "pool-partial",
      slotId: "pool-partial:slot-0",
      slotIndex: 0
    });
    const completed = handoffs.find((record) => record.id === pendingHandoff.id);
    expect(completed).toMatchObject({
      status: "completed",
      poolId: "pool-partial",
      slotId: "pool-partial:slot-1",
      slotIndex: 1
    });
    const slots = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "worker-slots.json"), "utf8")) as {
      poolId: string;
      slots: Array<{ slotIndex: number; status: string; role?: string; handoffId?: string }>;
    };
    expect(slots.slots[0]).toMatchObject({
      slotIndex: 0,
      status: "running",
      role: "PM",
      handoffId: activeHandoff.id
    });
    expect(slots.slots[1]).toMatchObject({
      slotIndex: 1,
      status: "completed",
      role: "FE",
      handoffId: pendingHandoff.id
    });
  }, 10000);

  it("honors worker pool stop requests through durable pool state", async () => {
    const repoRoot = path.resolve(__dirname, "..");
    const cliEntry = path.join(repoRoot, "dist", "apps", "cli", "src", "index.js");
    const env = { ...process.env, ...withoutProviderEnv() };
    const child = spawn(process.execPath, [
      cliEntry,
      "agent",
      "pool",
      "run",
      "--concurrency",
      "1",
      "--poll-ms",
      "50",
      "--idle-ms",
      "0"
    ], {
      cwd: root,
      env,
      stdio: "pipe"
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    const childExitPromise = waitForChild(child);

    try {
      await waitUntil(() => {
        const filePath = path.join(root, ".rph", "runtime", "worker-pool.json");
        if (!fs.existsSync(filePath)) return false;
        const current = JSON.parse(fs.readFileSync(filePath, "utf8")) as { status: string; cycles: number };
        return current.status === "running" && current.cycles >= 1;
      });
      const stop = await runCli(["agent", "pool", "stop", "--reason", "test shutdown"], {
        cwd: root,
        env: withoutProviderEnv()
      });
      expect(stop.exitCode).toBe(0);
      expect(stop.stdout).toContain("worker pool stop requested: pool-");

      const childExit = await childExitPromise;
      expect(childExit).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toContain("worker pool stopped: test shutdown");
      const pool = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "worker-pool.json"), "utf8")) as {
        status: string;
        stopReason?: string;
        stopRequestedAt?: string;
        stoppedAt?: string;
        dispatched: number;
      };
      expect(pool).toMatchObject({
        status: "stopped",
        stopReason: "test shutdown",
        dispatched: 0
      });
      expect(pool.stopRequestedAt).toBeTruthy();
      expect(pool.stoppedAt).toBeTruthy();
    } finally {
      if (child.exitCode === null) {
        child.kill();
      }
    }
  }, 10000);

  it("starts a background worker pool, tails durable logs, and stops through daemon state", async () => {
    const handoff = recordRuntimeHandoff(root, "session-worker-pool-background", {
      fromAgent: "Orchestrator",
      toAgent: "PM",
      stage: "SETUP",
      summary: "Background pool should consume queued PM work.",
      artifactRefs: [],
      acceptanceCriteria: ["background worker pool dispatches queued work"],
      blockers: [],
      nextCommand: "/pm start",
      resumeCursor: "stage:SETUP",
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    let poolPid: number | undefined;

    try {
      const start = await runCli([
        "agent",
        "pool",
        "start",
        "--concurrency",
        "1",
        "--poll-ms",
        "50",
        "--idle-ms",
        "0"
      ], { cwd: root, env: withoutProviderEnv() });

      expect(start.exitCode).toBe(0);
      expect(start.stderr).toBe("");
      expect(start.stdout).toContain("worker pool background started");
      expect(start.stdout).toContain("worker pool config: concurrency=1 poll_ms=50 idle_ms=0");
      expect(start.stdout).toContain("worker pool log: .rph/runtime/worker-pool.log");
      expect(start.stdout).toContain("next: rph agent pool status");

      await waitUntil(() => {
        const filePath = path.join(root, ".rph", "runtime", "worker-pool.json");
        if (!fs.existsSync(filePath)) return false;
        const current = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
          status: string;
          mode?: string;
          cycles: number;
          pid: number;
        };
        poolPid = current.pid;
        return current.status === "running" && current.mode === "background" && current.cycles >= 1;
      }, 5_000);

      const status = await runCli(["agent", "pool", "status"], { cwd: root, env: withoutProviderEnv() });
      expect(status.exitCode).toBe(0);
      expect(status.stdout).toContain("Worker pool daemon");
      expect(status.stdout).toContain("- status=running pool=pool-");
      expect(status.stdout).toContain("process=alive");
      expect(status.stdout).toContain("- mode=background");
      expect(status.stdout).toContain("- log=.rph/runtime/worker-pool.log");
      expect(status.stdout).toContain("next: rph agent pool stop");
      if (poolPid) {
        expect(status.stdout).not.toContain(String(poolPid));
        expect(start.stdout).not.toContain(String(poolPid));
      }
      expect(status.stdout).not.toContain("debug-pid");

      await waitUntil(() => {
        const handoffs = loadRuntimeHandoffs(root);
        return handoffs.find((record) => record.id === handoff.id)?.status === "completed";
      }, 5_000);
      const poolAtCompletion = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "worker-pool.json"), "utf8")) as {
        poolId: string;
      };
      await waitUntil(() => {
        const filePath = path.join(root, ".rph", "runtime", "worker-slots.json");
        if (!fs.existsSync(filePath)) return false;
        const slots = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
          poolId: string;
          slots: Array<{ status: string; handoffId?: string; slotId?: string; role?: string }>;
        };
        return slots.poolId === poolAtCompletion.poolId
          && slots.slots[0]?.status === "completed"
          && slots.slots[0]?.handoffId === handoff.id;
      }, 5_000);
      const slotsAtCompletion = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "worker-slots.json"), "utf8")) as {
        poolId: string;
        slots: Array<{
          status: string;
          slotId: string;
          slotIndex: number;
          role?: string;
          stage?: string;
          handoffId?: string;
          laneRunId?: string;
          workerId?: string;
          claimToken?: string;
          workerSessionId?: string;
          pid?: number;
        }>;
      };
      expect(slotsAtCompletion.poolId).toBe(poolAtCompletion.poolId);
      expect(slotsAtCompletion.slots[0]).toMatchObject({
        status: "completed",
        slotId: `${poolAtCompletion.poolId}:slot-0`,
        slotIndex: 0,
        role: "PM",
        stage: "SETUP",
        handoffId: handoff.id
      });
      expect(slotsAtCompletion.slots[0].laneRunId).toBeTruthy();
      expect(slotsAtCompletion.slots[0].workerId).toContain(`${poolAtCompletion.poolId}:slot-0`);
      expect(JSON.stringify(slotsAtCompletion)).not.toContain("claimToken");
      expect(JSON.stringify(slotsAtCompletion)).not.toContain("workerSessionId");
      const completedHandoff = loadRuntimeHandoffs(root).find((record) => record.id === handoff.id);
      expect(completedHandoff).toMatchObject({
        poolId: poolAtCompletion.poolId,
        slotId: `${poolAtCompletion.poolId}:slot-0`,
        slotIndex: 0
      });
      const lane = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "lanes", `${completedHandoff?.laneRunId}.json`), "utf8")) as {
        workerId?: string;
        poolId?: string;
        slotId?: string;
        slotIndex?: number;
      };
      expect(lane).toMatchObject({
        poolId: poolAtCompletion.poolId,
        slotId: `${poolAtCompletion.poolId}:slot-0`,
        slotIndex: 0
      });
      expect(lane.workerId).toContain(`${poolAtCompletion.poolId}:slot-0`);

      const stop = await runCli(["agent", "pool", "stop", "--reason", "test shutdown"], {
        cwd: root,
        env: withoutProviderEnv()
      });
      expect(stop.exitCode).toBe(0);
      expect(stop.stdout).toContain("worker pool stop requested: pool-");

      await waitUntil(() => {
        const poolPath = path.join(root, ".rph", "runtime", "worker-pool.json");
        const logPath = path.join(root, ".rph", "runtime", "worker-pool.log");
        if (!fs.existsSync(poolPath) || !fs.existsSync(logPath)) return false;
        const current = JSON.parse(fs.readFileSync(poolPath, "utf8")) as { status: string; stopReason?: string; dispatched: number };
        return current.status === "stopped"
          && current.stopReason === "test shutdown"
          && current.dispatched >= 1
          && fs.readFileSync(logPath, "utf8").includes("worker pool stopped: test shutdown");
      }, 5_000);

      const logs = await runCli(["agent", "pool", "logs", "--limit", "80"], { cwd: root, env: withoutProviderEnv() });
      expect(logs.exitCode).toBe(0);
      expect(logs.stdout).toContain("Worker pool logs: .rph/runtime/worker-pool.log");
      expect(logs.stdout).toContain("worker pool started: pool-");
      expect(logs.stdout).toContain("worker pool cycle");
      expect(logs.stdout).toContain("orchestrator step 1: /pm start");
      expect(logs.stdout).toContain("worker pool stopped: test shutdown");
      expect(logs.stdout).not.toContain("claimToken");
      expect(logs.stdout).not.toContain("workerSessionId");

      const pool = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "worker-pool.json"), "utf8")) as {
        status: string;
        mode?: string;
        logPath?: string;
        stopReason?: string;
        stopRequestedAt?: string;
        stoppedAt?: string;
        dispatched: number;
      };
      expect(pool).toMatchObject({
        status: "stopped",
        mode: "background",
        stopReason: "test shutdown"
      });
      expect(pool.logPath).toMatch(/\.rph\/runtime\/worker-pool\.log$/);
      expect(pool.stopRequestedAt).toBeTruthy();
      expect(pool.stoppedAt).toBeTruthy();
      expect(pool.dispatched).toBeGreaterThanOrEqual(1);
    } finally {
      await runCli(["agent", "pool", "stop", "--reason", "test cleanup"], {
        cwd: root,
        env: withoutProviderEnv()
      });
      try {
        await waitUntil(() => {
          const filePath = path.join(root, ".rph", "runtime", "worker-pool.json");
          if (!fs.existsSync(filePath)) return true;
          const current = JSON.parse(fs.readFileSync(filePath, "utf8")) as { status: string };
          return current.status === "stopped" || current.status === "failed";
        }, 2_000);
      } catch {
        if (poolPid) {
          try {
            process.kill(poolPid, "SIGTERM");
          } catch {
            // Best-effort cleanup for a failed background-pool test.
          }
        }
      }
    }
  }, 15000);

  it("rejects a live pid when the worker-pool fingerprint does not match the running daemon", async () => {
    const poolPath = path.join(root, ".rph", "runtime", "worker-pool.json");
    fs.mkdirSync(path.dirname(poolPath), { recursive: true });
    fs.writeFileSync(poolPath, JSON.stringify({
      version: 1,
      poolId: "pool-tampered",
      status: "running",
      pid: process.pid,
      pidStartedAt: "Mon Jan 1 00:00:00 2001",
      poolToken: "tampered-token",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      heartbeatAt: "2026-01-01T00:00:00.000Z",
      mode: "background",
      concurrency: 1,
      pollMs: 50,
      idleMs: 0,
      cycles: 1,
      dispatched: 0
    }, null, 2));

    const status = await runCli(["agent", "pool", "status"], { cwd: root, env: withoutProviderEnv() });
    expect(status.exitCode).toBe(0);
    expect(status.stdout).toContain("- status=running pool=pool-tampered process=identity-mismatch");
    expect(status.stdout).not.toContain("debug-pid");
    expect(status.stdout).not.toContain(String(process.pid));

    const stop = await runCli(["agent", "pool", "stop", "--reason", "test mismatch"], {
      cwd: root,
      env: withoutProviderEnv()
    });
    expect(stop.exitCode).toBe(1);
    expect(stop.stdout).toContain("worker pool stop blocked: process identity identity-mismatch (pool-tampered)");
    const pool = JSON.parse(fs.readFileSync(poolPath, "utf8")) as { status: string; stopReason?: string };
    expect(pool).toMatchObject({
      status: "failed",
      stopReason: "pool process identity mismatch; refusing to signal pid"
    });
  });

  it("reports unreadable worker-pool state instead of silently hiding it", async () => {
    const poolPath = path.join(root, ".rph", "runtime", "worker-pool.json");
    fs.mkdirSync(path.dirname(poolPath), { recursive: true });
    fs.writeFileSync(poolPath, "{not-json");

    const status = await runCli(["agent", "pool", "status"], { cwd: root, env: withoutProviderEnv() });
    expect(status.exitCode).toBe(0);
    expect(status.stdout).toContain("Worker pool daemon");
    expect(status.stdout).toContain("- status=unreadable");
    expect(status.stdout).toContain("- issue=state file is unreadable JSON");
    expect(status.stdout).toContain("next: rph agent pool start");

    const stop = await runCli(["agent", "pool", "stop", "--force", "--reason", "corrupt state"], {
      cwd: root,
      env: withoutProviderEnv()
    });
    expect(stop.exitCode).toBe(1);
    expect(stop.stdout).toContain("worker pool stop blocked: state file is unreadable JSON");

    const start = await runCli([
      "agent",
      "pool",
      "run",
      "--concurrency",
      "1",
      "--poll-ms",
      "50",
      "--idle-ms",
      "50",
      "--max-cycles",
      "1"
    ], { cwd: root, env: withoutProviderEnv() });
    expect(start.exitCode).toBe(1);
    expect(start.stdout).toContain("worker pool blocked: state file is unreadable JSON");
    expect(start.stdout).toContain("next: inspect or remove .rph/runtime/worker-pool.json");
  }, 10000);

  it("drains current background work and stops before claiming queued handoffs", async () => {
    const first = recordRuntimeHandoff(root, "session-worker-pool-drain", {
      fromAgent: "Orchestrator",
      toAgent: "PM",
      stage: "SETUP",
      summary: "First drain handoff should complete.",
      artifactRefs: [],
      acceptanceCriteria: ["first handoff completes before drain stop"],
      blockers: [],
      nextCommand: "/pm start",
      resumeCursor: "stage:SETUP",
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    const second = recordRuntimeHandoff(root, "session-worker-pool-drain", {
      fromAgent: "Orchestrator",
      toAgent: "QA",
      stage: "SETUP",
      summary: "Second drain handoff should remain pending.",
      artifactRefs: [],
      acceptanceCriteria: ["second handoff is not claimed after stop request"],
      blockers: [],
      nextCommand: "/qa review --pr 1",
      resumeCursor: "stage:SETUP",
      createdAt: "2026-01-01T00:00:00.000Z"
    });

    const start = await runCli([
      "agent",
      "pool",
      "start",
      "--concurrency",
      "1",
      "--poll-ms",
      "1000",
      "--idle-ms",
      "0"
    ], { cwd: root, env: withoutProviderEnv() });
    expect(start.exitCode).toBe(0);

    try {
      await waitUntil(() => {
        const handoffs = loadRuntimeHandoffs(root);
        const firstStatus = handoffs.find((record) => record.id === first.id)?.status;
        const secondStatus = handoffs.find((record) => record.id === second.id)?.status;
        return firstStatus === "completed" && secondStatus === "pending";
      }, 5_000);

      const stop = await runCli(["agent", "pool", "stop", "--reason", "drain requested"], {
        cwd: root,
        env: withoutProviderEnv()
      });
      expect(stop.exitCode).toBe(0);
      expect(stop.stdout).toContain("worker pool stop requested: pool-");
      expect(stop.stdout).toContain("worker pool stop mode: drain");

      await waitUntil(() => {
        const pool = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "worker-pool.json"), "utf8")) as {
          status: string;
          stopReason?: string;
          stopMode?: string;
        };
        return pool.status === "stopped" && pool.stopReason === "drain requested" && pool.stopMode === "drain";
      }, 5_000);

      const handoffs = loadRuntimeHandoffs(root);
      expect(handoffs.find((record) => record.id === first.id)?.status).toBe("completed");
      expect(handoffs.find((record) => record.id === second.id)?.status).toBe("pending");
    } finally {
      await runCli(["agent", "pool", "stop", "--force", "--reason", "test cleanup"], {
        cwd: root,
        env: withoutProviderEnv()
      });
    }
  }, 15000);

  it("force-stops a background worker pool without waiting for the next poll boundary", async () => {
    const start = await runCli([
      "agent",
      "pool",
      "start",
      "--concurrency",
      "1",
      "--poll-ms",
      "1000",
      "--idle-ms",
      "0"
    ], { cwd: root, env: withoutProviderEnv() });
    expect(start.exitCode).toBe(0);

    await waitUntil(() => {
      const poolPath = path.join(root, ".rph", "runtime", "worker-pool.json");
      if (!fs.existsSync(poolPath)) return false;
      const current = JSON.parse(fs.readFileSync(poolPath, "utf8")) as { status: string; mode?: string };
      return current.status === "running" && current.mode === "background";
    }, 5_000);

    const stop = await runCli(["agent", "pool", "stop", "--force", "--reason", "test force"], {
      cwd: root,
      env: withoutProviderEnv()
    });
    expect(stop.exitCode).toBe(0);
    expect(stop.stdout).toContain("worker pool force stop confirmed: pool-");
    const pool = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "worker-pool.json"), "utf8")) as {
      status: string;
      stopReason?: string;
      stopMode?: string;
      forceRequestedAt?: string;
      stoppedAt?: string;
    };
    expect(pool).toMatchObject({
      status: "stopped",
      stopReason: "test force (forced)",
      stopMode: "force"
    });
    expect(pool.forceRequestedAt).toBeTruthy();
    expect(pool.stoppedAt).toBeTruthy();
  }, 10000);

  it("renders, installs, reports, and uninstalls a launchd worker-pool service plist without loading it", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "rph-launchd-home-"));
    const stubBin = path.join(home, "bin");
    const launchctlLog = path.join(home, "launchctl.log");
    fs.mkdirSync(stubBin, { recursive: true });
    const launchctlStub = path.join(stubBin, "launchctl");
    fs.writeFileSync(launchctlStub, [
      "#!/bin/sh",
      `echo "$@" >> ${JSON.stringify(launchctlLog)}`,
      "exit 99",
      ""
    ].join("\n"));
    fs.chmodSync(launchctlStub, 0o755);
    const env = {
      ...withoutProviderEnv(),
      HOME: home,
      PATH: `${stubBin}${path.delimiter}${process.env.PATH ?? ""}`
    };
    const realRoot = fs.realpathSync(root);

    try {
      const rendered = await runCli([
        "agent",
        "pool",
        "service",
        "plist",
        "--concurrency",
        "3",
        "--poll-ms",
        "250",
        "--max-tool-calls",
        "5"
      ], { cwd: root, env });
      expect(rendered.exitCode).toBe(0);
      expect(rendered.stdout).toContain(`<?xml version="1.0" encoding="UTF-8"?>`);
      expect(rendered.stdout).toContain("<key>Label</key>");
      expect(rendered.stdout).toContain("<key>ProgramArguments</key>");
      expect(rendered.stdout).toContain("<key>WorkingDirectory</key>");
      expect(rendered.stdout).toContain(`<string>${realRoot}</string>`);
      expect(rendered.stdout).toContain("<string>agent</string>");
      expect(rendered.stdout).toContain("<string>pool</string>");
      expect(rendered.stdout).toContain("<string>run</string>");
      expect(rendered.stdout).toContain("<string>--concurrency</string>");
      expect(rendered.stdout).toContain("<string>3</string>");
      expect(rendered.stdout).toContain("<key>RPH_WORKER_POOL_MODE</key>");
      expect(rendered.stdout).toContain("<string>service</string>");
      expect(rendered.stdout).not.toContain("OPENAI_API_KEY");
      expect(fs.existsSync(path.join(home, "Library", "LaunchAgents"))).toBe(false);
      expect(fs.existsSync(launchctlLog)).toBe(false);

      const install = await runCli([
        "agent",
        "pool",
        "service",
        "install",
        "--no-load",
        "--concurrency",
        "3",
        "--poll-ms",
        "250",
        "--max-tool-calls",
        "5"
      ], { cwd: root, env });
      expect(install.exitCode).toBe(0);
      expect(install.stdout).toContain("worker pool service installed");
      expect(install.stdout).toContain("- label=dev.rph.");
      expect(install.stdout).toContain("- plist=~/Library/LaunchAgents/dev.rph.");
      expect(install.stdout).toContain(`- project=${realRoot}`);
      expect(install.stdout).toContain("- launchctl=skipped (--no-load)");
      expect(install.stdout).toContain("next: rph agent pool service status");
      expect(fs.existsSync(launchctlLog)).toBe(false);

      const launchAgentsDir = path.join(home, "Library", "LaunchAgents");
      const plistFiles = fs.readdirSync(launchAgentsDir).filter((file) => file.endsWith(".plist"));
      expect(plistFiles).toHaveLength(1);
      const plistPath = path.join(launchAgentsDir, plistFiles[0]);
      const plist = fs.readFileSync(plistPath, "utf8");
      expect(plist).toBe(rendered.stdout);
      expect(plist).toContain(`<string>${realRoot}</string>`);
      expect(plist).toContain("<string>--poll-ms</string>");
      expect(plist).toContain("<string>250</string>");
      expect(plist).toContain("<string>--max-tool-calls</string>");
      expect(plist).toContain("<string>5</string>");

      const status = await runCli(["agent", "pool", "service", "status"], { cwd: root, env });
      expect(status.exitCode).toBe(0);
      expect(status.stdout).toContain("Worker pool service");
      expect(status.stdout).toContain("- label=dev.rph.");
      expect(status.stdout).toContain("- installed=yes");
      expect(status.stdout).toContain("- launchctl=not-checked");
      expect(status.stdout).toContain("next: rph agent pool service uninstall");
      expect(fs.existsSync(launchctlLog)).toBe(false);

      const uninstall = await runCli(["agent", "pool", "service", "uninstall", "--no-unload"], { cwd: root, env });
      expect(uninstall.exitCode).toBe(0);
      expect(uninstall.stdout).toContain("worker pool service uninstalled");
      expect(uninstall.stdout).toContain("next: rph agent pool service status");
      expect(fs.existsSync(plistPath)).toBe(false);
      expect(fs.existsSync(launchctlLog)).toBe(false);

      const absentStatus = await runCli(["agent", "pool", "service", "status"], { cwd: root, env });
      expect(absentStatus.exitCode).toBe(0);
      expect(absentStatus.stdout).toContain("Worker pool service");
      expect(absentStatus.stdout).toContain("- installed=no");
      expect(absentStatus.stdout).toContain("next: rph agent pool service install");
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }, 10000);

  it("blocks unsafe launch-agent service installs before launchctl can run", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "rph-launchd-unsafe-home-"));
    const stubBin = path.join(home, "bin");
    const launchctlLog = path.join(home, "launchctl.log");
    fs.mkdirSync(stubBin, { recursive: true });
    const launchctlStub = path.join(stubBin, "launchctl");
    fs.writeFileSync(launchctlStub, [
      "#!/bin/sh",
      `echo "$@" >> ${JSON.stringify(launchctlLog)}`,
      "exit 99",
      ""
    ].join("\n"));
    fs.chmodSync(launchctlStub, 0o755);
    const env = {
      ...withoutProviderEnv(),
      HOME: home,
      PATH: `${stubBin}${path.delimiter}${process.env.PATH ?? ""}`
    };
    const poolPath = path.join(root, ".rph", "runtime", "worker-pool.json");

    try {
      fs.mkdirSync(path.dirname(poolPath), { recursive: true });
      fs.writeFileSync(poolPath, "{not-json");
      const corrupt = await runCli(["agent", "pool", "service", "install", "--no-load"], { cwd: root, env });
      expect(corrupt.exitCode).toBe(1);
      expect(corrupt.stdout).toContain("worker pool service install blocked: state file is unreadable JSON");
      expect(corrupt.stdout).toContain("next: inspect or remove .rph/runtime/worker-pool.json");
      expect(fs.existsSync(launchctlLog)).toBe(false);

      fs.writeFileSync(poolPath, JSON.stringify({
        version: 1,
        poolId: "pool-active",
        status: "running",
        pid: process.pid,
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        heartbeatAt: "2026-01-01T00:00:00.000Z",
        mode: "background",
        concurrency: 1,
        pollMs: 50,
        idleMs: 0,
        cycles: 1,
        dispatched: 0
      }, null, 2));
      const active = await runCli(["agent", "pool", "service", "install", "--no-load"], { cwd: root, env });
      expect(active.exitCode).toBe(1);
      expect(active.stdout).toContain("worker pool service install blocked: worker pool already active (pool-active)");
      expect(active.stdout).toContain("next: rph agent pool status");
      expect(fs.existsSync(launchctlLog)).toBe(false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }, 10000);

  it("refuses to overwrite a symlinked launch-agent plist", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "rph-launchd-symlink-home-"));
    const stubBin = path.join(home, "bin");
    const launchctlLog = path.join(home, "launchctl.log");
    fs.mkdirSync(stubBin, { recursive: true });
    const launchctlStub = path.join(stubBin, "launchctl");
    fs.writeFileSync(launchctlStub, [
      "#!/bin/sh",
      `echo "$@" >> ${JSON.stringify(launchctlLog)}`,
      "exit 99",
      ""
    ].join("\n"));
    fs.chmodSync(launchctlStub, 0o755);
    const env = {
      ...withoutProviderEnv(),
      HOME: home,
      PATH: `${stubBin}${path.delimiter}${process.env.PATH ?? ""}`
    };

    try {
      const status = await runCli(["agent", "pool", "service", "status"], { cwd: root, env });
      expect(status.exitCode).toBe(0);
      const relativePlist = status.stdout.match(/- plist=~\/(Library\/LaunchAgents\/[^\n]+)/)?.[1];
      expect(relativePlist).toBeTruthy();
      const plistPath = path.join(home, relativePlist ?? "");
      const targetPath = path.join(home, "target.plist");
      fs.mkdirSync(path.dirname(plistPath), { recursive: true });
      fs.writeFileSync(targetPath, "preserve me");
      fs.symlinkSync(targetPath, plistPath);

      const install = await runCli(["agent", "pool", "service", "install", "--no-load"], { cwd: root, env });
      expect(install.exitCode).toBe(1);
      expect(install.stdout).toContain("worker pool service install blocked: plist path is not a regular file");
      expect(fs.readFileSync(targetPath, "utf8")).toBe("preserve me");
      expect(fs.existsSync(launchctlLog)).toBe(false);

      const after = await runCli(["agent", "pool", "service", "status"], { cwd: root, env });
      expect(after.exitCode).toBe(0);
      expect(after.stdout).toContain("- installed=unreadable");
      expect(after.stdout).toContain("- issue=plist path is not a regular file");
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }, 10000);

  it("dead-letters a failed lane result and prevents stage merge", async () => {
    const handoffPath = path.join(root, ".rph", "runtime", "handoffs.json");
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(handoffPath, JSON.stringify([
      {
        id: "handoff-dead-letter",
        sessionId: "session-test",
        status: "pending",
        attempts: 0,
        maxAttempts: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        packet: {
          fromAgent: "Orchestrator",
          toAgent: "PM",
          stage: "SETUP",
          summary: "Failing PM command should not merge.",
          artifactRefs: ["document:product-definition"],
          acceptanceCriteria: ["failed lane is isolated"],
          blockers: [],
          nextCommand: "/pm unknown",
          resumeCursor: "stage:SETUP",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      }
    ], null, 2));

    const result = await runCli(["agent", "run", "--steps", "1"], { cwd: root });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("orchestrator step 1: /pm unknown");
    expect(result.stdout).toContain("orchestration command failed: /pm unknown");
    const state = JSON.parse(fs.readFileSync(path.join(root, ".rph", "state.json"), "utf8")) as {
      currentStage: string;
    };
    const handoffs = JSON.parse(fs.readFileSync(handoffPath, "utf8")) as Array<{
      status: string;
      deadLetterReason?: string;
    }>;
    expect(state.currentStage).toBe("SETUP");
    expect(handoffs[0].status).toBe("dead_letter");
    expect(handoffs[0].deadLetterReason).toContain("lane execution failed: /pm unknown");
    const laneFiles = fs.readdirSync(path.join(root, ".rph", "runtime", "lanes")).filter((file) => file.endsWith(".json"));
    expect(laneFiles).toHaveLength(1);
    const lane = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "lanes", laneFiles[0]), "utf8")) as {
      status: string;
      merge?: {
        status: string;
      };
      result?: {
        ok: boolean;
      };
      memory?: {
        filePath: string;
        entriesAfter?: number;
      };
    };
    expect(lane.status).toBe("failed");
    expect(lane.result?.ok).toBe(false);
    expect(lane.merge?.status).toBe("blocked");
    expect(lane.memory?.entriesAfter).toBe(2);
    expect(fs.readFileSync(lane.memory?.filePath ?? "", "utf8")).toContain("\"event\":\"failed\"");
  }, 10000);

  it("injects the active role lane prompt into AI-backed handoff work", async () => {
    const captureFile = path.join(root, "lane-fetch-capture.json");
    writeOpenAiEnv(root, "https://example.invalid/v1");
    const handoffPath = path.join(root, ".rph", "runtime", "handoffs.json");
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(handoffPath, JSON.stringify([
      {
        id: "handoff-ai-lane",
        sessionId: "session-test",
        status: "pending",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        packet: {
          fromAgent: "Orchestrator",
          toAgent: "PM",
          stage: "SETUP",
          summary: "Draft product definition inside the PM lane.",
          artifactRefs: ["document:product-definition"],
          acceptanceCriteria: ["PM draft created"],
          blockers: [],
          nextCommand: "/pm draft product-definition --ai",
          resumeCursor: "stage:SETUP",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      }
    ], null, 2));

    const result = await runCli(["agent", "run", "--steps", "1"], {
      cwd: root,
      preloadFetchCapture: captureFile
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("role runner: PM (SETUP) lane=lane-");
    const payload = JSON.parse(fs.readFileSync(captureFile, "utf8")) as {
      instructions?: string;
      input?: string;
    };
    expect(payload.instructions).toContain("PM lane runner");
    expect(payload.instructions).toContain("Lane acceptance: PM draft created");
    expect(payload.input).toContain("PM Agent");
  }, 10000);

  it("exposes one-shot /agent status and handoffs without falling through to chat", async () => {
    const handoffPath = path.join(root, ".rph", "runtime", "handoffs.json");
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(handoffPath, JSON.stringify([
      {
        id: "handoff-one-shot",
        sessionId: "session-test",
        status: "pending",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        packet: {
          fromAgent: "PM",
          toAgent: "PD",
          stage: "PD_REFERENCES",
          summary: "PD should continue from approved PM docs.",
          artifactRefs: ["document:product-definition"],
          acceptanceCriteria: ["PD references are created"],
          blockers: [],
          nextCommand: "/pd references --ai",
          resumeCursor: "stage:PD_REFERENCES",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      }
    ], null, 2));

    const status = await runCli(["agent", "status"], { cwd: root, env: withoutProviderEnv() });
    const handoffs = await runCli(["agent", "handoffs"], { cwd: root, env: withoutProviderEnv() });

    expect(status.exitCode).toBe(0);
    expect(status.stdout).toContain("AI agent:");
    expect(status.stdout).toContain("handoffs pending: 1");
    expect(status.stdout).not.toContain("agent proposed command");
    expect(handoffs.exitCode).toBe(0);
    expect(handoffs.stdout).toContain("handoff-one-shot [pending] PM -> PD stage=PD_REFERENCES");
    expect(handoffs.stdout).toContain("next: /pd references --ai");
  }, 10000);

  it("exposes one-shot /agent session and replay from the runtime journal", async () => {
    writeOpenAiEnv(root, "http://127.0.0.1:9/v1");
    const shell = await runCli(["shell"], {
      cwd: root,
      stdinChunks: [
        { text: "/status\n", delayMs: 0 },
        { text: "/exit\n", delayMs: 50 }
      ]
    });
    expect(shell.exitCode).toBe(0);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "current-session.json"), "utf8")) as {
      sessionId: string;
    };

    const session = await runCli(["agent", "session", "--limit", "2"], { cwd: root, env: withoutProviderEnv() });
    const replay = await runCli(["agent", "replay", manifest.sessionId, "--limit", "2"], { cwd: root, env: withoutProviderEnv() });

    expect(session.exitCode).toBe(0);
    expect(session.stdout).toContain("Runtime session journal");
    expect(session.stdout).toContain(`session: ${manifest.sessionId}`);
    expect(session.stdout).toContain(".rph/runtime/sessions/");
    expect(session.stdout).toContain("entries:");
    expect(session.stdout).toContain("latest:");
    expect(session.stdout).not.toContain("agent proposed command");
    expect(replay.exitCode).toBe(0);
    expect(replay.stdout).toContain("Runtime session replay");
    expect(replay.stdout).toContain(`session: ${manifest.sessionId}`);
    expect(replay.stdout).toContain("replayed: active stage=SETUP");
    expect(replay.stdout).toContain("last command: /status ok=true");
    expect(replay.stdout).toContain("Session timeline:");
    expect(replay.stdout).toContain("checkpoint: /status ok=true");
    expect(replay.stdout).toContain("Replay snapshots:");
  }, 10000);

  it("shows a deterministic session recovery brief on agent status and runtime startup", async () => {
    writeRecoveryBriefFixture(root);

    const status = await runCli(["agent", "status"], { cwd: root, env: withoutProviderEnv() });
    expect(status.exitCode).toBe(0);
    expect(status.stdout).toContain("Session recovery brief");
    expect(status.stdout).toContain("session-recovery status=blocked stage=SETUP");
    expect(status.stdout).toContain("wait: external_live_write external action pending: /github create-repo --public");
    expect(status.stdout).toContain("pending external action: action-recovery [pending] /github create-repo --public");
    expect(status.stdout).toContain("claimable handoffs: 1; next=handoff-recovery FE stage=FE_SPEC command=/fe spec --ai");
    expect(status.stdout).toContain("next safe command: /agent approve-action action-recovery");

    const shell = await runCli(["shell"], {
      cwd: root,
      env: withoutProviderEnv(),
      stdinChunks: [{ text: "/exit\n", delayMs: 0 }]
    });
    expect(shell.exitCode).toBe(0);
    expect(shell.stdout).toContain("- graph: graph:session-recovery");
    expect(shell.stdout).toMatch(/- digest: [a-f0-9]{12}/);
    expect(shell.stdout).toContain("- inspect: rph agent graph status --verbose");
    expect(shell.stdout).toContain("Session recovery brief");
    expect(shell.stdout).toContain("pending external action: action-recovery [pending] /github create-repo --public");
    expect(shell.stdout).toContain("next safe command: /agent approve-action action-recovery");
  }, 10000);

  it("fails closed with a repair hint when handoffs.json is unreadable during recovery", async () => {
    writeRecoveryBriefFixture(root);
    fs.writeFileSync(path.join(root, ".rph", "runtime", "handoffs.json"), "{not-json");

    const status = await runCli(["agent", "status"], { cwd: root, env: withoutProviderEnv() });
    const handoffs = await runCli(["agent", "handoffs"], { cwd: root, env: withoutProviderEnv() });
    const workers = await runCli(["agent", "workers"], { cwd: root, env: withoutProviderEnv() });
    const recover = await runCli(["agent", "recover"], { cwd: root, env: withoutProviderEnv() });
    const run = await runCli(["agent", "run", "--steps", "1"], { cwd: root, env: withoutProviderEnv() });

    for (const result of [status, handoffs, workers, recover, run]) {
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("Runtime handoff mailbox");
      expect(result.stdout).toContain("- issue: handoff file is unreadable JSON");
      expect(result.stdout).toContain("- file: .rph/runtime/handoffs.json");
      expect(result.stdout).toContain("next: repair or restore .rph/runtime/handoffs.json before running agent orchestration");
      expect(result.stderr).not.toContain("SyntaxError");
    }
  }, 10000);

  it("fails closed with a repair hint when handoffs.json contains malformed records", async () => {
    writeRecoveryBriefFixture(root);
    fs.writeFileSync(path.join(root, ".rph", "runtime", "handoffs.json"), JSON.stringify([
      {
        id: "handoff-malformed",
        status: "pending"
      }
    ], null, 2));

    const status = await runCli(["agent", "status"], { cwd: root, env: withoutProviderEnv() });
    const handoffs = await runCli(["agent", "handoffs"], { cwd: root, env: withoutProviderEnv() });
    const recover = await runCli(["agent", "recover"], { cwd: root, env: withoutProviderEnv() });
    const run = await runCli(["agent", "run", "--steps", "1"], { cwd: root, env: withoutProviderEnv() });

    for (const result of [status, handoffs, recover, run]) {
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("Runtime handoff mailbox");
      expect(result.stdout).toContain("- issue: handoff file contains malformed record at index 0");
      expect(result.stdout).toContain("- file: .rph/runtime/handoffs.json");
      expect(result.stdout).toContain("next: repair or restore .rph/runtime/handoffs.json before running agent orchestration");
      expect(result.stderr).not.toContain("SyntaxError");
    }
  }, 10000);

  it("fails closed before handoff mutation commands when handoffs.json is unreadable", async () => {
    writeRecoveryBriefFixture(root);
    const handoffPath = path.join(root, ".rph", "runtime", "handoffs.json");
    fs.writeFileSync(handoffPath, "{not-json");

    const commands = [
      ["agent", "ack", "handoff-corrupt"],
      ["agent", "claim", "handoff-corrupt"],
      ["agent", "heartbeat", "handoff-corrupt"],
      ["agent", "complete", "handoff-corrupt"],
      ["agent", "dead-letter", "handoff-corrupt", "--reason", "corrupt"],
      ["agent", "worker", "run", "handoff-corrupt", "--worker-id", "test-worker"]
    ];

    for (const command of commands) {
      const result = await runCli(command, { cwd: root, env: withoutProviderEnv() });
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("Runtime handoff mailbox");
      expect(result.stdout).toContain("- issue: handoff file is unreadable JSON");
      expect(result.stderr).not.toContain("SyntaxError");
      expect(fs.readFileSync(handoffPath, "utf8")).toBe("{not-json");
    }
  }, 10000);

  it("does not auto-approve external actions during session recovery", async () => {
    writeRecoveryBriefFixture(root);

    const result = await runCli(["agent", "recover"], { cwd: root, env: withoutProviderEnv() });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Session recovery brief");
    expect(result.stdout).toContain("next safe command: /agent approve-action action-recovery");
    expect(result.stdout).toContain("recovery blocked: explicit action required before /agent approve-action action-recovery");

    const approvals = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "action-approvals.json"), "utf8")) as Array<{ id: string; status: string }>;
    expect(approvals.find((record) => record.id === "action-recovery")?.status).toBe("pending");
  }, 10000);

  it("executes one safe local session recovery step", async () => {
    writeSafeRecoveryBriefFixture(root);

    const result = await runCli(["agent", "recover"], { cwd: root, env: withoutProviderEnv() });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Session recovery brief");
    expect(result.stdout).toContain("pending command: /status");
    expect(result.stdout).toContain("recovery step 1/3");
    expect(result.stdout).toContain("recovery action: /status");
    expect(result.stdout).toContain("현재 단계: SETUP");
    expect(result.stdout).toContain("recovery paused: next action unchanged after /status");
  }, 10000);

  it("runs a bounded recovery loop until a paused session is active again", async () => {
    writePausedRecoveryBriefFixture(root);

    const result = await runCli(["agent", "recover", "--steps", "2"], { cwd: root, env: withoutProviderEnv() });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Session recovery brief");
    expect(result.stdout).toContain("next safe command: /resume");
    expect(result.stdout).toContain("recovery step 1/2");
    expect(result.stdout).toContain("recovery action: /resume");
    expect(result.stdout).toContain("워크플로우 재개");
    expect(result.stdout).toContain("recovery complete: no pending recovery action");

    const state = JSON.parse(fs.readFileSync(path.join(root, ".rph", "state.json"), "utf8")) as { paused: boolean };
    expect(state.paused).toBe(false);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "current-session.json"), "utf8")) as {
      status: string;
      blocker: string | null;
    };
    expect(manifest.status).toBe("active");
    expect(manifest.blocker).toBeNull();
  }, 10000);

  it("stops the recovery loop when a safe step fails", async () => {
    writeFailingRecoveryBriefFixture(root);

    const result = await runCli(["agent", "recover", "--steps", "3"], { cwd: root, env: withoutProviderEnv() });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Session recovery brief");
    expect(result.stdout).toContain("recovery step 1/3");
    expect(result.stdout).toContain("recovery action: /agent run --steps nope");
    expect(result.stderr).toContain("expected positive integer, got: nope");

    const manifest = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "current-session.json"), "utf8")) as {
      status: string;
      blocker: string | null;
    };
    expect(manifest.status).toBe("blocked");
    expect(manifest.blocker).toContain("recovery command failed: /agent run --steps nope");
  }, 10000);

  it("routes natural continue through recovery without approving external actions", async () => {
    writeRecoveryBriefFixture(root);

    const result = await runCli(["ask", "--execute", "계속 진행해"], { cwd: root, env: withoutProviderEnv() });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agent action: /agent recover");
    expect(result.stdout).toContain("execution-policy: natural runtime control");
    expect(result.stdout).toContain("next safe command: /agent approve-action action-recovery");
    expect(result.stdout).toContain("recovery blocked: explicit action required before /agent approve-action action-recovery");

    const approvals = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "action-approvals.json"), "utf8")) as Array<{ id: string; status: string }>;
    expect(approvals.find((record) => record.id === "action-recovery")?.status).toBe("pending");
  }, 10000);

  it("routes natural continue through the safe local recovery step", async () => {
    writeSafeRecoveryBriefFixture(root);

    const result = await runCli(["ask", "--execute", "계속 진행해"], { cwd: root, env: withoutProviderEnv() });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agent action: /agent recover");
    expect(result.stdout).toContain("execution-policy: natural runtime control");
    expect(result.stdout).toContain("pending command: /status");
    expect(result.stdout).toContain("recovery step 1/3");
    expect(result.stdout).toContain("recovery action: /status");
    expect(result.stdout).toContain("현재 단계: SETUP");
    expect(result.stdout).toContain("recovery paused: next action unchanged after /status");
  }, 10000);

  it("blocks queued handoffs whose next command violates the target role contract", async () => {
    const handoffPath = path.join(root, ".rph", "runtime", "handoffs.json");
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(handoffPath, JSON.stringify([
      {
        id: "handoff-invalid-command",
        sessionId: "session-test",
        status: "pending",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        packet: {
          fromAgent: "Orchestrator",
          toAgent: "FE",
          stage: "SETUP",
          summary: "Invalid command should not run in FE lane.",
          artifactRefs: [],
          acceptanceCriteria: ["Invalid command is blocked"],
          blockers: [],
          nextCommand: "/be spec --ai",
          resumeCursor: "stage:SETUP",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      }
    ], null, 2));

    const result = await runCli(["agent", "run", "--steps", "1"], { cwd: root });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("orchestration blocked: handoff handoff-invalid-command violates role contract");
    expect(result.stdout).toContain("nextCommand /be spec --ai is not allowed for FE");
    const state = JSON.parse(fs.readFileSync(path.join(root, ".rph", "state.json"), "utf8")) as {
      currentStage: string;
    };
    const handoffs = JSON.parse(fs.readFileSync(handoffPath, "utf8")) as Array<{ status: string }>;
    const manifest = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "current-session.json"), "utf8")) as {
      status?: string;
      waitCondition?: {
        kind: string;
      } | null;
    };
    expect(state.currentStage).toBe("SETUP");
    expect(handoffs[0].status).toBe("pending");
    expect(manifest.status).toBe("blocked");
    expect(manifest.waitCondition?.kind).toBe("blocked");
  }, 10000);

  it("blocks queued handoffs until the workflow reaches the required stage", async () => {
    const handoffPath = path.join(root, ".rph", "runtime", "handoffs.json");
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(handoffPath, JSON.stringify([
      {
        id: "handoff-stage-mismatch",
        sessionId: "session-test",
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        packet: {
          fromAgent: "PM",
          toAgent: "FE",
          stage: "FE_SPEC",
          summary: "FE must wait until PM/PD prerequisites are complete.",
          artifactRefs: ["document:requirements"],
          acceptanceCriteria: ["stage ordering is preserved"],
          blockers: [],
          nextCommand: "/fe spec --ai",
          resumeCursor: "stage:FE_SPEC",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      }
    ], null, 2));

    const result = await runCli(["agent", "run", "--steps", "1"], { cwd: root, env: withoutProviderEnv() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("orchestration blocked: handoff handoff-stage-mismatch waits for stage FE_SPEC");
    const state = JSON.parse(fs.readFileSync(path.join(root, ".rph", "state.json"), "utf8")) as { currentStage: string };
    expect(state.currentStage).toBe("SETUP");
    const handoffs = JSON.parse(fs.readFileSync(handoffPath, "utf8")) as Array<{ status: string; laneRunId?: string }>;
    expect(handoffs[0].status).toBe("pending");
    expect(handoffs[0].laneRunId).toBeUndefined();
    const laneDir = path.join(root, ".rph", "runtime", "lanes");
    const laneFiles = fs.existsSync(laneDir) ? fs.readdirSync(laneDir).filter((file) => file.endsWith(".json")) : [];
    expect(laneFiles).toHaveLength(0);
  }, 10000);

  it("runs conversational continue intent through the local orchestration loop", async () => {
    writeOpenAiEnv(root, "https://example.invalid/v1");

    const result = await runCli(["shell"], {
      cwd: root,
      stdinChunks: [
        { text: "계속 진행해\n", delayMs: 0 },
        { text: "/exit\n", delayMs: 50 }
      ],
      preloadFetchMarkdown: "# 제품 정의서\n\n## 제품명\n자연어 계속 SaaS\n\n## 한 줄 설명\n자연어 continue가 안전한 로컬 오케스트레이션으로 이어진다."
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agent proposed command: /agent run --steps 6");
    expect(result.stdout).toContain("agent action: /agent run --steps 6");
    expect(result.stdout).toContain("execution-policy: natural runtime control");
    expect(result.stdout).toContain("orchestration loop: max_steps=6");
    expect(result.stdout).toContain("orchestration blocked: user approval required: /pm approve product-definition");
    const state = JSON.parse(fs.readFileSync(path.join(root, ".rph", "state.json"), "utf8")) as {
      currentStage: string;
    };
    const productDefinition = fs.readFileSync(path.join(root, ".rph", "documents", "product-definition", "v1.0.0.md"), "utf8");
    expect(state.currentStage).toBe("PM_PRODUCT_DEFINITION_REVIEW");
    expect(productDefinition).toContain("자연어 계속 SaaS");
  }, 10000);

  it("runs ask --execute start intent as the PM workflow start command", async () => {
    const result = await runCli(["ask", "--execute", "시작해"], { cwd: root });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agent action: /pm start");
    expect(result.stdout).toContain("execution-policy: natural runtime control");
    expect(result.stdout).toContain("PM 워크플로우 시작");
    const state = JSON.parse(fs.readFileSync(path.join(root, ".rph", "state.json"), "utf8")) as {
      currentStage: string;
    };
    expect(state.currentStage).toBe("PM_PRODUCT_DEFINITION_INTERVIEW");
  }, 10000);

  it("runs ask --execute status intent as the status command", async () => {
    const result = await runCli(["ask", "--execute", "현재 상태 보여줘"], { cwd: root, env: withoutProviderEnv() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agent action: /status");
    expect(result.stdout).toContain("execution-policy: natural runtime control");
    expect(result.stdout).toContain("Harness readiness");
    expect(result.stdout).not.toContain("agent proposed command");
  }, 10000);

  it("runs product-definition natural intent as PM start from setup", async () => {
    const result = await runCli(["ask", "--execute", "제품 정의 시작해줘"], { cwd: root, env: withoutProviderEnv() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agent action: /pm start");
    expect(result.stdout).toContain("execution-policy: natural runtime control");
    expect(result.stdout).toContain("PM 워크플로우 시작");
    const state = JSON.parse(fs.readFileSync(path.join(root, ".rph", "state.json"), "utf8")) as {
      currentStage: string;
    };
    expect(state.currentStage).toBe("PM_PRODUCT_DEFINITION_INTERVIEW");
  }, 10000);

  it("runs ask --execute continue intent and stops at the approval gate", async () => {
    writeOpenAiEnv(root, "https://example.invalid/v1");

    const result = await runCli(["ask", "--execute", "계속 진행해"], {
      cwd: root,
      preloadFetchMarkdown: "# 제품 정의서\n\n## 제품명\n자연어 ask 계속 SaaS\n\n## 한 줄 설명\nask execute continue가 승인 게이트에서 멈춘다."
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agent action: /agent run --steps 6");
    expect(result.stdout).toContain("execution-policy: natural runtime control");
    expect(result.stdout).toContain("orchestration loop: max_steps=6");
    expect(result.stdout).toContain("orchestration blocked: user approval required: /pm approve product-definition");
    const state = JSON.parse(fs.readFileSync(path.join(root, ".rph", "state.json"), "utf8")) as {
      currentStage: string;
    };
    const manifest = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "current-session.json"), "utf8")) as {
      status?: string;
      blocker?: string | null;
    };
    expect(state.currentStage).toBe("PM_PRODUCT_DEFINITION_REVIEW");
    expect(manifest.status).toBe("blocked");
    expect(manifest.blocker).toContain("user approval required");
  }, 10000);

  it("runs expanded continue phrasing through the natural control path", async () => {
    writeOpenAiEnv(root, "https://example.invalid/v1");

    const result = await runCli(["ask", "--execute", "이어서 진행해"], {
      cwd: root,
      preloadFetchMarkdown: "# 제품 정의서\n\n## 제품명\n확장 자연어 계속 SaaS\n\n## 한 줄 설명\n확장된 continue 표현도 안전한 로컬 오케스트레이션으로 이어진다."
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agent action: /agent run --steps 6");
    expect(result.stdout).toContain("execution-policy: natural runtime control");
    expect(result.stdout).toContain("orchestration blocked: user approval required: /pm approve product-definition");
    const state = JSON.parse(fs.readFileSync(path.join(root, ".rph", "state.json"), "utf8")) as {
      currentStage: string;
    };
    expect(state.currentStage).toBe("PM_PRODUCT_DEFINITION_REVIEW");
  }, 10000);

  it("routes bare English continue intent through the natural control path", async () => {
    writeOpenAiEnv(root, "https://example.invalid/v1");

    const result = await runCli(["continue"], {
      cwd: root,
      preloadFetchMarkdown: "# 제품 정의서\n\n## 제품명\nBare Continue SaaS\n\n## 한 줄 설명\nbare English continue도 runtime control로 동작한다."
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agent action: /agent run --steps 6");
    expect(result.stdout).toContain("execution-policy: natural runtime control");
    expect(result.stdout).toContain("orchestration blocked: user approval required: /pm approve product-definition");
    const state = JSON.parse(fs.readFileSync(path.join(root, ".rph", "state.json"), "utf8")) as {
      currentStage: string;
    };
    expect(state.currentStage).toBe("PM_PRODUCT_DEFINITION_REVIEW");
  }, 10000);

  it("does not execute negated continue text through ask --execute", async () => {
    const result = await runCli(["ask", "--execute", "계속하지마"], { cwd: root });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("auto-run: blocked because the workflow-control intent is not an exact execution phrase");
    expect(result.stdout).not.toContain("agent action: /agent run --steps 6");
    const state = JSON.parse(fs.readFileSync(path.join(root, ".rph", "state.json"), "utf8")) as {
      currentStage: string;
    };
    expect(state.currentStage).toBe("SETUP");
  }, 10000);

  it("runs local orchestration steps and stops at the approval gate", async () => {
    writeOpenAiEnv(root, "https://example.invalid/v1");

    const result = await runCli(["agent", "run", "--steps", "3"], {
      cwd: root,
      preloadFetchMarkdown: "# 제품 정의서\n\n## 제품명\n승인 게이트 SaaS\n\n## 한 줄 설명\n승인 전까지 자동 실행되는 하네스"
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("orchestrator step 1: /next --execute");
    expect(result.stdout).toContain("orchestrator step 2: /pm draft product-definition --ai");
    expect(result.stdout).toContain("orchestration blocked: user approval required: /pm approve product-definition");
    const state = JSON.parse(fs.readFileSync(path.join(root, ".rph", "state.json"), "utf8")) as {
      currentStage: string;
    };
    const productDefinition = fs.readFileSync(path.join(root, ".rph", "documents", "product-definition", "v1.0.0.md"), "utf8");
    const manifest = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "current-session.json"), "utf8")) as {
      status?: string;
      blocker?: string | null;
    };
    expect(state.currentStage).toBe("PM_PRODUCT_DEFINITION_REVIEW");
    expect(manifest.status).toBe("blocked");
    expect(manifest.blocker).toContain("user approval required");
    expect(productDefinition).toContain("승인 게이트 SaaS");
    expect(productDefinition).not.toMatch(/\bTBD\b/);
  }, 10000);

  it("runs ask --execute --loop through local orchestration and stops at the approval gate", async () => {
    const result = await runCli(["ask", "--execute", "--loop", "이 아이디어를 MVP spec과 FE/BE 작업으로 만들어줘: 루프 검증 SaaS"], {
      cwd: root
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agent action: /productize");
    expect(result.stdout).toContain("Productize golden path complete");
    expect(result.stdout).toContain("orchestration loop: max_steps=6");
    expect(result.stdout).toContain("orchestration blocked: user approval required: /pm approve product-definition");
    const state = JSON.parse(fs.readFileSync(path.join(root, ".rph", "state.json"), "utf8")) as {
      currentStage: string;
    };
    expect(state.currentStage).toBe("PM_PRODUCT_DEFINITION_REVIEW");
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

  it("appends ordered runtime journal records across shell restarts", async () => {
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
    const journalPath = path.join(root, ".rph", "runtime", "sessions", `${firstManifest.sessionId}.jsonl`);
    const firstRecords = fs.readFileSync(journalPath, "utf8").trim().split("\n").map((line) => JSON.parse(line) as {
      sequence: number;
      sessionId: string;
      manifest: { lastCommand?: string };
    });

    const second = await runCli(["shell"], {
      cwd: root,
      stdinChunks: [
        { text: "/status\n", delayMs: 0 },
        { text: "/exit\n", delayMs: 50 }
      ]
    });
    expect(second.exitCode).toBe(0);
    const secondManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { sessionId: string };
    expect(secondManifest.sessionId).toBe(firstManifest.sessionId);

    const records = fs.readFileSync(journalPath, "utf8").trim().split("\n").map((line) => JSON.parse(line) as {
      sequence: number;
      sessionId: string;
      manifest: { lastCommand?: string; lastCommandOk?: boolean };
    });
    expect(records.length).toBeGreaterThan(firstRecords.length);
    expect(records.map((record) => record.sequence)).toEqual(records.map((_, index) => index + 1));
    expect(records[0].sessionId).toBe(firstManifest.sessionId);
    expect(records.at(-1)?.manifest.lastCommand).toBe("/status");
    expect(records.at(-1)?.manifest.lastCommandOk).toBe(true);
  }, 10000);

  it("routes exact natural continue while paused through recovery resume", async () => {
    writeOpenAiEnv(root, "https://example.invalid/v1");

    const result = await runCli(["shell"], {
      cwd: root,
      stdinChunks: [
        { text: "/pause\n", delayMs: 0 },
        { text: "계속 진행해\n", delayMs: 50 },
        { text: "/exit\n", delayMs: 50 }
      ]
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agent action: /agent recover");
    expect(result.stdout).toContain("next safe command: /resume");
    expect(result.stdout).toContain("recovery action: /resume");
    expect(result.stdout).toContain("워크플로우 재개");
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
      findings: string[];
    };
    const qaMarkdown = fs.readFileSync(path.join(root, ".rph", "qa", "pr-1-report.md"), "utf8");

    expect(productDefinition).not.toMatch(/\bTBD\b/);
    expect(prBody).not.toMatch(/\bTBD\b/);
    expect(qaReport.requirementStatus).toBe("matched");
    expect(qaReport.designStatus).toBe("matched");
    expect(qaReport.apiContractStatus).toBe("matched");
    expect(qaReport.securityStatus).toBe("unknown");
    expect(qaReport.accessibilityStatus).toBe("unknown");
    expect(qaReport.findings).toContain("Release blocker: security status is unknown until a dedicated security review clears it or records a risk");
    expect(qaReport.findings).toContain("Release blocker: accessibility status is unknown until a dedicated accessibility review clears it or records a risk");
    expect(qaMarkdown).toContain("- security_status: unknown");
    expect(qaMarkdown).toContain("- accessibility_status: unknown");
    expect(qaMarkdown).toContain("Release blocker: security status is unknown until a dedicated security review clears it or records a risk");
    expect(qaMarkdown).toContain("Release blocker: accessibility status is unknown until a dedicated accessibility review clears it or records a risk");
  });

  it("keeps natural-language productization requests conversational unless explicitly executed", async () => {
    const result = await runCli(["ask", "이 아이디어를 MVP spec과 FE/BE 작업으로 만들어줘: AI 회의록 액션아이템 SaaS"], { cwd: root });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agent proposed command: /productize");
    expect(result.stdout).toContain("auto-run: skipped for conversational input");
    expect(fs.existsSync(path.join(root, ".rph", "golden-path", "latest.json"))).toBe(false);
  });

  it("treats bare multi-word natural language as one-shot chat", async () => {
    const captureFile = path.join(root, "bare-chat-capture.json");
    writeOpenAiEnv(root, "https://example.invalid/v1");

    const result = await runCli(["다음에", "뭐", "하면", "돼?"], {
      cwd: root,
      preloadFetchCapture: captureFile
    });

    expect(result.exitCode).toBe(0);
    expect(readCapturedPrompt(captureFile)).toContain("다음에 뭐 하면 돼?");
    expect(result.stdout + result.stderr).not.toMatch(/unknown command/i);
  }, 10000);

  it("continues one-shot ask inside the active runtime chat session", async () => {
    const firstCapture = path.join(root, "ask-first-capture.json");
    const secondCapture = path.join(root, "ask-second-capture.json");
    writeOpenAiEnv(root, "https://example.invalid/v1");

    const first = await runCli(["ask", "첫 질문"], {
      cwd: root,
      preloadFetchCapture: firstCapture
    });

    expect(first.exitCode).toBe(0);
    expect(readCapturedPrompt(firstCapture)).toContain("No prior messages in this runtime session.");
    const firstManifest = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "current-session.json"), "utf8")) as {
      sessionId: string;
    };

    const second = await runCli(["ask", "두 번째 질문"], {
      cwd: root,
      preloadFetchCapture: secondCapture
    });

    expect(second.exitCode).toBe(0);
    const secondPrompt = readCapturedPrompt(secondCapture);
    expect(secondPrompt).toContain("Runtime chat history:");
    expect(secondPrompt).toContain("USER: 첫 질문");
    expect(secondPrompt).toContain("ASSISTANT: # next");
    expect(secondPrompt).toContain("Current user message:\n두 번째 질문");
    const secondManifest = JSON.parse(fs.readFileSync(path.join(root, ".rph", "runtime", "current-session.json"), "utf8")) as {
      sessionId: string;
    };
    expect(secondManifest.sessionId).toBe(firstManifest.sessionId);
    const chatFile = path.join(root, ".rph", "ai", "chat", `${firstManifest.sessionId}.jsonl`);
    const chatRecords = fs.readFileSync(chatFile, "utf8").trim().split("\n");
    expect(chatRecords).toHaveLength(2);
  }, 10000);

  it("routes explicitly executed natural-language productization requests through rph ask", async () => {
    const result = await runCli(["ask", "--execute", "이 아이디어를 MVP spec과 FE/BE 작업으로 만들어줘: AI 회의록 액션아이템 SaaS"], { cwd: root });

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

  it("continues the productize package through status and first natural-language approval", async () => {
    const productize = await runCli(["ask", "--execute", "이 아이디어를 MVP spec과 FE/BE 작업으로 만들어줘: 승인 게이트 SaaS"], {
      cwd: root
    });
    expect(productize.exitCode).toBe(0);

    const statusBefore = await runCli(["status"], { cwd: root });
    expect(statusBefore.exitCode).toBe(0);
    expect(statusBefore.stdout).toContain("RPH status");
    expect(statusBefore.stdout).toContain("- current: PM_PRODUCT_DEFINITION_REVIEW");
    expect(statusBefore.stdout).toContain("- next: /docs approve product-definition");
    expect(statusBefore.stdout).toContain("- blocked: required approval missing: product-definition");
    expect(statusBefore.stdout).toContain("- chat: rph ask \"다음에 뭐 하면 돼?\"");
    expect(statusBefore.stdout).toContain("현재 단계: PM_PRODUCT_DEFINITION_REVIEW");
    expect(statusBefore.stdout).toContain("승인 필요: product-definition");

    const approve = await runCli(["ask", "--execute", "승인해"], { cwd: root });
    expect(approve.exitCode).toBe(0);
    expect(approve.stdout).toContain("natural approval: /docs approve product-definition");
    expect(approve.stdout).toContain("[승인 완료] product-definition");

    const statusAfter = await runCli(["status"], { cwd: root });
    expect(statusAfter.exitCode).toBe(0);
    expect(statusAfter.stdout).toContain("현재 단계: PM_PRODUCT_DEFINITION_APPROVED");
    expect(statusAfter.stdout).toContain("승인 완료: product-definition");
  });

  it("bootstraps an uninitialized folder from one productize request", async () => {
    const uninitializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-productize-bootstrap-"));
    try {
      const result = await runCli(["ask", "--execute", "이 아이디어를 MVP spec과 FE/BE 작업으로 만들어줘: 고객 피드백 분석 SaaS"], {
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

  it("keeps setup auto --guide read-only in an uninitialized directory", async () => {
    const uninitializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-setup-bootstrap-"));
    try {
      const result = await runCli(["setup", "auto", "--guide"], { cwd: uninitializedRoot });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("파일 변경 없음");
      expect(fs.existsSync(path.join(uninitializedRoot, ".rph"))).toBe(false);
    } finally {
      fs.rmSync(uninitializedRoot, { recursive: true, force: true });
    }
  });

  it("shows setup guidance instead of failing status in an uninitialized directory", async () => {
    const uninitializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-status-bootstrap-"));
    try {
      const result = await runCli(["status"], {
        cwd: uninitializedRoot,
        env: withoutProviderEnv()
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toContain("RPH project not initialized");
      expect(result.stdout).toContain("RPH project: not initialized");
      expect(result.stdout).toContain("RPH Setup Assistant");
      expect(result.stdout).toContain("rph setup auto");
      expect(fs.existsSync(path.join(uninitializedRoot, ".rph"))).toBe(false);
    } finally {
      fs.rmSync(uninitializedRoot, { recursive: true, force: true });
    }
  });

  it("guides plain ask to setup instead of failing when no AI provider is configured", async () => {
    const uninitializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-ask-bootstrap-"));
    try {
      const result = await runCli(["ask", "다음 뭐해?"], {
        cwd: uninitializedRoot,
        env: withoutProviderEnv()
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toContain("no configured AI provider");
      expect(result.stdout).toContain("AI agent is not connected yet.");
      expect(result.stdout).toContain("agent proposed command: rph setup auto");
      expect(result.stdout).toContain("RPH Setup Assistant");
      expect(fs.existsSync(path.join(uninitializedRoot, ".rph"))).toBe(false);
    } finally {
      fs.rmSync(uninitializedRoot, { recursive: true, force: true });
    }
  });

  it("allows setup auto to bootstrap an uninitialized directory", async () => {
    const uninitializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-setup-bootstrap-"));
    try {
      const result = await runCli(["setup", "auto"], { cwd: uninitializedRoot });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("RPH project initialized");
      expect(fs.existsSync(path.join(uninitializedRoot, ".rph", "project.json"))).toBe(true);
    } finally {
      fs.rmSync(uninitializedRoot, { recursive: true, force: true });
    }
  });

  it("fails setup auto --live when a selected provider cannot be verified", async () => {
    const uninitializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-setup-live-fail-"));
    try {
      const result = await runCli(["setup", "auto", "--from-env", "--live", "--ai", "openai", "--mcp", "none"], {
        cwd: uninitializedRoot,
        env: withoutProviderEnv()
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("ai:openai trust=unverified:none required environment variables are missing");
      expect(result.stdout).toContain("Recovery hints");
      expect(result.stdout).toContain("repair: rph setup repair --live");
      expect(result.stdout).toContain("cause: missing OPENAI_API_KEY");
      expect(result.stdout).toContain("next: .env에 OPENAI_API_KEY 추가 또는 rph setup auto로 다시 입력");
      expect(result.stdout).toContain("retry: rph setup auto --live --ai openai --mcp none");
      expect(result.stderr).toContain("setup live check failed");
      expect(fs.existsSync(path.join(uninitializedRoot, ".rph", "connections", "latest.json"))).toBe(true);
    } finally {
      fs.rmSync(uninitializedRoot, { recursive: true, force: true });
    }
  }, 10000);

  it("repairs failed setup live checks from the latest report without widening scope", async () => {
    const uninitializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-setup-repair-"));
    try {
      const failed = await runCli(["setup", "auto", "--from-env", "--live", "--ai", "openai", "--mcp", "none"], {
        cwd: uninitializedRoot,
        env: withoutProviderEnv()
      });
      expect(failed.exitCode).toBe(1);
      expect(failed.stdout).toContain("ai:openai trust=unverified:none required environment variables are missing");

      const repaired = await runCli(["setup", "repair", "--from-env", "--live"], {
        cwd: uninitializedRoot,
        env: {
          ...withoutProviderEnv(),
          OPENAI_API_KEY: "test-openai-repair",
          GEMINI_API_KEY: "test-gemini-should-not-run"
        },
        preloadFetchOpenAiConnectionSuccess: true
      });

      expect(repaired.exitCode).toBe(0);
      expect(repaired.stderr).toBe("");
      expect(repaired.stdout).toContain("RPH Setup Repair");
      expect(repaired.stdout).toContain("failed connections from latest report: ai:openai");
      expect(repaired.stdout).toContain("repair scope: 최신 실패 연결만 재검증합니다");
      expect(repaired.stdout).toContain("ai:openai trust=protocol-ready:protocol-tool-call");
      expect(repaired.stdout).toContain("setup live check passed");
      expect(repaired.stdout).not.toContain("ai:gemini");
      const report = JSON.parse(fs.readFileSync(path.join(uninitializedRoot, ".rph", "connections", "latest.json"), "utf8")) as {
        checks: Array<{ kind: string; id: string; status: string }>;
      };
      expect(report.checks.map(({ kind, id, status }) => ({ kind, id, status }))).toEqual([
        { kind: "ai", id: "openai", status: "passed" }
      ]);
      const rawReport = fs.readFileSync(path.join(uninitializedRoot, ".rph", "connections", "latest.json"), "utf8");
      expect(rawReport).not.toContain("test-openai-repair");
    } finally {
      fs.rmSync(uninitializedRoot, { recursive: true, force: true });
    }
  }, 15000);

  it("prints protocol-specific recovery hints when setup auto --live fails after MCP initialize", async () => {
    const uninitializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-setup-live-mcp-protocol-fail-"));
    try {
      const result = await runCli(["setup", "auto", "--from-env", "--live", "--ai", "none", "--mcp", "stitch"], {
        cwd: uninitializedRoot,
        env: {
          ...withoutProviderEnv(),
          STITCH_API_KEY: "test-stitch"
        },
        preloadFetchMcpToolsListFailure: true
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("mcp:stitch trust=protocol-partial:credential-probe");
      expect(result.stdout).toContain("Proof steps");
      expect(result.stdout).toContain("transport=passed -> credential-probe=passed -> protocol-tools-list=failed");
      expect(result.stdout).toContain("Recovery hints");
      expect(result.stdout).toContain("cause: protocol-tools-list failed:");
      expect(result.stdout).toContain("next: MCP 서버 URL, token, protocol handshake 설정 확인");
      expect(result.stdout).toContain("retry: rph setup auto --live --ai none --mcp stitch");
      expect(result.stdout).not.toContain("First action verified");
      expect(result.stderr).toContain("setup live check failed");
    } finally {
      fs.rmSync(uninitializedRoot, { recursive: true, force: true });
    }
  }, 10000);

  it("prints recovery hints from doctor --live when configured connections are not verified", async () => {
    writeEmptyHarnessConfig(root);

    const result = await runCli(["doctor", "--live"], {
      cwd: root,
      env: withoutProviderEnv()
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("runtime config loaded");
    expect(result.stdout).toContain("ai:openai trust=unverified:none required environment variables are missing");
    expect(result.stdout).toContain("Recovery hints");
    expect(result.stdout).toContain("cause: missing OPENAI_API_KEY");
    expect(result.stdout).toContain("retry: rph setup auto --live --ai openai --mcp none");
    expect(result.stdout).toContain("report:");
  }, 10000);

  it("prints recovery hints from direct ai and mcp live tests", async () => {
    writeEmptyHarnessConfig(root);

    const ai = await runCli(["ai", "test", "openai"], {
      cwd: root,
      env: withoutProviderEnv()
    });
    expect(ai.exitCode).toBe(0);
    expect(ai.stdout).toContain("ai:openai trust=unverified:none required environment variables are missing");
    expect(ai.stdout).toContain("Recovery hints");
    expect(ai.stdout).toContain("retry: rph setup auto --live --ai openai --mcp none");

    const mcp = await runCli(["mcp", "test", "github"], {
      cwd: root,
      env: withoutProviderEnv()
    });
    expect(mcp.exitCode).toBe(0);
    expect(mcp.stdout).toContain("mcp:github trust=unverified:none required environment variables are missing");
    expect(mcp.stdout).toContain("Recovery hints");
    expect(mcp.stdout).toContain("cause: missing GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO");
    expect(mcp.stdout).toContain("retry: rph setup auto --live --ai none --mcp github");
  }, 10000);

  it("uses GitHub CLI auth as a non-secret token source during setup without persisting the token", async () => {
    const uninitializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-setup-gh-cli-source-"));
    const binDir = path.join(uninitializedRoot, "bin");
    fs.mkdirSync(binDir, { recursive: true });
    const ghBin = path.join(binDir, "gh");
    fs.writeFileSync(ghBin, [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "if [[ \"${1:-}\" == \"auth\" && \"${2:-}\" == \"status\" ]]; then exit 0; fi",
      "if [[ \"${1:-}\" == \"auth\" && \"${2:-}\" == \"token\" ]]; then echo gh-cli-secret; exit 0; fi",
      "if [[ \"${1:-}\" == \"--version\" ]]; then echo 'gh version 2.0.0'; exit 0; fi",
      "if [[ \"${1:-}\" == \"repo\" && \"${2:-}\" == \"view\" && \"${3:-}\" == \"king/real-product-harness\" ]]; then",
      "  cat <<'JSON'",
      JSON.stringify({ nameWithOwner: "king/real-product-harness", viewerPermission: "ADMIN" }),
      "JSON",
      "  exit 0",
      "fi",
      "echo \"unexpected gh args: $*\" >&2",
      "exit 1"
    ].join("\n"));
    fs.chmodSync(ghBin, 0o755);
    const gitBin = path.join(binDir, "git");
    fs.writeFileSync(gitBin, [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "if [[ \"${1:-}\" == \"config\" && \"${2:-}\" == \"--get\" && \"${3:-}\" == \"remote.origin.url\" ]]; then",
      "  echo https://github.com/king/real-product-harness.git",
      "  exit 0",
      "fi",
      "echo \"unexpected git args: $*\" >&2",
      "exit 1"
    ].join("\n"));
    fs.chmodSync(gitBin, 0o755);
    try {
      const result = await runCli(["setup", "auto", "--from-env", "--live", "--ai", "none", "--mcp", "github"], {
        cwd: uninitializedRoot,
        env: {
          ...withoutProviderEnv(),
          PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
          GITHUB_TOKEN: undefined,
          GH_TOKEN: undefined,
          GITHUB_TOKEN_SOURCE: undefined,
          GITHUB_OWNER: undefined,
          GITHUB_REPO: undefined,
          RPH_GH_BIN: ghBin
        },
        preloadFetchGitHubRepoSuccess: true
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("GITHUB_TOKEN: GitHub CLI 인증 감지");
      expect(result.stdout).toContain("mcp:github trust=adapter-write-ready:credential-probe");
      expect(result.stdout).toContain("setup live check passed");
      const envText = fs.readFileSync(path.join(uninitializedRoot, ".env"), "utf8");
      expect(envText).toContain("GITHUB_TOKEN_SOURCE=gh-cli");
      expect(envText).toContain("GITHUB_OWNER=king");
      expect(envText).toContain("GITHUB_REPO=real-product-harness");
      expect(envText).not.toMatch(/^GITHUB_TOKEN=/m);
      expect(envText).not.toContain("gh-cli-secret");
    } finally {
      fs.rmSync(uninitializedRoot, { recursive: true, force: true });
    }
  }, 10000);

    it("passes setup auto --live for an explicitly selected provider while others are missing", async () => {
    const uninitializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-setup-live-openai-pass-"));
    try {
      const result = await runCli(["setup", "auto", "--from-env", "--live", "--ai", "openai", "--mcp", "none"], {
        cwd: uninitializedRoot,
        env: {
          ...withoutProviderEnv(),
          OPENAI_API_KEY: "test-openai"
        },
        preloadFetchOpenAiConnectionSuccess: true
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("ai:openai");
      expect(result.stdout).toContain("ai:openai trust=protocol-ready:protocol-tool-call");
      expect(result.stdout).toContain("Verified targets");
      expect(result.stdout).toContain("ai:openai openai gpt-5.4 type=ai-provider target_id=gpt-5.4 verified_by=protocol-tool-call");
      expect(result.stdout).toContain("First action verified");
      expect(result.stdout).toContain("ai:openai generated smoke response with gpt-5.4 | detail=openai.generation_smoke target_id=gpt-5.4 verified_by=protocol-tool-call");
      expect(result.stdout).toContain("Proof steps");
      expect(result.stdout).toContain("ai:openai verified through protocol action: transport=passed -> credential-probe=passed -> protocol-tool-call=passed");
      expect(result.stdout).toContain("Ready actions");
      expect(result.stdout).toContain('ai:openai chat: /ai run --provider openai --prompt "제품 요구사항 5개 정리해줘"');
      expect(result.stdout).toContain("workflow: /pm start 또는 제품 아이디어를 그냥 입력");
      expect(result.stdout).toContain("setup live check passed");
      expect(result.stdout).not.toContain("ai:anthropic");
      expect(result.stdout).not.toContain("ai:gemini");
      expect(result.stdout).not.toContain("mcp:notion");
      const report = JSON.parse(fs.readFileSync(path.join(uninitializedRoot, ".rph", "connections", "latest.json"), "utf8")) as {
        checks: Array<{
          kind: string;
          id: string;
          status: string;
          identity?: {
            type: string;
            label: string;
            targetId: string;
            verifiedBy: string;
            source: string;
          };
          firstActionProof?: {
            action: string;
            label: string;
            targetId: string;
            verifiedBy: string;
            endpoint?: string;
          };
          readiness?: { mode?: string; provenStage?: string };
        }>;
        onboardingProof: Array<{
          kind: string;
          id: string;
          captured: boolean;
          verified: boolean;
          trustCategory: string;
          provenStage: string;
          identity?: {
            type: string;
            label: string;
            targetId: string;
            verifiedBy: string;
            source: string;
          };
          firstActionProof?: {
            action: string;
            label: string;
            targetId: string;
            verifiedBy: string;
            endpoint?: string;
          };
          proof?: {
            readinessMode?: string;
            credentialStage?: string;
            protocolStage?: string;
          };
        }>;
      };
      expect(report.checks.map(({ kind, id, status }) => ({ kind, id, status }))).toEqual([{ kind: "ai", id: "openai", status: "passed" }]);
      expect(report.checks[0].readiness).toMatchObject({
        mode: "protocol-ready",
        provenStage: "protocol-tool-call"
      });
      expect(report.checks[0].identity).toMatchObject({
        type: "ai-provider",
        label: "openai gpt-5.4",
        targetId: "gpt-5.4",
        verifiedBy: "protocol-tool-call",
        source: "configuration"
      });
      expect(report.checks[0].firstActionProof).toMatchObject({
        action: "openai.generation_smoke",
        targetId: "gpt-5.4",
        verifiedBy: "protocol-tool-call",
        endpoint: "https://api.openai.com/v1/responses"
      });
      expect(report.onboardingProof).toEqual([
        expect.objectContaining({
          kind: "ai",
          id: "openai",
          captured: true,
          verified: true,
          trustCategory: "protocol-ready",
          provenStage: "protocol-tool-call",
          identity: expect.objectContaining({
            type: "ai-provider",
            targetId: "gpt-5.4"
          }),
          firstActionProof: expect.objectContaining({
            action: "openai.generation_smoke",
            targetId: "gpt-5.4"
          }),
          proof: expect.objectContaining({
            readinessMode: "protocol-ready",
            credentialStage: "passed",
            protocolStage: "passed"
          })
        })
      ]);
      const rawReport = fs.readFileSync(path.join(uninitializedRoot, ".rph", "connections", "latest.json"), "utf8");
      expect(rawReport).not.toContain("test-openai");
      expect(rawReport).not.toContain("OPENAI_API_KEY=test-openai");
      const status = await runCli(["status"], {
        cwd: uninitializedRoot,
        env: withoutProviderEnv()
      });
      expect(status.exitCode).toBe(0);
      expect(status.stdout).toContain("Verified targets");
      expect(status.stdout).toContain("ai:openai openai gpt-5.4 type=ai-provider target_id=gpt-5.4 verified_by=protocol-tool-call");
      expect(status.stdout).toContain("First action verified");
      expect(status.stdout).toContain("ai:openai generated smoke response with gpt-5.4 | detail=openai.generation_smoke target_id=gpt-5.4 verified_by=protocol-tool-call");
    } finally {
      fs.rmSync(uninitializedRoot, { recursive: true, force: true });
    }
    }, 10000);

  it("keeps single-target live provenance scoped to the selected provider and replays that proof on status", async () => {
    const uninitializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-setup-live-openai-provenance-"));
    try {
      const setup = await runCli(["setup", "auto", "--from-env", "--live", "--ai", "openai", "--mcp", "none"], {
        cwd: uninitializedRoot,
        env: {
          ...withoutProviderEnv(),
          OPENAI_API_KEY: "test-openai"
        },
        preloadFetchOpenAiConnectionSuccess: true
      });

      expect(setup.exitCode).toBe(0);
      const report = JSON.parse(fs.readFileSync(path.join(uninitializedRoot, ".rph", "connections", "latest.json"), "utf8")) as {
        provenance: {
          source: string;
          runner: string;
          command: string;
          projectInitialized: boolean;
          selectedTargets: string[];
          checkedTargetCount: number;
        };
      };

      expect(report.provenance).toMatchObject({
        source: "live",
        runner: "cli",
        projectInitialized: true,
        selectedTargets: ["ai:openai"],
        checkedTargetCount: 1
      });
      expect(report.provenance.command).toContain("setup auto");
      expect(report.provenance.command).toContain("--ai openai");
      expect(report.provenance.command).toContain("--mcp none");

      const status = await runCli(["status"], {
        cwd: uninitializedRoot,
        env: withoutProviderEnv()
      });

      expect(status.exitCode).toBe(0);
      expect(status.stdout).toContain("Harness readiness");
      expect(status.stdout).toContain("status=ready");
      expect(status.stdout).toContain("chat=verified");
      expect(status.stdout).toContain("tools=none");
      expect(status.stdout).toContain("Verified targets");
      expect(status.stdout).toContain("ai:openai openai gpt-5.4 type=ai-provider target_id=gpt-5.4 verified_by=protocol-tool-call");
      expect(status.stdout).not.toContain("ai:anthropic");
      expect(status.stdout).not.toContain("mcp:stitch");
    } finally {
      fs.rmSync(uninitializedRoot, { recursive: true, force: true });
    }
  }, 10000);

  it("reports protocol-partial when credential probe passes but generation fails", async () => {
    writeEmptyHarnessConfig(root);

    const result = await runCli(["ai", "test", "openai"], {
      cwd: root,
      env: {
        ...withoutProviderEnv(),
        OPENAI_API_KEY: "test-openai"
      },
      preloadFetchOpenAiGenerationFailure: true
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("ai:openai trust=protocol-partial:credential-probe");
    expect(result.stdout).toContain("generation:");
    expect(result.stdout).toContain("ai:openai credential verified; protocol action failed");
    expect(result.stdout).not.toContain("First action verified");
    expect(result.stdout).not.toContain("generation_smoke");
    const report = JSON.parse(fs.readFileSync(path.join(root, ".rph", "connections", "latest.json"), "utf8")) as {
      checks: Array<{
        kind: string;
        id: string;
        status: string;
        firstActionProof?: unknown;
        readiness?: { mode?: string; provenStage?: string };
      }>;
      onboardingProof: Array<{
        kind: string;
        id: string;
        status: string;
        captured: boolean;
        verified: boolean;
        trustCategory: string;
        provenStage: string;
        firstActionProof?: unknown;
        proof?: {
          readinessMode?: string;
          credentialStage?: string;
          protocolStage?: string;
        };
      }>;
    };
    expect(report.checks).toHaveLength(1);
    expect(report.checks[0]).toMatchObject({
      kind: "ai",
      id: "openai",
      status: "failed",
      readiness: {
        mode: "protocol-partial",
        provenStage: "credential-probe"
      }
    });
    expect(report.checks[0].firstActionProof).toBeUndefined();
    expect(report.onboardingProof[0]).toMatchObject({
      kind: "ai",
      id: "openai",
      status: "failed",
      captured: true,
      verified: false,
      trustCategory: "protocol-partial",
      provenStage: "credential-probe",
      proof: {
        readinessMode: "protocol-partial",
        credentialStage: "passed",
        protocolStage: "failed"
      }
    });
    expect(report.onboardingProof[0].firstActionProof).toBeUndefined();
    const rawReport = fs.readFileSync(path.join(root, ".rph", "connections", "latest.json"), "utf8");
    expect(rawReport).not.toContain("test-openai");
    expect(rawReport).not.toContain("generation_smoke");
  }, 10000);

  it("prints product-language status guidance for non-current connection proof", async () => {
    fs.writeFileSync(path.join(root, ".rph", "config.json"), JSON.stringify(createHarnessConfig({
      OPENAI_API_KEY: "test-openai"
    } as NodeJS.ProcessEnv), null, 2));
    writeConnectionReport(root, [passedOpenAiConnectionCheck("2026-05-26T00:00:00.000Z")], {
      source: "mock",
      runner: "test",
      command: "test fixture",
      projectInitialized: true,
      selectedTargets: ["ai:openai"],
      checkedTargetCount: 1
    });

    const status = await runCli(["status"], { cwd: root, env: withoutProviderEnv() });

    expect(status.exitCode).toBe(0);
    expect(status.stdout).toContain("Harness readiness");
    expect(status.stdout).toContain("status=configured");
    expect(status.stdout).toContain("chat=configured");
    expect(status.stdout).toContain("live_verification=not-current");
    expect(status.stdout).toContain("why=Saved connection evidence came from a non-live run, so it is kept as history only.");
    expect(status.stdout).toContain("next=rph doctor --live");
    expect(status.stdout).toContain("connection_proof=not-current reason=non live source");
    expect(status.stdout).toContain("Last known verification (not current)");
    expect(status.stdout).toContain("ai:openai verified_by=protocol-tool-call");
    expect(status.stdout).not.toContain("next=/doctor --live");
    expect(status.stdout).not.toContain("reason=non-live-source");
  }, 10000);

  it("keeps runtime /status guidance on slash commands while shell status uses rph commands", async () => {
    fs.writeFileSync(path.join(root, ".rph", "config.json"), JSON.stringify(createHarnessConfig({
      OPENAI_API_KEY: "test-openai"
    } as NodeJS.ProcessEnv), null, 2));
    writeConnectionReport(root, [passedOpenAiConnectionCheck("2026-05-26T00:00:00.000Z")], {
      source: "mock",
      runner: "test",
      command: "test fixture",
      projectInitialized: true,
      selectedTargets: ["ai:openai"],
      checkedTargetCount: 1
    });

    const shell = await runCli(["shell"], {
      cwd: root,
      env: withoutProviderEnv(),
      stdinChunks: [
        { text: "/status\n", delayMs: 0 },
        { text: "/exit\n", delayMs: 50 }
      ]
    });

    expect(shell.exitCode).toBe(0);
    expect(shell.stdout).toContain("Harness readiness");
    expect(shell.stdout).toContain("next=/doctor --live");
    expect(shell.stdout).not.toContain("next=rph doctor --live");
  }, 10000);

  it("keeps fresh runtime /status setup guidance on slash commands", async () => {
    const uninitializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-fresh-status-surface-"));
    try {
      const shell = await runCli(["shell"], {
        cwd: uninitializedRoot,
        env: withoutProviderEnv(),
        stdinChunks: [
          { text: "/status\n", delayMs: 0 },
          { text: "/exit\n", delayMs: 50 }
        ]
      });

      expect(shell.exitCode).toBe(0);
      expect(shell.stdout).toContain("RPH project: not initialized");
      expect(shell.stdout).toContain("- /setup auto");
      expect(shell.stdout).toContain("- /setup auto --live");
      expect(shell.stdout).toContain("- /pm start");
      expect(shell.stdout).not.toContain("next:\n- rph setup auto");
    } finally {
      fs.rmSync(uninitializedRoot, { recursive: true, force: true });
    }
  }, 10000);

  it("connects setup auto --live to a real ask turn through the selected provider", async () => {
    const uninitializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-setup-live-chat-"));
    try {
      const setup = await runCli(["setup", "auto", "--from-env", "--live", "--ai", "openai", "--mcp", "none"], {
        cwd: uninitializedRoot,
        env: {
          ...withoutProviderEnv(),
          OPENAI_API_KEY: "test-openai"
        },
        preloadFetchOpenAiConnectionSuccess: true
      });
      expect(setup.exitCode).toBe(0);
      expect(setup.stdout).toContain("setup live check passed");

      const ask = await runCli(["ask", "연결 확인 인사해줘"], {
        cwd: uninitializedRoot,
        env: withoutProviderEnv(),
        preloadFetchOpenAiConnectionSuccess: true
      });

      expect(ask.exitCode).toBe(0);
      expect(ask.stderr).toBe("");
      expect(ask.stdout).toContain("OK");
      const manifest = JSON.parse(fs.readFileSync(path.join(uninitializedRoot, ".rph", "runtime", "current-session.json"), "utf8")) as {
        activeTurn?: {
          status: string;
        };
      };
      expect(manifest.activeTurn?.status).toBe("complete");
    } finally {
      fs.rmSync(uninitializedRoot, { recursive: true, force: true });
    }
  }, 10000);

  it("connects setup auto --live to plain chat and an actual MCP read tool result", async () => {
    const uninitializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-setup-live-mcp-chat-"));
    try {
      const setup = await runCli(["setup", "auto", "--from-env", "--live", "--ai", "openai", "--mcp", "stitch"], {
        cwd: uninitializedRoot,
        env: {
          ...withoutProviderEnv(),
          OPENAI_API_KEY: "test-openai",
          STITCH_API_KEY: "test-stitch"
        },
        preloadFetchMcpRuntime: true
      });
      expect(setup.exitCode).toBe(0);
      expect(setup.stderr).toBe("");
      expect(setup.stdout).toContain("setup live check passed");
      expect(setup.stdout).toContain("ai:openai trust=protocol-ready:protocol-tool-call");
      expect(setup.stdout).toContain("mcp:stitch trust=protocol-ready:protocol-tools-list");
      expect(setup.stdout).toContain("First action verified");

      const ask = await runCli(["ask", "protocol MCP echo tool을 호출해서 acceptance-mcp-ok를 확인해줘"], {
        cwd: uninitializedRoot,
        env: withoutProviderEnv(),
        preloadFetchMcpRuntime: true
      });

      expect(ask.exitCode).toBe(0);
      expect(ask.stderr).toBe("");
      expect(ask.stdout).toContain("Protocol MCP echo returned acceptance-mcp-ok.");
      const manifest = JSON.parse(fs.readFileSync(path.join(uninitializedRoot, ".rph", "runtime", "current-session.json"), "utf8")) as {
        activeTurn?: {
          status: string;
          toolCalls: Array<{ name: string; status: string; observation?: string }>;
        };
        toolTrace?: Array<{ name: string; status: string; observation?: string }>;
      };
      expect(manifest.activeTurn?.status).toBe("complete");
      const stitchCall = manifest.activeTurn?.toolCalls.find((call) => call.name === "mcp.tools.call");
      expect(stitchCall).toMatchObject({ name: "mcp.tools.call", status: "succeeded" });
      expect(stitchCall?.observation).toContain("acceptance-mcp-ok");
      expect(manifest.toolTrace?.some((call) => call.name === "mcp.tools.call" && call.status === "succeeded")).toBe(true);

      const report = JSON.parse(fs.readFileSync(path.join(uninitializedRoot, ".rph", "connections", "latest.json"), "utf8")) as {
        checks: Array<{ kind: string; id: string; status: string; readiness?: { provenStage?: string } }>;
      };
      expect(report.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "ai", id: "openai", status: "passed", readiness: expect.objectContaining({ provenStage: "protocol-tool-call" }) }),
        expect.objectContaining({ kind: "mcp", id: "stitch", status: "passed", readiness: expect.objectContaining({ provenStage: "protocol-tools-list" }) })
      ]));

      const agentStatus = await runCli(["agent", "status"], {
        cwd: uninitializedRoot,
        env: withoutProviderEnv(),
        preloadFetchMcpRuntime: true
      });
      expect(agentStatus.exitCode).toBe(0);
      expect(agentStatus.stdout).toContain("Latest agent tool proof");
      expect(agentStatus.stdout).toContain("mcp.tools.call");
      expect(agentStatus.stdout).toContain("acceptance-mcp-ok");

      const status = await runCli(["status"], {
        cwd: uninitializedRoot,
        env: withoutProviderEnv(),
        preloadFetchMcpRuntime: true
      });
      expect(status.exitCode).toBe(0);
      expect(status.stdout).toContain("Harness readiness");
      expect(status.stdout).toContain("status=ready");
      expect(status.stdout).toContain("chat=verified");
      expect(status.stdout).toContain("tools=verified:stitch");
      expect(status.stdout).toContain("Latest agent tool proof");
    } finally {
      fs.rmSync(uninitializedRoot, { recursive: true, force: true });
    }
  }, 10000);

  it("surfaces built-in MCP live proof on mcp status after setup auto --live", async () => {
    const uninitializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-setup-live-mcp-status-"));
    try {
      const setup = await runCli(["setup", "auto", "--from-env", "--live", "--ai", "openai", "--mcp", "stitch"], {
        cwd: uninitializedRoot,
        env: {
          ...withoutProviderEnv(),
          OPENAI_API_KEY: "test-openai",
          STITCH_API_KEY: "test-stitch"
        },
        preloadFetchMcpRuntime: true
      });
      expect(setup.exitCode).toBe(0);
      expect(setup.stdout).toContain("setup live check passed");

      const status = await runCli(["mcp", "status"], {
        cwd: uninitializedRoot,
        env: withoutProviderEnv()
      });

      expect(status.exitCode).toBe(0);
      expect(status.stdout).toContain("MCP / Adapter Connectors");
      expect(status.stdout).toContain("stitch");
      expect(status.stdout).toContain("protocol-mcp http https://stitch.googleapis.com/mcp");
      expect(status.stdout).toContain("policy=read-only-allowlist state=allowed-now requiredTrust=protocol-ready:protocol-tools-list");
      expect(status.stdout).toContain("next=rph mcp tools stitch 또는 rph mcp call stitch <tool> --read-only --args-json '{}'");
      expect(status.stdout).toContain("Verified targets");
      expect(status.stdout).toContain("mcp:stitch stitch type=mcp-server target_id=stitch verified_by=protocol-tools-list");
      expect(status.stdout).toContain("First action verified");
      expect(status.stdout).toContain("mcp:stitch listed 1 MCP tools from Stitch MCP server | detail=mcp.tools.list target_id=stitch verified_by=protocol-tools-list");
    } finally {
      fs.rmSync(uninitializedRoot, { recursive: true, force: true });
    }
  }, 10000);

  it("registers and live-verifies a custom protocol MCP server from one setup command", async () => {
    const uninitializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-setup-custom-mcp-"));
    try {
      const setup = await runCli([
        "setup",
        "mcp",
        "add",
        "custom-echo",
        "--url",
        "https://mcp.example.test/echo",
        "--auth",
        "bearer",
        "--auth-env",
        "CUSTOM_ECHO_MCP_TOKEN",
        "--live"
      ], {
        cwd: uninitializedRoot,
        env: {
          ...withoutProviderEnv(),
          CUSTOM_ECHO_MCP_TOKEN: "custom-secret"
        },
        preloadFetchMcpRuntime: true
      });

      expect(setup.exitCode).toBe(0);
      expect(setup.stderr).toBe("");
      expect(setup.stdout).toContain("RPH project initialized");
      expect(setup.stdout).toContain("Custom protocol MCP server 추가: custom-echo");
      expect(setup.stdout).toContain("custom-echo");
      expect(setup.stdout).toContain("authMode=bearer authEnv=CUSTOM_ECHO_MCP_TOKEN");
      expect(setup.stdout).toContain("mcp:custom-echo trust=protocol-ready:protocol-tools-list");
      expect(setup.stdout).toContain("First action verified");

      const config = JSON.parse(fs.readFileSync(path.join(uninitializedRoot, ".rph", "config.json"), "utf8")) as {
        mcpServers: Record<string, { url?: string; authMode?: string; authEnvKey?: string; custom?: boolean }>;
      };
      expect(config.mcpServers["custom-echo"]).toMatchObject({
        url: "https://mcp.example.test/echo",
        authMode: "bearer",
        authEnvKey: "CUSTOM_ECHO_MCP_TOKEN",
        custom: true
      });
      const mcpConfig = JSON.parse(fs.readFileSync(path.join(uninitializedRoot, ".mcp", "config.json"), "utf8")) as {
        mcpServers: Record<string, { url?: string; auth?: { mode?: string; envKey?: string }; custom?: boolean }>;
      };
      expect(mcpConfig.mcpServers["custom-echo"]).toMatchObject({
        url: "https://mcp.example.test/echo",
        auth: {
          mode: "bearer",
          envKey: "CUSTOM_ECHO_MCP_TOKEN"
        },
        custom: true
      });

      const status = await runCli(["mcp", "status"], {
        cwd: uninitializedRoot,
        env: {
          ...withoutProviderEnv(),
          CUSTOM_ECHO_MCP_TOKEN: "custom-secret"
        }
      });
      expect(status.exitCode).toBe(0);
      expect(status.stdout).toContain("custom-echo");
      expect(status.stdout).toContain("protocol-mcp http https://mcp.example.test/echo");
      expect(status.stdout).toContain("authMode=bearer authEnv=CUSTOM_ECHO_MCP_TOKEN");
      expect(status.stdout).toContain("policy=protocol-tools-list state=allowed-now");
      expect(status.stdout).toContain("next=rph mcp tools custom-echo");

      const proofs = await runCli(["proofs", "status"], {
        cwd: uninitializedRoot,
        env: withoutProviderEnv()
      });
      expect(proofs.exitCode).toBe(0);
      expect(proofs.stdout).toContain("Proof ledger");
      expect(proofs.stdout).toContain("connection:mcp:custom-echo");
      expect(proofs.stdout).toContain("protocol-ready:protocol-tools-list");

      const projectStatus = await runCli(["status"], {
        cwd: uninitializedRoot,
        env: withoutProviderEnv()
      });
      expect(projectStatus.exitCode).toBe(0);
      expect(projectStatus.stdout).toContain("Proof ledger");
      expect(projectStatus.stdout).toContain("connection:mcp:custom-echo");
    } finally {
      fs.rmSync(uninitializedRoot, { recursive: true, force: true });
    }
  }, 10000);

  it("registers a custom protocol MCP server with an opt-in read-only tools/call probe", async () => {
    const uninitializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-setup-custom-mcp-call-"));
    try {
      const setup = await runCli([
        "setup",
        "mcp",
        "add",
        "custom-echo",
        "--url",
        "https://mcp.example.test/echo",
        "--auth",
        "bearer",
        "--auth-env",
        "CUSTOM_ECHO_MCP_TOKEN",
        "--probe-tool",
        "echo",
        "--probe-args-json",
        "{\"text\":\"acceptance-mcp-ok\"}",
        "--live"
      ], {
        cwd: uninitializedRoot,
        env: {
          ...withoutProviderEnv(),
          CUSTOM_ECHO_MCP_TOKEN: "custom-secret"
        },
        preloadFetchMcpRuntime: true
      });

      expect(setup.exitCode).toBe(0);
      expect(setup.stderr).toBe("");
      expect(setup.stdout).toContain("Custom protocol MCP server 추가: custom-echo");
      expect(setup.stdout).toContain("agent read-only tools: echo");
      expect(setup.stdout).toContain("mcp:custom-echo trust=protocol-ready:protocol-tool-call");
      expect(setup.stdout).toContain("detail=mcp.tools.call target_id=custom-echo:echo verified_by=protocol-tool-call");
      expect(setup.stdout).toContain("MCP policy");

      const config = JSON.parse(fs.readFileSync(path.join(uninitializedRoot, ".rph", "config.json"), "utf8")) as {
        mcpPolicyRegistry?: { servers: Record<string, { kind?: string; protocolReadiness?: string; protocolToolCallProbe?: { toolName?: string; arguments?: Record<string, unknown> }; agentReadOnlyTools?: string[] }> };
        mcpServers: Record<string, { protocolReadiness?: string; protocolToolCallProbe?: { toolName?: string; arguments?: Record<string, unknown> }; agentReadOnlyTools?: string[] }>;
      };
      expect(config.mcpServers["custom-echo"]).toMatchObject({
        protocolReadiness: "tools/call",
        agentReadOnlyTools: ["echo"],
        protocolToolCallProbe: {
          toolName: "echo",
          arguments: { text: "acceptance-mcp-ok" }
        }
      });
      expect(config.mcpPolicyRegistry?.servers["custom-echo"]).toMatchObject({
        kind: "read-only-probe",
        protocolReadiness: "tools/call",
        agentReadOnlyTools: ["echo"],
        protocolToolCallProbe: {
          toolName: "echo",
          arguments: { text: "acceptance-mcp-ok" }
        }
      });

      const mcpConfig = JSON.parse(fs.readFileSync(path.join(uninitializedRoot, ".mcp", "config.json"), "utf8")) as {
        mcpPolicyRegistry?: { servers: Record<string, { kind?: string; protocolReadiness?: string; protocolToolCallProbe?: { toolName?: string; arguments?: Record<string, unknown> }; agentReadOnlyTools?: string[] }> };
        mcpServers: Record<string, { protocolReadiness?: string; protocolToolCallProbe?: { toolName?: string; arguments?: Record<string, unknown> }; agentReadOnlyTools?: string[] }>;
      };
      expect(mcpConfig.mcpServers["custom-echo"]).toMatchObject({
        protocolReadiness: "tools/call",
        agentReadOnlyTools: ["echo"],
        protocolToolCallProbe: {
          toolName: "echo",
          arguments: { text: "acceptance-mcp-ok" }
        }
      });
      expect(mcpConfig.mcpPolicyRegistry?.servers["custom-echo"]).toMatchObject({
        kind: "read-only-probe",
        protocolReadiness: "tools/call",
        agentReadOnlyTools: ["echo"],
        protocolToolCallProbe: {
          toolName: "echo",
          arguments: { text: "acceptance-mcp-ok" }
        }
      });

      const tools = await runCli(["mcp", "tools", "custom-echo"], {
        cwd: uninitializedRoot,
        env: {
          ...withoutProviderEnv(),
          CUSTOM_ECHO_MCP_TOKEN: "custom-secret"
        },
        preloadFetchMcpRuntime: true
      });
      expect(tools.exitCode).toBe(0);
      expect(tools.stdout).toContain("\"agentReadOnlyTools\": [");
      expect(tools.stdout).toContain("\"echo\"");
      expect(tools.stdout).toContain("\"tools\": [");
      expect(tools.stdout).not.toContain("custom-secret");
    } finally {
      fs.rmSync(uninitializedRoot, { recursive: true, force: true });
    }
  }, 10000);

  it("runs setup auto inside the runtime shell from credential input to successful connection", async () => {
    const uninitializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-runtime-setup-auto-"));
    try {
      const result = await runCli(["shell"], {
        cwd: uninitializedRoot,
        env: withoutProviderEnv(),
        stdinChunks: [
          { text: "/setup auto --ai openai --mcp none --live\n", delayMs: 0 },
          { text: "test-openai-from-wizard\n", delayMs: 200 },
          { text: "\n", delayMs: 50 },
          { text: "https://example.invalid/v1\n", delayMs: 50 },
          { text: "연결 확인 인사해줘\n", delayMs: 300 },
          { text: "/exit\n", delayMs: 300 }
        ],
        preloadFetchOpenAiConnectionSuccess: true
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Fresh workspace.");
      expect(result.stdout).toContain("next: /setup auto --live");
      expect(result.stdout).toContain("fallback: /pm start");
      expect(result.stdout).toContain("RPH Setup Auto");
      expect(result.stdout).toContain(".env 저장 완료");
      expect(result.stdout).toContain("ai:openai");
      expect(result.stdout).toContain("setup live check passed");
      expect(result.stdout).toContain("이제 일반 텍스트를 입력하면 연결된 AI agent와 대화합니다.");
      expect(result.stdout).toContain("handoff: runtime ready");
      expect(result.stdout).toContain("next: /pm start");
      expect(result.stdout).toContain("OK");
      expect(result.stdout).toContain("RPH runtime 종료");
      const envFile = fs.readFileSync(path.join(uninitializedRoot, ".env"), "utf8");
      expect(envFile).toContain("OPENAI_API_KEY=test-openai-from-wizard");
      expect(envFile).toContain("OPENAI_BASE_URL=https://example.invalid/v1");
      const configFile = fs.readFileSync(path.join(uninitializedRoot, ".rph", "config.json"), "utf8");
      expect(configFile).not.toContain("test-openai-from-wizard");
      const config = JSON.parse(configFile) as {
        activeAiProvider: string;
        aiProviders: {
          openai: {
            configured: boolean;
            enabled: boolean;
          };
        };
      };
      expect(config.activeAiProvider).toBe("openai");
      expect(config.aiProviders.openai.configured).toBe(true);
      expect(config.aiProviders.openai.enabled).toBe(true);
    } finally {
      fs.rmSync(uninitializedRoot, { recursive: true, force: true });
    }
  }, 15000);

  it("retries failed setup auto --live credential entry inside the runtime shell", async () => {
    const uninitializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-runtime-setup-auto-retry-"));
    try {
      const result = await runCli(["shell"], {
        cwd: uninitializedRoot,
        env: withoutProviderEnv(),
        stdinChunks: [
          { text: "/setup auto --ai openai --mcp none --live\n", delayMs: 0 },
          { text: "bad-openai\n", delayMs: 200 },
          { text: "\n", delayMs: 50 },
          { text: "https://example.invalid/v1\n", delayMs: 50 },
          { text: "test-openai\n", delayMs: 250 },
          { text: "\n", delayMs: 50 },
          { text: "\n", delayMs: 50 },
          { text: "/exit\n", delayMs: 400 }
        ],
        preloadFetchOpenAiCredentialRetry: true
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("ai:openai trust=unverified:none credential: request failed (401); generation: skipped");
      expect(result.stdout).toContain("repair: /setup repair --live");
      expect(result.stdout).toContain("retry: /setup auto --live --ai openai --mcp none");
      expect(result.stdout).toContain("live check 재시도 준비");
      expect(result.stdout).toContain("실패한 연결 값을 다시 입력하세요");
      expect(result.stdout).toContain(".env 재저장 완료");
      expect(result.stdout).toContain("연결 테스트 재시도");
      expect(result.stdout).toContain("ai:openai trust=protocol-ready:protocol-tool-call");
      expect(result.stdout).toContain("setup live check passed");
      const envFile = fs.readFileSync(path.join(uninitializedRoot, ".env"), "utf8");
      expect(envFile).toContain("OPENAI_API_KEY=test-openai");
      expect(envFile).not.toContain("OPENAI_API_KEY=bad-openai");
      const report = JSON.parse(fs.readFileSync(path.join(uninitializedRoot, ".rph", "connections", "latest.json"), "utf8")) as {
        checks: Array<{ kind: string; id: string; status: string }>;
      };
      expect(report.checks).toEqual([expect.objectContaining({ kind: "ai", id: "openai", status: "passed" })]);
    } finally {
      fs.rmSync(uninitializedRoot, { recursive: true, force: true });
    }
  }, 20000);

  it("retries missing setup auto --live credential without widening the selected check scope", async () => {
    const uninitializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-runtime-setup-auto-missing-retry-"));
    try {
      const result = await runCli(["shell"], {
        cwd: uninitializedRoot,
        env: {
          ...withoutProviderEnv(),
          GEMINI_API_KEY: "test-gemini"
        },
        stdinChunks: [
          { text: "/setup auto --ai openai --mcp none --live\n", delayMs: 0 },
          { text: "\n", delayMs: 200 },
          { text: "\n", delayMs: 50 },
          { text: "\n", delayMs: 50 },
          { text: "test-openai\n", delayMs: 250 },
          { text: "\n", delayMs: 50 },
          { text: "\n", delayMs: 50 },
          { text: "/exit\n", delayMs: 400 }
        ],
        preloadFetchOpenAiConnectionSuccess: true
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("ai:openai trust=unverified:none required environment variables are missing");
      expect(result.stdout).toContain("cause: missing OPENAI_API_KEY");
      expect(result.stdout).toContain("repair: /setup repair --live");
      expect(result.stdout).toContain("retry: /setup auto --live --ai openai --mcp none");
      expect(result.stdout).toContain("live check 재시도 준비");
      expect(result.stdout).toContain("ai:openai trust=protocol-ready:protocol-tool-call");
      expect(result.stdout).toContain("setup live check passed");
      expect(result.stdout).not.toContain("ai:gemini");
      const report = JSON.parse(fs.readFileSync(path.join(uninitializedRoot, ".rph", "connections", "latest.json"), "utf8")) as {
        checks: Array<{ kind: string; id: string; status: string }>;
      };
      expect(report.checks.map(({ kind, id, status }) => ({ kind, id, status }))).toEqual([
        { kind: "ai", id: "openai", status: "passed" }
      ]);
      const rawReport = fs.readFileSync(path.join(uninitializedRoot, ".rph", "connections", "latest.json"), "utf8");
      expect(rawReport).not.toContain("test-openai");
    } finally {
      fs.rmSync(uninitializedRoot, { recursive: true, force: true });
    }
  }, 20000);

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

  it("uses rph start as a setup-first top-level entrypoint in a fresh folder", async () => {
    const uninitializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-start-entrypoint-"));
    try {
      const result = await runCli(["start"], { cwd: uninitializedRoot });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("RPH start: setup required");
      expect(result.stdout).toContain("next: rph setup auto --live");
      expect(result.stdout).toContain("fallback: rph pm start");
      expect(result.stdout).toContain("help: rph help setup");
      expect(fs.existsSync(path.join(uninitializedRoot, ".rph"))).toBe(false);
    } finally {
      fs.rmSync(uninitializedRoot, { recursive: true, force: true });
    }
  });

  it("lets rph start run live setup from env as one top-level entrypoint", async () => {
    const uninitializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-start-live-setup-"));
    try {
      const result = await runCli(["start", "--from-env", "--live", "--ai", "openai", "--mcp", "none"], {
        cwd: uninitializedRoot,
        env: {
          ...withoutProviderEnv(),
          OPENAI_API_KEY: "test-openai"
        },
        preloadFetchOpenAiConnectionSuccess: true
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("RPH start: setup required");
      expect(result.stdout).toContain("launching: rph setup auto --live");
      expect(result.stdout).toContain("RPH Setup Auto");
      expect(result.stdout).toContain("ai:openai trust=protocol-ready:protocol-tool-call");
      expect(result.stdout).toContain("setup live check passed");
      expect(fs.existsSync(path.join(uninitializedRoot, ".rph", "project.json"))).toBe(true);
      expect(fs.existsSync(path.join(uninitializedRoot, ".rph", "connections", "latest.json"))).toBe(true);
    } finally {
      fs.rmSync(uninitializedRoot, { recursive: true, force: true });
    }
  }, 10000);

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

function writeOpenAiGeminiEnv(projectRoot: string): void {
  fs.writeFileSync(path.join(projectRoot, ".env"), [
    "OPENAI_API_KEY=test-openai",
    "GEMINI_API_KEY=test-gemini"
  ].join("\n"));
}

function passedOpenAiConnectionCheck(checkedAt = new Date().toISOString()): ConnectionCheck {
  return {
    id: "openai",
    kind: "ai",
    status: "passed",
    message: "AI provider live generation passed",
    requiredEnv: ["OPENAI_API_KEY"],
    missingEnv: [],
    endpoint: "https://api.openai.com/v1/responses",
    identity: {
      type: "ai-provider",
      label: "openai",
      targetId: "gpt-5.4",
      verifiedBy: "protocol-tool-call",
      source: "provider-response"
    },
    firstActionProof: {
      action: "ai.generation_smoke",
      label: "generated smoke response",
      targetId: "gpt-5.4",
      verifiedBy: "protocol-tool-call",
      endpoint: "https://api.openai.com/v1/responses"
    },
    readiness: {
      mode: "protocol-ready",
      provenStage: "protocol-tool-call",
      stages: [{
        stage: "protocol-tool-call",
        status: "passed",
        message: "generation smoke passed",
        endpoint: "https://api.openai.com/v1/responses"
      }]
    },
    checkedAt
  };
}

function writeEmptyHarnessConfig(projectRoot: string): void {
  fs.writeFileSync(path.join(projectRoot, ".rph", "config.json"), JSON.stringify(createHarnessConfig({} as NodeJS.ProcessEnv), null, 2));
}

function writeRecoveryBriefFixture(projectRoot: string): void {
  const runtimeDir = path.join(projectRoot, ".rph", "runtime");
  fs.mkdirSync(runtimeDir, { recursive: true });
  const now = "2026-01-01T00:00:00.000Z";
  fs.writeFileSync(path.join(runtimeDir, "action-approvals.json"), JSON.stringify([
    {
      id: "action-recovery",
      sessionId: "session-recovery",
      command: "/github create-repo --public",
      normalizedCommand: "/github create-repo --public",
      fingerprint: "fixture",
      source: "agent-command-proposal",
      target: "github",
      action: "create-repo",
      risk: "external_live_write",
      description: "Create GitHub repository",
      status: "pending",
      createdAt: now,
      updatedAt: now
    }
  ], null, 2));
  fs.writeFileSync(path.join(runtimeDir, "handoffs.json"), JSON.stringify([
    {
      id: "handoff-recovery",
      sessionId: "session-recovery",
      status: "pending",
      attempts: 0,
      maxAttempts: 3,
      createdAt: now,
      updatedAt: now,
      packet: {
        fromAgent: "PM",
        toAgent: "FE",
        stage: "FE_SPEC",
        summary: "FE should continue from PM scope.",
        artifactRefs: ["document:requirements"],
        acceptanceCriteria: ["FE spec is drafted"],
        blockers: [],
        nextCommand: "/fe spec --ai",
        resumeCursor: "stage:FE_SPEC",
        createdAt: now
      }
    }
  ], null, 2));
  fs.writeFileSync(path.join(runtimeDir, "current-session.json"), JSON.stringify({
    version: 2,
    sessionId: "session-recovery",
    status: "blocked",
    projectRoot,
    startedAt: now,
    updatedAt: now,
    stage: "SETUP",
    ownerAgent: "PM",
    pendingAction: null,
    checkpoint: "external action approval requested",
    blocker: "external action approval required: action-recovery",
    retryCount: 0,
    lastCommand: "/github create-repo --public",
    lastCommandOk: false,
    history: [],
    activeTurn: null,
    stageQueue: [],
    waitCondition: null,
    handoffPacket: null,
    toolTrace: [],
    pendingExternalActionId: "action-recovery"
  }, null, 2));
}

function writeSafeRecoveryBriefFixture(projectRoot: string): void {
  const runtimeDir = path.join(projectRoot, ".rph", "runtime");
  fs.mkdirSync(runtimeDir, { recursive: true });
  const now = "2026-01-01T00:00:00.000Z";
  fs.writeFileSync(path.join(runtimeDir, "current-session.json"), JSON.stringify({
    version: 2,
    sessionId: "session-safe-recovery",
    status: "blocked",
    projectRoot,
    startedAt: now,
    updatedAt: now,
    stage: "SETUP",
    ownerAgent: "Orchestrator",
    pendingAction: {
      kind: "status",
      confidence: 0.95,
      reason: "Refresh local workflow status after interruption.",
      command: "/status",
      safeToAutoRun: true,
      steps: ["Read the current workflow stage."],
      createdAt: now
    },
    checkpoint: "status refresh pending",
    blocker: "status refresh pending",
    retryCount: 0,
    lastCommand: "/status",
    lastCommandOk: false,
    history: [],
    activeTurn: null,
    stageQueue: [],
    waitCondition: null,
    handoffPacket: null,
    toolTrace: [],
    pendingExternalActionId: null
  }, null, 2));
}

function writePausedRecoveryBriefFixture(projectRoot: string): void {
  const runtimeDir = path.join(projectRoot, ".rph", "runtime");
  fs.mkdirSync(runtimeDir, { recursive: true });
  const now = "2026-01-01T00:00:00.000Z";
  saveState(projectRoot, { ...loadState(projectRoot), paused: true });
  fs.writeFileSync(path.join(runtimeDir, "current-session.json"), JSON.stringify({
    version: 2,
    sessionId: "session-paused-recovery",
    status: "paused",
    projectRoot,
    startedAt: now,
    updatedAt: now,
    stage: "SETUP",
    ownerAgent: "Orchestrator",
    pendingAction: null,
    checkpoint: "workflow paused",
    blocker: "workflow paused by user",
    retryCount: 0,
    lastCommand: "/pause",
    lastCommandOk: true,
    history: [],
    activeTurn: null,
    stageQueue: [],
    waitCondition: {
      kind: "paused",
      message: "workflow is paused until /resume",
      since: now
    },
    handoffPacket: null,
    toolTrace: [],
    pendingExternalActionId: null
  }, null, 2));
}

function writeFailingRecoveryBriefFixture(projectRoot: string): void {
  const runtimeDir = path.join(projectRoot, ".rph", "runtime");
  fs.mkdirSync(runtimeDir, { recursive: true });
  const now = "2026-01-01T00:00:00.000Z";
  fs.writeFileSync(path.join(runtimeDir, "current-session.json"), JSON.stringify({
    version: 2,
    sessionId: "session-failing-recovery",
    status: "blocked",
    projectRoot,
    startedAt: now,
    updatedAt: now,
    stage: "SETUP",
    ownerAgent: "Orchestrator",
    pendingAction: {
      kind: "command",
      confidence: 0.95,
      reason: "Invalid step value should fail inside recovery.",
      command: "/agent run --steps nope",
      safeToAutoRun: true,
      steps: ["Run orchestration with an invalid step option."],
      createdAt: now
    },
    checkpoint: "invalid recovery command pending",
    blocker: "invalid recovery command pending",
    retryCount: 0,
    lastCommand: "/agent run --steps nope",
    lastCommandOk: false,
    history: [],
    activeTurn: null,
    stageQueue: [],
    waitCondition: null,
    handoffPacket: null,
    toolTrace: [],
    pendingExternalActionId: null
  }, null, 2));
}

function writeMultiplePendingExternalActions(projectRoot: string): void {
  const runtimeDir = path.join(projectRoot, ".rph", "runtime");
  fs.mkdirSync(runtimeDir, { recursive: true });
  const now = "2026-01-01T00:00:00.000Z";
  fs.writeFileSync(path.join(runtimeDir, "action-approvals.json"), JSON.stringify([
    {
      id: "action-one",
      sessionId: "session-actions",
      command: "/notion setup --live --title \"One\"",
      normalizedCommand: "/notion setup --live --title One",
      fingerprint: "action-one",
      source: "agent-command-proposal",
      target: "notion",
      action: "setup",
      risk: "external_live_write",
      description: "Create Notion workspace",
      status: "pending",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "action-two",
      sessionId: "session-actions",
      command: "/github setup-labels",
      normalizedCommand: "/github setup-labels",
      fingerprint: "action-two",
      source: "agent-command-proposal",
      target: "github",
      action: "setup-labels",
      risk: "external_live_write",
      description: "Create GitHub labels",
      status: "pending",
      createdAt: now,
      updatedAt: now
    }
  ], null, 2));
  saveRuntimeSession(projectRoot, {
    ...createRuntimeSessionManifest(projectRoot, "session-actions"),
    status: "active",
    waitCondition: {
      kind: "external_live_write",
      message: "multiple external actions pending",
      since: now
    },
    blocker: null,
    pendingExternalActionId: null
  });
}

function saveApprovedPdState(projectRoot: string): void {
  let state = loadState(projectRoot);
  state = { ...state, currentStage: "PD_APPROVED" };
  for (const artifactId of ["references", "directions", "landing-preview", "design-system", "page-designs"] as const) {
    const index = createDesignArtifactVersion(projectRoot, artifactId, { changeSummary: "approved pd" });
    approveDesignArtifact(projectRoot, artifactId, "tester");
    state = syncStateDesignArtifacts(state, { ...index, status: "approved" });
  }
  saveState(projectRoot, state);
  saveRuntimeSession(projectRoot, createRuntimeSessionManifest(projectRoot, "session-approved-pd"));
}

function approveSprintInputs(projectRoot: string): void {
  let state = loadState(projectRoot);
  for (const docId of ["fe-technical-spec", "be-technical-spec", "api-contract"] as const) {
    if (!state.documents[docId]?.currentVersion) {
      const index = createDocumentVersion(projectRoot, docId, {
        changeSummary: `fan-in fixture ${docId}`,
        body: `# ${docId}`
      });
      state = syncStateDocuments(state, index);
    }
    approveDocument(projectRoot, docId, "tester");
    state = syncStateDocuments(state, readDocumentIndex(projectRoot, docId));
  }
  saveState(projectRoot, state);
}

function withoutProviderEnv(): Record<string, undefined> {
  return {
    OPENAI_API_KEY: undefined,
    OPENAI_MODEL: undefined,
    OPENAI_BASE_URL: undefined,
    ANTHROPIC_API_KEY: undefined,
    ANTHROPIC_MODEL: undefined,
    ANTHROPIC_BASE_URL: undefined,
    GEMINI_API_KEY: undefined,
    GEMINI_MODEL: undefined,
    GEMINI_BASE_URL: undefined,
    LOCAL_AI_BASE_URL: undefined,
    LOCAL_AI_MODEL: undefined,
    NOTION_TOKEN: undefined,
    GITHUB_TOKEN: undefined,
    FIGMA_TOKEN: undefined,
    STITCH_API_KEY: undefined
  };
}

function readCapturedPrompt(captureFile: string): string {
  const payload = JSON.parse(fs.readFileSync(captureFile, "utf8")) as { input?: string };
  return payload.input ?? "";
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(predicate: () => boolean, timeoutMs = 2_000, intervalMs = 25): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await sleep(intervalMs);
  }
  throw new Error("timed out waiting for condition");
}

async function waitForChild(child: ReturnType<typeof spawn>): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (status) => resolve(status));
  });
}

async function runCli(
  args: string[],
  options: {
    cwd: string;
    stdinChunks?: Array<{ text: string; delayMs: number }>;
    preloadFetchCapture?: string;
      preloadFetchSequence?: string;
      preloadFetchCommandProposal?: boolean;
      preloadFetchLocalCommandProposal?: boolean | string;
      preloadFetchApprovalCommandProposal?: string;
      preloadFetchMutableNotionProposal?: boolean;
    preloadFetchMutableMcpProposal?: boolean;
    preloadFetchHandoffProposal?: boolean;
    preloadFetchInvalidHandoffProposal?: boolean;
    preloadFetchLaneCommandProposal?: {
      captureFile: string;
      command?: string;
      reason?: string;
    };
    preloadFetchOpenAiConnectionSuccess?: boolean;
    preloadFetchOpenAiCredentialRetry?: boolean;
    preloadFetchOpenAiGenerationFailure?: boolean;
    preloadFetchGitHubRepoSuccess?: boolean;
    preloadFetchMcpRuntime?: boolean;
    preloadFetchMcpToolsListFailure?: boolean;
      preloadFetchProviderFallback?: boolean;
    preloadFetchMarkdown?: string;
    env?: Record<string, string | undefined>;
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
            : options.preloadFetchLocalCommandProposal
              ? createFetchLocalCommandProposalStub(
                  options.cwd,
                  typeof options.preloadFetchLocalCommandProposal === "string"
                    ? options.preloadFetchLocalCommandProposal
                    : undefined
                )
              : options.preloadFetchApprovalCommandProposal
                ? createFetchApprovalCommandProposalStub(options.cwd, options.preloadFetchApprovalCommandProposal)
                : options.preloadFetchMutableNotionProposal
                  ? createFetchMutableNotionProposalStub(options.cwd)
                  : options.preloadFetchMutableMcpProposal
                    ? createFetchMutableMcpProposalStub(options.cwd)
                    : options.preloadFetchHandoffProposal
                      ? createFetchHandoffProposalStub(options.cwd)
                      : options.preloadFetchInvalidHandoffProposal
                        ? createFetchInvalidHandoffProposalStub(options.cwd)
                        : options.preloadFetchLaneCommandProposal
                          ? createFetchLaneCommandProposalStub(
                              options.cwd,
                              options.preloadFetchLaneCommandProposal.captureFile,
                              options.preloadFetchLaneCommandProposal.command,
                              options.preloadFetchLaneCommandProposal.reason
                            )
                          : options.preloadFetchOpenAiConnectionSuccess
                            ? createFetchOpenAiConnectionSuccessStub(options.cwd)
                            : options.preloadFetchOpenAiCredentialRetry
                              ? createFetchOpenAiCredentialRetryStub(options.cwd)
                            : options.preloadFetchOpenAiGenerationFailure
                              ? createFetchOpenAiGenerationFailureStub(options.cwd)
                            : options.preloadFetchGitHubRepoSuccess
                              ? createFetchGitHubRepoSuccessStub(options.cwd)
                            : options.preloadFetchMcpRuntime
                              ? createFetchMcpRuntimeStub(options.cwd)
                            : options.preloadFetchMcpToolsListFailure
                              ? createFetchMcpToolsListFailureStub(options.cwd)
                              : options.preloadFetchProviderFallback
                              ? createFetchProviderFallbackStub(options.cwd)
                            : options.preloadFetchMarkdown
                              ? createFetchMarkdownStub(options.cwd, options.preloadFetchMarkdown)
                              : undefined;
  const nodeArgs = [...(preload ? ["--require", preload] : []), cliEntry, ...args];

  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    for (const [key, value] of Object.entries(options.env ?? {})) {
      if (value === undefined) {
        delete env[key];
      } else {
        env[key] = value;
      }
    }
    const child = spawn(process.execPath, nodeArgs, {
      cwd: options.cwd,
      env,
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

function createFetchLocalCommandProposalStub(projectRoot: string, command = "/pm start"): string {
  const preloadPath = path.join(projectRoot, "fetch-local-command-proposal-preload.cjs");
  fs.writeFileSync(preloadPath, [
    "global.fetch = async () => {",
    `  const text = JSON.stringify({ action: { type: 'command', command: ${JSON.stringify(command)}, safeToAutoRun: false, reason: 'start the local lane', message: '로컬 명령을 실행합니다.' } });`,
    "  return new Response(JSON.stringify({",
    "    output: [{ type: 'message', content: [{ type: 'output_text', text }] }],",
    "    usage: { input_tokens: 10, output_tokens: 5 }",
    "  }), { status: 200, headers: { 'content-type': 'application/json' } });",
    "};"
  ].join("\n"));
  return preloadPath;
}

function createFetchApprovalCommandProposalStub(projectRoot: string, command: string): string {
  const preloadPath = path.join(projectRoot, "fetch-approval-command-proposal-preload.cjs");
  fs.writeFileSync(preloadPath, [
    "global.fetch = async () => {",
    `  const text = JSON.stringify({ action: { type: 'command', command: ${JSON.stringify(command)}, safeToAutoRun: false, reason: 'requires explicit user approval', message: '승인 명령은 사용자 직접 실행이 필요합니다.' } });`,
    "  return new Response(JSON.stringify({",
    "    output: [{ type: 'message', content: [{ type: 'output_text', text }] }],",
    "    usage: { input_tokens: 10, output_tokens: 5 }",
    "  }), { status: 200, headers: { 'content-type': 'application/json' } });",
    "};"
  ].join("\n"));
  return preloadPath;
}

function createFetchMutableNotionProposalStub(projectRoot: string): string {
  const preloadPath = path.join(projectRoot, "fetch-mutable-notion-proposal-preload.cjs");
  fs.writeFileSync(preloadPath, [
    "let databaseCount = 0;",
    "global.fetch = async (url, init = {}) => {",
    "  const target = String(url);",
    "  const method = init.method || 'GET';",
    "  if (target.includes('example.invalid')) {",
    "    const text = JSON.stringify({ action: { type: 'command', command: '/notion setup --live --title \"Agent Action Smoke\"', safeToAutoRun: false, reason: 'create the live Notion workspace after explicit approval', message: 'Notion live workspace action을 승인 대기열에 올립니다.' } });",
    "    return new Response(JSON.stringify({",
    "      output: [{ type: 'message', content: [{ type: 'output_text', text }] }],",
    "      usage: { input_tokens: 10, output_tokens: 5 }",
    "    }), { status: 200, headers: { 'content-type': 'application/json' } });",
    "  }",
    "  if (target.endsWith('/v1/pages') && method === 'POST') {",
    "    return new Response(JSON.stringify({ id: 'dashboard-page-id', object: 'page', url: 'https://notion.so/dashboard-page-id', archived: false }), { status: 200, headers: { 'content-type': 'application/json' } });",
    "  }",
    "  if (target.includes('/v1/pages/dashboard-page-id') && method === 'GET') {",
    "    return new Response(JSON.stringify({ id: 'dashboard-page-id', object: 'page', url: 'https://notion.so/dashboard-page-id', archived: false }), { status: 200, headers: { 'content-type': 'application/json' } });",
    "  }",
    "  if (target.endsWith('/v1/databases') && method === 'POST') {",
    "    databaseCount += 1;",
    "    return new Response(JSON.stringify({ id: `database-${databaseCount}`, object: 'database', url: `https://notion.so/database-${databaseCount}` }), { status: 200, headers: { 'content-type': 'application/json' } });",
    "  }",
    "  const databaseMatch = target.match(/\\/v1\\/databases\\/(database-\\d+)$/);",
    "  if (databaseMatch && method === 'GET') {",
    "    return new Response(JSON.stringify({ id: databaseMatch[1], object: 'database', url: `https://notion.so/${databaseMatch[1]}`, archived: false }), { status: 200, headers: { 'content-type': 'application/json' } });",
    "  }",
    "  return new Response(JSON.stringify({ error: { message: `unexpected fetch ${method} ${target}` } }), { status: 500, headers: { 'content-type': 'application/json' } });",
    "};"
  ].join("\n"));
  return preloadPath;
}

function createFetchMutableMcpProposalStub(projectRoot: string): string {
  const preloadPath = path.join(projectRoot, "fetch-mutable-mcp-proposal-preload.cjs");
  fs.writeFileSync(preloadPath, [
    "global.fetch = async (url, init = {}) => {",
    "  const target = String(url);",
    "  const body = init.body ? JSON.parse(String(init.body)) : {};",
    "  if (target.includes('example.invalid')) {",
    "    const text = JSON.stringify({ action: { type: 'command', command: '/mcp call stitch create_project --args-json \\'{\"title\":\"Agent MCP Smoke\"}\\'', safeToAutoRun: false, reason: 'attempt a mutable MCP tool call', message: 'MCP write action을 실행합니다.' } });",
    "    return new Response(JSON.stringify({",
    "      output: [{ type: 'message', content: [{ type: 'output_text', text }] }],",
    "      usage: { input_tokens: 10, output_tokens: 5 }",
    "    }), { status: 200, headers: { 'content-type': 'application/json' } });",
    "  }",
    "  if (target.includes('stitch.googleapis.com/mcp')) {",
    "    if (body.method === 'initialize') {",
    "      return json({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fake-stitch', version: '0.0.0' } } }, { 'Mcp-Session-Id': 'mutable-mcp-session' });",
    "    }",
    "    if (body.method === 'notifications/initialized') {",
    "      return json({});",
    "    }",
    "    if (body.method === 'tools/list') {",
    "      return json({ jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'create_project', description: 'Create a project.', annotations: { destructiveHint: true }, inputSchema: { type: 'object', properties: { title: { type: 'string' } } } }] } });",
    "    }",
    "    if (body.method === 'tools/call') {",
    "      if (body.params?.name !== 'create_project') return json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'unexpected tool' } });",
    "      return json({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: 'created mutable-mcp-project' }], structuredContent: { projectId: 'mutable-mcp-project', title: body.params?.arguments?.title }, isError: false } });",
    "    }",
    "  }",
    "  return new Response(JSON.stringify({ error: { message: `unexpected fetch ${target}` } }), { status: 500, headers: { 'content-type': 'application/json' } });",
    "};",
    "function json(data, headers = {}, status = 200) {",
    "  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });",
    "}"
  ].join("\n"));
  return preloadPath;
}

function createFetchHandoffProposalStub(projectRoot: string): string {
  const preloadPath = path.join(projectRoot, "fetch-handoff-proposal-preload.cjs");
  fs.writeFileSync(preloadPath, [
    "global.fetch = async () => {",
    "  const text = JSON.stringify({ action: { type: 'handoff', message: 'FE에게 넘길 handoff를 준비했습니다.', handoff: { fromAgent: 'Orchestrator', toAgent: 'FE', stage: 'FE_SPEC', summary: 'PM scope is ready for FE specification.', artifactRefs: ['document:requirements'], acceptanceCriteria: ['FE spec reflects approved requirements'], blockers: [], nextCommand: '/fe spec --ai' } } });",
    "  return new Response(JSON.stringify({",
    "    output: [{ type: 'message', content: [{ type: 'output_text', text }] }],",
    "    usage: { input_tokens: 10, output_tokens: 5 }",
    "  }), { status: 200, headers: { 'content-type': 'application/json' } });",
    "};"
  ].join("\n"));
  return preloadPath;
}

function createFetchInvalidHandoffProposalStub(projectRoot: string): string {
  const preloadPath = path.join(projectRoot, "fetch-invalid-handoff-proposal-preload.cjs");
  fs.writeFileSync(preloadPath, [
    "global.fetch = async () => {",
    "  const text = JSON.stringify({ action: { type: 'handoff', message: 'FE handoff should be rejected.', handoff: { fromAgent: 'Orchestrator', toAgent: 'FE', stage: 'FE_SPEC', summary: 'Invalid command should never enter the queue.', artifactRefs: ['document:requirements'], acceptanceCriteria: ['Invalid handoff is rejected'], blockers: [], nextCommand: '/be spec --ai' } } });",
    "  return new Response(JSON.stringify({",
    "    output: [{ type: 'message', content: [{ type: 'output_text', text }] }],",
    "    usage: { input_tokens: 10, output_tokens: 5 }",
    "  }), { status: 200, headers: { 'content-type': 'application/json' } });",
    "};"
  ].join("\n"));
  return preloadPath;
}

function createFetchLaneCommandProposalStub(
  projectRoot: string,
  captureFile: string,
  command = "/pm start",
  reason = "PM lane accepts the queued command",
  delayMs = 0
): string {
  const preloadPath = path.join(projectRoot, "fetch-lane-command-proposal-preload.cjs");
  fs.writeFileSync(preloadPath, [
    "const fs = require('node:fs');",
    `const captureFile = ${JSON.stringify(captureFile)};`,
    `const command = ${JSON.stringify(command)};`,
    `const reason = ${JSON.stringify(reason)};`,
    `const delayMs = ${JSON.stringify(delayMs)};`,
    "global.fetch = async (_url, init = {}) => {",
    "  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));",
    "  const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};",
    "  fs.writeFileSync(captureFile, JSON.stringify(body));",
    "  const text = JSON.stringify({ action: { type: 'command', command, safeToAutoRun: true, reason, message: 'Lane command proposal from autonomous worker.' } });",
    "  return new Response(JSON.stringify({",
    "    output: [{ type: 'message', content: [{ type: 'output_text', text }] }],",
    "    usage: { input_tokens: 10, output_tokens: 5 }",
    "  }), { status: 200, headers: { 'content-type': 'application/json' } });",
    "};"
  ].join("\n"));
  return preloadPath;
}

function createFetchOpenAiConnectionSuccessStub(projectRoot: string): string {
  const preloadPath = path.join(projectRoot, "fetch-openai-connection-success-preload.cjs");
  fs.writeFileSync(preloadPath, [
    "global.fetch = async (url, init = {}) => {",
    "  const target = String(url);",
    "  if (target.endsWith('/models')) {",
    "    return new Response(JSON.stringify({ data: [{ id: 'gpt-5.4' }] }), { status: 200, headers: { 'content-type': 'application/json' } });",
    "  }",
    "  if (target.endsWith('/responses')) {",
    "    return new Response(JSON.stringify({ output_text: 'OK', usage: { input_tokens: 4, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });",
    "  }",
    "  return new Response(JSON.stringify({ error: { message: `unexpected URL ${target}` } }), { status: 500, headers: { 'content-type': 'application/json' } });",
    "};"
  ].join("\n"));
  return preloadPath;
}

function createFetchOpenAiCredentialRetryStub(projectRoot: string): string {
  const preloadPath = path.join(projectRoot, "fetch-openai-credential-retry-preload.cjs");
  fs.writeFileSync(preloadPath, [
    "global.fetch = async (url, init = {}) => {",
    "  const target = String(url);",
    "  const auth = header(init.headers, 'Authorization');",
    "  const valid = auth.includes('test-openai');",
    "  if (target.endsWith('/models')) {",
    "    if (!valid) {",
    "      return new Response(JSON.stringify({ error: { message: 'invalid api key' } }), { status: 401, headers: { 'content-type': 'application/json' } });",
    "    }",
    "    return new Response(JSON.stringify({ data: [{ id: 'gpt-5.4' }] }), { status: 200, headers: { 'content-type': 'application/json' } });",
    "  }",
    "  if (target.endsWith('/responses')) {",
    "    if (!valid) {",
    "      return new Response(JSON.stringify({ error: { message: 'invalid api key' } }), { status: 401, headers: { 'content-type': 'application/json' } });",
    "    }",
    "    return new Response(JSON.stringify({ output_text: 'OK', usage: { input_tokens: 4, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });",
    "  }",
    "  return new Response(JSON.stringify({ error: { message: `unexpected URL ${target}` } }), { status: 500, headers: { 'content-type': 'application/json' } });",
    "};",
    "function header(headers, name) {",
    "  if (!headers) return '';",
    "  if (typeof headers.get === 'function') return headers.get(name) || '';",
    "  return headers[name] || headers[name.toLowerCase()] || '';",
    "}"
  ].join("\n"));
  return preloadPath;
}

function createFetchOpenAiGenerationFailureStub(projectRoot: string): string {
  const preloadPath = path.join(projectRoot, "fetch-openai-generation-failure-preload.cjs");
  fs.writeFileSync(preloadPath, [
    "global.fetch = async (url, init = {}) => {",
    "  const target = String(url);",
    "  if (target.endsWith('/models')) {",
    "    return new Response(JSON.stringify({ data: [{ id: 'gpt-5.4' }] }), { status: 200, headers: { 'content-type': 'application/json' } });",
    "  }",
    "  if (target.endsWith('/responses')) {",
    "    return new Response(JSON.stringify({ output: [], usage: { input_tokens: 4, output_tokens: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } });",
    "  }",
    "  return new Response(JSON.stringify({ error: { message: `unexpected URL ${target}` } }), { status: 500, headers: { 'content-type': 'application/json' } });",
    "};"
  ].join("\n"));
  return preloadPath;
}

function createFetchGitHubRepoSuccessStub(projectRoot: string): string {
  const preloadPath = path.join(projectRoot, "fetch-github-repo-success-preload.cjs");
  fs.writeFileSync(preloadPath, [
    "global.fetch = async (url, init = {}) => {",
    "  const target = String(url);",
    "  const auth = header(init.headers, 'Authorization');",
    "  if (target === 'https://api.github.com/repos/king/real-product-harness') {",
    "    if (!auth.includes('gh-cli-secret')) {",
    "      return new Response(JSON.stringify({ message: 'bad credentials' }), { status: 401, headers: { 'content-type': 'application/json' } });",
    "    }",
    "    return new Response(JSON.stringify({",
    "      id: 123456,",
    "      full_name: 'king/real-product-harness',",
    "      html_url: 'https://github.com/king/real-product-harness',",
    "      visibility: 'public',",
    "      private: false,",
    "      default_branch: 'main'",
    "    }), { status: 200, headers: { 'content-type': 'application/json' } });",
    "  }",
    "  return new Response(JSON.stringify({ error: { message: `unexpected URL ${target}` } }), { status: 500, headers: { 'content-type': 'application/json' } });",
    "};",
    "function header(headers, name) {",
    "  if (!headers) return '';",
    "  if (typeof headers.get === 'function') return headers.get(name) || '';",
    "  return headers[name] || headers[name.toLowerCase()] || '';",
    "}"
  ].join("\n"));
  return preloadPath;
}

function createFetchMcpRuntimeStub(projectRoot: string): string {
  const preloadPath = path.join(projectRoot, "fetch-mcp-runtime-preload.cjs");
  fs.writeFileSync(preloadPath, [
    "let responseCallCount = 0;",
    "global.fetch = async (url, init = {}) => {",
    "  const target = String(url);",
    "  const body = typeof init.body === 'string' && init.body ? JSON.parse(init.body) : {};",
    "  if (target.endsWith('/models')) {",
    "    return json({ data: [{ id: 'gpt-5.4' }] });",
    "  }",
    "  if (target.endsWith('/responses')) {",
    "    responseCallCount += 1;",
    "    const input = typeof body.input === 'string' ? body.input : '';",
    "    const smoke = input.includes('Reply with exactly OK.');",
    "    const observed = input.includes('Tool observations:');",
    "    const text = smoke",
    "      ? 'OK'",
    "      : observed",
    "        ? JSON.stringify({ action: { type: 'respond', message: 'Protocol MCP echo returned acceptance-mcp-ok.' } })",
    "        : JSON.stringify({ action: { type: 'tool_call', tool: 'mcp.tools.call', args: { server: 'stitch', toolName: 'echo', readOnly: true, arguments: { text: 'acceptance-mcp-ok' } } } });",
    "    return json({ output: [{ type: 'message', content: [{ type: 'output_text', text }] }], usage: { input_tokens: 10, output_tokens: 5 }, responseCallCount });",
    "  }",
    "  if (target.includes('stitch.googleapis.com/mcp') || target.includes('mcp.example.test/echo')) {",
    "    if (body.method === 'initialize') {",
    "      return json({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fake-stitch', version: '0.0.0' } } }, { 'Mcp-Session-Id': 'acceptance-session' });",
    "    }",
    "    if (body.method === 'notifications/initialized') {",
    "      return json({});",
    "    }",
    "    if (body.method === 'tools/list') {",
    "      return json({ jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'echo', description: 'Echo a read-only string.', annotations: { readOnlyHint: true }, inputSchema: { type: 'object', properties: { text: { type: 'string' } } } }] } });",
    "    }",
    "    if (body.method === 'tools/call') {",
    "      return json({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: `echo:${body.params?.arguments?.text ?? ''}` }], structuredContent: { echoed: body.params?.arguments?.text ?? null }, isError: false } });",
    "    }",
    "  }",
    "  return json({ error: { message: `unexpected fetch ${target}` } }, {}, 500);",
    "};",
    "function json(data, headers = {}, status = 200) {",
    "  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });",
    "}"
  ].join("\n"));
  return preloadPath;
}

function createFetchMcpToolsListFailureStub(projectRoot: string): string {
  const preloadPath = path.join(projectRoot, "fetch-mcp-tools-list-failure-preload.cjs");
  fs.writeFileSync(preloadPath, [
    "global.fetch = async (url, init = {}) => {",
    "  const target = String(url);",
    "  const body = typeof init.body === 'string' && init.body ? JSON.parse(init.body) : {};",
    "  if (target.includes('stitch.googleapis.com/mcp')) {",
    "    if (body.method === 'initialize') {",
    "      return json({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fake-stitch', version: '0.0.0' } } }, { 'Mcp-Session-Id': 'protocol-failure-session' });",
    "    }",
    "    if (body.method === 'notifications/initialized') {",
    "      return json({});",
    "    }",
    "    if (body.method === 'tools/list') {",
    "      return json({ jsonrpc: '2.0', id: body.id, result: {} });",
    "    }",
    "  }",
    "  return json({ error: { message: `unexpected fetch ${target}` } }, {}, 500);",
    "};",
    "function json(data, headers = {}, status = 200) {",
    "  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });",
    "}"
  ].join("\n"));
  return preloadPath;
}

function createFetchProviderFallbackStub(projectRoot: string): string {
  const preloadPath = path.join(projectRoot, "fetch-provider-fallback-preload.cjs");
  fs.writeFileSync(preloadPath, [
    "global.fetch = async (url) => {",
    "  const target = String(url);",
    "  if (target.includes('api.openai.com')) {",
    "    return new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), { status: 429, headers: { 'content-type': 'application/json' } });",
    "  }",
    "  if (target.includes('generativelanguage.googleapis.com')) {",
    "    return new Response(JSON.stringify({",
    "      candidates: [{ content: { parts: [{ text: 'Gemini request-time fallback body' }] } }],",
    "      usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 4 }",
    "    }), { status: 200, headers: { 'content-type': 'application/json' } });",
    "  }",
    "  return new Response(JSON.stringify({ error: { message: `unexpected URL ${target}` } }), { status: 500, headers: { 'content-type': 'application/json' } });",
    "};"
  ].join("\n"));
  return preloadPath;
}

function createFetchMarkdownStub(projectRoot: string, markdown: string): string {
  const preloadPath = path.join(projectRoot, "fetch-markdown-preload.cjs");
  fs.writeFileSync(preloadPath, [
    "global.fetch = async () => {",
    `  const text = ${JSON.stringify(markdown)};`,
    "  return new Response(JSON.stringify({",
    "    output: [{ type: 'message', content: [{ type: 'output_text', text }] }],",
    "    usage: { input_tokens: 10, output_tokens: 20 }",
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
