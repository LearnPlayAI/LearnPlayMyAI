-- License domain hardening: identity collision controls + singleton onprem license state

-- 1) Ensure onprem license state remains a single authoritative row.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      ORDER BY COALESCE("updatedAt", "createdAt", "installedAt") DESC NULLS LAST, id
    ) AS rn
  FROM "onpremLicenseState"
)
DELETE FROM "onpremLicenseState"
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_onpremLicenseState_singleton"
  ON "onpremLicenseState" ((1));

-- 2) Prevent ambiguous enterprise system identity collisions per customer + track.
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_enterpriseSystems_customer_type_hardware"
  ON "enterpriseSystems" ("enterpriseCustomerId", "systemType", "hardwareKey")
  WHERE "hardwareKey" IS NOT NULL AND length(trim("hardwareKey")) > 0;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_enterpriseSystems_customer_type_baseurl_norm"
  ON "enterpriseSystems" ("enterpriseCustomerId", "systemType", lower(trim("baseUrl")))
  WHERE "baseUrl" IS NOT NULL AND length(trim("baseUrl")) > 0;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_enterpriseSystems_customer_type_hostname_norm"
  ON "enterpriseSystems" ("enterpriseCustomerId", "systemType", lower(trim("internalHostname")))
  WHERE "internalHostname" IS NOT NULL AND length(trim("internalHostname")) > 0;

