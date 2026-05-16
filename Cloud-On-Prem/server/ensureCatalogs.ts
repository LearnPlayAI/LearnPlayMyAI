import { db } from "./db";
import {
  powerUpCatalog,
  cosmeticCatalog,
  gammaImageStyles,
  gamificationEconomyRules,
  adminChallengeConfig,
} from "@shared/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { POWER_UP_DEFINITIONS, COSMETIC_DEFINITIONS, GAMMA_IMAGE_STYLE_DEFINITIONS } from "./catalogDefinitions";
import { CHALLENGE_GOAL_TYPES } from "@shared/challengeConstants";

const ECONOMY_ALIASES: Record<string, string[]> = {
  quiz_win: ["quiz_pass", "game_win"],
  quiz_participation: ["game_participation", "game_loss"],
  daily_login: ["login_streak"],
  perfect_score: [],
  streak_bonus: [],
};

const ECONOMY_DEFAULTS: Array<{ actionType: string; coinReward: number; xpReward: number; description: string }> = [
  { actionType: "quiz_win", coinReward: 10, xpReward: 50, description: "Coins for winning a quiz." },
  { actionType: "quiz_participation", coinReward: 5, xpReward: 25, description: "Coins for participating in a quiz." },
  { actionType: "daily_login", coinReward: 5, xpReward: 0, description: "Coins for first login of the day." },
  { actionType: "perfect_score", coinReward: 25, xpReward: 100, description: "Bonus for perfect quiz score." },
  { actionType: "streak_bonus", coinReward: 10, xpReward: 0, description: "Bonus for consecutive daily activity." },
];

const DEFAULT_CHALLENGES: Array<{
  id: string;
  challengeType: "daily" | "weekly";
  title: string;
  description: string;
  goalType: string;
  goalTarget: number;
  coinReward: number;
  xpReward: number;
}> = [
  {
    id: "seed-challenge-daily-quiz-completions",
    challengeType: "daily",
    title: "Daily Learner Sprint",
    description: "Complete 3 quizzes today.",
    goalType: CHALLENGE_GOAL_TYPES.QUIZ_COMPLETIONS,
    goalTarget: 3,
    coinReward: 60,
    xpReward: 100,
  },
  {
    id: "seed-challenge-daily-logins",
    challengeType: "daily",
    title: "Daily Check-In",
    description: "Log in and complete your daily challenge.",
    goalType: CHALLENGE_GOAL_TYPES.DAILY_LOGINS,
    goalTarget: 1,
    coinReward: 25,
    xpReward: 25,
  },
  {
    id: "seed-challenge-weekly-quiz-wins",
    challengeType: "weekly",
    title: "Weekly Quiz Wins",
    description: "Win 10 quizzes this week.",
    goalType: CHALLENGE_GOAL_TYPES.QUIZ_WINS,
    goalTarget: 10,
    coinReward: 200,
    xpReward: 300,
  },
];

export async function ensureGamificationCatalogs(): Promise<{
  powerUpsCreated: number;
  cosmeticsCreated: number;
  powerUpsUpdated: number;
  cosmeticsUpdated: number;
}> {
  console.log("🎮 Ensuring gamification catalogs are initialized (non-destructive mode)...");

  const summary = await db.transaction(async (tx) => {
    // Global DB lock for this critical section: prevents duplicate inserts when multiple instances start together.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(810045901)`);

    let powerUpsCreated = 0;
    let cosmeticsCreated = 0;
    let powerUpsUpdated = 0;
    let cosmeticsUpdated = 0;

    // -------------------------
    // Seed Power-Ups (create missing only)
    // -------------------------
    for (const powerUpDef of POWER_UP_DEFINITIONS) {
      try {
        const byId = await tx
          .select()
          .from(powerUpCatalog)
          .where(eq(powerUpCatalog.id, powerUpDef.id!))
          .limit(1);

        const existingByKey = byId.length
          ? byId
          : await tx
              .select()
              .from(powerUpCatalog)
              .where(
                and(
                  eq(powerUpCatalog.name, powerUpDef.name),
                  eq(powerUpCatalog.type, powerUpDef.type)
                )
              )
              .limit(1);

        if (existingByKey.length === 0) {
          await tx.insert(powerUpCatalog).values(powerUpDef);
          powerUpsCreated++;
          console.log(`  ✓ Created power-up: ${powerUpDef.name}`);
        }
      } catch (error) {
        console.error(`  ✗ Failed to process power-up ${powerUpDef.name}:`, error);
      }
    }

    // -------------------------
    // Seed Cosmetics (create missing only)
    // -------------------------
    for (const cosmeticDef of COSMETIC_DEFINITIONS) {
      try {
        const byId = await tx
          .select()
          .from(cosmeticCatalog)
          .where(eq(cosmeticCatalog.id, cosmeticDef.id!))
          .limit(1);

        const existingByKey = byId.length
          ? byId
          : await tx
              .select()
              .from(cosmeticCatalog)
              .where(
                and(
                  eq(cosmeticCatalog.name, cosmeticDef.name),
                  eq(cosmeticCatalog.type, cosmeticDef.type)
                )
              )
              .limit(1);

        if (existingByKey.length === 0) {
          await tx.insert(cosmeticCatalog).values(cosmeticDef);
          cosmeticsCreated++;
          console.log(`  ✓ Created cosmetic: ${cosmeticDef.name}`);
        }
      } catch (error) {
        console.error(`  ✗ Failed to process cosmetic ${cosmeticDef.name}:`, error);
      }
    }

    return {
      powerUpsCreated,
      cosmeticsCreated,
      powerUpsUpdated,
      cosmeticsUpdated,
    };
  });

  console.log(`✅ Catalog initialization complete:`, summary);
  return summary;
}

export async function ensureGammaImageStyles(): Promise<{
  stylesCreated: number;
  stylesUpdated: number;
}> {
  console.log("🎨 Ensuring Gamma image styles are initialized...");
  
  let stylesCreated = 0;
  let stylesUpdated = 0;

  await db.transaction(async (tx) => {
    // Serialize startup seeding across clustered instances.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('ensureGammaImageStyles_v1'))`);

    // Legacy self-heal: collapse duplicate style keys.
    await tx.execute(sql`
      DELETE FROM "gammaImageStyles" a
      USING "gammaImageStyles" b
      WHERE a."styleKey" = b."styleKey"
        AND a.ctid < b.ctid
    `);

    for (const styleDef of GAMMA_IMAGE_STYLE_DEFINITIONS) {
      try {
        // Check if style with this styleKey already exists
        const existing = await tx
          .select()
          .from(gammaImageStyles)
          .where(eq(gammaImageStyles.styleKey, styleDef.styleKey))
          .limit(1);

        if (existing.length === 0) {
          // Insert new image style
          await tx.insert(gammaImageStyles).values(styleDef);
          stylesCreated++;
          console.log(`  ✓ Created image style: ${styleDef.displayName}`);
        } else {
          // Update fields but preserve custom thumbnailUrl if set
          const needsUpdate = 
            existing[0].displayName !== styleDef.displayName ||
            existing[0].description !== styleDef.description ||
            existing[0].weight !== styleDef.weight ||
            (!existing[0].thumbnailUrl && !!styleDef.thumbnailUrl);

          if (needsUpdate) {
            await tx
              .update(gammaImageStyles)
              .set({
                displayName: styleDef.displayName,
                description: styleDef.description,
                thumbnailUrl: existing[0].thumbnailUrl || styleDef.thumbnailUrl,
                weight: styleDef.weight,
                recommendedUseCases: styleDef.recommendedUseCases as any,
                updatedAt: new Date(),
              })
              .where(eq(gammaImageStyles.id, existing[0].id));
            stylesUpdated++;
            console.log(`  ↻ Updated image style: ${styleDef.displayName}`);
          }
        }
      } catch (error) {
        console.error(`  ✗ Failed to process image style ${styleDef.displayName}:`, error);
      }
    }
  });

  const summary = {
    stylesCreated,
    stylesUpdated,
  };

  console.log(`✅ Image style initialization complete:`, summary);

  return summary;
}

export async function ensureGamificationAdminDefaults(): Promise<{
  economyRulesCreated: number;
  challengesCreated: number;
}> {
  console.log("🧩 Ensuring gamification admin defaults are initialized...");

  let economyRulesCreated = 0;
  let challengesCreated = 0;

  await db.transaction(async (tx) => {
    // Serialize startup seeding across clustered instances.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('ensureGamificationAdminDefaults_v1'))`);

    for (const rule of ECONOMY_DEFAULTS) {
      const [existingCanonical] = await tx
        .select()
        .from(gamificationEconomyRules)
        .where(
          and(
            eq(gamificationEconomyRules.scope, "global"),
            isNull(gamificationEconomyRules.organizationId),
            eq(gamificationEconomyRules.actionType, rule.actionType)
          )
        )
        .limit(1);

      if (existingCanonical) {
        continue;
      }

      const aliasCandidates = [rule.actionType, ...(ECONOMY_ALIASES[rule.actionType] || [])];
      const aliasRows = await tx
        .select()
        .from(gamificationEconomyRules)
        .where(
          and(
            eq(gamificationEconomyRules.scope, "global"),
            isNull(gamificationEconomyRules.organizationId)
          )
        );
      const fallbackFromAlias = aliasRows.find((row) => aliasCandidates.includes(row.actionType));

      await tx.insert(gamificationEconomyRules).values({
        scope: "global",
        organizationId: null,
        actionType: rule.actionType,
        coinReward: fallbackFromAlias?.coinReward ?? rule.coinReward,
        xpReward: fallbackFromAlias?.xpReward ?? rule.xpReward,
        description: fallbackFromAlias?.description || rule.description,
        isActive: fallbackFromAlias?.isActive ?? true,
      });

      economyRulesCreated++;
      console.log(`  ✓ Created economy rule: ${rule.actionType}`);
    }

    for (const challenge of DEFAULT_CHALLENGES) {
      const [existing] = await tx
        .select()
        .from(adminChallengeConfig)
        .where(eq(adminChallengeConfig.id, challenge.id))
        .limit(1);
      if (existing) {
        continue;
      }

      await tx.insert(adminChallengeConfig).values({
        id: challenge.id,
        scope: "global",
        organizationId: null,
        challengeType: challenge.challengeType,
        title: challenge.title,
        description: challenge.description,
        goalType: challenge.goalType,
        goalTarget: challenge.goalTarget,
        coinReward: challenge.coinReward,
        xpReward: challenge.xpReward,
        isActive: true,
      });
      challengesCreated++;
      console.log(`  ✓ Created challenge: ${challenge.title}`);
    }
  });

  const summary = { economyRulesCreated, challengesCreated };
  console.log("✅ Gamification admin defaults ensured:", summary);
  return summary;
}
