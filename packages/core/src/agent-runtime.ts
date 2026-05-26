import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseCli, parseCommandLine } from "./commands";
import { loadRuntimeActionApprovals } from "./agent-action-approvals";
import { loadAgentLaneRuns } from "./agent-lane-runner";
import { agentRoleContract } from "./agent-role-contracts";
import { appendText, readJsonIfExists, writeJson } from "./fs";
import {
  runtimeExecutionGraphFile,
  runtimeHandoffsFile,
  runtimeSessionFile,
  runtimeSessionJournalFile,
  runtimeSessionsDir,
  runtimeSessionSnapshotFile
} from "./paths";
import { recordAgentTurnProofEvents } from "./proof-ledger";
import { extractProductIdea } from "./product-idea";
import { loadState } from "./project";
import {
  acceptanceCriteriaForWorkflowStage,
  artifactRefsForWorkflowStage,
  blockersForWorkflowStage,
  commandForWorkflowStage,
  ownerForWorkflowStage,
  WORKFLOW_STAGES
} from "./workflow";
import {
  AgentActionPlan,
  AgentToolCall,
  AgentTurnState,
  HandoffPacket,
  AgentLaneRunRecord,
  ProjectState,
  RuntimeExecutionGraph,
  RuntimeExecutionGraphEdge,
  RuntimeExecutionGraphNode,
  RuntimeHandoffRecord,
  RuntimeSessionJournalRecord,
  RuntimeSessionEvent,
  RuntimeSessionManifest,
  RuntimeSessionStage,
  StageQueueEntry,
  WaitCondition,
  WorkflowStageId
} from "./types";

const DEFAULT_HANDOFF_LEASE_MS = 10 * 60 * 1000;
const DEFAULT_HANDOFF_MAX_ATTEMPTS = 3;
const RUNTIME_HANDOFF_LOCK_STALE_MS = 30_000;

export interface RuntimeHandoffExecutionToken {
  workerId: string;
  workerSessionId: string;
  attempt: number;
  claimToken: string;
  laneRunId?: string;
  poolId?: string;
  slotId?: string;
  slotIndex?: number;
}

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
  lastPresentedIntentId?: string | null;
  pendingInput?: string;
  checkpoint?: string | null;
  blocker?: string | null;
  handoffPacket?: HandoffPacket | null;
  pendingExternalActionId?: string | null;
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
    lastPresentedIntentId: null,
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
    pendingExternalActionId: null,
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
  try {
    const current = readJsonIfExists<RuntimeSessionManifest | null>(runtimeSessionFile(projectRoot), null);
    return current ? normalizeRuntimeSession(projectRoot, current) : loadRuntimeSessionRecoveryCandidate(projectRoot);
  } catch {
    return loadRuntimeSessionRecoveryCandidate(projectRoot);
  }
}

export function saveRuntimeSession(projectRoot: string, manifest: RuntimeSessionManifest): RuntimeSessionManifest {
  const next = normalizeRuntimeSession(projectRoot, {
    ...manifest,
    updatedAt: new Date().toISOString()
  }, { useGraphAuthority: false });
  writeJson(runtimeSessionFile(projectRoot), next);
  writeJson(runtimeSessionSnapshotFile(projectRoot, next.sessionId), next);
  appendRuntimeSessionJournalRecord(projectRoot, next);
  persistRuntimeExecutionGraphSnapshot(projectRoot, next);
  return next;
}

export function loadRuntimeExecutionGraph(projectRoot: string): RuntimeExecutionGraph | null {
  return readJsonIfExists<RuntimeExecutionGraph | null>(runtimeExecutionGraphFile(projectRoot), null);
}

function loadRuntimeExecutionGraphForSession(projectRoot: string, sessionId: string): RuntimeExecutionGraph | null {
  try {
    const graph = loadRuntimeExecutionGraph(projectRoot);
    if (!graph || graph.version !== 1 || graph.sessionId !== sessionId || graph.source !== "runtime-execution-graph") {
      return null;
    }
    return graph;
  } catch {
    return null;
  }
}

export function materializeRuntimeExecutionGraph(
  projectRoot: string,
  session: RuntimeSessionManifest | null = loadRuntimeSession(projectRoot)
): RuntimeExecutionGraph | null {
  if (!session) {
    return null;
  }
  const graph = buildRuntimeExecutionGraph(projectRoot, session);
  writeJson(runtimeExecutionGraphFile(projectRoot), graph);
  return graph;
}

export function buildRuntimeExecutionGraph(
  projectRoot: string,
  session: RuntimeSessionManifest
): RuntimeExecutionGraph {
  const queue = session.stageQueue ?? [];
  const nodes = queue.map((entry) => runtimeExecutionGraphNode(entry));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = runtimeExecutionGraphEdges(queue, nodeIds);
  const generatedAt = new Date().toISOString();
  return {
    version: 1,
    graphId: `graph:${session.sessionId}`,
    sessionId: session.sessionId,
    source: "runtime-execution-graph",
    projectRoot,
    currentStage: session.stage,
    status: session.status,
    generatedAt,
    updatedAt: generatedAt,
    queueFingerprint: runtimeExecutionGraphFingerprint(queue),
    summary: runtimeExecutionGraphSummary(nodes, edges),
    nodes,
    edges
  };
}

function persistRuntimeExecutionGraphSnapshot(projectRoot: string, session: RuntimeSessionManifest | null): void {
  if (!session) {
    return;
  }
  writeJson(runtimeExecutionGraphFile(projectRoot), buildRuntimeExecutionGraph(projectRoot, session));
}

function runtimeExecutionGraphNode(entry: StageQueueEntry): RuntimeExecutionGraphNode {
  return {
    id: entry.id,
    stage: entry.stage,
    name: entry.name,
    ownerAgent: entry.ownerAgent,
    status: entry.status,
    nodeType: entry.nodeType,
    reason: entry.reason,
    joinCondition: entry.joinCondition,
    prerequisites: entry.prerequisites,
    nextStages: entry.nextStages,
    nextCommand: entry.nextCommand,
    blockers: entry.blockers,
    requiredDocuments: entry.requiredDocuments,
    requiredApprovals: entry.requiredApprovals,
    requiredDesignArtifacts: entry.requiredDesignArtifacts,
    requiredDesignApprovals: entry.requiredDesignApprovals,
    handoffIds: entry.handoffIds ?? [],
    laneRunIds: entry.laneRunIds ?? [],
    fanIn: entry.fanIn
  };
}

function runtimeExecutionGraphEdges(
  queue: StageQueueEntry[],
  nodeIds: Set<string>
): RuntimeExecutionGraphEdge[] {
  const edges: RuntimeExecutionGraphEdge[] = [];
  const byStage = new Map(queue.map((entry) => [entry.stage, entry]));
  const seen = new Set<string>();
  for (const entry of queue) {
    for (const nextStageId of entry.nextStages) {
      const target = byStage.get(nextStageId);
      if (!target || !nodeIds.has(target.id)) {
        continue;
      }
      const edge = runtimeExecutionGraphEdge(entry, target, "workflow-next");
      if (!seen.has(edge.id)) {
        edges.push(edge);
        seen.add(edge.id);
      }
    }
    for (const prerequisiteId of entry.prerequisites) {
      const source = byStage.get(prerequisiteId);
      if (!source || !nodeIds.has(source.id)) {
        continue;
      }
      const edge = runtimeExecutionGraphEdge(source, entry, "prerequisite");
      if (!seen.has(edge.id)) {
        edges.push(edge);
        seen.add(edge.id);
      }
    }
  }
  return edges;
}

function runtimeExecutionGraphEdge(
  from: StageQueueEntry,
  to: StageQueueEntry,
  kind: RuntimeExecutionGraphEdge["kind"]
): RuntimeExecutionGraphEdge {
  const status: RuntimeExecutionGraphEdge["status"] = from.status === "completed"
    ? "satisfied"
    : to.blockers.length > 0
      ? "blocked"
      : "open";
  return {
    id: `${kind}:${from.stage}->${to.stage}`,
    from: from.id,
    to: to.id,
    kind,
    status,
    reason: status === "blocked" ? to.blockers.join("; ") : undefined
  };
}

function runtimeExecutionGraphSummary(
  nodes: RuntimeExecutionGraphNode[],
  edges: RuntimeExecutionGraphEdge[]
): RuntimeExecutionGraph["summary"] {
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    activeNodeIds: graphNodeIdsByStatus(nodes, "active"),
    readyNodeIds: graphNodeIdsByStatus(nodes, "ready"),
    pendingNodeIds: graphNodeIdsByStatus(nodes, "pending"),
    blockedNodeIds: graphNodeIdsByStatus(nodes, "blocked"),
    completedNodeIds: graphNodeIdsByStatus(nodes, "completed"),
    fanInNodeIds: nodes.filter((node) => node.nodeType === "fan-in").map((node) => node.id),
    fanOutNodeIds: nodes.filter((node) => node.nodeType === "fan-out").map((node) => node.id),
    blockerCount: nodes.reduce((total, node) => total + node.blockers.length, 0),
    handoffCount: uniqueStrings(nodes.flatMap((node) => node.handoffIds)).length,
    laneRunCount: uniqueStrings(nodes.flatMap((node) => node.laneRunIds)).length
  };
}

function graphNodeIdsByStatus(
  nodes: RuntimeExecutionGraphNode[],
  status: RuntimeExecutionGraphNode["status"]
): string[] {
  return nodes.filter((node) => node.status === status).map((node) => node.id);
}

function runtimeExecutionGraphFingerprint(queue: StageQueueEntry[]): string {
  return JSON.stringify(queue.map((entry) => ({
    id: entry.id,
    stage: entry.stage,
    status: entry.status,
    nodeType: entry.nodeType,
    blockers: entry.blockers,
    handoffIds: entry.handoffIds ?? [],
    laneRunIds: entry.laneRunIds ?? [],
    fanIn: entry.fanIn
  })));
}

function stageQueueFromRuntimeExecutionGraph(graph: RuntimeExecutionGraph | null): StageQueueEntry[] | undefined {
  if (!graph || graph.nodes.length === 0) {
    return undefined;
  }
  const seen = new Set<WorkflowStageId>();
  const entries: StageQueueEntry[] = [];
  for (const node of graph.nodes) {
    const workflowStage = WORKFLOW_STAGES[node.stage];
    if (!workflowStage || seen.has(node.stage)) {
      continue;
    }
    seen.add(node.stage);
    entries.push({
      id: node.id || `stage:${node.stage}`,
      stage: node.stage,
      name: node.name || workflowStage.name,
      ownerAgent: node.ownerAgent || workflowStage.ownerAgent,
      status: node.status,
      nodeType: node.nodeType || stageNodeType(node.stage),
      reason: node.reason || "runtime execution graph node projected into stage queue",
      joinCondition: node.joinCondition,
      prerequisites: node.prerequisites ?? workflowStage.prerequisites,
      requiredDocuments: node.requiredDocuments ?? workflowStage.requiredDocuments,
      requiredApprovals: node.requiredApprovals ?? workflowStage.requiredApprovals,
      requiredDesignArtifacts: node.requiredDesignArtifacts ?? workflowStage.requiredDesignArtifacts,
      requiredDesignApprovals: node.requiredDesignApprovals ?? workflowStage.requiredDesignApprovals,
      nextStages: node.nextStages ?? workflowStage.nextStages,
      nextCommand: node.nextCommand ?? commandForStage(node.stage),
      blockers: node.blockers ?? [],
      handoffIds: node.handoffIds,
      laneRunIds: node.laneRunIds,
      fanIn: node.fanIn
    });
  }
  return entries.length > 0 ? entries : undefined;
}

function runtimeExecutionGraphHasLifecycleLedger(graph: RuntimeExecutionGraph): boolean {
  return graph.nodes.some((node) => node.status === "completed" || node.status === "pending" || Boolean(node.handoffIds.length || node.laneRunIds.length || node.fanIn));
}

export function loadRuntimeSessionJournal(projectRoot: string, sessionId: string): RuntimeSessionJournalRecord[] {
  const filePath = runtimeSessionJournalFile(projectRoot, sessionId);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      try {
        const record = JSON.parse(line) as RuntimeSessionJournalRecord;
        return normalizeRuntimeSessionJournalRecord(projectRoot, record);
      } catch {
        return [];
      }
    });
}

export function latestRuntimeSessionJournalRecord(
  projectRoot: string,
  sessionId: string
): RuntimeSessionJournalRecord | null {
  const records = loadRuntimeSessionJournal(projectRoot, sessionId);
  return records[records.length - 1] ?? null;
}

export function replayRuntimeSession(projectRoot: string, sessionId: string): RuntimeSessionManifest | null {
  const latest = latestRuntimeSessionJournalRecord(projectRoot, sessionId);
  return latest ? normalizeRuntimeSession(projectRoot, latest.manifest) : null;
}

export function ensureRuntimeSession(projectRoot: string, sessionId: string): RuntimeSessionManifest {
  const current = loadRuntimeSession(projectRoot);
  if (current?.sessionId === sessionId && isContinuableRuntimeStatus(current.status)) {
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
  const blocker = input.blocker !== undefined ? input.blocker : current.blocker;
  const stageQueue = input.stage && input.stage !== current.stage && current.stage !== "UNINITIALIZED"
    ? advanceStageQueue(current.stageQueue ?? [], current.stage, input.stage)
    : current.stageQueue;
  const next: RuntimeSessionManifest = {
    ...current,
    status: input.status ?? nextRuntimeStatus(current.status, input.blocker),
    stage,
    ownerAgent: stageOwner(stage),
    pendingAction,
    lastPresentedIntentId: input.lastPresentedIntentId !== undefined
      ? input.lastPresentedIntentId
      : current.lastPresentedIntentId ?? null,
    checkpoint: input.checkpoint !== undefined ? input.checkpoint : current.checkpoint,
    blocker,
    retryCount,
    lastCommand: current.lastCommand,
    lastCommandOk: input.blocker ? false : current.lastCommandOk,
    stageQueue,
    handoffPacket: input.handoffPacket !== undefined
      ? input.handoffPacket
      : input.stage && input.stage !== current.stage
      ? createHandoffPacketBetween(current.stage, input.stage, state, current.handoffPacket)
      : current.handoffPacket,
    pendingExternalActionId: input.pendingExternalActionId !== undefined
      ? input.pendingExternalActionId
      : current.pendingExternalActionId ?? null,
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
    status: event.kind === "blocker" || event.ok === false ? "blocked" : current.status === "blocked" && event.ok === true ? "recovering" : current.status,
    stage: state?.currentStage ?? current.stage,
    ownerAgent: stageOwner(state?.currentStage ?? current.stage),
    pendingAction: event.plan ?? current.pendingAction,
    lastPresentedIntentId: current.lastPresentedIntentId ?? null,
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
  recordAgentTurnProofEvents(projectRoot, sessionId, turn);
  return saveRuntimeSession(projectRoot, {
    ...current,
    status: turn.status === "failed" ? "blocked" : current.status,
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

export function loadRuntimeHandoffs(projectRoot: string): RuntimeHandoffRecord[] {
  return normalizeRuntimeHandoffs(readJsonIfExists<RuntimeHandoffRecord[]>(runtimeHandoffsFile(projectRoot), []));
}

export function runtimeHandoffsReadIssue(projectRoot: string): string | null {
  const filePath = runtimeHandoffsFile(projectRoot);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    if (!fs.lstatSync(filePath).isFile()) {
      return "handoff file is not a regular file";
    }
    const records = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (!Array.isArray(records)) {
      return "handoff file is not an array";
    }
    const malformedIndex = records.findIndex((record) => !isRuntimeHandoffRecordShape(record));
    if (malformedIndex !== -1) {
      return `handoff file contains malformed record at index ${malformedIndex}`;
    }
    return null;
  } catch {
    return "handoff file is unreadable JSON";
  }
}

function isRuntimeHandoffRecordShape(record: unknown): record is RuntimeHandoffRecord {
  if (!record || typeof record !== "object") {
    return false;
  }
  const candidate = record as Partial<RuntimeHandoffRecord>;
  const packet = candidate.packet as Partial<HandoffPacket> | undefined;
  if (!packet) {
    return false;
  }
  return typeof candidate.id === "string"
    && typeof candidate.sessionId === "string"
    && typeof candidate.status === "string"
    && typeof candidate.createdAt === "string"
    && typeof candidate.updatedAt === "string"
    && typeof packet.fromAgent === "string"
    && typeof packet.toAgent === "string"
    && typeof packet.stage === "string"
    && Array.isArray(packet.artifactRefs)
    && Array.isArray(packet.acceptanceCriteria)
    && Array.isArray(packet.blockers);
}

export function recordRuntimeHandoff(
  projectRoot: string,
  sessionId: string,
  packet: HandoffPacket
): RuntimeHandoffRecord {
  const now = new Date().toISOString();
  const current = loadRuntimeHandoffs(projectRoot);
  const record: RuntimeHandoffRecord = {
    id: nextRuntimeHandoffId(current),
    sessionId,
    packet,
    status: "pending",
    attempts: 0,
    maxAttempts: DEFAULT_HANDOFF_MAX_ATTEMPTS,
    createdAt: now,
    updatedAt: now
  };
  writeJson(runtimeHandoffsFile(projectRoot), [...current, record]);
  return record;
}

export function materializeRuntimeHandoffsFromSession(
  projectRoot: string,
  session: RuntimeSessionManifest | null = loadRuntimeSession(projectRoot)
): RuntimeHandoffRecord[] {
  if (!session) {
    return [];
  }
  const activeSession = reconcileRuntimeStageQueue(projectRoot, session) ?? session;
  const candidates = materializableHandoffPackets(activeSession);
  if (candidates.length === 0) {
    return [];
  }
  const now = new Date().toISOString();
  let current = loadRuntimeHandoffs(projectRoot);
  const existingKeys = new Set(current.map((record) => runtimeHandoffDedupeKey(record.packet)));
  const created: RuntimeHandoffRecord[] = [];
  for (const packet of candidates) {
    const key = runtimeHandoffDedupeKey(packet);
    if (existingKeys.has(key)) {
      continue;
    }
    const record: RuntimeHandoffRecord = {
      id: nextRuntimeHandoffId([...current, ...created]),
      sessionId: session.sessionId,
      packet,
      status: "pending",
      attempts: 0,
      maxAttempts: DEFAULT_HANDOFF_MAX_ATTEMPTS,
      createdAt: now,
      updatedAt: now,
      note: "materialized from runtime session"
    };
    created.push(record);
    existingKeys.add(key);
  }
  if (created.length > 0) {
    current = [...current, ...created];
    writeJson(runtimeHandoffsFile(projectRoot), current);
    reconcileRuntimeStageQueue(projectRoot, activeSession);
  }
  return created;
}

export function reconcileRuntimeStageQueue(
  projectRoot: string,
  session: RuntimeSessionManifest | null = loadRuntimeSession(projectRoot)
): RuntimeSessionManifest | null {
  if (!session || !session.stageQueue || session.stageQueue.length === 0) {
    return session;
  }
  const state = safeLoadState(projectRoot);
  const handoffs = loadRuntimeHandoffs(projectRoot);
  const laneRuns = loadAgentLaneRuns(projectRoot);
  const queue = session.stageQueue.map((entry) => {
    const related = handoffs.filter((handoff) =>
      handoffMatchesStageQueueEntry(handoff, entry) &&
      !(entry.nodeType === "fan-in" && handoff.packet.resumeCursor === `fan-in:${entry.stage}`)
    );
    const handoffIds = related.map((handoff) => handoff.id);
    const laneRunIds = related.flatMap((handoff) => handoff.laneRunId ? [handoff.laneRunId] : []);
    const blockers = stageBlockers(state, entry.stage, entry.stage === session.stage);
    const deadLetters = related.filter((handoff) => handoff.status === "dead_letter" || handoff.status === "rejected");
    const pending = related.filter((handoff) => ["pending", "acknowledged", "claimed", "running"].includes(handoff.status));
    const completed = related.filter((handoff) => isAcceptedCompletedHandoff(handoff, laneRuns));
    const unmergedCompleted = related.filter((handoff) => handoff.status === "completed" && !isAcceptedCompletedHandoff(handoff, laneRuns));
    const extraBlockers = deadLetters.map((handoff) => `handoff ${handoff.id} ${handoff.status}: ${handoff.deadLetterReason ?? handoff.note ?? "no reason"}`);
    const mergeBlockers = unmergedCompleted.map((handoff) => `handoff ${handoff.id} completed without merged lane proof`);
    const nextBlockers = [...blockers, ...extraBlockers, ...mergeBlockers];
    let status = entry.status;
    let reason = entry.reason;
    if (entry.stage === session.stage || entry.stage === state?.currentStage) {
      status = "active";
      reason = entry.nodeType === "fan-out" ? "current workflow stage; can fan out to parallel next stages" : "current workflow stage";
    } else if (deadLetters.length > 0) {
      status = "blocked";
      reason = "runtime handoff failed before this queue node could complete";
    } else if (unmergedCompleted.length > 0) {
      status = "blocked";
      reason = "runtime handoff completion is waiting for merged lane proof";
    } else if (pending.length > 0) {
      status = "pending";
      reason = `runtime handoff pending: ${pending.map((handoff) => handoff.id).join(", ")}`;
    } else if (completed.length > 0) {
      status = "completed";
      reason = "completed by runtime lane handoff";
    } else if (entry.status === "completed") {
      status = "completed";
      reason = "completed queue item preserved from runtime ledger";
    } else {
      status = stageQueueStatus(false, nextBlockers);
      reason = stageQueueReason(session.stage === "UNINITIALIZED" ? entry.stage : session.stage, entry.stage, status, entry.nodeType, undefined);
    }
    return {
      ...entry,
      status,
      reason,
      blockers: nextBlockers,
      handoffIds: handoffIds.length > 0 ? handoffIds : undefined,
      laneRunIds: laneRunIds.length > 0 ? laneRunIds : undefined
    };
  });

  const queueWithFanIn = reconcileFanInReducerHandoffs(
    reconcileFanInEntries(queue, state, session),
    handoffs,
    laneRuns
  );
  if (JSON.stringify(queueWithFanIn) === JSON.stringify(session.stageQueue)) {
    persistRuntimeExecutionGraphSnapshot(projectRoot, session);
    return session;
  }
  return saveRuntimeSession(projectRoot, {
    ...session,
    stageQueue: queueWithFanIn,
    checkpoint: session.checkpoint ?? "runtime queue reconciled"
  });
}

function isAcceptedCompletedHandoff(handoff: RuntimeHandoffRecord, laneRuns: AgentLaneRunRecord[]): boolean {
  if (handoff.status !== "completed") {
    return false;
  }
  if (!handoff.laneRunId) {
    return false;
  }
  const laneRun = laneRuns.find((run) => run.id === handoff.laneRunId);
  return Boolean(
    laneRun &&
    laneRun.sessionId === handoff.sessionId &&
    laneRun.handoffId === handoff.id &&
    laneRun.stage === handoff.packet.stage &&
    laneRun.id === handoff.laneRunId &&
    laneRun.attempt === handoff.attempts &&
    laneRun.workerSessionId === handoff.workerSessionId &&
    laneRun.claimToken === handoff.claimToken &&
    laneRun.status === "completed" &&
    laneRun.exitOk === true &&
    laneRun.merge?.status === "merged"
  );
}

function handoffMatchesStageQueueEntry(handoff: RuntimeHandoffRecord, entry: StageQueueEntry): boolean {
  return handoff.packet.resumeCursor === `stage-queue:${entry.stage}`
    || handoff.packet.resumeCursor === `fan-in:${entry.stage}`
    || (handoff.packet.stage === entry.stage && Boolean(handoff.packet.resumeCursor?.startsWith("stage-queue:")));
}

function reconcileFanInEntries(
  queue: StageQueueEntry[],
  state: ProjectState | null,
  session: RuntimeSessionManifest
): StageQueueEntry[] {
  const byStage = new Map(queue.map((entry) => [entry.stage, entry]));
  return queue.map((entry) => {
    if (entry.nodeType !== "fan-in") {
      return { ...entry, fanIn: undefined };
    }
    const readyPrerequisites = entry.prerequisites.filter((stageId) =>
      fanInPrerequisiteSatisfied(stageId, byStage, session, state)
    );
    const pendingPrerequisites = entry.prerequisites.filter((stageId) => !readyPrerequisites.includes(stageId));
    const sourceHandoffIds = uniqueStrings(readyPrerequisites.flatMap((stageId) => byStage.get(stageId)?.handoffIds ?? []));
    const sourceLaneRunIds = uniqueStrings(readyPrerequisites.flatMap((stageId) => byStage.get(stageId)?.laneRunIds ?? []));
    const sourceArtifactRefs = uniqueStrings([
      ...artifactRefsForStage(entry.stage),
      ...readyPrerequisites.flatMap((stageId) => artifactRefsForStage(stageId))
    ]);
    const blockers = stageBlockers(state, entry.stage, entry.stage === session.stage);
    let reducerStatus: NonNullable<StageQueueEntry["fanIn"]>["reducerStatus"] = "waiting";
    let status = entry.status;
    let reason = entry.reason;
    if (entry.status === "completed") {
      reducerStatus = "complete";
    } else if (pendingPrerequisites.length > 0) {
      reducerStatus = "waiting";
      status = entry.status === "active" ? "active" : "blocked";
      reason = `fan-in reducer waiting for ${pendingPrerequisites.join(" + ")}`;
    } else if (blockers.length > 0) {
      reducerStatus = "blocked";
      status = entry.status === "active" ? "active" : "blocked";
      reason = `fan-in reducer blocked by required artifacts or approvals`;
    } else {
      reducerStatus = "ready";
      status = entry.status === "active" ? entry.status : "ready";
      reason = `fan-in reducer ready after ${readyPrerequisites.join(" + ")}`;
    }
    return {
      ...entry,
      status,
      reason,
      blockers,
      fanIn: {
        reducerStatus,
        readyPrerequisites,
        pendingPrerequisites,
        sourceHandoffIds,
        sourceLaneRunIds,
        sourceArtifactRefs,
        materializationKey: readyPrerequisites.length > 0
          ? fanInMaterializationKey(session.sessionId, entry.stage, readyPrerequisites, sourceLaneRunIds)
          : undefined,
        blockerSummary: blockers.length > 0 ? blockers.join("; ") : undefined
      }
    };
  });
}

function reconcileFanInReducerHandoffs(
  queue: StageQueueEntry[],
  handoffs: RuntimeHandoffRecord[],
  laneRuns: AgentLaneRunRecord[]
): StageQueueEntry[] {
  return queue.map((entry) => {
    if (entry.nodeType !== "fan-in") {
      return entry;
    }
    const related = handoffs.filter((handoff) =>
      handoff.packet.resumeCursor === `fan-in:${entry.stage}` &&
      fanInHandoffMatchesCurrentEpoch(handoff, entry)
    );
    if (related.length === 0) {
      return entry;
    }
    const deadLetters = related.filter((handoff) => handoff.status === "dead_letter" || handoff.status === "rejected");
    const pending = related.filter((handoff) => ["pending", "acknowledged", "claimed", "running"].includes(handoff.status));
    const completed = related.filter((handoff) => isAcceptedCompletedHandoff(handoff, laneRuns));
    const unmergedCompleted = related.filter((handoff) => handoff.status === "completed" && !isAcceptedCompletedHandoff(handoff, laneRuns));
    if (deadLetters.length > 0) {
      return {
        ...entry,
        status: "blocked",
        reason: "fan-in reducer handoff failed before this queue node could complete",
        blockers: [
          ...entry.blockers,
          ...deadLetters.map((handoff) => `fan-in handoff ${handoff.id} ${handoff.status}: ${handoff.deadLetterReason ?? handoff.note ?? "no reason"}`)
        ],
        handoffIds: uniqueStrings([...(entry.handoffIds ?? []), ...related.map((handoff) => handoff.id)])
      };
    }
    if (unmergedCompleted.length > 0) {
      return {
        ...entry,
        status: "blocked",
        reason: "fan-in reducer completion is waiting for merged lane proof",
        blockers: [
          ...entry.blockers,
          ...unmergedCompleted.map((handoff) => `fan-in handoff ${handoff.id} completed without merged lane proof`)
        ],
        handoffIds: uniqueStrings([...(entry.handoffIds ?? []), ...related.map((handoff) => handoff.id)])
      };
    }
    if (pending.length > 0) {
      return {
        ...entry,
        status: "pending",
        reason: `fan-in reducer pending: ${pending.map((handoff) => handoff.id).join(", ")}`,
        handoffIds: uniqueStrings([...(entry.handoffIds ?? []), ...related.map((handoff) => handoff.id)])
      };
    }
    if (completed.length > 0) {
      return {
        ...entry,
        status: "completed",
        reason: "completed by fan-in reducer handoff",
        handoffIds: uniqueStrings([...(entry.handoffIds ?? []), ...related.map((handoff) => handoff.id)]),
        laneRunIds: uniqueStrings([...(entry.laneRunIds ?? []), ...completed.flatMap((handoff) => handoff.laneRunId ? [handoff.laneRunId] : [])]),
        fanIn: entry.fanIn ? {
          ...entry.fanIn,
          reducerStatus: "complete"
        } : entry.fanIn
      };
    }
    return entry;
  });
}

function fanInHandoffMatchesCurrentEpoch(handoff: RuntimeHandoffRecord, entry: StageQueueEntry): boolean {
  if (entry.nodeType !== "fan-in" || handoff.packet.resumeCursor !== `fan-in:${entry.stage}`) {
    return true;
  }
  const currentKey = entry.fanIn?.materializationKey;
  const packetKey = handoff.packet.fanIn?.materializationKey;
  if (currentKey || packetKey) {
    return Boolean(currentKey && packetKey && currentKey === packetKey);
  }
  const currentLaneIds = entry.fanIn?.sourceLaneRunIds ?? [];
  const packetLaneIds = handoff.packet.fanIn?.sourceLaneRunIds ?? [];
  return sortedStringsEqual(currentLaneIds, packetLaneIds);
}

function fanInMaterializationKey(
  sessionId: string,
  stage: WorkflowStageId,
  readyPrerequisites: WorkflowStageId[],
  sourceLaneRunIds: string[]
): string {
  return [
    "fanin",
    sessionId,
    stage,
    [...readyPrerequisites].sort().join(","),
    [...sourceLaneRunIds].sort().join(",")
  ].join("|");
}

function fanInPrerequisiteSatisfied(
  stageId: WorkflowStageId,
  byStage: Map<WorkflowStageId, StageQueueEntry>,
  session: RuntimeSessionManifest,
  state: ProjectState | null
): boolean {
  const prerequisite = byStage.get(stageId);
  if (prerequisite?.status === "completed") {
    return true;
  }
  return Boolean(
    prerequisite &&
    prerequisite.stage === session.stage &&
    prerequisite.stage === state?.currentStage &&
    prerequisite.nodeType === "fan-out"
  );
}

function materializableHandoffPackets(session: RuntimeSessionManifest): HandoffPacket[] {
  const packets: HandoffPacket[] = [];
  if (isMaterializableHandoffPacket(session.handoffPacket)) {
    packets.push(session.handoffPacket);
  }
  for (const entry of session.stageQueue ?? []) {
    const packet = handoffPacketForQueueEntry(session, entry);
    if (packet) {
      packets.push(packet);
    }
  }
  const seen = new Set<string>();
  return packets.filter((packet) => {
    const key = runtimeHandoffDedupeKey(packet);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function handoffPacketForQueueEntry(
  session: RuntimeSessionManifest,
  entry: StageQueueEntry
): HandoffPacket | null {
  if (session.stage === "SETUP") {
    return null;
  }
  if (entry.nodeType === "fan-in") {
    return fanInHandoffPacketForQueueEntry(session, entry);
  }
  if (entry.status !== "ready" || !entry.nextCommand || entry.blockers.length > 0) {
    return null;
  }
  if (entry.ownerAgent === session.ownerAgent) {
    return null;
  }
  return {
    fromAgent: session.ownerAgent,
    toAgent: entry.ownerAgent,
    stage: entry.stage,
    summary: `${session.stage} -> ${entry.stage}: ${session.ownerAgent} handoff to ${entry.ownerAgent}`,
    roleContract: agentRoleContract(entry.ownerAgent),
    artifactRefs: artifactRefsForStage(entry.stage),
    acceptanceCriteria: acceptanceCriteriaForStage(entry.stage),
    blockers: [],
    nextCommand: entry.nextCommand,
    resumeCursor: `stage-queue:${entry.stage}`,
    createdAt: new Date().toISOString()
  };
}

function fanInHandoffPacketForQueueEntry(
  session: RuntimeSessionManifest,
  entry: StageQueueEntry
): HandoffPacket | null {
  if (
    entry.status !== "ready" ||
    entry.fanIn?.reducerStatus !== "ready" ||
    entry.blockers.length > 0 ||
    entry.fanIn.pendingPrerequisites.length > 0
  ) {
    return null;
  }
  const sourceLaneRunIds = entry.fanIn.sourceLaneRunIds ?? [];
  const sourceArtifactRefs = entry.fanIn.sourceArtifactRefs ?? artifactRefsForStage(entry.stage);
  return {
    fromAgent: session.ownerAgent,
    toAgent: entry.ownerAgent,
    stage: entry.stage,
    summary: `fan-in reducer for ${entry.stage}: ${entry.fanIn.readyPrerequisites.join(" + ")}`,
    roleContract: agentRoleContract(entry.ownerAgent),
    artifactRefs: sourceArtifactRefs,
    acceptanceCriteria: [
      `fan-in reducer confirms ${entry.fanIn.readyPrerequisites.join(" + ")} completed`,
      ...acceptanceCriteriaForStage(entry.stage)
    ],
    blockers: [],
    nextCommand: `/agent reduce ${entry.stage}`,
    resumeCursor: `fan-in:${entry.stage}`,
    fanIn: {
      reducerStage: entry.stage,
      sourceStages: entry.fanIn.readyPrerequisites,
      sourceHandoffIds: entry.fanIn.sourceHandoffIds ?? [],
      sourceLaneRunIds,
      sourceArtifactRefs,
      materializationKey: entry.fanIn.materializationKey
    },
    createdAt: new Date().toISOString()
  };
}

function isMaterializableHandoffPacket(packet: HandoffPacket | null | undefined): packet is HandoffPacket {
  return Boolean(packet?.nextCommand);
}

function runtimeHandoffDedupeKey(packet: HandoffPacket): string {
  return [
    packet.resumeCursor ?? `stage:${packet.stage}`,
    packet.fromAgent,
    packet.toAgent,
    packet.stage,
    packet.nextCommand ?? "",
    packet.fanIn?.materializationKey ?? packet.fanIn?.sourceLaneRunIds.join(",") ?? ""
  ].join("|");
}

function nextRuntimeHandoffId(records: RuntimeHandoffRecord[]): string {
  const base = `handoff-${Date.now()}`;
  const ids = new Set(records.map((record) => record.id));
  if (!ids.has(base)) {
    return base;
  }
  for (let index = 1; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!ids.has(candidate)) {
      return candidate;
    }
  }
  return `${base}-${records.length + 1}`;
}

export function acknowledgeRuntimeHandoff(
  projectRoot: string,
  id: string,
  note?: string
): RuntimeHandoffRecord {
  return updateRuntimeHandoff(projectRoot, id, "acknowledged", note);
}

export function runtimeHandoffExecutionToken(
  record: RuntimeHandoffRecord,
  laneRunId?: string
): RuntimeHandoffExecutionToken {
  if (!record.claimedBy || !record.workerSessionId || !record.attempts || !record.claimToken) {
    throw new Error(`handoff is not claimed with an execution token: ${record.id}`);
  }
  return {
    workerId: record.claimedBy,
    workerSessionId: record.workerSessionId,
    attempt: record.attempts,
    claimToken: record.claimToken,
    laneRunId,
    poolId: record.poolId,
    slotId: record.slotId,
    slotIndex: record.slotIndex
  };
}

export function completeRuntimeHandoff(
  projectRoot: string,
  id: string,
  note?: string
): RuntimeHandoffRecord {
  return mutateRuntimeHandoff(projectRoot, id, (record) => {
    if (record.claimToken && (record.status === "claimed" || record.status === "running")) {
      throw new Error(`handoff ${id} has an active claim token; use completeRuntimeHandoffAttempt`);
    }
    const now = new Date().toISOString();
    return {
      ...record,
      status: "completed",
      note,
      updatedAt: now,
      leaseExpiresAt: undefined,
      completedAt: now
    };
  });
}

export function completeRuntimeHandoffAttempt(
  projectRoot: string,
  id: string,
  token: RuntimeHandoffExecutionToken,
  note?: string,
  now = new Date()
): RuntimeHandoffRecord {
  return mutateRuntimeHandoff(projectRoot, id, (record) => {
    assertRuntimeHandoffExecution(record, token, { requireLaneRunId: true, allowedStatuses: ["running"] });
    return {
      ...record,
      status: "completed",
      note,
      updatedAt: now.toISOString(),
      leaseExpiresAt: undefined,
      completedAt: now.toISOString()
    };
  });
}

export function claimRuntimeHandoff(
  projectRoot: string,
  id: string,
  workerId: string,
  leaseMs = DEFAULT_HANDOFF_LEASE_MS,
  now = new Date(),
  ownership: { poolId?: string; slotId?: string; slotIndex?: number } = {}
): RuntimeHandoffRecord {
  return mutateRuntimeHandoff(projectRoot, id, (record) => {
    if (!isRuntimeHandoffClaimable(record, now)) {
      throw new Error(`handoff is not claimable: ${id} status=${record.status} lease=${record.leaseExpiresAt ?? "none"}`);
    }
    const attempts = (record.attempts ?? 0) + 1;
    if (attempts > (record.maxAttempts ?? DEFAULT_HANDOFF_MAX_ATTEMPTS)) {
      return deadLetterRuntimeHandoffRecord(record, `max attempts exceeded before claim by ${workerId}`, now);
    }
    return {
      ...record,
      status: "claimed",
      attempts,
      claimedBy: workerId,
      workerSessionId: `${workerId}:${record.sessionId}:${attempts}`,
      claimToken: randomUUID(),
      poolId: ownership.poolId,
      slotId: ownership.slotId,
      slotIndex: ownership.slotIndex,
      claimedAt: now.toISOString(),
      heartbeatAt: now.toISOString(),
      leaseExpiresAt: new Date(now.getTime() + leaseMs).toISOString(),
      laneRunId: undefined,
      updatedAt: now.toISOString(),
      note: `claimed by ${workerId}`
    };
  });
}

export function startRuntimeHandoffWork(
  projectRoot: string,
  id: string,
  token: RuntimeHandoffExecutionToken,
  laneRunId: string,
  leaseMs = DEFAULT_HANDOFF_LEASE_MS,
  now = new Date()
): RuntimeHandoffRecord {
  return mutateRuntimeHandoff(projectRoot, id, (record) => {
    assertRuntimeHandoffExecution(record, token, { allowedStatuses: ["claimed", "running"] });
    return {
      ...record,
      status: "running",
      laneRunId,
      heartbeatAt: now.toISOString(),
      leaseExpiresAt: new Date(now.getTime() + leaseMs).toISOString(),
      updatedAt: now.toISOString(),
      note: `running in lane ${laneRunId}`
    };
  });
}

export function heartbeatRuntimeHandoff(
  projectRoot: string,
  id: string,
  token: RuntimeHandoffExecutionToken,
  leaseMs = DEFAULT_HANDOFF_LEASE_MS,
  now = new Date()
): RuntimeHandoffRecord {
  return mutateRuntimeHandoff(projectRoot, id, (record) => {
    assertRuntimeHandoffExecution(record, token, { requireLaneRunId: Boolean(token.laneRunId), allowedStatuses: ["claimed", "running"] });
    return {
      ...record,
      heartbeatAt: now.toISOString(),
      leaseExpiresAt: new Date(now.getTime() + leaseMs).toISOString(),
      updatedAt: now.toISOString(),
      note: `heartbeat from ${token.workerId}`
    };
  });
}

export function failRuntimeHandoffAttempt(
  projectRoot: string,
  id: string,
  token: RuntimeHandoffExecutionToken,
  reason: string,
  now = new Date()
): RuntimeHandoffRecord {
  return mutateRuntimeHandoff(projectRoot, id, (record) => {
    assertRuntimeHandoffExecution(record, token, { requireLaneRunId: Boolean(token.laneRunId), allowedStatuses: ["claimed", "running"] });
    if ((record.attempts ?? 0) >= (record.maxAttempts ?? DEFAULT_HANDOFF_MAX_ATTEMPTS)) {
      return deadLetterRuntimeHandoffRecord(record, reason, now);
    }
    return {
      ...record,
      status: "pending",
      claimedBy: undefined,
      workerSessionId: undefined,
      claimToken: undefined,
      poolId: undefined,
      slotId: undefined,
      slotIndex: undefined,
      laneRunId: undefined,
      leaseExpiresAt: undefined,
      heartbeatAt: now.toISOString(),
      lastFailureAt: now.toISOString(),
      lastFailureReason: reason,
      updatedAt: now.toISOString(),
      note: `attempt failed: ${reason}`
    };
  });
}

export function deadLetterRuntimeHandoff(
  projectRoot: string,
  id: string,
  reason: string,
  now = new Date()
): RuntimeHandoffRecord {
  return mutateRuntimeHandoff(projectRoot, id, (record) => deadLetterRuntimeHandoffRecord(record, reason, now));
}

export function isRuntimeHandoffClaimable(record: RuntimeHandoffRecord, now = new Date()): boolean {
  if (record.status === "pending" || record.status === "acknowledged") {
    return true;
  }
  if (record.status !== "claimed" && record.status !== "running") {
    return false;
  }
  return Boolean(record.leaseExpiresAt && Date.parse(record.leaseExpiresAt) <= now.getTime());
}

function updateRuntimeHandoff(
  projectRoot: string,
  id: string,
  status: RuntimeHandoffRecord["status"],
  note?: string
): RuntimeHandoffRecord {
  return mutateRuntimeHandoff(projectRoot, id, (record) => {
    const now = new Date().toISOString();
    return {
      ...record,
      status,
      note,
      updatedAt: now,
      leaseExpiresAt: status === "completed" || status === "rejected" ? undefined : record.leaseExpiresAt,
      acknowledgedAt: status === "acknowledged" ? now : record.acknowledgedAt,
      completedAt: status === "completed" ? now : record.completedAt,
      rejectedAt: status === "rejected" ? now : record.rejectedAt
    };
  });
}

function findRuntimeHandoff(records: RuntimeHandoffRecord[], id: string): RuntimeHandoffRecord {
  const record = records.find((item) => item.id === id);
  if (!record) {
    throw new Error(`handoff not found: ${id}`);
  }
  return record;
}

function replaceRuntimeHandoff(
  projectRoot: string,
  current: RuntimeHandoffRecord[],
  next: RuntimeHandoffRecord
): RuntimeHandoffRecord {
  return mutateRuntimeHandoff(projectRoot, next.id, () => next, current);
}

function mutateRuntimeHandoff(
  projectRoot: string,
  id: string,
  mutate: (record: RuntimeHandoffRecord, records: RuntimeHandoffRecord[]) => RuntimeHandoffRecord,
  fallbackRecords?: RuntimeHandoffRecord[]
): RuntimeHandoffRecord {
  return withRuntimeHandoffLock(projectRoot, () => {
    const latest = normalizeRuntimeHandoffs(readJsonIfExists<RuntimeHandoffRecord[]>(runtimeHandoffsFile(projectRoot), fallbackRecords ?? []));
    const index = latest.findIndex((record) => record.id === id);
    if (index === -1) {
      throw new Error(`handoff not found: ${id}`);
    }
    const next = mutate(latest[index], latest);
    const all = [...latest];
    all[index] = next;
    writeJson(runtimeHandoffsFile(projectRoot), all);
    persistRuntimeExecutionGraphSnapshot(projectRoot, loadRuntimeSession(projectRoot));
    return next;
  });
}

function withRuntimeHandoffLock<T>(projectRoot: string, fn: () => T): T {
  const lockPath = `${runtimeHandoffsFile(projectRoot)}.lock`;
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const startedAt = Date.now();
  let fd: number | undefined;
  while (fd === undefined) {
    try {
      fd = fs.openSync(lockPath, "wx", 0o600);
      fs.writeFileSync(fd, JSON.stringify({
        pid: process.pid,
        createdAt: new Date().toISOString()
      }));
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
      if (code === "EEXIST" && isStaleRuntimeHandoffLock(lockPath)) {
        fs.rmSync(lockPath, { force: true });
        continue;
      }
      if (code !== "EEXIST" || Date.now() - startedAt > 5000) {
        throw error;
      }
      sleepSync(10);
    }
  }
  try {
    return fn();
  } finally {
    fs.closeSync(fd);
    fs.rmSync(lockPath, { force: true });
  }
}

function isStaleRuntimeHandoffLock(lockPath: string): boolean {
  try {
    const stat = fs.statSync(lockPath);
    return Date.now() - stat.mtimeMs > RUNTIME_HANDOFF_LOCK_STALE_MS;
  } catch {
    return false;
  }
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function assertRuntimeHandoffExecution(
  record: RuntimeHandoffRecord,
  token: RuntimeHandoffExecutionToken,
  options: { requireLaneRunId?: boolean; allowedStatuses?: RuntimeHandoffRecord["status"][] } = {}
): void {
  if (options.allowedStatuses && !options.allowedStatuses.includes(record.status)) {
    throw new Error(`handoff ${record.id} is ${record.status}, not ${options.allowedStatuses.join("/")}`);
  }
  if (record.claimedBy !== token.workerId) {
    throw new Error(`handoff ${record.id} is claimed by ${record.claimedBy ?? "none"}, not ${token.workerId}`);
  }
  if (record.workerSessionId !== token.workerSessionId) {
    throw new Error(`handoff ${record.id} worker session changed from ${token.workerSessionId} to ${record.workerSessionId ?? "none"}`);
  }
  if ((record.attempts ?? 0) !== token.attempt) {
    throw new Error(`handoff ${record.id} attempt changed from ${token.attempt} to ${record.attempts ?? 0}`);
  }
  if (record.claimToken !== token.claimToken) {
    throw new Error(`handoff ${record.id} claim token changed`);
  }
  if (record.poolId !== token.poolId) {
    throw new Error(`handoff ${record.id} pool changed from ${token.poolId ?? "none"} to ${record.poolId ?? "none"}`);
  }
  if (record.slotId !== token.slotId) {
    throw new Error(`handoff ${record.id} slot changed from ${token.slotId ?? "none"} to ${record.slotId ?? "none"}`);
  }
  if (record.slotIndex !== token.slotIndex) {
    throw new Error(`handoff ${record.id} slot index changed from ${token.slotIndex ?? "none"} to ${record.slotIndex ?? "none"}`);
  }
  if (options.requireLaneRunId && record.laneRunId !== token.laneRunId) {
    throw new Error(`handoff ${record.id} lane changed from ${token.laneRunId ?? "none"} to ${record.laneRunId ?? "none"}`);
  }
}

function deadLetterRuntimeHandoffRecord(
  record: RuntimeHandoffRecord,
  reason: string,
  now: Date
): RuntimeHandoffRecord {
  return {
    ...record,
    status: "dead_letter",
    deadLetterAt: now.toISOString(),
    deadLetterReason: reason,
    lastFailureAt: now.toISOString(),
    lastFailureReason: reason,
    claimToken: undefined,
    poolId: undefined,
    slotId: undefined,
    slotIndex: undefined,
    leaseExpiresAt: undefined,
    updatedAt: now.toISOString(),
    note: `dead-letter: ${reason}`
  };
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
  if (!input.initialized) {
    if (isProductizeIntent(text)) {
      const idea = extractProductIdea(text);
      return plan("start-workflow", 0.9, "bootstrap productize", `/productize "${escapeCommandArg(idea)}"`, true, [
        "Initialize project metadata if needed.",
        "Create the first product execution package.",
        "Return review and approval commands."
      ], "productize");
    }
    if (matches(text, ["setup", "설정", "연결", "credential", "api key", "mcp"])) {
      return plan("start-workflow", 0.92, "bootstrap setup", "/setup auto", true, [
        "Initialize project metadata if needed.",
        "Detect AI and MCP credentials.",
        "Guide connection checks."
      ], "setup");
    }
    return plan("chat", 0.4, "project not initialized");
  }
  if (input.paused && !matches(text, ["resume", "재개", "다시"])) {
    return plan("blocked", 0.9, "workflow paused. resume required");
  }
  if (isAdviceQuestion(text)) {
    return plan("chat", 0.7, "advice question");
  }
  if (isProductizeIntent(text)) {
    const idea = extractProductIdea(text);
    return plan("start-workflow", 0.82, "productize intent", `/productize "${escapeCommandArg(idea)}"`, true, [
      "Create the first product execution package.",
      "Return review and approval commands."
    ], "productize");
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

function isAdviceQuestion(text: string): boolean {
  return /[?？]\s*$/.test(text)
    || matches(text, ["뭐 하면", "무엇을 하면", "어떻게 하면", "어떻게 진행", "다음에 뭐", "next step?"]);
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

function normalizeRuntimeSession(
  projectRoot: string,
  manifest: RuntimeSessionManifest,
  options: { useGraphAuthority?: boolean } = {}
): RuntimeSessionManifest {
  const state = safeLoadState(projectRoot);
  const stateStage = state?.currentStage ?? manifest.stage;
  const loadedGraph = options.useGraphAuthority === false ? null : loadRuntimeExecutionGraphForSession(projectRoot, manifest.sessionId);
  const graph = loadedGraph
    && stateStage !== manifest.stage
    && loadedGraph.currentStage === manifest.stage
    && !runtimeExecutionGraphHasLifecycleLedger(loadedGraph)
      ? null
      : loadedGraph;
  const graphQueue = stageQueueFromRuntimeExecutionGraph(graph);
  const canonicalGraphStage = canonicalStageFromGraph(graph, manifest.stage);
  const canonicalQueueStage = canonicalStageFromQueue(manifest.stageQueue, manifest.stage);
  const stage = canonicalGraphStage ?? canonicalQueueStage ?? stateStage;
  const queueSource = graphQueue ?? (canonicalQueueStage || manifest.stage === stateStage ? manifest.stageQueue : undefined);
  const handoffPacket = createHandoffPacket(manifest, stage, state);
  return {
    ...manifest,
    version: 2,
    stage,
    ownerAgent: stageOwner(stage),
    stageQueue: hydrateStageQueue(queueSource, stage, state),
    waitCondition: createWaitCondition(manifest, state),
    handoffPacket,
    activeTurn: manifest.activeTurn ?? null,
    toolTrace: manifest.toolTrace ?? [],
    lastPresentedIntentId: manifest.lastPresentedIntentId ?? null,
    pendingExternalActionId: manifest.pendingExternalActionId ?? null
  };
}

function loadRuntimeSessionRecoveryCandidate(projectRoot: string): RuntimeSessionManifest | null {
  return loadLatestRuntimeSessionSnapshot(projectRoot)
    ?? replayLatestRuntimeSessionJournal(projectRoot)
    ?? loadRuntimeSessionFromExecutionGraph(projectRoot);
}

function loadRuntimeSessionFromExecutionGraph(projectRoot: string): RuntimeSessionManifest | null {
  let graph: RuntimeExecutionGraph | null = null;
  try {
    graph = loadRuntimeExecutionGraph(projectRoot);
  } catch {
    return null;
  }
  if (!graph || graph.version !== 1 || (graph as { source?: string }).source !== "runtime-execution-graph") {
    return null;
  }
  const stageQueue = stageQueueFromRuntimeExecutionGraph(graph);
  const activeNode = graph.nodes.find((node) => node.status === "active" && WORKFLOW_STAGES[node.stage]);
  const stage = activeNode?.stage
    ?? (graph.currentStage !== "UNINITIALIZED" && WORKFLOW_STAGES[graph.currentStage] ? graph.currentStage : null);
  if (!stage || !stageQueue) {
    return null;
  }
  const now = graph.updatedAt ?? new Date().toISOString();
  return normalizeRuntimeSession(projectRoot, {
    version: 2,
    sessionId: graph.sessionId,
    status: graph.status ?? "recovering",
    projectRoot,
    startedAt: graph.generatedAt ?? now,
    updatedAt: now,
    stage,
    ownerAgent: stageOwner(stage),
    pendingAction: null,
    checkpoint: `recovered from runtime execution graph at ${stage}`,
    blocker: null,
    retryCount: 0,
    lastCommand: stageQueue.find((entry) => entry.status === "active")?.nextCommand,
    lastCommandOk: undefined,
    activeTurn: null,
    stageQueue,
    waitCondition: null,
    handoffPacket: null,
    toolTrace: [],
    pendingExternalActionId: null,
    history: [{
      at: now,
      kind: "checkpoint",
      message: "runtime session recovered from execution graph",
      ok: true
    }]
  });
}

function loadLatestRuntimeSessionSnapshot(projectRoot: string): RuntimeSessionManifest | null {
  const dir = runtimeSessionsDir(projectRoot);
  if (!fs.existsSync(dir)) {
    return null;
  }
  const files = fs
    .readdirSync(dir)
    .filter((fileName) => fileName.endsWith(".latest.json"))
    .map((fileName) => path.join(dir, fileName))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  for (const filePath of files) {
    try {
      const manifest = JSON.parse(fs.readFileSync(filePath, "utf8")) as RuntimeSessionManifest;
      return normalizeRuntimeSession(projectRoot, manifest);
    } catch {
      continue;
    }
  }
  return null;
}

function replayLatestRuntimeSessionJournal(projectRoot: string): RuntimeSessionManifest | null {
  const dir = runtimeSessionsDir(projectRoot);
  if (!fs.existsSync(dir)) {
    return null;
  }
  const files = fs
    .readdirSync(dir)
    .filter((fileName) => fileName.endsWith(".jsonl"))
    .map((fileName) => path.join(dir, fileName))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  for (const filePath of files) {
    const sessionId = path.basename(filePath, ".jsonl");
    const replayed = replayRuntimeSession(projectRoot, sessionId);
    if (replayed) {
      return replayed;
    }
  }
  return null;
}

function appendRuntimeSessionJournalRecord(projectRoot: string, manifest: RuntimeSessionManifest): void {
  const filePath = runtimeSessionJournalFile(projectRoot, manifest.sessionId);
  const record = createRuntimeSessionJournalRecord(
    projectRoot,
    manifest,
    nextRuntimeSessionJournalSequence(projectRoot, manifest.sessionId)
  );
  appendText(filePath, `${JSON.stringify(record)}\n`);
}

function createRuntimeSessionJournalRecord(
  projectRoot: string,
  manifest: RuntimeSessionManifest,
  sequence: number
): RuntimeSessionJournalRecord {
  const normalized = normalizeRuntimeSession(projectRoot, manifest, { useGraphAuthority: false });
  return {
    version: 1,
    kind: "snapshot",
    at: normalized.updatedAt,
    sessionId: normalized.sessionId,
    sequence,
    status: normalized.status,
    stage: normalized.stage,
    ownerAgent: normalized.ownerAgent,
    checkpoint: normalized.checkpoint ?? null,
    blocker: normalized.blocker ?? null,
    pendingActionCommand: normalized.pendingAction?.command ?? null,
    pendingExternalActionId: normalized.pendingExternalActionId ?? null,
    waitConditionKind: normalized.waitCondition?.kind ?? null,
    activeTurnId: normalized.activeTurn?.id ?? null,
    activeTurnStatus: normalized.activeTurn?.status ?? null,
    historyLength: normalized.history.length,
    manifest: normalized
  };
}

function nextRuntimeSessionJournalSequence(projectRoot: string, sessionId: string): number {
  const latest = latestRuntimeSessionJournalRecord(projectRoot, sessionId);
  return latest ? latest.sequence + 1 : 1;
}

function normalizeRuntimeSessionJournalRecord(
  projectRoot: string,
  record: RuntimeSessionJournalRecord
): RuntimeSessionJournalRecord[] {
  if (!record || record.kind !== "snapshot" || !record.sessionId || !record.manifest) {
    return [];
  }
  const manifest = normalizeRuntimeSession(projectRoot, {
    ...record.manifest,
    sessionId: record.sessionId
  });
  return [{
    ...record,
    version: 1,
    kind: "snapshot",
    at: record.at ?? manifest.updatedAt,
    sequence: Number.isFinite(record.sequence) ? record.sequence : 0,
    status: manifest.status,
    stage: manifest.stage,
    ownerAgent: manifest.ownerAgent,
    checkpoint: manifest.checkpoint ?? null,
    blocker: manifest.blocker ?? null,
    pendingActionCommand: manifest.pendingAction?.command ?? null,
    pendingExternalActionId: manifest.pendingExternalActionId ?? null,
    waitConditionKind: manifest.waitCondition?.kind ?? null,
    activeTurnId: manifest.activeTurn?.id ?? null,
    activeTurnStatus: manifest.activeTurn?.status ?? null,
    historyLength: manifest.history.length,
    manifest
  }];
}

function normalizeRuntimeHandoffs(records: RuntimeHandoffRecord[]): RuntimeHandoffRecord[] {
  return records
    .filter((record) => Boolean(record?.id && record.packet))
    .map((record) => ({
      ...record,
      status: record.status ?? "pending",
      attempts: record.attempts ?? (record.status === "pending" ? 0 : 1),
      maxAttempts: record.maxAttempts ?? DEFAULT_HANDOFF_MAX_ATTEMPTS,
      updatedAt: record.updatedAt ?? record.createdAt ?? new Date().toISOString()
    }));
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
    const blockers = stageBlockers(state, stageId, isActive);
    const status = stageQueueStatus(isActive, blockers);
    entries.push(createStageQueueEntry(stage, stageId, status, state, entries[entries.length - 1]?.stage));
    pending.push(...current.nextStages.filter((nextStageId) => !seen.has(nextStageId)));
  }
  return entries;
}

function hydrateStageQueue(
  persisted: StageQueueEntry[] | undefined,
  stage: RuntimeSessionStage,
  state: ProjectState | null
): StageQueueEntry[] {
  if (stage === "UNINITIALIZED") {
    return [];
  }
  const seed = createStageQueue(stage, state);
  const source = persisted && persisted.length > 0 ? persisted : seed;
  const stages: WorkflowStageId[] = [];
  for (const entry of source) {
    if (entry?.stage && WORKFLOW_STAGES[entry.stage] && !stages.includes(entry.stage)) {
      stages.push(entry.stage);
    }
  }
  for (const entry of seed) {
    if (!stages.includes(entry.stage)) {
      stages.push(entry.stage);
    }
  }

  const persistedByStage = new Map(source.map((entry) => [entry.stage, entry]));
  return stages.map((stageId, index) => {
    const previous = index > 0 ? stages[index - 1] : undefined;
    const persistedEntry = persistedByStage.get(stageId);
    const isActive = stageId === stage;
    const blockers = stageBlockers(state, stageId, isActive);
    const preserveRuntimeStatus = shouldPreserveRuntimeQueueEntry(persistedEntry);
    const status = isActive
      ? "active"
      : preserveRuntimeStatus
        ? persistedEntry.status
        : stageQueueStatus(false, blockers);
    const base = createStageQueueEntry(stage, stageId, status, state, previous);
    if (!persistedEntry || !preserveRuntimeStatus) {
      return base;
    }
    return {
      ...base,
      reason: persistedEntry.reason ?? base.reason,
      blockers: persistedEntry.blockers ?? base.blockers,
      handoffIds: persistedEntry.handoffIds,
      laneRunIds: persistedEntry.laneRunIds,
      fanIn: persistedEntry.fanIn
    };
  });
}

function shouldPreserveRuntimeQueueEntry(
  entry: StageQueueEntry | undefined
): entry is StageQueueEntry {
  if (!entry) {
    return false;
  }
  if (entry.status === "completed" || entry.status === "pending") {
    return true;
  }
  return Boolean(entry.fanIn) || (entry.status === "blocked" && Boolean(entry.handoffIds?.length || entry.laneRunIds?.length));
}

function createStageQueueEntry(
  currentStage: WorkflowStageId,
  stageId: WorkflowStageId,
  status: StageQueueEntry["status"],
  state: ProjectState | null,
  previousStage: WorkflowStageId | undefined
): StageQueueEntry {
  const current = WORKFLOW_STAGES[stageId];
  const nodeType = stageNodeType(stageId);
  const blockers = stageBlockers(state, stageId, status === "active");
  return {
    id: `stage:${stageId}`,
    stage: stageId,
    name: current.name,
    ownerAgent: current.ownerAgent,
    status,
    nodeType,
    reason: stageQueueReason(currentStage, stageId, status, nodeType, previousStage),
    joinCondition: nodeType === "fan-in" ? `waits for ${current.prerequisites.join(" + ")}` : undefined,
    prerequisites: current.prerequisites,
    requiredDocuments: current.requiredDocuments,
    requiredApprovals: current.requiredApprovals,
    requiredDesignArtifacts: current.requiredDesignArtifacts,
    requiredDesignApprovals: current.requiredDesignApprovals,
    nextStages: current.nextStages,
    nextCommand: commandForStage(stageId),
    blockers
  };
}

function canonicalStageFromQueue(
  stageQueue: StageQueueEntry[] | undefined,
  manifestStage: RuntimeSessionStage
): WorkflowStageId | null {
  if (!stageQueue || manifestStage === "UNINITIALIZED") {
    return null;
  }
  const active = stageQueue.find((entry) => entry.status === "active");
  if (!active || !WORKFLOW_STAGES[active.stage]) {
    return null;
  }
  const hasLifecycleLedger = stageQueue.some((entry) => entry.status === "completed");
  return hasLifecycleLedger || active.stage !== manifestStage ? active.stage : null;
}

function canonicalStageFromGraph(
  graph: RuntimeExecutionGraph | null,
  manifestStage: RuntimeSessionStage
): WorkflowStageId | null {
  if (!graph || manifestStage === "UNINITIALIZED") {
    return null;
  }
  const active = graph.nodes.find((node) => node.status === "active");
  if (active && WORKFLOW_STAGES[active.stage]) {
    return active.stage;
  }
  return graph.currentStage !== "UNINITIALIZED" && WORKFLOW_STAGES[graph.currentStage]
    ? graph.currentStage
    : null;
}

function advanceStageQueue(
  stageQueue: StageQueueEntry[],
  fromStage: RuntimeSessionStage,
  toStage: RuntimeSessionStage
): StageQueueEntry[] | undefined {
  if (fromStage === "UNINITIALIZED" || toStage === "UNINITIALIZED") {
    return stageQueue;
  }
  const hasToStage = stageQueue.some((entry) => entry.stage === toStage);
  const next = stageQueue.map((entry) => {
    if (entry.stage === fromStage) {
      return { ...entry, status: "completed" as const };
    }
    if (entry.stage === toStage) {
      return { ...entry, status: "active" as const };
    }
    return entry.status === "active" ? { ...entry, status: "ready" as const } : entry;
  });
  if (!hasToStage) {
    return [
      ...next,
      {
        id: `stage:${toStage}`,
        stage: toStage,
        name: WORKFLOW_STAGES[toStage].name,
        ownerAgent: WORKFLOW_STAGES[toStage].ownerAgent,
        status: "active",
        nodeType: stageNodeType(toStage),
        reason: "active stage appended by runtime queue transition",
        joinCondition: WORKFLOW_STAGES[toStage].prerequisites.length > 1
          ? `waits for ${WORKFLOW_STAGES[toStage].prerequisites.join(" + ")}`
          : undefined,
        prerequisites: WORKFLOW_STAGES[toStage].prerequisites,
        requiredDocuments: WORKFLOW_STAGES[toStage].requiredDocuments,
        requiredApprovals: WORKFLOW_STAGES[toStage].requiredApprovals,
        requiredDesignArtifacts: WORKFLOW_STAGES[toStage].requiredDesignArtifacts,
        requiredDesignApprovals: WORKFLOW_STAGES[toStage].requiredDesignApprovals,
        nextStages: WORKFLOW_STAGES[toStage].nextStages,
        nextCommand: commandForStage(toStage),
        blockers: []
      }
    ];
  }
  return next;
}

function stageBlockers(state: ProjectState | null, stageId: WorkflowStageId, isActive: boolean): string[] {
  return blockersForWorkflowStage(state, stageId, isActive);
}

function stageNodeType(stageId: WorkflowStageId): StageQueueEntry["nodeType"] {
  const stage = WORKFLOW_STAGES[stageId];
  if (stage.prerequisites.length > 1) {
    return "fan-in";
  }
  if (stage.nextStages.length > 1) {
    return "fan-out";
  }
  return "stage";
}

function stageQueueStatus(
  isActive: boolean,
  blockers: string[]
): StageQueueEntry["status"] {
  if (isActive) {
    return "active";
  }
  return blockers.length === 0 ? "ready" : "blocked";
}

function stageQueueReason(
  currentStage: WorkflowStageId,
  stageId: WorkflowStageId,
  status: StageQueueEntry["status"],
  nodeType: StageQueueEntry["nodeType"],
  previousStage: WorkflowStageId | undefined
): string {
  if (status === "active") {
    return nodeType === "fan-out" ? "current workflow stage; can fan out to parallel next stages" : "current workflow stage";
  }
  if (status === "completed") {
    return "completed queue item preserved from runtime ledger";
  }
  if (status === "ready") {
    return nodeType === "fan-in"
      ? `join node ready after ${currentStage}`
      : `ready after ${previousStage ?? currentStage}`;
  }
  if (nodeType === "fan-in") {
    return `fan-in blocked until prerequisites and artifacts are complete`;
  }
  return `blocked after ${previousStage ?? currentStage}`;
}

function createWaitCondition(manifest: RuntimeSessionManifest, state: ProjectState | null): WaitCondition | null {
  if (manifest.status === "paused" || state?.paused) {
    return {
      kind: "paused",
      message: "workflow is paused until /resume",
      since: manifest.updatedAt
    };
  }
  if (manifest.pendingExternalActionId) {
    const action = loadRuntimeActionApprovals(manifest.projectRoot).find((record) => record.id === manifest.pendingExternalActionId);
    if (action && ["pending", "approved", "running", "failed"].includes(action.status)) {
      return {
        kind: "external_live_write",
        message: `external action ${action.status}: ${action.command}`,
        since: action.updatedAt
      };
    }
  }
  if (manifest.status === "blocked" && manifest.blocker) {
    return {
      kind: "blocked",
      message: manifest.blocker,
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
  return manifest.waitCondition?.kind === "paused" || manifest.waitCondition?.kind === "blocked" ? null : manifest.waitCondition ?? null;
}

function isContinuableRuntimeStatus(status: RuntimeSessionManifest["status"]): boolean {
  return status === "active" || status === "paused" || status === "blocked" || status === "recovering";
}

function nextRuntimeStatus(
  current: RuntimeSessionManifest["status"],
  blocker: RuntimeSessionUpdateInput["blocker"] | undefined
): RuntimeSessionManifest["status"] {
  if (blocker === undefined) {
    return current;
  }
  if (blocker) {
    return "blocked";
  }
  if (current === "blocked") {
    return "recovering";
  }
  return current;
}

function createHandoffPacket(
  manifest: RuntimeSessionManifest,
  stage: RuntimeSessionStage,
  state: ProjectState | null
): HandoffPacket | null {
  return createHandoffPacketBetween(manifest.stage, stage, state, manifest.handoffPacket);
}

function createHandoffPacketBetween(
  fromStage: RuntimeSessionStage,
  stage: RuntimeSessionStage,
  state: ProjectState | null,
  existing: HandoffPacket | null | undefined
): HandoffPacket | null {
  if (stage === "UNINITIALIZED" || fromStage === stage) {
    return existing ?? null;
  }
  const fromAgent = stageOwner(fromStage);
  const toAgent = stageOwner(stage);
  if (fromAgent === toAgent) {
    return existing ?? null;
  }
  return {
    fromAgent,
    toAgent,
    stage,
    summary: `${fromStage} -> ${stage}: ${fromAgent} handoff to ${toAgent}`,
    roleContract: agentRoleContract(toAgent),
    artifactRefs: artifactRefsForStage(stage),
    acceptanceCriteria: acceptanceCriteriaForStage(stage),
    blockers: stageBlockers(state, stage, false),
    nextCommand: commandForStage(stage),
    resumeCursor: `stage:${stage}`,
    createdAt: new Date().toISOString()
  };
}

function artifactRefsForStage(stage: RuntimeSessionStage): string[] {
  return artifactRefsForWorkflowStage(stage);
}

function acceptanceCriteriaForStage(stage: RuntimeSessionStage): string[] {
  return acceptanceCriteriaForWorkflowStage(stage);
}

function commandForStage(stage: RuntimeSessionStage): string | undefined {
  return commandForWorkflowStage(stage);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function sortedStringsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function mergeToolTrace(existing: AgentToolCall[], next: AgentToolCall[]): AgentToolCall[] {
  const merged = new Map(existing.map((call) => [call.id, call]));
  for (const call of next) {
    merged.set(call.id, call);
  }
  return Array.from(merged.values()).slice(-40);
}

function stageOwner(stage: RuntimeSessionStage): RuntimeSessionManifest["ownerAgent"] {
  return ownerForWorkflowStage(stage);
}

function escapeCommandArg(value: string): string {
  return value.replace(/["\\]/g, "");
}
