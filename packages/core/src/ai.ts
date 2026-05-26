import fs from "node:fs";
import { aiChatDir, aiChatFile, aiRunFile, aiRunsDir, runtimeSessionFile } from "./paths";
import { appendText, ensureDir, readJsonIfExists, writeJson } from "./fs";
import { nowIso } from "./time";
import {
  AiChatMessage,
  AiChatTurnRecord,
  AiGenerationRequest,
  AiGenerationResult,
  AiProviderAttempt,
  AiProviderConfig,
  AiProviderFallback,
  AiProviderOutcomeSummary,
  AiProviderId,
  AiRunRecord,
  AgentExecutionProfileRef,
  RuntimeSessionManifest,
  HarnessConfig
} from "./types";

const DEFAULT_MAX_OUTPUT_TOKENS = 1800;

export async function generateAiText(
  config: HarnessConfig,
  request: AiGenerationRequest,
  env: NodeJS.ProcessEnv = process.env
): Promise<AiGenerationResult> {
  const maxOutputTokens = request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const plan = resolveGenerationProviderPlan(config, request.providerId, request.executionProfile);
  const attempts: AiProviderAttempt[] = [...plan.skippedAttempts];
  const failures: AiProviderFallback["failures"] = plan.skippedAttempts.map((attempt) => ({
    providerId: attempt.providerId,
    message: attempt.message ?? "provider skipped"
  }));
  for (const provider of plan.providers) {
    try {
      const result = await generateAiTextWithProvider(
        applyExecutionProfileToProvider(provider, request.executionProfile),
        request,
        maxOutputTokens,
        env
      );
      return withProviderAttemptMetadata({ ...result, executionProfile: request.executionProfile }, [
        ...attempts,
        { providerId: provider.id, status: "passed" }
      ], failures);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (request.providerId || plan.providers.length === 1) {
        throw error;
      }
      attempts.push({ providerId: provider.id, status: "failed", message });
      failures.push({ providerId: provider.id, message });
    }
  }
  throw new Error(`AI generation failed for configured providers: ${failures.map((failure) => `${failure.providerId}: ${failure.message}`).join("; ") || "none"}`);
}

async function generateAiTextWithProvider(
  provider: AiProviderConfig,
  request: AiGenerationRequest,
  maxOutputTokens: number,
  env: NodeJS.ProcessEnv
): Promise<AiGenerationResult> {
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

function withProviderAttemptMetadata(
  result: AiGenerationResult,
  attempts: AiProviderAttempt[],
  failures: AiProviderFallback["failures"]
): AiGenerationResult {
  if (attempts.length <= 1 && failures.length === 0) {
    return {
      ...result,
      providerAttempts: attempts
    };
  }
  return {
    ...result,
    providerAttempts: attempts,
    providerFallback: failures.length > 0
      ? {
          selectedProviderId: result.providerId,
          attemptedProviderIds: attempts
            .filter((attempt) => attempt.providerId !== result.providerId || attempt.status !== "passed")
            .map((attempt) => attempt.providerId),
          failures
        }
      : undefined
  };
}

export function writeAiRunRecord(projectRoot: string, record: AiRunRecord): string {
  ensureDir(`${projectRoot}/.rph/ai/runs`);
  const filePath = aiRunFile(projectRoot, record.id);
  writeJson(filePath, record);
  return filePath;
}

export function writeAiChatTurnRecord(projectRoot: string, record: AiChatTurnRecord): string {
  const filePath = aiChatFile(projectRoot, record.sessionId);
  appendText(filePath, `${JSON.stringify(record)}\n`);
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
    executionProfile: result.executionProfile,
    command,
    artifact,
    promptPreview: preview(prompt),
    outputPreview: preview(result.text),
    providerAttempts: result.providerAttempts,
    providerFallback: result.providerFallback,
    generatedAt: result.generatedAt
  };
}

export function createAiChatTurnRecord(
  result: AiGenerationResult,
  sessionId: string,
  userInput: string,
  prompt: string,
  agentTurnId?: string
): AiChatTurnRecord {
  const generatedAt = result.generatedAt;
  return {
    id: result.id,
    sessionId,
    agentTurnId,
    providerId: result.providerId,
    model: result.model,
    executionProfile: result.executionProfile,
    user: {
      role: "user",
      content: userInput,
      at: generatedAt
    },
    assistant: {
      role: "assistant",
      content: result.text,
      at: generatedAt
    },
    promptPreview: preview(prompt),
    providerAttempts: result.providerAttempts,
    providerFallback: result.providerFallback,
    generatedAt
  };
}

export function buildAiChatPrompt(
  userInput: string,
  history: AiChatMessage[],
  context: string,
  maxHistoryMessages = 12
): string {
  const recent = history.slice(-maxHistoryMessages);
  const transcript = recent.length > 0
    ? recent.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n\n")
    : "No prior messages in this runtime session.";
  return [
    context,
    "",
    "Runtime chat history:",
    transcript,
    "",
    "Current user message:",
    userInput
  ].join("\n");
}

export function formatAiProviderFallback(result: Pick<AiGenerationResult, "providerFallback">): string | undefined {
  const fallback = result.providerFallback;
  if (!fallback || fallback.failures.length === 0) {
    return undefined;
  }
  const chain = [...fallback.attemptedProviderIds, fallback.selectedProviderId]
    .filter((providerId, index, all) => all.indexOf(providerId) === index)
    .join(" -> ");
  const reasons = fallback.failures
    .map((failure) => `${failure.providerId}: ${failure.message}`)
    .join("; ");
  return `ai provider fallback: ${chain} (${reasons})`;
}

export function readLatestAiProviderOutcome(projectRoot: string): AiProviderOutcomeSummary | null {
  const candidates = [
    readRuntimeSessionProviderOutcome(projectRoot),
    readLatestAiRunProviderOutcome(projectRoot),
    readLatestAiChatProviderOutcome(projectRoot)
  ].filter((item): item is AiProviderOutcomeSummary => Boolean(item));
  candidates.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return candidates[0] ?? null;
}

function readRuntimeSessionProviderOutcome(projectRoot: string): AiProviderOutcomeSummary | null {
  const manifest = readJsonIfExists<RuntimeSessionManifest | null>(runtimeSessionFile(projectRoot), null);
  const turn = manifest?.activeTurn;
  if (!manifest || !turn?.providerId) {
    return null;
  }
  return {
    source: "runtime-session",
    id: turn.id,
    sessionId: manifest.sessionId,
    providerId: turn.providerId,
    model: turn.model,
    providerAttempts: turn.providerAttempts,
    providerFallback: turn.providerFallback,
    at: turn.updatedAt
  };
}

function readLatestAiRunProviderOutcome(projectRoot: string): AiProviderOutcomeSummary | null {
  const dir = aiRunsDir(projectRoot);
  const file = latestFile(dir, ".json");
  if (!file) {
    return null;
  }
  const record = readJsonIfExists<AiRunRecord | null>(file, null);
  if (!record) {
    return null;
  }
  return {
    source: "ai-run",
    id: record.id,
    providerId: record.providerId,
    model: record.model,
    providerAttempts: record.providerAttempts,
    providerFallback: record.providerFallback,
    at: record.generatedAt
  };
}

function readLatestAiChatProviderOutcome(projectRoot: string): AiProviderOutcomeSummary | null {
  const file = latestFile(aiChatDir(projectRoot), ".jsonl");
  if (!file) {
    return null;
  }
  const lastLine = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).at(-1);
  if (!lastLine) {
    return null;
  }
  const record = JSON.parse(lastLine) as AiChatTurnRecord;
  return {
    source: "ai-chat",
    id: record.id,
    sessionId: record.sessionId,
    providerId: record.providerId,
    model: record.model,
    providerAttempts: record.providerAttempts,
    providerFallback: record.providerFallback,
    at: record.generatedAt
  };
}

function latestFile(dir: string, suffix: string): string | null {
  if (!fs.existsSync(dir)) {
    return null;
  }
  const files = fs.readdirSync(dir)
    .filter((file) => file.endsWith(suffix))
    .map((file) => {
      const filePath = `${dir}/${file}`;
      return {
        filePath,
        mtimeMs: fs.statSync(filePath).mtimeMs
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.filePath ?? null;
}

function resolveGenerationProviderPlan(
  config: HarnessConfig,
  preferred?: AiProviderId,
  executionProfile?: AgentExecutionProfileRef
): { providers: AiProviderConfig[]; skippedAttempts: AiProviderAttempt[] } {
  if (preferred) {
    return { providers: [requireReadyProvider(config.aiProviders[preferred])], skippedAttempts: [] };
  }
  const profilePreferredProvider = preferredProviderForModel(executionProfile?.model);
  if (profilePreferredProvider) {
    return { providers: [requireReadyProvider(config.aiProviders[profilePreferredProvider])], skippedAttempts: [] };
  }
  const activeProvider = config.activeAiProvider !== "auto" && config.activeAiProvider !== "none"
    ? config.aiProviders[config.activeAiProvider]
    : undefined;
  const fallbackProviders = configuredProviders(config, activeProvider?.id);
  if (activeProvider && isReadyProvider(activeProvider)) {
    return { providers: [activeProvider, ...fallbackProviders], skippedAttempts: [] };
  }
  if (fallbackProviders.length === 0) {
    if (activeProvider) {
      throw new Error(`AI provider is not ready: ${activeProvider.id}. missing=${activeProvider.missingEnv.join(",") || "none"}. No fallback provider is configured.`);
    }
    throw new Error("no configured AI provider found. Run /setup auto, then /ai status");
  }
  return {
    providers: fallbackProviders,
    skippedAttempts: activeProvider
      ? [{
          providerId: activeProvider.id,
          status: "skipped",
          message: `AI provider is not ready: missing=${activeProvider.missingEnv.join(",") || "none"}`
        }]
      : []
  };
}

function requireReadyProvider(provider: AiProviderConfig | undefined): AiProviderConfig {
  if (!provider) {
    throw new Error("AI provider is not ready: unknown provider");
  }
  if (!isReadyProvider(provider)) {
    throw new Error(`AI provider is not ready: ${provider.id}. missing=${provider.missingEnv.join(",") || "none"}`);
  }
  return provider;
}

function configuredProviders(config: HarnessConfig, excludeId?: AiProviderId): AiProviderConfig[] {
  return Object.values(config.aiProviders).filter((provider) => provider.id !== excludeId && isReadyProvider(provider));
}

function isReadyProvider(provider: AiProviderConfig): boolean {
  return provider.enabled && provider.configured && provider.missingEnv.length === 0;
}

function applyExecutionProfileToProvider(provider: AiProviderConfig, executionProfile?: AgentExecutionProfileRef): AiProviderConfig {
  const model = executionProfile?.model?.trim();
  if (!model || !modelCompatibleWithProvider(model, provider.id)) {
    return provider;
  }
  return {
    ...provider,
    model
  };
}

function preferredProviderForModel(model?: string): AiProviderId | undefined {
  if (!model) {
    return undefined;
  }
  const normalized = model.toLowerCase();
  if (normalized.startsWith("claude")) {
    return "anthropic";
  }
  if (normalized.startsWith("gemini")) {
    return "gemini";
  }
  if (
    normalized.startsWith("gpt-")
    || normalized.startsWith("o")
    || normalized.includes("codex")
  ) {
    return "openai";
  }
  return undefined;
}

function modelCompatibleWithProvider(model: string, providerId: AiProviderId): boolean {
  const preferred = preferredProviderForModel(model);
  return !preferred || preferred === providerId;
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
    temperature: request.temperature,
    reasoning: openAiReasoningOptions(request.executionProfile?.modelReasoningEffort)
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

function openAiReasoningOptions(reasoningEffort?: string): { effort: "low" | "medium" | "high" } | undefined {
  const normalized = reasoningEffort?.trim().toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") {
    return { effort: normalized };
  }
  if (normalized === "xhigh") {
    return { effort: "high" };
  }
  return undefined;
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
