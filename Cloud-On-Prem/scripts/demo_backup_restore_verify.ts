import { DemoDataService } from '/antigravity/Cloud-On-Prem/server/services/demoDataService.ts';
import { db } from '/antigravity/Cloud-On-Prem/server/db.ts';
import * as schema from '/antigravity/Cloud-On-Prem/shared/schema.ts';
import { and, eq, sql } from 'drizzle-orm';

type Mode = 'cloud' | 'onprem';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForJob(jobId: string) {
  const start = Date.now();
  while (Date.now() - start < 30 * 60 * 1000) {
    const job = DemoDataService.getJob(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    if (job.status === 'completed' || job.status === 'failed') return job;
    await sleep(1000);
  }
  throw new Error(`Timeout waiting for job ${jobId}`);
}

async function count(table: any, where?: any) {
  const rows = where
    ? await db.select({ c: sql<number>`count(*)::int` }).from(table).where(where)
    : await db.select({ c: sql<number>`count(*)::int` }).from(table);
  return rows[0]?.c ?? 0;
}

async function captureKeyMetrics() {
  return {
    demoOrgs: await count(schema.organizations, eq(schema.organizations.isDemo, true)),
    demoTaggedUsers: await count(schema.users, sql`${schema.users.email} like ${'%+demo-%@learnplay.demo.local'}`),
    demoCourses: await count(schema.courses, sql`${schema.courses.title} like ${'[DEMO%'}`),
    enrollments: await count(schema.userCourseEnrollments),
    lessonProgress: await count(schema.lessonProgress),
    quizProgress: await count(schema.userQuizProgress),
    reviews: await count(schema.courseReviews),
    ratings: await count(schema.courseRatings),
    creditOrders: await count(schema.creditOrders),
    purchases: await count(schema.coursePurchases),
    payouts: await count(schema.coursePayouts),
    rules: await count(schema.interOrgCourseAssignmentRules),
    notifications: await count(schema.userNotifications),
    certificates: await count(schema.certificates),
  };
}

async function runForMode(mode: Mode) {
  process.env.DEPLOYMENT_MODE = mode;
  process.env.ONPREM_MODE = mode === 'onprem' ? 'true' : 'false';
  process.env.LEARNPLAY_SYSTEM_TYPE = 'acc';
  process.env.SYSTEM_TYPE = 'acc';
  process.env.STAGE = 'acc';
  process.env.NODE_ENV = 'production';
  process.env.DEMO_DATA_ENABLED = 'true';

  const policy = DemoDataService.getPolicy();
  if (!policy.envAllowed) {
    throw new Error(`Policy blocked for mode ${mode}: ${JSON.stringify(policy)}`);
  }

  const baseline = await captureKeyMetrics();

  const backupJob = await DemoDataService.enqueue('backup', 'demo-test-runner', {});
  const backupDone = await waitForJob(backupJob.id);
  if (backupDone.status !== 'completed') {
    throw new Error(`Backup failed for ${mode}: ${backupDone.error}`);
  }
  const backupId = backupDone?.result?.backup?.id;
  if (!backupId) {
    throw new Error(`No backup id returned for ${mode}`);
  }

  const genJob = await DemoDataService.enqueue('generate', 'demo-test-runner', {
    orgCount: mode === 'onprem' ? 3 : 2,
    usersPerOrg: {
      custSuper: mode === 'onprem' ? 1 : 0,
      orgAdmin: 2,
      trainerTeamLead: 3,
      learner: 15,
    },
    departmentCount: 4,
    unitCountPerOrg: 6,
    teamCountPerOrg: 8,
    courseCountPerOrg: 8,
    includeMarketplaceSales: true,
    includeCreditPackPurchases: true,
    autoBackupBeforeGenerate: true,
  });
  const genDone = await waitForJob(genJob.id);
  if (genDone.status !== 'completed') {
    throw new Error(`Generate failed for ${mode}: ${genDone.error}`);
  }

  const afterGenerate = await captureKeyMetrics();

  const checks = {
    demoOrgsIncreased: afterGenerate.demoOrgs > baseline.demoOrgs,
    demoUsersIncreased: afterGenerate.demoTaggedUsers > baseline.demoTaggedUsers,
    demoCoursesIncreased: afterGenerate.demoCourses > baseline.demoCourses,
    enrollmentsIncreased: afterGenerate.enrollments > baseline.enrollments,
    progressIncreased: afterGenerate.lessonProgress > baseline.lessonProgress,
    quizProgressIncreased: afterGenerate.quizProgress > baseline.quizProgress,
    purchasesIncreased: afterGenerate.purchases > baseline.purchases,
    creditOrdersIncreased: afterGenerate.creditOrders > baseline.creditOrders,
    reviewsIncreased: afterGenerate.reviews >= baseline.reviews,
    ratingsIncreased: afterGenerate.ratings >= baseline.ratings,
    notificationsIncreased: afterGenerate.notifications >= baseline.notifications,
    certificatesIncreased: afterGenerate.certificates >= baseline.certificates,
    onpremRulesIncreased: mode === 'onprem' ? afterGenerate.rules >= baseline.rules : true,
  };

  const restoreJob = await DemoDataService.enqueue('restore', 'demo-test-runner', { backupId });
  const restoreDone = await waitForJob(restoreJob.id);
  if (restoreDone.status !== 'completed') {
    throw new Error(`Restore failed for ${mode}: ${restoreDone.error}`);
  }

  const afterRestore = await captureKeyMetrics();

  const restoredMatchesBaseline =
    JSON.stringify(afterRestore) === JSON.stringify(baseline);

  return {
    mode,
    policy,
    backupJobId: backupJob.id,
    generateJobId: genJob.id,
    restoreJobId: restoreJob.id,
    backupId,
    baseline,
    afterGenerate,
    checks,
    afterRestore,
    restoredMatchesBaseline,
  };
}

async function main() {
  const results = [];
  for (const mode of ['cloud', 'onprem'] as Mode[]) {
    results.push(await runForMode(mode));
  }
  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err?.message || String(err), stack: err?.stack }, null, 2));
  process.exit(1);
});
