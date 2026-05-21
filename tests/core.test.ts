import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import packageJson from "../package.json";
import { runParsedCommand } from "../apps/cli/src/index";
import {
  approveDesignArtifact,
  approveDocument,
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
  initializeHarnessConfig,
  createPullRequestDraft,
  createQaReview,
  createReleasePlan,
  createWorkIssue,
  createGitHubRepo,
  createLandingPreviewHtml,
  buildAiChatPrompt,
  assembleAgentContext,
  createBranchName,
  createAiChatTurnRecord,
  createDocumentVersion,
  createNotionSyncPayload,
  createNotionWorkspacePlan,
  createObsidianProject,
  diffDocumentVersions,
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
  planAgentAction,
  readPullRequest,
  runQaTests,
  finalizeQaReport,
  generateAiText,
  prepareEngineeringDocumentState,
  preparePdArtifactState,
  preparePmDraftState,
  ProjectState,
  readDocumentIndex,
  readDesignArtifactIndex,
  renderSetupGuide,
  setupGitHubLabels,
  showDocument,
  advanceAfterEngineeringApproval,
  syncStateDocuments,
  syncStateDesignArtifacts,
  syncNotionPayloadLive,
  testMcpConnection,
  transitionState,
  createRuntimeSessionManifest,
  saveRuntimeSession,
  upsertEnvFileValues,
  updateRuntimeSession,
  validateEnv,
  writeAiChatTurnRecord,
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  process.exitCode = originalExitCode;
  fs.rmSync(root, { recursive: true, force: true });
});

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

  it("records QA reports and release gates without merging", () => {
    const issue = createWorkIssue(root, { workstream: "BE", title: "Add health endpoint" });
    const pr = createPullRequestDraft(root, issue.issueNumber);
    const review = createQaReview(root, pr.prNumber);
    expect(review.userMergeDecisionRequired).toBe(true);
    expect(fs.existsSync(path.join(root, ".rph", "qa", "pr-1-report.md"))).toBe(true);

    const testReport = runQaTests(root, pr.prNumber);
    expect(testReport.testStatus).toBe("not-run");
    const finalReport = finalizeQaReport(root, pr.prNumber);
    expect(finalReport.status).toBe("blocked");

    const release = createReleasePlan(root, "v0.1.0");
    const hotfix = createHotfixPlan(root, "Patch auth regression");
    expect(release.userApproval).toBe("required");
    expect(hotfix.kind).toBe("hotfix");
    expect(fs.existsSync(release.filePath)).toBe(true);
    expect(fs.existsSync(hotfix.filePath)).toBe(true);
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

  it("maps help and version flags to first-class commands", () => {
    expect(parseCli(["--version"]).command).toBe("version");
    const helpParsed = parseCli(["--help", "setup"]);
    expect(helpParsed.command).toBe("help");
    expect(helpParsed.subcommand).toBe("setup");
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

  it("prints package version from version command", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const ok = await runParsedCommand(root, parseCli(["version"]));

    expect(ok).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(`real-product-harness ${packageJson.version}`);
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
      mcpServers: Record<string, { kind: string; url?: string }>;
    };
    expect(mcpConfig.mcpServers.notion.kind).toBe("mcp-server");
    expect(mcpConfig.mcpServers.github.kind).toBe("rest-adapter");
    expect(mcpConfig.mcpServers.stitch.url).toBe("https://stitch.googleapis.com/mcp");
  });

  it("marks REST adapter checks as credential probes, not full MCP protocol readiness", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const config = createHarnessConfig({
      GITHUB_TOKEN: "github-secret",
      GITHUB_OWNER: "king",
      GITHUB_REPO: "real-product-harness"
    } as NodeJS.ProcessEnv);
    const check = await testMcpConnection(config, "github", {
      GITHUB_TOKEN: "github-secret"
    } as NodeJS.ProcessEnv);

    expect(check.status).toBe("passed");
    expect(check.readiness?.provenStage).toBe("credential-probe");
    expect(check.readiness?.stages.find((stage) => stage.stage === "protocol-tools-list")?.status).toBe("not-applicable");
  });

  it("proves Stitch MCP-compatible tools/list readiness when the protocol check succeeds", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      result: {
        tools: []
      }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const config = createHarnessConfig({
      STITCH_API_KEY: "stitch-secret"
    } as NodeJS.ProcessEnv);
    const check = await testMcpConnection(config, "stitch", {
      STITCH_API_KEY: "stitch-secret"
    } as NodeJS.ProcessEnv);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(init.body as string) as { method: string };

    expect(check.status).toBe("passed");
    expect(check.readiness?.provenStage).toBe("protocol-tools-list");
    expect(body.method).toBe("tools/list");
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
    expect(guide).toContain("2. MCP 연결");
    expect(guide).toContain("/setup auto --live");
    expect(guide).toContain("OPENAI_API_KEY");
    expect(guide).toContain("real-mcp");
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
    expect(result.text).toContain("Generated body");
    expect(result.endpoint).toBe("https://api.openai.com/v1/responses");
    expect(JSON.stringify(result)).not.toContain("openai-secret");
    expect(fetchMock).toHaveBeenCalledWith("https://api.openai.com/v1/responses", expect.objectContaining({
      method: "POST"
    }));
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
});

describe("runtime planner and context bundle", () => {
  it("classifies runtime input deterministically", () => {
    expect(planAgentAction({ text: "/pm draft requirements --ai", initialized: true }).kind).toBe("slash-command");
    expect(planAgentAction({ text: "현재 상태 알려줘", initialized: true }).kind).toBe("status");

    const workflowPlan = planAgentAction({ text: "FE 시작", initialized: true, hasConfiguredAi: true });
    expect(workflowPlan.kind).toBe("start-workflow");
    expect(workflowPlan.command).toBe("/fe spec --ai");
    expect(workflowPlan.workflowTarget).toBe("fe");

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
});

describe("runtime session manifest", () => {
  it("creates, saves, loads, and updates the runtime session manifest", () => {
    const manifest = createRuntimeSessionManifest(root, "session-test", "2026-05-21T00:00:00.000Z", "FE 시작");
    expect(manifest.stage).toBe("SETUP");
    expect(manifest.ownerAgent).toBe("Orchestrator");
    expect(manifest.pendingAction?.kind).toBe("start-workflow");

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
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const endpoint = String(url);
      if (endpoint.endsWith("/v1/pages")) {
        return new Response(JSON.stringify({
          id: "dashboard-page-id",
          url: "https://notion.so/dashboard"
        }), { status: 200 });
      }
      databaseCounter += 1;
      return new Response(JSON.stringify({
        id: `database-${databaseCounter}`,
        url: `https://notion.so/database-${databaseCounter}`
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await applyNotionWorkspacePlan(root, {
      env: {
        NOTION_TOKEN: "notion-secret",
        NOTION_PARENT_PAGE_ID: "1234567890abcdef1234567890abcdef"
      } as NodeJS.ProcessEnv
    });

    expect(result.workspace.dashboardPageId).toBe("dashboard-page-id");
    expect(Object.keys(result.workspace.databaseIds)).toHaveLength(14);
    expect(fs.existsSync(result.filePath)).toBe(true);
    expect(fs.readFileSync(result.filePath, "utf8")).not.toContain("notion-secret");
    expect(fetchMock).toHaveBeenCalledTimes(15);
  });

  it("retries transient Notion live setup failures", async () => {
    let databaseCounter = 0;
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const endpoint = String(url);
      if (fetchMock.mock.calls.length === 1) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }
      if (endpoint.endsWith("/v1/pages")) {
        return new Response(JSON.stringify({
          id: "dashboard-page-id",
          url: "https://notion.so/dashboard"
        }), { status: 200 });
      }
      databaseCounter += 1;
      return new Response(JSON.stringify({
        id: `database-${databaseCounter}`,
        url: `https://notion.so/database-${databaseCounter}`
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await applyNotionWorkspacePlan(root, {
      env: {
        NOTION_TOKEN: "notion-secret",
        NOTION_PARENT_PAGE_ID: "1234567890abcdef1234567890abcdef"
      } as NodeJS.ProcessEnv
    });

    expect(result.workspace.dashboardPageId).toBe("dashboard-page-id");
    expect(fetchMock).toHaveBeenCalledTimes(16);
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
    const fetchMock = vi.fn(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return new Response("{", { status: 200 });
      }
      return new Response(JSON.stringify({
        id: "sync-page-id",
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
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fs.readFileSync(result.filePath, "utf8")).not.toContain("notion-secret");
  });
});
