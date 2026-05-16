import { createHash } from "crypto";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { translationAnalyticsEvents, translationAnalyticsEventTypeEnum } from "@shared/schema";

type TranslationAnalyticsEventType = (typeof translationAnalyticsEventTypeEnum.enumValues)[number];

type TrackEventInput = {
  organizationId: string;
  eventType: TranslationAnalyticsEventType;
  resourceType: "course" | "lesson" | "quiz" | "podcast";
  resourceId: string;
  userId?: string | null;
  languageCode?: string | null;
  variantId?: string | null;
  contentGroupId?: string | null;
  metadata?: Record<string, any>;
  occurredAt?: Date;
  dedupeSeed?: string;
};

function normalizeLanguage(code?: string | null): string | null {
  const normalized = String(code || "").trim().toLowerCase();
  return normalized || null;
}

export class TranslationAnalyticsService {
  static async trackEvent(input: TrackEventInput): Promise<void> {
    const canonicalGroupId = String(input.contentGroupId || input.variantId || input.resourceId);
    const occurredAt = input.occurredAt || new Date();
    const languageCode = normalizeLanguage(input.languageCode);
    const dedupeRaw = [
      input.organizationId,
      input.eventType,
      input.resourceType,
      input.resourceId,
      input.userId || "",
      canonicalGroupId,
      languageCode || "",
      input.dedupeSeed || "",
    ].join(":");
    const dedupeKey = createHash("sha256").update(dedupeRaw).digest("hex");

    await db
      .insert(translationAnalyticsEvents)
      .values({
        organizationId: input.organizationId,
        userId: input.userId || null,
        eventType: input.eventType,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        languageCode,
        variantId: input.variantId || null,
        contentGroupId: input.contentGroupId || null,
        canonicalGroupId,
        dedupeKey,
        metadata: input.metadata || {},
        occurredAt,
      })
      .onConflictDoNothing({ target: translationAnalyticsEvents.dedupeKey });
  }

  static async getLanguageSummary(params: {
    organizationId: string;
    startDate?: Date;
    endDate?: Date;
    eventType?: TranslationAnalyticsEventType;
  }): Promise<Array<{
    languageCode: string;
    eventType: string;
    totalEvents: number;
    dedupedEvents: number;
    uniqueUsers: number;
  }>> {
    const conditions: any[] = [eq(translationAnalyticsEvents.organizationId, params.organizationId)];
    if (params.startDate) conditions.push(gte(translationAnalyticsEvents.occurredAt, params.startDate));
    if (params.endDate) conditions.push(lte(translationAnalyticsEvents.occurredAt, params.endDate));
    if (params.eventType) conditions.push(eq(translationAnalyticsEvents.eventType, params.eventType));

    const rows = await db.execute(sql`
      SELECT
        COALESCE("languageCode", 'unknown') AS "languageCode",
        "eventType"::text AS "eventType",
        COUNT(*)::int AS "totalEvents",
        COUNT(DISTINCT CONCAT(COALESCE("userId", ''), ':', COALESCE("canonicalGroupId", "resourceId"), ':', "eventType", ':', DATE_TRUNC('minute', "occurredAt")))::int AS "dedupedEvents",
        COUNT(DISTINCT "userId")::int AS "uniqueUsers"
      FROM "translationAnalyticsEvents"
      WHERE ${and(...conditions)}
      GROUP BY COALESCE("languageCode", 'unknown'), "eventType"
      ORDER BY "languageCode" ASC, "eventType" ASC
    `);

    const typedRows = (rows as any).rows ?? rows;
    return (typedRows as any[]).map((r) => ({
      languageCode: String(r.languageCode),
      eventType: String(r.eventType),
      totalEvents: Number(r.totalEvents || 0),
      dedupedEvents: Number(r.dedupedEvents || 0),
      uniqueUsers: Number(r.uniqueUsers || 0),
    }));
  }

  static async listRecentEvents(params: {
    organizationId: string;
    limit?: number;
  }): Promise<any[]> {
    return db
      .select()
      .from(translationAnalyticsEvents)
      .where(eq(translationAnalyticsEvents.organizationId, params.organizationId))
      .orderBy(desc(translationAnalyticsEvents.occurredAt), desc(translationAnalyticsEvents.createdAt))
      .limit(Math.min(Math.max(params.limit || 100, 1), 1000));
  }
}
