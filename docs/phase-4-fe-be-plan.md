# Phase 4 FE/BE Plan

## Implemented Skeleton

- `rph fe spec`
- `rph fe approve spec`
- `rph be spec`
- `rph be api-contract`
- `rph be approve spec`
- `rph be approve api-contract`
- `rph fe sprint-plan`
- `rph be sprint-plan`
- `rph fe approve sprint-plan`
- `rph be approve sprint-plan`
- `rph fe issue-create`
- `rph be issue-create`
- `rph fe work --issue <number>`
- `rph be work --issue <number>`
- `rph fe pr --issue <number>`
- `rph be pr --issue <number>`
- `rph be deploy-dev`

## Gate Order

1. PD approved
2. FE technical spec approved
3. BE technical spec approved
4. API contract approved
5. FE sprint plan approved
6. BE sprint plan approved
7. Implementation stage opens

## Local Records

- Versioned specs and sprint plans live under `.rph/documents/<docId>/`.
- Local issue records live under `.rph/issues/`.
- PR draft records live under `.rph/prs/`.
- Dev deployment hook plans live under `.rph/deployments/`.

## External Policy

GitHub issue/PR creation and cloud deploy remain dry-run/local-record actions until the user explicitly approves external side effects and credentials are present.
