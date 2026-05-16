import { formatDistanceToNow } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

export type DateInput = Date | string | number | null | undefined;

const FALLBACK_TIMEZONE = 'UTC';
let activeTimezone = FALLBACK_TIMEZONE;
let patchInstalled = false;

function isValidTimezone(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function toDate(value: DateInput): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function detectBrowserTimezone(): string {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isValidTimezone(detected) ? detected : FALLBACK_TIMEZONE;
}

function normalizeTimezone(timezone: string | null | undefined): string {
  if (isValidTimezone(timezone)) {
    return timezone;
  }
  if (isValidTimezone(activeTimezone)) {
    return activeTimezone;
  }
  return detectBrowserTimezone();
}

function mergeTimezoneOption(options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  if (options?.timeZone) {
    return options;
  }
  return { ...(options ?? {}), timeZone: activeTimezone };
}

function normalizeLocaleArgs(
  localesOrOptions?: Intl.LocalesArgument | Intl.DateTimeFormatOptions,
  options?: Intl.DateTimeFormatOptions
): { locales?: Intl.LocalesArgument; options?: Intl.DateTimeFormatOptions } {
  if (
    options === undefined
    && localesOrOptions
    && typeof localesOrOptions === 'object'
    && !Array.isArray(localesOrOptions)
    && !(localesOrOptions instanceof Intl.Locale)
  ) {
    return {
      locales: undefined,
      options: localesOrOptions as Intl.DateTimeFormatOptions,
    };
  }

  return {
    locales: localesOrOptions as Intl.LocalesArgument,
    options,
  };
}

export function getActiveTimezone(): string {
  return activeTimezone;
}

export function setActiveTimezone(timezone: string | null | undefined): string {
  activeTimezone = normalizeTimezone(timezone);
  return activeTimezone;
}

export function formatDateInput(
  value: DateInput,
  pattern = 'PPpp',
  fallback = '-'
): string {
  const date = toDate(value);
  if (!date) return fallback;
  return formatInTimeZone(date, activeTimezone, pattern);
}

export function formatDateDistanceToNow(
  value: DateInput,
  options?: Parameters<typeof formatDistanceToNow>[1],
  fallback = '-'
): string {
  const date = toDate(value);
  if (!date) return fallback;
  return formatDistanceToNow(date, options);
}

export function toTimezoneLocaleString(
  value: DateInput,
  locales?: Intl.LocalesArgument | Intl.DateTimeFormatOptions,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = toDate(value);
  if (!date) return '-';
  const args = normalizeLocaleArgs(locales, options);
  return date.toLocaleString(args.locales, mergeTimezoneOption(args.options));
}

export function toTimezoneLocaleDateString(
  value: DateInput,
  locales?: Intl.LocalesArgument | Intl.DateTimeFormatOptions,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = toDate(value);
  if (!date) return '-';
  const args = normalizeLocaleArgs(locales, options);
  return date.toLocaleDateString(args.locales, mergeTimezoneOption(args.options));
}

export function toTimezoneLocaleTimeString(
  value: DateInput,
  locales?: Intl.LocalesArgument | Intl.DateTimeFormatOptions,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = toDate(value);
  if (!date) return '-';
  const args = normalizeLocaleArgs(locales, options);
  return date.toLocaleTimeString(args.locales, mergeTimezoneOption(args.options));
}

export function installDateLocaleTimezonePatch(): void {
  if (patchInstalled) return;
  patchInstalled = true;

  const originalToLocaleString = Date.prototype.toLocaleString;
  const originalToLocaleDateString = Date.prototype.toLocaleDateString;
  const originalToLocaleTimeString = Date.prototype.toLocaleTimeString;

  Date.prototype.toLocaleString = function toLocaleStringPatched(
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions
  ): string {
    return originalToLocaleString.call(this, locales, mergeTimezoneOption(options));
  };

  Date.prototype.toLocaleDateString = function toLocaleDateStringPatched(
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions
  ): string {
    return originalToLocaleDateString.call(this, locales, mergeTimezoneOption(options));
  };

  Date.prototype.toLocaleTimeString = function toLocaleTimeStringPatched(
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions
  ): string {
    return originalToLocaleTimeString.call(this, locales, mergeTimezoneOption(options));
  };
}

export const tzFormat = formatDateInput;
export const tzFormatDistanceToNow = formatDateDistanceToNow;
export const tzToLocaleString = toTimezoneLocaleString;
export const tzToLocaleDateString = toTimezoneLocaleDateString;
export const tzToLocaleTimeString = toTimezoneLocaleTimeString;
