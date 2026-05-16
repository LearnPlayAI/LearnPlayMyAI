# Cloud-On-Prem Course Framework V2 E2E Tests

## Preconditions
- Deploy latest Cloud-On-Prem server build.
- Run DB migration `0061_course_framework_v2_segments.sql`.
- Set feature flags:
  - `CF_V2_SEGMENTS_ENABLED=true`
  - `CF_V2_ASSIGNMENT_ENFORCED=true`
  - `CF_V2_FINALIZE_COVERAGE_GATE=true`
  - `CF_V2_NO_SUMMARIZATION=true`
  - `CF_V2_NO_FRAMEWORK_GENERATION=true` (for no-generation flow tests)
- Login as teacher/admin in an org with course-builder access.
- Prepare upload fixtures from `tests/fixtures/course-framework/upload/`.
- Use `docs/testing/CourseFramework/UploadArtifactContract.md` as API/extraction contract reference.
- Use `docs/testing/CourseFramework/AI-Course-Source-Template.md` for AI-course heading structure.

## Mandatory Sequence
1. Create framework draft.
2. Upload source document(s) and wait for extraction completion.
3. Run analysis/generation/finalize for framework.
4. Only after framework completion: create/validate lesson artifacts.

## Test 1: Extraction Persists Full Segments
1. Open `/course-builder` and create a document draft.
2. Upload a DOCX/PPTX with clear section headings and multiple paragraphs.
3. Wait for extraction completion.
4. Call `GET /api/courses/drafts/:draftId/segments`.

Expected outcome:
- Response `200`.
- `totalSegments > 0`.
- Each segment has `segmentIndex`, `text`, `textHash`, and offsets.
- No missing `text` for extracted segments.

## Test 2: Deterministic Topic Assignment
1. Ensure draft has generated lessons/topics (run generate step).
2. Call `POST /api/courses/drafts/:draftId/topics/auto-assign`.
3. Call `GET /api/courses/drafts/:draftId/coverage`.

Expected outcome:
- Auto-assign returns `success: true`.
- Coverage response contains `coverageReport`.
- `assignedSegments + unassignedSegments === totalSegments`.
- If unassigned exists, IDs are listed for manual assignment.

## Test 3: Manual Reassignment + Coverage Closure
1. For any unassigned segments, call `POST /api/courses/drafts/:draftId/topics/:topicId/assign-segments`.
2. Recheck `GET /api/courses/drafts/:draftId/coverage`.

Expected outcome:
- Assignment call returns `success: true`.
- Coverage status becomes `pass` when all segments are assigned exactly once.
- `overlapSegments` remains `0`.

## Test 4: No-Generation Mode Behavior
1. Keep `CF_V2_NO_FRAMEWORK_GENERATION=true`.
2. Call `POST /api/courses/drafts/:draftId/generate`.
3. Open draft state (`GET /api/courses/drafts/:draftId`).
4. Attempt `POST /api/courses/drafts/:draftId/lessons/:lessonIndex/generate-content`.

Expected outcome:
- Generate returns `status: "completed"` (not background generating).
- Draft has deterministic lessons (overview + content topics + key takeaways).
- Content lessons have `sourceSegmentIds` and `sourceContent` from segments (if assigned).
- `generate-content` returns `409` disabled message.

## Test 4B: Lesson Artifact Timing Contract
1. Stop before framework finalize and attempt lesson-artifact creation checks.
2. Finalize framework.
3. Re-run lesson-artifact checks.

Expected outcome:
- Pre-finalize: lesson artifact expectations should not be treated as complete outputs.
- Post-finalize: lesson artifact checks must pass with stable framework linkage.

## Test 5: Finalize Coverage Gate Blocks Selection Loss
1. In review, intentionally deselect one content lesson that holds assigned segments.
2. Call `POST /api/courses/drafts/:draftId/finalize`.

Expected outcome:
- Response `409`.
- Error indicates selection would lose source content or missing source segments.
- No course is created.

## Test 6: Finalize Success with Full Coverage
1. Re-select lessons so all assigned segments are covered.
2. Call `POST /api/courses/drafts/:draftId/finalize`.

Expected outcome:
- Response `200` with `courseId`.
- Course + courseVersion + framework + lessons + courseLessons are created.
- Finalized lessons carry `metadata.sourceSegmentIds`.
- Draft is marked with `publishedCourseId` before cleanup.

## Test 7: Framework Topic Create Route (Client Compatibility)
1. In `/course-builder/:courseId/lessons`, create a new lesson topic from UI.
2. Verify request hits `POST /api/courses/:courseId/framework/topics`.

Expected outcome:
- Response `201`.
- New topic appended to framework with stable `id` and `order`.
- UI refresh shows newly added topic.

## Test 8: Strict Topic Linking Guard
1. With `CF_V2_ASSIGNMENT_ENFORCED=true`, call `POST /api/courses/:courseId/lessons/:lessonId` without `topicId`.
2. Retry with valid `topicId`.

Expected outcome:
- Without `topicId`: request fails with `TOPIC_ID_REQUIRED`.
- With valid `topicId`: lesson links successfully and framework topic `lessonId` is updated.

## Test 9: Summarization Disabled Guard
1. Upload a very large source that exceeds model token budget.
2. Call topic analysis or description generation.

Expected outcome:
- Request fails with `413` and token-budget guidance.
- No hidden truncation/summarization is performed.
