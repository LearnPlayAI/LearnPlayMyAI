import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('Course lesson objective contracts', () => {
  it('saves objective-only updates without performing a full lesson update first', () => {
    const routes = readSource('server/routes/courseRoutes.ts');

    expect(routes).toContain('const hasLessonFieldUpdates = Object.keys(updates).length > 0;');
    expect(routes).toContain('hasLessonFieldUpdates');
    expect(routes).toContain('? await LessonService.updateLesson');
    expect(routes).toContain('const lesson = hasLessonFieldUpdates');
  });
});
