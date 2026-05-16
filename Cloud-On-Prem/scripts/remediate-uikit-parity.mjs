#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'client/src');
const TARGET_DIRS = [path.join(ROOT, 'pages'), path.join(ROOT, 'components')];
const EXTENSIONS = new Set(['.tsx', '.ts', '.jsx', '.js']);
const EXCLUDED_SEGMENTS = new Set(['brand-editor/previews']);

function shouldSkip(filePath) {
  const rel = filePath.replaceAll('\\\\', '/');
  if (rel.includes('.backup')) return true;
  for (const segment of EXCLUDED_SEGMENTS) {
    if (rel.includes(segment)) return true;
  }
  return false;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!EXTENSIONS.has(path.extname(entry.name))) continue;
    if (shouldSkip(full)) continue;
    out.push(full);
  }
  return out;
}

const rules = [
  {
    name: 'text-gradient-to-text-primary',
    pattern: /bg-gradient-to-[a-z]+\s+from-[^\s"'`]+(?:\s+via-[^\s"'`]+)?\s+to-[^\s"'`]+\s+bg-clip-text\s+text-transparent/g,
    replace: 'text-[var(--text-primary)]',
  },
  {
    name: 'generic-gradient-with-stops-to-solid-first-stop',
    pattern: /bg-gradient-to-[a-z]+\s+from-([^\s"'`]+)(?:\s+via-[^\s"'`]+)?\s+to-[^\s"'`]+/g,
    replace: 'bg-$1',
  },
  {
    name: 'overlay-black-gradient-to-surface-overlay',
    pattern: /bg-gradient-to-[tb]\s+from-black(?:\/[0-9.]+)?(?:\s+via-black(?:\/[0-9.]+)?)?\s+to-transparent/g,
    replace: 'bg-[var(--surface-overlay)]',
  },
  {
    name: 'remove-orphan-gradient-direction-token',
    pattern: /bg-gradient-to-[a-z]+/g,
    replace: '',
  },
  {
    name: 'remove-orphan-from-stop-token',
    pattern: /\s+(?:hover:|active:|group-hover:)?from-[^\s"'`]+/g,
    replace: '',
  },
  {
    name: 'remove-orphan-via-stop-token',
    pattern: /\s+(?:hover:|active:|group-hover:)?via-[^\s"'`]+/g,
    replace: '',
  },
  {
    name: 'remove-orphan-to-stop-token',
    pattern: /\s+(?:hover:|active:|group-hover:)?to-[^\s"'`]+/g,
    replace: '',
  },
  {
    name: 'primary-gradient-br-to-surface-base',
    pattern: /bg-gradient-to-br\s+from-primary(?:\/[0-9.]+)?(?:\s+via-primary(?:\/[0-9.]+)?)?\s+to-secondary(?:\/[0-9.]+)?/g,
    replace: 'bg-surface-base',
  },
  {
    name: 'primary-gradient-r-to-btn-primary',
    pattern: /bg-gradient-to-r\s+from-primary(?:\/[0-9.]+)?(?:\s+via-secondary(?:\/[0-9.]+)?)?\s+to-primary(?:\/[0-9.]+)?/g,
    replace: 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-fg)] hover:bg-[var(--btn-primary-hover)]',
  },
  {
    name: 'primary-gradient-r-to-btn-secondary',
    pattern: /bg-gradient-to-r\s+from-primary(?:\/[0-9.]+)?(?:\s+via-secondary(?:\/[0-9.]+)?)?\s+to-secondary(?:\/[0-9.]+)?/g,
    replace: 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-fg)] hover:bg-[var(--btn-primary-hover)]',
  },
  {
    name: 'shell-action-gradient-to-surface-base',
    pattern: /bg-gradient-to-br\s+from-\[var\(--action-primary\)\]\s+via-\[var\(--action-primary\)\]\/90\s+to-\[var\(--action-secondary\)\]/g,
    replace: 'bg-surface-base',
  },
  {
    name: 'action-br-gradient-to-surface-raised',
    pattern: /bg-gradient-to-br\s+from-\[var\(--action-[^)]+\)\](?:\/[0-9.]+)?\s+to-\[var\(--action-[^)]+\)\](?:\/[0-9.]+)?/g,
    replace: 'bg-surface-raised',
  },
  {
    name: 'action-r-gradient-to-btn-primary',
    pattern: /bg-gradient-to-r\s+from-\[var\(--action-[^)]+\)\](?:\/[0-9.]+)?(?:\s+via-\[var\(--action-[^)]+\)\](?:\/[0-9.]+)?)?\s+to-\[var\(--action-[^)]+\)\](?:\/[0-9.]+)?/g,
    replace: 'bg-[var(--btn-primary-bg)]',
  },
  {
    name: 'action-hover-gradient-from-remove',
    pattern: /\s+hover:from-\[var\(--action-[^)]+\)\](?:\/[0-9.]+)?/g,
    replace: '',
  },
  {
    name: 'action-hover-gradient-to-remove',
    pattern: /\s+hover:to-\[var\(--action-[^)]+\)\](?:\/[0-9.]+)?/g,
    replace: '',
  },
  {
    name: 'primary-hover-gradient-from-remove',
    pattern: /\s+hover:from-primary(?:\/[0-9.]+)?/g,
    replace: '',
  },
  {
    name: 'primary-hover-gradient-via-remove',
    pattern: /\s+hover:via-secondary(?:\/[0-9.]+)?/g,
    replace: '',
  },
  {
    name: 'primary-hover-gradient-to-remove',
    pattern: /\s+hover:to-(?:primary|secondary)(?:\/[0-9.]+)?/g,
    replace: '',
  },
  {
    name: 'btn-primary-bg-hover-token',
    pattern: /bg-\[var\(--btn-primary-bg\)\](?![^\"]*hover:bg-\[var\(--btn-primary-hover\)\])/g,
    replace: 'bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)]',
  },
  {
    name: 'soft-primary-border-to-default-border',
    pattern: /border-primary\/(?:10|20|30|40|50)/g,
    replace: 'border-border',
  },
  {
    name: 'text-white-to-text-primary',
    pattern: /text-white/g,
    replace: 'text-[var(--text-primary)]',
  },
  {
    name: 'text-black-to-text-primary',
    pattern: /text-black/g,
    replace: 'text-[var(--text-primary)]',
  },
];

const files = TARGET_DIRS.flatMap((dir) => walk(dir));
let touched = 0;
let totalReplacements = 0;

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  let next = original;
  let fileReplacements = 0;

  for (const rule of rules) {
    const before = next;
    next = next.replace(rule.pattern, rule.replace);
    if (next !== before) {
      const delta = (before.length - next.length);
      fileReplacements += delta === 0 ? 1 : Math.abs(delta);
    }
  }

  if (next !== original) {
    fs.writeFileSync(file, next, 'utf8');
    touched += 1;
    totalReplacements += fileReplacements;
  }
}

console.log(`[uikit-parity-remediate] touched files: ${touched}`);
console.log(`[uikit-parity-remediate] replacement score: ${totalReplacements}`);
