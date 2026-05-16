# Podcast Pricing + Audio Reliability Rollout Checklist

## Scope
This checklist covers rollout of:
1. Podcast no-loss settlement and blended ElevenLabs costing.
2. Cloud SuperAdmin pricing controls on `/admin/platform-pricing`.
3. OnPrem CustSuper pricing controls on `/custsuper/manage-pricing`.
4. Audio seek/scrub fix for MP3 range requests.
5. Wizard UX loading feedback while script generation starts.

## Code and Migration Included
1. Migration: `migrations/0070_podcast_pricing_no_loss_fields.sql`.
2. Runtime compatibility: `server/ensurePlatformPricing.ts`.
3. Pricing APIs: `server/routes/adminRoutes.ts`.
4. Settlement logic: `server/services/lessonPodcastService.ts`.
5. MP3 range streaming: `server/objectStorage-onprem.ts`.
6. UI updates:
`client/src/pages/PlatformPricing.tsx`,
`client/src/pages/CustSuperPricing.tsx`,
`client/src/pages/LessonPodcastWizard.tsx`.

## Preflight (ACC and PRD)
1. Confirm backup/snapshot policy is current for app and Postgres.
2. Confirm ElevenLabs API key and usage endpoint permissions are valid.
3. Confirm exchange-rate service path works in environment.
4. Confirm existing `platformPricing` row exists per tenant/context.
5. Confirm deployment artifact includes migration `0070`.

## Rollout Order
1. Cloud ACC.
2. OnPrem ACC.
3. Cloud PRD.
4. OnPrem PRD.

## Deployment Steps Per Environment
1. Deploy application release.
2. Run DB migrations including `0070_podcast_pricing_no_loss_fields.sql`.
3. Restart app process under systemd service.
4. Run health check and confirm app service is systemd-managed.
5. Validate pricing pages load and save without API errors.

## Pricing Configuration Steps
1. Open Cloud: `/admin/platform-pricing`.
2. Open OnPrem: `/custsuper/manage-pricing`.
3. Set podcast pricing inputs:
- Eleven subscription USD/month.
- Included monthly characters.
- Top-up USD per 1k chars.
- Expected monthly chars.
- Enable `Use package floor LPC value`.
- Enable `Enforce no-loss floor`.
4. Save and verify persisted values after refresh.

## Functional Validation (ACC first)
1. Wizard Step 2 (Voices):
- In conversation mode, verify host and guest voice selections work.
- Click Continue and verify loading message appears while generation starts.
2. Wizard Step 4 (Estimate):
- Verify estimated chars, duration, and LPC estimate are shown.
3. Step 5 (Status):
- Generate a podcast and refresh until completed.
- Verify fields show actual chars, provider USD, provider ZAR, actual LPC charged, and estimate delta.
4. Download MP3:
- Verify file name format is `<course-title>-<lesson-title>.mp3`.
- Verify browser timeline seek/scrub works during playback.
5. Ledger checks:
- Verify LPC transaction exists for the user.
- Verify org credit usage reflects the same transaction.
- Verify metadata stores actual provider usage/cost values.

## Financial Guardrail Validation
1. Select a test podcast with known character count.
2. Record:
- Provider USD actual.
- Provider local-currency equivalent.
- Final LPC charged.
- Effective local currency per LPC floor from packages.
3. Confirm final LPC charged is not below no-loss floor when enabled.
4. Confirm estimate can differ from final, but final always respects no-loss floor.

## Edge Cases to Validate
1. Very short script where rounding could undercharge.
2. Large script where top-up pricing dominates.
3. Missing provider usage response fallback path.
4. Exchange-rate fetch failure fallback behavior.
5. Single-voice mode and conversation mode parity.
6. Regeneration of same draft does not duplicate inconsistent charges.
7. Retry after transient generation failure does not double-charge.

## Observability and Alerts
1. Log and dashboard for:
- Estimate vs final LPC deltas.
- Provider USD/ZAR totals.
- No-loss floor adjustments count.
2. Alert when:
- Provider usage cannot be read.
- Settlement falls back to estimate mode.
- Exchange-rate source unavailable.

## Rollback Plan
1. Disable no-loss enforcement toggles if emergency pricing issue occurs.
2. Roll back app release to previous tag.
3. Keep schema columns (non-breaking additive migration).
4. If needed, apply temporary static LPC override policy in pricing settings.
5. Reconcile any impacted transactions with a one-time adjustment script.

## Sign-off Criteria
1. All four environments pass functional validation.
2. No health check warnings for app process manager.
3. At least 3 end-to-end podcast generations per variant validated.
4. Finance confirms margin-positive LPC charging in sampled transactions.
5. Product confirms UX improvements (loading state and seek behavior) are acceptable.
