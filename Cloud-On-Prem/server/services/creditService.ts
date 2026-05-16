// @ts-nocheck
import { db } from "../db";
import crypto from 'crypto';
import {
  userCreditAllocations,
  creditTransactions,
  organizations,
  subscriptionPlans,
  gammaCreditLedger,
  gammaCreditSnapshots,
  userCreditAdjustments,
  users,
  lessons,
  type UserCreditAllocation,
  type CreditTransaction,
  type GammaCreditLedger,
  type GammaCreditSnapshot,
  type UserCreditAdjustment,
  type Organization,
} from "@shared/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { 
  UnifiedCreditService, 
  InsufficientCreditsError as UnifiedInsufficientCreditsError,
  DuplicateTransactionError 
} from './unifiedCreditService';
import { OrganizationCreditService, InsufficientOrgCreditsError, DuplicateOrgTransactionError } from './organizationCreditService';
import { HybridCreditService, InsufficientHybridCreditsError, type HybridDeductResult } from './hybridCreditService';

const CREDIT_RESET_DAYS = 30;

export interface CreditDeductionResult {
  success: boolean;
  newBalance: number;
  transactionId: string;
  message?: string;
  creditSource?: 'organization' | 'personal';
}

export interface CreditAllocationResult {
  allocation: UserCreditAllocation;
  needsReset: boolean;
  resetPerformed: boolean;
  pendingEmailVerification?: boolean;
}

export interface DeductCreditsParams {
  userId: string;
  organizationId: string;
  amount: number;
  assetType: 'lesson' | 'quiz';
  quizId?: string;
  quizTier?: '10' | '15' | '20';
  description?: string;
  lessonId?: string;
  lessonTitle?: string;
  courseId?: string;
  courseTitle?: string;
  activityName?: string;
}

export interface RefundCreditsParams {
  userId: string;
  organizationId: string;
  amount: number;
  originalTransactionId: string;
  reason: string;
}

export interface TransactionalDeductionResult {
  success: boolean;
  newBalance: number;
  transactionId: string;
  tx: any;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
}

export interface RefundResult {
  success: boolean;
  newBalance: number;
  refundTransactionId: string;
  message?: string;
}

export class InsufficientCreditsError extends Error {
  public readonly currentBalance: number;
  public readonly requiredAmount: number;

  constructor(currentBalance: number, requiredAmount: number) {
    super(`Insufficient credits. Current balance: ${currentBalance}, required: ${requiredAmount}`);
    this.name = 'InsufficientCreditsError';
    this.currentBalance = currentBalance;
    this.requiredAmount = requiredAmount;
  }
}

export class CreditService {
  /**
   * Create a synthetic allocation object for backward compatibility
   * Used when UnifiedCreditService is the source of truth and no legacy allocation exists
   */
  private static createSyntheticAllocation(
    userId: string,
    organizationId: string,
    balance: number,
    isTrialAllocation: boolean = false
  ): UserCreditAllocation {
    return {
      id: `synthetic_${userId}_${organizationId}`,
      userId,
      organizationId,
      currentBalance: balance,
      monthlyAllocation: balance,
      lastResetDate: new Date(),
      isTrialAllocation,
      status: 'active' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Get or create user credit allocation
   * Initializes credits based on organization's subscription plan
   * For trial orgs: Only creates allocation for trialGammaUserId, one-time 150 credits
   * Accepts optional transaction for atomic operations
   * 
   * NOTE: This method now uses UnifiedCreditService as the ONLY write path.
   * Legacy userCreditAllocations and creditTransactions tables are no longer written to.
   * Returns synthetic allocation objects for backward compatibility with callers.
   */
  static async getUserCreditAllocation(
    userId: string,
    organizationId: string,
    tx?: any
  ): Promise<CreditAllocationResult> {
    const dbConn = tx || db;

    const existingAllocation = await dbConn
      .select()
      .from(userCreditAllocations)
      .where(
        and(
          eq(userCreditAllocations.userId, userId),
          eq(userCreditAllocations.organizationId, organizationId)
        )
      )
      .limit(1);

    if (existingAllocation.length > 0) {
      const allocation = existingAllocation[0];
      const needsReset = await this.needsCreditReset(allocation);
      
      if (needsReset) {
        const resetAllocation = await this.resetUserCredits(allocation, tx);
        return {
          allocation: resetAllocation,
          needsReset: true,
          resetPerformed: true,
        };
      }

      return {
        allocation,
        needsReset: false,
        resetPerformed: false,
      };
    }

    const org = await dbConn
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (org.length === 0) {
      throw new Error(`Organization ${organizationId} not found`);
    }

    const organization = org[0];
    
    // Demo orgs are treated as active/paid, not trial - they get full access without restrictions
    const isTrial = organization.subscriptionStatus === "trial" && !organization.isDemo;
    
    if (organization.isDemo && process.env.NODE_ENV === 'development') {
      console.log(`[CreditService] Demo org ${organizationId} - bypassing trial restrictions`);
    }

    // Check if user is SuperAdmin (they bypass all trial restrictions)
    const [userRecord] = await dbConn
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const isSuperAdmin = userRecord?.isSuperAdmin || false;

    // For trial orgs: Only allow allocation for the designated trial Gamma user (unless SuperAdmin)
    if (isTrial && !isSuperAdmin) {
      // Check if this user is authorized to receive trial credits
      const isDesignatedUser = organization.trialGammaUserId === userId;

      // If user is NOT the designated trial user, give them zero credits
      // No legacy write needed - return synthetic allocation with 0 balance
      if (!isDesignatedUser) {
        const syntheticAllocation = this.createSyntheticAllocation(
          userId,
          organizationId,
          0,
          true // isTrialAllocation
        );

        console.log(
          `[CreditService] Created zero-credit synthetic allocation for user ${userId} in trial org ${organizationId} (not authorized for lesson generation API)`
        );

        return {
          allocation: syntheticAllocation,
          needsReset: false,
          resetPerformed: false,
        };
      }

      // If trial credits already awarded, prevent duplicate allocation
      if (organization.trialCreditsAwarded) {
        throw new Error("Trial credits have already been awarded for this organization");
      }

      // IMPORTANT: Check if user has verified their email before awarding trial credits
      const isEmailVerified = userRecord?.emailVerified === true;
      if (!isEmailVerified) {
        // Return synthetic allocation with 0 credits until email is verified
        // No legacy write needed - just signal that email verification is required
        const syntheticPendingAllocation = this.createSyntheticAllocation(
          userId,
          organizationId,
          0,
          true // isTrialAllocation
        );
        // Override monthlyAllocation to show potential credits after verification
        syntheticPendingAllocation.monthlyAllocation = 150;

        console.log(
          `[CreditService] Created pending synthetic allocation for user ${userId} in org ${organizationId} - awaiting email verification`
        );

        return {
          allocation: syntheticPendingAllocation,
          needsReset: false,
          resetPerformed: false,
          pendingEmailVerification: true, // Signal to frontend that email verification is required
        };
      }

      // Award one-time trial credits to the designated user (email verified)
      // UnifiedCreditService is now the ONLY write path - no legacy table writes

      // Mark trial credits as awarded in organizations table
      await dbConn
        .update(organizations)
        .set({ trialCreditsAwarded: true })
        .where(eq(organizations.id, organizationId));

      // Add credits via UnifiedCreditService (the ONLY write path)
      try {
        await UnifiedCreditService.addCredits({
          userId,
          amount: 150,
          type: 'trial_grant',
          correlationId: `trial_grant_${userId}_${organizationId}`,
          description: 'One-time trial credit allocation: 150 credits',
          organizationId,
          metadata: { isTrialGrant: true, organizationId },
        });
        console.log(
          `[CreditService] Added trial credits via UnifiedCreditService for user ${userId}`
        );
      } catch (syncError) {
        if (syncError instanceof DuplicateTransactionError) {
          console.log(
            `[CreditService] Trial credits already exist for user ${userId} (idempotent)`
          );
        } else {
          console.error(
            `[CreditService] Failed to add trial credits for user ${userId}:`,
            syncError
          );
          throw syncError;
        }
      }

      // Return synthetic allocation for backward compatibility
      const syntheticTrialAllocation = this.createSyntheticAllocation(
        userId,
        organizationId,
        150,
        true // isTrialAllocation
      );

      console.log(
        `[CreditService] Created one-time trial allocation for user ${userId} in org ${organizationId}: 150 credits`
      );

      return {
        allocation: syntheticTrialAllocation,
        needsReset: false,
        resetPerformed: false,
      };
    }

    // SuperAdmins in trial orgs get unlimited credits for testing/management
    // UnifiedCreditService is now the ONLY write path - no legacy table writes
    if (isTrial && isSuperAdmin) {
      // Add credits via UnifiedCreditService (the ONLY write path)
      try {
        await UnifiedCreditService.addCredits({
          userId,
          amount: 999999,
          type: 'adjustment',
          correlationId: `superadmin_grant_${userId}_${organizationId}`,
          description: 'SuperAdmin unlimited credits allocation',
          organizationId,
          metadata: { isSuperAdmin: true, organizationId },
        });
        console.log(
          `[CreditService] Added SuperAdmin credits via UnifiedCreditService for user ${userId}`
        );
      } catch (syncError) {
        if (syncError instanceof DuplicateTransactionError) {
          console.log(
            `[CreditService] SuperAdmin credits already exist for user ${userId} (idempotent)`
          );
        } else {
          console.error(
            `[CreditService] Failed to add SuperAdmin credits for user ${userId}:`,
            syncError
          );
          throw syncError;
        }
      }

      // Return synthetic allocation for backward compatibility
      const syntheticSuperAdminAllocation = this.createSyntheticAllocation(
        userId,
        organizationId,
        999999,
        false // Not a trial allocation, it's a SuperAdmin allocation
      );

      console.log(
        `[CreditService] Created SuperAdmin allocation for user ${userId} in trial org ${organizationId}: unlimited credits`
      );

      return {
        allocation: syntheticSuperAdminAllocation,
        needsReset: false,
        resetPerformed: false,
      };
    }

    // For paid orgs: Normal allocation logic
    // UnifiedCreditService is now the ONLY write path - no legacy table writes
    const monthlyAllocation = await this.getMonthlyAllocationForOrg(organization);

    // Add credits via UnifiedCreditService (the ONLY write path)
    try {
      await UnifiedCreditService.addCredits({
        userId,
        amount: monthlyAllocation,
        type: 'subscription_topup',
        correlationId: `initial_allocation_${userId}_${organizationId}`,
        description: `Initial credit allocation: ${monthlyAllocation} credits`,
        organizationId,
        metadata: { organizationId, isInitial: true },
      });
      console.log(
        `[CreditService] Added initial allocation via UnifiedCreditService for user ${userId}: ${monthlyAllocation} credits`
      );
    } catch (syncError) {
      if (syncError instanceof DuplicateTransactionError) {
        console.log(
          `[CreditService] Initial allocation already exists for user ${userId} (idempotent)`
        );
      } else {
        console.error(
          `[CreditService] Failed to add initial allocation for user ${userId}:`,
          syncError
        );
        throw syncError;
      }
    }

    // Return synthetic allocation for backward compatibility
    const syntheticPaidAllocation = this.createSyntheticAllocation(
      userId,
      organizationId,
      monthlyAllocation,
      false // Not a trial allocation
    );

    console.log(
      `[CreditService] Created new allocation for user ${userId} in org ${organizationId}: ${monthlyAllocation} credits`
    );

    return {
      allocation: syntheticPaidAllocation,
      needsReset: false,
      resetPerformed: false,
    };
  }

  /**
   * Check if user's credits need to be reset based on 30-day cycle
   * Trial allocations (isTrialAllocation = true) never reset
   */
  private static async needsCreditReset(
    allocation: UserCreditAllocation
  ): Promise<boolean> {
    // Trial allocations never reset - they are one-time only
    if (allocation.isTrialAllocation) {
      return false;
    }

    if (!allocation.lastResetDate) {
      return true;
    }

    const daysSinceReset =
      (Date.now() - new Date(allocation.lastResetDate).getTime()) /
      (1000 * 60 * 60 * 24);
    return daysSinceReset >= CREDIT_RESET_DAYS;
  }

  /**
   * Reset user credits to monthly allocation
   * Re-queries subscription plan to pick up tier changes
   * Skips trial allocations (they never reset)
   * Accepts optional transaction for atomic operations
   * 
   * NOTE: This method now uses UnifiedCreditService as the ONLY write path.
   * Legacy userCreditAllocations and creditTransactions tables are no longer written to.
   * Returns synthetic allocation objects for backward compatibility with callers.
   */
  private static async resetUserCredits(
    allocation: UserCreditAllocation,
    tx?: any
  ): Promise<UserCreditAllocation> {
    // Trial allocations never reset
    if (allocation.isTrialAllocation) {
      console.log(
        `[CreditService] Skipping reset for trial allocation (user ${allocation.userId})`
      );
      return allocation;
    }

    // Get org info for subscription tier lookup (using tx if available, else db)
    const dbConn = tx || db;
    const [org] = await dbConn
      .select()
      .from(organizations)
      .where(eq(organizations.id, allocation.organizationId))
      .limit(1);

    if (!org) {
      throw new Error(
        `Organization ${allocation.organizationId} not found during credit reset`
      );
    }

    const freshMonthlyAllocation = await this.getMonthlyAllocationForOrg(org);

    // Get current balance from UnifiedCreditService (source of truth)
    const oldBalance = await UnifiedCreditService.getBalance(allocation.userId);

    // Generate a deterministic correlationId based on allocation ID and reset period (monthly)
    // Format: monthly_reset_{allocId}_{year}_{month} - ensures idempotency for the same reset period
    const resetDate = new Date();
    const resetPeriodKey = `${resetDate.getFullYear()}_${resetDate.getMonth() + 1}`;
    const correlationId = `monthly_reset_${allocation.id}_${resetPeriodKey}`;
    
    const netCreditAddition = freshMonthlyAllocation - oldBalance;
    
    if (netCreditAddition > 0) {
      // Credits increased - add the difference
      try {
        await UnifiedCreditService.addCredits({
          userId: allocation.userId,
          amount: netCreditAddition,
          type: 'subscription_topup',
          correlationId,
          description: `Monthly credit reset: ${freshMonthlyAllocation} credits (net +${netCreditAddition})`,
          organizationId: allocation.organizationId,
          metadata: { 
            organizationId: allocation.organizationId, 
            isMonthlyReset: true,
            oldBalance,
            freshMonthlyAllocation,
            resetPeriodKey,
          },
        });
        console.log(
          `[CreditService] Monthly reset for user ${allocation.userId}: +${netCreditAddition} credits via UnifiedCreditService`
        );
      } catch (syncError) {
        if (syncError instanceof DuplicateTransactionError) {
          console.log(
            `[CreditService] Monthly reset already processed for user ${allocation.userId} (idempotent)`
          );
        } else {
          console.error(
            `[CreditService] Failed to process monthly reset for user ${allocation.userId}:`,
            syncError
          );
          throw syncError;
        }
      }
    } else if (netCreditAddition < 0) {
      // Credits decreased (e.g., plan downgrade) - deduct the difference
      try {
        await UnifiedCreditService.deductCredits({
          userId: allocation.userId,
          amount: Math.abs(netCreditAddition),
          type: 'adjustment',
          correlationId,
          description: `Monthly credit reset adjustment: plan change (net ${netCreditAddition})`,
          organizationId: allocation.organizationId,
          metadata: { 
            organizationId: allocation.organizationId, 
            isMonthlyReset: true,
            isPlanDowngrade: true,
            oldBalance,
            freshMonthlyAllocation,
            resetPeriodKey,
          },
        });
        console.log(
          `[CreditService] Monthly reset for user ${allocation.userId}: ${netCreditAddition} credits (plan adjustment) via UnifiedCreditService`
        );
      } catch (syncError) {
        if (syncError instanceof DuplicateTransactionError) {
          console.log(
            `[CreditService] Monthly reset already processed for user ${allocation.userId} (idempotent)`
          );
        } else if (syncError instanceof UnifiedInsufficientCreditsError) {
          // If unified balance is already lower, just log and continue
          console.warn(
            `[CreditService] Could not deduct credits during reset - unified balance already lower than expected for user ${allocation.userId}`
          );
        } else {
          console.error(
            `[CreditService] Failed to process monthly reset for user ${allocation.userId}:`,
            syncError
          );
          throw syncError;
        }
      }
    } else {
      console.log(
        `[CreditService] No net credit change for monthly reset (user ${allocation.userId}): balance unchanged at ${freshMonthlyAllocation}`
      );
    }

    console.log(
      `[CreditService] Reset credits for user ${allocation.userId}: ${freshMonthlyAllocation} credits (refreshed from org tier)`
    );

    // Return synthetic allocation for backward compatibility
    return this.createSyntheticAllocation(
      allocation.userId,
      allocation.organizationId,
      freshMonthlyAllocation,
      false // Not a trial allocation
    );
  }

  /**
   * Get monthly credit allocation for an organization based on subscription tier
   */
  private static async getMonthlyAllocationForOrg(
    org: Organization
  ): Promise<number> {
    const tier = org.subscriptionStatus || "trial";

    const plan = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.tier, tier))
      .limit(1);

    if (plan.length > 0) {
      return plan[0].monthlyCredits;
    }

    console.warn(
      `[CreditService] No subscription plan found for tier ${tier}, using default 100 credits`
    );
    return 100;
  }

  /**
   * Deduct credits for lesson generation
   * NOW USES UnifiedCreditService - writes to users.lpCreditBalance and lpCreditLedger
   * Returns success false if insufficient credits
   * Note: txClient parameter is deprecated and ignored (UnifiedCreditService manages its own transaction)
   * @param operationId - Required for idempotency if lessonId is not provided. Use a stable, unique ID from caller.
   */
  static async deductCredits(
    userId: string,
    organizationId: string,
    amount: number,
    lessonId?: string,
    description?: string,
    txClient?: any,
    operationId?: string
  ): Promise<CreditDeductionResult> {
    if (amount <= 0) {
      throw new Error("Credit deduction amount must be positive");
    }

    // Log deprecation warning if txClient is passed
    if (txClient) {
      console.warn('[CreditService] deductCredits: txClient parameter is deprecated and ignored. UnifiedCreditService manages transactions internally.');
    }

    // Generate deterministic correlationId for idempotency
    // IMPORTANT: Uses lessonId or operationId to ensure retries don't create duplicates
    let correlationId: string;
    if (lessonId) {
      correlationId = `lesson_deduct_${lessonId}`;
    } else if (operationId) {
      correlationId = `deduct_${operationId}`;
    } else {
      // Deprecation warning: callers should provide operationId for idempotency
      console.warn('[CreditService] deductCredits called without lessonId or operationId. This may cause duplicate charges on retry. Please provide an operationId.');
      correlationId = `deduct_${userId}_${crypto.randomUUID()}`;
    }

    try {
      const result = await UnifiedCreditService.deductCredits({
        userId,
        amount,
        type: 'deduction',
        correlationId,
        description: description || `Deducted ${amount} credits for lesson generation`,
        organizationId,
        metadata: {
          lessonId,
          assetType: 'lesson',
        },
      });

      console.log(
        `[CreditService] Deducted ${amount} credits from user ${userId} via UnifiedCreditService. New balance: ${result.newBalance}`
      );

      return {
        success: true,
        newBalance: result.newBalance,
        transactionId: result.transactionId,
      };
    } catch (error) {
      if (error instanceof UnifiedInsufficientCreditsError) {
        return {
          success: false,
          newBalance: error.currentBalance,
          transactionId: "",
          message: `Insufficient credits. You have ${error.currentBalance} credits but need ${amount}.`,
        };
      }
      if (error instanceof DuplicateTransactionError) {
        console.warn(`[CreditService] Duplicate deduction detected: ${correlationId}`);
        const currentBalance = await UnifiedCreditService.getBalance(userId);
        return {
          success: true,
          newBalance: currentBalance,
          transactionId: correlationId,
          message: 'Deduction already processed (idempotent)',
        };
      }
      throw error;
    }
  }

  /**
   * Charge actual Gamma API credits after successful generation
   * NOW USES HybridCreditService - user wallet first, then org wallet fallback
   * This is called ONLY when Gamma API completes and returns actual usage
   * NO estimation involved - uses exact credits from Gamma API response
   * 
   * PRIORITY ORDER (user-first, org-fallback):
   * 1. If user has enough credits -> deduct from user wallet only
   * 2. If user has partial credits AND org wallet enabled -> split deduction
   * 3. If user has 0 credits AND org wallet enabled -> deduct from org wallet only
   */
  static async chargeForGammaUsage(
    userId: string,
    organizationId: string,
    actualCredits: number,
    lessonId: string,
    gammaRequestId: string,
    gammaMetadata?: any,
    isRegeneration: boolean = false,
    isFromDocument: boolean = false,
    lessonTitle?: string,
    courseId?: string,
    courseTitle?: string
  ): Promise<CreditDeductionResult> {
    if (actualCredits <= 0) {
      throw new Error("Gamma credit amount must be positive");
    }

    // Build description based on generation type
    let description: string;
    let activityName: string;
    if (isRegeneration && isFromDocument) {
      description = `Lesson regeneration from document (${actualCredits} credits used)`;
      activityName = 'Lesson regeneration from document';
    } else if (isRegeneration) {
      description = `Lesson regeneration (${actualCredits} credits used)`;
      activityName = 'Lesson regeneration';
    } else if (isFromDocument) {
      description = `Lesson generation from document (${actualCredits} credits used)`;
      activityName = 'Lesson generation from document';
    } else {
      description = `Lesson generation (${actualCredits} credits used)`;
      activityName = 'Lesson generation';
    }

    // Generate correlationId using gammaRequestId for idempotency
    const correlationId = `gamma_${lessonId}_${gammaRequestId}`;

    // Use HybridCreditService for user-first, org-fallback credit deduction
    try {
      const hybridResult = await HybridCreditService.deductWithFallback({
        userId,
        organizationId,
        amount: actualCredits,
        type: 'deduction',
        correlationId,
        description,
        activityType: 'lesson_generation',
        metadata: {
          lessonId,
          lessonTitle,
          courseId,
          courseTitle,
          gammaRequestId,
          assetType: 'lesson',
          isRegeneration,
          isFromDocument,
          activityName,
          ...gammaMetadata,
        },
      });

      // Map HybridDeductResult creditSource to CreditDeductionResult format
      // 'user' -> 'personal', 'organization' -> 'organization', 'split' -> 'personal' (user paid first)
      const creditSource: 'organization' | 'personal' = 
        hybridResult.creditSource === 'organization' ? 'organization' : 'personal';

      // For split deductions, use user's new balance (user is primary); for org-only, use org balance
      const effectiveNewBalance = hybridResult.creditSource === 'organization' 
        ? hybridResult.orgNewBalance 
        : hybridResult.userNewBalance;

      // For split deductions, use the base correlationId for consistency with reconciliation
      // HybridCreditService uses suffixed IDs internally, but we report base ID to callers
      const effectiveTransactionId = correlationId;

      console.log(
        `[CreditService] ✅ Charged ${actualCredits} credits via HybridCreditService for user ${userId}. ` +
        `Source: ${hybridResult.creditSource}, User deducted: ${hybridResult.userAmountDeducted}, ` +
        `Org deducted: ${hybridResult.orgAmountDeducted}, CorrelationId: ${correlationId}`
      );

      // Log split deduction details for audit trail
      if (hybridResult.creditSource === 'split') {
        console.log(
          `[CreditService] 📊 Split deduction details: User ${userId} paid ${hybridResult.userAmountDeducted} ` +
          `(new balance: ${hybridResult.userNewBalance}), Org ${organizationId} paid ${hybridResult.orgAmountDeducted} ` +
          `(new balance: ${hybridResult.orgNewBalance})`
        );
      }

      return {
        success: true,
        newBalance: effectiveNewBalance,
        transactionId: effectiveTransactionId,
        creditSource,
      };
    } catch (error) {
      // Handle insufficient credits (neither user nor org have enough)
      if (error instanceof InsufficientHybridCreditsError) {
        console.warn(
          `[CreditService] ⚠️ INSUFFICIENT CREDITS for Gamma charge: User ${userId} has ${error.userBalance} credits, ` +
          `org ${organizationId} has ${error.orgBalance} credits, needs ${actualCredits}.`
        );
        return {
          success: false,
          newBalance: error.userBalance,
          transactionId: "",
          message: `Insufficient credits. You have ${error.userBalance} personal credits` +
            (error.orgWalletEnabled ? ` and ${error.orgBalance} org credits` : '') +
            ` but need ${actualCredits}.`,
          creditSource: 'personal',
        };
      }

      // Handle duplicate transactions (idempotency)
      // Note: For split deductions, HybridCreditService uses suffixed correlationIds internally,
      // but we still return the base correlationId for consistency with job reconciliation.
      // The primary idempotency for Gamma is the creditsCharged flag in job metadata,
      // which is set via atomic compare-and-set BEFORE calling this method.
      if (error instanceof DuplicateTransactionError) {
        console.warn(`[CreditService] Duplicate Gamma charge detected (user ledger): ${correlationId}`);
        // Fetch both balances for complete picture in case this was from a partial split attempt
        const currentUserBalance = await UnifiedCreditService.getBalance(userId);
        let currentOrgBalance = 0;
        try {
          currentOrgBalance = await OrganizationCreditService.getBalance(organizationId);
        } catch (e) {
          // Ignore org balance fetch error
        }
        console.log(
          `[CreditService] Duplicate charge state: user balance=${currentUserBalance}, org balance=${currentOrgBalance}`
        );
        return {
          success: true,
          newBalance: currentUserBalance,
          transactionId: correlationId,
          message: 'Gamma charge already processed (idempotent)',
          creditSource: 'personal',
        };
      }

      if (error instanceof DuplicateOrgTransactionError) {
        console.warn(`[CreditService] Duplicate Gamma charge detected (org ledger): ${correlationId}`);
        const currentOrgBalance = await OrganizationCreditService.getBalance(organizationId);
        return {
          success: true,
          newBalance: currentOrgBalance,
          transactionId: correlationId,
          message: 'Gamma charge already processed (idempotent)',
          creditSource: 'organization',
        };
      }

      throw error;
    }
  }

  /**
   * Add bonus credits (SuperAdmin only)
   * NOW USES UnifiedCreditService - writes to users.lpCreditBalance and lpCreditLedger
   * @param adjustmentId - Required for idempotency. Use a stable, unique ID (e.g., from a form submission or request ID).
   */
  static async addBonusCredits(
    userId: string,
    organizationId: string,
    amount: number,
    adminUserId: string,
    description?: string,
    adjustmentId?: string
  ): Promise<CreditDeductionResult> {
    if (amount <= 0) {
      throw new Error("Bonus credit amount must be positive");
    }

    // Generate deterministic correlationId for idempotency
    // IMPORTANT: Uses adjustmentId to ensure retries don't create duplicates
    let correlationId: string;
    if (adjustmentId) {
      correlationId = `bonus_${adjustmentId}`;
    } else {
      // Deprecation warning: callers should provide adjustmentId for idempotency
      console.warn('[CreditService] addBonusCredits called without adjustmentId. This may cause duplicate credits on retry. Please provide an adjustmentId.');
      correlationId = `bonus_${userId}_${adminUserId}_${crypto.randomUUID()}`;
    }
    const transactionDescription = description || `Admin added ${amount} bonus credits`;

    try {
      const result = await UnifiedCreditService.addBonusCredits({
        userId,
        amount,
        correlationId,
        reason: transactionDescription,
        adminUserId,
        organizationId,
        metadata: {
          addedBy: adminUserId,
        },
      });

      console.log(
        `[CreditService] Admin ${adminUserId} added ${amount} bonus credits to user ${userId} via UnifiedCreditService. New balance: ${result.newBalance}`
      );

      return {
        success: true,
        newBalance: result.newBalance,
        transactionId: result.transactionId,
      };
    } catch (error) {
      if (error instanceof DuplicateTransactionError) {
        console.warn(`[CreditService] Duplicate bonus credit detected: ${correlationId}`);
        const currentBalance = await UnifiedCreditService.getBalance(userId);
        return {
          success: true,
          newBalance: currentBalance,
          transactionId: correlationId,
          message: 'Bonus credits already added (idempotent)',
        };
      }
      throw error;
    }
  }

  /**
   * Refund credits when lesson generation fails
   * NOW USES UnifiedCreditService - writes to users.lpCreditBalance and lpCreditLedger
   * Reverses a previous deduction by adding credits back to user's account
   * @param originalTransactionId - Required for idempotency if lessonId is not provided. Use the original deduction transaction ID.
   */
  static async refundCredits(
    userId: string,
    organizationId: string,
    amount: number,
    lessonId?: string,
    description?: string,
    originalTransactionId?: string
  ): Promise<CreditDeductionResult> {
    if (amount <= 0) {
      throw new Error("Refund amount must be positive");
    }

    // Generate deterministic correlationId for idempotency
    // IMPORTANT: Uses originalTransactionId or lessonId to ensure retries don't create duplicate refunds
    let correlationId: string;
    if (originalTransactionId) {
      correlationId = `refund_${originalTransactionId}`;
    } else if (lessonId) {
      correlationId = `refund_lesson_${lessonId}`;
    } else {
      // Deprecation warning: callers should provide originalTransactionId or lessonId for idempotency
      console.warn('[CreditService] refundCredits called without originalTransactionId or lessonId. This may cause duplicate refunds on retry. Please provide an originalTransactionId.');
      correlationId = `refund_${userId}_${crypto.randomUUID()}`;
    }

    const reason = description || `Refunded ${amount} credits due to generation failure`;

    try {
      const result = await UnifiedCreditService.refundCredits({
        userId,
        amount,
        correlationId,
        reason,
        organizationId,
        metadata: {
          lessonId,
          originalTransactionId,
        },
      });

      console.log(
        `[CreditService] Refunded ${amount} credits to user ${userId} via UnifiedCreditService${originalTransactionId ? ` (original tx: ${originalTransactionId})` : ""}. New balance: ${result.newBalance}`
      );

      return {
        success: true,
        newBalance: result.newBalance,
        transactionId: result.transactionId,
      };
    } catch (error) {
      if (error instanceof DuplicateTransactionError) {
        console.warn(`[CreditService] Duplicate refund detected: ${correlationId}`);
        const currentBalance = await UnifiedCreditService.getBalance(userId);
        return {
          success: true,
          newBalance: currentBalance,
          transactionId: correlationId,
          message: 'Refund already processed (idempotent)',
        };
      }
      throw error;
    }
  }

  /**
   * Record a zero-amount audit entry for lesson attachment
   * This creates an audit trail for attachments without deducting credits
   * since the lesson was already generated and paid for
   * 
   * NOTE: Now uses UnifiedCreditService.recordAuditEntry() as the ONLY write path.
   * Legacy creditTransactions table is no longer written to.
   */
  static async recordLessonAttachment(
    userId: string,
    organizationId: string,
    lessonId: string,
    courseId: string,
    description?: string
  ): Promise<{ success: true; transactionId: string }> {
    const correlationId = `lesson_attachment_${lessonId}_${courseId}`;

    try {
      const result = await UnifiedCreditService.recordAuditEntry({
        userId,
        type: 'adjustment', // Using 'adjustment' type for audit entries since there's no specific lesson_attachment type
        correlationId,
        description: description || `Attached existing lesson to course`,
        organizationId,
        metadata: {
          lessonId,
          courseId,
          auditType: 'lesson_attachment',
        },
      });

      console.log(
        `[CreditService] Recorded lesson attachment audit: lesson ${lessonId} to course ${courseId} by user ${userId}`
      );

      return {
        success: true,
        transactionId: result.transactionId,
      };
    } catch (error) {
      if (error instanceof DuplicateTransactionError) {
        console.warn(`[CreditService] Duplicate lesson attachment audit detected: ${correlationId}`);
        return {
          success: true,
          transactionId: correlationId,
        };
      }
      throw error;
    }
  }

  /**
   * Get current credit balance
   * Now uses unified balance (users.lpCreditBalance) as primary source
   * Legacy fields (monthlyAllocation, lastResetDate, nextResetDate) are maintained for backward compatibility
   * IMPORTANT: Does NOT create allocations - only reads existing legacy data if available
   */
  static async getCreditBalance(
    userId: string,
    organizationId: string
  ): Promise<{
    balance: number;
    monthlyAllocation: number;
    lastResetDate: Date | null;
    nextResetDate: Date | null;
  }> {
    // Get unified balance as primary source of truth
    const unifiedBalance = await UnifiedCreditService.getBalance(userId);
    
    // Query existing legacy allocation (DO NOT create new allocations)
    // This provides backward compatibility for components expecting legacy fields
    const existingAllocation = await db
      .select()
      .from(userCreditAllocations)
      .where(
        and(
          eq(userCreditAllocations.userId, userId),
          eq(userCreditAllocations.organizationId, organizationId)
        )
      )
      .limit(1);

    if (existingAllocation.length > 0) {
      const allocation = existingAllocation[0];
      const nextResetDate = allocation.lastResetDate
        ? new Date(
            new Date(allocation.lastResetDate).getTime() +
              CREDIT_RESET_DAYS * 24 * 60 * 60 * 1000
          )
        : null;

      return {
        balance: unifiedBalance, // Use unified balance as source of truth
        monthlyAllocation: allocation.monthlyAllocation,
        lastResetDate: allocation.lastResetDate,
        nextResetDate,
      };
    }

    // No legacy allocation exists - return unified balance with null legacy fields
    console.log(`[CreditService] No legacy allocation for user ${userId}, using unified balance only`);
    return {
      balance: unifiedBalance,
      monthlyAllocation: 0,
      lastResetDate: null,
      nextResetDate: null,
    };
  }

  /**
   * Get credit transaction history
   */
  static async getCreditHistory(
    userId: string,
    organizationId: string,
    limit: number = 50
  ): Promise<CreditTransaction[]> {
    const transactions = await db
      .select()
      .from(creditTransactions)
      .where(
        and(
          eq(creditTransactions.userId, userId),
          eq(creditTransactions.organizationId, organizationId)
        )
      )
      .orderBy(desc(creditTransactions.createdAt))
      .limit(limit);

    return transactions;
  }

  /**
   * Get organization-wide credit statistics
   */
  static async getOrganizationCreditStats(organizationId: string): Promise<{
    totalAllocated: number;
    totalUsed: number;
    activeUsers: number;
  }> {
    const allocations = await db
      .select()
      .from(userCreditAllocations)
      .where(eq(userCreditAllocations.organizationId, organizationId));

    const totalAllocated = allocations.reduce(
      (sum, a) => sum + a.monthlyAllocation,
      0
    );
    const currentBalance = allocations.reduce(
      (sum, a) => sum + (a.currentBalance || 0),
      0
    );
    const totalUsed = totalAllocated - currentBalance;

    return {
      totalAllocated,
      totalUsed,
      activeUsers: allocations.length,
    };
  }

  /**
   * Check if organization needs credit reset based on lastCreditResetDate
   */
  static async checkOrganizationCreditReset(
    organizationId: string
  ): Promise<boolean> {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org || !org.lastCreditResetDate) {
      return false;
    }

    const daysSinceReset =
      (Date.now() - new Date(org.lastCreditResetDate).getTime()) /
      (1000 * 60 * 60 * 24);
    return daysSinceReset >= CREDIT_RESET_DAYS;
  }

  /**
   * Reset all user credits for an organization
   * Wrapped in single transaction to prevent partial resets
   */
  static async resetOrganizationCredits(
    organizationId: string
  ): Promise<number> {
    const result = await db.transaction(async (tx) => {
      const allocations = await tx
        .select()
        .from(userCreditAllocations)
        .where(eq(userCreditAllocations.organizationId, organizationId));

      let resetCount = 0;

      for (const allocation of allocations) {
        await this.resetUserCredits(allocation, tx);
        resetCount++;
      }

      await tx
        .update(organizations)
        .set({
          lastCreditResetDate: new Date(),
        })
        .where(eq(organizations.id, organizationId));

      console.log(
        `[CreditService] Reset credits for ${resetCount} users in organization ${organizationId}`
      );

      return resetCount;
    });

    return result;
  }

  /**
   * Get current system-wide Gamma API balance from ledger
   */
  static async getSystemBalance(): Promise<number> {
    const latestEntry = await db
      .select()
      .from(gammaCreditLedger)
      .orderBy(desc(gammaCreditLedger.createdAt))
      .limit(1);

    return latestEntry.length > 0 ? latestEntry[0].runningBalance : 0;
  }

  /**
   * Get system-wide Gamma balance with detailed stats
   */
  static async getSystemBalanceDetails() {
    // Get the most recent Gamma snapshot (actual balance reported by Gamma API)
    const latestSnapshot = await db
      .select()
      .from(gammaCreditSnapshots)
      .orderBy(desc(gammaCreditSnapshots.createdAt))
      .limit(1);

    // Get all ledger entries to calculate total net deductions
    const allEntries = await db
      .select()
      .from(gammaCreditLedger);

    // Calculate net deductions (deductions minus refunds)
    // Deductions are negative, refunds are positive, so we sum them
    const totalDeducted = Math.abs(
      allEntries
        .filter(entry => entry.eventType === 'lesson_deduction' || entry.eventType === 'snapshot_adjustment')
        .reduce((sum, entry) => sum + entry.deltaCredits, 0)
    );

    return {
      currentBalance: latestSnapshot.length > 0 ? latestSnapshot[0].reportedBalance : 0,
      totalDeducted,
      lastSnapshot: latestSnapshot.length > 0 ? latestSnapshot[0].createdAt : null,
    };
  }

  /**
   * Deduct credits with ledger tracking
   * NOW USES UnifiedCreditService - simplified implementation
   * @deprecated Use deductCredits() instead - this method now just wraps UnifiedCreditService
   * @param gammaRequestId - Recommended for idempotency. Use the Gamma API request ID when available.
   */
  static async deductCreditsWithLedger(
    userId: string,
    organizationId: string,
    amount: number,
    lessonId: string,
    gammaRequestId?: string,
    gammaMetadata?: any
  ): Promise<{
    userTransaction: { id: string };
    gammaLedgerEntry: null;
    correlationId: string;
  }> {
    // Generate deterministic correlationId for idempotency
    // IMPORTANT: Uses lessonId + gammaRequestId to ensure retries don't create duplicates
    let correlationId: string;
    if (lessonId && gammaRequestId) {
      correlationId = `lesson_ledger_${lessonId}_${gammaRequestId}`;
    } else if (lessonId) {
      // LessonId alone - still deterministic but may not be unique across regenerations
      correlationId = `lesson_ledger_${lessonId}`;
      console.warn('[CreditService] deductCreditsWithLedger called without gammaRequestId. Consider providing gammaRequestId for better idempotency.');
    } else {
      // No lessonId - this shouldn't happen as lessonId is required, but handle gracefully
      console.warn('[CreditService] deductCreditsWithLedger called without lessonId. This may cause duplicate charges on retry.');
      correlationId = crypto.randomUUID();
    }

    try {
      const result = await UnifiedCreditService.deductCredits({
        userId,
        amount,
        type: 'deduction',
        correlationId,
        description: `Lesson generation (estimated): ${amount} credits`,
        organizationId,
        metadata: {
          lessonId,
          gammaRequestId,
          assetType: 'lesson',
          ...gammaMetadata,
        },
      });

      console.log(
        `[CreditService] Deducted ${amount} credits via UnifiedCreditService. Balance: ${result.newBalance}, Correlation: ${correlationId}`
      );

      return {
        userTransaction: { id: result.transactionId },
        gammaLedgerEntry: null,
        correlationId,
      };
    } catch (error) {
      if (error instanceof UnifiedInsufficientCreditsError) {
        throw new InsufficientCreditsError(error.currentBalance, amount);
      }
      if (error instanceof DuplicateTransactionError) {
        console.warn(`[CreditService] Duplicate deductCreditsWithLedger detected: ${correlationId}`);
        return {
          userTransaction: { id: correlationId },
          gammaLedgerEntry: null,
          correlationId,
        };
      }
      throw error;
    }
  }

  /**
   * Record Gamma API balance snapshot for reconciliation
   */
  static async recordGammaSnapshot(
    reportedBalance: number,
    source: string,
    gammaRequestId?: string,
    metadata?: any
  ): Promise<GammaCreditSnapshot> {
    const currentLedgerBalance = await this.getSystemBalance();
    const variance = reportedBalance - currentLedgerBalance;

    const [snapshot] = await db
      .insert(gammaCreditSnapshots)
      .values({
        reportedBalance,
        source,
        gammaRequestId,
        ledgerRunningBalanceAtCapture: currentLedgerBalance,
        varianceFromLedger: variance,
        metadata: metadata || {},
      })
      .returning();

    if (Math.abs(variance) > 10) {
      console.warn(
        `[CreditService] ⚠️ Balance variance detected! Gamma: ${reportedBalance}, Ledger: ${currentLedgerBalance}, Variance: ${variance}`
      );
    } else {
      console.log(
        `[CreditService] ✓ Balance reconciled - Gamma: ${reportedBalance}, Ledger: ${currentLedgerBalance}, Variance: ${variance}`
      );
    }

    return snapshot;
  }

  /**
   * Get user credit transactions (debits and credits) with filtering, search, and pagination
   * This queries the creditTransactions table for all user-level credit operations
   */
  static async getUserCreditTransactions(options: {
    startDate?: Date;
    endDate?: Date;
    days?: number;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    const {
      startDate,
      endDate,
      days = 30,
      search,
      limit = 50,
      offset = 0,
    } = options;

    // Determine date range
    let since: Date;
    let until: Date;

    if (startDate) {
      since = startDate;
    } else {
      since = new Date();
      since.setDate(since.getDate() - days);
    }

    if (endDate) {
      until = new Date(endDate);
      until.setHours(23, 59, 59, 999);
    } else {
      until = new Date();
      until.setHours(23, 59, 59, 999);
    }

    // Build where conditions
    const whereConditions = [
      gte(creditTransactions.createdAt, since),
      sql`${creditTransactions.createdAt} <= ${until}`
    ];

    // Add search filter
    if (search && search.trim()) {
      const searchPattern = `%${search.trim()}%`;
      whereConditions.push(
        sql`(
          LOWER(${organizations.name}) LIKE LOWER(${searchPattern}) OR
          LOWER(${users.gamerName}) LIKE LOWER(${searchPattern}) OR
          LOWER(${creditTransactions.description}) LIKE LOWER(${searchPattern})
        )`
      );
    }

    // Query credit transactions with joins
    const query = db
      .select({
        id: creditTransactions.id,
        userId: creditTransactions.userId,
        organizationId: creditTransactions.organizationId,
        amount: creditTransactions.amount,
        balanceAfter: creditTransactions.balanceAfter,
        transactionType: creditTransactions.transactionType,
        description: creditTransactions.description,
        lessonId: creditTransactions.lessonId,
        createdAt: creditTransactions.createdAt,
        organizationName: organizations.name,
        username: users.gamerName,
        lessonTitle: lessons.title,
      })
      .from(creditTransactions)
      .leftJoin(organizations, eq(creditTransactions.organizationId, organizations.id))
      .leftJoin(users, eq(creditTransactions.userId, users.id))
      .leftJoin(lessons, eq(creditTransactions.lessonId, lessons.id))
      .where(and(...whereConditions))
      .$dynamic();

    // Get total count
    const allTransactions = await query;
    const totalCount = allTransactions.length;

    // Apply ordering and pagination
    const transactions = await query
      .orderBy(desc(creditTransactions.createdAt))
      .limit(limit)
      .offset(offset);

    // Calculate totals
    const totalCredits = allTransactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
    
    const totalDebits = allTransactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    return {
      totalCredits,
      totalDebits,
      netBalance: totalCredits - totalDebits,
      transactionCount: totalCount,
      transactions: transactions.map(t => ({
        id: t.id,
        date: t.createdAt,
        amount: t.amount,
        balanceAfter: t.balanceAfter,
        type: t.transactionType,
        description: t.description || 'Credit transaction',
        organizationName: t.organizationName || 'Unknown Organization',
        username: t.username || 'Unknown User',
        lessonTitle: t.lessonTitle,
        lessonId: t.lessonId,
      })),
      pagination: {
        limit,
        offset,
        total: totalCount,
        hasMore: offset + transactions.length < totalCount,
      },
    };
  }

  /**
   * Get credit usage statistics with filtering, search, and pagination
   * This queries the Gamma ledger for system-wide API usage tracking
   */
  static async getCreditUsageStats(options: {
    startDate?: Date;
    endDate?: Date;
    days?: number;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    const {
      startDate,
      endDate,
      days = 30,
      search,
      limit = 50,
      offset = 0,
    } = options;

    // Determine date range
    let since: Date;
    let until: Date;

    if (startDate) {
      since = startDate;
    } else {
      since = new Date();
      since.setDate(since.getDate() - days);
    }

    // Set end date to end of day (23:59:59.999) to include all transactions on that day
    if (endDate) {
      until = new Date(endDate);
      until.setHours(23, 59, 59, 999);
    } else {
      until = new Date();
      until.setHours(23, 59, 59, 999);
    }

    // Build where conditions array
    const whereConditions = [
      gte(gammaCreditLedger.createdAt, since),
      sql`${gammaCreditLedger.createdAt} <= ${until}`
    ];

    // Add search filter if provided
    if (search && search.trim()) {
      const searchPattern = `%${search.trim()}%`;
      whereConditions.push(
        sql`(
          LOWER(${organizations.name}) LIKE LOWER(${searchPattern}) OR
          LOWER(${users.gamerName}) LIKE LOWER(${searchPattern}) OR
          LOWER(${lessons.title}) LIKE LOWER(${searchPattern})
        )`
      );
    }

    // Query Gamma credit ledger for actual API usage with joins to get organization and user info
    let query = db
      .select({
        id: gammaCreditLedger.id,
        eventType: gammaCreditLedger.eventType,
        deltaCredits: gammaCreditLedger.deltaCredits,
        createdAt: gammaCreditLedger.createdAt,
        lessonId: gammaCreditLedger.lessonId,
        initiatedByUserId: gammaCreditLedger.initiatedByUserId,
        lessonTitle: lessons.title,
        organizationId: lessons.organizationId,
        organizationName: organizations.name,
        username: users.gamerName,
      })
      .from(gammaCreditLedger)
      .leftJoin(lessons, eq(gammaCreditLedger.lessonId, lessons.id))
      .leftJoin(organizations, eq(lessons.organizationId, organizations.id))
      .leftJoin(users, eq(gammaCreditLedger.initiatedByUserId, users.id))
      .where(and(...whereConditions))
      .$dynamic();

    // Get total count before pagination
    const countQuery = await query;
    const totalDeductions = countQuery.filter(
      t => t.eventType === 'lesson_deduction' || t.eventType === 'snapshot_adjustment'
    );

    // Apply ordering and pagination
    const ledgerEntries = await query
      .orderBy(desc(gammaCreditLedger.createdAt))
      .limit(limit)
      .offset(offset);

    // Only count lesson deductions and adjustments (negative deltaCredits)
    const deductions = ledgerEntries.filter(
      t => t.eventType === 'lesson_deduction' || t.eventType === 'snapshot_adjustment'
    );

    const totalUsed = totalDeductions.reduce((sum, t) => sum + Math.abs(t.deltaCredits), 0);

    return {
      last30Days: totalUsed, // Frontend expects this property name
      totalUsed, // Keep for backward compatibility
      transactionCount: totalDeductions.length,
      recentTransactions: deductions.map(t => ({
        date: t.createdAt,
        amount: Math.abs(t.deltaCredits),
        description: `Gamma API usage (${t.eventType})`,
        organizationName: t.organizationName || 'Unknown Organization',
        username: t.username || 'Unknown User',
        lessonTitle: t.lessonTitle || 'Untitled Lesson',
      })),
      pagination: {
        limit,
        offset,
        total: totalDeductions.length,
        hasMore: offset + deductions.length < totalDeductions.length,
      },
    };
  }

  /**
   * Manual credit adjustment for users (SuperAdmin only)
   * 
   * NOTE: Now uses UnifiedCreditService.adminAdjustment() as the ONLY write path.
   * Legacy tables (userCreditAllocations, creditTransactions, gammaCreditLedger) are no longer written to.
   * The allocationId is still used to look up the userId/organizationId for backward compatibility.
   * 
   * @deprecated Use UnifiedCreditService.adminAdjustment() directly for new implementations.
   */
  static async adjustUserCredits(
    allocationId: string,
    amountChange: number,
    reason: string,
    requestedBy: string
  ): Promise<{
    success: boolean;
    newBalance: number;
    transactionId: string;
    userId: string;
    organizationId: string;
  }> {
    console.warn('[CreditService] adjustUserCredits: This method is deprecated. Use UnifiedCreditService.adminAdjustment() directly.');

    // Look up the legacy allocation to get userId/organizationId
    const [allocation] = await db
      .select()
      .from(userCreditAllocations)
      .where(eq(userCreditAllocations.id, allocationId))
      .limit(1);

    if (!allocation) {
      // If no legacy allocation exists, we need to find the user by other means
      // For a clean cutover, we should require the caller to provide userId directly
      throw new Error(`User credit allocation not found: ${allocationId}. For new implementations, use UnifiedCreditService.adminAdjustment() with userId directly.`);
    }

    const { userId, organizationId } = allocation;

    // Generate deterministic correlationId for idempotency
    // Use a hash of the reason to make it more unique but still deterministic for retries
    const reasonHash = reason.replace(/\s+/g, '_').substring(0, 20);
    const correlationId = `manual_adjustment_${allocationId}_${requestedBy}_${reasonHash}_${Date.now()}`;

    try {
      const result = await UnifiedCreditService.adminAdjustment({
        userId,
        amount: amountChange,
        correlationId,
        reason,
        adminUserId: requestedBy,
        organizationId,
      });

      console.log(
        `[CreditService] Manual adjustment via UnifiedCreditService: ${amountChange} credits for user ${userId} by ${requestedBy}`
      );

      return {
        success: true,
        newBalance: result.newBalance,
        transactionId: result.transactionId,
        userId,
        organizationId,
      };
    } catch (error) {
      if (error instanceof DuplicateTransactionError) {
        console.warn(`[CreditService] Duplicate manual adjustment detected: ${correlationId}`);
        const currentBalance = await UnifiedCreditService.getBalance(userId);
        return {
          success: true,
          newBalance: currentBalance,
          transactionId: correlationId,
          userId,
          organizationId,
        };
      }
      if (error instanceof UnifiedInsufficientCreditsError) {
        // For admin adjustments that would result in negative balance, log warning but still throw
        console.error(
          `[CreditService] ⚠️ Manual adjustment would result in negative balance for user ${userId}. Current: ${error.currentBalance}, Adjustment: ${amountChange}`
        );
        throw error;
      }
      throw error;
    }
  }

  /**
   * Award trial credits after email verification
   * Called when a user verifies their email to unlock their 150 trial credits
   * 
   * NOTE: Now uses UnifiedCreditService.addCredits() as the ONLY write path for credits.
   * Legacy userCreditAllocations and creditTransactions tables are no longer written to.
   * The organizations.trialCreditsAwarded flag is still updated to track trial status.
   */
  static async awardTrialCreditsAfterVerification(
    userId: string,
    organizationId: string
  ): Promise<{ success: boolean; creditsAwarded: number; message: string }> {
    try {
      // Check if this is a trial org
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);

      if (!org || org.subscriptionStatus !== 'trial') {
        return { success: false, creditsAwarded: 0, message: 'Not a trial organization' };
      }

      // Check if user is the designated trial user
      if (org.trialGammaUserId !== userId) {
        return { success: false, creditsAwarded: 0, message: 'Not authorized for trial credits' };
      }

      // Check if trial credits were already awarded
      if (org.trialCreditsAwarded) {
        return { success: false, creditsAwarded: 0, message: 'Trial credits already awarded' };
      }

      // Use deterministic correlationId for idempotency
      const correlationId = `trial_verification_${userId}_${organizationId}`;

      try {
        // Add trial credits via UnifiedCreditService (the ONLY write path)
        await UnifiedCreditService.addCredits({
          userId,
          amount: 150,
          type: 'trial_grant',
          correlationId,
          description: 'Trial credits awarded after email verification',
          organizationId,
          metadata: {
            isTrialGrant: true,
            organizationId,
            verifiedAt: new Date().toISOString(),
          },
        });

        // Mark trial credits as awarded in organizations table
        await db
          .update(organizations)
          .set({ trialCreditsAwarded: true })
          .where(eq(organizations.id, organizationId));

        console.log(
          `[CreditService] Awarded 150 trial credits to user ${userId} in org ${organizationId} after email verification via UnifiedCreditService`
        );

        return { success: true, creditsAwarded: 150, message: 'Trial credits awarded successfully' };
      } catch (creditError) {
        if (creditError instanceof DuplicateTransactionError) {
          // Trial credits already granted via UnifiedCreditService - ensure org flag is set
          await db
            .update(organizations)
            .set({ trialCreditsAwarded: true })
            .where(eq(organizations.id, organizationId));

          console.log(
            `[CreditService] Trial credits already awarded for user ${userId} in org ${organizationId} (idempotent)`
          );
          return { success: true, creditsAwarded: 150, message: 'Trial credits already awarded' };
        }
        throw creditError;
      }
    } catch (error) {
      console.error('[CreditService] Failed to award trial credits after verification:', error);
      return { success: false, creditsAwarded: 0, message: 'Failed to award trial credits' };
    }
  }

  /**
   * Deduct credits transactionally with commit/rollback control
   * @deprecated UnifiedCreditService handles atomic transactions internally.
   * This method now auto-commits and provides no-op commit/rollback functions for backward compatibility.
   * The transaction is atomic and cannot be rolled back after completion.
   * Consider using deductCredits() directly for new implementations.
   * @param params.quizId - Required for quiz asset type to ensure idempotency
   * @param params.lessonId - Required for lesson asset type to ensure idempotency
   */
  static async deductCreditsTransactional(
    params: DeductCreditsParams
  ): Promise<TransactionalDeductionResult> {
    const { userId, organizationId, amount, assetType, quizId, quizTier, description, lessonId, lessonTitle, courseId, courseTitle, activityName } = params;

    if (amount <= 0) {
      throw new Error("Credit deduction amount must be positive");
    }

    // Generate deterministic correlationId based on asset type
    // IMPORTANT: Uses quizId or lessonId to ensure retries don't create duplicates
    let correlationId: string;
    if (assetType === 'quiz' && quizId) {
      correlationId = `quiz_${quizId}`;
    } else if (assetType === 'lesson' && lessonId) {
      correlationId = `lesson_${lessonId}`;
    } else if (quizId) {
      correlationId = `quiz_${quizId}`;
    } else if (lessonId) {
      correlationId = `lesson_${lessonId}`;
    } else {
      // Deprecation warning: callers should provide quizId or lessonId for idempotency
      console.warn(`[CreditService] deductCreditsTransactional called without quizId or lessonId. This may cause duplicate charges on retry. Please provide the appropriate ID for asset type: ${assetType}`);
      correlationId = `${assetType}_${userId}_${crypto.randomUUID()}`;
    }

    // Build description
    let transactionDescription = description;
    if (!transactionDescription) {
      if (assetType === 'quiz') {
        transactionDescription = `Deducted ${amount} credits for quiz generation`;
        if (quizId) transactionDescription += ` (quizId: ${quizId})`;
        if (quizTier) transactionDescription += ` (tier: ${quizTier})`;
      } else {
        transactionDescription = `Deducted ${amount} credits for lesson generation`;
      }
    }

    try {
      const result = await UnifiedCreditService.deductCredits({
        userId,
        amount,
        type: 'deduction',
        correlationId,
        description: transactionDescription,
        organizationId,
        metadata: {
          assetType,
          quizId,
          quizTier,
          lessonId,
          lessonTitle,
          courseId,
          courseTitle,
          activityName: activityName || transactionDescription,
        },
      });

      console.log(
        `[CreditService] Transactional deduction via UnifiedCreditService: ${amount} credits from user ${userId} ` +
        `for ${assetType}${quizId ? ` (quizId: ${quizId})` : ''}${quizTier ? ` (tier: ${quizTier})` : ''}. ` +
        `New balance: ${result.newBalance}. Transaction auto-committed.`
      );

      return {
        success: true,
        newBalance: result.newBalance,
        transactionId: result.transactionId,
        tx: null,
        commit: async () => {
          console.log('[CreditService] Commit called (no-op - UnifiedCreditService auto-commits)');
        },
        rollback: async () => {
          console.warn('[CreditService] Rollback called (no-op - UnifiedCreditService transactions are atomic)');
        },
      };
    } catch (error) {
      if (error instanceof UnifiedInsufficientCreditsError) {
        throw new InsufficientCreditsError(error.currentBalance, amount);
      }
      if (error instanceof DuplicateTransactionError) {
        console.warn(`[CreditService] Duplicate transactional deduction detected: ${correlationId}`);
        const currentBalance = await UnifiedCreditService.getBalance(userId);
        return {
          success: true,
          newBalance: currentBalance,
          transactionId: correlationId,
          tx: null,
          commit: async () => {},
          rollback: async () => {},
        };
      }
      throw error;
    }
  }

  /**
   * Get user's unified credit balance from users.lpCreditBalance
   * This is the new source of truth for credit balances
   */
  static async getUnifiedBalance(userId: string): Promise<number> {
    return UnifiedCreditService.getBalance(userId);
  }

  /**
   * Deduct credits using hybrid approach: user wallet first, then organization wallet fallback.
   * 
   * This method provides backward compatibility for legacy code paths while enabling
   * the new user-first-then-org credit deduction logic.
   * 
   * Priority:
   * 1. If user has enough credits -> deduct from user wallet only
   * 2. If user has partial credits AND org wallet enabled AND user authorized -> split deduction
   * 3. If user has 0 credits AND org wallet enabled AND user authorized -> deduct from org wallet only
   * 4. Otherwise -> throws InsufficientHybridCreditsError
   * 
   * @param params - Same parameters as deductCreditsTransactional
   * @returns CreditDeductionResult with creditSource indicating where credits were taken from
   */
  static async deductCreditsHybrid(
    params: DeductCreditsParams
  ): Promise<CreditDeductionResult & { hybridResult?: HybridDeductResult }> {
    const { userId, organizationId, amount, assetType, quizId, quizTier, description, lessonId, lessonTitle, courseId, courseTitle, activityName } = params;

    if (amount <= 0) {
      throw new Error("Credit deduction amount must be positive");
    }

    // Generate deterministic correlationId based on asset type
    // IMPORTANT: Uses quizId or lessonId to ensure retries don't create duplicates
    let correlationId: string;
    if (assetType === 'quiz' && quizId) {
      correlationId = `hybrid_quiz_${quizId}`;
    } else if (assetType === 'lesson' && lessonId) {
      correlationId = `hybrid_lesson_${lessonId}`;
    } else if (quizId) {
      correlationId = `hybrid_quiz_${quizId}`;
    } else if (lessonId) {
      correlationId = `hybrid_lesson_${lessonId}`;
    } else {
      // Deprecation warning: callers should provide quizId or lessonId for idempotency
      console.warn(`[CreditService] deductCreditsHybrid called without quizId or lessonId. This may cause duplicate charges on retry. Please provide the appropriate ID for asset type: ${assetType}`);
      correlationId = `hybrid_${assetType}_${userId}_${crypto.randomUUID()}`;
    }

    // Build description
    let transactionDescription = description;
    if (!transactionDescription) {
      if (assetType === 'quiz') {
        transactionDescription = `Deducted ${amount} credits for quiz generation`;
        if (quizId) transactionDescription += ` (quizId: ${quizId})`;
        if (quizTier) transactionDescription += ` (tier: ${quizTier})`;
      } else {
        transactionDescription = `Deducted ${amount} credits for lesson generation`;
      }
    }

    try {
      const hybridResult = await HybridCreditService.deductWithFallback({
        userId,
        organizationId,
        amount,
        type: 'deduction',
        correlationId,
        description: transactionDescription,
        metadata: {
          assetType,
          quizId,
          quizTier,
          lessonId,
          lessonTitle,
          courseId,
          courseTitle,
          activityName: activityName || transactionDescription,
          hybridDeduction: true,
        },
        activityType: assetType === 'lesson' ? 'lesson_generation' : 'quiz_play',
      });

      // Map hybrid credit source to CreditDeductionResult format
      const creditSource: 'organization' | 'personal' = 
        hybridResult.creditSource === 'organization' ? 'organization' : 'personal';

      // Use the appropriate new balance based on where credits were deducted
      const newBalance = hybridResult.creditSource === 'organization' 
        ? hybridResult.orgNewBalance 
        : hybridResult.userNewBalance;

      const transactionId = hybridResult.userTransactionId || hybridResult.orgTransactionId || correlationId;

      console.log(
        `[CreditService] Hybrid deduction: ${amount} credits from ${hybridResult.creditSource} ` +
        `(user: ${hybridResult.userAmountDeducted}, org: ${hybridResult.orgAmountDeducted}) ` +
        `for ${assetType}${quizId ? ` (quizId: ${quizId})` : ''}${lessonId ? ` (lessonId: ${lessonId})` : ''}.`
      );

      return {
        success: true,
        newBalance,
        transactionId,
        creditSource,
        hybridResult,
      };
    } catch (error) {
      if (error instanceof InsufficientHybridCreditsError) {
        console.warn(
          `[CreditService] Hybrid deduction failed: ${error.message}`
        );
        return {
          success: false,
          newBalance: error.userBalance,
          transactionId: "",
          message: error.message,
          creditSource: 'personal',
        };
      }
      if (error instanceof DuplicateTransactionError || error instanceof DuplicateOrgTransactionError) {
        console.warn(`[CreditService] Duplicate hybrid deduction detected: ${correlationId}`);
        const currentBalance = await UnifiedCreditService.getBalance(userId);
        return {
          success: true,
          newBalance: currentBalance,
          transactionId: correlationId,
          message: 'Hybrid deduction already processed (idempotent)',
          creditSource: 'personal',
        };
      }
      throw error;
    }
  }

  /**
   * Preview a hybrid deduction without performing it.
   * Useful for UI to show where credits will be taken from before confirming.
   */
  static async previewHybridDeduction(params: {
    userId: string;
    organizationId: string;
    amount: number;
  }) {
    return HybridCreditService.previewDeduction(params);
  }

  /**
   * Sync credits from legacy userCreditAllocations to users.lpCreditBalance
   * This is a migration helper method to migrate existing balances
   */
  static async syncCreditAllocationToUnified(
    userId: string,
    organizationId: string
  ): Promise<{ synced: boolean; oldBalance: number; newBalance: number }> {
    // Get the legacy allocation balance
    const allocation = await db
      .select()
      .from(userCreditAllocations)
      .where(
        and(
          eq(userCreditAllocations.userId, userId),
          eq(userCreditAllocations.organizationId, organizationId)
        )
      )
      .limit(1);

    if (allocation.length === 0) {
      console.log(`[CreditService] No legacy allocation found for user ${userId} in org ${organizationId}`);
      return { synced: false, oldBalance: 0, newBalance: 0 };
    }

    const legacyBalance = allocation[0].currentBalance || 0;

    // Get the current unified balance
    const currentUnifiedBalance = await UnifiedCreditService.getBalance(userId);

    // Only sync if the unified balance is lower or zero (don't overwrite higher balances)
    if (currentUnifiedBalance >= legacyBalance) {
      console.log(
        `[CreditService] Unified balance (${currentUnifiedBalance}) >= legacy balance (${legacyBalance}), no sync needed for user ${userId}`
      );
      return { synced: false, oldBalance: legacyBalance, newBalance: currentUnifiedBalance };
    }

    // Calculate the difference to add
    const creditDifference = legacyBalance - currentUnifiedBalance;

    if (creditDifference <= 0) {
      return { synced: false, oldBalance: legacyBalance, newBalance: currentUnifiedBalance };
    }

    try {
      // Deterministic correlationId - one-time migration per user/org
      // Removing Date.now() ensures this migration is idempotent
      const correlationId = `migration_sync_${userId}_${organizationId}`;
      
      const result = await UnifiedCreditService.addCredits({
        userId,
        amount: creditDifference,
        type: 'adjustment',
        correlationId,
        description: `Migration sync from legacy allocation (added ${creditDifference} credits)`,
        organizationId,
        metadata: {
          legacyBalance,
          previousUnifiedBalance: currentUnifiedBalance,
          migrationType: 'allocation_sync',
        },
      });

      console.log(
        `[CreditService] Synced ${creditDifference} credits from legacy allocation to unified balance for user ${userId}. ` +
        `Legacy: ${legacyBalance}, Previous unified: ${currentUnifiedBalance}, New unified: ${result.newBalance}`
      );

      return { synced: true, oldBalance: legacyBalance, newBalance: result.newBalance };
    } catch (error) {
      if (error instanceof DuplicateTransactionError) {
        console.warn(`[CreditService] Migration sync already performed for user ${userId}`);
        const newBalance = await UnifiedCreditService.getBalance(userId);
        return { synced: false, oldBalance: legacyBalance, newBalance };
      }
      throw error;
    }
  }
}
