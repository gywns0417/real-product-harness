# Phase 6 Notion Plan

## Implemented Skeleton

- `rph notion plan`
- `rph notion setup`
- `rph notion sync`
- `rph notion export-docs`

## Workspace Shape

The plan includes the required top-level sections:

- Dashboard
- PM
- PD
- FE
- BE
- QA
- GitHub
- Versions
- Decisions
- Approvals

The plan includes 14 databases:

- Documents
- Versions
- Interviews
- Decisions
- Approvals
- Screens
- Features
- Design Components
- Sprints
- Issues
- PRs
- QA Reports
- Deployments
- Integrations

## MCP/API Policy

The generated plan uses Notion hosted MCP at `https://mcp.notion.com/mcp`, records the Notion API version as `2026-03-11`, and lists the MCP tools needed for page, database, view, and update work.

No Notion page, database, view, or property is created until credentials and explicit user approval are present. Without credentials, the harness writes a local dry-run plan and sync payload under `.rph/notion/`.
