#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliEntry = path.join(repoRoot, "dist", "apps", "cli", "src", "index.js");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-provider-onboarding-"));
const preloadPath = path.join(tmpRoot, "provider-success-preload.cjs");

if (!fs.existsSync(cliEntry)) {
  fail(`CLI dist entry not found: ${cliEntry}. Run pnpm run build first.`);
}

fs.writeFileSync(preloadPath, [
  "global.fetch = async (url, init = {}) => {",
  "  const target = String(url);",
  "  const method = init.method || 'GET';",
  "  if (target.includes('api.openai.com') && target.endsWith('/models')) {",
  "    return json({ data: [{ id: 'gpt-5.4' }] });",
  "  }",
  "  if (target.includes('api.openai.com') && target.endsWith('/responses') && method === 'POST') {",
  "    return json({ output_text: 'OK', usage: { input_tokens: 4, output_tokens: 1 } });",
  "  }",
  "  if (target.includes('api.anthropic.com') && target.endsWith('/models')) {",
  "    return json({ data: [{ id: 'claude-sonnet-4-5' }] });",
  "  }",
  "  if (target.includes('api.anthropic.com') && target.endsWith('/messages') && method === 'POST') {",
  "    return json({ content: [{ type: 'text', text: 'OK' }], usage: { input_tokens: 4, output_tokens: 1 } });",
  "  }",
  "  if (target.includes('generativelanguage.googleapis.com') && target.includes('/models') && method === 'GET') {",
  "    return json({ models: [{ name: 'models/gemini-2.5-flash' }] });",
  "  }",
  "  if (target.includes('generativelanguage.googleapis.com') && target.includes(':generateContent') && method === 'POST') {",
  "    return json({ candidates: [{ content: { parts: [{ text: 'OK' }] } }], usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 1 } });",
  "  }",
  "  if (target.includes('127.0.0.1:11434') && target.endsWith('/api/tags')) {",
  "    return json({ models: [{ name: 'local' }] });",
  "  }",
  "  if (target.includes('127.0.0.1:11434') && target.endsWith('/api/generate') && method === 'POST') {",
  "    return json({ response: 'OK' });",
  "  }",
  "  return new Response(JSON.stringify({ error: { message: `unexpected provider URL ${method} ${target}` } }), { status: 500, headers: { 'content-type': 'application/json' } });",
  "};",
  "function json(data) {",
  "  return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });",
  "}"
].join("\n"), "utf8");

const providers = [
  {
    id: "openai",
    env: { OPENAI_API_KEY: "test-openai" }
  },
  {
    id: "anthropic",
    env: { ANTHROPIC_API_KEY: "test-anthropic" }
  },
  {
    id: "gemini",
    env: { GEMINI_API_KEY: "test-gemini" }
  },
  {
    id: "local",
    env: { LOCAL_AI_BASE_URL: "http://127.0.0.1:11434" }
  }
];

for (const provider of providers) {
  const projectRoot = path.join(tmpRoot, provider.id);
  fs.mkdirSync(projectRoot, { recursive: true });
  const env = { ...withoutProviderEnv(process.env), ...provider.env, NO_COLOR: "1" };

  const setup = runCli(projectRoot, ["setup", "auto", "--from-env", "--live", "--ai", provider.id, "--mcp", "none"], env);
  if (setup.status !== 0) {
    fail(`${provider.id} setup failed\nstdout:\n${setup.stdout}\nstderr:\n${setup.stderr}`);
  }
  assertIncludes(setup.stdout, "setup live check passed", `${provider.id} setup`);
  assertIncludes(setup.stdout, "Ready actions", `${provider.id} setup`);
  assertIncludes(setup.stdout, `ai:${provider.id} chat: /ai run --provider ${provider.id}`, `${provider.id} setup`);

  const ask = runCli(projectRoot, ["ask", `${provider.id} 연결 확인`], withoutProviderEnv(process.env));
  if (ask.status !== 0) {
    fail(`${provider.id} ask failed\nstdout:\n${ask.stdout}\nstderr:\n${ask.stderr}`);
  }
  assertIncludes(ask.stdout, "OK", `${provider.id} ask`);

  const report = readJson(path.join(projectRoot, ".rph", "connections", "latest.json"));
  const checks = Array.isArray(report.checks) ? report.checks : [];
  if (checks.length !== 1 || checks[0]?.kind !== "ai" || checks[0]?.id !== provider.id || checks[0]?.status !== "passed") {
    fail(`${provider.id} expected exactly one passed provider check, got ${JSON.stringify(checks)}`);
  }
  if (checks[0]?.readiness?.provenStage !== "protocol-tool-call") {
    fail(`${provider.id} expected protocol-tool-call readiness, got ${checks[0]?.readiness?.provenStage ?? "missing"}`);
  }

  const session = readJson(path.join(projectRoot, ".rph", "runtime", "current-session.json"));
  if (session.activeTurn?.status !== "complete") {
    fail(`${provider.id} expected complete active turn, got ${session.activeTurn?.status ?? "missing"}`);
  }
}

console.log("provider onboarding smoke passed");
console.log(`tmp: ${tmpRoot}`);

function runCli(cwd, args, envValues) {
  return spawnSync(process.execPath, ["--require", preloadPath, cliEntry, ...args], {
    cwd,
    env: envValues,
    encoding: "utf8"
  });
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`missing file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function withoutProviderEnv(baseEnv) {
  const next = { ...baseEnv };
  for (const key of [
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_MODEL",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_MODEL",
    "GEMINI_API_KEY",
    "GEMINI_BASE_URL",
    "GEMINI_MODEL",
    "LOCAL_AI_BASE_URL",
    "LOCAL_AI_MODEL",
    "NOTION_TOKEN",
    "NOTION_PARENT_PAGE_ID",
    "GITHUB_TOKEN",
    "GITHUB_OWNER",
    "GITHUB_REPO",
    "FIGMA_TOKEN",
    "FIGMA_FILE_ID",
    "STITCH_API_KEY"
  ]) {
    delete next[key];
  }
  return next;
}

function assertIncludes(text, expected, label) {
  if (!text.includes(expected)) {
    fail(`${label} missing expected content: ${expected}\nactual:\n${text}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
