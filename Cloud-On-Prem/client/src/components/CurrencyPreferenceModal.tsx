import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, invalidateCurrencyPreferenceCaches } from '@/lib/queryClient';
import { Coins, Globe, DollarSign } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

type CurrencyCode = 'ZAR' | 'USD' | 'EUR';

interface CurrencyOption {
  code: CurrencyCode;
  name: string;
  symbol: string;
  flag: string;
  description: string;
}

const CURRENCY_OPTIONS: CurrencyOption[] = [
  {
    code: 'ZAR',
    name: 'South African Rand',
    symbol: 'R',
    flag: '🇿🇦',
    description: 'Default currency for the platform',
  },
  {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    flag: '🇺🇸',
    description: 'Prices converted from ZAR',
  },
  {
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    flag: '🇪🇺',
    description: 'Prices converted from ZAR',
  },
];

interface CurrencyPreferenceModalProps {
  open: boolean;
  onClose: () => void;
}

export function CurrencyPreferenceModal({ open, onClose }: CurrencyPreferenceModalProps) {
  const { userPreferences } = useAuth();
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>('ZAR');
  const { toast } = useToast();

  // Initialize selected currency from user preferences when modal opens
  useEffect(() => {
    if (open && userPreferences?.preferredCurrency) {
      setSelectedCurrency(userPreferences.preferredCurrency as CurrencyCode);
    }
  }, [open, userPreferences?.preferredCurrency]);

  const updateCurrencyMutation = useMutation({
    mutationFn: async (currency: CurrencyCode) => {
      return apiRequest('/api/user/preferences/currency', {
        method: 'PUT',
        body: JSON.stringify({ currency }),
      });
    },
    onSuccess: (data) => {
      // Invalidate all price-displaying caches to reflect new currency preference
      invalidateCurrencyPreferenceCaches();
      toast({
        title: 'Currency preference saved',
        description: `Your prices will now be displayed in ${selectedCurrency}`,
      });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to save preference',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    updateCurrencyMutation.mutate(selectedCurrency);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md mx-auto" data-testid="currency-preference-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Globe className="h-5 w-5 text-primary" />
            Choose Your Display Currency
          </DialogTitle>
          <DialogDescription className="text-sm sm:text-base">
            Select your preferred currency for viewing prices. All platform prices are in South African Rand (ZAR) and will be converted to your selected currency using live exchange rates.
          </DialogDescription>
        </DialogHeader>

        <div className="py-3 sm:py-4">
          <RadioGroup
            value={selectedCurrency}
            onValueChange={(value) => setSelectedCurrency(value as CurrencyCode)}
            className="space-y-3"
          >
            {CURRENCY_OPTIONS.map((option) => (
              <div
                key={option.code}
                className={`flex items-center space-x-3 rounded-lg border p-3 sm:p-4 min-h-[48px] cursor-pointer touch-manipulation transition-all ${
                  selectedCurrency === option.code
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-border/60'
                }`}
                onClick={() => setSelectedCurrency(option.code)}
                data-testid={`currency-option-${option.code.toLowerCase()}`}
              >
                <RadioGroupItem value={option.code} id={option.code} />
                <Label htmlFor={option.code} className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className="text-xl sm:text-2xl">{option.flag}</span>
                    <div>
                      <div className="font-medium flex items-center gap-1 sm:gap-2 text-sm sm:text-base">
                        {option.name}
                        <span className="text-muted-foreground">({option.symbol})</span>
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground">{option.description}</p>
                    </div>
                  </div>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2 pb-[env(safe-area-inset-bottom)]">
          <Button variant="outline" onClick={onClose} className="min-h-[48px] sm:min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid="button-cancel-currency" >
            Skip for now
          </Button>
          <Button onClick={handleSave} disabled={updateCurrencyMutation.isPending} className="min-h-[48px] sm:min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid="button-save-currency" >
            {updateCurrencyMutation.isPending ? (
              <>
                <Coins className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <DollarSign className="h-4 w-4 mr-2" />
                Save Preference
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
