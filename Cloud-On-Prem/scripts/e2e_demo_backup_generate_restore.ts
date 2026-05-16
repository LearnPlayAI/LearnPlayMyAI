import { DemoDataService } from '../server/services/demoDataService.ts';
import { db } from '../server/db.ts';
import * as schema from '../shared/schema.ts';
import { sql } from 'drizzle-orm';

type Mode = 'cloud' | 'onprem';

type Counts = Record<string, number>;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForJob(jobId: string) {
  const started = Date.now();
  while (Date.now() - started < 30 * 60 * 1000) {
    const job = DemoDataService.getJob(jobId);
    if (!job) throw new Error(`Job disappeared: ${jobId}`);
    if (job.status === 'completed' || job.status === 'failed') return job;
    await sleep(1000);
  }
  throw new Error(`Timeout waiting for job ${jobId}`);
}

async function c(query: any): Promise<number> {
  const rows = await db.execute(query);
  return Number((rows.rows?.[0] as any)?.c || 0);
}

async function collectCounts(): Promise<Counts> {
  return {
    organizations: await c(sql`select count(*)::int as c from organizations`),
    demoOrganizations: await c(sql`select count(*)::int as c from organizations where "isDemo" = true`),
    users: await c(sql`select count(*)::int as c from users`),
    demoUsers: await c(sql`select count(*)::int as c from users where email like '%+demo-%@learnplay.demo.local'`),
    courses: await c(sql`select count(*)::int as c from courses`),
    demoCourses: await c(sql`select count(*)::int as c from courses where title like '[DEMO] %'`),
    courseAssignments: await c(sql`select count(*)::int as c from "courseAssignments"`),
    enrollments: await c(sql`select count(*)::int as c from "userCourseEnrollments"`),
    courseProgress: await c(sql`select count(*)::int as c from "courseProgress"`),
    lessonProgress: await c(sql`select count(*)::int as c from "lessonProgress"`),
    quizProgress: await c(sql`select count(*)::int as c from "userQuizProgress"`),
    quizResults: await c(sql`select count(*)::int as c from "quizGameResults"`),
    reviews: await c(sql`select count(*)::int as c from "courseReviews"`),
    ratings: await c(sql`select count(*)::int as c from "courseRatings"`),
    purchases: await c(sql`select count(*)::int as c from "coursePurchases"`),
    refunds: await c(sql`select count(*)::int as c from "courseRefunds"`),
    creditOrders: await c(sql`select count(*)::int as c from "creditOrders"`),
    paymentIntents: await c(sql`select count(*)::int as c from "paymentIntents"`),
    certificates: await c(sql`select count(*)::int as c from certificates`),
    notifications: await c(sql`select count(*)::int as c from "userNotifications"`),
    interOrgRules: await c(sql`select count(*)::int as c from "interOrgCourseAssignmentRules"`),
  };
}

function assertIncreased(after: Counts, before: Counts, mode: Mode) {
  const mustIncrease = ['demoOrganizations', 'demoUsers', 'demoCourses', 'enrollments', 'lessonProgress', 'quizProgress', 'courseAssignments'];
  for (const k of mustIncrease) {
    if ((after[k] ?? 0) <= (before[k] ?? 0)) {
      throw new Error(`[${mode}] Expected ${k} to increase. before=${before[k]} after=${after[k]}`);
    }
  }

  if ((after.purchases ?? 0) <= (before.purchases ?? 0)) {
    throw new Error(`[${mode}] Expected purchases to increase.`);
  }
  if ((after.creditOrders ?? 0) <= (before.creditOrders ?? 0)) {
    throw new Error(`[${mode}] Expected creditOrders to increase.`);
  }
  if (mode === 'onprem' && (after.interOrgRules ?? 0) <= (before.interOrgRules ?? 0)) {
    throw new Error(`[${mode}] Expected interOrgRules to increase.`);
  }
}

function assertRestored(afterRestore: Counts, baseline: Counts, mode: Mode) {
  const keys = Object.keys(baseline);
  const diffs: string[] = [];
  for (const k of keys) {
    if ((afterRestore[k] ?? -1) !== (baseline[k] ?? -2)) {
      diffs.push(`${k}: baseline=${baseline[k]} restored=${afterRestore[k]}`);
    }
  }
  if (diffs.length) {
    throw new Error(`[${mode}] Restore mismatch:\n${diffs.join('\n')}`);
  }
}

async function runMode(mode: Mode) {
  process.env.NODE_ENV = 'production';
  process.env.DEPLOYMENT_MODE = mode;
  process.env.ONPREM_MODE = mode === 'onprem' ? 'true' : 'false';
  process.env.LEARNPLAY_SYSTEM_TYPE = 'acc';
  process.env.SYSTEM_TYPE = 'acc';
  process.env.STAGE = 'acc';

  const policyBefore = await DemoDataService.getPolicy();
  await DemoDataService.setPolicyOverride('auto');
  const policy = await DemoDataService.getPolicy();

  const baseline = await collectCounts();

  const backupJob = await DemoDataService.enqueue('backup', 'e2e-tester', {});
  const backupDone = await waitForJob(backupJob.id);
  if (backupDone.status !== 'completed') {
    throw new Error(`[${mode}] Backup failed: ${backupDone.error || 'unknown'}`);
  }
  const backupId = backupDone?.result?.backup?.id;
  if (!backupId) {
    throw new Error(`[${mode}] Backup completed without backupId`);
  }

  const generateJob = await DemoDataService.enqueue('generate', 'e2e-tester', {
    orgCount: mode === 'onprem' ? 3 : 2,
    randomOrgNames: true,
    usersPerOrg: {
      custSuper: mode === 'onprem' ? 1 : 0,
      orgAdmin: 2,
      trainerTeamLead: 3,
      learner: 20,
    },
    departmentCount: 4,
    randomDepartmentNames: true,
    unitCountPerOrg: 8,
    randomUnitNames: true,
    teamCountPerOrg: 10,
    randomTeamNames: true,
    courseCountPerOrg: 8,
    includeMarketplaceSales: true,
    includeCreditPackPurchases: true,
    autoBackupBeforeGenerate: true,
    seed: Date.now(),
  } as any);

  const generateDone = await waitForJob(generateJob.id);
  if (generateDone.status !== 'completed') {
    throw new Error(`[${mode}] Generate failed: ${generateDone.error || 'unknown'}`);
  }

  const afterGenerate = await collectCounts();
  assertIncreased(afterGenerate, baseline, mode);

  const restoreJob = await DemoDataService.enqueue('restore', 'e2e-tester', { backupId } as any);
  const restoreDone = await waitForJob(restoreJob.id);
  if (restoreDone.status !== 'completed') {
    throw new Error(`[${mode}] Restore failed: ${restoreDone.error || 'unknown'}`);
  }

  const afterRestore = await collectCounts();
  assertRestored(afterRestore, baseline, mode);

  return {
    mode,
    policyBefore,
    policy,
    backupJob: { id: backupDone.id, status: backupDone.status },
    generateJob: {
      id: generateDone.id,
      status: generateDone.status,
      result: generateDone.result,
    },
    restoreJob: { id: restoreDone.id, status: restoreDone.status },
    baseline,
    afterGenerate,
    afterRestore,
  };
}

async function main() {
  const out = [];
  out.push(await runMode('cloud'));
  out.push(await runMode('onprem'));
  console.log(JSON.stringify({ ok: true, runs: out }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err?.message || String(err), stack: err?.stack }, null, 2));
  process.exit(1);
});
