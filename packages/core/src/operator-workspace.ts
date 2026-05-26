import fs from "node:fs";
import { loadRuntimeActionApprovals } from "./agent-action-approvals";
import { isUserApprovalCommand } from "./agent-orchestrator";
import { loadRuntimeHandoffs, loadRuntimeSession } from "./agent-runtime";
import { assembleAgentContext } from "./context-assembler";
import { projectFile, stateFile } from "./paths";
import { loadProject, loadState } from "./project";
import { readProofLedgerLatest } from "./proof-ledger";
import {
  configuredAiProviders,
  configuredMcpServers,
  createHarnessConfig,
  readConnectionReport,
  readConnectionReportTrust,
  readHarnessConfigSnapshot,
  readTrustedConnectionChecks
} from "./settings";
import {
  AgentContextArtifact,
  AgentRole,
  ConnectionCheck,
  DocumentStatus,
  PullRequestRecord,
  QAReportRecord,
  RuntimeActionApprovalRecord,
  RuntimeSessionManifest,
  RuntimeSessionStage,
  WorkIssue,
  WorkflowStageId
} from "./types";
import { commandForWorkflowStage, nextStage, workflowAdvanceStatus, WORKFLOW_STAGES } from "./workflow";

export interface OperatorWorkspaceAction {
  kind: "setup" | "approval" | "runtime" | "workflow" | "readiness" | "none";
  command: string;
  safeToAutoRun: boolean;
  reason: string;
  blockedBy: string[];
}

export interface OperatorWorkspaceArtifact {
  id: string;
  title: string;
  status: DocumentStatus;
  currentVersion: string | null;
  approvedVersion: string | null;
}

export interface OperatorWorkspaceSnapshot {
  schemaVersion: "rph-operator-workspace-v0";
  generatedAt: string;
  initialized: boolean;
  project: {
    name: string | null;
    rootPath: string;
  };
  runtime: {
    status: RuntimeSessionManifest["status"];
    sessionId: string;
    stage: RuntimeSessionStage;
    ownerAgent: AgentRole;
    checkpoint: string | null;
    blocker: string | null;
    pendingActionCommand: string | null;
    pendingExternalActionId: string | null;
    waitConditionKind: string | null;
  } | null;
  workflow: {
    currentStage: RuntimeSessionStage;
    currentStageName: string;
    ownerAgent: AgentRole;
    paused: boolean;
    nextStage: WorkflowStageId | null;
    nextCommand: string | null;
    canAdvance: boolean;
    reasons: string[];
  };
  readiness: {
    status: "ready" | "configured" | "needs-setup" | "degraded" | "blocked";
    chat: "verified" | "configured" | "missing";
    tools: "none" | "configured" | "verified";
    activeProvider: string;
    configuredProviders: string[];
    configuredServers: string[];
    liveVerification: "current" | "not-current";
    connectionProofReason: string | null;
    degradedChecks: string[];
    lastKnownPassedChecks: string[];
  };
  approvals: {
    pendingDocuments: string[];
    pendingDesignArtifacts: string[];
    externalActions: OperatorWorkspaceExternalAction[];
  };
  artifacts: {
    documents: OperatorWorkspaceArtifact[];
    designArtifacts: OperatorWorkspaceArtifact[];
    counts: {
      documents: Record<DocumentStatus, number>;
      designArtifacts: Record<DocumentStatus, number>;
    };
  };
  issues: OperatorWorkspaceIssue[];
  pullRequests: OperatorWorkspacePullRequest[];
  qaReports: OperatorWorkspaceQaReport[];
  proofs: {
    events: number;
    counts: Record<string, number>;
    latestFailures: string[];
  };
  blockers: string[];
  nextAction: OperatorWorkspaceAction;
}

export interface OperatorWorkspaceExternalAction {
  id: string;
  status: RuntimeActionApprovalRecord["status"];
  target: RuntimeActionApprovalRecord["target"];
  action: string;
  command: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface OperatorWorkspaceIssue {
  issueNumber: number;
  status: WorkIssue["status"];
  assigneeAgent: WorkIssue["assigneeAgent"];
  title: string;
  branchName: string;
}

export interface OperatorWorkspacePullRequest {
  prNumber: number;
  issueNumber: number;
  status: PullRequestRecord["status"];
  qaStatus: PullRequestRecord["qaStatus"];
  qaReportStatus: QAReportRecord["status"] | null;
  testStatus: PullRequestRecord["testStatus"];
  conflictStatus: PullRequestRecord["conflictStatus"];
  userApproval: PullRequestRecord["userApproval"];
  blockerReasons: string[];
}

export interface OperatorWorkspaceQaReport {
  prNumber: number;
  status: QAReportRecord["status"];
  conflictStatus: QAReportRecord["conflictStatus"];
  testStatus: QAReportRecord["testStatus"];
  requirementStatus: QAReportRecord["requirementStatus"];
  designStatus: QAReportRecord["designStatus"];
  apiContractStatus: QAReportRecord["apiContractStatus"];
  securityStatus: QAReportRecord["securityStatus"];
  accessibilityStatus: QAReportRecord["accessibilityStatus"];
  blockerFindings: string[];
}

export interface BuildOperatorWorkspaceOptions {
  now?: Date;
  env?: NodeJS.ProcessEnv;
}

export interface RenderOperatorWorkspaceOptions {
  commandSurface?: "rph" | "slash";
}

export function buildOperatorWorkspace(
  projectRoot: string,
  options: BuildOperatorWorkspaceOptions = {}
): OperatorWorkspaceSnapshot {
  const generatedAt = (options.now ?? new Date()).toISOString();
  if (!isOperatorWorkspaceInitialized(projectRoot)) {
    const config = createHarnessConfig(options.env ?? process.env);
    const configuredProviders = configuredAiProviders(config).map((provider) => provider.id);
    const configuredServers = configuredMcpServers(config).map((server) => server.id);
    const nextAction: OperatorWorkspaceAction = {
      kind: "setup",
      command: "/setup auto --live",
      safeToAutoRun: true,
      reason: "project is not initialized",
      blockedBy: []
    };
    return {
      schemaVersion: "rph-operator-workspace-v0",
      generatedAt,
      initialized: false,
      project: {
        name: null,
        rootPath: projectRoot
      },
      runtime: null,
      workflow: {
        currentStage: "UNINITIALIZED",
        currentStageName: "Uninitialized",
        ownerAgent: "Orchestrator",
        paused: false,
        nextStage: null,
        nextCommand: "/setup auto --live",
        canAdvance: false,
        reasons: []
      },
      readiness: {
        status: configuredProviders.length > 0 ? "configured" : "needs-setup",
        chat: configuredProviders.length > 0 ? "configured" : "missing",
        tools: configuredServers.length > 0 ? "configured" : "none",
        activeProvider: config.activeAiProvider,
        configuredProviders,
        configuredServers,
        liveVerification: "not-current",
        connectionProofReason: "missing-report",
        degradedChecks: [],
        lastKnownPassedChecks: []
      },
      approvals: {
        pendingDocuments: [],
        pendingDesignArtifacts: [],
        externalActions: []
      },
      artifacts: {
        documents: [],
        designArtifacts: [],
        counts: {
          documents: emptyStatusCounts(),
          designArtifacts: emptyStatusCounts()
        }
      },
      issues: [],
      pullRequests: [],
      qaReports: [],
      proofs: {
        events: 0,
        counts: {},
        latestFailures: []
      },
      blockers: [],
      nextAction
    };
  }

  const project = loadProject(projectRoot);
  const state = loadState(projectRoot);
  const stage = WORKFLOW_STAGES[state.currentStage];
  const session = loadRuntimeSession(projectRoot);
  const advance = workflowAdvanceStatus(state);
  const context = assembleAgentContext(projectRoot, { includeBodies: false });
  const config = readHarnessConfigSnapshot(projectRoot);
  const trustedChecks = readTrustedConnectionChecks(projectRoot);
  const trust = readConnectionReportTrust(projectRoot);
  const report = readConnectionReport(projectRoot);
  const passedAi = trustedChecks.filter((check) => check.kind === "ai" && check.status === "passed");
  const passedMcp = trustedChecks.filter((check) => check.kind === "mcp" && check.status === "passed");
  const failedChecks = uniqueConnectionChecks([
    ...trustedChecks.filter((check) => check.status === "failed"),
    ...(report?.checks ?? []).filter((check) => check.status === "failed")
  ]);
  const configuredProviders = configuredAiProviders(config).map((provider) => provider.id);
  const configuredServers = configuredMcpServers(config).map((server) => server.id);
  const externalActions = loadRuntimeActionApprovals(projectRoot)
    .filter((action) => ["pending", "approved", "running", "failed"].includes(action.status))
    .slice(-20)
    .map(summarizeExternalAction);
  const pendingDocs = pendingDocumentApprovals(state.currentStage, advance.nextStage, state.documents);
  const pendingDesignArtifacts = pendingDesignApprovals(state.currentStage, advance.nextStage, state.designArtifacts ?? {});
  const qaReports = context.qaReports.map(summarizeQaReport);
  const qaReportByPr = new Map(context.qaReports.map((report) => [report.prNumber, report]));
  const pullRequests = context.pullRequests.map((pr) => summarizePullRequest(pr, qaReportByPr.get(pr.prNumber)));
  const proofLatest = readProofLedgerLatest(projectRoot);
  const readinessStatus = readinessStatusFor({
    paused: state.paused,
    chatConfigured: configuredProviders.length > 0 && config.activeAiProvider !== "none",
    passedAiCount: passedAi.length,
    failedCount: failedChecks.length
  });
  const readinessBlockers = readinessBlockersFor({
    trustReason: trust.trusted ? null : trust.reason ?? "missing-report",
    failedChecks,
    reportChecks: report?.checks ?? []
  });
  const workflowCommand = actionCommandForWorkflow(state.currentStage, advance.nextStage, advance.canAdvance);
  const blockers = uniqueStrings([
    ...(session?.blocker ? [sanitizeOperatorText(session.blocker)] : []),
    ...(session?.waitCondition ? [`runtime wait: ${session.waitCondition.kind}`] : []),
    ...readinessBlockers,
    ...advance.reasons,
    ...externalActions.filter((action) => action.status === "pending").map((action) => `external action pending: ${action.id}`),
    ...pullRequests.flatMap((pr) => pr.blockerReasons.map((reason) => `PR #${pr.prNumber}: ${reason}`)),
    ...qaReports.flatMap((report) => report.blockerFindings.map((finding) => `PR #${report.prNumber}: ${finding}`))
  ]).slice(0, 20);
  const nextAction = chooseNextAction({
    initialized: true,
    session,
    statePaused: state.paused,
    workflowCommand,
    advanceReasons: advance.reasons,
    readinessStatus,
    readinessLiveVerification: trust.trusted ? "current" : "not-current",
    chatConfigured: configuredProviders.length > 0 && config.activeAiProvider !== "none",
    trustedAi: passedAi.length > 0,
    externalActions,
    readinessBlockers,
    blockers
  });

  return {
    schemaVersion: "rph-operator-workspace-v0",
    generatedAt,
    initialized: true,
    project: {
      name: project.name,
      rootPath: project.rootPath
    },
    runtime: session
      ? {
          status: session.status,
          sessionId: session.sessionId,
          stage: session.stage,
          ownerAgent: session.ownerAgent,
          checkpoint: session.checkpoint,
          blocker: session.blocker ? sanitizeOperatorText(session.blocker) : null,
          pendingActionCommand: session.pendingAction?.command ?? null,
          pendingExternalActionId: session.pendingExternalActionId ?? null,
          waitConditionKind: session.waitCondition?.kind ?? null
        }
      : null,
    workflow: {
      currentStage: state.currentStage,
      currentStageName: stage.name,
      ownerAgent: stage.ownerAgent,
      paused: state.paused,
      nextStage: advance.nextStage,
      nextCommand: workflowCommand,
      canAdvance: advance.canAdvance,
      reasons: advance.reasons
    },
    readiness: {
      status: readinessStatus,
      chat: passedAi.length > 0 ? "verified" : configuredProviders.length > 0 && config.activeAiProvider !== "none" ? "configured" : "missing",
      tools: passedMcp.length > 0 ? "verified" : configuredServers.length > 0 ? "configured" : "none",
      activeProvider: config.activeAiProvider,
      configuredProviders,
      configuredServers,
      liveVerification: trust.trusted ? "current" : "not-current",
      connectionProofReason: trust.trusted ? null : trust.reason ?? "missing-report",
      degradedChecks: failedChecks.map(formatConnectionCheckId),
      lastKnownPassedChecks: trust.trusted ? [] : (report?.checks ?? []).filter((check) => check.status === "passed").map(formatConnectionCheckId)
    },
    approvals: {
      pendingDocuments: pendingDocs,
      pendingDesignArtifacts,
      externalActions
    },
    artifacts: {
      documents: context.documents.map(summarizeArtifact),
      designArtifacts: context.designArtifacts.map(summarizeArtifact),
      counts: {
        documents: statusCounts(context.documents),
        designArtifacts: statusCounts(context.designArtifacts)
      }
    },
    issues: context.issues.map((issue) => ({
      issueNumber: issue.issueNumber,
      status: issue.status,
      assigneeAgent: issue.assigneeAgent,
      title: issue.title,
      branchName: issue.branchName
    })),
    pullRequests,
    qaReports,
    proofs: {
      events: proofLatest?.eventCount ?? 0,
      counts: proofLatest?.counts ?? {},
      latestFailures: proofLatest?.latestFailures.slice(0, 5).map((event) => sanitizeOperatorText(`${event.subject}: ${event.summary}`)) ?? []
    },
    blockers,
    nextAction
  };
}

export function renderOperatorWorkspace(
  snapshot: OperatorWorkspaceSnapshot,
  options: RenderOperatorWorkspaceOptions = {}
): string {
  const nextCommand = renderOperatorCommand(snapshot.nextAction.command, options.commandSurface ?? "slash");
  const lines = [
    "Operator workspace",
    `- project: ${snapshot.project.name ?? "not initialized"}`,
    `- root: ${snapshot.project.rootPath}`,
    `- runtime: ${snapshot.runtime ? `${snapshot.runtime.status} session=${snapshot.runtime.sessionId}` : "none"}`,
    `- stage: ${snapshot.workflow.currentStage} (${snapshot.workflow.currentStageName}) owner=${snapshot.workflow.ownerAgent}`,
    `- readiness: ${snapshot.readiness.status} chat=${snapshot.readiness.chat} tools=${snapshot.readiness.tools} live=${snapshot.readiness.liveVerification}`,
    `- artifacts: docs=${snapshot.artifacts.documents.length} approved=${snapshot.artifacts.counts.documents.approved} design=${snapshot.artifacts.designArtifacts.length} approved=${snapshot.artifacts.counts.designArtifacts.approved}`,
    `- work: issues=${snapshot.issues.length} prs=${snapshot.pullRequests.length} qa=${snapshot.qaReports.length}`,
    `- next action: ${nextCommand} (${snapshot.nextAction.safeToAutoRun ? "safe" : "manual"}; ${snapshot.nextAction.reason})`
  ];
  if (snapshot.nextAction.blockedBy.length > 0) {
    lines.push(`- why now: ${snapshot.nextAction.blockedBy.slice(0, 3).join("; ")}`);
  }
  if (snapshot.blockers.length > 0) {
    lines.push("", "Blockers:");
    lines.push(...snapshot.blockers.slice(0, 8).map((blocker) => `- ${blocker}`));
  }
  if (snapshot.approvals.externalActions.some((action) => action.status === "pending")) {
    lines.push("", "External actions:");
    for (const action of snapshot.approvals.externalActions.filter((item) => item.status === "pending").slice(0, 5)) {
      lines.push(`- ${action.id} ${action.target}:${action.action} ${action.command}`);
    }
  }
  if (snapshot.artifacts.documents.length > 0) {
    lines.push("", "Documents:");
    for (const doc of snapshot.artifacts.documents.slice(0, 8)) {
      lines.push(`- ${doc.id} ${doc.status} current=${doc.currentVersion ?? "none"} approved=${doc.approvedVersion ?? "none"}`);
    }
  }
  if (snapshot.pullRequests.length > 0) {
    lines.push("", "PR/QA:");
    for (const pr of snapshot.pullRequests.slice(0, 8)) {
      const blockers = pr.blockerReasons.length > 0 ? ` blockers=${pr.blockerReasons.join("; ")}` : "";
      lines.push(`- PR #${pr.prNumber} issue #${pr.issueNumber} ${pr.status} qa=${pr.qaStatus} tests=${pr.testStatus}${blockers}`);
    }
  }
  return lines.join("\n");
}

function isOperatorWorkspaceInitialized(projectRoot: string): boolean {
  return fs.existsSync(projectFile(projectRoot)) && fs.existsSync(stateFile(projectRoot));
}

function summarizeArtifact(artifact: AgentContextArtifact): OperatorWorkspaceArtifact {
  return {
    id: artifact.id,
    title: artifact.title,
    status: artifact.status,
    currentVersion: artifact.currentVersion,
    approvedVersion: artifact.approvedVersion
  };
}

function summarizeExternalAction(action: RuntimeActionApprovalRecord): OperatorWorkspaceExternalAction {
  return {
    id: action.id,
    status: action.status,
    target: action.target,
    action: action.action,
    command: action.normalizedCommand,
    description: action.description,
    createdAt: action.createdAt,
    updatedAt: action.updatedAt
  };
}

function summarizePullRequest(pr: PullRequestRecord, qaReport?: QAReportRecord): OperatorWorkspacePullRequest {
  const qaBlocker = qaReport?.status === "approved"
    ? null
    : qaReport?.status
      ? `qa report ${qaReport.status}`
      : pr.qaStatus !== "approved"
        ? `qa ${pr.qaStatus}`
        : null;
  const blockerReasons = [
    pr.status === "draft" ? "draft PR" : null,
    qaBlocker,
    pr.testStatus === "failed" ? "tests failed" : pr.testStatus === "not-run" ? "tests not run" : null,
    pr.conflictStatus === "conflict" ? "merge conflict" : pr.conflictStatus === "unknown" ? "conflict status unknown" : null,
    pr.userApproval === "required" ? "user approval required" : pr.userApproval === "rejected" ? "user approval rejected" : null
  ].filter((item): item is string => Boolean(item));
  return {
    prNumber: pr.prNumber,
    issueNumber: pr.issueNumber,
    status: pr.status,
    qaStatus: pr.qaStatus,
    qaReportStatus: qaReport?.status ?? null,
    testStatus: pr.testStatus,
    conflictStatus: pr.conflictStatus,
    userApproval: pr.userApproval,
    blockerReasons
  };
}

function summarizeQaReport(report: QAReportRecord): OperatorWorkspaceQaReport {
  return {
    prNumber: report.prNumber,
    status: report.status,
    conflictStatus: report.conflictStatus,
    testStatus: report.testStatus,
    requirementStatus: report.requirementStatus,
    designStatus: report.designStatus,
    apiContractStatus: report.apiContractStatus,
    securityStatus: report.securityStatus,
    accessibilityStatus: report.accessibilityStatus,
    blockerFindings: qaBlockerFindings(report)
  };
}

function qaBlockerFindings(report: QAReportRecord): string[] {
  if (report.status === "approved"
    && report.securityStatus === "clear"
    && report.accessibilityStatus === "clear"
    && report.conflictStatus !== "conflict"
    && report.testStatus !== "failed"
    && report.requirementStatus !== "gap"
    && report.designStatus !== "gap"
    && report.apiContractStatus !== "gap") {
    return [];
  }
  const synthetic = [
    report.status !== "approved" ? `qa status ${report.status}` : null,
    report.conflictStatus === "conflict" ? "merge conflict" : null,
    report.testStatus === "failed" ? "tests failed" : null,
    report.requirementStatus === "gap" ? "requirement gap" : null,
    report.designStatus === "gap" ? "design gap" : null,
    report.apiContractStatus === "gap" ? "api contract gap" : null,
    report.securityStatus === "unknown" ? "security status unknown" : report.securityStatus === "risk" ? "security risk" : null,
    report.accessibilityStatus === "unknown" ? "accessibility status unknown" : report.accessibilityStatus === "risk" ? "accessibility risk" : null
  ].filter((item): item is string => Boolean(item));
  const findingBlockers = report.findings.filter((finding) =>
    /block|risk|unknown|failed|gap|changes/i.test(finding)
  );
  return uniqueStrings([...findingBlockers, ...synthetic]).slice(0, 8);
}

function readinessStatusFor(input: {
  paused: boolean;
  chatConfigured: boolean;
  passedAiCount: number;
  failedCount: number;
}): OperatorWorkspaceSnapshot["readiness"]["status"] {
  if (input.paused) {
    return "blocked";
  }
  if (!input.chatConfigured) {
    return "needs-setup";
  }
  if (input.failedCount > 0) {
    return "degraded";
  }
  if (input.passedAiCount > 0) {
    return "ready";
  }
  return "configured";
}

function actionCommandForWorkflow(
  currentStage: WorkflowStageId,
  next: WorkflowStageId | null,
  canAdvance: boolean
): string | null {
  if (!canAdvance) {
    return commandForWorkflowStage(currentStage) ?? (next ? commandForWorkflowStage(next) ?? null : null);
  }
  return next ? commandForWorkflowStage(next) ?? null : commandForWorkflowStage(currentStage) ?? null;
}

function chooseNextAction(input: {
  initialized: boolean;
  session: RuntimeSessionManifest | null;
  statePaused: boolean;
  workflowCommand: string | null;
  advanceReasons: string[];
  readinessStatus: OperatorWorkspaceSnapshot["readiness"]["status"];
  readinessLiveVerification: OperatorWorkspaceSnapshot["readiness"]["liveVerification"];
  chatConfigured: boolean;
  trustedAi: boolean;
  externalActions: OperatorWorkspaceExternalAction[];
  readinessBlockers: string[];
  blockers: string[];
}): OperatorWorkspaceAction {
  if (!input.initialized) {
    return {
      kind: "setup",
      command: "/setup auto --live",
      safeToAutoRun: true,
      reason: "project is not initialized",
      blockedBy: []
    };
  }

  const sessionPending = input.session?.pendingExternalActionId
    ? input.externalActions.find((action) => action.id === input.session?.pendingExternalActionId)
    : undefined;
  const pendingExternalAction = sessionPending ?? input.externalActions.find((action) => action.status === "pending");
  if (pendingExternalAction) {
    return {
      kind: "approval",
      command: `/agent approve-action ${pendingExternalAction.id}`,
      safeToAutoRun: false,
      reason: "external live write requires explicit approval",
      blockedBy: [`external action pending: ${pendingExternalAction.id}`]
    };
  }

  if (input.statePaused || input.session?.status === "paused") {
    return {
      kind: "runtime",
      command: "/resume",
      safeToAutoRun: true,
      reason: "runtime is paused",
      blockedBy: input.blockers
    };
  }

  if (!input.chatConfigured) {
    return {
      kind: "setup",
      command: "/setup auto --live",
      safeToAutoRun: true,
      reason: "AI agent is not connected",
      blockedBy: input.blockers
    };
  }

  if (!input.trustedAi && (input.readinessStatus === "configured" || input.readinessStatus === "degraded")) {
    const reason = input.readinessLiveVerification === "current"
      ? "live AI/MCP verification has failed checks"
      : "live AI/MCP verification is not current";
    return {
      kind: "readiness",
      command: "/doctor --live",
      safeToAutoRun: true,
      reason,
      blockedBy: uniqueStrings([...input.readinessBlockers, ...input.blockers])
    };
  }

  if (input.session?.status === "blocked" && input.session.blocker) {
    return {
      kind: "runtime",
      command: "/agent recover --steps 1",
      safeToAutoRun: true,
      reason: "runtime session is blocked",
      blockedBy: input.blockers
    };
  }

  if (input.workflowCommand) {
    return {
      kind: "workflow",
      command: input.workflowCommand,
      safeToAutoRun: !isUserApprovalCommand(input.workflowCommand),
      reason: input.advanceReasons.length > 0 ? input.advanceReasons[0] : "next workflow command",
      blockedBy: input.advanceReasons
    };
  }

  return {
    kind: "none",
    command: "/status",
    safeToAutoRun: true,
    reason: "no workflow action is available",
    blockedBy: input.blockers
  };
}

function pendingDocumentApprovals(
  currentStage: WorkflowStageId,
  next: WorkflowStageId | null,
  documents: Record<string, { status?: string } | undefined>
): string[] {
  const stages = [WORKFLOW_STAGES[currentStage], ...(next ? [WORKFLOW_STAGES[next]] : [])];
  return uniqueStrings(stages.flatMap((stage) => stage.requiredApprovals))
    .filter((docId) => documents[docId]?.status !== "approved");
}

function pendingDesignApprovals(
  currentStage: WorkflowStageId,
  next: WorkflowStageId | null,
  designArtifacts: Record<string, { status?: string } | undefined>
): string[] {
  const stages = [WORKFLOW_STAGES[currentStage], ...(next ? [WORKFLOW_STAGES[next]] : [])];
  return uniqueStrings(stages.flatMap((stage) => stage.requiredDesignApprovals))
    .filter((artifactId) => designArtifacts[artifactId]?.status !== "approved");
}

function emptyStatusCounts(): Record<DocumentStatus, number> {
  return {
    draft: 0,
    review: 0,
    revised: 0,
    approved: 0
  };
}

function statusCounts(artifacts: AgentContextArtifact[]): Record<DocumentStatus, number> {
  const counts = emptyStatusCounts();
  for (const artifact of artifacts) {
    counts[artifact.status] += 1;
  }
  return counts;
}

function formatConnectionCheckId(check: ConnectionCheck): string {
  return `${check.kind}:${check.id}`;
}

function uniqueConnectionChecks(checks: ConnectionCheck[]): ConnectionCheck[] {
  const seen = new Set<string>();
  const unique = [];
  for (const check of checks) {
    const key = formatConnectionCheckId(check);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(check);
    }
  }
  return unique;
}

function readinessBlockersFor(input: {
  trustReason: string | null;
  failedChecks: ConnectionCheck[];
  reportChecks: ConnectionCheck[];
}): string[] {
  const blockers = [];
  if (input.trustReason) {
    blockers.push(`live verification not current: ${input.trustReason}`);
  }
  for (const check of input.failedChecks) {
    blockers.push(`connection failed: ${formatConnectionCheckId(check)}`);
  }
  if (input.trustReason && input.reportChecks.some((check) => check.status === "passed")) {
    const passed = input.reportChecks
      .filter((check) => check.status === "passed")
      .map(formatConnectionCheckId)
      .slice(0, 5);
    blockers.push(`last-known passed check is not current: ${passed.join(", ")}`);
  }
  return uniqueStrings(blockers);
}

function renderOperatorCommand(command: string, surface: "rph" | "slash"): string {
  if (surface === "slash") {
    return command.startsWith("/") ? command : `/${command}`;
  }
  return `rph ${command.replace(/^\//, "")}`;
}

function sanitizeOperatorText(text: string): string {
  return text
    .replace(/(Incorrect API key provided:\s*)([^.\n]+)(\.)?/gi, "$1<redacted>$3")
    .replace(/(Bearer\s+)[^\s;,)]+/gi, "$1<redacted>")
    .replace(/([?&](?:key|token|api_key|access_token)=)[^&\s]+/gi, "$1<redacted>")
    .replace(/\b((?:api[_-]?key|token|secret|authorization)\s*[:=]\s*)(["']?)[^"'\s;,)]+/gi, "$1$2<redacted>$2")
    .replace(/\b(?:sk|rk|ghp|gho|ghu|ghs|ghr|github_pat|xoxb|xoxp|xoxa|xoxr|AIza)[A-Za-z0-9_-]{8,}\b/g, "<redacted>");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
