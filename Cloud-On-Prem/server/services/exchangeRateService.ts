// @ts-nocheck
import { db } from '../db';
import {
  currencyConversionRates,
  exchangeRateHistory,
  financialAuditLog,
  platformConfiguration,
  type CurrencyConversionRate,
  type ExchangeRateHistory,
} from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import axios from 'axios';

export interface ExchangeRateUpdate {
  baseCurrency: 'ZAR' | 'USD' | 'EUR';
  targetCurrency: 'ZAR' | 'USD' | 'EUR';
  rate: number;
  source: 'auto' | 'manual';
  provider?: string;
}

export interface ManualOverrideInput {
  baseCurrency: 'ZAR' | 'USD' | 'EUR';
  targetCurrency: 'ZAR' | 'USD' | 'EUR';
  rate: number;
  reason: string;
  updatedBy: string;
}

export interface RateHistoryEntry {
  id: string;
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  source: string;
  provider: string | null;
  recordedAt: Date | null;
}

export class ExchangeRateService {
  /**
   * Get current exchange rate between two currencies
   */
  static async getRate(
    baseCurrency: 'ZAR' | 'USD' | 'EUR',
    targetCurrency: 'ZAR' | 'USD' | 'EUR'
  ): Promise<number> {
    if (baseCurrency === targetCurrency) return 1.0;

    const rate = await db
      .select()
      .from(currencyConversionRates)
      .where(
        and(
          eq(currencyConversionRates.baseCurrency, baseCurrency),
          eq(currencyConversionRates.targetCurrency, targetCurrency),
          eq(currencyConversionRates.isActive, true)
        )
      )
      .limit(1);

    if (!rate.length) {
      // Try reverse rate
      const reverseRate = await this.getRate(targetCurrency, baseCurrency);
      return reverseRate > 0 ? 1 / reverseRate : 0;
    }

    return parseFloat(rate[0].rate.toString());
  }

  /**
   * Convert amount between currencies
   */
  static async convert(
    amount: number,
    fromCurrency: 'ZAR' | 'USD' | 'EUR',
    toCurrency: 'ZAR' | 'USD' | 'EUR'
  ): Promise<number> {
    const rate = await this.getRate(fromCurrency, toCurrency);
    return amount * rate;
  }

  /**
   * Fetch live rates from ExchangeRate-API
   */
  static async fetchLiveRatesFromExchangeRateAPI(
    baseCurrency: 'USD' | 'EUR' | 'ZAR' = 'USD'
  ): Promise<Record<string, number>> {
    try {
      const response = await axios.get(
        `https://api.exchangerate-api.com/v4/latest/${baseCurrency}`,
        { timeout: 10000 }
      );

      if (response.data && response.data.rates) {
        console.log(`Fetched rates from ExchangeRate-API for ${baseCurrency}`);
        return response.data.rates;
      }

      throw new Error('Invalid response from ExchangeRate-API');
    } catch (error) {
      console.error('ExchangeRate-API fetch failed:', error);
      throw error;
    }
  }

  /**
   * Fetch live rates from Fawazahmed0 API (fallback)
   */
  static async fetchLiveRatesFromFawazahmed0(
    baseCurrency: 'usd' | 'eur' | 'zar' = 'usd'
  ): Promise<Record<string, number>> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await axios.get(
        `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${today}/v1/currencies/${baseCurrency}.json`,
        { timeout: 10000 }
      );

      if (response.data && response.data[baseCurrency]) {
        console.log(`Fetched rates from Fawazahmed0 for ${baseCurrency}`);
        return response.data[baseCurrency];
      }

      throw new Error('Invalid response from Fawazahmed0 API');
    } catch (error) {
      console.error('Fawazahmed0 API fetch failed:', error);
      throw error;
    }
  }

  /**
   * Update all currency rates from live APIs
   */
  static async updateAllRates(): Promise<void> {
    const currencies: Array<'ZAR' | 'USD' | 'EUR'> = ['USD', 'EUR', 'ZAR'];
    const updates: ExchangeRateUpdate[] = [];

    // Try primary API first (ExchangeRate-API)
    try {
      for (const base of currencies) {
        const rates = await this.fetchLiveRatesFromExchangeRateAPI(base);

        for (const target of currencies) {
          if (base !== target && rates[target]) {
            updates.push({
              baseCurrency: base,
              targetCurrency: target,
              rate: rates[target],
              source: 'auto',
              provider: 'ExchangeRate-API',
            });
          }
        }
      }
    } catch (error) {
      console.log('Primary API failed, trying fallback...');

      // Fallback to Fawazahmed0
      try {
        for (const base of currencies) {
          const lowerBase = base.toLowerCase() as 'usd' | 'eur' | 'zar';
          const rates = await this.fetchLiveRatesFromFawazahmed0(lowerBase);

          for (const target of currencies) {
            if (base !== target) {
              const lowerTarget = target.toLowerCase();
              if (rates[lowerTarget]) {
                updates.push({
                  baseCurrency: base,
                  targetCurrency: target,
                  rate: rates[lowerTarget],
                  source: 'auto',
                  provider: 'Fawazahmed0',
                });
              }
            }
          }
        }
      } catch (fallbackError) {
        console.error('Both exchange rate APIs failed:', fallbackError);
        throw new Error('Failed to fetch exchange rates from all sources');
      }
    }

    // Apply updates
    for (const update of updates) {
      await this.updateRate(update);
    }

    console.log(`Updated ${updates.length} exchange rates`);
  }

  /**
   * Update a single currency rate
   */
  static async updateRate(input: ExchangeRateUpdate): Promise<CurrencyConversionRate> {
    // Check if rate exists
    const existing = await db
      .select()
      .from(currencyConversionRates)
      .where(
        and(
          eq(currencyConversionRates.baseCurrency, input.baseCurrency),
          eq(currencyConversionRates.targetCurrency, input.targetCurrency)
        )
      )
      .limit(1);

    let updated: CurrencyConversionRate;

    if (existing.length > 0) {
      // Update existing rate
      const result = await db
        .update(currencyConversionRates)
        .set({
          rate: input.rate,
          source: input.source,
          lastUpdated: new Date(),
          updatedBy: input.source === 'manual' ? undefined : null,
        })
        .where(eq(currencyConversionRates.id, existing[0].id))
        .returning();

      updated = result[0];
    } else {
      // Insert new rate
      const result = await db
        .insert(currencyConversionRates)
        .values({
          baseCurrency: input.baseCurrency,
          targetCurrency: input.targetCurrency,
          rate: input.rate,
          source: input.source,
          lastUpdated: new Date(),
          updatedBy: null,
          isActive: true,
        })
        .returning();

      updated = result[0];
    }

    // Record in history
    await db.insert(exchangeRateHistory).values({
      baseCurrency: input.baseCurrency,
      targetCurrency: input.targetCurrency,
      rate: input.rate,
      source: input.source,
      provider: input.provider || 'system',
      recordedAt: new Date(),
    });

    return updated;
  }

  /**
   * Manual rate override with audit trail
   */
  static async manualOverride(input: ManualOverrideInput): Promise<CurrencyConversionRate> {
    // Validate rate is reasonable (not zero or negative)
    if (input.rate <= 0) {
      throw new Error('Invalid exchange rate: must be positive');
    }

    // Update the rate
    const updated = await this.updateRate({
      baseCurrency: input.baseCurrency,
      targetCurrency: input.targetCurrency,
      rate: input.rate,
      source: 'manual',
      provider: 'manual_override',
    });

    // Create audit trail
    await db.insert(financialAuditLog).values({
      action: 'exchange_rate_override',
      entityType: 'currency_rate',
      entityId: updated.id,
      performedBy: input.updatedBy,
      details: {
        baseCurrency: input.baseCurrency,
        targetCurrency: input.targetCurrency,
        newRate: input.rate,
        reason: input.reason,
      },
      ipAddress: null,
    });

    console.log(`Manual rate override: ${input.baseCurrency}/${input.targetCurrency} = ${input.rate} by ${input.updatedBy}`);

    return updated;
  }

  /**
   * Get rate history for a currency pair
   */
  static async getRateHistory(
    baseCurrency: 'ZAR' | 'USD' | 'EUR',
    targetCurrency: 'ZAR' | 'USD' | 'EUR',
    limit: number = 100
  ): Promise<RateHistoryEntry[]> {
    const history = await db
      .select()
      .from(exchangeRateHistory)
      .where(
        and(
          eq(exchangeRateHistory.baseCurrency, baseCurrency),
          eq(exchangeRateHistory.targetCurrency, targetCurrency)
        )
      )
      .orderBy(desc(exchangeRateHistory.recordedAt))
      .limit(limit);

    return history.map((h) => ({
      id: h.id,
      baseCurrency: h.baseCurrency,
      targetCurrency: h.targetCurrency,
      rate: parseFloat(h.rate.toString()),
      source: h.source,
      provider: h.provider,
      recordedAt: h.recordedAt,
    }));
  }

  /**
   * Get all current active rates
   */
  static async getAllActiveRates(): Promise<CurrencyConversionRate[]> {
    return await db
      .select()
      .from(currencyConversionRates)
      .where(eq(currencyConversionRates.isActive, true))
      .orderBy(currencyConversionRates.baseCurrency, currencyConversionRates.targetCurrency);
  }

  /**
   * Test API connectivity
   */
  static async testAPIConnection(): Promise<{
    primary: boolean;
    fallback: boolean;
    message: string;
  }> {
    let primaryOK = false;
    let fallbackOK = false;

    try {
      await this.fetchLiveRatesFromExchangeRateAPI('USD');
      primaryOK = true;
    } catch (error) {
      console.log('Primary API test failed');
    }

    try {
      await this.fetchLiveRatesFromFawazahmed0('usd');
      fallbackOK = true;
    } catch (error) {
      console.log('Fallback API test failed');
    }

    const message = primaryOK
      ? 'Primary API (ExchangeRate-API) is operational'
      : fallbackOK
      ? 'Primary API failed, but fallback (Fawazahmed0) is operational'
      : 'Both APIs are unreachable - exchange rates cannot be updated';

    return { primary: primaryOK, fallback: fallbackOK, message };
  }

  /**
   * Get exchange rate snapshot for a specific date (for historical reporting)
   */
  static async getRateSnapshot(
    date: Date
  ): Promise<Record<string, Record<string, number>>> {
    const snapshot: Record<string, Record<string, number>> = {
      USD: {},
      EUR: {},
      ZAR: {},
    };

    const currencies: Array<'ZAR' | 'USD' | 'EUR'> = ['USD', 'EUR', 'ZAR'];

    for (const base of currencies) {
      for (const target of currencies) {
        if (base !== target) {
          // Get the most recent rate at or before the specified date
          const history = await db
            .select()
            .from(exchangeRateHistory)
            .where(
              and(
                eq(exchangeRateHistory.baseCurrency, base),
                eq(exchangeRateHistory.targetCurrency, target),
                sql`${exchangeRateHistory.recordedAt} <= ${date}`
              )
            )
            .orderBy(desc(exchangeRateHistory.recordedAt))
            .limit(1);

          if (history.length > 0) {
            snapshot[base][target] = parseFloat(history[0].rate.toString());
          }
        }
      }
    }

    return snapshot;
  }

  /**
   * Check if automatic updates are enabled
   */
  static async isAutoUpdateEnabled(): Promise<boolean> {
    const config = await db
      .select()
      .from(platformConfiguration)
      .where(eq(platformConfiguration.key, 'AUTO_EXCHANGE_RATE_UPDATE'))
      .limit(1);

    return config.length > 0 && config[0].value === 'true';
  }

  /**
   * Get update frequency in seconds
   */
  static async getUpdateFrequency(): Promise<number> {
    const config = await db
      .select()
      .from(platformConfiguration)
      .where(eq(platformConfiguration.key, 'EXCHANGE_RATE_UPDATE_FREQUENCY'))
      .limit(1);

    return config.length > 0 ? parseInt(config[0].value) : 3600; // Default 1 hour
  }
}
