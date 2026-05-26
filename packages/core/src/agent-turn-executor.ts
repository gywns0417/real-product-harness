import { buildAiChatPrompt, generateAiText } from "./ai";
import { loadRuntimeActionApprovals } from "./agent-action-approvals";
import { activeCustomAgentExecutionProfile, renderActiveCustomAgentPrompt } from "./agent-catalog";
import { renderAgentRoleContractCatalog } from "./agent-role-contracts";
import { READ_ONLY_AGENT_TOOLS, renderReadOnlyAgentToolCatalog, runAgentFabricTool } from "./agent-tool-fabric";
import { assembleAgentContext, renderAgentContextBundle } from "./context-assembler";
import { loadState } from "./project";
import { loadRuntimeSession, recordAgentTurnState } from "./agent-runtime";
import { nowIso } from "./time";
import { WORKFLOW_STAGES, nextStage, workflowAdvanceStatus } from "./workflow";
import {
  AgentExecutionProfileRef,
  AgentHandoffProposal,
  AgentToolCall,
  AgentToolName,
  AgentTurnAction,
  AgentTurnState,
  AiChatMessage,
  AiGenerationResult,
  HarnessConfig
} from "./types";

const MAX_AGENT_TOOL_STEPS = 3;

const READ_ONLY_TOOLS: AgentToolName[] = READ_ONLY_AGENT_TOOLS.map((tool) => tool.name);

export interface AgentTurnExecutorInput {
  projectRoot: string;
  sessionId: string;
  userInput: string;
  config: HarnessConfig;
  history?: AiChatMessage[];
  system?: string;
  executionProfile?: AgentExecutionProfileRef;
  maxOutputTokens?: number;
  env?: NodeJS.ProcessEnv;
}

export interface AgentTurnExecutorResult {
  text: string;
  result: AiGenerationResult;
  prompt: string;
  turn: AgentTurnState;
}

export async function executeAgentTurn(input: AgentTurnExecutorInput): Promise<AgentTurnExecutorResult> {
  const startedAt = nowIso();
  const executionProfile = input.executionProfile ?? activeCustomAgentExecutionProfile(input.projectRoot);
  const turn: AgentTurnState = {
    id: `agent_turn_${Date.now()}`,
    userInput: input.userInput,
    status: "running",
    startedAt,
    updatedAt: startedAt,
    executionProfile,
    toolCalls: []
  };
  recordAgentTurnState(input.projectRoot, input.sessionId, turn);

  try {
    const context = agentTurnContext(input.projectRoot);
    const prompt = buildAgentTurnPrompt(input.projectRoot, input.userInput, input.history ?? [], context, executionProfile);
    turn.promptPreview = preview(prompt);
    recordAgentTurnState(input.projectRoot, input.sessionId, turn);

    let currentPrompt = prompt;
    let result: AiGenerationResult | null = null;
    for (let step = 0; step <= MAX_AGENT_TOOL_STEPS; step += 1) {
      result = await generateAiText(input.config, {
        prompt: currentPrompt,
        system: input.system ?? agentTurnSystemPrompt(),
        executionProfile,
        maxOutputTokens: input.maxOutputTokens ?? 1800,
        temperature: 0
      }, input.env);
      const parsed = await parseOrRepairAction(input, currentPrompt, result, executionProfile);
      const action = parsed.action;
      if (!action) {
        return completeTurn(input.projectRoot, input.sessionId, turn, result, result.text, prompt);
      }
      if (action.type !== "tool_call") {
        return completeAgentAction(input.projectRoot, input.sessionId, turn, result, action, prompt);
      }
      if (!action.tool) {
        throw new Error("tool_call action requires action.tool");
      }
      if (turn.toolCalls.length >= MAX_AGENT_TOOL_STEPS) {
        throw new Error(`agent tool call limit reached (${MAX_AGENT_TOOL_STEPS})`);
      }
      const toolCall = await executeReadOnlyTool(input, turn.id, turn.toolCalls.length + 1, action.tool, action.args ?? {});
      turn.toolCalls = [...turn.toolCalls, toolCall];
      turn.updatedAt = nowIso();
      recordAgentTurnState(input.projectRoot, input.sessionId, turn);
      currentPrompt = buildObservationPrompt(prompt, turn.toolCalls);
    }
    throw new Error("agent turn loop exited without final action");
  } catch (error) {
    turn.status = "failed";
    turn.error = error instanceof Error ? error.message : String(error);
    turn.updatedAt = nowIso();
    recordAgentTurnState(input.projectRoot, input.sessionId, turn);
    throw error;
  }
}

async function parseOrRepairAction(
  input: AgentTurnExecutorInput,
  prompt: string,
  result: AiGenerationResult,
  executionProfile?: AgentExecutionProfileRef
): Promise<ParsedAgentTurnAction> {
  let parsed = parseAgentTurnAction(result.text);
  if (!parsed.error) {
    return parsed;
  }
  const repaired = await generateAiText(input.config, {
    prompt: buildActionRepairPrompt(prompt, result.text, parsed.error),
    system: input.system ?? agentTurnSystemPrompt(),
    executionProfile,
    maxOutputTokens: input.maxOutputTokens ?? 1800,
    temperature: 0
  }, input.env);
  parsed = parseAgentTurnAction(repaired.text);
  if (parsed.error) {
    throw new Error(`invalid agent action after repair: ${parsed.error}`);
  }
  return parsed;
}

function completeAgentAction(
  projectRoot: string,
  sessionId: string,
  turn: AgentTurnState,
  result: AiGenerationResult,
  action: AgentTurnAction,
  prompt: string
): AgentTurnExecutorResult {
  if (action.type === "command") {
    const command = action.command?.trim();
    if (!command) {
      throw new Error("command action requires action.command");
    }
    turn.proposedCommand = {
      command,
      safeToAutoRun: action.safeToAutoRun === true,
      reason: action.reason
    };
    return completeTurn(
      projectRoot,
      sessionId,
      turn,
      result,
      action.message ?? `agent command proposal: ${command}`,
      prompt
    );
  }
  if (action.type === "handoff") {
    const handoff = normalizeHandoff(action.handoff);
    turn.proposedHandoff = handoff;
    return completeTurn(
      projectRoot,
      sessionId,
      turn,
      result,
      action.message ?? `agent handoff proposal: ${handoff.toAgent} ${handoff.stage ?? ""}`.trim(),
      prompt
    );
  }
  return completeTurn(
    projectRoot,
    sessionId,
    turn,
    result,
    action.message ?? result.text,
    prompt,
    action.type === "wait"
  );
}

function completeTurn(
  projectRoot: string,
  sessionId: string,
  turn: AgentTurnState,
  result: AiGenerationResult,
  finalText: string,
  prompt: string,
  waiting = false
): AgentTurnExecutorResult {
  turn.status = waiting ? "waiting" : "complete";
  turn.finalResponse = finalText.trim();
  turn.providerId = result.providerId;
  turn.model = result.model;
  turn.providerAttempts = result.providerAttempts;
  turn.providerFallback = result.providerFallback;
  turn.updatedAt = nowIso();
  recordAgentTurnState(projectRoot, sessionId, turn);
  return {
    text: turn.finalResponse,
    result: { ...result, text: turn.finalResponse },
    prompt,
    turn
  };
}

function buildAgentTurnPrompt(projectRoot: string, userInput: string, history: AiChatMessage[], context: string, executionProfile?: AgentExecutionProfileRef): string {
  return [
    buildAiChatPrompt(userInput, history, context),
    "",
    "Agent turn contract:",
    "Return JSON when you need harness context, workflow state, command proposal, wait, or handoff.",
    'Schema: {"assistant_text":"short text","action":{"type":"respond|tool_call|wait|command|handoff","tool":"tool.name","args":{},"message":"final user-facing text","command":"/status","safeToAutoRun":false,"reason":"why","handoff":{"toAgent":"PM","summary":"handoff brief","stage":"PM_PRODUCT_DEFINITION_DRAFT","artifactRefs":["document:product-definition"],"acceptanceCriteria":["..."],"blockers":[],"nextCommand":"/pm draft product-definition --ai"}}}',
    "Role contracts:",
    renderAgentRoleContractCatalog(),
    "Custom TOML execution profile:",
    renderAgentExecutionProfilePrompt(projectRoot, executionProfile),
    "Read-only tools:",
    renderReadOnlyAgentToolCatalog(),
    "Use tools until grounded, then respond, wait, propose a command, or propose a handoff.",
    "For external live writes such as /notion setup --live, /notion sync --live, /github create-repo, or /github setup-labels, propose a command action. The runtime will create an explicit external action approval request instead of auto-running it.",
    "Do not mark mutating commands safeToAutoRun unless they are read-only inspection commands such as /status or /next."
  ].join("\n");
}

function renderAgentExecutionProfilePrompt(projectRoot: string, executionProfile?: AgentExecutionProfileRef): string {
  if (!executionProfile) {
    return renderActiveCustomAgentPrompt(projectRoot);
  }
  return [
    `${executionProfile.name}: ${executionProfile.binding ? `bound ${executionProfile.binding.id}` : "active project default"}`,
    `model: ${executionProfile.model ?? "unspecified"} reasoning=${executionProfile.modelReasoningEffort ?? "unspecified"} sandbox=${executionProfile.sandboxMode ?? "unspecified"}`,
    executionProfile.binding
      ? `Binding scope: role=${executionProfile.binding.role ?? "*"} stage=${executionProfile.binding.stage ?? "*"}`
      : undefined,
    "Instructions from imported local TOML. These guide style and role behavior, but they do not override RPH approval gates, command policy, or external-write safety:",
    executionProfile.developerInstructions?.trim() ?? "none"
  ].filter((line): line is string => Boolean(line)).join("\n");
}

function buildObservationPrompt(originalPrompt: string, toolCalls: AgentToolCall[]): string {
  return [
    originalPrompt,
    "",
    "Tool observations:",
    JSON.stringify(toolCalls.map((toolCall) => ({
      tool: toolCall.name,
      status: toolCall.status,
      observation: toolCall.observation,
      error: toolCall.error
    })), null, 2),
    "",
    `You may request another read-only tool if essential. Remaining tool calls: ${Math.max(0, MAX_AGENT_TOOL_STEPS - toolCalls.length)}.`,
    "Otherwise return final JSON with action.type respond, command, wait, or handoff."
  ].join("\n");
}

function buildActionRepairPrompt(originalPrompt: string, previousText: string, error: string): string {
  return [
    originalPrompt,
    "",
    "Your previous response looked like an agent action JSON object but failed validation.",
    `Validation error: ${error}`,
    "Previous response:",
    previousText.slice(0, 2000),
    "",
    "Return only valid JSON that follows the agent turn contract, or return normal plain text if no action is needed."
  ].join("\n");
}

interface ParsedAgentTurnAction {
  action: AgentTurnAction | null;
  error?: string;
}

function parseAgentTurnAction(text: string): ParsedAgentTurnAction {
  const json = extractJson(text);
  if (!json) {
    return { action: null };
  }
  try {
    const parsed = JSON.parse(json) as { action?: AgentTurnAction; assistant_text?: string };
    if (!parsed.action?.type) {
      return { action: null, error: "missing action.type" };
    }
    if (!["respond", "tool_call", "wait", "command", "handoff"].includes(parsed.action.type)) {
      return { action: null, error: `unsupported action.type: ${String(parsed.action.type)}` };
    }
    if (parsed.action.type === "tool_call" && !parsed.action.tool) {
      return { action: null, error: "tool_call action requires action.tool" };
    }
    if (parsed.action.type === "command" && !parsed.action.command) {
      return { action: null, error: "command action requires action.command" };
    }
    if (parsed.action.type === "handoff" && !parsed.action.handoff?.toAgent) {
      return { action: null, error: "handoff action requires action.handoff.toAgent" };
    }
    return {
      action: {
        ...parsed.action,
        message: parsed.action.message ?? parsed.assistant_text
      }
    };
  } catch (error) {
    return { action: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function extractJson(text: string): string | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) {
    return fenced[1].trim();
  }
  if (trimmed.startsWith("{")) {
    return trimmed;
  }
  return findFirstJsonObject(trimmed);
}

function findFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) {
    return null;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }
  return text.slice(start);
}

async function executeReadOnlyTool(
  input: AgentTurnExecutorInput,
  turnId: string,
  sequence: number,
  name: string,
  args: Record<string, unknown>
): Promise<AgentToolCall> {
  const requestedAt = nowIso();
  const call: AgentToolCall = {
    id: `${turnId}_tool_${sequence}_${Date.now()}`,
    name,
    args,
    status: "requested",
    requestedAt
  };
  try {
    call.observation = await runReadOnlyTool(input, name, args);
    call.status = "succeeded";
  } catch (error) {
    call.status = "failed";
    call.error = error instanceof Error ? error.message : String(error);
  }
  call.completedAt = nowIso();
  return call;
}

async function runReadOnlyTool(input: AgentTurnExecutorInput, name: string, args: Record<string, unknown> = {}): Promise<string> {
  const fabricObservation = await runAgentFabricTool({
    projectRoot: input.projectRoot,
    config: input.config,
    env: input.env ?? process.env,
    name,
    args
  });
  if (fabricObservation !== null) {
    return fabricObservation;
  }
  const projectRoot = input.projectRoot;
  switch (name) {
    case "runtime.get_context":
      return agentTurnContext(projectRoot);
    case "workflow.get_status": {
      const state = loadState(projectRoot);
      const manifest = loadRuntimeSession(projectRoot);
      return JSON.stringify({
        stage: state.currentStage,
        paused: state.paused,
        ownerAgent: WORKFLOW_STAGES[state.currentStage].ownerAgent,
        pendingAction: manifest?.pendingAction ?? null,
        waitCondition: manifest?.waitCondition ?? null,
        blocker: manifest?.blocker ?? null
      }, null, 2);
    }
    case "workflow.get_next": {
      const state = loadState(projectRoot);
      const next = nextStage(state);
      return JSON.stringify({
        currentStage: state.currentStage,
        nextStage: next,
        nextOwnerAgent: next ? WORKFLOW_STAGES[next].ownerAgent : null,
        nextStageName: next ? WORKFLOW_STAGES[next].name : null
      }, null, 2);
    }
    case "workflow.can_advance": {
      const state = loadState(projectRoot);
      const advance = workflowAdvanceStatus(state);
      return JSON.stringify({
        currentStage: state.currentStage,
        currentStageName: WORKFLOW_STAGES[state.currentStage].name,
        ownerAgent: WORKFLOW_STAGES[state.currentStage].ownerAgent,
        nextStage: advance.nextStage,
        nextCommand: advance.nextCommand,
        canAdvance: advance.canAdvance,
        blockers: advance.reasons,
        waitCondition: loadRuntimeSession(projectRoot)?.waitCondition ?? null
      }, null, 2);
    }
    case "artifacts.list": {
      const context = assembleAgentContext(projectRoot, { includeBodies: false });
      return JSON.stringify({
        documents: context.documents.map((artifact) => summarizeArtifact(artifact)),
        designArtifacts: context.designArtifacts.map((artifact) => summarizeArtifact(artifact))
      }, null, 2);
    }
    case "artifacts.get": {
      const artifactId = stringArg(args.id ?? args.artifactId ?? args.docId);
      if (!artifactId) {
        throw new Error("artifacts.get requires args.id");
      }
      const context = assembleAgentContext(projectRoot, { includeBodies: true, maxBodyChars: 7000 });
      const artifact = [...context.documents, ...context.designArtifacts].find((item) =>
        item.id === artifactId || `${item.kind}:${item.id}` === artifactId
      );
      if (!artifact) {
        throw new Error(`artifact not found: ${artifactId}`);
      }
      return JSON.stringify(artifact, null, 2);
    }
    case "approvals.pending": {
      const context = assembleAgentContext(projectRoot, { includeBodies: false });
      const state = loadState(projectRoot);
      const stage = WORKFLOW_STAGES[state.currentStage];
      const documents = stage.requiredApprovals
        .filter((docId) => !context.documents.some((artifact) => artifact.id === docId && artifact.approvedVersion))
        .map((docId) => ({ kind: "document", id: docId }));
      const designArtifacts = stage.requiredDesignApprovals
        .filter((artifactId) => !context.designArtifacts.some((artifact) => artifact.id === artifactId && artifact.approvedVersion))
        .map((artifactId) => ({ kind: "design-artifact", id: artifactId }));
      return JSON.stringify({
        stage: state.currentStage,
        pending: [...documents, ...designArtifacts]
      }, null, 2);
    }
    case "actions.pending": {
      return JSON.stringify({
        pending: loadRuntimeActionApprovals(projectRoot).filter((record) =>
          record.status === "pending" || record.status === "approved" || record.status === "running" || record.status === "failed"
        )
      }, null, 2);
    }
    case "issues.list": {
      const context = assembleAgentContext(projectRoot, { includeBodies: false });
      return JSON.stringify(context.issues, null, 2);
    }
    case "prs.list": {
      const context = assembleAgentContext(projectRoot, { includeBodies: false });
      return JSON.stringify(context.pullRequests, null, 2);
    }
    case "qa.list": {
      const context = assembleAgentContext(projectRoot, { includeBodies: false });
      return JSON.stringify(context.qaReports, null, 2);
    }
    default:
      throw new Error(`unsupported agent tool: ${String(name)}`);
  }
}

function summarizeArtifact(artifact: ReturnType<typeof assembleAgentContext>["documents"][number]): Record<string, unknown> {
  return {
    kind: artifact.kind,
    id: artifact.id,
    title: artifact.title,
    status: artifact.status,
    currentVersion: artifact.currentVersion,
    approvedVersion: artifact.approvedVersion,
    selectedBodySource: artifact.selectedBodySource
  };
}

function stringArg(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeHandoff(handoff: AgentHandoffProposal | undefined): AgentHandoffProposal {
  if (!handoff?.toAgent) {
    throw new Error("handoff action requires action.handoff.toAgent");
  }
  return {
    ...handoff,
    summary: handoff.summary?.trim() || "agent handoff proposed"
  };
}

function agentTurnContext(projectRoot: string): string {
  try {
    return renderAgentContextBundle(assembleAgentContext(projectRoot, { includeBodies: true, maxBodyChars: 3500 }));
  } catch {
    return [
      "Runtime project context:",
      `- project_root: ${projectRoot}`,
      "- initialized: false",
      "- next_setup_command: /init --yes --project-name <name>"
    ].join("\n");
  }
}

function agentTurnSystemPrompt(): string {
  return [
    "You are the connected Real Product Harness AI agent inside a terminal runtime.",
    "Use the agent turn contract when you need read-only tools, command proposals, waits, or handoffs.",
    "Never claim a tool was run unless a tool observation is present.",
    "Never claim a command was executed unless the runtime reports it after this turn.",
    "Use Korean by default."
  ].join(" ");
}

function preview(text: string, max = 1200): string {
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}
