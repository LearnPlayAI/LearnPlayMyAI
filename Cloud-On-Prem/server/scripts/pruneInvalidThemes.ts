import { db } from '../db';
import { brandingThemes } from '@shared/schema';
import { auditThemeContrast, applyThemeContrastGuard } from '@shared/themeContrastGuard';
import { eq } from 'drizzle-orm';

async function pruneInvalidThemes(dryRun = true) {
  console.log(`[ThemePrune] Starting invalid theme pruning (${dryRun ? 'DRY RUN' : 'LIVE'})`);
  const themes = await db.select().from(brandingThemes);
  let removed = 0;
  let kept = 0;

  for (const theme of themes) {
    const tokens = (theme.tokens as Record<string, string>) || {};
    const guarded = applyThemeContrastGuard(tokens);
    const critical = auditThemeContrast(guarded.tokens).filter((issue) => issue.level === 'error');
    if (critical.length > 0) {
      removed += 1;
      console.log(`[ThemePrune] invalid theme ${theme.id} (${theme.orgName}) critical=${critical.length}`);
      if (!dryRun) {
        await db.delete(brandingThemes).where(eq(brandingThemes.id, theme.id));
      }
    } else {
      kept += 1;
    }
  }

  console.log(`[ThemePrune] Complete: ${removed} ${dryRun ? 'would be' : 'were'} removed, ${kept} kept`);
}

const isLive = process.argv.includes('--live');
pruneInvalidThemes(!isLive).catch((error) => {
  console.error('[ThemePrune] Failed:', error);
  process.exit(1);
});

