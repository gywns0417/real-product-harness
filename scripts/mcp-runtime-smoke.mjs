#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliEntry = path.join(repoRoot, "dist", "apps", "cli", "src", "index.js");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-mcp-runtime-"));
const preloadPath = path.join(tmpRoot, "mcp-runtime-preload.cjs");
const capturePath = path.join(tmpRoot, "fetch-calls.jsonl");

if (!fs.existsSync(cliEntry)) {
  fail(`CLI dist entry not found: ${cliEntry}. Run pnpm run build first.`);
}

fs.writeFileSync(preloadPath, [
  "const fs = require('node:fs');",
  `const capturePath = ${JSON.stringify(capturePath)};`,
  "let responseCallCount = 0;",
  "function capture(kind, payload) { fs.appendFileSync(capturePath, JSON.stringify({ kind, ...payload }) + '\\n'); }",
  "function json(data, init = {}) {",
  "  return new Response(JSON.stringify(data), { status: init.status ?? 200, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } });",
  "}",
  "global.fetch = async (url, init = {}) => {",
  "  const target = String(url);",
  "  const body = typeof init.body === 'string' && init.body ? JSON.parse(init.body) : {};",
  "  capture('request', { url: target, method: init.method ?? 'GET', rpcMethod: body.method ?? null });",
  "  if (target.endsWith('/models')) {",
  "    return json({ data: [{ id: 'gpt-5.4' }] });",
  "  }",
  "  if (target.endsWith('/responses')) {",
  "    responseCallCount += 1;",
  "    const input = typeof body.input === 'string' ? body.input : '';",
  "    const smoke = input.includes('Reply with exactly OK.');",
  "    const observed = input.includes('Tool observations:');",
  "    const text = smoke",
  "      ? 'OK'",
  "      : observed",
  "        ? JSON.stringify({ action: { type: 'respond', message: 'Protocol MCP echo returned runtime-smoke-ok.' } })",
  "        : JSON.stringify({ action: { type: 'tool_call', tool: 'mcp.tools.call', args: { server: 'stitch', toolName: 'echo', readOnly: true, arguments: { text: 'runtime-smoke-ok' } } } });",
  "    capture('openai-response', { responseCallCount, smoke, observed, text });",
  "    return json({ output: [{ type: 'message', content: [{ type: 'output_text', text }] }], usage: { input_tokens: 10, output_tokens: 5 } });",
  "  }",
  "  if (target.includes('stitch.googleapis.com/mcp')) {",
  "    if (body.method === 'initialize') {",
  "      return json({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fake-stitch', version: '0.0.0' } } }, { headers: { 'Mcp-Session-Id': 'smoke-session' } });",
  "    }",
  "    if (body.method === 'notifications/initialized') {",
  "      return json({});",
  "    }",
  "    if (body.method === 'tools/list') {",
  "      return json({ jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'echo', description: 'Echo a read-only string.', annotations: { readOnlyHint: true }, inputSchema: { type: 'object', properties: { text: { type: 'string' } } } }] } });",
  "    }",
  "    if (body.method === 'tools/call') {",
  "      return json({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: `echo:${body.params?.arguments?.text ?? ''}` }], structuredContent: { echoed: body.params?.arguments?.text ?? null }, isError: false } });",
  "    }",
  "  }",
  "  return json({ error: { message: `unexpected URL ${target}` } }, { status: 500 });",
  "};"
].join("\n"), "utf8");

const env = {
  ...withoutProviderEnv(process.env),
  OPENAI_API_KEY: "test-openai",
  STITCH_API_KEY: "test-stitch"
};

const setup = runCli(["setup", "auto", "--from-env", "--live", "--ai", "openai", "--mcp", "stitch"], env);
if (setup.status !== 0) {
  fail(`mcp runtime setup failed\nstdout:\n${setup.stdout}\nstderr:\n${setup.stderr}`);
}
assertIncludes(setup.stdout, "setup live check passed", "setup output");
assertIncludes(setup.stdout, "mcp:stitch", "setup output");
assertIncludes(setup.stdout, "MCP read-only tool contracts bound: stitch", "setup output");

const ask = runCli(["ask", "protocol MCP echo tool을 호출해서 runtime-smoke-ok를 확인해줘"], withoutProviderEnv(process.env));
if (ask.status !== 0) {
  fail(`mcp runtime ask failed\nstdout:\n${ask.stdout}\nstderr:\n${ask.stderr}`);
}
assertIncludes(ask.stdout, "Protocol MCP echo returned runtime-smoke-ok.", "ask output");

const status = runCli(["agent", "status"], withoutProviderEnv(process.env));
if (status.status !== 0) {
  fail(`mcp runtime status failed\nstdout:\n${status.stdout}\nstderr:\n${status.stderr}`);
}
assertIncludes(status.stdout, "Latest agent tool proof", "agent status output");
assertIncludes(status.stdout, "mcp.tools.call", "agent status output");
assertIncludes(status.stdout, "runtime-smoke-ok", "agent status output");

const reportPath = path.join(tmpRoot, ".rph", "connections", "latest.json");
const configPath = path.join(tmpRoot, ".rph", "config.json");
const sessionPath = path.join(tmpRoot, ".rph", "runtime", "current-session.json");
assertFile(reportPath, "connection report");
assertFile(configPath, "harness config");
assertFile(sessionPath, "runtime session");
assertFile(capturePath, "fetch capture");

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const stitchPolicy = config.mcpPolicyRegistry?.servers?.stitch;
const stitchEchoContract = stitchPolicy?.toolContracts?.echo;
if (stitchPolicy?.requireReadOnlyToolContracts !== true || !stitchEchoContract?.fingerprint) {
  fail(`expected stitch echo read-only contract to be bound, got ${JSON.stringify(stitchPolicy)}`);
}
if (!stitchEchoContract.inputSchemaSha256 || !stitchEchoContract.annotationsSha256) {
  fail(`expected stitch echo contract to include schema and annotation hashes, got ${JSON.stringify(stitchEchoContract)}`);
}
const checkSummary = (Array.isArray(report.checks) ? report.checks : []).map((check) => ({
  kind: check.kind,
  id: check.id,
  status: check.status,
  provenStage: check.readiness?.provenStage
}));
expectEqual(checkSummary, [
  { kind: "ai", id: "openai", status: "passed", provenStage: "protocol-tool-call" },
  { kind: "mcp", id: "stitch", status: "passed", provenStage: "protocol-tools-list" }
], "connection checks");

const session = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
if (session.activeTurn?.status !== "complete") {
  fail(`expected complete active turn, got ${session.activeTurn?.status ?? "missing"}`);
}
const toolCalls = session.activeTurn?.toolCalls ?? [];
if (toolCalls.length !== 1 || toolCalls[0]?.name !== "mcp.tools.call" || toolCalls[0]?.status !== "succeeded") {
  fail(`expected one succeeded mcp.tools.call, got ${JSON.stringify(toolCalls)}`);
}
if (!String(toolCalls[0].observation ?? "").includes("runtime-smoke-ok")) {
  fail(`expected tool observation to include runtime-smoke-ok, got ${toolCalls[0].observation ?? "missing"}`);
}
if (!String(toolCalls[0].observation ?? "").includes(stitchEchoContract.fingerprint)) {
  fail(`expected tool observation to include bound contract fingerprint ${stitchEchoContract.fingerprint}, got ${toolCalls[0].observation ?? "missing"}`);
}

const capturedMethods = fs.readFileSync(capturePath, "utf8")
  .trim()
  .split(/\n+/)
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .filter((entry) => entry.rpcMethod)
  .map((entry) => entry.rpcMethod);
for (const method of ["initialize", "notifications/initialized", "tools/list", "tools/call"]) {
  if (!capturedMethods.includes(method)) {
    fail(`expected MCP method ${method}; captured=${capturedMethods.join(",")}`);
  }
}

console.log("mcp runtime smoke passed");
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

function expectEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    fail(`${label} mismatch\nexpected: ${expectedJson}\nactual:   ${actualJson}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
