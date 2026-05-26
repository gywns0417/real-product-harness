#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliEntry = path.join(repoRoot, "dist", "apps", "cli", "src", "index.js");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-mutable-action-"));
const notionPreload = path.join(tmpRoot, "fetch-notion-preload.cjs");
const mcpPreload = path.join(tmpRoot, "fetch-mcp-preload.cjs");

if (!fs.existsSync(cliEntry)) {
  fail(`CLI dist entry not found: ${cliEntry}. Run pnpm run build first.`);
}

fs.writeFileSync(notionPreload, [
  "let databaseCount = 0;",
  "global.fetch = async (url, init = {}) => {",
  "  const target = String(url);",
  "  const method = init.method || 'GET';",
  "  if (target.includes('example.invalid')) {",
  "    const text = JSON.stringify({ action: { type: 'command', command: '/notion setup --live --title \"Mutable Action Smoke\"', safeToAutoRun: false, reason: 'approval-gated live Notion workspace setup', message: 'Notion live write requires approval.' } });",
  "    return new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text }] }], usage: { input_tokens: 8, output_tokens: 4 } }), { status: 200, headers: { 'content-type': 'application/json' } });",
  "  }",
  "  if (target.endsWith('/v1/pages') && method === 'POST') {",
  "    return new Response(JSON.stringify({ id: 'dashboard-page-id', object: 'page', url: 'https://notion.so/dashboard-page-id', archived: false }), { status: 200, headers: { 'content-type': 'application/json' } });",
  "  }",
  "  if (target.includes('/v1/pages/dashboard-page-id') && method === 'GET') {",
  "    return new Response(JSON.stringify({ id: 'dashboard-page-id', object: 'page', url: 'https://notion.so/dashboard-page-id', archived: false }), { status: 200, headers: { 'content-type': 'application/json' } });",
  "  }",
  "  if (target.endsWith('/v1/databases') && method === 'POST') {",
  "    databaseCount += 1;",
  "    return new Response(JSON.stringify({ id: `database-${databaseCount}`, object: 'database', url: `https://notion.so/database-${databaseCount}` }), { status: 200, headers: { 'content-type': 'application/json' } });",
  "  }",
  "  const databaseMatch = target.match(/\\/v1\\/databases\\/(database-\\d+)$/);",
  "  if (databaseMatch && method === 'GET') {",
  "    return new Response(JSON.stringify({ id: databaseMatch[1], object: 'database', url: `https://notion.so/${databaseMatch[1]}`, archived: false }), { status: 200, headers: { 'content-type': 'application/json' } });",
  "  }",
  "  return new Response(JSON.stringify({ error: { message: `unexpected fetch ${method} ${target}` } }), { status: 500, headers: { 'content-type': 'application/json' } });",
  "};"
].join("\n"));

fs.writeFileSync(mcpPreload, [
  "global.fetch = async (url, init = {}) => {",
  "  const target = String(url);",
  "  const body = init.body ? JSON.parse(String(init.body)) : {};",
  "  if (target.includes('example.invalid')) {",
  "    const text = JSON.stringify({ action: { type: 'command', command: '/mcp call stitch create_project --args-json \\'{\"title\":\"Mutable MCP Smoke\"}\\'', safeToAutoRun: false, reason: 'approval-gated mutable MCP project creation', message: 'MCP mutable write requires approval.' } });",
  "    return new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text }] }], usage: { input_tokens: 8, output_tokens: 4 } }), { status: 200, headers: { 'content-type': 'application/json' } });",
  "  }",
  "  if (target.includes('stitch.googleapis.com/mcp')) {",
  "    if (body.method === 'initialize') {",
  "      return json({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fake-stitch', version: '0.0.0' } } }, { 'Mcp-Session-Id': 'mutable-mcp-smoke-session' });",
  "    }",
  "    if (body.method === 'notifications/initialized') {",
  "      return json({});",
  "    }",
  "    if (body.method === 'tools/list') {",
  "      return json({ jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'create_project', description: 'Create a project.', annotations: { destructiveHint: true }, inputSchema: { type: 'object', properties: { title: { type: 'string' } } } }] } });",
  "    }",
  "    if (body.method === 'tools/call') {",
  "      return json({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: 'created mutable-mcp-smoke-project' }], structuredContent: { projectId: 'mutable-mcp-smoke-project', title: body.params?.arguments?.title }, isError: false } });",
  "    }",
  "  }",
  "  return new Response(JSON.stringify({ error: { message: `unexpected fetch ${target}` } }), { status: 500, headers: { 'content-type': 'application/json' } });",
  "};",
  "function json(data, headers = {}, status = 200) {",
  "  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });",
  "}"
].join("\n"));

const env = {
  ...process.env,
  NO_COLOR: "1"
};

run(["init", "--yes", "--project-name", "Mutable Action Smoke"], "init");
fs.writeFileSync(path.join(tmpRoot, ".env"), [
  "OPENAI_API_KEY=test-openai",
  "OPENAI_BASE_URL=https://example.invalid/v1",
  "NOTION_TOKEN=test-notion",
  "NOTION_PARENT_PAGE_ID=123456781234123412341234567890ab",
  "STITCH_API_KEY=test-stitch"
].join("\n"));

const proposed = run(["ask", "--execute", "Notion live workspace를 만들어줘"], "proposal", notionPreload);
assertIncludes(proposed.stdout, "external action approval required", "proposal");
assertNotIncludes(proposed.stdout, "Notion live workspace 생성", "proposal");

const approvalsPath = path.join(tmpRoot, ".rph", "runtime", "action-approvals.json");
const approvals = JSON.parse(fs.readFileSync(approvalsPath, "utf8"));
if (!Array.isArray(approvals) || approvals.length !== 1) {
  fail(`expected exactly one action approval, got ${JSON.stringify(approvals)}`);
}
const action = approvals[0];
if (action.status !== "pending" || action.risk !== "external_live_write") {
  fail(`unexpected pending action state: ${JSON.stringify(action)}`);
}

const manifest = JSON.parse(fs.readFileSync(path.join(tmpRoot, ".rph", "runtime", "current-session.json"), "utf8"));
if (manifest.waitCondition?.kind !== "external_live_write") {
  fail(`expected external_live_write wait condition, got ${JSON.stringify(manifest.waitCondition)}`);
}

const approved = run(["agent", "approve-action", action.id, "--by", "smoke"], "approve", notionPreload);
assertIncludes(approved.stdout, `external action completed: ${action.id}`, "approve");
assertIncludes(approved.stdout, "readback: dashboard-page-id", "approve");

const completed = JSON.parse(fs.readFileSync(approvalsPath, "utf8"))[0];
if (completed.status !== "completed") {
  fail(`expected completed action, got ${JSON.stringify(completed)}`);
}
const workspace = fs.readFileSync(path.join(tmpRoot, ".rph", "notion", "live-workspace.json"), "utf8");
assertIncludes(workspace, "dashboard-page-id", "workspace");
assertIncludes(workspace, "databaseReadbacks", "workspace");
assertNotIncludes(workspace, "test-notion", "workspace");

const mcpProposed = run(["ask", "--execute", "MCP mutable project를 만들어줘"], "mcp proposal", mcpPreload);
assertIncludes(mcpProposed.stdout, "external action approval required", "mcp proposal");
const mcpApprovals = JSON.parse(fs.readFileSync(approvalsPath, "utf8"));
const mcpAction = mcpApprovals.find((record) => record.target === "mcp" && record.action === "stitch.create_project");
if (!mcpAction || mcpAction.status !== "pending" || mcpAction.approvedSnapshot?.kind !== "mcp.tool-call") {
  fail(`expected pending MCP action with approval snapshot, got ${JSON.stringify(mcpApprovals)}`);
}

const mcpApproved = run(["agent", "approve-action", mcpAction.id, "--by", "smoke"], "mcp approve", mcpPreload);
assertIncludes(mcpApproved.stdout, `external action completed: ${mcpAction.id}`, "mcp approve");
assertIncludes(mcpApproved.stdout, "readback: stitch.create_project", "mcp approve");
const mcpCompleted = JSON.parse(fs.readFileSync(approvalsPath, "utf8")).find((record) => record.id === mcpAction.id);
if (mcpCompleted.status !== "completed" || mcpCompleted.readbackStatus !== "passed" || !mcpCompleted.readbackArtifactPath) {
  fail(`expected completed MCP action with readback proof, got ${JSON.stringify(mcpCompleted)}`);
}
const mcpReadback = fs.readFileSync(mcpCompleted.readbackArtifactPath, "utf8");
assertIncludes(mcpReadback, "mutable-mcp-smoke-project", "mcp readback");
assertNotIncludes(mcpReadback, "test-stitch", "mcp readback");

console.log("mutable action smoke passed");
console.log(`tmp: ${tmpRoot}`);

function run(args, label, preloadPath) {
  const result = spawnSync(process.execPath, [
    ...(preloadPath ? ["--require", preloadPath] : []),
    cliEntry,
    ...args
  ], {
    cwd: tmpRoot,
    env,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    fail(`${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result;
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
