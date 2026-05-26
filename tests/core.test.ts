import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import packageJson from "../package.json";
import { runParsedCommand } from "../apps/cli/src/index";
import {
  approveDesignArtifact,
  approveDocument,
  approveReleasePlan,
  advanceAfterPmApproval,
  advanceAfterPmDraft,
  advanceAfterPdApproval,
  applyNotionWorkspacePlan,
  canFinalizePm,
  canFinalizePd,
  createDevDeploymentPlan,
  createDesignArtifactVersion,
  createEngineeringDocumentVersion,
  createHotfixPlan,
  createHarnessConfig,
  buildOperatorWorkspace,
  connectionReportConfigFingerprint,
  addCustomProtocolMcpServer,
  bindMcpReadOnlyToolContracts,
  initializeHarnessConfig,
  createPullRequestDraft,
  createQaReview,
  createReleasePlan,
  createWorkIssue,
  captureGitHubIssueApprovalSnapshot,
  captureGitHubPullRequestApprovalSnapshot,
  createGitHubRepo,
  currentGitHubIssueApprovalSnapshot,
  currentGitHubPullRequestApprovalSnapshot,
  githubCliEnv,
  createLandingPreviewHtml,
  buildAiChatPrompt,
  assembleAgentContext,
  createBranchName,
  createAiRunRecord,
  createAiChatTurnRecord,
  createDocumentVersion,
  createNotionSyncPayload,
  createNotionWorkspacePlan,
  createObsidianProject,
  diffDocumentVersions,
  executeAgentTurn,
  exportDocumentToObsidian,
  exportDesignArtifactToObsidian,
  initProject,
  loadEnvFile,
  loadRuntimeSession,
  loadState,
  markIssueInProgress,
  normalizeNotionPageId,
  normalizeLabel,
  normalizeGitHubRepoTarget,
  parseCli,
  parseCommandLine,
  planOrchestrationAction,
  planAgentAction,
  readPullRequest,
  checkQaConflicts,
  runAgentFabricTool,
  runQaTests,
  runQaSecurityScan,
  runQaAccessibilityScan,
  finalizeQaReport,
  generateAiText,
  integrateAgentLaneBatch,
  prepareEngineeringDocumentState,
  preparePdArtifactState,
  preparePmDraftState,
  ConnectionCheck,
  HandoffPacket,
  ProjectState,
  readDocumentIndex,
  readDesignArtifactIndex,
  readHarnessConfigSnapshot,
  readProofLedgerEvents,
  readProofLedgerLatest,
  renderSetupGuide,
  setupGitHubLabels,
  showDocument,
  showDesignArtifact,
  advanceAfterEngineeringApproval,
  syncStateDocuments,
  syncStateDesignArtifacts,
  syncHarnessConfigFromEnv,
  syncNotionPayloadLive,
  testMcpConnection,
  transitionState,
  createRuntimeSessionManifest,
  failRuntimeHandoffAttempt,
  heartbeatRuntimeHandoff,
  latestRuntimeSessionJournalRecord,
  loadRuntimeHandoffs,
  loadRuntimeExecutionGraph,
  loadRuntimeSessionJournal,
  materializeRuntimeHandoffsFromSession,
  materializeRuntimeExecutionGraph,
  approveAndStartRuntimeAction,
  approveRuntimeAction,
  claimRuntimeHandoff,
  classifyMutableAgentCommand,
  completeRuntimeHandoffAttempt,
  completeAgentLaneRun,
  completeRuntimeAction,
  loadRuntimeActionApprovals,
  mergeAgentLaneRun,
  recordAgentTurnState,
  recordLiveVerificationEvidence,
  recordRuntimeHandoff,
  recordRuntimeActionApproval,
  recordRuntimeSessionEvent,
  reconcileRuntimeStageQueue,
  rejectRuntimeAction,
  runtimeActionReadbackBindingError,
  captureOperatorMcpToolCallSnapshot,
  callOperatorMcpTool,
  mcpToolCallReadbackFile,
  runtimeHandoffExecutionToken,
  startAgentLaneRun,
  startRuntimeAction,
  startRuntimeHandoffWork,
  listPullRequests,
  listWorkIssues,
  readQaReport,
  recordQaAccessibilityReview,
  recordQaSecurityReview,
  runProductizeGoldenPath,
  saveRuntimeSession,
  saveState,
  replayRuntimeSession,
  runtimeSessionFile,
  runtimeActionApprovalsFile,
  runtimeHandoffsFile,
  runtimeExecutionGraphFile,
  runtimeSessionJournalFile,
  runtimeSessionSnapshotFile,
  upsertEnvFileValues,
  updateRuntimeSession,
  validateEnv,
  writeAiChatTurnRecord,
  writeConnectionReport,
  writeGitHubBranchPlan
} from "../packages/core/src";

let root: string;
let originalExitCode: typeof process.exitCode;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "rph-test-"));
  initProject(root, { projectName: "Test Product" });
  originalExitCode = process.exitCode;
  process.exitCode = 0;
});

function modeOf(filePath: string): number {
  return fs.statSync(filePath).mode & 0o777;
}

async function withProcessEnv<T>(
  overrides: Record<string, string | undefined>,
  run: () => Promise<T>
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function writeFakeGh(repoName: string, viewerPermission: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rph-core-fake-gh-"));
  const filePath = path.join(dir, "gh");
  fs.writeFileSync(filePath, [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "if [[ \"${1:-}\" == \"--version\" ]]; then",
    "  echo \"gh version 2.0.0\"",
    "  exit 0",
    "fi",
    "if [[ \"${1:-}\" == \"auth\" && \"${2:-}\" == \"status\" ]]; then",
    "  if [[ -z \"${GH_TOKEN:-}\" ]]; then",
    "    echo \"GH_TOKEN missing\" >&2",
    "    exit 1",
    "  fi",
    "  exit 0",
    "fi",
    "if [[ \"${1:-}\" == \"repo\" && \"${2:-}\" == \"view\" && \"${3:-}\" == \"" + repoName + "\" ]]; then",
    "  cat <<'JSON'",
    JSON.stringify({ nameWithOwner: repoName, viewerPermission }),
    "JSON",
    "  exit 0",
    "fi",
    "echo \"unexpected gh args: $*\" >&2",
    "exit 1",
    ""
  ].join("\n"));
  fs.chmodSync(filePath, 0o755);
  return filePath;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  process.exitCode = originalExitCode;
  fs.rmSync(root, { recursive: true, force: true });
});

function passedStitchConnectionCheck(checkedAt = new Date().toISOString()): ConnectionCheck {
  return {
    id: "stitch",
    kind: "mcp",
    status: "passed",
    message: "credential: tools/list passed (1 tools); protocol: tools/list passed",
    requiredEnv: ["STITCH_API_KEY"],
    missingEnv: [],
    endpoint: "https://stitch.googleapis.com/mcp",
    identity: {
      type: "mcp-server",
      label: "stitch",
      targetId: "stitch",
      verifiedBy: "protocol-tools-list",
      source: "configuration"
    },
    firstActionProof: {
      action: "mcp.tools.list",
      label: "listed 1 MCP tools",
      targetId: "stitch",
      verifiedBy: "protocol-tools-list",
      endpoint: "https://stitch.googleapis.com/mcp"
    },
    readiness: {
      mode: "protocol-ready",
      provenStage: "protocol-tools-list",
      stages: [
        { stage: "transport", status: "passed", message: "transport reachable", endpoint: "https://stitch.googleapis.com/mcp" },
        { stage: "credential-probe", status: "passed", message: "initialize passed", endpoint: "https://stitch.googleapis.com/mcp" },
        { stage: "protocol-tools-list", status: "passed", message: "tools/list passed", endpoint: "https://stitch.googleapis.com/mcp" }
      ]
    },
    checkedAt
  };
}

function recordPassedLiveVerification(projectRoot: string, checkedAt = new Date().toISOString()): void {
  const check = passedStitchConnectionCheck(checkedAt);
  const reportPath = writeConnectionReport(projectRoot, [check]);
  recordLiveVerificationEvidence(projectRoot, [check], reportPath);
}

function trustedLiveContext() {
  return { liveVerificationTrusted: true };
}

describe("workflow state machine", () => {
  it("moves from setup to PM interview", () => {
    const state = loadState(root);
    const next = transitionState(state, "PM_PRODUCT_DEFINITION_INTERVIEW", "test");
    expect(next.currentStage).toBe("PM_PRODUCT_DEFINITION_INTERVIEW");
  });

  it("blocks approval stage without required approval", () => {
    const state = loadState(root);
    expect(() => transitionState(state, "PM_PRODUCT_DEFINITION_APPROVED", "test")).toThrow(/required approval|cannot move/);
  });

  it("requires QA, release, and deployment evidence for late-stage advancement", () => {
    saveState(root, { ...loadState(root), currentStage: "QA_REVIEW" });
    expect(() => transitionState(loadState(root), "READY_FOR_RELEASE", "test")).toThrow(/QA evidence missing/);

    spawnSync("git", ["init"], { cwd: root, encoding: "utf8" });
    const issue = createWorkIssue(root, {
      workstream: "FE",
      title: "Ship runtime panel",
      relatedDocs: ["requirements", "screen-definition", "feature-definition", "fe-technical-spec", "api-contract"]
    });
    const pr = createPullRequestDraft(root, issue.issueNumber);
    createQaReview(root, pr.prNumber);
    checkQaConflicts(root, pr.prNumber);
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "late-stage-fixture" }));
    const fakeBinDir = path.join(root, "bin");
    const originalPath = process.env.PATH ?? "";
    fs.mkdirSync(fakeBinDir, { recursive: true });
    fs.writeFileSync(path.join(fakeBinDir, "pnpm"), "#!/bin/sh\nexit 0\n");
    fs.chmodSync(path.join(fakeBinDir, "pnpm"), 0o755);
    process.env.PATH = `${fakeBinDir}${path.delimiter}${originalPath}`;
    try {
      runQaTests(root, pr.prNumber);
    } finally {
      process.env.PATH = originalPath;
    }
    recordQaSecurityReview(root, pr.prNumber, "clear", "Manual threat review completed");
    recordQaAccessibilityReview(root, pr.prNumber, "clear", "Keyboard and screen-reader pass completed");
    finalizeQaReport(root, pr.prNumber);

    let state = transitionState(loadState(root), "READY_FOR_RELEASE", "qa evidence approved");
    expect(state.currentStage).toBe("READY_FOR_RELEASE");
    saveState(root, state);
    expect(() => transitionState(loadState(root), "RELEASE_REVIEW", "test")).toThrow(/release evidence missing/);

    const release = createReleasePlan(root, "v0.1.0");
    expect(() => transitionState(loadState(root), "RELEASE_REVIEW", "test")).toThrow(/live verification evidence missing/);
    recordPassedLiveVerification(root);
    expect(() => transitionState(loadState(root), "RELEASE_REVIEW", "test")).toThrow(/live verification evidence must be revalidated/);
    state = transitionState(loadState(root), "RELEASE_REVIEW", "release plan created", trustedLiveContext());
    expect(state.currentStage).toBe("RELEASE_REVIEW");
    saveState(root, state);
    expect(() => transitionState(loadState(root), "RELEASE_APPROVED", "test")).toThrow(/release plan must be explicitly approved/);

    approveReleasePlan(root, release.id);
    state = transitionState(loadState(root), "RELEASE_APPROVED", "release approved", trustedLiveContext());
    expect(state.currentStage).toBe("RELEASE_APPROVED");
    saveState(root, state);
    expect(() => transitionState(loadState(root), "PRODUCTION_DEPLOYED", "test")).toThrow(/deployment evidence missing/);

    createDevDeploymentPlan(root, "local", "deployed");
    state = transitionState(loadState(root), "PRODUCTION_DEPLOYED", "deployment recorded");
    expect(state.currentStage).toBe("PRODUCTION_DEPLOYED");
  });

  it("blocks release review when live verification is missing, failed, skipped, or non-live", () => {
    const release = createReleasePlan(root, "v0.2.0");
    saveState(root, {
      ...loadState(root),
      currentStage: "READY_FOR_RELEASE",
      evidence: {
        ...loadState(root).evidence,
        qa: {
          status: "approved",
          approvedPrs: [1],
          pendingPrs: [],
          changesRequestedPrs: [],
          updatedAt: new Date().toISOString()
        },
        release: {
          id: release.id,
          version: release.version,
          status: release.status,
          userApproval: release.userApproval,
          filePath: release.filePath,
          updatedAt: release.updatedAt
        }
      }
    });

    expect(() => transitionState(loadState(root), "RELEASE_REVIEW", "test")).toThrow(/live verification evidence missing/);

    const failedCheck: ConnectionCheck = {
      ...passedStitchConnectionCheck(),
      status: "failed",
      message: "401"
    };
    let reportPath = writeConnectionReport(root, [failedCheck]);
    recordLiveVerificationEvidence(root, [failedCheck], reportPath);
    expect(() => transitionState(loadState(root), "RELEASE_REVIEW", "test")).toThrow(/live verification evidence not current: status=failed/);

    const skippedCheck: ConnectionCheck = {
      ...passedStitchConnectionCheck(),
      status: "skipped",
      missingEnv: ["STITCH_API_KEY"],
      message: "missing env"
    };
    reportPath = writeConnectionReport(root, [skippedCheck]);
    recordLiveVerificationEvidence(root, [skippedCheck], reportPath);
    expect(() => transitionState(loadState(root), "RELEASE_REVIEW", "test")).toThrow(/live verification evidence not current: status=missing/);

    const passedCheck = passedStitchConnectionCheck();
    reportPath = writeConnectionReport(root, [passedCheck], { source: "mock" });
    recordLiveVerificationEvidence(root, [passedCheck], reportPath, { source: "mock" });
    expect(() => transitionState(loadState(root), "RELEASE_REVIEW", "test")).toThrow(/live verification evidence not current: status=not-current/);

    recordPassedLiveVerification(root);
    expect(() => transitionState(loadState(root), "RELEASE_REVIEW", "live proof current")).toThrow(/live verification evidence must be revalidated/);
    const next = transitionState(loadState(root), "RELEASE_REVIEW", "live proof current", trustedLiveContext());
    expect(next.currentStage).toBe("RELEASE_REVIEW");
  });

  it("revalidates the latest live report trust before executing a release transition", async () => {
    const release = createReleasePlan(root, "v0.3.0");
    const now = new Date().toISOString();
    saveState(root, {
      ...loadState(root),
      currentStage: "READY_FOR_RELEASE",
      evidence: {
        ...loadState(root).evidence,
        qa: {
          status: "approved",
          approvedPrs: [1],
          pendingPrs: [],
          changesRequestedPrs: [],
          updatedAt: now
        },
        release: {
          id: release.id,
          version: release.version,
          status: release.status,
          userApproval: release.userApproval,
          filePath: release.filePath,
          updatedAt: release.updatedAt
        }
      }
    });
    recordPassedLiveVerification(root, now);
    const reportPath = writeConnectionReport(root, [passedStitchConnectionCheck(now)]);
    recordLiveVerificationEvidence(root, [passedStitchConnectionCheck(now)], reportPath);
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as {
      checkedAt?: string;
      provenance?: { generatedAt?: string };
    };
    report.checkedAt = "2026-05-22T00:00:00.000Z";
    if (report.provenance) {
      report.provenance.generatedAt = "2026-05-22T00:00:00.000Z";
    }
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await runParsedCommand(root, parseCli(["next", "--execute"]))).toBe(true);
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("stage queue 실행 차단");
    expect(output).toContain("latest live report not trusted (stale-report)");
    expect(loadState(root).currentStage).toBe("READY_FOR_RELEASE");
    expect(process.exitCode).toBe(1);
  });

  it("keeps agent-lane release readiness blocked until integrator proof exists", () => {
    saveState(root, { ...loadState(root), currentStage: "QA_REVIEW" });
    spawnSync("git", ["init"], { cwd: root, encoding: "utf8" });
    const issue = createWorkIssue(root, {
      workstream: "FE",
      title: "Ship runtime panel",
      relatedDocs: ["requirements", "screen-definition", "feature-definition", "fe-technical-spec", "api-contract"]
    });
    const pr = createPullRequestDraft(root, issue.issueNumber);
    createQaReview(root, pr.prNumber);
    checkQaConflicts(root, pr.prNumber);
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "agent-integration-fixture" }));
    const fakeBinDir = path.join(root, "bin");
    const originalPath = process.env.PATH ?? "";
    fs.mkdirSync(fakeBinDir, { recursive: true });
    fs.writeFileSync(path.join(fakeBinDir, "pnpm"), "#!/bin/sh\nexit 0\n");
    fs.chmodSync(path.join(fakeBinDir, "pnpm"), 0o755);
    process.env.PATH = `${fakeBinDir}${path.delimiter}${originalPath}`;
    try {
      runQaTests(root, pr.prNumber);
    } finally {
      process.env.PATH = originalPath;
    }
    recordQaSecurityReview(root, pr.prNumber, "clear", "Manual threat review completed");
    recordQaAccessibilityReview(root, pr.prNumber, "clear", "Keyboard and screen-reader pass completed");
    finalizeQaReport(root, pr.prNumber);

    const releasePacket: HandoffPacket = {
      fromAgent: "Orchestrator",
      toAgent: "FE",
      stage: "FE_SPEC",
      summary: "FE release-readiness lane",
      artifactRefs: ["document:fe-technical-spec"],
      acceptanceCriteria: ["FE lane has been integrated"],
      blockers: [],
      nextCommand: "/fe spec --ai",
      createdAt: "2026-05-22T00:00:00.000Z"
    };
    const handoff = recordRuntimeHandoff(root, "session-release-readiness", releasePacket);
    const claimed = claimRuntimeHandoff(root, handoff.id, "test-release-worker");
    const claimToken = runtimeHandoffExecutionToken(claimed);
    const lane = startAgentLaneRun(root, {
      sessionId: handoff.sessionId,
      handoffId: handoff.id,
      workerId: "test-release-worker",
      workerSessionId: claimed.workerSessionId,
      claimToken: claimToken.claimToken,
      attempt: claimed.attempts,
      packet: releasePacket,
      command: "/fe spec --ai"
    });
    const workToken = { ...claimToken, laneRunId: lane.id };
    startRuntimeHandoffWork(root, handoff.id, workToken, lane.id);

    expect(() => transitionState(loadState(root), "READY_FOR_RELEASE", "qa evidence approved"))
      .toThrow(/agent integration evidence missing/);

    completeAgentLaneRun(root, lane.id, { ok: true, executedCommand: "/fe spec --ai" });
    completeRuntimeHandoffAttempt(root, handoff.id, workToken, "completed release readiness lane");
    integrateAgentLaneBatch(root, [lane.id], "release readiness integrated FE lane result");

    const state = transitionState(loadState(root), "READY_FOR_RELEASE", "qa evidence and integrator proof approved");
    expect(state.currentStage).toBe("READY_FOR_RELEASE");
  });

  it("advances PM documents through approval gates", () => {
    let state = transitionState(loadState(root), "PM_PRODUCT_DEFINITION_INTERVIEW", "start");
    let index = createDocumentVersion(root, "product-definition", { changeSummary: "initial" });
    state = advanceAfterPmDraft(syncStateDocuments(state, index), "product-definition");
    expect(state.currentStage).toBe("PM_PRODUCT_DEFINITION_REVIEW");
    approveDocument(root, "product-definition", "tester");
    state = advanceAfterPmApproval(syncStateDocuments(state, readDocumentIndex(root, "product-definition")), "product-definition");
    expect(state.currentStage).toBe("PM_PRODUCT_DEFINITION_APPROVED");

    state = preparePmDraftState(state, "competitor-analysis");
    expect(state.currentStage).toBe("PM_COMPETITOR_ANALYSIS");
    index = createDocumentVersion(root, "competitor-analysis", { changeSummary: "initial" });
    approveDocument(root, "competitor-analysis", "tester");
    state = advanceAfterPmApproval(syncStateDocuments(state, readDocumentIndex(root, "competitor-analysis")), "competitor-analysis");
    expect(state.currentStage).toBe("PM_DIFFERENTIATION");

    index = createDocumentVersion(root, "differentiation", { changeSummary: "initial" });
    approveDocument(root, "differentiation", "tester");
    state = advanceAfterPmApproval(syncStateDocuments(state, readDocumentIndex(root, "differentiation")), "differentiation");
    expect(state.currentStage).toBe("PM_REQUIREMENTS_INTERVIEW");
    expect(index.docId).toBe("differentiation");
  });

  it("reports PM finalize blockers", () => {
    const state = loadState(root);
    expect(canFinalizePm(state).missing).toContain("product-definition");
  });
});

describe("document versions", () => {
  it("creates versioned markdown documents", () => {
    const first = createDocumentVersion(root, "product-definition", { changeSummary: "initial" });
    const second = createDocumentVersion(root, "product-definition", { changeSummary: "revision", body: "# Revised" });
    expect(first.currentVersion).toBe("v1.0.0");
    expect(second.currentVersion).toBe("v1.0.1");
    expect(showDocument(root, "product-definition", "v1.0.1")).toContain("# Revised");
  });

  it("diffs two versions", () => {
    createDocumentVersion(root, "product-definition", { changeSummary: "initial", body: "# A" });
    createDocumentVersion(root, "product-definition", { changeSummary: "revision", body: "# B" });
    expect(diffDocumentVersions(root, "product-definition", "v1.0.0", "v1.0.1")).toContain("+ # B");
  });
});

describe("productize golden path", () => {
  it("creates a review-ready execution package without placeholders", () => {
    const idea = "AI 회의록을 액션아이템과 담당자 추적으로 바꾸는 SaaS";
    const result = runProductizeGoldenPath(root, { idea });

    expect(result.documents).toHaveLength(11);
    expect(result.designArtifacts).toHaveLength(5);
    expect(result.issues).toHaveLength(2);
    expect(result.pullRequests).toHaveLength(2);
    expect(result.qaReports).toHaveLength(2);
    expect(result.stage).toBe("PM_PRODUCT_DEFINITION_REVIEW");
    expect(fs.existsSync(result.reportPath)).toBe(true);
    expect(fs.existsSync(result.reportMarkdownPath)).toBe(true);

    for (const document of result.documents) {
      expect(showDocument(root, document.docId)).not.toMatch(/\bTBD\b/);
      expect(document.status).toBe("review");
    }
    for (const artifact of result.designArtifacts) {
      expect(showDesignArtifact(root, artifact.artifactId)).not.toMatch(/\bTBD\b/);
      expect(artifact.status).toBe("review");
    }

    const issues = listWorkIssues(root);
    expect(issues.map((issue) => issue.assigneeAgent)).toEqual(["FE", "BE"]);
    for (const issue of issues) {
      expect(issue.acceptanceCriteria.join("\n")).not.toMatch(/\bTBD\b/);
      expect(issue.relatedDocs).toContain("requirements");
      expect(issue.relatedApis.length).toBeGreaterThan(0);
    }

    const prs = listPullRequests(root);
    expect(prs.map((pr) => pr.userApproval)).toEqual(["required", "required"]);
    for (const pr of prs) {
      const body = fs.readFileSync(path.join(root, ".rph", "prs", `issue-${pr.issueNumber}.md`), "utf8");
      expect(body).not.toMatch(/\bTBD\b/);
      expect(body).toContain("## Changes");
    }

    const feQa = readQaReport(root, result.pullRequests[0].prNumber);
    expect(feQa.requirementStatus).toBe("matched");
    expect(feQa.designStatus).toBe("matched");
    expect(feQa.apiContractStatus).toBe("matched");
    expect(feQa.securityStatus).toBe("unknown");
    expect(feQa.accessibilityStatus).toBe("unknown");
    expect(feQa.findings).toContain("Security review not run; status remains unknown");
    expect(feQa.findings).toContain("Accessibility review not run; status remains unknown");
    expect(feQa.findings).toContain("Release blocker: security status is unknown until a dedicated security review clears it or records a risk");
    expect(feQa.findings).toContain("Release blocker: accessibility status is unknown until a dedicated accessibility review clears it or records a risk");
    const qaMarkdown = fs.readFileSync(path.join(root, ".rph", "qa", `pr-${feQa.prNumber}-report.md`), "utf8");
    expect(qaMarkdown).toContain("- security_status: unknown");
    expect(qaMarkdown).toContain("- accessibility_status: unknown");
    const beQa = readQaReport(root, result.pullRequests[1].prNumber);
    expect(result.qaReports.map((report) => report.securityStatus)).toEqual(["unknown", "unknown"]);
    expect(result.qaReports.map((report) => report.accessibilityStatus)).toEqual(["unknown", "unknown"]);
    expect(beQa.securityStatus).toBe("unknown");
    expect(beQa.accessibilityStatus).toBe("unknown");

    const report = fs.readFileSync(result.reportMarkdownPath, "utf8");
    expect(report).toContain("Productize Golden Path Report");
    expect(report).toContain("/docs approve product-definition --by user");
    expect(report).not.toMatch(/\bTBD\b/);
  });

  it("makes productized documents domain-specific instead of generic copies", () => {
    const meetingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-productize-domain-meeting-"));
    const interviewRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-productize-domain-interview-"));
    try {
      initProject(meetingRoot, { projectName: "Meeting Product" });
      initProject(interviewRoot, { projectName: "Interview Product" });

      runProductizeGoldenPath(meetingRoot, { idea: "AI 회의록을 액션아이템과 담당자 추적으로 바꾸는 SaaS" });
      runProductizeGoldenPath(interviewRoot, { idea: "고객 인터뷰 내용을 태그와 인사이트로 정리하는 SaaS" });

      const meetingDefinition = showDocument(meetingRoot, "product-definition").replace(/AI 회의록을 액션아이템과 담당자 추적으로 바꾸는 SaaS/g, "<idea>");
      const interviewDefinition = showDocument(interviewRoot, "product-definition").replace(/고객 인터뷰 내용을 태그와 인사이트로 정리하는 SaaS/g, "<idea>");
      const meetingApi = showDocument(meetingRoot, "api-contract").replace(/AI 회의록을 액션아이템과 담당자 추적으로 바꾸는 SaaS/g, "<idea>");
      const interviewApi = showDocument(interviewRoot, "api-contract").replace(/고객 인터뷰 내용을 태그와 인사이트로 정리하는 SaaS/g, "<idea>");

      expect(meetingDefinition).not.toBe(interviewDefinition);
      expect(meetingApi).not.toBe(interviewApi);
      expect(meetingDefinition).toContain("ActionItem");
      expect(meetingApi).toContain("/api/domain/action-items");
      expect(interviewDefinition).toContain("Insight");
      expect(interviewApi).toContain("/api/domain/insights");
    } finally {
      fs.rmSync(meetingRoot, { recursive: true, force: true });
      fs.rmSync(interviewRoot, { recursive: true, force: true });
    }
  });
});

describe("approval gate", () => {
  it("records approval and marks current document approved", () => {
    const index = createDocumentVersion(root, "product-definition", { changeSummary: "initial" });
    const state = syncStateDocuments(loadState(root), index);
    expect(state.documents["product-definition"]?.currentVersion).toBe("v1.0.0");
    const approval = approveDocument(root, "product-definition", "tester");
    const approvedIndex = readDocumentIndex(root, "product-definition");
    expect(approval.approvedBy).toBe("tester");
    expect(approvedIndex.status).toBe("approved");
  });
});

describe("PD workflow", () => {
  it("blocks PD direction before references approval", () => {
    let state = transitionState(loadState(root), "PM_PRODUCT_DEFINITION_INTERVIEW", "start");
    state = { ...state, currentStage: "PM_APPROVED" as const };
    state = transitionState(state, "PD_REFERENCES", "pd start");
    expect(() => preparePdArtifactState(state, "directions")).toThrow(/required design/);
  });

  it("creates and approves PD artifacts through review", () => {
    let state: ProjectState = { ...loadState(root), currentStage: "PM_APPROVED" };
    state = transitionState(state, "PD_REFERENCES", "pd start");

    let index = createDesignArtifactVersion(root, "references", { changeSummary: "initial" });
    state = syncStateDesignArtifacts(state, index);
    state = syncStateDesignArtifacts(state, approveAndReadDesign(root, "references"));
    state = advanceAfterPdApproval(state, "references");
    expect(state.currentStage).toBe("PD_DIRECTIONS");

    index = createDesignArtifactVersion(root, "directions", { changeSummary: "initial" });
    state = syncStateDesignArtifacts(state, index);
    state = syncStateDesignArtifacts(state, approveAndReadDesign(root, "directions"));
    state = advanceAfterPdApproval(state, "directions");
    expect(state.currentStage).toBe("PD_LANDING_PREVIEWS");

    index = createDesignArtifactVersion(root, "landing-preview", { changeSummary: "initial" });
    state = syncStateDesignArtifacts(state, index);
    expect(fs.existsSync(createLandingPreviewHtml(root))).toBe(true);
    state = syncStateDesignArtifacts(state, approveAndReadDesign(root, "landing-preview"));
    state = advanceAfterPdApproval(state, "landing-preview");
    expect(state.currentStage).toBe("PD_DESIGN_SYSTEM");

    index = createDesignArtifactVersion(root, "design-system", { changeSummary: "initial" });
    state = syncStateDesignArtifacts(state, index);
    state = syncStateDesignArtifacts(state, approveAndReadDesign(root, "design-system"));
    state = advanceAfterPdApproval(state, "design-system");
    expect(state.currentStage).toBe("PD_PAGE_DESIGNS");

    index = createDesignArtifactVersion(root, "page-designs", { changeSummary: "initial" });
    state = syncStateDesignArtifacts(state, index);
    state = syncStateDesignArtifacts(state, approveAndReadDesign(root, "page-designs"));
    state = advanceAfterPdApproval(state, "page-designs");
    expect(state.currentStage).toBe("PD_REVIEW");
    expect(canFinalizePd(state).ok).toBe(true);
  });
});

function approveAndReadDesign(rootPath: string, artifactId: Parameters<typeof readDesignArtifactIndex>[1]) {
  approveDesignArtifact(rootPath, artifactId, "tester");
  return readDesignArtifactIndex(rootPath, artifactId);
}

describe("FE/BE workflow", () => {
  it("blocks FE spec before PD approval", () => {
    const state = loadState(root);
    expect(() => prepareEngineeringDocumentState(state, "fe-technical-spec")).toThrow(/cannot move|required design/);
  });

  it("advances engineering specs and sprint plans through approval gates", () => {
    let state: ProjectState = approvedPdState(root);

    state = prepareEngineeringDocumentState(state, "fe-technical-spec");
    let index = createEngineeringDocumentVersion(root, "fe-technical-spec", { changeSummary: "initial" });
    state = syncStateDocuments(state, index);
    approveDocument(root, "fe-technical-spec", "tester");
    state = advanceAfterEngineeringApproval(syncStateDocuments(state, readDocumentIndex(root, "fe-technical-spec")), "fe-technical-spec");
    expect(state.currentStage).toBe("BE_SPEC");

    index = createEngineeringDocumentVersion(root, "be-technical-spec", { changeSummary: "initial" });
    state = syncStateDocuments(state, index);
    approveDocument(root, "be-technical-spec", "tester");
    state = advanceAfterEngineeringApproval(syncStateDocuments(state, readDocumentIndex(root, "be-technical-spec")), "be-technical-spec");
    expect(state.currentStage).toBe("BE_SPEC");

    index = createEngineeringDocumentVersion(root, "api-contract", { changeSummary: "initial" });
    state = syncStateDocuments(state, index);
    approveDocument(root, "api-contract", "tester");
    state = advanceAfterEngineeringApproval(syncStateDocuments(state, readDocumentIndex(root, "api-contract")), "api-contract");
    expect(state.currentStage).toBe("SPRINT_PLANNING");

    index = createEngineeringDocumentVersion(root, "fe-sprint-plan", { changeSummary: "initial" });
    state = syncStateDocuments(state, index);
    approveDocument(root, "fe-sprint-plan", "tester");
    state = advanceAfterEngineeringApproval(syncStateDocuments(state, readDocumentIndex(root, "fe-sprint-plan")), "fe-sprint-plan");
    expect(state.currentStage).toBe("SPRINT_PLANNING");

    index = createEngineeringDocumentVersion(root, "be-sprint-plan", { changeSummary: "initial" });
    state = syncStateDocuments(state, index);
    approveDocument(root, "be-sprint-plan", "tester");
    state = advanceAfterEngineeringApproval(syncStateDocuments(state, readDocumentIndex(root, "be-sprint-plan")), "be-sprint-plan");
    expect(state.currentStage).toBe("IMPLEMENTATION");
  });

  it("creates local issues, PR drafts, and dev deployment hooks", () => {
    const issue = createWorkIssue(root, {
      workstream: "FE",
      title: "Build dashboard shell",
      label: "refator",
      acceptanceCriteria: ["renders shell"]
    });
    expect(issue.issueNumber).toBe(1);
    expect(issue.label).toBe("refactor");
    expect(issue.branchName).toBe("refactor/01-build-dashboard-shell");

    const started = markIssueInProgress(root, issue.issueNumber);
    expect(started.status).toBe("in-progress");

    const pr = createPullRequestDraft(root, issue.issueNumber);
    expect(pr.prNumber).toBe(1);
    expect(pr.targetBranch).toBe("dev");
    expect(pr.userApproval).toBe("required");
    expect(fs.existsSync(path.join(root, ".rph", "prs", "issue-1.json"))).toBe(true);
    expect(readPullRequest(root, 1).issueNumber).toBe(1);

    const deployment = createDevDeploymentPlan(root, "local");
    expect(deployment.approvalRequired).toBe(true);
    expect(fs.existsSync(deployment.filePath)).toBe(true);
  });

  it("records FE work execution files from the CLI work command", async () => {
    saveState(root, { ...loadState(root), currentStage: "IMPLEMENTATION" });
    const issue = createWorkIssue(root, {
      workstream: "FE",
      title: "Build dashboard shell",
      acceptanceCriteria: ["renders shell"]
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const ok = await runParsedCommand(root, parseCli(["fe", "work", "--issue", String(issue.issueNumber)]));

    expect(ok).toBe(true);
    const executionFile = path.join(root, ".rph", "work", "issue-1-execution.md");
    expect(fs.existsSync(executionFile)).toBe(true);
    expect(fs.readFileSync(executionFile, "utf8")).toContain("- status: prepared");
    expect(logSpy.mock.calls.flat().join("\n")).toContain("실제 브랜치 준비까지 하려면: --execute");
  });

  it("records QA reports and release gates without merging", () => {
    const issue = createWorkIssue(root, { workstream: "BE", title: "Add health endpoint" });
    const pr = createPullRequestDraft(root, issue.issueNumber);
    const review = createQaReview(root, pr.prNumber);
    expect(review.userMergeDecisionRequired).toBe(true);
    expect(fs.existsSync(path.join(root, ".rph", "qa", "pr-1-report.md"))).toBe(true);

    const testReport = runQaTests(root, pr.prNumber);
    expect(testReport.testStatus).toBe("not-run");
    const finalReport = finalizeQaReport(root, pr.prNumber);
    expect(finalReport.status).toBe("changes-requested");
    expect(finalReport.findings).toContain("Final merge decision has blocking QA changes");
    expect(finalReport.findings).toContain("Release blocker: security status is unknown until a dedicated security review clears it or records a risk");
    expect(finalReport.findings).toContain("Release blocker: accessibility status is unknown until a dedicated accessibility review clears it or records a risk");

    const release = createReleasePlan(root, "v0.1.0");
    const hotfix = createHotfixPlan(root, "Patch auth regression");
    expect(release.userApproval).toBe("required");
    expect(hotfix.kind).toBe("hotfix");
    expect(fs.existsSync(release.filePath)).toBe(true);
    expect(fs.existsSync(hotfix.filePath)).toBe(true);
  });

  it("keeps security and accessibility unknown until dedicated reviews clear them", () => {
    const issue = createWorkIssue(root, { workstream: "FE", title: "Ship dashboard polish" });
    const pr = createPullRequestDraft(root, issue.issueNumber);
    createQaReview(root, pr.prNumber);
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "qa-fixture" }));
    const fakeBinDir = path.join(root, "bin");
    const originalPath = process.env.PATH ?? "";
    fs.mkdirSync(fakeBinDir, { recursive: true });
    fs.writeFileSync(path.join(fakeBinDir, "pnpm"), "#!/bin/sh\nexit 0\n");
    fs.chmodSync(path.join(fakeBinDir, "pnpm"), 0o755);
    process.env.PATH = `${fakeBinDir}${path.delimiter}${originalPath}`;
    let testReport: ReturnType<typeof runQaTests>;
    try {
      testReport = runQaTests(root, pr.prNumber);
    } finally {
      process.env.PATH = originalPath;
    }

    expect(testReport.testStatus).toBe("passed");
    expect(testReport.securityStatus).toBe("unknown");
    expect(testReport.accessibilityStatus).toBe("unknown");
    expect(testReport.findings).toContain("Security-adjacent static checks passed; dedicated security review still required");
    expect(testReport.findings).toContain("Accessibility-adjacent static checks passed; dedicated accessibility review still required");
    expect(testReport.findings).toContain("Security review not run; status remains unknown");
    expect(testReport.findings).toContain("Accessibility review not run; status remains unknown");
    expect(testReport.findings).toContain("Release blocker: security status is unknown until a dedicated security review clears it or records a risk");
    expect(testReport.findings).toContain("Release blocker: accessibility status is unknown until a dedicated accessibility review clears it or records a risk");
  });

  it("approves QA only after tests, conflict check, and dedicated security/accessibility reviews pass", () => {
    spawnSync("git", ["init"], { cwd: root, encoding: "utf8" });
    const issue = createWorkIssue(root, { workstream: "FE", title: "Ship dashboard polish" });
    const pr = createPullRequestDraft(root, issue.issueNumber);
    createQaReview(root, pr.prNumber);
    checkQaConflicts(root, pr.prNumber);
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "qa-fixture" }));
    const fakeBinDir = path.join(root, "bin");
    const originalPath = process.env.PATH ?? "";
    fs.mkdirSync(fakeBinDir, { recursive: true });
    fs.writeFileSync(path.join(fakeBinDir, "pnpm"), "#!/bin/sh\nexit 0\n");
    fs.chmodSync(path.join(fakeBinDir, "pnpm"), 0o755);
    process.env.PATH = `${fakeBinDir}${path.delimiter}${originalPath}`;
    try {
      runQaTests(root, pr.prNumber);
    } finally {
      process.env.PATH = originalPath;
    }
    recordQaSecurityReview(root, pr.prNumber, "clear", "Manual threat review completed");
    recordQaAccessibilityReview(root, pr.prNumber, "clear", "Keyboard and screen-reader pass completed");

    const finalReport = finalizeQaReport(root, pr.prNumber);

    expect(finalReport.status).toBe("approved");
    expect(finalReport.securityStatus).toBe("clear");
    expect(finalReport.accessibilityStatus).toBe("clear");
    expect(finalReport.findings).toContain("QA gates passed; user merge approval remains required");
    expect(finalReport.findings).not.toContain("Security-adjacent static checks passed; dedicated security review still required");
    expect(finalReport.findings).not.toContain("Accessibility-adjacent static checks passed; dedicated accessibility review still required");
  });

  it("can clear security and accessibility with automated evidence scans", () => {
    const issue = createWorkIssue(root, { workstream: "FE", title: "Ship dashboard polish" });
    const pr = createPullRequestDraft(root, issue.issueNumber);
    createQaReview(root, pr.prNumber);
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "qa-fixture" }));
    createLandingPreviewHtml(root);

    const fakeBinDir = path.join(root, "bin");
    const originalPath = process.env.PATH ?? "";
    fs.mkdirSync(fakeBinDir, { recursive: true });
    fs.writeFileSync(path.join(fakeBinDir, "pnpm"), "#!/bin/sh\nprintf '%s\\n' \"$*\" > audit.log\nexit 0\n");
    fs.chmodSync(path.join(fakeBinDir, "pnpm"), 0o755);
    process.env.PATH = `${fakeBinDir}${path.delimiter}${originalPath}`;
    let securityReport: ReturnType<typeof runQaSecurityScan>;
    try {
      securityReport = runQaSecurityScan(root, pr.prNumber);
    } finally {
      process.env.PATH = originalPath;
    }
    const accessibilityReport = runQaAccessibilityScan(root, pr.prNumber);

    expect(securityReport.securityStatus).toBe("clear");
    expect(accessibilityReport.accessibilityStatus).toBe("clear");
    expect(accessibilityReport.securityStatus).toBe("clear");
    expect(accessibilityReport.findings).toContain("Automated security audit passed: pnpm audit --audit-level high --prod");
    expect(accessibilityReport.findings.some((finding) => finding.startsWith("Automated accessibility structure scan passed:"))).toBe(true);
  });
});

describe("operator workspace", () => {
  it("summarizes an uninitialized folder without requiring project state", () => {
    const freshRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-workspace-fresh-"));
    try {
      const snapshot = buildOperatorWorkspace(freshRoot, {
        now: new Date("2026-05-26T00:00:00.000Z"),
        env: {} as NodeJS.ProcessEnv
      });

      expect(snapshot.schemaVersion).toBe("rph-operator-workspace-v0");
      expect(snapshot.initialized).toBe(false);
      expect(snapshot.runtime).toBeNull();
      expect(snapshot.artifacts.documents).toEqual([]);
      expect(snapshot.approvals.externalActions).toEqual([]);
      expect(snapshot.nextAction).toMatchObject({
        kind: "setup",
        command: "/setup auto --live",
        safeToAutoRun: true
      });
      expect(snapshot.readiness.status).toBe("needs-setup");
    } finally {
      fs.rmSync(freshRoot, { recursive: true, force: true });
    }
  });

  it("surfaces pending live-write approvals as manual next actions", () => {
    const record = recordRuntimeActionApproval(root, {
      sessionId: "session-workspace-approval",
      command: "/github create-issue --agent FE --title \"Ship operator workspace\" --live",
      reason: "agent proposed live GitHub issue"
    });
    saveRuntimeSession(root, {
      ...createRuntimeSessionManifest(root, "session-workspace-approval", "2026-05-26T00:00:00.000Z"),
      status: "blocked",
      blocker: "waiting for external approval",
      pendingExternalActionId: record.id
    });

    const snapshot = buildOperatorWorkspace(root, { now: new Date("2026-05-26T00:01:00.000Z") });
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.runtime?.pendingExternalActionId).toBe(record.id);
    expect(snapshot.nextAction).toMatchObject({
      kind: "approval",
      command: `/agent approve-action ${record.id}`,
      safeToAutoRun: false
    });
    expect(snapshot.approvals.externalActions[0]).toMatchObject({
      id: record.id,
      status: "pending",
      target: "github",
      action: "issue.create"
    });
    expect(snapshot.blockers).toContain(`external action pending: ${record.id}`);
    expect(serialized).not.toContain("approvedSnapshot");
    expect(serialized).not.toContain("snapshotFingerprint");
  });

  it("prioritizes live readiness repair over retrying a blocked AI session", () => {
    process.env.OPENAI_API_KEY = "test-openai";
    try {
      syncHarnessConfigFromEnv(root);
      saveRuntimeSession(root, {
        ...createRuntimeSessionManifest(root, "session-workspace-ai-blocked", "2026-05-26T00:00:00.000Z"),
        status: "blocked",
        blocker: "AI generation failed for configured providers: openai: AI request failed (401) Incorrect API key provided: test-openai."
      });

      const snapshot = buildOperatorWorkspace(root, { now: new Date("2026-05-26T00:01:00.000Z") });

      expect(snapshot.readiness.liveVerification).toBe("not-current");
      expect(snapshot.nextAction).toMatchObject({
        kind: "readiness",
        command: "/doctor --live",
        safeToAutoRun: true
      });
      expect(snapshot.nextAction.blockedBy.join("\n")).toContain("AI generation failed");
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it("aggregates PR and QA blockers into the operator snapshot", () => {
    const issue = createWorkIssue(root, {
      workstream: "FE",
      title: "Ship operator workspace",
      acceptanceCriteria: ["operator can see next action"]
    });
    const pr = createPullRequestDraft(root, issue.issueNumber);
    createQaReview(root, pr.prNumber);
    const finalReport = finalizeQaReport(root, pr.prNumber);

    const snapshot = buildOperatorWorkspace(root, { now: new Date("2026-05-26T00:02:00.000Z") });

    expect(finalReport.status).toBe("blocked");
    expect(readPullRequest(root, pr.prNumber).qaStatus).toBe("requested");
    expect(snapshot.pullRequests).toEqual([
      expect.objectContaining({
        prNumber: pr.prNumber,
        issueNumber: issue.issueNumber,
        qaStatus: "requested",
        qaReportStatus: "blocked",
        userApproval: "required",
        blockerReasons: expect.arrayContaining(["draft PR", "qa report blocked", "tests not run", "user approval required"])
      })
    ]);
    expect(snapshot.qaReports).toEqual([
      expect.objectContaining({
        prNumber: pr.prNumber,
        status: "blocked",
        securityStatus: "unknown",
        accessibilityStatus: "unknown",
        blockerFindings: expect.arrayContaining(["security status unknown", "accessibility status unknown"])
      })
    ]);
    expect(snapshot.blockers.some((blocker) => blocker.includes(`PR #${pr.prNumber}: qa report blocked`))).toBe(true);
  });
});

function approvedPdState(rootPath: string): ProjectState {
  let state: ProjectState = { ...loadState(rootPath), currentStage: "PD_APPROVED" };
  for (const artifactId of ["references", "directions", "landing-preview", "design-system", "page-designs"] as const) {
    const index = createDesignArtifactVersion(rootPath, artifactId, { changeSummary: "approved pd" });
    approveDesignArtifact(rootPath, artifactId, "tester");
    state = syncStateDesignArtifacts(state, {
      ...index,
      status: "approved"
    });
  }
  return state;
}

function completeMergedHandoffForStage(rootPath: string, stage: "FE_SPEC" | "BE_SPEC") {
  const handoff = loadRuntimeHandoffs(rootPath).find((record) => record.packet.stage === stage);
  if (!handoff) {
    throw new Error(`handoff not found for ${stage}`);
  }
  const workerId = `test-${stage.toLowerCase()}`;
  const claimed = claimRuntimeHandoff(rootPath, handoff.id, workerId);
  const claimToken = runtimeHandoffExecutionToken(claimed);
  const lane = startAgentLaneRun(rootPath, {
    sessionId: handoff.sessionId,
    handoffId: handoff.id,
    workerId,
    workerSessionId: claimed.workerSessionId,
    claimToken: claimToken.claimToken,
    attempt: claimed.attempts,
    packet: handoff.packet,
    command: handoff.packet.nextCommand ?? "",
    leaseExpiresAt: claimed.leaseExpiresAt
  });
  const workToken = { ...claimToken, laneRunId: lane.id };
  startRuntimeHandoffWork(rootPath, handoff.id, workToken, lane.id);
  completeAgentLaneRun(rootPath, lane.id, { ok: true, executedCommand: handoff.packet.nextCommand });
  completeRuntimeHandoffAttempt(rootPath, handoff.id, workToken, `completed by ${workerId}`);
  return mergeAgentLaneRun(rootPath, lane.id, `merged ${stage} lane proof`);
}

function seedRuntimeHandoff(rootPath: string, sessionId = "session-handoff-token") {
  return recordRuntimeHandoff(rootPath, sessionId, {
    fromAgent: "Orchestrator",
    toAgent: "PM",
    stage: "PM_PRODUCT_DEFINITION_INTERVIEW",
    summary: "test handoff ownership",
    nextCommand: "/pm interview",
    resumeCursor: "stage:PM_PRODUCT_DEFINITION_INTERVIEW",
    createdAt: new Date().toISOString()
  });
}

function approveSprintInputDocuments(rootPath: string): ProjectState {
  let state = loadState(rootPath);
  for (const docId of ["fe-technical-spec", "be-technical-spec", "api-contract"] as const) {
    createEngineeringDocumentVersion(rootPath, docId, { changeSummary: `approved ${docId}` });
    approveDocument(rootPath, docId, "tester");
    state = syncStateDocuments(state, readDocumentIndex(rootPath, docId));
  }
  saveState(rootPath, state);
  return state;
}

describe("github helpers", () => {
  it("normalizes labels and creates branch names", () => {
    expect(normalizeLabel("refator")).toBe("refactor");
    expect(createBranchName("feat", 12, "PM Document Flow")).toBe("feat/12-pm-document-flow");
  });

  it("writes label dry-run config", () => {
    const result = setupGitHubLabels(root);
    expect(result.labels).toHaveLength(8);
    expect(fs.existsSync(path.join(root, ".rph", "github", "labels.json"))).toBe(true);
  });

  it("exposes repo creation as a typed function", () => {
    expect(typeof createGitHubRepo).toBe("function");
  });

  it("writes branch plan without creating branches", () => {
    const filePath = writeGitHubBranchPlan(root);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, "utf8")).toContain("local branch -> dev -> release -> main");
  });
});

describe("command parser and env validation", () => {
  it("parses nested command args and options", () => {
    const parsed = parseCli(["pm", "approve", "product-definition", "--by", "tester"]);
    expect(parsed.command).toBe("pm");
    expect(parsed.subcommand).toBe("approve");
    expect(parsed.args).toEqual(["product-definition"]);
    expect(parsed.options.by).toBe("tester");
  });

  it("ignores npm argument separator", () => {
    const parsed = parseCli(["--", "status"]);
    expect(parsed.command).toBe("status");
  });

  it("accepts slash-command argv for one-shot runtime commands", () => {
    const parsed = parseCli(["/pm", "draft", "product-definition", "--summary", "first draft"]);
    expect(parsed.command).toBe("pm");
    expect(parsed.subcommand).toBe("draft");
    expect(parsed.args).toEqual(["product-definition"]);
    expect(parsed.options.summary).toBe("first draft");
  });

  it("routes operator workspace commands and json flags", () => {
    const workspace = parseCli(["/workspace", "--json"]);
    expect(workspace.command).toBe("workspace");
    expect(workspace.options.json).toBe(true);

    const status = parseCli(["status", "--json"]);
    expect(status.command).toBe("status");
    expect(status.options.json).toBe(true);

    const doctorInstall = parseCli(["doctor", "install"]);
    expect(doctorInstall.command).toBe("doctor");
    expect(doctorInstall.subcommand).toBe("install");

    const doctorShell = parseCli(["doctor", "shell"]);
    expect(doctorShell.command).toBe("doctor");
    expect(doctorShell.subcommand).toBe("shell");

    const update = parseCli(["update", "--dry-run"]);
    expect(update.command).toBe("update");
    expect(update.options["dry-run"]).toBe(true);
  });

  it("diagnoses a healthy top-level install without requiring a project", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rph-doctor-install-healthy-"));
    try {
      const home = path.join(tmp, "home");
      const installDir = path.join(home, ".real-product-harness");
      const binDir = path.join(home, ".local", "bin");
      const configDir = path.join(home, ".config", "rph");
      const profilePath = path.join(home, ".zshrc");
      const cliTarget = path.join(installDir, "dist", "apps", "cli", "src", "index.js");
      fs.mkdirSync(path.dirname(cliTarget), { recursive: true });
      fs.mkdirSync(binDir, { recursive: true });
      fs.mkdirSync(configDir, { recursive: true });
      fs.mkdirSync(path.join(installDir, ".git"), { recursive: true });
      fs.writeFileSync(cliTarget, [
        "#!/usr/bin/env node",
        "const args = process.argv.slice(2);",
        "if (args.includes('--json') && args.some((arg) => ['workspace', '/workspace', 'status', '/status'].includes(arg))) {",
        "  console.log(JSON.stringify({ schemaVersion: 'rph-operator-workspace-v0' }));",
        "  process.exit(0);",
        "}",
        "console.log('rph fake current cli');",
        ""
      ].join("\n"));
      fs.chmodSync(cliTarget, 0o755);
      const wrapperPath = path.join(binDir, "rph");
      fs.writeFileSync(wrapperPath, [
        "#!/usr/bin/env bash",
        `exec node "${cliTarget}" "$@"`,
        ""
      ].join("\n"));
      fs.chmodSync(wrapperPath, 0o755);
      const initPath = path.join(configDir, "init.sh");
      fs.writeFileSync(initPath, [
        `export PATH="${binDir}:$PATH"`,
        "function /setup() { command rph /setup \"$@\"; }",
        "function /pm() { command rph /pm \"$@\"; }",
        "function /status() { command rph /status \"$@\"; }",
        "function /workspace() { command rph /workspace \"$@\"; }",
        "function /agent() { command rph /agent \"$@\"; }",
        ""
      ].join("\n"));
      fs.writeFileSync(path.join(configDir, "completion.zsh"), "#compdef rph\n");
      fs.writeFileSync(profilePath, `# >>> rph init >>>\nsource "${initPath}"\n# <<< rph init <<<\n`);

      await withProcessEnv({
        HOME: home,
        SHELL: "/bin/zsh",
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
        RPH_INSTALL_DIR: installDir,
        RPH_BIN_DIR: binDir,
        RPH_CONFIG_DIR: configDir,
        RPH_SHELL_PROFILE: profilePath
      }, async () => {
        const freshRoot = path.join(tmp, "fresh-projectless-root");
        fs.mkdirSync(freshRoot);
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        expect(await runParsedCommand(freshRoot, parseCli(["doctor", "install"]))).toBe(true);
        const installOutput = logSpy.mock.calls.flat().join("\n");
        expect(installOutput).toContain("RPH install doctor");
        expect(installOutput).toContain("current_install=yes");
        expect(installOutput).toContain("- workspace-json=ok");
        expect(installOutput).toContain("- status-json=ok");
        expect(installOutput).toContain("next=none");
        logSpy.mockClear();

        expect(await runParsedCommand(freshRoot, parseCli(["doctor", "shell"]))).toBe(true);
        const shellOutput = logSpy.mock.calls.flat().join("\n");
        expect(shellOutput).toContain("RPH shell doctor");
        expect(shellOutput).toContain("/workspace=yes");
        expect(shellOutput).toContain("- zsh-workspace-json=ok");
        expect(shellOutput).toContain("next=none");
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("marks JSON-capable stale wrappers outside the install dir as requiring update", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rph-doctor-install-stale-"));
    try {
      const home = path.join(tmp, "home");
      const installDir = path.join(home, ".real-product-harness");
      const oldInstallDir = path.join(tmp, "old-install");
      const binDir = path.join(home, ".local", "bin");
      const configDir = path.join(home, ".config", "rph");
      const profilePath = path.join(home, ".zshrc");
      const oldCliTarget = path.join(oldInstallDir, "dist", "apps", "cli", "src", "index.js");
      fs.mkdirSync(path.dirname(oldCliTarget), { recursive: true });
      fs.mkdirSync(path.join(installDir, ".git"), { recursive: true });
      fs.mkdirSync(binDir, { recursive: true });
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(oldCliTarget, [
        "#!/usr/bin/env node",
        "const args = process.argv.slice(2);",
        "if (args.includes('--json') && args.some((arg) => ['workspace', '/workspace', 'status', '/status'].includes(arg))) {",
        "  console.log(JSON.stringify({ schemaVersion: 'rph-operator-workspace-v0' }));",
        "  process.exit(0);",
        "}",
        "console.log('stale cli');",
        ""
      ].join("\n"));
      fs.chmodSync(oldCliTarget, 0o755);
      const wrapperPath = path.join(binDir, "rph");
      fs.writeFileSync(wrapperPath, [
        "#!/usr/bin/env bash",
        `exec node "${oldCliTarget}" "$@"`,
        ""
      ].join("\n"));
      fs.chmodSync(wrapperPath, 0o755);
      const initPath = path.join(configDir, "init.sh");
      fs.writeFileSync(initPath, [
        `export PATH="${binDir}:$PATH"`,
        "function /workspace() { command rph /workspace \"$@\"; }",
        ""
      ].join("\n"));
      fs.writeFileSync(path.join(configDir, "completion.zsh"), "#compdef rph\n");
      fs.writeFileSync(profilePath, `# >>> rph init >>>\nsource "${initPath}"\n# <<< rph init <<<\n`);

      await withProcessEnv({
        HOME: home,
        SHELL: "/bin/zsh",
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
        RPH_INSTALL_DIR: installDir,
        RPH_BIN_DIR: binDir,
        RPH_CONFIG_DIR: configDir,
        RPH_SHELL_PROFILE: profilePath
      }, async () => {
        const freshRoot = path.join(tmp, "fresh-projectless-root");
        fs.mkdirSync(freshRoot);
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        expect(await runParsedCommand(freshRoot, parseCli(["doctor", "install"]))).toBe(true);
        const output = logSpy.mock.calls.flat().join("\n");
        expect(output).toContain("current_install=no");
        expect(output).toContain("- workspace-json=ok");
        expect(output).toContain("- status-json=ok");
        expect(output).toContain("installed wrapper target is outside install dir");
        expect(output).toContain("next=rph update");
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("detects when another global rph shadows the installed wrapper", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rph-doctor-shell-shadow-"));
    try {
      const home = path.join(tmp, "home");
      const installDir = path.join(home, ".real-product-harness");
      const binDir = path.join(home, ".local", "bin");
      const shadowBinDir = path.join(tmp, "shadow-bin");
      const configDir = path.join(home, ".config", "rph");
      const profilePath = path.join(home, ".zshrc");
      const cliTarget = path.join(installDir, "dist", "apps", "cli", "src", "index.js");
      fs.mkdirSync(path.dirname(cliTarget), { recursive: true });
      fs.mkdirSync(binDir, { recursive: true });
      fs.mkdirSync(shadowBinDir, { recursive: true });
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(cliTarget, [
        "#!/usr/bin/env node",
        "const args = process.argv.slice(2);",
        "if (args.includes('--json') && args.some((arg) => ['workspace', '/workspace', 'status', '/status'].includes(arg))) {",
        "  console.log(JSON.stringify({ schemaVersion: 'rph-operator-workspace-v0' }));",
        "  process.exit(0);",
        "}",
        "console.log('rph fake current cli');",
        ""
      ].join("\n"));
      fs.chmodSync(cliTarget, 0o755);
      const wrapperPath = path.join(binDir, "rph");
      fs.writeFileSync(wrapperPath, [
        "#!/usr/bin/env bash",
        `exec node "${cliTarget}" "$@"`,
        ""
      ].join("\n"));
      fs.chmodSync(wrapperPath, 0o755);
      const shadowPath = path.join(shadowBinDir, "rph");
      fs.writeFileSync(shadowPath, "#!/usr/bin/env bash\necho shadow-rph\n");
      fs.chmodSync(shadowPath, 0o755);
      const initPath = path.join(configDir, "init.sh");
      fs.writeFileSync(initPath, [
        `export PATH="${binDir}:$PATH"`,
        "function /setup() { command rph /setup \"$@\"; }",
        "function /pm() { command rph /pm \"$@\"; }",
        "function /status() { command rph /status \"$@\"; }",
        "function /workspace() { command rph /workspace \"$@\"; }",
        "function /agent() { command rph /agent \"$@\"; }",
        ""
      ].join("\n"));
      fs.writeFileSync(profilePath, `# >>> rph init >>>\nsource "${initPath}"\n# <<< rph init <<<\n`);

      await withProcessEnv({
        HOME: home,
        SHELL: "/bin/zsh",
        PATH: `${shadowBinDir}${path.delimiter}${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
        RPH_INSTALL_DIR: installDir,
        RPH_BIN_DIR: binDir,
        RPH_CONFIG_DIR: configDir,
        RPH_SHELL_PROFILE: profilePath
      }, async () => {
        const freshRoot = path.join(tmp, "fresh-projectless-root");
        fs.mkdirSync(freshRoot);
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        expect(await runParsedCommand(freshRoot, parseCli(["doctor", "shell"]))).toBe(true);
        const output = logSpy.mock.calls.flat().join("\n");
        expect(output).toContain(`resolved=${shadowPath}`);
        expect(output).toContain(`expected=${wrapperPath}`);
        expect(output).toContain("shadowed=yes");
        expect(output).toContain(`next=source "${initPath}"`);
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("prints update dry-run plan from the current source checkout", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const ok = await runParsedCommand(root, parseCli(["update", "--dry-run"]));

    expect(ok).toBe(true);
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("RPH update plan");
    expect(output).toContain("- source:");
    expect(output).toContain("- command: bash");
  });

  it("runs rph update against the located install script", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rph-update-source-"));
    try {
      const marker = path.join(tmp, "installed.txt");
      fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ name: "real-product-harness" }));
      fs.writeFileSync(path.join(tmp, "install.sh"), [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        `printf updated > "${marker}"`,
        ""
      ].join("\n"));
      fs.chmodSync(path.join(tmp, "install.sh"), 0o755);

      await withProcessEnv({ RPH_SOURCE_ROOT: tmp }, async () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        expect(await runParsedCommand(root, parseCli(["update"]))).toBe(true);
        const output = logSpy.mock.calls.flat().join("\n");
        expect(output).toContain("RPH update");
        expect(output).toContain(`- source: ${tmp}`);
        expect(fs.readFileSync(marker, "utf8")).toBe("updated");
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("prints workspace json for operator consumers", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const ok = await runParsedCommand(root, parseCli(["workspace", "--json"]));

    expect(ok).toBe(true);
    const payload = JSON.parse(logSpy.mock.calls.flat().join("\n"));
    expect(payload.schemaVersion).toBe("rph-operator-workspace-v0");
    expect(payload.initialized).toBe(true);
    expect(payload.project.name).toBe("Test Product");
    expect(payload.artifacts.counts.documents.draft).toBe(0);
    expect(payload.nextAction.command).toBe("/setup auto --live");
  });

  it("prints the same operator json through status --json", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const ok = await runParsedCommand(root, parseCli(["/status", "--json"]));

    expect(ok).toBe(true);
    const payload = JSON.parse(logSpy.mock.calls.flat().join("\n"));
    expect(payload.schemaVersion).toBe("rph-operator-workspace-v0");
    expect(payload.project.name).toBe("Test Product");
    expect(payload.runtime).toBeNull();
  });

  it("maps help and version flags to first-class commands", () => {
    expect(parseCli(["--version"]).command).toBe("version");
    const helpParsed = parseCli(["--help", "setup"]);
    expect(helpParsed.command).toBe("help");
    expect(helpParsed.subcommand).toBe("setup");
  });

  it("routes nested help flags to topic help instead of executing the command", async () => {
    const parsed = parseCli(["/pm", "start", "--help"]);
    expect(parsed.command).toBe("help");
    expect(parsed.subcommand).toBe("pm");
    expect(parsed.args).toEqual(["start"]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const ok = await runParsedCommand(root, parsed);

    expect(ok).toBe(true);
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("PM commands");
    expect(output).toContain("/pm start");
    expect(fs.readFileSync(path.join(root, ".rph", "state.json"), "utf8")).toContain("\"currentStage\": \"SETUP\"");
  });

  it("keeps general help focused on the first-run entry flows", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const ok = await runParsedCommand(root, parseCli(["help"]));

    expect(ok).toBe(true);
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Primary controls:");
    expect(output).toContain("rph start");
    expect(output).toContain("rph setup auto --live");
    expect(output).toContain("rph live ai:openai");
    expect(output).toContain("rph status");
    expect(output).toContain("rph \"what should I do next?\"");
    expect(output).toContain("Unknown bare text is treated as conversation");
    expect(output).toContain("rph help setup");
    expect(output).toContain("rph help live");
    expect(output).not.toContain("One-shot slash commands:");
    expect(output).not.toContain("/github hotfix-plan");
  });

  it("routes rph start in a fresh folder through setup-first onboarding when a prompter is available", async () => {
    const uninitializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-start-runtime-"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const answers = ["openai", "test-openai", "", "https://example.invalid/v1", "none"];
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith("/models")) {
        return new Response(JSON.stringify({ data: [{ id: "gpt-5.4" }] }), { status: 200 });
      }
      if (target.endsWith("/responses")) {
        return new Response(JSON.stringify({ output_text: "OK", usage: { input_tokens: 4, output_tokens: 1 } }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: { message: `unexpected ${target}` } }), { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const ok = await runParsedCommand(uninitializedRoot, parseCli(["start"]), true, {
        prompter: {
          question: async () => answers.shift() ?? ""
        }
      });

      expect(ok).toBe(true);
      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("RPH start: setup required");
      expect(output).toContain("launching: rph setup auto --live");
      expect(output).toContain("RPH Setup Auto");
      expect(output).toContain("ai:openai trust=protocol-ready:protocol-tool-call");
      expect(output).toContain("setup live check passed");
      expect(output).toContain("handoff: runtime ready");
      expect(fs.existsSync(path.join(uninitializedRoot, ".rph", "project.json"))).toBe(true);
      const envText = fs.readFileSync(path.join(uninitializedRoot, ".env"), "utf8");
      expect(envText).toContain("OPENAI_API_KEY=test-openai");
      expect(envText).toContain("OPENAI_BASE_URL=https://example.invalid/v1");
      expect(fs.readFileSync(path.join(uninitializedRoot, ".rph", "config.json"), "utf8")).not.toContain("test-openai");
    } finally {
      fs.rmSync(uninitializedRoot, { recursive: true, force: true });
    }
  });

  it("suggests unknown commands and exits with code 2", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const ok = await runParsedCommand(root, parseCli(["statsu"]));

    expect(ok).toBe(false);
    expect(process.exitCode).toBe(2);
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("Did you mean: /status");
  });

  it("prints topic help for setup", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const ok = await runParsedCommand(root, parseCli(["help", "setup"]));

    expect(ok).toBe(true);
    expect(logSpy.mock.calls.flat().join("\n")).toContain("rph setup detect");
    expect(logSpy.mock.calls.flat().join("\n")).toContain("rph setup apply");
    expect(logSpy.mock.calls.flat().join("\n")).toContain("rph setup check");
  });

  it("prints topic help for live target verification", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const ok = await runParsedCommand(root, parseCli(["help", "live"]));

    expect(ok).toBe(true);
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Live proof commands");
    expect(output).toContain("rph live ai:openai");
    expect(output).toContain("rph live target mcp:github");
    expect(output).toContain("Runtime slash form:");
  });

  it("prints live target usage without requiring internal script names", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const ok = await runParsedCommand(root, parseCli(["live"]));

    expect(ok).toBe(true);
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Live proof commands");
    expect(output).toContain("rph live ai:openai");
    expect(output).toContain("/live ai:openai");
  });

  it("prints package version from version command", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const ok = await runParsedCommand(root, parseCli(["version"]));

    expect(ok).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(`real-product-harness ${packageJson.version}`);
  });

  it("executes the next stage queue when explicitly requested", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const ok = await runParsedCommand(root, parseCli(["next", "--execute"]));

    expect(ok).toBe(true);
    expect(loadState(root).currentStage).toBe("PM_PRODUCT_DEFINITION_INTERVIEW");
    expect(logSpy.mock.calls.flat().join("\n")).toContain("stage queue 실행 완료");
  });

  it("tokenizes quoted slash-command lines for the runtime shell", () => {
    expect(parseCommandLine('/fe issue-create --title "Build dashboard shell"')).toEqual([
      "/fe",
      "issue-create",
      "--title",
      "Build dashboard shell"
    ]);
  });

  it("validates required env keys", () => {
    const result = validateEnv({ GITHUB_TOKEN: "token" } as NodeJS.ProcessEnv, ["GITHUB_TOKEN", "GITHUB_OWNER"]);
    expect(result.valid).toBe(false);
    expect(result.present).toEqual(["GITHUB_TOKEN"]);
    expect(result.missing).toEqual(["GITHUB_OWNER"]);
  });

  it("loads env files without overwriting existing env", () => {
    const envFile = path.join(root, ".env.test");
    fs.writeFileSync(envFile, "GITHUB_OWNER=owner\nGITHUB_REPO=repo\n");
    const env = { GITHUB_OWNER: "existing" } as NodeJS.ProcessEnv;
    const loaded = loadEnvFile(envFile, env);
    expect(loaded).toEqual(["GITHUB_REPO"]);
    expect(env.GITHUB_OWNER).toBe("existing");
    expect(env.GITHUB_REPO).toBe("repo");
  });

  it("upserts env values while preserving comments and quoting only when needed", () => {
    const envFile = path.join(root, ".env");
    fs.writeFileSync(envFile, "# local secrets\nOPENAI_API_KEY=old\nGITHUB_OWNER=king\n");

    const result = upsertEnvFileValues(envFile, {
      OPENAI_API_KEY: "new-secret",
      GITHUB_REPO: "real-product-harness",
      NOTION_PARENT_PAGE_ID: "page id with spaces"
    });
    const content = fs.readFileSync(envFile, "utf8");

    expect(result.updatedKeys).toEqual(["OPENAI_API_KEY"]);
    expect(result.appendedKeys).toEqual(["GITHUB_REPO", "NOTION_PARENT_PAGE_ID"]);
    expect(content).toContain("# local secrets");
    expect(content).toContain("OPENAI_API_KEY=new-secret");
    expect(content).toContain("GITHUB_OWNER=king");
    expect(content).toContain("GITHUB_REPO=real-product-harness");
    expect(content).toContain('NOTION_PARENT_PAGE_ID="page id with spaces"');
    expect(fs.statSync(envFile).mode & 0o777).toBe(0o600);
  });

  it("initializes setup choices for the project wizard", () => {
    const filePath = path.join(root, ".rph", "setup-choices.json");
    expect(fs.existsSync(filePath)).toBe(true);
    const choices = JSON.parse(fs.readFileSync(filePath, "utf8")) as { stack: string; mcp: string[] };
    expect(choices.stack).toBe("recommended");
    expect(choices.mcp).toContain("notion");
    expect(fs.existsSync(path.join(root, ".rph", "config.json"))).toBe(true);
    const mcpConfig = JSON.parse(fs.readFileSync(path.join(root, ".mcp", "config.json"), "utf8")) as {
      mcpPolicyRegistry?: { servers: Record<string, { kind: string; agentReadOnlyTools: string[] }> };
      mcpServers: Record<string, { kind: string; url?: string }>;
    };
    expect(mcpConfig.mcpServers.notion.kind).toBe("rest-adapter");
    expect(mcpConfig.mcpServers.github.kind).toBe("rest-adapter");
    expect(mcpConfig.mcpServers.stitch.kind).toBe("mcp-server");
    expect(mcpConfig.mcpServers.stitch.url).toBe("https://stitch.googleapis.com/mcp");
    expect(mcpConfig.mcpPolicyRegistry?.servers.stitch).toMatchObject({
      kind: "read-only-allowlist",
      agentReadOnlyTools: ["echo"]
    });
  });

  it("stores local runtime state with private filesystem permissions", () => {
    expect(modeOf(path.join(root, ".rph"))).toBe(0o700);
    expect(modeOf(path.join(root, ".rph", "project.json"))).toBe(0o600);
    expect(modeOf(path.join(root, ".rph", "state.json"))).toBe(0o600);
    expect(modeOf(path.join(root, ".rph", "config.json"))).toBe(0o600);

    recordRuntimeActionApproval(root, {
      sessionId: "session-action",
      command: "/notion setup --live --title Smoke",
      reason: "permission probe"
    });

    expect(modeOf(path.join(root, ".rph", "runtime"))).toBe(0o700);
    expect(modeOf(path.join(root, ".rph", "runtime", "action-approvals.json"))).toBe(0o600);
  });

  it("writes durable onboarding proof for configured provider checks", () => {
    const reportPath = writeConnectionReport(root, [
      {
        id: "openai",
        kind: "ai",
        status: "passed",
        message: "generation: smoke passed",
        requiredEnv: ["OPENAI_API_KEY"],
        missingEnv: [],
        checkedAt: "2026-01-01T00:00:00.000Z",
        identity: {
          type: "ai-provider",
          label: "openai gpt-5.4",
          targetId: "gpt-5.4",
          verifiedBy: "protocol-tool-call",
          source: "configuration"
        },
        firstActionProof: {
          action: "openai.generation_smoke",
          label: "generated smoke response with gpt-5.4",
          targetId: "gpt-5.4",
          verifiedBy: "protocol-tool-call",
          endpoint: "https://api.openai.com/v1/responses"
        },
        readiness: {
          mode: "protocol-ready",
          provenStage: "protocol-tool-call",
          stages: [
            { stage: "transport", status: "passed", message: "reachable" },
            { stage: "credential-probe", status: "passed", message: "credential passed" },
            { stage: "protocol-tool-call", status: "passed", message: "generation smoke passed" }
          ]
        }
      },
      {
        id: "notion",
        kind: "mcp",
        status: "passed",
        message: "credential: passed; protocol: not applicable",
        requiredEnv: ["NOTION_TOKEN", "NOTION_PARENT_PAGE_ID"],
        missingEnv: [],
        checkedAt: "2026-01-01T00:00:00.000Z",
        identity: {
          type: "notion-page",
          label: "Notion page 123456...abcdef",
          targetId: "12345678-90ab-cdef-1234-567890abcdef",
          verifiedBy: "credential-probe",
          source: "configuration"
        },
        firstActionProof: {
          action: "notion.target_read",
          label: "read target resource Notion page 123456...abcdef",
          targetId: "12345678-90ab-cdef-1234-567890abcdef",
          verifiedBy: "credential-probe",
          endpoint: "https://api.notion.com/v1/pages/12345678-90ab-cdef-1234-567890abcdef"
        },
        readiness: {
          mode: "adapter-ready",
          provenStage: "credential-probe",
          stages: [
            { stage: "transport", status: "passed", message: "reachable" },
            { stage: "credential-probe", status: "passed", message: "credential passed" },
            { stage: "protocol-tools-list", status: "not-applicable", message: "REST adapter" }
          ]
        }
      }
    ]);
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as {
      provenance: {
        source: string;
        runner: string;
        command: string;
        projectInitialized: boolean;
        selectedTargets: string[];
        checkedTargetCount: number;
        generatedAt: string;
      };
      onboardingProof: Array<{
        id: string;
        captured: boolean;
        verified: boolean;
        trustCategory: string;
        provenStage: string;
        protocolKind: string;
        protocolApplicable: boolean;
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
        policy?: {
          kind: string;
          state: string;
          satisfied: boolean;
          requiredTrust: string;
          agentReadOnlyTools: string[];
        };
      }>;
    };

    expect(report.provenance).toMatchObject({
      source: "live",
      runner: "cli",
      projectInitialized: true,
      selectedTargets: ["ai:openai", "mcp:notion"],
      checkedTargetCount: 2
    });
    expect(report.provenance.command.length).toBeGreaterThan(0);
    expect(report.provenance.generatedAt).toEqual(expect.any(String));
    expect(report.onboardingProof).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "openai",
        captured: true,
        verified: true,
        trustCategory: "protocol-ready",
        provenStage: "protocol-tool-call",
        protocolKind: "ai-provider",
        protocolApplicable: true,
        identity: expect.objectContaining({
          type: "ai-provider",
          label: "openai gpt-5.4",
          targetId: "gpt-5.4"
        }),
        firstActionProof: expect.objectContaining({
          action: "openai.generation_smoke",
          targetId: "gpt-5.4",
          verifiedBy: "protocol-tool-call"
        }),
        proof: expect.objectContaining({
          readinessMode: "protocol-ready",
          credentialStage: "passed",
          protocolStage: "passed"
        })
      }),
      expect.objectContaining({
        id: "notion",
        captured: true,
        verified: true,
        trustCategory: "adapter-ready",
        provenStage: "credential-probe",
        protocolKind: "rest-adapter",
        protocolApplicable: false,
        policy: expect.objectContaining({
          kind: "rest-adapter-readback",
          state: "proved-now",
          satisfied: true,
          requiredTrust: "adapter-ready:credential-probe",
          agentReadOnlyTools: []
        }),
        identity: expect.objectContaining({
          type: "notion-page",
          targetId: "12345678-90ab-cdef-1234-567890abcdef"
        }),
        firstActionProof: expect.objectContaining({
          action: "notion.target_read",
          targetId: "12345678-90ab-cdef-1234-567890abcdef",
          verifiedBy: "credential-probe"
        }),
        proof: expect.objectContaining({
          readinessMode: "adapter-ready",
          credentialStage: "passed",
          protocolStage: "not-applicable"
        })
      })
    ]));
    expect(fs.readFileSync(reportPath, "utf8")).not.toContain("secret");
    const proofEvents = readProofLedgerEvents(root);
    expect(proofEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "connection.check",
        status: "passed",
        subject: "connection:ai:openai",
        trust: "protocol-ready:protocol-tool-call",
        targetId: "gpt-5.4"
      }),
      expect.objectContaining({
        kind: "connection.check",
        status: "passed",
        subject: "connection:mcp:notion",
        trust: "adapter-ready:credential-probe",
        targetId: "12345678-90ab-cdef-1234-567890abcdef"
      })
    ]));
    const proofLatest = JSON.parse(fs.readFileSync(path.join(root, ".rph", "proofs", "latest.json"), "utf8")) as {
      eventCount: number;
      counts: { passed: number };
      latestBySubject: Record<string, { targetId?: string }>;
    };
    expect(proofLatest.eventCount).toBe(2);
    expect(proofLatest.counts.passed).toBe(2);
    expect(proofLatest.latestBySubject["connection:ai:openai"].targetId).toBe("gpt-5.4");
    const context = assembleAgentContext(root);
    expect(context.recentProofs.map((proof) => proof.subject)).toEqual(expect.arrayContaining([
      "connection:ai:openai",
      "connection:mcp:notion"
    ]));
    expect(context.prompt).toContain("Recent proof ledger:");
    expect(context.prompt).toContain("connection:ai:openai");
  });

  it("marks REST adapter checks as credential probes, not full MCP protocol readiness", async () => {
    const ghBin = writeFakeGh("king/real-product-harness", "WRITE");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 424242,
      full_name: "king/real-product-harness"
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const config = createHarnessConfig({
      GITHUB_TOKEN: "github-secret",
      GITHUB_OWNER: "king",
      GITHUB_REPO: "real-product-harness",
      RPH_GH_BIN: ghBin
    } as NodeJS.ProcessEnv);
    const check = await testMcpConnection(config, "github", {
      GITHUB_TOKEN: "github-secret",
      GITHUB_OWNER: "king",
      GITHUB_REPO: "real-product-harness",
      RPH_GH_BIN: ghBin
    } as NodeJS.ProcessEnv);

    expect(check.status).toBe("passed");
    expect(check.identity).toMatchObject({
      type: "github-repo",
      label: "king/real-product-harness",
      targetId: "king/real-product-harness",
      verifiedBy: "credential-probe",
      source: "configuration"
    });
    expect(check.firstActionProof).toMatchObject({
      action: "github.target_read",
      targetId: "king/real-product-harness",
      verifiedBy: "credential-probe",
      endpoint: "https://api.github.com/repos/king/real-product-harness"
    });
    expect(check.readiness?.provenStage).toBe("credential-probe");
    expect(check.readiness?.mode).toBe("adapter-write-ready");
    expect(check.readiness?.stages.find((stage) => stage.stage === "external-write")?.status).toBe("passed");
    expect(check.readiness?.stages.find((stage) => stage.stage === "protocol-tools-list")?.status).toBe("not-applicable");
  });

  it("treats gh-cli as a non-secret GitHub credential source and prefers explicit project tokens for gh child env", () => {
    const config = createHarnessConfig({
      GITHUB_TOKEN_SOURCE: "gh-cli",
      GITHUB_OWNER: "king",
      GITHUB_REPO: "real-product-harness"
    } as NodeJS.ProcessEnv);

    expect(config.mcpServers.github.configured).toBe(true);
    expect(config.mcpServers.github.missingEnv).not.toContain("GITHUB_TOKEN");
    const originalGhToken = process.env.GH_TOKEN;
    const childEnv = githubCliEnv({
      GITHUB_TOKEN: "project-token",
      GH_TOKEN: "ambient-token"
    } as NodeJS.ProcessEnv);
    expect(childEnv.GH_TOKEN).toBe("project-token");
    expect(process.env.GH_TOKEN).toBe(originalGhToken);
  });

  it("proves Stitch MCP-compatible tools/list readiness when the protocol check succeeds", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string; id?: string };
      if (body.method === "initialize") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "stitch", version: "test" }
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          tools: [{ name: "render-ui" }]
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const config = createHarnessConfig({
      STITCH_API_KEY: "stitch-secret"
    } as NodeJS.ProcessEnv);
    const check = await testMcpConnection(config, "stitch", {
      STITCH_API_KEY: "stitch-secret"
    } as NodeJS.ProcessEnv);
    const init = fetchMock.mock.calls[2]?.[1] as RequestInit;
    const body = JSON.parse(init.body as string) as { method: string };

    expect(check.status).toBe("passed");
    expect(check.readiness?.provenStage).toBe("protocol-tools-list");
    expect(body.method).toBe("tools/list");
    expect(init.headers).toMatchObject({
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18"
    });
  });

  it("detects configured AI providers and MCP servers from env without storing secrets", () => {
    const config = createHarnessConfig({
      OPENAI_API_KEY: "openai-secret",
      GEMINI_API_KEY: "gemini-secret",
      GITHUB_TOKEN: "github-secret",
      GITHUB_OWNER: "owner",
      GITHUB_REPO: "repo",
      NOTION_TOKEN: "notion-secret",
      NOTION_PARENT_PAGE_ID: "page-id"
    } as NodeJS.ProcessEnv);

    expect(config.activeAiProvider).toBe("openai");
    expect(config.aiProviders.openai.configured).toBe(true);
    expect(config.aiProviders.gemini.configured).toBe(true);
    expect(config.aiProviders.anthropic.configured).toBe(false);
    expect(config.mcpServers.notion.enabled).toBe(false);
    expect(config.mcpServers.github.enabled).toBe(false);
    expect(config.mcpServers.notion.configured).toBe(true);
    expect(config.mcpServers.github.configured).toBe(true);
    expect(config.mcpServers.figma.enabled).toBe(false);
    expect(JSON.stringify(config)).not.toContain("openai-secret");
  });

  it("prefers explicit setup choices over env presence for MCP enablement", () => {
    const config = createHarnessConfig({
      GITHUB_TOKEN: "github-secret",
      GITHUB_REPO: "owner/repo",
      NOTION_TOKEN: "notion-secret",
      NOTION_PARENT_PAGE_ID: "1234567890abcdef1234567890abcdef"
    } as NodeJS.ProcessEnv, {
      aiProvider: "later",
      deployment: "later",
      stack: "recommended",
      mcp: ["notion"]
    });

    expect(config.mcpServers.notion.enabled).toBe(true);
    expect(config.mcpServers.github.enabled).toBe(false);
  });

  it("preserves custom protocol MCP servers when env sync rewrites config", () => {
    const mcpPath = path.join(root, ".mcp", "config.json");
    const existing = JSON.parse(fs.readFileSync(mcpPath, "utf8")) as { mcpServers: Record<string, unknown> };
    existing.mcpServers["custom-echo"] = {
      name: "Custom Echo",
      kind: "mcp-server",
      enabled: true,
      transport: "http",
      url: "https://mcp.example.test/echo",
      auth: {
        mode: "bearer",
        envKey: "CUSTOM_ECHO_MCP_TOKEN"
      },
      protocolReadiness: "tools/list",
      env: {
        CUSTOM_ECHO_MCP_TOKEN: "${CUSTOM_ECHO_MCP_TOKEN}"
      },
      notes: "Custom echo protocol server."
    };
    fs.writeFileSync(mcpPath, `${JSON.stringify(existing, null, 2)}\n`);
    process.env.CUSTOM_ECHO_MCP_TOKEN = "custom-secret";
    try {
      const config = syncHarnessConfigFromEnv(root);
      const rewritten = JSON.parse(fs.readFileSync(mcpPath, "utf8")) as {
        mcpPolicyRegistry?: { servers: Record<string, { kind: string; agentReadOnlyTools: string[] }> };
        mcpServers: Record<string, { kind: string; enabled: boolean; transport: string; url?: string; auth?: { mode?: string; envKey?: string }; env?: Record<string, string> }>;
      };

      expect(config.mcpServers["custom-echo"]).toMatchObject({
        id: "custom-echo",
        name: "Custom Echo",
        kind: "mcp-server",
        enabled: true,
        configured: true,
        transport: "http",
        url: "https://mcp.example.test/echo",
        authMode: "bearer",
        authEnvKey: "CUSTOM_ECHO_MCP_TOKEN",
        protocolReadiness: "tools/list",
        envKeys: ["CUSTOM_ECHO_MCP_TOKEN"]
      });
      expect(config.mcpPolicyRegistry.servers["custom-echo"]).toMatchObject({
        kind: "protocol-tools-list",
        protocolReadiness: "tools/list",
        agentReadOnlyTools: []
      });
      expect(rewritten.mcpPolicyRegistry?.servers["custom-echo"]).toMatchObject({
        kind: "protocol-tools-list",
        protocolReadiness: "tools/list",
        agentReadOnlyTools: []
      });
      expect(config.mcpPolicyRegistry.servers.stitch).toMatchObject({
        kind: "read-only-allowlist",
        agentReadOnlyTools: ["echo"]
      });
      expect(rewritten.mcpServers["custom-echo"]).toMatchObject({
        kind: "mcp-server",
        enabled: true,
        transport: "http",
        url: "https://mcp.example.test/echo",
        auth: {
          mode: "bearer",
          envKey: "CUSTOM_ECHO_MCP_TOKEN"
        },
        env: {
          CUSTOM_ECHO_MCP_TOKEN: "${CUSTOM_ECHO_MCP_TOKEN}"
        }
      });
      expect(rewritten.mcpServers.stitch.kind).toBe("mcp-server");
    } finally {
      delete process.env.CUSTOM_ECHO_MCP_TOKEN;
    }
  });

  it("rejects custom authenticated protocol MCP servers over remote plain HTTP", () => {
    expect(() => addCustomProtocolMcpServer(root, {
      id: "remote-plain-http",
      url: "http://mcp.example.test/echo",
      authEnvKey: "REMOTE_PLAIN_HTTP_MCP_TOKEN"
    })).toThrow("protocol MCP URL must use https://; http:// is allowed only for localhost development");
  });

  it("allows plain HTTP custom protocol MCP servers only for localhost development", () => {
    const config = addCustomProtocolMcpServer(root, {
      id: "local-plain-http",
      url: "http://127.0.0.1:8765/mcp",
      authMode: "none"
    });

    expect(config.mcpServers["local-plain-http"]).toMatchObject({
      id: "local-plain-http",
      url: "http://127.0.0.1:8765/mcp",
      authMode: "none"
    });
  });

  it("keeps .rph MCP policy authoritative when .mcp projection is tampered", () => {
    const mcpPath = path.join(root, ".mcp", "config.json");
    process.env.CUSTOM_ECHO_MCP_TOKEN = "custom-secret";
    try {
      addCustomProtocolMcpServer(root, {
        id: "custom-echo",
        url: "https://mcp.example.test/echo",
        authEnvKey: "CUSTOM_ECHO_MCP_TOKEN",
        protocolToolCallProbe: {
          toolName: "echo",
          arguments: { text: "safe" }
        }
      });
      const projection = JSON.parse(fs.readFileSync(mcpPath, "utf8")) as {
        mcpPolicyRegistry?: { servers: Record<string, { protocolReadiness?: string; protocolToolCallProbe?: { toolName?: string }; agentReadOnlyTools?: string[] }> };
        mcpServers: Record<string, { protocolReadiness?: string; protocolToolCallProbe?: { toolName?: string }; agentReadOnlyTools?: string[] }>;
      };
      projection.mcpServers["custom-echo"].protocolReadiness = "tools/call";
      projection.mcpServers["custom-echo"].protocolToolCallProbe = { toolName: "delete.everything" };
      projection.mcpServers["custom-echo"].agentReadOnlyTools = ["echo", "delete.everything"];
      projection.mcpPolicyRegistry!.servers["custom-echo"].protocolReadiness = "tools/call";
      projection.mcpPolicyRegistry!.servers["custom-echo"].protocolToolCallProbe = { toolName: "delete.everything" };
      projection.mcpPolicyRegistry!.servers["custom-echo"].agentReadOnlyTools = ["echo", "delete.everything"];
      fs.writeFileSync(mcpPath, `${JSON.stringify(projection, null, 2)}\n`);

      const config = syncHarnessConfigFromEnv(root);

      expect(config.mcpPolicyRegistry.servers["custom-echo"]).toMatchObject({
        kind: "read-only-probe",
        protocolReadiness: "tools/call",
        protocolToolCallProbe: {
          toolName: "echo",
          arguments: { text: "safe" }
        },
        agentReadOnlyTools: ["echo"]
      });
      expect(config.mcpPolicyRegistry.servers["custom-echo"].agentReadOnlyTools).not.toContain("delete.everything");
    } finally {
      delete process.env.CUSTOM_ECHO_MCP_TOKEN;
    }
  });

  it("renders a friendly setup assistant without secrets", () => {
    const config = createHarnessConfig({
      OPENAI_API_KEY: "openai-secret",
      GITHUB_TOKEN: "github-secret",
      GITHUB_OWNER: "owner",
      GITHUB_REPO: "repo"
    } as NodeJS.ProcessEnv);

    const guide = renderSetupGuide(config);

    expect(guide).toContain("RPH Setup Assistant");
    expect(guide).toContain("1. AI agent 연결");
    expect(guide).toContain("2. Connector 연결");
    expect(guide).toContain("[configured] OpenAI");
    expect(guide).toContain("[configured] GitHub");
    expect(guide).not.toContain("[ready] OpenAI");
    expect(guide).toContain("rph setup auto --live");
    expect(guide).toContain("OPENAI_API_KEY");
    expect(guide).toContain("protocol-mcp");
    expect(guide).toContain("rest-adapter");
    expect(guide).not.toContain("openai-secret");
    expect(guide).not.toContain("github-secret");
  });

  it("normalizes GitHub repo targets and flags invalid values", () => {
    expect(normalizeGitHubRepoTarget(undefined, "https://github.com/openai/real-product-harness.git")).toMatchObject({
      owner: "openai",
      repo: "real-product-harness",
      slug: "openai/real-product-harness",
      configured: true,
      missingEnv: []
    });

    const invalid = createHarnessConfig({
      GITHUB_TOKEN: "github-secret",
      GITHUB_OWNER: "openai",
      GITHUB_REPO: "https://github.com/openai/real-product-harness/issues"
    } as NodeJS.ProcessEnv);

    expect(invalid.mcpServers.github.configured).toBe(false);
    expect(invalid.mcpServers.github.warnings[0]).toContain("GITHUB_REPO must be a repo name");
  });

  it("separates setup detect from apply side effects", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    const configPath = path.join(root, ".rph", "config.json");
    const beforeDetect = fs.readFileSync(configPath, "utf8");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runParsedCommand(root, parseCli(["setup", "detect"]));
    const afterDetect = fs.readFileSync(configPath, "utf8");
    await runParsedCommand(root, parseCli(["setup", "apply"]));
    const afterApply = fs.readFileSync(configPath, "utf8");

    expect(afterDetect).toBe(beforeDetect);
    expect(afterApply).not.toBe(beforeDetect);
    expect(afterApply).toContain("\"activeAiProvider\": \"openai\"");
    expect(logSpy.mock.calls.flat().join("\n")).toContain("setup applied");
    delete process.env.OPENAI_API_KEY;
  });

  it("accepts setup provider as the human-facing AI provider alias", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const ok = await runParsedCommand(root, parseCli(["setup", "provider", "gemini"]));

    expect(ok).toBe(true);
    expect(logSpy.mock.calls.flat().join("\n")).toContain("AI provider 활성화: gemini");
    expect(fs.readFileSync(path.join(root, ".rph", "config.json"), "utf8")).toContain("\"activeAiProvider\": \"gemini\"");
  });

  it("reports setup check when nothing is configured yet", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const envKeys = [
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "GEMINI_API_KEY",
      "LOCAL_AI_BASE_URL",
      "NOTION_TOKEN",
      "NOTION_PARENT_PAGE_ID",
      "GITHUB_TOKEN",
      "GITHUB_OWNER",
      "GITHUB_REPO",
      "FIGMA_TOKEN",
      "FIGMA_FILE_ID",
      "STITCH_API_KEY"
    ] as const;
    const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    for (const key of envKeys) {
      delete process.env[key];
    }

    try {
      await runParsedCommand(root, parseCli(["setup", "check"]));
    } finally {
      for (const key of envKeys) {
        const value = previousEnv[key];
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("configured_mcp: none");
    expect(output).toContain("Live connection check");
  });

  it("generates text through the active AI provider without exposing secrets", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "# AI draft\n\nGenerated body"
            }
          ]
        }
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 5
      }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const config = createHarnessConfig({
      OPENAI_API_KEY: "openai-secret"
    } as NodeJS.ProcessEnv);

    const result = await generateAiText(config, { prompt: "Draft a PM document" }, {
      OPENAI_API_KEY: "openai-secret"
    } as NodeJS.ProcessEnv);

    expect(result.providerId).toBe("openai");
    expect(result.providerAttempts).toEqual([{ providerId: "openai", status: "passed" }]);
    expect(result.providerFallback).toBeUndefined();
    expect(result.text).toContain("Generated body");
    expect(result.endpoint).toBe("https://api.openai.com/v1/responses");
    expect(JSON.stringify(result)).not.toContain("openai-secret");
    expect(fetchMock).toHaveBeenCalledWith("https://api.openai.com/v1/responses", expect.objectContaining({
      method: "POST"
    }));
  });

	  it("falls back from an unready active AI provider to the next configured provider", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                text: "Gemini fallback body"
              }
            ]
          }
        }
      ],
      usageMetadata: {
        promptTokenCount: 3,
        candidatesTokenCount: 3
      }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const config = createHarnessConfig({
      GEMINI_API_KEY: "gemini-secret"
    } as NodeJS.ProcessEnv);
    config.activeAiProvider = "openai";
    config.aiProviders.openai.enabled = true;
    config.aiProviders.openai.configured = false;
    config.aiProviders.openai.missingEnv = ["OPENAI_API_KEY"];

    const result = await generateAiText(config, { prompt: "Draft via fallback" }, {
      GEMINI_API_KEY: "gemini-secret"
    } as NodeJS.ProcessEnv);

    expect(result.providerId).toBe("gemini");
    expect(result.text).toContain("Gemini fallback body");
    expect(result.providerAttempts).toEqual([
      {
        providerId: "openai",
        status: "skipped",
        message: "AI provider is not ready: missing=OPENAI_API_KEY"
      },
      {
        providerId: "gemini",
        status: "passed"
      }
    ]);
    expect(result.providerFallback).toEqual({
      selectedProviderId: "gemini",
      attemptedProviderIds: ["openai"],
      failures: [{
        providerId: "openai",
        message: "AI provider is not ready: missing=OPENAI_API_KEY"
      }]
    });
	    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("generativelanguage.googleapis.com"), expect.objectContaining({
	      method: "POST"
	    }));
	  });

	  it("falls back from active AI provider request failure to the next configured provider", async () => {
	    const fetchMock = vi.fn(async (url: string | URL | Request) => {
	      const target = String(url);
	      if (target.includes("api.openai.com")) {
	        return new Response(JSON.stringify({ error: { message: "quota exceeded" } }), { status: 429 });
	      }
	      return new Response(JSON.stringify({
	        candidates: [
	          {
	            content: {
	              parts: [
	                {
	                  text: "Gemini request-time fallback body"
	                }
	              ]
	            }
	          }
	        ],
	        usageMetadata: {
	          promptTokenCount: 3,
	          candidatesTokenCount: 4
	        }
	      }), { status: 200 });
	    });
	    vi.stubGlobal("fetch", fetchMock);
	    const config = createHarnessConfig({
	      OPENAI_API_KEY: "openai-secret",
	      GEMINI_API_KEY: "gemini-secret"
	    } as NodeJS.ProcessEnv);
	    config.activeAiProvider = "openai";

	    const result = await generateAiText(config, { prompt: "Draft via request-time fallback" }, {
	      OPENAI_API_KEY: "openai-secret",
	      GEMINI_API_KEY: "gemini-secret"
	    } as NodeJS.ProcessEnv);

	    expect(result.providerId).toBe("gemini");
	    expect(result.text).toContain("Gemini request-time fallback body");
	    expect(result.providerAttempts).toEqual([
	      {
	        providerId: "openai",
	        status: "failed",
	        message: "AI request failed (429) quota exceeded"
	      },
	      {
	        providerId: "gemini",
	        status: "passed"
	      }
	    ]);
	    expect(result.providerFallback).toEqual({
	      selectedProviderId: "gemini",
	      attemptedProviderIds: ["openai"],
	      failures: [{
	        providerId: "openai",
	        message: "AI request failed (429) quota exceeded"
	      }]
	    });
	    const runRecord = createAiRunRecord(result, "/ai run", "Draft via request-time fallback", {
	      kind: "prompt",
	      id: "fallback-observability"
	    });
	    expect(runRecord.providerAttempts).toEqual(result.providerAttempts);
	    expect(runRecord.providerFallback).toEqual(result.providerFallback);
	    expect(runRecord.outputPreview).toContain("Gemini request-time fallback body");
	    const chatRecord = createAiChatTurnRecord(
	      result,
	      "session-fallback",
	      "다음에 뭐 하면 돼?",
	      "Draft via request-time fallback"
	    );
	    expect(chatRecord.providerAttempts).toEqual(result.providerAttempts);
	    expect(chatRecord.providerFallback).toEqual(result.providerFallback);
	    expect(chatRecord.assistant.content).toContain("Gemini request-time fallback body");
	    expect(fetchMock).toHaveBeenCalledTimes(2);
	    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("api.openai.com");
	    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("generativelanguage.googleapis.com");
	  });

  it("surfaces latest provider failover summary through provider status tool", async () => {
    const config = createHarnessConfig({
      OPENAI_API_KEY: "openai-secret",
      GEMINI_API_KEY: "gemini-secret"
    } as NodeJS.ProcessEnv);
    config.activeAiProvider = "openai";
    saveRuntimeSession(root, {
      ...createRuntimeSessionManifest(root, "session-provider-status", "2026-05-22T00:00:00.000Z"),
      activeTurn: {
        id: "turn-provider-status",
        userInput: "다음에 뭐 하면 돼?",
        status: "complete",
        startedAt: "2026-05-22T00:00:00.000Z",
        updatedAt: "2026-05-22T00:00:01.000Z",
        providerId: "gemini",
        model: "gemini-2.5-pro",
        providerAttempts: [
          {
            providerId: "openai",
            status: "failed",
            message: "AI request failed (429) quota exceeded"
          },
          {
            providerId: "gemini",
            status: "passed"
          }
        ],
        providerFallback: {
          selectedProviderId: "gemini",
          attemptedProviderIds: ["openai"],
          failures: [{
            providerId: "openai",
            message: "AI request failed (429) quota exceeded"
          }]
        },
        toolCalls: [],
        finalResponse: "Gemini request-time fallback body"
      }
    });

    const output = await runAgentFabricTool({
      projectRoot: root,
      config,
      env: {
        OPENAI_API_KEY: "openai-secret",
        GEMINI_API_KEY: "gemini-secret"
      } as NodeJS.ProcessEnv,
      name: "provider.status",
      args: {}
    });
    const parsed = JSON.parse(output ?? "{}") as {
      latestFallbackSummary?: string;
      latestOutcome?: {
        source?: string;
        providerId?: string;
        providerAttempts?: Array<{ providerId: string; status: string }>;
      };
    };

    expect(parsed.latestOutcome?.source).toBe("runtime-session");
    expect(parsed.latestOutcome?.providerId).toBe("gemini");
    expect(parsed.latestOutcome?.providerAttempts).toEqual([
      expect.objectContaining({ providerId: "openai", status: "failed" }),
      expect.objectContaining({ providerId: "gemini", status: "passed" })
    ]);
    expect(parsed.latestFallbackSummary).toContain("ai provider fallback: openai -> gemini");
  });

	  it("keeps explicit AI provider selection strict when the selected provider is unready", async () => {
    const config = createHarnessConfig({
      GEMINI_API_KEY: "gemini-secret"
    } as NodeJS.ProcessEnv);
    config.aiProviders.openai.enabled = true;
    config.aiProviders.openai.configured = false;
    config.aiProviders.openai.missingEnv = ["OPENAI_API_KEY"];

    await expect(generateAiText(config, {
      providerId: "openai",
      prompt: "Draft with explicit OpenAI"
	    }, {
	      GEMINI_API_KEY: "gemini-secret"
	    } as NodeJS.ProcessEnv)).rejects.toThrow(/AI provider is not ready: openai/);
	  });

	  it("keeps explicit AI provider selection strict on request-time failure", async () => {
	    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
	      error: {
	        message: "quota exceeded"
	      }
	    }), { status: 429 }));
	    vi.stubGlobal("fetch", fetchMock);
	    const config = createHarnessConfig({
	      OPENAI_API_KEY: "openai-secret",
	      GEMINI_API_KEY: "gemini-secret"
	    } as NodeJS.ProcessEnv);

	    await expect(generateAiText(config, {
	      providerId: "openai",
	      prompt: "Draft with explicit OpenAI"
	    }, {
	      OPENAI_API_KEY: "openai-secret",
	      GEMINI_API_KEY: "gemini-secret"
	    } as NodeJS.ProcessEnv)).rejects.toThrow(/AI request failed \(429\) quota exceeded/);
	    expect(fetchMock).toHaveBeenCalledTimes(1);
	  });

  it("keeps imported TOML model provider binding strict on request-time failure", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes("api.openai.com")) {
        return new Response(JSON.stringify({
          error: {
            message: "quota exceeded"
          }
        }), { status: 429 });
      }
      return new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{ text: "Gemini should not receive this fallback" }]
          }
        }]
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const config = createHarnessConfig({
      OPENAI_API_KEY: "openai-secret",
      GEMINI_API_KEY: "gemini-secret"
    } as NodeJS.ProcessEnv);

    await expect(generateAiText(config, {
      prompt: "Draft with active TOML model",
      executionProfile: {
        source: "custom-toml",
        name: "test-automator",
        slug: "test-automator",
        model: "gpt-5.3-codex-spark",
        modelReasoningEffort: "medium",
        sandboxMode: "workspace-write"
      }
    }, {
      OPENAI_API_KEY: "openai-secret",
      GEMINI_API_KEY: "gemini-secret"
    } as NodeJS.ProcessEnv)).rejects.toThrow(/AI request failed \(429\) quota exceeded/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("api.openai.com");
  });

  it("classifies and persists approval-gated external action requests", () => {
    expect(classifyMutableAgentCommand("/status")).toBeNull();
    expect(classifyMutableAgentCommand("/notion sync --live")?.action).toBe("workspace.sync.live");
    expect(classifyMutableAgentCommand("/github create-repo --public")?.target).toBe("github");
    expect(classifyMutableAgentCommand("/github create-issue --agent FE --title Ship")).toBeNull();
    expect(classifyMutableAgentCommand("/github create-issue --agent FE --title Ship --live")).toMatchObject({
      target: "github",
      action: "issue.create",
      risk: "external_live_write"
    });
    expect(classifyMutableAgentCommand("/github create-pr --issue 12 --live")).toMatchObject({
      target: "github",
      action: "pr.create",
      risk: "external_live_write"
    });
    expect(classifyMutableAgentCommand("/mcp call stitch.create_project")).toMatchObject({
      target: "mcp",
      action: "stitch.create_project",
      risk: "external_live_write"
    });
    expect(classifyMutableAgentCommand("/mcp call stitch.unknown_tool")).toBeNull();

    const record = recordRuntimeActionApproval(root, {
      sessionId: "session-action",
      command: "/notion setup --live --title Smoke",
      reason: "agent proposed live Notion setup"
    });
    expect(record.status).toBe("pending");
    expect(record.risk).toBe("external_live_write");
    expect(record.command).toContain("/notion setup --live");

    const duplicate = recordRuntimeActionApproval(root, {
      sessionId: "session-action",
      command: "/notion setup --live --title Smoke",
      reason: "same command"
    });
    expect(duplicate.id).toBe(record.id);

    const orderedParams = recordRuntimeActionApproval(root, {
      sessionId: "session-action",
      command: "/github create-issue --agent FE --title Ship --live",
      reason: "agent proposed live GitHub issue",
      approvedTargetId: "owner/repo",
      approvedParameters: {
        owner: "owner",
        repo: "repo",
        command: "create-issue",
        title: "Ship"
      }
    });
    const reorderedParams = recordRuntimeActionApproval(root, {
      sessionId: "session-action",
      command: "/github create-issue --agent FE --title Ship --live",
      reason: "same issue with reordered params",
      approvedTargetId: "owner/repo",
      approvedParameters: {
        title: "Ship",
        command: "create-issue",
        repo: "repo",
        owner: "owner"
      }
    });
    expect(reorderedParams.id).toBe(orderedParams.id);

    const githubRecord = recordRuntimeActionApproval(root, {
      sessionId: "session-action",
      command: "/github create-issue --agent FE --title Ship --live",
      reason: "agent proposed live GitHub issue",
      approvedTargetId: "owner/other-repo",
      approvedParameters: {
        owner: "owner",
        repo: "other-repo",
        command: "create-issue",
        title: "Ship"
      }
    });
    expect(githubRecord.id).not.toBe(orderedParams.id);
    expect(githubRecord.fingerprint).not.toBe(orderedParams.fingerprint);
    expect(githubRecord.approvedTargetId).toBe("owner/other-repo");
    expect(githubRecord.approvedParameters?.title).toBe("Ship");

    const approved = approveRuntimeAction(root, record.id, "tester");
    expect(approved.status).toBe("approved");
    expect(approved.approvedBy).toBe("tester");

    const running = startRuntimeAction(root, record.id);
    expect(running.status).toBe("running");

    const completed = completeRuntimeAction(root, record.id, "readback stored", {
      expectedReadback: "Notion workspace proof includes action binding",
      readbackStatus: "passed",
      readbackArtifactPath: ".rph/notion/live-workspace.json",
      actionApprovalId: running.id,
      approvedFingerprint: running.fingerprint,
      verifiedAt: running.runningAt
    });
    expect(completed.status).toBe("completed");
    expect(completed.resultSummary).toBe("readback stored");
    expect(completed.readbackActionApprovalId).toBe(record.id);
    expect(completed.readbackApprovedFingerprint).toBe(running.fingerprint);

    const records = loadRuntimeActionApprovals(root);
    expect(records).toHaveLength(3);
    expect(records.find((item) => item.id === record.id)?.status).toBe("completed");
    expect(readProofLedgerEvents(root)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "external-action.readback",
        status: "passed",
        subject: `external-action:notion:workspace.setup.live:${record.id}`,
        label: "notion:workspace.setup.live"
      })
    ]));
  });

  it("binds GitHub approval fingerprints to local issue and PR snapshots", () => {
    const issue = createWorkIssue(root, {
      workstream: "FE",
      label: "feat",
      title: "Snapshot bound issue",
      acceptanceCriteria: ["original acceptance"]
    });
    const issueSnapshot = captureGitHubIssueApprovalSnapshot(root, "owner", "repo", issue);
    const issueBound = recordRuntimeActionApproval(root, {
      sessionId: "session-action",
      command: "/github create-issue --agent FE --title \"Snapshot bound issue\" --live",
      reason: "agent proposed live GitHub issue with local snapshot",
      approvedTargetId: "owner/repo",
      approvedParameters: {
        owner: "owner",
        repo: "repo",
        command: "create-issue",
        title: issue.title,
        localIssueNumber: String(issue.issueNumber),
        snapshotFingerprint: issueSnapshot.fingerprint
      },
      approvedSnapshot: issueSnapshot
    });
    const mutatedIssue = {
      ...issue,
      title: "Snapshot drifted issue"
    };
    fs.writeFileSync(path.join(root, ".rph", "issues", `issue-${issue.issueNumber}.json`), `${JSON.stringify(mutatedIssue, null, 2)}\n`);
    const driftedIssueSnapshot = currentGitHubIssueApprovalSnapshot(root, "owner", "repo", mutatedIssue);
    expect(driftedIssueSnapshot.fingerprint).not.toBe(issueSnapshot.fingerprint);
    const issueDrift = recordRuntimeActionApproval(root, {
      sessionId: "session-action",
      command: "/github create-issue --agent FE --title \"Snapshot bound issue\" --live",
      reason: "same command after local issue drift",
      approvedTargetId: "owner/repo",
      approvedParameters: {
        owner: "owner",
        repo: "repo",
        command: "create-issue",
        title: issue.title,
        localIssueNumber: String(issue.issueNumber),
        snapshotFingerprint: driftedIssueSnapshot.fingerprint
      },
      approvedSnapshot: driftedIssueSnapshot
    });
    expect(issueDrift.id).not.toBe(issueBound.id);
    expect(issueDrift.fingerprint).not.toBe(issueBound.fingerprint);

    const prIssue = createWorkIssue(root, { workstream: "FE", title: "Snapshot bound PR" });
    const pr = createPullRequestDraft(root, prIssue.issueNumber);
    const prSnapshot = captureGitHubPullRequestApprovalSnapshot(root, "owner", "repo", pr, prIssue);
    const prBound = recordRuntimeActionApproval(root, {
      sessionId: "session-action",
      command: `/github create-pr --issue ${prIssue.issueNumber} --live`,
      reason: "agent proposed live GitHub PR with local snapshot",
      approvedTargetId: "owner/repo",
      approvedParameters: {
        owner: "owner",
        repo: "repo",
        command: "create-pr",
        issue: String(prIssue.issueNumber),
        target: pr.targetBranch,
        localIssueNumber: String(prIssue.issueNumber),
        localPrNumber: String(pr.prNumber),
        snapshotFingerprint: prSnapshot.fingerprint
      },
      approvedSnapshot: prSnapshot
    });
    fs.appendFileSync(path.join(root, ".rph", "prs", `issue-${prIssue.issueNumber}.md`), "\nMutated after approval\n");
    const driftedPrSnapshot = currentGitHubPullRequestApprovalSnapshot(root, "owner", "repo", pr, prIssue);
    expect(driftedPrSnapshot.fingerprint).not.toBe(prSnapshot.fingerprint);
    const prDrift = recordRuntimeActionApproval(root, {
      sessionId: "session-action",
      command: `/github create-pr --issue ${prIssue.issueNumber} --live`,
      reason: "same command after PR body drift",
      approvedTargetId: "owner/repo",
      approvedParameters: {
        owner: "owner",
        repo: "repo",
        command: "create-pr",
        issue: String(prIssue.issueNumber),
        target: pr.targetBranch,
        localIssueNumber: String(prIssue.issueNumber),
        localPrNumber: String(pr.prNumber),
        snapshotFingerprint: driftedPrSnapshot.fingerprint
      },
      approvedSnapshot: driftedPrSnapshot
    });
    expect(prDrift.id).not.toBe(prBound.id);
    expect(prDrift.fingerprint).not.toBe(prBound.fingerprint);
  });

  it("rejects readback proofs that are not bound to the running approval", () => {
    const record = approveRuntimeAction(root, recordRuntimeActionApproval(root, {
      sessionId: "session-action",
      command: "/notion setup --live --title Smoke",
      reason: "readback binding probe"
    }).id, "tester");
    const running = startRuntimeAction(root, record.id);
    const staleVerifiedAt = new Date(Date.parse(running.runningAt ?? new Date().toISOString()) - 1000).toISOString();

    expect(runtimeActionReadbackBindingError(running, {
      actionApprovalId: "different-action",
      approvedFingerprint: running.fingerprint,
      actionVerifiedAt: running.runningAt
    })).toContain("readback action id mismatch");
    expect(runtimeActionReadbackBindingError(running, {
      actionApprovalId: running.id,
      approvedFingerprint: "different-fingerprint",
      actionVerifiedAt: running.runningAt
    })).toContain("readback fingerprint mismatch");
    expect(runtimeActionReadbackBindingError(running, {
      actionApprovalId: running.id,
      approvedFingerprint: running.fingerprint,
      actionVerifiedAt: staleVerifiedAt
    })).toContain("readback is stale");
    expect(runtimeActionReadbackBindingError(running, {
      actionApprovalId: running.id,
      approvedFingerprint: running.fingerprint,
      actionVerifiedAt: running.runningAt
    })).toBeNull();
  });

  it("rejects pending external actions and prevents stale approval reuse", () => {
    const record = recordRuntimeActionApproval(root, {
      sessionId: "session-action",
      command: "/github setup-labels",
      reason: "agent proposed label setup"
    });
    const rejected = rejectRuntimeAction(root, record.id, "not now", "tester");
    expect(rejected.status).toBe("rejected");
    expect(rejected.rejectReason).toBe("not now");
    expect(() => approveRuntimeAction(root, record.id, "tester")).toThrow(/cannot approve action/);
  });

  it("approves and starts external actions as a single one-shot transition", () => {
    const record = recordRuntimeActionApproval(root, {
      sessionId: "session-action",
      command: "/notion sync --live",
      reason: "agent proposed live sync"
    });

    const running = approveAndStartRuntimeAction(root, record.id, "tester");

    expect(running.status).toBe("running");
    expect(running.approvedBy).toBe("tester");
    expect(running.approvedAt).toBeTruthy();
    expect(running.runningAt).toBe(running.approvedAt);
    expect(loadRuntimeActionApprovals(root).find((item) => item.id === record.id)?.status).toBe("running");
    expect(() => approveAndStartRuntimeAction(root, record.id, "tester-2")).toThrow(/cannot approve and start action/);
    expect(() => approveRuntimeAction(root, record.id, "tester-2")).toThrow(/cannot approve action/);
  });

  it("recovers stale action approval lock files before mutating approval state", () => {
    const lockPath = `${runtimeActionApprovalsFile(root)}.lock`;
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, "stale lock");
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(lockPath, old, old);

    const record = recordRuntimeActionApproval(root, {
      sessionId: "session-action",
      command: "/notion sync --live",
      reason: "agent proposed live sync after stale lock"
    });

    expect(record.status).toBe("pending");
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("builds and records runtime AI chat turns", () => {
    const prompt = buildAiChatPrompt("다음에 뭐 하면 돼?", [
      {
        role: "user",
        content: "안녕",
        at: "2026-05-20T00:00:00.000Z"
      },
      {
        role: "assistant",
        content: "안녕하세요.",
        at: "2026-05-20T00:00:01.000Z"
      }
    ], "Runtime project context:\n- stage: SETUP");
    expect(prompt).toContain("Runtime project context");
    expect(prompt).toContain("USER: 안녕");
    expect(prompt).toContain("Current user message");

    const record = createAiChatTurnRecord({
      id: "ai_run_test",
      providerId: "openai",
      model: "gpt-5.4",
      text: "다음은 /pm start 입니다.",
      endpoint: "https://api.openai.com/v1/responses",
      generatedAt: "2026-05-20T00:00:02.000Z"
    }, "session-test", "다음에 뭐 하면 돼?", prompt);
    const filePath = writeAiChatTurnRecord(root, record);
    const saved = fs.readFileSync(filePath, "utf8");
    expect(saved).toContain("ai_run_test");
    expect(saved).not.toContain("openai-secret");
  });

  it("executes read-only agent tool calls and records the turn in runtime state", async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      callCount += 1;
      const text = callCount === 1
        ? JSON.stringify({
            action: {
              type: "tool_call",
              tool: "workflow.get_status",
              args: {}
            }
          })
        : JSON.stringify({
            action: {
              type: "respond",
              message: "현재 단계는 SETUP입니다."
            }
          });
      return new Response(JSON.stringify({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text
              }
            ]
          }
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 5
        }
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const config = createHarnessConfig({
      OPENAI_API_KEY: "openai-secret"
    } as NodeJS.ProcessEnv);

    const result = await executeAgentTurn({
      projectRoot: root,
      sessionId: "session-tool-loop",
      userInput: "팀에게 현재 상황을 설명해줘",
      config,
      env: {
        OPENAI_API_KEY: "openai-secret"
      } as NodeJS.ProcessEnv
    });

    expect(result.text).toContain("SETUP");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondPayload = JSON.parse(String(fetchMock.mock.calls[1][1]?.body ?? "{}")) as { input: string };
    expect(secondPayload.input).toContain("Tool observation");
    const manifest = loadRuntimeSession(root);
    expect(manifest?.version).toBe(2);
    expect(manifest?.activeTurn?.status).toBe("complete");
    expect(manifest?.activeTurn?.toolCalls[0].name).toBe("workflow.get_status");
    expect(manifest?.activeTurn?.toolCalls[0].status).toBe("succeeded");
    expect(manifest?.activeTurn?.toolCalls[0].observation).toContain("\"stage\": \"SETUP\"");
    expect(manifest?.toolTrace?.[0].name).toBe("workflow.get_status");
  });

  it("records unsupported agent tools as failed observations before final response", async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      callCount += 1;
      const text = callCount === 1
        ? JSON.stringify({
            action: {
              type: "tool_call",
              tool: "external.mcp.write",
              args: { target: "notion" }
            }
          })
        : JSON.stringify({
            action: {
              type: "respond",
              message: "외부 쓰기 도구는 아직 허용되지 않습니다."
            }
          });
      return new Response(JSON.stringify({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text
              }
            ]
          }
        ]
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const config = createHarnessConfig({ OPENAI_API_KEY: "openai-secret" } as NodeJS.ProcessEnv);

    const result = await executeAgentTurn({
      projectRoot: root,
      sessionId: "session-unsupported-tool",
      userInput: "Notion에 바로 써줘",
      config,
      env: { OPENAI_API_KEY: "openai-secret" } as NodeJS.ProcessEnv
    });

    expect(result.text).toContain("허용되지 않습니다");
    const manifest = loadRuntimeSession(root);
    expect(manifest?.activeTurn?.status).toBe("complete");
    expect(manifest?.activeTurn?.toolCalls[0].name).toBe("external.mcp.write");
    expect(manifest?.activeTurn?.toolCalls[0].status).toBe("failed");
    expect(manifest?.activeTurn?.toolCalls[0].error).toContain("unsupported agent tool");
  });

  it("chains multiple read-only tools before final response", async () => {
    createDocumentVersion(root, "product-definition", {
      changeSummary: "seed",
      body: "# Product Definition\n\n실행형 하네스"
    });
    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount += 1;
      const text = callCount === 1
        ? JSON.stringify({
            action: {
              type: "tool_call",
              tool: "artifacts.list",
              args: {}
            }
          })
        : callCount === 2
          ? JSON.stringify({
              action: {
                type: "tool_call",
                tool: "artifacts.get",
                args: { id: "product-definition" }
              }
            })
          : JSON.stringify({
              action: {
                type: "respond",
                message: "product-definition 문서를 확인했습니다."
              }
            });
      return new Response(JSON.stringify({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text
              }
            ]
          }
        ]
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const config = createHarnessConfig({ OPENAI_API_KEY: "openai-secret" } as NodeJS.ProcessEnv);

    const result = await executeAgentTurn({
      projectRoot: root,
      sessionId: "session-tool-chain",
      userInput: "제품 정의 문서 내용을 확인해줘",
      config,
      env: { OPENAI_API_KEY: "openai-secret" } as NodeJS.ProcessEnv
    });

    expect(result.text).toContain("확인했습니다");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const manifest = loadRuntimeSession(root);
    expect(manifest?.activeTurn?.toolCalls.map((call) => call.name)).toEqual(["artifacts.list", "artifacts.get"]);
    expect(manifest?.activeTurn?.toolCalls[1].observation).toContain("실행형 하네스");
    expect(manifest?.toolTrace?.slice(-2).map((call) => call.name)).toEqual(["artifacts.list", "artifacts.get"]);
  });

  it("lets the agent read configured GitHub repository metadata through the tool fabric", async () => {
    let openAiCallCount = 0;
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const endpoint = String(url);
      if (endpoint.includes("api.github.com")) {
        return new Response(JSON.stringify({
          id: 42,
          full_name: "owner/repo",
          private: false,
          visibility: "public",
          default_branch: "main",
          html_url: "https://github.com/owner/repo",
          pushed_at: "2026-05-21T00:00:00Z",
          open_issues_count: 3,
          permissions: { admin: true }
        }), { status: 200 });
      }
      openAiCallCount += 1;
      const text = openAiCallCount === 1
        ? JSON.stringify({
            action: {
              type: "tool_call",
              tool: "github.repo.read",
              args: {}
            }
          })
        : JSON.stringify({
            action: {
              type: "respond",
              message: "GitHub repo owner/repo is public."
            }
          });
      return new Response(JSON.stringify({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text
              }
            ]
          }
        ]
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      OPENAI_API_KEY: "openai-secret",
      GITHUB_TOKEN: "github-secret",
      GITHUB_OWNER: "owner",
      GITHUB_REPO: "repo"
    } as NodeJS.ProcessEnv;
    const config = createHarnessConfig(env);

    const result = await executeAgentTurn({
      projectRoot: root,
      sessionId: "session-github-tool",
      userInput: "연결된 GitHub repo 상태를 읽어줘",
      config,
      env
    });

    expect(result.text).toContain("owner/repo");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const manifest = loadRuntimeSession(root);
    expect(manifest?.activeTurn?.toolCalls[0].name).toBe("github.repo.read");
    expect(manifest?.activeTurn?.toolCalls[0].status).toBe("succeeded");
    expect(manifest?.activeTurn?.toolCalls[0].observation).toContain("\"visibility\": \"public\"");
    expect(manifest?.activeTurn?.toolCalls[0].observation).not.toContain("github-secret");
  });

  it("lets the agent call a guarded protocol MCP tool through the generic MCP fabric", async () => {
    let openAiCallCount = 0;
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const rawBody = String(init?.body ?? "{}");
      const body = JSON.parse(rawBody) as {
        method?: string;
        id?: string;
        input?: string;
        params?: Record<string, unknown>;
      };
      if (body.method === "initialize") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "stitch", version: "test" }
          }
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "Mcp-Session-Id": "session-tool-call"
          }
        });
      }
      if (body.method === "notifications/initialized") {
        expect(init?.headers).toMatchObject({ "Mcp-Session-Id": "session-tool-call" });
        return new Response(null, { status: 202 });
      }
      if (body.method === "tools/list") {
        expect(init?.headers).toMatchObject({
          "MCP-Protocol-Version": "2025-06-18",
          "Mcp-Session-Id": "session-tool-call",
          "X-Goog-Api-Key": "stitch-secret"
        });
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [{ name: "echo", description: "Echo input", annotations: { readOnlyHint: true } }]
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (body.method === "tools/call") {
        expect(init?.headers).toMatchObject({
          "MCP-Protocol-Version": "2025-06-18",
          "Mcp-Session-Id": "session-tool-call",
          "X-Goog-Api-Key": "stitch-secret"
        });
        expect(body.params).toEqual({
          name: "echo",
          arguments: { text: "hello" }
        });
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            content: [{ type: "text", text: "hello" }],
            structuredContent: { text: "hello" },
            isError: false
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      openAiCallCount += 1;
      const text = openAiCallCount === 1
        ? JSON.stringify({
            action: {
              type: "tool_call",
              tool: "mcp.tools.call",
              args: {
                server: "stitch",
                toolName: "echo",
                readOnly: true,
                arguments: { text: "hello" }
              }
            }
          })
        : JSON.stringify({
            action: {
              type: "respond",
              message: "MCP echo returned hello."
            }
          });
      return new Response(JSON.stringify({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text
              }
            ]
          }
        ]
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      OPENAI_API_KEY: "openai-secret",
      STITCH_API_KEY: "stitch-secret"
    } as NodeJS.ProcessEnv;
    const config = createHarnessConfig(env);

    const result = await executeAgentTurn({
      projectRoot: root,
      sessionId: "session-stitch-tool-call",
      userInput: "Stitch echo tool을 읽기 전용으로 호출해줘",
      config,
      env
    });

    expect(result.text).toContain("hello");
    const manifest = loadRuntimeSession(root);
    expect(manifest?.activeTurn?.toolCalls[0].name).toBe("mcp.tools.call");
    expect(manifest?.activeTurn?.toolCalls[0].status).toBe("succeeded");
    expect(manifest?.activeTurn?.toolCalls[0].observation).toContain("\"structuredContent\"");
    expect(manifest?.activeTurn?.toolCalls[0].observation).not.toContain("stitch-secret");
  });

  it("keeps REST adapters out of generic MCP tools/call", async () => {
    const config = createHarnessConfig({
      GITHUB_TOKEN: "github-secret",
      GITHUB_OWNER: "owner",
      GITHUB_REPO: "repo"
    } as NodeJS.ProcessEnv);

    await expect(runAgentFabricTool({
      projectRoot: root,
      config,
      env: {
        GITHUB_TOKEN: "github-secret",
        GITHUB_OWNER: "owner",
        GITHUB_REPO: "repo"
      } as NodeJS.ProcessEnv,
      name: "mcp.tools.call",
      args: {
        server: "github",
        toolName: "repo.read",
        readOnly: true,
        arguments: {}
      }
    })).rejects.toThrow("github is a REST adapter");
  });

  it("requires readOnly=true for generic MCP tools/call", async () => {
    const config = createHarnessConfig({
      STITCH_API_KEY: "stitch-secret"
    } as NodeJS.ProcessEnv);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(runAgentFabricTool({
      projectRoot: root,
      config,
      env: {
        STITCH_API_KEY: "stitch-secret"
      } as NodeJS.ProcessEnv,
      name: "mcp.tools.call",
      args: {
        server: "stitch",
        toolName: "echo",
        arguments: { text: "hello" }
      }
    })).rejects.toThrow("mcp.tools.call requires args.readOnly=true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks unallowlisted MCP tools/call before any outbound request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const env = { STITCH_API_KEY: "stitch-secret" } as NodeJS.ProcessEnv;
    const config = createHarnessConfig(env);

    await expect(runAgentFabricTool({
      projectRoot: root,
      config,
      env,
      name: "mcp.tools.call",
      args: {
        server: "stitch",
        toolName: "create_project",
        readOnly: true,
        arguments: { title: "Unsafe Project" }
      }
    })).rejects.toThrow("stitch.create_project is not in the agent read-only MCP tool allowlist");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not let forged connection reports unlock MCP tools/call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const env = { CUSTOM_ECHO_MCP_TOKEN: "custom-secret" } as NodeJS.ProcessEnv;
    const config = createHarnessConfig(env);
    config.mcpServers["custom-echo"] = {
      id: "custom-echo",
      name: "Custom Echo",
      kind: "mcp-server",
      enabled: true,
      configured: true,
      transport: "http",
      url: "https://mcp.example.test/echo",
      authMode: "bearer",
      authEnvKey: "CUSTOM_ECHO_MCP_TOKEN",
      protocolReadiness: "tools/list",
      agentReadOnlyTools: [],
      custom: true,
      envKeys: ["CUSTOM_ECHO_MCP_TOKEN"],
      missingEnv: [],
      warnings: [],
      notes: "Custom echo protocol server."
    };
    const forgedReportDir = path.join(root, ".rph", "connections");
    fs.mkdirSync(forgedReportDir, { recursive: true });
    fs.writeFileSync(path.join(forgedReportDir, "latest.json"), JSON.stringify({
      checkedAt: "2026-05-26T00:00:00.000Z",
      checks: [{
        id: "custom-echo",
        kind: "mcp",
        status: "passed",
        message: "forged ready",
        requiredEnv: ["CUSTOM_ECHO_MCP_TOKEN"],
        missingEnv: [],
        checkedAt: "2026-05-26T00:00:00.000Z",
        readiness: {
          mode: "protocol-ready",
          provenStage: "protocol-tool-call",
          stages: [
            { stage: "transport", status: "passed", message: "forged" },
            { stage: "credential-probe", status: "passed", message: "forged" },
            { stage: "protocol-tools-list", status: "passed", message: "forged" },
            { stage: "protocol-tool-call", status: "passed", message: "forged" }
          ]
        },
        policy: {
          kind: "read-only-probe",
          source: "runtime",
          state: "proved-now",
          satisfied: true,
          requiredTrust: "protocol-ready:protocol-tool-call",
          actualTrust: "protocol-ready:protocol-tool-call",
          allowToolsList: true,
          allowReadOnlyToolCall: true,
          requireExplicitServerSelection: true,
          agentReadOnlyTools: ["echo"],
          requiredTools: ["echo"],
          missingTools: [],
          configFingerprint: "forged"
        }
      }]
    }, null, 2));

    await expect(runAgentFabricTool({
      projectRoot: root,
      config,
      env,
      name: "mcp.tools.call",
      args: {
        server: "custom-echo",
        toolName: "echo",
        readOnly: true,
        arguments: { text: "hello" }
      }
    })).rejects.toThrow("custom-echo MCP policy blocks agent tools/call");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires an explicit protocol MCP server when none is configured", async () => {
    const config = createHarnessConfig({} as NodeJS.ProcessEnv);

    await expect(runAgentFabricTool({
      projectRoot: root,
      config,
      env: {} as NodeJS.ProcessEnv,
      name: "mcp.tools.call",
      args: {
        toolName: "echo",
        readOnly: true,
        arguments: { text: "hello" }
      }
    })).rejects.toThrow("mcp.tools.call requires args.server because no protocol MCP server is configured");
  });

  it("requires args.server when stitch and a custom protocol MCP server are both configured", async () => {
    const env = {
      STITCH_API_KEY: "stitch-secret",
      CUSTOM_ECHO_MCP_TOKEN: "custom-secret"
    } as NodeJS.ProcessEnv;
    const config = addCustomProtocolMcpServer(root, {
      id: "custom-echo",
      name: "Custom Echo",
      url: "https://mcp.example.test/echo",
      authMode: "bearer",
      authEnvKey: "CUSTOM_ECHO_MCP_TOKEN",
      agentReadOnlyTools: ["echo"]
    }, env);

    await expect(runAgentFabricTool({
      projectRoot: root,
      config,
      env,
      name: "mcp.tools.call",
      args: {
        toolName: "echo",
        readOnly: true,
        arguments: { text: "hello" }
      }
    })).rejects.toThrow("mcp.tools.call requires args.server when multiple protocol MCP servers are configured: stitch, custom-echo");
  });

  it("dispatches mcp.tools.call to the explicit custom protocol MCP server", async () => {
    const methods: string[] = [];
    const urls: string[] = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      urls.push(String(url));
      const body = JSON.parse(String(init?.body ?? "{}")) as { id?: string; method?: string; params?: Record<string, unknown> };
      if (body.method) {
        methods.push(body.method);
      }
      expect(String(url)).toBe("https://mcp.example.test/echo");
      if (body.method === "initialize") {
        expect(init?.headers).toMatchObject({ Authorization: "Bearer custom-secret" });
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "custom-echo", version: "test" }
          }
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "Mcp-Session-Id": "session-custom-call"
          }
        });
      }
      if (body.method === "notifications/initialized") {
        expect(init?.headers).toMatchObject({ "Mcp-Session-Id": "session-custom-call" });
        return new Response(null, { status: 202 });
      }
      if (body.method === "tools/list") {
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer custom-secret",
          "Mcp-Session-Id": "session-custom-call"
        });
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [{ name: "echo", description: "Echo input", annotations: { readOnlyHint: true } }]
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (body.method === "tools/call") {
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer custom-secret",
          "Mcp-Session-Id": "session-custom-call"
        });
        expect(body.params).toEqual({
          name: "echo",
          arguments: { text: "hello" }
        });
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            content: [{ type: "text", text: "hello" }],
            structuredContent: { server: "custom-echo", text: "hello" },
            isError: false
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: { message: "unexpected request" } }), { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      STITCH_API_KEY: "stitch-secret",
      CUSTOM_ECHO_MCP_TOKEN: "custom-secret"
    } as NodeJS.ProcessEnv;
    const config = addCustomProtocolMcpServer(root, {
      id: "custom-echo",
      name: "Custom Echo",
      url: "https://mcp.example.test/echo",
      authMode: "bearer",
      authEnvKey: "CUSTOM_ECHO_MCP_TOKEN",
      agentReadOnlyTools: ["echo"]
    }, env);

    const output = await runAgentFabricTool({
      projectRoot: root,
      config,
      env,
      name: "mcp.tools.call",
      args: {
        server: "custom-echo",
        toolName: "echo",
        readOnly: true,
        arguments: { text: "hello" }
      }
    });
    const parsed = JSON.parse(output ?? "{}") as { server: string; toolName: string; structuredContent?: { server?: string; text?: string } };

    expect(methods).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/list",
      "initialize",
      "notifications/initialized",
      "tools/call"
    ]);
    expect(urls.every((url) => url === "https://mcp.example.test/echo")).toBe(true);
    expect(parsed).toMatchObject({
      server: "custom-echo",
      toolName: "echo",
      structuredContent: { server: "custom-echo", text: "hello" }
    });
    expect(JSON.stringify(parsed)).not.toContain("custom-secret");
  });

  it("binds read-only MCP tools/call to current tools/list contracts and blocks metadata drift", async () => {
    const methods: string[] = [];
    let schemaType = "string";
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { id?: string; method?: string; params?: Record<string, unknown> };
      if (body.method) {
        methods.push(body.method);
      }
      if (body.method === "initialize") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "custom-echo", version: "test" }
          }
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "Mcp-Session-Id": "session-bound-call"
          }
        });
      }
      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }
      if (body.method === "tools/list") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [{
              name: "echo",
              description: "Echo input",
              inputSchema: { type: "object", properties: { text: { type: schemaType } } },
              annotations: { readOnlyHint: true }
            }]
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (body.method === "tools/call") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            content: [{ type: "text", text: "hello" }],
            structuredContent: { server: "custom-echo", text: "hello" },
            isError: false
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`unexpected MCP method: ${body.method}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      CUSTOM_ECHO_MCP_TOKEN: "custom-secret"
    } as NodeJS.ProcessEnv;
    addCustomProtocolMcpServer(root, {
      id: "custom-echo",
      name: "Custom Echo",
      url: "https://mcp.example.test/echo?token=secret",
      authMode: "bearer",
      authEnvKey: "CUSTOM_ECHO_MCP_TOKEN",
      agentReadOnlyTools: ["echo"]
    }, env);

    const binding = await bindMcpReadOnlyToolContracts(root, "custom-echo", env);
    const contract = binding.config.mcpPolicyRegistry.servers["custom-echo"].toolContracts?.echo;
    expect(binding.boundTools).toEqual(["echo"]);
    expect(binding.missingTools).toEqual([]);
    expect(contract?.fingerprint).toHaveLength(24);
    expect(contract?.endpoint).toBe("https://mcp.example.test/echo?token=%3Credacted%3E");
    expect(contract?.inputSchemaSha256).toHaveLength(64);
    expect(contract?.annotationsSha256).toHaveLength(64);

    const output = await runAgentFabricTool({
      projectRoot: root,
      config: binding.config,
      env,
      name: "mcp.tools.call",
      args: {
        server: "custom-echo",
        toolName: "echo",
        readOnly: true,
        arguments: { text: "hello" }
      }
    });
    const parsed = JSON.parse(output ?? "{}") as { toolContract?: { fingerprint?: string } };
    expect(parsed.toolContract?.fingerprint).toBe(contract?.fingerprint);

    methods.length = 0;
    schemaType = "number";
    await expect(runAgentFabricTool({
      projectRoot: root,
      config: binding.config,
      env,
      name: "mcp.tools.call",
      args: {
        server: "custom-echo",
        toolName: "echo",
        readOnly: true,
        arguments: { text: "hello" }
      }
    })).rejects.toThrow("custom-echo.echo MCP read-only tool contract drifted");
    expect(methods).toEqual(["initialize", "notifications/initialized", "tools/list"]);
  });

  it("shrinks read-only MCP allowlists to the currently bindable tool contracts", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { id?: string; method?: string };
      if (body.method === "initialize") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "custom-echo", version: "test" }
          }
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "Mcp-Session-Id": "session-shrink-allowlist"
          }
        });
      }
      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }
      if (body.method === "tools/list") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [{
              name: "echo",
              description: "Echo input",
              inputSchema: { type: "object", properties: { text: { type: "string" } } },
              annotations: { readOnlyHint: true }
            }]
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`unexpected MCP method: ${body.method}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      CUSTOM_ECHO_MCP_TOKEN: "custom-secret"
    } as NodeJS.ProcessEnv;
    addCustomProtocolMcpServer(root, {
      id: "custom-echo",
      name: "Custom Echo",
      url: "https://mcp.example.test/echo",
      authMode: "bearer",
      authEnvKey: "CUSTOM_ECHO_MCP_TOKEN",
      agentReadOnlyTools: ["echo", "missing-tool"]
    }, env);

    const binding = await bindMcpReadOnlyToolContracts(root, "custom-echo", env);
    const synced = readHarnessConfigSnapshot(root, env);

    expect(binding.boundTools).toEqual(["echo"]);
    expect(binding.missingTools).toEqual(["missing-tool"]);
    expect(binding.config.mcpPolicyRegistry.servers["custom-echo"].agentReadOnlyTools).toEqual(["echo"]);
    expect(binding.config.mcpPolicyRegistry.servers["custom-echo"].toolContracts?.["missing-tool"]).toBeUndefined();
    expect(synced.mcpPolicyRegistry.servers["custom-echo"].agentReadOnlyTools).toEqual(["echo"]);
  });

  it("rejects agent MCP tools/call when current tool metadata marks the tool mutating", async () => {
    const methods: string[] = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { id?: string; method?: string };
      if (body.method) {
        methods.push(body.method);
      }
      if (body.method === "initialize") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "custom-echo", version: "test" }
          }
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "Mcp-Session-Id": "session-mutating"
          }
        });
      }
      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }
      if (body.method === "tools/list") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [{ name: "echo", description: "Looks safe by name", annotations: { destructiveHint: true } }]
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`unexpected MCP method: ${body.method}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      CUSTOM_ECHO_MCP_TOKEN: "custom-secret"
    } as NodeJS.ProcessEnv;
    const config = addCustomProtocolMcpServer(root, {
      id: "custom-echo",
      name: "Custom Echo",
      url: "https://mcp.example.test/echo",
      authMode: "bearer",
      authEnvKey: "CUSTOM_ECHO_MCP_TOKEN",
      agentReadOnlyTools: ["echo"]
    }, env);

    await expect(runAgentFabricTool({
      projectRoot: root,
      config,
      env,
      name: "mcp.tools.call",
      args: {
        server: "custom-echo",
        toolName: "echo",
        readOnly: true,
        arguments: { text: "hello" }
      }
    })).rejects.toThrow("custom-echo MCP tool is not explicitly verified read-only by current tools/list metadata: echo");
    expect(methods).not.toContain("tools/call");
  });

  it("rejects agent MCP tools/call when current tool metadata omits readOnlyHint", async () => {
    const methods: string[] = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { id?: string; method?: string };
      if (body.method) {
        methods.push(body.method);
      }
      if (body.method === "initialize") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "custom-echo", version: "test" }
          }
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "Mcp-Session-Id": "session-no-readonly-hint"
          }
        });
      }
      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }
      if (body.method === "tools/list") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [{ name: "echo", description: "No metadata" }]
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`unexpected MCP method: ${body.method}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      CUSTOM_ECHO_MCP_TOKEN: "custom-secret"
    } as NodeJS.ProcessEnv;
    const config = addCustomProtocolMcpServer(root, {
      id: "custom-echo",
      name: "Custom Echo",
      url: "https://mcp.example.test/echo",
      authMode: "bearer",
      authEnvKey: "CUSTOM_ECHO_MCP_TOKEN",
      agentReadOnlyTools: ["echo"]
    }, env);

    await expect(runAgentFabricTool({
      projectRoot: root,
      config,
      env,
      name: "mcp.tools.call",
      args: {
        server: "custom-echo",
        toolName: "echo",
        readOnly: true,
        arguments: { text: "hello" }
      }
    })).rejects.toThrow("custom-echo MCP tool is not explicitly verified read-only by current tools/list metadata: echo");
    expect(methods).not.toContain("tools/call");
  });

  it("exposes operator MCP discovery but blocks calls without a local read-only allowlist", async () => {
    const originalSecret = process.env.CUSTOM_ECHO_MCP_TOKEN;
    process.env.CUSTOM_ECHO_MCP_TOKEN = "custom-secret";
    const methods: string[] = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        id?: string;
        method?: string;
        params?: { name?: string; arguments?: Record<string, unknown> };
      };
      if (body.method) {
        methods.push(body.method);
      }
      if (body.method === "initialize") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "custom-echo", version: "test" }
          }
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "Mcp-Session-Id": "session-operator"
          }
        });
      }
      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }
      if (body.method === "tools/list") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [
              { name: "echo", description: "Echo input" },
              { name: "write-file", description: "Mutating example" }
            ]
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (body.method === "tools/call") {
        expect(body.params).toEqual({
          name: "echo",
          arguments: { text: "hi" }
        });
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            content: [{ type: "text", text: "hi" }],
            structuredContent: { text: "hi" },
            isError: false
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: { message: "unexpected request" } }), { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const config = addCustomProtocolMcpServer(root, {
        id: "custom-echo",
        name: "Custom Echo",
        url: "https://mcp.example.test/echo",
        authMode: "bearer",
        authEnvKey: "CUSTOM_ECHO_MCP_TOKEN"
      }, process.env);

      const agentList = await runAgentFabricTool({
        projectRoot: root,
        config,
        env: process.env,
        name: "mcp.tools.list",
        args: { server: "custom-echo" }
      });
      expect(JSON.parse(agentList ?? "{}")).toMatchObject({
        servers: [{
          tools: [],
          policy: { allowReadOnlyToolCall: false }
        }]
      });

      expect(await runParsedCommand(root, parseCli(["mcp", "tools", "custom-echo"]))).toBe(true);
      expect(await runParsedCommand(root, parseCli(["mcp", "call", "custom-echo", "echo", "--read-only", "--args-json", "{\"text\":\"hi\"}"]))).toBe(false);
      expect(process.exitCode).toBe(1);

      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("\"operatorDiscovery\": true");
      expect(output).toContain("write-file");
      expect(output).not.toContain("\"operatorCall\": true");
      expect(output).not.toContain("\"text\": \"hi\"");
      expect(errorSpy.mock.calls.flat().join("\n")).toContain("custom-echo MCP policy blocks agent tools/call");
      expect(methods).not.toContain("tools/call");
    } finally {
      if (originalSecret === undefined) {
        delete process.env.CUSTOM_ECHO_MCP_TOKEN;
      } else {
        process.env.CUSTOM_ECHO_MCP_TOKEN = originalSecret;
      }
    }
  });

  it("allows operator MCP calls only with local allowlist and explicit readOnly metadata", async () => {
    const originalSecret = process.env.CUSTOM_ECHO_MCP_TOKEN;
    process.env.CUSTOM_ECHO_MCP_TOKEN = "custom-secret";
    const methods: string[] = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        id?: string;
        method?: string;
        params?: { name?: string; arguments?: Record<string, unknown> };
      };
      if (body.method) {
        methods.push(body.method);
      }
      if (body.method === "initialize") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "custom-echo", version: "test" }
          }
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "Mcp-Session-Id": "session-operator-allowed"
          }
        });
      }
      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }
      if (body.method === "tools/list") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [
              { name: "echo", description: "Echo input", annotations: { readOnlyHint: true } },
              { name: "write-file", description: "Mutating example", annotations: { destructiveHint: true } }
            ]
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (body.method === "tools/call") {
        expect(body.params).toEqual({
          name: "echo",
          arguments: { text: "hi" }
        });
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            content: [{ type: "text", text: "hi" }],
            structuredContent: { text: "hi" },
            isError: false
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: { message: "unexpected request" } }), { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      addCustomProtocolMcpServer(root, {
        id: "custom-echo",
        name: "Custom Echo",
        url: "https://mcp.example.test/echo",
        authMode: "bearer",
        authEnvKey: "CUSTOM_ECHO_MCP_TOKEN",
        agentReadOnlyTools: ["echo"]
      }, process.env);

      expect(await runParsedCommand(root, parseCli(["mcp", "call", "custom-echo", "echo", "--read-only", "--args-json", "{\"text\":\"hi\"}"]))).toBe(true);

      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("\"operatorCall\": true");
      expect(output).toContain("\"text\": \"hi\"");
      expect(methods).toContain("tools/call");
    } finally {
      if (originalSecret === undefined) {
        delete process.env.CUSTOM_ECHO_MCP_TOKEN;
      } else {
        process.env.CUSTOM_ECHO_MCP_TOKEN = originalSecret;
      }
    }
  });

  it("requires explicit read-only intent for operator MCP tool calls", async () => {
    const originalSecret = process.env.CUSTOM_ECHO_MCP_TOKEN;
    process.env.CUSTOM_ECHO_MCP_TOKEN = "custom-secret";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      addCustomProtocolMcpServer(root, {
        id: "custom-echo",
        name: "Custom Echo",
        url: "https://mcp.example.test/echo",
        authMode: "bearer",
        authEnvKey: "CUSTOM_ECHO_MCP_TOKEN"
      }, process.env);

      const ok = await runParsedCommand(root, parseCli(["mcp", "call", "custom-echo", "echo", "--args-json", "{\"text\":\"hi\"}"]));

      expect(ok).toBe(false);
      expect(process.exitCode).toBe(1);
      expect(errorSpy.mock.calls.flat().join("\n")).toContain("/mcp call requires --read-only");
    } finally {
      if (originalSecret === undefined) {
        delete process.env.CUSTOM_ECHO_MCP_TOKEN;
      } else {
        process.env.CUSTOM_ECHO_MCP_TOKEN = originalSecret;
      }
    }
  });

  it("executes mutable operator MCP calls only with a running approval snapshot and bound readback", async () => {
    const methods: string[] = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { id?: string; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
      if (body.method) {
        methods.push(body.method);
      }
      if (body.method === "initialize") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "stitch", version: "test" }
          }
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "Mcp-Session-Id": "session-mutable-call"
          }
        });
      }
      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }
      if (body.method === "tools/list") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [{
              name: "create_project",
              description: "Create a project.",
              annotations: { destructiveHint: true },
              inputSchema: {
                type: "object",
                properties: { title: { type: "string" } }
              }
            }]
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (body.method === "tools/call") {
        expect(body.params).toEqual({
          name: "create_project",
          arguments: { title: "Mutable MCP" }
        });
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            content: [{ type: "text", text: "created project-123" }],
            structuredContent: { projectId: "project-123" },
            isError: false
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: { message: "unexpected request" } }), { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = { STITCH_API_KEY: "stitch-secret" } as NodeJS.ProcessEnv;
    const config = createHarnessConfig(env);
    const snapshot = await captureOperatorMcpToolCallSnapshot({
      projectRoot: root,
      config,
      env,
      serverId: "stitch",
      toolName: "create_project",
      arguments: { title: "Mutable MCP" }
    });
    const pending = recordRuntimeActionApproval(root, {
      sessionId: "session-action",
      command: "/mcp call stitch create_project --args-json '{\"title\":\"Mutable MCP\"}'",
      reason: "mutable MCP approval",
      approvedTargetId: "mcp:stitch.create_project",
      approvedParameters: {
        server: "stitch",
        tool: "create_project",
        argumentsJson: "{\"title\":\"Mutable MCP\"}",
        snapshotFingerprint: snapshot.fingerprint
      },
      approvedSnapshot: snapshot
    });
    const running = approveAndStartRuntimeAction(root, pending.id, "tester");

    const output = await callOperatorMcpTool({
      projectRoot: root,
      config,
      env: {
        ...env,
        RPH_ACTION_APPROVAL_ID: running.id,
        RPH_ACTION_APPROVAL_FINGERPRINT: running.fingerprint,
        RPH_ACTION_RUNNING_AT: running.runningAt
      } as NodeJS.ProcessEnv,
      serverId: "stitch",
      toolName: "create_project",
      arguments: { title: "Mutable MCP" },
      readOnly: false
    });
    const parsed = JSON.parse(output) as {
      readOnly?: boolean;
      approvedSnapshot?: { fingerprint?: string };
      readbackArtifactPath?: string;
    };
    expect(parsed.readOnly).toBe(false);
    expect(parsed.approvedSnapshot?.fingerprint).toBe(snapshot.fingerprint);
    expect(parsed.readbackArtifactPath).toBe(mcpToolCallReadbackFile(root, running.id));
    const proof = JSON.parse(fs.readFileSync(mcpToolCallReadbackFile(root, running.id), "utf8")) as {
      actionApprovalId?: string;
      approvedFingerprint?: string;
      approvedSnapshotFingerprint?: string;
      verified?: boolean;
    };
    expect(proof).toMatchObject({
      actionApprovalId: running.id,
      approvedFingerprint: running.fingerprint,
      approvedSnapshotFingerprint: snapshot.fingerprint,
      verified: true
    });
    expect(methods).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/list",
      "initialize",
      "notifications/initialized",
      "tools/list",
      "initialize",
      "notifications/initialized",
      "tools/call"
    ]);
  });

  it("blocks mutable operator MCP calls when approval snapshot metadata drifts", async () => {
    const toolsListSchemas = [{ type: "object" }, { type: "object", properties: { title: { type: "number" } } }];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { id?: string; method?: string };
      if (body.method === "initialize") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "stitch", version: "test" }
          }
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "Mcp-Session-Id": "session-mutable-drift"
          }
        });
      }
      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }
      if (body.method === "tools/list") {
        const inputSchema = toolsListSchemas.shift() ?? toolsListSchemas[0];
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [{
              name: "create_project",
              annotations: { destructiveHint: true },
              inputSchema
            }]
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (body.method === "tools/call") {
        throw new Error("tools/call must not run after approval snapshot drift");
      }
      return new Response(JSON.stringify({ error: { message: "unexpected request" } }), { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = { STITCH_API_KEY: "stitch-secret" } as NodeJS.ProcessEnv;
    const config = createHarnessConfig(env);
    const snapshot = await captureOperatorMcpToolCallSnapshot({
      projectRoot: root,
      config,
      env,
      serverId: "stitch",
      toolName: "create_project",
      arguments: { title: "Mutable MCP" }
    });
    const pending = recordRuntimeActionApproval(root, {
      sessionId: "session-action",
      command: "/mcp call stitch create_project --args-json '{\"title\":\"Mutable MCP\"}'",
      reason: "mutable MCP approval",
      approvedTargetId: "mcp:stitch.create_project",
      approvedParameters: { argumentsJson: "{\"title\":\"Mutable MCP\"}" },
      approvedSnapshot: snapshot
    });
    const running = approveAndStartRuntimeAction(root, pending.id, "tester");

    await expect(callOperatorMcpTool({
      projectRoot: root,
      config,
      env: {
        ...env,
        RPH_ACTION_APPROVAL_ID: running.id,
        RPH_ACTION_APPROVAL_FINGERPRINT: running.fingerprint,
        RPH_ACTION_RUNNING_AT: running.runningAt
      } as NodeJS.ProcessEnv,
      serverId: "stitch",
      toolName: "create_project",
      arguments: { title: "Mutable MCP" },
      readOnly: false
    })).rejects.toThrow("approved MCP tool-call snapshot drifted");
  });

  it("lists protocol MCP tools through the generic MCP fabric", async () => {
    const methods: string[] = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { id?: string; method?: string };
      if (body.method) {
        methods.push(body.method);
      }
      if (body.method === "initialize") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "stitch", version: "test" }
          }
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "Mcp-Session-Id": "session-tools-list"
          }
        });
      }
      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }
      if (body.method === "tools/list") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [{
              name: "echo",
              description: "Echo read-only text.",
              inputSchema: { type: "object" }
            }, {
              name: "create_project",
              description: "Create a project.",
              inputSchema: { type: "object" }
            }]
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: { message: "unexpected request" } }), { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = { STITCH_API_KEY: "stitch-secret" } as NodeJS.ProcessEnv;
    const config = createHarnessConfig(env);

    const output = await runAgentFabricTool({
      projectRoot: root,
      config,
      env,
      name: "mcp.tools.list",
      args: { server: "stitch" }
    });
    const parsed = JSON.parse(output ?? "{}") as {
      servers: Array<{
        server: string;
        kind: string;
        tools: Array<{ name: string }>;
        filteredOutToolCount?: number;
      }>;
    };

    expect(methods).toEqual(["initialize", "notifications/initialized", "tools/list"]);
    expect(parsed.servers[0]).toMatchObject({
      server: "stitch",
      kind: "mcp-streamable-http",
      tools: [expect.objectContaining({ name: "echo" })]
    });
    expect(parsed.servers[0].tools).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: "create_project" })]));
    expect(parsed.servers[0].filteredOutToolCount).toBe(1);
    expect(JSON.stringify(parsed)).not.toContain("stitch-secret");
  });

  it("lists tools from an explicit custom protocol MCP server through mcp.tools.list", async () => {
    const methods: string[] = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { id?: string; method?: string };
      if (body.method) {
        methods.push(body.method);
      }
      if (body.method === "initialize") {
        expect(init?.headers).toMatchObject({ Authorization: "Bearer custom-secret" });
        expect(init?.headers).not.toMatchObject({ "X-Goog-Api-Key": expect.any(String) });
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "custom-echo", version: "test" }
          }
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "Mcp-Session-Id": "session-custom-list"
          }
        });
      }
      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }
      if (body.method === "tools/list") {
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer custom-secret",
          "Mcp-Session-Id": "session-custom-list"
        });
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [{
              name: "custom.echo",
              description: "Echo from custom MCP.",
              inputSchema: { type: "object" }
            }]
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: { message: "unexpected request" } }), { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = { CUSTOM_ECHO_MCP_TOKEN: "custom-secret" } as NodeJS.ProcessEnv;
    const config = addCustomProtocolMcpServer(root, {
      id: "custom-echo",
      name: "Custom Echo",
      url: "https://mcp.example.test/echo",
      authMode: "bearer",
      authEnvKey: "CUSTOM_ECHO_MCP_TOKEN",
      agentReadOnlyTools: ["custom.echo"]
    }, env);

    const output = await runAgentFabricTool({
      projectRoot: root,
      config,
      env,
      name: "mcp.tools.list",
      args: { server: "custom-echo" }
    });
    const parsed = JSON.parse(output ?? "{}") as {
      servers: Array<{
        server: string;
        kind: string;
        tools: Array<{ name: string }>;
      }>;
    };

    expect(methods).toEqual(["initialize", "notifications/initialized", "tools/list"]);
    expect(parsed.servers[0]).toMatchObject({
      server: "custom-echo",
      kind: "mcp-streamable-http",
      tools: [expect.objectContaining({ name: "custom.echo" })]
    });
    expect(JSON.stringify(parsed)).not.toContain("custom-secret");
  });

  it("includes server and endpoint context when protocol MCP tools/list fails", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "bad credential" } }), {
        status: 401,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const env = { STITCH_API_KEY: "stitch-secret" } as NodeJS.ProcessEnv;
    const config = createHarnessConfig(env);

    await expect(runAgentFabricTool({
      projectRoot: root,
      config,
      env,
      name: "mcp.tools.list",
      args: { server: "stitch" }
    })).rejects.toThrow("stitch MCP tools/list failed at https://stitch.googleapis.com/mcp: MCP HTTP request failed (401)");
  });

  it("surfaces protocol JSON-RPC failures from canonical mcp.tools.call", async () => {
    const methods: string[] = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { id?: string; method?: string };
      if (body.method) {
        methods.push(body.method);
      }
      if (body.method === "initialize") {
        expect(init?.headers).toMatchObject({ "X-Goog-Api-Key": "stitch-secret" });
        expect(init?.headers).not.toMatchObject({ "Mcp-Session-Id": expect.any(String) });
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "stitch", version: "test" }
          }
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "Mcp-Session-Id": "session-call-failure"
          }
        });
      }
      if (body.method === "notifications/initialized") {
        expect(init?.headers).toMatchObject({ "Mcp-Session-Id": "session-call-failure" });
        return new Response(null, { status: 202 });
      }
      if (body.method === "tools/list") {
        expect(init?.headers).toMatchObject({
          "Mcp-Session-Id": "session-call-failure",
          "X-Goog-Api-Key": "stitch-secret"
        });
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [{ name: "echo", description: "Echo input", annotations: { readOnlyHint: true } }]
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (body.method === "tools/call") {
        expect(init?.headers).toMatchObject({
          "Mcp-Session-Id": "session-call-failure",
          "X-Goog-Api-Key": "stitch-secret"
        });
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          error: { code: -32602, message: "echo rejected" }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: { message: "unexpected request" } }), { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = { STITCH_API_KEY: "stitch-secret" } as NodeJS.ProcessEnv;
    const config = createHarnessConfig(env);

    await expect(runAgentFabricTool({
      projectRoot: root,
      config,
      env,
      name: "mcp.tools.call",
      args: {
        server: "stitch",
        toolName: "echo",
        readOnly: true,
        arguments: { text: "hello" }
      }
    })).rejects.toThrow("stitch MCP tools/call failed at https://stitch.googleapis.com/mcp: MCP tools/call failed: echo rejected");
    expect(methods).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/list",
      "initialize",
      "notifications/initialized",
      "tools/call"
    ]);
  });

  it("records command and handoff action proposals", async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount += 1;
      const text = callCount === 1
        ? [
            "제안:",
            JSON.stringify({
              action: {
                type: "command",
                command: "/status",
                safeToAutoRun: true,
                reason: "현재 상태 조회",
                message: "상태 확인 명령을 제안합니다."
              }
            })
          ].join("\n")
        : JSON.stringify({
            action: {
              type: "handoff",
              message: "PD에게 넘길 수 있습니다.",
              handoff: {
                toAgent: "PD",
                stage: "PD_REFERENCES",
                summary: "제품 정의 승인 후 디자인 레퍼런스 수집",
                artifactRefs: ["document:product-definition"],
                acceptanceCriteria: ["approved product-definition exists"],
                nextCommand: "/pd references --ai"
              }
            }
          });
      return new Response(JSON.stringify({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text
              }
            ]
          }
        ]
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const config = createHarnessConfig({ OPENAI_API_KEY: "openai-secret" } as NodeJS.ProcessEnv);

    const commandResult = await executeAgentTurn({
      projectRoot: root,
      sessionId: "session-command",
      userInput: "상태 확인 명령을 제안해줘",
      config,
      env: { OPENAI_API_KEY: "openai-secret" } as NodeJS.ProcessEnv
    });
    expect(commandResult.turn.proposedCommand?.command).toBe("/status");
    expect(commandResult.turn.proposedCommand?.safeToAutoRun).toBe(true);

    const handoffResult = await executeAgentTurn({
      projectRoot: root,
      sessionId: "session-handoff-action",
      userInput: "PD에게 넘겨줘",
      config,
      env: { OPENAI_API_KEY: "openai-secret" } as NodeJS.ProcessEnv
    });
    expect(handoffResult.turn.proposedHandoff?.toAgent).toBe("PD");
    expect(handoffResult.turn.proposedHandoff?.nextCommand).toBe("/pd references --ai");
  });

  it("records wait actions in the runtime manifest", async () => {
    const fetchMock = vi.fn(async () => {
      const text = JSON.stringify({
        action: {
          type: "wait",
          message: "승인 전에는 외부 쓰기를 실행하지 않겠습니다."
        }
      });
      return new Response(JSON.stringify({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text
              }
            ]
          }
        ]
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const config = createHarnessConfig({ OPENAI_API_KEY: "openai-secret" } as NodeJS.ProcessEnv);

    const result = await executeAgentTurn({
      projectRoot: root,
      sessionId: "session-wait",
      userInput: "승인 전에 배포해줘",
      config,
      env: { OPENAI_API_KEY: "openai-secret" } as NodeJS.ProcessEnv
    });

    expect(result.turn.status).toBe("waiting");
    const manifest = loadRuntimeSession(root);
    expect(manifest?.activeTurn?.status).toBe("waiting");
    expect(manifest?.waitCondition?.kind).toBe("user_approval");
    expect(manifest?.waitCondition?.message).toContain("승인 전");
  });

  it("fails closed and records the turn when malformed action JSON cannot be repaired", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: "{\"action\":"
              }
            ]
          }
        ]
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const config = createHarnessConfig({ OPENAI_API_KEY: "openai-secret" } as NodeJS.ProcessEnv);

    await expect(executeAgentTurn({
      projectRoot: root,
      sessionId: "session-malformed",
      userInput: "상태를 JSON으로 알려줘",
      config,
      env: { OPENAI_API_KEY: "openai-secret" } as NodeJS.ProcessEnv
    })).rejects.toThrow(/invalid agent action/);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const manifest = loadRuntimeSession(root);
    expect(manifest?.activeTurn?.status).toBe("failed");
    expect(manifest?.activeTurn?.error).toContain("invalid agent action");
  });

  it("uses a repaired action when malformed JSON can be fixed", async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount += 1;
      const text = callCount === 1
        ? "{\"action\":"
        : JSON.stringify({
            action: {
              type: "respond",
              message: "수정된 JSON 응답입니다."
            }
          });
      return new Response(JSON.stringify({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text
              }
            ]
          }
        ]
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const config = createHarnessConfig({ OPENAI_API_KEY: "openai-secret" } as NodeJS.ProcessEnv);

    const result = await executeAgentTurn({
      projectRoot: root,
      sessionId: "session-repaired",
      userInput: "상태를 JSON으로 알려줘",
      config,
      env: { OPENAI_API_KEY: "openai-secret" } as NodeJS.ProcessEnv
    });

    expect(result.text).toBe("수정된 JSON 응답입니다.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(loadRuntimeSession(root)?.activeTurn?.status).toBe("complete");
  });

  it("derives handoff packets and approval waits from runtime state", () => {
    saveRuntimeSession(root, createRuntimeSessionManifest(root, "session-handoff"));
    const pmState = transitionState(loadState(root), "PM_PRODUCT_DEFINITION_INTERVIEW", "pm start");
    saveState(root, pmState);

    const handoffManifest = loadRuntimeSession(root);
    expect(handoffManifest?.handoffPacket?.fromAgent).toBe("Orchestrator");
    expect(handoffManifest?.handoffPacket?.toAgent).toBe("PM");
    expect(handoffManifest?.handoffPacket?.resumeCursor).toBe("stage:PM_PRODUCT_DEFINITION_INTERVIEW");
    expect(handoffManifest?.handoffPacket?.nextCommand).toBe("/pm interview");
    const materialized = materializeRuntimeHandoffsFromSession(root, handoffManifest);
    expect(materialized).toHaveLength(1);
    expect(materialized[0]).toMatchObject({
      sessionId: "session-handoff",
      status: "pending",
      packet: expect.objectContaining({
        fromAgent: "Orchestrator",
        toAgent: "PM",
        stage: "PM_PRODUCT_DEFINITION_INTERVIEW",
        nextCommand: "/pm interview",
        resumeCursor: "stage:PM_PRODUCT_DEFINITION_INTERVIEW"
      })
    });
    expect(materializeRuntimeHandoffsFromSession(root, handoffManifest)).toEqual([]);
    expect(handoffManifest?.stageQueue?.[0].stage).toBe("PM_PRODUCT_DEFINITION_INTERVIEW");
    expect(handoffManifest?.stageQueue?.[0].id).toBe("stage:PM_PRODUCT_DEFINITION_INTERVIEW");
    expect(handoffManifest?.stageQueue?.[0].nextCommand).toBe("/pm interview");
    expect(handoffManifest?.stageQueue?.some((entry) => entry.stage === "PM_PRODUCT_DEFINITION_DRAFT")).toBe(true);

    const draft = createDocumentVersion(root, "product-definition", {
      changeSummary: "draft",
      body: "# Product Definition"
    });
    const reviewState = advanceAfterPmDraft(syncStateDocuments(pmState, draft), "product-definition");
    saveState(root, reviewState);
    const reviewManifest = loadRuntimeSession(root);
    expect(reviewManifest?.waitCondition?.kind).toBe("user_approval");
    expect(reviewManifest?.waitCondition?.message).toContain("product-definition");
  });

  it("allows lease takeover after expiry and mints a fresh handoff claim token", () => {
    const handoff = seedRuntimeHandoff(root);
    const workerId = "test-worker";
    const firstNow = new Date("2026-05-26T00:00:00.000Z");
    const beforeExpiry = new Date("2026-05-26T00:00:00.500Z");
    const afterExpiry = new Date("2026-05-26T00:00:02.000Z");

    const first = claimRuntimeHandoff(root, handoff.id, workerId, 1000, firstNow);
    expect(() => claimRuntimeHandoff(root, handoff.id, workerId, 1000, beforeExpiry)).toThrow(/not claimable/);
    const second = claimRuntimeHandoff(root, handoff.id, workerId, 1000, afterExpiry);

    expect(second.attempts).toBe(2);
    expect(second.workerSessionId).not.toBe(first.workerSessionId);
    expect(second.claimToken).toBeTruthy();
    expect(second.claimToken).not.toBe(first.claimToken);
    expect(second.laneRunId).toBeUndefined();
    expect(second.claimedAt).toBe(afterExpiry.toISOString());
    expect(second.heartbeatAt).toBe(afterExpiry.toISOString());
    expect(second.leaseExpiresAt).toBe(new Date(afterExpiry.getTime() + 1000).toISOString());
    expect(second.note).toBe(`claimed by ${workerId}`);
  });

  it("rejects stale heartbeat, failure, and completion from a superseded claim attempt", () => {
    const handoff = seedRuntimeHandoff(root);
    const workerId = "test-stale-worker";
    const first = claimRuntimeHandoff(root, handoff.id, workerId, 1000, new Date("2026-05-26T00:00:00.000Z"));
    const firstToken = runtimeHandoffExecutionToken(first);
    const firstLane = startAgentLaneRun(root, {
      sessionId: first.sessionId,
      handoffId: first.id,
      workerId,
      workerSessionId: first.workerSessionId,
      claimToken: firstToken.claimToken,
      attempt: first.attempts,
      packet: first.packet,
      command: first.packet.nextCommand ?? "",
      leaseExpiresAt: first.leaseExpiresAt
    });
    const firstWorkToken = { ...firstToken, laneRunId: firstLane.id };
    startRuntimeHandoffWork(root, handoff.id, firstWorkToken, firstLane.id, 1000, new Date("2026-05-26T00:00:00.100Z"));

    const second = claimRuntimeHandoff(root, handoff.id, workerId, 1000, new Date("2026-05-26T00:00:02.000Z"));
    expect(second.attempts).toBe(2);

    expect(() => heartbeatRuntimeHandoff(root, handoff.id, firstWorkToken, 1000)).toThrow(/worker session changed|attempt changed|claim token changed/);
    expect(() => failRuntimeHandoffAttempt(root, handoff.id, firstWorkToken, "stale failure")).toThrow(/worker session changed|attempt changed|claim token changed/);
    expect(() => completeRuntimeHandoffAttempt(root, handoff.id, firstWorkToken, "stale completion")).toThrow(/claimed|worker session changed|attempt changed|claim token changed/);
    const latest = loadRuntimeHandoffs(root).find((record) => record.id === handoff.id);
    expect(latest).toMatchObject({
      status: "claimed",
      attempts: 2,
      workerSessionId: second.workerSessionId,
      claimToken: second.claimToken
    });
    expect(latest?.laneRunId).toBeUndefined();
    expect(latest?.completedAt).toBeUndefined();
    expect(latest?.lastFailureReason).toBeUndefined();
  });

  it("rejects stale lane binding after re-claim and accepts only the current attempt lane", () => {
    const handoff = seedRuntimeHandoff(root);
    const workerId = "test-lane-binding";
    const first = claimRuntimeHandoff(root, handoff.id, workerId, 1000, new Date("2026-05-26T00:00:00.000Z"));
    const firstToken = runtimeHandoffExecutionToken(first);
    const firstLane = startAgentLaneRun(root, {
      sessionId: first.sessionId,
      handoffId: first.id,
      workerId,
      workerSessionId: first.workerSessionId,
      claimToken: firstToken.claimToken,
      attempt: first.attempts,
      packet: first.packet,
      command: first.packet.nextCommand ?? "",
      leaseExpiresAt: first.leaseExpiresAt
    });
    const firstWorkToken = { ...firstToken, laneRunId: firstLane.id };

    const second = claimRuntimeHandoff(root, handoff.id, workerId, 1000, new Date("2026-05-26T00:00:02.000Z"));
    expect(() => startRuntimeHandoffWork(root, handoff.id, firstWorkToken, firstLane.id)).toThrow(/worker session changed|attempt changed|claim token changed/);
    expect(loadRuntimeHandoffs(root).find((record) => record.id === handoff.id)?.laneRunId).toBeUndefined();

    const secondToken = runtimeHandoffExecutionToken(second);
    const secondLane = startAgentLaneRun(root, {
      sessionId: second.sessionId,
      handoffId: second.id,
      workerId,
      workerSessionId: second.workerSessionId,
      claimToken: secondToken.claimToken,
      attempt: second.attempts,
      packet: second.packet,
      command: second.packet.nextCommand ?? "",
      leaseExpiresAt: second.leaseExpiresAt
    });
    const secondWorkToken = { ...secondToken, laneRunId: secondLane.id };
    const running = startRuntimeHandoffWork(root, handoff.id, secondWorkToken, secondLane.id);

    expect(running.status).toBe("running");
    expect(running.laneRunId).toBe(secondLane.id);
    expect(running.workerSessionId).toBe(second.workerSessionId);
  });

  it("marks FE/BE specification branches as ready and sprint planning as fan-in blocked", () => {
    saveRuntimeSession(root, createRuntimeSessionManifest(root, "session-fanout"));
    const state = approvedPdState(root);
    saveState(root, state);

    const manifest = loadRuntimeSession(root);
    const queue = manifest?.stageQueue ?? [];
    const pd = queue.find((entry) => entry.stage === "PD_APPROVED");
    const fe = queue.find((entry) => entry.stage === "FE_SPEC");
    const be = queue.find((entry) => entry.stage === "BE_SPEC");
    const sprint = queue.find((entry) => entry.stage === "SPRINT_PLANNING");

    expect(pd).toMatchObject({ status: "active", nodeType: "fan-out" });
    expect(fe).toMatchObject({ status: "ready", nodeType: "fan-out", nextCommand: "/fe spec --ai" });
    expect(be).toMatchObject({ status: "ready", nodeType: "stage", nextCommand: "/be spec --ai" });
    expect(sprint).toMatchObject({ status: "blocked", nodeType: "fan-in" });
    expect(sprint?.joinCondition).toContain("PD_APPROVED + FE_SPEC + BE_SPEC");
    expect(sprint?.blockers).toEqual(expect.arrayContaining([
      "required document missing: fe-technical-spec",
      "required document missing: be-technical-spec",
      "required document missing: api-contract"
    ]));
  });

  it("keeps sprint planning fan-in waiting while one branch lane is still pending", () => {
    saveState(root, approvedPdState(root));
    const manifest = saveRuntimeSession(root, createRuntimeSessionManifest(root, "session-fanin-waiting"));
    materializeRuntimeHandoffsFromSession(root, manifest);

    completeMergedHandoffForStage(root, "FE_SPEC");
    const reconciled = reconcileRuntimeStageQueue(root);
    const fe = reconciled?.stageQueue?.find((entry) => entry.stage === "FE_SPEC");
    const be = reconciled?.stageQueue?.find((entry) => entry.stage === "BE_SPEC");
    const sprint = reconciled?.stageQueue?.find((entry) => entry.stage === "SPRINT_PLANNING");

    expect(fe).toMatchObject({ status: "completed" });
    expect(be).toMatchObject({ status: "pending" });
    expect(sprint).toMatchObject({ status: "blocked", nodeType: "fan-in" });
    expect(sprint?.fanIn?.reducerStatus).toBe("waiting");
    expect(sprint?.fanIn?.pendingPrerequisites).toEqual(["BE_SPEC"]);
    expect(sprint?.reason).toBe("fan-in reducer waiting for BE_SPEC");
  });

  it("keeps sprint planning fan-in blocked after both branch lanes merge without engineering artifacts", () => {
    saveState(root, approvedPdState(root));
    const manifest = saveRuntimeSession(root, createRuntimeSessionManifest(root, "session-fanin-blocked"));
    materializeRuntimeHandoffsFromSession(root, manifest);

    completeMergedHandoffForStage(root, "FE_SPEC");
    completeMergedHandoffForStage(root, "BE_SPEC");
    const reconciled = reconcileRuntimeStageQueue(root);
    const sprint = reconciled?.stageQueue?.find((entry) => entry.stage === "SPRINT_PLANNING");

    expect(reconciled?.stageQueue?.find((entry) => entry.stage === "FE_SPEC")?.status).toBe("completed");
    expect(reconciled?.stageQueue?.find((entry) => entry.stage === "BE_SPEC")?.status).toBe("completed");
    expect(sprint).toMatchObject({ status: "blocked", nodeType: "fan-in" });
    expect(sprint?.fanIn?.reducerStatus).toBe("blocked");
    expect(sprint?.fanIn?.pendingPrerequisites).toEqual([]);
    expect(sprint?.fanIn?.readyPrerequisites).toEqual(["PD_APPROVED", "FE_SPEC", "BE_SPEC"]);
    expect(sprint?.reason).toBe("fan-in reducer blocked by required artifacts or approvals");
    expect(sprint?.blockers).toEqual(expect.arrayContaining([
      "required document missing: fe-technical-spec",
      "required document missing: be-technical-spec",
      "required document missing: api-contract"
    ]));
  });

  it("materializes a ready sprint planning fan-in reducer as durable runtime handoff work", () => {
    saveState(root, approvedPdState(root));
    const manifest = saveRuntimeSession(root, createRuntimeSessionManifest(root, "session-fanin-ready"));
    materializeRuntimeHandoffsFromSession(root, manifest);
    completeMergedHandoffForStage(root, "FE_SPEC");
    completeMergedHandoffForStage(root, "BE_SPEC");
    approveSprintInputDocuments(root);

    const reconciled = reconcileRuntimeStageQueue(root);
    const sprint = reconciled?.stageQueue?.find((entry) => entry.stage === "SPRINT_PLANNING");
    expect(sprint).toMatchObject({ status: "ready", nodeType: "fan-in" });
    expect(sprint?.fanIn?.reducerStatus).toBe("ready");
    expect(sprint?.fanIn?.pendingPrerequisites).toEqual([]);
    expect(sprint?.fanIn?.readyPrerequisites).toEqual(["PD_APPROVED", "FE_SPEC", "BE_SPEC"]);
    expect(sprint?.blockers).toEqual([]);

    const created = materializeRuntimeHandoffsFromSession(root, reconciled);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      sessionId: "session-fanin-ready",
      status: "pending",
      packet: expect.objectContaining({
        toAgent: "Orchestrator",
        stage: "SPRINT_PLANNING",
        nextCommand: "/agent reduce SPRINT_PLANNING",
        resumeCursor: "fan-in:SPRINT_PLANNING",
        fanIn: expect.objectContaining({
          reducerStage: "SPRINT_PLANNING",
          sourceStages: ["PD_APPROVED", "FE_SPEC", "BE_SPEC"],
          sourceHandoffIds: expect.arrayContaining(loadRuntimeHandoffs(root)
            .filter((record) => record.packet.stage === "FE_SPEC" || record.packet.stage === "BE_SPEC")
            .map((record) => record.id))
        })
      })
    });
    expect(materializeRuntimeHandoffsFromSession(root, loadRuntimeSession(root))).toEqual([]);
  });

  it("ignores completed fan-in reducer handoffs from a stale source-lane epoch", () => {
    saveState(root, approvedPdState(root));
    const manifest = saveRuntimeSession(root, createRuntimeSessionManifest(root, "session-fanin-stale-epoch"));
    materializeRuntimeHandoffsFromSession(root, manifest);
    completeMergedHandoffForStage(root, "FE_SPEC");
    completeMergedHandoffForStage(root, "BE_SPEC");
    approveSprintInputDocuments(root);

    const reconciled = reconcileRuntimeStageQueue(root);
    const created = materializeRuntimeHandoffsFromSession(root, reconciled);
    expect(created).toHaveLength(1);
    const reducer = created[0];
    const currentKey = reducer.packet.fanIn?.materializationKey;
    expect(currentKey).toBeTruthy();
    const staleReducer = {
      ...reducer,
      packet: {
        ...reducer.packet,
        fanIn: {
          ...reducer.packet.fanIn!,
          sourceLaneRunIds: ["stale-lane-run"],
          materializationKey: "stale-fan-in-epoch"
        }
      }
    };
    fs.writeFileSync(runtimeHandoffsFile(root), `${JSON.stringify(loadRuntimeHandoffs(root).map((record) =>
      record.id === reducer.id ? staleReducer : record
    ), null, 2)}\n`);

    const workerId = "test-stale-fanin-reducer";
    const claimed = claimRuntimeHandoff(root, reducer.id, workerId);
    const claimToken = runtimeHandoffExecutionToken(claimed);
    const claimedReducer = loadRuntimeHandoffs(root).find((record) => record.id === reducer.id)!;
    const lane = startAgentLaneRun(root, {
      sessionId: claimedReducer.sessionId,
      handoffId: claimedReducer.id,
      workerId,
      workerSessionId: claimed.workerSessionId,
      claimToken: claimToken.claimToken,
      attempt: claimed.attempts,
      packet: claimedReducer.packet,
      command: claimedReducer.packet.nextCommand ?? "",
      leaseExpiresAt: claimed.leaseExpiresAt
    });
    const workToken = { ...claimToken, laneRunId: lane.id };
    startRuntimeHandoffWork(root, reducer.id, workToken, lane.id);
    completeAgentLaneRun(root, lane.id, { ok: true, executedCommand: claimedReducer.packet.nextCommand });
    completeRuntimeHandoffAttempt(root, reducer.id, workToken, "completed stale fan-in reducer");
    mergeAgentLaneRun(root, lane.id, "merged stale reducer lane proof");

    const afterStale = reconcileRuntimeStageQueue(root);
    const sprint = afterStale?.stageQueue?.find((entry) => entry.stage === "SPRINT_PLANNING");
    expect(sprint?.status).toBe("ready");
    expect(sprint?.fanIn?.reducerStatus).toBe("ready");
    expect(sprint?.fanIn?.materializationKey).toBe(currentKey);

    const fresh = materializeRuntimeHandoffsFromSession(root, afterStale);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].packet.fanIn?.materializationKey).toBe(currentKey);
    expect(fresh[0].id).not.toBe(reducer.id);
  });

  it("materializes ready fan-out stage queue entries as handoff mailbox work", () => {
    saveState(root, approvedPdState(root));
    const manifest = saveRuntimeSession(root, createRuntimeSessionManifest(root, "session-fanout-mailbox"));

    const created = materializeRuntimeHandoffsFromSession(root, manifest);

    expect(created).toHaveLength(2);
    expect(created.map((record) => record.packet.stage).sort()).toEqual(["BE_SPEC", "FE_SPEC"]);
    expect(created.map((record) => record.packet.nextCommand).sort()).toEqual(["/be spec --ai", "/fe spec --ai"]);
    expect(created.map((record) => record.packet.fromAgent)).toEqual(["PD", "PD"]);
    expect(created.map((record) => record.status)).toEqual(["pending", "pending"]);
    expect(loadRuntimeHandoffs(root).map((record) => record.packet.resumeCursor).sort()).toEqual(["stage-queue:BE_SPEC", "stage-queue:FE_SPEC"]);
    expect(materializeRuntimeHandoffsFromSession(root, manifest)).toEqual([]);
  });

  it("persists a first-class runtime execution graph snapshot with fan-out nodes and edges", () => {
    saveState(root, approvedPdState(root));
    const manifest = saveRuntimeSession(root, createRuntimeSessionManifest(root, "session-graph-fanout"));

    const graph = materializeRuntimeExecutionGraph(root, manifest);

    expect(graph).toBeTruthy();
    expect(fs.existsSync(runtimeExecutionGraphFile(root))).toBe(true);
    expect(loadRuntimeExecutionGraph(root)).toMatchObject({
      version: 1,
      graphId: "graph:session-graph-fanout",
      sessionId: "session-graph-fanout",
      source: "runtime-execution-graph",
      currentStage: "PD_APPROVED",
      summary: expect.objectContaining({
        activeNodeIds: ["stage:PD_APPROVED"],
        readyNodeIds: expect.arrayContaining(["stage:FE_SPEC", "stage:BE_SPEC"]),
        fanOutNodeIds: expect.arrayContaining(["stage:PD_APPROVED", "stage:FE_SPEC"]),
        fanInNodeIds: expect.arrayContaining(["stage:SPRINT_PLANNING"])
      })
    });
    expect(graph?.nodes.find((node) => node.id === "stage:FE_SPEC")).toMatchObject({
      status: "ready",
      nextCommand: "/fe spec --ai",
      ownerAgent: "FE"
    });
    expect(graph?.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: "stage:PD_APPROVED", to: "stage:FE_SPEC", kind: "workflow-next", status: "open" }),
      expect.objectContaining({ from: "stage:PD_APPROVED", to: "stage:BE_SPEC", kind: "workflow-next", status: "open" }),
      expect.objectContaining({
        from: "stage:FE_SPEC",
        to: "stage:SPRINT_PLANNING",
        kind: "workflow-next",
        status: "blocked",
        reason: expect.stringContaining("required document missing: fe-technical-spec")
      })
    ]));
  });

  it("refreshes the runtime execution graph after handoff and lane reconciliation", () => {
    saveState(root, approvedPdState(root));
    const manifest = saveRuntimeSession(root, createRuntimeSessionManifest(root, "session-graph-reconcile"));
    materializeRuntimeHandoffsFromSession(root, manifest);

    completeMergedHandoffForStage(root, "FE_SPEC");
    const reconciled = reconcileRuntimeStageQueue(root);
    const graph = loadRuntimeExecutionGraph(root);

    expect(reconciled?.stageQueue?.find((entry) => entry.stage === "FE_SPEC")?.status).toBe("completed");
    expect(graph?.summary.completedNodeIds).toContain("stage:FE_SPEC");
    expect(graph?.summary.pendingNodeIds).toContain("stage:BE_SPEC");
    expect(graph?.summary.handoffCount).toBe(2);
    expect(graph?.summary.laneRunCount).toBe(1);
    expect(graph?.nodes.find((node) => node.id === "stage:FE_SPEC")?.handoffIds).toHaveLength(1);
    expect(graph?.nodes.find((node) => node.id === "stage:FE_SPEC")?.laneRunIds).toHaveLength(1);
  });

  it("uses the persisted runtime execution graph as session hydration authority", () => {
    saveState(root, approvedPdState(root));
    const seeded = saveRuntimeSession(root, createRuntimeSessionManifest(root, "session-graph-authority"));
    const graph = loadRuntimeExecutionGraph(root);
    if (!graph) {
      throw new Error("expected runtime execution graph");
    }
    fs.writeFileSync(runtimeExecutionGraphFile(root), JSON.stringify({
      ...graph,
      currentStage: "BE_SPEC",
      updatedAt: "2026-01-01T00:00:00.000Z",
      nodes: graph.nodes.map((node) => {
        if (node.stage === "PD_APPROVED" || node.stage === "FE_SPEC") {
          return { ...node, status: "completed" };
        }
        if (node.stage === "BE_SPEC") {
          return { ...node, status: "active", blockers: [] };
        }
        return node.status === "active" ? { ...node, status: "ready" } : node;
      })
    }, null, 2));

    const loaded = loadRuntimeSession(root);

    expect(seeded.stage).toBe("PD_APPROVED");
    expect(loaded?.stage).toBe("BE_SPEC");
    expect(loaded?.stageQueue?.find((entry) => entry.stage === "PD_APPROVED")?.status).toBe("completed");
    expect(loaded?.stageQueue?.find((entry) => entry.stage === "FE_SPEC")?.status).toBe("completed");
    expect(loaded?.stageQueue?.find((entry) => entry.stage === "BE_SPEC")?.status).toBe("active");
  });

  it("recovers a minimal runtime session from the execution graph when session artifacts are missing", () => {
    saveState(root, approvedPdState(root));
    const seeded = saveRuntimeSession(root, createRuntimeSessionManifest(root, "session-graph-recovery"));
    const graph = loadRuntimeExecutionGraph(root);
    if (!graph) {
      throw new Error("expected runtime execution graph");
    }
    fs.writeFileSync(runtimeExecutionGraphFile(root), JSON.stringify({
      ...graph,
      currentStage: "BE_SPEC",
      updatedAt: "2026-01-01T00:00:00.000Z",
      nodes: graph.nodes.map((node) => {
        if (node.stage === "PD_APPROVED" || node.stage === "FE_SPEC") {
          return { ...node, status: "completed" };
        }
        if (node.stage === "BE_SPEC") {
          return { ...node, status: "active", blockers: [] };
        }
        return node.status === "active" ? { ...node, status: "ready" } : node;
      })
    }, null, 2));
    fs.rmSync(runtimeSessionFile(root), { force: true });
    fs.rmSync(runtimeSessionSnapshotFile(root, seeded.sessionId), { force: true });
    fs.rmSync(runtimeSessionJournalFile(root, seeded.sessionId), { force: true });

    const loaded = loadRuntimeSession(root);

    expect(loaded?.sessionId).toBe("session-graph-recovery");
    expect(loaded?.stage).toBe("BE_SPEC");
    expect(loaded?.checkpoint).toBe("recovered from runtime execution graph at BE_SPEC");
    expect(loaded?.stageQueue?.find((entry) => entry.stage === "PD_APPROVED")?.status).toBe("completed");
    expect(loaded?.stageQueue?.find((entry) => entry.stage === "FE_SPEC")?.status).toBe("completed");
    expect(loaded?.stageQueue?.find((entry) => entry.stage === "BE_SPEC")?.status).toBe("active");
  });

  it("does not materialize setup preview queue entries before PM start", () => {
    const manifest = saveRuntimeSession(root, createRuntimeSessionManifest(root, "session-setup-preview"));

    expect(manifest.stage).toBe("SETUP");
    expect(manifest.stageQueue?.some((entry) => entry.status === "ready")).toBe(true);
    expect(materializeRuntimeHandoffsFromSession(root, manifest)).toEqual([]);
    expect(loadRuntimeHandoffs(root)).toEqual([]);
  });

  it("preserves persisted stage queue lifecycle during runtime session hydration", () => {
    saveState(root, approvedPdState(root));
    const seeded = saveRuntimeSession(root, createRuntimeSessionManifest(root, "session-queue-ledger"));
    const canonicalQueue = (seeded.stageQueue ?? []).map((entry) => {
      if (entry.stage === "PD_APPROVED" || entry.stage === "FE_SPEC") {
        return { ...entry, status: "completed" as const };
      }
      if (entry.stage === "BE_SPEC") {
        return { ...entry, status: "active" as const };
      }
      return entry;
    });
    saveRuntimeSession(root, {
      ...seeded,
      stage: "PD_APPROVED",
      stageQueue: canonicalQueue
    });

    const loaded = loadRuntimeSession(root);
    expect(loaded?.stage).toBe("BE_SPEC");
    expect(loaded?.stageQueue?.find((entry) => entry.stage === "PD_APPROVED")?.status).toBe("completed");
    expect(loaded?.stageQueue?.find((entry) => entry.stage === "FE_SPEC")?.status).toBe("completed");
    expect(loaded?.stageQueue?.find((entry) => entry.stage === "BE_SPEC")?.status).toBe("active");
  });

  it("advances fan-out work from the persisted queue head instead of the graph first child", async () => {
    saveState(root, approvedPdState(root));
    const seeded = saveRuntimeSession(root, createRuntimeSessionManifest(root, "session-queue-head"));
    const canonicalQueue = (seeded.stageQueue ?? []).map((entry) => {
      if (entry.stage === "PD_APPROVED" || entry.stage === "FE_SPEC") {
        return { ...entry, status: "completed" as const };
      }
      if (entry.stage === "BE_SPEC") {
        return { ...entry, status: "active" as const };
      }
      return entry;
    });
    saveRuntimeSession(root, {
      ...seeded,
      stage: "PD_APPROVED",
      stageQueue: canonicalQueue
    });

    const ok = await runParsedCommand(root, parseCli(parseCommandLine("/next --execute")), false);

    expect(ok).toBe(true);
    expect(loadState(root).currentStage).toBe("BE_SPEC");
    const loaded = loadRuntimeSession(root);
    expect(loaded?.stageQueue?.find((entry) => entry.stage === "FE_SPEC")?.status).toBe("completed");
    expect(loaded?.stageQueue?.find((entry) => entry.stage === "BE_SPEC")?.status).toBe("active");
  });

  it("plans orchestration actions through the core policy engine", () => {
    expect(planOrchestrationAction({ initialized: false })).toMatchObject({
      source: "bootstrap",
      command: "/setup auto"
    });
    expect(planOrchestrationAction({
      initialized: true,
      paused: false,
      currentStage: "FE_SPEC",
      pendingHandoff: {
        id: "handoff-fe-1",
        stage: "FE_SPEC",
        nextCommand: "/fe spec"
      },
      recommendedCommand: "/status",
      hasReadyAiProvider: true
    })).toMatchObject({
      source: "handoff",
      command: "/fe spec --ai",
      handoffId: "handoff-fe-1"
    });
    expect(planOrchestrationAction({
      initialized: true,
      paused: false,
      currentStage: "PM_PRODUCT_DEFINITION_REVIEW",
      recommendedCommand: "/pm approve product-definition",
      hasReadyAiProvider: true
    })).toMatchObject({
      source: "stage-action",
      blocker: "user approval required: /pm approve product-definition"
    });
  });
});

describe("runtime planner and context bundle", () => {
  it("classifies runtime input deterministically", () => {
    expect(planAgentAction({ text: "/pm draft requirements --ai", initialized: true }).kind).toBe("slash-command");
    expect(planAgentAction({ text: "현재 상태 알려줘", initialized: true }).kind).toBe("chat");

    const workflowPlan = planAgentAction({ text: "FE 시작", initialized: true, hasConfiguredAi: true });
    expect(workflowPlan.kind).toBe("chat");
    expect(workflowPlan.command).toBeUndefined();
    expect(workflowPlan.workflowTarget).toBeUndefined();

    const productizePlan = planAgentAction({
      text: "이 아이디어를 MVP spec과 FE/BE 작업으로 만들어줘: AI 회의록 액션아이템 SaaS",
      initialized: true
    });
    expect(productizePlan.kind).toBe("start-workflow");
    expect(productizePlan.command).toBe('/productize "AI 회의록 액션아이템 SaaS"');

    expect(planAgentAction({ text: "핵심 사용자 누구야?", initialized: true }).kind).toBe("chat");
    expect(planAgentAction({ text: "   ", initialized: true }).kind).toBe("unknown");
  });

  it("assembles current and approved artifact bodies into the prompt bundle", () => {
    createDocumentVersion(root, "product-definition", {
      changeSummary: "approved seed",
      body: "# Approved Product Definition\n\napproved body"
    });
    approveDocument(root, "product-definition", "tester");
    createDocumentVersion(root, "product-definition", {
      changeSummary: "current draft",
      body: "# Current Product Definition\n\ncurrent body"
    });

    createDesignArtifactVersion(root, "references", {
      changeSummary: "approved references",
      body: "# Approved References\n\napproved references"
    });
    approveDesignArtifact(root, "references", "tester");
    createDesignArtifactVersion(root, "references", {
      changeSummary: "current references",
      body: "# Current References\n\ncurrent references"
    });

    const issue = createWorkIssue(root, { workstream: "FE", title: "Build shell" });
    const pr = createPullRequestDraft(root, issue.issueNumber);
    createQaReview(root, pr.prNumber);

    const bundle = assembleAgentContext(root);
    const productDefinition = bundle.documents.find((artifact) => artifact.id === "product-definition");
    const references = bundle.designArtifacts.find((artifact) => artifact.id === "references");

    expect(productDefinition?.currentVersion).toBe("v1.0.1");
    expect(productDefinition?.approvedVersion).toBe("v1.0.0");
    expect(productDefinition?.selectedBody).toContain("approved body");
    expect(productDefinition?.approvedBody).toContain("approved body");
    expect(references?.approvedVersion).toBe("v1.0.0");
    expect(bundle.qaReports).toHaveLength(1);
    expect(bundle.prompt).toContain("current body");
    expect(bundle.prompt).toContain("approved body");
    expect(bundle.prompt).toContain("current references");
    expect(bundle.prompt).toContain("PR #1");
    expect(bundle.prompt).toContain("Config summary:");
  });

  it("promotes latest live connection proofs into the agent context prompt", () => {
    const reportPath = writeConnectionReport(root, [passedStitchConnectionCheck("2026-05-26T00:00:00.000Z")]);
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as { provenance?: { configFingerprint?: string } };
    expect(report.provenance?.configFingerprint).toBe(connectionReportConfigFingerprint(readHarnessConfigSnapshot(root)));

    const bundle = assembleAgentContext(root);
    expect(bundle.connectionProofs).toEqual([
      expect.objectContaining({
        kind: "mcp",
        id: "stitch",
        status: "passed",
        trustCategory: "protocol-ready",
        provenStage: "protocol-tools-list",
        firstAction: "mcp.tools.list",
        policy: expect.objectContaining({
          kind: "read-only-allowlist",
          state: "proved-now",
          satisfied: true,
          agentReadOnlyTools: ["echo"]
        }),
        readTools: ["mcp.tools.list", "mcp.tools.call"]
      })
    ]);
    expect(bundle.prompt).toContain("Live connection proofs:");
    expect(bundle.prompt).toContain("mcp:stitch status=passed trust=protocol-ready:protocol-tools-list");
    expect(bundle.prompt).toContain("policy=read-only-allowlist:proved-now:satisfied");
    expect(bundle.prompt).toContain("first_action=mcp.tools.list");
    expect(bundle.prompt).toContain("read_tools=mcp.tools.list,mcp.tools.call");
  });

  it("suppresses stale live connection proofs from the agent context prompt", () => {
    const reportPath = writeConnectionReport(root, [passedStitchConnectionCheck()]);
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as {
      checkedAt?: string;
      provenance?: { generatedAt?: string };
    };
    report.checkedAt = "2026-05-22T00:00:00.000Z";
    if (report.provenance) {
      report.provenance.generatedAt = "2026-05-22T00:00:00.000Z";
    }
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    const bundle = assembleAgentContext(root);
    const liveProofSection = bundle.prompt.split("Recent proof ledger:")[0];

    expect(bundle.connectionProofs).toEqual([]);
    expect(bundle.prompt).toContain("Live connection proofs:\n- none");
    expect(liveProofSection).not.toContain("mcp:stitch status=passed");
    expect(bundle.recentProofs.some((proof) => proof.subject === "connection:mcp:stitch")).toBe(true);
  });

  it("suppresses config-mismatched live connection proofs from the agent context prompt", () => {
    const reportPath = writeConnectionReport(root, [passedStitchConnectionCheck()]);
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as {
      provenance?: { configFingerprint?: string };
    };
    expect(report.provenance?.configFingerprint).toBe(connectionReportConfigFingerprint(readHarnessConfigSnapshot(root)));
    if (report.provenance) {
      report.provenance.configFingerprint = "different-config";
    }
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    const bundle = assembleAgentContext(root);
    const liveProofSection = bundle.prompt.split("Recent proof ledger:")[0];

    expect(bundle.connectionProofs).toEqual([]);
    expect(bundle.prompt).toContain("Live connection proofs:\n- none");
    expect(liveProofSection).not.toContain("policy=read-only-allowlist:proved-now:satisfied");
    expect(liveProofSection).not.toContain("read_tools=mcp.tools.list,mcp.tools.call");
    expect(bundle.recentProofs.some((proof) => proof.subject === "connection:mcp:stitch")).toBe(true);
  });
});

describe("runtime session manifest", () => {
  it("creates, saves, loads, and updates the runtime session manifest", () => {
    const manifest = createRuntimeSessionManifest(root, "session-test", "2026-05-21T00:00:00.000Z", "FE 시작");
    expect(manifest.stage).toBe("SETUP");
    expect(manifest.ownerAgent).toBe("Orchestrator");
    expect(manifest.pendingAction?.kind).toBe("chat");

    saveRuntimeSession(root, manifest);
    const updated = updateRuntimeSession(root, "session-test", {
      pendingInput: "/status",
      checkpoint: "status checked",
      incrementRetryCount: true,
      note: "status refresh"
    });

    const loaded = loadRuntimeSession(root);
    expect(updated.pendingAction?.kind).toBe("slash-command");
    expect(updated.pendingAction?.command).toBe("/status");
    expect(updated.checkpoint).toBe("status checked");
    expect(updated.retryCount).toBe(1);
    expect(updated.history).toHaveLength(2);
    expect(loaded?.pendingAction?.command).toBe("/status");

    const completed = recordAgentTurnState(root, "session-test", {
      id: "turn-1",
      userInput: "현재 상태 알려줘",
      status: "complete",
      startedAt: "2026-05-21T00:01:00.000Z",
      updatedAt: "2026-05-21T00:01:01.000Z",
      toolCalls: [],
      finalResponse: "status complete"
    });

    const journal = loadRuntimeSessionJournal(root, "session-test");
    expect(fs.existsSync(runtimeSessionJournalFile(root, "session-test"))).toBe(true);
    expect(fs.existsSync(runtimeSessionSnapshotFile(root, "session-test"))).toBe(true);
    expect(journal.map((record) => record.sequence)).toEqual([1, 2, 3]);
    expect(journal[0]).toMatchObject({
      kind: "snapshot",
      status: "active",
      stage: "SETUP",
      historyLength: 1
    });
    expect(journal[2]).toMatchObject({
      activeTurnId: "turn-1",
      activeTurnStatus: "complete",
      historyLength: completed.history.length
    });

    const latest = latestRuntimeSessionJournalRecord(root, "session-test");
    expect(latest?.sequence).toBe(3);
    const replayed = replayRuntimeSession(root, "session-test");
    expect(replayed?.activeTurn?.id).toBe("turn-1");
    expect(replayed?.pendingAction?.command).toBe("/status");
    expect(replayed?.checkpoint).toBe("agent turn complete");
  });

  it("keeps earlier runtime journal snapshots immutable as later events append", () => {
    saveRuntimeSession(root, createRuntimeSessionManifest(root, "session-append-only", "2026-05-21T00:00:00.000Z"));
    const first = loadRuntimeSessionJournal(root, "session-append-only")[0];

    recordRuntimeSessionEvent(root, "session-append-only", {
      kind: "checkpoint",
      message: "first checkpoint",
      ok: true
    });
    updateRuntimeSession(root, "session-append-only", {
      status: "blocked",
      blocker: "needs review",
      note: "blocked for review"
    });

    const journal = loadRuntimeSessionJournal(root, "session-append-only");
    expect(journal).toHaveLength(3);
    expect(journal[0]).toMatchObject({
      sequence: first.sequence,
      at: first.at,
      status: first.status,
      historyLength: first.historyLength
    });
    expect(journal[0].manifest.history).toEqual(first.manifest.history);
    expect(journal[2]).toMatchObject({
      sequence: 3,
      status: "blocked",
      blocker: "needs review"
    });
    expect(replayRuntimeSession(root, "session-append-only")?.blocker).toBe("needs review");
  });

  it("recovers the runtime session from snapshot or journal when the current head is unreadable", () => {
    saveRuntimeSession(root, createRuntimeSessionManifest(root, "session-recoverable", "2026-05-21T00:00:00.000Z"));
    updateRuntimeSession(root, "session-recoverable", {
      pendingInput: "/status",
      checkpoint: "status checked",
      note: "status refresh"
    });
    fs.writeFileSync(runtimeSessionFile(root), "{not-json");

    const recovered = loadRuntimeSession(root);
    expect(recovered?.sessionId).toBe("session-recoverable");
    expect(recovered?.pendingAction?.command).toBe("/status");

    fs.writeFileSync(runtimeSessionSnapshotFile(root, "session-recoverable"), "{not-json");
    fs.appendFileSync(runtimeSessionJournalFile(root, "session-recoverable"), "{partial");
    const replayed = loadRuntimeSession(root);
    expect(replayed?.sessionId).toBe("session-recoverable");
    expect(replayed?.checkpoint).toBe("status checked");
    expect(replayRuntimeSession(root, "session-recoverable")?.pendingAction?.command).toBe("/status");
  });
});

describe("proof ledger", () => {
  it("prefers the latest failed connection proof over an older passed proof", () => {
    writeConnectionReport(root, [{
      kind: "ai",
      id: "openai",
      status: "passed",
      message: "credential: model catalog credential probe passed (200); generation: smoke passed",
      requiredEnv: ["OPENAI_API_KEY"],
      missingEnv: [],
      endpoint: "https://api.openai.com/v1/responses",
      identity: {
        type: "ai-provider",
        label: "openai gpt-5.4",
        targetId: "gpt-5.4",
        verifiedBy: "protocol-tool-call",
        source: "configuration"
      },
      firstActionProof: {
        action: "openai.generation_smoke",
        label: "generated smoke response with gpt-5.4",
        targetId: "gpt-5.4",
        verifiedBy: "protocol-tool-call",
        endpoint: "https://api.openai.com/v1/responses"
      },
      checkedAt: "2026-05-22T00:00:00.000Z",
      readiness: {
        mode: "protocol-ready",
        provenStage: "protocol-tool-call",
        stages: [
          { stage: "transport", status: "passed", message: "provider endpoint reachable", endpoint: "https://api.openai.com/v1/models" },
          { stage: "credential-probe", status: "passed", message: "model catalog credential probe passed (200)", endpoint: "https://api.openai.com/v1/models" },
          { stage: "protocol-tool-call", status: "passed", message: "generation smoke passed", endpoint: "https://api.openai.com/v1/responses" }
        ]
      }
    }]);
    writeConnectionReport(root, [{
      kind: "ai",
      id: "openai",
      status: "failed",
      message: "credential: request failed (401); generation: skipped",
      requiredEnv: ["OPENAI_API_KEY"],
      missingEnv: [],
      endpoint: "https://api.openai.com/v1/responses",
      checkedAt: "2026-05-22T00:00:01.000Z",
      readiness: {
        mode: "unverified",
        provenStage: "none",
        stages: [
          { stage: "transport", status: "passed", message: "provider endpoint reachable", endpoint: "https://api.openai.com/v1/models" },
          { stage: "credential-probe", status: "failed", message: "request failed (401)", endpoint: "https://api.openai.com/v1/models" },
          { stage: "protocol-tool-call", status: "skipped", message: "generation skipped after credential failure", endpoint: "https://api.openai.com/v1/responses" }
        ]
      }
    }]);

    const latest = readProofLedgerLatest(root);
    const openai = latest?.latestBySubject["connection:ai:openai"];

    expect(openai?.status).toBe("failed");
    expect(openai?.trust).toBe("unverified:none");
    expect(openai?.summary).toContain("credential: request failed (401); generation: skipped");
    expect(openai?.targetId).toBeUndefined();
    const context = assembleAgentContext(root);
    expect(context.prompt).toContain("connection:ai:openai");
    expect(context.prompt).toContain("credential: request failed (401); generation: skipped");
    expect(context.prompt).not.toContain("target_id=gpt-5.4");
  });

  it("records agent tool and lane lifecycle proofs in one stream", () => {
    const now = "2026-05-22T00:00:00.000Z";
    saveRuntimeSession(root, createRuntimeSessionManifest(root, "session-proof", now));

    recordAgentTurnState(root, "session-proof", {
      id: "turn-proof",
      userInput: "repo 상태 읽어줘",
      status: "complete",
      startedAt: now,
      updatedAt: now,
      providerId: "openai",
      model: "gpt-5.4",
      toolCalls: [{
        id: "tool-read-repo",
        name: "github.repo.read",
        args: {},
        status: "succeeded",
        observation: JSON.stringify({ owner: "king", repo: "real-product-harness", token: "secret-token" }),
        requestedAt: now,
        completedAt: "2026-05-22T00:00:01.000Z"
      }],
      finalResponse: "repo read complete"
    });

    const proofPacket: HandoffPacket = {
      fromAgent: "Orchestrator",
      toAgent: "FE",
      stage: "FE_SPEC",
      summary: "FE spec handoff",
      artifactRefs: ["document:fe-technical-spec"],
      acceptanceCriteria: ["FE spec ready"],
      blockers: [],
      nextCommand: "/fe spec --ai",
      createdAt: now
    };
    const handoff = recordRuntimeHandoff(root, "session-proof", proofPacket);
    const claimed = claimRuntimeHandoff(root, handoff.id, "test-proof-worker");
    const claimToken = runtimeHandoffExecutionToken(claimed);
    const lane = startAgentLaneRun(root, {
      sessionId: handoff.sessionId,
      handoffId: handoff.id,
      workerId: "test-proof-worker",
      workerSessionId: claimed.workerSessionId,
      claimToken: claimToken.claimToken,
      attempt: claimed.attempts,
      packet: proofPacket,
      command: "/fe spec --ai"
    });
    const workToken = { ...claimToken, laneRunId: lane.id };
    startRuntimeHandoffWork(root, handoff.id, workToken, lane.id);
    completeAgentLaneRun(root, lane.id, { ok: true, executedCommand: "/fe spec --ai" });
    completeRuntimeHandoffAttempt(root, handoff.id, workToken, "completed proof lane");
    const integration = integrateAgentLaneBatch(root, [lane.id], "integrated FE lane result");
    expect(integration.status).toBe("integrated");
    expect(integration.mergedRunIds).toEqual([lane.id]);

    const events = readProofLedgerEvents(root);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "agent.tool",
        status: "passed",
        subject: "agent-tool:github.repo.read"
      }),
      expect.objectContaining({
        kind: "lane.started",
        status: "started",
        ref: expect.objectContaining({ runId: lane.id, handoffId: handoff.id })
      }),
      expect.objectContaining({
        kind: "lane.completed",
        status: "completed",
        ref: expect.objectContaining({ runId: lane.id })
      }),
      expect.objectContaining({
        kind: "lane.merged",
        status: "merged",
        ref: expect.objectContaining({ runId: lane.id })
      }),
      expect.objectContaining({
        kind: "lane.batch-integrated",
        status: "merged",
        data: expect.objectContaining({ mergedRunIds: [lane.id] })
      })
    ]));
    const rawLedger = fs.readFileSync(path.join(root, ".rph", "proofs", "ledger.jsonl"), "utf8");
    expect(rawLedger).not.toContain("secret-token");
    const latest = JSON.parse(fs.readFileSync(path.join(root, ".rph", "proofs", "latest.json"), "utf8")) as {
      counts: { passed: number; started: number; completed: number; merged: number };
    };
    expect(latest.counts.passed).toBe(1);
    expect(latest.counts.started).toBe(1);
    expect(latest.counts.completed).toBe(1);
    expect(latest.counts.merged).toBe(2);
  });
});

describe("obsidian export", () => {
  it("creates vault structure and exports a document", () => {
    const vault = path.join(root, "vault-project");
    const files = createObsidianProject(vault);
    createDocumentVersion(root, "product-definition", { changeSummary: "initial" });
    const exported = exportDocumentToObsidian(root, vault, "product-definition");
    expect(files.length).toBeGreaterThan(0);
    expect(fs.existsSync(exported)).toBe(true);
    expect(exported).toContain(path.join("01_PM", "product-definition"));
  });

  it("exports PD artifacts to matching vault folders", () => {
    const vault = path.join(root, "vault-project");
    createObsidianProject(vault);
    createDesignArtifactVersion(root, "directions", { changeSummary: "initial" });
    const exported = exportDesignArtifactToObsidian(root, vault, "directions");
    expect(fs.existsSync(path.join(vault, "02_PD", "landing-preview"))).toBe(true);
    expect(fs.existsSync(exported)).toBe(true);
    expect(exported).toContain(path.join("02_PD", "directions", "directions.md"));
  });

  it("exports FE/BE documents to role-specific vault folders", () => {
    const vault = path.join(root, "vault-project");
    createObsidianProject(vault);
    createEngineeringDocumentVersion(root, "fe-technical-spec", { changeSummary: "initial" });
    createEngineeringDocumentVersion(root, "api-contract", { changeSummary: "initial" });
    const feExported = exportDocumentToObsidian(root, vault, "fe-technical-spec");
    const apiExported = exportDocumentToObsidian(root, vault, "api-contract");
    expect(feExported).toContain(path.join("03_FE", "technical-spec", "fe-technical-spec.md"));
    expect(apiExported).toContain(path.join("04_BE", "api-contract", "api-contract.md"));
  });
});

describe("notion integration plan", () => {
  it("normalizes Notion page URLs and compact IDs", () => {
    expect(normalizeNotionPageId("https://www.notion.so/workspace/Page-1234567890abcdef1234567890abcdef?pvs=4")).toBe(
      "12345678-90ab-cdef-1234-567890abcdef"
    );
    expect(normalizeNotionPageId("1234567890abcdef1234567890abcdef")).toBe("12345678-90ab-cdef-1234-567890abcdef");
  });

  it("writes a dry-run workspace plan and sync payload", () => {
    createDocumentVersion(root, "product-definition", { changeSummary: "initial" });
    const result = createNotionWorkspacePlan(root);
    expect(result.plan.hostedMcpUrl).toBe("https://mcp.notion.com/mcp");
    expect(result.plan.apiVersion).toBe("2026-03-11");
    expect(result.plan.databases).toHaveLength(14);
    expect(result.plan.mcpTools).toContain("notion-create-view");
    expect(fs.existsSync(path.join(root, ".rph", "notion", "workspace-plan.md"))).toBe(true);

    const payload = createNotionSyncPayload(root);
    expect(payload.counts.documents).toBe(1);
    expect(fs.existsSync(payload.filePath)).toBe(true);
  });

  it("can apply a live Notion workspace plan through the API without storing tokens", async () => {
    let databaseCounter = 0;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const endpoint = String(url);
      if (endpoint.endsWith("/v1/pages")) {
        return new Response(JSON.stringify({
          id: "dashboard-page-id",
          object: "page",
          url: "https://notion.so/dashboard"
        }), { status: 200 });
      }
      if (endpoint.endsWith("/v1/pages/dashboard-page-id")) {
        return new Response(JSON.stringify({
          id: "dashboard-page-id",
          object: "page",
          url: "https://notion.so/dashboard",
          archived: false
        }), { status: 200 });
      }
      if (endpoint.endsWith("/v1/databases") && init?.method === "POST") {
        databaseCounter += 1;
        return new Response(JSON.stringify({
          id: `database-${databaseCounter}`,
          object: "database",
          url: `https://notion.so/database-${databaseCounter}`
        }), { status: 200 });
      }
      const databaseMatch = endpoint.match(/\/v1\/databases\/(database-\d+)$/);
      if (databaseMatch) {
        return new Response(JSON.stringify({
          id: databaseMatch[1],
          object: "database",
          url: `https://notion.so/${databaseMatch[1]}`,
          archived: false
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "unexpected Notion request" }), { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await applyNotionWorkspacePlan(root, {
      env: {
        NOTION_TOKEN: "notion-secret",
        NOTION_PARENT_PAGE_ID: "1234567890abcdef1234567890abcdef"
      } as NodeJS.ProcessEnv
    });

    expect(result.workspace.dashboardPageId).toBe("dashboard-page-id");
    expect(result.workspace.dashboardReadback.id).toBe("dashboard-page-id");
    expect(result.workspace.dashboardReadback.object).toBe("page");
    expect(Object.keys(result.workspace.databaseIds)).toHaveLength(14);
    expect(Object.keys(result.workspace.databaseReadbacks)).toHaveLength(14);
    expect(result.workspace.databaseReadbacks.Documents?.object).toBe("database");
    expect(fs.existsSync(result.filePath)).toBe(true);
    expect(fs.readFileSync(result.filePath, "utf8")).not.toContain("notion-secret");
    expect(fetchMock).toHaveBeenCalledTimes(30);
  });

  it("retries transient Notion live setup failures", async () => {
    let databaseCounter = 0;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const endpoint = String(url);
      if (fetchMock.mock.calls.length === 1) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }
      if (endpoint.endsWith("/v1/pages")) {
        return new Response(JSON.stringify({
          id: "dashboard-page-id",
          object: "page",
          url: "https://notion.so/dashboard"
        }), { status: 200 });
      }
      if (endpoint.endsWith("/v1/pages/dashboard-page-id")) {
        return new Response(JSON.stringify({
          id: "dashboard-page-id",
          object: "page",
          url: "https://notion.so/dashboard",
          archived: false
        }), { status: 200 });
      }
      if (endpoint.endsWith("/v1/databases") && init?.method === "POST") {
        databaseCounter += 1;
        return new Response(JSON.stringify({
          id: `database-${databaseCounter}`,
          object: "database",
          url: `https://notion.so/database-${databaseCounter}`
        }), { status: 200 });
      }
      const databaseMatch = endpoint.match(/\/v1\/databases\/(database-\d+)$/);
      if (databaseMatch) {
        return new Response(JSON.stringify({
          id: databaseMatch[1],
          object: "database",
          url: `https://notion.so/${databaseMatch[1]}`,
          archived: false
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "unexpected Notion request" }), { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await applyNotionWorkspacePlan(root, {
      env: {
        NOTION_TOKEN: "notion-secret",
        NOTION_PARENT_PAGE_ID: "1234567890abcdef1234567890abcdef"
      } as NodeJS.ProcessEnv
    });

    expect(result.workspace.dashboardPageId).toBe("dashboard-page-id");
    expect(result.workspace.dashboardReadback.id).toBe("dashboard-page-id");
    expect(fetchMock).toHaveBeenCalledTimes(31);
  });

  it("retries malformed Notion JSON during live sync", async () => {
    const config = initializeHarnessConfig(root, {
      aiProvider: "later",
      deployment: "later",
      stack: "recommended",
      mcp: ["notion"]
    });
    expect(config.mcpServers.notion.enabled).toBe(false);
    fs.mkdirSync(path.join(root, ".rph", "notion"), { recursive: true });
    fs.writeFileSync(path.join(root, ".rph", "notion", "live-workspace.json"), JSON.stringify({
      dashboardPageId: "dashboard-page-id",
      databaseIds: {},
      databaseUrls: {},
      appliedAt: new Date().toISOString()
    }, null, 2));
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const endpoint = String(url);
      if (fetchMock.mock.calls.length === 1) {
        return new Response("{", { status: 200 });
      }
      if (endpoint.endsWith("/v1/pages/sync-page-id")) {
        return new Response(JSON.stringify({
          id: "sync-page-id",
          object: "page",
          url: "https://notion.so/sync-page",
          archived: false
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        id: "sync-page-id",
        object: "page",
        url: "https://notion.so/sync-page"
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncNotionPayloadLive(root, {
      env: {
        NOTION_TOKEN: "notion-secret",
        NOTION_PARENT_PAGE_ID: "1234567890abcdef1234567890abcdef"
      } as NodeJS.ProcessEnv
    });

    expect(result.synced).toBeGreaterThanOrEqual(0);
    expect(result.readback.id).toBe("sync-page-id");
    expect(fs.existsSync(path.join(root, ".rph", "notion", "live-sync-readback.json"))).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fs.readFileSync(result.filePath, "utf8")).not.toContain("notion-secret");
    expect(fs.readFileSync(path.join(root, ".rph", "notion", "live-sync-readback.json"), "utf8")).not.toContain("notion-secret");
  });
});
