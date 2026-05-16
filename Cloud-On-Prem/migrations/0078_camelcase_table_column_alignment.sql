-- Direct naming alignment: enforce camelCase table and column identifiers.
-- No compatibility aliases are introduced in this migration.

DO $$
DECLARE
  rec RECORD;
BEGIN
  -- ---------- Table renames (snake_case -> camelCase) ----------
  FOR rec IN
    SELECT *
    FROM (
      VALUES
        ('podcast_provider_cost_ledger', 'podcastProviderCostLedger'),
        ('podcast_settlement_ledger', 'podcastSettlementLedger'),
        ('branding_themes', 'brandingThemes'),
        ('organization_domains', 'organizationDomains'),
        ('enterprise_customers', 'enterpriseCustomers'),
        ('enterprise_documents', 'enterpriseDocuments'),
        ('build_versions', 'buildVersions'),
        ('enterprise_license_requests', 'enterpriseLicenseRequests'),
        ('enterprise_license_keys', 'enterpriseLicenseKeys'),
        ('onprem_license_state', 'onpremLicenseState'),
        ('enterprise_revenue_sync', 'enterpriseRevenueSync'),
        ('enterprise_agreement_templates', 'enterpriseAgreementTemplates'),
        ('enterprise_keyring', 'enterpriseKeyring'),
        ('enterprise_systems', 'enterpriseSystems'),
        ('enterprise_system_daily_telemetry', 'enterpriseSystemDailyTelemetry')
    ) AS t(old_name, new_name)
  LOOP
    IF to_regclass(format('public.%I', rec.old_name)) IS NOT NULL
      AND to_regclass(format('public.%I', rec.new_name)) IS NULL
    THEN
      EXECUTE format('ALTER TABLE %I RENAME TO %I', rec.old_name, rec.new_name);
    END IF;
  END LOOP;

  -- ---------- Column renames on brandingThemes / organizationDomains ----------
  FOR rec IN
    SELECT *
    FROM (
      VALUES
        ('brandingThemes', 'organization_id', 'organizationId'),
        ('brandingThemes', 'org_name', 'orgName'),
        ('brandingThemes', 'theme_mode_intent', 'themeModeIntent'),
        ('brandingThemes', 'preset_id', 'presetId'),
        ('brandingThemes', 'tokens_light', 'tokensLight'),
        ('brandingThemes', 'tokens_dark', 'tokensDark'),
        ('brandingThemes', 'logo_url', 'logoUrl'),
        ('brandingThemes', 'favicon_url', 'faviconUrl'),
        ('brandingThemes', 'font_heading', 'fontHeading'),
        ('brandingThemes', 'font_body', 'fontBody'),
        ('brandingThemes', 'support_url', 'supportUrl'),
        ('brandingThemes', 'support_email', 'supportEmail'),
        ('brandingThemes', 'terms_url', 'termsUrl'),
        ('brandingThemes', 'privacy_url', 'privacyUrl'),
        ('brandingThemes', 'allow_email_branding', 'allowEmailBranding'),
        ('brandingThemes', 'enable_contrast_corrections', 'enableContrastCorrections'),
        ('brandingThemes', 'gradient_enabled', 'gradientEnabled'),
        ('brandingThemes', 'gradient_from', 'gradientFrom'),
        ('brandingThemes', 'gradient_to', 'gradientTo'),
        ('brandingThemes', 'gradient_angle', 'gradientAngle'),
        ('brandingThemes', 'custom_copy', 'customCopy'),
        ('brandingThemes', 'created_at', 'createdAt'),
        ('brandingThemes', 'updated_at', 'updatedAt'),
        ('organizationDomains', 'organization_id', 'organizationId'),
        ('organizationDomains', 'verification_token', 'verificationToken'),
        ('organizationDomains', 'verified_at', 'verifiedAt'),
        ('organizationDomains', 'is_active', 'isActive'),
        ('organizationDomains', 'created_at', 'createdAt')
    ) AS c(table_name, old_name, new_name)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = rec.table_name
        AND column_name = rec.old_name
    )
    AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = rec.table_name
        AND column_name = rec.new_name
    )
    THEN
      EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', rec.table_name, rec.old_name, rec.new_name);
    END IF;
  END LOOP;
END
$$;
