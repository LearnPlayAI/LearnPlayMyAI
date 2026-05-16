import { JobQueueService } from "../services/jobQueueService";

/**
 * Job Queue Worker
 * Processes pending jobs and polls active Gamma generations
 * Runs on a 10-second interval
 */
export class JobQueueWorker {
  private static intervalId: NodeJS.Timeout | null = null;
  private static readonly INTERVAL_MS = 10000; // 10 seconds
  private static readonly CLEANUP_INTERVAL_MS = 86400000; // 24 hours
  private static isRunning = false;
  private static lastCleanup = Date.now();

  /**
   * Start the worker
   */
  static start(): void {
    if (this.intervalId) {
      console.log("[JobQueueWorker] Already running");
      return;
    }

    console.log("[JobQueueWorker] Starting worker...");

    this.processQueue();

    this.intervalId = setInterval(() => {
      this.processQueue();
    }, this.INTERVAL_MS);

    console.log(`[JobQueueWorker] Started with ${this.INTERVAL_MS}ms interval`);
  }

  /**
   * Stop the worker
   */
  static stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[JobQueueWorker] Stopped");
    }
  }

  /**
   * Process the job queue
   * Non-blocking - runs in background
   */
  private static async processQueue(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      await JobQueueService.processQueue();

      if (Date.now() - this.lastCleanup > this.CLEANUP_INTERVAL_MS) {
        await JobQueueService.cleanupOldJobs();
        this.lastCleanup = Date.now();
      }
    } catch (error) {
      console.error("[JobQueueWorker] Error processing queue:", error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get worker status
   */
  static getStatus(): {
    running: boolean;
    intervalMs: number;
    lastCleanup: Date;
  } {
    return {
      running: this.intervalId !== null,
      intervalMs: this.INTERVAL_MS,
      lastCleanup: new Date(this.lastCleanup),
    };
  }
}
