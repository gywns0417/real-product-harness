import fs from "node:fs";
import path from "node:path";
import { releasePlanFile } from "./paths";
import { readJson, writeJson, writeText } from "./fs";
import { ReleasePlanRecord } from "./types";
import { newId, nowIso } from "./time";
import { updateWorkflowEvidence } from "./project";

export function createReleasePlan(projectRoot: string, version: string): ReleasePlanRecord {
  return createPlan(projectRoot, {
    kind: "release",
    sourceBranch: "release",
    targetBranch: "main",
    version,
    title: `Release ${version}`,
    rollbackPlan: "Revert release merge commit or promote previous release tag after user approval."
  });
}

export function listReleasePlans(projectRoot: string): ReleasePlanRecord[] {
  const dir = path.join(projectRoot, ".rph", "releases");
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => readJson<ReleasePlanRecord>(path.join(dir, file)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function readReleasePlan(projectRoot: string, id: string): ReleasePlanRecord {
  return readJson<ReleasePlanRecord>(releasePlanJsonPath(projectRoot, id));
}

export function approveReleasePlan(projectRoot: string, id: string, approvedBy = "user"): ReleasePlanRecord {
  const current = readReleasePlan(projectRoot, id);
  const now = nowIso();
  const next: ReleasePlanRecord = {
    ...current,
    status: "approved",
    userApproval: "approved",
    updatedAt: now
  };
  writeReleasePlan(projectRoot, next);
  syncReleaseWorkflowEvidence(projectRoot, next);
  return next;
}

export function createHotfixPlan(projectRoot: string, title: string): ReleasePlanRecord {
  return createPlan(projectRoot, {
    kind: "hotfix",
    sourceBranch: "hotfix",
    targetBranch: "main",
    version: null,
    title,
    rollbackPlan: "Apply reverse patch to main, then backport to release and dev after user approval."
  });
}

function createPlan(
  projectRoot: string,
  input: Pick<ReleasePlanRecord, "kind" | "sourceBranch" | "targetBranch" | "version" | "title" | "rollbackPlan">
): ReleasePlanRecord {
  const now = nowIso();
  const id = newId(input.kind);
  const filePath = releasePlanFile(projectRoot, id);
  const record: ReleasePlanRecord = {
    id,
    kind: input.kind,
    sourceBranch: input.sourceBranch,
    targetBranch: input.targetBranch,
    version: input.version,
    title: input.title,
    status: "planned",
    userApproval: "required",
    rollbackPlan: input.rollbackPlan,
    filePath,
    createdAt: now,
    updatedAt: now
  };
  writeReleasePlan(projectRoot, record);
  syncReleaseWorkflowEvidence(projectRoot, record);
  return record;
}

function writeReleasePlan(projectRoot: string, record: ReleasePlanRecord): void {
  writeText(record.filePath, renderReleasePlan(record));
  writeJson(releasePlanJsonPath(projectRoot, record.id), record);
}

function syncReleaseWorkflowEvidence(projectRoot: string, record: ReleasePlanRecord): void {
  updateWorkflowEvidence(projectRoot, (evidence) => ({
    ...evidence,
    release: {
      id: record.id,
      version: record.version,
      status: record.status,
      userApproval: record.userApproval,
      filePath: record.filePath,
      updatedAt: record.updatedAt
    }
  }));
}

function releasePlanJsonPath(projectRoot: string, id: string): string {
  return releasePlanFile(projectRoot, id).replace(/\.md$/, ".json");
}

function renderReleasePlan(record: ReleasePlanRecord): string {
  return [
    `# ${record.title}`,
    "",
    `- kind: ${record.kind}`,
    `- source_branch: ${record.sourceBranch}`,
    `- target_branch: ${record.targetBranch}`,
    `- version: ${record.version ?? "null"}`,
    `- status: ${record.status}`,
    `- user_approval: ${record.userApproval}`,
    "",
    "## Gate",
    "No merge is executed by the harness. The user must approve the merge decision.",
    "",
    "## Rollback Plan",
    record.rollbackPlan
  ].join("\n");
}
