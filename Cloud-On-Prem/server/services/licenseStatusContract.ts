export const ENTERPRISE_SYSTEM_LICENSE_STATUSES = [
  'active',
  'grace',
  'expired',
  'revoked',
  'suspended',
  'inactive',
  'unlicensed',
  'pending_approval',
  'reissue_required',
  'reissue_requested',
  'incomplete_profile',
  'invalid_local_state',
  'pending_cloud_confirm',
  'identity_mismatch',
] as const;

export type EnterpriseSystemLicenseStatus = typeof ENTERPRISE_SYSTEM_LICENSE_STATUSES[number];

const STATUS_SET = new Set<string>(ENTERPRISE_SYSTEM_LICENSE_STATUSES);

export function normalizeEnterpriseSystemLicenseStatus(
  input: unknown,
  fallback: EnterpriseSystemLicenseStatus = 'inactive',
): EnterpriseSystemLicenseStatus {
  const value = String(input || '').trim().toLowerCase();
  if (STATUS_SET.has(value)) {
    return value as EnterpriseSystemLicenseStatus;
  }
  return fallback;
}

export function isCloudAuthoritativeActiveStatus(input: unknown): boolean {
  const normalized = normalizeEnterpriseSystemLicenseStatus(input, 'inactive');
  return normalized === 'active' || normalized === 'grace';
}

export function shouldSystemRuntimeBeActive(input: unknown): boolean {
  const normalized = normalizeEnterpriseSystemLicenseStatus(input, 'inactive');
  return normalized === 'active' || normalized === 'grace';
}

