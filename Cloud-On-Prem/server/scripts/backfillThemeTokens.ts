import { db } from '../db';
import { brandingThemes } from '@shared/schema';
import { REQUIRED_TOKEN_KEYS } from '@shared/brandingTokens';
import { buildFullTokens, BaseTokens } from '@shared/themeTokenBuilder';
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
    primary: tokens['--primary'] || 'hsl(262, 83%, 58%)',
    primaryForeground: tokens['--primary-foreground'] || 'hsl(0, 0%, 100%)',
    secondary: tokens['--secondary'] || 'hsl(220, 14%, 20%)',
    secondaryForeground: tokens['--secondary-foreground'] || 'hsl(0, 0%, 100%)',
    accent: tokens['--accent'] || 'hsl(262, 83%, 58%)',
    accentForeground: tokens['--accent-foreground'] || 'hsl(0, 0%, 100%)',
    background: tokens['--background'] || 'hsl(0, 0%, 7%)',
    foreground: tokens['--foreground'] || 'hsl(0, 0%, 95%)',
    card: tokens['--card'] || 'hsl(0, 0%, 10%)',
    cardForeground: tokens['--card-foreground'] || 'hsl(0, 0%, 95%)',
    muted: tokens['--muted'] || 'hsl(0, 0%, 15%)',
    mutedForeground: tokens['--muted-foreground'] || 'hsl(0, 0%, 60%)',
    border: tokens['--border'] || 'hsl(0, 0%, 20%)',
    ring: tokens['--ring'] || 'hsl(262, 83%, 58%)',
    gradientFrom: tokens['--gradient-from'] || tokens['--primary'] || 'hsl(262, 83%, 58%)',
    gradientTo: tokens['--gradient-to'] || tokens['--secondary'] || 'hsl(220, 14%, 20%)',
    gamePrimary: tokens['--game-primary'] || tokens['--primary'] || 'hsl(262, 83%, 58%)',
    gameGlow: tokens['--game-glow'] || tokens['--primary'] || 'hsl(262, 83%, 58%)',
    isDark: getLightness(tokens['--background'] || 'hsl(0, 0%, 7%)') < 50,
  };
}

async function backfillThemeTokens(dryRun = true) {
  console.log(`[Backfill] Starting theme token backfill (${dryRun ? 'DRY RUN' : 'LIVE'})...`);
  
  const themes = await db.select().from(brandingThemes);
  console.log(`[Backfill] Found ${themes.length} themes to process`);
  
  let updated = 0;
  let skipped = 0;
  
  for (const theme of themes) {
    const currentTokens = (theme.tokens as Record<string, string>) || {};
    const tokenCount = Object.keys(currentTokens).length;
    
    // Skip if already expanded to full required contract
    const requiredCount = REQUIRED_TOKEN_KEYS.filter((key) => !!currentTokens[key]).length;
    if (requiredCount >= REQUIRED_TOKEN_KEYS.length) {
      console.log(`[Backfill] Skipping ${theme.orgName} - already has ${tokenCount} tokens`);
      skipped++;
      continue;
    }
    
    // Extract base tokens and expand
    const baseTokens = extractBaseTokens(currentTokens);
    const expandedTokens = buildFullTokens(baseTokens);
    
    console.log(`[Backfill] ${theme.orgName}: ${tokenCount} -> ${Object.keys(expandedTokens).length} tokens`);
    
    if (!dryRun) {
      await db.update(brandingThemes)
        .set({ tokens: expandedTokens, updatedAt: new Date() })
        .where(eq(brandingThemes.id, theme.id));
    }
    
    updated++;
  }
  
  console.log(`[Backfill] Complete: ${updated} themes ${dryRun ? 'would be' : 'were'} updated, ${skipped} skipped`);
}

// Run with: npx tsx server/scripts/backfillThemeTokens.ts [--live]
const isLive = process.argv.includes('--live');
backfillThemeTokens(!isLive).catch(console.error);
