import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

type MatrixCheck = ReturnType<typeof passedAiCheck> | ReturnType<typeof failedAiCheck> | ReturnType<typeof skippedCheck>;

describe("live matrix report integrity", () => {
  it("fails when connection report provenance is missing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rph-live-matrix-provenance-"));
    try {
      const reportPath = path.join(root, "latest.json");
      const report = createSingleTargetReport("ai:openai");
      delete (report as { provenance?: unknown }).provenance;
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      const result = spawnSync(process.execPath, [
        path.resolve(__dirname, "..", "scripts", "live-matrix.mjs"),
        "--configured-only",
        "--validate-report",
        reportPath
      ], {
        cwd: path.resolve(__dirname, ".."),
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("connection report provenance missing");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("validates a single live target report", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rph-live-target-openai-"));
    try {
      const reportPath = path.join(root, "latest.json");
      const report = createSingleTargetReport("ai:openai");
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      const result = spawnSync(process.execPath, [
        path.resolve(__dirname, "..", "scripts", "live-target.mjs"),
        "ai:openai",
        "--validate-report",
        reportPath
      ], {
        cwd: path.resolve(__dirname, ".."),
        encoding: "utf8"
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("live target passed");
      expect(result.stdout).toContain("ai:openai status=passed");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a matrix report reused as single-target proof", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rph-live-target-matrix-reuse-"));
    try {
      const reportPath = path.join(root, "latest.json");
      const report = createMatrixReport();
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      const result = spawnSync(process.execPath, [
        path.resolve(__dirname, "..", "scripts", "live-target.mjs"),
        "ai:openai",
        "--validate-report",
        reportPath
      ], {
        cwd: path.resolve(__dirname, ".."),
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("selected target proof is not single-target");
      expect(result.stderr).toContain("selectedTargets must equal [ai:openai]");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails single-target validation when extra checks are present", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rph-live-target-extra-checks-"));
    try {
      const reportPath = path.join(root, "latest.json");
      const report = createMatrixReport();
      report.provenance.selectedTargets = ["ai:openai"];
      report.provenance.checkedTargetCount = 1;
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      const result = spawnSync(process.execPath, [
        path.resolve(__dirname, "..", "scripts", "live-target.mjs"),
        "ai:openai",
        "--validate-report",
        reportPath
      ], {
        cwd: path.resolve(__dirname, ".."),
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("selected target proof is not single-target");
      expect(result.stderr).toContain("checks=[ai:openai,ai:anthropic,ai:gemini,ai:local,mcp:notion,mcp:github,mcp:figma,mcp:stitch]");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails single live target validation when the target check failed", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rph-live-target-failed-"));
    try {
      const reportPath = path.join(root, "latest.json");
      const report = createSingleTargetReport("ai:openai");
      report.checks[0] = failedAiCheck("openai", "2026-01-01T00:00:00.000Z");
      report.onboardingProof[0] = proofFromCheck(report.checks[0]);
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      const result = spawnSync(process.execPath, [
        path.resolve(__dirname, "..", "scripts", "live-target.mjs"),
        "ai:openai",
        "--validate-report",
        reportPath
      ], {
        cwd: path.resolve(__dirname, ".."),
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("ai:openai status=failed stage=none");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails when live matrix provenance selectedTargets do not exactly match the checks array", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rph-live-matrix-selected-targets-"));
    try {
      const reportPath = path.join(root, "latest.json");
      const report = createMatrixReport();
      report.provenance.selectedTargets = ["ai:openai"];
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      const result = spawnSync(process.execPath, [
        path.resolve(__dirname, "..", "scripts", "live-matrix.mjs"),
        "--configured-only",
        "--validate-report",
        reportPath
      ], {
        cwd: path.resolve(__dirname, ".."),
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("connection report provenance selectedTargets mismatch");
      expect(result.stderr).toContain("selected=[ai:openai]");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails when onboarding proof no longer matches the corresponding check", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rph-live-matrix-report-"));
    try {
      const reportPath = path.join(root, "latest.json");
      const report = createMatrixReport();
      report.onboardingProof[0].checkedAt = "2026-01-01T00:00:01.000Z";
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      const result = spawnSync(process.execPath, [
        path.resolve(__dirname, "..", "scripts", "live-matrix.mjs"),
        "--configured-only",
        "--validate-report",
        reportPath
      ], {
        cwd: path.resolve(__dirname, ".."),
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("ai:openai proof checkedAt mismatch");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails configured-only validation when a captured OpenAI credential is rejected", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rph-live-matrix-openai-401-"));
    try {
      const reportPath = path.join(root, "latest.json");
      const secretLike = "sk_test_secret_value_2468135790";
      const report = createMatrixReport();
      report.checks[0] = failedAiCheck("openai", "2026-01-01T00:00:00.000Z");
      report.checks[0].message = `credential: token=${secretLike} rejected (401); generation: skipped`;
      report.checks[0].readiness.stages[1].message = `token=${secretLike} rejected (401)`;
      report.onboardingProof[0] = proofFromCheck(report.checks[0]);
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      const result = spawnSync(process.execPath, [
        path.resolve(__dirname, "..", "scripts", "live-matrix.mjs"),
        "--configured-only",
        "--validate-report",
        reportPath
      ], {
        cwd: path.resolve(__dirname, ".."),
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("Recovery diagnostics");
      expect(result.stdout).toContain("ai:openai");
      expect(result.stdout).toContain("classification: ai-invalid-credentials");
      expect(result.stdout).toContain("env: replace OPENAI_API_KEY in .env or the current shell env");
      expect(result.stdout).toContain("degraded: rph setup auto --live --ai none");
      expect(result.stdout).toContain("recheck: rph live ai:openai");
      expect(result.stdout).toContain("token=<redacted> rejected (401)");
      expect(result.stdout).not.toContain(secretLike);
      expect(result.stderr).toContain("ai:openai status=failed stage=none message=credential: token=<redacted> rejected (401); generation: skipped");
      expect(result.stderr).not.toContain(secretLike);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("prints recovery diagnostics when a configured Gemini credential hits quota or rate limits", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rph-live-matrix-gemini-429-"));
    try {
      const reportPath = path.join(root, "latest.json");
      const secretLike = "AIza_test_secret_value_2468135790";
      const report = createMatrixReport();
      report.checks[2] = rateLimitedAiCheck("gemini", "2026-01-01T00:00:00.000Z");
      report.checks[2].message = `credential: model catalog credential probe passed (200); generation: token=${secretLike} rate limited (429)`;
      report.checks[2].readiness.stages[2].message = `token=${secretLike} rate limited (429)`;
      report.onboardingProof[2] = proofFromCheck(report.checks[2]);
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      const result = spawnSync(process.execPath, [
        path.resolve(__dirname, "..", "scripts", "live-matrix.mjs"),
        "--configured-only",
        "--validate-report",
        reportPath
      ], {
        cwd: path.resolve(__dirname, ".."),
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("Recovery diagnostics");
      expect(result.stdout).toContain("ai:gemini");
      expect(result.stdout).toContain("classification: ai-quota-or-rate-limit");
      expect(result.stdout).toContain("env: no secret replacement suggested for 429; check quota, billing, model access, or provider rate limits");
      expect(result.stdout).toContain("degraded: rph setup auto --live --ai none");
      expect(result.stdout).toContain("recheck: rph live ai:gemini");
      expect(result.stdout).toContain("token=<redacted> rate limited (429)");
      expect(result.stdout).not.toContain(secretLike);
      expect(result.stderr).toContain("ai:gemini status=failed stage=credential-probe message=credential: model catalog credential probe passed (200); generation: token=<redacted> rate limited (429)");
      expect(result.stderr).not.toContain(secretLike);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes a sanitized audit report for invalid configured credentials without passing release readiness", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rph-live-matrix-audit-"));
    try {
      const reportPath = path.join(root, "latest.json");
      const auditPath = path.join(root, "audit", "latest.json");
      const secretLike = "sk_test_secret_value_1234567890";
      const report = createMatrixReport();
      report.checks[0] = failedAiCheck("openai", "2026-01-01T00:00:00.000Z");
      report.checks[0].message = `credential: token=${secretLike} rejected (401); generation: skipped`;
      report.onboardingProof[0] = proofFromCheck(report.checks[0]);
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      const result = spawnSync(process.execPath, [
        path.resolve(__dirname, "..", "scripts", "live-matrix.mjs"),
        "--configured-only",
        "--audit",
        "--output",
        auditPath,
        "--validate-report",
        reportPath
      ], {
        cwd: path.resolve(__dirname, ".."),
        encoding: "utf8"
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("configured live matrix summary");
      expect(result.stdout).toContain("ai:openai status=failed");
      expect(result.stdout).toContain("audit:");
      expect(result.stdout).toContain("live matrix audit complete");
      expect(result.stdout).not.toContain(secretLike);
      const rawAudit = fs.readFileSync(auditPath, "utf8");
      const rawMarkdown = fs.readFileSync(auditPath.replace(/\.json$/, ".md"), "utf8");
      expect(rawAudit).toContain("\"schema\": \"rph-live-audit-v0\"");
      expect(rawAudit).toContain("\"releaseReady\": false");
      expect(rawAudit).toContain("ai:openai");
      expect(rawAudit).toContain("<redacted>");
      expect(rawAudit).not.toContain(secretLike);
      expect(rawMarkdown).toContain("release_ready: no");
      expect(rawMarkdown).toContain("ai:openai status=failed");
      expect(rawMarkdown).not.toContain(secretLike);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails strict audit validation when an invalid configured credential is present", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rph-live-matrix-audit-strict-"));
    try {
      const reportPath = path.join(root, "latest.json");
      const auditPath = path.join(root, "audit", "latest.json");
      const secretLike = "sk_test_secret_value_0987654321";
      const report = createMatrixReport();
      report.checks[0] = failedAiCheck("openai", "2026-01-01T00:00:00.000Z");
      report.checks[0].message = `credential: token=${secretLike} rejected (401); generation: skipped`;
      report.onboardingProof[0] = proofFromCheck(report.checks[0]);
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      const result = spawnSync(process.execPath, [
        path.resolve(__dirname, "..", "scripts", "live-matrix.mjs"),
        "--configured-only",
        "--audit",
        "--strict",
        "--output",
        auditPath,
        "--validate-report",
        reportPath
      ], {
        cwd: path.resolve(__dirname, ".."),
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("audit:");
      expect(result.stderr).toContain("live matrix failed");
      expect(result.stderr).toContain("ai:openai status=failed");
      expect(result.stderr).toContain("<redacted>");
      expect(result.stderr).not.toContain(secretLike);
      expect(fs.existsSync(auditPath)).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails when onboarding proof trust metadata drifts from checks", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rph-live-matrix-trust-"));
    try {
      const reportPath = path.join(root, "latest.json");
      const report = createMatrixReport();
      report.onboardingProof[0].trustCategory = "adapter-ready";
      report.onboardingProof[7].protocolApplicable = false;
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      const result = spawnSync(process.execPath, [
        path.resolve(__dirname, "..", "scripts", "live-matrix.mjs"),
        "--configured-only",
        "--validate-report",
        reportPath
      ], {
        cwd: path.resolve(__dirname, ".."),
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("ai:openai trust mismatch trust=adapter-ready expected=protocol-ready");
      expect(result.stderr).toContain("mcp:stitch proof protocolApplicable mismatch");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails when onboarding proof identity drifts from checks", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rph-live-matrix-identity-"));
    try {
      const reportPath = path.join(root, "latest.json");
      const report = createMatrixReport();
      (report.onboardingProof[0].identity as { targetId: string }).targetId = "gpt-wrong";
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      const result = spawnSync(process.execPath, [
        path.resolve(__dirname, "..", "scripts", "live-matrix.mjs"),
        "--configured-only",
        "--validate-report",
        reportPath
      ], {
        cwd: path.resolve(__dirname, ".."),
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("ai:openai proof identity mismatch");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails when onboarding proof first action proof drifts from checks", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rph-live-matrix-first-action-"));
    try {
      const reportPath = path.join(root, "latest.json");
      const report = createMatrixReport();
      (report.onboardingProof[0].firstActionProof as { action: string }).action = "openai.other_action";
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      const result = spawnSync(process.execPath, [
        path.resolve(__dirname, "..", "scripts", "live-matrix.mjs"),
        "--configured-only",
        "--validate-report",
        reportPath
      ], {
        cwd: path.resolve(__dirname, ".."),
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("ai:openai firstActionProof mismatch");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails when onboarding proof MCP policy drifts from checks", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rph-live-matrix-policy-"));
    try {
      const reportPath = path.join(root, "latest.json");
      const report = createMatrixReport();
      (report.onboardingProof[7].policy as { agentReadOnlyTools: string[] }).agentReadOnlyTools = [];
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      const result = spawnSync(process.execPath, [
        path.resolve(__dirname, "..", "scripts", "live-matrix.mjs"),
        "--configured-only",
        "--validate-report",
        reportPath
      ], {
        cwd: path.resolve(__dirname, ".."),
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("mcp:stitch proof policy mismatch");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("runs configured-only matrix through setup auto --from-env --live --allow-missing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rph-live-matrix-configured-only-"));
    try {
      const scriptDir = path.join(root, "scripts");
      const cliDir = path.join(root, "dist", "apps", "cli", "src");
      const settingsDir = path.join(root, "dist", "packages", "core", "src");
      const captureFile = path.join(root, "argv.json");
      fs.mkdirSync(scriptDir, { recursive: true });
      fs.mkdirSync(cliDir, { recursive: true });
      fs.mkdirSync(settingsDir, { recursive: true });
      fs.copyFileSync(path.resolve(__dirname, "..", "scripts", "live-matrix.mjs"), path.join(scriptDir, "live-matrix.mjs"));
      fs.writeFileSync(path.join(settingsDir, "settings.js"), [
        "module.exports = {",
        "  AI_PROVIDER_DEFINITIONS: { openai: { id: 'openai' } },",
        "  MCP_SERVER_DEFINITIONS: { stitch: { id: 'stitch', protocolReadiness: 'tools/call' } }",
        "};"
      ].join("\n"));
      fs.writeFileSync(path.join(cliDir, "index.js"), [
        "const fs = require('node:fs');",
        "const path = require('node:path');",
        `fs.writeFileSync(${JSON.stringify(captureFile)}, JSON.stringify(process.argv.slice(2)));`,
        "const outDir = path.join(process.cwd(), '.rph', 'connections');",
        "fs.mkdirSync(outDir, { recursive: true });",
        `const report = ${JSON.stringify(createConfiguredOnlyMatrixReport())};`,
        "fs.writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify(report, null, 2));"
      ].join("\n"));

      const result = spawnSync(process.execPath, [
        path.join(scriptDir, "live-matrix.mjs"),
        "--configured-only"
      ], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          RPH_TEST_CAPTURE_ARGV: captureFile
        }
      });
      const argv = JSON.parse(fs.readFileSync(captureFile, "utf8")) as string[];

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("configured live matrix summary");
      expect(result.stdout).toContain("live matrix passed");
      expect(argv).toEqual([
        "setup",
        "auto",
        "--from-env",
        "--live",
        "--allow-missing",
        "--ai",
        "all",
        "--mcp",
        "all"
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

function createConfiguredOnlyMatrixReport() {
  const checkedAt = "2026-01-01T00:00:00.000Z";
  const checks = [
    skippedCheck("ai", "openai", ["OPENAI_API_KEY"], "protocol-tool-call", true, checkedAt),
    skippedCheck("mcp", "stitch", ["STITCH_API_KEY"], "protocol-tool-call", true, checkedAt)
  ];
  return {
    checkedAt,
    provenance: {
      source: "live",
      runner: "cli",
      command: "setup auto --from-env --live --allow-missing --ai all --mcp all",
      projectInitialized: true,
      selectedTargets: checks.map((check) => `${check.kind}:${check.id}`),
      checkedTargetCount: checks.length,
      generatedAt: checkedAt
    },
    checks,
    onboardingProof: checks.map((check) => proofFromCheck(check))
  };
}

function createMatrixReport() {
  const checkedAt = "2026-01-01T00:00:00.000Z";
  const checks: MatrixCheck[] = [
    passedAiCheck("openai", checkedAt),
    skippedCheck("ai", "anthropic", ["ANTHROPIC_API_KEY"], "protocol-tool-call", true, checkedAt),
    skippedCheck("ai", "gemini", ["GEMINI_API_KEY"], "protocol-tool-call", true, checkedAt),
    skippedCheck("ai", "local", ["LOCAL_AI_BASE_URL"], "protocol-tool-call", true, checkedAt),
    skippedCheck("mcp", "notion", ["NOTION_TOKEN", "NOTION_PARENT_PAGE_ID"], "protocol-tools-list", false, checkedAt),
    skippedCheck("mcp", "github", ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO"], "protocol-tools-list", false, checkedAt),
    skippedCheck("mcp", "figma", ["FIGMA_TOKEN", "FIGMA_FILE_ID"], "protocol-tools-list", false, checkedAt),
    skippedCheck("mcp", "stitch", ["STITCH_API_KEY"], "protocol-tool-call", true, checkedAt)
  ];
  (checks[7] as MatrixCheck & { policy?: unknown }).policy = {
    kind: "read-only-allowlist",
    source: "built-in",
    state: "unverified",
    satisfied: false,
    requiredTrust: "protocol-ready:protocol-tool-call",
    actualTrust: "unverified:none",
    allowToolsList: true,
    allowReadOnlyToolCall: true,
    requireExplicitServerSelection: true,
    agentReadOnlyTools: ["list_projects"],
    requiredTools: ["list_projects"],
    missingTools: [],
    configFingerprint: "fixture-policy"
  };
  return {
    checkedAt,
    provenance: {
      source: "mock",
      runner: "test",
      command: "fixture live matrix",
      projectInitialized: true,
      selectedTargets: checks.map((check) => `${check.kind}:${check.id}`),
      checkedTargetCount: checks.length,
      generatedAt: checkedAt
    },
    checks,
    onboardingProof: checks.map((check) => proofFromCheck(check))
  };
}

function createSingleTargetReport(target: string) {
  const report = createMatrixReport();
  const [kind, id] = target.split(":");
  const check = report.checks.find((item) => item.kind === kind && item.id === id);
  if (!check) {
    throw new Error(`fixture target missing: ${target}`);
  }
  report.checks = [check];
  report.onboardingProof = [proofFromCheck(check)];
  report.provenance.selectedTargets = [target];
  report.provenance.checkedTargetCount = 1;
  return report;
}

function passedAiCheck(id: string, checkedAt: string) {
  return {
    kind: "ai",
    id,
    status: "passed",
    message: "credential: model catalog credential probe passed (200); generation: smoke passed",
    requiredEnv: ["OPENAI_API_KEY"],
    missingEnv: [],
    endpoint: "https://api.openai.com/v1/responses",
    identity: {
      type: "ai-provider",
      label: "openai gpt-5.4",
      targetId: "gpt-5.4",
      verifiedBy: "protocol-tool-call",
      source: "configuration"
    },
    firstActionProof: {
      action: "openai.generation_smoke",
      label: "generated smoke response with gpt-5.4",
      targetId: "gpt-5.4",
      verifiedBy: "protocol-tool-call",
      endpoint: "https://api.openai.com/v1/responses"
    },
    checkedAt,
    readiness: {
      mode: "protocol-ready",
      provenStage: "protocol-tool-call",
      stages: [
        { stage: "transport", status: "passed", message: "provider endpoint reachable", endpoint: "https://api.openai.com/v1/models" },
        { stage: "credential-probe", status: "passed", message: "model catalog credential probe passed (200)", endpoint: "https://api.openai.com/v1/models" },
        { stage: "protocol-tool-call", status: "passed", message: "generation smoke passed", endpoint: "https://api.openai.com/v1/responses" }
      ]
    }
  };
}

function failedAiCheck(id: string, checkedAt: string) {
  return {
    kind: "ai",
    id,
    status: "failed",
    message: "credential: request failed (401); generation: skipped",
    requiredEnv: aiRequiredEnv(id),
    missingEnv: [],
    endpoint: "https://api.openai.com/v1/responses",
    checkedAt,
    readiness: {
      mode: "unverified",
      provenStage: "none",
      stages: [
        { stage: "transport", status: "passed", message: "provider endpoint reachable", endpoint: "https://api.openai.com/v1/models" },
        { stage: "credential-probe", status: "failed", message: "request failed (401)", endpoint: "https://api.openai.com/v1/models" },
        { stage: "protocol-tool-call", status: "skipped", message: "generation skipped after credential failure", endpoint: "https://api.openai.com/v1/responses" }
      ]
    }
  };
}

function rateLimitedAiCheck(id: string, checkedAt: string) {
  return {
    kind: "ai",
    id,
    status: "failed",
    message: "credential: model catalog credential probe passed (200); generation: request failed (429)",
    requiredEnv: aiRequiredEnv(id),
    missingEnv: [],
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    checkedAt,
    readiness: {
      mode: "protocol-partial",
      provenStage: "credential-probe",
      stages: [
        { stage: "transport", status: "passed", message: "provider endpoint reachable", endpoint: "https://generativelanguage.googleapis.com/v1beta/models" },
        { stage: "credential-probe", status: "passed", message: "model catalog credential probe passed (200)", endpoint: "https://generativelanguage.googleapis.com/v1beta/models" },
        { stage: "protocol-tool-call", status: "failed", message: "request failed (429)", endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" }
      ]
    }
  };
}

function aiRequiredEnv(id: string) {
  if (id === "gemini") {
    return ["GEMINI_API_KEY"];
  }
  if (id === "anthropic") {
    return ["ANTHROPIC_API_KEY"];
  }
  if (id === "local") {
    return ["LOCAL_AI_BASE_URL"];
  }
  return ["OPENAI_API_KEY"];
}

function skippedCheck(
  kind: "ai" | "mcp",
  id: string,
  missingEnv: string[],
  protocolStage: "protocol-tool-call" | "protocol-tools-list",
  protocolApplicable: boolean,
  checkedAt: string
) {
  return {
    kind,
    id,
    status: "skipped",
    message: "required environment variables are missing",
    requiredEnv: missingEnv,
    missingEnv,
    checkedAt,
    protocolApplicable,
    readiness: {
      mode: "unverified",
      provenStage: "none",
      stages: [
        { stage: "transport", status: "skipped", message: "not configured" },
        { stage: "credential-probe", status: "skipped", message: "missing credential" },
        { stage: protocolStage, status: "skipped", message: "missing credential" }
      ]
    }
  };
}

function proofFromCheck(check: MatrixCheck) {
  const credentialStage = check.readiness.stages.find((stage) => stage.stage === "credential-probe")?.status ?? "skipped";
  const protocolStage = check.readiness.stages.find((stage) => stage.stage === "protocol-tools-list" || stage.stage === "protocol-tool-call")?.status ?? "not-applicable";
  const endpoint = (check as { endpoint?: string }).endpoint;
  const protocolApplicable = (check as { protocolApplicable?: boolean }).protocolApplicable;
  const identity = cloneJson((check as { identity?: unknown }).identity);
  const firstActionProof = cloneJson((check as { firstActionProof?: unknown }).firstActionProof);
  const policy = cloneJson((check as { policy?: unknown }).policy);
  return {
    kind: check.kind,
    id: check.id,
    captured: check.missingEnv.length === 0,
    verified: check.status === "passed",
    status: check.status,
    trustCategory: check.readiness.mode,
    requiredEnv: check.requiredEnv,
    missingEnv: check.missingEnv,
    identity,
    firstActionProof,
    policy,
    provenStage: check.readiness.provenStage,
    protocolKind: check.kind === "ai" ? "ai-provider" : check.id === "stitch" ? "mcp-server" : "rest-adapter",
    protocolApplicable: check.kind === "ai" ? true : Boolean(protocolApplicable),
    proof: {
      readinessMode: check.readiness.mode,
      provenStage: check.readiness.provenStage,
      credentialStage,
      protocolStage,
      endpoint
    },
    checkedAt: check.checkedAt
  };
}

function cloneJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}
