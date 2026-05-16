import { db } from "../db";
import { organizations, orgCreditLedger, users, userOrganizationRoles } from "@shared/schema";
import type { OrgCreditActivityType, LpTransactionType, OrgCreditLedger, InsertOrgCreditLedger } from "@shared/schema";
import { eq, and, desc, gte, lte, sql, or } from "drizzle-orm";

export class InsufficientOrgCreditsError extends Error {
  constructor(
    public readonly organizationId: string,
    public readonly requiredAmount: number,
    public readonly currentBalance: number
  ) {
    super(`Insufficient organization credits: required ${requiredAmount}, available ${currentBalance}`);
    this.name = 'InsufficientOrgCreditsError';
  }
}

export class DuplicateOrgTransactionError extends Error {
  public readonly existingTransaction?: {
    id: string;
    amount: number;
    createdAt: Date;
    activityType: OrgCreditActivityType;
  };

  constructor(
    public readonly correlationId: string,
    existingTransaction?: {
      id: string;
      amount: number;
      createdAt: Date;
      activityType: string;
    }
  ) {
    super(`Organization transaction with correlationId ${correlationId} already exists`);
    this.name = 'DuplicateOrgTransactionError';
    if (existingTransaction) {
      this.existingTransaction = existingTransaction as any;
    }
  }

  toUserMessage(): string {
    if (this.existingTransaction) {
      return `This transaction was already processed on ${this.existingTransaction.createdAt.toLocaleDateString()}. No duplicate charge occurred.`;
    }
    return 'This transaction was already processed. No duplicate charge occurred.';
  }
}

export class UnauthorizedOrgCreditSpendError extends Error {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly reason: string
  ) {
    super(`User ${userId} is not authorized to spend credits for organization ${organizationId}: ${reason}`);
    this.name = 'UnauthorizedOrgCreditSpendError';
  }
}

export interface OrgCreditTransactionMetadata {
  lessonId?: string;
  lessonTitle?: string;
  quizId?: string;
  quizTitle?: string;
  courseId?: string;
  courseTitle?: string;
  orderId?: string;
  packageId?: string;
  packageName?: string;
  adjustmentReason?: string;
  adminUserId?: string;
  activityName?: string;
  [key: string]: unknown;
}

export interface AddOrgCreditsParams {
  organizationId: string;
  actorUserId: string;
  amount: number;
  transactionType: LpTransactionType;
  activityType: OrgCreditActivityType;
  correlationId: string;
  description?: string;
  activityId?: string;
  metadata?: OrgCreditTransactionMetadata;
}

export interface DeductOrgCreditsParams {
  organizationId: string;
  actorUserId: string;
  amount: number;
  transactionType: LpTransactionType;
  activityType: OrgCreditActivityType;
  correlationId: string;
  description?: string;
  activityId?: string;
  metadata?: OrgCreditTransactionMetadata;
}

export interface OrgTransactionHistoryParams {
  organizationId: string;
  limit?: number;
  offset?: number;
  startDate?: Date;
  endDate?: Date;
  actorUserId?: string;
  activityType?: OrgCreditActivityType;
  transactionType?: LpTransactionType;
}

export interface OrgTransactionHistoryResult {
  transactions: OrgCreditLedger[];
  total: number;
  hasMore: boolean;
}

export class OrganizationCreditService {
  /**
   * Check if a user is authorized to spend organization credits
   * Only org_admin can spend by default; teachers can spend if allowTeachersToSpendCredits is true
   */
  static async canSpendOrgCredits(userId: string, organizationId: string): Promise<{
    authorized: boolean;
    reason?: string;
    org?: any;
  }> {
    // Get organization and check if org credit wallet is enabled
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org) {
      return { authorized: false, reason: 'Organization not found' };
    }

    if (!org.useOrgCreditWallet) {
      return { authorized: false, reason: 'Organization credit wallet is not enabled', org };
    }

    // SuperAdmin can always spend org wallet credits (including impersonation contexts)
    const [user] = await db
      .select({ isSuperAdmin: users.isSuperAdmin })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user?.isSuperAdmin) {
      return { authorized: true, org };
    }

    // Check ALL user's roles in the organization (user may have multiple roles)
    const userRoles = await db
      .select()
      .from(userOrganizationRoles)
      .where(and(
        eq(userOrganizationRoles.userId, userId),
        eq(userOrganizationRoles.organizationId, organizationId)
      ));

    if (userRoles.length === 0) {
      return { authorized: false, reason: 'User is not a member of this organization', org };
    }

    // Check if ANY role is org_admin (can always spend)
    if (userRoles.some(role => role.role === 'org_admin')) {
      return { authorized: true, org };
    }

    // Check if ANY role is teacher and allowTeachersToSpendCredits is true
    if (userRoles.some(role => role.role === 'teacher') && org.allowTeachersToSpendCredits) {
      return { authorized: true, org };
    }

    const roleNames = userRoles.map(r => r.role).join(', ');
    return { 
      authorized: false, 
      reason: `Role(s) '${roleNames}' not authorized to spend organization credits`,
      org 
    };
  }

  /**
   * Check if a user can view organization credit balance and history
   * org_admin and teachers can view
   */
  static async canViewOrgCredits(userId: string, organizationId: string): Promise<boolean> {
    // Check if user is SuperAdmin
    const [user] = await db
      .select({ isSuperAdmin: users.isSuperAdmin })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user?.isSuperAdmin) {
      return true;
    }

    // Check ALL user's roles in the organization (user may have multiple roles)
    const userRoles = await db
      .select()
      .from(userOrganizationRoles)
      .where(and(
        eq(userOrganizationRoles.userId, userId),
        eq(userOrganizationRoles.organizationId, organizationId)
      ));

    if (userRoles.length === 0) {
      return false;
    }

    // org_admin and teachers can view - check if ANY role matches
    return userRoles.some(role => ['org_admin', 'teacher'].includes(role.role));
  }

  /**
   * Check if a user can view organization credit balance read-only
   * Any org member (including learners) can view the balance
   */
  static async canViewOrgCreditsReadOnly(userId: string, organizationId: string): Promise<boolean> {
    // Check if user is SuperAdmin
    const [user] = await db
      .select({ isSuperAdmin: users.isSuperAdmin })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user?.isSuperAdmin) {
      return true;
    }

    // Check if user is a member of the organization (any role)
    const [userRole] = await db
      .select()
      .from(userOrganizationRoles)
      .where(and(
        eq(userOrganizationRoles.userId, userId),
        eq(userOrganizationRoles.organizationId, organizationId)
      ))
      .limit(1);

    // Any member of the organization can view (regardless of role)
    return !!userRole;
  }

  /**
   * Get organization's current credit balance
   * Fast read from organizations.orgCreditWallet column
   */
  static async getBalance(organizationId: string): Promise<number> {
    const [org] = await db
      .select({ orgCreditWallet: organizations.orgCreditWallet })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org) {
      throw new Error(`Organization ${organizationId} not found`);
    }

    return org.orgCreditWallet ?? 0;
  }

  /**
   * Check if organization has org credit wallet enabled
   */
  static async isOrgWalletEnabled(organizationId: string): Promise<boolean> {
    const [org] = await db
      .select({ useOrgCreditWallet: organizations.useOrgCreditWallet })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    return org?.useOrgCreditWallet ?? false;
  }

  /**
   * Add credits to an organization's wallet with atomic transaction
   * Uses SELECT...FOR UPDATE to prevent race conditions
   * Idempotent - duplicate correlationIds will throw DuplicateOrgTransactionError
   */
  static async addCredits(params: AddOrgCreditsParams): Promise<{
    success: boolean;
    newBalance: number;
    transactionId: string;
  }> {
    const { organizationId, actorUserId, amount, transactionType, activityType, correlationId, description, activityId, metadata } = params;

    if (amount <= 0) {
      throw new Error('Amount must be positive for addCredits');
    }

    return await db.transaction(async (tx) => {
      // Check for existing transaction with same correlationId (idempotency)
      const [existing] = await tx
        .select()
        .from(orgCreditLedger)
        .where(eq(orgCreditLedger.correlationId, correlationId))
        .limit(1);

      if (existing) {
        console.log(`[OrganizationCreditService] Duplicate transaction detected: ${correlationId}`);
        throw new DuplicateOrgTransactionError(correlationId, {
          id: existing.id,
          amount: existing.amount,
          createdAt: existing.createdAt!,
          activityType: existing.activityType,
        });
      }

      // Lock organization row for update to prevent concurrent modifications
      const [org] = await tx
        .select({ id: organizations.id, orgCreditWallet: organizations.orgCreditWallet })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .for('update');

      if (!org) {
        throw new Error(`Organization ${organizationId} not found`);
      }

      const currentBalance = org.orgCreditWallet ?? 0;
      const newBalance = currentBalance + amount;

      // Update organization's balance
      await tx
        .update(organizations)
        .set({
          orgCreditWallet: newBalance,
          updatedAt: new Date()
        })
        .where(eq(organizations.id, organizationId));

      // Insert ledger entry
      const [ledgerEntry] = await tx
        .insert(orgCreditLedger)
        .values({
          organizationId,
          actorUserId,
          transactionType,
          activityType,
          activityId: activityId || null,
          amount,
          balanceAfter: newBalance,
          correlationId,
          description: description || `Added ${amount} credits (${activityType})`,
          metadata: metadata || {},
        })
        .returning();

      console.log(`[OrganizationCreditService] Added ${amount} credits to org ${organizationId} by user ${actorUserId}. New balance: ${newBalance}`);

      return {
        success: true,
        newBalance,
        transactionId: ledgerEntry.id,
      };
    });
  }

  /**
   * Deduct credits from an organization's wallet with atomic transaction
   * Uses SELECT...FOR UPDATE to prevent race conditions
   * Throws InsufficientOrgCreditsError if balance would go negative
   * Idempotent - duplicate correlationIds will throw DuplicateOrgTransactionError
   */
  static async deductCredits(params: DeductOrgCreditsParams): Promise<{
    success: boolean;
    newBalance: number;
    transactionId: string;
  }> {
    const { organizationId, actorUserId, amount, transactionType, activityType, correlationId, description, activityId, metadata } = params;

    if (amount <= 0) {
      throw new Error('Amount must be positive for deductCredits');
    }

    return await db.transaction(async (tx) => {
      // Check for existing transaction with same correlationId (idempotency)
      const [existing] = await tx
        .select()
        .from(orgCreditLedger)
        .where(eq(orgCreditLedger.correlationId, correlationId))
        .limit(1);

      if (existing) {
        console.log(`[OrganizationCreditService] Duplicate transaction detected: ${correlationId}`);
        throw new DuplicateOrgTransactionError(correlationId, {
          id: existing.id,
          amount: existing.amount,
          createdAt: existing.createdAt!,
          activityType: existing.activityType,
        });
      }

      // Lock organization row for update to prevent concurrent modifications
      const [org] = await tx
        .select({ id: organizations.id, orgCreditWallet: organizations.orgCreditWallet })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .for('update');

      if (!org) {
        throw new Error(`Organization ${organizationId} not found`);
      }

      const currentBalance = org.orgCreditWallet ?? 0;
      const newBalance = currentBalance - amount;

      // Prevent negative balances
      if (newBalance < 0) {
        throw new InsufficientOrgCreditsError(organizationId, amount, currentBalance);
      }

      // Update organization's balance
      await tx
        .update(organizations)
        .set({
          orgCreditWallet: newBalance,
          updatedAt: new Date()
        })
        .where(eq(organizations.id, organizationId));

      // Insert ledger entry (negative amount for deduction)
      const [ledgerEntry] = await tx
        .insert(orgCreditLedger)
        .values({
          organizationId,
          actorUserId,
          transactionType,
          activityType,
          activityId: activityId || null,
          amount: -amount, // Negative for deductions
          balanceAfter: newBalance,
          correlationId,
          description: description || `Deducted ${amount} credits (${activityType})`,
          metadata: metadata || {},
        })
        .returning();

      console.log(`[OrganizationCreditService] Deducted ${amount} credits from org ${organizationId} by user ${actorUserId}. New balance: ${newBalance}`);

      return {
        success: true,
        newBalance,
        transactionId: ledgerEntry.id,
      };
    });
  }

  /**
   * Get organization's transaction history with pagination and filtering
   */
  static async getTransactionHistory(params: OrgTransactionHistoryParams): Promise<OrgTransactionHistoryResult> {
    const { organizationId, limit = 50, offset = 0, startDate, endDate, actorUserId, activityType, transactionType } = params;

    // Build conditions
    const conditions = [eq(orgCreditLedger.organizationId, organizationId)];

    if (startDate) {
      conditions.push(gte(orgCreditLedger.createdAt, startDate));
    }

    if (endDate) {
      conditions.push(lte(orgCreditLedger.createdAt, endDate));
    }

    if (actorUserId) {
      conditions.push(eq(orgCreditLedger.actorUserId, actorUserId));
    }

    if (activityType) {
      conditions.push(eq(orgCreditLedger.activityType, activityType));
    }

    if (transactionType) {
      conditions.push(eq(orgCreditLedger.transactionType, transactionType));
    }

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orgCreditLedger)
      .where(and(...conditions));

    const total = countResult?.count ?? 0;

    // Get transactions with actor user info
    const transactions = await db
      .select()
      .from(orgCreditLedger)
      .where(and(...conditions))
      .orderBy(desc(orgCreditLedger.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      transactions,
      total,
      hasMore: offset + transactions.length < total,
    };
  }

  /**
   * Get transaction history with actor user details for reporting
   */
  static async getTransactionHistoryWithUserDetails(params: OrgTransactionHistoryParams): Promise<{
    transactions: (OrgCreditLedger & { actorUser?: { gamerName: string; email: string } })[];
    total: number;
    hasMore: boolean;
  }> {
    const { organizationId, limit = 50, offset = 0, startDate, endDate, actorUserId, activityType, transactionType } = params;

    // Build conditions
    const conditions = [eq(orgCreditLedger.organizationId, organizationId)];

    if (startDate) {
      conditions.push(gte(orgCreditLedger.createdAt, startDate));
    }

    if (endDate) {
      conditions.push(lte(orgCreditLedger.createdAt, endDate));
    }

    if (actorUserId) {
      conditions.push(eq(orgCreditLedger.actorUserId, actorUserId));
    }

    if (activityType) {
      conditions.push(eq(orgCreditLedger.activityType, activityType));
    }

    if (transactionType) {
      conditions.push(eq(orgCreditLedger.transactionType, transactionType));
    }

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orgCreditLedger)
      .where(and(...conditions));

    const total = countResult?.count ?? 0;

    // Get transactions with user details
    const results = await db
      .select({
        transaction: orgCreditLedger,
        actorUser: {
          gamerName: users.gamerName,
          email: users.email,
        }
      })
      .from(orgCreditLedger)
      .leftJoin(users, eq(orgCreditLedger.actorUserId, users.id))
      .where(and(...conditions))
      .orderBy(desc(orgCreditLedger.createdAt))
      .limit(limit)
      .offset(offset);

    const transactions = results.map(r => ({
      ...r.transaction,
      actorUser: r.actorUser || undefined,
    }));

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
      .select({ id: orgCreditLedger.id })
      .from(orgCreditLedger)
      .where(eq(orgCreditLedger.correlationId, correlationId))
      .limit(1);

    return !!existing;
  }

  /**
   * Admin adjustment (positive or negative) for organization credits
   */
  static async adminAdjustment(params: {
    organizationId: string;
    amount: number; // Can be positive or negative
    correlationId: string;
    reason: string;
    adminUserId: string;
  }): Promise<{ success: boolean; newBalance: number; transactionId: string }> {
    if (params.amount > 0) {
      return this.addCredits({
        organizationId: params.organizationId,
        actorUserId: params.adminUserId,
        amount: params.amount,
        transactionType: 'adjustment',
        activityType: 'adjustment',
        correlationId: params.correlationId,
        description: `Admin adjustment: ${params.reason}`,
        metadata: { adminUserId: params.adminUserId, reason: params.reason },
      });
    } else {
      return this.deductCredits({
        organizationId: params.organizationId,
        actorUserId: params.adminUserId,
        amount: Math.abs(params.amount),
        transactionType: 'adjustment',
        activityType: 'adjustment',
        correlationId: params.correlationId,
        description: `Admin adjustment: ${params.reason}`,
        metadata: { adminUserId: params.adminUserId, reason: params.reason },
      });
    }
  }

  /**
   * Grant trial credits to an organization (one-time only)
   * Returns false if trial credits were already granted
   */
  static async grantTrialCredits(
    organizationId: string,
    actorUserId: string,
    amount: number = 150
  ): Promise<{ success: boolean; alreadyGranted: boolean; newBalance?: number }> {
    const correlationId = `org_trial_grant_${organizationId}`;

    try {
      const result = await this.addCredits({
        organizationId,
        actorUserId,
        amount,
        transactionType: 'trial_grant',
        activityType: 'trial_grant',
        correlationId,
        description: `Trial credits: ${amount} LP Credits`,
        metadata: { isTrialGrant: true },
      });

      return {
        success: true,
        alreadyGranted: false,
        newBalance: result.newBalance,
      };
    } catch (error) {
      if (error instanceof DuplicateOrgTransactionError) {
        return {
          success: false,
          alreadyGranted: true,
        };
      }
      throw error;
    }
  }

  /**
   * Refund credits to an organization
   */
  static async refundCredits(params: {
    organizationId: string;
    actorUserId: string;
    amount: number;
    correlationId: string;
    reason: string;
    originalActivityId?: string;
    metadata?: OrgCreditTransactionMetadata;
  }): Promise<{ success: boolean; newBalance: number; transactionId: string }> {
    return this.addCredits({
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      amount: params.amount,
      transactionType: 'refund',
      activityType: 'refund',
      correlationId: params.correlationId,
      description: `Refund: ${params.reason}`,
      activityId: params.originalActivityId,
      metadata: { ...params.metadata, refundReason: params.reason },
    });
  }

  /**
   * Get organization credit summary for reporting
   */
  static async getCreditSummary(organizationId: string, startDate?: Date, endDate?: Date): Promise<{
    currentBalance: number;
    totalCreditsAdded: number;
    totalCreditsUsed: number;
    transactionCount: number;
    topSpenders: { userId: string; gamerName: string; totalSpent: number }[];
    activityBreakdown: { activityType: OrgCreditActivityType; count: number; totalAmount: number }[];
  }> {
    const balance = await this.getBalance(organizationId);

    // Build date conditions
    const dateConditions = [eq(orgCreditLedger.organizationId, organizationId)];
    if (startDate) {
      dateConditions.push(gte(orgCreditLedger.createdAt, startDate));
    }
    if (endDate) {
      dateConditions.push(lte(orgCreditLedger.createdAt, endDate));
    }

    // Get totals
    const [totals] = await db
      .select({
        totalAdded: sql<number>`COALESCE(SUM(CASE WHEN ${orgCreditLedger.amount} > 0 THEN ${orgCreditLedger.amount} ELSE 0 END), 0)::int`,
        totalUsed: sql<number>`COALESCE(SUM(CASE WHEN ${orgCreditLedger.amount} < 0 THEN ABS(${orgCreditLedger.amount}) ELSE 0 END), 0)::int`,
        transactionCount: sql<number>`COUNT(*)::int`,
      })
      .from(orgCreditLedger)
      .where(and(...dateConditions));

    // Get top spenders (only deductions)
    const spenders = await db
      .select({
        userId: orgCreditLedger.actorUserId,
        gamerName: users.gamerName,
        totalSpent: sql<number>`COALESCE(SUM(CASE WHEN ${orgCreditLedger.amount} < 0 THEN ABS(${orgCreditLedger.amount}) ELSE 0 END), 0)::int`,
      })
      .from(orgCreditLedger)
      .leftJoin(users, eq(orgCreditLedger.actorUserId, users.id))
      .where(and(...dateConditions))
      .groupBy(orgCreditLedger.actorUserId, users.gamerName)
      .orderBy(desc(sql`SUM(CASE WHEN ${orgCreditLedger.amount} < 0 THEN ABS(${orgCreditLedger.amount}) ELSE 0 END)`))
      .limit(10);

    // Get activity breakdown
    const activities = await db
      .select({
        activityType: orgCreditLedger.activityType,
        count: sql<number>`COUNT(*)::int`,
        totalAmount: sql<number>`COALESCE(SUM(ABS(${orgCreditLedger.amount})), 0)::int`,
      })
      .from(orgCreditLedger)
      .where(and(...dateConditions))
      .groupBy(orgCreditLedger.activityType);

    return {
      currentBalance: balance,
      totalCreditsAdded: totals?.totalAdded ?? 0,
      totalCreditsUsed: totals?.totalUsed ?? 0,
      transactionCount: totals?.transactionCount ?? 0,
      topSpenders: spenders.map(s => ({
        userId: s.userId,
        gamerName: s.gamerName || 'Unknown',
        totalSpent: s.totalSpent,
      })),
      activityBreakdown: activities.map(a => ({
        activityType: a.activityType,
        count: a.count,
        totalAmount: a.totalAmount,
      })),
    };
  }
}
