import { and, desc, eq, gte, ilike, lte, sql } from 'drizzle-orm';
import { db } from '../db';
import { integrationEvents, systemChangeEvents } from '@shared/schema';

type JsonValue = Record<string, any> | any[] | null;

function redactValue(value: string | null | undefined, isSecret = false): string | null {
  if (value == null) return null;
  const normalized = String(value);
  if (!isSecret) return normalized;
  if (normalized.length <= 6) return '***';
  return `${normalized.slice(0, 2)}***${normalized.slice(-2)}`;
}

export class IntegrationAuditService {
  static async logSystemChange(params: {
    domain: string;
    action: string;
    key: string;
    provider?: string | null;
    isSecret?: boolean;
    beforeValue?: string | null;
    afterValue?: string | null;
    actorUserId?: string | null;
    actorRole?: string | null;
    organizationId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    correlationId?: string | null;
    metadata?: JsonValue;
  }): Promise<void> {
    try {
      await db.insert(systemChangeEvents).values({
        domain: params.domain,
        action: params.action,
        key: params.key,
        provider: params.provider || null,
        isSecret: !!params.isSecret,
        beforeValue: redactValue(params.beforeValue, !!params.isSecret),
        afterValue: redactValue(params.afterValue, !!params.isSecret),
        actorUserId: params.actorUserId || null,
        actorRole: params.actorRole || null,
        organizationId: params.organizationId || null,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        correlationId: params.correlationId || null,
        metadata: (params.metadata as any) || null,
      });
    } catch (error) {
      console.error('[IntegrationAudit] Failed to log system change:', error);
    }
  }

  static async logIntegrationEvent(params: {
    provider: string;
    operation: string;
    status: 'success' | 'failure' | 'degraded';
    severity?: 'info' | 'warn' | 'error';
    message?: string | null;
    requestSummary?: JsonValue;
    responseSummary?: JsonValue;
    errorCode?: string | null;
    durationMs?: number | null;
    actorUserId?: string | null;
    organizationId?: string | null;
    correlationId?: string | null;
    metadata?: JsonValue;
  }): Promise<void> {
    try {
      await db.insert(integrationEvents).values({
        provider: params.provider,
        operation: params.operation,
        status: params.status,
        severity: params.severity || (params.status === 'failure' ? 'error' : 'info'),
        message: params.message || null,
        requestSummary: (params.requestSummary as any) || null,
        responseSummary: (params.responseSummary as any) || null,
        errorCode: params.errorCode || null,
        durationMs: params.durationMs == null ? null : Math.max(0, Math.round(params.durationMs)),
        actorUserId: params.actorUserId || null,
        organizationId: params.organizationId || null,
        correlationId: params.correlationId || null,
        metadata: (params.metadata as any) || null,
      });
    } catch (error) {
      console.error('[IntegrationAudit] Failed to log integration event:', error);
    }
  }

  static async listSystemChanges(filters: {
    domain?: string;
    provider?: string;
    key?: string;
    actorUserId?: string;
    from?: string;
    to?: string;
    limit?: number;
  }) {
    const conditions: any[] = [];
    if (filters.domain) conditions.push(eq(systemChangeEvents.domain, filters.domain));
    if (filters.provider) conditions.push(eq(systemChangeEvents.provider, filters.provider));
    if (filters.key) conditions.push(ilike(systemChangeEvents.key, `%${filters.key}%`));
    if (filters.actorUserId) conditions.push(eq(systemChangeEvents.actorUserId, filters.actorUserId));
    if (filters.from) conditions.push(gte(systemChangeEvents.createdAt, new Date(filters.from)));
    if (filters.to) conditions.push(lte(systemChangeEvents.createdAt, new Date(filters.to)));

    const query = db.select().from(systemChangeEvents).$dynamic();
    if (conditions.length) {
      return query.where(and(...conditions)).orderBy(desc(systemChangeEvents.createdAt)).limit(Math.min(filters.limit || 200, 1000));
    }
    return query.orderBy(desc(systemChangeEvents.createdAt)).limit(Math.min(filters.limit || 200, 1000));
  }

  static async listIntegrationEvents(filters: {
    provider?: string;
    status?: string;
    operation?: string;
    organizationId?: string;
    from?: string;
    to?: string;
    limit?: number;
  }) {
    const conditions: any[] = [];
    if (filters.provider) conditions.push(eq(integrationEvents.provider, filters.provider));
    if (filters.status) conditions.push(eq(integrationEvents.status, filters.status));
    if (filters.organizationId) conditions.push(eq(integrationEvents.organizationId, filters.organizationId));
    if (filters.operation) conditions.push(ilike(integrationEvents.operation, `%${filters.operation}%`));
    if (filters.from) conditions.push(gte(integrationEvents.createdAt, new Date(filters.from)));
    if (filters.to) conditions.push(lte(integrationEvents.createdAt, new Date(filters.to)));

    const query = db.select().from(integrationEvents).$dynamic();
    if (conditions.length) {
      return query.where(and(...conditions)).orderBy(desc(integrationEvents.createdAt)).limit(Math.min(filters.limit || 200, 1000));
    }
    return query.orderBy(desc(integrationEvents.createdAt)).limit(Math.min(filters.limit || 200, 1000));
  }

  static async summarizeIntegrationHealth(hours = 24) {
    const since = new Date(Date.now() - Math.max(1, hours) * 60 * 60 * 1000);
    const rows = await db.execute(sql`
      SELECT provider,
             count(*)::int as total,
             sum(CASE WHEN status = 'success' THEN 1 ELSE 0 END)::int as success_count,
             sum(CASE WHEN status = 'failure' THEN 1 ELSE 0 END)::int as failure_count,
             max("createdAt") as last_event_at
      FROM "integrationEvents"
      WHERE "createdAt" >= ${since}
      GROUP BY provider
      ORDER BY provider ASC
    `);
    return rows.rows || [];
  }
}
