import { AgentRole, AgentRoleContract, HandoffPacket } from "./types";

export const AGENT_ROLE_CONTRACTS: Record<AgentRole, AgentRoleContract> = {
  Orchestrator: {
    role: "Orchestrator",
    purpose: "Own session continuity, stage routing, approval gates, and safe command selection.",
    allowedCommandPrefixes: ["/status", "/next", "/agent", "/setup", "/doctor", "/help"],
    requiredContext: ["current stage", "pending action", "handoff queue", "blocking approvals", "provider readiness"],
    successCriteria: [
      "Next action is explicit and stage-valid.",
      "Approval or external-write gates are never bypassed.",
      "Runtime checkpoint explains why execution continued or stopped."
    ],
    handoffChecklist: ["target role", "target stage", "next command", "artifact refs", "blockers"]
  },
  PM: {
    role: "PM",
    purpose: "Turn product intent into approved product definition, requirements, screen definition, and feature definition.",
    allowedCommandPrefixes: ["/pm", "/docs", "/status", "/next", "/agent"],
    requiredContext: ["product idea", "approved PM documents", "open PM review blockers", "competitor/differentiation notes"],
    successCriteria: [
      "PM artifact is grounded in the user's product intent.",
      "Review and approval state is visible before handoff.",
      "Downstream PD/FE/BE can cite approved PM artifacts."
    ],
    handoffChecklist: ["approved PM docs", "requirements scope", "screen list", "feature constraints"]
  },
  PD: {
    role: "PD",
    purpose: "Convert approved PM scope into references, directions, landing preview, design system, and page designs.",
    allowedCommandPrefixes: ["/pd", "/docs", "/status", "/next", "/agent"],
    requiredContext: ["approved PM docs", "design artifact index", "selected design direction", "page-design blockers"],
    successCriteria: [
      "Design artifacts match the approved product scope.",
      "Visual direction is explicit enough for FE implementation.",
      "PD approval gate is reached before FE/BE execution."
    ],
    handoffChecklist: ["approved design artifacts", "page list", "design constraints", "implementation notes"]
  },
  FE: {
    role: "FE",
    purpose: "Produce FE technical spec, sprint plan, issues, work records, and PR drafts from approved PM/PD artifacts.",
    allowedCommandPrefixes: ["/fe", "/docs", "/github", "/qa", "/status", "/next", "/agent"],
    requiredContext: ["approved requirements", "approved screen definition", "approved page designs", "API contract assumptions"],
    successCriteria: [
      "FE spec maps screens and interactions to implementation tasks.",
      "Sprint plan and issues are traceable to approved docs.",
      "PR draft remains local until explicit external approval."
    ],
    handoffChecklist: ["FE spec", "FE sprint plan", "issue refs", "PR draft refs", "QA concerns"]
  },
  BE: {
    role: "BE",
    purpose: "Produce BE technical spec, API contract, sprint plan, deployment plan, issues, and PR drafts.",
    allowedCommandPrefixes: ["/be", "/docs", "/github", "/qa", "/status", "/next", "/agent"],
    requiredContext: ["approved requirements", "approved feature definition", "FE integration needs", "deployment constraints"],
    successCriteria: [
      "BE spec and API contract are implementation-ready.",
      "Sprint plan and issues are traceable to approved docs.",
      "Deployment stays local/planned until explicit approval."
    ],
    handoffChecklist: ["BE spec", "API contract", "BE sprint plan", "deployment blockers", "QA concerns"]
  },
  QA: {
    role: "QA",
    purpose: "Verify PRs, conflicts, tests, security, accessibility, release readiness, and residual risk.",
    allowedCommandPrefixes: ["/qa", "/github", "/status", "/next", "/agent"],
    requiredContext: ["PR drafts", "linked issues", "test output", "security evidence", "accessibility evidence"],
    successCriteria: [
      "QA report records test, conflict, security, and accessibility evidence.",
      "Release gate stays blocked until evidence is explicit.",
      "Residual risks are visible before release approval."
    ],
    handoffChecklist: ["QA report", "test evidence", "security/accessibility findings", "release blocker list"]
  }
};

export function agentRoleContract(role: AgentRole): AgentRoleContract {
  return AGENT_ROLE_CONTRACTS[role];
}

export interface HandoffContractValidation {
  ok: boolean;
  reasons: string[];
}

export function validateHandoffContract(packet: Pick<HandoffPacket, "toAgent" | "nextCommand" | "roleContract">): HandoffContractValidation {
  const expected = agentRoleContract(packet.toAgent);
  const reasons: string[] = [];
  if (packet.roleContract && packet.roleContract.role !== packet.toAgent) {
    reasons.push(`roleContract.role=${packet.roleContract.role} does not match toAgent=${packet.toAgent}`);
  }
  if (packet.nextCommand && !expected.allowedCommandPrefixes.some((prefix) => commandMatchesPrefix(packet.nextCommand ?? "", prefix))) {
    reasons.push(`nextCommand ${packet.nextCommand} is not allowed for ${packet.toAgent}; allowed prefixes: ${expected.allowedCommandPrefixes.join(", ")}`);
  }
  return {
    ok: reasons.length === 0,
    reasons
  };
}

export function renderAgentRoleContractCatalog(): string {
  return Object.values(AGENT_ROLE_CONTRACTS)
    .map((contract) => [
      `${contract.role}: ${contract.purpose}`,
      `  allowed: ${contract.allowedCommandPrefixes.join(", ")}`,
      `  context: ${contract.requiredContext.join("; ")}`,
      `  success: ${contract.successCriteria.join("; ")}`
    ].join("\n"))
    .join("\n");
}

function commandMatchesPrefix(command: string, prefix: string): boolean {
  return command === prefix || command.startsWith(`${prefix} `);
}
