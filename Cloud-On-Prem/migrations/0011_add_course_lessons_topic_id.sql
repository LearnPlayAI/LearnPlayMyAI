-- Migration: Add topicId column to courseLessons for stable lesson-topic matching
-- This enables reliable matching even when topics are renamed or reordered

ALTER TABLE "courseLessons" ADD COLUMN IF NOT EXISTS "topicId" varchar;

-- Backfill topicId for existing courseLessons using framework topics
-- Match by topicName or topicOrder when topicId is null
DO $$
DECLARE
    link RECORD;
    topic_record RECORD;
    framework_topics jsonb;
BEGIN
    FOR link IN 
        SELECT cl.id, cl."courseId", cl."topicName", cl."topicOrder"
        FROM "courseLessons" cl
        WHERE cl."topicId" IS NULL
    LOOP
        -- Get the framework for this course
        SELECT topics INTO framework_topics
        FROM "courseFrameworks"
        WHERE "courseId" = link."courseId"
        LIMIT 1;
        
        IF framework_topics IS NOT NULL THEN
            -- Try to match by topic name first, then by order
            FOR topic_record IN 
                SELECT 
                    elem->>'id' as id,
                    elem->>'name' as name,
                    (elem->>'order')::int as topic_order
                FROM jsonb_array_elements(framework_topics) elem
            LOOP
                IF topic_record.name = link."topicName" OR topic_record.topic_order = link."topicOrder" THEN
                    UPDATE "courseLessons"
                    SET "topicId" = topic_record.id
                    WHERE id = link.id;
                    EXIT; -- Take first match
                END IF;
            END LOOP;
        END IF;
    END LOOP;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN "courseLessons"."topicId" IS 'Framework topic ID for stable matching - survives topic renames and reordering';
