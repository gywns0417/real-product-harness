import { validateEnv } from "../../../packages/core/src/env";

export function validateHarnessEnv(env: NodeJS.ProcessEnv = process.env) {
  return {
    github: validateGitHubEnv(env),
    notion: validateEnv(env, ["NOTION_TOKEN", "NOTION_PARENT_PAGE_ID"]),
    openai: validateEnv(env, ["OPENAI_API_KEY"]),
    anthropic: validateEnv(env, ["ANTHROPIC_API_KEY"]),
    gemini: validateEnv(env, ["GEMINI_API_KEY"]),
    figma: validateEnv(env, ["FIGMA_TOKEN", "FIGMA_FILE_ID"]),
    stitch: validateEnv(env, ["STITCH_API_KEY"])
  };
}

function validateGitHubEnv(env: NodeJS.ProcessEnv) {
  const result = validateEnv(env, ["GITHUB_OWNER", "GITHUB_REPO"]);
  const hasCredential = Boolean(env.GITHUB_TOKEN || env.GH_TOKEN || env.GITHUB_TOKEN_SOURCE === "gh-cli");
  return {
    valid: result.valid && hasCredential,
    missing: [...result.missing, ...(hasCredential ? [] : ["GITHUB_TOKEN"])],
    present: [...result.present, ...(hasCredential ? ["GITHUB_TOKEN"] : [])]
  };
}
