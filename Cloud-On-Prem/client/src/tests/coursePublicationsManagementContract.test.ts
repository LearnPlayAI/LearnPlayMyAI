import fs from 'fs';
import path from 'path';
import { describe, expect, it } from '@jest/globals';

const ROOT = process.cwd();

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('Course publications management contract', () => {
  it('links course-builder cards to the publications management page', () => {
    const source = readSource('client/src/pages/CourseBuilder.tsx');

    expect(source).toContain('Manage Publications');
    expect(source).toContain("source=builder");
    expect(source).toContain('data-testid={`action-manage-publications-${course.id}`}');
  });

  it('exposes publications and assignments in the admin sidebar', () => {
    const source = readSource('client/src/config/adminNavConfig.ts');

    expect(source).toContain("label: 'Publications & Assignments'");
    expect(source).toContain("description: 'Manage Publishing'");
    expect(source).toContain("breadcrumbLabel: 'Publications & Assignments'");
    expect(source).not.toContain("id: 'course-assignments',\n            label: 'Course Assignments'");
  });

  it('shows publications and assignments as separate management views', () => {
    const source = readSource('client/src/pages/CourseAssignments.tsx');

    expect(source).toContain('Publications & Assignments');
    expect(source).toContain('Published Courses');
    expect(source).toContain('Current Assignments');
    expect(source).toContain('data-testid="tab-publications"');
    expect(source).toContain('data-testid="tab-assignments"');
    expect(source).toContain('Delete Publication');
  });

  it('keeps unpublish separate from granular assignment deletion', () => {
    const page = readSource('client/src/pages/CourseAssignments.tsx');

    expect(page).toContain("apiRequest(`/api/courses/${course.id}/status`");
    expect(page).toContain("deleteAssignmentMutation.mutate(assignmentToDelete.id)");
    expect(page).toContain('Existing assignment rows remain available for granular cleanup.');
  });

  it('public publishing provisions the Public Organization Public department assignment', () => {
    const publicOrgService = readSource('server/services/publicOrganizationService.ts');
    const courseService = readSource('server/services/courseService.ts');
    const orgRoutes = readSource('server/routes/orgRoutes.ts');

    expect(publicOrgService).toContain('getOrCreatePublicDepartment');
    expect(publicOrgService).toContain("name: 'Public'");
    expect(courseService).toContain('ensurePublicOrganizationAssignment');
    expect(courseService).toContain("if (updated.visibility === 'public')");
    expect(courseService).toContain('targetOrganizationId: publicOrg.id');
    expect(orgRoutes).toContain("name: 'Public'");
    expect(orgRoutes).toContain("joinCode: `${orgJoinCode}_PUBLIC`");
  });
});
