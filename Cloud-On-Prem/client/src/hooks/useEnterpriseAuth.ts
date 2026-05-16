import { useQuery } from "@tanstack/react-query";

export function useEnterpriseAuth() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/enterprise/auth/me"],
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const res = await fetch('/api/enterprise/auth/me', { credentials: 'include' });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error('Failed to fetch enterprise user');
      const json = await res.json();
      return json;
    },
  });

  return {
    enterpriseUser: data?.customer || null,
    selectedCustomer: (data?.isSuperAdmin && data?.isImpersonating) ? (data?.customer || null) : null,
    isLoading,
    isAuthenticated: !!data?.customer || !!data?.isSuperAdmin,
    isSuperAdmin: data?.isSuperAdmin || false,
    isImpersonating: data?.isImpersonating || false,
    hasCustomerSelected: !!(data?.isSuperAdmin && data?.isImpersonating) || false,
    needsCustomerSelection: data?.needsCustomerSelection || false,
  };
}
