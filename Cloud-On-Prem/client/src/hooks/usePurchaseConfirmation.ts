import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { invalidatePurchaseCaches } from "@/lib/queryClient";

export interface PurchaseConfirmation {
  intentId?: string;
  checkoutId?: string;
  intentType: 'course' | 'credits' | 'subscription' | 'license';
  status: string;
  amount: string;
  currency: 'ZAR' | 'USD' | 'EUR';
  createdAt: string;
  fulfilled: boolean;
  creditsReceived?: number;
  newBalance?: number;
  packageName?: string;
  orderStatus?: string;
  courseName?: string;
  courseId?: string;
  enrolled?: boolean;
  subscriptionStatus?: string;
  planName?: string;
  licenseTier?: string;
  licenseStatus?: string;
}

interface UsePurchaseConfirmationOptions {
  intentId?: string | null;
  checkoutId?: string | null;
  onFulfilled?: (data: PurchaseConfirmation) => void;
  maxPollingAttempts?: number;
  pollingInterval?: number;
}

/**
 * Hook for polling payment confirmation status after YOCO redirect
 * 
 * Supports two lookup methods:
 * 1. intentId (preferred) - Uses our internal payment intent ID
 * 2. checkoutId (legacy) - Uses YOCO's checkout ID
 * 
 * The intentId method is preferred because YOCO doesn't support URL placeholders,
 * so we use our own payment intent ID in redirect URLs.
 */
export function usePurchaseConfirmation({
  intentId,
  checkoutId,
  onFulfilled,
  maxPollingAttempts = 30,
  pollingInterval = 2000,
}: UsePurchaseConfirmationOptions) {
  const [pollingCount, setPollingCount] = useState(0);
  const [hasFulfillmentTriggered, setHasFulfillmentTriggered] = useState(false);
  const [isPending, setIsPending] = useState(false);

  // Prefer intentId over checkoutId for lookups
  const lookupId = intentId || checkoutId;
  const useIntentIdEndpoint = !!intentId;

  const { data, isLoading, error, refetch } = useQuery<PurchaseConfirmation>({
    queryKey: useIntentIdEndpoint 
      ? ['/api/payment-intents', intentId, 'confirmation']
      : ['/api/purchases', checkoutId, 'confirmation'],
    queryFn: async () => {
      if (!lookupId) throw new Error('No intent ID or checkout ID');
      
      // Use the appropriate endpoint based on which ID we have
      const endpoint = useIntentIdEndpoint
        ? `/api/payment-intents/${intentId}/confirmation`
        : `/api/purchases/${checkoutId}/confirmation`;
      
      const response = await fetch(endpoint, {
        credentials: 'include',
      });
      
      // Handle 404/not_found as pending state (webhook may not have arrived yet)
      if (response.status === 404) {
        setIsPending(true);
        return {
          intentId: intentId || undefined,
          checkoutId: checkoutId || undefined,
          intentType: 'credits' as const,
          status: 'pending',
          amount: '0',
          currency: 'ZAR' as const,
          createdAt: new Date().toISOString(),
          fulfilled: false,
        };
      }
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch confirmation');
      }
      
      setIsPending(false);
      return response.json();
    },
    enabled: !!lookupId,
    staleTime: 0,
    refetchInterval: false,
    retry: false,
  });

  useEffect(() => {
    if (!lookupId) return;
    
    // If we have data and it's fulfilled, trigger the callback
    if (data && data.fulfilled && !hasFulfillmentTriggered) {
      setHasFulfillmentTriggered(true);
      invalidatePurchaseCaches();
      onFulfilled?.(data);
      return;
    }

    // Continue polling if not fulfilled and under max attempts
    // Also poll if we got a pending/404 response
    if (data && !data.fulfilled && pollingCount < maxPollingAttempts) {
      const timer = setTimeout(() => {
        setPollingCount(prev => prev + 1);
        refetch();
      }, pollingInterval);
      return () => clearTimeout(timer);
    }
  }, [data, lookupId, pollingCount, maxPollingAttempts, pollingInterval, onFulfilled, hasFulfillmentTriggered, refetch]);

  useEffect(() => {
    if (lookupId) {
      setPollingCount(0);
      setHasFulfillmentTriggered(false);
      setIsPending(false);
    }
  }, [lookupId]);

  return {
    confirmation: data,
    isLoading,
    error: isPending ? null : error, // Don't show error for pending/404 state
    isPolling: (!data?.fulfilled && pollingCount < maxPollingAttempts && !!lookupId) || isPending,
    pollingCount,
    refetch,
    isPending,
  };
}
