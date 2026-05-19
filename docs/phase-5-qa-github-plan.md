# Phase 5 QA/GitHub Plan

## Implemented Skeleton

- `rph qa review --pr <number>`
- `rph qa conflicts --pr <number>`
- `rph qa test --pr <number>`
- `rph qa report --pr <number>`
- `rph github create-issue --agent <FE|BE>`
- `rph github create-pr --issue <number>`
- `rph github sync`
- `rph github release-plan --version <version>`
- `rph github hotfix-plan --title <title>`

## Local Records

- PR draft index and records live under `.rph/prs/`.
- QA reports live under `.rph/qa/`.
- Release and hotfix plans live under `.rph/releases/`.

## Merge Gate

QA never merges. Orchestrator commands only produce local records, dry-run commands, review reports, and release/hotfix plans. `main`, `release`, `dev`, hotfix, and deployment actions remain blocked until the user explicitly approves them outside this skeleton.

## Verification Scope

- Conflict check uses local `git status --porcelain` when a git repo exists.
- Test check runs `pnpm run lint`, `pnpm test`, and `pnpm run build` only when `package.json` exists.
- If no package is present, the report records `not-run` instead of pretending tests passed.
