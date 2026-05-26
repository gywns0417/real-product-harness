import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { designArtifactDir, qaReportFile, qaReportMarkdownFile } from "./paths";
import { readJsonIfExists, writeJson, writeText } from "./fs";
import { QAReportRecord } from "./types";
import { nowIso } from "./time";
import { listPullRequests, readPullRequest, readWorkIssue, updatePullRequest } from "./issues";
import { updateWorkflowEvidence } from "./project";

const SECURITY_UNKNOWN_FINDING = "Security review not run; status remains unknown";
const ACCESSIBILITY_UNKNOWN_FINDING = "Accessibility review not run; status remains unknown";
const SECURITY_UNKNOWN_BLOCKER = "Release blocker: security status is unknown until a dedicated security review clears it or records a risk";
const ACCESSIBILITY_UNKNOWN_BLOCKER = "Release blocker: accessibility status is unknown until a dedicated accessibility review clears it or records a risk";
const SECURITY_STATIC_CHECK_FINDING = "Security-adjacent static checks passed; dedicated security review still required";
const ACCESSIBILITY_STATIC_CHECK_FINDING = "Accessibility-adjacent static checks passed; dedicated accessibility review still required";

export function createQaReview(projectRoot: string, prNumber: number): QAReportRecord {
  const pr = readPullRequest(projectRoot, prNumber);
  const issue = readWorkIssue(projectRoot, pr.issueNumber);
  const now = nowIso();
  const report = readQaReport(projectRoot, prNumber);
  const next: QAReportRecord = {
    ...report,
    prNumber,
    status: report.status,
    conflictStatus: report.conflictStatus,
    testStatus: report.testStatus,
    requirementStatus: issue.relatedDocs.includes("requirements") ? "matched" : "gap",
    designStatus: issue.relatedDocs.includes("screen-definition") || issue.relatedScreens.length > 0 ? "matched" : "gap",
    apiContractStatus: issue.relatedDocs.includes("api-contract") || issue.relatedApis.length > 0 ? "matched" : "gap",
    securityStatus: report.securityStatus,
    accessibilityStatus: report.accessibilityStatus,
    findings: syncReviewFindings(mergeFindings(report.findings, [
      `QA review requested for PR #${prNumber}`,
      `Requirement evidence linked from issue #${issue.issueNumber}`,
      `Approval remains required before merge for ${pr.sourceBranch}`
    ]), {
      securityStatus: report.securityStatus,
      accessibilityStatus: report.accessibilityStatus
    }),
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
      findings: syncReviewFindings(mergeFindings(report.findings, ["Test runner skipped: package.json not found"]), {
        securityStatus: report.securityStatus,
        accessibilityStatus: report.accessibilityStatus
      }),
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
  if (passed && report.securityStatus === "unknown") {
    findings.push(SECURITY_STATIC_CHECK_FINDING);
  }
  if (passed && report.accessibilityStatus === "unknown") {
    findings.push(ACCESSIBILITY_STATIC_CHECK_FINDING);
  }
  const next = {
    ...report,
    testStatus: passed ? "passed" as const : "failed" as const,
    securityStatus: report.securityStatus,
    accessibilityStatus: report.accessibilityStatus,
    findings: syncReviewFindings(mergeFindings(report.findings, findings), {
      securityStatus: report.securityStatus,
      accessibilityStatus: report.accessibilityStatus
    }),
    updatedAt: nowIso()
  };
  writeQaReport(projectRoot, next);
  return next;
}

export function finalizeQaReport(projectRoot: string, prNumber: number): QAReportRecord {
  const report = readQaReport(projectRoot, prNumber);
  const hasRisk = report.conflictStatus === "conflict"
    || report.testStatus === "failed"
    || report.requirementStatus === "gap"
    || report.designStatus === "gap"
    || report.apiContractStatus === "gap"
    || report.securityStatus === "risk"
    || report.accessibilityStatus === "risk";
  const isApproved = report.conflictStatus === "clean"
    && report.testStatus === "passed"
    && report.requirementStatus === "matched"
    && report.designStatus === "matched"
    && report.apiContractStatus === "matched"
    && report.securityStatus === "clear"
    && report.accessibilityStatus === "clear";
  const status: QAReportRecord["status"] = hasRisk ? "changes-requested" : isApproved ? "approved" : "blocked";
  const finalFinding = status === "approved"
    ? "QA gates passed; user merge approval remains required"
    : status === "changes-requested"
      ? "Final merge decision has blocking QA changes"
      : "Final merge decision remains blocked until user approval and all QA gates are clear";
  const next = {
    ...report,
    status,
    findings: syncReviewFindings(mergeFindings(report.findings, [finalFinding]), {
      securityStatus: report.securityStatus,
      accessibilityStatus: report.accessibilityStatus
    }),
    updatedAt: nowIso()
  };
  writeQaReport(projectRoot, next);
  updatePullRequest(projectRoot, {
    ...readPullRequest(projectRoot, prNumber),
    qaStatus: status === "approved" ? "approved" : status === "changes-requested" ? "changes-requested" : "requested",
    conflictStatus: next.conflictStatus,
    testStatus: next.testStatus,
    updatedAt: next.updatedAt
  });
  syncQaWorkflowEvidence(projectRoot, next);
  return next;
}

export function recordQaSecurityReview(
  projectRoot: string,
  prNumber: number,
  status: Extract<QAReportRecord["securityStatus"], "clear" | "risk">,
  finding?: string
): QAReportRecord {
  const normalizedFinding = requireQaReviewFinding("security", status, finding);
  const report = readQaReport(projectRoot, prNumber);
  const next = {
    ...report,
    securityStatus: status,
    findings: syncReviewFindings(mergeFindings(report.findings, [
      normalizedFinding
    ]), {
      securityStatus: status,
      accessibilityStatus: report.accessibilityStatus
    }),
    updatedAt: nowIso()
  };
  writeQaReport(projectRoot, next);
  return next;
}

export function runQaSecurityScan(projectRoot: string, prNumber: number): QAReportRecord {
  const packageJson = `${projectRoot}/package.json`;
  if (!fs.existsSync(packageJson)) {
    return recordQaSecurityReview(projectRoot, prNumber, "risk", "Automated security audit skipped: package.json not found");
  }
  const result = spawnSync("pnpm", ["audit", "--audit-level", "high", "--prod"], {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 30000
  });
  if (result.status === 0) {
    return recordQaSecurityReview(projectRoot, prNumber, "clear", "Automated security audit passed: pnpm audit --audit-level high --prod");
  }
  const detail = firstUsefulLine(result.stderr || result.stdout || "pnpm audit failed");
  return recordQaSecurityReview(projectRoot, prNumber, "risk", `Automated security audit failed: ${detail}`);
}

export function recordQaAccessibilityReview(
  projectRoot: string,
  prNumber: number,
  status: Extract<QAReportRecord["accessibilityStatus"], "clear" | "risk">,
  finding?: string
): QAReportRecord {
  const normalizedFinding = requireQaReviewFinding("accessibility", status, finding);
  const report = readQaReport(projectRoot, prNumber);
  const next = {
    ...report,
    accessibilityStatus: status,
    findings: syncReviewFindings(mergeFindings(report.findings, [
      normalizedFinding
    ]), {
      securityStatus: report.securityStatus,
      accessibilityStatus: status
    }),
    updatedAt: nowIso()
  };
  writeQaReport(projectRoot, next);
  return next;
}

export function runQaAccessibilityScan(projectRoot: string, prNumber: number): QAReportRecord {
  const previewPath = `${designArtifactDir(projectRoot, "landing-preview")}/preview.html`;
  if (!fs.existsSync(previewPath)) {
    return recordQaAccessibilityReview(projectRoot, prNumber, "risk", "Automated accessibility scan skipped: landing preview HTML not found");
  }
  const html = fs.readFileSync(previewPath, "utf8");
  const missing = [
    [/<html\s+[^>]*lang=/i, "html lang"],
    [/<title>[^<]+<\/title>/i, "title"],
    [/<meta\s+name=["']viewport["']/i, "viewport meta"],
    [/<main[\s>]/i, "main landmark"],
    [/<h1[\s>]/i, "h1"]
  ].flatMap(([pattern, label]) => pattern instanceof RegExp && pattern.test(html) ? [] : [String(label)]);
  if (missing.length === 0) {
    return recordQaAccessibilityReview(projectRoot, prNumber, "clear", `Automated accessibility structure scan passed: ${previewPath}`);
  }
  return recordQaAccessibilityReview(projectRoot, prNumber, "risk", `Automated accessibility structure scan failed: missing ${missing.join(", ")}`);
}

function requireQaReviewFinding(
  kind: "security" | "accessibility",
  status: "clear" | "risk",
  finding?: string
): string {
  const text = finding?.trim();
  if (!text) {
    if (status === "clear") {
      throw new Error(`${kind} clear requires --finding evidence`);
    }
    return `${kind} review recorded risk without detailed evidence`;
  }
  return text;
}

function firstUsefulLine(text: string): string {
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean)?.slice(0, 240) ?? "no diagnostic output";
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

function syncQaWorkflowEvidence(projectRoot: string, lastReport: QAReportRecord): void {
  const prs = listPullRequests(projectRoot);
  const reports = prs.map((pr) => readQaReport(projectRoot, pr.prNumber));
  const approvedPrs = reports.filter((report) => report.status === "approved").map((report) => report.prNumber);
  const changesRequestedPrs = reports.filter((report) => report.status === "changes-requested").map((report) => report.prNumber);
  const pendingPrs = reports
    .filter((report) => report.status !== "approved" && report.status !== "changes-requested")
    .map((report) => report.prNumber);
  const status = prs.length > 0 && approvedPrs.length === prs.length
    ? "approved"
    : changesRequestedPrs.length > 0
      ? "changes-requested"
      : "blocked";
  updateWorkflowEvidence(projectRoot, (evidence) => ({
    ...evidence,
    qa: {
      status,
      approvedPrs,
      pendingPrs,
      changesRequestedPrs,
      lastReportPath: lastReport.reportPath,
      updatedAt: nowIso()
    }
  }));
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
    `- security_status: ${report.securityStatus}`,
    `- accessibility_status: ${report.accessibilityStatus}`,
    `- user_merge_decision_required: ${report.userMergeDecisionRequired}`,
    "",
    "## Findings",
    ...(report.findings.length > 0 ? report.findings.map((finding) => `- ${finding}`) : ["- No findings recorded yet"])
  ].join("\n");
}

function mergeFindings(existing: string[], next: string[]): string[] {
  return [...new Set([...existing, ...next])];
}

function syncReviewFindings(
  findings: string[],
  review: Pick<QAReportRecord, "securityStatus" | "accessibilityStatus">
): string[] {
  const hadSecurityStaticCheck = findings.includes(SECURITY_STATIC_CHECK_FINDING);
  const hadAccessibilityStaticCheck = findings.includes(ACCESSIBILITY_STATIC_CHECK_FINDING);
  const next = findings.filter(
    (finding) => finding !== SECURITY_UNKNOWN_FINDING
      && finding !== ACCESSIBILITY_UNKNOWN_FINDING
      && finding !== SECURITY_UNKNOWN_BLOCKER
      && finding !== ACCESSIBILITY_UNKNOWN_BLOCKER
      && finding !== SECURITY_STATIC_CHECK_FINDING
      && finding !== ACCESSIBILITY_STATIC_CHECK_FINDING
  );
  if (review.securityStatus === "unknown") {
    if (hadSecurityStaticCheck) {
      next.push(SECURITY_STATIC_CHECK_FINDING);
    }
    next.push(SECURITY_UNKNOWN_FINDING, SECURITY_UNKNOWN_BLOCKER);
  }
  if (review.accessibilityStatus === "unknown") {
    if (hadAccessibilityStaticCheck) {
      next.push(ACCESSIBILITY_STATIC_CHECK_FINDING);
    }
    next.push(ACCESSIBILITY_UNKNOWN_FINDING, ACCESSIBILITY_UNKNOWN_BLOCKER);
  }
  return [...new Set(next)];
}

function hasConflictMarkers(output: string): boolean {
  return output.split(/\r?\n/).some((line) => /^(UU|AA|DD|AU|UA|DU|UD)/.test(line.trim()));
}
