# Phase 1 Plan

## Core Foundation

- Create repo/workspace structure.
- Implement strict TypeScript core.
- Implement `.rph` project state.
- Implement workflow state machine.
- Implement versioned Markdown documents.
- Implement approval records.
- Implement setup wizard and core CLI commands.
- Implement PM document/interview skeleton.
- Implement Obsidian export structure.
- Implement GitHub labels/templates local automation.
- Add tests for state transitions, versions, approvals, branch names, labels, command parsing, env validation, and Obsidian export.

## First CLI Commands

- `rph init`
- `rph status`
- `rph pm start`
- `rph pm interview`
- `rph pm draft product-definition`
- `rph pm approve product-definition`
- `rph docs list`
- `rph docs show <docId>`
- `rph docs diff <docId> <fromVersion> <toVersion>`
- `rph docs rollback <docId> --to <version>`
- `rph github setup-labels`
- `rph github setup-templates`
