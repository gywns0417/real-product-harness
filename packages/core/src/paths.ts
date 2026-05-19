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
