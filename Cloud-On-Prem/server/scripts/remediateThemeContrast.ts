import { db } from '../db';
import { brandingThemes } from '@shared/schema';
import { REQUIRED_TOKEN_KEYS } from '@shared/brandingTokens';
import { buildFullTokens, type BaseTokens } from '@shared/themeTokenBuilder';
import { applyThemeContrastGuard, auditThemeContrast } from '@shared/themeContrastGuard';
import { eq } from 'drizzle-orm';

function getLightness(hslColor: string): number {
  const normalized = String(hslColor || '').trim();
  const match = normalized.match(
    /hsl[a]?\(\s*(\d+(?:\.\d+)?)(?:deg|rad|grad|turn)?(?:,|\s)\s*(\d+(?:\.\d+)?)%\s*(?:,|\s)\s*(\d+(?:\.\d+)?)%/i
  );
  if (!match) return 50;
  return parseFloat(match[3]);
}

function extractBaseTokens(tokens: Record<string, string>): BaseTokens {
  return {
    primary: tokens['--primary'] || 'hsl(217, 91%, 60%)',
    primaryForeground: tokens['--primary-foreground'] || 'hsl(0, 0%, 100%)',
    secondary: tokens['--secondary'] || 'hsl(215, 28%, 17%)',
    secondaryForeground: tokens['--secondary-foreground'] || 'hsl(0, 0%, 100%)',
    accent: tokens['--accent'] || 'hsl(213, 94%, 68%)',
    accentForeground: tokens['--accent-foreground'] || 'hsl(215, 28%, 17%)',
    background: tokens['--background'] || 'hsl(210, 40%, 98%)',
    foreground: tokens['--foreground'] || 'hsl(215, 28%, 17%)',
    card: tokens['--card'] || 'hsl(0, 0%, 100%)',
    cardForeground: tokens['--card-foreground'] || 'hsl(215, 28%, 17%)',
    muted: tokens['--muted'] || 'hsl(210, 40%, 96%)',
    mutedForeground: tokens['--muted-foreground'] || 'hsl(215, 16%, 47%)',
    border: tokens['--border'] || 'hsl(214, 32%, 91%)',
    ring: tokens['--ring'] || 'hsl(217, 91%, 60%)',
    gradientFrom: tokens['--gradient-from'] || tokens['--primary'] || 'hsl(217, 91%, 60%)',
    gradientTo: tokens['--gradient-to'] || tokens['--secondary'] || 'hsl(215, 28%, 17%)',
    gamePrimary: tokens['--game-primary'] || tokens['--primary'] || 'hsl(217, 91%, 60%)',
    gameGlow: tokens['--game-glow'] || tokens['--primary'] || 'hsl(217, 91%, 60%)',
    isDark: getLightness(tokens['--background'] || 'hsl(210, 40%, 98%)') < 50,
  };
}

async function remediateThemeContrast(dryRun = true) {
  console.log(`[ThemeRemediation] Starting contrast remediation (${dryRun ? 'DRY RUN' : 'LIVE'})`);
  const themes = await db.select().from(brandingThemes);
  console.log(`[ThemeRemediation] Found ${themes.length} stored themes`);

  let changed = 0;
  let unchanged = 0;
  let withCritical = 0;

  for (const theme of themes) {
    const currentTokens = (theme.tokens as Record<string, string>) || {};
    const hasFullContract = REQUIRED_TOKEN_KEYS.every((key) => !!currentTokens[key]);
    const canonical = hasFullContract ? currentTokens : buildFullTokens(extractBaseTokens(currentTokens));
    const guarded = applyThemeContrastGuard(canonical);
    const criticalIssues = auditThemeContrast(guarded.tokens).filter((issue) => issue.level === 'error');
    if (criticalIssues.length > 0) withCritical += 1;

    const before = JSON.stringify(currentTokens);
    const after = JSON.stringify(guarded.tokens);
    if (before !== after) {
      changed += 1;
      console.log(
        `[ThemeRemediation] ${theme.orgName} (${theme.id}) changed: ${Object.keys(currentTokens).length} -> ${Object.keys(guarded.tokens).length} tokens; adjustments=${guarded.adjustments.length}; critical=${criticalIssues.length}`
      );
      if (!dryRun) {
        await db
          .update(brandingThemes)
          .set({ tokens: guarded.tokens, updatedAt: new Date() })
          .where(eq(brandingThemes.id, theme.id));
      }
    } else {
      unchanged += 1;
    }
  }

  console.log(
    `[ThemeRemediation] Complete: ${changed} ${dryRun ? 'would be' : 'were'} updated, ${unchanged} unchanged, ${withCritical} with remaining critical issues`
  );
}

const isLive = process.argv.includes('--live');
remediateThemeContrast(!isLive).catch((error) => {
  console.error('[ThemeRemediation] Failed:', error);
  process.exit(1);
});

