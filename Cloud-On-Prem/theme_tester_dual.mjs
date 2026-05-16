import { firefox } from 'playwright';
import fs from 'fs';

const EMAIL = 'support@learnplay.co.za';
const PASSWORD = 'LiamAndrew@2018#!';
const targets = [
  { variant: 'cloud', base: 'https://stcloud.learnplay.co.za' },
  { variant: 'onprem', base: 'https://stonprem.learnplay.co.za' },
];

const routes = [
  '/',
  '/theme-editor',
  '/management-hub',
  '/org-management',
  '/org-structure',
  '/course-builder',
  '/browse-courses',
  '/reports',
  '/super-admin',
];

const outRoot = '/antigravity/artifacts/theme-tester-firefox-2026-04-24';
fs.mkdirSync(outRoot, { recursive: true });

function slug(route) {
  return route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'home';
}

async function analyzePage(page) {
  return page.evaluate(() => {
    function parseColor(input) {
      if (!input) return null;
      const s = String(input).trim();
      if (!s) return null;
      if (s.startsWith('#')) {
        const hex = s.slice(1);
        if (hex.length === 3) {
          const r = parseInt(hex[0] + hex[0], 16);
          const g = parseInt(hex[1] + hex[1], 16);
          const b = parseInt(hex[2] + hex[2], 16);
          return { r, g, b, a: 1 };
        }
        if (hex.length === 6) {
          return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
            a: 1,
          };
        }
      }
      const rgb = s.match(/rgba?\(([^)]+)\)/i);
      if (rgb) {
        const parts = rgb[1].split(',').map((x) => x.trim());
        const to255 = (v) => v.endsWith('%') ? Math.round(parseFloat(v) * 2.55) : parseFloat(v);
        return {
          r: to255(parts[0]),
          g: to255(parts[1]),
          b: to255(parts[2]),
          a: parts[3] == null ? 1 : parseFloat(parts[3]),
        };
      }
      const hsl = s.match(/hsla?\(\s*([0-9.]+)(?:deg|rad|grad|turn)?(?:,|\s)\s*([0-9.]+)%\s*(?:,|\s)\s*([0-9.]+)%(?:\s*(?:\/|,)\s*([0-9.]+%?))?\s*\)/i);
      if (hsl) {
        let h = (((parseFloat(hsl[1]) % 360) + 360) % 360) / 360;
        const sat = Math.max(0, Math.min(1, parseFloat(hsl[2]) / 100));
        const light = Math.max(0, Math.min(1, parseFloat(hsl[3]) / 100));
        let a = 1;
        if (hsl[4] != null) {
          const raw = hsl[4].trim();
          a = raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw);
        }
        const hue2rgb = (p, q, t) => {
          let tt = t;
          if (tt < 0) tt += 1;
          if (tt > 1) tt -= 1;
          if (tt < 1/6) return p + (q - p) * 6 * tt;
          if (tt < 1/2) return q;
          if (tt < 2/3) return p + (q - p) * (2/3 - tt) * 6;
          return p;
        };
        let r, g, b;
        if (sat === 0) {
          r = g = b = light;
        } else {
          const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
          const p = 2 * light - q;
          r = hue2rgb(p, q, h + 1/3);
          g = hue2rgb(p, q, h);
          b = hue2rgb(p, q, h - 1/3);
        }
        return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255), a };
      }
      return null;
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

    function lum(c) {
      const f = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    }

    function ratio(c1, c2) {
      const l1 = lum(c1);
      const l2 = lum(c2);
      const hi = Math.max(l1, l2);
      const lo = Math.min(l1, l2);
      return (hi + 0.05) / (lo + 0.05);
    }

    function getBg(el) {
      let node = el;
      let bg = { r: 255, g: 255, b: 255, a: 1 };
      let hops = 0;
      while (node && hops < 14) {
        const cs = getComputedStyle(node);
        const c = parseColor(cs.backgroundColor);
        if (c && c.a > 0) {
          bg = composite(c, bg);
          if (bg.a >= 0.98) break;
        }
        node = node.parentElement;
        hops += 1;
      }
      return bg;
    }

    const rootStyles = getComputedStyle(document.documentElement);
    const pairs = [
      ['--primary-foreground', '--primary', 4.5],
      ['--secondary-foreground', '--secondary', 4.5],
      ['--accent-foreground', '--accent', 4.5],
      ['--admin-sidebar-active-fg', '--admin-sidebar-active-bg', 4.5],
      ['--sidebar-item-active-fg', '--sidebar-item-active-bg', 4.5],
      ['--filter-pill-active-fg', '--filter-pill-active-bg', 4.5],
      ['--btn-primary-fg', '--btn-primary-bg', 4.5],
      ['--btn-secondary-fg', '--btn-secondary-bg', 4.5],
    ];

    const pairFailures = [];
    for (const [fgKey, bgKey, min] of pairs) {
      const fgRaw = rootStyles.getPropertyValue(fgKey).trim();
      const bgRaw = rootStyles.getPropertyValue(bgKey).trim();
      const fg = parseColor(fgRaw);
      const bg = parseColor(bgRaw);
      if (!fg || !bg) continue;
      const cr = ratio(fg, bg);
      if (cr + 1e-6 < min) {
        pairFailures.push({ fgKey, bgKey, ratio: Number(cr.toFixed(2)), min, fgRaw, bgRaw });
      }
    }

    const nodes = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,button,a,label,td,th,li'));
    const low = [];
    for (const el of nodes) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.length < 3) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const className = (el.className || '').toString();
      // Ignore intentional gradient headline patterns.
      if (className.includes('text-transparent') && (className.includes('bg-clip-text') || className.includes('gradient-text'))) {
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;
      if (rect.bottom < -20 || rect.top > window.innerHeight + 220) continue;
      const fg = parseColor(cs.color);
      if (!fg) continue;
      const bg = getBg(el);
      const cr = ratio(fg, bg);
      if (cr < 4.5) {
        low.push({
          text: text.slice(0, 100),
          ratio: Number(cr.toFixed(2)),
          tag: el.tagName.toLowerCase(),
          color: cs.color,
          bg: 'rgba(' + bg.r + ', ' + bg.g + ', ' + bg.b + ', ' + bg.a.toFixed(2) + ')',
          className: (el.className || '').toString().slice(0, 160),
        });
      }
    }
    low.sort((a, b) => a.ratio - b.ratio);

    return {
      url: location.href,
      pairFailures,
      lowContrastCount: low.length,
      worstLowContrast: low.slice(0, 20),
    };
  });
}

async function login(page, base) {
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(1800);

  const emailInput = page.locator('input[type="email"], input[name="email"], input[autocomplete="email"]').first();
  const passInput = page.locator('input[type="password"], input[name="password"], input[autocomplete="current-password"]').first();

  if (await emailInput.count()) await emailInput.fill(EMAIL);
  if (await passInput.count()) await passInput.fill(PASSWORD);

  const submit = page.locator('button:has-text("Sign In"), button:has-text("Login"), button[type="submit"]').first();
  if (await submit.count()) {
    await submit.click();
  }

  await page.waitForTimeout(3800);
  return page.url();
}

async function ensureCloudImpersonation(page, base) {
  await page.goto(`${base}/superadmin/impersonate`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(1800);
  const orgCard = page.locator('[data-testid^="card-org-"]').first();
  if (await orgCard.count()) {
    await orgCard.click();
    await page.waitForTimeout(3200);
  }
}

const summary = [];

for (const target of targets) {
  const outDir = `${outRoot}/${target.variant}`;
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await firefox.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 920 } });
  const page = await context.newPage();

  const loginUrl = await login(page, target.base);
  if (target.variant === 'cloud') {
    await ensureCloudImpersonation(page, target.base);
  }
  const routeResults = [];

  for (const route of routes) {
    const url = `${target.base}${route}`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForTimeout(2200);
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(500);
      await page.mouse.wheel(0, -300);
      const analysis = await analyzePage(page);
      const shot = `${outDir}/${slug(route)}.png`;
      await page.screenshot({ path: shot, fullPage: true });
      routeResults.push({ route, requestedUrl: url, finalUrl: page.url(), screenshot: shot, ...analysis, status: 'ok' });
    } catch (error) {
      routeResults.push({
        route,
        requestedUrl: url,
        finalUrl: page.url(),
        status: 'error',
        error: String(error?.message || error),
      });
    }
  }

  const report = {
    variant: target.variant,
    base: target.base,
    loginFinalUrl: loginUrl,
    auditedAt: new Date().toISOString(),
    routes: routeResults,
  };

  const reportPath = `${outDir}/report.json`;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  summary.push({
    variant: target.variant,
    reportPath,
    loginFinalUrl: loginUrl,
    routeCount: routeResults.length,
    routeErrors: routeResults.filter((r) => r.status !== 'ok').length,
    pairFailures: routeResults.reduce((n, r) => n + (Array.isArray(r.pairFailures) ? r.pairFailures.length : 0), 0),
    lowContrastHits: routeResults.reduce((n, r) => n + (Number.isFinite(r.lowContrastCount) ? r.lowContrastCount : 0), 0),
  });

  await browser.close();
}

const summaryPath = `${outRoot}/summary.json`;
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
console.log(`WROTE ${summaryPath}`);
for (const row of summary) {
  console.log(`${row.variant} login=${row.loginFinalUrl} routes=${row.routeCount} errors=${row.routeErrors} pairFailures=${row.pairFailures} lowContrast=${row.lowContrastHits}`);
}
