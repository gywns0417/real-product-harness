#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliEntry = path.join(repoRoot, "dist", "apps", "cli", "src", "index.js");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-provider-interactive-onboarding-"));
const preloadPath = path.join(tmpRoot, "provider-interactive-success-preload.cjs");

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
  "    return json({ output_text: 'OK openai', usage: { input_tokens: 4, output_tokens: 1 } });",
  "  }",
  "  if (target.includes('api.anthropic.com') && target.endsWith('/models')) {",
  "    return json({ data: [{ id: 'claude-sonnet-4-5' }] });",
  "  }",
  "  if (target.includes('api.anthropic.com') && target.endsWith('/messages') && method === 'POST') {",
  "    return json({ content: [{ type: 'text', text: 'OK anthropic' }], usage: { input_tokens: 4, output_tokens: 1 } });",
  "  }",
  "  if (target.includes('generativelanguage.googleapis.com') && target.includes('/models') && method === 'GET') {",
  "    return json({ models: [{ name: 'models/gemini-2.5-flash' }] });",
  "  }",
  "  if (target.includes('generativelanguage.googleapis.com') && target.includes(':generateContent') && method === 'POST') {",
  "    return json({ candidates: [{ content: { parts: [{ text: 'OK gemini' }] } }], usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 1 } });",
  "  }",
  "  if (target.includes('127.0.0.1:11434') && target.endsWith('/api/tags')) {",
  "    return json({ models: [{ name: 'local' }] });",
  "  }",
  "  if (target.includes('127.0.0.1:11434') && target.endsWith('/api/generate') && method === 'POST') {",
  "    return json({ response: 'OK local' });",
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
    input: [
      "/setup auto --ai openai --mcp none --live",
      "interactive-openai-secret",
      "",
      "",
      "/live audit --strict",
      "연결 확인",
      "/exit"
    ].join("\n") + "\n",
    envExpect: ["OPENAI_API_KEY=interactive-openai-secret"],
    answer: "OK openai"
  },
  {
    id: "anthropic",
    input: [
      "/setup auto --ai anthropic --mcp none --live",
      "interactive-anthropic-secret",
      "",
      "",
      "/live audit --strict",
      "연결 확인",
      "/exit"
    ].join("\n") + "\n",
    envExpect: ["ANTHROPIC_API_KEY=interactive-anthropic-secret"],
    answer: "OK anthropic"
  },
  {
    id: "gemini",
    input: [
      "/setup auto --ai gemini --mcp none --live",
      "interactive-gemini-secret",
      "",
      "",
      "/live audit --strict",
      "연결 확인",
      "/exit"
    ].join("\n") + "\n",
    envExpect: ["GEMINI_API_KEY=interactive-gemini-secret"],
    answer: "OK gemini"
  },
  {
    id: "local",
    input: [
      "/setup auto --ai local --mcp none --live",
      "http://127.0.0.1:11434",
      "",
      "/live audit --strict",
      "연결 확인",
      "/exit"
    ].join("\n") + "\n",
    envExpect: ["LOCAL_AI_BASE_URL=http://127.0.0.1:11434"],
    answer: "OK local"
  }
];

for (const provider of providers) {
  const projectRoot = path.join(tmpRoot, provider.id);
  fs.mkdirSync(projectRoot, { recursive: true });
  const result = await runCli(projectRoot, provider.input);
  if (result.status !== 0) {
    fail(`${provider.id} interactive setup failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  assertIncludes(result.stdout, "Fresh workspace.", `${provider.id} runtime`);
  assertIncludes(result.stdout, "RPH Setup Auto", `${provider.id} setup`);
  assertIncludes(result.stdout, "setup live check passed", `${provider.id} setup`);
  assertIncludes(result.stdout, "Connected", `${provider.id} setup`);
  assertIncludes(result.stdout, `- AI: ${provider.id}`, `${provider.id} setup`);
  assertIncludes(result.stdout, "- MCP: none", `${provider.id} setup`);
  assertIncludes(result.stdout, "First demo turn", `${provider.id} setup`);
  assertIncludes(result.stdout, `- provider: ${provider.id}`, `${provider.id} setup`);
  assertIncludes(result.stdout, "Live credential audit", `${provider.id} audit`);
  assertIncludes(result.stdout, "- release readiness: yes", `${provider.id} audit`);
  assertIncludes(result.stdout, "- strict: yes", `${provider.id} audit`);
  assertIncludes(result.stdout, "release gate: ready", `${provider.id} audit`);
  assertNotIncludes(result.stdout, "release gate: blocked", `${provider.id} audit`);
  assertIncludes(result.stdout, provider.answer, `${provider.id} chat`);
  assertIncludes(result.stdout, "RPH runtime 종료", `${provider.id} runtime`);

  const envFile = fs.readFileSync(path.join(projectRoot, ".env"), "utf8");
  for (const expected of provider.envExpect) {
    assertIncludes(envFile, expected, `${provider.id} env`);
  }
  for (const secret of ["interactive-openai-secret", "interactive-anthropic-secret", "interactive-gemini-secret"]) {
    if (secret.includes(provider.id)) {
      continue;
    }
    assertNotIncludes(envFile, secret, `${provider.id} env isolation`);
  }
  assertNotIncludes(result.stdout, "interactive-openai-secret", `${provider.id} stdout secret`);
  assertNotIncludes(result.stdout, "interactive-anthropic-secret", `${provider.id} stdout secret`);
  assertNotIncludes(result.stdout, "interactive-gemini-secret", `${provider.id} stdout secret`);

  const config = readJson(path.join(projectRoot, ".rph", "config.json"));
  if (config.activeAiProvider !== provider.id) {
    fail(`${provider.id} expected active provider ${provider.id}, got ${config.activeAiProvider}`);
  }
  const providerConfig = config.aiProviders?.[provider.id];
  if (!providerConfig?.configured || !providerConfig?.enabled) {
    fail(`${provider.id} expected configured+enabled provider config, got ${JSON.stringify(providerConfig)}`);
  }
  const configText = fs.readFileSync(path.join(projectRoot, ".rph", "config.json"), "utf8");
  assertNotIncludes(configText, "interactive-openai-secret", `${provider.id} config secret`);
  assertNotIncludes(configText, "interactive-anthropic-secret", `${provider.id} config secret`);
  assertNotIncludes(configText, "interactive-gemini-secret", `${provider.id} config secret`);

  const report = readJson(path.join(projectRoot, ".rph", "connections", "latest.json"));
  const checks = Array.isArray(report.checks) ? report.checks : [];
  const providerCheck = checks.find((check) => check?.kind === "ai" && check?.id === provider.id);
  if (!providerCheck || providerCheck.status !== "passed") {
    fail(`${provider.id} expected passed provider check, got ${JSON.stringify(checks)}`);
  }
  if (providerCheck.readiness?.provenStage !== "protocol-tool-call") {
    fail(`${provider.id} expected protocol-tool-call readiness, got ${providerCheck.readiness?.provenStage ?? "missing"}`);
  }
  const auditJsonPath = path.join(projectRoot, ".rph", "live-audit", "latest.json");
  const auditMdPath = path.join(projectRoot, ".rph", "live-audit", "latest.md");
  const audit = readJson(auditJsonPath);
  if (audit.summary?.releaseReady !== true) {
    fail(`${provider.id} expected strict audit release readiness, got ${JSON.stringify(audit.summary)}`);
  }
  assertIncludes(fs.readFileSync(auditMdPath, "utf8"), "release_readiness: yes", `${provider.id} audit markdown`);
  const auditJson = fs.readFileSync(auditJsonPath, "utf8");
  const auditMd = fs.readFileSync(auditMdPath, "utf8");
  assertNotIncludes(auditJson, "interactive-openai-secret", `${provider.id} audit secret`);
  assertNotIncludes(auditJson, "interactive-anthropic-secret", `${provider.id} audit secret`);
  assertNotIncludes(auditJson, "interactive-gemini-secret", `${provider.id} audit secret`);
  assertNotIncludes(auditMd, "interactive-openai-secret", `${provider.id} audit markdown secret`);
  assertNotIncludes(auditMd, "interactive-anthropic-secret", `${provider.id} audit markdown secret`);
  assertNotIncludes(auditMd, "interactive-gemini-secret", `${provider.id} audit markdown secret`);
}

console.log("provider interactive onboarding smoke passed");
console.log(`tmp: ${tmpRoot}`);

function runCli(cwd, input) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--require", preloadPath, cliEntry, "shell"], {
      cwd,
      env: withoutProviderEnv(process.env),
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });

    const lines = input.split(/(?<=\n)/);
    lines.forEach((line, index) => {
      setTimeout(() => {
        child.stdin.write(line);
        if (index === lines.length - 1) {
          child.stdin.end();
        }
      }, index * 120);
    });
  });
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`missing file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function withoutProviderEnv(baseEnv) {
  const next = { ...baseEnv, NO_COLOR: "1" };
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

function assertNotIncludes(text, unexpected, label) {
  if (text.includes(unexpected)) {
    fail(`${label} leaked unexpected content: ${unexpected}\nactual:\n${text}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
