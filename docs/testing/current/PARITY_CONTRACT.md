# UI Kit Primitive Parity Contract

This document defines non-negotiable parity rules for all production UI pages.

## Goal
All production pages must render shared primitives with the same token semantics and state behavior as the UI Kit preview.

Golden reference:
- `client/src/components/brand-editor/previews/PreviewUIKit.tsx`

## Required Rules
1. Shared primitives are the source of truth.
- Use shared components in `client/src/components/ui/*` for button, input, select, tabs, card, alert, badge, table, toast, dialog, tooltip, popover, switch, checkbox, radio.
- Do not recreate primitive visuals in page-level class strings.

2. No page-level action-gradient skinning of primitives.
- Forbidden on production pages/components:
  - `bg-gradient-to-* from-[var(--action-*)] ... to-[var(--action-*)]`
  - direct primitive state colors via class overrides on shared components (`bg-[var(--action-*)]`, `text-white`, etc.)
- If gradient behavior is needed, use primitive variant tokens (`--btn-gradient-*`) through shared component variants.

3. Shell surfaces must be tokenized and neutral.
- Global shell/layout backgrounds must derive from surface tokens (`--surface-*`, `--admin-*`, `--nav-*`) and not fixed atmospheric overlays that distort perceived primitive contrast.

4. Primitive states must remain inside primitive components.
- Hover/active/focus/disabled color definitions belong in shared primitive components and token contracts, not page classes.

5. Accessibility remediation UX must be deterministic.
- Applying a suggestion must converge and not re-surface equivalent rows in a loop.

## Enforcement
- `scripts/check-uikit-parity.sh` is a required CI gate.
- `scripts/remediate-uikit-parity.mjs` is the repo-wide auto-remediation helper.
- Existing white-label and contrast audits remain mandatory.

## Allowed Exceptions
- Brand editor preview/demo fixtures under `client/src/components/brand-editor/previews/**`.
- Explicitly documented visual experiments in isolated demo files only.
