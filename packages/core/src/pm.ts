import { DocumentId, ProjectState, WorkflowStageId } from "./types";
import { transitionState } from "./workflow";

export interface PmDocumentWorkflow {
  docId: DocumentId;
  interviewStage?: WorkflowStageId;
  draftStage?: WorkflowStageId;
  reviewStage?: WorkflowStageId;
  approvedStage?: WorkflowStageId;
  activeStage?: WorkflowStageId;
  nextAfterApproval: WorkflowStageId;
  requiresInterview: boolean;
}

export const PM_DOCUMENT_WORKFLOWS: Record<DocumentId, PmDocumentWorkflow> = {
  "product-definition": {
    docId: "product-definition",
    interviewStage: "PM_PRODUCT_DEFINITION_INTERVIEW",
    draftStage: "PM_PRODUCT_DEFINITION_DRAFT",
    reviewStage: "PM_PRODUCT_DEFINITION_REVIEW",
    approvedStage: "PM_PRODUCT_DEFINITION_APPROVED",
    nextAfterApproval: "PM_PRODUCT_DEFINITION_APPROVED",
    requiresInterview: true
  },
  "competitor-analysis": {
    docId: "competitor-analysis",
    activeStage: "PM_COMPETITOR_ANALYSIS",
    nextAfterApproval: "PM_DIFFERENTIATION",
    requiresInterview: false
  },
  differentiation: {
    docId: "differentiation",
    activeStage: "PM_DIFFERENTIATION",
    nextAfterApproval: "PM_REQUIREMENTS_INTERVIEW",
    requiresInterview: false
  },
  requirements: {
    docId: "requirements",
    interviewStage: "PM_REQUIREMENTS_INTERVIEW",
    draftStage: "PM_REQUIREMENTS_DRAFT",
    reviewStage: "PM_REQUIREMENTS_REVIEW",
    approvedStage: "PM_REQUIREMENTS_APPROVED",
    nextAfterApproval: "PM_REQUIREMENTS_APPROVED",
    requiresInterview: true
  },
  "screen-definition": {
    docId: "screen-definition",
    interviewStage: "PM_SCREEN_DEFINITION_INTERVIEW",
    draftStage: "PM_SCREEN_DEFINITION_DRAFT",
    reviewStage: "PM_SCREEN_DEFINITION_REVIEW",
    approvedStage: "PM_SCREEN_DEFINITION_APPROVED",
    nextAfterApproval: "PM_SCREEN_DEFINITION_APPROVED",
    requiresInterview: true
  },
  "feature-definition": {
    docId: "feature-definition",
    interviewStage: "PM_FEATURE_DEFINITION_INTERVIEW",
    draftStage: "PM_FEATURE_DEFINITION_DRAFT",
    reviewStage: "PM_FEATURE_DEFINITION_REVIEW",
    approvedStage: "PM_FEATURE_DEFINITION_APPROVED",
    nextAfterApproval: "PM_FEATURE_DEFINITION_APPROVED",
    requiresInterview: true
  }
};

export function advanceAfterPmDraft(state: ProjectState, docId: DocumentId): ProjectState {
  const flow = PM_DOCUMENT_WORKFLOWS[docId];
  if (flow.interviewStage && flow.draftStage && flow.reviewStage && state.currentStage === flow.interviewStage) {
    const drafted = transitionState(state, flow.draftStage, `${docId} draft created`);
    return transitionState(drafted, flow.reviewStage, `${docId} ready for review`);
  }
  return state;
}

export function preparePmDraftState(state: ProjectState, docId: DocumentId): ProjectState {
  const flow = PM_DOCUMENT_WORKFLOWS[docId];
  const target = flow.interviewStage ?? flow.activeStage;
  if (!target || state.currentStage === target) {
    return state;
  }
  return transitionState(state, target, `${docId} started`);
}

export function advanceAfterPmApproval(state: ProjectState, docId: DocumentId): ProjectState {
  const flow = PM_DOCUMENT_WORKFLOWS[docId];
  if (flow.reviewStage && flow.approvedStage && state.currentStage === flow.reviewStage) {
    return transitionState(state, flow.approvedStage, `${docId} approved by user`);
  }
  if (flow.activeStage && state.currentStage === flow.activeStage) {
    return transitionState(state, flow.nextAfterApproval, `${docId} approved by user`);
  }
  return state;
}

export function requiredPmApprovals(): DocumentId[] {
  return [
    "product-definition",
    "competitor-analysis",
    "differentiation",
    "requirements",
    "screen-definition",
    "feature-definition"
  ];
}

export function canFinalizePm(state: ProjectState): { ok: boolean; missing: DocumentId[] } {
  const missing = requiredPmApprovals().filter((docId) => state.documents[docId]?.status !== "approved");
  return {
    ok: missing.length === 0,
    missing
  };
}
