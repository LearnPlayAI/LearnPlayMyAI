import { PostFulfillmentJobService } from "../services/postFulfillmentJobService";

const WORKER_INTERVAL_MS = 5000; // Check for jobs every 5 seconds
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // Cleanup old jobs daily

let workerInterval: NodeJS.Timeout | null = null;
let cleanupInterval: NodeJS.Timeout | null = null;
let isProcessing = false;

export class PostFulfillmentWorker {
  private static isRunning = false;

  static start(): void {
    if (this.isRunning) {
      console.log("[PostFulfillmentWorker] Already running");
      return;
    }

    console.log("[PostFulfillmentWorker] Starting worker...");
    this.isRunning = true;

    // Start the main processing loop
    workerInterval = setInterval(async () => {
      await this.processQueue();
    }, WORKER_INTERVAL_MS);

    // Start the cleanup interval
    cleanupInterval = setInterval(async () => {
      await this.runCleanup();
    }, CLEANUP_INTERVAL_MS);

    // Run initial cleanup on startup
    setTimeout(() => this.runCleanup(), 60000); // 1 minute after startup

    console.log(`[PostFulfillmentWorker] Started with ${WORKER_INTERVAL_MS}ms interval`);
  }

  static stop(): void {
    if (workerInterval) {
      clearInterval(workerInterval);
      workerInterval = null;
    }
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }
    this.isRunning = false;
    console.log("[PostFulfillmentWorker] Stopped");
  }

  private static async processQueue(): Promise<void> {
    // Prevent concurrent processing
    if (isProcessing) {
      return;
    }

    isProcessing = true;

    try {
      // First, recover any abandoned jobs
      await PostFulfillmentJobService.recoverAbandonedJobs();

      // Process up to 5 jobs per cycle
      let processedCount = 0;
      const maxJobsPerCycle = 5;

      while (processedCount < maxJobsPerCycle) {
        const job = await PostFulfillmentJobService.getNextPendingJob();
        
        if (!job) {
          break; // No more jobs to process
        }

        await PostFulfillmentJobService.processJob(job);
        processedCount++;
      }

      if (processedCount > 0) {
        console.log(`[PostFulfillmentWorker] Processed ${processedCount} jobs this cycle`);
      }
    } catch (error) {
      console.error("[PostFulfillmentWorker] Error processing queue:", error);
    } finally {
      isProcessing = false;
    }
  }

  private static async runCleanup(): Promise<void> {
    try {
      const cleanedUp = await PostFulfillmentJobService.cleanupOldJobs(30);
      if (cleanedUp > 0) {
        console.log(`[PostFulfillmentWorker] Cleaned up ${cleanedUp} old jobs`);
      }
    } catch (error) {
      console.error("[PostFulfillmentWorker] Error during cleanup:", error);
    }
  }

  static async getStatus(): Promise<{
    isRunning: boolean;
    stats: { pending: number; claimed: number; completed: number; failed: number };
  }> {
    const stats = await PostFulfillmentJobService.getJobStats();
    return {
      isRunning: this.isRunning,
      stats,
    };
  }
}
