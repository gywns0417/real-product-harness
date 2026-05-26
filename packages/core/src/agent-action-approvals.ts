import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseCli, parseCommandLine, ParsedCommand } from "./commands";
import { readJsonIfExists, writeJson } from "./fs";
import { runtimeActionApprovalsFile } from "./paths";
import { recordRuntimeActionProofEvent } from "./proof-ledger";
import { newId, nowIso } from "./time";
import { RuntimeActionApprovalRecord, RuntimeActionApprovalStatus, RuntimeActionApprovedSnapshot } from "./types";

export interface MutableAgentCommandClassification {
  target: RuntimeActionApprovalRecord["target"];
  action: string;
  risk: RuntimeActionApprovalRecord["risk"];
  description: string;
}

export interface RuntimeActionApprovalRequest {
  sessionId: string;
  command: string;
  reason?: string;
  message?: string;
  approvedTargetId?: string;
  approvedParameters?: Record<string, string>;
  approvedSnapshot?: RuntimeActionApprovedSnapshot;
}

export interface RuntimeActionReadbackProof {
  expectedReadback?: string;
  readbackStatus?: RuntimeActionApprovalRecord["readbackStatus"];
  readbackArtifactPath?: string;
  verifiedTargetId?: string;
  actionApprovalId?: string;
  approvedFingerprint?: string;
  verifiedAt?: string;
}

export interface RuntimeActionReadbackBinding {
  actionApprovalId?: string;
  approvedFingerprint?: string;
  actionRunningAt?: string;
  actionVerifiedAt?: string;
}

export function classifyMutableAgentCommand(command: string): MutableAgentCommandClassification | null {
  let parsed: ParsedCommand;
  try {
    parsed = parseCli(parseCommandLine(command));
  } catch {
    return null;
  }
  switch (parsed.command) {
    case "notion":
      return classifyNotionCommand(parsed);
    case "github":
      return classifyGitHubCommand(parsed);
    case "mcp":
      return classifyMcpCommand(parsed);
    default:
      return null;
  }
}

export function loadRuntimeActionApprovals(projectRoot: string): RuntimeActionApprovalRecord[] {
  return readJsonIfExists<RuntimeActionApprovalRecord[]>(runtimeActionApprovalsFile(projectRoot), [])
    .map(normalizeRuntimeActionApproval);
}

export function recordRuntimeActionApproval(
  projectRoot: string,
  request: RuntimeActionApprovalRequest
): RuntimeActionApprovalRecord {
  return withRuntimeActionApprovalsLock(projectRoot, () => {
    const classification = classifyMutableAgentCommand(request.command);
    if (!classification) {
      throw new Error(`command is not an approval-gated mutable action: ${request.command}`);
    }
    const normalizedCommand = normalizeCommand(request.command);
    const fingerprint = actionFingerprint([
      normalizedCommand,
      request.approvedTargetId ?? "",
      stableJson(request.approvedParameters ?? {}),
      request.approvedSnapshot?.fingerprint ?? ""
    ].join("\n"));
    const current = loadRuntimeActionApprovals(projectRoot);
    const existing = current.find((record) => record.status === "pending" && record.fingerprint === fingerprint);
    if (existing) {
      return existing;
    }
    const now = nowIso();
    const record: RuntimeActionApprovalRecord = {
      id: newId("action_approval"),
      sessionId: request.sessionId,
      command: request.command.trim(),
      normalizedCommand,
      fingerprint,
      source: "agent-command-proposal",
      target: classification.target,
      action: classification.action,
      risk: classification.risk,
      description: classification.description,
      reason: request.reason,
      message: request.message,
      approvedTargetId: request.approvedTargetId,
      approvedParameters: request.approvedParameters,
      approvedSnapshot: request.approvedSnapshot,
      status: "pending",
      createdAt: now,
      updatedAt: now
    };
    writeJson(runtimeActionApprovalsFile(projectRoot), [...current, record]);
    return record;
  });
}

export function approveRuntimeAction(
  projectRoot: string,
  id: string,
  approvedBy = "user"
): RuntimeActionApprovalRecord {
  return updateRuntimeActionApproval(projectRoot, id, (record, now) => {
    requireStatus(record, ["pending"], "approve");
    return {
      ...record,
      status: "approved",
      approvedAt: now,
      approvedBy,
      updatedAt: now
    };
  });
}

export function startRuntimeAction(projectRoot: string, id: string): RuntimeActionApprovalRecord {
  return updateRuntimeActionApproval(projectRoot, id, (record, now) => {
    requireStatus(record, ["approved"], "start");
    return {
      ...record,
      status: "running",
      runningAt: now,
      updatedAt: now
    };
  });
}

export function approveAndStartRuntimeAction(
  projectRoot: string,
  id: string,
  approvedBy = "user"
): RuntimeActionApprovalRecord {
  return updateRuntimeActionApproval(projectRoot, id, (record, now) => {
    requireStatus(record, ["pending"], "approve and start");
    return {
      ...record,
      status: "running",
      approvedAt: now,
      approvedBy,
      runningAt: now,
      updatedAt: now
    };
  });
}

export function completeRuntimeAction(
  projectRoot: string,
  id: string,
  resultSummary: string,
  readback?: RuntimeActionReadbackProof
): RuntimeActionApprovalRecord {
  const next = updateRuntimeActionApproval(projectRoot, id, (record, now) => {
    requireStatus(record, ["running"], "complete");
    return {
      ...record,
      status: "completed",
      completedAt: now,
      expectedReadback: readback?.expectedReadback,
      readbackStatus: readback?.readbackStatus,
      readbackArtifactPath: readback?.readbackArtifactPath,
      verifiedTargetId: readback?.verifiedTargetId,
      readbackActionApprovalId: readback?.actionApprovalId,
      readbackApprovedFingerprint: readback?.approvedFingerprint,
      readbackVerifiedAt: readback?.verifiedAt,
      resultSummary,
      updatedAt: now
    };
  });
  recordRuntimeActionProofEvent(projectRoot, next);
  return next;
}

export function failRuntimeAction(
  projectRoot: string,
  id: string,
  failureReason: string,
  readback?: RuntimeActionReadbackProof
): RuntimeActionApprovalRecord {
  const next = updateRuntimeActionApproval(projectRoot, id, (record, now) => {
    requireStatus(record, ["approved", "running"], "fail");
    return {
      ...record,
      status: "failed",
      failedAt: now,
      failureReason,
      expectedReadback: readback?.expectedReadback,
      readbackStatus: readback?.readbackStatus,
      readbackArtifactPath: readback?.readbackArtifactPath,
      verifiedTargetId: readback?.verifiedTargetId,
      readbackActionApprovalId: readback?.actionApprovalId,
      readbackApprovedFingerprint: readback?.approvedFingerprint,
      readbackVerifiedAt: readback?.verifiedAt,
      updatedAt: now
    };
  });
  recordRuntimeActionProofEvent(projectRoot, next);
  return next;
}

export function rejectRuntimeAction(
  projectRoot: string,
  id: string,
  rejectReason = "rejected",
  rejectedBy = "user"
): RuntimeActionApprovalRecord {
  return updateRuntimeActionApproval(projectRoot, id, (record, now) => {
    requireStatus(record, ["pending"], "reject");
    return {
      ...record,
      status: "rejected",
      rejectedAt: now,
      rejectedBy,
      rejectReason,
      updatedAt: now
    };
  });
}

export function runtimeActionReadbackBindingFromEnv(env: NodeJS.ProcessEnv = process.env): RuntimeActionReadbackBinding | null {
  const actionApprovalId = env.RPH_ACTION_APPROVAL_ID?.trim();
  const approvedFingerprint = env.RPH_ACTION_APPROVAL_FINGERPRINT?.trim();
  const actionRunningAt = env.RPH_ACTION_RUNNING_AT?.trim();
  if (!actionApprovalId || !approvedFingerprint || !actionRunningAt) {
    return null;
  }
  return {
    actionApprovalId,
    approvedFingerprint,
    actionRunningAt,
    actionVerifiedAt: nowIso()
  };
}

export function attachRuntimeActionReadbackBinding<T extends object>(
  proof: T,
  env: NodeJS.ProcessEnv = process.env
): T & RuntimeActionReadbackBinding {
  const binding = runtimeActionReadbackBindingFromEnv(env);
  if (!binding) {
    return proof as T & RuntimeActionReadbackBinding;
  }
  return {
    ...proof,
    ...binding
  };
}

export function runtimeActionReadbackBindingError(
  action: RuntimeActionApprovalRecord,
  proof: unknown
): string | null {
  const value = proof && typeof proof === "object" ? proof as RuntimeActionReadbackBinding : {};
  if (value.actionApprovalId !== action.id) {
    return `readback action id mismatch: expected ${action.id}, got ${value.actionApprovalId ?? "missing"}`;
  }
  if (value.approvedFingerprint !== action.fingerprint) {
    return `readback fingerprint mismatch: expected ${action.fingerprint}, got ${value.approvedFingerprint ?? "missing"}`;
  }
  const verifiedAt = value.actionVerifiedAt ?? verifiedAtFromProof(proof);
  if (!verifiedAt) {
    return "readback verified timestamp missing";
  }
  const runningAt = action.runningAt;
  if (runningAt && Date.parse(verifiedAt) < Date.parse(runningAt)) {
    return `readback is stale: verifiedAt ${verifiedAt} is before action runningAt ${runningAt}`;
  }
  return null;
}

function classifyNotionCommand(parsed: ParsedCommand): MutableAgentCommandClassification | null {
  if (parsed.options.live !== true) {
    return null;
  }
  if (parsed.subcommand === "setup") {
    return {
      target: "notion",
      action: "workspace.setup.live",
      risk: "external_live_write",
      description: "Create or update the live Notion workspace dashboard and tracking databases."
    };
  }
  if (parsed.subcommand === "sync" || parsed.subcommand === "export-docs") {
    return {
      target: "notion",
      action: "workspace.sync.live",
      risk: "external_live_write",
      description: "Write the current harness summary into Notion and read it back."
    };
  }
  return null;
}

function classifyGitHubCommand(parsed: ParsedCommand): MutableAgentCommandClassification | null {
  if (parsed.subcommand === "create-repo") {
    return {
      target: "github",
      action: "repo.create",
      risk: "external_live_write",
      description: "Create or connect the configured GitHub repository and push the local source."
    };
  }
  if (parsed.subcommand === "setup-labels") {
    return {
      target: "github",
      action: "labels.apply",
      risk: "external_live_write",
      description: "Apply labels to the configured GitHub repository."
    };
  }
  if (parsed.subcommand === "create-issue" && parsed.options.live === true) {
    return {
      target: "github",
      action: "issue.create",
      risk: "external_live_write",
      description: "Create a GitHub issue in the configured repository."
    };
  }
  if (parsed.subcommand === "create-pr" && parsed.options.live === true) {
    return {
      target: "github",
      action: "pr.create",
      risk: "external_live_write",
      description: "Create a GitHub pull request in the configured repository."
    };
  }
  return null;
}

function classifyMcpCommand(parsed: ParsedCommand): MutableAgentCommandClassification | null {
  if (parsed.subcommand !== "call") {
    return null;
  }
  const target = parseMcpCallTarget(parsed.args);
  if (!target) {
    return null;
  }
  const action = `${target.server}.${target.tool}`;
  if (!KNOWN_MUTABLE_MCP_ACTIONS.has(action)) {
    return null;
  }
  return {
    target: "mcp",
    action,
    risk: "external_live_write",
    description: `Call mutating MCP tool ${action}.`
  };
}

function parseMcpCallTarget(args: string[]): { server: string; tool: string } | null {
  const [first, second] = args;
  if (!first) {
    return null;
  }
  if (first.includes(".")) {
    const [server, ...toolParts] = first.split(".");
    const tool = toolParts.join(".");
    if (server && tool) {
      return { server, tool };
    }
  }
  if (second) {
    return { server: first, tool: second };
  }
  return null;
}

const KNOWN_MUTABLE_MCP_ACTIONS = new Set([
  "stitch.create_project"
]);

const RUNTIME_ACTION_APPROVAL_LOCK_STALE_MS = 30_000;

function updateRuntimeActionApproval(
  projectRoot: string,
  id: string,
  updater: (record: RuntimeActionApprovalRecord, now: string) => RuntimeActionApprovalRecord
): RuntimeActionApprovalRecord {
  return withRuntimeActionApprovalsLock(projectRoot, () => {
    const current = loadRuntimeActionApprovals(projectRoot);
    const index = current.findIndex((record) => record.id === id);
    if (index < 0) {
      throw new Error(`action approval not found: ${id}`);
    }
    const next = [...current];
    const updated = updater(current[index], nowIso());
    next[index] = updated;
    writeJson(runtimeActionApprovalsFile(projectRoot), next);
    return updated;
  });
}

function withRuntimeActionApprovalsLock<T>(projectRoot: string, fn: () => T): T {
  const filePath = runtimeActionApprovalsFile(projectRoot);
  const lockPath = `${filePath}.lock`;
  fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 });
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
      if (code === "EEXIST" && staleRuntimeActionApprovalLock(lockPath)) {
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

function staleRuntimeActionApprovalLock(lockPath: string): boolean {
  try {
    const stat = fs.statSync(lockPath);
    return Date.now() - stat.mtimeMs > RUNTIME_ACTION_APPROVAL_LOCK_STALE_MS;
  } catch {
    return true;
  }
}

function normalizeRuntimeActionApproval(record: RuntimeActionApprovalRecord): RuntimeActionApprovalRecord {
  return {
    ...record,
    normalizedCommand: record.normalizedCommand ?? normalizeCommand(record.command),
    fingerprint: record.fingerprint ?? actionFingerprint(record.command),
    source: record.source ?? "agent-command-proposal",
    risk: record.risk ?? "external_live_write",
    status: record.status ?? "pending",
    updatedAt: record.updatedAt ?? record.createdAt ?? nowIso()
  };
}

function requireStatus(
  record: RuntimeActionApprovalRecord,
  allowed: RuntimeActionApprovalStatus[],
  verb: string
): void {
  if (!allowed.includes(record.status)) {
    throw new Error(`cannot ${verb} action ${record.id} while status=${record.status}`);
  }
}

function normalizeCommand(command: string): string {
  return parseCli(parseCommandLine(command)).command
    ? parseCommandLine(command).join(" ")
    : command.trim();
}

function actionFingerprint(command: string): string {
  return createHash("sha256").update(command.trim()).digest("hex").slice(0, 16);
}

function verifiedAtFromProof(proof: unknown): string | undefined {
  if (!proof || typeof proof !== "object") {
    return undefined;
  }
  const record = proof as Record<string, unknown>;
  const direct = stringRecordValue(record, "verifiedAt")
    ?? stringRecordValue(record, "readbackAt")
    ?? stringRecordValue(record, "appliedAt");
  if (direct) {
    return direct;
  }
  const dashboard = record.dashboardReadback;
  if (dashboard && typeof dashboard === "object") {
    return stringRecordValue(dashboard as Record<string, unknown>, "readbackAt");
  }
  return undefined;
}

function stringRecordValue(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function stableJson(value: Record<string, string>): string {
  return JSON.stringify(Object.keys(value).sort().reduce<Record<string, string>>((result, key) => {
    result[key] = value[key];
    return result;
  }, {}));
}
