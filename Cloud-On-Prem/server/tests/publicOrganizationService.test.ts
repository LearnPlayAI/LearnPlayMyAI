import { describe, expect, it } from '@jest/globals';
import {
  getPublicLearnerRole,
  PUBLIC_ORGANIZATION_INVITE_CODE,
  PUBLIC_ORGANIZATION_NAME,
} from '../services/publicOrganizationService';

describe('public organization defaults', () => {
  it('uses the canonical public organization identity', () => {
    expect(PUBLIC_ORGANIZATION_NAME).toBe('Public Organization');
    expect(PUBLIC_ORGANIZATION_INVITE_CODE).toBe('PUBLIC');
  });

  it('assigns the learner role for public e-learning registrations', () => {
    expect(getPublicLearnerRole('elearning')).toBe('learner');
    expect(getPublicLearnerRole('business')).toBe('learner');
    expect(getPublicLearnerRole('education')).toBe('student');
  });
});
