# Architecture

## Shape

The repo is a TypeScript workspace with one CLI app and focused packages:

- `apps/cli`: command routing, wizard UX, terminal output.
- `packages/core`: workflow state, document/design versions, approvals, PM/PD/FE/BE flow helpers, local issue/PR/deploy records, GitHub dry-run helpers.
- `packages/integrations`: Notion, MCP, and future external adapters.
- `packages/templates`: reusable document and GitHub templates.
- `packages/qa`: QA report skeleton.
- `packages/config`: environment validation.

## State

Project state lives under `.rph/` in the target product folder:

- `.rph/project.json`
- `.rph/state.json`
- `.rph/documents/<docId>/<version>.md`
- `.rph/documents/<docId>/index.json`
- `.rph/approvals/approvals.json`
- `.rph/approvals/design-approvals.json`
- `.rph/interviews/<docId>/session-001.json`
- `.rph/design/<artifactId>/<version>.md`
- `.rph/issues/index.json`
- `.rph/issues/issue-<number>.json`
- `.rph/prs/index.json`
- `.rph/prs/issue-<number>.json`
- `.rph/prs/pr-<number>.json`
- `.rph/qa/pr-<number>-report.md`
- `.rph/releases/<release-or-hotfix-id>.md`
- `.rph/deployments/dev-deployment-plan.md`
- `.rph/notion/workspace-plan.md`
- `.rph/notion/sync-payload.json`
- `.rph/github/labels.json`

Secrets stay outside `.rph`.

## Gates

Workflow stages define owner agent, prerequisites, required documents, required approvals, required design artifacts, allowed commands, next stages, and rollback targets. Large stage movement is blocked if required approvals are missing.

Current high-level order:

1. PM documents approved
2. PD artifacts approved
3. FE technical spec approved
4. BE technical spec and API contract approved
5. FE/BE sprint plans approved
6. Implementation issue/branch/PR skeleton
7. QA review, conflict, test, and report records
8. Release/hotfix plans with user merge approval gate

## External Services

GitHub, Notion, Figma, Stitch, MCP, and cloud deploy integrations are adapters. They write local config/templates or print dry-run commands unless credentials and user approval are available. Cloud deploy hooks create a local plan first; no external deploy runs without approval.

Notion integration uses the hosted MCP URL in generated config and writes a local workspace plan first. The plan covers PM/PD/FE/BE/QA/GitHub/Versions/Decision/Approval sections, 14 database schemas, and MCP tool names needed for database and view creation.
