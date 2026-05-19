# real-product-harness

AI agent workflow CLI for real product delivery: PM interview, versioned documents, approval gates, GitHub setup, and local sync targets.

## Install

```bash
pnpm install
pnpm build
```

## Run

```bash
pnpm rph init --yes --project-name "My Product"
pnpm rph status
pnpm rph pm start
pnpm rph pm interview
pnpm rph pm draft product-definition
pnpm rph pm revise product-definition --from v1.0.0
pnpm rph pm approve product-definition
pnpm rph pm diff product-definition v1.0.0 v1.0.1
pnpm rph docs approve requirements
pnpm rph pm finalize
pnpm rph pd start
pnpm rph pd references
pnpm rph pd approve references
pnpm rph pd landing-preview
pnpm rph pd export obsidian all --path "/path/to/Obsidian/Project"
pnpm rph fe spec
pnpm rph fe approve spec
pnpm rph be spec
pnpm rph be api-contract
pnpm rph be approve spec
pnpm rph be approve api-contract
pnpm rph fe sprint-plan
pnpm rph be sprint-plan
pnpm rph fe issue-create --title "Build dashboard shell"
pnpm rph fe work --issue 1
pnpm rph fe pr --issue 1
pnpm rph qa review --pr 1
pnpm rph qa conflicts --pr 1
pnpm rph qa test --pr 1
pnpm rph qa report --pr 1
pnpm rph be deploy-dev --provider local
pnpm rph github release-plan --version v0.1.0
pnpm rph notion plan
pnpm rph notion sync
pnpm rph docs list
pnpm rph docs export obsidian all --path "/path/to/Obsidian/Project"
pnpm rph docs export notion
pnpm rph github create-repo
pnpm rph github setup-labels
pnpm rph github setup-templates
pnpm rph github setup-branches
```

External services stay in dry-run or local-template mode until tokens and user approval are present.
