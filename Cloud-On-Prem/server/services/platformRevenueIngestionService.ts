import { db } from '../db';
import {
  platformRevenueSources,
  platformFinancialAuditLog,
  type InsertPlatformRevenueSource,
  type InsertPlatformFinancialAuditLog,
} from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { ExchangeRateService } from './exchangeRateService';

export type RevenueSourceType = 
  | 'course_purchase'
  | 'credit_purchase'
  | 'license_purchase'
  | 'subscription_payment'
  | 'yoco_settlement'
  | 'chargeback'
  | 'sponsorship'
  | 'manual_entry';

export interface RevenueEventInput {
  sourceType: RevenueSourceType;
  sourceId?: string;
  organizationId?: string;
  userId?: string;
  grossAmount: string;
  netAmount: string;
  platformCommission?: string;
  processingFee?: string;
  currency: 'ZAR' | 'USD' | 'EUR';
  metadata?: Record<string, any>;
}

export interface IngestionResult {
  success: boolean;
  revenueSourceId?: string;
  normalizedAmountZAR?: string;
  error?: string;
}

export class PlatformRevenueIngestionService {
  private static readonly BASE_CURRENCY = 'ZAR' as const;

  static async recordCourseRevenue(params: {
    sourceId: string;
    organizationId: string;
    userId: string;
    grossAmount: string;
    platformCommission: string;
    processingFee: string;
    currency: 'ZAR' | 'USD' | 'EUR';
    metadata?: Record<string, any>;
  }): Promise<IngestionResult> {
    const netAmount = (
      parseFloat(params.grossAmount) -
      parseFloat(params.platformCommission) -
      parseFloat(params.processingFee)
    ).toFixed(4);

    return this.ingestRevenueEvent({
      sourceType: 'course_purchase',
      sourceId: params.sourceId,
      organizationId: params.organizationId,
      userId: params.userId,
      grossAmount: params.grossAmount,
      netAmount,
      platformCommission: params.platformCommission,
      processingFee: params.processingFee,
      currency: params.currency,
      metadata: {
        ...params.metadata,
        paymentType: 'course_purchase',
      },
    });
  }

  static async recordCreditRevenue(params: {
    sourceId: string;
    organizationId: string;
    userId: string;
    grossAmount: string;
    platformCommission: string;
    processingFee: string;
    currency: 'ZAR' | 'USD' | 'EUR';
    creditCount: number;
    metadata?: Record<string, any>;
  }): Promise<IngestionResult> {
    const netAmount = (
      parseFloat(params.grossAmount) -
      parseFloat(params.platformCommission) -
      parseFloat(params.processingFee)
    ).toFixed(4);

    return this.ingestRevenueEvent({
      sourceType: 'credit_purchase',
      sourceId: params.sourceId,
      organizationId: params.organizationId,
      userId: params.userId,
      grossAmount: params.grossAmount,
      netAmount,
      platformCommission: params.platformCommission,
      processingFee: params.processingFee,
      currency: params.currency,
      metadata: {
        ...params.metadata,
        creditCount: params.creditCount,
        paymentType: 'credit_purchase',
      },
    });
  }

  static async recordLicenseRevenue(params: {
    sourceId: string;
    organizationId: string;
    userId?: string;
    grossAmount: string;
    processingFee: string;
    currency: 'ZAR' | 'USD' | 'EUR';
    tier: 'blue' | 'red' | 'gold';
    seatCount: number;
    billingPeriodMonths: number;
    metadata?: Record<string, any>;
  }): Promise<IngestionResult> {
    const netAmount = (
      parseFloat(params.grossAmount) -
      parseFloat(params.processingFee)
    ).toFixed(4);

    return this.ingestRevenueEvent({
      sourceType: 'license_purchase',
      sourceId: params.sourceId,
      organizationId: params.organizationId,
      userId: params.userId,
      grossAmount: params.grossAmount,
      netAmount,
      platformCommission: params.grossAmount,
      processingFee: params.processingFee,
      currency: params.currency,
      metadata: {
        ...params.metadata,
        tier: params.tier,
        seatCount: params.seatCount,
        billingPeriodMonths: params.billingPeriodMonths,
        paymentType: 'license_purchase',
      },
    });
  }

  static async recordSubscriptionRevenue(params: {
    sourceId: string;
    organizationId: string;
    userId?: string;
    grossAmount: string;
    processingFee: string;
    currency: 'ZAR' | 'USD' | 'EUR';
    invoiceId?: string;
    metadata?: Record<string, any>;
  }): Promise<IngestionResult> {
    const netAmount = (
      parseFloat(params.grossAmount) -
      parseFloat(params.processingFee)
    ).toFixed(4);

    return this.ingestRevenueEvent({
      sourceType: 'subscription_payment',
      sourceId: params.sourceId,
      organizationId: params.organizationId,
      userId: params.userId,
      grossAmount: params.grossAmount,
      netAmount,
      platformCommission: params.grossAmount,
      processingFee: params.processingFee,
      currency: params.currency,
      metadata: {
        ...params.metadata,
        invoiceId: params.invoiceId,
        paymentType: 'subscription_payment',
      },
    });
  }

  static async recordChargeback(params: {
    sourceId: string;
    organizationId?: string;
    userId?: string;
    amount: string;
    currency: 'ZAR' | 'USD' | 'EUR';
    originalPaymentId?: string;
    reason?: string;
    metadata?: Record<string, any>;
  }): Promise<IngestionResult> {
    const negativeAmount = (-Math.abs(parseFloat(params.amount))).toFixed(4);

    return this.ingestRevenueEvent({
      sourceType: 'chargeback',
      sourceId: params.sourceId,
      organizationId: params.organizationId,
      userId: params.userId,
      grossAmount: negativeAmount,
      netAmount: negativeAmount,
      platformCommission: '0',
      processingFee: '0',
      currency: params.currency,
      metadata: {
        ...params.metadata,
        originalPaymentId: params.originalPaymentId,
        chargebackReason: params.reason,
        paymentType: 'chargeback',
      },
    });
  }

  static async recordManualEntry(params: {
    sourceId?: string;
    organizationId?: string;
    grossAmount: string;
    netAmount: string;
    currency: 'ZAR' | 'USD' | 'EUR';
    description: string;
    enteredBy: string;
    metadata?: Record<string, any>;
  }): Promise<IngestionResult> {
    return this.ingestRevenueEvent({
      sourceType: 'manual_entry',
      sourceId: params.sourceId,
      organizationId: params.organizationId,
      userId: params.enteredBy,
      grossAmount: params.grossAmount,
      netAmount: params.netAmount,
      platformCommission: '0',
      processingFee: '0',
      currency: params.currency,
      metadata: {
        ...params.metadata,
        description: params.description,
        enteredBy: params.enteredBy,
        paymentType: 'manual_entry',
      },
    });
  }

  static async ingestRevenueEvent(input: RevenueEventInput): Promise<IngestionResult> {
    try {
      let normalizedAmountZAR = input.netAmount;
      let exchangeRateUsed: string | null = null;

      if (input.currency !== this.BASE_CURRENCY) {
        const rate = await ExchangeRateService.getRate(input.currency, this.BASE_CURRENCY);
        if (rate <= 0) {
          console.error(`[RevenueIngestion] Invalid exchange rate for ${input.currency} to ZAR`);
          return {
            success: false,
            error: `Unable to get exchange rate for ${input.currency} to ZAR`,
          };
        }
        normalizedAmountZAR = (parseFloat(input.netAmount) * rate).toFixed(4);
        exchangeRateUsed = rate.toFixed(8);
      }

      const insertData: InsertPlatformRevenueSource = {
        sourceType: input.sourceType,
        sourceId: input.sourceId || null,
        organizationId: input.organizationId || null,
        userId: input.userId || null,
        grossAmount: input.grossAmount,
        netAmount: input.netAmount,
        platformCommission: input.platformCommission || '0',
        processingFee: input.processingFee || '0',
        currency: input.currency,
        exchangeRateUsed: exchangeRateUsed,
        normalizedAmountZAR,
        metadata: input.metadata ?? undefined,
      };

      const insertQuery = db
        .insert(platformRevenueSources)
        .values(insertData);

      // Idempotent for provider/webhook events carrying stable sourceId.
      const [revenueSource] = input.sourceId
        ? await insertQuery
            .onConflictDoNothing({
              target: [platformRevenueSources.sourceType, platformRevenueSources.sourceId],
            })
            .returning()
        : await insertQuery.returning();

      if (!revenueSource && input.sourceId) {
        const existing = await this.getRevenueSourceBySourceId(input.sourceType, input.sourceId);
        if (existing) {
          return {
            success: true,
            revenueSourceId: existing.id,
            normalizedAmountZAR: existing.normalizedAmountZAR,
          };
        }
      }

      console.log(
        `[RevenueIngestion] Recorded ${input.sourceType}: ${input.grossAmount} ${input.currency} (${normalizedAmountZAR} ZAR) for org=${input.organizationId || 'platform'}`
      );

      return {
        success: true,
        revenueSourceId: revenueSource.id,
        normalizedAmountZAR,
      };
    } catch (error) {
      console.error('[RevenueIngestion] Failed to ingest revenue event:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during ingestion',
      };
    }
  }

  static async createAuditEntry(params: {
    tableName: string;
    recordId: string;
    action: 'create' | 'update' | 'delete';
    beforeData?: Record<string, any>;
    afterData?: Record<string, any>;
    changedBy?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      const auditData: InsertPlatformFinancialAuditLog = {
        tableName: params.tableName,
        recordId: params.recordId,
        action: params.action,
        beforeData: params.beforeData ?? undefined,
        afterData: params.afterData ?? undefined,
        changedBy: params.changedBy || null,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
      };

      await db.insert(platformFinancialAuditLog).values(auditData);

      console.log(
        `[FinancialAudit] ${params.action.toUpperCase()} on ${params.tableName}:${params.recordId} by ${params.changedBy || 'system'}`
      );
    } catch (error) {
      console.error('[FinancialAudit] Failed to create audit entry:', error);
    }
  }

  static async getRevenueSourceBySourceId(
    sourceType: RevenueSourceType,
    sourceId: string
  ): Promise<typeof platformRevenueSources.$inferSelect | null> {
    const [result] = await db
      .select()
      .from(platformRevenueSources)
      .where(
        and(
          eq(platformRevenueSources.sourceType, sourceType),
          eq(platformRevenueSources.sourceId, sourceId)
        )
      )
      .limit(1);

    return result || null;
  }

  static async isDuplicateEvent(sourceType: RevenueSourceType, sourceId: string): Promise<boolean> {
    const existing = await this.getRevenueSourceBySourceId(sourceType, sourceId);
    return existing !== null;
  }
}
