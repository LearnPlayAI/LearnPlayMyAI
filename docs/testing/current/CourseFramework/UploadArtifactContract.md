# Course Framework Upload Artifact Contract

## Supported Upload Source Types
- `.docx`
- `.pptx`
- `.pdf`

## Upload API
- Endpoint: `POST /api/courses/drafts/:draftId/documents`
- Field: `file` (multipart)

## Persisted Upload Metadata
- `fileName`
- `mimeType`
- `fileSize`
- `storagePath`
- `extractionStatus` (`pending|processing|completed|failed`)

## Extraction Artifact Shape
- `rawText`
- `wordCount`
- `sections[]`
- `structuredHints`
- `sourceMap`
- `metadata`
- optional: `structuredLessonHeadings`

## Segment Artifact Shape (when segment flag enabled)
- `segmentIndex`
- `text`
- `textHash`
- `offsetStart`, `offsetEnd`
- `headingPath`
- `pageOrSlide`

## Expected Failure Codes
- `400`: invalid request/document metadata
- `413`: token/size constraints
- `422`: extraction/content structure invalid for downstream workflow

## Variant Parity Note
- Cloud and onprem must produce equivalent upload/extraction contract behavior for the same fixture document.
