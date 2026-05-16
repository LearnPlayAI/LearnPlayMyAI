import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { buildQuickEditGroup } from '../components/brand-editor/tokenQuickEdit';

function readUIKitEditKeys(): string[] {
  const file = path.resolve(process.cwd(), 'client/src/components/brand-editor/previews/PreviewUIKit.tsx');
  const source = fs.readFileSync(file, 'utf8');
  const keys = Array.from(source.matchAll(/editKey=\"([^\"]+)\"/g)).map((match) => match[1]);
  return Array.from(new Set(keys)).sort();
}

function readBrandingTokens(): string[] {
  const file = path.resolve(process.cwd(), 'shared/brandingTokens.ts');
  const source = fs.readFileSync(file, 'utf8');
  return Array.from(new Set(Array.from(source.matchAll(/'(--[^']+)'/g)).map((match) => match[1]))).sort();
}

describe('UI Kit quick-edit coverage', () => {
  it('expands all non-typography UI Kit edit keys to multi-token granular groups', () => {
    const editKeys = readUIKitEditKeys();
    const available = Array.from(new Set([...readBrandingTokens(), ...editKeys]));
    const allowedSingle = new Set<string>(['--font-heading', '--font-body']);

    const failures: Array<{ key: string; size: number }> = [];
    for (const key of editKeys) {
      if (!key.startsWith('--')) continue;
      if (key.startsWith('--space-')) continue;
      const group = buildQuickEditGroup(key, available);
      if (allowedSingle.has(key)) continue;
      if (group.tokens.length <= 1) {
        failures.push({ key, size: group.tokens.length });
      }
    }

    expect(failures).toEqual([]);
  });
});
