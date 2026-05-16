# Confirmed Fixes

## Summary
This table lists fixes that were confirmed during the multi-agent run, with variant scope and confirmation evidence.

| # | Confirmed Fix | Variant Track | Confirmed By |
|---|---|---|---|
| 1 | Primitive class guard now blocks legacy semantic wrappers like `hsl(var(--...))` / `rgba(var(--...))` in primitive overrides. | both (cloud + onprem shared code) | New guard tests passed (`primitiveClassGuard`, `uiPrimitiveSemanticTokenParity`). |
| 2 | Theme palette enforcement now preserves already-accessible user-authored companion tokens instead of always resetting them. | both | Theme palette + contrast tests passed (`themePaletteBuilder`, `contrastUtils`). |
| 3 | Contrast suggestion candidate list no longer leaks state between calls. | both | `contrastUtils` tests passed. |
| 4 | Missing theme contract tokens were added to generation + required contract: `--btn-focus-ring`, `--nav-pill-active-bg`, `--filter-pill-disabled-bg`, `--email-header-bg`. | both | `themeEditorTokenCoverage` and `PreviewParity` passed. |
| 5 | Theme Editor concrete control coverage now includes `--action-accent`. | both | `themeEditorTokenCoverage` passed. |
| 6 | SuperAdmin impersonation stop flow now prevents stale legacy org context leakage and rehydrates/clears org fields safely. | both | Impersonation contract tests passed (`impersonationCloudSessionContracts`). |
| 7 | Effective organization resolver no longer trusts stale `session.organizationId` in context path unless it matches known context organizations. | both | New stale-fallback regression test passed. |
| 8 | Added cross-domain impersonation regression coverage (auth/admin/billing/theme + client cache invalidation). | both | 4 impersonation-focused suites passed (16 tests). |
| 9 | Mission execution ledger and rollout/rollback package were created in docs for operator use. | both | Ledger file created: `docs/TODO/ui-platform-parity-execution-ledger.md`. |

## Important Note
These fixes were implemented in workspace source and validated by tests. Deployment of these new commits to DEV/ACC/PRD was **not executed** in this run.
