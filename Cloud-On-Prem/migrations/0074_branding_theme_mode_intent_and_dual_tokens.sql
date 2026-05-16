ALTER TABLE branding_themes
  ADD COLUMN IF NOT EXISTS theme_mode_intent text,
  ADD COLUMN IF NOT EXISTS tokens_light jsonb,
  ADD COLUMN IF NOT EXISTS tokens_dark jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'branding_themes_theme_mode_intent_check'
  ) THEN
    ALTER TABLE branding_themes
      ADD CONSTRAINT branding_themes_theme_mode_intent_check
      CHECK (theme_mode_intent IN ('light', 'dark') OR theme_mode_intent IS NULL);
  END IF;
END $$;
