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

export interface SetupChoices {
  aiProvider: "openai-codex" | "anthropic-claude" | "google-gemini" | "local-model" | "mixed" | "later";
  deployment: "local" | "docker" | "aws" | "gcp" | "vercel" | "render" | "fly" | "railway" | "custom" | "later";
  stack: "recommended" | "custom" | "analyze-existing";
  mcp: string[];
}

export type IntegrationStatus = "not-configured" | "configured" | "dry-run";

export type AiProviderId = "openai" | "anthropic" | "gemini" | "local";

export type McpServerId = "notion" | "github" | "figma" | "stitch";

export interface AiProviderConfig {
  id: AiProviderId;
  name: string;
  enabled: boolean;
  configured: boolean;
  envKeys: string[];
  missingEnv: string[];
  model: string;
  baseUrl: string;
  testEndpoint: string;
}

export interface McpServerRuntimeConfig {
  id: McpServerId;
  name: string;
  kind: "mcp-server" | "rest-adapter";
  enabled: boolean;
  configured: boolean;
  transport: "stdio" | "http";
  command?: string;
  url?: string;
  envKeys: string[];
  missingEnv: string[];
  warnings: string[];
  notes: string;
}

export interface RuntimeUiConfig {
  theme: "hacker" | "mono" | "minimal";
  color: boolean;
  bootAnimation: boolean;
}

export interface HarnessConfig {
  version: 1;
  activeAiProvider: AiProviderId | "auto" | "none";
  aiProviders: Record<AiProviderId, AiProviderConfig>;
  mcpServers: Record<McpServerId, McpServerRuntimeConfig>;
  deployment: SetupChoices["deployment"];
  stack: SetupChoices["stack"];
  custom: Record<string, string>;
  ui: RuntimeUiConfig;
  updatedAt: string;
}

export interface ConnectionCheck {
  id: string;
  kind: "ai" | "mcp" | "env" | "runtime";
  status: "passed" | "failed" | "skipped";
  message: string;
  requiredEnv: string[];
  missingEnv: string[];
  endpoint?: string;
  readiness?: {
    provenStage: "none" | "transport" | "credential-probe" | "protocol-tools-list" | "protocol-tool-call";
    stages: Array<{
      stage: "transport" | "credential-probe" | "protocol-tools-list" | "protocol-tool-call";
      status: "passed" | "failed" | "skipped" | "not-applicable";
      message: string;
      endpoint?: string;
    }>;
  };
  checkedAt: string;
}

export interface AiGenerationRequest {
  prompt: string;
  system?: string;
  providerId?: AiProviderId;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface AiGenerationResult {
  id: string;
  providerId: AiProviderId;
  model: string;
  text: string;
  endpoint: string;
  usage?: Record<string, unknown>;
  generatedAt: string;
}

export interface AiRunRecord {
  id: string;
  providerId: AiProviderId;
  model: string;
  command: string;
  artifact?: {
    kind: "pm-document" | "pd-artifact" | "engineering-document" | "prompt";
    id: string;
    path?: string;
  };
  promptPreview: string;
  outputPreview: string;
  generatedAt: string;
}

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
  at: string;
}

export interface AiChatTurnRecord {
  id: string;
  sessionId: string;
  providerId: AiProviderId;
  model: string;
  user: AiChatMessage;
  assistant: AiChatMessage;
  promptPreview: string;
  generatedAt: string;
}

export type AgentPlanKind = "slash-command" | "chat" | "start-workflow" | "status" | "unknown" | "command" | "blocked";

export type RuntimeSessionStage = WorkflowStageId | "UNINITIALIZED";

export interface AgentActionPlan {
  kind: AgentPlanKind;
  confidence: number;
  reason: string;
  command?: string;
  workflowTarget?: string;
  safeToAutoRun: boolean;
  steps: string[];
  createdAt: string;
}

export interface RuntimeSessionEvent {
  at: string;
  kind: "start" | "input" | "plan" | "command" | "chat" | "checkpoint" | "blocker" | "error" | "resume";
  message: string;
  ok?: boolean;
  plan?: AgentActionPlan;
}

export interface RuntimeSessionManifest {
  version: 1;
  sessionId: string;
  status: "active" | "paused" | "cancelled" | "complete";
  projectRoot: string;
  startedAt: string;
  updatedAt: string;
  stage: RuntimeSessionStage;
  ownerAgent: AgentRole;
  pendingAction: AgentActionPlan | null;
  checkpoint: string | null;
  blocker: string | null;
  retryCount: number;
  lastCommand?: string;
  lastCommandOk?: boolean;
  history: RuntimeSessionEvent[];
}

export interface AgentContextArtifact {
  kind: "document" | "design-artifact";
  id: string;
  title: string;
  status: DocumentStatus;
  currentVersion: string | null;
  approvedVersion: string | null;
  currentBody?: string;
  approvedBody?: string;
  selectedBody?: string;
  selectedBodySource: "current" | "approved" | "none";
}

export interface AgentConfigSummary {
  activeProvider: AiProviderId | "auto" | "none";
  configuredProviders: AiProviderId[];
  configuredServers: McpServerId[];
  deployment: HarnessConfig["deployment"];
  stack: HarnessConfig["stack"];
  uiTheme: RuntimeUiConfig["theme"];
  uiColor: boolean;
  bootAnimation: boolean;
  customKeys: string[];
}

export interface AgentContextBundle {
  project: {
    id: string;
    name: string;
    rootPath: string;
  };
  workflow: {
    currentStage: WorkflowStageId;
    currentStageName: string;
    ownerAgent: AgentRole;
    paused: boolean;
    nextStage: WorkflowStageId | null;
  };
  ai: {
    activeProvider: AiProviderId | "auto" | "none";
    configuredProviders: AiProviderId[];
  };
  mcp: {
    configuredServers: McpServerId[];
  };
  documents: AgentContextArtifact[];
  designArtifacts: AgentContextArtifact[];
  approvals: Approval[];
  designApprovals: DesignApproval[];
  issues: WorkIssue[];
  pullRequests: PullRequestRecord[];
  qaReports: QAReportRecord[];
  configSummary: AgentConfigSummary;
  prompt: string;
  files: string[];
  assembledAt: string;
}

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

export interface Agent {
  id: string;
  role: AgentRole;
  name: string;
  responsibilities: string[];
}

export interface Document {
  docId: DocumentId;
  title: string;
  ownerAgent: AgentRole;
  currentVersion: string | null;
  status: DocumentStatus;
}

export interface InterviewQuestion {
  id: string;
  stageId: InterviewStage["id"];
  question: string;
  required: boolean;
}

export interface InterviewAnswer {
  questionId: string;
  answer: string;
  answeredAt: string;
}

export interface Decision {
  id: string;
  area: string;
  decision: string;
  rationale: string;
  status: "proposed" | "accepted" | "rejected";
  decidedAt: string | null;
}

export interface DesignReference {
  id: string;
  name: string;
  url: string;
  selected: boolean;
  notes: string;
}

export interface DesignDirection {
  id: string;
  name: string;
  brandKeywords: string[];
  colorTokens: string[];
  typography: string;
  layoutPrinciples: string[];
  interactionPrinciples: string[];
}

export interface DesignSystem {
  id: string;
  version: string;
  tokens: string[];
  components: DesignComponent[];
}

export interface DesignComponent {
  name: string;
  type: string;
  states: string[];
  accessibilityNotes: string[];
}

export interface Screen {
  id: string;
  name: string;
  purpose: string;
  states: string[];
  relatedApis: string[];
}

export interface Feature {
  id: string;
  name: string;
  priority: string;
  acceptanceCriteria: string[];
  testCriteria: string[];
}

export interface Sprint {
  id: string;
  name: string;
  goal: string;
  issueNumbers: number[];
  prerequisites: string[];
  doneCriteria: string[];
  risks: string[];
  dependencies: string[];
  userConfirmRequired: boolean;
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
  prNumber: number;
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

export interface PullRequestIndex {
  nextPrNumber: number;
  pullRequests: PullRequestRecord[];
}

export interface QAReportRecord {
  prNumber: number;
  status: "approved" | "changes-requested" | "blocked";
  conflictStatus: "unknown" | "clean" | "conflict";
  testStatus: "not-run" | "passed" | "failed";
  requirementStatus: "unknown" | "matched" | "gap";
  designStatus: "unknown" | "matched" | "gap";
  apiContractStatus: "unknown" | "matched" | "gap";
  securityStatus: "unknown" | "clear" | "risk";
  accessibilityStatus: "unknown" | "clear" | "risk";
  findings: string[];
  reportPath: string;
  userMergeDecisionRequired: true;
  createdAt: string;
  updatedAt: string;
}

export interface ReleasePlanRecord {
  id: string;
  kind: "release" | "hotfix";
  sourceBranch: string;
  targetBranch: "main" | "release" | "dev";
  version: string | null;
  title: string;
  status: "planned" | "approved" | "blocked";
  userApproval: "required" | "approved" | "rejected";
  rollbackPlan: string;
  filePath: string;
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

export type Integration = Project["integrations"];

export interface MCPServer {
  name: string;
  enabled: boolean;
  transport: "stdio" | "http";
  url?: string;
  command?: string;
}

export interface EnvironmentVariable {
  name: string;
  required: boolean;
  secret: boolean;
  configured: boolean;
}

export interface GitBranch {
  name: string;
  base: "main" | "release" | "dev" | string;
  issueNumber: number | null;
  status: "planned" | "created" | "merged" | "closed";
}

export interface CommandLog {
  id: string;
  command: string;
  status: "planned" | "succeeded" | "failed" | "skipped";
  outputSummary: string;
  createdAt: string;
}
