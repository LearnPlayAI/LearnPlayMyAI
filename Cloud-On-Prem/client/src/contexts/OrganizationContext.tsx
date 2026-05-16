import { createContext, useContext, ReactNode, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTerminology, getLowercaseTerminology, type OrganizationType, type TerminologyMap } from '@/utils/terminology';

/**
 * Organization Context
 * 
 * Provides organization-specific terminology throughout the application.
 * 
 * IMPORTANT: organizationType returns undefined while data is loading.
 * Components should check isResolved or isLoading before rendering 
 * organization-specific content to avoid flashing incorrect terminology.
 * 
 * Example usage:
 * ```tsx
 * const { terminology, isResolved } = useOrgContext();
 * if (!isResolved) return <LoadingSpinner />;
 * return <div>{terminology.learner}</div>; // Guaranteed correct
 * ```
 */
interface OrganizationContextType {
  organizationType: OrganizationType | undefined;
  terminology: TerminologyMap | undefined;
  terminologyLower: TerminologyMap | undefined;
  isLoading: boolean;
  isResolved: boolean;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { data: userInfo, isLoading: userLoading } = useQuery<any>({
    queryKey: ['/api/auth/user'],
    retry: false,
    queryFn: async () => {
      const res = await fetch('/api/auth/user', { credentials: 'include' });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error('Failed to fetch user');
      return res.json();
    },
  });
  
  const userError = userInfo === null;

  const { data: userContext, isLoading: contextLoading, isError: contextError } = useQuery<any>({
    queryKey: ['/api/user/roles'],
    enabled: !!userInfo,
    retry: false,
  });

  const { data: organizations = [], isLoading: orgsLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations'],
    enabled: userInfo?.isSuperAdmin === true,
  });

  const isLoading = userLoading || contextLoading || (userInfo?.isSuperAdmin && orgsLoading);
  
  // Mark as resolved when:
  // 1. We have userContext (authenticated user with org context), OR
  // 2. Auth failed (401) or roles fetch failed - allows public pages to use default terminology
  // This prevents non-authenticated users from getting stuck in loading state
  const isResolved = !isLoading && (!!userContext || userError || contextError);

  const organizationType: OrganizationType | undefined = useMemo(() => {
    if (!isResolved) {
      return undefined;
    }

    // Handle auth errors or missing userContext
    // This allows public pages to work with default terminology
    if (!userContext) {
      if (userError || contextError) {
        console.log('[OrganizationContext] User not authenticated or roles fetch failed - using default education terminology for public pages');
      } else {
        console.warn('[OrganizationContext] No userContext - defaulting to education');
      }
      return 'education'; // Default fallback for unauthenticated or error states
    }

    const defaultOrgId = userContext.defaultOrganizationId;

    // When impersonating, use the impersonated organization's type
    if (userInfo?.isImpersonating && userInfo?.impersonatedOrganization) {
      console.log('[OrganizationContext] Using impersonated org type:', userInfo.impersonatedOrganization.type);
      return userInfo.impersonatedOrganization.type as OrganizationType;
    }

    if (userInfo?.isSuperAdmin && organizations.length > 0) {
      const defaultOrg = defaultOrgId 
        ? organizations.find(org => org.id === defaultOrgId)
        : organizations[0];
      console.log('[OrganizationContext] SuperAdmin org type:', defaultOrg?.type, 'from org:', defaultOrg);
      return defaultOrg?.type || 'education';
    }

    if (userContext.organizations && userContext.organizations.length > 0) {
      const defaultOrg = defaultOrgId
        ? userContext.organizations.find((org: any) => org.id === defaultOrgId)
        : userContext.organizations[0];
      console.log('[OrganizationContext] Regular user org type:', defaultOrg?.type, 'from org:', defaultOrg);
      return defaultOrg?.type || 'education';
    }

    console.warn('[OrganizationContext] No organizations found - defaulting to education');
    return 'education';
  }, [
    isResolved,
    userContext,
    userInfo?.isSuperAdmin,
    userInfo?.isImpersonating,
    userInfo?.impersonatedOrganization,
    organizations,
    userError,
    contextError,
  ]);

  const terminology = useMemo(
    () => organizationType ? getTerminology(organizationType) : undefined, 
    [organizationType]
  );
  const terminologyLower = useMemo(
    () => organizationType ? getLowercaseTerminology(organizationType) : undefined, 
    [organizationType]
  );

  const value = useMemo(
    () => ({ organizationType, terminology, terminologyLower, isLoading, isResolved }),
    [organizationType, terminology, terminologyLower, isLoading, isResolved]
  );

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}

/**
 * PRIMARY HOOK - Use this for terminology-based rendering
 * 
 * Returns organization-specific terminology along with loading state.
 * Always check isResolved before using terminology to avoid flashing incorrect copy.
 * 
 * @example
 * const { terminology, isResolved } = useOrganizationTerminology();
 * if (!isResolved) return <LoadingSpinner />;
 * return <h1>Welcome {terminology.learnerPlural}</h1>;
 */
export function useOrganizationTerminology() {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    return {
      terminology: undefined,
      terminologyLower: undefined,
      isLoading: false,
      isResolved: false,
    };
  }
  return {
    terminology: context.terminology,
    terminologyLower: context.terminologyLower,
    isLoading: context.isLoading,
    isResolved: context.isResolved,
  };
}

/**
 * Get organization type (undefined while loading)
 * Consider using useOrganizationTerminology() instead for most cases.
 */
export function useOrganizationType(): OrganizationType | undefined {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    return undefined;
  }
  return context.organizationType;
}

/**
 * DEPRECATED: Use useOrganizationTerminology() instead
 * Returns undefined during loading - you MUST check before using!
 * @deprecated
 */
export function useTerminology(): TerminologyMap | undefined {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    console.warn('useTerminology: No OrganizationContext found. Use useOrganizationTerminology() instead.');
    return undefined;
  }
  if (!context.isResolved) {
    console.warn('useTerminology called while organization data is loading. Use useOrganizationTerminology() and check isResolved instead.');
  }
  return context.terminology;
}

/**
 * DEPRECATED: Use useOrganizationTerminology() instead
 * Returns undefined during loading - you MUST check before using!
 * @deprecated
 */
export function useTerminologyLower(): TerminologyMap | undefined {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    console.warn('useTerminologyLower: No OrganizationContext found. Use useOrganizationTerminology() instead.');
    return undefined;
  }
  if (!context.isResolved) {
    console.warn('useTerminologyLower called while organization data is loading. Use useOrganizationTerminology() and check isResolved instead.');
  }
  return context.terminologyLower;
}

/**
 * Get full organization context including type, terminology, and loading state
 * For most cases, use useOrganizationTerminology() instead.
 */
export function useOrgContext(): OrganizationContextType {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    return {
      organizationType: undefined,
      terminology: undefined,
      terminologyLower: undefined,
      isLoading: false,
      isResolved: false,
    };
  }
  return context;
}
