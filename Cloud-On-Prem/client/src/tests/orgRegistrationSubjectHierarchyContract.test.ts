import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('education organization registration subject hierarchy contract', () => {
  const wizardSource = readFileSync(
    join(process.cwd(), 'client/src/pages/OrgRegistrationWizard.tsx'),
    'utf8'
  );
  const orgRoutesSource = readFileSync(
    join(process.cwd(), 'server/routes/orgRoutes.ts'),
    'utf8'
  );
  const hubSource = readFileSync(
    join(process.cwd(), 'client/src/pages/OrgManagementHub.tsx'),
    'utf8'
  );

  it('sends gradeSubjects using the numeric grade keys consumed by registration', () => {
    expect(orgRoutesSource).toContain('gradeSubjects?.[grade.toString()]');
    expect(wizardSource).toContain('const gradeKey = grade.toString()');
    expect(wizardSource).toContain("step3Form.watch('gradeSubjects')?.[grade.toString()]");
    expect(wizardSource).not.toContain('const gradeKey = `grade-${grade}`');
    expect(wizardSource).not.toContain("step3Form.watch('gradeSubjects')?.[`grade-${grade}`]");
  });

  it('returns and renders grade-level subjects in the central management hierarchy', () => {
    expect(orgRoutesSource).toContain('subjects: unitSubjectsByUnitId.get(unit.id) || []');
    expect(hubSource).toContain('interface HierarchySubject');
    expect(hubSource).toContain('node.subjects');
    expect(hubSource).toContain('{terminology.subjectPlural}');
    expect(hubSource).toContain('BookOpen');
  });
});
