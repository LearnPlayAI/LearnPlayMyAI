import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Globe, Building2 } from 'lucide-react';
import { useAdminCurrencyToggle, type CurrencyCode } from '@/hooks/useCurrencyDisplay';
import { getCurrencyName } from '@/lib/currency';

interface AdminCurrencyToggleProps {
  showPlatformCurrency: boolean;
  onToggle: (showPlatform: boolean) => void;
  userCurrency: CurrencyCode;
  compact?: boolean;
  className?: string;
}

export function AdminCurrencyToggle({
  showPlatformCurrency,
  onToggle,
  userCurrency,
  compact = false,
  className = ''
}: AdminCurrencyToggleProps) {
  const platformCurrency: CurrencyCode = 'ZAR';

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`} data-testid="admin-currency-toggle">
        <button
          onClick={() => onToggle(true)}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${
            showPlatformCurrency
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted hover:bg-muted/80 text-muted-foreground'
          }`}
          data-testid="button-toggle-platform-currency"
        >
          <Building2 className="h-3 w-3" />
          ZAR
        </button>
        <button
          onClick={() => onToggle(false)}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${
            !showPlatformCurrency
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted hover:bg-muted/80 text-muted-foreground'
          }`}
          data-testid="button-toggle-user-currency"
        >
          <Globe className="h-3 w-3" />
          {userCurrency}
        </button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg bg-muted/50 ${className}`} data-testid="admin-currency-toggle">
      <div className="flex items-center gap-2">
        <Globe className={`h-4 w-4 ${!showPlatformCurrency ? 'text-primary' : 'text-muted-foreground'}`} />
        <span className={`text-sm ${!showPlatformCurrency ? 'font-medium' : 'text-muted-foreground'}`}>
          My Currency ({userCurrency})
        </span>
      </div>
      
      <Switch
        checked={showPlatformCurrency}
        onCheckedChange={onToggle}
        data-testid="switch-currency-toggle"
      />
      
      <div className="flex items-center gap-2">
        <Building2 className={`h-4 w-4 ${showPlatformCurrency ? 'text-primary' : 'text-muted-foreground'}`} />
        <span className={`text-sm ${showPlatformCurrency ? 'font-medium' : 'text-muted-foreground'}`}>
          Platform (ZAR)
        </span>
      </div>

      <Badge variant="outline" className="ml-2 text-xs">
        {showPlatformCurrency ? 'Viewing in ZAR' : `Viewing in ${userCurrency}`}
      </Badge>
    </div>
  );
}

export function useAdminCurrencyToggleState(defaultToPlatformCurrency: boolean = true) {
  return useAdminCurrencyToggle(defaultToPlatformCurrency);
}
