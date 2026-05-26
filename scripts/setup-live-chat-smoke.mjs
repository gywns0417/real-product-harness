#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliEntry = path.join(repoRoot, "dist", "apps", "cli", "src", "index.js");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-setup-live-chat-"));
const preloadPath = path.join(tmpRoot, "openai-success-preload.cjs");

if (!fs.existsSync(cliEntry)) {
  fail(`CLI dist entry not found: ${cliEntry}. Run pnpm run build first.`);
}

fs.writeFileSync(preloadPath, [
  "global.fetch = async (url) => {",
  "  const target = String(url);",
  "  if (target.endsWith('/models')) {",
  "    return new Response(JSON.stringify({ data: [{ id: 'gpt-5.4' }] }), { status: 200, headers: { 'content-type': 'application/json' } });",
  "  }",
  "  if (target.endsWith('/responses')) {",
  "    return new Response(JSON.stringify({ output_text: 'OK', usage: { input_tokens: 4, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });",
  "  }",
  "  return new Response(JSON.stringify({ error: { message: `unexpected URL ${target}` } }), { status: 500, headers: { 'content-type': 'application/json' } });",
  "};"
].join("\n"), "utf8");

const env = {
  ...withoutProviderEnv(process.env),
  OPENAI_API_KEY: "test-openai"
};

const setup = runCli(["setup", "auto", "--from-env", "--live", "--ai", "openai", "--mcp", "none"], env);
if (setup.status !== 0) {
  fail(`setup-live-chat setup failed\nstdout:\n${setup.stdout}\nstderr:\n${setup.stderr}`);
}
assertIncludes(setup.stdout, "setup live check passed", "setup output");

const ask = runCli(["ask", "연결 확인 인사해줘"], withoutProviderEnv(process.env));
if (ask.status !== 0) {
  fail(`setup-live-chat ask failed\nstdout:\n${ask.stdout}\nstderr:\n${ask.stderr}`);
}
assertIncludes(ask.stdout, "OK", "ask output");

const reportPath = path.join(tmpRoot, ".rph", "connections", "latest.json");
const sessionPath = path.join(tmpRoot, ".rph", "runtime", "current-session.json");
assertFile(reportPath, "connection report");
assertFile(sessionPath, "runtime session");

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const checks = Array.isArray(report.checks) ? report.checks : [];
if (checks.length !== 1 || checks[0]?.kind !== "ai" || checks[0]?.id !== "openai" || checks[0]?.status !== "passed") {
  fail(`expected exactly one passed openai check, got ${JSON.stringify(checks)}`);
}

const session = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
if (session.activeTurn?.status !== "complete") {
  fail(`expected complete active turn, got ${session.activeTurn?.status ?? "missing"}`);
}

console.log("setup live chat smoke passed");
console.log(`tmp: ${tmpRoot}`);

function runCli(args, envValues) {
  return spawnSync(process.execPath, ["--require", preloadPath, cliEntry, ...args], {
    cwd: tmpRoot,
    env: envValues,
    encoding: "utf8"
  });
}

function withoutProviderEnv(baseEnv) {
  const next = { ...baseEnv };
  for (const key of [
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_MODEL",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "LOCAL_AI_BASE_URL",
    "NOTION_TOKEN",
    "GITHUB_TOKEN",
    "FIGMA_TOKEN",
    "STITCH_API_KEY"
  ]) {
    delete next[key];
  }
  return next;
}

function assertFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`${label} missing: ${filePath}`);
  }
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
