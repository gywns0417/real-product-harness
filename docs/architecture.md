# Architecture

## Shape

The repo is a TypeScript workspace with one CLI app and focused packages:

- `apps/cli`: command routing, wizard UX, terminal output.
- `packages/core`: workflow state, document versions, approvals, PM skeleton, GitHub dry-run helpers.
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
- `.rph/interviews/<docId>/session-001.json`
- `.rph/github/labels.json`

Secrets stay outside `.rph`.

## Gates

Workflow stages define owner agent, prerequisites, required documents, required approvals, allowed commands, next stages, and rollback targets. Large stage movement is blocked if required approvals are missing.

## External Services

GitHub, Notion, Figma, Stitch, MCP, and cloud deploy integrations are adapters. In Phase 1 they write local config/templates or print dry-run commands unless credentials and user approval are available.
