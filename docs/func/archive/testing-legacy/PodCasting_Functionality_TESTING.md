# PodCasting Functionality Testing

## About
This document defines regression tests for podcast wizard generation, draft persistence, script flow, voice mapping, async jobs, playback, and translation.

## Feature Index
1. Wizard source/voice/script flow
2. Draft autosave and resume
3. Bulletin generation
4. Conversation generation (host/guest mapping)
5. Async status and failure handling
6. Usage visibility and estimate confirmation
7. Language/version playback and download
8. Marketplace and lesson viewer playback behavior

## Preconditions and Required Test Data
- Admin-capable user with lesson-management access.
- Lesson with usable source content (Source DB and/or PPTX transcript).
- Integration Settings configured:
  - Gemini API key + `thinkingScriptModel`
  - ElevenLabs API key
- At least one course with lesson(s) for viewer playback checks.

## Detailed Testing Steps
1. Wizard launch and source preview
- Open lesson 3-dot menu and click Generate Podcast.
- Step 1:
  - verify source options match available source types.
  - verify preview content appears for Source DB, Word, and PPTX where available.

2. Voice selection and mode rules
- Step 2:
  - Bulletin mode: select one voice and continue.
  - Conversation mode: host + guest required.
  - Try same host/guest voice in conversation mode.
  - Expected: blocked with validation message.

3. Script generation and review gate
- Step 3:
  - Generate script.
  - Verify script preview shows readable text.
  - Conversation script should include host/guest speaking structure.
  - Attempt to continue without script.
  - Expected: blocked.

4. Estimate and confirm
- Step 4:
  - Verify estimated characters/LPC cost/duration are shown.
  - Start generation.
  - Expected: job moves to processing and status step is shown.

5. Draft autosave and resume
- During each step, change fields and refresh page.
- Expected:
  - wizard restores prior selections and current step.
  - draft persists while job is not fully completed.

6. Async generation status
- Step 5:
  - verify processing -> completed transition.
  - on failure path, verify explicit failure reason is shown and draft is retained.
  - verify audit artifact rows populate and downloads work.

7. Draft deletion rule
- Complete a successful generation.
- Reload state.
- Expected: draft is removed only after successful completion.

8. Playback and versions
- Verify active version audio plays in wizard.
- Set active version and verify it changes.
- Validate lesson viewer playback.
- Validate course marketplace playback/download behavior:
  - overview lesson remains freely playable
  - non-overview obeys enrollment/access rules.

9. Translation generation
- Generate translated podcast version from source script.
- Verify language-specific version appears and can be played/downloaded.

10. Lesson translation package integration
- Start lesson translation with podcast script selected (and optionally audio generation).
- Expected:
  - translated script is created for the target language within lesson podcast metadata,
  - if audio generation is selected and voices are available, translated audio generation starts and version appears in podcast state,
  - failures in podcast asset are surfaced as asset-level translation status and do not roll back completed non-podcast assets.

## Negative/Edge Cases
- No source content: script generation blocked with actionable message.
- Missing Gemini key/model: script generation fails with clear configuration error.
- Missing ElevenLabs key: voices/tts fail with clear error.
- Refresh during processing: status resumes correctly.
- Network interruption: draft resumes from saved step on reconnect.

## Change Summary
- 2026-03-27: Added regression coverage for lesson-translation package integration with podcast script/audio assets and asset-level failure isolation behavior.
- 2026-03-25: Added regression suite for Gemini-thinking script generation, no-Studio architecture, draft resume, host/guest voice mapping, and full playback/version validation.
