import { GammaThemeSyncService } from "./services/gammaThemeSyncService";
import { CurrencyService } from "./services/currencyService";
import { ReconciliationService } from "./services/reconciliationService";
import { EmailSchedulerService } from "./services/emailSchedulerService";
import { PasswordResetService, PasswordResetRateLimiter } from "./services/passwordResetService";
import { PaymentService } from "./services/paymentService";
import { PostFulfillmentWorker } from "./workers/postFulfillmentWorker";
import { DocumentExtractionWorker } from "./workers/documentExtractionWorker";
import { TranslationWorker } from "./workers/translationWorker";
import { WebhookDeduplicationService } from "./services/webhookDeduplicationService";
import { isAsyncReceiptEmailEnabled, logPaymentFeatureFlags } from "./config/paymentFeatureFlags";
import { isOnPremMode, isPaymentGatewayEnabled } from "./featureFlags";
import { annualPlanPromotionScheduler } from "./schedulers/annualPlanPromotionScheduler";
import { trialExpiryScheduler } from "./schedulers/trialExpiryScheduler";
import { db } from "./db";
import { courseDraftFrameworks, courseDraftDocuments } from "@shared/schema";
import { eq, lt, and, or } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage";
import { shouldRunJob, markJobRun } from "./services/schedulerRunGuard";
import { shouldMarkThemeSyncRun } from "./services/brandingSecurityService";

const objectStorage = new ObjectStorageService();
const THEME_SYNC_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const CURRENCY_UPDATE_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds
const RECONCILIATION_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds
const EMAIL_RETRY_INTERVAL = 15 * 60 * 1000; // 15 minutes in milliseconds
const INVOICE_REMINDER_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const WEBHOOK_CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const WEBHOOK_EVENTS_RETENTION_DAYS = 90; // Keep webhook events for 90 days
const DRAFT_CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const DRAFT_MAX_AGE_DAYS = 30; // Delete drafts older than 30 days

async function cleanupAbandonedDrafts(): Promise<{ deleted: number; documentsDeleted: number; storageFilesDeleted: number }> {
  const now = new Date();
  const maxAgeDate = new Date();
  maxAgeDate.setDate(maxAgeDate.getDate() - DRAFT_MAX_AGE_DAYS);
  
  let deleted = 0;
  let documentsDeleted = 0;
  let storageFilesDeleted = 0;
  
  try {
    const abandonedDrafts = await db.query.courseDraftFrameworks.findMany({
      where: or(
        lt(courseDraftFrameworks.expiresAt, now),
        and(
          lt(courseDraftFrameworks.createdAt, maxAgeDate),
          eq(courseDraftFrameworks.isPublished, false)
        )
      ),
      with: {
        documents: true,
      },
    });
    
    for (const draft of abandonedDrafts) {
      for (const doc of draft.documents) {
        try {
          await objectStorage.deleteCourseDraftDocument(doc.storagePath);
          storageFilesDeleted++;
        } catch (storageError) {
          console.warn(`[DraftCleanup] Failed to delete storage file: ${doc.storagePath}`, storageError);
        }
      }
      
      if (draft.documents.length > 0) {
        await db.delete(courseDraftDocuments)
          .where(eq(courseDraftDocuments.draftId, draft.id));
        documentsDeleted += draft.documents.length;
      }
      
      await db.delete(courseDraftFrameworks)
        .where(eq(courseDraftFrameworks.id, draft.id));
      deleted++;
    }
    
    return { deleted, documentsDeleted, storageFilesDeleted };
  } catch (error) {
    console.error('[DraftCleanup] Error during cleanup:', error);
    return { deleted, documentsDeleted, storageFilesDeleted };
  }
}

/**
 * Start background schedulers for periodic tasks
 * Uses sequential execution with mutex to prevent overlap
 */
export async function startSchedulers() {
  console.log("[Scheduler] Initializing background tasks...");
  const paymentsEnabled = !isOnPremMode() && isPaymentGatewayEnabled();
  
  if (paymentsEnabled) {
    try {
      const webhookConfig = await PaymentService.verifyWebhookConfiguration();
      if (!webhookConfig.isValid) {
        console.error("[Scheduler] ⚠️ YOCO WEBHOOK CONFIGURATION ISSUES DETECTED");
        console.error("[Scheduler] Payment webhooks may fail. Check logs above for details.");
      } else {
        console.log(`[Scheduler] ✅ YOCO webhook configuration verified (mode: ${webhookConfig.mode.toUpperCase()})`);
      }
    } catch (error) {
      console.error("[Scheduler] Failed to verify YOCO webhook configuration:", error);
    }
  } else {
    console.log("[Scheduler] ⏭️ YOCO webhook verification skipped (on-prem/payment gateway disabled)");
  }
  
  logPaymentFeatureFlags();
  
  if (isAsyncReceiptEmailEnabled()) {
    PostFulfillmentWorker.start();
    console.log("[Scheduler] ✅ PostFulfillmentWorker started for async receipt/email processing");
  } else {
    console.log("[Scheduler] ⏭️ PostFulfillmentWorker skipped (async processing disabled)");
  }
  
  DocumentExtractionWorker.start();
  console.log("[Scheduler] ✅ DocumentExtractionWorker started for course document extraction");
  
  TranslationWorker.start();
  console.log("[Scheduler] ✅ TranslationWorker started for async lesson translation");
  
  // Run initial theme sync on startup (after 30 seconds to allow server to fully start)
  // Skip on on-prem: themes are pre-imported and sync could mark them inactive
  if (process.env.ONPREM_MODE === 'true') {
    console.log("[Scheduler] ⏭️ Gamma theme sync disabled in on-prem mode (themes are pre-imported)");
  } else {
    setTimeout(async () => {
      const canRun = await shouldRunJob('gamma_theme_sync', THEME_SYNC_INTERVAL);
      if (!canRun) {
        console.log("[Scheduler] Skipping initial Gamma theme sync - already ran within interval");
      } else {
        console.log("[Scheduler] Running initial Gamma theme sync...");
        try {
          const result = await GammaThemeSyncService.syncThemes();
          if (result.success) {
            console.log(`[Scheduler] Initial theme sync completed: ${result.themesCount} themes`);
          } else {
            console.error(`[Scheduler] Initial theme sync failed: ${result.error}`);
          }
          if (shouldMarkThemeSyncRun(result.success)) {
            await markJobRun('gamma_theme_sync');
          }
        } catch (error) {
          console.error("[Scheduler] Initial theme sync error:", error);
        }
      }
      
      setInterval(async () => {
        const canRun = await shouldRunJob('gamma_theme_sync', THEME_SYNC_INTERVAL);
        if (!canRun) {
          console.log("[Scheduler] Skipping scheduled Gamma theme sync - already ran within interval");
          return;
        }
        console.log("[Scheduler] Running scheduled Gamma theme sync...");
        try {
          const result = await GammaThemeSyncService.syncThemes();
          if (result.success) {
            console.log(`[Scheduler] Scheduled theme sync completed: ${result.themesCount} themes`);
          } else {
            console.error(`[Scheduler] Scheduled theme sync failed: ${result.error}`);
          }
          if (shouldMarkThemeSyncRun(result.success)) {
            await markJobRun('gamma_theme_sync');
          }
        } catch (error) {
          console.error("[Scheduler] Scheduled theme sync error:", error);
        }
      }, THEME_SYNC_INTERVAL);
      
      console.log("[Scheduler] Recurring theme sync scheduled (every 24h)");
    }, 30000);
  }
  
  // Currency exchange rate updates (hourly)
  setTimeout(async () => {
    const canRun = await shouldRunJob('currency_update', CURRENCY_UPDATE_INTERVAL);
    if (!canRun) {
      console.log("[Scheduler] Skipping initial currency rate update - already ran within interval");
    } else {
      console.log("[Scheduler] Running initial currency rate update...");
      try {
        const result = await CurrencyService.updateAutomaticRates();
        console.log(`[Scheduler] Initial currency update: ${result.updated} updated, ${result.failed} failed`);
        await markJobRun('currency_update');
      } catch (error) {
        console.error("[Scheduler] Initial currency update error:", error);
      }
    }
    
    setInterval(async () => {
      const canRun = await shouldRunJob('currency_update', CURRENCY_UPDATE_INTERVAL);
      if (!canRun) {
        console.log("[Scheduler] Skipping scheduled currency rate update - already ran within interval");
        return;
      }
      console.log("[Scheduler] Running scheduled currency rate update...");
      try {
        const result = await CurrencyService.updateAutomaticRates();
        console.log(`[Scheduler] Currency update: ${result.updated} updated, ${result.failed} failed`);
        await markJobRun('currency_update');
      } catch (error) {
        console.error("[Scheduler] Currency update error:", error);
      }
    }, CURRENCY_UPDATE_INTERVAL);
    
    console.log("[Scheduler] Currency rate updates scheduled (hourly)");
  }, 60000);
  
  // Payment reconciliation (hourly)
  if (paymentsEnabled) {
    setTimeout(async () => {
      const canRun = await shouldRunJob('reconciliation', RECONCILIATION_INTERVAL);
      if (!canRun) {
        console.log("[Scheduler] Skipping initial payment reconciliation - already ran within interval");
      } else {
        console.log("[Scheduler] Running initial payment reconciliation...");
        try {
          const result = await ReconciliationService.runReconciliation();
          console.log(`[Scheduler] Initial reconciliation: ${result.reconciled} reconciled, ${result.failed} failed (scanned ${result.scanned})`);
          await markJobRun('reconciliation');
        } catch (error) {
          console.error("[Scheduler] Initial reconciliation error:", error);
        }
      }

      setInterval(async () => {
        const canRun = await shouldRunJob('reconciliation', RECONCILIATION_INTERVAL);
        if (!canRun) {
          console.log("[Scheduler] Skipping scheduled payment reconciliation - already ran within interval");
          return;
        }
        console.log("[Scheduler] Running scheduled payment reconciliation...");
        try {
          const result = await ReconciliationService.runReconciliation();
          console.log(`[Scheduler] Reconciliation: ${result.reconciled} reconciled, ${result.failed} failed (scanned ${result.scanned})`);
          await markJobRun('reconciliation');
        } catch (error) {
          console.error("[Scheduler] Reconciliation error:", error);
        }
      }, RECONCILIATION_INTERVAL);

      console.log("[Scheduler] Payment reconciliation scheduled (hourly)");
    }, 90000);
  } else {
    console.log("[Scheduler] ⏭️ Payment reconciliation skipped (on-prem/payment gateway disabled)");
  }
  
  // Email retry (every 15 minutes)
  setTimeout(async () => {
    const canRun = await shouldRunJob('email_retry', EMAIL_RETRY_INTERVAL);
    if (!canRun) {
      console.log("[Scheduler] Skipping initial email retry - already ran within interval");
    } else {
      console.log("[Scheduler] Running initial email retry job...");
      try {
        const result = await EmailSchedulerService.retryFailedEmails();
        console.log(`[Scheduler] Initial email retry: ${result.succeeded} succeeded, ${result.failed} failed (retried ${result.retried})`);
        await markJobRun('email_retry');
      } catch (error) {
        console.error("[Scheduler] Initial email retry error:", error);
      }
    }
    
    setInterval(async () => {
      const canRun = await shouldRunJob('email_retry', EMAIL_RETRY_INTERVAL);
      if (!canRun) {
        console.log("[Scheduler] Skipping scheduled email retry - already ran within interval");
        return;
      }
      console.log("[Scheduler] Running scheduled email retry job...");
      try {
        const result = await EmailSchedulerService.retryFailedEmails();
        console.log(`[Scheduler] Email retry: ${result.succeeded} succeeded, ${result.failed} failed (retried ${result.retried})`);
        await markJobRun('email_retry');
      } catch (error) {
        console.error("[Scheduler] Email retry error:", error);
      }
    }, EMAIL_RETRY_INTERVAL);
    
    console.log("[Scheduler] Email retry scheduled (every 15 minutes)");
  }, 120000);
  
  // Invoice reminders (daily)
  setTimeout(async () => {
    const canRun = await shouldRunJob('invoice_reminders', INVOICE_REMINDER_INTERVAL);
    if (!canRun) {
      console.log("[Scheduler] Skipping initial invoice reminders - already ran within interval");
    } else {
      console.log("[Scheduler] Running initial invoice reminder job...");
      try {
        const result = await EmailSchedulerService.sendInvoiceReminders();
        console.log(`[Scheduler] Initial invoice reminders: ${result.sent} sent, ${result.failed} failed`);
        await markJobRun('invoice_reminders');
      } catch (error) {
        console.error("[Scheduler] Initial invoice reminder error:", error);
      }
    }
    
    setInterval(async () => {
      const canRun = await shouldRunJob('invoice_reminders', INVOICE_REMINDER_INTERVAL);
      if (!canRun) {
        console.log("[Scheduler] Skipping scheduled invoice reminders - already ran within interval");
        return;
      }
      console.log("[Scheduler] Running scheduled invoice reminder job...");
      try {
        const result = await EmailSchedulerService.sendInvoiceReminders();
        console.log(`[Scheduler] Invoice reminders: ${result.sent} sent, ${result.failed} failed`);
        await markJobRun('invoice_reminders');
      } catch (error) {
        console.error("[Scheduler] Invoice reminder error:", error);
      }
    }, INVOICE_REMINDER_INTERVAL);
    
    console.log("[Scheduler] Invoice reminders scheduled (daily)");
  }, 150000);
  
  // Password reset token cleanup (daily)
  setTimeout(async () => {
    const canRun = await shouldRunJob('password_reset_cleanup', 24 * 60 * 60 * 1000);
    if (!canRun) {
      console.log("[Scheduler] Skipping initial password reset token cleanup - already ran within interval");
    } else {
      console.log("[Scheduler] Running initial password reset token cleanup...");
      try {
        const count = await PasswordResetService.cleanupExpiredTokens();
        console.log(`[Scheduler] Initial token cleanup: ${count} expired tokens removed`);
        await markJobRun('password_reset_cleanup');
      } catch (error) {
        console.error("[Scheduler] Initial token cleanup error:", error);
      }
    }
    
    setInterval(async () => {
      const canRun = await shouldRunJob('password_reset_cleanup', 24 * 60 * 60 * 1000);
      if (!canRun) {
        console.log("[Scheduler] Skipping scheduled password reset token cleanup - already ran within interval");
        return;
      }
      console.log("[Scheduler] Running scheduled password reset token cleanup...");
      try {
        const count = await PasswordResetService.cleanupExpiredTokens();
        console.log(`[Scheduler] Token cleanup: ${count} expired tokens removed`);
        await markJobRun('password_reset_cleanup');
      } catch (error) {
        console.error("[Scheduler] Token cleanup error:", error);
      }
    }, 24 * 60 * 60 * 1000);
    
    console.log("[Scheduler] Password reset token cleanup scheduled (daily)");
  }, 180000);
  
  // Rate limiter cache cleanup (hourly) - in-memory only, no persistent guard needed
  setTimeout(async () => {
    console.log("[Scheduler] Running initial rate limiter cache cleanup...");
    
    try {
      PasswordResetRateLimiter.cleanup();
      console.log("[Scheduler] Initial rate limiter cache cleanup completed");
    } catch (error) {
      console.error("[Scheduler] Initial rate limiter cleanup error:", error);
    } finally {
      setInterval(() => {
        console.log("[Scheduler] Running scheduled rate limiter cache cleanup...");
        try {
          PasswordResetRateLimiter.cleanup();
          console.log("[Scheduler] Rate limiter cache cleanup completed");
        } catch (error) {
          console.error("[Scheduler] Rate limiter cleanup error:", error);
        }
      }, 60 * 60 * 1000);
      
      console.log("[Scheduler] Rate limiter cache cleanup scheduled (hourly)");
    }
  }, 210000);
  
  // Webhook event cleanup (daily)
  setTimeout(async () => {
    const canRun = await shouldRunJob('webhook_cleanup', WEBHOOK_CLEANUP_INTERVAL);
    if (!canRun) {
      console.log("[Scheduler] Skipping initial webhook event cleanup - already ran within interval");
    } else {
      console.log("[Scheduler] Running initial webhook event cleanup...");
      try {
        const count = await WebhookDeduplicationService.cleanupOldEvents(WEBHOOK_EVENTS_RETENTION_DAYS);
        console.log(`[Scheduler] Initial webhook event cleanup: ${count} old events removed`);
        
        const stats = await WebhookDeduplicationService.getEventStats();
        console.log(`[Scheduler] Webhook event stats (24h): ${stats.totalEvents} total, ${stats.successfulEvents} successful, ${stats.failedEvents} failed, avg ${stats.avgProcessingTimeMs.toFixed(0)}ms`);
        await markJobRun('webhook_cleanup');
      } catch (error) {
        console.error("[Scheduler] Initial webhook event cleanup error:", error);
      }
    }
    
    setInterval(async () => {
      const canRun = await shouldRunJob('webhook_cleanup', WEBHOOK_CLEANUP_INTERVAL);
      if (!canRun) {
        console.log("[Scheduler] Skipping scheduled webhook event cleanup - already ran within interval");
        return;
      }
      console.log("[Scheduler] Running scheduled webhook event cleanup...");
      try {
        const count = await WebhookDeduplicationService.cleanupOldEvents(WEBHOOK_EVENTS_RETENTION_DAYS);
        console.log(`[Scheduler] Webhook event cleanup: ${count} old events removed`);
        
        const stats = await WebhookDeduplicationService.getEventStats();
        console.log(`[Scheduler] Webhook event stats (24h): ${stats.totalEvents} total, ${stats.successfulEvents} successful, ${stats.failedEvents} failed, avg ${stats.avgProcessingTimeMs.toFixed(0)}ms`);
        await markJobRun('webhook_cleanup');
      } catch (error) {
        console.error("[Scheduler] Webhook event cleanup error:", error);
      }
    }, WEBHOOK_CLEANUP_INTERVAL);
    
    console.log("[Scheduler] Webhook event cleanup scheduled (daily)");
  }, 240000);
  
  // Course draft cleanup (daily)
  setTimeout(async () => {
    const canRun = await shouldRunJob('draft_cleanup', DRAFT_CLEANUP_INTERVAL);
    if (!canRun) {
      console.log("[Scheduler] Skipping initial course draft cleanup - already ran within interval");
    } else {
      console.log("[Scheduler] Running initial course draft cleanup...");
      try {
        const result = await cleanupAbandonedDrafts();
        console.log(`[Scheduler] Initial draft cleanup: ${result.deleted} drafts deleted, ${result.documentsDeleted} documents removed, ${result.storageFilesDeleted} storage files cleaned`);
        await markJobRun('draft_cleanup');
      } catch (error) {
        console.error("[Scheduler] Initial draft cleanup error:", error);
      }
    }
    
    setInterval(async () => {
      const canRun = await shouldRunJob('draft_cleanup', DRAFT_CLEANUP_INTERVAL);
      if (!canRun) {
        console.log("[Scheduler] Skipping scheduled course draft cleanup - already ran within interval");
        return;
      }
      console.log("[Scheduler] Running scheduled course draft cleanup...");
      try {
        const result = await cleanupAbandonedDrafts();
        console.log(`[Scheduler] Draft cleanup: ${result.deleted} drafts deleted, ${result.documentsDeleted} documents removed, ${result.storageFilesDeleted} storage files cleaned`);
        await markJobRun('draft_cleanup');
      } catch (error) {
        console.error("[Scheduler] Draft cleanup error:", error);
      }
    }, DRAFT_CLEANUP_INTERVAL);
    
    console.log("[Scheduler] Course draft cleanup scheduled (daily)");
  }, 270000);
  
  // Annual plan promotion scheduler (runs monthly on the 1st)
  setTimeout(async () => {
    console.log("[Scheduler] Starting annual plan promotion scheduler...");
    try {
      await annualPlanPromotionScheduler.start();
      console.log("[Scheduler] Annual plan promotion scheduler started");
    } catch (error) {
      console.error("[Scheduler] Failed to start annual plan promotion scheduler:", error);
    }
  }, 300000);
  
  // Trial expiry scheduler (runs daily)
  setTimeout(async () => {
    console.log("[Scheduler] Starting trial expiry scheduler...");
    try {
      await trialExpiryScheduler.start();
      console.log("[Scheduler] Trial expiry scheduler started");
    } catch (error) {
      console.error("[Scheduler] Failed to start trial expiry scheduler:", error);
    }
  }, 330000);
  
  console.log("[Scheduler] Background tasks initialized");
}
