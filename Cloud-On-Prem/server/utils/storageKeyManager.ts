import path from "path";
import { createHash, randomUUID } from "crypto";
import { getUploadDir } from "./uploadPaths";

export type StorageScope = "private" | "public";

type KeyParams = {
  scope: StorageScope;
  domain: string;
  extension?: string;
  seed?: string;
};

const MAX_DOMAIN_LEN = 12;

function normalizeDomain(input: string): string {
  const clean = String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_DOMAIN_LEN);
  return clean || "misc";
}

export function normalizeExtension(input?: string): string {
  const raw = String(input || "").trim().toLowerCase();
  if (!raw) return "";
  const ext = raw.startsWith(".") ? raw : `.${raw}`;
  if (!/^\.[a-z0-9]{1,8}$/.test(ext)) return "";
  return ext;
}

export function stableToken(seed?: string): string {
  if (seed && seed.trim()) {
    return createHash("sha1").update(seed).digest("hex").slice(0, 16);
  }
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

export function buildCanonicalStorageKey(params: KeyParams): string {
  const scope = params.scope === "public" ? "public" : "private";
  const domain = normalizeDomain(params.domain);
  const token = stableToken(params.seed);
  const ext = normalizeExtension(params.extension);
  const leaf = `${domain}-${token}${ext}`;
  return `/${scope}/k/${domain}/${token.slice(0, 2)}/${token.slice(2, 4)}/${leaf}`;
}

export function isCanonicalStorageKey(input: string): boolean {
  return /^\/(private|public)\/k\/[a-z0-9-]{1,12}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-z0-9-]{1,12}-[a-f0-9]{16}(\.[a-z0-9]{1,8})?$/.test(
    String(input || ""),
  );
}

export function canonicalKeyToAbsolutePath(key: string): string {
  const trimmed = String(key || "").trim();
  const rel = trimmed.replace(/^\/+/, "");
  return path.join(getUploadDir(), rel);
}

export function ensureCanonicalOrMapLegacy(params: {
  keyOrLegacyPath: string;
  fallbackScope: StorageScope;
  fallbackDomain: string;
  extension?: string;
  seed?: string;
}): string {
  if (isCanonicalStorageKey(params.keyOrLegacyPath)) {
    return params.keyOrLegacyPath;
  }
  return buildCanonicalStorageKey({
    scope: params.fallbackScope,
    domain: params.fallbackDomain,
    extension: params.extension,
    seed: params.seed || params.keyOrLegacyPath,
  });
}

export function requireNonEmptyStorageKey(
  value: string | null | undefined,
  context: string,
): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`[StorageKey] Missing required storage key (${context})`);
  }
  return normalized;
}
