# Current Handover

Last updated: 2026-04-28
Scope: both

## Active Goal
Keep cloud and onprem source, documentation, and release operations aligned from the canonical workspace and canonical docs root.

## Current Documentation State
- Canonical docs root: `/antigravity/docs`.
- Deprecated docs root: `/antigravity/Cloud-On-Prem/docs`.
- Default knowledge loading is compact and index-driven through `/antigravity/docs/knowledge/KNOWLEDGE_KERNEL.md`.
- Historical handover, old generated material, and stale repo-local docs are archived/searchable, not default-loaded.

## Current Runtime State
Use `/antigravity/docs/handover/RELEASE_STATE.md` for the current known-good/runtime matrix.

## Mandatory Continuity Rules
- Update active current docs when durable facts change.
- Archive historical detail rather than keeping it in active handover files.
- Keep `/antigravity/docs/knowledge/KNOWLEDGE_INDEX.md` current when canonical reference locations change.
- Keep release/changelog tooling pointed at the compatibility changelog path until tooling migration is completed.

