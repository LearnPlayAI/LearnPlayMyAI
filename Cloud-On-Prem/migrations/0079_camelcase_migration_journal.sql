-- Rename migration journal table/column to strict camelCase identifiers.
-- No compatibility aliases are introduced.

DO $$
BEGIN
  IF to_regclass('public.__drizzle_migrations') IS NOT NULL
     AND to_regclass('public."drizzleMigrations"') IS NULL
  THEN
    EXECUTE 'ALTER TABLE "__drizzle_migrations" RENAME TO "drizzleMigrations"';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'drizzleMigrations'
      AND column_name = 'created_at'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'drizzleMigrations'
      AND column_name = 'createdAt'
  )
  THEN
    EXECUTE 'ALTER TABLE "drizzleMigrations" RENAME COLUMN "created_at" TO "createdAt"';
  END IF;
END
$$;
