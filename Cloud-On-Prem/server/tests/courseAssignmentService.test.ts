import { describe, expect, it } from '@jest/globals';

import { CourseAssignmentService } from '../services/courseAssignmentService';

describe('CourseAssignmentService assignment target identity', () => {
  it('treats different departments on the same course as separate assignment targets', () => {
    const base = {
      courseId: 'course-1',
      organizationId: 'org-1',
      assignedBy: 'user-1',
      mandatory: true,
    };

    const engineering = CourseAssignmentService.getAssignmentTargetKey({
      ...base,
      unitId: 'department-engineering',
      assignmentScope: 'department',
    } as any);

    const finance = CourseAssignmentService.getAssignmentTargetKey({
      ...base,
      unitId: 'department-finance',
      assignmentScope: 'department',
    } as any);

    const engineeringAgain = CourseAssignmentService.getAssignmentTargetKey({
      ...base,
      unitId: 'department-engineering',
      assignmentScope: 'department',
    } as any);

    expect(engineering).not.toBe(finance);
    expect(engineering).toBe(engineeringAgain);
  });

  it('includes target organization in the assignment target identity for onprem cross-org rows', () => {
    const base = {
      courseId: 'course-1',
      organizationId: 'source-org',
      assignedBy: 'user-1',
      unitId: 'target-department',
      assignmentScope: 'department',
      mandatory: true,
    };

    const targetA = CourseAssignmentService.getAssignmentTargetKey({
      ...base,
      targetOrganizationId: 'target-org-a',
    } as any);

    const targetB = CourseAssignmentService.getAssignmentTargetKey({
      ...base,
      targetOrganizationId: 'target-org-b',
    } as any);

    expect(targetA).not.toBe(targetB);
  });

  it('delivers cross-org assignments to the target organization instead of the source organization', () => {
    expect(
      CourseAssignmentService.getDeliveryOrganizationId({
        organizationId: 'source-org',
        targetOrganizationId: 'target-org',
      })
    ).toBe('target-org');

    expect(
      CourseAssignmentService.getDeliveryOrganizationId({
        organizationId: 'local-org',
        targetOrganizationId: null,
      })
    ).toBe('local-org');
  });

  it('infers department, unit, and team scope from populated hierarchy fields', () => {
    expect(CourseAssignmentService.inferAssignmentScope({ unitId: 'department-1' })).toBe('department');
    expect(CourseAssignmentService.inferAssignmentScope({ unitId: 'department-1', subUnitId: 'unit-1' })).toBe('unit');
    expect(CourseAssignmentService.inferAssignmentScope({ unitId: 'department-1', subUnitId: 'unit-1', teamId: 'team-1' })).toBe('team');
  });

  it('normalizes replacement data when changing a course from org-wide to department showcase scope', () => {
    const update = CourseAssignmentService.getNormalizedAssignmentUpdateData({
      courseId: 'course-1',
      organizationId: 'org-1',
      assignedBy: 'admin-1',
      assignmentScope: 'department',
      unitId: 'showcase-department',
      mandatory: false,
    } as any, 'department');

    expect(update).toMatchObject({
      assignmentScope: 'department',
      unitId: 'showcase-department',
      userId: null,
      subjectId: null,
      subUnitId: null,
      teamId: null,
      assignedBy: 'admin-1',
    });
  });
});
