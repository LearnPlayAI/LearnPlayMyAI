# Source Lesson Material V2 Design

**Goal:** Create a complete, testable source-document-to-learner-material journey where uploaded textbook PDFs, Word documents, and PowerPoint decks produce coherent, source-grounded lesson material with correctly attached visuals, while preserving raw Source DB text for audit and editing.

**Approved approach:** Deterministic V2 extraction plus minimal constrained AI repair.

**Scope:** Shared cloud and onprem course-builder behavior for PDF, DOCX, and PPTX uploads. The initial acceptance fixture is `Garde 9 Technology_Learner Book.pdf`, especially Chapter 2, "Provide for Wheelchairs", but the V2 contract and viewer must be format-agnostic.

## Problem Summary

The current course-builder journey stores learner material as flat extracted text in `lessons.inputText` and links source visuals as a loose page-based list in lesson metadata. The learner viewer reconstructs material at request time using `buildSourceLessonContent`, which only recognizes simple page markers, numbered headings, activities, and page-matched visuals.

The audit showed the Chapter 2 onprem DEV lesson contains Chapter 3 text at the end and includes unrelated Chapter 3 visuals. The source visuals exist in `courseSourceAssets`, but figure references such as "Figure 2" are not reliably tied to the specific visual that learners need.

Although the failing example is a PDF, the same architectural weakness applies to DOCX and PPTX uploads: once extracted source is flattened into raw text and visuals are stored separately, the learner viewer loses the document structure that connects paragraphs, activities, figures, diagrams, and slides.

## Design Principles

1. Preserve raw extraction.
   `lessons.inputText` and Source DB versions remain the editable/raw source audit trail.

2. Store learner material explicitly.
   The learner viewer should prefer stored `sourceLessonContentV2` rather than reconstructing learner content from raw text on every request.

3. Deterministic safety first.
   Document boundaries, chapter/section/slide boundaries, visual registries, and cross-lesson contamination gates must be computed without AI where possible.

4. Minimal AI repair only.
   AI may improve cohesion and layout classification inside a strict JSON schema, but it must not invent concepts, examples, measurements, figures, or activities.

5. Trace every learner-facing block.
   Every V2 block must include source page or slide evidence and, where relevant, visual or asset references.

6. Cloud/onprem parity.
   The implementation must run through the same application code and data contracts in both variants.

## New Stored Contract

Store `sourceLessonContentV2` in lesson metadata initially, with a schema in shared code so it can later be promoted to a dedicated table if needed.

The V2 object must include:

- `version`: literal `2`.
- `lessonId`, `title`, `sourceDocumentId`, `sourceDocumentName`, `sourceDocumentType`: `pdf`, `docx`, or `pptx`.
- `sourceTextHash`: hash of the raw source text used to generate V2.
- `generation`: method, timestamp, deterministic repair status, AI repair status, model/provider when AI is used.
- `quality`: warnings, blocking findings, confidence values, and validation result.
- `sections`: ordered learner sections.
- `visualRegistry`: all known figures, embedded images, page snapshots, or slide visuals relevant to the lesson.
- `sourceRange`: page start/end, slide start/end, and optional chapter/outline IDs.

Each section must include:

- stable `id`
- `title`
- ordered `blocks`
- `sourcePageStart` and `sourcePageEnd`, or `sourceSlideStart` and `sourceSlideEnd`
- `sourceSegmentIds` where available

Each block must include:

- `type`: `heading`, `paragraph`, `bullet_list`, `activity`, `sidebar`, `figure_ref`, `figure`, `callout`
- `text` or structured list items
- `sourcePage` or `sourceSlide`
- optional `figureNumber`
- optional `assetIds`
- `confidence`

Each visual registry entry must include:

- `visualType`: `figure`, `embedded_image`, `page_snapshot`, `slide_snapshot`, `diagram`, `table_snapshot`
- `figureNumber` or slide number where known
- `caption`
- `page` or `slide`
- `assetIds`
- `assetType`
- `textBefore`
- `textAfter`
- `confidence`

## Extraction Flow

### 1. Raw Document Extraction

Continue using `CourseFrameworkExtractor.extract` to produce raw text, sections, document outline, source map, and draft segments.

Enhance extraction to retain format-specific positional metadata:

- PDF: page-level text, page snapshots, embedded image positions where available.
- DOCX: heading hierarchy, paragraph/list/table order, embedded image package paths, nearby captions/alt text where available.
- PPTX: slide order, slide title/body/notes, embedded image package paths, slide thumbnails or rendered snapshots where available.

V2 must use this structured metadata rather than relying on literal `Page N` lines in `inputText`.

### 2. Visual Registry

Add deterministic visual registry builders for each supported source type.

For PDFs:

- scan page text for figure markers and captions
- map embedded images and page snapshots to pages
- prefer embedded images for actual figures
- retain page snapshots as fallback context
- capture surrounding text before and after each figure marker
- mark ambiguous captions with warnings instead of pretending they are authoritative

For DOCX:

- read embedded images from `word/media`
- map images to surrounding paragraphs by relationships where practical
- detect captions from nearby paragraphs such as `Figure N`, `Table N`, or bold caption-like text
- preserve heading-path context for each image
- use document image order as a fallback with low confidence

For PPTX:

- read embedded images from `ppt/media`
- map images to slide numbers through slide relationship files where practical
- capture slide title, body, and notes as surrounding context
- create slide snapshot entries when slide rendering is available
- treat each slide as a source unit that can become one or more V2 sections

For the Grade 9 Chapter 2 fixture, the registry must identify:

- page 20 / textbook page 15: Figure 2 ramp/stairs visual
- page 22: Figure 3 isometric cube grid
- page 23: Figure 4 cake-slice ramp visual
- page 24: Figure 5 ramp dimension visual
- page 25: Figure 6 incorrect design visual

### 3. Lesson Boundary Resolution

Before finalization, compute confirmed source ranges for selected lessons from document outline, selected topics, page ranges, or slide ranges. The range must prevent Chapter 2 from absorbing Chapter 3 text and visuals.

If the system cannot determine a clean range, it should block finalization or mark the lesson as requiring review rather than producing learner-ready material.

### 4. Deterministic V2 Builder

Create a builder that converts selected raw text, segments, source pages/slides, and visual registry entries into `sourceLessonContentV2`.

The builder must:

- split headings, paragraphs, bullet lists, activities, sidebars, and figure references
- preserve DOCX heading/list/table order and PPTX slide title/body/notes order
- preserve textbook measurements and instructions exactly
- attach figures near matching `Figure N` references
- attach DOCX embedded images near their related paragraphs/headings
- attach PPTX visuals to the slide-derived section they came from
- attach "previous page" references to the prior page figure when evidence supports it
- exclude visuals outside the confirmed lesson source range or slide range
- produce warnings for unmatched figure references

### 5. Minimal AI Repair

After deterministic V2 is built, optionally call AI with:

- lesson title
- deterministic V2 JSON
- raw text excerpts with page IDs
- visual registry entries
- strict output schema

AI may:

- merge broken line wraps
- improve section titles
- convert text into readable paragraphs/lists
- classify sidebar/callout text
- add short transitions only when they are directly grounded in the supplied source
- generate concise alt text for visuals

AI must not:

- add facts not present in source
- remove measurements/specifications/activities
- invent figure/image/slide captions
- introduce new examples
- translate image pixels

The AI output must pass schema validation and source validation. If validation fails, use deterministic V2 and record the AI failure as a warning.

## Viewer Flow

The learner viewer should prefer `metadata.sourceLessonContentV2` when available. If V2 is absent, continue using the current V1 `buildSourceLessonContent` fallback.

The viewer must render:

- objectives
- section navigation
- structured paragraphs and bullet lists
- activities
- sidebars/callouts
- visuals inline with relevant text
- source page/slide/figure labels for trust and review

The existing Source DB studio should continue to open and edit raw `inputText`. A future enhancement can add a V2 preview/editor, but that is not required for the first complete journey.

## Validation Gates

Add deterministic validation before marking native lesson material learner-ready:

- no next-chapter heading inside a content lesson
- no linked visual outside the confirmed source range unless explicitly referenced and justified
- every `Figure N` reference is matched or listed as a warning
- every learner-facing block has source page or slide evidence
- V2 has at least one readable text section for content lessons
- if the lesson references visuals, at least one matching figure or page snapshot is available

For Chapter 2, validation must fail if the text includes Chapter 3 or if Chapter 3 bridge/house/roof visuals are linked.

## Test Strategy

### Unit Tests

Add tests for:

- PDF figure registry extraction from representative page text/assets
- DOCX visual registry extraction from embedded images and nearby captions
- PPTX visual registry extraction from slide images/titles/notes
- chapter boundary detection and contamination rejection
- V2 builder block classification
- figure reference matching, including "previous page"
- AI repair validation fallback when AI output is invalid

### Integration Tests

Add course-builder integration tests using deterministic fixtures.

PDF fixture mirroring the Grade 9 structure:

- chapter intro page with Figure 2
- content sections 2.1, 2.2, 2.3
- next chapter starts immediately after
- visuals on adjacent pages

DOCX fixture:

- document title
- heading hierarchy
- paragraphs, bullets, and numbered activities
- at least one embedded image with nearby `Figure 1` caption
- next heading after the selected lesson to test boundary handling

PPTX fixture:

- multiple slides with titles, body text, notes, and images
- selected slide range mapped to one content lesson
- next slide outside the lesson range to test visual exclusion

The tests must assert:

- lesson source text excludes next chapter/heading/slide range
- V2 excludes outside-range visuals
- relevant visuals are attached in order
- raw Source DB remains available

### Browser Checks

After implementation is committed and deployed to both DEV variants:

- create a new course from the Grade 9 PDF in local/onprem DEV
- select exactly one chapter: Chapter 2, "Provide for Wheelchairs"
- finalize the single-chapter course
- open Source DB for the generated Chapter 2 lesson
- verify Source DB raw text is bounded to Chapter 2 and does not include Chapter 1, Chapter 3, or unrelated front/back matter
- open the learner viewer for the generated Chapter 2 lesson
- verify the learner viewer shows coherent V2 sections for only Chapter 2
- verify Figure 2 appears near the opening ramp context
- verify Chapter 3 text and visuals are absent from Chapter 2
- repeat the same single-selection proof for one DOCX fixture section and one PPTX fixture slide range
- only after the single-selection proof passes, create a new course from the Grade 9 PDF in local/onprem DEV with chapters 1-4 selected
- verify multi-chapter course lessons remain isolated from one another
- open Chapter 2 learner material
- verify the learner viewer shows coherent V2 sections for Chapter 2
- verify Figure 2 appears near the opening ramp context
- verify Chapter 3 text and visuals are absent from Chapter 2
- verify DOCX embedded visuals and PPTX slide visuals render in V2 learner material
- repeat key checks on cloud DEV for parity

The user will perform final UAT. Codex will run browser checks first and report evidence, residual risks, and exact user test steps.

## Role And Variant Journey Matrix

| Role | Variant | Journey | Expected Result |
| --- | --- | --- | --- |
| orgadmin | cloud | Upload PDF, select chapters, finalize course | V2 material stored and learner-ready |
| orgadmin | onprem | Upload PDF, select chapters, finalize course | Same behavior as cloud |
| orgadmin | cloud | Upload DOCX/PPTX, select content, finalize course | V2 material stored and learner-ready |
| orgadmin | onprem | Upload DOCX/PPTX, select content, finalize course | Same behavior as cloud |
| teacher | cloud | Open course lessons and learner material | V2 viewer renders coherent material |
| teacher | onprem | Open course lessons and learner material | Same behavior as cloud |
| student | cloud | View assigned lesson material | Learner sees structured text and relevant visuals |
| student | onprem | View assigned lesson material | Same behavior as cloud |
| superadmin/custsuper | cloud/onprem | Audit source and artifacts | Raw Source DB and V2 evidence are inspectable |

## Completion Criteria

The implementation is ready for user UAT when:

- targeted automated tests pass
- typecheck passes
- cloud and onprem DEV are running the committed code
- single-chapter/section/slide-range course creation passes for PDF, DOCX, and PPTX, including Source DB inspection and learner viewer inspection
- browser checks pass for the Chapter 2 flow
- browser checks pass for at least one DOCX and one PPTX fixture flow
- the implementation records warnings instead of silently producing contaminated lesson material
- user-facing test steps are documented

## Out Of Scope For First Delivery

- full manual V2 editor
- image translation
- OCR for scanned/image-only PDFs
- redesigning the whole lesson viewer
- retroactive repair of existing courses outside a controlled migration/backfill command
