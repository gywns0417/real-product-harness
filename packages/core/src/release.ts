import { releasePlanFile } from "./paths";
import { writeJson, writeText } from "./fs";
import { ReleasePlanRecord } from "./types";
import { newId, nowIso } from "./time";

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
  writeText(filePath, renderReleasePlan(record));
  writeJson(filePath.replace(/\.md$/, ".json"), record);
  return record;
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
