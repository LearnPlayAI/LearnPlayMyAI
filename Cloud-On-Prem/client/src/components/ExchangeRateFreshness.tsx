import { AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useCurrencyDisplay } from '@/hooks/useCurrencyDisplay';
import { tzFormatDistanceToNow } from '@/utils/timezoneRuntime';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

interface ExchangeRateFreshnessProps {
  showWhenFresh?: boolean;
  compact?: boolean;
  className?: string;
}

export function ExchangeRateFreshness({ 
  showWhenFresh = false,
  compact = false,
  className = ''
}: ExchangeRateFreshnessProps) {
  const { isRateStale, rateLastUpdated, isLoading } = useCurrencyDisplay();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['/api/currency/rates'] });
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  if (isLoading) return null;

  const lastUpdatedText = rateLastUpdated 
    ? tzFormatDistanceToNow(rateLastUpdated, { addSuffix: true })
    : 'unknown';

  if (isRateStale) {
    return (
      <Alert variant="destructive" className={`${className}`} data-testid="alert-rate-stale" >
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between flex-wrap gap-2">
          <span>
            Exchange rates may be outdated (last updated {lastUpdatedText}). 
            Prices shown may not reflect current rates.
          </span>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing} data-testid="button-refresh-rates" >
            <RefreshCw className={`h-3 w-3 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!showWhenFresh) return null;

  if (compact) {
    return (
      <div 
        className={`flex items-center gap-1 text-xs text-muted-foreground ${className}`}
        data-testid="text-rate-freshness"
      >
        <Clock className="h-3 w-3" />
        <span>Rates updated {lastUpdatedText}</span>
      </div>
    );
  }

  return (
    <div 
      className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}
      data-testid="text-rate-freshness"
    >
      <Clock className="h-4 w-4" />
      <span>Exchange rates updated {lastUpdatedText}</span>
    </div>
  );
}

export function RateFreshnessIndicator({ className = '' }: { className?: string }) {
  const { isRateStale, rateLastUpdated } = useCurrencyDisplay();

  if (!rateLastUpdated) return null;

  const lastUpdatedText = tzFormatDistanceToNow(rateLastUpdated, { addSuffix: true });

  return (
    <div 
      className={`flex items-center gap-1 text-xs ${
        isRateStale ? 'text-destructive' : 'text-muted-foreground'
      } ${className}`}
      title={`Last updated: ${rateLastUpdated.toLocaleString()}`}
      data-testid="indicator-rate-freshness"
    >
      {isRateStale ? (
        <AlertTriangle className="h-3 w-3" />
      ) : (
        <Clock className="h-3 w-3" />
      )}
      <span>{lastUpdatedText}</span>
    </div>
  );
}
