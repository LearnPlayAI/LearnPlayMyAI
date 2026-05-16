// @ts-nocheck
import { performanceMonitor } from './performanceMonitor';

const isTestEnv = process.env.NODE_ENV === 'test' || typeof process.env.JEST_WORKER_ID !== 'undefined';

export type AuthQueryType = 'fast_path' | 'slow_path';

interface AuthQueryRecord {
  type: AuthQueryType;
  context: string;
  timestamp: Date;
  duration?: number;
}

interface AuthQueryMetrics {
  totalQueries: number;
  fastPathHits: number;
  slowPathHits: number;
  hitRatePercentage: number;
  estimatedTimeSavedMs: number;
  avgSlowPathDurationMs: number;
  avgFastPathDurationMs: number;
  recentQueries: AuthQueryRecord[];
  hourlyBreakdown: {
    hour: string;
    fastPath: number;
    slowPath: number;
  }[];
  lastResetTime: Date;
  uptimeHours: number;
}

class AuthQueryTracker {
  private fastPathHits = 0;
  private slowPathHits = 0;
  private recentQueries: AuthQueryRecord[] = [];
  private maxRecentQueries = 100;
  private lastResetTime = new Date();
  private hourlyResetInterval: NodeJS.Timeout | null = null;
  
  private fastPathTotalDuration = 0;
  private slowPathTotalDuration = 0;
  
  private hourlyStats: Map<string, { fastPath: number; slowPath: number }> = new Map();

  private estimatedSlowPathDuration = 15;

  constructor() {
    if (!isTestEnv) {
      this.scheduleHourlyReset();
    }
  }

  trackAuthQuery(type: AuthQueryType, context: string, duration?: number) {
    const record: AuthQueryRecord = {
      type,
      context,
      timestamp: new Date(),
      duration,
    };

    if (type === 'fast_path') {
      this.fastPathHits++;
      if (duration !== undefined) {
        this.fastPathTotalDuration += duration;
      }
    } else {
      this.slowPathHits++;
      if (duration !== undefined) {
        this.slowPathTotalDuration += duration;
        this.estimatedSlowPathDuration = 
          (this.estimatedSlowPathDuration * 0.9) + (duration * 0.1);
      }
    }

    this.recentQueries.push(record);
    if (this.recentQueries.length > this.maxRecentQueries) {
      this.recentQueries.shift();
    }

    const hourKey = this.getHourKey(new Date());
    const hourStats = this.hourlyStats.get(hourKey) || { fastPath: 0, slowPath: 0 };
    if (type === 'fast_path') {
      hourStats.fastPath++;
    } else {
      hourStats.slowPath++;
    }
    this.hourlyStats.set(hourKey, hourStats);

    const last24Hours = Array.from(this.hourlyStats.keys())
      .sort()
      .slice(-24);
    for (const key of this.hourlyStats.keys()) {
      if (!last24Hours.includes(key)) {
        this.hourlyStats.delete(key);
      }
    }
  }

  private getHourKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}`;
  }

  private scheduleHourlyReset() {
    const msUntilNextHour = (60 - new Date().getMinutes()) * 60 * 1000;
    
    const resetBootstrapTimer = setTimeout(() => {
      this.logHourlySummary();
      
      this.hourlyResetInterval = setInterval(() => {
        this.logHourlySummary();
      }, 60 * 60 * 1000);
      if (typeof this.hourlyResetInterval.unref === 'function') {
        this.hourlyResetInterval.unref();
      }
    }, msUntilNextHour);
    if (typeof resetBootstrapTimer.unref === 'function') {
      resetBootstrapTimer.unref();
    }
  }

  private logHourlySummary() {
    if (isTestEnv) {
      return;
    }
    const metrics = this.getMetrics();
    console.log('\n🔐 [Auth Query Tracker - Hourly Summary]');
    console.log('='.repeat(60));
    console.log(`📊 Total Auth Queries: ${metrics.totalQueries}`);
    console.log(`⚡ Fast Path Hits: ${metrics.fastPathHits} (${metrics.hitRatePercentage.toFixed(1)}%)`);
    console.log(`🐢 Slow Path Hits: ${metrics.slowPathHits}`);
    console.log(`⏱️  Estimated Time Saved: ${metrics.estimatedTimeSavedMs.toFixed(0)}ms`);
    if (metrics.avgSlowPathDurationMs > 0) {
      console.log(`📈 Avg Slow Path Duration: ${metrics.avgSlowPathDurationMs.toFixed(2)}ms`);
    }
    if (metrics.avgFastPathDurationMs > 0) {
      console.log(`📉 Avg Fast Path Duration: ${metrics.avgFastPathDurationMs.toFixed(2)}ms`);
    }
    console.log('='.repeat(60) + '\n');
  }

  getMetrics(): AuthQueryMetrics {
    const totalQueries = this.fastPathHits + this.slowPathHits;
    const hitRatePercentage = totalQueries > 0 
      ? (this.fastPathHits / totalQueries) * 100 
      : 0;

    const estimatedTimeSavedMs = this.fastPathHits * this.estimatedSlowPathDuration;

    const avgSlowPathDurationMs = this.slowPathHits > 0 
      ? this.slowPathTotalDuration / this.slowPathHits 
      : 0;

    const avgFastPathDurationMs = this.fastPathHits > 0 
      ? this.fastPathTotalDuration / this.fastPathHits 
      : 0;

    const hourlyBreakdown = Array.from(this.hourlyStats.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-24)
      .map(([hour, stats]) => ({
        hour,
        fastPath: stats.fastPath,
        slowPath: stats.slowPath,
      }));

    const uptimeMs = Date.now() - this.lastResetTime.getTime();
    const uptimeHours = uptimeMs / (1000 * 60 * 60);

    return {
      totalQueries,
      fastPathHits: this.fastPathHits,
      slowPathHits: this.slowPathHits,
      hitRatePercentage,
      estimatedTimeSavedMs,
      avgSlowPathDurationMs,
      avgFastPathDurationMs,
      recentQueries: [...this.recentQueries].slice(-20),
      hourlyBreakdown,
      lastResetTime: this.lastResetTime,
      uptimeHours,
    };
  }

  getContextBreakdown(): Record<string, { fastPath: number; slowPath: number }> {
    const breakdown: Record<string, { fastPath: number; slowPath: number }> = {};
    
    for (const record of this.recentQueries) {
      if (!breakdown[record.context]) {
        breakdown[record.context] = { fastPath: 0, slowPath: 0 };
      }
      breakdown[record.context][record.type === 'fast_path' ? 'fastPath' : 'slowPath']++;
    }
    
    return breakdown;
  }

  reset() {
    this.fastPathHits = 0;
    this.slowPathHits = 0;
    this.recentQueries = [];
    this.fastPathTotalDuration = 0;
    this.slowPathTotalDuration = 0;
    this.hourlyStats.clear();
    this.lastResetTime = new Date();
    if (!isTestEnv) {
      console.log('[AuthQueryTracker] Metrics reset');
    }
  }

  logSummary() {
    if (isTestEnv) {
      return;
    }
    const metrics = this.getMetrics();
    console.log('\n🔐 [Auth Query Summary]');
    console.log('-'.repeat(40));
    console.log(`Total: ${metrics.totalQueries} | Fast: ${metrics.fastPathHits} | Slow: ${metrics.slowPathHits}`);
    console.log(`Hit Rate: ${metrics.hitRatePercentage.toFixed(1)}% | Time Saved: ~${metrics.estimatedTimeSavedMs.toFixed(0)}ms`);
    console.log('-'.repeat(40));
  }
}

export const authQueryTracker = new AuthQueryTracker();

export function trackAuthQuery(type: AuthQueryType, context: string, duration?: number) {
  authQueryTracker.trackAuthQuery(type, context, duration);
}

export function getAuthQueryMetrics(): AuthQueryMetrics {
  return authQueryTracker.getMetrics();
}

export function getAuthContextBreakdown() {
  return authQueryTracker.getContextBreakdown();
}

export function resetAuthMetrics() {
  authQueryTracker.reset();
}
