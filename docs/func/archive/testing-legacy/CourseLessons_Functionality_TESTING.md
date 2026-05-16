# Course Lessons Functionality Testing

## About
This document defines validation steps for impersonation-aware lesson access and course health endpoint behavior in Course Lessons workflows.

## Feature Index
1. Lesson details load under impersonation
2. Translation wizard state loads under impersonation
3. Cross-org linked lesson access guard
4. Course health endpoint correctness
5. Inline non-modal management workflows render and operate correctly on mobile/desktop
6. Quiz Wizard source-selection gate and source-contract generation

## Preconditions and Required Test Data
- SuperAdmin or CustSuper account able to impersonate an organization.
- Course with linked lessons in target organization.
- Optional: lesson linked from a different owning organization into target organization.

## Detailed Testing Steps
1. Impersonation lesson detail access
- Impersonate target organization.
- Open course lessons page and wait for lesson cards/details.
- Expected: no 403 for `GET /api/lessons/:lessonId?...` for accessible lessons.

2. Impersonation translation-state access
- With impersonation active, open course lessons page where translation status is queried.
- Expected: no 403 for `GET /api/lessons/:lessonId/translation-wizard-state?...` for accessible lessons.

3. Cross-org linkage safety
- If a lesson owner org differs from requested org, verify access only when lesson is linked to a course in requested org.
- Expected: linked lessons load; unlinked out-of-scope lessons remain denied.

4. Impersonation draft creation resilience (AI-assisted course builder)
- As SuperAdmin/CustSuper, switch impersonation context to organization A.
- Navigate to `Create Course -> AI-Assisted` and click `Start AI-Assisted Course`.
- Repeat after switching impersonation to organization B without full page reload.
- Expected:
  - `POST /api/courses/drafts` succeeds under current effective impersonation org.
  - no false `Access denied: Cannot create drafts for other organizations` due to stale client org payload.

5. Course health endpoint
- Open browser network panel on course lessons page.
- Expected: health call is `GET /api/courses/:courseId/health` and no stale `GET /api/content/:courseId/lessons/health` 404s.

6. Inline workflow behavior (no modal overlays)
- Open course/lesson management actions (publish checks, assignment flow, lesson relink/remove confirmations, feedback/report flows) from course lessons and course management pages.
- Confirm actions render inline in-page panels/cards and remain usable on `320px`, `375px`, and desktop widths.
- Expected: no modal/dialog overlay blocks the page; actions remain keyboard/touch accessible and complete successfully.

7. Lesson Content Studio page flow
- From Course Lessons, open a lesson action menu and choose `View Lesson Content (DB)`.
- Confirm navigation to `/lessons/:lessonId/content-studio` (full page, no modal overlay).
- Validate version selection, compare mode, feedback preview, save changes, and delete confirmation behavior.
- Expected: content tools are available in-page with enough space for long content and controls on both mobile and desktop.

8. Initial vs Current source-content semantics (per language)
- Open a lesson/language in Lesson Content Studio where source content has prior edits/versions.
- Confirm version selector includes `Current Version (Active)` and `Initial Version`.
- Select `Initial Version`, click `Set As Current`, then refresh page.
- Expected: current editor content now matches initial version text for that language and persists after refresh.

9. Feedback contract and inline flow validation
- From lesson actions menu click `Get Feedback`.
- Confirm navigation to full-page Content Studio (no modal confirmation) and quick feedback auto-runs when content is present.
- In Content Studio switch feedback mode to `Deep Review` and `Compare Review`, run feedback each time.
- Expected: server accepts requests in all modes, feedback score/summary render correctly, and no silent no-op occurs.

10. Visual diff and version timestamp validation
- In Compare Mode, select two clearly different versions.
- Confirm both panes show obvious diff styling:
  - added lines on target side,
  - removed lines on base side,
  - changed lines with inline token highlights on both sides.
- Confirm scroll synchronization between base/target panes.
- Confirm summary badges (`added`, `removed`, `changed`) update correctly.
- Toggle `Show Changed Only` and verify unchanged lines are hidden.
- Use `Previous Change`/`Next Change` buttons and verify viewport jumps through diff blocks.
- Confirm version dropdown/options and compare headers show date/time timestamps for each version.

11. Actionable feedback apply flow
- In Lesson Content Studio (Current Version + Edit Mode), click `Get Feedback`.
- Confirm `Actionable Recommendations` list appears with per-item `Apply This Fix` buttons.
- Click one `Apply This Fix` action.
- Expected:
  - content is updated in Source DB,
  - change is saved as a new content version with `feedback_fix` source,
  - editor remains on `Current Version (Active)`,
  - feedback panel clears for re-run on updated content.
- Re-open version selector/history and confirm the new version entry exists and can be compared/restored.

11b. Version-scoped feedback persistence and reload
- In Lesson Content Studio, run `Get Feedback` on `Current Version (Active)`.
- Navigate back to Course Lessons, then re-open the same lesson/language Studio view.
- Expected:
  - previous feedback run reloads for that selected version without forcing re-run,
  - relevance-audit items and prior item decisions are visible,
  - if source content changed since the run, stale warning appears and apply is blocked until a new feedback run.

11c. User-controlled relevance-audit apply
- Run feedback and open `Relevance Audit (User-controlled)`.
- Select only a subset of items (leave at least one unselected), then click `Apply Selected Fixes`.
- Expected:
  - only selected excerpts are removed/updated,
  - unselected items remain unchanged,
  - result is saved as a new Source DB version (`feedback_fix`),
  - item decisions persist (`accepted/rejected/ignored/applied`) for that feedback run.

12. Quiz Wizard source selection and enforced generation contract
- From Course Lessons, open a lesson menu and choose `Generate Quiz (AI)`.
- Confirm Wizard starts on `Select Source` step with available options including versioned Source DB and PPTX entries (plus Word/Podcast/manual-topic when available).
- Select a non-default source version (for example `Source DB - Initial Version`), continue to Criteria, then generate questions.
- Expected:
  - generation succeeds only after source selection,
  - backend uses selected source contract (no silent fallback),
  - if selected source content is unavailable, request fails with clear error instead of generating from another source.
- Repeat with `PPTX - Version ...` and confirm generation still succeeds when selected version exists.

13. Regenerate question/answers must remain source-grounded
- In Quiz Wizard review step for a lesson-linked quiz, click `Regenerate Question` on one item.
- Expected:
  - request includes `lessonId` and `sourceSelection`,
  - regeneration succeeds only when selected source has usable content,
  - manual-topic source is rejected for lesson-linked regeneration.
- For a multiple-choice item, click `Regenerate Answers`.
- Expected:
  - regenerated answers are sourced from selected source context,
  - if grounding validation fails repeatedly, endpoint returns explicit failure (no ungrounded fallback).

14. Lesson-linked quiz publish return navigation
- From Course Lessons lesson menu, open `Generate Quiz (AI)`, complete wizard, and click `Publish Quiz`.
- Expected:
  - after successful publish, user is redirected back to the same Course Lessons page (`/course-builder/:courseId/lessons` or provided `returnTo` path),
  - user is not redirected to `/quiz-drafts` for lesson-linked flows.
- Click `Cancel` in wizard for lesson-linked flow.
- Expected: Cancel also returns to the originating Course Lessons page.

15. Bloom objectives action + inline card editing
- On a content lesson card open lesson action menu and confirm `Set Learning Objectives` is present.
- Click it.
- Expected: the selected lesson card expands inline objective editor (no modal dependency), showing objective rows with Bloom level selector + objective text.
- Add, edit, and remove objectives; then click `Save Objectives`.
- Expected:
  - objectives persist after refresh,
  - objective summary and Bloom-level badges are visible on the lesson card,
  - updates reflect on course framework/topic linkage for the selected lesson.

16. Translation preflight + selectable content package
- Open lesson translation route from Course Lessons.
- Expected:
  - preflight availability reflects actual lesson assets (source db, word docs, quiz, podcast, pptx),
  - user can select/deselect content types to translate,
  - dynamic selected-credit estimate updates with selections.

17. Selection-driven translation execution + per-asset status
- Start translation with mixed selection (example: Source DB + Quiz + Podcast Script + PPTX).
- Expected:
  - `POST /api/lessons/:lessonId/translate` includes `translationOptions`,
  - worker follows selected assets only,
  - translation status polling includes package asset statuses (`processing/completed/failed/skipped`) and errors when present,
  - partial failures do not erase completed asset outcomes.

18. Translation versions API extended coverage
- Call `GET /api/lessons/:lessonId/translation-versions?organizationId=...`.
- Expected:
  - response includes `podcastVersions` and `sourceDocVersions` in addition to text/pptx/quiz version data.

19. Gamma PPTX immediate view/download readiness
- Generate/regenerate a lesson PPTX via Gamma.
- As soon as card status moves to completed, open lesson `View` and trigger `Download PPTX` from lesson actions.
- Expected:
  - no false `Lesson not yet generated` state when PPTX/version exists,
  - no `No PPTX available` false-negative when presentation was already stored/versioned,
  - if finalization is still in progress, UI reports a "still being finalized" style message instead of false missing-content messaging.

20. Quiz source selection visual clarity
- Open Quiz Wizard Step 1 (Select Source), click a source card.
- Expected:
  - selected source has high-contrast selected treatment (ring/background/accent rail),
  - explicit `Selected` badge appears,
  - selected state remains obvious on desktop and mobile widths.

21. Quiz Wizard strict-grounding failure UX and back navigation stability
- Open a lesson-linked quiz draft on Step 3 and trigger generation with a source likely to fail strict grounding validation.
- Expected:
  - API failure is shown inline in Step 3 with actionable guidance (not only a transient toast),
  - wizard stays interactive and does not appear complete/stuck,
  - pressing `Back` moves to prior step and remains there (no immediate snap-forward from draft refetch).

22. Course framework PDF upload and extraction (large document)
- In `Create Course from Documents`, upload a PDF (including a large, indexed PDF).
- Expected:
  - upload is accepted in Step 1 and extraction progresses to `Ready`,
  - extracted content can be used in topic analysis/framework generation,
  - section/page-derived structure is available for assignment and downstream generation,
  - on Node 18 runtimes, `pdftotext` fallback extraction still succeeds for text PDFs (no false image-only failure),
  - if PDF is scanned/image-only and text is not extractable, failure is explicit with retry guidance.

23. DOCX numbered-section grounding and fail-open framework generation
- Upload a DOCX containing numbered top-level topics and sub-sections (for example `1 ...`, `1.1 ...`, `2 ...`).
- Generate framework.
- Expected:
  - top-level numbered headings are used as topic boundaries for source assignment,
  - topic content starts under each numbered heading and ends before the next top-level numbered heading,
  - framework generation still completes even when strict heading assignment cannot be perfectly grounded, with warning metadata surfaced instead of hard failure.

24. Impersonation scoping for AI helper endpoints
- Start a SuperAdmin impersonation session for Org A.
- Call:
  - `POST /api/ai/generate-quiz-metadata`
  - `POST /api/ai/generate-lesson-topics`
  - `POST /api/ai/generate-lesson-description`
  with a mismatched body `organizationId` for Org B.
- Expected:
  - requests are resolved against effective impersonated org (Org A),
  - no false cross-org behavior occurs,
  - mismatch is tolerated safely (server logs warning and uses effective org scope).

25. Impersonation-aware usage-limit organization resolution
- Start SuperAdmin impersonation session for Org A where usage/plan differs from Org B.
- Trigger a route guarded by quiz/AI usage limit middleware.
- Expected:
  - limit checks run against Org A (effective org),
  - response and counters match Org A package/usage state,
  - no fallback to `userRoles[0]` organization.

26. `/api/user/roles` effective-org bootstrap in document wizard
- Start impersonation for Org A.
- Open `Create Course -> AI-Assisted Course` and trigger draft creation.
- Expected:
  - client uses `effectiveOrganizationId`/`defaultOrganizationId` before first-org fallback,
  - draft create succeeds without stale-org 403 behavior,
  - resulting draft belongs to effective impersonated organization.

27. Feedback completion step progression without apply/save
- From Course Lessons, open `Get Feedback` for a content lesson that already has saved source content.
- In Lesson Content Studio, run feedback (`Quick Review` or `Deep Review`) and wait for successful score/report response.
- Do not click `Apply This Fix` and do not edit/save content.
- Click `Back` to return to Course Lessons.
- Expected:
  - lesson card no longer remains on `Step 2/7: Get feedback`,
  - `hasFeedback`-driven step logic advances using persisted feedback metadata,
  - behavior is consistent on both cloud and onprem variants.

28. Lesson-card AI objective generation with Bloom-level selection
- In Course Lessons, open a content lesson `Edit Objectives`.
- Select a Bloom level from the inline objective-generation selector (for example `Apply`).
- Click `Generate Objectives`.
- Expected:
  - AI-generated objectives are appended into the editable objective list,
  - generated rows inherit the selected Bloom level,
  - user can further edit text/levels and add/remove manual rows before save.

29. Objective visibility fallback consistency
- Use a lesson where framework topic objectives are empty/missing but linked lesson objectives exist.
- Open Course Lessons and inspect objective panel on the lesson card.
- Expected:
  - objective panel still shows lesson objectives via course-linked fallback hydration,
  - `Edit Objectives` opens with those fallback rows preloaded,
  - saving objectives updates framework + course link and subsequent refresh remains consistent.

30. Canonical current/initial version identity and timestamp stability
- Open Lesson Content Studio for a lesson with content history.
- In the source version selector, verify `Current Version (Active)` and `Initial Version` are present and selectable.
- Switch between versions, return to `Current Version (Active)`, and refresh the page.
- Expected:
  - `Current Version (Active)` always resolves correctly (no phantom duplicate "current-..." behavior),
  - timestamp is shown consistently (no `Unknown time` for active/current),
  - apply-action controls remain correctly enabled only when current is selected.

31. Source-document metadata for version-aware UIs
- Call `GET /api/lessons/:lessonId/source-document?organizationId=...` for an existing lesson.
- Expected:
  - response includes `languageCode`,
  - response includes `updatedAt`,
  - values are non-empty for normal lessons and usable by UI timestamp/language badges.

## Negative/Edge Cases
- Impersonation with organization outside allowed scope must return 403.
- Missing lesson IDs return 404 without hanging UI.
- Translation-state request without `organizationId` returns 400.
- Selecting a removed/stale source version must fail with explicit validation error and must not silently use current content.
- Lesson-linked generation without `sourceSelection` must return HTTP 400.
- Lesson-linked regenerate-question/regenerate-answers without `sourceSelection` must return HTTP 400.
- Lesson-linked generation/regeneration with `manual_topic` must return HTTP 400.
- Lesson-linked generation/regeneration with empty selected source content must return HTTP 400.
- Lesson-linked publish flow must not route to `/quiz-drafts` when course/return context is present.
- Translation package with no selected content must be blocked in UI before start.
- If podcast audio generation is selected but valid voice context is missing, podcast asset fails cleanly while other selected assets complete.
- Applying selected relevance items against stale feedback/content hash must return explicit stale error and must not mutate lesson content.
- Synthetic version alias handling (`current`/`current-*`, `initial`/`initial-*`) must not break timestamp lookup or version matching in UI logic.

## Change Summary
- 2026-03-31: Added regression coverage for canonical `current`/`initial` source-version identity behavior, active-version timestamp stability (no `Unknown time` regressions), and source-document metadata (`languageCode`, `updatedAt`) required by version-aware lesson UIs.
- 2026-03-27: Added impersonation draft-creation regression coverage for AI-assisted course builder start flow across org switches without full reload.
- 2026-03-27: Added regression coverage for impersonation-scoped AI helper endpoint org resolution, effective-org usage-limit checks, and `/api/user/roles` effective-org client bootstrap behavior.
- 2026-03-27: Added regression coverage for Source Content Studio feedback completion persistence so Course Lessons step progression advances after successful feedback generation even when no fix is applied and no content save is performed.
- 2026-03-27: Added test coverage for lesson-card Bloom-level AI objective generation in `Edit Objectives` and for objective visibility fallback when framework topic objective arrays are missing but linked lesson objectives exist.
- 2026-03-27: Added coverage for version-scoped Source DB feedback persistence/reload, stale-run guard behavior, and user-controlled relevance-audit selection apply flow with persisted item decisions.
- 2026-03-27: Added regression coverage for Node 18 `pdftotext` fallback extraction to ensure text PDFs do not fail as false image-only/empty-content uploads.
- 2026-03-27: Added regression coverage for Quiz Wizard strict-grounding failure UX (inline actionable error) and step-navigation stability under draft refetch/autosave.
- 2026-03-27: Added validation coverage for PDF ingestion in course framework flow (initial upload and lesson supplement), including large indexed PDFs and image-only extraction failure handling.
- 2026-03-27: Added regression coverage for DOCX numbered-section grounding and fail-open framework creation behavior when strict structured assignment is not possible.
- 2026-03-27: Added regression coverage for Gamma PPTX immediate readiness (view/download), stale/false-negative PPTX availability messaging, and stronger quiz source selected-state visibility in Wizard Step 1.
- 2026-03-27: Added coverage for selection-driven translation preflight, content-package execution, per-asset status/error reporting, and translation-versions API extensions (`podcastVersions`, `sourceDocVersions`).
- 2026-03-27: Added validation coverage for lesson-linked quiz publish/cancel return navigation context and for new Course Lessons `Set Learning Objectives` inline Bloom taxonomy objective editing flow.
- 2026-03-27: Added strict grounding regression coverage for lesson-linked regenerate-question/regenerate-answers and hard-failure behavior when selected source content is missing or unsupported.
- 2026-03-27: Added validation coverage for new Quiz Wizard source-selection step, versioned source options, and strict generation contract enforcement (including stale/missing-source failure behavior).
- 2026-03-27: Added test coverage for actionable feedback application buttons in Lesson Content Studio, including per-action AI apply flow and automatic new `feedback_fix` version creation.
- 2026-03-27: Added testing coverage for visual compare diff clarity (line/token highlighting, synced scrolling, changed-only filtering, and diff navigation) and visible version date/time timestamp rendering in selectors/headers.
- 2026-03-27: Added verification coverage for explicit `Initial` vs `Current` source-content semantics, per-language version activation (`Set As Current`), and non-modal `Get Feedback` page flow with corrected quick/deep/compare feedback contracts.
- 2026-03-27: Added edge-case coverage for Lesson Content Studio data initialization and fallback states (missing org context, delayed source load, no source content, and no historical versions).
- 2026-03-27: Added regression checks for lesson action menu behavior (`Get Feedback` single-language immediate action, removed manual quiz creation option, and `Regenerate PPTX` labeling).
- 2026-03-27: Added test coverage for full-page Lesson Content Studio route and `View Lesson Content (DB)` page navigation behavior.
- 2026-03-27: Added validation coverage for inline non-modal course/lesson management workflows across mobile and desktop breakpoints.
- 2026-03-23: Added tests for impersonation-aware lesson and translation-state access and corrected course-health endpoint path validation.
