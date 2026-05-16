import { TranslationIndexService } from "../services/translationIndexService";

export class TranslationIndexWorker {
  private static intervalId: NodeJS.Timeout | null = null;
  private static readonly INTERVAL_MS = 10000;
  private static readonly DLQ_REPLAY_INTERVAL_MS = 5 * 60 * 1000;
  private static lastReplayAt = 0;
  private static isRunning = false;

  static start(): void {
    if (this.intervalId) {
      console.log("[TranslationIndexWorker] Already running");
      return;
    }

    console.log("[TranslationIndexWorker] Starting worker...");
    this.tick().catch((error) => {
      console.error("[TranslationIndexWorker] Initial tick failed:", error);
    });

    this.intervalId = setInterval(() => {
      this.tick().catch((error) => {
        console.error("[TranslationIndexWorker] Tick failed:", error);
      });
    }, this.INTERVAL_MS);

    if (typeof this.intervalId.unref === "function") {
      this.intervalId.unref();
    }
  }

  static stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private static async tick(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      const result = await TranslationIndexService.processQueue();
      if (result.processed || result.failed || result.deadLettered) {
        console.log(
          `[TranslationIndexWorker] processed=${result.processed} failed=${result.failed} deadLettered=${result.deadLettered}`
        );
      }

      if (Date.now() - this.lastReplayAt > this.DLQ_REPLAY_INTERVAL_MS) {
        const replayed = await TranslationIndexService.replayDeadLetters(10);
        if (replayed > 0) {
          console.log(`[TranslationIndexWorker] replayed ${replayed} dead-letter job(s)`);
        }
        this.lastReplayAt = Date.now();
      }
    } finally {
      this.isRunning = false;
    }
  }
}

