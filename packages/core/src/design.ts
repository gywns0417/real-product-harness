import fs from "node:fs";
import path from "node:path";
import { designApprovalsFile, designArtifactDir, designArtifactIndexFile } from "./paths";
import { ensureDir, fileExists, readJsonIfExists, writeJson, writeText } from "./fs";
import {
  DESIGN_ARTIFACT_IDS,
  DesignApproval,
  DesignArtifactId,
  DesignArtifactIndex,
  DesignArtifactVersionMeta,
  DocumentStatus,
  ProjectState
} from "./types";
import { newId, nowIso } from "./time";
import { nextVersion, stripFrontmatter } from "./documents";

export const DESIGN_ARTIFACT_TITLES: Record<DesignArtifactId, string> = {
  references: "레퍼런스 수집",
  directions: "3개 디자인 방향 제안",
  "landing-preview": "예시 랜딩 페이지",
  "design-system": "디자인 시스템",
  "page-designs": "페이지 디자인"
};

export interface CreateDesignArtifactOptions {
  status?: DocumentStatus;
  changeSummary: string;
  body?: string;
  version?: string;
}

export function isDesignArtifactId(value: string): value is DesignArtifactId {
  return (DESIGN_ARTIFACT_IDS as readonly string[]).includes(value);
}

export function createDesignArtifactVersion(
  projectRoot: string,
  artifactId: DesignArtifactId,
  options: CreateDesignArtifactOptions
): DesignArtifactIndex {
  const dir = designArtifactDir(projectRoot, artifactId);
  ensureDir(dir);
  const index = readDesignArtifactIndex(projectRoot, artifactId);
  const version = options.version ?? nextVersion(index.currentVersion);
  const createdAt = nowIso();
  const filePath = path.join(dir, `${version}.md`);
  if (fileExists(filePath)) {
    throw new Error(`design artifact version already exists: ${artifactId} ${version}`);
  }
  const meta: DesignArtifactVersionMeta = {
    version,
    status: options.status ?? "draft",
    ownerAgent: "PD",
    createdAt,
    updatedAt: createdAt,
    changeSummary: options.changeSummary,
    filePath,
    approvedBy: null,
    approvedAt: null,
    rollbackAvailable: true
  };
  writeText(filePath, renderDesignArtifact(artifactId, meta, options.body ?? defaultDesignArtifactBody(artifactId)));
  const nextIndex: DesignArtifactIndex = {
    artifactId,
    currentVersion: version,
    status: meta.status,
    versions: [...index.versions, meta]
  };
  writeJson(designArtifactIndexFile(projectRoot, artifactId), nextIndex);
  return nextIndex;
}

export function readDesignArtifactIndex(projectRoot: string, artifactId: DesignArtifactId): DesignArtifactIndex {
  return readJsonIfExists<DesignArtifactIndex>(designArtifactIndexFile(projectRoot, artifactId), {
    artifactId,
    currentVersion: null,
    status: "draft",
    versions: []
  });
}

export function listDesignArtifactIndexes(projectRoot: string): DesignArtifactIndex[] {
  return DESIGN_ARTIFACT_IDS.map((artifactId) => readDesignArtifactIndex(projectRoot, artifactId)).filter(
    (index) => index.currentVersion !== null
  );
}

export function showDesignArtifact(projectRoot: string, artifactId: DesignArtifactId, version?: string): string {
  const index = readDesignArtifactIndex(projectRoot, artifactId);
  const selected = version ?? index.currentVersion;
  if (!selected) {
    throw new Error(`design artifact not found: ${artifactId}`);
  }
  const filePath = path.join(designArtifactDir(projectRoot, artifactId), `${selected}.md`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`design artifact version not found: ${artifactId} ${selected}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

export function approveDesignArtifact(projectRoot: string, artifactId: DesignArtifactId, approvedBy = "user"): DesignApproval {
  const index = readDesignArtifactIndex(projectRoot, artifactId);
  if (!index.currentVersion) {
    throw new Error(`cannot approve missing design artifact: ${artifactId}`);
  }
  const approvedAt = nowIso();
  const approval: DesignApproval = {
    id: newId("design_approval"),
    artifactId,
    version: index.currentVersion,
    approvedBy,
    approvedAt,
    summary: `${artifactId} ${index.currentVersion} approved`
  };
  const approvals = readJsonIfExists<DesignApproval[]>(designApprovalsFile(projectRoot), []);
  writeJson(designApprovalsFile(projectRoot), [...approvals, approval]);
  const nextIndex: DesignArtifactIndex = {
    ...index,
    status: "approved",
    versions: index.versions.map((version) =>
      version.version === index.currentVersion
        ? {
            ...version,
            status: "approved",
            approvedBy,
            approvedAt,
            updatedAt: approvedAt
          }
        : version
    )
  };
  writeJson(designArtifactIndexFile(projectRoot, artifactId), nextIndex);
  const currentMeta = nextIndex.versions.find((version) => version.version === index.currentVersion);
  if (currentMeta) {
    const markdown = showDesignArtifact(projectRoot, artifactId, currentMeta.version);
    writeText(currentMeta.filePath, renderDesignArtifact(artifactId, currentMeta, stripFrontmatter(markdown)));
  }
  return approval;
}

export function syncStateDesignArtifacts(state: ProjectState, index: DesignArtifactIndex): ProjectState {
  return {
    ...state,
    designArtifacts: {
      ...(state.designArtifacts ?? {}),
      [index.artifactId]: index
    },
    updatedAt: nowIso()
  };
}

export function createLandingPreviewHtml(projectRoot: string): string {
  const filePath = path.join(designArtifactDir(projectRoot, "landing-preview"), "preview.html");
  writeText(filePath, landingPreviewHtml());
  return filePath;
}

export function renderDesignArtifact(
  artifactId: DesignArtifactId,
  meta: DesignArtifactVersionMeta,
  body: string
): string {
  const frontmatter = [
    "---",
    `artifact_id: ${artifactId}`,
    `version: ${meta.version}`,
    `status: ${meta.status}`,
    "owner_agent: PD",
    `created_at: ${meta.createdAt}`,
    `updated_at: ${meta.updatedAt}`,
    `approved_by: ${meta.approvedBy ?? "null"}`,
    `approved_at: ${meta.approvedAt ?? "null"}`,
    `change_summary: "${meta.changeSummary.replaceAll('"', '\\"')}"`,
    "---"
  ];
  return `${frontmatter.join("\n")}\n\n${body.trim()}\n`;
}

function defaultDesignArtifactBody(artifactId: DesignArtifactId): string {
  switch (artifactId) {
    case "references":
      return [
        `# ${DESIGN_ARTIFACT_TITLES[artifactId]}`,
        "",
        "## 입력 방식",
        "- 사용자 제공 URL",
        "- PD Agent 추천 후보",
        "- 혼합",
        "",
        "## 후보 5개 이상",
        "| 이름 | URL | 제품 유형 | 참고할 점 | 리스크 |",
        "| --- | --- | --- | --- | --- |",
        "| TBD | TBD | TBD | TBD | TBD |",
        "",
        "## 최종 후보 3개",
        "- TBD"
      ].join("\n");
    case "directions":
      return [
        `# ${DESIGN_ARTIFACT_TITLES[artifactId]}`,
        "",
        "## Direction A",
        "- 브랜드 키워드: TBD",
        "- 톤앤무드: TBD",
        "- 메인/서브/배경/텍스트/강조 컬러: TBD",
        "- 타이포그래피 방향: TBD",
        "- 레이아웃 원칙: TBD",
        "- 인터랙션 원칙: TBD",
        "- 장점/단점: TBD",
        "",
        "## Direction B",
        "- TBD",
        "",
        "## Direction C",
        "- TBD"
      ].join("\n");
    case "landing-preview":
      return [
        `# ${DESIGN_ARTIFACT_TITLES[artifactId]}`,
        "",
        "## 출력 방식",
        "Figma/Stitch 미설정 시 HTML/CSS fallback preview를 생성한다.",
        "",
        "## Direction A Preview",
        "- layout: TBD",
        "- copy: TBD",
        "",
        "## Direction B Preview",
        "- TBD",
        "",
        "## Direction C Preview",
        "- TBD"
      ].join("\n");
    case "design-system":
      return [
        `# ${DESIGN_ARTIFACT_TITLES[artifactId]}`,
        "",
        "## Tokens",
        "- color: TBD",
        "- typography: TBD",
        "- spacing: TBD",
        "- radius: TBD",
        "- shadow: TBD",
        "- grid: TBD",
        "",
        "## Components",
        "- button",
        "- input",
        "- form",
        "- modal",
        "- drawer",
        "- toast",
        "- tooltip",
        "- card",
        "- table",
        "- tabs",
        "- accordion",
        "- nav",
        "- sidebar",
        "- header",
        "- footer",
        "",
        "## States",
        "- loading",
        "- empty",
        "- error",
        "- success",
        "",
        "## Accessibility",
        "- TBD"
      ].join("\n");
    case "page-designs":
      return [
        `# ${DESIGN_ARTIFACT_TITLES[artifactId]}`,
        "",
        "## Page Design Template",
        "- 목적: TBD",
        "- 사용자 흐름: TBD",
        "- 레이아웃 설명: TBD",
        "- 컴포넌트 목록: TBD",
        "- 상태별 디자인: TBD",
        "- 반응형 기준: TBD",
        "- 접근성 고려사항: TBD",
        "- 필요한 에셋: TBD",
        "- FE 구현 참고사항: TBD"
      ].join("\n");
  }
}

function landingPreviewHtml(): string {
  return [
    "<!doctype html>",
    "<html lang=\"ko\">",
    "<head>",
    "  <meta charset=\"utf-8\">",
    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "  <title>Real Product Harness Landing Preview</title>",
    "  <style>",
    "    body{margin:0;font-family:Inter,system-ui,sans-serif;color:#17202a;background:#f7f8fb}",
    "    main{min-height:100vh;display:grid;grid-template-columns:1fr 1fr}",
    "    section{padding:56px;display:flex;flex-direction:column;justify-content:center}",
    "    .hero{background:#ffffff}",
    "    h1{font-size:48px;line-height:1.05;margin:0 0 24px}",
    "    p{font-size:18px;line-height:1.6;max-width:620px}",
    "    .panel{background:#233142;color:white}",
    "    .card{border:1px solid rgba(255,255,255,.2);padding:24px;margin:12px 0;border-radius:8px}",
    "    @media(max-width:800px){main{grid-template-columns:1fr}section{padding:32px}h1{font-size:36px}}",
    "  </style>",
    "</head>",
    "<body>",
    "  <main>",
    "    <section class=\"hero\">",
    "      <h1>Real Product Foundation</h1>",
    "      <p>Human-approved product workflow with versioned PM and PD artifacts.</p>",
    "    </section>",
    "    <section class=\"panel\">",
    "      <div class=\"card\">Reference-driven direction</div>",
    "      <div class=\"card\">Design system before implementation</div>",
    "      <div class=\"card\">Approval gate before FE/BE handoff</div>",
    "    </section>",
    "  </main>",
    "</body>",
    "</html>"
  ].join("\n");
}
