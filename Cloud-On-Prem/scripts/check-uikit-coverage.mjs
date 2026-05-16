#!/usr/bin/env node

import fs from 'node:fs';
import cp from 'node:child_process';

const PREVIEW_PATH = 'client/src/components/brand-editor/previews/PreviewUIKit.tsx';
const previewText = fs.readFileSync(PREVIEW_PATH, 'utf8').toLowerCase();

const COVERAGE_MARKERS = {
  'accordion': ['accordion'],
  'alert': ['alerts & toasts', 'alert variants'],
  'alert-dialog': ['confirmation dialog', 'modals & dialogs'],
  'avatar': ['avatar components'],
  'avatarupload': ['avatarupload'],
  'badge': ['chips & badges'],
  'breadcrumb': ['breadcrumbs'],
  'button': ['buttons'],
  'calendar': ['calendar'],
  'card': ['cards'],
  'checkbox': ['checkbox & radio'],
  'collectionmodal': ['collectionmodal'],
  'collapsible': ['collapsible'],
  'collapsible-section': ['collapsible'],
  'command': ['command palette'],
  'context-menu': ['context menu'],
  'countryselector': ['country selector'],
  'dialog': ['modals & dialogs', 'modal preview'],
  'drawer': ['sheet / drawer preview'],
  'dropdown-menu': ['dropdown menu'],
  'filter-chips': ['filter chips'],
  'form': ['form elements'],
  'inlineleaderboard': ['inlineleaderboard'],
  'input': ['input fields'],
  'label': ['form elements'],
  'loading-skeleton': ['skeleton states'],
  'pagination': ['pagination'],
  'playeravatar': ['player avatar'],
  'popover': ['popover'],
  'progress': ['progress & loading'],
  'radio-group': ['checkbox & radio'],
  'resizable': ['resizable panels'],
  'responsive-table': ['responsive tables'],
  'scroll-area': ['scroll area'],
  'select': ['select dropdown'],
  'separator': ['separator'],
  'sheet': ['sheet / drawer preview'],
  'skeleton': ['skeleton states'],
  'slider': ['slider'],
  'stats-grid': ['stat card'],
  'switch': ['switch / toggle'],
  'table': ['responsive tables'],
  'tabs': ['tabs & navigation'],
  'textarea': ['textarea'],
  'toast': ['alerts & toasts', 'toast notifications'],
  'toaster': ['toast host (toaster)'],
  'toggle': ['toggle active'],
  'tooltip': ['tooltip examples'],
};

const toKey = (name) => name.toLowerCase().replace(/[^a-z0-9-]/g, '');

const uiFiles = fs
  .readdirSync('client/src/components/ui')
  .filter((file) => /\.(tsx|jsx)$/.test(file))
  .map((file) => file.replace(/\.(tsx|jsx)$/, ''));

const usageCounts = new Map();

for (const stem of uiFiles) {
  const query = `components/ui/${stem}`;
  const cmd = `rg -n "${query}" client/src --glob '!${PREVIEW_PATH}'`;
  let output = '';

  try {
    output = cp.execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    output = error.stdout || '';
  }

  const count = output.trim() ? output.trim().split('\n').length : 0;
  if (count > 0) {
    usageCounts.set(stem, count);
  }
}

const missing = [];
for (const [stem, count] of usageCounts.entries()) {
  const key = toKey(stem);
  const markers = COVERAGE_MARKERS[key] || COVERAGE_MARKERS[stem] || [];
  const covered = markers.some((marker) => previewText.includes(marker.toLowerCase()));

  if (!covered) {
    missing.push({ stem, count, markers });
  }
}

if (missing.length > 0) {
  console.error('[uikit-coverage] missing UI Kit coverage for used primitives:');
  for (const entry of missing.sort((a, b) => b.count - a.count)) {
    console.error(`- ${entry.stem} (uses: ${entry.count}) markers: ${entry.markers.join(', ') || 'none'}`);
  }
  process.exit(1);
}

console.log(`[uikit-coverage] passed (${usageCounts.size} used primitives mapped to UI Kit)`);
