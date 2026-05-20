# Architecture

## Shape

The repo is a TypeScript workspace with a top-level product runtime and focused packages:

- `apps/cli`: runtime shell, slash-command routing, wizard UX, terminal output.
- `packages/core`: workflow state, document/design versions, approvals, PM/PD/FE/BE flow helpers, local issue/PR/deploy records, GitHub dry-run helpers.
- `packages/integrations`: Notion, MCP, and future external adapters.
- `packages/templates`: reusable document and GitHub templates.
- `packages/qa`: QA report skeleton.
- `packages/config`: environment validation.

## Runtime Layer

`rph` is the control-plane entrypoint. Running it without arguments opens a long-lived runtime shell where normal text chats with the connected AI agent and slash commands such as `/pm start`, `/pd references`, `/fe spec`, and `/qa review --pr 1` control workflow state.

The design mirrors a Hermes-style separation:

- Runtime/control plane: keeps the active project, prompt, session, and command envelope.
- Execution lanes: PM, PD, FE, BE, QA, GitHub, Notion, and Docs handlers execute bounded workflow actions.
- Records: product state remains in `.rph/`; runtime command history is appended under `.rph/runtime/`.
- Chat: runtime conversation turns are appended under `.rph/ai/chat/` so the agent feels like a top-level conversational layer, not a command-only CLI.
- AI run records: provider/model metadata and prompt/output previews are stored under `.rph/ai/runs/`; secrets stay in `.env`.
- Settings: non-secret provider state lives in `.rph/config.json`; secrets stay in `.env`.
- Handoff contract: every command either advances state, writes an artifact, reports a blocker, or recommends the next slash command.

Automation can still call the same surface one-shot with `rph /pm start`; the old positional form is kept internally for compatibility but is no longer the primary UX.

## State

Project state lives under `.rph/` in the target product folder:

- `.rph/project.json`
- `.rph/config.json`
- `.rph/state.json`
- `.rph/ai/chat/<sessionId>.jsonl`
- `.rph/ai/runs/<runId>.json`
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
- `.rph/runtime/session-<timestamp>.jsonl`

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

## Setup And Connection Commands

The runtime setup layer mirrors a Hermes-style boot sequence:

1. `/setup auto` reads `.env`, detects AI providers and MCP servers, writes `.rph/config.json`, and refreshes `.mcp/config.json`.
2. `/ai status` and `/mcp status` show configured, missing, enabled, and disabled connections without printing secrets.
3. `/ai test [provider]` and `/mcp test [server]` run read-only live probes and write `.rph/connections/latest.json`.
4. `/ai run --prompt <text>` sends an ad-hoc generation request through the active provider and writes an AI run record.
5. Plain runtime input builds a chat prompt from recent conversation plus project state, calls the active AI provider, and records the turn under `.rph/ai/chat/`.
6. `/pm draft <docId> --ai`, `/pd <artifact> --ai`, `/fe spec --ai`, and `/be spec --ai` bind the selected AI provider to role-specific artifact generation.
7. `/agent status` shows the active conversational provider; `/agent clear` resets the in-memory conversation context.
8. `/settings set <key> <value>` stores custom runtime preferences such as `ui.theme`, `ui.color`, and deployment notes.
9. `/doctor --live` combines runtime config checks with AI and MCP live probes.

AI provider probes use read-only model-list endpoints for OpenAI, Anthropic, Gemini, and local model servers. MCP probes validate the underlying service credentials for Notion, GitHub, Figma, and Stitch where a stable probe exists.

## Notion Live Mode

Notion stays dry-run unless a live flag is present. `/notion setup --live` validates `NOTION_TOKEN` and `NOTION_PARENT_PAGE_ID`, creates a dashboard page under the parent, creates the planned tracking databases, and writes `.rph/notion/live-workspace.json`. `/notion sync --live` reads that workspace record and appends a sync summary page while keeping the full local payload in `.rph/notion/sync-payload.json`.
