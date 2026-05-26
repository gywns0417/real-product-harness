import fs from "node:fs";
import path from "node:path";
import { appendText, writeJson } from "./fs";
import { proofLedgerFile, proofLedgerLatestFile } from "./paths";
import { AgentLaneRunRecord, AgentToolCall, AgentTurnState, ConnectionCheck, RuntimeActionApprovalRecord } from "./types";

export type ProofLedgerEventKind =
  | "connection.check"
  | "agent.tool"
  | "external-action.readback"
  | "lane.started"
  | "lane.completed"
  | "lane.merged"
  | "lane.batch-integrated";

export type ProofLedgerEventStatus = "passed" | "failed" | "skipped" | "started" | "completed" | "merged" | "blocked";

export interface ProofLedgerEvent {
  id: string;
  kind: ProofLedgerEventKind;
  status: ProofLedgerEventStatus;
  subject: string;
  label: string;
  summary: string;
  trust?: string;
  targetId?: string;
  source: string;
  ref: Record<string, string | undefined>;
  data?: Record<string, unknown>;
  at: string;
}

export interface ProofLedgerLatest {
  version: 1;
  updatedAt: string;
  eventCount: number;
  counts: Record<ProofLedgerEventStatus, number>;
  latestBySubject: Record<string, ProofLedgerEvent>;
  latestFailures: ProofLedgerEvent[];
}

export function recordConnectionProofEvents(
  projectRoot: string,
  checks: ConnectionCheck[],
  reportPath: string
): ProofLedgerEvent[] {
  return appendProofLedgerEvents(projectRoot, checks.map((check) => connectionProofEvent(check, reportPath)));
}

export function recordAgentTurnProofEvents(
  projectRoot: string,
  sessionId: string,
  turn: AgentTurnState
): ProofLedgerEvent[] {
  return appendProofLedgerEvents(projectRoot, turn.toolCalls.map((call) => agentToolProofEvent(sessionId, turn, call)));
}

export function recordLaneProofEvent(
  projectRoot: string,
  kind: Extract<ProofLedgerEventKind, "lane.started" | "lane.completed" | "lane.merged">,
  run: AgentLaneRunRecord,
  summary: string
): ProofLedgerEvent[] {
  const status: ProofLedgerEventStatus = kind === "lane.started"
    ? "started"
    : kind === "lane.merged"
      ? "merged"
      : run.exitOk === false || run.status === "failed"
        ? "blocked"
        : "completed";
  return appendProofLedgerEvents(projectRoot, [{
    id: `${kind}:${run.id}:${run.updatedAt}`,
    kind,
    status,
    subject: `lane:${run.role}:${run.stage}:${run.id}`,
    label: `${run.role} ${run.stage}`,
    summary: redactSecretText(summary),
    source: "agent-lane-runner",
    ref: {
      runId: run.id,
      sessionId: run.sessionId,
      handoffId: run.handoffId,
      workerId: run.workerId
    },
    data: {
      command: redactSecretText(run.command),
      mergeStatus: run.merge?.status,
      artifactRefs: run.merge?.artifactRefs ?? run.artifactRefs,
      acceptanceCriteria: run.acceptanceCriteria,
      executionMode: run.executionMode
    },
    at: run.updatedAt
  }]);
}

export function recordRuntimeActionProofEvent(
  projectRoot: string,
  record: RuntimeActionApprovalRecord
): ProofLedgerEvent[] {
  if (record.status !== "completed" && record.status !== "failed") {
    return [];
  }
  const at = record.completedAt ?? record.failedAt ?? record.updatedAt;
  return appendProofLedgerEvents(projectRoot, [{
    id: `external-action.readback:${record.id}:${record.status}:${at}`,
    kind: "external-action.readback",
    status: record.status === "completed" && record.readbackStatus !== "failed" ? "passed" : "failed",
    subject: `external-action:${record.target}:${record.action}:${record.id}`,
    label: `${record.target}:${record.action}`,
    summary: redactSecretText(record.resultSummary ?? record.failureReason ?? record.description),
    trust: record.readbackStatus ?? "not_required",
    targetId: record.verifiedTargetId,
    source: "runtime-action-approval",
    ref: {
      actionId: record.id,
      sessionId: record.sessionId,
      artifactPath: record.readbackArtifactPath
    },
    data: {
      command: redactSecretText(record.normalizedCommand),
      risk: record.risk,
      expectedReadback: record.expectedReadback,
      readbackStatus: record.readbackStatus,
      verifiedTargetId: record.verifiedTargetId,
      readbackActionApprovalId: record.readbackActionApprovalId,
      readbackApprovedFingerprint: record.readbackApprovedFingerprint,
      readbackVerifiedAt: record.readbackVerifiedAt
    },
    at
  }]);
}

export function appendProofLedgerEvents(projectRoot: string, events: ProofLedgerEvent[]): ProofLedgerEvent[] {
  if (events.length === 0) {
    return [];
  }
  const filePath = proofLedgerFile(projectRoot);
  const existing = readProofLedgerEvents(projectRoot);
  const existingIds = new Set(existing.map((event) => event.id));
  const nextEvents = events.filter((event) => !existingIds.has(event.id));
  if (nextEvents.length === 0) {
    writeProofLedgerLatest(projectRoot, existing);
    return [];
  }
  appendText(filePath, nextEvents.map((event) => JSON.stringify(event)).join("\n") + "\n");
  writeProofLedgerLatest(projectRoot, [...existing, ...nextEvents]);
  return nextEvents;
}

export function readProofLedgerEvents(projectRoot: string): ProofLedgerEvent[] {
  const filePath = proofLedgerFile(projectRoot);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as ProofLedgerEvent;
      } catch {
        return null;
      }
    })
    .filter((event): event is ProofLedgerEvent => Boolean(event?.id && event.kind && event.subject));
}

export function readProofLedgerLatest(projectRoot: string): ProofLedgerLatest | null {
  const events = readProofLedgerEvents(projectRoot);
  return events.length > 0 ? summarizeProofLedger(events) : null;
}

function writeProofLedgerLatest(projectRoot: string, events: ProofLedgerEvent[]): void {
  if (events.length === 0) {
    return;
  }
  writeJson(proofLedgerLatestFile(projectRoot), summarizeProofLedger(events));
}

function summarizeProofLedger(events: ProofLedgerEvent[]): ProofLedgerLatest {
  const counts = emptyCounts();
  const latestBySubject: Record<string, ProofLedgerEvent> = {};
  for (const event of events) {
    counts[event.status] += 1;
    const previous = latestBySubject[event.subject];
    if (!previous || previous.at.localeCompare(event.at) <= 0) {
      latestBySubject[event.subject] = event;
    }
  }
  const latestFailures = Object.values(latestBySubject)
    .filter((event) => event.status === "failed" || event.status === "blocked")
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, 10);
  return {
    version: 1,
    updatedAt: events[events.length - 1].at,
    eventCount: events.length,
    counts,
    latestBySubject,
    latestFailures
  };
}

function emptyCounts(): Record<ProofLedgerEventStatus, number> {
  return {
    passed: 0,
    failed: 0,
    skipped: 0,
    started: 0,
    completed: 0,
    merged: 0,
    blocked: 0
  };
}

function connectionProofEvent(check: ConnectionCheck, reportPath: string): ProofLedgerEvent {
  const trust = `${check.readiness?.mode ?? "unverified"}:${check.readiness?.provenStage ?? "none"}`;
  return {
    id: `connection.check:${check.kind}:${check.id}:${check.checkedAt}`,
    kind: "connection.check",
    status: check.status,
    subject: `connection:${check.kind}:${check.id}`,
    label: `${check.kind}:${check.id}`,
    summary: redactSecretText(check.message),
    trust,
    targetId: check.identity?.targetId ?? check.firstActionProof?.targetId,
    source: "connection-report",
    ref: {
      reportPath,
      connectionId: check.id
    },
    data: {
      endpoint: redactSecretText(check.endpoint),
      requiredEnv: check.requiredEnv,
      missingEnv: check.missingEnv,
      identity: check.identity,
      firstActionProof: check.firstActionProof,
      readiness: check.readiness
    },
    at: check.checkedAt
  };
}

function agentToolProofEvent(sessionId: string, turn: AgentTurnState, call: AgentToolCall): ProofLedgerEvent {
  const status: ProofLedgerEventStatus = call.status === "succeeded"
    ? "passed"
    : call.status === "failed"
      ? "failed"
      : "started";
  return {
    id: `agent.tool:${sessionId}:${turn.id}:${call.id}:${call.status}`,
    kind: "agent.tool",
    status,
    subject: `agent-tool:${call.name}`,
    label: call.name,
    summary: redactSecretText(call.error ?? summarizeObservation(call.observation) ?? `${call.name} ${call.status}`),
    source: "agent-turn",
    ref: {
      sessionId,
      turnId: turn.id,
      toolCallId: call.id
    },
    data: {
      providerId: turn.providerId,
      model: turn.model,
      requestedAt: call.requestedAt,
      completedAt: call.completedAt
    },
    at: call.completedAt ?? call.requestedAt
  };
}

function summarizeObservation(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 240 ? `${compact.slice(0, 237)}...` : compact;
}

function redactSecretText(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value)
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1<redacted>")
    .replace(/("(?:api[_-]?key|token|secret|authorization)"\s*:\s*")[^"]+(")/gi, "$1<redacted>$2")
    .replace(/((?:api[_-]?key|token|secret|authorization)[=:]\s*)[^,\s}]+/gi, "$1<redacted>");
}
