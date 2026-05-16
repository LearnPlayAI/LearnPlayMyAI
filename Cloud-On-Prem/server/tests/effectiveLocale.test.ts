import { describe, expect, it } from '@jest/globals';

import { resolveEffectiveCurrency, resolveEffectiveLocale } from '../utils/effectiveLocale';

describe('effective locale resolver', () => {
  it('prefers user timezone and currency over organization values', () => {
    const locale = resolveEffectiveLocale({
      userTimezone: 'Africa/Johannesburg',
      organizationTimezone: 'UTC',
      userCurrency: 'eur',
      organizationCurrency: 'ZAR',
      runtimeCurrency: 'USD',
    });

    expect(locale).toEqual({
      timezone: 'Africa/Johannesburg',
      currency: 'EUR',
      timezoneSource: 'user',
      currencySource: 'user',
    });
  });

  it('falls back to organization settings when user settings are absent or invalid', () => {
    const locale = resolveEffectiveLocale({
      userTimezone: 'Mars/Base',
      organizationTimezone: 'Europe/Berlin',
      userCurrency: 'btc',
      organizationCurrency: 'USD',
    });

    expect(locale).toEqual({
      timezone: 'Europe/Berlin',
      currency: 'USD',
      timezoneSource: 'organization',
      currencySource: 'organization',
    });
  });

  it('uses runtime defaults for cloud-style sessions with no user or org overrides', () => {
    const originalTimezone = process.env.LEARNPLAY_TIMEZONE;
    const originalCurrency = process.env.LEARNPLAY_DEFAULT_CURRENCY;
    process.env.LEARNPLAY_TIMEZONE = 'UTC';
    process.env.LEARNPLAY_DEFAULT_CURRENCY = 'EUR';

    expect(resolveEffectiveCurrency(null, null)).toEqual({
      currency: 'EUR',
      source: 'runtime_default',
    });

    expect(resolveEffectiveLocale({
      userTimezone: null,
      organizationTimezone: null,
      userCurrency: null,
      organizationCurrency: null,
    })).toEqual({
      timezone: 'UTC',
      currency: 'EUR',
      timezoneSource: 'runtime_default',
      currencySource: 'runtime_default',
    });

    process.env.LEARNPLAY_TIMEZONE = originalTimezone;
    process.env.LEARNPLAY_DEFAULT_CURRENCY = originalCurrency;
  });

  it('preserves the known onprem org-ZAR fallback when user currency is absent', () => {
    const locale = resolveEffectiveLocale({
      userTimezone: null,
      organizationTimezone: 'Africa/Johannesburg',
      userCurrency: null,
      organizationCurrency: 'ZAR',
      runtimeTimezone: 'UTC',
      runtimeCurrency: 'USD',
    });

    expect(locale).toEqual({
      timezone: 'Africa/Johannesburg',
      currency: 'ZAR',
      timezoneSource: 'organization',
      currencySource: 'organization',
    });
  });
});
