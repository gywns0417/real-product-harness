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
  "feature-definition": "기능 정의서",
  "fe-technical-spec": "FE 기술 기능 명세서",
  "be-technical-spec": "BE 기술 기능 명세서",
  "api-contract": "API Contract",
  "fe-sprint-plan": "FE 스프린트 계획",
  "be-sprint-plan": "BE 스프린트 계획"
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
        "## 사용자 페르소나",
        "TBD",
        "",
        "## 핵심 가치",
        "TBD",
        "",
        "## 사용자가 얻는 결과",
        "TBD",
        "",
        "## 제품 범위",
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
        "## 실패 기준",
        "TBD",
        "",
        "## 장기 확장 가능성",
        "TBD",
        "",
        "## 리스크",
        "- TBD",
        "",
        "## 가정",
        "- TBD",
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
        "## 사용자 요구사항",
        "- TBD",
        "",
        "## 기능 요구사항",
        "- TBD",
        "",
        "## 비기능 요구사항",
        "- TBD",
        "",
        "## 데이터 요구사항",
        "- TBD",
        "",
        "## 보안 요구사항",
        "- TBD",
        "",
        "## 접근성 요구사항",
        "- TBD",
        "",
        "## 성능 요구사항",
        "- TBD",
        "",
        "## 운영 요구사항",
        "- TBD",
        "",
        "## 배포 요구사항",
        "- TBD",
        "",
        "## 분석/로그 요구사항",
        "- TBD",
        "",
        "## 권한/인증 요구사항",
        "- TBD",
        "",
        "## 예외 케이스",
        "- TBD",
        "",
        "## 우선순위",
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
        "## 페이지 목적",
        "TBD",
        "",
        "## 진입 경로",
        "TBD",
        "",
        "## 사용자 액션",
        "- TBD",
        "",
        "## 화면 구성 요소",
        "- TBD",
        "",
        "## 상태별 화면",
        "- loading",
        "- empty",
        "- error",
        "- success",
        "",
        "## 반응형 고려사항",
        "- TBD",
        "",
        "## 권한별 화면 차이",
        "- TBD",
        "",
        "## 연결 기능",
        "- TBD",
        "",
        "## 관련 API",
        "- TBD",
        "",
        "## 관련 데이터",
        "- TBD",
        "",
        "## 관련 사용자 시나리오",
        "- TBD"
      ].join("\n");
    case "feature-definition":
      return [
        `# ${DOCUMENT_TITLES[docId]}`,
        "",
        "## 기능 목록",
        "| 기능 ID | 기능명 | 우선순위 | 승인 기준 |",
        "| --- | --- | --- | --- |",
        "| F-001 | TBD | P0 | TBD |",
        "",
        "## 기능 상세 템플릿",
        "",
        "### F-001 TBD",
        "- 기능 설명: TBD",
        "- 사용자 스토리: TBD",
        "- 입력값: TBD",
        "- 출력값: TBD",
        "- 처리 흐름: TBD",
        "- 예외 흐름: TBD",
        "- 권한 조건: TBD",
        "- 관련 화면: TBD",
        "- 관련 API: TBD",
        "- 관련 데이터 모델: TBD",
        "- 개발 난이도: TBD",
        "- 테스트 기준: TBD"
      ].join("\n");
    case "competitor-analysis":
      return [
        `# ${DOCUMENT_TITLES[docId]}`,
        "",
        "## 경쟁사 또는 유사 서비스 목록",
        "- TBD",
        "",
        "## 각 서비스의 핵심 기능",
        "- TBD",
        "",
        "## 타깃 사용자",
        "- TBD",
        "",
        "## 가격/비즈니스 모델",
        "- TBD",
        "",
        "## 장점",
        "- TBD",
        "",
        "## 단점",
        "- TBD",
        "",
        "## 사용자 리뷰/불만 포인트",
        "- TBD",
        "",
        "## 차별화 가능한 지점",
        "- TBD",
        "",
        "## 시장 포지셔닝",
        "TBD",
        "",
        "## 참고 링크",
        "- TBD",
        "",
        "## 분석 시각",
        "TBD"
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
        "## 경쟁사 대비 차별점",
        "- TBD",
        "",
        "## 강화 가능한 차별점",
        "- TBD",
        "",
        "## 제품 컨셉 재정의 제안",
        "TBD",
        "",
        "## 기능 우선순위 조정 제안",
        "- TBD",
        "",
        "## 포지셔닝 문장",
        "TBD",
        "",
        "## 이 제품을 써야 하는 이유",
        "TBD",
        "",
        "## 차별점별 구현 난이도",
        "- TBD",
        "",
        "## 차별점별 임팩트",
        "- TBD"
      ].join("\n");
    case "fe-technical-spec":
      return [
        `# ${DOCUMENT_TITLES[docId]}`,
        "",
        "## FE 아키텍처",
        "TBD",
        "",
        "## 라우팅 구조",
        "- TBD",
        "",
        "## 페이지별 컴포넌트 구조",
        "- TBD",
        "",
        "## 상태 관리 방식",
        "TBD",
        "",
        "## API 연결 방식",
        "TBD",
        "",
        "## 폼 처리 방식",
        "TBD",
        "",
        "## 에러 처리 방식",
        "TBD",
        "",
        "## 로딩 처리 방식",
        "TBD",
        "",
        "## 인증 상태 처리",
        "TBD",
        "",
        "## 권한 처리",
        "TBD",
        "",
        "## 접근성 기준",
        "- TBD",
        "",
        "## 테스트 전략",
        "- TBD",
        "",
        "## 빌드/배포 전략",
        "- TBD",
        "",
        "## 성능 최적화 전략",
        "- TBD",
        "",
        "## 승인 기준",
        "- PM/PD 승인 산출물과 충돌 없음",
        "- BE API contract 연결 방식 명시"
      ].join("\n");
    case "be-technical-spec":
      return [
        `# ${DOCUMENT_TITLES[docId]}`,
        "",
        "## BE 아키텍처",
        "TBD",
        "",
        "## API 구조",
        "- TBD",
        "",
        "## 데이터 모델",
        "- TBD",
        "",
        "## DB schema",
        "- TBD",
        "",
        "## 인증/인가",
        "TBD",
        "",
        "## validation",
        "TBD",
        "",
        "## error handling",
        "TBD",
        "",
        "## logging",
        "TBD",
        "",
        "## observability",
        "TBD",
        "",
        "## 배포 구조",
        "TBD",
        "",
        "## dev/staging/prod 환경 분리",
        "- TBD",
        "",
        "## migration 전략",
        "TBD",
        "",
        "## seed 전략",
        "TBD",
        "",
        "## 테스트 전략",
        "- TBD",
        "",
        "## 보안 전략",
        "- TBD",
        "",
        "## 승인 기준",
        "- API contract와 데이터 모델이 FE handoff 가능 상태"
      ].join("\n");
    case "api-contract":
      return [
        `# ${DOCUMENT_TITLES[docId]}`,
        "",
        "```yaml",
        "openapi: 3.1.0",
        "info:",
        "  title: TBD API",
        "  version: 0.1.0",
        "paths: {}",
        "components:",
        "  schemas: {}",
        "```",
        "",
        "## Contract Notes",
        "- 모든 FE 연동 endpoint는 machine-readable contract에 반영한다.",
        "- mock API는 이 contract를 기준으로 생성한다.",
        "",
        "## 승인 기준",
        "- FE가 mock 또는 실제 API 연결을 시작할 수 있음",
        "- BE 구현 범위와 테스트 기준이 명확함"
      ].join("\n");
    case "fe-sprint-plan":
    case "be-sprint-plan":
      return [
        `# ${DOCUMENT_TITLES[docId]}`,
        "",
        "## Sprint 목록",
        "| sprint ID | sprint 이름 | 목표 | 포함 issue 목록 | 선행 조건 | 완료 조건 | 예상 리스크 | FE/BE 의존성 | 사용자 컨펌 필요 여부 |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        "| S-001 | Foundation | TBD | TBD | PM/PD 승인 | lint/test/build 통과 | TBD | TBD | yes |",
        "",
        "## Issue 분할 원칙",
        "- 하나의 issue는 하나의 브랜치에서 작업한다.",
        "- acceptance criteria와 test requirement를 포함한다.",
        "- QA checklist를 완료하기 전 PR ready 상태로 올리지 않는다.",
        "",
        "## 승인 기준",
        "- FE/BE 의존성이 명시됨",
        "- 사용자 컨펌 필요한 sprint가 식별됨",
        "- issue 생성이 가능한 수준으로 분할됨"
      ].join("\n");
  }
}
