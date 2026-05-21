import { MCP_SERVER_CONTRACTS, STITCH_MCP_URL, type McpServerContract } from "../../integrations/src/mcp";
import { generateAiText } from "./ai";
import { nowIso } from "./time";
import { AiProviderId, ConnectionCheck, HarnessConfig, McpServerId } from "./types";

type Readiness = NonNullable<ConnectionCheck["readiness"]>;
type ReadinessStage = Readiness["stages"][number];

interface ProbeResult {
  ok: boolean;
  status: number | null;
  message: string;
  endpoint: string;
  json?: unknown;
}

export async function testAiConnection(
  config: HarnessConfig,
  providerId: AiProviderId,
  env: NodeJS.ProcessEnv = process.env
): Promise<ConnectionCheck> {
  const provider = config.aiProviders[providerId];
  if (!provider) {
    return withReadiness(skipped("ai", providerId, `unknown AI provider: ${providerId}`, [], []), []);
  }
  if (provider.missingEnv.length > 0) {
    return withReadiness(skipped("ai", providerId, "required environment variables are missing", provider.envKeys, provider.missingEnv), [
      { stage: "transport", status: "skipped", message: "provider is not fully configured" },
      { stage: "credential-probe", status: "skipped", message: "missing provider credential" },
      { stage: "protocol-tool-call", status: "skipped", message: "generation smoke requires provider credentials" }
    ]);
  }
  let credentialProbe: ConnectionCheck;
  switch (providerId) {
    case "openai":
      credentialProbe = await probe("ai", providerId, provider.envKeys, `${provider.baseUrl}/models`, {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`
      });
      break;
    case "anthropic":
      credentialProbe = await probe("ai", providerId, provider.envKeys, `${provider.baseUrl}/models`, {
        "x-api-key": env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01"
      });
      break;
    case "gemini":
      credentialProbe = await probe("ai", providerId, provider.envKeys, `${provider.baseUrl}/models?key=${encodeURIComponent(env.GEMINI_API_KEY ?? "")}`, {});
      break;
    case "local":
      credentialProbe = await probe("ai", providerId, provider.envKeys, provider.testEndpoint, {});
      break;
    default:
      return withReadiness(skipped("ai", providerId, "no probe is defined for this provider", provider.envKeys, []), []);
  }
  return testAiGenerationSmoke(config, providerId, credentialProbe, env);
}

export async function testMcpConnection(
  config: HarnessConfig,
  serverId: McpServerId,
  env: NodeJS.ProcessEnv = process.env
): Promise<ConnectionCheck> {
  const server = config.mcpServers[serverId];
  const contract = MCP_SERVER_CONTRACTS[serverId] as McpServerContract | undefined;
  if (!server || !contract) {
    return withReadiness(skipped("mcp", serverId, `unknown MCP server: ${serverId}`, [], []), []);
  }
  if (!server.configured) {
    const message = server.warnings[0] ?? "required environment variables are missing";
    return withReadiness(skipped("mcp", serverId, message, server.envKeys, server.missingEnv), [
      { stage: "transport", status: "skipped", message: "server is not fully configured" },
      { stage: "credential-probe", status: "skipped", message },
      { stage: "protocol-tools-list", status: "skipped", message: "protocol readiness requires configured transport and credentials" }
    ]);
  }

  switch (serverId) {
    case "notion":
      return testRestAdapter(serverId, server.envKeys, "https://api.notion.com/v1/users/me", {
        Authorization: `Bearer ${env.NOTION_TOKEN}`,
        "Notion-Version": "2026-03-11"
      }, contract.protocolReason);
    case "github":
      return testRestAdapter(serverId, server.envKeys, "https://api.github.com/rate_limit", {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2026-03-10"
      }, contract.protocolReason);
    case "figma":
      return testRestAdapter(serverId, server.envKeys, "https://api.figma.com/v1/me", {
        "X-Figma-Token": env.FIGMA_TOKEN ?? ""
      }, contract.protocolReason);
    case "stitch":
      return testStitchToolsList(server.envKeys, server.url ?? STITCH_MCP_URL, env);
    default:
      return withReadiness(skipped("mcp", serverId, "no probe is defined for this MCP server", server.envKeys, []), []);
  }
}

export async function testAllAiConnections(config: HarnessConfig): Promise<ConnectionCheck[]> {
  const ids = Object.keys(config.aiProviders) as AiProviderId[];
  return Promise.all(ids.map((id) => testAiConnection(config, id)));
}

export async function testAllMcpConnections(config: HarnessConfig): Promise<ConnectionCheck[]> {
  const ids = Object.keys(config.mcpServers) as McpServerId[];
  return Promise.all(ids.map((id) => testMcpConnection(config, id)));
}

async function testAiGenerationSmoke(
  config: HarnessConfig,
  providerId: AiProviderId,
  credentialProbe: ConnectionCheck,
  env: NodeJS.ProcessEnv
): Promise<ConnectionCheck> {
  const credentialStage: ReadinessStage = {
    stage: "credential-probe",
    status: credentialProbe.status,
    message: credentialProbe.status === "passed"
      ? `model catalog credential probe passed (${statusFromMessage(credentialProbe.message)})`
      : credentialProbe.message,
    endpoint: credentialProbe.endpoint
  };
  if (credentialProbe.status !== "passed") {
    return withReadiness({
      ...credentialProbe,
      message: `credential: ${credentialProbe.message}; generation: skipped`
    }, [
      { stage: "transport", status: "failed", message: credentialProbe.message, endpoint: credentialProbe.endpoint },
      credentialStage,
      { stage: "protocol-tool-call", status: "skipped", message: "generation smoke skipped because credential probe failed" }
    ]);
  }

  try {
    const result = await generateAiText(config, {
      providerId,
      system: "You are an RPH connection smoke test. Reply with OK.",
      prompt: "Reply with exactly OK.",
      maxOutputTokens: 64,
      temperature: 0
    }, env);
    return withReadiness({
      ...credentialProbe,
      status: "passed",
      message: `credential: ${credentialStage.message}; generation: smoke passed`,
      endpoint: result.endpoint
    }, [
      { stage: "transport", status: "passed", message: "provider endpoint reachable", endpoint: credentialProbe.endpoint },
      credentialStage,
      { stage: "protocol-tool-call", status: "passed", message: "generation smoke passed", endpoint: result.endpoint }
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return withReadiness({
      ...credentialProbe,
      status: "failed",
      message: `credential: ${credentialStage.message}; generation: ${message}`
    }, [
      { stage: "transport", status: "passed", message: "provider endpoint reachable", endpoint: credentialProbe.endpoint },
      credentialStage,
      { stage: "protocol-tool-call", status: "failed", message }
    ]);
  }
}

async function testRestAdapter(
  id: McpServerId,
  requiredEnv: string[],
  endpoint: string,
  headers: Record<string, string>,
  protocolReason = "this integration uses a REST adapter, not an MCP protocol session"
): Promise<ConnectionCheck> {
  const result = await fetchProbe(endpoint, headers);
  const status = result.ok ? "passed" : "failed";
  const statusText = result.status ?? "network";
  const credentialMessage = result.ok ? `credential probe passed (${statusText})` : result.message;
  return withReadiness({
    id,
    kind: "mcp",
    status,
    message: `credential: ${credentialMessage}; protocol: not applicable (${protocolReason})`,
    requiredEnv,
    missingEnv: [],
    endpoint: result.endpoint,
    checkedAt: nowIso()
  }, [
    { stage: "transport", status, message: result.ok ? `transport reachable (${statusText})` : result.message, endpoint: result.endpoint },
    { stage: "credential-probe", status, message: credentialMessage, endpoint: result.endpoint },
    { stage: "protocol-tools-list", status: "not-applicable", message: protocolReason }
  ]);
}

async function testStitchToolsList(
  requiredEnv: string[],
  endpoint: string,
  env: NodeJS.ProcessEnv
): Promise<ConnectionCheck> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: "rph-connection-check",
    method: "tools/list",
    params: {}
  });
  const result = await fetchProbe(endpoint, {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": env.STITCH_API_KEY ?? ""
  }, { method: "POST", body });

  const tools = result.ok ? extractToolList(result.json) : null;
  if (result.ok && tools) {
    const toolCount = tools.length;
    return withReadiness({
      id: "stitch",
      kind: "mcp",
      status: "passed",
      message: `credential: authenticated MCP request accepted (${result.status}); protocol: tools/list passed (${result.status}; ${toolCount} tools)`,
      requiredEnv,
      missingEnv: [],
      endpoint: result.endpoint,
      checkedAt: nowIso()
    }, [
      { stage: "transport", status: "passed", message: `transport reachable (${result.status})`, endpoint: result.endpoint },
      { stage: "credential-probe", status: "passed", message: `authenticated MCP request accepted (${result.status})`, endpoint: result.endpoint },
      { stage: "protocol-tools-list", status: "passed", message: `tools/list passed (${result.status}; ${toolCount} tools)`, endpoint: result.endpoint }
    ]);
  }

  const protocolMessage = result.ok ? "tools/list did not return an MCP tool list" : result.message;
  return withReadiness({
    id: "stitch",
    kind: "mcp",
    status: "failed",
    message: `credential: ${protocolMessage}; protocol: ${protocolMessage}`,
    requiredEnv,
    missingEnv: [],
    endpoint: result.endpoint,
    checkedAt: nowIso()
  }, [
    { stage: "transport", status: result.status ? "passed" : "failed", message: result.message, endpoint: result.endpoint },
    { stage: "credential-probe", status: "failed", message: protocolMessage, endpoint: result.endpoint },
    { stage: "protocol-tools-list", status: "failed", message: protocolMessage, endpoint: result.endpoint }
  ]);
}

async function probe(
  kind: ConnectionCheck["kind"],
  id: string,
  requiredEnv: string[],
  endpoint: string,
  headers: Record<string, string>,
  init: Pick<RequestInit, "method" | "body"> = {}
): Promise<ConnectionCheck> {
  const result = await fetchProbe(endpoint, headers, init);
  return {
    id,
    kind,
    status: result.ok ? "passed" : "failed",
    message: result.message,
    requiredEnv,
    missingEnv: [],
    endpoint: result.endpoint,
    checkedAt: nowIso()
  };
}

async function fetchProbe(
  endpoint: string,
  headers: Record<string, string>,
  init: Pick<RequestInit, "method" | "body"> = {}
): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(endpoint, {
      method: init.method ?? "GET",
      headers,
      body: init.body,
      signal: controller.signal
    });
    const json = await readJsonSafely(response);
    return {
      ok: response.ok,
      status: response.status,
      message: response.ok ? `connected (${response.status})` : `request failed (${response.status})`,
      endpoint: redactEndpoint(endpoint),
      json
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: null,
      message,
      endpoint: redactEndpoint(endpoint)
    };
  } finally {
    clearTimeout(timer);
  }
}

async function readJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function extractToolList(payload: unknown): unknown[] | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const result = (payload as { result?: unknown }).result;
  if (!result || typeof result !== "object") {
    return null;
  }
  const tools = (result as { tools?: unknown }).tools;
  return Array.isArray(tools) ? tools : null;
}

function skipped(
  kind: ConnectionCheck["kind"],
  id: string,
  message: string,
  requiredEnv: string[],
  missingEnv: string[]
): ConnectionCheck {
  return {
    id,
    kind,
    status: "skipped",
    message,
    requiredEnv,
    missingEnv,
    checkedAt: nowIso()
  };
}

function withReadiness(check: ConnectionCheck, stages: ReadinessStage[]): ConnectionCheck {
  return {
    ...check,
    readiness: {
      provenStage: provenStage(stages),
      stages
    }
  };
}

function provenStage(stages: ReadinessStage[]): Readiness["provenStage"] {
  const passed = stages.filter((stage) => stage.status === "passed").map((stage) => stage.stage);
  if (passed.includes("protocol-tool-call")) {
    return "protocol-tool-call";
  }
  if (passed.includes("protocol-tools-list")) {
    return "protocol-tools-list";
  }
  if (passed.includes("credential-probe")) {
    return "credential-probe";
  }
  if (passed.includes("transport")) {
    return "transport";
  }
  return "none";
}

function statusFromMessage(message: string): string {
  return message.match(/\(([^)]+)\)/)?.[1] ?? "ok";
}

function redactEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  if (url.searchParams.has("key")) {
    url.searchParams.set("key", "<redacted>");
  }
  return url.toString();
}
