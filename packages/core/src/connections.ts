import { nowIso } from "./time";
import { AiProviderId, ConnectionCheck, HarnessConfig, McpServerId } from "./types";

export async function testAiConnection(
  config: HarnessConfig,
  providerId: AiProviderId,
  env: NodeJS.ProcessEnv = process.env
): Promise<ConnectionCheck> {
  const provider = config.aiProviders[providerId];
  if (!provider) {
    return skipped("ai", providerId, `unknown AI provider: ${providerId}`, [], []);
  }
  if (provider.missingEnv.length > 0) {
    return skipped("ai", providerId, "required environment variables are missing", provider.envKeys, provider.missingEnv);
  }
  switch (providerId) {
    case "openai":
      return probe("ai", providerId, provider.envKeys, `${provider.baseUrl}/models`, {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`
      });
    case "anthropic":
      return probe("ai", providerId, provider.envKeys, `${provider.baseUrl}/models`, {
        "x-api-key": env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01"
      });
    case "gemini":
      return probe("ai", providerId, provider.envKeys, `${provider.baseUrl}/models?key=${encodeURIComponent(env.GEMINI_API_KEY ?? "")}`, {});
    case "local":
      return probe("ai", providerId, provider.envKeys, provider.testEndpoint, {});
    default:
      return skipped("ai", providerId, "no probe is defined for this provider", provider.envKeys, []);
  }
}

export async function testMcpConnection(
  config: HarnessConfig,
  serverId: McpServerId,
  env: NodeJS.ProcessEnv = process.env
): Promise<ConnectionCheck> {
  const server = config.mcpServers[serverId];
  if (!server) {
    return skipped("mcp", serverId, `unknown MCP server: ${serverId}`, [], []);
  }
  if (server.missingEnv.length > 0) {
    return skipped("mcp", serverId, "required environment variables are missing", server.envKeys, server.missingEnv);
  }
  switch (serverId) {
    case "notion":
      return probe("mcp", serverId, server.envKeys, "https://api.notion.com/v1/users/me", {
        Authorization: `Bearer ${env.NOTION_TOKEN}`,
        "Notion-Version": "2026-03-11"
      });
    case "github":
      return probe("mcp", serverId, server.envKeys, "https://api.github.com/rate_limit", {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2026-03-10"
      });
    case "figma":
      return probe("mcp", serverId, server.envKeys, "https://api.figma.com/v1/me", {
        "X-Figma-Token": env.FIGMA_TOKEN ?? ""
      });
    case "stitch":
      return probe("mcp", serverId, server.envKeys, server.url ?? "https://stitch.googleapis.com/mcp", {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": env.STITCH_API_KEY ?? ""
      }, {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "rph-connection-check",
          method: "tools/list",
          params: {}
        })
      });
    default:
      return skipped("mcp", serverId, "no probe is defined for this MCP server", server.envKeys, []);
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

async function probe(
  kind: ConnectionCheck["kind"],
  id: string,
  requiredEnv: string[],
  endpoint: string,
  headers: Record<string, string>,
  init: Pick<RequestInit, "method" | "body"> = {}
): Promise<ConnectionCheck> {
  const checkedAt = nowIso();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(endpoint, {
      method: init.method ?? "GET",
      headers,
      body: init.body,
      signal: controller.signal
    });
    if (response.ok) {
      return {
        id,
        kind,
        status: "passed",
        message: `connected (${response.status})`,
        requiredEnv,
        missingEnv: [],
        endpoint: redactEndpoint(endpoint),
        checkedAt
      };
    }
    return {
      id,
      kind,
      status: "failed",
      message: `request failed (${response.status})`,
      requiredEnv,
      missingEnv: [],
      endpoint: redactEndpoint(endpoint),
      checkedAt
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id,
      kind,
      status: "failed",
      message,
      requiredEnv,
      missingEnv: [],
      endpoint: redactEndpoint(endpoint),
      checkedAt
    };
  } finally {
    clearTimeout(timer);
  }
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

function redactEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  if (url.searchParams.has("key")) {
    url.searchParams.set("key", "<redacted>");
  }
  return url.toString();
}
