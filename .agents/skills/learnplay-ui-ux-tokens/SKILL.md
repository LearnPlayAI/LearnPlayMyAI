---
name: learnplay-ui-ux-tokens
description: LearnPlay UI token and accessibility standards for any frontend change. Use for component/page updates, contrast fixes, primitive parity, and responsive UX consistency.
---

# LearnPlay UI/UX Tokens

## When To Use
- Use for any client UI, style, layout, or interaction work.

## Required Workflow
1. Verify primitive/token usage before editing.
2. Avoid hardcoded colors and opacity-based text dimming for semantic content.
3. Implement changes in shared primitives first where possible.
4. Sweep related pages for same pattern class.
5. Run required UI parity/contrast checks.

## Hard Rules
- Preserve theme token architecture and cloud/onprem parity.
- Do not regress mobile responsiveness.
- Avoid introducing competing style systems.
- Enforce runtime theme-resolution correctness on all user-facing pages:
  - Unauthenticated routes/pages use platform default active theme tokens.
  - Authenticated routes/pages use active org theme tokens for the resolved authenticated org context.

## References
- `references/ui-validation-gates.md`
- `references/accessibility-patterns.md`
