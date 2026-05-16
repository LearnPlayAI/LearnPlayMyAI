-- Ensure lesson progress upserts have the conflict target required by runtime services.
-- Some dev/runtime databases only had the primary key restored, leaving ON CONFLICT
-- (lessonId, userId, organizationId) without a matching unique index.
CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_lesson_user_org_progress"
  ON public."lessonProgress" ("lessonId", "userId", "organizationId");
