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

Inside the runtime, use slash commands:

```text
/init --yes --project-name "My Product"
/status
/pm start
/pm interview
/pm draft product-definition
/pm revise product-definition --from v1.0.0
/pm approve product-definition
/pm diff product-definition v1.0.0 v1.0.1
/docs approve requirements
/pm finalize
/pd start
/pd references
/pd approve references
/pd landing-preview
/pd export obsidian all --path "/path/to/Obsidian/Project"
/fe spec
/fe approve spec
/be spec
/be api-contract
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
/notion sync
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

External services stay in dry-run or local-template mode until tokens and user approval are present.
