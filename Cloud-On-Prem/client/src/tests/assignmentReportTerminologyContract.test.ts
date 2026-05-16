import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

describe('assignment and report terminology contract', () => {
  const readClientSource = (relativePath: string) =>
    fs.readFileSync(path.join(process.cwd(), 'client/src', relativePath), 'utf8');

  it('keeps course assignment completion copy terminology-driven', () => {
    const source = readClientSource('pages/CourseAssignments.tsx');

    expect(source).toContain('{terminology.learnerPlural} must complete this course');
    expect(source).not.toContain('Learners must complete this course');
  });

  it('keeps report score distribution tooltip terminology-driven', () => {
    const source = readClientSource('pages/Reports.tsx');

    expect(source).toContain('learnerPluralLower');
    expect(source).not.toContain('`${value} learners`');
  });
});
