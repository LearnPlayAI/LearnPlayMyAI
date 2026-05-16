import { describe, expect, it } from '@jest/globals';
import { filterNavigationByRole } from '../config/adminNavConfig';

function collectPaths(filtered: ReturnType<typeof filterNavigationByRole>): Set<string> {
  const paths = new Set<string>();
  filtered.sections.forEach((section) => {
    section.groups.forEach((group) => {
      group.items.forEach((item) => paths.add(item.path));
    });
  });
  filtered.accountItems.forEach((item) => paths.add(item.path));
  return paths;
}

describe('Admin navigation access contract', () => {
  it('keeps cloud superadmin in platform mode when not impersonating', () => {
    const filtered = filterNavigationByRole(
      true,  // isSuperAdmin
      false, // isOrgAdmin
      false, // isTeacher
      null,  // organizationType
      undefined,
      false, // isImpersonating
      false, // effectiveOrgAdmin
      false, // isDemo
      false, // isCustSuper
      false  // onpremMode
    );

    const paths = collectPaths(filtered);
    expect(paths.has('/super-admin')).toBe(true);
    expect(paths.has('/theme-editor')).toBe(true);

    expect(paths.has('/org-management')).toBe(false);
    expect(paths.has('/org-structure')).toBe(false);
    expect(paths.has('/user-management')).toBe(false);
    expect(paths.has('/course-builder')).toBe(false);
    expect(paths.has('/course-assignments')).toBe(false); // org-mode nav only
    expect(paths.has('/management-hub')).toBe(false); // hidden nav item by design
    expect(paths.has('/admin/sales-dashboard')).toBe(false);
  });

  it('switches cloud superadmin to org mode during impersonation', () => {
    const filtered = filterNavigationByRole(
      true,  // isSuperAdmin
      false, // isOrgAdmin
      false, // isTeacher
      'business',
      undefined,
      true,  // isImpersonating
      true,  // effectiveOrgAdmin
      false, // isDemo
      false, // isCustSuper
      false  // onpremMode
    );

    const paths = collectPaths(filtered);
    expect(paths.has('/super-admin')).toBe(false);
    expect(paths.has('/org-management')).toBe(true);
    expect(paths.has('/user-management')).toBe(true);
    expect(paths.has('/management-hub')).toBe(false); // hidden nav item by design
    expect(paths.has('/course-builder')).toBe(true);
    expect(paths.has('/course-assignments')).toBe(true);
    expect(paths.has('/admin/sales-dashboard')).toBe(true);
    expect(paths.has('/theme-editor')).toBe(true);
  });

  it('shows publications and assignments to direct org admins and teachers', () => {
    const orgAdminFiltered = filterNavigationByRole(
      false,
      true,
      false,
      'business',
      undefined,
      false,
      true,
      false,
      false,
      false
    );
    const teacherFiltered = filterNavigationByRole(
      false,
      false,
      true,
      'business',
      undefined,
      false,
      false,
      false,
      false,
      false
    );

    expect(collectPaths(orgAdminFiltered).has('/course-assignments')).toBe(true);
    expect(collectPaths(teacherFiltered).has('/course-assignments')).toBe(true);
  });
});
