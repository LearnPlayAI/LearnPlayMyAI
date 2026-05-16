import { describe, expect, test } from '@jest/globals';
import { evaluateOnpremLearnerLoginAccess } from '../services/onpremLicensePolicy';

describe('evaluateOnpremLearnerLoginAccess', () => {
  test('allows all users when not in onprem mode', () => {
    const decision = evaluateOnpremLearnerLoginAccess({
      onpremMode: false,
      systemType: 'production',
      hasValidLicense: false,
      learnerRolesAllowed: false,
      hasLearnerRole: true,
      hasNonLearnerRole: false,
      isSuperAdmin: false,
      isCustSuper: false,
    });

    expect(decision.allowed).toBe(true);
  });

  test('blocks learner-only login on development systems', () => {
    const decision = evaluateOnpremLearnerLoginAccess({
      onpremMode: true,
      systemType: 'development',
      hasValidLicense: true,
      learnerRolesAllowed: false,
      hasLearnerRole: true,
      hasNonLearnerRole: false,
      isSuperAdmin: false,
      isCustSuper: false,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.errorMessage).toMatch(/Learner login is disabled on on-prem DEVELOPMENT systems/i);
  });

  test('blocks learner-only login on qa/acc systems', () => {
    const decision = evaluateOnpremLearnerLoginAccess({
      onpremMode: true,
      systemType: 'qa',
      hasValidLicense: true,
      learnerRolesAllowed: false,
      hasLearnerRole: true,
      hasNonLearnerRole: false,
      isSuperAdmin: false,
      isCustSuper: false,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.errorMessage).toMatch(/Learner login is disabled on on-prem QA systems/i);
  });

  test('allows learner-only login on licensed production', () => {
    const decision = evaluateOnpremLearnerLoginAccess({
      onpremMode: true,
      systemType: 'production',
      hasValidLicense: true,
      learnerRolesAllowed: true,
      hasLearnerRole: true,
      hasNonLearnerRole: false,
      isSuperAdmin: false,
      isCustSuper: false,
    });

    expect(decision.allowed).toBe(true);
  });

  test('blocks learner-only login on unlicensed production', () => {
    const decision = evaluateOnpremLearnerLoginAccess({
      onpremMode: true,
      systemType: 'production',
      hasValidLicense: false,
      learnerRolesAllowed: false,
      hasLearnerRole: true,
      hasNonLearnerRole: false,
      isSuperAdmin: false,
      isCustSuper: false,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.errorMessage).toMatch(/unlicensed on-prem systems/i);
  });

  test('allows elevated and mixed-role users', () => {
    const custSuperDecision = evaluateOnpremLearnerLoginAccess({
      onpremMode: true,
      systemType: 'development',
      hasValidLicense: true,
      learnerRolesAllowed: false,
      hasLearnerRole: true,
      hasNonLearnerRole: false,
      isSuperAdmin: false,
      isCustSuper: true,
    });

    const mixedRoleDecision = evaluateOnpremLearnerLoginAccess({
      onpremMode: true,
      systemType: 'development',
      hasValidLicense: true,
      learnerRolesAllowed: false,
      hasLearnerRole: true,
      hasNonLearnerRole: true,
      isSuperAdmin: false,
      isCustSuper: false,
    });

    expect(custSuperDecision.allowed).toBe(true);
    expect(mixedRoleDecision.allowed).toBe(true);
  });
});
