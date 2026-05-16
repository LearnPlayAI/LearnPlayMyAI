# Course Export / Import (Cloud <-> On-Prem)

## Overview
LearnPlay supports protected zip-based cloning of a course family between environments using async job APIs and inline UI status flows.

The transfer package includes non-transactional course authoring content, related versions, translated course-family records, and referenced binary assets. It excludes transactional learner/runtime data.

Downloaded packages use a protected wrapper: the visible zip contains an encrypted payload, not directly readable course data or binary files. Target systems decrypt the payload server-side during analysis/import using the shared course transfer secret.

Imports create the clone inside the requester's effective organization context. That context may come from the authenticated organization or from the organization currently being impersonated.

## API Endpoints

### Export
- `POST /api/courses/:id/export`
  - Starts async export and returns `{ mode: "async", jobId, status, phase, progress }`.
- `POST /api/courses/:id/export-job`
  - Starts async export and returns `{ jobId, status, phase, progress }`.
- `GET /api/courses/export-jobs/:jobId`
  - Returns export job status, progress, phase, and errors.
- `GET /api/courses/export-jobs/:jobId/download`
  - Streams the generated zip package when job status is `completed`.

### Import
- `POST /api/courses/import` (multipart form-data)
  - Field: `package` (`.zip`)
  - Starts async import and returns `{ mode: "async", jobId, status, phase, progress }`.
- `POST /api/courses/import-job` (multipart form-data)
  - Field: `package` (`.zip`)
  - Starts async import and returns `{ jobId, status, phase, progress }`.
- `GET /api/courses/import-jobs/:jobId`
  - Returns import job status, progress, phase, and errors.

### Authorization and Scope
- All endpoints require authenticated `teacher/admin` access (existing role conventions).
- Export validates course ownership inside the effective organization context.
- Import runs into the requester’s effective organization context.

## Protected Zip Contract

### Root layout
Downloaded package:
- `learnplay-course-transfer.json`
- `payload.enc`

Encrypted payload after server-side validation/decryption:
- `manifest.json`
- `checksums.json` (optional but supported and generated)
- `data/*.json`
- `files/*`

The encrypted payload uses AES-256-GCM and a server-side secret (`COURSE_TRANSFER_PACKAGE_SECRET` or `LEARNPLAY_COURSE_TRANSFER_SECRET`). All source and target systems that need to exchange packages must share the same transfer secret. Local development uses a fixed development fallback when the secret is not configured; production requires an explicit secret.

### `manifest.json` fields
- `packageVersion`
- `sourceAppVersion`
- `exportedAt`
- `sourceCourse`:
  - `id`
  - `title`
  - `language`
  - `org.id`
- `compatibility`
- `include` / `exclude`
- `files[]` entries:
  - `sourcePath`
  - `originalSourcePath`
  - `packagePath`
  - `sha256`
  - `sizeBytes`
  - `sourceRootPath`
  - `relativeSourcePath`
  - `sourceStorageClass`
  - `artifactKind`
  - `targetStorageStrategy`
- `checksums` map
- `familySummary`
  - `courseCount`
  - `versionCount`
  - `translationCount`
  - `languageCodes`
  - `lessonCount`
  - `quizCount`
- `clonePolicy`
  - `fullFamily: true`
  - `importDefaultMode: "create_new"`
  - `importedCourseStatus: "draft"`
  - `targetOrgResolution: "authenticated_or_impersonated"`
- `artifactPortability`
  - `packageContainsSelectedArtifacts`
  - `targetStorageStrategy: "rewrite_to_target_upload_root"`
  - `originalPathsAreInformational: true`

## Include / Exclude Behavior

### Included
- `courses`
- `courseFrameworks`
- `courseLessons`
- `lessons`
- `lessonSlides`
- `lessonPresentationVersions`
- `lessonContentVersions`
- `lessonVersions`
- `lessonQuizLinks`
- `quizCollections`
- `quizCards`
- `quizCollectionVersions`
- `quizCardVersions`
- `courseVersions`
- `courseTags`
- Referenced file assets (thumbnail, PPTX, source docs, transcript, params, video, quiz images) when resolvable
- All sibling course-family records linked by content group, including language translations
- All included course, lesson, presentation, content, quiz, and card version rows

### Excluded
- Assignments/enrollments/progress
- Purchases/refunds/payments
- Ratings/reviews
- Certificates
- Gameplay/results/history
- Credit ledgers/usage logs
- Access logs/audit telemetry
- Any runtime transactional artifacts

## Import Rules
- Always creates new IDs; never mutates source IDs in place.
- Default mode is create-new draft clone.
- Target organization is the requester's authenticated or impersonated organization.
- Builds and applies old->new ID remap maps.
- Rewrites FK links and JSON snapshot references.
- Rewrites storage paths for imported file assets.
- Imported course status is forced to `draft` for safe activation.
- On critical failure, import aborts and copied files are cleaned up best-effort.

Original `/opt/learnplay/...` or other source runtime paths are audit metadata only. Import never requires those paths to exist on the target host; packaged artifacts are copied into the target upload root and course references are rewritten.

## Validation and Security
- Manifest schema validation (`zod`).
- Package version compatibility checks.
- Checksum validation for declared checksums.
- Zip entry path sanitization + extraction boundary checks (zip-slip defense).
- Downloaded packages are encrypted at rest inside the zip wrapper; opening the zip does not expose manifest data, database rows, PPTX files, videos, audio, or other copied course artifacts.
- Upload validation: zip mime/extension + max size limit.
- Security-relevant failures are logged server-side.

## UI Flow (No Toasts)
- Course Card actions: `Export Course`.
- Course Builder page action: `Import Course`.
- Both use dialog flows with:
  - Inline `Alert` status blocks
  - Progress bar + phase labels
  - Inline error details
  - Completion actions (`Download Package`, `Open Imported Course`)
- No toast notifications are used by export/import UI paths.

## Cloud / On-Prem Transfer Guidance
1. Export from source LearnPlay instance.
2. Download package zip from export job.
3. Import zip into target LearnPlay instance from Course Builder.
4. Open imported course directly from completion CTA and review/edit in draft state.

## Troubleshooting
- `Package missing required manifest.json`
  - Invalid unprotected zip root structure or protected payload that could not be opened.
- `Unable to open protected course package`
  - Source and target systems do not share the same course transfer secret.
- `Unsupported packageVersion`
  - Package major version not supported by this runtime.
- `Unsafe zip entry path`
  - Rejected for zip-slip safety.
- `Package integrity check failed`
  - Checksum mismatch or missing file.
- `Course not found or not accessible for this organization`
  - Export access scope/ownership violation.
