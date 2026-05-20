# real-product-harness

AI agent workflow CLI for real product delivery: PM interview, versioned documents, approval gates, GitHub setup, and local sync targets.

## Install

One-command install:

```bash
curl -fsSL https://raw.githubusercontent.com/gywns0417/real-product-harness/main/install.sh | bash
```

This installs the CLI into `~/.real-product-harness` and creates `~/.local/bin/rph`.
If `rph` is not found after install, add `~/.local/bin` to your shell `PATH`.

```bash
export PATH="$HOME/.local/bin:$PATH"
```

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
/github setup-templates
/github setup-branches
```

For automation, the same slash commands can be run one-shot:

```bash
rph /status
rph /pm start
```

## Runtime Setup

The runtime reads secrets from `.env`, stores non-secret connection state in `.rph/config.json`,
and writes MCP client config to `.mcp/config.json`.

```text
/setup auto
/setup auto --live
/setup auto --guide
/setup auto --from-env --live --ai openai,anthropic,gemini --mcp all
/setup ai openai
/setup mcp notion
/settings show
/settings set ui.theme hacker
/agent status
/agent clear
/ai test openai
/ai run --provider openai --prompt "Draft the first product hypothesis."
/mcp test notion
/doctor --live
/pm draft product-definition --ai
/pd references --ai
/fe spec --ai
/notion setup --live --title "RPH Workspace"
```

Configured credentials are never copied into `.rph/config.json`; only env key names,
configured/missing status, selected provider, and non-secret model/base URL metadata are stored.

`/setup auto` runs the interactive setup assistant. It asks which AI agent to connect, accepts missing API keys or local endpoints, writes them to `.env`, detects GitHub repo metadata from `git`/`gh` when possible, enables selected MCP servers, refreshes `.rph/config.json` and `.mcp/config.json`, and runs connection probes without printing secret values. Use `--guide` or `--non-interactive` for the read-only status guide, `--live` to probe every configured connection, and `--from-env` for non-echo fresh-project verification from the current shell environment.

Plain runtime chat writes non-secret turn records to `.rph/ai/chat/`. AI-generated artifacts write non-secret run records to `.rph/ai/runs/`. Notion remains dry-run by default;
`/notion setup --live` creates a dashboard page and tracking databases under `NOTION_PARENT_PAGE_ID`,
and `/notion sync --live` writes a live sync summary page.
