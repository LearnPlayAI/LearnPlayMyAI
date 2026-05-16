DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'courseAssignmentScope'
      AND e.enumlabel = 'subject'
  ) THEN
    ALTER TYPE "courseAssignmentScope" ADD VALUE 'subject';
  END IF;
END $$;
