import { buildCanonicalStorageKey, isCanonicalStorageKey } from "./storageKeyManager";

function normalizeLanguageCode(input: string | null | undefined): string {
  const normalized = String(input || "en").trim().toLowerCase();
  return normalized || "en";
}

export function lessonPptxStorageKeyMatchesVersion(params: {
  storageKey: string;
  organizationId: string;
  lessonId: string;
  languageCode: string;
  version: number;
}): boolean {
  const storageKey = String(params.storageKey || "").trim();
  if (!storageKey || !Number.isFinite(params.version) || params.version <= 0) {
    return false;
  }

  const languageCode = normalizeLanguageCode(params.languageCode);

  if (isCanonicalStorageKey(storageKey)) {
    const expectedCanonicalKey = buildCanonicalStorageKey({
      scope: "private",
      domain: "lsn-pptx",
      extension: ".pptx",
      seed: `lesson-pptx:${params.organizationId}:${params.lessonId}:${languageCode}:v${params.version}`,
    });
    return storageKey === expectedCanonicalKey;
  }

  // Legacy absolute/relative path support:
  // Accept either .../<language>/v{n}.pptx or .../v{n}.pptx
  const escapedVersion = String(params.version).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const legacyVersionPattern = new RegExp(`(?:^|/)v${escapedVersion}\\.pptx(?:$|[?#])`, "i");
  return legacyVersionPattern.test(storageKey);
}
