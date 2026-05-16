import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { formatCurrency, getCurrencySymbol, getCurrencyName } from '@/lib/currency';

export type CurrencyCode = 'ZAR' | 'USD' | 'EUR';

interface CurrencyRate {
  baseCurrency: CurrencyCode;
  targetCurrency: CurrencyCode;
  rate: string;
  source: string;
  isActive: boolean;
  updatedAt?: string;
}

interface ExchangeRatesResponse {
  rates: CurrencyRate[];
  isRateStale?: boolean;
  rateLastUpdated?: string;
  error?: string;
}

const DEFAULT_CURRENCY: CurrencyCode = 'ZAR';
const CURRENCY_STORAGE_KEY = 'learnplay_currency_preference';
const RATE_STALE_THRESHOLD_HOURS = 24;

export function useCurrencyDisplay() {
  const { userPreferences, isAuthenticated, isLoading: authLoading } = useAuth();
  
  const [guestCurrency, setGuestCurrency] = useState<CurrencyCode>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(CURRENCY_STORAGE_KEY);
      if (stored && ['ZAR', 'USD', 'EUR'].includes(stored)) {
        return stored as CurrencyCode;
      }
    }
    return DEFAULT_CURRENCY;
  });

  const { 
    data: ratesData, 
    isLoading: ratesLoading, 
    dataUpdatedAt, 
    refetch: refetchRates, 
    isFetching: isRefetchingRates,
    error: ratesQueryError,
    isError: isRatesError,
  } = useQuery<ExchangeRatesResponse>({
    queryKey: ['/api/currency/rates'],
    staleTime: 5 * 60 * 1000, // 5 minutes - shorter to catch rate updates
    retry: 2,
  });

  const displayCurrency = isAuthenticated 
    ? (userPreferences?.effectiveLocale?.currency as CurrencyCode) || (userPreferences?.preferredCurrency as CurrencyCode) || DEFAULT_CURRENCY
    : guestCurrency;

  const isLoading = authLoading || ratesLoading;
  const rates = ratesData?.rates || [];
  
  // Determine if we have valid rates available
  const hasRates = rates.length > 0 && !isRatesError && !ratesData?.error;
  const ratesError = isRatesError 
    ? (ratesQueryError as Error)?.message || 'Failed to fetch currency rates'
    : ratesData?.error || null;

  const isRateStale = useCallback((): boolean => {
    if (ratesData?.isRateStale !== undefined) {
      return ratesData.isRateStale;
    }
    if (!dataUpdatedAt) return false;
    const hoursSinceUpdate = (Date.now() - dataUpdatedAt) / (1000 * 60 * 60);
    return hoursSinceUpdate > RATE_STALE_THRESHOLD_HOURS;
  }, [ratesData, dataUpdatedAt]);

  const getRateLastUpdated = useCallback((): Date | null => {
    if (ratesData?.rateLastUpdated) {
      return new Date(ratesData.rateLastUpdated);
    }
    if (dataUpdatedAt) {
      return new Date(dataUpdatedAt);
    }
    return null;
  }, [ratesData, dataUpdatedAt]);

  const setGuestCurrencyPreference = useCallback((currency: CurrencyCode) => {
    setGuestCurrency(currency);
    if (typeof window !== 'undefined') {
      localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
    }
  }, []);

  /**
   * Get exchange rate to display currency.
   * Returns null if rate is not available - NO FALLBACKS.
   */
  const getRateToDisplayCurrency = useCallback((fromCurrency: CurrencyCode): number | null => {
    if (fromCurrency === displayCurrency) return 1;
    
    if (!hasRates) {
      console.warn(`[Currency] No rates available for conversion from ${fromCurrency} to ${displayCurrency}`);
      return null;
    }
    
    if (fromCurrency === 'USD') {
      const rate = rates.find(r => 
        r.baseCurrency === 'USD' && r.targetCurrency === displayCurrency && r.isActive
      );
      if (!rate) {
        console.warn(`[Currency] No rate found: USD → ${displayCurrency}`);
        return null;
      }
      return parseFloat(rate.rate);
    }
    
    if (displayCurrency === 'USD') {
      const rate = rates.find(r => 
        r.baseCurrency === 'USD' && r.targetCurrency === fromCurrency && r.isActive
      );
      if (!rate) {
        console.warn(`[Currency] No rate found: USD → ${fromCurrency} (for inverse)`);
        return null;
      }
      return 1 / parseFloat(rate.rate);
    }
    
    // Cross-rate through USD
    const fromToUSD = rates.find(r => 
      r.baseCurrency === 'USD' && r.targetCurrency === fromCurrency && r.isActive
    );
    const usdToTarget = rates.find(r => 
      r.baseCurrency === 'USD' && r.targetCurrency === displayCurrency && r.isActive
    );
    
    if (!fromToUSD || !usdToTarget) {
      console.warn(`[Currency] No cross-rate available: ${fromCurrency} → ${displayCurrency}`);
      return null;
    }
    
    const fromRate = parseFloat(fromToUSD.rate);
    const toRate = parseFloat(usdToTarget.rate);
    return toRate / fromRate;
  }, [displayCurrency, rates, hasRates]);

  /**
   * Get exchange rate between any two currencies.
   * Returns null if rate is not available - NO FALLBACKS.
   */
  const getExchangeRate = useCallback((fromCurrency: CurrencyCode, toCurrency: CurrencyCode): number | null => {
    if (fromCurrency === toCurrency) return 1;
    
    if (!hasRates) {
      console.warn(`[Currency] No rates available for conversion from ${fromCurrency} to ${toCurrency}`);
      return null;
    }
    
    if (fromCurrency === 'USD') {
      const rate = rates.find(r => 
        r.baseCurrency === 'USD' && r.targetCurrency === toCurrency && r.isActive
      );
      if (!rate) {
        console.warn(`[Currency] No rate found: USD → ${toCurrency}`);
        return null;
      }
      return parseFloat(rate.rate);
    }
    
    if (toCurrency === 'USD') {
      const rate = rates.find(r => 
        r.baseCurrency === 'USD' && r.targetCurrency === fromCurrency && r.isActive
      );
      if (!rate) {
        console.warn(`[Currency] No rate found: USD → ${fromCurrency} (for inverse)`);
        return null;
      }
      return 1 / parseFloat(rate.rate);
    }
    
    // Cross-rate through USD
    const fromToUSD = rates.find(r => 
      r.baseCurrency === 'USD' && r.targetCurrency === fromCurrency && r.isActive
    );
    const usdToTarget = rates.find(r => 
      r.baseCurrency === 'USD' && r.targetCurrency === toCurrency && r.isActive
    );
    
    if (!fromToUSD || !usdToTarget) {
      console.warn(`[Currency] No cross-rate available: ${fromCurrency} → ${toCurrency}`);
      return null;
    }
    
    const fromRate = parseFloat(fromToUSD.rate);
    const toRate = parseFloat(usdToTarget.rate);
    return toRate / fromRate;
  }, [rates, hasRates]);

  /**
   * Convert amount between currencies.
   * Returns null if conversion is not possible - NO FALLBACKS.
   */
  const convertAmount = useCallback((
    amount: number | string, 
    fromCurrency: CurrencyCode,
    toCurrency?: CurrencyCode
  ): number | null => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numAmount)) return null;
    
    const target = toCurrency || displayCurrency;
    const rate = getExchangeRate(fromCurrency, target);
    if (rate === null) {
      return null; // NO FALLBACK
    }
    return numAmount * rate;
  }, [displayCurrency, getExchangeRate]);

  /**
   * Format a price for display.
   * Returns error indicator if conversion fails - NO FALLBACKS.
   */
  const formatPrice = useCallback((
    amount: number | string, 
    fromCurrency: CurrencyCode = 'ZAR',
    options?: { 
      showCode?: boolean; 
      minimumFractionDigits?: number; 
      maximumFractionDigits?: number;
      targetCurrency?: CurrencyCode;
    }
  ): string => {
    const targetCurrency = options?.targetCurrency || displayCurrency;
    const convertedAmount = convertAmount(amount, fromCurrency, targetCurrency);
    
    if (convertedAmount === null) {
      return '—'; // Em dash indicates unavailable
    }
    
    return formatCurrency({
      currency: targetCurrency,
      amount: convertedAmount,
      showCode: options?.showCode ?? false,
      minimumFractionDigits: options?.minimumFractionDigits ?? 2,
      maximumFractionDigits: options?.maximumFractionDigits ?? 2,
    });
  }, [displayCurrency, convertAmount]);

  const formatPriceWithCode = useCallback((
    amount: number | string, 
    fromCurrency: CurrencyCode = 'ZAR'
  ): string => {
    return formatPrice(amount, fromCurrency, { showCode: true });
  }, [formatPrice]);

  const formatInZAR = useCallback((
    amount: number | string,
    fromCurrency: CurrencyCode = 'ZAR'
  ): string => {
    const convertedAmount = convertAmount(amount, fromCurrency, 'ZAR');
    if (convertedAmount === null) {
      return '—';
    }
    return formatCurrency({
      currency: 'ZAR',
      amount: convertedAmount,
      showCode: true,
    });
  }, [convertAmount]);

  /**
   * Get detailed conversion information.
   * Returns null values for amounts/rates if conversion is not possible.
   */
  const getConversionDetails = useCallback((
    amount: number | string,
    fromCurrency: CurrencyCode
  ): {
    originalAmount: number;
    originalCurrency: CurrencyCode;
    convertedAmount: number | null;
    displayCurrency: CurrencyCode;
    exchangeRate: number | null;
    zarAmount: number | null;
    zarRate: number | null;
    hasValidRates: boolean;
  } => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    const displayRate = getExchangeRate(fromCurrency, displayCurrency);
    const zarRate = getExchangeRate(fromCurrency, 'ZAR');
    
    const hasValidRates = displayRate !== null && zarRate !== null;
    
    return {
      originalAmount: numAmount,
      originalCurrency: fromCurrency,
      convertedAmount: displayRate !== null ? numAmount * displayRate : null,
      displayCurrency,
      exchangeRate: displayRate,
      zarAmount: zarRate !== null ? numAmount * zarRate : null,
      zarRate,
      hasValidRates,
    };
  }, [displayCurrency, getExchangeRate]);

  const refreshRates = useCallback(async () => {
    const result = await refetchRates();
    return result;
  }, [refetchRates]);

  return {
    displayCurrency,
    isAuthenticated,
    isLoading,
    isRefreshingRates: isRefetchingRates,
    isRateStale: isRateStale(),
    rateLastUpdated: getRateLastUpdated(),
    hasRates,
    ratesError,
    rates,
    setGuestCurrencyPreference,
    convertAmount,
    formatPrice,
    formatPriceWithCode,
    formatInZAR,
    getConversionDetails,
    getExchangeRate,
    getRateToDisplayCurrency,
    refreshRates,
    getCurrencySymbol: () => getCurrencySymbol(displayCurrency),
    getCurrencyName: () => getCurrencyName(displayCurrency),
    availableCurrencies: ['ZAR', 'USD', 'EUR'] as CurrencyCode[],
  };
}

export function useAdminCurrencyToggle(defaultToPlatformCurrency: boolean = true) {
  const currencyDisplay = useCurrencyDisplay();
  const [showPlatformCurrency, setShowPlatformCurrency] = useState(defaultToPlatformCurrency);

  const activeCurrency: CurrencyCode = showPlatformCurrency ? 'ZAR' : currencyDisplay.displayCurrency;

  const formatPrice = useCallback((
    amount: number | string,
    fromCurrency: CurrencyCode = 'ZAR',
    options?: { showCode?: boolean }
  ): string => {
    const convertedAmount = currencyDisplay.convertAmount(amount, fromCurrency, activeCurrency);
    if (convertedAmount === null) {
      return '—';
    }
    return formatCurrency({
      currency: activeCurrency,
      amount: convertedAmount,
      showCode: options?.showCode ?? false,
    });
  }, [activeCurrency, currencyDisplay]);

  return {
    ...currencyDisplay,
    showPlatformCurrency,
    setShowPlatformCurrency,
    activeCurrency,
    formatPrice,
    toggleCurrency: () => setShowPlatformCurrency(prev => !prev),
  };
}
