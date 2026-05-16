import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { systemSettings } from "@shared/schema";
import { IntegrationAuditService } from "./integrationAuditService";
import { isOnPremMode } from "../featureFlags";
import { decideBootstrapEmailProvider } from "./configDurabilityPolicy";
import { decryptSecret, encryptSecret, maskSecret } from "../utils/secretCrypto";

export type IntegrationProvider = "mailersend" | "smtp" | "gemini" | "gamma" | "elevenlabs" | "yoco";
type SettingDataType = "string" | "number" | "boolean" | "json";

type ProviderSecretKey =
  | "apiKey"
  | "webhookSecret"
  | "password"
  | "testPublicKey"
  | "livePublicKey"
  | "testSecretKey"
  | "liveSecretKey";

type ProviderSettingDef = {
  key: string;
  type: SettingDataType;
  defaultValue: any;
  required?: boolean;
  label: string;
};

type ProviderDefinition = {
  provider: IntegrationProvider;
  label: string;
  secrets: Array<{ key: ProviderSecretKey; settingKey: string; required?: boolean; label: string }>;
  settings: ProviderSettingDef[];
};

const EMAIL_ACTIVE_PROVIDER_KEY = "INTEGRATION_EMAIL_ACTIVE_PROVIDER";
const INTEGRATION_BOOTSTRAP_DONE_KEY = "INTEGRATION_CONFIG_BOOTSTRAP_DONE";

const PROVIDERS: ProviderDefinition[] = [
  {
    provider: "mailersend",
    label: "MailerSend",
    secrets: [
      { key: "apiKey", settingKey: "INTEGRATION_MAILERSEND_SECRET_API_KEY", required: false, label: "API Key" },
    ],
    settings: [
      { key: "fromEmail", type: "string", defaultValue: "noreply@learnplay.co.za", required: true, label: "From Email" },
      { key: "fromName", type: "string", defaultValue: "LearnPlay", required: true, label: "From Name" },
      { key: "templateRenewalReminder", type: "string", defaultValue: "", label: "Template: Renewal Reminder" },
      { key: "templatePaymentSuccess", type: "string", defaultValue: "", label: "Template: Payment Success" },
      { key: "templatePaymentFailed", type: "string", defaultValue: "", label: "Template: Payment Failed" },
      { key: "templateGracePeriod", type: "string", defaultValue: "", label: "Template: Grace Period" },
      { key: "templateSuspension", type: "string", defaultValue: "", label: "Template: Suspension" },
      { key: "templateCreditConfirmation", type: "string", defaultValue: "", label: "Template: Credit Confirmation" },
      { key: "templateLicenseConfirmation", type: "string", defaultValue: "", label: "Template: License Confirmation" },
    ],
  },
  {
    provider: "smtp",
    label: "SMTP",
    secrets: [
      { key: "password", settingKey: "INTEGRATION_SMTP_SECRET_PASSWORD", required: false, label: "SMTP Password" },
    ],
    settings: [
      { key: "host", type: "string", defaultValue: "", required: false, label: "SMTP Host" },
      { key: "port", type: "number", defaultValue: 587, required: false, label: "SMTP Port" },
      { key: "secure", type: "boolean", defaultValue: false, required: false, label: "Use TLS" },
      { key: "username", type: "string", defaultValue: "", required: false, label: "SMTP Username" },
      { key: "fromEmail", type: "string", defaultValue: "noreply@learnplay.co.za", required: false, label: "From Email" },
      { key: "fromName", type: "string", defaultValue: "LearnPlay", required: false, label: "From Name" },
    ],
  },
  {
    provider: "gemini",
    label: "Google Gemini",
    secrets: [
      { key: "apiKey", settingKey: "INTEGRATION_GEMINI_SECRET_API_KEY", required: true, label: "API Key" },
    ],
    settings: [
      { key: "defaultTextModel", type: "string", defaultValue: "gemini-2.5-flash", required: true, label: "Default Text Model" },
      { key: "defaultImageModel", type: "string", defaultValue: "gemini-2.0-flash-exp", required: true, label: "Default Image Model" },
      { key: "thinkingScriptModel", type: "string", defaultValue: "gemini-2.5-pro", required: true, label: "Thinking Script Model (Podcast)" },
    ],
  },
  {
    provider: "gamma",
    label: "Gamma",
    secrets: [
      { key: "apiKey", settingKey: "INTEGRATION_GAMMA_SECRET_API_KEY", required: true, label: "API Key" },
    ],
    settings: [
      { key: "defaultThemeId", type: "string", defaultValue: "", label: "Default Theme ID" },
      { key: "defaultImageStyle", type: "string", defaultValue: "professional", label: "Default Image Style" },
      { key: "defaultIncludeSpeakerNotes", type: "boolean", defaultValue: true, label: "Default Include Speaker Notes" },
      { key: "providerMonthlyCostUsd", type: "number", defaultValue: 6, label: "Provider Monthly Cost (USD)" },
      { key: "providerMonthlyCredits", type: "number", defaultValue: 1500, label: "Provider Credits Included (Monthly)" },
    ],
  },
  {
    provider: "elevenlabs",
    label: "ElevenLabs",
    secrets: [
      { key: "apiKey", settingKey: "INTEGRATION_ELEVENLABS_SECRET_API_KEY", required: true, label: "API Key" },
    ],
    settings: [
      { key: "modelId", type: "string", defaultValue: "eleven_multilingual_v2", required: true, label: "Model ID" },
      { key: "stability", type: "number", defaultValue: 0.5, label: "Voice Stability" },
      { key: "similarityBoost", type: "number", defaultValue: 0.75, label: "Similarity Boost" },
      { key: "style", type: "number", defaultValue: 0, label: "Voice Style" },
      { key: "useSpeakerBoost", type: "boolean", defaultValue: true, label: "Use Speaker Boost" },
      { key: "defaultFormat", type: "string", defaultValue: "conversation", label: "Default Podcast Format" },
      { key: "defaultDuration", type: "string", defaultValue: "short", label: "Default Podcast Duration" },
      { key: "providerMonthlyCostUsd", type: "number", defaultValue: 22, label: "Provider Monthly Cost (USD)" },
      { key: "providerMonthlyCredits", type: "number", defaultValue: 150000, label: "Provider Credits Included (Monthly)" },
      { key: "providerTopupCostPer1000Usd", type: "number", defaultValue: 0.3, label: "Provider Top-up Cost Per 1,000 Credits (USD)" },
    ],
  },
  {
    provider: "yoco",
    label: "YOCO (Cloud)",
    secrets: [
      { key: "testPublicKey", settingKey: "INTEGRATION_YOCO_SECRET_TEST_PUBLIC_KEY", required: true, label: "Test Public Key" },
      { key: "testSecretKey", settingKey: "INTEGRATION_YOCO_SECRET_TEST_SECRET_KEY", required: true, label: "Test Secret Key" },
      { key: "livePublicKey", settingKey: "INTEGRATION_YOCO_SECRET_LIVE_PUBLIC_KEY", required: true, label: "Live Public Key" },
      { key: "liveSecretKey", settingKey: "INTEGRATION_YOCO_SECRET_LIVE_SECRET_KEY", required: true, label: "Live Secret Key" },
      { key: "webhookSecret", settingKey: "INTEGRATION_YOCO_SECRET_WEBHOOK_SECRET", required: true, label: "Webhook Secret" },
    ],
    settings: [
      { key: "mode", type: "string", defaultValue: "test", required: false, label: "Mode (test/live)" },
    ],
  },
];

type IntegrationSecretSummary = {
  key: string;
  label: string;
  configured: boolean;
  maskedValue: string | null;
  updatedAt: string | null;
  required: boolean;
};

type IntegrationSettingSummary = {
  key: string;
  label: string;
  type: SettingDataType;
  value: any;
  required: boolean;
  updatedAt: string | null;
};

export type IntegrationProviderSummary = {
  provider: IntegrationProvider;
  label: string;
  healthy: boolean;
  secrets: IntegrationSecretSummary[];
  settings: IntegrationSettingSummary[];
};

function getProviderDef(provider: string): ProviderDefinition {
  const def = PROVIDERS.find((p) => p.provider === provider);
  if (!def) {
    throw new Error(`Unsupported integration provider: ${provider}`);
  }
  return def;
}

function hasNonEmptyValue(value: string | null | undefined): boolean {
  return !!String(value || "").trim();
}

function parseSettingValue(type: SettingDataType, raw: string): any {
  if (type === "number") return Number(raw);
  if (type === "boolean") return raw === "true";
  if (type === "json") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

function toStoredSettingValue(type: SettingDataType, value: any): string {
  if (type === "json") return JSON.stringify(value ?? null);
  if (type === "boolean") return value ? "true" : "false";
  return String(value ?? "");
}

async function getSettingRows(keys: string[]) {
  if (!keys.length) return [];
  return db
    .select({
      settingKey: systemSettings.settingKey,
      settingValue: systemSettings.settingValue,
      updatedAt: systemSettings.updatedAt,
    })
    .from(systemSettings)
    .where(inArray(systemSettings.settingKey, keys));
}

async function upsertSetting(settingKey: string, settingValue: string, description: string, updatedBy?: string | null) {
  try {
    await db
      .insert(systemSettings)
      .values({
        settingKey,
        settingValue,
        dataType: "string",
        description,
        updatedBy: updatedBy || null,
      })
      .onConflictDoUpdate({
        target: systemSettings.settingKey,
        set: {
          settingValue,
          updatedBy: updatedBy || null,
          updatedAt: new Date(),
        },
      });
    return;
  } catch (error: any) {
    const message = String(error?.message || "");
    // Fallback for legacy DBs missing the unique constraint required by ON CONFLICT.
    if (!message.includes("no unique or exclusion constraint matching")) {
      throw error;
    }
  }

  const updated = await db
    .update(systemSettings)
    .set({
      settingValue,
      updatedBy: updatedBy || null,
      updatedAt: new Date(),
    })
    .where(eq(systemSettings.settingKey, settingKey))
    .returning({ key: systemSettings.settingKey });

  if (updated.length > 0) {
    return;
  }

  await db.insert(systemSettings).values({
    settingKey,
    settingValue,
    dataType: "string",
    description,
    updatedBy: updatedBy || null,
  });
}

export class IntegrationConfigService {
  static getProviders(): Array<{ provider: IntegrationProvider; label: string }> {
    return PROVIDERS
      .filter((p) => !(isOnPremMode() && p.provider === "yoco"))
      .map((p) => ({ provider: p.provider, label: p.label }));
  }

  static async getProviderSummary(provider: IntegrationProvider): Promise<IntegrationProviderSummary> {
    if (provider === "yoco" && isOnPremMode()) {
      throw new Error("YOCO integration is cloud-only and unavailable on onprem.");
    }
    const def = getProviderDef(provider);
    const keys = [
      ...def.secrets.map((s) => s.settingKey),
      ...def.settings.map((s) => `INTEGRATION_${provider.toUpperCase()}_SETTING_${s.key.toUpperCase()}`),
    ];
    const rows = await getSettingRows(keys);
    const rowMap = new Map(rows.map((r) => [r.settingKey, r]));

    const secrets: IntegrationSecretSummary[] = def.secrets.map((s) => {
      const row = rowMap.get(s.settingKey);
      let configured = false;
      let maskedValue: string | null = null;
      if (row?.settingValue) {
        try {
          const plain = decryptSecret(row.settingValue);
          configured = !!plain.trim();
          maskedValue = maskSecret(plain);
        } catch {
          configured = false;
        }
      }
      return {
        key: s.key,
        label: s.label,
        configured,
        maskedValue,
        updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
        required: !!s.required,
      };
    });

    const settings: IntegrationSettingSummary[] = def.settings.map((s) => {
      const key = `INTEGRATION_${provider.toUpperCase()}_SETTING_${s.key.toUpperCase()}`;
      const row = rowMap.get(key);
      const value = row ? parseSettingValue(s.type, row.settingValue) : s.defaultValue;
      return {
        key: s.key,
        label: s.label,
        type: s.type,
        value,
        required: !!s.required,
        updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      };
    });

    const activeEmailProvider = await this.getActiveEmailProvider();
    let healthy = secrets.filter((s) => s.required).every((s) => s.configured);
    if (provider === "mailersend" && activeEmailProvider === "mailersend") {
      const apiKeySecret = secrets.find((s) => s.key === "apiKey");
      healthy = !!apiKeySecret?.configured;
    }
    if (provider === "smtp" && activeEmailProvider === "smtp") {
      const host = String(settings.find((s) => s.key === "host")?.value || "").trim();
      healthy = host.length > 0;
    }
    if (provider === "yoco") {
      // Cloud-only meaningful status; onprem should remain neutral.
      if (isOnPremMode()) {
        healthy = false;
      } else {
        const mode = String(settings.find((s) => s.key === "mode")?.value || "test").toLowerCase();
        const testPublic = secrets.find((s) => s.key === "testPublicKey")?.configured;
        const testSecret = secrets.find((s) => s.key === "testSecretKey")?.configured;
        const livePublic = secrets.find((s) => s.key === "livePublicKey")?.configured;
        const webhookSecret = secrets.find((s) => s.key === "webhookSecret")?.configured;
        const liveSecret = secrets.find((s) => s.key === "liveSecretKey")?.configured;
        healthy = mode === "live"
          ? !!(livePublic && liveSecret && webhookSecret)
          : !!(testPublic && testSecret && webhookSecret);
      }
    }

    return { provider, label: def.label, healthy, secrets, settings };
  }

  static async listProviderSummaries(): Promise<IntegrationProviderSummary[]> {
    const results: IntegrationProviderSummary[] = [];
    for (const provider of PROVIDERS) {
      if (isOnPremMode() && provider.provider === "yoco") continue;
      results.push(await this.getProviderSummary(provider.provider));
    }
    return results;
  }

  static async setProviderSecret(params: {
    provider: IntegrationProvider;
    secretKey: string;
    value: string;
    updatedBy?: string | null;
  }): Promise<void> {
    const def = getProviderDef(params.provider);
    const secret = def.secrets.find((s) => s.key === params.secretKey);
    if (!secret) {
      throw new Error(`Unsupported secret key '${params.secretKey}' for provider '${params.provider}'.`);
    }
    const value = String(params.value || "").trim();
    if (!value) {
      throw new Error("Secret value is required.");
    }
    const [existing] = await db
      .select({ settingValue: systemSettings.settingValue })
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, secret.settingKey))
      .limit(1);
    let previousPlain: string | null = null;
    if (existing?.settingValue) {
      try {
        previousPlain = decryptSecret(existing.settingValue);
      } catch {
        previousPlain = null;
      }
    }

    const encrypted = encryptSecret(value);
    await upsertSetting(secret.settingKey, encrypted, `Integration secret: ${params.provider}.${secret.key}`, params.updatedBy);
    await IntegrationAuditService.logSystemChange({
      domain: "integration",
      action: "set_secret",
      key: secret.settingKey,
      provider: params.provider,
      isSecret: true,
      beforeValue: previousPlain,
      afterValue: value,
      actorUserId: params.updatedBy || null,
      metadata: { secretKey: secret.key },
    });
  }

  static async deleteProviderSecret(params: {
    provider: IntegrationProvider;
    secretKey: string;
  }): Promise<void> {
    const def = getProviderDef(params.provider);
    const secret = def.secrets.find((s) => s.key === params.secretKey);
    if (!secret) {
      throw new Error(`Unsupported secret key '${params.secretKey}' for provider '${params.provider}'.`);
    }
    const [existing] = await db
      .select({ settingValue: systemSettings.settingValue })
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, secret.settingKey))
      .limit(1);
    let previousPlain: string | null = null;
    if (existing?.settingValue) {
      try {
        previousPlain = decryptSecret(existing.settingValue);
      } catch {
        previousPlain = null;
      }
    }
    await db.delete(systemSettings).where(eq(systemSettings.settingKey, secret.settingKey));
    await IntegrationAuditService.logSystemChange({
      domain: "integration",
      action: "delete_secret",
      key: secret.settingKey,
      provider: params.provider,
      isSecret: true,
      beforeValue: previousPlain,
      afterValue: null,
      metadata: { secretKey: secret.key },
    });
  }

  static async setProviderSetting(params: {
    provider: IntegrationProvider;
    settingKey: string;
    value: any;
    updatedBy?: string | null;
  }): Promise<void> {
    const def = getProviderDef(params.provider);
    const setting = def.settings.find((s) => s.key === params.settingKey);
    if (!setting) {
      throw new Error(`Unsupported setting key '${params.settingKey}' for provider '${params.provider}'.`);
    }
    if (params.provider === "gemini" && params.settingKey === "thinkingScriptModel") {
      const value = String(params.value || "").trim().toLowerCase();
      if (!value) throw new Error("thinkingScriptModel is required.");
      if (!value.startsWith("gemini")) {
        throw new Error("thinkingScriptModel must be a Gemini model.");
      }
    }
    const key = `INTEGRATION_${params.provider.toUpperCase()}_SETTING_${setting.key.toUpperCase()}`;
    const [existing] = await db
      .select({ settingValue: systemSettings.settingValue })
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, key))
      .limit(1);
    const previousValue = existing ? parseSettingValue(setting.type, existing.settingValue) : null;
    const stored = toStoredSettingValue(setting.type, params.value);
    await upsertSetting(key, stored, `Integration setting: ${params.provider}.${setting.key}`, params.updatedBy);
    await IntegrationAuditService.logSystemChange({
      domain: "integration",
      action: "set_setting",
      key,
      provider: params.provider,
      isSecret: false,
      beforeValue: previousValue == null ? null : JSON.stringify(previousValue),
      afterValue: params.value == null ? null : JSON.stringify(params.value),
      actorUserId: params.updatedBy || null,
      metadata: { settingKey: setting.key },
    });
  }

  static async getActiveEmailProvider(): Promise<"smtp" | "mailersend"> {
    const [row] = await db
      .select({ settingValue: systemSettings.settingValue })
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, EMAIL_ACTIVE_PROVIDER_KEY))
      .limit(1);
    const configured = String(row?.settingValue || "").trim().toLowerCase();
    if (configured === "smtp" || configured === "mailersend") return configured;
    return "mailersend";
  }

  static async setActiveEmailProvider(provider: "smtp" | "mailersend", updatedBy?: string | null): Promise<void> {
    const previous = await this.getActiveEmailProvider();
    await upsertSetting(EMAIL_ACTIVE_PROVIDER_KEY, provider, "Integration email active provider", updatedBy);
    await IntegrationAuditService.logSystemChange({
      domain: "integration",
      action: "set_email_transport",
      key: EMAIL_ACTIVE_PROVIDER_KEY,
      provider,
      beforeValue: previous,
      afterValue: provider,
      actorUserId: updatedBy || null,
    });
  }

  static async getSecret(provider: IntegrationProvider, secretKey: string): Promise<string | null> {
    const def = getProviderDef(provider);
    const secret = def.secrets.find((s) => s.key === secretKey);
    if (!secret) return null;

    const [row] = await db
      .select({ settingValue: systemSettings.settingValue })
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, secret.settingKey))
      .limit(1);

    if (!row?.settingValue) return null;
    return decryptSecret(row.settingValue).trim() || null;
  }

  static async getSetting<T = any>(provider: IntegrationProvider, settingKey: string): Promise<T | null> {
    const def = getProviderDef(provider);
    const setting = def.settings.find((s) => s.key === settingKey);
    if (!setting) return null;
    const key = `INTEGRATION_${provider.toUpperCase()}_SETTING_${setting.key.toUpperCase()}`;
    const [row] = await db
      .select({ settingValue: systemSettings.settingValue })
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, key))
      .limit(1);
    if (!row) return setting.defaultValue as T;
    return parseSettingValue(setting.type, row.settingValue) as T;
  }

  static async testProvider(provider: IntegrationProvider): Promise<{ success: boolean; message: string; details?: any }> {
    if (provider === "gemini") {
      const apiKey = await this.getSecret("gemini", "apiKey");
      if (!apiKey) return { success: false, message: "Gemini API key is not configured." };
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
      if (!response.ok) {
        const text = await response.text();
        return { success: false, message: `Gemini API test failed (${response.status})`, details: text.slice(0, 500) };
      }
      const data: any = await response.json();
      return { success: true, message: "Gemini API connection succeeded.", details: { modelCount: Array.isArray(data?.models) ? data.models.length : 0 } };
    }

    if (provider === "gamma") {
      const apiKey = await this.getSecret("gamma", "apiKey");
      if (!apiKey) return { success: false, message: "Gamma API key is not configured." };
      const response = await fetch("https://public-api.gamma.app/v1.0/themes?limit=1", {
        headers: { "X-API-KEY": apiKey, accept: "application/json" },
      });
      if (!response.ok) {
        const text = await response.text();
        return { success: false, message: `Gamma API test failed (${response.status})`, details: text.slice(0, 500) };
      }
      return { success: true, message: "Gamma API connection succeeded." };
    }

    if (provider === "elevenlabs") {
      const apiKey = await this.getSecret("elevenlabs", "apiKey");
      if (!apiKey) return { success: false, message: "ElevenLabs API key is not configured." };
      const response = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": apiKey, accept: "application/json" },
      });
      if (!response.ok) {
        const text = await response.text();
        return { success: false, message: `ElevenLabs API test failed (${response.status})`, details: text.slice(0, 500) };
      }
      const data: any = await response.json();
      return { success: true, message: "ElevenLabs API connection succeeded.", details: { voiceCount: Array.isArray(data?.voices) ? data.voices.length : 0 } };
    }

    if (provider === "mailersend") {
      const apiKey = await this.getSecret("mailersend", "apiKey");
      if (!apiKey) return { success: false, message: "MailerSend API key is not configured." };
      const response = await fetch("https://api.mailersend.com/v1/templates?limit=10", {
        headers: { Authorization: `Bearer ${apiKey}`, accept: "application/json" },
      });
      if (!response.ok) {
        const text = await response.text();
        if (response.status === 401) {
          return {
            success: false,
            message: "MailerSend API key is invalid or lacks required scope.",
            details: text.slice(0, 500),
          };
        }
        return { success: false, message: `MailerSend API test failed (${response.status})`, details: text.slice(0, 500) };
      }
      const data: any = await response.json();
      return {
        success: true,
        message: "MailerSend API connection succeeded.",
        details: { templateCount: Array.isArray(data?.data) ? data.data.length : 0 },
      };
    }

    if (provider === "smtp") {
      const host = (await this.getSetting<string>("smtp", "host")) || "";
      const port = Number((await this.getSetting<number>("smtp", "port")) ?? 587);
      if (!host.trim()) return { success: false, message: "SMTP host is not configured." };
      const timeout = new Promise<{ ok: false }>((resolve) => setTimeout(() => resolve({ ok: false }), 5000));
      try {
        const result = await Promise.race([
          fetch(`http://${host}:${port}`, { method: "HEAD" }).then(() => ({ ok: true })),
          timeout,
        ]);
        if (!(result as any).ok) return { success: false, message: `SMTP connectivity test timed out for ${host}:${port}.` };
      } catch (_error) {
        return { success: false, message: `SMTP host ${host}:${port} could not be reached.` };
      }
      return { success: true, message: `SMTP endpoint ${host}:${port} appears reachable.` };
    }

    if (provider === "yoco") {
      if (isOnPremMode()) return { success: true, message: "YOCO is cloud-only and disabled on onprem." };
      const mode = String((await this.getSetting<string>("yoco", "mode")) || "test").toLowerCase();
      const testPublic = await this.getSecret("yoco", "testPublicKey");
      const livePublic = await this.getSecret("yoco", "livePublicKey");
      const webhookSecret = await this.getSecret("yoco", "webhookSecret");
      if (!webhookSecret) return { success: false, message: "YOCO webhook secret is not configured." };
      if (mode === "live") {
        const liveSecret = String((await this.getSecret("yoco", "liveSecretKey")) || "").trim();
        if (!livePublic) return { success: false, message: "YOCO live public key is not configured." };
        if (!liveSecret) return { success: false, message: "YOCO live secret key is not configured." };
        return { success: true, message: "YOCO live credentials appear configured." };
      }
      const testSecret = await this.getSecret("yoco", "testSecretKey");
      if (!testPublic) return { success: false, message: "YOCO test public key is not configured." };
      if (!testSecret) return { success: false, message: "YOCO test secret key is not configured." };
      return { success: true, message: "YOCO test credentials appear configured." };
    }

    return { success: false, message: "Unsupported provider." };
  }

  static async bootstrapFromLegacyEnvIfNeeded(): Promise<void> {
    const [existing] = await db
      .select({ settingValue: systemSettings.settingValue })
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, INTEGRATION_BOOTSTRAP_DONE_KEY))
      .limit(1);
    if (existing?.settingValue === "true") return;

    const maybeUpsertSecret = async (provider: IntegrationProvider, secretKey: string, envKey: string) => {
      const val = String(process.env[envKey] || "").trim();
      if (!val || /^(your_|changeme|replace_me|example)/i.test(val)) return;
      const current = await this.getSecret(provider, secretKey);
      if (!current) {
        await this.setProviderSecret({ provider, secretKey, value: val, updatedBy: null });
      }
    };
    const maybeUpsertSetting = async (provider: IntegrationProvider, settingKey: string, value: any) => {
      if (value == null || String(value).trim() === "") return;
      const current = await this.getSetting(provider, settingKey);
      if (current == null || String(current).trim() === "") {
        await this.setProviderSetting({ provider, settingKey, value, updatedBy: null });
      }
    };

    await maybeUpsertSecret("gemini", "apiKey", "GEMINI_API_KEY");
    await maybeUpsertSecret("gamma", "apiKey", "GAMMA_API_KEY");
    await maybeUpsertSecret("elevenlabs", "apiKey", "ELEVENLABS_API_KEY");
    await maybeUpsertSecret("elevenlabs", "apiKey", "PODCAST_API_KEY");
    await maybeUpsertSecret("mailersend", "apiKey", "MAILERSEND_API_KEY");

    await maybeUpsertSetting("smtp", "host", process.env.SMTP_HOST);
    await maybeUpsertSetting("smtp", "port", process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined);
    await maybeUpsertSetting("smtp", "secure", process.env.SMTP_SECURE === "true");
    await maybeUpsertSetting("smtp", "username", process.env.SMTP_USER);
    await maybeUpsertSecret("smtp", "password", "SMTP_PASS");
    await maybeUpsertSetting("smtp", "fromEmail", process.env.SMTP_FROM || process.env.EMAIL_FROM);
    await maybeUpsertSetting("mailersend", "fromEmail", process.env.EMAIL_FROM);

    if (!isOnPremMode()) {
      await maybeUpsertSecret("yoco", "testPublicKey", "YOCO_TEST_PUBLIC_KEY");
      await maybeUpsertSecret("yoco", "testSecretKey", "YOCO_TEST_SECRET_KEY");
      await maybeUpsertSecret("yoco", "livePublicKey", "YOCO_LIVE_PUBLIC_KEY");
      await maybeUpsertSecret("yoco", "liveSecretKey", "YOCO_LIVE_SECRET_KEY");
      await maybeUpsertSecret("yoco", "webhookSecret", "YOCO_WEBHOOK_SECRET");
    }

    const [providerSettingRow] = await db
      .select({ settingValue: systemSettings.settingValue })
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, EMAIL_ACTIVE_PROVIDER_KEY))
      .limit(1);
    const bootstrapProvider = decideBootstrapEmailProvider({
      hasExplicitProviderSetting: !!providerSettingRow?.settingValue,
      smtpHost: String(process.env.SMTP_HOST || ""),
      mailerSendApiKey: String(process.env.MAILERSEND_API_KEY || ""),
    });
    if (bootstrapProvider) {
      await this.setActiveEmailProvider(bootstrapProvider, null);
    }
    await upsertSetting(INTEGRATION_BOOTSTRAP_DONE_KEY, "true", "Integration bootstrap completed", null);
  }
}
