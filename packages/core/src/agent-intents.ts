import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readJsonIfExists, writeJson } from "./fs";
import { runtimeIntentsFile } from "./paths";
import { newId, nowIso } from "./time";
import { RuntimeIntentRecord, RuntimeIntentRisk, RuntimeIntentStatus } from "./types";

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
  return readJsonIfExists<RuntimeIntentRecord[]>(runtimeIntentsFile(projectRoot), [])
    .map(normalizeRuntimeIntent);
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
    writeJson(runtimeIntentsFile(projectRoot), [...current, record]);
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
    writeJson(runtimeIntentsFile(projectRoot), next);
    return updated;
  });
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
