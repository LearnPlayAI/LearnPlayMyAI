import { formatCurrency, getCurrencySymbol } from '@/lib/currency';

export type CurrencyCode = 'ZAR' | 'USD' | 'EUR';

interface ChartCurrencyFormatterOptions {
  activeCurrency: CurrencyCode;
  fromCurrency?: CurrencyCode;
  exchangeRate?: number;
  compact?: boolean;
  showCode?: boolean;
}

export function createChartCurrencyFormatter(options: ChartCurrencyFormatterOptions) {
  const { 
    activeCurrency, 
    fromCurrency = 'ZAR', 
    exchangeRate = 1,
    compact = false,
    showCode = false
  } = options;

  return (value: number | string): string => {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) return formatCurrency({ currency: activeCurrency, amount: 0 });

    let convertedValue = numValue;
    if (fromCurrency !== activeCurrency && exchangeRate !== 1) {
      convertedValue = numValue * exchangeRate;
    }

    if (compact) {
      return formatCompactCurrency(convertedValue, activeCurrency, showCode);
    }

    return formatCurrency({
      currency: activeCurrency,
      amount: convertedValue,
      showCode,
    });
  };
}

export function formatCompactCurrency(
  amount: number, 
  currency: CurrencyCode,
  showCode: boolean = false
): string {
  const symbol = getCurrencySymbol(currency);
  const code = showCode ? ` ${currency}` : '';

  if (amount >= 1_000_000) {
    return `${symbol}${(amount / 1_000_000).toFixed(1)}M${code}`;
  }
  if (amount >= 1_000) {
    return `${symbol}${(amount / 1_000).toFixed(1)}K${code}`;
  }
  return `${symbol}${amount.toFixed(2)}${code}`;
}

export function createChartTooltipFormatter(options: ChartCurrencyFormatterOptions) {
  const formatter = createChartCurrencyFormatter({ ...options, compact: false });
  
  return (value: number | string, name?: string): [string, string] => {
    const formattedValue = formatter(value);
    return [formattedValue, name || ''];
  };
}

export function createChartAxisFormatter(options: ChartCurrencyFormatterOptions) {
  return createChartCurrencyFormatter({ ...options, compact: true });
}

export function createChartLabelFormatter(options: ChartCurrencyFormatterOptions) {
  return (value: number | string): string => {
    return createChartCurrencyFormatter(options)(value);
  };
}

interface DualCurrencyTooltipFormatterOptions {
  displayCurrency: CurrencyCode;
  displayRate: number;
  settlementCurrency?: CurrencyCode;
  settlementRate?: number;
}

export function createDualCurrencyTooltipFormatter(options: DualCurrencyTooltipFormatterOptions) {
  const { 
    displayCurrency, 
    displayRate = 1,
    settlementCurrency = 'ZAR',
    settlementRate = 1
  } = options;

  return (value: number | string, name?: string): string[] => {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) return ['R0.00', name || ''];

    const displayAmount = numValue * displayRate;
    const displayFormatted = formatCurrency({
      currency: displayCurrency,
      amount: displayAmount,
      showCode: true,
    });

    if (displayCurrency === settlementCurrency) {
      return [displayFormatted, name || ''];
    }

    const settlementAmount = numValue * settlementRate;
    const settlementFormatted = formatCurrency({
      currency: settlementCurrency,
      amount: settlementAmount,
      showCode: true,
    });

    return [`${displayFormatted} (${settlementFormatted})`, name || ''];
  };
}

export const CHART_CURRENCY_COLORS = {
  ZAR: 'var(--chart-2, var(--success))',
  USD: 'var(--chart-1, var(--action-primary))',
  EUR: 'var(--chart-3, var(--action-accent))',
} as const;
