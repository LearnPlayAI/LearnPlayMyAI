import { db } from "../db";
import { brandingThemes } from "@shared/schema";
import { themePresets } from "@shared/themePresetCatalog";
import { eq, isNotNull } from "drizzle-orm";

async function migrateThemePresetIdsToCatalog(dryRun = true) {
  const validPresetIds = new Set(themePresets.map((preset) => preset.id));
  console.log(
    `[ThemePresetMigration] Starting (${dryRun ? "DRY RUN" : "LIVE"}) with ${
      validPresetIds.size
    } valid preset IDs`
  );

  const themes = await db
    .select({
      id: brandingThemes.id,
      orgName: brandingThemes.orgName,
      presetId: brandingThemes.presetId,
    })
    .from(brandingThemes)
    .where(isNotNull(brandingThemes.presetId));

  let matched = 0;
  let invalid = 0;

  for (const theme of themes) {
    const presetId = String(theme.presetId || "").trim();
    if (!presetId) continue;

    if (validPresetIds.has(presetId)) {
      matched += 1;
      continue;
    }

    invalid += 1;
    console.log(
      `[ThemePresetMigration] invalid presetId "${presetId}" on theme ${theme.id} (${theme.orgName})`
    );

    if (!dryRun) {
      await db
        .update(brandingThemes)
        .set({ presetId: null, updatedAt: new Date() })
        .where(eq(brandingThemes.id, theme.id));
    }
  }

  console.log(
    `[ThemePresetMigration] Complete: matched=${matched}, invalid=${
      dryRun ? `${invalid} would be` : `${invalid} were`
    } reset to null`
  );
}

const isLive = process.argv.includes("--live");
migrateThemePresetIdsToCatalog(!isLive).catch((error) => {
  console.error("[ThemePresetMigration] Failed:", error);
  process.exit(1);
});
