import { useQuery } from "@tanstack/react-query";

export interface OrganizationRole {
  role: string;
  organizationId: string;
}

export interface ImpersonatedOrganization {
  id: string;
  name: string;
  type: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: string | null;
  organizationId: string | null;
  organizationType: 'education' | 'business' | 'elearning' | null;
  organizationRoles: OrganizationRole[];
  impersonatedOrganization: ImpersonatedOrganization | null;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  displayName?: string;
  avatarUrl?: string;
  preferredLanguage?: string;
}

export function useUser() {
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    retry: false,
    queryFn: async () => {
      const res = await fetch('/api/auth/user', { credentials: 'include' });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error('Failed to fetch user');
      const data = await res.json();

      // Normalize org context for legacy pages that still rely on user.organizationId.
      if (data?.isImpersonating && data?.impersonatedOrganization?.id) {
        data.organizationId = data.impersonatedOrganization.id;
      } else if (data?.effectiveOrganizationId) {
        data.organizationId = data.effectiveOrganizationId;
      }

      return data;
    },
  });

  return {
    user,
    isLoading,
  };
}
