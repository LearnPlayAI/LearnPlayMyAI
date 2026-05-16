# Theme Builder Rollout (Cloud + OnPrem, DEV/ACC/PRD)

## Scope
- Move away from pre-made theme selection in Brand Editor.
- Introduce a palette-builder-first workflow (primary/secondary/accent + tone).
- Keep org-level custom themes and platform default fallback intact.
- Ensure package deployment self-heals legacy theme rows automatically.

## What Changed In Code
- Palette builder flow in Brand Editor:
  - `client/src/pages/ThemeEditor.tsx`
- Accessibility-safe token generation from selected palette:
  - `@shared/themeContrastGuard` applied during palette generation
- Automatic startup rollout / backfill:
  - `server/services/themeCatalogRolloutService.ts`
  - invoked from `server/index.ts`

## Safety Model
- Existing tokens are preserved unless they violate token contract or critical contrast safety.
- Legacy `presetId` links are automatically cleared (`presetId -> null`) to de-couple from pre-made presets.
- Token contract gaps are auto-expanded and guarded for contrast compliance.
- Rollout is idempotent and runs on startup via scheduler guard.
- Startup rollout is non-destructive: unresolved critical themes are logged and skipped, not deleted.

## Phase Order
1. Deploy code to each environment.
2. Restart runtime (startup rollout runs automatically).
3. Review startup logs for `ThemeCatalogRollout` summary counts.
4. Re-open Theme Editor and verify:
   - palette builder is shown (no preset library flow)
   - selecting colors generates editable theme tokens
   - save + activate works for org and platform modes
5. Smoke-test `/api/theme/resolved` for representative orgs and domains.

## Validation Checklist
- Existing org active theme still renders correctly after deploy.
- Platform default theme still applies when org has no custom active theme.
- Theme Editor can save and activate without preset dependencies.
- Legacy rows with `presetId` are migrated to `presetId = null`.
- No critical accessibility issues can be introduced by palette-builder apply action.

## Legacy Script Note
- `scripts/theme-rollout-all-envs.sh` no longer prunes theme rows by default.
- To include prune steps explicitly, pass `--allow-prune` (use only with approved backup/rollback plan).
