# Course Lessons Functionality

## About
This document describes lesson access behavior for course lesson management screens, including impersonation-aware access rules and health endpoint usage.

## Feature List
- Fetch lesson detail cards for all course-linked lessons.
- Fetch translation wizard state for each lesson.
- Fetch course content health summary.
- Support SuperAdmin/CustSuper impersonation without direct org-role DB membership rows.
- Ensure course-draft creation for AI-assisted document flow is always anchored to effective session organization (including impersonation context), even if client payload org id is stale.
- Use inline in-page workflow panels for course/lesson management actions instead of modal/dialog overlays.
- Enforce lesson-linked quiz generation source selection with explicit version choice (Source DB/PPTX/Word/Podcast/manual topic) before quiz generation.
- Enforce strict source-grounded quiz generation and regeneration for lesson-linked flows, including deterministic post-generation validation that blocks unsupported questions/answers.
- Keep Quiz Wizard step navigation stable during draft refetch/autosave so `Back`/`Next` actions are not reverted by draft hydration races.
- Surface explicit inline generation-failure guidance in Quiz Wizard when strict source-grounding validation fails, instead of appearing to stall silently.
- Preserve lesson-context return navigation in Quiz Wizard publish/cancel flows so users return to Course Lessons after lesson-linked quiz publishing.
- Expose lesson-level Bloom taxonomy objective management from Course Lessons, including in-card visibility and inline editing for learning objectives.
- Provide translation preflight for lesson-level translation with selectable asset coverage (Source DB, Word docs, Quiz, Podcast script/audio, PPTX) before starting translation jobs.
- Persist per-asset translation package state on translated lessons and surface it in translation wizard polling for resume/partial-failure visibility.
- Normalize lesson artifact version identity semantics so synthetic "current/initial" entries are canonical (`current`, `initial`) with stable active labels/timestamps, and include language metadata for version-aware UIs.
- Expand Artifact Quick Access side panel with context actions per selected artifact/language/version (`Open/Play`, `Download`, `Set Active`, `Replace`, `Edit`) and capability-aware disabled states for unsupported operations.
- Support course export/import transfer packages across cloud and onprem variants with Cloud PRD-authoritative protected package encryption.

## Rules and Constraints
- Lesson access checks must honor effective session organization context, including impersonated organization scope.
- If a lesson belongs to a different owning organization, access is allowed only when the lesson is linked to courses in the requested organization scope.
- Translation wizard state requests require requested organization scope access and must not rely only on direct `userOrganizationRoles` rows.
- Course health endpoint for lesson tooling must use `/api/courses/:courseId/health`.
- Course/lesson management interactions should prefer inline cards/panels and route flows; modal/dialog overlays are avoided for primary management actions.
- For lesson-linked quiz generation, source selection is mandatory and the selected source contract must be used to resolve generation content (no silent source fallback).
- Lesson-linked generation and regeneration reject manual-topic mode and reject empty selected source content; quiz output is accepted only when strict source-grounding validation passes.
- For lesson-linked quiz generation started from Course Lessons, publish and cancel return to the originating Course Lessons route (not Quiz Drafts).
- Learning objectives on content lessons are editable inline on the lesson card and can be opened from lesson actions via `Set Learning Objectives`; updates are saved to lesson + course topic mapping.
- Lesson translation requests can include explicit `translationOptions` and optional podcast voice/config payloads; backend translation processing follows the selected package instead of hardcoded all-or-nothing behavior.
- Translation wizard status responses include translated lesson package metadata (asset state + errors) to support robust multi-asset progress UI.
- Translation target selection is artifact-aware, not only language-row-aware. Existing target-language lessons remain selectable so admins can add missing artifacts or refresh stale artifacts after imports, partial translation runs, or source updates.
- Supported translation languages are required platform data and must be canonicalized by cloud/onprem install and update maintenance paths. Runtime language APIs may fall back to the canonical language list when a target database is empty or source-only, but package install/update is the authoritative repair path.
- Language required-data repair must tolerate historical runtimes where `supportedLanguages.code` is not yet constrained: de-duplicate by `code`, restore `supportedLanguages_pkey`, then upsert the canonical rows.
- Source DB translation output is stored as lesson content version history; storage-key-backed versioning is reserved for artifacts that actually have stored files, such as translated PPTX presentations.
- Lesson digest and step-guide freshness are evaluated against the same selected Source DB content hash used by the translation run, so successful translations are not marked stale unless their source content actually changes.
- Bloom objectives are included in default lesson translation selection when source lesson objectives exist.
- PPTX readiness checks for lesson actions/language variants are based on stored/versioned presentation availability, not only Gamma card metadata, so download/view actions do not surface false-ready states.
- Gamma completion now runs best-effort slide pre-conversion before job completion to reduce first-open viewer conversion delays.
- Course framework document ingestion accepts DOCX/PPTX/PDF for both initial draft uploads and per-lesson supplement uploads, including large text PDFs with index/section-aware extraction hints.
- DOCX ingestion now detects numbered top-level sections (for example `1 ...`, `2 ...`) and uses those boundaries as topic-content blocks to improve source-to-topic grounding accuracy.
- Framework generation is fail-open for low/ambiguous grounding assignment: when strict structured heading mapping cannot be completed, framework creation still succeeds using fallback source distribution and returns warning metadata for user remediation.
- Impersonation-scoped AI helper endpoints now resolve organization context from effective session organization (when impersonating), and usage-limit checks resolve quota organization from effective session context instead of first-role fallback.
- AI-assisted course draft bootstrap now prefers `effectiveOrganizationId` from `/api/user/roles` over first-organization list ordering in the client.
- Lesson Source Content Studio feedback preview now records feedback completion metadata (`lastFeedbackAt`, `contentScore10`, `feedbackReport`, `lastFeedbackHash`) when the analyzed text matches the current saved lesson content, so Course Lessons step guidance advances from `Get feedback` without requiring `Apply This Fix` or a manual content save.
- Lesson Source Content Studio feedback now persists version-scoped feedback runs and itemized relevance-audit findings (`on_topic` / `possibly_off_topic` / `off_topic`) for the selected content version.
- Relevance-audit fixes are user-controlled and opt-in: only selected items are applied, item-level decisions are saved (`accepted/rejected/ignored/applied`), and apply runs save a new auditable Source DB version.
- Lesson cards now support inline AI objective generation with Bloom-level targeting in the Objectives editor, grounded on the lesson Source DB content (`inputText`) and appendable with manual objective rows before save.
- Lesson detail fetches in Course Lessons can include course-scoped objective fallback hydration so objective visibility remains consistent even when framework topic-objective arrays and linked lesson-objective arrays are temporarily out of sync.
- Artifact Quick Access actions must operate on the selected language variant lesson id (not only source lesson id) and preserve course-return navigation context.
- `Set Active` behavior is artifact-specific:
  - Podcast: activates selected podcast version.
  - Quiz: marks selected linked quiz as primary for the lesson.
  - Source/objective/digest version entries: restores selected lesson version as current state.
  - Unsupported artifact types must remain visible but disabled with explicit reason text/tooling.
- Course transfer package encryption uses Cloud PRD license authority:
  - Cloud exports/imports do not require a license key because cloud systems are internal LearnPlay-managed infrastructure.
  - Cloud export/import remains constrained by authenticated role and effective organization scope.
  - Onprem export requires a current Cloud PRD active system license authorization before the package is produced.
  - Onprem import requires a current Cloud PRD active system license authorization before the package decrypt key is released.
  - Onprem systems do not use locally installed customer license keys or local shared package secrets as transfer encryption/decryption material.
  - Packages may include source organization/system metadata for audit, but import always targets the authenticated or impersonated effective target organization resolved by the server.

## Environment-Specific Behavior
- cloud DEV / cloud ACC / cloud PRD:
  - same session/effective-organization behavior applies.
  - course export/import is available without license gating, using Cloud license key material for protected package wrapping/unwrapping.
- onprem DEV / onprem ACC / onprem PRD:
  - same session/effective-organization behavior applies.
  - course export/import is available only when Cloud PRD authorizes the onprem system as actively licensed at export/import time.

## Integrations
- `GET /api/lessons/:lessonId?organizationId=...`
- `GET /api/lessons/:sourceLessonId/translation-wizard-state?organizationId=...`
- `GET /api/courses/:courseId/health`
- `GET /api/lessons/:lessonId/source-document?organizationId=...` (returns source content plus `languageCode` + `updatedAt` for version/timestamp UX)
- `GET /api/lessons/:lessonId/versions?organizationId=...`
- `GET /api/lessons/:lessonId/content-versions?organizationId=...` (compatibility alias)
- `POST /api/lessons/:lessonId/source-document/feedback-preview?organizationId=...`
- `GET /api/lessons/:lessonId/source-document/feedback-latest?organizationId=...&selectedVersionId=...`
- `POST /api/lessons/:lessonId/source-document/feedback-item-decision?organizationId=...`
- `POST /api/lessons/:lessonId/source-document/apply-feedback-selection?organizationId=...`
- `POST /api/lessons/:lessonId/source-document/set-current-version?organizationId=...`
- `GET /api/lessons/:lessonId/quiz-sources?organizationId=...`
- `POST /api/ai/generate-quiz` (requires `sourceSelection` when `lessonId` is provided)
- `POST /api/ai/regenerate-question` (lesson-linked calls require `lessonId` + `sourceSelection`)
- `POST /api/ai/regenerate-answers` (lesson-linked calls require `lessonId` + `sourceSelection`)
- `PUT /api/lessons/:lessonId?organizationId=...` (supports `learningObjectives` + `courseId` + `topicId` updates)
- `GET /api/lessons/:lessonId/translation-preflight?organizationId=...`
- `POST /api/lessons/:lessonId/translate` (supports `translationOptions` + optional `podcastConfig`)
- `GET /api/lessons/:lessonId/translation-versions?organizationId=...` (extended with `podcastVersions` + `sourceDocVersions`)
- `POST /api/courses/drafts/:draftId/documents` (DOCX/PPTX/PDF upload support)
- `POST /api/courses/drafts/:draftId/lessons/:lessonIndex/supplement` (DOCX/PPTX/PDF supplement ingestion)
- `POST /api/lessons/:lessonId/podcast/active-version`
- `POST /api/lessons/:lessonId/linked-quizzes/:quizId/set-primary`
- `POST /api/lessons/:lessonId/versions/:versionId/restore`
- `GET /api/lessons/:lessonId/download?organizationId=...`
- `GET /api/lessons/:lessonId/download-video?organizationId=...`
- `GET /api/lessons/:lessonId/download-source-document?organizationId=...`
- `GET /api/lessons/:lessonId/podcast/download?languageCode=...&versionId=...`
- `POST /api/courses/:courseId/export-preflight`
- `POST /api/courses/:courseId/export-job`
- `POST /api/courses/import-analyze`
- `POST /api/courses/import-job`
- `POST /api/enterprise/public/course-transfer/export-authorize` (Cloud PRD onprem export authorization)
- `POST /api/enterprise/public/course-transfer/decrypt-key` (Cloud PRD onprem import decrypt authorization)

## Course Transfer Large Package Contract
- Scope: `both`
- Course transfer ZIPs are large streamed job payloads because a single course export can include all languages, versions, and binary artifacts and may exceed 2GB.
- General upload routes keep normal upload limits, but course transfer upload endpoints are carved out at the reverse proxy layer with route-specific large streamed handling:
  - `/api/courses/import-analyze`
  - `/api/courses/import-job`
  - `/api/courses/import`
- The application stores transfer uploads on disk and must not impose a fixed application-level package-size cap; available disk, runtime timeout, and operator infrastructure capacity are the practical boundaries.
- The transfer dialog must not lose active or completed transfer state when dismissed accidentally. Long-running analyze/import/export state is recoverable when the dialog is reopened, and HTTP 413 responses must surface as explicit deployment/proxy-limit messages rather than generic analyzing failures.
- Import inserts must be dependency-safe. Quiz collections are inserted before course lesson links because `courseLessons.primaryQuizId` references `quizCollections.id`. Immediately before insert, the import service hardens foreign keys in the incoming bundle: required relationships with missing targets are skipped, and optional quiz references such as `courseLessons.primaryQuizId` and `lessons.relatedQuizId` are nulled when the referenced collection is absent from both the package and target database.
- Course import must not replay package tables directly. The imported package is first converted into a server-built course-domain import plan, then executed in explicit stages: course shells/frameworks, lesson shells, quiz collections, course/lesson/quiz links, quiz cards, lesson artifacts/versions, quiz version history, and course version/tag history. The plan is foreign-key hardened before execution and verified after execution so broken package references fail deterministically with a clear import error instead of surfacing as opaque database constraint failures.

## Assumptions and Out of Scope
- Does not introduce new impersonation UI features.
- Does not change ACC/PRD deployment orchestration behavior.

## Change Summary
- 2026-04-28: Added required platform-data canonicalization for supported translation languages in cloud/onprem install and update paths, with runtime fallback for empty/source-only language tables so org preferred-language dropdowns and translation creation remain available after deployment.
- 2026-04-28: Hardened supported-language repair for runtimes missing the `supportedLanguages_pkey` constraint by de-duplicating language codes before restoring the primary key and running canonical upserts.
- 2026-04-28: Updated lesson translation selection so existing target languages can be selected for update/remediation, missing target artifacts are preselected from preflight coverage, and podcast-only remediation can enter the wizard without being blocked as “no languages available.”
- 2026-04-28: Replaced raw table-order course import replay with a staged course-domain import plan, pre-execution reference validation, and post-import verification so export/import handles quiz and lesson relationship edge cases more robustly across cloud and onprem.
- 2026-04-28: Hardened course import insert ordering and pre-insert foreign-key sanitation so optional quiz references cannot fail an otherwise valid course clone import, and changed transfer modal outside-click feedback from failure styling to informational “still running” notice.
- 2026-04-28: Hardened course transfer for large packages by removing the application 1GB transfer upload cap, adding route-specific streamed reverse-proxy handling for import/analyze endpoints, and preserving transfer dialog state across accidental modal dismissal.
- 2026-04-28: Replaced static course-transfer package secret dependency with Cloud PRD-authoritative protected package wrapping. Cloud systems can export/import through normal role and organization scope controls without license gating; onprem systems must obtain active-license authorization from Cloud PRD for export and import decrypt operations.
- 2026-04-27: Prevented false stale digest blocking by aligning digest/step-guide freshness hashes with selected Source DB contracts, scoped refresh-from-source to only stale artifacts, and default-selected Bloom objectives when available.
- 2026-04-27: Fixed Source DB lesson translation versioning so translated text content is saved as auditable content history without requiring presentation storage keys, and hardened Gemini config fallback when integration secrets are unavailable.
- 2026-04-03: Upgraded Course Lessons Artifact Quick Access panel with contextual multi-action controls (`Open/Play`, `Download`, `Set Active`, `Replace`, `Edit`), wired selected language/version actions to the correct variant lesson id, and added backend support to set linked quiz primary state directly from artifact-side actions.
- 2026-03-31: Standardized synthetic source-version identity across lesson version APIs (`current`/`initial` canonical IDs), added language metadata to synthetic version payloads, and hardened source/option timestamp fallbacks to prevent `Unknown time` states across lesson artifact selection UIs.
- 2026-03-27: Fixed impersonation-safe draft creation for AI-assisted course builder by binding draft org assignment to effective session organization and tolerating stale client org payloads without false 403 errors.
- 2026-03-27: Hardened impersonation org scoping across AI helper generation endpoints and usage-limit middleware by resolving org context from effective session/impersonation state, and updated document-wizard client org bootstrap to prioritize `effectiveOrganizationId`.
- 2026-03-27: Fixed feedback-step persistence by saving canonical feedback completion metadata during Source Content Studio feedback preview when previewed text equals current saved source content, ensuring Course Lessons step progression no longer stays stuck on `Step 2/7: Get feedback` after successful feedback generation.
- 2026-03-27: Added lesson-level objective generation controls in Course Lessons (`Edit Objectives`) with Bloom taxonomy level selection and AI generation from Source DB content, while preserving manual objective add/edit/save workflow in the same inline editor.
- 2026-03-27: Improved objective visibility consistency in Course Lessons by adding course-aware objective fallback hydration on lesson detail fetch and using lesson-linked objectives when framework topic objectives are missing.
- 2026-03-27: Added version-scoped Source DB feedback run persistence, stale-run detection by content hash, and retrieval endpoints so feedback remains available when returning to Lesson Content Studio for the same selected version.
- 2026-03-27: Added item-level relevance audit decisions and selection-based apply flow (`Apply Selected Fixes`) so users explicitly control what is removed and all applied changes are saved as new `feedback_fix` versions.
- 2026-03-27: Fixed Node 18 PDF extraction fallback for course draft ingestion by correcting the `pdftotext` execution/output parsing flow so uploaded text PDFs no longer fail with false image-only/empty-content errors.
- 2026-03-27: Fixed Quiz Wizard non-advancing/sticky-step behavior by preventing rehydration resets after initial draft load, persisting back-navigation step transitions, and showing inline actionable errors when strict grounding validation blocks question generation.
- 2026-03-27: Added PDF support to course framework ingestion (draft uploads + lesson supplements) with page-aware extraction, structural heading/index hint detection, and raw-text/source-map persistence for source-grounded framework generation on large documents.
- 2026-03-27: Improved DOCX numbered-section grounding so top-level numbered headings are treated as primary topic boundaries for source-content assignment, and made structured-heading assignment fail-open with warning metadata (framework still generated via fallback distribution when strict mapping is not possible).
- 2026-03-27: Fixed post-generation PPTX readiness race by aligning language/download availability to stored/versioned PPTX state (not Gamma metadata-only), improved pending feedback when PPTX finalization is still in progress, and added best-effort slide pre-conversion during Gamma completion to reduce first-view conversion wait.
- 2026-03-27: Added selection-driven lesson translation contracts with preflight availability/pricing, per-asset translation package state persistence, and worker execution support for optional assets (Source DB, Word docs, Quiz, Podcast script/audio, PPTX translate-source and generate-new modes) including partial-failure reporting.
- 2026-03-27: Fixed Quiz Wizard lesson-linked publish/cancel navigation to return users back to the originating Course Lessons page using preserved return context, and added Course Lessons objective governance UX: lesson action menu entry (`Set Learning Objectives`) plus inline lesson-card visibility/editing for Bloom-tagged learning objectives.
- 2026-03-27: Added strict source-grounding enforcement for lesson-linked quiz generation/regeneration: manual-topic is blocked for lesson-linked AI flows, empty source payloads are rejected, and AI output now goes through deterministic grounding validation with retry/fail behavior to prevent unsupported questions/answers.
- 2026-03-27: Added lesson quiz source catalog endpoint and upgraded Quiz Wizard to a five-step flow with explicit source/version selection; quiz generation now enforces selected source contract resolution (Source DB, PPTX version, Word source doc, podcast script, or manual-topic mode) to prevent silent source drift.
- 2026-03-27: Expanded Source DB feedback UX into actionable guidance with per-recommendation `Apply This Fix` actions; each applied recommendation now updates Source DB content via AI and saves a new `feedback_fix` content version for auditable rollback/compare.
- 2026-03-27: Upgraded Source DB compare UX to explicit side-by-side diff visualization (line-level add/remove/change markers, inline token highlights, synced scroll, changed-only filtering, and next/previous difference navigation), and added visible date/time timestamps for each selectable content version.
- 2026-03-27: Standardized Source DB version semantics with explicit `Initial version` and `Current version (active)` handling, added per-language `set current version` activation API, aligned Lesson Content Studio with canonical versions/feedback contracts, and moved lesson-menu `Get Feedback` to full-page Content Studio inline flow (no modal dependency).
- 2026-03-27: Hardened Lesson Content Studio data loading and editor initialization to handle missing org context, source-content load timing, empty content states, and no-history version scenarios without blank editor regressions.
- 2026-03-27: Updated lesson action menu behavior so `Get Feedback` auto-runs when only one language is available, removed `Create Quiz (Manual)` from lesson dropdowns, and relabeled `Regenerate` actions to `Regenerate PPTX`.
- 2026-03-27: Replaced `View Lesson Content (DB)` modal workflow with a dedicated full-page Lesson Content Studio route to support larger editing/review/compare flows on mobile and desktop.
- 2026-03-27: Reworked course/lesson management UI interactions toward inline, non-modal workflows for primary action flows to reduce mobile overlap/stacking issues and improve desktop continuity.
- 2026-03-23: Added impersonation-aware lesson access compatibility for lesson details and translation wizard state; aligned course-lessons health fetch to `/api/courses/:courseId/health` to prevent stale 404 path usage.
