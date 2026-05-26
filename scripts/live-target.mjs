#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliEntry = path.join(repoRoot, "dist", "apps", "cli", "src", "index.js");
const settingsEntry = path.join(repoRoot, "dist", "packages", "core", "src", "settings.js");
const target = process.argv.find((arg) => /^(ai|mcp):[a-z0-9_-]+$/.test(arg));
const validateReportIndex = process.argv.indexOf("--validate-report");
const validateReportPath = validateReportIndex >= 0 ? process.argv[validateReportIndex + 1] : null;

if (!target) {
  fail("usage: pnpm run live:target -- ai:<provider> | mcp:<server> [--validate-report <path>]");
}
if (!validateReportPath && !fs.existsSync(cliEntry)) {
  fail(`CLI dist entry not found: ${cliEntry}. Run pnpm run build first.`);
}
if (!fs.existsSync(settingsEntry)) {
  fail(`settings dist entry not found: ${settingsEntry}. Run pnpm run build first.`);
}

const require = createRequire(import.meta.url);
const {
  AI_PROVIDER_DEFINITIONS,
  MCP_SERVER_DEFINITIONS
} = require(settingsEntry);

const [kind, id] = target.split(":");
assertKnownTarget(kind, id);

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), `rph-live-target-${kind}-${id}-`));
const env = { ...process.env, ...readDotEnv(path.join(repoRoot, ".env")) };
const result = validateReportPath
  ? { status: 0, stdout: "", stderr: "" }
  : spawnSync(process.execPath, [
    cliEntry,
    "setup",
    "auto",
    "--from-env",
    "--live",
    "--ai",
    kind === "ai" ? id : "none",
    "--mcp",
    kind === "mcp" ? id : "none"
  ], {
    cwd: tmpRoot,
    env,
    encoding: "utf8"
  });

const reportPath = validateReportPath ? path.resolve(validateReportPath) : path.join(tmpRoot, ".rph", "connections", "latest.json");
if (!fs.existsSync(reportPath)) {
  fail(`connection report missing: ${reportPath}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const check = Array.isArray(report.checks)
  ? report.checks.find((item) => item.kind === kind && item.id === id)
  : undefined;
const proof = Array.isArray(report.onboardingProof)
  ? report.onboardingProof.find((item) => item.kind === kind && item.id === id)
  : undefined;
const requiredStage = targetRequiredStage(kind, id);
const failures = [];

if (result.status !== 0) {
  failures.push(`setup auto exited ${result.status}; stderr=${result.stderr.trim() || "none"}`);
}
if (!report.provenance) {
  failures.push("connection report provenance missing");
} else {
  if (!Array.isArray(report.provenance.selectedTargets) || !report.provenance.selectedTargets.includes(target)) {
    failures.push(`connection report provenance does not include selected target ${target}`);
  }
  if (report.provenance.checkedTargetCount !== (Array.isArray(report.checks) ? report.checks.length : 0)) {
    failures.push("connection report provenance checkedTargetCount mismatch");
  }
}
if (!check) {
  failures.push(`${target} missing from report`);
} else {
  const provenStage = check.readiness?.provenStage ?? "none";
  if (check.status !== "passed") {
    failures.push(`${target} status=${check.status} stage=${provenStage} message=${check.message}`);
  } else if (!stageCovers(provenStage, requiredStage)) {
    failures.push(`${target} stage=${provenStage}, required=${requiredStage}`);
  }
}
if (!proof) {
  failures.push(`${target} missing onboarding proof`);
} else if (check) {
  if (proof.status !== check.status) {
    failures.push(`${target} proof status mismatch status=${proof.status} expected=${check.status}`);
  }
  if (proof.provenStage !== (check.readiness?.provenStage ?? "none")) {
    failures.push(`${target} proof stage mismatch stage=${proof.provenStage} expected=${check.readiness?.provenStage ?? "none"}`);
  }
}

console.log("live target summary");
if (check) {
  const trust = proof?.trustCategory ?? check.readiness?.mode ?? "unverified";
  const action = check.firstActionProof?.action ?? proof?.firstActionProof?.action;
  const targetLabel = check.identity?.label ?? proof?.identity?.label;
  console.log(`- ${target} status=${check.status} trust=${trust}:${check.readiness?.provenStage ?? "none"}${targetLabel ? ` target=${targetLabel}` : ""}${action ? ` action=${action}` : ""}`);
}
console.log(`tmp: ${tmpRoot}`);
console.log(`report: ${reportPath}`);

if (failures.length > 0) {
  fail(`live target failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
}

console.log("live target passed");

function assertKnownTarget(kind, id) {
  if (kind === "ai" && AI_PROVIDER_DEFINITIONS[id]) {
    return;
  }
  if (kind === "mcp" && MCP_SERVER_DEFINITIONS[id]) {
    return;
  }
  fail(`unknown live target: ${kind}:${id}`);
}

function targetRequiredStage(kind, id) {
  if (kind === "ai") {
    return "protocol-tool-call";
  }
  const server = MCP_SERVER_DEFINITIONS[id];
  return server.protocolReadiness === "tools/call"
    ? "protocol-tool-call"
    : server.protocolReadiness === "tools/list"
      ? "protocol-tools-list"
      : "credential-probe";
}

function stageCovers(actual, required) {
  const order = ["none", "transport", "credential-probe", "protocol-tools-list", "protocol-tool-call"];
  return order.indexOf(actual) >= order.indexOf(required);
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
    const index = trimmed.indexOf("=");
    if (index <= 0) {
      continue;
    }
    const key = trimmed.slice(0, index).trim();
    const raw = trimmed.slice(index + 1).trim();
    values[key] = raw.replace(/^['"]|['"]$/g, "");
  }
  return values;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
