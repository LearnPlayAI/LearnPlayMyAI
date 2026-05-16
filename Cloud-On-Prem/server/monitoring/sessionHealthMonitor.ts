/**
 * Session Health Monitor
 * 
 * Tracks session-related health metrics for production monitoring:
 * - Session context build times
 * - Session refresh rates
 * - Session invalidation events
 * - Context cache efficiency (reuse vs rebuild)
 */

export interface SessionBuildRecord {
  userId: string;
  duration: number;
  timestamp: Date;
  success: boolean;
  organizationCount?: number;
  contextSizeBytes?: number;
}

export interface SessionRefreshRecord {
  userId: string;
  timestamp: Date;
  success: boolean;
  reason?: string;
}

export interface SessionInvalidationRecord {
  userId: string;
  reason: string;
  timestamp: Date;
  scope: 'user' | 'organization' | 'bulk';
  affectedUsers?: number;
}

export interface CacheEfficiencyRecord {
  timestamp: Date;
  cacheHit: boolean;
  endpoint?: string;
}

export interface SessionHealthMetrics {
  buildTimes: {
    total: number;
    successful: number;
    failed: number;
    avgDurationMs: number;
    maxDurationMs: number;
    minDurationMs: number;
    p95DurationMs: number;
    slowBuilds: number;
    recentBuilds: SessionBuildRecord[];
  };
  refreshes: {
    total: number;
    successful: number;
    failed: number;
    recentRefreshes: SessionRefreshRecord[];
  };
  invalidations: {
    total: number;
    byReason: Record<string, number>;
    byScope: Record<string, number>;
    totalAffectedUsers: number;
    recentInvalidations: SessionInvalidationRecord[];
  };
  cacheEfficiency: {
    totalRequests: number;
    cacheHits: number;
    cacheMisses: number;
    hitRatePercentage: number;
    byEndpoint: Record<string, { hits: number; misses: number }>;
  };
  health: {
    status: 'healthy' | 'degraded' | 'critical';
    warnings: string[];
    lastResetTime: Date;
    uptimeHours: number;
  };
}

interface SessionHealthConfig {
  slowBuildThresholdMs: number;
  maxRecentBuilds: number;
  maxRecentRefreshes: number;
  maxRecentInvalidations: number;
  criticalBuildTimeMs: number;
  degradedHitRateThreshold: number;
  criticalHitRateThreshold: number;
}

const DEFAULT_CONFIG: SessionHealthConfig = {
  slowBuildThresholdMs: 500,
  maxRecentBuilds: 50,
  maxRecentRefreshes: 50,
  maxRecentInvalidations: 100,
  criticalBuildTimeMs: 2000,
  degradedHitRateThreshold: 50,
  criticalHitRateThreshold: 20,
};

class SessionHealthMonitor {
  private config: SessionHealthConfig;
  private lastResetTime: Date = new Date();
  
  private buildRecords: SessionBuildRecord[] = [];
  private refreshRecords: SessionRefreshRecord[] = [];
  private invalidationRecords: SessionInvalidationRecord[] = [];
  private cacheRecords: CacheEfficiencyRecord[] = [];
  
  private totalBuilds = 0;
  private successfulBuilds = 0;
  private failedBuilds = 0;
  private totalBuildDuration = 0;
  private maxBuildDuration = 0;
  private minBuildDuration = Infinity;
  private slowBuildCount = 0;
  private buildDurations: number[] = [];
  
  private totalRefreshes = 0;
  private successfulRefreshes = 0;
  private failedRefreshes = 0;
  
  private totalInvalidations = 0;
  private invalidationsByReason: Record<string, number> = {};
  private invalidationsByScope: Record<string, number> = {};
  private totalAffectedUsers = 0;
  
  private cacheHits = 0;
  private cacheMisses = 0;
  private cacheByEndpoint: Record<string, { hits: number; misses: number }> = {};
  
  private hourlyResetInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<SessionHealthConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.scheduleHourlyReset();
  }

  trackContextBuild(
    userId: string,
    durationMs: number,
    success: boolean,
    organizationCount?: number,
    contextSizeBytes?: number
  ): void {
    const record: SessionBuildRecord = {
      userId,
      duration: durationMs,
      timestamp: new Date(),
      success,
      organizationCount,
      contextSizeBytes,
    };

    this.totalBuilds++;
    this.totalBuildDuration += durationMs;
    this.buildDurations.push(durationMs);
    
    if (durationMs > this.maxBuildDuration) {
      this.maxBuildDuration = durationMs;
    }
    if (durationMs < this.minBuildDuration) {
      this.minBuildDuration = durationMs;
    }
    
    if (success) {
      this.successfulBuilds++;
    } else {
      this.failedBuilds++;
    }
    
    if (durationMs > this.config.slowBuildThresholdMs) {
      this.slowBuildCount++;
      console.warn(
        `⚠️ [SessionHealth] Slow context build: ${durationMs}ms for user ${userId.slice(0, 8)}... (threshold: ${this.config.slowBuildThresholdMs}ms)`
      );
    }
    
    if (durationMs > this.config.criticalBuildTimeMs) {
      console.error(
        `🚨 [SessionHealth] CRITICAL: Context build took ${durationMs}ms for user ${userId.slice(0, 8)}... (critical threshold: ${this.config.criticalBuildTimeMs}ms)`
      );
    }

    this.buildRecords.push(record);
    if (this.buildRecords.length > this.config.maxRecentBuilds) {
      this.buildRecords.shift();
    }
    
    if (this.buildDurations.length > 1000) {
      this.buildDurations = this.buildDurations.slice(-1000);
    }
  }

  trackContextRefresh(userId: string, success: boolean, reason?: string): void {
    const record: SessionRefreshRecord = {
      userId,
      timestamp: new Date(),
      success,
      reason,
    };

    this.totalRefreshes++;
    if (success) {
      this.successfulRefreshes++;
    } else {
      this.failedRefreshes++;
    }

    this.refreshRecords.push(record);
    if (this.refreshRecords.length > this.config.maxRecentRefreshes) {
      this.refreshRecords.shift();
    }
  }

  trackInvalidation(
    userId: string,
    reason: string,
    scope: 'user' | 'organization' | 'bulk' = 'user',
    affectedUsers: number = 1
  ): void {
    const record: SessionInvalidationRecord = {
      userId,
      reason,
      timestamp: new Date(),
      scope,
      affectedUsers,
    };

    this.totalInvalidations++;
    this.invalidationsByReason[reason] = (this.invalidationsByReason[reason] || 0) + 1;
    this.invalidationsByScope[scope] = (this.invalidationsByScope[scope] || 0) + 1;
    this.totalAffectedUsers += affectedUsers;

    this.invalidationRecords.push(record);
    if (this.invalidationRecords.length > this.config.maxRecentInvalidations) {
      this.invalidationRecords.shift();
    }

    console.log(
      `🔄 [SessionHealth] Session invalidation: scope=${scope}, reason="${reason}", affected=${affectedUsers} user(s)`
    );
  }

  trackCacheEfficiency(cacheHit: boolean, endpoint?: string): void {
    const record: CacheEfficiencyRecord = {
      timestamp: new Date(),
      cacheHit,
      endpoint,
    };

    if (cacheHit) {
      this.cacheHits++;
    } else {
      this.cacheMisses++;
    }

    if (endpoint) {
      if (!this.cacheByEndpoint[endpoint]) {
        this.cacheByEndpoint[endpoint] = { hits: 0, misses: 0 };
      }
      if (cacheHit) {
        this.cacheByEndpoint[endpoint].hits++;
      } else {
        this.cacheByEndpoint[endpoint].misses++;
      }
    }

    this.cacheRecords.push(record);
    if (this.cacheRecords.length > 1000) {
      this.cacheRecords.shift();
    }
  }

  private calculateP95Duration(): number {
    if (this.buildDurations.length === 0) return 0;
    const sorted = [...this.buildDurations].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    return sorted[p95Index] || sorted[sorted.length - 1];
  }

  private calculateHealthStatus(): { status: 'healthy' | 'degraded' | 'critical'; warnings: string[] } {
    const warnings: string[] = [];
    let isCritical = false;
    let isDegraded = false;

    const totalCacheRequests = this.cacheHits + this.cacheMisses;
    const hitRate = totalCacheRequests > 0 ? (this.cacheHits / totalCacheRequests) * 100 : 100;

    if (hitRate < this.config.criticalHitRateThreshold && totalCacheRequests > 10) {
      isCritical = true;
      warnings.push(`Cache hit rate critically low: ${hitRate.toFixed(1)}%`);
    } else if (hitRate < this.config.degradedHitRateThreshold && totalCacheRequests > 10) {
      isDegraded = true;
      warnings.push(`Cache hit rate below threshold: ${hitRate.toFixed(1)}%`);
    }

    if (this.slowBuildCount > 0 && this.totalBuilds > 0) {
      const slowBuildRate = (this.slowBuildCount / this.totalBuilds) * 100;
      if (slowBuildRate > 10) {
        isDegraded = true;
        warnings.push(`${slowBuildRate.toFixed(1)}% of builds are slow (>${this.config.slowBuildThresholdMs}ms)`);
      }
    }

    if (this.failedBuilds > 0 && this.totalBuilds > 0) {
      const failRate = (this.failedBuilds / this.totalBuilds) * 100;
      if (failRate > 5) {
        isCritical = true;
        warnings.push(`Build failure rate: ${failRate.toFixed(1)}%`);
      } else if (failRate > 1) {
        isDegraded = true;
        warnings.push(`Build failure rate elevated: ${failRate.toFixed(1)}%`);
      }
    }

    if (this.maxBuildDuration > this.config.criticalBuildTimeMs) {
      warnings.push(`Max build time (${this.maxBuildDuration}ms) exceeds critical threshold`);
    }

    const status: 'healthy' | 'degraded' | 'critical' = isCritical ? 'critical' : isDegraded ? 'degraded' : 'healthy';
    return { status, warnings };
  }

  getMetrics(): SessionHealthMetrics {
    const avgDurationMs = this.totalBuilds > 0 
      ? this.totalBuildDuration / this.totalBuilds 
      : 0;

    const totalCacheRequests = this.cacheHits + this.cacheMisses;
    const hitRatePercentage = totalCacheRequests > 0 
      ? (this.cacheHits / totalCacheRequests) * 100 
      : 100;

    const { status, warnings } = this.calculateHealthStatus();

    const uptimeMs = Date.now() - this.lastResetTime.getTime();
    const uptimeHours = uptimeMs / (1000 * 60 * 60);

    return {
      buildTimes: {
        total: this.totalBuilds,
        successful: this.successfulBuilds,
        failed: this.failedBuilds,
        avgDurationMs: Math.round(avgDurationMs * 100) / 100,
        maxDurationMs: this.maxBuildDuration === 0 ? 0 : this.maxBuildDuration,
        minDurationMs: this.minBuildDuration === Infinity ? 0 : this.minBuildDuration,
        p95DurationMs: this.calculateP95Duration(),
        slowBuilds: this.slowBuildCount,
        recentBuilds: [...this.buildRecords].slice(-10),
      },
      refreshes: {
        total: this.totalRefreshes,
        successful: this.successfulRefreshes,
        failed: this.failedRefreshes,
        recentRefreshes: [...this.refreshRecords].slice(-10),
      },
      invalidations: {
        total: this.totalInvalidations,
        byReason: { ...this.invalidationsByReason },
        byScope: { ...this.invalidationsByScope },
        totalAffectedUsers: this.totalAffectedUsers,
        recentInvalidations: [...this.invalidationRecords].slice(-20),
      },
      cacheEfficiency: {
        totalRequests: totalCacheRequests,
        cacheHits: this.cacheHits,
        cacheMisses: this.cacheMisses,
        hitRatePercentage: Math.round(hitRatePercentage * 100) / 100,
        byEndpoint: { ...this.cacheByEndpoint },
      },
      health: {
        status,
        warnings,
        lastResetTime: this.lastResetTime,
        uptimeHours: Math.round(uptimeHours * 100) / 100,
      },
    };
  }

  getSummary(): string {
    const metrics = this.getMetrics();
    const lines: string[] = [
      '',
      '📊 [Session Health Summary]',
      '='.repeat(60),
      `Health Status: ${metrics.health.status.toUpperCase()}`,
      '',
      '🔨 Context Builds:',
      `   Total: ${metrics.buildTimes.total} | Success: ${metrics.buildTimes.successful} | Failed: ${metrics.buildTimes.failed}`,
      `   Avg: ${metrics.buildTimes.avgDurationMs}ms | P95: ${metrics.buildTimes.p95DurationMs}ms | Max: ${metrics.buildTimes.maxDurationMs}ms`,
      `   Slow Builds (>${this.config.slowBuildThresholdMs}ms): ${metrics.buildTimes.slowBuilds}`,
      '',
      '🔄 Refreshes:',
      `   Total: ${metrics.refreshes.total} | Success: ${metrics.refreshes.successful} | Failed: ${metrics.refreshes.failed}`,
      '',
      '🚫 Invalidations:',
      `   Total: ${metrics.invalidations.total} | Affected Users: ${metrics.invalidations.totalAffectedUsers}`,
      '',
      '💾 Cache Efficiency:',
      `   Hits: ${metrics.cacheEfficiency.cacheHits} | Misses: ${metrics.cacheEfficiency.cacheMisses}`,
      `   Hit Rate: ${metrics.cacheEfficiency.hitRatePercentage}%`,
    ];

    if (metrics.health.warnings.length > 0) {
      lines.push('', '⚠️  Warnings:');
      metrics.health.warnings.forEach(w => lines.push(`   - ${w}`));
    }

    lines.push('='.repeat(60), '');
    return lines.join('\n');
  }

  logSummary(): void {
    console.log(this.getSummary());
  }

  private scheduleHourlyReset(): void {
    const msUntilNextHour = (60 - new Date().getMinutes()) * 60 * 1000;
    
    const resetBootstrapTimer = setTimeout(() => {
      this.logSummary();
      this.reset();
      
      this.hourlyResetInterval = setInterval(() => {
        this.logSummary();
        this.reset();
      }, 60 * 60 * 1000);
      if (typeof this.hourlyResetInterval.unref === 'function') {
        this.hourlyResetInterval.unref();
      }
    }, msUntilNextHour);
    if (typeof resetBootstrapTimer.unref === 'function') {
      resetBootstrapTimer.unref();
    }
  }

  reset(): void {
    console.log('[SessionHealthMonitor] Resetting metrics for new hour');
    
    this.buildRecords = [];
    this.refreshRecords = [];
    this.invalidationRecords = [];
    this.cacheRecords = [];
    
    this.totalBuilds = 0;
    this.successfulBuilds = 0;
    this.failedBuilds = 0;
    this.totalBuildDuration = 0;
    this.maxBuildDuration = 0;
    this.minBuildDuration = Infinity;
    this.slowBuildCount = 0;
    this.buildDurations = [];
    
    this.totalRefreshes = 0;
    this.successfulRefreshes = 0;
    this.failedRefreshes = 0;
    
    this.totalInvalidations = 0;
    this.invalidationsByReason = {};
    this.invalidationsByScope = {};
    this.totalAffectedUsers = 0;
    
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.cacheByEndpoint = {};
    
    this.lastResetTime = new Date();
  }

  updateConfig(config: Partial<SessionHealthConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[SessionHealthMonitor] Config updated:', this.config);
  }

  getConfig(): SessionHealthConfig {
    return { ...this.config };
  }
}

export const sessionHealthMonitor = new SessionHealthMonitor();

export function trackContextBuild(
  userId: string,
  durationMs: number,
  success: boolean,
  organizationCount?: number,
  contextSizeBytes?: number
): void {
  sessionHealthMonitor.trackContextBuild(userId, durationMs, success, organizationCount, contextSizeBytes);
}

export function trackContextRefresh(userId: string, success: boolean, reason?: string): void {
  sessionHealthMonitor.trackContextRefresh(userId, success, reason);
}

export function trackSessionInvalidation(
  userId: string,
  reason: string,
  scope: 'user' | 'organization' | 'bulk' = 'user',
  affectedUsers: number = 1
): void {
  sessionHealthMonitor.trackInvalidation(userId, reason, scope, affectedUsers);
}

export function trackCacheEfficiency(cacheHit: boolean, endpoint?: string): void {
  sessionHealthMonitor.trackCacheEfficiency(cacheHit, endpoint);
}

export function getSessionHealthMetrics(): SessionHealthMetrics {
  return sessionHealthMonitor.getMetrics();
}

export function resetSessionHealthMetrics(): void {
  sessionHealthMonitor.reset();
}

export function getSessionHealthSummary(): string {
  return sessionHealthMonitor.getSummary();
}
