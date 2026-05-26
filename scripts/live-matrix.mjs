#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliEntry = path.join(repoRoot, "dist", "apps", "cli", "src", "index.js");
const settingsEntry = path.join(repoRoot, "dist", "packages", "core", "src", "settings.js");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-live-matrix-"));
const env = { ...process.env, ...readDotEnv(path.join(repoRoot, ".env")) };
const configuredOnly = process.argv.includes("--configured-only");
const auditMode = process.argv.includes("--audit");
const strictAudit = process.argv.includes("--strict");
const validateReportIndex = process.argv.indexOf("--validate-report");
const validateReportPath = validateReportIndex >= 0 ? process.argv[validateReportIndex + 1] : null;
const outputIndex = process.argv.indexOf("--output");
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;

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
const required = buildRequiredMatrix(AI_PROVIDER_DEFINITIONS, MCP_SERVER_DEFINITIONS);

const result = validateReportPath
  ? { status: 0, stdout: "", stderr: "" }
  : spawnSync(process.execPath, [
    cliEntry,
    "setup",
    "auto",
    "--from-env",
    "--live",
    ...(configuredOnly ? ["--allow-missing"] : []),
    "--ai",
    "all",
    "--mcp",
    "all"
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
if (!validateReportPath) {
  removeTempSecretFiles(tmpRoot);
}
const checks = Array.isArray(report.checks) ? report.checks : [];
const onboardingProof = Array.isArray(report.onboardingProof) ? report.onboardingProof : [];
const requiredKeys = new Set(required.map(([kind, id]) => matrixKey(kind, id)));

const failures = [];
if (!report.provenance || typeof report.provenance !== "object") {
  failures.push("connection report provenance missing");
} else {
  if (!["live", "mock", "imported"].includes(report.provenance.source)) {
    failures.push(`connection report provenance source invalid: ${report.provenance.source ?? "missing"}`);
  }
  if (!Array.isArray(report.provenance.selectedTargets)) {
    failures.push("connection report provenance selectedTargets missing");
  } else {
    const checkedTargets = checks.map((check) => matrixKey(check.kind, check.id));
    const selectedTargets = report.provenance.selectedTargets;
    if (!sameTargetSet(selectedTargets, checkedTargets)) {
      failures.push(`connection report provenance selectedTargets mismatch selected=[${selectedTargets.join(",")}] checks=[${checkedTargets.join(",")}]`);
    }
  }
  if (report.provenance.checkedTargetCount !== checks.length) {
    failures.push(`connection report provenance checkedTargetCount mismatch value=${report.provenance.checkedTargetCount ?? "missing"} expected=${checks.length}`);
  }
}
if (result.status !== 0) {
  failures.push(`setup auto exited ${result.status}; stderr=${result.stderr.trim() || "none"}`);
}
for (const check of checks) {
  if (!requiredKeys.has(matrixKey(check.kind, check.id))) {
    failures.push(`${check.kind}:${check.id} appears in report but is not covered by the runtime definitions matrix`);
  }
}
for (const proof of onboardingProof) {
  if (!requiredKeys.has(matrixKey(proof.kind, proof.id))) {
    failures.push(`${proof.kind}:${proof.id} appears in onboarding proof but is not covered by the runtime definitions matrix`);
  }
}
for (const [kind, id, requiredStage] of required) {
  const check = checks.find((item) => item.kind === kind && item.id === id);
  const proof = onboardingProof.find((item) => item.kind === kind && item.id === id);
  if (!check) {
    failures.push(`${kind}:${id} missing from report`);
    continue;
  }
  if (!proof) {
    failures.push(`${kind}:${id} missing onboarding proof`);
    continue;
  }
  failures.push(...proofParityFailures(kind, id, check, proof));
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
  if (proof.verified !== true || proof.provenStage !== provenStage) {
    failures.push(`${kind}:${id} onboarding proof mismatch verified=${proof.verified} stage=${proof.provenStage}`);
  }
  const expectedTrust = check.readiness?.mode ?? "unverified";
  if (proof.trustCategory !== expectedTrust) {
    failures.push(`${kind}:${id} trust mismatch trust=${proof.trustCategory} expected=${expectedTrust}`);
  }
}

console.log(configuredOnly ? "configured live matrix summary" : "live matrix summary");
for (const check of checks) {
  const proof = onboardingProof.find((item) => item.kind === check.kind && item.id === check.id);
  const trust = proof?.trustCategory ?? check.readiness?.mode ?? "unverified";
  const target = check.identity?.label ?? proof?.identity?.label;
  const action = check.firstActionProof?.action ?? proof?.firstActionProof?.action;
  console.log(`- ${check.kind}:${check.id} status=${check.status} trust=${trust}:${check.readiness?.provenStage ?? "none"}${target ? ` target=${target}` : ""}${action ? ` action=${action}` : ""}`);
}
for (const line of renderRecoveryDiagnostics(checks, configuredOnly)) {
  console.log(line);
}
console.log(`tmp: ${tmpRoot}`);
console.log(`report: ${reportPath}`);

if (auditMode) {
  const audit = buildAuditReport({
    configuredOnly,
    reportPath,
    report,
    checks,
    onboardingProof,
    failures,
    result
  });
  const artifacts = writeAuditArtifacts(audit, outputPath);
  console.log(`audit: ${artifacts.jsonPath}`);
  console.log(`audit_markdown: ${artifacts.markdownPath}`);
}

if (failures.length > 0 && (!auditMode || strictAudit)) {
  fail(`live matrix failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
}

if (failures.length > 0) {
  console.log("live matrix audit complete");
} else {
  console.log("live matrix passed");
}

function buildRequiredMatrix(aiDefinitions, mcpDefinitions) {
  return [
    ...Object.keys(aiDefinitions).map((id) => ["ai", id, "protocol-tool-call"]),
    ...Object.values(mcpDefinitions).map((server) => [
      "mcp",
      server.id,
      server.protocolReadiness === "tools/call"
        ? "protocol-tool-call"
        : server.protocolReadiness === "tools/list"
          ? "protocol-tools-list"
          : "credential-probe"
    ])
  ];
}

function matrixKey(kind, id) {
  return `${kind}:${id}`;
}

function sameTargetSet(left, right) {
  if (!Array.isArray(left) || left.length !== right.length) {
    return false;
  }
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((item, index) => item === rightSorted[index]);
}

function proofParityFailures(kind, id, check, proof) {
  const failures = [];
  const prefix = `${kind}:${id}`;
  const expectedTrust = check.readiness?.mode ?? "unverified";
  const provenStage = check.readiness?.provenStage ?? "none";
  const expectedCaptured = Array.isArray(check.missingEnv) ? check.missingEnv.length === 0 : true;
  const expectedProtocolApplicable = kind === "ai" || MCP_SERVER_DEFINITIONS[id]?.protocolReadiness !== "not-applicable";
  const credentialStage = readinessStageStatus(check, ["credential-probe"], "skipped");
  const protocolStage = readinessStageStatus(check, ["protocol-tools-list", "protocol-tool-call"], "not-applicable");
  if (proof.status !== check.status) {
    failures.push(`${prefix} proof status mismatch status=${proof.status} expected=${check.status}`);
  }
  if (proof.captured !== expectedCaptured) {
    failures.push(`${prefix} proof captured mismatch captured=${proof.captured} expected=${expectedCaptured}`);
  }
  if (proof.checkedAt !== check.checkedAt) {
    failures.push(`${prefix} proof checkedAt mismatch checkedAt=${proof.checkedAt} expected=${check.checkedAt}`);
  }
  if (proof.protocolApplicable !== expectedProtocolApplicable) {
    failures.push(`${prefix} proof protocolApplicable mismatch value=${proof.protocolApplicable} expected=${expectedProtocolApplicable}`);
  }
  if (proof.trustCategory !== expectedTrust) {
    failures.push(`${prefix} trust mismatch trust=${proof.trustCategory} expected=${expectedTrust}`);
  }
  if (proof.provenStage !== provenStage) {
    failures.push(`${prefix} proof provenStage mismatch stage=${proof.provenStage} expected=${provenStage}`);
  }
  if (proof.proof?.readinessMode !== expectedTrust) {
    failures.push(`${prefix} nested readinessMode mismatch value=${proof.proof?.readinessMode} expected=${expectedTrust}`);
  }
  if (proof.proof?.provenStage !== provenStage) {
    failures.push(`${prefix} nested provenStage mismatch value=${proof.proof?.provenStage} expected=${provenStage}`);
  }
  if (proof.proof?.credentialStage !== credentialStage) {
    failures.push(`${prefix} nested credentialStage mismatch value=${proof.proof?.credentialStage} expected=${credentialStage}`);
  }
  if (proof.proof?.protocolStage !== protocolStage) {
    failures.push(`${prefix} nested protocolStage mismatch value=${proof.proof?.protocolStage} expected=${protocolStage}`);
  }
  const expectedEndpoint = check.endpoint;
  if ((proof.proof?.endpoint ?? undefined) !== expectedEndpoint) {
    failures.push(`${prefix} nested endpoint mismatch value=${proof.proof?.endpoint ?? "none"} expected=${expectedEndpoint ?? "none"}`);
  }
  const expectedIdentity = check.identity ?? null;
  if (stableJson(proof.identity ?? null) !== stableJson(expectedIdentity)) {
    failures.push(`${prefix} proof identity mismatch value=${formatJson(proof.identity ?? null)} expected=${formatJson(expectedIdentity)}`);
  }
  const expectedFirstActionProof = check.firstActionProof ?? null;
  if (stableJson(proof.firstActionProof ?? null) !== stableJson(expectedFirstActionProof)) {
    failures.push(`${prefix} firstActionProof mismatch value=${formatJson(proof.firstActionProof ?? null)} expected=${formatJson(expectedFirstActionProof)}`);
  }
  const expectedPolicy = check.policy ?? null;
  const proofPolicy = proof.policy ?? null;
  if (stableJson(proofPolicy) !== stableJson(expectedPolicy)) {
    failures.push(`${prefix} proof policy mismatch value=${formatJson(proofPolicy)} expected=${formatJson(expectedPolicy)}`);
  }
  return failures;
}

function stableJson(value) {
  return JSON.stringify(sortJson(value));
}

function formatJson(value) {
  return stableJson(value);
}

function sortJson(value) {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
  }
  return value;
}

function readinessStageStatus(check, stageNames, fallback) {
  const stage = check.readiness?.stages?.find((item) => stageNames.includes(item.stage));
  return stage?.status ?? fallback;
}

function renderRecoveryDiagnostics(checks, configuredOnlyMode) {
  const failedChecks = checks.filter((check) => shouldRenderRecoveryDiagnostic(check, configuredOnlyMode));
  if (failedChecks.length === 0) {
    return [];
  }
  const lines = [
    "",
    "Recovery diagnostics",
    "repair: rph setup repair --live"
  ];
  for (const check of failedChecks) {
    const diagnostic = recoveryDiagnostic(check);
    lines.push(`- ${check.kind}:${check.id}`);
    lines.push(`  classification: ${diagnostic.classification}`);
    lines.push(`  cause: ${diagnostic.cause}`);
    lines.push(`  env: ${diagnostic.env}`);
    lines.push(`  next: ${diagnostic.next}`);
    lines.push(`  degraded: ${diagnostic.degraded}`);
    lines.push(`  recheck: ${diagnostic.recheck}`);
  }
  return lines;
}

function shouldRenderRecoveryDiagnostic(check, configuredOnlyMode) {
  if (check.status === "passed") {
    return false;
  }
  if (configuredOnlyMode && check.status === "skipped" && Array.isArray(check.missingEnv) && check.missingEnv.length > 0) {
    return false;
  }
  return true;
}

function recoveryDiagnostic(check) {
  const classification = recoveryClassification(check);
  return {
    classification,
    cause: recoveryCause(check),
    env: recoveryEnvGuidance(check, classification),
    next: recoveryNextAction(check, classification),
    degraded: recoveryDegradedCommand(check),
    recheck: recoveryRecheckCommand(check)
  };
}

function recoveryClassification(check) {
  if (Array.isArray(check.missingEnv) && check.missingEnv.length > 0) {
    return "missing-env";
  }
  const statusCode = failedStatusCode(check);
  if (statusCode === 401 || statusCode === 403) {
    return check.kind === "ai" ? "ai-invalid-credentials" : "mcp-invalid-credentials";
  }
  if (statusCode === 429) {
    return check.kind === "ai" ? "ai-quota-or-rate-limit" : "mcp-quota-or-rate-limit";
  }
  const failedStage = failedReadinessStage(check);
  if (check.kind === "ai" && failedStage?.stage === "protocol-tool-call") {
    return "ai-generation-failed";
  }
  if (check.kind === "mcp" && (failedStage?.stage === "protocol-tools-list" || failedStage?.stage === "protocol-tool-call")) {
    return "mcp-protocol-failed";
  }
  return "connection-failed";
}

function recoveryCause(check) {
  if (Array.isArray(check.missingEnv) && check.missingEnv.length > 0) {
    return `missing ${check.missingEnv.join(", ")}`;
  }
  const failedStage = failedReadinessStage(check);
  if (failedStage) {
    return redactSecretText(`${failedStage.stage} failed: ${failedStage.message}`);
  }
  return redactSecretText(check.message ?? "connection check failed");
}

function recoveryEnvGuidance(check, classification) {
  if (Array.isArray(check.missingEnv) && check.missingEnv.length > 0) {
    return `set ${check.missingEnv.join(", ")} in .env or the current shell env`;
  }
  if (classification === "ai-invalid-credentials" || classification === "mcp-invalid-credentials") {
    const envKeys = credentialEnvKeys(check);
    if (envKeys.length > 0) {
      return `replace ${envKeys.join(", ")} in .env or the current shell env`;
    }
    return "replace this target's credential env var; keep the rejected value out of logs";
  }
  if (classification === "ai-quota-or-rate-limit" || classification === "mcp-quota-or-rate-limit") {
    return "no secret replacement suggested for 429; check quota, billing, model access, or provider rate limits";
  }
  const envKeys = credentialEnvKeys(check);
  if (envKeys.length > 0) {
    return `verify ${envKeys.join(", ")} without printing its value`;
  }
  return "no secret value needed in logs; keep credential values redacted";
}

function recoveryNextAction(check, classification) {
  if (classification === "missing-env") {
    return "set the missing env vars, then rerun the configured live matrix";
  }
  if (classification === "ai-invalid-credentials" || classification === "mcp-invalid-credentials") {
    return "replace the rejected credential, then run the exact target recheck";
  }
  if (classification === "ai-quota-or-rate-limit" || classification === "mcp-quota-or-rate-limit") {
    return "resolve quota, billing, model access, or rate limits, then run the exact target recheck";
  }
  if (check.kind === "ai") {
    return "verify provider model access and base URL, then rerun this AI target";
  }
  if (check.kind === "mcp") {
    return "verify connector credentials and permissions, then rerun this MCP target";
  }
  return "repair the connection values, then rerun the live check";
}

function recoveryDegradedCommand(check) {
  if (check.kind === "ai") {
    return "rph setup auto --live --ai none";
  }
  if (check.kind === "mcp") {
    return "rph setup auto --live --mcp none";
  }
  return "rph setup auto --live --allow-missing";
}

function recoveryRecheckCommand(check) {
  if (check.kind === "ai" || check.kind === "mcp") {
    return `rph live ${check.kind}:${check.id}`;
  }
  return "rph setup check --live";
}

function failedReadinessStage(check) {
  return check.readiness?.stages?.find((stage) => stage.status === "failed");
}

function failedStatusCode(check) {
  const texts = [
    failedReadinessStage(check)?.message,
    check.message
  ].filter(Boolean);
  for (const text of texts) {
    const match = String(text).match(/\((401|403|429)\)|\bstatus[= ](401|403|429)\b|\b(401|403|429)\b/i);
    const value = match?.[1] ?? match?.[2] ?? match?.[3];
    if (value) {
      return Number(value);
    }
  }
  return null;
}

function credentialEnvKeys(check) {
  const keys = Array.isArray(check.requiredEnv) && check.requiredEnv.length > 0
    ? check.requiredEnv
    : Array.isArray(check.missingEnv)
      ? check.missingEnv
      : [];
  const credentialKeys = keys.filter((key) => /(API_KEY|TOKEN|SECRET|AUTH|KEY)$/i.test(key));
  return credentialKeys.length > 0 ? credentialKeys : keys;
}

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

function buildAuditReport(input) {
  const counts = { passed: 0, failed: 0, skipped: 0 };
  for (const check of input.checks) {
    if (check.status === "passed" || check.status === "failed" || check.status === "skipped") {
      counts[check.status] += 1;
    }
  }
  const checks = input.checks.map((check) => {
    const proof = input.onboardingProof.find((item) => item.kind === check.kind && item.id === check.id);
    const failedStage = check.readiness?.stages?.find((stage) => stage.status === "failed");
    return sanitizeJson({
      kind: check.kind,
      id: check.id,
      status: check.status,
      trust: proof?.trustCategory ?? check.readiness?.mode ?? "unverified",
      provenStage: check.readiness?.provenStage ?? "none",
      message: check.message,
      cause: check.missingEnv?.length > 0
        ? `missing ${check.missingEnv.join(", ")}`
        : failedStage
          ? `${failedStage.stage} failed: ${failedStage.message}`
          : check.message,
      missingEnv: check.missingEnv ?? [],
      identity: check.identity ?? null,
      firstActionProof: check.firstActionProof ?? null,
      policy: check.policy ?? null
    });
  });
  return sanitizeJson({
    schema: "rph-live-audit-v0",
    generatedAt: new Date().toISOString(),
    configuredOnly: input.configuredOnly,
    strict: !auditMode || strictAudit,
    setupExitStatus: input.result.status,
    sourceReport: input.reportPath,
    provenance: input.report.provenance ?? null,
    summary: {
      total: input.checks.length,
      passed: counts.passed,
      failed: counts.failed,
      skipped: counts.skipped,
      releaseReady: input.failures.length === 0
    },
    failedTargets: checks.filter((check) => check.status === "failed").map((check) => `${check.kind}:${check.id}`),
    skippedTargets: checks.filter((check) => check.status === "skipped").map((check) => `${check.kind}:${check.id}`),
    checks,
    failures: input.failures.map(redactSecretText)
  });
}

function writeAuditArtifacts(audit, requestedOutputPath) {
  const jsonPath = resolveAuditJsonPath(requestedOutputPath);
  const markdownPath = jsonPath.endsWith(".json")
    ? `${jsonPath.slice(0, -5)}.md`
    : `${jsonPath}.md`;
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(audit, null, 2)}\n`);
  fs.writeFileSync(markdownPath, renderAuditMarkdown(audit));
  return { jsonPath, markdownPath };
}

function resolveAuditJsonPath(requestedOutputPath) {
  if (!requestedOutputPath) {
    return path.join(repoRoot, ".rph", "live-audit", "latest.json");
  }
  const resolved = path.resolve(requestedOutputPath);
  if (resolved.endsWith(".json")) {
    return resolved;
  }
  return path.join(resolved, "latest.json");
}

function renderAuditMarkdown(audit) {
  const lines = [
    "# RPH Live Credential Audit",
    "",
    `- generated_at: ${audit.generatedAt}`,
    `- release_ready: ${audit.summary.releaseReady ? "yes" : "no"}`,
    `- summary: passed=${audit.summary.passed} failed=${audit.summary.failed} skipped=${audit.summary.skipped} total=${audit.summary.total}`,
    "",
    "## Checks",
    ""
  ];
  for (const check of audit.checks) {
    lines.push(`- ${check.kind}:${check.id} status=${check.status} trust=${check.trust}:${check.provenStage}`);
    if (check.cause) {
      lines.push(`  - cause: ${check.cause}`);
    }
    if (check.missingEnv.length > 0) {
      lines.push(`  - missing_env: ${check.missingEnv.join(", ")}`);
    }
  }
  if (audit.failures.length > 0) {
    lines.push("", "## Release Blockers", "");
    for (const failure of audit.failures) {
      lines.push(`- ${failure}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function sanitizeJson(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeJson(item)]));
  }
  if (typeof value === "string") {
    return redactSecretText(value);
  }
  return value;
}

function redactSecretText(value) {
  return value
    .replace(/\b(?:sk|ghp|github_pat|xoxb|figd|ntn)_[A-Za-z0-9_-]{8,}\b/g, "[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi, "Bearer [redacted]")
    .replace(/\b(api[_-]?key|token|secret|authorization)(=|:)\s*["']?[^,\s"}]+/gi, "$1$2<redacted>");
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
  console.error(redactSecretText(message));
  process.exit(1);
}
