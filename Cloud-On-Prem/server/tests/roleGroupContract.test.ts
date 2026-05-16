import { describe, expect, it } from '@jest/globals';
import { ADMIN_ROLES, ALL_STAFF_ROLES, INSTRUCTOR_ROLES, LEARNER_ROLES } from '../storage';

describe('server role group contract', () => {
  it('keeps learner roles alias-safe across org types', () => {
    expect(LEARNER_ROLES).toEqual(expect.arrayContaining(['student', 'learner', 'employee']));
  });

  it('keeps instructor roles alias-safe across org types', () => {
    expect(INSTRUCTOR_ROLES).toEqual(expect.arrayContaining(['teacher', 'team_lead', 'instructor']));
  });

  it('keeps org admin role stable', () => {
    expect(ADMIN_ROLES).toEqual(['org_admin']);
  });

  it('keeps staff roles aligned with instructor aliases and org admin', () => {
    expect(ALL_STAFF_ROLES).toEqual(expect.arrayContaining(['teacher', 'team_lead', 'instructor', 'org_admin']));
  });
});
