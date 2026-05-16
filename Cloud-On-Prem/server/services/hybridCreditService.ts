import { db } from '../db';
import { UnifiedCreditService, InsufficientCreditsError, DuplicateTransactionError } from './unifiedCreditService';
import { OrganizationCreditService, InsufficientOrgCreditsError, DuplicateOrgTransactionError } from './organizationCreditService';
import { lpCreditLedger, orgCreditLedger, type LpTransactionType, type OrgCreditActivityType } from '@shared/schema';
import { and, eq, lt } from 'drizzle-orm';

export class InsufficientHybridCreditsError extends Error {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly requiredAmount: number,
    public readonly userBalance: number,
    public readonly orgBalance: number,
    public readonly orgWalletEnabled: boolean,
    public readonly userAuthorizedForOrgSpend: boolean
  ) {
    const parts = [`Insufficient credits: required ${requiredAmount}`];
    parts.push(`user balance: ${userBalance}`);
    if (orgWalletEnabled) {
      parts.push(`org balance: ${orgBalance}`);
      if (!userAuthorizedForOrgSpend) {
        parts.push('(user not authorized to spend org credits)');
      }
    } else {
      parts.push('(org wallet not enabled)');
    }
    super(parts.join(', '));
    this.name = 'InsufficientHybridCreditsError';
  }
}

export interface HybridDeductParams {
  userId: string;
  organizationId: string;
  amount: number;
  type: LpTransactionType;
  correlationId: string;
  description?: string;
  metadata?: Record<string, unknown>;
  activityType?: OrgCreditActivityType;
}

export interface HybridDeductResult {
  success: boolean;
  creditSource: 'user' | 'organization' | 'split';
  userAmountDeducted: number;
  orgAmountDeducted: number;
  userNewBalance: number;
  orgNewBalance: number;
  userTransactionId?: string;
  orgTransactionId?: string;
}

export interface HybridRefundParams {
  userId: string;
  organizationId: string;
  originalCorrelationId: string;
  refundCorrelationId: string;
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface HybridRefundResult {
  success: boolean;
  userAmountRefunded: number;
  orgAmountRefunded: number;
  creditSource: 'user' | 'organization' | 'split' | 'none';
}

const LP_TO_ORG_ACTIVITY_MAP: Partial<Record<LpTransactionType, OrgCreditActivityType>> = {
  'thumbnail_generation': 'thumbnail_generation',
  'quiz_generation': 'quiz_generation',
  'purchase': 'purchase',
  'refund': 'refund',
  'adjustment': 'adjustment',
  'deduction': 'lesson_generation',
  'trial_grant': 'trial_grant',
  'bonus': 'adjustment',
  'subscription_topup': 'purchase',
};

export class HybridCreditService {
  /**
   * Deduct credits using "user wallet first, then org wallet fallback" logic.
   * 
   * Priority:
   * 1. If user has enough credits -> deduct from user wallet only
   * 2. If user has partial credits AND org wallet enabled AND user authorized -> split deduction
   * 3. If user has 0 credits AND org wallet enabled AND user authorized -> deduct from org wallet only
   * 4. Otherwise -> throw InsufficientHybridCreditsError
   * 
   * Idempotent: Duplicate correlationIds will throw DuplicateTransactionError
   */
  static async deductWithFallback(params: HybridDeductParams): Promise<HybridDeductResult> {
    const { userId, organizationId, amount, type, correlationId, description, metadata, activityType } = params;

    if (amount <= 0) {
      throw new Error('Amount must be positive for deductWithFallback');
    }

    const userBalance = await UnifiedCreditService.getBalance(userId);
    const orgWalletEnabled = await OrganizationCreditService.isOrgWalletEnabled(organizationId);
    
    let userAuthorized = false;
    let authReason: string | undefined;
    
    if (orgWalletEnabled) {
      const authResult = await OrganizationCreditService.canSpendOrgCredits(userId, organizationId);
      userAuthorized = authResult.authorized;
      authReason = authResult.reason;
    }

    let orgBalance = 0;
    if (orgWalletEnabled) {
      orgBalance = await OrganizationCreditService.getBalance(organizationId);
    }

    const resolvedActivityType = activityType || LP_TO_ORG_ACTIVITY_MAP[type] || 'lesson_generation';

    if (userBalance >= amount) {
      const result = await UnifiedCreditService.deductCredits({
        userId,
        amount,
        type,
        correlationId,
        description: description || `Hybrid deduction: ${amount} credits (${type})`,
        organizationId,
        metadata: { ...metadata, creditSource: 'user', totalAmount: amount },
      });

      console.log(`[HybridCreditService] Deducted ${amount} credits from user ${userId} wallet only. Source: user`);

      return {
        success: true,
        creditSource: 'user',
        userAmountDeducted: amount,
        orgAmountDeducted: 0,
        userNewBalance: result.newBalance,
        orgNewBalance: orgBalance,
        userTransactionId: result.transactionId,
      };
    }

    if (userBalance > 0 && userBalance < amount && orgWalletEnabled && userAuthorized) {
      const userAmount = userBalance;
      const orgAmount = amount - userBalance;

      if (orgBalance < orgAmount) {
        throw new InsufficientHybridCreditsError(
          userId,
          organizationId,
          amount,
          userBalance,
          orgBalance,
          orgWalletEnabled,
          userAuthorized
        );
      }

      const userCorrelationId = `${correlationId}_user`;
      const orgCorrelationId = `${correlationId}_org`;

      const userResult = await UnifiedCreditService.deductCredits({
        userId,
        amount: userAmount,
        type,
        correlationId: userCorrelationId,
        description: description ? `${description} (user portion)` : `Hybrid split deduction: ${userAmount} credits from user (${type})`,
        organizationId,
        metadata: { ...metadata, creditSource: 'split', totalAmount: amount, userPortion: userAmount, orgPortion: orgAmount },
      });

      const orgResult = await OrganizationCreditService.deductCredits({
        organizationId,
        actorUserId: userId,
        amount: orgAmount,
        transactionType: type,
        activityType: resolvedActivityType,
        correlationId: orgCorrelationId,
        description: description ? `${description} (org portion)` : `Hybrid split deduction: ${orgAmount} credits from org (${type})`,
        metadata: { ...metadata, creditSource: 'split', totalAmount: amount, userPortion: userAmount, orgPortion: orgAmount },
      });

      console.log(`[HybridCreditService] Split deduction: ${userAmount} from user ${userId}, ${orgAmount} from org ${organizationId}. Source: split`);

      return {
        success: true,
        creditSource: 'split',
        userAmountDeducted: userAmount,
        orgAmountDeducted: orgAmount,
        userNewBalance: userResult.newBalance,
        orgNewBalance: orgResult.newBalance,
        userTransactionId: userResult.transactionId,
        orgTransactionId: orgResult.transactionId,
      };
    }

    if (userBalance === 0 && orgWalletEnabled && userAuthorized) {
      if (orgBalance < amount) {
        throw new InsufficientHybridCreditsError(
          userId,
          organizationId,
          amount,
          userBalance,
          orgBalance,
          orgWalletEnabled,
          userAuthorized
        );
      }

      const result = await OrganizationCreditService.deductCredits({
        organizationId,
        actorUserId: userId,
        amount,
        transactionType: type,
        activityType: resolvedActivityType,
        correlationId,
        description: description || `Hybrid deduction: ${amount} credits from org (${type})`,
        metadata: { ...metadata, creditSource: 'organization', totalAmount: amount },
      });

      console.log(`[HybridCreditService] Deducted ${amount} credits from org ${organizationId} wallet only. Source: organization`);

      return {
        success: true,
        creditSource: 'organization',
        userAmountDeducted: 0,
        orgAmountDeducted: amount,
        userNewBalance: userBalance,
        orgNewBalance: result.newBalance,
        orgTransactionId: result.transactionId,
      };
    }

    throw new InsufficientHybridCreditsError(
      userId,
      organizationId,
      amount,
      userBalance,
      orgBalance,
      orgWalletEnabled,
      userAuthorized
    );
  }

  /**
   * Check if a hybrid deduction would be possible without actually performing it.
   * Returns the predicted credit source and amounts.
   */
  static async previewDeduction(params: {
    userId: string;
    organizationId: string;
    amount: number;
  }): Promise<{
    canDeduct: boolean;
    creditSource?: 'user' | 'organization' | 'split';
    userAmountToDeduct: number;
    orgAmountToDeduct: number;
    userBalance: number;
    orgBalance: number;
    orgWalletEnabled: boolean;
    userAuthorized: boolean;
    reason?: string;
  }> {
    const { userId, organizationId, amount } = params;

    const userBalance = await UnifiedCreditService.getBalance(userId);
    const orgWalletEnabled = await OrganizationCreditService.isOrgWalletEnabled(organizationId);

    let userAuthorized = false;
    let authReason: string | undefined;

    if (orgWalletEnabled) {
      const authResult = await OrganizationCreditService.canSpendOrgCredits(userId, organizationId);
      userAuthorized = authResult.authorized;
      authReason = authResult.reason;
    }

    let orgBalance = 0;
    if (orgWalletEnabled) {
      orgBalance = await OrganizationCreditService.getBalance(organizationId);
    }

    if (userBalance >= amount) {
      return {
        canDeduct: true,
        creditSource: 'user',
        userAmountToDeduct: amount,
        orgAmountToDeduct: 0,
        userBalance,
        orgBalance,
        orgWalletEnabled,
        userAuthorized,
      };
    }

    if (userBalance > 0 && orgWalletEnabled && userAuthorized) {
      const orgAmount = amount - userBalance;
      if (orgBalance >= orgAmount) {
        return {
          canDeduct: true,
          creditSource: 'split',
          userAmountToDeduct: userBalance,
          orgAmountToDeduct: orgAmount,
          userBalance,
          orgBalance,
          orgWalletEnabled,
          userAuthorized,
        };
      }
    }

    if (userBalance === 0 && orgWalletEnabled && userAuthorized && orgBalance >= amount) {
      return {
        canDeduct: true,
        creditSource: 'organization',
        userAmountToDeduct: 0,
        orgAmountToDeduct: amount,
        userBalance,
        orgBalance,
        orgWalletEnabled,
        userAuthorized,
      };
    }

    let reason = 'Insufficient credits';
    if (!orgWalletEnabled) {
      reason = 'User has insufficient credits and organization wallet is not enabled';
    } else if (!userAuthorized) {
      reason = `User has insufficient credits and ${authReason || 'is not authorized to spend organization credits'}`;
    } else {
      reason = `Combined user and organization balance (${userBalance + orgBalance}) is less than required amount (${amount})`;
    }

    return {
      canDeduct: false,
      userAmountToDeduct: 0,
      orgAmountToDeduct: 0,
      userBalance,
      orgBalance,
      orgWalletEnabled,
      userAuthorized,
      reason,
    };
  }

  /**
   * Refund a prior hybrid deduction by inspecting the original user/org ledger entries.
   * This keeps refund amounts aligned to the original split/user/org charge distribution.
   */
  static async refundWithFallback(params: HybridRefundParams): Promise<HybridRefundResult> {
    const {
      userId,
      organizationId,
      originalCorrelationId,
      refundCorrelationId,
      reason,
      metadata,
    } = params;

    const userCorrelationCandidates = [originalCorrelationId, `${originalCorrelationId}_user`];
    const orgCorrelationCandidates = [originalCorrelationId, `${originalCorrelationId}_org`];

    const userDeductions = await db
      .select({
        correlationId: lpCreditLedger.correlationId,
        amount: lpCreditLedger.amount,
      })
      .from(lpCreditLedger)
      .where(and(
        eq(lpCreditLedger.userId, userId),
        lt(lpCreditLedger.amount, 0),
      ));

    const orgDeductions = await db
      .select({
        correlationId: orgCreditLedger.correlationId,
        amount: orgCreditLedger.amount,
      })
      .from(orgCreditLedger)
      .where(and(
        eq(orgCreditLedger.organizationId, organizationId),
        lt(orgCreditLedger.amount, 0),
      ));

    const userAmountRefunded = userDeductions
      .filter((entry) => userCorrelationCandidates.includes(String(entry.correlationId || '')))
      .reduce((sum, entry) => sum + Math.abs(Number(entry.amount || 0)), 0);

    const orgAmountRefunded = orgDeductions
      .filter((entry) => orgCorrelationCandidates.includes(String(entry.correlationId || '')))
      .reduce((sum, entry) => sum + Math.abs(Number(entry.amount || 0)), 0);

    if (userAmountRefunded <= 0 && orgAmountRefunded <= 0) {
      return {
        success: true,
        userAmountRefunded: 0,
        orgAmountRefunded: 0,
        creditSource: 'none',
      };
    }

    if (userAmountRefunded > 0) {
      try {
        await UnifiedCreditService.refundCredits({
          userId,
          amount: userAmountRefunded,
          correlationId: `${refundCorrelationId}_user`,
          reason,
          organizationId,
          metadata: {
            ...(metadata || {}),
            originalCorrelationId,
          },
        });
      } catch (error) {
        if (!(error instanceof DuplicateTransactionError)) {
          throw error;
        }
      }
    }

    if (orgAmountRefunded > 0) {
      try {
        await OrganizationCreditService.refundCredits({
          organizationId,
          actorUserId: userId,
          amount: orgAmountRefunded,
          correlationId: `${refundCorrelationId}_org`,
          reason,
          metadata: {
            ...(metadata || {}),
            originalCorrelationId,
          },
        });
      } catch (error) {
        if (!(error instanceof DuplicateOrgTransactionError)) {
          throw error;
        }
      }
    }

    const creditSource: HybridRefundResult['creditSource'] =
      userAmountRefunded > 0 && orgAmountRefunded > 0
        ? 'split'
        : userAmountRefunded > 0
          ? 'user'
          : 'organization';

    return {
      success: true,
      userAmountRefunded,
      orgAmountRefunded,
      creditSource,
    };
  }
}
