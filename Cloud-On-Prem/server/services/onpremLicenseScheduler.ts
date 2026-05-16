import { runOnpremLicenseCheckIn } from './onpremLicenseSyncService';
import { shouldRunJob, markJobRun } from './schedulerRunGuard';

class OnpremLicenseSchedulerService {
  private static instance: OnpremLicenseSchedulerService;
  private intervalId: NodeJS.Timeout | null = null;
  private consecutiveFailures = 0;
  private nextEligibleRunAt = 0;

  static getInstance(): OnpremLicenseSchedulerService {
    if (!this.instance) this.instance = new OnpremLicenseSchedulerService();
    return this.instance;
  }

  start(): void {
    if (process.env.ONPREM_MODE !== 'true') {
      return;
    }
    if (this.intervalId) {
      return;
    }

    setTimeout(() => {
      this.run().catch((error) => {
        console.error('[OnpremLicenseScheduler] Initial run failed:', error);
      });
    }, 30 * 1000);

    this.intervalId = setInterval(() => {
      this.run().catch((error) => {
        console.error('[OnpremLicenseScheduler] Scheduled run failed:', error);
      });
    }, 5 * 60 * 1000);

    console.log('[OnpremLicenseScheduler] Started (runs every 5 minutes)');
  }

  stop(): void {
    if (!this.intervalId) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  private async run(): Promise<void> {
    if (process.env.ONPREM_MODE !== 'true') {
      return;
    }

    if (Date.now() < this.nextEligibleRunAt) {
      return;
    }

    const canRun = await shouldRunJob('onprem_license_checkin', 60 * 1000);
    if (!canRun) {
      return;
    }

    try {
      const result = await runOnpremLicenseCheckIn();
      this.consecutiveFailures = 0;
      this.nextEligibleRunAt = 0;
      console.log(`[OnpremLicenseScheduler] Check-in complete. Renewal installed=${result?.importedRenewal === true}`);
      await markJobRun('onprem_license_checkin');
    } catch (error: any) {
      const message = error?.message || String(error);
      if (message.includes('No installed license found')) {
        console.log('[OnpremLicenseScheduler] No installed license yet; skipping automatic check-in');
        this.consecutiveFailures = 0;
        this.nextEligibleRunAt = 0;
        await markJobRun('onprem_license_checkin');
        return;
      }
      this.consecutiveFailures += 1;
      const backoffMinutes = Math.min(30, Math.max(1, Math.pow(2, Math.min(this.consecutiveFailures - 1, 5))));
      this.nextEligibleRunAt = Date.now() + (backoffMinutes * 60 * 1000);

      // Keep logs informative but less noisy; emit first and every 3rd consecutive failure.
      if (this.consecutiveFailures === 1 || this.consecutiveFailures % 3 === 0) {
        console.error(
          `[OnpremLicenseScheduler] Check-in failed (${this.consecutiveFailures} consecutive). ` +
          `Next retry in ~${backoffMinutes}m. Reason: ${message}`
        );
      } else {
        console.warn(
          `[OnpremLicenseScheduler] Check-in failed (${this.consecutiveFailures} consecutive). ` +
          `Backoff active (~${backoffMinutes}m).`
        );
      }
    }
  }
}

export const OnpremLicenseScheduler = OnpremLicenseSchedulerService.getInstance();
