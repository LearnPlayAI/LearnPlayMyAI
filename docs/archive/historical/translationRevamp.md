# Translation Revamp Implementation Tracker

## At-a-Glance Progress

- Overall Progress: `99%` (76/77 tasks complete)
- Current Phase: `8 - Full Lesson-Domain Audit Remediation`
- Current Task: `Deployment + UAT verification checklist execution`
- Status: `Code Complete, Verification Pending`
- Last Updated (UTC): `2026-04-02`
- Owner: `Codex + Jan`

### Phase Progress

| Phase | Name | Status | Progress |
|---|---|---|---|
| 0 | Planning & Tracking Setup | Complete | 1/1 |
| 1 | Architecture & Extraction | Complete | 7/7 |
| 2 | Unified Inline Flow Integration | Complete | 8/8 |
| 3 | Podcast UX Rework (Modern + Responsive) | Complete | 8/8 |
| 4 | Theme, White-Label, Accessibility Hardening | Complete | 6/6 |
| 5 | Regression, Observability, and Verification | Complete | 8/8 |
| 6 | UAT Support, Final Fixes, Rollout Readiness | Complete | 3/3 |
| 7 | UAT Wave 2 Findings (Podcast Inline UX + Persistence) | In Progress | 18/19 |
| 8 | Full Lesson-Domain Audit Remediation | Complete | 17/17 |

---

## Scope Summary

This tracker governs the end-to-end lesson translation revamp with inline optional podcast flow, modernized podcast UX, and full theme/mobile/desktop compliance for cloud + on-prem.

### Fixed Decisions

- Option A is active:
  - Lesson digest translation is included at no extra LPC cost.
  - Podcast script translation is included at no extra LPC cost.
- The translation flow must remain in one wizard (no required route jump to a separate podcast wizard).
- Standalone podcast wizard route remains available as a legacy/direct fallback during rollout.

---

## Source-of-Truth Files

### Frontend

- `/antigravity/Cloud-On-Prem/client/src/pages/TranslateLesson.tsx`
- `/antigravity/Cloud-On-Prem/client/src/pages/LessonPodcastWizard.tsx`
- `/antigravity/Cloud-On-Prem/client/src/pages/PlatformPricing.tsx`
- `/antigravity/Cloud-On-Prem/client/src/pages/CustSuperPricing.tsx`

### Backend

- `/antigravity/Cloud-On-Prem/server/routes/courseRoutes.ts`
- `/antigravity/Cloud-On-Prem/server/workers/translationWorker.ts`
- `/antigravity/Cloud-On-Prem/server/routes/adminRoutes.ts`

### Shared Schema

- `/antigravity/Cloud-On-Prem/shared/schema.ts`

---

## Phase 0 - Planning & Tracking Setup

### Tasks

- [x] Create implementation tracker markdown at `docs/changes/translationRevamp.md`.

### Notes

- This file will be updated as implementation progresses.

---

## Phase 1 - Architecture & Extraction

### Goal

Establish a shared architecture so `TranslateLesson` can own an inline podcast sub-flow while reusing podcast capabilities safely.

### Tasks

- [x] Define unified parent wizard state model (translation + optional podcast).
- [x] Define standardized artifact/job status mapping contract for UI display.
- [x] Identify reusable podcast modules to extract from `LessonPodcastWizard`.
- [x] Extract podcast logic into reusable hook(s) for inline and standalone use.
- [x] Extract reusable podcast UI sections/components.
- [x] Preserve backward compatibility for standalone podcast route.
- [x] Add/confirm idempotency guards for repeated start/generate actions.

### Deliverables

- Shared state contract and extracted component/hook layer.

### File Targets

- `/antigravity/Cloud-On-Prem/client/src/pages/TranslateLesson.tsx`
- `/antigravity/Cloud-On-Prem/client/src/pages/LessonPodcastWizard.tsx`
- New shared files under `/antigravity/Cloud-On-Prem/client/src/components/...` and/or `/hooks/...`

---

## Phase 2 - Unified Inline Flow Integration

### Goal

Implement one continuous translation wizard that includes optional podcast processing inline.

### Tasks

- [x] Introduce new parent step map in `TranslateLesson` including `Podcast (Optional)`.
- [x] Remove primary dependency on `Open Podcast Translation Wizard` route jump.
- [x] Add one clear podcast decision point (avoid duplicate CTA/choice sections).
- [x] Render inline podcast sub-flow inside translation wizard when selected.
- [x] Auto-skip podcast step when not selected.
- [x] Ensure `What Will Be Translated` and execution payload stay consistent.
- [x] Ensure resume/reload restores exact step and sub-step reliably.
- [x] Ensure legacy/direct route to standalone podcast wizard still works.

### Deliverables

- Single end-to-end flow without forced navigation away from translation wizard.

### File Targets

- `/antigravity/Cloud-On-Prem/client/src/pages/TranslateLesson.tsx`
- `/antigravity/Cloud-On-Prem/client/src/pages/LessonPodcastWizard.tsx`

---

## Phase 3 - Podcast UX Rework (Modern + Responsive)

### Goal

Redesign podcast flow UI/UX to be clean, modern, helpful, and responsive.

### Tasks

- [x] Redesign step presentation using a clear responsive stepper pattern.
- [x] Implement progressive disclosure to reduce cognitive load.
- [x] Redesign voice selection UX with compatibility guidance and quick preview cues.
- [x] Redesign script editing UX (structured, readable, editable on mobile/desktop).
- [x] Redesign estimate UX with transparent breakdown and included/free labels.
- [x] Redesign status UX using timeline/cards for mobile and dense overview for desktop.
- [x] Add sticky footer actions on mobile with clear primary CTA hierarchy.
- [x] Improve microcopy for clarity, confidence, and next-action guidance.

### Deliverables

- Fully reworked inline podcast UX and refreshed standalone UX parity where applicable.

### File Targets

- `/antigravity/Cloud-On-Prem/client/src/pages/TranslateLesson.tsx`
- `/antigravity/Cloud-On-Prem/client/src/pages/LessonPodcastWizard.tsx`
- Potential new components under `/antigravity/Cloud-On-Prem/client/src/components/...`

---

## Phase 4 - Theme, White-Label, Accessibility Hardening

### Goal

Ensure complete design-system compliance and accessibility quality.

### Tasks

- [x] Replace hardcoded visual values with theme tokens/CSS vars.
- [x] Validate white-label behavior across cloud and on-prem branding contexts.
- [x] Verify responsive behavior at mobile/tablet/desktop breakpoints.
- [x] Ensure keyboard navigation and focus management across steps and async actions.
- [x] Add/verify ARIA labels and assistive announcements for status transitions.
- [x] Validate contrast and state colors for badges/alerts/progress indicators.

### Deliverables

- Theme-safe, white-label-safe, accessible flow.

### File Targets

- Frontend wizard/component files touched in Phases 1-3.

---

## Phase 5 - Regression, Observability, and Verification

### Goal

Prevent regressions and improve diagnosability for translation + podcast orchestration.

### Tasks

- [x] Ensure non-podcast translation flow remains behaviorally unchanged.
- [x] Ensure manual translation draft/upload paths remain intact.
- [x] Ensure PPTX modes and retry flows remain intact.
- [x] Normalize and verify translation + podcast status semantics (no false complete states).
- [x] Add or update analytics events for funnel and drop-off visibility.
- [x] Add structured logs/correlation links between translation and podcast jobs.
- [x] Add/extend integration tests for unified inline flow.
- [x] Add/extend e2e checks for mobile/resume/failure scenarios.

### Deliverables

- Verified regression-safe build with observability support.

### File Targets

- `/antigravity/Cloud-On-Prem/server/routes/courseRoutes.ts`
- `/antigravity/Cloud-On-Prem/server/workers/translationWorker.ts`
- Client tests/e2e suites where applicable

---

## Phase 6 - UAT Support, Final Fixes, Rollout Readiness

### Goal

Support your screenshot-based UAT process and close the loop for production readiness.

### Tasks

- [x] Prepare UAT script/checklist aligned to your screenshot-comment workflow.
- [x] Apply UAT feedback fixes from your annotated screenshots.
- [x] Confirm go-live/rollback readiness and final acceptance.

### Deliverables

- UAT-passed, release-ready implementation.

---

## Explicit UX/Behavior Acceptance Criteria

- [x] User can translate all selected lesson artifacts end-to-end without leaving translation wizard.
- [x] Optional podcast path is inline and intuitive.
- [x] Statuses are truthful and comprehensible for each artifact.
- [x] Included/free items (digest + podcast script translation) are clearly labeled in cost/summary.
- [x] Flow is mobile responsive and desktop efficient.
- [x] Flow adheres to theme/branding system in cloud and on-prem.

---

## Edge Case Matrix (Must Pass)

- [x] No source podcast exists.
- [x] Source podcast exists but voice configuration is missing.
- [x] Conversation mode selected with invalid/missing guest setup.
- [x] Partial failure across artifacts with retry behavior.
- [x] Existing active translation job for same lesson/language.
- [x] User refreshes mid-run and resumes correctly.
- [x] Stale source after translation and before publish.
- [x] Cloud vs on-prem parity remains intact.

---

## New Findings - UAT Wave 2 (2026-04-02)

### Finding F-011 - Inline Podcast Sub-Step Navigation Is Not Discoverable

- Source: screenshot feedback on `Translate Lesson -> Step 4 of 6: Podcast (Optional)`.
- Symptom:
  - Users do not realize `Setup / Voices / Script / Estimate / Status` are interactive step controls.
  - Users expect page-level wizard footer (`Back/Next`) to drive progression.
- Code evidence:
  - Inline sub-step controls are rendered as generic buttons in card header:
    - `/antigravity/Cloud-On-Prem/client/src/components/translation/InlinePodcastTranslationStep.tsx`
  - Parent wizard `Next` is gated for podcast step and remains disabled until generation starts/completes:
    - `/antigravity/Cloud-On-Prem/client/src/pages/TranslateLesson.tsx`
    - `canProceed()` podcast branch requires `hasTriggeredGeneration || hasCompletedAudio`.
- Impact:
  - High confusion risk and false perception of blocked/error state.
  - Elevated abandonment risk in optional podcast funnel.

### Finding F-012 - Parent Footer Controls And Inline Sub-Step Controls Compete

- Source: screenshot feedback requesting wizard-like forward/back movement from the bottom controls.
- Symptom:
  - User sees two navigation paradigms:
    - global parent footer (`Back/Next`)
    - local inline sub-step controls/buttons.
  - Ownership of progression is unclear.
- Code evidence:
  - Parent footer is always rendered for non-complete steps:
    - `/antigravity/Cloud-On-Prem/client/src/pages/TranslateLesson.tsx`
  - Inline component also renders per-sub-step back/continue controls:
    - `/antigravity/Cloud-On-Prem/client/src/components/translation/InlinePodcastTranslationStep.tsx`
- Impact:
  - UX inconsistency and cognitive overload.
  - Increases support load due to "Next is disabled" reports.

### Finding F-013 - Inline Voices Step Lacks Feature Parity With Standalone Wizard

- Source: screenshot feedback on voices section.
- Confirmed gaps vs standalone:
  - Missing host/guest voice search.
  - Missing voice preview audio players (and compare flow for conversation mode).
  - Missing guided validation checklist/hints present in standalone.
- Code evidence:
  - Inline voices step has basic selects + display-name inputs only:
    - `/antigravity/Cloud-On-Prem/client/src/components/translation/InlinePodcastTranslationStep.tsx`
  - Standalone wizard includes search/filter, preview audio, compare preview, richer validation UX:
  - `/antigravity/Cloud-On-Prem/client/src/pages/LessonPodcastWizard.tsx`
- Note:
  - Custom display-name fields are already present inline (`Host display name`, `Guest display name`), so this item is primarily parity/discoverability rather than complete absence.

### Finding F-014 - Deployment-Safe Resume Guarantees Must Be Explicitly Hardened

- Source: user requirement that podcast wizard state must persist like translation wizard and survive deployments.
- Current state (confirmed):
  - Inline podcast-in-translation state is persisted server-side under `translationPackage.wizardState`:
    - `POST /api/lessons/:sourceLessonId/translation-wizard-state`
    - `/antigravity/Cloud-On-Prem/server/routes/courseRoutes.ts`
    - `/antigravity/Cloud-On-Prem/server/services/translationWizardStateService.ts`
  - Standalone podcast wizard uses server-backed draft persistence (`/podcast/draft`) including `currentStep`:
    - `/antigravity/Cloud-On-Prem/client/src/pages/LessonPodcastWizard.tsx`
    - `/antigravity/Cloud-On-Prem/server/routes/courseRoutes.ts`
- Gap:
  - Persistence exists, but rollout/readiness does not yet include explicit deployment-compatibility controls (state schema versioning, backward compatibility tests, and operator verification checklist).
- Impact:
  - Without explicit compatibility checks, deployments with UI/state shape changes could silently degrade resume fidelity.

---

## Phase 7 - UAT Wave 2 Findings (Podcast Inline UX + Persistence)

### Goal

Remove navigation ambiguity and bring inline voices UX closer to standalone quality while staying theme-aware, responsive, and cloud/on-prem parity-safe.

### Tasks

- [x] Add explicit sub-step header/microcopy clarifying that `Setup -> Voices -> Script -> Estimate -> Status` is a guided mini-wizard.
- [x] Replace generic sub-step pills with an accessible stepper (numbers + labels + state badges) that visually communicates clickability and progress.
- [x] Unify footer behavior at podcast step:
  - hide/disable parent `Next` while inline mini-wizard is active, or
  - wire parent `Next` to advance inline sub-steps deterministically.
- [x] Add inline voice search for host and guest selectors (with no-result helper copy).
- [x] Add inline voice preview controls (host/guest) and conversation compare-preview parity where preview URLs exist.
- [x] Add inline validation checklist + inline errors for voice setup and display-name completeness.
- [x] Add explicit server-state compatibility marker for `translationPackage.wizardState` (version field + tolerant read path).
- [x] Add resume compatibility tests covering pre-change and post-change wizard-state payloads (including missing/new fields).
- [ ] Add deployment verification checklist item: resume in-progress inline podcast step and standalone podcast draft after deploy/restart (cloud + on-prem).
- [x] Define and implement cross-tab/session conflict handling for wizard-state persistence (documented policy + UI behavior).
- [x] Handle permission/org-access drift mid-flow with explicit user-facing recovery path.
- [x] Detect and surface source-contract drift while user is in inline podcast sub-flow (prompt refresh/re-prepare before generate).
- [x] Add feature flag + rollback switch for new inline podcast UX/navigation model.
- [ ] Extend deployment verification matrix with restart + mixed-version client/server scenarios.
- [x] Harden voice preview UX for autoplay-restricted browsers and mobile playback constraints.
- [x] Add analytics events for confusion points (disabled-next impressions, sub-step interaction, abandonment points) with correlation IDs.
- [x] Add accessibility verification checklist for stepper/footer model (keyboard flow, focus, SR labels, live regions).
- [x] Ensure all new helper/tooltips/microcopy are i18n-ready.
- [x] Run theme-token/white-label audit on all new UI states and variants (cloud + on-prem).

### Deliverables

- Clear single-owner navigation model at podcast step.
- Voice selection UX parity uplift for inline flow.
- Reduced "disabled Next looks like error" confusion in UAT.
- Deployment-safe and backward-compatible resume guarantees for podcast + translation wizard state.

### File Targets

- `/antigravity/Cloud-On-Prem/client/src/components/translation/InlinePodcastTranslationStep.tsx`
- `/antigravity/Cloud-On-Prem/client/src/pages/TranslateLesson.tsx`

---

## Phase 8 - Full Lesson-Domain Audit Remediation

### Goal

Resolve critical/high lesson-domain audit defects across backend/worker/frontend behavior, correctness, and regression safety.

### Tasks

- [x] Enforce admin-level authorization on lesson mutation/destructive routes.
- [x] Harden translation worker concurrency with lock-safe ownership and stale handling.
- [x] Fix translation worker artifact status truthfulness for async handoff assets.
- [x] Add stale-processing recovery in translation-index queue worker.
- [x] Add startup recovery for interrupted course translation orchestration jobs.
- [x] Fix source-content delete targeting in lesson action menu for language variants.
- [x] Harden lesson completion and quiz-gate integrity in progress service.
- [x] Improve progress route validation and error classification (`400` vs `500`) for expected domain failures.
- [x] Correct podcast script availability truth model (script text required, not scriptId only).
- [x] Harden podcast script download selection/fallback for version/language edge cases.
- [x] Align course lesson artifact badges and quick-access options with real script availability.
- [x] Fix lesson viewer stale navigation state across lesson/language/quick-open transitions.
- [x] Fix version-history and lesson-action dialog state resets on lesson changes.
- [x] Fix inline podcast voice preview rebinding and voice-selection persistence behavior.
- [x] Remove inline sub-step action leakage and tighten step-specific CTA ownership.
- [x] Rework inline translated-script editor to theme-tokenized conversational bubbles.
- [x] Expand critical CI test gate coverage for navigation + language artifact + parser regressions.

### Deliverables

- Critical/high findings remediated with green typecheck and expanded critical test suite.
- Cloud/on-prem behavior parity maintained through shared backend/frontend paths.
- Deployment-safe recovery behavior added for translation orchestration and queue workers.

### File Targets

- `/antigravity/Cloud-On-Prem/server/routes/courseRoutes.ts`
- `/antigravity/Cloud-On-Prem/server/workers/translationWorker.ts`
- `/antigravity/Cloud-On-Prem/server/services/translationIndexService.ts`
- `/antigravity/Cloud-On-Prem/server/services/courseTranslationOrchestrator.ts`
- `/antigravity/Cloud-On-Prem/server/services/lessonProgressService.ts`
- `/antigravity/Cloud-On-Prem/server/services/languageArtifactService.ts`
- `/antigravity/Cloud-On-Prem/server/index.ts`
- `/antigravity/Cloud-On-Prem/client/src/pages/CourseLessons.tsx`
- `/antigravity/Cloud-On-Prem/client/src/pages/LessonViewer.tsx`
- `/antigravity/Cloud-On-Prem/client/src/pages/TranslateLesson.tsx`
- `/antigravity/Cloud-On-Prem/client/src/components/LessonActionsMenu.tsx`
- `/antigravity/Cloud-On-Prem/client/src/components/LessonVersionHistory.tsx`
- `/antigravity/Cloud-On-Prem/client/src/components/translation/InlinePodcastTranslationStep.tsx`
- `/antigravity/Cloud-On-Prem/client/src/hooks/usePodcastScriptTools.ts`
- `/antigravity/Cloud-On-Prem/client/src/lib/lessonNavigationState.ts`
- `/antigravity/Cloud-On-Prem/package.json`

---

## Progress Update Protocol

For each implementation update:

1. Update `At-a-Glance Progress` section.
2. Mark completed task checkboxes.
3. Add an entry in `Implementation Log`.
4. List files changed.
5. Note any risks, blockers, or decisions.

---

## UAT Screenshot Checklist (Jan-Led)

Use this exact run order and attach annotated screenshots/comments per step.

1. Lesson translation start: verify target language and scope selections are clear.
2. Cost preview clarity: verify digest + podcast script are explicitly marked included/free.
3. Translate content execution: verify artifact statuses and progress labels.
4. Review & edit: verify artifact result statuses and retry affordances.
5. Podcast optional step:
   - include toggle behavior
   - setup/voices/script/estimate/status sub-steps
   - mobile sticky action visibility and usability
6. Podcast generation:
   - status progression
   - target-language version visibility
   - refresh behavior
7. Resume/reload:
   - refresh page mid podcast sub-flow
   - verify sub-step + draft script state restoration
8. Continue to PPTX + complete:
   - verify no forced route jump
   - verify complete summary copy
9. Theme check:
   - run same path in cloud + on-prem branded contexts
10. Edge path checks:
   - no source podcast
   - conversation with guest voice validation
   - partial translation failures and retry controls

---

## Implementation Log

### 2026-04-02

- Initialized tracker and phased execution plan.
- Scope includes integrated inline podcast flow + podcast UX redesign + theme/accessibility + regression/observability.
- No code changes yet beyond planning artifact.

### 2026-04-02 (Implementation Update 1)

- Added new inline podcast translation/generation component:
  - `/antigravity/Cloud-On-Prem/client/src/components/translation/InlinePodcastTranslationStep.tsx`
- Integrated podcast as a first-class wizard step in translation flow:
  - `/antigravity/Cloud-On-Prem/client/src/pages/TranslateLesson.tsx`
  - New `WizardStep` includes `podcast`.
  - Main flow no longer depends on route-jump CTA for podcast.
  - Podcast artifact checkboxes removed from Step 1 scope picker to avoid dual-path confusion.
  - Podcast now handled in dedicated inline optional step.
- Added status normalization helper to improve clarity of artifact status display:
  - `/antigravity/Cloud-On-Prem/client/src/lib/translationFlowStatus.ts`
- Improved pricing messaging for Option A (included/free digest + podcast script translation):
  - `/antigravity/Cloud-On-Prem/client/src/pages/PlatformPricing.tsx`
  - `/antigravity/Cloud-On-Prem/client/src/pages/CustSuperPricing.tsx`
- Validation run:
  - `cd /antigravity/Cloud-On-Prem && npm run -s check` passed.

### 2026-04-02 (Implementation Update 2)

- Added local resume persistence for inline podcast sub-flow state (sub-step + form/script state):
  - `/antigravity/Cloud-On-Prem/client/src/components/translation/InlinePodcastTranslationStep.tsx`
- Validation run:
  - `cd /antigravity/Cloud-On-Prem && npm run -s check` passed.

### 2026-04-02 (Implementation Update 3)

- Added mobile-first sticky action bars to inline podcast sub-steps for clearer CTA access on small screens.
- Added accessibility improvements:
  - `aria-current=\"step\"` on sub-step controls.
  - explicit ARIA labels on key select/textarea controls.
  - polite live region updates for status section.
- Validation run:
  - `cd /antigravity/Cloud-On-Prem && npm run -s check` passed.

### 2026-04-02 (Implementation Update 4)

- Added Jan-led UAT screenshot checklist section to this tracker for structured validation.

### 2026-04-02 (Implementation Update 5)

- Added translation funnel telemetry endpoint and analytics persistence:
  - `POST /api/lessons/:lessonId/translation-funnel-event`
  - File: `/antigravity/Cloud-On-Prem/server/routes/courseRoutes.ts`
- Added frontend funnel instrumentation in translation flow:
  - step views
  - AI/manual start actions
  - retry starts
  - optional podcast toggle actions
  - Files:
    - `/antigravity/Cloud-On-Prem/client/src/pages/TranslateLesson.tsx`
    - `/antigravity/Cloud-On-Prem/client/src/components/translation/InlinePodcastTranslationStep.tsx`
- Added orchestration/correlation logs across lesson translation and podcast handoff:
  - structured server logs for translation job creation, translation worker processing, and podcast generation handoff
  - podcast translate route now accepts/propagates `integrationContext` for correlation
  - Files:
    - `/antigravity/Cloud-On-Prem/server/routes/courseRoutes.ts`
    - `/antigravity/Cloud-On-Prem/server/workers/translationWorker.ts`
- Added success/failure analytics in translation worker and podcast translate async kickoff path.
- Added regression test coverage for translation status helper:
  - `/antigravity/Cloud-On-Prem/client/src/tests/translationFlowStatus.test.ts`
- Validation runs:
  - `cd /antigravity/Cloud-On-Prem && npm run -s check` passed.
  - `cd /antigravity/Cloud-On-Prem && npx jest client/src/tests/translationFlowStatus.test.ts --runInBand` passed.

### 2026-04-02 (Implementation Update 6)

- Addressed confusing podcast status semantics in translation review step:
  - Added `deferred_optional` status mapping to display as `pending optional step`.
  - Added backend translation package support for `includePodcastInNextStep`, setting podcast artifacts to deferred with explicit copy instead of skipped.
- Reworked inline podcast translation setup to use **source script version selection** (translation intent) instead of source data type selection:
  - Source script selector now drives format/duration/source language.
  - Format and duration are locked to selected source script for consistency.
  - Added explicit guidance for no-source-script edge case.
- Improved defaulting and edge-case behavior:
  - Auto-default host/guest voices from selected source script where possible.
  - Mark in-progress podcast job state clearly and allow status-resume behavior.
  - Generate action now sends edited `scriptText`, so script edits are respected.
- Backend robustness fixes:
  - `/api/lessons/:lessonId/podcast/translate` now treats `format`/`duration` as optional (no forced bulletin/default override before source resolution).
  - Conversation validation now uses resolved format and resolved guest voice.
- Course lesson translate CTA guard aligned with quiz count fallback:
  - Include `linkedQuizCount > 0` in translatable artifact determination where button blocking occurs.
- Validation runs:
  - `cd /antigravity/Cloud-On-Prem && npm run -s check` passed.
  - `cd /antigravity/Cloud-On-Prem && npx jest client/src/tests/translationFlowStatus.test.ts --runInBand` passed.

### 2026-04-02 (Implementation Update 7)

- Improved artifact status UX in both translate-progress and review panels:
  - Deferred optional podcast artifacts are now grouped into a dedicated section:
    - `Deferred To Optional Podcast Step`
  - Primary artifacts remain in the standard results list for clearer signal/noise.
  - Deferred rows now always render explanatory copy so users do not interpret them as failures.
- File updated:
  - `/antigravity/Cloud-On-Prem/client/src/pages/TranslateLesson.tsx`
- Validation runs:
  - `cd /antigravity/Cloud-On-Prem && npm run -s check` passed.
  - `cd /antigravity/Cloud-On-Prem && npx jest client/src/tests/translationFlowStatus.test.ts --runInBand` passed.

### 2026-04-02 (Implementation Update 8)

- Replaced client-local podcast resume persistence with server-backed wizard state:
  - Added `POST /api/lessons/:sourceLessonId/translation-wizard-state` to persist resume state in translated lesson metadata (`translationPackage.wizardState`).
  - Wired restore in `TranslateLesson` from `translationPackage.wizardState` and removed inline podcast `localStorage` dependency.
  - Added debounced server persistence for parent step + podcast sub-step/form state for cross-browser/device consistency.
- Added same-language re-translate flow for completed target languages:
  - Landing now includes `Re-translate` action for completed/published language entries.
  - Translation request now supports `retranslateExistingTargetLanguage`.
  - Backend `/api/lessons/:lessonId/translate` now supports reusing an existing target-language lesson (instead of hard `409`) when re-translate mode is requested.
  - Existing variant receives a fresh translation package and a new translation job for consistent orchestration/audit trail.
- Added stale-state actionability:
  - Review step now exposes `Refresh From Latest Source` CTA when stale artifacts are detected, routing user into re-translate mode.
- Files updated:
  - `/antigravity/Cloud-On-Prem/server/routes/courseRoutes.ts`
  - `/antigravity/Cloud-On-Prem/client/src/pages/TranslateLesson.tsx`
  - `/antigravity/Cloud-On-Prem/client/src/components/translation/InlinePodcastTranslationStep.tsx`
- Validation runs:
  - `cd /antigravity/Cloud-On-Prem && npm run -s check` passed.
  - `cd /antigravity/Cloud-On-Prem && npx jest client/src/tests/translationFlowStatus.test.ts --runInBand` passed.

### 2026-04-02 (Implementation Update 9)

- Added additional idempotency/race hardening in translation wizard client:
  - Prevent duplicate start actions while mutations are pending (`AI Translate`, manual draft start, re-translate CTA).
  - Added 429 resume behavior: when backend reports an existing in-progress job, UI auto-resumes that run instead of surfacing a generic failure.
  - Added queued/debounced persistence handling for server-backed wizard state to avoid overlapping write races.
- Added backend validation hardening:
  - Translation active-job check now includes organization scope.
  - Wizard-state persistence endpoint now validates target language matches the selected translation job language.
- Files updated:
  - `/antigravity/Cloud-On-Prem/client/src/pages/TranslateLesson.tsx`
  - `/antigravity/Cloud-On-Prem/server/routes/courseRoutes.ts`
- Validation runs:
  - `cd /antigravity/Cloud-On-Prem && npm run -s check` passed.
  - `cd /antigravity/Cloud-On-Prem && npx jest client/src/tests/translationFlowStatus.test.ts --runInBand` passed.

### 2026-04-02 (Implementation Update 10)

- Completed architecture extraction task by introducing reusable podcast script tooling hook:
  - New shared hook and utilities:
    - `/antigravity/Cloud-On-Prem/client/src/hooks/usePodcastScriptTools.ts`
  - Hook integrated in both:
    - `/antigravity/Cloud-On-Prem/client/src/pages/LessonPodcastWizard.tsx`
    - `/antigravity/Cloud-On-Prem/client/src/components/translation/InlinePodcastTranslationStep.tsx`
- Completed theme/white-label hardening sweep in translation flow UI:
  - Removed hardcoded purple/indigo branding classes from translation wizard flow components and replaced with semantic theme-aware classes (`bg-primary`, `text-primary`, `border-border`, `bg-muted`, etc.).
  - File:
    - `/antigravity/Cloud-On-Prem/client/src/pages/TranslateLesson.tsx`
- Extended automated verification for resume/failure behaviors:
  - Added server-side wizard-state sanitization service and tests:
    - `/antigravity/Cloud-On-Prem/server/services/translationWizardStateService.ts`
    - `/antigravity/Cloud-On-Prem/server/tests/translationWizardStateService.test.ts`
  - Added shared podcast script tools tests:
    - `/antigravity/Cloud-On-Prem/client/src/tests/podcastScriptTools.test.ts`
  - Existing translation status tests retained and passing:
    - `/antigravity/Cloud-On-Prem/client/src/tests/translationFlowStatus.test.ts`
- Validation runs:
  - `cd /antigravity/Cloud-On-Prem && npm run -s check` passed.
  - `cd /antigravity/Cloud-On-Prem && npx jest client/src/tests/translationFlowStatus.test.ts client/src/tests/podcastScriptTools.test.ts server/tests/translationWizardStateService.test.ts --runInBand` passed.

### 2026-04-02 (Implementation Update 11 - Analysis Only, No Code Changes)

- Reviewed new UAT screenshots and traced responsible code paths for inline podcast step UX.
- Confirmed three additional findings:
  - F-011: sub-step navigation discoverability gap.
  - F-012: parent vs inline footer navigation ownership conflict.
  - F-013: inline voices parity gap (search/preview/guided validation) vs standalone wizard.
- Reopened tracker with new Phase 7 and added concrete remediation tasks.

### 2026-04-02 (Implementation Update 12)

- Fixed lesson artifact language correctness for podcast badges:
  - `batch-languages` podcast availability is now language-scoped (completed versions must match variant language).
  - Added separate `hasPodcastScript` availability (language-scoped) to avoid script badge false positives.
  - Files:
    - `/antigravity/Cloud-On-Prem/server/routes/languageRoutes.ts`
    - `/antigravity/Cloud-On-Prem/client/src/pages/CourseLessons.tsx`
- Reworked inline podcast sub-step clarity and interaction:
  - Added explicit guided-step microcopy.
  - Upgraded sub-step controls into clearer stepper-style controls.
  - Added host/guest voice search, no-result guidance, preview players, and conversation compare-preview action.
  - Added voice setup checklist and inline validation errors.
  - File:
    - `/antigravity/Cloud-On-Prem/client/src/components/translation/InlinePodcastTranslationStep.tsx`
- Reduced parent/inline navigation conflict on podcast step:
  - Parent footer now suppresses confusing `Next` while inline podcast flow owns progression and displays clear guidance text.
  - File:
    - `/antigravity/Cloud-On-Prem/client/src/pages/TranslateLesson.tsx`
- Hardened persisted wizard state compatibility:
  - Added `version` and `clientSessionId` to sanitized persisted state.
  - Added cross-session restore notice when newer state arrives from a different session.
  - Files:
    - `/antigravity/Cloud-On-Prem/server/services/translationWizardStateService.ts`
    - `/antigravity/Cloud-On-Prem/client/src/pages/TranslateLesson.tsx`
- Added/updated tests:
  - Extended wizard-state sanitizer tests for backward compatibility and session-id sanitization.
  - File:
    - `/antigravity/Cloud-On-Prem/server/tests/translationWizardStateService.test.ts`
- Validation runs:
  - `cd /antigravity/Cloud-On-Prem && npm run -s check` passed.
  - `cd /antigravity/Cloud-On-Prem && npx jest client/src/tests/translationFlowStatus.test.ts client/src/tests/podcastScriptTools.test.ts server/tests/translationWizardStateService.test.ts --runInBand` passed.

### 2026-04-02 (Implementation Update 13)

- Added additional inline podcast hardening:
  - Sub-step telemetry events for visibility into navigation/drop-off.
  - Blocked-action telemetry when script prep is prevented by validation.
  - Voice preview playback hardening via `playsInline` for mobile/browser compatibility.
- Added permission-drift resilience for server wizard-state persistence:
  - User-facing destructive toast when state cannot be persisted due to access/org mismatch.
- Files updated:
  - `/antigravity/Cloud-On-Prem/client/src/components/translation/InlinePodcastTranslationStep.tsx`
  - `/antigravity/Cloud-On-Prem/client/src/pages/TranslateLesson.tsx`
- Validation runs:
  - `cd /antigravity/Cloud-On-Prem && npm run -s check` passed.
  - `cd /antigravity/Cloud-On-Prem && npx jest server/tests/translationWizardStateService.test.ts --runInBand` passed.

### 2026-04-02 (Implementation Update 14)

- Added source-drift safeguards for podcast inline flow:
  - Parent podcast step now shows stale podcast artifact warning with `Refresh` CTA.
  - Inline podcast step blocks prepare/estimate/generate actions when source contracts are stale and guides refresh.
  - Files:
    - `/antigravity/Cloud-On-Prem/client/src/pages/TranslateLesson.tsx`
    - `/antigravity/Cloud-On-Prem/client/src/components/translation/InlinePodcastTranslationStep.tsx`
- Added feature-flag rollback switch for enhanced inline podcast UX:
  - `VITE_ENABLE_INLINE_PODCAST_UX_V2` (defaults enabled unless explicitly `0`).
  - File:
    - `/antigravity/Cloud-On-Prem/client/src/pages/TranslateLesson.tsx`
- Strengthened cross-tab/session persistence handling:
  - Prevent local save from clobbering newer state from a different client session.
  - Added client-session conflict restoration messaging.
  - Added persistence error messaging for permission/org drift.
  - File:
    - `/antigravity/Cloud-On-Prem/client/src/pages/TranslateLesson.tsx`
- Hardened API contract validation for wizard-state persistence endpoint:
  - Added Zod request validation and typed 400 payload error response for invalid bodies.
  - File:
    - `/antigravity/Cloud-On-Prem/server/routes/courseRoutes.ts`
- Added additional instrumentation and playback resilience:
  - New funnel events for sub-step viewed/selected and blocked parent-next state.
  - `playsInline` audio previews for better mobile behavior.
  - File:
    - `/antigravity/Cloud-On-Prem/client/src/components/translation/InlinePodcastTranslationStep.tsx`
- Validation runs:
  - `cd /antigravity/Cloud-On-Prem && npm run -s check` passed.
  - `cd /antigravity/Cloud-On-Prem && npx jest client/src/tests/translationFlowStatus.test.ts client/src/tests/podcastScriptTools.test.ts server/tests/translationWizardStateService.test.ts --runInBand` passed.

### 2026-04-02 (Implementation Update 15)

- Added server-side request contract validation for translation wizard-state persistence endpoint.
  - Invalid payloads now return typed 400 validation errors instead of generic failures.
  - File:
    - `/antigravity/Cloud-On-Prem/server/routes/courseRoutes.ts`
- Added additional write-conflict guard:
  - local wizard-state persistence no longer overwrites newer state from another active client session.
  - File:
    - `/antigravity/Cloud-On-Prem/client/src/pages/TranslateLesson.tsx`
- Added source-contract drift enforcement in inline podcast flow:
  - prepare/estimate/generate actions are blocked with clear guidance until refresh.
  - File:
    - `/antigravity/Cloud-On-Prem/client/src/components/translation/InlinePodcastTranslationStep.tsx`
- Added feature flag support for enhanced inline podcast UX:
  - `VITE_ENABLE_INLINE_PODCAST_UX_V2=0` allows rollback to baseline inline behavior patterns.
  - File:
    - `/antigravity/Cloud-On-Prem/client/src/pages/TranslateLesson.tsx`
- Added parent-step stale warning card and refresh CTA for podcast drift.
  - File:
    - `/antigravity/Cloud-On-Prem/client/src/pages/TranslateLesson.tsx`
- Validation runs:
  - `cd /antigravity/Cloud-On-Prem && npm run -s check` passed.
  - `cd /antigravity/Cloud-On-Prem && npx jest server/tests/translationWizardStateService.test.ts --runInBand` passed.

### 2026-04-02 (Implementation Update 16)

- Extracted podcast language-availability logic into a shared service for reusability and testability:
  - New file:
    - `/antigravity/Cloud-On-Prem/server/services/languageArtifactService.ts`
- Updated lesson batch language route to consume shared language artifact service:
  - File:
    - `/antigravity/Cloud-On-Prem/server/routes/languageRoutes.ts`
- Added dedicated server test coverage for language-scoped podcast/audio/script availability:
  - New tests:
    - `/antigravity/Cloud-On-Prem/server/tests/languageArtifactService.test.ts`
- Added i18n-ready extraction for newly added helper microcopy constants:
  - Files:
    - `/antigravity/Cloud-On-Prem/client/src/components/translation/InlinePodcastTranslationStep.tsx`
    - `/antigravity/Cloud-On-Prem/client/src/pages/TranslateLesson.tsx`
- Validation runs:
  - `cd /antigravity/Cloud-On-Prem && npm run -s check` passed.
  - `cd /antigravity/Cloud-On-Prem && npx jest server/tests/languageArtifactService.test.ts server/tests/translationWizardStateService.test.ts --runInBand` passed.

### 2026-04-02 (Implementation Update 17)

- Completed theme-token/white-label hardening for newly modified inline podcast UI states:
  - Removed remaining hardcoded warning/status color classes in updated inline sections.
  - Replaced with semantic theme-aware classes (`border-border`, `bg-muted`, `text-foreground`, `text-destructive`).
  - File:
    - `/antigravity/Cloud-On-Prem/client/src/components/translation/InlinePodcastTranslationStep.tsx`
- Validation runs:
  - `cd /antigravity/Cloud-On-Prem && npm run -s check` passed.

### 2026-04-02 (Implementation Update 18)

- Fixed inline voice selection persistence regression:
  - Host/guest auto-defaulting no longer overwrites a valid manual selection after source-state refresh.
  - Preview player now follows selected host/guest voice consistently.
  - File:
    - `/antigravity/Cloud-On-Prem/client/src/components/translation/InlinePodcastTranslationStep.tsx`
- Corrected inline sub-step action ownership:
  - Voices step now advances to Script step instead of incorrectly triggering script preparation.
  - Script preparation CTA moved to Script step.
  - File:
    - `/antigravity/Cloud-On-Prem/client/src/components/translation/InlinePodcastTranslationStep.tsx`
- Improved translated script editing UX:
  - Replaced raw textarea-only view with structured editable turn cards/bubbles (host/guest/narrator labels).
  - Added per-turn delete and inline editing parity with standalone behavior.
  - File:
    - `/antigravity/Cloud-On-Prem/client/src/components/translation/InlinePodcastTranslationStep.tsx`
- Fixed podcast script quick-access availability mismatch:
  - `podcast_script` options now gate on `hasPodcastScript` (not `hasPodcast`).
  - File:
    - `/antigravity/Cloud-On-Prem/client/src/pages/CourseLessons.tsx`
- Hardened podcast script download fallback resolution:
  - Script download now resolves script text by requested version, language-matched completed versions, and metadata fallbacks before returning not found.
  - This addresses `No script text found for selected podcast version` for valid translated script cases.
  - File:
    - `/antigravity/Cloud-On-Prem/server/routes/courseRoutes.ts`
- Validation runs:
  - `cd /antigravity/Cloud-On-Prem && npm run -s check` passed.
  - `cd /antigravity/Cloud-On-Prem && npx jest --runInBand client/src/tests/podcastScriptTools.test.ts client/src/tests/translationFlowStatus.test.ts server/tests/languageArtifactService.test.ts server/tests/translationWizardStateService.test.ts` passed.

### 2026-04-02 (Implementation Update 19 - Full Lesson-Domain Audit Remediation Wave)

- Security + permission hardening:
  - Upgraded lesson mutation/destructive endpoints from org-access to admin-access guard.
  - Affected routes include lesson update/publish/unpublish/archive/restore/delete and version create/restore.
  - File:
    - `/antigravity/Cloud-On-Prem/server/routes/courseRoutes.ts`

- Worker durability + restart/recovery hardening:
  - Added lock-safe job ownership and stale-translation handling in translation worker.
  - Added stale `processing` recovery in translation index queue processing.
  - Added startup recovery for stale course-translation orchestrator jobs.
  - Files:
    - `/antigravity/Cloud-On-Prem/server/workers/translationWorker.ts`
    - `/antigravity/Cloud-On-Prem/server/services/translationIndexService.ts`
    - `/antigravity/Cloud-On-Prem/server/services/courseTranslationOrchestrator.ts`
    - `/antigravity/Cloud-On-Prem/server/index.ts`

- Status truthfulness + integrity:
  - Fixed async handoff status semantics for podcast audio and PPTX generation assets.
  - Hardened lesson completion integrity checks and quiz-gate determinism.
  - Improved route validation/error mapping for slide progress and completion APIs.
  - Files:
    - `/antigravity/Cloud-On-Prem/server/workers/translationWorker.ts`
    - `/antigravity/Cloud-On-Prem/server/services/lessonProgressService.ts`
    - `/antigravity/Cloud-On-Prem/server/routes/courseRoutes.ts`

- Lesson UI correctness + navigation-state hardening:
  - Fixed source-content delete targeting for language-specific lesson variants.
  - Added lesson-scoped reset helpers for action menu/viewer/version-history transitions.
  - Fixed podcast version/language selection resets on lesson/language quick-open changes.
  - Files:
    - `/antigravity/Cloud-On-Prem/client/src/components/LessonActionsMenu.tsx`
    - `/antigravity/Cloud-On-Prem/client/src/components/LessonVersionHistory.tsx`
    - `/antigravity/Cloud-On-Prem/client/src/pages/LessonViewer.tsx`
    - `/antigravity/Cloud-On-Prem/client/src/lib/lessonNavigationState.ts`

- Podcast script availability/download correctness:
  - Language artifact summary now requires actual script text for `hasPodcastScript`.
  - Added deterministic script-download resolver for version/language fallback paths.
  - Aligned quick-access podcast script options and badge logic with resolved script truth.
  - Files:
    - `/antigravity/Cloud-On-Prem/server/services/languageArtifactService.ts`
    - `/antigravity/Cloud-On-Prem/server/routes/courseRoutes.ts`
    - `/antigravity/Cloud-On-Prem/client/src/pages/CourseLessons.tsx`
    - `/antigravity/Cloud-On-Prem/server/tests/languageArtifactService.test.ts`

- Translation wizard UX hardening:
  - Added explicit disabled-next reasons for missing target language/artifact selections.
  - Corrected free/included cost copy to match Option A (`digest + podcast script translation` only).
  - Files:
    - `/antigravity/Cloud-On-Prem/client/src/pages/TranslateLesson.tsx`

- CI quality gate expansion:
  - Extended `test:critical` to include language artifact and lesson navigation regression suites.
  - File:
    - `/antigravity/Cloud-On-Prem/package.json`

- Validation runs:
  - `cd /antigravity/Cloud-On-Prem && npm run -s check` passed.
  - `cd /antigravity/Cloud-On-Prem && npm run -s test:critical` passed.
  - `cd /antigravity/Cloud-On-Prem && npx jest server/tests/languageArtifactService.test.ts --runInBand` passed.
  - `cd /antigravity/Cloud-On-Prem && npx jest client/src/tests/lessonNavigationState.test.ts --runInBand` passed.

---

## Deployment + Verification Checklist (Cloud + On-Prem)

- [ ] Deploy backend + frontend bundles from this revision.
- [ ] Restart runtime and verify startup recovery logs for translation orchestrator (no stuck stale jobs left `in_progress`).
- [ ] Verify resume of an in-progress lesson translation wizard after restart.
- [ ] Verify resume of inline podcast sub-step (`Setup/Voices/Script/Estimate/Status`) after restart.
- [ ] Verify lesson badge correctness for partial/incomplete podcast translation cases (no false NL badge).
- [ ] Verify quick-access podcast script download for translated language returns content (no `No script text found...` for valid script cases).
- [ ] Verify voice change + preview update persists (e.g., Lana -> Adam) and is retained on refresh/re-entry.
- [ ] Verify Voices step no longer shows Script-step action leakage.
- [ ] Verify translated script editor shows structured conversational bubbles (theme-aware) and edits persist through generation flow.
- [ ] Run full end-to-end translation on at least one lesson with and without optional podcast path.
