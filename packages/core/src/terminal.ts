import { HarnessConfig } from "./types";

const ansi = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  cyan: "\u001b[36m",
  green: "\u001b[32m",
  magenta: "\u001b[35m",
  red: "\u001b[31m",
  yellow: "\u001b[33m",
  gray: "\u001b[90m"
};

export function paint(value: string, color: keyof typeof ansi, enabled = true): string {
  if (!enabled) {
    return value;
  }
  return `${ansi[color]}${value}${ansi.reset}`;
}

export function renderRuntimeHero(projectRoot: string, sessionId: string, config?: HarnessConfig): string {
  const color = config?.ui.color ?? true;
  const activeAi = config?.activeAiProvider ?? "auto";
  const mcpEnabled = config
    ? Object.values(config.mcpServers).filter((server) => server.enabled && server.configured).map((server) => server.id).join(", ") || "none"
    : "not initialized";
  return [
    paint("  ____  ____  _   _", "cyan", color),
    paint(" |  _ \\|  _ \\| | | |", "cyan", color),
    paint(" | |_) | |_) | |_| |", "magenta", color),
    paint(" |  _ <|  __/|  _  |", "magenta", color),
    paint(" |_| \\_\\_|   |_| |_|", "green", color),
    "",
    `${paint("Real Product Harness", "bold", color)} ${paint("control plane online", "green", color)}`,
    `${paint("session", "gray", color)} ${sessionId}`,
    `${paint("project", "gray", color)} ${projectRoot}`,
    `${paint("ai", "gray", color)} ${activeAi}`,
    `${paint("mcp", "gray", color)} ${mcpEnabled}`,
    "",
    `${paint("try", "gray", color)} /setup auto  /doctor  /pm start  /next  /exit`
  ].join("\n");
}

export function renderStatusLine(label: string, status: "passed" | "failed" | "skipped" | "configured" | "missing"): string {
  const icon = status === "passed" || status === "configured" ? "[OK]" : status === "skipped" ? "[--]" : "[!!]";
  const color = status === "passed" || status === "configured" ? "green" : status === "skipped" ? "yellow" : "red";
  return `${paint(icon, color)} ${label}`;
}
