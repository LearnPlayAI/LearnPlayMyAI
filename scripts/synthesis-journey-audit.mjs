import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const variant = String(process.env.VARIANT || 'cloud').toLowerCase();
const cdpUrl = process.env.CDP_URL || 'http://127.0.0.1:9222';
const now = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = process.env.ARTIFACT_DIR || `/antigravity/artifacts/synthesis-${variant}-${now}`;
fs.mkdirSync(artifactDir, { recursive: true });

const cfgByVariant = {
  cloud: {
    baseUrl: 'https://stcloud.learnplay.co.za',
    credentials: [
      { email: 'support@learnplay.co.za', password: 'LearnPlay!234' },
      { email: 'orgadmin-a@test.com', password: 'LearnPlay!234' },
      { email: 'superadmin@test.com', password: 'LearnPlay!234' },
    ],
  },
  onprem: {
    baseUrl: 'https://stonprem.learnplay.co.za',
    credentials: [
      { email: 'support@learnplay.co.za', password: 'LearnPlay!234' },
      { email: 'admin@learnplay.co.za', password: 'LearnPlay!234' },
      { email: 'onprem.orgadmin@test.com', password: 'LearnPlay!234' },
      { email: 'jan@learnplay.co.za', password: 'LearnPlay!234' },
    ],
  },
};

const cfg = cfgByVariant[variant];
if (!cfg) throw new Error(`Unsupported VARIANT=${variant}`);

const stop = new Set([
  'about','according','across','after','among','based','below','content','course','each','from','given','lesson','lessons','overview','summary','takeaway','takeaways','that','their','there','these','this','using','which','with','without','would','your','key','concepts','essential','terms','practical','applications','connections','title','description'
]);

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(s) {
  return Array.from(new Set(norm(s).split(' ').map(t => t.trim()).filter(t => t.length >= 5 && !stop.has(t))));
}

function lexicalCoverage(output, corpus) {
  const out = tokens(output);
  const src = new Set(tokens(corpus));
  if (!out.length) return { coverage: 0, missing: [] };
  const missing = out.filter(t => !src.has(t));
  return { coverage: Number(((out.length - missing.length) / out.length).toFixed(3)), missing: missing.slice(0, 20) };
}

async function shot(page, name) {
  const p = path.join(artifactDir, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  return p;
}

async function api(page, url, init = {}) {
  return await page.evaluate(async ({ url, init }) => {
    try {
      const response = await fetch(url, {
        credentials: 'include',
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init.headers || {}),
        },
      });
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      return { ok: false, status: 0, data: { error: String(error?.message || error) } };
    }
  }, { url, init });
}

async function getCourses(page) {
  const coursesResp = await api(page, '/api/courses');
  const payload = coursesResp.data;
  if (Array.isArray(payload)) return payload.filter((c) => c && c.id);
  if (Array.isArray(payload?.courses)) return payload.courses.filter((c) => c && c.id);
  if (Array.isArray(payload?.items)) return payload.items.filter((c) => c && c.id);
  if (Array.isArray(payload?.data)) return payload.data.filter((c) => c && c.id);
  return [];
}

async function getReadiness(page, courseId) {
  const readinessResp = await api(page, `/api/courses/${courseId}/generation-readiness`);
  return readinessResp.data || {};
}

async function prepareCourseForSynthesis(page, courseId, organizationId) {
  const prepLog = [];
  let readiness = await getReadiness(page, courseId);
  prepLog.push({ action: 'readiness-initial', readiness });
  if (readiness?.takeaways?.ready && readiness?.overview?.ready) {
    return { prepared: true, readiness, prepLog };
  }

  const contentLessons = Array.isArray(readiness?.takeaways?.lessons) ? readiness.takeaways.lessons : [];
  for (const lesson of contentLessons) {
    if (!lesson?.lessonId) continue;
    if (!lesson.hasDigest) {
      const digest = await api(page, `/api/lessons/${lesson.lessonId}/digest/regenerate`, { method: 'POST' });
      prepLog.push({ action: 'digest-content', lessonId: lesson.lessonId, status: digest.status, ok: digest.ok });
    }
  }

  readiness = await getReadiness(page, courseId);
  prepLog.push({ action: 'readiness-after-content-digest', readiness });

  if (readiness?.takeaways?.ready && readiness?.takeaways?.lessonId) {
    const genTakeaways = await api(page, `/api/courses/${courseId}/generate-takeaways`, {
      method: 'POST',
      body: JSON.stringify({ organizationId }),
    });
    prepLog.push({ action: 'generate-takeaways-prep', status: genTakeaways.status, ok: genTakeaways.ok, data: genTakeaways.data });
  }

  readiness = await getReadiness(page, courseId);
  prepLog.push({ action: 'readiness-after-takeaways-gen', readiness });
  const overviewLessons = Array.isArray(readiness?.overview?.lessons) ? readiness.overview.lessons : [];
  const keyRow = overviewLessons.find((l) => String(l?.lessonType || '').toLowerCase() === 'key_takeaways');
  if (keyRow?.lessonId && !keyRow.hasDigest) {
    const digest = await api(page, `/api/lessons/${keyRow.lessonId}/digest/regenerate`, { method: 'POST' });
    prepLog.push({ action: 'digest-takeaways', lessonId: keyRow.lessonId, status: digest.status, ok: digest.ok });
  }

  readiness = await getReadiness(page, courseId);
  prepLog.push({ action: 'readiness-final', readiness });
  return { prepared: !!(readiness?.takeaways?.ready && readiness?.overview?.ready), readiness, prepLog };
}

async function login(page, baseUrl, cred) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(600);

  const emailSel = [
    '[data-testid="input-email"]',
    'input[name="email"]',
    'input[type="email"]',
  ];
  const passSel = [
    '[data-testid="input-password"]',
    'input[name="password"]',
    'input[type="password"]',
  ];

  let emailFilled = false;
  for (const sel of emailSel) {
    const el = page.locator(sel).first();
    if (await el.count()) {
      await el.fill(cred.email);
      emailFilled = true;
      break;
    }
  }

  let passFilled = false;
  for (const sel of passSel) {
    const el = page.locator(sel).first();
    if (await el.count()) {
      await el.fill(cred.password);
      passFilled = true;
      break;
    }
  }

  if (!emailFilled || !passFilled) return { ok: false, reason: 'Login fields not found' };

  const loginBtn = page.locator('[data-testid="button-login"], button[type="submit"]').first();
  if (!(await loginBtn.count())) return { ok: false, reason: 'Login button not found' };

  await loginBtn.click();
  await page.waitForTimeout(2500);

  const url = page.url();
  const invalid = await page.locator('text=/invalid|incorrect|failed/i').count();
  if (invalid > 0 || url.includes('/login')) return { ok: false, reason: `login failed url=${url}` };
  return { ok: true, url };
}

function normalizeCourses(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.courses)) return payload.courses;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

(async () => {
  const report = {
    variant,
    baseUrl: cfg.baseUrl,
    artifactDir,
    loginAccount: null,
    selectedCourse: null,
    stages: [],
    findings: [],
    pass: false,
    metrics: {},
    screenshots: [],
  };

  const browser = await chromium.connectOverCDP(cdpUrl);
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();

  try {
    report.screenshots.push(await shot(page, `${variant}-login-before`));

    let loggedIn = false;
    for (const cred of cfg.credentials) {
      const result = await login(page, cfg.baseUrl, cred);
      report.stages.push({ stage: 'login-attempt', email: cred.email, result });
      if (result.ok) {
        report.loginAccount = cred.email;
        loggedIn = true;
        break;
      }
      await context.clearCookies();
    }

    if (!loggedIn) {
      report.findings.push({ severity: 'blocker', stage: 'auth', issue: 'Could not authenticate with provided bootstrap/test credentials.' });
      return;
    }

    const me = await api(page, '/api/auth/user');
    report.metrics.user = me.data || null;

    const courses = await getCourses(page);
    if (!courses.length) {
      report.findings.push({ severity: 'blocker', stage: 'entry', issue: 'No accessible courses found for authenticated user.' });
      return;
    }

    let selected = null;
    for (const course of courses.slice(0, 40)) {
      const readinessResp = await api(page, `/api/courses/${course.id}/generation-readiness`);
      const readiness = readinessResp.data || {};
      if (
        readiness?.takeaways?.lessonId &&
        readiness?.overview?.lessonId &&
        Number(readiness?.takeaways?.totalContent || 0) > 0
      ) {
        selected = { course, readiness };
        break;
      }
    }

    if (!selected) {
      const detailsProbe = await api(page, `/api/courses/${courses[0].id}`);
      const orgIdProbe = detailsProbe.data?.organizationId || me.data?.organizationId || null;
      for (const course of courses.slice(0, 12)) {
        const prepared = await prepareCourseForSynthesis(page, course.id, orgIdProbe);
        report.stages.push({ stage: 'prepare-course', courseId: course.id, title: course.title || null, prepared: prepared.prepared, prepLog: prepared.prepLog });
        if (
          prepared.readiness?.takeaways?.lessonId &&
          prepared.readiness?.overview?.lessonId &&
          Number(prepared.readiness?.takeaways?.totalContent || 0) > 0
        ) {
          selected = { course, readiness: prepared.readiness };
          break;
        }
      }
    }

    if (!selected) {
      report.findings.push({ severity: 'blocker', stage: 'core task', issue: 'No course with content lessons plus linked key takeaways and overview lessons found, even after deterministic prep.' });
      return;
    }

    const courseId = selected.course.id;
    report.selectedCourse = {
      id: courseId,
      title: selected.course.title || null,
      takeawaysLessonId: selected.readiness.takeaways.lessonId,
      overviewLessonId: selected.readiness.overview.lessonId,
    };

    await page.goto(`${cfg.baseUrl}/course-builder/${courseId}/lessons`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(2000);
    report.screenshots.push(await shot(page, `${variant}-course-lessons-before`));

    const detailsResp = await api(page, `/api/courses/${courseId}`);
    const orgId = detailsResp.data?.organizationId || me.data?.organizationId || null;
    report.metrics.organizationId = orgId;

    const frameworkResp = await api(page, `/api/courses/${courseId}/framework`);
    const topics = Array.isArray(frameworkResp.data?.topics) ? frameworkResp.data.topics : [];
    const contentTopics = topics.filter((t, i) => {
      const lt = String(t?.lessonType || '').toLowerCase();
      if (lt === 'overview' || lt === 'key_takeaways') return false;
      if (lt) return lt === 'content';
      if (i === 0) return false;
      if (i === topics.length - 1) return false;
      return true;
    }).filter(t => t.lessonId);

    if (!contentTopics.length) {
      report.findings.push({ severity: 'blocker', stage: 'core task', issue: 'Selected course has no content lesson IDs in framework.' });
      return;
    }

    const getLesson = async (lessonId) => {
      const q = orgId ? `?organizationId=${encodeURIComponent(String(orgId))}&courseId=${encodeURIComponent(courseId)}` : `?courseId=${encodeURIComponent(courseId)}`;
      return await api(page, `/api/lessons/${lessonId}${q}`);
    };

    const contentLessons = [];
    for (const t of contentTopics) {
      const lr = await getLesson(String(t.lessonId));
      if (lr.ok && lr.data) contentLessons.push(lr.data);
    }
    const contentCorpus = contentLessons.map(l => String(l.inputText || '')).join('\n\n---\n\n');

    const preTakeaways = await getLesson(String(selected.readiness.takeaways.lessonId));
    const preOverview = await getLesson(String(selected.readiness.overview.lessonId));

    const genTakeawaysResp = await api(page, `/api/courses/${courseId}/generate-takeaways`, {
      method: 'POST',
      body: JSON.stringify({ organizationId: orgId }),
    });
    report.stages.push({ stage: 'generate-takeaways', response: genTakeawaysResp });

    if (!genTakeawaysResp.ok) {
      report.findings.push({ severity: 'high', stage: 'core task', issue: 'Takeaways generation API failed', evidence: genTakeawaysResp });
      return;
    }

    await page.waitForTimeout(1200);
    const postTakeaways = await getLesson(String(selected.readiness.takeaways.lessonId));

    const takeText = String(postTakeaways.data?.inputText || '').trim();
    const takeDoc = !!postTakeaways.data?.sourceDocumentPath;
    const takeManifest = postTakeaways.data?.metadata?.lastTakeawaysGenerationManifest || null;
    const takeWords = takeText.split(/\s+/).filter(Boolean).length;
    const takeLex = lexicalCoverage(takeText, contentCorpus);

    if (!takeText || !takeDoc) {
      report.findings.push({ severity: 'high', stage: 'core task', issue: 'Takeaways generation missing source text or Word doc.', evidence: { hasText: !!takeText, hasDoc: takeDoc } });
    }
    if (takeWords < 220) {
      report.findings.push({ severity: 'high', stage: 'core task', issue: `Takeaways output too short (${takeWords} words).` });
    }
    for (const marker of ['key concepts', 'essential terms', 'practical applications', 'connections across lessons']) {
      if (!takeText.toLowerCase().includes(marker)) {
        report.findings.push({ severity: 'high', stage: 'core task', issue: `Takeaways output missing required section marker: ${marker}` });
      }
    }
    if (!takeManifest?.validation?.structure?.isValid || !takeManifest?.validation?.grounding?.isValid) {
      report.findings.push({ severity: 'high', stage: 'core task', issue: 'Takeaways manifest validation not valid.', evidence: takeManifest?.validation || null });
    }
    if (takeLex.coverage < 0.48) {
      report.findings.push({ severity: 'high', stage: 'core task', issue: `Takeaways lexical grounding too low (${takeLex.coverage}).`, evidence: takeLex });
    }

    const genOverviewResp = await api(page, `/api/courses/${courseId}/generate-overview`, {
      method: 'POST',
      body: JSON.stringify({ organizationId: orgId }),
    });
    report.stages.push({ stage: 'generate-overview', response: genOverviewResp });

    if (!genOverviewResp.ok) {
      report.findings.push({ severity: 'high', stage: 'core task', issue: 'Overview generation API failed', evidence: genOverviewResp });
      return;
    }

    await page.waitForTimeout(1200);
    const postOverview = await getLesson(String(selected.readiness.overview.lessonId));
    const overText = String(postOverview.data?.inputText || '').trim();
    const overDoc = !!postOverview.data?.sourceDocumentPath;
    const overManifest = postOverview.data?.metadata?.lastOverviewGenerationManifest || null;
    const overWords = overText.split(/\s+/).filter(Boolean).length;
    const overLex = lexicalCoverage(overText, `${contentCorpus}\n\n---\n\n${takeText}`);

    if (!overText || !overDoc) {
      report.findings.push({ severity: 'high', stage: 'core task', issue: 'Overview generation missing source text or Word doc.', evidence: { hasText: !!overText, hasDoc: overDoc } });
    }
    if (overWords < 140) {
      report.findings.push({ severity: 'high', stage: 'core task', issue: `Overview output too short (${overWords} words).` });
    }
    if (!overManifest?.keyTakeawaysSource?.hasContent) {
      report.findings.push({ severity: 'high', stage: 'core task', issue: 'Overview manifest indicates key takeaways content not included.', evidence: overManifest?.keyTakeawaysSource || null });
    }
    if (!overManifest?.validation?.structure?.isValid || !overManifest?.validation?.grounding?.isValid) {
      report.findings.push({ severity: 'high', stage: 'core task', issue: 'Overview manifest validation not valid.', evidence: overManifest?.validation || null });
    }
    if (overLex.coverage < 0.42) {
      report.findings.push({ severity: 'high', stage: 'core task', issue: `Overview lexical grounding too low (${overLex.coverage}).`, evidence: overLex });
    }

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(1500);
    report.screenshots.push(await shot(page, `${variant}-course-lessons-after`));

    report.metrics.takeaways = {
      words: takeWords,
      hasDoc: takeDoc,
      lexicalCoverage: takeLex.coverage,
      manifest: takeManifest?.validation || null,
      previousWords: String(preTakeaways.data?.inputText || '').trim().split(/\s+/).filter(Boolean).length,
    };
    report.metrics.overview = {
      words: overWords,
      hasDoc: overDoc,
      lexicalCoverage: overLex.coverage,
      manifest: overManifest?.validation || null,
      keyTakeawaysSource: overManifest?.keyTakeawaysSource || null,
      previousWords: String(preOverview.data?.inputText || '').trim().split(/\s+/).filter(Boolean).length,
    };

    report.pass = report.findings.length === 0;
  } catch (error) {
    report.findings.push({ severity: 'blocker', stage: 'runtime', issue: String(error?.message || error) });
  } finally {
    const outPath = path.join(artifactDir, `synthesis-audit-${variant}.json`);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ outPath, artifactDir, pass: report.pass, findings: report.findings.length, selectedCourse: report.selectedCourse, loginAccount: report.loginAccount }, null, 2));
    await context.close();
    await browser.close();
  }
})();
