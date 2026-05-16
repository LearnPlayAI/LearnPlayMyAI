#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'client/src');
const TARGET_DIRS = [path.join(ROOT, 'pages'), path.join(ROOT, 'components')];
const EXTENSIONS = new Set(['.tsx', '.ts', '.jsx', '.js']);

const STRUCTURAL_BORDER_TOKENS = new Set([
  'border', 'border-0', 'border-2', 'border-4', 'border-8',
  'border-x', 'border-y', 'border-t', 'border-r', 'border-b', 'border-l'
]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!EXTENSIONS.has(path.extname(entry.name))) continue;
    if (full.includes('.backup')) continue;
    if (full.includes('/components/ui/')) continue;
    out.push(full);
  }
  return out;
}

function stripVariants(token) {
  const parts = token.split(':');
  return parts[parts.length - 1];
}

function isColorTextToken(core) {
  if (!core.startsWith('text-')) return false;
  if (/^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$/.test(core)) return false;
  if (/^text-\[length:.+\]$/.test(core)) return false;
  if (/^text-(left|right|center|justify|start|end)$/.test(core)) return false;
  const val = core.slice('text-'.length);
  return (
    val.includes('foreground') ||
    val.includes('primary') ||
    val.includes('secondary') ||
    val.includes('accent') ||
    val.includes('destructive') ||
    val.includes('warning') ||
    val.includes('success') ||
    val.includes('muted') ||
    val.includes('chart') ||
    val.includes('info') ||
    val.includes('white') ||
    val.includes('black') ||
    val.startsWith('[')
  );
}

function isColorBgToken(core) {
  if (!core.startsWith('bg-')) return false;
  if (core === 'bg-clip-text') return false;
  return true;
}

function isColorBorderToken(core) {
  if (!core.startsWith('border-') && core !== 'border') return false;
  if (STRUCTURAL_BORDER_TOKENS.has(core)) return false;
  return true;
}

function isColorOrStateColorToken(token) {
  const core = stripVariants(token);
  if (isColorBgToken(core)) return true;
  if (isColorBorderToken(core)) return true;
  if (isColorTextToken(core)) return true;
  return false;
}

function cleanClassList(classValue) {
  const tokens = classValue.split(/\s+/).filter(Boolean);
  const filtered = tokens.filter((token) => !isColorOrStateColorToken(token));
  return filtered.join(' ').trim();
}

function normalizePrimitiveClasses(content) {
  return content.replace(
    /<(Button|Badge|Alert)\b([\s\S]*?)>/g,
    (full, tag, attrs) => {
      const replacedAttrs = attrs.replace(/className="([^"]*)"/g, (_m, cls) => {
        const next = cleanClassList(cls);
        return next ? `className="${next}"` : '';
      }).replace(/\s{2,}/g, ' ');
      return `<${tag}${replacedAttrs}>`;
    }
  );
}

const files = TARGET_DIRS.flatMap((dir) => walk(dir));
let touched = 0;

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  const next = normalizePrimitiveClasses(original);
  if (next !== original) {
    fs.writeFileSync(file, next, 'utf8');
    touched += 1;
  }
}

console.log(`[normalize-primitive-overrides] touched files: ${touched}`);
