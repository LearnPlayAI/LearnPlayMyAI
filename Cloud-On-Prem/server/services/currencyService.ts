import { db } from '../db';
import { currencyConversionRates, type InsertCurrencyConversionRate, type CurrencyConversionRate } from '@shared/schema';
import { eq, and, desc, ne } from 'drizzle-orm';

type CurrencyCode = 'ZAR' | 'USD' | 'EUR';

export interface ExchangeRatesResponse {
  base: string;
  rates: Record<string, number>;
  timestamp: number;
}

export class CurrencyService {
  private static readonly SUPPORTED_CURRENCIES = ['ZAR', 'USD', 'EUR'] as const satisfies readonly CurrencyCode[];
  private static readonly PRIMARY_API = 'https://api.exchangerate-api.com/v4/latest/USD';
  private static readonly FALLBACK_API = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json';

  private static readonly SUPPORTED_PAIRS: Array<{ base: CurrencyCode; target: CurrencyCode }> = [
    { base: 'USD', target: 'ZAR' },
    { base: 'USD', target: 'EUR' },
    { base: 'ZAR', target: 'USD' },
    { base: 'EUR', target: 'USD' },
    { base: 'ZAR', target: 'EUR' },
    { base: 'EUR', target: 'ZAR' },
  ];

  private static pairKey(base: CurrencyCode, target: CurrencyCode): string {
    return `${base}->${target}`;
  }

  private static async getLatestRatesByPair(): Promise<Map<string, CurrencyConversionRate>> {
    const rows = await db.query.currencyConversionRates.findMany({
      where: eq(currencyConversionRates.isActive, true),
      orderBy: [desc(currencyConversionRates.lastUpdated)],
    });

    const latest = new Map<string, CurrencyConversionRate>();
    for (const row of rows) {
      const key = this.pairKey(row.baseCurrency as CurrencyCode, row.targetCurrency as CurrencyCode);
      if (!latest.has(key)) {
        latest.set(key, row);
      }
    }
    return latest;
  }

  private static async deactivateDuplicateActiveRates(): Promise<number> {
    const latestByPair = await this.getLatestRatesByPair();
    let deactivated = 0;

    for (const pair of this.SUPPORTED_PAIRS) {
      const key = this.pairKey(pair.base, pair.target);
      const keep = latestByPair.get(key);
      if (!keep) continue;

      const result = await db
        .update(currencyConversionRates)
        .set({ isActive: false })
        .where(
          and(
            eq(currencyConversionRates.baseCurrency, pair.base),
            eq(currencyConversionRates.targetCurrency, pair.target),
            eq(currencyConversionRates.isActive, true),
            ne(currencyConversionRates.id, keep.id),
          ),
        )
        .returning({ id: currencyConversionRates.id });

      deactivated += result.length;
    }

    return deactivated;
  }

  /**
   * Fetch latest exchange rates from external API with fallback
   * Returns rates with USD as base currency
   */
  static async fetchLatestRates(): Promise<ExchangeRatesResponse> {
    try {
      const response = await fetch(this.PRIMARY_API, {
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Primary API failed with status ${response.status}`);
      }

      const data = await response.json();
      
      return {
        base: 'USD',
        rates: {
          USD: 1,
          ZAR: data.rates.ZAR || 0,
          EUR: data.rates.EUR || 0,
        },
        timestamp: data.time_last_updated || Date.now(),
      };
    } catch (primaryError) {
      console.warn('Primary exchange rate API failed, trying fallback:', primaryError);
      
      try {
        const response = await fetch(this.FALLBACK_API);
        
        if (!response.ok) {
          throw new Error(`Fallback API failed with status ${response.status}`);
        }

        const data = await response.json();
        const usdRates = data.usd;

        return {
          base: 'USD',
          rates: {
            USD: 1,
            ZAR: usdRates.zar || 0,
            EUR: usdRates.eur || 0,
          },
          timestamp: Date.now(),
        };
      } catch (fallbackError) {
        console.error('Both exchange rate APIs failed:', fallbackError);
        throw new Error('Failed to fetch exchange rates from all sources');
      }
    }
  }

  /**
   * Update exchange rates in the database (automatic source)
   * Only updates rates with source='auto', skips manual overrides
   */
  static async updateAutomaticRates(options?: {
    forceOverwriteManual?: boolean;
    cleanupDuplicates?: boolean;
  }): Promise<{ updated: number; changed: number; unchanged: number; failed: number; skippedManual: number; duplicatesDeactivated: number }> {
    try {
      const ratesData = await this.fetchLatestRates();
      const now = new Date();
      let updated = 0;
      let changed = 0;
      let unchanged = 0;
      let failed = 0;
      let skippedManual = 0;
      let duplicatesDeactivated = 0;
      const forceOverwriteManual = options?.forceOverwriteManual === true;
      const cleanupDuplicates = options?.cleanupDuplicates !== false;

      const usdToZar = ratesData.rates.ZAR;
      const usdToEur = ratesData.rates.EUR;

      if (!usdToZar || !usdToEur || usdToZar === 0 || usdToEur === 0) {
        throw new Error('Invalid rates from API');
      }

      const allPairs: Array<{ base: CurrencyCode; target: CurrencyCode; rate: number }> = [
        { base: 'USD', target: 'ZAR', rate: usdToZar },
        { base: 'USD', target: 'EUR', rate: usdToEur },
        { base: 'ZAR', target: 'USD', rate: 1 / usdToZar },
        { base: 'EUR', target: 'USD', rate: 1 / usdToEur },
        { base: 'ZAR', target: 'EUR', rate: usdToEur / usdToZar },
        { base: 'EUR', target: 'ZAR', rate: usdToZar / usdToEur },
      ];

      const latestByPair = await this.getLatestRatesByPair();

      for (const pair of allPairs) {
        try {
          const existingRate = latestByPair.get(this.pairKey(pair.base, pair.target)) || null;
          const normalizedRate = pair.rate.toFixed(8);
          const existingRateValue = existingRate ? Number(existingRate.rate) : null;
          const nextRateValue = Number(normalizedRate);
          const isChanged = existingRateValue === null || Math.abs(existingRateValue - nextRateValue) > 0.0000000001;

          if (existingRate?.source === 'manual' && !forceOverwriteManual) {
            console.log(`Skipping ${pair.base}→${pair.target} - manual override in effect`);
            skippedManual++;
            continue;
          }

          if (existingRate) {
            await db.update(currencyConversionRates)
              .set({ 
                rate: normalizedRate,
                source: 'auto',
                updatedBy: null,
                lastUpdated: now,
              })
              .where(eq(currencyConversionRates.id, existingRate.id));
            latestByPair.set(this.pairKey(pair.base, pair.target), {
              ...existingRate,
              rate: normalizedRate,
              source: 'auto',
              updatedBy: null,
              lastUpdated: now,
            });
          } else if (!existingRate) {
            const inserted = await db.insert(currencyConversionRates).values({
              baseCurrency: pair.base,
              targetCurrency: pair.target,
              rate: normalizedRate,
              source: 'auto',
              isActive: true,
              lastUpdated: now,
            }).returning();
            if (inserted[0]) {
              latestByPair.set(this.pairKey(pair.base, pair.target), inserted[0]);
            }
          }

          updated++;
          if (isChanged) {
            changed++;
          } else {
            unchanged++;
          }
        } catch (pairError) {
          console.error(`Failed to update ${pair.base}→${pair.target}:`, pairError);
          failed++;
        }
      }

      if (cleanupDuplicates) {
        duplicatesDeactivated = await this.deactivateDuplicateActiveRates();
      }

      console.log(
        `Exchange rates updated: ${updated} currency pairs (${changed} changed, ${unchanged} unchanged), ` +
        `${failed} failed, ${skippedManual} skipped manual, ${duplicatesDeactivated} duplicates deactivated`
      );
      return { updated, changed, unchanged, failed, skippedManual, duplicatesDeactivated };
    } catch (error) {
      console.error('Failed to update automatic exchange rates:', error);
      throw error;
    }
  }

  /**
   * SuperAdmin manual override of exchange rate
   */
  static async manualOverride(
    baseCurrency: CurrencyCode,
    targetCurrency: CurrencyCode,
    rate: string,
    updatedBy: string,
    _reason?: string,
  ): Promise<CurrencyConversionRate> {
    const existingRate = await db.query.currencyConversionRates.findFirst({
      where: and(
        eq(currencyConversionRates.baseCurrency, baseCurrency),
        eq(currencyConversionRates.targetCurrency, targetCurrency),
        eq(currencyConversionRates.isActive, true)
      ),
    });

    if (existingRate) {
      const updated = await db.update(currencyConversionRates)
        .set({
          rate,
          source: 'manual',
          updatedBy,
          lastUpdated: new Date(),
        })
        .where(eq(currencyConversionRates.id, existingRate.id))
        .returning();
      
      console.log(`Manual rate override: ${baseCurrency}/${targetCurrency} = ${rate}`);
      return updated[0];
    } else {
      const inserted = await db.insert(currencyConversionRates).values({
        baseCurrency,
        targetCurrency,
        rate,
        source: 'manual',
        updatedBy,
        isActive: true,
      }).returning();

      console.log(`Manual rate created: ${baseCurrency}/${targetCurrency} = ${rate}`);
      return inserted[0];
    }
  }

  /**
   * Get latest exchange rate for a currency pair
   */
  static async getLatestRate(baseCurrency: CurrencyCode, targetCurrency: CurrencyCode): Promise<CurrencyConversionRate | null> {
    if (baseCurrency === targetCurrency) {
      return {
        id: 'same-currency',
        baseCurrency: baseCurrency as CurrencyCode,
        targetCurrency: targetCurrency as CurrencyCode,
        rate: '1.00000000',
        source: 'auto',
        lastUpdated: new Date(),
        updatedBy: null,
        isActive: true,
      };
    }

    const rate = await db.query.currencyConversionRates.findFirst({
      where: and(
        eq(currencyConversionRates.baseCurrency, baseCurrency),
        eq(currencyConversionRates.targetCurrency, targetCurrency),
        eq(currencyConversionRates.isActive, true)
      ),
    });

    return rate || null;
  }

  /**
   * Convert amount from one currency to another using latest rate
   */
  static async convertAmount(
    amount: string,
    baseCurrency: CurrencyCode,
    targetCurrency: CurrencyCode
  ): Promise<{ convertedAmount: string; rate: string }> {
    if (baseCurrency === targetCurrency) {
      return { convertedAmount: amount, rate: '1.00000000' };
    }

    const rate = await this.getLatestRate(baseCurrency, targetCurrency);
    
    if (!rate) {
      throw new Error(`No exchange rate found for ${baseCurrency}/${targetCurrency}`);
    }

    const amountNum = parseFloat(amount);
    const rateNum = parseFloat(rate.rate);
    const converted = (amountNum * rateNum).toFixed(4);

    return {
      convertedAmount: converted,
      rate: rate.rate,
    };
  }

  /**
   * Create immutable snapshot of all exchange rates for payout calculation
   * Returns a map of currency pairs to rates as of the snapshot time
   */
  static async snapshotRatesForPayout(): Promise<Record<string, string>> {
    const snapshot: Record<string, string> = {};

    for (const baseCurrency of this.SUPPORTED_CURRENCIES) {
      for (const targetCurrency of this.SUPPORTED_CURRENCIES) {
        if (baseCurrency === targetCurrency) continue;

        const rate = await this.getLatestRate(baseCurrency, targetCurrency);
        if (rate) {
          snapshot[`${baseCurrency}_${targetCurrency}`] = rate.rate;
        }
      }
    }

    return snapshot;
  }

  /**
   * Get all current exchange rates
   */
  static async getAllCurrentRates(): Promise<CurrencyConversionRate[]> {
    const latestByPair = await this.getLatestRatesByPair();
    const deduped = Array.from(latestByPair.values()).sort((a, b) => {
      const baseCmp = a.baseCurrency.localeCompare(b.baseCurrency);
      if (baseCmp !== 0) return baseCmp;
      return a.targetCurrency.localeCompare(b.targetCurrency);
    });
    return deduped;
  }

  /**
   * Check if any exchange rate is stale (older than 24 hours)
   * Returns staleness status and the most recent lastUpdated timestamp
   */
  static async checkRateStaleness(): Promise<{ isStale: boolean; lastUpdated: Date | null }> {
    const rates = await this.getAllCurrentRates();
    
    if (rates.length === 0) {
      return { isStale: true, lastUpdated: null };
    }

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    let mostRecentUpdate: Date | null = null;
    let hasStaleRate = false;

    for (const rate of rates) {
      if (!rate.lastUpdated) {
        hasStaleRate = true;
        continue;
      }
      const rateDate = new Date(rate.lastUpdated);
      
      if (!mostRecentUpdate || rateDate > mostRecentUpdate) {
        mostRecentUpdate = rateDate;
      }
      
      if (rateDate < twentyFourHoursAgo) {
        hasStaleRate = true;
      }
    }

    return {
      isStale: hasStaleRate,
      lastUpdated: mostRecentUpdate,
    };
  }

  /**
   * Get rate history for a currency pair
   */
  static async getRateHistory(
    baseCurrency: CurrencyCode,
    targetCurrency: CurrencyCode,
    limit: number = 100
  ): Promise<CurrencyConversionRate[]> {
    return await db.query.currencyConversionRates.findMany({
      where: and(
        eq(currencyConversionRates.baseCurrency, baseCurrency),
        eq(currencyConversionRates.targetCurrency, targetCurrency)
      ),
      orderBy: [desc(currencyConversionRates.lastUpdated)],
      limit,
    });
  }
}
