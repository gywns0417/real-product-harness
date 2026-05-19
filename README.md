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
pnpm rph pm approve product-definition
pnpm rph docs list
pnpm rph github setup-labels
pnpm rph github setup-templates
```

External services stay in dry-run or local-template mode until tokens and user approval are present.
