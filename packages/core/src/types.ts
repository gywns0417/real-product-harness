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

export interface AgentRoleContract {
  role: AgentRole;
  purpose: string;
  allowedCommandPrefixes: string[];
  requiredContext: string[];
  successCriteria: string[];
  handoffChecklist: string[];
}

export interface CustomAgentProfile {
  name: string;
  slug: string;
  description: string;
  model?: string;
  modelReasoningEffort?: string;
  sandboxMode?: string;
  developerInstructions: string;
  sourcePath?: string;
  importedAt: string;
}

export interface ActiveCustomAgentProfile {
  name: string;
  slug: string;
  activatedAt: string;
}

export interface AgentExecutionProfileRef {
  source: "custom-toml";
  name: string;
  slug: string;
  model?: string;
  modelReasoningEffort?: string;
  sandboxMode?: string;
  activatedAt?: string;
}

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

export type BuiltInMcpServerId = "notion" | "github" | "figma" | "stitch";

export type McpServerId = string;

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
  authMode?: "none" | "x-goog-api-key" | "bearer";
  authEnvKey?: string;
  protocolReadiness?: "tools/list" | "tools/call" | "not-applicable";
  protocolToolCallProbe?: {
    toolName: string;
    arguments?: Record<string, unknown>;
  };
  agentReadOnlyTools?: string[];
  protocolReason?: string;
  custom?: boolean;
  envKeys: string[];
  missingEnv: string[];
  warnings: string[];
  notes: string;
}

export type McpPolicyKind =
  | "rest-adapter-readback"
  | "protocol-tools-list"
  | "read-only-allowlist"
  | "read-only-probe"
  | "missing-policy";

export type McpPolicySource = "built-in" | "custom" | "runtime";

export type McpPolicyRequiredTrust =
  | "unverified:none"
  | "adapter-ready:credential-probe"
  | "protocol-ready:protocol-tools-list"
  | "protocol-ready:protocol-tool-call";

export type McpPolicyRuntimeState =
  | "allowed-now"
  | "proved-now"
  | "stale-proof"
  | "blocked-by-policy"
  | "unverified";

export interface McpReadOnlyToolContract {
  version: "mcp-read-only-tool-v1";
  toolName: string;
  fingerprint: string;
  endpoint: string;
  authMode: "none" | "x-goog-api-key" | "bearer";
  authEnvKey?: string;
  protocolVersion: string;
  serverInfoName?: string;
  serverInfoVersion?: string;
  inputSchemaSha256: string;
  annotationsSha256: string;
  capturedAt: string;
}

export interface McpServerPolicy {
  kind: McpPolicyKind;
  source: McpPolicySource;
  protocolReadiness: "tools/list" | "tools/call" | "not-applicable";
  protocolToolCallProbe?: {
    toolName: string;
    arguments?: Record<string, unknown>;
  };
  allowToolsList: boolean;
  allowReadOnlyToolCall: boolean;
  requireExplicitServerSelection: boolean;
  agentReadOnlyTools: string[];
  requireReadOnlyToolContracts?: boolean;
  toolContracts?: Record<string, McpReadOnlyToolContract>;
}

export interface McpPolicyRegistry {
  version: 1;
  defaults: {
    toolCallMode: "read-only-allowlist";
    requireExplicitServerSelection: boolean;
  };
  servers: Record<string, McpServerPolicy>;
}

export interface McpPolicyEvaluation {
  kind: McpPolicyKind;
  source: McpPolicySource;
  state: McpPolicyRuntimeState;
  satisfied: boolean;
  requiredTrust: McpPolicyRequiredTrust;
  actualTrust: McpPolicyRequiredTrust | `${string}:${string}`;
  allowToolsList: boolean;
  allowReadOnlyToolCall: boolean;
  requireExplicitServerSelection: boolean;
  agentReadOnlyTools: string[];
  requireReadOnlyToolContracts?: boolean;
  toolContractCount?: number;
  requiredTools: string[];
  missingTools: string[];
  configFingerprint: string;
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
  mcpServers: Record<string, McpServerRuntimeConfig>;
  mcpPolicyRegistry: McpPolicyRegistry;
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
  identity?: {
    type: "ai-provider" | "github-repo" | "notion-page" | "figma-file" | "mcp-server";
    label: string;
    targetId: string;
    verifiedBy: "configuration" | "credential-probe" | "protocol-tools-list" | "protocol-tool-call";
    source: "configuration" | "provider-response" | "mcp-initialize";
  };
  firstActionProof?: {
    action: string;
    label: string;
    targetId: string;
    verifiedBy: "credential-probe" | "protocol-tools-list" | "protocol-tool-call";
    endpoint?: string;
  };
  policy?: McpPolicyEvaluation;
  readiness?: {
    mode: "unverified" | "adapter-partial" | "adapter-ready" | "adapter-write-ready" | "protocol-partial" | "protocol-ready";
    provenStage: "none" | "transport" | "credential-probe" | "protocol-tools-list" | "protocol-tool-call";
    stages: Array<{
      stage: "transport" | "credential-probe" | "protocol-tools-list" | "protocol-tool-call" | "external-write";
      status: "passed" | "failed" | "skipped" | "not-applicable";
      message: string;
      endpoint?: string;
    }>;
  };
  checkedAt: string;
}

export interface ConnectionReportProvenance {
  source: "live" | "mock" | "imported";
  runner: "cli" | "script" | "test" | "unknown";
  command: string;
  projectInitialized: boolean;
  selectedTargets: string[];
  checkedTargetCount: number;
  configFingerprint?: string;
  generatedAt: string;
}

export interface AiGenerationRequest {
  prompt: string;
  system?: string;
  providerId?: AiProviderId;
  executionProfile?: AgentExecutionProfileRef;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface AiProviderAttempt {
  providerId: AiProviderId;
  status: "passed" | "failed" | "skipped";
  message?: string;
}

export interface AiProviderFallback {
  selectedProviderId: AiProviderId;
  attemptedProviderIds: AiProviderId[];
  failures: Array<{
    providerId: AiProviderId;
    message: string;
  }>;
}

export interface AiProviderOutcomeSummary {
  source: "runtime-session" | "ai-run" | "ai-chat";
  id: string;
  sessionId?: string;
  providerId: AiProviderId;
  model?: string;
  providerAttempts?: AiProviderAttempt[];
  providerFallback?: AiProviderFallback;
  at: string;
}

export interface AiGenerationResult {
  id: string;
  providerId: AiProviderId;
  model: string;
  executionProfile?: AgentExecutionProfileRef;
  text: string;
  endpoint: string;
  usage?: Record<string, unknown>;
  providerAttempts?: AiProviderAttempt[];
  providerFallback?: AiProviderFallback;
  generatedAt: string;
}

export interface AiRunRecord {
  id: string;
  providerId: AiProviderId;
  model: string;
  executionProfile?: AgentExecutionProfileRef;
  command: string;
  artifact?: {
    kind: "pm-document" | "pd-artifact" | "engineering-document" | "prompt";
    id: string;
    path?: string;
  };
  promptPreview: string;
  outputPreview: string;
  providerAttempts?: AiProviderAttempt[];
  providerFallback?: AiProviderFallback;
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
  agentTurnId?: string;
  providerId: AiProviderId;
  model: string;
  executionProfile?: AgentExecutionProfileRef;
  user: AiChatMessage;
  assistant: AiChatMessage;
  promptPreview: string;
  providerAttempts?: AiProviderAttempt[];
  providerFallback?: AiProviderFallback;
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

export type AgentToolName =
  | "runtime.get_context"
  | "workflow.get_status"
  | "workflow.get_next"
  | "workflow.can_advance"
  | "artifacts.list"
  | "artifacts.get"
  | "approvals.pending"
  | "actions.pending"
  | "issues.list"
  | "prs.list"
  | "qa.list"
  | "provider.status"
  | "mcp.status"
  | "mcp.tools.list"
  | "mcp.tools.call"
  | "github.repo.read"
  | "notion.page.read"
  | "figma.file.summary"
  | "stitch.tools.list"
  | "stitch.tools.call";

export interface AgentToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: "requested" | "succeeded" | "failed";
  observation?: string;
  error?: string;
  requestedAt: string;
  completedAt?: string;
}

export interface AgentCommandProposal {
  command: string;
  safeToAutoRun: boolean;
  reason?: string;
}

export type RuntimeActionApprovalStatus = "pending" | "approved" | "running" | "completed" | "rejected" | "failed";

export interface RuntimeActionApprovedSnapshot {
  kind: "github.issue" | "github.pr" | "mcp.tool-call";
  version: "github-local-artifact-v1" | "mcp-tool-call-v1";
  fingerprint: string;
  snapshotPath: string;
  bodyPath?: string;
  localIssueNumber?: number;
  localPrNumber?: number;
  serverId?: string;
  toolName?: string;
  endpoint?: string;
  authMode?: "none" | "x-goog-api-key" | "bearer";
  authEnvKey?: string;
  protocolVersion?: string;
  serverInfoName?: string;
  serverInfoVersion?: string;
  inputSchemaSha256?: string;
  annotationsSha256?: string;
  argumentsSha256?: string;
  capturedAt: string;
  summary?: string;
}

export interface RuntimeActionApprovalRecord {
  id: string;
  sessionId: string;
  command: string;
  normalizedCommand: string;
  fingerprint: string;
  source: "agent-command-proposal";
  target: "github" | "notion" | "mcp";
  action: string;
  risk: "external_live_write";
  description: string;
  reason?: string;
  message?: string;
  approvedTargetId?: string;
  approvedParameters?: Record<string, string>;
  approvedSnapshot?: RuntimeActionApprovedSnapshot;
  status: RuntimeActionApprovalStatus;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: string;
  runningAt?: string;
  completedAt?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectReason?: string;
  failedAt?: string;
  failureReason?: string;
  expectedReadback?: string;
  readbackStatus?: "not_required" | "passed" | "failed";
  readbackArtifactPath?: string;
  verifiedTargetId?: string;
  readbackActionApprovalId?: string;
  readbackApprovedFingerprint?: string;
  readbackVerifiedAt?: string;
  resultSummary?: string;
}

export interface AgentHandoffProposal {
  fromAgent?: AgentRole;
  toAgent: AgentRole;
  stage?: WorkflowStageId;
  summary: string;
  artifactRefs?: string[];
  acceptanceCriteria?: string[];
  blockers?: string[];
  nextCommand?: string;
}

export interface AgentTurnAction {
  type: "respond" | "tool_call" | "wait" | "command" | "handoff";
  tool?: string;
  args?: Record<string, unknown>;
  message?: string;
  command?: string;
  safeToAutoRun?: boolean;
  reason?: string;
  handoff?: AgentHandoffProposal;
}

export interface AgentTurnState {
  id: string;
  userInput: string;
  status: "running" | "complete" | "waiting" | "failed";
  startedAt: string;
  updatedAt: string;
  executionProfile?: AgentExecutionProfileRef;
  promptPreview?: string;
  providerId?: AiProviderId;
  model?: string;
  providerAttempts?: AiProviderAttempt[];
  providerFallback?: AiProviderFallback;
  toolCalls: AgentToolCall[];
  finalResponse?: string;
  proposedCommand?: AgentCommandProposal;
  proposedHandoff?: AgentHandoffProposal;
  error?: string;
}

export interface StageQueueEntry {
  id: string;
  stage: WorkflowStageId;
  name: string;
  ownerAgent: AgentRole;
  status: "active" | "ready" | "blocked" | "pending" | "completed";
  nodeType: "stage" | "fan-out" | "fan-in";
  reason: string;
  joinCondition?: string;
  prerequisites: WorkflowStageId[];
  requiredDocuments: DocumentId[];
  requiredApprovals: DocumentId[];
  requiredDesignArtifacts: DesignArtifactId[];
  requiredDesignApprovals: DesignArtifactId[];
  nextStages: WorkflowStageId[];
  nextCommand?: string;
  blockers: string[];
  handoffIds?: string[];
  laneRunIds?: string[];
  fanIn?: {
    reducerStatus: "waiting" | "ready" | "blocked" | "complete";
    readyPrerequisites: WorkflowStageId[];
    pendingPrerequisites: WorkflowStageId[];
    sourceHandoffIds?: string[];
    sourceLaneRunIds?: string[];
    sourceArtifactRefs?: string[];
    materializationKey?: string;
    materializedAt?: string;
    blockerSummary?: string;
  };
}

export interface RuntimeExecutionGraphNode {
  id: string;
  stage: WorkflowStageId;
  name: string;
  ownerAgent: AgentRole;
  status: StageQueueEntry["status"];
  nodeType: StageQueueEntry["nodeType"];
  reason: string;
  joinCondition?: string;
  prerequisites: WorkflowStageId[];
  nextStages: WorkflowStageId[];
  nextCommand?: string;
  blockers: string[];
  requiredDocuments: DocumentId[];
  requiredApprovals: DocumentId[];
  requiredDesignArtifacts: DesignArtifactId[];
  requiredDesignApprovals: DesignArtifactId[];
  handoffIds: string[];
  laneRunIds: string[];
  fanIn?: StageQueueEntry["fanIn"];
}

export interface RuntimeExecutionGraphEdge {
  id: string;
  from: string;
  to: string;
  kind: "workflow-next" | "prerequisite";
  status: "open" | "blocked" | "satisfied";
  reason?: string;
}

export interface RuntimeExecutionGraph {
  version: 1;
  graphId: string;
  sessionId: string;
  source: "runtime-execution-graph";
  projectRoot: string;
  currentStage: RuntimeSessionStage;
  status: RuntimeSessionManifest["status"];
  generatedAt: string;
  updatedAt: string;
  queueFingerprint: string;
  summary: {
    nodeCount: number;
    edgeCount: number;
    activeNodeIds: string[];
    readyNodeIds: string[];
    pendingNodeIds: string[];
    blockedNodeIds: string[];
    completedNodeIds: string[];
    fanInNodeIds: string[];
    fanOutNodeIds: string[];
    blockerCount: number;
    handoffCount: number;
    laneRunCount: number;
  };
  nodes: RuntimeExecutionGraphNode[];
  edges: RuntimeExecutionGraphEdge[];
}

export interface WaitCondition {
  kind: "paused" | "blocked" | "user_approval" | "qa_fix" | "external_live_write";
  message: string;
  since: string;
}

export interface HandoffPacket {
  fromAgent: AgentRole;
  toAgent: AgentRole;
  stage: WorkflowStageId;
  summary: string;
  roleContract?: AgentRoleContract;
  artifactRefs?: string[];
  acceptanceCriteria?: string[];
  blockers?: string[];
  nextCommand?: string;
  resumeCursor?: string;
  fanIn?: {
    reducerStage: WorkflowStageId;
    sourceStages: WorkflowStageId[];
    sourceHandoffIds: string[];
    sourceLaneRunIds: string[];
    sourceArtifactRefs: string[];
    materializationKey?: string;
  };
  createdAt: string;
}

export interface RuntimeHandoffRecord {
  id: string;
  sessionId: string;
  packet: HandoffPacket;
  status: "pending" | "acknowledged" | "claimed" | "running" | "completed" | "rejected" | "dead_letter";
  createdAt: string;
  updatedAt: string;
  attempts?: number;
  maxAttempts?: number;
  claimedBy?: string;
  workerSessionId?: string;
  claimToken?: string;
  poolId?: string;
  slotId?: string;
  slotIndex?: number;
  claimedAt?: string;
  leaseExpiresAt?: string;
  heartbeatAt?: string;
  laneRunId?: string;
  lastFailureAt?: string;
  lastFailureReason?: string;
  acknowledgedAt?: string;
  completedAt?: string;
  rejectedAt?: string;
  deadLetterAt?: string;
  deadLetterReason?: string;
  note?: string;
}

export interface AgentLaneResultSummary {
  ok: boolean;
  summary: string;
  artifacts: string[];
  acceptance: string[];
  completedCommand: string;
  executionMode?: "command" | "autonomous";
  autonomousTurnId?: string;
  proposedCommand?: string;
  executedCommand?: string;
}

export interface AgentLaneMemoryRef {
  scope: AgentRole;
  filePath: string;
  entriesBefore: number;
  entriesAfter?: number;
  lastEntryAt?: string;
}

export interface AgentLaneToolBudget {
  maxToolCalls: number;
  remainingToolCalls: number;
  maxOutputTokens: number;
  externalWriteBudget: 0;
}

export interface AgentLaneRunRecord {
  id: string;
  sessionId: string;
  handoffId?: string;
  workerId?: string;
  workerSessionId?: string;
  claimToken?: string;
  workerPid?: number;
  poolId?: string;
  slotId?: string;
  slotIndex?: number;
  attempt?: number;
  role: AgentRole;
  stage: WorkflowStageId;
  status: "claimed" | "running" | "completed" | "failed";
  command: string;
  summary: string;
  roleContract: AgentRoleContract;
  systemPrompt: string;
  executionProfile?: AgentExecutionProfileRef;
  toolPolicy: {
    allowedCommandPrefixes: string[];
    externalWritesRequireApproval: boolean;
  };
  toolBudget: AgentLaneToolBudget;
  memory: AgentLaneMemoryRef;
  artifactRefs: string[];
  acceptanceCriteria: string[];
  blockers: string[];
  executionMode?: "command" | "autonomous";
  autonomousTurnId?: string;
  proposedCommand?: string;
  executedCommand?: string;
  heartbeatAt?: string;
  leaseExpiresAt?: string;
  runningAt?: string;
  result?: AgentLaneResultSummary;
  merge?: {
    status: "pending" | "merged" | "blocked";
    mergedAt?: string;
    summary?: string;
    artifactRefs: string[];
  };
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  exitOk?: boolean;
  error?: string;
}

export interface RuntimeSessionManifest {
  version: 1 | 2;
  sessionId: string;
  status: "active" | "paused" | "blocked" | "recovering" | "cancelled" | "complete";
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
  activeTurn?: AgentTurnState | null;
  stageQueue?: StageQueueEntry[];
  waitCondition?: WaitCondition | null;
  handoffPacket?: HandoffPacket | null;
  toolTrace?: AgentToolCall[];
  pendingExternalActionId?: string | null;
}

export interface RuntimeSessionJournalRecord {
  version: 1;
  kind: "snapshot";
  at: string;
  sessionId: string;
  sequence: number;
  status: RuntimeSessionManifest["status"];
  stage: RuntimeSessionStage;
  ownerAgent: AgentRole;
  checkpoint?: string | null;
  blocker?: string | null;
  pendingActionCommand?: string | null;
  pendingExternalActionId?: string | null;
  waitConditionKind?: WaitCondition["kind"] | null;
  activeTurnId?: string | null;
  activeTurnStatus?: AgentTurnState["status"] | null;
  historyLength: number;
  manifest: RuntimeSessionManifest;
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

export interface AgentConnectionProofSummary {
  kind: "ai" | "mcp";
  id: string;
  status: "passed" | "failed" | "skipped";
  trustCategory: string;
  provenStage: string;
  identityLabel?: string;
  targetId?: string;
  firstAction?: string;
  firstActionLabel?: string;
  policy?: McpPolicyEvaluation;
  readTools: string[];
}

export interface AgentProofSummary {
  kind: string;
  status: string;
  subject: string;
  label: string;
  trust?: string;
  targetId?: string;
  summary: string;
  at: string;
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
  connectionProofs: AgentConnectionProofSummary[];
  recentProofs: AgentProofSummary[];
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
  evidence?: WorkflowEvidence;
  updatedAt: string;
}

export interface WorkflowEvidence {
  liveVerification?: {
    status: "current" | "failed" | "missing" | "not-current";
    source: ConnectionReportProvenance["source"];
    passedTargets: string[];
    failedTargets: string[];
    skippedTargets: string[];
    reportPath: string;
    configFingerprint?: string;
    checkedAt: string;
    updatedAt: string;
  };
  agentIntegration?: {
    status: "missing" | "integrated" | "partial" | "blocked";
    required: boolean;
    runIds: string[];
    mergedRunIds: string[];
    failedRunIds: string[];
    latestProofId?: string;
    summary: string;
    updatedAt: string;
  };
  qa?: {
    status: "unknown" | "approved" | "changes-requested" | "blocked";
    approvedPrs: number[];
    pendingPrs: number[];
    changesRequestedPrs: number[];
    lastReportPath?: string;
    updatedAt: string;
  };
  release?: {
    id: string;
    version: string | null;
    status: ReleasePlanRecord["status"];
    userApproval: ReleasePlanRecord["userApproval"];
    filePath: string;
    updatedAt: string;
  };
  deployment?: {
    environment: DeploymentRecord["environment"];
    provider: string;
    status: DeploymentRecord["status"];
    filePath: string;
    updatedAt: string;
  };
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
  githubIssueNumber?: number;
  githubUrl?: string | null;
  githubReadbackStatus?: "not_required" | "passed" | "failed";
  githubReadbackReason?: string;
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
  githubPrNumber?: number;
  githubUrl?: string | null;
  githubReadbackStatus?: "not_required" | "passed" | "failed";
  githubReadbackReason?: string;
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
