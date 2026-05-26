#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import packageJson from "../../../package.json";
import {
  advanceAfterPmApproval,
  advanceAfterPmDraft,
  advanceAfterPdApproval,
  agentRoleContract,
  validateHandoffContract,
  applyNotionWorkspacePlan,
  approveDesignArtifact,
  approveDocument,
  approveEngineeringDocument,
  applyGitHubLabelsWithReadback,
  captureGitHubIssueApprovalSnapshot,
  captureGitHubPullRequestApprovalSnapshot,
  createGitHubIssueWithReadback,
  createGitHubPullRequestWithReadback,
  currentGitHubIssueApprovalSnapshot,
  currentGitHubPullRequestApprovalSnapshot,
  canFinalizePm,
  canFinalizePd,
  canTransition,
  createHarnessConfig,
  createDevDeploymentPlan,
  createDocumentVersion,
  createDesignArtifactVersion,
  createEngineeringDocumentVersion,
  createGitHubRepo,
  createInterviewSession,
  createLandingPreviewHtml,
  createNotionSyncPayload,
  consumeAgentLaneToolBudget,
  createNotionWorkspacePlan,
  createObsidianProject,
  createHotfixPlan,
  completeAgentLaneRun,
  createWorkExecutionRecord,
  executeAgentTurn,
  formatAiProviderFallback,
  createAiRunRecord,
  createAiChatTurnRecord,
  createPullRequestDraft,
  createQaReview,
  createReleasePlan,
  approveReleasePlan,
  createWorkIssue,
  runProductizeGoldenPath,
  callOperatorMcpTool,
  captureOperatorMcpToolCallSnapshot,
  currentOperatorMcpToolCallSnapshot,
  listOperatorMcpTools,
  runAgentFabricTool,
  checkQaConflicts,
  acknowledgeRuntimeHandoff,
  claimRuntimeHandoff,
  completeRuntimeHandoff,
  completeRuntimeHandoffAttempt,
  deadLetterRuntimeHandoff,
  ensureRuntimeSession,
  failRuntimeHandoffAttempt,
  DESIGN_ARTIFACT_IDS,
  DESIGN_ARTIFACT_TITLES,
  diffDocumentVersions,
  DOCUMENT_IDS,
  DOCUMENT_TITLES,
  DesignArtifactId,
  DocumentId,
  AiChatMessage,
  AiChatTurnRecord,
  AgentHandoffProposal,
  aiChatFile,
  approveAndStartRuntimeAction,
  activateCustomAgentProfile,
  activeCustomAgentExecutionProfile,
  bindCustomAgentProfile,
  appendText,
  classifyMutableAgentCommand,
  confirmRuntimeIntent,
  completeRuntimeAction,
  defaultAgentLibraryRoot,
  discoverAgentLibraryProfiles,
  exportDocumentToObsidian,
  exportDesignArtifactToObsidian,
  extractProductIdea,
  FE_SPEC_DOC,
  FE_SPRINT_PLAN_DOC,
  BE_SPEC_DOC,
  BE_SPRINT_PLAN_DOC,
  API_CONTRACT_DOC,
  GITHUB_ENV_KEYS,
  githubLabelsReadbackFile,
  githubCliBinary,
  githubIssueLatestReadbackFile,
  githubIssueReadbackFile,
  githubPullRequestLatestReadbackFile,
  githubPullRequestReadbackFile,
  githubRepoReadbackFile,
  initProject,
  checkGitHubCliWriteReadiness,
  isKnownTopLevelCommand,
  isDocumentId,
  AiProviderId,
  McpServerId,
  AgentToolCall,
  RuntimeSessionManifest,
  RuntimeActionApprovalRecord,
  RuntimeActionApprovedSnapshot,
  RuntimeActionReadbackProof,
  RuntimeIntentRecord,
  RuntimeExecutionGraph,
  RuntimeHandoffRecord,
  AgentLaneRunRecord,
  AgentExecutionProfileRef,
  listDocumentIndexes,
  listDesignArtifactIndexes,
  listPullRequests,
  listWorkIssues,
  loadHarnessConfig,
  latestAgentLaneRun,
  integrateAgentLaneBatch,
  importCustomAgentProfile,
  loadAgentLaneRuns,
  loadAgentLaneRunReadIssues,
  listAgentCatalog,
  listCustomAgentBindings,
  loadEnvFile,
  loadProject,
  loadRuntimeExecutionGraph,
  loadRuntimeHandoffs,
  loadRuntimeActionApprovals,
  loadRuntimeIntentJournal,
  loadRuntimeIntents,
  loadRuntimeSession,
  loadRuntimeSessionJournal,
  loadActiveCustomAgentProfile,
  loadState,
  mcpToolCallReadbackFile,
  notionLiveSyncReadbackFile,
  notionLiveWorkspaceFile,
  heartbeatAgentLaneRun,
  heartbeatRuntimeHandoff,
  latestRuntimeSessionJournalRecord,
  dismissRuntimeIntent,
  isRuntimeHandoffClaimable,
  isUserApprovalCommand,
  markIssueInProgress,
  linkPullRequestToGitHub,
  linkWorkIssueToGitHub,
  mergeAgentLaneRun,
  materializeRuntimeExecutionGraph,
  materializeRuntimeHandoffsFromSession,
  buildOperatorWorkspace,
  nextStage,
  optionBool,
  optionString,
  isAutonomousLocalCommand,
  OrchestrationAction,
  planOrchestrationAction,
  planAgentAction,
  parseCli,
  parseCommandLine,
  normalizeNotionPageId,
  normalizeGitHubRepoTarget,
  addCustomProtocolMcpServer,
  autoBindMcpReadOnlyToolContracts,
  bindMcpReadOnlyToolContracts,
  configuredAiProviders,
  configuredMcpServers,
  commandForWorkflowStage,
  connectionReportFile,
  prepareEngineeringDocumentState,
  preparePdArtifactState,
  preparePmDraftState,
  ProjectState,
  ProofLedgerEvent,
  readDocumentIndex,
  readDesignArtifactIndex,
  readPullRequest,
  readWorkIssue,
  readConnectionReport,
  readConnectionReportTrust,
  readHarnessConfigSnapshot,
  readLatestAiProviderOutcome,
  repairPersistedConfigDrift,
  readProofLedgerEvents,
  readProofLedgerLatest,
  readTrustedConnectionChecks,
  recordRuntimeHandoff,
  recordRuntimeActionApproval,
  recordRuntimeIntentApplied,
  recordRuntimeIntentBlocked,
  recordRuntimeIntent,
  recordLiveVerificationEvidence,
  recordRuntimeSessionEvent,
  reconcileRuntimeStageQueue,
  rejectRuntimeAction,
  replayRuntimeSession,
  runtimeActionReadbackBindingError,
  runtimeExecutionGraphFile,
  runtimeHandoffsFile,
  runtimeHandoffsReadIssue,
  runtimeHandoffExecutionToken,
  renderRuntimeHero,
  renderOperatorWorkspace,
  renderSetupGuide,
  renderStatusLine,
  renderInterview,
  runQaTests,
  runQaSecurityScan,
  runQaAccessibilityScan,
  finalizeQaReport,
  recordQaAccessibilityReview,
  recordQaSecurityReview,
  startAgentLaneRun,
  startRuntimeAction,
  startRuntimeHandoffWork,
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
  summarizeMcpPolicyForServer,
  syncStateDesignArtifacts,
  syncStateDocuments,
  syncHarnessConfigFromEnv,
  syncNotionPayloadLive,
  testAiConnection,
  testAllAiConnections,
  testAllMcpConnections,
  testMcpConnection,
  transitionState,
  failRuntimeAction,
  suggestCommand,
  unbindCustomAgentProfile,
  updateRuntimeSession,
  workflowAdvanceStatus,
  AI_PROVIDER_DEFINITIONS,
  MCP_SERVER_DEFINITIONS,
  upsertEnvFileValues,
  validateEnv,
  SetupChoices,
  Workstream,
  ConnectionCheck,
  ConnectionReportProvenance,
  AgentRole,
  HandoffPacket,
  WorkflowStageId,
  WorkflowTransitionContext,
  writeConnectionReport,
  writeAiRunRecord,
  writeAiChatTurnRecord,
  writeJson,
  runtimeIntentsJournalFile,
  runtimeSessionJournalFile,
  runtimeSessionSnapshotFile,
  WORKFLOW_STAGES,
  writeGitHubBranchPlan,
  writeGitHubTemplates
} from "../../../packages/core/src";

interface SetupPrompter {
  question(query: string, options?: { secret?: boolean }): Promise<string>;
}

interface CommandContext {
  prompter?: SetupPrompter;
  runtimeShell?: boolean;
}

type CommandSurface = "rph" | "slash";

function writeLiveConnectionReport(
  projectRoot: string,
  checks: ConnectionCheck[],
  provenance?: Partial<ConnectionReportProvenance>
): string {
  const filePath = writeConnectionReport(projectRoot, checks, provenance);
  const report = readConnectionReport(projectRoot);
  recordLiveVerificationEvidence(projectRoot, report?.checks ?? checks, filePath, {
    source: report?.provenance?.source,
    configFingerprint: report?.provenance?.configFingerprint,
    checkedAt: report?.provenance?.generatedAt ?? report?.checkedAt
  });
  return filePath;
}

function workflowTransitionContext(projectRoot: string, to: WorkflowStageId): WorkflowTransitionContext {
  if (to !== "RELEASE_REVIEW" && to !== "RELEASE_APPROVED") {
    return {};
  }
  const trust = readConnectionReportTrust(projectRoot);
  if (!trust.trusted) {
    return {
      liveVerificationTrusted: false,
      liveVerificationTrustReason: `latest live report not trusted (${trust.reason ?? "unknown"})`
    };
  }
  const checks = readTrustedConnectionChecks(projectRoot);
  const passedTargets = checks.filter((check) => check.status === "passed").map(formatConnectionTarget);
  const failedTargets = checks.filter((check) => check.status === "failed").map(formatConnectionTarget);
  const skippedTargets = checks.filter((check) => check.status === "skipped").map(formatConnectionTarget);
  if (failedTargets.length > 0) {
    return {
      liveVerificationTrusted: false,
      liveVerificationTrustReason: `latest live report has failed targets: ${failedTargets.join(",")}`
    };
  }
  if (skippedTargets.length > 0 || passedTargets.length === 0) {
    return {
      liveVerificationTrusted: false,
      liveVerificationTrustReason: skippedTargets.length > 0
        ? `latest live report has skipped targets: ${skippedTargets.join(",")}`
        : "latest live report has no passed targets"
    };
  }
  return { liveVerificationTrusted: true };
}

function formatConnectionTarget(check: ConnectionCheck): string {
  return `${check.kind}:${check.id}`;
}

const HERMES_OPERATOR_AGENT_PACK = [
  "workflow-orchestrator",
  "multi-agent-coordinator",
  "task-distributor",
  "product-manager",
  "cli-developer",
  "mcp-developer",
  "test-automator",
  "security-auditor",
  "risk-manager",
  "error-coordinator"
] as const;

const HELP_TOPIC_LINES: Record<string, string[]> = {
  home: [
    "Operator home",
    "",
    "  rph home",
    "  /home",
    "",
    "Shows the chat-first operator home: chat readiness, connector readiness, current work lane, proof freshness, approvals, and the one next action.",
    "Use --json when another tool needs the stable operator workspace snapshot."
  ],
  shell: [
    "Runtime shell",
    "",
    "  rph",
    "  rph shell",
    "  rph runtime",
    "  rph pm start",
    "  rph /pm start",
    "",
    "Starts the top-layer conversation runtime. Plain text goes to the connected AI agent; slash commands are explicit workflow controls.",
    "Use `rph pm start` or `rph /pm start` for one-shot PM kickoff without entering the runtime first.",
    "",
    "Typical flow:",
    "  /setup auto --live",
    "  다음에 뭐 하면 돼?",
    "  /status",
    "  /agent intents",
    "  /agent confirm-intent <id>",
    "  /exit",
    "",
    "Use `rph help runtime` for the full control surface."
  ],
  status: [
    "Status commands",
    "",
    "  rph status",
    "  rph status --verbose",
    "  rph status --json",
    "  /status",
    "  /status --verbose",
    "",
    "Shows the current workflow stage, next safe command, runtime graph digest, blockers, and connection/readiness proof.",
    "For conversation, enter `rph shell` and type plain text. Slash commands remain local control-plane actions."
  ],
  runtime: [
    "Runtime conversation",
    "",
    "Default mode is conversation with the connected AI agent.",
    "Slash commands are explicit workflow controls, like Codex or Claude Code slash commands.",
    "",
    "Talk:",
    "  rph",
    "  rph \"what should I do next?\"",
    "  rph 다음에 뭐 하면 돼?",
    "  rph ask <message>",
    "",
    "Reviewable plan cards:",
    "  rph ask \"이 아이디어를 MVP spec과 FE/BE 작업으로 만들어줘: ...\"",
    "  rph ask \"이 계획 실행해줘\"",
    "  /agent intents",
    "  /agent confirm-intent <id>",
    "  /agent dismiss-intent <id>",
    "",
    "Plain confirm only runs the last intent shown in this session. Use exact execution phrases such as `confirm` or `이 계획 실행해줘`; `이 계획 실행하고 가능한 데까지 계속해줘` confirms it and then runs the bounded safe local loop until the next approval gate. Question-shaped text like `confirm?` does not execute.",
    "",
    "Explicit execution mode:",
    "  rph ask --execute <message>",
    "  rph ask --execute --loop <message>",
    "  rph agent run --steps 5",
    "",
    "Setup-first entrypoint:",
    "  rph start",
    "",
    "Runtime slash controls:",
    "  /status",
    "  /workspace [--json]",
    "  /next",
    "  /pause | /resume | /cancel",
    "  /project <path> | /pwd",
    "  /chat status | clear",
    "  /agent status | roles | pack | import <toml> | use <name> | bind <name> --role <role> [--stage <stage>] | bindings | unbind --role <role> [--stage <stage>] | session | replay [session-id] | graph | handoffs | actions | intents | confirm-intent <id> | dismiss-intent <id> | lanes | workers | pool | run | recover [--steps N] | reduce <stage> | clear",
    "  /agent pool service install | status | uninstall | plist",
    "  /agent claim <handoff-id> | heartbeat <handoff-id> | dead-letter <handoff-id>",
    "  /agent approve-action <action-id> | reject-action <action-id>",
    "  /exit"
  ],
  agent: [
    "Agent commands",
    "",
    "  rph agent roles",
    "  rph agent pack",
    "  rph agent pack --activate workflow-orchestrator",
    "  rph agent discover [query]",
    "  rph agent import cli-developer",
    "  rph agent import /path/to/agent.toml",
    "  rph agent use cli-developer",
    "  rph agent bind product-manager --role PM",
    "  rph agent bind qa-expert --role QA --stage QA_REVIEW",
    "  rph agent bindings",
    "  /agent status",
    "  /agent roles",
    "  /agent pack",
    "  /agent discover cli",
    "  /agent import cli-developer",
    "  /agent use cli-developer",
    "  /agent bind product-manager --role PM",
    "  /agent bind qa-expert --role QA --stage QA_REVIEW",
    "  /agent bindings",
    "  /agent session [session-id] [--limit N]",
    "  /agent replay [session-id]",
    "  /agent graph [status|refresh|json] [--verbose]",
    "  /agent intents",
    "  /agent confirm-intent <id>",
    "  /agent dismiss-intent <id>",
    "  /agent handoffs | actions | intents | confirm-intent <id> | dismiss-intent <id> | lanes | workers | pool status | pool start | pool service install | pool service status | pool run | pool stop | run | recover [--steps N] | reduce <stage>",
    "",
    "Discovers Awesome Codex Subagents from ~/Desktop/awesome-codex-subagents/categories and imports selected TOML agents into the project-local .rph/agents catalog. `agent pack` installs a recommended Hermes-operator set in one command. The active custom agent guides chat by default; `agent bind` pins imported TOML agents to lane roles/stages. RPH approval gates and external-write policy still win."
  ],
  workspace: [
    "Workspace commands",
    "",
    "  rph workspace",
    "  rph workspace --json",
    "  rph workspace status --json",
    "  /workspace",
    "  /status --json",
    "",
    "Shows a read-only operator view of runtime status, readiness, approvals, artifacts, PR/QA blockers, proof counts, and the next safe action. It never approves, mutates, or crosses external-write gates."
  ],
  doctor: [
    "Doctor commands",
    "",
    "  rph doctor",
    "  rph doctor --live",
    "  rph doctor install",
    "  rph doctor shell",
    "  rph update",
    "",
    "`doctor install` checks whether the installed wrapper, source checkout, built CLI, init file, completion, and JSON operator commands are current. `doctor shell` checks slash-helper shell integration, including sourced helper entrypoints such as `/pm start`. `rph update` reruns the installer from the current source checkout and refuses to overwrite a dirty installed checkout."
  ],
  productize: [
    "Productize commands",
    "",
    "  rph /productize <product idea>",
    "  rph productize --idea <product idea>",
    "  rph \"이 아이디어를 MVP spec과 FE/BE 작업으로 만들어줘: <idea>\"",
    "  rph ask \"이 아이디어를 MVP spec과 FE/BE 작업으로 만들어줘: <idea>\"",
    "  rph ask --execute \"이 아이디어를 MVP spec과 FE/BE 작업으로 만들어줘: <idea>\"",
    "  rph ask --execute \"이 계획 실행하고 가능한 데까지 계속해줘\"",
    "  rph ask --execute --loop \"PM부터 승인 대기 전까지 진행해줘: <idea>\"",
    "",
    "Creates a review-ready package: PM docs, PD artifacts, FE/BE/API specs, sprint plans, FE/BE issues, PR drafts, QA reports, and a local deployment plan.",
    "External merge/deploy/write actions remain blocked until explicit user approval."
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
    "    Also accepts --deployment <local|docker|aws|gcp|vercel|render|fly|railway|custom|later>, --stack <recommended|custom|analyze-existing>, --theme <hacker|mono|minimal>.",
    "    Use --agent-pack to import the recommended Hermes operator TOML profiles during setup; add --activate-agent <name> to choose the active profile.",
    "    Use --customize with plain `rph setup auto` to force the custom settings questions.",
    "    GitHub can use an existing gh login without copying the gh token into project .env.",
    "  rph setup repair --live",
    "    Re-run only the failed AI/MCP checks from the latest live report, prompting for replacement values when possible.",
    "",
    "Shortcuts:",
    "  /setup ai [openai|anthropic|gemini|local]",
    "  /setup provider [openai|anthropic|gemini|local]",
    "  /setup mcp [notion|github|figma|stitch]",
    "  /setup mcp add <id> --url <https://host/mcp> [--auth bearer|x-goog-api-key|none] [--auth-env ENV] [--allow-tool tool.name,other.read] [--probe-tool name] [--probe-args-json '{}']",
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
    "  /mcp tools [server]",
    "  /mcp tools <server> --bind",
    "  /mcp tools <server> --agent",
    "  /mcp call <server> <tool> --read-only --args-json '{}' 또는 /mcp call <server>.<tool> --args-json '{}'",
    "  /mcp canary <server> <tool> --args-json '{}' --execute",
    "  /mcp test [server]",
    "  /mcp enable <server>",
    "  /mcp disable <server>",
    "  /setup mcp add <id> --url <https://host/mcp> [--allow-tool read.only.tool] [--probe-tool read.only.tool] [--live]",
    "",
    "--bind captures the current tools/list schema and annotations for the configured read-only allowlist. Bound tools are blocked if later tools/list metadata drifts.",
    "`mcp canary` captures a mutable tool snapshot, executes through the approval binding when --execute is present, and writes a sidecar readback proof."
  ],
  live: [
    "Live proof commands",
    "",
    "  rph live ai:openai",
    "  rph live ai:anthropic",
    "  rph live ai:gemini",
    "  rph live mcp:stitch",
    "  rph live target mcp:github",
    "  rph live audit [--strict] [--output <path>]",
    "",
    "Runtime slash form:",
    "  /live ai:openai",
    "  /live mcp:stitch",
    "  /live audit",
    "",
    "Runs one selected provider or connector through live setup/test, writes .rph/connections/latest.json, and exits non-zero when the target is not verified.",
    "live audit writes .rph/live-audit/latest.json and .md. Default audit mode exits zero while clearly reporting release_ready=no; --strict exits non-zero on release blockers."
  ],
  proofs: [
    "Proof ledger commands",
    "",
    "  /proofs status [--limit N]",
    "  /proofs events [--limit N]",
    "",
    "Shows the unified append-only evidence index across live checks, agent tool reads, external action readbacks, and lane merges."
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
    "  /qa security --pr <number> --auto",
    "  /qa security --pr <number> --status <clear|risk>",
    "  /qa accessibility --pr <number> --auto",
    "  /qa accessibility --pr <number> --status <clear|risk>",
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
    "  /github create-repo [--public|--private]",
    "  /github setup-labels",
    "  /github setup-templates",
    "  /github setup-branches",
    "  /github create-issue --agent <FE|BE> --title <title> [--live]",
    "  /github create-pr --issue <number> [--target <dev|release|main>] [--live]",
    "  /github sync",
    "  /github release-plan --version <version>",
    "  /github release-approve --id <release-id> [--by <name>]",
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
  const commandSuggestion = suggestCommand(parsed.command);
  if (
    !isKnownTopLevelCommand(parsed.command)
    && argv.length === 1
    && isLikelyBareCommandTypo(argv[0], commandSuggestion)
    && !argv[0].startsWith("/")
    && !argv[0].startsWith("-")
  ) {
    await runParsedCommand(cwd, parsed);
    return;
  }
  if (!isKnownTopLevelCommand(parsed.command) && argv.length > 0 && !argv[0].startsWith("/") && !argv[0].startsWith("-")) {
    await runParsedCommand(cwd, parseCli(["ask", ...argv]));
    return;
  }
  await runParsedCommand(cwd, parsed);
}

function isLikelyBareCommandTypo(input: string, suggestion?: string): boolean {
  const normalized = input.trim().toLowerCase();
  if (!suggestion || suggestion === "help" || !normalized) {
    return false;
  }
  return /^[a-z][a-z0-9_-]*$/.test(normalized);
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
      case "home":
        handleHome(projectRoot, parsed.options, context);
        break;
      case "start":
      case "go":
        await handleStart(projectRoot, parsed.args, parsed.options, context);
        break;
      case "shell":
      case "runtime":
        await runRuntimeShell(projectRoot);
        break;
      case "init":
        await handleInit(projectRoot, parsed.options);
        break;
      case "status":
        handleStatus(projectRoot, {
          commandSurface: context.runtimeShell ? "slash" : "rph",
          json: optionBool(parsed.options, "json"),
          verbose: optionBool(parsed.options, "verbose")
        });
        break;
      case "workspace":
        handleWorkspace(projectRoot, parsed.subcommand, parsed.options, context);
        break;
      case "next":
        await handleNext(projectRoot, parsed.options);
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
      case "chat":
        await handleAsk(projectRoot, [parsed.subcommand, ...parsed.args].filter((item): item is string => Boolean(item)), parsed.options);
        break;
      case "agent":
        await handleAgentControlCommand(projectRoot, parsed.subcommand, parsed.args, parsed.options, context);
        break;
      case "ai":
        await handleAi(projectRoot, parsed.subcommand, parsed.args, parsed.options);
        break;
      case "mcp":
        await handleMcp(projectRoot, parsed.subcommand, parsed.args, parsed.options);
        break;
      case "live":
        await handleLive(projectRoot, parsed.subcommand, parsed.args, parsed.options);
        break;
      case "proofs":
        handleProofs(projectRoot, parsed.subcommand, parsed.args, parsed.options);
        break;
      case "doctor":
        await handleDoctor(projectRoot, parsed.subcommand, parsed.args, parsed.options);
        break;
      case "update":
        handleUpdate(parsed.options);
        break;
      case "productize":
        handleProductize(projectRoot, parsed.subcommand, parsed.args, parsed.options);
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
    printRuntimeHomeCard(projectRoot, {
      reason: runtimeHomeReasonFromManifest(manifest),
      commandSurface: "slash"
    });
    printRuntimeDigest(projectRoot, manifest);
    if (manifest.status === "paused") {
      console.log("이전 runtime session이 일시정지 상태입니다. 계속하려면 /resume 을 입력하세요.");
    }
    if (manifest.status === "blocked" && manifest.blocker) {
      console.log(`이전 runtime session이 차단 상태입니다: ${manifest.blocker}`);
      console.log("문제를 해결한 뒤 /agent run 또는 다음 안전 명령으로 재개하세요.");
    }
    if (manifest.pendingAction?.command) {
      console.log(`pending action: ${manifest.pendingAction.command}`);
    }
    printRuntimeRecoveryBrief(projectRoot, manifest, { onlyWhenActionable: true });
  } else {
    printRuntimeHomeCard(projectRoot, {
      reason: "setup required before agent chat can run",
      commandSurface: "slash"
    });
    console.log("Fresh workspace.");
    console.log("next: /setup auto --live");
    console.log("fallback: /pm start");
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const setupPrompter = setupPrompterFromRuntimeReadline(rl);

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
        const control = await handleRuntimeControlCommand(projectRoot, line, setupPrompter);
        if (control.handled) {
          projectRoot = control.projectRoot;
          if (control.clearChat) {
            chatHistory.splice(0);
          }
          ok = true;
          continue;
        }

        if (!line.startsWith("/")) {
          ok = await handleRuntimeAgentInput(projectRoot, sessionId, chatHistory, line, setupPrompter);
          continue;
        }

        const parsed = parseCli(parseCommandLine(line));
        if (parsed.command === "init" && !optionBool(parsed.options, "yes")) {
          parsed.options.yes = true;
          console.log("runtime init은 비대화형 기본값으로 실행합니다. 필요한 값은 /init --project-name <name>처럼 넘기세요.");
        }
        ok = await runParsedCommand(projectRoot, parsed, false, { prompter: setupPrompter, runtimeShell: true });
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

async function handleRuntimeControlCommand(
  projectRoot: string,
  line: string,
  prompter?: SetupPrompter
): Promise<{ handled: true; projectRoot: string; clearChat?: boolean } | { handled: false; projectRoot: string }> {
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
    return handleRuntimeAgentCommand(projectRoot, target, rest, prompter);
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

async function handleRuntimeAgentCommand(
  projectRoot: string,
  subcommand: string | undefined,
  args: string[],
  prompter?: SetupPrompter
): Promise<{ handled: true; projectRoot: string; clearChat?: boolean }> {
  const result = await handleAgentControlCommand(projectRoot, subcommand, args, {
    ...parseRuntimeAgentOptions(args),
    commandSurface: "slash"
  }, prompter ? { prompter, runtimeShell: true } : undefined);
  return { handled: true, projectRoot, clearChat: result.clearChat };
}

async function handleAgentControlCommand(
  projectRoot: string,
  subcommand: string | undefined,
  args: string[],
  options: Record<string, string | boolean>,
  context: CommandContext = {}
): Promise<{ clearChat?: boolean }> {
  const config = loadRuntimeChatConfig(projectRoot);
  switch (subcommand) {
    case undefined:
    case "status":
      console.log(`AI agent: ${config.activeAiProvider}`);
      printActiveCustomAgent(projectRoot);
      printCustomAgentBindings(projectRoot);
      printAiStatus(config, projectRoot);
      if (printRuntimeHandoffsReadIssue(projectRoot)) {
        return {};
      }
      printRuntimeRecoveryBrief(projectRoot);
      printLatestAgentToolProof(projectRoot);
      printProofLedgerSummary(projectRoot, { compact: true });
      printRuntimeHandoffSummary(projectRoot);
      console.log("일반 텍스트를 입력하면 AI agent와 대화합니다. Slash command는 /pm start처럼 /로 시작합니다.");
      return {};
    case "roles":
    case "catalog":
      printAgentRoleCatalog(projectRoot);
      return {};
    case "pack":
    case "bootstrap":
    case "install-pack":
      importAgentPack(projectRoot, args, options);
      return {};
    case "discover":
    case "search":
      printAgentLibraryProfiles(args.join(" "), options);
      return {};
    case "import":
    case "install": {
      const sourcePath = args[0] ?? optionString(options, "path") ?? optionString(options, "file");
      if (!sourcePath) {
        console.log("usage: /agent import <agent-name|agent.toml>");
        console.log("try: /agent discover cli");
        process.exitCode = 2;
        return {};
      }
      ensureProjectForAgentCatalog(projectRoot);
      const profile = importCustomAgentProfile(projectRoot, sourcePath, { libraryRoot: agentLibraryRootFromOptions(options) });
      console.log(`agent imported: ${profile.name}`);
      console.log(`stored: .rph/agents/${profile.slug}.json`);
      console.log(`next: /agent use ${profile.slug}`);
      return {};
    }
    case "use":
    case "activate": {
      const name = args[0] ?? optionString(options, "name");
      if (!name) {
        console.log("usage: /agent use <agent-name>");
        process.exitCode = 2;
        return {};
      }
      const profile = activateCustomAgentProfile(projectRoot, name);
      console.log(`active custom agent: ${profile.name}`);
      console.log("scope: current project .rph/agents");
      console.log("policy: imported instructions guide chat, but RPH approval gates still win");
      return {};
    }
    case "bindings":
    case "bound":
      printCustomAgentBindings(projectRoot, { always: true });
      return {};
    case "bind": {
      const positional = runtimeAgentPositionalArgs(args);
      const name = positional[0] ?? optionString(options, "name") ?? optionString(options, "agent");
      if (!name) {
        console.log("usage: /agent bind <agent-name> --role <role> [--stage <stage>]");
        process.exitCode = 2;
        return {};
      }
      const selector = parseAgentBindingSelector(options);
      if (!selector.ok) {
        console.log(selector.error);
        console.log("usage: /agent bind <agent-name> --role <role> [--stage <stage>]");
        process.exitCode = 2;
        return {};
      }
      ensureProjectForAgentCatalog(projectRoot);
      const binding = bindCustomAgentProfile(projectRoot, name, selector.selector);
      console.log(`agent binding saved: ${formatAgentBinding(binding)}`);
      console.log("scope: lane execution profile resolution");
      console.log("precedence: role+stage > stage > role > active custom agent");
      return {};
    }
    case "unbind": {
      const selector = parseAgentBindingSelector(options);
      if (!selector.ok) {
        console.log(selector.error);
        console.log("usage: /agent unbind --role <role> [--stage <stage>]");
        process.exitCode = 2;
        return {};
      }
      const removed = unbindCustomAgentProfile(projectRoot, selector.selector);
      if (!removed) {
        console.log(`agent binding not found: ${formatAgentBindingSelector(selector.selector)}`);
        return {};
      }
      console.log(`agent binding removed: ${formatAgentBinding(removed)}`);
      return {};
    }
    case "session":
    case "journal":
      printRuntimeSessionJournal(projectRoot, args, options);
      return {};
    case "replay":
      printRuntimeSessionReplay(projectRoot, args, options);
      return {};
    case "handoffs":
      printRuntimeHandoffs(projectRoot, optionBool(options, "debug"));
      return {};
    case "actions":
    case "action-approvals":
      printRuntimeActionApprovals(projectRoot);
      return {};
    case "intents":
      printRuntimeIntents(projectRoot);
      return {};
    case "confirm-intent":
    case "run-intent": {
      const id = args[0];
      if (!id) {
        console.log("usage: /agent confirm-intent <intent-id> [--by <name>] [--force]");
        return {};
      }
      await confirmAndRunRuntimeIntent(projectRoot, id, {
        confirmedBy: optionString(options, "by") ?? "user",
        force: optionBool(options, "force"),
        commandContext: context
      });
      return {};
    }
    case "dismiss-intent": {
      const id = args[0];
      if (!id) {
        console.log("usage: /agent dismiss-intent <intent-id> [--reason <reason>] [--by <name>]");
        return {};
      }
      const record = dismissRuntimeIntent(
        projectRoot,
        id,
        optionString(options, "by") ?? "user",
        optionString(options, "reason") ?? "dismissed from runtime agent command"
      );
      console.log(`intent dismissed: ${record.id}`);
      console.log(`command: ${record.command}`);
      return {};
    }
    case "lanes":
      printRuntimeLaneRuns(projectRoot, optionBool(options, "debug"));
      return {};
    case "workers":
      printRuntimeWorkers(projectRoot, commandSurfaceFromOptions(options), optionBool(options, "debug"));
      return {};
    case "graph":
      handleAgentGraphCommand(projectRoot, args, options);
      return {};
    case "pool":
      await handleAgentPoolCommand(projectRoot, args, options);
      return {};
    case "run":
    case "continue":
      await handleAgentRun(projectRoot, options);
      return {};
    case "recover":
      await handleAgentRecover(projectRoot, options);
      return {};
    case "reduce":
      handleAgentReduce(projectRoot, args);
      return {};
    case "worker":
      if (printRuntimeHandoffsReadIssue(projectRoot)) {
        return {};
      }
      await handleAgentWorkerCommand(projectRoot, args, options);
      return {};
    case "ack":
    case "accept": {
      const id = args[0];
      if (!id) {
        console.log("usage: /agent ack <handoff-id>");
        return {};
      }
      if (printRuntimeHandoffsReadIssue(projectRoot)) {
        return {};
      }
      const record = acknowledgeRuntimeHandoff(projectRoot, id, "accepted from runtime agent command");
      console.log(`handoff acknowledged: ${record.id} -> ${record.packet.toAgent}`);
      if (record.packet.nextCommand) {
        console.log(`next command: ${record.packet.nextCommand}`);
      }
      return {};
    }
    case "claim": {
      const id = args[0];
      if (!id) {
        console.log("usage: /agent claim <handoff-id>");
        return {};
      }
      if (printRuntimeHandoffsReadIssue(projectRoot)) {
        return {};
      }
      const record = claimRuntimeHandoff(projectRoot, id, agentWorkerIdFromOptions(options), leaseMsFromOptions(options));
      console.log(`handoff claimed: ${record.id} by ${record.claimedBy}`);
      console.log(`lease expires: ${record.leaseExpiresAt}`);
      return {};
    }
    case "heartbeat": {
      const id = args[0];
      if (!id) {
        console.log("usage: /agent heartbeat <handoff-id>");
        return {};
      }
      if (printRuntimeHandoffsReadIssue(projectRoot)) {
        return {};
      }
      const current = loadRuntimeHandoffs(projectRoot).find((item) => item.id === id);
      if (!current) {
        console.log(`handoff not found: ${id}`);
        return {};
      }
      const record = heartbeatRuntimeHandoff(projectRoot, id, runtimeHandoffExecutionToken(current, current.laneRunId), leaseMsFromOptions(options));
      console.log(`handoff heartbeat: ${record.id} by ${record.claimedBy}`);
      console.log(`lease expires: ${record.leaseExpiresAt}`);
      return {};
    }
    case "complete": {
      const id = args[0];
      if (!id) {
        console.log("usage: /agent complete <handoff-id>");
        return {};
      }
      if (printRuntimeHandoffsReadIssue(projectRoot)) {
        return {};
      }
      const record = completeRuntimeHandoff(projectRoot, id, "completed from runtime agent command");
      console.log(`handoff completed: ${record.id}`);
      return {};
    }
    case "dead-letter": {
      const id = args[0];
      if (!id) {
        console.log("usage: /agent dead-letter <handoff-id> [--reason <reason>]");
        return {};
      }
      if (printRuntimeHandoffsReadIssue(projectRoot)) {
        return {};
      }
      const reason = optionString(options, "reason") ?? "manually dead-lettered";
      const record = deadLetterRuntimeHandoff(projectRoot, id, reason);
      console.log(`handoff dead-lettered: ${record.id}`);
      console.log(`reason: ${record.deadLetterReason}`);
      return {};
    }
    case "approve-action": {
      const id = args[0];
      if (!id) {
        console.log("usage: /agent approve-action <action-id> [--by <name>]");
        return {};
      }
      await approveAndExecuteRuntimeAction(projectRoot, id, optionString(options, "by") ?? "user");
      return {};
    }
    case "reject-action": {
      const id = args[0];
      if (!id) {
        console.log("usage: /agent reject-action <action-id> [--reason <reason>] [--by <name>]");
        return {};
      }
      const record = rejectRuntimeAction(
        projectRoot,
        id,
        optionString(options, "reason") ?? "rejected from runtime agent command",
        optionString(options, "by") ?? "user"
      );
      const sessionId = resolveRuntimeSessionId(projectRoot);
      updateRuntimeSession(projectRoot, sessionId, {
        pendingExternalActionId: null,
        blocker: null,
        note: `external action rejected: ${record.id}`
      });
      console.log(`external action rejected: ${record.id}`);
      console.log(`reason: ${record.rejectReason}`);
      return {};
    }
    case "clear":
    case "reset":
      console.log("AI chat context cleared");
      return { clearChat: true };
    default:
      console.log("Agent 명령어: /agent status | /agent roles | /agent pack [--activate name] | /agent discover [query] | /agent import <name|toml> | /agent use <name> | /agent bind <name> --role <role> [--stage <stage>] | /agent bindings | /agent unbind --role <role> [--stage <stage>] | /agent session [id] | /agent replay [id] | /agent graph [status|refresh|json] [--verbose] | /agent handoffs | /agent actions | /agent intents | /agent confirm-intent <id> | /agent dismiss-intent <id> | /agent lanes | /agent workers | /agent pool <status|start|run|stop|logs|service> | /agent run [--steps N] | /agent recover [--steps N] | /agent reduce <stage> | /agent worker run <id> | /agent claim <id> | /agent heartbeat <id> | /agent ack <id> | /agent complete <id> | /agent dead-letter <id> | /agent approve-action <id> | /agent reject-action <id> | /agent clear");
      return {};
  }
}

function agentLibraryRootFromOptions(options: Record<string, string | boolean>): string | undefined {
  return optionString(options, "library") ?? process.env.RPH_AGENT_LIBRARY ?? process.env.RPH_AGENT_LIBRARY_DIR;
}

function ensureProjectForAgentCatalog(projectRoot: string): void {
  if (isRuntimeProjectInitialized(projectRoot)) {
    return;
  }
  const projectName = path.basename(projectRoot) || "RPH Project";
  initProject(projectRoot, { projectName });
  console.log(`RPH project initialized: ${projectName}`);
}

function importAgentPack(
  projectRoot: string,
  args: string[],
  options: Record<string, string | boolean>
): void {
  ensureProjectForAgentCatalog(projectRoot);
  const positional = runtimeAgentPositionalArgs(args);
  const requested = positional.filter((value) => !["recommended", "default", "hermes", "hermes-operator"].includes(value));
  const names = requested.length > 0 ? requested : [...HERMES_OPERATOR_AGENT_PACK];
  const libraryRoot = agentLibraryRootFromOptions(options);
  const imported = names.map((name) => importCustomAgentProfile(projectRoot, name, { libraryRoot }));
  const activateName = optionString(options, "activate") ?? optionString(options, "use");

  console.log(`agent pack imported: ${requested.length > 0 ? "custom" : "hermes-operator"}`);
  console.log(`library: ${libraryRoot ?? defaultAgentLibraryRoot()}`);
  console.log(`profiles: ${imported.length}`);
  for (const profile of imported) {
    const model = profile.model ? ` model=${profile.model}` : "";
    const sandbox = profile.sandboxMode ? ` sandbox=${profile.sandboxMode}` : "";
    console.log(`- ${profile.slug}${model}${sandbox}`);
  }
  if (activateName) {
    const active = activateCustomAgentProfile(projectRoot, activateName);
    console.log(`active custom agent: ${active.name}`);
    console.log("policy: imported instructions guide chat, but RPH approval gates still win");
    return;
  }
  console.log("next: /agent use workflow-orchestrator");
  console.log("next: /agent roles");
}

function printActiveCustomAgent(projectRoot: string): void {
  const active = loadActiveCustomAgentProfile(projectRoot);
  console.log(`active custom agent: ${active ? active.name : "none"}`);
}

function printCustomAgentBindings(projectRoot: string, options: { always?: boolean } = {}): void {
  const bindings = listCustomAgentBindings(projectRoot);
  if (bindings.length === 0) {
    if (options.always) {
      console.log("Custom agent lane bindings");
      console.log("- none");
      console.log("next: /agent bind workflow-orchestrator --role Orchestrator");
    }
    return;
  }
  console.log("Custom agent lane bindings");
  for (const binding of bindings) {
    console.log(`- ${formatAgentBinding(binding)}`);
  }
}

function formatAgentBinding(binding: {
  role?: AgentRole;
  stage?: WorkflowStageId;
  profileName: string;
  profileSlug: string;
}): string {
  const role = binding.role ?? "*";
  const stage = binding.stage ?? "*";
  return `lane role=${role} stage=${stage} profile=${binding.profileSlug} (${binding.profileName})`;
}

function formatAgentBindingSelector(selector: { role?: AgentRole; stage?: WorkflowStageId }): string {
  return `lane role=${selector.role ?? "*"} stage=${selector.stage ?? "*"}`;
}

type AgentBindingSelectorParseResult =
  | { ok: true; selector: { role?: AgentRole; stage?: WorkflowStageId } }
  | { ok: false; error: string };

function parseAgentBindingSelector(options: Record<string, string | boolean>): AgentBindingSelectorParseResult {
  const roleValue = optionString(options, "role");
  const stageValue = optionString(options, "stage");
  const role = parseAgentRole(roleValue);
  const stage = parseWorkflowStageId(stageValue?.toUpperCase());
  if (roleValue && !role) {
    return { ok: false, error: `unknown agent role: ${roleValue}` };
  }
  if (stageValue && !stage) {
    return { ok: false, error: `unknown workflow stage: ${stageValue}` };
  }
  if (!role && !stage) {
    return { ok: false, error: "agent binding requires --role, --stage, or both" };
  }
  return { ok: true, selector: { role: role ?? undefined, stage: stage ?? undefined } };
}

function parseAgentRole(value: string | undefined): AgentRole | null {
  if (!value) {
    return null;
  }
  const roles: AgentRole[] = ["Orchestrator", "PM", "PD", "FE", "BE", "QA"];
  return roles.find((role) => role.toLowerCase() === value.toLowerCase()) ?? null;
}

function printAgentRoleCatalog(projectRoot: string): void {
  const catalog = listAgentCatalog(projectRoot);
  const builtIns = catalog.filter((entry) => entry.source === "built-in");
  const custom = catalog.filter((entry) => entry.source === "custom");
  console.log("Agent roles");
  console.log("Built-in lanes:");
  for (const entry of builtIns) {
    console.log(`- ${entry.name}: ${entry.description}`);
  }
  console.log("Custom TOML agents:");
  if (custom.length === 0) {
    console.log("- none");
    console.log("next: /agent discover");
    return;
  }
  for (const entry of custom) {
    const active = entry.active ? " active" : "";
    const model = entry.model ? ` model=${entry.model}` : "";
    const sandbox = entry.sandboxMode ? ` sandbox=${entry.sandboxMode}` : "";
    console.log(`- ${entry.name}${active}:${model}${sandbox} ${entry.description}`.trim());
  }
}

function printAgentLibraryProfiles(query: string, options: Record<string, string | boolean>): void {
  const libraryRoot = agentLibraryRootFromOptions(options);
  const profiles = discoverAgentLibraryProfiles({
    libraryRoot,
    query,
    limit: parseOptionalPositiveInt(optionString(options, "limit")) ?? 30
  });
  console.log("Awesome Codex Subagents");
  console.log(`library: ${libraryRoot ?? defaultAgentLibraryRoot()}`);
  if (query.trim()) {
    console.log(`query: ${query.trim()}`);
  }
  if (profiles.length === 0) {
    console.log("- none");
    console.log("next: /agent discover cli");
    return;
  }
  for (const profile of profiles) {
    const model = profile.model ? ` model=${profile.model}` : "";
    const sandbox = profile.sandboxMode ? ` sandbox=${profile.sandboxMode}` : "";
    console.log(`- ${profile.name} [${profile.category}]${model}${sandbox}`);
    console.log(`  ${profile.description}`);
    console.log(`  import: /agent import ${profile.slug}`);
  }
}

function printRuntimeSessionJournal(
  projectRoot: string,
  args: string[],
  options: Record<string, string | boolean>
): void {
  const current = loadRuntimeSession(projectRoot);
  const [requestedSessionId] = runtimeAgentPositionalArgs(args);
  const sessionId = requestedSessionId ?? optionString(options, "session") ?? current?.sessionId;
  if (!sessionId) {
    console.log("Runtime session journal");
    console.log("- session: none");
    console.log("next: rph start");
    return;
  }
  const records = loadRuntimeSessionJournal(projectRoot, sessionId);
  const latest = records[records.length - 1] ?? latestRuntimeSessionJournalRecord(projectRoot, sessionId);
  const limit = parseOptionalPositiveInt(optionString(options, "limit")) ?? 5;
  const intentRecords = runtimeIntentJournalForSession(projectRoot, sessionId);

  console.log("Runtime session journal");
  console.log(`- session: ${sessionId}`);
  console.log(`- journal: ${path.relative(projectRoot, runtimeSessionJournalFile(projectRoot, sessionId))}`);
  console.log(`- snapshot: ${path.relative(projectRoot, runtimeSessionSnapshotFile(projectRoot, sessionId))}`);
  console.log(`- entries: ${records.length}`);
  console.log(`- intent journal: ${path.relative(projectRoot, runtimeIntentsJournalFile(projectRoot))}`);
  console.log(`- intent entries: ${intentRecords.length}`);
  if (!latest) {
    console.log("- latest: none");
    return;
  }
  console.log(`- latest: #${latest.sequence} ${latest.status} stage=${latest.stage} owner=${latest.ownerAgent}`);
  if (latest.pendingActionCommand) {
    console.log(`- pending command: ${latest.pendingActionCommand}`);
  }
  if (latest.checkpoint) {
    console.log(`- checkpoint: ${latest.checkpoint}`);
  }
  if (latest.blocker) {
    console.log(`- blocker: ${latest.blocker}`);
  }
  const tail = records.slice(-limit);
  if (tail.length > 0) {
    console.log(`- tail (${tail.length}/${records.length}):`);
    for (const record of tail) {
      console.log(`  #${record.sequence} ${record.at} ${record.status} stage=${record.stage} history=${record.historyLength}`);
    }
  }
  const intentTail = intentRecords.slice(-limit);
  if (intentTail.length > 0) {
    console.log(`- intent tail (${intentTail.length}/${intentRecords.length}):`);
    for (const record of intentTail) {
      const detail = runtimeIntentJournalDetail(record);
      console.log(`  #${record.sequence} ${record.at} ${record.event} ${record.intentId} [${record.status}] ${record.risk} command=${record.command}${detail}`);
    }
  }
}

function printRuntimeSessionReplay(
  projectRoot: string,
  args: string[],
  options: Record<string, string | boolean>
): void {
  const current = loadRuntimeSession(projectRoot);
  const [requestedSessionId] = runtimeAgentPositionalArgs(args);
  const sessionId = requestedSessionId ?? optionString(options, "session") ?? current?.sessionId;
  if (!sessionId) {
    console.log("Runtime session replay");
    console.log("- session: none");
    console.log("next: rph start");
    return;
  }
  const replayed = replayRuntimeSession(projectRoot, sessionId);
  const records = loadRuntimeSessionJournal(projectRoot, sessionId);
  const intentRecords = runtimeIntentJournalForSession(projectRoot, sessionId);
  const pendingIntents = loadRuntimeIntents(projectRoot).filter((record) => record.status === "pending" && record.sessionId === sessionId);
  const limit = parseOptionalPositiveInt(optionString(options, "limit")) ?? 8;
  console.log("Runtime session replay");
  console.log(`- session: ${sessionId}`);
  console.log(`- entries: ${records.length}`);
  console.log(`- intent entries: ${intentRecords.length}`);
  if (pendingIntents.length > 0) {
    const next = pendingIntents[pendingIntents.length - 1];
    console.log(`- pending intents: ${pendingIntents.length}`);
    console.log(`- next intent: rph agent confirm-intent ${next.id}`);
  }
  if (!replayed) {
    console.log("- replay: unavailable");
    process.exitCode = 1;
    return;
  }
  console.log(`- replayed: ${replayed.status} stage=${replayed.stage} owner=${replayed.ownerAgent}`);
  if (replayed.lastCommand) {
    console.log(`- last command: ${replayed.lastCommand} ok=${replayed.lastCommandOk ?? "unknown"}`);
  }
  if (replayed.checkpoint) {
    console.log(`- checkpoint: ${replayed.checkpoint}`);
  }
  if (replayed.blocker) {
    console.log(`- blocker: ${replayed.blocker}`);
  }
  const tail = records.slice(-limit);
  const timeline = runtimeSessionTimeline(replayed, limit);
  if (timeline.length > 0) {
    console.log("Session timeline:");
    for (const item of timeline) {
      const status = item.ok === undefined ? "" : ` ok=${item.ok}`;
      console.log(`- ${item.at} ${item.kind}: ${item.message}${status}`);
    }
  }
  const intentTimeline = runtimeIntentTimeline(intentRecords, limit);
  if (intentTimeline.length > 0) {
    console.log("Runtime intent timeline:");
    for (const item of intentTimeline) {
      console.log(`- ${item.at} ${item.event}: ${item.intentId} [${item.status}] ${item.risk} ${item.command}${item.detail}`);
    }
  }
  if (tail.length > 0) {
    console.log("Replay snapshots:");
    for (const record of tail) {
      const command = record.pendingActionCommand ? ` command=${record.pendingActionCommand}` : "";
      console.log(`#${record.sequence} ${record.at} ${record.status} stage=${record.stage}${command}`);
    }
  }
}

function runtimeSessionTimeline(
  manifest: RuntimeSessionManifest,
  limit: number
): Array<{ at: string; kind: string; message: string; ok?: boolean }> {
  return manifest.history.slice(-limit).map((event) => ({
    at: event.at,
    kind: timelineEventLabel(event.kind),
    message: compactTimelineMessage(event.message),
    ok: event.ok
  }));
}

function runtimeIntentJournalForSession(projectRoot: string, sessionId: string) {
  return loadRuntimeIntentJournal(projectRoot).filter((record) => record.sessionId === sessionId);
}

function runtimeIntentTimeline(records: ReturnType<typeof loadRuntimeIntentJournal>, limit: number) {
  return records.slice(-limit).map((record) => ({
    at: record.at,
    event: record.event,
    intentId: record.intentId,
    status: record.status,
    risk: record.risk,
    command: compactTimelineMessage(record.command),
    detail: runtimeIntentJournalDetail(record)
  }));
}

function runtimeIntentJournalDetail(record: ReturnType<typeof loadRuntimeIntentJournal>[number]): string {
  if (record.blocker) {
    return ` blocker=${compactTimelineMessage(record.blocker, 80)}`;
  }
  if (record.outcomeKind) {
    return ` outcome=${record.outcomeKind}`;
  }
  return "";
}

function timelineEventLabel(kind: RuntimeSessionManifest["history"][number]["kind"]): string {
  switch (kind) {
    case "input":
      return "user";
    case "chat":
      return "agent";
    case "command":
      return "executed";
    case "blocker":
      return "blocked";
    default:
      return kind;
  }
}

function compactTimelineMessage(message: string, maxLength = 120): string {
  const compact = message.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 3)}...` : compact;
}

interface ReapedDeadWorkerLease {
  handoffId: string;
  laneRunId: string;
  workerPid: number;
  status: "requeued" | "dead-letter";
}

interface OrchestrationLoopResult {
  executed: number;
  blocker: string | null;
}

interface RuntimeWorkerLeaseView {
  handoff: RuntimeHandoffRecord;
  lane?: AgentLaneRunRecord;
  pidState: "alive" | "dead" | "unknown";
  health: "healthy" | "dead-worker" | "lease-expired" | "unknown-pid";
  claimable: boolean;
}

interface RuntimeWorkerPoolRecord {
  version: 1;
  poolId: string;
  status: "starting" | "running" | "stopping" | "stopped" | "failed";
  pid: number;
  pidStartedAt?: string;
  poolToken?: string;
  startedAt: string;
  updatedAt: string;
  heartbeatAt: string;
  stoppedAt?: string;
  stopRequestedAt?: string;
  stopReason?: string;
  stopMode?: "drain" | "force";
  forceRequestedAt?: string;
  mode?: "foreground" | "background" | "service";
  logPath?: string;
  concurrency: number;
  pollMs: number;
  idleMs: number;
  cycles: number;
  dispatched: number;
  lastActionAt?: string;
  lastBlocker?: string | null;
}

interface RuntimeWorkerSlotsRecord {
  version: 1;
  poolId: string;
  updatedAt: string;
  slots: RuntimeWorkerSlotRecord[];
}

interface RuntimeWorkerSlotRecord {
  slotId: string;
  slotIndex: number;
  status: "idle" | "running" | "completed" | "dead";
  updatedAt: string;
  lastTransitionAt: string;
  role?: AgentRole;
  stage?: WorkflowStageId;
  handoffId?: string;
  laneRunId?: string;
  workerId?: string;
  command?: string;
  attempt?: number;
  heartbeatAt?: string;
  leaseExpiresAt?: string;
  completedAt?: string;
  mergeStatus?: "pending" | "merged" | "blocked";
  failureDisposition?: "requeued" | "dead_letter";
  failureReason?: string;
  idleReason?: "available" | "pool-draining" | "no-claimable-handoff" | "waiting-on-active-leases";
}

async function handleAgentRecover(projectRoot: string, options: Record<string, string | boolean>): Promise<void> {
  if (!isRuntimeProjectInitialized(projectRoot)) {
    console.log("recovery: project is not initialized");
    return;
  }
  if (printRuntimeHandoffsReadIssue(projectRoot)) {
    return;
  }
  const session = loadRuntimeSession(projectRoot);
  if (!session) {
    console.log("recovery: no runtime session");
    return;
  }
  printReapedDeadWorkerLeases(reapDeadHandoffWorkerLeases(projectRoot));
  printIntegratedPendingLaneResults(integratePendingCompletedLaneResults(projectRoot), "recovery");
  const maxSteps = recoveryMaxSteps(options);
  const executedCommands = new Set<string>();
  for (let step = 1; step <= maxSteps; step += 1) {
    const current = loadRuntimeSession(projectRoot) ?? session;
    const recovery = runtimeRecoveryState(projectRoot, current);
    printRuntimeRecoveryBrief(projectRoot, current);
    if (!recovery.actionable) {
      finishRecoveryIfIdle(projectRoot, current);
      return;
    }
    const command = recovery.nextCommand;
    if (!isSafeRecoveryCommand(command)) {
      updateRuntimeSession(projectRoot, current.sessionId, {
        status: "blocked",
        blocker: `recovery requires explicit action: ${command}`,
        note: `recovery blocked before ${command}`
      });
      console.log(`recovery blocked: explicit action required before ${command}`);
      return;
    }
    if (executedCommands.has(command)) {
      console.log(`recovery paused: next action unchanged after ${command}`);
      return;
    }
    executedCommands.add(command);
    updateRuntimeSession(projectRoot, current.sessionId, {
      status: "recovering",
      checkpoint: `recovery step ${step}: ${command}`,
      blocker: null,
      note: `recovery action: ${command}`
    });
    console.log(`recovery step ${step}/${maxSteps}`);
    console.log(`recovery action: ${command}`);
    const ok = await runParsedCommand(projectRoot, parseCli(parseCommandLine(command)), false);
    if (!ok) {
      updateRuntimeSession(projectRoot, current.sessionId, {
        status: "blocked",
        blocker: `recovery command failed: ${command}`,
        note: `recovery failed after ${command}`
      });
      process.exitCode = 1;
      return;
    }
    const next = loadRuntimeSession(projectRoot);
    if (!next) {
      return;
    }
    const nextRecovery = runtimeRecoveryState(projectRoot, next);
    if (!nextRecovery.actionable) {
      finishRecoveryIfIdle(projectRoot, next);
      return;
    }
    if (nextRecovery.nextCommand === command) {
      printRuntimeRecoveryBrief(projectRoot, next);
      console.log(`recovery paused: next action unchanged after ${command}`);
      return;
    }
  }
  const current = loadRuntimeSession(projectRoot) ?? session;
  const recovery = runtimeRecoveryState(projectRoot, current);
  if (recovery.actionable) {
    console.log(`recovery paused: step limit reached (${maxSteps})`);
    console.log(`next safe command: ${recovery.nextCommand}`);
    return;
  }
  finishRecoveryIfIdle(projectRoot, current);
}

function recoveryMaxSteps(options: Record<string, string | boolean>): number {
  return Math.min(parseOptionalPositiveInt(optionString(options, "steps")) ?? 3, 10);
}

function finishRecoveryIfIdle(projectRoot: string, session: RuntimeSessionManifest): void {
  if (session.status === "recovering") {
    updateRuntimeSession(projectRoot, session.sessionId, {
      status: "active",
      blocker: null,
      note: "recovery complete"
    });
  }
  console.log("recovery complete: no pending recovery action");
}

function reapDeadHandoffWorkerLeases(projectRoot: string, now = new Date()): ReapedDeadWorkerLease[] {
  const lanesById = new Map(loadAgentLaneRuns(projectRoot).map((lane) => [lane.id, lane]));
  const reaped: ReapedDeadWorkerLease[] = [];
  for (const handoff of loadRuntimeHandoffs(projectRoot)) {
    if ((handoff.status !== "claimed" && handoff.status !== "running") || !handoff.laneRunId) {
      continue;
    }
    const lane = lanesById.get(handoff.laneRunId);
    if (!lane || (lane.status !== "claimed" && lane.status !== "running") || !lane.workerPid || processIsAlive(lane.workerPid)) {
      continue;
    }
    const reason = `worker process is not alive: pid ${lane.workerPid}`;
    const token = runtimeHandoffExecutionToken(handoff, lane.id);
    const next = failRuntimeHandoffAttempt(projectRoot, handoff.id, token, reason, now);
    completeAgentLaneRun(projectRoot, lane.id, {
      ok: false,
      error: reason,
      executionMode: lane.executionMode ?? "command",
      autonomousTurnId: lane.autonomousTurnId,
      proposedCommand: lane.proposedCommand,
      executedCommand: lane.executedCommand
    });
    reaped.push({
      handoffId: handoff.id,
      laneRunId: lane.id,
      workerPid: lane.workerPid,
      status: next.status === "dead_letter" ? "dead-letter" : "requeued"
    });
    refreshRuntimeWorkerSlots(projectRoot, lane.poolId, undefined, "available");
  }
  return reaped;
}

function printReapedDeadWorkerLeases(reaped: ReapedDeadWorkerLease[]): void {
  for (const item of reaped) {
    console.log(`reaped dead worker lease: ${item.handoffId} lane=${item.laneRunId} pid=${item.workerPid} -> ${item.status}`);
  }
}

function pendingCompletedLaneRuns(projectRoot: string): AgentLaneRunRecord[] {
  return loadAgentLaneRuns(projectRoot).filter((run) => {
    return run.status === "completed"
      && run.exitOk === true
      && run.merge?.status !== "merged";
  });
}

function runtimeWorkerPoolActiveWorkSummary(projectRoot: string): string | null {
  const activeHandoffs = loadRuntimeHandoffs(projectRoot).filter((handoff) => handoff.status === "claimed" || handoff.status === "running");
  const activeLanes = loadAgentLaneRuns(projectRoot).filter((lane) => lane.status === "claimed" || lane.status === "running");
  const pendingMerge = pendingCompletedLaneRuns(projectRoot);
  const blockers: string[] = [];
  if (activeHandoffs.length > 0) {
    blockers.push(`active handoffs=${activeHandoffs.length}`);
  }
  if (activeLanes.length > 0) {
    blockers.push(`active lanes=${activeLanes.length}`);
  }
  if (pendingMerge.length > 0) {
    blockers.push(`pending merges=${pendingMerge.length}`);
  }
  return blockers.length > 0 ? blockers.join(" ") : null;
}

function integratePendingCompletedLaneResults(projectRoot: string): ReturnType<typeof integrateAgentLaneBatch> | null {
  const runIds = pendingCompletedLaneRuns(projectRoot).map((run) => run.id);
  if (runIds.length === 0) {
    return null;
  }
  return integrateAgentLaneBatch(projectRoot, runIds, "reattached completed worker lane result(s)");
}

function printIntegratedPendingLaneResults(
  integration: ReturnType<typeof integrateAgentLaneBatch> | null,
  source: "orchestration" | "recovery"
): void {
  if (!integration) {
    return;
  }
  console.log(`integrator: ${integration.status} ${integration.mergedRunIds.length}/${integration.runIds.length} pending lane result(s) reattached during ${source}`);
  if (integration.failedRunIds.length > 0) {
    console.log(`integrator failed lanes: ${integration.failedRunIds.join(", ")}`);
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return Boolean(error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === "EPERM");
  }
}

function readProcessStartedAt(pid: number): string | null {
  const result = spawnSync("ps", ["-p", String(pid), "-o", "lstart="], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (result.status !== 0) {
    return null;
  }
  const value = result.stdout.trim().replace(/\s+/g, " ");
  return value || null;
}

function isSafeRecoveryCommand(command: string): boolean {
  if (classifyMutableAgentCommand(command) || isUserApprovalAgentCommand(command)) {
    return false;
  }
  try {
    const parsed = parseCli(parseCommandLine(command));
    if (parsed.command === "resume" || parsed.command === "status") {
      return true;
    }
    if (parsed.command !== "agent") {
      return false;
    }
    return ["run", "continue", "status", "handoffs", "actions", "intents", "lanes"].includes(parsed.subcommand ?? "status");
  } catch {
    return false;
  }
}

async function handleAgentWorkerCommand(
  projectRoot: string,
  args: string[],
  options: Record<string, string | boolean>
): Promise<void> {
  const action = args[0];
  const id = args[1];
  if (action !== "run" || !id) {
    console.log("usage: /agent worker run <handoff-id> [--worker-id <id>] [--lease-ms <ms>]");
    process.exitCode = 2;
    return;
  }
  const ok = await runHandoffWorker(projectRoot, id, agentWorkerIdFromOptions(options), leaseMsFromOptions(options), {
    laneMaxToolCalls: parseOptionalNonNegativeInt(optionString(options, "max-tool-calls")),
    debug: optionBool(options, "debug")
  });
  if (!ok) {
    process.exitCode = 1;
  }
}

function handleAgentReduce(projectRoot: string, args: string[]): void {
  requireInitialized(projectRoot);
  const stage = parseWorkflowStageId(args[0]);
  if (!stage) {
    console.log("usage: /agent reduce <fan-in-stage>");
    process.exitCode = 2;
    return;
  }
  const session = loadRuntimeSession(projectRoot) ?? ensureRuntimeSession(projectRoot, resolveRuntimeSessionId(projectRoot));
  const reconciled = reconcileRuntimeStageQueue(projectRoot, session);
  const entry = reconciled?.stageQueue?.find((item) => item.stage === stage);
  if (!entry || entry.nodeType !== "fan-in") {
    console.log(`fan-in reducer blocked: ${stage} is not a fan-in queue node`);
    process.exitCode = 1;
    return;
  }
  if (entry.fanIn?.reducerStatus !== "ready" || entry.blockers.length > 0) {
    console.log(`fan-in reducer blocked: ${stage} status=${entry.status} reducer=${entry.fanIn?.reducerStatus ?? "none"}`);
    for (const prerequisite of entry.fanIn?.pendingPrerequisites ?? []) {
      console.log(`- pending prerequisite: ${prerequisite}`);
    }
    for (const blocker of entry.blockers) {
      console.log(`- ${blocker}`);
    }
    process.exitCode = 1;
    return;
  }
  const state = loadState(projectRoot);
  const transitionContext = workflowTransitionContext(projectRoot, stage);
  const check = canTransition(state, stage, transitionContext);
  if (!check.ok) {
    console.log(`fan-in reducer blocked: ${state.currentStage} -> ${stage}`);
    check.reasons.forEach((reason) => console.log(`- ${reason}`));
    process.exitCode = 1;
    return;
  }
  const updated = transitionState(state, stage, `fan-in reducer accepted ${entry.fanIn.readyPrerequisites.join(" + ")}`, transitionContext);
  saveState(projectRoot, updated);
  const activeSession = reconciled ?? session;
  if (activeSession && isContinuableRuntimeManifestStatus(activeSession.status)) {
    updateRuntimeSession(projectRoot, activeSession.sessionId, {
      status: "active",
      stage,
      blocker: null,
      checkpoint: `fan-in reducer advanced to ${stage}`,
      note: `fan-in reducer accepted ${entry.fanIn.readyPrerequisites.join(" + ")}`
    });
    reconcileRuntimeStageQueue(projectRoot, loadRuntimeSession(projectRoot));
  }
  console.log(`fan-in reducer complete: ${state.currentStage} -> ${stage}`);
  console.log(`sources: ${entry.fanIn.readyPrerequisites.join(", ")}`);
  console.log(`next command: ${recommendedAgentCommand(updated)}`);
}

function parseWorkflowStageId(value: string | undefined): WorkflowStageId | null {
  if (!value || !Object.prototype.hasOwnProperty.call(WORKFLOW_STAGES, value)) {
    return null;
  }
  return value as WorkflowStageId;
}

function parseRuntimeAgentOptions(args: string[]): Record<string, string | boolean> {
  const options: Record<string, string | boolean> = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--steps") {
      const value = args[index + 1];
      if (value) {
        options.steps = value;
        index += 1;
      }
    } else if (token === "--reason") {
      const value = args[index + 1];
      if (value) {
        options.reason = value;
        index += 1;
      }
    } else if (token === "--worker-id") {
      const value = args[index + 1];
      if (value) {
        options["worker-id"] = value;
        index += 1;
      }
    } else if (token === "--lease-ms") {
      const value = args[index + 1];
      if (value) {
        options["lease-ms"] = value;
        index += 1;
      }
    } else if (token === "--concurrency") {
      const value = args[index + 1];
      if (value) {
        options.concurrency = value;
        index += 1;
      }
    } else if (token === "--poll-ms") {
      const value = args[index + 1];
      if (value) {
        options["poll-ms"] = value;
        index += 1;
      }
    } else if (token === "--idle-ms") {
      const value = args[index + 1];
      if (value) {
        options["idle-ms"] = value;
        index += 1;
      }
    } else if (token === "--log") {
      const value = args[index + 1];
      if (value) {
        options.log = value;
        index += 1;
      }
    } else if (token === "--max-cycles") {
      const value = args[index + 1];
      if (value) {
        options["max-cycles"] = value;
        index += 1;
      }
    } else if (token === "--max-tool-calls") {
      const value = args[index + 1];
      if (value) {
        options["max-tool-calls"] = value;
        index += 1;
      }
    } else if (token === "--drain-ms") {
      const value = args[index + 1];
      if (value) {
        options["drain-ms"] = value;
        index += 1;
      }
    } else if (token === "--library") {
      const value = args[index + 1];
      if (value) {
        options.library = value;
        index += 1;
      }
    } else if (token === "--activate") {
      const value = args[index + 1];
      if (value) {
        options.activate = value;
        index += 1;
      }
    } else if (token === "--use") {
      const value = args[index + 1];
      if (value) {
        options.use = value;
        index += 1;
      }
    } else if (token === "--role") {
      const value = args[index + 1];
      if (value) {
        options.role = value;
        index += 1;
      }
    } else if (token === "--stage") {
      const value = args[index + 1];
      if (value) {
        options.stage = value;
        index += 1;
      }
    } else if (token === "--limit") {
      const value = args[index + 1];
      if (value) {
        options.limit = value;
        index += 1;
      }
    } else if (token === "--by") {
      const value = args[index + 1];
      if (value) {
        options.by = value;
        index += 1;
      }
    } else if (token === "--session") {
      const value = args[index + 1];
      if (value) {
        options.session = value;
        index += 1;
      }
    } else if (token === "--debug") {
      options.debug = true;
    } else if (token === "--force") {
      options.force = true;
    } else if (token === "--load") {
      options.load = true;
    } else if (token === "--no-load") {
      options["no-load"] = true;
    } else if (token === "--unload") {
      options.unload = true;
    } else if (token === "--no-unload") {
      options["no-unload"] = true;
    }
  }
  return options;
}

function commandSurfaceFromOptions(options: Record<string, string | boolean>): CommandSurface {
  return options.commandSurface === "slash" ? "slash" : "rph";
}

function agentSurfaceCommand(surface: CommandSurface, command: string): string {
  return surface === "slash" ? `/agent ${command}` : `rph agent ${command}`;
}

function runtimeSurfaceCommand(surface: CommandSurface, command: string): string {
  return surface === "slash" ? `/${command}` : `rph ${command}`;
}

function runtimeAgentPositionalArgs(args: string[]): string[] {
  const positional: string[] = [];
  const valueOptions = new Set([
    "--steps",
    "--reason",
    "--worker-id",
    "--lease-ms",
    "--concurrency",
    "--poll-ms",
    "--idle-ms",
    "--log",
    "--max-cycles",
    "--max-tool-calls",
    "--drain-ms",
    "--library",
    "--activate",
    "--use",
    "--role",
    "--stage",
    "--limit",
    "--by",
    "--session"
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token.startsWith("--")) {
      if (valueOptions.has(token)) {
        index += 1;
      }
      continue;
    }
    positional.push(token);
  }
  return positional;
}

function printRuntimeRecoveryBrief(
  projectRoot: string,
  session: RuntimeSessionManifest | null = loadRuntimeSession(projectRoot),
  options: { onlyWhenActionable?: boolean } = {}
): void {
  if (!isRuntimeProjectInitialized(projectRoot) || !session) {
    return;
  }
  if (printRuntimeHandoffsReadIssue(projectRoot)) {
    return;
  }
  const recovery = runtimeRecoveryState(projectRoot, session);
  if (options.onlyWhenActionable && !recovery.actionable) {
    return;
  }

  console.log("Session recovery brief");
  console.log(`- session: ${session.sessionId} status=${session.status} stage=${session.stage} owner=${session.ownerAgent}`);
  if (session.waitCondition) {
    console.log(`- wait: ${session.waitCondition.kind} ${session.waitCondition.message}`);
  }
  if (session.checkpoint) {
    console.log(`- checkpoint: ${session.checkpoint}`);
  }
  if (session.blocker) {
    console.log(`- blocker: ${session.blocker}`);
  }
  if (session.pendingAction?.command) {
    console.log(`- pending command: ${session.pendingAction.command}`);
  }
  if (recovery.pendingExternal) {
    console.log(`- pending external action: ${recovery.pendingExternal.id} [${recovery.pendingExternal.status}] ${recovery.pendingExternal.command}`);
  }
  if (recovery.pendingIntents.length > 0) {
    const next = recovery.pendingIntents[recovery.pendingIntents.length - 1];
    console.log(`- pending intents: ${recovery.pendingIntents.length}; next=${next.id} [${next.risk}] ${next.command}`);
    const blocker = runtimeIntentConfirmBlocker(projectRoot, next);
    if (blocker) {
      console.log(`- pending intent blocked: ${blocker}`);
    }
  }
  if (recovery.claimableHandoffs.length > 0) {
    const next = recovery.claimableHandoffs[0];
    console.log(`- claimable handoffs: ${recovery.claimableHandoffs.length}; next=${next.id} ${next.packet.toAgent} stage=${next.packet.stage} command=${next.packet.nextCommand ?? "none"}`);
  }
  if (recovery.mergeableLaneRuns.length > 0) {
    const next = recovery.mergeableLaneRuns[0];
    console.log(`- completed lane results pending merge: ${recovery.mergeableLaneRuns.length}; next=${next.id} ${next.role} stage=${next.stage}`);
  }
  const resumeCursor = session.handoffPacket?.resumeCursor ?? session.stageQueue?.find((entry) => entry.status === "active" || entry.status === "ready")?.id;
  if (resumeCursor) {
    console.log(`- resume cursor: ${resumeCursor}`);
  }
  console.log(`- next safe command: ${recovery.nextCommand}`);
}

function runtimeRecoveryState(
  projectRoot: string,
  session: RuntimeSessionManifest
): {
  pendingExternal: RuntimeActionApprovalRecord | undefined;
  pendingIntents: RuntimeIntentRecord[];
  claimableHandoffs: RuntimeHandoffRecord[];
  mergeableLaneRuns: AgentLaneRunRecord[];
  actionable: boolean;
  nextCommand: string;
} {
  const pendingActions = loadRuntimeActionApprovals(projectRoot).filter((record) => record.status === "pending" || record.status === "approved" || record.status === "running" || record.status === "failed");
  const pendingExternal = session.pendingExternalActionId
    ? pendingActions.find((record) => record.id === session.pendingExternalActionId)
    : pendingActions[0];
  const pendingIntents = loadRuntimeIntents(projectRoot)
    .filter((record) => record.status === "pending" && record.sessionId === session.sessionId);
  const claimableHandoffs = loadRuntimeHandoffs(projectRoot).filter((record) => isRuntimeHandoffClaimable(record));
  const mergeableLaneRuns = pendingCompletedLaneRuns(projectRoot);
  const actionable = session.status !== "active"
    || Boolean(session.waitCondition)
    || Boolean(session.blocker)
    || Boolean(session.pendingAction?.command)
    || Boolean(pendingExternal)
    || pendingIntents.length > 0
    || claimableHandoffs.length > 0
    || mergeableLaneRuns.length > 0
    || Boolean(session.handoffPacket);
  return {
    pendingExternal,
    pendingIntents,
    claimableHandoffs,
    mergeableLaneRuns,
    actionable,
    nextCommand: runtimeRecoveryNextCommand(projectRoot, session, pendingExternal, pendingIntents, claimableHandoffs, mergeableLaneRuns)
  };
}

function runtimeRecoveryNextCommand(
  projectRoot: string,
  session: RuntimeSessionManifest,
  pendingExternal: RuntimeActionApprovalRecord | undefined,
  pendingIntents: RuntimeIntentRecord[],
  claimableHandoffs: RuntimeHandoffRecord[],
  mergeableLaneRuns: AgentLaneRunRecord[]
): string {
  if (pendingExternal?.status === "pending") {
    return `/agent approve-action ${pendingExternal.id}`;
  }
  if (session.status === "paused" || session.waitCondition?.kind === "paused") {
    return "/resume";
  }
  if (session.pendingAction?.command) {
    return session.pendingAction.command;
  }
  if (pendingIntents.length > 0) {
    const confirmable = [...pendingIntents].reverse().find((record) => !runtimeIntentConfirmBlocker(projectRoot, record));
    return confirmable ? `/agent confirm-intent ${confirmable.id}` : "/agent intents";
  }
  if (mergeableLaneRuns.length > 0) {
    return "/agent run --steps 1";
  }
  if (claimableHandoffs.length > 0) {
    return "/agent run --steps 1";
  }
  if (session.waitCondition?.kind === "user_approval") {
    return "/status";
  }
  if (session.waitCondition?.kind === "external_live_write") {
    return "/agent actions";
  }
  return "/agent run --steps 1";
}

function runtimeIntentConfirmBlocker(projectRoot: string, record: RuntimeIntentRecord): string | undefined {
  if (record.risk === "user_approval" || isUserApprovalAgentCommand(record.command)) {
    return `user approval command requires direct user input: ${record.command}`;
  }
  return runtimeIntentDriftBlocker(projectRoot, record);
}

function printRuntimeHandoffSummary(projectRoot: string): void {
  if (!isRuntimeProjectInitialized(projectRoot)) {
    return;
  }
  if (printRuntimeHandoffsReadIssue(projectRoot)) {
    return;
  }
  const records = loadRuntimeHandoffs(projectRoot);
  const pending = records.filter((record) => record.status === "pending" || record.status === "acknowledged");
  const running = records.filter((record) => record.status === "claimed" || record.status === "running");
  const deadLetters = records.filter((record) => record.status === "dead_letter");
  console.log(`handoffs pending: ${pending.length}`);
  console.log(`handoffs running: ${running.length}`);
  console.log(`handoffs dead-letter: ${deadLetters.length}`);
  if (pending[0]) {
    console.log(`next handoff: ${pending[0].id} ${pending[0].packet.fromAgent} -> ${pending[0].packet.toAgent}`);
  }
  const latestLane = latestAgentLaneRun(projectRoot);
  if (latestLane) {
    console.log(`latest lane: ${latestLane.id} ${latestLane.role} ${latestLane.status} stage=${latestLane.stage}`);
  }
}

function handleAgentGraphCommand(
  projectRoot: string,
  args: string[],
  options: Record<string, string | boolean>
): void {
  const action = args[0] ?? "status";
  switch (action) {
    case "status":
    case "show":
      printRuntimeExecutionGraph(projectRoot, {
        json: optionBool(options, "json"),
        verbose: optionBool(options, "verbose") || optionBool(options, "debug")
      });
      return;
    case "refresh":
    case "materialize":
      printRuntimeExecutionGraph(projectRoot, {
        refresh: true,
        json: optionBool(options, "json"),
        verbose: optionBool(options, "verbose") || optionBool(options, "debug")
      });
      return;
    case "json":
      printRuntimeExecutionGraph(projectRoot, { json: true });
      return;
    default:
      console.log("usage: /agent graph [status|refresh|json] [--verbose]");
      process.exitCode = 2;
      return;
  }
}

function printRuntimeExecutionGraph(
  projectRoot: string,
  options: { refresh?: boolean; json?: boolean; verbose?: boolean } = {}
): void {
  if (!isRuntimeProjectInitialized(projectRoot)) {
    console.log("Runtime execution graph");
    console.log("- project: not initialized");
    console.log("next: rph setup auto --live");
    return;
  }
  const issue = runtimeExecutionGraphReadIssue(projectRoot);
  if (issue && !options.refresh) {
    console.log("Runtime execution graph");
    console.log(`- issue: ${issue}`);
    console.log(`- file: ${path.relative(projectRoot, runtimeExecutionGraphFile(projectRoot))}`);
    console.log("next: rph agent graph refresh");
    process.exitCode = 1;
    return;
  }
  const session = reconcileRuntimeStageQueue(projectRoot, loadRuntimeSession(projectRoot)) ?? loadRuntimeSession(projectRoot);
  const cachedGraph = loadRuntimeExecutionGraph(projectRoot);
  const shouldRefresh = options.refresh
    || !cachedGraph
    || (cachedGraph as { source?: string } | null)?.source !== "runtime-execution-graph"
    || Boolean(session && cachedGraph.sessionId !== session.sessionId);
  const graph = shouldRefresh
    ? materializeRuntimeExecutionGraph(projectRoot, session)
    : cachedGraph;
  if (!graph) {
    console.log("Runtime execution graph");
    console.log("- session: none");
    console.log("next: rph start");
    return;
  }
  if (options.json) {
    console.log(JSON.stringify(graph, null, 2));
    return;
  }
  console.log("Runtime execution graph");
  console.log(`- session: ${graph.sessionId}`);
  console.log(`- file: ${path.relative(projectRoot, runtimeExecutionGraphFile(projectRoot))}`);
  console.log(`- source: ${graph.source}`);
  console.log(`- graph: ${graph.graphId}`);
  console.log(`- digest: ${runtimeExecutionGraphDigest(graph)}`);
  console.log(`- stage=${graph.currentStage} status=${graph.status}`);
  console.log(`- nodes=${graph.summary.nodeCount} edges=${graph.summary.edgeCount} blockers=${graph.summary.blockerCount}`);
  console.log(`- active=${formatGraphNodeIds(graph.summary.activeNodeIds)}`);
  console.log(`- ready=${formatGraphNodeIds(graph.summary.readyNodeIds)}`);
  console.log(`- pending=${formatGraphNodeIds(graph.summary.pendingNodeIds)}`);
  console.log(`- blocked=${formatGraphNodeIds(graph.summary.blockedNodeIds)}`);
  console.log(`- completed=${formatGraphNodeIds(graph.summary.completedNodeIds)}`);
  console.log(`- fan-out=${formatGraphNodeIds(graph.summary.fanOutNodeIds)} fan-in=${formatGraphNodeIds(graph.summary.fanInNodeIds)}`);
  console.log(`- handoffs=${graph.summary.handoffCount} lanes=${graph.summary.laneRunCount}`);
  const nextCommand = runtimeExecutionGraphNextCommand(graph);
  console.log(`- next: ${nextCommand ?? "none"}`);
  const blockers = runtimeExecutionGraphTopBlockers(graph);
  if (blockers.length > 0) {
    console.log("Top blockers:");
    for (const blocker of blockers) {
      console.log(`- ${blocker}`);
    }
  }
  if (!options.verbose) {
    console.log("details: rph agent graph status --verbose | rph agent graph json");
    return;
  }
  console.log("Graph nodes:");
  for (const node of graph.nodes.slice(0, 12)) {
    const next = node.nextCommand ? ` next=${node.nextCommand}` : "";
    const blockers = node.blockers.length > 0 ? ` blockers=${node.blockers.length}` : "";
    console.log(`- ${node.id} [${node.status} ${node.nodeType}] owner=${node.ownerAgent}${next}${blockers}`);
  }
  if (graph.nodes.length > 12) {
    console.log(`- ... ${graph.nodes.length - 12} more node(s)`);
  }
  console.log("Graph edges:");
  for (const edge of graph.edges.slice(0, 12)) {
    console.log(`- ${edge.kind}: ${edge.from} -> ${edge.to} status=${edge.status}`);
  }
  if (graph.edges.length > 12) {
    console.log(`- ... ${graph.edges.length - 12} more edge(s)`);
  }
}

function formatGraphNodeIds(nodeIds: string[]): string {
  return nodeIds.length > 0 ? nodeIds.join(",") : "none";
}

function runtimeExecutionGraphDigest(graph: RuntimeExecutionGraph): string {
  return createHash("sha256").update(graph.queueFingerprint).digest("hex").slice(0, 12);
}

function runtimeDigestLines(projectRoot: string, session: RuntimeSessionManifest | null): string[] {
  if (!session || runtimeExecutionGraphReadIssue(projectRoot)) {
    return [];
  }
  try {
    const cached = loadRuntimeExecutionGraph(projectRoot);
    const graph = cached?.source === "runtime-execution-graph" && cached.sessionId === session.sessionId
      ? cached
      : materializeRuntimeExecutionGraph(projectRoot, session);
    if (!graph) {
      return [];
    }
    const pendingIntents = loadRuntimeIntents(projectRoot).filter((record) => record.status === "pending" && record.sessionId === session.sessionId);
    const lines = [
      `- graph: ${graph.graphId}`,
      `- digest: ${runtimeExecutionGraphDigest(graph)}`,
      "- inspect: rph agent graph status --verbose"
    ];
    if (pendingIntents.length > 0) {
      const next = pendingIntents[pendingIntents.length - 1];
      const blocker = runtimeIntentDriftBlocker(projectRoot, next);
      lines.push(`- pending intents: ${pendingIntents.length}`);
      if (blocker) {
        lines.push(`- next intent blocked: ${blocker}`);
        lines.push("- inspect intents: rph agent intents");
      } else {
        lines.push(`- next intent: rph agent confirm-intent ${next.id}`);
      }
    }
    return lines;
  } catch {
    return [];
  }
}

function printRuntimeDigest(projectRoot: string, session: RuntimeSessionManifest | null): void {
  const lines = runtimeDigestLines(projectRoot, session);
  if (lines.length === 0) {
    return;
  }
  for (const line of lines) {
    console.log(line);
  }
  console.log("");
}

function runtimeExecutionGraphNextCommand(graph: RuntimeExecutionGraph): string | null {
  const active = graph.nodes.find((node) => node.status === "active" && node.nextCommand);
  const ready = graph.nodes.find((node) => node.status === "ready" && node.nextCommand);
  const pending = graph.nodes.find((node) => node.status === "pending" && node.nextCommand);
  return active?.nextCommand ?? ready?.nextCommand ?? pending?.nextCommand ?? null;
}

function runtimeExecutionGraphTopBlockers(graph: RuntimeExecutionGraph): string[] {
  return graph.nodes
    .filter((node) => node.blockers.length > 0)
    .slice(0, 5)
    .map((node) => `${node.id}: ${node.blockers[0]}`);
}

function runtimeExecutionGraphReadIssue(projectRoot: string): string | null {
  const filePath = runtimeExecutionGraphFile(projectRoot);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    if (!fs.lstatSync(filePath).isFile()) {
      return "execution graph file is not a regular file";
    }
    JSON.parse(fs.readFileSync(filePath, "utf8")) as RuntimeExecutionGraph;
    return null;
  } catch {
    return "execution graph file is unreadable JSON";
  }
}

function printRuntimeHandoffs(projectRoot: string, debug = false): void {
  if (!isRuntimeProjectInitialized(projectRoot)) {
    console.log("handoffs: project is not initialized");
    return;
  }
  if (printRuntimeHandoffsReadIssue(projectRoot)) {
    return;
  }
  const records = loadRuntimeHandoffs(projectRoot);
  if (records.length === 0) {
    console.log("handoffs: none");
    return;
  }
  for (const record of records) {
    console.log(`${record.id} [${record.status}] ${record.packet.fromAgent} -> ${record.packet.toAgent} stage=${record.packet.stage}`);
    console.log(`  summary: ${record.packet.summary}`);
    if (record.packet.nextCommand) {
      console.log(`  next: ${record.packet.nextCommand}`);
    }
    if (record.claimedBy) {
      console.log(`  worker: ${record.claimedBy}`);
    }
    if (debug && record.workerSessionId) {
      console.log(`  worker-session: ${record.workerSessionId}`);
    }
    console.log(`  attempts: ${record.attempts ?? 0}/${record.maxAttempts ?? "?"}`);
    if (record.laneRunId) {
      console.log(`  lane: ${record.laneRunId}`);
    }
    if (record.leaseExpiresAt) {
      console.log(`  lease: ${record.leaseExpiresAt}`);
    }
    if (record.heartbeatAt) {
      console.log(`  heartbeat: ${record.heartbeatAt}`);
    }
    if (record.deadLetterReason) {
      console.log(`  dead-letter: ${record.deadLetterReason}`);
    }
    if (record.lastFailureReason) {
      console.log(`  last-failure: ${record.lastFailureReason}`);
    }
  }
}

function printRuntimeHandoffsReadIssue(projectRoot: string): boolean {
  const issue = runtimeHandoffsReadIssue(projectRoot);
  if (!issue) {
    return false;
  }
  console.log("Runtime handoff mailbox");
  console.log(`- issue: ${issue}`);
  console.log(`- file: ${path.relative(projectRoot, runtimeHandoffsFile(projectRoot))}`);
  console.log("next: repair or restore .rph/runtime/handoffs.json before running agent orchestration");
  process.exitCode = 1;
  return true;
}

function printRuntimeActionApprovals(projectRoot: string): void {
  if (!isRuntimeProjectInitialized(projectRoot)) {
    console.log("external actions: project is not initialized");
    return;
  }
  const records = loadRuntimeActionApprovals(projectRoot);
  if (records.length === 0) {
    console.log("external actions: none");
    return;
  }
  for (const record of records) {
    console.log(`${record.id} [${record.status}] ${record.target}:${record.action}`);
    console.log(`  command: ${record.command}`);
    console.log(`  risk: ${record.risk}`);
    console.log(`  description: ${record.description}`);
    if (record.reason) {
      console.log(`  reason: ${record.reason}`);
    }
    if (record.resultSummary) {
      console.log(`  result: ${record.resultSummary}`);
    }
    if (record.failureReason) {
      console.log(`  failure: ${record.failureReason}`);
    }
  }
}

function printRuntimeIntents(projectRoot: string): void {
  if (!isRuntimeProjectInitialized(projectRoot)) {
    console.log("intents: project is not initialized");
    return;
  }
  const records = loadRuntimeIntents(projectRoot);
  if (records.length === 0) {
    console.log("intents: none");
    return;
  }
  console.log("Runtime intents");
  for (const record of records.slice(-20)) {
    console.log(`${record.id} [${record.status}] ${record.risk}`);
    console.log(`  command: ${record.command}`);
    console.log(`  session: ${record.sessionId}`);
    if (record.createdStage) {
      const graph = record.graphDigest ? ` graph=${record.graphDigest}` : "";
      console.log(`  context: stage=${record.createdStage}${graph}`);
    }
    if (record.reason) {
      console.log(`  reason: ${record.reason}`);
    }
    if (record.status === "pending") {
      console.log(`  confirm: /agent confirm-intent ${record.id}`);
      console.log(`  dismiss: /agent dismiss-intent ${record.id}`);
    }
  }
}

async function confirmAndRunRuntimeIntent(
  projectRoot: string,
  id: string,
  options: { confirmedBy: string; force?: boolean; commandContext?: CommandContext }
): Promise<boolean> {
  if (!isRuntimeProjectInitialized(projectRoot)) {
    console.log("intent blocked: project is not initialized");
    process.exitCode = 1;
    return false;
  }
  const existing = loadRuntimeIntents(projectRoot).find((record) => record.id === id);
  if (!existing) {
    console.log(`intent blocked: runtime intent not found: ${id}`);
    process.exitCode = 1;
    return false;
  }
  if (existing.status !== "pending") {
    console.log(`intent blocked: cannot confirm runtime intent ${existing.id} with status ${existing.status}`);
    process.exitCode = 1;
    return false;
  }
  if (existing.risk === "user_approval" || isUserApprovalAgentCommand(existing.command)) {
    const blocker = `user approval command requires direct user input: ${existing.command}`;
    recordRuntimeIntentBlocked(projectRoot, existing.id, blocker);
    console.log(`intent blocked: ${blocker}`);
    console.log(`run explicitly: ${existing.command}`);
    process.exitCode = 1;
    return false;
  }
  const driftBlocker = runtimeIntentDriftBlocker(projectRoot, existing);
  if (driftBlocker && !options.force) {
    recordRuntimeIntentBlocked(projectRoot, existing.id, driftBlocker);
    console.log(`intent blocked: ${driftBlocker}`);
    console.log(`inspect: /agent intents`);
    console.log(`override: /agent confirm-intent ${existing.id} --force`);
    process.exitCode = 1;
    return false;
  }
  const record = confirmRuntimeIntent(projectRoot, id, options.confirmedBy);
  console.log(`intent confirmed: ${record.id}`);
  console.log(`command: ${record.command}`);
  const ok = await runAgentCommandProposal(projectRoot, {
    command: record.command,
    safeToAutoRun: record.safeToAutoRun,
    reason: record.reason
  }, {
    sessionId: record.sessionId,
    executeLocalMutations: true,
    surface: "execution",
    commandContext: options.commandContext
  });
  recordRuntimeIntentApplied(projectRoot, record.id, runtimeIntentAppliedOutcome(record, ok));
  return ok;
}

function runtimeIntentAppliedOutcome(record: RuntimeIntentRecord, ok: boolean): "local-command" | "action-approval-requested" | "blocked-or-skipped" {
  if (record.risk === "external_live_write") {
    return "action-approval-requested";
  }
  return ok ? "local-command" : "blocked-or-skipped";
}

function runtimeIntentDriftBlocker(projectRoot: string, record: RuntimeIntentRecord): string | undefined {
  const state = loadState(projectRoot);
  if (record.createdStage && state.currentStage !== record.createdStage) {
    return `intent was created at stage ${record.createdStage}, but current stage is ${state.currentStage}`;
  }
  const graph = currentRuntimeExecutionGraphForIntent(projectRoot, record.sessionId);
  const digest = graph ? runtimeExecutionGraphDigest(graph) : undefined;
  if (record.graphDigest && !digest) {
    return `intent was created with graph ${record.graphDigest}, but current graph is unavailable`;
  }
  if (record.graphDigest && digest && digest !== record.graphDigest) {
    return `intent graph drifted from ${record.graphDigest} to ${digest}`;
  }
  const activeProfileSlug = activeCustomAgentExecutionProfile(projectRoot)?.slug;
  if (record.activeProfileSlug && activeProfileSlug !== record.activeProfileSlug) {
    return `intent was created with active profile ${record.activeProfileSlug}, but current profile is ${activeProfileSlug ?? "none"}`;
  }
  return undefined;
}

function currentRuntimeExecutionGraphForIntent(projectRoot: string, sessionId: string): RuntimeExecutionGraph | null {
  const cached = loadRuntimeExecutionGraph(projectRoot);
  if (cached?.source === "runtime-execution-graph" && cached.sessionId === sessionId) {
    return cached;
  }
  const session = loadRuntimeSession(projectRoot);
  if (!session || session.sessionId !== sessionId) {
    return null;
  }
  return materializeRuntimeExecutionGraph(projectRoot, session);
}

function printRuntimeLaneRuns(projectRoot: string, debug = false): void {
  if (!isRuntimeProjectInitialized(projectRoot)) {
    console.log("lanes: project is not initialized");
    return;
  }
  const issues = loadAgentLaneRunReadIssues(projectRoot);
  const runs = loadAgentLaneRuns(projectRoot);
  if (issues.length > 0) {
    console.log(`lanes unreadable: ${issues.length}`);
    if (debug) {
      for (const issue of issues) {
        console.log(`  ${issue.file}: ${issue.issue}`);
      }
    }
  }
  if (runs.length === 0) {
    console.log("lanes: none");
    return;
  }
  for (const run of runs) {
    console.log(`${run.id} [${run.status}] ${run.role} stage=${run.stage}`);
    console.log(`  command: ${run.command}`);
    console.log(`  handoff: ${run.handoffId ?? "none"}`);
    if (run.workerId) {
      console.log(`  worker: ${run.workerId}`);
    }
    if (run.poolId || run.slotId) {
      console.log(`  owner: pool=${run.poolId ?? "none"} slot=${run.slotId ?? "none"}`);
    }
    if (debug && run.workerSessionId) {
      console.log(`  worker-session: ${run.workerSessionId}`);
    }
    if (debug && run.workerPid) {
      console.log(`  worker-pid: ${run.workerPid}`);
    }
    if (run.attempt) {
      console.log(`  attempt: ${run.attempt}`);
    }
    if (run.leaseExpiresAt) {
      console.log(`  lease: ${run.leaseExpiresAt}`);
    }
    if (run.merge) {
      console.log(`  merge: ${run.merge.status}${run.merge.summary ? ` - ${run.merge.summary}` : ""}`);
    }
    if (run.executionMode) {
      console.log(`  execution: ${run.executionMode}${run.autonomousTurnId ? ` turn=${run.autonomousTurnId}` : ""}`);
    }
    if (run.executionProfile) {
      const model = run.executionProfile.model ? ` model=${run.executionProfile.model}` : "";
      const reasoning = run.executionProfile.modelReasoningEffort ? ` reasoning=${run.executionProfile.modelReasoningEffort}` : "";
      const sandbox = run.executionProfile.sandboxMode ? ` sandbox=${run.executionProfile.sandboxMode}` : "";
      console.log(`  profile: ${run.executionProfile.name}${model}${reasoning}${sandbox}`);
    }
    if (run.proposedCommand && run.proposedCommand !== run.command) {
      console.log(`  proposed: ${run.proposedCommand}`);
    }
    if (run.executedCommand && run.executedCommand !== run.command) {
      console.log(`  executed: ${run.executedCommand}`);
    }
    if (run.memory) {
      console.log(`  memory: ${run.memory.scope} entries=${run.memory.entriesAfter ?? run.memory.entriesBefore}`);
    }
    if (run.toolBudget) {
      console.log(`  tool-budget: ${run.toolBudget.remainingToolCalls}/${run.toolBudget.maxToolCalls} calls, ${run.toolBudget.maxOutputTokens} tokens`);
    }
    console.log(`  allowed: ${run.toolPolicy.allowedCommandPrefixes.join(", ")}`);
  }
}

function printRuntimeWorkers(projectRoot: string, surface: CommandSurface, debug = false): void {
  if (!isRuntimeProjectInitialized(projectRoot)) {
    console.log("workers: project is not initialized");
    return;
  }
  if (printRuntimeHandoffsReadIssue(projectRoot)) {
    return;
  }
  const pool = readRuntimeWorkerPool(projectRoot);
  const handoffs = loadRuntimeHandoffs(projectRoot);
  const laneIssues = loadAgentLaneRunReadIssues(projectRoot);
  const lanes = loadAgentLaneRuns(projectRoot);
  const laneById = new Map(lanes.map((lane) => [lane.id, lane]));
  const active = handoffs
    .filter((handoff) => handoff.status === "claimed" || handoff.status === "running")
    .map((handoff) => runtimeWorkerLeaseView(handoff, laneById.get(handoff.laneRunId ?? "")));
  const claimable = handoffs.filter((handoff) => Boolean(handoff.packet.nextCommand) && isRuntimeHandoffClaimable(handoff));
  const mergeable = pendingCompletedLaneRuns(projectRoot);
  const healthy = active.filter((item) => item.health === "healthy");
  const dead = active.filter((item) => item.health === "dead-worker");
  const expired = active.filter((item) => item.health === "lease-expired");
  const unknownPid = active.filter((item) => item.health === "unknown-pid");

  console.log("Worker pool");
  if (pool) {
    const poolProcess = runtimeWorkerPoolProcessState(pool);
    console.log(`- pool daemon: ${pool.status} process=${poolProcess} cycles=${pool.cycles} dispatched=${pool.dispatched}`);
    const slotIssue = runtimeWorkerSlotsReadIssue(projectRoot);
    if (slotIssue) {
      console.log(`- pool slots: unreadable (${slotIssue})`);
    } else {
      const slots = projectRuntimeWorkerSlots(projectRoot, pool.poolId, pool.concurrency).slots;
      console.log(`- pool slots: ${formatRuntimeWorkerSlotSummary(slots)}`);
      if (debug) {
        for (const slot of slots) {
          console.log(`  slot=${slot.slotId} status=${slot.status} role=${slot.role ?? "none"} handoff=${slot.handoffId ?? "none"} lane=${slot.laneRunId ?? "none"}`);
        }
      }
    }
    if (debug) {
      console.log(`- debug-pool-pid: ${pool.pid}`);
    }
  } else {
    console.log("- pool daemon: none");
  }
  console.log(`- active leases: ${active.length}`);
  console.log(`- healthy workers: ${healthy.length}`);
  console.log(`- dead workers: ${dead.length}`);
  console.log(`- expired/reclaimable leases: ${expired.length}`);
  console.log(`- unknown-pid workers: ${unknownPid.length}`);
  console.log(`- claimable handoffs: ${claimable.length}`);
  console.log(`- completed pending merge: ${mergeable.length}`);
  if (laneIssues.length > 0) {
    console.log(`- unreadable lane files: ${laneIssues.length}`);
    if (debug) {
      for (const issue of laneIssues) {
        console.log(`  ${issue.file}: ${issue.issue}`);
      }
    }
  }

  if (active.length > 0) {
    console.log("Active workers:");
    for (const item of active) {
      const lane = item.lane;
      const handoff = item.handoff;
      console.log(`- handoff=${handoff.id} lane=${handoff.laneRunId ?? "none"} role=${handoff.packet.toAgent} stage=${handoff.packet.stage}`);
      console.log(`  status=${handoff.status} health=${item.health} worker=${handoff.claimedBy ?? lane?.workerId ?? "unknown"} attempt=${handoff.attempts ?? lane?.attempt ?? 0}`);
      if (handoff.poolId || lane?.poolId || handoff.slotId || lane?.slotId) {
        console.log(`  owner=pool:${handoff.poolId ?? lane?.poolId ?? "none"} slot:${handoff.slotId ?? lane?.slotId ?? "none"}`);
      }
      console.log(`  process=${item.pidState}`);
      if (debug) {
        console.log(`  debug-pid=${formatWorkerPid(lane?.workerPid, item.pidState)}`);
        if (handoff.workerSessionId || lane?.workerSessionId) {
          console.log(`  debug-worker-session=${handoff.workerSessionId ?? lane?.workerSessionId}`);
        }
      }
      if (handoff.leaseExpiresAt || lane?.leaseExpiresAt) {
        console.log(`  lease=${formatWorkerLease(handoff.leaseExpiresAt ?? lane?.leaseExpiresAt)}`);
      }
      if (handoff.heartbeatAt || lane?.heartbeatAt) {
        console.log(`  heartbeat=${handoff.heartbeatAt ?? lane?.heartbeatAt}`);
      }
      if (handoff.packet.nextCommand) {
        console.log(`  command=${handoff.packet.nextCommand}`);
      }
      if (handoff.lastFailureReason) {
        console.log(`  last-failure=${handoff.lastFailureReason}`);
      }
    }
  }

  if (mergeable.length > 0) {
    console.log("Completed lane results pending merge:");
    for (const run of mergeable.slice(0, 5)) {
      console.log(`- lane=${run.id} handoff=${run.handoffId ?? "none"} role=${run.role} stage=${run.stage}`);
    }
  }

  if (dead.length > 0 || expired.length > 0 || mergeable.length > 0) {
    console.log(`next: ${agentSurfaceCommand(surface, "recover --steps 1")}`);
    return;
  }
  if (claimable.length > 0) {
    console.log(`next: ${agentSurfaceCommand(surface, "run --steps 1")}`);
    return;
  }
  if (active.length > 0) {
    console.log("next: wait for worker heartbeat or completion");
    return;
  }
  console.log(`next: ${agentSurfaceCommand(surface, "run --steps 1")}`);
}

function runtimeWorkerLeaseView(handoff: RuntimeHandoffRecord, lane?: AgentLaneRunRecord): RuntimeWorkerLeaseView {
  const claimable = isRuntimeHandoffClaimable(handoff);
  const pidState = lane?.workerPid
    ? processIsAlive(lane.workerPid) ? "alive" : "dead"
    : "unknown";
  const health: RuntimeWorkerLeaseView["health"] = pidState === "dead"
    ? "dead-worker"
    : claimable
      ? "lease-expired"
      : pidState === "unknown"
        ? "unknown-pid"
        : "healthy";
  return {
    handoff,
    lane,
    pidState,
    health,
    claimable
  };
}

function formatWorkerPid(pid: number | undefined, state: RuntimeWorkerLeaseView["pidState"]): string {
  return pid ? `${pid}(${state})` : "unknown";
}

function formatWorkerLease(leaseExpiresAt: string | undefined): string {
  if (!leaseExpiresAt) {
    return "unknown";
  }
  const deltaMs = Date.parse(leaseExpiresAt) - Date.now();
  if (!Number.isFinite(deltaMs)) {
    return leaseExpiresAt;
  }
  const seconds = Math.ceil(Math.abs(deltaMs) / 1000);
  return deltaMs >= 0
    ? `${leaseExpiresAt} (${seconds}s left)`
    : `${leaseExpiresAt} (expired ${seconds}s ago)`;
}

async function handleAgentPoolCommand(
  projectRoot: string,
  args: string[],
  options: Record<string, string | boolean>
): Promise<void> {
  const action = args[0] ?? "status";
  switch (action) {
    case "run":
      await runRuntimeWorkerPool(projectRoot, options);
      return;
    case "start":
    case "daemon":
    case "background":
      await startRuntimeWorkerPoolBackground(projectRoot, options);
      return;
    case "status":
      printRuntimeWorkerPoolStatus(projectRoot, optionBool(options, "debug"), commandSurfaceFromOptions(options));
      return;
    case "logs":
    case "log":
      printRuntimeWorkerPoolLogs(projectRoot, options);
      return;
    case "service":
      await handleRuntimeWorkerPoolServiceCommand(projectRoot, args.slice(1), options);
      return;
    case "stop":
      await stopRuntimeWorkerPool(projectRoot, {
        reason: optionString(options, "reason") ?? "operator requested stop",
        force: optionBool(options, "force"),
        drainMs: parseOptionalNonNegativeInt(optionString(options, "drain-ms"))
      });
      return;
    default:
      console.log("usage: /agent pool <status|start|run|stop|logs|service> [--concurrency N] [--poll-ms N] [--idle-ms N] [--max-cycles N] [--log PATH] [--force] [--debug]");
      console.log("service: /agent pool service <install|status|uninstall|plist> [--no-load] [--no-unload]");
      process.exitCode = 2;
      return;
  }
}

function runtimeWorkerPoolFile(projectRoot: string): string {
  return path.join(projectRoot, ".rph", "runtime", "worker-pool.json");
}

function runtimeWorkerSlotsFile(projectRoot: string): string {
  return path.join(projectRoot, ".rph", "runtime", "worker-slots.json");
}

function runtimeWorkerPoolLogFile(projectRoot: string): string {
  return path.join(projectRoot, ".rph", "runtime", "worker-pool.log");
}

function runtimeWorkerPoolServiceLogFile(projectRoot: string): string {
  return path.join(projectRoot, ".rph", "runtime", "worker-pool.launchd.log");
}

function canonicalRuntimeProjectRoot(projectRoot: string): string {
  try {
    return fs.realpathSync.native(projectRoot);
  } catch {
    return path.resolve(projectRoot);
  }
}

function runtimeWorkerPoolServiceLabel(projectRoot: string): string {
  const canonicalRoot = canonicalRuntimeProjectRoot(projectRoot);
  const projectSlug = path.basename(canonicalRoot)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "project";
  const hash = createHash("sha256").update(canonicalRoot).digest("hex").slice(0, 12);
  return `dev.rph.${projectSlug}.${hash}.worker-pool`;
}

function runtimeWorkerPoolServicePlistPath(projectRoot: string): string | null {
  const home = process.env.HOME;
  if (!home) {
    return null;
  }
  return path.join(home, "Library", "LaunchAgents", `${runtimeWorkerPoolServiceLabel(projectRoot)}.plist`);
}

function servicePathForDisplay(value: string): string {
  const home = process.env.HOME;
  if (home && (value === home || value.startsWith(`${home}${path.sep}`))) {
    return `~${value.slice(home.length)}`;
  }
  return value;
}

function runtimeWorkerPoolServicePlistIssue(plistPath: string): string | null {
  if (!fs.existsSync(plistPath)) {
    return null;
  }
  try {
    const stat = fs.lstatSync(plistPath);
    if (!stat.isFile()) {
      return "plist path is not a regular file";
    }
    const content = fs.readFileSync(plistPath, "utf8");
    if (!content.includes("<plist") || !content.includes("<key>Label</key>")) {
      return "plist is unreadable XML";
    }
    return null;
  } catch {
    return "plist is unreadable XML";
  }
}

function writeLaunchAgentPlistSafely(plistPath: string, plist: string): string | null {
  const issue = runtimeWorkerPoolServicePlistIssue(plistPath);
  if (issue) {
    return issue;
  }
  const tmpPath = `${plistPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tmpPath, plist, { mode: 0o644 });
    fs.chmodSync(tmpPath, 0o644);
    fs.renameSync(tmpPath, plistPath);
    return null;
  } catch (error) {
    fs.rmSync(tmpPath, { force: true });
    return error instanceof Error ? error.message : String(error);
  }
}

function launchdGuiTarget(): string | null {
  return typeof process.getuid === "function" ? `gui/${process.getuid()}` : null;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function runtimeWorkerPoolServiceProgramArgs(
  projectRoot: string,
  options: Record<string, string | boolean>
): string[] | null {
  const cliEntry = process.argv[1] ? path.resolve(process.argv[1]) : null;
  if (!cliEntry) {
    return null;
  }
  const concurrency = Math.max(1, Math.min(parseOptionalPositiveInt(optionString(options, "concurrency")) ?? 2, 6));
  const pollMs = Math.max(50, Math.min(parseOptionalPositiveInt(optionString(options, "poll-ms")) ?? 1_000, 30_000));
  const idleMs = Math.max(0, parseOptionalNonNegativeInt(optionString(options, "idle-ms")) ?? 0);
  const args = [
    process.execPath,
    cliEntry,
    "agent",
    "pool",
    "run",
    "--concurrency",
    String(concurrency),
    "--poll-ms",
    String(pollMs),
    "--idle-ms",
    String(idleMs)
  ];
  const maxCycles = parseOptionalPositiveInt(optionString(options, "max-cycles"));
  if (maxCycles) {
    args.push("--max-cycles", String(maxCycles));
  }
  const laneMaxToolCalls = parseOptionalNonNegativeInt(optionString(options, "max-tool-calls"));
  if (laneMaxToolCalls !== undefined) {
    args.push("--max-tool-calls", String(laneMaxToolCalls));
  }
  return args;
}

function renderRuntimeWorkerPoolServicePlist(
  projectRoot: string,
  options: Record<string, string | boolean>
): { label: string; plist: string; logPath: string; programArgs: string[] } | null {
  const canonicalRoot = canonicalRuntimeProjectRoot(projectRoot);
  const programArgs = runtimeWorkerPoolServiceProgramArgs(canonicalRoot, options);
  if (!programArgs) {
    return null;
  }
  const label = runtimeWorkerPoolServiceLabel(canonicalRoot);
  const requestedLogPath = optionString(options, "log");
  const logPath = requestedLogPath
    ? resolveRuntimeWorkerPoolLogPath(canonicalRoot, requestedLogPath)
    : runtimeWorkerPoolServiceLogFile(canonicalRoot);
  if (!logPath) {
    return null;
  }
  const programArguments = programArgs.map((arg) => `    <string>${xmlEscape(arg)}</string>`).join("\n");
  const plist = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`,
    `<plist version="1.0">`,
    `<dict>`,
    `  <key>Label</key>`,
    `  <string>${xmlEscape(label)}</string>`,
    `  <key>ProgramArguments</key>`,
    `  <array>`,
    programArguments,
    `  </array>`,
    `  <key>WorkingDirectory</key>`,
    `  <string>${xmlEscape(canonicalRoot)}</string>`,
    `  <key>RunAtLoad</key>`,
    `  <true/>`,
    `  <key>KeepAlive</key>`,
    `  <dict>`,
    `    <key>SuccessfulExit</key>`,
    `    <false/>`,
    `  </dict>`,
    `  <key>ThrottleInterval</key>`,
    `  <integer>10</integer>`,
    `  <key>StandardOutPath</key>`,
    `  <string>${xmlEscape(logPath)}</string>`,
    `  <key>StandardErrorPath</key>`,
    `  <string>${xmlEscape(logPath)}</string>`,
    `  <key>EnvironmentVariables</key>`,
    `  <dict>`,
    `    <key>RPH_WORKER_POOL_MODE</key>`,
    `    <string>service</string>`,
    `    <key>RPH_WORKER_POOL_LOG</key>`,
    `    <string>${xmlEscape(logPath)}</string>`,
    `  </dict>`,
    `</dict>`,
    `</plist>`,
    ``
  ].join("\n");
  return { label, plist, logPath, programArgs };
}

async function handleRuntimeWorkerPoolServiceCommand(
  projectRoot: string,
  args: string[],
  options: Record<string, string | boolean>
): Promise<void> {
  const action = args[0] ?? "status";
  switch (action) {
    case "install":
      installRuntimeWorkerPoolService(projectRoot, options);
      return;
    case "uninstall":
    case "remove":
      uninstallRuntimeWorkerPoolService(projectRoot, options);
      return;
    case "status":
      printRuntimeWorkerPoolServiceStatus(projectRoot, options);
      return;
    case "plist":
    case "print":
      printRuntimeWorkerPoolServicePlist(projectRoot, options);
      return;
    default:
      console.log("usage: /agent pool service <install|status|uninstall|plist> [--concurrency N] [--poll-ms N] [--idle-ms N] [--no-load] [--no-unload]");
      process.exitCode = 2;
      return;
  }
}

function printRuntimeWorkerPoolServicePlist(projectRoot: string, options: Record<string, string | boolean>): void {
  if (!isRuntimeProjectInitialized(projectRoot)) {
    console.log("worker pool service: project is not initialized");
    process.exitCode = 1;
    return;
  }
  const rendered = renderRuntimeWorkerPoolServicePlist(projectRoot, options);
  if (!rendered) {
    console.log("worker pool service failed: unable to resolve CLI entrypoint");
    process.exitCode = 1;
    return;
  }
  process.stdout.write(rendered.plist);
}

function installRuntimeWorkerPoolService(projectRoot: string, options: Record<string, string | boolean>): void {
  if (!isRuntimeProjectInitialized(projectRoot)) {
    console.log("worker pool service install: project is not initialized");
    process.exitCode = 1;
    return;
  }
  const poolReadIssue = runtimeWorkerPoolReadIssue(projectRoot);
  if (poolReadIssue) {
    console.log(`worker pool service install blocked: ${poolReadIssue}`);
    console.log("next: inspect or remove .rph/runtime/worker-pool.json");
    process.exitCode = 1;
    return;
  }
  const currentPool = readRuntimeWorkerPool(projectRoot);
  const currentPoolActive = currentPool && ["starting", "running", "stopping"].includes(currentPool.status);
  const currentPoolProcess = currentPool ? runtimeWorkerPoolProcessState(currentPool) : "dead";
  if (currentPool && currentPoolActive && (currentPoolProcess === "alive" || currentPoolProcess === "unknown")) {
    console.log(`worker pool service install blocked: worker pool already active (${currentPool.poolId})`);
    console.log("next: rph agent pool status");
    process.exitCode = 1;
    return;
  }
  const plistPath = runtimeWorkerPoolServicePlistPath(projectRoot);
  if (!plistPath) {
    console.log("worker pool service install failed: HOME is not set");
    process.exitCode = 1;
    return;
  }
  const rendered = renderRuntimeWorkerPoolServicePlist(projectRoot, options);
  if (!rendered) {
    console.log("worker pool service install failed: unable to resolve CLI entrypoint");
    process.exitCode = 1;
    return;
  }
  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  fs.mkdirSync(path.dirname(rendered.logPath), { recursive: true });
  appendText(rendered.logPath, "");
  const writeIssue = writeLaunchAgentPlistSafely(plistPath, rendered.plist);
  if (writeIssue) {
    console.log(`worker pool service install blocked: ${writeIssue}`);
    console.log(`next: inspect or remove ${servicePathForDisplay(plistPath)}`);
    process.exitCode = 1;
    return;
  }
  console.log("worker pool service installed");
  console.log(`- label=${rendered.label}`);
  console.log(`- plist=${servicePathForDisplay(plistPath)}`);
  console.log(`- project=${projectRoot}`);
  console.log(`- log=${path.relative(projectRoot, rendered.logPath)}`);

  if (optionBool(options, "no-load")) {
    console.log("- launchctl=skipped (--no-load)");
    console.log("next: rph agent pool service status");
    return;
  }
  const loaded = loadRuntimeWorkerPoolLaunchAgent(rendered.label, plistPath);
  if (!loaded.ok) {
    console.log(`worker pool service load failed: ${loaded.message}`);
    console.log(`next: launchctl bootstrap ${launchdGuiTarget() ?? "gui/$UID"} ${servicePathForDisplay(plistPath)}`);
    process.exitCode = 1;
    return;
  }
  console.log("- launchctl=loaded");
  console.log("next: rph agent pool service status");
}

function uninstallRuntimeWorkerPoolService(projectRoot: string, options: Record<string, string | boolean>): void {
  const plistPath = runtimeWorkerPoolServicePlistPath(projectRoot);
  const label = runtimeWorkerPoolServiceLabel(projectRoot);
  if (!plistPath) {
    console.log("worker pool service uninstall failed: HOME is not set");
    process.exitCode = 1;
    return;
  }
  const existed = fs.existsSync(plistPath);
  if (!optionBool(options, "no-unload")) {
    const unloaded = unloadRuntimeWorkerPoolLaunchAgent(label, plistPath);
    if (!unloaded.ok) {
      console.log(`worker pool service unload warning: ${unloaded.message}`);
    }
  }
  if (existed) {
    fs.rmSync(plistPath, { force: true });
  }
  console.log(existed ? "worker pool service uninstalled" : "worker pool service not installed");
  console.log(`- label=${label}`);
  console.log(`- plist=${servicePathForDisplay(plistPath)}`);
  console.log("next: rph agent pool service status");
}

function printRuntimeWorkerPoolServiceStatus(projectRoot: string, options: Record<string, string | boolean>): void {
  const surface = commandSurfaceFromOptions(options);
  const plistPath = runtimeWorkerPoolServicePlistPath(projectRoot);
  const label = runtimeWorkerPoolServiceLabel(projectRoot);
  console.log("Worker pool service");
  console.log(`- label=${label}`);
  if (!plistPath) {
    console.log("- installed=unknown");
    console.log("- issue=HOME is not set");
    return;
  }
  const installed = fs.existsSync(plistPath);
  const plistIssue = runtimeWorkerPoolServicePlistIssue(plistPath);
  console.log(`- plist=${servicePathForDisplay(plistPath)}`);
  console.log(`- installed=${installed && !plistIssue ? "yes" : installed ? "unreadable" : "no"}`);
  if (plistIssue) {
    console.log(`- issue=${plistIssue}`);
  }
  const poolReadIssue = runtimeWorkerPoolReadIssue(projectRoot);
  const pool = readRuntimeWorkerPool(projectRoot);
  if (poolReadIssue) {
    console.log("- pool_daemon=unreadable");
    console.log(`- pool_issue=${poolReadIssue}`);
  } else if (pool) {
    console.log(`- pool_daemon=${pool.status} process=${runtimeWorkerPoolProcessState(pool)}`);
  } else {
    console.log("- pool_daemon=none");
  }
  if (installed && !plistIssue && optionBool(options, "debug")) {
    const state = readRuntimeWorkerPoolLaunchAgentState(label);
    console.log(`- launchctl=${state}`);
  } else if (installed && !plistIssue) {
    console.log("- launchctl=not-checked");
  }
  const next = installed
    ? (plistIssue ? `inspect or remove ${servicePathForDisplay(plistPath)}` : agentSurfaceCommand(surface, "pool service uninstall"))
    : agentSurfaceCommand(surface, "pool service install");
  console.log(`next: ${next}`);
}

function loadRuntimeWorkerPoolLaunchAgent(label: string, plistPath: string): { ok: boolean; message: string } {
  if (process.platform !== "darwin") {
    return { ok: false, message: "launchctl is only available on macOS" };
  }
  const target = launchdGuiTarget();
  if (!target) {
    return { ok: false, message: "unable to resolve launchd gui target" };
  }
  spawnSync("launchctl", ["bootout", `${target}/${label}`], { encoding: "utf8" });
  const result = spawnSync("launchctl", ["bootstrap", target, plistPath], { encoding: "utf8" });
  if (result.status !== 0) {
    return { ok: false, message: (result.stderr || result.stdout || `launchctl exited ${result.status}`).trim() };
  }
  return { ok: true, message: "loaded" };
}

function unloadRuntimeWorkerPoolLaunchAgent(label: string, plistPath: string): { ok: boolean; message: string } {
  if (process.platform !== "darwin") {
    return { ok: false, message: "launchctl is only available on macOS" };
  }
  const target = launchdGuiTarget();
  if (!target) {
    return { ok: false, message: "unable to resolve launchd gui target" };
  }
  const scoped = spawnSync("launchctl", ["bootout", `${target}/${label}`], { encoding: "utf8" });
  if (scoped.status === 0) {
    return { ok: true, message: "unloaded" };
  }
  const byPath = fs.existsSync(plistPath)
    ? spawnSync("launchctl", ["bootout", target, plistPath], { encoding: "utf8" })
    : scoped;
  if (byPath.status !== 0) {
    return { ok: false, message: (byPath.stderr || scoped.stderr || byPath.stdout || scoped.stdout || `launchctl exited ${byPath.status}`).trim() };
  }
  return { ok: true, message: "unloaded" };
}

function readRuntimeWorkerPoolLaunchAgentState(label: string): string {
  if (process.platform !== "darwin") {
    return "unavailable";
  }
  const target = launchdGuiTarget();
  if (!target) {
    return "unknown";
  }
  const result = spawnSync("launchctl", ["print", `${target}/${label}`], { encoding: "utf8" });
  if (result.status !== 0) {
    return "not-loaded";
  }
  return "loaded";
}

function readRuntimeWorkerPool(projectRoot: string): RuntimeWorkerPoolRecord | null {
  const filePath = runtimeWorkerPoolFile(projectRoot);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    if (!fs.lstatSync(filePath).isFile()) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as RuntimeWorkerPoolRecord;
  } catch {
    return null;
  }
}

function writeRuntimeWorkerPool(projectRoot: string, record: RuntimeWorkerPoolRecord): void {
  writeJson(runtimeWorkerPoolFile(projectRoot), record);
}

function readRuntimeWorkerSlots(projectRoot: string): RuntimeWorkerSlotsRecord | null {
  const filePath = runtimeWorkerSlotsFile(projectRoot);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    if (!fs.lstatSync(filePath).isFile()) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as RuntimeWorkerSlotsRecord;
  } catch {
    return null;
  }
}

function writeRuntimeWorkerSlots(projectRoot: string, record: RuntimeWorkerSlotsRecord): void {
  writeJson(runtimeWorkerSlotsFile(projectRoot), record);
}

function runtimeWorkerSlotsReadIssue(projectRoot: string): string | null {
  const filePath = runtimeWorkerSlotsFile(projectRoot);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    if (!fs.lstatSync(filePath).isFile()) {
      return "slot state file is not a regular file";
    }
    JSON.parse(fs.readFileSync(filePath, "utf8"));
    return null;
  } catch {
    return "slot state file is unreadable JSON";
  }
}

function refreshRuntimeWorkerSlots(
  projectRoot: string,
  poolId: string | undefined,
  concurrency?: number,
  idleReason?: RuntimeWorkerSlotRecord["idleReason"]
): RuntimeWorkerSlotsRecord | null {
  const currentPool = readRuntimeWorkerPool(projectRoot);
  const resolvedPoolId = poolId ?? currentPool?.poolId;
  if (!resolvedPoolId) {
    return null;
  }
  const slotCount = concurrency
    ?? (currentPool?.poolId === resolvedPoolId ? currentPool.concurrency : undefined)
    ?? inferRuntimeWorkerSlotCount(projectRoot, resolvedPoolId);
  const projection = projectRuntimeWorkerSlots(projectRoot, resolvedPoolId, slotCount, idleReason);
  writeRuntimeWorkerSlots(projectRoot, projection);
  return projection;
}

function projectRuntimeWorkerSlots(
  projectRoot: string,
  poolId: string,
  concurrency: number,
  idleReason: RuntimeWorkerSlotRecord["idleReason"] = "available"
): RuntimeWorkerSlotsRecord {
  const now = new Date().toISOString();
  const previous = readRuntimeWorkerSlots(projectRoot);
  const previousSlots = previous?.poolId === poolId
    ? new Map(previous.slots.map((slot) => [slot.slotIndex, slot]))
    : new Map<number, RuntimeWorkerSlotRecord>();
  const handoffs = loadRuntimeHandoffs(projectRoot);
  const lanes = loadAgentLaneRuns(projectRoot);
  const handoffById = new Map(handoffs.map((handoff) => [handoff.id, handoff]));
  const slots: RuntimeWorkerSlotRecord[] = [];
  const count = Math.max(1, Math.min(concurrency, 6));

  for (let index = 0; index < count; index += 1) {
    const slotId = runtimeWorkerSlotId(poolId, index);
    const previousSlot = previousSlots.get(index);
    const matchingLanes = lanes
      .filter((lane) => lane.poolId === poolId && lane.slotIndex === index)
      .sort((left, right) => runtimeRecordTime(right) - runtimeRecordTime(left));
    const activeLane = matchingLanes.find((lane) => lane.status === "claimed" || lane.status === "running");
    if (activeLane) {
      slots.push(runtimeWorkerSlotFromLane({
        lane: activeLane,
        handoff: activeLane.handoffId ? handoffById.get(activeLane.handoffId) : undefined,
        slotId,
        slotIndex: index,
        status: "running",
        now,
        previous: previousSlot
      }));
      continue;
    }
    const lastLane = matchingLanes.find((lane) => lane.status === "completed" || lane.status === "failed");
    if (lastLane) {
      slots.push(runtimeWorkerSlotFromLane({
        lane: lastLane,
        handoff: lastLane.handoffId ? handoffById.get(lastLane.handoffId) : undefined,
        slotId,
        slotIndex: index,
        status: lastLane.status === "failed" ? "dead" : "completed",
        now,
        previous: previousSlot
      }));
      continue;
    }
    slots.push({
      slotId,
      slotIndex: index,
      status: "idle",
      updatedAt: now,
      lastTransitionAt: previousSlot?.status === "idle" ? previousSlot.lastTransitionAt : now,
      idleReason
    });
  }

  return {
    version: 1,
    poolId,
    updatedAt: now,
    slots
  };
}

function runtimeWorkerSlotFromLane(input: {
  lane: AgentLaneRunRecord;
  handoff?: RuntimeHandoffRecord;
  slotId: string;
  slotIndex: number;
  status: RuntimeWorkerSlotRecord["status"];
  now: string;
  previous?: RuntimeWorkerSlotRecord;
}): RuntimeWorkerSlotRecord {
  const { lane, handoff, slotId, slotIndex, status, now, previous } = input;
  const lastTransitionAt = status === previous?.status && previous.laneRunId === lane.id
    ? previous.lastTransitionAt
    : status === "running"
      ? lane.runningAt ?? lane.startedAt
      : lane.completedAt ?? lane.updatedAt;
  return {
    slotId,
    slotIndex,
    status,
    updatedAt: now,
    lastTransitionAt,
    role: lane.role,
    stage: lane.stage,
    handoffId: lane.handoffId,
    laneRunId: lane.id,
    workerId: lane.workerId,
    command: lane.command,
    attempt: lane.attempt,
    heartbeatAt: lane.heartbeatAt ?? handoff?.heartbeatAt,
    leaseExpiresAt: lane.leaseExpiresAt ?? handoff?.leaseExpiresAt,
    completedAt: lane.completedAt,
    mergeStatus: lane.merge?.status,
    failureDisposition: status === "dead" ? handoff?.status === "dead_letter" ? "dead_letter" : "requeued" : undefined,
    failureReason: status === "dead" ? lane.error ?? handoff?.lastFailureReason : undefined
  };
}

function inferRuntimeWorkerSlotCount(projectRoot: string, poolId: string): number {
  const maxIndex = [...loadRuntimeHandoffs(projectRoot), ...loadAgentLaneRuns(projectRoot)]
    .filter((record) => record.poolId === poolId && record.slotIndex !== undefined)
    .reduce((max, record) => Math.max(max, record.slotIndex ?? -1), -1);
  return Math.max(1, Math.min(maxIndex + 1, 6));
}

function runtimeRecordTime(record: { updatedAt?: string; completedAt?: string; startedAt?: string; createdAt?: string }): number {
  return Date.parse(record.updatedAt ?? record.completedAt ?? record.startedAt ?? record.createdAt ?? "") || 0;
}

function runtimeWorkerSlotId(poolId: string, slotIndex: number): string {
  return `${poolId}:slot-${slotIndex}`;
}

function runtimeWorkerPoolIdFromEnv(): string | undefined {
  const value = process.env.RPH_WORKER_POOL_ID?.trim();
  if (!value) {
    return undefined;
  }
  return /^[A-Za-z0-9._:-]{1,80}$/.test(value) ? value : undefined;
}

function formatRuntimeWorkerSlotSummary(slots: RuntimeWorkerSlotRecord[]): string {
  if (slots.length === 0) {
    return "none";
  }
  return slots
    .map((slot) => `slot-${slot.slotIndex}:${slot.status}${slot.role ? `/${slot.role}` : ""}`)
    .join(" ");
}

function runtimeWorkerPoolReadIssue(projectRoot: string): string | null {
  const filePath = runtimeWorkerPoolFile(projectRoot);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    if (!fs.lstatSync(filePath).isFile()) {
      return "state file is not a regular file";
    }
    JSON.parse(fs.readFileSync(filePath, "utf8"));
    return null;
  } catch {
    return "state file is unreadable JSON";
  }
}

type RuntimeWorkerPoolProcessState = "alive" | "dead" | "identity-mismatch" | "unknown";

function runtimeWorkerPoolProcessState(record: RuntimeWorkerPoolRecord): RuntimeWorkerPoolProcessState {
  if (!processIsAlive(record.pid)) {
    return "dead";
  }
  if (!record.pidStartedAt) {
    return "unknown";
  }
  const startedAt = readProcessStartedAt(record.pid);
  if (!startedAt) {
    return "unknown";
  }
  return startedAt === record.pidStartedAt ? "alive" : "identity-mismatch";
}

function printRuntimeWorkerPoolStatus(projectRoot: string, debug: boolean, surface: CommandSurface): void {
  if (!isRuntimeProjectInitialized(projectRoot)) {
    console.log("worker pool: project is not initialized");
    return;
  }
  const record = readRuntimeWorkerPool(projectRoot);
  const readIssue = runtimeWorkerPoolReadIssue(projectRoot);
  console.log("Worker pool daemon");
  if (!record && readIssue) {
    console.log("- status=unreadable");
    console.log(`- issue=${readIssue}`);
    console.log(`next: ${agentSurfaceCommand(surface, "pool start")}`);
    return;
  }
  if (!record) {
    console.log("- status=none");
    console.log(`next: ${agentSurfaceCommand(surface, "pool start")}`);
    return;
  }
  const processState = runtimeWorkerPoolProcessState(record);
  console.log(`- status=${record.status} pool=${record.poolId} process=${processState}`);
  if (record.mode) {
    console.log(`- mode=${record.mode}`);
  }
  if (record.stopMode) {
    console.log(`- stop_mode=${record.stopMode}`);
  }
  console.log(`- concurrency=${record.concurrency} poll_ms=${record.pollMs} idle_ms=${record.idleMs}`);
  const slotIssue = runtimeWorkerSlotsReadIssue(projectRoot);
  if (slotIssue) {
    console.log(`- slots=unreadable (${slotIssue})`);
  } else {
    const slots = projectRuntimeWorkerSlots(projectRoot, record.poolId, record.concurrency).slots;
    console.log(`- slots=${formatRuntimeWorkerSlotSummary(slots)}`);
  }
  console.log(`- heartbeat=${record.heartbeatAt}`);
  console.log(`- cycles=${record.cycles} dispatched=${record.dispatched}`);
  if (record.logPath) {
    console.log(`- log=${path.relative(projectRoot, record.logPath) || record.logPath}`);
  }
  if (record.lastActionAt) {
    console.log(`- last_action=${record.lastActionAt}`);
  }
  if (record.lastBlocker) {
    console.log(`- last_blocker=${compactTimelineMessage(record.lastBlocker, 120)}`);
  }
  if (record.stopRequestedAt) {
    console.log(`- stop_requested=${record.stopRequestedAt}`);
  }
  if (record.stoppedAt) {
    console.log(`- stopped=${record.stoppedAt}`);
  }
  if (debug) {
    console.log(`- debug-pid=${record.pid}`);
  }
  const next = record.status === "running" || record.status === "stopping"
    ? agentSurfaceCommand(surface, "pool stop")
    : agentSurfaceCommand(surface, "pool start");
  console.log(`next: ${next}`);
}

async function stopRuntimeWorkerPool(
  projectRoot: string,
  options: { reason: string; force?: boolean; drainMs?: number }
): Promise<void> {
  if (!isRuntimeProjectInitialized(projectRoot)) {
    console.log("worker pool stop: project is not initialized");
    return;
  }
  const current = readRuntimeWorkerPool(projectRoot);
  const readIssue = runtimeWorkerPoolReadIssue(projectRoot);
  if (!current && readIssue) {
    console.log(`worker pool stop blocked: ${readIssue}`);
    console.log("next: inspect or remove .rph/runtime/worker-pool.json");
    process.exitCode = 1;
    return;
  }
  if (!current || current.status === "stopped" || current.status === "failed") {
    console.log("worker pool stop: no running pool");
    return;
  }
  const now = new Date().toISOString();
  const processState = runtimeWorkerPoolProcessState(current);
  if (processState === "dead") {
    writeRuntimeWorkerPool(projectRoot, {
      ...current,
      status: "stopped",
      updatedAt: now,
      heartbeatAt: now,
      stoppedAt: now,
      stopReason: "stale pool process is not alive"
    });
    refreshRuntimeWorkerSlots(projectRoot, current.poolId, current.concurrency, "available");
    console.log(`worker pool stop: stale pool marked stopped (${current.poolId})`);
    return;
  }
  if (processState === "identity-mismatch" || (options.force && processState !== "alive")) {
    writeRuntimeWorkerPool(projectRoot, {
      ...current,
      status: "failed",
      updatedAt: now,
      heartbeatAt: now,
      stoppedAt: now,
      stopReason: processState === "identity-mismatch"
        ? "pool process identity mismatch; refusing to signal pid"
        : "pool process identity is unknown; refusing force stop"
    });
    refreshRuntimeWorkerSlots(projectRoot, current.poolId, current.concurrency, "pool-draining");
    console.log(`worker pool stop blocked: process identity ${processState} (${current.poolId})`);
    process.exitCode = 1;
    return;
  }
  const stopMode = options.force ? "force" : "drain";
  writeRuntimeWorkerPool(projectRoot, {
    ...current,
    status: "stopping",
    updatedAt: now,
    stopRequestedAt: now,
    stopReason: options.reason,
    stopMode,
    forceRequestedAt: options.force ? now : current.forceRequestedAt
  });
  refreshRuntimeWorkerSlots(projectRoot, current.poolId, current.concurrency, "pool-draining");
  if (!options.force) {
    console.log(`worker pool stop requested: ${current.poolId}`);
    console.log("worker pool stop mode: drain");
    return;
  }
  try {
    process.kill(current.pid, "SIGTERM");
    const exited = await waitForRuntimeWorkerPoolExit(current, options.drainMs ?? 2_000);
    if (!exited) {
      const failedAt = new Date().toISOString();
      writeRuntimeWorkerPool(projectRoot, {
        ...current,
        status: "failed",
        updatedAt: failedAt,
        heartbeatAt: failedAt,
        stopRequestedAt: now,
        forceRequestedAt: now,
        stopReason: "force stop timeout; pool process still alive",
        stopMode
      });
      refreshRuntimeWorkerSlots(projectRoot, current.poolId, current.concurrency, "pool-draining");
      console.log(`worker pool force stop failed: process still alive (${current.poolId})`);
      process.exitCode = 1;
      return;
    }
    const stoppedAt = new Date().toISOString();
    writeRuntimeWorkerPool(projectRoot, {
      ...current,
      status: "stopped",
      updatedAt: stoppedAt,
      heartbeatAt: stoppedAt,
      stopRequestedAt: now,
      forceRequestedAt: now,
      stoppedAt,
      stopReason: `${options.reason} (forced)`,
      stopMode
    });
    refreshRuntimeWorkerSlots(projectRoot, current.poolId, current.concurrency, "available");
    console.log(`worker pool force stop confirmed: ${current.poolId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedAt = new Date().toISOString();
    writeRuntimeWorkerPool(projectRoot, {
      ...current,
      status: "failed",
      updatedAt: failedAt,
      heartbeatAt: failedAt,
      stopRequestedAt: now,
      forceRequestedAt: now,
      stopReason: `force stop failed: ${message}`,
      stopMode
    });
    refreshRuntimeWorkerSlots(projectRoot, current.poolId, current.concurrency, "pool-draining");
    console.log(`worker pool force stop failed: ${message}`);
    process.exitCode = 1;
  }
}

async function startRuntimeWorkerPoolBackground(projectRoot: string, options: Record<string, string | boolean>): Promise<void> {
  if (!isRuntimeProjectInitialized(projectRoot)) {
    console.log("worker pool start: project is not initialized");
    process.exitCode = 1;
    return;
  }
  const existing = readRuntimeWorkerPool(projectRoot);
  const readIssue = runtimeWorkerPoolReadIssue(projectRoot);
  if (!existing && readIssue) {
    console.log(`worker pool start blocked: ${readIssue}`);
    console.log("next: inspect or remove .rph/runtime/worker-pool.json");
    process.exitCode = 1;
    return;
  }
  const existingIsActive = existing && ["starting", "running", "stopping"].includes(existing.status);
  const existingProcessState = existing ? runtimeWorkerPoolProcessState(existing) : "dead";
  if (existing && existingIsActive && (existingProcessState === "alive" || existingProcessState === "unknown")) {
    console.log(`worker pool start blocked: already running (${existing.poolId})`);
    console.log("next: rph agent pool status");
    process.exitCode = 1;
    return;
  }
  if (existing && existingIsActive && (existingProcessState === "dead" || existingProcessState === "identity-mismatch")) {
    console.log(`worker pool start: replacing stale pool ${existing.poolId}`);
  }

  const cliEntry = process.argv[1];
  if (!cliEntry) {
    console.log("worker pool start failed: unable to resolve CLI entrypoint");
    process.exitCode = 1;
    return;
  }

  const logPath = resolveRuntimeWorkerPoolLogPath(projectRoot, optionString(options, "log"));
  if (!logPath) {
    console.log("worker pool start failed: --log must resolve inside this project");
    process.exitCode = 1;
    return;
  }
  appendText(logPath, "");
  const concurrency = Math.max(1, Math.min(parseOptionalPositiveInt(optionString(options, "concurrency")) ?? 2, 6));
  const pollMs = Math.max(50, Math.min(parseOptionalPositiveInt(optionString(options, "poll-ms")) ?? 1_000, 30_000));
  const idleMs = Math.max(0, parseOptionalNonNegativeInt(optionString(options, "idle-ms")) ?? 0);
  const poolToken = randomUUID();
  const childArgs = [
    ...process.execArgv,
    cliEntry,
    "agent",
    "pool",
    "run",
    "--concurrency",
    String(concurrency),
    "--poll-ms",
    String(pollMs),
    "--idle-ms",
    String(idleMs)
  ];
  const maxCycles = parseOptionalPositiveInt(optionString(options, "max-cycles"));
  if (maxCycles) {
    childArgs.push("--max-cycles", String(maxCycles));
  }
  const laneMaxToolCalls = parseOptionalNonNegativeInt(optionString(options, "max-tool-calls"));
  if (laneMaxToolCalls !== undefined) {
    childArgs.push("--max-tool-calls", String(laneMaxToolCalls));
  }

  let logFd: number | null = null;
  try {
    logFd = fs.openSync(logPath, "a");
    const child = spawn(process.execPath, childArgs, {
      cwd: projectRoot,
      env: {
        ...process.env,
        RPH_WORKER_POOL_MODE: "background",
        RPH_WORKER_POOL_LOG: logPath,
        RPH_WORKER_POOL_TOKEN: poolToken
      },
      detached: true,
      stdio: ["ignore", logFd, logFd]
    });
    fs.closeSync(logFd);
    logFd = null;
    if (!child.pid) {
      console.log("worker pool start failed: background process did not expose a pid");
      process.exitCode = 1;
      return;
    }
    child.unref();

    const started = await waitForRuntimeWorkerPoolStart(projectRoot, child.pid, 2_000);
    if (!started) {
      const now = new Date().toISOString();
      writeRuntimeWorkerPool(projectRoot, {
        version: 1,
        poolId: `pool-starting-${child.pid}`,
        status: "starting",
        pid: child.pid,
        pidStartedAt: readProcessStartedAt(child.pid) ?? undefined,
        poolToken,
        startedAt: now,
        updatedAt: now,
        heartbeatAt: now,
        mode: "background",
        logPath,
        concurrency,
        pollMs,
        idleMs,
        cycles: 0,
        dispatched: 0,
        lastActionAt: now,
        lastBlocker: "background process has not written a running heartbeat yet"
      });
    }
    console.log("worker pool background started");
    console.log(`worker pool config: concurrency=${concurrency} poll_ms=${pollMs} idle_ms=${idleMs}`);
    console.log(`worker pool log: ${path.relative(projectRoot, logPath) || logPath}`);
    if (optionBool(options, "debug")) {
      console.log(`debug-pid=${child.pid}`);
    }
    if (!started) {
      console.log("worker pool start warning: background process has not written a running heartbeat yet");
    }
    console.log("next: rph agent pool status");
  } catch (error) {
    if (logFd !== null) {
      fs.closeSync(logFd);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.log(`worker pool start failed: ${message}`);
    process.exitCode = 1;
  }
}

async function waitForRuntimeWorkerPoolStart(projectRoot: string, pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const record = readRuntimeWorkerPool(projectRoot);
    if (record?.pid === pid && record.status === "running") {
      return true;
    }
    if (!processIsAlive(pid)) {
      return false;
    }
    await sleepMs(50);
  }
  return false;
}

async function waitForRuntimeWorkerPoolExit(record: RuntimeWorkerPoolRecord, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + Math.max(100, timeoutMs);
  while (Date.now() < deadline) {
    const processState = runtimeWorkerPoolProcessState(record);
    if (processState === "dead") {
      return true;
    }
    if (processState === "identity-mismatch") {
      return false;
    }
    await sleepMs(50);
  }
  return runtimeWorkerPoolProcessState(record) === "dead";
}

function printRuntimeWorkerPoolLogs(projectRoot: string, options: Record<string, string | boolean>): void {
  if (!isRuntimeProjectInitialized(projectRoot)) {
    console.log("worker pool logs: project is not initialized");
    return;
  }
  const record = readRuntimeWorkerPool(projectRoot);
  const logPath = record?.logPath ?? runtimeWorkerPoolLogFile(projectRoot);
  if (!fs.existsSync(logPath)) {
    console.log("worker pool logs: no log file");
    console.log(`expected: ${path.relative(projectRoot, logPath) || logPath}`);
    return;
  }
  const limit = parseOptionalPositiveInt(optionString(options, "limit")) ?? 80;
  const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/).filter(Boolean);
  console.log(`Worker pool logs: ${path.relative(projectRoot, logPath) || logPath}`);
  for (const line of lines.slice(-limit)) {
    console.log(redactRuntimeLogLine(line));
  }
}

function resolveRuntimeWorkerPoolLogPath(projectRoot: string, value: string | undefined): string | null {
  const target = path.resolve(projectRoot, value ?? runtimeWorkerPoolLogFile(projectRoot));
  const relative = path.relative(projectRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return target;
}

function redactRuntimeLogLine(value: string): string {
  return value
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1<redacted>")
    .replace(/("(?:api[_-]?key|token|secret|authorization|claimToken|workerSessionId|poolToken)"\s*:\s*")[^"]+(")/gi, "$1<redacted>$2")
    .replace(/((?:api[_-]?key|token|secret|authorization|claimToken|workerSessionId|poolToken)[=:]\s*)[^,\s}]+/gi, "$1<redacted>");
}

async function runRuntimeWorkerPool(projectRoot: string, options: Record<string, string | boolean>): Promise<void> {
  if (!isRuntimeProjectInitialized(projectRoot)) {
    console.log("worker pool: project is not initialized");
    process.exitCode = 1;
    return;
  }
  const existing = readRuntimeWorkerPool(projectRoot);
  const readIssue = runtimeWorkerPoolReadIssue(projectRoot);
  if (!existing && readIssue) {
    console.log(`worker pool blocked: ${readIssue}`);
    console.log("next: inspect or remove .rph/runtime/worker-pool.json");
    process.exitCode = 1;
    return;
  }
  const existingIsActive = existing && ["starting", "running", "stopping"].includes(existing.status);
  const existingProcessState = existing ? runtimeWorkerPoolProcessState(existing) : "dead";
  if (
    existing &&
    existingIsActive &&
    (existingProcessState === "alive" || existingProcessState === "unknown") &&
    existing.pid !== process.pid
  ) {
    console.log(`worker pool blocked: already running (${existing.poolId})`);
    console.log("next: rph agent pool status");
    process.exitCode = 1;
    return;
  }
  if (existing && existingIsActive && (existingProcessState === "dead" || existingProcessState === "identity-mismatch")) {
    console.log(`worker pool: replacing stale pool ${existing.poolId}`);
  }

  const concurrency = Math.max(1, Math.min(parseOptionalPositiveInt(optionString(options, "concurrency")) ?? 2, 6));
  const pollMs = Math.max(50, Math.min(parseOptionalPositiveInt(optionString(options, "poll-ms")) ?? 1_000, 30_000));
  const idleMs = Math.max(0, parseOptionalNonNegativeInt(optionString(options, "idle-ms")) ?? 0);
  const maxCycles = parseOptionalPositiveInt(optionString(options, "max-cycles"));
  const poolId = runtimeWorkerPoolIdFromEnv() ?? `pool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const poolToken = process.env.RPH_WORKER_POOL_TOKEN ?? randomUUID();
  const startedAt = new Date().toISOString();
  let record: RuntimeWorkerPoolRecord = {
    version: 1,
    poolId,
    status: "running",
    pid: process.pid,
    pidStartedAt: readProcessStartedAt(process.pid) ?? undefined,
    poolToken,
    startedAt,
    updatedAt: startedAt,
    heartbeatAt: startedAt,
    mode: process.env.RPH_WORKER_POOL_MODE === "background" || process.env.RPH_WORKER_POOL_MODE === "service"
      ? process.env.RPH_WORKER_POOL_MODE
      : "foreground",
    logPath: process.env.RPH_WORKER_POOL_LOG ? path.resolve(process.env.RPH_WORKER_POOL_LOG) : undefined,
    concurrency,
    pollMs,
    idleMs,
    cycles: 0,
    dispatched: 0,
    lastActionAt: startedAt,
    lastBlocker: null
  };
  writeRuntimeWorkerPool(projectRoot, record);
  refreshRuntimeWorkerSlots(projectRoot, poolId, concurrency, "available");
  console.log(`worker pool started: ${poolId}`);
  console.log(`worker pool config: concurrency=${concurrency} poll_ms=${pollMs} idle_ms=${idleMs}`);

  let idleSince = Date.now();
  let stopReason = "stopped";
  try {
    while (true) {
      const current = readRuntimeWorkerPool(projectRoot);
      if (current?.poolId === poolId && current.poolToken === poolToken && current.stopRequestedAt) {
        stopReason = current.stopReason ?? "stop requested";
        record = {
          ...record,
          status: "stopping",
          updatedAt: current.updatedAt,
          heartbeatAt: current.heartbeatAt,
          stopRequestedAt: current.stopRequestedAt,
          stopReason,
          stopMode: current.stopMode
        };
        break;
      }
      const heartbeatAt = new Date().toISOString();
      record = {
        ...record,
        status: "running",
        updatedAt: heartbeatAt,
        heartbeatAt
      };
      writeRuntimeWorkerPool(projectRoot, record);
      refreshRuntimeWorkerSlots(projectRoot, poolId, concurrency, current?.stopRequestedAt ? "pool-draining" : "available");

      console.log(`worker pool cycle ${record.cycles + 1}`);
      const result = await runAgentOrchestrationLoop(projectRoot, resolveRuntimeSessionId(projectRoot), {
        maxSteps: concurrency,
        concurrency,
        laneMaxToolCalls: parseOptionalNonNegativeInt(optionString(options, "max-tool-calls")),
        handoffsOnly: true,
        poolId
      });
      const now = new Date().toISOString();
      record = {
        ...record,
        cycles: record.cycles + 1,
        dispatched: record.dispatched + result.executed,
        updatedAt: now,
        heartbeatAt: now,
        lastBlocker: result.blocker
      };
      if (result.executed > 0) {
        record.lastActionAt = now;
        idleSince = Date.now();
      }
      writeRuntimeWorkerPool(projectRoot, record);
      refreshRuntimeWorkerSlots(projectRoot, poolId, concurrency, result.executed > 0 ? "available" : "no-claimable-handoff");

      if (maxCycles && record.cycles >= maxCycles) {
        stopReason = `max cycles reached (${maxCycles})`;
        break;
      }
      if (idleMs > 0 && result.executed === 0 && Date.now() - idleSince >= idleMs) {
        stopReason = `idle timeout (${idleMs}ms)`;
        break;
      }
      await sleepMs(pollMs);
    }
    const stoppedAt = new Date().toISOString();
    const activeWork = runtimeWorkerPoolActiveWorkSummary(projectRoot);
    if (activeWork) {
      writeRuntimeWorkerPool(projectRoot, {
        ...record,
        status: "failed",
        updatedAt: stoppedAt,
        heartbeatAt: stoppedAt,
        stoppedAt,
        stopReason: `pool stopped with unfinished work: ${activeWork}`
      });
      refreshRuntimeWorkerSlots(projectRoot, poolId, concurrency, "pool-draining");
      console.log(`worker pool failed: unfinished work remains (${activeWork})`);
      process.exitCode = 1;
      return;
    }
    writeRuntimeWorkerPool(projectRoot, {
      ...record,
      status: "stopped",
      updatedAt: stoppedAt,
      heartbeatAt: stoppedAt,
      stoppedAt,
      stopReason
    });
    refreshRuntimeWorkerSlots(projectRoot, poolId, concurrency, "available");
    console.log(`worker pool stopped: ${stopReason}`);
  } catch (error) {
    const failedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    writeRuntimeWorkerPool(projectRoot, {
      ...record,
      status: "failed",
      updatedAt: failedAt,
      heartbeatAt: failedAt,
      stoppedAt: failedAt,
      stopReason: message
    });
    refreshRuntimeWorkerSlots(projectRoot, poolId, concurrency, "pool-draining");
    throw error;
  }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function manualAgentWorkerId(): string {
  return "manual-runtime-agent";
}

function setupPrompterFromRuntimeReadline(rl: {
  question(query: string): Promise<string>;
  pause?: () => void;
  resume?: () => void;
}): SetupPrompter {
  return {
    question: async (query, options) => {
      if (!options?.secret) {
        return rl.question(query);
      }
      rl.pause?.();
      try {
        return await askHiddenText(query);
      } finally {
        rl.resume?.();
      }
    }
  };
}

function agentWorkerIdFromOptions(options: Record<string, string | boolean>): string {
  return optionString(options, "worker-id") ?? manualAgentWorkerId();
}

function leaseMsFromOptions(options: Record<string, string | boolean>): number {
  return parseOptionalPositiveInt(optionString(options, "lease-ms")) ?? 10 * 60 * 1000;
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
  appendText(path.join(runtimeDir, `${sessionId}.jsonl`), `${JSON.stringify(record)}\n`);
  if (isRuntimeProjectInitialized(projectRoot) && !isExitCommand(command)) {
    const session = loadRuntimeSession(projectRoot);
    if (ok && session?.status === "blocked" && !command.trim().startsWith("/")) {
      return;
    }
    recordRuntimeSessionEvent(projectRoot, sessionId, {
      kind: ok ? "checkpoint" : "error",
      message: command,
      ok
    });
  }
}

interface EphemeralRuntimeSetupIntent {
  plan: RuntimeActionPlan;
  resumeInput: string;
}

const ephemeralRuntimeSetupIntents = new Map<string, EphemeralRuntimeSetupIntent>();

function ephemeralRuntimeSetupIntentKey(projectRoot: string, sessionId: string): string {
  return `${path.resolve(projectRoot)}\0${sessionId}`;
}

function rememberEphemeralRuntimeSetupIntent(projectRoot: string, sessionId: string, plan: RuntimeActionPlan, resumeInput: string): void {
  ephemeralRuntimeSetupIntents.set(ephemeralRuntimeSetupIntentKey(projectRoot, sessionId), { plan, resumeInput });
}

function takeEphemeralRuntimeSetupIntent(projectRoot: string, sessionId: string): EphemeralRuntimeSetupIntent | undefined {
  const key = ephemeralRuntimeSetupIntentKey(projectRoot, sessionId);
  const intent = ephemeralRuntimeSetupIntents.get(key);
  ephemeralRuntimeSetupIntents.delete(key);
  return intent;
}

async function handleRuntimeAgentInput(
  projectRoot: string,
  sessionId: string,
  chatHistory: AiChatMessage[],
  userInput: string,
  prompter?: SetupPrompter
): Promise<boolean> {
  const confirmedIntent = await tryConfirmRuntimeIntentFromPlainChat(projectRoot, sessionId, userInput, "runtime-chat", prompter ? { prompter, runtimeShell: true } : undefined);
  if (confirmedIntent !== null) {
    return confirmedIntent;
  }
  const continued = await tryContinueRuntimeWorkFromPlainChat(projectRoot, sessionId, userInput);
  if (continued !== null) {
    return continued;
  }
  let plan = createRuntimePlan(projectRoot, userInput);
  const hasReadyAi = safeHasReadyAiProvider(projectRoot);
  const wasInitialized = isRuntimeProjectInitialized(projectRoot);
  if (!hasReadyAi && !wasInitialized && plan.kind === "chat") {
    plan = createRuntimeSetupOnboardingPlan();
    rememberEphemeralRuntimeSetupIntent(projectRoot, sessionId, plan, userInput);
    printExecutionPlanCard(userInput, plan, {
      confirmCommand: "confirm 또는 이 계획 실행해줘"
    });
    console.log(`suggested control: ${plan.command}`);
    console.log("run explicitly: type the suggested control when you want to execute it.");
    console.log("intent pending: setup bootstrap is kept in this shell until confirmed.");
    console.log("confirm exactly: confirm 또는 이 계획 실행해줘");
    return true;
  }
  if (isRuntimeProjectInitialized(projectRoot)) {
    recordRuntimeSessionEvent(projectRoot, sessionId, {
      kind: "plan",
      message: plan.reason,
      ok: true,
      plan
    });
  }
  if (plan.kind === "start-workflow" && plan.command) {
    const intent = isRuntimeProjectInitialized(projectRoot)
      ? recordRuntimePlanIntent(projectRoot, sessionId, plan)
      : null;
    printExecutionPlanCard(userInput, plan, {
      confirmCommand: intent
        ? `/agent confirm-intent ${intent.id}`
        : `rph ask --execute ${quoteShellArg(userInput)}`,
      dismissCommand: intent ? `/agent dismiss-intent ${intent.id}` : undefined
    });
    console.log(`suggested control: ${plan.command}`);
    console.log("run explicitly: type the suggested control when you want to execute it.");
    if (intent) {
      rememberPresentedIntent(projectRoot, sessionId, plan, intent);
      console.log(`intent saved: ${intent.id}`);
      console.log(`confirm: /agent confirm-intent ${intent.id}`);
      console.log(`dismiss: /agent dismiss-intent ${intent.id}`);
      if (plan.workflowTarget === "setup") {
        console.log("confirm exactly: confirm 또는 이 계획 실행해줘");
      }
    }
    return true;
  }
  if (plan.kind !== "chat" && plan.command) {
    console.log(`suggested control: ${plan.command}`);
  }
  if (plan.kind !== "chat" && plan.command) {
    console.log("run explicitly: type the suggested control when you want to execute it.");
  }
  if (!hasReadyAi) {
    printMissingAiAgentGuidance(projectRoot, plan.command, "slash");
    return false;
  }
  return handleRuntimeChat(projectRoot, sessionId, chatHistory, userInput);
}

async function tryContinueRuntimeWorkFromPlainChat(
  projectRoot: string,
  sessionId: string,
  userInput: string
): Promise<boolean | null> {
  if (naturalRuntimeIntent(userInput) !== "continue" || hasNaturalNegation(userInput) || !isRuntimeProjectInitialized(projectRoot)) {
    return null;
  }
  const state = loadState(projectRoot);
  const session = loadRuntimeSession(projectRoot);
  if (!session || session.status === "paused" || state.paused) {
    return null;
  }

  const reconciled = reconcileRuntimeStageQueue(projectRoot, session) ?? session;
  materializeRuntimeHandoffsFromSession(projectRoot, reconciled);
  const current = loadRuntimeSession(projectRoot) ?? reconciled;
  const recovery = runtimeRecoveryState(projectRoot, current);
  const hasRunnableQueue = recovery.claimableHandoffs.length > 0 || recovery.mergeableLaneRuns.length > 0 || Boolean(current.handoffPacket);
  if (!hasRunnableQueue) {
    if (recovery.pendingExternal?.status === "pending") {
      console.log(`continue blocked: external action requires explicit approval: /agent approve-action ${recovery.pendingExternal.id}`);
      return true;
    }
    if (recovery.pendingIntents.length > 0) {
      const next = [...recovery.pendingIntents].reverse().find((record) => !runtimeIntentConfirmBlocker(projectRoot, record));
      console.log(`continue blocked: pending runtime intent requires explicit confirmation: ${next ? `/agent confirm-intent ${next.id}` : "/agent intents"}`);
      console.log("confirm exactly: confirm 또는 이 계획 실행해줘");
      return true;
    }
    return null;
  }

  const command = "/agent run --steps 6";
  console.log(`plain continue: ${command}`);
  recordRuntimeSessionEvent(projectRoot, sessionId, {
    kind: "command",
    message: `plain continue: ${command}`,
    ok: true
  });
  await runAgentOrchestrationLoop(projectRoot, sessionId, {
    maxSteps: loopMaxSteps({}),
    concurrency: loopConcurrency({})
  });
  return true;
}

type NaturalRuntimeIntent = "start" | "continue" | "approve" | "reject" | "status" | "session" | "productDefinition";

function naturalRuntimeIntent(input: string): NaturalRuntimeIntent | null {
  const text = normalizeNaturalRuntimeText(input);
  if (!text || /[?？]/.test(input)) {
    return null;
  }
  const exact: Record<NaturalRuntimeIntent, string[]> = {
    start: ["시작", "시작해", "시작해줘", "start", "start now", "begin", "go"],
    continue: [
      "계속",
      "계속해",
      "계속해줘",
      "계속 진행",
      "계속 진행해",
      "계속 진행해줘",
      "다음 작업 진행",
      "다음 작업 진행해",
      "다음 작업 진행해줘",
      "이어해",
      "이어해줘",
      "continue",
      "continue now",
      "resume",
      "resume now",
      "지난 세션 이어서",
      "이전 세션 이어서",
      "지난 작업 이어서",
      "이전 작업 이어서",
      "세션 이어서",
      "이어서 진행",
      "이어서 진행해",
      "이어서 진행해줘",
      "다음 단계 진행",
      "다음 단계 진행해",
      "다음 단계 진행해줘",
      "다음 단계로 넘어가",
      "진행 재개",
      "진행 재개해",
      "pick up where we left off",
      "continue last session"
    ],
    approve: [
      "승인",
      "승인해",
      "승인해줘",
      "허용",
      "허용해",
      "이 계획 실행",
      "이 계획 실행해",
      "이 계획 실행해줘",
      "이 계획으로 실행",
      "이 계획으로 실행해",
      "이 계획으로 실행해줘",
      "실행해",
      "실행해줘",
      "approve",
      "approve it",
      "confirm",
      "confirm intent",
      "execute plan",
      "run plan",
      "allow"
    ],
    reject: ["거절", "거절해", "거절해줘", "반려", "반려해", "reject", "reject it", "deny", "decline"],
    status: [
      "현재 상태",
      "현재 상태 보여줘",
      "상태 보여줘",
      "상태 확인",
      "상태 확인해",
      "status",
      "show status",
      "current status"
    ],
    session: [
      "세션 보여줘",
      "지난 세션 보여줘",
      "이전 세션 보여줘",
      "세션 타임라인",
      "세션 리플레이",
      "replay session",
      "show session",
      "session timeline"
    ],
    productDefinition: [
      "제품 정의 시작",
      "제품 정의 시작해",
      "제품 정의 시작해줘",
      "제품 정의 만들어줘",
      "제품 정의 초안 만들어줘",
      "product definition start",
      "start product definition",
      "draft product definition"
    ]
  };
  for (const [intent, phrases] of Object.entries(exact) as Array<[NaturalRuntimeIntent, string[]]>) {
    if (phrases.includes(text)) {
      return intent;
    }
  }
  return null;
}

function normalizeNaturalRuntimeText(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[.!。]+$/g, "")
    .replace(/\s+/g, " ");
}

async function handleRuntimeChat(
  projectRoot: string,
  sessionId: string,
  chatHistory: AiChatMessage[],
  userInput: string
): Promise<boolean> {
  const config = loadRuntimeChatConfig(projectRoot);
  console.log(renderStatusLine("agent thinking", "skipped"));
  const turnResult = await executeAgentTurn({
    projectRoot,
    sessionId,
    userInput,
    history: chatHistory,
    config,
    system: agentChatSystemPrompt(),
    maxOutputTokens: 1800
  });
  const userMessage: AiChatMessage = {
    role: "user",
    content: userInput,
    at: turnResult.result.generatedAt
  };
  const assistantMessage: AiChatMessage = {
    role: "assistant",
    content: turnResult.text,
    at: turnResult.result.generatedAt
  };
  chatHistory.push(userMessage, assistantMessage);
  if (chatHistory.length > 24) {
    chatHistory.splice(0, chatHistory.length - 24);
  }
  if (isRuntimeProjectInitialized(projectRoot)) {
    writeAiChatTurnRecord(projectRoot, createAiChatTurnRecord(turnResult.result, sessionId, userInput, turnResult.prompt, turnResult.turn.id));
  }
  console.log("");
  printAiProviderFallbackNotice(turnResult.result);
  console.log(turnResult.text.trim());
  await runAgentCommandProposal(projectRoot, turnResult.turn.proposedCommand, {
    sessionId,
    surface: "runtime-chat"
  });
  runAgentHandoffProposal(projectRoot, sessionId, turnResult.turn.proposedHandoff);
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
  const sessionId = resolveRuntimeSessionId(projectRoot);
  const confirmedIntent = await tryConfirmRuntimeIntentFromPlainChat(projectRoot, sessionId, prompt, "user");
  if (confirmedIntent !== null) {
    return;
  }
  if (shouldSkipConfirmQuestionForPendingIntent(projectRoot, sessionId, prompt)) {
    console.log("plain confirm skipped: question-shaped confirmation text does not execute runtime intents.");
    console.log("confirm exactly: confirm 또는 이 계획 실행해줘");
    return;
  }
  const plan = createRuntimePlan(projectRoot, prompt);
  const executePlannedCommand = optionBool(options, "execute");
  if (plan.kind === "blocked") {
    console.log(`[blocked] ${plan.reason}`);
    return;
  }
  if (plan.kind !== "chat" && plan.command && plan.safeToAutoRun && executePlannedCommand) {
    if (shouldBlockUnsafeNaturalPlanExecution(prompt, plan.command)) {
      console.log("auto-run: blocked because the workflow-control intent is not an exact execution phrase");
      return;
    }
    console.log(`agent action: ${plan.command}`);
    console.log("execution-policy: ask --execute allowed local workflow command");
    const parsed = parseCli(parseCommandLine(plan.command));
    const ok = await runParsedCommand(projectRoot, parsed, false);
    if (ok && executePlannedCommand && optionBool(options, "loop") && isRuntimeProjectInitialized(projectRoot)) {
      await runAgentOrchestrationLoop(projectRoot, sessionId, {
        maxSteps: loopMaxSteps(options),
        concurrency: loopConcurrency(options),
        laneMaxToolCalls: parseOptionalNonNegativeInt(optionString(options, "max-tool-calls"))
      });
    }
    return;
  }
  if (plan.kind === "start-workflow" && plan.command) {
    const intent = isRuntimeProjectInitialized(projectRoot)
      ? recordRuntimePlanIntent(projectRoot, sessionId, plan)
      : null;
    printExecutionPlanCard(prompt, plan, {
      confirmCommand: intent
        ? `/agent confirm-intent ${intent.id}`
        : `rph ask --execute ${quoteShellArg(prompt)}`,
      dismissCommand: intent ? `/agent dismiss-intent ${intent.id}` : undefined
    });
    console.log(`suggested control: ${plan.command}`);
    console.log("run explicitly: type the suggested control or pass --execute.");
    if (intent) {
      rememberPresentedIntent(projectRoot, sessionId, plan, intent);
      console.log(`intent saved: ${intent.id}`);
      console.log(`confirm: /agent confirm-intent ${intent.id}`);
      console.log(`dismiss: /agent dismiss-intent ${intent.id}`);
    }
    return;
  }
  if (plan.kind !== "chat" && plan.command) {
    console.log(`${executePlannedCommand ? "agent proposed command" : "suggested control"}: ${plan.command}`);
    console.log(executePlannedCommand
      ? "run explicitly: the command is not marked safe for ask --execute."
      : "run explicitly: type the suggested control or pass --execute.");
    if (!safeHasReadyAiProvider(projectRoot)) {
      return;
    }
  }
  const config = loadRuntimeChatConfig(projectRoot);
  if (!hasReadyAiProvider(config)) {
    printMissingAiAgentGuidance(projectRoot, plan.command);
    return;
  }
  const chatHistory = loadRuntimeChatHistory(projectRoot, sessionId);
  const turnResult = await executeAgentTurn({
    projectRoot,
    sessionId,
    userInput: prompt,
    history: chatHistory,
    config,
    system: agentChatSystemPrompt(),
    maxOutputTokens: parseOptionalPositiveInt(optionString(options, "max-tokens")) ?? 1800
  });
  if (isRuntimeProjectInitialized(projectRoot)) {
    writeAiChatTurnRecord(projectRoot, createAiChatTurnRecord(turnResult.result, sessionId, prompt, turnResult.prompt, turnResult.turn.id));
  }
  printAiProviderFallbackNotice(turnResult.result);
  console.log(turnResult.text.trim());
  const executed = await runAgentCommandProposal(projectRoot, turnResult.turn.proposedCommand, {
    sessionId,
    executeLocalMutations: executePlannedCommand,
    surface: executePlannedCommand ? "execution" : "runtime-chat"
  });
  runAgentHandoffProposal(projectRoot, sessionId, turnResult.turn.proposedHandoff);
  if (executed && executePlannedCommand && optionBool(options, "loop") && isRuntimeProjectInitialized(projectRoot)) {
    await runAgentOrchestrationLoop(projectRoot, sessionId, {
      maxSteps: loopMaxSteps(options),
      concurrency: loopConcurrency(options),
      laneMaxToolCalls: parseOptionalNonNegativeInt(optionString(options, "max-tool-calls"))
    });
  }
}

async function tryConfirmRuntimeIntentFromPlainChat(
  projectRoot: string,
  sessionId: string,
  userInput: string,
  confirmedBy = "runtime-chat",
  commandContext?: CommandContext
): Promise<boolean | null> {
  const confirmMode = plainRuntimeConfirmMode(userInput);
  if (!confirmMode) {
    return null;
  }
  if (!isRuntimeProjectInitialized(projectRoot)) {
    const ephemeralSetup = takeEphemeralRuntimeSetupIntent(projectRoot, sessionId);
    if (!ephemeralSetup) {
      return null;
    }
    ensureRuntimeProjectForSetupIntent(projectRoot, sessionId);
    const intent = recordRuntimePlanIntent(projectRoot, sessionId, ephemeralSetup.plan);
    if (!intent) {
      return false;
    }
    rememberPresentedIntent(projectRoot, sessionId, ephemeralSetup.plan, intent);
    recordRuntimeSessionEvent(projectRoot, sessionId, {
      kind: "command",
      message: `plain confirm: /agent confirm-intent ${intent.id}`,
      ok: true
    });
    console.log(`plain confirm: /agent confirm-intent ${intent.id}`);
    const ok = await confirmAndRunRuntimeIntent(projectRoot, intent.id, {
      confirmedBy,
      commandContext
    });
    if (ok) {
      await resumeOriginalGoalAfterSetup(projectRoot, sessionId, ephemeralSetup.resumeInput);
    }
    if (ok && confirmMode === "confirm-and-continue") {
      console.log("plain confirm continue: running safe local orchestration loop");
      await runAgentOrchestrationLoop(projectRoot, sessionId, {
        maxSteps: loopMaxSteps({}),
        concurrency: loopConcurrency({})
      });
    }
    return ok;
  }
  const session = loadRuntimeSession(projectRoot);
  const pendingExternal = session?.pendingExternalActionId
    ? loadRuntimeActionApprovals(projectRoot).find((record) => record.id === session.pendingExternalActionId)
    : undefined;
  if (pendingExternal?.status === "pending") {
    console.log(`external action requires explicit approval: /agent approve-action ${pendingExternal.id}`);
    console.log("plain confirm did not approve a live external write.");
    return false;
  }
  const pendingIntents = loadRuntimeIntents(projectRoot)
    .filter((record) => record.status === "pending" && record.sessionId === sessionId)
    .reverse();
  if (pendingIntents.length === 0) {
    return null;
  }
  const presentedId = presentedIntentId(session);
  if (!presentedId) {
    console.log("intent blocked: no presented runtime intent to confirm");
    console.log("inspect: /agent intents");
    return false;
  }
  const presented = pendingIntents.find((record) => record.id === presentedId);
  if (!presented) {
    console.log(`intent blocked: presented runtime intent is no longer pending: ${presentedId}`);
    console.log("inspect: /agent intents");
    return false;
  }
  const confirmable = !runtimeIntentConfirmBlocker(projectRoot, presented) ? presented : undefined;
  if (!confirmable) {
    const blocker = runtimeIntentConfirmBlocker(projectRoot, presented) ?? "no confirmable runtime intent";
    console.log(`intent blocked: ${blocker}`);
    console.log("inspect: /agent intents");
    return false;
  }
  recordRuntimeSessionEvent(projectRoot, sessionId, {
    kind: "command",
    message: `plain confirm: /agent confirm-intent ${confirmable.id}`,
    ok: true
  });
  console.log(`plain confirm: /agent confirm-intent ${confirmable.id}`);
  const ok = await confirmAndRunRuntimeIntent(projectRoot, confirmable.id, {
    confirmedBy,
    commandContext
  });
  if (ok && confirmMode === "confirm-and-continue") {
    console.log("plain confirm continue: running safe local orchestration loop");
    await runAgentOrchestrationLoop(projectRoot, sessionId, {
      maxSteps: loopMaxSteps({}),
      concurrency: loopConcurrency({})
    });
  }
  return ok;
}

function plainRuntimeConfirmMode(input: string): "confirm" | "confirm-and-continue" | null {
  if (/[?？]/.test(input)) {
    return null;
  }
  const text = normalizeNaturalRuntimeText(input);
  if (!text) {
    return null;
  }
  const continuePhrases = [
    "이 계획 실행하고 계속해줘",
    "이 계획 실행하고 가능한 데까지 계속해줘",
    "이 계획 실행하고 가능한 데까지 진행해줘",
    "이 계획 실행하고 승인 전까지 진행해줘",
    "이 계획 실행하고 로컬로 가능한 데까지 계속해줘",
    "confirm and continue",
    "execute plan and continue",
    "run plan and continue"
  ];
  if (continuePhrases.includes(text)) {
    return "confirm-and-continue";
  }
  if (/^이 계획 실행하고 (?:(?:가능한 데까지|승인 전까지|로컬로 가능한 데까지) )?(?:계속|진행)해줘$/.test(text)) {
    return "confirm-and-continue";
  }
  if (/^(?:confirm|execute plan|run plan) and continue$/.test(text)) {
    return "confirm-and-continue";
  }
  return naturalRuntimeIntent(input) === "approve" ? "confirm" : null;
}

function rememberPresentedIntent(
  projectRoot: string,
  sessionId: string,
  _plan: RuntimeActionPlan,
  intent: RuntimeIntentRecord
): void {
  updateRuntimeSession(projectRoot, sessionId, {
    lastPresentedIntentId: intent.id,
    note: `runtime intent presented: ${intent.id}`
  });
}

function rememberPresentedProposalIntent(
  projectRoot: string,
  sessionId: string,
  _proposal: { command: string; safeToAutoRun: boolean; reason?: string },
  intent: RuntimeIntentRecord
): void {
  updateRuntimeSession(projectRoot, sessionId, {
    lastPresentedIntentId: intent.id,
    note: `runtime intent presented: ${intent.id}`
  });
}

function presentedIntentId(session: RuntimeSessionManifest | null): string | undefined {
  if (session?.lastPresentedIntentId) {
    return session.lastPresentedIntentId;
  }
  const reason = session?.pendingAction?.reason;
  return reason?.match(/(?:^|;\s*)intent=(intent_[A-Za-z0-9_-]+)/)?.[1];
}

function shouldSkipConfirmQuestionForPendingIntent(projectRoot: string, sessionId: string, userInput: string): boolean {
  if (!/[?？]/.test(userInput) || !isRuntimeProjectInitialized(projectRoot)) {
    return false;
  }
  const withoutQuestion = userInput.replace(/[?？]+/g, "").trim();
  if (!plainRuntimeConfirmMode(withoutQuestion)) {
    return false;
  }
  return loadRuntimeIntents(projectRoot).some((record) => record.status === "pending" && record.sessionId === sessionId);
}

type RuntimeActionPlan = ReturnType<typeof createRuntimePlan>;

function recordRuntimePlanIntent(
  projectRoot: string,
  sessionId: string,
  plan: RuntimeActionPlan
): RuntimeIntentRecord | null {
  if (!plan.command) {
    return null;
  }
  const readOnly = isReadOnlyAgentCommand(plan.command);
  const localMutation = isLocalAgentCommand(plan.command);
  const mutableExternalAction = classifyMutableAgentCommand(plan.command);
  const userApprovalAction = isUserApprovalAgentCommand(plan.command);
  return recordRuntimeIntent(projectRoot, {
    sessionId,
    command: plan.command,
    risk: runtimeIntentRisk(readOnly, localMutation, Boolean(mutableExternalAction), userApprovalAction),
    safeToAutoRun: plan.safeToAutoRun,
    ...createRuntimeIntentContext(projectRoot, sessionId),
    reason: plan.reason,
    message: "runtime plan created from plain chat"
  });
}

function printExecutionPlanCard(
  userInput: string,
  plan: RuntimeActionPlan,
  options: {
    confirmCommand?: string;
    dismissCommand?: string;
  } = {}
): void {
  console.log("Execution plan");
  console.log(`goal: ${executionPlanGoal(userInput, plan)}`);
  if (plan.workflowTarget) {
    console.log(`workflow: ${plan.workflowTarget}`);
  }
  console.log(`confidence: ${Math.round(plan.confidence * 100)}%`);
  console.log("steps:");
  plan.steps.forEach((step, index) => {
    console.log(`${index + 1}. ${step}`);
  });
  if (plan.command) {
    console.log(`next safe step: ${plan.command}`);
  }
  console.log(`approvals: ${executionPlanApprovalNote(plan.command)}`);
  if (options.confirmCommand) {
    console.log(`confirm: ${options.confirmCommand}`);
  }
  if (options.dismissCommand) {
    console.log(`dismiss: ${options.dismissCommand}`);
  }
}

function printAgentProposalPlanCard(
  proposal: { command: string; safeToAutoRun: boolean; reason?: string },
  intent: RuntimeIntentRecord
): void {
  console.log("Execution plan");
  console.log(`goal: Review and run the agent's suggested control only after confirmation.`);
  console.log("steps:");
  console.log(`1. Review suggested command: ${proposal.command}`);
  console.log("2. Confirm the saved runtime intent if this is the intended next action.");
  if (intent.risk === "external_live_write") {
    console.log("3. Complete the separate external action approval before any live write runs.");
  }
  console.log(`next safe step: ${proposal.command}`);
  console.log(`approvals: ${executionPlanApprovalNote(proposal.command, intent.risk)}`);
  console.log(`confirm: /agent confirm-intent ${intent.id}`);
  console.log(`dismiss: /agent dismiss-intent ${intent.id}`);
}

function executionPlanGoal(userInput: string, plan: RuntimeActionPlan): string {
  if (plan.workflowTarget === "productize") {
    return `Create a reviewable product execution package for: ${extractProductIdea(userInput)}`;
  }
  if (plan.workflowTarget === "setup") {
    return "Connect AI and MCP providers until the harness can prove readiness.";
  }
  if (plan.command) {
    return `Prepare the next explicit control: ${plan.command}`;
  }
  return plan.reason;
}

function executionPlanApprovalNote(command: string | undefined, knownRisk?: RuntimeIntentRecord["risk"]): string {
  if (!command) {
    return "none yet";
  }
  const risk = knownRisk ?? runtimeIntentRisk(
    isReadOnlyAgentCommand(command),
    isLocalAgentCommand(command),
    Boolean(classifyMutableAgentCommand(command)),
    isUserApprovalAgentCommand(command)
  );
  switch (risk) {
    case "read_only":
      return "none; read-only inspection";
    case "local_mutation":
      return "no external write; confirmation runs one local workflow step";
    case "external_live_write":
      return "external live write remains gated by /agent approve-action";
    case "user_approval":
      return "requires direct user approval command; plain confirm will not bypass it";
    case "unsupported":
      return "unsupported command; must be run explicitly";
  }
}

function shouldBlockUnsafeNaturalPlanExecution(input: string, command: string): boolean {
  const trimmed = input.trim();
  if (!trimmed || trimmed.startsWith("/")) {
    return false;
  }
  if (hasNaturalNegation(trimmed)) {
    return true;
  }
  if (/^\/(?:agent (?:run|continue)|resume|pm start)\b/.test(command.trim())) {
    const intent = naturalRuntimeIntent(trimmed);
    if (command.trim().startsWith("/pm start")) {
      return intent !== "start" && intent !== "productDefinition";
    }
    return intent !== "continue";
  }
  return false;
}

function hasNaturalNegation(input: string): boolean {
  const text = normalizeNaturalRuntimeText(input);
  return /(?:하지마|하지 말|말고|나중에|아직|보류|don't|do not|not yet|later|hold off)/i.test(text)
    || /\bnot\b/i.test(text)
    || /(?:^|\s)안\s*\S+/.test(text);
}

async function handleAgentRun(projectRoot: string, options: Record<string, string | boolean>): Promise<void> {
  if (printRuntimeHandoffsReadIssue(projectRoot)) {
    return;
  }
  const sessionId = resolveRuntimeSessionId(projectRoot);
  await runAgentOrchestrationLoop(projectRoot, sessionId, {
    maxSteps: loopMaxSteps(options),
    concurrency: loopConcurrency(options),
    laneMaxToolCalls: parseOptionalNonNegativeInt(optionString(options, "max-tool-calls"))
  });
}

async function handleStart(
  projectRoot: string,
  args: string[],
  options: Record<string, string | boolean>,
  context: CommandContext = {}
): Promise<void> {
  const message = args.join(" ").trim();
  if (!isRuntimeProjectInitialized(projectRoot)) {
    if (shouldStartLaunchSetup(options, context)) {
      console.log("RPH runtime: setup needed before agent chat");
      console.log("setup assistant: rph setup auto --live");
      const projectName = optionString(options, "project-name") ?? (path.basename(projectRoot) || "RPH Project");
      initProject(projectRoot, { projectName });
      console.log(`RPH project initialized: ${projectName}`);
      const setupOptions = { ...options, live: true };
      await runAutoSetupWizard(projectRoot, setupOptions, context);
      if (message) {
        await handleAsk(projectRoot, [message], options);
        return;
      }
      if (process.stdin.isTTY && process.stdout.isTTY && safeHasReadyAiProvider(projectRoot)) {
        console.log("handoff: entering runtime");
        await runRuntimeShell(projectRoot);
      }
      return;
    }
    if (process.stdin.isTTY && process.stdout.isTTY) {
      console.log("RPH runtime: setup needed before agent chat");
      console.log("setup assistant: rph setup auto --live");
      const projectName = optionString(options, "project-name") ?? (path.basename(projectRoot) || "RPH Project");
      initProject(projectRoot, { projectName });
      console.log(`RPH project initialized: ${projectName}`);
      const setupOptions = { ...options, live: true };
      await runAutoSetupWizard(projectRoot, setupOptions, context);
      if (safeHasReadyAiProvider(projectRoot)) {
        console.log("handoff: entering runtime");
        await runRuntimeShell(projectRoot);
      } else {
        console.log("handoff: setup complete");
        console.log("next: rph setup auto --live 또는 rph pm start");
      }
      return;
    }
    printRuntimeRecoveryCard(projectRoot, {
      title: "RPH start",
      reason: "setup required before agent chat can run",
      commandSurface: "rph"
    });
    return;
  }
  printPersistedConfigRepairSummary(projectRoot, commandSurfaceFromOptions(options));
  if (message) {
    await handleAsk(projectRoot, [message], options);
    return;
  }
  if (!safeHasReadyAiProvider(projectRoot)) {
    printMissingAiAgentGuidance(projectRoot);
    return;
  }
  if (process.stdin.isTTY) {
    await runRuntimeShell(projectRoot);
    return;
  }
  await handleAsk(projectRoot, ["현재 상태를 보고 다음으로 할 일을 제안해줘"], options);
}

function shouldStartLaunchSetup(options: Record<string, string | boolean>, context: CommandContext): boolean {
  return optionBool(options, "setup")
    || optionBool(options, "live")
    || optionBool(options, "from-env")
    || Boolean(optionString(options, "ai") ?? optionString(options, "provider") ?? optionString(options, "mcp"))
    || Boolean(context.prompter);
}

interface OrchestrationLoopOptions {
  maxSteps: number;
  concurrency: number;
  laneMaxToolCalls?: number;
  handoffsOnly?: boolean;
  poolId?: string;
}

async function runAgentOrchestrationLoop(
  projectRoot: string,
  sessionId: string,
  options: OrchestrationLoopOptions
): Promise<OrchestrationLoopResult> {
  const maxSteps = Math.max(1, Math.min(options.maxSteps, 12));
  const concurrency = Math.max(1, Math.min(options.concurrency, 6));
  let executed = 0;
  let stoppedWithBlocker: string | null = null;
  console.log(`orchestration loop: max_steps=${maxSteps} concurrency=${concurrency}`);
  printReapedDeadWorkerLeases(reapDeadHandoffWorkerLeases(projectRoot));
  const reattached = integratePendingCompletedLaneResults(projectRoot);
  if (reattached) {
    printIntegratedPendingLaneResults(reattached, "orchestration");
    materializeRuntimeHandoffsFromSession(projectRoot, reconcileRuntimeStageQueue(projectRoot, loadRuntimeSession(projectRoot)));
    if (isRuntimeProjectInitialized(projectRoot)) {
      recordRuntimeSessionEvent(projectRoot, sessionId, {
        kind: reattached.status === "blocked" ? "error" : "checkpoint",
        message: `reattached ${reattached.mergedRunIds.length}/${reattached.runIds.length} pending lane result(s)`,
        ok: reattached.status !== "blocked"
      });
      updateRuntimeContinuation(projectRoot, sessionId, reattached.status !== "blocked");
    }
    if (reattached.status === "blocked") {
      stoppedWithBlocker = `pending lane result integration blocked: ${reattached.failedRunIds.join(", ")}`;
      console.log(`orchestration blocked: ${stoppedWithBlocker}`);
    }
    executed += 1;
  }
  while (!stoppedWithBlocker && executed < maxSteps) {
    const actions = selectNextOrchestrationActions(projectRoot, Math.min(concurrency, maxSteps - executed));
    if (actions.length === 0) {
      stoppedWithBlocker = "no executable local action";
      console.log(`orchestration blocked: ${stoppedWithBlocker}`);
      break;
    }
    if (options.handoffsOnly && actions.every((action) => action.source !== "handoff")) {
      stoppedWithBlocker = "no claimable handoff work";
      console.log(`orchestration idle: ${stoppedWithBlocker}`);
      break;
    }
    const firstBlocked = actions.find((action) => !action.command);
    if (firstBlocked) {
      const action = firstBlocked;
      const blocker = action.blocker ?? "no executable local action";
      stoppedWithBlocker = blocker;
      console.log(`orchestration blocked: ${blocker}`);
      if (isRuntimeProjectInitialized(projectRoot)) {
        updateRuntimeSession(projectRoot, sessionId, {
          blocker,
          note: `orchestration blocked: ${action.source}`
        });
      }
      break;
    }
    const unsafe = actions.find((action) => action.command && !isAutonomousLocalCommand(action.command));
    if (unsafe?.command) {
      const blocker = `approval or external action required before ${unsafe.command}`;
      stoppedWithBlocker = blocker;
      console.log(`orchestration blocked: ${blocker}`);
      if (isRuntimeProjectInitialized(projectRoot)) {
        updateRuntimeSession(projectRoot, sessionId, {
          blocker,
          note: `orchestration blocked unsafe command: ${unsafe.command}`
        });
      }
      break;
    }

    if (actions.length > 1) {
      console.log(`parallel scheduler: dispatching ${actions.length} lane(s)`);
    }
    const poolSlotIndexes = options.poolId
      ? runtimeWorkerPoolFreeSlotIndexes(projectRoot, options.poolId, concurrency)
      : [];
    const handoffActions = actions.filter((action) => action.handoffId);
    if (options.poolId && poolSlotIndexes.length < handoffActions.length) {
      stoppedWithBlocker = `worker pool is full: free slots=${poolSlotIndexes.length} handoffs=${handoffActions.length}`;
      console.log(`orchestration blocked: ${stoppedWithBlocker}`);
      break;
    }
    let nextPoolSlot = 0;
    const results = await Promise.all(actions.map(async (action, index) => {
      const command = action.command!;
      console.log(`orchestrator step ${executed + index + 1}: ${command}`);
      if (action.handoffId) {
        const slotIndex = options.poolId ? poolSlotIndexes[nextPoolSlot++] : undefined;
        const ok = await runHandoffWorkerProcess(projectRoot, action.handoffId, {
          laneMaxToolCalls: options.laneMaxToolCalls,
          poolId: options.poolId,
          slotIndex
        });
        const laneRunId = loadRuntimeHandoffs(projectRoot).find((handoff) => handoff.id === action.handoffId)?.laneRunId;
        return { action, command, ok, laneRunId };
      }
      const ok = await runParsedCommand(projectRoot, parseCli(parseCommandLine(command)), false);
      return { action, command, ok, laneRunId: undefined };
    }));

    const laneRunIds = results
      .map((result) => result.laneRunId)
      .filter((runId): runId is string => Boolean(runId));
    if (laneRunIds.length > 0) {
      const integration = integrateAgentLaneBatch(projectRoot, laneRunIds);
      const message = `integrator: ${integration.status} ${integration.mergedRunIds.length}/${integration.runIds.length} lane result(s)`;
      console.log(message);
      materializeRuntimeHandoffsFromSession(projectRoot, reconcileRuntimeStageQueue(projectRoot, loadRuntimeSession(projectRoot)));
      refreshRuntimeWorkerSlots(projectRoot, options.poolId);
      if (isRuntimeProjectInitialized(projectRoot)) {
        recordRuntimeSessionEvent(projectRoot, sessionId, {
          kind: integration.status === "blocked" ? "error" : "checkpoint",
          message,
          ok: integration.status !== "blocked"
        });
      }
    }

    for (const result of results) {
      if (isRuntimeProjectInitialized(projectRoot)) {
        recordRuntimeSessionEvent(projectRoot, sessionId, {
          kind: result.ok ? "command" : "error",
          message: result.command,
          ok: result.ok,
          plan: planAgentAction({
            text: result.command,
            initialized: true,
            currentStage: loadState(projectRoot).currentStage
          })
        });
        if (result.ok) {
          updateRuntimeContinuation(projectRoot, sessionId, true);
        }
      }
    }
    const failed = results.find((result) => !result.ok);
    if (failed) {
      stoppedWithBlocker = `orchestration command failed: ${failed.command}`;
      console.log(`orchestration blocked: ${stoppedWithBlocker}`);
      if (isRuntimeProjectInitialized(projectRoot)) {
        updateRuntimeSession(projectRoot, sessionId, {
          blocker: stoppedWithBlocker,
          incrementRetryCount: true,
          note: "orchestration command failed"
        });
      }
      break;
    }
    executed += results.length;
  }
  if (executed >= maxSteps) {
    console.log("orchestration loop: step limit reached");
  }
  if (executed > 0 && isRuntimeProjectInitialized(projectRoot)) {
    const state = loadState(projectRoot);
    updateRuntimeSession(projectRoot, sessionId, {
      status: stoppedWithBlocker ? "blocked" : state.paused ? "paused" : "active",
      stage: state.currentStage,
      blocker: stoppedWithBlocker,
      checkpoint: `orchestration loop executed ${executed} step(s)`,
      note: "orchestration loop checkpoint"
    });
  }
  return { executed, blocker: stoppedWithBlocker };
}

function selectNextOrchestrationAction(projectRoot: string): OrchestrationAction {
  return selectNextOrchestrationActions(projectRoot, 1)[0] ?? { source: "stage-action", blocker: "no executable local action" };
}

function selectNextOrchestrationActions(projectRoot: string, capacity: number): OrchestrationAction[] {
  if (!isRuntimeProjectInitialized(projectRoot)) {
    return [planOrchestrationAction({ initialized: false })];
  }
  const state = loadState(projectRoot);
  materializeRuntimeHandoffsFromSession(projectRoot);
  const handoffsWithNextCommand = loadRuntimeHandoffs(projectRoot).filter((record) => Boolean(record.packet.nextCommand));
  const activeLeasedHandoffs = handoffsWithNextCommand.filter((record) => {
    return (record.status === "claimed" || record.status === "running") && !isRuntimeHandoffClaimable(record);
  });
  const availableCapacity = Math.max(0, capacity - activeLeasedHandoffs.length);
  const claimableHandoffs = handoffsWithNextCommand.filter((record) => isRuntimeHandoffClaimable(record));
  if (claimableHandoffs.length > 0 && availableCapacity > 0) {
    return claimableHandoffs
      .slice(0, availableCapacity)
      .map((handoff) => planHandoffOrchestrationAction(projectRoot, state, handoff));
  }
  if (activeLeasedHandoffs.length > 0) {
    if (activeLeasedHandoffs.length === 1) {
      const handoff = activeLeasedHandoffs[0];
      return [{
        source: "handoff",
        blocker: `handoff ${handoff.id} has active lease held by ${handoff.claimedBy ?? "unknown"} until ${handoff.leaseExpiresAt ?? "unknown"}`
      }];
    }
    const leases = activeLeasedHandoffs
      .slice(0, 3)
      .map((handoff) => `${handoff.id} by ${handoff.claimedBy ?? "unknown"} until ${handoff.leaseExpiresAt ?? "unknown"}`)
      .join("; ");
    return [{
      source: "handoff",
      blocker: `worker pool is full or leases are active: ${leases}`
    }];
  }
  const session = loadRuntimeSession(projectRoot);
  const advance = workflowAdvanceStatus(state);
  return [planOrchestrationAction({
    initialized: true,
    paused: state.paused,
    currentStage: state.currentStage,
    currentNextStages: WORKFLOW_STAGES[state.currentStage].nextStages,
    pendingActionCommand: session?.pendingAction?.command,
    canAdvance: advance.canAdvance,
    recommendedCommand: recommendedAgentCommand(state),
    hasReadyAiProvider: safeHasReadyAiProvider(projectRoot)
  })];
}

function planHandoffOrchestrationAction(
  projectRoot: string,
  state: ProjectState,
  pendingHandoff: RuntimeHandoffRecord
): OrchestrationAction {
  const detachedStageQueueHandoff = pendingHandoff.packet.resumeCursor?.startsWith("stage-queue:")
    || pendingHandoff.packet.resumeCursor?.startsWith("fan-in:");
  return planOrchestrationAction({
    initialized: true,
    paused: state.paused,
    currentStage: state.currentStage,
    currentNextStages: WORKFLOW_STAGES[state.currentStage].nextStages,
    pendingHandoff: pendingHandoff.packet.nextCommand
      ? {
          id: pendingHandoff.id,
          stage: detachedStageQueueHandoff ? state.currentStage : pendingHandoff.packet.stage,
          nextCommand: pendingHandoff.packet.nextCommand,
          contractViolation: handoffContractViolation(pendingHandoff.packet)
        }
      : undefined,
    handoffStageTransition: !detachedStageQueueHandoff && pendingHandoff.packet.nextCommand && pendingHandoff.packet.stage !== state.currentStage
      ? canTransition(state, pendingHandoff.packet.stage)
      : undefined,
    hasReadyAiProvider: safeHasReadyAiProvider(projectRoot)
  });
}

function runtimeWorkerPoolFreeSlotIndexes(projectRoot: string, poolId: string, concurrency: number): number[] {
  const handoffs = loadRuntimeHandoffs(projectRoot);
  const handoffById = new Map(handoffs.map((handoff) => [handoff.id, handoff]));
  const occupied = new Set<number>();
  for (const handoff of handoffs) {
    if (
      handoff.poolId === poolId
      && handoff.slotIndex !== undefined
      && (handoff.status === "claimed" || handoff.status === "running")
      && !isRuntimeHandoffClaimable(handoff)
    ) {
      occupied.add(handoff.slotIndex);
    }
  }
  for (const lane of loadAgentLaneRuns(projectRoot)) {
    if (lane.poolId !== poolId || lane.slotIndex === undefined || (lane.status !== "claimed" && lane.status !== "running")) {
      continue;
    }
    const handoff = lane.handoffId ? handoffById.get(lane.handoffId) : undefined;
    if (!handoff || ((handoff.status === "claimed" || handoff.status === "running") && !isRuntimeHandoffClaimable(handoff))) {
      occupied.add(lane.slotIndex);
    }
  }
  const slots: number[] = [];
  for (let index = 0; index < concurrency; index += 1) {
    if (!occupied.has(index)) {
      slots.push(index);
    }
  }
  return slots;
}

async function runHandoffWorkerProcess(
  projectRoot: string,
  handoffId: string,
  options: Pick<OrchestrationLoopOptions, "laneMaxToolCalls" | "poolId"> & { slotIndex?: number }
): Promise<boolean> {
  const record = loadRuntimeHandoffs(projectRoot).find((item) => item.id === handoffId);
  if (!record) {
    console.log(`handoff worker blocked: handoff not found: ${handoffId}`);
    return false;
  }
  const slotId = options.poolId && options.slotIndex !== undefined ? `${options.poolId}:slot-${options.slotIndex}` : undefined;
  const workerId = laneWorkerId(record.packet.toAgent, handoffId, options.poolId, options.slotIndex);
  const cliEntry = process.argv[1];
  if (!cliEntry) {
    console.log("handoff worker blocked: cli entry not available");
    return false;
  }
  const childEnv = {
    ...process.env,
    RPH_LANE_WORKER: "1",
    RPH_ORCHESTRATOR_PID: String(process.pid),
    ...(options.poolId ? { RPH_WORKER_POOL_ID: options.poolId } : {}),
    ...(slotId ? { RPH_WORKER_SLOT_ID: slotId } : {}),
    ...(options.slotIndex === undefined ? {} : { RPH_WORKER_SLOT_INDEX: String(options.slotIndex) }),
    ...(options.laneMaxToolCalls === undefined ? {} : { RPH_LANE_MAX_TOOL_CALLS: String(options.laneMaxToolCalls) })
  };
  const ok = await new Promise<boolean>((resolve) => {
    const child = spawn(process.execPath, [
      ...process.execArgv,
      cliEntry,
      "agent",
      "worker",
      "run",
      handoffId,
      "--worker-id",
      workerId
    ], {
      cwd: projectRoot,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      console.log(`handoff worker failed to launch: ${error.message}`);
      resolve(false);
    });
    child.on("close", (status) => {
      if (stdout) {
        process.stdout.write(stdout);
      }
      if (stderr) {
        process.stderr.write(stderr);
      }
      resolve(status === 0);
    });
  });
  if (ok) {
    const completed = loadRuntimeHandoffs(projectRoot).find((item) => item.id === handoffId);
    if (!completed || completed.status !== "completed") {
      console.log(`handoff worker blocked: ${handoffId} exited without durable completion`);
      return false;
    }
    if (completed?.laneRunId) {
      const merged = mergeAgentLaneRun(projectRoot, completed.laneRunId, `control-plane merged worker result for ${handoffId}`);
      console.log(`lane result merged: ${merged.id}`);
      refreshRuntimeWorkerSlots(projectRoot, options.poolId);
    }
  }
  return ok;
}

async function runHandoffWorker(
  projectRoot: string,
  handoffId: string,
  workerId: string,
  leaseMs: number,
  options: { laneMaxToolCalls?: number; debug?: boolean } = {}
): Promise<boolean> {
  const record = loadRuntimeHandoffs(projectRoot).find((item) => item.id === handoffId);
  if (!record) {
    console.log(`handoff runner blocked: handoff not found: ${handoffId}`);
    return false;
  }
  const violation = handoffContractViolation(record.packet);
  if (violation) {
    console.log(`handoff runner blocked: ${violation}`);
    return false;
  }
  if (!isRuntimeHandoffClaimable(record)) {
    console.log(`handoff runner skipped: active lease for ${handoffId} held by ${record.claimedBy ?? "unknown"}`);
    return false;
  }
  const poolId = process.env.RPH_WORKER_POOL_ID;
  const slotId = process.env.RPH_WORKER_SLOT_ID;
  const slotIndex = parseOptionalNonNegativeInt(process.env.RPH_WORKER_SLOT_INDEX);
  const claimed = claimRuntimeHandoff(projectRoot, handoffId, workerId, leaseMs, new Date(), {
    poolId,
    slotId,
    slotIndex
  });
  const claimToken = runtimeHandoffExecutionToken(claimed);
  const lane = startAgentLaneRun(projectRoot, {
    sessionId: record.sessionId,
    handoffId,
    workerId,
    workerSessionId: claimed.workerSessionId,
    claimToken: claimToken.claimToken,
    workerPid: process.pid,
    poolId,
    slotId,
    slotIndex,
    attempt: claimed.attempts,
    packet: record.packet,
    command: record.packet.nextCommand ?? "",
    leaseExpiresAt: claimed.leaseExpiresAt,
    toolBudget: options.laneMaxToolCalls === undefined
      ? undefined
      : {
          maxToolCalls: options.laneMaxToolCalls,
          remainingToolCalls: options.laneMaxToolCalls
        }
  });
  const workToken = { ...claimToken, laneRunId: lane.id };
  startRuntimeHandoffWork(projectRoot, handoffId, workToken, lane.id, leaseMs);
  refreshRuntimeWorkerSlots(projectRoot, poolId);
  console.log(`role runner: ${record.packet.toAgent} (${record.packet.stage}) lane=${lane.id}`);
  console.log(`role worker: ${workerId}`);
  if (poolId) {
    console.log(`role pool: ${poolId}`);
  }
  if (slotId) {
    console.log(`role slot: ${slotId}`);
  }
  if (options.debug) {
    console.log(`role worker-session: ${claimed.workerSessionId}`);
    console.log(`role worker-pid: ${process.pid}`);
  }
  if (process.env.RPH_ORCHESTRATOR_PID) {
    console.log(`role orchestrator-pid: ${process.env.RPH_ORCHESTRATOR_PID}`);
  }
  console.log(`role lease: ${claimed.leaseExpiresAt}`);
  console.log(`role prompt: ${lane.systemPrompt.split("\n")[0]}`);
  const heartbeat = heartbeatRuntimeHandoff(projectRoot, handoffId, workToken, leaseMs);
  heartbeatAgentLaneRun(projectRoot, lane.id, heartbeat.leaseExpiresAt);
  const stopHeartbeat = startLaneHeartbeat(projectRoot, handoffId, workToken, lane.id, leaseMs);
  const command = record.packet.nextCommand;
  try {
    const executeLaneWork = async (): Promise<boolean> => {
      if (!command) {
        console.log(`handoff runner blocked: next command missing: ${handoffId}`);
        failRuntimeHandoffAttempt(projectRoot, handoffId, workToken, "lane execution failed: missing next command");
        return false;
      }
      const branchStateBeforeCommand = loadState(projectRoot);
      const autonomous = await runAutonomousLaneWorker(projectRoot, record, lane, command);
      const fallbackCommand = autonomous.attempted ? command : providerlessLaneFallbackCommand(projectRoot, command);
      if (!autonomous.attempted && fallbackCommand !== command) {
        console.log(`role fallback command: ${fallbackCommand}`);
      }
      let ok: boolean;
      let budgetError: string | undefined;
      if (autonomous.attempted) {
        ok = autonomous.ok;
      } else {
        const sandboxBlocker = executionProfileSandboxCommandBlocker(lane.executionProfile, fallbackCommand);
        budgetError = sandboxBlocker
          ? `lane command rejected by active TOML sandbox: ${sandboxBlocker}`
          : consumeLaneBudget(projectRoot, lane.id, `local command ${fallbackCommand}`);
        ok = budgetError ? false : await runParsedCommand(projectRoot, parseCli(parseCommandLine(fallbackCommand)), false);
      }
      if (ok) {
        restoreDetachedStageQueueBranchState(projectRoot, record, branchStateBeforeCommand);
      }
      completeAgentLaneRun(projectRoot, lane.id, {
        ok,
        error: ok ? undefined : autonomous.error ?? budgetError ?? `command failed: ${fallbackCommand}`,
        executionMode: autonomous.attempted ? "autonomous" : "command",
        autonomousTurnId: autonomous.turnId,
        proposedCommand: autonomous.proposedCommand ?? (!autonomous.attempted ? fallbackCommand : undefined),
        executedCommand: autonomous.attempted ? autonomous.executedCommand : ok ? fallbackCommand : undefined
      });
      if (ok) {
        completeRuntimeHandoffAttempt(projectRoot, handoffId, workToken, `completed by ${workerId}`);
      } else {
        console.log(`role runner failed: ${autonomous.error ?? budgetError ?? `lane execution failed: ${fallbackCommand}`}`);
        failRuntimeHandoffAttempt(projectRoot, handoffId, workToken, autonomous.error ?? budgetError ?? `lane execution failed: ${fallbackCommand}`);
      }
      return ok;
    };
    if (shouldSerializeLaneStateMutation(record)) {
      return await withLaneStateMutationLock(projectRoot, record, executeLaneWork);
    }
    return await executeLaneWork();
  } finally {
    stopHeartbeat();
    refreshRuntimeWorkerSlots(projectRoot, poolId);
  }
}

function startLaneHeartbeat(
  projectRoot: string,
  handoffId: string,
  workToken: ReturnType<typeof runtimeHandoffExecutionToken>,
  laneRunId: string,
  leaseMs: number
): () => void {
  const intervalMs = Math.max(250, Math.min(Math.floor(leaseMs / 2), 5_000));
  const timer = setInterval(() => {
    try {
      const heartbeat = heartbeatRuntimeHandoff(projectRoot, handoffId, workToken, leaseMs);
      heartbeatAgentLaneRun(projectRoot, laneRunId, heartbeat.leaseExpiresAt);
    } catch {
      clearInterval(timer);
    }
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

function restoreDetachedStageQueueBranchState(
  projectRoot: string,
  record: RuntimeHandoffRecord,
  stateBeforeCommand: ProjectState
): void {
  if (!record.packet.resumeCursor?.startsWith("stage-queue:")) {
    return;
  }
  const current = loadState(projectRoot);
  if (current.currentStage === stateBeforeCommand.currentStage) {
    return;
  }
  saveState(projectRoot, {
    ...current,
    currentStage: stateBeforeCommand.currentStage,
    history: stateBeforeCommand.history,
    updatedAt: new Date().toISOString()
  });
  console.log(`role branch stage restored: ${current.currentStage} -> ${stateBeforeCommand.currentStage}`);
}

function shouldSerializeLaneStateMutation(record: RuntimeHandoffRecord): boolean {
  return Boolean(record.packet.resumeCursor?.startsWith("stage-queue:"));
}

async function withLaneStateMutationLock<T>(
  projectRoot: string,
  record: RuntimeHandoffRecord,
  fn: () => Promise<T>
): Promise<T> {
  const lockPath = path.join(projectRoot, ".rph", "runtime", "lane-state.lock");
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const startedAt = Date.now();
  let fd: number | undefined;
  while (fd === undefined) {
    try {
      fd = fs.openSync(lockPath, "wx", 0o600);
      fs.writeFileSync(fd, JSON.stringify({
        pid: process.pid,
        handoffId: record.id,
        role: record.packet.toAgent,
        createdAt: new Date().toISOString()
      }));
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
      if (code === "EEXIST" && isLaneStateMutationLockStale(lockPath)) {
        fs.rmSync(lockPath, { force: true });
        continue;
      }
      if (code !== "EEXIST" || Date.now() - startedAt > 5_000) {
        throw error;
      }
      await sleepMs(10);
    }
  }
  try {
    return await fn();
  } finally {
    fs.closeSync(fd);
    fs.rmSync(lockPath, { force: true });
  }
}

function isLaneStateMutationLockStale(lockPath: string): boolean {
  try {
    const stat = fs.statSync(lockPath);
    return Date.now() - stat.mtimeMs > 30_000;
  } catch {
    return false;
  }
}

interface AutonomousLaneWorkerResult {
  attempted: boolean;
  ok: boolean;
  turnId?: string;
  proposedCommand?: string;
  executedCommand?: string;
  error?: string;
}

async function runAutonomousLaneWorker(
  projectRoot: string,
  record: RuntimeHandoffRecord,
  lane: AgentLaneRunRecord,
  queuedCommand: string
): Promise<AutonomousLaneWorkerResult> {
  if (!safeHasReadyAiProvider(projectRoot)) {
    return { attempted: false, ok: false };
  }
  const aiBudgetError = consumeLaneBudget(projectRoot, lane.id, "AI lane turn");
  if (aiBudgetError) {
    return { attempted: true, ok: false, error: aiBudgetError };
  }
  let turnResult: Awaited<ReturnType<typeof executeAgentTurn>>;
  try {
    const config = loadRuntimeChatConfig(projectRoot);
    const workerSessionId = lane.workerSessionId ?? record.sessionId;
    turnResult = await executeAgentTurn({
      projectRoot,
      sessionId: workerSessionId,
      userInput: renderLaneWorkerInput(record, lane, queuedCommand),
      history: loadRuntimeChatHistory(projectRoot, workerSessionId),
      config,
      system: renderLaneWorkerSystem(lane),
      executionProfile: lane.executionProfile,
      maxOutputTokens: lane.toolBudget.maxOutputTokens
    });
    writeAiChatTurnRecord(projectRoot, createAiChatTurnRecord(
      turnResult.result,
      workerSessionId,
      renderLaneWorkerInput(record, lane, queuedCommand),
      turnResult.prompt
    ));
  } catch (error) {
    console.log(`role agent unavailable; falling back to queued command: ${error instanceof Error ? error.message : String(error)}`);
    return { attempted: false, ok: false };
  }

  console.log(`role agent: autonomous turn ${turnResult.turn.id}`);
  if (turnResult.text.trim()) {
    console.log(`role agent response: ${firstLine(turnResult.text)}`);
  }
  const proposed = turnResult.turn.proposedCommand;
  if (!proposed) {
    console.log("role agent: no runnable command proposed; falling back to queued command");
    return { attempted: false, ok: false, turnId: turnResult.turn.id };
  }

  console.log(`agent proposed command: ${proposed.command}`);
  if (proposed.reason) {
    console.log(`reason: ${proposed.reason}`);
  }
  const sandboxBlocker = executionProfileSandboxCommandBlocker(lane.executionProfile, proposed.command);
  if (sandboxBlocker) {
    return {
      attempted: true,
      ok: false,
      turnId: turnResult.turn.id,
      proposedCommand: proposed.command,
      error: `lane command rejected by active TOML sandbox: ${sandboxBlocker}`
    };
  }
  const validation = validateHandoffContract({
    toAgent: record.packet.toAgent,
    roleContract: record.packet.roleContract,
    nextCommand: proposed.command
  });
  if (!validation.ok) {
    return {
      attempted: true,
      ok: false,
      turnId: turnResult.turn.id,
      proposedCommand: proposed.command,
      error: `lane command rejected: ${validation.reasons.join("; ")}`
    };
  }
  const mutableExternalAction = classifyMutableAgentCommand(proposed.command);
  if (mutableExternalAction) {
    const approvalRequest = await runtimeActionApprovalRequest(projectRoot, {
      sessionId: record.sessionId,
      command: proposed.command,
      reason: proposed.reason,
      message: `lane ${record.packet.toAgent} proposed external action: ${proposed.command}`
    });
    const approval = recordRuntimeActionApproval(projectRoot, {
      ...approvalRequest
    });
    updateRuntimeSession(projectRoot, record.sessionId, {
      status: "blocked",
      blocker: `external action approval required: ${approval.id}`,
      pendingExternalActionId: approval.id,
      note: `lane external action approval requested: ${approval.command}`
    });
    return {
      attempted: true,
      ok: false,
      turnId: turnResult.turn.id,
      proposedCommand: proposed.command,
      error: `external action approval required: ${approval.id}`
    };
  }
  if (!isAutonomousLocalCommand(proposed.command) && !isReadOnlyAgentCommand(proposed.command)) {
    return {
      attempted: true,
      ok: false,
      turnId: turnResult.turn.id,
      proposedCommand: proposed.command,
      error: `lane command rejected: unsupported autonomous command ${proposed.command}`
    };
  }

  console.log(`agent action: ${proposed.command}`);
  const commandBudgetError = consumeLaneBudget(projectRoot, lane.id, `autonomous command ${proposed.command}`);
  if (commandBudgetError) {
    return {
      attempted: true,
      ok: false,
      turnId: turnResult.turn.id,
      proposedCommand: proposed.command,
      error: commandBudgetError
    };
  }
  const ok = await runParsedCommand(projectRoot, parseCli(parseCommandLine(proposed.command)), false);
  return {
    attempted: true,
    ok,
    turnId: turnResult.turn.id,
    proposedCommand: proposed.command,
    executedCommand: proposed.command,
    error: ok ? undefined : `command failed: ${proposed.command}`
  };
}

function consumeLaneBudget(projectRoot: string, laneRunId: string, reason: string): string | undefined {
  try {
    const lane = consumeAgentLaneToolBudget(projectRoot, laneRunId, 1, reason);
    console.log(`tool budget: ${lane.toolBudget.remainingToolCalls}/${lane.toolBudget.maxToolCalls} after ${reason}`);
    return undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`tool budget blocked: ${message}`);
    return message;
  }
}

function providerlessLaneFallbackCommand(projectRoot: string, command: string): string {
  if (safeHasReadyAiProvider(projectRoot) || !/\s--ai(?:\s|$)/.test(command)) {
    return command;
  }
  const stripped = command.replace(/\s--ai(?:\s|$)/, " ").replace(/\s+/g, " ").trim();
  return stripped.startsWith("/") && isAutonomousLocalCommand(stripped) ? stripped : command;
}

function renderLaneWorkerSystem(lane: AgentLaneRunRecord): string {
  return [
    lane.systemPrompt,
    "",
    "You are executing this role lane as an autonomous worker inside RPH.",
    "Inspect the lane brief and either propose one role-valid local command, request read-only context tools, wait with a blocker, or respond with why the queued command should be used.",
    "Do not claim external writes ran. External writes must be proposed as commands and will be approval-gated by the runtime."
  ].join("\n");
}

function renderLaneWorkerInput(record: RuntimeHandoffRecord, lane: AgentLaneRunRecord, queuedCommand: string): string {
  return [
    `Lane role: ${record.packet.toAgent}`,
    `Lane stage: ${record.packet.stage}`,
    `Lane summary: ${record.packet.summary}`,
    `Lane queued command: ${queuedCommand}`,
    `Lane acceptance: ${(record.packet.acceptanceCriteria ?? []).join("; ") || "none"}`,
    `Lane artifacts: ${(record.packet.artifactRefs ?? []).join("; ") || "none"}`,
    `Lane blockers: ${(record.packet.blockers ?? []).join("; ") || "none"}`,
    `Allowed command prefixes: ${lane.toolPolicy.allowedCommandPrefixes.join(", ")}`,
    "",
    "Return JSON following the agent turn contract. If the queued command is the right next step, propose it as an action.type command."
  ].join("\n");
}

function firstLine(value: string): string {
  return value.trim().split(/\r?\n/)[0]?.slice(0, 180) ?? "";
}

function laneWorkerId(role: AgentRole, handoffId: string, poolId?: string, slotIndex?: number): string {
  if (poolId && slotIndex !== undefined) {
    return `lane-worker:${poolId}:slot-${slotIndex}:${role}`;
  }
  return `lane-worker:${role}:${handoffId}`;
}

function handoffContractViolation(packet: HandoffPacket): string | undefined {
  const validation = validateHandoffContract(packet);
  return validation.ok ? undefined : validation.reasons.join("; ");
}

function loopMaxSteps(options: Record<string, string | boolean>): number {
  return parseOptionalPositiveInt(optionString(options, "steps")) ?? 6;
}

function loopConcurrency(options: Record<string, string | boolean>): number {
  return parseOptionalPositiveInt(optionString(options, "concurrency")) ?? 3;
}

async function runAgentCommandProposal(
  projectRoot: string,
  proposal: { command: string; safeToAutoRun: boolean; reason?: string } | undefined,
  options: {
    executeLocalMutations?: boolean;
    sessionId?: string;
    surface?: "runtime-chat" | "execution";
    commandContext?: CommandContext;
  } = {}
): Promise<boolean> {
  if (!proposal) {
    return false;
  }
  const conversational = options.surface === "runtime-chat"
    && !options.executeLocalMutations;
  console.log(`${conversational ? "suggested control" : "agent proposed command"}: ${proposal.command}`);
  if (proposal.reason) {
    console.log(`reason: ${proposal.reason}`);
  }
  const readOnly = isReadOnlyAgentCommand(proposal.command);
  const localMutation = isLocalAgentCommand(proposal.command);
  const mutableExternalAction = classifyMutableAgentCommand(proposal.command);
  const userApprovalAction = isUserApprovalAgentCommand(proposal.command);
  const runtimeIntentSessionId = options.sessionId ?? resolveRuntimeSessionId(projectRoot);
  const runtimeIntentContext = conversational && isRuntimeProjectInitialized(projectRoot)
    ? createRuntimeIntentContext(projectRoot, runtimeIntentSessionId)
    : {};
  const runtimeIntent = conversational && isRuntimeProjectInitialized(projectRoot)
    ? recordRuntimeIntent(projectRoot, {
        sessionId: runtimeIntentSessionId,
        command: proposal.command,
        risk: runtimeIntentRisk(readOnly, localMutation, Boolean(mutableExternalAction), userApprovalAction),
        safeToAutoRun: proposal.safeToAutoRun,
        ...runtimeIntentContext,
        reason: proposal.reason,
        message: "agent suggested a command from plain chat"
      })
    : null;
  if (runtimeIntent) {
    rememberPresentedProposalIntent(projectRoot, runtimeIntentSessionId, proposal, runtimeIntent);
    printAgentProposalPlanCard(proposal, runtimeIntent);
    console.log(`intent saved: ${runtimeIntent.id}`);
    console.log(`confirm: /agent confirm-intent ${runtimeIntent.id}`);
    console.log(`dismiss: /agent dismiss-intent ${runtimeIntent.id}`);
  }
  const sandboxBlocker = activeProfileSandboxCommandBlocker(projectRoot, proposal.command, readOnly);
  if (sandboxBlocker) {
    if (conversational) {
      console.log("run explicitly: type the suggested control when you want to execute it.");
      return false;
    }
    console.log(`auto-run: blocked by active TOML sandbox`);
    console.log(`reason: ${sandboxBlocker}`);
    return false;
  }
  if (mutableExternalAction) {
    if (!options.executeLocalMutations) {
      console.log("external action: not queued from plain chat");
      console.log("run explicitly: use the matching slash command or repeat with rph ask --execute to create an approval request.");
      return false;
    }
    if (!isRuntimeProjectInitialized(projectRoot)) {
      console.log("auto-run: blocked because external actions require an initialized RPH project");
      return false;
    }
    const sessionId = options.sessionId ?? resolveRuntimeSessionId(projectRoot);
    const approvalRequest = await runtimeActionApprovalRequest(projectRoot, {
      sessionId,
      command: proposal.command,
      reason: proposal.reason,
      message: `agent proposed external action: ${proposal.command}`
    });
    const record = recordRuntimeActionApproval(projectRoot, {
      ...approvalRequest
    });
    updateRuntimeSession(projectRoot, sessionId, {
      status: "blocked",
      blocker: `external action approval required: ${record.id}`,
      pendingExternalActionId: record.id,
      note: `external action approval requested: ${record.command}`
    });
    console.log(`external action approval required: ${record.id}`);
    console.log(`target: ${record.target}:${record.action}`);
    console.log(`risk: ${record.risk}`);
    console.log(`approve: /agent approve-action ${record.id}`);
    console.log(`reject: /agent reject-action ${record.id}`);
    return false;
  }
  if (userApprovalAction) {
    const blocker = `user approval command requires explicit user action: ${proposal.command}`;
    if (!options.executeLocalMutations) {
      console.log(`approval control: ${blocker}`);
      console.log("run explicitly: type the approval command yourself.");
      return false;
    }
    console.log(`auto-run: blocked because ${blocker}`);
    if (isRuntimeProjectInitialized(projectRoot)) {
      const sessionId = options.sessionId ?? resolveRuntimeSessionId(projectRoot);
      updateRuntimeSession(projectRoot, sessionId, {
        status: "blocked",
        blocker,
        note: `agent proposed user approval command: ${proposal.command}`
      });
    }
    return false;
  }
  if (conversational) {
    console.log("run explicitly: type the suggested control when you want to execute it.");
    return false;
  }
  if (options.executeLocalMutations && localMutation) {
    console.log(`agent action: ${proposal.command}`);
    console.log("execution-policy: ask --execute allowed local workflow command");
    const parsed = parseCli(parseCommandLine(proposal.command));
    return runParsedCommand(projectRoot, parsed, false, options.commandContext);
  }
  if (options.executeLocalMutations && !localMutation) {
    if (isMcpCallCommand(proposal.command)) {
      console.log("auto-run: blocked by MCP policy");
      console.log("reason: mutable or unclassified MCP tool calls are not exposed to agent auto-run");
      console.log("next: /mcp tools <server> 또는 /mcp test <server>");
      return false;
    }
    console.log("auto-run: blocked because the proposed command is external or unsupported");
    return false;
  }
  console.log("auto-run: skipped");
  return false;
}

function runtimeIntentRisk(
  readOnly: boolean,
  localMutation: boolean,
  mutableExternalAction: boolean,
  userApprovalAction: boolean
): RuntimeIntentRecord["risk"] {
  if (mutableExternalAction) {
    return "external_live_write";
  }
  if (userApprovalAction) {
    return "user_approval";
  }
  if (readOnly) {
    return "read_only";
  }
  if (localMutation) {
    return "local_mutation";
  }
  return "unsupported";
}

function createRuntimeIntentContext(projectRoot: string, sessionId: string): Pick<RuntimeIntentRecord, "createdStage" | "graphId" | "graphDigest" | "activeProfileSlug"> {
  const state = loadState(projectRoot);
  const graph = currentRuntimeExecutionGraphForIntent(projectRoot, sessionId);
  const activeProfile = activeCustomAgentExecutionProfile(projectRoot);
  return {
    createdStage: state.currentStage,
    graphId: graph?.graphId,
    graphDigest: graph ? runtimeExecutionGraphDigest(graph) : undefined,
    activeProfileSlug: activeProfile?.slug
  };
}

function activeProfileSandboxCommandBlocker(projectRoot: string, command: string, readOnly = isReadOnlyAgentCommand(command)): string | undefined {
  const profile = activeCustomAgentExecutionProfile(projectRoot);
  return executionProfileSandboxCommandBlocker(profile, command, readOnly);
}

export function executionProfileSandboxCommandBlocker(
  profile: AgentExecutionProfileRef | undefined,
  command: string,
  readOnly = isReadOnlyAgentCommand(command)
): string | undefined {
  if (profile?.sandboxMode !== "read-only") {
    return undefined;
  }
  if (readOnly) {
    return undefined;
  }
  return `${profile.name} sandbox_mode=read-only allows read-only commands only; proposed command was ${command}`;
}

async function runtimeActionApprovalRequest(
  projectRoot: string,
  request: {
    sessionId: string;
    command: string;
    reason?: string;
    message?: string;
  }
): Promise<{
  sessionId: string;
  command: string;
  reason?: string;
  message?: string;
  approvedTargetId?: string;
  approvedParameters?: Record<string, string>;
  approvedSnapshot?: RuntimeActionApprovedSnapshot;
}> {
  const context = await runtimeActionApprovalContext(projectRoot, request.command, { materializeGitHubArtifacts: true });
  return {
    ...request,
    ...context
  };
}

interface RuntimeActionApprovalContextOptions {
  materializeGitHubArtifacts?: boolean;
}

async function runtimeActionApprovalContext(
  projectRoot: string,
  command: string,
  options: RuntimeActionApprovalContextOptions = {}
): Promise<{ approvedTargetId?: string; approvedParameters?: Record<string, string>; approvedSnapshot?: RuntimeActionApprovedSnapshot }> {
  let parsed: ReturnType<typeof parseCli>;
  try {
    parsed = parseCli(parseCommandLine(command));
  } catch {
    return {};
  }
  if (parsed.command === "notion") {
    return runtimeNotionActionApprovalContext(projectRoot, parsed);
  }
  if (parsed.command === "mcp") {
    return runtimeMcpActionApprovalContext(projectRoot, parsed, command);
  }
  if (parsed.command !== "github") {
    return {};
  }
  const target = resolveGitHubTarget(projectRoot);
  const owner = process.env.GITHUB_OWNER || target.owner;
  const repo = process.env.GITHUB_REPO || target.repo || (parsed.subcommand === "create-repo" ? path.basename(projectRoot) : undefined);
  if (!owner || !repo) {
    return {};
  }
  const approvedTargetId = `${owner}/${repo}`;
  const existing = existingPendingRuntimeActionApprovalContext(projectRoot, command, approvedTargetId);
  if (existing) {
    return existing;
  }
  const params: Record<string, string> = {
    owner,
    repo,
    command: parsed.subcommand ?? "unknown"
  };
  if (parsed.subcommand === "create-issue") {
    params.title = optionString(parsed.options, "title") ?? parsed.args.join(" ") ?? "";
    params.agent = optionString(parsed.options, "agent") ?? "FE";
    params.label = optionString(parsed.options, "label") ?? "feat";
    if (options.materializeGitHubArtifacts && parsed.options.live === true) {
      requireImplementationStage(projectRoot);
      const issue = createWorkIssue(projectRoot, {
        workstream: parseWorkstream(params.agent),
        label: params.label,
        title: params.title || "FE implementation task",
        description: optionString(parsed.options, "description"),
        acceptanceCriteria: splitListOption(optionString(parsed.options, "acceptance")),
        testRequirement: optionString(parsed.options, "test")
      });
      const snapshot = captureGitHubIssueApprovalSnapshot(projectRoot, owner, repo, issue);
      params.localIssueNumber = String(issue.issueNumber);
      params.snapshotFingerprint = snapshot.fingerprint;
      return {
        approvedTargetId,
        approvedParameters: params,
        approvedSnapshot: snapshot
      };
    }
  }
  if (parsed.subcommand === "create-pr") {
    params.issue = optionString(parsed.options, "issue") ?? "";
    params.target = optionString(parsed.options, "target") ?? "dev";
    if (options.materializeGitHubArtifacts && parsed.options.live === true) {
      requireImplementationStage(projectRoot);
      const issueNumber = parseIssueNumber(params.issue);
      const targetBranch = parsePullRequestTargetBranch(params.target);
      const existingPr = [...listPullRequests(projectRoot)]
        .reverse()
        .find((record) => record.issueNumber === issueNumber && record.targetBranch === targetBranch);
      const pr = existingPr ?? createPullRequestDraft(projectRoot, issueNumber, targetBranch);
      const issue = readWorkIssue(projectRoot, pr.issueNumber);
      const snapshot = captureGitHubPullRequestApprovalSnapshot(projectRoot, owner, repo, pr, issue);
      params.issue = String(pr.issueNumber);
      params.target = pr.targetBranch;
      params.localIssueNumber = String(pr.issueNumber);
      params.localPrNumber = String(pr.prNumber);
      params.sourceBranch = pr.sourceBranch;
      params.snapshotFingerprint = snapshot.fingerprint;
      return {
        approvedTargetId,
        approvedParameters: params,
        approvedSnapshot: snapshot
      };
    }
  }
  if (parsed.subcommand === "create-repo") {
    params.visibility = parseRepoVisibility(parsed.options);
  }
  return {
    approvedTargetId,
    approvedParameters: params
  };
}

function existingPendingRuntimeActionApprovalContext(
  projectRoot: string,
  command: string,
  approvedTargetId: string
): { approvedTargetId?: string; approvedParameters?: Record<string, string>; approvedSnapshot?: RuntimeActionApprovedSnapshot } | null {
  const normalized = normalizeApprovalCommand(command);
  const existing = loadRuntimeActionApprovals(projectRoot).find((record) =>
    record.status === "pending"
    && record.normalizedCommand === normalized
    && record.approvedTargetId === approvedTargetId
    && record.approvedSnapshot
  );
  if (!existing) {
    return null;
  }
  return {
    approvedTargetId: existing.approvedTargetId,
    approvedParameters: existing.approvedParameters,
    approvedSnapshot: existing.approvedSnapshot
  };
}

function normalizeApprovalCommand(command: string): string {
  try {
    return parseCommandLine(command).join(" ");
  } catch {
    return normalizeRuntimeCommand(command);
  }
}

function runtimeNotionActionApprovalContext(
  projectRoot: string,
  parsed: ReturnType<typeof parseCli>
): { approvedTargetId?: string; approvedParameters?: Record<string, string> } {
  if (parsed.options.live !== true) {
    return {};
  }
  if (parsed.subcommand === "setup") {
    const env = { ...process.env };
    loadEnvFile(path.join(projectRoot, ".env"), env);
    const parentPageId = normalizeNotionPageId(env.NOTION_PARENT_PAGE_ID ?? "");
    if (!parentPageId) {
      return {};
    }
    return {
      approvedTargetId: `notion-parent:${parentPageId}`,
      approvedParameters: {
        command: "setup",
        parentPageId,
        title: optionString(parsed.options, "title") ?? "RPH Workspace"
      }
    };
  }
  if (parsed.subcommand === "sync" || parsed.subcommand === "export-docs") {
    const workspace = readJsonFileIfExists<{ dashboardPageId?: string }>(notionLiveWorkspaceFile(projectRoot));
    if (!workspace?.dashboardPageId) {
      return {};
    }
    return {
      approvedTargetId: `notion-workspace:${workspace.dashboardPageId}`,
      approvedParameters: {
        command: parsed.subcommand,
        dashboardPageId: workspace.dashboardPageId
      }
    };
  }
  return {};
}

async function runtimeMcpActionApprovalContext(
  projectRoot: string,
  parsed: ReturnType<typeof parseCli>,
  command: string
): Promise<{ approvedTargetId?: string; approvedParameters?: Record<string, string>; approvedSnapshot?: RuntimeActionApprovedSnapshot }> {
  if (parsed.subcommand !== "call") {
    return {};
  }
  const target = parseMcpCallTargetFromParsed(parsed.args, parsed.options);
  if (!target) {
    return {};
  }
  const serverId = parseMcpServerId(target.server);
  const toolName = target.tool;
  const args = parseJsonObjectOption(optionString(parsed.options, "args-json") ?? optionString(parsed.options, "arguments-json") ?? optionString(parsed.options, "args")) ?? {};
  const approvedTargetId = `mcp:${serverId}.${toolName}`;
  const existing = existingPendingRuntimeActionApprovalContext(projectRoot, command, approvedTargetId);
  if (existing) {
    return existing;
  }
  const env = { ...process.env };
  loadEnvFile(path.join(projectRoot, ".env"), env);
  let snapshot: RuntimeActionApprovedSnapshot | undefined;
  let snapshotError: string | undefined;
  try {
    snapshot = await captureOperatorMcpToolCallSnapshot({
      projectRoot,
      config: readHarnessConfigSnapshot(projectRoot, env),
      env,
      serverId,
      toolName,
      arguments: args
    });
  } catch (error) {
    snapshotError = error instanceof Error ? error.message : String(error);
  }
  return {
    approvedTargetId,
    approvedParameters: {
      command: "call",
      server: serverId,
      tool: toolName,
      argumentsJson: JSON.stringify(args),
      ...(snapshot ? { snapshotFingerprint: snapshot.fingerprint } : {}),
      ...(snapshotError ? { snapshotError } : {})
    },
    approvedSnapshot: snapshot
  };
}

function parseMcpCallTargetFromParsed(
  args: string[],
  options: Record<string, string | boolean>
): { server: string; tool: string } | null {
  const explicitServer = optionString(options, "server");
  const explicitTool = optionString(options, "tool") ?? optionString(options, "name");
  if (explicitServer && explicitTool) {
    return { server: explicitServer, tool: explicitTool };
  }
  const [first, second] = args;
  if (!first) {
    return null;
  }
  if (first.includes(".") && !second) {
    return parseMcpApprovalAction(first);
  }
  if (first && second) {
    return { server: first, tool: second };
  }
  return null;
}

function parseMcpApprovalAction(value: string): { server: string; tool: string } | null {
  const [server, ...toolParts] = value.split(".");
  const tool = toolParts.join(".");
  if (!server || !tool) {
    return null;
  }
  return { server, tool };
}

function isMcpCallCommand(command: string): boolean {
  try {
    const parsed = parseCli(parseCommandLine(command));
    return parsed.command === "mcp" && parsed.subcommand === "call";
  } catch {
    return false;
  }
}

function normalizeRuntimeCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

async function approveAndExecuteRuntimeAction(projectRoot: string, id: string, approvedBy: string): Promise<boolean> {
  const sessionGuard = runtimeActionSessionExecutionBlocker(projectRoot, id);
  if (sessionGuard) {
    console.log(`external action blocked: ${id}`);
    console.log(`reason: ${sessionGuard}`);
    process.exitCode = 1;
    return false;
  }
  const running = approveAndStartRuntimeAction(projectRoot, id, approvedBy);
  console.log(`external action approved: ${running.id}`);
  console.log(`command: ${running.command}`);
  console.log(`external action executing: ${running.id}`);
  const sessionId = running.sessionId || resolveRuntimeSessionId(projectRoot);
  updateRuntimeSession(projectRoot, sessionId, {
    status: "blocked",
    blocker: `external action running: ${running.id}`,
    pendingExternalActionId: running.id,
    note: `external action running: ${running.command}`
  });
  const drift = await runtimeActionApprovalDrift(projectRoot, running);
  if (drift) {
    const failed = failRuntimeAction(projectRoot, id, drift);
    updateRuntimeSession(projectRoot, sessionId, {
      status: "blocked",
      blocker: `external action approval drift: ${failed.id}`,
      pendingExternalActionId: failed.id,
      note: drift
    });
    console.log(`external action blocked: ${failed.id}`);
    console.log(`reason: ${drift}`);
    process.exitCode = 1;
    return false;
  }
  const ok = await withRuntimeActionBindingEnv(running, () =>
    runParsedCommand(projectRoot, parseCli(parseCommandLine(running.command)), false)
  );
  if (ok) {
    const readback = runtimeActionReadbackProof(projectRoot, running);
    if (readback.readbackStatus === "failed") {
      const failed = failRuntimeAction(projectRoot, id, "approved command completed but mandatory readback proof was missing or invalid", readback);
      updateRuntimeSession(projectRoot, sessionId, {
        status: "blocked",
        blocker: `external action readback failed: ${failed.id}`,
        pendingExternalActionId: failed.id,
        note: `external action readback failed: ${failed.command}`
      });
      console.log(`external action readback failed: ${failed.id}`);
      if (readback.expectedReadback) {
        console.log(`expected readback: ${readback.expectedReadback}`);
      }
      process.exitCode = 1;
      return false;
    }
    const completed = completeRuntimeAction(projectRoot, id, "command completed through approved runtime action", readback);
    updateRuntimeSession(projectRoot, sessionId, {
      status: "recovering",
      blocker: null,
      pendingExternalActionId: null,
      note: `external action completed: ${completed.id}`
    });
    console.log(`external action completed: ${completed.id}`);
    if (completed.verifiedTargetId) {
      console.log(`readback: ${completed.verifiedTargetId}`);
    }
    if (completed.readbackArtifactPath) {
      console.log(`readback file: ${completed.readbackArtifactPath}`);
    }
    return true;
  }
  const failed = failRuntimeAction(projectRoot, id, "command failed through approved runtime action");
  updateRuntimeSession(projectRoot, sessionId, {
    status: "blocked",
    blocker: `external action failed: ${failed.id}`,
    pendingExternalActionId: failed.id,
    note: `external action failed: ${failed.command}`
  });
  console.log(`external action failed: ${failed.id}`);
  process.exitCode = 1;
  return false;
}

function runtimeActionSessionExecutionBlocker(projectRoot: string, id: string): string | null {
  const action = loadRuntimeActionApprovals(projectRoot).find((record) => record.id === id);
  if (!action) {
    return `external action not found: ${id}`;
  }
  const session = loadRuntimeSession(projectRoot);
  if (!session) {
    return "no active runtime session is available for external action approval";
  }
  if (action.sessionId && action.sessionId !== session.sessionId) {
    return `external action belongs to session ${action.sessionId}, but current session is ${session.sessionId}`;
  }
  if (session.pendingExternalActionId && session.pendingExternalActionId !== id) {
    return `external action is not the current pending action for session ${session.sessionId}`;
  }
  if (session.waitCondition?.kind !== "external_live_write") {
    return "current session is not waiting on an external live write";
  }
  return null;
}

async function runtimeActionApprovalDrift(projectRoot: string, action: RuntimeActionApprovalRecord): Promise<string | null> {
  if (!action.approvedTargetId) {
    return null;
  }
  const current = await runtimeActionApprovalContext(projectRoot, action.command);
  if (!current.approvedTargetId) {
    return `approved ${action.target} target ${action.approvedTargetId} could not be resolved at execution time`;
  }
  if (current.approvedTargetId !== action.approvedTargetId) {
    return `approved ${action.target} target drifted from ${action.approvedTargetId} to ${current.approvedTargetId}`;
  }
  const snapshotDrift = await runtimeActionApprovedSnapshotDrift(projectRoot, action);
  if (snapshotDrift) {
    return snapshotDrift;
  }
  return null;
}

async function runtimeActionApprovedSnapshotDrift(projectRoot: string, action: RuntimeActionApprovalRecord): Promise<string | null> {
  if (action.target === "mcp") {
    if (!action.approvedSnapshot || action.approvedSnapshot.kind !== "mcp.tool-call") {
      return `approved MCP ${action.action} snapshot is missing; re-request approval`;
    }
    try {
      const target = parseMcpApprovalAction(action.action);
      if (!target) {
        return `approved MCP action is invalid: ${action.action}`;
      }
      const env = { ...process.env };
      loadEnvFile(path.join(projectRoot, ".env"), env);
      const current = await currentOperatorMcpToolCallSnapshot({
        projectRoot,
        config: readHarnessConfigSnapshot(projectRoot, env),
        env,
        serverId: parseMcpServerId(target.server),
        toolName: target.tool,
        arguments: parseJsonObjectOption(action.approvedParameters?.argumentsJson) ?? {}
      });
      if (current.fingerprint !== action.approvedSnapshot.fingerprint) {
        return `approved MCP tool-call snapshot drifted for ${action.action}: expected ${action.approvedSnapshot.fingerprint}, got ${current.fingerprint}`;
      }
      return null;
    } catch (error) {
      return `approved MCP ${action.action} snapshot could not be read: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  if (action.target !== "github" || (action.action !== "issue.create" && action.action !== "pr.create")) {
    return null;
  }
  if (!action.approvedSnapshot) {
    return `approved GitHub ${action.action} snapshot is missing; re-request approval`;
  }
  const target = parseApprovedGitHubTarget(action.approvedTargetId);
  if (!target) {
    return `approved GitHub target is invalid: ${action.approvedTargetId ?? "missing"}`;
  }
  try {
    if (action.action === "issue.create") {
      const issueNumber = action.approvedSnapshot.localIssueNumber ?? parseOptionalPositiveInt(action.approvedParameters?.localIssueNumber);
      if (!issueNumber) {
        return "approved GitHub issue snapshot is missing localIssueNumber";
      }
      const issue = readWorkIssue(projectRoot, issueNumber);
      const current = currentGitHubIssueApprovalSnapshot(projectRoot, target.owner, target.repo, issue);
      if (current.fingerprint !== action.approvedSnapshot.fingerprint) {
        return `approved GitHub issue snapshot drifted for local issue #${issueNumber}: expected ${action.approvedSnapshot.fingerprint}, got ${current.fingerprint}`;
      }
      return null;
    }
    const prNumber = action.approvedSnapshot.localPrNumber ?? parseOptionalPositiveInt(action.approvedParameters?.localPrNumber);
    if (!prNumber) {
      return "approved GitHub PR snapshot is missing localPrNumber";
    }
    const pr = readPullRequest(projectRoot, prNumber);
    const issue = readWorkIssue(projectRoot, pr.issueNumber);
    const current = currentGitHubPullRequestApprovalSnapshot(projectRoot, target.owner, target.repo, pr, issue);
    if (current.fingerprint !== action.approvedSnapshot.fingerprint) {
      return `approved GitHub PR snapshot drifted for local PR #${prNumber}: expected ${action.approvedSnapshot.fingerprint}, got ${current.fingerprint}`;
    }
    return null;
  } catch (error) {
    return `approved GitHub ${action.action} snapshot could not be read: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function parseApprovedGitHubTarget(value: string | undefined): { owner: string; repo: string } | null {
  const [owner, repo] = (value ?? "").split("/");
  if (!owner || !repo) {
    return null;
  }
  return { owner, repo };
}

async function withRuntimeActionBindingEnv<T>(
  action: RuntimeActionApprovalRecord,
  run: () => Promise<T>
): Promise<T> {
  const previous = {
    id: process.env.RPH_ACTION_APPROVAL_ID,
    fingerprint: process.env.RPH_ACTION_APPROVAL_FINGERPRINT,
    runningAt: process.env.RPH_ACTION_RUNNING_AT,
    parameters: process.env.RPH_ACTION_APPROVED_PARAMETERS_JSON,
    snapshot: process.env.RPH_ACTION_APPROVED_SNAPSHOT_JSON
  };
  process.env.RPH_ACTION_APPROVAL_ID = action.id;
  process.env.RPH_ACTION_APPROVAL_FINGERPRINT = action.fingerprint;
  process.env.RPH_ACTION_RUNNING_AT = action.runningAt ?? new Date().toISOString();
  if (action.approvedParameters) {
    process.env.RPH_ACTION_APPROVED_PARAMETERS_JSON = JSON.stringify(action.approvedParameters);
  } else {
    delete process.env.RPH_ACTION_APPROVED_PARAMETERS_JSON;
  }
  if (action.approvedSnapshot) {
    process.env.RPH_ACTION_APPROVED_SNAPSHOT_JSON = JSON.stringify(action.approvedSnapshot);
  } else {
    delete process.env.RPH_ACTION_APPROVED_SNAPSHOT_JSON;
  }
  try {
    return await run();
  } finally {
    restoreOptionalEnv("RPH_ACTION_APPROVAL_ID", previous.id);
    restoreOptionalEnv("RPH_ACTION_APPROVAL_FINGERPRINT", previous.fingerprint);
    restoreOptionalEnv("RPH_ACTION_RUNNING_AT", previous.runningAt);
    restoreOptionalEnv("RPH_ACTION_APPROVED_PARAMETERS_JSON", previous.parameters);
    restoreOptionalEnv("RPH_ACTION_APPROVED_SNAPSHOT_JSON", previous.snapshot);
  }
}

function restoreOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

function runtimeApprovedParametersFromEnv(): Record<string, string> {
  const raw = process.env.RPH_ACTION_APPROVED_PARAMETERS_JSON;
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, string>>((result, [key, value]) => {
      if (typeof value === "string") {
        result[key] = value;
      }
      return result;
    }, {});
  } catch {
    return {};
  }
}

function readJsonFileIfExists<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function runtimeActionReadbackProof(
  projectRoot: string,
  action: RuntimeActionApprovalRecord
): RuntimeActionReadbackProof {
  if (action.target === "notion" && action.action === "workspace.setup.live") {
    return readbackProofFromJsonFile(
      action,
      notionLiveWorkspaceFile(projectRoot),
      "notion live workspace file",
      (value) => {
        const workspace = value as { dashboardReadback?: { id?: string }; dashboardPageId?: string };
        return workspace.dashboardReadback?.id ?? workspace.dashboardPageId;
      }
    );
  }
  if (action.target === "notion" && action.action === "workspace.sync.live") {
    return readbackProofFromJsonFile(
      action,
      notionLiveSyncReadbackFile(projectRoot),
      "notion live sync readback file",
      (value) => (value as { id?: string }).id
    );
  }
  if (action.target === "github" && action.action === "repo.create") {
    return readbackProofFromJsonFile(
      action,
      githubRepoReadbackFile(projectRoot),
      "github repo view and push readback file",
      (value) => {
        const proof = value as {
          nameWithOwner?: string;
          url?: string;
          existed?: boolean;
          pushReadbackStatus?: string;
        };
        if (!proof.existed && proof.pushReadbackStatus !== "passed") {
          return undefined;
        }
        return proof.nameWithOwner ?? proof.url;
      }
    );
  }
  if (action.target === "github" && action.action === "labels.apply") {
    return readbackProofFromJsonFile(
      action,
      githubLabelsReadbackFile(projectRoot),
      "github label list readback file",
      (value) => {
        const proof = value as { owner?: string; repo?: string; verified?: boolean; observed?: unknown[] };
        if (!proof.verified) {
          return undefined;
        }
        return `${proof.owner ?? "unknown"}/${proof.repo ?? "unknown"} labels=${proof.observed?.length ?? 0}`;
      }
    );
  }
  if (action.target === "github" && action.action === "issue.create") {
    const issueNumber = action.approvedSnapshot?.localIssueNumber ?? parseOptionalPositiveInt(action.approvedParameters?.localIssueNumber);
    return readbackProofFromJsonFile(
      action,
      issueNumber ? githubIssueReadbackFile(projectRoot, issueNumber) : githubIssueLatestReadbackFile(projectRoot),
      "github issue view readback file",
      (value) => {
        const proof = value as {
          owner?: string;
          repo?: string;
          localIssueNumber?: number;
          githubIssueNumber?: number | null;
          verified?: boolean;
        };
        if (!proof.verified || !proof.githubIssueNumber) {
          return undefined;
        }
        if (issueNumber && proof.localIssueNumber !== issueNumber) {
          return undefined;
        }
        return `${proof.owner ?? "unknown"}/${proof.repo ?? "unknown"}#${proof.githubIssueNumber}`;
      }
    );
  }
  if (action.target === "github" && action.action === "pr.create") {
    const prNumber = action.approvedSnapshot?.localPrNumber ?? parseOptionalPositiveInt(action.approvedParameters?.localPrNumber);
    return readbackProofFromJsonFile(
      action,
      prNumber ? githubPullRequestReadbackFile(projectRoot, prNumber) : githubPullRequestLatestReadbackFile(projectRoot),
      "github PR view readback file",
      (value) => {
        const proof = value as {
          owner?: string;
          repo?: string;
          localPrNumber?: number;
          githubPrNumber?: number | null;
          verified?: boolean;
        };
        if (!proof.verified || !proof.githubPrNumber) {
          return undefined;
        }
        if (prNumber && proof.localPrNumber !== prNumber) {
          return undefined;
        }
        return `${proof.owner ?? "unknown"}/${proof.repo ?? "unknown"}#${proof.githubPrNumber}`;
      }
    );
  }
  if (action.target === "mcp") {
    return readbackProofFromJsonFile(
      action,
      mcpToolCallReadbackFile(projectRoot, action.id),
      "mcp mutable tool call readback file",
      (value) => {
        const proof = value as {
          kind?: string;
          server?: string;
          toolName?: string;
          verified?: boolean;
          approvedSnapshotFingerprint?: string;
        };
        if (proof.kind !== "mcp-tool-call-readback-v1" || !proof.verified) {
          return undefined;
        }
        if (action.approvedSnapshot?.kind !== "mcp.tool-call") {
          return undefined;
        }
        if (proof.server !== action.approvedSnapshot.serverId || proof.toolName !== action.approvedSnapshot.toolName) {
          return undefined;
        }
        if (proof.approvedSnapshotFingerprint !== action.approvedSnapshot.fingerprint) {
          return undefined;
        }
        return `${proof.server}.${proof.toolName}`;
      }
    );
  }
  return {
    expectedReadback: `mandatory readback contract missing for approval-gated action ${action.target}:${action.action}`,
    readbackStatus: "failed"
  };
}

function readbackProofFromJsonFile(
  action: RuntimeActionApprovalRecord,
  filePath: string,
  expectedReadback: string,
  verifier: (value: unknown) => string | undefined
): RuntimeActionReadbackProof {
  if (!fs.existsSync(filePath)) {
    return {
      expectedReadback,
      readbackStatus: "failed",
      readbackArtifactPath: filePath
    };
  }
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    const bindingError = runtimeActionReadbackBindingError(action, value);
    if (bindingError) {
      return {
        expectedReadback: `${expectedReadback}; ${bindingError}`,
        readbackStatus: "failed",
        readbackArtifactPath: filePath
      };
    }
    const verifiedTargetId = verifier(value);
    const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return {
      expectedReadback,
      readbackStatus: verifiedTargetId ? "passed" : "failed",
      readbackArtifactPath: filePath,
      verifiedTargetId,
      actionApprovalId: typeof record.actionApprovalId === "string" ? record.actionApprovalId : undefined,
      approvedFingerprint: typeof record.approvedFingerprint === "string" ? record.approvedFingerprint : undefined,
      verifiedAt: typeof record.actionVerifiedAt === "string" ? record.actionVerifiedAt : undefined
    };
  } catch {
    return {
      expectedReadback,
      readbackStatus: "failed",
      readbackArtifactPath: filePath
    };
  }
}

function runAgentHandoffProposal(
  projectRoot: string,
  sessionId: string,
  proposal: AgentHandoffProposal | undefined
): void {
  if (!proposal) {
    return;
  }
  const state = isRuntimeProjectInitialized(projectRoot) ? loadState(projectRoot) : null;
  const stage = proposal.stage ?? state?.currentStage;
  if (!stage) {
    console.log(`agent proposed handoff: ${proposal.toAgent}`);
    console.log("handoff: skipped until project is initialized");
    return;
  }
  const packet: HandoffPacket = {
    fromAgent: proposal.fromAgent ?? (state ? WORKFLOW_STAGES[state.currentStage].ownerAgent : "Orchestrator"),
    toAgent: proposal.toAgent,
    stage,
    summary: proposal.summary,
    roleContract: agentRoleContract(proposal.toAgent),
    artifactRefs: proposal.artifactRefs,
    acceptanceCriteria: proposal.acceptanceCriteria,
    blockers: proposal.blockers,
    nextCommand: proposal.nextCommand,
    resumeCursor: `agent-handoff:${stage}:${proposal.toAgent}`,
    createdAt: new Date().toISOString()
  };
  console.log(`agent proposed handoff: ${packet.fromAgent} -> ${packet.toAgent}`);
  if (packet.nextCommand) {
    console.log(`handoff next command: ${packet.nextCommand}`);
  }
  const violation = handoffContractViolation(packet);
  if (violation) {
    console.log(`handoff rejected: ${violation}`);
    if (state) {
      updateRuntimeSession(projectRoot, sessionId, {
        blocker: `handoff rejected: ${violation}`,
        note: `agent handoff rejected: ${packet.fromAgent} -> ${packet.toAgent}`
      });
    }
    return;
  }
  if (!state) {
    return;
  }
  const record = recordRuntimeHandoff(projectRoot, sessionId, packet);
  console.log(`handoff queued: ${record.id}`);
  updateRuntimeSession(projectRoot, sessionId, {
    handoffPacket: packet,
    checkpoint: `handoff proposed to ${packet.toAgent}`,
    note: `agent handoff proposed: ${packet.fromAgent} -> ${packet.toAgent}`
  });
}

function hasReadyAiProvider(config: ReturnType<typeof loadHarnessConfig>): boolean {
  return configuredAiProviders(config).length > 0;
}

function safeHasReadyAiProvider(projectRoot: string): boolean {
  try {
    return hasReadyAiProvider(loadRuntimeChatConfig(projectRoot));
  } catch {
    return false;
  }
}

function guidanceHarnessConfig(projectRoot: string) {
  try {
    const existing = isRuntimeProjectInitialized(projectRoot) ? loadHarnessConfig(projectRoot) : undefined;
    return createHarnessConfig(process.env, undefined, existing);
  } catch {
    return createHarnessConfig(process.env);
  }
}

function handleHome(
  projectRoot: string,
  options: Record<string, string | boolean>,
  context: CommandContext = {}
): void {
  if (optionBool(options, "json")) {
    console.log(JSON.stringify(buildOperatorWorkspace(projectRoot), null, 2));
    return;
  }
  const commandSurface = context.runtimeShell ? "slash" : commandSurfaceFromOptions(options);
  printPersistedConfigRepairSummary(projectRoot, commandSurface);
  console.log(renderRuntimeHero(projectRoot, resolveRuntimeSessionId(projectRoot), guidanceHarnessConfig(projectRoot)));
  console.log("");
  const manifest = isRuntimeProjectInitialized(projectRoot) ? loadRuntimeSession(projectRoot) : null;
  printRuntimeHomeCard(projectRoot, {
    reason: manifest ? runtimeHomeReasonFromManifest(manifest) : "setup required before agent chat can run",
    commandSurface
  });
}

function printPersistedConfigRepairSummary(projectRoot: string, commandSurface: CommandSurface = "rph"): void {
  if (!isRuntimeProjectInitialized(projectRoot)) {
    return;
  }
  const summary = repairPersistedConfigDrift(projectRoot);
  if (!summary.changed) {
    return;
  }
  console.log("self-heal: persisted harness config refreshed");
  if (summary.migratedServers.length > 0) {
    console.log(`- migrated MCP contracts: ${summary.migratedServers.join(", ")}`);
  }
  for (const note of summary.notes) {
    console.log(`- ${note}`);
  }
  console.log(`- proof: rerun ${runtimeSurfaceCommand(commandSurface, "setup auto --from-env --live")} to refresh live connection trust`);
  console.log("");
}

function printRuntimeRecoveryCard(
  projectRoot: string,
  options: {
    title: string;
    reason: string;
    proposedCommand?: string;
    commandSurface?: CommandSurface;
  }
): void {
  const commandSurface = options.commandSurface ?? "rph";
  console.log(renderRuntimeHero(projectRoot, resolveRuntimeSessionId(projectRoot), guidanceHarnessConfig(projectRoot)));
  console.log("");
  printRuntimeHomeCard(projectRoot, {
    reason: options.reason,
    proposedCommand: options.proposedCommand,
    commandSurface
  });
  console.log("");
  console.log(options.title);
  console.log(`- current: ${options.reason}`);
  if (options.proposedCommand) {
    console.log(`- suggested control: ${runtimeSurfaceCommand(commandSurface, options.proposedCommand.replace(/^\//, ""))}`);
  }
  console.log("- chat: unavailable until an AI provider is connected");
  console.log("");
  console.log(`next: ${runtimeSurfaceCommand(commandSurface, "setup auto --live")}`);
}

function printRuntimeHomeCard(
  projectRoot: string,
  options: {
    reason: string;
    proposedCommand?: string;
    commandSurface?: CommandSurface;
  }
): void {
  const commandSurface = options.commandSurface ?? "rph";
  const config = guidanceHarnessConfig(projectRoot);
  const initialized = isRuntimeProjectInitialized(projectRoot);
  const checks = initialized ? readLatestConnectionChecks(projectRoot) : [];
  const trustedChecks = initialized ? readTrustedConnectionChecks(projectRoot) : [];
  const workspace = buildOperatorWorkspace(projectRoot);
  const passedAi = trustedChecks.filter((check) => check.kind === "ai" && check.status === "passed").map((check) => check.id);
  const passedMcp = trustedChecks.filter((check) => check.kind === "mcp" && check.status === "passed").map((check) => check.id);
  const configuredAi = configuredAiProviders(config).map((provider) => provider.id);
  const configuredMcp = configuredMcpServers(config).map((server) => server.id);
  const pendingExternal = workspace.approvals.externalActions.filter((action) => action.status === "pending");
  const trust = initialized ? readConnectionReportTrust(projectRoot) : { trusted: false as const, reason: "missing-report" as const };
  const chatLane = passedAi.length > 0
    ? `ready via verified ${passedAi.join(", ")}`
    : configuredAi.length > 0
      ? `configured ${configuredAi.join(", ")}; run live setup to verify`
      : "blocked until AI provider setup";
  const connectorLane = passedMcp.length > 0
    ? `verified ${passedMcp.join(", ")}`
    : configuredMcp.length > 0
      ? `configured ${configuredMcp.join(", ")}; run live setup to verify`
      : "no verified connectors";
  const workLane = workspace.runtime
    ? `${workspace.runtime.stage} (${workspace.runtime.status})`
    : workspace.initialized
      ? `${workspace.workflow.currentStage} (${workspace.workflow.currentStageName})`
      : "not initialized";
  const proofLane = trust.trusted
    ? "live proof current"
    : `live proof needs refresh (${trust.reason ?? workspace.readiness.connectionProofReason ?? "missing-report"})`;
  const controlCommand = options.proposedCommand ?? workspace.nextAction.command;
  const primaryNext = renderSurfaceNextCommand(commandSurface, controlCommand);
  const talkNow = configuredAi.length > 0 && workspace.nextAction.kind === "none"
    ? (commandSurface === "rph" ? `rph "다음에 뭐 하면 돼?"` : "일반 텍스트로 AI agent와 대화")
    : primaryNext;
  console.log("RPH home");
  console.log(`- chat lane: ${chatLane}`);
  console.log(`- connector lane: ${connectorLane}`);
  console.log(`- work lane: ${workLane}`);
  console.log(`- proof lane: ${proofLane}`);
  if (pendingExternal.length > 0) {
    console.log(`- approval lane: ${pendingExternal.length} external action(s) waiting; next ${pendingExternal[0].command}`);
  } else {
    console.log("- approval lane: clear");
  }
  console.log(`- blocker: ${sanitizeRuntimeHomeText(options.reason)}`);
  if (workspace.nextAction.blockedBy.length > 0) {
    console.log(`- blocked by: ${workspace.nextAction.blockedBy.slice(0, 3).join("; ")}`);
  }
  console.log(`- do now: ${primaryNext}`);
  console.log(`- why: ${workspace.nextAction.reason}`);
  console.log(`- talk now: ${configuredAi.length > 0 ? talkNow : "connect an AI provider first"}`);
  console.log(`- control: ${primaryNext}`);
}

function runtimeHomeReasonFromManifest(manifest: RuntimeSessionManifest): string {
  if (manifest.status === "paused") {
    return "runtime paused";
  }
  if (manifest.status === "blocked") {
    return manifest.blocker ?? "runtime blocked";
  }
  if (manifest.pendingAction?.command) {
    return `pending action ${manifest.pendingAction.command}`;
  }
  return "none";
}

function printFreshProjectStatus(projectRoot: string, commandSurface: CommandSurface = "rph"): void {
  printRuntimeRecoveryCard(projectRoot, {
    title: "RPH status",
    reason: "project not initialized",
    commandSurface
  });
}

function printMissingAiAgentGuidance(projectRoot: string, proposedCommand?: string, commandSurface: CommandSurface = "rph"): void {
  printRuntimeRecoveryCard(projectRoot, {
    title: "AI agent is not connected yet.",
    reason: "AI provider missing; plain text chat is unavailable until setup passes",
    proposedCommand,
    commandSurface
  });
  console.log("대화하려면 먼저 AI provider를 연결해야 합니다. 연결 후에는 일반 텍스트가 곧 agent chat입니다.");
}

function isReadOnlyAgentCommand(command: string): boolean {
  try {
    const parsed = parseCli(parseCommandLine(command));
    if (["status", "help"].includes(parsed.command)) {
      return true;
    }
    if (parsed.command === "next") {
      return !optionBool(parsed.options, "execute");
    }
    if (parsed.command === "agent" && ["status", "handoffs", "actions", "intents"].includes(parsed.subcommand ?? "status")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function isLocalAgentCommand(command: string): boolean {
  try {
    if (isUserApprovalAgentCommand(command)) {
      return false;
    }
    const parsed = parseCli(parseCommandLine(command));
    switch (parsed.command) {
      case "status":
      case "next":
      case "help":
      case "setup":
      case "productize":
      case "pm":
      case "pd":
      case "fe":
      case "be":
      case "qa":
        return true;
      case "agent":
        return ["run", "continue", "status", "handoffs", "actions", "intents", "confirm-intent", "dismiss-intent"].includes(parsed.subcommand ?? "status");
      case "docs":
        return ["approve", "list", "show", "diff"].includes(parsed.subcommand ?? "");
      default:
        return false;
    }
  } catch {
    return false;
  }
}

function isUserApprovalAgentCommand(command: string): boolean {
  const normalized = command.trim().startsWith("/") ? command.trim() : `/${command.trim()}`;
  return isUserApprovalCommand(normalized);
}

function handleProductize(
  projectRoot: string,
  subcommand: string | undefined,
  args: string[],
  options: Record<string, string | boolean>
): void {
  const rawIdea = optionString(options, "idea") ?? [subcommand, ...args].filter((item): item is string => Boolean(item)).join(" ");
  const idea = extractProductIdea(rawIdea);
  if (!idea.trim()) {
    throw new Error("usage: /productize <product idea>");
  }
  if (!isRuntimeProjectInitialized(projectRoot)) {
    const projectName = productizeProjectName(idea);
    initProject(projectRoot, { projectName });
    console.log(`RPH project initialized: ${projectName}`);
  }
  requireInitialized(projectRoot);
  const result = runProductizeGoldenPath(projectRoot, { idea });
  console.log("Productize golden path complete");
  console.log(`idea: ${result.idea}`);
  console.log(`documents: ${result.documents.length}`);
  console.log(`design artifacts: ${result.designArtifacts.length}`);
  console.log(`issues: ${result.issues.map((issue) => `#${issue.issueNumber} ${issue.assigneeAgent}`).join(", ")}`);
  console.log(`PR drafts: ${result.pullRequests.map((pr) => `#${pr.prNumber}`).join(", ")}`);
  console.log(`QA reports: ${result.qaReports.map((report) => `PR #${report.prNumber}`).join(", ")}`);
  console.log(`report: ${result.reportMarkdownPath}`);
  console.log("next:");
  result.nextCommands.slice(0, 4).forEach((command) => console.log(`- ${command}`));
}

function productizeProjectName(idea: string): string {
  const normalized = idea.replace(/\s+/g, " ").trim();
  return normalized.length > 48 ? `${normalized.slice(0, 45).trim()}...` : normalized;
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

function createRuntimeSetupOnboardingPlan(): RuntimeActionPlan {
  return {
    kind: "start-workflow",
    confidence: 0.94,
    reason: "AI provider missing; start guided setup before plain chat",
    command: "/setup auto --live --mcp none",
    workflowTarget: "setup",
    safeToAutoRun: true,
    steps: [
      "Initialize the current folder as an RPH project if needed.",
      "Collect one AI provider credential in the runtime wizard.",
      "Run live readiness checks and return to plain text agent chat."
    ],
    createdAt: new Date().toISOString()
  };
}

async function resumeOriginalGoalAfterSetup(projectRoot: string, sessionId: string, originalInput: string): Promise<void> {
  if (!shouldResumeOriginalGoalAfterSetup(originalInput) || !safeHasReadyAiProvider(projectRoot)) {
    return;
  }
  const plan = createRuntimePostSetupResumePlan(projectRoot, originalInput);
  if (plan.kind === "chat" || !plan.command) {
    return;
  }
  recordRuntimeSessionEvent(projectRoot, sessionId, {
    kind: "plan",
    message: "post-setup original goal resumed",
    ok: true,
    plan
  });
  const intent = recordRuntimePlanIntent(projectRoot, sessionId, plan);
  console.log("");
  console.log("Original goal resume");
  printExecutionPlanCard(originalInput, plan, {
    confirmCommand: intent ? `/agent confirm-intent ${intent.id}` : undefined,
    dismissCommand: intent ? `/agent dismiss-intent ${intent.id}` : undefined
  });
  console.log(`suggested control: ${plan.command}`);
  console.log("run explicitly: type the suggested control when you want to execute it.");
  if (intent) {
    rememberPresentedIntent(projectRoot, sessionId, plan, intent);
    console.log(`intent saved: ${intent.id}`);
    console.log(`confirm: /agent confirm-intent ${intent.id}`);
    console.log(`dismiss: /agent dismiss-intent ${intent.id}`);
  }
}

function createRuntimePostSetupResumePlan(projectRoot: string, originalInput: string): RuntimeActionPlan {
  const plan = createRuntimePlan(projectRoot, originalInput);
  if (plan.kind !== "chat" || !isLikelyProductBuildGoal(originalInput)) {
    return plan;
  }
  const idea = extractProductIdea(originalInput);
  return {
    kind: "start-workflow",
    confidence: 0.82,
    reason: "resume original product goal after setup",
    command: `/productize "${escapeRuntimeCommandArg(idea)}"`,
    workflowTarget: "productize",
    safeToAutoRun: true,
    steps: [
      "Turn the original product goal into a reviewable execution package.",
      "Create product, design, FE, BE, QA, and PR draft artifacts.",
      "Stop at the existing review and approval gate."
    ],
    createdAt: new Date().toISOString()
  };
}

function shouldResumeOriginalGoalAfterSetup(input: string): boolean {
  return isLikelyProductBuildGoal(input) && !looksLikeSecretInput(input);
}

function isLikelyProductBuildGoal(input: string): boolean {
  const normalized = input.toLowerCase();
  const buildTerms = ["만들", "개발", "구현", "출시", "빌드", "build", "create", "make", "launch"];
  const productTerms = ["saas", "서비스", "앱", "제품", "프로덕트", "platform", "플랫폼", "web", "웹", "app", "tool", "툴"];
  return buildTerms.some((term) => normalized.includes(term)) && productTerms.some((term) => normalized.includes(term));
}

function looksLikeSecretInput(input: string): boolean {
  return /(?:\bsk-[A-Za-z0-9_-]{8,}|api[_ -]?key|token|secret|password|credential|BEGIN [A-Z ]*PRIVATE KEY)/i.test(input);
}

function escapeRuntimeCommandArg(value: string): string {
  return value.replace(/["\\]/g, "");
}

function ensureRuntimeProjectForSetupIntent(projectRoot: string, sessionId: string): void {
  if (!isRuntimeProjectInitialized(projectRoot)) {
    const projectName = path.basename(projectRoot) || "RPH Project";
    initProject(projectRoot, { projectName });
    console.log(`RPH project initialized: ${projectName}`);
  }
  ensureRuntimeSession(projectRoot, sessionId);
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
    "Normal user text is conversation; slash-prefixed commands are explicit workflow controls.",
    "Stay grounded in project state, approved artifacts, available slash commands, and current blockers.",
    "For mutating work, propose the command or handoff instead of claiming it already ran.",
    "Use Korean by default."
  ].join(" ");
}

function loadRuntimeChatConfig(projectRoot: string): ReturnType<typeof loadHarnessConfig> {
  return readHarnessConfigSnapshot(projectRoot);
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
    if (current && isContinuableRuntimeManifestStatus(current.status)) {
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

function isContinuableRuntimeManifestStatus(status: RuntimeSessionManifest["status"]): boolean {
  return status === "active" || status === "paused" || status === "blocked" || status === "recovering";
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

function handleWorkspace(
  projectRoot: string,
  subcommand: string | undefined,
  options: Record<string, string | boolean> = {},
  context: CommandContext = {}
): void {
  if (subcommand && subcommand !== "status") {
    throw new Error(`unsupported workspace command: ${subcommand}. available: workspace [status] [--json]`);
  }
  const snapshot = buildOperatorWorkspace(projectRoot);
  if (optionBool(options, "json")) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }
  console.log(renderOperatorWorkspace(snapshot, {
    commandSurface: context.runtimeShell ? "slash" : "rph"
  }));
}

function handleStatus(projectRoot: string, options: { commandSurface?: "rph" | "slash"; json?: boolean; verbose?: boolean } = {}): void {
  if (options.json) {
    console.log(JSON.stringify(buildOperatorWorkspace(projectRoot), null, 2));
    return;
  }
  if (!isRuntimeProjectInitialized(projectRoot)) {
    printFreshProjectStatus(projectRoot, options.commandSurface ?? "rph");
    return;
  }
  requireInitialized(projectRoot);
  const project = loadProject(projectRoot);
  const state = loadState(projectRoot);
  const config = loadHarnessConfig(projectRoot);
  const stage = WORKFLOW_STAGES[state.currentStage];
  const session = loadRuntimeSession(projectRoot);
  const commandSurface = options.commandSurface ?? "rph";
  const workspace = buildOperatorWorkspace(projectRoot);
  const advance = workflowAdvanceStatusFromRuntimeQueue(session, state) ?? workflowAdvanceStatus(state);
  const digestCommand = advance.canAdvance
    ? advance.nextCommand ?? (advance.nextStage ? recommendedCommand(state, advance.nextStage) : undefined)
    : commandForWorkflowStage(state.currentStage) ?? advance.nextCommand ?? (advance.nextStage ? recommendedCommand(state, advance.nextStage) : undefined);
  const operatorControlTakesPrecedence = ["approval", "runtime"].includes(workspace.nextAction.kind);
  const statusCommand = operatorControlTakesPrecedence
    ? workspace.nextAction.command
    : digestCommand ?? workspace.nextAction.command;
  const statusReason = operatorControlTakesPrecedence
    ? workspace.nextAction.reason
    : advance.reasons[0] ?? workspace.nextAction.reason;
  const statusBlockedBy = operatorControlTakesPrecedence
    ? workspace.nextAction.blockedBy
    : uniqueStatusStrings([...advance.reasons, ...workspace.nextAction.blockedBy]);
  const renderedNext = renderSurfaceNextCommand(commandSurface, statusCommand);
  console.log("RPH status");
  console.log(`- current: ${stage.id} (${stage.name}) owner=${stage.ownerAgent}`);
  console.log(`- next: ${renderedNext}`);
  console.log(`- blocked: ${advance.canAdvance ? "none" : advance.reasons[0] ?? "unknown"}`);
  if (statusBlockedBy.length > 0) {
    console.log(`- blocked by: ${statusBlockedBy.slice(0, 3).join("; ")}`);
  }
  console.log(`- do now: ${renderedNext}`);
  console.log(`- why: ${statusReason}`);
  console.log("- chat: rph shell (plain text goes to the connected AI agent)");
  console.log("- one-shot chat: rph ask \"다음에 뭐 하면 돼?\"");
  console.log(`- control: ${renderedNext}`);
  console.log("- inspect: rph workspace");
  for (const line of runtimeDigestLines(projectRoot, session)) {
    console.log(line);
  }
  if (!options.verbose) {
    return;
  }
  console.log(`프로젝트: ${project.name}`);
  console.log(`현재 단계: ${stage.id} (${stage.name})`);
  console.log(`담당: ${stage.ownerAgent}`);
  console.log(`AI: ${config.activeAiProvider}`);
  console.log(`MCP: ${configuredMcpServers(config).map((server) => server.id).join(", ") || "none"}`);
  printHarnessReadiness(projectRoot, config, state, options);
  printLatestVerifiedTargets(projectRoot);
  printLatestAgentToolProof(projectRoot);
  printProofLedgerSummary(projectRoot, { compact: true });
  printAgentIntegrationEvidence(state);
  console.log(`paused: ${state.paused}`);
  const next = nextStage(state);
  console.log(`다음 단계: ${next ?? "없음"}`);
  const approvalStages = [stage, ...(next ? [WORKFLOW_STAGES[next]] : [])];
  const requiredApprovals = Array.from(new Set(approvalStages.flatMap((item) => item.requiredApprovals)));
  if (requiredApprovals.length > 0) {
    const pending = requiredApprovals.filter((docId) => state.documents[docId]?.status !== "approved");
    const fulfilled = requiredApprovals.filter((docId) => state.documents[docId]?.status === "approved");
    if (pending.length > 0) {
      console.log(`승인 필요: ${pending.join(", ")}`);
    }
    if (fulfilled.length > 0) {
      console.log(`승인 완료: ${fulfilled.join(", ")}`);
    }
  }
  const requiredDesignApprovals = Array.from(new Set(approvalStages.flatMap((item) => item.requiredDesignApprovals)));
  if (requiredDesignApprovals.length > 0) {
    const pending = requiredDesignApprovals.filter((artifactId) => state.designArtifacts?.[artifactId]?.status !== "approved");
    const fulfilled = requiredDesignApprovals.filter((artifactId) => state.designArtifacts?.[artifactId]?.status === "approved");
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

function renderSurfaceNextCommand(surface: CommandSurface, command: string): string {
  return runtimeSurfaceCommand(surface, command.replace(/^\//, ""));
}

function uniqueStatusStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function sanitizeRuntimeHomeText(text: string): string {
  return text
    .replace(/(Incorrect API key provided:\s*)([^.\n]+)(\.)?/gi, "$1<redacted>$3")
    .replace(/(Bearer\s+)[^\s;,)]+/gi, "$1<redacted>")
    .replace(/([?&](?:key|token|api_key|access_token)=)[^&\s]+/gi, "$1<redacted>")
    .replace(/\b((?:api[_-]?key|token|secret|authorization)\s*[:=]\s*)(["']?)[^"'\s;,)]+/gi, "$1$2<redacted>$2")
    .replace(/\b(?:sk|rk|ghp|gho|ghu|ghs|ghr|github_pat|xoxb|xoxp|xoxa|xoxr|AIza)[A-Za-z0-9_-]{8,}\b/g, "<redacted>");
}

async function handleNext(projectRoot: string, options: Record<string, string | boolean> = {}): Promise<void> {
  requireInitialized(projectRoot);
  const state = loadState(projectRoot);
  const session = loadRuntimeSession(projectRoot);
  const advance = workflowAdvanceStatusFromRuntimeQueue(session, state) ?? workflowAdvanceStatus(state);
  const next = advance.nextStage;
  if (!next) {
    console.log("다음 단계 없음");
    return;
  }
  const command = advance.nextCommand ?? recommendedCommand(state, next);
  const transitionContext = workflowTransitionContext(projectRoot, next);
  const check = canTransition(state, next, transitionContext);
  console.log(`다음 권장 단계: ${next}`);
  console.log(`명령어: ${command}`);
  if (!optionBool(options, "execute")) {
    if (!check.ok) {
      console.log("실행 대기:");
      check.reasons.forEach((reason) => console.log(`- ${reason}`));
    }
    console.log("stage queue를 실제 진행하려면: /next --execute");
    return;
  }
  if (!check.ok) {
    console.log("stage queue 실행 차단:");
    check.reasons.forEach((reason) => console.log(`- ${reason}`));
    if (session && isContinuableRuntimeManifestStatus(session.status)) {
      updateRuntimeSession(projectRoot, session.sessionId, {
        blocker: check.reasons.join("; "),
        note: `next execution blocked: ${state.currentStage} -> ${next}`
      });
    }
    process.exitCode = 1;
    return;
  }
  const updated = transitionState(state, next, "stage queue advanced by /next --execute", transitionContext);
  saveState(projectRoot, updated);
  if (session && isContinuableRuntimeManifestStatus(session.status)) {
    updateRuntimeSession(projectRoot, session.sessionId, {
      status: "active",
      stage: next,
      blocker: null,
      checkpoint: `stage advanced to ${next}`,
      note: `next execution advanced: ${state.currentStage} -> ${next}`
    });
  }
  console.log(`stage queue 실행 완료: ${state.currentStage} -> ${next}`);
  console.log(`다음 명령어: ${recommendedAgentCommand(updated)}`);
}

function workflowAdvanceStatusFromRuntimeQueue(
  session: RuntimeSessionManifest | null,
  state: ProjectState
): ReturnType<typeof workflowAdvanceStatus> | null {
  const queue = session?.stageQueue ?? [];
  const currentEntryIndex = queue.findIndex((entry) => entry.stage === state.currentStage);
  const activeDifferentStage = queue.find((entry) => entry.status === "active" && entry.stage !== state.currentStage);
  const readyAfterCurrent = queue.find((entry, index) =>
    entry.status === "ready" &&
    (currentEntryIndex === -1 || index > currentEntryIndex) &&
    (WORKFLOW_STAGES[state.currentStage].nextStages.includes(entry.stage) || WORKFLOW_STAGES[entry.stage].prerequisites.includes(state.currentStage))
  );
  const queued = activeDifferentStage ?? readyAfterCurrent;
  if (!queued) {
    return null;
  }
  const check = canTransition(state, queued.stage);
  return {
    currentStage: state.currentStage,
    nextStage: queued.stage,
    nextCommand: queued.nextCommand ?? recommendedCommand(state, queued.stage),
    canAdvance: check.ok,
    reasons: check.reasons
  };
}

function handlePause(projectRoot: string, paused: boolean): void {
  requireInitialized(projectRoot);
  const state = loadState(projectRoot);
  saveState(projectRoot, { ...state, paused });
  const session = loadRuntimeSession(projectRoot);
  if (session && isContinuableRuntimeManifestStatus(session.status)) {
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
  if (session && isContinuableRuntimeManifestStatus(session.status)) {
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
  if (context.runtimeShell) {
    options = { ...options, commandSurface: "slash" };
  }
  const initialized = isRuntimeProjectInitialized(projectRoot);
  if (!initialized && isReadOnlySetupRequest(subcommand, options)) {
    // Read-only setup discovery must be safe to run before a project exists.
  } else if (!initialized && (subcommand === undefined || subcommand === "auto" || subcommand === "repair" || (subcommand === "mcp" && args[0] === "add"))) {
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
      await runSetupChecks(projectRoot, loadHarnessConfig(projectRoot), commandSurfaceFromOptions(options));
      return;
    }
    case "repair": {
      await runSetupRepair(projectRoot, options, context);
      return;
    }
    case "ai":
    case "provider": {
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
      if (args[0] === "add") {
        const id = args[1];
        const url = optionString(options, "url");
        if (!id || !url) {
          throw new Error("usage: /setup mcp add <id> --url <https://host/mcp> [--auth bearer|x-goog-api-key|none] [--auth-env ENV] [--allow-tool tool.name,other.read] [--probe-tool name] [--probe-args-json '{}']");
        }
        const probeTool = optionString(options, "probe-tool");
        const agentReadOnlyTools = parseToolListOption(optionString(options, "allow-tool") ?? optionString(options, "allow-tools"));
        const next = addCustomProtocolMcpServer(projectRoot, {
          id,
          name: optionString(options, "name"),
          url,
          authMode: parseMcpAuthMode(optionString(options, "auth")),
          authEnvKey: optionString(options, "auth-env") ?? optionString(options, "env"),
          protocolToolCallProbe: probeTool
            ? {
                toolName: probeTool,
                arguments: parseJsonObjectOption(optionString(options, "probe-args-json") ?? optionString(options, "probe-args"))
              }
            : undefined,
          agentReadOnlyTools,
          enabled: true
        });
        const server = next.mcpServers[parseMcpServerId(id)];
        if (!server) {
          throw new Error(`custom MCP server was not saved: ${id}`);
        }
        console.log(`Custom protocol MCP server 추가: ${server.id}`);
        if ((server.agentReadOnlyTools ?? []).length > 0) {
          console.log(`agent read-only tools: ${(server.agentReadOnlyTools ?? []).join(",")}`);
        } else {
          console.log("agent read-only tools: none (mcp.tools.call is blocked until --allow-tool or --probe-tool is configured)");
        }
        printMcpStatus(next);
        if (optionBool(options, "live")) {
          const checks = [await testMcpConnection(next, server.id)];
          const filePath = writeLiveConnectionReport(projectRoot, checks);
          printConnectionChecks(checks);
          printConnectionProofSteps(checks);
          printFirstValueActions(checks);
          printSetupRecoveryHints(checks, commandSurfaceFromOptions(options));
          console.log(`report: ${filePath}`);
          await finishLiveConnectionOnboarding(projectRoot, checks, options);
        }
        return;
      }
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
      console.log("Setup 명령어: auto | repair | detect | apply | check | ai/provider [openai|anthropic|gemini|local] | mcp [notion|github|figma|stitch] | mcp add <id> --url <https://host/mcp> | custom <key> <value>");
  }
}

function isReadOnlySetupRequest(subcommand: string | undefined, options: Record<string, string | boolean>): boolean {
  if (subcommand === "detect") {
    return true;
  }
  if (subcommand !== undefined && subcommand !== "auto") {
    return false;
  }
  return optionBool(options, "guide") || optionBool(options, "status") || optionBool(options, "non-interactive");
}

async function printSetupAutoSummary(
  projectRoot: string,
  options: Record<string, string | boolean>
): Promise<void> {
  const config = createHarnessConfig(process.env, undefined, loadHarnessConfig(projectRoot));
  console.log(renderSetupGuide(config));
  console.log("");
  console.log("권장 순서: rph setup detect -> rph setup apply -> rph setup check");
  if (isReadOnlySetupRequest("auto", options)) {
    console.log("guide: 현재 shell env 기준 연결 가능 상태만 표시했습니다. 파일 변경 없음.");
    console.log("초기화와 값 입력까지 진행하려면 TTY에서 `rph setup auto`를 실행하세요.");
    return;
  }
  if (optionBool(options, "live")) {
    console.log("auto --live: env 감지 결과를 적용한 뒤 live check까지 실행합니다.");
    printPersistedConfigRepairSummary(projectRoot, commandSurfaceFromOptions(options));
    const appliedConfig = syncHarnessConfigFromEnv(projectRoot);
    const checks = await runSetupChecks(projectRoot, appliedConfig, commandSurfaceFromOptions(options));
    await finishLiveConnectionOnboarding(projectRoot, checks, options);
    return;
  }
  console.log("대화형 연결 마법사로 값 입력까지 진행하려면 TTY에서 `rph setup auto`를 실행하세요.");
  console.log("Live 검증까지 한 번에 하려면: rph setup auto --live");
}

async function runSetupChecks(
  projectRoot: string,
  config: ReturnType<typeof loadHarnessConfig>,
  commandSurface: CommandSurface = "rph"
): Promise<ConnectionCheck[]> {
  printConfigSummary(config);
  console.log("");
  console.log("Live connection check");
  const checks = [...await testAllAiConnections(config), ...await testAllMcpConnections(config)];
  if (checks.length === 0) {
    console.log("- 검사할 configured 연결이 없습니다. 먼저 rph setup apply 또는 rph setup auto를 실행하세요.");
    return [];
  }
  const filePath = writeLiveConnectionReport(projectRoot, checks);
  printConnectionChecks(checks);
  printConnectionProofSteps(checks);
  printFirstValueActions(checks);
  printSetupRecoveryHints(checks, commandSurface);
  console.log(`report: ${filePath}`);
  return checks;
}

async function runSetupRepair(
  projectRoot: string,
  options: Record<string, string | boolean>,
  context: CommandContext = {}
): Promise<void> {
  console.log("RPH Setup Repair");
  const latestChecks = readLatestConnectionChecks(projectRoot);
  const failures = latestChecks.filter((check) => check.status !== "passed" && (check.kind === "ai" || check.kind === "mcp"));
  if (failures.length === 0) {
    console.log("- 최신 live report에 실패한 AI/MCP 연결이 없습니다.");
    if (shouldRunInteractiveSetup({ ...options, live: true }, context)) {
      console.log(`launching: ${runtimeSurfaceCommand(commandSurfaceFromOptions(options), "setup auto --live")}`);
      await runAutoSetupWizard(projectRoot, { ...options, live: true }, context);
      return;
    }
    console.log(`next: ${runtimeSurfaceCommand(commandSurfaceFromOptions(options), "setup auto --live")}`);
    return;
  }

  const selectedAi = uniqueConnectionIds(failures.filter((check) => check.kind === "ai").map((check) => parseAiProviderId(check.id)));
  const selectedMcp = uniqueConnectionIds(failures.filter((check) => check.kind === "mcp").map((check) => parseMcpServerId(check.id)));
  console.log(`failed connections from latest report: ${failures.map((check) => `${check.kind}:${check.id}`).join(", ")}`);
  console.log("repair scope: 최신 실패 연결만 재검증합니다. 다른 configured provider로 범위를 넓히지 않습니다.");

  const repairOptions = { ...options, live: true };
  const fromEnv = optionBool(options, "from-env");
  const canPrompt = !fromEnv && (Boolean(context.prompter) || Boolean(process.stdin.isTTY && process.stdout.isTTY));
  if (!fromEnv && !canPrompt) {
    console.log("repair guide: 현재 세션은 입력 프롬프트를 열 수 없습니다.");
    console.log("next: env 값을 설정한 뒤 /setup repair --from-env --live");
    return;
  }

  await withSetupPrompter(context, fromEnv, async (prompter) => {
    if (canPrompt) {
      console.log("");
      console.log("실패한 연결 값만 다시 입력합니다. Enter는 기존 값을 유지합니다.");
      const retryValues = await collectRetryEnvValues(prompter, projectRoot, failures);
      const savedKeys = saveSetupEnvValues(projectRoot, retryValues, ".env 재저장 완료");
      if (savedKeys.length === 0) {
        console.log("- 새로 입력한 값이 없어 현재 env/.env 값으로 재검증합니다.");
      }
      loadEnvFile(path.join(projectRoot, ".env"));
    }

    let config = syncHarnessConfigFromEnv(projectRoot);
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
    const checks = await runSelectedConnectionChecksWithRecovery(
      projectRoot,
      config,
      selectedAi,
      selectedMcp,
      repairOptions,
      prompter,
      canPrompt
    );
    await finishLiveConnectionOnboarding(projectRoot, checks, repairOptions);
  });
}

function uniqueConnectionIds<T extends string>(ids: T[]): T[] {
  return [...new Set(ids)];
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
    console.log("GitHub는 기존 gh 로그인을 감지하면 token 값 대신 GITHUB_TOKEN_SOURCE=gh-cli만 저장합니다.");
    console.log("");

    printPersistedConfigRepairSummary(projectRoot, commandSurfaceFromOptions(options));
    let config = syncHarnessConfigFromEnv(projectRoot);
    const selectedAi = await chooseAiProviders(prompter, config, options);
    const envValues: Record<string, string> = {};

    for (const providerId of selectedAi) {
      Object.assign(envValues, await collectAiEnvValues(prompter, providerId, fromEnv));
    }
    const selectedMcp = await chooseMcpServers(prompter, config, options, projectRoot);
    const customMcp = await maybeRegisterCustomMcpServersDuringAutoSetup(prompter, projectRoot, selectedMcp, options, fromEnv);
    const allSelectedMcp = uniqueConnectionIds([...selectedMcp, ...customMcp]);
    for (const serverId of allSelectedMcp) {
      Object.assign(envValues, await collectMcpEnvValues(prompter, serverId, projectRoot, fromEnv));
    }
    const changedCustomSettings = await configureSetupCustomSettings(prompter, projectRoot, options, fromEnv);
    if (changedCustomSettings.length > 0) {
      console.log(`custom settings saved: ${changedCustomSettings.join(", ")}`);
    }
    await configureSetupAgentProfiles(prompter, projectRoot, options, fromEnv);

    const savedKeys = saveSetupEnvValues(projectRoot, envValues);
    if (savedKeys.length === 0) {
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
    for (const serverId of allSelectedMcp) {
      config = setMcpServerEnabled(projectRoot, serverId, true);
    }
    config = syncHarnessConfigFromEnv(projectRoot);

    console.log("");
    console.log("연결 테스트");
    const checks = await runSelectedConnectionChecksWithRecovery(
      projectRoot,
      config,
      selectedAi,
      allSelectedMcp,
      options,
      prompter,
      !fromEnv
    );
    await finishLiveConnectionOnboarding(projectRoot, checks, options);

    console.log("");
    console.log("최종 상태");
    console.log(renderSetupGuide(syncHarnessConfigFromEnv(projectRoot)));
  });
}

async function configureSetupAgentProfiles(
  prompter: SetupPrompter,
  projectRoot: string,
  options: Record<string, string | boolean>,
  fromEnv: boolean
): Promise<void> {
  const explicit = setupAgentPackOption(options);
  const scopedConnectionSetup = Boolean(optionString(options, "ai") ?? optionString(options, "provider") ?? optionString(options, "mcp"));
  const shouldPrompt = !fromEnv && !scopedConnectionSetup && explicit === undefined;
  if (!shouldPrompt && explicit === undefined) {
    return;
  }

  console.log("");
  console.log("4. Agent profiles");
  const libraryRoot = agentLibraryRootFromOptions(options);
  const library = discoverAgentLibraryProfiles({ libraryRoot, limit: 1 });
  if (library.length === 0) {
    console.log(`- skipped: Awesome Codex Subagents library not found at ${libraryRoot ?? defaultAgentLibraryRoot()}`);
    console.log("- next: /agent discover 또는 /agent import <agent.toml>");
    return;
  }

  const shouldImport = explicit ?? parseSetupAgentPackChoice(await askText(prompter, "Import Hermes operator agent pack", "yes"));
  if (!shouldImport) {
    console.log("- skipped: agent pack import");
    return;
  }

  const requested = setupAgentPackNames(options);
  const names = requested.length > 0 ? requested : [...HERMES_OPERATOR_AGENT_PACK];
  const imported = [];
  for (const name of names) {
    try {
      imported.push(importCustomAgentProfile(projectRoot, name, { libraryRoot }));
    } catch (error) {
      console.log(`- skipped ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`agent pack imported from setup: ${imported.length}/${names.length}`);
  for (const profile of imported) {
    const model = profile.model ? ` model=${profile.model}` : "";
    const sandbox = profile.sandboxMode ? ` sandbox=${profile.sandboxMode}` : "";
    console.log(`- ${profile.slug}${model}${sandbox}`);
  }
  if (imported.length === 0) {
    console.log("- next: /agent discover");
    return;
  }

  const activateName = optionString(options, "activate-agent")
    ?? optionString(options, "active-agent")
    ?? optionString(options, "activate")
    ?? "workflow-orchestrator";
  const active = activateCustomAgentProfile(projectRoot, activateName);
  console.log(`active custom agent: ${active.name}`);
  console.log("policy: imported agent instructions guide chat/lane execution, but RPH approval gates still win");
}

function setupAgentPackOption(options: Record<string, string | boolean>): boolean | undefined {
  const value = options["agent-pack"] ?? options.agents ?? options["hermes-agents"];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = value.trim().toLowerCase();
  if (["0", "false", "no", "n", "off", "none", "skip", "later"].includes(normalized)) {
    return false;
  }
  return true;
}

function setupAgentPackNames(options: Record<string, string | boolean>): string[] {
  const value = optionString(options, "agent-pack") ?? optionString(options, "agents") ?? optionString(options, "hermes-agents");
  if (!value || ["true", "yes", "y", "1", "recommended", "default", "hermes", "hermes-operator"].includes(value.trim().toLowerCase())) {
    return [];
  }
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseSetupAgentPackChoice(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (["0", "false", "no", "n", "off", "none", "skip", "later"].includes(normalized)) {
    return false;
  }
  if (["", "1", "true", "yes", "y", "on", "recommended", "default", "hermes", "hermes-operator"].includes(normalized)) {
    return true;
  }
  throw new Error(`invalid agent pack choice: ${value}`);
}

async function configureSetupCustomSettings(
  prompter: SetupPrompter,
  projectRoot: string,
  options: Record<string, string | boolean>,
  fromEnv: boolean
): Promise<string[]> {
  const explicit = explicitSetupCustomSettings(options);
  const shouldPrompt = shouldPromptSetupCustomSettings(options, fromEnv);
  if (!shouldPrompt && Object.keys(explicit).length === 0) {
    return [];
  }
  const current = syncHarnessConfigFromEnv(projectRoot);
  const values = { ...explicit };
  console.log("");
  console.log("3. Custom settings");
  if (shouldPrompt && values.deployment === undefined) {
    console.log("배포 방식을 선택하세요: local, docker, aws, gcp, vercel, render, fly, railway, custom, later");
    values.deployment = parseDeploymentChoice(await askText(prompter, "Deployment", current.deployment));
  }
  if (shouldPrompt && values.stack === undefined) {
    console.log("기술 스택을 선택하세요: recommended, custom, analyze-existing");
    values.stack = parseStackChoice(await askText(prompter, "Stack", current.stack));
  }
  if (shouldPrompt && values["ui.theme"] === undefined) {
    console.log("터미널 UI 테마를 선택하세요: hacker, mono, minimal");
    values["ui.theme"] = parseUiThemeChoice(await askText(prompter, "Theme", current.ui.theme));
  }
  if (shouldPrompt && values["ui.color"] === undefined) {
    values["ui.color"] = parseSetupBoolean(await askText(prompter, "Color output", String(current.ui.color)));
  }
  if (shouldPrompt && values["ui.bootAnimation"] === undefined) {
    values["ui.bootAnimation"] = parseSetupBoolean(await askText(prompter, "Boot animation", String(current.ui.bootAnimation)));
  }

  const changed: string[] = [];
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      continue;
    }
    setHarnessConfigValue(projectRoot, key, value);
    changed.push(key);
  }
  if (changed.length === 0) {
    console.log("- custom settings unchanged");
  } else {
    for (const key of changed) {
      console.log(`- ${key}: ${values[key]}`);
    }
  }
  return changed;
}

function explicitSetupCustomSettings(options: Record<string, string | boolean>): Record<string, string> {
  const values: Record<string, string> = {};
  const deployment = setupOptionValue(options, "deployment");
  if (deployment !== undefined) {
    values.deployment = parseDeploymentChoice(deployment);
  }
  const stack = setupOptionValue(options, "stack");
  if (stack !== undefined) {
    values.stack = parseStackChoice(stack);
  }
  const theme = setupOptionValue(options, "theme") ?? setupOptionValue(options, "ui-theme");
  if (theme !== undefined) {
    values["ui.theme"] = parseUiThemeChoice(theme);
  }
  const color = setupOptionValue(options, "color");
  if (color !== undefined) {
    values["ui.color"] = parseSetupBoolean(color);
  }
  const bootAnimation = setupOptionValue(options, "boot-animation") ?? setupOptionValue(options, "boot");
  if (bootAnimation !== undefined) {
    values["ui.bootAnimation"] = parseSetupBoolean(bootAnimation);
  }
  return values;
}

function shouldPromptSetupCustomSettings(options: Record<string, string | boolean>, fromEnv: boolean): boolean {
  if (fromEnv) {
    return false;
  }
  if (optionBool(options, "customize") || optionBool(options, "settings")) {
    return true;
  }
  const scopedConnectionSetup = Boolean(optionString(options, "ai") ?? optionString(options, "provider") ?? optionString(options, "mcp"));
  return !scopedConnectionSetup;
}

function setupOptionValue(options: Record<string, string | boolean>, key: string): string | undefined {
  const value = options[key];
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

async function bindVerifiedMcpReadOnlyContracts(
  projectRoot: string,
  checks: ConnectionCheck[],
  options: Record<string, string | boolean>
): Promise<void> {
  if (!optionBool(options, "live")) {
    return;
  }
  const config = syncHarnessConfigFromEnv(projectRoot);
  const mcpChecks = checks.filter((check) => check.kind === "mcp" && check.status === "passed");
  let boundAny = false;
  for (const check of mcpChecks) {
    const serverId = parseMcpServerId(check.id);
    const server = config.mcpServers[serverId];
    if (!server) {
      continue;
    }
    const binding = (server.agentReadOnlyTools ?? []).length > 0
      ? await bindMcpReadOnlyToolContracts(projectRoot, serverId, process.env)
      : await autoBindMcpReadOnlyToolContracts(projectRoot, serverId, process.env);
    if ("skippedReason" in binding && binding.skippedReason) {
      console.log(`MCP read-only tool auto-bind skipped: ${serverId} (${binding.skippedReason})`);
      continue;
    }
    const autoSelectedTools = "autoSelectedTools" in binding && Array.isArray(binding.autoSelectedTools)
      ? binding.autoSelectedTools
      : [];
    if (autoSelectedTools.length > 0) {
      console.log(`MCP read-only tool auto-selected: ${serverId} ${autoSelectedTools.join(",")}`);
    }
    console.log(`MCP read-only tool contracts bound: ${serverId}`);
    console.log(`bound tools: ${binding.boundTools.join(",") || "none"}`);
    if (binding.missingTools.length > 0) {
      console.log(`missing allowlisted tools: ${binding.missingTools.join(",")} (agent tools/call disabled for missing tools)`);
    }
    boundAny = true;
  }
  if (boundAny) {
    refreshLatestLiveConnectionReportAfterMcpBinding(projectRoot, checks);
  }
}

function refreshLatestLiveConnectionReportAfterMcpBinding(
  projectRoot: string,
  checks = readLatestConnectionChecks(projectRoot)
): string | null {
  if (checks.length === 0) {
    return null;
  }
  const filePath = writeLiveConnectionReport(projectRoot, checks);
  console.log(`report refreshed after MCP contract binding: ${filePath}`);
  return filePath;
}

async function finishLiveConnectionOnboarding(
  projectRoot: string,
  checks: ConnectionCheck[],
  options: Record<string, string | boolean>
): Promise<void> {
  if (!optionBool(options, "live")) {
    return;
  }
  await bindVerifiedMcpReadOnlyContracts(projectRoot, checks, options);
  assertLiveSetupSucceeded(projectRoot, checks, options);
  await printSetupFirstSuccessExperience(projectRoot, checks, options);
}

function assertLiveSetupSucceeded(projectRoot: string, checks: ConnectionCheck[], options: Record<string, string | boolean>): void {
  if (!optionBool(options, "live")) {
    return;
  }
  const failures = liveSetupFailures(checks, options);
  if (checks.length === 0) {
    throw new Error("setup live check failed: no selected or configured connections were tested");
  }
  if (failures.length > 0) {
    throw new Error(`setup live check failed: ${failures.map((check) => `${check.kind}:${check.id} ${check.status} (${sanitizeConnectionDiagnosticText(check.message)})`).join("; ")}`);
  }
  console.log("setup live check passed");
  printSetupConnectedHandoff(projectRoot, checks, options);
  if (checks.some((check) => check.kind === "ai" && check.status === "passed")) {
    console.log("이제 일반 텍스트를 입력하면 연결된 AI agent와 대화합니다.");
  } else {
    console.log("AI provider가 아직 없어 plain text chat은 AI 연결 후 활성화됩니다.");
  }
  console.log("handoff: runtime ready");
  console.log(`next: ${runtimeSurfaceCommand(commandSurfaceFromOptions(options), "pm start")}`);
}

function printSetupConnectedHandoff(projectRoot: string, checks: ConnectionCheck[], options: Record<string, string | boolean>): void {
  const passed = checks.filter((check) => check.status === "passed");
  const ai = passed.filter((check) => check.kind === "ai").map((check) => check.id).join(", ") || "none";
  const mcp = passed.filter((check) => check.kind === "mcp").map((check) => check.id).join(", ") || "none";
  const commandSurface = commandSurfaceFromOptions(options);
  console.log("Connected agent home");
  console.log(`- chat lane: ${ai !== "none" ? `ready via ${ai}` : "blocked until AI provider setup"}`);
  console.log(`- connector lane: ${mcp !== "none" ? `verified ${mcp}` : "no verified connectors"}`);
  console.log("- secrets: stored in .env only; .rph/config.json stores redacted connection state");
  if (ai !== "none") {
    console.log("- talk now: type plain text to chat with the connected AI agent");
  } else {
    console.log(`- talk now: ${runtimeSurfaceCommand(commandSurface, "setup auto --live")}`);
  }
  console.log(`- control: ${runtimeSurfaceCommand(commandSurface, "pm start")}`);
  console.log(`- inspect: ${runtimeSurfaceCommand(commandSurface, "status")}`);
}

async function printSetupFirstSuccessExperience(
  projectRoot: string,
  checks: ConnectionCheck[],
  options: Record<string, string | boolean>
): Promise<void> {
  if (!optionBool(options, "live")) {
    return;
  }
  const passed = checks.filter((check) => check.status === "passed");
  if (passed.length === 0) {
    return;
  }
  const commandSurface = commandSurfaceFromOptions(options);
  const aiChecks = passed.filter((check) => check.kind === "ai");
  const mcpChecks = passed.filter((check) => check.kind === "mcp");
  console.log("");
  console.log("Capability summary");
  console.log(`- connected AI: ${aiChecks.map((check) => check.id).join(", ") || "none"}`);
  console.log(`- connected MCP: ${mcpChecks.map((check) => `${check.id} (${connectionTrustLabel(check)})`).join(", ") || "none"}`);
  if (aiChecks.length > 0) {
    console.log("- plain text: describe the product you want and the connected AI agent will answer in this runtime");
  } else {
    console.log("- plain text: connect an AI provider to enable agent chat in this runtime");
  }
  console.log(`- first product workflow: ${runtimeSurfaceCommand(commandSurface, "pm start")}`);
  console.log(`- setup proof: ${runtimeSurfaceCommand(commandSurface, "status")} shows the verified connection state`);
  printSetupAskExamples(aiChecks, mcpChecks);
  const operatorProofCompleted = await printSetupOperatorProofTurn(projectRoot, passed, options);
  if (operatorProofCompleted) {
    return;
  }

  const demoProvider = aiChecks[0]?.id;
  if (!demoProvider) {
    console.log("");
    console.log("First demo turn");
    console.log("- skipped: no AI provider was selected and verified");
    return;
  }
  try {
    const providerId = parseAiProviderId(demoProvider);
    const config = syncHarnessConfigFromEnv(projectRoot);
    const sessionId = resolveRuntimeSessionId(projectRoot);
    const prompt = setupFirstDemoPrompt(passed, commandSurface);
    const demoUserInput = "setup first demo: 연결된 기능으로 지금 무엇을 할 수 있는지 보여줘";
    const result = await generateAiText(config, {
      providerId,
      prompt,
      system: setupFirstDemoSystemPrompt(),
      maxOutputTokens: 500,
      temperature: 0
    });
    writeAiChatTurnRecord(projectRoot, createAiChatTurnRecord(result, sessionId, demoUserInput, prompt));
    recordRuntimeSessionEvent(projectRoot, sessionId, {
      kind: "chat",
      message: `setup first demo turn completed with ${providerId}`,
      ok: true
    });
    printAiProviderFallbackNotice(result);
    console.log("");
    console.log("First demo turn");
    console.log(`- provider: ${providerId}`);
    console.log(result.text.trim());
  } catch (error) {
    console.log("");
    console.log("First demo turn");
    console.log(`- skipped: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`- setup remains ready; continue with ${runtimeSurfaceCommand(commandSurface, "pm start")} or plain text chat`);
  }
}

async function printSetupOperatorProofTurn(
  projectRoot: string,
  checks: ConnectionCheck[],
  options: Record<string, string | boolean>
): Promise<boolean> {
  const commandSurface = commandSurfaceFromOptions(options);
  const aiCheck = checks.find((check) => check.kind === "ai" && check.status === "passed");
  if (!aiCheck) {
    return false;
  }
  const snapshot = buildOperatorWorkspace(projectRoot);
  const mcpCheck = checks.find((check) =>
    check.kind === "mcp"
    && check.status === "passed"
    && (check.firstActionProof?.action === "mcp.tools.call" || check.firstActionProof?.action === "mcp.tools.list")
  );
  console.log("");
  console.log("Operator proof turn");
  console.log(`- stage: ${snapshot.workflow.currentStage} (${snapshot.workflow.currentStageName})`);
  console.log(`- active AI: ${aiCheck.id}`);
  console.log(`- next action: ${renderSurfaceNextCommand(commandSurface, snapshot.nextAction.command)}`);
  if (!mcpCheck) {
    console.log("- connector proof: pending (no verified protocol MCP read-only tool)");
    return false;
  }

  const providerId = parseAiProviderId(aiCheck.id);
  const serverId = parseMcpServerId(mcpCheck.id);
  const sessionId = resolveRuntimeSessionId(projectRoot);
  const config = syncHarnessConfigFromEnv(projectRoot);
  const userInput = setupOperatorProofInput(serverId);
  try {
    const turnResult = await executeAgentTurn({
      projectRoot,
      sessionId,
      userInput,
      history: loadRuntimeChatHistory(projectRoot, sessionId),
      config,
      maxOutputTokens: 900
    });
    writeAiChatTurnRecord(projectRoot, createAiChatTurnRecord(
      turnResult.result,
      sessionId,
      userInput,
      turnResult.prompt,
      turnResult.turn.id
    ));
    recordRuntimeSessionEvent(projectRoot, sessionId, {
      kind: "chat",
      message: `setup operator proof turn completed with ${providerId}`,
      ok: true
    });
    const proofCall = turnResult.turn.toolCalls.find((call) =>
      call.status === "succeeded" && (call.name === "mcp.tools.call" || call.name === "mcp.tools.list")
    );
    printAiProviderFallbackNotice(turnResult.result);
    console.log("First demo turn");
    console.log("- mode: operator proof");
    console.log(`- provider: ${providerId}`);
    console.log(`- connector proof: ${proofCall ? `${serverId} ${proofCall.name} ${summarizeValue(proofCall.observation)}` : "pending (agent did not call a connector tool)"}`);
    console.log(firstLine(turnResult.text));
    return Boolean(proofCall);
  } catch (error) {
    console.log(`- connector proof: skipped (${error instanceof Error ? error.message : String(error)})`);
    console.log(`- recovery: ${runtimeSurfaceCommand(commandSurface, "doctor --live")}`);
    return false;
  }
}

function setupOperatorProofInput(serverId: McpServerId): string {
  if (serverId === "custom-echo") {
    return "operator proof: custom-echo echo 도구로 acceptance-mcp-ok를 확인하고 현재 workflow status와 next action을 요약해줘";
  }
  return "operator proof: protocol MCP list_projects tool을 호출해서 acceptance-mcp-ok를 확인하고 현재 workflow status와 next action을 요약해줘";
}

function setupFirstDemoPrompt(checks: ConnectionCheck[], commandSurface: CommandSurface): string {
  const ai = checks.filter((check) => check.kind === "ai").map((check) => `${check.id}:${connectionTrustLabel(check)}`).join(", ") || "none";
  const mcp = checks.filter((check) => check.kind === "mcp").map((check) => `${check.id}:${connectionTrustLabel(check)}`).join(", ") || "none";
  return [
    "RPH setup just verified live connections.",
    `Verified AI: ${ai}`,
    `Verified MCP: ${mcp}`,
    `Primary workflow command: ${runtimeSurfaceCommand(commandSurface, "pm start")}`,
    "In Korean, confirm that the agent is connected and list three concrete next product-building actions the user can ask for in plain language.",
    "Do not mention secrets, tokens, API keys, raw URLs, or internal config values."
  ].join("\n");
}

function setupFirstDemoSystemPrompt(): string {
  return [
    "You are Real Product Harness after setup verification.",
    "Return concise Korean plain text only.",
    "Make the user feel the connected AI agent is ready to help, but do not claim that any external write action has run.",
    "Do not reveal or infer secrets, tokens, API keys, or raw configuration values."
  ].join("\n");
}

function liveSetupFailures(checks: ConnectionCheck[], options: Record<string, string | boolean>): ConnectionCheck[] {
  return checks.filter((check) => {
    return check.status !== "passed" && !(optionBool(options, "allow-missing") && check.status === "skipped" && check.missingEnv.length > 0);
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
    return parseMcpSelection(optionValue, config);
  }
  const defaultServers = defaultMcpServers(config, projectRoot);
  console.log("");
  console.log("2. MCP 선택");
  console.log("  notion, github, figma, stitch 또는 추가된 custom id를 쉼표로 입력하세요.");
  console.log("  built-in 선택 뒤 custom protocol MCP 서버를 이 wizard 안에서 바로 추가할 수 있습니다.");
  console.log("  all = 전체, none = 건너뛰기");
  const answer = await askText(prompter, "MCP", defaultServers.join(","));
  return parseMcpSelection(answer, config);
}

async function maybeRegisterCustomMcpServersDuringAutoSetup(
  prompter: SetupPrompter,
  projectRoot: string,
  selectedMcp: McpServerId[],
  options: Record<string, string | boolean>,
  fromEnv: boolean
): Promise<McpServerId[]> {
  if (fromEnv) {
    return [];
  }
  const config = syncHarnessConfigFromEnv(projectRoot);
  const registered: McpServerId[] = [];
  const selectedUnknownIds = selectedMcp.filter((id) => !config.mcpServers[id]);
  for (const id of selectedUnknownIds) {
    console.log("");
    console.log("2a. Custom protocol MCP 추가");
    console.log(`선택한 MCP id가 아직 등록되지 않았습니다: ${id}`);
    registered.push(await registerCustomMcpServerDuringAutoSetup(prompter, projectRoot, id));
  }
  if (optionString(options, "mcp") !== undefined) {
    return registered;
  }
  while (true) {
    console.log("");
    console.log("2a. Custom protocol MCP 추가");
    const shouldAdd = parseSetupBoolean(await askText(prompter, "Add custom MCP", "no")) === "true";
    if (!shouldAdd) {
      return registered;
    }

    registered.push(await registerCustomMcpServerDuringAutoSetup(prompter, projectRoot));
  }
}

async function registerCustomMcpServerDuringAutoSetup(
  prompter: SetupPrompter,
  projectRoot: string,
  preselectedId?: McpServerId
): Promise<McpServerId> {
  const id = preselectedId ?? parseMcpServerId(await askRequiredText(prompter, "Custom MCP id"));
  const name = await askOptionalText(prompter, "Custom MCP name");
  const url = await askRequiredText(prompter, "Custom MCP URL");
  const authMode = parseMcpAuthMode(await askText(prompter, "Custom MCP auth mode", "bearer")) ?? "bearer";
  const authEnvKey = authMode === "none" ? undefined : await askOptionalText(prompter, "Custom MCP auth env");
  const proofMode = parseSetupMcpProofMode(await askText(prompter, "Custom MCP proof mode", "tools/list"));
  const probeTool = proofMode === "tools/call" ? await askRequiredText(prompter, "Probe tool") : undefined;
  const probeArgs = proofMode === "tools/call"
    ? parseJsonObjectOption(await askOptionalText(prompter, "Probe args JSON"))
    : undefined;

  const next = addCustomProtocolMcpServer(projectRoot, {
    id,
    name: name || undefined,
    url,
    authMode,
    authEnvKey: authEnvKey || undefined,
    protocolToolCallProbe: probeTool
      ? {
          toolName: probeTool,
          arguments: probeArgs
        }
      : undefined,
    enabled: true
  });
  const server = next.mcpServers[id];
  if (!server) {
    throw new Error(`custom MCP server was not saved: ${id}`);
  }
  console.log(`Custom protocol MCP server 추가: ${server.id}`);
  console.log(`- target: ${server.url}`);
  console.log(`- auth: ${server.authMode ?? "none"}${server.authEnvKey ? ` env=${server.authEnvKey}` : ""}`);
  console.log(`- proof: ${server.protocolReadiness ?? "tools/list"}`);
  if (server.protocolToolCallProbe?.toolName) {
    console.log(`- probe tool: ${server.protocolToolCallProbe.toolName}`);
  }
  return server.id;
}

async function collectAiEnvValues(
  prompter: SetupPrompter,
  providerId: AiProviderId,
  writeExistingEnv = false,
  promptExistingEnv = false
): Promise<Record<string, string>> {
  const definition = AI_PROVIDER_DEFINITIONS[providerId];
  const values: Record<string, string> = {};
  console.log("");
  console.log(`AI 연결: ${definition.name}`);
  for (const key of definition.envKeys) {
    if (process.env[key] && !promptExistingEnv) {
      console.log(`- ${key}: 이미 설정됨`);
      if (writeExistingEnv) {
        values[key] = process.env[key] ?? "";
      }
      continue;
    }
    const answer = await askEnvValue(prompter, key, process.env[key] ?? "");
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
  writeExistingEnv = false,
  promptExistingEnv = false
): Promise<Record<string, string>> {
  const config = syncHarnessConfigFromEnv(projectRoot);
  const definition = config.mcpServers[serverId];
  if (!definition) {
    throw new Error(`unknown MCP server: ${serverId}`);
  }
  const values: Record<string, string> = {};
  const discovered = serverId === "github" ? discoverGitHubEnv(projectRoot) : {};
  console.log("");
  console.log(`MCP 연결: ${definition.name}`);
  for (const key of definition.envKeys) {
    if (process.env[key] && !promptExistingEnv) {
      console.log(`- ${key}: 이미 설정됨`);
      if (writeExistingEnv) {
        values[key] = process.env[key] ?? "";
      }
      continue;
    }
    if (serverId === "github" && key === "GITHUB_TOKEN" && discovered.GITHUB_TOKEN_SOURCE === "gh-cli") {
      console.log("- GITHUB_TOKEN: GitHub CLI 인증 감지; token 값은 .env에 저장하지 않고 실행 시 임시 사용");
      values.GITHUB_TOKEN_SOURCE = "gh-cli";
      continue;
    }
    const defaultValue = process.env[key] ?? discovered[key] ?? "";
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
  selectedMcp: McpServerId[]
) {
  const checks = [];
  for (const providerId of selectedAi) {
    checks.push(await testAiConnection(config, providerId));
  }
  for (const serverId of selectedMcp) {
    checks.push(await testMcpConnection(config, serverId));
  }
  return checks;
}

async function runSelectedConnectionChecksWithRecovery(
  projectRoot: string,
  initialConfig: ReturnType<typeof loadHarnessConfig>,
  selectedAi: AiProviderId[],
  selectedMcp: McpServerId[],
  options: Record<string, string | boolean>,
  prompter: SetupPrompter,
  canPromptRetry: boolean
): Promise<ConnectionCheck[]> {
  const maxAttempts = optionBool(options, "live") && canPromptRetry ? 3 : 1;
  let config = initialConfig;
  let checks: ConnectionCheck[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    checks = await runSelectedConnectionChecks(config, selectedAi, selectedMcp);
    printSelectedConnectionCheckReport(projectRoot, checks, commandSurfaceFromOptions(options));
    const failures = liveSetupFailures(checks, options);
    if (!optionBool(options, "live") || failures.length === 0 || attempt === maxAttempts) {
      return checks;
    }

    console.log("");
    console.log(`live check 재시도 준비 (${attempt}/${maxAttempts - 1})`);
    console.log("실패한 연결 값을 다시 입력하세요. Enter는 기존 값을 유지합니다.");
    const retryValues = await collectRetryEnvValues(prompter, projectRoot, failures);
    const savedKeys = saveSetupEnvValues(projectRoot, retryValues, ".env 재저장 완료");
    if (savedKeys.length === 0) {
      console.log("- 새로 입력한 값이 없어 기존 값으로 재시도합니다.");
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
    console.log("연결 테스트 재시도");
  }
  return checks;
}

function printSelectedConnectionCheckReport(
  projectRoot: string,
  checks: ConnectionCheck[],
  commandSurface: CommandSurface = "rph"
): void {
  if (checks.length === 0) {
    console.log("- 테스트할 연결이 아직 없습니다. AI provider 또는 MCP 값을 입력하면 자동 검증합니다.");
    return;
  }
  const filePath = writeLiveConnectionReport(projectRoot, checks);
  printConnectionChecks(checks);
  printConnectionProofSteps(checks);
  printFirstValueActions(checks);
  printSetupRecoveryHints(checks, commandSurface);
  console.log(`report: ${filePath}`);
}

async function collectRetryEnvValues(
  prompter: SetupPrompter,
  projectRoot: string,
  failures: ConnectionCheck[]
): Promise<Record<string, string>> {
  const values: Record<string, string> = {};
  const seen = new Set<string>();
  for (const check of failures) {
    const key = `${check.kind}:${check.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    if (check.kind === "ai") {
      Object.assign(values, await collectAiEnvValues(prompter, parseAiProviderId(check.id), true, true));
    } else if (check.kind === "mcp") {
      Object.assign(values, await collectMcpEnvValues(prompter, parseMcpServerId(check.id), projectRoot, true, true));
    }
  }
  return values;
}

function saveSetupEnvValues(projectRoot: string, envValues: Record<string, string>, message = ".env 저장 완료"): string[] {
  if (Object.keys(envValues).length === 0) {
    return [];
  }
  const result = upsertEnvFileValues(path.join(projectRoot, ".env"), envValues);
  Object.assign(process.env, envValues);
  const keys = [...new Set([...result.updatedKeys, ...result.appendedKeys])].sort();
  console.log("");
  console.log(`${message}: ${keys.join(", ")}`);
  return keys;
}

async function askText(prompter: SetupPrompter, label: string, defaultValue: string): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  const answer = (await prompter.question(`${label}${suffix}: `)).trim();
  return answer || defaultValue;
}

async function askOptionalText(prompter: SetupPrompter, label: string): Promise<string> {
  return (await prompter.question(`${label} (optional): `)).trim();
}

async function askRequiredText(prompter: SetupPrompter, label: string): Promise<string> {
  while (true) {
    const answer = (await prompter.question(`${label}: `)).trim();
    if (answer) {
      return answer;
    }
    console.log(`${label} is required.`);
  }
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

function parseMcpSelection(value: string, config?: ReturnType<typeof loadHarnessConfig>): McpServerId[] {
  const normalized = value.trim().toLowerCase();
  if (!normalized || ["none", "skip", "later", "no", "n"].includes(normalized)) {
    return [];
  }
  if (normalized === "all") {
    return Object.keys(config?.mcpServers ?? MCP_SERVER_DEFINITIONS) as McpServerId[];
  }
  const seen = new Set<McpServerId>();
  for (const item of normalized.split(",").map((part) => part.trim()).filter(Boolean)) {
    seen.add(parseMcpServerId(item));
  }
  return [...seen];
}

function discoverGitHubEnv(projectRoot: string): Record<string, string> {
  const values: Record<string, string> = {};
  const ghBinary = githubCliBinary();
  if (runStatus(ghBinary, ["auth", "status", "--hostname", "github.com"], projectRoot)) {
    values.GITHUB_TOKEN_SOURCE = "gh-cli";
  }
  const remote = runCapture("git", ["config", "--get", "remote.origin.url"], projectRoot);
  const parsed = remote ? parseGitHubRemote(remote) : null;
  if (parsed) {
    values.GITHUB_OWNER = parsed.owner;
    values.GITHUB_REPO = parsed.repo;
  }
  return values;
}

function runStatus(command: string, args: string[], cwd: string): boolean {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "ignore", "ignore"] });
  return result.status === 0;
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
      printAiStatus(config, projectRoot);
      printLatestVerifiedTargets(projectRoot);
      return;
    case "enable": {
      const providerId = parseAiProviderId(args[0]);
      const next = setAiProviderEnabled(projectRoot, providerId, true);
      console.log(`AI provider 활성화: ${providerId}`);
      printAiStatus(next, projectRoot);
      return;
    }
    case "disable": {
      const providerId = parseAiProviderId(args[0]);
      const next = setAiProviderEnabled(projectRoot, providerId, false);
      console.log(`AI provider 비활성화: ${providerId}`);
      printAiStatus(next, projectRoot);
      return;
    }
    case "test": {
      const checks = args[0] ? [await testAiConnection(config, parseAiProviderId(args[0]))] : await testAllAiConnections(config);
      const filePath = writeLiveConnectionReport(projectRoot, checks);
      printConnectionChecks(checks);
      printConnectionProofSteps(checks);
      printFirstValueActions(checks);
      printSetupRecoveryHints(checks);
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
      printAiProviderFallbackNotice(result);
      console.log(result.text);
      console.log(`ai_run: ${recordPath}`);
      return;
    }
    default:
      console.log("AI 명령어: status | enable <provider> | disable <provider> | test [provider] | run --prompt <text>");
  }
}

async function handleMcp(
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
      printMcpStatus(config);
      printLatestVerifiedTargets(projectRoot);
      return;
    case "tools": {
      const server = optionString(options, "server") ?? args[0] ?? "all";
      if (server !== "all" && optionBool(options, "bind")) {
        const result = await bindMcpReadOnlyToolContracts(projectRoot, parseMcpServerId(server), process.env);
        console.log(`MCP read-only tool contracts bound: ${server}`);
        console.log(`bound tools: ${result.boundTools.join(",") || "none"}`);
        if (result.missingTools.length > 0) {
          console.log(`missing allowlisted tools: ${result.missingTools.join(",")}`);
        }
        refreshLatestLiveConnectionReportAfterMcpBinding(projectRoot);
        printMcpStatus(result.config);
        return;
      }
      if (server !== "all" && !optionBool(options, "agent")) {
        const output = await listOperatorMcpTools({
          projectRoot,
          config,
          env: process.env,
          serverId: parseMcpServerId(server)
        });
        console.log(output);
        return;
      }
      if (optionBool(options, "discover")) {
        throw new Error("usage: /mcp tools <server> --discover");
      }
      const output = await runAgentFabricTool({
        projectRoot,
        config,
        env: process.env,
        name: "mcp.tools.list",
        args: { server }
      });
      console.log(output ?? "{}");
      return;
    }
    case "call": {
      const dottedTarget = args[0] && !args[1] ? parseMcpApprovalAction(args[0]) : null;
      const server = optionString(options, "server") ?? dottedTarget?.server ?? args[0];
      const toolName = optionString(options, "tool") ?? optionString(options, "name") ?? dottedTarget?.tool ?? args[1];
      if (!server || !toolName) {
        console.log("usage: /mcp call <server> <tool> --read-only --args-json '{}' 또는 /mcp call <server>.<tool> --args-json '{}'");
        process.exitCode = 2;
        return;
      }
      const output = await callOperatorMcpTool({
        projectRoot,
        config,
        env: process.env,
        serverId: parseMcpServerId(server),
        toolName,
        arguments: parseJsonObjectOption(optionString(options, "args-json") ?? optionString(options, "arguments-json") ?? optionString(options, "args")) ?? {},
        readOnly: optionBool(options, "read-only") || optionBool(options, "readOnly")
      });
      console.log(output);
      return;
    }
    case "canary":
      await handleMcpCanary(projectRoot, config, args, options);
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
      const filePath = writeLiveConnectionReport(projectRoot, checks);
      printConnectionChecks(checks);
      printConnectionProofSteps(checks);
      printFirstValueActions(checks);
      printSetupRecoveryHints(checks);
      console.log(`report: ${filePath}`);
      return;
    }
    default:
      throw new Error(`unsupported MCP command: ${subcommand ?? "(empty)"}. available: status | tools [server] | tools <server> --discover | call <server> <tool> --read-only --args-json '{}' | canary <server> <tool> --args-json '{}' --execute | enable <server> | disable <server> | test [server]`);
  }
}

async function handleMcpCanary(
  projectRoot: string,
  config: ReturnType<typeof loadHarnessConfig>,
  args: string[],
  options: Record<string, string | boolean>
): Promise<void> {
  const dottedTarget = args[0] && !args[1] ? parseMcpApprovalAction(args[0]) : null;
  const server = optionString(options, "server") ?? dottedTarget?.server ?? args[0] ?? "stitch";
  const toolName = optionString(options, "tool") ?? optionString(options, "name") ?? dottedTarget?.tool ?? args[1] ?? defaultMcpCanaryTool(server);
  if (!server || !toolName) {
    console.log("usage: /mcp canary <server> <tool> --args-json '{}' --execute");
    process.exitCode = 2;
    return;
  }
  const serverId = parseMcpServerId(server);
  const toolArgs = parseJsonObjectOption(optionString(options, "args-json") ?? optionString(options, "arguments-json") ?? optionString(options, "args"))
    ?? defaultMcpCanaryArguments(serverId, toolName);
  const command = formatMcpMutableCallCommand(serverId, toolName, toolArgs);
  const mutableAction = classifyMutableAgentCommand(command);
  if (!mutableAction) {
    throw new Error(`mcp canary currently supports known approval-gated mutable MCP actions; ${serverId}.${toolName} is not registered.`);
  }
  const env = { ...process.env };
  loadEnvFile(path.join(projectRoot, ".env"), env);
  const snapshot = await captureOperatorMcpToolCallSnapshot({
    projectRoot,
    config: readHarnessConfigSnapshot(projectRoot, env),
    env,
    serverId,
    toolName,
    arguments: toolArgs
  });
  const execute = optionBool(options, "execute") || optionBool(options, "yes");
  const baseReport = {
    schema: "rph-mcp-mutable-canary-v1",
    generatedAt: new Date().toISOString(),
    server: serverId,
    toolName,
    command,
    mode: execute ? "execute" : "plan",
    safety: {
      action: `${serverId}.${toolName}`,
      risk: mutableAction.risk,
      approvalBinding: "runtime-action-approval",
      autoApprovedBy: execute ? "mcp-canary-explicit-command" : null
    },
    arguments: toolArgs,
    snapshot: {
      fingerprint: snapshot.fingerprint,
      capturedAt: snapshot.capturedAt,
      snapshotPath: snapshot.snapshotPath
    }
  };
  if (!execute) {
    const artifacts = writeMcpCanaryArtifacts(projectRoot, {
      ...baseReport,
      status: "planned",
      actionApprovalId: null,
      readback: null
    });
    console.log("MCP mutable canary");
    console.log("- status: planned");
    console.log(`- target: ${serverId}.${toolName}`);
    console.log(`- snapshot: ${snapshot.fingerprint}`);
    console.log(`- execute: /mcp canary ${serverId} ${toolName} --args-json ${quoteShellArg(JSON.stringify(toolArgs))} --execute`);
    console.log(`- canary: ${artifacts.jsonPath}`);
    return;
  }

  const sessionId = resolveRuntimeSessionId(projectRoot);
  ensureRuntimeSession(projectRoot, sessionId);
  const record = recordRuntimeActionApproval(projectRoot, {
    sessionId,
    command,
    reason: "mutable MCP canary proof",
    message: `MCP mutable canary for ${serverId}.${toolName}`,
    approvedTargetId: `mcp:${serverId}.${toolName}`,
    approvedParameters: {
      command: "call",
      server: serverId,
      tool: toolName,
      argumentsJson: JSON.stringify(toolArgs),
      snapshotFingerprint: snapshot.fingerprint
    },
    approvedSnapshot: snapshot
  });
  updateRuntimeSession(projectRoot, sessionId, {
    status: "blocked",
    blocker: `mcp mutable canary pending: ${record.id}`,
    pendingExternalActionId: record.id,
    note: `mcp mutable canary pending: ${record.command}`
  });
  const ok = await approveAndExecuteRuntimeAction(projectRoot, record.id, "mcp-canary");
  const completed = loadRuntimeActionApprovals(projectRoot).find((item) => item.id === record.id);
  const passed = ok && completed?.status === "completed" && completed.readbackStatus === "passed";
  const artifacts = writeMcpCanaryArtifacts(projectRoot, {
    ...baseReport,
    generatedAt: new Date().toISOString(),
    status: passed ? "passed" : "failed",
    actionApprovalId: record.id,
    readback: completed
      ? {
          status: completed.readbackStatus ?? null,
          verifiedTargetId: completed.verifiedTargetId ?? null,
          artifactPath: completed.readbackArtifactPath ?? null,
          actionApprovalId: completed.readbackActionApprovalId ?? null,
          approvedFingerprint: completed.readbackApprovedFingerprint ?? null,
          verifiedAt: completed.readbackVerifiedAt ?? null
        }
      : null
  });
  console.log("MCP mutable canary");
  console.log(`- status: ${passed ? "passed" : "failed"}`);
  console.log(`- target: ${serverId}.${toolName}`);
  console.log(`- action: ${record.id}`);
  console.log(`- snapshot: ${snapshot.fingerprint}`);
  if (completed?.verifiedTargetId) {
    console.log(`- readback: ${completed.verifiedTargetId}`);
  }
  if (completed?.readbackArtifactPath) {
    console.log(`- readback file: ${completed.readbackArtifactPath}`);
  }
  console.log(`- canary: ${artifacts.jsonPath}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

function defaultMcpCanaryTool(server: string): string | undefined {
  return server === "stitch" ? "create_project" : undefined;
}

function defaultMcpCanaryArguments(server: string, toolName: string): Record<string, unknown> {
  if (server === "stitch" && toolName === "create_project") {
    return {
      title: `RPH Mutable Canary ${new Date().toISOString()}`
    };
  }
  return {};
}

function formatMcpMutableCallCommand(serverId: string, toolName: string, args: Record<string, unknown>): string {
  return `/mcp call ${serverId} ${toolName} --args-json ${quoteShellArg(JSON.stringify(args))}`;
}

function writeMcpCanaryArtifacts(projectRoot: string, report: Record<string, unknown>): { jsonPath: string; latestPath: string } {
  const actionId = typeof report.actionApprovalId === "string" && report.actionApprovalId.length > 0
    ? report.actionApprovalId
    : typeof report.snapshot === "object" && report.snapshot && "fingerprint" in report.snapshot
      ? String((report.snapshot as { fingerprint?: unknown }).fingerprint ?? "snapshot")
      : "planned";
  const dir = path.join(projectRoot, ".rph", "mcp");
  const jsonPath = path.join(dir, `canary-${safeFileSegment(actionId)}.json`);
  const latestPath = path.join(dir, "canary-latest.json");
  writeJson(jsonPath, report);
  writeJson(latestPath, report);
  return { jsonPath, latestPath };
}

function safeFileSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

async function handleLive(
  projectRoot: string,
  subcommand: string | undefined,
  args: string[],
  options: Record<string, string | boolean>
): Promise<void> {
  if (subcommand === "audit" || optionBool(options, "audit")) {
    await handleLiveAudit(projectRoot, args, options);
    return;
  }
  const target = liveTargetFromArgs(subcommand, args, options);
  if (!target) {
    console.log("Live proof commands");
    console.log("  rph live ai:openai");
    console.log("  rph live ai:anthropic");
    console.log("  rph live ai:gemini");
    console.log("  rph live mcp:stitch");
    console.log("  rph live target mcp:github");
    console.log("  rph live audit [--strict] [--output <path>]");
    console.log("");
    console.log("Runtime slash form:");
    console.log("  /live ai:openai");
    console.log("  /live mcp:stitch");
    console.log("  /live audit");
    return;
  }
  if (!isRuntimeProjectInitialized(projectRoot)) {
    const projectName = optionString(options, "project-name") ?? (path.basename(projectRoot) || "RPH Project");
    initProject(projectRoot, { projectName });
    console.log(`RPH project initialized: ${projectName}`);
  }

  let config = syncHarnessConfigFromEnv(projectRoot);
  if (target.kind === "ai") {
    config = setAiProviderEnabled(projectRoot, target.id, true);
    config = setHarnessConfigValue(projectRoot, "ai.active", target.id);
  } else {
    config = setMcpServerEnabled(projectRoot, target.id, true);
  }
  config = syncHarnessConfigFromEnv(projectRoot);
  console.log(`Live target check: ${target.kind}:${target.id}`);
  const checks = target.kind === "ai"
    ? [await testAiConnection(config, target.id)]
    : [await testMcpConnection(config, target.id)];
  const filePath = writeLiveConnectionReport(projectRoot, checks, {
    command: `rph live ${target.kind}:${target.id}`,
    selectedTargets: [`${target.kind}:${target.id}`],
    runner: "cli",
    source: "live"
  });
  printConnectionChecks(checks);
  printConnectionProofSteps(checks);
  printFirstValueActions(checks);
  printSetupRecoveryHints(checks);
  console.log(`report: ${filePath}`);
  if (checks.some((check) => check.status !== "passed")) {
    process.exitCode = 1;
  }
}

async function handleLiveAudit(
  projectRoot: string,
  _args: string[],
  options: Record<string, string | boolean>
): Promise<void> {
  if (!isRuntimeProjectInitialized(projectRoot)) {
    const projectName = optionString(options, "project-name") ?? (path.basename(projectRoot) || "RPH Project");
    initProject(projectRoot, { projectName });
    console.log(`RPH project initialized: ${projectName}`);
  }

  const configuredOnly = !optionBool(options, "all");
  const strict = optionBool(options, "strict");
  const config = syncHarnessConfigFromEnv(projectRoot);
  const checks = [
    ...await testAllAiConnections(config),
    ...await testAllMcpConnections(config)
  ];
  const reportPath = writeLiveConnectionReport(projectRoot, checks, {
    command: strict ? "rph live audit --strict" : "rph live audit",
    selectedTargets: checks.map(formatConnectionTarget),
    runner: "cli",
    source: "live"
  });
  const report = readConnectionReport(projectRoot);
  const reportWithProof = report as ({ onboardingProof?: Array<Record<string, unknown>> } & typeof report);
  const failures = liveAuditFailures(checks, configuredOnly);
  const audit = buildCliLiveAuditReport({
    configuredOnly,
    strict,
    sourceReport: reportPath,
    provenance: report?.provenance ?? null,
    checks,
    onboardingProof: Array.isArray(reportWithProof?.onboardingProof) ? reportWithProof.onboardingProof : [],
    failures
  });
  const artifacts = writeCliLiveAuditArtifacts(projectRoot, audit, optionString(options, "output"));

  console.log("Live credential audit");
  console.log("audit complete");
  console.log(`- release readiness: ${audit.summary.releaseReady ? "yes" : "no"}`);
  console.log(`- summary: passed=${audit.summary.passed} failed=${audit.summary.failed} skipped=${audit.summary.skipped} total=${audit.summary.total}`);
  console.log(`- strict: ${strict ? "yes" : "no"}`);
  console.log(`- connection_report: ${reportPath}`);
  console.log(`- audit: ${artifacts.jsonPath}`);
  console.log(`- audit_markdown: ${artifacts.markdownPath}`);
  for (const check of audit.checks) {
    console.log(`- ${check.kind}:${check.id} status=${check.status} trust=${check.trust}:${check.provenStage}`);
    if (check.usableAction.status === "passed") {
      console.log(`  usable_action: ${check.usableAction.action} target=${check.usableAction.targetId} verified_by=${check.usableAction.verifiedBy}`);
    }
    if (check.cause) {
      console.log(`  cause: ${check.cause}`);
    }
  }
  if (!audit.summary.releaseReady) {
    console.log("release gate: blocked");
    console.log("repair: rph setup repair --live");
  } else {
    console.log("release gate: ready");
  }
  printSetupRecoveryHints(checks);
  if (strict && failures.length > 0) {
    process.exitCode = 1;
  }
}

interface CliLiveAuditCheck {
  kind: "ai" | "mcp" | "env" | "runtime";
  id: string;
  status: "passed" | "failed" | "skipped";
  trust: string;
  provenStage: string;
  message: string;
  cause: string;
  missingEnv: string[];
  identity: unknown;
  firstActionProof: unknown;
  usableAction: {
    status: "passed" | "not-run";
    action: string | null;
    targetId: string | null;
    verifiedBy: string | null;
  };
  policy: unknown;
}

interface CliLiveAuditReport {
  schema: "rph-live-audit-v0";
  generatedAt: string;
  configuredOnly: boolean;
  strict: boolean;
  sourceReport: string;
  provenance: unknown;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    releaseReady: boolean;
  };
  failedTargets: string[];
  skippedTargets: string[];
  checks: CliLiveAuditCheck[];
  failures: string[];
}

function liveAuditFailures(checks: ConnectionCheck[], configuredOnly: boolean): string[] {
  const failures: string[] = [];
  for (const check of checks) {
    if (configuredOnly && check.status === "skipped" && check.missingEnv.length > 0) {
      continue;
    }
    const provenStage = check.readiness?.provenStage ?? "none";
    const requiredStage = requiredLiveAuditStage(check);
    if (check.status !== "passed") {
      failures.push(`${check.kind}:${check.id} status=${check.status} stage=${provenStage} message=${check.message}`);
      continue;
    }
    if (!liveAuditStageCovers(provenStage, requiredStage)) {
      failures.push(`${check.kind}:${check.id} stage=${provenStage}, required=${requiredStage}`);
    }
  }
  return failures;
}

function requiredLiveAuditStage(check: ConnectionCheck): string {
  if (check.kind === "ai") {
    return "protocol-tool-call";
  }
  if (check.kind === "mcp") {
    const definition = MCP_SERVER_DEFINITIONS[check.id];
    if (definition?.protocolReadiness === "tools/call") {
      return "protocol-tool-call";
    }
    if (definition?.protocolReadiness === "tools/list") {
      return "protocol-tools-list";
    }
    return "credential-probe";
  }
  return "credential-probe";
}

function liveAuditStageCovers(actual: string, required: string): boolean {
  const rank: Record<string, number> = {
    none: 0,
    transport: 1,
    "credential-probe": 2,
    "protocol-tools-list": 3,
    "protocol-tool-call": 4
  };
  return (rank[actual] ?? 0) >= (rank[required] ?? 0);
}

function buildCliLiveAuditReport(input: {
  configuredOnly: boolean;
  strict: boolean;
  sourceReport: string;
  provenance: unknown;
  checks: ConnectionCheck[];
  onboardingProof: Array<Record<string, unknown>>;
  failures: string[];
}): CliLiveAuditReport {
  const counts = { passed: 0, failed: 0, skipped: 0 };
  for (const check of input.checks) {
    counts[check.status] += 1;
  }
  const checks = input.checks.map((check) => {
    const proof = input.onboardingProof.find((item) => item.kind === check.kind && item.id === check.id);
    const failedStage = check.readiness?.stages.find((stage) => stage.status === "failed");
    return sanitizeCliAuditJson({
      kind: check.kind,
      id: check.id,
      status: check.status,
      trust: typeof proof?.trustCategory === "string" ? proof.trustCategory : check.readiness?.mode ?? "unverified",
      provenStage: check.readiness?.provenStage ?? "none",
      message: check.message,
      cause: check.missingEnv.length > 0
        ? `missing ${check.missingEnv.join(", ")}`
        : failedStage
          ? `${failedStage.stage} failed: ${failedStage.message}`
          : check.message,
      missingEnv: check.missingEnv,
      identity: check.identity ?? null,
      firstActionProof: check.firstActionProof ?? null,
      usableAction: usableActionProof(check),
      policy: check.policy ?? null
    }) as CliLiveAuditCheck;
  });
  return sanitizeCliAuditJson({
    schema: "rph-live-audit-v0",
    generatedAt: new Date().toISOString(),
    configuredOnly: input.configuredOnly,
    strict: input.strict,
    sourceReport: input.sourceReport,
    provenance: input.provenance,
    summary: {
      total: input.checks.length,
      passed: counts.passed,
      failed: counts.failed,
      skipped: counts.skipped,
      releaseReady: input.failures.length === 0
    },
    failedTargets: checks.filter((check) => check.status === "failed").map((check) => `${check.kind}:${check.id}`),
    skippedTargets: checks.filter((check) => check.status === "skipped").map((check) => `${check.kind}:${check.id}`),
    checks,
    failures: input.failures.map(redactCliAuditSecretText)
  }) as CliLiveAuditReport;
}

function writeCliLiveAuditArtifacts(
  projectRoot: string,
  audit: CliLiveAuditReport,
  requestedOutputPath: string | undefined
): { jsonPath: string; markdownPath: string } {
  const jsonPath = resolveCliLiveAuditJsonPath(projectRoot, requestedOutputPath);
  const markdownPath = jsonPath.endsWith(".json")
    ? `${jsonPath.slice(0, -5)}.md`
    : `${jsonPath}.md`;
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(audit, null, 2)}\n`);
  fs.writeFileSync(markdownPath, renderCliLiveAuditMarkdown(audit));
  return { jsonPath, markdownPath };
}

function resolveCliLiveAuditJsonPath(projectRoot: string, requestedOutputPath: string | undefined): string {
  if (!requestedOutputPath) {
    return path.join(projectRoot, ".rph", "live-audit", "latest.json");
  }
  const resolved = path.resolve(projectRoot, requestedOutputPath);
  if (resolved.endsWith(".json")) {
    return resolved;
  }
  return path.join(resolved, "latest.json");
}

function renderCliLiveAuditMarkdown(audit: CliLiveAuditReport): string {
  const lines = [
    "# RPH Live Credential Audit",
    "",
    `- generated_at: ${audit.generatedAt}`,
    "- status: audit complete",
    `- release_readiness: ${audit.summary.releaseReady ? "yes" : "no"}`,
    `- summary: passed=${audit.summary.passed} failed=${audit.summary.failed} skipped=${audit.summary.skipped} total=${audit.summary.total}`,
    "",
    "## Checks",
    ""
  ];
  for (const check of audit.checks) {
    lines.push(`- ${check.kind}:${check.id} status=${check.status} trust=${check.trust}:${check.provenStage}`);
    if (check.usableAction.status === "passed") {
      lines.push(`  - usable_action: ${check.usableAction.action} target=${check.usableAction.targetId} verified_by=${check.usableAction.verifiedBy}`);
    }
    if (check.cause) {
      lines.push(`  - cause: ${check.cause}`);
    }
    if (check.missingEnv.length > 0) {
      lines.push(`  - missing_env: ${check.missingEnv.join(", ")}`);
    }
  }
  if (audit.failures.length > 0) {
    lines.push("", "## Release Blockers", "");
    for (const failure of audit.failures) {
      lines.push(`- ${failure}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function usableActionProof(check: ConnectionCheck): CliLiveAuditCheck["usableAction"] {
  const proof = check.firstActionProof;
  if (check.status === "passed" && proof?.action && proof.verifiedBy === "protocol-tool-call") {
    return {
      status: "passed",
      action: proof.action,
      targetId: proof.targetId,
      verifiedBy: proof.verifiedBy
    };
  }
  return {
    status: "not-run",
    action: null,
    targetId: null,
    verifiedBy: null
  };
}

function sanitizeCliAuditJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeCliAuditJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeCliAuditJson(item)]));
  }
  if (typeof value === "string") {
    return redactCliAuditSecretText(value);
  }
  return value;
}

function redactCliAuditSecretText(value: string): string {
  return value
    .replace(/\b(?:sk|ghp|github_pat|xoxb|figd|ntn)_[A-Za-z0-9_-]{8,}\b/g, "[redacted]")
    .replace(/\bAIza[A-Za-z0-9_-]{8,}\b/g, "[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi, "Bearer [redacted]")
    .replace(/\b(api[_-]?key|token|secret|authorization)(=|:)\s*["']?[^,\s"}]+/gi, "$1$2<redacted>");
}

function liveTargetFromArgs(
  subcommand: string | undefined,
  args: string[],
  options: Record<string, string | boolean>
): { kind: "ai"; id: AiProviderId } | { kind: "mcp"; id: McpServerId } | null {
  const raw = optionString(options, "target")
    ?? (subcommand === "target" ? args[0] : subcommand)
    ?? args[0];
  if (!raw) {
    return null;
  }
  const [kind, id] = raw.split(":");
  if (kind === "ai") {
    return { kind, id: parseAiProviderId(id) };
  }
  if (kind === "mcp") {
    return { kind, id: parseMcpServerId(id) };
  }
  throw new Error(`invalid live target: ${raw}. use ai:<provider> or mcp:<server>`);
}

function handleProofs(
  projectRoot: string,
  subcommand: string | undefined,
  args: string[],
  options: Record<string, string | boolean>
): void {
  requireInitialized(projectRoot);
  switch (subcommand) {
    case undefined:
    case "status":
      printProofLedgerSummary(projectRoot, { limit: parseOptionalPositiveInt(optionString(options, "limit")) ?? 8 });
      return;
    case "events": {
      const limit = parseOptionalPositiveInt(optionString(options, "limit")) ?? parseOptionalPositiveInt(args[0]) ?? 20;
      const events = readProofLedgerEvents(projectRoot).slice(-limit).reverse();
      if (events.length === 0) {
        console.log("Proof ledger: empty");
        return;
      }
      console.log(`Proof ledger events latest=${events.length}`);
      for (const event of events) {
        console.log(`- ${formatProofLedgerEvent(event)}`);
      }
      return;
    }
    default:
      throw new Error(`unsupported proofs command: ${subcommand ?? "(empty)"}. available: status | events [--limit N]`);
  }
}

async function handleDoctor(
  projectRoot: string,
  subcommand: string | undefined,
  _args: string[],
  options: Record<string, string | boolean>
): Promise<void> {
  switch (subcommand) {
    case "install":
      printInstallDoctor(projectRoot);
      return;
    case "shell":
      printShellDoctor(projectRoot);
      return;
    case undefined:
    case "status":
      break;
    default:
      throw new Error(`unsupported doctor command: ${subcommand}. available: doctor [--live] | doctor install | doctor shell`);
  }
  requireInitialized(projectRoot);
  const config = syncHarnessConfigFromEnv(projectRoot);
  console.log(renderStatusLine("runtime config loaded", "configured"));
  printConfigSummary(config);
  if (!optionBool(options, "live")) {
    console.log("live 연결 검사는 /doctor --live 또는 /ai test, /mcp test로 실행");
    return;
  }
  const checks = [...await testAllAiConnections(config), ...await testAllMcpConnections(config)];
  const filePath = writeLiveConnectionReport(projectRoot, checks);
  printConnectionChecks(checks);
  printConnectionProofSteps(checks);
  printFirstValueActions(checks);
  printSetupRecoveryHints(checks);
  console.log(`report: ${filePath}`);
}

function handleUpdate(options: Record<string, string | boolean>): void {
  const sourceRoot = findCliSourceRoot();
  if (!sourceRoot) {
    throw new Error("cannot locate RPH source checkout with install.sh. Run the public installer again or set RPH_SOURCE_ROOT.");
  }
  const layout = installLayout();
  const installDirty = gitDirtyStatus(layout.installDir);
  const installScript = path.join(sourceRoot, "install.sh");
  const command = `bash ${quoteShellArg(installScript)}`;
  if (optionBool(options, "dry-run")) {
    console.log("RPH update plan");
    console.log(`- source: ${sourceRoot}`);
    console.log(`- command: ${command}`);
    if (installDirty) {
      console.log(`- install_dirty=${yesNo(installDirty.dirty)}${installDirty.dirty ? ` files=${installDirty.count}` : ""}`);
      console.log(`- safe_to_run=${installDirty.dirty ? "no" : "yes"}`);
      if (installDirty.dirty) {
        console.log("- next=commit, stash, or remove local install checkout changes before rph update");
      }
    }
    return;
  }
  console.log("RPH update");
  console.log(`- source: ${sourceRoot}`);
  console.log(`- command: ${command}`);
  const result = spawnSync("bash", [installScript], {
    cwd: sourceRoot,
    env: process.env,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error(`rph update failed with exit code ${result.status ?? "unknown"}`);
  }
}

function printInstallDoctor(projectRoot: string): void {
  const layout = installLayout();
  const wrapper = readTextIfExists(layout.wrapperPath);
  const wrapperTarget = wrapper ? extractWrapperTarget(wrapper) : null;
  const wrapperTargetExists = wrapperTarget ? fs.existsSync(wrapperTarget) : false;
  const wrapperTargetInInstallDir = wrapperTarget ? isPathInside(wrapperTarget, layout.installDir) : false;
  const initText = readTextIfExists(layout.initPath);
  const completionExists = fs.existsSync(layout.completionPath);
  const profile = detectShellProfile(layout);
  const profileText = profile.path ? readTextIfExists(profile.path) : null;
  const workspaceJson = runInstalledJsonProbe(layout.wrapperPath, ["workspace", "--json"], projectRoot);
  const statusJson = runInstalledJsonProbe(layout.wrapperPath, ["status", "--json"], projectRoot);
  const installHead = gitHead(layout.installDir);
  const installDirty = gitDirtyStatus(layout.installDir);
  const issues = [
    fs.existsSync(layout.wrapperPath) ? null : "installed wrapper is missing",
    wrapperTargetExists ? null : "installed wrapper target is missing",
    wrapperTarget ? (wrapperTargetInInstallDir ? null : "installed wrapper target is outside install dir") : null,
    fs.existsSync(layout.initPath) ? null : "shell init file is missing",
    initText?.includes("function /workspace()") ? null : "shell init is missing /workspace helper",
    completionExists ? null : "zsh completion file is missing",
    workspaceJson.ok ? null : "installed rph workspace --json is not current",
    statusJson.ok ? null : "installed rph status --json is not current",
    installDirty?.dirty ? "installed source checkout has local changes" : null
  ].filter((item): item is string => Boolean(item));

  console.log("RPH install doctor");
  console.log(`- install_dir: ${layout.installDir} git=${fs.existsSync(path.join(layout.installDir, ".git")) ? "yes" : "no"} head=${installHead ?? "unknown"}`);
  if (installDirty) {
    console.log(`- install_dirty=${yesNo(installDirty.dirty)}${installDirty.dirty ? ` files=${installDirty.count}` : ""}`);
  }
  console.log(`- wrapper: ${layout.wrapperPath} present=${yesNo(fs.existsSync(layout.wrapperPath))}`);
  console.log(`- wrapper_target: ${wrapperTarget ?? "unknown"} present=${yesNo(wrapperTargetExists)} current_install=${yesNo(wrapperTargetInInstallDir)}`);
  console.log(`- shell_init: ${layout.initPath} present=${yesNo(fs.existsSync(layout.initPath))} workspace_helper=${yesNo(Boolean(initText?.includes("function /workspace()")))}`);
  console.log(`- completion: ${layout.completionPath} present=${yesNo(completionExists)}`);
  console.log(`- profile_hook: ${profile.path ?? "unknown"} present=${yesNo(Boolean(profileText?.includes("# >>> rph init >>>")))}`);
  console.log(`- workspace-json=${workspaceJson.ok ? "ok" : `failed reason=${workspaceJson.reason}`}`);
  console.log(`- status-json=${statusJson.ok ? "ok" : `failed reason=${statusJson.reason}`}`);
  if (issues.length > 0) {
    console.log("Issues:");
    for (const issue of issues) {
      console.log(`- ${issue}`);
    }
    console.log(installDirty?.dirty
      ? "next=commit, stash, or remove local install checkout changes before rph update"
      : "next=rph update");
  } else {
    console.log("next=none");
  }
  if (!profileText?.includes("# >>> rph init >>>")) {
    console.log(`shell: source "${layout.initPath}"`);
  }
}

function printShellDoctor(projectRoot = process.cwd()): void {
  const layout = installLayout();
  const initText = readTextIfExists(layout.initPath);
  const profile = detectShellProfile(layout);
  const profileText = profile.path ? readTextIfExists(profile.path) : null;
  const pathHasBin = (process.env.PATH ?? "").split(path.delimiter).includes(layout.binDir);
  const resolvedRph = resolveCommandFromPath(layout.binName);
  const commandShadowed = Boolean(resolvedRph && path.resolve(resolvedRph) !== path.resolve(layout.wrapperPath));
  const zshProbe = runShellHelperJsonProbe(layout.initPath, "zsh", projectRoot);
  const bashProbe = runShellHelperJsonProbe(layout.initPath, "bash", projectRoot);
  const helpers = ["/setup", "/pm", "/status", "/workspace", "/agent"]
    .map((helper) => `${helper}=${yesNo(Boolean(initText?.includes(`function ${helper}()`)))}`)
    .join(" ");

  console.log("RPH shell doctor");
  console.log(`- shell: ${process.env.SHELL ?? "unknown"}`);
  console.log(`- bin_dir: ${layout.binDir} in_path=${yesNo(pathHasBin)}`);
  console.log(`- command: ${layout.binName} resolved=${resolvedRph ?? "missing"} expected=${layout.wrapperPath} shadowed=${yesNo(commandShadowed)}`);
  console.log(`- init: ${layout.initPath} present=${yesNo(Boolean(initText))}`);
  console.log(`- slash_helpers: ${helpers}`);
  console.log(`- profile_hook: ${profile.path ?? "unknown"} present=${yesNo(Boolean(profileText?.includes("# >>> rph init >>>")))}`);
  console.log(`- zsh-workspace-json=${zshProbe.ok ? "ok" : `failed reason=${zshProbe.reason}`}`);
  console.log(`- bash-workspace-json=${bashProbe.ok ? "ok" : `failed reason=${bashProbe.reason}`}`);
  if (!initText?.includes("function /workspace()")) {
    console.log(fs.existsSync(layout.initPath) ? `next=source "${layout.initPath}"` : "next=rph update");
  } else if (!pathHasBin || commandShadowed) {
    console.log(`next=source "${layout.initPath}"`);
  } else if (!profileText?.includes("# >>> rph init >>>")) {
    console.log("next=rph update");
  } else if (!zshProbe.ok && !bashProbe.ok) {
    console.log(`next=source "${layout.initPath}"`);
  } else {
    console.log("next=none");
  }
}

function resolveCommandFromPath(command: string): string | null {
  const pathValue = process.env.PATH ?? "";
  for (const dir of pathValue.split(path.delimiter)) {
    if (!dir) {
      continue;
    }
    const candidate = path.join(dir, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

function installLayout(env: NodeJS.ProcessEnv = process.env): {
  home: string;
  installDir: string;
  binDir: string;
  configDir: string;
  binName: string;
  wrapperPath: string;
  initPath: string;
  completionPath: string;
} {
  const home = env.HOME || os.homedir();
  const installDir = env.RPH_INSTALL_DIR || path.join(home, ".real-product-harness");
  const binDir = env.RPH_BIN_DIR || path.join(home, ".local", "bin");
  const configDir = env.RPH_CONFIG_DIR || path.join(home, ".config", "rph");
  const binName = env.RPH_BIN_NAME || "rph";
  return {
    home,
    installDir,
    binDir,
    configDir,
    binName,
    wrapperPath: path.join(binDir, binName),
    initPath: path.join(configDir, "init.sh"),
    completionPath: path.join(configDir, "completion.zsh")
  };
}

function detectShellProfile(layout: ReturnType<typeof installLayout>): { path: string | null } {
  const explicit = process.env.RPH_SHELL_PROFILE;
  if (explicit) {
    return { path: explicit };
  }
  const shell = process.env.SHELL ?? "";
  if (shell.endsWith("zsh")) {
    return { path: path.join(layout.home, ".zshrc") };
  }
  if (shell.endsWith("bash")) {
    return { path: path.join(layout.home, ".bashrc") };
  }
  const zsh = path.join(layout.home, ".zshrc");
  if (fs.existsSync(zsh)) {
    return { path: zsh };
  }
  const bash = path.join(layout.home, ".bashrc");
  if (fs.existsSync(bash)) {
    return { path: bash };
  }
  return { path: zsh };
}

function readTextIfExists(filePath: string): string | null {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
  } catch {
    return null;
  }
}

function extractWrapperTarget(wrapperText: string): string | null {
  const match = wrapperText.match(/exec\s+node\s+"([^"]+)"/);
  return match?.[1] ?? null;
}

function runInstalledJsonProbe(wrapperPath: string, args: string[], cwd: string): { ok: boolean; reason: string } {
  if (!fs.existsSync(wrapperPath)) {
    return { ok: false, reason: "wrapper-missing" };
  }
  const result = spawnSync(wrapperPath, args, {
    cwd,
    env: process.env,
    encoding: "utf8",
    timeout: 15_000,
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) {
    return { ok: false, reason: `exit-${result.status ?? "unknown"}` };
  }
  try {
    const parsed = JSON.parse(result.stdout) as { schemaVersion?: unknown };
    return parsed.schemaVersion === "rph-operator-workspace-v0"
      ? { ok: true, reason: "ok" }
      : { ok: false, reason: "schema-mismatch" };
  } catch {
    return { ok: false, reason: "not-json" };
  }
}

function runShellHelperJsonProbe(initPath: string, shellName: "zsh" | "bash", cwd: string): { ok: boolean; reason: string } {
  if (!fs.existsSync(initPath)) {
    return { ok: false, reason: "init-missing" };
  }
  if (!runStatus(shellName, ["--version"], cwd)) {
    return { ok: false, reason: `${shellName}-missing` };
  }
  const result = spawnSync(shellName, ["-lc", `source ${quoteShellArg(initPath)}; /workspace --json`], {
    cwd,
    env: process.env,
    encoding: "utf8",
    timeout: 15_000,
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) {
    return { ok: false, reason: `exit-${result.status ?? "unknown"}` };
  }
  try {
    const parsed = JSON.parse(result.stdout) as { schemaVersion?: unknown };
    return parsed.schemaVersion === "rph-operator-workspace-v0"
      ? { ok: true, reason: "ok" }
      : { ok: false, reason: "schema-mismatch" };
  } catch {
    return { ok: false, reason: "not-json" };
  }
}

function gitHead(cwd: string): string | null {
  if (!fs.existsSync(path.join(cwd, ".git"))) {
    return null;
  }
  const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function gitDirtyStatus(cwd: string): { dirty: boolean; count: number } | null {
  if (!fs.existsSync(path.join(cwd, ".git"))) {
    return null;
  }
  const result = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (result.status !== 0) {
    return null;
  }
  const entries = result.stdout.split(/\r?\n/).filter(Boolean);
  return {
    dirty: entries.length > 0,
    count: entries.length
  };
}

function findCliSourceRoot(): string | null {
  const starts = [
    process.env.RPH_SOURCE_ROOT,
    process.cwd(),
    typeof __dirname === "string" ? __dirname : undefined,
    process.argv[1] ? path.dirname(process.argv[1]) : undefined
  ].filter((item): item is string => Boolean(item));
  for (const start of starts) {
    const found = findAncestorWithInstallScript(path.resolve(start));
    if (found) {
      return found;
    }
  }
  return null;
}

function findAncestorWithInstallScript(start: string): string | null {
  let current = start;
  for (let depth = 0; depth < 10; depth += 1) {
    const installScript = path.join(current, "install.sh");
    const packagePath = path.join(current, "package.json");
    if (fs.existsSync(installScript) && fs.existsSync(packagePath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { name?: string };
        if (pkg.name === "real-product-harness") {
          return current;
        }
      } catch {
        return null;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
  return null;
}

function isPathInside(candidate: string, parent: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function yesNo(value: boolean): "yes" | "no" {
  return value ? "yes" : "no";
}

function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
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

function printAiStatus(config: ReturnType<typeof loadHarnessConfig>, projectRoot?: string): void {
  console.log("AI Providers");
  for (const provider of Object.values(config.aiProviders)) {
    const status = provider.configured ? "configured" : "missing";
    const enabled = provider.enabled ? "enabled" : "disabled";
    const missing = provider.missingEnv.length > 0 ? ` missing=${provider.missingEnv.join(",")}` : "";
    console.log(`- ${renderStatusLine(provider.id, status)} ${enabled} model=${provider.model}${missing}`);
  }
  if (projectRoot) {
    printLatestAiProviderOutcome(projectRoot);
  }
}

function printLatestAiProviderOutcome(projectRoot: string): void {
  const outcome = readLatestAiProviderOutcome(projectRoot);
  if (!outcome) {
    return;
  }
  const fallback = formatAiProviderFallback(outcome);
  console.log("Latest AI provider outcome");
  console.log(`- source=${outcome.source} id=${outcome.id} provider=${outcome.providerId} at=${outcome.at}`);
  if (outcome.providerAttempts && outcome.providerAttempts.length > 0) {
    const attempts = outcome.providerAttempts
      .map((attempt) => `${attempt.providerId}:${attempt.status}`)
      .join(" -> ");
    console.log(`- attempts=${attempts}`);
  }
  if (fallback) {
    console.log(`- ${fallback}`);
  }
}

function printHarnessReadiness(
  projectRoot: string,
  config: ReturnType<typeof loadHarnessConfig>,
  state: ProjectState,
  options: { commandSurface?: "rph" | "slash" } = {}
): void {
  const checks = readTrustedConnectionChecks(projectRoot);
  const proofTrust = readConnectionReportTrust(projectRoot);
  const lastReport = readConnectionReport(projectRoot);
  const passedAi = checks.filter((check) => check.kind === "ai" && check.status === "passed");
  const passedMcp = checks.filter((check) => check.kind === "mcp" && check.status === "passed");
  const failed = checks.filter((check) => check.status === "failed");
  const chatConfigured = configuredAiProviders(config).length > 0 && config.activeAiProvider !== "none";
  const status = state.paused
    ? "blocked"
    : !chatConfigured
      ? "needs-setup"
      : failed.length > 0
        ? "degraded"
        : passedAi.length > 0
          ? "ready"
          : "configured";
  const chat = passedAi.length > 0 ? "verified" : chatConfigured ? "configured" : "missing";
  const tools = passedMcp.length > 0
    ? `verified:${passedMcp.map((check) => check.id).join(",")}`
    : configuredMcpServers(config).length > 0
      ? "configured"
      : "none";
  console.log("Harness readiness");
  console.log(`- status=${status} chat=${chat} tools=${tools}`);
  console.log(`- live_verification=${proofTrust.trusted ? "current" : "not-current"}`);
  if (!proofTrust.trusted && proofTrust.reason && proofTrust.reason !== "missing-report") {
    console.log(`- why=${connectionProofTrustMessage(proofTrust.reason)}`);
  }
  console.log(`- next=${harnessReadinessNextCommand(status, chatConfigured, checks, options.commandSurface ?? "rph")}`);
  if (!proofTrust.trusted && proofTrust.reason && proofTrust.reason !== "missing-report") {
    const age = proofTrust.ageMs === undefined ? "" : ` ageMs=${proofTrust.ageMs}`;
    console.log(`- connection_proof=not-current reason=${connectionProofTrustLabel(proofTrust.reason)}${age}`);
  }
  if (failed.length > 0) {
    console.log(`- degraded_checks=${failed.map((check) => `${check.kind}:${check.id}`).join(",")}`);
  }
  const lastKnown = !proofTrust.trusted
    ? (lastReport?.checks ?? []).filter((check) => check.status === "passed")
    : [];
  if (lastKnown.length > 0) {
    console.log("Last known verification (not current)");
    for (const check of lastKnown) {
      console.log(`- ${check.kind}:${check.id} verified_by=${check.readiness?.provenStage ?? check.identity?.verifiedBy ?? check.firstActionProof?.verifiedBy ?? "unknown"}`);
    }
  }
}

function harnessReadinessNextCommand(
  status: string,
  chatConfigured: boolean,
  checks: ConnectionCheck[],
  surface: "rph" | "slash"
): string {
  const command = (value: string) => surface === "rph" ? `rph ${value.replace(/^\//, "")}` : value;
  if (status === "blocked") {
    return `${command("/resume")} 또는 ${command("/agent status")}`;
  }
  if (!chatConfigured) {
    return command("/setup auto");
  }
  if (!checks.some((check) => check.kind === "ai" && check.status === "passed")) {
    return command("/doctor --live");
  }
  if (checks.some((check) => check.status === "failed")) {
    return command("/doctor --live");
  }
  return surface === "rph"
    ? "rph \"다음에 뭐 하면 돼?\" 또는 rph agent run --steps 1"
    : "일반 텍스트로 AI agent와 대화, 또는 /agent run --steps 1";
}

function connectionProofTrustMessage(reason: NonNullable<ReturnType<typeof readConnectionReportTrust>["reason"]>): string {
  switch (reason) {
    case "non-live-source":
      return "Saved connection evidence came from a non-live run, so it is kept as history only.";
    case "missing-fingerprint":
      return "Saved connection evidence is missing the current config fingerprint.";
    case "config-mismatch":
      return "Saved connection evidence was produced for a different AI/MCP config.";
    case "stale-report":
      return "Saved connection evidence is older than the current trust window.";
    case "invalid-date":
      return "Saved connection evidence has an invalid timestamp.";
    case "missing-report":
      return "No live connection evidence has been saved yet.";
  }
}

function connectionProofTrustLabel(reason: NonNullable<ReturnType<typeof readConnectionReportTrust>["reason"]>): string {
  return reason.replace(/-/g, " ");
}

function printLatestAgentToolProof(projectRoot: string): void {
  const session = loadRuntimeSession(projectRoot);
  const toolCalls = [...(session?.toolTrace ?? []), ...(session?.activeTurn?.toolCalls ?? [])];
  const latest = [...toolCalls].reverse().find((call) => call.status === "succeeded" && isExternalAgentReadTool(call.name));
  if (!latest) {
    return;
  }
  console.log("Latest agent tool proof");
  console.log(`- ${latest.name} at=${latest.completedAt ?? latest.requestedAt} ${formatAgentToolProof(latest)}`);
}

function printProofLedgerSummary(
  projectRoot: string,
  options: { compact?: boolean; limit?: number } = {}
): void {
  const latest = readProofLedgerLatest(projectRoot);
  if (!latest) {
    if (!options.compact) {
      console.log("Proof ledger: empty");
    }
    return;
  }
  const limit = options.limit ?? (options.compact ? 4 : 8);
  const events = Object.values(latest.latestBySubject)
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, limit);
  console.log("Proof ledger");
  console.log(`- events=${latest.eventCount} passed=${latest.counts.passed} failed=${latest.counts.failed} blocked=${latest.counts.blocked} merged=${latest.counts.merged}`);
  for (const event of events) {
    console.log(`- ${formatProofLedgerEvent(event)}`);
  }
  if (latest.latestFailures.length > 0) {
    console.log(`- attention=${latest.latestFailures.map((event) => event.subject).join(",")}`);
  }
}

function printAgentIntegrationEvidence(state: ProjectState): void {
  const evidence = state.evidence?.agentIntegration;
  if (!evidence?.required) {
    return;
  }
  console.log("Agent integration evidence");
  console.log(`- status=${evidence.status} merged=${evidence.mergedRunIds.length}/${evidence.runIds.length} failed=${evidence.failedRunIds.length}`);
  console.log(`- summary=${evidence.summary}`);
  if (evidence.latestProofId) {
    console.log(`- proof=${evidence.latestProofId}`);
  }
}

function formatProofLedgerEvent(event: ProofLedgerEvent): string {
  const trust = event.trust ? ` trust=${event.trust}` : "";
  const target = event.targetId ? ` target=${event.targetId}` : "";
  return `${event.kind} ${event.subject} status=${event.status}${trust}${target} at=${event.at} ${summarizeValue(event.summary, 120)}`;
}

function isExternalAgentReadTool(name: string): boolean {
  return name === "mcp.tools.list"
    || name === "mcp.tools.call"
    || name === "github.repo.read"
    || name === "notion.page.read"
    || name === "figma.file.summary"
    || name === "stitch.tools.list"
    || name === "stitch.tools.call";
}

function formatAgentToolProof(call: AgentToolCall): string {
  const parsed = parseObservation(call.observation);
  if (parsed && call.name.endsWith(".tools.call")) {
    const toolName = stringField(parsed.toolName) || "unknown-tool";
    const content = summarizeMcpContent(parsed.content);
    return `tool=${toolName} result=${content || summarizeValue(parsed.structuredContent ?? parsed.result ?? parsed)}`;
  }
  if (parsed && call.name.endsWith(".tools.list")) {
    const tools = Array.isArray(parsed.tools) ? parsed.tools.length : 0;
    const server = stringField(parsed.server) || "mcp";
    return `server=${server} tools=${tools}`;
  }
  if (parsed && call.name === "github.repo.read") {
    return `repo=${stringField(parsed.fullName) || "unknown"} visibility=${stringField(parsed.visibility) || "unknown"}`;
  }
  if (parsed && call.name === "notion.page.read") {
    const properties = Array.isArray(parsed.properties) ? parsed.properties.length : 0;
    return `page=${stringField(parsed.id) || "unknown"} archived=${String(parsed.archived ?? "unknown")} properties=${properties}`;
  }
  if (parsed && call.name === "figma.file.summary") {
    return `file=${stringField(parsed.name) || "unknown"} version=${stringField(parsed.version) || "unknown"}`;
  }
  return `result=${summarizeValue(call.observation ?? "no observation")}`;
}

function parseObservation(value: string | undefined): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function summarizeMcpContent(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }
  const text = value
    .map((item) => item && typeof item === "object" ? stringField((item as Record<string, unknown>).text) : "")
    .filter(Boolean)
    .join(" ");
  return summarizeValue(text);
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function summarizeValue(value: unknown, max = 160): string {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  const compact = text.replace(/\s+/g, " ").trim();
  const redacted = compact.replace(/(Bearer|token|api[_-]?key|secret)[^,\s}]*/gi, "$1=<redacted>");
  return redacted.length > max ? `${redacted.slice(0, max - 3)}...` : redacted;
}

function redactTargetUrl(value: string): string {
  try {
    const url = new URL(value);
    for (const key of url.searchParams.keys()) {
      url.searchParams.set(key, "<redacted>");
    }
    return url.toString();
  } catch {
    return value;
  }
}

function printMcpStatus(config: ReturnType<typeof loadHarnessConfig>): void {
  console.log("MCP / Adapter Connectors");
  for (const server of Object.values(config.mcpServers)) {
    const policy = summarizeMcpPolicyForServer(config, server.id);
    const status = server.configured ? "configured" : "missing";
    const enabled = server.enabled ? "enabled" : "disabled";
    const missing = server.missingEnv.length > 0 ? ` missing=${server.missingEnv.join(",")}` : "";
    const target = server.url ? redactTargetUrl(server.url) : server.command ?? "-";
    const protocol = server.kind === "mcp-server" ? "protocol-mcp" : "rest-adapter";
    const auth = server.kind === "mcp-server" ? ` authMode=${server.authMode ?? "none"}${server.authEnvKey ? ` authEnv=${server.authEnvKey}` : ""}` : "";
    const readOnlyTools = Array.isArray(policy.agentReadOnlyTools) ? (policy.agentReadOnlyTools as string[]) : [];
    console.log(`- ${renderStatusLine(server.id, status)} ${enabled} ${protocol} ${server.transport} ${target}${auth}${missing}`);
    console.log(`  policy=${String(policy.kind)} state=${String(policy.state)} requiredTrust=${String(policy.requiredTrust)} readOnlyTools=${readOnlyTools.join(",") || "none"} fingerprint=${String(policy.configFingerprint)}`);
    console.log(`  next=${mcpStatusNextAction(server, policy)}`);
  }
  console.log("MCP policy");
  console.log("- allowed: rph mcp tools <server>, rph mcp call <server> <tool> --read-only --args-json '{}'");
  console.log("- agent: use rph mcp tools <server> --agent to see the filtered agent allowlist; agent calls remain policy-limited");
  console.log("- blocked: mutable or unclassified MCP tool calls from AI agent proposals");
  console.log("- note: multiple configured protocol MCP servers require explicit server selection");
}

function mcpStatusNextAction(
  server: ReturnType<typeof loadHarnessConfig>["mcpServers"][string],
  policy: Record<string, unknown>
): string {
  if (!server.enabled) {
    return `rph mcp enable ${server.id}`;
  }
  if (!server.configured || server.missingEnv.length > 0) {
    return `rph setup auto --live --ai none --mcp ${server.id}`;
  }
  if (server.kind !== "mcp-server") {
    return `rph mcp test ${server.id}`;
  }
  const readOnlyTools = Array.isArray(policy.agentReadOnlyTools) ? policy.agentReadOnlyTools : [];
  if (policy.allowToolsList !== true) {
    return `rph setup auto --live --ai none --mcp ${server.id}`;
  }
  if (readOnlyTools.length === 0) {
    return `rph mcp tools ${server.id} --discover (then allow read-only calls with rph setup mcp add ... --allow-tool <tool>)`;
  }
  return `rph mcp tools ${server.id} 또는 rph mcp call ${server.id} <tool> --read-only --args-json '{}'`;
}

function printConnectionChecks(checks: ConnectionCheck[]): void {
  for (const check of checks) {
    const missing = check.missingEnv.length > 0 ? ` missing=${check.missingEnv.join(",")}` : "";
    const endpoint = check.endpoint ? ` endpoint=${sanitizeConnectionDiagnosticText(check.endpoint)}` : "";
    const trust = connectionTrustLabel(check);
    const policy = check.policy ? ` policy=${check.policy.kind}:${check.policy.state}${check.policy.satisfied ? ":satisfied" : ":unsatisfied"}` : "";
    console.log(`- ${renderStatusLine(`${check.kind}:${check.id}`, check.status)} trust=${trust} ${sanitizeConnectionDiagnosticText(check.message)}${missing}${endpoint}${policy}`);
  }
  printConnectionVerifiedTargets(checks);
  printConnectionFirstActionProofs(checks);
}

function printConnectionVerifiedTargets(checks: ConnectionCheck[]): void {
  const entries = checks
    .filter((check) => check.status === "passed" && check.identity)
    .map((check) => `- ${check.kind}:${check.id} ${formatConnectionIdentity(check.identity!)}`);
  if (entries.length === 0) {
    return;
  }
  console.log("");
  console.log("Verified targets");
  entries.forEach((entry) => console.log(entry));
}

function printLatestVerifiedTargets(projectRoot: string): void {
  const checks = readTrustedConnectionChecks(projectRoot);
  if (checks.length === 0) {
    return;
  }
  printConnectionVerifiedTargets(checks);
  printConnectionFirstActionProofs(checks);
}

function readLatestConnectionChecks(projectRoot: string): ConnectionCheck[] {
  const filePath = connectionReportFile(projectRoot);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const report = JSON.parse(fs.readFileSync(filePath, "utf8")) as { checks?: unknown };
    return Array.isArray(report.checks)
      ? report.checks.filter(isConnectionCheckLike)
      : [];
  } catch {
    return [];
  }
}

function isConnectionCheckLike(value: unknown): value is ConnectionCheck {
  return value !== null
    && typeof value === "object"
    && typeof (value as { id?: unknown }).id === "string"
    && typeof (value as { kind?: unknown }).kind === "string"
    && typeof (value as { status?: unknown }).status === "string"
    && typeof (value as { message?: unknown }).message === "string"
    && Array.isArray((value as { requiredEnv?: unknown }).requiredEnv)
    && Array.isArray((value as { missingEnv?: unknown }).missingEnv)
    && typeof (value as { checkedAt?: unknown }).checkedAt === "string";
}

function formatConnectionIdentity(identity: NonNullable<ConnectionCheck["identity"]>): string {
  return `${identity.label} type=${identity.type} target_id=${identity.targetId} verified_by=${identity.verifiedBy}`;
}

function printConnectionFirstActionProofs(checks: ConnectionCheck[]): void {
  const entries = checks
    .filter((check) => check.status === "passed" && check.firstActionProof)
    .map((check) => `- ${check.kind}:${check.id} ${formatFirstActionProof(check.firstActionProof!)}`);
  if (entries.length === 0) {
    return;
  }
  console.log("");
  console.log("First action verified");
  entries.forEach((entry) => console.log(entry));
}

function formatFirstActionProof(proof: NonNullable<ConnectionCheck["firstActionProof"]>): string {
  const endpoint = proof.endpoint ? ` endpoint=${proof.endpoint}` : "";
  return `${proof.label} | detail=${proof.action} target_id=${proof.targetId} verified_by=${proof.verifiedBy}${endpoint}`;
}

function printConnectionProofSteps(checks: ConnectionCheck[]): void {
  const entries = checks
    .filter((check) => check.readiness?.stages.length)
    .map((check) => {
      const trust = humanConnectionTrust(check);
      const stages = check.readiness?.stages
        .map((stage) => `${stage.stage}=${stage.status}${stage.status === "failed" ? ` (${sanitizeConnectionDiagnosticText(stage.message)})` : ""}`)
        .join(" -> ");
      return `- ${check.kind}:${check.id} ${trust}: ${stages}`;
    });
  if (entries.length === 0) {
    return;
  }
  console.log("");
  console.log("Proof steps");
  entries.forEach((entry) => console.log(entry));
}

function humanConnectionTrust(check: ConnectionCheck): string {
  switch (check.readiness?.mode) {
    case "protocol-ready":
      return "verified through protocol action";
    case "protocol-partial":
      return "credential verified; protocol action failed";
    case "adapter-write-ready":
      return "credential, target, and external write channel verified";
    case "adapter-partial":
      return "credential verified; external write channel failed";
    case "adapter-ready":
      return "credential and target verified";
    default:
      return "not verified";
  }
}

function printFirstValueActions(checks: ConnectionCheck[]): void {
  const actions = checks
    .filter((check) => check.status === "passed")
    .map(firstValueActionForCheck)
    .filter((action): action is string => Boolean(action));
  if (actions.length === 0) {
    return;
  }
  console.log("");
  console.log("Ready actions");
  actions.forEach((action) => console.log(`- ${action}`));
  if (checks.some((check) => check.kind === "ai" && check.status === "passed")) {
    console.log("- workflow: /pm start 또는 제품 아이디어를 그냥 입력");
  } else {
    console.log("- workflow: AI provider를 연결하면 제품 아이디어를 일반 텍스트로 바로 입력할 수 있음");
  }
}

function firstValueActionForCheck(check: ConnectionCheck): string | null {
  if (check.kind === "ai") {
    return `ai:${check.id} chat: /ai run --provider ${check.id} --prompt "제품 요구사항 5개 정리해줘"`;
  }
  switch (check.id) {
    case "notion":
      return "mcp:notion first write/readback: /notion setup --live";
    case "github":
      return "mcp:github first repo action: /github setup-labels";
    case "figma":
      return "mcp:figma first read: 연결된 agent가 figma.file.summary 도구로 파일을 요약할 수 있음";
    case "stitch":
      return "mcp:stitch first MCP proof: 연결된 agent가 mcp.tools.list 또는 readOnly mcp.tools.call 사용 가능";
    default:
      return `mcp:${check.id} first MCP proof: 연결된 agent가 mcp.tools.list 또는 readOnly mcp.tools.call 사용 가능`;
  }
}

function connectionTrustLabel(check: ConnectionCheck): string {
  const mode = check.readiness?.mode ?? "unverified";
  const stage = check.readiness?.provenStage ?? "none";
  return `${mode}:${stage}`;
}

function printSetupAskExamples(
  aiChecks: ConnectionCheck[],
  mcpChecks: ConnectionCheck[]
): void {
  const examples: string[] = [];
  if (aiChecks.length > 0) {
    examples.push("제품 아이디어를 검증 가능한 MVP 계획으로 바꿔줘");
    examples.push("지금 대화로 요구사항 초안을 잡아줘");
  }
  for (const check of mcpChecks) {
    examples.push(setupAskExampleForMcp(check.id));
  }
  if (examples.length === 0) {
    return;
  }
  console.log("");
  console.log(aiChecks.length > 0 ? "You can now ask me to" : "After AI provider connection, you can ask me to");
  for (const example of [...new Set(examples)].slice(0, 5)) {
    console.log(`- ${example}`);
  }
}

function setupAskExampleForMcp(id: string): string {
  switch (id) {
    case "notion":
      return "Notion 페이지를 읽고 제품 요구사항 초안으로 정리해줘";
    case "github":
      return "GitHub repo 상태를 읽고 첫 이슈와 라벨 계획을 제안해줘";
    case "figma":
      return "Figma 파일을 요약하고 구현할 화면 목록을 뽑아줘";
    case "stitch":
      return "Stitch MCP 도구 목록을 확인하고 안전한 읽기 작업을 실행해줘";
    default:
      return `${id} MCP 도구로 읽을 수 있는 정보를 확인해줘`;
  }
}

type SetupRecoveryClassification =
  | "missing-env"
  | "ai-invalid-credentials"
  | "ai-quota-or-rate-limit"
  | "ai-generation-failed"
  | "mcp-invalid-credentials"
  | "mcp-quota-or-rate-limit"
  | "mcp-protocol-failed"
  | "external-write-failed"
  | "connection-failed";

interface SetupRecoveryDiagnostic {
  classification: SetupRecoveryClassification;
  cause: string;
  env: string;
  next: string;
  degraded: string;
  recheck: string;
  retry: string;
}

function printSetupRecoveryHints(checks: ConnectionCheck[], commandSurface: CommandSurface = "rph"): void {
  for (const line of renderSetupRecoveryDiagnostics(checks, commandSurface)) {
    console.log(line);
  }
}

function renderSetupRecoveryDiagnostics(checks: ConnectionCheck[], commandSurface: CommandSurface = "rph"): string[] {
  const failing = checks.filter((check) => check.status !== "passed");
  if (failing.length === 0) {
    if (checks.some((check) => check.kind === "ai" && check.status === "passed")) {
      return [`next: 일반 텍스트로 AI agent와 대화하거나 ${runtimeSurfaceCommand(commandSurface, "pm start")}`];
    } else {
      return [`next: ${runtimeSurfaceCommand(commandSurface, "setup auto --ai openai --live")} 또는 ${runtimeSurfaceCommand(commandSurface, "pm start")}`];
    }
  }
  const lines = [
    "",
    "Recovery hints",
    `repair: ${runtimeSurfaceCommand(commandSurface, "setup repair --live")}`
  ];
  for (const check of failing) {
    const diagnostic = setupRecoveryDiagnostic(check, commandSurface);
    lines.push(`- ${check.kind}:${check.id}`);
    lines.push(`  classification: ${diagnostic.classification}`);
    lines.push(`  cause: ${diagnostic.cause}`);
    lines.push(`  env: ${diagnostic.env}`);
    lines.push(`  next: ${diagnostic.next}`);
    lines.push(`  degraded: ${diagnostic.degraded}`);
    lines.push(`  recheck: ${diagnostic.recheck}`);
    lines.push(`  retry: ${diagnostic.retry}`);
  }
  return lines;
}

function setupRecoveryDiagnostic(check: ConnectionCheck, commandSurface: CommandSurface): SetupRecoveryDiagnostic {
  const classification = setupFailureClassification(check);
  return {
    classification,
    cause: setupFailureCause(check),
    env: setupEnvGuidance(check, classification),
    next: setupNextAction(check, commandSurface),
    degraded: setupDegradedOption(check, commandSurface),
    recheck: setupTargetRecheckCommand(check, commandSurface),
    retry: setupRetryCommand(check, commandSurface)
  };
}

function setupFailureCause(check: ConnectionCheck): string {
  if (check.missingEnv.length > 0) {
    return `missing ${check.missingEnv.join(", ")}`;
  }
  const failedStage = failedReadinessStage(check);
  if (failedStage) {
    return sanitizeConnectionDiagnosticText(`${failedStage.stage} failed: ${failedStage.message}`);
  }
  return sanitizeConnectionDiagnosticText(check.message);
}

function setupFailureClassification(check: ConnectionCheck): SetupRecoveryClassification {
  if (check.missingEnv.length > 0) {
    return "missing-env";
  }
  const statusCode = failedStatusCode(check);
  if (statusCode === 401 || statusCode === 403) {
    return check.kind === "ai" ? "ai-invalid-credentials" : "mcp-invalid-credentials";
  }
  if (statusCode === 429) {
    return check.kind === "ai" ? "ai-quota-or-rate-limit" : "mcp-quota-or-rate-limit";
  }
  const failedStage = failedReadinessStage(check);
  if (failedStage?.stage === "external-write") {
    return "external-write-failed";
  }
  if (check.kind === "ai" && failedStage?.stage === "protocol-tool-call") {
    return "ai-generation-failed";
  }
  if (check.kind === "mcp" && (failedStage?.stage === "protocol-tools-list" || failedStage?.stage === "protocol-tool-call")) {
    return "mcp-protocol-failed";
  }
  return "connection-failed";
}

function setupEnvGuidance(check: ConnectionCheck, classification: SetupRecoveryClassification): string {
  if (check.missingEnv.length > 0) {
    return `set ${check.missingEnv.join(", ")} in .env or the current shell env`;
  }
  if (classification === "ai-invalid-credentials" || classification === "mcp-invalid-credentials") {
    const envKeys = credentialEnvKeys(check);
    if (envKeys.length > 0) {
      return `replace ${envKeys.join(", ")} in .env or the current shell env`;
    }
    return "replace the credential env var for this target; do not paste the old value into logs";
  }
  if (classification === "ai-quota-or-rate-limit" || classification === "mcp-quota-or-rate-limit") {
    return "no secret replacement suggested for 429; check quota, billing, or provider rate limits";
  }
  const envKeys = credentialEnvKeys(check);
  if (envKeys.length > 0) {
    return `verify ${envKeys.join(", ")} without printing its value`;
  }
  return "no secret value needed in logs; keep credential values redacted";
}

function setupNextAction(check: ConnectionCheck, commandSurface: CommandSurface = "rph"): string {
  const classification = setupFailureClassification(check);
  if (check.missingEnv.length > 0) {
    return `.env에 ${check.missingEnv.join(", ")} 추가 또는 ${runtimeSurfaceCommand(commandSurface, "setup auto")}로 다시 입력`;
  }
  if (classification === "ai-invalid-credentials" || classification === "mcp-invalid-credentials") {
    return "credential 값이 거부되었습니다. env 값을 교체한 뒤 exact target recheck를 실행";
  }
  if (classification === "ai-quota-or-rate-limit" || classification === "mcp-quota-or-rate-limit") {
    return "quota/rate limit 또는 billing/model 권한을 해결한 뒤 exact target recheck를 실행";
  }
  const failedStage = failedReadinessStage(check);
  if (failedStage?.stage === "credential-probe") {
    return "credential 값과 base URL을 확인한 뒤 다시 live check";
  }
  if (failedStage?.stage === "external-write") {
    return "gh CLI 설치/auth/저장소 write 권한을 확인한 뒤 다시 live check";
  }
  if (failedStage?.stage === "protocol-tool-call") {
    return "quota/model 권한 또는 provider generation endpoint 상태 확인";
  }
  if (failedStage?.stage === "protocol-tools-list") {
    return "MCP 서버 URL, token, protocol handshake 설정 확인";
  }
  return "연결 값 수정 후 live check 재실행";
}

function setupDegradedOption(check: ConnectionCheck, commandSurface: CommandSurface = "rph"): string {
  if (check.kind === "ai") {
    return `${runtimeSurfaceCommand(commandSurface, "setup auto --live --ai none")} (skip AI for now; plain text chat stays disabled)`;
  }
  if (check.kind === "mcp") {
    return `${runtimeSurfaceCommand(commandSurface, "setup auto --live --mcp none")} (skip this connector for now; AI/local workflows can continue)`;
  }
  return runtimeSurfaceCommand(commandSurface, "setup auto --live --allow-missing");
}

function setupTargetRecheckCommand(check: ConnectionCheck, commandSurface: CommandSurface = "rph"): string {
  if (check.kind === "ai" || check.kind === "mcp") {
    return runtimeSurfaceCommand(commandSurface, `live ${check.kind}:${check.id}`);
  }
  return runtimeSurfaceCommand(commandSurface, "setup check --live");
}

function setupRetryCommand(check: ConnectionCheck, commandSurface: CommandSurface = "rph"): string {
  if (check.kind === "ai") {
    return `${runtimeSurfaceCommand(commandSurface, `setup auto --live --ai ${check.id} --mcp none`)}`;
  }
  if (check.kind === "mcp") {
    return `${runtimeSurfaceCommand(commandSurface, `setup auto --live --ai none --mcp ${check.id}`)}`;
  }
  return runtimeSurfaceCommand(commandSurface, "setup auto --live");
}

function failedReadinessStage(check: ConnectionCheck): NonNullable<ConnectionCheck["readiness"]>["stages"][number] | undefined {
  return check.readiness?.stages.find((stage) => stage.status === "failed");
}

function failedStatusCode(check: ConnectionCheck): number | null {
  const texts = [
    failedReadinessStage(check)?.message,
    check.message
  ].filter((text): text is string => Boolean(text));
  for (const text of texts) {
    const match = text.match(/\((\d{3})\)|\bstatus[= ](\d{3})\b/i);
    const value = match?.[1] ?? match?.[2];
    if (value) {
      return Number(value);
    }
  }
  return null;
}

function credentialEnvKeys(check: ConnectionCheck): string[] {
  const keys = check.requiredEnv.length > 0 ? check.requiredEnv : check.missingEnv;
  const credentialKeys = keys.filter((key) => /(API_KEY|TOKEN|SECRET|AUTH|KEY)$/i.test(key));
  return credentialKeys.length > 0 ? credentialKeys : keys;
}

function sanitizeConnectionDiagnosticText(text: string): string {
  return text
    .replace(/(Bearer\s+)[^\s;,)]+/gi, "$1<redacted>")
    .replace(/([?&](?:key|token|api_key|access_token)=)[^&\s]+/gi, "$1<redacted>")
    .replace(/\b((?:api[_ -]?key|token|secret|authorization)[^:;,\n]{0,32}[:=]\s*)(["']?)[^"'\s;,)]+/gi, "$1$2<redacted>$2")
    .replace(/\b(?:sk|rk|ghp|gho|ghu|ghs|ghr|github_pat|xoxb|xoxp|xoxa|xoxr|AIza)[A-Za-z0-9_-]{8,}\b/g, "<redacted>");
}

function parseAiProviderId(value: string | undefined): AiProviderId {
  if (value === "openai" || value === "anthropic" || value === "gemini" || value === "local") {
    return value;
  }
  throw new Error(`invalid AI provider: ${value ?? "(empty)"}. allowed: openai, anthropic, gemini, local`);
}

function parseMcpServerId(value: string | undefined): McpServerId {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (/^[a-z0-9][a-z0-9_-]{1,62}$/.test(normalized)) {
    return normalized;
  }
  throw new Error(`invalid MCP server: ${value ?? "(empty)"}. use a known id or a custom id added with /setup mcp add`);
}

function parseMcpAuthMode(value: string | undefined): "none" | "x-goog-api-key" | "bearer" | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "none" || normalized === "bearer" || normalized === "x-goog-api-key") {
    return normalized;
  }
  if (normalized === "x-api-key" || normalized === "google-api-key") {
    return "x-goog-api-key";
  }
  throw new Error(`invalid MCP auth mode: ${value}. allowed: bearer, x-goog-api-key, none`);
}

function parseSetupMcpProofMode(value: string): "tools/list" | "tools/call" {
  const normalized = value.trim().toLowerCase();
  if (normalized === "tools/list" || normalized === "list" || normalized === "1") {
    return "tools/list";
  }
  if (normalized === "tools/call" || normalized === "call" || normalized === "2") {
    return "tools/call";
  }
  throw new Error(`invalid MCP proof mode: ${value}. allowed: tools/list, tools/call`);
}

function parseJsonObjectOption(value: string | undefined): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid JSON object option: ${message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid JSON object option: expected an object");
  }
  return parsed as Record<string, unknown>;
}

function parseToolListOption(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))].sort();
}

async function handlePm(
  projectRoot: string,
  subcommand: string | undefined,
  args: string[],
  options: Record<string, string | boolean>
): Promise<void> {
  if (subcommand === "start" && !isRuntimeProjectInitialized(projectRoot)) {
    const projectName = optionString(options, "project-name") ?? (path.basename(projectRoot) || "RPH Project");
    initProject(projectRoot, { projectName });
    console.log(`RPH project initialized: ${projectName}`);
  } else {
    requireInitialized(projectRoot);
  }
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
      throw new Error("usage: /pm start | interview | draft <docId> | revise <docId> | approve <docId> | finalize");
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
  console.log(`현재 단계: ${next.currentStage}`);
  console.log("설정 확인: rph setup auto --live");
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
    case "security": {
      const prNumber = parseIssueNumber(optionString(options, "pr"));
      const report = optionBool(options, "auto")
        ? runQaSecurityScan(projectRoot, prNumber)
        : recordQaSecurityReview(
            projectRoot,
            prNumber,
            parseQaRiskStatus(optionString(options, "status")),
            optionString(options, "finding")
          );
      console.log(`security status: ${report.securityStatus}`);
      console.log(`report: ${report.reportPath}`);
      return;
    }
    case "accessibility": {
      const prNumber = parseIssueNumber(optionString(options, "pr"));
      const report = optionBool(options, "auto")
        ? runQaAccessibilityScan(projectRoot, prNumber)
        : recordQaAccessibilityReview(
            projectRoot,
            prNumber,
            parseQaRiskStatus(optionString(options, "status")),
            optionString(options, "finding")
          );
      console.log(`accessibility status: ${report.accessibilityStatus}`);
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
      console.log("QA 명령어: review --pr <n> | conflicts --pr <n> | test --pr <n> | security --pr <n> (--auto|--status <clear|risk>) | accessibility --pr <n> (--auto|--status <clear|risk>) | report --pr <n>");
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
        console.log(`readback: ${applied.workspace.dashboardReadback.id}`);
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
        console.log(`readback: ${synced.readback.id}`);
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
): ReturnType<typeof createWorkIssue> {
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
  return issue;
}

function workIssueStart(projectRoot: string, options: Record<string, string | boolean>): void {
  requireImplementationStage(projectRoot);
  const issueNumber = parseIssueNumber(optionString(options, "issue"));
  const issue = markIssueInProgress(projectRoot, issueNumber);
  const execution = optionBool(options, "execute")
    ? prepareIssueBranch(projectRoot, issue.branchName)
    : {
        status: "prepared" as const,
        evidence: ["Issue marked in progress; branch execution not requested."],
        nextCommands: [
          `git switch -c ${issue.branchName}`,
          `${issue.assigneeAgent === "FE" ? "/fe" : "/be"} pr --issue ${issue.issueNumber}`
        ]
      };
  const record = createWorkExecutionRecord(projectRoot, issueNumber, execution);
  console.log(`작업 시작 기록: #${issue.issueNumber}`);
  console.log(`브랜치: ${issue.branchName}`);
  console.log(`execution: ${record.filePath}`);
  if (execution.status === "branch-ready") {
    console.log("branch ready");
  } else if (execution.status === "blocked") {
    console.log("branch execution blocked");
    process.exitCode = 1;
  } else {
    console.log(`명령어: git switch -c ${issue.branchName}`);
    console.log("실제 브랜치 준비까지 하려면: --execute");
  }
}

function workPrDraft(projectRoot: string, options: Record<string, string | boolean>): ReturnType<typeof createPullRequestDraft> {
  requireImplementationStage(projectRoot);
  const issueNumber = parseIssueNumber(optionString(options, "issue"));
  const target = parsePullRequestTargetBranch(optionString(options, "target"));
  const pr = createPullRequestDraft(projectRoot, issueNumber, target);
  console.log(`PR draft 기록: issue #${pr.issueNumber}`);
  console.log(`source: ${pr.sourceBranch}`);
  console.log(`target: ${pr.targetBranch}`);
  console.log(`dry-run: ${pr.dryRunCommand}`);
  return pr;
}

function beDeployDev(projectRoot: string, options: Record<string, string | boolean>): void {
  requireImplementationStage(projectRoot);
  const provider = optionString(options, "provider") ?? "local";
  const deployment = createDevDeploymentPlan(projectRoot, provider, optionBool(options, "execute") && provider === "local" ? "deployed" : "planned");
  console.log(`dev deploy hook 생성: ${deployment.filePath}`);
  if (deployment.status === "deployed") {
    console.log("local dev deployment recorded");
  } else {
    console.log("외부 배포는 사용자 승인 전 실행하지 않음");
    console.log("local deployment evidence까지 기록하려면: /be deploy-dev --provider local --execute");
  }
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

function parsePullRequestTargetBranch(value: string | undefined): "dev" | "release" | "main" {
  const target = value ?? "dev";
  if (target === "dev" || target === "release" || target === "main") {
    return target;
  }
  throw new Error("PR target must be dev, release, or main");
}

function parseQaRiskStatus(value: string | undefined): "clear" | "risk" {
  if (value === "clear" || value === "risk") {
    return value;
  }
  throw new Error("usage: --status <clear|risk>");
}

function parseWorkstream(value: string): Workstream {
  const normalized = value.toUpperCase();
  if (normalized === "FE" || normalized === "BE") {
    return normalized;
  }
  throw new Error("agent must be FE or BE");
}

function parseRepoVisibility(options: Record<string, string | boolean>): "private" | "public" {
  const wantsPublic = optionBool(options, "public");
  const wantsPrivate = optionBool(options, "private");
  if (wantsPublic && wantsPrivate) {
    throw new Error("usage: choose only one of --public or --private");
  }
  if (wantsPrivate) {
    return "private";
  }
  return "public";
}

function prepareIssueBranch(
  projectRoot: string,
  branchName: string
): { status: "branch-ready" | "blocked"; evidence: string[]; nextCommands: string[] } {
  const inside = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: projectRoot,
    encoding: "utf8"
  });
  if (inside.status !== 0 || inside.stdout.trim() !== "true") {
    return {
      status: "blocked",
      evidence: ["git worktree not detected; branch was not created"],
      nextCommands: [`git init`, `git switch -c ${branchName}`]
    };
  }
  const existing = spawnSync("git", ["rev-parse", "--verify", branchName], {
    cwd: projectRoot,
    encoding: "utf8"
  });
  const args = existing.status === 0 ? ["switch", branchName] : ["switch", "-c", branchName];
  const switched = spawnSync("git", args, {
    cwd: projectRoot,
    encoding: "utf8"
  });
  if (switched.status !== 0) {
    return {
      status: "blocked",
      evidence: [`git ${args.join(" ")} failed: ${(switched.stderr || switched.stdout).trim()}`],
      nextCommands: [`git switch -c ${branchName}`]
    };
  }
  return {
    status: "branch-ready",
    evidence: [`git ${args.join(" ")} succeeded`],
    nextCommands: [
      "implement acceptance criteria",
      "pnpm run lint && pnpm test && pnpm run build",
      "create PR draft with /fe pr --issue <n> or /be pr --issue <n>"
    ]
  };
}

function requireImplementationStage(projectRoot: string): void {
  const state = loadState(projectRoot);
  if (!["IMPLEMENTATION", "QA_REVIEW", "READY_FOR_RELEASE", "RELEASE_APPROVED"].includes(state.currentStage)) {
    throw new Error(`implementation work blocked. current stage must be IMPLEMENTATION/QA_REVIEW/READY_FOR_RELEASE/RELEASE_APPROVED. current: ${state.currentStage}`);
  }
}

function requireGitHubLiveWriteTarget(projectRoot: string): { owner: string; repo: string } {
  const resolved = resolveGitHubTarget(projectRoot);
  const target = normalizeGitHubRepoTarget(resolved.owner, resolved.repo);
  if (!target.owner || !target.repo || target.warnings.length > 0) {
    throw new Error(`GitHub target is not valid: ${target.warnings[0] ?? "set GITHUB_OWNER/GITHUB_REPO or configure origin"}`);
  }
  const readiness = checkGitHubCliWriteReadiness(target.owner, target.repo, process.env);
  if (!readiness.ok) {
    throw new Error(`GitHub write channel is not ready: ${readiness.message}`);
  }
  return { owner: target.owner, repo: target.repo };
}

function handleGitHub(
  projectRoot: string,
  subcommand: string | undefined,
  args: string[],
  options: Record<string, string | boolean>
): void {
  switch (subcommand) {
    case "create-repo": {
      const visibility = parseRepoVisibility(options);
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
        console.log(`실행할 명령: gh repo create ${owner ?? "<owner>"}/${repo ?? "<repo>"} ${visibility === "private" ? "--private" : "--public"} --source . --remote origin --push`);
        return;
      }
      const result = createGitHubRepo(projectRoot, owner, repo, {
        visibility,
        push: true
      });
      if (!result.ok) {
        throw new Error(result.message);
      }
	      console.log(result.existed ? "GitHub repo 이미 존재" : "GitHub repo 생성 완료");
	      if (result.url) {
	        console.log(result.url);
	      }
	      if (result.readback) {
	        console.log(`readback: ${result.readback.nameWithOwner}`);
	        console.log(`readback file: ${githubRepoReadbackFile(projectRoot)}`);
	      }
	      return;
	    }
    case "setup-labels": {
      const result = setupGitHubLabels(projectRoot);
      console.log("GitHub label 설정 파일 생성");
      console.log(`labels: ${result.labels.length}`);
      let liveTarget: { owner: string; repo: string };
      try {
        liveTarget = requireGitHubLiveWriteTarget(projectRoot);
      } catch (error) {
        console.log(`[dry-run] ${error instanceof Error ? error.message : String(error)}`);
        console.log("실행할 명령:");
        result.commands.forEach((command) => console.log(`- ${command}`));
        return;
      }
      {
        const { owner, repo } = liveTarget;
	        const { applied, readback } = applyGitHubLabelsWithReadback(projectRoot, owner, repo, result.labels);
	        const failed = applied.filter((item) => !item.ok);
	        applied.forEach((item) => console.log(`- ${item.label}: ${item.ok ? "applied" : item.message}`));
	        if (failed.length > 0) {
	          throw new Error(`GitHub label apply failed: ${failed.map((item) => item.label).join(", ")}`);
	        }
	        if (!readback.verified) {
	          throw new Error(`GitHub label readback failed: missing=${readback.missing.join(",") || "none"} mismatched=${readback.mismatched.map((item) => item.name).join(",") || "none"}`);
	        }
	        console.log(`readback: ${owner}/${repo} labels=${readback.observed.length}`);
	        console.log(`readback file: ${githubLabelsReadbackFile(projectRoot)}`);
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
      const approvedParams = runtimeApprovedParametersFromEnv();
      const approvedIssueNumber = optionBool(options, "live")
        ? parseOptionalPositiveInt(approvedParams.localIssueNumber)
        : undefined;
      const issue = approvedIssueNumber
        ? readWorkIssue(projectRoot, approvedIssueNumber)
        : workIssueCreate(projectRoot, parseWorkstream(optionString(options, "agent") ?? "FE"), args, options);
      if (approvedIssueNumber) {
        console.log(`승인된 로컬 issue snapshot 사용: #${issue.issueNumber} ${issue.title}`);
      }
      if (!optionBool(options, "live")) {
        console.log("mode: dry-run");
        console.log("실제 GitHub issue 생성까지 하려면: --live");
        return;
      }
      const repoTarget = requireGitHubLiveWriteTarget(projectRoot);
      const { ok, message, readback } = createGitHubIssueWithReadback(projectRoot, repoTarget.owner, repoTarget.repo, issue);
      linkWorkIssueToGitHub(projectRoot, issue.issueNumber, {
        githubIssueNumber: readback.githubIssueNumber ?? undefined,
        githubUrl: readback.url,
        githubReadbackStatus: ok ? "passed" : "failed",
        githubReadbackReason: readback.reason ?? message
      });
      if (!ok) {
        throw new Error(message);
      }
      console.log(`GitHub issue 생성 완료: #${readback.githubIssueNumber}`);
      if (readback.url) {
        console.log(readback.url);
      }
      console.log(`readback: ${repoTarget.owner}/${repoTarget.repo}#${readback.githubIssueNumber}`);
      console.log(`readback file: ${githubIssueReadbackFile(projectRoot, issue.issueNumber)}`);
      return;
    }
    case "create-pr": {
      requireInitialized(projectRoot);
      const approvedParams = runtimeApprovedParametersFromEnv();
      const approvedPrNumber = optionBool(options, "live")
        ? parseOptionalPositiveInt(approvedParams.localPrNumber)
        : undefined;
      const pr = approvedPrNumber
        ? readPullRequest(projectRoot, approvedPrNumber)
        : workPrDraft(projectRoot, options);
      if (approvedPrNumber) {
        console.log(`승인된 로컬 PR snapshot 사용: #${pr.prNumber} issue #${pr.issueNumber}`);
      }
      if (!optionBool(options, "live")) {
        console.log("mode: dry-run");
        console.log("실제 GitHub PR 생성까지 하려면: --live");
        return;
      }
      const issue = readWorkIssue(projectRoot, pr.issueNumber);
      const repoTarget = requireGitHubLiveWriteTarget(projectRoot);
      const { ok, message, readback } = createGitHubPullRequestWithReadback(projectRoot, repoTarget.owner, repoTarget.repo, pr, issue);
      linkPullRequestToGitHub(projectRoot, pr.prNumber, {
        githubPrNumber: readback.githubPrNumber ?? undefined,
        githubUrl: readback.url,
        githubReadbackStatus: ok ? "passed" : "failed",
        githubReadbackReason: readback.reason ?? message
      });
      if (!ok) {
        throw new Error(message);
      }
      console.log(`GitHub PR 생성 완료: #${readback.githubPrNumber}`);
      if (readback.url) {
        console.log(readback.url);
      }
      console.log(`readback: ${repoTarget.owner}/${repoTarget.repo}#${readback.githubPrNumber}`);
      console.log(`readback file: ${githubPullRequestReadbackFile(projectRoot, pr.prNumber)}`);
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
    case "release-approve": {
      requireInitialized(projectRoot);
      const id = optionString(options, "id") ?? args[0];
      if (!id) {
        throw new Error("usage: /github release-approve --id <release-id> [--by <name>]");
      }
      const plan = approveReleasePlan(projectRoot, id, optionString(options, "by") ?? "user");
      console.log(`release approved: ${plan.id}`);
      console.log(`plan: ${plan.filePath}`);
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
      console.log("GitHub 명령어: create-repo [--public|--private] | setup-labels | setup-templates | setup-branches | create-issue [--live] | create-pr [--live] | sync | release-plan | release-approve | hotfix-plan");
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
    system: aiBodySystemPrompt(projectRoot, request),
    maxOutputTokens: parseOptionalPositiveInt(optionString(options, "max-tokens")) ?? 2400
  });
  const recordPath = writeAiRunRecord(projectRoot, createAiRunRecord(result, request.command, request.prompt, {
    kind: request.kind,
    id: request.id
  }));
  printAiProviderFallbackNotice(result);
  console.log(`ai_run: ${recordPath}`);
  return sanitizeGeneratedMarkdown(result.text);
}

function printAiProviderFallbackNotice(result: Parameters<typeof formatAiProviderFallback>[0]): void {
  const notice = formatAiProviderFallback(result);
  if (notice) {
    console.log(notice);
  }
}

function aiBodySystemPrompt(projectRoot: string, request: AiBodyRequest): string {
  const lane = latestAgentLaneRun(projectRoot);
  const expectedRole = roleForAiBodyRequest(request);
  const lanePrompt = lane?.status === "running" && lane.role === expectedRole
    ? [
        lane.systemPrompt,
        `Lane run: ${lane.id}`,
        `Lane acceptance: ${lane.acceptanceCriteria.join("; ") || "none"}`,
        `Lane artifacts: ${lane.artifactRefs.join(", ") || "none"}`
      ].join("\n")
    : "";
  return [
    lanePrompt,
    "You are Real Product Harness, a role-separated product delivery agent runtime.",
    "Return only the requested markdown body. Do not include YAML frontmatter.",
    "Be concrete, implementation-ready, and preserve approval-gate wording where relevant.",
    "Use Korean by default unless the product context is clearly English."
  ].filter(Boolean).join("\n");
}

function roleForAiBodyRequest(request: AiBodyRequest): AgentRole {
  if (request.kind === "pm-document") {
    return "PM";
  }
  if (request.kind === "pd-artifact") {
    return "PD";
  }
  if (request.command.startsWith("/fe")) {
    return "FE";
  }
  if (request.command.startsWith("/be")) {
    return "BE";
  }
  return "Orchestrator";
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

function parseOptionalNonNegativeInt(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`expected non-negative integer, got: ${value}`);
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
  const normalized = value.trim().toLowerCase();
  const mapped = {
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
  }[normalized] as SetupChoices["deployment"] | undefined;
  if (mapped) {
    return mapped;
  }
  if (["local", "docker", "aws", "gcp", "vercel", "render", "fly", "railway", "custom", "later"].includes(normalized)) {
    return normalized as SetupChoices["deployment"];
  }
  throw new Error(`invalid deployment choice: ${value}`);
}

function parseStackChoice(value: string): SetupChoices["stack"] {
  const normalized = value.trim().toLowerCase();
  const mapped = {
    "1": "recommended",
    "2": "custom",
    "3": "analyze-existing"
  }[normalized] as SetupChoices["stack"] | undefined;
  if (mapped) {
    return mapped;
  }
  if (normalized === "recommended" || normalized === "custom" || normalized === "analyze-existing") {
    return normalized;
  }
  throw new Error(`invalid stack choice: ${value}`);
}

function parseUiThemeChoice(value: string): "hacker" | "mono" | "minimal" {
  const normalized = value.trim().toLowerCase();
  if (normalized === "hacker" || normalized === "mono" || normalized === "minimal") {
    return normalized;
  }
  throw new Error(`invalid theme choice: ${value}`);
}

function parseSetupBoolean(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return "true";
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return "false";
  }
  throw new Error(`invalid boolean choice: ${value}`);
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
    suggestion ? `Try: help ${suggestion}` : "Available topics: runtime, productize, setup, agent, workspace, ai, mcp, live, proofs, pm, pd, fe, be, qa, notion, docs, github",
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
    "Talk to the connected AI agent:",
    "  rph",
    "    Enter the runtime. Plain text chats with the connected AI agent; slash commands control workflow state.",
    "  rph home",
    "    Show the chat-first operator home without entering the runtime.",
    "  rph shell",
    "    Explicit name for the same conversation runtime.",
    "  rph \"what should I do next?\"",
    "    Send a one-shot chat message to the current runtime session.",
    "  rph 다음에 뭐 하면 돼?",
    "    Unknown bare text is treated as conversation, not as a failed command.",
    "",
    "Primary controls:",
    "  rph start",
    "    Setup-first entrypoint. In a fresh TTY it opens the runtime and offers live setup before workflow work.",
    "  rph setup auto --live",
    "    Connect AI/MCP credentials, apply config, and verify live connections.",
    "  rph live ai:openai",
    "    Verify one provider or MCP target without running the full live matrix.",
    "  rph live audit",
    "    Collect live proof for configured AI/MCP targets and write a sanitized audit snapshot. Evidence only; use --strict for a failing release gate.",
    "  rph status",
    "    Show the active workflow, runtime graph digest, blockers, and next safe command.",
    "  rph workspace",
    "    Show one operator view of runtime, readiness, approvals, artifacts, PR/QA blockers, and next action.",
    "  rph doctor install",
    "    Diagnose stale installed wrappers, shell init, completion, and JSON operator command support.",
    "  rph update",
    "    Rerun the installer from the current source checkout.",
    "  rph pm start",
    "    Start the PM workflow directly from the shell.",
    "  rph /pm start",
    "    Same PM entry in slash-command form.",
    "",
    "Advanced execution:",
    "  rph ask --execute <message>",
    "  rph ask --execute --loop <message>",
    "  rph /productize <product idea>",
    "",
    "Installed shell slash helpers:",
    "  /setup auto --live",
    "  /pm start",
    "  /agent run --steps 5",
    "  /agent bind qa-expert --role QA",
    "  /mcp tools stitch",
    "  /live audit",
    "  /workspace",
    "",
    "Topic help:",
    "  rph help setup",
    "  rph help shell",
    "  rph help status",
    "  rph help agent",
    "  rph help doctor",
    "  rph help live",
    "  rph help runtime",
    "  rph help mcp",
    "  rph help pm",
    "",
    "All topics: shell, status, runtime, productize, setup, agent, workspace, doctor, ai, mcp, live, proofs, pm, pd, fe, be, qa, notion, docs, github",
    "",
    `Document IDs: ${DOCUMENT_IDS.map((docId) => `${docId}(${DOCUMENT_TITLES[docId]})`).join(", ")}`,
    `Design Artifact IDs: ${DESIGN_ARTIFACT_IDS.map((artifactId) => `${artifactId}(${DESIGN_ARTIFACT_TITLES[artifactId]})`).join(", ")}`
  ].join("\n");
}

if (typeof require !== "undefined" && require.main === module) {
  void main();
}
