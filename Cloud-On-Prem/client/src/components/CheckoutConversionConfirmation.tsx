import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowRight, AlertTriangle, Clock, Lock, CreditCard, RefreshCw, Loader2, CheckCircle2 } from 'lucide-react';
import { useCurrencyDisplay, type CurrencyCode } from '@/hooks/useCurrencyDisplay';
import { formatCurrency } from '@/lib/currency';
import { tzFormatDistanceToNow } from '@/utils/timezoneRuntime';

interface CheckoutConversionConfirmationProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  amount: number;
  platformFee?: number;
  subtotal?: number;
  fromCurrency: CurrencyCode;
  itemName: string;
  itemType: 'course' | 'license' | 'credits';
  isLoading?: boolean;
}

export function CheckoutConversionConfirmation({
  isOpen,
  onConfirm,
  onCancel,
  amount,
  platformFee = 0,
  subtotal,
  fromCurrency,
  itemName,
  itemType,
  isLoading = false,
}: CheckoutConversionConfirmationProps) {
  const { displayCurrency, getConversionDetails, getExchangeRate, isRateStale, rateLastUpdated, refreshRates, isRefreshingRates } = useCurrencyDisplay();
  const [hasRefreshedOnOpen, setHasRefreshedOnOpen] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isRatesRefreshed, setIsRatesRefreshed] = useState(false);

  useEffect(() => {
    if (isOpen && !hasRefreshedOnOpen) {
      setRefreshError(null);
      setIsRatesRefreshed(false);
      refreshRates()
        .then(() => {
          setHasRefreshedOnOpen(true);
          setIsRatesRefreshed(true);
        })
        .catch((err) => {
          setRefreshError('Failed to refresh exchange rates. Using cached rates.');
          setHasRefreshedOnOpen(true);
          setIsRatesRefreshed(false);
        });
    }
    if (!isOpen) {
      setHasRefreshedOnOpen(false);
      setRefreshError(null);
      setIsRatesRefreshed(false);
    }
  }, [isOpen, hasRefreshedOnOpen, refreshRates]);

  const handleManualRefresh = async () => {
    setRefreshError(null);
    setIsRatesRefreshed(false);
    try {
      await refreshRates();
      setIsRatesRefreshed(true);
    } catch (err) {
      setRefreshError('Failed to refresh exchange rates.');
      setIsRatesRefreshed(false);
    }
  };

  const conversionDetails = getConversionDetails(amount, fromCurrency);
  const needsConversion = displayCurrency !== 'ZAR';
  const hasValidRates = conversionDetails.hasValidRates || displayCurrency === 'ZAR';

  // For ZAR-priced items with non-ZAR display currency:
  // We need to show the user's currency equivalent → ZAR actual payment
  const zarAmount = fromCurrency === 'ZAR' ? amount : conversionDetails.zarAmount;
  
  // Calculate subtotal and fee in ZAR for display (for courses with platform fees)
  let zarSubtotal = subtotal !== undefined ? (fromCurrency === 'ZAR' ? subtotal : getConversionDetails(subtotal, fromCurrency).zarAmount) : null;
  let zarPlatformFee = platformFee !== undefined && platformFee > 0 ? (fromCurrency === 'ZAR' ? platformFee : platformFee * (zarAmount !== null && subtotal !== undefined ? zarAmount / subtotal : 1)) : 0;
  
  const zarFormatted = zarAmount !== null
    ? formatCurrency({
        currency: 'ZAR',
        amount: zarAmount,
        showCode: true,
      })
    : '—';
  
  const zarSubtotalFormatted = zarSubtotal !== null
    ? formatCurrency({
        currency: 'ZAR',
        amount: zarSubtotal,
        showCode: true,
      })
    : null;
  
  const zarPlatformFeeFormatted = zarPlatformFee > 0
    ? formatCurrency({
        currency: 'ZAR',
        amount: zarPlatformFee,
        showCode: true,
      })
    : null;

  // Get the rate from user's display currency to ZAR (for display purposes)
  const userCurrencyToZarRate = getExchangeRate(displayCurrency, 'ZAR');
  
  // Calculate the user's display currency equivalent of the ZAR amount
  const userCurrencyEquivalent = zarAmount !== null && userCurrencyToZarRate !== null && userCurrencyToZarRate > 0
    ? zarAmount / userCurrencyToZarRate
    : null;

  const userCurrencyFormatted = needsConversion && userCurrencyEquivalent !== null
    ? formatCurrency({
        currency: displayCurrency,
        amount: userCurrencyEquivalent,
        showCode: true,
      })
    : null;

  const rateLastUpdatedText = rateLastUpdated
    ? tzFormatDistanceToNow(rateLastUpdated, { addSuffix: true })
    : 'recently';

  const getItemTypeLabel = () => {
    switch (itemType) {
      case 'course': return 'Course Purchase';
      case 'license': return 'License Subscription';
      case 'credits': return 'LP Credits Purchase';
      default: return 'Purchase';
    }
  };

  const isRefreshing = isRefreshingRates || (isOpen && !hasRefreshedOnOpen);
  const ratesAvailable = needsConversion ? (userCurrencyToZarRate !== null && userCurrencyEquivalent !== null) : true;
  const canConfirm = !isLoading && !isRefreshing && ratesAvailable;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-checkout-confirmation">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Confirm {getItemTypeLabel()}
          </DialogTitle>
          <DialogDescription>
            Review your payment details before proceeding to checkout.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isRefreshing ? (
            <div className="p-4 rounded-lg bg-muted/50 flex items-center justify-center gap-2" data-testid="rates-loading">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm text-muted-foreground">Fetching latest exchange rates...</span>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-muted/50 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Item</span>
                <span className="font-medium" data-testid="text-checkout-item">{itemName}</span>
              </div>
              
              {needsConversion ? (
                <>
                  {zarSubtotalFormatted && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Subtotal</span>
                      <span className="font-medium">{zarSubtotalFormatted}</span>
                    </div>
                  )}
                  
                  {zarPlatformFeeFormatted && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Platform Fee (5%)</span>
                      <span className="text-sm">{zarPlatformFeeFormatted}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-center gap-2 text-sm py-2 border-t border-b border-border">
                    <span className="text-muted-foreground">{userCurrencyFormatted || '—'}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold text-primary" data-testid="text-checkout-zar-amount">{zarFormatted}</span>
                  </div>
                  
                  {hasValidRates && userCurrencyToZarRate !== null && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Lock className="h-3 w-3" />
                      <span>
                        Rate: 1 {displayCurrency} = {userCurrencyToZarRate.toFixed(4)} ZAR
                      </span>
                    </div>
                  )}

                  {userCurrencyFormatted && (
                    <div className="text-xs text-muted-foreground">
                      Equivalent to {userCurrencyFormatted}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  {zarSubtotalFormatted && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Subtotal</span>
                      <span className="font-medium">{zarSubtotalFormatted}</span>
                    </div>
                  )}
                  
                  {zarPlatformFeeFormatted && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Platform Fee (5%)</span>
                      <span className="text-sm">{zarPlatformFeeFormatted}</span>
                    </div>
                  )}
                  
                  <div className="flex justify-between items-center pt-2 border-t border-border">
                    <span className="text-sm text-muted-foreground">Total Amount</span>
                    <span className="font-semibold text-lg" data-testid="text-checkout-amount">{zarFormatted}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {refreshError && (
            <Alert variant="destructive" data-testid="alert-refresh-error">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{refreshError}</AlertDescription>
            </Alert>
          )}

          {needsConversion && !isRefreshing && !ratesAvailable && (
            <Alert variant="destructive" data-testid="alert-rates-unavailable">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Exchange rates are currently unavailable. Cannot process payment without valid rates.
              </AlertDescription>
            </Alert>
          )}

          {needsConversion && !isRefreshing && !refreshError && ratesAvailable && (
            <>
              {isRatesRefreshed && !isRateStale ? (
                <div 
                  className="bg-success/10 border border-success/30 text-success dark:text-success p-3 rounded-lg flex items-center gap-2"
                  data-testid="alert-rate-success"
                >
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm">Exchange rates are current. Updated just now.</span>
                </div>
              ) : isRateStale ? (
                <div 
                  className="bg-warning/10 border border-[var(--warning)]/30 text-warning dark:text-warning p-3 rounded-lg flex items-center justify-between gap-2"
                  data-testid="alert-rate-stale"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    <span className="text-sm">Exchange rates may be outdated. Click refresh to get the latest rates.</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleManualRefresh} disabled={isRefreshingRates} className="h-7 px-2 text-xs shrink-0" data-testid="button-refresh-rates" >
                    <RefreshCw className={`h-3 w-3 mr-1 ${isRefreshingRates ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              ) : null}
            </>
          )}

          {needsConversion && !isRefreshing && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3" />
                <span data-testid="text-rate-updated">Rates updated {rateLastUpdatedText}</span>
              </div>
              {!isRateStale && (
                <Button variant="ghost" size="sm" onClick={handleManualRefresh} disabled={isRefreshingRates} className="h-6 px-2 text-xs" data-testid="button-refresh-rates-secondary" >
                  <RefreshCw className={`h-3 w-3 mr-1 ${isRefreshingRates ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              )}
            </div>
          )}

          <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg">
            <p className="font-medium mb-1">Payment Processing</p>
            <p>
              All payments are processed in South African Rand (ZAR) through our secure payment provider YOCO. 
              {needsConversion && ` The exchange rate shown is locked at the time of checkout.`}
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isLoading} data-testid="button-cancel-checkout" >
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={!canConfirm} className="gap-2" data-testid="button-confirm-checkout" >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : isRefreshing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading rates...
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" />
                Pay {zarFormatted}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface UseCheckoutConfirmationProps {
  amount: number;
  fromCurrency: CurrencyCode;
  itemName: string;
  itemType: 'course' | 'license' | 'credits';
}

export function useCheckoutConfirmation() {
  const { getExchangeRate, hasRates } = useCurrencyDisplay();

  const getLockedRateData = (fromCurrency: CurrencyCode) => {
    const rate = getExchangeRate(fromCurrency, 'ZAR');
    if (rate === null) {
      console.warn('[Checkout] Cannot lock rate - exchange rates unavailable');
      return null;
    }
    return {
      exchangeRate: rate.toString(),
      rateLockedAt: new Date().toISOString(),
      originalCurrency: fromCurrency,
    };
  };

  return {
    getLockedRateData,
    hasRates,
  };
}
