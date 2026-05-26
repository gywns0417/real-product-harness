import { NOTION_HOSTED_MCP_URL } from "./notion";

export interface McpConfig {
  mcpPolicyRegistry?: {
    version: 1;
    defaults: {
      toolCallMode: "read-only-allowlist";
      requireExplicitServerSelection: boolean;
    };
    servers: Record<string, {
      kind: "rest-adapter-readback" | "protocol-tools-list" | "read-only-allowlist" | "read-only-probe" | "missing-policy";
      source: "built-in" | "custom" | "runtime";
      protocolReadiness: "tools/list" | "tools/call" | "not-applicable";
      protocolToolCallProbe?: McpProtocolToolCallProbe;
      allowToolsList: boolean;
      allowReadOnlyToolCall: boolean;
      requireExplicitServerSelection: boolean;
      agentReadOnlyTools: string[];
    }>;
  };
  mcpServers: Record<string, McpServerConfig>;
}

export interface McpServerConfig {
  name?: string;
  kind: "mcp-server" | "rest-adapter";
  enabled: boolean;
  transport: "stdio" | "http";
  command?: string;
  url?: string;
  auth?: McpServerAuthContract;
  protocolReadiness?: "tools/list" | "tools/call" | "not-applicable";
  protocolToolCallProbe?: McpProtocolToolCallProbe;
  agentReadOnlyTools?: string[];
  protocolReason?: string;
  custom?: boolean;
  env?: Record<string, string>;
  notes: string;
}

export type McpServerAuthMode = "none" | "x-goog-api-key" | "bearer";

export interface McpServerAuthContract {
  mode: McpServerAuthMode;
  envKey?: string;
}

export interface McpProtocolToolCallProbe {
  toolName: string;
  arguments?: Record<string, unknown>;
}

export interface McpServerContract {
  id: string;
  name: string;
  kind: "mcp-server" | "rest-adapter";
  transport: "stdio" | "http";
  envKeys: string[];
  auth?: McpServerAuthContract;
  command?: string;
  url?: string;
  protocolReadiness: "tools/list" | "tools/call" | "not-applicable";
  protocolToolCallProbe?: McpProtocolToolCallProbe;
  agentReadOnlyTools?: string[];
  protocolReason?: string;
  notes: string;
}

export const STITCH_MCP_URL = "https://stitch.googleapis.com/mcp";

export const MCP_SERVER_CONTRACTS = {
  notion: {
    id: "notion",
    name: "Notion REST adapter",
    kind: "rest-adapter",
    transport: "http",
    url: NOTION_HOSTED_MCP_URL,
    envKeys: ["NOTION_TOKEN", "NOTION_PARENT_PAGE_ID"],
    protocolReadiness: "not-applicable",
    protocolReason: "Hosted Notion MCP uses OAuth; PAT-based REST probes do not prove MCP protocol readiness.",
    notes: "REST adapter for Notion page/workspace operations. Hosted MCP can be added separately with OAuth."
  },
  github: {
    id: "github",
    name: "GitHub local REST adapter",
    kind: "rest-adapter",
    transport: "stdio",
    command: "gh",
    envKeys: ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO"],
    protocolReadiness: "not-applicable",
    protocolReason: "Local adapter wraps gh/GitHub REST rather than exposing MCP protocol tools.",
    notes: "Local adapter over gh/GitHub REST. Repository target resolves from normalized owner/repo settings."
  },
  figma: {
    id: "figma",
    name: "Figma REST adapter",
    kind: "rest-adapter",
    transport: "http",
    url: "https://api.figma.com",
    envKeys: ["FIGMA_TOKEN", "FIGMA_FILE_ID"],
    protocolReadiness: "not-applicable",
    protocolReason: "Direct Figma REST probe validates credentials only, not MCP protocol readiness.",
    notes: "REST adapter for Figma API. HTML/CSS preview stays available when disabled."
  },
  stitch: {
    id: "stitch",
    name: "Stitch MCP server",
    kind: "mcp-server",
    transport: "http",
    url: STITCH_MCP_URL,
    envKeys: ["STITCH_API_KEY"],
    auth: {
      mode: "x-goog-api-key",
      envKey: "STITCH_API_KEY"
    },
    protocolReadiness: "tools/call",
    protocolToolCallProbe: {
      toolName: "list_projects",
      arguments: {
        filter: "view=owned"
      }
    },
    agentReadOnlyTools: ["list_projects"],
    notes: "MCP streamable HTTP endpoint. Readiness proves initialize, tools/list, and a read-only tools/call canary."
  }
} as const satisfies Record<string, McpServerContract>;

export function createMcpConfig(enabledServers: string[] = []): McpConfig {
  const enabled = (name: string) => enabledServers.includes(name);
  const contracts = Object.values(MCP_SERVER_CONTRACTS) as McpServerContract[];
  return {
    mcpServers: Object.fromEntries(contracts.map((contract) => [
      contract.id,
      {
        kind: contract.kind,
        enabled: enabled(contract.id),
        transport: contract.transport,
        command: contract.command,
        url: contract.url,
        auth: contract.auth,
        protocolReadiness: contract.protocolReadiness,
        protocolReason: contract.protocolReason,
        agentReadOnlyTools: contract.agentReadOnlyTools,
        env: Object.fromEntries(contract.envKeys.map((key) => [key, `\${${key}}`])),
        notes: contract.notes
      } satisfies McpServerConfig
    ]))
  };
}
