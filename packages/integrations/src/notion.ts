export interface NotionDatabasePlan {
  name: string;
  purpose: string;
  properties: string[];
}

export const NOTION_HOSTED_MCP_URL = "https://mcp.notion.com/mcp";

export const NOTION_API_VERSION = "2026-03-11";

export const NOTION_PROJECT_SECTIONS = [
  "Dashboard",
  "PM",
  "PD",
  "FE",
  "BE",
  "QA",
  "GitHub",
  "Versions",
  "Decisions",
  "Approvals"
];

export function notionDatabasePlan(): NotionDatabasePlan[] {
  return [
    {
      name: "Documents",
      purpose: "Track current document status, versions, approvals, and related work.",
      properties: ["Name", "Doc ID", "Type", "Role", "Status", "Current Version", "Approved", "Approved By", "Approved At", "Related Versions", "Related Issues", "Related PRs", "Last Updated"]
    },
    {
      name: "Versions",
      purpose: "Track immutable document versions and rollback targets.",
      properties: ["Name", "Document", "Version", "Status", "Change Summary", "Diff", "Created By", "Created At", "Approved By", "Approved At", "Rollback Available"]
    },
    {
      name: "Interviews",
      purpose: "Track PM interview sessions and summaries.",
      properties: ["Name", "Doc ID", "Status", "Stage", "Question Count", "Summary", "Created At", "Updated At"]
    },
    {
      name: "Decisions",
      purpose: "Track user and product decisions.",
      properties: ["Name", "Area", "Decision", "Rationale", "Owner", "Status", "Decided At"]
    },
    {
      name: "Approvals",
      purpose: "Track document, design, sprint, release, and merge approvals.",
      properties: ["Name", "Target Type", "Target ID", "Version", "Approved", "Approved By", "Approved At", "Summary"]
    },
    {
      name: "Screens",
      purpose: "Track screen definitions and page design handoff.",
      properties: ["Name", "Screen ID", "Purpose", "State Coverage", "Related Features", "Related APIs", "Status"]
    },
    {
      name: "Features",
      purpose: "Track feature definitions and implementation status.",
      properties: ["Name", "Feature ID", "Priority", "Difficulty", "Related Screens", "Related APIs", "Acceptance Criteria", "Status"]
    },
    {
      name: "Design Components",
      purpose: "Track design-system tokens, components, and states.",
      properties: ["Name", "Component Type", "Status", "Responsive", "Accessibility", "Related Pages"]
    },
    {
      name: "Sprints",
      purpose: "Track FE/BE sprint plans and approval gates.",
      properties: ["Name", "Sprint ID", "Goal", "Issues", "Prerequisites", "Done Criteria", "Risks", "Dependencies", "User Confirm Required"]
    },
    {
      name: "Issues",
      purpose: "Mirror GitHub issue planning data.",
      properties: ["GitHub Issue Number", "Label", "Title", "Status", "Sprint", "Branch", "Assignee Agent", "Related Feature", "Related Screen", "Related PR", "Acceptance Criteria"]
    },
    {
      name: "PRs",
      purpose: "Mirror PR status, QA status, conflicts, and user merge decision.",
      properties: ["PR Number", "Source Branch", "Target Branch", "Status", "QA Status", "Conflict Status", "Test Status", "User Approval", "Merge Decision"]
    },
    {
      name: "QA Reports",
      purpose: "Track QA review findings and status.",
      properties: ["Name", "PR Number", "Status", "Conflict Status", "Test Status", "Security Status", "Accessibility Status", "Findings"]
    },
    {
      name: "Deployments",
      purpose: "Track deployment plans, environments, and approval state.",
      properties: ["Name", "Environment", "Provider", "Status", "Approval Required", "Fallback", "Deployed At"]
    },
    {
      name: "Integrations",
      purpose: "Track external service and MCP configuration state.",
      properties: ["Name", "Provider", "Type", "Status", "Required Env", "Approval Required", "Notes"]
    }
  ];
}

export function notionMcpToolPlan(): string[] {
  return [
    "notion-create-page",
    "notion-create-database",
    "notion-create-view",
    "notion-update-page",
    "notion-update-data-source"
  ];
}

export function renderNotionPlan(): string {
  return [
    `Hosted MCP: ${NOTION_HOSTED_MCP_URL}`,
    `API version: ${NOTION_API_VERSION}`,
    `Sections: ${NOTION_PROJECT_SECTIONS.join(", ")}`,
    `MCP tools: ${notionMcpToolPlan().join(", ")}`,
    "",
    ...notionDatabasePlan().map((db) => `- ${db.name}: ${db.purpose} Properties: ${db.properties.join(", ")}`)
  ].join("\n");
}
