# Product Notes

## Product Direction

`real-product-harness` prioritizes quality, documentation, approval gates, and versioned delivery over speed. It treats AI agents as role-separated contributors whose outputs remain reviewable by a human.

## Assumptions

- Phase 1 runs locally without requiring GitHub, Notion, Figma, OAuth, or cloud deploy credentials.
- External integrations default to dry-run, local file generation, or skeleton adapters.
- `.rph` is the local source of truth for project state and non-secret workflow records.
- Runtime UX is conversational first: plain text talks to the connected AI agent, while slash commands control workflow state. AI-suggested slash commands persist as runtime intents until the user confirms or dismisses them.
- Obsidian export writes Markdown with frontmatter; Notion can create a live dashboard/databases only through explicit `--live` commands.
- Final merge, external deploy, OAuth use, and production-side actions remain blocked behind explicit command flags.

## MVP Boundary

Included: conversational runtime shell, CLI, state machine, document versioning, approvals, PM skeleton, interview skeleton, AI provider setup and generation, GitHub labels/templates, Obsidian export, Notion/MCP setup, tests.

Excluded from Phase 1: cloud deployment, Figma canvas writes, PR merge automation.
