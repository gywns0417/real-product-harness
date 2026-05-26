import { parseCli, parseCommandLine } from "./commands";
import { WorkflowStageId } from "./types";

export type OrchestrationActionSource = "bootstrap" | "pending-action" | "handoff" | "stage-advance" | "stage-action";

export interface OrchestrationAction {
  command?: string;
  source: OrchestrationActionSource;
  handoffId?: string;
  blocker?: string;
}

export interface PendingOrchestrationHandoff {
  id: string;
  stage: WorkflowStageId;
  nextCommand?: string;
  contractViolation?: string;
}

export interface OrchestrationTransitionCheck {
  ok: boolean;
  reasons: string[];
}

export interface OrchestrationPolicyInput {
  initialized: boolean;
  paused?: boolean;
  currentStage?: WorkflowStageId;
  currentNextStages?: WorkflowStageId[];
  pendingHandoff?: PendingOrchestrationHandoff;
  handoffStageTransition?: OrchestrationTransitionCheck;
  pendingActionCommand?: string;
  canAdvance?: boolean;
  recommendedCommand?: string;
  hasReadyAiProvider?: boolean;
}

export function planOrchestrationAction(input: OrchestrationPolicyInput): OrchestrationAction {
  if (!input.initialized) {
    return { source: "bootstrap", command: "/setup auto" };
  }
  if (input.paused) {
    return { source: "stage-action", blocker: "workflow is paused until /resume" };
  }
  const readyAi = Boolean(input.hasReadyAiProvider);
  if (input.pendingHandoff?.nextCommand) {
    if (input.pendingHandoff.contractViolation) {
      return {
        source: "handoff",
        blocker: `handoff ${input.pendingHandoff.id} violates role contract: ${input.pendingHandoff.contractViolation}`
      };
    }
    if (input.pendingHandoff.stage !== input.currentStage) {
      const transition = input.handoffStageTransition;
      if (transition?.ok && input.currentNextStages?.includes(input.pendingHandoff.stage)) {
        return { source: "handoff", command: "/next --execute" };
      }
      return {
        source: "handoff",
        blocker: `handoff ${input.pendingHandoff.id} waits for stage ${input.pendingHandoff.stage}: ${transition?.reasons.join("; ") || `current stage is ${input.currentStage}`}`
      };
    }
    return {
      source: "handoff",
      command: upgradeAutonomousCommand(input.pendingHandoff.nextCommand, readyAi),
      handoffId: input.pendingHandoff.id
    };
  }
  if (input.pendingActionCommand) {
    const command = upgradeAutonomousCommand(input.pendingActionCommand, readyAi);
    if (isAutonomousLocalCommand(command)) {
      return { source: "pending-action", command };
    }
  }
  if (input.canAdvance) {
    return { source: "stage-advance", command: "/next --execute" };
  }
  const command = upgradeAutonomousCommand(input.recommendedCommand ?? "/status", readyAi);
  if (isUserApprovalCommand(command)) {
    return { source: "stage-action", blocker: `user approval required: ${command}` };
  }
  if (needsAiForAutonomy(command) && !readyAi) {
    return { source: "stage-action", blocker: `AI provider required for autonomous step: ${command}. Run /setup auto --from-env --live first.` };
  }
  return { source: "stage-action", command };
}

export function upgradeAutonomousCommand(command: string, hasReadyAiProvider: boolean): string {
  if (!needsAiForAutonomy(command) || /\s--ai(?:\s|$)/.test(command) || !hasReadyAiProvider) {
    return command;
  }
  return `${command} --ai`;
}

export function needsAiForAutonomy(command: string): boolean {
  return /^\/pm draft\b/.test(command)
    || /^\/pd (?:references|directions|landing-preview|design-system|pages)\b/.test(command)
    || /^\/(?:fe|be) (?:spec|sprint-plan|api-contract)\b/.test(command);
}

export function isAutonomousLocalCommand(command: string): boolean {
  if (isUserApprovalCommand(command) || /\s--live(?:\s|$)/.test(command)) {
    return false;
  }
  try {
    const parsed = parseCli(parseCommandLine(command));
    switch (parsed.command) {
      case "setup":
      case "pm":
      case "pd":
      case "fe":
      case "be":
      case "qa":
      case "next":
      case "status":
      case "productize":
        return parsed.command !== "be" || parsed.subcommand !== "deploy-dev";
      case "agent":
        return parsed.subcommand === "reduce";
      case "docs":
        return ["list", "show", "diff"].includes(parsed.subcommand ?? "");
      default:
        return false;
    }
  } catch {
    return false;
  }
}

export function isUserApprovalCommand(command: string): boolean {
  return /^\/(?:docs approve|pm approve|pd approve|fe approve|be approve)\b/.test(command)
    || /^\/github release-approve\b/.test(command)
    || /^\/be deploy-dev\b/.test(command);
}
