import { DocumentId, ProjectState, WorkflowStage, WorkflowStageId } from "./types";
import { nowIso } from "./time";

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
  PD_DIRECTIONS: stage("PD_DIRECTIONS", "PD directions", "PD", ["PD_REFERENCES"], [], [], ["PD_LANDING_PREVIEWS"], ["PD_REFERENCES"]),
  PD_LANDING_PREVIEWS: stage("PD_LANDING_PREVIEWS", "Landing previews", "PD", ["PD_DIRECTIONS"], [], [], ["PD_DESIGN_SYSTEM"], ["PD_DIRECTIONS"]),
  PD_DESIGN_SYSTEM: stage("PD_DESIGN_SYSTEM", "Design system", "PD", ["PD_LANDING_PREVIEWS"], [], [], ["PD_PAGE_DESIGNS"], ["PD_LANDING_PREVIEWS"]),
  PD_PAGE_DESIGNS: stage("PD_PAGE_DESIGNS", "Page designs", "PD", ["PD_DESIGN_SYSTEM"], [], [], ["PD_REVIEW"], ["PD_DESIGN_SYSTEM"]),
  PD_REVIEW: stage("PD_REVIEW", "PD review", "PD", ["PD_PAGE_DESIGNS"], [], [], ["PD_APPROVED"], ["PD_PAGE_DESIGNS"]),
  PD_APPROVED: stage("PD_APPROVED", "PD approved", "PD", ["PD_REVIEW"], [], [], ["FE_SPEC", "BE_SPEC"], ["PD_REVIEW"]),
  FE_SPEC: stage("FE_SPEC", "FE specification", "FE", ["PD_APPROVED"], [], [], ["SPRINT_PLANNING"], ["PD_APPROVED"]),
  BE_SPEC: stage("BE_SPEC", "BE specification", "BE", ["PD_APPROVED"], [], [], ["SPRINT_PLANNING"], ["PD_APPROVED"]),
  SPRINT_PLANNING: stage("SPRINT_PLANNING", "Sprint planning", "Orchestrator", ["FE_SPEC", "BE_SPEC"], [], [], ["IMPLEMENTATION"], ["FE_SPEC", "BE_SPEC"]),
  IMPLEMENTATION: stage("IMPLEMENTATION", "Implementation", "Orchestrator", ["SPRINT_PLANNING"], [], [], ["QA_REVIEW"], ["SPRINT_PLANNING"]),
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
  rollbackTargets: WorkflowStageId[]
): WorkflowStage {
  return {
    id,
    name,
    ownerAgent,
    prerequisites,
    requiredDocuments,
    requiredApprovals,
    allowedCommands: ["status", "docs list", "docs show", "pause", "resume", "cancel"],
    nextStages,
    rollbackTargets
  };
}

export function canTransition(state: ProjectState, to: WorkflowStageId): { ok: boolean; reasons: string[] } {
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
  return { ok: reasons.length === 0, reasons };
}

export function transitionState(state: ProjectState, to: WorkflowStageId, reason: string): ProjectState {
  const check = canTransition(state, to);
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
