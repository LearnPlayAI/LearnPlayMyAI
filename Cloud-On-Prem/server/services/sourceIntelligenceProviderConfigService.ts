import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { organizationSourceIntelligenceProviders } from "@shared/schema";
import type { OrganizationSourceIntelligenceProvider } from "@shared/schema";
import { decryptSecret, encryptSecret, maskSecret } from "../utils/secretCrypto";

export const NOTEBOOKLM_PROVIDER = "notebooklm_enterprise" as const;

export type SourceIntelligenceProvider = typeof NOTEBOOKLM_PROVIDER;
export type SourceIntelligenceConnectionStatus =
  | "not_configured"
  | "configured"
  | "needs_project_selection"
  | "available"
  | "unavailable"
  | "unsupported";

export type NotebookLmAuthMode = "service_account_json" | "google_oauth";

export const notebookLmSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  projectNumber: z.string().trim().min(1).optional().or(z.literal("")),
  location: z.string().trim().min(1).default("global"),
  endpointLocation: z.enum(["global-", "us-", "eu-"]).default("global-"),
  defaultNotebookTitle: z.string().trim().max(160).optional().or(z.literal("")),
  sourceMode: z.enum(["upload_files", "raw_text"]).default("upload_files"),
});

export const notebookLmCredentialSchema = z.object({
  type: z.literal("service_account"),
  project_id: z.string().min(1),
  private_key_id: z.string().min(1),
  private_key: z.string().min(1),
  client_email: z.string().email(),
  client_id: z.string().optional(),
});

export type NotebookLmSettingsInput = z.input<typeof notebookLmSettingsSchema>;
export type NotebookLmSettings = z.output<typeof notebookLmSettingsSchema>;

export interface SourceIntelligenceProviderSummary {
  provider: SourceIntelligenceProvider;
  label: string;
  enabled: boolean;
  authMode: NotebookLmAuthMode;
  projectNumber: string | null;
  location: string;
  endpointLocation: "global-" | "us-" | "eu-";
  selectedProjectId: string | null;
  selectedProjectName: string | null;
  projectOptions: Array<{ projectId: string; projectNumber: string; name: string }>;
  defaultNotebookTitle: string | null;
  sourceMode: "upload_files" | "raw_text";
  credentialConfigured: boolean;
  credentialSummary: Record<string, unknown> | null;
  oauthConfigured: boolean;
  connectionStatus: SourceIntelligenceConnectionStatus;
  lastTestedAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
  apiCapability: {
    notebookManagement: "available";
    sourceUpload: "available";
    structuredLessonExtraction: "not_exposed";
  };
}

export const googleOAuthScopes = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/cloud-platform",
] as const;

export type GoogleOAuthTokenPayload = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
  connectedEmail?: string | null;
  expiresAt?: string | null;
  projectOptions?: Array<{ projectId: string; projectNumber: string; name: string }>;
};

function normalizeSettings(input: NotebookLmSettingsInput): NotebookLmSettings {
  const parsed = notebookLmSettingsSchema.parse(input);
  return {
    ...parsed,
    projectNumber: parsed.projectNumber?.trim() || "",
    defaultNotebookTitle: parsed.defaultNotebookTitle?.trim() || "",
  };
}

export function summarizeCredential(rawCredential: string): Record<string, unknown> {
  const parsed = notebookLmCredentialSchema.parse(JSON.parse(rawCredential));
  return {
    type: parsed.type || null,
    projectId: parsed.project_id || null,
    clientEmail: parsed.client_email ? maskSecret(parsed.client_email) : null,
    privateKeyId: parsed.private_key_id ? maskSecret(parsed.private_key_id) : null,
  };
}

export function summarizeGoogleOAuthCredential(credential: GoogleOAuthTokenPayload): Record<string, unknown> {
  const scopes = (credential.scope || "")
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

  return {
    type: "google_oauth",
    connectedEmail: credential.connectedEmail ? maskSecret(credential.connectedEmail) : null,
    scopes,
    projectCount: credential.projectOptions?.length || 0,
  };
}

export function buildGoogleOAuthAuthorizationUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", googleOAuthScopes.join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

export function getGoogleOAuthClientConfig() {
  const clientId = process.env.NOTEBOOKLM_GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || "";
  const clientSecret = process.env.NOTEBOOKLM_GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
  return {
    configured: Boolean(clientId && clientSecret),
    clientId,
    clientSecret,
  };
}

function toSummary(row: OrganizationSourceIntelligenceProvider | null): SourceIntelligenceProviderSummary {
  const settingsJson = (row?.settings as any) || {};
  const settings = normalizeSettings({
    enabled: row?.enabled ?? false,
    projectNumber: row?.projectNumber || "",
    location: row?.location || "global",
    endpointLocation: (row?.endpointLocation as "global-" | "us-" | "eu-" | undefined) || "global-",
    defaultNotebookTitle: row?.defaultNotebookTitle || "",
    sourceMode: (settingsJson.sourceMode as "upload_files" | "raw_text" | undefined) || "upload_files",
  });
  const authMode = ((row?.authMode as NotebookLmAuthMode | undefined) || "service_account_json");

  return {
    provider: NOTEBOOKLM_PROVIDER,
    label: "NotebookLM Enterprise",
    enabled: settings.enabled,
    authMode,
    projectNumber: settings.projectNumber || null,
    location: settings.location,
    endpointLocation: settings.endpointLocation,
    selectedProjectId: settingsJson.selectedProjectId || null,
    selectedProjectName: settingsJson.selectedProjectName || null,
    projectOptions: Array.isArray(settingsJson.projectOptions) ? settingsJson.projectOptions : [],
    defaultNotebookTitle: settings.defaultNotebookTitle || null,
    sourceMode: settings.sourceMode,
    credentialConfigured: Boolean(row?.encryptedCredentials),
    credentialSummary: (row?.credentialSummary as Record<string, unknown> | null) || null,
    oauthConfigured: getGoogleOAuthClientConfig().configured,
    connectionStatus: (row?.connectionStatus as SourceIntelligenceConnectionStatus | undefined) || "not_configured",
    lastTestedAt: row?.lastTestedAt ? row.lastTestedAt.toISOString() : null,
    lastError: row?.lastError || null,
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    apiCapability: {
      notebookManagement: "available",
      sourceUpload: "available",
      structuredLessonExtraction: "not_exposed",
    },
  };
}

async function getRow(organizationId: string) {
  const [row] = await db
    .select()
    .from(organizationSourceIntelligenceProviders)
    .where(and(
      eq(organizationSourceIntelligenceProviders.organizationId, organizationId),
      eq(organizationSourceIntelligenceProviders.provider, NOTEBOOKLM_PROVIDER),
    ));
  return row || null;
}

export class SourceIntelligenceProviderConfigService {
  static async getNotebookLmSummary(organizationId: string): Promise<SourceIntelligenceProviderSummary> {
    return toSummary(await getRow(organizationId));
  }

  static async upsertNotebookLmSettings(params: {
    organizationId: string;
    actorUserId?: string | null;
    settings: NotebookLmSettingsInput;
  }): Promise<SourceIntelligenceProviderSummary> {
    const settings = normalizeSettings(params.settings);
    const status: SourceIntelligenceConnectionStatus = settings.enabled ? "configured" : "not_configured";
    const existing = await getRow(params.organizationId);
    const existingSettings = (existing?.settings as Record<string, unknown> | null) || {};

    const [row] = await db
      .insert(organizationSourceIntelligenceProviders)
      .values({
        organizationId: params.organizationId,
        provider: NOTEBOOKLM_PROVIDER,
        enabled: settings.enabled,
        authMode: existing?.authMode || "service_account_json",
        projectNumber: settings.projectNumber || null,
        location: settings.location,
        endpointLocation: settings.endpointLocation,
        defaultNotebookTitle: settings.defaultNotebookTitle || null,
        settings: { ...existingSettings, sourceMode: settings.sourceMode },
        connectionStatus: status,
        lastError: null,
        createdBy: params.actorUserId || null,
        updatedBy: params.actorUserId || null,
      })
      .onConflictDoUpdate({
        target: [
          organizationSourceIntelligenceProviders.organizationId,
          organizationSourceIntelligenceProviders.provider,
        ],
        set: {
          enabled: settings.enabled,
          projectNumber: settings.projectNumber || null,
          location: settings.location,
          endpointLocation: settings.endpointLocation,
          defaultNotebookTitle: settings.defaultNotebookTitle || null,
          settings: { ...existingSettings, sourceMode: settings.sourceMode },
          connectionStatus: status,
          lastError: null,
          updatedBy: params.actorUserId || null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return toSummary(row);
  }

  static async saveNotebookLmCredential(params: {
    organizationId: string;
    actorUserId?: string | null;
    serviceAccountJson: string;
  }): Promise<SourceIntelligenceProviderSummary> {
    const credentialSummary = summarizeCredential(params.serviceAccountJson);
    const encryptedCredentials = encryptSecret(params.serviceAccountJson);

    const [row] = await db
      .insert(organizationSourceIntelligenceProviders)
      .values({
        organizationId: params.organizationId,
        provider: NOTEBOOKLM_PROVIDER,
        authMode: "service_account_json",
        encryptedCredentials,
        credentialSummary,
        connectionStatus: "configured",
        lastError: null,
        createdBy: params.actorUserId || null,
        updatedBy: params.actorUserId || null,
      })
      .onConflictDoUpdate({
        target: [
          organizationSourceIntelligenceProviders.organizationId,
          organizationSourceIntelligenceProviders.provider,
        ],
        set: {
          encryptedCredentials,
          credentialSummary,
          connectionStatus: "configured",
          lastError: null,
          updatedBy: params.actorUserId || null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return toSummary(row);
  }

  static async saveNotebookLmOAuthConnection(params: {
    organizationId: string;
    actorUserId?: string | null;
    credential: GoogleOAuthTokenPayload;
  }): Promise<SourceIntelligenceProviderSummary> {
    const credentialSummary = summarizeGoogleOAuthCredential(params.credential);
    const encryptedCredentials = encryptSecret(JSON.stringify(params.credential));
    const projectOptions = params.credential.projectOptions || [];
    const singleProject = projectOptions.length === 1 ? projectOptions[0] : null;
    const settings = {
      sourceMode: "upload_files",
      selectedProjectId: singleProject?.projectId || null,
      selectedProjectName: singleProject?.name || null,
      projectOptions,
    };

    const [row] = await db
      .insert(organizationSourceIntelligenceProviders)
      .values({
        organizationId: params.organizationId,
        provider: NOTEBOOKLM_PROVIDER,
        enabled: Boolean(singleProject),
        authMode: "google_oauth",
        projectNumber: singleProject?.projectNumber || null,
        location: "global",
        endpointLocation: "global-",
        defaultNotebookTitle: "LearnPlay course sources",
        encryptedCredentials,
        credentialSummary,
        settings,
        connectionStatus: singleProject ? "configured" : "needs_project_selection",
        lastError: null,
        createdBy: params.actorUserId || null,
        updatedBy: params.actorUserId || null,
      })
      .onConflictDoUpdate({
        target: [
          organizationSourceIntelligenceProviders.organizationId,
          organizationSourceIntelligenceProviders.provider,
        ],
        set: {
          enabled: Boolean(singleProject),
          authMode: "google_oauth",
          projectNumber: singleProject?.projectNumber || null,
          location: "global",
          endpointLocation: "global-",
          defaultNotebookTitle: "LearnPlay course sources",
          encryptedCredentials,
          credentialSummary,
          settings,
          connectionStatus: singleProject ? "configured" : "needs_project_selection",
          lastError: null,
          updatedBy: params.actorUserId || null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return toSummary(row);
  }

  static async selectNotebookLmGoogleProject(params: {
    organizationId: string;
    actorUserId?: string | null;
    projectId: string;
    sourceMode?: "upload_files" | "raw_text";
  }): Promise<SourceIntelligenceProviderSummary> {
    const row = await getRow(params.organizationId);
    const settings = (row?.settings as any) || {};
    const projectOptions = Array.isArray(settings.projectOptions) ? settings.projectOptions : [];
    const selected = projectOptions.find((project: any) => project.projectId === params.projectId);
    if (!selected) {
      throw new Error("Select a Google Cloud project discovered from this connection.");
    }

    const nextSettings = {
      ...settings,
      sourceMode: params.sourceMode || settings.sourceMode || "upload_files",
      selectedProjectId: selected.projectId,
      selectedProjectName: selected.name || selected.projectId,
      projectOptions,
    };

    const [updated] = await db
      .update(organizationSourceIntelligenceProviders)
      .set({
        enabled: true,
        projectNumber: selected.projectNumber,
        settings: nextSettings,
        connectionStatus: "configured",
        lastError: null,
        updatedBy: params.actorUserId || null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(organizationSourceIntelligenceProviders.organizationId, params.organizationId),
        eq(organizationSourceIntelligenceProviders.provider, NOTEBOOKLM_PROVIDER),
      ))
      .returning();

    return toSummary(updated || row || null);
  }

  static async clearNotebookLmCredential(params: {
    organizationId: string;
    actorUserId?: string | null;
  }): Promise<SourceIntelligenceProviderSummary> {
    const [row] = await db
      .update(organizationSourceIntelligenceProviders)
      .set({
        encryptedCredentials: null,
        credentialSummary: null,
        enabled: false,
        authMode: "google_oauth",
        projectNumber: null,
        connectionStatus: "not_configured",
        lastError: null,
        updatedBy: params.actorUserId || null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(organizationSourceIntelligenceProviders.organizationId, params.organizationId),
        eq(organizationSourceIntelligenceProviders.provider, NOTEBOOKLM_PROVIDER),
      ))
      .returning();

    return toSummary(row || null);
  }

  static async getDecryptedNotebookLmCredential(organizationId: string): Promise<string | null> {
    const row = await getRow(organizationId);
    if (!row?.encryptedCredentials) return null;
    return decryptSecret(row.encryptedCredentials);
  }

  static async testNotebookLmConfiguration(params: {
    organizationId: string;
    actorUserId?: string | null;
  }): Promise<{ success: boolean; status: SourceIntelligenceConnectionStatus; message: string; summary: SourceIntelligenceProviderSummary }> {
    const row = await getRow(params.organizationId);
    let status: SourceIntelligenceConnectionStatus = "not_configured";
    let message = "NotebookLM Enterprise is not configured for this organization.";

    if (row?.encryptedCredentials && row.projectNumber && row.location && row.endpointLocation) {
      status = "unsupported";
      message = "Google is connected and a project is selected. Google exposes NotebookLM Enterprise APIs for notebook/source management, but no stable structured lesson extraction endpoint is configured in LearnPlay yet.";
    } else if (row?.encryptedCredentials) {
      status = "needs_project_selection";
      message = "Google is connected. Select a Google Cloud project before enabling NotebookLM source intelligence.";
    } else if (row) {
      status = "not_configured";
      message = "Settings are saved, but the service account credential is missing.";
    }

    const [updated] = await db
      .update(organizationSourceIntelligenceProviders)
      .set({
        connectionStatus: status,
        lastTestedAt: new Date(),
        lastError: status === "unsupported" ? message : null,
        updatedBy: params.actorUserId || null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(organizationSourceIntelligenceProviders.organizationId, params.organizationId),
        eq(organizationSourceIntelligenceProviders.provider, NOTEBOOKLM_PROVIDER),
      ))
      .returning();

    return {
      success: status === "unsupported",
      status,
      message,
      summary: toSummary(updated || row || null),
    };
  }
}
