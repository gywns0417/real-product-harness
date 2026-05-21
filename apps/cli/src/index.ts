#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { spawnSync } from "node:child_process";
import packageJson from "../../../package.json";
import {
  advanceAfterPmApproval,
  advanceAfterPmDraft,
  advanceAfterPdApproval,
  assembleAgentContext,
  applyNotionWorkspacePlan,
  approveDesignArtifact,
  approveDocument,
  approveEngineeringDocument,
  applyGitHubLabels,
  canFinalizePm,
  canFinalizePd,
  createHarnessConfig,
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
  buildAiChatPrompt,
  createAiRunRecord,
  createAiChatTurnRecord,
  createPullRequestDraft,
  createQaReview,
  createReleasePlan,
  createWorkIssue,
  checkQaConflicts,
  ensureRuntimeSession,
  DESIGN_ARTIFACT_IDS,
  DESIGN_ARTIFACT_TITLES,
  diffDocumentVersions,
  DOCUMENT_IDS,
  DOCUMENT_TITLES,
  DesignArtifactId,
  DocumentId,
  AiChatMessage,
  AiChatTurnRecord,
  aiChatFile,
  exportDocumentToObsidian,
  exportDesignArtifactToObsidian,
  FE_SPEC_DOC,
  FE_SPRINT_PLAN_DOC,
  BE_SPEC_DOC,
  BE_SPRINT_PLAN_DOC,
  API_CONTRACT_DOC,
  GITHUB_ENV_KEYS,
  initProject,
  isKnownTopLevelCommand,
  isDocumentId,
  AiProviderId,
  McpServerId,
  listDocumentIndexes,
  listDesignArtifactIndexes,
  listPullRequests,
  listWorkIssues,
  loadHarnessConfig,
  loadEnvFile,
  loadProject,
  loadRuntimeSession,
  loadState,
  markIssueInProgress,
  nextStage,
  optionBool,
  optionString,
  planAgentAction,
  parseCli,
  parseCommandLine,
  configuredAiProviders,
  configuredMcpServers,
  prepareEngineeringDocumentState,
  preparePdArtifactState,
  preparePmDraftState,
  ProjectState,
  readDocumentIndex,
  readDesignArtifactIndex,
  recordRuntimeSessionEvent,
  renderRuntimeHero,
  renderSetupGuide,
  renderAgentContextBundle,
  renderStatusLine,
  renderInterview,
  runQaTests,
  finalizeQaReport,
  generateAiText,
  requireInitialized,
  rollbackDocument,
  saveState,
  setAiProviderEnabled,
  setHarnessConfigValue,
  setMcpServerEnabled,
  setupGitHubLabels,
  showDocument,
  showDesignArtifact,
  stripFrontmatter,
  syncStateDesignArtifacts,
  syncStateDocuments,
  syncHarnessConfigFromEnv,
  syncNotionPayloadLive,
  testAiConnection,
  testAllAiConnections,
  testAllMcpConnections,
  testMcpConnection,
  transitionState,
  suggestCommand,
  updateRuntimeSession,
  AI_PROVIDER_DEFINITIONS,
  MCP_SERVER_DEFINITIONS,
  upsertEnvFileValues,
  validateEnv,
  SetupChoices,
  Workstream,
  writeConnectionReport,
  writeAiRunRecord,
  writeAiChatTurnRecord,
  WORKFLOW_STAGES,
  writeGitHubBranchPlan,
  writeGitHubTemplates
} from "../../../packages/core/src";

interface SetupPrompter {
  question(query: string, options?: { secret?: boolean }): Promise<string>;
}

interface CommandContext {
  prompter?: SetupPrompter;
}

const HELP_TOPIC_LINES: Record<string, string[]> = {
  runtime: [
    "Runtime commands",
    "",
    "Enter runtime: rph",
    "One-shot: rph /pm start",
    "",
    "Core commands:",
    "  /status",
    "  /next",
    "  /pause | /resume | /cancel",
    "  /project <path> | /pwd",
    "  /chat status | clear",
    "  /agent status | clear",
    "  /exit"
  ],
  setup: [
    "Setup commands",
    "",
    "  rph setup detect",
    "    Inspect current shell env and show what RPH can detect. No files changed.",
    "  rph setup apply",
    "    Persist env-derived config into .rph/config.json and MCP config. No live checks.",
    "  rph setup check",
    "    Run live connection checks against the currently applied config.",
    "  rph setup auto",
    "    Guided assistant. In TTY it can collect/apply/check end-to-end.",
    "",
    "Shortcuts:",
    "  /setup ai [openai|anthropic|gemini|local]",
    "  /setup mcp [notion|github|figma|stitch]",
    "  /setup custom <key> <value>"
  ],
  ai: [
    "AI commands",
    "",
    "  /ai status",
    "  /ai test [provider]",
    "  /ai enable <provider>",
    "  /ai disable <provider>",
    "  /ai run --prompt <text>"
  ],
  mcp: [
    "MCP commands",
    "",
    "  /mcp status",
    "  /mcp test [server]",
    "  /mcp enable <server>",
    "  /mcp disable <server>"
  ],
  pm: [
    "PM commands",
    "",
    "  /pm start",
    "  /pm interview [docId]",
    "  /pm draft <docId> [--file <markdown>] [--ai] [--provider <provider>] [--summary <text>]",
    "  /pm revise <docId> [--from <version>] [--file <markdown>] [--summary <text>]",
    "  /pm approve <docId> [--by <name>]",
    "  /pm diff <docId> <fromVersion> <toVersion>",
    "  /pm rollback <docId> --to <version>",
    "  /pm finalize"
  ],
  pd: [
    "PD commands",
    "",
    "  /pd start",
    "  /pd references [--ai]",
    "  /pd directions [--ai]",
    "  /pd landing-preview [--ai]",
    "  /pd design-system [--ai]",
    "  /pd pages [--ai]",
    "  /pd show <artifactId> [version]",
    "  /pd revise <artifactId> [--from <version>] [--file <markdown>] [--summary <text>]",
    "  /pd approve <artifactId> [--by <name>]",
    "  /pd export obsidian <artifactId|all> --path <vaultProjectPath>",
    "  /pd finalize"
  ],
  fe: [
    "FE commands",
    "",
    "  /fe spec [--ai]",
    "  /fe approve <spec|sprint-plan> [--by <name>]",
    "  /fe sprint-plan [--ai]",
    "  /fe issue-create [--title <title>] [--label <label>]",
    "  /fe work --issue <number>",
    "  /fe pr --issue <number> [--target <dev|release|main>]"
  ],
  be: [
    "BE commands",
    "",
    "  /be spec [--ai]",
    "  /be api-contract [--ai]",
    "  /be approve <spec|api-contract|sprint-plan> [--by <name>]",
    "  /be sprint-plan [--ai]",
    "  /be issue-create [--title <title>] [--label <label>]",
    "  /be work --issue <number>",
    "  /be deploy-dev [--provider <provider>]",
    "  /be pr --issue <number> [--target <dev|release|main>]"
  ],
  qa: [
    "QA commands",
    "",
    "  /qa review --pr <number>",
    "  /qa conflicts --pr <number>",
    "  /qa test --pr <number>",
    "  /qa report --pr <number>"
  ],
  notion: [
    "Notion commands",
    "",
    "  /notion plan",
    "  /notion setup [--live] [--title <title>]",
    "  /notion sync [--live]"
  ],
  docs: [
    "Docs commands",
    "",
    "  /docs list",
    "  /docs show <docId> [version]",
    "  /docs diff <docId> <fromVersion> <toVersion>",
    "  /docs rollback <docId> --to <version>",
    "  /docs approve <docId> [--by <name>]",
    "  /docs export obsidian <docId|all> --path <vaultProjectPath>",
    "  /docs export notion"
  ],
  github: [
    "GitHub commands",
    "",
    "  /github create-repo",
    "  /github setup-labels",
    "  /github setup-templates",
    "  /github setup-branches",
    "  /github create-issue --agent <FE|BE> --title <title>",
    "  /github create-pr --issue <number>",
    "  /github sync",
    "  /github release-plan --version <version>",
    "  /github hotfix-plan --title <title>"
  ]
};

async function main(): Promise<void> {
  const cwd = path.resolve(process.cwd());
  loadEnvFile(path.join(cwd, ".env"));
  const argv = process.argv.slice(2);

  if (shouldStartRuntime(argv)) {
    await runRuntimeShell(cwd);
    return;
  }

  const parsed = parseCli(argv);
  await runParsedCommand(cwd, parsed);
}

export async function runParsedCommand(
  projectRoot: string,
  parsed: ReturnType<typeof parseCli>,
  setExitCode = true,
  context: CommandContext = {}
): Promise<boolean> {
  try {
    if (!isKnownTopLevelCommand(parsed.command)) {
      printUnknownCommand(parsed.command);
      if (setExitCode) {
        process.exitCode = 2;
      }
      return false;
    }

    switch (parsed.command) {
      case "shell":
      case "runtime":
        await runRuntimeShell(projectRoot);
        break;
      case "init":
        await handleInit(projectRoot, parsed.options);
        break;
      case "status":
        handleStatus(projectRoot);
        break;
      case "next":
        handleNext(projectRoot);
        break;
      case "pause":
        handlePause(projectRoot, true);
        break;
      case "resume":
        handlePause(projectRoot, false);
        break;
      case "cancel":
        handleCancel(projectRoot);
        break;
      case "setup":
        await handleSetup(projectRoot, parsed.subcommand, parsed.args, parsed.options, context);
        break;
      case "settings":
        handleSettings(projectRoot, parsed.subcommand, parsed.args);
        break;
      case "ask":
      case "agent":
      case "chat":
        await handleAsk(projectRoot, parsed.args, parsed.options);
        break;
      case "ai":
        await handleAi(projectRoot, parsed.subcommand, parsed.args, parsed.options);
        break;
      case "mcp":
        await handleMcp(projectRoot, parsed.subcommand, parsed.args);
        break;
      case "doctor":
        await handleDoctor(projectRoot, parsed.options);
        break;
      case "pm":
        await handlePm(projectRoot, parsed.subcommand, parsed.args, parsed.options);
        break;
      case "pd":
        await handlePd(projectRoot, parsed.subcommand, parsed.args, parsed.options);
        break;
      case "fe":
        await handleFe(projectRoot, parsed.subcommand, parsed.args, parsed.options);
        break;
      case "be":
        await handleBe(projectRoot, parsed.subcommand, parsed.args, parsed.options);
        break;
      case "qa":
        handleQa(projectRoot, parsed.subcommand, parsed.args, parsed.options);
        break;
      case "notion":
        await handleNotion(projectRoot, parsed.subcommand, parsed.options);
        break;
      case "docs":
        handleDocs(projectRoot, parsed.subcommand, parsed.args, parsed.options);
        break;
      case "github":
        handleGitHub(projectRoot, parsed.subcommand, parsed.args, parsed.options);
        break;
      case "help":
        printHelp(parsed.subcommand);
        break;
      case "version":
        printVersion();
        break;
    }
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[error] ${message}`);
    if (setExitCode) {
      process.exitCode = 1;
    }
    return false;
  }
}

function shouldStartRuntime(argv: string[]): boolean {
  if (argv[0] === "shell" || argv[0] === "runtime") {
    return false;
  }
  return argv.length === 0 && process.stdin.isTTY;
}

async function runRuntimeShell(initialRoot: string): Promise<void> {
  let projectRoot = initialRoot;
  const sessionId = resolveRuntimeSessionId(projectRoot);
  const chatHistory: AiChatMessage[] = loadRuntimeChatHistory(projectRoot, sessionId);
  printRuntimeBanner(projectRoot, sessionId);
  if (isRuntimeProjectInitialized(projectRoot)) {
    const manifest = ensureRuntimeSession(projectRoot, sessionId);
    if (manifest.status === "paused") {
      console.log("이전 runtime session이 일시정지 상태입니다. 계속하려면 /resume 을 입력하세요.");
    }
    if (manifest.pendingAction?.command) {
      console.log(`pending action: ${manifest.pendingAction.command}`);
    }
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    rl.setPrompt(runtimePrompt(projectRoot));
    rl.prompt();
    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!line) {
        rl.setPrompt(runtimePrompt(projectRoot));
        rl.prompt();
        continue;
      }
      if (isExitCommand(line)) {
        appendRuntimeLog(projectRoot, sessionId, line, true);
        console.log("RPH runtime 종료");
        return;
      }

      let ok = false;
      try {
        const control = handleRuntimeControlCommand(projectRoot, line);
        if (control.handled) {
          projectRoot = control.projectRoot;
          if (control.clearChat) {
            chatHistory.splice(0);
          }
          ok = true;
          continue;
        }

        if (!line.startsWith("/")) {
          ok = await handleRuntimeAgentInput(projectRoot, sessionId, chatHistory, line);
          continue;
        }

        const parsed = parseCli(parseCommandLine(line));
        if (parsed.command === "init" && !optionBool(parsed.options, "yes")) {
          parsed.options.yes = true;
          console.log("runtime init은 비대화형 기본값으로 실행합니다. 필요한 값은 /init --project-name <name>처럼 넘기세요.");
        }
        ok = await runParsedCommand(projectRoot, parsed, false, { prompter: rl });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[error] ${message}`);
      } finally {
        appendRuntimeLog(projectRoot, sessionId, line, ok);
        rl.setPrompt(runtimePrompt(projectRoot));
        rl.prompt();
      }
    }
  } finally {
    rl.close();
  }
}

function printRuntimeBanner(projectRoot: string, sessionId: string): void {
  let config: ReturnType<typeof loadHarnessConfig> | undefined;
  try {
    config = loadHarnessConfig(projectRoot);
  } catch {
    config = undefined;
  }
  console.log(renderRuntimeHero(projectRoot, sessionId, config));
}

function runtimePrompt(projectRoot: string): string {
  try {
    const project = loadProject(projectRoot);
    const state = loadState(projectRoot);
    return `rph:${project.name}/${state.currentStage}> `;
  } catch {
    return `rph:${path.basename(projectRoot)}/uninitialized> `;
  }
}

function isExitCommand(line: string): boolean {
  return ["/exit", "/quit", "exit", "quit"].includes(line);
}

function handleRuntimeControlCommand(
  projectRoot: string,
  line: string
): { handled: true; projectRoot: string; clearChat?: boolean } | { handled: false; projectRoot: string } {
  const argv = parseCommandLine(line);
  const [command, target, ...rest] = argv;
  if (!["/project", "/cd", "/pwd", "/chat", "/agent"].includes(command ?? "")) {
    return { handled: false, projectRoot };
  }
  if (command === "/pwd") {
    console.log(projectRoot);
    return { handled: true, projectRoot };
  }
  if (command === "/chat" || command === "/agent") {
    return handleRuntimeAgentCommand(projectRoot, target, rest);
  }
  if (!target) {
    console.log("usage: /project <path>");
    return { handled: true, projectRoot };
  }
  const nextRoot = path.resolve(projectRoot, target);
  if (!fs.existsSync(nextRoot) || !fs.statSync(nextRoot).isDirectory()) {
    console.log(`[error] project path not found: ${nextRoot}`);
    return { handled: true, projectRoot };
  }
  loadEnvFile(path.join(nextRoot, ".env"));
  console.log(`project switched: ${nextRoot}`);
  return { handled: true, projectRoot: nextRoot, clearChat: true };
}

function handleRuntimeAgentCommand(
  projectRoot: string,
  subcommand: string | undefined,
  _args: string[]
): { handled: true; projectRoot: string; clearChat?: boolean } {
  const config = loadRuntimeChatConfig(projectRoot);
  switch (subcommand) {
    case undefined:
    case "status":
      console.log(`AI agent: ${config.activeAiProvider}`);
      printAiStatus(config);
      console.log("일반 텍스트를 입력하면 AI agent와 대화합니다. Slash command는 /pm start처럼 /로 시작합니다.");
      return { handled: true, projectRoot };
    case "clear":
    case "reset":
      console.log("AI chat context cleared");
      return { handled: true, projectRoot, clearChat: true };
    default:
      console.log("Agent 명령어: /agent status | /agent clear");
      return { handled: true, projectRoot };
  }
}

function appendRuntimeLog(projectRoot: string, sessionId: string, command: string, ok: boolean): void {
  const rphDir = path.join(projectRoot, ".rph");
  if (!fs.existsSync(rphDir)) {
    return;
  }
  const runtimeDir = path.join(rphDir, "runtime");
  fs.mkdirSync(runtimeDir, { recursive: true });
  const record = {
    at: new Date().toISOString(),
    sessionId,
    command,
    ok
  };
  fs.appendFileSync(path.join(runtimeDir, `${sessionId}.jsonl`), `${JSON.stringify(record)}\n`);
  if (isRuntimeProjectInitialized(projectRoot) && !isExitCommand(command)) {
    recordRuntimeSessionEvent(projectRoot, sessionId, {
      kind: ok ? "checkpoint" : "error",
      message: command,
      ok
    });
  }
}

async function handleRuntimeAgentInput(
  projectRoot: string,
  sessionId: string,
  chatHistory: AiChatMessage[],
  userInput: string
): Promise<boolean> {
  const plan = createRuntimePlan(projectRoot, userInput);
  if (isRuntimeProjectInitialized(projectRoot)) {
    recordRuntimeSessionEvent(projectRoot, sessionId, {
      kind: "plan",
      message: plan.reason,
      ok: plan.kind !== "blocked",
      plan
    });
  }
  if (plan.kind === "blocked") {
    console.log(`[blocked] ${plan.reason}`);
    return false;
  }
  if (plan.kind !== "chat" && plan.command && plan.safeToAutoRun) {
    console.log(`agent action: ${plan.command}`);
    const parsed = parseCli(parseCommandLine(plan.command));
    const ok = await runParsedCommand(projectRoot, parsed, false);
    if (isRuntimeProjectInitialized(projectRoot)) {
      recordRuntimeSessionEvent(projectRoot, sessionId, {
        kind: "command",
        message: plan.command,
        ok,
        plan
      });
      updateRuntimeContinuation(projectRoot, sessionId, ok);
    }
    return ok;
  }
  return handleRuntimeChat(projectRoot, sessionId, chatHistory, userInput);
}

async function handleRuntimeChat(
  projectRoot: string,
  sessionId: string,
  chatHistory: AiChatMessage[],
  userInput: string
): Promise<boolean> {
  const config = loadRuntimeChatConfig(projectRoot);
  const context = buildRuntimeAgentContext(projectRoot);
  const prompt = buildAiChatPrompt(userInput, chatHistory, context);
  console.log(renderStatusLine("agent thinking", "skipped"));
  const result = await generateAiText(config, {
    prompt,
    system: agentChatSystemPrompt(),
    maxOutputTokens: 1800
  });
  const userMessage: AiChatMessage = {
    role: "user",
    content: userInput,
    at: result.generatedAt
  };
  const assistantMessage: AiChatMessage = {
    role: "assistant",
    content: result.text,
    at: result.generatedAt
  };
  chatHistory.push(userMessage, assistantMessage);
  if (chatHistory.length > 24) {
    chatHistory.splice(0, chatHistory.length - 24);
  }
  if (isRuntimeProjectInitialized(projectRoot)) {
    writeAiChatTurnRecord(projectRoot, createAiChatTurnRecord(result, sessionId, userInput, prompt));
  }
  console.log("");
  console.log(result.text.trim());
  console.log("");
  return true;
}

async function handleAsk(
  projectRoot: string,
  args: string[],
  options: Record<string, string | boolean>
): Promise<void> {
  const prompt = (optionString(options, "prompt") ?? args.join(" ")) || readPipedStdin();
  if (!prompt.trim()) {
    throw new Error("usage: rph ask <message> 또는 rph ask --prompt <message>");
  }
  const plan = createRuntimePlan(projectRoot, prompt);
  if (plan.kind === "blocked") {
    console.log(`[blocked] ${plan.reason}`);
    return;
  }
  if (plan.kind !== "chat" && plan.command && plan.safeToAutoRun) {
    console.log(`agent action: ${plan.command}`);
    const parsed = parseCli(parseCommandLine(plan.command));
    await runParsedCommand(projectRoot, parsed, false);
    return;
  }
  const config = loadRuntimeChatConfig(projectRoot);
  const context = buildRuntimeAgentContext(projectRoot);
  const aiPrompt = buildAiChatPrompt(prompt, [], context);
  const result = await generateAiText(config, {
    prompt: aiPrompt,
    system: agentChatSystemPrompt(),
    maxOutputTokens: parseOptionalPositiveInt(optionString(options, "max-tokens")) ?? 1800
  });
  if (isRuntimeProjectInitialized(projectRoot)) {
    writeAiChatTurnRecord(projectRoot, createAiChatTurnRecord(result, `ask-${result.id}`, prompt, aiPrompt));
  }
  console.log(result.text.trim());
}

function createRuntimePlan(projectRoot: string, userInput: string) {
  const initialized = isRuntimeProjectInitialized(projectRoot);
  let state: ProjectState | undefined;
  let hasConfiguredAi = false;
  let recommended: string | undefined;
  if (initialized) {
    state = loadState(projectRoot);
    const config = loadRuntimeChatConfig(projectRoot);
    hasConfiguredAi = configuredAiProviders(config).length > 0;
    recommended = recommendedAgentCommand(state);
  }
  return planAgentAction({
    text: userInput,
    initialized,
    currentStage: state?.currentStage,
    paused: state?.paused,
    recommendedCommand: recommended,
    hasConfiguredAi
  });
}

function readPipedStdin(): string {
  if (process.stdin.isTTY) {
    return "";
  }
  return fs.readFileSync(0, "utf8");
}

function agentChatSystemPrompt(): string {
  return [
    "You are the connected Real Product Harness AI agent inside a terminal runtime.",
    "Normal user text can be conversation or local workflow intent.",
    "Stay grounded in project state, approved artifacts, and available slash commands.",
    "If local action already ran, summarize what changed and the next command.",
    "Use Korean by default."
  ].join(" ");
}

function loadRuntimeChatConfig(projectRoot: string): ReturnType<typeof loadHarnessConfig> {
  if (isRuntimeProjectInitialized(projectRoot)) {
    return syncHarnessConfigFromEnv(projectRoot);
  }
  return loadHarnessConfig(projectRoot);
}

function buildRuntimeAgentContext(projectRoot: string): string {
  if (!isRuntimeProjectInitialized(projectRoot)) {
    return [
      "Runtime project context:",
      `- project_root: ${projectRoot}`,
      "- initialized: false",
      "- next_setup_command: /init --yes --project-name <name>"
    ].join("\n");
  }
  return renderAgentContextBundle(assembleAgentContext(projectRoot, { includeBodies: true, maxBodyChars: 3500 }));
}

function isRuntimeProjectInitialized(projectRoot: string): boolean {
  try {
    requireInitialized(projectRoot);
    return true;
  } catch {
    return false;
  }
}

function resolveRuntimeSessionId(projectRoot: string): string {
  if (isRuntimeProjectInitialized(projectRoot)) {
    const current = loadRuntimeSession(projectRoot);
    if (current && (current.status === "active" || current.status === "paused")) {
      return current.sessionId;
    }
  }
  return `session-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

function loadRuntimeChatHistory(projectRoot: string, sessionId: string): AiChatMessage[] {
  const filePath = aiChatFile(projectRoot, sessionId);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const messages: AiChatMessage[] = [];
  for (const line of fs.readFileSync(filePath, "utf8").split(/\n+/)) {
    if (!line.trim()) {
      continue;
    }
    try {
      const record = JSON.parse(line) as AiChatTurnRecord;
      if (record.user?.content) {
        messages.push(record.user);
      }
      if (record.assistant?.content) {
        messages.push(record.assistant);
      }
    } catch {
      // Ignore a corrupt historical chat line; the session manifest remains authoritative.
    }
  }
  return messages.slice(-24);
}

function updateRuntimeContinuation(projectRoot: string, sessionId: string, ok: boolean): void {
  const state = loadState(projectRoot);
  if (!ok) {
    updateRuntimeSession(projectRoot, sessionId, {
      blocker: "last agent action failed",
      incrementRetryCount: true,
      note: "agent action failed"
    });
    return;
  }
  const nextCommand = recommendedAgentCommand(state);
  const pendingAction = planAgentAction({
    text: nextCommand,
    initialized: true,
    currentStage: state.currentStage,
    paused: state.paused,
    recommendedCommand: nextCommand,
    hasConfiguredAi: configuredAiProviders(loadRuntimeChatConfig(projectRoot)).length > 0
  });
  updateRuntimeSession(projectRoot, sessionId, {
    status: state.paused ? "paused" : "active",
    pendingAction,
    checkpoint: `completed agent action; next ${nextCommand}`,
    blocker: state.paused ? "workflow paused" : null,
    note: "agent continuation planned"
  });
}

async function handleInit(projectRoot: string, options: Record<string, string | boolean>): Promise<void> {
  const dryRun = optionBool(options, "dry-run");
  const yes = optionBool(options, "yes");
  let projectName = optionString(options, "project-name") ?? path.basename(projectRoot);
  let obsidianPath = optionString(options, "obsidian-vault");
  let setupChoices: SetupChoices | undefined;

  if (!yes && process.stdin.isTTY) {
    const answers = await runInitialWizard(projectName, obsidianPath);
    projectName = answers.projectName;
    obsidianPath = answers.obsidianPath;
    setupChoices = answers.setupChoices;
  }

  const result = initProject(projectRoot, {
    projectName,
    obsidianPath,
    dryRun,
    force: optionBool(options, "force"),
    setupChoices
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
  const config = loadHarnessConfig(projectRoot);
  const stage = WORKFLOW_STAGES[state.currentStage];
  console.log(`프로젝트: ${project.name}`);
  console.log(`현재 단계: ${stage.id} (${stage.name})`);
  console.log(`담당: ${stage.ownerAgent}`);
  console.log(`AI: ${config.activeAiProvider}`);
  console.log(`MCP: ${configuredMcpServers(config).map((server) => server.id).join(", ") || "none"}`);
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
  const session = loadRuntimeSession(projectRoot);
  if (session && (session.status === "active" || session.status === "paused")) {
    updateRuntimeSession(projectRoot, session.sessionId, {
      status: paused ? "paused" : "active",
      checkpoint: paused ? "workflow paused" : "workflow resumed",
      blocker: paused ? "workflow paused by user" : null,
      note: paused ? "pause requested" : "resume requested"
    });
  }
  console.log(paused ? "워크플로우 일시정지" : "워크플로우 재개");
}

function handleCancel(projectRoot: string): void {
  requireInitialized(projectRoot);
  const state = loadState(projectRoot);
  saveState(projectRoot, { ...state, paused: true });
  const session = loadRuntimeSession(projectRoot);
  if (session && (session.status === "active" || session.status === "paused")) {
    updateRuntimeSession(projectRoot, session.sessionId, {
      status: "cancelled",
      pendingAction: null,
      checkpoint: "workflow cancelled",
      blocker: "workflow cancelled by user",
      note: "cancel requested"
    });
  }
  console.log("현재 워크플로우 정지. 상태 파일은 보존됨.");
}

async function handleSetup(
  projectRoot: string,
  subcommand: string | undefined,
  args: string[],
  options: Record<string, string | boolean>,
  context: CommandContext = {}
): Promise<void> {
  const initialized = isRuntimeProjectInitialized(projectRoot);
  if (!initialized && (subcommand === undefined || subcommand === "auto")) {
    const projectName = optionString(options, "project-name") ?? (path.basename(projectRoot) || "RPH Project");
    initProject(projectRoot, { projectName });
    console.log(`RPH project initialized: ${projectName}`);
  } else {
    requireInitialized(projectRoot);
  }
  switch (subcommand) {
    case undefined:
    case "auto": {
      if (shouldRunInteractiveSetup(options, context)) {
        await runAutoSetupWizard(projectRoot, options, context);
        return;
      }
      await printSetupAutoSummary(projectRoot, options);
      return;
    }
    case "detect": {
      const config = createHarnessConfig(process.env, undefined, loadHarnessConfig(projectRoot));
      console.log(renderSetupGuide(config));
      console.log("");
      console.log("detected: 현재 shell env 기준 연결 가능 상태만 표시했습니다. 파일 변경 없음.");
      return;
    }
    case "apply": {
      const config = syncHarnessConfigFromEnv(projectRoot);
      console.log("setup applied");
      printConfigSummary(config);
      return;
    }
    case "check": {
      await runSetupChecks(projectRoot, loadHarnessConfig(projectRoot));
      return;
    }
    case "ai": {
      const config = syncHarnessConfigFromEnv(projectRoot);
      const providerId = args[0] ? parseAiProviderId(args[0]) : config.activeAiProvider;
      if (providerId === "auto" || providerId === "none") {
        printAiStatus(config);
        return;
      }
      const next = setAiProviderEnabled(projectRoot, providerId, true);
      console.log(`AI provider 활성화: ${providerId}`);
      printAiStatus(next);
      return;
    }
    case "mcp": {
      const config = syncHarnessConfigFromEnv(projectRoot);
      if (!args[0]) {
        printMcpStatus(config);
        return;
      }
      const serverId = parseMcpServerId(args[0]);
      const next = setMcpServerEnabled(projectRoot, serverId, true);
      console.log(`MCP server 활성화: ${serverId}`);
      printMcpStatus(next);
      return;
    }
    case "custom": {
      if (!args[0] || !args[1]) {
        throw new Error("usage: /setup custom <key> <value>");
      }
      const config = setHarnessConfigValue(projectRoot, args[0], args.slice(1).join(" "));
      console.log(`custom setting 저장: ${args[0]}`);
      printConfigSummary(config);
      return;
    }
    default:
      console.log("Setup 명령어: auto | detect | apply | check | ai [openai|anthropic|gemini|local] | mcp [notion|github|figma|stitch] | custom <key> <value>");
  }
}

async function printSetupAutoSummary(
  projectRoot: string,
  options: Record<string, string | boolean>
): Promise<void> {
  const config = createHarnessConfig(process.env, undefined, loadHarnessConfig(projectRoot));
  console.log(renderSetupGuide(config));
  console.log("");
  console.log("권장 순서: /setup detect -> /setup apply -> /setup check");
  if (optionBool(options, "live")) {
    console.log("auto --live: env 감지 결과를 적용한 뒤 live check까지 실행합니다.");
    const appliedConfig = syncHarnessConfigFromEnv(projectRoot);
    await runSetupChecks(projectRoot, appliedConfig);
    return;
  }
  console.log("대화형 연결 마법사로 값 입력까지 진행하려면 TTY에서 `/setup auto`를 실행하세요.");
  console.log("Live 검증까지 한 번에 하려면: /setup auto --live");
}

async function runSetupChecks(
  projectRoot: string,
  config: ReturnType<typeof loadHarnessConfig>
): Promise<void> {
  printConfigSummary(config);
  console.log("");
  console.log("Live connection check");
  const checks = [...await testAllAiConnections(config), ...await testAllMcpConnections(config)];
  if (checks.length === 0) {
    console.log("- 검사할 configured 연결이 없습니다. 먼저 /setup apply 또는 /setup auto를 실행하세요.");
    return;
  }
  const filePath = writeConnectionReport(projectRoot, checks);
  printConnectionChecks(checks);
  console.log(`report: ${filePath}`);
}

function shouldRunInteractiveSetup(options: Record<string, string | boolean>, context: CommandContext): boolean {
  if (optionBool(options, "guide") || optionBool(options, "status") || optionBool(options, "non-interactive")) {
    return false;
  }
  return optionBool(options, "from-env") || Boolean(context.prompter) || Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function runAutoSetupWizard(
  projectRoot: string,
  options: Record<string, string | boolean>,
  context: CommandContext
): Promise<void> {
  const fromEnv = optionBool(options, "from-env");
  await withSetupPrompter(context, fromEnv, async (prompter) => {
    console.log("RPH Setup Auto");
    console.log(fromEnv
      ? "AI agent와 MCP를 현재 shell env에서 읽어 fresh .env로 연결합니다."
      : "AI agent와 MCP를 실제로 연결합니다. Enter는 기본값/건너뛰기입니다.");
    console.log("secret 입력은 가능한 경우 화면에 표시하지 않고, RPH는 secret 값을 로그/설정 JSON에 다시 출력하지 않습니다.");
    console.log("");

    let config = syncHarnessConfigFromEnv(projectRoot);
    const selectedAi = await chooseAiProviders(prompter, config, options);
    const envValues: Record<string, string> = {};

    for (const providerId of selectedAi) {
      Object.assign(envValues, await collectAiEnvValues(prompter, providerId, fromEnv));
    }
    const selectedMcp = await chooseMcpServers(prompter, config, options, projectRoot);
    for (const serverId of selectedMcp) {
      Object.assign(envValues, await collectMcpEnvValues(prompter, serverId, projectRoot, fromEnv));
    }

    if (Object.keys(envValues).length > 0) {
      const result = upsertEnvFileValues(path.join(projectRoot, ".env"), envValues);
      Object.assign(process.env, envValues);
      const keys = [...new Set([...result.updatedKeys, ...result.appendedKeys])].sort();
      console.log("");
      console.log(`.env 저장 완료: ${keys.join(", ")}`);
    } else {
      console.log("");
      console.log(".env에 새로 저장할 값은 없습니다.");
    }

    loadEnvFile(path.join(projectRoot, ".env"));
    config = syncHarnessConfigFromEnv(projectRoot);
    for (const providerId of selectedAi) {
      config = setAiProviderEnabled(projectRoot, providerId, true);
    }
    if (selectedAi[0]) {
      config = setHarnessConfigValue(projectRoot, "ai.active", selectedAi[0]);
    }
    for (const serverId of selectedMcp) {
      config = setMcpServerEnabled(projectRoot, serverId, true);
    }
    config = syncHarnessConfigFromEnv(projectRoot);

    console.log("");
    console.log("연결 테스트");
    const checks = await runSelectedConnectionChecks(config, selectedAi, selectedMcp, optionBool(options, "live"));
    if (checks.length > 0) {
      const filePath = writeConnectionReport(projectRoot, checks);
      printConnectionChecks(checks);
      console.log(`report: ${filePath}`);
    } else {
      console.log("- 테스트할 연결이 아직 없습니다. AI provider 또는 MCP 값을 입력하면 자동 검증합니다.");
    }

    console.log("");
    console.log("최종 상태");
    console.log(renderSetupGuide(syncHarnessConfigFromEnv(projectRoot)));
  });
}

async function withSetupPrompter<T>(
  context: CommandContext,
  nonInteractive: boolean,
  callback: (prompter: SetupPrompter) => Promise<T>
): Promise<T> {
  if (context.prompter) {
    return callback(context.prompter);
  }
  if (nonInteractive) {
    return callback({ question: async () => "" });
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await callback({
      question: (query, options) => options?.secret ? askHiddenText(query) : rl.question(query)
    });
  } finally {
    rl.close();
  }
}

async function chooseAiProviders(
  prompter: SetupPrompter,
  config: ReturnType<typeof loadHarnessConfig>,
  options: Record<string, string | boolean>
): Promise<AiProviderId[]> {
  const optionValue = optionString(options, "ai") ?? optionString(options, "provider");
  if (optionValue) {
    return parseAiSelection(optionValue);
  }
  const defaultProvider = defaultAiProvider(config);
  console.log("1. AI agent 선택");
  console.log("  1 OpenAI/Codex");
  console.log("  2 Claude");
  console.log("  3 Gemini");
  console.log("  4 Local");
  console.log("  5 건너뛰기");
  console.log("  all 전체 검증");
  const answer = await askText(prompter, `AI provider`, defaultProvider);
  const selected = parseAiSelection(answer);
  if (selected.length > 0) {
    return selected;
  }
  return [];
}

function parseAiSelection(value: string): AiProviderId[] {
  const normalized = value.trim().toLowerCase();
  if (["5", "skip", "later", "none", "no", "n"].includes(normalized)) {
    return [];
  }
  if (normalized === "all") {
    return Object.keys(AI_PROVIDER_DEFINITIONS) as AiProviderId[];
  }
  if (normalized === "1" || normalized === "openai" || normalized === "codex") {
    return ["openai"];
  }
  if (normalized === "2" || normalized === "anthropic" || normalized === "claude") {
    return ["anthropic"];
  }
  if (normalized === "3" || normalized === "gemini" || normalized === "google") {
    return ["gemini"];
  }
  if (normalized === "4" || normalized === "local" || normalized === "ollama") {
    return ["local"];
  }
  const seen = new Set<AiProviderId>();
  for (const item of normalized.split(",").map((part: string) => part.trim()).filter(Boolean)) {
    seen.add(parseAiProviderId(item));
  }
  return [...seen];
}

async function chooseMcpServers(
  prompter: SetupPrompter,
  config: ReturnType<typeof loadHarnessConfig>,
  options: Record<string, string | boolean>,
  projectRoot: string
): Promise<McpServerId[]> {
  const optionValue = optionString(options, "mcp");
  if (optionValue) {
    return parseMcpSelection(optionValue);
  }
  const defaultServers = defaultMcpServers(config, projectRoot);
  console.log("");
  console.log("2. MCP 선택");
  console.log("  notion, github, figma, stitch 중 연결할 항목을 쉼표로 입력하세요.");
  console.log("  all = 전체, none = 건너뛰기");
  const answer = await askText(prompter, "MCP", defaultServers.join(","));
  return parseMcpSelection(answer);
}

async function collectAiEnvValues(
  prompter: SetupPrompter,
  providerId: AiProviderId,
  writeExistingEnv = false
): Promise<Record<string, string>> {
  const definition = AI_PROVIDER_DEFINITIONS[providerId];
  const values: Record<string, string> = {};
  console.log("");
  console.log(`AI 연결: ${definition.name}`);
  for (const key of definition.envKeys) {
    if (process.env[key]) {
      console.log(`- ${key}: 이미 설정됨`);
      if (writeExistingEnv) {
        values[key] = process.env[key] ?? "";
      }
      continue;
    }
    const answer = await askEnvValue(prompter, key, "");
    if (answer) {
      values[key] = answer;
    }
  }
  const currentModel = process.env[definition.modelEnv] || definition.defaultModel;
  const model = await askText(prompter, `${definition.modelEnv}`, currentModel);
  if (model && model !== process.env[definition.modelEnv]) {
    values[definition.modelEnv] = model;
  }
  if (providerId !== "local") {
    const currentBaseUrl = process.env[definition.baseUrlEnv] || definition.defaultBaseUrl;
    const baseUrl = await askText(prompter, `${definition.baseUrlEnv}`, currentBaseUrl);
    if (baseUrl && baseUrl !== definition.defaultBaseUrl && baseUrl !== process.env[definition.baseUrlEnv]) {
      values[definition.baseUrlEnv] = baseUrl;
    }
  }
  return values;
}

async function collectMcpEnvValues(
  prompter: SetupPrompter,
  serverId: McpServerId,
  projectRoot: string,
  writeExistingEnv = false
): Promise<Record<string, string>> {
  const definition = MCP_SERVER_DEFINITIONS[serverId];
  const values: Record<string, string> = {};
  const discovered = serverId === "github" ? discoverGitHubEnv(projectRoot) : {};
  console.log("");
  console.log(`MCP 연결: ${definition.name}`);
  for (const key of definition.envKeys) {
    if (process.env[key]) {
      console.log(`- ${key}: 이미 설정됨`);
      if (writeExistingEnv) {
        values[key] = process.env[key] ?? "";
      }
      continue;
    }
    const defaultValue = discovered[key] ?? "";
    if (defaultValue) {
      console.log(`- ${key}: 로컬 환경에서 기본값 감지`);
    }
    const answer = await askEnvValue(prompter, key, defaultValue);
    if (answer) {
      values[key] = answer;
    }
  }
  return values;
}

async function runSelectedConnectionChecks(
  config: ReturnType<typeof loadHarnessConfig>,
  selectedAi: AiProviderId[],
  selectedMcp: McpServerId[],
  includeAllConfigured: boolean
) {
  if (includeAllConfigured) {
    return [...await testAllAiConnections(config), ...await testAllMcpConnections(config)];
  }
  const checks = [];
  for (const providerId of selectedAi) {
    checks.push(await testAiConnection(config, providerId));
  }
  for (const serverId of selectedMcp) {
    checks.push(await testMcpConnection(config, serverId));
  }
  return checks;
}

async function askText(prompter: SetupPrompter, label: string, defaultValue: string): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  const answer = (await prompter.question(`${label}${suffix}: `)).trim();
  return answer || defaultValue;
}

async function askEnvValue(prompter: SetupPrompter, key: string, defaultValue: string): Promise<string> {
  const secret = isSecretEnvKey(key);
  const suffix = defaultValue
    ? ` (${secret ? "감지됨, Enter로 사용" : defaultValue})`
    : " (Enter로 건너뛰기)";
  const answer = (await prompter.question(`${key}${suffix}: `, { secret })).trim();
  return answer || defaultValue;
}

function isSecretEnvKey(key: string): boolean {
  return /(?:TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL)/i.test(key);
}

async function askHiddenText(query: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== "function") {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      return await rl.question(query);
    } finally {
      rl.close();
    }
  }
  return new Promise((resolve, reject) => {
    let value = "";
    const stdin = process.stdin;
    const stdout = process.stdout;
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    const finish = () => {
      cleanup();
      stdout.write("\n");
      resolve(value);
    };
    const onData = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      for (const char of text) {
        if (char === "\u0003") {
          cleanup();
          reject(new Error("setup cancelled"));
          return;
        }
        if (char === "\r" || char === "\n") {
          finish();
          return;
        }
        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    };
    stdout.write(query);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

function defaultAiProvider(config: ReturnType<typeof loadHarnessConfig>): string {
  if (config.activeAiProvider !== "auto" && config.activeAiProvider !== "none" && config.aiProviders[config.activeAiProvider]?.configured) {
    return config.activeAiProvider;
  }
  const configured = configuredAiProviders(config)[0]?.id;
  return configured ?? "openai";
}

function defaultMcpServers(config: ReturnType<typeof loadHarnessConfig>, projectRoot: string): McpServerId[] {
  const configured = configuredMcpServers(config).map((server) => server.id);
  if (configured.length > 0) {
    return configured;
  }
  const discovered = discoverGitHubEnv(projectRoot);
  return discovered.GITHUB_OWNER && discovered.GITHUB_REPO ? ["github", "notion"] : ["notion", "github"];
}

function parseMcpSelection(value: string): McpServerId[] {
  const normalized = value.trim().toLowerCase();
  if (!normalized || ["none", "skip", "later", "no", "n"].includes(normalized)) {
    return [];
  }
  if (normalized === "all") {
    return Object.keys(MCP_SERVER_DEFINITIONS) as McpServerId[];
  }
  const seen = new Set<McpServerId>();
  for (const item of normalized.split(",").map((part) => part.trim()).filter(Boolean)) {
    seen.add(parseMcpServerId(item));
  }
  return [...seen];
}

function discoverGitHubEnv(projectRoot: string): Record<string, string> {
  const values: Record<string, string> = {};
  const token = runCapture("gh", ["auth", "token"], projectRoot);
  if (token) {
    values.GITHUB_TOKEN = token;
  }
  const remote = runCapture("git", ["config", "--get", "remote.origin.url"], projectRoot);
  const parsed = remote ? parseGitHubRemote(remote) : null;
  if (parsed) {
    values.GITHUB_OWNER = parsed.owner;
    values.GITHUB_REPO = parsed.repo;
  }
  return values;
}

function runCapture(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (result.status !== 0) {
    return "";
  }
  return result.stdout.trim();
}

function handleSettings(projectRoot: string, subcommand: string | undefined, args: string[]): void {
  requireInitialized(projectRoot);
  switch (subcommand) {
    case undefined:
    case "show":
      printConfigSummary(loadHarnessConfig(projectRoot));
      return;
    case "sync":
      printConfigSummary(syncHarnessConfigFromEnv(projectRoot));
      return;
    case "set": {
      if (!args[0] || !args[1]) {
        throw new Error("usage: /settings set <key> <value>");
      }
      const config = setHarnessConfigValue(projectRoot, args[0], args.slice(1).join(" "));
      console.log(`setting 저장: ${args[0]}`);
      printConfigSummary(config);
      return;
    }
    default:
      console.log("Settings 명령어: show | sync | set <key> <value>");
  }
}

async function handleAi(
  projectRoot: string,
  subcommand: string | undefined,
  args: string[],
  options: Record<string, string | boolean>
): Promise<void> {
  requireInitialized(projectRoot);
  const config = syncHarnessConfigFromEnv(projectRoot);
  switch (subcommand) {
    case undefined:
    case "status":
      printAiStatus(config);
      return;
    case "enable": {
      const providerId = parseAiProviderId(args[0]);
      const next = setAiProviderEnabled(projectRoot, providerId, true);
      console.log(`AI provider 활성화: ${providerId}`);
      printAiStatus(next);
      return;
    }
    case "disable": {
      const providerId = parseAiProviderId(args[0]);
      const next = setAiProviderEnabled(projectRoot, providerId, false);
      console.log(`AI provider 비활성화: ${providerId}`);
      printAiStatus(next);
      return;
    }
    case "test": {
      const checks = args[0] ? [await testAiConnection(config, parseAiProviderId(args[0]))] : await testAllAiConnections(config);
      const filePath = writeConnectionReport(projectRoot, checks);
      printConnectionChecks(checks);
      console.log(`report: ${filePath}`);
      return;
    }
    case "run":
    case "prompt": {
      const prompt = optionString(options, "prompt") ?? args.join(" ");
      if (!prompt.trim()) {
        throw new Error("usage: /ai run --prompt <text> [--provider <provider>] [--max-tokens <n>]");
      }
      const provider = optionString(options, "provider");
      const result = await generateAiText(config, {
        providerId: provider ? parseAiProviderId(provider) : undefined,
        prompt,
        system: "You are Real Product Harness. Return concise, useful markdown without frontmatter.",
        maxOutputTokens: parseOptionalPositiveInt(optionString(options, "max-tokens"))
      });
      const recordPath = writeAiRunRecord(projectRoot, createAiRunRecord(result, "/ai run", prompt, {
        kind: "prompt",
        id: "ad-hoc"
      }));
      console.log(result.text);
      console.log(`ai_run: ${recordPath}`);
      return;
    }
    default:
      console.log("AI 명령어: status | enable <provider> | disable <provider> | test [provider] | run --prompt <text>");
  }
}

async function handleMcp(projectRoot: string, subcommand: string | undefined, args: string[]): Promise<void> {
  requireInitialized(projectRoot);
  const config = syncHarnessConfigFromEnv(projectRoot);
  switch (subcommand) {
    case undefined:
    case "status":
      printMcpStatus(config);
      return;
    case "enable": {
      const serverId = parseMcpServerId(args[0]);
      const next = setMcpServerEnabled(projectRoot, serverId, true);
      console.log(`MCP server 활성화: ${serverId}`);
      printMcpStatus(next);
      return;
    }
    case "disable": {
      const serverId = parseMcpServerId(args[0]);
      const next = setMcpServerEnabled(projectRoot, serverId, false);
      console.log(`MCP server 비활성화: ${serverId}`);
      printMcpStatus(next);
      return;
    }
    case "test": {
      const checks = args[0] ? [await testMcpConnection(config, parseMcpServerId(args[0]))] : await testAllMcpConnections(config);
      const filePath = writeConnectionReport(projectRoot, checks);
      printConnectionChecks(checks);
      console.log(`report: ${filePath}`);
      return;
    }
    default:
      console.log("MCP 명령어: status | enable <server> | disable <server> | test [server]");
  }
}

async function handleDoctor(projectRoot: string, options: Record<string, string | boolean>): Promise<void> {
  requireInitialized(projectRoot);
  const config = syncHarnessConfigFromEnv(projectRoot);
  console.log(renderStatusLine("runtime config loaded", "configured"));
  printConfigSummary(config);
  if (!optionBool(options, "live")) {
    console.log("live 연결 검사는 /doctor --live 또는 /ai test, /mcp test로 실행");
    return;
  }
  const checks = [...await testAllAiConnections(config), ...await testAllMcpConnections(config)];
  const filePath = writeConnectionReport(projectRoot, checks);
  printConnectionChecks(checks);
  console.log(`report: ${filePath}`);
}

function printConfigSummary(config: ReturnType<typeof loadHarnessConfig>): void {
  console.log("Runtime Settings");
  console.log(`- active_ai: ${config.activeAiProvider}`);
  console.log(`- configured_ai: ${configuredAiProviders(config).map((provider) => provider.id).join(", ") || "none"}`);
  console.log(`- configured_mcp: ${configuredMcpServers(config).map((server) => server.id).join(", ") || "none"}`);
  console.log(`- deployment: ${config.deployment}`);
  console.log(`- stack: ${config.stack}`);
  console.log(`- ui: ${config.ui.theme}, color=${config.ui.color}, boot=${config.ui.bootAnimation}`);
  printAiStatus(config);
  printMcpStatus(config);
}

function printAiStatus(config: ReturnType<typeof loadHarnessConfig>): void {
  console.log("AI Providers");
  for (const provider of Object.values(config.aiProviders)) {
    const status = provider.configured ? "configured" : "missing";
    const enabled = provider.enabled ? "enabled" : "disabled";
    const missing = provider.missingEnv.length > 0 ? ` missing=${provider.missingEnv.join(",")}` : "";
    console.log(`- ${renderStatusLine(provider.id, status)} ${enabled} model=${provider.model}${missing}`);
  }
}

function printMcpStatus(config: ReturnType<typeof loadHarnessConfig>): void {
  console.log("MCP Servers");
  for (const server of Object.values(config.mcpServers)) {
    const status = server.configured ? "configured" : "missing";
    const enabled = server.enabled ? "enabled" : "disabled";
    const missing = server.missingEnv.length > 0 ? ` missing=${server.missingEnv.join(",")}` : "";
    const target = server.url ?? server.command ?? "-";
    console.log(`- ${renderStatusLine(server.id, status)} ${enabled} ${server.transport} ${target}${missing}`);
  }
}

function printConnectionChecks(checks: Awaited<ReturnType<typeof testAllAiConnections>>): void {
  for (const check of checks) {
    const missing = check.missingEnv.length > 0 ? ` missing=${check.missingEnv.join(",")}` : "";
    const endpoint = check.endpoint ? ` endpoint=${check.endpoint}` : "";
    console.log(`- ${renderStatusLine(`${check.kind}:${check.id}`, check.status)} ${check.message}${missing}${endpoint}`);
  }
}

function parseAiProviderId(value: string | undefined): AiProviderId {
  if (value === "openai" || value === "anthropic" || value === "gemini" || value === "local") {
    return value;
  }
  throw new Error(`invalid AI provider: ${value ?? "(empty)"}. allowed: openai, anthropic, gemini, local`);
}

function parseMcpServerId(value: string | undefined): McpServerId {
  if (value === "notion" || value === "github" || value === "figma" || value === "stitch") {
    return value;
  }
  throw new Error(`invalid MCP server: ${value ?? "(empty)"}. allowed: notion, github, figma, stitch`);
}

async function handlePm(
  projectRoot: string,
  subcommand: string | undefined,
  args: string[],
  options: Record<string, string | boolean>
): Promise<void> {
  requireInitialized(projectRoot);
  switch (subcommand) {
    case "start":
      pmStart(projectRoot);
      return;
    case "interview":
      pmInterview(projectRoot, args[0]);
      return;
    case "draft":
      await pmDraft(projectRoot, args[0], options);
      return;
    case "revise":
      pmRevise(projectRoot, args[0], options);
      return;
    case "approve":
      pmApprove(projectRoot, args[0], optionString(options, "by") ?? "user");
      return;
    case "diff":
      pmDiff(projectRoot, args);
      return;
    case "rollback":
      pmRollback(projectRoot, args[0], options);
      return;
    case "finalize":
      pmFinalize(projectRoot);
      return;
    default:
      console.log("PM 명령어: start | interview | draft <docId> | revise <docId> | approve <docId> | finalize");
  }
}

function pmDiff(projectRoot: string, args: string[]): void {
  const docId = parseDocId(args[0]);
  if (!args[1] || !args[2]) {
    throw new Error("usage: /pm diff <docId> <fromVersion> <toVersion>");
  }
  console.log(diffDocumentVersions(projectRoot, docId, args[1], args[2]));
}

function pmRollback(projectRoot: string, docArg: string | undefined, options: Record<string, string | boolean>): void {
  const docId = parseDocId(docArg);
  const toVersion = optionString(options, "to");
  if (!toVersion) {
    throw new Error("usage: /pm rollback <docId> --to <version>");
  }
  const index = rollbackDocument(projectRoot, docId, toVersion);
  const state = syncStateDocuments(loadState(projectRoot), index);
  saveState(projectRoot, state);
  console.log(`PM 문서 롤백 버전 생성: ${docId} ${index.currentVersion}`);
}

function pmStart(projectRoot: string): void {
  const state = loadState(projectRoot);
  const next = state.currentStage === "SETUP"
    ? transitionState(state, "PM_PRODUCT_DEFINITION_INTERVIEW", "PM workflow started")
    : state;
  saveState(projectRoot, next);
  console.log("PM 워크플로우 시작");
  console.log("다음: /pm interview");
}

function pmInterview(projectRoot: string, docArg?: string): void {
  const docId = parseDocId(docArg ?? "product-definition");
  const session = createInterviewSession(projectRoot, docId);
  console.log(renderInterview(session));
}

async function pmDraft(projectRoot: string, docArg: string | undefined, options: Record<string, string | boolean>): Promise<void> {
  const docId = parseDocId(docArg ?? "product-definition");
  const body = await bodyFromOptions(projectRoot, options, {
    kind: "pm-document",
    id: docId,
    command: `/pm draft ${docId}`,
    prompt: buildDocumentPrompt(projectRoot, docId, optionString(options, "prompt"))
  });
  const prepared = preparePmDraftState(loadState(projectRoot), docId);
  const index = createDocumentVersion(projectRoot, docId, {
    changeSummary: optionString(options, "summary") ?? "Initial PM draft",
    body
  });
  const state = advanceAfterPmDraft(syncStateDocuments(prepared, index), docId);
  saveState(projectRoot, state);
  console.log(`문서 초안 생성: ${docId} ${index.currentVersion}`);
  if (optionBool(options, "ai")) {
    console.log("AI provider로 초안을 생성했습니다.");
  }
  console.log(`승인 전 다음 큰 단계 진행 금지: /pm approve ${docId}`);
}

function pmRevise(projectRoot: string, docArg: string | undefined, options: Record<string, string | boolean>): void {
  const docId = parseDocId(docArg ?? "product-definition");
  const fromVersion = optionString(options, "from");
  const fileBody = bodyFromFileOptions(options);
  const body = fileBody ?? stripFrontmatter(showDocument(projectRoot, docId, fromVersion));
  const index = createDocumentVersion(projectRoot, docId, {
    changeSummary: optionString(options, "summary") ?? `Revision from ${fromVersion ?? "current"}`,
    status: "revised",
    body
  });
  const state = syncStateDocuments(loadState(projectRoot), index);
  saveState(projectRoot, state);
  console.log(`문서 수정본 생성: ${docId} ${index.currentVersion}`);
  console.log(`검토 후 승인: /pm approve ${docId}`);
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
  console.log("다음: /status");
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
        throw new Error("usage: /docs diff <docId> <fromVersion> <toVersion>");
      }
      console.log(diffDocumentVersions(projectRoot, docId, args[1], args[2]));
      return;
    }
    case "rollback": {
      const docId = parseDocId(args[0]);
      const toVersion = optionString(options, "to");
      if (!toVersion) {
        throw new Error("usage: /docs rollback <docId> --to <version>");
      }
      const index = rollbackDocument(projectRoot, docId, toVersion);
      const state = syncStateDocuments(loadState(projectRoot), index);
      saveState(projectRoot, state);
      console.log(`롤백 버전 생성: ${docId} ${index.currentVersion}`);
      return;
    }
    case "approve": {
      const docId = parseDocId(args[0]);
      docsApprove(projectRoot, docId, optionString(options, "by") ?? "user");
      return;
    }
    case "export": {
      if (args[0] === "notion") {
        const result = createNotionSyncPayload(projectRoot);
        console.log(`Notion sync payload 생성: ${result.filePath}`);
        console.log(`documents: ${result.counts.documents}`);
        return;
      }
      if (args[0] !== "obsidian") {
        throw new Error("usage: /docs export <obsidian|notion> <docId> --path <vaultProjectPath>");
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
      console.log("Docs 명령어: list | show <docId> | diff <docId> <from> <to> | rollback <docId> --to <version> | approve <docId> | export obsidian <docId> --path <path> | export notion");
  }
}

function docsApprove(projectRoot: string, docId: DocumentId, approvedBy: string): void {
  if ([FE_SPEC_DOC, BE_SPEC_DOC, API_CONTRACT_DOC, FE_SPRINT_PLAN_DOC, BE_SPRINT_PLAN_DOC].includes(docId)) {
    engineeringApprove(projectRoot, docId, approvedBy);
    return;
  }
  const approval = approveDocument(projectRoot, docId, approvedBy);
  let state = loadState(projectRoot);
  state = syncStateDocuments(state, readDocumentIndex(projectRoot, docId));
  state = advanceAfterPmApproval(state, docId);
  saveState(projectRoot, state);
  console.log(`[승인 완료] ${approval.docId} ${approval.version}`);
  console.log(`승인자: ${approval.approvedBy}`);
}

async function handlePd(
  projectRoot: string,
  subcommand: string | undefined,
  args: string[],
  options: Record<string, string | boolean>
): Promise<void> {
  requireInitialized(projectRoot);
  switch (subcommand) {
    case "start":
      pdStart(projectRoot);
      return;
    case "references":
      await pdCreateArtifact(projectRoot, "references", options);
      return;
    case "directions":
    case "moodboards":
      await pdCreateArtifact(projectRoot, "directions", options);
      return;
    case "landing-preview":
      await pdCreateArtifact(projectRoot, "landing-preview", options);
      return;
    case "design-system":
      await pdCreateArtifact(projectRoot, "design-system", options);
      return;
    case "pages":
      await pdCreateArtifact(projectRoot, "page-designs", options);
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
    throw new Error("usage: /pd export obsidian <artifactId|all> --path <vaultProjectPath>");
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
  console.log("다음: /pd references");
}

async function pdCreateArtifact(
  projectRoot: string,
  artifactId: (typeof DESIGN_ARTIFACT_IDS)[number],
  options: Record<string, string | boolean>
): Promise<void> {
  const body = await bodyFromOptions(projectRoot, options, {
    kind: "pd-artifact",
    id: artifactId,
    command: `/pd ${artifactCommandName(artifactId)}`,
    prompt: buildDesignPrompt(projectRoot, artifactId, optionString(options, "prompt"))
  });
  const prepared = preparePdArtifactState(loadState(projectRoot), artifactId);
  const index = createDesignArtifactVersion(projectRoot, artifactId, {
    changeSummary: optionString(options, "summary") ?? "Initial PD draft",
    body
  });
  const state = syncStateDesignArtifacts(prepared, index);
  saveState(projectRoot, state);
  console.log(`PD 산출물 생성: ${artifactId} ${index.currentVersion}`);
  if (optionBool(options, "ai")) {
    console.log("AI provider로 PD 산출물을 생성했습니다.");
  }
  if (artifactId === "landing-preview") {
    console.log(`HTML fallback preview: ${createLandingPreviewHtml(projectRoot)}`);
  }
  console.log(`승인 전 다음 큰 단계 진행 금지: /pd approve ${artifactId}`);
}

function pdShow(projectRoot: string, artifactArg?: string, version?: string): void {
  const artifactId = parseDesignArtifactId(artifactArg);
  console.log(showDesignArtifact(projectRoot, artifactId, version));
}

function pdRevise(projectRoot: string, artifactArg: string | undefined, options: Record<string, string | boolean>): void {
  const artifactId = parseDesignArtifactId(artifactArg);
  const fromVersion = optionString(options, "from");
  const fileBody = bodyFromFileOptions(options);
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

async function handleFe(
  projectRoot: string,
  subcommand: string | undefined,
  args: string[],
  options: Record<string, string | boolean>
): Promise<void> {
  requireInitialized(projectRoot);
  switch (subcommand) {
    case "spec":
      await engineeringDraft(projectRoot, FE_SPEC_DOC, options);
      return;
    case "sprint-plan":
      await engineeringDraft(projectRoot, FE_SPRINT_PLAN_DOC, options);
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

async function handleBe(
  projectRoot: string,
  subcommand: string | undefined,
  args: string[],
  options: Record<string, string | boolean>
): Promise<void> {
  requireInitialized(projectRoot);
  switch (subcommand) {
    case "spec":
      await engineeringDraft(projectRoot, BE_SPEC_DOC, options);
      return;
    case "api-contract":
      await engineeringDraft(projectRoot, API_CONTRACT_DOC, options);
      return;
    case "sprint-plan":
      await engineeringDraft(projectRoot, BE_SPRINT_PLAN_DOC, options);
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

async function handleNotion(
  projectRoot: string,
  subcommand: string | undefined,
  options: Record<string, string | boolean>
): Promise<void> {
  requireInitialized(projectRoot);
  switch (subcommand) {
    case "plan":
    case "setup": {
      const result = createNotionWorkspacePlan(projectRoot);
      console.log(`Notion workspace plan 생성: ${result.files.length} files`);
      result.files.forEach((file) => console.log(`- ${file}`));
      console.log(`mode: ${result.plan.executionMode}`);
      if (optionBool(options, "live")) {
        const applied = await applyNotionWorkspacePlan(projectRoot, {
          title: optionString(options, "title")
        });
        console.log(`Notion live workspace 생성: ${applied.filePath}`);
        console.log(`dashboard: ${applied.workspace.dashboardUrl ?? applied.workspace.dashboardPageId}`);
        console.log(`databases: ${Object.keys(applied.workspace.databaseIds).length}`);
      } else {
        console.log("Notion MCP/API 쓰기는 /notion setup --live에서만 실행");
      }
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
      if (optionBool(options, "live")) {
        const synced = await syncNotionPayloadLive(projectRoot);
        console.log(`Notion live sync 완료: ${synced.synced} records summarized`);
      } else {
        console.log("Notion 반영은 /notion sync --live에서만 실행");
      }
      return;
    }
    default:
      console.log("Notion 명령어: plan | setup [--live] [--title <title>] | sync [--live] | export-docs");
  }
}

async function engineeringDraft(
  projectRoot: string,
  docId: DocumentId,
  options: Record<string, string | boolean>
): Promise<void> {
  const body = await bodyFromOptions(projectRoot, options, {
    kind: "engineering-document",
    id: docId,
    command: engineeringCommandForDoc(docId),
    prompt: buildEngineeringPrompt(projectRoot, docId, optionString(options, "prompt"))
  });
  const prepared = prepareEngineeringDocumentState(loadState(projectRoot), docId);
  const index = createEngineeringDocumentVersion(projectRoot, docId, {
    changeSummary: optionString(options, "summary") ?? "Initial engineering draft",
    body
  });
  const state = syncStateDocuments(prepared, index);
  saveState(projectRoot, state);
  console.log(`엔지니어링 문서 생성: ${docId} ${index.currentVersion}`);
  if (optionBool(options, "ai")) {
    console.log("AI provider로 엔지니어링 문서를 생성했습니다.");
  }
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
      return "/fe approve spec";
    case BE_SPEC_DOC:
      return "/be approve spec";
    case API_CONTRACT_DOC:
      return "/be approve api-contract";
    case FE_SPRINT_PLAN_DOC:
      return "/fe approve sprint-plan";
    case BE_SPRINT_PLAN_DOC:
      return "/be approve sprint-plan";
    default:
      return "/docs approve";
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
    case "setup-branches": {
      requireInitialized(projectRoot);
      const file = writeGitHubBranchPlan(projectRoot);
      console.log(`GitHub branch plan 생성: ${file}`);
      console.log("dev/release/main 브랜치 생성 및 병합은 사용자 승인 전 실행하지 않음");
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
        throw new Error("usage: /github release-plan --version <version>");
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
      console.log("GitHub 명령어: create-repo | setup-labels | setup-templates | setup-branches | create-issue | create-pr | sync | release-plan | hotfix-plan");
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

interface AiBodyRequest {
  kind: "pm-document" | "pd-artifact" | "engineering-document";
  id: string;
  command: string;
  prompt: string;
}

async function bodyFromOptions(
  projectRoot: string,
  options: Record<string, string | boolean>,
  request: AiBodyRequest
): Promise<string | undefined> {
  const fileBody = bodyFromFileOptions(options);
  if (fileBody && optionBool(options, "ai")) {
    throw new Error("--file and --ai cannot be used together");
  }
  if (fileBody) {
    return fileBody;
  }
  if (!optionBool(options, "ai")) {
    return undefined;
  }
  const provider = optionString(options, "provider");
  const config = syncHarnessConfigFromEnv(projectRoot);
  const result = await generateAiText(config, {
    providerId: provider ? parseAiProviderId(provider) : undefined,
    prompt: request.prompt,
    system: [
      "You are Real Product Harness, a role-separated product delivery agent runtime.",
      "Return only the requested markdown body. Do not include YAML frontmatter.",
      "Be concrete, implementation-ready, and preserve approval-gate wording where relevant.",
      "Use Korean by default unless the product context is clearly English."
    ].join(" "),
    maxOutputTokens: parseOptionalPositiveInt(optionString(options, "max-tokens")) ?? 2400
  });
  const recordPath = writeAiRunRecord(projectRoot, createAiRunRecord(result, request.command, request.prompt, {
    kind: request.kind,
    id: request.id
  }));
  console.log(`ai_run: ${recordPath}`);
  return sanitizeGeneratedMarkdown(result.text);
}

function bodyFromFileOptions(options: Record<string, string | boolean>): string | undefined {
  const filePath = optionString(options, "file");
  if (!filePath) {
    return undefined;
  }
  return fs.readFileSync(path.resolve(filePath), "utf8");
}

function buildDocumentPrompt(projectRoot: string, docId: DocumentId, extraInstruction?: string): string {
  return [
    artifactContext(projectRoot),
    "",
    `작업: PM Agent가 "${DOCUMENT_TITLES[docId]}" 문서를 완성한다.`,
    `문서 ID: ${docId}`,
    "요구사항:",
    "- 실제 제품 개발에 바로 쓸 수 있는 markdown 문서 본문을 작성한다.",
    "- TBD로 남기지 말고, 정보가 부족한 부분은 명확한 가정으로 채운다.",
    "- 승인 게이트를 고려해 범위, 제외 범위, 리스크, 다음 액션을 포함한다.",
    "- 출력은 markdown 본문만 반환한다.",
    extraInstruction ? `추가 지시: ${extraInstruction}` : ""
  ].filter(Boolean).join("\n");
}

function buildDesignPrompt(projectRoot: string, artifactId: DesignArtifactId, extraInstruction?: string): string {
  return [
    artifactContext(projectRoot),
    "",
    `작업: PD Agent가 "${DESIGN_ARTIFACT_TITLES[artifactId]}" 산출물을 완성한다.`,
    `산출물 ID: ${artifactId}`,
    "요구사항:",
    "- PM 산출물과 현재 단계에 맞는 디자인 산출물 markdown 본문을 작성한다.",
    "- 레퍼런스, 방향성, 토큰, 컴포넌트, 페이지 설계를 구체적으로 다룬다.",
    "- Figma/Stitch가 미설정이어도 HTML fallback으로 구현 가능한 수준으로 쓴다.",
    "- 출력은 markdown 본문만 반환한다.",
    extraInstruction ? `추가 지시: ${extraInstruction}` : ""
  ].filter(Boolean).join("\n");
}

function buildEngineeringPrompt(projectRoot: string, docId: DocumentId, extraInstruction?: string): string {
  return [
    artifactContext(projectRoot),
    "",
    `작업: ${engineeringOwnerForDoc(docId)} Agent가 "${DOCUMENT_TITLES[docId]}" 문서를 완성한다.`,
    `문서 ID: ${docId}`,
    "요구사항:",
    "- 실제 구현자가 바로 작업을 쪼갤 수 있는 markdown 본문을 작성한다.",
    "- 아키텍처, 데이터/상태, API, 테스트, 배포/운영 리스크를 필요한 만큼 포함한다.",
    "- 승인 전에는 큰 단계 진행 금지라는 workflow 원칙을 반영한다.",
    "- 출력은 markdown 본문만 반환한다.",
    extraInstruction ? `추가 지시: ${extraInstruction}` : ""
  ].filter(Boolean).join("\n");
}

function artifactContext(projectRoot: string): string {
  const project = loadProject(projectRoot);
  const state = loadState(projectRoot);
  const docs = listDocumentIndexes(projectRoot)
    .map((doc) => `${doc.docId}:${doc.status}:${doc.currentVersion}`)
    .join(", ") || "none";
  const designArtifacts = listDesignArtifactIndexes(projectRoot)
    .map((artifact) => `${artifact.artifactId}:${artifact.status}:${artifact.currentVersion}`)
    .join(", ") || "none";
  return [
    "프로젝트 컨텍스트:",
    `- product: ${project.name}`,
    `- stage: ${state.currentStage}`,
    `- documents: ${docs}`,
    `- design_artifacts: ${designArtifacts}`
  ].join("\n");
}

function sanitizeGeneratedMarkdown(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
  return (fenced ? fenced[1] : trimmed).trim();
}

function parseOptionalPositiveInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`expected positive integer, got: ${value}`);
  }
  return parsed;
}

function artifactCommandName(artifactId: DesignArtifactId): string {
  switch (artifactId) {
    case "references":
      return "references";
    case "directions":
      return "directions";
    case "landing-preview":
      return "landing-preview";
    case "design-system":
      return "design-system";
    case "page-designs":
      return "pages";
    default:
      return String(artifactId);
  }
}

function engineeringCommandForDoc(docId: DocumentId): string {
  switch (docId) {
    case FE_SPEC_DOC:
      return "/fe spec";
    case BE_SPEC_DOC:
      return "/be spec";
    case API_CONTRACT_DOC:
      return "/be api-contract";
    case FE_SPRINT_PLAN_DOC:
      return "/fe sprint-plan";
    case BE_SPRINT_PLAN_DOC:
      return "/be sprint-plan";
    default:
      return `/docs ${docId}`;
  }
}

function engineeringOwnerForDoc(docId: DocumentId): string {
  if (docId === FE_SPEC_DOC || docId === FE_SPRINT_PLAN_DOC) {
    return "FE";
  }
  if (docId === BE_SPEC_DOC || docId === API_CONTRACT_DOC || docId === BE_SPRINT_PLAN_DOC) {
    return "BE";
  }
  return "Engineering";
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
    return `/pm interview ${recommendedDoc(stage)}`;
  }
  if (stage.includes("DRAFT")) {
    return `/pm draft ${recommendedDoc(stage)}`;
  }
  if (stage === "PM_COMPETITOR_ANALYSIS") {
    return "/pm draft competitor-analysis";
  }
  if (stage === "PM_DIFFERENTIATION") {
    return "/pm draft differentiation";
  }
  if (stage.includes("REVIEW")) {
    return `/pm approve ${recommendedDoc(stage)}`;
  }
  if (stage === "PM_FEATURE_DEFINITION_APPROVED") {
    return "/pm finalize";
  }
  return "/status";
}

function recommendedAgentCommand(state: ProjectState): string {
  switch (state.currentStage) {
    case "SETUP":
      return "/pm start";
    case "PM_PRODUCT_DEFINITION_INTERVIEW":
      return "/pm draft product-definition";
    case "PM_REQUIREMENTS_INTERVIEW":
      return "/pm draft requirements";
    case "PM_SCREEN_DEFINITION_INTERVIEW":
      return "/pm draft screen-definition";
    case "PM_FEATURE_DEFINITION_INTERVIEW":
      return "/pm draft feature-definition";
    case "PM_COMPETITOR_ANALYSIS":
      return "/pm draft competitor-analysis";
    case "PM_DIFFERENTIATION":
      return "/pm draft differentiation";
    case "PM_PRODUCT_DEFINITION_REVIEW":
      return "/pm approve product-definition";
    case "PM_REQUIREMENTS_REVIEW":
      return "/pm approve requirements";
    case "PM_SCREEN_DEFINITION_REVIEW":
      return "/pm approve screen-definition";
    case "PM_FEATURE_DEFINITION_REVIEW":
      return "/pm approve feature-definition";
    case "PM_FEATURE_DEFINITION_APPROVED":
      return "/pm finalize";
    case "PM_APPROVED":
      return "/pd start";
    case "PD_REFERENCES":
      return "/pd references";
    case "PD_DIRECTIONS":
      return "/pd directions";
    case "PD_LANDING_PREVIEWS":
      return "/pd landing-preview";
    case "PD_DESIGN_SYSTEM":
      return "/pd design-system";
    case "PD_PAGE_DESIGNS":
      return "/pd pages";
    case "PD_REVIEW":
      return "/pd finalize";
    case "PD_APPROVED":
      return "/fe spec";
    case "FE_SPEC":
      return recommendedDocumentAction(state, FE_SPEC_DOC, "/fe spec", "/fe approve spec");
    case "BE_SPEC":
      if (state.documents[BE_SPEC_DOC]?.status !== "approved") {
        return recommendedDocumentAction(state, BE_SPEC_DOC, "/be spec", "/be approve spec");
      }
      return recommendedDocumentAction(state, API_CONTRACT_DOC, "/be api-contract", "/be approve api-contract");
    case "SPRINT_PLANNING":
      if (state.documents[FE_SPRINT_PLAN_DOC]?.status !== "approved") {
        return recommendedDocumentAction(state, FE_SPRINT_PLAN_DOC, "/fe sprint-plan", "/fe approve sprint-plan");
      }
      return recommendedDocumentAction(state, BE_SPRINT_PLAN_DOC, "/be sprint-plan", "/be approve sprint-plan");
    case "IMPLEMENTATION":
      return "/fe issue-create --title \"First FE task\"";
    default:
      return "/next";
  }
}

function recommendedEngineeringCommand(state: ProjectState): string | null {
  switch (state.currentStage) {
    case "PD_APPROVED":
      return "/fe spec";
    case "FE_SPEC":
      return recommendedDocumentAction(state, FE_SPEC_DOC, "/fe spec", "/fe approve spec");
    case "BE_SPEC":
      if (state.documents[BE_SPEC_DOC]?.status !== "approved") {
        return recommendedDocumentAction(state, BE_SPEC_DOC, "/be spec", "/be approve spec");
      }
      return recommendedDocumentAction(state, API_CONTRACT_DOC, "/be api-contract", "/be approve api-contract");
    case "SPRINT_PLANNING":
      if (state.documents[FE_SPRINT_PLAN_DOC]?.status !== "approved") {
        return recommendedDocumentAction(state, FE_SPRINT_PLAN_DOC, "/fe sprint-plan", "/fe approve sprint-plan");
      }
      return recommendedDocumentAction(state, BE_SPRINT_PLAN_DOC, "/be sprint-plan", "/be approve sprint-plan");
    case "IMPLEMENTATION":
      return "/fe issue-create --title \"First FE task\"";
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
  return "/status";
}

function recommendedPdCommand(state: ProjectState): string | null {
  switch (state.currentStage) {
    case "PM_APPROVED":
      return "/pd start";
    case "PD_REFERENCES":
      return recommendedDesignArtifactAction(state, "references", "/pd references");
    case "PD_DIRECTIONS":
      return recommendedDesignArtifactAction(state, "directions", "/pd directions");
    case "PD_LANDING_PREVIEWS":
      return recommendedDesignArtifactAction(state, "landing-preview", "/pd landing-preview");
    case "PD_DESIGN_SYSTEM":
      return recommendedDesignArtifactAction(state, "design-system", "/pd design-system");
    case "PD_PAGE_DESIGNS":
      return recommendedDesignArtifactAction(state, "page-designs", "/pd pages");
    case "PD_REVIEW":
      return "/pd finalize";
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
    return `/pd approve ${artifactId}`;
  }
  return "/status";
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
): Promise<{ projectName: string; obsidianPath?: string; setupChoices: SetupChoices }> {
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
    console.log("사용할 AI 에이전트 제공자를 선택하세요: 1 OpenAI/Codex, 2 Claude, 3 Gemini, 4 Local, 5 Mixed, 6 Later");
    const ai = (await rl.question("AI provider (6): ")).trim() || "6";
    console.log("배포 방식을 선택하세요: 1 Local, 2 Docker, 3 AWS, 4 GCP, 5 Vercel, 6 Render, 7 Fly.io, 8 Railway, 9 Custom, 10 Later");
    const deployment = (await rl.question("Deploy (10): ")).trim() || "10";
    console.log("기술 스택을 선택하세요: 1 Recommended, 2 Custom, 3 Analyze existing");
    const stack = (await rl.question("Stack (1): ")).trim() || "1";
    console.log("연결할 MCP를 입력하세요. 예: notion,github,figma 또는 later");
    const mcp = (await rl.question("MCP (notion,github): ")).trim() || "notion,github";
    return {
      projectName,
      obsidianPath: sync || defaultObsidianPath,
      setupChoices: {
        aiProvider: parseAiProvider(ai),
        deployment: parseDeploymentChoice(deployment),
        stack: parseStackChoice(stack),
        mcp: mcp === "later" ? [] : mcp.split(",").map((item) => item.trim()).filter(Boolean)
      }
    };
  } finally {
    rl.close();
  }
}

function parseAiProvider(value: string): SetupChoices["aiProvider"] {
  return {
    "1": "openai-codex",
    "2": "anthropic-claude",
    "3": "google-gemini",
    "4": "local-model",
    "5": "mixed",
    "6": "later"
  }[value] as SetupChoices["aiProvider"] ?? "later";
}

function parseDeploymentChoice(value: string): SetupChoices["deployment"] {
  return {
    "1": "local",
    "2": "docker",
    "3": "aws",
    "4": "gcp",
    "5": "vercel",
    "6": "render",
    "7": "fly",
    "8": "railway",
    "9": "custom",
    "10": "later"
  }[value] as SetupChoices["deployment"] ?? "later";
}

function parseStackChoice(value: string): SetupChoices["stack"] {
  return {
    "1": "recommended",
    "2": "custom",
    "3": "analyze-existing"
  }[value] as SetupChoices["stack"] ?? "recommended";
}

function printVersion(): void {
  console.log(`real-product-harness ${packageJson.version}`);
}

function printUnknownCommand(command: string): void {
  const suggestion = suggestCommand(command);
  console.error(`unknown command: ${command}`);
  if (suggestion) {
    console.error(`Did you mean: /${suggestion}`);
  }
  console.error("Try: /help");
  console.error("");
  console.error(renderGeneralHelp());
}

function printHelp(topic?: string): void {
  console.log(renderHelp(topic));
}

function renderHelp(topic?: string): string {
  const normalizedTopic = normalizeHelpTopic(topic);
  if (!normalizedTopic) {
    return renderGeneralHelp();
  }
  const topicLines = HELP_TOPIC_LINES[normalizedTopic];
  if (topicLines) {
    return topicLines.join("\n");
  }

  const suggestion = suggestCommand(normalizedTopic, Object.keys(HELP_TOPIC_LINES));
  return [
    `unknown help topic: ${normalizedTopic}`,
    suggestion ? `Try: help ${suggestion}` : "Available topics: runtime, setup, ai, mcp, pm, pd, fe, be, qa, notion, docs, github",
    "",
    renderGeneralHelp()
  ].join("\n");
}

function normalizeHelpTopic(topic?: string): string | undefined {
  if (!topic) {
    return undefined;
  }
  return topic.replace(/^\//, "").trim().toLowerCase() || undefined;
}

function renderGeneralHelp(): string {
  return [
    "real-product-harness",
    "",
    "Run `rph` to enter the runtime, then use slash commands.",
    "Inside runtime, plain text chats with the connected AI agent; slash commands control workflow state.",
    "One-shot form is also supported: rph /pm start",
    "",
    "Entry UX:",
    "  rph",
    "  rph help [topic]",
    "  rph version",
    "  rph --version",
    "",
    "Slash commands:",
    "  /init [--yes] [--project-name <name>] [--obsidian-vault <path>]",
    "  /status",
    "  /next",
    "  /pause | /resume | /cancel",
    "  /project <path>",
    "  /pwd",
    "  /exit",
    "  /agent status | clear",
    "  /chat status | clear",
    "  /setup auto [--live|--guide|--from-env|--non-interactive]",
    "  /setup detect | apply | check",
    "  /setup ai [openai|anthropic|gemini|local]",
    "  /setup mcp [notion|github|figma|stitch]",
    "  /settings show | sync | set <key> <value>",
    "  /ai status | test [provider] | enable <provider> | disable <provider> | run --prompt <text>",
    "  /mcp status | test [server] | enable <server> | disable <server>",
    "  /doctor [--live]",
    "  /pm start",
    "  /pm interview [docId]",
    "  /pm draft <docId> [--file <markdown>] [--ai] [--provider <provider>] [--summary <text>]",
    "  /pm revise <docId> [--from <version>] [--file <markdown>] [--summary <text>]",
    "  /pm approve <docId> [--by <name>]",
    "  /pm diff <docId> <fromVersion> <toVersion>",
    "  /pm rollback <docId> --to <version>",
    "  /pm finalize",
    "  /pd start",
    "  /pd references [--ai]",
    "  /pd directions [--ai]",
    "  /pd landing-preview [--ai]",
    "  /pd design-system [--ai]",
    "  /pd pages [--ai]",
    "  /pd show <artifactId> [version]",
    "  /pd revise <artifactId> [--from <version>] [--file <markdown>] [--summary <text>]",
    "  /pd approve <artifactId> [--by <name>]",
    "  /pd export obsidian <artifactId|all> --path <vaultProjectPath>",
    "  /pd finalize",
    "  /fe spec [--ai]",
    "  /fe approve <spec|sprint-plan> [--by <name>]",
    "  /fe sprint-plan [--ai]",
    "  /fe issue-create [--title <title>] [--label <label>]",
    "  /fe work --issue <number>",
    "  /fe pr --issue <number> [--target <dev|release|main>]",
    "  /be spec [--ai]",
    "  /be api-contract [--ai]",
    "  /be approve <spec|api-contract|sprint-plan> [--by <name>]",
    "  /be sprint-plan [--ai]",
    "  /be issue-create [--title <title>] [--label <label>]",
    "  /be work --issue <number>",
    "  /be deploy-dev [--provider <provider>]",
    "  /be pr --issue <number> [--target <dev|release|main>]",
    "  /qa review --pr <number>",
    "  /qa conflicts --pr <number>",
    "  /qa test --pr <number>",
    "  /qa report --pr <number>",
    "  /notion plan",
    "  /notion setup [--live] [--title <title>]",
    "  /notion sync [--live]",
    "  /docs list",
    "  /docs show <docId> [version]",
    "  /docs diff <docId> <fromVersion> <toVersion>",
    "  /docs rollback <docId> --to <version>",
    "  /docs approve <docId> [--by <name>]",
    "  /docs export obsidian <docId|all> --path <vaultProjectPath>",
    "  /docs export notion",
    "  /github create-repo",
    "  /github setup-labels",
    "  /github setup-templates",
    "  /github setup-branches",
    "  /github create-issue --agent <FE|BE> --title <title>",
    "  /github create-pr --issue <number>",
    "  /github sync",
    "  /github release-plan --version <version>",
    "  /github hotfix-plan --title <title>",
    "",
    "Topics: runtime, setup, ai, mcp, pm, pd, fe, be, qa, notion, docs, github",
    "",
    `Document IDs: ${DOCUMENT_IDS.map((docId) => `${docId}(${DOCUMENT_TITLES[docId]})`).join(", ")}`,
    `Design Artifact IDs: ${DESIGN_ARTIFACT_IDS.map((artifactId) => `${artifactId}(${DESIGN_ARTIFACT_TITLES[artifactId]})`).join(", ")}`
  ].join("\n");
}

if (typeof require !== "undefined" && require.main === module) {
  void main();
}
