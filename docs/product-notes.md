# Product Notes

## Product Direction

`real-product-harness` prioritizes quality, documentation, approval gates, and versioned delivery over speed. It treats AI agents as role-separated contributors whose outputs remain reviewable by a human.

## Assumptions

- Phase 1 runs locally without requiring GitHub, Notion, Figma, OAuth, or cloud deploy credentials.
- External integrations default to dry-run, local file generation, or skeleton adapters.
- `.rph` is the local source of truth for project state and non-secret workflow records.
- Obsidian export writes Markdown with frontmatter; Notion remains a typed integration skeleton until credentials exist.
- Final merge, external deploy, OAuth use, and production-side actions remain blocked behind explicit user approval.

## MVP Boundary

Included: CLI, state machine, document versioning, approvals, PM skeleton, interview skeleton, GitHub labels/templates, Obsidian export, Notion/MCP skeleton, tests.

Excluded from Phase 1: real AI model calls, cloud deployment, Figma canvas writes, Notion DB creation, PR merge automation.
