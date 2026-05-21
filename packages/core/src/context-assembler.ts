import fs from "node:fs";
import path from "node:path";
import { approvalsFile, designApprovalsFile, qaDir } from "./paths";
import { loadProject, loadState, requireInitialized } from "./project";
import { loadHarnessConfig } from "./settings";
import { nextStage, WORKFLOW_STAGES } from "./workflow";
import { DESIGN_ARTIFACT_TITLES, listDesignArtifactIndexes, readDesignArtifactIndex, showDesignArtifact } from "./design";
import { DOCUMENT_TITLES, listDocumentIndexes, readDocumentIndex, showDocument, stripFrontmatter } from "./documents";
import { listPullRequests, listWorkIssues } from "./issues";
import { listFiles, readJson, readJsonIfExists } from "./fs";
import {
  AgentConfigSummary,
  AgentContextArtifact,
  AgentContextBundle,
  Approval,
  DesignApproval,
  DocumentIndex,
  DesignArtifactIndex,
  QAReportRecord
} from "./types";

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
  const config = loadHarnessConfig(projectRoot);
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
    "- Plain text is runtime chat unless it is clearly a status or workflow-start intent."
  ].join("\n");
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

function summarizeConfig(config: ReturnType<typeof loadHarnessConfig>): AgentConfigSummary {
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
