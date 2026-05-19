import { validateEnv } from "../../../packages/core/src/env";

export function validateHarnessEnv(env: NodeJS.ProcessEnv = process.env) {
  return {
    github: validateEnv(env, ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO"]),
    notion: validateEnv(env, ["NOTION_TOKEN", "NOTION_PARENT_PAGE_ID"]),
    ai: validateEnv(env, ["OPENAI_API_KEY"])
  };
}
