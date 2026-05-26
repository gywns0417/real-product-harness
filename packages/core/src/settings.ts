import crypto from "node:crypto";
import fs from "node:fs";
import {
  MCP_SERVER_CONTRACTS,
  type McpConfig,
  type McpServerAuthMode,
  type McpServerConfig,
  type McpServerContract
} from "../../integrations/src/mcp";
import { ensureDir, readJsonIfExists, writeJson } from "./fs";
import {
  applyMcpPolicyRegistryToServers,
  attachMcpPolicyEvaluation,
  buildMcpPolicyRegistry,
  captureMcpReadOnlyToolContracts,
  mcpPolicyForServer,
  normalizeHarnessMcpPolicy
} from "./mcp-policy";
import { listMcpTools, type McpToolsListResult, type McpToolSummary } from "./mcp-client";
import { connectionReportFile, harnessConfigFile } from "./paths";
import { recordConnectionProofEvents } from "./proof-ledger";
import { nowIso } from "./time";
import {
  AiProviderConfig,
  AiProviderId,
  ConnectionCheck,
  ConnectionReportProvenance,
  HarnessConfig,
  McpServerId,
  McpServerRuntimeConfig,
  SetupChoices
} from "./types";

interface ProviderDefinition {
  id: AiProviderId;
  name: string;
  envKeys: string[];
  modelEnv: string;
  defaultModel: string;
  baseUrlEnv: string;
  defaultBaseUrl: string;
  testEndpoint: string;
}

type McpDefinition = McpServerContract & {
  defaultEnabled?: boolean;
};

export interface CustomProtocolMcpServerInput {
  id: string;
  name?: string;
  url: string;
  authMode?: McpServerAuthMode;
  authEnvKey?: string;
  protocolToolCallProbe?: {
    toolName: string;
    arguments?: Record<string, unknown>;
  };
  agentReadOnlyTools?: string[];
  enabled?: boolean;
}

export interface PersistedConfigRepairSummary {
  changed: boolean;
  harnessChanged: boolean;
  mcpChanged: boolean;
  migratedServers: string[];
  notes: string[];
}

export interface McpReadOnlyToolContractBindingResult {
  config: HarnessConfig;
  boundTools: string[];
  missingTools: string[];
}

export interface AutoBindMcpReadOnlyToolContractsResult extends McpReadOnlyToolContractBindingResult {
  autoSelectedTools: string[];
  skippedReason?: string;
}

export const CONNECTION_REPORT_TRUST_MAX_AGE_MS = 30 * 60 * 1000;

export interface NormalizedGitHubRepoTarget {
  owner?: string;
  repo?: string;
  slug?: string;
  configured: boolean;
  missingEnv: string[];
  warnings: string[];
}

export const AI_PROVIDER_DEFINITIONS: Record<AiProviderId, ProviderDefinition> = {
  openai: {
    id: "openai",
    name: "OpenAI",
    envKeys: ["OPENAI_API_KEY"],
    modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-5.4",
    baseUrlEnv: "OPENAI_BASE_URL",
    defaultBaseUrl: "https://api.openai.com/v1",
    testEndpoint: "https://api.openai.com/v1/models"
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic Claude",
    envKeys: ["ANTHROPIC_API_KEY"],
    modelEnv: "ANTHROPIC_MODEL",
    defaultModel: "claude-sonnet-4-5",
    baseUrlEnv: "ANTHROPIC_BASE_URL",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    testEndpoint: "https://api.anthropic.com/v1/models"
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    envKeys: ["GEMINI_API_KEY"],
    modelEnv: "GEMINI_MODEL",
    defaultModel: "gemini-2.5-flash",
    baseUrlEnv: "GEMINI_BASE_URL",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    testEndpoint: "https://generativelanguage.googleapis.com/v1beta/models"
  },
  local: {
    id: "local",
    name: "Local model",
    envKeys: ["LOCAL_AI_BASE_URL"],
    modelEnv: "LOCAL_AI_MODEL",
    defaultModel: "local",
    baseUrlEnv: "LOCAL_AI_BASE_URL",
    defaultBaseUrl: "http://127.0.0.1:11434",
    testEndpoint: "http://127.0.0.1:11434/api/tags"
  }
};

export const MCP_SERVER_DEFINITIONS = MCP_SERVER_CONTRACTS as Record<string, McpDefinition>;
export const BUILT_IN_MCP_SERVER_IDS = Object.keys(MCP_SERVER_CONTRACTS);

export function createHarnessConfig(
  env: NodeJS.ProcessEnv = process.env,
  setupChoices?: SetupChoices,
  previous?: HarnessConfig,
  existingMcpConfig?: McpConfig
): HarnessConfig {
  const now = nowIso();
  const aiProviders = mapRecord(AI_PROVIDER_DEFINITIONS, (definition) => buildAiProviderConfig(definition, env, previous));
  const mcpDefinitions = mergeMcpDefinitions(previous, existingMcpConfig);
  const mcpServers = mapRecord(mcpDefinitions, (definition) => buildMcpServerConfig(definition, env, setupChoices, previous));
  const mcpPolicyRegistry = buildMcpPolicyRegistry(
    mcpServers,
    previous?.mcpPolicyRegistry
  );
  applyMcpPolicyRegistryToServers(mcpServers, mcpPolicyRegistry);
  return {
    version: 1,
    activeAiProvider: resolveActiveAiProvider(env, setupChoices, previous, aiProviders),
    aiProviders,
    mcpServers,
    mcpPolicyRegistry,
    deployment: setupChoices?.deployment ?? previous?.deployment ?? "later",
    stack: setupChoices?.stack ?? previous?.stack ?? "recommended",
    custom: previous?.custom ?? {},
    ui: previous?.ui ?? {
      theme: "hacker",
      color: true,
      bootAnimation: true
    },
    updatedAt: now
  };
}

export function initializeHarnessConfig(projectRoot: string, setupChoices?: SetupChoices): HarnessConfig {
  const config = createHarnessConfig(process.env, setupChoices, undefined, readProjectMcpConfig(projectRoot));
  saveHarnessConfig(projectRoot, config);
  writeProjectMcpConfig(projectRoot, config);
  return config;
}

export function loadHarnessConfig(projectRoot: string): HarnessConfig {
  const configPath = harnessConfigFile(projectRoot);
  const fallback = createHarnessConfig(process.env);
  return normalizeHarnessMcpPolicy(readJsonIfExists<HarnessConfig>(configPath, fallback));
}

export function readHarnessConfigSnapshot(
  projectRoot: string,
  env: NodeJS.ProcessEnv = process.env
): HarnessConfig {
  const previous = fs.existsSync(harnessConfigFile(projectRoot))
    ? loadHarnessConfig(projectRoot)
    : undefined;
  return createHarnessConfig(env, undefined, previous, readProjectMcpConfig(projectRoot));
}

export function saveHarnessConfig(projectRoot: string, config: HarnessConfig): void {
  writeJson(harnessConfigFile(projectRoot), { ...normalizeHarnessMcpPolicy(config), updatedAt: nowIso() });
}

export function syncHarnessConfigFromEnv(projectRoot: string): HarnessConfig {
  const config = readHarnessConfigSnapshot(projectRoot);
  saveHarnessConfig(projectRoot, config);
  writeProjectMcpConfig(projectRoot, config);
  return config;
}

export function repairPersistedConfigDrift(
  projectRoot: string,
  env: NodeJS.ProcessEnv = process.env
): PersistedConfigRepairSummary {
  const configPath = harnessConfigFile(projectRoot);
  const hasHarnessConfig = fs.existsSync(configPath);
  const mcpPath = projectMcpConfigPath(projectRoot);
  const hasProjectMcpConfig = fs.existsSync(mcpPath);
  if (!hasHarnessConfig && !hasProjectMcpConfig) {
    return emptyPersistedConfigRepairSummary();
  }

  const previous = hasHarnessConfig
    ? normalizeHarnessMcpPolicy(readJsonIfExists<HarnessConfig>(configPath, createHarnessConfig(env)))
    : undefined;
  const existingMcpConfig = readProjectMcpConfig(projectRoot);
  const next = createHarnessConfig(env, undefined, previous, existingMcpConfig);
  const nextMcpConfig = projectMcpConfigFromHarnessConfig(next);
  const harnessChanged = previous
    ? stableStringify(comparableHarnessConfig(previous)) !== stableStringify(comparableHarnessConfig(next))
    : hasHarnessConfig;
  const mcpChanged = stableStringify(existingMcpConfig ?? null) !== stableStringify(nextMcpConfig);
  const migratedServers = migratedBuiltInMcpServers(previous, existingMcpConfig, next, nextMcpConfig);
  const notes: string[] = [];
  if (migratedServers.length > 0) {
    notes.push(`canonicalized built-in MCP contract: ${migratedServers.join(",")}`);
  }
  if (!hasProjectMcpConfig && mcpChanged) {
    notes.push("created missing .mcp/config.json from harness config");
  }
  if (harnessChanged && migratedServers.length === 0) {
    notes.push("refreshed .rph/config.json from current environment and policy registry");
  }
  if (mcpChanged && migratedServers.length === 0 && hasProjectMcpConfig) {
    notes.push("refreshed .mcp/config.json from current harness policy registry");
  }

  if (harnessChanged && hasHarnessConfig) {
    saveHarnessConfig(projectRoot, next);
  }
  if (mcpChanged) {
    writeJson(mcpPath, nextMcpConfig);
  }

  return {
    changed: harnessChanged || mcpChanged,
    harnessChanged,
    mcpChanged,
    migratedServers,
    notes
  };
}

export function setHarnessConfigValue(projectRoot: string, key: string, value: string): HarnessConfig {
  const config = loadHarnessConfig(projectRoot);
  switch (key) {
    case "ai.active":
    case "activeAiProvider":
      config.activeAiProvider = parseActiveAiProvider(value);
      break;
    case "ui.theme":
      config.ui.theme = parseTheme(value);
      break;
    case "ui.color":
      config.ui.color = parseBoolean(value);
      break;
    case "ui.bootAnimation":
      config.ui.bootAnimation = parseBoolean(value);
      break;
    case "deployment":
      config.deployment = value as SetupChoices["deployment"];
      break;
    case "stack":
      config.stack = value as SetupChoices["stack"];
      break;
    default:
      config.custom[key] = value;
      break;
  }
  saveHarnessConfig(projectRoot, config);
  return config;
}

export function setMcpServerEnabled(projectRoot: string, serverId: McpServerId, enabled: boolean): HarnessConfig {
  const config = loadHarnessConfig(projectRoot);
  if (!config.mcpServers[serverId]) {
    throw new Error(`unknown MCP server: ${serverId}`);
  }
  config.mcpServers[serverId].enabled = enabled;
  saveHarnessConfig(projectRoot, config);
  writeProjectMcpConfig(projectRoot, config);
  return config;
}

export function addCustomProtocolMcpServer(
  projectRoot: string,
  input: CustomProtocolMcpServerInput,
  env: NodeJS.ProcessEnv = process.env
): HarnessConfig {
  const id = normalizeCustomMcpServerId(input.id);
  if (BUILT_IN_MCP_SERVER_IDS.includes(id)) {
    throw new Error(`cannot add custom MCP server over built-in id: ${id}`);
  }
  const url = normalizeProtocolMcpUrl(input.url);
  const authMode = input.authMode ?? "bearer";
  const authEnvKey = authMode === "none" ? undefined : (input.authEnvKey ?? `${envKeyPrefix(id)}_MCP_TOKEN`);
  const envKeys = authEnvKey ? [authEnvKey] : [];
  const missingEnv = missingEnvKeys(env, envKeys);
  const existing = readHarnessConfigSnapshot(projectRoot, env);
  const agentReadOnlyTools = normalizeAgentReadOnlyTools([
    ...(input.agentReadOnlyTools ?? []),
    input.protocolToolCallProbe?.toolName
  ]);
  existing.mcpServers[id] = {
    id,
    name: input.name?.trim() || `${id} MCP server`,
    kind: "mcp-server",
    enabled: input.enabled ?? missingEnv.length === 0,
    configured: missingEnv.length === 0,
    transport: "http",
    url,
    authMode,
    authEnvKey,
    protocolReadiness: input.protocolToolCallProbe ? "tools/call" : "tools/list",
    protocolToolCallProbe: input.protocolToolCallProbe,
    agentReadOnlyTools,
    custom: true,
    envKeys,
    missingEnv,
    warnings: [],
    notes: input.protocolToolCallProbe
      ? "Custom protocol MCP server. Readiness proves initialize, tools/list, and a configured read-only tools/call probe."
      : "Custom protocol MCP server. Readiness proves initialize and tools/list."
  };
  existing.mcpPolicyRegistry = buildMcpPolicyRegistry(existing.mcpServers, existing.mcpPolicyRegistry);
  applyMcpPolicyRegistryToServers(existing.mcpServers, existing.mcpPolicyRegistry);
  saveHarnessConfig(projectRoot, existing);
  writeProjectMcpConfig(projectRoot, existing);
  return existing;
}

export async function bindMcpReadOnlyToolContracts(
  projectRoot: string,
  serverId: McpServerId,
  env: NodeJS.ProcessEnv = process.env
): Promise<McpReadOnlyToolContractBindingResult> {
  const existing = readHarnessConfigSnapshot(projectRoot, env);
  const server = existing.mcpServers[serverId];
  if (!server) {
    throw new Error(`MCP server not found: ${serverId}`);
  }
  if (server.kind !== "mcp-server" || server.transport !== "http" || !server.url) {
    throw new Error(`${serverId} is not an HTTP protocol MCP server; read-only tool contracts only apply to protocol MCP tools.`);
  }
  const policy = mcpPolicyForServer(existing, serverId);
  const allowedTools = policy?.agentReadOnlyTools ?? server.agentReadOnlyTools ?? [];
  if (allowedTools.length === 0) {
    throw new Error(`${serverId} has no read-only allowlist to bind; configure --allow-tool or --probe-tool first.`);
  }
  const result = await listMcpTools({
    endpoint: server.url,
    headers: protocolMcpHeadersForRuntime(env, server, serverId)
  });
  return bindMcpReadOnlyToolContractsFromList(projectRoot, existing, serverId, allowedTools, result);
}

export async function autoBindMcpReadOnlyToolContracts(
  projectRoot: string,
  serverId: McpServerId,
  env: NodeJS.ProcessEnv = process.env
): Promise<AutoBindMcpReadOnlyToolContractsResult> {
  const existing = readHarnessConfigSnapshot(projectRoot, env);
  const server = existing.mcpServers[serverId];
  if (!server) {
    throw new Error(`MCP server not found: ${serverId}`);
  }
  if (server.kind !== "mcp-server" || server.transport !== "http" || !server.url) {
    return skippedAutoBind(existing, "not an HTTP protocol MCP server");
  }
  const policy = mcpPolicyForServer(existing, serverId);
  const allowedTools = policy?.agentReadOnlyTools ?? server.agentReadOnlyTools ?? [];
  if (allowedTools.length > 0) {
    return {
      ...await bindMcpReadOnlyToolContracts(projectRoot, serverId, env),
      autoSelectedTools: []
    };
  }
  if (!server.custom || (policy?.protocolReadiness ?? server.protocolReadiness) !== "tools/list") {
    return skippedAutoBind(existing, "only custom tools/list MCP servers without an allowlist can be auto-bound");
  }
  const result = await listMcpTools({
    endpoint: server.url,
    headers: protocolMcpHeadersForRuntime(env, server, serverId)
  });
  const candidates = autoBindableReadOnlyToolNames(result.tools);
  if (candidates.length === 0) {
    return skippedAutoBind(existing, "no read-only no-arg tool was advertised by tools/list");
  }
  if (candidates.length > 1) {
    return skippedAutoBind(existing, `multiple read-only no-arg tools advertised: ${candidates.join(",")}`);
  }
  const binding = bindMcpReadOnlyToolContractsFromList(projectRoot, existing, serverId, candidates, result);
  return {
    ...binding,
    autoSelectedTools: candidates
  };
}

function bindMcpReadOnlyToolContractsFromList(
  projectRoot: string,
  existing: HarnessConfig,
  serverId: McpServerId,
  allowedToolsInput: string[],
  result: McpToolsListResult
): McpReadOnlyToolContractBindingResult {
  const server = existing.mcpServers[serverId];
  if (!server) {
    throw new Error(`MCP server not found: ${serverId}`);
  }
  const allowedTools = normalizeAgentReadOnlyTools(allowedToolsInput);
  if (allowedTools.length === 0) {
    throw new Error(`${serverId} has no read-only allowlist to bind; configure --allow-tool or --probe-tool first.`);
  }
  const policy = mcpPolicyForServer(existing, serverId);
  const contracts = captureMcpReadOnlyToolContracts(server, result.session, result.tools, allowedTools);
  const boundTools = Object.keys(contracts).sort();
  const missingTools = allowedTools.filter((tool) => !contracts[tool]).sort();
  server.agentReadOnlyTools = boundTools;
  existing.mcpPolicyRegistry.servers[serverId] = {
    ...(policy ?? {
      kind: "read-only-allowlist",
      source: server.custom ? "custom" : "built-in",
      protocolReadiness: server.protocolReadiness ?? "tools/list",
      allowToolsList: true,
      allowReadOnlyToolCall: true,
      requireExplicitServerSelection: true,
      agentReadOnlyTools: allowedTools
    }),
    agentReadOnlyTools: boundTools,
    allowReadOnlyToolCall: boundTools.length > 0,
    requireReadOnlyToolContracts: boundTools.length > 0,
    toolContracts: {
      ...Object.fromEntries(Object.entries(policy?.toolContracts ?? {}).filter(([toolName]) => boundTools.includes(toolName))),
      ...contracts
    }
  };
  existing.mcpPolicyRegistry = buildMcpPolicyRegistry(existing.mcpServers, existing.mcpPolicyRegistry);
  applyMcpPolicyRegistryToServers(existing.mcpServers, existing.mcpPolicyRegistry);
  saveHarnessConfig(projectRoot, existing);
  writeProjectMcpConfig(projectRoot, existing);
  return { config: existing, boundTools, missingTools };
}

function skippedAutoBind(config: HarnessConfig, skippedReason: string): AutoBindMcpReadOnlyToolContractsResult {
  return {
    config,
    boundTools: [],
    missingTools: [],
    autoSelectedTools: [],
    skippedReason
  };
}

function autoBindableReadOnlyToolNames(tools: McpToolSummary[]): string[] {
  return tools
    .filter((tool) => isAutoBindableReadOnlyTool(tool))
    .map((tool) => tool.name)
    .sort();
}

function isAutoBindableReadOnlyTool(tool: McpToolSummary): boolean {
  const annotations = tool.annotations && typeof tool.annotations === "object"
    ? tool.annotations as Record<string, unknown>
    : {};
  return annotations.readOnlyHint === true
    && annotations.destructiveHint !== true
    && inputSchemaAcceptsEmptyObject(tool.inputSchema);
}

function inputSchemaAcceptsEmptyObject(inputSchema: unknown): boolean {
  if (inputSchema === undefined || inputSchema === null) {
    return true;
  }
  if (typeof inputSchema !== "object" || Array.isArray(inputSchema)) {
    return false;
  }
  const required = (inputSchema as Record<string, unknown>).required;
  return !Array.isArray(required) || required.length === 0;
}

function protocolMcpHeadersForRuntime(
  env: NodeJS.ProcessEnv,
  server: McpServerRuntimeConfig,
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
      throw new Error(`${serverId} uses unsupported MCP auth mode ${String(mode)}.`);
  }
}

export function setAiProviderEnabled(projectRoot: string, providerId: AiProviderId, enabled: boolean): HarnessConfig {
  const config = loadHarnessConfig(projectRoot);
  config.aiProviders[providerId].enabled = enabled;
  if (enabled) {
    config.activeAiProvider = providerId;
  }
  saveHarnessConfig(projectRoot, config);
  return config;
}

export function enabledMcpServers(config: HarnessConfig): string[] {
  return Object.values(config.mcpServers)
    .filter((server) => server.enabled && server.configured)
    .map((server) => server.id);
}

export function writeConnectionReport(
  projectRoot: string,
  checks: ConnectionCheck[],
  provenance?: Partial<ConnectionReportProvenance>
): string {
  const filePath = connectionReportFile(projectRoot);
  const config = fs.existsSync(harnessConfigFile(projectRoot)) ? loadHarnessConfig(projectRoot) : undefined;
  const checksWithPolicy = config
    ? checks.map((check) => attachMcpPolicyEvaluation(config, check))
    : checks;
  const checkedAt = nowIso();
  writeJson(filePath, {
    checkedAt,
    provenance: buildConnectionReportProvenance(projectRoot, checksWithPolicy, checkedAt, provenance, config),
    onboardingProof: buildOnboardingProof(checksWithPolicy),
    checks: checksWithPolicy
  });
  recordConnectionProofEvents(projectRoot, checksWithPolicy, filePath);
  return filePath;
}

export function readTrustedConnectionChecks(projectRoot: string, checkedAt = new Date()): ConnectionCheck[] {
  const report = readConnectionReport(projectRoot);
  if (!report) {
    return [];
  }
  const config = readHarnessConfigSnapshot(projectRoot);
  const trust = connectionReportTrust(projectRoot, report, checkedAt, config);
  return trust.trusted
    ? report.checks.map((check) => attachMcpPolicyEvaluation(config, { ...check, policy: undefined }))
    : [];
}

export function readConnectionReportTrust(
  projectRoot: string,
  checkedAt = new Date()
): { trusted: boolean; reason?: "missing-report" | "non-live-source" | "missing-fingerprint" | "config-mismatch" | "stale-report" | "invalid-date"; ageMs?: number } {
  const report = readConnectionReport(projectRoot);
  if (!report) {
    return { trusted: false, reason: "missing-report" };
  }
  return connectionReportTrust(projectRoot, report, checkedAt);
}

export function connectionReportConfigFingerprint(config: HarnessConfig): string {
  return crypto
    .createHash("sha256")
    .update(stableStringify({
      version: config.version,
      activeAiProvider: config.activeAiProvider,
      aiProviders: Object.fromEntries(Object.values(config.aiProviders)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((provider) => [provider.id, {
          enabled: provider.enabled,
          configured: provider.configured,
          model: provider.model,
          baseUrl: sanitizeUrlForFingerprint(provider.baseUrl),
          testEndpoint: sanitizeUrlForFingerprint(provider.testEndpoint),
          missingEnv: [...provider.missingEnv].sort()
        }])),
      mcpServers: Object.fromEntries(Object.values(config.mcpServers)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((server) => [server.id, {
          enabled: server.enabled,
          configured: server.configured,
          kind: server.kind,
          transport: server.transport,
          url: sanitizeUrlForFingerprint(server.url),
          authMode: server.authMode,
          authEnvKey: server.authEnvKey,
          protocolReadiness: server.protocolReadiness,
          protocolToolCallProbe: server.protocolToolCallProbe,
          agentReadOnlyTools: [...(server.agentReadOnlyTools ?? [])].sort(),
          custom: server.custom === true,
          envKeys: [...server.envKeys].sort(),
          missingEnv: [...server.missingEnv].sort()
        }])),
      mcpPolicyRegistry: config.mcpPolicyRegistry,
      deployment: config.deployment,
      stack: config.stack,
      customKeys: Object.keys(config.custom).sort(),
      ui: config.ui
    }))
    .digest("hex")
    .slice(0, 16);
}

function buildConnectionReportProvenance(
  projectRoot: string,
  checks: ConnectionCheck[],
  generatedAt: string,
  input: Partial<ConnectionReportProvenance> = {},
  config?: HarnessConfig
): ConnectionReportProvenance {
  const reportConfig = config ?? (fs.existsSync(harnessConfigFile(projectRoot)) ? loadHarnessConfig(projectRoot) : readHarnessConfigSnapshot(projectRoot));
  return {
    source: normalizeConnectionReportSource(input.source ?? process.env.RPH_CONNECTION_PROOF_SOURCE),
    runner: input.runner ?? normalizeConnectionReportRunner(process.env.RPH_CONNECTION_PROOF_RUNNER),
    command: input.command ?? renderConnectionReportCommand(),
    projectInitialized: input.projectInitialized ?? fs.existsSync(harnessConfigFile(projectRoot)),
    selectedTargets: input.selectedTargets ?? checks.map((check) => `${check.kind}:${check.id}`),
    checkedTargetCount: input.checkedTargetCount ?? checks.length,
    configFingerprint: input.configFingerprint ?? connectionReportConfigFingerprint(reportConfig),
    generatedAt
  };
}

export function readConnectionReport(projectRoot: string): { checkedAt?: string; provenance?: Partial<ConnectionReportProvenance>; checks: ConnectionCheck[] } | null {
  const filePath = connectionReportFile(projectRoot);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const report = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
      checkedAt?: unknown;
      provenance?: Partial<ConnectionReportProvenance>;
      checks?: unknown;
    };
    return {
      checkedAt: typeof report.checkedAt === "string" ? report.checkedAt : undefined,
      provenance: report.provenance,
      checks: Array.isArray(report.checks) ? report.checks.filter(isConnectionCheckLike) : []
    };
  } catch {
    return null;
  }
}

function connectionReportTrust(
  projectRoot: string,
  report: { checkedAt?: string; provenance?: Partial<ConnectionReportProvenance>; checks: ConnectionCheck[] },
  checkedAt: Date,
  config: HarnessConfig = readHarnessConfigSnapshot(projectRoot)
): { trusted: boolean; reason?: "non-live-source" | "missing-fingerprint" | "config-mismatch" | "stale-report" | "invalid-date"; ageMs?: number } {
  if (report.provenance?.source !== "live") {
    return { trusted: false, reason: "non-live-source" };
  }
  const expectedFingerprint = connectionReportConfigFingerprint(config);
  if (!report.provenance.configFingerprint) {
    return { trusted: false, reason: "missing-fingerprint" };
  }
  if (report.provenance.configFingerprint !== expectedFingerprint) {
    return { trusted: false, reason: "config-mismatch" };
  }
  const reportAt = Date.parse(report.provenance.generatedAt ?? report.checkedAt ?? "");
  if (Number.isNaN(reportAt)) {
    return { trusted: false, reason: "invalid-date" };
  }
  const ageMs = checkedAt.getTime() - reportAt;
  if (ageMs > CONNECTION_REPORT_TRUST_MAX_AGE_MS) {
    return { trusted: false, reason: "stale-report", ageMs };
  }
  return { trusted: true, ageMs };
}

function isConnectionCheckLike(value: unknown): value is ConnectionCheck {
  return value !== null
    && typeof value === "object"
    && typeof (value as { id?: unknown }).id === "string"
    && typeof (value as { kind?: unknown }).kind === "string"
    && typeof (value as { status?: unknown }).status === "string"
    && ["ai", "mcp", "env", "runtime"].includes((value as { kind: string }).kind)
    && ["passed", "failed", "skipped"].includes((value as { status: string }).status);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sanitizeUrlForFingerprint(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return value.split(/[?#]/)[0];
  }
}

function normalizeConnectionReportSource(value: unknown): ConnectionReportProvenance["source"] {
  return value === "mock" || value === "imported" ? value : "live";
}

function normalizeConnectionReportRunner(value: unknown): ConnectionReportProvenance["runner"] {
  return value === "script" || value === "test" || value === "cli" ? value : "cli";
}

function renderConnectionReportCommand(): string {
  const [, entry, ...args] = process.argv;
  const commandName = entry ? (entry.endsWith("index.js") ? "rph" : entry.split(/[\\/]/).pop() ?? entry) : "unknown";
  return [commandName, ...args].filter(Boolean).join(" ");
}

function buildOnboardingProof(checks: ConnectionCheck[]): Array<Record<string, unknown>> {
  return checks.map((check) => {
    const mcpContract = check.kind === "mcp"
      ? (MCP_SERVER_CONTRACTS as Record<string, McpDefinition>)[check.id]
      : undefined;
    const readinessMode = check.readiness?.mode ?? "unverified";
    const provenStage = check.readiness?.provenStage ?? "none";
    const credentialStage = check.readiness?.stages.find((stage) => stage.stage === "credential-probe")?.status ?? "skipped";
    const protocolStage = check.readiness?.stages.find((stage) => stage.stage === "protocol-tools-list" || stage.stage === "protocol-tool-call")?.status ?? "not-applicable";
    const protocolKind = mcpContract?.kind ?? (check.identity?.type === "mcp-server" ? "mcp-server" : check.kind === "ai" ? "ai-provider" : "unknown");
    const policy = check.policy;
    const protocolApplicable = check.kind === "ai"
      || policy?.allowToolsList === true
      || mcpContract?.protocolReadiness !== "not-applicable"
      || check.identity?.type === "mcp-server"
      || check.firstActionProof?.action === "mcp.tools.list";
    return {
      kind: check.kind,
      id: check.id,
      captured: check.missingEnv.length === 0,
      verified: check.status === "passed",
      status: check.status,
      trustCategory: readinessMode,
      requiredEnv: check.requiredEnv,
      missingEnv: check.missingEnv,
      identity: check.identity,
      firstActionProof: check.firstActionProof,
      provenStage,
      protocolKind,
      protocolApplicable,
      policy,
      proof: {
        readinessMode,
        provenStage,
        credentialStage,
        protocolStage,
        endpoint: check.endpoint
      },
      checkedAt: check.checkedAt
    };
  });
}

export function configuredAiProviders(config: HarnessConfig): AiProviderConfig[] {
  return Object.values(config.aiProviders).filter((provider) => provider.enabled && provider.configured);
}

export function configuredMcpServers(config: HarnessConfig): McpServerRuntimeConfig[] {
  return Object.values(config.mcpServers).filter((server) => server.enabled && server.configured);
}

export function renderSetupGuide(config: HarnessConfig): string {
  const activeProvider = resolveGuideActiveProvider(config);
  const readyAi = Object.values(config.aiProviders).filter((provider) => provider.configured);
  const readyMcp = Object.values(config.mcpServers).filter((server) => server.configured);
  return [
    "RPH Setup Assistant",
    "",
    "목표",
    "- 일반 텍스트 입력은 연결된 AI agent와 대화합니다.",
    "- /pm start 같은 slash command는 workflow 상태를 제어합니다.",
    "- 프로젝트 범위 비밀값은 .env에만 두고, .rph/config.json에는 상태와 env key 이름만 저장합니다.",
    "- GitHub는 GITHUB_TOKEN 대신 GITHUB_TOKEN_SOURCE=gh-cli로 기존 gh 로그인을 사용할 수 있습니다.",
    "",
    "바로 다음 행동",
    `- ${setupGuidePrimaryAction(config)}`,
    `- ${setupGuidePrimaryReason(config)}`,
    "",
    "1. AI agent 연결",
    ...Object.values(config.aiProviders).map((provider) => {
      const ready = provider.configured ? "configured" : "needs env";
      const selected = provider.id === activeProvider ? " active" : "";
      const envKeys = ` env: ${provider.envKeys.join(", ")}`;
      const missing = provider.missingEnv.length > 0 ? ` | add: ${provider.missingEnv.join(", ")}` : "";
      return `- [${ready}] ${provider.name} (${provider.id}) model=${provider.model}${selected} |${envKeys}${missing}`;
    }),
    readyAi.length > 0
      ? `다음: 일반 문장을 입력하면 ${activeProvider ?? readyAi[0].id} agent와 바로 대화할 수 있습니다.`
      : "다음: .env에 OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY 또는 LOCAL_AI_BASE_URL 중 하나를 추가하세요.",
    "",
    "2. Connector 연결 (protocol MCP + REST adapters)",
    ...Object.values(config.mcpServers).map((server) => {
      const ready = server.configured ? "configured" : server.warnings.length > 0 ? "warning" : "needs env";
      const enabled = server.enabled && server.configured ? " enabled" : "";
      const contract = server.kind === "mcp-server" ? "protocol-mcp" : "rest-adapter";
      const envKeys = ` env: ${server.envKeys.join(", ")}`;
      const missing = server.missingEnv.length > 0 ? ` | add: ${server.missingEnv.join(", ")}` : "";
      const warning = server.warnings.length > 0 ? ` | warn: ${server.warnings.join("; ")}` : "";
      return `- [${ready}] ${server.name} (${server.id}) ${server.transport}/${contract}${enabled} |${envKeys}${missing}${warning}`;
    }),
    readyMcp.length > 0
      ? `다음: 활성 connector는 ${configuredMcpServers(config).map((server) => `${server.id}:${server.kind}`).join(", ") || "아직 없음"} 입니다.`
      : "다음: .env에 NOTION_TOKEN/GITHUB_TOKEN_SOURCE=gh-cli/GITHUB_TOKEN/FIGMA_TOKEN/STITCH_API_KEY 등 필요한 connector env를 추가하세요.",
    "",
    "3. 바로 실행할 검증 명령",
    "- rph setup auto --live",
    "- rph ai status",
    "- rph mcp status",
    "- rph doctor --live",
    activeProvider ? `- rph ai test ${activeProvider}` : "- rph setup ai <openai|anthropic|gemini|local>",
    configuredMcpServers(config)[0] ? `- rph mcp test ${configuredMcpServers(config)[0].id}` : "- rph setup mcp <notion|github|figma|stitch> 또는 rph setup mcp add <id> --url <https://host/mcp>",
    "",
    "4. 연결 후 사용",
    "- 터미널에 그냥 질문을 입력하면 AI agent가 답합니다.",
    "- 산출물 생성은 rph pm draft product-definition --ai 처럼 실행합니다.",
    "- 연결 상태가 바뀌면 rph setup auto를 다시 실행하세요."
  ].join("\n");
}

function setupGuidePrimaryAction(config: HarnessConfig): string {
  const configuredAi = configuredAiProviders(config)[0];
  if (configuredAi) {
    return "rph setup auto --from-env --live";
  }
  const candidate = config.aiProviders.openai ?? Object.values(config.aiProviders)[0];
  if (candidate) {
    return `rph setup auto --live --ai ${candidate.id} --mcp stitch`;
  }
  return "rph setup auto --live";
}

function setupGuidePrimaryReason(config: HarnessConfig): string {
  const configuredAi = configuredAiProviders(config)[0];
  if (configuredAi) {
    return `${configuredAi.name} env가 감지됨: live 검증 후 바로 agent chat으로 넘깁니다.`;
  }
  const candidate = config.aiProviders.openai ?? Object.values(config.aiProviders)[0];
  if (candidate?.missingEnv.length) {
    return `${candidate.name} 연결에 필요한 값: ${candidate.missingEnv.join(", ")}`;
  }
  return "TTY에서 실행하면 setup wizard가 credential 입력부터 live 검증까지 이어갑니다.";
}

function buildAiProviderConfig(
  definition: ProviderDefinition,
  env: NodeJS.ProcessEnv,
  previous?: HarnessConfig
): AiProviderConfig {
  const missingEnv = missingEnvKeys(env, definition.envKeys);
  const previousProvider = previous?.aiProviders[definition.id];
  const configured = missingEnv.length === 0;
  const wasPreviouslyConfigured = previousProvider?.configured ?? false;
  const enabled = configured
    ? (wasPreviouslyConfigured ? previousProvider?.enabled ?? true : true)
    : previousProvider?.enabled ?? false;
  return {
    id: definition.id,
    name: definition.name,
    enabled,
    configured,
    envKeys: definition.envKeys,
    missingEnv,
    model: env[definition.modelEnv] || previousProvider?.model || definition.defaultModel,
    baseUrl: env[definition.baseUrlEnv] || previousProvider?.baseUrl || definition.defaultBaseUrl,
    testEndpoint: definition.testEndpoint
  };
}

function buildMcpServerConfig(
  definition: McpDefinition,
  env: NodeJS.ProcessEnv,
  setupChoices?: SetupChoices,
  previous?: HarnessConfig
): McpServerRuntimeConfig {
  const serverId = definition.id;
  const previousServer = previous?.mcpServers[serverId];
  const githubTarget = serverId === "github" ? normalizeGitHubRepoTarget(env.GITHUB_OWNER, env.GITHUB_REPO) : null;
  const githubCredentialConfigured = Boolean(env.GITHUB_TOKEN || env.GH_TOKEN || env.GITHUB_TOKEN_SOURCE === "gh-cli");
  const missingEnv = githubTarget
    ? [...(githubCredentialConfigured ? [] : ["GITHUB_TOKEN"]), ...githubTarget.missingEnv]
    : missingEnvKeys(env, definition.envKeys);
  const warnings = githubTarget?.warnings ?? [];
  const configured = missingEnv.length === 0 && warnings.length === 0;
  const selected = resolveMcpServerEnabled(serverId, setupChoices, previousServer, definition.defaultEnabled);
  return {
    id: serverId,
    name: definition.name,
    kind: definition.kind,
    enabled: Boolean(selected && configured),
    configured,
    transport: definition.transport,
    command: definition.command,
    url: definition.url,
    authMode: definition.auth?.mode ?? "none",
    authEnvKey: definition.auth?.envKey,
    protocolReadiness: definition.protocolReadiness,
    protocolToolCallProbe: definition.protocolToolCallProbe,
    agentReadOnlyTools: definition.agentReadOnlyTools ?? previousServer?.agentReadOnlyTools ?? [],
    protocolReason: definition.protocolReason,
    custom: !isBuiltInMcpServerId(serverId),
    envKeys: definition.envKeys,
    missingEnv,
    warnings,
    notes: definition.notes
  };
}

function resolveActiveAiProvider(
  env: NodeJS.ProcessEnv,
  setupChoices: SetupChoices | undefined,
  previous: HarnessConfig | undefined,
  aiProviders: Record<AiProviderId, AiProviderConfig>
): HarnessConfig["activeAiProvider"] {
  if (
    previous?.activeAiProvider &&
    previous.activeAiProvider !== "auto" &&
    previous.activeAiProvider !== "none" &&
    aiProviders[previous.activeAiProvider].configured
  ) {
    return previous.activeAiProvider;
  }
  const preferred = setupChoiceToProvider(setupChoices?.aiProvider);
  if (preferred && aiProviders[preferred].configured) {
    return preferred;
  }
  if (env.OPENAI_API_KEY) {
    return "openai";
  }
  if (env.GEMINI_API_KEY) {
    return "gemini";
  }
  if (env.ANTHROPIC_API_KEY) {
    return "anthropic";
  }
  return "auto";
}

function setupChoiceToProvider(choice: SetupChoices["aiProvider"] | undefined): AiProviderId | null {
  switch (choice) {
    case "openai-codex":
      return "openai";
    case "anthropic-claude":
      return "anthropic";
    case "google-gemini":
      return "gemini";
    case "local-model":
      return "local";
    default:
      return null;
  }
}

function resolveGuideActiveProvider(config: HarnessConfig): AiProviderId | null {
  if (config.activeAiProvider !== "auto" && config.activeAiProvider !== "none" && config.aiProviders[config.activeAiProvider]?.configured) {
    return config.activeAiProvider;
  }
  return configuredAiProviders(config)[0]?.id ?? null;
}

function missingEnvKeys(env: NodeJS.ProcessEnv, keys: string[]): string[] {
  return keys.filter((key) => !env[key]);
}

function resolveMcpServerEnabled(
  serverId: McpServerId,
  setupChoices: SetupChoices | undefined,
  previousServer: McpServerRuntimeConfig | undefined,
  defaultEnabled = false
): boolean {
  if (setupChoices) {
    return setupChoices.mcp.includes(serverId);
  }
  if (previousServer) {
    return previousServer.enabled;
  }
  return defaultEnabled;
}

function mergeMcpDefinitions(previous?: HarnessConfig, existingMcpConfig?: McpConfig): Record<string, McpDefinition> {
  const definitions: Record<string, McpDefinition> = { ...MCP_SERVER_DEFINITIONS };
  for (const server of Object.values(previous?.mcpServers ?? {})) {
    if (isBuiltInMcpServerId(server.id) || server.kind !== "mcp-server") {
      continue;
    }
    definitions[server.id] = definitionFromRuntimeServer(server);
  }
  for (const [id, server] of Object.entries(existingMcpConfig?.mcpServers ?? {})) {
    if (isBuiltInMcpServerId(id) || server.kind !== "mcp-server") {
      continue;
    }
    if (previous?.mcpServers[id]) {
      continue;
    }
    definitions[id] = definitionFromPersistedMcpConfig(id, server, previous?.mcpServers[id]);
  }
  return definitions;
}

function definitionFromRuntimeServer(server: McpServerRuntimeConfig): McpDefinition {
  return {
    id: server.id,
    name: server.name,
    kind: server.kind,
    transport: server.transport,
    command: server.command,
    url: server.url,
    envKeys: server.envKeys,
    auth: {
      mode: server.authMode ?? "none",
      envKey: server.authEnvKey
    },
    protocolReadiness: server.protocolReadiness ?? (server.kind === "mcp-server" ? "tools/list" : "not-applicable"),
    protocolToolCallProbe: server.protocolToolCallProbe,
    agentReadOnlyTools: server.agentReadOnlyTools,
    protocolReason: server.protocolReason,
    notes: server.notes
  };
}

function definitionFromPersistedMcpConfig(
  id: string,
  server: McpServerConfig,
  previous?: McpServerRuntimeConfig
): McpDefinition {
  const envKeys = Object.keys(server.env ?? {});
  const authMode = server.auth?.mode ?? previous?.authMode ?? "none";
  const authEnvKey = server.auth?.envKey ?? previous?.authEnvKey;
  return {
    id,
    name: server.name ?? previous?.name ?? `${id} MCP server`,
    kind: server.kind,
    transport: server.transport,
    command: server.command,
    url: server.url,
    envKeys,
    auth: {
      mode: authMode,
      envKey: authEnvKey
    },
    protocolReadiness: previous?.protocolReadiness ?? server.protocolReadiness ?? "tools/list",
    protocolToolCallProbe: previous?.protocolToolCallProbe ?? server.protocolToolCallProbe,
    agentReadOnlyTools: previous
      ? normalizeAgentReadOnlyTools(previous.agentReadOnlyTools ?? [])
      : normalizeAgentReadOnlyTools(server.agentReadOnlyTools ?? []),
    protocolReason: server.protocolReason ?? previous?.protocolReason,
    notes: server.notes || previous?.notes || "Custom protocol MCP server.",
    defaultEnabled: server.enabled
  };
}

function writeProjectMcpConfig(projectRoot: string, config: HarnessConfig): void {
  writeJson(projectMcpConfigPath(projectRoot), projectMcpConfigFromHarnessConfig(config));
}

function projectMcpConfigFromHarnessConfig(config: HarnessConfig): McpConfig {
  return {
    mcpPolicyRegistry: config.mcpPolicyRegistry,
    mcpServers: Object.fromEntries(Object.values(config.mcpServers).map((server) => [
      server.id,
      runtimeServerToMcpConfig(server)
    ]))
  } satisfies McpConfig;
}

function runtimeServerToMcpConfig(server: McpServerRuntimeConfig): McpServerConfig {
  return {
    name: server.name,
    kind: server.kind,
    enabled: server.enabled,
    transport: server.transport,
    command: server.command,
    url: server.url,
    auth: server.authMode ? { mode: server.authMode, envKey: server.authEnvKey } : undefined,
    protocolReadiness: server.protocolReadiness,
    protocolToolCallProbe: server.protocolToolCallProbe,
    agentReadOnlyTools: server.agentReadOnlyTools,
    protocolReason: server.protocolReason,
    custom: server.custom,
    env: Object.fromEntries(server.envKeys.map((key) => [key, `\${${key}}`])),
    notes: server.notes
  };
}

function readProjectMcpConfig(projectRoot: string): McpConfig | undefined {
  const filePath = `${projectRoot}/.mcp/config.json`;
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  return readJsonIfExists<McpConfig | undefined>(filePath, undefined);
}

function emptyPersistedConfigRepairSummary(): PersistedConfigRepairSummary {
  return {
    changed: false,
    harnessChanged: false,
    mcpChanged: false,
    migratedServers: [],
    notes: []
  };
}

function comparableHarnessConfig(config: HarnessConfig): Omit<HarnessConfig, "updatedAt"> {
  const normalized = normalizeHarnessMcpPolicy(config);
  const { updatedAt: _updatedAt, ...rest } = normalized;
  return rest;
}

function migratedBuiltInMcpServers(
  previous: HarnessConfig | undefined,
  previousMcp: McpConfig | undefined,
  next: HarnessConfig,
  nextMcp: McpConfig
): string[] {
  const migrated = new Set<string>();
  for (const id of BUILT_IN_MCP_SERVER_IDS) {
    const nextRuntime = next.mcpServers[id];
    if (!nextRuntime) {
      continue;
    }
    const previousRuntime = previous?.mcpServers[id];
    if (
      previousRuntime
      && stableStringify(comparableBuiltInRuntimeServer(previousRuntime))
        !== stableStringify(comparableBuiltInRuntimeServer(nextRuntime))
    ) {
      migrated.add(id);
    }
    const previousPersisted = previousMcp?.mcpServers[id];
    const nextPersisted = nextMcp.mcpServers[id];
    if (
      previousPersisted
      && nextPersisted
      && stableStringify(comparableBuiltInMcpServer(previousPersisted))
        !== stableStringify(comparableBuiltInMcpServer(nextPersisted))
    ) {
      migrated.add(id);
    }
    const previousPolicy = previousMcp?.mcpPolicyRegistry?.servers?.[id] ?? previous?.mcpPolicyRegistry?.servers?.[id];
    const nextPolicy = next.mcpPolicyRegistry.servers[id];
    if (previousPolicy && nextPolicy && stableStringify(previousPolicy) !== stableStringify(nextPolicy)) {
      migrated.add(id);
    }
  }
  return [...migrated].sort();
}

function comparableBuiltInRuntimeServer(server: McpServerRuntimeConfig): Record<string, unknown> {
  return {
    id: server.id,
    name: server.name,
    kind: server.kind,
    transport: server.transport,
    command: server.command,
    url: server.url,
    authMode: server.authMode,
    authEnvKey: server.authEnvKey,
    protocolReadiness: server.protocolReadiness,
    protocolToolCallProbe: server.protocolToolCallProbe,
    agentReadOnlyTools: server.agentReadOnlyTools ?? [],
    protocolReason: server.protocolReason,
    envKeys: server.envKeys,
    notes: server.notes
  };
}

function comparableBuiltInMcpServer(server: McpServerConfig): Record<string, unknown> {
  return {
    name: server.name,
    kind: server.kind,
    transport: server.transport,
    command: server.command,
    url: server.url,
    auth: server.auth,
    protocolReadiness: server.protocolReadiness,
    protocolToolCallProbe: server.protocolToolCallProbe,
    agentReadOnlyTools: server.agentReadOnlyTools ?? [],
    protocolReason: server.protocolReason,
    env: server.env,
    notes: server.notes
  };
}

function isBuiltInMcpServerId(value: string): boolean {
  return BUILT_IN_MCP_SERVER_IDS.includes(value);
}

function normalizeCustomMcpServerId(value: string): string {
  const id = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,62}$/.test(id)) {
    throw new Error("custom MCP server id must use lowercase letters, numbers, hyphen, or underscore and be 2-63 chars");
  }
  return id;
}

function normalizeProtocolMcpUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalDevHost(url.hostname))) {
      throw new Error("protocol MCP URL must use https://; http:// is allowed only for localhost development");
    }
    return url.toString();
  } catch (error) {
    if (error instanceof Error && error.message.includes("protocol MCP URL")) {
      throw error;
    }
    throw new Error(`invalid protocol MCP URL: ${value}`);
  }
}

function isLocalDevHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

function normalizeAgentReadOnlyTools(values: Array<string | undefined>): string[] {
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

function envKeyPrefix(id: string): string {
  return id.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

export function normalizeGitHubRepoTarget(
  ownerValue?: string,
  repoValue?: string
): NormalizedGitHubRepoTarget {
  const warnings: string[] = [];
  let owner = ownerValue?.trim() ?? "";
  let repo = repoValue?.trim() ?? "";
  if (repo) {
    const parsed = parseGitHubRepoValue(repo);
    if (!parsed) {
      repo = "";
      warnings.push("GITHUB_REPO must be a repo name, owner/repo, or GitHub URL");
    } else {
      if (parsed.owner && owner && owner.toLowerCase() !== parsed.owner.toLowerCase()) {
        warnings.push(`GITHUB_OWNER (${owner}) does not match GITHUB_REPO owner (${parsed.owner})`);
      }
      owner = owner || parsed.owner || "";
      repo = parsed.repo;
    }
  }
  if (owner && !isValidGitHubSlug(owner)) {
    warnings.push("GITHUB_OWNER is not a valid GitHub owner slug");
  }
  if (repo && !isValidGitHubSlug(repo)) {
    warnings.push("GITHUB_REPO is not a valid GitHub repository slug");
  }
  const missingEnv = [
    ...(owner ? [] : ["GITHUB_OWNER"]),
    ...(repo ? [] : ["GITHUB_REPO"])
  ];
  return {
    owner: owner || undefined,
    repo: repo || undefined,
    slug: owner && repo ? `${owner}/${repo}` : undefined,
    configured: missingEnv.length === 0 && warnings.length === 0,
    missingEnv,
    warnings: [...new Set(warnings)]
  };
}

function parseGitHubRepoValue(value: string): { owner?: string; repo: string } | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const sshMatch = trimmed.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }
  const urlMatch = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }
  const slugMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (slugMatch) {
    return { owner: slugMatch[1], repo: slugMatch[2].replace(/\.git$/i, "") };
  }
  if (trimmed.includes("/")) {
    return null;
  }
  return { repo: trimmed.replace(/\.git$/i, "") };
}

function isValidGitHubSlug(value: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(value);
}

function mapRecord<TId extends string, TDefinition, TResult>(
  input: Record<TId, TDefinition>,
  mapper: (definition: TDefinition) => TResult
): Record<TId, TResult> {
  return Object.fromEntries(Object.entries(input).map(([id, definition]) => [id, mapper(definition as TDefinition)])) as Record<TId, TResult>;
}

function parseActiveAiProvider(value: string): HarnessConfig["activeAiProvider"] {
  if (value === "auto" || value === "none" || value in AI_PROVIDER_DEFINITIONS) {
    return value as HarnessConfig["activeAiProvider"];
  }
  throw new Error(`invalid AI provider: ${value}`);
}

function parseTheme(value: string): HarnessConfig["ui"]["theme"] {
  if (value === "hacker" || value === "mono" || value === "minimal") {
    return value;
  }
  throw new Error(`invalid theme: ${value}`);
}

function parseBoolean(value: string): boolean {
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) {
    return false;
  }
  throw new Error(`invalid boolean: ${value}`);
}

function projectMcpConfigPath(projectRoot: string): string {
  ensureDir(`${projectRoot}/.mcp`);
  return `${projectRoot}/.mcp/config.json`;
}
