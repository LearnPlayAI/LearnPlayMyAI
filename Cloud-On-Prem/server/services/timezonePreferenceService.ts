// @ts-nocheck
import { db } from '../db';
import { users, type User, userOrganizationRoles, organizations } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';
import { canonicalizeTimezone, isValidIanaTimezone, resolveEffectiveTimezone } from '../utils/timezone';

export interface TimezoneConversionResult {
  originalDate: Date;
  userTimezone: string;
  convertedDate: Date;
  formattedDate: string;
}

export class TimezonePreferenceService {
  private static async getTimezoneContext(userId: string): Promise<{ userTimezone: string | null; organizationTimezone: string | null }> {
    const [user] = await db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new Error('User not found');
    }

    const [orgRole] = await db
      .select({ timezone: organizations.timezone })
      .from(userOrganizationRoles)
      .innerJoin(organizations, eq(userOrganizationRoles.organizationId, organizations.id))
      .where(eq(userOrganizationRoles.userId, userId))
      .orderBy(desc(userOrganizationRoles.createdAt))
      .limit(1);

    return {
      userTimezone: user.timezone ?? null,
      organizationTimezone: orgRole?.timezone ?? null,
    };
  }

  /**
   * Get user's timezone preference
   */
  static async getUserTimezone(userId: string): Promise<string> {
    const context = await this.getTimezoneContext(userId);
    return resolveEffectiveTimezone(context.userTimezone, context.organizationTimezone);
  }

  /**
   * Update user's timezone preference
   */
  static async updateUserTimezone(userId: string, timezone: string): Promise<User> {
    const normalizedTimezone = canonicalizeTimezone(timezone);
    if (!normalizedTimezone || !isValidIanaTimezone(normalizedTimezone)) {
      throw new Error('Invalid timezone');
    }

    const updated = await db
      .update(users)
      .set({ timezone: normalizedTimezone })
      .where(eq(users.id, userId))
      .returning();

    if (!updated.length) {
      throw new Error('User not found');
    }

    console.log(`User ${userId} timezone updated to ${normalizedTimezone}`);

    return updated[0];
  }

  /**
   * Convert UTC date to user's timezone
   */
  static async convertToUserTimezone(
    userId: string,
    utcDate: Date,
    formatString: string = 'PPpp'
  ): Promise<TimezoneConversionResult> {
    const userTimezone = await this.getUserTimezone(userId);

    // Convert to user timezone
    const convertedDate = toZonedTime(utcDate, userTimezone);

    // Format the date
    const formattedDate = formatInTimeZone(utcDate, userTimezone, formatString);

    return {
      originalDate: utcDate,
      userTimezone,
      convertedDate,
      formattedDate,
    };
  }

  /**
   * Convert user's timezone date to UTC
   */
  static async convertFromUserTimezone(
    userId: string,
    userDate: Date
  ): Promise<Date> {
    const userTimezone = await this.getUserTimezone(userId);

    // Convert from user timezone to UTC
    return fromZonedTime(userDate, userTimezone);
  }

  /**
   * Batch convert multiple dates to user timezone
   */
  static async batchConvertToUserTimezone(
    userId: string,
    utcDates: Date[],
    formatString: string = 'PPpp'
  ): Promise<TimezoneConversionResult[]> {
    const userTimezone = await this.getUserTimezone(userId);

    return utcDates.map((utcDate) => {
      const convertedDate = toZonedTime(utcDate, userTimezone);
      const formattedDate = formatInTimeZone(utcDate, userTimezone, formatString);

      return {
        originalDate: utcDate,
        userTimezone,
        convertedDate,
        formattedDate,
      };
    });
  }

  /**
   * Format date in user's timezone
   */
  static async formatDateInUserTimezone(
    userId: string,
    utcDate: Date,
    formatString: string = 'PPpp'
  ): Promise<string> {
    const userTimezone = await this.getUserTimezone(userId);
    return formatInTimeZone(utcDate, userTimezone, formatString);
  }

  /**
   * Get user's current date/time
   */
  static async getUserCurrentDateTime(userId: string): Promise<{
    utc: Date;
    userTimezone: string;
    userDateTime: Date;
    formatted: string;
  }> {
    const userTimezone = await this.getUserTimezone(userId);
    const utc = new Date();
    const userDateTime = toZonedTime(utc, userTimezone);
    const formatted = formatInTimeZone(utc, userTimezone, 'PPpp');

    return {
      utc,
      userTimezone,
      userDateTime,
      formatted,
    };
  }

  /**
   * Get available timezones (common ones)
   */
  static getCommonTimezones(): Array<{ value: string; label: string; offset: string }> {
    return [
      { value: 'UTC', label: 'UTC (Coordinated Universal Time)', offset: '+00:00' },
      { value: 'America/New_York', label: 'Eastern Time (US)', offset: '-05:00' },
      { value: 'America/Chicago', label: 'Central Time (US)', offset: '-06:00' },
      { value: 'America/Denver', label: 'Mountain Time (US)', offset: '-07:00' },
      { value: 'America/Los_Angeles', label: 'Pacific Time (US)', offset: '-08:00' },
      { value: 'Europe/London', label: 'London (GMT)', offset: '+00:00' },
      { value: 'Europe/Paris', label: 'Paris (CET)', offset: '+01:00' },
      { value: 'Africa/Johannesburg', label: 'Johannesburg (SAST)', offset: '+02:00' },
      { value: 'Asia/Dubai', label: 'Dubai (GST)', offset: '+04:00' },
      { value: 'Asia/Kolkata', label: 'India (IST)', offset: '+05:30' },
      { value: 'Asia/Shanghai', label: 'China (CST)', offset: '+08:00' },
      { value: 'Asia/Tokyo', label: 'Tokyo (JST)', offset: '+09:00' },
      { value: 'Australia/Sydney', label: 'Sydney (AEST)', offset: '+10:00' },
      { value: 'Pacific/Auckland', label: 'Auckland (NZST)', offset: '+12:00' },
    ];
  }

  /**
   * Detect user's timezone from browser (for frontend integration)
   * This method just returns a helper function description
   */
  static getBrowserTimezoneDetectionHelper(): string {
    return 'Use Intl.DateTimeFormat().resolvedOptions().timeZone in browser JavaScript';
  }

  /**
   * Get complete user preferences (timezone, currency, notification settings)
   */
  static async getUserPreferences(userId: string): Promise<{
    timezone: string;
    preferredCurrency: string;
    emailNotifications: boolean;
    pushNotifications: boolean;
  }> {
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user.length) {
      throw new Error('User not found');
    }

    const context = await this.getTimezoneContext(userId);

    return {
      timezone: resolveEffectiveTimezone(context.userTimezone, context.organizationTimezone),
      preferredCurrency: user[0].preferredCurrency || 'ZAR',
      emailNotifications: true,
      pushNotifications: true,
    };
  }

  /**
   * Set user timezone (alias for updateUserTimezone for API consistency)
   */
  static async setTimezone(userId: string, timezone: string): Promise<User> {
    return this.updateUserTimezone(userId, timezone);
  }

  /**
   * Set user currency preference
   */
  static async setCurrency(userId: string, currency: 'ZAR' | 'USD' | 'EUR'): Promise<User> {
    const updated = await db
      .update(users)
      .set({ preferredCurrency: currency })
      .where(eq(users.id, userId))
      .returning();

    if (!updated.length) {
      throw new Error('User not found');
    }

    console.log(`User ${userId} preferredCurrency updated to ${currency}`);

    return updated[0];
  }

  /**
   * Get purchase history with timezone conversion
   */
  static async getPurchaseHistoryWithTimezone(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Array<any>> {
    const { db: dbInstance } = await import('../db');
    const { coursePurchases, courses } = await import('@shared/schema');
    const { eq: eqOp, desc: descOp } = await import('drizzle-orm');

    const userTimezone = await this.getUserTimezone(userId);

    // Get purchases
    const purchases = await dbInstance
      .select({
        id: coursePurchases.id,
        courseId: coursePurchases.courseId,
        courseName: courses.name,
        purchasePrice: coursePurchases.purchasePrice,
        purchaseCurrency: coursePurchases.purchaseCurrency,
        purchasedAt: coursePurchases.purchasedAt,
      })
      .from(coursePurchases)
      .leftJoin(courses, eqOp(coursePurchases.courseId, courses.id))
      .where(eqOp(coursePurchases.userId, userId))
      .orderBy(descOp(coursePurchases.purchasedAt))
      .limit(limit)
      .offset(offset);

    // Convert dates to user timezone
    return purchases.map((purchase) => ({
      ...purchase,
      purchasedAtFormatted: purchase.purchasedAt
        ? formatInTimeZone(purchase.purchasedAt, userTimezone, 'PPpp')
        : null,
      timezone: userTimezone,
    }));
  }
}
