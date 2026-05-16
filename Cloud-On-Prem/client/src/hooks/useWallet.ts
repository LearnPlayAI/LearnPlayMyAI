import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useUser } from '@/hooks/use-user';
import { queryClient } from '@/lib/queryClient';

export interface WalletBalanceResponse {
  balance: number;
  userId: string;
  timestamp: string;
}

export interface LpCreditTransaction {
  id: string;
  userId: string;
  type: 'purchase' | 'deduction' | 'refund' | 'bonus' | 'adjustment' | 'subscription_topup' | 'trial_grant';
  amount: number;
  balanceAfter: number;
  description: string;
  correlationId: string;
  metadata: Record<string, any> | null;
  createdAt: string;
}

export interface WalletTransactionsResponse {
  transactions: LpCreditTransaction[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface UseWalletBalanceOptions {
  enabled?: boolean;
  pollingInterval?: number | false;
}

export interface UseWalletTransactionsOptions {
  limit?: number;
  offset?: number;
  type?: LpCreditTransaction['type'];
  startDate?: Date;
  endDate?: Date;
  enabled?: boolean;
}

const LOW_BALANCE_THRESHOLD = 420;

/**
 * Centralized hook for LP Credit balance
 * Wraps /api/wallet/balance with standardized settings:
 * - refetchOnWindowFocus: true (syncs when user returns to tab)
 * - staleTime: 30s (prevents excessive refetches)
 * - Optional polling for real-time updates
 */
export function useWalletBalance(options: UseWalletBalanceOptions = {}) {
  const { user, isLoading: userLoading } = useUser();
  const queryClient = useQueryClient();
  
  const { enabled = true, pollingInterval = false } = options;

  const query = useQuery<WalletBalanceResponse>({
    queryKey: ['/api/wallet/balance'],
    queryFn: async () => {
      const response = await fetch('/api/wallet/balance', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch wallet balance');
      }
      return response.json();
    },
    enabled: enabled && !!user,
    staleTime: 30000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: pollingInterval || undefined,
  });

  const refreshBalance = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['/api/wallet/balance'] });
  }, [queryClient]);

  const balance = query.data?.balance ?? 0;
  const isLowBalance = balance < LOW_BALANCE_THRESHOLD;
  const isLoading = userLoading || query.isLoading;

  return useMemo(() => ({
    balance,
    isLowBalance,
    lowBalanceThreshold: LOW_BALANCE_THRESHOLD,
    isLoading,
    isError: query.isError,
    error: query.error,
    refreshBalance,
    data: query.data,
    user,
  }), [balance, isLowBalance, isLoading, query.isError, query.error, query.data, refreshBalance, user]);
}

/**
 * Centralized hook for LP Credit transaction history
 * Wraps /api/wallet/transactions with pagination and filtering
 */
export function useWalletTransactions(options: UseWalletTransactionsOptions = {}) {
  const { user } = useUser();
  const {
    limit = 20,
    offset = 0,
    type,
    startDate,
    endDate,
    enabled = true,
  } = options;

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set('limit', limit.toString());
    params.set('offset', offset.toString());
    if (type) params.set('type', type);
    if (startDate) params.set('startDate', startDate.toISOString());
    if (endDate) params.set('endDate', endDate.toISOString());
    return params.toString();
  }, [limit, offset, type, startDate, endDate]);

  const query = useQuery<WalletTransactionsResponse>({
    queryKey: ['/api/wallet/transactions', queryParams],
    queryFn: async () => {
      const response = await fetch(`/api/wallet/transactions?${queryParams}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch transaction history');
      }
      return response.json();
    },
    enabled: enabled && !!user,
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });

  return useMemo(() => ({
    transactions: query.data?.transactions ?? [],
    pagination: query.data?.pagination ?? { total: 0, limit, offset, hasMore: false },
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }), [query.data, query.isLoading, query.isError, query.error, query.refetch, limit, offset]);
}

export function formatTransactionType(type: LpCreditTransaction['type']): string {
  const labels: Record<LpCreditTransaction['type'], string> = {
    purchase: 'Purchase',
    deduction: 'Used',
    refund: 'Refund',
    bonus: 'Bonus',
    adjustment: 'Adjustment',
    subscription_topup: 'Subscription Top-up',
    trial_grant: 'Trial Grant',
  };
  return labels[type] || type;
}

export function getTransactionTypeColor(type: LpCreditTransaction['type']): string {
  const colors: Record<LpCreditTransaction['type'], string> = {
    purchase: 'text-success',
    deduction: 'text-[var(--action-danger)]',
    refund: 'text-secondary',
    bonus: 'text-accent',
    adjustment: 'text-primary',
    subscription_topup: 'text-success',
    trial_grant: 'text-accent',
  };
  return colors[type] || 'text-muted-foreground';
}

/**
 * Optimistically update the wallet balance in the cache and invalidate queries
 * Use this after a successful purchase to immediately reflect the new balance
 */
export function updateBalanceOptimistically(newBalance: number, organizationId?: string) {
  queryClient.setQueryData<WalletBalanceResponse>(['/api/wallet/balance'], (old) => {
    if (!old) return old;
    return {
      ...old,
      balance: newBalance,
      timestamp: new Date().toISOString(),
    };
  });
  
  queryClient.invalidateQueries({ queryKey: ['/api/wallet/balance'] });
  
  if (organizationId) {
    queryClient.invalidateQueries({ queryKey: ['/api/org-wallet', organizationId, 'balance'] });
  }
}

/**
 * Invalidate all wallet balance queries to force a refetch
 * Use this after a successful purchase to ensure fresh data
 */
export function invalidateWalletQueries(organizationId?: string) {
  queryClient.invalidateQueries({ queryKey: ['/api/wallet/balance'] });
  
  if (organizationId) {
    queryClient.invalidateQueries({ queryKey: ['/api/org-wallet', organizationId, 'balance'] });
  }
}

export interface HybridBalancePreview {
  canAfford: boolean;
  userBalance: number;
  orgBalance: number;
  totalAvailable: number;
  userDeduction: number;
  orgDeduction: number;
  creditSource: 'user' | 'organization' | 'split' | 'none';
  orgWalletEnabled: boolean;
  canSpendOrgCredits: boolean;
}

export interface UseHybridBalanceOptions {
  amount: number;
  enabled?: boolean;
}

/**
 * Hook for checking hybrid credit availability (user + org wallet)
 * Returns whether user can afford an amount using combined wallets
 */
export function useHybridBalance(options: UseHybridBalanceOptions) {
  const { user } = useUser();
  const { amount, enabled = true } = options;

  const query = useQuery<HybridBalancePreview>({
    queryKey: ['/api/wallet/hybrid-preview', amount],
    queryFn: async () => {
      const response = await fetch(`/api/wallet/hybrid-preview?amount=${amount}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch hybrid balance preview');
      }
      return response.json();
    },
    enabled: enabled && !!user && amount > 0,
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });

  return useMemo(() => ({
    canAfford: query.data?.canAfford ?? false,
    userBalance: query.data?.userBalance ?? 0,
    orgBalance: query.data?.orgBalance ?? 0,
    totalAvailable: query.data?.totalAvailable ?? 0,
    userDeduction: query.data?.userDeduction ?? 0,
    orgDeduction: query.data?.orgDeduction ?? 0,
    creditSource: query.data?.creditSource ?? 'none',
    orgWalletEnabled: query.data?.orgWalletEnabled ?? false,
    canSpendOrgCredits: query.data?.canSpendOrgCredits ?? false,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }), [query.data, query.isLoading, query.isError, query.error, query.refetch]);
}
