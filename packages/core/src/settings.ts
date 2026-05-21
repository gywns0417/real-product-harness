import fs from "node:fs";
import { createMcpConfig, MCP_SERVER_CONTRACTS, type McpServerContract } from "../../integrations/src/mcp";
import { ensureDir, readJsonIfExists, writeJson } from "./fs";
import { connectionReportFile, harnessConfigFile } from "./paths";
import { nowIso } from "./time";
import {
  AiProviderConfig,
  AiProviderId,
  ConnectionCheck,
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

type McpDefinition = McpServerContract;

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

export const MCP_SERVER_DEFINITIONS = MCP_SERVER_CONTRACTS as Record<McpServerId, McpDefinition>;

export function createHarnessConfig(
  env: NodeJS.ProcessEnv = process.env,
  setupChoices?: SetupChoices,
  previous?: HarnessConfig
): HarnessConfig {
  const now = nowIso();
  const aiProviders = mapRecord(AI_PROVIDER_DEFINITIONS, (definition) => buildAiProviderConfig(definition, env, previous));
  const mcpServers = mapRecord(MCP_SERVER_DEFINITIONS, (definition) => buildMcpServerConfig(definition, env, setupChoices, previous));
  return {
    version: 1,
    activeAiProvider: resolveActiveAiProvider(env, setupChoices, previous, aiProviders),
    aiProviders,
    mcpServers,
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
  const config = createHarnessConfig(process.env, setupChoices);
  saveHarnessConfig(projectRoot, config);
  writeJson(projectMcpConfigPath(projectRoot), createMcpConfig(enabledMcpServers(config)));
  return config;
}

export function loadHarnessConfig(projectRoot: string): HarnessConfig {
  const configPath = harnessConfigFile(projectRoot);
  const fallback = createHarnessConfig(process.env);
  return readJsonIfExists<HarnessConfig>(configPath, fallback);
}

export function saveHarnessConfig(projectRoot: string, config: HarnessConfig): void {
  writeJson(harnessConfigFile(projectRoot), { ...config, updatedAt: nowIso() });
}

export function syncHarnessConfigFromEnv(projectRoot: string): HarnessConfig {
  const previous = fs.existsSync(harnessConfigFile(projectRoot)) ? loadHarnessConfig(projectRoot) : undefined;
  const config = createHarnessConfig(process.env, undefined, previous);
  saveHarnessConfig(projectRoot, config);
  writeJson(projectMcpConfigPath(projectRoot), createMcpConfig(enabledMcpServers(config)));
  return config;
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
  config.mcpServers[serverId].enabled = enabled;
  saveHarnessConfig(projectRoot, config);
  writeJson(projectMcpConfigPath(projectRoot), createMcpConfig(enabledMcpServers(config)));
  return config;
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

export function writeConnectionReport(projectRoot: string, checks: ConnectionCheck[]): string {
  const filePath = connectionReportFile(projectRoot);
  writeJson(filePath, {
    checkedAt: nowIso(),
    checks
  });
  return filePath;
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
    "- 비밀값은 .env에만 두고, .rph/config.json에는 상태와 env key 이름만 저장합니다.",
    "",
    "1. AI agent 연결",
    ...Object.values(config.aiProviders).map((provider) => {
      const ready = provider.configured ? "ready" : "needs env";
      const selected = provider.id === activeProvider ? " active" : "";
      const envKeys = ` env: ${provider.envKeys.join(", ")}`;
      const missing = provider.missingEnv.length > 0 ? ` | add: ${provider.missingEnv.join(", ")}` : "";
      return `- [${ready}] ${provider.name} (${provider.id}) model=${provider.model}${selected} |${envKeys}${missing}`;
    }),
    readyAi.length > 0
      ? `다음: 일반 문장을 입력하면 ${activeProvider ?? readyAi[0].id} agent와 바로 대화할 수 있습니다.`
      : "다음: .env에 OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY 또는 LOCAL_AI_BASE_URL 중 하나를 추가하세요.",
    "",
    "2. MCP 연결",
    ...Object.values(config.mcpServers).map((server) => {
      const ready = server.configured ? "ready" : server.warnings.length > 0 ? "warning" : "needs env";
      const enabled = server.enabled && server.configured ? " enabled" : "";
      const contract = server.kind === "mcp-server" ? "real-mcp" : "rest-adapter";
      const envKeys = ` env: ${server.envKeys.join(", ")}`;
      const missing = server.missingEnv.length > 0 ? ` | add: ${server.missingEnv.join(", ")}` : "";
      const warning = server.warnings.length > 0 ? ` | warn: ${server.warnings.join("; ")}` : "";
      return `- [${ready}] ${server.name} (${server.id}) ${server.transport}/${contract}${enabled} |${envKeys}${missing}${warning}`;
    }),
    readyMcp.length > 0
      ? `다음: 활성 MCP는 ${configuredMcpServers(config).map((server) => server.id).join(", ") || "아직 없음"} 입니다.`
      : "다음: .env에 NOTION_TOKEN/GITHUB_TOKEN/FIGMA_TOKEN 등 필요한 MCP env를 추가하세요.",
    "",
    "3. 바로 실행할 검증 명령",
    "- /setup auto --live",
    "- /ai status",
    "- /mcp status",
    "- /doctor --live",
    activeProvider ? `- /ai test ${activeProvider}` : "- /setup ai <openai|anthropic|gemini|local>",
    configuredMcpServers(config)[0] ? `- /mcp test ${configuredMcpServers(config)[0].id}` : "- /setup mcp <notion|github|figma|stitch>",
    "",
    "4. 연결 후 사용",
    "- 터미널에 그냥 질문을 입력하면 AI agent가 답합니다.",
    "- 산출물 생성은 /pm draft product-definition --ai 처럼 실행합니다.",
    "- 연결 상태가 바뀌면 /setup auto를 다시 실행하세요."
  ].join("\n");
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
  const serverId = definition.id as McpServerId;
  const previousServer = previous?.mcpServers[serverId];
  const githubTarget = serverId === "github" ? normalizeGitHubRepoTarget(env.GITHUB_OWNER, env.GITHUB_REPO) : null;
  const missingEnv = githubTarget
    ? [...(env.GITHUB_TOKEN ? [] : ["GITHUB_TOKEN"]), ...githubTarget.missingEnv]
    : missingEnvKeys(env, definition.envKeys);
  const warnings = githubTarget?.warnings ?? [];
  const configured = missingEnv.length === 0 && warnings.length === 0;
  const selected = resolveMcpServerEnabled(serverId, setupChoices, previousServer);
  return {
    id: serverId,
    name: definition.name,
    kind: definition.kind,
    enabled: Boolean(selected && configured),
    configured,
    transport: definition.transport,
    command: definition.command,
    url: definition.url,
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
  previousServer: HarnessConfig["mcpServers"][McpServerId] | undefined
): boolean {
  if (setupChoices) {
    return setupChoices.mcp.includes(serverId);
  }
  if (previousServer) {
    return previousServer.enabled;
  }
  return false;
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
