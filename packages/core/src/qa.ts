import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { qaReportFile, qaReportMarkdownFile } from "./paths";
import { readJsonIfExists, writeJson, writeText } from "./fs";
import { QAReportRecord } from "./types";
import { nowIso } from "./time";
import { readPullRequest, updatePullRequest } from "./issues";

export function createQaReview(projectRoot: string, prNumber: number): QAReportRecord {
  const pr = readPullRequest(projectRoot, prNumber);
  const now = nowIso();
  const report = readQaReport(projectRoot, prNumber);
  const next: QAReportRecord = {
    ...report,
    prNumber,
    status: report.status,
    conflictStatus: report.conflictStatus,
    testStatus: report.testStatus,
    findings: mergeFindings(report.findings, [`QA review requested for PR #${prNumber}`]),
    reportPath: qaReportMarkdownFile(projectRoot, prNumber),
    createdAt: report.createdAt || now,
    updatedAt: now
  };
  writeQaReport(projectRoot, next);
  updatePullRequest(projectRoot, { ...pr, qaStatus: "requested", updatedAt: now });
  return next;
}

export function checkQaConflicts(projectRoot: string, prNumber: number): QAReportRecord {
  const report = readQaReport(projectRoot, prNumber);
  const status = spawnSync("git", ["status", "--porcelain"], {
    cwd: projectRoot,
    encoding: "utf8"
  });
  const conflictStatus: QAReportRecord["conflictStatus"] = status.status === 0 && !hasConflictMarkers(status.stdout)
    ? "clean"
    : "unknown";
  const findings = status.status === 0
    ? [`Conflict check: ${conflictStatus}`]
    : [`Conflict check unavailable: ${(status.stderr || status.stdout || "git status failed").trim()}`];
  const next = {
    ...report,
    conflictStatus,
    findings: mergeFindings(report.findings, findings),
    updatedAt: nowIso()
  };
  writeQaReport(projectRoot, next);
  return next;
}

export function runQaTests(projectRoot: string, prNumber: number): QAReportRecord {
  const report = readQaReport(projectRoot, prNumber);
  const packageJson = `${projectRoot}/package.json`;
  if (!fs.existsSync(packageJson)) {
    const next = {
      ...report,
      testStatus: "not-run" as const,
      findings: mergeFindings(report.findings, ["Test runner skipped: package.json not found"]),
      updatedAt: nowIso()
    };
    writeQaReport(projectRoot, next);
    return next;
  }
  const checks = [
    ["pnpm", ["run", "lint"]],
    ["pnpm", ["test"]],
    ["pnpm", ["run", "build"]]
  ] as const;
  const findings: string[] = [];
  let passed = true;
  for (const [command, args] of checks) {
    const result = spawnSync(command, args, { cwd: projectRoot, encoding: "utf8" });
    const label = `${command} ${args.join(" ")}`;
    findings.push(`${label}: ${result.status === 0 ? "passed" : "failed"}`);
    if (result.status !== 0) {
      passed = false;
      break;
    }
  }
  const next = {
    ...report,
    testStatus: passed ? "passed" as const : "failed" as const,
    findings: mergeFindings(report.findings, findings),
    updatedAt: nowIso()
  };
  writeQaReport(projectRoot, next);
  return next;
}

export function finalizeQaReport(projectRoot: string, prNumber: number): QAReportRecord {
  const report = readQaReport(projectRoot, prNumber);
  const status: QAReportRecord["status"] = report.conflictStatus === "conflict" || report.testStatus === "failed"
    ? "changes-requested"
    : "blocked";
  const next = {
    ...report,
    status,
    findings: mergeFindings(report.findings, ["Final merge decision remains blocked until user approval"]),
    updatedAt: nowIso()
  };
  writeQaReport(projectRoot, next);
  return next;
}

export function readQaReport(projectRoot: string, prNumber: number): QAReportRecord {
  const now = nowIso();
  return readJsonIfExists<QAReportRecord>(qaReportFile(projectRoot, prNumber), {
    prNumber,
    status: "blocked",
    conflictStatus: "unknown",
    testStatus: "not-run",
    requirementStatus: "unknown",
    designStatus: "unknown",
    apiContractStatus: "unknown",
    securityStatus: "unknown",
    accessibilityStatus: "unknown",
    findings: [],
    reportPath: qaReportMarkdownFile(projectRoot, prNumber),
    userMergeDecisionRequired: true,
    createdAt: now,
    updatedAt: now
  });
}

function writeQaReport(projectRoot: string, report: QAReportRecord): void {
  writeJson(qaReportFile(projectRoot, report.prNumber), report);
  writeText(qaReportMarkdownFile(projectRoot, report.prNumber), renderQaReport(report));
}

function renderQaReport(report: QAReportRecord): string {
  return [
    `# QA Report PR #${report.prNumber}`,
    "",
    `- status: ${report.status}`,
    `- conflict_status: ${report.conflictStatus}`,
    `- test_status: ${report.testStatus}`,
    `- requirement_status: ${report.requirementStatus}`,
    `- design_status: ${report.designStatus}`,
    `- api_contract_status: ${report.apiContractStatus}`,
    `- user_merge_decision_required: ${report.userMergeDecisionRequired}`,
    "",
    "## Findings",
    ...(report.findings.length > 0 ? report.findings.map((finding) => `- ${finding}`) : ["- TBD"])
  ].join("\n");
}

function mergeFindings(existing: string[], next: string[]): string[] {
  return [...new Set([...existing, ...next])];
}

function hasConflictMarkers(output: string): boolean {
  return output.split(/\r?\n/).some((line) => /^(UU|AA|DD|AU|UA|DU|UD)/.test(line.trim()));
}
