import { getSystemTimezone, isValidIanaTimezone, resolveEffectiveTimezone } from './timezone';

export const FALLBACK_CURRENCY = 'ZAR' as const;
export const VALID_CURRENCIES = ['ZAR', 'USD', 'EUR'] as const;

export type EffectiveLocaleCurrency = typeof VALID_CURRENCIES[number];
export type EffectiveLocaleSource = 'user' | 'organization' | 'runtime_default';

export interface EffectiveLocaleInput {
  userTimezone?: string | null;
  organizationTimezone?: string | null;
  userCurrency?: string | null;
  organizationCurrency?: string | null;
  runtimeTimezone?: string | null;
  runtimeCurrency?: string | null;
}

export interface EffectiveLocale {
  timezone: string;
  currency: EffectiveLocaleCurrency;
  timezoneSource: EffectiveLocaleSource;
  currencySource: EffectiveLocaleSource;
}

function normalizeCurrency(currency: string | null | undefined): EffectiveLocaleCurrency | null {
  if (!currency) return null;
  const normalized = currency.trim().toUpperCase();
  return (VALID_CURRENCIES as readonly string[]).includes(normalized)
    ? (normalized as EffectiveLocaleCurrency)
    : null;
}

export function getRuntimeDefaultCurrency(runtimeCurrency?: string | null): EffectiveLocaleCurrency {
  return normalizeCurrency(runtimeCurrency)
    ?? normalizeCurrency(process.env.LEARNPLAY_DEFAULT_CURRENCY)
    ?? FALLBACK_CURRENCY;
}

export function resolveEffectiveCurrency(
  userCurrency: string | null | undefined,
  organizationCurrency: string | null | undefined,
  runtimeCurrency?: string | null,
): { currency: EffectiveLocaleCurrency; source: EffectiveLocaleSource } {
  const normalizedUser = normalizeCurrency(userCurrency);
  if (normalizedUser) {
    return { currency: normalizedUser, source: 'user' };
  }

  const normalizedOrganization = normalizeCurrency(organizationCurrency);
  if (normalizedOrganization) {
    return { currency: normalizedOrganization, source: 'organization' };
  }

  return {
    currency: getRuntimeDefaultCurrency(runtimeCurrency),
    source: 'runtime_default',
  };
}

export function resolveEffectiveLocale(input: EffectiveLocaleInput): EffectiveLocale {
  const resolvedTimezone = resolveEffectiveTimezone(
    input.userTimezone,
    input.organizationTimezone ?? input.runtimeTimezone ?? getSystemTimezone(),
  );
  const timezoneSource: EffectiveLocaleSource = input.userTimezone && isValidIanaTimezone(input.userTimezone)
    ? 'user'
    : input.organizationTimezone && isValidIanaTimezone(input.organizationTimezone)
      ? 'organization'
      : 'runtime_default';

  const resolvedCurrency = resolveEffectiveCurrency(
    input.userCurrency,
    input.organizationCurrency,
    input.runtimeCurrency,
  );

  return {
    timezone: resolvedTimezone,
    currency: resolvedCurrency.currency,
    timezoneSource,
    currencySource: resolvedCurrency.source,
  };
}
