import { db } from "../db";
import { pendingGammaJobs, lessons, lessonSlides, lessonQuizLinks, lessonPresentationVersions, lessonTranslationJobs } from "@shared/schema";
import { eq, and, or, sql, inArray, desc } from "drizzle-orm";
import { GammaService } from "./gammaService";
import { LessonService } from "./lessonService";
import { CreditService } from "./creditService";
import { ObjectStorageService } from "../objectStorage";
import { compressPPTX } from "../utils/pptxCompressor";
import { aiEnrichmentService, EnrichedSlide } from "./aiEnrichmentService";
import { CourseContextService, type LessonSummary } from "./courseContextService";
import { markQuizzesAsOutdated } from "../routes/quizRoutes";
import { PptxHtmlConverterService } from "./pptxHtmlConverterService";
import fs from "fs";
import path from "path";
import os from "os";

type Job = typeof pendingGammaJobs.$inferSelect;
type JobStatus = "pending" | "claimed" | "polling" | "completed" | "failed";

interface CreateJobParams {
  organizationId: string;
  lessonId: string;
  metadata?: Record<string, any>;
}

/**
 * JobQueueService - Background job processing for Gamma API
 * Handles creation, polling, and completion of lesson generation jobs
 */
export class JobQueueService {
  private static readonly MAX_RETRIES = 0; // CRITICAL: No auto-retries - each retry costs real money on Gamma API
  private static readonly POLL_INTERVAL_MS = 10000; // 10 seconds
  private static readonly MAX_POLL_AGE_MS = 3600000; // 1 hour
  private static readonly MIN_WORDS_FOR_GENERATION = 200; // Aligned with framework generation requirement
  private static readonly PPTX_PRECONVERT_TIMEOUT_MS = 90000; // best effort pre-warm before completion

  /**
   * GAP 5 FIX: Compose enriched Gamma payload with Bloom objectives, key terms, and course context
   * This ensures the AI generator has full pedagogical context, not just raw text
   * 
   * OVERVIEW LESSON ENHANCEMENT: For overview lessons (isOverview=true or topicOrder=0),
   * includes a Course Outline section with summaries of all other lessons in the course
   * to help AI create a presentation that introduces the full course scope.
   */
  private static composeGammaPayload(
    lesson: any,
    sourceContent: string,
    metadata: Record<string, any>
  ): string {
    const parts: string[] = [];
    
    // Add course context if available
    if (metadata.courseTitle || metadata.courseDescription) {
      parts.push(`## Course Context`);
      if (metadata.courseTitle) parts.push(`Course: ${metadata.courseTitle}`);
      if (metadata.courseDescription) parts.push(`Description: ${metadata.courseDescription}`);
      if (metadata.targetAudience) parts.push(`Target Audience: ${metadata.targetAudience}`);
      parts.push('');
    }
    
    // Add lesson position context
    if (metadata.lessonIndex !== undefined || metadata.totalLessons !== undefined) {
      parts.push(`## Lesson Position`);
      parts.push(`This is lesson ${(metadata.lessonIndex || 0) + 1} of ${metadata.totalLessons || 'the course'}.`);
      if (lesson.isOverview || metadata.isOverview) parts.push(`This is the course overview/introduction lesson.`);
      parts.push('');
    }
    
    // OVERVIEW LESSON ENHANCEMENT: Add Course Outline for overview lessons
    // Detected via metadata.isOverview=true or metadata.otherLessonsSummaries being present
    const isOverviewLesson = lesson.isOverview || metadata.isOverview === true;
    const otherLessonsSummaries = metadata.otherLessonsSummaries as LessonSummary[] | undefined;
    
    if (isOverviewLesson && otherLessonsSummaries && otherLessonsSummaries.length > 0) {
      const courseOutline = CourseContextService.formatSummariesForGamma(otherLessonsSummaries);
      if (courseOutline && courseOutline.trim().length > 0) {
        parts.push(courseOutline);
        console.log(`[JobQueueService] Added Course Outline section with ${otherLessonsSummaries.length} lesson summaries for overview lesson`);
      }
    }
    
    // Add Bloom's Taxonomy learning objectives if available
    const learningObjectives = lesson.learningObjectives || lesson.gammaLearningObjectives;
    if (learningObjectives && Array.isArray(learningObjectives) && learningObjectives.length > 0) {
      parts.push(`## Learning Objectives (Bloom's Taxonomy)`);
      for (const obj of learningObjectives) {
        const bloomLevel = obj.bloomLevel ? `[${obj.bloomLevel.toUpperCase()}]` : '';
        parts.push(`- ${bloomLevel} ${obj.objective || obj}`);
      }
      parts.push('');
    } else if (lesson.objectives && Array.isArray(lesson.objectives)) {
      parts.push(`## Learning Objectives`);
      for (const obj of lesson.objectives) {
        parts.push(`- ${obj}`);
      }
      parts.push('');
    }
    
    // Add key terms if available
    const keyTerms = lesson.keyTerms || lesson.gammaKeyTerms;
    if (keyTerms && Array.isArray(keyTerms) && keyTerms.length > 0) {
      parts.push(`## Key Terms & Vocabulary`);
      parts.push(keyTerms.join(', '));
      parts.push('');
    }
    
    // Add the main lesson content
    parts.push(`## Lesson: ${lesson.title || 'Untitled Lesson'}`);
    if (lesson.description && lesson.description !== sourceContent) {
      parts.push(`Summary: ${lesson.description}`);
      parts.push('');
    }
    
    // Add source content as the main body
    parts.push(`## Content`);
    parts.push(sourceContent);
    
    const composedPayload = parts.join('\n');
    
    // Store generation payload for audit (attached to lesson metadata)
    console.log(`[JobQueueService] Composed Gamma payload: ${composedPayload.length} chars with ${parts.length - 1} sections${isOverviewLesson ? ' (overview lesson)' : ''}`);
    
    return composedPayload;
  }

  /**
   * Validate lesson content is sufficient for generation (GAP 6 pre-check)
   */
  static validateLessonContent(lesson: any): { valid: boolean; error?: string; wordCount: number } {
    const inputText = lesson.inputText || '';
    const wordCount = inputText.split(/\s+/).filter((w: string) => w.length > 0).length;
    
    if (!inputText || inputText.trim().length === 0) {
      return { valid: false, error: 'CONTENT_MISSING: No source content available', wordCount: 0 };
    }
    
    if (wordCount < this.MIN_WORDS_FOR_GENERATION) {
      return { 
        valid: false, 
        error: `CONTENT_INSUFFICIENT: Only ${wordCount} words (minimum ${this.MIN_WORDS_FOR_GENERATION} required)`, 
        wordCount 
      };
    }
    
    return { valid: true, wordCount };
  }

  /**
   * Create a new job for lesson generation
   * Note: gammaGenerationId is initially empty and populated when processPendingJob initiates generation
   * Accepts optional txClient for use in shared transactions
   */
  static async createJob(params: CreateJobParams, txClient?: any): Promise<Job> {
    const dbConn = txClient || db;
    
    const [job] = await dbConn
      .insert(pendingGammaJobs)
      .values({
        organizationId: params.organizationId,
        lessonId: params.lessonId,
        gammaGenerationId: null, // Will be populated after Gamma API call
        status: "pending",
        retryCount: 0,
        metadata: params.metadata || {},
      })
      .returning();

    await LessonService.updateGenerationStatus(params.lessonId, "pending", undefined, dbConn);

    console.log(`[JobQueueService] Created job ${job.id} for lesson ${params.lessonId}`);

    return job;
  }

  /**
   * Get a job by ID
   */
  static async getJob(jobId: string): Promise<Job | null> {
    const [job] = await db
      .select()
      .from(pendingGammaJobs)
      .where(eq(pendingGammaJobs.id, jobId))
      .limit(1);

    return job || null;
  }

  /**
   * Get all jobs for a lesson
   */
  static async getJobsForLesson(lessonId: string): Promise<Job[]> {
    return await db
      .select()
      .from(pendingGammaJobs)
      .where(eq(pendingGammaJobs.lessonId, lessonId))
      .orderBy(desc(pendingGammaJobs.createdAt));
  }

  /**
   * Cancel and clean up all active jobs for a lesson before starting a new generation
   * This resets the lesson status and marks any pending/polling/claimed jobs as "superseded"
   * Used when user wants to regenerate a lesson - ensures clean slate for new generation
   * 
   * IMPORTANT: For jobs in "polling" status with a Gamma generation in progress,
   * this method reconciles any credits that Gamma may have already consumed.
   * This prevents revenue leak when users regenerate lessons before completion.
   * 
   * Returns the number of jobs that were canceled
   */
  static async cancelActiveJobsForLesson(
    lessonId: string, 
    txClient?: any
  ): Promise<{ canceledCount: number; canceledJobIds: string[] }> {
    const dbConn = txClient || db;
    
    // Find all active jobs for this lesson
    const activeJobs = await dbConn
      .select()
      .from(pendingGammaJobs)
      .where(
        and(
          eq(pendingGammaJobs.lessonId, lessonId),
          or(
            eq(pendingGammaJobs.status, "pending"),
            eq(pendingGammaJobs.status, "claimed"),
            eq(pendingGammaJobs.status, "polling")
          )
        )
      );

    if (activeJobs.length === 0) {
      console.log(`[JobQueueService] No active jobs to cancel for lesson ${lessonId}`);
      return { canceledCount: 0, canceledJobIds: [] };
    }

    const jobIds = activeJobs.map((j: { id: string }) => j.id);
    
    // Collect polling jobs for credit reconciliation
    const pollingJobsWithGamma = activeJobs.filter(
      (j: { status: string; gammaGenerationId: string | null }) => j.status === 'polling' && j.gammaGenerationId
    );

    // STEP 1: Mark all active jobs as failed FIRST
    // This prevents pollJob from charging credits (its atomic update checks status='polling')
    await dbConn
      .update(pendingGammaJobs)
      .set({
        status: "failed" as JobStatus,
        errorMessage: "Superseded by new generation request",
        updatedAt: new Date(),
      })
      .where(inArray(pendingGammaJobs.id, jobIds));

    console.log(
      `[JobQueueService] Marked ${activeJobs.length} job(s) as failed for lesson ${lessonId}: ` +
      `${jobIds.join(", ")}`
    );

    // STEP 2: Credit reconciliation for jobs that had active Gamma generations
    // This runs AFTER status change, so pollJob's atomic update (which checks status='polling') will fail
    // Uses atomic compare-and-set to prevent double-charging even if reconciliation runs concurrently
    for (const job of pollingJobsWithGamma) {
      // Re-fetch the job to get current metadata state (pollJob may have modified it)
      const currentJob = await this.getJob(job.id);
      if (!currentJob) {
        console.warn(`[JobQueueService] ⚠️ Job ${job.id} no longer exists - skipping reconciliation`);
        continue;
      }
      
      const metadata = currentJob.metadata as Record<string, any> || {};
      const userId = metadata.userId;
      
      // Skip if no userId (can't charge)
      if (!userId) {
        console.warn(
          `[JobQueueService] ⚠️ Cannot charge for superseded job ${job.id}: no userId in metadata`
        );
        continue;
      }
      
      try {
        console.log(
          `[JobQueueService] Reconciling credits for superseded polling job ${job.id} ` +
          `(gammaGenerationId: ${currentJob.gammaGenerationId})`
        );
        
        const gammaService = await GammaService.getInstance();
        const status = await gammaService.checkGenerationStatus(currentJob.gammaGenerationId!);
        
        // Check if Gamma provided credit information
        const creditDataProvided = status.credits?.deducted !== undefined;
        const actualCost = status.credits?.deducted ?? 0;
        
        // If Gamma didn't provide credit data, skip reconciliation for this job (needs manual review)
        if (!creditDataProvided) {
          console.warn(
            `[JobQueueService] ⚠️ Gamma did not provide credit data for superseded job ${job.id} - ` +
            `skipping reconciliation (manual review needed)`
          );
          continue;
        }
        
        if (actualCost > 0) {
          // ATOMIC COMPARE-AND-SET: Claim charging rights BEFORE charging
          // Matches when: creditsCharged IS NULL, = false, or claimRolledBack = true (pollJob surrendered)
          // Explicitly clears claimRolledBack to prevent re-claims
          // This ensures exactly one process bills the user
          const supersededAt = new Date().toISOString();
          const claimResult = await db
            .update(pendingGammaJobs)
            .set({
              metadata: sql`${pendingGammaJobs.metadata} || jsonb_build_object('creditsCharged', true, 'claimRolledBack', false, 'reconciledBy', 'superseded', 'actualGammaCost', ${actualCost}::int, 'supersededAt', ${supersededAt}::text)`
            })
            .where(
              and(
                eq(pendingGammaJobs.id, job.id),
                or(
                  sql`${pendingGammaJobs.metadata}->>'creditsCharged' IS NULL`,
                  sql`${pendingGammaJobs.metadata}->>'creditsCharged' = 'false'`,
                  sql`${pendingGammaJobs.metadata}->>'claimRolledBack' = 'true'`
                )
              )
            )
            .returning();
          
          if (claimResult.length === 0) {
            console.log(
              `[JobQueueService] ℹ️ Credits already charged for superseded job ${job.id} - skipping`
            );
            continue;
          }
          
          // Successfully claimed - now charge the user
          console.log(
            `[JobQueueService] Superseded job ${job.id} consumed ${actualCost} Gamma credits - ` +
            `charging user ${userId}`
          );
          
          await CreditService.chargeForGammaUsage(
            userId,
            currentJob.organizationId,
            actualCost,
            currentJob.lessonId,
            currentJob.gammaGenerationId!,
            { superseded: true, gammaStatus: status.status },
            true, // isRegeneration = true
            metadata.isFromDocument || false
          );
          
          // ACCUMULATE lesson creditsUsed (add to existing)
          await db
            .update(lessons)
            .set({ 
              creditsUsed: sql`COALESCE(${lessons.creditsUsed}, 0) + ${actualCost}` 
            })
            .where(eq(lessons.id, currentJob.lessonId));
          
          console.log(
            `[JobQueueService] ✅ Charged ${actualCost} credits for superseded job ${job.id}`
          );
          
          // Record Gamma snapshot for SuperAdmin reconciliation
          if (status.credits?.remaining !== undefined) {
            try {
              await CreditService.recordGammaSnapshot(
                status.credits.remaining,
                'superseded_job_reconciliation',
                currentJob.gammaGenerationId!,
                { actualCost, lessonId: currentJob.lessonId, superseded: true }
              );
              console.log(
                `[JobQueueService] ✅ Recorded Gamma snapshot for superseded job ${job.id}: ` +
                `balance=${status.credits.remaining}`
              );
            } catch (snapshotError) {
              console.error(
                `[JobQueueService] ⚠️ Failed to record Gamma snapshot for superseded job ${job.id}:`,
                snapshotError
              );
            }
          }
        } else {
          console.log(
            `[JobQueueService] ℹ️ Superseded job ${job.id} consumed 0 credits (no charge needed)`
          );
        }
      } catch (creditError) {
        console.error(
          `[JobQueueService] ❌ Failed to reconcile credits for superseded job ${job.id}:`,
          creditError
        );
        // Continue - credit reconciliation failure shouldn't break the flow
      }
    }

    return { canceledCount: activeJobs.length, canceledJobIds: jobIds };
  }

  /**
   * Create a new job for lesson generation with automatic cleanup of previous jobs
   * Combines cancelActiveJobsForLesson + createJob in a single transaction
   * Use this for regeneration scenarios where old jobs should be superseded
   * Includes retry logic with exponential backoff for transient DB errors (TASK 2b)
   * 
   * CRITICAL: Cancel + create are wrapped in a transaction per attempt to prevent race conditions
   * with the UNQ_active_job_per_lesson partial unique index
   */
  static async createJobWithCleanup(params: CreateJobParams, txClient?: any): Promise<Job> {
    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 100; // Base delay for exponential backoff
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // If we have an outer transaction client, use it; otherwise create a new transaction
        // This ensures cancel + create are atomic to prevent race conditions
        if (txClient) {
          // Already in a transaction - use the provided client
          const { canceledCount } = await this.cancelActiveJobsForLesson(params.lessonId, txClient);
          
          if (canceledCount > 0) {
            console.log(
              `[JobQueueService] Cleaned up ${canceledCount} previous job(s) before creating new job for lesson ${params.lessonId}`
            );
          }
          
          return await this.createJob(params, txClient);
        } else {
          // Create a new transaction for atomicity
          return await db.transaction(async (tx) => {
            const { canceledCount } = await this.cancelActiveJobsForLesson(params.lessonId, tx);
            
            if (canceledCount > 0) {
              console.log(
                `[JobQueueService] Cleaned up ${canceledCount} previous job(s) before creating new job for lesson ${params.lessonId}`
              );
            }
            
            return await this.createJob(params, tx);
          });
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Check if this is a unique constraint violation (race condition with another request)
        const isUniqueViolation = lastError.message.includes('unique') || 
                                  lastError.message.includes('duplicate') ||
                                  lastError.message.includes('UNQ_active_job_per_lesson');
        
        if (attempt < MAX_RETRIES && isUniqueViolation) {
          // Exponential backoff with jitter: base * 2^attempt + random(0-50ms)
          const jitterMs = Math.floor(Math.random() * 50);
          const delayMs = BASE_DELAY_MS * Math.pow(2, attempt - 1) + jitterMs;
          console.log(
            `[JobQueueService] Unique constraint violation on attempt ${attempt}/${MAX_RETRIES} ` +
            `for lesson ${params.lessonId}. Retrying in ${delayMs}ms...`
          );
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        
        // Non-retriable error or max retries exceeded
        console.error(
          `[JobQueueService] Failed to create job for lesson ${params.lessonId} after ${attempt} attempt(s):`,
          lastError.message
        );
        throw lastError;
      }
    }
    
    // Should never reach here, but TypeScript needs this
    throw lastError || new Error('Failed to create job after retries');
  }

  /**
   * Check if a user has any active (pending, claimed, or polling) lesson generation jobs
   * Used to enforce one-at-a-time generation policy to prevent credit overuse
   */
  static async hasActiveJobForUser(userId: string): Promise<{ hasActive: boolean; activeJob: Job | null }> {
    // Query for jobs with this userId in metadata that are still active
    const activeJobs = await db
      .select()
      .from(pendingGammaJobs)
      .where(
        and(
          or(
            eq(pendingGammaJobs.status, "pending"),
            eq(pendingGammaJobs.status, "claimed"),
            eq(pendingGammaJobs.status, "polling")
          ),
          sql`${pendingGammaJobs.metadata}->>'userId' = ${userId}`
        )
      )
      .orderBy(desc(pendingGammaJobs.createdAt))
      .limit(1);

    if (activeJobs.length > 0) {
      console.log(`[JobQueueService] User ${userId} has active job: ${activeJobs[0].id} (status: ${activeJobs[0].status})`);
      return { hasActive: true, activeJob: activeJobs[0] };
    }

    return { hasActive: false, activeJob: null };
  }

  /**
   * Get the next pending job to process
   * Uses SELECT FOR UPDATE SKIP LOCKED then UPDATE to atomically claim job
   * CRITICAL FIX: Two-step atomic operation prevents race conditions
   */
  static async getNextPendingJob(): Promise<Job | null> {
    return await db.transaction(async (tx) => {
      // Step 1: SELECT FOR UPDATE SKIP LOCKED to find and lock the next pending job
      const [pendingJob] = await tx
        .select()
        .from(pendingGammaJobs)
        .where(eq(pendingGammaJobs.status, "pending"))
        .orderBy(pendingGammaJobs.createdAt)
        .limit(1)
        .for("update", { skipLocked: true });

      if (!pendingJob) {
        return null;
      }

      // Step 2: UPDATE the specific job to "claimed" status
      const [claimedJob] = await tx
        .update(pendingGammaJobs)
        .set({ 
          status: "claimed" as JobStatus,
          updatedAt: new Date()
        })
        .where(eq(pendingGammaJobs.id, pendingJob.id))
        .returning();

      return claimedJob || null;
    });
  }

  /**
   * Get all jobs that need polling
   * Returns jobs in "polling" status that were last polled > POLL_INTERVAL_MS ago
   * Note: Stuck jobs (polling > MAX_POLL_AGE_MS) are handled by failStuckJobs
   */
  static async getJobsNeedingPoll(): Promise<Job[]> {
    const pollCutoff = new Date(Date.now() - this.POLL_INTERVAL_MS);

    return await db
      .select()
      .from(pendingGammaJobs)
      .where(
        and(
          eq(pendingGammaJobs.status, "polling"),
          or(
            sql`${pendingGammaJobs.lastPolledAt} IS NULL`,
            sql`${pendingGammaJobs.lastPolledAt} < ${pollCutoff}`
          )
          // HIGH FIX #7: Removed age cutoff - failStuckJobs handles timeout detection via firstPollingAt
        )
      )
      .orderBy(pendingGammaJobs.lastPolledAt);
  }

  /**
   * CRITICAL FIX: Recover abandoned claimed jobs (worker crashed after claiming)
   * Reverts jobs stuck in "claimed" status for > 2 minutes back to "pending"
   */
  static async recoverAbandonedClaimedJobs(): Promise<void> {
    const CLAIM_TIMEOUT_MS = 120000; // 2 minutes
    const claimCutoff = new Date(Date.now() - CLAIM_TIMEOUT_MS);

    const abandonedJobs = await db
      .select()
      .from(pendingGammaJobs)
      .where(
        and(
          eq(pendingGammaJobs.status, "claimed"),
          sql`${pendingGammaJobs.updatedAt} <= ${claimCutoff}`
        )
      );

    if (abandonedJobs.length === 0) {
      return;
    }

    console.log(
      `[JobQueueService] Found ${abandonedJobs.length} abandoned claimed jobs - recovering...`
    );

    for (const job of abandonedJobs) {
      try {
        await db
          .update(pendingGammaJobs)
          .set({
            status: "pending",
            updatedAt: new Date(),
          })
          .where(eq(pendingGammaJobs.id, job.id));

        console.log(
          `[JobQueueService] Recovered abandoned job ${job.id} (claimed for ${Math.floor((Date.now() - new Date(job.updatedAt || Date.now()).getTime()) / 1000)}s)`
        );
      } catch (error) {
        console.error(
          `[JobQueueService] Failed to recover abandoned job ${job.id}:`,
          error
        );
      }
    }
  }

  /**
   * HIGH FIX #7: Find and mark stuck jobs as failed (polling for > 1 hour)
   * Uses firstPollingAt timestamp to detect jobs stuck in polling state
   * Retried jobs get fresh timeout window since firstPollingAt is reset
   */
  static async failStuckJobs(): Promise<void> {
    // Query candidate polling jobs; perform definitive timeout check in application code.
    // This avoids false positives from timestamp/session-timezone conversion edge-cases.
    const pollingJobs = await db
      .select()
      .from(pendingGammaJobs)
      .where(
        and(
          eq(pendingGammaJobs.status, "polling"),
          sql`${pendingGammaJobs.firstPollingAt} IS NOT NULL`
        )
      );

    if (pollingJobs.length === 0) {
      return;
    }

    const stuckJobs = pollingJobs.filter((job) => {
      if (!job.firstPollingAt) return false;
      const ageMs = Date.now() - new Date(job.firstPollingAt).getTime();
      return ageMs >= this.MAX_POLL_AGE_MS;
    });

    if (stuckJobs.length === 0) {
      return;
    }

    console.log(
      `[JobQueueService] Found ${stuckJobs.length} stuck jobs (polling > ${this.MAX_POLL_AGE_MS}ms)`
    );

    for (const job of stuckJobs) {
      if (!job.firstPollingAt) continue; // Safety check

      const ageMs = Date.now() - new Date(job.firstPollingAt).getTime();
      const ageMinutes = Math.floor(ageMs / 60000);
      
      try {
        await this.markJobFailed(
          job.id,
          `Job timed out after ${ageMinutes} minutes in polling state (max: ${this.MAX_POLL_AGE_MS / 60000} minutes)`
        );
        console.log(
          `[JobQueueService] Marked stuck job ${job.id} as failed (polling time: ${ageMinutes}m)`
        );
      } catch (error) {
        console.error(
          `[JobQueueService] Failed to mark stuck job ${job.id} as failed:`,
          error
        );
      }
    }
  }

  /**
   * Mark job as polling (started Gamma generation)
   * HIGH FIX #7: Sets firstPollingAt timestamp for timeout tracking
   * CRITICAL DEMO FIX: Only transitions if status is pending/claimed (prevents duplicate execution)
   */
  static async markJobPolling(jobId: string): Promise<Job> {
    const now = new Date();
    
    // CRITICAL: Atomically transition ONLY if status is pending or claimed
    // This prevents multiple workers from processing the same job
    const [updated] = await db
      .update(pendingGammaJobs)
      .set({
        status: "polling",
        lastPolledAt: now,
        firstPollingAt: now, // HIGH FIX #7: Set timestamp when entering polling state
        updatedAt: now,
      })
      .where(
        and(
          eq(pendingGammaJobs.id, jobId),
          or(
            eq(pendingGammaJobs.status, "pending"),
            eq(pendingGammaJobs.status, "claimed")
          )
        )
      )
      .returning();

    // If no row was updated, job was already claimed by another worker
    if (!updated) {
      throw new Error(`Job ${jobId} already being processed by another worker`);
    }

    const [job] = await db
      .select()
      .from(pendingGammaJobs)
      .where(eq(pendingGammaJobs.id, jobId))
      .limit(1);

    if (job) {
      await LessonService.updateGenerationStatus(job.lessonId, "processing");
    }

    console.log(`[JobQueueService] Marked job ${jobId} as polling (timeout window starts)`);

    return updated;
  }

  /**
   * Update last polled timestamp
   */
  static async updateLastPolled(jobId: string): Promise<void> {
    await db
      .update(pendingGammaJobs)
      .set({
        lastPolledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(pendingGammaJobs.id, jobId));
  }

  /**
   * Mark job as completed
   */
  static async markJobCompleted(jobId: string): Promise<Job> {
    const [updated] = await db
      .update(pendingGammaJobs)
      .set({
        status: "completed",
        updatedAt: new Date(),
      })
      .where(eq(pendingGammaJobs.id, jobId))
      .returning();

    const [job] = await db
      .select()
      .from(pendingGammaJobs)
      .where(eq(pendingGammaJobs.id, jobId))
      .limit(1);

    if (job) {
      await LessonService.updateGenerationStatus(job.lessonId, "completed");

      try {
        await db.update(lessonTranslationJobs)
          .set({ currentStep: 'pptx_generated', updatedAt: new Date() })
          .where(eq(lessonTranslationJobs.lessonId, job.lessonId));
      } catch (e) {
      }

      // Translation publish remains an explicit user action.
      // Completing PPTX generation must never auto-publish translated lessons.
    }

    console.log(`[JobQueueService] Completed job ${jobId}`);

    return updated;
  }

  /**
   * CRITICAL FIX: Mark job as failed immediately with no auto-retries
   * IMPORTANT: Auto-retries were disabled because each Gamma API call costs real money.
   * Users can manually regenerate lessons if they choose.
   * 
   * Behavior:
   * - Always marks job as "failed" (MAX_RETRIES = 0 means no automatic retries)
   * - Updates lesson status to "failed" with clear error message
   * - Refunds credits if they were deducted for this generation
   * - User sees error immediately and can choose to regenerate manually
   */
  static async markJobFailed(
    jobId: string,
    error: string
  ): Promise<Job> {
    const job = await this.getJob(jobId);
    
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // CRITICAL: Always mark as "failed" immediately (no retries)
    // Since MAX_RETRIES = 0, we never queue jobs for retry
    const [updated] = await db
      .update(pendingGammaJobs)
      .set({
        status: "failed",
        errorMessage: error,
        updatedAt: new Date(),
      })
      .where(eq(pendingGammaJobs.id, jobId))
      .returning();

    // Update lesson status to failed with clear error message for user
    await LessonService.updateGenerationStatus(job.lessonId, "failed", error);

    // Refund credits on failure (preserve credit safety)
    // Extract credit refund data from job metadata
    const metadata = job.metadata as any;
    if (metadata?.userId && metadata?.creditsDeducted && metadata?.creditTransactionId) {
      try {
        await CreditService.refundCredits(
          metadata.userId,
          job.organizationId,
          metadata.creditsDeducted,
          job.lessonId,
          `Lesson generation failed: ${error}`,
          metadata.creditTransactionId
        );
        console.log(
          `[JobQueueService] Refunded ${metadata.creditsDeducted} credits to user ${metadata.userId} for failed job ${jobId}`
        );
      } catch (refundError) {
        console.error(
          `[JobQueueService] Failed to refund credits for job ${jobId}:`,
          refundError
        );
        // Don't fail the job marking if refund fails - log error for manual intervention
      }
    } else {
      console.warn(
        `[JobQueueService] No credit refund data found in job ${jobId} metadata. Credits may not have been deducted or metadata is incomplete.`
      );
    }

    console.log(
      `[JobQueueService] ❌ Job ${jobId} marked as failed: ${error}. User can manually regenerate if desired.`
    );

    return updated;
  }

  /**
   * Store enriched slides in the lessonSlides table and update lesson's currentSlideVersion
   * This creates or replaces enriched slide content for a lesson
   * Also marks any linked quizzes as outdated since slides have changed
   */
  static async storeEnrichedSlides(
    lessonId: string,
    enrichedSlides: EnrichedSlide[],
    version: number
  ): Promise<void> {
    // Use a transaction to ensure atomicity
    await db.transaction(async (tx) => {
      // Delete any existing slides for this version (in case of regeneration)
      await tx
        .delete(lessonSlides)
        .where(
          and(
            eq(lessonSlides.lessonId, lessonId),
            eq(lessonSlides.version, version)
          )
        );

      // Insert enriched slides
      const slideInserts = enrichedSlides.map((slide) => ({
        lessonId,
        version,
        slideIndex: slide.slideIndex,
        title: slide.title,
        bullets: slide.bullets,
        speakerNotes: slide.speakerNotes || null,
        mediaPrompt: slide.mediaPrompt || null,
        role: slide.role,
      }));

      if (slideInserts.length > 0) {
        await tx.insert(lessonSlides).values(slideInserts);
      }

      // Update lesson's currentSlideVersion
      await tx
        .update(lessons)
        .set({ 
          currentSlideVersion: version,
          updatedAt: new Date()
        })
        .where(eq(lessons.id, lessonId));
      
      // Mark any linked quizzes as outdated since slides have changed
      const outdatedResult = await tx
        .update(lessonQuizLinks)
        .set({ isOutdated: true })
        .where(eq(lessonQuizLinks.lessonId, lessonId))
        .returning();
      
      if (outdatedResult.length > 0) {
        console.log(
          `[JobQueueService] Marked ${outdatedResult.length} quiz(es) as outdated for lesson ${lessonId}`
        );
      }
    });

    console.log(
      `[JobQueueService] Stored ${enrichedSlides.length} enriched slides (version ${version}) for lesson ${lessonId}`
    );
  }

  /**
   * Process a pending job by initiating Gamma generation
   * CRITICAL FIX: Now accepts "claimed" status from atomic job claiming
   * Updates timestamp to prevent false abandonment detection
   */
  static async processPendingJob(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // CRITICAL FIX: Accept both "pending" and "claimed" status
    // "claimed" is set by getNextPendingJob() atomic transaction
    if (job.status !== "pending" && job.status !== "claimed") {
      console.log(`[JobQueueService] Job ${jobId} cannot be processed (status: ${job.status})`);
      return;
    }

    // CRITICAL DEMO FIX: Immediately transition to "polling" to claim ownership
    // This prevents race conditions by atomically marking the job as in-progress
    // Only ONE worker can successfully transition from claimed→polling
    try {
      await this.markJobPolling(jobId);
    } catch (error) {
      console.log(`[JobQueueService] Failed to claim job ${jobId} - likely already processed by another worker`);
      return;
    }

    try {
      const lesson = await db
        .select()
        .from(lessons)
        .where(eq(lessons.id, job.lessonId))
        .limit(1);

      if (!lesson[0]) {
        throw new Error(`Lesson ${job.lessonId} not found`);
      }

      const metadata = job.metadata as Record<string, any> || {};
      const { 
        inputText: metadataInputText, 
        themeId: metadataThemeId, 
        numCards = 10, 
        generateImages: metadataGenerateImages,
        imageStyle: metadataImageStyle,
        additionalInstructions: metadataAdditionalInstructions,
      } = metadata;

      // CRITICAL FIX: Use lesson record's saved themeId/imageStyle as primary source
      // The user selects theme/style in the wizard, which saves to the lesson record.
      // Job metadata may be empty, but lesson record has the user's actual selection.
      const lessonImageOptions = lesson[0].gammaImageOptions as { generateImages?: boolean; imageStyle?: string } | null;
      const themeId = metadataThemeId || lesson[0].themeId || "default-light";
      const generateImages = metadataGenerateImages ?? lessonImageOptions?.generateImages ?? true;
      const imageStyle = metadataImageStyle || lessonImageOptions?.imageStyle || "photorealistic";

      // GAP 4 FIX: NO FALLBACKS - require proper sourceContent/inputText only
      // Do NOT fall back to description - it produces generic AI slop
      // Always default to latest lesson content persisted in DB.
      // Job metadata is treated as fallback only.
      const rawInputText = lesson[0].inputText || metadataInputText;
      
      if (!rawInputText) {
        console.error(`[JobQueueService] BLOCKED: No inputText found for lesson ${job.lessonId}. This lesson requires sourceContent from document extraction.`);
        throw new Error("CONTENT_MISSING: Lesson has no source content. Please regenerate the course framework to extract content from your uploaded documents.");
      }
      
      // Validate minimum content length to prevent AI slop
      const wordCount = rawInputText.split(/\s+/).filter((w: string) => w.length > 0).length;
      
      if (wordCount < this.MIN_WORDS_FOR_GENERATION) {
        console.error(`[JobQueueService] BLOCKED: Insufficient content for lesson ${job.lessonId}. Word count: ${wordCount}, minimum: ${this.MIN_WORDS_FOR_GENERATION}`);
        throw new Error(`CONTENT_INSUFFICIENT: Lesson content is too short (${wordCount} words). Minimum ${this.MIN_WORDS_FOR_GENERATION} words required. Please regenerate the course framework or add more content to your source document.`);
      }
      
      // GAP 5 FIX: Compose Gamma payload with Bloom objectives, key terms, and context
      const inputText = this.composeGammaPayload(lesson[0], rawInputText, metadata);
      
      // Store FULL generation payload for audit (persisted to job metadata)
      // This includes the complete composed inputText for traceability and debugging
      const lessonData = lesson[0] as any;
      const generationPayloadAudit = {
        composedAt: new Date().toISOString(),
        sourceWordCount: wordCount,
        composedLength: inputText.length,
        hasBloomObjectives: !!(lessonData.learningObjectives || lessonData.gammaLearningObjectives),
        hasKeyTerms: !!(lessonData.keyTerms || lessonData.gammaKeyTerms),
        hasCourseContext: !!(metadata.courseTitle || metadata.courseDescription),
        fullPayload: inputText, // Full composed payload for audit
        rawSourceContentPreview: rawInputText.substring(0, 500), // First 500 chars of source for quick reference
      };
      
      await db.update(pendingGammaJobs)
        .set({
          metadata: {
            ...metadata,
            generationPayloadAudit,
          },
          updatedAt: new Date(),
        })
        .where(eq(pendingGammaJobs.id, jobId));
      
      console.log(`[JobQueueService] Using validated inputText (${wordCount} source words, ${inputText.length} chars with context). Full payload stored for audit.`);

      // Determine textMode based on generationMode
      // - "document-upload" and "text-input": use "preserve" to keep exact content
      // - "gemini-topics": use "generate" to create content about the topics
      const generationMode = lesson[0].generationMode;
      const textMode = (generationMode === "document-upload" || generationMode === "text-input") 
        ? "preserve" 
        : "generate";

      // Log theme/image source for debugging
      const themeSource = metadataThemeId ? 'metadata' : lesson[0].themeId ? 'lesson.themeId' : 'default';
      const generateImagesSource = metadataGenerateImages !== undefined ? 'metadata' : lessonImageOptions?.generateImages !== undefined ? 'lesson.gammaImageOptions' : 'default';
      const imageStyleSource = metadataImageStyle ? 'metadata' : lessonImageOptions?.imageStyle ? 'lesson.gammaImageOptions' : 'default';
      console.log(`[JobQueueService] Processing job ${jobId} - generationMode="${generationMode}", textMode="${textMode}", themeId="${themeId}" (from ${themeSource}), generateImages=${generateImages} (from ${generateImagesSource}), imageStyle="${imageStyle}" (from ${imageStyleSource})`);

      // Construct imageOptions according to Gamma API specification
      // If generateImages is false, use "noImages" to save credits
      const imageOptions = generateImages ? {
        source: "aiGenerated" as const,
        model: "imagen-4-pro" as const,
        style: imageStyle,
      } : {
        source: "noImages" as const,
      };

      // Read lesson's language code for multi-language support (defaults to 'en')
      const languageCode = lesson[0].languageCode || 'en';

      // Construct textOptions with professional defaults
      const textOptions = {
        amount: "detailed" as const,
        tone: "professional",
        audience: "students and learners",
        language: languageCode,
      };

      const gammaService = await GammaService.getInstance();
      const requestTimestamp = new Date().toISOString();
      const additionalInstructions = typeof metadataAdditionalInstructions === "string"
        ? metadataAdditionalInstructions.trim().slice(0, 5000)
        : "";
      
      console.log(`[JobQueueService] Language code for lesson ${job.lessonId}: "${languageCode}"`);
      
      const result = await gammaService.createPresentation({
        inputText,
        themeId,
        numCards,
        textMode,
        imageOptions,
        textOptions,
        additionalInstructions,
      });

      await db
        .update(pendingGammaJobs)
        .set({
          gammaGenerationId: result.generationId,
          updatedAt: new Date(),
        })
        .where(eq(pendingGammaJobs.id, jobId));

      await LessonService.storeGammaResults(
        job.lessonId,
        result.generationId,
        result.gammaUrl || ""
      );

      // Save API request log to object storage (non-blocking)
      // Use retryCount + 1 as attempt number (retryCount=0 is first attempt)
      const attemptNumber = (job.retryCount || 0) + 1;
      try {
        const objectStorage = new ObjectStorageService();
        await objectStorage.uploadLessonApiLog(
          job.organizationId,
          job.lessonId,
          jobId,
          attemptNumber,
          {
            version: 1,
            request: {
              inputText,
              themeId,
              numCards,
              textMode,
              imageOptions,
              textOptions,
              additionalInstructions,
              timestamp: requestTimestamp,
            } as any,
            pollEvents: [],
            response: {
              generationId: result.generationId,
              status: result.status,
              timestamp: new Date().toISOString(),
            },
          }
        );
        console.log(`[JobQueueService] ✅ Saved API request log for job ${jobId}, attempt ${attemptNumber}`);
      } catch (error) {
        console.error(`[JobQueueService] ⚠️ Failed to save API request log (non-critical):`, error);
        // Don't throw - log saving failure shouldn't break generation
      }

      // NOTE: markJobPolling() already called at start of processPendingJob() to claim ownership
      // Job is already in "polling" status at this point
      
      console.log(`[JobQueueService] Started Gamma generation ${result.generationId} for job ${jobId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.markJobFailed(jobId, errorMessage);
      throw error;
    }
  }

  /**
   * Poll a job to check Gamma generation status
   */
  static async pollJob(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (job.status !== "polling") {
      console.log(`[JobQueueService] Job ${jobId} is not polling (status: ${job.status})`);
      return;
    }

    if (!job.gammaGenerationId) {
      console.error(`[JobQueueService] Job ${jobId} has no gammaGenerationId`);
      await this.markJobFailed(jobId, "Missing Gamma generation ID");
      return;
    }

    const attemptNumber = (job.retryCount || 0) + 1;

    try {
      await this.updateLastPolled(jobId);

      const gammaService = await GammaService.getInstance();
      let status = await gammaService.checkGenerationStatus(job.gammaGenerationId);

      // If completed but exportUrl missing, retry immediately 1-2 times
      if (status.status === "completed" && !status.exportUrl) {
        console.log(
          `[JobQueueService] Generation completed but exportUrl missing, performing immediate re-checks...`
        );
        
        const immediateRetries = 2;
        const retryDelay = 2000; // 2 seconds
        
        for (let i = 1; i <= immediateRetries; i++) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          status = await gammaService.checkGenerationStatus(job.gammaGenerationId);
          
          if (status.exportUrl) {
            console.log(
              `[JobQueueService] ✅ exportUrl retrieved on immediate retry ${i}/${immediateRetries}`
            );
            break;
          }
          
          console.log(
            `[JobQueueService] exportUrl still missing (immediate retry ${i}/${immediateRetries})`
          );
        }
        
        if (!status.exportUrl) {
          console.warn(
            `[JobQueueService] ⚠️ exportUrl not available after ${immediateRetries} immediate retries, will retry on next poll cycle`
          );
          // Keep job in polling status for next scheduled poll
          return;
        }
      }

      if (status.status === "completed" && status.exportUrl) {
        // Download PPTX from Gamma
        const pptxBuffer = await gammaService.downloadPPTX(status.exportUrl);
        
        // Compress PPTX if it's too large for Office Online viewer
        let finalBuffer = pptxBuffer;
        let wasCompressed = false;  // Track if compression was applied
        const tempInputPath = path.join(os.tmpdir(), `gamma-download-${Date.now()}.pptx`);
        
        try {
          // Write downloaded buffer to temp file
          await fs.promises.writeFile(tempInputPath, pptxBuffer);
          
          // Compress PPTX images only for files larger than 25MB
          // Files under 25MB are kept as-is to preserve quality for smaller presentations
          const compressionResult = await compressPPTX(tempInputPath, {
            sizeThresholdMB: 25, // Compress files larger than 25MB - skip compression for smaller files
            imageQuality: 72, // Balanced quality for good compression
            targetMaxSizeMB: 95, // Target under 100MB for Office Online viewer
          });
          
          if (compressionResult.compressed) {
            console.log(
              `[JobQueueService] PPTX compressed: ${(compressionResult.originalSize / 1024 / 1024).toFixed(2)}MB → ${(compressionResult.compressedSize / 1024 / 1024).toFixed(2)}MB (${((1 - compressionResult.compressionRatio) * 100).toFixed(1)}% savings)`
            );
            
            // Read compressed file back to buffer
            finalBuffer = await fs.promises.readFile(compressionResult.outputPath);
            wasCompressed = true;  // Mark as compressed for version record
            
            // Clean up compressed temp file
            await fs.promises.unlink(compressionResult.outputPath);
          } else {
            console.log(
              `[JobQueueService] PPTX size OK (${(compressionResult.originalSize / 1024 / 1024).toFixed(2)}MB) - no compression needed`
            );
          }
          
          // Clean up original temp file
          await fs.promises.unlink(tempInputPath);
        } catch (compressionError) {
          const originalSizeMB = (pptxBuffer.length / 1024 / 1024).toFixed(2);
          console.error(`[JobQueueService] ⚠️ PPTX compression failed for lesson ${job.lessonId} (${originalSizeMB}MB), using original:`, compressionError);
          console.warn(`[JobQueueService] WARNING: Uncompressed PPTX (${originalSizeMB}MB) will be stored - this may cause slow loading`);
          // Clean up temp file on error
          try {
            await fs.promises.unlink(tempInputPath);
          } catch {
            // Ignore cleanup errors
          }
          // Continue with original buffer
          finalBuffer = pptxBuffer;
        }
        
        // Extract metadata early to avoid temporal dead zone
        const jobMetadata = job.metadata as Record<string, any> || {};
        
        // Read lesson's language code for multi-language storage path (defaults to 'en')
        const [lessonForLang] = await db
          .select()
          .from(lessons)
          .where(eq(lessons.id, job.lessonId))
          .limit(1);
        const pollLanguageCode = lessonForLang?.languageCode || 'en';
        
        // Calculate credits from Gamma response before storing
        // This allows us to pass credits to storePPTX for proper version record creation
        const actualCost = status.credits?.deducted ?? 0;
        
        // Store PPTX (compressed or original) - storePPTX is the SINGLE SOURCE OF TRUTH for version creation
        // Pass isGenerated=true for AI-generated content to prevent duplicate version records
        const { lesson: storedLesson, versionInfo } = await LessonService.storePPTX(
          job.lessonId, 
          finalBuffer, 
          jobMetadata.userId,
          {
            isCompressed: wasCompressed,
            isGenerated: true,  // AI-generated via Gamma API
            creditsCharged: actualCost,
            languageCode: pollLanguageCode,
          }
        );
        
        console.log(`[JobQueueService] Stored PPTX v${versionInfo.version} at ${versionInfo.storageKey}`);

        // Best-effort pre-conversion: reduce first-open wait in Lesson Viewer.
        try {
          const preConvertResult = await Promise.race([
            PptxHtmlConverterService.convertPptxToSlides(versionInfo.storageKey),
            new Promise<{ success: false; error: string }>((resolve) => {
              setTimeout(() => resolve({ success: false, error: "pre-conversion timeout" }), this.PPTX_PRECONVERT_TIMEOUT_MS);
            }),
          ]);
          if (preConvertResult.success) {
            console.log(`[JobQueueService] Pre-converted PPTX slide images before completion for ${versionInfo.storageKey}`);
          } else if (preConvertResult.error === "Conversion already in progress") {
            console.log(`[JobQueueService] Slide pre-conversion already in progress for ${versionInfo.storageKey}`);
          } else {
            console.warn(`[JobQueueService] Slide pre-conversion did not finish before completion for ${versionInfo.storageKey}: ${preConvertResult.error}`);
          }
        } catch (preConvertError) {
          console.warn(`[JobQueueService] Slide pre-conversion failed before completion for ${versionInfo.storageKey}:`, preConvertError);
        }
        
        await this.markJobCompleted(jobId);

        console.log(`[JobQueueService] Downloaded and stored PPTX for job ${jobId}`);
        console.log(`[JobQueueService] Full Gamma status:`, JSON.stringify(status, null, 2));

        // AI Enrichment Step: Enrich slides with bullets, speaker notes, and media prompts
        // This is non-blocking - enrichment failures don't break lesson generation
        try {
          // Fetch the lesson to get title and topics
          const [lessonForEnrichment] = await db
            .select()
            .from(lessons)
            .where(eq(lessons.id, job.lessonId))
            .limit(1);

          if (lessonForEnrichment && lessonForEnrichment.topics && Array.isArray(lessonForEnrichment.topics)) {
            const lessonTopics = lessonForEnrichment.topics as Array<{ position: number; title: string; role: 'overview' | 'slide' }>;
            
            // Ensure we have exactly 10 slides for enrichment
            if (lessonTopics.length === 10) {
              // Map topics to SlideInput format for AIEnrichmentService
              const slidesForEnrichment = lessonTopics.map((topic, index) => ({
                title: topic.title,
                keyPoints: undefined as string[] | undefined,
                role: index === 0 ? 'overview' as const : (topic.role || 'slide' as const),
              }));

              const enrichedSlides = await aiEnrichmentService.enrichLessonSlides(
                lessonForEnrichment.title,
                slidesForEnrichment
              );

              // Store enriched slides in lessonSlides table
              await this.storeEnrichedSlides(job.lessonId, enrichedSlides, 1);
              console.log(`[JobQueueService] ✅ Enriched ${enrichedSlides.length} slides for lesson ${job.lessonId}`);
            } else {
              console.log(`[JobQueueService] ℹ️ Skipping enrichment - lesson has ${lessonTopics.length} topics (expected 10)`);
            }
          } else {
            console.log(`[JobQueueService] ℹ️ Skipping enrichment - lesson has no topics defined`);
          }
        } catch (enrichError) {
          console.error(`[JobQueueService] ⚠️ Slide enrichment failed (non-critical):`, enrichError);
          // Don't throw - enrichment failure shouldn't break lesson generation
        }

        // Charge actual Gamma credits ONLY after successful generation (NO estimates)
        // Note: jobMetadata was already extracted above, actualCost was calculated earlier before storePPTX
        const userId = jobMetadata.userId;
        // Check if Gamma provided credit information
        // IMPORTANT: We distinguish between Gamma explicitly reporting 0 credits vs. not providing credit data
        const creditDataProvided = status.credits?.deducted !== undefined;
        // actualCost was already calculated above before storePPTX call
        const isRegeneration = jobMetadata.isRegeneration || false;
        const isFromDocument = jobMetadata.isFromDocument || false;

        // ATOMIC COMPARE-AND-SET: Claim charging rights BEFORE charging
        // This prevents double-charging by using the database as a lock
        // Only the first process to successfully update creditsCharged will proceed
        // 
        // IMPORTANT: We do NOT check job status here. Whoever claims first MUST charge.
        // If cancel marks the job as failed, reconciliation will try to claim.
        // If pollJob claims first, it charges. If reconciliation claims first, it charges.
        // This eliminates the race condition where neither party charges.
        let chargeClaimSucceeded = false;
        
        if (actualCost > 0 && userId) {
          try {
            // Attempt to atomically claim charging rights
            // Use JSONB operations to check and set creditsCharged in one query
            // NOTE: No status check - whoever claims first owns the charge
            const chargedAt = new Date().toISOString();
            const claimResult = await db
              .update(pendingGammaJobs)
              .set({
                metadata: sql`${pendingGammaJobs.metadata} || jsonb_build_object('creditsCharged', true, 'reconciledBy', 'pollJob', 'actualGammaCost', ${actualCost}::int, 'chargedAt', ${chargedAt}::text)`
              })
              .where(
                and(
                  eq(pendingGammaJobs.id, jobId),
                  // Only claim if not already charged (compare-and-set)
                  or(
                    sql`${pendingGammaJobs.metadata}->>'creditsCharged' IS NULL`,
                    sql`${pendingGammaJobs.metadata}->>'creditsCharged' = 'false'`
                  )
                )
              )
              .returning();
            
            chargeClaimSucceeded = claimResult.length > 0;
            
            if (!chargeClaimSucceeded) {
              console.log(`[JobQueueService] ℹ️ Credit charge claim failed for job ${jobId} - already charged`);
            }
          } catch (claimError) {
            console.error(`[JobQueueService] ⚠️ Failed to claim credit charge for job ${jobId}:`, claimError);
            chargeClaimSucceeded = false;
          }
        }
        
        if (chargeClaimSucceeded && actualCost > 0 && userId) {
          // NOTE: We charge REGARDLESS of current job status (even if superseded/failed)
          // Once we successfully claimed creditsCharged=true atomically, we OWN the charge
          // The CAS already set reconciledBy="pollJob" to prevent double-claims
          
          // Charge the user (we own the claim)
          try {
            await CreditService.chargeForGammaUsage(
              userId,
              job.organizationId,
              actualCost,
              job.lessonId,
              job.gammaGenerationId,
              {
                actualCost,
                gammaStatus: status.status,
              },
              isRegeneration,
              isFromDocument
            );
            console.log(`[JobQueueService] ✅ Charged ${actualCost} actual Gamma credits for user ${userId}`);
            
            // Update lesson's creditsUsed field (only after successful charge)
            try {
              await db
                .update(lessons)
                .set({ 
                  creditsUsed: sql`COALESCE(${lessons.creditsUsed}, 0) + ${actualCost}` 
                })
                .where(eq(lessons.id, job.lessonId));
              console.log(`[JobQueueService] ✅ Added ${actualCost} to lesson creditsUsed`);
            } catch (error) {
              console.error(`[JobQueueService] ⚠️ Failed to update lesson creditsUsed:`, error);
            }
          } catch (creditError: any) {
            console.error(`[JobQueueService] ⚠️ Failed to charge Gamma credits:`, creditError);
            
            // If credit charging fails, mark job as failed
            if (creditError.message?.includes('Insufficient credits')) {
              await this.markJobFailed(
                jobId,
                `Generation completed but insufficient credits: ${creditError.message}`
              );
              console.error(`[JobQueueService] ❌ Job failed due to insufficient credits at completion`);
              return;
            }
          }
        } else if (actualCost === 0 && creditDataProvided) {
          // Gamma explicitly reported 0 credits deducted - safe to mark as processed
          console.log(`[JobQueueService] ℹ️ No credits charged - Gamma explicitly reported 0 credits used`);
          await db
            .update(pendingGammaJobs)
            .set({
              metadata: {
                ...jobMetadata,
                creditsCharged: true,
                actualGammaCost: 0,
                reconciledBy: 'pollJob'
              }
            })
            .where(eq(pendingGammaJobs.id, jobId));
        } else if (!creditDataProvided) {
          // Gamma did NOT provide credit data (undefined) - DON'T mark as processed
          // This allows future retries or manual reconciliation to handle billing
          console.warn(`[JobQueueService] ⚠️ Gamma did not provide credit data for job ${jobId} - NOT marking as processed`);
          console.warn(`[JobQueueService] ⚠️ This job may need manual review: lessonId=${job.lessonId}, gammaGenerationId=${job.gammaGenerationId}`);
        }

        // Record Gamma snapshot only if Gamma provides actual remaining balance
        // This maintains dual-ledger integrity by recording only Gamma's reported values
        if (status.credits?.remaining !== undefined) {
          try {
            await CreditService.recordGammaSnapshot(
              status.credits.remaining,
              'gamma_api_response',
              job.gammaGenerationId,
              { 
                actualCost, 
                lessonId: job.lessonId,
                fullCreditsObject: status.credits
              }
            );
            console.log(`[JobQueueService] ✅ Recorded Gamma snapshot: balance=${status.credits.remaining}, used=${actualCost}`);
          } catch (snapshotError) {
            console.error(`[JobQueueService] ⚠️ Failed to record Gamma snapshot (non-critical):`, snapshotError);
          }
        } else if (status.credits) {
          // Gamma returned credit info but not remaining balance - log for investigation
          console.warn(
            `[JobQueueService] ⚠️ Gamma response has credits.deducted (${actualCost}) but missing credits.remaining. ` +
            `Snapshot skipped to preserve dual-ledger integrity. Full credits object:`,
            JSON.stringify(status.credits, null, 2)
          );
        } else {
          console.warn(`[JobQueueService] ⚠️ No credit information in Gamma response for job ${jobId}`);
        }

        // NOTE: Version record creation is now handled by LessonService.storePPTX (SINGLE SOURCE OF TRUTH)
        // This prevents version/storageKey mismatches that caused NoSuchKey download errors.
        // The version record was already created with isGenerated=true and creditsCharged above.
        
        // Mark any linked quizzes as outdated since content has changed
        // This prompts users to regenerate quizzes when they view the lesson
        try {
          const outdatedCount = await markQuizzesAsOutdated(job.lessonId);
          if (outdatedCount > 0) {
            console.log(`[JobQueueService] ✅ Marked ${outdatedCount} linked quiz(es) as outdated for lesson ${job.lessonId}`);
          }
        } catch (quizOutdatedError) {
          console.error(`[JobQueueService] ⚠️ Failed to mark quizzes as outdated:`, quizOutdatedError);
          // Non-blocking - quiz staleness marking shouldn't break generation flow
        }

        // Update API log with final response (non-blocking)
        try {
          const objectStorage = new ObjectStorageService();
          const logPath = objectStorage.buildLessonApiLogPath(job.organizationId, job.lessonId, jobId, attemptNumber);
          
          // Load existing log to preserve request data
          const existingLog = await objectStorage.downloadLessonApiLog(logPath);
          
          if (existingLog) {
            // Update with final response data
            existingLog.response = {
              generationId: status.generationId,
              status: status.status,
              gammaUrl: status.gammaUrl,
              exportUrl: status.exportUrl,
              pdfUrl: status.pdfUrl,
              credits: status.credits,
              timestamp: new Date().toISOString(),
            };
            existingLog.pptxStoragePath = versionInfo.storageKey; // Add reference to stored PPTX
            
            // Re-upload updated log
            await objectStorage.uploadLessonApiLog(
              job.organizationId,
              job.lessonId,
              jobId,
              attemptNumber,
              existingLog
            );

            // Update manifest with successful completion
            await objectStorage.updateLessonApiLogManifest(
              job.organizationId,
              job.lessonId,
              {
                jobId,
                attempt: attemptNumber,
                logPath,
                timestamp: new Date().toISOString(),
                generationId: status.generationId,
              }
            );

            console.log(`[JobQueueService] ✅ Updated API log and manifest for completed job ${jobId}`);
          }
        } catch (error) {
          console.error(`[JobQueueService] ⚠️ Failed to update API log on completion (non-critical):`, error);
        }
      } else if (status.status === "failed") {
        await this.markJobFailed(jobId, status.errorMessage || "Gamma generation failed");

        // Save error in API log (non-blocking)
        try {
          const objectStorage = new ObjectStorageService();
          const logPath = objectStorage.buildLessonApiLogPath(job.organizationId, job.lessonId, jobId, attemptNumber);
          const existingLog = await objectStorage.downloadLessonApiLog(logPath);
          
          if (existingLog) {
            existingLog.error = {
              message: status.errorMessage || "Gamma generation failed",
              timestamp: new Date().toISOString(),
            };
            existingLog.response = {
              generationId: status.generationId,
              status: status.status,
              timestamp: new Date().toISOString(),
            };
            
            await objectStorage.uploadLessonApiLog(
              job.organizationId,
              job.lessonId,
              jobId,
              attemptNumber,
              existingLog
            );

            console.log(`[JobQueueService] ✅ Saved error details in API log for failed job ${jobId}`);
          }
        } catch (error) {
          console.error(`[JobQueueService] ⚠️ Failed to save error in API log (non-critical):`, error);
        }
      } else {
        console.log(`[JobQueueService] Job ${jobId} still processing (status: ${status.status})`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[JobQueueService] Error polling job ${jobId}:`, errorMessage);
      await this.markJobFailed(jobId, errorMessage);

      // Save polling error in API log (non-blocking)
      try {
        const objectStorage = new ObjectStorageService();
        const logPath = objectStorage.buildLessonApiLogPath(job.organizationId, job.lessonId, jobId, attemptNumber);
        const existingLog = await objectStorage.downloadLessonApiLog(logPath);
        
        if (existingLog) {
          existingLog.error = {
            message: errorMessage,
            timestamp: new Date().toISOString(),
          };
          
          await objectStorage.uploadLessonApiLog(
            job.organizationId,
            job.lessonId,
            jobId,
            attemptNumber,
            existingLog
          );
        }
      } catch (logError) {
        console.error(`[JobQueueService] ⚠️ Failed to save polling error in API log (non-critical):`, logError);
      }
    }
  }

  /**
   * Process all pending jobs and poll active jobs
   * Should be called by a worker process on an interval
   */
  static async processQueue(): Promise<void> {
    try {
      // CRITICAL FIX: Recover abandoned claimed jobs first (worker crash recovery)
      await this.recoverAbandonedClaimedJobs();
      
      // HIGH FIX #7: Check for stuck jobs and mark them as failed
      await this.failStuckJobs();

      const pendingJob = await this.getNextPendingJob();
      if (pendingJob) {
        await this.processPendingJob(pendingJob.id);
      }

      const jobsNeedingPoll = await this.getJobsNeedingPoll();
      for (const job of jobsNeedingPoll) {
        await this.pollJob(job.id);
      }

      if (pendingJob || jobsNeedingPoll.length > 0) {
        console.log(
          `[JobQueueService] Processed ${pendingJob ? 1 : 0} pending job(s), polled ${jobsNeedingPoll.length} job(s)`
        );
      }
    } catch (error) {
      console.error("[JobQueueService] Error processing queue:", error);
    }
  }

  /**
   * Cleanup old completed/failed jobs
   */
  static async cleanupOldJobs(daysOld = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await db
      .delete(pendingGammaJobs)
      .where(
        and(
          inArray(pendingGammaJobs.status, ["completed", "failed"]),
          sql`${pendingGammaJobs.updatedAt} < ${cutoffDate}`
        )
      );

    const deletedCount = result.rowCount || 0;
    
    if (deletedCount > 0) {
      console.log(`[JobQueueService] Cleaned up ${deletedCount} old jobs`);
    }

    return deletedCount;
  }

  /**
   * Retry a failed job
   * Clears gammaGenerationId to force fresh generation
   */
  static async retryJob(jobId: string): Promise<Job> {
    const job = await this.getJob(jobId);
    
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (job.status !== "failed") {
      throw new Error(`Job ${jobId} is not failed (status: ${job.status})`);
    }

    const [updated] = await db
      .update(pendingGammaJobs)
      .set({
        status: "pending",
        retryCount: 0,
        gammaGenerationId: "",
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(pendingGammaJobs.id, jobId))
      .returning();

    await LessonService.updateGenerationStatus(job.lessonId, "pending");

    console.log(`[JobQueueService] Retrying job ${jobId}`);

    return updated;
  }

  /**
   * Cancel an active job
   * Can be called when user archives lesson during generation
   * NO credit refund needed - credits are only charged after successful completion
   */
  static async cancelJob(lessonId: string): Promise<{ success: boolean; message: string }> {
    try {
      // Find active job for this lesson
      const jobs = await db
        .select()
        .from(pendingGammaJobs)
        .where(
          and(
            eq(pendingGammaJobs.lessonId, lessonId),
            inArray(pendingGammaJobs.status, ["pending", "polling"])
          )
        )
        .limit(1);

      if (jobs.length === 0) {
        return { success: false, message: "No active job found for this lesson" };
      }

      const job = jobs[0];

      // NO credit refund needed - we never deducted upfront
      // Credits are only charged after successful Gamma API completion
      console.log(`[JobQueueService] Canceling job ${job.id} (no credit refund needed - never deducted)`);

      // Mark job as failed with cancellation message
      await db
        .update(pendingGammaJobs)
        .set({
          status: "failed",
          errorMessage: "Generation canceled by user (lesson archived)",
          updatedAt: new Date(),
        })
        .where(eq(pendingGammaJobs.id, job.id));

      // Update lesson status to failed
      await LessonService.updateGenerationStatus(lessonId, "failed", "Generation canceled by user");

      console.log(`[JobQueueService] ✅ Canceled job ${job.id} for lesson ${lessonId}`);

      return { success: true, message: "Job canceled successfully" };
    } catch (error) {
      console.error(`[JobQueueService] Error canceling job:`, error);
      return { success: false, message: "Failed to cancel job" };
    }
  }

  /**
   * Get statistics about the job queue
   */
  static async getStats(): Promise<{
    pending: number;
    polling: number;
    completed: number;
    failed: number;
  }> {
    const stats = await db
      .select({
        status: pendingGammaJobs.status,
        count: sql<number>`count(*)::int`,
      })
      .from(pendingGammaJobs)
      .groupBy(pendingGammaJobs.status);

    return {
      pending: stats.find(s => s.status === "pending")?.count || 0,
      polling: stats.find(s => s.status === "polling")?.count || 0,
      completed: stats.find(s => s.status === "completed")?.count || 0,
      failed: stats.find(s => s.status === "failed")?.count || 0,
    };
  }
}
