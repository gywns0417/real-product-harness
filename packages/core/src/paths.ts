import path from "node:path";

export function rphDir(projectRoot: string): string {
  return path.join(projectRoot, ".rph");
}

export function projectFile(projectRoot: string): string {
  return path.join(rphDir(projectRoot), "project.json");
}

export function stateFile(projectRoot: string): string {
  return path.join(rphDir(projectRoot), "state.json");
}

export function setupChoicesFile(projectRoot: string): string {
  return path.join(rphDir(projectRoot), "setup-choices.json");
}

export function harnessConfigFile(projectRoot: string): string {
  return path.join(rphDir(projectRoot), "config.json");
}

export function connectionReportsDir(projectRoot: string): string {
  return path.join(rphDir(projectRoot), "connections");
}

export function connectionReportFile(projectRoot: string): string {
  return path.join(connectionReportsDir(projectRoot), "latest.json");
}

export function aiRunsDir(projectRoot: string): string {
  return path.join(rphDir(projectRoot), "ai", "runs");
}

export function aiRunFile(projectRoot: string, runId: string): string {
  return path.join(aiRunsDir(projectRoot), `${runId}.json`);
}

export function aiChatDir(projectRoot: string): string {
  return path.join(rphDir(projectRoot), "ai", "chat");
}

export function aiChatFile(projectRoot: string, sessionId: string): string {
  return path.join(aiChatDir(projectRoot), `${sessionId}.jsonl`);
}

export function runtimeDir(projectRoot: string): string {
  return path.join(rphDir(projectRoot), "runtime");
}

export function runtimeSessionFile(projectRoot: string): string {
  return path.join(runtimeDir(projectRoot), "current-session.json");
}

export function runtimeSessionsDir(projectRoot: string): string {
  return path.join(runtimeDir(projectRoot), "sessions");
}

export function runtimeSessionJournalFile(projectRoot: string, sessionId: string): string {
  return path.join(runtimeSessionsDir(projectRoot), `${safePathSegment(sessionId)}.jsonl`);
}

export function runtimeSessionSnapshotFile(projectRoot: string, sessionId: string): string {
  return path.join(runtimeSessionsDir(projectRoot), `${safePathSegment(sessionId)}.latest.json`);
}

export function runtimeHandoffsFile(projectRoot: string): string {
  return path.join(runtimeDir(projectRoot), "handoffs.json");
}

export function runtimeExecutionGraphFile(projectRoot: string): string {
  return path.join(runtimeDir(projectRoot), "execution-graph.json");
}

export function runtimeActionApprovalsFile(projectRoot: string): string {
  return path.join(runtimeDir(projectRoot), "action-approvals.json");
}

export function runtimeLaneRunsDir(projectRoot: string): string {
  return path.join(runtimeDir(projectRoot), "lanes");
}

export function runtimeLaneRunFile(projectRoot: string, runId: string): string {
  return path.join(runtimeLaneRunsDir(projectRoot), `${runId}.json`);
}

export function runtimeLaneMemoryDir(projectRoot: string): string {
  return path.join(runtimeLaneRunsDir(projectRoot), "memory");
}

export function runtimeLaneMemoryFile(projectRoot: string, role: string): string {
  return path.join(runtimeLaneMemoryDir(projectRoot), `${role.toLowerCase()}.jsonl`);
}

export function customAgentsDir(projectRoot: string): string {
  return path.join(rphDir(projectRoot), "agents");
}

export function customAgentProfileFile(projectRoot: string, slug: string): string {
  return path.join(customAgentsDir(projectRoot), `${slug}.json`);
}

export function activeCustomAgentFile(projectRoot: string): string {
  return path.join(customAgentsDir(projectRoot), "active.json");
}

export function proofLedgerDir(projectRoot: string): string {
  return path.join(rphDir(projectRoot), "proofs");
}

export function proofLedgerFile(projectRoot: string): string {
  return path.join(proofLedgerDir(projectRoot), "ledger.jsonl");
}

export function proofLedgerLatestFile(projectRoot: string): string {
  return path.join(proofLedgerDir(projectRoot), "latest.json");
}

export function goldenPathDir(projectRoot: string): string {
  return path.join(rphDir(projectRoot), "golden-path");
}

export function goldenPathReportFile(projectRoot: string): string {
  return path.join(goldenPathDir(projectRoot), "latest.json");
}

export function goldenPathReportMarkdownFile(projectRoot: string): string {
  return path.join(goldenPathDir(projectRoot), "latest.md");
}

export function documentsDir(projectRoot: string): string {
  return path.join(rphDir(projectRoot), "documents");
}

export function documentDir(projectRoot: string, docId: string): string {
  return path.join(documentsDir(projectRoot), docId);
}

export function documentIndexFile(projectRoot: string, docId: string): string {
  return path.join(documentDir(projectRoot, docId), "index.json");
}

export function approvalsFile(projectRoot: string): string {
  return path.join(rphDir(projectRoot), "approvals", "approvals.json");
}

export function designApprovalsFile(projectRoot: string): string {
  return path.join(rphDir(projectRoot), "approvals", "design-approvals.json");
}

export function interviewsDir(projectRoot: string, docId: string): string {
  return path.join(rphDir(projectRoot), "interviews", docId);
}

export function githubDir(projectRoot: string): string {
  return path.join(rphDir(projectRoot), "github");
}

export function githubRepoReadbackFile(projectRoot: string): string {
  return path.join(githubDir(projectRoot), "live-repo-readback.json");
}

export function githubLabelsReadbackFile(projectRoot: string): string {
  return path.join(githubDir(projectRoot), "live-labels-readback.json");
}

export function githubIssueReadbackFile(projectRoot: string, issueNumber: number): string {
  return path.join(githubDir(projectRoot), `live-issue-${issueNumber}-readback.json`);
}

export function githubIssueLatestReadbackFile(projectRoot: string): string {
  return path.join(githubDir(projectRoot), "live-issue-latest-readback.json");
}

export function githubPullRequestReadbackFile(projectRoot: string, prNumber: number): string {
  return path.join(githubDir(projectRoot), `live-pr-${prNumber}-readback.json`);
}

export function githubPullRequestLatestReadbackFile(projectRoot: string): string {
  return path.join(githubDir(projectRoot), "live-pr-latest-readback.json");
}

export function mcpDir(projectRoot: string): string {
  return path.join(rphDir(projectRoot), "mcp");
}

export function mcpToolCallSnapshotFile(
  projectRoot: string,
  serverId: string,
  toolName: string,
  fingerprint: string
): string {
  return path.join(
    mcpDir(projectRoot),
    `approval-${safePathSegment(serverId)}-${safePathSegment(toolName)}-${safePathSegment(fingerprint)}.json`
  );
}

export function mcpToolCallReadbackFile(projectRoot: string, actionApprovalId: string): string {
  return path.join(mcpDir(projectRoot), `live-tool-call-${safePathSegment(actionApprovalId)}-readback.json`);
}

export function githubBranchPlanFile(projectRoot: string): string {
  return path.join(githubDir(projectRoot), "branch-plan.md");
}

export function designDir(projectRoot: string): string {
  return path.join(rphDir(projectRoot), "design");
}

export function designArtifactDir(projectRoot: string, artifactId: string): string {
  return path.join(designDir(projectRoot), artifactId);
}

export function designArtifactIndexFile(projectRoot: string, artifactId: string): string {
  return path.join(designArtifactDir(projectRoot, artifactId), "index.json");
}

export function issuesDir(projectRoot: string): string {
  return path.join(rphDir(projectRoot), "issues");
}

export function workDir(projectRoot: string): string {
  return path.join(rphDir(projectRoot), "work");
}

export function workExecutionFile(projectRoot: string, issueNumber: number): string {
  return path.join(workDir(projectRoot), `issue-${issueNumber}-execution.md`);
}

export function issueIndexFile(projectRoot: string): string {
  return path.join(issuesDir(projectRoot), "index.json");
}

export function issueFile(projectRoot: string, issueNumber: number): string {
  return path.join(issuesDir(projectRoot), `issue-${issueNumber}.json`);
}

export function pullRequestsDir(projectRoot: string): string {
  return path.join(rphDir(projectRoot), "prs");
}

export function pullRequestIndexFile(projectRoot: string): string {
  return path.join(pullRequestsDir(projectRoot), "index.json");
}

export function pullRequestFile(projectRoot: string, issueNumber: number): string {
  return path.join(pullRequestsDir(projectRoot), `issue-${issueNumber}.json`);
}

export function pullRequestNumberFile(projectRoot: string, prNumber: number): string {
  return path.join(pullRequestsDir(projectRoot), `pr-${prNumber}.json`);
}

export function deploymentsDir(projectRoot: string): string {
  return path.join(rphDir(projectRoot), "deployments");
}

export function deploymentPlanFile(projectRoot: string, environment: string): string {
  return path.join(deploymentsDir(projectRoot), `${environment}-deployment-plan.md`);
}

export function qaDir(projectRoot: string): string {
  return path.join(rphDir(projectRoot), "qa");
}

function safePathSegment(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9._-]/g, "_");
  return safe || "session";
}

export function qaReportFile(projectRoot: string, prNumber: number): string {
  return path.join(qaDir(projectRoot), `pr-${prNumber}-report.json`);
}

export function qaReportMarkdownFile(projectRoot: string, prNumber: number): string {
  return path.join(qaDir(projectRoot), `pr-${prNumber}-report.md`);
}

export function releasesDir(projectRoot: string): string {
  return path.join(rphDir(projectRoot), "releases");
}

export function releasePlanFile(projectRoot: string, id: string): string {
  return path.join(releasesDir(projectRoot), `${id}.md`);
}

export function notionDir(projectRoot: string): string {
  return path.join(rphDir(projectRoot), "notion");
}

export function notionPlanFile(projectRoot: string): string {
  return path.join(notionDir(projectRoot), "workspace-plan.json");
}

export function notionPlanMarkdownFile(projectRoot: string): string {
  return path.join(notionDir(projectRoot), "workspace-plan.md");
}

export function notionSyncPayloadFile(projectRoot: string): string {
  return path.join(notionDir(projectRoot), "sync-payload.json");
}

export function notionLiveWorkspaceFile(projectRoot: string): string {
  return path.join(notionDir(projectRoot), "live-workspace.json");
}

export function notionLiveSyncReadbackFile(projectRoot: string): string {
  return path.join(notionDir(projectRoot), "live-sync-readback.json");
}
