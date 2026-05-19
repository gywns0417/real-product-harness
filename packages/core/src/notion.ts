import {
  NOTION_API_VERSION,
  NOTION_HOSTED_MCP_URL,
  NOTION_PROJECT_SECTIONS,
  notionDatabasePlan,
  notionMcpToolPlan,
  renderNotionPlan
} from "../../integrations/src/notion";
import { notionPlanFile, notionPlanMarkdownFile, notionSyncPayloadFile } from "./paths";
import { readApprovals } from "./approvals";
import { listDesignArtifactIndexes } from "./design";
import { listDocumentIndexes } from "./documents";
import { listPullRequests, listWorkIssues } from "./issues";
import { loadProject, loadState } from "./project";
import { validateEnv } from "./env";
import { writeJson, writeText } from "./fs";

export const NOTION_ENV_KEYS = ["NOTION_TOKEN", "NOTION_PARENT_PAGE_ID"];

export interface NotionWorkspacePlan {
  hostedMcpUrl: string;
  apiVersion: string;
  sections: string[];
  databases: ReturnType<typeof notionDatabasePlan>;
  mcpTools: string[];
  requiredEnv: string[];
  executionMode: "dry-run" | "mcp" | "api";
}

export function createNotionWorkspacePlan(projectRoot: string): { plan: NotionWorkspacePlan; files: string[] } {
  const env = validateEnv(process.env, NOTION_ENV_KEYS);
  const plan: NotionWorkspacePlan = {
    hostedMcpUrl: NOTION_HOSTED_MCP_URL,
    apiVersion: NOTION_API_VERSION,
    sections: NOTION_PROJECT_SECTIONS,
    databases: notionDatabasePlan(),
    mcpTools: notionMcpToolPlan(),
    requiredEnv: NOTION_ENV_KEYS,
    executionMode: env.valid ? "mcp" : "dry-run"
  };
  const files = [notionPlanFile(projectRoot), notionPlanMarkdownFile(projectRoot)];
  writeJson(files[0], plan);
  writeText(files[1], renderNotionWorkspacePlan(plan));
  return { plan, files };
}

export function createNotionSyncPayload(projectRoot: string): { filePath: string; counts: Record<string, number> } {
  const project = loadProject(projectRoot);
  const state = loadState(projectRoot);
  const documents = listDocumentIndexes(projectRoot);
  const designArtifacts = listDesignArtifactIndexes(projectRoot);
  const issues = listWorkIssues(projectRoot);
  const pullRequests = listPullRequests(projectRoot);
  const approvals = readApprovals(projectRoot);
  const payload = {
    project,
    state: {
      currentStage: state.currentStage,
      paused: state.paused,
      updatedAt: state.updatedAt
    },
    documents,
    designArtifacts,
    issues,
    pullRequests,
    approvals
  };
  const filePath = notionSyncPayloadFile(projectRoot);
  writeJson(filePath, payload);
  return {
    filePath,
    counts: {
      documents: documents.length,
      designArtifacts: designArtifacts.length,
      issues: issues.length,
      pullRequests: pullRequests.length,
      approvals: approvals.length
    }
  };
}

export function renderNotionWorkspacePlan(plan: NotionWorkspacePlan): string {
  return [
    "# Notion Workspace Plan",
    "",
    `- hosted_mcp_url: ${plan.hostedMcpUrl}`,
    `- api_version: ${plan.apiVersion}`,
    `- execution_mode: ${plan.executionMode}`,
    `- required_env: ${plan.requiredEnv.join(", ")}`,
    "",
    "## Sections",
    ...plan.sections.map((section) => `- ${section}`),
    "",
    "## MCP Tools",
    ...plan.mcpTools.map((tool) => `- ${tool}`),
    "",
    "## Databases",
    ...plan.databases.map((db) => `### ${db.name}\n\n${db.purpose}\n\nProperties: ${db.properties.join(", ")}\n`),
    "",
    "## Dry-run",
    "No Notion page, database, or view is created until Notion credentials and user approval are present.",
    "",
    "## Reference",
    renderNotionPlan()
  ].join("\n");
}
