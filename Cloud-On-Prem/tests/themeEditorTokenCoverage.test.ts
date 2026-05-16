import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { generatePaletteTokens } from '../client/src/lib/themePaletteBuilder';

const ROOT = process.cwd();
const PREVIEWS_DIR = path.join(ROOT, 'client/src/components/brand-editor/previews');
const CONTROL_RAIL_PATH = path.join(ROOT, 'client/src/components/brand-editor/ControlRail.tsx');
const MAPPING_PATH = path.join(ROOT, 'shared/tokenSectionMapping.ts');
const COURSE_LESSONS_PATH = path.join(ROOT, 'client/src/pages/CourseLessons.tsx');
const PREVIEW_FRAME_PATH = path.join(ROOT, 'client/src/components/brand-editor/PreviewFrame.tsx');
const PREVIEW_TABS_PATH = path.join(ROOT, 'client/src/components/brand-editor/PreviewTabs.tsx');

function parseEditKeys(source: string): string[] {
  return [...new Set([...source.matchAll(/editKey="([^"]+)"/g)].map((match) => match[1]))];
}

function parseAllPreviewEditKeys(): string[] {
  const files = fs.readdirSync(PREVIEWS_DIR).filter((entry) => entry.endsWith('.tsx'));
  const all = new Set<string>();
  for (const file of files) {
    const source = fs.readFileSync(path.join(PREVIEWS_DIR, file), 'utf8');
    for (const key of parseEditKeys(source)) {
      all.add(key);
    }
  }
  return [...all];
}

function parseMappedKeys(source: string): Set<string> {
  return new Set([...source.matchAll(/'([^']+)':\s*'([^']+)'/g)].map((match) => match[1]));
}

function parseControlTokenKeys(source: string): Set<string> {
  return new Set([
    ...[...source.matchAll(/tokenKey="([^"]+)"/g)].map((match) => match[1]),
    ...[...source.matchAll(/tokenKey:\s*'(--[^']+)'/g)].map((match) => match[1]),
  ]);
}

describe('Theme Editor Token Coverage Contracts', () => {
  it('maps every preview clickable key to a section', () => {
    const mappingSource = fs.readFileSync(MAPPING_PATH, 'utf8');

    const editKeys = parseAllPreviewEditKeys();
    const mappedKeys = parseMappedKeys(mappingSource);
    const missing = editKeys.filter((key) => !mappedKeys.has(key));

    expect(missing).toEqual([]);
  });

  it('provides concrete control fields for all preview tokens except font selectors', () => {
    const controlSource = fs.readFileSync(CONTROL_RAIL_PATH, 'utf8');

    const editKeys = parseAllPreviewEditKeys();
    const controlTokenKeys = parseControlTokenKeys(controlSource);
    const allowedNonTokenControls = new Set(['--font-heading', '--font-body']);
    const missing = editKeys.filter(
      (key) =>
        key.startsWith('--') &&
        !controlTokenKeys.has(key) &&
        !allowedNonTokenControls.has(key)
    );

    expect(missing).toEqual([]);
  });

  it('generates granular primitive tokens from 3-color anchor palettes', () => {
    const generated = generatePaletteTokens({
      primaryHex: '#2563eb',
      secondaryHex: '#9333ea',
      accentHex: '#f59e0b',
      tone: 'dark',
      autoFix: true,
    });

    const requiredPrimitives = [
      '--btn-primary-bg',
      '--btn-primary-hover',
      '--btn-secondary-bg',
      '--btn-focus-ring',
      '--link-fg',
      '--link-hover-fg',
      '--nav-bg',
      '--nav-pill-active-bg',
      '--input-focus-border',
      '--filter-pill-disabled-bg',
      '--tab-indicator',
      '--card-hover-bg',
      '--toast-bg',
      '--email-header-bg',
      '--cert-accent',
      '--question-card-bg',
      '--answer-option-correct-bg',
      '--progress-bar-fill',
      '--admin-sidebar-bg',
      '--footer-link',
      '--lesson-artifact-source-db-bg',
      '--lesson-artifact-objectives-bg',
      '--lesson-artifact-digest-bg',
    ];

    for (const token of requiredPrimitives) {
      expect(generated[token]).toBeTruthy();
    }
  });

  it('uses dedicated lesson artifact badge tokens in course lessons page', () => {
    const source = fs.readFileSync(COURSE_LESSONS_PATH, 'utf8');
    expect(source.includes('var(--lesson-artifact-source-db-bg)')).toBe(true);
    expect(source.includes('var(--lesson-artifact-objectives-bg)')).toBe(true);
    expect(source.includes('var(--lesson-artifact-digest-bg)')).toBe(true);
  });

  it('supports quick editor open from preview clicks including page backgrounds', () => {
    const previewFrameSource = fs.readFileSync(PREVIEW_FRAME_PATH, 'utf8');
    const previewTabsSource = fs.readFileSync(PREVIEW_TABS_PATH, 'utf8');
    expect(previewFrameSource.includes("openQuickEdit('--background')")).toBe(true);
    expect(previewFrameSource.includes('preview-background-click-target')).toBe(true);
    expect(previewTabsSource.includes('QuickTokenEditorDialog')).toBe(true);
  });
});
