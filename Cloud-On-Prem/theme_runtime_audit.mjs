import { firefox } from 'playwright';
import fs from 'fs';

const BASE = 'https://stonprem.learnplay.co.za';
const EMAIL = 'support@learnplay.co.za';
const PASSWORD = 'LiamAndrew@2018#!';
const outDir = '/antigravity/artifacts/theme-runtime-audit';
fs.mkdirSync(outDir, { recursive: true });

function slug(route) {
  return route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'home';
}

const contrastEval = `(() => {
  function parseColor(input) {
    if (!input) return null;
    const m = input.match(/rgba?\\(([^)]+)\\)/i);
    if (!m) return null;
    const parts = m[1].split(',').map(s => s.trim());
    if (parts.length < 3) return null;
    const to255 = (v) => v.endsWith('%') ? Math.round(parseFloat(v) * 2.55) : parseFloat(v);
    const r = to255(parts[0]);
    const g = to255(parts[1]);
    const b = to255(parts[2]);
    const a = parts[3] == null ? 1 : parseFloat(parts[3]);
    return { r, g, b, a: Number.isFinite(a) ? a : 1 };
  }

  function composite(fg, bg) {
    const a = fg.a + bg.a * (1 - fg.a);
    if (a <= 0) return { r: 255, g: 255, b: 255, a: 0 };
    return {
      r: Math.round((fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a),
      g: Math.round((fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a),
      b: Math.round((fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a),
      a,
    };
  }

  function luminance(c) {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }

  function ratio(c1, c2) {
    const l1 = luminance(c1);
    const l2 = luminance(c2);
    const hi = Math.max(l1, l2);
    const lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }

  function getEffectiveBackground(el) {
    let node = el;
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    let hops = 0;
    while (node && hops < 12) {
      const cs = window.getComputedStyle(node);
      const parsed = parseColor(cs.backgroundColor);
      if (parsed && parsed.a > 0) {
        bg = composite(parsed, bg);
        if (bg.a >= 0.98) break;
      }
      node = node.parentElement;
      hops += 1;
    }
    return bg;
  }

  const root = document.documentElement;
  const rootStyles = window.getComputedStyle(root);
  const rootTokens = {
    primary: rootStyles.getPropertyValue('--primary').trim(),
    primaryFg: rootStyles.getPropertyValue('--primary-foreground').trim(),
    secondary: rootStyles.getPropertyValue('--secondary').trim(),
    secondaryFg: rootStyles.getPropertyValue('--secondary-foreground').trim(),
    accent: rootStyles.getPropertyValue('--accent').trim(),
    accentFg: rootStyles.getPropertyValue('--accent-foreground').trim(),
    foreground: rootStyles.getPropertyValue('--foreground').trim(),
    background: rootStyles.getPropertyValue('--background').trim(),
    card: rootStyles.getPropertyValue('--card').trim(),
    cardFg: rootStyles.getPropertyValue('--card-foreground').trim(),
  };

  const nodes = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,button,a,label,td,th,li,div'));
  const findings = [];
  for (const el of nodes) {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length < 3) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const className = (el.className || '').toString();
    if (className.includes('text-transparent') && (className.includes('bg-clip-text') || className.includes('gradient-text'))) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) continue;
    const color = parseColor(cs.color);
    if (!color) continue;
    const bg = getEffectiveBackground(el);
    const cr = ratio(color, bg);
    if (cr < 4.5) {
      findings.push({
        text: text.slice(0, 80),
        ratio: Number(cr.toFixed(2)),
        color: cs.color,
        bg: 'rgba(' + bg.r + ', ' + bg.g + ', ' + bg.b + ', ' + bg.a.toFixed(2) + ')',
        className: (el.className || '').toString().slice(0, 140),
        tag: el.tagName.toLowerCase(),
      });
    }
  }

  findings.sort((a, b) => a.ratio - b.ratio);
  return {
    rootTokens,
    lowContrastCount: findings.length,
    worst: findings.slice(0, 20),
  };
})()`;

const routes = [
  '/theme-editor',
  '/management-hub',
  '/org-structure',
  '/course-builder',
  '/browse-courses',
  '/quiz-lobby'
];

const browser = await firefox.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

async function tryLogin() {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(1500);

  const emailSel = 'input[type="email"], input[name="email"], input[placeholder*="Email" i]';
  const passSel = 'input[type="password"], input[name="password"], input[placeholder*="Password" i]';

  const email = page.locator(emailSel).first();
  const pass = page.locator(passSel).first();
  if (await email.count()) await email.fill(EMAIL);
  if (await pass.count()) await pass.fill(PASSWORD);

  const submitCandidates = [
    'button[type="submit"]',
    'button:has-text("Sign in")',
    'button:has-text("Login")',
    'button:has-text("Log in")'
  ];
  let clicked = false;
  for (const sel of submitCandidates) {
    const btn = page.locator(sel).first();
    if (await btn.count()) {
      await btn.click();
      clicked = true;
      break;
    }
  }

  if (!clicked) await page.keyboard.press('Enter');
  await page.waitForTimeout(3500);
}

await tryLogin();

const report = [];
for (const route of routes) {
  const url = `${BASE}${route}`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(2200);

    const result = await page.evaluate(contrastEval);
    const file = `${outDir}/${slug(route)}.png`;
    await page.screenshot({ path: file, fullPage: true });

    report.push({ route, url, screenshot: file, ...result });
  } catch (error) {
    report.push({ route, url, error: String(error) });
  }
}

const outJson = `${outDir}/runtime-report.json`;
fs.writeFileSync(outJson, JSON.stringify(report, null, 2));
console.log(`WROTE ${outJson}`);
for (const entry of report) {
  if (entry.error) {
    console.log(`ERROR ${entry.route}: ${entry.error}`);
  } else {
    console.log(`${entry.route} lowContrast=${entry.lowContrastCount} screenshot=${entry.screenshot}`);
  }
}

await browser.close();
