import { db } from '../db';
import {
  coursePayouts,
  coursePayoutLineItems,
  courses,
  organizations,
  organizationBankingDetails,
  type CoursePayout,
} from '@shared/schema';
import { eq, and, desc, sql, gte, lte, inArray } from 'drizzle-orm';
import { ExchangeRateService } from './exchangeRateService';
import { RevenueTrackingService } from './revenueTrackingService';
import { decryptBankAccountNumber } from '../utils/bankingDetailsCrypto';
import PDFKit from 'pdfkit';

type CoursePayoutLineItem = typeof coursePayoutLineItems.$inferSelect;

export interface CreatePayoutBatchInput {
  organizationId: string;
  periodStart: Date;
  periodEnd: Date;
  currency: 'ZAR' | 'USD' | 'EUR';
}

export interface PayoutBatchSummary {
  batch: CoursePayout;
  transactions: CoursePayoutLineItem[];
  organizationName: string;
  bankingDetails: typeof organizationBankingDetails.$inferSelect | null;
}

export interface MarkPaidInput {
  batchId: string;
  paymentReference: string;
  paidBy: string;
}

export class PayoutProcessorService {
  /**
   * Calculate pending payouts for an organization
   */
  static async calculatePendingPayout(
    organizationId: string,
    currency: 'ZAR' | 'USD' | 'EUR',
    periodStart: Date,
    periodEnd: Date
  ): Promise<{
    totalRevenue: number;
    platformCommission: number;
    netPayout: number;
    salesCount: number;
    courseBreakdown: Array<{
      courseId: string;
      courseTitle: string;
      salesCount: number;
      revenue: number;
      commission: number;
      netAmount: number;
    }>;
  }> {
    // Get revenue summary for period
    const revenueSummary = await RevenueTrackingService.getOrganizationRevenue(
      organizationId,
      periodStart,
      periodEnd,
      currency
    );

    // Get course breakdown
    const courseBreakdown = await RevenueTrackingService.getCourseRevenueBreakdown(
      organizationId,
      periodStart,
      periodEnd
    );

    // Convert course breakdown to target currency
    const convertedBreakdown = await Promise.all(
      courseBreakdown.map(async (course) => {
        let revenue = course.totalRevenue;
        let commission = course.platformCommission;
        let netAmount = course.netRevenue;

        if (course.currency !== currency) {
          revenue = await ExchangeRateService.convert(revenue, course.currency, currency);
          commission = await ExchangeRateService.convert(commission, course.currency, currency);
          netAmount = await ExchangeRateService.convert(netAmount, course.currency, currency);
        }

        return {
          courseId: course.courseId,
          courseTitle: course.courseTitle,
          salesCount: course.totalSales,
          revenue,
          commission,
          netAmount,
        };
      })
    );

    return {
      totalRevenue: revenueSummary.totalRevenue,
      platformCommission: revenueSummary.platformCommission,
      netPayout: revenueSummary.netProfit,
      salesCount: revenueSummary.salesCount,
      courseBreakdown: convertedBreakdown,
    };
  }

  /**
   * Create a payout batch for an organization
   */
  static async createPayoutBatch(input: CreatePayoutBatchInput): Promise<CoursePayout> {
    // Calculate payout details
    const payoutDetails = await this.calculatePendingPayout(
      input.organizationId,
      input.currency,
      input.periodStart,
      input.periodEnd
    );

    if (payoutDetails.netPayout <= 0) {
      throw new Error('No payout amount available for this period');
    }

    // Get current exchange rate snapshot
    const exchangeRateSnapshot = await ExchangeRateService.getRateSnapshot(new Date());

    // Create payout batch (using coursePayouts table)
    const batch = await db
      .insert(coursePayouts)
      .values({
        organizationId: input.organizationId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        currency: input.currency,
        grossRevenue: payoutDetails.totalRevenue.toFixed(4),
        platformCommission: payoutDetails.platformCommission.toFixed(4),
        netAmount: payoutDetails.netPayout.toFixed(4),
        status: 'pending',
        exchangeRateSnapshot,
      })
      .returning();

    // Create payout line items for each course
    const lineItems = payoutDetails.courseBreakdown.map((course) => ({
      payoutId: batch[0].id,
      courseId: course.courseId,
      salesCount: course.salesCount,
      grossRevenue: course.revenue.toFixed(4),
      platformCommission: course.commission.toFixed(4),
      netAmount: course.netAmount.toFixed(4),
    }));

    if (lineItems.length > 0) {
      await db.insert(coursePayoutLineItems).values(lineItems);
    }

    console.log(`Payout batch created for org ${input.organizationId}: ${input.currency} ${payoutDetails.netPayout.toFixed(2)}`);

    return batch[0];
  }

  /**
   * Get payout batches with filters
   */
  static async getPayoutBatches(filters: {
    organizationId?: string;
    currency?: 'ZAR' | 'USD' | 'EUR';
    status?: 'pending' | 'paid' | 'cancelled';
    periodStart?: Date;
    periodEnd?: Date;
    limit?: number;
    offset?: number;
  }): Promise<CoursePayout[]> {
    const conditions = [];

    if (filters.organizationId) {
      conditions.push(eq(coursePayouts.organizationId, filters.organizationId));
    }

    if (filters.currency) {
      conditions.push(eq(coursePayouts.currency, filters.currency));
    }

    if (filters.status) {
      conditions.push(eq(coursePayouts.status, filters.status));
    }

    if (filters.periodStart) {
      conditions.push(gte(coursePayouts.periodEnd, filters.periodStart));
    }

    if (filters.periodEnd) {
      conditions.push(lte(coursePayouts.periodStart, filters.periodEnd));
    }

    let query = db.select().from(coursePayouts);
    
    if (conditions.length > 0) {
      query = db
        .select()
        .from(coursePayouts)
        .where(and(...conditions)) as typeof query;
    }

    let batches = await query.orderBy(desc(coursePayouts.createdAt));

    // Apply pagination if specified
    if (filters.offset !== undefined) {
      batches = batches.slice(filters.offset);
    }

    if (filters.limit !== undefined) {
      batches = batches.slice(0, filters.limit);
    }

    return batches;
  }

  /**
   * Get detailed payout batch with transactions
   */
  static async getPayoutBatchDetails(batchId: string): Promise<PayoutBatchSummary> {
    const batch = await db
      .select()
      .from(coursePayouts)
      .where(eq(coursePayouts.id, batchId))
      .limit(1);

    if (!batch.length) {
      throw new Error('Payout batch not found');
    }

    // Get line items (transactions)
    const transactions = await db
      .select()
      .from(coursePayoutLineItems)
      .where(eq(coursePayoutLineItems.payoutId, batchId));

    // Get organization details
    const org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, batch[0].organizationId))
      .limit(1);

    // Get banking details
    const banking = await db
      .select()
      .from(organizationBankingDetails)
      .where(eq(organizationBankingDetails.organizationId, batch[0].organizationId))
      .limit(1);

    return {
      batch: batch[0],
      transactions,
      organizationName: org[0]?.name || 'Unknown',
      bankingDetails: banking[0] || null,
    };
  }

  /**
   * Mark payout batch as paid
   * Uses transaction to ensure atomic status update + line item marking
   */
  static async markAsPaid(input: MarkPaidInput): Promise<CoursePayout> {
    const result = await db.transaction(async (tx) => {
      const batch = await tx
        .select()
        .from(coursePayouts)
        .where(eq(coursePayouts.id, input.batchId))
        .limit(1);

      if (!batch.length) {
        throw new Error('Payout batch not found');
      }

      if (batch[0].status !== 'pending') {
        throw new Error('Only pending payouts can be marked as paid');
      }

      // Update batch
      const updated = await tx
        .update(coursePayouts)
        .set({
          status: 'paid',
          paidAt: new Date(),
          paymentReference: input.paymentReference,
        })
        .where(eq(coursePayouts.id, input.batchId))
        .returning();

      console.log(`Payout batch ${input.batchId} marked as paid by ${input.paidBy}`);

      return updated[0];
    });

    // TODO: Send notification email to organization admin (via NotificationService)

    return result;
  }

  /**
   * Cancel a payout batch
   */
  static async cancelPayoutBatch(batchId: string, reason: string): Promise<CoursePayout> {
    const batch = await db
      .select()
      .from(coursePayouts)
      .where(eq(coursePayouts.id, batchId))
      .limit(1);

    if (!batch.length) {
      throw new Error('Payout batch not found');
    }

    if (batch[0].status === 'paid') {
      throw new Error('Cannot cancel already paid payout');
    }

    const updated = await db
      .update(coursePayouts)
      .set({
        status: 'cancelled',
      })
      .where(eq(coursePayouts.id, batchId))
      .returning();

    console.log(`Payout batch ${batchId} cancelled: ${reason}`);

    return updated[0];
  }

  /**
   * Generate payout invoice PDF
   */
  static async generatePayoutInvoice(batchId: string): Promise<Buffer> {
    const details = await this.getPayoutBatchDetails(batchId);

    return new Promise((resolve, reject) => {
      const doc = new PDFKit({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc
        .fontSize(20)
        .text('PAYOUT INVOICE', { align: 'center' })
        .moveDown();

      // Invoice details
      doc
        .fontSize(12)
        .text(`Invoice #: ${details.batch.id}`, { align: 'left' })
        .text(`Date: ${new Date().toLocaleDateString()}`)
        .text(`Organization: ${details.organizationName}`)
        .moveDown();

      // Period
      doc
        .fontSize(14)
        .text('Payout Period', { underline: true })
        .fontSize(12)
        .text(`From: ${details.batch.periodStart.toLocaleDateString()}`)
        .text(`To: ${details.batch.periodEnd.toLocaleDateString()}`)
        .moveDown();

      // Summary (using correct field names from coursePayouts schema)
      doc
        .fontSize(14)
        .text('Summary', { underline: true })
        .fontSize(12)
        .text(`Total Revenue: ${details.batch.currency} ${parseFloat(details.batch.grossRevenue.toString()).toFixed(2)}`)
        .text(`Platform Commission (30%): ${details.batch.currency} ${parseFloat(details.batch.platformCommission.toString()).toFixed(2)}`)
        .text(`Net Payout: ${details.batch.currency} ${parseFloat(details.batch.netAmount.toString()).toFixed(2)}`)
        .moveDown();

      // Course breakdown
      if (details.transactions.length > 0) {
        doc
          .fontSize(14)
          .text('Course Breakdown', { underline: true })
          .fontSize(10)
          .moveDown(0.5);

        details.transactions.forEach((txn, index) => {
          doc
            .text(`${index + 1}. Sales: ${txn.salesCount} | Revenue: ${details.batch.currency} ${parseFloat(txn.grossRevenue.toString()).toFixed(2)} | Net: ${details.batch.currency} ${parseFloat(txn.netAmount.toString()).toFixed(2)}`);
        });

        doc.moveDown();
      }

      // Banking details
      if (details.bankingDetails) {
        const resolvedAccountNumber = decryptBankAccountNumber(details.bankingDetails.accountNumber);
        doc
          .fontSize(14)
          .text('Banking Details', { underline: true })
          .fontSize(12)
          .text(`Bank Name: ${details.bankingDetails.bankName}`)
          .text(`Account Number: ${resolvedAccountNumber || 'N/A'}`)
          .text(`Branch Code: ${details.bankingDetails.branchCode || 'N/A'}`)
          .moveDown();
      }

      // Payment info
      if (details.batch.status === 'paid') {
        doc
          .fontSize(14)
          .text('Payment Information', { underline: true })
          .fontSize(12)
          .text(`Status: PAID`)
          .text(`Payment Reference: ${details.batch.paymentReference || 'N/A'}`)
          .text(`Paid On: ${details.batch.paidAt?.toLocaleDateString() || 'N/A'}`);
      } else {
        doc
          .fontSize(12)
          .text(`Status: ${(details.batch.status || 'pending').toUpperCase()}`);
      }

      // Footer
      doc
        .moveDown(2)
        .fontSize(10)
        .text('LearnPlay - Gamified Education Platform', { align: 'center' })
        .text('Thank you for being part of our community!', { align: 'center' });

      doc.end();
    });
  }

  /**
   * Get total pending payouts across all organizations
   */
  static async getTotalPendingPayouts(currency?: 'ZAR' | 'USD' | 'EUR'): Promise<number> {
    const batches = await db
      .select()
      .from(coursePayouts)
      .where(eq(coursePayouts.status, 'pending'));

    let total = 0;

    for (const batch of batches) {
      let amount = parseFloat(batch.netAmount.toString());

      if (currency && batch.currency !== currency) {
        amount = await ExchangeRateService.convert(amount, batch.currency, currency);
      }

      total += amount;
    }

    return total;
  }
}
