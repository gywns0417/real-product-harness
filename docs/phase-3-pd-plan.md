# Phase 3 PD Plan

## Implemented Skeleton

- `rph pd start`
- `rph pd references`
- `rph pd directions`
- `rph pd landing-preview`
- `rph pd design-system`
- `rph pd pages`
- `rph pd show <artifactId> [version]`
- `rph pd revise <artifactId> --from <version> --file <markdown>`
- `rph pd approve <artifactId>`
- `rph pd export obsidian <artifactId|all> --path <vaultProjectPath>`
- `rph pd finalize`

## Gate Order

1. References approved
2. Directions approved
3. Landing preview approved
4. Design system approved
5. Page designs approved
6. PD final approval

## Fallback Policy

Figma and Stitch writes require configured tokens and explicit approval. Until then, landing previews use HTML/CSS fallback output under `.rph/design/landing-preview/preview.html`.
