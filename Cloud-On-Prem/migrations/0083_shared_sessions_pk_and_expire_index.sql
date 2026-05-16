DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.sessions'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE "sessions"
      ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("sid");
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "IDX_session_expire"
  ON "sessions" USING btree ("expire");
