import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { queryClient } from "@/lib/queryClient";
import { deriveAdminRuntimeContext } from '@/lib/adminRuntimeContext';

const CREDIT_VIEWING_ROLES = ['teacher', 'instructor', 'org_admin', 'super_admin'] as const;

export function canViewCredits(roles: { isTeacher?: boolean; isOrgAdmin?: boolean; isSuperAdmin?: boolean; organizationRoles?: Array<{ role?: string }> }): boolean {
  if (roles.isSuperAdmin || roles.isOrgAdmin || roles.isTeacher) {
    return true;
  }
  
  const orgRoles = roles.organizationRoles || [];
  return orgRoles.some(r => CREDIT_VIEWING_ROLES.includes(r.role as any));
}

export interface UserPreferences {
  preferredCurrency: string | null;
  needsCurrencyOnboarding: boolean;
  timezone: string | null;
  preferredLanguage?: string;
  effectiveLocale?: {
    timezone: string;
    currency: 'ZAR' | 'USD' | 'EUR';
    timezoneSource: 'user' | 'organization' | 'runtime_default';
    currencySource: 'user' | 'organization' | 'runtime_default';
  };
}

export function useAuth() {
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch('/api/auth/user', { credentials: 'include' });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error('Failed to fetch user');
      return res.json();
    },
  });

  const { data: adminCheck, isLoading: adminLoading } = useQuery({
    queryKey: ["/api/admin/check"],
    retry: false,
    enabled: !!user,
    queryFn: async () => {
      const res = await fetch('/api/admin/check', { credentials: 'include' });
      if (res.status === 401) {
        return null;
      }
      if (!res.ok) {
        return null;
      }
      return res.json();
    },
  });

  const hasInvalidatedRef = useRef(false);
  useEffect(() => {
    if (!isLoading && !adminLoading && user && !adminCheck && !hasInvalidatedRef.current) {
      hasInvalidatedRef.current = true;
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/check"] });
    }
    if (adminCheck) {
      hasInvalidatedRef.current = false;
    }
  }, [isLoading, adminLoading, user, adminCheck]);

  const adminData = adminCheck as any;
  const userData = user as any;

  // User preferences from session context (no additional API call needed)
  const userPreferences: UserPreferences = userData?.userPreferences ?? {
    preferredCurrency: 'ZAR',
    needsCurrencyOnboarding: true,
    timezone: null,
    effectiveLocale: {
      timezone: 'UTC',
      currency: 'ZAR',
      timezoneSource: 'runtime_default',
      currencySource: 'runtime_default',
    },
  };

  // Derive effectiveOrganizationId based on user type:
  // - Cloud SuperAdmin: only when impersonating
  // - CustSuper (on-prem): impersonated org when present, else own org context
  // - Org Admin / Teacher: organizationId from session, fallback to organizationRoles[0]
  const getEffectiveOrganizationId = (): string | null => {
    const isSuperAdmin = adminData?.isSuperAdmin || userData?.isSuperAdmin || false;
    const isCustSuperUser = adminData?.isCustSuper || userData?.isCustSuper || false;
    const isImpersonating = adminData?.isImpersonating || userData?.isImpersonating || false;
    const impersonatedOrg = adminData?.impersonatedOrganization || userData?.impersonatedOrganization;
    
    if (isSuperAdmin) {
      return isImpersonating && impersonatedOrg?.id ? impersonatedOrg.id : null;
    }

    if (isCustSuperUser) {
      if (isImpersonating && impersonatedOrg?.id) {
        return impersonatedOrg.id;
      }
      // On-prem CustSuper should still operate in org context even when not actively impersonating.
      if (userData?.organizationId) {
        return userData.organizationId;
      }
    }
    
    // Regular users (org admin, teacher, learner): use their org
    // Priority: organizationId from session > organizationRoles[0]
    if (userData?.organizationId) {
      return userData.organizationId;
    }
    
    // Fallback to first organization role from either userData or adminData
    // IMPORTANT: Use content-aware fallback - empty arrays are truthy, so check length
    const userOrgRoles = userData?.organizationRoles ?? [];
    const adminOrgRoles = adminData?.organizationRoles ?? [];
    const orgRoles = userOrgRoles.length > 0 ? userOrgRoles : adminOrgRoles;
    
    if (orgRoles.length > 0 && orgRoles[0]?.organizationId) {
      return orgRoles[0].organizationId;
    }
    
    // Development debug logging
    if (process.env.NODE_ENV === 'development' && userData?.id) {
      console.warn('[useAuth] effectiveOrganizationId is null for authenticated user:', {
        userId: userData.id,
        userOrgId: userData?.organizationId,
        userOrgRolesLen: userOrgRoles.length,
        adminOrgRolesLen: adminOrgRoles.length,
      });
    }
    
    return null;
  };

  const effectiveOrganizationId = getEffectiveOrganizationId();
  const effectiveOrganizationName = (() => {
    const effectiveOrg = adminData?.impersonatedOrganization
      || userData?.impersonatedOrganization
      || userData?.organization
      || userData?.organizations?.find?.((org: any) => org?.id === effectiveOrganizationId)
      || adminData?.organizations?.find?.((org: any) => org?.id === effectiveOrganizationId)
      || null;

    return effectiveOrg?.name ?? null;
  })();
  const runtimeContext = deriveAdminRuntimeContext({
    isSuperAdmin: adminData?.isSuperAdmin || userData?.isSuperAdmin || false,
    isCustSuper: adminData?.isCustSuper || userData?.isCustSuper || false,
    isOrgAdmin: adminData?.isOrgAdmin || false,
    isTeacher: adminData?.isTeacher || false,
    isImpersonating: adminData?.isImpersonating || userData?.isImpersonating || false,
    effectiveOrganizationId,
    effectiveOrganizationName,
  });

  const adminCheckFailed = !isLoading && !adminLoading && !!user && !adminCheck;

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    adminCheckFailed,
    isAdmin: adminData?.isAdmin || false,
    isSuperAdmin: adminData?.isSuperAdmin || false,
    isCustSuper: adminData?.isCustSuper || false,
    isOrgAdmin: adminData?.isOrgAdmin || false,
    isTeacher: adminData?.isTeacher || false,
    organizationRoles: adminData?.organizationRoles || [],
    unitAssignments: adminData?.unitAssignments || [],
    isAdminLoading: adminLoading,
    organizationType: userData?.organizationType as 'education' | 'business' | 'elearning' | null,
    // SuperAdmin impersonation state - check both adminData and userData for reliability
    isImpersonating: adminData?.isImpersonating || userData?.isImpersonating || false,
    impersonatedOrganization: (adminData?.impersonatedOrganization || userData?.impersonatedOrganization) as { id: string; name: string; type: string } | null,
    // Effective org admin: true if isOrgAdmin OR (isSuperAdmin AND impersonating an org)
    effectiveOrgAdmin: (adminData?.effectiveOrgAdmin ?? (adminData?.isOrgAdmin || (adminData?.isSuperAdmin && (adminData?.isImpersonating || userData?.isImpersonating)))) || false,
    // User preferences from session context (currency, timezone, onboarding flags)
    userPreferences,
    needsCurrencyOnboarding: userPreferences.needsCurrencyOnboarding,
    // Feature flags
    courseVisibilityEnabled: adminData?.courseVisibilityEnabled ?? true,
    // Demo organization status - from user's primary organization
    isDemo: userData?.isDemo || false,
    // Effective demo status considering impersonation - adminData.isDemo uses effective org (impersonation-aware)
    // When impersonating, adminData.isDemo reflects the impersonated org's demo status
    effectiveIsDemo: adminData?.isDemo || userData?.isDemo || false,
    // Effective organization ID for org wallet - handles SuperAdmin impersonation vs regular org members
    effectiveOrganizationId,
    effectiveOrganizationName,
    runtimeContext,
  };
}
