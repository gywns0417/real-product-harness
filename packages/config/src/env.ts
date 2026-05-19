import { validateEnv } from "../../../packages/core/src/env";

export function validateHarnessEnv(env: NodeJS.ProcessEnv = process.env) {
  return {
    github: validateEnv(env, ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO"]),
    notion: validateEnv(env, ["NOTION_TOKEN", "NOTION_PARENT_PAGE_ID"]),
    openai: validateEnv(env, ["OPENAI_API_KEY"]),
    anthropic: validateEnv(env, ["ANTHROPIC_API_KEY"]),
    gemini: validateEnv(env, ["GEMINI_API_KEY"]),
    figma: validateEnv(env, ["FIGMA_TOKEN", "FIGMA_FILE_ID"]),
    stitch: validateEnv(env, ["STITCH_API_KEY"])
  };
}
