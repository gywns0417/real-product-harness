#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliEntry = path.join(repoRoot, "dist", "apps", "cli", "src", "index.js");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-live-matrix-"));
const env = { ...process.env, ...readDotEnv(path.join(repoRoot, ".env")) };
const configuredOnly = process.argv.includes("--configured-only");

if (!fs.existsSync(cliEntry)) {
  fail(`CLI dist entry not found: ${cliEntry}. Run pnpm run build first.`);
}

const result = spawnSync(process.execPath, [
  cliEntry,
  "setup",
  "auto",
  "--from-env",
  "--live",
  "--ai",
  "all",
  "--mcp",
  "all"
], {
  cwd: tmpRoot,
  env,
  encoding: "utf8"
});

if (result.status !== 0) {
  fail(`live matrix command failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

const reportPath = path.join(tmpRoot, ".rph", "connections", "latest.json");
if (!fs.existsSync(reportPath)) {
  fail(`connection report missing: ${reportPath}\nstdout:\n${result.stdout}`);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
removeTempSecretFiles(tmpRoot);
const checks = Array.isArray(report.checks) ? report.checks : [];
const required = [
  ["ai", "openai", "protocol-tool-call"],
  ["ai", "anthropic", "protocol-tool-call"],
  ["ai", "gemini", "protocol-tool-call"],
  ["ai", "local", "protocol-tool-call"],
  ["mcp", "notion", "credential-probe"],
  ["mcp", "github", "credential-probe"],
  ["mcp", "figma", "credential-probe"],
  ["mcp", "stitch", "protocol-tools-list"]
];

const failures = [];
for (const [kind, id, requiredStage] of required) {
  const check = checks.find((item) => item.kind === kind && item.id === id);
  if (!check) {
    failures.push(`${kind}:${id} missing from report`);
    continue;
  }
  if (configuredOnly && check.status === "skipped" && Array.isArray(check.missingEnv) && check.missingEnv.length > 0) {
    continue;
  }
  const provenStage = check.readiness?.provenStage ?? "none";
  if (check.status !== "passed") {
    failures.push(`${kind}:${id} status=${check.status} stage=${provenStage} message=${check.message}`);
    continue;
  }
  if (!stageCovers(provenStage, requiredStage)) {
    failures.push(`${kind}:${id} stage=${provenStage}, required=${requiredStage}`);
  }
}

console.log(configuredOnly ? "configured live matrix summary" : "live matrix summary");
for (const check of checks) {
  console.log(`- ${check.kind}:${check.id} status=${check.status} stage=${check.readiness?.provenStage ?? "none"}`);
}
console.log(`tmp: ${tmpRoot}`);
console.log(`report: ${reportPath}`);

if (failures.length > 0) {
  fail(`live matrix failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
}

console.log("live matrix passed");

function stageCovers(actual, required) {
  const rank = {
    none: 0,
    transport: 1,
    "credential-probe": 2,
    "protocol-tools-list": 3,
    "protocol-tool-call": 4
  };
  return (rank[actual] ?? 0) >= (rank[required] ?? 0);
}

function readDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const values = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }
    values[match[1]] = unquote(match[2]);
  }
  return values;
}

function unquote(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function removeTempSecretFiles(projectRoot) {
  for (const filePath of [
    path.join(projectRoot, ".env")
  ]) {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
    }
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
