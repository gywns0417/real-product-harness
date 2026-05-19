import { aiRunFile } from "./paths";
import { ensureDir, writeJson } from "./fs";
import { nowIso } from "./time";
import {
  AiGenerationRequest,
  AiGenerationResult,
  AiProviderConfig,
  AiProviderId,
  AiRunRecord,
  HarnessConfig
} from "./types";

const DEFAULT_MAX_OUTPUT_TOKENS = 1800;

export async function generateAiText(
  config: HarnessConfig,
  request: AiGenerationRequest,
  env: NodeJS.ProcessEnv = process.env
): Promise<AiGenerationResult> {
  const provider = resolveGenerationProvider(config, request.providerId);
  const maxOutputTokens = request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  switch (provider.id) {
    case "openai":
      return generateOpenAiText(provider, request, maxOutputTokens, env);
    case "anthropic":
      return generateAnthropicText(provider, request, maxOutputTokens, env);
    case "gemini":
      return generateGeminiText(provider, request, maxOutputTokens, env);
    case "local":
      return generateLocalText(provider, request, maxOutputTokens);
    default:
      throw new Error(`unsupported AI provider: ${String(provider.id)}`);
  }
}

export function writeAiRunRecord(projectRoot: string, record: AiRunRecord): string {
  ensureDir(`${projectRoot}/.rph/ai/runs`);
  const filePath = aiRunFile(projectRoot, record.id);
  writeJson(filePath, record);
  return filePath;
}

export function createAiRunRecord(
  result: AiGenerationResult,
  command: string,
  prompt: string,
  artifact?: AiRunRecord["artifact"]
): AiRunRecord {
  return {
    id: result.id,
    providerId: result.providerId,
    model: result.model,
    command,
    artifact,
    promptPreview: preview(prompt),
    outputPreview: preview(result.text),
    generatedAt: result.generatedAt
  };
}

function resolveGenerationProvider(config: HarnessConfig, preferred?: AiProviderId): AiProviderConfig {
  const providerId = preferred ?? (config.activeAiProvider !== "auto" && config.activeAiProvider !== "none" ? config.activeAiProvider : undefined);
  const provider = providerId ? config.aiProviders[providerId] : firstConfiguredProvider(config);
  if (!provider) {
    throw new Error("no configured AI provider found. Run /setup auto, then /ai status");
  }
  if (!provider.enabled || !provider.configured || provider.missingEnv.length > 0) {
    throw new Error(`AI provider is not ready: ${provider.id}. missing=${provider.missingEnv.join(",") || "none"}`);
  }
  return provider;
}

function firstConfiguredProvider(config: HarnessConfig): AiProviderConfig | undefined {
  return Object.values(config.aiProviders).find((provider) => provider.enabled && provider.configured);
}

async function generateOpenAiText(
  provider: AiProviderConfig,
  request: AiGenerationRequest,
  maxOutputTokens: number,
  env: NodeJS.ProcessEnv
): Promise<AiGenerationResult> {
  const endpoint = `${trimTrailingSlash(provider.baseUrl)}/responses`;
  const json = await postJson(endpoint, {
    Authorization: `Bearer ${env.OPENAI_API_KEY ?? ""}`,
    "Content-Type": "application/json"
  }, {
    model: provider.model,
    instructions: request.system,
    input: request.prompt,
    max_output_tokens: maxOutputTokens,
    temperature: request.temperature
  });
  const text = extractOpenAiText(json);
  return generationResult(provider, endpoint, text, json.usage as Record<string, unknown> | undefined);
}

async function generateAnthropicText(
  provider: AiProviderConfig,
  request: AiGenerationRequest,
  maxOutputTokens: number,
  env: NodeJS.ProcessEnv
): Promise<AiGenerationResult> {
  const endpoint = `${trimTrailingSlash(provider.baseUrl)}/messages`;
  const json = await postJson(endpoint, {
    "x-api-key": env.ANTHROPIC_API_KEY ?? "",
    "anthropic-version": "2023-06-01",
    "Content-Type": "application/json"
  }, {
    model: provider.model,
    system: request.system,
    max_tokens: maxOutputTokens,
    temperature: request.temperature,
    messages: [
      {
        role: "user",
        content: request.prompt
      }
    ]
  });
  const text = extractAnthropicText(json);
  return generationResult(provider, endpoint, text, json.usage as Record<string, unknown> | undefined);
}

async function generateGeminiText(
  provider: AiProviderConfig,
  request: AiGenerationRequest,
  maxOutputTokens: number,
  env: NodeJS.ProcessEnv
): Promise<AiGenerationResult> {
  const endpoint = `${trimTrailingSlash(provider.baseUrl)}/models/${encodeURIComponent(provider.model)}:generateContent`;
  const contents = [
    request.system
      ? {
          role: "user",
          parts: [{ text: `${request.system}\n\n${request.prompt}` }]
        }
      : {
          role: "user",
          parts: [{ text: request.prompt }]
        }
  ];
  const json = await postJson(endpoint, {
    "x-goog-api-key": env.GEMINI_API_KEY ?? "",
    "Content-Type": "application/json"
  }, {
    contents,
    generationConfig: {
      maxOutputTokens,
      temperature: request.temperature
    }
  });
  const text = extractGeminiText(json);
  return generationResult(provider, endpoint, text, json.usageMetadata as Record<string, unknown> | undefined);
}

async function generateLocalText(
  provider: AiProviderConfig,
  request: AiGenerationRequest,
  maxOutputTokens: number
): Promise<AiGenerationResult> {
  const endpoint = `${trimTrailingSlash(provider.baseUrl)}/api/generate`;
  const json = await postJson(endpoint, {
    "Content-Type": "application/json"
  }, {
    model: provider.model,
    prompt: [request.system, request.prompt].filter(Boolean).join("\n\n"),
    stream: false,
    options: {
      num_predict: maxOutputTokens,
      temperature: request.temperature
    }
  });
  const text = typeof json.response === "string" ? json.response : "";
  assertGeneratedText(text, provider.id);
  return generationResult(provider, endpoint, text, undefined);
}

async function postJson(endpoint: string, headers: Record<string, string>, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(stripUndefined(body)),
      signal: controller.signal
    });
    const text = await response.text();
    const json = parseJson(text);
    if (!response.ok) {
      const message = apiErrorMessage(json) ?? text.slice(0, 300) ?? "empty response";
      throw new Error(`AI request failed (${response.status}) ${message}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

function generationResult(
  provider: AiProviderConfig,
  endpoint: string,
  text: string,
  usage?: Record<string, unknown>
): AiGenerationResult {
  assertGeneratedText(text, provider.id);
  return {
    id: `ai_run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    providerId: provider.id,
    model: provider.model,
    text: text.trim(),
    endpoint: redactEndpoint(endpoint),
    usage,
    generatedAt: nowIso()
  };
}

function extractOpenAiText(json: Record<string, unknown>): string {
  if (typeof json.output_text === "string") {
    return json.output_text;
  }
  const output = Array.isArray(json.output) ? json.output : [];
  return output.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const content = Array.isArray(item.content) ? item.content : [];
    return content.flatMap((part) => {
      if (isRecord(part) && (part.type === "output_text" || part.type === "text") && typeof part.text === "string") {
        return [part.text];
      }
      return [];
    });
  }).join("\n");
}

function extractAnthropicText(json: Record<string, unknown>): string {
  const content = Array.isArray(json.content) ? json.content : [];
  return content.flatMap((part) => {
    if (isRecord(part) && part.type === "text" && typeof part.text === "string") {
      return [part.text];
    }
    return [];
  }).join("\n");
}

function extractGeminiText(json: Record<string, unknown>): string {
  const candidates = Array.isArray(json.candidates) ? json.candidates : [];
  return candidates.flatMap((candidate) => {
    if (!isRecord(candidate) || !isRecord(candidate.content)) {
      return [];
    }
    const parts = Array.isArray(candidate.content.parts) ? candidate.content.parts : [];
    return parts.flatMap((part) => {
      if (isRecord(part) && typeof part.text === "string") {
        return [part.text];
      }
      return [];
    });
  }).join("\n");
}

function assertGeneratedText(text: string, providerId: string): void {
  if (!text.trim()) {
    throw new Error(`AI provider returned no text: ${providerId}`);
  }
}

function parseJson(text: string): Record<string, unknown> {
  if (!text.trim()) {
    return {};
  }
  const parsed = JSON.parse(text) as unknown;
  return isRecord(parsed) ? parsed : {};
}

function apiErrorMessage(json: Record<string, unknown>): string | undefined {
  const error = json.error;
  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }
  if (typeof json.message === "string") {
    return json.message;
  }
  return undefined;
}

function stripUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function redactEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  if (url.searchParams.has("key")) {
    url.searchParams.set("key", "<redacted>");
  }
  return url.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function preview(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 500 ? `${compact.slice(0, 497)}...` : compact;
}
