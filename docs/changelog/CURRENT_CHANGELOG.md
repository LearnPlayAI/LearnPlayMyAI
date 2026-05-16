# Current LearnPlay Changelog

Last updated: 2026-04-29
Scope: both

This compact changelog is for current release-train context. The compatibility source used by existing release tooling remains `/antigravity/docs/handoverdocs/CHANGELOG.md` until tooling is migrated.

## Entry LPLOG-20260428-001
- Timestamp: 2026-04-28 00:00:00 SAST +02:00
- Variant: both
- Issue: Knowledge and documentation loading had grown too broad because active docs, historical handover material, generated artifacts, and repo-local legacy docs were mixed across two roots.
- Fix: Introduced compact knowledge, landscape, handover, testing, operations, and changelog entrypoints under `/antigravity/docs`, deprecated `/antigravity/Cloud-On-Prem/docs` for active documentation, and moved large/stale docs into searchable archive paths.

## Entry LPLOG-20260428-002
- Timestamp: 2026-04-28 13:03:57 SAST +02:00
- Variant: both
- Issue: Course export/import packages depended on a shared transfer secret, which made cloud/onprem transfer compatibility fragile and did not enforce Cloud PRD active-license authority for customer-managed onprem systems.
- Fix: Reworked protected course-transfer packages to use Cloud PRD license-authority key wrapping and onprem export/import authorization while keeping cloud export/import governed by internal role and organization scope controls.

## Entry LPLOG-20260428-003
- Timestamp: 2026-04-28 13:33:08 SAST +02:00
- Variant: both
- Issue: Large course transfer packages could be rejected by the reverse proxy before LearnPlay received them, while modal dismissal could hide an active or completed transfer and make users rerun export/import work.
- Fix: Added route-specific large streamed handling for course transfer upload endpoints, removed the application-level 1GB transfer upload cap, and made the transfer dialog preserve recoverable transfer state with explicit 413 messaging.

## Entry LPLOG-20260428-004
- Timestamp: 2026-04-28 13:50:38 SAST +02:00
- Variant: both
- Issue: Course import could fail after successful upload/decrypt when course lesson links referenced quiz collections that were inserted later or absent from the imported bundle, and outside-click protection used failure styling while transfers were still running.
- Fix: Insert quiz collections before course lesson links, harden imported bundle foreign keys immediately before insert by filtering missing required relationships and nulling optional quiz pointers, and show outside-click transfer protection as an informational still-running notice.

## Entry LPLOG-20260428-005
- Timestamp: 2026-04-28 13:58:44 SAST +02:00
- Variant: both
- Issue: Course import still converted a package into normalized rows and replayed them through a raw table-order insert loop, leaving relationship edge cases vulnerable to opaque foreign-key failures.
- Fix: Reworked course import execution into a staged server-built course-domain import plan with pre-execution reference hardening, ordered domain stages for courses/lessons/quizzes/artifacts/version history, and post-import verification before the job completes.

## Entry LPLOG-20260428-006
- Timestamp: 2026-04-28 14:21:45 SAST +02:00
- Variant: both
- Issue: Lesson translation entry blocked admins with “all languages already have translations” even when an imported or partial target-language lesson was missing artifacts such as podcast script/audio, PPTX, quiz, objectives, or digest.
- Fix: Made translation language selection artifact-aware by allowing existing target languages to be selected for update/remediation, using target preflight coverage to enter re-translate mode automatically, and allowing podcast-only remediation to start the wizard.

## Entry LPLOG-20260428-007
- Timestamp: 2026-04-28 15:06:12 SAST +02:00
- Variant: both
- Issue: Translation creation and organization preferred-language dropdowns could be empty after deployment when a runtime database missed or lost the supported-language seed rows.
- Fix: Made the supported-language catalog required platform data in cloud/onprem install and update maintenance paths, added runtime canonical-language fallback for empty/source-only language tables, and routed translation language validation through the language service instead of direct table lookups.

## Entry LPLOG-20260428-008
- Timestamp: 2026-04-28 15:19:25 SAST +02:00
- Variant: both
- Issue: The supported-language update repair could fail on runtimes where historical `supportedLanguages` rows existed without a primary/unique constraint on `code`, because `ON CONFLICT (code)` requires a matching unique or exclusion constraint.
- Fix: Hardened cloud/onprem install and update language repair to de-duplicate language codes, restore the `supportedLanguages_pkey` primary key when missing, and only then upsert the canonical language catalog.

## Entry LPLOG-20260428-009
- Timestamp: 2026-04-28 15:58:00 SAST +02:00
- Variant: both
- Issue: AI/dev operations guidance did not make the WSL-native execution contract explicit enough, so project tests could be attempted with Windows-native Node tooling and fail due to UNC workspace path resolution.
- Fix: Documented that LearnPlay workspace Node tooling, Jest, TypeScript, package builds, and local app processes must run inside WSL/Linux, with WSL Node activation as the recovery path when shell Node tooling is missing.

## Entry LPLOG-20260429-001
- Timestamp: 2026-04-29 11:49:43 SAST +02:00
- Variant: both
- Issue: Education organization registration could create selected grades and classes while silently dropping selected subjects, and the Central Management Hub did not surface grade-level subjects in the hierarchy.
- Fix: Aligned education registration subject selection with the backend grade-subject contract, returned grade-level subjects in hierarchy data, rendered those subjects in the Central Management Hub, and documented user-owned deployment/manual validation plus terminology-helper label rules.

## Entry LPLOG-20260429-002
- Timestamp: 2026-04-29 12:18:11 SAST +02:00
- Variant: both
- Issue: Education organization subject workflows still had follow-up drift risks: manual grade-scoped subject creation could miss the grade-subject link, join approvals could mutate state before rejecting incompatible subject choices, on-prem DEV/QA role defaults could map education joins incorrectly, and some active admin copy still bypassed central terminology helpers.
- Fix: Linked manually created grade/unit subjects through the grade-subject table, validated join-request subject compatibility before approval side effects across approval paths, preserved education approval as the `student` role, and moved remaining active management wording through organization terminology helpers.

## Entry LPLOG-20260501-001
- Timestamp: 2026-05-01 13:00:00 SAST +02:00
- Variant: both
- Issue: DOCX course creation exposed Word heading sections as a flat outline, so selecting a parent heading did not reliably represent a complete cascading lesson section.
- Fix: Preserved Word heading levels during DOCX extraction, built a parent/child document outline from Heading 1/2/3 levels, made each outline node carry the full subtree content up to the next same-or-higher heading, kept selected outline titles as content lessons even when they mention overview or key takeaways, allowed users to promote sourced lessons into Overview/Key Takeaways roles while deleting empty placeholders, finalized the exact reviewed lesson list instead of a possibly stale autosaved draft copy, handled immediate selected-outline generation completion in the wizard, and recorded original selected source text as immutable V1 lesson source content with clearer V1/V1.1 diff labels.

## Entry LPLOG-20260501-002
- Timestamp: 2026-05-01 14:35:00 SAST +02:00
- Variant: both
- Issue: Screenshot UAT found three follow-up workflow issues: the lesson viewer desktop side rail could not collapse, podcast voice selection did not reliably update speaker display names, and promoted Overview/Key Takeaways lessons with existing source content hid optional structural source generation actions.
- Fix: Added a collapsible desktop lesson viewer side rail, made podcast host/guest voice selections refresh display names immediately while still allowing manual overrides, and kept Generate/Regenerate Overview or Key Takeaways Source DB actions available for structural lessons when prerequisites are ready even if they already contain source material.

## Entry LPLOG-20260501-003
- Timestamp: 2026-05-01 14:58:58 SAST +02:00
- Variant: both
- Issue: Screenshot UAT found that the course category creation input lost focus after each character, showcase marketplace cards could miss the orange showcase badge, and unauthenticated learners could be blocked from starting a public free showcase course.
- Fix: Stabilized the inline category creation form so full names can be typed before saving, made showcase badges use the orange warning badge treatment, required showcase publishing to target a configured showcase department, and aligned public showcase detection so showcase courses and their lessons are available to unauthenticated learners when the course is public and assigned through a showcase scope.

## Entry LPLOG-20260501-004
- Timestamp: 2026-05-01 15:01:57 SAST +02:00
- Variant: both
- Issue: The unauthenticated homepage did not surface public showcase courses directly, so visitors had to browse the marketplace before trying a free showcase course.
- Fix: Added a homepage showcase-course carousel below the hero actions, powered by the public showcase course feed, with orange showcase badges and a “Try now for free” action linking to the public course detail flow.

## Entry LPLOG-20260501-005
- Timestamp: 2026-05-01 15:07:55 SAST +02:00
- Variant: both
- Issue: A department named Showcase was still treated as a normal department unless its hidden showcase flag was set, and the Central Management Hub assignment picker could appear empty because it only listed already-active courses.
- Fix: Treat departments named Showcase as showcase-capable across hierarchy, course publishing, and public showcase detection, automatically mark newly created or renamed Showcase departments, surface a Showcase badge in Central Management Hub, and allow the assignment picker to list non-archived courses so valid drafts can be assigned and auto-published.

## Entry LPLOG-20260501-006
- Timestamp: 2026-05-01 15:20:00 SAST +02:00
- Variant: both
- Issue: Saving a course as Showcase could fail with a duplicate `UNQ_course_assignment_user` error when the course already had a non-user assignment, and the Central Management Hub assign-course picker could route through the generic course detail endpoint.
- Fix: Made course assignment upsert replace the existing non-user course scope before inserting a new one, added regression coverage for normalized replacement data, and moved the Central Management Hub assignable-course picker to a non-conflicting organization endpoint.

## Entry LPLOG-20260501-007
- Timestamp: 2026-05-01 15:28:00 SAST +02:00
- Variant: both
- Issue: The homepage showcase carousel requested only the first eight showcase courses, so additional public showcase courses would not appear on the landing page.
- Fix: Updated the homepage carousel to collect every showcase-course page from the public feed and render the full showcase set.

## Entry LPLOG-20260501-008
- Timestamp: 2026-05-01 15:42:00 SAST +02:00
- Variant: both
- Issue: Course transfer protected-package parsing left the temporary decrypted wrapper directory behind after extracting the authoritative inner payload.
- Fix: Removed the temporary protected-package wrapper directory immediately after payload extraction and added contract coverage so cloud/on-prem export/import clone runs do not accumulate stale transfer files.
