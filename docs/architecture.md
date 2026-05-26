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

`rph` is the control-plane entrypoint. Running it without arguments opens a long-lived runtime shell where normal text chats with the connected AI agent and slash commands such as `/pm start`, `/pd references`, `/fe spec`, and `/qa review --pr 1` control workflow state. Connected chat proposals can execute read-only commands and the current autonomous local workflow step directly, so the agent can move the harness without forcing every safe action back through manual slash input. A narrow set of command-like natural inputs is treated as deterministic control aliases: `시작해` maps to `/pm start`, `제품 정의 시작해줘` starts the PM product-definition path, `현재 상태 보여줘` maps to `/status`, `세션 타임라인` maps to `/agent replay`, `계속 진행해` and `이어서 진행해` map to `/agent run --steps 6` or `/agent recover`, `승인해` resolves the single pending approval target, and `거절해` resolves the single pending external action rejection. These aliases run only after CLI preflight; questions, negated text, multiple pending targets, user-approval model proposals, unsupported local proposals, and external live writes stay blocked until the explicit command or approval path is used.

The design mirrors a Hermes-style separation:

- Runtime/control plane: keeps the active project, prompt, session, and command envelope.
- Execution lanes: PM, PD, FE, BE, QA, GitHub, Notion, and Docs handlers execute bounded workflow actions.
- Records: product state remains in `.rph/`; runtime command history is appended under `.rph/runtime/`, and `/agent replay` renders journal-backed session history as a user-facing timeline before showing raw snapshot tail data.
- Chat: runtime conversation turns are appended under `.rph/ai/chat/` so the agent feels like a top-level conversational layer, not a command-only CLI.
- AI run records: provider/model metadata and prompt/output previews are stored under `.rph/ai/runs/`; secrets stay in `.env`.
- Settings: non-secret provider state lives in `.rph/config.json`; secrets stay in `.env`.
- Resident workers: `/agent pool run` is the handoff-only supervisor loop, `/agent pool start` starts it as a detached background process, and `/agent pool service install` writes a per-project macOS LaunchAgent that runs `agent pool run` directly under launchd ownership. The service uses the existing `.rph/runtime/worker-pool.json` health contract rather than a second scheduler.
- Handoff contract: every command either advances state, writes an artifact, reports a blocker, or recommends the next slash command.

Automation can still call the same surface one-shot with `rph /pm start`; the old positional form is kept internally for compatibility but is no longer the primary UX.
Exact bare natural controls such as `rph continue`, `rph approve`, and `rph reject` are routed through the same `ask --execute` preflight instead of falling through to unknown-command handling.

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

1. `/setup auto` is the Hermes-style boot wizard: it asks for the desired AI agent and connectors, accepts missing env values, writes explicitly provided project-scoped secrets only to `.env`, refreshes `.rph/config.json` and `.mcp/config.json`, and immediately probes the selected connections. GitHub can store `GITHUB_TOKEN_SOURCE=gh-cli` and use an existing `gh auth` session without copying the `gh` token into project `.env`. Connector status labels distinguish protocol MCP servers from REST adapters.
2. `/ai status` and `/mcp status` show configured, missing, enabled, and disabled connections without printing secrets.
3. `/ai test [provider]` and `/mcp test [server]` run read-only live probes and write `.rph/connections/latest.json`.
4. `/ai run --prompt <text>` sends an ad-hoc generation request through the active provider and writes an AI run record.
5. Plain runtime input builds a chat prompt from recent conversation plus project state, calls the active AI provider, records the turn under `.rph/ai/chat/`, and executes safe command proposals only when they are read-only or exactly match the control plane's current autonomous local step.
6. `/pm draft <docId> --ai`, `/pd <artifact> --ai`, `/fe spec --ai`, and `/be spec --ai` bind the selected AI provider to role-specific artifact generation.
7. `/agent status` shows the active conversational provider, latest provider outcome/fallback summary, session recovery brief, and runtime handoff summary; `/agent session [id]` reads the append-only per-session snapshot journal at `.rph/runtime/sessions/<session-id>.jsonl`; `/agent replay [id]` reconstructs the latest runtime session from that journal; `/agent recover [--steps N]` turns the recovery brief into a bounded safe local recovery loop without crossing approval or external-write gates; `/agent handoffs`, `/agent lanes`, `/agent claim <id>`, `/agent heartbeat <id>`, `/agent dead-letter <id>`, `/agent ack <id>`, `/agent complete <id>`, and `/agent run --steps <n>` expose or consume the role handoff mailbox stored at `.rph/runtime/handoffs.json`; `/agent clear` resets the in-memory conversation context. The runtime still writes `.rph/runtime/current-session.json` as the fast current head, but also writes `.rph/runtime/sessions/<session-id>.latest.json` and can recover from the latest per-session snapshot or last valid journal record if the head is unreadable.
8. `/settings set <key> <value>` stores custom runtime preferences such as `ui.theme`, `ui.color`, and deployment notes.
9. `/setup auto --guide` keeps the read-only status guide for scripts and fresh directories; it does not initialize `.rph`. `/setup auto --from-env --live` performs non-echo fresh-project credential verification from the current shell environment and `/doctor --live` combines runtime config checks with AI and MCP live probes. Live setup, doctor, AI, and MCP checks share the same `trust=<category>:<stage>` label and recovery-hint contract. REST adapters use `adapter-ready`; GitHub upgrades to `adapter-write-ready` only after REST target read plus `gh` repo write permission pass, and reports `adapter-partial` when the REST target is valid but the external write channel fails. AI/MCP protocol paths that pass credential/handshake but fail the final generation or tools step use `protocol-partial`. Custom protocol MCP servers can declare a read-only `--probe-tool`/`--probe-args-json` pair during `/setup mcp add`; those opt-in servers must prove `protocol-tool-call`, not only `protocol-tools-list`. `/setup mcp add --allow-tool tool.name,other.read` persists the agent read-only allowlist into the authoritative `.rph/config.json` `mcpPolicyRegistry` and projects the non-secret policy snapshot into `.mcp/config.json`.

AI provider probes use read-only model-list endpoints for OpenAI, Anthropic, Gemini, and local model servers. MCP probes separate REST adapters from protocol MCP servers: Notion, GitHub, and Figma validate target-resource credentials through REST, while protocol MCP servers use the Streamable HTTP lifecycle (`initialize`, `notifications/initialized`, `tools/list`). Stitch is the bundled protocol MCP server. The runtime tool fabric treats `readOnly=true` as intent only; `mcp.tools.call` also requires the target tool to be present in the server's `mcpPolicyRegistry` allowlist and to be explicitly verified by current `tools/list` metadata with `annotations.readOnlyHint=true`. Missing or ambiguous metadata fails closed, even for operator `/mcp call --read-only`. CLI `/mcp tools <server>` is an operator discovery surface that shows the full current protocol inventory; `/mcp tools <server> --agent` shows the filtered allowlisted agent surface. `.mcp/config.json`, `.rph/connections/latest.json`, and the proof ledger are projection/evidence surfaces; they never widen runtime MCP authority.

The runtime shell can execute `/setup auto --ai <provider> --mcp <selection> --live` from an
uninitialized folder. The wizard prompts for credential values, writes explicitly provided project-scoped secrets only to `.env`, stores
non-secret provider metadata in `.rph/config.json`, and returns to the same conversational shell after
connection verification. Runtime chat reads `.env` through an in-memory harness config snapshot; it
does not rewrite `.rph/config.json` or `.mcp/config.json` simply because shell environment values are
available. Request-time AI generation uses automatic failover across configured providers only when
the provider is not explicitly selected. Explicit provider requests remain strict. Successful failover
is observable: `AiGenerationResult`, AI run records, chat turn records, and active agent turn state
carry the provider attempt chain and failure reason. The runtime prints a compact fallback notice, and
`/ai status`, `/agent status`, and the read-only `provider.status` tool expose the latest provider
outcome for post-turn diagnosis.
Failed live setup checks render recovery hints from the same readiness data used for
`.rph/connections/latest.json`, so missing env, credential-probe failure, generation smoke failure,
and MCP protocol readiness failures point to a concrete next action and retry command.

Approval commands are outside the AI auto-execution surface. Even with `ask --execute`, proposals for
`/pm approve ...`, `/docs approve ...`, or `/pd approve ...` are blocked and recorded as a runtime
blocker so approval gates cannot be crossed by model output alone.
User-authored natural approval is a separate deterministic alias: it is accepted only for a single
pending target already visible in local runtime state. External writes remain two-step actions:
the proposal creates `.rph/runtime/action-approvals.json`, and only `/agent approve-action <id>` or
the single-target `승인해` alias can execute it. Approval mutation uses the same fail-closed
file-lock pattern as handoffs, recovers stale lockfiles, and transitions `pending -> running` in one
step so the approved action cannot be started twice. Execution is session-bound: an action can run
only from the runtime session that owns the pending external-write wait condition. Completion still
requires readback proof bound to the action id, fingerprint, and running timestamp.
GitHub issue and PR writes follow the same contract through explicit `--live` flags: bare
`/github create-issue` and `/github create-pr` stay local, while the live variants freeze the
approved owner/repo target and require `gh issue view` or `gh pr view` proof before completion.
Notion live setup and sync also freeze their approved parent/workspace target and fail before
external execution if the current target drifts after approval.

Runtime handoffs carry PM/PD/FE/BE/QA role contracts, not just role names. Each contract records purpose, allowed command prefixes, required context, success criteria, and a handoff checklist. Handoff execution is split into a control-plane loop and child CLI lane workers. The control plane claims mailbox work up to the configured concurrency, enforces active lease blocking, launches `/agent worker run <handoff-id>` subprocesses, reconciles concurrent handoff writes, and merges successful lane results. The worker owns the command execution attempt, heartbeat, lane run record, failure retry, and dead-letter transition. Each claim rotates a `workerSessionId` and `claimToken`; start, heartbeat, failure, completion, and lane merge must match the current worker session, attempt, claim token, and lane run id. A stale worker from an expired lease can still finish its local process, but it cannot mutate the current handoff or become accepted merge proof. Each lane has a local tool budget; AI lane turns and local command execution decrement it, and exhausted lanes fail before running the command. This keeps runtime continuation testable separately from shell parsing and command execution while preserving approval gates.

Imported TOML agent profiles are stored in the project-local `.rph/agents` catalog and can guide runtime chat/handoff behavior, so the runtime keeps the same approval, memory, and budget semantics even when the specialist prompt comes from an imported profile instead of a built-in role. The active profile is no longer only prompt text: agent turn state and lane run records persist an `executionProfile` snapshot with the TOML profile name, slug, model, reasoning effort, sandbox mode, and activation time, and `/agent lanes` renders that profile next to the lane execution record.

Lane fan-in is promoted from telemetry into workflow evidence and first-class mailbox work. Starting
an agent lane marks `ProjectState.evidence.agentIntegration.required=true`; `integrateAgentLaneBatch`
records the merged run ids, failed run ids, artifacts, and proof id. Detached fan-out branches such
as `FE_SPEC` and `BE_SPEC` can run in parallel without mutating the global `currentStage`; the
control plane restores the parent stage after each branch worker while preserving generated
documents, evidence, lane runs, and handoff completion. Reconciliation marks a fan-in queue node
ready only when every prerequisite has accepted, completed, merged lane proof and the required
engineering artifacts are approved. At that point the runtime materializes a synthetic Orchestrator
handoff with `resumeCursor=fan-in:<stage>`, `/agent reduce <stage>`, and a materialization key over
the source lane-run set. Stale reducer handoffs from an older source-lane epoch are ignored and a
fresh reducer is materialized when branch retry changes the source proof set. Completed lane proof
is accepted only when the lane run's handoff id, session, stage, attempt, worker session, claim token,
and lane id still match the current handoff record. The reducer is the
workflow transition point into the fan-in stage. This keeps proof-ledger history append-only while
`ProjectState` remains the owner of final workflow gates.

## Notion Live Mode

Notion stays dry-run unless a live flag is present. `/notion setup --live` validates `NOTION_TOKEN` and `NOTION_PARENT_PAGE_ID`, creates a dashboard page under the parent, creates the planned tracking databases, and writes `.rph/notion/live-workspace.json`. `/notion sync --live` reads that workspace record and appends a sync summary page while keeping the full local payload in `.rph/notion/sync-payload.json`.
