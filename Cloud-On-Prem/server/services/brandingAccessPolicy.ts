export function getRequestedOrgIdFromQuery(query: Record<string, unknown>): string | null {
  const value = query.orgId;
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized === '__platform__') return null;
  return normalized;
}

export function resolveBrandingTargetOrgId(params: {
  requestedOrgId: string | null;
  effectiveOrgId: string | null;
  isSuperAdmin: boolean;
  isCustSuper: boolean;
}): string | null {
  if ((params.isSuperAdmin || params.isCustSuper) && params.requestedOrgId) {
    return params.requestedOrgId;
  }
  return params.effectiveOrgId;
}
