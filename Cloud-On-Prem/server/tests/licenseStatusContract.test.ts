import { describe, expect, test } from '@jest/globals';
import {
  normalizeEnterpriseSystemLicenseStatus,
  isCloudAuthoritativeActiveStatus,
  shouldSystemRuntimeBeActive,
} from '../services/licenseStatusContract';

describe('licenseStatusContract', () => {
  test('normalizes known statuses and falls back for unknown values', () => {
    expect(normalizeEnterpriseSystemLicenseStatus('ACTIVE')).toBe('active');
    expect(normalizeEnterpriseSystemLicenseStatus(' pending_approval ')).toBe('pending_approval');
    expect(normalizeEnterpriseSystemLicenseStatus('nope')).toBe('inactive');
  });

  test('active/grace are cloud-authoritative active states', () => {
    expect(isCloudAuthoritativeActiveStatus('active')).toBe(true);
    expect(isCloudAuthoritativeActiveStatus('grace')).toBe(true);
    expect(isCloudAuthoritativeActiveStatus('expired')).toBe(false);
    expect(isCloudAuthoritativeActiveStatus('pending_approval')).toBe(false);
  });

  test('runtime active state aligns to active/grace only', () => {
    expect(shouldSystemRuntimeBeActive('active')).toBe(true);
    expect(shouldSystemRuntimeBeActive('grace')).toBe(true);
    expect(shouldSystemRuntimeBeActive('suspended')).toBe(false);
    expect(shouldSystemRuntimeBeActive('pending_approval')).toBe(false);
  });
});
