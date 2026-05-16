import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

describe('Lesson panel mobile dialog layout contract', () => {
  const lessonViewerSource = fs.readFileSync(
    path.resolve(process.cwd(), 'client/src/pages/LessonViewer.tsx'),
    'utf8'
  );

  it('keeps the lesson panel list inside the modal width', () => {
    expect(lessonViewerSource).toContain('max-w-[94vw]');
    expect(lessonViewerSource).toContain('overflow-x-hidden');
    expect(lessonViewerSource).toContain('flex w-full min-w-0 items-center');
    expect(lessonViewerSource).toContain('whitespace-normal break-words');
  });
});
