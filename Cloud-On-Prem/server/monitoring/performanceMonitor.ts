import { pool } from '../db';
import { authQueryTracker } from './authQueryTracker';

const isTestEnv = process.env.NODE_ENV === 'test' || typeof process.env.JEST_WORKER_ID !== 'undefined';

interface SlowQuery {
  query: string;
  duration: number;
  timestamp: Date;
  path?: string;
}

interface PerformanceMetrics {
  slowQueries: SlowQuery[];
  requestMetrics: Map<string, { count: number; totalDuration: number; maxDuration: number }>;
  connectionPoolMetrics: {
    totalConnections: number;
    idleConnections: number;
    waitingCount: number;
  };
}

class PerformanceMonitor {
  private slowQueries: SlowQuery[] = [];
  private requestMetrics = new Map<string, { count: number; totalDuration: number; maxDuration: number }>();
  private slowQueryThreshold = 100; // Log queries slower than 100ms
  private maxSlowQueries = 100; // Keep last 100 slow queries

  trackRequest(path: string, duration: number) {
    const existing = this.requestMetrics.get(path) || { count: 0, totalDuration: 0, maxDuration: 0 };
    this.requestMetrics.set(path, {
      count: existing.count + 1,
      totalDuration: existing.totalDuration + duration,
      maxDuration: Math.max(existing.maxDuration, duration),
    });
  }

  trackSlowQuery(query: string, duration: number, path?: string) {
    if (duration >= this.slowQueryThreshold) {
      this.slowQueries.push({
        query: query.substring(0, 200), // Truncate for storage
        duration,
        timestamp: new Date(),
        path,
      });

      // Keep only last N slow queries to prevent memory growth
      if (this.slowQueries.length > this.maxSlowQueries) {
        this.slowQueries.shift();
      }

      // Log to console for immediate visibility
      console.warn(`🐌 [Slow Query] ${duration}ms: ${query.substring(0, 100)}...`);
    }
  }

  async getConnectionPoolMetrics() {
    return {
      totalConnections: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingCount: pool.waitingCount,
    };
  }

  getMetrics(): PerformanceMetrics {
    return {
      slowQueries: [...this.slowQueries],
      requestMetrics: this.requestMetrics,
      connectionPoolMetrics: {
        totalConnections: pool.totalCount,
        idleConnections: pool.idleCount,
        waitingCount: pool.waitingCount,
      },
    };
  }

  getSlowestEndpoints(limit: number = 10) {
    const endpoints = Array.from(this.requestMetrics.entries())
      .map(([path, metrics]) => ({
        path,
        avgDuration: metrics.totalDuration / metrics.count,
        maxDuration: metrics.maxDuration,
        count: metrics.count,
      }))
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, limit);

    return endpoints;
  }

  getSlowQueries(limit: number = 20) {
    return this.slowQueries
      .slice(-limit)
      .sort((a, b) => b.duration - a.duration);
  }

  reset() {
    this.slowQueries = [];
    this.requestMetrics.clear();
  }

  logSummary() {
    if (isTestEnv) {
      return;
    }
    console.log('\n📊 [Performance Summary]');
    console.log('='.repeat(60));
    
    const poolMetrics = {
      totalConnections: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingCount: pool.waitingCount,
    };
    console.log(`🔌 Connection Pool: ${poolMetrics.totalConnections} total, ${poolMetrics.idleConnections} idle, ${poolMetrics.waitingCount} waiting`);
    
    console.log(`\n🐌 Slow Queries: ${this.slowQueries.length} queries slower than ${this.slowQueryThreshold}ms`);
    
    const slowest = this.getSlowestEndpoints(5);
    if (slowest.length > 0) {
      console.log('\n⏱️  Slowest Endpoints (avg response time):');
      slowest.forEach((ep, i) => {
        console.log(`  ${i + 1}. ${ep.path}: ${ep.avgDuration.toFixed(2)}ms avg (max: ${ep.maxDuration}ms, count: ${ep.count})`);
      });
    }
    
    authQueryTracker.logSummary();
    
    console.log('='.repeat(60) + '\n');
  }
}

export const performanceMonitor = new PerformanceMonitor();

// Log summary every 5 minutes
if (!isTestEnv) {
  const performanceSummaryTimer = setInterval(() => {
    performanceMonitor.logSummary();
  }, 5 * 60 * 1000);
  if (typeof performanceSummaryTimer.unref === 'function') {
    performanceSummaryTimer.unref();
  }
}
