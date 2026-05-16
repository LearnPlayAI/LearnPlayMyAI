export function shouldResolveOrgThemeForAuthenticatedRequest(params: {
  isAuthenticated: boolean;
  isPlatformDomain: boolean;
  isPlatformAdmin: boolean;
  isImpersonating: boolean;
  hasExplicitOrgContext: boolean;
}): boolean {
  const {
    isAuthenticated,
    isPlatformDomain,
    isPlatformAdmin,
    isImpersonating,
    hasExplicitOrgContext,
  } = params;

  if (!isAuthenticated) return false;
  if (isImpersonating) return true;
  if (hasExplicitOrgContext) return true;
  if (!isPlatformDomain) return true;
  if (isPlatformAdmin) return false;
  return true;
}

