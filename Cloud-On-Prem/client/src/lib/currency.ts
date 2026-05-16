type CurrencyCode = 'ZAR' | 'USD' | 'EUR';

interface CurrencyFormatOptions {
  currency: CurrencyCode;
  amount: string | number;
  showCode?: boolean;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

const currencySymbols: Record<CurrencyCode, string> = {
  ZAR: 'R',
  USD: '$',
  EUR: '€',
};

const currencyLocales: Record<CurrencyCode, string> = {
  ZAR: 'en-ZA',
  USD: 'en-US',
  EUR: 'de-DE',
};

export function formatCurrency({
  currency,
  amount,
  showCode = false,
  minimumFractionDigits = 2,
  maximumFractionDigits = 2,
}: CurrencyFormatOptions): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(numAmount)) {
    return `${currencySymbols[currency]}0.00`;
  }

  const formatted = new Intl.NumberFormat(currencyLocales[currency], {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(numAmount);

  const symbol = currencySymbols[currency];
  const code = showCode ? ` ${currency}` : '';

  return `${symbol}${formatted}${code}`;
}

export function parseCurrencyAmount(value: string): number {
  const cleaned = value.replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

export interface FXSnapshot {
  originalAmount?: string;
  originalCurrency?: CurrencyCode;
  exchangeRate?: string;
  convertedAmount: string;
  convertedCurrency: CurrencyCode;
}

export function formatFXSnapshot(snapshot: FXSnapshot): {
  primary: string;
  secondary: string | null;
  rate: string | null;
} {
  const primary = formatCurrency({
    currency: snapshot.convertedCurrency,
    amount: snapshot.convertedAmount,
    showCode: true,
  });

  if (!snapshot.originalAmount || !snapshot.originalCurrency || !snapshot.exchangeRate) {
    return { primary, secondary: null, rate: null };
  }

  const secondary = formatCurrency({
    currency: snapshot.originalCurrency,
    amount: snapshot.originalAmount,
    showCode: true,
  });

  const rate = `@ ${snapshot.exchangeRate}`;

  return { primary, secondary, rate };
}

export function getCurrencySymbol(currency: CurrencyCode): string {
  return currencySymbols[currency];
}

export function getCurrencyName(currency: CurrencyCode): string {
  const names: Record<CurrencyCode, string> = {
    ZAR: 'South African Rand',
    USD: 'US Dollar',
    EUR: 'Euro',
  };
  return names[currency];
}
