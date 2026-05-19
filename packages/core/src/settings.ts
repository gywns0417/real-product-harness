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
