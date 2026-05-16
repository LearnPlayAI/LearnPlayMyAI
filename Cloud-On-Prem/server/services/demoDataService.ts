// @ts-nocheck
import bcrypt from 'bcrypt';
import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { pipeline } from 'stream/promises';
import { createGunzip, createGzip } from 'zlib';
import { db } from '../db';
import * as schema from '@shared/schema';
import { buildFullTokens, type BaseTokens } from '@shared/themeTokenBuilder';
import { getLevelFromXP } from '@shared/levelUtils';
import { isOnPremMode } from '../featureFlags';

const DEMO_BATCH_SETTING_KEY = 'demo_data_batches_v1';
const DEMO_DEFAULT_PASSWORD = 'Demo@1234!';
const DEMO_ENV_FLAG = 'DEMO_DATA_ENABLED';
const DEMO_POLICY_OVERRIDE_KEY = 'demo_data_policy_override_v1';
const DEMO_TEMPLATE_SETTING_KEY = 'demo_data_templates_v1';

const WORDS_A = ['Nova', 'Apex', 'Orion', 'Harbor', 'Atlas', 'Pulse', 'Vertex', 'Zenith', 'Summit', 'Praxis', 'Cobalt', 'Beacon'];
const WORDS_B = ['Academy', 'Institute', 'Collective', 'Learning', 'Works', 'Labs', 'Campus', 'Academics', 'Systems', 'Guild', 'Network', 'Training'];
const DEPARTMENTS = ['Operations', 'Finance', 'Compliance', 'Sales', 'Engineering', 'People', 'Support', 'Marketing', 'Learning'];
const UNIT_PREFIXES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Sigma', 'Lambda', 'Omega', 'Echo', 'Kilo', 'Zulu'];
const TEAM_PREFIXES = ['Team', 'Squad', 'Crew', 'Pod', 'Circle'];
const COURSE_TOPICS = ['Safety Essentials', 'Leadership Foundations', 'Customer Excellence', 'Data Security', 'Product Onboarding', 'Ethics & Compliance', 'Coaching Skills', 'Service Standards', 'Communication Skills', 'Performance Habits'];
const COURSE_VARIANTS = ['Fundamentals', 'Applied Skills', 'Playbook', 'Workshop', 'Essentials', 'Field Guide', 'Masterclass', 'Accelerator'];
const PEOPLE_FIRST_NAMES = ['Liam', 'Ava', 'Noah', 'Mia', 'Ethan', 'Zoe', 'Daniel', 'Leah', 'Caleb', 'Nina', 'Aria', 'Kai', 'Mason', 'Ruby', 'Jonah', 'Chloe'];
const PEOPLE_LAST_NAMES = ['Naidoo', 'Dlamini', 'Mokoena', 'Pillay', 'Khumalo', 'Van Wyk', 'Ndlovu', 'Jacobs', 'Smit', 'Meyer', 'Singh', 'Coetzee', 'Botha', 'Zulu', 'Moore', 'Petersen'];
const DEMO_BRAND_PERSONAS = [
  'Coastal Learning Group',
  'Summit Skills Academy',
  'Northbridge Training',
  'BluePeak Institute',
  'Momentum Learning Labs',
  'Beacon Workforce Academy',
  'Horizon Growth Campus',
  'Evergreen Knowledge Hub',
  'Sterling Talent Works',
  'Pioneer Skills Collective',
  'Crescent Learning Center',
  'Atlas Leadership Institute',
];
const ROLES = {
  ORG_ADMIN: 'org_admin',
  TRAINER: 'teacher',
  TEAM_LEAD: 'team_lead',
  // Use canonical platform learner role so all student-facing analytics/UI paths pick up demo users.
  LEARNER: 'student',
};

export type DemoJobStatus = 'queued' | 'running' | 'completed' | 'failed';
export type DemoJobAction = 'generate' | 'reset' | 'purge' | 'backup' | 'restore';

export interface DemoGeneratorConfig {
  orgCount: number;
  randomOrgNames: boolean;
  orgNames?: string[];
  usersPerOrg: {
    custSuper?: number;
    orgAdmin: number;
    trainerTeamLead: number;
    learner: number;
  };
  departmentCount: number;
  randomDepartmentNames: boolean;
  departmentNames?: string[];
  unitCountPerOrg: number;
  randomUnitNames: boolean;
  unitNames?: Array<{ name: string; departmentName?: string }>;
  teamCountPerOrg: number;
  randomTeamNames: boolean;
  teamNames?: Array<{ name: string; unitName?: string }>;
  courseCountPerOrg: number;
  seed?: number;
  sharedPptAssetKey?: string;
  includeMarketplaceSales?: boolean;
  includeCreditPackPurchases?: boolean;
  includeJoinRequests?: boolean;
  includeCourseCatalog?: boolean;
  includeEnrollments?: boolean;
  includeReviews?: boolean;
  includeGamification?: boolean;
  includeInterOrgAssignments?: boolean;
  namingConvention?: 'realistic' | 'demo_tagged';
  namingEmailDomain?: string;
  activityWindowStart?: string;
  activityWindowEnd?: string;
  featureModules?: Record<string, { enabled: boolean; volume?: 'none' | 'small' | 'medium' | 'large'; notes?: string }>;
  namingPolicy?: {
    mode?: 'realistic' | 'demo_tagged' | 'custom_template';
    orgTemplate?: string;
    userTemplate?: string;
    courseTemplate?: string;
    emailDomain?: string;
    demoPrefix?: string;
  };
}

interface DemoBatchRecord {
  batchId: string;
  createdAt: string;
  createdBy: string;
  orgIds: string[];
  userIds: string[];
  deploymentMode: 'cloud' | 'onprem';
  summary: Record<string, number>;
  config: DemoGeneratorConfig;
}

interface DemoJob {
  id: string;
  action: DemoJobAction;
  status: DemoJobStatus;
  createdBy: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  progress: number;
  message: string;
  config?: DemoGeneratorConfig;
  payload?: any;
  error?: string;
  result?: any;
}

interface DatabaseBackupRecord {
  id: string;
  name: string;
  fullPath: string;
  sizeBytes: number;
  createdAt: string;
  sourceDir: string;
}

interface DemoTemplateRecord {
  name: string;
  description?: string;
  config: DemoGeneratorConfig;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

const jobs = new Map<string, DemoJob>();
let runningJobId: string | null = null;

function nowIso() {
  return new Date().toISOString();
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string; cause?: { code?: string } };
  return candidate.code === '23505' || candidate.cause?.code === '23505';
}

function makeRng(seed: number) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rand: () => number, min: number, max: number) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function pickOne<T>(rand: () => number, arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function pickMany<T>(rand: () => number, arr: T[], count: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < count && copy.length > 0; i++) {
    const idx = Math.floor(rand() * copy.length);
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return out;
}

function normalizeNameList(raw?: string[]): string[] {
  return (raw ?? []).map((v) => (v || '').trim()).filter(Boolean);
}

function normalizeUnitList(raw?: Array<{ name: string; departmentName?: string }>) {
  return (raw ?? [])
    .map((u) => ({ name: (u?.name || '').trim(), departmentName: (u?.departmentName || '').trim() || undefined }))
    .filter((u) => !!u.name);
}

function normalizeTeamList(raw?: Array<{ name: string; unitName?: string }>) {
  return (raw ?? [])
    .map((t) => ({ name: (t?.name || '').trim(), unitName: (t?.unitName || '').trim() || undefined }))
    .filter((t) => !!t.name);
}

function clampConfig(input: Partial<DemoGeneratorConfig>): DemoGeneratorConfig {
  const orgCount = Math.max(1, Math.min(Number(input.orgCount ?? 2), 30));
  const users = input.usersPerOrg ?? ({} as any);

  const includeCourseCatalog = input.includeCourseCatalog !== false;
  const includeEnrollments = includeCourseCatalog && input.includeEnrollments !== false;
  const includeReviews = includeCourseCatalog && input.includeReviews !== false;
  const includeGamification = input.includeGamification !== false;
  const includeJoinRequests = input.includeJoinRequests !== false;
  const includeInterOrgAssignments = includeCourseCatalog && input.includeInterOrgAssignments !== false;
  const namingConvention = input.namingConvention === 'demo_tagged' ? 'demo_tagged' : 'realistic';
  const namingEmailDomainRaw = String(input.namingEmailDomain || '').trim().toLowerCase();
  const namingEmailDomain = namingEmailDomainRaw || (namingConvention === 'demo_tagged' ? 'learnplay.demo.local' : 'learnplay.local');
  const featureModules: Record<string, { enabled: boolean; volume?: 'none' | 'small' | 'medium' | 'large'; notes?: string }> = {
    org_structure: { enabled: true, volume: 'medium' },
    users_roles: { enabled: true, volume: 'medium' },
    join_requests: { enabled: includeJoinRequests, volume: 'small' },
    courses_lessons: { enabled: includeCourseCatalog, volume: 'medium' },
    assignments: { enabled: includeCourseCatalog, volume: 'medium' },
    enrollments_progress: { enabled: includeEnrollments, volume: 'medium' },
    quizzes_results: { enabled: includeCourseCatalog, volume: 'medium' },
    reviews_ratings: { enabled: includeReviews, volume: 'small' },
    gamification: { enabled: includeGamification, volume: 'medium' },
    commerce_marketplace: { enabled: input.includeMarketplaceSales !== false, volume: 'small' },
    credits_purchases: { enabled: input.includeCreditPackPurchases !== false, volume: 'small' },
    interorg_sharing: { enabled: includeInterOrgAssignments, volume: 'small' },
    reporting_financial_snapshots: { enabled: true, volume: 'small' },
    notifications: { enabled: true, volume: 'small' },
  };
  const rawModules = input.featureModules || {};
  for (const [key, value] of Object.entries(rawModules)) {
    if (!featureModules[key]) continue;
    featureModules[key] = {
      enabled: value?.enabled !== false,
      volume: ['none', 'small', 'medium', 'large'].includes(String(value?.volume || ''))
        ? (value!.volume as any)
        : featureModules[key].volume,
      notes: value?.notes ? String(value.notes) : undefined,
    };
  }

  const namingPolicy = {
    mode: (input.namingPolicy?.mode === 'custom_template'
      ? 'custom_template'
      : namingConvention) as 'realistic' | 'demo_tagged' | 'custom_template',
    orgTemplate: String(input.namingPolicy?.orgTemplate || '').trim() || undefined,
    userTemplate: String(input.namingPolicy?.userTemplate || '').trim() || undefined,
    courseTemplate: String(input.namingPolicy?.courseTemplate || '').trim() || undefined,
    emailDomain: String(input.namingPolicy?.emailDomain || namingEmailDomain).trim().toLowerCase(),
    demoPrefix: String(input.namingPolicy?.demoPrefix || '[DEMO]').trim() || '[DEMO]',
  };

  return {
    orgCount,
    randomOrgNames: input.randomOrgNames !== false,
    orgNames: normalizeNameList(input.orgNames),
    usersPerOrg: {
      custSuper: Math.max(0, Math.min(Number(users.custSuper ?? 1), 20)),
      orgAdmin: Math.max(1, Math.min(Number(users.orgAdmin ?? 2), 100)),
      trainerTeamLead: Math.max(1, Math.min(Number(users.trainerTeamLead ?? 4), 300)),
      learner: Math.max(1, Math.min(Number(users.learner ?? 30), 5000)),
    },
    departmentCount: Math.max(1, Math.min(Number(input.departmentCount ?? 4), 50)),
    randomDepartmentNames: input.randomDepartmentNames !== false,
    departmentNames: normalizeNameList(input.departmentNames),
    unitCountPerOrg: Math.max(1, Math.min(Number(input.unitCountPerOrg ?? 8), 300)),
    randomUnitNames: input.randomUnitNames !== false,
    unitNames: normalizeUnitList(input.unitNames),
    teamCountPerOrg: Math.max(1, Math.min(Number(input.teamCountPerOrg ?? 12), 500)),
    randomTeamNames: input.randomTeamNames !== false,
    teamNames: normalizeTeamList(input.teamNames),
    courseCountPerOrg: Math.max(1, Math.min(Number(input.courseCountPerOrg ?? 16), 400)),
    seed: Number.isFinite(Number(input.seed)) ? Number(input.seed) : Date.now(),
    sharedPptAssetKey: (input.sharedPptAssetKey || '').trim() || undefined,
    includeMarketplaceSales: input.includeMarketplaceSales !== false,
    includeCreditPackPurchases: input.includeCreditPackPurchases !== false,
    includeJoinRequests,
    includeCourseCatalog,
    includeEnrollments,
    includeReviews,
    includeGamification,
    includeInterOrgAssignments,
    namingConvention,
    namingEmailDomain,
    activityWindowStart: String(input.activityWindowStart || '').trim() || undefined,
    activityWindowEnd: String(input.activityWindowEnd || '').trim() || undefined,
    featureModules,
    namingPolicy,
  };
}

function resolveDemoPolicy() {
  throw new Error('resolveDemoPolicy() is deprecated. Use resolveDemoPolicyAsync().');
}

async function getSystemSettingValue(settingKey: string): Promise<string | null> {
  const [row] = await db
    .select({ settingValue: schema.systemSettings.settingValue })
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.settingKey, settingKey))
    .limit(1);
  return row?.settingValue ?? null;
}

async function getDemoPolicyOverride(): Promise<'auto' | 'enabled' | 'disabled'> {
  const raw = (await getSystemSettingValue(DEMO_POLICY_OVERRIDE_KEY)) || '';
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'enabled') return 'enabled';
  if (normalized === 'disabled') return 'disabled';
  return 'auto';
}

async function setDemoPolicyOverride(mode: 'auto' | 'enabled' | 'disabled', userId?: string) {
  const [existing] = await db
    .select({ id: schema.systemSettings.id })
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.settingKey, DEMO_POLICY_OVERRIDE_KEY))
    .limit(1);

  if (existing?.id) {
    await db
      .update(schema.systemSettings)
      .set({
        settingValue: mode,
        dataType: 'string',
        description: 'Demo data policy override mode (auto|enabled|disabled)',
        updatedBy: userId || null,
        updatedAt: new Date(),
      })
      .where(eq(schema.systemSettings.id, existing.id));
  } else {
    await db.insert(schema.systemSettings).values({
      settingKey: DEMO_POLICY_OVERRIDE_KEY,
      settingValue: mode,
      dataType: 'string',
      description: 'Demo data policy override mode (auto|enabled|disabled)',
      updatedBy: userId || null,
    });
  }
}

async function resolveDemoPolicyAsync() {
  const deploymentMode = isOnPremMode() ? 'onprem' : 'cloud';
  const stage = String(
    process.env.LEARNPLAY_SYSTEM_TYPE ||
      process.env.SYSTEM_TYPE ||
      process.env.APP_ENV ||
      process.env.ENVIRONMENT ||
      process.env.STAGE ||
      ''
  )
    .trim()
    .toLowerCase();
  const policyOverride = await getDemoPolicyOverride();
  const envRaw = String(process.env[DEMO_ENV_FLAG] || '').trim().toLowerCase();
  const envToggle = envRaw === 'true' ? true : envRaw === 'false' ? false : null;
  const isNodeProd = process.env.NODE_ENV === 'production';
  const stageAllowed = ['dev', 'development', 'acc', 'qa', 'test', 'staging'].includes(stage);
  const isPrdStage = ['prd', 'prod', 'production', 'live'].includes(stage);

  // Default policy: allow demo tooling in DEV/ACC-like stages without OS env toggles.
  let enabled = stageAllowed;
  let enabledSource: 'stage_default' | 'env' | 'db_override' = 'stage_default';
  if (envToggle !== null) {
    enabled = envToggle;
    enabledSource = 'env';
  }
  if (policyOverride === 'enabled') {
    enabled = true;
    enabledSource = 'db_override';
  } else if (policyOverride === 'disabled') {
    enabled = false;
    enabledSource = 'db_override';
  }

  // Hard production guard: PRD is always blocked, regardless of env/DB override.
  if (isPrdStage) {
    enabled = false;
    enabledSource = 'stage_default';
  }

  const envAllowed = enabled && !isPrdStage && (!isNodeProd || stageAllowed);
  return {
    deploymentMode,
    enabled,
    enabledSource,
    policyOverride,
    stage,
    isNodeProd,
    stageAllowed,
    isPrdStage,
    envAllowed,
  };
}

function getBackupCandidateDirs(policy: ReturnType<typeof resolveDemoPolicy>): string[] {
  const configured = (process.env.DEMO_DB_BACKUP_DIR || '').trim();
  const mode = policy.deploymentMode;
  const defaults = [
    configured,
    `/lppbackups/${mode}/database`,
    `/lppbackups/${mode}/db`,
    `/var/backups/learnplay/${mode}/database`,
    `/tmp/learnplay-db-backups/${mode}`,
  ].filter(Boolean);
  return Array.from(new Set(defaults));
}

async function ensurePrimaryBackupDir(policy: ReturnType<typeof resolveDemoPolicy>): Promise<string> {
  const dirs = getBackupCandidateDirs(policy);
  for (const dir of dirs) {
    try {
      await fsp.mkdir(dir, { recursive: true });
      await fsp.access(dir, fs.constants.W_OK | fs.constants.R_OK);
      return dir;
    } catch {
      // Try next candidate.
    }
  }
  throw new Error('No writable backup directory available for demo backup tooling.');
}

function isSqlBackupFileName(name: string): boolean {
  return name.endsWith('.sql') || name.endsWith('.sql.gz');
}

function backupIdForPath(fullPath: string): string {
  return crypto.createHash('sha1').update(fullPath).digest('hex');
}

async function listDatabaseBackups(policy: ReturnType<typeof resolveDemoPolicy>): Promise<DatabaseBackupRecord[]> {
  const dirs = getBackupCandidateDirs(policy);
  const rows: DatabaseBackupRecord[] = [];

  for (const dir of dirs) {
    try {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !isSqlBackupFileName(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        try {
          const st = await fsp.stat(fullPath);
          rows.push({
            id: backupIdForPath(fullPath),
            name: entry.name,
            fullPath,
            sizeBytes: st.size,
            createdAt: st.mtime.toISOString(),
            sourceDir: dir,
          });
        } catch {
          // Ignore files we cannot stat.
        }
      }
    } catch {
      // Ignore unreadable/missing dirs.
    }
  }

  const dedup = new Map<string, DatabaseBackupRecord>();
  for (const row of rows) {
    if (!dedup.has(row.id)) dedup.set(row.id, row);
  }
  return Array.from(dedup.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function formatBackupTimestamp(d = new Date()): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '_');
}

function detectStage(policy: ReturnType<typeof resolveDemoPolicy>): string {
  return policy.stage || 'unknown';
}

function runSpawn(command: string, args: string[], options: any = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const cp = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });
    let stdout = '';
    let stderr = '';

    cp.stdout?.on('data', (buf) => {
      stdout += String(buf);
    });
    cp.stderr?.on('data', (buf) => {
      stderr += String(buf);
    });
    cp.on('error', reject);
    cp.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function buildPgChildEnv(dbUrl: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PGCONNECT_TIMEOUT: String(envInt('DEMO_DB_CONNECT_TIMEOUT_SEC', 15)),
  };
  try {
    const parsed = new URL(dbUrl);
    if (parsed.password) {
      env.PGPASSWORD = decodeURIComponent(parsed.password);
    }
  } catch {
    // Keep existing env only if URL parsing fails.
  }
  return env;
}

function envInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.floor(raw);
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => void, label: string): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      try {
        onTimeout();
      } catch {
        // Best effort cleanup.
      }
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }) as Promise<T>;
}

async function ensureCommandAvailable(command: string) {
  const probe = await runSpawn(command, ['--version']).catch(() => ({ code: 1, stdout: '', stderr: '' }));
  if (probe.code !== 0) {
    throw new Error(`Required command not available: ${command}`);
  }
}

async function createDatabaseBackup(setProgress?: (progress: number, message: string) => void, reason = 'manual') {
  const policy = await resolveDemoPolicyAsync();
  await ensureCommandAvailable('pg_dump');
  const backupDir = await ensurePrimaryBackupDir(policy);
  const ts = formatBackupTimestamp();
  const stage = detectStage(policy);
  const fileName = `${policy.deploymentMode}_${stage}_${reason}_db_${ts}.sql.gz`;
  const fullPath = path.join(backupDir, fileName);
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is missing. Cannot create backup.');
  }
  const pgEnv = buildPgChildEnv(dbUrl);

  setProgress?.(15, 'Creating database backup stream');
  const dump = spawn('pg_dump', ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--no-password', '--lock-wait-timeout=30s', dbUrl], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: pgEnv,
  });

  const stderrChunks: string[] = [];
  dump.stderr?.on('data', (buf) => stderrChunks.push(String(buf)));
  const dumpExit = new Promise<number>((resolve, reject) => {
    dump.on('error', reject);
    dump.on('close', (code) => resolve(code ?? 1));
  });

  const gzip = createGzip({ level: 6 });
  const outStream = fs.createWriteStream(fullPath);
  const pipelinePromise = pipeline(dump.stdout as any, gzip, outStream);
  const backupTimeoutMs = envInt('DEMO_DB_BACKUP_TIMEOUT_MS', 10 * 60 * 1000);
  setProgress?.(35, 'Streaming backup data');
  await withTimeout(
    Promise.all([pipelinePromise, dumpExit]).then(([, code]) => code),
    backupTimeoutMs,
    () => {
      dump.kill('SIGTERM');
      setTimeout(() => {
        if (!dump.killed) dump.kill('SIGKILL');
      }, 5000).unref();
      outStream.destroy();
    },
    'Database backup'
  ).catch(async (error: any) => {
    const stderrTail = stderrChunks.join('').slice(-2000).trim();
    try {
      await fsp.unlink(fullPath);
    } catch {
      // Ignore cleanup errors.
    }
    if (stderrTail) {
      throw new Error(`${error?.message || 'Database backup failed'} :: ${stderrTail}`);
    }
    throw error;
  });
  const exitCode: number = await dumpExit;

  if (exitCode !== 0) {
    try {
      await fsp.unlink(fullPath);
    } catch {
      // Ignore.
    }
    throw new Error(`pg_dump failed (${exitCode}): ${stderrChunks.join('').trim() || 'unknown error'}`);
  }

  const st = await fsp.stat(fullPath);
  setProgress?.(95, 'Backup created successfully');
  return {
    id: backupIdForPath(fullPath),
    name: fileName,
    fullPath,
    sizeBytes: st.size,
    createdAt: st.mtime.toISOString(),
    sourceDir: backupDir,
  } as DatabaseBackupRecord;
}

async function runPsqlCommand(sqlText: string) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is missing. Cannot run restore preflight.');
  const result = await runSpawn('psql', ['-w', dbUrl, '-v', 'ON_ERROR_STOP=1', '-c', sqlText], {
    env: buildPgChildEnv(dbUrl),
  });
  if (result.code !== 0) {
    throw new Error(`psql command failed: ${result.stderr || result.stdout || 'unknown error'}`);
  }
}

async function restoreDatabaseBackup(backup: DatabaseBackupRecord, setProgress?: (progress: number, message: string) => void) {
  await ensureCommandAvailable('psql');
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is missing. Cannot restore backup.');
  const pgEnv = buildPgChildEnv(dbUrl);

  setProgress?.(10, 'Creating pre-restore safety backup');
  const preRestoreBackup = await createDatabaseBackup(undefined, 'pre_restore');
  setProgress?.(20, `Pre-restore backup created: ${preRestoreBackup.name}`);

  // IMPORTANT:
  // We intentionally avoid dropping/recreating the public schema here.
  // Backups are created with pg_dump --clean --if-exists, so restore SQL already
  // contains explicit DROP/CREATE statements. Dropping schema wholesale can break
  // session/auth tables mid-request and make UI appear "stuck" during restore.
  setProgress?.(30, 'Preparing database restore');

  const psql = spawn('psql', ['-w', dbUrl, '-v', 'ON_ERROR_STOP=1', '--single-transaction'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: pgEnv,
  });
  const stderrChunks: string[] = [];
  const stdoutChunks: string[] = [];
  psql.stderr?.on('data', (buf) => stderrChunks.push(String(buf)));
  psql.stdout?.on('data', (buf) => stdoutChunks.push(String(buf)));
  const psqlExit = new Promise<number>((resolve, reject) => {
    psql.on('error', reject);
    psql.on('close', (code) => resolve(code ?? 1));
  });

  setProgress?.(55, `Restoring backup ${backup.name}`);
  const sourceStream = backup.name.endsWith('.gz')
    ? fs.createReadStream(backup.fullPath).pipe(createGunzip())
    : fs.createReadStream(backup.fullPath);
  const restoreTimeoutMs = envInt('DEMO_DB_RESTORE_TIMEOUT_MS', 20 * 60 * 1000);
  setProgress?.(70, 'Applying restore SQL');

  const restoreExecution = Promise.all([
    pipeline(sourceStream as any, psql.stdin as any),
    psqlExit,
  ]).then(([, exitCode]) => exitCode as number);

  const exitCode: number = await withTimeout(
    restoreExecution,
    restoreTimeoutMs,
    () => {
      psql.kill('SIGTERM');
      setTimeout(() => {
        if (!psql.killed) psql.kill('SIGKILL');
      }, 5000).unref();
    },
    'Database restore'
  ).catch((error: any) => {
    const stderrTail = stderrChunks.join('').slice(-2000).trim();
    if (stderrTail) {
      throw new Error(`${error?.message || 'Database restore failed'} :: ${stderrTail}`);
    }
    throw error;
  });

  if (exitCode !== 0) {
    throw new Error(`Restore failed (${exitCode}): ${stderrChunks.join('').slice(-2000) || 'unknown error'}`);
  }

  setProgress?.(90, 'Restore SQL applied; validating migration metadata');
  await runPsqlCommand(`SELECT to_regclass('public."drizzleMigrations"');`);
  setProgress?.(95, 'Restore validation completed');

  return {
    restoredBackup: backup,
    preRestoreBackup,
    restoreOutputTail: stdoutChunks.join('').slice(-1500),
  };
}

async function getBatches(): Promise<DemoBatchRecord[]> {
  const [row] = await db
    .select()
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.settingKey, DEMO_BATCH_SETTING_KEY))
    .limit(1);

  if (!row) return [];
  try {
    const parsed = JSON.parse(row.settingValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveBatches(batches: DemoBatchRecord[], userId?: string) {
  const payload = JSON.stringify(batches.slice(-50));
  const [existing] = await db
    .select({ id: schema.systemSettings.id })
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.settingKey, DEMO_BATCH_SETTING_KEY))
    .limit(1);

  if (existing?.id) {
    await db
      .update(schema.systemSettings)
      .set({
        settingValue: payload,
        dataType: 'json',
        description: 'Demo data generation batches metadata',
        updatedBy: userId || null,
        updatedAt: new Date(),
      })
      .where(eq(schema.systemSettings.id, existing.id));
  } else {
    await db.insert(schema.systemSettings).values({
      settingKey: DEMO_BATCH_SETTING_KEY,
      settingValue: payload,
      dataType: 'json',
      description: 'Demo data generation batches metadata',
      updatedBy: userId || null,
    });
  }
}

async function ensureReferenceCatalogs(actorUserId: string) {
  const [creditPackageCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.creditPurchasePackages);

  if ((creditPackageCount?.count ?? 0) === 0) {
    await db.insert(schema.creditPurchasePackages).values([
      {
        name: 'Starter Demo Pack',
        creditsAmount: 500,
        priceAmount: '49.00',
        currency: 'ZAR',
        badge: 'Popular',
        features: ['Fast top-up', 'Good for small teams'],
        isActive: true,
        displayOrder: 1,
        colorScheme: 'green',
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
      {
        name: 'Growth Demo Pack',
        creditsAmount: 2000,
        priceAmount: '169.00',
        currency: 'ZAR',
        badge: 'Best Value',
        features: ['Higher volume', 'Reporting friendly'],
        isActive: true,
        displayOrder: 2,
        colorScheme: 'blue',
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
      {
        name: 'Enterprise Demo Pack',
        creditsAmount: 10000,
        priceAmount: '699.00',
        currency: 'ZAR',
        badge: 'Scale',
        features: ['Large org demos', 'Cross-org workloads'],
        isActive: true,
        displayOrder: 3,
        colorScheme: 'purple',
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    ]);
  }

  const [planCount] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.subscriptionPlans);
  if ((planCount?.count ?? 0) === 0) {
    await db.insert(schema.subscriptionPlans).values([
      {
        name: 'Demo Standard',
        tier: 'demo_standard',
        monthlyCredits: 1000,
        pricePerTeacher: '99.00',
        currency: 'ZAR',
        badge: 'Standard',
        features: ['Core learning'],
        colorScheme: 'green',
        isActive: true,
        displayOrder: 1,
      },
      {
        name: 'Demo Premium',
        tier: 'demo_premium',
        monthlyCredits: 3000,
        pricePerTeacher: '249.00',
        currency: 'ZAR',
        badge: 'Popular',
        features: ['Advanced analytics'],
        colorScheme: 'blue',
        isActive: true,
        displayOrder: 2,
      },
    ]);
  }

  const [elearnPlanCount] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.elearningSubscriptionPlans);
  if ((elearnPlanCount?.count ?? 0) === 0) {
    await db.insert(schema.elearningSubscriptionPlans).values([
      {
        name: 'Learner Monthly',
        planType: 'learner',
        interval: 'monthly',
        priceAmount: '79.00',
        currency: 'ZAR',
        learnerAllotment: 1,
        creditAllotment: 0,
        features: ['Marketplace discount'],
        isActive: true,
        displayOrder: 1,
      },
      {
        name: 'Educator Monthly',
        planType: 'educator',
        interval: 'monthly',
        priceAmount: '299.00',
        currency: 'ZAR',
        learnerAllotment: null,
        creditAllotment: 1000,
        features: ['Content authoring'],
        isActive: true,
        displayOrder: 2,
      },
    ]);
  }

  const [powerCount] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.powerUpCatalog);
  if ((powerCount?.count ?? 0) === 0) {
    await db.insert(schema.powerUpCatalog).values([
      { name: 'XP Boost', description: 'Double XP for 10 mins', type: 'xp_boost', effect: { multiplier: 2, duration: 600 }, coinCost: 100, tier: 'common', isActive: true },
      { name: 'Time Extension', description: 'Adds answer time', type: 'time_extension', effect: { seconds: 30 }, coinCost: 120, tier: 'rare', isActive: true },
    ]);
  }

  const [cosmeticCount] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.cosmeticCatalog);
  if ((cosmeticCount?.count ?? 0) === 0) {
    await db.insert(schema.cosmeticCatalog).values([
      { name: 'Blue Ring', description: 'Blue profile glow', type: 'avatar_ring', effect: { color: '#3399ff' }, coinCost: 200, tier: 'common', isActive: true },
      { name: 'Gold Frame', description: 'Gold avatar frame', type: 'avatar_frame', effect: { color: '#ffd700' }, coinCost: 500, tier: 'rare', isActive: true },
    ]);
  }

  const [challengeCount] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.challengeTemplates);
  if ((challengeCount?.count ?? 0) === 0) {
    await db.insert(schema.challengeTemplates).values([
      { name: 'Daily Learner', description: 'Complete 3 quizzes', type: 'daily', requirement: 'complete_quizzes', targetValue: 3, coinReward: 50, xpReward: 100, isActive: true },
      { name: 'Weekly Winner', description: 'Win 5 quiz matches', type: 'weekly', requirement: 'quiz_wins', targetValue: 5, coinReward: 120, xpReward: 260, isActive: true },
    ]);
  }

  const [achievementCount] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.achievementCatalog);
  if ((achievementCount?.count ?? 0) === 0) {
    await db.insert(schema.achievementCatalog).values([
      { name: 'First Finish', description: 'Complete first course', category: 'milestones', requirement: 'course_complete', targetValue: 1, coinReward: 20, isActive: true },
      { name: 'Quiz Master', description: 'Pass 20 quizzes', category: 'quizzes', requirement: 'quiz_passes', targetValue: 20, coinReward: 80, isActive: true },
    ]);
  }
}

function uniqueCode(prefix: string) {
  return `${prefix}-${crypto.randomBytes(4).toString('hex')}`;
}

function organizationName(rand: () => number, idx: number) {
  return `${pickOne(rand, WORDS_A)} ${pickOne(rand, WORDS_B)}`;
}

function batchRunCode(batchId: string) {
  const rawTs = Number((batchId.split('-')[1] || '').trim());
  const d = Number.isFinite(rawTs) && rawTs > 0 ? new Date(rawTs) : new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function makeEmail(base: string, batchId: string, orgSlug: string, orgIndex: number, index: number, config: DemoGeneratorConfig) {
  const runCode = batchRunCode(batchId).replace('-', '');
  const domain = (config.namingPolicy?.emailDomain || config.namingEmailDomain || 'learnplay.local').toLowerCase();
  const mode = config.namingPolicy?.mode || config.namingConvention || 'realistic';
  if (mode === 'demo_tagged') {
    return `${base}.run${runCode}.org${orgIndex + 1}.user${index}+demo-${orgSlug}@${domain}`;
  }
  return `${base}.run${runCode}.org${orgIndex + 1}.user${index}@${domain}`;
}

function slug(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'demo';
}

function uniqueTag(batchId: string, orgIndex: number, entityPrefix: string, entityIndex: number) {
  return `${orgIndex + 1}.${entityIndex + 1}`;
}

function withNamingConvention(value: string, config: DemoGeneratorConfig): string {
  const mode = config.namingPolicy?.mode || config.namingConvention || 'realistic';
  if (mode === 'demo_tagged') {
    const prefix = String(config.namingPolicy?.demoPrefix || '[DEMO]').trim();
    const normalized = prefix.endsWith(']') ? `${prefix} ` : `${prefix} `;
    return value.startsWith(normalized) ? value : `${normalized}${value}`;
  }
  return value.replace(/^\[DEMO\]\s*/i, '').trim();
}

function parseActivityWindow(config: DemoGeneratorConfig): { startMs: number; endMs: number } {
  const now = Date.now();
  const defaultStart = now - 120 * 24 * 3600 * 1000;
  const parsedStart = config.activityWindowStart ? new Date(config.activityWindowStart).getTime() : defaultStart;
  const parsedEnd = config.activityWindowEnd ? new Date(config.activityWindowEnd).getTime() : now;
  const startMs = Number.isFinite(parsedStart) ? parsedStart : defaultStart;
  const endMs = Number.isFinite(parsedEnd) ? parsedEnd : now;
  if (startMs > endMs) {
    return { startMs: endMs, endMs: startMs };
  }
  return { startMs, endMs };
}

function isFeatureModuleEnabled(config: DemoGeneratorConfig, key: string, fallback = true): boolean {
  const module = config.featureModules?.[key];
  if (module && typeof module.enabled === 'boolean') return module.enabled;
  return fallback;
}

async function createUser(params: {
  gamerName: string;
  email: string;
  firstName: string;
  lastName: string;
  isCustSuper?: boolean;
  isSuperAdmin?: boolean;
  isDisabled?: boolean;
  preferredCurrency?: 'ZAR' | 'USD' | 'EUR';
}) {
  const hashedPassword = await bcrypt.hash(DEMO_DEFAULT_PASSWORD, 10);
  const [user] = await db
    .insert(schema.users)
    .values({
      gamerName: params.gamerName,
      email: params.email,
      password: hashedPassword,
      firstName: params.firstName,
      lastName: params.lastName,
      isCustSuper: params.isCustSuper ?? false,
      isSuperAdmin: params.isSuperAdmin ?? false,
      isDisabled: params.isDisabled ?? false,
      emailVerified: true,
      preferredCurrency: params.preferredCurrency ?? 'ZAR',
      preferredLanguage: 'en',
      lpCreditBalance: 0,
    })
    .returning();
  return user;
}

function courseStatusByIndex(idx: number): 'draft' | 'active' | 'inactive' | 'archived' {
  const pattern: Array<'draft' | 'active' | 'inactive' | 'archived'> = ['draft', 'active', 'active', 'inactive', 'archived'];
  return pattern[idx % pattern.length];
}

function progressStatus(rand: () => number): 'not_started' | 'in_progress' | 'completed' {
  const r = rand();
  if (r < 0.2) return 'not_started';
  if (r < 0.65) return 'in_progress';
  return 'completed';
}

function decimal2(n: number) {
  return n.toFixed(2);
}

function decimal4(n: number) {
  return n.toFixed(4);
}

function playerTitleFromLevel(level: number): string {
  if (level >= 80) return 'Legend';
  if (level >= 60) return 'Grandmaster';
  if (level >= 40) return 'Expert';
  if (level >= 25) return 'Challenger';
  if (level >= 10) return 'Rising Star';
  return 'Rookie';
}

function hsl(h: number, s: number, l: number) {
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

function buildOrgDemoTheme(index: number) {
  const hue = (210 + (index * 37)) % 360;
  const secondaryHue = (hue + 34) % 360;
  const accentHue = (hue + 68) % 360;
  const persona = DEMO_BRAND_PERSONAS[index % DEMO_BRAND_PERSONAS.length];

  const base: BaseTokens = {
    primary: hsl(hue, 72, 44),
    primaryForeground: 'hsl(0, 0%, 100%)',
    secondary: hsl(secondaryHue, 58, 40),
    secondaryForeground: 'hsl(0, 0%, 100%)',
    accent: hsl(accentHue, 78, 48),
    accentForeground: 'hsl(0, 0%, 100%)',
    background: 'hsl(220, 30%, 98%)',
    foreground: 'hsl(224, 28%, 14%)',
    card: 'hsl(0, 0%, 100%)',
    cardForeground: 'hsl(224, 28%, 14%)',
    muted: 'hsl(220, 22%, 94%)',
    mutedForeground: 'hsl(224, 14%, 36%)',
    border: 'hsl(220, 16%, 86%)',
    ring: hsl(hue, 72, 44),
    gradientFrom: hsl(hue, 72, 44),
    gradientTo: hsl(secondaryHue, 58, 40),
    gamePrimary: hsl(hue, 72, 44),
    gameGlow: hsl(accentHue, 78, 52),
    isDark: false,
  };

  const tokens = buildFullTokens(base);
  return {
    presetId: `demo-brand-${(index + 1).toString().padStart(2, '0')}`,
    persona,
    tokens,
  };
}

async function generateOneBatch(batchId: string, config: DemoGeneratorConfig, actorUserId: string, setProgress: (n: number, m: string) => void) {
  const rand = makeRng(config.seed || Date.now());
  const onprem = isOnPremMode();
  const activityWindow = parseActivityWindow(config);
  const randomDateInWindow = () => new Date(randomInt(rand, activityWindow.startMs, activityWindow.endMs));
  const randomPastDays = (minDays: number, maxDays: number) =>
    new Date(Date.now() - randomInt(rand, minDays, maxDays) * 24 * 3600 * 1000);
  const randomDateWithFallback = (minDays: number, maxDays: number) => {
    const dt = randomDateInWindow();
    if (Number.isNaN(dt.getTime())) return randomPastDays(minDays, maxDays);
    return dt;
  };
  const boundedFutureDate = (minDays: number, maxDays: number) => {
    const fallback = new Date(Date.now() + randomInt(rand, minDays, maxDays) * 24 * 3600 * 1000);
    const candidate = new Date(randomInt(rand, Date.now(), Math.max(Date.now(), activityWindow.endMs)));
    return Number.isNaN(candidate.getTime()) ? fallback : candidate;
  };

  const orgNames = config.randomOrgNames
    ? Array.from({ length: config.orgCount }, (_, i) => organizationName(rand, i))
    : Array.from({ length: config.orgCount }, (_, i) => config.orgNames?.[i] || organizationName(rand, i));

  const batchSummary: Record<string, number> = {
    organizations: 0,
    users: 0,
    courses: 0,
    lessons: 0,
    quizzes: 0,
    enrollments: 0,
    purchases: 0,
    credits: 0,
    reviews: 0,
    joinRequests: 0,
    crossOrgAssignments: 0,
  };

  const createdOrgIds: string[] = [];
  const createdUserIds: string[] = [];
  const orgMemberUserIds: string[] = [];

  await ensureReferenceCatalogs(actorUserId);

  const activeCreditPackages = await db
    .select()
    .from(schema.creditPurchasePackages)
    .where(eq(schema.creditPurchasePackages.isActive, true))
    .orderBy(schema.creditPurchasePackages.displayOrder);

  const [learnerPlan] = await db
    .select()
    .from(schema.elearningSubscriptionPlans)
    .where(and(eq(schema.elearningSubscriptionPlans.isActive, true), eq(schema.elearningSubscriptionPlans.planType, 'learner')))
    .limit(1);

  const [educatorPlan] = await db
    .select()
    .from(schema.elearningSubscriptionPlans)
    .where(and(eq(schema.elearningSubscriptionPlans.isActive, true), eq(schema.elearningSubscriptionPlans.planType, 'educator')))
    .limit(1);

  const activePowerUps = await db
    .select()
    .from(schema.powerUpCatalog)
    .where(eq(schema.powerUpCatalog.isActive, true));
  const activeCosmetics = await db
    .select()
    .from(schema.cosmeticCatalog)
    .where(eq(schema.cosmeticCatalog.isActive, true));
  const [globalChallenge] = await db.select().from(schema.challengeTemplates).where(eq(schema.challengeTemplates.isActive, true)).limit(1);
  const [globalAchievement] = await db.select().from(schema.achievementCatalog).where(eq(schema.achievementCatalog.isActive, true)).limit(1);

  const createdCourseIdsByOrg: Record<string, string[]> = {};
  const orgUsersByOrg: Record<string, Array<{ id: string; role: string; unitId?: string; subUnitId?: string; teamId?: string; email: string; gamerName: string; country?: string | null; avatarImageUrl?: string | null }>> = {};

  const totalSteps = Math.max(1, config.orgCount * 10);
  let step = 0;

  for (let oi = 0; oi < config.orgCount; oi++) {
    const rawOrgName = orgNames[oi] || organizationName(rand, oi);
    const orgName = withNamingConvention(rawOrgName, config);
    const orgSlug = slug(rawOrgName);
    const inviteCode = uniqueCode(`DEMOORG${oi + 1}`);

    const [org] = await db
      .insert(schema.organizations)
      .values({
        name: orgName,
        type: 'elearning',
        inviteCode,
        isActive: true,
        isDemo: true,
        subscriptionStatus: 'active',
        pricingTier: 'enterprise',
        monthlyPrice: '999.00',
        timezone: 'Africa/Johannesburg',
        currency: 'ZAR',
        defaultLanguage: 'en',
        orgCreditWallet: 50000,
        useOrgCreditWallet: true,
        allowTeachersToSpendCredits: true,
      })
      .returning();

    createdOrgIds.push(org.id);
    batchSummary.organizations += 1;

    const orgTheme = buildOrgDemoTheme(oi);
    const [brandingTheme] = await db
      .insert(schema.brandingThemes)
      .values({
        organizationId: org.id,
        orgName: org.name,
        status: 'active',
        presetId: orgTheme.presetId,
        tokens: orgTheme.tokens,
        supportEmail: `support+${orgSlug}@learnplay.demo.local`,
        supportUrl: 'https://learnplay.demo.local/support',
        allowEmailBranding: true,
      })
      .onConflictDoNothing()
      .returning();

    await db
      .insert(schema.organizationDomains)
      .values({
        organizationId: org.id,
        domain: `${orgSlug}.demo.learnplay.local`,
        verified: true,
        verificationToken: uniqueCode('verify'),
        verifiedAt: new Date(),
        isActive: true,
      })
      .onConflictDoNothing();

    const deptNames = config.randomDepartmentNames
      ? Array.from({ length: config.departmentCount }, (_, i) => `${pickOne(rand, DEPARTMENTS)} ${pickOne(rand, ['Hub', 'Center', 'Division', 'Office'])}`)
      : Array.from({ length: config.departmentCount }, (_, i) => `${(config.departmentNames?.[i] || `${pickOne(rand, DEPARTMENTS)} ${pickOne(rand, ['Hub', 'Center', 'Division', 'Office'])}`)}`);

    const units = [] as any[];
    for (let i = 0; i < deptNames.length; i++) {
      const [unit] = await db
        .insert(schema.organizationUnits)
        .values({
          organizationId: org.id,
          name: deptNames[i],
          displayOrder: i + 1,
          joinCode: uniqueCode(`D${oi + 1}${i + 1}`),
          isActive: true,
          isShowcaseDepartment: i === 0,
        })
        .returning();
      units.push(unit);
    }

    const subUnits: any[] = [];
    const requestedUnitNames = config.randomUnitNames ? [] : normalizeUnitList(config.unitNames);
    for (let i = 0; i < config.unitCountPerOrg; i++) {
      const selected = requestedUnitNames[i];
      const parentUnit = selected?.departmentName
        ? (units.find((u) => u.name.toLowerCase() === selected.departmentName!.toLowerCase()) || pickOne(rand, units))
        : pickOne(rand, units);
      const name = `${selected?.name || `${pickOne(rand, UNIT_PREFIXES)} Unit`}`;

      const [subUnit] = await db
        .insert(schema.organizationSubUnits)
        .values({
          unitId: parentUnit.id,
          name,
          displayOrder: i + 1,
          joinCode: uniqueCode(`U${oi + 1}${i + 1}`),
          isActive: true,
        })
        .returning();
      subUnits.push(subUnit);
    }

    const teams: any[] = [];
    const requestedTeams = config.randomTeamNames ? [] : normalizeTeamList(config.teamNames);
    for (let i = 0; i < config.teamCountPerOrg; i++) {
      const selected = requestedTeams[i];
      const parentSubUnit = selected?.unitName
        ? (subUnits.find((s) => s.name.toLowerCase() === selected.unitName!.toLowerCase()) || pickOne(rand, subUnits))
        : pickOne(rand, subUnits);
      const name = `${selected?.name || `${pickOne(rand, TEAM_PREFIXES)} ${pickOne(rand, ['North', 'South', 'East', 'West', 'Central'])}`}`;

      const [team] = await db
        .insert(schema.organizationTeams)
        .values({
          subUnitId: parentSubUnit.id,
          name,
          displayOrder: i + 1,
          joinCode: uniqueCode(`T${oi + 1}${i + 1}`),
          isActive: true,
        })
        .returning();
      teams.push(team);
    }

    // Ensure demo users are distributed evenly across hierarchy levels:
    // department-only, unit-level, and team-level assignments.
    let assignmentScopeCursor = 0;
    let departmentCursor = 0;
    let unitCursor = 0;
    let teamCursor = 0;
    const assignmentScopes: Array<'department' | 'unit' | 'team'> = ['department', 'unit', 'team'];

    const nextDemoAssignment = (): { unitId: string | null; subUnitId: string | null; teamId: string | null } => {
      const fallbackUnit = units.length > 0 ? units[departmentCursor++ % units.length] : null;
      const fallbackSubUnit = subUnits.length > 0 ? subUnits[unitCursor++ % subUnits.length] : null;
      const fallbackTeam = teams.length > 0 ? teams[teamCursor++ % teams.length] : null;

      const resolvedSubUnit = fallbackSubUnit || (fallbackTeam ? subUnits.find((s) => s.id === fallbackTeam.subUnitId) || null : null);
      const resolvedUnit =
        fallbackUnit ||
        (resolvedSubUnit ? units.find((u) => u.id === resolvedSubUnit.unitId) || null : null) ||
        (fallbackTeam
          ? (() => {
              const su = subUnits.find((s) => s.id === fallbackTeam.subUnitId);
              return su ? (units.find((u) => u.id === su.unitId) || null) : null;
            })()
          : null);

      if (!resolvedUnit) {
        return { unitId: null, subUnitId: null, teamId: null };
      }

      const scope = assignmentScopes[assignmentScopeCursor % assignmentScopes.length];
      assignmentScopeCursor += 1;

      if (scope === 'department' || !resolvedSubUnit) {
        return {
          unitId: resolvedUnit.id,
          subUnitId: null,
          teamId: null,
        };
      }

      if (scope === 'unit' || !fallbackTeam) {
        return {
          unitId: resolvedUnit.id,
          subUnitId: resolvedSubUnit.id,
          teamId: null,
        };
      }

      const teamSubUnit = subUnits.find((s) => s.id === fallbackTeam.subUnitId) || resolvedSubUnit;
      const teamUnit = units.find((u) => u.id === teamSubUnit.unitId) || resolvedUnit;
      return {
        unitId: teamUnit.id,
        subUnitId: teamSubUnit.id,
        teamId: fallbackTeam.id,
      };
    };

    const userRows: Array<{ id: string; role: string; unitId?: string; subUnitId?: string; teamId?: string; email: string; gamerName: string; country?: string | null; avatarImageUrl?: string | null }> = [];

    const makeOrgUser = async (role: string, idx: number, opts?: { custSuper?: boolean; disabled?: boolean }) => {
      const first = pickOne(rand, PEOPLE_FIRST_NAMES);
      const last = pickOne(rand, PEOPLE_LAST_NAMES);
      const roleToken = role.replace(/[^a-z]/g, '').slice(0, 4) || 'user';
      const gamerName = `demo_${batchRunCode(batchId).replace('-', '')}_o${oi + 1}_${roleToken}_${idx + 1}`.toLowerCase().slice(0, 40);
      const email = makeEmail(role, batchId, orgSlug, oi, idx + 1, config);
      const user = await createUser({
        gamerName,
        email,
        firstName: first,
        lastName: last,
        isCustSuper: !!opts?.custSuper,
        isDisabled: !!opts?.disabled,
      });

      const assignment = nextDemoAssignment();

      await db.insert(schema.userOrganizationRoles).values({
        userId: user.id,
        organizationId: org.id,
        role,
      });

      await db.insert(schema.userOrganizationAssignments).values({
        userId: user.id,
        organizationId: org.id,
        unitId: assignment.unitId,
        subUnitId: assignment.subUnitId,
        teamId: assignment.teamId,
      });

      await db.insert(schema.notificationPreferences).values({
        userId: user.id,
        emailNotifications: true,
        inAppNotifications: true,
      }).onConflictDoNothing();

      createdUserIds.push(user.id);
      orgMemberUserIds.push(user.id);
      batchSummary.users += 1;

      userRows.push({
        id: user.id,
        role,
        unitId: assignment.unitId || undefined,
        subUnitId: assignment.subUnitId || undefined,
        teamId: assignment.teamId || undefined,
        email: user.email,
        gamerName: user.gamerName,
        country: user.country,
        avatarImageUrl: user.avatarImageUrl,
      });
      return user;
    };

    const custSuperCount = onprem ? Math.max(0, config.usersPerOrg.custSuper || 0) : 0;
    for (let i = 0; i < custSuperCount; i++) {
      await makeOrgUser(ROLES.ORG_ADMIN, i, { custSuper: true, disabled: false });
    }
    for (let i = 0; i < config.usersPerOrg.orgAdmin; i++) {
      await makeOrgUser(ROLES.ORG_ADMIN, i + custSuperCount);
    }
    for (let i = 0; i < config.usersPerOrg.trainerTeamLead; i++) {
      const role = i % 2 === 0 ? ROLES.TRAINER : ROLES.TEAM_LEAD;
      await makeOrgUser(role, i);
    }
    for (let i = 0; i < config.usersPerOrg.learner; i++) {
      await makeOrgUser(ROLES.LEARNER, i, { disabled: onprem });
    }

    orgUsersByOrg[org.id] = userRows;

    const orgAdmins = userRows.filter((u) => u.role === ROLES.ORG_ADMIN);
    const contentCreators = userRows.filter((u) => [ROLES.ORG_ADMIN, ROLES.TRAINER, ROLES.TEAM_LEAD].includes(u.role));
    const [category] = await db
      .insert(schema.courseCategories)
      .values({
        organizationId: org.id,
        name: `Demo Learning (${uniqueTag(batchId, oi, 'CAT', 0)})`,
        description: 'Generated demo category',
        iconName: 'BookOpen',
      })
      .returning();

    const [subject] = await db
      .insert(schema.subjects)
      .values({
        organizationId: org.id,
        unitId: units[0]?.id || null,
        name: `Demo Subject (${uniqueTag(batchId, oi, 'SUB', 0)})`,
        description: 'Demo subject for generated quizzes',
        createdBy: orgAdmins[0]?.id || contentCreators[0]?.id || actorUserId,
        isActive: true,
      })
      .returning();

    await db.insert(schema.unitSubjects).values(units.slice(0, Math.min(units.length, 3)).map((u) => ({ unitId: u.id, subjectId: subject.id })));

    // Demo join requests:
    // Seed realistic applicant users with pending/approved/denied requests for Join Requests demos.
      const joinRequestApplicantCount = Math.max(6, Math.min(24, Math.round(config.usersPerOrg.learner * 0.18)));
    const reviewerId = orgAdmins[0]?.id || actorUserId;

    if (config.includeJoinRequests !== false && isFeatureModuleEnabled(config, 'join_requests', true)) {
    for (let j = 0; j < joinRequestApplicantCount; j++) {
      const applicantFirstName = pickOne(rand, PEOPLE_FIRST_NAMES);
      const applicantLastName = pickOne(rand, PEOPLE_LAST_NAMES);
      const applicantGamerName = `demo_${batchRunCode(batchId).replace('-', '')}_o${oi + 1}_app_${j + 1}`.toLowerCase().slice(0, 40);
      const applicantEmail = makeEmail('join.applicant', batchId, orgSlug, oi, j + 1, config);

      const applicant = await createUser({
        gamerName: applicantGamerName,
        email: applicantEmail,
        firstName: applicantFirstName,
        lastName: applicantLastName,
        isDisabled: false,
      });

      createdUserIds.push(applicant.id);
      batchSummary.users += 1;

      const requestedTeam = pickOne(rand, teams);
      const requestedSubUnit = subUnits.find((s) => s.id === requestedTeam.subUnitId) || pickOne(rand, subUnits);
      const requestedUnit = units.find((u) => u.id === requestedSubUnit.unitId) || pickOne(rand, units);

      const pendingCutoff = Math.ceil(joinRequestApplicantCount * 0.5);
      const approvedCutoff = Math.ceil(joinRequestApplicantCount * 0.8);
      const isPending = j < pendingCutoff;
      const isApproved = j >= pendingCutoff && j < approvedCutoff;
      const isDenied = !isPending && !isApproved;
      const approvedPlacement = isApproved ? nextDemoAssignment() : null;
      const createdAt = randomDateWithFallback(1, 75);
      const reviewedAt = new Date(createdAt.getTime() + randomInt(rand, 1, 5) * 24 * 3600 * 1000);

      await db.insert(schema.joinRequests).values({
        userId: applicant.id,
        organizationId: org.id,
        requestedUnitId: requestedUnit.id,
        requestedSubUnitId: requestedSubUnit.id,
        requestedTeamId: requestedTeam.id,
        requestedSubjectIds: [subject.id],
        assignedUnitId: isApproved ? approvedPlacement?.unitId || null : null,
        assignedSubUnitId: isApproved ? approvedPlacement?.subUnitId || null : null,
        assignedTeamId: isApproved ? approvedPlacement?.teamId || null : null,
        assignedSubjectIds: isApproved ? [subject.id] : null,
        status: isPending ? 'pending' : isApproved ? 'approved' : 'denied',
        denialReason: isDenied ? 'Demo denial: incomplete registration profile.' : null,
        reviewedBy: isPending ? null : reviewerId,
        reviewedAt: isPending ? null : reviewedAt,
        approvedAt: isApproved ? reviewedAt : null,
        approvalMethod: isApproved ? (rand() > 0.5 ? 'dashboard' : 'email_link') : null,
        createdAt,
      });

      if (isApproved) {
        await db.insert(schema.userOrganizationRoles).values({
          userId: applicant.id,
          organizationId: org.id,
          role: ROLES.LEARNER,
        });

        await db.insert(schema.userOrganizationAssignments).values({
          userId: applicant.id,
          organizationId: org.id,
          unitId: approvedPlacement?.unitId || null,
          subUnitId: approvedPlacement?.subUnitId || null,
          teamId: approvedPlacement?.teamId || null,
        });

        await db.insert(schema.notificationPreferences).values({
          userId: applicant.id,
          emailNotifications: true,
          inAppNotifications: true,
        }).onConflictDoNothing();

        orgMemberUserIds.push(applicant.id);
      }

      batchSummary.joinRequests += 1;
    }
    }

    const [questionBank] = await db
      .insert(schema.quizCollections)
      .values({
        organizationId: org.id,
        subjectId: subject.id,
        createdBy: contentCreators[0]?.id || actorUserId,
        name: withNamingConvention(`Question Bank for ${rawOrgName}`, config),
        description: 'Shared question bank for random quiz sampling',
        totalCards: 200,
        isActive: true,
        isPublic: false,
        difficulty: 'mixed',
        passPercentage: 70,
      })
      .returning();

    const questionTemplates = Array.from({ length: 200 }, (_, qi) => ({
      question: `Question ${qi + 1} for ${rawOrgName}: ${pickOne(rand, COURSE_TOPICS)} scenario analysis (${uniqueTag(batchId, oi, 'Q', qi)})`,
      answers: [`Option A${qi + 1}`, `Option B${qi + 1}`, `Option C${qi + 1}`, `Option D${qi + 1}`],
      correct: randomInt(rand, 1, 4),
    }));

    await db.insert(schema.quizCards).values(
      questionTemplates.map((q, idx) => ({
        collectionId: questionBank.id,
        questionType: 'multiple-choice',
        question: q.question,
        answer1: q.answers[0],
        answer2: q.answers[1],
        answer3: q.answers[2],
        answer4: q.answers[3],
        correctAnswerIndex: q.correct,
        displayOrder: idx + 1,
      }))
    );

    await db.insert(schema.quizCollectionVersions).values({
      collectionId: questionBank.id,
      organizationId: org.id,
      versionNumber: 1,
      name: `Question Bank for ${rawOrgName}`,
      description: 'Versioned question bank snapshot',
      totalCards: 200,
      difficulty: 'mixed',
      passPercentage: 70,
      collectionSnapshot: { totalCards: 200, seed: config.seed },
      changeDescription: 'Initial seed',
      editedBy: contentCreators[0]?.id || actorUserId,
    });

    batchSummary.quizzes += 1;

    createdCourseIdsByOrg[org.id] = [];

    if (config.includeCourseCatalog !== false && isFeatureModuleEnabled(config, 'courses_lessons', true)) {
    for (let ci = 0; ci < config.courseCountPerOrg; ci++) {
      const creator = pickOne(rand, contentCreators);
      const assignedUnit = pickOne(rand, units);
      const assignedSubUnit = subUnits.find((s) => s.unitId === assignedUnit.id) || pickOne(rand, subUnits);
      const assignedTeam = teams.find((t) => t.subUnitId === assignedSubUnit.id) || pickOne(rand, teams);
      const status = courseStatusByIndex(ci);
      const title = withNamingConvention(`${pickOne(rand, COURSE_TOPICS)} ${pickOne(rand, COURSE_VARIANTS)} for ${rawOrgName}`, config);
      const basePrice = randomInt(rand, 49, 799);

      const [course] = await db
        .insert(schema.courses)
        .values({
          organizationId: org.id,
          title,
          description: `Demo course for ${rawOrgName} (${status})`,
          price: decimal4(basePrice),
          currency: 'ZAR',
          categoryId: category.id,
          difficultyLevel: pickOne(rand, ['beginner', 'intermediate', 'advanced']),
          estimatedDuration: randomInt(rand, 30, 240),
          status,
          visibility: onprem ? 'org_only' : (ci % 3 === 0 ? 'public' : 'org_only'),
          unitId: assignedUnit.id,
          subUnitId: assignedSubUnit.id,
          teamId: assignedTeam.id,
          createdBy: creator.id,
          languageCode: 'en',
          isDefaultLanguage: true,
          translationStatus: 'published',
          averageRating: decimal2(0),
          totalRatings: 0,
        })
        .returning();

      createdCourseIdsByOrg[org.id].push(course.id);
      batchSummary.courses += 1;

      const [version] = await db
        .insert(schema.courseVersions)
        .values({
          courseId: course.id,
          versionNumber: '1.0',
          title: course.title,
          description: course.description,
          thumbnailUrl: course.thumbnailUrl,
          basePrice: course.price,
          baseCurrency: course.currency,
          isPublished: status !== 'draft',
          publishedAt: status !== 'draft' ? new Date() : null,
          upgradePrice: decimal4(Math.max(10, basePrice * 0.3)),
          upgradeCurrency: 'ZAR',
        })
        .returning();

      await db.update(schema.courses).set({ currentVersionId: version.id, updatedAt: new Date() }).where(eq(schema.courses.id, course.id));

      const lessonSpecs: Array<{ lessonType: 'overview' | 'content' | 'key_takeaways'; title: string; withQuiz: boolean }> = [
        { lessonType: 'overview', title: `${title} Overview`, withQuiz: false },
        { lessonType: 'content', title: `${title} Content`, withQuiz: true },
        { lessonType: 'key_takeaways', title: `${title} Key Takeaways`, withQuiz: true },
      ];

      const lessonRows: any[] = [];
      for (let li = 0; li < lessonSpecs.length; li++) {
        const spec = lessonSpecs[li];
        const isPublished = status !== 'draft';
        const [lesson] = await db
          .insert(schema.lessons)
          .values({
            organizationId: org.id,
            createdBy: creator.id,
            title: spec.title,
            description: `${spec.lessonType} lesson for ${title}`,
            generationMode: 'manual-upload',
            generationStatus: 'completed',
            presentationUrl: null,
            storageKey: config.sharedPptAssetKey || `private/lessons/${org.id}/demo/${course.id}/${spec.lessonType}.pptx`,
            sourceDocumentPath: config.sharedPptAssetKey || null,
            slideCount: 10,
            isPublished,
            publishedAt: isPublished ? new Date() : null,
            publishedBy: isPublished ? creator.id : null,
            isArchived: status === 'archived',
            detail: `Detailed ${spec.lessonType} content`,
            realWorldExample: `Real-world example for ${spec.lessonType}`,
            learningAssetContract: {
              version: '1.0.0',
              slides: Array.from({ length: 10 }, (_, s) => ({
                slideIndex: s + 1,
                title: `${spec.lessonType} Slide ${s + 1}`,
                bullets: [`Point ${s + 1}A`, `Point ${s + 1}B`],
              })),
            },
            presenterNotesJson: { note: 'Demo presenter notes' },
          })
          .returning();

        const [lessonVersion] = await db
          .insert(schema.lessonVersions)
          .values({
            lessonId: lesson.id,
            organizationId: org.id,
            versionNumber: 1,
            title: lesson.title,
            description: lesson.description,
            generationMode: lesson.generationMode,
            generationStatus: lesson.generationStatus,
            slideCount: 10,
            relatedQuizId: null,
            isPublished: lesson.isPublished,
            isArchived: lesson.isArchived,
            publishedAt: lesson.publishedAt,
            publishedBy: lesson.publishedBy,
            viewCount: 0,
            completionCount: 0,
            languageCode: 'en',
            lessonSnapshot: { lessonId: lesson.id, seed: config.seed },
            storageKey: lesson.storageKey || `private/lessons/${org.id}/demo/${lesson.id}.pptx`,
            fileSize: 0,
            editedBy: creator.id,
            changeDescription: 'Initial demo lesson version',
            diffSummary: { added: true },
          })
          .returning();

        await db
          .insert(schema.lessonContentVersions)
          .values({
            lessonId: lesson.id,
            versionNumber: 1,
            source: 'demo_seed',
            changeDescription: 'Initial generated content',
            previousContent: null,
            newContent: lesson.description,
            previousTitle: null,
            newTitle: lesson.title,
            previousDescription: null,
            newDescription: lesson.description,
            metadata: { demoBatchId: batchId },
            createdBy: creator.id,
          });

        await db.insert(schema.lessonPresentationVersions).values({
          lessonId: lesson.id,
          version: 1,
          gammaCardId: uniqueCode('GCARD'),
          presentationUrl: lesson.presentationUrl || `https://demo.learnplay.local/presentations/${lesson.id}/v1`,
          storageKey: lesson.storageKey,
          themeId: null,
          gammaImageOptions: { mode: 'demo' },
          gammaTextOptions: { mode: 'demo' },
          creditsCharged: 0,
          isGenerated: true,
          isCompressed: false,
          languageCode: 'en',
          createdBy: creator.id,
        });

        await db.insert(schema.lessonSlides).values(
          Array.from({ length: 10 }, (_, s) => ({
            lessonId: lesson.id,
            version: 1,
            slideIndex: s + 1,
            title: `${spec.lessonType} Slide ${s + 1}`,
            bullets: [`Key point ${s + 1}`, `Action ${s + 1}`],
            speakerNotes: `Speaker note ${s + 1}`,
            mediaPrompt: `Visual ${s + 1}`,
            role: s === 0 ? 'overview' : 'content',
          }))
        );

        lessonRows.push({ ...lesson, spec, lessonVersionId: lessonVersion.id });
      }

      let contentQuizId: string | null = null;
      let takeawaysQuizId: string | null = null;

      for (const lesson of lessonRows) {
        if (!lesson.spec.withQuiz) continue;

        const [lessonQuizCollection] = await db
          .insert(schema.quizCollections)
          .values({
            organizationId: org.id,
            subjectId: subject.id,
            createdBy: creator.id,
            name: `${lesson.spec.title} Quiz`,
            description: `10-question quiz for ${lesson.spec.lessonType}`,
            totalCards: 10,
            isActive: true,
            isPublic: false,
            difficulty: lesson.spec.lessonType === 'content' ? 'medium' : 'easy',
            passPercentage: 70,
          })
          .returning();

        const selectedQuestions = pickMany(rand, questionTemplates, 10);
        const insertedCards = await db
          .insert(schema.quizCards)
          .values(
            selectedQuestions.map((q, idx) => ({
              collectionId: lessonQuizCollection.id,
              questionType: 'multiple-choice',
              question: q.question,
              answer1: q.answers[0],
              answer2: q.answers[1],
              answer3: q.answers[2],
              answer4: q.answers[3],
              correctAnswerIndex: q.correct,
              displayOrder: idx + 1,
            }))
          )
          .returning();

        await db.insert(schema.quizCollectionVersions).values({
          collectionId: lessonQuizCollection.id,
          organizationId: org.id,
          versionNumber: 1,
          name: lessonQuizCollection.name,
          description: lessonQuizCollection.description,
          totalCards: 10,
          difficulty: lessonQuizCollection.difficulty,
          passPercentage: 70,
          collectionSnapshot: { seededFromBank: questionBank.id, cardCount: 10 },
          changeDescription: 'Initial lesson quiz',
          editedBy: creator.id,
        });

        await db.insert(schema.quizCardExplanations).values(
          insertedCards.slice(0, 4).map((card) => ({
            cardId: card.id,
            explanation: `Demo explanation for ${card.question?.slice(0, 60) || 'question'}`,
          }))
        );

        await db.insert(schema.lessonQuizLinks).values({
          lessonId: lesson.id,
          quizId: lessonQuizCollection.id,
          isPrimary: true,
          presentationVersionId: 1,
          slideContentHash: crypto.createHash('sha1').update(`${lesson.id}:${lessonQuizCollection.id}`).digest('hex'),
          isOutdated: false,
        });

        await db.insert(schema.quizCollectionAssignments).values({
          collectionId: lessonQuizCollection.id,
          subjectId: subject.id,
          unitId: assignedUnit.id,
          subUnitId: assignedSubUnit.id,
          requiredPassPercentage: 70,
          availableFrom: randomDateWithFallback(30, 120),
          availableTo: boundedFutureDate(30, 365),
        });

        batchSummary.quizzes += 1;

        if (lesson.spec.lessonType === 'content') contentQuizId = lessonQuizCollection.id;
        if (lesson.spec.lessonType === 'key_takeaways') takeawaysQuizId = lessonQuizCollection.id;
      }

      for (let li = 0; li < lessonRows.length; li++) {
        const lesson = lessonRows[li];
        const primaryQuizId = lesson.spec.lessonType === 'content' ? contentQuizId : lesson.spec.lessonType === 'key_takeaways' ? takeawaysQuizId : null;
        await db.insert(schema.courseLessons).values({
          courseId: course.id,
          lessonId: lesson.id,
          topicId: `topic-${li + 1}`,
          topicOrder: li + 1,
          topicName: lesson.title,
          primaryQuizId,
          learningObjectives: [`Understand ${lesson.spec.lessonType}`, 'Apply in role context'],
          lessonDetail: lesson.detail || `Detail for ${lesson.spec.lessonType}`,
          realWorldExample: lesson.realWorldExample || `Example for ${lesson.spec.lessonType}`,
          lessonType: lesson.spec.lessonType,
          contentHealth: { score: randomInt(rand, 70, 99), issues: [] },
        });
        batchSummary.lessons += 1;
      }

      await db.insert(schema.courseFrameworks).values({
        courseId: course.id,
        organizationId: org.id,
        topics: lessonRows.map((lesson, li) => ({
          id: `topic-${li + 1}`,
          order: li + 1,
          name: lesson.title,
          lessonType: lesson.spec.lessonType,
          lessonId: lesson.id,
        })),
        sourceMap: {
          extractedAt: new Date().toISOString(),
          sectionSpans: [],
        },
        contentHealth: {
          overallScore: randomInt(rand, 75, 98),
          topicScores: lessonRows.map((lesson, li) => ({
            topicId: `topic-${li + 1}`,
            score: randomInt(rand, 72, 99),
            issues: [],
          })),
          hasOverview: true,
          hasKeyTakeaways: true,
          validatedAt: new Date().toISOString(),
        },
      }).onConflictDoNothing();

      await db.insert(schema.bulkQuizGenerationJobs).values({
        courseId: course.id,
        organizationId: org.id,
        createdBy: creator.id,
        status: 'completed',
        totalLessons: 2,
        completedLessons: 2,
        failedLessons: 0,
        jobResults: { contentQuizId, takeawaysQuizId },
        completedAt: new Date(),
      });

      const assigneePool = userRows.filter((u) => [ROLES.LEARNER, ROLES.TRAINER, ROLES.TEAM_LEAD, ROLES.ORG_ADMIN].includes(u.role));
      for (const user of assigneePool) {
        if (rand() > 0.7) continue;

        await db.insert(schema.courseAssignments).values({
          courseId: course.id,
          organizationId: org.id,
          assignedBy: creator.id,
          assignmentScope: 'user',
          userId: user.id,
          unitId: user.unitId,
          subUnitId: user.subUnitId,
          teamId: user.teamId,
          targetOrganizationId: null,
          audience: 'learner',
          mandatory: rand() > 0.4,
            dueDate: boundedFutureDate(7, 90),
            assignedAt: randomDateWithFallback(1, 120),
        }).onConflictDoNothing();
      }
    }
    }

    step += 5;
    setProgress(Math.min(80, Math.floor((step / totalSteps) * 100)), `Generated base structure for ${org.name}`);

    const coursesInOrg = createdCourseIdsByOrg[org.id] || [];
    const usersInOrg = orgUsersByOrg[org.id] || [];
    const learners = usersInOrg.filter((u) => u.role === ROLES.LEARNER);
    const staff = usersInOrg.filter((u) => u.role !== ROLES.LEARNER);

    for (const courseId of coursesInOrg) {
      const [course] = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId)).limit(1);
      if (!course) continue;
      const [version] = await db.select().from(schema.courseVersions).where(eq(schema.courseVersions.courseId, course.id)).limit(1);
      const courseLessons = await db.select().from(schema.courseLessons).where(eq(schema.courseLessons.courseId, course.id));

      const enrolledUsers =
        config.includeEnrollments !== false && isFeatureModuleEnabled(config, 'enrollments_progress', true)
          ? usersInOrg.filter(() => rand() > 0.25)
          : [];
      for (const user of enrolledUsers) {
        const enrolledAt = randomDateWithFallback(1, 120);
        await db
          .insert(schema.userCourseEnrollments)
          .values({
            userId: user.id,
            courseId: course.id,
            courseVersionId: version.id,
            hasNewerVersion: false,
            latestVersionId: version.id,
            enrolledAt,
          })
          .onConflictDoNothing();
        batchSummary.enrollments += 1;

        if (onprem) {
          const enrollmentValue = Number(course.price || 0);
          const exchangeRateUsed = decimal4(1);
          await db
            .insert(schema.coursePurchases)
            .values({
              courseId: course.id,
              courseVersionId: version.id,
              userId: user.id,
              checkoutId: uniqueCode('OP-ENR'),
              status: 'completed',
              purchasePrice: decimal4(enrollmentValue),
              purchaseCurrency: course.currency || 'ZAR',
              platformCurrency: course.currency || 'ZAR',
              exchangeRateUsed,
              platformAmount: decimal4(enrollmentValue),
              commissionRate: decimal4(0),
              commissionAmount: decimal4(0),
              creatorEarnings: decimal4(enrollmentValue),
              purchasedAt: enrolledAt,
              baseCurrency: course.currency || 'ZAR',
              basePrice: decimal4(enrollmentValue),
              receiptPdfPath: null,
            })
            .onConflictDoNothing();
        }

        let completedLessons = 0;
        for (const cl of courseLessons) {
          const status = progressStatus(rand);
          if (status === 'completed') completedLessons += 1;
          const completedAt = status === 'completed' ? randomDateWithFallback(1, 90) : null;

          await db.insert(schema.userCourseLessonProgress).values({
            userId: user.id,
            courseId: course.id,
            courseVersionId: version.id,
            lessonId: cl.lessonId,
            status,
            completedAt,
          }).onConflictDoNothing();

          const [lp] = await db
            .insert(schema.lessonProgress)
            .values({
              lessonId: cl.lessonId,
              userId: user.id,
              organizationId: org.id,
              status,
              percentComplete: status === 'completed' ? 100 : status === 'in_progress' ? randomInt(rand, 10, 90) : 0,
              secondsSpent: randomInt(rand, 60, 3600),
              slidesViewedCount: randomInt(rand, 1, 10),
              totalSlides: 10,
              lastCheckpoint: `slide-${randomInt(rand, 1, 10)}`,
              completedAt,
            })
            .returning();

          await db.insert(schema.lessonProgressSlides).values(
            Array.from({ length: Math.min(5, randomInt(rand, 1, 5)) }, (_, s) => ({
              lessonProgressId: lp.id,
              slideIndex: s + 1,
              viewedAt: randomDateWithFallback(1, 60),
            }))
          ).onConflictDoNothing();

          if (cl.primaryQuizId) {
            const attempts = randomInt(rand, 1, 4);
            const bestScore = randomInt(rand, 4, 10);
            const bestPct = Math.round((bestScore / 10) * 10000) / 100;
            const isPassed = bestPct >= 70;
            const lastAttemptAt = randomDateWithFallback(1, 45);

            await db
              .insert(schema.userQuizProgress)
              .values({
                userId: user.id,
                collectionId: cl.primaryQuizId,
                organizationId: org.id,
                unitId: user.unitId || null,
                subUnitId: user.subUnitId || null,
                attemptsCount: attempts,
                bestScore,
                bestPercentage: decimal2(bestPct),
                isPassed,
                completionStatus: isPassed ? 'completed_passed' : 'completed_failed',
                lastAttemptAt,
                passedAt: isPassed ? lastAttemptAt : null,
              });

            await db
              .insert(schema.quizGameProgress)
              .values({
                userId: user.id,
                collectionId: cl.primaryQuizId,
                organizationId: org.id,
                unitId: user.unitId || null,
                subUnitId: user.subUnitId || null,
                totalGamesPlayed: attempts,
                totalGamesWon: randomInt(rand, 0, attempts),
                totalCorrectAnswers: randomInt(rand, bestScore, attempts * 10),
                totalAnswers: attempts * 10,
                averageScore: decimal2(randomInt(rand, 40, 95)),
                bestScore,
                lastPlayedAt: lastAttemptAt,
              });

            await db.insert(schema.quizGameResults).values({
              gameId: uniqueCode('QGAME'),
              collectionId: cl.primaryQuizId,
              gameMode: 'quiz_single',
              player1Id: user.id,
              player1Name: user.email.split('@')[0],
              player1Score: bestScore,
              player1CorrectAnswers: bestScore,
              player1TotalAnswers: 10,
              winnerId: user.id,
              gameDuration: randomInt(rand, 45, 420),
              gameStartedAt: new Date(lastAttemptAt.getTime() - 120000),
              gameEndedAt: lastAttemptAt,
              courseId: course.id,
              lessonId: cl.lessonId,
              courseVersionId: version.id,
              organizationId: org.id,
            });
          }
        }

        const totalLessons = courseLessons.length;
        const pct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
        const cpStatus = completedLessons === 0 ? 'not_started' : completedLessons >= totalLessons ? 'completed' : 'in_progress';
        await db
          .insert(schema.courseProgress)
          .values({
            courseId: course.id,
            userId: user.id,
            organizationId: org.id,
            status: cpStatus,
            completedLessons,
            totalLessons,
            percentComplete: pct,
            startedAt: randomDateWithFallback(1, 90),
            completedAt: cpStatus === 'completed' ? randomDateWithFallback(1, 30) : null,
            lastAccessedAt: randomDateWithFallback(0, 10),
          });

        if (cpStatus === 'completed') {
          const learnerDisplayName = user.email.split('@')[0].replace(/[._-]+/g, ' ').trim();
          await db
            .insert(schema.certificates)
            .values({
              certificateId: uniqueCode('COURSE'),
                certificateType: 'course',
                userId: user.id,
                organizationId: org.id,
                courseId: course.id,
                learnerName: learnerDisplayName || `${user.id.slice(0, 8)} Demo Learner`,
                organizationName: org.name,
                courseTitle: course.title,
                pdfStoragePath: `private/certificates/${user.id}/${uniqueCode('course')}.pdf`,
              completedAt: randomDateWithFallback(1, 20),
              xpEarned: randomInt(rand, 120, 600),
              shareToken: uniqueCode('share'),
              sharedPlatforms: rand() > 0.5 ? ['linkedin'] : [],
            })
            .onConflictDoNothing();
        }
      }

      if (config.includeMarketplaceSales !== false && isFeatureModuleEnabled(config, 'commerce_marketplace', true) && course.status === 'active' && !onprem) {
        const buyers = pickMany(rand, learners.length > 0 ? learners : usersInOrg, Math.min(learners.length || usersInOrg.length, randomInt(rand, 3, 12)));
        for (const buyer of buyers) {
          const paidAt = randomDateWithFallback(1, 90);
          const checkoutId = uniqueCode('CHK');
          const purchasePrice = Number(course.price || 0);
          const commissionRate = 0.3;
          const commissionAmount = purchasePrice * commissionRate;
          const creatorEarnings = purchasePrice - commissionAmount;

          const [intent] = await db
            .insert(schema.paymentIntents)
            .values({
              checkoutId,
              intentType: 'course',
              intentId: course.id,
              userId: buyer.id,
              organizationId: org.id,
              amount: decimal2(purchasePrice),
              currency: 'ZAR',
              status: 'succeeded',
              metadata: { demoBatchId: batchId, courseId: course.id, orgId: org.id },
              checkoutUrl: 'https://demo.checkout.local',
              successUrl: 'https://demo.local/success',
              cancelUrl: 'https://demo.local/cancel',
              failureUrl: 'https://demo.local/fail',
              lastWebhookAt: paidAt,
              reconciledAt: paidAt,
            })
            .returning();

          await db.insert(schema.paymentFulfillments).values({
            paymentIntentId: intent.id,
            checkoutId,
            intentType: 'course',
            intentId: course.id,
            fulfilledBy: 'demo_seed',
            fulfillmentData: { purchased: true },
            fulfilledAt: paidAt,
          });

          await db.insert(schema.paymentTransactions).values({
            organizationId: org.id,
            userId: buyer.id,
            courseId: course.id,
            courseVersionId: version.id,
            provider: 'demo',
            checkoutId,
            amount: decimal4(purchasePrice),
            currency: 'ZAR',
            status: 'completed',
            metadata: { demoBatchId: batchId },
            completedAt: paidAt,
          });

          await db.insert(schema.coursePurchases).values({
            courseId: course.id,
            courseVersionId: version.id,
            userId: buyer.id,
            checkoutId,
            status: 'completed',
            purchasePrice: decimal4(purchasePrice),
            purchaseCurrency: 'ZAR',
            platformCurrency: 'ZAR',
            exchangeRateUsed: decimal4(1),
            platformAmount: decimal4(purchasePrice),
            commissionRate: decimal4(commissionRate),
            commissionAmount: decimal4(commissionAmount),
            creatorEarnings: decimal4(creatorEarnings),
            purchasedAt: paidAt,
            baseCurrency: 'ZAR',
            basePrice: decimal4(purchasePrice),
            receiptPdfPath: `private/receipts/${buyer.id}/${checkoutId}.pdf`,
          }).onConflictDoNothing();

          batchSummary.purchases += 1;

          if (rand() > 0.8) {
            const [purchase] = await db
              .select()
              .from(schema.coursePurchases)
              .where(and(eq(schema.coursePurchases.courseId, course.id), eq(schema.coursePurchases.userId, buyer.id)))
              .limit(1);
            if (purchase) {
              await db.insert(schema.courseRefunds).values({
                purchaseId: purchase.id,
                courseId: course.id,
                userId: buyer.id,
                organizationId: org.id,
                status: rand() > 0.5 ? 'approved' : 'declined',
                requestReason: 'Demo refund workflow',
                decisionReason: 'Demo moderation outcome',
                decidedBy: pickOne(rand, staff)?.id || actorUserId,
                originalAmount: purchase.purchasePrice,
                originalCurrency: 'ZAR',
                exchangeRateSnapshot: decimal4(1),
                platformCommission: decimal4(commissionAmount),
                creatorRefundAmount: decimal4(creatorEarnings),
                platformCurrency: 'ZAR',
                completionPercentage: decimal2(randomInt(rand, 0, 100)),
                eligibilityWindowDays: 14,
                requestedAt: new Date(paidAt.getTime() + 24 * 3600 * 1000),
                decidedAt: new Date(paidAt.getTime() + 2 * 24 * 3600 * 1000),
                paidOutAt: new Date(paidAt.getTime() + 4 * 24 * 3600 * 1000),
              });
            }
          }

          if (config.includeReviews !== false && isFeatureModuleEnabled(config, 'reviews_ratings', true) && rand() > 0.3) {
            const rating = (Math.round((randomInt(rand, 3, 5) + (rand() > 0.5 ? 0.5 : 0)) * 10) / 10).toFixed(1);
            const reviewText = `Demo review ${uniqueTag(batchId, oi, 'REV', batchSummary.reviews)}: practical, clear, and useful for day-to-day work.`;
            await db.insert(schema.courseReviews).values({
              courseId: course.id,
              userId: buyer.id,
              organizationId: org.id,
              rating,
              comment: reviewText,
              displayName: buyer.email.split('@')[0],
              reviewerDisplayName: buyer.email.split('@')[0],
              useRealName: false,
              isHidden: false,
              isVisible: true,
            }).onConflictDoNothing();

            await db.insert(schema.courseRatings).values({
              courseId: course.id,
              userId: buyer.id,
              rating,
              review: reviewText,
              isHidden: false,
              isReported: false,
            }).onConflictDoNothing();

            batchSummary.reviews += 1;
          }

          await db.insert(schema.platformRevenueSources).values({
            sourceType: 'course_purchase',
            sourceId: checkoutId,
            organizationId: org.id,
            userId: buyer.id,
            grossAmount: decimal4(purchasePrice),
            netAmount: decimal4(creatorEarnings),
            platformCommission: decimal4(commissionAmount),
            processingFee: decimal4(0),
            currency: 'ZAR',
            exchangeRateUsed: decimal4(1),
            normalizedAmountZAR: decimal4(purchasePrice),
            metadata: { demoBatchId: batchId },
            recordedAt: paidAt,
          }).onConflictDoNothing({
            target: [schema.platformRevenueSources.sourceType, schema.platformRevenueSources.sourceId],
          });
        }
      }

      // OnPrem does not use marketplace payment flow, but demo environments still need
      // realistic course review/rating rows for admin review surfaces.
      if (onprem && config.includeReviews !== false && isFeatureModuleEnabled(config, 'reviews_ratings', true) && course.status === 'active') {
        const enrolledLearners = enrolledUsers.filter((u) => u.role === ROLES.LEARNER);
        const reviewCandidates = pickMany(
          rand,
          enrolledLearners,
          Math.min(enrolledLearners.length, randomInt(rand, 3, 12))
        );

        for (const reviewer of reviewCandidates) {
          if (rand() > 0.8) continue;

          const rating = (Math.round((randomInt(rand, 3, 5) + (rand() > 0.5 ? 0.5 : 0)) * 10) / 10).toFixed(1);
          const reviewText = `Demo review ${uniqueTag(batchId, oi, 'REV', batchSummary.reviews)}: practical, clear, and useful for day-to-day work.`;

          await db.insert(schema.courseReviews).values({
            courseId: course.id,
            userId: reviewer.id,
            organizationId: org.id,
            rating,
            comment: reviewText,
            displayName: reviewer.email.split('@')[0],
            reviewerDisplayName: reviewer.email.split('@')[0],
            useRealName: false,
            isHidden: false,
            isVisible: true,
          }).onConflictDoNothing();

          await db.insert(schema.courseRatings).values({
            courseId: course.id,
            userId: reviewer.id,
            rating,
            review: reviewText,
            isHidden: false,
            isReported: false,
          }).onConflictDoNothing();

          batchSummary.reviews += 1;
        }
      }
    }

    if (config.includeCreditPackPurchases !== false && isFeatureModuleEnabled(config, 'credits_purchases', true) && !onprem) {
      const eligibleBuyers = usersInOrg.filter((u) => u.role !== ROLES.LEARNER);
      for (const buyer of eligibleBuyers.slice(0, Math.min(eligibleBuyers.length, 20))) {
        const pkg = pickOne(rand, activeCreditPackages);
        if (!pkg) break;
        const checkoutId = uniqueCode('CRCHK');
        const paidAt = randomDateWithFallback(1, 60);
        const [intent] = await db
          .insert(schema.paymentIntents)
          .values({
            checkoutId,
            intentType: 'credits',
            intentId: pkg.id,
            userId: buyer.id,
            organizationId: org.id,
            amount: pkg.priceAmount,
            currency: 'ZAR',
            status: 'succeeded',
            metadata: { demoBatchId: batchId, packageId: pkg.id },
            checkoutUrl: 'https://demo.checkout.local/credits',
            successUrl: 'https://demo.local/success',
            cancelUrl: 'https://demo.local/cancel',
            failureUrl: 'https://demo.local/fail',
            lastWebhookAt: paidAt,
            reconciledAt: paidAt,
          })
          .returning();

        const [order] = await db
          .insert(schema.creditOrders)
          .values({
            packageId: pkg.id,
            purchaserId: buyer.id,
            organizationId: org.id,
            checkoutId,
            paymentIntentId: intent.id,
            creditsAmount: pkg.creditsAmount,
            amount: pkg.priceAmount,
            currency: 'ZAR',
            status: 'succeeded',
            purchaseTarget: rand() > 0.5 ? 'user' : 'organization',
            receiptPdfPath: `private/receipts/${buyer.id}/${checkoutId}.pdf`,
            fulfillmentAt: paidAt,
            metadata: { demoBatchId: batchId },
          })
          .returning();

        await db.insert(schema.paymentFulfillments).values({
          paymentIntentId: intent.id,
          checkoutId,
          intentType: 'credits',
          intentId: pkg.id,
          fulfilledBy: 'demo_seed',
          fulfillmentData: { creditsAdded: pkg.creditsAmount },
          fulfilledAt: paidAt,
        });

        const [allocExisting] = await db
          .select()
          .from(schema.userCreditAllocations)
          .where(and(eq(schema.userCreditAllocations.userId, buyer.id), eq(schema.userCreditAllocations.organizationId, org.id)))
          .limit(1);

        const currentBalance = Number(allocExisting?.currentBalance || 0);
        const nextBalance = currentBalance + pkg.creditsAmount;

        if (!allocExisting) {
          await db.insert(schema.userCreditAllocations).values({
            userId: buyer.id,
            organizationId: org.id,
            currentBalance: nextBalance,
            monthlyAllocation: 1000,
            lastResetDate: new Date(),
            status: 'active',
            isTrialAllocation: false,
          });
        } else {
          await db
            .update(schema.userCreditAllocations)
            .set({ currentBalance: nextBalance, updatedAt: new Date() })
            .where(eq(schema.userCreditAllocations.id, allocExisting.id));
        }

        await db.insert(schema.lpCreditLedger).values({
          userId: buyer.id,
          organizationId: org.id,
          transactionType: 'purchase',
          amount: pkg.creditsAmount,
          balanceAfter: nextBalance,
          correlationId: `demo-credit-order-${order.id}`,
          description: 'Demo LPC package purchase',
          metadata: { demoBatchId: batchId, orderId: order.id },
        });

        await db.insert(schema.creditTransactions).values({
          userId: buyer.id,
          organizationId: org.id,
          allocationId: allocExisting?.id || null,
          amount: pkg.creditsAmount,
          balanceAfter: nextBalance,
          transactionType: 'purchase',
          description: 'Demo LPC package purchase',
          correlationId: `demo-credit-order-${order.id}`,
          metadata: { demoBatchId: batchId },
        });

        await db
          .update(schema.users)
          .set({ lpCreditBalance: nextBalance, updatedAt: new Date() })
          .where(eq(schema.users.id, buyer.id));

        const [orgBalanceRow] = await db.select({ wallet: schema.organizations.orgCreditWallet }).from(schema.organizations).where(eq(schema.organizations.id, org.id)).limit(1);
        const orgWallet = Number(orgBalanceRow?.wallet || 0) + Math.round(pkg.creditsAmount * 0.4);
        await db.update(schema.organizations).set({ orgCreditWallet: orgWallet, updatedAt: new Date() }).where(eq(schema.organizations.id, org.id));

        await db.insert(schema.orgCreditLedger).values({
          organizationId: org.id,
          actorUserId: buyer.id,
          transactionType: 'purchase',
          activityType: 'purchase',
          activityId: order.id,
          amount: Math.round(pkg.creditsAmount * 0.4),
          balanceAfter: orgWallet,
          correlationId: `demo-org-wallet-${order.id}`,
          description: 'Demo org wallet top-up',
          metadata: { demoBatchId: batchId },
        });

        batchSummary.credits += 1;
      }
    }

    // Build multiplayer + leaderboard-shaped metrics so all leaderboard screens are populated.
    if (config.includeGamification !== false && isFeatureModuleEnabled(config, 'gamification', true)) {
    const orgGameCollections = await db
      .select({
        id: schema.cardCollections.id,
        name: schema.cardCollections.name,
      })
      .from(schema.cardCollections)
      .where(eq(schema.cardCollections.isActive, true))
      .limit(12);

    const multiplayerStatsByUser = new Map<string, { games: number; wins: number; totalDuration: number; currentStreak: number; bestStreak: number }>();
    for (const u of usersInOrg) {
      multiplayerStatsByUser.set(u.id, { games: 0, wins: 0, totalDuration: 0, currentStreak: 0, bestStreak: 0 });
    }

    if (orgGameCollections.length > 0 && usersInOrg.length >= 2) {
      const multiplayerGameCount = Math.min(220, Math.max(24, usersInOrg.length * 3));
      for (let gi = 0; gi < multiplayerGameCount; gi++) {
        const participants = pickMany(rand, usersInOrg, randomInt(rand, 2, Math.min(4, usersInOrg.length)));
        if (participants.length < 2) continue;
        const winner = pickOne(rand, participants);
        const gameCollection = pickOne(rand, orgGameCollections);
        const startedAt = randomDateWithFallback(1, 90);
        const duration = randomInt(rand, 120, 1200);
        const endedAt = new Date(startedAt.getTime() + duration * 1000);
        const gameMode = participants.length >= 4 ? '4player' : '1v1';

        await db.insert(schema.gameResults).values({
          collectionId: gameCollection.id,
          winnerId: winner.id,
          gameMode,
          playerIds: participants.map((p) => p.id),
          playerXPChanges: Object.fromEntries(
            participants.map((p) => [
              p.id,
              {
                xpChange: p.id === winner.id ? randomInt(rand, 35, 140) : -randomInt(rand, 5, 40),
              },
            ])
          ),
          totalRounds: randomInt(rand, 4, 16),
          gameDuration: duration,
          isMultiplayer: true,
          gameStartedAt: startedAt,
          gameEndedAt: endedAt,
        });

        for (const p of participants) {
          const stats = multiplayerStatsByUser.get(p.id);
          if (!stats) continue;
          stats.games += 1;
          stats.totalDuration += duration;
          if (p.id === winner.id) {
            stats.wins += 1;
            stats.currentStreak += 1;
            stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
          } else {
            stats.currentStreak = 0;
          }
        }
      }
    }

    const orgQuizCollections = await db
      .select({ id: schema.quizCollections.id })
      .from(schema.quizCollections)
      .where(and(eq(schema.quizCollections.organizationId, org.id), or(eq(schema.quizCollections.isDeleted, false), sql`${schema.quizCollections.isDeleted} IS NULL`)))
      .limit(300);
    const orgQuizCollectionIds = orgQuizCollections.map((q) => q.id);

    if (usersInOrg.length > 0 && orgQuizCollectionIds.length > 0) {
      const existingQgpRows = await db
        .select({ userId: schema.quizGameProgress.userId, collectionId: schema.quizGameProgress.collectionId })
        .from(schema.quizGameProgress)
        .where(and(eq(schema.quizGameProgress.organizationId, org.id), inArray(schema.quizGameProgress.userId, usersInOrg.map((u) => u.id))));
      const existingByUser = new Map<string, Set<string>>();
      for (const row of existingQgpRows) {
        if (!existingByUser.has(row.userId)) existingByUser.set(row.userId, new Set<string>());
        existingByUser.get(row.userId)!.add(row.collectionId);
      }

      for (const u of usersInOrg) {
        const existingSet = existingByUser.get(u.id) || new Set<string>();
        if (existingSet.size >= 3) continue;
        const needed = Math.max(0, 3 - existingSet.size);
        const availableCollections = orgQuizCollectionIds.filter((id) => !existingSet.has(id));
        const chosenCollections = pickMany(rand, availableCollections, Math.min(needed, availableCollections.length));
        for (const collectionId of chosenCollections) {
          const attempts = randomInt(rand, 1, 5);
          const wins = randomInt(rand, 0, attempts);
          const totalAnswers = attempts * 10;
          const totalCorrect = randomInt(rand, Math.max(1, wins * 5), totalAnswers);
          const bestScore = Math.min(10, Math.max(1, randomInt(rand, 4, 10)));
          const bestPct = Number(decimal2((bestScore / 10) * 100));
          const playedAt = randomDateWithFallback(1, 45);

          await db.insert(schema.quizGameProgress).values({
            userId: u.id,
            collectionId,
            organizationId: org.id,
            unitId: u.unitId || null,
            subUnitId: u.subUnitId || null,
            totalGamesPlayed: attempts,
            totalGamesWon: wins,
            totalCorrectAnswers: totalCorrect,
            totalAnswers,
            averageScore: decimal2((totalCorrect / totalAnswers) * 100),
            bestScore,
            lastPlayedAt: playedAt,
          });

          await db.insert(schema.userQuizProgress).values({
            userId: u.id,
            collectionId,
            organizationId: org.id,
            unitId: u.unitId || null,
            subUnitId: u.subUnitId || null,
            attemptsCount: attempts,
            bestScore,
            bestPercentage: decimal2(bestPct),
            isPassed: bestPct >= 70,
            completionStatus: bestPct >= 70 ? 'completed_passed' : 'completed_failed',
            lastAttemptAt: playedAt,
            passedAt: bestPct >= 70 ? playedAt : null,
          }).onConflictDoNothing();
        }
      }
    }

    const quizAggregateRows = usersInOrg.length
      ? await db
          .select({
            userId: schema.quizGameProgress.userId,
            totalGames: sql<number>`COALESCE(SUM(${schema.quizGameProgress.totalGamesPlayed}), 0)`,
            totalWins: sql<number>`COALESCE(SUM(${schema.quizGameProgress.totalGamesWon}), 0)`,
            totalCorrect: sql<number>`COALESCE(SUM(${schema.quizGameProgress.totalCorrectAnswers}), 0)`,
            totalAnswers: sql<number>`COALESCE(SUM(${schema.quizGameProgress.totalAnswers}), 0)`,
            bestScore: sql<number>`COALESCE(MAX(${schema.quizGameProgress.bestScore}), 0)`,
            avgScore: sql<number>`COALESCE(AVG(${schema.quizGameProgress.averageScore}), 0)`,
          })
          .from(schema.quizGameProgress)
          .where(and(eq(schema.quizGameProgress.organizationId, org.id), inArray(schema.quizGameProgress.userId, usersInOrg.map((u) => u.id))))
          .groupBy(schema.quizGameProgress.userId)
      : [];
    const quizStatsByUser = new Map(quizAggregateRows.map((r) => [r.userId, r]));

    // Notifications and engagement traces
    for (const u of usersInOrg.slice(0, 100)) {
      await db.insert(schema.userNotifications).values({
        userId: u.id,
        type: 'system_announcement',
        title: 'Demo Data Notice',
        message: `Demo content generated for ${org.name}`,
        metadata: { demoBatchId: batchId, organizationId: org.id },
        isRead: rand() > 0.5,
        readAt: rand() > 0.5 ? new Date() : null,
      });

      const quizStats = quizStatsByUser.get(u.id) || {
        totalGames: randomInt(rand, 2, 16),
        totalWins: randomInt(rand, 1, 10),
        totalCorrect: randomInt(rand, 40, 220),
        totalAnswers: randomInt(rand, 80, 280),
        bestScore: randomInt(rand, 5, 10),
        avgScore: randomInt(rand, 45, 92),
      };
      const multiStats = multiplayerStatsByUser.get(u.id) || { games: 0, wins: 0, totalDuration: 0, currentStreak: 0, bestStreak: 0 };

      const totalGamesPlayed = Math.max(1, Number(quizStats.totalGames || 0) + multiStats.games + randomInt(rand, 1, 8));
      const totalWins = Math.min(totalGamesPlayed, Math.max(0, Number(quizStats.totalWins || 0) + multiStats.wins));
      const totalLosses = Math.max(0, totalGamesPlayed - totalWins);
      const winPct = totalGamesPlayed > 0 ? (totalWins / totalGamesPlayed) * 100 : 0;
      const xpBase = Number(quizStats.totalCorrect || 0) * 12 + totalWins * 35 + totalGamesPlayed * 8 + randomInt(rand, 120, 2200);
      const currentXP = Math.max(0, xpBase);
      const currentLevel = getLevelFromXP(currentXP);
      const playerTitle = playerTitleFromLevel(currentLevel);
      const avgDuration = multiStats.games > 0
        ? Math.round(multiStats.totalDuration / multiStats.games)
        : randomInt(rand, 120, 780);
      const currentWinStreak = Math.min(totalWins, Math.max(multiStats.currentStreak, randomInt(rand, 0, 8)));
      const bestWinStreak = Math.min(totalWins, Math.max(currentWinStreak, multiStats.bestStreak, randomInt(rand, currentWinStreak, 18)));
      const singlePlayerGames = Math.max(0, totalGamesPlayed - multiStats.games);
      const singlePlayerWins = Math.min(singlePlayerGames, Math.round((singlePlayerGames * randomInt(rand, 35, 80)) / 100));

      if (globalChallenge) {
        await db.insert(schema.challengeProgress).values({
          userId: u.id,
          challengeId: globalChallenge.id,
          currentValue: randomInt(rand, 0, 10),
          isCompleted: rand() > 0.5,
          isClaimed: rand() > 0.65,
          completedAt: rand() > 0.5 ? new Date() : null,
          claimedAt: rand() > 0.65 ? new Date() : null,
          resetAt: boundedFutureDate(1, 2),
        }).onConflictDoNothing();
      }
      if (globalAchievement) {
        await db.insert(schema.achievementUnlocks).values({
          userId: u.id,
          achievementId: globalAchievement.id,
          progress: randomInt(rand, 0, 100),
          isUnlocked: rand() > 0.7,
          unlockedAt: rand() > 0.7 ? new Date() : null,
        }).onConflictDoNothing();
      }

      await db.insert(schema.dailyStreaks).values({
        userId: u.id,
        organizationId: org.id,
        currentStreak: Math.min(bestWinStreak, randomInt(rand, 0, Math.max(1, bestWinStreak))),
        bestStreak: Math.max(bestWinStreak, randomInt(rand, bestWinStreak, bestWinStreak + 12)),
        lastCompletedDate: randomDateWithFallback(0, 10),
      }).onConflictDoNothing();

      const playerStatsPayload = {
        playerId: u.id,
        gamerName: u.gamerName || `demo_${u.id.slice(0, 8)}`,
        currentXP,
        currentLevel,
        currentRank: playerTitle,
        totalGamesPlayed,
        totalWins,
        totalLosses,
        winPercentage: decimal2(winPct),
        currentWinStreak,
        bestWinStreak,
        singlePlayerGames,
        singlePlayerWins,
        multiplayerGames: multiStats.games,
        multiplayerWins: multiStats.wins,
        averageGameDuration: avgDuration,
        totalXPEarned: currentXP + randomInt(rand, 0, 1200),
        totalXPLost: randomInt(rand, 0, Math.max(0, Math.floor(currentXP * 0.15))),
        certificatesEarned: randomInt(rand, 0, 12),
        lastGameAt: randomDateWithFallback(0, 20),
        lastLevelChangeAt: randomDateWithFallback(0, 30),
        lastRankChangeAt: randomDateWithFallback(0, 20),
      };
      const existingPlayerStats = await db
        .select({ id: schema.playerStats.id })
        .from(schema.playerStats)
        .where(eq(schema.playerStats.playerId, u.id))
        .limit(1);
      if (existingPlayerStats.length > 0) {
        await db
          .update(schema.playerStats)
          .set({ ...playerStatsPayload, updatedAt: new Date() })
          .where(eq(schema.playerStats.playerId, u.id));
      } else {
        await db.insert(schema.playerStats).values(playerStatsPayload);
      }

      const leaderboardPayload = {
        gamerName: u.gamerName || `demo_${u.id.slice(0, 8)}`,
        avatarImageUrl: u.avatarImageUrl || null,
        country: u.country || null,
        playerTitle,
        rank: 0,
        totalWins,
        totalGames: totalGamesPlayed,
        winPercentage: decimal2(winPct),
        bestWinStreak,
        currentWinStreak,
        averageGameDuration: avgDuration,
        lastActiveAt: new Date(),
      };
      const existingLeaderboardEntry = await db
        .select({ id: schema.leaderBoard.id })
        .from(schema.leaderBoard)
        .where(eq(schema.leaderBoard.gamerName, leaderboardPayload.gamerName))
        .limit(1);
      if (existingLeaderboardEntry.length > 0) {
        await db
          .update(schema.leaderBoard)
          .set({ ...leaderboardPayload, updatedAt: new Date() })
          .where(eq(schema.leaderBoard.gamerName, leaderboardPayload.gamerName));
      } else {
        await db.insert(schema.leaderBoard).values(leaderboardPayload);
      }

      if (activePowerUps.length > 0) {
        const selectedPowerUp = pickOne(rand, activePowerUps);
        await db.insert(schema.powerUpInventory).values({
          userId: u.id,
          powerUpId: selectedPowerUp.id,
          quantity: randomInt(rand, 1, 6),
        }).onConflictDoNothing();
      }

      const ownedCosmetics = pickMany(rand, activeCosmetics, Math.min(activeCosmetics.length, randomInt(rand, 1, 3)));
      for (const cosmetic of ownedCosmetics) {
        await db.insert(schema.cosmeticOwnership).values({ userId: u.id, cosmeticId: cosmetic.id }).onConflictDoNothing();
      }
      const cosmeticByType = ownedCosmetics.reduce((acc, c) => {
        if (!acc.has(c.type)) acc.set(c.type, c);
        return acc;
      }, new Map<string, any>());
      for (const [slot, cosmetic] of cosmeticByType.entries()) {
        await db.insert(schema.equippedCosmetics).values({
          userId: u.id,
          cosmeticId: cosmetic.id,
          slot,
        }).onConflictDoNothing();
      }
      await db.insert(schema.userCosmeticLoadouts).values({
        userId: u.id,
        equippedGlow: rand() > 0.5 ? 'demo_glow' : 'demo_pulse',
      }).onConflictDoNothing();

      const startingBalance = randomInt(rand, 80, 420);
      const earnedCoins = Math.round(Number(quizStats.totalCorrect || 0) * 0.8) + totalWins * randomInt(rand, 2, 8);
      const spentCoins = Math.round(earnedCoins * (rand() * 0.5));
      const finalCoinBalance = Math.max(0, startingBalance + earnedCoins - spentCoins);

      await db.insert(schema.coinTransactions).values({
        userId: u.id,
        amount: earnedCoins,
        balance: startingBalance + earnedCoins,
        type: 'demo_seed',
        description: 'Demo coin earnings from quiz and multiplayer activity',
        metadata: { demoBatchId: batchId, orgId: org.id, source: 'leaderboard_sync' },
      });
      await db.insert(schema.coinTransactions).values({
        userId: u.id,
        amount: -spentCoins,
        balance: finalCoinBalance,
        type: 'purchase',
        description: 'Demo coin spend on cosmetics/power-ups',
        metadata: { demoBatchId: batchId, orgId: org.id, source: 'leaderboard_sync' },
      });
    }
    }

    // Finance/report snapshots
    const reportPayload = {
      reportDate: new Date(),
      organizationType: 'elearning' as const,
      totalRevenue: decimal4(randomInt(rand, 15000, 90000)),
      totalCommission: decimal4(randomInt(rand, 5000, 18000)),
      totalPayouts: decimal4(randomInt(rand, 5000, 60000)),
      currency: 'ZAR' as const,
      reportData: { demoBatchId: batchId, organizationId: org.id },
    };

    const [existingDemoReport] = await db
      .select({ id: schema.platformRevenueReports.id })
      .from(schema.platformRevenueReports)
      .where(and(
        eq(schema.platformRevenueReports.organizationType, 'elearning'),
        sql`${schema.platformRevenueReports.reportData}->>'demoBatchId' = ${batchId}`,
        sql`${schema.platformRevenueReports.reportData}->>'organizationId' = ${org.id}`
      ))
      .limit(1);

    if (existingDemoReport?.id) {
      await db
        .update(schema.platformRevenueReports)
        .set(reportPayload)
        .where(eq(schema.platformRevenueReports.id, existingDemoReport.id));
    } else {
      try {
        await db.insert(schema.platformRevenueReports).values(reportPayload);
      } catch (error) {
        // If another worker wrote same cache key concurrently, reconcile by update.
        if (!isUniqueViolation(error)) {
          throw error;
        }
        await db
          .update(schema.platformRevenueReports)
          .set(reportPayload)
          .where(and(
            eq(schema.platformRevenueReports.reportDate, reportPayload.reportDate),
            eq(schema.platformRevenueReports.organizationType, reportPayload.organizationType)
          ));
      }
    }

    const snapshotPayload = {
      periodStart: randomDateWithFallback(30, 120),
      periodEnd: randomDateInWindow(),
      periodType: 'monthly',
      organizationId: org.id,
      grossRevenueZAR: decimal4(randomInt(rand, 10000, 150000)),
      netRevenueZAR: decimal4(randomInt(rand, 7000, 90000)),
      totalCostsZAR: decimal4(randomInt(rand, 1000, 40000)),
      netProfitZAR: decimal4(randomInt(rand, 5000, 70000)),
      profitMarginPercent: decimal2(randomInt(rand, 20, 60)),
      courseRevenue: decimal4(randomInt(rand, 8000, 70000)),
      creditRevenue: decimal4(randomInt(rand, 3000, 40000)),
      licenseRevenue: decimal4(randomInt(rand, 0, 8000)),
      subscriptionRevenue: decimal4(randomInt(rand, 3000, 25000)),
      chargebackAmount: decimal4(randomInt(rand, 0, 5000)),
      refundAmount: decimal4(randomInt(rand, 0, 6000)),
      transactionCount: randomInt(rand, 30, 500),
      metadata: { demoBatchId: batchId },
      generatedAt: new Date(),
    };

    const [existingDemoSnapshot] = await db
      .select({ id: schema.platformFinancialSnapshots.id })
      .from(schema.platformFinancialSnapshots)
      .where(and(
        eq(schema.platformFinancialSnapshots.organizationId, org.id),
        sql`${schema.platformFinancialSnapshots.metadata}->>'demoBatchId' = ${batchId}`
      ))
      .limit(1);

    if (existingDemoSnapshot?.id) {
      await db
        .update(schema.platformFinancialSnapshots)
        .set(snapshotPayload)
        .where(eq(schema.platformFinancialSnapshots.id, existingDemoSnapshot.id));
    } else {
      try {
        await db.insert(schema.platformFinancialSnapshots).values(snapshotPayload);
      } catch (error) {
        // If unique key collision happens under concurrency, update canonical row.
        if (!isUniqueViolation(error)) {
          throw error;
        }
        await db
          .update(schema.platformFinancialSnapshots)
          .set(snapshotPayload)
          .where(and(
            eq(schema.platformFinancialSnapshots.periodStart, snapshotPayload.periodStart),
            eq(schema.platformFinancialSnapshots.periodEnd, snapshotPayload.periodEnd),
            eq(schema.platformFinancialSnapshots.periodType, snapshotPayload.periodType),
            eq(schema.platformFinancialSnapshots.organizationId, snapshotPayload.organizationId)
          ));
      }
    }

    await db.insert(schema.financialAuditLog).values({
      eventType: 'demo_seed_generation',
      entityType: 'organization',
      entityId: org.id,
      userId: actorUserId,
      beforeState: null,
      afterState: { demoBatchId: batchId, generated: true },
      notes: `Demo batch ${batchId} generated for org ${org.id}`,
      timestamp: new Date(),
    });

    // Subscriptions and invoices demo rows
    if (learnerPlan && learners[0]) {
      const start = randomDateWithFallback(27, 60);
      const end = boundedFutureDate(1, 7);
      const [sub] = await db
        .insert(schema.subscriptions)
        .values({
          planId: learnerPlan.id,
          targetType: 'organization',
          targetId: org.id,
          status: 'active',
          currentPeriodStart: start,
          currentPeriodEnd: end,
          nextBillingDate: end,
          autoRenew: true,
          cancelAtPeriodEnd: false,
          reactivationEligible: true,
        })
        .returning();

      const [invoice] = await db
        .insert(schema.subscriptionInvoices)
        .values({
          subscriptionId: sub.id,
          yocoCheckoutId: uniqueCode('INVCHK'),
          checkoutUrl: 'https://demo.checkout.local/invoice',
          amountDue: learnerPlan.priceAmount,
          currency: 'ZAR',
          originalAmount: learnerPlan.priceAmount,
          originalCurrency: 'ZAR',
          exchangeRate: decimal4(1),
          billingPeriodStart: start,
          billingPeriodEnd: end,
          status: 'paid',
          dueAt: end,
          paidAt: randomDateWithFallback(2, 10),
          reminderSent: true,
          metadata: { demoBatchId: batchId },
        })
        .returning();

      await db.insert(schema.subscriptionEvents).values({
        subscriptionId: sub.id,
        eventType: 'created',
        previousStatus: null,
        newStatus: 'active',
        metadata: { demoBatchId: batchId },
        initiatedBy: actorUserId,
      });

      await db.insert(schema.emailLogs).values({
        recipientEmail: learners[0].email,
        recipientName: 'Demo Learner',
        subject: 'Subscription Invoice Paid',
        templateType: 'subscription_paid',
        status: 'delivered',
        subscriptionId: sub.id,
        invoiceId: invoice.id,
        attachmentPaths: [`private/invoices/${invoice.id}.pdf`],
        sentAt: randomDateWithFallback(2, 10),
        deliveredAt: new Date(randomDateWithFallback(2, 10).getTime() + 300000),
      });
    }

    step += 5;
    setProgress(Math.min(95, Math.floor((step / totalSteps) * 100)), `Generated transactional dataset for ${org.name}`);
  }

  // On-prem cross-org sharing demo behavior
  if (onprem && config.includeInterOrgAssignments !== false && isFeatureModuleEnabled(config, 'interorg_sharing', true) && createdOrgIds.length > 1) {
    const sourceOrgId = createdOrgIds[0];
    const sourceCourses = createdCourseIdsByOrg[sourceOrgId] || [];
    for (const targetOrgId of createdOrgIds.slice(1)) {
      await db
        .insert(schema.interOrgCourseAssignmentRules)
        .values({
          sourceOrganizationId: sourceOrgId,
          targetOrganizationId: targetOrgId,
          enabled: true,
          createdBy: actorUserId,
        })
        .onConflictDoNothing();

      for (const courseId of sourceCourses.slice(0, 3)) {
        await db
          .insert(schema.courseAssignments)
          .values({
            courseId,
            organizationId: sourceOrgId,
            assignedBy: actorUserId,
            assignmentScope: 'organization',
            targetOrganizationId: targetOrgId,
            audience: 'learner',
            mandatory: true,
            dueDate: boundedFutureDate(30, 90),
          })
          .onConflictDoNothing();

        batchSummary.crossOrgAssignments += 1;
      }
    }
  }

  // Lightweight integrity checks
  const [demoOrgCount] = createdOrgIds.length
    ? await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.organizations)
        .where(inArray(schema.organizations.id, createdOrgIds))
    : [{ count: 0 }];

  if ((demoOrgCount?.count ?? 0) < config.orgCount) {
    throw new Error(`Integrity validation failed: expected ${config.orgCount} demo organizations, found ${demoOrgCount?.count ?? 0}`);
  }

  const dupOrgRows = createdOrgIds.length
    ? await db
        .select({ key: schema.organizations.name, c: sql<number>`count(*)::int` })
        .from(schema.organizations)
        .where(inArray(schema.organizations.id, createdOrgIds))
        .groupBy(schema.organizations.name)
        .having(sql`count(*) > 1`)
    : [];
  const dupEmailRows = createdUserIds.length
    ? await db
        .select({ key: schema.users.email, c: sql<number>`count(*)::int` })
        .from(schema.users)
        .where(inArray(schema.users.id, createdUserIds))
        .groupBy(schema.users.email)
        .having(sql`count(*) > 1`)
    : [];
  const allCreatedCourseIds = Object.values(createdCourseIdsByOrg).flat();
  const dupCourseRows = allCreatedCourseIds.length
    ? await db
        .select({ key: schema.courses.title, c: sql<number>`count(*)::int` })
        .from(schema.courses)
        .where(inArray(schema.courses.id, allCreatedCourseIds))
        .groupBy(schema.courses.title)
        .having(sql`count(*) > 1`)
    : [];

  const orgDup = dupOrgRows.length;
  const emailDup = dupEmailRows.length;
  const courseDup = dupCourseRows.length;
  if (orgDup > 0 || emailDup > 0 || courseDup > 0) {
    throw new Error(`Uniqueness validation failed (orgNameDup=${orgDup}, emailDup=${emailDup}, courseTitleDup=${courseDup})`);
  }

  // Consistency checks so demo entities behave like normal production-shaped data.
  const [roleCoverage] = orgMemberUserIds.length
    ? await db
        .select({ count: sql<number>`count(distinct ${schema.userOrganizationRoles.userId})::int` })
        .from(schema.userOrganizationRoles)
        .where(inArray(schema.userOrganizationRoles.userId, orgMemberUserIds))
    : [{ count: 0 }];
  const [assignmentCoverage] = orgMemberUserIds.length
    ? await db
        .select({ count: sql<number>`count(distinct ${schema.userOrganizationAssignments.userId})::int` })
        .from(schema.userOrganizationAssignments)
        .where(inArray(schema.userOrganizationAssignments.userId, orgMemberUserIds))
    : [{ count: 0 }];
  if ((roleCoverage?.count ?? 0) !== orgMemberUserIds.length || (assignmentCoverage?.count ?? 0) !== orgMemberUserIds.length) {
    throw new Error(
      `Consistency validation failed: user role/assignment coverage mismatch (orgMembers=${orgMemberUserIds.length}, roles=${roleCoverage?.count ?? 0}, assignments=${assignmentCoverage?.count ?? 0})`
    );
  }

  const lessonCounts = allCreatedCourseIds.length
    ? await db
        .select({
          courseId: schema.courseLessons.courseId,
          total: sql<number>`count(*)::int`,
          withQuiz: sql<number>`sum(case when ${schema.courseLessons.primaryQuizId} is not null then 1 else 0 end)::int`,
        })
        .from(schema.courseLessons)
        .where(inArray(schema.courseLessons.courseId, allCreatedCourseIds))
        .groupBy(schema.courseLessons.courseId)
    : [];
  const missingCourseLessonRows = allCreatedCourseIds.length - lessonCounts.length;
  const invalidLessonShape = lessonCounts.filter((r) => Number(r.total || 0) !== 3 || Number(r.withQuiz || 0) !== 2).length;
  if (missingCourseLessonRows > 0 || invalidLessonShape > 0) {
    throw new Error(
      `Consistency validation failed: course lesson shape mismatch (missingCourses=${missingCourseLessonRows}, invalidCourseRows=${invalidLessonShape})`
    );
  }

  return {
    batchId,
    createdAt: nowIso(),
    createdBy: actorUserId,
    orgIds: createdOrgIds,
    userIds: createdUserIds,
    deploymentMode: onprem ? 'onprem' : 'cloud',
    summary: batchSummary,
    config,
  } as DemoBatchRecord;
}

async function purgeDemoDataByOrgs(targetOrgIds: string[], actorUserId: string, protectedOrgIds: string[] = []) {
  const protectedSet = new Set((protectedOrgIds || []).map((id) => String(id || '').trim()).filter(Boolean));
  const effectiveTargetOrgIds = targetOrgIds.filter((id) => !protectedSet.has(String(id || '').trim()));

  const userRoleRows = targetOrgIds.length
    ? await db
        .select({ userId: schema.userOrganizationRoles.userId })
        .from(schema.userOrganizationRoles)
        .where(inArray(schema.userOrganizationRoles.organizationId, effectiveTargetOrgIds))
    : [];
  const scopedUserIds = Array.from(new Set(userRoleRows.map((r) => r.userId)));
  const scopedUsers = scopedUserIds.length
    ? await db
        .select({
          id: schema.users.id,
          gamerName: schema.users.gamerName,
          email: schema.users.email,
          isAdmin: schema.users.isAdmin,
          isSuperAdmin: schema.users.isSuperAdmin,
          isCustSuper: schema.users.isCustSuper,
        })
        .from(schema.users)
        .where(inArray(schema.users.id, scopedUserIds))
    : [];
  const globalDemoUsers = await db
    .select({
      id: schema.users.id,
      gamerName: schema.users.gamerName,
      email: schema.users.email,
      isAdmin: schema.users.isAdmin,
      isSuperAdmin: schema.users.isSuperAdmin,
      isCustSuper: schema.users.isCustSuper,
    })
    .from(schema.users)
    .where(sql`${schema.users.email} ILIKE ${`%+demo-%@learnplay.demo.local`}`);

  const candidateUsersMap = new Map<string, (typeof scopedUsers)[number]>();
  for (const user of scopedUsers) candidateUsersMap.set(user.id, user);
  for (const user of globalDemoUsers) candidateUsersMap.set(user.id, user);
  const candidateUsers = Array.from(candidateUsersMap.values());
  const candidateUserIds = candidateUsers.map((user) => user.id);

  const crossScopeScopeCondition = effectiveTargetOrgIds.length
    ? sql`${schema.userOrganizationRoles.organizationId} NOT IN (${sql.join(effectiveTargetOrgIds.map((id) => sql`${id}`), sql`, `)} )`
    : sql`true`;
  const crossScopeRoleRows = candidateUserIds.length
    ? await db
        .select({ userId: schema.userOrganizationRoles.userId })
        .from(schema.userOrganizationRoles)
        .where(
          and(
            inArray(schema.userOrganizationRoles.userId, candidateUserIds),
            crossScopeScopeCondition
          )
        )
    : [];
  const crossScopeUserIds = new Set(crossScopeRoleRows.map((row) => row.userId));
  const protectedRoleRows = protectedSet.size
    ? await db
        .select({ userId: schema.userOrganizationRoles.userId })
        .from(schema.userOrganizationRoles)
        .where(inArray(schema.userOrganizationRoles.organizationId, Array.from(protectedSet)))
    : [];
  const protectedUserIds = new Set(protectedRoleRows.map((row) => row.userId));
  const demoEmailRegex = /\+demo-.*@learnplay\.demo\.local$/i;
  const protectedEmails = new Set(['support@learnplay.co.za']);
  const targetUsers = candidateUsers.filter((user) => {
    if (crossScopeUserIds.has(user.id)) return false;
    if (protectedUserIds.has(user.id)) return false;
    if (protectedEmails.has(String(user.email || '').toLowerCase())) return false;
    return demoEmailRegex.test(user.email || '');
  });
  const targetUserIds = targetUsers.map((user) => user.id);
  const targetGamerNames = targetUsers.map((u) => u.gamerName).filter(Boolean);

  if (!effectiveTargetOrgIds.length) {
    if (!targetUserIds.length) {
      return { deletedOrganizations: 0, deletedUsers: 0 };
    }

    await db.delete(schema.reviewModerationActions).where(inArray(schema.reviewModerationActions.moderatorId, targetUserIds));
    await db.delete(schema.courseRatings).where(inArray(schema.courseRatings.userId, targetUserIds));
    await db.delete(schema.courseReviews).where(inArray(schema.courseReviews.userId, targetUserIds));
    await db.delete(schema.lessonAccessLogs).where(inArray(schema.lessonAccessLogs.userId, targetUserIds));
    await db.delete(schema.userCourseLessonProgress).where(inArray(schema.userCourseLessonProgress.userId, targetUserIds));
    await db.delete(schema.userCourseEnrollments).where(inArray(schema.userCourseEnrollments.userId, targetUserIds));
    await db.delete(schema.courseProgress).where(inArray(schema.courseProgress.userId, targetUserIds));
    await db.delete(schema.lessonProgress).where(inArray(schema.lessonProgress.userId, targetUserIds));
    await db.delete(schema.userQuizProgress).where(inArray(schema.userQuizProgress.userId, targetUserIds));
    await db.delete(schema.quizGameProgress).where(inArray(schema.quizGameProgress.userId, targetUserIds));
    await db.delete(schema.quizGameResults).where(inArray(schema.quizGameResults.player1Id, targetUserIds));
    await db.delete(schema.gameResults).where(inArray(schema.gameResults.winnerId, targetUserIds));

    await db.delete(schema.creditOrders).where(inArray(schema.creditOrders.purchaserId, targetUserIds));
    await db.delete(schema.creditTransactions).where(inArray(schema.creditTransactions.userId, targetUserIds));
    await db.delete(schema.lpCreditLedger).where(inArray(schema.lpCreditLedger.userId, targetUserIds));
    await db.delete(schema.gammaCreditLedger).where(inArray(schema.gammaCreditLedger.initiatedByUserId, targetUserIds));
    await db.delete(schema.userNotifications).where(inArray(schema.userNotifications.userId, targetUserIds));
    await db.delete(schema.notificationPreferences).where(inArray(schema.notificationPreferences.userId, targetUserIds));

    await db.delete(schema.challengeProgress).where(inArray(schema.challengeProgress.userId, targetUserIds));
    await db.delete(schema.achievementUnlocks).where(inArray(schema.achievementUnlocks.userId, targetUserIds));
    await db.delete(schema.dailyStreaks).where(inArray(schema.dailyStreaks.userId, targetUserIds));
    await db.delete(schema.loginStreaks).where(inArray(schema.loginStreaks.userId, targetUserIds));
    await db.delete(schema.playerStats).where(inArray(schema.playerStats.playerId, targetUserIds));
    if (targetGamerNames.length) {
      await db.delete(schema.leaderBoard).where(inArray(schema.leaderBoard.gamerName, targetGamerNames));
    }
    await db.delete(schema.coinAdjustments).where(inArray(schema.coinAdjustments.userId, targetUserIds));
    await db.delete(schema.coinTransactions).where(inArray(schema.coinTransactions.userId, targetUserIds));
    await db.delete(schema.activePowerUps).where(inArray(schema.activePowerUps.userId, targetUserIds));
    await db.delete(schema.powerUpInventory).where(inArray(schema.powerUpInventory.userId, targetUserIds));
    await db.delete(schema.cosmeticOwnership).where(inArray(schema.cosmeticOwnership.userId, targetUserIds));
    await db.delete(schema.equippedCosmetics).where(inArray(schema.equippedCosmetics.userId, targetUserIds));
    await db.delete(schema.userCosmeticLoadouts).where(inArray(schema.userCosmeticLoadouts.userId, targetUserIds));
    await db.delete(schema.seasonPassProgress).where(inArray(schema.seasonPassProgress.userId, targetUserIds));
    await db.delete(schema.seasonPassPurchases).where(inArray(schema.seasonPassPurchases.userId, targetUserIds));
    await db.delete(schema.playerSeasonRewards).where(inArray(schema.playerSeasonRewards.userId, targetUserIds));
    await db.delete(schema.users).where(inArray(schema.users.id, targetUserIds));

    return {
      deletedOrganizations: 0,
      deletedUsers: targetUserIds.length,
    };
  }

  const lessons = await db.select({ id: schema.lessons.id }).from(schema.lessons).where(inArray(schema.lessons.organizationId, effectiveTargetOrgIds));
  const lessonIds = lessons.map((l) => l.id);

  const courses = await db.select({ id: schema.courses.id }).from(schema.courses).where(inArray(schema.courses.organizationId, effectiveTargetOrgIds));
  const courseIds = courses.map((c) => c.id);

  const quizCollections = await db
    .select({ id: schema.quizCollections.id })
    .from(schema.quizCollections)
        .where(inArray(schema.quizCollections.organizationId, effectiveTargetOrgIds));
  const quizCollectionIds = quizCollections.map((q) => q.id);

  const payouts = await db
    .select({ id: schema.coursePayouts.id })
    .from(schema.coursePayouts)
    .where(inArray(schema.coursePayouts.organizationId, effectiveTargetOrgIds));
  const payoutIds = payouts.map((p) => p.id);

  const allocations = targetUserIds.length
    ? await db
        .select({ id: schema.userCreditAllocations.id })
        .from(schema.userCreditAllocations)
        .where(inArray(schema.userCreditAllocations.userId, targetUserIds))
    : [];
  const allocationIds = allocations.map((a) => a.id);

  const paymentIntents = targetUserIds.length
    ? await db
        .select({ id: schema.paymentIntents.id, checkoutId: schema.paymentIntents.checkoutId })
        .from(schema.paymentIntents)
        .where(inArray(schema.paymentIntents.userId, targetUserIds))
    : [];
  const paymentIntentIds = paymentIntents.map((p) => p.id);

  const creditOrders = targetUserIds.length
    ? await db.select({ id: schema.creditOrders.id }).from(schema.creditOrders).where(inArray(schema.creditOrders.purchaserId, targetUserIds))
    : [];
  const creditOrderIds = creditOrders.map((o) => o.id);

  const purchaseRows = courseIds.length
    ? await db.select({ id: schema.coursePurchases.id }).from(schema.coursePurchases).where(inArray(schema.coursePurchases.courseId, courseIds))
    : [];
  const purchaseIds = purchaseRows.map((p) => p.id);

  const lessonProgressRows = lessonIds.length
    ? await db
        .select({ id: schema.lessonProgress.id })
        .from(schema.lessonProgress)
        .where(inArray(schema.lessonProgress.lessonId, lessonIds))
    : [];
  const lessonProgressIds = lessonProgressRows.map((lp) => lp.id);

  const driftWarnings: string[] = [];
  const isSchemaDriftError = (error: any) => {
    const code = String(error?.code || '');
    const msg = String(error?.message || '').toLowerCase();
    return code === '42703' || code === '42p01' || msg.includes('does not exist');
  };
  const safePurgeStep = async (label: string, action: () => Promise<any>) => {
    try {
      await action();
    } catch (error: any) {
      if (isSchemaDriftError(error)) {
        const warning = `${label}: ${error?.message || 'schema drift detected'}`;
        driftWarnings.push(warning);
        console.warn(`[DemoData][Purge] ${warning}`);
        return;
      }
      throw error;
    }
  };
  const quoteIdent = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const fkChildrenCache = new Map<string, Array<{ childSchema: string; childTable: string; childColumn: string; parentColumn: string }>>();
  const singlePkCache = new Map<string, string | null>();
  const fkRecursionGuard = new Set<string>();
  const inListSql = (values: string[]) => sql.join(values.map((value) => sql`${value}`), sql`, `);

  const getFkChildren = async (parentSchema: string, parentTable: string, parentColumn: string) => {
    const cacheKey = `${parentSchema}.${parentTable}.${parentColumn}`;
    const cached = fkChildrenCache.get(cacheKey);
    if (cached) return cached;

    const result = await db.execute(sql`
      SELECT
        tc.table_schema AS child_schema,
        tc.table_name AS child_table,
        kcu.column_name AS child_column,
        ccu.column_name AS parent_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_schema = ${parentSchema}
        AND ccu.table_name = ${parentTable}
        AND ccu.column_name = ${parentColumn}
    `);

    const rows = result.rows.map((row: any) => ({
      childSchema: String(row.child_schema),
      childTable: String(row.child_table),
      childColumn: String(row.child_column),
      parentColumn: String(row.parent_column),
    }));

    fkChildrenCache.set(cacheKey, rows);
    return rows;
  };

  const getSinglePrimaryKeyColumn = async (tableSchema: string, tableName: string): Promise<string | null> => {
    const cacheKey = `${tableSchema}.${tableName}`;
    if (singlePkCache.has(cacheKey)) return singlePkCache.get(cacheKey) ?? null;

    const result = await db.execute(sql`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = ${tableSchema}
        AND tc.table_name = ${tableName}
      ORDER BY kcu.ordinal_position
    `);

    if (result.rows.length !== 1) {
      singlePkCache.set(cacheKey, null);
      return null;
    }

    const pkColumn = String((result.rows[0] as any).column_name);
    singlePkCache.set(cacheKey, pkColumn);
    return pkColumn;
  };

  const purgeDynamicFkChildren = async (
    parentSchema: string,
    parentTable: string,
    parentColumn: string,
    parentIds: string[],
    depth = 0
  ) => {
    if (!parentIds.length || depth > 8) return;

    const recursionKey = `${depth}:${parentSchema}.${parentTable}.${parentColumn}:${parentIds.slice(0, 20).join(',')}`;
    if (fkRecursionGuard.has(recursionKey)) return;
    fkRecursionGuard.add(recursionKey);

    const children = await getFkChildren(parentSchema, parentTable, parentColumn);
    for (const child of children) {
      if (child.childSchema !== 'public') continue;
      if (child.childTable === 'drizzle_migrations') continue;

      const qualifiedChild = `${quoteIdent(child.childSchema)}.${quoteIdent(child.childTable)}`;
      const quotedChildColumn = quoteIdent(child.childColumn);
      const childPk = await getSinglePrimaryKeyColumn(child.childSchema, child.childTable);

      if (childPk) {
        const childPkRows = await db.execute(sql`
          SELECT ${sql.raw(quoteIdent(childPk))} AS id
          FROM ${sql.raw(qualifiedChild)}
          WHERE ${sql.raw(`${quotedChildColumn}::text`)} IN (${inListSql(parentIds)})
        `);
        const childPkIds = childPkRows.rows.map((row: any) => String(row.id)).filter(Boolean);
        if (childPkIds.length) {
          await purgeDynamicFkChildren(child.childSchema, child.childTable, childPk, childPkIds, depth + 1);
        }
      }

      await safePurgeStep(`dynamic-fk:${parentTable}.${parentColumn}->${child.childTable}.${child.childColumn}`, async () => {
        await db.execute(sql`
          DELETE FROM ${sql.raw(qualifiedChild)}
          WHERE ${sql.raw(`${quotedChildColumn}::text`)} IN (${inListSql(parentIds)})
        `);
      });
    }
  };

  if (lessonProgressIds.length) {
    await safePurgeStep('lessonProgressSlides', async () => {
      await db.delete(schema.lessonProgressSlides).where(inArray(schema.lessonProgressSlides.lessonProgressId, lessonProgressIds));
    });
  }

  if (purchaseIds.length) {
    await safePurgeStep('courseRefunds', async () => {
      await db.delete(schema.courseRefunds).where(inArray(schema.courseRefunds.purchaseId, purchaseIds));
    });
  }

  await db.delete(schema.reviewModerationActions).where(targetUserIds.length ? inArray(schema.reviewModerationActions.moderatorId, targetUserIds) : sql`false`);
  await db.delete(schema.courseRatings).where(targetUserIds.length ? inArray(schema.courseRatings.userId, targetUserIds) : sql`false`);
  await db.delete(schema.courseReviews).where(targetUserIds.length ? inArray(schema.courseReviews.userId, targetUserIds) : sql`false`);
  await db.delete(schema.lessonAccessLogs).where(targetUserIds.length ? inArray(schema.lessonAccessLogs.userId, targetUserIds) : sql`false`);
  await db.delete(schema.userCourseLessonProgress).where(targetUserIds.length ? inArray(schema.userCourseLessonProgress.userId, targetUserIds) : sql`false`);
  await db.delete(schema.userCourseEnrollments).where(targetUserIds.length ? inArray(schema.userCourseEnrollments.userId, targetUserIds) : sql`false`);
  await db.delete(schema.courseProgress).where(targetUserIds.length ? inArray(schema.courseProgress.userId, targetUserIds) : sql`false`);
  await db.delete(schema.lessonProgress).where(targetUserIds.length ? inArray(schema.lessonProgress.userId, targetUserIds) : sql`false`);
  await db.delete(schema.userQuizProgress).where(targetUserIds.length ? inArray(schema.userQuizProgress.userId, targetUserIds) : sql`false`);
  await db.delete(schema.quizGameProgress).where(targetUserIds.length ? inArray(schema.quizGameProgress.userId, targetUserIds) : sql`false`);
  await db.delete(schema.quizGameResults).where(targetUserIds.length ? inArray(schema.quizGameResults.player1Id, targetUserIds) : sql`false`);
  await db.delete(schema.gameResults).where(targetUserIds.length ? inArray(schema.gameResults.winnerId, targetUserIds) : sql`false`);
  await db.delete(schema.certificates).where(inArray(schema.certificates.organizationId, effectiveTargetOrgIds));

  if (quizCollectionIds.length) {
    const quizCardRows = await db.select({ id: schema.quizCards.id }).from(schema.quizCards).where(inArray(schema.quizCards.collectionId, quizCollectionIds));
    const quizCardIds = quizCardRows.map((r) => r.id);
    if (quizCardIds.length) {
      await db.delete(schema.quizCardExplanations).where(inArray(schema.quizCardExplanations.cardId, quizCardIds));
      await db.delete(schema.quizCardVersions).where(inArray(schema.quizCardVersions.cardId, quizCardIds));
    }
    await db.delete(schema.quizCards).where(inArray(schema.quizCards.collectionId, quizCollectionIds));
    await db.delete(schema.quizCollectionAssignments).where(inArray(schema.quizCollectionAssignments.collectionId, quizCollectionIds));
    await db.delete(schema.quizCollectionVersions).where(inArray(schema.quizCollectionVersions.collectionId, quizCollectionIds));
    await db.delete(schema.quizDrafts).where(inArray(schema.quizDrafts.organizationId, targetOrgIds));
    await db.delete(schema.activeQuizGames).where(inArray(schema.activeQuizGames.collectionId, quizCollectionIds));
    await db.delete(schema.quizCollections).where(inArray(schema.quizCollections.id, quizCollectionIds));
  }

  if (lessonIds.length) {
    await db.delete(schema.lessonQuizLinks).where(inArray(schema.lessonQuizLinks.lessonId, lessonIds));
    await db.delete(schema.lessonAssignments).where(inArray(schema.lessonAssignments.lessonId, lessonIds));
    await db.delete(schema.lessonScopeAssignments).where(inArray(schema.lessonScopeAssignments.lessonId, lessonIds));
    await db.delete(schema.lessonPresentationVersions).where(inArray(schema.lessonPresentationVersions.lessonId, lessonIds));
    await db.delete(schema.lessonSlides).where(inArray(schema.lessonSlides.lessonId, lessonIds));
    await db.delete(schema.lessonContentVersions).where(inArray(schema.lessonContentVersions.lessonId, lessonIds));
    await db.delete(schema.lessonVersions).where(inArray(schema.lessonVersions.lessonId, lessonIds));
  }

  if (courseIds.length) {
    await purgeDynamicFkChildren('public', 'courses', 'id', courseIds);

    await db.delete(schema.paymentTransactions).where(inArray(schema.paymentTransactions.courseId, courseIds));
    await db.delete(schema.coursePayoutLineItems).where(inArray(schema.coursePayoutLineItems.courseId, courseIds));
    await db.delete(schema.coursePurchases).where(inArray(schema.coursePurchases.courseId, courseIds));
    await db.delete(schema.courseVersionNotifications).where(inArray(schema.courseVersionNotifications.courseId, courseIds));
    await db.delete(schema.courseAssignments).where(inArray(schema.courseAssignments.courseId, courseIds));
    await db.delete(schema.courseLessons).where(inArray(schema.courseLessons.courseId, courseIds));
    await db.delete(schema.courseVersionUpgrades).where(inArray(schema.courseVersionUpgrades.courseId, courseIds));
    await db.delete(schema.courseUpgradeOrders).where(inArray(schema.courseUpgradeOrders.courseId, courseIds));
    await db.delete(schema.coursePriceHistory).where(inArray(schema.coursePriceHistory.courseId, courseIds));
    await db.delete(schema.bulkQuizGenerationJobs).where(inArray(schema.bulkQuizGenerationJobs.courseId, courseIds));
    await db.delete(schema.courseVersions).where(inArray(schema.courseVersions.courseId, courseIds));
    await db.delete(schema.courses).where(inArray(schema.courses.id, courseIds));
  }

  if (payoutIds.length) {
    await db.delete(schema.coursePayoutLineItems).where(inArray(schema.coursePayoutLineItems.payoutId, payoutIds));
  }

  await db.delete(schema.coursePayouts).where(inArray(schema.coursePayouts.organizationId, effectiveTargetOrgIds));
  await db.delete(schema.payoutDisbursements).where(inArray(schema.payoutDisbursements.organizationId, effectiveTargetOrgIds));

  if (paymentIntentIds.length) {
    await db.delete(schema.paymentFulfillments).where(inArray(schema.paymentFulfillments.paymentIntentId, paymentIntentIds));
  }

  await db.delete(schema.paymentTransactions).where(inArray(schema.paymentTransactions.organizationId, targetOrgIds));

  if (creditOrderIds.length) {
    await db.delete(schema.postFulfillmentJobs).where(inArray(schema.postFulfillmentJobs.orderId, creditOrderIds));
  }

  await db.delete(schema.creditOrders).where(targetUserIds.length ? inArray(schema.creditOrders.purchaserId, targetUserIds) : sql`false`);
  if (paymentIntentIds.length) {
    await db.delete(schema.paymentIntents).where(inArray(schema.paymentIntents.id, paymentIntentIds));
  }
  await db.delete(schema.creditTransactions).where(targetUserIds.length ? inArray(schema.creditTransactions.userId, targetUserIds) : sql`false`);
  await db.delete(schema.lpCreditLedger).where(targetUserIds.length ? inArray(schema.lpCreditLedger.userId, targetUserIds) : sql`false`);
  await db.delete(schema.orgCreditLedger).where(inArray(schema.orgCreditLedger.organizationId, effectiveTargetOrgIds));
  await db.delete(schema.creditUsageLogs).where(inArray(schema.creditUsageLogs.organizationId, effectiveTargetOrgIds));
  await db.delete(schema.gammaCreditLedger).where(targetUserIds.length ? inArray(schema.gammaCreditLedger.initiatedByUserId, targetUserIds) : sql`false`);
  await db.delete(schema.gammaCreditSnapshots).where(sql`(metadata::text LIKE ${`%demoBatchId%`})`);

  if (allocationIds.length) {
    await db.delete(schema.userCreditAdjustments).where(inArray(schema.userCreditAdjustments.allocationId, allocationIds));
  }
  await db.delete(schema.userCreditAllocations).where(targetUserIds.length ? inArray(schema.userCreditAllocations.userId, targetUserIds) : sql`false`);

  await safePurgeStep('emailLogs', async () => {
    await db.delete(schema.emailLogs).where(sql`${schema.emailLogs.recipientEmail} ILIKE ${`%+demo-%@learnplay.demo.local`}`);
  });
  await safePurgeStep('subscriptionEvents', async () => {
    await db.delete(schema.subscriptionEvents).where(sql`${schema.subscriptionEvents.metadata}::text like ${`%demoBatchId%`}`);
  });
  await safePurgeStep('subscriptionInvoices', async () => {
    await db.delete(schema.subscriptionInvoices).where(sql`${schema.subscriptionInvoices.metadata}::text like ${`%demoBatchId%`}`);
  });
  await safePurgeStep('subscriptions', async () => {
    await db.delete(schema.subscriptions).where(inArray(schema.subscriptions.targetId, [...effectiveTargetOrgIds, ...targetUserIds]));
  });

  await db.delete(schema.platformRevenueSources).where(inArray(schema.platformRevenueSources.organizationId, effectiveTargetOrgIds));
  await safePurgeStep('platformRevenueReports', async () => {
    await db.delete(schema.platformRevenueReports).where(sql`${schema.platformRevenueReports.reportData}::text like ${`%demoBatchId%`}`);
  });
  await safePurgeStep('platformFinancialSnapshots', async () => {
    await db.delete(schema.platformFinancialSnapshots).where(sql`${schema.platformFinancialSnapshots.metadata}::text like ${`%demoBatchId%`}`);
  });
  await safePurgeStep('financialAuditLog-demo-notes', async () => {
    await db.delete(schema.financialAuditLog).where(sql`${schema.financialAuditLog.notes} like ${`%Demo batch%`}`);
  });

  await db.delete(schema.userNotifications).where(targetUserIds.length ? inArray(schema.userNotifications.userId, targetUserIds) : sql`false`);
  await db.delete(schema.notificationPreferences).where(targetUserIds.length ? inArray(schema.notificationPreferences.userId, targetUserIds) : sql`false`);

  await db.delete(schema.challengeProgress).where(targetUserIds.length ? inArray(schema.challengeProgress.userId, targetUserIds) : sql`false`);
  await db.delete(schema.achievementUnlocks).where(targetUserIds.length ? inArray(schema.achievementUnlocks.userId, targetUserIds) : sql`false`);
  await db.delete(schema.dailyStreaks).where(targetUserIds.length ? inArray(schema.dailyStreaks.userId, targetUserIds) : sql`false`);
  await db.delete(schema.loginStreaks).where(targetUserIds.length ? inArray(schema.loginStreaks.userId, targetUserIds) : sql`false`);
  await db.delete(schema.playerStats).where(targetUserIds.length ? inArray(schema.playerStats.playerId, targetUserIds) : sql`false`);
  await db.delete(schema.leaderBoard).where(targetGamerNames.length ? inArray(schema.leaderBoard.gamerName, targetGamerNames) : sql`false`);
  await db.delete(schema.coinAdjustments).where(targetUserIds.length ? inArray(schema.coinAdjustments.userId, targetUserIds) : sql`false`);
  await db.delete(schema.coinTransactions).where(targetUserIds.length ? inArray(schema.coinTransactions.userId, targetUserIds) : sql`false`);
  await db.delete(schema.activePowerUps).where(targetUserIds.length ? inArray(schema.activePowerUps.userId, targetUserIds) : sql`false`);
  await db.delete(schema.powerUpInventory).where(targetUserIds.length ? inArray(schema.powerUpInventory.userId, targetUserIds) : sql`false`);
  await db.delete(schema.cosmeticOwnership).where(targetUserIds.length ? inArray(schema.cosmeticOwnership.userId, targetUserIds) : sql`false`);
  await db.delete(schema.equippedCosmetics).where(targetUserIds.length ? inArray(schema.equippedCosmetics.userId, targetUserIds) : sql`false`);
  await db.delete(schema.userCosmeticLoadouts).where(targetUserIds.length ? inArray(schema.userCosmeticLoadouts.userId, targetUserIds) : sql`false`);
  await db.delete(schema.seasonPassProgress).where(targetUserIds.length ? inArray(schema.seasonPassProgress.userId, targetUserIds) : sql`false`);
  await db.delete(schema.seasonPassPurchases).where(targetUserIds.length ? inArray(schema.seasonPassPurchases.userId, targetUserIds) : sql`false`);
  await db.delete(schema.playerSeasonRewards).where(targetUserIds.length ? inArray(schema.playerSeasonRewards.userId, targetUserIds) : sql`false`);

  const joinReqRows = await db
    .select({ id: schema.joinRequests.id })
    .from(schema.joinRequests)
    .where(inArray(schema.joinRequests.organizationId, effectiveTargetOrgIds));
  const joinReqIds = joinReqRows.map((r) => r.id);
  if (joinReqIds.length) {
    await db.delete(schema.joinRequestApprovalTokens).where(inArray(schema.joinRequestApprovalTokens.joinRequestId, joinReqIds));
  }
  await db.delete(schema.joinRequests).where(inArray(schema.joinRequests.organizationId, effectiveTargetOrgIds));
  await db.delete(schema.userOrganizationAssignments).where(inArray(schema.userOrganizationAssignments.organizationId, effectiveTargetOrgIds));
  await db.delete(schema.userOrganizationRoles).where(inArray(schema.userOrganizationRoles.organizationId, effectiveTargetOrgIds));

  await db.delete(schema.lessonAssignments).where(inArray(schema.lessonAssignments.organizationId, effectiveTargetOrgIds));
  await db.delete(schema.lessonScopeAssignments).where(inArray(schema.lessonScopeAssignments.organizationId, effectiveTargetOrgIds));
  if (lessonIds.length) {
    await purgeDynamicFkChildren('public', 'lessons', 'id', lessonIds);
    await db.delete(schema.lessons).where(inArray(schema.lessons.id, lessonIds));
  }

  const orgUnitRows = await db
    .select({ id: schema.organizationUnits.id })
    .from(schema.organizationUnits)
    .where(inArray(schema.organizationUnits.organizationId, effectiveTargetOrgIds));
  const orgUnitIds = orgUnitRows.map((u) => u.id);
  if (orgUnitIds.length) {
    await db.delete(schema.unitSubjects).where(inArray(schema.unitSubjects.unitId, orgUnitIds));
  }
  await db.delete(schema.subjects).where(inArray(schema.subjects.organizationId, effectiveTargetOrgIds));

  await db.delete(schema.interOrgCourseAssignmentRules).where(or(
    inArray(schema.interOrgCourseAssignmentRules.sourceOrganizationId, effectiveTargetOrgIds),
    inArray(schema.interOrgCourseAssignmentRules.targetOrganizationId, effectiveTargetOrgIds),
  ));

  const subUnitRows = orgUnitIds.length
    ? await db
        .select({ id: schema.organizationSubUnits.id })
        .from(schema.organizationSubUnits)
        .where(inArray(schema.organizationSubUnits.unitId, orgUnitIds))
    : [];
  const subUnitIds = subUnitRows.map((s) => s.id);
  if (subUnitIds.length) {
    await db.delete(schema.organizationTeams).where(inArray(schema.organizationTeams.subUnitId, subUnitIds));
    await db.delete(schema.organizationSubUnits).where(inArray(schema.organizationSubUnits.id, subUnitIds));
  }
  await db.delete(schema.organizationUnits).where(inArray(schema.organizationUnits.organizationId, targetOrgIds));

  await db.delete(schema.organizationDomains).where(inArray(schema.organizationDomains.organizationId, targetOrgIds));
  await db.delete(schema.brandingThemes).where(inArray(schema.brandingThemes.organizationId, targetOrgIds));
  await db.delete(schema.organizationBankDetails).where(inArray(schema.organizationBankDetails.organizationId, targetOrgIds));
  await db.delete(schema.organizationBankingDetails).where(inArray(schema.organizationBankingDetails.organizationId, targetOrgIds));
  await db.delete(schema.courseCategories).where(inArray(schema.courseCategories.organizationId, effectiveTargetOrgIds));

  await safePurgeStep('salesInquiries', async () => {
    await db.delete(schema.salesInquiries).where(sql`${schema.salesInquiries.email} like ${`%+demo-%@learnplay.demo.local`}`);
  });

  await purgeDynamicFkChildren('public', 'organizations', 'id', effectiveTargetOrgIds);
  await db.delete(schema.organizations).where(inArray(schema.organizations.id, effectiveTargetOrgIds));

  if (targetUserIds.length) {
    await purgeDynamicFkChildren('public', 'users', 'id', targetUserIds);
    await db.delete(schema.users).where(inArray(schema.users.id, targetUserIds));
  }

  await db.insert(schema.financialAuditLog).values({
    eventType: 'demo_seed_purge',
    entityType: 'organization',
    entityId: effectiveTargetOrgIds[0],
    userId: actorUserId,
    notes: `Demo purge completed for ${effectiveTargetOrgIds.length} organizations${protectedSet.size ? ` (protected=${protectedSet.size})` : ''}${driftWarnings.length ? ` (schema-drift warnings: ${driftWarnings.length})` : ''}`,
    timestamp: new Date(),
  });

  return {
    deletedOrganizations: effectiveTargetOrgIds.length,
    deletedUsers: targetUserIds.length,
  };
}

async function resolveDemoOrgIdsForPurge(protectedOrgIds: string[] = []): Promise<string[]> {
  const protectedSet = new Set((protectedOrgIds || []).map((id) => String(id || '').trim()).filter(Boolean));
  const batches = await getBatches();
  const fromBatches = Array.from(new Set(batches.flatMap((b) => b.orgIds).filter((id) => !!id && !protectedSet.has(id))));
  if (fromBatches.length > 0) {
    return fromBatches;
  }

  // Fallback path when batch metadata is missing/cleared:
  // discover demo orgs directly from DB state.
  const rows = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(
      or(
        eq(schema.organizations.isDemo, true),
        sql`${schema.organizations.name} ILIKE '[DEMO]%'`
      )
    );

  return Array.from(new Set(rows.map((r) => r.id).filter((id) => !!id && !protectedSet.has(id))));
}

async function runJob(job: DemoJob) {
  runningJobId = job.id;
  job.status = 'running';
  job.startedAt = nowIso();

  const setProgress = (progress: number, message: string) => {
    job.progress = Math.max(0, Math.min(progress, 100));
    job.message = message;
    jobs.set(job.id, { ...job });
  };

  try {
    setProgress(5, 'Checking environment guardrails');

    if (job.action === 'backup') {
      const backup = await createDatabaseBackup(setProgress, 'manual');
      setProgress(100, 'Database backup completed');
      job.result = { backup };
    } else if (job.action === 'restore') {
      const backupId = String(job.payload?.backupId || '').trim();
      if (!backupId) {
        throw new Error('backupId is required for restore action');
      }
      const backups = await listDatabaseBackups(await resolveDemoPolicyAsync());
      const target = backups.find((b) => b.id === backupId);
      if (!target) {
        throw new Error('Selected backup was not found. Refresh backups and try again.');
      }
      const restoreResult = await restoreDatabaseBackup(target, setProgress);
      await saveBatches([], job.createdBy);
      setProgress(100, 'Database restore completed');
      job.result = restoreResult;
    } else if (job.action === 'purge') {
      const protectedOrgIds = Array.isArray(job.payload?.protectedOrgIds)
        ? job.payload.protectedOrgIds.map((id: any) => String(id || '').trim()).filter(Boolean)
        : [];
      const orgIds = await resolveDemoOrgIdsForPurge(protectedOrgIds);
      setProgress(20, `Purging ${orgIds.length} demo organizations`);
      const purgeResult = await purgeDemoDataByOrgs(orgIds, job.createdBy, protectedOrgIds);
      await saveBatches([], job.createdBy);
      setProgress(100, 'Demo data purge completed');
      job.result = { purgeResult };
    } else {
      const config = clampConfig(job.config || {});

      if (job.action === 'reset') {
        const protectedOrgIds = Array.isArray(job.payload?.protectedOrgIds)
          ? job.payload.protectedOrgIds.map((id: any) => String(id || '').trim()).filter(Boolean)
          : [];
        const orgIds = await resolveDemoOrgIdsForPurge(protectedOrgIds);
        setProgress(15, `Reset requested: purging ${orgIds.length} existing demo organizations`);
        await purgeDemoDataByOrgs(orgIds, job.createdBy, protectedOrgIds);
        await saveBatches([], job.createdBy);
      }

      if (job.action === 'generate') {
        const appendDemoData = job.payload?.appendDemoData === true;
        if (!appendDemoData) {
          const protectedOrgIds = Array.isArray(job.payload?.protectedOrgIds)
            ? job.payload.protectedOrgIds.map((id: any) => String(id || '').trim()).filter(Boolean)
            : [];
          const orgIds = await resolveDemoOrgIdsForPurge(protectedOrgIds);
          setProgress(15, `Generate requested: purging ${orgIds.length} existing demo organizations to avoid seed duplicates`);
          await purgeDemoDataByOrgs(orgIds, job.createdBy, protectedOrgIds);
          await saveBatches([], job.createdBy);
        }
      }

      if (job.payload?.autoBackupBeforeGenerate !== false) {
        setProgress(20, 'Auto backup enabled: creating database backup before demo generation');
        const preBackup = await createDatabaseBackup(undefined, `pre_${job.action}`);
        job.result = {
          ...(job.result || {}),
          preBackup,
        };
      }

      setProgress(25, 'Generating demo dataset');
      const batchRecord = await generateOneBatch(job.id, config, job.createdBy, setProgress);
      const existing = await getBatches();
      await saveBatches([...existing, batchRecord], job.createdBy);
      setProgress(100, 'Demo dataset generation completed');
      job.result = {
        ...(job.result || {}),
        batchId: batchRecord.batchId,
        summary: batchRecord.summary,
        orgIds: batchRecord.orgIds,
        userIds: batchRecord.userIds,
      };
    }

    job.status = 'completed';
    job.finishedAt = nowIso();
  } catch (error: any) {
    job.status = 'failed';
    job.error = error?.message || 'Unexpected error while processing demo job';
    job.finishedAt = nowIso();
  } finally {
    jobs.set(job.id, { ...job });
    runningJobId = null;
  }
}

async function getTemplates(): Promise<DemoTemplateRecord[]> {
  const raw = await getSystemSettingValue(DEMO_TEMPLATE_SETTING_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: any) => ({
        name: String(item?.name || '').trim(),
        description: item?.description ? String(item.description) : undefined,
        config: clampConfig(item?.config || {}),
        createdAt: String(item?.createdAt || nowIso()),
        updatedAt: String(item?.updatedAt || nowIso()),
        createdBy: item?.createdBy ? String(item.createdBy) : undefined,
      }))
      .filter((item: DemoTemplateRecord) => !!item.name);
  } catch {
    return [];
  }
}

async function saveTemplates(templates: DemoTemplateRecord[], userId?: string) {
  const payload = JSON.stringify(
    templates.map((template) => ({
      ...template,
      config: clampConfig(template.config || {}),
    })),
  );

  const [existing] = await db
    .select({ id: schema.systemSettings.id })
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.settingKey, DEMO_TEMPLATE_SETTING_KEY))
    .limit(1);

  if (existing?.id) {
    await db
      .update(schema.systemSettings)
      .set({
        settingValue: payload,
        dataType: 'json',
        description: 'Saved demo generation templates',
        updatedBy: userId || null,
        updatedAt: new Date(),
      })
      .where(eq(schema.systemSettings.id, existing.id));
  } else {
    await db.insert(schema.systemSettings).values({
      settingKey: DEMO_TEMPLATE_SETTING_KEY,
      settingValue: payload,
      dataType: 'json',
      description: 'Saved demo generation templates',
      updatedBy: userId || null,
    });
  }
}

function buildGenerationPreview(input: Partial<DemoGeneratorConfig>) {
  const config = clampConfig(input || {});
  const modules = config.featureModules || {};
  const enabled = (key: string, fallback = true) =>
    (modules[key]?.enabled ?? fallback) === true;

  const usersPerOrg =
    Math.max(0, config.usersPerOrg.custSuper || 0) +
    Math.max(0, config.usersPerOrg.orgAdmin || 0) +
    Math.max(0, config.usersPerOrg.trainerTeamLead || 0) +
    Math.max(0, config.usersPerOrg.learner || 0);
  const organizations = config.orgCount;
  const courses = enabled('courses_lessons', true) ? organizations * config.courseCountPerOrg : 0;
  const lessons = enabled('courses_lessons', true) ? courses * 3 : 0;
  const users = enabled('users_roles', true) ? organizations * usersPerOrg : 0;
  const enrollments = enabled('enrollments_progress', true) ? Math.round(courses * Math.max(1, config.usersPerOrg.learner) * 0.65) : 0;
  const reviews = enabled('reviews_ratings', true) ? Math.round(enrollments * 0.2) : 0;
  const joinRequests = enabled('join_requests', true) ? Math.round(organizations * Math.max(6, Math.min(24, config.usersPerOrg.learner * 0.18))) : 0;
  const crossOrgAssignments = enabled('interorg_sharing', true) ? Math.max(0, (organizations - 1) * 3) : 0;

  const warnings: string[] = [];
  if (!enabled('courses_lessons', true) && enabled('enrollments_progress', true)) {
    warnings.push('`enrollments_progress` is enabled but `courses_lessons` is disabled; enrollments will be skipped.');
  }
  if (!enabled('enrollments_progress', true) && enabled('reviews_ratings', true)) {
    warnings.push('`reviews_ratings` works best with `enrollments_progress`; review volume may be low.');
  }
  if (config.activityWindowStart && config.activityWindowEnd) {
    const from = new Date(config.activityWindowStart);
    const to = new Date(config.activityWindowEnd);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from > to) {
      warnings.push('Activity window start is later than end; values will be auto-swapped.');
    }
  }

  const sampleNames = {
    organization: withNamingConvention(`${WORDS_A[0]} ${WORDS_B[0]}`, config),
    userEmail: makeEmail('student', `demo-${Date.now()}-preview`, 'sample-org', 0, 1, config),
    course: withNamingConvention(`${COURSE_TOPICS[0]} ${COURSE_VARIANTS[0]} for ${WORDS_A[0]} ${WORDS_B[0]}`, config),
  };

  return {
    config,
    estimated: {
      organizations,
      users,
      courses,
      lessons,
      enrollments,
      reviews,
      joinRequests,
      crossOrgAssignments,
    },
    warnings,
    sampleNames,
  };
}

export const DemoDataService = {
  getPolicy: resolveDemoPolicyAsync,

  async setPolicyOverride(mode: 'auto' | 'enabled' | 'disabled', actorUserId?: string) {
    await setDemoPolicyOverride(mode, actorUserId);
    return resolveDemoPolicyAsync();
  },

  async getOverview() {
    const policy = await resolveDemoPolicyAsync();
    const batches = await getBatches();
    const backups = await listDatabaseBackups(policy);
    const runningJob = runningJobId ? jobs.get(runningJobId) : null;
    const lastJobs = Array.from(jobs.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
    return {
      policy,
      runningJob,
      batches,
      backups,
      lastJobs,
      defaultConfig: clampConfig({}),
      defaults: {
        demoPassword: DEMO_DEFAULT_PASSWORD,
      },
      templates: await getTemplates(),
    };
  },

  getJob(jobId: string) {
    return jobs.get(jobId) || null;
  },

  async getBackups() {
    return listDatabaseBackups(await resolveDemoPolicyAsync());
  },

  async getTemplates() {
    return getTemplates();
  },

  async saveTemplate(name: string, config: any, actorUserId: string, description?: string) {
    const safeName = String(name || '').trim();
    if (!safeName) {
      throw new Error('Template name is required');
    }
    const templates = await getTemplates();
    const now = nowIso();
    const next: DemoTemplateRecord[] = templates.filter((t) => t.name !== safeName);
    const existing = templates.find((t) => t.name === safeName);
    next.push({
      name: safeName,
      description: description ? String(description).trim() : existing?.description,
      config: clampConfig(config || {}),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      createdBy: existing?.createdBy || actorUserId,
    });
    await saveTemplates(next, actorUserId);
    return next.sort((a, b) => a.name.localeCompare(b.name));
  },

  async deleteTemplate(name: string, actorUserId: string) {
    const safeName = String(name || '').trim();
    if (!safeName) {
      throw new Error('Template name is required');
    }
    const templates = await getTemplates();
    const next = templates.filter((t) => t.name !== safeName);
    await saveTemplates(next, actorUserId);
    return next.sort((a, b) => a.name.localeCompare(b.name));
  },

  getGenerationPreview(config: any) {
    return buildGenerationPreview(config || {});
  },

  async enqueue(action: DemoJobAction, actorUserId: string, config?: any) {
    if (runningJobId) {
      throw new Error('Another demo-data job is currently running. Please wait for it to finish.');
    }

    const id = `demo-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const job: DemoJob = {
      id,
      action,
      status: 'queued',
      createdBy: actorUserId,
      createdAt: nowIso(),
      progress: 0,
      message: 'Queued',
      config: action === 'generate' || action === 'reset' ? clampConfig(config || {}) : undefined,
      payload: config || {},
    };

    jobs.set(id, job);
    setImmediate(() => {
      runJob(job).catch((err) => {
        job.status = 'failed';
        job.error = err?.message || 'Job failed unexpectedly';
        job.finishedAt = nowIso();
        jobs.set(job.id, { ...job });
        runningJobId = null;
      });
    });

    return job;
  },
};
