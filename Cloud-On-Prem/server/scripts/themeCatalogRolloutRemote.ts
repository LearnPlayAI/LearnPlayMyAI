import { db } from "../db";
import { brandingThemes } from "@shared/schema";
import { eq, isNotNull } from "drizzle-orm";
import { themePresets } from "@shared/themePresetCatalog";
import { REQUIRED_TOKEN_KEYS } from "@shared/brandingTokens";
import { buildFullTokens, type BaseTokens } from "@shared/themeTokenBuilder";
import { applyThemeContrastGuard, auditThemeContrast } from "@shared/themeContrastGuard";

function getLightness(hslColor: string): number {
  const normalized = String(hslColor || "").trim();
  const match = normalized.match(
    /hsl[a]?\(\s*(\d+(?:\.\d+)?)(?:deg|rad|grad|turn)?(?:,|\s)\s*(\d+(?:\.\d+)?)%\s*(?:,|\s)\s*(\d+(?:\.\d+)?)%/i
  );
  if (!match) return 50;
  return parseFloat(match[3]);
}

function extractBaseTokens(tokens: Record<string, string>): BaseTokens {
  return {
    primary: tokens["--primary"] || "hsl(217, 91%, 60%)",
    primaryForeground: tokens["--primary-foreground"] || "hsl(0, 0%, 100%)",
    secondary: tokens["--secondary"] || "hsl(215, 28%, 17%)",
    secondaryForeground: tokens["--secondary-foreground"] || "hsl(0, 0%, 100%)",
    accent: tokens["--accent"] || "hsl(213, 94%, 68%)",
    accentForeground: tokens["--accent-foreground"] || "hsl(215, 28%, 17%)",
    background: tokens["--background"] || "hsl(210, 40%, 98%)",
    foreground: tokens["--foreground"] || "hsl(215, 28%, 17%)",
    card: tokens["--card"] || "hsl(0, 0%, 100%)",
    cardForeground: tokens["--card-foreground"] || "hsl(215, 28%, 17%)",
    muted: tokens["--muted"] || "hsl(210, 40%, 96%)",
    mutedForeground: tokens["--muted-foreground"] || "hsl(215, 16%, 47%)",
    border: tokens["--border"] || "hsl(214, 32%, 91%)",
    ring: tokens["--ring"] || "hsl(217, 91%, 60%)",
    gradientFrom: tokens["--gradient-from"] || tokens["--primary"] || "hsl(217, 91%, 60%)",
    gradientTo: tokens["--gradient-to"] || tokens["--secondary"] || "hsl(215, 28%, 17%)",
    gamePrimary: tokens["--game-primary"] || tokens["--primary"] || "hsl(217, 91%, 60%)",
    gameGlow: tokens["--game-glow"] || tokens["--primary"] || "hsl(217, 91%, 60%)",
    isDark: getLightness(tokens["--background"] || "hsl(210, 40%, 98%)") < 50,
  };
}

async function run(dryRun = true) {
  console.log(`[ThemeCatalogRollout] starting (${dryRun ? "DRY RUN" : "LIVE"})`);

  const themes = await db.select().from(brandingThemes);
  console.log(`[ThemeCatalogRollout] loaded ${themes.length} themes`);

  const validPresetIds = new Set(themePresets.map((preset) => preset.id));
  let invalidPresetIds = 0;
  let remediated = 0;
  let unchanged = 0;
  let unresolvedCritical = 0;
  let criticalAfterRemediation = 0;

  for (const theme of themes) {
    const updates: Partial<typeof theme> & { updatedAt?: Date } = {};

    const presetId = String(theme.presetId || "").trim();
    if (presetId && !validPresetIds.has(presetId)) {
      updates.presetId = null;
      invalidPresetIds += 1;
    }

    const currentTokens = (theme.tokens as Record<string, string>) || {};
    const hasFullContract = REQUIRED_TOKEN_KEYS.every((key) => !!currentTokens[key]);
    const canonical = hasFullContract ? currentTokens : buildFullTokens(extractBaseTokens(currentTokens));
    const guarded = applyThemeContrastGuard(canonical);
    const critical = auditThemeContrast(guarded.tokens).filter((issue) => issue.level === "error");

    if (critical.length > 0) {
      criticalAfterRemediation += 1;
      unresolvedCritical += 1;
      continue;
    }

    const before = JSON.stringify(currentTokens);
    const after = JSON.stringify(guarded.tokens);
    if (before !== after) {
      updates.tokens = guarded.tokens as any;
      remediated += 1;
    } else {
      unchanged += 1;
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      if (!dryRun) {
        await db.update(brandingThemes).set(updates as any).where(eq(brandingThemes.id, theme.id));
      }
    }
  }

  const leftWithPresetId = await db
    .select({ id: brandingThemes.id, presetId: brandingThemes.presetId })
    .from(brandingThemes)
    .where(isNotNull(brandingThemes.presetId));
  const stillInvalidPresetIds = leftWithPresetId.filter(
    (row) => row.presetId && !validPresetIds.has(String(row.presetId))
  ).length;

  console.log(
    JSON.stringify(
      {
        dryRun,
        totalThemes: themes.length,
        invalidPresetIds,
        stillInvalidPresetIds,
        remediated,
        unchanged,
        unresolvedCritical,
        criticalAfterRemediation,
      },
      null,
      2
    )
  );
}

const isLive = process.argv.includes("--live");
run(!isLive)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[ThemeCatalogRollout] failed:", error);
    process.exit(1);
  });
