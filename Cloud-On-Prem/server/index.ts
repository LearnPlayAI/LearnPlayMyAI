import "./loadEnv";
import express, { type Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { registerRoutes } from "./routes";
import { storage } from "./storage";
import { performanceMonitor } from "./monitoring/performanceMonitor";
import { deriveAndSaveCloudPublicKey } from './utils/deriveCloudPublicKey';
import { enforceRuntimeIdentityFailClosed } from "./services/runtimeIdentityService";

// Global handler for unhandled promise rejections - prevents crashes from Neon driver errors
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('⚠️ Unhandled Rejection:', reason?.message || reason);
});

// Global handler for uncaught exceptions - log but don't crash for known driver issues
process.on('uncaughtException', (error: any) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

function enforceDeploymentModeFromBuildMetadata(): void {
  let currentDir = process.cwd();
  try {
    currentDir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    // Fallback to cwd when running in environments without import.meta.url mapping.
  }

  const candidates = [
    '/opt/learnplay/version.json',
    path.join(process.cwd(), 'version.json'),
    path.resolve(currentDir, '../version.json'),
  ];

  let platform: string | null = null;
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const raw = fs.readFileSync(candidate, 'utf-8');
      const parsed = JSON.parse(raw) as { platform?: string };
      if (parsed?.platform && typeof parsed.platform === 'string') {
        platform = parsed.platform.trim().toLowerCase();
        break;
      }
    } catch {
      // Ignore parse/read errors and continue scanning candidates.
    }
  }

  if (!platform) {
    return;
  }

  const envMode = (process.env.DEPLOYMENT_MODE || '').trim().toLowerCase();

  if (platform.includes('onprem')) {
    if (envMode === 'cloud' || process.env.ONPREM_MODE === 'false') {
      console.warn('⚠️ Build platform is onprem; ignoring cloud-mode env overrides.');
    }
    process.env.PLATFORM_ENV = 'onprem';
    process.env.DEPLOYMENT_MODE = 'onprem';
    process.env.ONPREM_MODE = 'true';
    process.env.ONPREM_OWN_API_KEYS = 'true';
    // On-prem license enforcement is mandatory and cannot be disabled.
    process.env.ONPREM_LICENSE_ENFORCEMENT = 'true';
    if (process.env.PAYMENT_GATEWAY_ENABLED === undefined) {
      process.env.PAYMENT_GATEWAY_ENABLED = 'false';
    }
    return;
  }

  if (platform.includes('cloud')) {
    if (envMode === 'onprem' || process.env.ONPREM_MODE === 'true') {
      console.warn('⚠️ Build platform is cloud; ignoring onprem-mode env overrides.');
    }
    process.env.PLATFORM_ENV = 'cloud';
    process.env.DEPLOYMENT_MODE = 'cloud';
    process.env.ONPREM_MODE = 'false';
    process.env.ONPREM_OWN_API_KEYS = 'false';
    if (process.env.PAYMENT_GATEWAY_ENABLED === undefined) {
      process.env.PAYMENT_GATEWAY_ENABLED = 'true';
    }
  }
}

enforceDeploymentModeFromBuildMetadata();
enforceRuntimeIdentityFailClosed();

export const app = express();
const shouldTrustProxy =
  process.env.TRUST_PROXY === 'true' ||
  process.env.COOKIE_SECURE === 'true' ||
  process.env.ONPREM_MODE === 'true';
if (shouldTrustProxy) {
  app.set('trust proxy', 1);
}
// Capture raw body for webhook signature verification
app.use(express.json({
  limit: '10gb',
  verify: (req: any, res, buf, encoding) => {
    // Store raw body for webhook endpoints that need signature verification
    // Include both main and legacy webhook endpoints (use startsWith to handle query strings)
    if (req.url?.startsWith('/api/webhooks/') || req.url?.startsWith('/api/payments/webhook')) {
      req.rawBody = buf.toString('utf8');
    }
  }
}));
app.use(express.urlencoded({
  extended: false,
  limit: '10gb',
  parameterLimit: 1000000,
}));

deriveAndSaveCloudPublicKey();

// Performance monitoring middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    
    // Track performance metrics for API requests
    if (path.startsWith("/api")) {
      performanceMonitor.trackRequest(path, duration);
      
      // Log slow requests (>500ms)
      if (duration > 500) {
        console.warn(`⚠️  [Slow Request] ${req.method} ${path} took ${duration}ms`);
      }
      
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Check database readiness before starting server
  try {
    const { checkDatabaseReady, ensureCriticalTables } = await import('./ensureDatabase');
    const isReady = await checkDatabaseReady();
    
    if (!isReady) {
      console.error('❌ Database is not ready. Please run: npm run db:push');
      process.exit(1);
    }
    
    await ensureCriticalTables();
    const { IntegrationConfigService } = await import('./services/integrationConfigService');
    await IntegrationConfigService.bootstrapFromLegacyEnvIfNeeded();
  } catch (error: any) {
    console.error('❌ Database validation failed:', error?.message || error);
    console.error('💡 This usually means the database schema needs to be initialized.');
    console.error('💡 Run: npm run db:push');
    process.exit(1);
  }

  // Initialize feature flags and log configuration
  const { initializeFeatureFlags } = await import('./config/featureFlags');
  await initializeFeatureFlags();
  console.log(''); // Add spacing in logs

  // Production security check: Enforce PASSWORD_RESET_SECRET
  if (process.env.NODE_ENV === 'production' && !process.env.PASSWORD_RESET_SECRET) {
    console.warn('⚠️  [Security] PASSWORD_RESET_SECRET not set in production!');
    console.warn('⚠️  Password reset tokens will use SESSION_SECRET as fallback.');
    console.warn('⚠️  For enhanced security, set PASSWORD_RESET_SECRET environment variable.');
    console.warn('⚠️  This keeps password reset tokens isolated from session cookies.');
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err?.status || err?.statusCode || 500;
    const message = err?.message || "Internal Server Error";

    // Never rethrow from Express error middleware.
    // Rethrows can crash the process after a response is already sent,
    // which drops in-memory session state and forces user logout loops.
    if (res.headersSent) {
      console.error("[ExpressError] Headers already sent:", err);
      return;
    }

    res.status(status).json({ message });
    console.error("[ExpressError]", err);
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    const { serveStatic } = await import("./vite-onprem");
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    log(`serving on port ${port}`);
    log(`Environment: ${app.get("env")}`);
    log(`NODE_ENV: ${process.env.NODE_ENV}`);
    
    // Log feature flags configuration
    const { logFeatureFlags, isOnPremMode } = await import('./featureFlags');
    logFeatureFlags();

    if (isOnPremMode()) {
      try {
        const { PptxHtmlConverterService } = await import('./services/pptxHtmlConverterService');
        await PptxHtmlConverterService.checkLibreOfficeAvailable();
      } catch (error: any) {
        console.warn('⚠️ LibreOffice check failed:', error?.message || error);
      }
    }
    
    // Data safety invariant:
    // Startup must not perform implicit persistent-data remediation or seeding.
    // Any data-changing maintenance must run via explicit operator-invoked scripts.

    // NOTE: Do not auto-seed/normalize gamification data on startup.
    // Admin-managed gamification settings must persist exactly as configured.
    // Manual initialization remains available from Gamification Settings.
    
    // NOTE: Do not auto-seed catalog or pricing data on startup.
    // These operations are now explicit maintenance/bootstrap steps only.
    
    // Start season pass scheduler (auto-transitions based on dates)
    try {
      const { seasonPassScheduler } = await import('./seasonPassScheduler');
      seasonPassScheduler.start();
    } catch (error: any) {
      console.error('⚠️ Failed to start season pass scheduler:', error?.message || error);
    }

    // Start challenge scheduler (auto-resets daily/weekly challenges)
    try {
      const { challengeScheduler } = await import('./challengeScheduler');
      challengeScheduler.start();
    } catch (error: any) {
      console.error('⚠️ Failed to start challenge scheduler:', error?.message || error);
    }

    // Start Gamma theme sync scheduler (syncs themes every 24 hours)
    try {
      const { startSchedulers } = await import('./scheduler');
      startSchedulers();
    } catch (error: any) {
      console.error('⚠️ Failed to start Gamma theme scheduler:', error?.message || error);
    }

    // Start job queue worker (processes Gamma API jobs)
    try {
      const { JobQueueWorker } = await import('./workers/jobQueueWorker');
      JobQueueWorker.start();
    } catch (error: any) {
      console.error('⚠️ Failed to start job queue worker:', error?.message || error);
    }

    // Start translation search index worker (idempotent indexing + DLQ replay)
    try {
      const { TranslationIndexWorker } = await import('./workers/translationIndexWorker');
      TranslationIndexWorker.start();
    } catch (error: any) {
      console.error('⚠️ Failed to start translation index worker:', error?.message || error);
    }

    // NOTE: No automatic recovery writers on startup.
    // Recovery operations must be invoked explicitly by maintenance workflows.

    // Start billing scheduler (handles subscription invoicing, reminders, grace periods, suspensions)
    try {
      const { BillingScheduler } = await import('./services/billingScheduler');
      BillingScheduler.start();
    } catch (error: any) {
      console.error('⚠️ Failed to start billing scheduler:', error?.message || error);
    }

    // Start enrollment email scheduler (sends daily enrollment summary to SuperAdmin/CustSuper)
    try {
      const { EnrollmentEmailScheduler } = await import('./services/enrollmentEmailScheduler');
      EnrollmentEmailScheduler.start();
    } catch (error: any) {
      console.error('⚠️ Failed to start enrollment email scheduler:', error?.message || error);
    }

    // Start enterprise license scheduler (cloud PRD control-plane reminders and grace tracking)
    try {
      const { EnterpriseLicenseScheduler } = await import('./services/enterpriseLicenseScheduler');
      EnterpriseLicenseScheduler.start();
    } catch (error: any) {
      console.error('⚠️ Failed to start enterprise license scheduler:', error?.message || error);
    }

    // Start onprem automatic check-in scheduler (only active in onprem mode)
    try {
      const { OnpremLicenseScheduler } = await import('./services/onpremLicenseScheduler');
      OnpremLicenseScheduler.start();
    } catch (error: any) {
      console.error('⚠️ Failed to start onprem license scheduler:', error?.message || error);
    }

    // Run data integrity checks (informational - won't prevent startup)
    try {
      const { performDataIntegrityCheck } = await import('./integrityCheck');
      await performDataIntegrityCheck();
    } catch (error: any) {
      console.error('⚠️ Data integrity check failed:', error?.message || error);
    }

    // Start periodic cleanup for expired games and sessions
    startPeriodicCleanup();
    
    // REMOVED: Periodic leaderboard sync for battle cards
    // The system now focuses on quiz-based learning only
    // Battle cards remain playable but without competitive leaderboard tracking
    // startPeriodicLeaderboardSync();
  }).on('error', (err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
  
  async function startPeriodicCleanup() {
    const cleanupInterval = 15 * 60 * 1000; // 15 minutes
    
    const performCleanup = async () => {
      try {
        console.log('🧹 Running periodic cleanup...');
        
        // Clean up expired guest sessions (inactive for more than 24 hours)
        const expiredSessions = await storage.cleanupExpiredGuestSessions();
        if (expiredSessions > 0) {
          console.log(`🧹 Cleaned up ${expiredSessions} expired guest sessions`);
        }
        
        // Clean up abandoned games (inactive for more than 5 minutes)  
        const abandonedGames = await storage.cleanupAbandonedGames();
        if (abandonedGames > 0) {
          console.log(`🧹 Cleaned up ${abandonedGames} abandoned games`);
        }
        
        // Clean up expired games (inactive for more than 15 minutes)  
        const expiredGames = await storage.cleanupExpiredGames();
        if (expiredGames > 0) {
          console.log(`🧹 Cleaned up ${expiredGames} expired games`);
        }
        
        // Clean up expired webhook events (older than TTL)
        const { WebhookReplayProtection } = await import('./services/webhookReplayProtection');
        const expiredWebhooks = await WebhookReplayProtection.cleanupExpiredEvents();
        if (expiredWebhooks > 0) {
          console.log(`🧹 Cleaned up ${expiredWebhooks} expired webhook events`);
        }
        
        if (expiredSessions === 0 && abandonedGames === 0 && expiredGames === 0 && expiredWebhooks === 0) {
          console.log('🧹 Cleanup complete - no expired data found');
        }
      } catch (error) {
        console.error('❌ Error during periodic cleanup:', error);
      }
    };
    
    // Delay first cleanup by 10 seconds to avoid concurrent connection spike with daily reset
    setTimeout(() => {
      performCleanup().catch(err => console.error('❌ Error in initial cleanup:', err));
    }, 10000);
    
    // Set up periodic cleanup every 15 minutes
    setInterval(performCleanup, cleanupInterval);
    console.log(`🧹 Periodic cleanup scheduled - first run in 10 seconds, then every ${cleanupInterval / 60000} minutes`);
  }
  
  // Helper function to calculate and update leaderboard ranks
  async function updateLeaderboardRanks() {
    try {
      // Get all leaderboard entries sorted by ranking criteria
      const sortedEntries = await storage.getLeaderboard(1000); // Get all entries
      
      // Update each entry with its rank - use allSettled to prevent crashes from individual failures
      const updates = sortedEntries.map((entry, index) => 
        storage.updateLeaderboardRank(entry.gamerName, index + 1)
          .catch(err => {
            console.error(`⚠️ Failed to update rank for ${entry.gamerName}:`, err.message);
            return null;
          })
      );
      
      await Promise.allSettled(updates);
    } catch (error) {
      console.error('❌ Error updating leaderboard ranks:', error);
    }
  }

  async function startPeriodicLeaderboardSync() {
    const syncInterval = 15 * 60 * 1000; // 15 minutes (reduced from 5 to reduce DB load)
    let syncInProgress = false; // Prevent overlapping syncs
    
    const performSync = async () => {
      // Skip if previous sync still running
      if (syncInProgress) {
        console.log('⏭️ Skipping leaderboard sync - previous sync still in progress');
        return;
      }
      
      syncInProgress = true;
      try {
        console.log('🏆 Running periodic leaderboard sync...');
        
        // Use optimized batch query with JOIN - single query instead of N+1
        const playerStatsWithUsers = await storage.getAllPlayerStatsWithUsers();
        let syncedCount = 0;

        // Build all leaderboard entries in batch
        const updates = playerStatsWithUsers
          .filter(stats => stats.user) // Only process stats with valid users
          .map(stats => ({
            gamerName: stats.gamerName,
            data: {
              gamerName: stats.gamerName,
              avatarImageUrl: stats.user!.avatarImageUrl,
              country: stats.user!.country,
              playerTitle: stats.currentRank,
              totalWins: stats.totalWins,
              totalGames: stats.totalGamesPlayed,
              winPercentage: stats.winPercentage,
              bestWinStreak: stats.bestWinStreak,
              currentWinStreak: stats.currentWinStreak,
              averageGameDuration: stats.averageGameDuration,
              lastActiveAt: new Date(),
              updatedAt: new Date(),
            }
          }));
        
        // Batch upsert all entries
        for (const { gamerName, data } of updates) {
          try {
            await storage.upsertLeaderboardEntry(gamerName, data);
            syncedCount++;
          } catch (error: any) {
            console.error(`⚠️ Failed to sync leaderboard for ${gamerName}:`, error?.message || error);
          }
        }
        
        // Calculate and update ranks after syncing all entries
        if (syncedCount > 0) {
          try {
            await updateLeaderboardRanks();
            console.log(`🏆 Synced ${syncedCount} leaderboard entries and updated ranks`);
          } catch (rankError: any) {
            console.error('⚠️ Error updating leaderboard ranks:', rankError?.message || rankError);
            console.log('🏆 Leaderboard data synced, rank update skipped due to error');
          }
        } else {
          console.log('🏆 Leaderboard sync complete - no data to sync');
        }
      } catch (error: any) {
        console.error('⚠️ Error during leaderboard sync:', error?.message || error);
      } finally {
        syncInProgress = false; // Always release lock
      }
    };
    
    // Delay first sync by 60 seconds to let database connections stabilize
    setTimeout(() => {
      performSync().catch(err => console.error('⚠️ Error in initial leaderboard sync:', err?.message || err));
    }, 60000);
    
    // Set up periodic sync every 15 minutes after initial delay
    setInterval(() => performSync().catch(err => console.error('⚠️ Error in periodic leaderboard sync:', err?.message || err)), syncInterval);
    console.log(`🏆 Periodic leaderboard sync scheduled - first sync in 60 seconds, then every ${syncInterval / 1000 / 60} minutes`);
  }
  
  // Daily usage limits reset at midnight
  const scheduleNextReset = async () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const timeUntilMidnight = tomorrow.getTime() - now.getTime();
    
    setTimeout(async () => {
      console.log('🔄 Resetting daily usage limits for all organizations...');
      const { resetDailyLimitsForAllOrgs } = await import('./usageLimitMiddleware');
      await resetDailyLimitsForAllOrgs();
      scheduleNextReset();
    }, timeUntilMidnight);
    
    console.log(`⏰ Daily usage limits reset scheduled for midnight (${Math.round(timeUntilMidnight / 1000 / 60)} minutes)`);
  };
  
  const { resetDailyLimitsForAllOrgs } = await import('./usageLimitMiddleware');
  
  // Reset daily limits on startup, but don't crash if it fails
  try {
    await resetDailyLimitsForAllOrgs();
  } catch (error: any) {
    console.error('⚠️ Failed to reset daily limits on startup:', error?.message || error);
    console.log('⏰ Daily limits will be reset at the next scheduled midnight reset');
  }
  
  scheduleNextReset();
})();
