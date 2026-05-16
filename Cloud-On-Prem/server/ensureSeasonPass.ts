import { db } from './db';
import { seasonPassConfig, seasonPassTiers } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { DEFAULT_SEASON_PASS } from './seasonPassDefinitions';

/**
 * Ensures season pass configuration and tiers are initialized in the database
 * This runs idempotently on server startup
 */
export async function ensureSeasonPass() {
  console.log('🎮 Ensuring season pass is initialized...');
  
  const results = {
    seasonConfigCreated: false,
    tiersCreated: 0,
    tiersUpdated: 0,
  };

  try {
    // Serialize startup seeding across clustered instances.
    await db.execute(sql`SELECT pg_advisory_lock(hashtext('ensureSeasonPass_v1'));`);

    // Check if this season already exists
    const existingConfig = await db.select()
      .from(seasonPassConfig)
      .where(and(
        eq(seasonPassConfig.scope, DEFAULT_SEASON_PASS.scope),
        sql`${seasonPassConfig.organizationId} IS NULL`,
        eq(seasonPassConfig.seasonNumber, DEFAULT_SEASON_PASS.seasonNumber)
      ))
      .limit(1);

    let configId: string;

    if (existingConfig.length === 0) {
      // Create the season pass config
      const [newConfig] = await db.insert(seasonPassConfig).values({
        scope: DEFAULT_SEASON_PASS.scope,
        organizationId: null, // Global season pass
        seasonNumber: DEFAULT_SEASON_PASS.seasonNumber,
        seasonName: DEFAULT_SEASON_PASS.seasonName,
        description: DEFAULT_SEASON_PASS.description,
        status: 'active', // Auto-activate the default season pass
        tierDefinitions: DEFAULT_SEASON_PASS.tiers,
        coinCost: DEFAULT_SEASON_PASS.coinCost,
        coinMultiplier: DEFAULT_SEASON_PASS.coinMultiplier,
        xpMultiplier: DEFAULT_SEASON_PASS.xpMultiplier,
        advantages: DEFAULT_SEASON_PASS.advantages,
        startDate: DEFAULT_SEASON_PASS.startDate,
        endDate: DEFAULT_SEASON_PASS.endDate,
        isActive: true,
        activatedAt: new Date(),
      }).returning();

      configId = newConfig.id;
      results.seasonConfigCreated = true;
      console.log(`  ✨ Created season pass config: ${DEFAULT_SEASON_PASS.seasonName}`);
    } else {
      // Don't update existing season pass - admins may have customized it
      // This preserves admin changes to coinCost, multipliers, dates, tiers, etc.
      configId = existingConfig[0].id;
      console.log(`  ✓ Season pass already exists: ${existingConfig[0].seasonName} (preserving customizations)`);
    }

    // Only create tiers if this is a new season pass
    // Don't update existing tiers - admins may have customized them
    if (results.seasonConfigCreated) {
      for (const tierDef of DEFAULT_SEASON_PASS.tiers) {
        await db.insert(seasonPassTiers).values({
          seasonPassConfigId: configId,
          tier: tierDef.tier,
          xpRequired: tierDef.xpRequired,
          freeRewardType: tierDef.rewardType,
          freeRewardId: null,
          freeRewardAmount: tierDef.rewardAmount || null,
          isActive: true,
        });
        results.tiersCreated++;
      }
    }

    console.log(`✅ Season pass initialization complete:`, results);
  } catch (error) {
    console.error('❌ Error ensuring season pass:', error);
    throw error;
  } finally {
    try {
      await db.execute(sql`SELECT pg_advisory_unlock(hashtext('ensureSeasonPass_v1'));`);
    } catch {
      // no-op
    }
  }
}
