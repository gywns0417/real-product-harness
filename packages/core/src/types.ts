export const DOCUMENT_IDS = [
  "product-definition",
  "competitor-analysis",
  "differentiation",
  "requirements",
  "screen-definition",
  "feature-definition",
  "fe-technical-spec",
  "be-technical-spec",
  "api-contract",
  "fe-sprint-plan",
  "be-sprint-plan"
] as const;

export type DocumentId = (typeof DOCUMENT_IDS)[number];

export const DESIGN_ARTIFACT_IDS = [
  "references",
  "directions",
  "landing-preview",
  "design-system",
  "page-designs"
] as const;

export type DesignArtifactId = (typeof DESIGN_ARTIFACT_IDS)[number];

export type AgentRole = "Orchestrator" | "PM" | "PD" | "FE" | "BE" | "QA";

export type DocumentStatus = "draft" | "review" | "revised" | "approved";

export type WorkflowStageId =
  | "INIT"
  | "SETUP"
  | "PM_PRODUCT_DEFINITION_INTERVIEW"
  | "PM_PRODUCT_DEFINITION_DRAFT"
  | "PM_PRODUCT_DEFINITION_REVIEW"
  | "PM_PRODUCT_DEFINITION_APPROVED"
  | "PM_COMPETITOR_ANALYSIS"
  | "PM_DIFFERENTIATION"
  | "PM_REQUIREMENTS_INTERVIEW"
  | "PM_REQUIREMENTS_DRAFT"
  | "PM_REQUIREMENTS_REVIEW"
  | "PM_REQUIREMENTS_APPROVED"
  | "PM_SCREEN_DEFINITION_INTERVIEW"
  | "PM_SCREEN_DEFINITION_DRAFT"
  | "PM_SCREEN_DEFINITION_REVIEW"
  | "PM_SCREEN_DEFINITION_APPROVED"
  | "PM_FEATURE_DEFINITION_INTERVIEW"
  | "PM_FEATURE_DEFINITION_DRAFT"
  | "PM_FEATURE_DEFINITION_REVIEW"
  | "PM_FEATURE_DEFINITION_APPROVED"
  | "PM_APPROVED"
  | "PD_REFERENCES"
  | "PD_DIRECTIONS"
  | "PD_LANDING_PREVIEWS"
  | "PD_DESIGN_SYSTEM"
  | "PD_PAGE_DESIGNS"
  | "PD_REVIEW"
  | "PD_APPROVED"
  | "FE_SPEC"
  | "BE_SPEC"
  | "SPRINT_PLANNING"
  | "IMPLEMENTATION"
  | "QA_REVIEW"
  | "READY_FOR_RELEASE"
  | "RELEASE_REVIEW"
  | "RELEASE_APPROVED"
  | "PRODUCTION_DEPLOYED";

export interface WorkflowStage {
  id: WorkflowStageId;
  name: string;
  ownerAgent: AgentRole;
  prerequisites: WorkflowStageId[];
  requiredDocuments: DocumentId[];
  requiredApprovals: DocumentId[];
  requiredDesignArtifacts: DesignArtifactId[];
  requiredDesignApprovals: DesignArtifactId[];
  allowedCommands: string[];
  nextStages: WorkflowStageId[];
  rollbackTargets: WorkflowStageId[];
}

export interface Project {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
  stack: {
    language: "TypeScript";
    runtime: "Node.js";
    packageManager: "pnpm";
    database: "SQLite" | "PostgreSQL" | "unset";
  };
  integrations: {
    github: IntegrationStatus;
    notion: IntegrationStatus;
    obsidian: IntegrationStatus;
    mcp: IntegrationStatus;
  };
}

export type IntegrationStatus = "not-configured" | "configured" | "dry-run";

export interface ProjectState {
  projectId: string;
  currentStage: WorkflowStageId;
  paused: boolean;
  history: StageHistoryEntry[];
  documents: Partial<Record<DocumentId, DocumentIndex>>;
  designArtifacts?: Partial<Record<DesignArtifactId, DesignArtifactIndex>>;
  updatedAt: string;
}

export interface StageHistoryEntry {
  from: WorkflowStageId | null;
  to: WorkflowStageId;
  at: string;
  reason: string;
}

export interface DocumentIndex {
  docId: DocumentId;
  currentVersion: string | null;
  status: DocumentStatus;
  versions: DocumentVersionMeta[];
}

export interface DocumentVersionMeta {
  version: string;
  status: DocumentStatus;
  ownerAgent: AgentRole;
  createdAt: string;
  updatedAt: string;
  changeSummary: string;
  filePath: string;
  relatedIssues: number[];
  relatedPrs: number[];
  approvedBy: string | null;
  approvedAt: string | null;
  rollbackAvailable: boolean;
}

export interface Approval {
  id: string;
  docId: DocumentId;
  version: string;
  approvedBy: string;
  approvedAt: string;
  summary: string;
}

export interface DesignArtifactIndex {
  artifactId: DesignArtifactId;
  currentVersion: string | null;
  status: DocumentStatus;
  versions: DesignArtifactVersionMeta[];
}

export interface DesignArtifactVersionMeta {
  version: string;
  status: DocumentStatus;
  ownerAgent: "PD";
  createdAt: string;
  updatedAt: string;
  changeSummary: string;
  filePath: string;
  approvedBy: string | null;
  approvedAt: string | null;
  rollbackAvailable: boolean;
}

export interface DesignApproval {
  id: string;
  artifactId: DesignArtifactId;
  version: string;
  approvedBy: string;
  approvedAt: string;
  summary: string;
}

export interface InterviewSession {
  id: string;
  docId: DocumentId;
  status: "draft" | "answered" | "summarized";
  createdAt: string;
  updatedAt: string;
  stages: InterviewStage[];
}

export interface InterviewStage {
  id: "intent-discovery" | "scenario-deepening" | "confirmation";
  title: string;
  goal: string;
  questions: string[];
  summary: string | null;
}

export interface GitHubLabel {
  name: string;
  color: string;
  description: string;
}

export interface CommandResult {
  ok: boolean;
  message: string;
  details?: string[];
}

export interface EnvValidation {
  valid: boolean;
  missing: string[];
  present: string[];
}

export type Workstream = "FE" | "BE";

export type WorkIssueStatus = "planned" | "in-progress" | "pr-ready" | "done";

export interface WorkIssue {
  issueNumber: number;
  label: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  relatedDocs: DocumentId[];
  relatedScreens: string[];
  relatedApis: string[];
  branchName: string;
  assigneeAgent: Workstream;
  testRequirement: string;
  qaChecklist: string[];
  status: WorkIssueStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WorkIssueIndex {
  nextIssueNumber: number;
  issues: WorkIssue[];
}

export interface PullRequestRecord {
  issueNumber: number;
  prNumber: number | null;
  sourceBranch: string;
  targetBranch: "dev" | "release" | "main";
  status: "draft" | "ready" | "merged" | "closed";
  qaStatus: "not-requested" | "requested" | "approved" | "changes-requested";
  conflictStatus: "unknown" | "clean" | "conflict";
  testStatus: "not-run" | "passed" | "failed";
  userApproval: "required" | "approved" | "rejected";
  dryRunCommand: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentRecord {
  id: string;
  environment: "dev" | "staging" | "prod";
  provider: string;
  status: "planned" | "blocked" | "deployed" | "failed";
  approvalRequired: true;
  fallback: string;
  filePath: string;
  createdAt: string;
  updatedAt: string;
}
