export const FALLBACK_TIMEZONE = "UTC";

const TIMEZONE_ALIAS_MAP: Record<string, string> = {
  SAST: "Africa/Johannesburg",
  GMT: "UTC",
  Z: "UTC",
};

export function canonicalizeTimezone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const alias = TIMEZONE_ALIAS_MAP[trimmed.toUpperCase()];
  return alias ?? trimmed;
}

export function isValidIanaTimezone(timezone: string | null | undefined): boolean {
  const normalized = canonicalizeTimezone(timezone);
  if (!normalized) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: normalized });
    return true;
  } catch {
    return false;
  }
}

export function getSystemTimezone(): string {
  const candidates = [
    process.env.LEARNPLAY_TIMEZONE,
    process.env.TZ,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ];

  for (const candidate of candidates) {
    const normalized = canonicalizeTimezone(candidate);
    if (normalized && isValidIanaTimezone(normalized)) {
      return normalized;
    }
  }

  return FALLBACK_TIMEZONE;
}

export function resolveEffectiveTimezone(
  userTimezone: string | null | undefined,
  organizationTimezone: string | null | undefined,
): string {
  const normalizedUser = canonicalizeTimezone(userTimezone);
  if (normalizedUser && isValidIanaTimezone(normalizedUser)) {
    return normalizedUser;
  }

  const normalizedOrg = canonicalizeTimezone(organizationTimezone);
  if (normalizedOrg && isValidIanaTimezone(normalizedOrg)) {
    return normalizedOrg;
  }

  return getSystemTimezone();
}
