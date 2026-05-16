import { describe, expect, it } from '@jest/globals';
import { deriveEffectiveSessionRole } from '../services/sessionContextService';

describe('session role contract', () => {
  it.each([
    [['org_admin'], 'OrgAdmin'],
    [['teacher'], 'Teacher'],
    [['team_lead'], 'Teacher'],
    [['instructor'], 'Teacher'],
    [['student'], 'Learner'],
    [['learner'], 'Learner'],
    [['employee'], 'Learner'],
  ])('derives %s as %s without relying on org-type-specific literals', (roles, expected) => {
    expect(deriveEffectiveSessionRole({ isSuperAdmin: false, isCustSuper: false }, roles)).toBe(expected);
  });

  it('keeps platform roles above organization roles', () => {
    expect(deriveEffectiveSessionRole({ isSuperAdmin: true, isCustSuper: false }, ['teacher'])).toBe('SuperAdmin');
    expect(deriveEffectiveSessionRole({ isSuperAdmin: false, isCustSuper: true }, ['org_admin'])).toBe('CustSuper');
  });
});
