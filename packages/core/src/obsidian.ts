import path from "node:path";
import { DESIGN_ARTIFACT_IDS, DesignArtifactId, DOCUMENT_IDS, DocumentId } from "./types";
import { ensureDir, writeText } from "./fs";
import { showDocument } from "./documents";
import { showDesignArtifact } from "./design";

export const OBSIDIAN_STRUCTURE = [
  "00_Meta",
  "01_PM/product-definition",
  "01_PM/competitor-analysis",
  "01_PM/differentiation",
  "01_PM/requirements",
  "01_PM/screen-definition",
  "01_PM/feature-definition",
  "02_PD/references",
  "02_PD/directions",
  "02_PD/landing-preview",
  "02_PD/design-system",
  "02_PD/page-designs",
  "03_FE/technical-spec",
  "03_FE/sprints",
  "03_FE/issues",
  "03_FE/implementation-notes",
  "04_BE/technical-spec",
  "04_BE/api-contract",
  "04_BE/data-model",
  "04_BE/sprints",
  "04_BE/issues",
  "04_BE/deployment",
  "05_QA/reviews",
  "05_QA/test-results",
  "05_QA/conflict-checks",
  "06_GitHub",
  "07_Versions"
];

export function createObsidianProject(vaultProjectPath: string): string[] {
  const files: string[] = [];
  for (const folder of OBSIDIAN_STRUCTURE) {
    ensureDir(path.join(vaultProjectPath, folder));
  }
  const metaFiles: Record<string, string> = {
    "00_Meta/project-state.md": "# Project State\n\n- status: setup\n",
    "00_Meta/decisions.md": "# Decisions\n\n",
    "00_Meta/approvals.md": "# Approvals\n\n",
    "00_Meta/glossary.md": "# Glossary\n\n",
    "06_GitHub/issues.md": "# Issues\n\n",
    "06_GitHub/prs.md": "# PRs\n\n",
    "06_GitHub/branch-map.md": "# Branch Map\n\n",
    "07_Versions/document-version-index.md": "# Document Version Index\n\n"
  };
  for (const [relativePath, content] of Object.entries(metaFiles)) {
    const filePath = path.join(vaultProjectPath, relativePath);
    writeText(filePath, content);
    files.push(filePath);
  }
  return files;
}

export function exportDocumentToObsidian(projectRoot: string, vaultProjectPath: string, docId: DocumentId): string {
  const markdown = showDocument(projectRoot, docId);
  const targetDir = path.join(vaultProjectPath, "01_PM", docId);
  ensureDir(targetDir);
  const filePath = path.join(targetDir, `${docId}.md`);
  writeText(filePath, markdown);
  return filePath;
}

export function documentObsidianPath(vaultProjectPath: string, docId: DocumentId): string {
  if (!DOCUMENT_IDS.includes(docId)) {
    throw new Error(`unsupported document id: ${docId}`);
  }
  return path.join(vaultProjectPath, "01_PM", docId, `${docId}.md`);
}

export function exportDesignArtifactToObsidian(projectRoot: string, vaultProjectPath: string, artifactId: DesignArtifactId): string {
  const markdown = showDesignArtifact(projectRoot, artifactId);
  const targetDir = path.join(vaultProjectPath, "02_PD", artifactId);
  ensureDir(targetDir);
  const filePath = path.join(targetDir, `${artifactId}.md`);
  writeText(filePath, markdown);
  return filePath;
}

export function designArtifactObsidianPath(vaultProjectPath: string, artifactId: DesignArtifactId): string {
  if (!DESIGN_ARTIFACT_IDS.includes(artifactId)) {
    throw new Error(`unsupported design artifact id: ${artifactId}`);
  }
  return path.join(vaultProjectPath, "02_PD", artifactId, `${artifactId}.md`);
}
