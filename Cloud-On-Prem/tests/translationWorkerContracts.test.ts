import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('Translation worker artifact contracts', () => {
  it('stores Source DB translations as content versions without requiring PPTX storage keys', () => {
    const worker = readSource('server/workers/translationWorker.ts');

    expect(worker).toContain('createSourceDbTranslationVersion');
    expect(worker).toContain('schema.lessonContentVersions');
    expect(worker).not.toContain('changeDescription: `AI translated content to ${targetLanguageCode}`');
  });
});
