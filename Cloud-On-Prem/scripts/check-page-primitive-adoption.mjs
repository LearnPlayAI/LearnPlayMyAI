#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = 'client/src/pages';

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }

    if (/\.(tsx|jsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

const pages = walk(root);
const offenders = [];

for (const pagePath of pages) {
  const content = fs.readFileSync(pagePath, 'utf8');
  const hasJsx = /<[A-Za-z]/.test(content);
  if (!hasJsx) continue;

  const hasUiImport = /from\s+['\"]@\/components\/ui\//.test(content)
    || /from\s+['\"][\.\/]+.*components\/ui\//.test(content);

  const visualMarkupMatches = content.match(/className=|style=\{\{/g) || [];
  const visualMarkupCount = visualMarkupMatches.length;

  if (!hasUiImport && visualMarkupCount > 0) {
    offenders.push({ pagePath, visualMarkupCount });
  }
}

if (offenders.length > 0) {
  console.error('[primitive-adoption] pages with visual markup but no ui primitive imports:');
  for (const offender of offenders.sort((a, b) => b.visualMarkupCount - a.visualMarkupCount)) {
    console.error(`- ${offender.pagePath} (visual tokens: ${offender.visualMarkupCount})`);
  }
  process.exit(1);
}

console.log('[primitive-adoption] passed');
