import fs from "node:fs";
import path from "node:path";
import { activeCustomAgentExecutionProfile } from "./agent-catalog";
import { agentRoleContract } from "./agent-role-contracts";
import { appendText, ensureDir, listFiles, readJsonIfExists, writeJson } from "./fs";
import { runtimeHandoffsFile, runtimeLaneMemoryFile, runtimeLaneRunFile, runtimeLaneRunsDir, stateFile } from "./paths";
import { appendProofLedgerEvents, recordLaneProofEvent } from "./proof-ledger";
import { updateWorkflowEvidence } from "./project";
import { AgentLaneRunRecord, AgentRole, HandoffPacket, RuntimeHandoffRecord } from "./types";

const DEFAULT_LANE_TOOL_BUDGET = {
  maxToolCalls: 8,
  remainingToolCalls: 8,
  maxOutputTokens: 4000,
  externalWriteBudget: 0 as const
};

export interface StartAgentLaneRunInput {
  sessionId: string;
  handoffId?: string;
  workerId?: string;
  workerSessionId?: string;
  claimToken?: string;
  workerPid?: number;
  poolId?: string;
  slotId?: string;
  slotIndex?: number;
  attempt?: number;
  packet: HandoffPacket;
  command: string;
  leaseExpiresAt?: string;
  toolBudget?: Partial<AgentLaneRunRecord["toolBudget"]>;
}

export interface AgentLaneBatchIntegration {
  id: string;
  status: "integrated" | "partial" | "blocked";
  runIds: string[];
  mergedRunIds: string[];
  failedRunIds: string[];
  roles: AgentRole[];
  stages: string[];
  artifactRefs: string[];
  summary: string;
  integratedAt: string;
}

export interface AgentLaneRunReadIssue {
  file: string;
  issue: "unreadable-json";
}

export function startAgentLaneRun(projectRoot: string, input: StartAgentLaneRunInput): AgentLaneRunRecord {
  const contract = agentRoleContract(input.packet.toAgent);
  const executionProfile = activeCustomAgentExecutionProfile(projectRoot);
  const now = new Date().toISOString();
  const memoryFile = runtimeLaneMemoryFile(projectRoot, input.packet.toAgent);
  const entriesBefore = laneMemoryEntryCount(memoryFile);
  const runId = `lane-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const run: AgentLaneRunRecord = {
    id: runId,
    sessionId: input.sessionId,
    handoffId: input.handoffId,
    workerId: input.workerId,
    workerSessionId: input.workerSessionId ?? (input.workerId ? `${input.workerId}:${input.sessionId}` : undefined),
    claimToken: input.claimToken,
    workerPid: input.workerPid,
    poolId: input.poolId,
    slotId: input.slotId,
    slotIndex: input.slotIndex,
    attempt: input.attempt,
    role: input.packet.toAgent,
    stage: input.packet.stage,
    status: "running",
    command: input.command,
    summary: input.packet.summary,
    roleContract: contract,
    systemPrompt: agentLaneSystemPrompt(input.packet, executionProfile),
    executionProfile,
    toolPolicy: {
      allowedCommandPrefixes: contract.allowedCommandPrefixes,
      externalWritesRequireApproval: true
    },
    toolBudget: {
      ...DEFAULT_LANE_TOOL_BUDGET,
      ...input.toolBudget,
      remainingToolCalls: input.toolBudget?.remainingToolCalls ?? input.toolBudget?.maxToolCalls ?? DEFAULT_LANE_TOOL_BUDGET.remainingToolCalls
    },
    memory: {
      scope: input.packet.toAgent,
      filePath: memoryFile,
      entriesBefore,
      entriesAfter: entriesBefore + 1,
      lastEntryAt: now
    },
    artifactRefs: input.packet.artifactRefs ?? [],
    acceptanceCriteria: input.packet.acceptanceCriteria ?? [],
    blockers: input.packet.blockers ?? [],
    heartbeatAt: now,
    leaseExpiresAt: input.leaseExpiresAt,
    runningAt: now,
    merge: {
      status: "pending",
      artifactRefs: input.packet.artifactRefs ?? []
    },
    startedAt: now,
    updatedAt: now
  };
  appendLaneMemoryEntry(memoryFile, {
    at: now,
    runId,
    event: "started",
    role: input.packet.toAgent,
    stage: input.packet.stage,
    command: input.command,
    summary: input.packet.summary
  });
  writeJson(runtimeLaneRunFile(projectRoot, run.id), run);
  markAgentIntegrationRequired(projectRoot, run);
  recordLaneProofEvent(projectRoot, "lane.started", run, `started ${run.role} lane for ${run.stage}`);
  return run;
}

export function consumeAgentLaneToolBudget(
  projectRoot: string,
  runId: string,
  amount: number,
  reason: string
): AgentLaneRunRecord {
  if (!Number.isInteger(amount) || amount < 1) {
    throw new Error(`tool budget amount must be a positive integer: ${amount}`);
  }
  const current = readJsonIfExists<AgentLaneRunRecord | null>(runtimeLaneRunFile(projectRoot, runId), null);
  if (!current) {
    throw new Error(`agent lane run not found: ${runId}`);
  }
  const remaining = current.toolBudget.remainingToolCalls;
  if (remaining < amount) {
    throw new Error(`lane tool budget exhausted for ${runId}: ${remaining}/${current.toolBudget.maxToolCalls} remaining before ${reason}`);
  }
  const next: AgentLaneRunRecord = {
    ...current,
    toolBudget: {
      ...current.toolBudget,
      remainingToolCalls: remaining - amount
    },
    updatedAt: new Date().toISOString()
  };
  writeJson(runtimeLaneRunFile(projectRoot, runId), next);
  return next;
}

export function completeAgentLaneRun(
  projectRoot: string,
  runId: string,
  result: {
    ok: boolean;
    error?: string;
    executionMode?: AgentLaneRunRecord["executionMode"];
    autonomousTurnId?: string;
    proposedCommand?: string;
    executedCommand?: string;
  }
): AgentLaneRunRecord {
  const current = readJsonIfExists<AgentLaneRunRecord | null>(runtimeLaneRunFile(projectRoot, runId), null);
  if (!current) {
    throw new Error(`agent lane run not found: ${runId}`);
  }
  const now = new Date().toISOString();
  const resultSummary = {
    ok: result.ok,
    summary: result.ok ? `completed ${current.command}` : result.error ?? `failed ${current.command}`,
    artifacts: current.artifactRefs,
    acceptance: current.acceptanceCriteria,
    completedCommand: result.executedCommand ?? result.proposedCommand ?? current.command,
    executionMode: result.executionMode,
    autonomousTurnId: result.autonomousTurnId,
    proposedCommand: result.proposedCommand,
    executedCommand: result.executedCommand
  };
  const memoryFile = current.memory?.filePath ?? runtimeLaneMemoryFile(projectRoot, current.role);
  appendLaneMemoryEntry(memoryFile, {
    at: now,
    runId,
    event: result.ok ? "completed" : "failed",
    role: current.role,
    stage: current.stage,
    command: current.command,
    summary: resultSummary.summary
  });
  const next: AgentLaneRunRecord = {
    ...current,
    status: result.ok ? "completed" : "failed",
    exitOk: result.ok,
    error: result.error,
    executionMode: result.executionMode ?? current.executionMode ?? "command",
    autonomousTurnId: result.autonomousTurnId ?? current.autonomousTurnId,
    proposedCommand: result.proposedCommand ?? current.proposedCommand,
    executedCommand: result.executedCommand ?? current.executedCommand,
    result: resultSummary,
    merge: {
      status: result.ok ? "pending" : "blocked",
      summary: resultSummary.summary,
      artifactRefs: current.artifactRefs
    },
    memory: {
      ...current.memory,
      scope: current.memory?.scope ?? current.role,
      filePath: memoryFile,
      entriesBefore: current.memory?.entriesBefore ?? 0,
      entriesAfter: laneMemoryEntryCount(memoryFile),
      lastEntryAt: now
    },
    completedAt: now,
    updatedAt: now
  };
  writeJson(runtimeLaneRunFile(projectRoot, runId), next);
  recordLaneProofEvent(projectRoot, "lane.completed", next, resultSummary.summary);
  return next;
}

export function mergeAgentLaneRun(
  projectRoot: string,
  runId: string,
  summary = "control-plane accepted lane result"
): AgentLaneRunRecord {
  const current = readJsonIfExists<AgentLaneRunRecord | null>(runtimeLaneRunFile(projectRoot, runId), null);
  if (!current) {
    throw new Error(`agent lane run not found: ${runId}`);
  }
  if (current.status !== "completed" || current.exitOk !== true) {
    throw new Error(`agent lane run is not mergeable: ${runId}`);
  }
  assertLaneRunMatchesCurrentHandoff(projectRoot, current);
  const now = new Date().toISOString();
  const memoryFile = current.memory?.filePath ?? runtimeLaneMemoryFile(projectRoot, current.role);
  appendLaneMemoryEntry(memoryFile, {
    at: now,
    runId,
    event: "merged",
    role: current.role,
    stage: current.stage,
    command: current.command,
    summary
  });
  const next: AgentLaneRunRecord = {
    ...current,
    merge: {
      status: "merged",
      mergedAt: now,
      summary,
      artifactRefs: current.artifactRefs
    },
    memory: {
      ...current.memory,
      scope: current.memory?.scope ?? current.role,
      filePath: memoryFile,
      entriesBefore: current.memory?.entriesBefore ?? 0,
      entriesAfter: laneMemoryEntryCount(memoryFile),
      lastEntryAt: now
    },
    updatedAt: now
  };
  writeJson(runtimeLaneRunFile(projectRoot, runId), next);
  recordLaneProofEvent(projectRoot, "lane.merged", next, summary);
  return next;
}

function assertLaneRunMatchesCurrentHandoff(projectRoot: string, run: AgentLaneRunRecord): void {
  if (!run.handoffId) {
    return;
  }
  const handoffs = readJsonIfExists<RuntimeHandoffRecord[]>(runtimeHandoffsFile(projectRoot), []);
  const handoff = handoffs.find((record) => record.id === run.handoffId);
  if (!handoff) {
    throw new Error(`agent lane run ${run.id} references missing handoff ${run.handoffId}`);
  }
  const mismatches = [
    run.sessionId === handoff.sessionId ? "" : `session ${run.sessionId} != ${handoff.sessionId}`,
    run.stage === handoff.packet.stage ? "" : `stage ${run.stage} != ${handoff.packet.stage}`,
    run.id === handoff.laneRunId ? "" : `lane ${run.id} != ${handoff.laneRunId ?? "none"}`,
    run.attempt === handoff.attempts ? "" : `attempt ${run.attempt ?? "none"} != ${handoff.attempts ?? "none"}`,
    run.workerSessionId === handoff.workerSessionId ? "" : `workerSession ${run.workerSessionId ?? "none"} != ${handoff.workerSessionId ?? "none"}`,
    run.claimToken === handoff.claimToken ? "" : "claim token mismatch"
  ].filter(Boolean);
  if (mismatches.length > 0) {
    throw new Error(`agent lane run ${run.id} is not bound to current handoff claim: ${mismatches.join("; ")}`);
  }
}

export function integrateAgentLaneBatch(
  projectRoot: string,
  runIds: string[],
  summary?: string
): AgentLaneBatchIntegration {
  const uniqueRunIds = Array.from(new Set(runIds.filter(Boolean)));
  const now = new Date().toISOString();
  const mergedRuns: AgentLaneRunRecord[] = [];
  const failedRunIds: string[] = [];

  for (const runId of uniqueRunIds) {
    const current = readJsonIfExists<AgentLaneRunRecord | null>(runtimeLaneRunFile(projectRoot, runId), null);
    if (!current || current.status !== "completed" || current.exitOk !== true) {
      failedRunIds.push(runId);
      continue;
    }
    const run = current.merge?.status === "merged"
      ? current
      : mergeAgentLaneRun(projectRoot, runId, "integrator accepted lane result");
    mergedRuns.push(run);
  }

  const status: AgentLaneBatchIntegration["status"] = failedRunIds.length === 0
    ? "integrated"
    : mergedRuns.length > 0
      ? "partial"
      : "blocked";
  const integration: AgentLaneBatchIntegration = {
    id: `lane-batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status,
    runIds: uniqueRunIds,
    mergedRunIds: mergedRuns.map((run) => run.id),
    failedRunIds,
    roles: uniqueAgentRoles(mergedRuns.map((run) => run.role)),
    stages: uniqueStrings(mergedRuns.map((run) => run.stage)),
    artifactRefs: uniqueStrings(mergedRuns.flatMap((run) => run.merge?.artifactRefs ?? run.artifactRefs)),
    summary: summary ?? `integrated ${mergedRuns.length}/${uniqueRunIds.length} lane result(s)`,
    integratedAt: now
  };

  appendProofLedgerEvents(projectRoot, [{
    id: `lane.batch-integrated:${integration.id}`,
    kind: "lane.batch-integrated",
    status: status === "blocked" ? "blocked" : status === "partial" ? "completed" : "merged",
    subject: `lane-batch:${integration.id}`,
    label: "lane batch integration",
    summary: integration.summary,
    source: "agent-lane-runner",
    ref: {
      runId: integration.mergedRunIds.join(",")
    },
    data: {
      status: integration.status,
      runIds: integration.runIds,
      mergedRunIds: integration.mergedRunIds,
      failedRunIds: integration.failedRunIds,
      roles: integration.roles,
      stages: integration.stages,
      artifactRefs: integration.artifactRefs
    },
    at: integration.integratedAt
  }]);
  recordAgentIntegrationEvidence(projectRoot, integration);

  return integration;
}

export function heartbeatAgentLaneRun(projectRoot: string, runId: string, leaseExpiresAt?: string): AgentLaneRunRecord {
  const current = readJsonIfExists<AgentLaneRunRecord | null>(runtimeLaneRunFile(projectRoot, runId), null);
  if (!current) {
    throw new Error(`agent lane run not found: ${runId}`);
  }
  const now = new Date().toISOString();
  const next: AgentLaneRunRecord = {
    ...current,
    heartbeatAt: now,
    leaseExpiresAt: leaseExpiresAt ?? current.leaseExpiresAt,
    updatedAt: now
  };
  writeJson(runtimeLaneRunFile(projectRoot, runId), next);
  return next;
}

export function loadAgentLaneRuns(projectRoot: string): AgentLaneRunRecord[] {
  const dir = runtimeLaneRunsDir(projectRoot);
  ensureDir(dir);
  return listFiles(dir)
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) => {
      try {
        const record = readJsonIfExists<AgentLaneRunRecord | null>(runtimeLaneRunFile(projectRoot, file.replace(/\.json$/, "")), null);
        return record ? [record] : [];
      } catch {
        return [];
      }
    })
    .filter((record): record is AgentLaneRunRecord => Boolean(record))
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
}

export function loadAgentLaneRunReadIssues(projectRoot: string): AgentLaneRunReadIssue[] {
  const dir = runtimeLaneRunsDir(projectRoot);
  ensureDir(dir);
  return listFiles(dir)
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) => {
      try {
        readJsonIfExists<AgentLaneRunRecord | null>(runtimeLaneRunFile(projectRoot, file.replace(/\.json$/, "")), null);
        return [];
      } catch {
        return [{ file, issue: "unreadable-json" as const }];
      }
    });
}

export function latestAgentLaneRun(projectRoot: string): AgentLaneRunRecord | null {
  const runs = loadAgentLaneRuns(projectRoot);
  return runs[runs.length - 1] ?? null;
}

function appendLaneMemoryEntry(filePath: string, entry: {
  at: string;
  runId: string;
  event: "started" | "completed" | "failed" | "merged";
  role: AgentRole;
  stage: string;
  command: string;
  summary: string;
}): void {
  appendText(filePath, `${JSON.stringify(entry)}\n`);
}

function laneMemoryEntryCount(filePath: string): number {
  if (!fs.existsSync(filePath)) {
    return 0;
  }
  const text = fs.readFileSync(filePath, "utf8").trim();
  return text ? text.split("\n").length : 0;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function uniqueAgentRoles(values: AgentRole[]): AgentRole[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function markAgentIntegrationRequired(projectRoot: string, run: AgentLaneRunRecord): void {
  if (!fs.existsSync(stateFile(projectRoot))) {
    return;
  }
  updateWorkflowEvidence(projectRoot, (evidence) => {
    const current = evidence.agentIntegration;
    const runIds = uniqueStrings([...(current?.runIds ?? []), run.id]);
    return {
      ...evidence,
      agentIntegration: {
        status: current?.status === "integrated" ? "partial" : current?.status ?? "missing",
        required: true,
        runIds,
        mergedRunIds: current?.mergedRunIds ?? [],
        failedRunIds: current?.failedRunIds ?? [],
        latestProofId: current?.latestProofId,
        summary: current?.summary ?? "agent lane result needs integrator fan-in before release readiness",
        updatedAt: new Date().toISOString()
      }
    };
  });
}

function recordAgentIntegrationEvidence(projectRoot: string, integration: AgentLaneBatchIntegration): void {
  if (!fs.existsSync(stateFile(projectRoot))) {
    return;
  }
  updateWorkflowEvidence(projectRoot, (evidence) => ({
    ...evidence,
    agentIntegration: {
      status: integration.status,
      required: true,
      runIds: uniqueStrings([...(evidence.agentIntegration?.runIds ?? []), ...integration.runIds]),
      mergedRunIds: uniqueStrings(integration.mergedRunIds),
      failedRunIds: uniqueStrings(integration.failedRunIds),
      latestProofId: integration.id,
      summary: integration.summary,
      updatedAt: integration.integratedAt
    }
  }));
}

export function agentLaneSystemPrompt(packet: HandoffPacket, executionProfile?: AgentLaneRunRecord["executionProfile"]): string {
  const contract = agentRoleContract(packet.toAgent);
  return [
    `${contract.role} lane runner`,
    contract.purpose,
    executionProfile ? [
      `Active custom TOML agent: ${executionProfile.name}`,
      `model=${executionProfile.model ?? "unspecified"} reasoning=${executionProfile.modelReasoningEffort ?? "unspecified"} sandbox=${executionProfile.sandboxMode ?? "unspecified"}`
    ].join("\n") : "",
    `Stage: ${packet.stage}`,
    `Summary: ${packet.summary}`,
    `Required context: ${contract.requiredContext.join("; ")}`,
    `Success criteria: ${contract.successCriteria.join("; ")}`,
    `Allowed command prefixes: ${contract.allowedCommandPrefixes.join(", ")}`,
    "External writes, publishing, repository mutation outside local artifacts, and provider credential changes require an explicit approval gate."
  ].join("\n");
}
