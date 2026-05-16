import fs from 'fs';
import path from 'path';

const uiOnly = process.argv.includes('--ui-only');
const ROOT = uiOnly
  ? path.resolve(process.cwd(), 'client/src/components/ui')
  : path.resolve(process.cwd(), 'client/src');
const strict = process.argv.includes('--strict');
const writeBaseline = process.argv.includes('--write-baseline');
const baselinePathArg = process.argv.find((arg) => arg.startsWith('--baseline='))?.split('=')[1];
const baselinePath = path.resolve(
  process.cwd(),
  baselinePathArg || (uiOnly ? 'scripts/theme-architecture-ui-baseline.json' : 'scripts/theme-architecture-baseline.json')
);

const extensions = new Set(['.ts', '.tsx', '.js', '.jsx']);

const hardcodedClassColorPattern =
  /\b(?:bg|text|border|ring|fill|stroke)-(?:black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?\b/g;
const rawColorPattern = /\b(?:#[0-9a-fA-F]{3,8}|hsl[a]?\([^)]*\)|rgb[a]?\([^)]*\))\b/g;
const baseTokenPattern = /var\(--(?:primary|secondary|accent|background|foreground|card|muted|border|ring)\)/g;

type Finding = { file: string; line: number; type: 'hardcoded-class' | 'raw-color' | 'base-token'; value: string };

function walk(dir: string, out: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (extensions.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function shouldIgnore(file: string): boolean {
  if (uiOnly) return false;
  return (
    file.includes('/brand-editor/previews/') ||
    file.includes('/config/themePresets.ts') ||
    file.includes('/styles/') ||
    file.includes('/tests/')
  );
}

function collectFindings(file: string): Finding[] {
  if (shouldIgnore(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const findings: Finding[] = [];
  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    for (const match of line.matchAll(hardcodedClassColorPattern)) {
      findings.push({ file, line: lineNo, type: 'hardcoded-class', value: match[0] });
    }
    for (const match of line.matchAll(rawColorPattern)) {
      findings.push({ file, line: lineNo, type: 'raw-color', value: match[0] });
    }
    for (const match of line.matchAll(baseTokenPattern)) {
      findings.push({ file, line: lineNo, type: 'base-token', value: match[0] });
    }
  });
  return findings;
}

const files = walk(ROOT);
const findings = files.flatMap(collectFindings);

if (writeBaseline) {
  const baseline = {
    generatedAt: new Date().toISOString(),
    findings: findings
      .map((finding) => ({
        file: path.relative(process.cwd(), finding.file),
        line: finding.line,
        type: finding.type,
        value: finding.value,
      }))
      .sort((a, b) => `${a.type}|${a.file}|${a.line}|${a.value}`.localeCompare(`${b.type}|${b.file}|${b.line}|${b.value}`)),
  };
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));
  console.log(`[Theme Architecture Audit] Baseline written: ${baselinePath}`);
}

const grouped = findings.reduce<Record<string, Finding[]>>((acc, finding) => {
  if (!acc[finding.type]) acc[finding.type] = [];
  acc[finding.type].push(finding);
  return acc;
}, {});

console.log(`[Theme Architecture Audit] Scanned ${files.length} source files`);
console.log(`[Theme Architecture Audit] Findings: ${findings.length}`);
for (const type of ['hardcoded-class', 'raw-color', 'base-token'] as const) {
  const rows = grouped[type] || [];
  console.log(`- ${type}: ${rows.length}`);
}

const preview = findings.slice(0, 120);
for (const finding of preview) {
  console.log(`${finding.type}\t${path.relative(process.cwd(), finding.file)}:${finding.line}\t${finding.value}`);
}

if (findings.length > 120) {
  console.log(`[Theme Architecture Audit] ... ${findings.length - 120} additional findings omitted`);
}

if (strict && findings.length > 0) {
  let baselineFindings = new Set<string>();
  if (fs.existsSync(baselinePath)) {
    try {
      const baselineRaw = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      const baselineList = Array.isArray(baselineRaw?.findings) ? baselineRaw.findings : [];
      baselineFindings = new Set(
        baselineList.map((f: any) => `${f.type}|${f.file}|${f.line}|${f.value}`)
      );
    } catch (error) {
      console.error(`[Theme Architecture Audit] Failed to parse baseline: ${baselinePath}`, error);
      process.exit(1);
    }
  }

  const regressions = findings.filter((finding) => {
    const key = `${finding.type}|${path.relative(process.cwd(), finding.file)}|${finding.line}|${finding.value}`;
    return !baselineFindings.has(key);
  });

  if (regressions.length > 0) {
    console.error(`[Theme Architecture Audit] STRICT FAIL: ${regressions.length} new regression(s)`);
    for (const finding of regressions.slice(0, 200)) {
      console.error(
        `${finding.type}\t${path.relative(process.cwd(), finding.file)}:${finding.line}\t${finding.value}`
      );
    }
    process.exit(1);
  }

  console.log('[Theme Architecture Audit] STRICT PASS: no regressions beyond baseline');
}
