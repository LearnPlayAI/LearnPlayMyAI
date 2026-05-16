import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { systemSettings } from "@shared/schema";

const DEFAULT_MANAGED_KEYS = [
  "PODCAST_API_KEY",
  "GAMMA_API_KEY",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "ELEVENLABS_API_KEY",
  "MAILERSEND_API_KEY",
  "YOCO_SECRET_KEY",
  "YOCO_WEBHOOK_SECRET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
] as const;

const SECRET_KEY_NAME_PATTERN = /^[A-Z][A-Z0-9_]{2,127}$/;
const SECRET_LIKE_PATTERN = /(KEY|SECRET|TOKEN|PASSWORD)$/i;
const PLACEHOLDER_PATTERN = /^(your_|changeme|replace_me|example)/i;

export interface ManagedSecretSummary {
  key: string;
  configured: boolean;
  source: "env" | "system" | "both" | "none";
  envConfigured: boolean;
  systemConfigured: boolean;
  maskedValue: string | null;
  updatedAt: string | null;
}

function isSecretLikeKeyName(key: string): boolean {
  return SECRET_LIKE_PATTERN.test(key);
}

export function normalizeManagedSecretKey(rawKey: string): string {
  return String(rawKey || "").trim().toUpperCase();
}

export function validateManagedSecretKey(rawKey: string): { valid: boolean; error?: string; key?: string } {
  const key = normalizeManagedSecretKey(rawKey);
  if (!key) {
    return { valid: false, error: "Secret key name is required." };
  }
  if (!SECRET_KEY_NAME_PATTERN.test(key)) {
    return {
      valid: false,
      error: "Secret key name must be uppercase letters, numbers, and underscores only.",
    };
  }
  if (!isSecretLikeKeyName(key)) {
    return {
      valid: false,
      error: "Secret key name must end with KEY, SECRET, TOKEN, or PASSWORD.",
    };
  }
  return { valid: true, key };
}

function hasRealValue(value?: string | null): boolean {
  const trimmed = String(value || "").trim();
  return !!trimmed && !PLACEHOLDER_PATTERN.test(trimmed);
}

function maskSecret(value?: string | null): string | null {
  if (!hasRealValue(value)) return null;
  const trimmed = String(value || "").trim();
  if (trimmed.length <= 6) return "***";
  return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
}

function discoverSecretKeysFromEnvironment(): string[] {
  return [];
}

export async function listManagedSecrets(): Promise<ManagedSecretSummary[]> {
  const envKeys = discoverSecretKeysFromEnvironment();
  const allCandidateKeys = Array.from(new Set<string>([...DEFAULT_MANAGED_KEYS, ...envKeys])).sort();

  const settingsRows = allCandidateKeys.length > 0
    ? await db
      .select({
        settingKey: systemSettings.settingKey,
        settingValue: systemSettings.settingValue,
        updatedAt: systemSettings.updatedAt,
      })
      .from(systemSettings)
      .where(inArray(systemSettings.settingKey, allCandidateKeys))
    : [];

  const settingsMap = new Map(settingsRows.map((row) => [normalizeManagedSecretKey(row.settingKey), row]));

  const summaries: ManagedSecretSummary[] = allCandidateKeys.map((key) => {
    const envValue = process.env[key];
    const setting = settingsMap.get(key);
    const envConfigured = hasRealValue(envValue);
    const systemConfigured = hasRealValue(setting?.settingValue || null);
    const source: ManagedSecretSummary["source"] = envConfigured && systemConfigured
      ? "both"
      : envConfigured
        ? "env"
        : systemConfigured
          ? "system"
          : "none";
    const preferredMasked = maskSecret(setting?.settingValue) || maskSecret(envValue);

    return {
      key,
      configured: envConfigured || systemConfigured,
      source,
      envConfigured,
      systemConfigured,
      maskedValue: preferredMasked,
      updatedAt: setting?.updatedAt ? new Date(setting.updatedAt).toISOString() : null,
    };
  });

  return summaries;
}

export async function upsertManagedSecret(params: { key: string; value: string; userId?: string | null }): Promise<void> {
  const key = normalizeManagedSecretKey(params.key);
  await db
    .insert(systemSettings)
    .values({
      settingKey: key,
      settingValue: params.value,
      dataType: "string",
      description: `Managed secret key: ${key}`,
      updatedBy: params.userId || null,
    })
    .onConflictDoUpdate({
      target: systemSettings.settingKey,
      set: {
        settingValue: params.value,
        updatedBy: params.userId || null,
        updatedAt: new Date(),
      },
    });
}

export async function deleteManagedSecret(key: string): Promise<boolean> {
  const normalizedKey = normalizeManagedSecretKey(key);
  const deleted = await db
    .delete(systemSettings)
    .where(eq(systemSettings.settingKey, normalizedKey))
    .returning({ deletedKey: systemSettings.settingKey });

  return deleted.length > 0;
}

export async function getManagedSecretValue(key: string): Promise<string | null> {
  const normalizedKey = normalizeManagedSecretKey(key);
  const [setting] = await db
    .select({ settingValue: systemSettings.settingValue })
    .from(systemSettings)
    .where(eq(systemSettings.settingKey, normalizedKey))
    .limit(1);

  if (hasRealValue(setting?.settingValue || null)) {
    return String(setting!.settingValue).trim();
  }
  return null;
}
