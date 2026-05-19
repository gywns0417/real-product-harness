import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  approveDesignArtifact,
  approveDocument,
  advanceAfterPmApproval,
  advanceAfterPmDraft,
  advanceAfterPdApproval,
  canFinalizePm,
  canFinalizePd,
  createDevDeploymentPlan,
  createDesignArtifactVersion,
  createEngineeringDocumentVersion,
  createHotfixPlan,
  createPullRequestDraft,
  createQaReview,
  createReleasePlan,
  createWorkIssue,
  createGitHubRepo,
  createLandingPreviewHtml,
  createBranchName,
  createDocumentVersion,
  createNotionSyncPayload,
  createNotionWorkspacePlan,
  createObsidianProject,
  diffDocumentVersions,
  exportDocumentToObsidian,
  exportDesignArtifactToObsidian,
  initProject,
  loadEnvFile,
  loadState,
  markIssueInProgress,
  normalizeLabel,
  parseCli,
  readPullRequest,
  runQaTests,
  finalizeQaReport,
  prepareEngineeringDocumentState,
  preparePdArtifactState,
  preparePmDraftState,
  ProjectState,
  readDocumentIndex,
  readDesignArtifactIndex,
  setupGitHubLabels,
  showDocument,
  advanceAfterEngineeringApproval,
  syncStateDocuments,
  syncStateDesignArtifacts,
  transitionState,
  validateEnv,
  writeGitHubBranchPlan
} from "../packages/core/src";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "rph-test-"));
  initProject(root, { projectName: "Test Product" });
});

afterEach(() => {
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

  it("initializes setup choices for the project wizard", () => {
    const filePath = path.join(root, ".rph", "setup-choices.json");
    expect(fs.existsSync(filePath)).toBe(true);
    const choices = JSON.parse(fs.readFileSync(filePath, "utf8")) as { stack: string; mcp: string[] };
    expect(choices.stack).toBe("recommended");
    expect(choices.mcp).toContain("notion");
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
});
