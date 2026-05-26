import { MCP_SERVER_CONTRACTS, type McpServerAuthMode, type McpServerContract } from "../../integrations/src/mcp";
import { generateAiText } from "./ai";
import { checkGitHubCliWriteReadiness, githubRestToken } from "./github";
import { callMcpTool, listMcpTools } from "./mcp-client";
import { attachMcpPolicyEvaluation } from "./mcp-policy";
import { normalizeNotionPageId } from "./notion";
import { normalizeGitHubRepoTarget } from "./settings";
import { nowIso } from "./time";
import { AiProviderId, ConnectionCheck, HarnessConfig, McpServerId } from "./types";

type Readiness = NonNullable<ConnectionCheck["readiness"]>;
type ReadinessStage = Readiness["stages"][number];
type ConnectionIdentity = NonNullable<ConnectionCheck["identity"]>;
type FirstActionProof = NonNullable<ConnectionCheck["firstActionProof"]>;
type IdentityFromJson = (json: unknown) => ConnectionIdentity;

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
  const check = await testMcpConnectionRaw(config, serverId, env);
  return attachMcpPolicyEvaluation(config, check);
}

async function testMcpConnectionRaw(
  config: HarnessConfig,
  serverId: McpServerId,
  env: NodeJS.ProcessEnv = process.env
): Promise<ConnectionCheck> {
  const server = config.mcpServers[serverId];
  if (!server) {
    return withReadiness(skipped("mcp", serverId, `unknown MCP server: ${serverId}`, [], []), []);
  }
  const contract = mcpContractForRuntimeServer(server);
  if (!server.configured) {
    const message = server.warnings[0] ?? "required environment variables are missing";
    return withReadiness(skipped("mcp", serverId, message, server.envKeys, server.missingEnv), [
      { stage: "transport", status: "skipped", message: "server is not fully configured" },
      { stage: "credential-probe", status: "skipped", message },
      { stage: "protocol-tools-list", status: "skipped", message: "protocol readiness requires configured transport and credentials" }
    ]);
  }

  const protocolReadiness = server.protocolReadiness ?? contract.protocolReadiness;
  if (server.kind === "mcp-server" && (protocolReadiness === "tools/list" || protocolReadiness === "tools/call")) {
    return testProtocolMcpReadiness(serverId, server.name, server.envKeys, protocolMcpEndpoint(serverId, server.url ?? contract.url), {
      ...contract,
      protocolReadiness,
      protocolToolCallProbe: server.protocolToolCallProbe ?? contract.protocolToolCallProbe,
      agentReadOnlyTools: server.agentReadOnlyTools ?? contract.agentReadOnlyTools ?? []
    }, env);
  }

  switch (serverId) {
    case "notion": {
      const pageId = safeNormalizeNotionPageId(env.NOTION_PARENT_PAGE_ID ?? "");
      if (!pageId) {
        return invalidRestTarget(serverId, server.envKeys, "NOTION_PARENT_PAGE_ID must be a Notion page UUID or URL containing one");
      }
      return testRestAdapter(serverId, server.envKeys, `https://api.notion.com/v1/pages/${encodeURIComponent(pageId)}`, {
        Authorization: `Bearer ${env.NOTION_TOKEN}`,
        "Notion-Version": "2026-03-11"
      }, contract.protocolReason, () => notionIdentity(pageId));
    }
    case "github": {
      const target = normalizeGitHubRepoTarget(env.GITHUB_OWNER, env.GITHUB_REPO);
      if (!target.owner || !target.repo || target.warnings.length > 0) {
        return invalidRestTarget(serverId, server.envKeys, target.warnings[0] ?? "GITHUB_OWNER/GITHUB_REPO target is missing");
      }
      const owner = target.owner;
      const repo = target.repo;
      const restCheck = await testRestAdapter(serverId, server.envKeys, `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubRestToken(env)}`,
        "X-GitHub-Api-Version": "2026-03-10"
      }, contract.protocolReason, () => githubIdentity(owner, repo));
      return withGitHubExternalWriteReadiness(restCheck, owner, repo, env);
    }
    case "figma":
      return testRestAdapter(serverId, server.envKeys, `https://api.figma.com/v1/files/${encodeURIComponent(normalizeFigmaFileId(env.FIGMA_FILE_ID ?? ""))}?depth=1`, {
        "X-Figma-Token": env.FIGMA_TOKEN ?? ""
      }, contract.protocolReason, () => figmaIdentity(normalizeFigmaFileId(env.FIGMA_FILE_ID ?? "")));
    default:
      return withReadiness(skipped("mcp", serverId, "no probe is defined for this MCP server", server.envKeys, []), []);
  }
}

function safeNormalizeNotionPageId(value: string): string | null {
  try {
    return normalizeNotionPageId(value);
  } catch {
    return null;
  }
}

function normalizeFigmaFileId(value: string): string {
  const trimmed = value.trim();
  const urlMatch = trimmed.match(/figma\.com\/(?:file|design)\/([^/?#]+)/i);
  return urlMatch?.[1] ?? trimmed;
}

function invalidRestTarget(id: McpServerId, requiredEnv: string[], message: string): ConnectionCheck {
  return withReadiness({
    id,
    kind: "mcp",
    status: "failed",
    message: `credential: ${message}; protocol: not applicable`,
    requiredEnv,
    missingEnv: [],
    checkedAt: nowIso()
  }, [
    { stage: "transport", status: "skipped", message },
    { stage: "credential-probe", status: "failed", message },
    { stage: "protocol-tools-list", status: "not-applicable", message: "REST adapter target normalization failed before protocol probing" }
  ]);
}

function withGitHubExternalWriteReadiness(
  check: ConnectionCheck,
  owner: string,
  repo: string,
  env: NodeJS.ProcessEnv
): ConnectionCheck {
  const stages = check.readiness?.stages ?? [];
  if (check.status !== "passed") {
    return withReadiness(check, insertBeforeProtocolStage(stages, {
      stage: "external-write",
      status: "skipped",
      message: "REST repo target read must pass before gh write-channel preflight"
    }));
  }
  const readiness = checkGitHubCliWriteReadiness(owner, repo, env);
  const writeStage: ReadinessStage = {
    stage: "external-write",
    status: readiness.ok ? "passed" : "failed",
    message: readiness.message
  };
  return withReadiness({
    ...check,
    status: readiness.ok ? "passed" : "failed",
    message: `${check.message}; github-cli: ${readiness.message}`
  }, insertBeforeProtocolStage(stages, writeStage));
}

function insertBeforeProtocolStage(stages: ReadinessStage[], stage: ReadinessStage): ReadinessStage[] {
  const protocolIndex = stages.findIndex((item) => item.stage === "protocol-tools-list" || item.stage === "protocol-tool-call");
  if (protocolIndex === -1) {
    return [...stages, stage];
  }
  return [
    ...stages.slice(0, protocolIndex),
    stage,
    ...stages.slice(protocolIndex)
  ];
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
      endpoint: result.endpoint,
      identity: {
        type: "ai-provider",
        label: `${providerId} ${result.model}`,
        targetId: result.model,
        verifiedBy: "protocol-tool-call",
        source: "configuration"
      },
      firstActionProof: {
        action: `${providerId}.generation_smoke`,
        label: `generated smoke response with ${result.model}`,
        targetId: result.model,
        verifiedBy: "protocol-tool-call",
        endpoint: result.endpoint
      }
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
  protocolReason = "this integration uses a REST adapter, not an MCP protocol session",
  identityFromJson?: IdentityFromJson
): Promise<ConnectionCheck> {
  const result = await fetchProbe(endpoint, headers);
  const status = result.ok ? "passed" : "failed";
  const statusText = result.status ?? "network";
  const credentialMessage = result.ok ? `credential probe passed (${statusText})` : result.message;
  const identity = result.ok && identityFromJson ? identityFromJson(result.json) : undefined;
  const firstActionProof = identity ? restTargetReadProof(id, identity, result.endpoint) : undefined;
  return withReadiness({
    id,
    kind: "mcp",
    status,
    message: `credential: ${credentialMessage}; protocol: not applicable (${protocolReason})`,
    requiredEnv,
    missingEnv: [],
    endpoint: result.endpoint,
    identity,
    firstActionProof,
    checkedAt: nowIso()
  }, [
    { stage: "transport", status, message: result.ok ? `transport reachable (${statusText})` : result.message, endpoint: result.endpoint },
    { stage: "credential-probe", status, message: credentialMessage, endpoint: result.endpoint },
    { stage: "protocol-tools-list", status: "not-applicable", message: protocolReason }
  ]);
}

async function testProtocolMcpReadiness(
  serverId: McpServerId,
  serverName: string,
  requiredEnv: string[],
  endpoint: string,
  contract: McpServerContract,
  env: NodeJS.ProcessEnv
): Promise<ConnectionCheck> {
  try {
    const result = await listMcpTools({
      endpoint,
      headers: protocolMcpAuthHeaders(env, contract, serverId)
    });
    if (result.tools.length === 0) {
      const protocolMessage = "tools/list did not return an MCP tool list";
      return withReadiness({
        id: serverId,
        kind: "mcp",
        status: "failed",
        message: `credential: MCP initialize accepted; protocol: ${protocolMessage}`,
        requiredEnv,
        missingEnv: [],
        endpoint: result.session.endpoint,
        checkedAt: nowIso()
      }, [
        { stage: "transport", status: "passed", message: "streamable HTTP POST accepted", endpoint: result.session.endpoint },
        { stage: "credential-probe", status: "passed", message: "MCP initialize accepted", endpoint: result.session.endpoint },
        { stage: "protocol-tools-list", status: "failed", message: protocolMessage, endpoint: result.session.endpoint }
      ]);
    }
    const toolCount = result.tools.length;
    const sessionMessage = result.session.sessionId
      ? "MCP initialize accepted with session"
      : "MCP initialize accepted without session";
    const commonStages: ReadinessStage[] = [
      { stage: "transport", status: "passed", message: "streamable HTTP POST accepted", endpoint: result.session.endpoint },
      { stage: "credential-probe", status: "passed", message: sessionMessage, endpoint: result.session.endpoint },
      { stage: "protocol-tools-list", status: "passed", message: `tools/list passed (${toolCount} tools)`, endpoint: result.session.endpoint }
    ];
    if (contract.protocolReadiness === "tools/call") {
      return testProtocolMcpToolCall(serverId, serverName, requiredEnv, endpoint, contract, env, toolCount, commonStages);
    }
    return withReadiness({
      id: serverId,
      kind: "mcp",
      status: "passed",
      message: `credential: ${sessionMessage}; protocol: tools/list passed (${toolCount} tools)`,
      requiredEnv,
      missingEnv: [],
      endpoint: result.session.endpoint,
      identity: {
        type: "mcp-server",
        label: serverId,
        targetId: serverId,
        verifiedBy: "protocol-tools-list",
        source: "configuration"
      },
      firstActionProof: {
        action: "mcp.tools.list",
        label: `listed ${toolCount} MCP tools from ${serverName}`,
        targetId: serverId,
        verifiedBy: "protocol-tools-list",
        endpoint: result.session.endpoint
      },
      checkedAt: nowIso()
    }, commonStages);
  } catch (error) {
    const protocolMessage = error instanceof Error ? error.message : String(error);
    return withReadiness({
      id: serverId,
      kind: "mcp",
      status: "failed",
      message: `credential: ${protocolMessage}; protocol: ${protocolMessage}`,
      requiredEnv,
      missingEnv: [],
      endpoint: redactEndpoint(endpoint),
      checkedAt: nowIso()
    }, [
      { stage: "transport", status: "failed", message: protocolMessage, endpoint: redactEndpoint(endpoint) },
      { stage: "credential-probe", status: "failed", message: protocolMessage, endpoint: redactEndpoint(endpoint) },
      { stage: "protocol-tools-list", status: "failed", message: protocolMessage, endpoint: redactEndpoint(endpoint) }
    ]);
  }
}

async function testProtocolMcpToolCall(
  serverId: McpServerId,
  serverName: string,
  requiredEnv: string[],
  endpoint: string,
  contract: McpServerContract,
  env: NodeJS.ProcessEnv,
  toolCount: number,
  commonStages: ReadinessStage[]
): Promise<ConnectionCheck> {
  const probe = contract.protocolToolCallProbe;
  if (!probe?.toolName) {
    const message = "protocol tools/call readiness requires a configured read-only probe tool";
    return withReadiness({
      id: serverId,
      kind: "mcp",
      status: "failed",
      message: `credential: MCP initialize accepted; protocol: ${message}`,
      requiredEnv,
      missingEnv: [],
      endpoint: commonStages[2].endpoint,
      checkedAt: nowIso()
    }, [
      ...commonStages,
      { stage: "protocol-tool-call", status: "failed", message, endpoint: commonStages[2].endpoint }
    ]);
  }
  const allowedReadOnlyTools = new Set(contract.agentReadOnlyTools ?? []);
  if (!allowedReadOnlyTools.has(probe.toolName)) {
    const message = `protocol tools/call probe ${probe.toolName} is not in the agent read-only allowlist`;
    return withReadiness({
      id: serverId,
      kind: "mcp",
      status: "failed",
      message: `credential: MCP initialize accepted; protocol: ${message}`,
      requiredEnv,
      missingEnv: [],
      endpoint: commonStages[2].endpoint,
      checkedAt: nowIso()
    }, [
      ...commonStages,
      { stage: "protocol-tool-call", status: "failed", message, endpoint: commonStages[2].endpoint }
    ]);
  }
  try {
    const call = await callMcpTool({
      endpoint,
      headers: protocolMcpAuthHeaders(env, contract, serverId)
    }, probe.toolName, probe.arguments ?? {});
    if (call.isError) {
      throw new Error(`tools/call returned isError for ${probe.toolName}`);
    }
    return withReadiness({
      id: serverId,
      kind: "mcp",
      status: "passed",
      message: `credential: MCP initialize accepted; protocol: tools/list passed (${toolCount} tools); tools/call passed (${probe.toolName})`,
      requiredEnv,
      missingEnv: [],
      endpoint: call.session.endpoint,
      identity: {
        type: "mcp-server",
        label: serverId,
        targetId: serverId,
        verifiedBy: "protocol-tool-call",
        source: "configuration"
      },
      firstActionProof: {
        action: "mcp.tools.call",
        label: `called ${probe.toolName} on ${serverName}`,
        targetId: `${serverId}:${probe.toolName}`,
        verifiedBy: "protocol-tool-call",
        endpoint: call.session.endpoint
      },
      checkedAt: nowIso()
    }, [
      ...commonStages,
      { stage: "protocol-tool-call", status: "passed", message: `tools/call passed (${probe.toolName})`, endpoint: call.session.endpoint }
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return withReadiness({
      id: serverId,
      kind: "mcp",
      status: "failed",
      message: `credential: MCP initialize accepted; protocol: tools/list passed (${toolCount} tools); tools/call failed: ${message}`,
      requiredEnv,
      missingEnv: [],
      endpoint: commonStages[2].endpoint,
      checkedAt: nowIso()
    }, [
      ...commonStages,
      { stage: "protocol-tool-call", status: "failed", message, endpoint: commonStages[2].endpoint }
    ]);
  }
}

function protocolMcpAuthHeaders(
  env: NodeJS.ProcessEnv,
  contract: McpServerContract,
  serverId: McpServerId
): Record<string, string> | undefined {
  const auth = contract.auth ?? { mode: "none" as const };
  if (auth.mode === "none") {
    return undefined;
  }
  if (!auth.envKey) {
    throw new Error(`${serverId} uses auth mode ${auth.mode}, but no auth env key is declared in the MCP contract.`);
  }
  const secret = env[auth.envKey]?.trim();
  if (!secret) {
    throw new Error(`${serverId} auth secret missing: ${auth.envKey}`);
  }
  switch (auth.mode) {
    case "x-goog-api-key":
      return { "X-Goog-Api-Key": secret };
    case "bearer":
      return { Authorization: `Bearer ${secret}` };
    default:
      return unsupportedMcpAuthMode(auth.mode, serverId);
  }
}

function unsupportedMcpAuthMode(mode: McpServerAuthMode, serverId: McpServerId): never {
  throw new Error(`${serverId} uses unsupported MCP auth mode ${String(mode)}.`);
}

function protocolMcpEndpoint(serverId: McpServerId, endpoint?: string): string {
  if (endpoint) {
    return endpoint;
  }
  throw new Error(`${serverId} is a protocol MCP server, but no HTTP endpoint URL is configured.`);
}

function mcpContractForRuntimeServer(server: HarnessConfig["mcpServers"][string]): McpServerContract {
  const builtIn = (MCP_SERVER_CONTRACTS as Record<string, McpServerContract>)[server.id];
  if (builtIn) {
    return {
      ...builtIn,
      auth: server.authMode ? { mode: server.authMode, envKey: server.authEnvKey } : builtIn.auth,
      protocolReadiness: server.protocolReadiness ?? builtIn.protocolReadiness,
      protocolToolCallProbe: server.protocolToolCallProbe ?? builtIn.protocolToolCallProbe,
      agentReadOnlyTools: server.agentReadOnlyTools ?? builtIn.agentReadOnlyTools,
      protocolReason: server.protocolReason ?? builtIn.protocolReason,
      url: server.url ?? builtIn.url
    };
  }
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
      mode: readinessMode(stages),
      provenStage: provenStage(stages),
      stages
    }
  };
}

function readinessMode(stages: ReadinessStage[]): Readiness["mode"] {
  const passed = stages.filter((stage) => stage.status === "passed").map((stage) => stage.stage);
  const protocolStage = stages.find((stage) => stage.stage === "protocol-tool-call" || stage.stage === "protocol-tools-list");
  const externalWriteStage = stages.find((stage) => stage.stage === "external-write");
  if (protocolStage?.status === "passed") {
    return "protocol-ready";
  }
  if (passed.includes("credential-probe")) {
    if (externalWriteStage?.status === "passed") {
      return "adapter-write-ready";
    }
    if (externalWriteStage && externalWriteStage.status !== "skipped" && externalWriteStage.status !== "not-applicable") {
      return "adapter-partial";
    }
    if (protocolStage && protocolStage.status !== "not-applicable") {
      return "protocol-partial";
    }
    return "adapter-ready";
  }
  return "unverified";
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

function githubIdentity(owner: string, repo: string): ConnectionIdentity {
  return {
    type: "github-repo",
    label: `${owner}/${repo}`,
    targetId: `${owner}/${repo}`,
    verifiedBy: "credential-probe",
    source: "configuration"
  };
}

function notionIdentity(pageId: string): ConnectionIdentity {
  return {
    type: "notion-page",
    label: `Notion page ${shortTargetId(pageId)}`,
    targetId: pageId,
    verifiedBy: "credential-probe",
    source: "configuration"
  };
}

function figmaIdentity(fileId: string): ConnectionIdentity {
  return {
    type: "figma-file",
    label: `Figma file ${fileId}`,
    targetId: fileId,
    verifiedBy: "credential-probe",
    source: "configuration"
  };
}

function restTargetReadProof(id: McpServerId, identity: ConnectionIdentity, endpoint: string): FirstActionProof {
  return {
    action: `${id}.target_read`,
    label: `read target resource ${identity.label}`,
    targetId: identity.targetId,
    verifiedBy: "credential-probe",
    endpoint
  };
}

function shortTargetId(value: string): string {
  const compact = value.replace(/-/g, "");
  if (compact.length <= 12) {
    return value;
  }
  return `${compact.slice(0, 6)}...${compact.slice(-6)}`;
}
