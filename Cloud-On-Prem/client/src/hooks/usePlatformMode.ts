import { useQuery } from "@tanstack/react-query";

export interface PlatformMode {
  onpremMode: boolean;
  onpremOwnApiKeys: boolean;
  paymentGatewayEnabled: boolean;
  baseUrl: string;
}

export function usePlatformMode() {
  const hostname = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
  const hostSuggestsOnPrem = hostname.startsWith('onprem.') || hostname.includes('-onprem');

  const { data, isLoading } = useQuery<PlatformMode>({
    queryKey: ["/api/admin/platform-mode"],
    retry: false,
    staleTime: Infinity,
  });

  return {
    isLoading,
    onpremMode: data?.onpremMode ?? hostSuggestsOnPrem,
    onpremOwnApiKeys: data?.onpremOwnApiKeys ?? false,
    paymentGatewayEnabled: data?.paymentGatewayEnabled ?? true,
    baseUrl: data?.baseUrl || window.location.origin,
  };
}
