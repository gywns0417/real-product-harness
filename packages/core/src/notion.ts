import {
  NOTION_API_VERSION,
  NOTION_HOSTED_MCP_URL,
  NOTION_PROJECT_SECTIONS,
  notionDatabasePlan,
  notionMcpToolPlan,
  renderNotionPlan
} from "../../integrations/src/notion";
import { notionLiveWorkspaceFile, notionPlanFile, notionPlanMarkdownFile, notionSyncPayloadFile } from "./paths";
import { readApprovals } from "./approvals";
import { listDesignArtifactIndexes } from "./design";
import { listDocumentIndexes } from "./documents";
import { listPullRequests, listWorkIssues } from "./issues";
import { loadProject, loadState } from "./project";
import { validateEnv } from "./env";
import { readJsonIfExists, writeJson, writeText } from "./fs";

export const NOTION_ENV_KEYS = ["NOTION_TOKEN", "NOTION_PARENT_PAGE_ID"];
const NOTION_REQUEST_TIMEOUT_MS = 15_000;
const NOTION_MAX_RETRIES = 2;

export interface NotionWorkspacePlan {
  hostedMcpUrl: string;
  apiVersion: string;
  sections: string[];
  databases: ReturnType<typeof notionDatabasePlan>;
  mcpTools: string[];
  requiredEnv: string[];
  executionMode: "dry-run" | "mcp" | "api";
}

export interface NotionLiveWorkspace {
  dashboardPageId: string;
  dashboardUrl?: string;
  databaseIds: Record<string, string>;
  databaseUrls: Record<string, string | undefined>;
  appliedAt: string;
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

export async function applyNotionWorkspacePlan(
  projectRoot: string,
  options: { title?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<{ filePath: string; workspace: NotionLiveWorkspace }> {
  const env = options.env ?? process.env;
  const validation = validateEnv(env, NOTION_ENV_KEYS);
  if (!validation.valid) {
    throw new Error(`Notion live setup blocked. missing env: ${validation.missing.join(", ")}`);
  }
  const project = loadProject(projectRoot);
  const plan = createNotionWorkspacePlan(projectRoot).plan;
  const title = options.title ?? `RPH - ${project.name}`;
  const parentPageId = normalizeNotionPageId(env.NOTION_PARENT_PAGE_ID ?? "");
  const dashboard = await notionPost("/v1/pages", env, {
    parent: {
      type: "page_id",
      page_id: parentPageId
    },
    properties: {
      title: [
        {
          type: "text",
          text: {
            content: title
          }
        }
      ]
    },
    children: dashboardBlocks(plan)
  });
  const dashboardPageId = stringField(dashboard, "id");
  const dashboardUrl = optionalStringField(dashboard, "url");
  const databaseIds: Record<string, string> = {};
  const databaseUrls: Record<string, string | undefined> = {};
  for (const database of plan.databases) {
    const created = await notionPost("/v1/databases", env, {
      parent: {
        type: "page_id",
        page_id: dashboardPageId
      },
      title: [
        {
          type: "text",
          text: {
            content: database.name
          }
        }
      ],
      properties: notionDatabaseProperties(database.properties)
    });
    databaseIds[database.name] = stringField(created, "id");
    databaseUrls[database.name] = optionalStringField(created, "url");
  }
  const workspace: NotionLiveWorkspace = {
    dashboardPageId,
    dashboardUrl,
    databaseIds,
    databaseUrls,
    appliedAt: new Date().toISOString()
  };
  const filePath = notionLiveWorkspaceFile(projectRoot);
  writeJson(filePath, workspace);
  return { filePath, workspace };
}

export async function syncNotionPayloadLive(
  projectRoot: string,
  options: { env?: NodeJS.ProcessEnv } = {}
): Promise<{ filePath: string; synced: number }> {
  const env = options.env ?? process.env;
  const validation = validateEnv(env, NOTION_ENV_KEYS);
  if (!validation.valid) {
    throw new Error(`Notion live sync blocked. missing env: ${validation.missing.join(", ")}`);
  }
  const workspace = readJsonIfExists<NotionLiveWorkspace | null>(notionLiveWorkspaceFile(projectRoot), null);
  if (!workspace?.dashboardPageId) {
    throw new Error("Notion live workspace missing. Run /notion setup --live first");
  }
  const payload = createNotionSyncPayload(projectRoot);
  const project = loadProject(projectRoot);
  await notionPost("/v1/pages", env, {
    parent: {
      type: "page_id",
      page_id: workspace.dashboardPageId
    },
    properties: {
      title: [
        {
          type: "text",
          text: {
            content: `Sync ${project.name} ${new Date().toISOString()}`
          }
        }
      ]
    },
    children: syncSummaryBlocks(payload.counts)
  });
  return {
    filePath: payload.filePath,
    synced: Object.values(payload.counts).reduce((sum, count) => sum + count, 0)
  };
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

async function notionPost(path: string, env: NodeJS.ProcessEnv, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const endpoint = `https://api.notion.com${path}`;
  const requestInit = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN ?? ""}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_API_VERSION
    },
    body: JSON.stringify(body)
  } satisfies RequestInit;
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= NOTION_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NOTION_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        ...requestInit,
        signal: controller.signal
      });
      const text = await response.text();
      const parsed = parseNotionResponse(text);
      if (!response.ok) {
        if (attempt < NOTION_MAX_RETRIES && shouldRetryNotionStatus(response.status)) {
          lastError = new Error(`Notion API request failed (${response.status})`);
          continue;
        }
        const message = parsed.parseError
          ? `invalid JSON response: ${parsed.parseError}`
          : ((notionErrorMessage(parsed.record) ?? text.slice(0, 300)) || response.statusText);
        throw new Error(`Notion API request failed (${response.status}) ${message}`);
      }
      if (parsed.parseError) {
        if (attempt < NOTION_MAX_RETRIES) {
          lastError = new Error(`Notion API response parse failed: ${parsed.parseError}`);
          continue;
        }
        throw new Error(`Notion API response parse failed: ${parsed.parseError}`);
      }
      return parsed.record;
    } catch (error) {
      if (attempt < NOTION_MAX_RETRIES && shouldRetryNotionError(error)) {
        lastError = toError(error);
        continue;
      }
      throw toError(error);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error("Notion API request failed after retries");
}

function dashboardBlocks(plan: NotionWorkspacePlan): Record<string, unknown>[] {
  return [
    headingBlock("Real Product Harness"),
    paragraphBlock(`Hosted MCP: ${plan.hostedMcpUrl}`),
    paragraphBlock(`Execution mode: ${plan.executionMode}`),
    paragraphBlock(`Sections: ${plan.sections.join(", ")}`)
  ];
}

function syncSummaryBlocks(counts: Record<string, number>): Record<string, unknown>[] {
  return [
    headingBlock("RPH Sync Summary"),
    ...Object.entries(counts).map(([key, value]) => paragraphBlock(`${key}: ${value}`))
  ];
}

function headingBlock(text: string): Record<string, unknown> {
  return {
    object: "block",
    type: "heading_2",
    heading_2: {
      rich_text: [richText(text)]
    }
  };
}

function paragraphBlock(text: string): Record<string, unknown> {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [richText(text)]
    }
  };
}

function richText(content: string): Record<string, unknown> {
  return {
    type: "text",
    text: {
      content
    }
  };
}

function notionDatabaseProperties(properties: string[]): Record<string, unknown> {
  const names = properties.length > 0 ? properties : ["Name"];
  return Object.fromEntries(names.map((name, index) => {
    if (index === 0 || name === "Name" || name === "Title") {
      return [name, { title: {} }];
    }
    if (name.toLowerCase().includes("approved")) {
      return [name, { checkbox: {} }];
    }
    if (name.toLowerCase().includes(" at") || name.toLowerCase().includes("updated") || name.toLowerCase().includes("created")) {
      return [name, { date: {} }];
    }
    if (name.toLowerCase().includes("number")) {
      return [name, { number: {} }];
    }
    return [name, { rich_text: {} }];
  }));
}

export function normalizeNotionPageId(value: string): string {
  const canonical = value.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/)?.[0];
  const compact = canonical?.replace(/-/g, "") ?? value.match(/[0-9a-fA-F]{32}/)?.[0];
  if (!compact) {
    throw new Error("NOTION_PARENT_PAGE_ID must be a Notion page UUID or URL containing one");
  }
  return [
    compact.slice(0, 8),
    compact.slice(8, 12),
    compact.slice(12, 16),
    compact.slice(16, 20),
    compact.slice(20)
  ].join("-");
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`Notion response missing ${key}`);
  }
  return value;
}

function optionalStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function notionErrorMessage(record: Record<string, unknown>): string | undefined {
  const message = record.message;
  return typeof message === "string" ? message : undefined;
}

function parseNotionResponse(text: string): { record: Record<string, unknown>; parseError?: string } {
  if (!text.trim()) {
    return { record: {} };
  }
  try {
    const json = JSON.parse(text) as unknown;
    return {
      record: isRecord(json) ? json : {}
    };
  } catch (error) {
    return {
      record: {},
      parseError: toError(error).message
    };
  }
}

function shouldRetryNotionStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function shouldRetryNotionError(error: unknown): boolean {
  const normalized = toError(error);
  return normalized.name === "AbortError" || /fetch failed|network|timed out/i.test(normalized.message);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
