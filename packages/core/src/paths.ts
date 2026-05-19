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
