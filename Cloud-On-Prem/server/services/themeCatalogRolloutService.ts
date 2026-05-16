import { db } from "../db";
import { brandingThemes } from "@shared/schema";
import { eq, isNotNull } from "drizzle-orm";
import { REQUIRED_TOKEN_KEYS } from "@shared/brandingTokens";
import { buildFullTokens, type BaseTokens } from "@shared/themeTokenBuilder";
import { auditThemeContrast } from "@shared/themeContrastGuard";
import { themePresets } from "@shared/themePresetCatalog";
import { shouldRunJob, markJobRun } from "./schedulerRunGuard";

const THEME_CATALOG_ROLLOUT_VERSION = "v4_2026_04_04";
const JOB_KEY = `theme_catalog_rollout_${THEME_CATALOG_ROLLOUT_VERSION}`;
const RUN_INTERVAL_MS = 6 * 60 * 60 * 1000;

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

export class ThemeCatalogRolloutService {
  static async runIfDue(): Promise<void> {
    const due = await shouldRunJob(JOB_KEY, RUN_INTERVAL_MS);
    if (!due) return;

    console.log(`[ThemeCatalogRollout] Starting automatic rollout (${THEME_CATALOG_ROLLOUT_VERSION})`);
    try {
      const themes = await db.select().from(brandingThemes);
      const validPresetIds = new Set(themePresets.map((preset) => preset.id));

      let presetLinksCleared = 0;
      let remediated = 0;
      let advisoryContrastIssues = 0;

      for (const theme of themes) {
        const updates: Partial<typeof theme> & { updatedAt?: Date } = {};

        const presetId = String(theme.presetId || "").trim();
        if (presetId && !validPresetIds.has(presetId)) {
          updates.presetId = null;
          presetLinksCleared += 1;
        }

        const currentTokens = (theme.tokens as Record<string, string>) || {};
        const hasFullContract = REQUIRED_TOKEN_KEYS.every((key) => !!currentTokens[key]);
        const canonical = hasFullContract ? currentTokens : buildFullTokens(extractBaseTokens(currentTokens));
        const critical = auditThemeContrast(canonical).filter((issue) => issue.level === "error");
        if (critical.length > 0) {
          advisoryContrastIssues += 1;
          console.warn(
            `[ThemeCatalogRollout] Advisory contrast issues for theme ${theme.id}: ${critical.length} issue(s) detected`
          );
        }

        if (Object.keys(updates).length > 0) {
          updates.updatedAt = new Date();
          remediated += 1;
          await db.update(brandingThemes).set(updates as any).where(eq(brandingThemes.id, theme.id));
        }
      }

      const stillInvalidRows = await db
        .select({ id: brandingThemes.id, presetId: brandingThemes.presetId })
        .from(brandingThemes)
        .where(isNotNull(brandingThemes.presetId));
      const remainingPresetLinks = stillInvalidRows.filter((row) => {
        const presetId = String(row.presetId || "").trim();
        return presetId.length > 0 && !validPresetIds.has(presetId);
      }).length;

      await markJobRun(JOB_KEY);
      console.log(
        `[ThemeCatalogRollout] Completed: total=${themes.length} remediated=${remediated} advisoryContrastIssues=${advisoryContrastIssues} presetLinksCleared=${presetLinksCleared} remainingPresetLinks=${remainingPresetLinks}`
      );
    } catch (error) {
      console.error("[ThemeCatalogRollout] Failed:", error);
    }
  }
}
