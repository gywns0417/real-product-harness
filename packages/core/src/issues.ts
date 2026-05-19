import path from "node:path";
import { deploymentPlanFile, issueFile, issueIndexFile, pullRequestFile } from "./paths";
import { readJson, readJsonIfExists, writeJson, writeText } from "./fs";
import { createBranchName, normalizeLabel } from "./github";
import {
  DeploymentRecord,
  DocumentId,
  PullRequestRecord,
  WorkIssue,
  WorkIssueIndex,
  Workstream
} from "./types";
import { newId, nowIso } from "./time";

export interface CreateWorkIssueInput {
  workstream: Workstream;
  label?: string;
  title: string;
  description?: string;
  acceptanceCriteria?: string[];
  relatedDocs?: DocumentId[];
  relatedScreens?: string[];
  relatedApis?: string[];
  testRequirement?: string;
  qaChecklist?: string[];
}

export function createWorkIssue(projectRoot: string, input: CreateWorkIssueInput): WorkIssue {
  const index = readIssueIndex(projectRoot);
  const issueNumber = index.nextIssueNumber;
  const label = normalizeLabel(input.label ?? "feat");
  const now = nowIso();
  const issue: WorkIssue = {
    issueNumber,
    label,
    title: input.title,
    description: input.description ?? "",
    acceptanceCriteria: input.acceptanceCriteria ?? ["TBD"],
    relatedDocs: input.relatedDocs ?? defaultRelatedDocs(input.workstream),
    relatedScreens: input.relatedScreens ?? [],
    relatedApis: input.relatedApis ?? [],
    branchName: createBranchName(label, issueNumber, input.title),
    assigneeAgent: input.workstream,
    testRequirement: input.testRequirement ?? "lint, test, build must pass before PR",
    qaChecklist: input.qaChecklist ?? [
      "requirements checked",
      "implementation matches PM/PD artifacts",
      "tests recorded",
      "user approval required before merge"
    ],
    status: "planned",
    createdAt: now,
    updatedAt: now
  };
  writeIssue(projectRoot, issue);
  writeIssueIndex(projectRoot, {
    nextIssueNumber: issueNumber + 1,
    issues: [...index.issues, issue]
  });
  return issue;
}

export function readIssueIndex(projectRoot: string): WorkIssueIndex {
  return readJsonIfExists<WorkIssueIndex>(issueIndexFile(projectRoot), { nextIssueNumber: 1, issues: [] });
}

export function listWorkIssues(projectRoot: string): WorkIssue[] {
  return readIssueIndex(projectRoot).issues;
}

export function readWorkIssue(projectRoot: string, issueNumber: number): WorkIssue {
  return readJson<WorkIssue>(issueFile(projectRoot, issueNumber));
}

export function markIssueInProgress(projectRoot: string, issueNumber: number): WorkIssue {
  const issue = readWorkIssue(projectRoot, issueNumber);
  return updateIssue(projectRoot, {
    ...issue,
    status: "in-progress",
    updatedAt: nowIso()
  });
}

export function createPullRequestDraft(
  projectRoot: string,
  issueNumber: number,
  targetBranch: PullRequestRecord["targetBranch"] = "dev"
): PullRequestRecord {
  const issue = readWorkIssue(projectRoot, issueNumber);
  const now = nowIso();
  const record: PullRequestRecord = {
    issueNumber,
    prNumber: null,
    sourceBranch: issue.branchName,
    targetBranch,
    status: "draft",
    qaStatus: "not-requested",
    conflictStatus: "unknown",
    testStatus: "not-run",
    userApproval: "required",
    dryRunCommand: `gh pr create --base ${targetBranch} --head ${issue.branchName} --title "${escapeForShell(issue.title)}" --body-file ${path.join(".rph", "prs", `issue-${issueNumber}.md`)}`,
    createdAt: now,
    updatedAt: now
  };
  writeJson(pullRequestFile(projectRoot, issueNumber), record);
  writeText(path.join(projectRoot, ".rph", "prs", `issue-${issueNumber}.md`), renderPullRequestBody(issue));
  updateIssue(projectRoot, { ...issue, status: "pr-ready", updatedAt: now });
  return record;
}

export function createDevDeploymentPlan(projectRoot: string, provider = "local"): DeploymentRecord {
  const now = nowIso();
  const filePath = deploymentPlanFile(projectRoot, "dev");
  const record: DeploymentRecord = {
    id: newId("deployment"),
    environment: "dev",
    provider,
    status: "planned",
    approvalRequired: true,
    fallback: "local dev server",
    filePath,
    createdAt: now,
    updatedAt: now
  };
  writeText(filePath, renderDeploymentPlan(record));
  writeJson(path.join(projectRoot, ".rph", "deployments", "dev-deployment-plan.json"), record);
  return record;
}

function updateIssue(projectRoot: string, issue: WorkIssue): WorkIssue {
  const index = readIssueIndex(projectRoot);
  const issues = index.issues.map((item) => (item.issueNumber === issue.issueNumber ? issue : item));
  writeIssue(projectRoot, issue);
  writeIssueIndex(projectRoot, { ...index, issues });
  return issue;
}

function writeIssue(projectRoot: string, issue: WorkIssue): void {
  writeJson(issueFile(projectRoot, issue.issueNumber), issue);
}

function writeIssueIndex(projectRoot: string, index: WorkIssueIndex): void {
  writeJson(issueIndexFile(projectRoot), index);
}

function defaultRelatedDocs(workstream: Workstream): DocumentId[] {
  return workstream === "FE"
    ? ["requirements", "screen-definition", "feature-definition", "fe-technical-spec", "api-contract"]
    : ["requirements", "feature-definition", "be-technical-spec", "api-contract"];
}

function renderPullRequestBody(issue: WorkIssue): string {
  return [
    "## Summary",
    issue.description || issue.title,
    "",
    "## Related Issue",
    `#${issue.issueNumber}`,
    "",
    "## Changes",
    "- TBD",
    "",
    "## Test Results",
    "- not run",
    "",
    "## QA Checklist",
    ...issue.qaChecklist.map((item) => `- [ ] ${item}`),
    "",
    "## User Approval Required",
    "yes"
  ].join("\n");
}

function renderDeploymentPlan(record: DeploymentRecord): string {
  return [
    "# Dev Deployment Plan",
    "",
    `- environment: ${record.environment}`,
    `- provider: ${record.provider}`,
    `- status: ${record.status}`,
    `- approval_required: ${record.approvalRequired}`,
    `- fallback: ${record.fallback}`,
    "",
    "## Hook",
    "External cloud deployment is blocked until the user explicitly approves provider credentials and target environment.",
    "",
    "## Fallback",
    "Use local dev server until cloud credentials and approval are present."
  ].join("\n");
}

function escapeForShell(value: string): string {
  return value.replaceAll("\"", "\\\"");
}
