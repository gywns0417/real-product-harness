export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

export interface McpServerConfig {
  enabled: boolean;
  transport: "stdio" | "http";
  command?: string;
  url?: string;
  env?: Record<string, string>;
  notes: string;
}

export function createMcpConfig(): McpConfig {
  return {
    mcpServers: {
      notion: {
        enabled: false,
        transport: "http",
        url: "https://mcp.notion.com/mcp",
        env: {
          NOTION_TOKEN: "${NOTION_TOKEN}"
        },
        notes: "Enable only after user approval and workspace/page permission review."
      },
      github: {
        enabled: false,
        transport: "stdio",
        command: "gh",
        env: {
          GITHUB_TOKEN: "${GITHUB_TOKEN}"
        },
        notes: "Phase 1 uses local templates and dry-run commands by default."
      },
      figma: {
        enabled: false,
        transport: "http",
        url: "https://api.figma.com",
        env: {
          FIGMA_TOKEN: "${FIGMA_TOKEN}"
        },
        notes: "Fallback to HTML/CSS preview when disabled."
      }
    }
  };
}
