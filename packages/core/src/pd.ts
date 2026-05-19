import { DesignArtifactId, ProjectState, WorkflowStageId } from "./types";
import { transitionState } from "./workflow";

export interface PdArtifactWorkflow {
  artifactId: DesignArtifactId;
  stage: WorkflowStageId;
  nextAfterApproval: WorkflowStageId;
}

export const PD_ARTIFACT_WORKFLOWS: Record<DesignArtifactId, PdArtifactWorkflow> = {
  references: {
    artifactId: "references",
    stage: "PD_REFERENCES",
    nextAfterApproval: "PD_DIRECTIONS"
  },
  directions: {
    artifactId: "directions",
    stage: "PD_DIRECTIONS",
    nextAfterApproval: "PD_LANDING_PREVIEWS"
  },
  "landing-preview": {
    artifactId: "landing-preview",
    stage: "PD_LANDING_PREVIEWS",
    nextAfterApproval: "PD_DESIGN_SYSTEM"
  },
  "design-system": {
    artifactId: "design-system",
    stage: "PD_DESIGN_SYSTEM",
    nextAfterApproval: "PD_PAGE_DESIGNS"
  },
  "page-designs": {
    artifactId: "page-designs",
    stage: "PD_PAGE_DESIGNS",
    nextAfterApproval: "PD_REVIEW"
  }
};

export function preparePdArtifactState(state: ProjectState, artifactId: DesignArtifactId): ProjectState {
  const flow = PD_ARTIFACT_WORKFLOWS[artifactId];
  if (state.currentStage === flow.stage) {
    return state;
  }
  return transitionState(state, flow.stage, `${artifactId} started`);
}

export function advanceAfterPdApproval(state: ProjectState, artifactId: DesignArtifactId): ProjectState {
  const flow = PD_ARTIFACT_WORKFLOWS[artifactId];
  if (state.currentStage !== flow.stage) {
    return state;
  }
  return transitionState(state, flow.nextAfterApproval, `${artifactId} approved by user`);
}

export function requiredPdApprovals(): DesignArtifactId[] {
  return ["references", "directions", "landing-preview", "design-system", "page-designs"];
}

export function canFinalizePd(state: ProjectState): { ok: boolean; missing: DesignArtifactId[] } {
  const designArtifacts = state.designArtifacts ?? {};
  const missing = requiredPdApprovals().filter((artifactId) => designArtifacts[artifactId]?.status !== "approved");
  return {
    ok: missing.length === 0,
    missing
  };
}
