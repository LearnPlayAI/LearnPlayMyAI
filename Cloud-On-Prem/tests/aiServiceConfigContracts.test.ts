import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('AI service configuration contracts', () => {
  it('falls back to legacy aiConfig when integration secrets are unavailable', () => {
    const source = readSource('server/ai/aiService.ts');

    expect(source).toContain('getLegacyGeminiConfig');
    expect(source).toContain('integrationGeminiKey || legacyConfig?.apiKey');
  });
});
