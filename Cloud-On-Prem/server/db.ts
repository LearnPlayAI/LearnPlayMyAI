import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import { getSystemTimezone } from './utils/timezone';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Feature flag for performance optimizations
const ENABLE_OPTIMIZED_POOL = process.env.ENABLE_OPTIMIZED_POOL !== 'false';
const envInt = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// PostgreSQL connection pool configuration
// Optimized for single-node deployment supporting hundreds of concurrent users
const poolConfig = ENABLE_OPTIMIZED_POOL ? {
  connectionString: process.env.DATABASE_URL,
  max: envInt('DB_POOL_MAX', 20),                      // Tunable via env
  min: envInt('DB_POOL_MIN', 2),                       // Tunable via env
  idleTimeoutMillis: envInt('DB_POOL_IDLE_TIMEOUT_MS', 30000),     // Tunable via env
  connectionTimeoutMillis: envInt('DB_POOL_CONN_TIMEOUT_MS', 5000), // Tunable via env
  allowExitOnIdle: false,       // Keep pool alive
  keepAlive: true,              // Enable TCP keepalive
  keepAliveInitialDelayMillis: 10000, // 10 seconds before first keepalive probe
} : {
  // Legacy pool configuration (for rollback)
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 1000,
};

export const pool = new Pool(poolConfig);

// Dedicated session pool to avoid contention with business queries
// Sessions are high-frequency read/write operations that benefit from a separate pool
const sessionPoolConfig = ENABLE_OPTIMIZED_POOL ? {
  connectionString: process.env.DATABASE_URL,
  max: envInt('SESSION_POOL_MAX', 5),                       // Tunable via env
  min: envInt('SESSION_POOL_MIN', 1),                       // Tunable via env
  idleTimeoutMillis: envInt('SESSION_POOL_IDLE_TIMEOUT_MS', 30000),     // Tunable via env
  connectionTimeoutMillis: envInt('SESSION_POOL_CONN_TIMEOUT_MS', 5000), // Tunable via env
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
} : {
  // Legacy: reuse main pool if optimizations disabled
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 1000,
};

export const sessionPool = ENABLE_OPTIMIZED_POOL ? new Pool(sessionPoolConfig) : pool;
const DB_SESSION_TIMEZONE = getSystemTimezone();

// Log pool configuration on startup
console.log(`📊 [Database Pool] Main pool: max=${poolConfig.max}, min=${poolConfig.min || 'N/A'}, enabled=${ENABLE_OPTIMIZED_POOL}`);
if (ENABLE_OPTIMIZED_POOL) {
  console.log(`📊 [Database Pool] Session pool: max=${sessionPoolConfig.max}, min=${sessionPoolConfig.min || 'N/A'} (dedicated)`);
}

// Monitor pool health
pool.on('error', (err) => {
  console.error('❌ [Database Pool] Unexpected error on idle client:', err);
});

pool.on('connect', (client) => {
  // Align DB session timezone with host runtime timezone for timestamp semantics.
  // This affects CURRENT_TIMESTAMP/now() behavior in session context.
  client
    .query("SELECT set_config('TimeZone', $1, false)", [DB_SESSION_TIMEZONE])
    .catch((err) => {
      console.warn(`⚠️ [Database Pool] Failed to apply session timezone '${DB_SESSION_TIMEZONE}':`, err);
    });
  const metrics = {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
  console.log(`🔌 [Database Pool] Connection established (timezone=${DB_SESSION_TIMEZONE}). Metrics: total=${metrics.total}, idle=${metrics.idle}, waiting=${metrics.waiting}`);
});

// Monitor session pool if separate
if (ENABLE_OPTIMIZED_POOL && sessionPool !== pool) {
  sessionPool.on('connect', (client) => {
    client
      .query("SELECT set_config('TimeZone', $1, false)", [DB_SESSION_TIMEZONE])
      .catch((err) => {
        console.warn(`⚠️ [Session Pool] Failed to apply session timezone '${DB_SESSION_TIMEZONE}':`, err);
      });
  });

  sessionPool.on('error', (err) => {
    console.error('❌ [Session Pool] Unexpected error on idle client:', err);
  });
}

export const db = drizzle({ client: pool, schema });
