import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('education organization terminology usage contract', () => {
  const joinRequestsSource = readFileSync(
    join(process.cwd(), 'client/src/pages/JoinRequests.tsx'),
    'utf8',
  );
  const gradesManagerSource = readFileSync(
    join(process.cwd(), 'client/src/pages/GradesManager.tsx'),
    'utf8',
  );
  const orgStructureSource = readFileSync(
    join(process.cwd(), 'client/src/pages/OrgStructureManager.tsx'),
    'utf8',
  );
  const unifiedManagementSource = readFileSync(
    join(process.cwd(), 'client/src/pages/UnifiedManagementHub.tsx'),
    'utf8',
  );

  it('uses central terminology helpers for subject labels in join request approval UI', () => {
    expect(joinRequestsSource).toContain('useOrganizationTerminology');
    expect(joinRequestsSource).toContain('terminology.subjectPlural');
    expect(joinRequestsSource).toContain('terminologyLower.subjectPlural');
    expect(joinRequestsSource).not.toContain('Requested Subjects');
    expect(joinRequestsSource).not.toContain('Subjects - Select which subjects to assign');
    expect(joinRequestsSource).not.toContain('No subjects selected');
  });

  it('uses central terminology helpers for grade-subject management wording', () => {
    expect(gradesManagerSource).toContain('useOrganizationTerminology');
    expect(gradesManagerSource).toContain('terminology!.subject');
    expect(gradesManagerSource).toContain('terminologyLower!.subject');
    expect(gradesManagerSource).not.toContain('Subject assigned to');
    expect(gradesManagerSource).not.toContain('Assign Subject');
    expect(gradesManagerSource).not.toContain('Create a new quiz collection for a subject');
  });

  it('uses central terminology helpers for structure assignment wording', () => {
    expect(orgStructureSource).toContain('useOrganizationTerminology');
    expect(orgStructureSource).toContain('terminology.subject');
    expect(orgStructureSource).toContain('terminologyLower.subject');
    expect(orgStructureSource).not.toContain('Select Subject (Optional)');
    expect(orgStructureSource).not.toContain('learnerPlural}/employees');
    expect(orgStructureSource).not.toContain("selectedOrgData?.type === 'education' ? 'Grade 10' : 'Engineering'");
    expect(orgStructureSource).not.toContain("selectedOrgData?.type === 'education' ? 'Class A' : 'Backend Team'");
  });

  it('uses central terminology helpers for unified management subject actions', () => {
    expect(unifiedManagementSource).toContain('useOrganizationTerminology');
    expect(unifiedManagementSource).toContain('terminologyResolved.subject');
    expect(unifiedManagementSource).toContain('terminologyLowerResolved.subject');
    expect(unifiedManagementSource).not.toContain('Are you sure you want to delete this subject?');
    expect(unifiedManagementSource).not.toContain("'Assign Subject'");
  });
});
