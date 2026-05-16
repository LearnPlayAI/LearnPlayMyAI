import type { CustomCopy, LocalizedString } from '@shared/schema';

function resolveLocalizedValue(value: LocalizedString | undefined, languageCode: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return value[languageCode] ?? value['en'] ?? Object.values(value)[0] ?? undefined;
  }
  return undefined;
}

export function resolveCustomCopy(
  customCopy: Record<string, any> | CustomCopy | undefined | null,
  languageCode: string
): Record<string, string | undefined> {
  if (!customCopy) return {};

  const resolved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(customCopy)) {
    resolved[key] = resolveLocalizedValue(value as LocalizedString | undefined, languageCode);
  }
  return resolved;
}
