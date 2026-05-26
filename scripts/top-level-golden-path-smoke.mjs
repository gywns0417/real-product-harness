#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliEntry = path.join(repoRoot, "dist", "apps", "cli", "src", "index.js");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-top-level-golden-path-"));
const preloadPath = path.join(tmpRoot, "top-level-golden-path-preload.cjs");
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
  "function bodyInput(body) {",
  "  if (typeof body.input === 'string') return body.input;",
  "  return JSON.stringify(body.input ?? body);",
  "}",
  "global.fetch = async (url, init = {}) => {",
  "  const target = String(url);",
  "  const body = typeof init.body === 'string' && init.body ? JSON.parse(init.body) : {};",
  "  const input = bodyInput(body);",
  "  capture('request', { url: target, method: init.method ?? 'GET', rpcMethod: body.method ?? null, input });",
  "  if (target.endsWith('/models')) {",
  "    return json({ data: [{ id: 'gpt-5.4' }] });",
  "  }",
  "  if (target.endsWith('/responses')) {",
  "    responseCallCount += 1;",
  "    const smoke = input.includes('Reply with exactly OK.');",
  "    const observed = input.includes('Tool observations:');",
  "    let text;",
  "    if (smoke) {",
  "      text = 'OK';",
  "    } else if (input.includes('PM lane handoff')) {",
  "      text = JSON.stringify({ action: { type: 'handoff', message: 'PM lane handoff queued from top-level golden path.', handoff: { fromAgent: 'Orchestrator', toAgent: 'PM', stage: 'SETUP', summary: 'Start PM lane after verified top-level chat and MCP read.', artifactRefs: ['connection:stitch', 'tool:mcp.tools.call'], acceptanceCriteria: ['PM lane starts from verified top-level runtime'], blockers: [], nextCommand: '/pm start' } } });",
  "    } else if (input.includes('Lane queued command: /pm start')) {",
  "      text = JSON.stringify({ action: { type: 'command', command: '/pm start', safeToAutoRun: true, reason: 'PM lane accepts the queued start command.', message: 'PM lane starts.' } });",
  "    } else if (observed) {",
  "      text = JSON.stringify({ action: { type: 'respond', message: 'Protocol MCP echo returned top-level-golden-ok.' } });",
  "    } else {",
  "      text = JSON.stringify({ action: { type: 'tool_call', tool: 'mcp.tools.call', args: { server: 'stitch', toolName: 'echo', readOnly: true, arguments: { text: 'top-level-golden-ok' } } } });",
  "    }",
  "    capture('openai-response', { responseCallCount, smoke, observed, text });",
  "    return json({ output: [{ type: 'message', content: [{ type: 'output_text', text }] }], usage: { input_tokens: 10, output_tokens: 5 } });",
  "  }",
  "  if (target.includes('stitch.googleapis.com/mcp')) {",
  "    if (body.method === 'initialize') {",
  "      return json({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fake-stitch', version: '0.0.0' } } }, { headers: { 'Mcp-Session-Id': 'top-level-golden-session' } });",
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
  "  return json({ error: { message: `unexpected fetch ${target}` } }, { status: 500 });",
  "};"
].join("\n"), "utf8");

const env = {
  ...withoutProviderEnv(process.env),
  NO_COLOR: "1",
  OPENAI_API_KEY: "test-openai",
  STITCH_API_KEY: "test-stitch"
};

const start = runCli([
  "start",
  "--from-env",
  "--live",
  "--ai",
  "openai",
  "--mcp",
  "stitch",
  "protocol MCP echo tool로 top-level-golden-ok 확인해줘"
], env, "start golden path");
assertIncludes(start.stdout, "RPH runtime: setup needed before agent chat", "start output");
assertIncludes(start.stdout, "setup assistant: rph setup auto --live", "start output");
assertIncludes(start.stdout, "setup live check passed", "start output");
assertIncludes(start.stdout, "next: rph pm start", "start output");
assertIncludes(start.stdout, "MCP read-only tool contracts bound: stitch", "start output");
assertIncludes(start.stdout, "Protocol MCP echo returned top-level-golden-ok.", "start output");

const sessionAfterStart = readJson(path.join(tmpRoot, ".rph", "runtime", "current-session.json"));
const toolCall = sessionAfterStart.activeTurn?.toolCalls?.find((call) => call.name === "mcp.tools.call");
if (!toolCall || toolCall.status !== "succeeded" || !String(toolCall.observation ?? "").includes("top-level-golden-ok")) {
  fail(`expected start message to complete one MCP read tool call, got ${JSON.stringify(sessionAfterStart.activeTurn?.toolCalls ?? [])}`);
}

const handoff = runCli([
  "ask",
  "PM lane handoff를 큐에 넣어줘"
], withoutProviderEnv(process.env), "handoff proposal");
assertIncludes(handoff.stdout, "agent proposed handoff: Orchestrator -> PM", "handoff output");
assertIncludes(handoff.stdout, "handoff next command: /pm start", "handoff output");
assertIncludes(handoff.stdout, "handoff queued: handoff-", "handoff output");

const handoffPath = path.join(tmpRoot, ".rph", "runtime", "handoffs.json");
const queued = readJson(handoffPath);
if (!Array.isArray(queued) || queued.length !== 1 || queued[0]?.status !== "pending" || queued[0]?.packet?.toAgent !== "PM") {
  fail(`expected one pending PM handoff, got ${JSON.stringify(queued)}`);
}

const run = runCli(["agent", "run", "--steps", "1"], withoutProviderEnv(process.env), "agent run");
assertIncludes(run.stdout, "orchestration loop: max_steps=1", "agent run output");
assertIncludes(run.stdout, "orchestrator step 1: /pm start", "agent run output");
assertIncludes(run.stdout, "role runner: PM (SETUP) lane=lane-", "agent run output");
assertIncludes(run.stdout, "role agent: autonomous turn", "agent run output");
assertIncludes(run.stdout, "agent action: /pm start", "agent run output");
assertIncludes(run.stdout, "lane result merged: lane-", "agent run output");

const finalHandoffs = readJson(handoffPath);
const completed = finalHandoffs[0];
if (completed.status !== "completed" || !completed.laneRunId || !completed.completedAt) {
  fail(`expected handoff to be completed with laneRunId, got ${JSON.stringify(completed)}`);
}

const lane = readJson(path.join(tmpRoot, ".rph", "runtime", "lanes", `${completed.laneRunId}.json`));
if (lane.status !== "completed" || lane.executionMode !== "autonomous" || lane.merge?.status !== "merged") {
  fail(`expected autonomous merged lane, got ${JSON.stringify(lane)}`);
}
if (lane.workerSessionId !== completed.workerSessionId || lane.claimToken !== completed.claimToken) {
  fail(`expected lane claim binding to match handoff, got lane=${JSON.stringify(lane)} handoff=${JSON.stringify(completed)}`);
}

const state = readJson(path.join(tmpRoot, ".rph", "state.json"));
if (state.currentStage !== "PM_PRODUCT_DEFINITION_INTERVIEW") {
  fail(`expected PM_PRODUCT_DEFINITION_INTERVIEW after worker consume, got ${state.currentStage}`);
}

const agentStatus = runCli(["agent", "status"], withoutProviderEnv(process.env), "agent status");
assertIncludes(agentStatus.stdout, "Proof ledger", "agent status output");
assertIncludes(agentStatus.stdout, "agent.tool agent-tool:mcp.tools.call", "agent status output");
assertIncludes(agentStatus.stdout, "handoffs pending: 1", "agent status output");

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

console.log("top-level golden path smoke passed");
console.log(`tmp: ${tmpRoot}`);

function runCli(args, envValues, label) {
  const result = spawnSync(process.execPath, ["--require", preloadPath, cliEntry, ...args], {
    cwd: tmpRoot,
    env: { ...envValues, NO_COLOR: "1" },
    encoding: "utf8"
  });
  if (result.status !== 0) {
    fail(`${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result;
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

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`missing file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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
