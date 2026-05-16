/**
 * Gamification Routes
 * 
 * All routes related to the gamification system including:
 * - Coins (balance, transactions, adjustments)
 * - Power-ups (catalog, inventory, purchase, activate)
 * - Cosmetics (catalog, ownership, equip)
 * - Season Pass (progress, purchases, tiers)
 * - Challenges (daily/weekly challenges, rewards)
 * - Leaderboard (rankings, stats)
 * - Achievements and Streaks
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { eq, and, desc, gte, lte, isNull } from 'drizzle-orm';
import { db } from '../db';
import { GamificationService } from '../gamificationService';
import { 
  storage,
  withSessionAuthMiddleware,
  isSuperAdmin,
  isTeacherOrAdmin,
  resolveEffectiveOrganization,
  type RequestWithEffectiveOrg,
} from './sharedResources';
import { isSuperAdminOrCustSuper } from '../adminAuth';
import * as schema from '@shared/schema';
import {
  purchasePowerUpSchema,
  activatePowerUpSchema,
  purchaseCosmeticSchema,
  equipCosmeticSchema,
  unequipCosmeticSchema,
  purchaseSeasonPassSchema,
  insertGamificationEconomyRuleSchema,
  insertShopItemPricingSchema,
  insertAdminChallengeConfigSchema,
  insertSeasonPassConfigSchema,
  insertCoinAdjustmentSchema,
  seasonPassConfig,
  cosmeticOwnership,
} from '@shared/schema';

const router = Router();
const gamificationService = new GamificationService();

function sanitizeForLogging(obj: any): any {
  if (!obj) return obj;
  const sanitized = { ...obj };
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey'];
  for (const field of sensitiveFields) {
    if (sanitized[field]) sanitized[field] = '[REDACTED]';
  }
  return sanitized;
}

// ========================================
// LEADERBOARD ROUTES
// ========================================

router.get("/leaderboard/:limit?", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const limit = parseInt(req.params.limit || req.query.limit as string) || 10;
    
    const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);

    // Top admin without impersonation can explicitly request cross-org.
    let organizationId: string | undefined = effectiveOrg.organizationId || undefined;
    if ((user.isSuperAdmin || user.isCustSuper) && req.query.crossOrg === 'true' && !effectiveOrg.isImpersonation) {
      organizationId = undefined;
    }

    const leaderboard = await storage.getLeaderboard(limit, organizationId);
    res.json(leaderboard);
  } catch (error) {
    console.error("Get leaderboard error:", error);
    res.status(500).json({ error: "Failed to get leaderboard" });
  }
});

router.get("/leaderboard/stats", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);

    let organizationId: string | undefined = effectiveOrg.organizationId || undefined;
    if ((user.isSuperAdmin || user.isCustSuper) && req.query.crossOrg === 'true' && !effectiveOrg.isImpersonation) {
      organizationId = undefined;
    }

    const stats = await storage.getLeaderboardStats(organizationId);
    res.json(stats);
  } catch (error) {
    console.error("Get leaderboard stats error:", error);
    res.status(500).json({ error: "Failed to get leaderboard stats" });
  }
});

router.get("/quiz-leaderboard", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const unitId = req.query.unitId as string | undefined;
    const subUnitId = req.query.subUnitId as string | undefined;
    const subjectId = req.query.subjectId as string | undefined;
    const days = parseInt(req.query.days as string) || undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const collectionType = req.query.collectionType as 'public' | 'organization' | undefined;

    const requestedOrgId = (req.query.organizationId as string | undefined) || undefined;
    const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);

    // Default to effective org context. Only top admin without impersonation can query cross-org with explicit omission.
    let organizationId: string | undefined = effectiveOrg.organizationId || undefined;

    if ((user.isSuperAdmin || user.isCustSuper) && !effectiveOrg.isImpersonation) {
      organizationId = requestedOrgId;
    } else if (requestedOrgId && requestedOrgId !== effectiveOrg.organizationId) {
      return res.status(403).json({ error: "Access denied: Cross-organization access not permitted in current context" });
    }

    const leaderboard = await storage.getQuizLeaderboard({
      organizationId,
      unitId,
      subUnitId,
      subjectId,
      days,
      limit,
      collectionType
    });

    const parsedLeaderboard = leaderboard.map((player: any) => ({
      ...player,
      equippedCosmetics: player.equippedCosmetics 
        ? (typeof player.equippedCosmetics === 'string' 
            ? JSON.parse(player.equippedCosmetics) 
            : player.equippedCosmetics)
        : null
    }));

    res.json(parsedLeaderboard);
  } catch (error) {
    console.error("Get quiz leaderboard error:", error);
    res.status(500).json({ error: "Failed to get quiz leaderboard" });
  }
});

router.get("/user/leaderboard-stats", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const playerStats = await storage.getPlayerStats(userId);

    if (playerStats) {
      let leaderboardPosition = null;
      try {
        const fullLeaderboard = await storage.getLeaderboard(10000);
        const position = fullLeaderboard.findIndex((entry: any) => entry.id === userId);
        if (position !== -1) {
          leaderboardPosition = position + 1;
        }
      } catch (e) {
        console.error("Error getting leaderboard position:", e);
      }

      res.json({
        ...playerStats,
        leaderboardPosition
      });
    } else {
      res.json({
        currentXP: 0,
        currentLevel: 1,
        totalGamesPlayed: 0,
        totalWins: 0,
        totalLosses: 0,
        winStreak: 0,
        leaderboardPosition: null
      });
    }
  } catch (error) {
    console.error("Get user leaderboard stats error:", error);
    res.status(500).json({ error: "Failed to get leaderboard stats" });
  }
});

// ========================================
// GAMIFICATION COIN ROUTES
// ========================================

router.get("/gamification/coins/balance", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const balance = await gamificationService.getUserCoinBalance(userId);
    res.json({ balance });
  } catch (error) {
    console.error("Get coin balance error:", error);
    res.status(500).json({ error: "Failed to get coin balance" });
  }
});

router.get("/gamification/coins/transactions", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const limit = parseInt(req.query.limit as string) || 50;
    const transactions = await gamificationService.getUserCoinTransactions(userId, limit);
    res.json(transactions);
  } catch (error) {
    console.error("Get coin transactions error:", error);
    res.status(500).json({ error: "Failed to get coin transactions" });
  }
});

// ========================================
// POWER-UP ROUTES
// ========================================

router.get("/gamification/powerups/catalog", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const catalog = await gamificationService.getPowerUpCatalog();
    
    // Get user's active power-ups to determine which ones are currently active
    const now = new Date();
    const userActivePowerUps = await db
      .select({ powerUpId: schema.activePowerUps.powerUpId })
      .from(schema.activePowerUps)
      .where(
        and(
          eq(schema.activePowerUps.userId, userId),
          gte(schema.activePowerUps.expiresAt, now)
        )
      );
    
    const activePowerUpIds = new Set(userActivePowerUps.map(ap => ap.powerUpId));
    
    // Add userActive field to each catalog item
    const catalogWithUserStatus = catalog.map(item => ({
      ...item,
      userActive: activePowerUpIds.has(item.id)
    }));
    
    res.json(catalogWithUserStatus);
  } catch (error) {
    console.error("Get power-up catalog error:", error);
    res.status(500).json({ error: "Failed to get power-up catalog" });
  }
});

router.post("/admin/gamification/powerups", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const createPowerUpSchema = z.object({
      name: z.string().min(1).max(100),
      description: z.string().min(1).max(500),
      type: z.string().min(1).max(50),
      effect: z.any(),
      coinCost: z.number().int().min(0).max(999999),
      tier: z.enum(['common', 'rare', 'epic', 'legendary']).optional(),
      isActive: z.boolean().optional(),
    });
    
    const validatedData = createPowerUpSchema.parse(req.body);

    const [created] = await db
      .insert(schema.powerUpCatalog)
      .values({
        name: validatedData.name,
        description: validatedData.description,
        type: validatedData.type,
        effect: validatedData.effect,
        coinCost: validatedData.coinCost,
        tier: validatedData.tier,
        isActive: validatedData.isActive,
      })
      .returning();

    res.json(created);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid power-up data", details: error.errors });
    }
    console.error("Create power-up error:", error);
    res.status(500).json({ error: "Failed to create power-up" });
  }
});

router.patch("/admin/gamification/powerups/:id", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const updatePowerUpSchema = z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().min(1).max(500).optional(),
      type: z.string().min(1).max(50).optional(),
      effect: z.any().optional(),
      coinCost: z.number().int().min(0).max(999999).optional(),
      tier: z.enum(['common', 'rare', 'epic', 'legendary']).optional(),
      isActive: z.boolean().optional(),
    });
    
    const validatedData = updatePowerUpSchema.parse(req.body);

    const [updated] = await db
      .update(schema.powerUpCatalog)
      .set(validatedData)
      .where(eq(schema.powerUpCatalog.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Power-up not found" });
    }

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid power-up data", details: error.errors });
    }
    console.error("Update power-up error:", error);
    res.status(500).json({ error: "Failed to update power-up" });
  }
});

router.delete("/admin/gamification/powerups/:id", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await db.transaction(async (tx) => {
      await tx.delete(schema.activePowerUps)
        .where(eq(schema.activePowerUps.powerUpId, id));
      
      await tx.delete(schema.powerUpInventory)
        .where(eq(schema.powerUpInventory.powerUpId, id));
      
      const [deleted] = await tx
        .delete(schema.powerUpCatalog)
        .where(eq(schema.powerUpCatalog.id, id))
        .returning();

      if (!deleted) {
        throw new Error("Power-up not found");
      }
    });

    res.json({ success: true, message: "Power-up deleted successfully" });
  } catch (error: any) {
    console.error("Delete power-up error:", error);
    if (error.message === "Power-up not found") {
      return res.status(404).json({ error: "Power-up not found" });
    }
    res.status(500).json({ error: "Failed to delete power-up" });
  }
});

router.patch("/gamification/powerups/catalog/:id", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await storage.getUser(req.session.userId!);
    if (!user?.isSuperAdmin && !user?.isCustSuper) {
      return res.status(403).json({ error: "SuperAdmin or CustSuper access required" });
    }

    const { id } = req.params;
    
    const updateCatalogPriceSchema = z.object({
      coinCost: z.number().int().min(0).max(999999),
    });
    
    const validatedData = updateCatalogPriceSchema.parse(req.body);

    const [updated] = await db
      .update(schema.powerUpCatalog)
      .set({ coinCost: validatedData.coinCost })
      .where(eq(schema.powerUpCatalog.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Powerup not found" });
    }

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid coinCost", details: error.errors });
    }
    console.error("Update powerup catalog error:", error);
    res.status(500).json({ error: "Failed to update powerup catalog" });
  }
});

router.get("/gamification/powerups/inventory", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    
    const inventory = await db
      .select()
      .from(schema.powerUpInventory)
      .where(eq(schema.powerUpInventory.userId, userId));
    
    const enriched = await Promise.all(
      inventory.map(async (item) => {
        const catalogRecords = await db
          .select()
          .from(schema.powerUpCatalog)
          .where(eq(schema.powerUpCatalog.id, item.powerUpId))
          .limit(1);
        
        const catalog = catalogRecords[0];
        
        return {
          id: item.id,
          powerUpId: item.powerUpId,
          quantity: item.quantity,
          createdAt: item.createdAt,
          name: catalog?.name || 'Unknown',
          description: catalog?.description || '',
          effectType: catalog?.type || '',
          effect: catalog?.effect || {},
          duration: (catalog?.effect as any)?.duration || 0,
          iconUrl: catalog?.iconUrl || '',
          tier: catalog?.tier || 'common',
        };
      })
    );
    
    res.json(enriched);
  } catch (error) {
    console.error("Get power-up inventory error:", error);
    res.status(500).json({ error: "Failed to get power-up inventory" });
  }
});

router.post("/gamification/powerups/purchase", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const validatedData = purchasePowerUpSchema.parse(req.body);

    const result = await gamificationService.purchasePowerUp(userId, validatedData.powerUpId);

    if (!result) {
      return res.status(400).json({ error: "Insufficient coins or invalid power-up" });
    }

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request data", details: error.errors });
    }
    console.error("Purchase power-up error:", error);
    res.status(500).json({ error: "Failed to purchase power-up" });
  }
});

router.post("/gamification/powerups/:powerupId/purchase", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const powerUpId = req.params.powerupId;

    const result = await gamificationService.purchasePowerUp(userId, powerUpId);

    if (!result) {
      return res.status(400).json({ error: "Insufficient coins or invalid power-up" });
    }

    res.json(result);
  } catch (error) {
    console.error("Purchase power-up error:", error);
    res.status(500).json({ error: "Failed to purchase power-up" });
  }
});

router.post("/gamification/powerups/activate", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const validatedData = activatePowerUpSchema.parse(req.body);

    const result = await gamificationService.activatePowerUp(userId, validatedData.powerUpId, validatedData.gameId);

    if (!result) {
      return res.status(400).json({ error: "Cannot activate power-up. You may not have it in inventory, or you already have an active power-up of the same type." });
    }

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request data", details: error.errors });
    }
    console.error("Activate power-up error:", error);
    res.status(500).json({ error: "Failed to activate power-up" });
  }
});

router.get("/gamification/powerups/active", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const now = new Date();
    
    await db
      .delete(schema.activePowerUps)
      .where(
        and(
          eq(schema.activePowerUps.userId, userId),
          lte(schema.activePowerUps.expiresAt, now)
        )
      );
    
    const activePowerUps = await db
      .select()
      .from(schema.activePowerUps)
      .where(
        and(
          eq(schema.activePowerUps.userId, userId),
          gte(schema.activePowerUps.expiresAt, now)
        )
      );
    
    const enriched = await Promise.all(
      activePowerUps.map(async (powerUp) => {
        const catalog = await db
          .select()
          .from(schema.powerUpCatalog)
          .where(eq(schema.powerUpCatalog.id, powerUp.powerUpId))
          .limit(1);
        
        const catalogItem = catalog[0];
        
        return {
          id: powerUp.id,
          userId: powerUp.userId,
          powerUpId: powerUp.powerUpId,
          activatedAt: powerUp.activatedAt,
          expiresAt: powerUp.expiresAt,
          usesRemaining: powerUp.usesRemaining,
          powerUpName: catalogItem?.name || 'Unknown',
          description: catalogItem?.description || '',
          effectType: catalogItem?.type || '',
          duration: (catalogItem?.effect as any)?.duration || 0,
          iconUrl: catalogItem?.iconUrl || '',
          effect: powerUp.effect,
          effectValue: (powerUp.effect as any)?.value || 1,
        };
      })
    );
    
    res.json(enriched);
  } catch (error) {
    console.error("Get active power-ups error:", error);
    res.status(500).json({ error: "Failed to get active power-ups" });
  }
});

// ========================================
// COSMETIC ROUTES
// ========================================

router.get("/gamification/cosmetics/catalog", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const catalog = await gamificationService.getCosmeticCatalog();
    res.json(catalog);
  } catch (error) {
    console.error("Get cosmetic catalog error:", error);
    res.status(500).json({ error: "Failed to get cosmetic catalog" });
  }
});

router.patch("/gamification/cosmetics/catalog/:id", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await storage.getUser(req.session.userId!);
    if (!user?.isSuperAdmin && !user?.isCustSuper) {
      return res.status(403).json({ error: "SuperAdmin or CustSuper access required" });
    }

    const { id } = req.params;
    
    const updateCatalogPriceSchema = z.object({
      coinCost: z.number().int().min(0).max(999999),
    });
    
    const validatedData = updateCatalogPriceSchema.parse(req.body);

    const [updated] = await db
      .update(schema.cosmeticCatalog)
      .set({ coinCost: validatedData.coinCost })
      .where(eq(schema.cosmeticCatalog.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Cosmetic not found" });
    }

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid coinCost", details: error.errors });
    }
    console.error("Update cosmetic catalog error:", error);
    res.status(500).json({ error: "Failed to update cosmetic catalog" });
  }
});

router.get("/gamification/cosmetics/owned", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const owned = await gamificationService.getUserCosmetics(userId);
    res.json(owned);
  } catch (error) {
    console.error("Get owned cosmetics error:", error);
    res.status(500).json({ error: "Failed to get owned cosmetics" });
  }
});

router.post("/gamification/cosmetics/purchase", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const validatedData = purchaseCosmeticSchema.parse(req.body);

    const result = await gamificationService.purchaseCosmetic(userId, validatedData.cosmeticId);

    if (!result) {
      return res.status(400).json({ error: "Insufficient coins, already owned, or invalid cosmetic" });
    }

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request data", details: error.errors });
    }
    console.error("Purchase cosmetic error:", error);
    res.status(500).json({ error: "Failed to purchase cosmetic" });
  }
});

router.post("/gamification/cosmetics/:cosmeticId/purchase", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const cosmeticId = req.params.cosmeticId;

    const result = await gamificationService.purchaseCosmetic(userId, cosmeticId);

    if (!result) {
      return res.status(400).json({ error: "Insufficient coins, already owned, or invalid cosmetic" });
    }

    res.json(result);
  } catch (error) {
    console.error("Purchase cosmetic error:", error);
    res.status(500).json({ error: "Failed to purchase cosmetic" });
  }
});

router.post("/gamification/cosmetics/equip", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const validatedData = equipCosmeticSchema.parse(req.body);

    const result = await gamificationService.equipCosmetic(userId, validatedData.cosmeticId, validatedData.slot);

    if (!result) {
      return res.status(400).json({ error: "Cannot equip cosmetic. You may not own it or slot is invalid." });
    }

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request data", details: error.errors });
    }
    console.error("Equip cosmetic error:", error);
    res.status(500).json({ error: "Failed to equip cosmetic" });
  }
});

router.post("/gamification/cosmetics/unequip", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const validatedData = unequipCosmeticSchema.parse(req.body);

    await gamificationService.unequipCosmetic(userId, validatedData.slot);
    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request data", details: error.errors });
    }
    console.error("Unequip cosmetic error:", error);
    res.status(500).json({ error: "Failed to unequip cosmetic" });
  }
});

router.get("/gamification/cosmetics/equipped", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const equipped = await gamificationService.getUserEquippedCosmetics(userId);
    res.json(equipped);
  } catch (error) {
    console.error("Get equipped cosmetics error:", error);
    res.status(500).json({ error: "Failed to get equipped cosmetics" });
  }
});

router.get("/gamification/cosmetics/active/:userId", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const requestingUserId = req.session.userId!;
    const targetUserId = req.params.userId;
    
    if (!targetUserId || typeof targetUserId !== 'string' || targetUserId.length < 10) {
      return res.json([]);
    }
    
    // Get requesting user to check permissions
    const requestingUser = await storage.getUser(requestingUserId);
    if (!requestingUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // If requesting own cosmetics, allow
    if (requestingUserId === targetUserId) {
      const equipped = await gamificationService.getUserEquippedCosmetics(targetUserId);
      return res.json(equipped || []);
    }

    // SuperAdmin or CustSuper can view any user's cosmetics
    if (requestingUser.isSuperAdmin || requestingUser.isCustSuper) {
      const equipped = await gamificationService.getUserEquippedCosmetics(targetUserId);
      return res.json(equipped || []);
    }

    // Check if requesting user and target user are in the same organization
    const requestingUserRoles = await storage.getUserRoles(requestingUserId);
    const targetUserRoles = await storage.getUserRoles(targetUserId);
    
    const requestingOrgIds = (requestingUserRoles || []).map(r => r.organizationId);
    const targetOrgIds = (targetUserRoles || []).map(r => r.organizationId);
    
    const hasSharedOrg = requestingOrgIds.some(orgId => targetOrgIds.includes(orgId));
    
    if (!hasSharedOrg) {
      return res.status(403).json({ error: "You can only view cosmetics of users in your organization" });
    }

    const equipped = await gamificationService.getUserEquippedCosmetics(targetUserId);
    res.json(equipped || []);
  } catch (error) {
    console.error("Get active cosmetics error:", error);
    res.json([]);
  }
});

// ========================================
// SEASON PASS ROUTES
// ========================================

router.post("/gamification/season-pass/purchase", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const validatedData = purchaseSeasonPassSchema.parse(req.body);

    const result = await gamificationService.purchaseSeasonPass(userId, validatedData.seasonPassConfigId);

    if (!result) {
      return res.status(400).json({ error: "Insufficient coins, already active, or invalid season pass" });
    }

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request data", details: error.errors });
    }
    console.error("Purchase season pass error:", error);
    res.status(500).json({ error: "Failed to purchase season pass" });
  }
});

router.get("/admin/season-pass/all", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { sql } = await import('drizzle-orm');
    const configs = await db
      .select()
      .from(schema.seasonPassConfig)
      .where(
        and(
          eq(schema.seasonPassConfig.status, 'active'),
          sql`(${schema.seasonPassConfig.endDate} > NOW() OR ${schema.seasonPassConfig.endDate} IS NULL)`
        )
      )
      .orderBy(schema.seasonPassConfig.seasonNumber);
    
    res.json(configs);
  } catch (error) {
    console.error("Get all season passes error:", error);
    res.status(500).json({ error: "Failed to get season passes" });
  }
});

router.get("/gamification/season-pass/active-purchases", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { sql } = await import('drizzle-orm');
    
    const purchases = await db
      .select({
        id: schema.seasonPassPurchases.id,
        seasonPassConfigId: schema.seasonPassPurchases.seasonPassConfigId,
        purchasedAt: schema.seasonPassPurchases.purchasedAt,
        expiresAt: schema.seasonPassPurchases.expiresAt,
        seasonNumber: schema.seasonPassConfig.seasonNumber,
        seasonName: schema.seasonPassConfig.seasonName,
      })
      .from(schema.seasonPassPurchases)
      .innerJoin(
        schema.seasonPassConfig,
        eq(schema.seasonPassPurchases.seasonPassConfigId, schema.seasonPassConfig.id)
      )
      .where(
        and(
          eq(schema.seasonPassPurchases.userId, userId),
          sql`${schema.seasonPassPurchases.expiresAt} > NOW()`
        )
      );
    
    res.json(purchases);
  } catch (error) {
    console.error("Get active season pass purchases error:", error);
    res.status(500).json({ error: "Failed to get active season passes" });
  }
});

router.get("/gamification/season-pass/purchases", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const purchases = await storage.getUserSeasonPassPurchases(userId);
    res.json(purchases);
  } catch (error) {
    console.error("Get season pass purchases error:", error);
    res.status(500).json({ error: "Failed to get season pass purchases" });
  }
});

router.get("/gamification/season-pass", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    
    const playerStats = await storage.getPlayerStats(userId);
    const currentXP = playerStats?.currentXP || 0;
    
    const userRoles = await storage.getUserRoles(userId);
    const organizationId = userRoles && userRoles.length > 0 ? userRoles[0].organizationId : undefined;
    
    let config = organizationId ? await storage.getSeasonPassConfig(organizationId) : null;
    
    if (!config) {
      config = await storage.getSeasonPassConfig('global');
    }
    
    if (!config) {
      return res.json({ currentTier: 0, currentXP, tiers: [], hasActivePass: false });
    }
    
    const activePurchase = await storage.getUserActiveSeasonPass(userId, config.id);
    const hasActivePass = !!activePurchase;
    
    const progressRecords = await db
      .select()
      .from(schema.seasonPassProgress)
      .where(
        and(
          eq(schema.seasonPassProgress.userId, userId),
          eq(schema.seasonPassProgress.seasonPassConfigId, config.id)
        )
      )
      .limit(1);
    
    const userProgress = progressRecords[0];
    const seasonXP = userProgress?.seasonXP || 0;
    const claimedTiers = userProgress?.claimedTiers || [];
    
    const tierDefinitions = config.tierDefinitions as any[] || [];
    
    const tierData = tierDefinitions.map((tierDef: any) => ({
      id: `tier-${tierDef.tier}`,
      tier: tierDef.tier,
      requiredXP: tierDef.xpRequired,
      isUnlocked: seasonXP >= tierDef.xpRequired,
      isClaimed: claimedTiers.includes(`tier-${tierDef.tier}`),
      freeReward: {
        type: tierDef.freeReward?.rewardType || null,
        amount: tierDef.freeReward?.rewardAmount || null,
        id: tierDef.freeReward?.rewardId || null,
      },
      premiumReward: {
        type: tierDef.premiumReward?.rewardType || null,
        amount: tierDef.premiumReward?.rewardAmount || null,
        id: tierDef.premiumReward?.rewardId || null,
      }
    }));
    
    const currentTier = tierData.filter(t => t.isUnlocked).length;
    
    res.json({
      currentTier,
      currentXP: seasonXP,
      tiers: tierData,
      hasActivePass,
      seasonNumber: config.seasonNumber,
      seasonName: config.seasonName,
      seasonPassConfigId: config.id,
      coinCost: config.coinCost || 0,
      startDate: config.startDate,
      endDate: config.endDate
    });
  } catch (error) {
    console.error("Get season pass error:", error);
    res.status(500).json({ error: "Failed to get season pass" });
  }
});

router.get("/gamification/season-pass/active", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const seasonPassConfigId = req.query.seasonPassConfigId as string;
    
    if (!seasonPassConfigId) {
      return res.status(400).json({ error: "Season pass config ID is required" });
    }

    const activePass = await storage.getUserActiveSeasonPass(userId, seasonPassConfigId);
    res.json(activePass || null);
  } catch (error) {
    console.error("Get active season pass error:", error);
    res.status(500).json({ error: "Failed to get active season pass" });
  }
});

router.post("/gamification/season-pass/claim-tier", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { tierId } = req.body;

    if (!tierId) {
      return res.status(400).json({ error: "Tier ID is required" });
    }

    const result = await gamificationService.claimSeasonPassTierReward(userId, tierId);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json(result);
  } catch (error) {
    console.error("Claim tier reward error:", error);
    res.status(500).json({ error: "Failed to claim tier reward" });
  }
});

// ========================================
// SEASON PASS ADMIN ROUTES
// ========================================

router.get("/season-pass/list", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const organizationId = req.query.organizationId as string | undefined;
    const seasonPasses = await storage.getSeasonPasses(organizationId);
    res.json(seasonPasses);
  } catch (error) {
    console.error("Get season passes error:", error);
    res.status(500).json({ error: "Failed to get season passes" });
  }
});

router.get("/season-pass/:id", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const seasonPass = await storage.getSeasonPassById(id);
    
    if (!seasonPass) {
      return res.status(404).json({ error: "Season pass not found" });
    }
    
    res.json(seasonPass);
  } catch (error) {
    console.error("Get season pass error:", error);
    res.status(500).json({ error: "Failed to get season pass" });
  }
});

router.post("/season-pass", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const data = insertSeasonPassConfigSchema.parse(req.body);
    const seasonPass = await storage.createSeasonPass(data);
    res.json(seasonPass);
  } catch (error: any) {
    console.error("Create season pass error:", error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: "Invalid season pass data", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create season pass" });
  }
});

router.patch("/season-pass/:id", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    
    const updateData = {
      ...data,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
    };
    
    const seasonPass = await storage.updateSeasonPass(id, updateData);
    
    if (!seasonPass) {
      return res.status(404).json({ error: "Season pass not found" });
    }
    
    res.json(seasonPass);
  } catch (error) {
    console.error("Update season pass error:", error);
    res.status(500).json({ error: "Failed to update season pass" });
  }
});

router.post("/season-pass/:id/activate", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const seasonPass = await storage.getSeasonPassById(id);
    if (!seasonPass) {
      return res.status(404).json({ error: "Season pass not found" });
    }
    
    const existingActive = await storage.getActiveSeasonPass(
      seasonPass.scope === 'global' ? 'global' : seasonPass.organizationId || undefined
    );
    
    if (existingActive && existingActive.id !== id) {
      return res.status(400).json({ 
        error: "Another season pass is already active for this scope. Please expire it first.",
        activeSeasonPass: existingActive 
      });
    }
    
    const activated = await storage.activateSeasonPass(id);
    res.json(activated);
  } catch (error) {
    console.error("Activate season pass error:", error);
    res.status(500).json({ error: "Failed to activate season pass" });
  }
});

router.post("/season-pass/:id/expire", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const expired = await storage.expireSeasonPass(id);
    
    if (!expired) {
      return res.status(404).json({ error: "Season pass not found" });
    }
    
    res.json(expired);
  } catch (error) {
    console.error("Expire season pass error:", error);
    res.status(500).json({ error: "Failed to expire season pass" });
  }
});

router.post("/season-pass/claim-reward", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { seasonPassConfigId, tier, isPremiumReward } = req.body;
    
    if (!seasonPassConfigId || tier === undefined || isPremiumReward === undefined) {
      return res.status(400).json({ error: "Missing required fields: seasonPassConfigId, tier, isPremiumReward" });
    }
    
    const seasonPass = await storage.getSeasonPassById(seasonPassConfigId);
    if (!seasonPass) {
      return res.status(404).json({ error: "Season pass not found" });
    }
    
    const tierDef = (seasonPass.tierDefinitions as any[]).find((t: any) => t.tier === tier);
    if (!tierDef) {
      return res.status(404).json({ error: "Tier not found" });
    }
    
    const reward = await storage.createPlayerSeasonReward(
      userId,
      seasonPassConfigId,
      tier,
      isPremiumReward,
      {
        rewardType: tierDef.rewardType,
        rewardId: tierDef.rewardId || null,
        rewardAmount: tierDef.rewardAmount || null,
        rewardSnapshot: tierDef,
      }
    );
    
    res.json(reward);
  } catch (error: any) {
    console.error("Claim reward error:", error);
    if (error.code === '23505') {
      return res.status(400).json({ error: "Reward already claimed" });
    }
    res.status(500).json({ error: "Failed to claim reward" });
  }
});

// ========================================
// CHALLENGE ROUTES
// ========================================

router.get("/gamification/challenges", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    
    const userRoles = await storage.getUserRoles(userId);
    const organizationId = userRoles && userRoles.length > 0 ? userRoles[0].organizationId : undefined;
    
    await gamificationService.ensureChallengeProgress(userId, organizationId);
    
    const progress = await db
      .select({
        progressId: schema.challengeProgress.id,
        challengeId: schema.challengeProgress.challengeId,
        currentProgress: schema.challengeProgress.currentValue,
        isCompleted: schema.challengeProgress.isCompleted,
        isClaimed: schema.challengeProgress.isClaimed,
        expiresAt: schema.challengeProgress.resetAt,
        completedAt: schema.challengeProgress.completedAt,
        id: schema.adminChallengeConfig.id,
        name: schema.adminChallengeConfig.title,
        description: schema.adminChallengeConfig.description,
        type: schema.adminChallengeConfig.challengeType,
        frequency: schema.adminChallengeConfig.challengeType,
        targetValue: schema.adminChallengeConfig.goalTarget,
        coinReward: schema.adminChallengeConfig.coinReward,
        xpReward: schema.adminChallengeConfig.xpReward,
      })
      .from(schema.challengeProgress)
      .innerJoin(
        schema.adminChallengeConfig,
        eq(schema.challengeProgress.challengeId, schema.adminChallengeConfig.id)
      )
      .where(eq(schema.challengeProgress.userId, userId));
    
    const enrichedChallenges = progress.map(p => ({
      id: p.challengeId,
      name: p.name,
      description: p.description,
      type: p.type,
      frequency: p.frequency,
      targetValue: p.targetValue,
      currentProgress: p.currentProgress || 0,
      coinReward: p.coinReward || 0,
      xpReward: p.xpReward || 0,
      status: p.isClaimed ? 'claimed' : p.isCompleted ? 'completed' : 'in_progress',
      expiresAt: p.expiresAt,
    }));
    
    res.json(enrichedChallenges);
  } catch (error) {
    console.error("Get challenges error:", error);
    res.status(500).json({ error: "Failed to get challenges" });
  }
});

router.post("/gamification/challenges/:challengeId/claim", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { challengeId } = req.params;

    if (!challengeId) {
      return res.status(400).json({ error: "Challenge ID is required" });
    }

    const reward = await gamificationService.claimChallengeReward(userId, challengeId);

    if (!reward) {
      return res.status(400).json({ error: "Challenge not completed or already claimed" });
    }

    res.json(reward);
  } catch (error) {
    console.error("Claim challenge reward error:", error);
    res.status(500).json({ error: "Failed to claim challenge reward" });
  }
});

// ========================================
// STREAK AND ACHIEVEMENTS ROUTES
// ========================================

router.get("/gamification/streak", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const streak = await gamificationService.getUserLoginStreak(userId);
    res.json(streak);
  } catch (error) {
    console.error("Get login streak error:", error);
    res.status(500).json({ error: "Failed to get login streak" });
  }
});

router.get("/gamification/achievements", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const achievements = await gamificationService.getUserAchievements(userId);
    res.json(achievements);
  } catch (error) {
    console.error("Get achievements error:", error);
    res.status(500).json({ error: "Failed to get achievements" });
  }
});

router.get("/gamification/dashboard", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;

    const [
      coinBalance,
      activePowerUps,
      equippedCosmetics,
      loginStreak,
      challengeProgress,
      playerStats
    ] = await Promise.all([
      gamificationService.getUserCoinBalance(userId),
      gamificationService.getUserActivePowerUps(userId),
      gamificationService.getUserEquippedCosmetics(userId),
      gamificationService.getUserLoginStreak(userId),
      gamificationService.getUserChallengeProgress(userId),
      storage.getPlayerStats(userId)
    ]);

    let correctedPlayerStats = playerStats;
    if (playerStats && playerStats.currentXP !== undefined) {
      const { XPService } = await import("../xpService");
      const xpService = new XPService();
      const correctLevel = xpService.getLevelFromXP(playerStats.currentXP ?? 0);
      if (playerStats.currentLevel !== correctLevel) {
        console.log(`⚠️ Level/XP desync detected for user ${userId}: stored level=${playerStats.currentLevel}, correct level=${correctLevel}, XP=${playerStats.currentXP}. Auto-correcting.`);
        await storage.updatePlayerStats(userId, { currentLevel: correctLevel });
        correctedPlayerStats = { ...playerStats, currentLevel: correctLevel };
      }
    }

    res.json({
      coinBalance,
      activePowerUps,
      equippedCosmetics,
      loginStreak,
      challengeProgress,
      playerStats: correctedPlayerStats || { currentXP: 0, currentLevel: 1 }
    });
  } catch (error) {
    console.error("Get gamification dashboard error:", error);
    res.status(500).json({ error: "Failed to get gamification dashboard" });
  }
});

// ========================================
// ADMIN GAMIFICATION ECONOMY ROUTES
// ========================================

router.get("/admin/gamification/economy", isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const scope = req.query.scope as string;
    const organizationId = req.query.organizationId as string | undefined;
    
    if (!scope) {
      return res.status(400).json({ error: "scope required" });
    }
    
    if (scope === 'organization' && !organizationId) {
      return res.status(400).json({ error: "organizationId required for organization scope" });
    }
    
    const effectiveOrgId = scope === 'global' ? 'global' : organizationId!;
    const rules = await storage.getGamificationEconomyRules(effectiveOrgId);
    res.json(rules);
  } catch (error) {
    console.error("Get economy rules error:", error);
    res.status(500).json({ error: "Failed to get economy rules" });
  }
});

router.post("/admin/gamification/economy", isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    console.log("Economy rule save request:", JSON.stringify(req.body));
    const parsed = insertGamificationEconomyRuleSchema.parse(req.body);
    const result = await storage.upsertGamificationEconomyRule(parsed);
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Economy rule validation error:", error.errors);
      return res.status(400).json({ error: "Invalid request data", details: error.errors });
    }
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Upsert economy rule error:", errorMessage, error);
    res.status(500).json({ error: "Failed to save economy rule", details: errorMessage });
  }
});

router.get("/admin/gamification/shop-pricing", isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const scope = req.query.scope as string;
    const organizationId = req.query.organizationId as string | undefined;
    
    if (!scope) {
      return res.status(400).json({ error: "scope required" });
    }
    
    if (scope === 'organization' && !organizationId) {
      return res.status(400).json({ error: "organizationId required for organization scope" });
    }
    
    const effectiveOrgId = scope === 'global' ? 'global' : organizationId!;
    const pricing = await storage.getShopItemPricing(effectiveOrgId);
    res.json(pricing);
  } catch (error) {
    console.error("Get shop pricing error:", error);
    res.status(500).json({ error: "Failed to get shop pricing" });
  }
});

router.post("/admin/gamification/shop-pricing", isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = insertShopItemPricingSchema.parse(req.body);
    const result = await storage.upsertShopItemPricing(parsed);
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request data", details: error.errors });
    }
    console.error("Upsert shop pricing error:", error);
    res.status(500).json({ error: "Failed to save shop pricing" });
  }
});

router.get("/admin/gamification/challenges", isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const scope = req.query.scope as string;
    const organizationId = req.query.organizationId as string | undefined;
    
    if (!scope) {
      return res.status(400).json({ error: "scope required" });
    }
    
    if (scope === 'organization' && !organizationId) {
      return res.status(400).json({ error: "organizationId required for organization scope" });
    }
    
    const effectiveOrgId = scope === 'global' ? 'global' : organizationId!;
    const configs = await storage.getAdminChallengeConfigs(effectiveOrgId);
    res.json(configs);
  } catch (error) {
    console.error("Get admin challenge configs error:", error);
    res.status(500).json({ error: "Failed to get challenge configs" });
  }
});

router.post("/admin/gamification/challenges", isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = insertAdminChallengeConfigSchema.parse(req.body);
    const result = await storage.createAdminChallengeConfig(parsed);
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request data", details: error.errors });
    }
    console.error("Create challenge config error:", error);
    res.status(500).json({ error: "Failed to create challenge config" });
  }
});

router.put("/admin/gamification/challenges/:id", isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await storage.updateAdminChallengeConfig(id, req.body);
    if (!result) {
      return res.status(404).json({ error: "Challenge config not found" });
    }
    res.json(result);
  } catch (error) {
    console.error("Update challenge config error:", error);
    res.status(500).json({ error: "Failed to update challenge config" });
  }
});

router.delete("/admin/gamification/challenges/:id", isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await storage.deleteAdminChallengeConfig(id);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete challenge config error:", error);
    res.status(500).json({ error: "Failed to delete challenge config" });
  }
});

router.get("/admin/gamification/season-pass", isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const scope = req.query.scope as string;
    const organizationId = req.query.organizationId as string | undefined;
    
    if (!scope) {
      return res.status(400).json({ error: "scope required" });
    }
    
    if (scope === 'organization' && !organizationId) {
      return res.status(400).json({ error: "organizationId required for organization scope" });
    }
    
    const configs = await db
      .select()
      .from(seasonPassConfig)
      .where(
        scope === 'global'
          ? and(
              eq(seasonPassConfig.scope, 'global'),
              isNull(seasonPassConfig.organizationId)
            )
          : and(
              eq(seasonPassConfig.scope, 'organization'),
              eq(seasonPassConfig.organizationId, organizationId!)
            )
      )
      .orderBy(desc(seasonPassConfig.createdAt));
    
    res.json(configs);
  } catch (error) {
    console.error("Get season pass configs error:", error);
    res.status(500).json({ error: "Failed to get season pass configs" });
  }
});

router.post("/admin/gamification/season-pass", isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    console.log('Season pass request body:', JSON.stringify(sanitizeForLogging(req.body), null, 2));
    const parsed = insertSeasonPassConfigSchema.parse(req.body);
    const result = await storage.upsertSeasonPassConfig(parsed);
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Season pass validation error:", JSON.stringify(error.errors, null, 2));
      return res.status(400).json({ error: "Invalid request data", details: error.errors });
    }
    console.error("Upsert season pass config error:", error);
    res.status(500).json({ error: "Failed to save season pass config" });
  }
});

router.delete("/admin/gamification/season-pass/:id", isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    await db.transaction(async (tx) => {
      const [config] = await tx
        .select()
        .from(schema.seasonPassConfig)
        .where(eq(schema.seasonPassConfig.id, id));
      
      if (!config) {
        throw new Error("Season pass not found");
      }
      
      await tx
        .delete(schema.seasonPassProgress)
        .where(eq(schema.seasonPassProgress.seasonPassConfigId, id));
      
      await tx
        .delete(schema.seasonPassPurchases)
        .where(eq(schema.seasonPassPurchases.seasonPassConfigId, id));
      
      await tx
        .delete(schema.seasonPassTiers)
        .where(eq(schema.seasonPassTiers.seasonPassConfigId, id));
      
      await tx
        .delete(schema.seasonPassConfig)
        .where(eq(schema.seasonPassConfig.id, id));
    });
    
    res.json({ success: true, message: "Season pass and all related data deleted successfully" });
  } catch (error: any) {
    console.error("Delete season pass error:", error);
    if (error.message === "Season pass not found") {
      return res.status(404).json({ error: "Season pass not found" });
    }
    res.status(500).json({ error: "Failed to delete season pass", details: error.message });
  }
});

router.get("/admin/gamification/student-balances", isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const organizationId = req.query.organizationId as string;
    const unitId = req.query.unitId as string | undefined;
    const subUnitId = req.query.subUnitId as string | undefined;
    
    if (!organizationId) {
      return res.status(400).json({ error: "organizationId required" });
    }

    let students: any[] = [];

    if (organizationId === 'global') {
      students = await storage.getAllStudentsAcrossOrganizations();
    } else {
      students = await storage.getOrganizationUsers(organizationId);
    }
    
    if (unitId && unitId !== 'all-grades') {
      students = students.filter((s: any) => s.unitId === unitId);
    }
    
    if (subUnitId && subUnitId !== 'all-classes') {
      students = students.filter((s: any) => s.subUnitId === subUnitId);
    }
    
    const studentsWithBalances = await Promise.all(
      students.map(async (student: any) => {
        const user = student.user || student;
        const balance = await gamificationService.getUserCoinBalance(user.id);
        const stats = await storage.getPlayerStats(user.id);
        return {
          id: user.id,
          gamerName: user.gamerName,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          coinBalance: balance,
          currentXP: stats?.currentXP || 0,
          currentLevel: stats?.currentLevel || 1,
          role: student.role || 'student',
          organizationName: student.organizationName || 'N/A'
        };
      })
    );

    res.json(studentsWithBalances);
  } catch (error) {
    console.error("Get student balances error:", error);
    res.status(500).json({ error: "Failed to get student balances" });
  }
});

router.post("/admin/gamification/adjust-coins", isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const { userId, amount, reason, organizationId } = req.body;
    
    if (!userId || amount === undefined || !reason) {
      return res.status(400).json({ error: "userId, amount, and reason are required" });
    }
    
    const adminId = req.session.userId!;
    
    const balanceBefore = await gamificationService.getUserCoinBalance(userId);
    
    const balanceAfter = balanceBefore + amount;
    
    const adjustmentData = {
      userId,
      amount,
      reason,
      adminId,
      organizationId: organizationId || null,
      balanceBefore,
      balanceAfter,
    };
    
    const parsed = insertCoinAdjustmentSchema.parse(adjustmentData);
    const adjustment = await storage.createCoinAdjustment(parsed);
    
    await gamificationService.adjustUserCoins(
      userId, 
      amount, 
      `Admin adjustment: ${reason}`
    );
    
    res.status(201).json(adjustment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request data", details: error.errors });
    }
    console.error("Adjust coins error:", error);
    res.status(500).json({ error: "Failed to adjust coins" });
  }
});

router.get("/admin/gamification/coin-adjustments", isTeacherOrAdmin, async (req: Request, res: Response) => {
  try {
    const organizationId = req.query.organizationId as string;
    const limit = parseInt(req.query.limit as string) || 100;
    
    if (!organizationId) {
      return res.status(400).json({ error: "organizationId required" });
    }
    
    if (organizationId === 'global') {
      return res.json([]);
    }
    
    const adjustments = await storage.getOrganizationCoinAdjustments(organizationId, limit);
    res.json(adjustments);
  } catch (error) {
    console.error("Get coin adjustments error:", error);
    res.status(500).json({ error: "Failed to get coin adjustments" });
  }
});

// ========================================
// COSMETIC LOADOUT ROUTES (Player-facing)
// ========================================

router.get("/cosmetics/loadout", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const loadout = await storage.getUserCosmeticLoadout(userId);
    res.json(loadout || { userId, equippedBorder: null, equippedGlow: null, equippedBadge: null, equippedAnimation: null });
  } catch (error) {
    console.error("Get cosmetic loadout error:", error);
    res.status(500).json({ error: "Failed to get cosmetic loadout" });
  }
});

router.post("/cosmetics/equip", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { cosmeticId, cosmeticType } = req.body;
    
    if (!cosmeticId || !cosmeticType) {
      return res.status(400).json({ error: "cosmeticId and cosmeticType are required" });
    }
    
    const validTypes = ['border', 'glow', 'badge', 'animation'];
    if (!validTypes.includes(cosmeticType)) {
      return res.status(400).json({ error: "Invalid cosmetic type" });
    }
    
    const ownership = await db
      .select()
      .from(cosmeticOwnership)
      .where(and(
        eq(cosmeticOwnership.userId, userId),
        eq(cosmeticOwnership.cosmeticId, cosmeticId)
      ))
      .limit(1);
    
    if (ownership.length === 0) {
      return res.status(403).json({ error: "You don't own this cosmetic item" });
    }
    
    const currentLoadout = await storage.getUserCosmeticLoadout(userId) || { userId };
    
    const updatedLoadout: any = { ...currentLoadout };
    if (cosmeticType === 'border') updatedLoadout.equippedBorder = cosmeticId;
    else if (cosmeticType === 'glow') updatedLoadout.equippedGlow = cosmeticId;
    else if (cosmeticType === 'badge') updatedLoadout.equippedBadge = cosmeticId;
    else if (cosmeticType === 'animation') updatedLoadout.equippedAnimation = cosmeticId;
    
    const result = await storage.upsertUserCosmeticLoadout(updatedLoadout);
    res.json(result);
  } catch (error) {
    console.error("Equip cosmetic error:", error);
    res.status(500).json({ error: "Failed to equip cosmetic" });
  }
});

router.post("/cosmetics/unequip", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { cosmeticType } = req.body;
    
    if (!cosmeticType) {
      return res.status(400).json({ error: "cosmeticType is required" });
    }
    
    const validTypes = ['border', 'glow', 'badge', 'animation'];
    if (!validTypes.includes(cosmeticType)) {
      return res.status(400).json({ error: "Invalid cosmetic type" });
    }
    
    const currentLoadout = await storage.getUserCosmeticLoadout(userId);
    if (!currentLoadout) {
      return res.json({ userId, equippedBorder: null, equippedGlow: null, equippedBadge: null, equippedAnimation: null });
    }
    
    const updatedLoadout: any = { ...currentLoadout };
    if (cosmeticType === 'border') updatedLoadout.equippedBorder = null;
    else if (cosmeticType === 'glow') updatedLoadout.equippedGlow = null;
    else if (cosmeticType === 'badge') updatedLoadout.equippedBadge = null;
    else if (cosmeticType === 'animation') updatedLoadout.equippedAnimation = null;
    
    const result = await storage.upsertUserCosmeticLoadout(updatedLoadout);
    res.json(result);
  } catch (error) {
    console.error("Unequip cosmetic error:", error);
    res.status(500).json({ error: "Failed to unequip cosmetic" });
  }
});

export function registerGamificationRoutes(app: any) {
  app.use('/api', router);
  console.log('[Routes] Gamification routes registered at /api');
}
