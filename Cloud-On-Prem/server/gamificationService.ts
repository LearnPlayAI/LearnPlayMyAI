import { db } from "./db";
import {
  coinTransactions,
  challengeTemplates,
  challengeProgress,
  adminChallengeConfig,
  powerUpCatalog,
  powerUpInventory,
  activePowerUps,
  cosmeticCatalog,
  cosmeticOwnership,
  equippedCosmetics,
  seasonPassTiers,
  seasonPassProgress,
  seasonPassConfig,
  seasonPassPurchases,
  achievementCatalog,
  achievementUnlocks,
  loginStreaks,
  playerStats,
  type CoinTransaction,
  type InsertCoinTransaction,
  type ChallengeTemplate,
  type ChallengeProgress,
  type PowerUpCatalog,
  type PowerUpInventory,
  type ActivePowerUp,
  type CosmeticCatalog,
  type CosmeticOwnership,
  type EquippedCosmetic,
  type SeasonPassProgress,
  type SeasonPassPurchase,
  type SeasonPassConfig,
  type AchievementUnlock,
  type LoginStreak,
} from "@shared/schema";
import { eq, and, sql, desc, gte, lte, or, inArray } from "drizzle-orm";
import { CHALLENGE_GOAL_TYPES } from "@shared/challengeConstants";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { resolveEffectiveTimezone } from "./utils/timezone";

const CHALLENGE_RESET_TIMEZONE = resolveEffectiveTimezone(
  process.env.CHALLENGE_RESET_TIMEZONE ?? null,
  process.env.LEARNPLAY_TIMEZONE ?? null,
);

export class GamificationService {
  async getUserCoinBalance(userId: string): Promise<number> {
    const latestTransaction = await db
      .select({ balance: coinTransactions.balance })
      .from(coinTransactions)
      .where(eq(coinTransactions.userId, userId))
      .orderBy(desc(coinTransactions.createdAt))
      .limit(1);

    return latestTransaction[0]?.balance ?? 0;
  }

  async awardCoins(
    userId: string,
    amount: number,
    type: string,
    description: string,
    metadata?: any
  ): Promise<CoinTransaction> {
    return await db.transaction(async (tx) => {
      const latestTransaction = await tx
        .select({ balance: coinTransactions.balance })
        .from(coinTransactions)
        .where(eq(coinTransactions.userId, userId))
        .orderBy(desc(coinTransactions.createdAt))
        .limit(1)
        .for('update');

      const currentBalance = latestTransaction[0]?.balance ?? 0;
      const newBalance = currentBalance + amount;

      const [transaction] = await tx
        .insert(coinTransactions)
        .values({
          userId,
          amount,
          balance: newBalance,
          type,
          description,
          metadata,
        })
        .returning();

      return transaction;
    });
  }

  async spendCoins(
    userId: string,
    amount: number,
    type: string,
    description: string,
    metadata?: any
  ): Promise<CoinTransaction | null> {
    return await db.transaction(async (tx) => {
      const latestTransaction = await tx
        .select({ balance: coinTransactions.balance })
        .from(coinTransactions)
        .where(eq(coinTransactions.userId, userId))
        .orderBy(desc(coinTransactions.createdAt))
        .limit(1)
        .for('update');

      const currentBalance = latestTransaction[0]?.balance ?? 0;

      if (currentBalance < amount) {
        return null;
      }

      const newBalance = currentBalance - amount;

      const [transaction] = await tx
        .insert(coinTransactions)
        .values({
          userId,
          amount: -amount,
          balance: newBalance,
          type,
          description,
          metadata,
        })
        .returning();

      return transaction;
    });
  }

  async getUserCoinTransactions(
    userId: string,
    limit: number = 50
  ): Promise<CoinTransaction[]> {
    return await db
      .select()
      .from(coinTransactions)
      .where(eq(coinTransactions.userId, userId))
      .orderBy(desc(coinTransactions.createdAt))
      .limit(limit);
  }

  async getActiveChallenges(type: "daily" | "weekly"): Promise<ChallengeTemplate[]> {
    return await db
      .select()
      .from(challengeTemplates)
      .where(
        and(
          eq(challengeTemplates.type, type),
          eq(challengeTemplates.isActive, true)
        )
      );
  }

  async ensureChallengeProgress(userId: string, userOrganizationId?: string): Promise<void> {
    const now = new Date();
    
    // Get ALL active challenge configs (challenges are GLOBAL, not org-scoped)
    const activeConfigs = await db
      .select()
      .from(adminChallengeConfig)
      .where(eq(adminChallengeConfig.isActive, true));
    
    if (activeConfigs.length === 0) {
      return;
    }
    
    // Preload ALL user's challenge progress in one query
    const existingProgress = await db
      .select()
      .from(challengeProgress)
      .where(eq(challengeProgress.userId, userId));
    
    // Create a Map keyed by challengeId for O(1) lookups
    const progressMap = new Map<string, typeof existingProgress[0]>();
    for (const progress of existingProgress) {
      progressMap.set(progress.challengeId, progress);
    }
    
    // Collect which challenges need new progress records (not in map)
    const newProgressRecords: Array<{
      userId: string;
      challengeId: string;
      currentValue: number;
      isCompleted: boolean;
      isClaimed: boolean;
      resetAt: Date;
      createdAt: Date;
      updatedAt: Date;
    }> = [];
    
    // Collect which challenges need reset (in map but resetAt < now)
    // Group by challengeType since they share the same resetAt
    const expiredProgressByType = new Map<string, { ids: string[]; resetAt: Date }>();
    
    for (const config of activeConfigs) {
      const existing = progressMap.get(config.id);
      
      if (!existing) {
        // Need to create new progress record
        const resetAt = this.calculateNextReset(config.challengeType);
        newProgressRecords.push({
          userId,
          challengeId: config.id,
          currentValue: 0,
          isCompleted: false,
          isClaimed: false,
          resetAt,
          createdAt: now,
          updatedAt: now,
        });
      } else if (existing.resetAt < now) {
        // Need to reset expired progress - group by challengeType
        const challengeType = config.challengeType;
        if (!expiredProgressByType.has(challengeType)) {
          expiredProgressByType.set(challengeType, {
            ids: [],
            resetAt: this.calculateNextReset(challengeType),
          });
        }
        expiredProgressByType.get(challengeType)!.ids.push(existing.id);
      }
    }
    
    // Bulk INSERT new progress records in one statement
    if (newProgressRecords.length > 0) {
      await db.insert(challengeProgress).values(newProgressRecords);
    }
    
    // Bulk UPDATE expired records grouped by challengeType (different resetAt values)
    const expiredGroups = Array.from(expiredProgressByType.values());
    for (const group of expiredGroups) {
      if (group.ids.length > 0) {
        await db
          .update(challengeProgress)
          .set({
            currentValue: 0,
            isCompleted: false,
            isClaimed: false,
            resetAt: group.resetAt,
            completedAt: null,
            claimedAt: null,
            updatedAt: now,
          })
          .where(inArray(challengeProgress.id, group.ids));
      }
    }
  }
  
  private calculateNextReset(frequency: string): Date {
    const now = new Date();
    const zonedNow = toZonedTime(now, CHALLENGE_RESET_TIMEZONE);
    const resetDate = new Date(zonedNow);

    if (frequency === 'daily') {
      resetDate.setDate(resetDate.getDate() + 1);
      resetDate.setHours(0, 0, 0, 0);
    } else if (frequency === 'weekly') {
      const daysUntilMonday = (8 - resetDate.getDay()) % 7 || 7;
      resetDate.setDate(resetDate.getDate() + daysUntilMonday);
      resetDate.setHours(0, 0, 0, 0);
    }

    return fromZonedTime(resetDate, CHALLENGE_RESET_TIMEZONE);
  }

  async getUserChallengeProgress(userId: string): Promise<any[]> {
    const now = new Date();
    return await db
      .select({
        id: challengeProgress.id,
        userId: challengeProgress.userId,
        challengeId: challengeProgress.challengeId,
        currentValue: challengeProgress.currentValue,
        isCompleted: challengeProgress.isCompleted,
        isClaimed: challengeProgress.isClaimed,
        resetAt: challengeProgress.resetAt,
        completedAt: challengeProgress.completedAt,
        createdAt: challengeProgress.createdAt,
        updatedAt: challengeProgress.updatedAt,
        title: adminChallengeConfig.title,
        goalType: adminChallengeConfig.goalType,
        goalTarget: adminChallengeConfig.goalTarget,
      })
      .from(challengeProgress)
      .innerJoin(adminChallengeConfig, eq(challengeProgress.challengeId, adminChallengeConfig.id))
      .where(
        and(
          eq(challengeProgress.userId, userId),
          gte(challengeProgress.resetAt, now)
        )
      );
  }

  async updateChallengeProgress(
    userId: string,
    challengeId: string,
    incrementBy: number = 1
  ): Promise<ChallengeProgress | null> {
    const existing = await db
      .select()
      .from(challengeProgress)
      .where(
        and(
          eq(challengeProgress.userId, userId),
          eq(challengeProgress.challengeId, challengeId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      return null;
    }

    const challenge = await db
      .select()
      .from(adminChallengeConfig)
      .where(eq(adminChallengeConfig.id, challengeId))
      .limit(1);

    if (challenge.length === 0) {
      return null;
    }

    const newValue = (existing[0].currentValue ?? 0) + incrementBy;
    const isCompleted = newValue >= challenge[0].goalTarget;

    const [updated] = await db
      .update(challengeProgress)
      .set({
        currentValue: newValue,
        isCompleted,
        completedAt: isCompleted ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(challengeProgress.id, existing[0].id))
      .returning();

    return updated;
  }

  async claimChallengeReward(
    userId: string,
    challengeId: string
  ): Promise<{ coins: number; xp: number; powerUp?: string } | null> {
    return await db.transaction(async (tx) => {
      const progress = await tx
        .select()
        .from(challengeProgress)
        .where(
          and(
            eq(challengeProgress.userId, userId),
            eq(challengeProgress.challengeId, challengeId)
          )
        )
        .limit(1)
        .for('update');

      if (
        progress.length === 0 ||
        !progress[0].isCompleted ||
        progress[0].isClaimed
      ) {
        return null;
      }

      const challenge = await tx
        .select()
        .from(adminChallengeConfig)
        .where(eq(adminChallengeConfig.id, challengeId))
        .limit(1);

      if (challenge.length === 0) {
        return null;
      }

      await tx
        .update(challengeProgress)
        .set({
          isClaimed: true,
          claimedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(challengeProgress.id, progress[0].id));

      const coinReward = challenge[0].coinReward ?? 0;
      const xpReward = challenge[0].xpReward ?? 0;

      // Award coins
      if (coinReward > 0) {
        const latestTransaction = await tx
          .select({ balance: coinTransactions.balance })
          .from(coinTransactions)
          .where(eq(coinTransactions.userId, userId))
          .orderBy(desc(coinTransactions.createdAt))
          .limit(1)
          .for('update');

        const currentBalance = latestTransaction[0]?.balance ?? 0;
        const newBalance = currentBalance + coinReward;

        await tx.insert(coinTransactions).values({
          userId,
          amount: coinReward,
          balance: newBalance,
          type: "challenge_reward",
          description: `Completed challenge: ${challenge[0].title}`,
          metadata: { challengeId },
        });
      }

      // Award XP to player stats
      if (xpReward > 0) {
        const stats = await tx
          .select()
          .from(playerStats)
          .where(eq(playerStats.playerId, userId))
          .limit(1)
          .for('update');

        if (stats.length > 0) {
          const currentXP = stats[0].currentXP ?? 0;
          const newXP = currentXP + xpReward;
          
          // Calculate new level based on XP (formula: Math.floor(100 * Math.pow(level - 1, 1.5)))
          const getXPForLevel = (level: number) => Math.floor(100 * Math.pow(level - 1, 1.5));
          let newLevel = stats[0].currentLevel ?? 1;
          while (newXP >= getXPForLevel(newLevel + 1) && newLevel < 100) {
            newLevel++;
          }

          await tx
            .update(playerStats)
            .set({
              currentXP: newXP,
              currentLevel: newLevel,
              updatedAt: new Date(),
            })
            .where(eq(playerStats.id, stats[0].id));
        }
      }

      return {
        coins: coinReward,
        xp: xpReward,
        powerUp: challenge[0].powerUpReward ?? undefined,
      };
    });
  }

  async getPowerUpCatalog(): Promise<PowerUpCatalog[]> {
    return await db
      .select()
      .from(powerUpCatalog)
      .where(eq(powerUpCatalog.isActive, true))
      .orderBy(powerUpCatalog.tier, powerUpCatalog.coinCost);
  }

  async getUserPowerUps(userId: string): Promise<PowerUpInventory[]> {
    return await db
      .select()
      .from(powerUpInventory)
      .where(eq(powerUpInventory.userId, userId));
  }

  async purchasePowerUp(
    userId: string,
    powerUpId: string
  ): Promise<PowerUpInventory | null> {
    return await db.transaction(async (tx) => {
      const powerUp = await tx
        .select()
        .from(powerUpCatalog)
        .where(eq(powerUpCatalog.id, powerUpId))
        .limit(1);

      if (powerUp.length === 0) {
        return null;
      }

      const latestTransaction = await tx
        .select({ balance: coinTransactions.balance })
        .from(coinTransactions)
        .where(eq(coinTransactions.userId, userId))
        .orderBy(desc(coinTransactions.createdAt))
        .limit(1)
        .for('update');

      const currentBalance = latestTransaction[0]?.balance ?? 0;

      if (currentBalance < powerUp[0].coinCost) {
        return null;
      }

      const newBalance = currentBalance - powerUp[0].coinCost;

      await tx.insert(coinTransactions).values({
        userId,
        amount: -powerUp[0].coinCost,
        balance: newBalance,
        type: "purchase",
        description: `Purchased power-up: ${powerUp[0].name}`,
        metadata: { powerUpId },
      });

      const existing = await tx
        .select()
        .from(powerUpInventory)
        .where(
          and(
            eq(powerUpInventory.userId, userId),
            eq(powerUpInventory.powerUpId, powerUpId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        const [updated] = await tx
          .update(powerUpInventory)
          .set({
            quantity: (existing[0].quantity ?? 0) + 1,
            updatedAt: new Date(),
          })
          .where(eq(powerUpInventory.id, existing[0].id))
          .returning();
        return updated;
      } else {
        const [created] = await tx
          .insert(powerUpInventory)
          .values({
            userId,
            powerUpId,
            quantity: 1,
          })
          .returning();
        return created;
      }
    });
  }

  async activatePowerUp(
    userId: string,
    powerUpId: string,
    gameId?: string
  ): Promise<ActivePowerUp | null> {
    const inventory = await db
      .select()
      .from(powerUpInventory)
      .where(
        and(
          eq(powerUpInventory.userId, userId),
          eq(powerUpInventory.powerUpId, powerUpId)
        )
      )
      .limit(1);

    if (inventory.length === 0 || (inventory[0].quantity ?? 0) < 1) {
      return null;
    }

    const powerUp = await db
      .select()
      .from(powerUpCatalog)
      .where(eq(powerUpCatalog.id, powerUpId))
      .limit(1);

    if (powerUp.length === 0) {
      return null;
    }

    // Check if user already has an active powerup of the same type
    const powerUpType = powerUp[0].type;
    const now = new Date();
    const existingActiveOfSameType = await db
      .select({
        id: activePowerUps.id,
        effectType: powerUpCatalog.type,
      })
      .from(activePowerUps)
      .leftJoin(powerUpCatalog, eq(activePowerUps.powerUpId, powerUpCatalog.id))
      .where(
        and(
          eq(activePowerUps.userId, userId),
          gte(activePowerUps.expiresAt, now)
        )
      );

    const hasSameTypeActive = existingActiveOfSameType.some(
      (active) => active.effectType === powerUpType
    );

    if (hasSameTypeActive) {
      // Return null to indicate powerup cannot be activated (same type already active)
      // This will cause routes.ts to return a 400 error with appropriate message
      return null;
    }

    await db
      .update(powerUpInventory)
      .set({
        quantity: (inventory[0].quantity ?? 1) - 1,
        updatedAt: new Date(),
      })
      .where(eq(powerUpInventory.id, inventory[0].id));

    const effect = powerUp[0].effect as any;
    const duration = effect.duration ?? 600;
    const expiresAt = new Date(Date.now() + duration * 1000);

    const [activated] = await db
      .insert(activePowerUps)
      .values({
        userId,
        powerUpId,
        expiresAt,
        effect: powerUp[0].effect,
        gameId,
        usesRemaining: effect.uses ?? null,
      })
      .returning();

    return activated;
  }

  async getUserActivePowerUps(userId: string): Promise<ActivePowerUp[]> {
    const now = new Date();

    await db
      .delete(activePowerUps)
      .where(
        and(
          eq(activePowerUps.userId, userId),
          lte(activePowerUps.expiresAt, now)
        )
      );

    const results = await db
      .select({
        id: activePowerUps.id,
        userId: activePowerUps.userId,
        powerUpId: activePowerUps.powerUpId,
        activatedAt: activePowerUps.activatedAt,
        expiresAt: activePowerUps.expiresAt,
        effect: activePowerUps.effect,
        gameId: activePowerUps.gameId,
        usesRemaining: activePowerUps.usesRemaining,
        effectType: powerUpCatalog.type,
        name: powerUpCatalog.name,
      })
      .from(activePowerUps)
      .leftJoin(powerUpCatalog, eq(activePowerUps.powerUpId, powerUpCatalog.id))
      .where(
        and(eq(activePowerUps.userId, userId), gte(activePowerUps.expiresAt, now))
      );

    return results as any;
  }

  async usePowerUpCharge(activePowerUpId: string): Promise<boolean> {
    const powerUp = await db
      .select()
      .from(activePowerUps)
      .where(eq(activePowerUps.id, activePowerUpId))
      .limit(1);

    if (powerUp.length === 0 || powerUp[0].usesRemaining === null) {
      return false;
    }

    if (powerUp[0].usesRemaining <= 1) {
      await db
        .delete(activePowerUps)
        .where(eq(activePowerUps.id, activePowerUpId));
      return true;
    }

    await db
      .update(activePowerUps)
      .set({
        usesRemaining: powerUp[0].usesRemaining - 1,
      })
      .where(eq(activePowerUps.id, activePowerUpId));

    return true;
  }

  async getCosmeticCatalog(): Promise<CosmeticCatalog[]> {
    return await db
      .select()
      .from(cosmeticCatalog)
      .where(eq(cosmeticCatalog.isActive, true))
      .orderBy(cosmeticCatalog.tier, cosmeticCatalog.coinCost);
  }

  async getUserCosmetics(userId: string): Promise<any[]> {
    // Get ownership records
    const ownedCosmetics = await db
      .select()
      .from(cosmeticOwnership)
      .where(eq(cosmeticOwnership.userId, userId));

    // Enrich with catalog details
    const enriched = await Promise.all(
      ownedCosmetics.map(async (owned) => {
        const catalogRecords = await db
          .select()
          .from(cosmeticCatalog)
          .where(eq(cosmeticCatalog.id, owned.cosmeticId))
          .limit(1);

        const catalog = catalogRecords[0];
        
        // Extract value from effect JSONB if it exists
        const effectData = catalog?.effect as any;
        const value = effectData?.color || effectData?.value || '';

        return {
          id: owned.id,
          userId: owned.userId,
          cosmeticId: owned.cosmeticId,
          purchasedAt: owned.purchasedAt,
          // Catalog details
          cosmeticName: catalog?.name || 'Unknown',
          cosmeticDescription: catalog?.description || 'No description',
          itemType: catalog?.type || 'Unknown',
          tier: catalog?.tier || 'common',
          value: value,
          iconUrl: catalog?.previewUrl || '',
        };
      })
    );

    return enriched;
  }

  async purchaseCosmetic(
    userId: string,
    cosmeticId: string
  ): Promise<CosmeticOwnership | null> {
    return await db.transaction(async (tx) => {
      const cosmetic = await tx
        .select()
        .from(cosmeticCatalog)
        .where(eq(cosmeticCatalog.id, cosmeticId))
        .limit(1);

      if (cosmetic.length === 0) {
        return null;
      }

      const alreadyOwned = await tx
        .select()
        .from(cosmeticOwnership)
        .where(
          and(
            eq(cosmeticOwnership.userId, userId),
            eq(cosmeticOwnership.cosmeticId, cosmeticId)
          )
        )
        .limit(1);

      if (alreadyOwned.length > 0) {
        return null;
      }

      const latestTransaction = await tx
        .select({ balance: coinTransactions.balance })
        .from(coinTransactions)
        .where(eq(coinTransactions.userId, userId))
        .orderBy(desc(coinTransactions.createdAt))
        .limit(1)
        .for('update');

      const currentBalance = latestTransaction[0]?.balance ?? 0;

      if (currentBalance < cosmetic[0].coinCost) {
        return null;
      }

      const newBalance = currentBalance - cosmetic[0].coinCost;

      await tx.insert(coinTransactions).values({
        userId,
        amount: -cosmetic[0].coinCost,
        balance: newBalance,
        type: "purchase",
        description: `Purchased cosmetic: ${cosmetic[0].name}`,
        metadata: { cosmeticId },
      });

      const [purchased] = await tx
        .insert(cosmeticOwnership)
        .values({
          userId,
          cosmeticId,
        })
        .returning();

      return purchased;
    });
  }

  async equipCosmetic(
    userId: string,
    cosmeticId: string,
    slot: string
  ): Promise<EquippedCosmetic | null> {
    const owned = await db
      .select()
      .from(cosmeticOwnership)
      .where(
        and(
          eq(cosmeticOwnership.userId, userId),
          eq(cosmeticOwnership.cosmeticId, cosmeticId)
        )
      )
      .limit(1);

    if (owned.length === 0) {
      return null;
    }

    await db
      .delete(equippedCosmetics)
      .where(
        and(
          eq(equippedCosmetics.userId, userId),
          eq(equippedCosmetics.slot, slot)
        )
      );

    const [equipped] = await db
      .insert(equippedCosmetics)
      .values({
        userId,
        cosmeticId,
        slot,
      })
      .returning();

    return equipped;
  }

  async unequipCosmetic(userId: string, slot: string): Promise<boolean> {
    await db
      .delete(equippedCosmetics)
      .where(
        and(
          eq(equippedCosmetics.userId, userId),
          eq(equippedCosmetics.slot, slot)
        )
      );

    return true;
  }

  async getUserEquippedCosmetics(userId: string): Promise<EquippedCosmetic[]> {
    return await db
      .select()
      .from(equippedCosmetics)
      .where(eq(equippedCosmetics.userId, userId));
  }

  async getUserSeasonPassProgress(
    userId: string,
    seasonPassConfigId: string
  ): Promise<SeasonPassProgress | null> {
    const progress = await db
      .select()
      .from(seasonPassProgress)
      .where(
        and(
          eq(seasonPassProgress.userId, userId),
          eq(seasonPassProgress.seasonPassConfigId, seasonPassConfigId)
        )
      )
      .limit(1);

    return progress[0] ?? null;
  }

  async updateSeasonPassXP(
    userId: string,
    seasonPassConfigId: string,
    xpToAdd: number
  ): Promise<SeasonPassProgress> {
    const existing = await this.getUserSeasonPassProgress(userId, seasonPassConfigId);

    if (existing) {
      const newXP = (existing.seasonXP ?? 0) + xpToAdd;

      const [updated] = await db
        .update(seasonPassProgress)
        .set({
          seasonXP: newXP,
          updatedAt: new Date(),
        })
        .where(eq(seasonPassProgress.id, existing.id))
        .returning();

      return updated;
    } else {
      const [created] = await db
        .insert(seasonPassProgress)
        .values({
          userId,
          seasonPassConfigId,
          seasonXP: xpToAdd,
        })
        .returning();

      return created;
    }
  }

  async updateLoginStreak(userId: string): Promise<{
    streak: LoginStreak;
    coinsAwarded: number;
  }> {
    const existing = await db
      .select()
      .from(loginStreaks)
      .where(eq(loginStreaks.userId, userId))
      .limit(1);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let currentStreak = 1;
    let coinsAwarded = 0;
    let isNewDailyLogin = false; // Track if this is truly a new daily login

    if (existing.length > 0) {
      const lastLogin = existing[0].lastLoginDate
        ? new Date(existing[0].lastLoginDate)
        : null;

      if (lastLogin) {
        lastLogin.setHours(0, 0, 0, 0);

        if (lastLogin.getTime() === today.getTime()) {
          // Already logged in today - don't update streak or challenges
          return { streak: existing[0], coinsAwarded: 0 };
        }

        // This is a new day login
        isNewDailyLogin = true;
        
        if (lastLogin.getTime() === yesterday.getTime()) {
          currentStreak = (existing[0].currentStreak ?? 0) + 1;
        } else {
          currentStreak = 1;
        }
      } else {
        // No previous login date - treat as new daily login
        isNewDailyLogin = true;
      }

      coinsAwarded = Math.min(currentStreak * 10, 100);

      const [updated] = await db
        .update(loginStreaks)
        .set({
          currentStreak,
          longestStreak: Math.max(
            currentStreak,
            existing[0].longestStreak ?? 0
          ),
          lastLoginDate: new Date(),
          totalCoinsEarned: (existing[0].totalCoinsEarned ?? 0) + coinsAwarded,
          updatedAt: new Date(),
        })
        .where(eq(loginStreaks.id, existing[0].id))
        .returning();

      await this.awardCoins(
        userId,
        coinsAwarded,
        "streak_bonus",
        `Day ${currentStreak} login streak bonus`,
        { streak: currentStreak }
      );

      // Update daily_logins challenge progress (only for new daily logins)
      if (isNewDailyLogin) {
        try {
          const userChallenges = await this.getUserChallengeProgress(userId);
          for (const challenge of userChallenges) {
            if ((challenge as any).goalType === CHALLENGE_GOAL_TYPES.DAILY_LOGINS && !challenge.isCompleted && !challenge.isClaimed) {
              await this.updateChallengeProgress(userId, challenge.challengeId, 1);
              console.log(`🎯 Updated challenge progress: ${(challenge as any).title} (daily_logins)`);
            }
          }
        } catch (error) {
          console.error("Error updating daily login challenge progress:", error);
        }
      }

      return { streak: updated, coinsAwarded };
    } else {
      // New user - first time logging in
      coinsAwarded = 10;
      isNewDailyLogin = true;

      const [created] = await db
        .insert(loginStreaks)
        .values({
          userId,
          currentStreak: 1,
          longestStreak: 1,
          lastLoginDate: new Date(),
          totalCoinsEarned: coinsAwarded,
        })
        .returning();

      await this.awardCoins(
        userId,
        coinsAwarded,
        "streak_bonus",
        "Day 1 login streak bonus",
        { streak: 1 }
      );

      // Update daily_logins challenge progress (only for new daily logins)
      if (isNewDailyLogin) {
        try {
          const userChallenges = await this.getUserChallengeProgress(userId);
          for (const challenge of userChallenges) {
            if ((challenge as any).goalType === CHALLENGE_GOAL_TYPES.DAILY_LOGINS && !challenge.isCompleted && !challenge.isClaimed) {
              await this.updateChallengeProgress(userId, challenge.challengeId, 1);
              console.log(`🎯 Updated challenge progress: ${(challenge as any).title} (daily_logins)`);
            }
          }
        } catch (error) {
          console.error("Error updating daily login challenge progress:", error);
        }
      }

      return { streak: created, coinsAwarded };
    }
  }

  async getUserLoginStreak(userId: string): Promise<LoginStreak | null> {
    const streak = await db
      .select()
      .from(loginStreaks)
      .where(eq(loginStreaks.userId, userId))
      .limit(1);

    return streak[0] ?? null;
  }

  async getUserAchievements(userId: string): Promise<AchievementUnlock[]> {
    return await db
      .select()
      .from(achievementUnlocks)
      .where(eq(achievementUnlocks.userId, userId));
  }

  async updateAchievementProgress(
    userId: string,
    achievementId: string,
    progress: number
  ): Promise<AchievementUnlock | null> {
    const achievement = await db
      .select()
      .from(achievementCatalog)
      .where(eq(achievementCatalog.id, achievementId))
      .limit(1);

    if (achievement.length === 0) {
      return null;
    }

    const existing = await db
      .select()
      .from(achievementUnlocks)
      .where(
        and(
          eq(achievementUnlocks.userId, userId),
          eq(achievementUnlocks.achievementId, achievementId)
        )
      )
      .limit(1);

    const isUnlocked = progress >= achievement[0].targetValue;

    if (existing.length > 0) {
      const [updated] = await db
        .update(achievementUnlocks)
        .set({
          progress,
          isUnlocked,
          unlockedAt: isUnlocked ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(achievementUnlocks.id, existing[0].id))
        .returning();

      if (isUnlocked && !existing[0].isUnlocked && (achievement[0].coinReward ?? 0) > 0) {
        await this.awardCoins(
          userId,
          achievement[0].coinReward ?? 0,
          "achievement",
          `Unlocked achievement: ${achievement[0].name}`,
          { achievementId }
        );
      }

      return updated;
    } else {
      const [created] = await db
        .insert(achievementUnlocks)
        .values({
          userId,
          achievementId,
          progress,
          isUnlocked,
          unlockedAt: isUnlocked ? new Date() : null,
        })
        .returning();

      if (isUnlocked && (achievement[0].coinReward ?? 0) > 0) {
        await this.awardCoins(
          userId,
          achievement[0].coinReward ?? 0,
          "achievement",
          `Unlocked achievement: ${achievement[0].name}`,
          { achievementId }
        );
      }

      return created;
    }
  }

  async adjustUserCoins(
    userId: string,
    amount: number,
    reason: string
  ): Promise<void> {
    await this.awardCoins(
      userId,
      amount,
      "admin_adjustment",
      reason,
      { adjustmentType: "manual" }
    );
  }

  async purchaseSeasonPass(
    userId: string,
    seasonPassConfigId: string
  ): Promise<SeasonPassPurchase | null> {
    try {
      console.log('[purchaseSeasonPass] Starting purchase:', { userId, seasonPassConfigId });
      
      return await db.transaction(async (tx) => {
        const config = await tx
          .select()
          .from(seasonPassConfig)
          .where(eq(seasonPassConfig.id, seasonPassConfigId))
          .limit(1);

        console.log('[purchaseSeasonPass] Config found:', config.length > 0);
        if (config.length === 0) {
          return null;
        }

        // Check for existing pass (active or expired)
        const existing = await tx
          .select()
          .from(seasonPassPurchases)
          .where(
            and(
              eq(seasonPassPurchases.userId, userId),
              eq(seasonPassPurchases.seasonPassConfigId, seasonPassConfigId)
            )
          )
          .limit(1);

        console.log('[purchaseSeasonPass] Existing purchases:', existing.length);

        const latestTransaction = await tx
          .select({ balance: coinTransactions.balance })
          .from(coinTransactions)
          .where(eq(coinTransactions.userId, userId))
          .orderBy(desc(coinTransactions.createdAt))
          .limit(1)
          .for('update');

        const currentBalance = latestTransaction[0]?.balance ?? 0;
        const price = config[0].coinCost ?? 0;

        console.log('[purchaseSeasonPass] Balance check:', { currentBalance, price, canAfford: currentBalance >= price });

        if (currentBalance < price) {
          return null;
        }

        const newBalance = currentBalance - price;

        await tx.insert(coinTransactions).values({
          userId,
          amount: -price,
          balance: newBalance,
          type: "season_pass_purchase",
          description: `${existing.length > 0 ? 'Renewed' : 'Purchased'} season pass: ${config[0].seasonName}`,
          metadata: { seasonPassConfigId },
        });

        console.log('[purchaseSeasonPass] Coin transaction created');

        const now = new Date();
        // If renewing an active pass, extend from current expiry; otherwise start from now
        const baseTime = existing.length > 0 && existing[0].isActive && existing[0].expiresAt > now
          ? existing[0].expiresAt.getTime()
          : now.getTime();
        const expiresAt = new Date(baseTime + ((config[0].endDate.getTime() - config[0].startDate.getTime()) / (1000 * 60 * 60 * 24)) * 24 * 60 * 60 * 1000);

        console.log('[purchaseSeasonPass] Calculated expiresAt:', expiresAt);

        const [purchased] = await tx
          .insert(seasonPassPurchases)
          .values({
            userId,
            seasonPassConfigId,
            purchasedAt: now,
            expiresAt,
            coinsPaid: price,
            isActive: true,
          })
          .onConflictDoUpdate({
            target: [seasonPassPurchases.userId, seasonPassPurchases.seasonPassConfigId],
            set: {
              purchasedAt: now,
              expiresAt,
              coinsPaid: price,
              isActive: true,
            },
          })
          .returning();

        console.log('[purchaseSeasonPass] Season pass purchase record created');

        // Unlock all exclusive cosmetics for this season
        const exclusiveCosmetics = await tx
          .select()
          .from(cosmeticCatalog)
          .where(
            and(
              eq(cosmeticCatalog.isSeasonPassExclusive, true),
              eq(cosmeticCatalog.seasonNumber, config[0].seasonNumber),
              eq(cosmeticCatalog.isActive, true)
            )
          );

        console.log('[purchaseSeasonPass] Exclusive cosmetics found:', exclusiveCosmetics.length);

        // Grant ownership of exclusive cosmetics (avatar frames, etc.)
        for (const cosmetic of exclusiveCosmetics) {
          await tx
            .insert(cosmeticOwnership)
            .values({
              userId,
              cosmeticId: cosmetic.id,
            })
            .onConflictDoNothing();
        }

        console.log('[purchaseSeasonPass] Cosmetic ownership granted, purchase complete');

        return purchased;
      });
    } catch (error) {
      console.error('[purchaseSeasonPass] ERROR:', error);
      throw error;
    }
  }

  async claimSeasonPassTierReward(
    userId: string,
    tierId: string
  ): Promise<{ success: boolean; reward?: any; message: string }> {
    return await db.transaction(async (tx) => {
      // Parse tier number from tierId (e.g., "tier-1" -> 1)
      const tierMatch = tierId.match(/tier-(\d+)/);
      if (!tierMatch) {
        return { success: false, message: "Invalid tier ID format" };
      }
      const tierNumber = parseInt(tierMatch[1], 10);

      // Get active season pass config
      const activeConfig = await tx
        .select()
        .from(seasonPassConfig)
        .where(
          and(
            eq(seasonPassConfig.status, "active"),
            sql`${seasonPassConfig.tierDefinitions} IS NOT NULL`
          )
        )
        .limit(1);

      if (activeConfig.length === 0) {
        return { success: false, message: "No active season pass" };
      }

      const config = activeConfig[0];
      const tierDefinitions = config.tierDefinitions as any[];

      // Find the tier in tierDefinitions
      const tierData = tierDefinitions?.find((t: any) => t.tier === tierNumber);
      if (!tierData) {
        return { success: false, message: "Tier not found" };
      }

      // Get user's season pass progress
      const progress = await tx
        .select()
        .from(seasonPassProgress)
        .where(
          and(
            eq(seasonPassProgress.userId, userId),
            eq(seasonPassProgress.seasonPassConfigId, config.id)
          )
        )
        .limit(1);

      if (progress.length === 0) {
        return { success: false, message: "Season progress not found" };
      }

      const progressData = progress[0];
      const claimedTiers = progressData.claimedTiers || [];
      const seasonXP = progressData.seasonXP || 0;

      // Check if already claimed
      if (claimedTiers.includes(tierId)) {
        return { success: false, message: "Reward already claimed" };
      }

      // Check if tier is unlocked (user has enough XP)
      if (seasonXP < tierData.xpRequired) {
        return { success: false, message: "Tier not unlocked yet" };
      }

      // Check if this is a premium tier (5-12) and user has active pass
      if (tierData.isPremium) {
        const activePass = await tx
          .select()
          .from(seasonPassPurchases)
          .where(
            and(
              eq(seasonPassPurchases.userId, userId),
              eq(seasonPassPurchases.seasonPassConfigId, config.id),
              eq(seasonPassPurchases.isActive, true)
            )
          )
          .limit(1);

        if (activePass.length === 0) {
          return { success: false, message: "Premium tier requires season pass purchase" };
        }
      }

      // Grant the reward based on type
      let reward: any = null;

      if (tierData.rewardType === "coins" && tierData.rewardAmount) {
        await this.awardCoins(
          userId,
          tierData.rewardAmount,
          "season_pass_tier_reward",
          `Season ${config.seasonNumber} Tier ${tierData.tier} reward`,
          { tierId }
        );
        reward = { type: "coins", amount: tierData.rewardAmount };
      } else if (tierData.rewardType === "cosmetic" && tierData.rewardId) {
        await tx
          .insert(cosmeticOwnership)
          .values({
            userId,
            cosmeticId: tierData.rewardId,
          })
          .onConflictDoNothing();
        reward = { type: "cosmetic", cosmeticId: tierData.rewardId };
      } else if (tierData.rewardType === "power_up" && tierData.rewardId) {
        const existing = await tx
          .select()
          .from(powerUpInventory)
          .where(
            and(
              eq(powerUpInventory.userId, userId),
              eq(powerUpInventory.powerUpId, tierData.rewardId)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          const currentQuantity = existing[0].quantity ?? 0;
          await tx
            .update(powerUpInventory)
            .set({ quantity: currentQuantity + 1 })
            .where(eq(powerUpInventory.id, existing[0].id));
        } else {
          await tx.insert(powerUpInventory).values({
            userId,
            powerUpId: tierData.rewardId,
            quantity: 1,
          });
        }
        reward = { type: "power_up", powerUpId: tierData.rewardId };
      }

      // Mark tier as claimed
      await tx
        .update(seasonPassProgress)
        .set({
          claimedTiers: sql`array_append(${seasonPassProgress.claimedTiers}, ${tierId})`,
          updatedAt: new Date(),
        })
        .where(eq(seasonPassProgress.id, progressData.id));

      return { success: true, reward, message: "Reward claimed successfully" };
    });
  }

  async hasActiveSeasonPass(userId: string, seasonNumber: number): Promise<boolean> {
    const activePass = await db
      .select()
      .from(seasonPassPurchases)
      .innerJoin(seasonPassConfig, eq(seasonPassPurchases.seasonPassConfigId, seasonPassConfig.id))
      .where(
        and(
          eq(seasonPassPurchases.userId, userId),
          eq(seasonPassPurchases.isActive, true),
          eq(seasonPassConfig.seasonNumber, seasonNumber)
        )
      )
      .limit(1);

    return activePass.length > 0;
  }

  async getUserActiveSeasonPass(userId: string): Promise<SeasonPassConfig | null> {
    const now = new Date();
    const activePass = await db
      .select({
        config: seasonPassConfig
      })
      .from(seasonPassPurchases)
      .innerJoin(seasonPassConfig, eq(seasonPassPurchases.seasonPassConfigId, seasonPassConfig.id))
      .where(
        and(
          eq(seasonPassPurchases.userId, userId),
          eq(seasonPassPurchases.isActive, true),
          gte(seasonPassPurchases.expiresAt, now)
        )
      )
      .limit(1);

    return activePass.length > 0 ? activePass[0].config : null;
  }
}

export const gamificationService = new GamificationService();
