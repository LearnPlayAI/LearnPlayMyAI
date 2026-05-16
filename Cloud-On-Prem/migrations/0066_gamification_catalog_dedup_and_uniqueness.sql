DO $$
BEGIN
  IF to_regclass('public."powerUpCatalog"') IS NOT NULL THEN
    CREATE TEMP TABLE _powerup_ranked ON COMMIT DROP AS
    SELECT
      p.ctid AS row_ctid,
      p.id,
      first_value(p.ctid) OVER (
        PARTITION BY lower(btrim(p.name)), lower(btrim(p.type))
        ORDER BY p."createdAt" ASC NULLS LAST, p.id ASC
      ) AS keep_ctid,
      first_value(p.id) OVER (
        PARTITION BY lower(btrim(p.name)), lower(btrim(p.type))
        ORDER BY p."createdAt" ASC NULLS LAST, p.id ASC
      ) AS keep_id
    FROM "powerUpCatalog" p;

    CREATE TEMP TABLE _powerup_row_dups ON COMMIT DROP AS
    SELECT row_ctid, id, keep_id
    FROM _powerup_ranked
    WHERE row_ctid <> keep_ctid;

    CREATE TEMP TABLE _powerup_map ON COMMIT DROP AS
    SELECT DISTINCT id AS dup_id, keep_id
    FROM _powerup_row_dups
    WHERE id IS DISTINCT FROM keep_id;

    IF EXISTS (SELECT 1 FROM _powerup_row_dups) THEN
      IF to_regclass('public."powerUpInventory"') IS NOT NULL THEN
        CREATE TEMP TABLE _powerup_inventory_rebuilt ON COMMIT DROP AS
        SELECT
          gen_random_uuid()::text AS id,
          pi."userId",
          COALESCE(pm.keep_id, pi."powerUpId") AS "powerUpId",
          SUM(COALESCE(pi.quantity, 0))::int AS quantity,
          MIN(pi."createdAt") AS "createdAt",
          MAX(pi."updatedAt") AS "updatedAt"
        FROM "powerUpInventory" pi
        LEFT JOIN _powerup_map pm ON pm.dup_id = pi."powerUpId"
        GROUP BY pi."userId", COALESCE(pm.keep_id, pi."powerUpId");

        TRUNCATE TABLE "powerUpInventory";

        INSERT INTO "powerUpInventory" (id, "userId", "powerUpId", quantity, "createdAt", "updatedAt")
        SELECT id, "userId", "powerUpId", quantity, "createdAt", "updatedAt"
        FROM _powerup_inventory_rebuilt;
      END IF;

      IF to_regclass('public."activePowerUps"') IS NOT NULL THEN
        UPDATE "activePowerUps" ap
        SET "powerUpId" = pm.keep_id
        FROM _powerup_map pm
        WHERE ap."powerUpId" = pm.dup_id;
      END IF;

      IF to_regclass('public."challengeTemplates"') IS NOT NULL THEN
        UPDATE "challengeTemplates" ct
        SET "powerUpReward" = pm.keep_id
        FROM _powerup_map pm
        WHERE ct."powerUpReward" = pm.dup_id;
      END IF;

      IF to_regclass('public."seasonPassTiers"') IS NOT NULL THEN
        UPDATE "seasonPassTiers" st
        SET "freeRewardId" = pm.keep_id
        FROM _powerup_map pm
        WHERE st."freeRewardId" = pm.dup_id;

        UPDATE "seasonPassTiers" st
        SET "premiumRewardId" = pm.keep_id
        FROM _powerup_map pm
        WHERE st."premiumRewardId" = pm.dup_id;
      END IF;

      DELETE FROM "powerUpCatalog" p
      USING _powerup_row_dups d
      WHERE p.ctid = d.row_ctid;
    END IF;
  END IF;

  IF to_regclass('public."cosmeticCatalog"') IS NOT NULL THEN
    CREATE TEMP TABLE _cosmetic_ranked ON COMMIT DROP AS
    SELECT
      c.ctid AS row_ctid,
      c.id,
      first_value(c.ctid) OVER (
        PARTITION BY lower(btrim(c.name)), lower(btrim(c.type))
        ORDER BY c."createdAt" ASC NULLS LAST, c.id ASC
      ) AS keep_ctid,
      first_value(c.id) OVER (
        PARTITION BY lower(btrim(c.name)), lower(btrim(c.type))
        ORDER BY c."createdAt" ASC NULLS LAST, c.id ASC
      ) AS keep_id
    FROM "cosmeticCatalog" c;

    CREATE TEMP TABLE _cosmetic_row_dups ON COMMIT DROP AS
    SELECT row_ctid, id, keep_id
    FROM _cosmetic_ranked
    WHERE row_ctid <> keep_ctid;

    CREATE TEMP TABLE _cosmetic_map ON COMMIT DROP AS
    SELECT DISTINCT id AS dup_id, keep_id
    FROM _cosmetic_row_dups
    WHERE id IS DISTINCT FROM keep_id;

    IF EXISTS (SELECT 1 FROM _cosmetic_row_dups) THEN
      IF to_regclass('public."cosmeticOwnership"') IS NOT NULL THEN
        CREATE TEMP TABLE _cosmetic_ownership_rebuilt ON COMMIT DROP AS
        SELECT
          gen_random_uuid()::text AS id,
          co."userId",
          COALESCE(cm.keep_id, co."cosmeticId") AS "cosmeticId",
          MIN(co."purchasedAt") AS "purchasedAt"
        FROM "cosmeticOwnership" co
        LEFT JOIN _cosmetic_map cm ON cm.dup_id = co."cosmeticId"
        GROUP BY co."userId", COALESCE(cm.keep_id, co."cosmeticId");

        TRUNCATE TABLE "cosmeticOwnership";

        INSERT INTO "cosmeticOwnership" (id, "userId", "cosmeticId", "purchasedAt")
        SELECT id, "userId", "cosmeticId", "purchasedAt"
        FROM _cosmetic_ownership_rebuilt;
      END IF;

      IF to_regclass('public."equippedCosmetics"') IS NOT NULL THEN
        UPDATE "equippedCosmetics" ec
        SET "cosmeticId" = cm.keep_id
        FROM _cosmetic_map cm
        WHERE ec."cosmeticId" = cm.dup_id;
      END IF;

      IF to_regclass('public."seasonPassTiers"') IS NOT NULL THEN
        UPDATE "seasonPassTiers" st
        SET "freeRewardId" = cm.keep_id
        FROM _cosmetic_map cm
        WHERE st."freeRewardId" = cm.dup_id;

        UPDATE "seasonPassTiers" st
        SET "premiumRewardId" = cm.keep_id
        FROM _cosmetic_map cm
        WHERE st."premiumRewardId" = cm.dup_id;
      END IF;

      DELETE FROM "cosmeticCatalog" c
      USING _cosmetic_row_dups d
      WHERE c.ctid = d.row_ctid;
    END IF;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_powerUpCatalog_name_type"
  ON "powerUpCatalog" (name, type);

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_cosmeticCatalog_name_type"
  ON "cosmeticCatalog" (name, type);
