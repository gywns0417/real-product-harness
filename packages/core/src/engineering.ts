import { approveDocument } from "./approvals";
import { createDocumentVersion, readDocumentIndex, syncStateDocuments } from "./documents";
import { loadState } from "./project";
import { DocumentId, ProjectState } from "./types";
import { transitionState } from "./workflow";

export const FE_SPEC_DOC: DocumentId = "fe-technical-spec";
export const BE_SPEC_DOC: DocumentId = "be-technical-spec";
export const API_CONTRACT_DOC: DocumentId = "api-contract";
export const FE_SPRINT_PLAN_DOC: DocumentId = "fe-sprint-plan";
export const BE_SPRINT_PLAN_DOC: DocumentId = "be-sprint-plan";

export interface EngineeringDocumentWorkflow {
  docId: DocumentId;
  stage: "FE_SPEC" | "BE_SPEC" | "SPRINT_PLANNING";
  ownerAgent: "FE" | "BE" | "Orchestrator";
}

export const ENGINEERING_DOCUMENT_WORKFLOWS: Partial<Record<DocumentId, EngineeringDocumentWorkflow>> = {
  [FE_SPEC_DOC]: {
    docId: FE_SPEC_DOC,
    stage: "FE_SPEC",
    ownerAgent: "FE"
  },
  [BE_SPEC_DOC]: {
    docId: BE_SPEC_DOC,
    stage: "BE_SPEC",
    ownerAgent: "BE"
  },
  [API_CONTRACT_DOC]: {
    docId: API_CONTRACT_DOC,
    stage: "BE_SPEC",
    ownerAgent: "BE"
  },
  [FE_SPRINT_PLAN_DOC]: {
    docId: FE_SPRINT_PLAN_DOC,
    stage: "SPRINT_PLANNING",
    ownerAgent: "FE"
  },
  [BE_SPRINT_PLAN_DOC]: {
    docId: BE_SPRINT_PLAN_DOC,
    stage: "SPRINT_PLANNING",
    ownerAgent: "BE"
  }
};

export function prepareEngineeringDocumentState(state: ProjectState, docId: DocumentId): ProjectState {
  const flow = ENGINEERING_DOCUMENT_WORKFLOWS[docId];
  if (!flow) {
    throw new Error(`unsupported engineering document: ${docId}`);
  }
  if (state.currentStage === flow.stage) {
    return state;
  }
  if (isEngineeringFanOutSiblingStage(state.currentStage, flow.stage)) {
    return { ...state, currentStage: flow.stage };
  }
  return transitionState(state, flow.stage, `${docId} started`);
}

export function createEngineeringDocumentVersion(
  projectRoot: string,
  docId: DocumentId,
  options: { body?: string; changeSummary: string }
) {
  const flow = ENGINEERING_DOCUMENT_WORKFLOWS[docId];
  if (!flow) {
    throw new Error(`unsupported engineering document: ${docId}`);
  }
  return createDocumentVersion(projectRoot, docId, {
    ownerAgent: flow.ownerAgent,
    changeSummary: options.changeSummary,
    body: options.body
  });
}

export function approveEngineeringDocument(projectRoot: string, docId: DocumentId, approvedBy = "user"): ProjectState {
  approveDocument(projectRoot, docId, approvedBy);
  let state = syncStateDocuments(loadState(projectRoot), readDocumentIndex(projectRoot, docId));
  state = advanceAfterEngineeringApproval(state, docId);
  return state;
}

export function advanceAfterEngineeringApproval(state: ProjectState, docId: DocumentId): ProjectState {
  if (
    ["PD_APPROVED", "FE_SPEC", "BE_SPEC"].includes(state.currentStage) &&
    [FE_SPEC_DOC, BE_SPEC_DOC, API_CONTRACT_DOC].includes(docId) &&
    isApproved(state, FE_SPEC_DOC) &&
    isApproved(state, BE_SPEC_DOC) &&
    isApproved(state, API_CONTRACT_DOC)
  ) {
    return transitionState(state, "SPRINT_PLANNING", "FE/BE specification fan-in approved");
  }
  if (state.currentStage === "FE_SPEC" && docId === FE_SPEC_DOC && isApproved(state, FE_SPEC_DOC)) {
    return transitionState(state, "BE_SPEC", "FE technical specification approved");
  }
  if (
    state.currentStage === "BE_SPEC" &&
    [BE_SPEC_DOC, API_CONTRACT_DOC].includes(docId) &&
    isApproved(state, BE_SPEC_DOC) &&
    isApproved(state, API_CONTRACT_DOC)
  ) {
    return transitionState(state, "SPRINT_PLANNING", "BE specification and API contract approved");
  }
  if (
    state.currentStage === "SPRINT_PLANNING" &&
    [FE_SPRINT_PLAN_DOC, BE_SPRINT_PLAN_DOC].includes(docId) &&
    isApproved(state, FE_SPRINT_PLAN_DOC) &&
    isApproved(state, BE_SPRINT_PLAN_DOC)
  ) {
    return transitionState(state, "IMPLEMENTATION", "FE/BE sprint plans approved");
  }
  return state;
}

export function canFinalizeEngineeringSpecs(state: ProjectState): { ok: boolean; missing: DocumentId[] } {
  const required = [FE_SPEC_DOC, BE_SPEC_DOC, API_CONTRACT_DOC];
  const missing = required.filter((docId) => !isApproved(state, docId));
  return { ok: missing.length === 0, missing };
}

export function canFinalizeSprintPlans(state: ProjectState): { ok: boolean; missing: DocumentId[] } {
  const required = [FE_SPRINT_PLAN_DOC, BE_SPRINT_PLAN_DOC];
  const missing = required.filter((docId) => !isApproved(state, docId));
  return { ok: missing.length === 0, missing };
}

function isApproved(state: ProjectState, docId: DocumentId): boolean {
  return state.documents[docId]?.status === "approved";
}

function isEngineeringFanOutSiblingStage(
  currentStage: ProjectState["currentStage"],
  targetStage: EngineeringDocumentWorkflow["stage"]
): boolean {
  return targetStage !== "SPRINT_PLANNING" && ["PD_APPROVED", "FE_SPEC", "BE_SPEC"].includes(currentStage);
}
