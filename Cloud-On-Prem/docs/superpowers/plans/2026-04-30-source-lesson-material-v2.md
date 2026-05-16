# Source Lesson Material V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a format-agnostic Source Lesson Material V2 pipeline for PDF, DOCX, and PPTX course creation, with single-selection Source DB and learner-viewer verification gates.

**Architecture:** Add shared V2 contracts and a server-side builder that converts raw extracted text plus source assets into stored learner material. Extend extraction metadata enough for PDF/DOCX/PPTX visual registries, persist V2 during course finalization, and update the viewer to prefer V2 with V1 fallback.

**Tech Stack:** TypeScript, Zod, Jest, Drizzle/Postgres metadata JSON, React lesson viewer, existing object/source asset services.

---

### Task 1: Shared V2 Contract And Deterministic Builder

**Files:**
- Create: `shared/sourceLessonMaterialV2.ts`
- Test: `server/tests/sourceLessonMaterialV2.test.ts`

- [ ] **Step 1: Write failing tests**

Create tests that assert:
- PDF Chapter 2 text is split into sections and does not include Chapter 3 when a source range is supplied.
- `Figure 2` and "previous page" references attach the page 20 visual.
- DOCX-style embedded image assets attach to the nearby heading/paragraph.
- PPTX-style slide assets attach to slide-derived sections.
- validation reports blocking contamination when next-chapter text appears inside the selected range.

- [ ] **Step 2: Run tests and verify RED**

Run:
`PATH=/home/lppadmin/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- server/tests/sourceLessonMaterialV2.test.ts`

Expected: FAIL because `shared/sourceLessonMaterialV2.ts` does not exist.

- [ ] **Step 3: Implement shared V2 contract and builder**

Add Zod schemas, TypeScript types, `buildSourceLessonMaterialV2`, and `validateSourceLessonMaterialV2`.

- [ ] **Step 4: Run tests and verify GREEN**

Run:
`PATH=/home/lppadmin/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- server/tests/sourceLessonMaterialV2.test.ts`

Expected: PASS.

### Task 2: Visual Registry Metadata For PDF, DOCX, And PPTX

**Files:**
- Modify: `server/services/sourceMediaExtractor.ts`
- Test: `server/tests/sourceMediaExtractor.test.ts`

- [ ] **Step 1: Write failing tests**

Add assertions that:
- PDF image/page snapshot assets include text context metadata.
- DOCX embedded images include `packagePath`, `documentOrdinal`, and low-confidence context when relationship mapping is unavailable.
- PPTX embedded images include a slide number when it can be inferred from package path or relationship metadata.

- [ ] **Step 2: Run tests and verify RED**

Run:
`PATH=/home/lppadmin/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- server/tests/sourceMediaExtractor.test.ts`

Expected: FAIL on the new metadata expectations.

- [ ] **Step 3: Implement metadata enrichment**

Keep the existing extraction behavior, but enrich returned assets with V2-ready metadata.

- [ ] **Step 4: Run tests and verify GREEN**

Run:
`PATH=/home/lppadmin/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- server/tests/sourceMediaExtractor.test.ts`

Expected: PASS.

### Task 3: Persist V2 During Course Finalization

**Files:**
- Modify: `server/routes/courseFrameworkRoutes.ts`
- Test: `server/tests/sourceLessonMaterialV2.finalize.test.ts`

- [ ] **Step 1: Write failing tests**

Add route/service-level tests around the finalization helper path that assert:
- selected content lessons receive `metadata.sourceLessonContentV2`
- `inputText` remains the raw Source DB text
- V2 quality blocks lessons contaminated by next-chapter text
- linked source assets are restricted to V2 source page/slide range

- [ ] **Step 2: Run tests and verify RED**

Run:
`PATH=/home/lppadmin/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- server/tests/sourceLessonMaterialV2.finalize.test.ts`

Expected: FAIL because finalization does not build V2.

- [ ] **Step 3: Implement finalization integration**

During finalization, build V2 for each content lesson using source text, source assets, source document metadata, and source range hints. Store it in lesson metadata and topic metadata. Keep raw `inputText` unchanged.

- [ ] **Step 4: Run tests and verify GREEN**

Run:
`PATH=/home/lppadmin/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- server/tests/sourceLessonMaterialV2.finalize.test.ts`

Expected: PASS.

### Task 4: Viewer API And React Rendering

**Files:**
- Modify: `server/routes/courseRoutes.ts`
- Modify: `client/src/pages/LessonViewer.tsx`
- Test: `server/tests/sourceLessonMaterialV2.viewer.test.ts`
- Test: existing viewer tests if needed

- [ ] **Step 1: Write failing tests**

Assert the viewer API returns stored V2 when present and falls back to V1 when absent.

- [ ] **Step 2: Run tests and verify RED**

Run:
`PATH=/home/lppadmin/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- server/tests/sourceLessonMaterialV2.viewer.test.ts`

Expected: FAIL because stored V2 is ignored.

- [ ] **Step 3: Implement viewer API preference**

Update `/api/lessons/:lessonId/viewer` to prefer `metadata.sourceLessonContentV2` and only call V1 builder when V2 is absent.

- [ ] **Step 4: Update React rendering**

Render V2 block types in the existing Lesson Material area, with V1 fallback preserved.

- [ ] **Step 5: Run tests and verify GREEN**

Run:
`PATH=/home/lppadmin/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- server/tests/sourceLessonMaterialV2.viewer.test.ts`

Expected: PASS.

### Task 5: End-To-End Readiness Checks

**Files:**
- Modify only if tests reveal defects.

- [ ] **Step 1: Run targeted test matrix**

Run:
`PATH=/home/lppadmin/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- server/tests/sourceLessonMaterialV2.test.ts server/tests/sourceMediaExtractor.test.ts server/tests/sourceLessonMaterialV2.finalize.test.ts server/tests/sourceLessonMaterialV2.viewer.test.ts`

- [ ] **Step 2: Run typecheck**

Run:
`PATH=/home/lppadmin/.nvm/versions/node/v20.20.2/bin:$PATH npx tsc --noEmit`

- [ ] **Step 3: Commit and push before deployment**

Commit all implementation changes and push the branch before DEV deployment.

- [ ] **Step 4: Restart/deploy local DEV variants**

Use the source-controlled local app workflow for both cloud and onprem.

- [ ] **Step 5: Browser verify single-selection journeys**

Using the host browser, verify:
- PDF: one Chapter 2 course, Source DB bounded to Chapter 2, learner viewer uses coherent V2 with Figure 2 near the ramp context.
- DOCX: one selected section, Source DB bounded, learner viewer shows embedded visual near source text.
- PPTX: one selected slide range, Source DB bounded, learner viewer shows slide visual with slide text.

- [ ] **Step 6: Browser verify multi-chapter regression**

Create a Grade 9 PDF course with chapters 1-4 selected and verify Chapter 2 excludes Chapter 3 text/visuals.

