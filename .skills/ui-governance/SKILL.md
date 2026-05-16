---
name: ui-governance
description: "Enforce world-class LearnPlay UI/UX standards for all frontend work: mobile-first responsive layouts that scale cleanly to desktop, modern visual language, strict organization-level branding/theme compliance, robust state patterns (wizards, drafts, cache invalidation, persistence), and no modal/dialog flows unless explicitly requested."
---

# LearnPlay World-Class UI Governance Skill

Apply this skill to every UI/layout/styling/component/UX task.

## Mandatory Workflow
1. Read `docs/aimem/aimem.md` first.
2. Create a Design Contract before coding:
   - page goal and target user
   - primary task flow and success state
   - required UI states (`loading`, `empty`, `error`, `success`)
   - breakpoints to validate (`320`, `360`, `375`, `390`, `768`, `1024`, `1280`)
   - Theme Editor token/branding dependencies that must be preserved
3. Define the UX flow using inline/page/route patterns.
4. Implement mobile-first (`320px`) and progressively enhance to desktop.
5. Apply LearnPlay and organization theme tokens as controlled by Theme Editor.
6. Implement modern state and reliability patterns from `references/world-class-patterns.md`.
7. Run `references/ui-acceptance-checklist.md` as a hard gate before completion.

## Non-Negotiable Standards
- Do not use modals/dialogs/popups for primary flows unless user explicitly requests an exception in the current task.
- Do not ship overlapping text, clipping content, or horizontal scrolling at any supported mobile width.
- Do not hardcode brand colors/styles when tokenized theme values exist.
- Do not bypass Theme Editor-governed branding (colors, typography, logos, assets, brand accents).
- Do not ship stale-data behavior: all mutating actions must define cache invalidation/revalidation.
- Do not lose user input on refresh/navigation unless explicitly intended and documented.

## UX Quality Bar
- Build modern, polished, visually intentional interfaces aligned with LearnPlay brand personality.
- Design for conversion and task completion: clear hierarchy, strong CTA structure, predictable navigation.
- Prefer stepwise guided flows (wizards/steppers), draft-save patterns, and contextual inline feedback.
- Ensure accessibility and usability on touch devices and keyboards.

## Required Technical Patterns
- Reuse existing shared UI primitives and layout patterns before creating net-new components.
- If a new shared pattern is needed, make it token-driven and reusable across pages.
- Use wizard/stepper flows for multi-step creation and configuration tasks.
- Use draft lifecycle patterns: create draft, autosave, explicit save/publish, unsaved-change awareness.
- Use input persistence for forms/flows likely to be interrupted.
- Use explicit cache invalidation + background refresh for all mutations.
- Use loading/skeleton/empty/error/success states inline in the page.

## Completion Contract For Every UI Task
Return:
1. Short plan with edge cases and risks.
2. Design Contract summary (goal, states, breakpoints, Theme Editor dependencies).
3. Mobile and desktop implementation notes with key breakpoints validated.
4. Non-modal compliance statement.
5. Theme/branding compliance statement (including Theme Editor alignment).
6. Data freshness + persistence strategy used.
7. Manual visual QA evidence:
   - tested widths
   - key state coverage
   - screenshot file paths (when screenshots were captured during task)
8. Checklist results and any residual risks.

## References
- `references/world-class-patterns.md`
- `references/ui-acceptance-checklist.md`
