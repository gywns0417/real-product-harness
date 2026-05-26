import fs from "node:fs";
import path from "node:path";
import { approvalsFile, designApprovalsFile, qaDir } from "./paths";
import { loadProject, loadState, requireInitialized } from "./project";
import { readHarnessConfigSnapshot, readTrustedConnectionChecks } from "./settings";
import { nextStage, WORKFLOW_STAGES } from "./workflow";
import { DESIGN_ARTIFACT_TITLES, listDesignArtifactIndexes, readDesignArtifactIndex, showDesignArtifact } from "./design";
import { DOCUMENT_TITLES, listDocumentIndexes, readDocumentIndex, showDocument, stripFrontmatter } from "./documents";
import { listPullRequests, listWorkIssues } from "./issues";
import { listFiles, readJson, readJsonIfExists } from "./fs";
import { readProofLedgerLatest } from "./proof-ledger";
import {
  AgentConfigSummary,
  AgentConnectionProofSummary,
  AgentContextArtifact,
  AgentContextBundle,
  AgentProofSummary,
  Approval,
  DesignApproval,
  DocumentIndex,
  DesignArtifactIndex,
  HarnessConfig,
  ConnectionCheck,
  McpServerId,
  QAReportRecord
} from "./types";

type AgentConnectionCheck = ConnectionCheck & (
  | { kind: "ai" }
  | { kind: "mcp"; id: string }
);

export interface AssembleAgentContextOptions {
  includeBodies?: boolean;
  maxBodyChars?: number;
}

export function assembleAgentContext(
  projectRoot: string,
  options: AssembleAgentContextOptions = {}
): AgentContextBundle {
  requireInitialized(projectRoot);
  const includeBodies = options.includeBodies ?? true;
  const maxBodyChars = options.maxBodyChars ?? 5000;
  const project = loadProject(projectRoot);
  const state = loadState(projectRoot);
  const config = readHarnessConfigSnapshot(projectRoot);
  const stage = WORKFLOW_STAGES[state.currentStage];
  const approvals = readJsonIfExists<Approval[]>(approvalsFile(projectRoot), []);
  const designApprovals = readJsonIfExists<DesignApproval[]>(designApprovalsFile(projectRoot), []);
  const documents = listDocumentIndexes(projectRoot).map((index) =>
    createDocumentArtifact(projectRoot, index, includeBodies, maxBodyChars)
  );
  const designArtifacts = listDesignArtifactIndexes(projectRoot).map((index) =>
    createDesignArtifact(projectRoot, index, includeBodies, maxBodyChars)
  );
  const bundle: AgentContextBundle = {
    project: {
      id: project.id,
      name: project.name,
      rootPath: project.rootPath
    },
    workflow: {
      currentStage: state.currentStage,
      currentStageName: stage.name,
      ownerAgent: stage.ownerAgent,
      paused: state.paused,
      nextStage: nextStage(state)
    },
    ai: {
      activeProvider: config.activeAiProvider,
      configuredProviders: Object.values(config.aiProviders)
        .filter((provider) => provider.configured)
        .map((provider) => provider.id)
    },
    mcp: {
      configuredServers: Object.values(config.mcpServers)
        .filter((server) => server.enabled && server.configured)
        .map((server) => server.id)
    },
    connectionProofs: readLatestConnectionProofs(projectRoot),
    recentProofs: readRecentProofLedgerSummaries(projectRoot),
    documents,
    designArtifacts,
    approvals,
    designApprovals,
    issues: safeList(() => listWorkIssues(projectRoot)).slice(0, 30),
    pullRequests: safeList(() => listPullRequests(projectRoot)).slice(0, 30),
    qaReports: readQaReports(projectRoot),
    configSummary: summarizeConfig(config),
    prompt: "",
    files: existingRuntimeFiles(projectRoot),
    assembledAt: new Date().toISOString()
  };
  bundle.prompt = renderAgentContextBundle(bundle);
  return bundle;
}

export function renderAgentContextBundle(bundle: AgentContextBundle): string {
  return [
    "Runtime project context bundle:",
    `- project: ${bundle.project.name}`,
    `- root: ${bundle.project.rootPath}`,
    `- stage: ${bundle.workflow.currentStage} (${bundle.workflow.currentStageName})`,
    `- owner_agent: ${bundle.workflow.ownerAgent}`,
    `- paused: ${bundle.workflow.paused}`,
    `- next_stage: ${bundle.workflow.nextStage ?? "none"}`,
    "",
    "Config summary:",
    `- active_ai: ${bundle.configSummary.activeProvider}`,
    `- configured_ai: ${bundle.configSummary.configuredProviders.join(", ") || "none"}`,
    `- configured_mcp: ${bundle.configSummary.configuredServers.join(", ") || "none"}`,
    `- deployment: ${bundle.configSummary.deployment}`,
    `- stack: ${bundle.configSummary.stack}`,
    `- ui: theme=${bundle.configSummary.uiTheme} color=${bundle.configSummary.uiColor} boot_animation=${bundle.configSummary.bootAnimation}`,
    `- custom_keys: ${bundle.configSummary.customKeys.join(", ") || "none"}`,
    "",
    "Live connection proofs:",
    ...(bundle.connectionProofs.length > 0
      ? bundle.connectionProofs.map(renderConnectionProof)
      : ["- none"]),
    "",
    "Recent proof ledger:",
    ...(bundle.recentProofs.length > 0
      ? bundle.recentProofs.map(renderRecentProof)
      : ["- none"]),
    "",
    "Documents:",
    ...renderArtifacts(bundle.documents),
    "",
    "Design artifacts:",
    ...renderArtifacts(bundle.designArtifacts),
    "",
    "Approvals:",
    `- documents: ${bundle.approvals.length}`,
    ...bundle.approvals.slice(-10).map((approval) => `- ${approval.docId} ${approval.version} by ${approval.approvedBy}`),
    `- design: ${bundle.designApprovals.length}`,
    ...bundle.designApprovals.slice(-10).map((approval) => `- ${approval.artifactId} ${approval.version} by ${approval.approvedBy}`),
    "",
    "Issues:",
    ...(bundle.issues.length > 0
      ? bundle.issues.map((issue) => `- #${issue.issueNumber} ${issue.assigneeAgent} ${issue.status} ${issue.title}`)
      : ["- none"]),
    "",
    "Pull requests:",
    ...(bundle.pullRequests.length > 0
      ? bundle.pullRequests.map(
          (pr) => `- PR #${pr.prNumber} issue #${pr.issueNumber} ${pr.status} qa=${pr.qaStatus} tests=${pr.testStatus}`
        )
      : ["- none"]),
    "",
    "QA:",
    ...(bundle.qaReports.length > 0
      ? bundle.qaReports.map(
          (report) => `- PR #${report.prNumber} status=${report.status} conflicts=${report.conflictStatus} tests=${report.testStatus}`
        )
      : ["- none"]),
    "",
    "Available command style:",
    "- Slash commands mutate or inspect workflow state directly. Examples: /status, /next, /pm start, /pm draft product-definition --ai, /pd references --ai, /fe spec --ai, /doctor --live.",
    "- Plain text is always runtime chat. Suggest slash commands when useful, but do not assume they already ran."
  ].join("\n");
}

function readLatestConnectionProofs(projectRoot: string): AgentConnectionProofSummary[] {
  return readTrustedConnectionChecks(projectRoot)
    .filter(isConnectionCheckLike)
    .map((check) => ({
      kind: check.kind,
      id: check.id,
      status: check.status,
      trustCategory: check.readiness?.mode ?? "unverified",
      provenStage: check.readiness?.provenStage ?? "none",
      identityLabel: check.identity?.label,
      targetId: check.identity?.targetId,
      firstAction: check.firstActionProof?.action,
      firstActionLabel: check.firstActionProof?.label,
      policy: check.policy,
      readTools: check.kind === "mcp" ? readToolsForServer(check.id, check.firstActionProof?.action, check.policy) : []
    }));
}

function readRecentProofLedgerSummaries(projectRoot: string): AgentProofSummary[] {
  const latest = readProofLedgerLatest(projectRoot);
  if (!latest) {
    return [];
  }
  return Object.values(latest.latestBySubject)
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, 10)
    .map((event) => ({
      kind: event.kind,
      status: event.status,
      subject: event.subject,
      label: event.label,
      trust: event.trust,
      targetId: event.targetId,
      summary: event.summary,
      at: event.at
    }));
}

function isConnectionCheckLike(value: unknown): value is AgentConnectionCheck {
  if (!(value !== null
    && typeof value === "object"
    && typeof (value as { id?: unknown }).id === "string"
    && typeof (value as { status?: unknown }).status === "string")) {
    return false;
  }
  const kind = (value as { kind?: unknown }).kind;
  const status = (value as { status?: unknown }).status;
  if (kind !== "ai" && kind !== "mcp") {
    return false;
  }
  if (status !== "passed" && status !== "failed" && status !== "skipped") {
    return false;
  }
  return true;
}

function readToolsForServer(
  serverId: McpServerId,
  firstAction?: string,
  policy?: AgentConnectionProofSummary["policy"]
): string[] {
  switch (serverId) {
    case "github":
      return ["github.repo.read"];
    case "notion":
      return ["notion.page.read"];
    case "figma":
      return ["figma.file.summary"];
    case "stitch":
      return policy?.satisfied && policy.allowReadOnlyToolCall ? ["mcp.tools.list", "mcp.tools.call"] : ["mcp.tools.list"];
    default:
      return policy?.satisfied && policy.allowReadOnlyToolCall ? ["mcp.tools.list", "mcp.tools.call"] : ["mcp.tools.list"];
  }
}

function renderConnectionProof(proof: AgentConnectionProofSummary): string {
  const target = proof.identityLabel ? ` target=${proof.identityLabel}` : "";
  const targetId = proof.targetId ? ` target_id=${proof.targetId}` : "";
  const action = proof.firstAction ? ` first_action=${proof.firstAction}` : "";
  const actionLabel = proof.firstActionLabel ? ` first_action_label=${proof.firstActionLabel}` : "";
  const policy = proof.policy ? ` policy=${proof.policy.kind}:${proof.policy.state}:${proof.policy.satisfied ? "satisfied" : "unsatisfied"}` : "";
  const tools = proof.readTools.length > 0 ? ` read_tools=${proof.readTools.join(",")}` : "";
  return `- ${proof.kind}:${proof.id} status=${proof.status} trust=${proof.trustCategory}:${proof.provenStage}${policy}${target}${targetId}${action}${actionLabel}${tools}`;
}

function renderRecentProof(proof: AgentProofSummary): string {
  const trust = proof.trust ? ` trust=${proof.trust}` : "";
  const target = proof.targetId ? ` target_id=${proof.targetId}` : "";
  const summary = proof.summary.replace(/\s+/g, " ").trim();
  return `- ${proof.kind} ${proof.subject} status=${proof.status}${trust}${target} at=${proof.at} ${summary}`;
}

function createDocumentArtifact(
  projectRoot: string,
  index: DocumentIndex,
  includeBodies: boolean,
  maxBodyChars: number
): AgentContextArtifact {
  const approved = latestApprovedDocument(projectRoot, index.docId);
  const currentBody = includeBodies && index.currentVersion
    ? truncateBody(showDocument(projectRoot, index.docId, index.currentVersion), maxBodyChars)
    : undefined;
  const approvedBody = includeBodies && approved.version
    ? truncateBody(showDocument(projectRoot, index.docId, approved.version), maxBodyChars)
    : undefined;
  return {
    kind: "document",
    id: index.docId,
    title: DOCUMENT_TITLES[index.docId],
    status: index.status,
    currentVersion: index.currentVersion,
    approvedVersion: approved.version,
    currentBody,
    approvedBody,
    selectedBody: approvedBody ?? currentBody,
    selectedBodySource: approvedBody ? "approved" : currentBody ? "current" : "none"
  };
}

function createDesignArtifact(
  projectRoot: string,
  index: DesignArtifactIndex,
  includeBodies: boolean,
  maxBodyChars: number
): AgentContextArtifact {
  const approved = latestApprovedDesign(projectRoot, index.artifactId);
  const currentBody = includeBodies && index.currentVersion
    ? truncateBody(showDesignArtifact(projectRoot, index.artifactId, index.currentVersion), maxBodyChars)
    : undefined;
  const approvedBody = includeBodies && approved.version
    ? truncateBody(showDesignArtifact(projectRoot, index.artifactId, approved.version), maxBodyChars)
    : undefined;
  return {
    kind: "design-artifact",
    id: index.artifactId,
    title: DESIGN_ARTIFACT_TITLES[index.artifactId],
    status: index.status,
    currentVersion: index.currentVersion,
    approvedVersion: approved.version,
    currentBody,
    approvedBody,
    selectedBody: approvedBody ?? currentBody,
    selectedBodySource: approvedBody ? "approved" : currentBody ? "current" : "none"
  };
}

function latestApprovedDocument(projectRoot: string, docId: Parameters<typeof readDocumentIndex>[1]): { version: string | null } {
  const index = readDocumentIndex(projectRoot, docId);
  const approved = [...index.versions].reverse().find((version) => version.status === "approved");
  return { version: approved?.version ?? null };
}

function latestApprovedDesign(projectRoot: string, artifactId: Parameters<typeof readDesignArtifactIndex>[1]): { version: string | null } {
  const index = readDesignArtifactIndex(projectRoot, artifactId);
  const approved = [...index.versions].reverse().find((version) => version.status === "approved");
  return { version: approved?.version ?? null };
}

function renderArtifacts(artifacts: AgentContextArtifact[]): string[] {
  if (artifacts.length === 0) {
    return ["- none"];
  }
  return artifacts.flatMap((artifact) => {
    const header = `- ${artifact.kind}:${artifact.id} ${artifact.status} current=${artifact.currentVersion ?? "none"} approved=${artifact.approvedVersion ?? "none"} selected=${artifact.selectedBodySource}`;
    if (!artifact.selectedBody) {
      return [header];
    }
    const lines = [header, "  selected_source_of_truth:", indent(artifact.selectedBody)];
    if (artifact.currentBody && artifact.currentBody !== artifact.selectedBody) {
      lines.push("  current_draft:");
      lines.push(indent(artifact.currentBody));
    }
    if (artifact.approvedBody && artifact.approvedBody !== artifact.selectedBody) {
      lines.push("  latest_approved:");
      lines.push(indent(artifact.approvedBody));
    }
    return lines;
  });
}

function truncateBody(markdown: string, maxChars: number): string {
  const body = stripFrontmatter(markdown).trim();
  if (body.length <= maxChars) {
    return body;
  }
  return `${body.slice(0, maxChars).trimEnd()}\n...[truncated]`;
}

function indent(value: string): string {
  return value
    .split(/\r?\n/)
    .slice(0, 160)
    .map((line) => `  ${line}`)
    .join("\n");
}

function summarizeConfig(config: HarnessConfig): AgentConfigSummary {
  return {
    activeProvider: config.activeAiProvider,
    configuredProviders: Object.values(config.aiProviders)
      .filter((provider) => provider.configured)
      .map((provider) => provider.id),
    configuredServers: Object.values(config.mcpServers)
      .filter((server) => server.enabled && server.configured)
      .map((server) => server.id),
    deployment: config.deployment,
    stack: config.stack,
    uiTheme: config.ui.theme,
    uiColor: config.ui.color,
    bootAnimation: config.ui.bootAnimation,
    customKeys: Object.keys(config.custom).sort()
  };
}

function readQaReports(projectRoot: string): QAReportRecord[] {
  if (!fs.existsSync(qaDir(projectRoot))) {
    return [];
  }
  return listFiles(qaDir(projectRoot))
    .filter((fileName) => fileName.endsWith("-report.json"))
    .map((fileName) => readJson<QAReportRecord>(path.join(qaDir(projectRoot), fileName)))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function existingRuntimeFiles(projectRoot: string): string[] {
  return [".rph/project.json", ".rph/state.json", ".rph/config.json", ".rph/runtime/current-session.json"].filter((relative) =>
    fs.existsSync(path.join(projectRoot, relative))
  );
}

function safeList<T>(callback: () => T[]): T[] {
  try {
    return callback();
  } catch {
    return [];
  }
}
