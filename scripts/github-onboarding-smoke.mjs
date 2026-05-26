#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliEntry = path.join(repoRoot, "dist", "apps", "cli", "src", "index.js");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-github-onboarding-"));
const binDir = path.join(tmpRoot, "bin");
const fakeGhState = path.join(tmpRoot, "fake-gh-state.json");
const preload = path.join(tmpRoot, "fetch-preload.cjs");
const owner = "gywns0417";
const repo = "real-product-harness-smoke";
const repoName = `${owner}/${repo}`;
const githubToken = "test-github-token";

if (!fs.existsSync(cliEntry)) {
  fail(`CLI dist entry not found: ${cliEntry}. Run pnpm run build first.`);
}

fs.mkdirSync(binDir, { recursive: true });
fs.writeFileSync(fakeGhState, JSON.stringify({
  repoCreated: true,
  repo: repoName,
  labels: []
}, null, 2));

const fakeGh = path.join(binDir, "gh");
fs.writeFileSync(fakeGh, [
  "#!/usr/bin/env node",
  "const fs = require('node:fs');",
  `const statePath = ${JSON.stringify(fakeGhState)};`,
  "const args = process.argv.slice(2);",
  "const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));",
  "function save() { fs.writeFileSync(statePath, JSON.stringify(state, null, 2)); }",
  "function argAfter(name) { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; }",
  "if (args[0] === '--version') { console.log('gh version 2.0.0'); process.exit(0); }",
  "if (args[0] === 'auth' && args[1] === 'status') { process.exit(0); }",
  `if (args[0] === 'auth' && args[1] === 'token') { console.log(${JSON.stringify(githubToken)}); process.exit(0); }`,
  "if (args[0] === 'repo' && args[1] === 'view') {",
  "  const requested = args[2] || state.repo;",
  "  if (!state.repoCreated || requested !== state.repo) { console.error('not found'); process.exit(1); }",
  "  console.log(JSON.stringify({ nameWithOwner: state.repo, url: `https://github.com/${state.repo}`, visibility: 'PUBLIC', isPrivate: false, defaultBranchRef: { name: 'main' }, viewerPermission: 'ADMIN' }));",
  "  process.exit(0);",
  "}",
  "if (args[0] === 'label' && args[1] === 'create') {",
  "  const name = args[2];",
  "  const color = argAfter('--color');",
  "  const description = argAfter('--description');",
  "  const existing = state.labels.find((label) => label.name === name);",
  "  if (existing) { existing.color = color; existing.description = description; }",
  "  else { state.labels.push({ name, color, description }); }",
  "  save();",
  "  process.exit(0);",
  "}",
  "if (args[0] === 'label' && args[1] === 'list') {",
  "  console.log(JSON.stringify(state.labels));",
  "  process.exit(0);",
  "}",
  "console.error(`unexpected gh args: ${args.join(' ')}`);",
  "process.exit(1);"
].join("\n"), { mode: 0o755 });

const fakeGit = path.join(binDir, "git");
fs.writeFileSync(fakeGit, [
  "#!/usr/bin/env node",
  "const args = process.argv.slice(2);",
  "if (args[0] === 'config' && args[1] === '--get' && args[2] === 'remote.origin.url') {",
  `  console.log('https://github.com/${repoName}.git');`,
  "  process.exit(0);",
  "}",
  "console.error(`unexpected git args: ${args.join(' ')}`);",
  "process.exit(1);"
].join("\n"), { mode: 0o755 });

fs.writeFileSync(preload, [
  "global.fetch = async (url, init = {}) => {",
  "  const target = String(url);",
  "  const source = String(init.body || '');",
  `  if (target === 'https://api.github.com/repos/${owner}/${repo}') {`,
  `    if (!header(init.headers, 'Authorization').includes(${JSON.stringify(githubToken)})) {`,
  "      return json({ message: 'bad credentials' }, 401);",
  "    }",
  `    return json({ id: 123456, full_name: ${JSON.stringify(repoName)}, html_url: 'https://github.com/${repoName}', visibility: 'public', private: false, default_branch: 'main' });`,
  "  }",
  "  if (target.endsWith('/models')) {",
  "    return json({ data: [{ id: 'gpt-5.4' }] });",
  "  }",
  "  if (target.endsWith('/responses')) {",
  "    if (source.includes('Reply with exactly OK.')) {",
  "      return json({ output_text: 'OK', usage: { input_tokens: 4, output_tokens: 1 } });",
  "    }",
  "    const text = JSON.stringify({ action: { type: 'command', command: '/github setup-labels', safeToAutoRun: false, reason: 'approval-gated first GitHub live action', message: 'GitHub labels require explicit approval.' } });",
  "    return json({ output: [{ type: 'message', content: [{ type: 'output_text', text }] }], usage: { input_tokens: 10, output_tokens: 5 } });",
  "  }",
  "  return json({ error: { message: `unexpected fetch ${target}` } }, 500);",
  "};",
  "function json(payload, status = 200) {",
  "  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });",
  "}",
  "function header(headers, name) {",
  "  if (!headers) return '';",
  "  if (typeof headers.get === 'function') return headers.get(name) || '';",
  "  return headers[name] || headers[name.toLowerCase()] || '';",
  "}"
].join("\n"));

const env = cleanEnv({
  PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
  RPH_GH_BIN: fakeGh,
  OPENAI_API_KEY: "test-openai",
  OPENAI_BASE_URL: "https://example.invalid/v1",
  NO_COLOR: "1"
});

const setup = run(["setup", "auto", "--from-env", "--live", "--ai", "openai", "--mcp", "github"], "setup", true);
assertIncludes(setup.stdout, "setup live check passed", "setup");
assertIncludes(setup.stdout, "ai:openai trust=protocol-ready:protocol-tool-call", "setup");
assertIncludes(setup.stdout, "mcp:github trust=adapter-write-ready:credential-probe", "setup");
assertIncludes(setup.stdout, "GITHUB_TOKEN: GitHub CLI 인증 감지", "setup");

const envPath = path.join(tmpRoot, ".env");
const envText = fs.readFileSync(envPath, "utf8");
assertIncludes(envText, "OPENAI_API_KEY=test-openai", ".env");
assertIncludes(envText, "GITHUB_TOKEN_SOURCE=gh-cli", ".env");
assertIncludes(envText, `GITHUB_OWNER=${owner}`, ".env");
assertIncludes(envText, `GITHUB_REPO=${repo}`, ".env");
assertNotIncludes(envText, "GITHUB_TOKEN=", ".env");
assertNotIncludes(envText, githubToken, ".env");

const reportPath = path.join(tmpRoot, ".rph", "connections", "latest.json");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const checkKeys = report.checks.map((check) => `${check.kind}:${check.id}:${check.status}`);
if (JSON.stringify(checkKeys) !== JSON.stringify(["ai:openai:passed", "mcp:github:passed"])) {
  fail(`unexpected setup checks: ${JSON.stringify(checkKeys)}`);
}

const proposed = run(["ask", "--execute", "GitHub 첫 live action을 실행해줘"], "proposal", true);
assertIncludes(proposed.stdout, "external action approval required", "proposal");
assertIncludes(proposed.stdout, "approve: /agent approve-action action_", "proposal");
assertNotIncludes(proposed.stdout, "GitHub label 설정 파일 생성", "proposal");

const approvalsPath = path.join(tmpRoot, ".rph", "runtime", "action-approvals.json");
const approvals = JSON.parse(fs.readFileSync(approvalsPath, "utf8"));
const action = approvals.find((item) => item.status === "pending" && item.target === "github");
if (!action || action.action !== "labels.apply" || action.command !== "/github setup-labels") {
  fail(`unexpected pending GitHub action: ${JSON.stringify(approvals)}`);
}

const sessionPath = path.join(tmpRoot, ".rph", "runtime", "current-session.json");
const session = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
if (session.status !== "blocked" || session.waitCondition?.kind !== "external_live_write") {
  fail(`expected blocked external_live_write session, got ${JSON.stringify(session)}`);
}

const approved = run(["agent", "approve-action", action.id, "--by", "smoke"], "approve", true);
assertIncludes(approved.stdout, `external action completed: ${action.id}`, "approve");
assertIncludes(approved.stdout, `readback: ${repoName} labels=`, "approve");

const labelsProofPath = path.join(tmpRoot, ".rph", "github", "live-labels-readback.json");
assertFile(labelsProofPath, "labels readback");
const labelsProof = JSON.parse(fs.readFileSync(labelsProofPath, "utf8"));
if (!labelsProof.verified || labelsProof.owner !== owner || labelsProof.repo !== repo || labelsProof.observed.length < 8) {
  fail(`unexpected label readback proof: ${JSON.stringify(labelsProof)}`);
}

const completed = JSON.parse(fs.readFileSync(approvalsPath, "utf8")).find((item) => item.id === action.id);
if (completed.status !== "completed" || completed.readbackStatus !== "passed" || !completed.readbackArtifactPath) {
  fail(`expected completed action with readback proof, got ${JSON.stringify(completed)}`);
}

for (const file of [
  reportPath,
  approvalsPath,
  labelsProofPath,
  path.join(tmpRoot, ".rph", "proofs", "ledger.jsonl"),
  path.join(tmpRoot, ".rph", "config.json"),
  path.join(tmpRoot, ".mcp", "config.json")
]) {
  assertFile(file, "token leak check");
  const text = fs.readFileSync(file, "utf8");
  assertNotIncludes(text, githubToken, file);
  assertNotIncludes(text, "test-openai", file);
}

console.log("github onboarding smoke passed");
console.log(`tmp: ${tmpRoot}`);

function run(args, label, withPreload = false) {
  const result = spawnSync(process.execPath, [
    ...(withPreload ? ["--require", preload] : []),
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

function cleanEnv(overrides) {
  const next = { ...process.env, ...overrides };
  for (const key of [
    "GITHUB_TOKEN",
    "GH_TOKEN",
    "GITHUB_TOKEN_SOURCE",
    "GITHUB_OWNER",
    "GITHUB_REPO",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "LOCAL_AI_BASE_URL",
    "NOTION_TOKEN",
    "FIGMA_TOKEN",
    "STITCH_API_KEY"
  ]) {
    if (!(key in overrides)) {
      delete next[key];
    }
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

function assertNotIncludes(text, unexpected, label) {
  if (text.includes(unexpected)) {
    fail(`${label} included unexpected content: ${unexpected}\nactual:\n${text}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
