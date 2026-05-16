# PodCasting Functionality

## About
This document describes lesson podcast generation, playback, translation, versioning, and draft/resume behavior for LearnPlay.

## Feature List
- Lesson podcast wizard (`/lessons/:lessonId/podcast-wizard`) with 5 guided steps.
- Source selection from:
  - Source DB
  - Word-derived lesson content
  - PPTX transcript-derived lesson content
- Mode selection:
  - Bulletin (single voice)
  - Conversation (host + guest voices)
- Live voice listing and preview from ElevenLabs public voices endpoint.
- Script generation using Gemini thinking model configured in Integration Settings.
- Script review/edit before audio generation using the formatted script editor (host/guest bubbles).
- Async background audio generation with status tracking.
- Usage and balance visibility for ElevenLabs subscription usage.
- Language-aware podcast translation and generation flow.
- Lesson translation package integration: podcast script translation and optional translated-audio generation can be triggered from lesson translation selection flow.
- Versioned podcast playback/download per lesson and marketplace course view support.
- Draft version selector and draft delete support.
- Regenerate podcast starts from Step 1 and creates a new version for the selected language.
- Downloads:
  - final generated MP3
  - human-readable script TXT
- Lesson list badge support for generated podcasts by language (similar to PPTX language badges).

## Rules and Constraints
- No ElevenLabs Studio API is used for script generation.
- Script generation is LearnPlay-owned and uses Gemini `thinkingScriptModel`.
- Bulletin requires exactly one selected host voice.
- Conversation requires host and guest voices and generated segments must map to host/guest lines.
- Conversation script is normalized to strict alternating turns.
- Conversation starts with host turn and ends with host turn.
- User can override display names for host and guest during wizard setup.
- User must review script before starting audio generation.
- Audio generation is asynchronous.
- Draft lifecycle:
  - Draft persists across steps and page refresh/reconnect.
  - Draft is a single unit for the wizard state (not one draft per step).
  - Draft can be selected, resumed, updated, and explicitly deleted by user.
- Overview lesson podcast playback remains free without enrollment.
- Non-overview lesson podcast playback requires enrolled/access-eligible user context.

## Draft and Resume Behavior
- Draft stores:
  - current step
  - source type
  - mode, duration, focus topic
  - selected voices
  - script linkage and estimate metadata
  - title and notes
- Wizard restores from draft state when reopened.
- Auto-save runs during step progression and input changes.
- Step navigation allows moving backward/forward while retaining latest state.
- Creating a new podcast for the same lesson creates/uses a new draft context and keeps previous completed versions.

## Generation Flow
1. Build script from selected lesson source and wizard inputs.
2. Save script version + script segments (host/guest/narrator).
3. Estimate LPC cost and present worst-case estimate for confirmation.
4. On user confirmation, start async TTS generation.
5. Generate TTS chunks with selected voices.
6. Persist chunk artifacts and final audio artifact.
7. Update version state, job state, and usage records.
8. Settle LPC usage based on ElevenLabs-reported character usage delta when available; fallback to estimate only when provider delta cannot be resolved.

## Audit and Retention
- All key generation artifacts are retained:
  - script-generation raw response payloads (internal audit)
  - per-chunk audio artifacts
  - final generated audio artifact
  - failure payload artifacts when generation fails
- Artifacts are persisted in uploads/audit paths and surfaced through the wizard audit list.
- User-facing downloads are limited to MP3 and TXT script (JSON/raw artifacts remain internal/audit).

## Environment-Specific Behavior
- cloud DEV / cloud ACC / cloud PRD:
  - same behavior and API contract.
- onprem DEV / onprem ACC / onprem PRD:
  - same behavior and API contract.
- Role constraints still apply through existing lesson admin and org-access middleware.

## Integrations
- Gemini (script generation):
  - model from Integration Settings (`gemini.thinkingScriptModel`)
- ElevenLabs public API:
  - voices list
  - text-to-speech
  - subscription usage

## ElevenLabs API Key Permissions (Required)
Configure API key at:
- `https://elevenlabs.io/app/developers/api-keys`

Edit the key and set permissions exactly as follows:
- Text to Speech: Access
- Speech to Speech: No Access
- Speech to Text: No Access
- Sound Effects: No Access
- Audio Isolation: No Access
- Music Generation: No Access
- Dubbing: No Access
- ElevenAgents: Write
- Projects: Write
- Audio Native: Write
- Voices: Read
- Voice Generation: Access
- Forced Alignment: Access
- History: Read
- Models: Access
- Pronunciation Dictionaries: No Access
- User: Read
- Workspace: Write
- Workspace Analytics: Access
- Webhooks: Access
- Service Accounts: Access
- Group Members: No Access
- Workspace Members Read: No Access
- Workspace Members Invite: No Access
- Workspace Members Remove: No Access
- Terms of Service Accept: No Access

## Change Summary
- 2026-03-27: Added translation-package integration support so lesson translation can include podcast script translation and optional translated audio generation as selected assets, with per-asset status surfaced via lesson translation state.
- 2026-03-25: Replaced ElevenLabs Studio script dependency with Gemini thinking-model script generation, added host/guest segment linkage, added persistent step-aware draft resume behavior, and aligned wizard preview/audit behavior accordingly.
- 2026-03-26: Added enhanced draft/version lifecycle, regenerate-from-step-1 flow, formatted script editing UX, MP3/TXT downloads, podcast language badges, and improved LPC settlement behavior tied to ElevenLabs usage delta.
- 2026-03-27: Added required ElevenLabs API key permission matrix documentation.
