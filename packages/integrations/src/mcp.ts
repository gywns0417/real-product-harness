import { NOTION_HOSTED_MCP_URL } from "./notion";

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

export interface McpServerConfig {
  kind: "mcp-server" | "rest-adapter";
  enabled: boolean;
  transport: "stdio" | "http";
  command?: string;
  url?: string;
  env?: Record<string, string>;
  notes: string;
}

export interface McpServerContract {
  id: string;
  name: string;
  kind: "mcp-server" | "rest-adapter";
  transport: "stdio" | "http";
  envKeys: string[];
  command?: string;
  url?: string;
  protocolReadiness: "tools/list" | "not-applicable";
  protocolReason?: string;
  notes: string;
}

export const STITCH_MCP_URL = "https://stitch.googleapis.com/mcp";

export const MCP_SERVER_CONTRACTS = {
  notion: {
    id: "notion",
    name: "Notion hosted MCP server",
    kind: "mcp-server",
    transport: "http",
    url: NOTION_HOSTED_MCP_URL,
    envKeys: ["NOTION_TOKEN", "NOTION_PARENT_PAGE_ID"],
    protocolReadiness: "not-applicable",
    protocolReason: "Hosted Notion MCP uses OAuth; PAT-based REST probes do not prove MCP protocol readiness.",
    notes: "Hosted MCP server. Workspace/page targeting still depends on NOTION_PARENT_PAGE_ID."
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
    name: "Stitch REST adapter",
    kind: "rest-adapter",
    transport: "http",
    url: STITCH_MCP_URL,
    envKeys: ["STITCH_API_KEY"],
    protocolReadiness: "tools/list",
    notes: "REST adapter for the Stitch MCP-compatible endpoint."
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
        env: Object.fromEntries(contract.envKeys.map((key) => [key, `\${${key}}`])),
        notes: contract.notes
      } satisfies McpServerConfig
    ]))
  };
}
