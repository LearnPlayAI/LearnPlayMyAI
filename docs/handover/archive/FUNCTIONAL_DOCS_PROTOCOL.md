# Functional Documentation Protocol (AI Seat Rotation)

## Purpose
This protocol ensures every AI seat understands, updates, and preserves `docs/func` as the living functional source of truth for LearnPlay.

## Mandatory References
- `docs/aimem/aimem.md` (must be read before implementation work)
- `docs/func/README.md` (authoring and maintenance guidance)

## Core Rules
1. Functional documentation is incremental:
- only new or changed functionality must be documented.

2. Domain structure is required:
- use `docs/func/<Domain>/`.

3. Required domain files:
- `<Domain>_Functionality.md`
- Legacy `*_Functionality_TESTING.md` files may remain for historical reference only.
- Do not create/update `*_Functionality_TESTING.md` unless user explicitly requests it.

4. Testing gate:
- do not request user testing until `*_Functionality.md` is updated and current validation steps are aligned to current behavior.

5. Writing style:
- human-readable, behavior-focused, and concise.
- avoid unnecessary implementation detail.
- include environment-specific behavior (DEV/ACC/PRD) where relevant.

## Seat Rotation Responsibilities
At start of seat:
1. Read this protocol, the AI operating standard, and `docs/func/README.md`.
2. Confirm understanding of documentation gate before any implementation.

During work:
1. Update functional docs as behavior changes.
2. Keep user-facing validation steps synchronized to behavior.

Before handover:
1. Ensure all touched features have updated functionality docs and current validation guidance.
2. Ensure `docs/handoverdocs` mentions any process changes made during the session.

## Long-Term Memory Rule
If user asks AI to remember a durable project rule, add it to `docs/aimem/aimem.md` (or linked files in `docs/aimem`) so future seats inherit it.
