-- Ensure exactly one platform theme row (organization_id IS NULL) can exist.
-- This hardens concurrency behavior for platform theme writes.

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
         ) AS rn
  FROM branding_themes
  WHERE organization_id IS NULL
)
DELETE FROM branding_themes bt
USING ranked r
WHERE bt.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS branding_themes_platform_singleton_idx
ON branding_themes ((1))
WHERE organization_id IS NULL;
