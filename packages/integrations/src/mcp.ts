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

export function createMcpConfig(enabledServers: string[] = []): McpConfig {
  const enabled = (name: string) => enabledServers.includes(name);
  return {
    mcpServers: {
      notion: {
        enabled: enabled("notion"),
        transport: "http",
        url: "https://mcp.notion.com/mcp",
        env: {
          NOTION_TOKEN: "${NOTION_TOKEN}"
        },
        notes: "Enable only after user approval and workspace/page permission review."
      },
      github: {
        enabled: enabled("github"),
        transport: "stdio",
        command: "gh",
        env: {
          GITHUB_TOKEN: "${GITHUB_TOKEN}"
        },
        notes: "Phase 1 uses local templates and dry-run commands by default."
      },
      figma: {
        enabled: enabled("figma"),
        transport: "http",
        url: "https://api.figma.com",
        env: {
          FIGMA_TOKEN: "${FIGMA_TOKEN}"
        },
        notes: "Fallback to HTML/CSS preview when disabled."
      },
      stitch: {
        enabled: enabled("stitch"),
        transport: "http",
        url: "https://stitch.withgoogle.com",
        env: {
          STITCH_API_KEY: "${STITCH_API_KEY}"
        },
        notes: "Enable only when a live Stitch workflow is approved."
      }
    }
  };
}
