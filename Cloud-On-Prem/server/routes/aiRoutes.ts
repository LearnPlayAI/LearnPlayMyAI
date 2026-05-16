import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { isSuperAdmin, isSuperAdminOrCustSuper } from '../adminAuth';
import { withSessionAuthMiddleware, resolveEffectiveOrganization, type RequestWithEffectiveOrg } from '../middleware/sessionAuthMiddleware';
import { AIService, QuizGroundingValidationError } from '../ai/aiService';
import { LessonService } from '../services/lessonService';
import { quizPricingService } from '../services/quizPricingService';
import { HybridCreditService, InsufficientHybridCreditsError } from '../services/hybridCreditService';
import { isQuizCreditChargingEnabled, isOnPremMode } from '../featureFlags';
import { storage, ALL_STAFF_ROLES } from '../storage';
import { insertAiConfigSchema, aiConfig as aiConfigTable, lessons, courseSourceAssets } from '@shared/schema';
import { db } from '../db';
import { eq, inArray } from 'drizzle-orm';
import { IntegrationConfigService, type IntegrationProvider } from '../services/integrationConfigService';
import { IntegrationAuditService } from '../services/integrationAuditService';
import { ElevenLabsService } from '../services/elevenLabsService';
import { GammaService } from '../services/gammaService';
import { CreditService } from '../services/creditService';
import { OrganizationCreditService } from '../services/organizationCreditService';
import {
  buildSourceContract,
  resolveLessonSourceSelection,
  type LessonSourceSelection,
  type LessonSourceType,
} from '../services/lessonSourceContractService';

type QuizSourceType = LessonSourceType;
type QuizSourceSelection = LessonSourceSelection;
type ResolvedQuizSource = Awaited<ReturnType<typeof resolveLessonSourceSelection>>;
type QuizGroundingFailureDto = {
  index: number;
  reason: string;
  missingTokens: string[];
  phraseConfidence: number;
  lexicalCoverage: number;
};

type QuizLearningObjectiveInput = {
  id: string;
  objective: string;
  bloomLevel?: string;
};

function sanitizeLearningObjectives(input: any): QuizLearningObjectiveInput[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item: any) => ({
      id: String(item?.id || "").trim(),
      objective: String(item?.objective || "").trim(),
      bloomLevel: String(item?.bloomLevel || "").trim() || undefined,
    }))
    .filter((item) => item.id && item.objective);
}

function buildUserFriendlyGroundingReason(failure: {
  index: number;
  confidenceScore: number;
  lexicalCoverage: number;
}) {
  const confidencePct = Math.round((Number(failure.confidenceScore) || 0) * 100);
  const coveragePct = Math.round((Number(failure.lexicalCoverage) || 0) * 100);
  return `Not clearly supported by the selected source (support score ${confidencePct}%, source coverage ${coveragePct}%).`;
}

function mapGroundingFailures(
  failures: Array<{ index: number; confidenceScore: number; lexicalCoverage: number; missingTokens: string[] }>
): QuizGroundingFailureDto[] {
  return failures.map((failure) => ({
    index: failure.index,
    reason: buildUserFriendlyGroundingReason(failure),
    missingTokens: failure.missingTokens || [],
    phraseConfidence: failure.confidenceScore,
    lexicalCoverage: failure.lexicalCoverage,
  }));
}

function compactQuizSourceContent(rawContent: string): { content: string; truncated: boolean; originalChars: number } {
  const value = String(rawContent || "");
  const originalChars = value.length;
  const defaultBudget = process.env.ONPREM_MODE === 'true' ? 80_000 : 140_000;
  const budget = Math.max(
    20_000,
    Math.min(240_000, Number(process.env.QUIZ_SOURCE_MAX_CHARS || defaultBudget))
  );
  if (originalChars <= budget) {
    return { content: value, truncated: false, originalChars };
  }

  const marker = "\n\n[... source content condensed for generation responsiveness ...]\n\n";
  const head = Math.floor((budget - marker.length) * 0.6);
  const tail = Math.max(0, budget - marker.length - head);
  return {
    content: `${value.slice(0, head)}${marker}${value.slice(Math.max(0, originalChars - tail))}`,
    truncated: true,
    originalChars,
  };
}

function normalizeEvidenceText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildEvidenceTokens(value: string): string[] {
  const stop = new Set([
    "about", "according", "across", "after", "among", "answer", "answers", "based", "below", "content",
    "correct", "course", "each", "false", "following", "from", "given", "identify", "lesson", "match",
    "pair", "pairs", "question", "questions", "review", "select", "selected", "source", "statement",
    "statements", "student", "students", "text", "that", "their", "there", "these", "this", "true", "using",
    "which", "with", "without", "would", "your", "option", "options", "quiz", "quizzes",
  ]);
  return Array.from(
    new Set(
      normalizeEvidenceText(value)
        .split(" ")
        .map((t) => t.trim())
        .filter((t) => t.length >= 4 && !stop.has(t))
    )
  );
}

function extractTopSourceEvidenceSnippets(sourceContent: string, questionText: string, maxSnippets = 3): string[] {
  const content = String(sourceContent || "").trim();
  const question = String(questionText || "").trim();
  if (!content || !question) return [];

  const queryTokens = buildEvidenceTokens(question);
  if (!queryTokens.length) return [];

  const sentences = content
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20);

  const ranked = sentences
    .map((sentence) => {
      const normalizedSentence = normalizeEvidenceText(sentence);
      let matchCount = 0;
      for (const token of queryTokens) {
        if (normalizedSentence.includes(token)) matchCount++;
      }
      const score = queryTokens.length ? matchCount / queryTokens.length : 0;
      return { sentence, score, matchCount };
    })
    .filter((entry) => entry.matchCount > 0)
    .sort((a, b) => b.score - a.score || b.matchCount - a.matchCount || b.sentence.length - a.sentence.length)
    .slice(0, maxSnippets)
    .map((entry) => entry.sentence);

  return ranked;
}

function isTopAdminSession(req: Request): boolean {
  const role = req.session?.context?.effectiveRole;
  return role === 'SuperAdmin' || role === 'CustSuper';
}

async function resolveScopedOrganizationId(req: Request, requestedOrganizationId?: string): Promise<string> {
  const requested = String(requestedOrganizationId || '').trim() || null;
  const effective = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
  const effectiveOrgId = String(effective.organizationId || '').trim() || null;

  if (effective.isImpersonation) {
    if (!effectiveOrgId) {
      throw new Error('No effective organization found for impersonation session');
    }
    if (requested && requested !== effectiveOrgId) {
      console.warn(
        `[AI Routes] Organization mismatch during impersonation: requested=${requested}, effective=${effectiveOrgId}, user=${req.session?.userId}. Using effective org.`
      );
    }
    return effectiveOrgId;
  }

  if (requested) {
    return requested;
  }

  if (effectiveOrgId) {
    return effectiveOrgId;
  }

  throw new Error('Organization ID required');
}

async function refundQuizGenerationCredits(params: {
  userId: string;
  organizationId: string;
  deduction: {
    amount: number;
    creditSource: 'user' | 'organization' | 'split';
    userAmountDeducted: number;
    orgAmountDeducted: number;
    userTransactionId?: string;
    orgTransactionId?: string;
    correlationId: string;
  };
  reason: string;
}) {
  const { userId, organizationId, deduction, reason } = params;
  const refundSummary: Array<string> = [];

  if (deduction.userAmountDeducted > 0) {
    await CreditService.refundCredits(
      userId,
      organizationId,
      deduction.userAmountDeducted,
      undefined,
      reason,
      deduction.userTransactionId
    );
    refundSummary.push(`user:${deduction.userAmountDeducted}`);
  }

  if (deduction.orgAmountDeducted > 0) {
    await OrganizationCreditService.refundCredits({
      organizationId,
      actorUserId: userId,
      amount: deduction.orgAmountDeducted,
      correlationId: `${deduction.orgTransactionId || deduction.correlationId}:refund:org`,
      reason,
      metadata: {
        source: 'ai_quiz_generation',
        originalOrgTransactionId: deduction.orgTransactionId || null,
      },
    });
    refundSummary.push(`org:${deduction.orgAmountDeducted}`);
  }

  return refundSummary.join(', ') || 'none';
}

function isPlaceholderSecret(value?: string | null): boolean {
  const trimmed = String(value || '').trim();
  if (!trimmed) return true;
  return /^(your_|changeme|replace_me|example)/i.test(trimmed);
}

async function getConfiguredGeminiKey(): Promise<string | null> {
  const integrated = await IntegrationConfigService.getSecret('gemini', 'apiKey');
  if (!isPlaceholderSecret(integrated)) return integrated;
  return null;
}

async function getConfiguredElevenLabsKey(): Promise<string | null> {
  const integrated = await IntegrationConfigService.getSecret('elevenlabs', 'apiKey');
  if (!isPlaceholderSecret(integrated)) return integrated;
  return null;
}

async function getConfiguredMailerSendKey(): Promise<string | null> {
  const integrated = await IntegrationConfigService.getSecret('mailersend', 'apiKey');
  if (!isPlaceholderSecret(integrated)) return integrated;
  return null;
}

export function createAIRouter(): Router {
  const router = Router();
  const VALID_PROVIDERS: IntegrationProvider[] = ["mailersend", "smtp", "gemini", "gamma", "elevenlabs", "yoco"];
  const PROVIDER_PARAM = ":provider(mailersend|smtp|gemini|gamma|elevenlabs|yoco)";
  const isProviderAllowed = (provider: IntegrationProvider) => {
    if (!VALID_PROVIDERS.includes(provider)) return false;
    if (isOnPremMode() && provider === "yoco") return false;
    return true;
  };
  const isSupportedGoogleModelName = (modelName: string) => {
    const normalized = String(modelName || '').trim().toLowerCase();
    return normalized.startsWith('gemini') || normalized.startsWith('nano-banana');
  };

  router.get("/api/admin/secrets", isSuperAdminOrCustSuper, async (_req: Request, res: Response) => {
    res.status(410).json({
      error: "Legacy secret endpoints are retired. Use /api/admin/integrations.",
      migration: "/admin/integration-settings",
    });
  });

  router.get("/api/admin/integrations", isSuperAdminOrCustSuper, async (_req: Request, res: Response) => {
    try {
      const providers = await IntegrationConfigService.listProviderSummaries();
      const emailTransport = await IntegrationConfigService.getActiveEmailProvider();
      res.json({ providers, emailTransport });
    } catch (error: any) {
      console.error("[IntegrationSettings] Failed to list integrations:", error);
      res.status(500).json({ error: "Failed to load integration settings." });
    }
  });

  router.get("/api/admin/integrations/email-transport", isSuperAdminOrCustSuper, async (_req: Request, res: Response) => {
    try {
      const activeProvider = await IntegrationConfigService.getActiveEmailProvider();
      res.json({ activeProvider });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "Failed to load email transport configuration." });
    }
  });

  router.put("/api/admin/integrations/email-transport", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const activeProvider = String(req.body?.activeProvider || "").trim().toLowerCase();
      if (activeProvider !== "smtp" && activeProvider !== "mailersend") {
        return res.status(400).json({ error: "activeProvider must be smtp or mailersend." });
      }
      await IntegrationConfigService.setActiveEmailProvider(activeProvider as any, req.session?.userId || null);
      res.json({ success: true, activeProvider });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || "Failed to save email transport configuration." });
    }
  });

  router.get(`/api/admin/integrations/${PROVIDER_PARAM}`, isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const provider = String(req.params.provider || "").toLowerCase() as IntegrationProvider;
      if (!isProviderAllowed(provider)) {
        return res.status(400).json({ error: "Unsupported integration provider." });
      }
      const summary = await IntegrationConfigService.getProviderSummary(provider);
      res.json(summary);
    } catch (error: any) {
      console.error("[IntegrationSettings] Failed to get integration provider:", error);
      res.status(500).json({ error: "Failed to load integration provider settings." });
    }
  });

  router.get(`/api/admin/integrations/${PROVIDER_PARAM}/model-options`, isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const provider = String(req.params.provider || "").toLowerCase() as IntegrationProvider;
      if (provider !== "gemini" && provider !== "elevenlabs") {
        return res.status(400).json({ error: "Model options are supported only for gemini and elevenlabs." });
      }

      if (provider === "gemini") {
        const key = await getConfiguredGeminiKey();
        if (!key) {
          return res.json({
            options: [],
            source: "no_config",
            error: "No valid Gemini API key found. Configure it in Integration Settings.",
          });
        }
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
        if (!response.ok) {
          const body = await response.text();
          return res.json({
            options: [],
            source: "error",
            error: `Gemini API returned ${response.status}.`,
            message: body.replace(/\s+/g, " ").trim().slice(0, 400),
          });
        }
        const data: any = await response.json();
        const options: Array<{ value: string; label: string; capabilities: string[]; category: "text" | "image" | "mixed" }> = [];
        for (const model of data.models || []) {
          const value = model.name?.replace("models/", "") || "";
          if (!value || !isSupportedGoogleModelName(value)) continue;
          const displayName = model.displayName || value;
          const methods: string[] = model.supportedGenerationMethods || [];
          const capabilities: string[] = [];
          if (methods.includes("generateContent") || methods.includes("countTokens")) capabilities.push("text");
          if (value.includes("image") || value.includes("flash-exp") || value.includes("2.0-flash") || value.includes("banana")) capabilities.push("image");
          if (!capabilities.length) continue;
          const category: "text" | "image" | "mixed" =
            capabilities.includes("text") && capabilities.includes("image")
              ? "mixed"
              : capabilities.includes("image")
                ? "image"
                : "text";
          options.push({ value, label: displayName, capabilities, category });
        }
        options.sort((a, b) => {
          const aRank = a.category === "mixed" ? 0 : a.category === "text" ? 1 : 2;
          const bRank = b.category === "mixed" ? 0 : b.category === "text" ? 1 : 2;
          if (aRank !== bRank) return aRank - bRank;
          return a.value.localeCompare(b.value);
        });
        return res.json({ options, source: "gemini_api", count: options.length });
      }

      const key = await getConfiguredElevenLabsKey();
      if (!key) {
        return res.json({
          options: [],
          source: "no_config",
          error: "No valid ElevenLabs API key found. Configure it in Integration Settings.",
        });
      }
      let response = await fetch("https://api.elevenlabs.io/v1/models", {
        headers: { "xi-api-key": key, accept: "application/json" },
      });
      if (!response.ok && (response.status === 401 || response.status === 403)) {
        // Some keys can synthesize voices but cannot read model catalog.
        const fallback = await fetch("https://api.elevenlabs.io/v1/voices", {
          headers: { "xi-api-key": key, accept: "application/json" },
        });
        if (fallback.ok) {
          const currentModel = (await IntegrationConfigService.getSetting<string>("elevenlabs", "modelId")) || "eleven_multilingual_v2";
          return res.json({
            options: [{ value: currentModel, label: `${currentModel} (current)`, category: "tts", capabilities: ["tts"] }],
            source: "elevenlabs_fallback_current",
            error: "Model catalog not permitted for this key. Using current configured model.",
          });
        }
      }
      if (!response.ok) {
        const body = await response.text();
        return res.json({
          options: [],
          source: "error",
          error: `ElevenLabs API returned ${response.status}.`,
          message: body.replace(/\s+/g, " ").trim().slice(0, 400),
        });
      }
      const data: any = await response.json();
      const options: Array<{ value: string; label: string; category: "tts" | "other"; capabilities: string[] }> = [];
      for (const model of data.models || []) {
        const value = String(model.model_id || model.modelId || "").trim();
        if (!value) continue;
        const label = String(model.name || value).trim();
        const canTts = !!(model.can_do_text_to_speech ?? model.canDoTextToSpeech ?? true);
        const capabilities = canTts ? ["tts"] : [];
        options.push({
          value,
          label,
          category: canTts ? "tts" : "other",
          capabilities,
        });
      }
      options.sort((a, b) => {
        const aRank = a.category === "tts" ? 0 : 1;
        const bRank = b.category === "tts" ? 0 : 1;
        if (aRank !== bRank) return aRank - bRank;
        return a.value.localeCompare(b.value);
      });
      return res.json({ options, source: "elevenlabs_api", count: options.length });
    } catch (error: any) {
      console.error("[IntegrationSettings] Failed to fetch model options:", error);
      res.json({
        options: [],
        source: "error",
        error: "Unable to fetch model options from provider API.",
        message: error?.message || "Unknown error",
      });
    }
  });

  router.get(`/api/admin/integrations/${PROVIDER_PARAM}/balance`, isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const provider = String(req.params.provider || "").toLowerCase() as IntegrationProvider;
      if (!isProviderAllowed(provider)) {
        return res.status(400).json({ error: "Unsupported integration provider." });
      }

      if (provider === "elevenlabs") {
        try {
          const eleven = await ElevenLabsService.getInstance();
          const usage = await eleven.getSubscriptionUsageOrThrow();
          return res.json({
            provider,
            sourceOfTruth: "provider_api",
            characterCount: usage.characterCount ?? null,
            characterLimit: usage.characterLimit ?? null,
            remainingCharacters:
              typeof usage.characterLimit === "number" && typeof usage.characterCount === "number"
                ? Math.max(0, usage.characterLimit - usage.characterCount)
                : null,
            nextCharacterCountResetUnix: usage.nextCharacterCountResetUnix ?? null,
          });
        } catch (providerError: any) {
          const upstreamStatus = Number(providerError?.status || 0) || null;
          const upstreamBody = String(providerError?.raw || providerError?.message || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 500);
          return res.status(502).json({
            error: "Unable to read ElevenLabs provider balance.",
            provider,
            upstreamStatus,
            upstreamMessage: upstreamBody || null,
          });
        }
      }

      if (provider === "gamma") {
        const systemBalance = await CreditService.getSystemBalanceDetails();
        return res.json({
          provider,
          sourceOfTruth: "reconciled_internal",
          available: typeof systemBalance.currentBalance === "number",
          creditsRemaining: typeof systemBalance.currentBalance === "number" ? systemBalance.currentBalance : null,
          lastSnapshotAt: systemBalance.lastSnapshot ? new Date(systemBalance.lastSnapshot).toISOString() : null,
          totalDeducted: typeof systemBalance.totalDeducted === "number" ? systemBalance.totalDeducted : null,
          note: systemBalance.lastSnapshot
            ? "Balance is reconciled from latest Gamma-reported snapshot and internal ledger."
            : "No Gamma snapshot captured yet. Balance will appear after first successful Gamma usage reconciliation.",
          billingUrl: "https://gamma.app/settings/billing",
        });
      }

      return res.status(400).json({ error: "Balance endpoint is supported only for elevenlabs and gamma." });
    } catch (error: any) {
      console.error("[IntegrationSettings] Failed to load provider balance:", error);
      return res.status(500).json({
        error: error?.message || "Failed to load provider balance.",
      });
    }
  });

  router.get("/api/admin/integrations/mailersend/template-options", isSuperAdminOrCustSuper, async (_req: Request, res: Response) => {
    try {
      const apiKey = await getConfiguredMailerSendKey();
      if (!apiKey) {
        return res.json({
          options: [],
          source: "no_config",
          error: "No valid MailerSend API key found. Configure it in Integration Settings.",
        });
      }

      const response = await fetch("https://api.mailersend.com/v1/templates?limit=100", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          accept: "application/json",
        },
      });

      if (!response.ok) {
        const body = await response.text();
        return res.json({
          options: [],
          source: "error",
          error: `MailerSend API returned ${response.status}.`,
          message: body.replace(/\s+/g, " ").trim().slice(0, 400),
        });
      }

      const data: any = await response.json();
      const templates = Array.isArray(data?.data) ? data.data : [];
      const options = templates
        .map((template: any) => {
          const id = String(template?.id || "").trim();
          const name = String(template?.name || "").trim();
          if (!id) return null;
          return {
            value: id,
            label: name ? `${name} (${id})` : id,
            name: name || id,
            category: "template",
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));

      return res.json({ options, source: "mailersend_api", count: options.length });
    } catch (error: any) {
      console.error("[IntegrationSettings] Failed to fetch MailerSend template options:", error);
      return res.json({
        options: [],
        source: "error",
        error: "Unable to fetch MailerSend templates from provider API.",
        message: error?.message || "Unknown error",
      });
    }
  });

  router.put(`/api/admin/integrations/${PROVIDER_PARAM}/secrets/:key`, isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const provider = String(req.params.provider || "").toLowerCase() as IntegrationProvider;
      if (!isProviderAllowed(provider)) {
        return res.status(400).json({ error: "Unsupported integration provider." });
      }
      const secretKey = String(req.params.key || "").trim();
      const value = String(req.body?.value || "").trim();
      if (!value) {
        return res.status(400).json({ error: "Secret value is required." });
      }
      await IntegrationConfigService.setProviderSecret({
        provider,
        secretKey,
        value,
        updatedBy: req.session?.userId || null,
      });
      const summary = await IntegrationConfigService.getProviderSummary(provider);
      res.json({ success: true, provider: summary });
    } catch (error: any) {
      console.error("[IntegrationSettings] Failed to save integration secret:", error);
      res.status(400).json({ error: error?.message || "Failed to save integration secret." });
    }
  });

  router.delete(`/api/admin/integrations/${PROVIDER_PARAM}/secrets/:key`, isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const provider = String(req.params.provider || "").toLowerCase() as IntegrationProvider;
      if (!isProviderAllowed(provider)) {
        return res.status(400).json({ error: "Unsupported integration provider." });
      }
      const secretKey = String(req.params.key || "").trim();
      await IntegrationConfigService.deleteProviderSecret({ provider, secretKey });
      const summary = await IntegrationConfigService.getProviderSummary(provider);
      res.json({ success: true, provider: summary });
    } catch (error: any) {
      console.error("[IntegrationSettings] Failed to delete integration secret:", error);
      res.status(400).json({ error: error?.message || "Failed to delete integration secret." });
    }
  });

  router.put(`/api/admin/integrations/${PROVIDER_PARAM}/settings/:key`, isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const provider = String(req.params.provider || "").toLowerCase() as IntegrationProvider;
      if (!isProviderAllowed(provider)) {
        return res.status(400).json({ error: "Unsupported integration provider." });
      }
      const settingKey = String(req.params.key || "").trim();
      const value = req.body?.value;
      await IntegrationConfigService.setProviderSetting({
        provider,
        settingKey,
        value,
        updatedBy: req.session?.userId || null,
      });
      const summary = await IntegrationConfigService.getProviderSummary(provider);
      res.json({ success: true, provider: summary });
    } catch (error: any) {
      console.error("[IntegrationSettings] Failed to save integration setting:", error);
      res.status(400).json({ error: error?.message || "Failed to save integration setting." });
    }
  });

  router.post(`/api/admin/integrations/${PROVIDER_PARAM}/test`, isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const provider = String(req.params.provider || "").toLowerCase() as IntegrationProvider;
      if (!isProviderAllowed(provider)) {
        return res.status(400).json({ error: "Unsupported integration provider." });
      }
      const result = await IntegrationConfigService.testProvider(provider);
      await IntegrationAuditService.logIntegrationEvent({
        provider,
        operation: "manual_test",
        status: result.success ? "success" : "failure",
        severity: result.success ? "info" : "error",
        message: result.message,
        actorUserId: req.session?.userId || null,
        metadata: { details: result.details || null },
      });
      res.json(result);
    } catch (error: any) {
      console.error("[IntegrationSettings] Failed to test integration:", error);
      res.status(400).json({ success: false, message: error?.message || "Integration test failed." });
    }
  });

  router.put("/api/admin/secrets/:key", isSuperAdminOrCustSuper, async (_req: Request, res: Response) => {
    res.status(410).json({
      error: "Legacy secret endpoints are retired. Use /api/admin/integrations.",
      migration: "/admin/integration-settings",
    });
  });

  router.delete("/api/admin/secrets/:key", isSuperAdminOrCustSuper, async (_req: Request, res: Response) => {
    res.status(410).json({
      error: "Legacy secret endpoints are retired. Use /api/admin/integrations.",
      migration: "/admin/integration-settings",
    });
  });

  router.get("/api/admin/integrations/logs", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const logs = await IntegrationAuditService.listIntegrationEvents({
        provider: req.query.provider ? String(req.query.provider) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
        operation: req.query.operation ? String(req.query.operation) : undefined,
        organizationId: req.query.organizationId ? String(req.query.organizationId) : undefined,
        from: req.query.from ? String(req.query.from) : undefined,
        to: req.query.to ? String(req.query.to) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : 250,
      });
      const summary = await IntegrationAuditService.summarizeIntegrationHealth(24);
      res.json({ logs, summary });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "Failed to load integration logs." });
    }
  });

  router.get("/api/admin/system-changes", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const logs = await IntegrationAuditService.listSystemChanges({
        domain: req.query.domain ? String(req.query.domain) : undefined,
        provider: req.query.provider ? String(req.query.provider) : undefined,
        key: req.query.key ? String(req.query.key) : undefined,
        actorUserId: req.query.actorUserId ? String(req.query.actorUserId) : undefined,
        from: req.query.from ? String(req.query.from) : undefined,
        to: req.query.to ? String(req.query.to) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : 250,
      });
      res.json({ logs });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "Failed to load system change audit log." });
    }
  });

  // AI Configuration Routes (SuperAdmin only)
  router.get("/api/ai/config", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const configs = await storage.getAllAiConfigs();
      if (isOnPremMode()) {
        const redacted = configs.map(c => ({ ...c, apiKey: null }));
        return res.json(redacted);
      }
      res.json(configs);
    } catch (error) {
      console.error("Get AI configs error:", error);
      res.status(500).json({ error: "Failed to get AI configurations" });
    }
  });

  // Fetch available Gemini models dynamically (SuperAdmin only)
  router.get("/api/ai/models", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const fallbackGeminiKey = await getConfiguredGeminiKey();
      const keyCandidates: Array<{ key: string; source: 'integration_settings' }> = [];
      const seen = new Set<string>();

      if (!isPlaceholderSecret(fallbackGeminiKey) && !seen.has(String(fallbackGeminiKey))) {
        seen.add(String(fallbackGeminiKey));
        keyCandidates.push({ key: fallbackGeminiKey!, source: 'integration_settings' });
      }

      if (keyCandidates.length === 0) {
        console.log("[AI Models] No API key configured");
        return res.json({ 
          models: [],
          source: "no_config",
          error: "No valid Gemini API key found. Configure it in Integration Settings."
        });
      }
      let lastFetchError: string | undefined;
      for (const candidate of keyCandidates) {
        try {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(String(candidate.key))}`
          );

          if (!response.ok) {
            const responseBody = await response.text();
            const compactBody = responseBody.replace(/\s+/g, " ").trim().slice(0, 400);
            throw new Error(`API returned ${response.status}: ${response.statusText}${compactBody ? ` | ${compactBody}` : ""}`);
          }

          const data = await response.json();
          const models: Array<{ name: string; displayName: string; capabilities: string[] }> = [];

          for (const model of data.models || []) {
            const modelName = model.name?.replace("models/", "") || "";
            const displayName = model.displayName || modelName;
            const supportedActions = model.supportedGenerationMethods || [];

            if (!isSupportedGoogleModelName(modelName)) {
              continue;
            }

            const capabilities: string[] = [];

            if (supportedActions.includes("generateContent") ||
              supportedActions.includes("countTokens")) {
              capabilities.push("text");
            }

            if (modelName.includes('image') ||
              modelName.includes('flash-exp') ||
              modelName.includes('2.0-flash') ||
              modelName.includes('banana')) {
              capabilities.push("image");
            }

            if (capabilities.length > 0) {
              models.push({ name: modelName, displayName, capabilities });
            }
          }

          models.sort((a, b) => {
            const aHasImage = a.capabilities.includes('image') ? 0 : 1;
            const bHasImage = b.capabilities.includes('image') ? 0 : 1;
            if (aHasImage !== bHasImage) return aHasImage - bHasImage;
            return a.name.localeCompare(b.name);
          });

          return res.json({
            models,
            source: "gemini_api",
            keySource: candidate.source,
            count: models.length
          });
        } catch (fetchError: any) {
          lastFetchError = fetchError?.message || String(fetchError);
          console.warn(`[AI Models] Failed with ${candidate.source} key:`, lastFetchError);
        }
      }

      return res.json({
        models: [],
        source: "error",
        error: "Unable to fetch models from Gemini API. Please check your API key configuration.",
        message: lastFetchError
      });
    } catch (error: any) {
      console.error("[AI Models] Error fetching models:", error);
      res.json({ 
        models: [],
        source: "error",
        error: "Unable to fetch models from API. Please try again later.",
        message: error.message
      });
    }
  });

  router.post("/api/ai/config", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      if (req.body.provider && req.body.provider !== 'gemini') {
        return res.status(400).json({
          error: 'Invalid provider. Only "gemini" is supported.',
          field: 'provider'
        });
      }
      
      const validPurposes = ['text', 'image'];
      if (req.body.purpose && !validPurposes.includes(req.body.purpose)) {
        return res.status(400).json({
          error: 'Invalid purpose. Must be "text" or "image".',
          field: 'purpose'
        });
      }
      
      if (req.body.modelName && !isSupportedGoogleModelName(req.body.modelName)) {
        return res.status(400).json({
          error: `Invalid model name "${req.body.modelName}". Only Gemini or Nano Banana Google models are supported.`,
          field: 'modelName'
        });
      }
      
      const bodyData = { ...req.body, apiKey: "__managed_in_integration_settings__" };
      
      const data = insertAiConfigSchema.parse({
        ...bodyData,
        createdBy: req.session.userId
      });
      
      const config = await storage.createAiConfig(data);
      
      const allConfigs = await storage.getAllAiConfigs();
      const samePurposeConfigs = allConfigs.filter(c => c.purpose === config.purpose);
      if (samePurposeConfigs.length === 1) {
        await storage.setActiveAiConfig(config.id);
      }
      
      res.json(config);
    } catch (error: any) {
      console.error("Create AI config error:", error);
      if (error.code === '23505' && error.constraint === 'unique_active_per_purpose') {
        const purpose = req.body.purpose || 'text';
        const purposeLabel = purpose === 'image' ? 'Image Generation' : 'Text Generation';
        return res.status(409).json({ 
          error: `Only one active config per purpose is allowed. Deactivate the existing ${purposeLabel} config first, or create this config as inactive.` 
        });
      }
      res.status(400).json({ error: error.message || "Failed to create AI configuration" });
    }
  });

  router.patch("/api/ai/config/:id/activate", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const configToActivate = await storage.getAiConfigById(req.params.id);
      if (!configToActivate) {
        return res.status(404).json({ error: "Configuration not found" });
      }
      
      if (!isSupportedGoogleModelName(configToActivate.modelName)) {
        return res.status(400).json({
          error: `Cannot activate config with model "${configToActivate.modelName}". Only Gemini or Nano Banana Google models are supported.`,
          field: 'modelName'
        });
      }
      
      const config = await storage.setActiveAiConfig(req.params.id);
      if (!config) {
        return res.status(404).json({ error: "Configuration not found" });
      }
      res.json(config);
    } catch (error: any) {
      console.error("Activate AI config error:", error);
      
      if (error.code === '23505' && error.constraint === 'unique_active_per_purpose') {
        const purpose = error.purpose || 'this purpose';
        return res.status(409).json({
          error: `Only one active config per purpose is allowed. There is already an active configuration for ${purpose}.`
        });
      }
      
      res.status(500).json({ error: "Failed to activate configuration" });
    }
  });

  router.put("/api/ai/config/:id", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      if (req.body.provider && req.body.provider !== 'gemini') {
        return res.status(400).json({
          error: 'Invalid provider. Only "gemini" is supported.',
          field: 'provider'
        });
      }
      
      const validPurposes = ['text', 'image'];
      if (req.body.purpose && !validPurposes.includes(req.body.purpose)) {
        return res.status(400).json({
          error: 'Invalid purpose. Must be "text" or "image".',
          field: 'purpose'
        });
      }
      
      if (req.body.modelName && !isSupportedGoogleModelName(req.body.modelName)) {
        return res.status(400).json({
          error: `Invalid model name "${req.body.modelName}". Only Gemini or Nano Banana Google models are supported.`,
          field: 'modelName'
        });
      }
      
      const bodyData = {
        ...req.body,
        apiKey: "__managed_in_integration_settings__",
      };
      
      const data = insertAiConfigSchema.partial().parse(bodyData);
      const { isActive, ...safeData } = data;
      if (isActive !== undefined) {
        console.log("[AI Config] Ignoring isActive in PUT request - use /activate endpoint");
      }
      const config = await storage.updateAiConfig(req.params.id, safeData);
      if (!config) {
        return res.status(404).json({ error: "Configuration not found" });
      }

      await db
        .update(aiConfigTable)
        .set({ apiKey: "__managed_in_integration_settings__", updatedAt: new Date() })
        .where(eq(aiConfigTable.provider, "gemini"));
      res.json(config);
    } catch (error: any) {
      console.error("Update AI config error:", error);
      res.status(400).json({ error: error.message || "Failed to update configuration" });
    }
  });

  router.delete("/api/ai/config/:id", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const success = await storage.deleteAiConfig(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Configuration not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Delete AI config error:", error);
      res.status(500).json({ error: "Failed to delete configuration" });
    }
  });

  // AI Generate Quiz Metadata Route
  router.post("/api/ai/generate-quiz-metadata", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      const { primaryTopic, subtopic1, subtopic2, grade, subject, organizationId: requestedOrganizationId } = req.body;
      const organizationId = await resolveScopedOrganizationId(req, requestedOrganizationId);

      if (!primaryTopic) {
        return res.status(400).json({ error: "Primary topic is required" });
      }

      if (!isTopAdminSession(req)) {
        const roles = await storage.getUserRoles(user.id, organizationId);
        const hasPermission = roles.some(r => 
          ALL_STAFF_ROLES.includes(r.role)
        );
        if (!hasPermission) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const organization = await storage.getOrganization(organizationId);
      const curriculum = organization?.curriculum || 'CAPS';

      const aiService = await AIService.getActiveConfig();
      if (!aiService) {
        return res.status(503).json({ error: "AI service not configured. Please contact your administrator." });
      }

      const metadata = await aiService.generateQuizMetadata({
        primaryTopic,
        subtopic1,
        subtopic2,
        grade,
        subject,
        curriculum
      });

      res.json(metadata);
    } catch (error: any) {
      console.error("AI metadata generation error:", error);
      res.status(500).json({ error: error.message || "Failed to generate quiz metadata" });
    }
  });

  // AI Generate Lesson Topics Route (10-topic structure)
  router.post("/api/ai/generate-lesson-topics", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      const { lessonTitle, existingTopics, organizationId: requestedOrganizationId } = req.body;
      const organizationId = await resolveScopedOrganizationId(req, requestedOrganizationId);

      if (!lessonTitle || typeof lessonTitle !== 'string' || lessonTitle.trim().length === 0) {
        return res.status(400).json({ error: "Lesson title is required" });
      }

      if (!isTopAdminSession(req)) {
        const roles = await storage.getUserRoles(user.id, organizationId);
        const hasPermission = roles.some(r => 
          ALL_STAFF_ROLES.includes(r.role)
        );
        if (!hasPermission) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const { lessonDescriptionAIService } = await import('../services/lessonDescriptionAIService');
      
      const topics = await lessonDescriptionAIService.generateTopics({
        lessonTitle: lessonTitle.trim(),
        existingTopics: existingTopics || []
      });

      res.json({ topics });
    } catch (error: any) {
      console.error("AI lesson topics generation error:", error);
      
      if (error.message?.includes('quota') || error.message?.includes('429')) {
        return res.status(429).json({ error: "AI service quota exceeded. Please try again later." });
      }
      
      if (error.message?.includes('No active AI configuration')) {
        return res.status(503).json({ error: "AI service not configured. Please contact your administrator." });
      }
      
      res.status(500).json({ error: error.message || "Failed to generate lesson topics" });
    }
  });

  // AI Generate Lesson Description Route
  router.post("/api/ai/generate-lesson-description", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      const {
        lessonTitle,
        topics,
        mainTopic,
        subtopic1,
        subtopic2,
        organizationId: requestedOrganizationId,
        courseId,
        isOverview
      } = req.body;
      const organizationId = await resolveScopedOrganizationId(req, requestedOrganizationId);

      if (!lessonTitle || typeof lessonTitle !== 'string' || lessonTitle.trim().length === 0) {
        return res.status(400).json({ error: "Lesson title is required" });
      }

      if (!isTopAdminSession(req)) {
        const roles = await storage.getUserRoles(user.id, organizationId);
        const hasPermission = roles.some(r => 
          ALL_STAFF_ROLES.includes(r.role)
        );
        if (!hasPermission) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const { lessonDescriptionAIService } = await import('../services/lessonDescriptionAIService');
      
      let otherLessonsSummaries;
      if (isOverview && courseId) {
        const { CourseContextService } = await import('../services/courseContextService');
        const courseContext = await CourseContextService.buildCourseLessonSummaries(courseId);
        if (courseContext) {
          otherLessonsSummaries = courseContext.otherLessonsSummaries;
        } else {
          console.warn(`[AI Generate Description] Could not build course context for courseId: ${courseId}`);
        }
      }
      
      const description = await lessonDescriptionAIService.generateLessonDescription({
        lessonTitle: lessonTitle.trim(),
        topics: topics,
        mainTopic: mainTopic?.trim(),
        subtopic1: subtopic1?.trim(),
        subtopic2: subtopic2?.trim(),
        otherLessonsSummaries
      });

      res.json({ description });
    } catch (error: any) {
      console.error("AI lesson description generation error:", error);
      
      if (error.message?.includes('quota') || error.message?.includes('429')) {
        return res.status(429).json({ error: "AI service quota exceeded. Please try again later." });
      }
      
      if (error.message?.includes('No active AI configuration')) {
        return res.status(503).json({ error: "AI service not configured. Please contact your administrator." });
      }
      
      res.status(500).json({ error: error.message || "Failed to generate lesson description" });
    }
  });

  // AI Generation Route
  router.post("/api/ai/generate-quiz", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    let creditDeduction: {
      amount: number;
      creditSource: 'user' | 'organization' | 'split';
      userAmountDeducted: number;
      orgAmountDeducted: number;
      userTransactionId?: string;
      orgTransactionId?: string;
      correlationId: string;
    } | null = null;
    
    try {
      const requestStartedAt = Date.now();
      const correlationId = String(req.headers['x-correlation-id'] || '').trim() || `ai-quiz-${randomUUID()}`;
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      const {
        topic,
        primaryTopic,
        subtopic1,
        subtopic2,
        numberOfQuestions,
        difficulty,
        grade,
        subject,
        description,
        organizationId,
        questionTypeDistribution,
        lessonId,
        sourceSelection,
        learningObjectives,
      } = req.body;
      const normalizedLearningObjectives = sanitizeLearningObjectives(learningObjectives);
      
      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      if (lessonId) {
        const lessonType = await LessonService.getEffectiveCourseLessonType(lessonId);
        if (lessonType === 'overview') {
          return res.status(400).json({ error: "Quizzes are not allowed for overview lessons" });
        }
      }

      if (questionTypeDistribution) {
        const total = (questionTypeDistribution.multipleChoice || 0) + 
                     (questionTypeDistribution.trueFalse || 0) + 
                     (questionTypeDistribution.match || 0) + 
                     (questionTypeDistribution.fillBlank || 0);
        
        if (total !== 100) {
          return res.status(400).json({ error: "Question type distribution must sum to 100%" });
        }
      }

      if (!user.isSuperAdmin && !user.isCustSuper) {
        const roles = await storage.getUserRoles(user.id, organizationId);
        const hasPermission = roles.some(r => 
          ALL_STAFF_ROLES.includes(r.role)
        );
        if (!hasPermission) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const questionCount = parseInt(numberOfQuestions) || 10;
      let quizTier: '10' | '15' | '20' = '10';
      if (questionCount >= 20) {
        quizTier = '20';
      } else if (questionCount >= 15) {
        quizTier = '15';
      } else {
        quizTier = '10';
      }

      if (isQuizCreditChargingEnabled()) {
        try {
          const creditCost = await quizPricingService.getTierCreditCost(organizationId, quizTier);
          
          console.log(
            `[AI Quiz Generation] Credit charging enabled. User ${user.id}, Org ${organizationId}, ` +
            `Tier ${quizTier}, Cost: ${creditCost} credits`
          );
          
          const quizCorrelationId = `quiz_gen_${randomUUID()}`;
          const deductionResult = await HybridCreditService.deductWithFallback({
            userId: user.id,
            organizationId,
            amount: creditCost,
            type: 'quiz_generation',
            correlationId: quizCorrelationId,
            description: `Quiz generation: ${topic || 'Untitled'} - ${questionCount} questions (${quizTier} tier)`,
            metadata: { quizTier, questionCount, quizTitle: topic || 'Untitled Quiz' }
          });
          
          creditDeduction = {
            amount: creditCost,
            creditSource: deductionResult.creditSource,
            userAmountDeducted: deductionResult.userAmountDeducted,
            orgAmountDeducted: deductionResult.orgAmountDeducted,
            userTransactionId: deductionResult.userTransactionId,
            orgTransactionId: deductionResult.orgTransactionId,
            correlationId: quizCorrelationId,
          };
          
          console.log(
            `[AI Quiz Generation] Credits deducted: ${creditCost} credits. ` +
            `Source: ${deductionResult.creditSource}, User new balance: ${deductionResult.userNewBalance}, Org new balance: ${deductionResult.orgNewBalance}`
          );
        } catch (creditError) {
          if (creditError instanceof InsufficientHybridCreditsError) {
            console.log(
              `[AI Quiz Generation] Insufficient credits for user ${user.id}. ` +
              `Required: ${creditError.requiredAmount}, User balance: ${creditError.userBalance}, Org balance: ${creditError.orgBalance}`
            );
            return res.status(402).json({
              error: "Insufficient credits for quiz generation",
              code: "INSUFFICIENT_CREDITS",
              required: creditError.requiredAmount,
              userBalance: creditError.userBalance,
              orgBalance: creditError.orgBalance,
              orgWalletEnabled: creditError.orgWalletEnabled,
            });
          }
          throw creditError;
        }
      } else {
        console.log(`[AI Quiz Generation] Credit charging disabled - generating quiz for free`);
      }

      const organization = await storage.getOrganization(organizationId);
      const curriculum = organization?.curriculum || 'CAPS';

      let lessonContent: string | null = null;
      let sourceWarning: string | null = null;
      let resolvedSource: ResolvedQuizSource | null = null;
      let visualAssets: Array<{
        assetId: string;
        storageKey?: string;
        caption?: string | null;
        altText?: string | null;
        pageOrSlide?: number | null;
      }> = [];

      if (lessonId) {
        if (!sourceSelection || !sourceSelection.sourceType) {
          return res.status(400).json({
            error: "Quiz source selection is required when generating from a lesson",
          });
        }

        try {
          resolvedSource = await resolveLessonSourceSelection({
            lessonId,
            organizationId,
            selection: sourceSelection as QuizSourceSelection,
            allowManualTopic: false,
          });
          lessonContent = resolvedSource.content;
          sourceWarning = resolvedSource.warning || null;

          if (!lessonContent || !String(lessonContent).trim()) {
            return res.status(400).json({
              error: `Selected source ${resolvedSource.sourceType}/${resolvedSource.versionRef} has no usable content. Please choose another source or update the selected source content.`,
            });
          }

          if (String(lessonContent).trim().length < 300) {
            return res.status(400).json({
              error: `Selected source ${resolvedSource.sourceType}/${resolvedSource.versionRef} is too short for grounded quiz generation. Expand/refine this source or select another version.`,
            });
          }

          const compacted = compactQuizSourceContent(lessonContent);
          lessonContent = compacted.content;
          if (compacted.truncated) {
            console.log(
              `[AI Quiz Generation] Compacted source content from ${compacted.originalChars} chars to ${lessonContent.length} chars ` +
              `(lesson=${lessonId}, correlationId=${correlationId})`
            );
          }

          console.log(
            `[AI Quiz Generation] Using selected source ${resolvedSource.sourceType}/${resolvedSource.versionRef} ` +
            `(~${Math.ceil(lessonContent.length / 4)} tokens)`
          );

          const lessonRow = await db.query.lessons.findFirst({
            where: eq(lessons.id, lessonId),
            columns: { metadata: true },
          });
          const sourceAssetRefs = Array.isArray((lessonRow?.metadata as any)?.sourceAssets)
            ? ((lessonRow!.metadata as any).sourceAssets as any[])
            : [];
          const quizAssetRefs = sourceAssetRefs.filter((asset) =>
            asset?.assetId && (asset.recommendedUse === 'quiz_stimulus' || asset.recommendedUse === 'lesson_visual')
          );
          const assetIds = Array.from(new Set(quizAssetRefs.map((asset) => String(asset.assetId))));
          if (assetIds.length > 0) {
            const assetRows = await db.query.courseSourceAssets.findMany({
              where: inArray(courseSourceAssets.id, assetIds),
            });
            const refById = new Map(quizAssetRefs.map((ref) => [String(ref.assetId), ref]));
            visualAssets = assetRows.map((asset) => {
              const ref = refById.get(String(asset.id)) || {};
              return {
                assetId: asset.id,
                storageKey: asset.storageKey,
                caption: ref.caption || asset.caption,
                altText: ref.altText || asset.altText,
                pageOrSlide: ref.pageOrSlide || asset.pageOrSlide,
              };
            });
          }
        } catch (sourceError: any) {
          console.error(`[AI Quiz Generation] Source resolution failed for lesson ${lessonId}:`, sourceError);
          return res.status(400).json({
            error: sourceError?.message || "Failed to resolve selected quiz source content",
          });
        }
      }

      const aiService = await AIService.getActiveConfig();
      if (!aiService) {
        if (creditDeduction) {
          try {
            const refunded = await refundQuizGenerationCredits({
              userId: user.id,
              organizationId,
              deduction: creditDeduction,
              reason: 'AI quiz generation failed: AI service unavailable',
            });
            console.log(`[AI Quiz Generation] Refunded deducted credits due to unavailable AI service (${refunded})`);
            creditDeduction = null;
          } catch (refundError) {
            console.error('[AI Quiz Generation] Failed to auto-refund credits when AI service was unavailable:', refundError);
          }
        }
        return res.status(503).json({ error: "AI service not configured. Please contact your administrator." });
      }

      let questions: any[] = [];
      let needsReview = false;
      let groundingFailures: QuizGroundingFailureDto[] = [];
      let groundingErrorMessage: string | null = null;

      try {
        questions = await aiService.generateQuizQuestions({
          topic,
          primaryTopic,
          subtopic1,
          subtopic2,
          numberOfQuestions: questionCount,
          difficulty: difficulty || 'medium',
          grade,
          subject,
          description,
          curriculum,
          questionTypeDistribution,
          lessonContent,
          learningObjectives: normalizedLearningObjectives,
          visualAssets,
        });
      } catch (generationError: any) {
        if (generationError instanceof QuizGroundingValidationError) {
          needsReview = true;
          groundingErrorMessage = generationError.message;
          groundingFailures = mapGroundingFailures(generationError.failures);

          const rejectedIndex = new Map<number, typeof groundingFailures[number]>();
          for (const failure of groundingFailures) {
            rejectedIndex.set(failure.index, failure);
          }

          questions = generationError.rejectedQuestions.map((question, index) => {
            const failure = rejectedIndex.get(index);
            const isRejected = Boolean(failure);
            return {
              ...question,
              selected: true,
              validatorStatus: isRejected ? "rejected" : "passed",
              userDisposition: isRejected ? "pending" : "accepted",
              validatorReason: failure?.reason || null,
              validatorMissingTokens: failure?.missingTokens || [],
            };
          });

          console.warn(
            `[AI Quiz Generation] Returning ${questions.length} reviewable questions after strict grounding rejection; user review required before publish.`
          );
        } else {
          throw generationError;
        }
      }

      if (creditDeduction) {
        console.log(
          `[AI Quiz Generation] Successfully generated quiz. Credits used: ${creditDeduction.amount}, ` +
          `Source: ${creditDeduction.creditSource}`
        );
      }

      // Include warning if transcript was still processing
      const response: {
        questions: any;
        warning?: string;
        usedLessonContent: boolean;
        usedSourceContract?: any;
        needsReview?: boolean;
        groundingError?: string | null;
        groundingFailures?: QuizGroundingFailureDto[];
      } = {
        questions,
        usedLessonContent: !!lessonContent,
      };
      
      if (sourceWarning) {
        response.warning = sourceWarning;
      }

      if (resolvedSource && lessonContent) {
        response.usedSourceContract = buildSourceContract({
          resolved: resolvedSource,
          content: lessonContent,
          selectedAt: new Date().toISOString(),
          selectedBy: user.id,
        });
      }

      if (needsReview) {
        response.needsReview = true;
        response.groundingError = groundingErrorMessage;
        response.groundingFailures = groundingFailures;
      }

      console.log(
        `[AI Quiz Generation] Completed in ${Date.now() - requestStartedAt}ms ` +
        `(lesson=${lessonId || 'none'}, needsReview=${needsReview}, correlationId=${correlationId})`
      );
      (response as any).correlationId = correlationId;

      res.json(response);
    } catch (error: any) {
      console.error("AI generation error:", error);
      
      if (creditDeduction) {
        try {
          const refunded = await refundQuizGenerationCredits({
            userId: req.session.userId!,
            organizationId: String(req.body?.organizationId || ''),
            deduction: creditDeduction,
            reason: `AI quiz generation failed: ${error?.message || 'unknown error'}`,
          });
          console.log(
            `[AI Quiz Generation] AI error occurred and credits were auto-refunded (${refunded}). ` +
            `Original source: ${creditDeduction.creditSource}`
          );
        } catch (refundError) {
          console.error(
            `[AI Quiz Generation] AI error occurred but auto-refund failed. Deducted: ${creditDeduction.amount}, ` +
            `Source: ${creditDeduction.creditSource}. Manual intervention required.`,
            refundError
          );
        }
      }
      
      res.status(500).json({ error: error.message || "Failed to generate quiz" });
    }
  });

  // AI Regenerate Single Question
  router.post("/api/ai/regenerate-question", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      const {
        topic,
        primaryTopic,
        subtopic1,
        subtopic2,
        questionType,
        difficulty,
        grade,
        subject,
        description,
        organizationId,
        lessonId,
        sourceSelection,
        learningObjectives,
        preferredObjectiveId,
      } = req.body;
      const normalizedLearningObjectives = sanitizeLearningObjectives(learningObjectives);
      
      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const forcedQuestionType = ['multiple-choice', 'true-false', 'match', 'fill-blank'].includes(String(questionType))
        ? String(questionType) as 'multiple-choice' | 'true-false' | 'match' | 'fill-blank'
        : undefined;

      if (!user.isSuperAdmin && !user.isCustSuper) {
        const roles = await storage.getUserRoles(user.id, organizationId);
        const hasPermission = roles.some(r => 
          ALL_STAFF_ROLES.includes(r.role)
        );
        if (!hasPermission) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const aiService = await AIService.getActiveConfig();
      if (!aiService) {
        return res.status(503).json({ error: "AI service not configured" });
      }

      let lessonContent: string | null = null;
      if (lessonId) {
        if (!sourceSelection || !sourceSelection.sourceType) {
          return res.status(400).json({
            error: "Quiz source selection is required for lesson-linked question regeneration",
          });
        }

        try {
          const resolvedSource = await resolveLessonSourceSelection({
            lessonId,
            organizationId,
            selection: sourceSelection as QuizSourceSelection,
            allowManualTopic: false,
          });

          lessonContent = resolvedSource.content;
          if (!lessonContent || !String(lessonContent).trim()) {
            return res.status(400).json({
              error: `Selected source ${resolvedSource.sourceType}/${resolvedSource.versionRef} has no usable content for regeneration.`,
            });
          }
        } catch (sourceError: any) {
          return res.status(400).json({
            error: sourceError?.message || "Failed to resolve selected quiz source content",
          });
        }
      }

      try {
        const question = await aiService.regenerateQuestion({
          topic,
          primaryTopic,
          subtopic1,
          subtopic2,
          numberOfQuestions: 1,
          difficulty: difficulty || 'medium',
          grade,
          subject,
          description,
          lessonContent,
          forcedQuestionType,
          learningObjectives: normalizedLearningObjectives,
          preferredObjectiveId: String(preferredObjectiveId || "").trim() || null,
        }, []);

        res.json({ question, needsReview: false });
      } catch (regenerationError: any) {
        if (regenerationError instanceof QuizGroundingValidationError) {
          const groundingFailures = mapGroundingFailures(regenerationError.failures);
          const firstRejected = regenerationError.rejectedQuestions?.[0];
          const firstFailure = groundingFailures.find((failure) => failure.index === 0) || groundingFailures[0];

          if (!firstRejected) {
            return res.status(422).json({
              error: "Question regeneration failed source alignment checks and no reviewable question was returned.",
            });
          }

          return res.json({
            needsReview: true,
            groundingError:
              regenerationError.message ||
              "Regenerated question needs review because source alignment checks flagged it.",
            groundingFailures,
            question: {
              ...firstRejected,
              selected: true,
              validatorStatus: "rejected",
              userDisposition: "pending",
              validatorReason: firstFailure?.reason || "Not clearly supported by the selected source.",
              validatorMissingTokens: firstFailure?.missingTokens || [],
              phraseConfidence: firstFailure?.phraseConfidence ?? null,
              lexicalCoverage: firstFailure?.lexicalCoverage ?? null,
            },
          });
        }

        throw regenerationError;
      }
    } catch (error: any) {
      console.error("AI regenerate question error:", error);
      res.status(500).json({ error: error.message || "Failed to regenerate question" });
    }
  });

  router.post("/api/ai/source-evidence", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      const { organizationId, lessonId, sourceSelection, questionText } = req.body || {};
      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }
      if (!lessonId) {
        return res.status(400).json({ error: "Lesson ID required" });
      }
      if (!sourceSelection?.sourceType) {
        return res.status(400).json({ error: "Source selection is required" });
      }
      if (!String(questionText || "").trim()) {
        return res.status(400).json({ error: "Question text is required" });
      }

      if (!user.isSuperAdmin && !user.isCustSuper) {
        const roles = await storage.getUserRoles(user.id, organizationId);
        const hasPermission = roles.some((r) => ALL_STAFF_ROLES.includes(r.role));
        if (!hasPermission) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      let resolvedSource: ResolvedQuizSource;
      try {
        resolvedSource = await resolveLessonSourceSelection({
          lessonId,
          organizationId,
          selection: sourceSelection as QuizSourceSelection,
          allowManualTopic: false,
        });
      } catch (sourceError: any) {
        return res.status(400).json({
          error: sourceError?.message || "Failed to resolve selected source content",
        });
      }

      const content = String(resolvedSource.content || "").trim();
      if (!content) {
        return res.status(400).json({
          error: `Selected source ${resolvedSource.sourceType}/${resolvedSource.versionRef} has no usable content.`,
        });
      }

      const snippets = extractTopSourceEvidenceSnippets(content, String(questionText), 3);
      return res.json({
        snippets,
        source: {
          sourceType: resolvedSource.sourceType,
          versionRef: resolvedSource.versionRef,
          label: resolvedSource.label,
          createdAt: resolvedSource.createdAt,
          languageCode: resolvedSource.languageCode,
        },
      });
    } catch (error: any) {
      console.error("AI source evidence error:", error);
      return res.status(500).json({ error: error?.message || "Failed to load source evidence" });
    }
  });

  // AI Regenerate Answers
  router.post("/api/ai/regenerate-answers", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      const {
        question,
        correctAnswer,
        difficulty,
        topic,
        primaryTopic,
        subtopic1,
        subtopic2,
        grade,
        subject,
        description,
        organizationId,
        lessonId,
        sourceSelection,
      } = req.body;
      
      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      if (!user.isSuperAdmin && !user.isCustSuper) {
        const roles = await storage.getUserRoles(user.id, organizationId);
        const hasPermission = roles.some(r => 
          ALL_STAFF_ROLES.includes(r.role)
        );
        if (!hasPermission) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const aiService = await AIService.getActiveConfig();
      if (!aiService) {
        return res.status(503).json({ error: "AI service not configured" });
      }

      let lessonContent: string | null = null;
      if (lessonId) {
        if (!sourceSelection || !sourceSelection.sourceType) {
          return res.status(400).json({
            error: "Quiz source selection is required for lesson-linked answer regeneration",
          });
        }

        try {
          const resolvedSource = await resolveLessonSourceSelection({
            lessonId,
            organizationId,
            selection: sourceSelection as QuizSourceSelection,
            allowManualTopic: false,
          });

          lessonContent = resolvedSource.content;
          if (!lessonContent || !String(lessonContent).trim()) {
            return res.status(400).json({
              error: `Selected source ${resolvedSource.sourceType}/${resolvedSource.versionRef} has no usable content for regeneration.`,
            });
          }
        } catch (sourceError: any) {
          return res.status(400).json({
            error: sourceError?.message || "Failed to resolve selected quiz source content",
          });
        }
      }

      const answers = await aiService.regenerateAnswers(question, correctAnswer, {
        topic,
        primaryTopic,
        subtopic1,
        subtopic2,
        numberOfQuestions: 1,
        difficulty: difficulty || 'medium',
        grade,
        subject,
        description,
        lessonContent,
      });

      res.json(answers);
    } catch (error: any) {
      console.error("AI regenerate answers error:", error);
      res.status(500).json({ error: error.message || "Failed to regenerate answers" });
    }
  });

  // AI Test Route
  router.post("/api/ai/test", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      if (!user.isSuperAdmin && !user.isCustSuper && !user.isAdmin) {
        return res.status(403).json({ error: "Access denied" });
      }

      const aiService = await AIService.getActiveConfig();
      if (!aiService) {
        return res.status(503).json({ error: "AI service not configured" });
      }

      const testQuestion = await aiService.generateQuizQuestions({
        topic: "basic math",
        numberOfQuestions: 1,
        difficulty: 'easy'
      });

      res.json({ 
        message: "AI connection successful! Generated a test question.",
        testQuestion: testQuestion[0]
      });
    } catch (error: any) {
      console.error("AI test error:", error);
      res.status(500).json({ error: error.message || "AI test failed" });
    }
  });

  return router;
}
