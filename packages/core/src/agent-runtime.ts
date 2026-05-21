import { parseCli, parseCommandLine } from "./commands";
import { readJsonIfExists, writeJson } from "./fs";
import { runtimeSessionFile } from "./paths";
import { extractProductIdea } from "./product-idea";
import { loadState } from "./project";
import { canTransition, WORKFLOW_STAGES } from "./workflow";
import {
  AgentActionPlan,
  AgentToolCall,
  AgentTurnState,
  HandoffPacket,
  ProjectState,
  RuntimeSessionEvent,
  RuntimeSessionManifest,
  RuntimeSessionStage,
  StageQueueEntry,
  WaitCondition,
  WorkflowStageId
} from "./types";

const STATUS_PATTERNS = [/^(status|show status)$/i, /현재\s*상태/, /진행\s*상황/, /어디까지/];
const START_PATTERNS = [/^(start|begin|kickoff|launch)\b/i, /(시작|재개|계속)/, /\b(pm|pd|fe|be|qa)\b/i];

export interface AgentPlanInput {
  text: string;
  initialized: boolean;
  currentStage?: WorkflowStageId;
  paused?: boolean;
  recommendedCommand?: string;
  hasConfiguredAi?: boolean;
}

export interface RuntimeSessionUpdateInput {
  status?: RuntimeSessionManifest["status"];
  stage?: RuntimeSessionStage;
  pendingAction?: AgentActionPlan | null;
  pendingInput?: string;
  checkpoint?: string | null;
  blocker?: string | null;
  retryCount?: number;
  incrementRetryCount?: boolean;
  note?: string;
}

export function createRuntimeSessionManifest(
  projectRoot: string,
  sessionId: string,
  now = new Date().toISOString(),
  pendingInput?: string
): RuntimeSessionManifest {
  const state = safeLoadState(projectRoot);
  const stage = state?.currentStage ?? "UNINITIALIZED";
  const pendingAction = pendingInput
    ? planAgentAction({
        text: pendingInput,
        initialized: stage !== "UNINITIALIZED",
        currentStage: stage === "UNINITIALIZED" ? undefined : stage
      })
    : null;
  return {
    version: 2,
    sessionId,
    status: "active",
    projectRoot,
    startedAt: now,
    updatedAt: now,
    stage,
    ownerAgent: stageOwner(stage),
    pendingAction,
    checkpoint: stage === "UNINITIALIZED" ? "uninitialized" : `started at ${stage}`,
    blocker: null,
    retryCount: 0,
    lastCommand: pendingAction?.command,
    lastCommandOk: undefined,
    activeTurn: null,
    stageQueue: createStageQueue(stage, state),
    waitCondition: null,
    handoffPacket: null,
    toolTrace: [],
    history: [
      {
        at: now,
        kind: "start",
        message: "runtime session started",
        ok: true,
        plan: pendingAction ?? undefined
      }
    ]
  };
}

export function loadRuntimeSession(projectRoot: string): RuntimeSessionManifest | null {
  const current = readJsonIfExists<RuntimeSessionManifest | null>(runtimeSessionFile(projectRoot), null);
  return current ? normalizeRuntimeSession(projectRoot, current) : null;
}

export function saveRuntimeSession(projectRoot: string, manifest: RuntimeSessionManifest): RuntimeSessionManifest {
  const next = normalizeRuntimeSession(projectRoot, {
    ...manifest,
    updatedAt: new Date().toISOString()
  });
  writeJson(runtimeSessionFile(projectRoot), next);
  return next;
}

export function ensureRuntimeSession(projectRoot: string, sessionId: string): RuntimeSessionManifest {
  const current = loadRuntimeSession(projectRoot);
  if (current?.sessionId === sessionId && (current.status === "active" || current.status === "paused")) {
    return current;
  }
  return saveRuntimeSession(projectRoot, createRuntimeSessionManifest(projectRoot, sessionId));
}

export function updateRuntimeSession(
  projectRoot: string,
  sessionId: string,
  input: RuntimeSessionUpdateInput
): RuntimeSessionManifest {
  const current = ensureRuntimeSession(projectRoot, sessionId);
  const state = safeLoadState(projectRoot);
  const stage = input.stage ?? state?.currentStage ?? current.stage;
  const pendingAction = input.pendingInput !== undefined
    ? planAgentAction({
        text: input.pendingInput,
        initialized: stage !== "UNINITIALIZED",
        currentStage: stage === "UNINITIALIZED" ? undefined : stage
      })
    : input.pendingAction !== undefined
      ? input.pendingAction
      : current.pendingAction;
  const retryCount = input.retryCount ?? (input.incrementRetryCount ? current.retryCount + 1 : current.retryCount);
  const event = createRuntimeEvent(input.note ?? "runtime session updated", pendingAction, input.blocker);
  const next: RuntimeSessionManifest = {
    ...current,
    status: input.status ?? current.status,
    stage,
    ownerAgent: stageOwner(stage),
    pendingAction,
    checkpoint: input.checkpoint !== undefined ? input.checkpoint : current.checkpoint,
    blocker: input.blocker !== undefined ? input.blocker : current.blocker,
    retryCount,
    lastCommand: current.lastCommand,
    lastCommandOk: input.blocker ? false : current.lastCommandOk,
    history: [...current.history.slice(-79), event]
  };
  return saveRuntimeSession(projectRoot, next);
}

export function recordRuntimeSessionEvent(
  projectRoot: string,
  sessionId: string,
  event: Omit<RuntimeSessionEvent, "at">
): RuntimeSessionManifest {
  const current = ensureRuntimeSession(projectRoot, sessionId);
  const state = safeLoadState(projectRoot);
  const next: RuntimeSessionManifest = {
    ...current,
    stage: state?.currentStage ?? current.stage,
    ownerAgent: stageOwner(state?.currentStage ?? current.stage),
    pendingAction: event.plan ?? current.pendingAction,
    checkpoint: event.kind === "checkpoint" ? event.message : current.checkpoint,
    blocker: event.kind === "blocker" ? event.message : event.ok === false ? event.message : current.blocker,
    retryCount: event.ok === false ? current.retryCount + 1 : current.retryCount,
    lastCommand: (event.kind === "checkpoint" || event.kind === "error") ? event.message : event.plan?.command ?? current.lastCommand,
    lastCommandOk: event.ok ?? current.lastCommandOk,
    history: [...current.history.slice(-79), { ...event, at: new Date().toISOString() }]
  };
  return saveRuntimeSession(projectRoot, next);
}

export function recordAgentTurnState(
  projectRoot: string,
  sessionId: string,
  turn: AgentTurnState
): RuntimeSessionManifest {
  const current = ensureRuntimeSession(projectRoot, sessionId);
  const toolTrace = mergeToolTrace(current.toolTrace ?? [], turn.toolCalls);
  return saveRuntimeSession(projectRoot, {
    ...current,
    activeTurn: turn,
    toolTrace,
    checkpoint: turn.status === "complete" ? "agent turn complete" : current.checkpoint,
    blocker: turn.status === "failed" ? turn.error ?? "agent turn failed" : current.blocker,
    history: [
      ...current.history.slice(-79),
      {
        at: new Date().toISOString(),
        kind: turn.status === "failed" ? "error" : "chat",
        message: turn.finalResponse ?? turn.error ?? "agent turn updated",
        ok: turn.status !== "failed"
      }
    ]
  });
}

export function planAgentAction(input: AgentPlanInput): AgentActionPlan {
  const text = input.text.trim();
  if (!text) {
    return plan("unknown", 0, "empty input");
  }
  if (text.startsWith("/")) {
    const parsed = parseCli(parseCommandLine(text));
    return plan("slash-command", 1, "explicit slash command", text, true, [
      `Parse ${parsed.command}${parsed.subcommand ? ` ${parsed.subcommand}` : ""} tokens.`,
      "Dispatch slash command handler.",
      "Persist runtime checkpoint."
    ]);
  }
  if (STATUS_PATTERNS.some((pattern) => pattern.test(text))) {
    return plan("status", 0.95, "status intent", "/status", true, [
      "Read current workflow stage.",
      "Summarize documents, design artifacts, issues, PRs, and QA.",
      "Return concise runtime status."
    ]);
  }
  if (!input.initialized) {
    if (isProductizeIntent(text)) {
      const idea = extractProductIdea(text);
      return plan("start-workflow", 0.9, "bootstrap productize", `/productize "${escapeCommandArg(idea)}"`, true, [
        "Initialize project metadata if needed.",
        "Create the first product execution package.",
        "Return review and approval commands."
      ], "productize");
    }
    if (matches(text, ["setup", "설정", "연결", "credential", "api key", "mcp", "도와줘", "help me"])) {
      return plan("start-workflow", 0.92, "bootstrap setup", "/setup auto", true, [
        "Initialize project metadata if needed.",
        "Detect AI and MCP credentials.",
        "Guide connection checks."
      ], "setup");
    }
    return matches(text, ["init", "초기화", "시작", "프로젝트"])
      ? plan("start-workflow", 0.9, "initialize project", `/init --yes --project-name "${escapeCommandArg(text)}"`, true, [
          "Initialize project metadata.",
          "Persist initial runtime session.",
          "Continue into setup."
        ], "init")
      : plan("chat", 0.4, "project not initialized");
  }
  if (input.paused && !matches(text, ["resume", "재개", "다시"])) {
    return plan("blocked", 0.9, "workflow paused. resume required");
  }
  if (isAdviceQuestion(text)) {
    return plan("chat", 0.7, "advice question");
  }
  if (isWorkflowStartIntent(text)) {
    const command = workflowCommand(text, input);
    const workflowTarget = workflowTargetForCommand(command);
    return plan("start-workflow", 0.82, "workflow start intent", command, true, [
      "Resolve the target workflow command.",
      "Check current stage and approval gates.",
      "Run or suggest the next workflow step."
    ], workflowTarget);
  }
  return plan("chat", 0.35, "conversation");
}

function plan(
  kind: AgentActionPlan["kind"],
  confidence: number,
  reason: string,
  command?: string,
  safeToAutoRun = false,
  steps: string[] = ["Send message to runtime chat model."],
  workflowTarget?: string
): AgentActionPlan {
  return {
    kind,
    confidence,
    reason,
    command,
    workflowTarget,
    safeToAutoRun,
    steps,
    createdAt: new Date().toISOString()
  };
}

function createRuntimeEvent(message: string, planValue: AgentActionPlan | null, blocker?: string | null): RuntimeSessionEvent {
  return {
    at: new Date().toISOString(),
    kind: blocker ? "blocker" : "checkpoint",
    message: blocker ?? message,
    ok: !blocker,
    plan: planValue ?? undefined
  };
}

function isWorkflowStartIntent(text: string): boolean {
  if (matches(text, ["resume", "재개", "다시 시작", "continue", "계속", "진행"])) {
    return true;
  }
  return START_PATTERNS.some((pattern) => pattern.test(text))
    || matches(text, [
      "setup",
      "설정",
      "요구사항",
      "requirements",
      "mvp",
      "아이디어",
      "productize",
      "스펙",
      "spec",
      "작업",
      "제품 정의",
      "product definition",
      "화면 정의",
      "기능 정의",
      "디자인",
      "frontend",
      "프론트",
      "backend",
      "백엔드",
      "qa",
      "검증",
      "테스트"
    ]);
}

function isAdviceQuestion(text: string): boolean {
  return /[?？]\s*$/.test(text)
    || matches(text, ["뭐 하면", "무엇을 하면", "어떻게 하면", "어떻게 진행", "다음에 뭐", "next step?"]);
}

function workflowCommand(text: string, input: AgentPlanInput): string {
  if (matches(text, ["resume", "재개", "다시 시작"])) {
    return "/resume";
  }
  if (matches(text, ["setup", "설정", "연결", "credential", "api key", "mcp"])) {
    return "/setup auto";
  }
  if (isProductizeIntent(text)) {
    return `/productize "${escapeCommandArg(extractProductIdea(text))}"`;
  }
  if (matches(text, ["제품 정의", "product definition"])) {
    return withAiIfUseful("/pm draft product-definition", input);
  }
  if (matches(text, ["요구사항", "requirements"])) {
    return withAiIfUseful("/pm draft requirements", input);
  }
  if (matches(text, ["화면 정의", "screen"])) {
    return withAiIfUseful("/pm draft screen-definition", input);
  }
  if (matches(text, ["기능 정의", "feature"])) {
    return withAiIfUseful("/pm draft feature-definition", input);
  }
  if (matches(text, ["디자인", "레퍼런스", "pd", "figma", "stitch"])) {
    return withAiIfUseful("/pd references", input);
  }
  if (matches(text, ["프론트", "frontend", "fe"])) {
    return withAiIfUseful("/fe spec", input);
  }
  if (matches(text, ["백엔드", "backend", "api", "be"])) {
    return withAiIfUseful("/be spec", input);
  }
  if (matches(text, ["qa", "테스트", "검증"])) {
    return "/qa report --pr 1";
  }
  return withAiIfUseful(input.recommendedCommand ?? "/next", input);
}

function workflowTargetForCommand(command: string): string | undefined {
  if (command.startsWith("/productize")) {
    return "productize";
  }
  if (command.startsWith("/pm ")) {
    return "pm";
  }
  if (command.startsWith("/pd ")) {
    return "pd";
  }
  if (command.startsWith("/fe ")) {
    return "fe";
  }
  if (command.startsWith("/be ")) {
    return "be";
  }
  if (command.startsWith("/qa ")) {
    return "qa";
  }
  if (command.startsWith("/setup")) {
    return "setup";
  }
  if (command.startsWith("/resume") || command.startsWith("/next")) {
    return "workflow";
  }
  return undefined;
}

function withAiIfUseful(command: string, input: AgentPlanInput): string {
  if (!input.hasConfiguredAi || /--ai\b/.test(command)) {
    return command;
  }
  return /^\/(?:pm draft|pd references|fe spec|be spec)\b/.test(command) ? `${command} --ai` : command;
}

function isProductizeIntent(text: string): boolean {
  const hasIdea = matches(text, ["아이디어", "idea", "mvp", "제품화", "productize"]);
  const hasExecutionPackage = matches(text, [
    "fe/be",
    "fe",
    "be",
    "frontend",
    "backend",
    "프론트",
    "백엔드",
    "작업",
    "스펙",
    "spec",
    "실행"
  ]);
  return hasIdea && hasExecutionPackage;
}

function matches(text: string, needles: string[]): boolean {
  const normalized = text.toLowerCase();
  return needles.some((needle) => normalized.includes(needle.toLowerCase()));
}

function safeLoadState(projectRoot: string) {
  try {
    return loadState(projectRoot);
  } catch {
    return null;
  }
}

function normalizeRuntimeSession(projectRoot: string, manifest: RuntimeSessionManifest): RuntimeSessionManifest {
  const state = safeLoadState(projectRoot);
  const stage = state?.currentStage ?? manifest.stage;
  const handoffPacket = createHandoffPacket(manifest, stage, state);
  return {
    ...manifest,
    version: 2,
    stage,
    ownerAgent: stageOwner(stage),
    stageQueue: createStageQueue(stage, state),
    waitCondition: createWaitCondition(manifest, state),
    handoffPacket,
    activeTurn: manifest.activeTurn ?? null,
    toolTrace: manifest.toolTrace ?? []
  };
}

function createStageQueue(stage: RuntimeSessionStage, state: ProjectState | null): StageQueueEntry[] {
  if (stage === "UNINITIALIZED") {
    return [];
  }
  const entries: StageQueueEntry[] = [];
  const pending = [stage];
  const seen = new Set<WorkflowStageId>();
  while (pending.length > 0 && entries.length < 8) {
    const stageId = pending.shift()!;
    if (seen.has(stageId)) {
      continue;
    }
    seen.add(stageId);
    const current = WORKFLOW_STAGES[stageId];
    const isActive = stageId === stage;
    entries.push({
      id: `stage:${stageId}`,
      stage: stageId,
      name: current.name,
      ownerAgent: current.ownerAgent,
      status: isActive ? "active" : "pending",
      reason: isActive ? "current workflow stage" : `queued after ${entries[entries.length - 1]?.stage ?? stage}`,
      prerequisites: current.prerequisites,
      requiredDocuments: current.requiredDocuments,
      requiredApprovals: current.requiredApprovals,
      requiredDesignArtifacts: current.requiredDesignArtifacts,
      requiredDesignApprovals: current.requiredDesignApprovals,
      nextStages: current.nextStages,
      nextCommand: commandForStage(stageId),
      blockers: stageBlockers(state, stageId, isActive)
    });
    pending.push(...current.nextStages.filter((nextStageId) => !seen.has(nextStageId)));
  }
  return entries;
}

function stageBlockers(state: ProjectState | null, stageId: WorkflowStageId, isActive: boolean): string[] {
  if (!state) {
    return [];
  }
  if (!isActive) {
    return canTransition(state, stageId).reasons;
  }
  const stage = WORKFLOW_STAGES[stageId];
  return [
    ...stage.requiredDocuments
      .filter((docId) => !state.documents[docId]?.currentVersion)
      .map((docId) => `required document missing: ${docId}`),
    ...stage.requiredApprovals
      .filter((docId) => state.documents[docId]?.status !== "approved")
      .map((docId) => `required approval missing: ${docId}`),
    ...stage.requiredDesignArtifacts
      .filter((artifactId) => !state.designArtifacts?.[artifactId]?.currentVersion)
      .map((artifactId) => `required design artifact missing: ${artifactId}`),
    ...stage.requiredDesignApprovals
      .filter((artifactId) => state.designArtifacts?.[artifactId]?.status !== "approved")
      .map((artifactId) => `required design approval missing: ${artifactId}`)
  ];
}

function createWaitCondition(manifest: RuntimeSessionManifest, state: ProjectState | null): WaitCondition | null {
  if (manifest.status === "paused" || state?.paused) {
    return {
      kind: "paused",
      message: "workflow is paused until /resume",
      since: manifest.updatedAt
    };
  }
  if (manifest.activeTurn?.status === "waiting") {
    return {
      kind: "user_approval",
      message: manifest.activeTurn.finalResponse ?? "agent is waiting for user input",
      since: manifest.activeTurn.updatedAt
    };
  }
  if (state) {
    const stage = WORKFLOW_STAGES[state.currentStage];
    const approvalStages = [stage, ...stage.nextStages.map((stageId) => WORKFLOW_STAGES[stageId])];
    const missingApprovals = Array.from(new Set(approvalStages.flatMap((item) => item.requiredApprovals))).filter((docId) => {
      return state.documents[docId]?.status !== "approved";
    });
    const missingDesignApprovals = Array.from(new Set(approvalStages.flatMap((item) => item.requiredDesignApprovals))).filter((artifactId) => {
      return state.designArtifacts?.[artifactId]?.status !== "approved";
    });
    if (missingApprovals.length > 0 || missingDesignApprovals.length > 0) {
      const missing = [...missingApprovals, ...missingDesignApprovals].join(", ");
      return {
        kind: "user_approval",
        message: `approval required before advancing: ${missing}`,
        since: manifest.updatedAt
      };
    }
  }
  return manifest.waitCondition?.kind === "paused" ? null : manifest.waitCondition ?? null;
}

function createHandoffPacket(
  manifest: RuntimeSessionManifest,
  stage: RuntimeSessionStage,
  state: ProjectState | null
): HandoffPacket | null {
  if (stage === "UNINITIALIZED" || manifest.stage === stage) {
    return manifest.handoffPacket ?? null;
  }
  const fromAgent = stageOwner(manifest.stage);
  const toAgent = stageOwner(stage);
  if (fromAgent === toAgent) {
    return manifest.handoffPacket ?? null;
  }
  return {
    fromAgent,
    toAgent,
    stage,
    summary: `${manifest.stage} -> ${stage}: ${fromAgent} handoff to ${toAgent}`,
    artifactRefs: artifactRefsForStage(stage),
    acceptanceCriteria: acceptanceCriteriaForStage(stage),
    blockers: stageBlockers(state, stage, false),
    nextCommand: commandForStage(stage),
    resumeCursor: `stage:${stage}`,
    createdAt: new Date().toISOString()
  };
}

function artifactRefsForStage(stage: RuntimeSessionStage): string[] {
  if (stage === "UNINITIALIZED") {
    return [];
  }
  const current = WORKFLOW_STAGES[stage];
  return [
    ...current.requiredDocuments.map((docId) => `document:${docId}`),
    ...current.requiredApprovals.map((docId) => `approval:${docId}`),
    ...current.requiredDesignArtifacts.map((artifactId) => `design:${artifactId}`),
    ...current.requiredDesignApprovals.map((artifactId) => `design-approval:${artifactId}`)
  ];
}

function acceptanceCriteriaForStage(stage: RuntimeSessionStage): string[] {
  if (stage === "UNINITIALIZED") {
    return [];
  }
  const current = WORKFLOW_STAGES[stage];
  return [
    `owner agent ${current.ownerAgent} can explain the current objective`,
    ...current.requiredDocuments.map((docId) => `document ${docId} exists`),
    ...current.requiredApprovals.map((docId) => `document ${docId} is approved`),
    ...current.requiredDesignArtifacts.map((artifactId) => `design artifact ${artifactId} exists`),
    ...current.requiredDesignApprovals.map((artifactId) => `design artifact ${artifactId} is approved`)
  ];
}

function commandForStage(stage: RuntimeSessionStage): string | undefined {
  switch (stage) {
    case "UNINITIALIZED":
      return "/init --yes --project-name <name>";
    case "SETUP":
      return "/setup auto";
    case "PM_PRODUCT_DEFINITION_INTERVIEW":
      return "/pm interview";
    case "PM_PRODUCT_DEFINITION_DRAFT":
      return "/pm draft product-definition --ai";
    case "PM_PRODUCT_DEFINITION_REVIEW":
      return "/docs approve product-definition";
    case "PM_PRODUCT_DEFINITION_APPROVED":
      return "/pm draft competitor-analysis --ai";
    case "PM_COMPETITOR_ANALYSIS":
      return "/pm draft competitor-analysis --ai";
    case "PM_DIFFERENTIATION":
      return "/pm draft differentiation --ai";
    case "PM_REQUIREMENTS_INTERVIEW":
      return "/pm interview requirements";
    case "PM_REQUIREMENTS_DRAFT":
      return "/pm draft requirements --ai";
    case "PM_REQUIREMENTS_REVIEW":
      return "/docs approve requirements";
    case "PM_REQUIREMENTS_APPROVED":
      return "/pm draft screen-definition --ai";
    case "PM_SCREEN_DEFINITION_INTERVIEW":
      return "/pm interview screen-definition";
    case "PM_SCREEN_DEFINITION_DRAFT":
      return "/pm draft screen-definition --ai";
    case "PM_SCREEN_DEFINITION_REVIEW":
      return "/docs approve screen-definition";
    case "PM_SCREEN_DEFINITION_APPROVED":
      return "/pm draft feature-definition --ai";
    case "PM_FEATURE_DEFINITION_INTERVIEW":
      return "/pm interview feature-definition";
    case "PM_FEATURE_DEFINITION_DRAFT":
      return "/pm draft feature-definition --ai";
    case "PM_FEATURE_DEFINITION_REVIEW":
      return "/docs approve feature-definition";
    case "PM_FEATURE_DEFINITION_APPROVED":
      return "/pd start";
    case "PM_APPROVED":
      return "/pd start";
    case "PD_REFERENCES":
      return "/pd references --ai";
    case "PD_DIRECTIONS":
      return "/pd directions --ai";
    case "PD_LANDING_PREVIEWS":
      return "/pd landing-preview --ai";
    case "PD_DESIGN_SYSTEM":
      return "/pd design-system --ai";
    case "PD_PAGE_DESIGNS":
      return "/pd page-designs --ai";
    case "PD_REVIEW":
      return "/pd approve page-designs";
    case "PD_APPROVED":
      return "/fe spec --ai";
    case "FE_SPEC":
      return "/fe spec --ai";
    case "BE_SPEC":
      return "/be spec --ai";
    case "SPRINT_PLANNING":
      return "/fe sprint-plan";
    case "IMPLEMENTATION":
      return "/fe work --issue 1";
    case "QA_REVIEW":
      return "/qa report --pr 1";
    case "READY_FOR_RELEASE":
      return "/github release-plan --version v0.1.0";
    case "RELEASE_REVIEW":
      return "/github release-plan --version v0.1.0";
    case "RELEASE_APPROVED":
      return "/be deploy-dev --provider local";
    default:
      return "/status";
  }
}

function mergeToolTrace(existing: AgentToolCall[], next: AgentToolCall[]): AgentToolCall[] {
  const merged = new Map(existing.map((call) => [call.id, call]));
  for (const call of next) {
    merged.set(call.id, call);
  }
  return Array.from(merged.values()).slice(-40);
}

function stageOwner(stage: RuntimeSessionStage): RuntimeSessionManifest["ownerAgent"] {
  if (stage === "UNINITIALIZED") {
    return "Orchestrator";
  }
  if (stage.startsWith("PM_")) {
    return "PM";
  }
  if (stage.startsWith("PD_")) {
    return "PD";
  }
  if (stage.startsWith("FE_")) {
    return "FE";
  }
  if (stage.startsWith("BE_") || stage === "SPRINT_PLANNING" || stage === "IMPLEMENTATION") {
    return "BE";
  }
  if (stage === "QA_REVIEW") {
    return "QA";
  }
  return "Orchestrator";
}

function escapeCommandArg(value: string): string {
  return value.replace(/["\\]/g, "");
}
