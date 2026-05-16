# Integration Settings Functionality Testing

## About
This document defines regression tests for Integration Settings and for runtime services that depend on provider secrets/defaults.

## Feature Index
1. Access control and navigation
2. Provider list and health state
3. Secret set/mask/delete behavior
4. Setting set/persist behavior
5. Email transport selection (SMTP vs MailerSend)
6. Provider connectivity tests
7. Runtime integration validation (Gemini, Gamma, ElevenLabs, MailerSend, SMTP, YOCO)
8. Integration logs and system-change audit visibility
9. Legacy secret endpoint compatibility mapping
10. Legacy admin-tooling redirects and installer behavior
11. AI model dropdown behavior (Gemini + ElevenLabs)
12. MailerSend template dropdown behavior
13. YOCO management in Integration Settings (cloud only)
14. Legacy page redirects

## Preconditions and Required Test Data
- Test accounts:
  - cloud superAdmin
  - onprem custSuper
- Valid test API keys for:
  - MailerSend
  - Gemini
  - Gamma
  - ElevenLabs
  - YOCO (cloud)
- Runtime with DB access and working admin authentication.

## Detailed Testing Steps
1. Access control and nav
- Login as superAdmin (cloud) or custSuper (onprem).
- Open admin side panel and navigate to `Integration Settings`.
- Expected: page loads and provider tabs are visible.
- Login as non-super user and attempt `/admin/integration-settings`.
- Expected: blocked by role guard (not authorized).

2. Provider summary load
- Open `Integration Settings`.
- Expected on cloud: six providers render (`MailerSend`, `SMTP`, `Gemini`, `Gamma`, `ElevenLabs`, `YOCO`) with current health badge and configured state.
- Expected on onprem: five providers render (`MailerSend`, `SMTP`, `Gemini`, `Gamma`, `ElevenLabs`) and YOCO is not visible.

3. Email transport selector
- In `Integration Settings`, switch `Email Delivery Provider` to `SMTP`, then back to `MailerSend`.
- Expected: selection persists after refresh.
- Expected: corresponding system-change audit events are created.

4. Secret save/mask/delete
- For each provider secret:
  - Save a valid key value.
  - Refresh the page.
  - Expected: secret remains configured and only masked form is shown.
  - Delete secret.
  - Expected: provider summary updates to not configured where required.

5. Setting save/persist
- For each provider, update at least one setting value.
- Refresh the page.
- Expected: updated setting persists and renders as saved value.

6. Provider test action
- Click `Test Connection` for each configured provider.
- Expected: success toast with provider-specific success message.
- Break one key intentionally and retest.
- Expected: failure toast with provider/API failure detail.

7. Runtime behavior uses Integration Settings
- Gemini:
  - Configure `gemini.apiKey`.
  - Configure `gemini.thinkingScriptModel`.
  - Open AI model fetch flow.
  - Expected: model list loads from Gemini API.
  - Open podcast script preview flow.
  - Expected: script generation succeeds without ElevenLabs Studio dependency.
- Gamma:
  - Configure `gamma.apiKey`.
  - Trigger gamma themes/status or generation path.
  - Expected: no missing-key failure and provider calls succeed.
- ElevenLabs:
  - Configure `elevenlabs.apiKey`.
  - Trigger voice list fetch.
  - Expected: voices load from ElevenLabs API.
- MailerSend:
  - Configure `mailersend.apiKey` and sender defaults.
  - Trigger a platform email path.
  - Expected: email transport resolves MailerSend configuration from Integration Settings and send succeeds.
- SMTP:
  - Configure `smtp.host`, `smtp.port`, optional `smtp.username`, and `smtp.password`.
  - Switch active transport to SMTP.
  - Trigger a platform email path.
  - Expected: SMTP path is used from Integration Settings values.
- YOCO (cloud):
  - Configure all required secrets: `yoco.testPublicKey`, `yoco.testSecretKey`, `yoco.livePublicKey`, `yoco.liveSecretKey`, `yoco.webhookSecret`.
  - Trigger checkout/webhook admin checks.
  - Expected: payment service and webhook verifier resolve credentials from Integration Settings (not `.env` integration secrets).

8. Logs and audit views
- Open Integration Settings `Integration Logs` tab.
- Expected: provider events are listed with status/severity.
- Open Integration Settings `System Change Audit` tab and `/admin/system-changes`.
- Expected: secret/setting changes appear with key/action/provider and timestamp.

9. Legacy secret endpoint compatibility
- Call legacy key write for mapped keys (`GEMINI_API_KEY`, `GAMMA_API_KEY`, `ELEVENLABS_API_KEY`, `PODCAST_API_KEY`, `MAILERSEND_API_KEY`, `SMTP_PASS`, `YOCO_TEST_PUBLIC_KEY`, `YOCO_TEST_SECRET_KEY`, `YOCO_LIVE_PUBLIC_KEY`, `YOCO_LIVE_SECRET_KEY`, `YOCO_WEBHOOK_SECRET`).
- Expected: writes succeed and reflect in Integration Settings provider summaries.
- Expected on onprem: YOCO legacy keys are rejected as unsupported for onprem runtime.
- Call legacy key delete for mapped keys.
- Expected: corresponding provider secret clears.
- Call unsupported legacy key.
- Expected: clear validation error instructing to use Integration Settings.

10. Legacy admin-tooling redirects and installer behavior
- Confirm `/admin/secret-keys` is not present in admin navigation.
- Run cloud and onprem `master-install.sh` in interactive mode.
- Expected: installer does not prompt for SMTP/MailerSend/Gemini/Gamma/YOCO secrets.
- Open `lppadmin` integration tests menu items.
- Expected: tests show guidance to use `/admin/integration-settings` provider tests, and do not fail due to missing `.env` integration keys.

11. AI model dropdown behavior (Gemini + ElevenLabs)
- Open Integration Settings `Google Gemini` tab.
- Expected: `Default Text Model`, `Default Image Model`, and `Thinking Script Model (Podcast)` render as dropdown selectors (not text inputs).
- Click `Refresh` and verify model list reloads from provider API.
- Open Integration Settings `ElevenLabs` tab.
- Expected: `Model ID` renders as dropdown selector (not text input), populated from live ElevenLabs models.
- Save a selected model value for both providers and refresh page.
- Expected: selected values persist and remain selected in dropdowns.

12. MailerSend template dropdown behavior
- Open Integration Settings `MailerSend` tab.
- Expected: all `Template:*` default fields render as dropdown selectors (not free-text inputs).
- Expected: dropdown values are fetched from MailerSend templates API.
- Select a template for at least one template setting and save.
- Refresh page.
- Expected: selected template ID persists.
- Select `None (use LearnPlay built-in template)` and save.
- Expected: setting clears and fallback internal template rendering is used.

13. YOCO management in Integration Settings (cloud only)
- Open Integration Settings `YOCO (Cloud)` tab.
- Update mode between `test` and `live`.
- Expected: mode persists and reflects in webhook status endpoints.
- Click `Register/Re-register Webhook`.
- Expected: webhook is created and returned secret is auto-saved to Integration Settings (no manual env copy required).
- Use webhook list table or manual ID delete.
- Expected: selected webhook is removed and status refresh reflects deletion.
- Verify on onprem that YOCO tab is absent.

14. Legacy page redirects
- Open `/ai-settings`.
- Expected: redirects to `/admin/integration-settings`.
- Open `/admin/payment-integration` (cloud superAdmin).
- Expected: redirects to `/admin/integration-settings`.

## Negative/Edge Cases
- Save blank secret: expect validation failure.
- Save malformed numeric/json settings: expect validation/parsing failure.
- Missing encryption master key: expect secret write failure with explicit error.
- External API outage/429/403: provider test and runtime paths must fail with informative error, not silent success.
- Run `cloud/configure-env.sh` and `onprem/configure-env.sh` commands for `smtp`, `api-keys`, `set GEMINI_API_KEY ...`.
- Expected: command is blocked and redirects operator to `/admin/integration-settings`.

## Change Summary
- 2026-03-25: Added coverage for cloud-only YOCO visibility and required five-key YOCO secret set, plus onprem rejection behavior for YOCO legacy keys.
- 2026-03-25: Expanded testing coverage for SMTP/YOCO, email transport selector, integration logs/audit pages, and config-tooling enforcement of Integration Settings as single secret authority.
