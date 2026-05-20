import fs from "node:fs";
import { createMcpConfig } from "../../integrations/src/mcp";
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

interface McpDefinition {
  id: McpServerId;
  name: string;
  transport: "stdio" | "http";
  envKeys: string[];
  command?: string;
  url?: string;
  notes: string;
}

export const AI_PROVIDER_DEFINITIONS: Record<AiProviderId, ProviderDefinition> = {
  openai: {
    id: "openai",
    name: "OpenAI",
    envKeys: ["OPENAI_API_KEY"],
    modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-5.2",
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

export const MCP_SERVER_DEFINITIONS: Record<McpServerId, McpDefinition> = {
  notion: {
    id: "notion",
    name: "Notion hosted MCP",
    transport: "http",
    url: "https://mcp.notion.com/mcp",
    envKeys: ["NOTION_TOKEN", "NOTION_PARENT_PAGE_ID"],
    notes: "Uses Notion credentials from .env and writes workspace/sync plans before live changes."
  },
  github: {
    id: "github",
    name: "GitHub CLI/API",
    transport: "stdio",
    command: "gh",
    envKeys: ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO"],
    notes: "Uses gh and GitHub REST for repository, issue, PR, and release gates."
  },
  figma: {
    id: "figma",
    name: "Figma API",
    transport: "http",
    url: "https://api.figma.com",
    envKeys: ["FIGMA_TOKEN", "FIGMA_FILE_ID"],
    notes: "Optional design integration. HTML fallback remains active when not configured."
  },
  stitch: {
    id: "stitch",
    name: "Stitch",
    transport: "http",
    url: "https://stitch.withgoogle.com",
    envKeys: ["STITCH_API_KEY"],
    notes: "Optional UI generation adapter. Live API details are provider-specific."
  }
};

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
      const ready = server.configured ? "ready" : "needs env";
      const enabled = server.enabled && server.configured ? " enabled" : "";
      const envKeys = ` env: ${server.envKeys.join(", ")}`;
      const missing = server.missingEnv.length > 0 ? ` | add: ${server.missingEnv.join(", ")}` : "";
      return `- [${ready}] ${server.name} (${server.id}) ${server.transport}${enabled} |${envKeys}${missing}`;
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
  return {
    id: definition.id,
    name: definition.name,
    enabled: previousProvider?.enabled ?? missingEnv.length === 0,
    configured: missingEnv.length === 0,
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
  const missingEnv = missingEnvKeys(env, definition.envKeys);
  const previousServer = previous?.mcpServers[definition.id];
  const selected = setupChoices?.mcp.includes(definition.id) ?? previousServer?.enabled ?? true;
  return {
    id: definition.id,
    name: definition.name,
    enabled: Boolean(selected && missingEnv.length === 0),
    configured: missingEnv.length === 0,
    transport: definition.transport,
    command: definition.command,
    url: definition.url,
    envKeys: definition.envKeys,
    missingEnv,
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
