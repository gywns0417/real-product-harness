export const MCP_PROTOCOL_VERSION = "2025-06-18";

export interface McpHttpClientOptions {
  endpoint: string;
  apiKey?: string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  clientName?: string;
  clientVersion?: string;
}

export interface McpHttpSession {
  endpoint: string;
  protocolVersion: string;
  sessionId?: string;
  capabilities?: unknown;
  serverInfo?: unknown;
  instructions?: string;
}

export interface McpToolSummary {
  name: string;
  description?: string;
  inputSchema?: unknown;
  annotations?: unknown;
}

export interface McpToolsListResult {
  session: McpHttpSession;
  tools: McpToolSummary[];
}

export interface McpToolCallResult {
  session: McpHttpSession;
  result: unknown;
  content?: unknown;
  structuredContent?: unknown;
  isError?: boolean;
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: string | number | null;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
}

export async function openMcpHttpSession(options: McpHttpClientOptions): Promise<McpHttpSession> {
  const response = await postMcpRequest(options, {
    id: "rph-initialize",
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: options.clientName ?? "real-product-harness",
        version: options.clientVersion ?? "0.1.0"
      }
    }
  });
  const result = objectResult(response.payload, "initialize");
  const protocolVersion = stringField(result, "protocolVersion") ?? MCP_PROTOCOL_VERSION;
  const session: McpHttpSession = {
    endpoint: redactMcpEndpoint(options.endpoint),
    protocolVersion,
    sessionId: response.sessionId,
    capabilities: result.capabilities,
    serverInfo: result.serverInfo,
    instructions: stringField(result, "instructions")
  };

  await postMcpNotification(options, session, "notifications/initialized");
  return session;
}

export async function listMcpTools(options: McpHttpClientOptions): Promise<McpToolsListResult> {
  const session = await openMcpHttpSession(options);
  const response = await postMcpRequest(options, {
    id: "rph-tools-list",
    method: "tools/list",
    params: {}
  }, session);
  const result = objectResult(response.payload, "tools/list");
  const tools = Array.isArray(result.tools)
    ? result.tools.map(normalizeTool).filter((tool): tool is McpToolSummary => Boolean(tool))
    : [];
  return { session, tools };
}

export async function callMcpTool(
  options: McpHttpClientOptions,
  name: string,
  args: Record<string, unknown> = {}
): Promise<McpToolCallResult> {
  const toolName = name.trim();
  if (!toolName) {
    throw new Error("MCP tools/call requires a tool name");
  }
  const session = await openMcpHttpSession(options);
  const response = await postMcpRequest(options, {
    id: "rph-tools-call",
    method: "tools/call",
    params: {
      name: toolName,
      arguments: args
    }
  }, session);
  const result = objectResult(response.payload, "tools/call");
  return {
    session,
    result,
    content: result.content,
    structuredContent: result.structuredContent,
    isError: result.isError === true
  };
}

async function postMcpRequest(
  options: McpHttpClientOptions,
  request: { id: string; method: string; params: Record<string, unknown> },
  session?: McpHttpSession
): Promise<{ payload: JsonRpcResponse; sessionId?: string }> {
  const response = await postMcp(options, {
    jsonrpc: "2.0",
    id: request.id,
    method: request.method,
    params: request.params
  }, session);
  const payload = await readMcpJsonRpcResponse(response, request.id);
  if (payload.error) {
    throw new Error(`MCP ${request.method} failed: ${payload.error.message ?? `code ${payload.error.code ?? "unknown"}`}`);
  }
  return {
    payload,
    sessionId: response.headers.get("Mcp-Session-Id") ?? undefined
  };
}

async function postMcpNotification(
  options: McpHttpClientOptions,
  session: McpHttpSession,
  method: string
): Promise<void> {
  const response = await postMcp(options, {
    jsonrpc: "2.0",
    method
  }, session);
  if (!response.ok) {
    throw new Error(`MCP ${method} failed: HTTP ${response.status}`);
  }
}

async function postMcp(
  options: McpHttpClientOptions,
  payload: Record<string, unknown>,
  session?: McpHttpSession
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(options.endpoint, {
      method: "POST",
      headers: mcpHeaders(options, session),
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`MCP HTTP request failed (${response.status})`);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function mcpHeaders(options: McpHttpClientOptions, session?: McpHttpSession): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    "MCP-Protocol-Version": session?.protocolVersion ?? MCP_PROTOCOL_VERSION,
    ...options.headers
  };
  if (options.apiKey) {
    headers["X-Goog-Api-Key"] = options.apiKey;
  }
  if (session?.sessionId) {
    headers["Mcp-Session-Id"] = session.sessionId;
  }
  return headers;
}

async function readMcpJsonRpcResponse(response: Response, expectedId: string): Promise<JsonRpcResponse> {
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const payloads = contentType.includes("text/event-stream")
    ? parseSsePayloads(text)
    : [parseJsonPayload(text)];
  const match = payloads.find((payload) => isJsonRpcResponse(payload) && String(payload.id) === expectedId);
  if (!match) {
    throw new Error(`MCP response did not contain JSON-RPC response id ${expectedId}`);
  }
  return match;
}

function parseSsePayloads(text: string): unknown[] {
  const payloads: unknown[] = [];
  let dataLines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
      continue;
    }
    if (line === "") {
      if (dataLines.length > 0) {
        payloads.push(parseJsonPayload(dataLines.join("\n")));
        dataLines = [];
      }
    }
  }
  if (dataLines.length > 0) {
    payloads.push(parseJsonPayload(dataLines.join("\n")));
  }
  return payloads;
}

function parseJsonPayload(text: string): unknown {
  if (!text.trim()) {
    return {};
  }
  return JSON.parse(text) as unknown;
}

function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  return value !== null && typeof value === "object" && "id" in value;
}

function objectResult(payload: JsonRpcResponse, method: string): Record<string, unknown> {
  if (!payload.result || typeof payload.result !== "object") {
    throw new Error(`MCP ${method} response did not contain an object result`);
  }
  return payload.result as Record<string, unknown>;
}

function normalizeTool(value: unknown): McpToolSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const item = value as Record<string, unknown>;
  const name = typeof item.name === "string" ? item.name : "";
  if (!name) {
    return null;
  }
  return {
    name,
    description: typeof item.description === "string" ? item.description : undefined,
    inputSchema: item.inputSchema,
    annotations: item.annotations
  };
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  return typeof value[key] === "string" ? value[key] : undefined;
}

function redactMcpEndpoint(value: string): string {
  try {
    const url = new URL(value);
    for (const key of url.searchParams.keys()) {
      url.searchParams.set(key, "<redacted>");
    }
    return url.toString();
  } catch {
    return value;
  }
}
