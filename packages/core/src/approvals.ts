import path from "node:path";
import { approvalsFile, documentDir, documentIndexFile } from "./paths";
import { readJsonIfExists, writeJson, writeText } from "./fs";
import { Approval, DocumentId, DocumentIndex } from "./types";
import { newId, nowIso } from "./time";
import { readDocumentIndex, renderDocument, showDocument, stripFrontmatter } from "./documents";

export function approveDocument(projectRoot: string, docId: DocumentId, approvedBy = "user"): Approval {
  const index = readDocumentIndex(projectRoot, docId);
  if (!index.currentVersion) {
    throw new Error(`cannot approve missing document: ${docId}`);
  }
  const approvedAt = nowIso();
  const approval: Approval = {
    id: newId("approval"),
    docId,
    version: index.currentVersion,
    approvedBy,
    approvedAt,
    summary: `${docId} ${index.currentVersion} approved`
  };
  const approvals = readApprovals(projectRoot);
  writeJson(approvalsFile(projectRoot), [...approvals, approval]);
  const nextIndex: DocumentIndex = {
    ...index,
    status: "approved",
    versions: index.versions.map((version) =>
      version.version === index.currentVersion
        ? {
            ...version,
            status: "approved",
            approvedBy,
            approvedAt,
            updatedAt: approvedAt,
            filePath: path.join(documentDir(projectRoot, docId), `${version.version}.md`)
          }
        : version
    )
  };
  writeJson(documentIndexFile(projectRoot, docId), nextIndex);
  const currentMeta = nextIndex.versions.find((version) => version.version === index.currentVersion);
  if (currentMeta) {
    const currentMarkdown = showDocument(projectRoot, docId, currentMeta.version);
    writeText(currentMeta.filePath, renderDocument(docId, currentMeta, stripFrontmatter(currentMarkdown)));
  }
  return approval;
}

export function readApprovals(projectRoot: string): Approval[] {
  return readJsonIfExists<Approval[]>(approvalsFile(projectRoot), []);
}
