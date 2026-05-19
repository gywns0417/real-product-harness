export interface QAReport {
  prNumber: number | null;
  status: "approved" | "changes-requested" | "blocked";
  conflictStatus: "unknown" | "clean" | "conflict";
  testStatus: "not-run" | "passed" | "failed";
  findings: string[];
  userMergeDecisionRequired: true;
}

export function createQAReportSkeleton(prNumber: number | null = null): QAReport {
  return {
    prNumber,
    status: "blocked",
    conflictStatus: "unknown",
    testStatus: "not-run",
    findings: ["QA Agent skeleton: run lint, test, build, conflict check, and requirement comparison before approval."],
    userMergeDecisionRequired: true
  };
}
