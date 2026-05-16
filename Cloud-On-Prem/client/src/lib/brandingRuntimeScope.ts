export function resolveBrandingRuntimeOrgId(params: {
  userInfo: {
    organizationId?: string | null;
    isSuperAdmin?: boolean;
    isCustSuper?: boolean;
    isImpersonating?: boolean;
    impersonatedOrganization?: { id: string } | null;
    organization?: { id: string } | null;
  } | null | undefined;
  userRoles?: {
    defaultOrganizationId?: string;
    organizations?: Array<{ id: string }>;
  } | null;
}): string | null {
  const { userInfo, userRoles } = params;
  if (!userInfo) return null;

  if (userInfo.isSuperAdmin && !userInfo.isImpersonating) {
    return null;
  }

  // On-prem CustSuper remains org-scoped when not impersonating.
  if (userInfo.isCustSuper && !userInfo.isImpersonating && userInfo.organizationId) {
    return userInfo.organizationId;
  }

  if (userInfo.isImpersonating && userInfo.impersonatedOrganization?.id) {
    return userInfo.impersonatedOrganization.id;
  }
  if (userRoles?.defaultOrganizationId) {
    return userRoles.defaultOrganizationId;
  }
  if (userRoles?.organizations?.[0]?.id) {
    return userRoles.organizations[0].id;
  }
  if (userInfo.organizationId) {
    return userInfo.organizationId;
  }
  if (userInfo.organization?.id) {
    return userInfo.organization.id;
  }
  return null;
}
