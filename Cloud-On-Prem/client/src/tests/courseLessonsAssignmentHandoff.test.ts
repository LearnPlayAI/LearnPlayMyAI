import fs from 'fs';
import path from 'path';
import { describe, expect, it } from '@jest/globals';

describe('Course lessons assignment handoff', () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'client/src/pages/CourseLessons.tsx'),
    'utf8'
  );

  it('uses a stable helper when opening assignments from publish readiness', () => {
    expect(source).toContain('openAssignmentModalFromPublish');
    expect(source).toContain('data-testid="button-assign-to-departments"');
    expect(source).toContain('onClick={openAssignmentModalFromPublish}');
  });

  it('does not open the assignment modal in the same tick as closing publish dialog', () => {
    expect(source).toContain('pendingAssignmentModalOpen');
    expect(source).not.toContain('setPublishModalOpen(false);\n                                  setAssignmentModalOpen(true);');
  });
});
