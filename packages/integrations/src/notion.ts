export interface NotionDatabasePlan {
  name: string;
  purpose: string;
  properties: string[];
}

export function notionDatabasePlan(): NotionDatabasePlan[] {
  return [
    {
      name: "Documents",
      purpose: "Track current document status, versions, approvals, and related work.",
      properties: ["Name", "Doc ID", "Type", "Role", "Status", "Current Version", "Approved", "Approved By", "Approved At"]
    },
    {
      name: "Versions",
      purpose: "Track immutable document versions and rollback targets.",
      properties: ["Name", "Document", "Version", "Status", "Change Summary", "Diff", "Created By", "Created At"]
    },
    {
      name: "Issues",
      purpose: "Mirror GitHub issue planning data.",
      properties: ["GitHub Issue Number", "Label", "Title", "Status", "Sprint", "Branch", "Assignee Agent"]
    },
    {
      name: "PRs",
      purpose: "Mirror PR status, QA status, conflicts, and user merge decision.",
      properties: ["PR Number", "Source Branch", "Target Branch", "Status", "QA Status", "Conflict Status", "User Approval"]
    }
  ];
}

export function renderNotionPlan(): string {
  return notionDatabasePlan()
    .map((db) => `- ${db.name}: ${db.purpose} Properties: ${db.properties.join(", ")}`)
    .join("\n");
}
