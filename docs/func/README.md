# Functional Documentation Guide (`docs/func`)

## Purpose
`docs/func` is the living source of truth for functional behavior in LearnPlay.
It is written for humans, not only developers, and should explain what the platform does and how to test it.

## Update Policy
- Do not attempt a full backfill now.
- Update incrementally whenever functionality is added or changed.
- Keep docs clear, concise, and behavior-focused.

## Domain Structure
Use one folder per functional domain:
- `docs/func/<Domain>/`

Example:
- `docs/func/Licensing/`
- `docs/func/Storage/`

## Required Files Per Domain
Each domain must include:
- `<Domain>_Functionality.md`

Legacy note:
- Existing `<Domain>_Functionality_TESTING.md` files were moved to `docs/func/archive/testing-legacy/` as historical artifacts.
- Do not create or update `*_Functionality_TESTING.md` unless the user explicitly requests it for the current task.

## Mandatory Rule Before Testing
Do not request user testing for a feature unless:
- The relevant `*_Functionality.md` file is updated and aligned with current behavior.
- Current test/validation steps are provided in the task response (or in another document explicitly requested by the user).

## Writing Standard
- Prefer human-readable business language.
- Keep technical implementation detail minimal unless needed for clarity.
- Explicitly call out DEV, ACC, and PRD differences where relevant.
- Include integrations and short descriptions.

## Maintenance Rule
When behavior changes:
1. Update `*_Functionality.md`.
2. Update validation guidance in the task response or other explicitly requested documentation.
3. Update handover documentation if process expectations changed.
4. Record key changes in each updated file's change summary.
