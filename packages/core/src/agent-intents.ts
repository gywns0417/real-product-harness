import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { appendText, readJsonIfExists, writeJson } from "./fs";
import { runtimeIntentsFile, runtimeIntentsJournalFile } from "./paths";
import { newId, nowIso } from "./time";
import {
  RuntimeIntentJournalEvent,
  RuntimeIntentJournalRecord,
  RuntimeIntentRecord,
  RuntimeIntentRisk,
  RuntimeIntentStatus
} from "./types";

const RUNTIME_INTENT_LOCK_STALE_MS = 30_000;

export interface RuntimeIntentRequest {
  sessionId: string;
  command: string;
  risk: RuntimeIntentRisk;
  safeToAutoRun: boolean;
  createdStage?: string;
  graphId?: string;
  graphDigest?: string;
  activeProfileSlug?: string;
  reason?: string;
  message?: string;
}

export function loadRuntimeIntents(projectRoot: string): RuntimeIntentRecord[] {
  let head: RuntimeIntentRecord[] = [];
  try {
    head = readJsonIfExists<RuntimeIntentRecord[]>(runtimeIntentsFile(projectRoot), [])
      .map(normalizeRuntimeIntent);
  } catch {
    head = [];
  }
  const journal = loadRuntimeIntentJournal(projectRoot);
  if (journal.length === 0) {
    return head;
  }
  return replayRuntimeIntentsFromJournal(projectRoot, head);
}

export function loadRuntimeIntentJournal(projectRoot: string): RuntimeIntentJournalRecord[] {
  const filePath = runtimeIntentsJournalFile(projectRoot);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [normalizeRuntimeIntentJournalRecord(JSON.parse(line) as RuntimeIntentJournalRecord)];
      } catch {
        return [];
      }
    });
}

export function recordRuntimeIntent(projectRoot: string, request: RuntimeIntentRequest): RuntimeIntentRecord {
  return withRuntimeIntentsLock(projectRoot, () => {
    const current = loadRuntimeIntents(projectRoot);
    const normalizedCommand = normalizeCommand(request.command);
    const contextFingerprint = [
      request.createdStage ?? "",
      request.graphDigest ?? "",
      request.activeProfileSlug ?? ""
    ].join("\n");
    const fingerprint = intentFingerprint(`${request.sessionId}\n${normalizedCommand}\n${request.risk}\n${contextFingerprint}`);
    const existing = current.find((record) => record.status === "pending" && record.fingerprint === fingerprint);
    if (existing) {
      return existing;
    }
    const now = nowIso();
    const record: RuntimeIntentRecord = {
      id: newId("intent"),
      sessionId: request.sessionId,
      command: request.command.trim(),
      normalizedCommand,
      fingerprint,
      source: "agent-command-proposal",
      surface: "runtime-chat",
      risk: request.risk,
      safeToAutoRun: request.safeToAutoRun,
      createdStage: request.createdStage,
      graphId: request.graphId,
      graphDigest: request.graphDigest,
      activeProfileSlug: request.activeProfileSlug,
      reason: request.reason,
      message: request.message,
      status: "pending",
      createdAt: now,
      updatedAt: now
    };
    appendRuntimeIntentJournal(projectRoot, "created", record);
    writeJson(runtimeIntentsFile(projectRoot), replayRuntimeIntentsFromJournal(projectRoot, current));
    return record;
  });
}

export function confirmRuntimeIntent(
  projectRoot: string,
  id: string,
  confirmedBy = "user"
): RuntimeIntentRecord {
  return updateRuntimeIntent(projectRoot, id, (record, now) => {
    requireStatus(record, ["pending"], "confirm");
    return {
      ...record,
      status: "confirmed",
      confirmedAt: now,
      confirmedBy,
      updatedAt: now
    };
  });
}

export function dismissRuntimeIntent(
  projectRoot: string,
  id: string,
  dismissedBy = "user",
  reason?: string
): RuntimeIntentRecord {
  return updateRuntimeIntent(projectRoot, id, (record, now) => {
    requireStatus(record, ["pending"], "dismiss");
    return {
      ...record,
      status: "dismissed",
      dismissedAt: now,
      dismissedBy,
      dismissReason: reason,
      updatedAt: now
    };
  });
}

export function recordRuntimeIntentBlocked(
  projectRoot: string,
  id: string,
  blocker: string
): RuntimeIntentRecord {
  return withRuntimeIntentsLock(projectRoot, () => {
    const record = requireRuntimeIntent(projectRoot, id);
    appendRuntimeIntentJournal(projectRoot, "blocked", record, { blocker });
    return record;
  });
}

export function recordRuntimeIntentApplied(
  projectRoot: string,
  id: string,
  outcomeKind: RuntimeIntentJournalRecord["outcomeKind"]
): RuntimeIntentRecord {
  return withRuntimeIntentsLock(projectRoot, () => {
    const record = requireRuntimeIntent(projectRoot, id);
    appendRuntimeIntentJournal(projectRoot, "applied", record, { outcomeKind });
    return record;
  });
}

function updateRuntimeIntent(
  projectRoot: string,
  id: string,
  updater: (record: RuntimeIntentRecord, now: string) => RuntimeIntentRecord
): RuntimeIntentRecord {
  return withRuntimeIntentsLock(projectRoot, () => {
    const current = loadRuntimeIntents(projectRoot);
    const index = current.findIndex((record) => record.id === id);
    if (index < 0) {
      throw new Error(`runtime intent not found: ${id}`);
    }
    const next = [...current];
    const updated = updater(current[index], nowIso());
    next[index] = updated;
    appendRuntimeIntentJournal(projectRoot, journalEventForStatus(updated.status), updated);
    writeJson(runtimeIntentsFile(projectRoot), replayRuntimeIntentsFromJournal(projectRoot, next));
    return updated;
  });
}

function appendRuntimeIntentJournal(
  projectRoot: string,
  event: RuntimeIntentJournalEvent,
  record: RuntimeIntentRecord,
  options: { blocker?: string; outcomeKind?: RuntimeIntentJournalRecord["outcomeKind"] } = {}
): void {
  const current = loadRuntimeIntentJournal(projectRoot);
  const entry: RuntimeIntentJournalRecord = {
    version: 1,
    sequence: (current[current.length - 1]?.sequence ?? 0) + 1,
    at: nowIso(),
    event,
    intentId: record.id,
    sessionId: record.sessionId,
    command: record.command,
    risk: record.risk,
    status: record.status,
    blocker: options.blocker,
    outcomeKind: options.outcomeKind,
    intent: record
  };
  appendText(runtimeIntentsJournalFile(projectRoot), `${JSON.stringify(entry)}\n`);
}

function replayRuntimeIntentsFromJournal(projectRoot: string, seed: RuntimeIntentRecord[] = []): RuntimeIntentRecord[] {
  const records = new Map<string, RuntimeIntentRecord>(seed.map((record) => [record.id, record]));
  for (const entry of loadRuntimeIntentJournal(projectRoot)) {
    records.set(entry.intentId, entry.intent);
  }
  return [...records.values()];
}

function journalEventForStatus(status: RuntimeIntentStatus): RuntimeIntentJournalEvent {
  switch (status) {
    case "confirmed":
      return "confirmed";
    case "dismissed":
      return "dismissed";
    case "pending":
      return "created";
  }
}

function requireRuntimeIntent(projectRoot: string, id: string): RuntimeIntentRecord {
  const record = loadRuntimeIntents(projectRoot).find((intent) => intent.id === id);
  if (!record) {
    throw new Error(`runtime intent not found: ${id}`);
  }
  return record;
}

function withRuntimeIntentsLock<T>(projectRoot: string, fn: () => T): T {
  const filePath = runtimeIntentsFile(projectRoot);
  const lockPath = `${filePath}.lock`;
  fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  const startedAt = Date.now();
  let fd: number | undefined;
  while (fd === undefined) {
    try {
      fd = fs.openSync(lockPath, "wx", 0o600);
      fs.writeFileSync(fd, JSON.stringify({
        pid: process.pid,
        createdAt: nowIso()
      }));
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
      if (code === "EEXIST" && staleRuntimeIntentLock(lockPath)) {
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

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function staleRuntimeIntentLock(lockPath: string): boolean {
  try {
    const stat = fs.statSync(lockPath);
    return Date.now() - stat.mtimeMs > RUNTIME_INTENT_LOCK_STALE_MS;
  } catch {
    return true;
  }
}

function normalizeRuntimeIntent(record: RuntimeIntentRecord): RuntimeIntentRecord {
  const normalizedCommand = record.normalizedCommand ?? normalizeCommand(record.command);
  const risk = record.risk ?? "unsupported";
  const contextFingerprint = [
    record.createdStage ?? "",
    record.graphDigest ?? "",
    record.activeProfileSlug ?? ""
  ].join("\n");
  return {
    ...record,
    normalizedCommand,
    fingerprint: record.fingerprint ?? intentFingerprint(`${record.sessionId}\n${normalizedCommand}\n${risk}\n${contextFingerprint}`),
    source: record.source ?? "agent-command-proposal",
    surface: record.surface ?? "runtime-chat",
    risk,
    safeToAutoRun: record.safeToAutoRun ?? false,
    status: record.status ?? "pending",
    updatedAt: record.updatedAt ?? record.createdAt ?? nowIso()
  };
}

function normalizeRuntimeIntentJournalRecord(record: RuntimeIntentJournalRecord): RuntimeIntentJournalRecord {
  const intent = normalizeRuntimeIntent(record.intent);
  return {
    ...record,
    version: 1,
    sequence: record.sequence,
    at: record.at,
    event: record.event,
    intentId: record.intentId ?? intent.id,
    sessionId: record.sessionId ?? intent.sessionId,
    command: record.command ?? intent.command,
    risk: record.risk ?? intent.risk,
    status: record.status ?? intent.status,
    blocker: record.blocker,
    outcomeKind: record.outcomeKind,
    intent
  };
}

function requireStatus(record: RuntimeIntentRecord, allowed: RuntimeIntentStatus[], verb: string): void {
  if (!allowed.includes(record.status)) {
    throw new Error(`cannot ${verb} runtime intent ${record.id} with status ${record.status}`);
  }
}

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

function intentFingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
