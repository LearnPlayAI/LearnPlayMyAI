-- Ensure one organization-scoped branding theme row per organization.
-- Historical environments may contain duplicates and/or missing unique constraint,
-- which breaks upsert behavior in branding routes.

WITH ranked AS (
  SELECT
    id,
    "organizationId",
    ROW_NUMBER() OVER (
      PARTITION BY "organizationId"
      ORDER BY "updatedAt" DESC NULLS LAST, "createdAt" DESC NULLS LAST, id DESC
    ) AS rn
  FROM "brandingThemes"
  WHERE "organizationId" IS NOT NULL
)
DELETE FROM "brandingThemes" bt
USING ranked r
WHERE bt.id = r.id
  AND r.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'UNQ_brandingThemes_organizationId'
      AND conrelid = '"brandingThemes"'::regclass
  ) THEN
    ALTER TABLE "brandingThemes"
      ADD CONSTRAINT "UNQ_brandingThemes_organizationId" UNIQUE ("organizationId");
  END IF;
END $$;
