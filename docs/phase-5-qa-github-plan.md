# Phase 5 QA/GitHub Plan

## Implemented Skeleton

- `rph qa review --pr <number>`
- `rph qa conflicts --pr <number>`
- `rph qa test --pr <number>`
- `rph qa report --pr <number>`
- `rph github create-issue --agent <FE|BE>` local issue record by default
- `rph github create-issue --agent <FE|BE> --live` GitHub issue create with `gh issue view` readback
- `rph github create-pr --issue <number>` local PR draft by default
- `rph github create-pr --issue <number> --live` GitHub draft PR create with `gh pr view` readback
- `rph github sync`
- `rph github release-plan --version <version>`
- `rph github hotfix-plan --title <title>`

## Local Records

- PR draft index and records live under `.rph/prs/`.
- QA reports live under `.rph/qa/`.
- Release and hotfix plans live under `.rph/releases/`.

## Merge Gate

QA never merges. Orchestrator commands only produce local records, dry-run commands, review reports, and release/hotfix plans. `main`, `release`, `dev`, hotfix, and deployment actions remain blocked until the user explicitly approves them outside this skeleton.

GitHub issue and PR commands are local-first. Bare `create-issue` and `create-pr` only write `.rph` records; the `--live` variants are classified as external live writes, must pass runtime approval, and only complete when the matching GitHub readback proof is stored under `.rph/github/`.

## Verification Scope

- Conflict check uses local `git status --porcelain` when a git repo exists.
- Test check runs `pnpm run lint`, `pnpm test`, and `pnpm run build` only when `package.json` exists.
- If no package is present, the report records `not-run` instead of pretending tests passed.
