# real-product-harness

AI agent workflow CLI for real product delivery: PM interview, versioned documents, approval gates, GitHub setup, and local sync targets.

## Install

One-command install:

```bash
curl -fsSL https://raw.githubusercontent.com/gywns0417/real-product-harness/main/install.sh | bash
```

This installs the CLI into `~/.real-product-harness`, creates `~/.local/bin/rph`, and writes a
guarded shell-profile block that sources `~/.config/rph/init.sh` with slash helpers enabled.
If `rph` is not found after install, add `~/.local/bin` to your shell `PATH`.

```bash
export PATH="$HOME/.local/bin:$PATH"
```

The installer also writes `~/.config/rph/init.sh`. Set `RPH_AUTO_SHELL_INTEGRATION=0` before
running the installer if you want to skip shell-profile edits and source the file yourself.

Private GitHub fallback, if the repository is made private again:

```bash
gh api -H "Accept: application/vnd.github.raw" repos/gywns0417/real-product-harness/contents/install.sh | bash
```

This requires `gh auth login` and repository access.

Manual local install:

```bash
pnpm install
pnpm build
```

## Run

Start the product runtime from a product project folder:

```bash
rph
rph start
```

Inside the runtime, type normal messages to chat with the connected AI agent. Use slash commands for control-plane actions, similar to Codex or Claude Code commands:

```text
/init --yes --project-name "My Product"
/setup auto
/setup auto --live
/setup auto --guide
/setup auto --from-env --live --ai openai,anthropic,gemini --mcp all
/doctor
/status
/workspace
/ai status
/mcp status
What should I do next for this product?
Turn the current idea into a sharper MVP direction.
/ai run --prompt "Summarize this product idea in three bullets."
/pm start
/pm interview
/pm draft product-definition --ai
/pm revise product-definition --from v1.0.0
/pm approve product-definition
/pm diff product-definition v1.0.0 v1.0.1
/docs approve requirements
/pm finalize
/pd start
/pd references --ai
/pd approve references
/pd landing-preview --ai
/pd export obsidian all --path "/path/to/Obsidian/Project"
/fe spec --ai
/fe approve spec
/be spec --ai
/be api-contract --ai
/be approve spec
/be approve api-contract
/fe sprint-plan
/be sprint-plan
/fe issue-create --title "Build dashboard shell"
/fe work --issue 1
/fe pr --issue 1
/qa review --pr 1
/qa conflicts --pr 1
/qa test --pr 1
/qa security --pr 1 --auto
/qa security --pr 1 --status clear --finding "manual threat review completed"
/qa accessibility --pr 1 --auto
/qa accessibility --pr 1 --status clear --finding "keyboard and screen-reader pass completed"
/qa report --pr 1
/be deploy-dev --provider local
/github release-plan --version v0.1.0
/notion plan
/notion setup --live --title "RPH Workspace"
/notion sync
/notion sync --live
/docs list
/docs export obsidian all --path "/path/to/Obsidian/Project"
/docs export notion
/github create-repo
/github setup-labels
/github create-issue --agent FE --title "Build dashboard shell" --live
/github create-pr --issue 1 --live
/github setup-templates
/github setup-branches
```

In a fresh non-interactive folder, `rph start` shows the same runtime opener plus a short recovery card:
connect AI with `rph setup auto --live`, retry from `.env` with `rph setup auto --from-env --live`,
or open `rph help setup`. In an interactive terminal, plain `rph start` launches the setup wizard
directly, writes the fresh project state, and hands off to the connected chat/runtime after successful
verification. Setup flags such as `--from-env --live --ai openai --mcp none` keep the same setup-first
path for automation.

Plain text is chat. Command-like natural phrases such as `계속 진행해`, `현재 상태 보여줘`, `승인해`,
or `continue` are sent to the connected AI agent instead of being silently promoted into local workflow
execution. To control the harness, type the slash/control command explicitly: `/status`,
`/agent run --steps 6`, `/agent recover`, `/agent approve-action <id>`, `/pm start`, or their
`rph ...` one-shot forms.

Connected AI chat can suggest the exact control to run next, but plain chat does not execute workflow
commands by itself. Suggested controls are saved as durable runtime intents in
`.rph/runtime/intents.json`, so they survive shell exits and can be inspected or cleared later.
Use `/agent intents` to review them, `/agent confirm-intent <intent-id>` to run the suggested control,
or `/agent dismiss-intent <intent-id>` to discard it. External live writes still become explicit
action approvals after confirmation; user-approval commands still require the normal approval path.

For one-shot operation, use natural language or a slash command from the shell:

```bash
rph start
rph hello
rph "다음에 뭐 하면 돼?"
rph "이 아이디어를 MVP spec과 FE/BE 작업으로 만들어줘: AI 회의록을 액션아이템과 담당자 추적으로 바꾸는 SaaS"
rph ask "이 아이디어를 MVP spec과 FE/BE 작업으로 만들어줘: AI 회의록을 액션아이템과 담당자 추적으로 바꾸는 SaaS"
rph ask --execute "이 아이디어를 MVP spec과 FE/BE 작업으로 만들어줘: AI 회의록을 액션아이템과 담당자 추적으로 바꾸는 SaaS"
rph status --json
rph workspace --json
rph /agent run --steps 6
rph /agent recover
rph /agent intents
rph /agent confirm-intent <intent-id>
rph /agent dismiss-intent <intent-id>
rph /agent approve-action <action-id>
rph /agent reject-action <action-id>
rph productize "AI 회의록을 액션아이템과 담당자 추적으로 바꾸는 SaaS"
rph /productize "AI 회의록을 액션아이템과 담당자 추적으로 바꾸는 SaaS"
rph status
rph pm start
rph /pm start
```

`/productize` creates a review-ready golden path package: PM documents, PD design artifacts,
FE/BE/API specs, sprint plans, FE/BE issues, PR drafts, QA reports, a local deployment plan,
and a `.rph/golden-path/latest.md` summary. Merge, deployment, and credential-gated external
writes still require explicit user approval. If the current folder is not initialized yet,
`/productize` initializes the local `.rph` project first.
`rph pm start` also bootstraps an uninitialized folder and moves directly into the PM kickoff stage.
Plain `rph ask "..."`, bare multi-word input such as `rph "다음에 뭐 하면 돼?"`, and ordinary
single-token text such as `rph hello` are
conversational by default: they can propose the matching slash command but do not run mutating
workflow commands. Add `--execute` or run the proposed slash command when you want one-shot
execution. Approval and rejection require explicit controls such as `/agent approve-action <id>`,
`/agent reject-action <id>`, or the relevant document approval command; ordinary approval text stays
chat. Close command typos such as `statsu` still get command suggestions, but ordinary unknown
bare text goes to the connected AI agent instead of failing as a command error. `rph start` is the setup-first entrypoint: in a fresh folder it either opens the
setup wizard immediately (interactive) or prints the short setup handoff (non-interactive) without
creating `.rph`; in a configured project it drops into the runtime or routes the supplied message to
chat.

Runtime shell sessions are durably mirrored under `.rph/runtime/sessions/`. The current head remains
`.rph/runtime/current-session.json`, while each session also gets an append-only snapshot journal
`<session-id>.jsonl` plus a `<session-id>.latest.json` recovery snapshot. `/agent session [id]` shows
the journal tail plus intent events, and `/agent replay [id]` reconstructs the latest known runtime
session from that journal with user-facing timelines for starts, plans, checkpoints, executed
commands, blockers, errors, and AI-suggested slash/control intents. If the current head becomes
unreadable, the runtime falls back through the per-session snapshot and then the latest valid journal
record before giving up. Runtime intents keep `.rph/runtime/intents.json` as the fast head and
`.rph/runtime/intents.jsonl` as the append-only audit/recovery journal.

The active runtime graph is written to `.rph/runtime/execution-graph.json`. `/agent graph status`
shows the current runtime DAG with active, ready, blocked, fan-out, and fan-in nodes; `/agent graph
refresh` rematerializes the graph from the latest runtime session if the graph file is missing or
corrupt. When the graph belongs to the current session and is readable, runtime session hydration
uses its active node as the stage authority and keeps `stageQueue` as a compatibility projection.

## Shell Slash Helpers

For a Hermes-like top shell, the installer exposes the main control-plane domains as shell
functions that dispatch to `rph`: `/pm`, `/pd`, `/setup`, `/status`, `/workspace`, `/next`, `/qa`, `/fe`,
`/be`, `/ai`, `/mcp`, `/docs`, `/github`, `/notion`, `/agent`, `/productize`, `/doctor`, and
`/help`.

They are enabled by default when the installed init file is sourced. Enable them in the current
shell without reopening the terminal:

```bash
source "$HOME/.config/rph/init.sh"
```

If you skipped automatic profile integration, persist them for future `bash` or `zsh` sessions:

```bash
source "$HOME/.config/rph/init.sh"
```

Set `RPH_ENABLE_SLASH_COMMANDS=0` before sourcing the init file to keep only the `rph` binary.

Examples:

```bash
/setup auto --live
/pm start
/status
/workspace
/next
/ai status
/mcp status
/agent run --steps 5
/docs list
/github sync
/notion plan
/fe spec --ai
/be api-contract --ai
/qa review --pr 12
```

Exact limitations:

- These are shell functions, not CLI binaries. `rph` remains the primary command and still works unchanged.
- The default installer adds a guarded profile block that sources `~/.config/rph/init.sh`; skipped installs must source it manually.
- The installer uses functions instead of aliases because slash-prefixed aliases are not reliable across shells.
- They dispatch to one-shot CLI commands like `rph /pm ...`; they do not replace slash commands inside the interactive `rph` runtime.
- They are not supported in shells that do not parse these function names cleanly, including `sh`, `dash`, `fish`, PowerShell, and Nushell.
- They are not exported into unrelated non-interactive scripts unless that shell sources `init.sh`.
- Shell completion remains attached to `rph`; bash and zsh completion are loaded by `init.sh` where supported.

Plain chat now runs through an agent turn executor. The executor can ask read-only harness tools
for runtime context, workflow status, next workflow stage, advancement blockers, artifacts,
pending approvals, issues, PR drafts, and QA reports. It can chain bounded read-only tool calls,
including guarded protocol MCP `initialize`/`tools/list`/`tools/call` requests when `readOnly=true`
(Stitch is the current bundled protocol MCP server; its auth is declared as an `x-goog-api-key`
contract, while the protocol MCP fabric also supports `bearer` and `none` auth modes),
then answer, wait, propose a safe command, or propose a role handoff. Explicit slash commands and
safe productize routing remain deterministic so approval gates stay predictable. Role handoffs are
persisted under `.rph/runtime/handoffs.json` with the target role contract, allowed command surface,
artifact refs, acceptance criteria, blockers, and next command. `/agent run --steps <n>` now treats
that file as a mailbox: it claims ready handoffs up to the worker-pool concurrency, grants leases,
launches `/agent worker run <id>` in child CLI processes, records heartbeat/attempt/dead-letter
state, then merges worker results back through the control plane. Use
`/agent run --steps <n> --concurrency <n>` to set the batch width. Worker lane records live under
`.rph/runtime/lanes/`. Each claim mints a fresh worker session and claim token; start, heartbeat,
failure, completion, and merge all have to match the current claim token, attempt, worker session,
and lane run id, so stale workers from expired leases cannot complete newer attempts. When an AI provider
is configured, the child worker first runs an autonomous role-lane agent turn with the active role
prompt, acceptance criteria, artifact refs, and queued command; role-valid local command proposals
are executed, cross-lane proposals are rejected, and providerless lanes fall back to deterministic
queued commands with `--ai` stripped when a local fallback is available. Imported TOML agent
profiles are also recorded on agent turn and lane run evidence as execution profiles, including the
profile name, model, reasoning effort, and sandbox mode, so `/agent lanes` can show which active
specialist profile shaped the run. `/agent handoffs`,
`/agent actions`, `/agent lanes`, `/agent claim <id>`, `/agent heartbeat <id>`, `/agent dead-letter <id>`,
`/agent ack <id>`, and `/agent complete <id>` expose the lifecycle inside the runtime.
Each role lane also writes independent memory entries under `.rph/runtime/lanes/memory/<role>.jsonl`
and records a per-lane tool budget (`maxToolCalls`, `remainingToolCalls`, `maxOutputTokens`,
`externalWriteBudget=0`) plus `executionMode`, `autonomousTurnId`, `proposedCommand`, and
`executedCommand` in the lane run JSON. Tool calls are now enforced: local fallback commands,
AI lane turns, and autonomous command execution decrement the lane budget and a zero budget blocks
execution before a command can run.
For resident operation, `/agent pool start` launches the same handoff-only supervisor as a detached
background pool, writes `.rph/runtime/worker-pool.json` plus `.rph/runtime/worker-pool.log`, and
returns control to the terminal. `/agent pool status`, `/agent pool logs`, and `/agent pool stop`
are the operator surface for that background runtime; `/agent pool run` remains the foreground/debug
path. On macOS, `/agent pool service install` writes a per-project LaunchAgent that runs
`agent pool run` directly under launchd ownership, with `/agent pool service status`,
`/agent pool service uninstall`, and `/agent pool service plist` as the service surface. Pool-owned
work carries `poolId`, `slotId`, and `slotIndex` into the handoff and lane records, so `/agent workers`
and `/agent lanes` can connect daemon ownership back to the exact execution slot. Pool state also
stores a process-start fingerprint; mismatched or corrupt pool state is treated as unsafe instead of
silently acting like no daemon exists.
Runtime chat command proposals are durable controls, not hidden auto-runs: read-only proposals,
local workflow proposals, approval commands, and external live writes are stored as runtime intents
until the user confirms or dismisses them. Confirming an external live write creates the normal
action approval request instead of writing externally. User approval commands are never confirmed
by the agent; the user must type the approval slash command directly.

### Imported Role Profiles

RPH can import curated TOML agent profiles from Awesome Codex Subagents into the project-local
`.rph/agents` catalog and activate one as the current custom role profile. That keeps one top-level
conversation while swapping in specialist behavior such as documentation or product framing without
leaving the same handoff, memory, and tool-budget loop.

Active profiles are execution-active, not just prompt notes: their `model` and
`model_reasoning_effort` are passed into provider-backed runtime turns and autonomous worker lanes
when compatible with the selected provider, and `sandbox_mode=read-only` blocks automatic mutating
command execution while still allowing read-only inspection commands. RPH approval gates and
external-write readback requirements still win over imported profile instructions.

Examples:

```text
/agent roles
/agent pack
/agent pack --activate workflow-orchestrator
/agent discover documentation
/agent import documentation-engineer
/agent use documentation-engineer
/agent handoffs
/agent lanes
/agent pool start
/agent pool status
/agent pool logs
/agent pool service install
/agent pool service status
/agent run --steps 3
/agent claim <handoff-id>
rph "Use documentation-engineer to tighten the install section."
rph "Use product-manager to turn this idea into a PM draft."
```

`/agent pack` imports the recommended Hermes-operator set from Awesome Codex Subagents in one
shot: workflow orchestration, coordination, task distribution, product, CLI, MCP, test, security,
risk, and error-coordination profiles. It does not activate a profile unless you pass
`--activate <name>`, so existing runtime behavior stays stable until the operator chooses a role.

When the connected AI agent proposes an external live write such as `/notion setup --live`,
`/notion sync --live`, `/github create-repo`, `/github setup-labels`,
`/github create-issue --live`, or `/github create-pr --live`, RPH records a pending
external action under `.rph/runtime/action-approvals.json` and blocks with
`waitCondition.kind=external_live_write`. Execute it only through `/agent approve-action <id>`;
reject it with `/agent reject-action <id>`. Approval execution is session-bound and one-shot:
`pending -> running` happens as one locked transition, stale approval lockfiles are recovered, and
the action must still be the pending external-write gate for the current runtime session. Notion and
GitHub live actions freeze their approved target at proposal time, then fail before external
execution if the target drifts before approval. Completion still requires readback proof bound to
the action id, fingerprint, and running timestamp.
When an existing session has paused, blocked, pending external-action, or claimable handoff state,
runtime startup and `/agent status` print a deterministic `Session recovery brief` with the wait
condition, pending external action, claimable handoff count, resume cursor, and next safe command.
`/agent recover [--steps N]` consumes that brief as a bounded recovery loop: it runs only safe local
steps such as `/resume`, `/status`, or `/agent run --steps 1`, stops on repeated actions or failed
steps, and never crosses external-write or user-approval gates.
The top of `/status` now prints `Harness readiness` with a compact `ready`, `configured`,
`degraded`, `blocked`, or `needs-setup` state, plus chat/tool readiness and the next useful command.
Use `/workspace` for the operator read model: it combines runtime session, workflow gate, AI/MCP
readiness, pending live-write approvals, documents, design artifacts, issues, PRs, QA reports, proof
counts, blockers, and the next safe/manual action. `/workspace --json` and `/status --json` emit the
same stable `rph-operator-workspace-v0` payload for launchers, shell widgets, and higher-level agent
frontends.
After a connected agent uses an external read tool such as `mcp.tools.call`, `/status` and
`/agent status` also print `Latest agent tool proof` with the tool name, timestamp, and a short
non-secret result summary. This makes setup-to-chat MCP use visible without digging through
`.rph/runtime/current-session.json`.
The same latest live connection proof is promoted into the agent context prompt, including verified
target, first action, and available read tools. Plain chat therefore sees the MCP capability that
`/setup auto --live` actually proved instead of relying only on a static command list.
The runtime `stageQueue` now keeps its order and lifecycle as durable session state: completed
items stay completed across reloads, and `/next --execute` follows the persisted queue head before
falling back to the static workflow graph. Blockers, approval readiness, and display reasons are
still derived from `ProjectState` so document/design/evidence truth has one owner.
Ready queue branches owned by another role are also materialized into the handoff mailbox before
`/agent run` selects work. That lets a persisted fan-out such as `PD_APPROVED -> FE_SPEC + BE_SPEC`
dispatch both branches as worker lanes without manually seeding `.rph/runtime/handoffs.json`; the
mailbox dedupes by resume cursor and command so repeated scheduler passes do not create duplicates.
Detached fan-out workers do not advance the global `currentStage`; their generated documents and
evidence are merged while the control plane stays at the parent stage. Once every prerequisite lane
has completed with accepted, merged lane proof and the required engineering documents are approved,
the queue materializes a first-class Orchestrator reducer handoff with `resumeCursor=fan-in:<stage>`
and command `/agent reduce <stage>`. The reducer packet carries a materialization key over the
source lane-run set; stale reducer handoffs from older branch attempts are ignored and a fresh
reducer is materialized after branch retry. Handoff merge also verifies the lane run is bound to the
current handoff claim token and attempt before it can become accepted fan-in proof. That reducer is the only path that advances the global
workflow into the fan-in stage, so Hermes-like parallel worker output affects the final release gate
instead of only appearing in logs.

## Runtime Setup

The runtime reads secrets from `.env`, stores non-secret connection state in `.rph/config.json`,
and writes MCP client config to `.mcp/config.json`.

```text
/setup auto
/setup auto --live
/setup auto --guide
/setup auto --from-env --live --ai openai,anthropic,gemini --mcp all
/setup ai openai
/setup provider openai
/setup mcp notion
/setup mcp add custom-echo --url https://mcp.example.test/echo --auth bearer --auth-env CUSTOM_ECHO_MCP_TOKEN --probe-tool echo --probe-args-json '{"text":"ping"}' --live
/settings show
/settings set ui.theme hacker
/agent status
/agent graph status [--verbose]
/agent graph refresh
/agent handoffs
/agent actions
/agent lanes
/agent pool start
/agent pool status
/agent pool logs
/agent pool service install
/agent pool service status
/agent pool service uninstall
/agent pool stop --reason "operator requested stop"
/agent run --steps 5
/agent reduce <stage>
/agent worker run <handoff-id>
/agent heartbeat <handoff-id>
/agent dead-letter <handoff-id> --reason "stale or failed worker"
/agent ack <handoff-id>
/agent clear
/ai test openai
/ai run --provider openai --prompt "Draft the first product hypothesis."
/mcp test notion
/mcp tools
/mcp tools custom-echo
/mcp tools custom-echo --discover
/mcp tools custom-echo --agent
/mcp call custom-echo echo --read-only --args-json '{"text":"ping"}'
/doctor --live
/pm draft product-definition --ai
/pd references --ai
/fe spec --ai
/notion setup --live --title "RPH Workspace"
```

Configured credentials are never copied into `.rph/config.json`; only env key names,
configured/missing status, selected provider, and non-secret model/base URL metadata are stored.

`/setup auto` runs the interactive setup assistant. It asks which AI agent to connect, accepts missing API keys or local endpoints, writes explicitly provided project-scoped secrets to `.env`, detects GitHub repo metadata from `git`/`gh` when possible, enables selected connectors, refreshes `.rph/config.json` and `.mcp/config.json`, and runs connection probes without printing secret values. GitHub is the local exception: an existing `gh auth` session is stored only as `GITHUB_TOKEN_SOURCE=gh-cli`, and the token value is read ephemerally for live checks/writes instead of being copied into project `.env`. If a live check fails, `/setup repair --live` reads the latest connection report and retries only the failed AI/MCP targets; with `--from-env` it uses the current shell env, while an interactive TTY prompts only for replacement values. Connectors are labeled by transport contract: Stitch is a protocol MCP server, while Notion, GitHub, and Figma are REST adapters with credential/readback probes. GitHub readiness has an extra write-channel preflight because the live repo actions use `gh`: REST repo read alone is not enough to unlock `/github setup-labels`; `gh auth status --hostname github.com` and `gh repo view <owner>/<repo>` must prove write-capable `viewerPermission`. Custom protocol MCP servers must use `https://` except explicit localhost development URLs; they can opt into stronger live proof by declaring a read-only `--probe-tool` plus JSON args; then readiness must pass `initialize`, `tools/list`, and that allowlisted `tools/call` probe. Use `--allow-tool tool.name,other.read` to expose additional read-only protocol MCP tools to the connected agent. Agent and operator `tools/call` execution treats `--read-only` as intent only: the current `tools/list` metadata must also explicitly report `annotations.readOnlyHint=true`, so missing or ambiguous MCP metadata fails closed. Use `--guide` or `--non-interactive` for the read-only status guide; those modes are safe in a fresh directory and do not create `.rph`. Use `--live` to probe every configured connection, and `--from-env` for non-echo fresh-project verification from the current shell environment.
`/mcp status` prints the non-secret policy state for every connector. The runtime stores the
authoritative MCP policy in `.rph/config.json` as `mcpPolicyRegistry` and projects the same
non-secret snapshot into `.mcp/config.json`; `.mcp` and connection reports are observational outputs,
not authority for widening agent tool access. `/mcp tools <server>` lists the full protocol tool
inventory as an explicit operator action before choosing an allowlist. Use
`/mcp tools <server> --agent` to view only the filtered tools that the agent is allowed to call, and
`/mcp call <server> <tool> --read-only --args-json '{}'` to prove one operator-selected read-only
call. That call still requires both the local read-only allowlist and current `readOnlyHint=true`
metadata from the MCP server. Mutable, unclassified, or metadata-missing MCP tools stay behind explicit slash/approval policy and are not
exposed through the agent's read-only tool path.
The setup guide uses `configured` for env/config capture and reserves live trust labels such as
`protocol-ready` for `/setup auto --live`, `/doctor --live`, `/ai test`, and `/mcp test`.

Inside the interactive `rph` runtime, `/setup auto --ai openai --mcp none --live` can run from a
fresh workspace, prompt for a new API key, write only `.env` with explicit project-scoped secret values, update non-secret
connection metadata, and verify the selected provider before returning to chat. Runtime chat reads
`.env` through an in-memory config snapshot; ordinary chat/ask turns do not rewrite `.rph/config.json`
or `.mcp/config.json`. Automatic provider selection can fail over from the active configured provider
to the next configured provider on request-time failures. Explicit provider choices such as
`/ai run --provider openai` remain strict and fail closed instead of silently switching providers.
Interactive live setup can also repair bad or missing credentials in the same wizard: failed selected
AI/MCP checks print recovery hints, re-prompt the failed connection values with `Enter` preserving the
current value, rewrite `.env`, refresh config, and immediately re-run only the originally selected
checks. Non-interactive `--from-env` setup remains fail-fast for automation.
When failover happens, the runtime prints a compact `ai provider fallback: ...` notice and persists
the provider attempt chain in `.rph/ai/chat/*.jsonl`, `.rph/ai/runs/*.json`, and the active runtime
turn in `.rph/runtime/current-session.json`. `/ai status`, `/agent status`, and the read-only
`provider.status` agent tool surface the latest provider outcome so operators can see the selected
provider, attempt chain, and fallback summary after the fact.
Failed `/setup auto --live`, `/doctor --live`, `/ai test`, and `/mcp test` checks also print recovery
hints with the likely cause, next action, and exact retry command.
Every `.rph/connections/latest.json` report includes non-secret provenance (`source`, `runner`,
`command`, selected targets, and target count), so stale smoke/mock-like evidence can be separated
from the current live connection proof before trusting a provider matrix.
Put simply, a live target is one specific AI provider or MCP connector being checked; provenance is
the non-secret audit trail that says whether the proof came from `live`, `mock`, or `imported`
runs, which runner produced it, and which targets were covered.
Every live check also prints `Proof steps`, a human-readable stepper over transport,
credential-probe, and protocol-tool-call/tools-list status, so `trust=mode:stage` is backed by
visible evidence instead of a bare label.
Passed live checks also print `Verified targets`, a non-secret identity echo for the target that was
actually verified: AI provider/model, GitHub `owner/repo`, normalized Notion page UUID, normalized
Figma file id, or protocol MCP server id such as Stitch. The same identity is written as a sibling field in
`.rph/connections/latest.json` and mirrored on `/status`, `/ai status`, and `/mcp status` when a
latest connection report exists. Raw provider payloads, session ids, tokens, and tool-call results
are not copied into this identity block.
Passed live checks also print `First action verified`, the first concrete action that was actually
performed during setup: AI generation smoke, REST adapter target read, or protocol MCP `tools/list`.
This proof is also written to `.rph/connections/latest.json` as a non-secret sibling field and is
mirrored on `/status`, `/ai status`, and `/mcp status`.
Passed live checks print `Ready actions` before the next/recovery line, so setup no longer stops at
"connected": AI providers show a first chat command, Notion shows the first write/readback command,
GitHub shows `/github setup-labels` only after the `gh` write channel is verified, and protocol MCP
targets show the first tool-surface proof available to the runtime agent.

`ask --execute` can run local workflow command proposals, but AI-proposed user approval commands such
as `/pm approve ...`, `/docs approve ...`, and `/pd approve ...` are always blocked. Approval gates
must be crossed by a user-entered slash command, not by an AI command proposal.

For release gating, local checks and live credential checks are intentionally separate:

```bash
pnpm run release:check
pnpm run live:configured
pnpm run release:live
```

`release:check` runs lint, build, tests, productize smoke, Hermes e2e smoke, setup-live-chat smoke,
provider-onboarding smoke for OpenAI/Anthropic/Gemini/local, MCP-runtime smoke, Notion write/readback smoke, GitHub repo/label/push readback smoke, mutable-action approval smoke, GitHub setup-to-first-live-action onboarding smoke, isolated install smoke, and clean-home install E2E smoke. Productize smoke covers both sides of the conversation contract:
plain `ask` must propose without mutating, while `ask --execute` must create the golden path package.
Hermes acceptance tests also cover runtime `/setup auto` from credential entry to successful selected-provider connection, in-wizard recovery from missing or bad credentials without widening the selected check scope, first-value ready-action output after passed checks, protocol-partial trust reporting when credential probes pass but generation fails, setup recovery hints, runtime env-overlay immutability, approval-command proposal blocking, natural-language chat boundaries for command-like text, request-time provider failover, persisted failover metadata in chat/session/run records, runtime session journal/replay output, and recovery from an unreadable runtime session head.
Setup-live-chat smoke joins fresh setup, selected-provider live verification, and a real agent ask
turn in one temp project. MCP-runtime smoke joins fresh setup, protocol MCP `tools/list` readiness,
an agent tool-call turn, guarded `mcp.tools.call`, and persisted tool observations in one temp
project, then checks `/agent status` shows the latest MCP tool proof. Notion readback smoke exercises `/notion setup --live` and `/notion sync --live` through
stubbed Notion writes plus `GET /v1/pages/{id}` readback proof, while checking that tokens are not
persisted. GitHub readback smoke exercises `/github create-repo` and approval-gated
`/github setup-labels`, `/github create-issue --live`, and `/github create-pr --live` through
`gh repo view`, `gh label list`, `gh issue view`, and `gh pr view` readback proof, while checking that
tokens are not persisted. GitHub onboarding smoke exercises the customer path of
`/setup auto --from-env --live --ai openai --mcp github`, `GITHUB_TOKEN_SOURCE=gh-cli`, AI-proposed
`/github setup-labels`, `/agent approve-action`, and label readback proof in one fresh temp project,
while checking that the ephemeral `gh auth token` value is not persisted. Hermes acceptance tests also cover autonomous role-lane execution,
providerless command fallback, cross-lane proposal rejection, parallel lane scheduling, enforced lane
tool budgets, lane memory, control-plane merge behavior, and agent-integration evidence promotion
into the release-readiness gate. Mutable-action
smoke verifies that an AI-proposed Notion live write is queued for approval,
blocked before execution, executed only via `/agent approve-action <id>`, and completed with readback
proof. Install smoke verifies the installer syntax, wrapper, shell bootstrap,
slash helpers, zsh completion, and guarded profile block. Install E2E smoke packages the current
worktree as a temporary git repo, runs `install.sh` into a clean HOME, performs real `pnpm install`
and `pnpm build`, then verifies the installed `rph` wrapper plus sourced `/pm` and `/status` shell
helpers against a fresh product directory.
`live:configured` verifies every
currently configured provider/MCP target and skips entries whose env values are absent.
`rph live ai:openai` or `rph live mcp:stitch` verifies one selected provider/connector from the
harness CLI itself, which is the preferred way to isolate credential, quota, or target-specific
failures before re-running the whole matrix. The package script fallback remains
`pnpm run live:target -- ai:openai` or `pnpm run live:target -- mcp:stitch`. `release:live`
builds the CLI, creates a fresh temp project, runs `/setup auto --from-env --live --ai all --mcp all`,
and fails unless every AI provider reaches generation-smoke readiness and every MCP target reaches its
declared live readiness stage. The live matrix is derived from the runtime provider and connector
definitions, so newly added providers/connectors must appear in the report and onboarding proof.
REST adapters report `adapter-ready` credential readiness, GitHub reports `adapter-write-ready` only
when both REST target read and `gh` repo write permission pass, and `adapter-partial` when the REST
target read passes but the external write channel fails. AI providers and protocol MCP servers report
`protocol-partial` when credential/handshake checks pass but the final generation or `tools/list` step fails. Protocol MCP servers must complete MCP
initialization and `tools/list` for `protocol-ready`; guarded `tools/call` is available to the runtime
tool fabric. Connection reports include a non-secret `onboardingProof` matrix with capture,
verification, target identity, first-action proof, `trustCategory`, protocol kind, protocol applicability, and proven stage. These commands read `.env` into
the child process but do not print secret values. Agent context and status surfaces treat this report
as current proof only when it was produced by a live run, is less than 30 minutes old, and its
non-secret config fingerprint matches the current harness config. Stale, mock/imported, or
config-drifted reports remain available in the proof ledger for audit, but they are not promoted as
current live proof or read-tool authority.

Plain runtime chat writes non-secret turn records to `.rph/ai/chat/`. AI-generated artifacts write non-secret run records to `.rph/ai/runs/`. Notion remains dry-run by default;
`/notion setup --live` creates a dashboard page and tracking databases under `NOTION_PARENT_PAGE_ID`,
then records dashboard page readback proof. `/notion sync --live` writes a live sync summary page
and stores the latest sync page readback proof in `.rph/notion/live-sync-readback.json`.
