DO $$
BEGIN
  IF to_regclass('public.build_versions') IS NOT NULL THEN
    ALTER TABLE "build_versions" ADD COLUMN IF NOT EXISTS "buildDate" timestamp;
  END IF;
END
$$;
