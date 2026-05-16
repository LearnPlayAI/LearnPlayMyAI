import { db } from "../db";
import { users, lpCreditLedger, organizations } from "@shared/schema";
import type { LpTransactionType, LpCreditLedger, InsertLpCreditLedger } from "@shared/schema";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";

export class InsufficientCreditsError extends Error {
  constructor(
    public readonly userId: string,
    public readonly requiredAmount: number,
    public readonly currentBalance: number
  ) {
    super(`Insufficient credits: required ${requiredAmount}, available ${currentBalance}`);
    this.name = 'InsufficientCreditsError';
  }
}

export class DuplicateTransactionError extends Error {
  public readonly existingTransaction?: {
    id: string;
    amount: number;
    createdAt: Date;
    type: LpTransactionType;
  };

  constructor(
    public readonly correlationId: string, 
    existingTransaction?: {
      id: string;
      amount: number;
      createdAt: Date;
      type: string;
    }
  ) {
    super(`Transaction with correlationId ${correlationId} already exists`);
    this.name = 'DuplicateTransactionError';
    if (existingTransaction) {
      this.existingTransaction = existingTransaction as any;
    }
  }

  toUserMessage(): string {
    if (this.existingTransaction) {
      return `This transaction was already processed on ${this.existingTransaction.createdAt.toLocaleDateString()}. The operation is idempotent and no duplicate charge occurred.`;
    }
    return 'This transaction was already processed. No duplicate charge occurred.';
  }
}

export interface CreditTransactionMetadata {
  intentId?: string;
  checkoutId?: string;
  lessonId?: string;
  quizId?: string;
  packageId?: string;
  packageName?: string;
  tier?: string;
  orderId?: string;
  adminUserId?: string;
  reason?: string;
  [key: string]: unknown;
}

export interface AddCreditsParams {
  userId: string;
  amount: number;
  type: LpTransactionType;
  correlationId: string;
  description?: string;
  organizationId?: string | null;
  metadata?: CreditTransactionMetadata;
}

export interface DeductCreditsParams {
  userId: string;
  amount: number;
  type: LpTransactionType;
  correlationId: string;
  description?: string;
  organizationId?: string | null;
  metadata?: CreditTransactionMetadata;
}

export interface TransactionHistoryParams {
  userId: string;
  limit?: number;
  offset?: number;
  startDate?: Date;
  endDate?: Date;
  type?: LpTransactionType;
}

export interface TransactionHistoryResult {
  transactions: LpCreditLedger[];
  total: number;
  hasMore: boolean;
}

export class UnifiedCreditService {
  /**
   * Add credits to a user's balance with atomic transaction
   * Uses SELECT...FOR UPDATE to prevent race conditions
   * Idempotent - duplicate correlationIds will throw DuplicateTransactionError
   */
  static async addCredits(params: AddCreditsParams): Promise<{
    success: boolean;
    newBalance: number;
    transactionId: string;
  }> {
    const { userId, amount, type, correlationId, description, organizationId, metadata } = params;

    if (amount <= 0) {
      throw new Error('Amount must be positive for addCredits');
    }

    return await db.transaction(async (tx) => {
      // Check for existing transaction with same correlationId (idempotency)
      const [existing] = await tx
        .select()
        .from(lpCreditLedger)
        .where(eq(lpCreditLedger.correlationId, correlationId))
        .limit(1);

      if (existing) {
        // Already processed - include existing transaction details for better error messaging
        console.log(`[UnifiedCreditService] Duplicate transaction detected: ${correlationId}`);
        throw new DuplicateTransactionError(correlationId, {
          id: existing.id,
          amount: existing.amount,
          createdAt: existing.createdAt!,
          type: existing.transactionType,
        });
      }

      // Lock user row for update to prevent concurrent modifications
      const [user] = await tx
        .select({ id: users.id, lpCreditBalance: users.lpCreditBalance })
        .from(users)
        .where(eq(users.id, userId))
        .for('update');

      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      const currentBalance = user.lpCreditBalance ?? 0;
      const newBalance = currentBalance + amount;

      // Update user's balance
      await tx
        .update(users)
        .set({ 
          lpCreditBalance: newBalance,
          updatedAt: new Date()
        })
        .where(eq(users.id, userId));

      // Insert ledger entry
      const [ledgerEntry] = await tx
        .insert(lpCreditLedger)
        .values({
          userId,
          organizationId: organizationId || null,
          transactionType: type,
          amount,
          balanceAfter: newBalance,
          correlationId,
          description: description || `Added ${amount} credits (${type})`,
          metadata: metadata || {},
        })
        .returning();

      console.log(`[UnifiedCreditService] Added ${amount} credits to user ${userId}. New balance: ${newBalance}`);

      return {
        success: true,
        newBalance,
        transactionId: ledgerEntry.id,
      };
    });
  }

  /**
   * Deduct credits from a user's balance with atomic transaction
   * Uses SELECT...FOR UPDATE to prevent race conditions
   * Throws InsufficientCreditsError if balance would go negative
   * Idempotent - duplicate correlationIds will throw DuplicateTransactionError
   */
  static async deductCredits(params: DeductCreditsParams): Promise<{
    success: boolean;
    newBalance: number;
    transactionId: string;
  }> {
    const { userId, amount, type, correlationId, description, organizationId, metadata } = params;

    if (amount <= 0) {
      throw new Error('Amount must be positive for deductCredits');
    }

    return await db.transaction(async (tx) => {
      // Check for existing transaction with same correlationId (idempotency)
      const [existing] = await tx
        .select()
        .from(lpCreditLedger)
        .where(eq(lpCreditLedger.correlationId, correlationId))
        .limit(1);

      if (existing) {
        console.log(`[UnifiedCreditService] Duplicate transaction detected: ${correlationId}`);
        throw new DuplicateTransactionError(correlationId, {
          id: existing.id,
          amount: existing.amount,
          createdAt: existing.createdAt!,
          type: existing.transactionType,
        });
      }

      // Lock user row for update to prevent concurrent modifications
      const [user] = await tx
        .select({ id: users.id, lpCreditBalance: users.lpCreditBalance })
        .from(users)
        .where(eq(users.id, userId))
        .for('update');

      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      const currentBalance = user.lpCreditBalance ?? 0;
      const newBalance = currentBalance - amount;

      // Prevent negative balances
      if (newBalance < 0) {
        throw new InsufficientCreditsError(userId, amount, currentBalance);
      }

      // Update user's balance
      await tx
        .update(users)
        .set({ 
          lpCreditBalance: newBalance,
          updatedAt: new Date()
        })
        .where(eq(users.id, userId));

      // Insert ledger entry (negative amount for deduction)
      const [ledgerEntry] = await tx
        .insert(lpCreditLedger)
        .values({
          userId,
          organizationId: organizationId || null,
          transactionType: type,
          amount: -amount, // Negative for deductions
          balanceAfter: newBalance,
          correlationId,
          description: description || `Deducted ${amount} credits (${type})`,
          metadata: metadata || {},
        })
        .returning();

      console.log(`[UnifiedCreditService] Deducted ${amount} credits from user ${userId}. New balance: ${newBalance}`);

      return {
        success: true,
        newBalance,
        transactionId: ledgerEntry.id,
      };
    });
  }

  /**
   * Get user's current credit balance
   * Fast read from users.lpCreditBalance column
   */
  static async getBalance(userId: string): Promise<number> {
    const [user] = await db
      .select({ lpCreditBalance: users.lpCreditBalance })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    return user.lpCreditBalance ?? 0;
  }

  /**
   * Get user's transaction history with pagination and filtering
   */
  static async getTransactionHistory(params: TransactionHistoryParams): Promise<TransactionHistoryResult> {
    const { userId, limit = 50, offset = 0, startDate, endDate, type } = params;

    // Build conditions
    const conditions = [eq(lpCreditLedger.userId, userId)];

    if (startDate) {
      conditions.push(gte(lpCreditLedger.createdAt, startDate));
    }

    if (endDate) {
      conditions.push(lte(lpCreditLedger.createdAt, endDate));
    }

    if (type) {
      conditions.push(eq(lpCreditLedger.transactionType, type));
    }

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(lpCreditLedger)
      .where(and(...conditions));

    const total = countResult?.count ?? 0;

    // Get transactions
    const transactions = await db
      .select()
      .from(lpCreditLedger)
      .where(and(...conditions))
      .orderBy(desc(lpCreditLedger.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      transactions,
      total,
      hasMore: offset + transactions.length < total,
    };
  }

  /**
   * Check if a transaction with the given correlationId already exists
   * Useful for pre-flight idempotency checks
   */
  static async transactionExists(correlationId: string): Promise<boolean> {
    const [existing] = await db
      .select({ id: lpCreditLedger.id })
      .from(lpCreditLedger)
      .where(eq(lpCreditLedger.correlationId, correlationId))
      .limit(1);

    return !!existing;
  }

  /**
   * Grant trial credits to a user (one-time only)
   * Returns false if trial credits were already granted
   */
  static async grantTrialCredits(
    userId: string,
    amount: number = 150,
    organizationId?: string | null
  ): Promise<{ success: boolean; alreadyGranted: boolean; newBalance?: number }> {
    const correlationId = `trial_grant_${userId}`;

    try {
      const result = await this.addCredits({
        userId,
        amount,
        type: 'trial_grant',
        correlationId,
        description: `Trial credits: ${amount} LP Credits`,
        organizationId,
        metadata: { isTrialGrant: true },
      });

      return {
        success: true,
        alreadyGranted: false,
        newBalance: result.newBalance,
      };
    } catch (error) {
      if (error instanceof DuplicateTransactionError) {
        // Trial credits already granted
        return {
          success: false,
          alreadyGranted: true,
        };
      }
      throw error;
    }
  }

  /**
   * Refund credits to a user
   */
  static async refundCredits(params: {
    userId: string;
    amount: number;
    correlationId: string;
    reason: string;
    organizationId?: string | null;
    metadata?: CreditTransactionMetadata;
  }): Promise<{ success: boolean; newBalance: number; transactionId: string }> {
    return this.addCredits({
      ...params,
      type: 'refund',
      description: `Refund: ${params.reason}`,
    });
  }

  /**
   * Add bonus credits to a user (promotions, admin grants, etc.)
   */
  static async addBonusCredits(params: {
    userId: string;
    amount: number;
    correlationId: string;
    reason: string;
    adminUserId?: string;
    organizationId?: string | null;
    metadata?: CreditTransactionMetadata;
  }): Promise<{ success: boolean; newBalance: number; transactionId: string }> {
    return this.addCredits({
      ...params,
      type: 'bonus',
      description: `Bonus: ${params.reason}`,
      metadata: { ...params.metadata, adminUserId: params.adminUserId },
    });
  }

  /**
   * Admin adjustment (positive or negative)
   */
  static async adminAdjustment(params: {
    userId: string;
    amount: number; // Can be positive or negative
    correlationId: string;
    reason: string;
    adminUserId: string;
    organizationId?: string | null;
  }): Promise<{ success: boolean; newBalance: number; transactionId: string }> {
    if (params.amount > 0) {
      return this.addCredits({
        userId: params.userId,
        amount: params.amount,
        type: 'adjustment',
        correlationId: params.correlationId,
        description: `Admin adjustment: ${params.reason}`,
        organizationId: params.organizationId,
        metadata: { adminUserId: params.adminUserId, reason: params.reason },
      });
    } else {
      return this.deductCredits({
        userId: params.userId,
        amount: Math.abs(params.amount),
        type: 'adjustment',
        correlationId: params.correlationId,
        description: `Admin adjustment: ${params.reason}`,
        organizationId: params.organizationId,
        metadata: { adminUserId: params.adminUserId, reason: params.reason },
      });
    }
  }

  /**
   * Record a zero-amount audit entry in the ledger without modifying the balance.
   * Useful for tracking events like lesson attachments where no credits change hands.
   * Idempotent - duplicate correlationIds will throw DuplicateTransactionError.
   */
  static async recordAuditEntry(params: {
    userId: string;
    type: LpTransactionType;
    correlationId: string;
    description: string;
    organizationId?: string | null;
    metadata?: CreditTransactionMetadata;
  }): Promise<{ success: boolean; transactionId: string; balance: number }> {
    const { userId, type, correlationId, description, organizationId, metadata } = params;

    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(lpCreditLedger)
        .where(eq(lpCreditLedger.correlationId, correlationId))
        .limit(1);

      if (existing) {
        console.log(`[UnifiedCreditService] Duplicate audit entry detected: ${correlationId}`);
        throw new DuplicateTransactionError(correlationId, {
          id: existing.id,
          amount: existing.amount,
          createdAt: existing.createdAt!,
          type: existing.transactionType,
        });
      }

      const [user] = await tx
        .select({ id: users.id, lpCreditBalance: users.lpCreditBalance })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      const currentBalance = user.lpCreditBalance ?? 0;

      const [ledgerEntry] = await tx
        .insert(lpCreditLedger)
        .values({
          userId,
          organizationId: organizationId || null,
          transactionType: type,
          amount: 0,
          balanceAfter: currentBalance,
          correlationId,
          description,
          metadata: metadata || {},
        })
        .returning();

      console.log(`[UnifiedCreditService] Recorded audit entry for user ${userId}: ${description}`);

      return {
        success: true,
        transactionId: ledgerEntry.id,
        balance: currentBalance,
      };
    });
  }
}
