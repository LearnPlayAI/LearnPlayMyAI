import { db } from "../db";
import { postFulfillmentJobs, creditOrders, creditPurchasePackages, users, organizations } from "@shared/schema";
import { eq, and, sql, lte, or, isNull } from "drizzle-orm";
import { InvoiceService } from "./invoiceService";
import { MailerSendService } from "./mailerSendService";
import { EmailTemplates } from "./emailTemplates";

type PostFulfillmentJob = typeof postFulfillmentJobs.$inferSelect;
type JobType = "receipt_generation" | "confirmation_email" | "receipt_and_email";
type JobStatus = "pending" | "claimed" | "completed" | "failed" | "cancelled";

interface JobMetadata {
  orderId: string;
  purchaserId: string;
  organizationId: string;
  packageId: string;
  packageName: string;
  creditsAmount: number;
  amount: string;
  currency: string;
  purchaserName?: string;
  purchaserEmail?: string;
  organizationName?: string;
  paidAt: string;
}

interface CreateJobParams {
  orderId: string;
  jobType: JobType;
  metadata: JobMetadata;
}

const MAX_RETRIES = 3;
const CLAIM_TIMEOUT_MS = 120000; // 2 minutes - jobs stuck in claimed state are recovered
const BASE_RETRY_DELAY_MS = 30000; // 30 seconds base delay for exponential backoff

export class PostFulfillmentJobService {

  static async createJob(params: CreateJobParams): Promise<PostFulfillmentJob> {
    try {
      const [job] = await db
        .insert(postFulfillmentJobs)
        .values({
          orderId: params.orderId,
          jobType: params.jobType,
          status: "pending",
          retryCount: 0,
          maxRetries: MAX_RETRIES,
          metadata: params.metadata,
        })
        .onConflictDoNothing() // Idempotency: silently skip if job already exists
        .returning();

      if (job) {
        console.log(`[PostFulfillmentJobService] Created job ${job.id} for order ${params.orderId} (type: ${params.jobType})`);
        return job;
      }

      // Job already exists - fetch and return it
      const [existingJob] = await db
        .select()
        .from(postFulfillmentJobs)
        .where(and(
          eq(postFulfillmentJobs.orderId, params.orderId),
          eq(postFulfillmentJobs.jobType, params.jobType)
        ))
        .limit(1);

      console.log(`[PostFulfillmentJobService] Job already exists for order ${params.orderId} (type: ${params.jobType})`);
      return existingJob;
    } catch (error: any) {
      console.error(`[PostFulfillmentJobService] Failed to create job:`, error);
      throw error;
    }
  }

  static async getNextPendingJob(): Promise<PostFulfillmentJob | null> {
    return await db.transaction(async (tx) => {
      const now = new Date();
      
      // Find next pending job or job ready for retry (nextRetryAt <= now)
      const [pendingJob] = await tx
        .select()
        .from(postFulfillmentJobs)
        .where(and(
          or(
            eq(postFulfillmentJobs.status, "pending"),
            and(
              eq(postFulfillmentJobs.status, "claimed"),
              lte(postFulfillmentJobs.claimedAt, new Date(Date.now() - CLAIM_TIMEOUT_MS))
            )
          ),
          or(
            isNull(postFulfillmentJobs.nextRetryAt),
            lte(postFulfillmentJobs.nextRetryAt, now)
          )
        ))
        .orderBy(postFulfillmentJobs.createdAt)
        .limit(1)
        .for("update", { skipLocked: true });

      if (!pendingJob) {
        return null;
      }

      // Claim the job
      const [claimedJob] = await tx
        .update(postFulfillmentJobs)
        .set({
          status: "claimed" as JobStatus,
          claimedAt: now,
          updatedAt: now,
        })
        .where(eq(postFulfillmentJobs.id, pendingJob.id))
        .returning();

      return claimedJob || null;
    });
  }

  static async processJob(job: PostFulfillmentJob): Promise<boolean> {
    const metadata = job.metadata as JobMetadata;
    
    try {
      console.log(`[PostFulfillmentJobService] Processing job ${job.id} (type: ${job.jobType})`);

      let receiptPath: string | undefined;
      let emailSent = false;

      // Handle receipt generation
      if (job.jobType === "receipt_generation" || job.jobType === "receipt_and_email") {
        receiptPath = await this.generateReceipt(metadata);
        
        if (receiptPath) {
          // Update the credit order with the receipt path
          await db.update(creditOrders)
            .set({ 
              receiptPdfPath: receiptPath, 
              updatedAt: new Date() 
            })
            .where(eq(creditOrders.id, metadata.orderId));
          
          console.log(`[PostFulfillmentJobService] Receipt generated and order updated: ${receiptPath}`);
        }
      }

      // Handle email sending
      if (job.jobType === "confirmation_email" || job.jobType === "receipt_and_email") {
        emailSent = await this.sendConfirmationEmail(metadata, receiptPath);
      }

      // Mark job as completed
      await db.update(postFulfillmentJobs)
        .set({
          status: "completed" as JobStatus,
          completedAt: new Date(),
          resultData: { receiptPath, emailSent },
          updatedAt: new Date(),
        })
        .where(eq(postFulfillmentJobs.id, job.id));

      console.log(`[PostFulfillmentJobService] Job ${job.id} completed successfully`);
      return true;

    } catch (error: any) {
      console.error(`[PostFulfillmentJobService] Job ${job.id} failed:`, error.message);
      return await this.handleJobFailure(job, error.message);
    }
  }

  private static async generateReceipt(metadata: JobMetadata): Promise<string | undefined> {
    try {
      const receiptResult = await InvoiceService.generateStandaloneReceipt({
        orderId: metadata.orderId,
        purchaserId: metadata.purchaserId,
        organizationId: metadata.organizationId,
        packageName: metadata.packageName,
        creditsAmount: metadata.creditsAmount,
        amount: metadata.amount,
        currency: metadata.currency,
        paidAt: new Date(metadata.paidAt),
      });

      if (receiptResult.success && receiptResult.pdfPath) {
        return receiptResult.pdfPath;
      } else {
        throw new Error(receiptResult.error || 'Receipt generation failed');
      }
    } catch (error: any) {
      console.error(`[PostFulfillmentJobService] Receipt generation error:`, error.message);
      throw error;
    }
  }

  private static async sendConfirmationEmail(metadata: JobMetadata, receiptPath?: string): Promise<boolean> {
    try {
      if (!metadata.purchaserEmail) {
        console.log(`[PostFulfillmentJobService] No email address for purchaser ${metadata.purchaserId} - skipping email`);
        return false;
      }

      await EmailTemplates.sendCreditConfirmation({
        receiptId: metadata.orderId,
        recipientEmail: metadata.purchaserEmail,
        recipientName: metadata.purchaserName || 'Customer',
        creditsAmount: metadata.creditsAmount,
        totalPaid: metadata.amount,
        currency: metadata.currency,
      });

      console.log(`[PostFulfillmentJobService] Sent confirmation email to ${metadata.purchaserEmail}`);
      return true;
    } catch (error: any) {
      console.error(`[PostFulfillmentJobService] Email sending error:`, error.message);
      throw error;
    }
  }

  private static async handleJobFailure(job: PostFulfillmentJob, errorMessage: string): Promise<boolean> {
    const retryCount = (job.retryCount || 0) + 1;
    const maxRetries = job.maxRetries || MAX_RETRIES;
    const shouldRetry = retryCount < maxRetries;

    if (shouldRetry) {
      // Calculate next retry with exponential backoff
      const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, retryCount - 1);
      const nextRetryAt = new Date(Date.now() + delayMs);

      await db.update(postFulfillmentJobs)
        .set({
          status: "pending" as JobStatus,
          retryCount,
          lastAttemptAt: new Date(),
          nextRetryAt,
          errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(postFulfillmentJobs.id, job.id));

      console.log(`[PostFulfillmentJobService] Job ${job.id} scheduled for retry ${retryCount}/${maxRetries} at ${nextRetryAt.toISOString()}`);
      return false;
    } else {
      // Move to DLQ (mark as failed permanently)
      await db.update(postFulfillmentJobs)
        .set({
          status: "failed" as JobStatus,
          retryCount,
          lastAttemptAt: new Date(),
          errorMessage: `Permanent failure after ${maxRetries} retries: ${errorMessage}`,
          updatedAt: new Date(),
        })
        .where(eq(postFulfillmentJobs.id, job.id));

      console.error(`[PostFulfillmentJobService] Job ${job.id} permanently failed (DLQ) after ${maxRetries} retries`);
      return false;
    }
  }

  static async recoverAbandonedJobs(): Promise<number> {
    const claimCutoff = new Date(Date.now() - CLAIM_TIMEOUT_MS);

    const abandonedJobs = await db
      .select()
      .from(postFulfillmentJobs)
      .where(and(
        eq(postFulfillmentJobs.status, "claimed"),
        lte(postFulfillmentJobs.claimedAt, claimCutoff)
      ));

    if (abandonedJobs.length === 0) {
      return 0;
    }

    console.log(`[PostFulfillmentJobService] Found ${abandonedJobs.length} abandoned jobs - recovering...`);

    for (const job of abandonedJobs) {
      await db.update(postFulfillmentJobs)
        .set({
          status: "pending" as JobStatus,
          claimedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(postFulfillmentJobs.id, job.id));

      console.log(`[PostFulfillmentJobService] Recovered abandoned job ${job.id}`);
    }

    return abandonedJobs.length;
  }

  static async cleanupOldJobs(maxAgeDays: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

    const result = await db
      .delete(postFulfillmentJobs)
      .where(and(
        or(
          eq(postFulfillmentJobs.status, "completed"),
          eq(postFulfillmentJobs.status, "cancelled")
        ),
        lte(postFulfillmentJobs.createdAt, cutoffDate)
      ))
      .returning();

    if (result.length > 0) {
      console.log(`[PostFulfillmentJobService] Cleaned up ${result.length} old jobs`);
    }

    return result.length;
  }

  static async getJobStats(): Promise<{
    pending: number;
    claimed: number;
    completed: number;
    failed: number;
  }> {
    const stats = await db
      .select({
        status: postFulfillmentJobs.status,
        count: sql<number>`count(*)::int`,
      })
      .from(postFulfillmentJobs)
      .groupBy(postFulfillmentJobs.status);

    const result = { pending: 0, claimed: 0, completed: 0, failed: 0 };
    for (const stat of stats) {
      if (stat.status in result) {
        result[stat.status as keyof typeof result] = stat.count;
      }
    }

    return result;
  }

  static async getFailedJobs(limit: number = 50): Promise<PostFulfillmentJob[]> {
    return await db
      .select()
      .from(postFulfillmentJobs)
      .where(eq(postFulfillmentJobs.status, "failed"))
      .orderBy(postFulfillmentJobs.updatedAt)
      .limit(limit);
  }

  static async retryFailedJob(jobId: string): Promise<PostFulfillmentJob | null> {
    const [job] = await db
      .select()
      .from(postFulfillmentJobs)
      .where(eq(postFulfillmentJobs.id, jobId))
      .limit(1);

    if (!job || job.status !== "failed") {
      return null;
    }

    const [updated] = await db
      .update(postFulfillmentJobs)
      .set({
        status: "pending" as JobStatus,
        retryCount: 0,
        nextRetryAt: null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(postFulfillmentJobs.id, jobId))
      .returning();

    console.log(`[PostFulfillmentJobService] Retrying failed job ${jobId}`);
    return updated;
  }

  static async enqueueReceiptAndEmailJob(orderContext: {
    orderId: string;
    purchaserId: string;
    organizationId: string;
    packageId: string;
    packageName: string;
    creditsAmount: number;
    amount: string;
    currency: string;
    purchaserName?: string;
    purchaserEmail?: string;
    organizationName?: string;
  }): Promise<PostFulfillmentJob> {
    return this.createJob({
      orderId: orderContext.orderId,
      jobType: "receipt_and_email",
      metadata: {
        ...orderContext,
        paidAt: new Date().toISOString(),
      },
    });
  }
}
