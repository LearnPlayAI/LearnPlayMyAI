#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const APP_PATH = path.resolve(process.cwd(), 'client/src/App.tsx');
const BASELINE_PATH = path.resolve(process.cwd(), 'scripts/route-domain-parity-baseline.json');

const DISALLOWED_PATTERNS = [
  {
    id: 'primitive_state_override',
    description: 'Page-level Button/Badge/Alert color state overrides',
    regex: /<(Button|Badge|Alert)\b[^>]*className\s*=\s*(?:"[^"]*((hover|active|disabled|focus|data-\[state=active\]|data-\[state=inactive\]|aria-\[selected=true\]):(bg|text|border)-)[^"]*"|\{`[^`]*((hover|active|disabled|focus|data-\[state=active\]|data-\[state=inactive\]|aria-\[selected=true\]):(bg|text|border)-)[^`]*`\})/g,
  },
  {
    id: 'action_btn_raw_tokens',
    description: 'Direct raw action/button/link token class usage in page markup',
    regex: /className\s*=\s*(?:"[^"]*var\(--(?:action|btn|link|status|success|warning|destructive)-[^"]*"|\{`[^`]*var\(--(?:action|btn|link|status|success|warning|destructive)-[^`]*`\})/g,
  },
  {
    id: 'gradient_utilities',
    description: 'Residual gradient utility classes in user pages',
    regex: /className\s*=\s*(?:"[^"]*bg-gradient-to-[^"]*"|\{`[^`]*bg-gradient-to-[^`]*`\})/g,
  },
  {
    id: 'inline_visual_styles',
    description: 'Inline visual style properties (background/color/border/shadow/fill/stroke)',
    regex: /style=\{\{[^}]*\b(background|backgroundColor|color|border|borderColor|boxShadow|fill|stroke)\b[^}]*\}\}/g,
  },
];

const STRICT_ZERO_RULES = new Set([
  'primitive_state_override',
  'action_btn_raw_tokens',
  'gradient_utilities',
]);

function domainFromRoute(routePath) {
  if (/^\/(course-builder|lessons|quiz-wizard|quiz-drafts|quiz-card-manager|admin\/quiz-questions)/.test(routePath)) return 'course-builder';
  if (/^\/(browse-courses|browse|courses\/|my-courses|purchase-history|notifications)/.test(routePath)) return 'browse-courses';
  if (/^\/(theme-editor|custsuper\/interorg-config|admin\/integration-settings|admin\/system-changes|lesson-credits|admin\/platform-pricing|admin\/config|super-admin|superadmin\/|organization-analytics|reports|admin\/revenue-analytics)/.test(routePath)) return 'admin-platform';
  if (/^\/(quiz-lobby|quiz-single|quiz-1v1|game-lobby|game\/|play\/|single-player|multiplayer-1v1|leaderboard|quiz-leaderboard)/.test(routePath)) return 'game-quiz';
  if (/^\/(enterprise\/)/.test(routePath)) return 'enterprise';
  if (/^\/(login|register|forgot-password|reset-password|verify-email|org-registration|$|home)/.test(routePath)) return 'auth-home';
  return 'other';
}

function resolveImportMap(appText) {
  const importMap = new Map();
  const importRegex = /import\s+([A-Za-z0-9_]+)\s+from\s+["']@\/pages\/([^"']+)["'];/g;
  let m;
  while ((m = importRegex.exec(appText)) !== null) {
    importMap.set(m[1], path.resolve(process.cwd(), 'client/src/pages', `${m[2]}.tsx`));
    importMap.set(`${m[1]}:jsx`, path.resolve(process.cwd(), 'client/src/pages', `${m[2]}.jsx`));
  }
  return importMap;
}

function resolveComponentFile(componentName, importMap) {
  const tsxPath = importMap.get(componentName);
  if (tsxPath && fs.existsSync(tsxPath)) return tsxPath;
  const jsxPath = importMap.get(`${componentName}:jsx`);
  if (jsxPath && fs.existsSync(jsxPath)) return jsxPath;
  return null;
}

function parseRoutes(appText) {
  const routes = [];

  const selfClosing = /<Route\s+path="([^"]+)"\s+component=\{([A-Za-z0-9_]+)\}\s*\/>/g;
  let m;
  while ((m = selfClosing.exec(appText)) !== null) {
    routes.push({ path: m[1], component: m[2] });
  }

  const wrapped = /<Route\s+path="([^"]+)">\{[\s\S]*?<([A-Za-z0-9_]+)\s*\/>[\s\S]*?\}<\/Route>/g;
  while ((m = wrapped.exec(appText)) !== null) {
    routes.push({ path: m[1], component: m[2] });
  }

  return routes;
}

function analyzeFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const hits = {};
  for (const pattern of DISALLOWED_PATTERNS) {
    const matches = text.match(pattern.regex) || [];
    hits[pattern.id] = matches.length;
  }
  return hits;
}

function aggregateDomainFindings(routeFilesByDomain) {
  const result = {};
  for (const [domain, files] of Object.entries(routeFilesByDomain)) {
    const aggregate = Object.fromEntries(DISALLOWED_PATTERNS.map((p) => [p.id, 0]));
    for (const file of files) {
      const fileHits = analyzeFile(file);
      for (const key of Object.keys(aggregate)) aggregate[key] += fileHits[key] || 0;
    }
    result[domain] = aggregate;
  }
  return result;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}

function writeBaseline(findings) {
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(findings, null, 2)}\n`, 'utf8');
}

function totalFindingsForDomain(domainFindings) {
  return Object.values(domainFindings).reduce((sum, v) => sum + Number(v || 0), 0);
}

function main() {
  const writeMode = process.argv.includes('--write-baseline');
  const appText = fs.readFileSync(APP_PATH, 'utf8');
  const importMap = resolveImportMap(appText);
  const routes = parseRoutes(appText);

  const routeFilesByDomain = {};
  for (const route of routes) {
    const file = resolveComponentFile(route.component, importMap);
    if (!file) continue;
    if (file.includes('.backup')) continue;
    const domain = domainFromRoute(route.path);
    routeFilesByDomain[domain] ||= new Set();
    routeFilesByDomain[domain].add(file);
  }

  const normalized = Object.fromEntries(
    Object.entries(routeFilesByDomain).map(([k, set]) => [k, [...set].sort()]),
  );
  const findings = aggregateDomainFindings(normalized);

  if (writeMode) {
    writeBaseline(findings);
    console.log(`[route-domain-parity] baseline written: ${BASELINE_PATH}`);
    return;
  }

  const baseline = loadBaseline();
  if (!baseline) {
    console.error('[route-domain-parity] baseline missing. Run: node scripts/check-route-domain-primitive-parity.mjs --write-baseline');
    process.exit(1);
  }

  const failures = [];
  for (const [domain, domainFindings] of Object.entries(findings)) {
    const baselineDomain = baseline[domain] || {};
    for (const pattern of DISALLOWED_PATTERNS) {
      const current = Number(domainFindings[pattern.id] || 0);
      if (STRICT_ZERO_RULES.has(pattern.id)) {
        if (current > 0) {
          failures.push({
            domain,
            rule: pattern.id,
            current,
            base: 0,
            description: `${pattern.description} (strict-zero contract)`,
          });
        }
        continue;
      }
      const base = Number(baselineDomain[pattern.id] || 0);
      if (current > base) {
        failures.push({ domain, rule: pattern.id, current, base, description: pattern.description });
      }
    }
  }

  if (failures.length > 0) {
    console.error('[route-domain-parity] FAIL: parity regressions detected by domain');
    for (const f of failures) {
      console.error(`- ${f.domain}: ${f.rule} (${f.current} > baseline ${f.base}) :: ${f.description}`);
    }
    process.exit(1);
  }

  console.log('[route-domain-parity] passed');
  for (const [domain, vals] of Object.entries(findings)) {
    console.log(`  - ${domain}: total=${totalFindingsForDomain(vals)} ${JSON.stringify(vals)}`);
  }
}

main();
