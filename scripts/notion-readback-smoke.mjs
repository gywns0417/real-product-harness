#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliEntry = path.join(repoRoot, "dist", "apps", "cli", "src", "index.js");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-notion-readback-"));
const preloadPath = path.join(tmpRoot, "notion-readback-preload.cjs");
const capturePath = path.join(tmpRoot, "notion-fetch-calls.jsonl");

if (!fs.existsSync(cliEntry)) {
  fail(`CLI dist entry not found: ${cliEntry}. Run pnpm run build first.`);
}

fs.writeFileSync(preloadPath, [
  "const fs = require('node:fs');",
  `const capturePath = ${JSON.stringify(capturePath)};`,
  "let databaseCounter = 0;",
  "function capture(payload) { fs.appendFileSync(capturePath, JSON.stringify(payload) + '\\n'); }",
  "function json(data) { return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } }); }",
  "global.fetch = async (url, init = {}) => {",
  "  const target = String(url);",
  "  const method = init.method ?? 'GET';",
  "  capture({ target, method });",
  "  if (target.endsWith('/v1/pages') && method === 'POST') {",
  "    const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};",
  "    const title = body.properties?.title?.[0]?.text?.content ?? '';",
  "    const id = title.startsWith('Sync ') ? 'sync-page-id' : 'dashboard-page-id';",
  "    return json({ id, object: 'page', url: `https://notion.so/${id}`, archived: false });",
  "  }",
  "  if (target.endsWith('/v1/pages/dashboard-page-id')) {",
  "    return json({ id: 'dashboard-page-id', object: 'page', url: 'https://notion.so/dashboard-page-id', archived: false });",
  "  }",
  "  if (target.endsWith('/v1/pages/sync-page-id')) {",
  "    return json({ id: 'sync-page-id', object: 'page', url: 'https://notion.so/sync-page-id', archived: false });",
  "  }",
  "  if (target.endsWith('/v1/databases') && method === 'POST') {",
  "    databaseCounter += 1;",
  "    return json({ id: `database-${databaseCounter}`, object: 'database', url: `https://notion.so/database-${databaseCounter}` });",
  "  }",
  "  const databaseMatch = target.match(/\\/v1\\/databases\\/(database-\\d+)$/);",
  "  if (databaseMatch && method === 'GET') {",
  "    return json({ id: databaseMatch[1], object: 'database', url: `https://notion.so/${databaseMatch[1]}`, archived: false });",
  "  }",
  "  return new Response(JSON.stringify({ error: { message: `unexpected Notion URL ${target}` } }), { status: 500, headers: { 'content-type': 'application/json' } });",
  "};"
].join("\n"), "utf8");

const env = {
  ...withoutProviderEnv(process.env),
  NOTION_TOKEN: "test-notion-token",
  NOTION_PARENT_PAGE_ID: "1234567890abcdef1234567890abcdef"
};

const init = runCli(["init", "--yes", "--project-name", "Notion Readback Smoke"], env);
if (init.status !== 0) {
  fail(`notion readback init failed\nstdout:\n${init.stdout}\nstderr:\n${init.stderr}`);
}

const setup = runCli(["notion", "setup", "--live", "--title", "RPH Smoke Dashboard"], env);
if (setup.status !== 0) {
  fail(`notion setup --live failed\nstdout:\n${setup.stdout}\nstderr:\n${setup.stderr}`);
}
assertIncludes(setup.stdout, "Notion live workspace 생성", "setup output");
assertIncludes(setup.stdout, "readback: dashboard-page-id", "setup output");

const sync = runCli(["notion", "sync", "--live"], env);
if (sync.status !== 0) {
  fail(`notion sync --live failed\nstdout:\n${sync.stdout}\nstderr:\n${sync.stderr}`);
}
assertIncludes(sync.stdout, "Notion live sync 완료", "sync output");
assertIncludes(sync.stdout, "readback: sync-page-id", "sync output");

const workspacePath = path.join(tmpRoot, ".rph", "notion", "live-workspace.json");
const readbackPath = path.join(tmpRoot, ".rph", "notion", "live-sync-readback.json");
assertFile(workspacePath, "live workspace");
assertFile(readbackPath, "live sync readback");
const workspaceText = fs.readFileSync(workspacePath, "utf8");
const readbackText = fs.readFileSync(readbackPath, "utf8");
if (workspaceText.includes("test-notion-token") || readbackText.includes("test-notion-token")) {
  fail("Notion readback files must not contain tokens");
}

const workspace = JSON.parse(workspaceText);
const readback = JSON.parse(readbackText);
if (workspace.dashboardReadback?.id !== "dashboard-page-id") {
  fail(`expected dashboard readback proof, got ${JSON.stringify(workspace.dashboardReadback)}`);
}
if (!workspace.databaseReadbacks || Object.keys(workspace.databaseReadbacks).length !== 14) {
  fail(`expected 14 database readback proofs, got ${JSON.stringify(workspace.databaseReadbacks)}`);
}
if (readback.id !== "sync-page-id") {
  fail(`expected sync readback proof, got ${JSON.stringify(readback)}`);
}

const calls = fs.readFileSync(capturePath, "utf8").trim().split(/\n+/).filter(Boolean).map((line) => JSON.parse(line));
if (!calls.some((call) => call.method === "GET" && call.target.endsWith("/v1/pages/dashboard-page-id"))) {
  fail("dashboard readback GET was not captured");
}
if (!calls.some((call) => call.method === "GET" && call.target.endsWith("/v1/databases/database-1"))) {
  fail("database readback GET was not captured");
}
if (!calls.some((call) => call.method === "GET" && call.target.endsWith("/v1/pages/sync-page-id"))) {
  fail("sync readback GET was not captured");
}

console.log("notion readback smoke passed");
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
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "LOCAL_AI_BASE_URL",
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
