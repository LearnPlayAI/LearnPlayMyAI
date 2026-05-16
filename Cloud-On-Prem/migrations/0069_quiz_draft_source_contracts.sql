ALTER TABLE "quizDrafts"
  ADD COLUMN IF NOT EXISTS "sourceSelection" jsonb,
  ADD COLUMN IF NOT EXISTS "lastGeneratedSourceContract" jsonb;

CREATE INDEX IF NOT EXISTS "IDX_quiz_drafts_source_selection"
  ON "quizDrafts" (("sourceSelection"->>'sourceType'), ("sourceSelection"->>'versionRef'));
