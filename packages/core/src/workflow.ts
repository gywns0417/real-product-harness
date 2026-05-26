import { DesignArtifactId, DocumentId, ProjectState, RuntimeSessionStage, WorkflowStage, WorkflowStageId } from "./types";
import { nowIso } from "./time";

export interface WorkflowTransitionContext {
  liveVerificationTrusted?: boolean;
  liveVerificationTrustReason?: string;
}

export const WORKFLOW_STAGES: Record<WorkflowStageId, WorkflowStage> = {
  INIT: stage("INIT", "Init", "Orchestrator", [], [], [], ["SETUP"], []),
  SETUP: stage("SETUP", "Setup", "Orchestrator", ["INIT"], [], [], ["PM_PRODUCT_DEFINITION_INTERVIEW"], ["INIT"]),
  PM_PRODUCT_DEFINITION_INTERVIEW: stage("PM_PRODUCT_DEFINITION_INTERVIEW", "Product definition interview", "PM", ["SETUP"], [], [], ["PM_PRODUCT_DEFINITION_DRAFT"], ["SETUP"]),
  PM_PRODUCT_DEFINITION_DRAFT: stage("PM_PRODUCT_DEFINITION_DRAFT", "Product definition draft", "PM", ["PM_PRODUCT_DEFINITION_INTERVIEW"], [], [], ["PM_PRODUCT_DEFINITION_REVIEW"], ["PM_PRODUCT_DEFINITION_INTERVIEW"]),
  PM_PRODUCT_DEFINITION_REVIEW: stage("PM_PRODUCT_DEFINITION_REVIEW", "Product definition review", "PM", ["PM_PRODUCT_DEFINITION_DRAFT"], ["product-definition"], [], ["PM_PRODUCT_DEFINITION_APPROVED"], ["PM_PRODUCT_DEFINITION_DRAFT"]),
  PM_PRODUCT_DEFINITION_APPROVED: stage("PM_PRODUCT_DEFINITION_APPROVED", "Product definition approved", "PM", ["PM_PRODUCT_DEFINITION_REVIEW"], ["product-definition"], ["product-definition"], ["PM_COMPETITOR_ANALYSIS"], ["PM_PRODUCT_DEFINITION_REVIEW"]),
  PM_COMPETITOR_ANALYSIS: stage("PM_COMPETITOR_ANALYSIS", "Competitor analysis", "PM", ["PM_PRODUCT_DEFINITION_APPROVED"], [], ["product-definition"], ["PM_DIFFERENTIATION"], ["PM_PRODUCT_DEFINITION_APPROVED"]),
  PM_DIFFERENTIATION: stage("PM_DIFFERENTIATION", "Differentiation", "PM", ["PM_COMPETITOR_ANALYSIS"], ["competitor-analysis"], ["competitor-analysis"], ["PM_REQUIREMENTS_INTERVIEW"], ["PM_COMPETITOR_ANALYSIS"]),
  PM_REQUIREMENTS_INTERVIEW: stage("PM_REQUIREMENTS_INTERVIEW", "Requirements interview", "PM", ["PM_DIFFERENTIATION"], ["differentiation"], ["differentiation"], ["PM_REQUIREMENTS_DRAFT"], ["PM_DIFFERENTIATION"]),
  PM_REQUIREMENTS_DRAFT: stage("PM_REQUIREMENTS_DRAFT", "Requirements draft", "PM", ["PM_REQUIREMENTS_INTERVIEW"], [], [], ["PM_REQUIREMENTS_REVIEW"], ["PM_REQUIREMENTS_INTERVIEW"]),
  PM_REQUIREMENTS_REVIEW: stage("PM_REQUIREMENTS_REVIEW", "Requirements review", "PM", ["PM_REQUIREMENTS_DRAFT"], ["requirements"], [], ["PM_REQUIREMENTS_APPROVED"], ["PM_REQUIREMENTS_DRAFT"]),
  PM_REQUIREMENTS_APPROVED: stage("PM_REQUIREMENTS_APPROVED", "Requirements approved", "PM", ["PM_REQUIREMENTS_REVIEW"], ["requirements"], ["requirements"], ["PM_SCREEN_DEFINITION_INTERVIEW"], ["PM_REQUIREMENTS_REVIEW"]),
  PM_SCREEN_DEFINITION_INTERVIEW: stage("PM_SCREEN_DEFINITION_INTERVIEW", "Screen definition interview", "PM", ["PM_REQUIREMENTS_APPROVED"], [], [], ["PM_SCREEN_DEFINITION_DRAFT"], ["PM_REQUIREMENTS_APPROVED"]),
  PM_SCREEN_DEFINITION_DRAFT: stage("PM_SCREEN_DEFINITION_DRAFT", "Screen definition draft", "PM", ["PM_SCREEN_DEFINITION_INTERVIEW"], [], [], ["PM_SCREEN_DEFINITION_REVIEW"], ["PM_SCREEN_DEFINITION_INTERVIEW"]),
  PM_SCREEN_DEFINITION_REVIEW: stage("PM_SCREEN_DEFINITION_REVIEW", "Screen definition review", "PM", ["PM_SCREEN_DEFINITION_DRAFT"], ["screen-definition"], [], ["PM_SCREEN_DEFINITION_APPROVED"], ["PM_SCREEN_DEFINITION_DRAFT"]),
  PM_SCREEN_DEFINITION_APPROVED: stage("PM_SCREEN_DEFINITION_APPROVED", "Screen definition approved", "PM", ["PM_SCREEN_DEFINITION_REVIEW"], ["screen-definition"], ["screen-definition"], ["PM_FEATURE_DEFINITION_INTERVIEW"], ["PM_SCREEN_DEFINITION_REVIEW"]),
  PM_FEATURE_DEFINITION_INTERVIEW: stage("PM_FEATURE_DEFINITION_INTERVIEW", "Feature definition interview", "PM", ["PM_SCREEN_DEFINITION_APPROVED"], [], [], ["PM_FEATURE_DEFINITION_DRAFT"], ["PM_SCREEN_DEFINITION_APPROVED"]),
  PM_FEATURE_DEFINITION_DRAFT: stage("PM_FEATURE_DEFINITION_DRAFT", "Feature definition draft", "PM", ["PM_FEATURE_DEFINITION_INTERVIEW"], [], [], ["PM_FEATURE_DEFINITION_REVIEW"], ["PM_FEATURE_DEFINITION_INTERVIEW"]),
  PM_FEATURE_DEFINITION_REVIEW: stage("PM_FEATURE_DEFINITION_REVIEW", "Feature definition review", "PM", ["PM_FEATURE_DEFINITION_DRAFT"], ["feature-definition"], [], ["PM_FEATURE_DEFINITION_APPROVED"], ["PM_FEATURE_DEFINITION_DRAFT"]),
  PM_FEATURE_DEFINITION_APPROVED: stage("PM_FEATURE_DEFINITION_APPROVED", "Feature definition approved", "PM", ["PM_FEATURE_DEFINITION_REVIEW"], ["feature-definition"], ["feature-definition"], ["PM_APPROVED"], ["PM_FEATURE_DEFINITION_REVIEW"]),
  PM_APPROVED: stage("PM_APPROVED", "PM approved", "Orchestrator", ["PM_FEATURE_DEFINITION_APPROVED"], ["product-definition", "competitor-analysis", "differentiation", "requirements", "screen-definition", "feature-definition"], ["product-definition", "competitor-analysis", "differentiation", "requirements", "screen-definition", "feature-definition"], ["PD_REFERENCES"], ["PM_FEATURE_DEFINITION_APPROVED"]),
  PD_REFERENCES: stage("PD_REFERENCES", "PD references", "PD", ["PM_APPROVED"], [], [], ["PD_DIRECTIONS"], ["PM_APPROVED"]),
  PD_DIRECTIONS: stage("PD_DIRECTIONS", "PD directions", "PD", ["PD_REFERENCES"], [], [], ["PD_LANDING_PREVIEWS"], ["PD_REFERENCES"], ["references"], ["references"]),
  PD_LANDING_PREVIEWS: stage("PD_LANDING_PREVIEWS", "Landing previews", "PD", ["PD_DIRECTIONS"], [], [], ["PD_DESIGN_SYSTEM"], ["PD_DIRECTIONS"], ["directions"], ["directions"]),
  PD_DESIGN_SYSTEM: stage("PD_DESIGN_SYSTEM", "Design system", "PD", ["PD_LANDING_PREVIEWS"], [], [], ["PD_PAGE_DESIGNS"], ["PD_LANDING_PREVIEWS"], ["landing-preview"], ["landing-preview"]),
  PD_PAGE_DESIGNS: stage("PD_PAGE_DESIGNS", "Page designs", "PD", ["PD_DESIGN_SYSTEM"], [], [], ["PD_REVIEW"], ["PD_DESIGN_SYSTEM"], ["design-system"], ["design-system"]),
  PD_REVIEW: stage("PD_REVIEW", "PD review", "PD", ["PD_PAGE_DESIGNS"], [], [], ["PD_APPROVED"], ["PD_PAGE_DESIGNS"], ["page-designs"], ["page-designs"]),
  PD_APPROVED: stage("PD_APPROVED", "PD approved", "PD", ["PD_REVIEW"], [], [], ["FE_SPEC", "BE_SPEC"], ["PD_REVIEW"], ["references", "directions", "landing-preview", "design-system", "page-designs"], ["references", "directions", "landing-preview", "design-system", "page-designs"]),
  FE_SPEC: stage("FE_SPEC", "FE specification", "FE", ["PD_APPROVED"], [], [], ["BE_SPEC", "SPRINT_PLANNING"], ["PD_APPROVED"], ["references", "directions", "landing-preview", "design-system", "page-designs"], ["references", "directions", "landing-preview", "design-system", "page-designs"]),
  BE_SPEC: stage("BE_SPEC", "BE specification", "BE", ["PD_APPROVED"], [], [], ["SPRINT_PLANNING"], ["PD_APPROVED"]),
  SPRINT_PLANNING: stage("SPRINT_PLANNING", "Sprint planning", "Orchestrator", ["PD_APPROVED", "FE_SPEC", "BE_SPEC"], ["fe-technical-spec", "be-technical-spec", "api-contract"], ["fe-technical-spec", "be-technical-spec", "api-contract"], ["IMPLEMENTATION"], ["BE_SPEC"]),
  IMPLEMENTATION: stage("IMPLEMENTATION", "Implementation", "Orchestrator", ["SPRINT_PLANNING"], ["fe-sprint-plan", "be-sprint-plan"], ["fe-sprint-plan", "be-sprint-plan"], ["QA_REVIEW"], ["SPRINT_PLANNING"]),
  QA_REVIEW: stage("QA_REVIEW", "QA review", "QA", ["IMPLEMENTATION"], [], [], ["READY_FOR_RELEASE"], ["IMPLEMENTATION"]),
  READY_FOR_RELEASE: stage("READY_FOR_RELEASE", "Ready for release", "Orchestrator", ["QA_REVIEW"], [], [], ["RELEASE_REVIEW"], ["QA_REVIEW"]),
  RELEASE_REVIEW: stage("RELEASE_REVIEW", "Release review", "Orchestrator", ["READY_FOR_RELEASE"], [], [], ["RELEASE_APPROVED"], ["READY_FOR_RELEASE"]),
  RELEASE_APPROVED: stage("RELEASE_APPROVED", "Release approved", "Orchestrator", ["RELEASE_REVIEW"], [], [], ["PRODUCTION_DEPLOYED"], ["RELEASE_REVIEW"]),
  PRODUCTION_DEPLOYED: stage("PRODUCTION_DEPLOYED", "Production deployed", "Orchestrator", ["RELEASE_APPROVED"], [], [], [], ["RELEASE_APPROVED"])
};

function stage(
  id: WorkflowStageId,
  name: string,
  ownerAgent: WorkflowStage["ownerAgent"],
  prerequisites: WorkflowStageId[],
  requiredDocuments: DocumentId[],
  requiredApprovals: DocumentId[],
  nextStages: WorkflowStageId[],
  rollbackTargets: WorkflowStageId[],
  requiredDesignArtifacts: DesignArtifactId[] = [],
  requiredDesignApprovals: DesignArtifactId[] = []
): WorkflowStage {
  return {
    id,
    name,
    ownerAgent,
    prerequisites,
    requiredDocuments,
    requiredApprovals,
    requiredDesignArtifacts,
    requiredDesignApprovals,
    allowedCommands: ["status", "docs list", "docs show", "pause", "resume", "cancel"],
    nextStages,
    rollbackTargets
  };
}

export function canTransition(
  state: ProjectState,
  to: WorkflowStageId,
  context: WorkflowTransitionContext = {}
): { ok: boolean; reasons: string[] } {
  const current = WORKFLOW_STAGES[state.currentStage];
  const target = WORKFLOW_STAGES[to];
  const reasons: string[] = [];
  if (!current.nextStages.includes(to) && !target.prerequisites.includes(state.currentStage)) {
    reasons.push(`${state.currentStage} cannot move directly to ${to}`);
  }
  for (const docId of target.requiredDocuments) {
    const doc = state.documents[docId];
    if (!doc?.currentVersion) {
      reasons.push(`required document missing: ${docId}`);
    }
  }
  for (const docId of target.requiredApprovals) {
    const doc = state.documents[docId];
    if (doc?.status !== "approved") {
      reasons.push(`required approval missing: ${docId}`);
    }
  }
  for (const artifactId of target.requiredDesignArtifacts) {
    const artifact = state.designArtifacts?.[artifactId];
    if (!artifact?.currentVersion) {
      reasons.push(`required design artifact missing: ${artifactId}`);
    }
  }
  for (const artifactId of target.requiredDesignApprovals) {
    const artifact = state.designArtifacts?.[artifactId];
    if (artifact?.status !== "approved") {
      reasons.push(`required design approval missing: ${artifactId}`);
    }
  }
  reasons.push(...evidenceBlockers(state, to, context));
  return { ok: reasons.length === 0, reasons };
}

function evidenceBlockers(state: ProjectState, to: WorkflowStageId, context: WorkflowTransitionContext = {}): string[] {
  const reasons: string[] = [];
  switch (to) {
    case "READY_FOR_RELEASE":
      if (state.evidence?.qa?.status !== "approved") {
        reasons.push("QA evidence missing: every PR draft must have an approved QA report");
      }
      if (state.evidence?.agentIntegration?.required && state.evidence.agentIntegration.status !== "integrated") {
        reasons.push(`agent integration evidence missing: ${state.evidence.agentIntegration.summary}`);
      }
      break;
    case "RELEASE_REVIEW":
      if (state.evidence?.qa?.status !== "approved") {
        reasons.push("QA evidence missing: release review requires approved QA");
      }
      if (state.evidence?.agentIntegration?.required && state.evidence.agentIntegration.status !== "integrated") {
        reasons.push(`agent integration evidence missing: ${state.evidence.agentIntegration.summary}`);
      }
      reasons.push(...liveVerificationBlockers(state, context));
      if (!state.evidence?.release) {
        reasons.push("release evidence missing: create a release plan first");
      }
      break;
    case "RELEASE_APPROVED":
      reasons.push(...liveVerificationBlockers(state, context));
      if (state.evidence?.release?.status !== "approved" || state.evidence.release.userApproval !== "approved") {
        reasons.push("release evidence missing: release plan must be explicitly approved");
      }
      break;
    case "PRODUCTION_DEPLOYED":
      if (state.evidence?.deployment?.status !== "deployed") {
        reasons.push("deployment evidence missing: record a successful deployment first");
      }
      break;
    default:
      break;
  }
  return reasons;
}

function liveVerificationBlockers(state: ProjectState, context: WorkflowTransitionContext): string[] {
  const proof = state.evidence?.liveVerification;
  if (!proof) {
    return ["live verification evidence missing: run rph setup auto --live or rph doctor --live"];
  }
  if (proof.status === "current" && context.liveVerificationTrusted === true) {
    return [];
  }
  if (proof.status === "current") {
    return [`live verification evidence must be revalidated before release${context.liveVerificationTrustReason ? `: ${context.liveVerificationTrustReason}` : ""}`];
  }
  const detail = [
    proof.failedTargets.length > 0 ? `failed=${proof.failedTargets.join(",")}` : null,
    proof.skippedTargets.length > 0 ? `skipped=${proof.skippedTargets.join(",")}` : null,
    proof.source !== "live" ? `source=${proof.source}` : null
  ].filter((item): item is string => Boolean(item)).join(" ");
  return [`live verification evidence not current: status=${proof.status}${detail ? ` ${detail}` : ""}`];
}

export function transitionState(
  state: ProjectState,
  to: WorkflowStageId,
  reason: string,
  context: WorkflowTransitionContext = {}
): ProjectState {
  const check = canTransition(state, to, context);
  if (!check.ok) {
    throw new Error(check.reasons.join("; "));
  }
  const at = nowIso();
  return {
    ...state,
    currentStage: to,
    history: [...state.history, { from: state.currentStage, to, at, reason }],
    updatedAt: at
  };
}

export function nextStage(state: ProjectState): WorkflowStageId | null {
  return WORKFLOW_STAGES[state.currentStage].nextStages[0] ?? null;
}

export function workflowAdvanceStatus(state: ProjectState): {
  currentStage: WorkflowStageId;
  nextStage: WorkflowStageId | null;
  nextCommand?: string;
  canAdvance: boolean;
  reasons: string[];
} {
  const next = nextStage(state);
  if (!next) {
    return {
      currentStage: state.currentStage,
      nextStage: null,
      nextCommand: undefined,
      canAdvance: false,
      reasons: ["no next stage"]
    };
  }
  const check = canTransition(state, next);
  return {
    currentStage: state.currentStage,
    nextStage: next,
    nextCommand: commandForWorkflowStage(next),
    canAdvance: check.ok,
    reasons: check.reasons
  };
}

export function ownerForWorkflowStage(stage: RuntimeSessionStage): WorkflowStage["ownerAgent"] {
  return stage === "UNINITIALIZED" ? "Orchestrator" : WORKFLOW_STAGES[stage].ownerAgent;
}

export function commandForWorkflowStage(stage: RuntimeSessionStage): string | undefined {
  switch (stage) {
    case "UNINITIALIZED":
      return "/init --yes --project-name <name>";
    case "SETUP":
      return "/setup auto";
    case "PM_PRODUCT_DEFINITION_INTERVIEW":
      return "/pm interview";
    case "PM_PRODUCT_DEFINITION_DRAFT":
      return "/pm draft product-definition --ai";
    case "PM_PRODUCT_DEFINITION_REVIEW":
      return "/docs approve product-definition";
    case "PM_PRODUCT_DEFINITION_APPROVED":
    case "PM_COMPETITOR_ANALYSIS":
      return "/pm draft competitor-analysis --ai";
    case "PM_DIFFERENTIATION":
      return "/pm draft differentiation --ai";
    case "PM_REQUIREMENTS_INTERVIEW":
      return "/pm interview requirements";
    case "PM_REQUIREMENTS_DRAFT":
      return "/pm draft requirements --ai";
    case "PM_REQUIREMENTS_REVIEW":
      return "/docs approve requirements";
    case "PM_REQUIREMENTS_APPROVED":
      return "/pm draft screen-definition --ai";
    case "PM_SCREEN_DEFINITION_INTERVIEW":
      return "/pm interview screen-definition";
    case "PM_SCREEN_DEFINITION_DRAFT":
      return "/pm draft screen-definition --ai";
    case "PM_SCREEN_DEFINITION_REVIEW":
      return "/docs approve screen-definition";
    case "PM_SCREEN_DEFINITION_APPROVED":
      return "/pm draft feature-definition --ai";
    case "PM_FEATURE_DEFINITION_INTERVIEW":
      return "/pm interview feature-definition";
    case "PM_FEATURE_DEFINITION_DRAFT":
      return "/pm draft feature-definition --ai";
    case "PM_FEATURE_DEFINITION_REVIEW":
      return "/docs approve feature-definition";
    case "PM_FEATURE_DEFINITION_APPROVED":
    case "PM_APPROVED":
      return "/pd start";
    case "PD_REFERENCES":
      return "/pd references --ai";
    case "PD_DIRECTIONS":
      return "/pd directions --ai";
    case "PD_LANDING_PREVIEWS":
      return "/pd landing-preview --ai";
    case "PD_DESIGN_SYSTEM":
      return "/pd design-system --ai";
    case "PD_PAGE_DESIGNS":
      return "/pd page-designs --ai";
    case "PD_REVIEW":
      return "/pd approve page-designs";
    case "PD_APPROVED":
    case "FE_SPEC":
      return "/fe spec --ai";
    case "BE_SPEC":
      return "/be spec --ai";
    case "SPRINT_PLANNING":
      return "/fe sprint-plan";
    case "IMPLEMENTATION":
      return "/fe work --issue 1";
    case "QA_REVIEW":
      return "/qa report --pr 1";
    case "READY_FOR_RELEASE":
    case "RELEASE_REVIEW":
      return "/github release-plan --version v0.1.0";
    case "RELEASE_APPROVED":
      return "/be deploy-dev --provider local --execute";
    case "PRODUCTION_DEPLOYED":
      return "/status";
    default:
      return "/status";
  }
}

export function artifactRefsForWorkflowStage(stage: RuntimeSessionStage): string[] {
  if (stage === "UNINITIALIZED") {
    return [];
  }
  const current = WORKFLOW_STAGES[stage];
  return [
    ...current.requiredDocuments.map((docId) => `document:${docId}`),
    ...current.requiredApprovals.map((docId) => `approval:${docId}`),
    ...current.requiredDesignArtifacts.map((artifactId) => `design:${artifactId}`),
    ...current.requiredDesignApprovals.map((artifactId) => `design-approval:${artifactId}`)
  ];
}

export function acceptanceCriteriaForWorkflowStage(stage: RuntimeSessionStage): string[] {
  if (stage === "UNINITIALIZED") {
    return [];
  }
  const current = WORKFLOW_STAGES[stage];
  return [
    `owner agent ${current.ownerAgent} can explain the current objective`,
    ...current.requiredDocuments.map((docId) => `document ${docId} exists`),
    ...current.requiredApprovals.map((docId) => `document ${docId} is approved`),
    ...current.requiredDesignArtifacts.map((artifactId) => `design artifact ${artifactId} exists`),
    ...current.requiredDesignApprovals.map((artifactId) => `design artifact ${artifactId} is approved`)
  ];
}

export function blockersForWorkflowStage(
  state: ProjectState | null,
  stageId: WorkflowStageId,
  isActive: boolean
): string[] {
  if (!state) {
    return [];
  }
  if (!isActive) {
    return canTransition(state, stageId).reasons;
  }
  const stage = WORKFLOW_STAGES[stageId];
  return [
    ...stage.requiredDocuments
      .filter((docId) => !state.documents[docId]?.currentVersion)
      .map((docId) => `required document missing: ${docId}`),
    ...stage.requiredApprovals
      .filter((docId) => state.documents[docId]?.status !== "approved")
      .map((docId) => `required approval missing: ${docId}`),
    ...stage.requiredDesignArtifacts
      .filter((artifactId) => !state.designArtifacts?.[artifactId]?.currentVersion)
      .map((artifactId) => `required design artifact missing: ${artifactId}`),
    ...stage.requiredDesignApprovals
      .filter((artifactId) => state.designArtifacts?.[artifactId]?.status !== "approved")
      .map((artifactId) => `required design approval missing: ${artifactId}`),
    ...evidenceBlockers(state, stageId)
  ];
}
