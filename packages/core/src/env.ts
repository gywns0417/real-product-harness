import { EnvValidation } from "./types";
import fs from "node:fs";
import path from "node:path";

export function validateEnv(env: NodeJS.ProcessEnv, keys: string[]): EnvValidation {
  const missing: string[] = [];
  const present: string[] = [];
  for (const key of keys) {
    if (env[key]) {
      present.push(key);
    } else {
      missing.push(key);
    }
  }
  return {
    valid: missing.length === 0,
    missing,
    present
  };
}

export const GITHUB_ENV_KEYS = ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO"];

export function loadEnvFile(filePath: string, env: NodeJS.ProcessEnv = process.env): string[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const loaded: string[] = [];
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }
    const key = line.slice(0, equalsIndex).trim();
    const rawValue = line.slice(equalsIndex + 1).trim();
    if (!key || env[key]) {
      continue;
    }
    env[key] = unquoteEnvValue(rawValue);
    loaded.push(key);
  }
  return loaded;
}

export interface EnvWriteResult {
  filePath: string;
  updatedKeys: string[];
  appendedKeys: string[];
}

export function upsertEnvFileValues(filePath: string, values: Record<string, string>): EnvWriteResult {
  const entries = Object.entries(values).filter(([key, value]) => key.trim() && value.trim());
  const updatedKeys: string[] = [];
  const appendedKeys: string[] = [];
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const lines = existing ? existing.split(/\r?\n/) : [];
  const seen = new Set<string>();
  const nextLines = lines.map((line) => {
    const match = line.match(/^(\s*([A-Za-z_][A-Za-z0-9_]*)\s*=)(.*)$/);
    if (!match) {
      return line;
    }
    const key = match[2];
    const nextValue = values[key];
    if (nextValue === undefined || !nextValue.trim()) {
      return line;
    }
    seen.add(key);
    updatedKeys.push(key);
    return `${key}=${formatEnvValue(nextValue)}`;
  });

  for (const [key, value] of entries) {
    if (seen.has(key)) {
      continue;
    }
    appendedKeys.push(key);
    nextLines.push(`${key}=${formatEnvValue(value)}`);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const output = trimTrailingBlankLines(nextLines).join("\n");
  fs.writeFileSync(filePath, output ? `${output}\n` : "", { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
  return { filePath, updatedKeys, appendedKeys };
}

function unquoteEnvValue(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function formatEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

function trimTrailingBlankLines(lines: string[]): string[] {
  const next = [...lines];
  while (next.length > 0 && next[next.length - 1] === "") {
    next.pop();
  }
  return next;
}
