import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowRight, Info } from 'lucide-react';
import { useCurrencyDisplay, type CurrencyCode } from '@/hooks/useCurrencyDisplay';
import { formatCurrency } from '@/lib/currency';

interface CurrencyConversionTooltipProps {
  amount: number | string;
  fromCurrency: CurrencyCode;
  children: React.ReactNode;
  showZAR?: boolean;
  className?: string;
}

export function CurrencyConversionTooltip({
  amount,
  fromCurrency,
  children,
  showZAR = true,
  className = ''
}: CurrencyConversionTooltipProps) {
  const { displayCurrency, getConversionDetails, isLoading } = useCurrencyDisplay();

  if (isLoading) return <>{children}</>;

  const details = getConversionDetails(amount, fromCurrency);
  const needsConversion = fromCurrency !== displayCurrency || (showZAR && displayCurrency !== 'ZAR');

  if (!needsConversion) return <>{children}</>;

  if (details.convertedAmount === null || details.exchangeRate === null) {
    return <>{children}</>;
  }

  const originalFormatted = formatCurrency({
    currency: fromCurrency,
    amount: details.originalAmount,
    showCode: true,
  });

  const displayFormatted = formatCurrency({
    currency: displayCurrency,
    amount: details.convertedAmount,
    showCode: true,
  });

  const zarFormatted = showZAR && displayCurrency !== 'ZAR' && details.zarAmount !== null ? formatCurrency({
    currency: 'ZAR',
    amount: details.zarAmount,
    showCode: true,
  }) : null;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <span className={`cursor-help ${className}`} data-testid="tooltip-currency-conversion">
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent 
          className="max-w-xs p-3"
          data-testid="tooltip-content-currency-conversion"
        >
          <div className="space-y-2 text-sm">
            {fromCurrency !== displayCurrency && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{originalFormatted}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium">{displayFormatted}</span>
              </div>
            )}
            {fromCurrency !== displayCurrency && (
              <div className="text-xs text-muted-foreground">
                Rate: 1 {fromCurrency} = {details.exchangeRate.toFixed(4)} {displayCurrency}
              </div>
            )}
            {zarFormatted && displayCurrency !== 'ZAR' && (
              <div className="pt-1 border-t border-border">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Info className="h-3 w-3" />
                  <span>Settlement: {zarFormatted}</span>
                </div>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface DualCurrencyDisplayProps {
  amount: number | string;
  fromCurrency: CurrencyCode;
  showSettlement?: boolean;
  primarySize?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function DualCurrencyDisplay({
  amount,
  fromCurrency,
  showSettlement = true,
  primarySize = 'md',
  className = ''
}: DualCurrencyDisplayProps) {
  const { displayCurrency, getConversionDetails, formatPrice, formatInZAR } = useCurrencyDisplay();

  const details = getConversionDetails(amount, fromCurrency);
  const primaryPrice = formatPrice(amount, fromCurrency);
  const zarPrice = formatInZAR(amount, fromCurrency);

  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg font-semibold',
  };

  const needsSettlementDisplay = showSettlement && displayCurrency !== 'ZAR';

  return (
    <CurrencyConversionTooltip amount={amount} fromCurrency={fromCurrency} showZAR={showSettlement}>
      <div className={`flex flex-col ${className}`} data-testid="dual-currency-display">
        <span className={sizeClasses[primarySize]}>{primaryPrice}</span>
        {needsSettlementDisplay && (
          <span className="text-xs text-muted-foreground">
            ≈ {zarPrice} at checkout
          </span>
        )}
      </div>
    </CurrencyConversionTooltip>
  );
}
