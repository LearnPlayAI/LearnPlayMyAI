# Source-Aware Course Creation Test Notes

## Scope

This flow preserves uploaded PDF, DOCX, and PPTX source documents as durable course source records, extracts reusable visuals, and lets admins link those visuals to generated lessons or quiz prompts. Image translation is intentionally out of scope.

## Admin Journey

1. Open the course document wizard and upload a PDF, DOCX, or PPTX with visible images.
2. Wait for document extraction to complete.
3. In review, confirm the Extracted visuals section appears when media was found.
4. Link at least one visual to a lesson with Use.
5. Link at least one visual for quiz usage with Quiz.
6. Create the course.

## Learner Journey

1. Open a generated lesson from the course.
2. Confirm linked source visuals appear below the lesson player.
3. Generate a quiz from that lesson.
4. Confirm source visuals are offered to AI as possible quiz stimuli.
5. Publish the quiz and play it.
6. Confirm a visual quiz prompt displays when the generated question used a source visual.

## Document Types

- PDF: page snapshots are extracted as source visuals.
- DOCX: embedded images under `word/media` are extracted.
- PPTX: embedded images under `ppt/media` are extracted.

## Expected Limits

- Extracted visuals keep original source text as-is; no image translation is performed.
- Captions and alt text are best-effort metadata from the source location.
- Missing or unsupported embedded media should not block text extraction or course creation.
