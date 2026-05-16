const SYSTEM_TYPE_ORDER: Record<string, number> = {
  prd: 0,
  prod: 0,
  production: 0,
  acc: 1,
  acceptance: 1,
  qa: 1,
  testing: 1,
  test: 1,
  staging: 1,
  dev: 2,
  development: 2,
};

function normalizeSystemType(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export function enterpriseLicenseOrderIndex(value: unknown): number {
  const normalized = normalizeSystemType(value);
  return SYSTEM_TYPE_ORDER[normalized] ?? 99;
}

export function compareEnterpriseLicenseRecords<T extends {
  systemType?: unknown;
  name?: unknown;
  hostname?: unknown;
  internalHostname?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}>(
  a: T,
  b: T,
): number {
  const typeDelta = enterpriseLicenseOrderIndex(a.systemType) - enterpriseLicenseOrderIndex(b.systemType);
  if (typeDelta !== 0) return typeDelta;

  const labelA = String(a.name || a.hostname || a.internalHostname || '').toLowerCase();
  const labelB = String(b.name || b.hostname || b.internalHostname || '').toLowerCase();
  const labelDelta = labelA.localeCompare(labelB);
  if (labelDelta !== 0) return labelDelta;

  const updatedDelta = new Date(String(b.updatedAt || b.createdAt || 0)).getTime()
    - new Date(String(a.updatedAt || a.createdAt || 0)).getTime();
  return Number.isFinite(updatedDelta) ? updatedDelta : 0;
}

export function sortEnterpriseLicenseRecords<T extends {
  systemType?: unknown;
  name?: unknown;
  hostname?: unknown;
  internalHostname?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}>(
  records: T[] | undefined | null,
): T[] {
  return [...(records || [])].sort(compareEnterpriseLicenseRecords);
}
