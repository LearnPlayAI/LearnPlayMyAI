import type { Express, Request, Response } from "express";
import axios from "axios";
import crypto from "crypto";
import { z } from "zod";
import { isOrgAdmin } from "../adminAuth";
import { getBaseUrl } from "../config/base-url";
import { resolveEffectiveOrganization, type RequestWithEffectiveOrg } from "../middleware/sessionAuthMiddleware";
import {
  buildGoogleOAuthAuthorizationUrl,
  getGoogleOAuthClientConfig,
  SourceIntelligenceProviderConfigService,
  type GoogleOAuthTokenPayload,
} from "../services/sourceIntelligenceProviderConfigService";

declare module "express-session" {
  interface SessionData {
    notebookLmOAuthState?: {
      state: string;
      organizationId: string;
      actorUserId: string | null;
      createdAt: number;
    };
  }
}

const settingsBodySchema = z.object({
  enabled: z.boolean().optional(),
  projectNumber: z.string().optional(),
  location: z.string().optional(),
  endpointLocation: z.enum(["global-", "us-", "eu-"]).optional(),
  defaultNotebookTitle: z.string().optional(),
  sourceMode: z.enum(["upload_files", "raw_text"]).optional(),
});

const credentialBodySchema = z.object({
  serviceAccountJson: z.string().min(2),
});

const projectSelectionBodySchema = z.object({
  projectId: z.string().min(1),
  sourceMode: z.enum(["upload_files", "raw_text"]).optional(),
});

async function resolveOrgId(req: Request): Promise<string | null> {
  const explicitOrgId = (req as any).resolvedOrganizationId;
  if (typeof explicitOrgId === "string" && explicitOrgId.trim()) {
    return explicitOrgId.trim();
  }
  const effective = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
  return effective.organizationId;
}

function getNotebookLmOAuthRedirectUri(): string {
  return `${getBaseUrl()}/api/org/source-intelligence/notebooklm/oauth/callback`;
}

async function exchangeGoogleOAuthCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<GoogleOAuthTokenPayload> {
  const response = await axios.post("https://oauth2.googleapis.com/token", new URLSearchParams({
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
  }), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  const token = response.data as GoogleOAuthTokenPayload;
  return {
    ...token,
    expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
  };
}

async function loadGoogleUserEmail(accessToken: string): Promise<string | null> {
  try {
    const response = await axios.get("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return typeof response.data?.email === "string" ? response.data.email : null;
  } catch (error) {
    console.warn("[SourceIntelligenceRoutes] Could not load Google OAuth userinfo:", error);
    return null;
  }
}

async function loadGoogleProjectOptions(accessToken: string): Promise<Array<{ projectId: string; projectNumber: string; name: string }>> {
  try {
    const response = await axios.get("https://cloudresourcemanager.googleapis.com/v1/projects", {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { pageSize: 200 },
    });
    const projects = Array.isArray(response.data?.projects) ? response.data.projects : [];
    return projects
      .filter((project: any) => project?.lifecycleState === "ACTIVE" || !project?.lifecycleState)
      .map((project: any) => ({
        projectId: String(project.projectId || ""),
        projectNumber: String(project.projectNumber || ""),
        name: String(project.name || project.projectId || ""),
      }))
      .filter((project: any) => project.projectId && project.projectNumber);
  } catch (error) {
    console.warn("[SourceIntelligenceRoutes] Could not list Google Cloud projects:", error);
    return [];
  }
}

function redirectToSettings(res: Response, params: Record<string, string>) {
  const url = new URL(`${getBaseUrl()}/source-intelligence`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return res.redirect(url.toString());
}

export function registerSourceIntelligenceRoutes(app: Express) {
  app.get("/api/org/source-intelligence/notebooklm", isOrgAdmin, async (req: Request, res: Response) => {
    try {
      const organizationId = await resolveOrgId(req);
      if (!organizationId) {
        return res.status(400).json({ error: "Organization context required" });
      }
      const summary = await SourceIntelligenceProviderConfigService.getNotebookLmSummary(organizationId);
      return res.json(summary);
    } catch (error: any) {
      console.error("[SourceIntelligenceRoutes] Failed to load NotebookLM config:", error);
      return res.status(500).json({ error: "Failed to load NotebookLM configuration" });
    }
  });

  app.get("/api/org/source-intelligence/notebooklm/oauth/start", isOrgAdmin, async (req: Request, res: Response) => {
    try {
      const organizationId = await resolveOrgId(req);
      if (!organizationId) {
        return res.status(400).json({ error: "Organization context required" });
      }

      const config = getGoogleOAuthClientConfig();
      if (!config.configured) {
        return redirectToSettings(res, { notebookLmError: "oauth_client_missing" });
      }

      const state = crypto.randomBytes(24).toString("hex");
      req.session.notebookLmOAuthState = {
        state,
        organizationId,
        actorUserId: req.session?.userId || null,
        createdAt: Date.now(),
      };

      const authorizationUrl = buildGoogleOAuthAuthorizationUrl({
        clientId: config.clientId,
        redirectUri: getNotebookLmOAuthRedirectUri(),
        state,
      });

      return res.redirect(authorizationUrl);
    } catch (error: any) {
      console.error("[SourceIntelligenceRoutes] Failed to start NotebookLM OAuth:", error);
      return res.status(500).json({ error: "Failed to start Google connection" });
    }
  });

  app.get("/api/org/source-intelligence/notebooklm/oauth/callback", async (req: Request, res: Response) => {
    try {
      const code = typeof req.query.code === "string" ? req.query.code : "";
      const state = typeof req.query.state === "string" ? req.query.state : "";
      const error = typeof req.query.error === "string" ? req.query.error : "";
      const pending = req.session.notebookLmOAuthState;

      if (error) {
        return redirectToSettings(res, { notebookLmError: error });
      }
      if (!code || !state || !pending || pending.state !== state || Date.now() - pending.createdAt > 10 * 60 * 1000) {
        return redirectToSettings(res, { notebookLmError: "oauth_state_invalid" });
      }

      const config = getGoogleOAuthClientConfig();
      if (!config.configured) {
        return redirectToSettings(res, { notebookLmError: "oauth_client_missing" });
      }

      const token = await exchangeGoogleOAuthCode({
        code,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUri: getNotebookLmOAuthRedirectUri(),
      });
      const [connectedEmail, projectOptions] = await Promise.all([
        loadGoogleUserEmail(token.access_token),
        loadGoogleProjectOptions(token.access_token),
      ]);

      await SourceIntelligenceProviderConfigService.saveNotebookLmOAuthConnection({
        organizationId: pending.organizationId,
        actorUserId: pending.actorUserId,
        credential: {
          ...token,
          connectedEmail,
          projectOptions,
        },
      });

      delete req.session.notebookLmOAuthState;
      return redirectToSettings(res, {
        notebookLmConnected: "1",
        projectSelection: projectOptions.length === 1 ? "auto" : "required",
      });
    } catch (error: any) {
      console.error("[SourceIntelligenceRoutes] Failed to complete NotebookLM OAuth:", error?.response?.data || error);
      return redirectToSettings(res, { notebookLmError: "oauth_callback_failed" });
    }
  });

  app.put("/api/org/source-intelligence/notebooklm/project", isOrgAdmin, async (req: Request, res: Response) => {
    try {
      const organizationId = await resolveOrgId(req);
      if (!organizationId) {
        return res.status(400).json({ error: "Organization context required" });
      }
      const body = projectSelectionBodySchema.parse(req.body || {});
      const summary = await SourceIntelligenceProviderConfigService.selectNotebookLmGoogleProject({
        organizationId,
        actorUserId: req.session?.userId || null,
        projectId: body.projectId,
        sourceMode: body.sourceMode,
      });
      return res.json(summary);
    } catch (error: any) {
      console.error("[SourceIntelligenceRoutes] Failed to select NotebookLM project:", error);
      return res.status(400).json({ error: error?.message || "Could not select Google Cloud project" });
    }
  });

  app.put("/api/org/source-intelligence/notebooklm/settings", isOrgAdmin, async (req: Request, res: Response) => {
    try {
      const organizationId = await resolveOrgId(req);
      if (!organizationId) {
        return res.status(400).json({ error: "Organization context required" });
      }
      const body = settingsBodySchema.parse(req.body || {});
      const summary = await SourceIntelligenceProviderConfigService.upsertNotebookLmSettings({
        organizationId,
        actorUserId: req.session?.userId || null,
        settings: {
          enabled: body.enabled ?? false,
          projectNumber: body.projectNumber || "",
          location: body.location || "global",
          endpointLocation: body.endpointLocation || "global-",
          defaultNotebookTitle: body.defaultNotebookTitle || "",
          sourceMode: body.sourceMode || "upload_files",
        },
      });
      return res.json(summary);
    } catch (error: any) {
      console.error("[SourceIntelligenceRoutes] Failed to save NotebookLM settings:", error);
      return res.status(400).json({ error: error?.message || "Invalid NotebookLM settings" });
    }
  });

  app.put("/api/org/source-intelligence/notebooklm/credential", isOrgAdmin, async (req: Request, res: Response) => {
    try {
      const organizationId = await resolveOrgId(req);
      if (!organizationId) {
        return res.status(400).json({ error: "Organization context required" });
      }
      const body = credentialBodySchema.parse(req.body || {});
      const summary = await SourceIntelligenceProviderConfigService.saveNotebookLmCredential({
        organizationId,
        actorUserId: req.session?.userId || null,
        serviceAccountJson: body.serviceAccountJson,
      });
      return res.json(summary);
    } catch (error: any) {
      console.error("[SourceIntelligenceRoutes] Failed to save NotebookLM credential:", error);
      return res.status(400).json({ error: "Invalid NotebookLM service account JSON" });
    }
  });

  app.delete("/api/org/source-intelligence/notebooklm/credential", isOrgAdmin, async (req: Request, res: Response) => {
    try {
      const organizationId = await resolveOrgId(req);
      if (!organizationId) {
        return res.status(400).json({ error: "Organization context required" });
      }
      const summary = await SourceIntelligenceProviderConfigService.clearNotebookLmCredential({
        organizationId,
        actorUserId: req.session?.userId || null,
      });
      return res.json(summary);
    } catch (error: any) {
      console.error("[SourceIntelligenceRoutes] Failed to clear NotebookLM credential:", error);
      return res.status(500).json({ error: "Failed to clear NotebookLM credential" });
    }
  });

  app.post("/api/org/source-intelligence/notebooklm/test", isOrgAdmin, async (req: Request, res: Response) => {
    try {
      const organizationId = await resolveOrgId(req);
      if (!organizationId) {
        return res.status(400).json({ error: "Organization context required" });
      }
      const result = await SourceIntelligenceProviderConfigService.testNotebookLmConfiguration({
        organizationId,
        actorUserId: req.session?.userId || null,
      });
      return res.json(result);
    } catch (error: any) {
      console.error("[SourceIntelligenceRoutes] Failed to test NotebookLM configuration:", error);
      return res.status(500).json({ error: "Failed to test NotebookLM configuration" });
    }
  });
}
