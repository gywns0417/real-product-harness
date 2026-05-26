#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliEntry = path.join(repoRoot, "dist", "apps", "cli", "src", "index.js");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-mutable-mcp-sidecar-"));
const preloadPath = path.join(tmpRoot, "fetch-mcp-sidecar-preload.cjs");

if (!fs.existsSync(cliEntry)) {
  fail(`CLI dist entry not found: ${cliEntry}. Run pnpm run build first.`);
}

fs.writeFileSync(preloadPath, [
  "global.fetch = async (url, init = {}) => {",
  "  const target = String(url);",
  "  const body = init.body ? JSON.parse(String(init.body)) : {};",
  "  if (target.includes('stitch.googleapis.com/mcp')) {",
  "    if (body.method === 'initialize') {",
  "      return json({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fake-stitch', version: '0.0.0' } } }, { 'Mcp-Session-Id': 'mutable-mcp-sidecar-session' });",
  "    }",
  "    if (body.method === 'notifications/initialized') {",
  "      return json({});",
  "    }",
  "    if (body.method === 'tools/list') {",
  "      return json({ jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'create_project', description: 'Create a project.', annotations: { destructiveHint: true }, inputSchema: { type: 'object', properties: { title: { type: 'string' } } } }] } });",
  "    }",
  "    if (body.method === 'tools/call') {",
  "      return json({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: 'created sidecar-smoke-project' }], structuredContent: { projectId: 'sidecar-smoke-project', title: body.params?.arguments?.title }, isError: false } });",
  "    }",
  "  }",
  "  return new Response(JSON.stringify({ error: { message: `unexpected fetch ${target}` } }), { status: 500, headers: { 'content-type': 'application/json' } });",
  "};",
  "function json(data, headers = {}, status = 200) {",
  "  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });",
  "}"
].join("\n"));

run(["init", "--yes", "--project-name", "Mutable MCP Sidecar Smoke"], "init");
fs.writeFileSync(path.join(tmpRoot, ".env"), [
  "STITCH_API_KEY=test-stitch-sidecar"
].join("\n"));

const plan = run([
  "mcp",
  "canary",
  "stitch",
  "create_project",
  "--args-json",
  "{\"title\":\"Sidecar Smoke\"}"
], "plan", preloadPath);
assertIncludes(plan.stdout, "MCP mutable canary", "plan");
assertIncludes(plan.stdout, "- status: planned", "plan");
assertIncludes(plan.stdout, "- execute: /mcp canary stitch create_project", "plan");

const execute = run([
  "mcp",
  "canary",
  "stitch",
  "create_project",
  "--args-json",
  "{\"title\":\"Sidecar Smoke\"}",
  "--execute"
], "execute", preloadPath);
assertIncludes(execute.stdout, "MCP mutable canary", "execute");
assertIncludes(execute.stdout, "- status: passed", "execute");
assertIncludes(execute.stdout, "- readback: stitch.create_project", "execute");
assertNotIncludes(execute.stdout, "test-stitch-sidecar", "execute");

const canaryPath = path.join(tmpRoot, ".rph", "mcp", "canary-latest.json");
assertFile(canaryPath, "canary latest");
const canaryText = fs.readFileSync(canaryPath, "utf8");
assertNotIncludes(canaryText, "test-stitch-sidecar", "canary");
const canary = JSON.parse(canaryText);
if (canary.schema !== "rph-mcp-mutable-canary-v1" || canary.status !== "passed" || canary.server !== "stitch" || canary.toolName !== "create_project") {
  fail(`unexpected canary artifact: ${JSON.stringify(canary)}`);
}
if (!canary.actionApprovalId || canary.readback?.status !== "passed" || canary.readback?.verifiedTargetId !== "stitch.create_project") {
  fail(`canary artifact missing readback binding: ${JSON.stringify(canary)}`);
}
assertFile(canary.readback.artifactPath, "canary readback");
const readbackText = fs.readFileSync(canary.readback.artifactPath, "utf8");
assertIncludes(readbackText, "sidecar-smoke-project", "readback");
assertNotIncludes(readbackText, "test-stitch-sidecar", "readback");

const approvals = JSON.parse(fs.readFileSync(path.join(tmpRoot, ".rph", "runtime", "action-approvals.json"), "utf8"));
const completed = approvals.find((record) => record.id === canary.actionApprovalId);
if (!completed || completed.status !== "completed" || completed.readbackStatus !== "passed") {
  fail(`expected completed MCP canary approval, got ${JSON.stringify(approvals)}`);
}

console.log("mutable MCP sidecar smoke passed");
console.log(`tmp: ${tmpRoot}`);

function run(args, label, preload) {
  const result = spawnSync(process.execPath, [
    ...(preload ? ["--require", preload] : []),
    cliEntry,
    ...args
  ], {
    cwd: tmpRoot,
    env: {
      ...process.env,
      NO_COLOR: "1"
    },
    encoding: "utf8"
  });
  if (result.status !== 0) {
    fail(`${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result;
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

function assertNotIncludes(text, unexpected, label) {
  if (text.includes(unexpected)) {
    fail(`${label} included unexpected content: ${unexpected}\nactual:\n${text}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
