import fs from "node:fs";
import path from "node:path";
import { documentDir, documentIndexFile } from "./paths";
import { ensureDir, fileExists, readJsonIfExists, writeJson, writeText } from "./fs";
import { AgentRole, DOCUMENT_IDS, DocumentId, DocumentIndex, DocumentStatus, DocumentVersionMeta, ProjectState } from "./types";
import { nowIso } from "./time";

export const DOCUMENT_TITLES: Record<DocumentId, string> = {
  "product-definition": "제품 정의서",
  "competitor-analysis": "경쟁사/유사 서비스 분석",
  differentiation: "차별점 강화 제안",
  requirements: "요구사항 정의서",
  "screen-definition": "화면 정의서",
  "feature-definition": "기능 정의서"
};

export interface CreateDocumentOptions {
  ownerAgent?: AgentRole;
  status?: DocumentStatus;
  changeSummary: string;
  body?: string;
  version?: string;
}

export function isDocumentId(value: string): value is DocumentId {
  return (DOCUMENT_IDS as readonly string[]).includes(value);
}

export function createDocumentVersion(projectRoot: string, docId: DocumentId, options: CreateDocumentOptions): DocumentIndex {
  const dir = documentDir(projectRoot, docId);
  ensureDir(dir);
  const index = readDocumentIndex(projectRoot, docId);
  const version = options.version ?? nextVersion(index.currentVersion);
  const createdAt = nowIso();
  const filePath = path.join(dir, `${version}.md`);
  if (fileExists(filePath)) {
    throw new Error(`document version already exists: ${docId} ${version}`);
  }
  const meta: DocumentVersionMeta = {
    version,
    status: options.status ?? "draft",
    ownerAgent: options.ownerAgent ?? "PM",
    createdAt,
    updatedAt: createdAt,
    changeSummary: options.changeSummary,
    filePath,
    relatedIssues: [],
    relatedPrs: [],
    approvedBy: null,
    approvedAt: null,
    rollbackAvailable: true
  };
  writeText(filePath, renderDocument(docId, meta, options.body ?? defaultBody(docId)));
  const nextIndex: DocumentIndex = {
    docId,
    currentVersion: version,
    status: meta.status,
    versions: [...index.versions, meta]
  };
  writeJson(documentIndexFile(projectRoot, docId), nextIndex);
  return nextIndex;
}

export function readDocumentIndex(projectRoot: string, docId: DocumentId): DocumentIndex {
  return readJsonIfExists<DocumentIndex>(documentIndexFile(projectRoot, docId), {
    docId,
    currentVersion: null,
    status: "draft",
    versions: []
  });
}

export function listDocumentIndexes(projectRoot: string): DocumentIndex[] {
  return DOCUMENT_IDS.map((docId) => readDocumentIndex(projectRoot, docId)).filter((index) => index.currentVersion !== null);
}

export function showDocument(projectRoot: string, docId: DocumentId, version?: string): string {
  const index = readDocumentIndex(projectRoot, docId);
  const selected = version ?? index.currentVersion;
  if (!selected) {
    throw new Error(`document not found: ${docId}`);
  }
  const filePath = path.join(documentDir(projectRoot, docId), `${selected}.md`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`document version not found: ${docId} ${selected}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

export function diffDocumentVersions(projectRoot: string, docId: DocumentId, fromVersion: string, toVersion: string): string {
  const from = showDocument(projectRoot, docId, fromVersion).split(/\r?\n/);
  const to = showDocument(projectRoot, docId, toVersion).split(/\r?\n/);
  const max = Math.max(from.length, to.length);
  const lines: string[] = [`diff ${docId} ${fromVersion}..${toVersion}`];
  for (let i = 0; i < max; i += 1) {
    const left = from[i];
    const right = to[i];
    if (left === right) {
      continue;
    }
    if (left !== undefined) {
      lines.push(`- ${left}`);
    }
    if (right !== undefined) {
      lines.push(`+ ${right}`);
    }
  }
  return lines.join("\n");
}

export function rollbackDocument(projectRoot: string, docId: DocumentId, toVersion: string): DocumentIndex {
  const source = showDocument(projectRoot, docId, toVersion);
  const body = stripFrontmatter(source);
  return createDocumentVersion(projectRoot, docId, {
    changeSummary: `Rollback to ${toVersion}`,
    status: "revised",
    body
  });
}

export function syncStateDocuments(state: ProjectState, index: DocumentIndex): ProjectState {
  return {
    ...state,
    documents: {
      ...state.documents,
      [index.docId]: index
    },
    updatedAt: nowIso()
  };
}

export function nextVersion(current: string | null): string {
  if (!current) {
    return "v1.0.0";
  }
  const match = current.match(/^v(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return "v1.0.0";
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]) + 1;
  return `v${major}.${minor}.${patch}`;
}

export function renderDocument(docId: DocumentId, meta: DocumentVersionMeta, body: string): string {
  const frontmatter = [
    "---",
    `doc_id: ${docId}`,
    `version: ${meta.version}`,
    `status: ${meta.status}`,
    `owner_agent: ${meta.ownerAgent}`,
    `created_at: ${meta.createdAt}`,
    `updated_at: ${meta.updatedAt}`,
    `approved_by: ${meta.approvedBy ?? "null"}`,
    `approved_at: ${meta.approvedAt ?? "null"}`,
    "related_issues: []",
    "related_prs: []",
    `change_summary: "${meta.changeSummary.replaceAll('"', '\\"')}"`,
    "---"
  ];
  return `${frontmatter.join("\n")}\n\n${body.trim()}\n`;
}

export function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith("---")) {
    return markdown;
  }
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) {
    return markdown;
  }
  return markdown.slice(end + 4).trim();
}

function defaultBody(docId: DocumentId): string {
  switch (docId) {
    case "product-definition":
      return [
        `# ${DOCUMENT_TITLES[docId]}`,
        "",
        "## 제품명",
        "TBD",
        "",
        "## 한 줄 설명",
        "TBD",
        "",
        "## 해결하려는 문제",
        "TBD",
        "",
        "## 주요 사용자",
        "TBD",
        "",
        "## 초기 MVP 범위",
        "TBD",
        "",
        "## 제외 범위",
        "TBD",
        "",
        "## 성공 기준",
        "TBD",
        "",
        "## 검증해야 할 질문",
        "- TBD"
      ].join("\n");
    case "requirements":
      return [
        `# ${DOCUMENT_TITLES[docId]}`,
        "",
        "## 비즈니스 요구사항",
        "- TBD",
        "",
        "## 기능 요구사항",
        "- TBD",
        "",
        "## 비기능 요구사항",
        "- TBD",
        "",
        "## 승인 기준",
        "- TBD"
      ].join("\n");
    case "screen-definition":
      return [
        `# ${DOCUMENT_TITLES[docId]}`,
        "",
        "## 페이지 목록",
        "- TBD",
        "",
        "## 상태별 화면",
        "- loading",
        "- empty",
        "- error",
        "- success"
      ].join("\n");
    case "feature-definition":
      return [
        `# ${DOCUMENT_TITLES[docId]}`,
        "",
        "## 기능 목록",
        "| 기능 ID | 기능명 | 우선순위 | 승인 기준 |",
        "| --- | --- | --- | --- |",
        "| F-001 | TBD | P0 | TBD |"
      ].join("\n");
    case "competitor-analysis":
      return [
        `# ${DOCUMENT_TITLES[docId]}`,
        "",
        "## 분석 대상",
        "- TBD",
        "",
        "## 차별화 가능한 지점",
        "- TBD"
      ].join("\n");
    case "differentiation":
      return [
        `# ${DOCUMENT_TITLES[docId]}`,
        "",
        "## 강점",
        "- TBD",
        "",
        "## 약점",
        "- TBD",
        "",
        "## 포지셔닝 문장",
        "TBD"
      ].join("\n");
  }
}
