import { EnvValidation } from "./types";

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
