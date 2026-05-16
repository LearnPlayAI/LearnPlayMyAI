CREATE TABLE IF NOT EXISTS "courseDraftDocumentSegments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "draftId" varchar NOT NULL REFERENCES "courseDraftFrameworks"("id") ON DELETE cascade,
  "documentId" varchar NOT NULL REFERENCES "courseDraftDocuments"("id") ON DELETE cascade,
  "segmentIndex" integer NOT NULL,
  "segmentType" varchar NOT NULL DEFAULT 'paragraph',
  "text" text NOT NULL,
  "textHash" varchar NOT NULL,
  "startOffset" integer NOT NULL DEFAULT 0,
  "endOffset" integer NOT NULL DEFAULT 0,
  "headingPath" text[],
  "pageOrSlide" integer,
  "metadata" jsonb,
  "createdAt" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_course_draft_segments_draft" ON "courseDraftDocumentSegments" ("draftId");
CREATE INDEX IF NOT EXISTS "IDX_course_draft_segments_document" ON "courseDraftDocumentSegments" ("documentId");
CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_course_draft_segment_index" ON "courseDraftDocumentSegments" ("documentId", "segmentIndex");

CREATE TABLE IF NOT EXISTS "courseDraftTopicAssignments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "draftId" varchar NOT NULL REFERENCES "courseDraftFrameworks"("id") ON DELETE cascade,
  "topicId" varchar NOT NULL,
  "segmentId" varchar NOT NULL REFERENCES "courseDraftDocumentSegments"("id") ON DELETE cascade,
  "assignmentMethod" varchar NOT NULL DEFAULT 'rules',
  "confidence" real,
  "isUserConfirmed" boolean DEFAULT false,
  "createdBy" varchar REFERENCES "users"("id"),
  "createdAt" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_course_draft_topic_assignments_draft" ON "courseDraftTopicAssignments" ("draftId");
CREATE INDEX IF NOT EXISTS "IDX_course_draft_topic_assignments_topic" ON "courseDraftTopicAssignments" ("topicId");
CREATE INDEX IF NOT EXISTS "IDX_course_draft_topic_assignments_segment" ON "courseDraftTopicAssignments" ("segmentId");
CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_course_draft_assignment_segment" ON "courseDraftTopicAssignments" ("draftId", "segmentId");

CREATE TABLE IF NOT EXISTS "courseDraftCoverageReports" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "draftId" varchar NOT NULL REFERENCES "courseDraftFrameworks"("id") ON DELETE cascade,
  "totalSegments" integer NOT NULL DEFAULT 0,
  "assignedSegments" integer NOT NULL DEFAULT 0,
  "unassignedSegments" integer NOT NULL DEFAULT 0,
  "overlapSegments" integer NOT NULL DEFAULT 0,
  "excludedSegments" integer NOT NULL DEFAULT 0,
  "status" varchar NOT NULL DEFAULT 'fail',
  "details" jsonb,
  "createdAt" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_course_draft_coverage_reports_draft" ON "courseDraftCoverageReports" ("draftId");
CREATE INDEX IF NOT EXISTS "IDX_course_draft_coverage_reports_created" ON "courseDraftCoverageReports" ("createdAt");
