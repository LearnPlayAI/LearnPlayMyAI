# Source-Aware Media Course Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert uploaded PDF, DOCX, and PPTX course source files from temporary text inputs into durable, reusable source packages with extracted media that can be used in lessons and quiz questions.

**Architecture:** Add a normalized source-document and source-asset layer that survives course finalization, while keeping the existing course draft, lesson, and quiz flows intact. Extraction becomes format-aware and emits text segments plus media assets; lesson and quiz generation consume selected asset references instead of inventing visuals where source visuals are available. Image translation is intentionally out of scope for this plan.

**Tech Stack:** TypeScript, Express, Drizzle/Postgres, Object Storage abstraction for cloud/onprem, React, TanStack Query, existing AI/Gamma services, Jest.

---

## Scope And Ground Rules

- In scope: PDF, DOCX, PPTX source documents; embedded images; rendered PDF pages; slide thumbnails; captions; alt text candidates; source-to-lesson and source-to-quiz linking; admin review UI; learner lesson and quiz display support.
- Out of scope: translating image pixels, editing source images, automatic relabelling of embedded text, OCR for scanned/image-only PDFs beyond a clear warning and future hook.
- Source changes happen only in `/antigravity/Cloud-On-Prem`.
- Cloud and onprem must remain contract-compatible.
- The implementer must confirm code is ready for end-to-end testing, then the user will deploy and execute full user journeys.

## File Structure

- Modify `shared/schema.ts`
  - Add durable source document and source asset tables.
  - Add source asset link metadata to lessons/quizzes where needed.
- Modify `shared/courseFrameworkContracts.ts`
  - Add `sourceAssetSchema`, `sourceAssetRefSchema`, and media-aware fields on generated lessons and extracted content.
- Create `server/services/sourceAssetService.ts`
  - Own durable source document registration, asset creation, asset lookup, and draft-to-course promotion.
- Create `server/services/sourceMediaExtractor.ts`
  - Format-specific media extraction entrypoint for PDF/DOCX/PPTX.
- Modify `server/services/courseFrameworkExtractor.ts`
  - Preserve current text extraction behavior and call media extraction as a companion step.
- Modify `server/workers/documentExtractionWorker.ts`
  - Store extracted assets and attach media references to draft segments.
- Modify `server/routes/courseFrameworkRoutes.ts`
  - Return source assets in document and draft APIs.
  - Preserve source assets during finalization instead of deleting everything needed for future traceability.
- Modify `server/objectStorage.ts`, `server/objectStorage-gcs.ts`, `server/objectStorage-onprem.ts`
  - Add durable private source asset upload/download/delete helpers.
- Modify `server/routes/aiRoutes.ts`
  - Pass selected source assets into quiz generation and persist `quizCards.imageKey`.
- Modify `server/ai/aiService.ts`
  - Allow quiz generation prompts to reference selected visual assets by caption/context, without sending image pixels in the first implementation.
- Modify `client/src/pages/CourseDocumentWizard.tsx`
  - Add source asset review, selection, and lesson linking controls.
- Modify `client/src/pages/LessonViewer.tsx`
  - Render lesson source visuals where included in the lesson asset contract.
- Modify quiz gameplay/admin components that display quiz cards
  - Ensure `quizCards.imageKey` renders consistently in admin preview and gameplay.
- Add tests:
  - `server/tests/sourceAssetService.test.ts`
  - `server/tests/sourceMediaExtractor.test.ts`
  - `server/tests/courseSourceAssetContracts.test.ts`
  - `client/src/tests/courseDocumentWizardSourceAssets.test.tsx`
  - Extend existing quiz and course framework tests.

---

## Task 1: Add Shared Source Asset Contracts

**Files:**
- Modify: `shared/courseFrameworkContracts.ts`
- Test: `tests/courseSourceAssetContracts.test.ts`

- [ ] **Step 1: Write failing contract tests**

Add tests that validate a source asset ref can represent a PDF page figure, a DOCX inline image, and a PPTX slide image.

```ts
import {
  sourceAssetSchema,
  sourceAssetRefSchema,
  generatedLessonSchema,
} from "../shared/courseFrameworkContracts";

describe("source asset contracts", () => {
  test("accepts extracted PDF image asset metadata", () => {
    const parsed = sourceAssetSchema.parse({
      id: "asset-1",
      sourceDocumentId: "doc-1",
      assetType: "image",
      storageKey: "/private/source-assets/org/course/doc/page-7-figure-1.png",
      mimeType: "image/png",
      pageOrSlide: 7,
      caption: "Figure 1",
      altText: "Orthographic drawing example",
      width: 900,
      height: 650,
      extractionMethod: "pdfimages",
      containsEmbeddedText: false,
    });
    expect(parsed.pageOrSlide).toBe(7);
  });

  test("allows generated lessons to carry source asset references", () => {
    const parsed = generatedLessonSchema.parse({
      title: "Orthographic drawing",
      description: "Learn top, side, and front views.",
      objectives: ["Identify top, side, and front views"],
      sourceAssets: [
        {
          assetId: "asset-1",
          recommendedUse: "lesson_visual",
          caption: "Figure 1",
          pageOrSlide: 7,
        },
      ],
    });
    expect(parsed.sourceAssets?.[0]?.recommendedUse).toBe("lesson_visual");
  });

  test("rejects invalid source asset usage labels", () => {
    expect(() =>
      sourceAssetRefSchema.parse({
        assetId: "asset-1",
        recommendedUse: "translate_image",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm test -- tests/courseSourceAssetContracts.test.ts --runInBand`

Expected: FAIL because `sourceAssetSchema` and `sourceAssetRefSchema` do not exist.

- [ ] **Step 3: Implement shared schemas**

Add these exports to `shared/courseFrameworkContracts.ts`:

```ts
export const sourceAssetTypeSchema = z.enum([
  "image",
  "page_snapshot",
  "slide_snapshot",
  "table_snapshot",
]);

export const sourceAssetUseSchema = z.enum([
  "lesson_visual",
  "quiz_stimulus",
  "reference",
]);

export const sourceAssetSchema = z.object({
  id: z.string().min(1),
  sourceDocumentId: z.string().min(1),
  assetType: sourceAssetTypeSchema,
  storageKey: z.string().min(1),
  mimeType: z.string().min(1),
  pageOrSlide: z.number().int().positive().nullable().optional(),
  caption: z.string().nullable().optional(),
  altText: z.string().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  extractionMethod: z.string().min(1),
  containsEmbeddedText: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
});

export const sourceAssetRefSchema = z.object({
  assetId: z.string().min(1),
  recommendedUse: sourceAssetUseSchema,
  caption: z.string().nullable().optional(),
  altText: z.string().nullable().optional(),
  pageOrSlide: z.number().int().positive().nullable().optional(),
  sourceSegmentIds: z.array(z.string()).optional(),
});
```

Extend `generatedLessonSchema`:

```ts
sourceAssets: z.array(sourceAssetRefSchema).optional(),
```

Extend `extractedContentSchema`:

```ts
sourceAssets: z.array(sourceAssetSchema).optional(),
```

- [ ] **Step 4: Run contract tests**

Run: `npm test -- tests/courseSourceAssetContracts.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/courseFrameworkContracts.ts tests/courseSourceAssetContracts.test.ts
git commit -m "feat: add source asset contracts"
```

---

## Task 2: Add Durable Source Document And Asset Schema

**Files:**
- Modify: `shared/schema.ts`
- Create: `migrations/0100_source_documents_and_assets.sql`
- Test: `tests/courseSourceAssetContracts.test.ts`

- [ ] **Step 1: Write failing schema contract assertions**

Extend `tests/courseSourceAssetContracts.test.ts`:

```ts
import {
  courseSourceDocuments,
  courseSourceAssets,
  courseSourceAssetLinks,
} from "../shared/schema";

test("source document tables expose expected columns", () => {
  expect(courseSourceDocuments.organizationId).toBeDefined();
  expect(courseSourceDocuments.originalStoragePath).toBeDefined();
  expect(courseSourceAssets.storageKey).toBeDefined();
  expect(courseSourceAssets.pageOrSlide).toBeDefined();
  expect(courseSourceAssetLinks.linkedEntityType).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- tests/courseSourceAssetContracts.test.ts --runInBand`

Expected: FAIL because tables do not exist.

- [ ] **Step 3: Add schema tables**

Add to `shared/schema.ts` near course draft document tables:

```ts
export const courseSourceDocuments = pgTable("courseSourceDocuments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  createdBy: varchar("createdBy").notNull().references(() => users.id),
  draftId: varchar("draftId").references(() => courseDraftFrameworks.id, { onDelete: "set null" }),
  courseId: varchar("courseId").references(() => courses.id, { onDelete: "set null" }),
  fileName: varchar("fileName").notNull(),
  mimeType: varchar("mimeType").notNull(),
  fileSize: integer("fileSize").notNull(),
  originalStoragePath: varchar("originalStoragePath").notNull(),
  checksum: varchar("checksum"),
  pageCount: integer("pageCount"),
  slideCount: integer("slideCount"),
  extractionStatus: extractionStatusEnum("extractionStatus").default("pending"),
  extractionError: text("extractionError"),
  extractedTextHash: varchar("extractedTextHash"),
  licenseMetadata: jsonb("licenseMetadata"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
}, (table) => [
  index("IDX_course_source_documents_org").on(table.organizationId),
  index("IDX_course_source_documents_draft").on(table.draftId),
  index("IDX_course_source_documents_course").on(table.courseId),
]);

export const courseSourceAssets = pgTable("courseSourceAssets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceDocumentId: varchar("sourceDocumentId").notNull().references(() => courseSourceDocuments.id, { onDelete: "cascade" }),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  assetType: varchar("assetType").notNull(),
  storageKey: varchar("storageKey").notNull(),
  mimeType: varchar("mimeType").notNull(),
  pageOrSlide: integer("pageOrSlide"),
  caption: text("caption"),
  altText: text("altText"),
  width: integer("width"),
  height: integer("height"),
  textBefore: text("textBefore"),
  textAfter: text("textAfter"),
  containsEmbeddedText: boolean("containsEmbeddedText").default(false),
  extractionMethod: varchar("extractionMethod").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").defaultNow(),
}, (table) => [
  index("IDX_course_source_assets_document").on(table.sourceDocumentId),
  index("IDX_course_source_assets_org").on(table.organizationId),
  index("IDX_course_source_assets_page").on(table.sourceDocumentId, table.pageOrSlide),
]);

export const courseSourceAssetLinks = pgTable("courseSourceAssetLinks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  assetId: varchar("assetId").notNull().references(() => courseSourceAssets.id, { onDelete: "cascade" }),
  linkedEntityType: varchar("linkedEntityType").notNull(), // draft_lesson | lesson | quiz_card | course
  linkedEntityId: varchar("linkedEntityId").notNull(),
  recommendedUse: varchar("recommendedUse").notNull().default("reference"),
  sourceSegmentIds: jsonb("sourceSegmentIds"),
  createdBy: varchar("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow(),
}, (table) => [
  index("IDX_course_source_asset_links_asset").on(table.assetId),
  index("IDX_course_source_asset_links_entity").on(table.linkedEntityType, table.linkedEntityId),
]);
```

- [ ] **Step 4: Add migration**

Create `migrations/0100_source_documents_and_assets.sql` with the equivalent DDL, using camelCase column names to match existing schema style.

- [ ] **Step 5: Validate schema**

Run: `npm test -- tests/courseSourceAssetContracts.test.ts --runInBand`

Expected: PASS.

Run: `npm run check`

Expected: TypeScript passes.

- [ ] **Step 6: Commit**

```bash
git add shared/schema.ts migrations/0100_source_documents_and_assets.sql tests/courseSourceAssetContracts.test.ts
git commit -m "feat: add durable course source asset tables"
```

---

## Task 3: Add Object Storage Helpers For Source Assets

**Files:**
- Modify: `server/objectStorage.ts`
- Modify: `server/objectStorage-gcs.ts`
- Modify: `server/objectStorage-onprem.ts`
- Test: `server/tests/uploadPathResolution.test.ts`

- [ ] **Step 1: Add failing storage path tests**

Extend `server/tests/uploadPathResolution.test.ts` with assertions for source document and source asset keys:

```ts
test("course source asset storage keys use private source-assets domain", () => {
  const key = buildCanonicalStorageKey({
    scope: "private",
    domain: "source-assets",
    extension: ".png",
    seed: "org-1:doc-1:page-7:figure-1",
  });
  expect(key).toContain("/private/");
  expect(key).toContain("source-assets");
  expect(key.endsWith(".png")).toBe(true);
});
```

- [ ] **Step 2: Run test**

Run: `npm test -- server/tests/uploadPathResolution.test.ts --runInBand`

Expected: FAIL if the domain is not allowed by storage key validation.

- [ ] **Step 3: Add storage APIs**

Add methods to the shared object storage interface/implementations:

```ts
async uploadCourseSourceOriginal(storagePath: string, buffer: Buffer, contentType: string): Promise<string>;
async downloadCourseSourceOriginal(storagePath: string): Promise<Buffer>;
async uploadCourseSourceAsset(storagePath: string, buffer: Buffer, contentType: string): Promise<string>;
async getCourseSourceAssetSignedURL(storagePath: string, ttlSec?: number): Promise<string>;
async deleteCourseSourceObject(storagePath: string): Promise<void>;
```

Use private object storage by default. Do not expose source assets as public objects until access control and attribution handling are explicit.

- [ ] **Step 4: Run storage tests**

Run: `npm test -- server/tests/uploadPathResolution.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/objectStorage.ts server/objectStorage-gcs.ts server/objectStorage-onprem.ts server/tests/uploadPathResolution.test.ts
git commit -m "feat: add course source asset storage helpers"
```

---

## Task 4: Implement Source Asset Service

**Files:**
- Create: `server/services/sourceAssetService.ts`
- Test: `server/tests/sourceAssetService.test.ts`

- [ ] **Step 1: Write failing service tests**

Create tests for registering a source document, adding assets, and promoting draft source documents to a course.

```ts
describe("SourceAssetService", () => {
  test("builds source asset refs for a draft lesson", async () => {
    const refs = SourceAssetService.toLessonSourceAssetRefs([
      {
        id: "asset-1",
        sourceDocumentId: "doc-1",
        caption: "Figure 1",
        altText: "Cube drawing",
        pageOrSlide: 7,
      } as any,
    ], "lesson_visual");

    expect(refs).toEqual([
      {
        assetId: "asset-1",
        recommendedUse: "lesson_visual",
        caption: "Figure 1",
        altText: "Cube drawing",
        pageOrSlide: 7,
      },
    ]);
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `npm test -- server/tests/sourceAssetService.test.ts --runInBand`

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement service**

Implement:

```ts
export class SourceAssetService {
  static toLessonSourceAssetRefs(
    assets: Array<{ id: string; caption?: string | null; altText?: string | null; pageOrSlide?: number | null }>,
    recommendedUse: "lesson_visual" | "quiz_stimulus" | "reference",
  ) {
    return assets.map((asset) => ({
      assetId: asset.id,
      recommendedUse,
      caption: asset.caption || null,
      altText: asset.altText || null,
      pageOrSlide: asset.pageOrSlide || null,
    }));
  }

  static async createSourceDocument(input: {
    organizationId: string;
    createdBy: string;
    draftId: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    originalStoragePath: string;
    checksum?: string;
  }) {
    const [row] = await db.insert(courseSourceDocuments).values(input).returning();
    return row;
  }

  static async createAssets(input: {
    organizationId: string;
    sourceDocumentId: string;
    assets: Array<{
      assetType: string;
      storageKey: string;
      mimeType: string;
      pageOrSlide?: number | null;
      caption?: string | null;
      altText?: string | null;
      width?: number | null;
      height?: number | null;
      containsEmbeddedText?: boolean;
      extractionMethod: string;
      metadata?: Record<string, unknown>;
    }>;
  }) {
    if (input.assets.length === 0) return [];
    return db.insert(courseSourceAssets).values(
      input.assets.map((asset) => ({
        ...asset,
        organizationId: input.organizationId,
        sourceDocumentId: input.sourceDocumentId,
      })),
    ).returning();
  }

  static async promoteDraftSourcesToCourse(draftId: string, courseId: string) {
    await db.update(courseSourceDocuments)
      .set({ courseId, draftId: null, updatedAt: new Date() })
      .where(eq(courseSourceDocuments.draftId, draftId));
  }
}
```

- [ ] **Step 4: Run service test**

Run: `npm test -- server/tests/sourceAssetService.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/sourceAssetService.ts server/tests/sourceAssetService.test.ts
git commit -m "feat: add source asset service"
```

---

## Task 5: Extract Media From PDFs

**Files:**
- Create: `server/services/sourceMediaExtractor.ts`
- Modify: `server/services/courseFrameworkExtractor.ts`
- Test: `server/tests/sourceMediaExtractor.test.ts`

- [ ] **Step 1: Write failing PDF extraction test**

Use a small fixture PDF with one image. If no fixture exists, add a minimal PDF fixture under `tests/fixtures/course-framework/upload/pdf-with-image.pdf`.

```ts
test("extracts PDF media asset descriptors", async () => {
  const buffer = await fs.readFile("tests/fixtures/course-framework/upload/pdf-with-image.pdf");
  const result = await SourceMediaExtractor.extractMedia({
    buffer,
    fileName: "pdf-with-image.pdf",
    mimeType: "application/pdf",
    organizationId: "org-1",
    sourceDocumentId: "doc-1",
  });

  expect(result.assets.length).toBeGreaterThan(0);
  expect(result.assets[0].assetType).toMatch(/image|page_snapshot/);
  expect(result.assets[0].pageOrSlide).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run failing test**

Run: `npm test -- server/tests/sourceMediaExtractor.test.ts --runInBand`

Expected: FAIL because extractor does not exist.

- [ ] **Step 3: Implement PDF media extraction**

Implement an extractor that:

- Uses `pdfimages -list` to detect embedded images where available.
- Uses `pdftoppm` to create low-resolution page snapshots for pages with meaningful extracted text or images.
- Filters tiny masks and decorative artifacts.
- Produces asset descriptors with `storageKey`, `assetType`, `mimeType`, `pageOrSlide`, `width`, `height`, `caption`, `altText`, `containsEmbeddedText`, and `metadata`.
- Does not fail text extraction if media extraction fails; it returns warnings.

Initial caption heuristic:

```ts
function inferCaption(pageText: string, pageNumber: number): string | null {
  const figureMatch = pageText.match(/Figure\s+\d+[^\n]*/i);
  return figureMatch?.[0]?.trim() || `Page ${pageNumber}`;
}
```

- [ ] **Step 4: Run extractor tests**

Run: `npm test -- server/tests/sourceMediaExtractor.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/sourceMediaExtractor.ts server/services/courseFrameworkExtractor.ts server/tests/sourceMediaExtractor.test.ts tests/fixtures/course-framework/upload/pdf-with-image.pdf
git commit -m "feat: extract source media from PDFs"
```

---

## Task 6: Extract Media From DOCX And PPTX

**Files:**
- Modify: `server/services/sourceMediaExtractor.ts`
- Modify: `server/services/pptxExtractor.ts` if needed
- Test: `server/tests/sourceMediaExtractor.test.ts`

- [ ] **Step 1: Add failing DOCX/PPTX tests**

Add tests using small fixtures:

```ts
test("extracts DOCX inline images", async () => {
  const buffer = await fs.readFile("tests/fixtures/course-framework/upload/docx-with-image.docx");
  const result = await SourceMediaExtractor.extractMedia({
    buffer,
    fileName: "docx-with-image.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    organizationId: "org-1",
    sourceDocumentId: "doc-1",
  });
  expect(result.assets.some((asset) => asset.assetType === "image")).toBe(true);
});

test("extracts PPTX slide snapshots or embedded images", async () => {
  const buffer = await fs.readFile("tests/fixtures/course-framework/upload/pptx-with-image.pptx");
  const result = await SourceMediaExtractor.extractMedia({
    buffer,
    fileName: "pptx-with-image.pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    organizationId: "org-1",
    sourceDocumentId: "doc-1",
  });
  expect(result.assets.length).toBeGreaterThan(0);
  expect(result.assets[0].pageOrSlide).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- server/tests/sourceMediaExtractor.test.ts --runInBand`

Expected: FAIL for DOCX/PPTX cases.

- [ ] **Step 3: Implement DOCX extraction**

Unzip DOCX, inspect `word/media/*`, and create image asset descriptors. If nearby captions are hard to map in the first pass, set `caption` to the file-derived label and `metadata.captionConfidence = "low"`.

- [ ] **Step 4: Implement PPTX extraction**

Unzip PPTX, inspect `ppt/media/*`, map slide relationships from `ppt/slides/_rels/slideN.xml.rels` where practical, and emit `pageOrSlide` as the slide number. Use slide title text from existing PPTX extraction when available.

- [ ] **Step 5: Run extractor tests**

Run: `npm test -- server/tests/sourceMediaExtractor.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/services/sourceMediaExtractor.ts server/services/pptxExtractor.ts server/tests/sourceMediaExtractor.test.ts tests/fixtures/course-framework/upload/docx-with-image.docx tests/fixtures/course-framework/upload/pptx-with-image.pptx
git commit -m "feat: extract source media from DOCX and PPTX"
```

---

## Task 7: Wire Media Extraction Into Draft Document Processing

**Files:**
- Modify: `server/workers/documentExtractionWorker.ts`
- Modify: `server/routes/courseFrameworkRoutes.ts`
- Modify: `server/services/courseFrameworkExtractor.ts`
- Test: `server/tests/courseLesson.integration.test.ts`

- [ ] **Step 1: Write failing integration test**

Add a test proving uploaded draft documents create source document and source asset rows when processed.

```ts
test("processed draft document stores durable source document and assets", async () => {
  // Arrange a draft document row with a fixture buffer in object storage test double.
  // Act by invoking DocumentExtractionWorker.processDocumentForTest(doc).
  // Assert source document row exists and at least one asset is linked to the source document.
});
```

- [ ] **Step 2: Run failing test**

Run: `npm test -- server/tests/courseLesson.integration.test.ts --runInBand`

Expected: FAIL because processing does not create source asset rows.

- [ ] **Step 3: Register source documents on upload**

In `server/routes/courseFrameworkRoutes.ts`, after storing the uploaded draft document, also create a `courseSourceDocuments` row with the same original storage path.

- [ ] **Step 4: Store media during worker processing**

In `DocumentExtractionWorker`, after text extraction:

```ts
const mediaResult = await SourceMediaExtractor.extractMedia({
  buffer: fileBuffer,
  fileName: doc.fileName,
  mimeType: doc.mimeType,
  organizationId: sourceDocument.organizationId,
  sourceDocumentId: sourceDocument.id,
});

await SourceAssetService.createAssets({
  organizationId: sourceDocument.organizationId,
  sourceDocumentId: sourceDocument.id,
  assets: mediaResult.assets,
});
```

Update extracted content with `sourceAssets` summaries, not signed URLs.

- [ ] **Step 5: Add draft APIs for source assets**

Add:

- `GET /api/courses/drafts/:draftId/source-assets`
- `POST /api/courses/drafts/:draftId/source-assets/links`
- `DELETE /api/courses/drafts/:draftId/source-assets/links/:linkId`

All must enforce effective organization access.

- [ ] **Step 6: Run integration test**

Run: `npm test -- server/tests/courseLesson.integration.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/workers/documentExtractionWorker.ts server/routes/courseFrameworkRoutes.ts server/services/courseFrameworkExtractor.ts server/tests/courseLesson.integration.test.ts
git commit -m "feat: store source assets during draft extraction"
```

---

## Task 8: Preserve Source Assets During Course Finalization

**Files:**
- Modify: `server/routes/courseFrameworkRoutes.ts`
- Modify: `server/services/sourceAssetService.ts`
- Test: `server/tests/courseLesson.integration.test.ts`

- [ ] **Step 1: Write failing finalization test**

Add a test proving finalization promotes source documents to the course and does not delete original source assets.

```ts
test("finalizing a draft promotes source assets to the created course", async () => {
  // Arrange generated draft with source document and asset rows.
  // Act finalize.
  // Assert courseSourceDocuments.courseId equals created course id.
  // Assert courseSourceAssets rows still exist.
});
```

- [ ] **Step 2: Run failing test**

Run: `npm test -- server/tests/courseLesson.integration.test.ts --runInBand`

Expected: FAIL because finalize currently deletes draft files without source promotion.

- [ ] **Step 3: Promote sources after course creation**

In finalization, after `result.course.id` exists:

```ts
await SourceAssetService.promoteDraftSourcesToCourse(draftId, result.course.id);
```

Only delete temporary draft upload objects if the durable source document original has been copied or points to a separate durable key.

- [ ] **Step 4: Persist selected lesson source assets**

When inserting lessons, include selected source asset refs in `lessons.metadata`:

```ts
metadata: {
  objectives: lessonData.objectives || [],
  sourceDocumentId: lessonData.sourceDocumentId || null,
  sourceSegmentIds: Array.isArray(lessonData.sourceSegmentIds) ? lessonData.sourceSegmentIds : [],
  sourceAssets: Array.isArray(lessonData.sourceAssets) ? lessonData.sourceAssets : [],
  createdFromDraft: draftId,
}
```

Also create `courseSourceAssetLinks` rows for each created lesson.

- [ ] **Step 5: Run finalization test**

Run: `npm test -- server/tests/courseLesson.integration.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/routes/courseFrameworkRoutes.ts server/services/sourceAssetService.ts server/tests/courseLesson.integration.test.ts
git commit -m "feat: preserve source assets when finalizing courses"
```

---

## Task 9: Add Admin Source Asset Review UI

**Files:**
- Modify: `client/src/pages/CourseDocumentWizard.tsx`
- Test: `client/src/tests/courseDocumentWizardSourceAssets.test.tsx`

- [ ] **Step 1: Write failing UI test**

Test that source assets are shown and can be selected for a lesson.

```tsx
test("shows extracted source assets and links one to a lesson", async () => {
  render(<CourseDocumentWizard />);
  expect(await screen.findByText(/Extracted visuals/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /Use in lesson/i }));
  expect(await screen.findByText(/Linked to lesson/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run failing UI test**

Run: `npm test -- client/src/tests/courseDocumentWizardSourceAssets.test.tsx --runInBand`

Expected: FAIL because UI does not exist.

- [ ] **Step 3: Add source asset query**

Add TanStack Query call:

```ts
const { data: sourceAssetsData } = useQuery({
  queryKey: ['/api/courses/drafts', draftId, 'source-assets'],
  enabled: !!draftId,
});
```

- [ ] **Step 4: Add review panel**

In the review step, show an "Extracted visuals" section with:

- thumbnail
- caption
- page/slide number
- source file name
- embedded text warning if `containsEmbeddedText`
- controls for `Use in lesson`, `Use in quiz`, `Reference only`

- [ ] **Step 5: Update lesson state**

When the admin links an asset, update `GeneratedLesson.sourceAssets` and persist via existing `onUpdate({ generatedLessons })`.

- [ ] **Step 6: Run UI test**

Run: `npm test -- client/src/tests/courseDocumentWizardSourceAssets.test.tsx --runInBand`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/CourseDocumentWizard.tsx client/src/tests/courseDocumentWizardSourceAssets.test.tsx
git commit -m "feat: review and link source visuals in course wizard"
```

---

## Task 10: Include Source Assets In Lesson Generation And Viewing

**Files:**
- Modify: `server/routes/courseRoutes.ts`
- Modify: `server/services/lessonService.ts`
- Modify: `client/src/pages/LessonViewer.tsx`
- Test: `server/tests/courseLesson.integration.test.ts`
- Test: `client/src/tests/lessonViewerNavigation.test.ts`

- [ ] **Step 1: Write failing lesson metadata test**

Assert a generated lesson with `metadata.sourceAssets` exposes those assets in lesson detail APIs.

- [ ] **Step 2: Run failing test**

Run: `npm test -- server/tests/courseLesson.integration.test.ts --runInBand`

Expected: FAIL.

- [ ] **Step 3: Extend lesson detail API**

When returning lesson detail, resolve `metadata.sourceAssets` to signed asset URLs through object storage, preserving `caption`, `altText`, and `pageOrSlide`.

- [ ] **Step 4: Render in LessonViewer**

Add a compact visual reference area in `LessonViewer`:

- image thumbnail
- caption
- enlarge modal
- source page/slide label
- alt text

Do not add in-app explanatory prose about the feature.

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- server/tests/courseLesson.integration.test.ts --runInBand
npm test -- client/src/tests/lessonViewerNavigation.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/routes/courseRoutes.ts server/services/lessonService.ts client/src/pages/LessonViewer.tsx server/tests/courseLesson.integration.test.ts client/src/tests/lessonViewerNavigation.test.ts
git commit -m "feat: show source visuals in lessons"
```

---

## Task 11: Use Source Assets In Quiz Generation And Gameplay

**Files:**
- Modify: `server/routes/aiRoutes.ts`
- Modify: `server/ai/aiService.ts`
- Modify: `server/routes/quizRoutes.ts`
- Modify quiz card display/gameplay components as discovered by `rg "imageKey|quizCards"`
- Test: existing quiz route tests or create `tests/quizSourceAssets.test.ts`

- [ ] **Step 1: Write failing quiz asset test**

Assert a quiz question can be generated/published with an image key from a selected source asset.

```ts
test("quiz generation can persist source asset imageKey on quiz cards", async () => {
  // Arrange lesson with metadata.sourceAssets containing quiz_stimulus asset.
  // Act generate quiz from lesson source.
  // Assert at least one quizCards row has imageKey equal to the source asset storage key.
});
```

- [ ] **Step 2: Run failing test**

Run: `npm test -- tests/quizSourceAssets.test.ts --runInBand`

Expected: FAIL.

- [ ] **Step 3: Pass visual context to AI**

Extend quiz generation input with selected quiz stimulus assets:

```ts
visualAssets: lessonSourceAssets
  .filter((asset) => asset.recommendedUse === "quiz_stimulus")
  .map((asset) => ({
    assetId: asset.assetId,
    caption: asset.caption,
    altText: asset.altText,
    pageOrSlide: asset.pageOrSlide,
  }))
```

Prompt AI to create image-based questions only when the caption/alt text provides enough context. Do not send image bytes in this first pass.

- [ ] **Step 4: Persist image keys**

When creating `quizCards`, set `imageKey` if the generated question references a selected source asset.

- [ ] **Step 5: Render image cards**

Ensure admin quiz preview and gameplay render `imageKey` through the existing object storage signed URL pattern.

- [ ] **Step 6: Run quiz tests**

Run: `npm test -- tests/quizSourceAssets.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/routes/aiRoutes.ts server/ai/aiService.ts server/routes/quizRoutes.ts tests/quizSourceAssets.test.ts
git commit -m "feat: support source visuals in quiz generation"
```

---

## Task 12: Add Content Coach And Quality Warnings

**Files:**
- Modify: `server/services/contentCoachService.ts`
- Modify: `client/src/pages/CourseDocumentWizard.tsx`
- Test: relevant content coach tests or create `server/tests/contentCoachSourceAssets.test.ts`

- [ ] **Step 1: Write failing warning test**

Assert a content lesson sourced from a document with important visuals but no linked assets gets a warning.

- [ ] **Step 2: Implement visual coverage warning**

Add a rule:

- If a lesson source segment page has source assets and no lesson `sourceAssets`, warn `missing_visual_support`.
- If an asset has `containsEmbeddedText`, warn `source_image_contains_text`.
- Do not warn about image translation.

- [ ] **Step 3: Surface warning in review UI**

Show concise warnings in the lesson review/remediation area.

- [ ] **Step 4: Run tests**

Run: `npm test -- server/tests/contentCoachSourceAssets.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/contentCoachService.ts client/src/pages/CourseDocumentWizard.tsx server/tests/contentCoachSourceAssets.test.ts
git commit -m "feat: warn when lessons miss source visuals"
```

---

## Task 13: Versioning And Outdated Detection

**Files:**
- Modify: `server/services/quizVersioningService.ts`
- Modify: `server/services/lessonVersioningService.ts`
- Modify: `server/routes/courseRoutes.ts`
- Test: existing versioning tests or create `server/tests/sourceAssetVersioning.test.ts`

- [ ] **Step 1: Write failing version hash test**

Assert changing lesson source asset refs changes lesson/quiz content hash.

- [ ] **Step 2: Include source asset refs in hashes**

Include stable values in existing hash inputs:

```ts
const sourceAssetHashInput = JSON.stringify(
  sourceAssets.map((asset) => ({
    assetId: asset.assetId,
    recommendedUse: asset.recommendedUse,
    caption: asset.caption || "",
  })).sort((a, b) => a.assetId.localeCompare(b.assetId)),
);
```

- [ ] **Step 3: Mark linked quizzes outdated**

When lesson source asset refs change, mark linked quizzes outdated using the existing quiz link behavior.

- [ ] **Step 4: Run tests**

Run: `npm test -- server/tests/sourceAssetVersioning.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/quizVersioningService.ts server/services/lessonVersioningService.ts server/routes/courseRoutes.ts server/tests/sourceAssetVersioning.test.ts
git commit -m "feat: include source visuals in lesson and quiz versioning"
```

---

## Task 14: Validation Matrix And Handoff Package

**Files:**
- Create: `docs/testing/source-aware-media-course-creation.md`
- Modify tests as needed.

- [ ] **Step 1: Run static and targeted automated checks**

Run:

```bash
npm run check
npm test -- tests/courseSourceAssetContracts.test.ts --runInBand
npm test -- server/tests/sourceAssetService.test.ts --runInBand
npm test -- server/tests/sourceMediaExtractor.test.ts --runInBand
npm test -- server/tests/courseLesson.integration.test.ts --runInBand
npm test -- tests/quizSourceAssets.test.ts --runInBand
npm test -- client/src/tests/courseDocumentWizardSourceAssets.test.tsx --runInBand
```

Expected: PASS for all.

- [ ] **Step 2: Create user E2E test guide**

Create `docs/testing/source-aware-media-course-creation.md` with:

- Preconditions.
- Cloud and onprem route list.
- Roles: `superadmin`, `custsuper`, `orgadmin`, `teacher`, `student`.
- Journey 1: PDF textbook upload, extract, review assets, create course.
- Journey 2: DOCX upload with inline images.
- Journey 3: PPTX upload with slide images.
- Journey 4: lesson generation with selected source visuals.
- Journey 5: quiz generation with selected source visuals.
- Journey 6: learner consumes lesson visuals and image-based quiz.
- Journey 7: change selected source asset and verify linked quiz outdated state.
- Failure capture instructions with screenshot requirements.

- [ ] **Step 3: Add non-translation note**

Document: image pixels are preserved as original source images; only captions/alt text are text fields. Image translation is intentionally not implemented.

- [ ] **Step 4: Final readiness statement**

Before handing to user, confirm:

- migrations exist,
- automated checks pass,
- no implementation-only TODOs remain,
- cloud/onprem code paths use shared object storage contracts,
- user can deploy and execute E2E journeys.

- [ ] **Step 5: Commit**

```bash
git add docs/testing/source-aware-media-course-creation.md
git commit -m "docs: add source-aware media course testing guide"
```

---

## Role-Journey Matrix For User E2E

| Role | Variant | Journey | Expected Result |
| --- | --- | --- | --- |
| superadmin | cloud | Verify feature availability and platform pricing still loads | pass |
| custsuper | onprem | Verify feature availability and org context | pass |
| orgadmin | cloud/onprem | Upload PDF/DOCX/PPTX, review source visuals, finalize course | pass |
| teacher | cloud/onprem | Generate lesson and quiz from selected source visuals | pass |
| student | cloud/onprem | Consume lesson visuals and answer image-based quiz | pass |
| unauthenticated | cloud/onprem | Public/auth theme routing remains unchanged | pass |

## Completion Criteria

- Uploaded PDF/DOCX/PPTX source files produce text plus media assets.
- Source assets survive course finalization.
- Admin can view and select source visuals per generated lesson.
- Lesson viewer can show source visuals with captions and alt text.
- Quiz cards can use selected source visuals via `imageKey`.
- Changing lesson source visual selections can mark linked quizzes outdated.
- Image translation is absent by design.
- Automated checks pass locally.
- User receives an E2E testing guide and readiness confirmation.

## Self-Review

- Spec coverage: durable source library, unified media extraction, admin review, lesson use, quiz use, versioning, accessibility metadata, and no image translation are covered.
- Placeholder scan: No task uses "TBD" or "implement later"; each task has explicit files, tests, commands, and expected results.
- Type consistency: `sourceAssets`, `sourceAssetSchema`, `sourceAssetRefSchema`, and durable source table names are consistent across tasks.
