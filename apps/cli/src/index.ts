#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { spawnSync } from "node:child_process";
import {
  advanceAfterPmApproval,
  advanceAfterPmDraft,
  advanceAfterPdApproval,
  approveDesignArtifact,
  approveDocument,
  approveEngineeringDocument,
  applyGitHubLabels,
  canFinalizePm,
  canFinalizePd,
  createDevDeploymentPlan,
  createDocumentVersion,
  createDesignArtifactVersion,
  createEngineeringDocumentVersion,
  createGitHubRepo,
  createInterviewSession,
  createLandingPreviewHtml,
  createNotionSyncPayload,
  createNotionWorkspacePlan,
  createObsidianProject,
  createHotfixPlan,
  createPullRequestDraft,
  createQaReview,
  createReleasePlan,
  createWorkIssue,
  checkQaConflicts,
  DESIGN_ARTIFACT_IDS,
  DESIGN_ARTIFACT_TITLES,
  diffDocumentVersions,
  DOCUMENT_IDS,
  DOCUMENT_TITLES,
  DesignArtifactId,
  DocumentId,
  exportDocumentToObsidian,
  exportDesignArtifactToObsidian,
  FE_SPEC_DOC,
  FE_SPRINT_PLAN_DOC,
  BE_SPEC_DOC,
  BE_SPRINT_PLAN_DOC,
  API_CONTRACT_DOC,
  GITHUB_ENV_KEYS,
  initProject,
  isDocumentId,
  listDocumentIndexes,
  listDesignArtifactIndexes,
  listPullRequests,
  listWorkIssues,
  loadEnvFile,
  loadProject,
  loadState,
  markIssueInProgress,
  nextStage,
  optionBool,
  optionString,
  parseCli,
  prepareEngineeringDocumentState,
  preparePdArtifactState,
  preparePmDraftState,
  ProjectState,
  readDocumentIndex,
  readDesignArtifactIndex,
  renderInterview,
  runQaTests,
  finalizeQaReport,
  requireInitialized,
  rollbackDocument,
  saveState,
  setupGitHubLabels,
  showDocument,
  showDesignArtifact,
  stripFrontmatter,
  syncStateDesignArtifacts,
  syncStateDocuments,
  transitionState,
  validateEnv,
  Workstream,
  WORKFLOW_STAGES,
  writeGitHubTemplates
} from "../../../packages/core/src";

async function main(): Promise<void> {
  const parsed = parseCli(process.argv.slice(2));
  const cwd = path.resolve(process.cwd());
  loadEnvFile(path.join(cwd, ".env"));
  try {
    switch (parsed.command) {
      case "init":
        await handleInit(cwd, parsed.options);
        break;
      case "status":
        handleStatus(cwd);
        break;
      case "next":
        handleNext(cwd);
        break;
      case "pause":
        handlePause(cwd, true);
        break;
      case "resume":
        handlePause(cwd, false);
        break;
      case "cancel":
        handleCancel(cwd);
        break;
      case "pm":
        handlePm(cwd, parsed.subcommand, parsed.args, parsed.options);
        break;
      case "pd":
        handlePd(cwd, parsed.subcommand, parsed.args, parsed.options);
        break;
      case "fe":
        handleFe(cwd, parsed.subcommand, parsed.args, parsed.options);
        break;
      case "be":
        handleBe(cwd, parsed.subcommand, parsed.args, parsed.options);
        break;
      case "qa":
        handleQa(cwd, parsed.subcommand, parsed.args, parsed.options);
        break;
      case "notion":
        handleNotion(cwd, parsed.subcommand);
        break;
      case "docs":
        handleDocs(cwd, parsed.subcommand, parsed.args, parsed.options);
        break;
      case "github":
        handleGitHub(cwd, parsed.subcommand, parsed.args, parsed.options);
        break;
      case "help":
      default:
        printHelp();
        break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[error] ${message}`);
    process.exitCode = 1;
  }
}

async function handleInit(projectRoot: string, options: Record<string, string | boolean>): Promise<void> {
  const dryRun = optionBool(options, "dry-run");
  const yes = optionBool(options, "yes");
  let projectName = optionString(options, "project-name") ?? path.basename(projectRoot);
  let obsidianPath = optionString(options, "obsidian-vault");

  if (!yes && process.stdin.isTTY) {
    const answers = await runInitialWizard(projectName, obsidianPath);
    projectName = answers.projectName;
    obsidianPath = answers.obsidianPath;
  }

  const result = initProject(projectRoot, {
    projectName,
    obsidianPath,
    dryRun,
    force: optionBool(options, "force")
  });

  if (obsidianPath && !dryRun) {
    const files = createObsidianProject(obsidianPath);
    console.log(`Obsidian 구조 생성: ${obsidianPath}`);
    console.log(`생성 파일: ${files.length}`);
  }
  console.log(dryRun ? "[dry-run] init 계획" : "RPH 프로젝트 초기화 완료");
  console.log(`프로젝트: ${result.project.name}`);
  console.log(`상태: ${result.state.currentStage}`);
  for (const file of result.files) {
    console.log(`- ${file}`);
  }
}

function handleStatus(projectRoot: string): void {
  requireInitialized(projectRoot);
  const project = loadProject(projectRoot);
  const state = loadState(projectRoot);
  const stage = WORKFLOW_STAGES[state.currentStage];
  console.log(`프로젝트: ${project.name}`);
  console.log(`현재 단계: ${stage.id} (${stage.name})`);
  console.log(`담당: ${stage.ownerAgent}`);
  console.log(`paused: ${state.paused}`);
  const next = nextStage(state);
  console.log(`다음 단계: ${next ?? "없음"}`);
  if (stage.requiredApprovals.length > 0) {
    const pending = stage.requiredApprovals.filter((docId) => state.documents[docId]?.status !== "approved");
    const fulfilled = stage.requiredApprovals.filter((docId) => state.documents[docId]?.status === "approved");
    if (pending.length > 0) {
      console.log(`승인 필요: ${pending.join(", ")}`);
    }
    if (fulfilled.length > 0) {
      console.log(`승인 완료: ${fulfilled.join(", ")}`);
    }
  }
  if (stage.requiredDesignApprovals.length > 0) {
    const pending = stage.requiredDesignApprovals.filter((artifactId) => state.designArtifacts?.[artifactId]?.status !== "approved");
    const fulfilled = stage.requiredDesignApprovals.filter((artifactId) => state.designArtifacts?.[artifactId]?.status === "approved");
    if (pending.length > 0) {
      console.log(`PD 승인 필요: ${pending.join(", ")}`);
    }
    if (fulfilled.length > 0) {
      console.log(`PD 승인 완료: ${fulfilled.join(", ")}`);
    }
  }
  const docs = listDocumentIndexes(projectRoot);
  console.log(`문서: ${docs.length}`);
  for (const doc of docs) {
    console.log(`- ${doc.docId} ${doc.currentVersion} ${doc.status}`);
  }
  const designArtifacts = Object.values(state.designArtifacts ?? {}).filter((artifact) => artifact?.currentVersion);
  console.log(`PD 산출물: ${designArtifacts.length}`);
  for (const artifact of designArtifacts) {
    if (artifact) {
      console.log(`- ${artifact.artifactId} ${artifact.currentVersion} ${artifact.status}`);
    }
  }
  const issues = listWorkIssues(projectRoot);
  console.log(`작업 issue: ${issues.length}`);
  for (const issue of issues.slice(0, 8)) {
    console.log(`- #${issue.issueNumber} ${issue.assigneeAgent} ${issue.label} ${issue.status} ${issue.branchName}`);
  }
  const prs = listPullRequests(projectRoot);
  console.log(`PR draft: ${prs.length}`);
  for (const pr of prs.slice(0, 8)) {
    console.log(`- PR #${pr.prNumber} issue #${pr.issueNumber} ${pr.sourceBranch} -> ${pr.targetBranch} qa=${pr.qaStatus}`);
  }
}

function handleNext(projectRoot: string): void {
  requireInitialized(projectRoot);
  const state = loadState(projectRoot);
  const next = nextStage(state);
  if (!next) {
    console.log("다음 단계 없음");
    return;
  }
  console.log(`다음 권장 단계: ${next}`);
  console.log(`명령어: ${recommendedCommand(state, next)}`);
}

function handlePause(projectRoot: string, paused: boolean): void {
  requireInitialized(projectRoot);
  const state = loadState(projectRoot);
  saveState(projectRoot, { ...state, paused });
  console.log(paused ? "워크플로우 일시정지" : "워크플로우 재개");
}

function handleCancel(projectRoot: string): void {
  requireInitialized(projectRoot);
  const state = loadState(projectRoot);
  saveState(projectRoot, { ...state, paused: true });
  console.log("현재 워크플로우 정지. 상태 파일은 보존됨.");
}

function handlePm(
  projectRoot: string,
  subcommand: string | undefined,
  args: string[],
  options: Record<string, string | boolean>
): void {
  requireInitialized(projectRoot);
  switch (subcommand) {
    case "start":
      pmStart(projectRoot);
      return;
    case "interview":
      pmInterview(projectRoot, args[0]);
      return;
    case "draft":
      pmDraft(projectRoot, args[0], options);
      return;
    case "revise":
      pmRevise(projectRoot, args[0], options);
      return;
    case "approve":
      pmApprove(projectRoot, args[0], optionString(options, "by") ?? "user");
      return;
    case "finalize":
      pmFinalize(projectRoot);
      return;
    default:
      console.log("PM 명령어: start | interview | draft <docId> | revise <docId> | approve <docId> | finalize");
  }
}

function pmStart(projectRoot: string): void {
  const state = loadState(projectRoot);
  const next = state.currentStage === "SETUP"
    ? transitionState(state, "PM_PRODUCT_DEFINITION_INTERVIEW", "PM workflow started")
    : state;
  saveState(projectRoot, next);
  console.log("PM 워크플로우 시작");
  console.log("다음: rph pm interview");
}

function pmInterview(projectRoot: string, docArg?: string): void {
  const docId = parseDocId(docArg ?? "product-definition");
  const session = createInterviewSession(projectRoot, docId);
  console.log(renderInterview(session));
}

function pmDraft(projectRoot: string, docArg: string | undefined, options: Record<string, string | boolean>): void {
  const docId = parseDocId(docArg ?? "product-definition");
  const body = bodyFromOptions(options);
  const prepared = preparePmDraftState(loadState(projectRoot), docId);
  const index = createDocumentVersion(projectRoot, docId, {
    changeSummary: optionString(options, "summary") ?? "Initial PM draft",
    body
  });
  const state = advanceAfterPmDraft(syncStateDocuments(prepared, index), docId);
  saveState(projectRoot, state);
  console.log(`문서 초안 생성: ${docId} ${index.currentVersion}`);
  console.log(`승인 전 다음 큰 단계 진행 금지: rph pm approve ${docId}`);
}

function pmRevise(projectRoot: string, docArg: string | undefined, options: Record<string, string | boolean>): void {
  const docId = parseDocId(docArg ?? "product-definition");
  const fromVersion = optionString(options, "from");
  const fileBody = bodyFromOptions(options);
  const body = fileBody ?? stripFrontmatter(showDocument(projectRoot, docId, fromVersion));
  const index = createDocumentVersion(projectRoot, docId, {
    changeSummary: optionString(options, "summary") ?? `Revision from ${fromVersion ?? "current"}`,
    status: "revised",
    body
  });
  const state = syncStateDocuments(loadState(projectRoot), index);
  saveState(projectRoot, state);
  console.log(`문서 수정본 생성: ${docId} ${index.currentVersion}`);
  console.log(`검토 후 승인: rph pm approve ${docId}`);
}

function pmApprove(projectRoot: string, docArg?: string, approvedBy = "user"): void {
  const docId = parseDocId(docArg ?? "product-definition");
  const approval = approveDocument(projectRoot, docId, approvedBy);
  let state = loadState(projectRoot);
  state = syncStateDocuments(state, readDocumentIndex(projectRoot, docId));
  state = advanceAfterPmApproval(state, docId);
  saveState(projectRoot, state);
  console.log(`[승인 완료] ${approval.docId} ${approval.version}`);
  console.log(`승인자: ${approval.approvedBy}`);
}

function pmFinalize(projectRoot: string): void {
  const state = loadState(projectRoot);
  const check = canFinalizePm(state);
  if (!check.ok) {
    throw new Error(`PM finalize blocked. missing approvals: ${check.missing.join(", ")}`);
  }
  const next = state.currentStage === "PM_FEATURE_DEFINITION_APPROVED"
    ? transitionState(state, "PM_APPROVED", "all PM documents approved")
    : state;
  saveState(projectRoot, next);
  console.log("PM 산출물 최종 확정 완료");
  console.log("다음: rph status");
}

function handleDocs(
  projectRoot: string,
  subcommand: string | undefined,
  args: string[],
  options: Record<string, string | boolean>
): void {
  requireInitialized(projectRoot);
  switch (subcommand) {
    case "list":
      for (const docId of DOCUMENT_IDS) {
        const index = readDocumentIndex(projectRoot, docId);
        console.log(`${docId}: ${index.currentVersion ?? "-"} ${index.status}`);
      }
      return;
    case "show": {
      const docId = parseDocId(args[0]);
      console.log(showDocument(projectRoot, docId, args[1]));
      return;
    }
    case "diff": {
      const docId = parseDocId(args[0]);
      if (!args[1] || !args[2]) {
        throw new Error("usage: rph docs diff <docId> <fromVersion> <toVersion>");
      }
      console.log(diffDocumentVersions(projectRoot, docId, args[1], args[2]));
      return;
    }
    case "rollback": {
      const docId = parseDocId(args[0]);
      const toVersion = optionString(options, "to");
      if (!toVersion) {
        throw new Error("usage: rph docs rollback <docId> --to <version>");
      }
      const index = rollbackDocument(projectRoot, docId, toVersion);
      const state = syncStateDocuments(loadState(projectRoot), index);
      saveState(projectRoot, state);
      console.log(`롤백 버전 생성: ${docId} ${index.currentVersion}`);
      return;
    }
    case "export": {
      if (args[0] !== "obsidian") {
        throw new Error("usage: rph docs export obsidian <docId> --path <vaultProjectPath>");
      }
      const target = optionString(options, "path");
      if (!target) {
        throw new Error("Obsidian target missing: --path <vaultProjectPath>");
      }
      if (args[1] === "all") {
        const files = listDocumentIndexes(projectRoot).map((index) => exportDocumentToObsidian(projectRoot, target, index.docId));
        console.log(`Obsidian export 완료: ${files.length} files`);
        files.forEach((file) => console.log(`- ${file}`));
      } else {
        const docId = parseDocId(args[1]);
        const filePath = exportDocumentToObsidian(projectRoot, target, docId);
        console.log(`Obsidian export 완료: ${filePath}`);
      }
      return;
    }
    default:
      console.log("Docs 명령어: list | show <docId> | diff <docId> <from> <to> | rollback <docId> --to <version> | export obsidian <docId> --path <path>");
  }
}

function handlePd(
  projectRoot: string,
  subcommand: string | undefined,
  args: string[],
  options: Record<string, string | boolean>
): void {
  requireInitialized(projectRoot);
  switch (subcommand) {
    case "start":
      pdStart(projectRoot);
      return;
    case "references":
      pdCreateArtifact(projectRoot, "references", options);
      return;
    case "directions":
    case "moodboards":
      pdCreateArtifact(projectRoot, "directions", options);
      return;
    case "landing-preview":
      pdCreateArtifact(projectRoot, "landing-preview", options);
      return;
    case "design-system":
      pdCreateArtifact(projectRoot, "design-system", options);
      return;
    case "pages":
      pdCreateArtifact(projectRoot, "page-designs", options);
      return;
    case "show":
      pdShow(projectRoot, args[0], args[1]);
      return;
    case "revise":
      pdRevise(projectRoot, args[0], options);
      return;
    case "approve":
      pdApprove(projectRoot, args[0], optionString(options, "by") ?? "user");
      return;
    case "finalize":
      pdFinalize(projectRoot);
      return;
    case "export":
      pdExport(projectRoot, args, options);
      return;
    default:
      console.log("PD 명령어: start | references | directions | landing-preview | design-system | pages | show <artifactId> | revise <artifactId> | approve <artifactId> | finalize");
  }
}

function pdExport(projectRoot: string, args: string[], options: Record<string, string | boolean>): void {
  if (args[0] !== "obsidian") {
    throw new Error("usage: rph pd export obsidian <artifactId|all> --path <vaultProjectPath>");
  }
  const target = optionString(options, "path");
  if (!target) {
    throw new Error("Obsidian target missing: --path <vaultProjectPath>");
  }
  if (args[1] === "all") {
    const files = listDesignArtifactIndexes(projectRoot).map((index) =>
      exportDesignArtifactToObsidian(projectRoot, target, index.artifactId)
    );
    console.log(`PD Obsidian export 완료: ${files.length} files`);
    files.forEach((file) => console.log(`- ${file}`));
    return;
  }
  const artifactId = parseDesignArtifactId(args[1]);
  const filePath = exportDesignArtifactToObsidian(projectRoot, target, artifactId);
  console.log(`PD Obsidian export 완료: ${filePath}`);
}

function pdStart(projectRoot: string): void {
  const state = loadState(projectRoot);
  if (state.currentStage !== "PM_APPROVED" && state.currentStage !== "PD_REFERENCES") {
    throw new Error(`PD start blocked. current stage must be PM_APPROVED. current: ${state.currentStage}`);
  }
  const next = state.currentStage === "PM_APPROVED"
    ? transitionState(state, "PD_REFERENCES", "PD workflow started")
    : state;
  saveState(projectRoot, next);
  console.log("PD 워크플로우 시작");
  console.log("다음: rph pd references");
}

function pdCreateArtifact(
  projectRoot: string,
  artifactId: (typeof DESIGN_ARTIFACT_IDS)[number],
  options: Record<string, string | boolean>
): void {
  const body = bodyFromOptions(options);
  const prepared = preparePdArtifactState(loadState(projectRoot), artifactId);
  const index = createDesignArtifactVersion(projectRoot, artifactId, {
    changeSummary: optionString(options, "summary") ?? "Initial PD draft",
    body
  });
  const state = syncStateDesignArtifacts(prepared, index);
  saveState(projectRoot, state);
  console.log(`PD 산출물 생성: ${artifactId} ${index.currentVersion}`);
  if (artifactId === "landing-preview") {
    console.log(`HTML fallback preview: ${createLandingPreviewHtml(projectRoot)}`);
  }
  console.log(`승인 전 다음 큰 단계 진행 금지: rph pd approve ${artifactId}`);
}

function pdShow(projectRoot: string, artifactArg?: string, version?: string): void {
  const artifactId = parseDesignArtifactId(artifactArg);
  console.log(showDesignArtifact(projectRoot, artifactId, version));
}

function pdRevise(projectRoot: string, artifactArg: string | undefined, options: Record<string, string | boolean>): void {
  const artifactId = parseDesignArtifactId(artifactArg);
  const fromVersion = optionString(options, "from");
  const fileBody = bodyFromOptions(options);
  const body = fileBody ?? stripFrontmatter(showDesignArtifact(projectRoot, artifactId, fromVersion));
  const index = createDesignArtifactVersion(projectRoot, artifactId, {
    changeSummary: optionString(options, "summary") ?? `Revision from ${fromVersion ?? "current"}`,
    status: "revised",
    body
  });
  const state = syncStateDesignArtifacts(loadState(projectRoot), index);
  saveState(projectRoot, state);
  console.log(`PD 산출물 수정본 생성: ${artifactId} ${index.currentVersion}`);
}

function pdApprove(projectRoot: string, artifactArg: string | undefined, approvedBy = "user"): void {
  const artifactId = parseDesignArtifactId(artifactArg);
  const approval = approveDesignArtifact(projectRoot, artifactId, approvedBy);
  let state = syncStateDesignArtifacts(loadState(projectRoot), readDesignArtifactIndex(projectRoot, artifactId));
  state = advanceAfterPdApproval(state, artifactId);
  saveState(projectRoot, state);
  console.log(`[승인 완료] ${approval.artifactId} ${approval.version}`);
  console.log(`승인자: ${approval.approvedBy}`);
}

function pdFinalize(projectRoot: string): void {
  const state = loadState(projectRoot);
  const check = canFinalizePd(state);
  if (!check.ok) {
    throw new Error(`PD finalize blocked. missing approvals: ${check.missing.join(", ")}`);
  }
  const next = state.currentStage === "PD_REVIEW"
    ? transitionState(state, "PD_APPROVED", "all PD artifacts approved")
    : state;
  saveState(projectRoot, next);
  console.log("PD 산출물 최종 확정 완료");
  console.log("다음: FE/BE spec");
}

function handleFe(
  projectRoot: string,
  subcommand: string | undefined,
  args: string[],
  options: Record<string, string | boolean>
): void {
  requireInitialized(projectRoot);
  switch (subcommand) {
    case "spec":
      engineeringDraft(projectRoot, FE_SPEC_DOC, options);
      return;
    case "sprint-plan":
      engineeringDraft(projectRoot, FE_SPRINT_PLAN_DOC, options);
      return;
    case "approve":
      engineeringApprove(projectRoot, parseFeTarget(args[0]), optionString(options, "by") ?? "user");
      return;
    case "issue-create":
      workIssueCreate(projectRoot, "FE", args, options);
      return;
    case "work":
      workIssueStart(projectRoot, options);
      return;
    case "pr":
      workPrDraft(projectRoot, options);
      return;
    default:
      console.log("FE 명령어: spec | sprint-plan | approve <spec|sprint-plan> | issue-create | work --issue <n> | pr --issue <n>");
  }
}

function handleBe(
  projectRoot: string,
  subcommand: string | undefined,
  args: string[],
  options: Record<string, string | boolean>
): void {
  requireInitialized(projectRoot);
  switch (subcommand) {
    case "spec":
      engineeringDraft(projectRoot, BE_SPEC_DOC, options);
      return;
    case "api-contract":
      engineeringDraft(projectRoot, API_CONTRACT_DOC, options);
      return;
    case "sprint-plan":
      engineeringDraft(projectRoot, BE_SPRINT_PLAN_DOC, options);
      return;
    case "approve":
      engineeringApprove(projectRoot, parseBeTarget(args[0]), optionString(options, "by") ?? "user");
      return;
    case "issue-create":
      workIssueCreate(projectRoot, "BE", args, options);
      return;
    case "work":
      workIssueStart(projectRoot, options);
      return;
    case "deploy-dev":
      beDeployDev(projectRoot, options);
      return;
    case "pr":
      workPrDraft(projectRoot, options);
      return;
    default:
      console.log("BE 명령어: spec | api-contract | sprint-plan | approve <spec|api-contract|sprint-plan> | issue-create | work --issue <n> | deploy-dev | pr --issue <n>");
  }
}

function handleQa(
  projectRoot: string,
  subcommand: string | undefined,
  _args: string[],
  options: Record<string, string | boolean>
): void {
  requireInitialized(projectRoot);
  switch (subcommand) {
    case "review": {
      const report = createQaReview(projectRoot, parseIssueNumber(optionString(options, "pr")));
      console.log(`QA review 기록: PR #${report.prNumber}`);
      console.log(`report: ${report.reportPath}`);
      return;
    }
    case "conflicts": {
      const report = checkQaConflicts(projectRoot, parseIssueNumber(optionString(options, "pr")));
      console.log(`conflict status: ${report.conflictStatus}`);
      console.log(`report: ${report.reportPath}`);
      return;
    }
    case "test": {
      const report = runQaTests(projectRoot, parseIssueNumber(optionString(options, "pr")));
      console.log(`test status: ${report.testStatus}`);
      console.log(`report: ${report.reportPath}`);
      return;
    }
    case "report": {
      const report = finalizeQaReport(projectRoot, parseIssueNumber(optionString(options, "pr")));
      console.log(`QA report finalized: PR #${report.prNumber}`);
      console.log(`status: ${report.status}`);
      console.log(`사용자 merge 승인 필요: ${report.userMergeDecisionRequired}`);
      return;
    }
    default:
      console.log("QA 명령어: review --pr <n> | conflicts --pr <n> | test --pr <n> | report --pr <n>");
  }
}

function handleNotion(projectRoot: string, subcommand: string | undefined): void {
  requireInitialized(projectRoot);
  switch (subcommand) {
    case "plan":
    case "setup": {
      const result = createNotionWorkspacePlan(projectRoot);
      console.log(`Notion workspace plan 생성: ${result.files.length} files`);
      result.files.forEach((file) => console.log(`- ${file}`));
      console.log(`mode: ${result.plan.executionMode}`);
      console.log("Notion MCP/API 쓰기는 사용자 승인 전 실행하지 않음");
      return;
    }
    case "sync":
    case "export-docs": {
      const result = createNotionSyncPayload(projectRoot);
      console.log(`Notion sync payload 생성: ${result.filePath}`);
      console.log(`documents: ${result.counts.documents}`);
      console.log(`designArtifacts: ${result.counts.designArtifacts}`);
      console.log(`issues: ${result.counts.issues}`);
      console.log(`pullRequests: ${result.counts.pullRequests}`);
      console.log("Notion 반영은 dry-run payload만 생성");
      return;
    }
    default:
      console.log("Notion 명령어: plan | setup | sync | export-docs");
  }
}

function engineeringDraft(
  projectRoot: string,
  docId: DocumentId,
  options: Record<string, string | boolean>
): void {
  const body = bodyFromOptions(options);
  const prepared = prepareEngineeringDocumentState(loadState(projectRoot), docId);
  const index = createEngineeringDocumentVersion(projectRoot, docId, {
    changeSummary: optionString(options, "summary") ?? "Initial engineering draft",
    body
  });
  const state = syncStateDocuments(prepared, index);
  saveState(projectRoot, state);
  console.log(`엔지니어링 문서 생성: ${docId} ${index.currentVersion}`);
  console.log(`승인 전 다음 큰 단계 진행 금지: ${approvalCommandForEngineeringDoc(docId)}`);
}

function engineeringApprove(projectRoot: string, docId: DocumentId, approvedBy = "user"): void {
  const state = approveEngineeringDocument(projectRoot, docId, approvedBy);
  saveState(projectRoot, state);
  const index = readDocumentIndex(projectRoot, docId);
  console.log(`[승인 완료] ${docId} ${index.currentVersion}`);
  console.log(`승인자: ${approvedBy}`);
}

function workIssueCreate(
  projectRoot: string,
  workstream: Workstream,
  args: string[],
  options: Record<string, string | boolean>
): void {
  requireImplementationStage(projectRoot);
  const title = optionString(options, "title") ?? (args.join(" ") || `${workstream} implementation task`);
  const issue = createWorkIssue(projectRoot, {
    workstream,
    label: optionString(options, "label") ?? "feat",
    title,
    description: optionString(options, "description"),
    acceptanceCriteria: splitListOption(optionString(options, "acceptance")),
    testRequirement: optionString(options, "test")
  });
  console.log(`로컬 issue 생성: #${issue.issueNumber} ${issue.title}`);
  console.log(`브랜치: ${issue.branchName}`);
  console.log(`GitHub dry-run: gh issue create --title "${issue.title}" --label ${issue.label}`);
}

function workIssueStart(projectRoot: string, options: Record<string, string | boolean>): void {
  requireImplementationStage(projectRoot);
  const issueNumber = parseIssueNumber(optionString(options, "issue"));
  const issue = markIssueInProgress(projectRoot, issueNumber);
  console.log(`작업 시작 기록: #${issue.issueNumber}`);
  console.log(`브랜치: ${issue.branchName}`);
  console.log(`명령어: git switch -c ${issue.branchName}`);
}

function workPrDraft(projectRoot: string, options: Record<string, string | boolean>): void {
  requireImplementationStage(projectRoot);
  const issueNumber = parseIssueNumber(optionString(options, "issue"));
  const target = optionString(options, "target") ?? "dev";
  if (!["dev", "release", "main"].includes(target)) {
    throw new Error("PR target must be dev, release, or main");
  }
  const pr = createPullRequestDraft(projectRoot, issueNumber, target as "dev" | "release" | "main");
  console.log(`PR draft 기록: issue #${pr.issueNumber}`);
  console.log(`source: ${pr.sourceBranch}`);
  console.log(`target: ${pr.targetBranch}`);
  console.log(`dry-run: ${pr.dryRunCommand}`);
}

function beDeployDev(projectRoot: string, options: Record<string, string | boolean>): void {
  requireImplementationStage(projectRoot);
  const provider = optionString(options, "provider") ?? "local";
  const deployment = createDevDeploymentPlan(projectRoot, provider);
  console.log(`dev deploy hook 생성: ${deployment.filePath}`);
  console.log("외부 배포는 사용자 승인 전 실행하지 않음");
}

function parseFeTarget(value: string | undefined): DocumentId {
  if (value === "spec" || value === FE_SPEC_DOC) {
    return FE_SPEC_DOC;
  }
  if (value === "sprint-plan" || value === FE_SPRINT_PLAN_DOC) {
    return FE_SPRINT_PLAN_DOC;
  }
  throw new Error("FE approve target must be spec or sprint-plan");
}

function parseBeTarget(value: string | undefined): DocumentId {
  if (value === "spec" || value === BE_SPEC_DOC) {
    return BE_SPEC_DOC;
  }
  if (value === "api-contract" || value === API_CONTRACT_DOC) {
    return API_CONTRACT_DOC;
  }
  if (value === "sprint-plan" || value === BE_SPRINT_PLAN_DOC) {
    return BE_SPRINT_PLAN_DOC;
  }
  throw new Error("BE approve target must be spec, api-contract, or sprint-plan");
}

function approvalCommandForEngineeringDoc(docId: DocumentId): string {
  switch (docId) {
    case FE_SPEC_DOC:
      return "rph fe approve spec";
    case BE_SPEC_DOC:
      return "rph be approve spec";
    case API_CONTRACT_DOC:
      return "rph be approve api-contract";
    case FE_SPRINT_PLAN_DOC:
      return "rph fe approve sprint-plan";
    case BE_SPRINT_PLAN_DOC:
      return "rph be approve sprint-plan";
    default:
      return "rph docs approve";
  }
}

function splitListOption(value: string | undefined): string[] | undefined {
  return value?.split("|").map((item) => item.trim()).filter(Boolean);
}

function parseIssueNumber(value: string | undefined): number {
  const issueNumber = Number(value);
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    throw new Error("usage: --issue <number>");
  }
  return issueNumber;
}

function parseWorkstream(value: string): Workstream {
  const normalized = value.toUpperCase();
  if (normalized === "FE" || normalized === "BE") {
    return normalized;
  }
  throw new Error("agent must be FE or BE");
}

function requireImplementationStage(projectRoot: string): void {
  const state = loadState(projectRoot);
  if (!["IMPLEMENTATION", "QA_REVIEW", "READY_FOR_RELEASE"].includes(state.currentStage)) {
    throw new Error(`implementation work blocked. current stage must be IMPLEMENTATION. current: ${state.currentStage}`);
  }
}

function handleGitHub(
  projectRoot: string,
  subcommand: string | undefined,
  args: string[],
  options: Record<string, string | boolean>
): void {
  switch (subcommand) {
    case "create-repo": {
      const repoTarget = resolveGitHubTarget(projectRoot);
      const owner = process.env.GITHUB_OWNER || repoTarget.owner;
      const repo = process.env.GITHUB_REPO || repoTarget.repo || path.basename(projectRoot);
      const env = validateEnv(
        {
          ...process.env,
          GITHUB_OWNER: owner,
          GITHUB_REPO: repo
        },
        GITHUB_ENV_KEYS
      );
      if (!env.valid || !owner || !repo) {
        console.log(`[dry-run] 누락 env: ${env.missing.join(", ")}`);
        console.log(`실행할 명령: gh repo create ${owner ?? "<owner>"}/${repo ?? "<repo>"} --private --source . --remote origin --push`);
        return;
      }
      const result = createGitHubRepo(projectRoot, owner, repo, {
        visibility: "private",
        push: true
      });
      if (!result.ok) {
        throw new Error(result.message);
      }
      console.log(result.existed ? "GitHub repo 이미 존재" : "GitHub repo 생성 완료");
      if (result.url) {
        console.log(result.url);
      }
      return;
    }
    case "setup-labels": {
      const repoTarget = resolveGitHubTarget(projectRoot);
      const env = validateEnv(
        {
          ...process.env,
          GITHUB_OWNER: repoTarget.owner,
          GITHUB_REPO: repoTarget.repo
        },
        GITHUB_ENV_KEYS
      );
      const result = setupGitHubLabels(projectRoot);
      console.log("GitHub label 설정 파일 생성");
      console.log(`labels: ${result.labels.length}`);
      if (!env.valid) {
        console.log(`[dry-run] 누락 env: ${env.missing.join(", ")}`);
        console.log("실행할 명령:");
        result.commands.forEach((command) => console.log(`- ${command}`));
      } else {
        const owner = repoTarget.owner;
        const repo = repoTarget.repo;
        if (!owner || !repo) {
          throw new Error("GITHUB_OWNER/GITHUB_REPO missing after env validation");
        }
        const applied = applyGitHubLabels(owner, repo, result.labels);
        const failed = applied.filter((item) => !item.ok);
        applied.forEach((item) => console.log(`- ${item.label}: ${item.ok ? "applied" : item.message}`));
        if (failed.length > 0) {
          throw new Error(`GitHub label apply failed: ${failed.map((item) => item.label).join(", ")}`);
        }
      }
      return;
    }
    case "setup-templates": {
      const files = writeGitHubTemplates(projectRoot);
      console.log("GitHub template 생성");
      files.forEach((file) => console.log(`- ${file}`));
      return;
    }
    case "create-issue": {
      requireInitialized(projectRoot);
      workIssueCreate(projectRoot, parseWorkstream(optionString(options, "agent") ?? "FE"), args, options);
      return;
    }
    case "create-pr": {
      requireInitialized(projectRoot);
      workPrDraft(projectRoot, options);
      return;
    }
    case "sync": {
      requireInitialized(projectRoot);
      const issues = listWorkIssues(projectRoot).length;
      const prs = listPullRequests(projectRoot).length;
      console.log("GitHub sync dry-run");
      console.log(`local issues: ${issues}`);
      console.log(`local PR drafts: ${prs}`);
      console.log("외부 GitHub 쓰기는 사용자 승인 전 실행하지 않음");
      return;
    }
    case "release-plan": {
      requireInitialized(projectRoot);
      const version = optionString(options, "version") ?? args[0];
      if (!version) {
        throw new Error("usage: rph github release-plan --version <version>");
      }
      const plan = createReleasePlan(projectRoot, version);
      console.log(`release plan 생성: ${plan.filePath}`);
      console.log("main merge는 사용자 승인 전 실행하지 않음");
      return;
    }
    case "hotfix-plan": {
      requireInitialized(projectRoot);
      const title = optionString(options, "title") ?? (args.join(" ") || "Critical hotfix");
      const plan = createHotfixPlan(projectRoot, title);
      console.log(`hotfix plan 생성: ${plan.filePath}`);
      console.log("hotfix merge/deploy는 사용자 승인 전 실행하지 않음");
      return;
    }
    default:
      console.log("GitHub 명령어: create-repo | setup-labels | setup-templates | create-issue | create-pr | sync | release-plan | hotfix-plan");
  }
}

function resolveGitHubTarget(projectRoot: string): { owner?: string; repo?: string } {
  const fromEnv = {
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO
  };
  if (fromEnv.owner && fromEnv.repo) {
    return fromEnv;
  }
  const remote = spawnSync("git", ["remote", "get-url", "origin"], {
    cwd: projectRoot,
    encoding: "utf8"
  });
  const url = remote.status === 0 ? remote.stdout.trim() : "";
  const parsed = parseGitHubRemote(url);
  return {
    owner: fromEnv.owner || parsed?.owner,
    repo: fromEnv.repo || parsed?.repo
  };
}

function parseGitHubRemote(url: string): { owner: string; repo: string } | null {
  const httpsMatch = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2].replace(/\.git$/, "") };
  }
  const sshMatch = url.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2].replace(/\.git$/, "") };
  }
  return null;
}

function parseDocId(value: string | undefined): (typeof DOCUMENT_IDS)[number] {
  if (!value || !isDocumentId(value)) {
    throw new Error(`invalid document id: ${value ?? "(empty)"}. allowed: ${DOCUMENT_IDS.join(", ")}`);
  }
  return value;
}

function parseDesignArtifactId(value: string | undefined): (typeof DESIGN_ARTIFACT_IDS)[number] {
  if (!value || !(DESIGN_ARTIFACT_IDS as readonly string[]).includes(value)) {
    throw new Error(`invalid design artifact id: ${value ?? "(empty)"}. allowed: ${DESIGN_ARTIFACT_IDS.join(", ")}`);
  }
  return value as (typeof DESIGN_ARTIFACT_IDS)[number];
}

function bodyFromOptions(options: Record<string, string | boolean>): string | undefined {
  const filePath = optionString(options, "file");
  if (!filePath) {
    return undefined;
  }
  return fs.readFileSync(path.resolve(filePath), "utf8");
}

function recommendedCommand(state: ProjectState, stage: string): string {
  const pdCommand = recommendedPdCommand(state);
  if (pdCommand) {
    return pdCommand;
  }
  const engineeringCommand = recommendedEngineeringCommand(state);
  if (engineeringCommand) {
    return engineeringCommand;
  }
  if (stage.includes("INTERVIEW")) {
    return `rph pm interview ${recommendedDoc(stage)}`;
  }
  if (stage.includes("DRAFT")) {
    return `rph pm draft ${recommendedDoc(stage)}`;
  }
  if (stage === "PM_COMPETITOR_ANALYSIS") {
    return "rph pm draft competitor-analysis";
  }
  if (stage === "PM_DIFFERENTIATION") {
    return "rph pm draft differentiation";
  }
  if (stage.includes("REVIEW")) {
    return `rph pm approve ${recommendedDoc(stage)}`;
  }
  if (stage === "PM_FEATURE_DEFINITION_APPROVED") {
    return "rph pm finalize";
  }
  return "rph status";
}

function recommendedEngineeringCommand(state: ProjectState): string | null {
  switch (state.currentStage) {
    case "PD_APPROVED":
      return "rph fe spec";
    case "FE_SPEC":
      return recommendedDocumentAction(state, FE_SPEC_DOC, "rph fe spec", "rph fe approve spec");
    case "BE_SPEC":
      if (state.documents[BE_SPEC_DOC]?.status !== "approved") {
        return recommendedDocumentAction(state, BE_SPEC_DOC, "rph be spec", "rph be approve spec");
      }
      return recommendedDocumentAction(state, API_CONTRACT_DOC, "rph be api-contract", "rph be approve api-contract");
    case "SPRINT_PLANNING":
      if (state.documents[FE_SPRINT_PLAN_DOC]?.status !== "approved") {
        return recommendedDocumentAction(state, FE_SPRINT_PLAN_DOC, "rph fe sprint-plan", "rph fe approve sprint-plan");
      }
      return recommendedDocumentAction(state, BE_SPRINT_PLAN_DOC, "rph be sprint-plan", "rph be approve sprint-plan");
    case "IMPLEMENTATION":
      return "rph fe issue-create --title \"First FE task\"";
    default:
      return null;
  }
}

function recommendedDocumentAction(
  state: ProjectState,
  docId: DocumentId,
  createCommand: string,
  approveCommand: string
): string {
  const doc = state.documents[docId];
  if (!doc?.currentVersion) {
    return createCommand;
  }
  if (doc.status !== "approved") {
    return approveCommand;
  }
  return "rph status";
}

function recommendedPdCommand(state: ProjectState): string | null {
  switch (state.currentStage) {
    case "PM_APPROVED":
      return "rph pd start";
    case "PD_REFERENCES":
      return recommendedDesignArtifactAction(state, "references", "rph pd references");
    case "PD_DIRECTIONS":
      return recommendedDesignArtifactAction(state, "directions", "rph pd directions");
    case "PD_LANDING_PREVIEWS":
      return recommendedDesignArtifactAction(state, "landing-preview", "rph pd landing-preview");
    case "PD_DESIGN_SYSTEM":
      return recommendedDesignArtifactAction(state, "design-system", "rph pd design-system");
    case "PD_PAGE_DESIGNS":
      return recommendedDesignArtifactAction(state, "page-designs", "rph pd pages");
    case "PD_REVIEW":
      return "rph pd finalize";
    default:
      return null;
  }
}

function recommendedDesignArtifactAction(
  state: ProjectState,
  artifactId: DesignArtifactId,
  createCommand: string
): string {
  const artifact = state.designArtifacts?.[artifactId];
  if (!artifact?.currentVersion) {
    return createCommand;
  }
  if (artifact.status !== "approved") {
    return `rph pd approve ${artifactId}`;
  }
  return "rph status";
}

function recommendedDoc(stage: string): string {
  if (stage.includes("REQUIREMENTS")) {
    return "requirements";
  }
  if (stage.includes("SCREEN_DEFINITION")) {
    return "screen-definition";
  }
  if (stage.includes("FEATURE_DEFINITION")) {
    return "feature-definition";
  }
  return "product-definition";
}

async function runInitialWizard(
  defaultName: string,
  defaultObsidianPath?: string
): Promise<{ projectName: string; obsidianPath?: string }> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log("Real Product Harness 초기 설정");
    console.log("1. 새 제품 프로젝트 시작");
    console.log("2. 기존 프로젝트 불러오기");
    console.log("3. GitHub 저장소 연결");
    console.log("4. Notion/Obsidian 연동 설정");
    console.log("5. MCP 설정");
    console.log("6. 환경 변수 설정");
    console.log("7. 종료");
    const projectName = (await rl.question(`프로젝트명 (${defaultName}): `)).trim() || defaultName;
    const sync = (await rl.question("Obsidian 프로젝트 경로를 지금 생성할까요? 경로 입력 또는 Enter: ")).trim();
    return { projectName, obsidianPath: sync || defaultObsidianPath };
  } finally {
    rl.close();
  }
}

function printHelp(): void {
  console.log([
    "real-product-harness",
    "",
    "Commands:",
    "  rph init [--yes] [--project-name <name>] [--obsidian-vault <path>]",
    "  rph status",
    "  rph next",
    "  rph pause | resume | cancel",
    "  rph pm start",
    "  rph pm interview [docId]",
    "  rph pm draft <docId> [--file <markdown>] [--summary <text>]",
    "  rph pm revise <docId> [--from <version>] [--file <markdown>] [--summary <text>]",
    "  rph pm approve <docId> [--by <name>]",
    "  rph pm finalize",
    "  rph pd start",
    "  rph pd references",
    "  rph pd directions",
    "  rph pd landing-preview",
    "  rph pd design-system",
    "  rph pd pages",
    "  rph pd show <artifactId> [version]",
    "  rph pd revise <artifactId> [--from <version>] [--file <markdown>] [--summary <text>]",
    "  rph pd approve <artifactId> [--by <name>]",
    "  rph pd export obsidian <artifactId|all> --path <vaultProjectPath>",
    "  rph pd finalize",
    "  rph fe spec",
    "  rph fe approve <spec|sprint-plan> [--by <name>]",
    "  rph fe sprint-plan",
    "  rph fe issue-create [--title <title>] [--label <label>]",
    "  rph fe work --issue <number>",
    "  rph fe pr --issue <number> [--target <dev|release|main>]",
    "  rph be spec",
    "  rph be api-contract",
    "  rph be approve <spec|api-contract|sprint-plan> [--by <name>]",
    "  rph be sprint-plan",
    "  rph be issue-create [--title <title>] [--label <label>]",
    "  rph be work --issue <number>",
    "  rph be deploy-dev [--provider <provider>]",
    "  rph be pr --issue <number> [--target <dev|release|main>]",
    "  rph qa review --pr <number>",
    "  rph qa conflicts --pr <number>",
    "  rph qa test --pr <number>",
    "  rph qa report --pr <number>",
    "  rph notion plan",
    "  rph notion sync",
    "  rph docs list",
    "  rph docs show <docId> [version]",
    "  rph docs diff <docId> <fromVersion> <toVersion>",
    "  rph docs rollback <docId> --to <version>",
    "  rph docs export obsidian <docId|all> --path <vaultProjectPath>",
    "  rph github create-repo",
    "  rph github setup-labels",
    "  rph github setup-templates",
    "  rph github create-issue --agent <FE|BE> --title <title>",
    "  rph github create-pr --issue <number>",
    "  rph github sync",
    "  rph github release-plan --version <version>",
    "  rph github hotfix-plan --title <title>",
    "",
    `Document IDs: ${DOCUMENT_IDS.map((docId) => `${docId}(${DOCUMENT_TITLES[docId]})`).join(", ")}`,
    `Design Artifact IDs: ${DESIGN_ARTIFACT_IDS.map((artifactId) => `${artifactId}(${DESIGN_ARTIFACT_TITLES[artifactId]})`).join(", ")}`
  ].join("\n"));
}

void main();
