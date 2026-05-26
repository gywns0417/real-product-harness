import crypto from "node:crypto";
import type { McpHttpSession, McpToolSummary } from "./mcp-client";
import {
  ConnectionCheck,
  HarnessConfig,
  McpPolicyEvaluation,
  McpPolicyRegistry,
  McpPolicyRequiredTrust,
  McpPolicyRuntimeState,
  McpReadOnlyToolContract,
  McpServerId,
  McpServerPolicy,
  McpServerRuntimeConfig,
  RuntimeActionApprovedSnapshot
} from "./types";

type MaybePersistedPolicyRegistry = Partial<McpPolicyRegistry> | undefined;

export function buildMcpPolicyRegistry(
  mcpServers: Record<string, McpServerRuntimeConfig>,
  previous?: MaybePersistedPolicyRegistry,
  persisted?: MaybePersistedPolicyRegistry
): McpPolicyRegistry {
  const inherited = {
    ...(previous?.servers ?? {}),
    ...(persisted?.servers ?? {})
  };
  const servers: Record<string, McpServerPolicy> = {};
  for (const server of Object.values(mcpServers)) {
    servers[server.id] = deriveMcpServerPolicy(server, inherited[server.id]);
  }
  return {
    version: 1,
    defaults: {
      toolCallMode: "read-only-allowlist",
      requireExplicitServerSelection: true
    },
    servers
  };
}

export function applyMcpPolicyRegistryToServers(
  mcpServers: Record<string, McpServerRuntimeConfig>,
  registry: McpPolicyRegistry
): Record<string, McpServerRuntimeConfig> {
  for (const server of Object.values(mcpServers)) {
    const policy = registry.servers[server.id];
    if (!policy) {
      continue;
    }
    server.protocolReadiness = policy.protocolReadiness;
    server.protocolToolCallProbe = policy.protocolToolCallProbe;
    server.agentReadOnlyTools = normalizeMcpToolNames(policy.agentReadOnlyTools);
  }
  return mcpServers;
}

export function normalizeHarnessMcpPolicy(config: HarnessConfig): HarnessConfig {
  const registry = buildMcpPolicyRegistry(
    config.mcpServers,
    config.mcpPolicyRegistry
  );
  applyMcpPolicyRegistryToServers(config.mcpServers, registry);
  return {
    ...config,
    mcpPolicyRegistry: registry
  };
}

export function mcpPolicyForServer(config: HarnessConfig, serverId: McpServerId): McpServerPolicy | undefined {
  const server = config.mcpServers[serverId];
  if (!server) {
    return undefined;
  }
  const registry = config.mcpPolicyRegistry as McpPolicyRegistry | undefined;
  if (registry?.servers?.[serverId]) {
    return deriveMcpServerPolicy(server, registry.servers[serverId]);
  }
  return deriveMcpServerPolicy(server);
}

export function agentReadOnlyToolsForServer(config: HarnessConfig, serverId: McpServerId): string[] {
  return normalizeMcpToolNames(mcpPolicyForServer(config, serverId)?.agentReadOnlyTools ?? []);
}

export function ensureReadOnlyMcpToolAllowed(
  config: HarnessConfig,
  serverId: McpServerId,
  toolName: string
): void {
  const policy = mcpPolicyForServer(config, serverId);
  if (!policy) {
    throw new Error(`${serverId} has no MCP policy; run /setup auto or /setup mcp add before using mcp.tools.call.`);
  }
  if (!policy.allowReadOnlyToolCall) {
    throw new Error(`${serverId} MCP policy blocks agent tools/call; use /mcp tools first or configure an explicit read-only allowlist.`);
  }
  const allowed = normalizeMcpToolNames(policy.agentReadOnlyTools);
  if (allowed.length === 0) {
    throw new Error(`${serverId} has no agent read-only MCP tool allowlist; configure one with /setup mcp add --allow-tool or --probe-tool before using mcp.tools.call.`);
  }
  if (!allowed.includes(toolName)) {
    throw new Error(`${serverId}.${toolName} is not in the agent read-only MCP tool allowlist; mutating or unclassified MCP tools must be explicit slash commands and approval-gated.`);
  }
}

export function captureMcpReadOnlyToolContracts(
  server: McpServerRuntimeConfig,
  session: McpHttpSession,
  tools: McpToolSummary[],
  toolNames: string[],
  capturedAt = new Date().toISOString()
): Record<string, McpReadOnlyToolContract> {
  const requested = new Set(normalizeMcpToolNames(toolNames));
  const contracts: Record<string, McpReadOnlyToolContract> = {};
  for (const tool of tools) {
    if (!requested.has(tool.name)) {
      continue;
    }
    contracts[tool.name] = createMcpReadOnlyToolContract(server, session, tool, capturedAt);
  }
  return contracts;
}

export function createMcpToolCallApprovalSnapshot(
  server: McpServerRuntimeConfig,
  session: McpHttpSession,
  tool: McpToolSummary,
  args: Record<string, unknown>,
  snapshotPath: string,
  capturedAt = new Date().toISOString()
): RuntimeActionApprovedSnapshot {
  const serverInfo = mcpServerInfo(session.serverInfo);
  const endpoint = mcpEndpointIdentity(server.url ?? session.endpoint);
  const authMode = server.authMode ?? "none";
  const inputSchemaSha256 = sha256(stableJson(tool.inputSchema ?? null));
  const annotationsSha256 = sha256(stableJson(tool.annotations ?? null));
  const argumentsSha256 = sha256(stableJson(args));
  const canonical = {
    version: "mcp-tool-call-v1",
    serverId: server.id,
    toolName: tool.name,
    endpoint,
    authMode,
    authEnvKey: server.authEnvKey,
    protocolVersion: session.protocolVersion,
    serverInfoName: serverInfo.name,
    serverInfoVersion: serverInfo.version,
    inputSchemaSha256,
    annotationsSha256,
    argumentsSha256
  };
  return {
    kind: "mcp.tool-call",
    version: "mcp-tool-call-v1",
    fingerprint: sha256(stableJson(canonical)).slice(0, 24),
    snapshotPath,
    serverId: server.id,
    toolName: tool.name,
    endpoint,
    authMode,
    authEnvKey: server.authEnvKey,
    protocolVersion: session.protocolVersion,
    serverInfoName: serverInfo.name,
    serverInfoVersion: serverInfo.version,
    inputSchemaSha256,
    annotationsSha256,
    argumentsSha256,
    capturedAt,
    summary: `${server.id}.${tool.name} MCP tool call`
  };
}

export function verifyMcpReadOnlyToolContract(
  config: HarnessConfig,
  serverId: McpServerId,
  session: McpHttpSession,
  tool: McpToolSummary
): McpReadOnlyToolContract | undefined {
  const server = config.mcpServers[serverId];
  const policy = mcpPolicyForServer(config, serverId);
  if (!server || !policy) {
    return undefined;
  }
  const contract = policy.toolContracts?.[tool.name];
  if (!contract) {
    if (policy.requireReadOnlyToolContracts) {
      throw new Error(`${serverId}.${tool.name} has no bound MCP read-only tool contract; run /mcp tools ${serverId} --bind after reviewing current tools/list.`);
    }
    return undefined;
  }
  const current = createMcpReadOnlyToolContract(server, session, tool, contract.capturedAt);
  if (current.fingerprint !== contract.fingerprint) {
    throw new Error(`${serverId}.${tool.name} MCP read-only tool contract drifted: expected ${contract.fingerprint}, got ${current.fingerprint}; run /mcp tools ${serverId} --bind after reviewing the changed tool metadata.`);
  }
  return contract;
}

export function assertMcpToolMetadataAllowsReadOnly(serverId: McpServerId, toolName: string, annotations: unknown): void {
  const metadata = annotations && typeof annotations === "object" ? annotations as Record<string, unknown> : {};
  if (metadata.readOnlyHint !== true) {
    throw new Error(`${serverId} MCP tool is not explicitly verified read-only by current tools/list metadata: ${toolName}`);
  }
  if (metadata.destructiveHint === true) {
    throw new Error(`${serverId} MCP tool is marked destructive by current tools/list metadata: ${toolName}`);
  }
}

export function evaluateMcpPolicy(config: HarnessConfig, check: ConnectionCheck): McpPolicyEvaluation | undefined {
  if (check.kind !== "mcp") {
    return undefined;
  }
  const policy = mcpPolicyForServer(config, check.id);
  if (!policy) {
    return {
      kind: "missing-policy",
      source: "runtime",
      state: "blocked-by-policy",
      satisfied: false,
      requiredTrust: "unverified:none",
      actualTrust: actualTrust(check),
      allowToolsList: false,
      allowReadOnlyToolCall: false,
      requireExplicitServerSelection: true,
      agentReadOnlyTools: [],
      requiredTools: [],
      missingTools: [],
      configFingerprint: mcpPolicyFingerprint(config)
    };
  }
  const requiredTrust = requiredTrustForPolicy(policy);
  const requiredTools = requiredToolsForPolicy(policy);
  const allowed = normalizeMcpToolNames(policy.agentReadOnlyTools);
  const missingTools = requiredTools.filter((tool) => !allowed.includes(tool));
  const trustSatisfied = isTrustSatisfied(requiredTrust, check);
  const satisfied = check.status === "passed" && trustSatisfied && missingTools.length === 0;
  return {
    kind: policy.kind,
    source: policy.source,
    state: policyRuntimeState(policy, check, trustSatisfied, missingTools),
    satisfied,
    requiredTrust,
    actualTrust: actualTrust(check),
    allowToolsList: policy.allowToolsList,
    allowReadOnlyToolCall: policy.allowReadOnlyToolCall,
    requireExplicitServerSelection: policy.requireExplicitServerSelection,
    agentReadOnlyTools: allowed,
    requireReadOnlyToolContracts: Boolean(policy.requireReadOnlyToolContracts),
    toolContractCount: Object.keys(policy.toolContracts ?? {}).length,
    requiredTools,
    missingTools,
    configFingerprint: mcpPolicyFingerprint(config)
  };
}

export function attachMcpPolicyEvaluation(config: HarnessConfig, check: ConnectionCheck): ConnectionCheck {
  const policy = evaluateMcpPolicy(config, check);
  return policy ? { ...check, policy } : check;
}

export function mcpPolicyFingerprint(config: HarnessConfig): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({
      version: config.mcpPolicyRegistry?.version ?? 0,
      defaults: config.mcpPolicyRegistry?.defaults ?? {},
      servers: config.mcpPolicyRegistry?.servers ?? {}
    }))
    .digest("hex")
    .slice(0, 16);
}

export function summarizeMcpPolicyForServer(config: HarnessConfig, serverId: McpServerId): Record<string, unknown> {
  const policy = mcpPolicyForServer(config, serverId);
  if (!policy) {
    return {
      kind: "missing-policy",
      state: "blocked-by-policy",
      allowToolsList: false,
      allowReadOnlyToolCall: false,
      agentReadOnlyTools: [],
      configFingerprint: mcpPolicyFingerprint(config)
    };
  }
  return {
    kind: policy.kind,
    source: policy.source,
    state: policy.allowToolsList || policy.allowReadOnlyToolCall || policy.kind === "rest-adapter-readback" ? "allowed-now" : "blocked-by-policy",
    protocolReadiness: policy.protocolReadiness,
    requiredTrust: requiredTrustForPolicy(policy),
    allowToolsList: policy.allowToolsList,
    allowReadOnlyToolCall: policy.allowReadOnlyToolCall,
    requireExplicitServerSelection: policy.requireExplicitServerSelection,
    agentReadOnlyTools: normalizeMcpToolNames(policy.agentReadOnlyTools),
    requireReadOnlyToolContracts: Boolean(policy.requireReadOnlyToolContracts),
    toolContracts: Object.fromEntries(Object.entries(policy.toolContracts ?? {}).map(([toolName, contract]) => [toolName, {
      fingerprint: contract.fingerprint,
      endpoint: contract.endpoint,
      protocolVersion: contract.protocolVersion,
      serverInfoName: contract.serverInfoName,
      serverInfoVersion: contract.serverInfoVersion,
      inputSchemaSha256: contract.inputSchemaSha256,
      annotationsSha256: contract.annotationsSha256,
      capturedAt: contract.capturedAt
    }])),
    protocolToolCallProbe: policy.protocolToolCallProbe,
    configFingerprint: mcpPolicyFingerprint(config)
  };
}

function deriveMcpServerPolicy(
  server: McpServerRuntimeConfig,
  inherited?: Partial<McpServerPolicy>
): McpServerPolicy {
  const protocolReadiness = server.custom
    ? (inherited?.protocolReadiness ?? server.protocolReadiness ?? (server.kind === "mcp-server" ? "tools/list" : "not-applicable"))
    : (server.protocolReadiness ?? inherited?.protocolReadiness ?? (server.kind === "mcp-server" ? "tools/list" : "not-applicable"));
  const protocolToolCallProbe = inherited?.protocolToolCallProbe ?? server.protocolToolCallProbe;
  const agentReadOnlyTools = normalizeMcpToolNames(
    inherited && "agentReadOnlyTools" in inherited
      ? inherited.agentReadOnlyTools ?? []
      : server.agentReadOnlyTools ?? []
  );
  const toolContracts = normalizeMcpToolContracts(inherited?.toolContracts);
  const kind = server.kind !== "mcp-server"
    ? "rest-adapter-readback"
    : protocolReadiness === "tools/call"
      ? "read-only-probe"
      : agentReadOnlyTools.length > 0
        ? "read-only-allowlist"
        : "protocol-tools-list";
  return {
    kind,
    source: inherited?.source ?? (server.custom ? "custom" : "built-in"),
    protocolReadiness,
    protocolToolCallProbe,
    allowToolsList: server.kind === "mcp-server" && protocolReadiness !== "not-applicable",
    allowReadOnlyToolCall: server.kind === "mcp-server" && agentReadOnlyTools.length > 0,
    requireExplicitServerSelection: inherited?.requireExplicitServerSelection ?? true,
    agentReadOnlyTools,
    requireReadOnlyToolContracts: inherited?.requireReadOnlyToolContracts ?? false,
    toolContracts
  };
}

function requiredTrustForPolicy(policy: McpServerPolicy): McpPolicyRequiredTrust {
  switch (policy.kind) {
    case "rest-adapter-readback":
      return "adapter-ready:credential-probe";
    case "read-only-probe":
      return "protocol-ready:protocol-tool-call";
    case "protocol-tools-list":
    case "read-only-allowlist":
      return "protocol-ready:protocol-tools-list";
    default:
      return "unverified:none";
  }
}

function requiredToolsForPolicy(policy: McpServerPolicy): string[] {
  if (policy.kind === "rest-adapter-readback" || policy.kind === "protocol-tools-list") {
    return [];
  }
  if (policy.kind === "read-only-probe" && policy.protocolToolCallProbe?.toolName) {
    return [policy.protocolToolCallProbe.toolName];
  }
  return normalizeMcpToolNames(policy.agentReadOnlyTools);
}

function isTrustSatisfied(requiredTrust: McpPolicyRequiredTrust, check: ConnectionCheck): boolean {
  const mode = check.readiness?.mode ?? "unverified";
  const stage = check.readiness?.provenStage ?? "none";
  switch (requiredTrust) {
    case "adapter-ready:credential-probe":
      return stage === "credential-probe" || stage === "protocol-tools-list" || stage === "protocol-tool-call";
    case "protocol-ready:protocol-tools-list":
      return mode === "protocol-ready" && (stage === "protocol-tools-list" || stage === "protocol-tool-call");
    case "protocol-ready:protocol-tool-call":
      return mode === "protocol-ready" && stage === "protocol-tool-call";
    default:
      return false;
  }
}

function policyRuntimeState(
  policy: McpServerPolicy,
  check: ConnectionCheck,
  trustSatisfied: boolean,
  missingTools: string[]
): McpPolicyRuntimeState {
  if (missingTools.length > 0 || !policy.allowToolsList && policy.kind !== "rest-adapter-readback") {
    return "blocked-by-policy";
  }
  if (check.status === "passed" && trustSatisfied) {
    return "proved-now";
  }
  if (check.status === "skipped") {
    return "unverified";
  }
  return policy.allowReadOnlyToolCall || policy.kind === "rest-adapter-readback" ? "allowed-now" : "unverified";
}

function actualTrust(check: ConnectionCheck): McpPolicyRequiredTrust | `${string}:${string}` {
  return `${check.readiness?.mode ?? "unverified"}:${check.readiness?.provenStage ?? "none"}`;
}

function normalizeMcpToolNames(values: Array<string | undefined>): string[] {
  const tools = new Set<string>();
  for (const value of values) {
    for (const part of (value ?? "").split(",")) {
      const toolName = part.trim();
      if (toolName) {
        tools.add(toolName);
      }
    }
  }
  return [...tools].sort();
}

function normalizeMcpToolContracts(value: unknown): Record<string, McpReadOnlyToolContract> {
  if (!value || typeof value !== "object") {
    return {};
  }
  const contracts: Record<string, McpReadOnlyToolContract> = {};
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const item = raw as Partial<McpReadOnlyToolContract>;
    if (
      item.version !== "mcp-read-only-tool-v1"
      || typeof item.toolName !== "string"
      || typeof item.fingerprint !== "string"
      || typeof item.endpoint !== "string"
      || typeof item.protocolVersion !== "string"
      || typeof item.inputSchemaSha256 !== "string"
      || typeof item.annotationsSha256 !== "string"
      || typeof item.capturedAt !== "string"
    ) {
      continue;
    }
    contracts[name] = {
      version: "mcp-read-only-tool-v1",
      toolName: item.toolName,
      fingerprint: item.fingerprint,
      endpoint: item.endpoint,
      authMode: item.authMode ?? "none",
      authEnvKey: item.authEnvKey,
      protocolVersion: item.protocolVersion,
      serverInfoName: item.serverInfoName,
      serverInfoVersion: item.serverInfoVersion,
      inputSchemaSha256: item.inputSchemaSha256,
      annotationsSha256: item.annotationsSha256,
      capturedAt: item.capturedAt
    };
  }
  return contracts;
}

function createMcpReadOnlyToolContract(
  server: McpServerRuntimeConfig,
  session: McpHttpSession,
  tool: McpToolSummary,
  capturedAt: string
): McpReadOnlyToolContract {
  const serverInfo = mcpServerInfo(session.serverInfo);
  const endpoint = mcpEndpointIdentity(server.url ?? session.endpoint);
  const authMode = server.authMode ?? "none";
  const inputSchemaSha256 = sha256(stableJson(tool.inputSchema ?? null));
  const annotationsSha256 = sha256(stableJson(tool.annotations ?? null));
  const canonical = {
    version: "mcp-read-only-tool-v1",
    toolName: tool.name,
    endpoint,
    authMode,
    authEnvKey: server.authEnvKey,
    protocolVersion: session.protocolVersion,
    serverInfoName: serverInfo.name,
    serverInfoVersion: serverInfo.version,
    inputSchemaSha256,
    annotationsSha256
  } as const;
  return {
    ...canonical,
    fingerprint: sha256(stableJson(canonical)).slice(0, 24),
    capturedAt
  };
}

function mcpEndpointIdentity(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    const keys = [...url.searchParams.keys()].sort();
    url.search = "";
    for (const key of keys) {
      url.searchParams.append(key, "<redacted>");
    }
    return url.toString();
  } catch {
    return value;
  }
}

function mcpServerInfo(value: unknown): { name?: string; version?: string } {
  if (!value || typeof value !== "object") {
    return {};
  }
  const record = value as Record<string, unknown>;
  return {
    name: typeof record.name === "string" ? record.name : undefined,
    version: typeof record.version === "string" ? record.version : undefined
  };
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortStable(value));
}

function sortStable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortStable);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortStable(nested)])
    );
  }
  return value;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
