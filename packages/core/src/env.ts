import { EnvValidation } from "./types";
import fs from "node:fs";

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

function unquoteEnvValue(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
