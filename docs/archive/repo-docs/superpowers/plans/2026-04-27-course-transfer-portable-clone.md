# Course Transfer Portable Clone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clone any course family from any LearnPlay system into the authenticated or impersonated target organization on another system.

**Architecture:** Extend the existing async course transfer service instead of replacing it. Export continues to package included tables and files, but now records full-family summaries, clone policy, and portable artifact metadata; import analysis and UI expose the target-org draft clone behavior.

**Tech Stack:** TypeScript, Express routes, Drizzle-backed service code, Zod manifest validation, React Course Builder dialog.

---

### Task 1: Lock The Contract

**Files:**
- Modify: `tests/courseTransferContracts.test.ts`

- [x] **Step 1: Add contract assertions**

Add tests that assert the transfer service emits full-family clone metadata, artifact portability fields, and effective target organization import analysis.

- [x] **Step 2: Verify the test target**

Run: `node node_modules/jest/bin/jest.js --runInBand tests/courseTransferContracts.test.ts`

Expected local behavior in this desktop session: blocked by Windows Node resolving Jest root through `\\wsl.localhost\...`; use Linux Node/npm on managed DEV or CI for the focused Jest run.

### Task 2: Strengthen Backend Package Metadata

**Files:**
- Modify: `server/services/courseTransferService.ts`
- Modify: `server/services/courseTransferUtils.ts`

- [x] **Step 1: Add family summary metadata**

Add `buildCourseFamilySummary` and return `courseCount`, `versionCount`, `translationCount`, `languageCodes`, `lessonCount`, and `quizCount` from export preflight, manifest, import analysis, and import completion details.

- [x] **Step 2: Add portable artifact metadata**

Add `originalSourcePath`, `sourceStorageClass`, `artifactKind`, and `targetStorageStrategy: "rewrite_to_target_upload_root"` to manifest file entries.

- [x] **Step 3: Add clone policy metadata**

Add manifest and preflight `clonePolicy` with `fullFamily: true`, `importDefaultMode: "create_new"`, `importedCourseStatus: "draft"`, and `targetOrgResolution: "authenticated_or_impersonated"`.

### Task 3: Improve Admin Dialog Clarity

**Files:**
- Modify: `client/src/components/course/CourseTransferDialog.tsx`

- [x] **Step 1: Show full-family export details**

Show courses, languages, versions, lessons, quizzes, artifact count, size, and portability behavior in export preflight/review.

- [x] **Step 2: Show target-org import details**

Show target organization, draft import status, package family summary, artifact count, and storage rewrite behavior during import analysis/review.

### Task 4: Document The Runtime Contract

**Files:**
- Modify: `docs/course-transfer-export-import.md`

- [x] **Step 1: Document clone semantics**

Document full-family cloning, authenticated/impersonated target organization resolution, draft imports, and artifact path portability.

### Task 5: Verify

**Files:**
- No source files modified.

- [x] **Step 1: Run TypeScript**

Run: `node node_modules/typescript/bin/tsc --noEmit --pretty false`

Expected: no output and exit code `0`.

- [x] **Step 2: Run diff hygiene**

Run: `git diff --check`

Expected: no output and exit code `0`.

### Task 6: Replace Global Transfer Secret With License-Backed Key Envelopes

**Status:** Blocked until cloud PRD license-management authority cleanup is complete.

**Files:**
- Modify: `server/services/courseTransferUtils.ts`
- Modify: `server/services/courseTransferService.ts`
- Modify: `server/services/licenseCryptoService.ts` or a focused transfer-key service
- Modify: `tests/courseTransferContracts.test.ts`
- Modify: `docs/course-transfer-export-import.md`

- [ ] **Step 1: Keep per-package content encryption**

Continue encrypting each course-transfer payload with a fresh random AES-256-GCM content key.

- [ ] **Step 2: Add license-key envelope mode**

Wrap the per-package content key with existing license/key authority instead of requiring a manually shared global transfer secret. For onprem-to-cloud packages, use the cloud license public key for wrapping and cloud PRD private key for unwrapping. For registered cloud/onprem relationships, derive scoped wrapping material from the encrypted-at-rest per-system sync credential using HKDF with package/source/target metadata.

- [ ] **Step 3: Preserve bounded compatibility**

Keep the current shared-secret package mode only as an explicit compatibility fallback for disconnected onprem-to-onprem transfers until a recipient-key exchange flow exists.

- [ ] **Step 4: Surface package key mode**

Expose the package protection mode during export/import analysis so admins can see whether the package uses license-backed wrapping, per-system wrapping, or legacy shared-secret fallback.
