import { Badge } from '@/components/ui/badge';
import { Globe } from 'lucide-react';
import { useCurrencyDisplay, type CurrencyCode } from '@/hooks/useCurrencyDisplay';
import { getCurrencyName } from '@/lib/currency';

interface CurrencyIndicatorBadgeProps {
  currency?: CurrencyCode;
  showIcon?: boolean;
  variant?: 'default' | 'outline' | 'secondary';
  className?: string;
}

export function CurrencyIndicatorBadge({ 
  currency,
  showIcon = true,
  variant = 'outline',
  className = ''
}: CurrencyIndicatorBadgeProps) {
  const { displayCurrency } = useCurrencyDisplay();
  const activeCurrency = currency || displayCurrency;
  const currencyName = getCurrencyName(activeCurrency);

  return (
    <Badge variant={variant} className={`text-xs font-normal ${className}`} data-testid="badge-currency-indicator" >
      {showIcon && <Globe className="h-3 w-3 mr-1" />}
      Prices in {activeCurrency}
    </Badge>
  );
}

interface CurrencySelectorBadgeProps {
  onCurrencyChange: (currency: CurrencyCode) => void;
  currentCurrency: CurrencyCode;
  availableCurrencies?: CurrencyCode[];
  className?: string;
}

export function CurrencySelectorBadge({
  onCurrencyChange,
  currentCurrency,
  availableCurrencies = ['ZAR', 'USD', 'EUR'],
  className = ''
}: CurrencySelectorBadgeProps) {
  return (
    <div className={`flex items-center gap-1 ${className}`} data-testid="currency-selector">
      <Globe className="h-3.5 w-3.5 text-muted-foreground" />
      <div className="flex gap-1">
        {availableCurrencies.map((currency) => (
          <button
            key={currency}
            onClick={() => onCurrencyChange(currency)}
            className={`px-2 py-0.5 text-xs rounded-md transition-colors ${
              currentCurrency === currency
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            }`}
            data-testid={`button-currency-${currency.toLowerCase()}`}
          >
            {currency}
          </button>
        ))}
      </div>
    </div>
  );
}
