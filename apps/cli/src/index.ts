#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { spawnSync } from "node:child_process";
import {
  approveDocument,
  applyGitHubLabels,
  createDocumentVersion,
  createGitHubRepo,
  createInterviewSession,
  createObsidianProject,
  diffDocumentVersions,
  DOCUMENT_IDS,
  DOCUMENT_TITLES,
  exportDocumentToObsidian,
  GITHUB_ENV_KEYS,
  initProject,
  isDocumentId,
  listDocumentIndexes,
  loadEnvFile,
  loadProject,
  loadState,
  nextStage,
  optionBool,
  optionString,
  parseCli,
  readDocumentIndex,
  renderInterview,
  requireInitialized,
  rollbackDocument,
  saveState,
  setupGitHubLabels,
  showDocument,
  syncStateDocuments,
  transitionState,
  validateEnv,
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
      case "docs":
        handleDocs(cwd, parsed.subcommand, parsed.args, parsed.options);
        break;
      case "github":
        handleGitHub(cwd, parsed.subcommand);
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
  const docs = listDocumentIndexes(projectRoot);
  console.log(`문서: ${docs.length}`);
  for (const doc of docs) {
    console.log(`- ${doc.docId} ${doc.currentVersion} ${doc.status}`);
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
  console.log(`명령어: ${recommendedCommand(next)}`);
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
      pmDraft(projectRoot, args[0]);
      return;
    case "approve":
      pmApprove(projectRoot, args[0], optionString(options, "by") ?? "user");
      return;
    default:
      console.log("PM 명령어: start | interview | draft <docId> | approve <docId>");
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

function pmDraft(projectRoot: string, docArg?: string): void {
  const docId = parseDocId(docArg ?? "product-definition");
  const index = createDocumentVersion(projectRoot, docId, {
    changeSummary: "Initial PM draft",
    body: undefined
  });
  let state = syncStateDocuments(loadState(projectRoot), index);
  if (docId === "product-definition" && state.currentStage === "PM_PRODUCT_DEFINITION_INTERVIEW") {
    state = transitionState(state, "PM_PRODUCT_DEFINITION_DRAFT", "product definition draft created");
    state = transitionState(state, "PM_PRODUCT_DEFINITION_REVIEW", "product definition ready for review");
  }
  saveState(projectRoot, state);
  console.log(`문서 초안 생성: ${docId} ${index.currentVersion}`);
  console.log(`승인 전 다음 큰 단계 진행 금지: rph pm approve ${docId}`);
}

function pmApprove(projectRoot: string, docArg?: string, approvedBy = "user"): void {
  const docId = parseDocId(docArg ?? "product-definition");
  const approval = approveDocument(projectRoot, docId, approvedBy);
  let state = loadState(projectRoot);
  state = syncStateDocuments(state, readDocumentIndex(projectRoot, docId));
  if (docId === "product-definition" && state.currentStage === "PM_PRODUCT_DEFINITION_REVIEW") {
    state = transitionState(state, "PM_PRODUCT_DEFINITION_APPROVED", "product definition approved by user");
  }
  saveState(projectRoot, state);
  console.log(`[승인 완료] ${approval.docId} ${approval.version}`);
  console.log(`승인자: ${approval.approvedBy}`);
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
      const docId = parseDocId(args[1]);
      const target = optionString(options, "path");
      if (!target) {
        throw new Error("Obsidian target missing: --path <vaultProjectPath>");
      }
      const filePath = exportDocumentToObsidian(projectRoot, target, docId);
      console.log(`Obsidian export 완료: ${filePath}`);
      return;
    }
    default:
      console.log("Docs 명령어: list | show <docId> | diff <docId> <from> <to> | rollback <docId> --to <version> | export obsidian <docId> --path <path>");
  }
}

function handleGitHub(projectRoot: string, subcommand: string | undefined): void {
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
    default:
      console.log("GitHub 명령어: create-repo | setup-labels | setup-templates");
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

function recommendedCommand(stage: string): string {
  if (stage.includes("INTERVIEW")) {
    return "rph pm interview";
  }
  if (stage.includes("DRAFT")) {
    return "rph pm draft product-definition";
  }
  if (stage.includes("REVIEW")) {
    return "rph pm approve product-definition";
  }
  return "rph status";
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
    "  rph pm draft <docId>",
    "  rph pm approve <docId> [--by <name>]",
    "  rph docs list",
    "  rph docs show <docId> [version]",
    "  rph docs diff <docId> <fromVersion> <toVersion>",
    "  rph docs rollback <docId> --to <version>",
    "  rph docs export obsidian <docId> --path <vaultProjectPath>",
    "  rph github create-repo",
    "  rph github setup-labels",
    "  rph github setup-templates",
    "",
    `Document IDs: ${DOCUMENT_IDS.map((docId) => `${docId}(${DOCUMENT_TITLES[docId]})`).join(", ")}`
  ].join("\n"));
}

void main();
