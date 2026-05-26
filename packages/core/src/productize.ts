import { createDesignArtifactVersion, syncStateDesignArtifacts } from "./design";
import { createDocumentVersion, syncStateDocuments } from "./documents";
import { writeJson, writeText } from "./fs";
import { createDevDeploymentPlan, createPullRequestDraft, createWorkIssue } from "./issues";
import { goldenPathReportFile, goldenPathReportMarkdownFile } from "./paths";
import { extractProductIdea } from "./product-idea";
import { loadState, saveState } from "./project";
import { createQaReview } from "./qa";
import {
  DESIGN_ARTIFACT_IDS,
  DesignArtifactId,
  DesignArtifactIndex,
  DocumentId,
  DocumentIndex,
  DOCUMENT_IDS,
  ProjectState,
  PullRequestRecord,
  QAReportRecord,
  WorkIssue,
  DeploymentRecord
} from "./types";
import { nowIso } from "./time";

export interface ProductizeInput {
  idea: string;
}

export interface ProductizeTraceability {
  confirmedFacts: string[];
  assumptions: string[];
  openQuestions: string[];
}

export interface ProductizeResult {
  idea: string;
  createdAt: string;
  stage: ProjectState["currentStage"];
  traceability: ProductizeTraceability;
  documents: Array<{ docId: DocumentId; version: string; status: string; filePath: string }>;
  designArtifacts: Array<{ artifactId: DesignArtifactId; version: string; status: string; filePath: string }>;
  issues: WorkIssue[];
  pullRequests: PullRequestRecord[];
  qaReports: QAReportRecord[];
  deployment: DeploymentRecord;
  nextCommands: string[];
  reportPath: string;
  reportMarkdownPath: string;
}

export function runProductizeGoldenPath(projectRoot: string, input: ProductizeInput): ProductizeResult {
  const idea = normalizeIdea(input.idea);
  if (!idea) {
    throw new Error("usage: /productize <product idea>");
  }

  let state = loadState(projectRoot);
  const createdAt = nowIso();
  const profile = analyzeIdea(idea);
  const traceability = createProductizeTraceability(idea, profile);
  const documents: ProductizeResult["documents"] = [];
  for (const docId of DOCUMENT_IDS) {
    const index = createDocumentVersion(projectRoot, docId, {
      ownerAgent: ownerForDocument(docId),
      status: "review",
      changeSummary: `Golden path draft for: ${idea}`,
      body: documentBody(docId, idea, profile, traceability)
    });
    state = syncStateDocuments(state, index);
    documents.push(documentSummary(index));
  }

  const designArtifacts: ProductizeResult["designArtifacts"] = [];
  for (const artifactId of DESIGN_ARTIFACT_IDS) {
    const index = createDesignArtifactVersion(projectRoot, artifactId, {
      status: "review",
      changeSummary: `Golden path design package for: ${idea}`,
      body: designArtifactBody(artifactId, idea, profile)
    });
    state = syncStateDesignArtifacts(state, index);
    designArtifacts.push(designArtifactSummary(index));
  }

  state = moveToReviewStage(state, "Productize golden path package generated");
  saveState(projectRoot, state);

  const feIssue = createWorkIssue(projectRoot, {
    workstream: "FE",
    label: "feat",
    title: `Build MVP operator workspace for ${shortTitle(idea)}`,
    description: [
      `Implement the first usable front-end workflow for: ${idea}.`,
      "The UI must let a product operator review generated PM/PD/FE/BE artifacts, inspect QA blockers, and continue from the next recommended action."
    ].join("\n\n"),
    acceptanceCriteria: [
      "Runtime entry screen shows current stage, generated artifacts, issues, PR drafts, and QA blockers.",
      "Artifact review view opens product definition, requirements, screen definition, feature definition, FE spec, BE spec, and API contract without exposing secrets.",
      "Primary action area shows the next command and clearly marks user approval gates before merge or deployment.",
      "Responsive layout works at mobile and desktop widths with no overlapping text."
    ],
    relatedDocs: ["product-definition", "requirements", "screen-definition", "feature-definition", "fe-technical-spec", "api-contract"],
    relatedScreens: ["Runtime dashboard", "Artifact review", "QA blocker panel"],
    relatedApis: ["GET /api/runtime/status", "GET /api/artifacts", "POST /api/agent/actions"],
    testRequirement: "Component tests for dashboard states plus Playwright smoke for artifact review and next-action flow.",
    qaChecklist: [
      "Generated artifacts are visible and readable.",
      "Approval gates are visible before merge/deploy actions.",
      "No secret values appear in UI, logs, or exported reports.",
      "Mobile and desktop layouts keep controls stable."
    ]
  });

  const beIssue = createWorkIssue(projectRoot, {
    workstream: "BE",
    label: "feat",
    title: `Implement MVP workflow APIs for ${shortTitle(idea)}`,
    description: [
      `Implement the server-side contracts needed to operate the MVP workflow for: ${idea}.`,
      "The API must expose productized artifacts, session state, issues, PR drafts, QA reports, and safe action execution without bypassing approval gates."
    ].join("\n\n"),
    acceptanceCriteria: [
      "Status API returns stage, owner agent, configured providers, generated artifacts, issues, PR drafts, and QA summaries.",
      "Artifact API returns versioned document/design metadata and selected markdown body without secret-bearing fields.",
      "Action API accepts safe harness commands, records command outcome, and refuses destructive or credential-gated actions without approval.",
      "QA API returns requirement, design, API, security, accessibility, conflict, and test status for each PR draft."
    ],
    relatedDocs: ["requirements", "feature-definition", "be-technical-spec", "api-contract", "be-sprint-plan"],
    relatedScreens: ["Runtime dashboard", "Artifact review", "QA blocker panel"],
    relatedApis: ["GET /api/runtime/status", "GET /api/artifacts/:id", "POST /api/agent/actions", "GET /api/qa/pr/:id"],
    testRequirement: "Contract tests for success, missing artifact, blocked approval, and malformed command cases.",
    qaChecklist: [
      "Endpoints never return raw credential values.",
      "Action execution is auditable and approval-aware.",
      "Malformed input returns actionable errors.",
      "QA status fields are populated rather than left unknown."
    ]
  });

  const fePr = createPullRequestDraft(projectRoot, feIssue.issueNumber);
  const bePr = createPullRequestDraft(projectRoot, beIssue.issueNumber);
  const feQa = createQaReview(projectRoot, fePr.prNumber);
  const beQa = createQaReview(projectRoot, bePr.prNumber);
  const deployment = createDevDeploymentPlan(projectRoot, "local");

  const result: ProductizeResult = {
    idea,
    createdAt,
    stage: state.currentStage,
    traceability,
    documents,
    designArtifacts,
    issues: [feIssue, beIssue],
    pullRequests: [fePr, bePr],
    qaReports: [feQa, beQa],
    deployment,
    nextCommands: [
      "/docs approve product-definition --by user",
      "/docs approve requirements --by user",
      "/docs approve fe-technical-spec --by user",
      "/docs approve be-technical-spec --by user",
      "/docs approve api-contract --by user",
      `/qa report --pr ${fePr.prNumber}`,
      `/qa report --pr ${bePr.prNumber}`
    ],
    reportPath: goldenPathReportFile(projectRoot),
    reportMarkdownPath: goldenPathReportMarkdownFile(projectRoot)
  };

  writeJson(result.reportPath, result);
  writeText(result.reportMarkdownPath, renderProductizeReport(result));
  return result;
}

function normalizeIdea(idea: string): string {
  return extractProductIdea(idea);
}

function shortTitle(idea: string): string {
  return idea.length > 54 ? `${idea.slice(0, 51).trim()}...` : idea;
}

interface IdeaProfile {
  targetUser: string;
  sourceInput: string;
  transformedOutput: string;
  workflow: string[];
  records: string[];
  primaryMetric: string;
  risk: string;
  competitorFrame: string;
  apiResources: string[];
}

function analyzeIdea(idea: string): IdeaProfile {
  const normalized = idea.toLowerCase();
  if (includesAny(normalized, ["회의록", "meeting", "액션아이템", "action item"])) {
    return {
      targetUser: "회의 후속 조치를 놓치기 쉬운 팀 리더와 PM",
      sourceInput: "회의 녹취, 회의록, 참석자 발언",
      transformedOutput: "액션아이템, 담당자, 마감일, 후속 알림",
      workflow: ["회의록 업로드", "결정/할 일 추출", "담당자 확인", "마감일 추적", "후속 회의 전 미완료 항목 점검"],
      records: ["Meeting", "Transcript", "Decision", "ActionItem", "Assignee", "DueDate"],
      primaryMetric: "회의 후 24시간 안에 담당자가 확정된 액션아이템 비율",
      risk: "AI가 발언 의도를 잘못 해석해 잘못된 담당자나 마감일을 제안할 수 있음",
      competitorFrame: "Otter, Fireflies, Notion AI, Linear의 회의/작업 추적 흐름",
      apiResources: ["meetings", "transcripts", "action-items", "assignees", "follow-ups"]
    };
  }
  if (includesAny(normalized, ["인터뷰", "interview", "인사이트", "태그"])) {
    return {
      targetUser: "고객 인터뷰를 반복적으로 분석하는 PM과 UX 리서처",
      sourceInput: "인터뷰 원문, 메모, 녹취 요약",
      transformedOutput: "태그, 인사이트, 근거 인용, 기회 영역",
      workflow: ["인터뷰 원문 수집", "발화 단위 태깅", "반복 패턴 묶기", "인사이트 근거 확인", "제품 기회로 승격"],
      records: ["Interview", "Quote", "Tag", "Insight", "Opportunity", "Evidence"],
      primaryMetric: "검증 가능한 인용 근거가 붙은 인사이트 비율",
      risk: "소수 인터뷰를 과잉 일반화하거나 근거 없는 태그를 생성할 수 있음",
      competitorFrame: "Dovetail, Condens, Notion AI, Airtable 리서치 저장소",
      apiResources: ["interviews", "quotes", "tags", "insights", "opportunities"]
    };
  }
  if (includesAny(normalized, ["피드백", "feedback", "리뷰", "문의"])) {
    return {
      targetUser: "고객 피드백을 기능 우선순위로 연결해야 하는 CS/PM 팀",
      sourceInput: "고객 피드백, 리뷰, 지원 티켓, 문의 로그",
      transformedOutput: "주제 클러스터, 심각도, 요청 기능, 우선순위 후보",
      workflow: ["피드백 수집", "중복/주제 클러스터링", "심각도 산정", "기능 요청 연결", "릴리스 후보 선정"],
      records: ["Feedback", "Customer", "Theme", "Severity", "FeatureRequest", "RoadmapCandidate"],
      primaryMetric: "중복 피드백이 하나의 실행 가능한 기능 후보로 정리되는 비율",
      risk: "목소리가 큰 고객의 요청이 전체 우선순위를 왜곡할 수 있음",
      competitorFrame: "Canny, Productboard, Zendesk, Intercom 피드백 흐름",
      apiResources: ["feedback", "customers", "themes", "feature-requests", "roadmap-candidates"]
    };
  }
  if (includesAny(normalized, ["채용", "지원자", "면접", "recruit", "hiring"])) {
    return {
      targetUser: "지원자 검증과 면접 운영을 반복하는 채용 담당자와 창업팀",
      sourceInput: "지원서, 이력서, 과제, 면접 메모",
      transformedOutput: "검증 항목, 리스크, 면접 질문, 합격/보류 근거",
      workflow: ["지원자 자료 수집", "검증 기준 매핑", "리스크 표시", "면접 질문 생성", "평가 근거 기록"],
      records: ["Candidate", "Application", "Evidence", "RiskFlag", "InterviewQuestion", "Evaluation"],
      primaryMetric: "평가 근거가 명시된 후보자 판정 비율",
      risk: "편향된 데이터나 부정확한 추론이 후보자 평가에 영향을 줄 수 있음",
      competitorFrame: "Greenhouse, Lever, Ashby, Metaview 채용 운영 흐름",
      apiResources: ["candidates", "applications", "evidence", "risk-flags", "evaluations"]
    };
  }
  return {
    targetUser: "아이디어를 빠르게 실행 패키지로 바꿔야 하는 제품 오너",
    sourceInput: "사용자가 제공한 원문 아이디어와 초기 업무 맥락",
    transformedOutput: "검토 가능한 제품 정의, 요구사항, 화면, 기능, FE/BE 실행 항목",
    workflow: ["아이디어 입력", "핵심 사용자/문제 추출", "산출물 생성", "승인 게이트 확인", "FE/BE 실행 준비"],
    records: ["Idea", "Problem", "User", "Requirement", "Artifact", "WorkItem"],
    primaryMetric: "첫 세션에서 승인 가능한 실행 산출물까지 도달한 비율",
    risk: "도메인 정보가 부족하면 산출물이 일반적인 실행 패키지에 머무를 수 있음",
    competitorFrame: "Notion, Linear, GitHub Projects, agentic coding shell의 작업 전환 흐름",
    apiResources: ["ideas", "problems", "requirements", "artifacts", "work-items"]
  };
}

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle.toLowerCase()));
}

function bullets(items: string[]): string[] {
  return items.map((item) => `- ${item}`);
}

function createProductizeTraceability(idea: string, profile: IdeaProfile): ProductizeTraceability {
  return {
    confirmedFacts: [
      `사용자가 제공한 원문 제품 아이디어: ${idea}`,
      `추론된 주요 사용자: ${profile.targetUser}`,
      `추론된 원천 입력: ${profile.sourceInput}`,
      `추론된 변환 결과: ${profile.transformedOutput}`,
      `현재 자동 생성 범위: PM/PD/FE/BE 문서, 디자인 산출물, FE/BE 이슈, PR draft, QA report, dev deployment plan`
    ],
    assumptions: [
      "이 패키지는 사용자가 제공한 짧은 자연어 입력과 로컬 도메인 프로파일 규칙만으로 생성되었습니다.",
      `도메인 분류와 업무 흐름은 아이디어 문구에서 감지한 키워드를 바탕으로 ${profile.records[0]} 중심 모델을 선택했습니다.`,
      "외부 고객 데이터, 실제 운영 지표, 결제/권한/규제 요구사항은 아직 연결되거나 검증되지 않았습니다.",
      "merge, deploy, credential-gated write는 명시 승인 전까지 실행하지 않는 전제로 설계했습니다."
    ],
    openQuestions: [
      "가장 먼저 돈을 낼 핵심 사용자 세그먼트는 누구인가?",
      `실제로 입력될 ${profile.sourceInput}의 파일 형식, 출처, 보안 등급은 무엇인가?`,
      `${profile.primaryMetric}의 목표 수치와 측정 주기는 어떻게 정할 것인가?`,
      "첫 MVP에서 반드시 연결해야 하는 외부 도구와 제외해도 되는 도구는 무엇인가?",
      "자동 실행을 허용할 로컬 작업과 사용자 승인이 필요한 외부 작업의 경계는 어디인가?"
    ]
  };
}

function groundingSection(traceability: ProductizeTraceability): string[] {
  return [
    "## Grounding",
    "",
    "### Confirmed Facts",
    ...bullets(traceability.confirmedFacts),
    "",
    "### Assumptions",
    ...bullets(traceability.assumptions),
    "",
    "### Open Questions",
    ...bullets(traceability.openQuestions)
  ];
}

function resourceTitle(resource: string): string {
  return resource
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join("");
}

function ownerForDocument(docId: DocumentId): "PM" | "FE" | "BE" {
  if (docId.startsWith("fe-")) {
    return "FE";
  }
  if (docId.startsWith("be-") || docId === "api-contract") {
    return "BE";
  }
  return "PM";
}

function documentSummary(index: DocumentIndex): ProductizeResult["documents"][number] {
  const version = index.versions.find((item) => item.version === index.currentVersion);
  if (!version || !index.currentVersion) {
    throw new Error(`document summary failed: ${index.docId}`);
  }
  return {
    docId: index.docId,
    version: index.currentVersion,
    status: index.status,
    filePath: version.filePath
  };
}

function designArtifactSummary(index: DesignArtifactIndex): ProductizeResult["designArtifacts"][number] {
  const version = index.versions.find((item) => item.version === index.currentVersion);
  if (!version || !index.currentVersion) {
    throw new Error(`design artifact summary failed: ${index.artifactId}`);
  }
  return {
    artifactId: index.artifactId,
    version: index.currentVersion,
    status: index.status,
    filePath: version.filePath
  };
}

function moveToReviewStage(state: ProjectState, reason: string): ProjectState {
  const target: ProjectState["currentStage"] = "PM_PRODUCT_DEFINITION_REVIEW";
  if (
    state.currentStage === target ||
    !["INIT", "SETUP", "PM_PRODUCT_DEFINITION_INTERVIEW", "PM_PRODUCT_DEFINITION_DRAFT"].includes(state.currentStage)
  ) {
    return { ...state, updatedAt: nowIso() };
  }
  const at = nowIso();
  return {
    ...state,
    currentStage: target,
    history: [...state.history, { from: state.currentStage, to: target, at, reason }],
    updatedAt: at
  };
}

function documentBody(docId: DocumentId, idea: string, profile: IdeaProfile, traceability: ProductizeTraceability): string {
  switch (docId) {
    case "product-definition":
      return [
        "# 제품 정의서",
        "",
        "## 제품명",
        `${shortTitle(idea)} MVP`,
        "",
        "## 한 줄 설명",
        `${idea}를 실제 사용자가 검토 가능한 업무 흐름과 실행 산출물로 바꾸는 MVP입니다.`,
        "",
        "## 해결하려는 문제",
        `사용자는 ${idea}를 떠올린 뒤 제품 정의, 요구사항, 화면, 기능, FE/BE 명세, QA 기준을 매번 수동으로 쪼개야 합니다.`,
        "이 MVP는 그 첫 실행 패키지를 한 번에 만들어 검토와 승인으로 바로 이어지게 합니다.",
        "",
        "## 도메인 특화 가정",
        `- 주요 사용자: ${profile.targetUser}`,
        `- 원천 입력: ${profile.sourceInput}`,
        `- 변환 결과: ${profile.transformedOutput}`,
        `- 핵심 성공 지표: ${profile.primaryMetric}`,
        "",
        ...groundingSection(traceability),
        "",
        "## 핵심 업무 흐름",
        ...bullets(profile.workflow),
        "",
        "## 핵심 데이터 객체",
        ...bullets(profile.records),
        "",
        "## 주요 사용자",
        `- ${profile.targetUser}`,
        "- 아이디어를 빠르게 제품 실행안으로 바꿔야 하는 창업자",
        "- 기획, 디자인, FE, BE, QA 흐름을 동시에 관리하는 1인 또는 소규모 팀",
        "- 승인 전까지는 자동 실행을 막고, 검토 가능한 산출물을 원하는 제품 오너",
        "",
        "## 핵심 가치",
        "- 한 문장 아이디어를 제품 실행 패키지로 변환",
        "- 승인 게이트를 유지하면서도 FE/BE 작업 시작점을 제공",
        "- 산출물, 이슈, PR 초안, QA 리포트를 같은 로컬 상태에 연결",
        "",
        "## 초기 MVP 범위",
        "- 제품 정의와 요구사항 초안",
        "- 화면/기능 정의와 디자인 방향",
        "- FE/BE/API 명세와 스프린트 계획",
        "- FE/BE 이슈, PR draft, QA review report",
        "",
        "## 제외 범위",
        "- 사용자 승인 없는 외부 merge, deploy, credential-gated write",
        "- 실제 고객 데이터 처리",
        "- 승인되지 않은 credential 사용",
        "",
        "## 성공 기준",
        "- 새 프로젝트에서 자연어 한 번으로 검토 가능한 실행 패키지 생성",
        "- 생성 산출물에 빈 placeholder가 남지 않음",
        "- 다음 승인/검증 명령이 명확하게 제시됨",
        "",
        "## 리스크와 대응",
        "- 산출물이 과하게 일반적일 수 있음: 사용자 승인과 revision 명령으로 보정",
        `- 도메인 리스크: ${profile.risk}`,
        "- 외부 integration이 준비되지 않을 수 있음: 로컬 draft와 dry-run 명령으로 대체",
        "- 자동 실행 오해 가능성: merge/deploy는 명시 승인 전 차단"
      ].join("\n");
    case "competitor-analysis":
      return [
        "# 경쟁사/유사 서비스 분석",
        "",
        "## 분석 대상 아이디어",
        idea,
        "",
        "## 유사 제품군",
        `분석 프레임: ${profile.competitorFrame}`,
        "",
        "| 제품군 | 사용자가 얻는 가치 | 참고할 점 | 차별화 기회 |",
        "| --- | --- | --- | --- |",
        "| Notion/문서 워크스페이스 | 지식과 문서 정리 | 낮은 진입장벽 | 실행 이슈/QA까지 연결 부족 |",
        "| Linear/Jira | 작업 추적과 우선순위 | 빠른 이슈 관리 | 제품 정의와 승인 문맥 부족 |",
        "| GitHub Projects | 코드와 PR 중심 관리 | 개발 워크플로우 연결 | PM/PD 산출물 자동화 부족 |",
        "| Claude Code/Codex CLI | 대화형 개발 실행 | 명령과 대화 결합 | 제품 운영 전체 stage 관리 부족 |",
        "",
        "## 차별화 기준",
        "- 자연어 입력을 제품 실행 패키지로 변환",
        "- PM/PD/FE/BE/QA 산출물을 하나의 상태로 연결",
        "- 승인 없는 외부 write를 막는 안전한 harness",
        "- 로컬 파일 기반으로 사용자 소유권과 감사 가능성 보장"
      ].join("\n");
    case "differentiation":
      return [
        "# 차별점 강화 제안",
        "",
        "## 핵심 차별점",
        `${idea}를 단순 문서가 아니라 실행 가능한 제품 작업 묶음으로 변환합니다.`,
        "",
        "## 강화 포인트",
        "- 첫 입력 후 바로 review-ready package 생성",
        "- 각 산출물에 owner agent와 승인 상태 기록",
        "- FE/BE 작업은 issue, branch, PR draft, QA report까지 연결",
        "- 외부 연결은 readiness와 실제 write/readback을 분리해 신뢰성 표시",
        "",
        "## 사용자가 지불할 이유",
        "- 첫날부터 제품화 흐름을 시작할 수 있음",
        "- 회의와 문서 사이에서 빠지는 FE/BE 실행 항목을 줄임",
        "- 승인 전 위험한 작업을 막으면서도 다음 액션을 계속 제시"
      ].join("\n");
    case "requirements":
      return [
        "# 요구사항 정의서",
        "",
        "## 비즈니스 요구사항",
        "- 사용자는 자연어 한 번으로 제품 실행 패키지를 생성할 수 있어야 합니다.",
        `- 사용자는 ${profile.sourceInput}을 ${profile.transformedOutput}로 바꿀 수 있어야 합니다.`,
        `- 사용자는 ${profile.primaryMetric}을 확인할 수 있어야 합니다.`,
        "- 생성된 문서, 디자인 산출물, 이슈, PR draft, QA report는 서로 연결되어야 합니다.",
        "- 승인 전 merge, deploy, credential-gated write는 실행되지 않아야 합니다.",
        "",
        ...groundingSection(traceability),
        "",
        "## 기능 요구사항",
        ...bullets(profile.workflow.map((step) => `${step} 단계 지원`)),
        "- 제품 정의, 요구사항, 화면 정의, 기능 정의 자동 생성",
        "- 디자인 레퍼런스, 방향, 랜딩, 디자인 시스템, 페이지 설계 자동 생성",
        "- FE spec, BE spec, API contract, sprint plan 자동 생성",
        "- FE/BE 이슈와 PR draft 자동 생성",
        "- QA report에 requirement/design/API/security/accessibility 상태 기록",
        "",
        "## 비기능 요구사항",
        "- 생성 산출물에는 비어 있는 placeholder가 없어야 합니다.",
        "- 모든 파일은 로컬 `.rph` 아래 저장되어야 합니다.",
        "- command output은 다음 액션을 한 줄 이상 포함해야 합니다.",
        "- secret 값은 문서, 로그, 리포트에 저장하지 않아야 합니다."
      ].join("\n");
    case "screen-definition":
      return [
        "# 화면 정의서",
        "",
        "## S-001 Runtime Dashboard",
        "- 목적: 현재 stage, 산출물, 이슈, PR, QA 상태를 한 화면에서 확인",
        `- 주요 사용자: ${profile.targetUser}`,
        `- 주요 도메인 데이터: ${profile.records.slice(0, 4).join(", ")}`,
        "- 주요 상태: uninitialized, setup-ready, package-generated, approval-blocked, qa-blocked",
        "- 주요 액션: 다음 명령 복사, 문서 보기, 승인 시작, QA report 보기",
        "",
        "## S-002 Artifact Review",
        "- 목적: 생성된 PM/PD/FE/BE 산출물을 검토하고 revision 또는 approval로 이동",
        "- 주요 상태: review, revised, approved",
        "- 주요 액션: 버전 비교, 승인, rollback, Obsidian export",
        "",
        "## S-003 QA Blocker Panel",
        "- 목적: PR draft별 requirement/design/API/security/accessibility/test 상태 확인",
        "- 주요 액션: QA report 열기, test 실행, approval blocker 확인"
      ].join("\n");
    case "feature-definition":
      return [
        "# 기능 정의서",
        "",
        "## F-001 Productize Golden Path",
        "- 기능 설명: 한 문장 아이디어를 실행 패키지로 변환",
        "- 사용자 스토리: 제품 오너로서 아이디어를 입력하면 검토 가능한 산출물과 FE/BE 작업 초안을 받고 싶다.",
        `- 입력값: ${profile.sourceInput}`,
        `- 출력값: ${profile.transformedOutput}, 문서, 디자인 산출물, 이슈, PR draft, QA report, deployment plan, next commands`,
        "- 예외 흐름: 빈 아이디어는 usage error 반환",
        "- 권한 조건: 로컬 파일 생성은 허용, 외부 write는 별도 승인 필요",
        "- 테스트 기준: 생성 파일 존재, placeholder 없음, PR/QA 상태 연결",
        "",
        "## F-002 Approval-Aware Execution",
        "- 기능 설명: 자동 생성 후에도 merge/deploy 전 사용자 승인을 요구",
        "- 사용자 스토리: 자동화가 빠르더라도 위험 작업은 직접 확인하고 싶다.",
        "- 테스트 기준: PR draft와 deployment plan이 approval required 상태 유지"
      ].join("\n");
    case "fe-technical-spec":
      return [
        "# FE 기술 기능 명세서",
        "",
        "## 목표",
        `${idea} MVP의 review-ready product workspace를 구현합니다.`,
        "",
        ...groundingSection(traceability),
        "",
        "## 주요 컴포넌트",
        "- RuntimeStatusHeader: stage, owner agent, configured provider 상태",
        `- DomainSignalPanel: ${profile.primaryMetric}와 ${profile.records.slice(0, 3).join("/")} 상태`,
        "- ArtifactList: 문서와 디자인 산출물 목록, status badge, version link",
        "- NextActionPanel: 다음 command, approval blocker, safe action 표시",
        "- WorkQueue: FE/BE issue, PR draft, QA status 표시",
        "- QaReportPanel: requirement, design, API, security, accessibility, test 상태",
        "",
        "## 상태 관리",
        "- 서버 또는 로컬 adapter에서 `.rph/state.json`, 문서 index, issue index, PR index, QA report를 읽음",
        "- UI는 destructive action을 직접 실행하지 않고 command proposal만 표시",
        "",
        "## 접근성/반응형",
        "- 키보드로 모든 action 이동 가능",
        "- 모바일에서는 artifact list와 QA panel을 탭 또는 섹션으로 분리",
        "- 긴 아이디어/파일 경로는 줄바꿈 또는 ellipsis 처리"
      ].join("\n");
    case "be-technical-spec":
      return [
        "# BE 기술 기능 명세서",
        "",
        "## 목표",
        `${idea} MVP의 productize package를 읽고 안전하게 command action을 제안하는 API를 제공합니다.`,
        "",
        ...groundingSection(traceability),
        "",
        "## 도메인 모델",
        ...profile.records.map((record) => `- ${record}: ${idea} 도메인의 핵심 업무 객체`),
        "- RuntimeState: project, stage, owner, paused, next action",
        "- Artifact: document/design id, version, status, file path, markdown body",
        "- WorkItem: issue number, stream, branch, acceptance criteria",
        "- PullRequestDraft: PR number, source/target branch, QA/test/user approval status",
        "- QaReport: requirement/design/API/security/accessibility/conflict/test status",
        "",
        "## 안전 원칙",
        "- API는 secret 값을 반환하지 않음",
        "- destructive 또는 external write action은 approval token 없이 거절",
        "- 모든 command action은 session manifest와 runtime log에 결과 기록",
        "",
        "## 오류 처리",
        "- missing project: setup 안내와 `/init --yes` 제안",
        "- missing artifact: artifact id와 생성 명령 제안",
        "- blocked approval: 필요한 승인 명령과 문서 id 반환"
      ].join("\n");
    case "api-contract":
      return [
        "# API Contract",
        "",
        "## Domain Resources",
        ...profile.apiResources.map((resource) => `- ${resourceTitle(resource)}: ${profile.sourceInput}에서 ${profile.transformedOutput}로 이어지는 ${resource} 리소스`),
        "",
        ...groundingSection(traceability),
        "",
        "## GET /api/runtime/status",
        "- 설명: 현재 project, stage, owner, paused, configured providers, next action 반환",
        "- 성공 응답: `{ project, workflow, providers, nextAction, blockers }`",
        "",
        ...profile.apiResources.flatMap((resource) => [
          `## GET /api/domain/${resource}`,
          `- 설명: ${idea} MVP의 ${resource} 목록과 검토 상태 반환`,
          `- 성공 응답: \`{ items: ${resourceTitle(resource)}[], metric: "${profile.primaryMetric}" }\``,
          ""
        ]),
        "## GET /api/artifacts",
        "- 설명: 문서와 디자인 산출물 index 반환",
        "- 성공 응답: `{ documents: ArtifactSummary[], designArtifacts: ArtifactSummary[] }`",
        "",
        "## GET /api/artifacts/:kind/:id",
        "- 설명: 선택 산출물의 version metadata와 markdown body 반환",
        "- 실패 응답: `{ error: \"artifact_not_found\", nextCommand }`",
        "",
        "## POST /api/agent/actions",
        "- 설명: safe command 실행 또는 approval-gated command proposal 생성",
        "- 요청: `{ command, mode: \"dry-run\" | \"execute\" }`",
        "- 성공 응답: `{ ok, command, outputSummary, nextAction }`",
        "",
        "## GET /api/qa/pr/:id",
        "- 설명: PR draft의 QA report 반환",
        "- 성공 응답: `{ prNumber, requirementStatus, designStatus, apiContractStatus, securityStatus, accessibilityStatus, testStatus, findings }`"
      ].join("\n");
    case "fe-sprint-plan":
      return [
        "# FE 스프린트 계획",
        "",
        "| Sprint | 범위 | 산출물 | 의존성 | 완료 기준 |",
        "| --- | --- | --- | --- | --- |",
        "| S1 | Runtime dashboard shell | Stage header, artifact list, next action panel | status/artifact API | 기본 package 상태 표시 |",
        "| S2 | Artifact review UX | 문서/디자인 markdown viewer, version badge | artifact API | 생성 산출물 검토 가능 |",
        "| S3 | QA and approval UX | QA panel, approval blocker, command proposal | QA API/action API | 위험 작업 전 승인 표시 |",
        "",
        "## 리스크",
        "- 파일 경로와 markdown이 길어질 수 있으므로 overflow 처리를 먼저 고정",
        "- 외부 write는 UI에서 직접 실행하지 않고 proposal로 표시"
      ].join("\n");
    case "be-sprint-plan":
      return [
        "# BE 스프린트 계획",
        "",
        "| Sprint | 범위 | 산출물 | 의존성 | 완료 기준 |",
        "| --- | --- | --- | --- | --- |",
        "| S1 | Runtime status reader | status API, state loader, provider summary | `.rph/state.json` | stage와 next action 반환 |",
        "| S2 | Artifact API | document/design index reader, markdown body reader | `.rph/documents`, `.rph/design` | artifact 목록과 본문 반환 |",
        "| S3 | Safe action API | command validation, dry-run/execute split, audit record | CLI parser/runtime log | 승인 없는 위험 action 거절 |",
        "| S4 | QA API | PR/QA report reader, status normalization | `.rph/prs`, `.rph/qa` | QA 상태와 findings 반환 |",
        "",
        "## 운영 기준",
        "- 모든 API는 secret redaction을 기본값으로 적용",
        "- 실패 응답은 사람이 바로 실행할 next command를 포함"
      ].join("\n");
  }
}

function designArtifactBody(artifactId: DesignArtifactId, idea: string, profile: IdeaProfile): string {
  switch (artifactId) {
    case "references":
      return [
        "# 레퍼런스 수집",
        "",
        "| 이름 | 제품 유형 | 참고할 점 | 적용 방향 |",
        "| --- | --- | --- | --- |",
        "| Codex CLI | 대화형 개발 도구 | 명령과 자연어 공존 | slash command는 control plane으로 유지 |",
        "| Claude Code | agentic coding shell | 대화 중심 작업 실행 | 일반 텍스트를 primary UX로 배치 |",
        "| Linear | 작업 추적 | 빠른 issue/PR 흐름 | FE/BE work item을 자동 생성 |",
        "| Notion | 문서 workspace | 쉬운 검토와 공유 | 산출물 export/readback 경로 강화 |",
        "| GitHub Projects | 개발 실행 연결 | PR과 release 추적 | PR draft와 QA report 연결 |",
        "",
        "## 선택 기준",
        `- ${idea} 사용자가 첫 세션에서 실행 가능한 결과를 확인할 수 있어야 합니다.`,
        `- ${profile.sourceInput}에서 ${profile.transformedOutput}로 이어지는 도메인 흐름이 보여야 합니다.`,
        `- 핵심 지표 ${profile.primaryMetric}을 화면에서 확인할 수 있어야 합니다.`,
        "- 명령어 지식이 없어도 다음 액션이 보여야 합니다.",
        "- 자동화와 승인 게이트가 동시에 보여야 합니다."
      ].join("\n");
    case "directions":
      return [
        "# 3개 디자인 방향 제안",
        "",
        "## Direction A: Operator Console",
        "- 브랜드 키워드: precise, calm, execution-ready",
        "- 톤앤무드: 밀도 높은 SaaS 작업 화면",
        "- 색상: white, ink, blue accent, green success, red blocker",
        "- 레이아웃: 좌측 stage rail, 중앙 artifact review, 우측 next action",
        "",
        "## Direction B: Command Center",
        "- 브랜드 키워드: fast, technical, auditable",
        "- 톤앤무드: terminal-inspired dashboard",
        "- 색상: near-black shell area, neutral panels, amber warning",
        "- 레이아웃: top command bar, split artifact/work queue",
        "",
        "## Direction C: Founder Flow",
        "- 브랜드 키워드: guided, practical, confidence-building",
        "- 톤앤무드: first-use onboarding과 실행 패키지 중심",
        "- 색상: neutral base, clear status colors, low decoration",
        "- 레이아웃: stepper, package summary, approval checklist"
      ].join("\n");
    case "landing-preview":
      return [
        "# 예시 랜딩 페이지",
        "",
        "## Hero",
        `${idea}를 제품 정의부터 FE/BE 실행 준비까지 한 번에 정리합니다.`,
        "",
        "## First View",
        "- 좌측: 입력한 아이디어와 생성 상태",
        `- 중앙: ${profile.records.slice(0, 3).join(", ")} 중심 artifact package`,
        "- 우측: 다음 승인/QA 액션",
        "",
        "## CTA",
        "- Primary: Productize this idea",
        "- Secondary: Review generated artifacts",
        "",
        "## 신뢰 신호",
        "- Secret-safe local artifacts",
        "- Approval-gated execution",
        "- QA evidence before merge"
      ].join("\n");
    case "design-system":
      return [
        "# 디자인 시스템",
        "",
        "## Tokens",
        "- color.text.primary: #111827",
        "- color.text.muted: #4B5563",
        "- color.surface.base: #FFFFFF",
        "- color.surface.subtle: #F8FAFC",
        "- color.accent.primary: #2563EB",
        "- color.success: #15803D",
        "- color.warning: #B45309",
        "- color.danger: #B91C1C",
        "- radius.control: 6px",
        "- spacing.grid: 8px",
        "",
        "## Components",
        "- StageBadge: current, blocked, ready states",
        "- ArtifactCard: id, title, status, version, owner",
        `- DomainMetricCard: ${profile.primaryMetric}`,
        "- CommandButton: safe action proposal with copy affordance",
        "- QaStatusRow: requirement, design, API, security, accessibility, test",
        "- ApprovalBanner: explains gated actions without hiding next step"
      ].join("\n");
    case "page-designs":
      return [
        "# 페이지 디자인",
        "",
        "## Runtime Dashboard",
        "- 목적: productize package의 전체 상태를 한눈에 제공",
        `- 컴포넌트: StageBadge, DomainMetricCard, ${profile.records.slice(0, 3).join("/")} summary, ArtifactCard grid, WorkQueue, QaStatusPanel, NextActionPanel`,
        "- 반응형: 모바일에서는 Artifact/Work/QA 탭 전환",
        "",
        "## Artifact Review",
        "- 목적: markdown body와 version metadata 검토",
        "- 컴포넌트: DocumentList, MarkdownViewer, ApprovalBanner, RevisionCommand",
        "- 상태: review, revised, approved, blocked",
        "",
        "## QA Report",
        "- 목적: PR draft별 release blocker 확인",
        "- 컴포넌트: StatusMatrix, FindingsList, TestCommand, ApprovalGate",
        "- 상태: blocked, changes-requested, approved"
      ].join("\n");
  }
}

function renderProductizeReport(result: ProductizeResult): string {
  return [
    "# Productize Golden Path Report",
    "",
    `- idea: ${result.idea}`,
    `- created_at: ${result.createdAt}`,
    `- current_stage: ${result.stage}`,
    `- deployment_plan: ${result.deployment.filePath}`,
    "",
    "## Traceability",
    "",
    "### Confirmed Facts",
    ...result.traceability.confirmedFacts.map((item) => `- ${item}`),
    "",
    "### Assumptions",
    ...result.traceability.assumptions.map((item) => `- ${item}`),
    "",
    "### Open Questions",
    ...result.traceability.openQuestions.map((item) => `- ${item}`),
    "",
    "## Documents",
    ...result.documents.map((doc) => `- ${doc.docId} ${doc.version} ${doc.status}: ${doc.filePath}`),
    "",
    "## Design Artifacts",
    ...result.designArtifacts.map((artifact) => `- ${artifact.artifactId} ${artifact.version} ${artifact.status}: ${artifact.filePath}`),
    "",
    "## Work Items",
    ...result.issues.map((issue) => `- #${issue.issueNumber} ${issue.assigneeAgent}: ${issue.title} (${issue.status})`),
    "",
    "## PR Drafts",
    ...result.pullRequests.map((pr) => `- PR #${pr.prNumber}: issue #${pr.issueNumber}, ${pr.sourceBranch} -> ${pr.targetBranch}, approval ${pr.userApproval}`),
    "",
    "## QA Reports",
    ...result.qaReports.map((report) => `- PR #${report.prNumber}: requirement ${report.requirementStatus}, design ${report.designStatus}, API ${report.apiContractStatus}, security ${report.securityStatus}, accessibility ${report.accessibilityStatus}, tests ${report.testStatus}`),
    "",
    "## Next Commands",
    ...result.nextCommands.map((command) => `- ${command}`),
    "",
    "## Safety",
    "- External merge, deployment, and credential-gated writes remain blocked until explicit user approval.",
    "- Generated artifacts are review-ready drafts and can be revised before approval."
  ].join("\n");
}
