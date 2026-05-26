import { MCP_SERVER_CONTRACTS, type McpServerAuthMode } from "../../integrations/src/mcp";
import {
  attachRuntimeActionReadbackBinding,
  loadRuntimeActionApprovals
} from "./agent-action-approvals";
import { formatAiProviderFallback, readLatestAiProviderOutcome } from "./ai";
import { writeJson } from "./fs";
import { githubRestToken } from "./github";
import { callMcpTool, listMcpTools } from "./mcp-client";
import {
  agentReadOnlyToolsForServer,
  assertMcpToolMetadataAllowsReadOnly,
  createMcpToolCallApprovalSnapshot,
  ensureReadOnlyMcpToolAllowed,
  summarizeMcpPolicyForServer,
  verifyMcpReadOnlyToolContract
} from "./mcp-policy";
import { normalizeNotionPageId } from "./notion";
import { mcpToolCallReadbackFile, mcpToolCallSnapshotFile } from "./paths";
import { normalizeGitHubRepoTarget, readHarnessConfigSnapshot } from "./settings";
import { AgentToolName, HarnessConfig, McpServerId, RuntimeActionApprovedSnapshot } from "./types";

export interface AgentToolDefinition {
  name: AgentToolName;
  description: string;
  permission: "read-only";
  inputSchema: Record<string, unknown>;
}

export interface AgentToolRunInput {
  projectRoot: string;
  config: HarnessConfig;
  env: NodeJS.ProcessEnv;
  name: string;
  args: Record<string, unknown>;
}

export interface OperatorMcpToolInput {
  projectRoot: string;
  config: HarnessConfig;
  env: NodeJS.ProcessEnv;
  serverId: McpServerId;
  toolName?: string;
  arguments?: Record<string, unknown>;
  readOnly?: boolean;
}

export async function captureOperatorMcpToolCallSnapshot(input: OperatorMcpToolInput): Promise<RuntimeActionApprovedSnapshot> {
  const provisional = await currentOperatorMcpToolCallSnapshot(input);
  const snapshotPath = mcpToolCallSnapshotFile(input.projectRoot, input.serverId, provisional.toolName ?? stringArg(input.toolName), provisional.fingerprint);
  const snapshot = {
    ...provisional,
    snapshotPath
  };
  writeJson(snapshotPath, snapshot);
  return snapshot;
}

export async function currentOperatorMcpToolCallSnapshot(input: OperatorMcpToolInput): Promise<RuntimeActionApprovedSnapshot> {
  const toolName = stringArg(input.toolName);
  if (!toolName) {
    throw new Error("/mcp call requires a tool name before approval snapshot capture");
  }
  const target = protocolMcpTarget(input, input.serverId);
  let catalog;
  try {
    catalog = await listMcpTools({
      endpoint: target.endpoint,
      headers: target.headers
    });
  } catch (error) {
    throw new Error(`${input.serverId} MCP tools/list failed before approval snapshot at ${redactUrl(target.endpoint)}: ${errorMessage(error)}`);
  }
  const tool = catalog.tools.find((candidate) => candidate.name === toolName);
  if (!tool) {
    throw new Error(`${input.serverId} MCP tool not found in current tools/list: ${toolName}`);
  }
  return createMcpToolCallApprovalSnapshot(
    getMcpServer(input.config, input.serverId),
    catalog.session,
    tool,
    input.arguments ?? {},
    ""
  );
}

export const READ_ONLY_AGENT_TOOLS: AgentToolDefinition[] = [
  tool("runtime.get_context", "Return the assembled runtime context bundle.", {}),
  tool("workflow.get_status", "Return current workflow stage, owner, blocker, and wait state.", {}),
  tool("workflow.get_next", "Return the next workflow stage and its owner.", {}),
  tool("workflow.can_advance", "Return whether the current workflow can advance.", {}),
  tool("artifacts.list", "List PM documents and PD design artifacts without full bodies.", {}),
  tool("artifacts.get", "Read one document or design artifact body.", { id: "document or design artifact id" }),
  tool("approvals.pending", "List approvals blocking the active stage.", {}),
  tool("actions.pending", "List pending approval-gated external actions.", {}),
  tool("issues.list", "List local work issues.", {}),
  tool("prs.list", "List local pull request drafts.", {}),
  tool("qa.list", "List QA reports.", {}),
  tool("provider.status", "List configured AI providers without secret values.", {}),
  tool("mcp.status", "List configured MCP/adapter servers without secret values.", {}),
  tool("mcp.tools.list", "List available read-only external tool surfaces, and call tools/list for configured protocol MCP servers.", { server: "optional mcp server id or all" }),
  tool("mcp.tools.call", "Call a configured protocol MCP tool. Requires server, toolName, readOnly=true, and arguments.", {
    server: "protocol MCP server id; optional only when exactly one protocol MCP server is configured",
    toolName: "MCP tool name",
    readOnly: true,
    arguments: "tool arguments object"
  }),
  tool("github.repo.read", "Read configured GitHub repository metadata through GitHub REST.", {}),
  tool("notion.page.read", "Read configured Notion parent page metadata through Notion REST.", {}),
  tool("figma.file.summary", "Read configured Figma file summary through Figma REST.", {}),
  tool("stitch.tools.list", "Compatibility alias for mcp.tools.list with server=stitch.", {}),
  tool("stitch.tools.call", "Compatibility alias for mcp.tools.call with server=stitch. Requires toolName, readOnly=true, and arguments.", {
    toolName: "MCP tool name",
    readOnly: true,
    arguments: "tool arguments object"
  })
];

export function renderReadOnlyAgentToolCatalog(): string {
  return READ_ONLY_AGENT_TOOLS
    .map((definition) => `- ${definition.name}: ${definition.description} args=${JSON.stringify(definition.inputSchema)}`)
    .join("\n");
}

export async function runAgentFabricTool(input: AgentToolRunInput): Promise<string | null> {
  switch (input.name) {
    case "provider.status":
      return providerStatus(input);
    case "mcp.status":
      return mcpStatus(input.config);
    case "mcp.tools.list":
      return mcpToolsList(input);
    case "mcp.tools.call":
      return mcpToolsCall(input);
    case "github.repo.read":
      return githubRepoRead(input);
    case "notion.page.read":
      return notionPageRead(input);
    case "figma.file.summary":
      return figmaFileSummary(input);
    case "stitch.tools.list":
      return stitchToolsList(input);
    case "stitch.tools.call":
      return stitchToolsCall(input);
    default:
      return null;
  }
}

function tool(
  name: AgentToolName,
  description: string,
  inputSchema: Record<string, unknown>
): AgentToolDefinition {
  return {
    name,
    description,
    permission: "read-only",
    inputSchema
  };
}

function providerStatus(input: AgentToolRunInput): string {
  const { config } = input;
  const latestOutcome = readLatestAiProviderOutcome(input.projectRoot);
  return JSON.stringify({
    activeAiProvider: config.activeAiProvider,
    latestOutcome,
    latestFallbackSummary: latestOutcome ? formatAiProviderFallback(latestOutcome) : undefined,
    providers: Object.values(config.aiProviders).map((provider) => ({
      id: provider.id,
      name: provider.name,
      enabled: provider.enabled,
      configured: provider.configured,
      missingEnv: provider.missingEnv,
      model: provider.model,
      baseUrl: redactUrl(provider.baseUrl),
      readinessCommand: `/ai test ${provider.id}`
    }))
  }, null, 2);
}

function mcpStatus(config: HarnessConfig): string {
  return JSON.stringify({
    servers: Object.values(config.mcpServers).map((server) => ({
      id: server.id,
      name: server.name,
      kind: server.kind,
      enabled: server.enabled,
      configured: server.configured,
      transport: server.transport,
      command: server.command,
      url: server.url ? redactUrl(server.url) : undefined,
      authMode: server.authMode,
      authEnvKey: server.authEnvKey,
      policy: summarizeMcpPolicyForServer(config, server.id),
      agentReadOnlyTools: agentReadOnlyTools(config, server.id),
      missingEnv: server.missingEnv,
      warnings: server.warnings,
      notes: server.notes,
      readinessCommand: `/mcp test ${server.id}`
    }))
  }, null, 2);
}

async function mcpToolsList(input: AgentToolRunInput): Promise<string> {
  const requested = stringArg(input.args.server ?? input.args.id ?? "all").toLowerCase() || "all";
  const explicitServer = requested !== "all";
  const serverIds = requested === "all"
    ? Object.keys(input.config.mcpServers)
    : [parseMcpServerId(requested)];
  const results = [];
  for (const serverId of serverIds) {
    const server = getMcpServer(input.config, serverId);
    if (isProtocolMcpServer(input.config, serverId)) {
      if (!server.configured && !explicitServer) {
        results.push(protocolMcpUnavailableSummary(input.config, serverId));
        continue;
      }
      results.push(JSON.parse(await protocolMcpToolsList(input, serverId)));
      continue;
    }
    const builtIn = (MCP_SERVER_CONTRACTS as Record<string, { protocolReadiness: "tools/list" | "tools/call" | "not-applicable"; protocolReason?: string }>)[serverId];
    results.push({
      server: serverId,
      name: server.name,
      kind: server.kind,
      configured: server.configured,
      protocolReadiness: server.protocolReadiness ?? builtIn?.protocolReadiness ?? "not-applicable",
      protocolReason: server.protocolReason ?? builtIn?.protocolReason ?? null,
      policy: summarizeMcpPolicyForServer(input.config, serverId),
      readTools: readToolsForServer(input.config, serverId),
      note: "REST adapter read tools are exposed as harness read-only tools, not MCP protocol tools."
    });
  }
  return JSON.stringify({ servers: results }, null, 2);
}

async function mcpToolsCall(input: AgentToolRunInput): Promise<string> {
  const serverId = resolveProtocolMcpServerForCall(input);
  return protocolMcpToolsCall(input, serverId);
}

async function githubRepoRead(input: AgentToolRunInput): Promise<string> {
  const server = input.config.mcpServers.github;
  ensureConfigured("github", server.configured, server.missingEnv);
  const target = normalizeGitHubRepoTarget(input.env.GITHUB_OWNER, input.env.GITHUB_REPO);
  if (!target.owner || !target.repo || target.warnings.length > 0) {
    throw new Error(target.warnings[0] ?? "GITHUB_OWNER/GITHUB_REPO target is missing");
  }
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`;
  const json = await fetchJson(endpoint, {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${githubRestToken(input.env)}`,
    "X-GitHub-Api-Version": "2026-03-10"
  });
  const repo = json as Record<string, unknown>;
  return JSON.stringify({
    id: repo.id,
    fullName: repo.full_name,
    private: repo.private,
    visibility: repo.visibility,
    defaultBranch: repo.default_branch,
    htmlUrl: repo.html_url,
    pushedAt: repo.pushed_at,
    openIssues: repo.open_issues_count,
    permissions: repo.permissions
  }, null, 2);
}

async function notionPageRead(input: AgentToolRunInput): Promise<string> {
  const server = input.config.mcpServers.notion;
  ensureConfigured("notion", server.configured, server.missingEnv);
  const pageId = normalizeNotionPageId(input.env.NOTION_PARENT_PAGE_ID ?? "");
  const endpoint = `https://api.notion.com/v1/pages/${encodeURIComponent(pageId)}`;
  const json = await fetchJson(endpoint, {
    Authorization: `Bearer ${input.env.NOTION_TOKEN ?? ""}`,
    "Notion-Version": "2026-03-11"
  });
  const page = json as Record<string, unknown>;
  const properties = page.properties && typeof page.properties === "object"
    ? Object.keys(page.properties as Record<string, unknown>)
    : [];
  return JSON.stringify({
    id: page.id,
    object: page.object,
    url: page.url,
    createdTime: page.created_time,
    lastEditedTime: page.last_edited_time,
    archived: page.archived,
    properties
  }, null, 2);
}

async function figmaFileSummary(input: AgentToolRunInput): Promise<string> {
  const server = input.config.mcpServers.figma;
  ensureConfigured("figma", server.configured, server.missingEnv);
  const fileId = normalizeFigmaFileId(input.env.FIGMA_FILE_ID ?? "");
  if (!fileId) {
    throw new Error("FIGMA_FILE_ID is missing");
  }
  const endpoint = `https://api.figma.com/v1/files/${encodeURIComponent(fileId)}?depth=1`;
  const json = await fetchJson(endpoint, {
    "X-Figma-Token": input.env.FIGMA_TOKEN ?? ""
  });
  const file = json as Record<string, unknown>;
  const document = file.document as Record<string, unknown> | undefined;
  const children = Array.isArray(document?.children)
    ? document.children.slice(0, 20).map((child) => summarizeFigmaNode(child))
    : [];
  return JSON.stringify({
    name: file.name,
    lastModified: file.lastModified,
    version: file.version,
    document: document ? summarizeFigmaNode(document) : null,
    topLevelChildren: children
  }, null, 2);
}

async function stitchToolsList(input: AgentToolRunInput): Promise<string> {
  return protocolMcpToolsList(input, "stitch");
}

async function stitchToolsCall(input: AgentToolRunInput): Promise<string> {
  return protocolMcpToolsCall(input, "stitch");
}

export async function listOperatorMcpTools(input: OperatorMcpToolInput): Promise<string> {
  const target = protocolMcpTarget(input, input.serverId);
  let result;
  try {
    result = await listMcpTools({
      endpoint: target.endpoint,
      headers: target.headers
    });
  } catch (error) {
    throw new Error(`${input.serverId} MCP tools/list failed at ${redactUrl(target.endpoint)}: ${errorMessage(error)}`);
  }
  return JSON.stringify({
    server: input.serverId,
    kind: "mcp-streamable-http",
    configured: true,
    operatorDiscovery: true,
    policy: summarizeMcpPolicyForServer(input.config, input.serverId),
    session: {
      protocolVersion: result.session.protocolVersion,
      hasSessionId: Boolean(result.session.sessionId),
      endpoint: result.session.endpoint
    },
    tools: result.tools,
    note: "Operator discovery lists MCP server tools for explicit user review; agent mcp.tools.call remains limited by the read-only allowlist."
  }, null, 2);
}

export async function callOperatorMcpTool(input: OperatorMcpToolInput): Promise<string> {
  const toolName = stringArg(input.toolName);
  if (!toolName) {
    throw new Error("/mcp call requires a tool name");
  }
  const readOnly = input.readOnly === true;
  if (!readOnly && !input.env.RPH_ACTION_APPROVAL_ID) {
    throw new Error("/mcp call requires --read-only unless it is running through /agent approve-action with a bound mutable MCP approval snapshot.");
  }
  const target = protocolMcpTarget(input, input.serverId);
  let catalog;
  try {
    catalog = await listMcpTools({
      endpoint: target.endpoint,
      headers: target.headers
    });
  } catch (error) {
    throw new Error(`${input.serverId} MCP tools/list failed before tools/call at ${redactUrl(target.endpoint)}: ${errorMessage(error)}`);
  }
  const tool = catalog.tools.find((candidate) => candidate.name === toolName);
  if (!tool) {
    throw new Error(`${input.serverId} MCP tool not found in current tools/list: ${toolName}`);
  }
  const toolArgs = input.arguments ?? {};
  let toolContract;
  let approvedSnapshot: RuntimeActionApprovedSnapshot | undefined;
  let readbackArtifactPath: string | undefined;
  if (readOnly) {
    ensureReadOnlyMcpToolAllowed(input.config, input.serverId, toolName);
    assertMcpToolMetadataAllowsReadOnly(input.serverId, toolName, tool.annotations);
    toolContract = verifyMcpReadOnlyToolContract(input.config, input.serverId, catalog.session, tool);
  } else {
    approvedSnapshot = assertApprovedMutableMcpCall(input, toolName);
    const current = createMcpToolCallApprovalSnapshot(
      getMcpServer(input.config, input.serverId),
      catalog.session,
      tool,
      toolArgs,
      approvedSnapshot.snapshotPath,
      approvedSnapshot.capturedAt
    );
    if (current.fingerprint !== approvedSnapshot.fingerprint) {
      throw new Error(`${input.serverId}.${toolName} approved MCP tool-call snapshot drifted: expected ${approvedSnapshot.fingerprint}, got ${current.fingerprint}`);
    }
  }
  let result;
  try {
    result = await callMcpTool({
      endpoint: target.endpoint,
      headers: target.headers
    }, toolName, toolArgs);
  } catch (error) {
    throw new Error(`${input.serverId} MCP tools/call failed at ${redactUrl(target.endpoint)}: ${errorMessage(error)}`);
  }
  if (!readOnly) {
    readbackArtifactPath = mcpToolCallReadbackFile(input.projectRoot, input.env.RPH_ACTION_APPROVAL_ID ?? "unknown-action");
    writeJson(readbackArtifactPath, attachRuntimeActionReadbackBinding({
      kind: "mcp-tool-call-readback-v1",
      server: input.serverId,
      toolName,
      verified: result.isError !== true,
      approvedSnapshotFingerprint: approvedSnapshot?.fingerprint,
      session: {
        protocolVersion: result.session.protocolVersion,
        hasSessionId: Boolean(result.session.sessionId),
        endpoint: result.session.endpoint
      },
      isError: result.isError,
      content: result.content,
      structuredContent: result.structuredContent,
      result: result.result
    }, input.env));
  }
  return JSON.stringify({
    server: input.serverId,
    kind: "mcp-streamable-http",
    operatorCall: true,
    readOnly,
    toolName,
    policy: summarizeMcpPolicyForServer(input.config, input.serverId),
    session: {
      protocolVersion: result.session.protocolVersion,
      hasSessionId: Boolean(result.session.sessionId),
      endpoint: result.session.endpoint
    },
    isError: result.isError,
    content: result.content,
    structuredContent: result.structuredContent,
    result: result.result,
    toolContract: toolContract ? { fingerprint: toolContract.fingerprint, capturedAt: toolContract.capturedAt } : undefined,
    approvedSnapshot: approvedSnapshot ? { fingerprint: approvedSnapshot.fingerprint, capturedAt: approvedSnapshot.capturedAt } : undefined,
    readbackArtifactPath,
    note: readOnly
      ? "Explicit operator call executed with --read-only. Agent calls still require the configured mcpPolicyRegistry allowlist."
      : "Mutable MCP operator call executed through an approved runtime action and wrote a bound readback proof."
  }, null, 2);
}

function assertApprovedMutableMcpCall(
  input: OperatorMcpToolInput,
  toolName: string
): RuntimeActionApprovedSnapshot {
  const actionApprovalId = input.env.RPH_ACTION_APPROVAL_ID?.trim();
  const approvedFingerprint = input.env.RPH_ACTION_APPROVAL_FINGERPRINT?.trim();
  if (!actionApprovalId || !approvedFingerprint) {
    throw new Error("/mcp call mutable execution requires RPH_ACTION_APPROVAL_ID and RPH_ACTION_APPROVAL_FINGERPRINT from /agent approve-action.");
  }
  const action = loadRuntimeActionApprovals(input.projectRoot).find((record) => record.id === actionApprovalId);
  if (!action || action.status !== "running") {
    throw new Error(`/mcp call mutable execution requires a running approval action; got ${action?.status ?? "missing"} for ${actionApprovalId}.`);
  }
  if (action.target !== "mcp" || action.action !== `${input.serverId}.${toolName}`) {
    throw new Error(`/mcp call mutable execution target mismatch: approval is ${action.target}:${action.action}, call is mcp:${input.serverId}.${toolName}.`);
  }
  if (action.fingerprint !== approvedFingerprint) {
    throw new Error(`/mcp call mutable execution fingerprint mismatch for ${actionApprovalId}.`);
  }
  const snapshot = action.approvedSnapshot;
  if (!snapshot || snapshot.kind !== "mcp.tool-call" || snapshot.version !== "mcp-tool-call-v1") {
    throw new Error(`/mcp call mutable execution requires a bound MCP tool-call approval snapshot for ${actionApprovalId}.`);
  }
  if (snapshot.serverId !== input.serverId || snapshot.toolName !== toolName) {
    throw new Error(`/mcp call mutable execution snapshot target mismatch: snapshot is ${snapshot.serverId}.${snapshot.toolName}, call is ${input.serverId}.${toolName}.`);
  }
  return snapshot;
}

async function protocolMcpToolsList(input: AgentToolRunInput, serverId: McpServerId): Promise<string> {
  const target = protocolMcpTarget(input, serverId);
  const allowedReadOnlyTools = agentReadOnlyTools(input.config, serverId);
  if (allowedReadOnlyTools.length === 0) {
    return JSON.stringify({
      server: serverId,
      kind: "mcp-streamable-http",
      configured: true,
      policy: {
        ...summarizeMcpPolicyForServer(input.config, serverId),
        allowReadOnlyToolCall: false,
        agentReadOnlyTools: []
      },
      tools: [],
      note: "No MCP tools are exposed to the agent because this server has no read-only tool allowlist."
    }, null, 2);
  }
  let result;
  try {
    result = await listMcpTools({
      endpoint: target.endpoint,
      headers: target.headers
    });
  } catch (error) {
    throw new Error(`${serverId} MCP tools/list failed at ${redactUrl(target.endpoint)}: ${errorMessage(error)}`);
  }
  const allowed = new Set(allowedReadOnlyTools);
  const tools = result.tools.filter((candidate) => typeof candidate.name === "string" && allowed.has(candidate.name));
  return JSON.stringify({
    server: serverId,
    kind: "mcp-streamable-http",
    configured: true,
    policy: {
      ...summarizeMcpPolicyForServer(input.config, serverId),
      allowReadOnlyToolCall: true,
      agentReadOnlyTools: allowedReadOnlyTools
    },
    session: {
      protocolVersion: result.session.protocolVersion,
      hasSessionId: Boolean(result.session.sessionId),
      endpoint: result.session.endpoint
    },
    tools,
    filteredOutToolCount: Math.max(0, result.tools.length - tools.length)
  }, null, 2);
}

async function protocolMcpToolsCall(input: AgentToolRunInput, serverId: McpServerId): Promise<string> {
  if (input.args.readOnly !== true) {
    throw new Error("mcp.tools.call requires args.readOnly=true; mutating MCP tool calls must be explicit slash commands.");
  }
  const toolName = stringArg(input.args.toolName ?? input.args.name ?? input.args.tool);
  if (!toolName) {
    throw new Error("mcp.tools.call requires args.toolName");
  }
  const toolArgs = objectArg(input.args.arguments ?? input.args.args ?? {});
  const target = protocolMcpTarget(input, serverId);
  ensureAgentReadOnlyMcpTool(input.config, serverId, toolName);
  let catalog;
  try {
    catalog = await listMcpTools({
      endpoint: target.endpoint,
      headers: target.headers
    });
  } catch (error) {
    throw new Error(`${serverId} MCP tools/list failed before tools/call at ${redactUrl(target.endpoint)}: ${errorMessage(error)}`);
  }
  const tool = catalog.tools.find((candidate) => candidate.name === toolName);
  if (!tool) {
    throw new Error(`${serverId} MCP tool not found in current tools/list: ${toolName}`);
  }
  assertMcpToolMetadataAllowsReadOnly(serverId, toolName, tool.annotations);
  const toolContract = verifyMcpReadOnlyToolContract(input.config, serverId, catalog.session, tool);
  let result;
  try {
    result = await callMcpTool({
      endpoint: target.endpoint,
      headers: target.headers
    }, toolName, toolArgs);
  } catch (error) {
    throw new Error(`${serverId} MCP tools/call failed at ${redactUrl(target.endpoint)}: ${errorMessage(error)}`);
  }
  return JSON.stringify({
    server: serverId,
    kind: "mcp-streamable-http",
    toolName,
    session: {
      protocolVersion: result.session.protocolVersion,
      hasSessionId: Boolean(result.session.sessionId),
      endpoint: result.session.endpoint
    },
    isError: result.isError,
    content: result.content,
    structuredContent: result.structuredContent,
    result: result.result,
    toolContract: toolContract ? { fingerprint: toolContract.fingerprint, capturedAt: toolContract.capturedAt } : undefined
  }, null, 2);
}

function protocolMcpTarget(input: Pick<AgentToolRunInput, "config" | "env">, serverId: McpServerId): { endpoint: string; headers?: Record<string, string> } {
  const server = getMcpServer(input.config, serverId);
  if (!isProtocolMcpServer(input.config, serverId)) {
    throw new Error(`${serverId} is a REST adapter in RPH. Only configured protocol MCP servers can use mcp.tools.call.`);
  }
  ensureConfigured(serverId, server.configured, server.missingEnv);
  if (server.transport !== "http" || !server.url) {
    throw new Error(`${serverId} is a protocol MCP server, but only HTTP MCP servers with a URL are supported by this client.`);
  }
  return {
    endpoint: server.url,
    headers: protocolMcpAuthHeaders(input.env, server, serverId)
  };
}

function isProtocolMcpServer(config: HarnessConfig, serverId: McpServerId): boolean {
  const server = config.mcpServers[serverId];
  if (!server) {
    return false;
  }
  return server.kind === "mcp-server" && (server.protocolReadiness ?? "tools/list") !== "not-applicable";
}

function configuredProtocolMcpServerIds(config: HarnessConfig): McpServerId[] {
  return Object.keys(config.mcpServers).filter((serverId) =>
    isProtocolMcpServer(config, serverId) && config.mcpServers[serverId].configured
  );
}

function resolveProtocolMcpServerForCall(input: AgentToolRunInput): McpServerId {
  const requested = stringArg(input.args.server ?? input.args.id);
  if (requested) {
    return parseMcpServerId(requested.toLowerCase());
  }
  const configured = configuredProtocolMcpServerIds(input.config);
  if (configured.length === 1) {
    return configured[0];
  }
  if (configured.length > 1) {
    throw new Error(`mcp.tools.call requires args.server when multiple protocol MCP servers are configured: ${configured.join(", ")}`);
  }
  const protocolServers = Object.keys(input.config.mcpServers)
    .filter((serverId) => isProtocolMcpServer(input.config, serverId));
  throw new Error(`mcp.tools.call requires args.server because no protocol MCP server is configured. Available protocol MCP servers: ${protocolServers.join(",") || "none"}`);
}

function protocolMcpUnavailableSummary(config: HarnessConfig, serverId: McpServerId): Record<string, unknown> {
  const server = getMcpServer(config, serverId);
  return {
    server: serverId,
    name: server.name,
    kind: server.kind,
    configured: server.configured,
    missingEnv: server.missingEnv,
    protocolReadiness: server.protocolReadiness ?? "tools/list",
    policy: summarizeMcpPolicyForServer(config, serverId),
    readTools: readToolsForServer(config, serverId),
    note: "Protocol MCP server is not configured; tools/list was not called."
  };
}

function protocolMcpAuthHeaders(
  env: NodeJS.ProcessEnv,
  server: HarnessConfig["mcpServers"][string],
  serverId: McpServerId
): Record<string, string> | undefined {
  const mode = server.authMode ?? "none";
  if (mode === "none") {
    return undefined;
  }
  if (!server.authEnvKey) {
    throw new Error(`${serverId} uses auth mode ${mode}, but no auth env key is declared in the MCP config.`);
  }
  const secret = env[server.authEnvKey]?.trim();
  if (!secret) {
    throw new Error(`${serverId} auth secret missing: ${server.authEnvKey}`);
  }
  switch (mode) {
    case "x-goog-api-key":
      return { "X-Goog-Api-Key": secret };
    case "bearer":
      return { Authorization: `Bearer ${secret}` };
    default:
      return unsupportedMcpAuthMode(mode, serverId);
  }
}

function unsupportedMcpAuthMode(mode: McpServerAuthMode, serverId: McpServerId): never {
  throw new Error(`${serverId} uses unsupported MCP auth mode ${String(mode)}.`);
}

function ensureConfigured(serverId: McpServerId, configured: boolean, missingEnv: string[]): void {
  if (!configured) {
    throw new Error(`${serverId} is not configured. missing=${missingEnv.join(",") || "unknown"}`);
  }
}

async function fetchJson(
  endpoint: string,
  headers: Record<string, string>,
  init: Pick<RequestInit, "method" | "body"> = {}
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(endpoint, {
      method: init.method ?? "GET",
      headers,
      body: init.body,
      signal: controller.signal
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) as unknown : {};
    if (!response.ok) {
      throw new Error(`request failed (${response.status})`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

function readToolsForServer(config: HarnessConfig, serverId: McpServerId): string[] {
  switch (serverId) {
    case "github":
      return ["github.repo.read"];
    case "notion":
      return ["notion.page.read"];
    case "figma":
      return ["figma.file.summary"];
    case "stitch":
      return agentReadOnlyTools(config, serverId).length > 0 ? ["mcp.tools.list", "mcp.tools.call"] : ["mcp.tools.list"];
    default:
      return agentReadOnlyTools(config, serverId).length > 0 ? ["mcp.tools.list", "mcp.tools.call"] : ["mcp.tools.list"];
  }
}

function agentReadOnlyTools(config: HarnessConfig, serverId: McpServerId): string[] {
  return agentReadOnlyToolsForServer(config, serverId);
}

function ensureAgentReadOnlyMcpTool(config: HarnessConfig, serverId: McpServerId, toolName: string): void {
  ensureReadOnlyMcpToolAllowed(config, serverId, toolName);
}

function parseMcpServerId(value: string): McpServerId {
  if (/^[a-z0-9][a-z0-9_-]{1,62}$/.test(value)) {
    return value;
  }
  throw new Error(`invalid MCP server id: ${value}`);
}

function getMcpServer(config: HarnessConfig, serverId: McpServerId): HarnessConfig["mcpServers"][string] {
  const server = config.mcpServers[serverId];
  if (!server) {
    throw new Error(`unknown MCP server: ${serverId}`);
  }
  return server;
}

function normalizeFigmaFileId(value: string): string {
  const trimmed = value.trim();
  const urlMatch = trimmed.match(/figma\.com\/(?:file|design)\/([^/?#]+)/i);
  return urlMatch?.[1] ?? trimmed;
}

function summarizeFigmaNode(value: unknown): Record<string, unknown> {
  const node = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible
  };
}

function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    for (const key of url.searchParams.keys()) {
      url.searchParams.set(key, "<redacted>");
    }
    return url.toString();
  } catch {
    return value;
  }
}

function stringArg(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function objectArg(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function reloadHarnessConfigForTools(projectRoot: string): HarnessConfig {
  return readHarnessConfigSnapshot(projectRoot);
}
