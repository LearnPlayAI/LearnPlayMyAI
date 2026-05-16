# Integration Settings Functionality

## About
This document defines the platform-level Integration Settings capability for cloud and onprem runtimes.
It replaces direct `.env`-managed integration credentials for supported providers with admin-managed, encrypted settings stored in the application database.

## Feature List
- Super-user Integration Settings page at `/admin/integration-settings`.
- Supported providers:
  - MailerSend
  - SMTP
  - Google Gemini
  - Gamma
  - ElevenLabs
  - YOCO (cloud only)
- Active email transport selector (`mailersend` or `smtp`) persisted in system settings.
- Integration runtime logs view (provider events, success/failure/degraded states).
- System changes audit view for critical configuration updates.
- Per-provider secret management:
  - Set secret values
  - View masked values only
  - Delete secret values
- Per-provider runtime defaults management:
  - String / number / boolean / json settings
  - Persisted and reused by runtime services
- AI model settings use provider-backed dropdown catalogs (no free-text entry for model IDs):
  - Gemini model defaults (`defaultTextModel`, `defaultImageModel`, `thinkingScriptModel`) load from live Gemini model list.
  - ElevenLabs `modelId` loads from live ElevenLabs model list.
- MailerSend template defaults are provider-backed dropdown catalogs populated from the MailerSend templates API.
- YOCO payment integration administration is handled in Integration Settings (cloud only):
  - test/live mode selection,
  - webhook registration/re-registration,
  - webhook listing and deletion,
  - webhook secret persisted to encrypted integration secrets automatically after registration.
- Legacy standalone pages are retired:
  - `/ai-settings` redirects to `/admin/integration-settings`.
  - `/admin/payment-integration` redirects to `/admin/integration-settings`.
- Per-provider connectivity test endpoint from UI.
- Legacy secret API compatibility path that maps legacy secret keys to Integration Settings-backed secrets.

## Rules and Constraints
- Only `superAdmin` (cloud) and `custSuper` (onprem) can manage integration settings.
- Integration secrets are encrypted at rest before storage.
- Runtime services for supported providers resolve keys/defaults from Integration Settings, not from `.env`.
- `.env` remains runtime-only for non-integration sensitive values; integration secret maintenance is blocked from config tooling and moved to Integration Settings.
- Secret values are never returned in plain text to the frontend.
- Missing required provider secrets mark provider health as degraded.
- Legacy secret key routes remain compatibility-facing but write through to Integration Settings for mapped keys.

## Environment-Specific Behavior
- cloud DEV / cloud ACC / cloud PRD:
  - `superAdmin` can manage integration settings and test providers.
- onprem DEV / onprem ACC / onprem PRD:
  - `custSuper` can manage integration settings and test providers.
- Runtime behavior and provider resolution are consistent across cloud and onprem tracks.
- YOCO provider is cloud-only and is not exposed on onprem Integration Settings.

## Runtime Usage Mapping
- Gemini:
  - API key: `gemini.apiKey`
  - Default models: `gemini.defaultTextModel`, `gemini.defaultImageModel`
  - Podcast script model: `gemini.thinkingScriptModel` (required for script generation in podcast wizard)
- Gamma:
  - API key: `gamma.apiKey`
  - Defaults supported for theme/style/speaker notes
- ElevenLabs:
  - API key: `elevenlabs.apiKey`
  - Defaults supported for model/voice settings
- MailerSend:
  - API key: `mailersend.apiKey`
  - Sender/template defaults from provider settings
- SMTP:
  - Password secret: `smtp.password`
  - Host/port/secure/username/from defaults from provider settings
- YOCO (cloud only):
  - Secrets: `yoco.testPublicKey`, `yoco.testSecretKey`, `yoco.livePublicKey`, `yoco.liveSecretKey`, `yoco.webhookSecret`
  - Settings: `yoco.mode`

## API Surface
- `GET /api/admin/integrations`
- `GET /api/admin/integrations/email-transport`
- `PUT /api/admin/integrations/email-transport`
- `GET /api/admin/integrations/:provider`
- `GET /api/admin/integrations/:provider/model-options`
- `GET /api/admin/integrations/mailersend/template-options`
- `PUT /api/admin/integrations/:provider/secrets/:key`
- `DELETE /api/admin/integrations/:provider/secrets/:key`
- `PUT /api/admin/integrations/:provider/settings/:key`
- `POST /api/admin/integrations/:provider/test`
- `GET /api/admin/integrations/logs`
- `GET /api/admin/system-changes`
- Legacy compatibility:
  - `GET /api/admin/secrets`
  - `PUT /api/admin/secrets/:key`
  - `DELETE /api/admin/secrets/:key`

## Implementation Phases Completed
1. Added Integration Settings backend service with provider definitions, encrypted secret persistence, and provider health summaries.
2. Added Integration Settings admin API endpoints and provider test handlers.
3. Added Integration Settings UI page and admin navigation/route wiring.
4. Cut over runtime integrations (Gemini, Gamma, ElevenLabs, MailerSend) to database-backed Integration Settings resolution.
5. Added legacy secret-key route compatibility mapping so old flows target new storage authority.
6. Updated docs and regression testing coverage.

## Assumptions and Out of Scope
- This domain only governs the listed integrations.
- Non-integration secrets (for other subsystems) are outside this scope.
- Provider commercial access restrictions are external to platform code.
- LearnPlay podcast script generation explicitly avoids ElevenLabs Studio API and uses Gemini thinking model + ElevenLabs public TTS APIs.

## Change Summary
- 2026-03-25: Added MailerSend template dropdown sourcing, moved YOCO mode/webhook admin operations into Integration Settings, and retired standalone AI Settings / Payment Integration pages via redirect.
- 2026-03-25: Updated YOCO integration scope and storage so YOCO appears only on cloud and all required YOCO keys (test/live public, test/live secret, webhook secret) are managed as encrypted secrets.
- 2026-03-25: Added provider-backed dropdown model selection in Integration Settings for Gemini and ElevenLabs model settings, with live refresh against provider APIs.
- 2026-03-25: Expanded Integration Settings to include SMTP and YOCO provider management, active email transport switching, integration logs, and system-change audit views.
- 2026-03-25: Enforced DB-secret authority by disabling integration secret maintenance in cloud/onprem configure-env tooling and removing installer prompts for integration API keys/SMTP details.
- 2026-03-25: Removed legacy `/admin/secret-keys` route usage and aligned cloud/onprem master-install + lppadmin integration guidance to Integration Settings as the single operational path.
- 2026-03-25: Added `thinkingScriptModel` setting under Gemini for podcast script generation without ElevenLabs Studio dependency.
