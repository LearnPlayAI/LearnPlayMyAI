import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { formatCurrency, getCurrencySymbol } from '@/lib/currency';

type CurrencyCode = 'ZAR' | 'USD' | 'EUR';

interface CurrencyRate {
  baseCurrency: CurrencyCode;
  targetCurrency: CurrencyCode;
  rate: string;
  source: string;
  isActive: boolean;
}

interface ExchangeRatesResponse {
  rates: CurrencyRate[];
  isRateStale?: boolean;
  rateLastUpdated?: string | null;
  error?: string;
}

const DEFAULT_CURRENCY: CurrencyCode = 'ZAR';

export function useCurrencyPreference() {
  const { userPreferences, isLoading: authLoading } = useAuth();

  const { 
    data: ratesData, 
    isLoading: ratesLoading,
    error: ratesQueryError,
    isError: isRatesError,
  } = useQuery<ExchangeRatesResponse>({
    queryKey: ['/api/currency/rates'],
    staleTime: 5 * 60 * 1000, // 5 minutes - shorter to catch rate updates
    retry: 2,
  });

  const userCurrency = (userPreferences?.effectiveLocale?.currency as CurrencyCode) || (userPreferences?.preferredCurrency as CurrencyCode) || DEFAULT_CURRENCY;
  const isLoading = authLoading || ratesLoading;
  
  // Determine if we have valid rates available
  const rates = ratesData?.rates || [];
  const hasRates = rates.length > 0 && !isRatesError && !ratesData?.error;
  const ratesError = isRatesError 
    ? (ratesQueryError as Error)?.message || 'Failed to fetch currency rates'
    : ratesData?.error || null;
  const isRateStale = ratesData?.isRateStale ?? false;
  const rateLastUpdated = ratesData?.rateLastUpdated || null;

  /**
   * Get exchange rate from a currency to user's preferred currency.
   * Returns null if rate is not available - NO FALLBACKS.
   * Callers must handle null appropriately.
   */
  const getRateToUserCurrency = (fromCurrency: CurrencyCode): number | null => {
    // Same currency = no conversion needed
    if (fromCurrency === userCurrency) return 1;
    
    // If no rates available, return null (NO FALLBACK TO 1)
    if (!hasRates) {
      console.warn(`[Currency] No rates available for conversion from ${fromCurrency} to ${userCurrency}`);
      return null;
    }
    
    // Direct conversion from USD
    if (fromCurrency === 'USD') {
      const rate = rates.find(r => 
        r.baseCurrency === 'USD' && r.targetCurrency === userCurrency && r.isActive
      );
      if (!rate) {
        console.warn(`[Currency] No rate found: USD → ${userCurrency}`);
        return null;
      }
      return parseFloat(rate.rate);
    }
    
    // Direct conversion to USD
    if (userCurrency === 'USD') {
      const rate = rates.find(r => 
        r.baseCurrency === 'USD' && r.targetCurrency === fromCurrency && r.isActive
      );
      if (!rate) {
        console.warn(`[Currency] No rate found: USD → ${fromCurrency} (for inverse)`);
        return null;
      }
      return 1 / parseFloat(rate.rate);
    }
    
    // Cross-rate conversion through USD (e.g., ZAR → EUR via USD)
    const fromToUSD = rates.find(r => 
      r.baseCurrency === 'USD' && r.targetCurrency === fromCurrency && r.isActive
    );
    const usdToTarget = rates.find(r => 
      r.baseCurrency === 'USD' && r.targetCurrency === userCurrency && r.isActive
    );
    
    if (!fromToUSD) {
      console.warn(`[Currency] No rate found: USD → ${fromCurrency} (for cross-rate)`);
      return null;
    }
    if (!usdToTarget) {
      console.warn(`[Currency] No rate found: USD → ${userCurrency} (for cross-rate)`);
      return null;
    }
    
    const fromRate = parseFloat(fromToUSD.rate);
    const toRate = parseFloat(usdToTarget.rate);
    return toRate / fromRate;
  };

  /**
   * Convert an amount from one currency to user's preferred currency.
   * Returns null if conversion is not possible - NO FALLBACKS.
   */
  const convertToUserCurrency = (amount: number | string, fromCurrency: CurrencyCode): number | null => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numAmount)) return null;
    
    const rate = getRateToUserCurrency(fromCurrency);
    if (rate === null) {
      return null; // NO FALLBACK - rate unavailable
    }
    return numAmount * rate;
  };

  /**
   * Format a price for display in user's preferred currency.
   * Returns error indicator if conversion fails - NO FALLBACKS.
   */
  const formatPrice = (
    amount: number | string, 
    fromCurrency: CurrencyCode = 'USD',
    options?: { showCode?: boolean; minimumFractionDigits?: number; maximumFractionDigits?: number }
  ): string => {
    const convertedAmount = convertToUserCurrency(amount, fromCurrency);
    
    // If conversion failed, return error indicator
    if (convertedAmount === null) {
      return '—'; // Em dash indicates unavailable
    }
    
    return formatCurrency({
      currency: userCurrency,
      amount: convertedAmount,
      showCode: options?.showCode ?? false,
      minimumFractionDigits: options?.minimumFractionDigits ?? 2,
      maximumFractionDigits: options?.maximumFractionDigits ?? 2,
    });
  };

  /**
   * Format price with currency code appended.
   * Returns error indicator if conversion fails.
   */
  const formatPriceWithCode = (amount: number | string, fromCurrency: CurrencyCode = 'USD'): string => {
    return formatPrice(amount, fromCurrency, { showCode: true });
  };

  /**
   * Get a display string for the exchange rate between two currencies.
   * Returns null if rate not available.
   */
  const getDisplayRate = (fromCurrency: CurrencyCode, toCurrency: CurrencyCode): string | null => {
    if (fromCurrency === toCurrency) return '1.0000';
    
    if (!hasRates) return null;
    
    // Find direct rate or calculate cross-rate
    const directRate = rates.find(r => 
      r.baseCurrency === fromCurrency && r.targetCurrency === toCurrency && r.isActive
    );
    if (directRate) return parseFloat(directRate.rate).toFixed(4);
    
    // Try inverse
    const inverseRate = rates.find(r => 
      r.baseCurrency === toCurrency && r.targetCurrency === fromCurrency && r.isActive
    );
    if (inverseRate) return (1 / parseFloat(inverseRate.rate)).toFixed(4);
    
    // Cross-rate through USD
    const fromToUSD = rates.find(r => 
      (r.baseCurrency === 'USD' && r.targetCurrency === fromCurrency) ||
      (r.baseCurrency === fromCurrency && r.targetCurrency === 'USD')
    );
    const usdToTarget = rates.find(r => 
      (r.baseCurrency === 'USD' && r.targetCurrency === toCurrency) ||
      (r.baseCurrency === toCurrency && r.targetCurrency === 'USD')
    );
    
    if (fromToUSD && usdToTarget) {
      // Calculate cross-rate
      let fromUsdRate: number;
      let toUsdRate: number;
      
      if (fromToUSD.baseCurrency === 'USD') {
        fromUsdRate = parseFloat(fromToUSD.rate); // USD → from (e.g., 18.5 for ZAR)
      } else {
        fromUsdRate = 1 / parseFloat(fromToUSD.rate);
      }
      
      if (usdToTarget.baseCurrency === 'USD') {
        toUsdRate = parseFloat(usdToTarget.rate); // USD → to
      } else {
        toUsdRate = 1 / parseFloat(usdToTarget.rate);
      }
      
      // from → USD → to = toUsdRate / fromUsdRate
      return (toUsdRate / fromUsdRate).toFixed(4);
    }
    
    return null;
  };

  return {
    userCurrency,
    isLoading,
    hasRates,
    ratesError,
    isRateStale,
    rateLastUpdated,
    convertToUserCurrency,
    formatPrice,
    formatPriceWithCode,
    getCurrencySymbol: () => getCurrencySymbol(userCurrency),
    getDisplayRate,
    rates,
  };
}
