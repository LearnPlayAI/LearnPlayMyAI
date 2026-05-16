import { Router, Request, Response, Express } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { db } from '../db';
import {
  enterpriseCustomers,
  enterpriseDocuments,
  enterpriseLicenseRequests,
  enterpriseLicenseKeys,
  enterpriseKeyring,
  enterpriseRevenueSync,
  enterpriseAgreementTemplates,
  buildVersions,
  enterpriseSystems,
  enterpriseSystemDailyTelemetry,
  platformConfiguration,
} from '@shared/schema';
import { eq, and, desc, sql, gte, lte, inArray } from 'drizzle-orm';
import { isSuperAdmin } from '../adminAuth';
import { signLicenseKey, decryptLicenseRequest } from '../services/licenseCryptoService';
import { getCustomerKeys, provisionKeysForCustomer, rotateKey, buildProvisionBundle, KEY_PURPOSES } from '../services/keyringService';
import { CurrencyService } from '../services/currencyService';
import { sendRawEmail } from '../services/emailTransport';
import { getBaseUrl, getEmailFrom } from '../config/base-url';
import { buildCanonicalStorageKey, normalizeExtension } from '../utils/storageKeyManager';
import { resolveStoragePath } from '../utils/uploadPaths';
import {
  ensureSystemSyncCredential,
  revokeSystemSyncCredential,
  verifyEnterpriseSystemOwnership,
} from '../services/onpremSyncCredentialService';
import {
  compactLicenseRequestsToLatest,
  findLatestMatchingLicenseRequest,
} from '../services/licenseRequestDedupe';
import { isOnPremMode } from '../featureFlags';
import { sortEnterpriseLicenseRecords } from '@shared/enterpriseLicenseOrdering';

const router = Router();

type CloudRuntimeStage = 'dev' | 'acc' | 'prd';

function resolveCloudRuntimeStage(): CloudRuntimeStage {
  const raw = String(
    process.env.LEARNPLAY_SYSTEM_TYPE ||
    process.env.SYSTEM_TYPE ||
    process.env.STAGE ||
    '',
  ).trim().toLowerCase();
  if (['prd', 'prod', 'production'].includes(raw)) return 'prd';
  if (['acc', 'qa', 'test', 'testing', 'staging'].includes(raw)) return 'acc';
  return 'dev';
}

function mirrorTargetsForPrd(): string[] {
  return ['https://acccl.learnplay.co.za', 'https://stcloud.learnplay.co.za'];
}

function getMirrorKey(): string {
  const fromEnv = String(process.env.ENTERPRISE_LICENSE_CONTEXT_MIRROR_KEY || '').trim();
  return fromEnv;
}

function isValidMirrorKeyConfig(): boolean {
  return getMirrorKey().length >= 32;
}

const upload = multer({
  storage: multer.memoryStorage(),
});

function endOfCalendarMonth(base: Date): Date {
  return new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59, 999);
}

function endOfNextCalendarMonth(base: Date): Date {
  return new Date(base.getFullYear(), base.getMonth() + 2, 0, 23, 59, 59, 999);
}

type SupportedCurrency = 'EUR' | 'USD' | 'ZAR';

function normalizeSupportedCurrency(input: unknown, fallback: SupportedCurrency = 'USD'): SupportedCurrency {
  const normalized = String(input || '').trim().toUpperCase();
  if (normalized === 'EUR' || normalized === 'USD' || normalized === 'ZAR') {
    return normalized;
  }
  return fallback;
}

function isSupportedCurrency(input: unknown): boolean {
  const normalized = String(input || '').trim().toUpperCase();
  return normalized === 'EUR' || normalized === 'USD' || normalized === 'ZAR';
}

function parsePolicyMonthlyFee(input: unknown): string | null {
  if (input === undefined || input === null) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const normalized = raw.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return value.toFixed(2);
}

function buildEnterpriseSystemDisplayName(input: {
  systemType?: unknown;
  hostname?: unknown;
  serverBaseUrl?: unknown;
}): string {
  const systemType = String(input.systemType || 'system').trim().toUpperCase() || 'SYSTEM';
  const host = String(input.hostname || input.serverBaseUrl || 'OnPrem').trim() || 'OnPrem';
  return `${systemType} ${host}`;
}

async function upsertEnterpriseSystemForLicense(params: {
  enterpriseCustomerId: string;
  systemType: string;
  hostname: string | null;
  serverBaseUrl: string | null;
  hardwareKey: string | null;
  licenseRequestId: string;
  licenseKeyId: string;
  expiresAt: Date;
  monthlyFee: string | null;
  feeCurrency: string | null;
  autoApproveRenewals: boolean;
  graceDays: number;
  billingStatus?: string | null;
}) {
  const billingStatus = params.billingStatus || 'due';
  const systemName = buildEnterpriseSystemDisplayName({
    systemType: params.systemType,
    hostname: params.hostname,
    serverBaseUrl: params.serverBaseUrl,
  });

  const existingSystems = await db
    .select()
    .from(enterpriseSystems)
    .where(
      and(
        eq(enterpriseSystems.enterpriseCustomerId, params.enterpriseCustomerId),
        eq(enterpriseSystems.systemType, params.systemType),
      ),
    );

  const existing = existingSystems.find((s) =>
    (params.hardwareKey && s.hardwareKey === params.hardwareKey) ||
    (params.serverBaseUrl && s.baseUrl === params.serverBaseUrl) ||
    (params.hostname && s.internalHostname === params.hostname),
  );

  const updateData = {
    name: systemName.slice(0, 100),
    hardwareKey: params.hardwareKey,
    baseUrl: params.serverBaseUrl,
    internalHostname: params.hostname,
    activeLicenseRequestId: params.licenseRequestId,
    activeLicenseKeyId: params.licenseKeyId,
    licenseStatus: 'active',
    licenseExpiresAt: params.expiresAt,
    nextCheckInDueAt: params.expiresAt,
    autoApproveRenewals: params.autoApproveRenewals,
    graceDays: params.graceDays,
    monthlyFee: params.monthlyFee,
    feeCurrency: params.feeCurrency,
    billingStatus,
    updatedAt: new Date(),
  };

  if (existing) {
    const [updated] = await db
      .update(enterpriseSystems)
      .set(updateData)
      .where(eq(enterpriseSystems.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(enterpriseSystems)
    .values({
      enterpriseCustomerId: params.enterpriseCustomerId,
      systemType: params.systemType,
      status: 'active',
      appPort: 3000,
      dbPort: 5432,
      nginxHttpPort: 80,
      nginxHttpsPort: 443,
      ...updateData,
    })
    .returning();

  return created;
}

async function revokeAllSystemLicenseKeys(system: any, reason: string): Promise<void> {
  const now = new Date();
  if (system.activeLicenseRequestId) {
    await db
      .update(enterpriseLicenseKeys)
      .set({
        isRevoked: true,
        revokedAt: now,
        revokedReason: reason,
      })
      .where(eq(enterpriseLicenseKeys.licenseRequestId, system.activeLicenseRequestId));
  }

  if (system.activeLicenseKeyId) {
    await db
      .update(enterpriseLicenseKeys)
      .set({
        isRevoked: true,
        revokedAt: now,
        revokedReason: reason,
      })
      .where(eq(enterpriseLicenseKeys.id, system.activeLicenseKeyId));
  }
}

async function supersedePriorSystemLicenseKeys(params: {
  licenseRequestId: string;
  activeLicenseKeyId: string;
}): Promise<void> {
  const { licenseRequestId, activeLicenseKeyId } = params;
  await db
    .update(enterpriseLicenseKeys)
    .set({
      isRevoked: true,
      revokedAt: new Date(),
      revokedReason: 'Superseded by replacement license',
    })
    .where(and(
      eq(enterpriseLicenseKeys.licenseRequestId, licenseRequestId),
      eq(enterpriseLicenseKeys.isRevoked, false),
      sql`${enterpriseLicenseKeys.id} <> ${activeLicenseKeyId}`,
    ));
}

async function retireActiveSystemLicenseRequest(system: any, reason: string, actorUserId: string): Promise<void> {
  if (!system.activeLicenseRequestId) return;
  await db
    .update(enterpriseLicenseRequests)
    .set({
      status: 'denied',
      denialReason: reason,
      billingStatus: 'due',
      autoApproveRenewals: false,
      autoApproveDisabledAt: new Date(),
      autoApproveDisabledBy: actorUserId,
      autoApproveDisableReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(enterpriseLicenseRequests.id, system.activeLicenseRequestId));
}

async function dispatchOnpremLicensePush(system: any, payload: any): Promise<{ delivered: boolean; error?: string }> {
  try {
    const baseUrl = String(system?.baseUrl || '').trim().replace(/\/+$/, '');
    if (!baseUrl) {
      return { delivered: false, error: 'System base URL is missing' };
    }
    const sharedSecret = String(process.env.ONPREM_PUSH_SHARED_SECRET || '').trim();
    if (!sharedSecret) {
      return { delivered: false, error: 'ONPREM_PUSH_SHARED_SECRET is not configured' };
    }
    const body = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', sharedSecret).update(body).digest('hex');
    const response = await fetch(`${baseUrl}/api/onprem/license/push-update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-lp-signature': signature,
      },
      body,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      return { delivered: false, error: `Push failed (${response.status}): ${text}` };
    }
    return { delivered: true };
  } catch (error: any) {
    return { delivered: false, error: error?.message || 'Push dispatch failed' };
  }
}

async function setSystemLicenseReason(systemId: string, reason: string | null) {
  const key = `ENTERPRISE_SYSTEM_LICENSE_REASON_${systemId}`;
  const now = new Date();
  const payload = JSON.stringify({
    reason: reason || null,
    updatedAt: now.toISOString(),
  });
  const [existing] = await db
    .select({ id: platformConfiguration.id })
    .from(platformConfiguration)
    .where(eq(platformConfiguration.key, key))
    .limit(1);
  if (existing) {
    await db
      .update(platformConfiguration)
      .set({
        value: payload,
        dataType: 'json',
        description: 'Latest system-level license reason',
        updatedAt: now,
      })
      .where(eq(platformConfiguration.id, existing.id));
    return;
  }
  await db
    .insert(platformConfiguration)
    .values({
      key,
      value: payload,
      dataType: 'json',
      description: 'Latest system-level license reason',
      isEditable: true,
    });
}

function revokedLicenseByIdConfigKey(licenseId: string): string {
  return `ENTERPRISE_REVOKED_LICENSE_${licenseId}`;
}

function revokedLicenseByHashConfigKey(licenseKeyHash: string): string {
  return `ENTERPRISE_REVOKED_LICENSE_HASH_${licenseKeyHash}`;
}

function deletedCustomerRecoveryPolicyKey(customerId: string): string {
  return `ENTERPRISE_DELETED_CUSTOMER_RECOVERY_POLICY_${customerId}`;
}

async function upsertRevokedLicenseTombstone(params: {
  key: string;
  reason: string;
  enterpriseCustomerId: string;
  actorUserId: string;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date();
  const payload = JSON.stringify({
    status: 'revoked',
    reason: params.reason,
    enterpriseCustomerId: params.enterpriseCustomerId,
    actorUserId: params.actorUserId,
    revokedAt: now.toISOString(),
    ...(params.metadata || {}),
  });

  const [existing] = await db
    .select({ id: platformConfiguration.id })
    .from(platformConfiguration)
    .where(eq(platformConfiguration.key, params.key))
    .limit(1);

  if (existing) {
    await db
      .update(platformConfiguration)
      .set({
        value: payload,
        dataType: 'json',
        description: 'Revoked on-prem license tombstone for cloud enforcement',
        updatedAt: now,
      })
      .where(eq(platformConfiguration.id, existing.id));
    return;
  }

  await db
    .insert(platformConfiguration)
    .values({
      key: params.key,
      value: payload,
      dataType: 'json',
      description: 'Revoked on-prem license tombstone for cloud enforcement',
      isEditable: true,
      lastModifiedBy: params.actorUserId,
    });
}

async function upsertDeletedCustomerRecoveryPolicy(params: {
  deletedCustomerId: string;
  actorUserId: string;
  systems: Array<{
    id: string;
    systemType: string | null;
    hardwareKey: string | null;
    internalHostname: string | null;
    baseUrl: string | null;
    autoApproveRenewals: boolean;
    graceDays: number;
    monthlyFee: string | null;
    feeCurrency: string | null;
    billingStatus: string | null;
  }>;
}) {
  const key = deletedCustomerRecoveryPolicyKey(params.deletedCustomerId);
  const now = new Date();
  const payload = JSON.stringify({
    deletedCustomerId: params.deletedCustomerId,
    deletedAt: now.toISOString(),
    deletedBy: params.actorUserId,
    recoverable: true,
    systems: params.systems.map((system) => ({
      id: system.id,
      systemType: String(system.systemType || '').trim().toLowerCase() || null,
      hardwareKey: String(system.hardwareKey || '').trim() || null,
      internalHostname: String(system.internalHostname || '').trim() || null,
      baseUrl: String(system.baseUrl || '').trim() || null,
      autoApproveRenewals: system.autoApproveRenewals === true,
      graceDays: Number.isFinite(Number(system.graceDays)) ? Math.max(0, Number(system.graceDays)) : 15,
      monthlyFee: system.monthlyFee ? String(system.monthlyFee) : null,
      feeCurrency: system.feeCurrency ? String(system.feeCurrency).toUpperCase() : 'USD',
      billingStatus: String(system.billingStatus || 'due').trim().toLowerCase() || 'due',
    })),
  });

  const [existing] = await db
    .select({ id: platformConfiguration.id })
    .from(platformConfiguration)
    .where(eq(platformConfiguration.key, key))
    .limit(1);

  if (existing) {
    await db
      .update(platformConfiguration)
      .set({
        value: payload,
        dataType: 'json',
        description: 'Deleted customer recovery policy snapshot for on-prem reprovisioning',
        updatedAt: now,
      })
      .where(eq(platformConfiguration.id, existing.id));
    return;
  }

  await db
    .insert(platformConfiguration)
    .values({
      key,
      value: payload,
      dataType: 'json',
      description: 'Deleted customer recovery policy snapshot for on-prem reprovisioning',
      isEditable: true,
      lastModifiedBy: params.actorUserId,
    });
}

async function deactivateSystemLicense(params: {
  enterpriseCustomerId: string;
  systemId: string;
  reason: string;
  actorUserId: string;
  cascadeStatus?: string;
}) {
  const [system] = await db
    .select()
    .from(enterpriseSystems)
    .where(and(eq(enterpriseSystems.id, params.systemId), eq(enterpriseSystems.enterpriseCustomerId, params.enterpriseCustomerId)))
    .limit(1);

  if (!system) {
    throw new Error('System not found');
  }

  if (system.activeLicenseKeyId) {
    await db
      .update(enterpriseLicenseKeys)
      .set({
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: params.reason,
      })
      .where(eq(enterpriseLicenseKeys.id, system.activeLicenseKeyId));
  }

  if (system.activeLicenseRequestId) {
    await db
      .update(enterpriseLicenseRequests)
      .set({
        billingStatus: params.cascadeStatus || 'suspended',
        updatedAt: new Date(),
      })
      .where(eq(enterpriseLicenseRequests.id, system.activeLicenseRequestId));
  }

  const [updatedSystem] = await db
    .update(enterpriseSystems)
    .set({
      licenseStatus: 'revoked',
      status: 'inactive',
      billingStatus: params.cascadeStatus || 'suspended',
      updatedAt: new Date(),
    })
    .where(eq(enterpriseSystems.id, system.id))
    .returning();

  await setSystemLicenseReason(updatedSystem.id, params.reason);

  const push = await dispatchOnpremLicensePush(updatedSystem, {
    action: 'deactivate',
    reason: params.reason,
    source: 'cloud-superadmin',
    at: new Date().toISOString(),
  });

  return {
    system: updatedSystem,
    push,
  };
}

function parseBusinessProfile(value: string | null): {
  businessName?: string;
  businessRegistrationNumber?: string;
  businessAddress?: string;
  billingContactName?: string;
  billingContactEmail?: string;
  billingContactPhone?: string;
  countryCode?: string;
  vatNumber?: string;
  notes?: string;
} | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function systemRoyaltyConfigKey(systemId: string): string {
  return `ENTERPRISE_SYSTEM_ROYALTY_${systemId}`;
}

function parseSystemRoyalty(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

function parsePagination(req: Request) {
  const rawPage = Number(req.query?.page || 1);
  const rawPageSize = Number(req.query?.pageSize || req.query?.limit || 20);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const pageSize = Number.isFinite(rawPageSize) ? Math.max(1, Math.min(200, Math.floor(rawPageSize))) : 20;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const paged = items.slice(start, start + pageSize);
  return {
    items: paged,
    pagination: {
      page: safePage,
      pageSize,
      total,
      totalPages,
      hasNext: safePage < totalPages,
      hasPrev: safePage > 1,
    },
  };
}

function includesText(value: unknown, needle: string): boolean {
  return String(value || '').toLowerCase().includes(needle.toLowerCase());
}

async function uploadBufferToStorage(storagePath: string, buffer: Buffer, _contentType: string): Promise<void> {
  const fullPath = resolveStoragePath(storagePath);
  await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.promises.writeFile(fullPath, buffer);
}

router.get('/customers', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { page, pageSize } = parsePagination(req);
    const search = String(req.query?.search || '').trim().toLowerCase();
    const statusFilter = String(req.query?.status || '').trim().toLowerCase();
    const trackFilter = String(req.query?.track || '').trim().toLowerCase();
    const trackStateFilter = String(req.query?.trackState || '').trim().toLowerCase();

    const customers = await db
      .select()
      .from(enterpriseCustomers)
      .orderBy(desc(enterpriseCustomers.createdAt));

    const profileRows = await db
      .select({ key: platformConfiguration.key, value: platformConfiguration.value })
      .from(platformConfiguration)
      .where(sql`${platformConfiguration.key} like 'ENTERPRISE_BUSINESS_PROFILE_%'`);
    const profileMap = new Map<string, any>();
    for (const row of profileRows) {
      const customerId = String(row.key || '').replace('ENTERPRISE_BUSINESS_PROFILE_', '');
      if (!customerId) continue;
      profileMap.set(customerId, parseBusinessProfile(row.value || null));
    }

    const systems = await db
      .select({
        id: enterpriseSystems.id,
        enterpriseCustomerId: enterpriseSystems.enterpriseCustomerId,
        systemType: enterpriseSystems.systemType,
        licenseStatus: enterpriseSystems.licenseStatus,
        licenseExpiresAt: enterpriseSystems.licenseExpiresAt,
        lastContactSyncAt: enterpriseSystems.lastContactSyncAt,
        updatedAt: enterpriseSystems.updatedAt,
      })
      .from(enterpriseSystems);
    const approvedLicenseKeys = await db
      .select({
        enterpriseCustomerId: enterpriseLicenseKeys.enterpriseCustomerId,
        systemType: enterpriseLicenseKeys.systemType,
        expiresAt: enterpriseLicenseKeys.expiresAt,
        isRevoked: enterpriseLicenseKeys.isRevoked,
        createdAt: enterpriseLicenseKeys.createdAt,
      })
      .from(enterpriseLicenseKeys)
      .where(eq(enterpriseLicenseKeys.isRevoked, false))
      .orderBy(desc(enterpriseLicenseKeys.createdAt));
    const approvedKeyByCustomerTrack = new Map<string, {
      expiresAt: Date | null;
      state: 'active' | 'grace' | 'expired';
      reason: string | null;
    }>();
    for (const row of approvedLicenseKeys) {
      const customerId = String(row.enterpriseCustomerId || '').trim();
      const track = String(row.systemType || '').trim().toLowerCase();
      if (!customerId || !track) continue;
      const key = `${customerId}:${track}`;
      if (approvedKeyByCustomerTrack.has(key)) continue;
      const nowMs = Date.now();
      const expiryMs = row.expiresAt ? new Date(row.expiresAt).getTime() : null;
      if (!expiryMs || Number.isNaN(expiryMs)) {
        approvedKeyByCustomerTrack.set(key, { expiresAt: null, state: 'active', reason: null });
        continue;
      }
      const dayMs = 24 * 60 * 60 * 1000;
      const daysUntilExpiry = Math.floor((expiryMs - nowMs) / dayMs);
      const graceDays = 15;
      if (daysUntilExpiry >= 0) {
        approvedKeyByCustomerTrack.set(key, { expiresAt: new Date(expiryMs), state: 'active', reason: null });
      } else if (Math.abs(daysUntilExpiry) <= graceDays) {
        approvedKeyByCustomerTrack.set(key, { expiresAt: new Date(expiryMs), state: 'grace', reason: 'Within grace window' });
      } else {
        approvedKeyByCustomerTrack.set(key, { expiresAt: new Date(expiryMs), state: 'expired', reason: 'License expired' });
      }
    }
    const systemReasonKeys = systems.map((s) => `ENTERPRISE_SYSTEM_LICENSE_REASON_${s.id}`);
    const systemReasonMap = new Map<string, string | null>();
    if (systemReasonKeys.length > 0) {
      const reasonRows = await db
        .select({ key: platformConfiguration.key, value: platformConfiguration.value })
        .from(platformConfiguration)
        .where(inArray(platformConfiguration.key, systemReasonKeys));
      for (const row of reasonRows) {
        const systemId = String(row.key || '').replace('ENTERPRISE_SYSTEM_LICENSE_REASON_', '');
        if (!systemId) continue;
        try {
          const parsed = JSON.parse(String(row.value || ''));
          systemReasonMap.set(systemId, parsed?.reason ? String(parsed.reason) : null);
        } catch {
          systemReasonMap.set(systemId, null);
        }
      }
    }
    const systemsByCustomer = new Map<string, Array<{
      id: string;
      systemType: string | null;
      licenseStatus: string | null;
      licenseReason: string | null;
      licenseExpiresAt: Date | null;
      lastContactSyncAt: Date | null;
      updatedAt: Date | null;
    }>>();
    for (const s of systems) {
      const key = String(s.enterpriseCustomerId || '');
      if (!key) continue;
      const list = systemsByCustomer.get(key) || [];
      list.push({
        id: s.id,
        systemType: s.systemType,
        licenseStatus: s.licenseStatus,
        licenseReason: systemReasonMap.get(s.id) || null,
        licenseExpiresAt: s.licenseExpiresAt,
        lastContactSyncAt: s.lastContactSyncAt,
        updatedAt: s.updatedAt,
      });
      systemsByCustomer.set(key, list);
    }

    const enriched = await Promise.all(customers.map(async (customer) => {
      const [subCompanyCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(enterpriseCustomers)
        .where(eq(enterpriseCustomers.parentEnterpriseId, customer.id));
      const businessProfile = profileMap.get(customer.id) || null;
      const customerSystems = systemsByCustomer.get(customer.id) || [];
      const now = Date.now();
      const staleThresholdMs = 36 * 60 * 60 * 1000;
      const trackStatus = (
        track: 'development' | 'qa' | 'production',
      ): { state: 'active' | 'inactive' | 'stale' | 'expired' | 'revoked' | 'action_required'; reason: string | null } => {
        const candidates = customerSystems.filter((s) => String(s.systemType || '').toLowerCase() === track);
        const approvedTrackKey = `${customer.id}:${track}`;
        const approvedFallback = approvedKeyByCustomerTrack.get(approvedTrackKey);
        if (candidates.length === 0) {
          if (approvedFallback?.state === 'active' || approvedFallback?.state === 'grace') {
            return { state: 'active', reason: approvedFallback.reason };
          }
          if (approvedFallback?.state === 'expired') {
            return { state: 'expired', reason: approvedFallback.reason };
          }
          return { state: 'inactive', reason: null };
        }
        const normalize = (s: typeof candidates[number]) => {
          const status = String(s.licenseStatus || '').toLowerCase();
          const expiresAt = s.licenseExpiresAt ? new Date(s.licenseExpiresAt).getTime() : null;
          const lastSync = s.lastContactSyncAt
            ? new Date(s.lastContactSyncAt).getTime()
            : (s.updatedAt ? new Date(s.updatedAt).getTime() : null);
          const isRevoked = status === 'revoked' || status === 'suspended';
          const isExpired = !!expiresAt && expiresAt <= now;
          const isActionRequired = ['reissue_required', 'reissue_requested', 'pending_approval', 'incomplete_profile', 'invalid_local_state'].includes(status);
          const isCandidateActive = ['active', 'grace'].includes(status) && !isExpired && !isRevoked;
          const isStale = isCandidateActive && !!lastSync && (now - lastSync) > staleThresholdMs;
          if (isRevoked) return { state: 'revoked' as const, reason: s.licenseReason || null, updatedAt: s.updatedAt };
          if (isCandidateActive && !isStale) return { state: 'active' as const, reason: s.licenseReason || null, updatedAt: s.updatedAt };
          if (isStale) return { state: 'stale' as const, reason: s.licenseReason || null, updatedAt: s.updatedAt };
          if (isActionRequired) return { state: 'action_required' as const, reason: s.licenseReason || null, updatedAt: s.updatedAt };
          if (isExpired || status === 'expired') return { state: 'expired' as const, reason: s.licenseReason || null, updatedAt: s.updatedAt };
          return { state: 'inactive' as const, reason: s.licenseReason || null, updatedAt: s.updatedAt };
        };
        const normalized = candidates
          .map(normalize)
          .sort((a, b) => (new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()));
        const pick = (state: string) => normalized.find((s) => s.state === state);
        return (
          pick('active') ||
          pick('stale') ||
          pick('action_required') ||
          pick('expired') ||
          pick('revoked') ||
          ((approvedFallback?.state === 'active' || approvedFallback?.state === 'grace')
            ? { state: 'active', reason: approvedFallback.reason, updatedAt: null }
            : null) ||
          (approvedFallback?.state === 'expired'
            ? { state: 'expired', reason: approvedFallback.reason, updatedAt: null }
            : null) ||
          normalized[0] ||
          { state: 'inactive', reason: null }
        );
      };
      const dev = trackStatus('development');
      const acc = trackStatus('qa');
      const prd = trackStatus('production');

      return {
        ...customer,
        passwordHash: undefined,
        royaltyPercentage: Number(customer.royaltyPercentage || 0),
        subCompanyCount: subCompanyCount?.count || 0,
        businessRegistrationNumber: businessProfile?.businessRegistrationNumber || null,
        countryCode: businessProfile?.countryCode || null,
        vatNumber: businessProfile?.vatNumber || null,
        billingNotes: businessProfile?.notes || null,
        businessProfile,
        devTrackStatus: dev.state,
        devTrackReason: dev.reason,
        accTrackStatus: acc.state,
        accTrackReason: acc.reason,
        prdTrackStatus: prd.state,
        prdTrackReason: prd.reason,
      };
    }));
    const filtered = enriched.filter((customer: any) => {
      if (statusFilter && statusFilter !== 'all' && String(customer.status || '').toLowerCase() !== statusFilter) {
        return false;
      }
      if (trackFilter && trackFilter !== 'all') {
        const value =
          trackFilter === 'development' ? customer.devTrackStatus
            : trackFilter === 'qa' ? customer.accTrackStatus
            : trackFilter === 'production' ? customer.prdTrackStatus
            : null;
        if (!value) return false;
        if (trackStateFilter && trackStateFilter !== 'all' && String(value).toLowerCase() !== trackStateFilter) return false;
      } else if (trackStateFilter && trackStateFilter !== 'all') {
        const states = [customer.devTrackStatus, customer.accTrackStatus, customer.prdTrackStatus].map((v: any) => String(v || '').toLowerCase());
        if (!states.includes(trackStateFilter)) return false;
      }
      if (!search) return true;
      return (
        includesText(customer.companyName, search) ||
        includesText(customer.contactEmail, search) ||
        includesText(customer.contactPersonName, search) ||
        includesText(customer.businessRegistrationNumber, search) ||
        includesText(customer.vatNumber, search)
      );
    });

    const paged = paginateItems(filtered, page, pageSize);
    res.json(paged);
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error listing customers:', error);
    res.status(500).json({ error: 'Failed to list enterprise customers' });
  }
});

router.get('/customers/:id', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [customer] = await db
      .select()
      .from(enterpriseCustomers)
      .where(eq(enterpriseCustomers.id, id))
      .limit(1);

    if (!customer) {
      return res.status(404).json({ error: 'Enterprise customer not found' });
    }

    const subCompanies = await db
      .select()
      .from(enterpriseCustomers)
      .where(eq(enterpriseCustomers.parentEnterpriseId, id));

    const documents = await db
      .select()
      .from(enterpriseDocuments)
      .where(eq(enterpriseDocuments.enterpriseCustomerId, id))
      .orderBy(desc(enterpriseDocuments.createdAt));

    const licenseRequests = await db
      .select()
      .from(enterpriseLicenseRequests)
      .where(eq(enterpriseLicenseRequests.enterpriseCustomerId, id))
      .orderBy(desc(enterpriseLicenseRequests.createdAt));
    const compactedLicenseRequests = sortEnterpriseLicenseRecords(compactLicenseRequestsToLatest(licenseRequests));

    const systems = await db
      .select()
      .from(enterpriseSystems)
      .where(eq(enterpriseSystems.enterpriseCustomerId, id))
      .orderBy(desc(enterpriseSystems.updatedAt));

    const systemRoyaltyKeys = systems.map((s) => systemRoyaltyConfigKey(s.id)).filter(Boolean);
    const systemRoyaltyMap = new Map<string, number>();
    if (systemRoyaltyKeys.length > 0) {
      try {
        const royaltyRows = await db
          .select({ key: platformConfiguration.key, value: platformConfiguration.value })
          .from(platformConfiguration)
          .where(inArray(platformConfiguration.key, systemRoyaltyKeys));
        for (const row of royaltyRows) {
          const systemId = String(row.key || '').replace('ENTERPRISE_SYSTEM_ROYALTY_', '');
          const value = parseSystemRoyalty(row.value || null);
          if (systemId && value !== null) {
            systemRoyaltyMap.set(systemId, value);
          }
        }
      } catch (royaltyError) {
        console.warn('[EnterpriseSuperAdmin] System royalty lookup skipped:', royaltyError);
      }
    }

    let telemetryRows: any[] = [];
    try {
      telemetryRows = await db
        .select()
        .from(enterpriseSystemDailyTelemetry)
        .where(eq(enterpriseSystemDailyTelemetry.enterpriseCustomerId, id))
        .orderBy(
          desc(enterpriseSystemDailyTelemetry.reportDate),
          desc(enterpriseSystemDailyTelemetry.reportedAt),
        );
    } catch (telemetryError) {
      console.warn('[EnterpriseSuperAdmin] Telemetry lookup skipped:', telemetryError);
      telemetryRows = [];
    }

    const lastTelemetryDateBySystem = new Map<string, string>();
    for (const system of systems) {
      const dt = system?.lastTelemetryAt ? new Date(system.lastTelemetryAt) : null;
      if (!dt || Number.isNaN(dt.getTime())) continue;
      lastTelemetryDateBySystem.set(system.id, dt.toISOString().slice(0, 10));
    }

    const latestReportDateBySystem = new Map<string, string>();
    for (const row of telemetryRows) {
      const systemId = String(row?.enterpriseSystemId || '').trim();
      const reportDate = String(row?.reportDate || '').trim();
      if (!systemId || !reportDate) continue;
      if (!latestReportDateBySystem.has(systemId)) {
        latestReportDateBySystem.set(systemId, reportDate);
      }
    }

    // If a system checked in after its most recent telemetry row date, the latest snapshot is empty.
    const systemsWithEmptyLatestSnapshot = new Set<string>();
    for (const [systemId, lastDate] of lastTelemetryDateBySystem.entries()) {
      const latestDate = latestReportDateBySystem.get(systemId);
      if (!latestDate || lastDate > latestDate) {
        systemsWithEmptyLatestSnapshot.add(systemId);
      }
    }

    const latestSnapshotRows = telemetryRows.filter((row) => {
      const systemId = String(row?.enterpriseSystemId || '').trim();
      if (!systemId) return false;
      if (systemsWithEmptyLatestSnapshot.has(systemId)) return false;
      const latestDate = latestReportDateBySystem.get(systemId);
      return !!latestDate && String(row?.reportDate || '').trim() === latestDate;
    });

    const latestByOrg = new Map<string, any>();
    for (const row of latestSnapshotRows) {
      const orgKey = `${row.enterpriseSystemId}:${row.organizationId || row.organizationName || `org-${row.id}`}`;
      if (!latestByOrg.has(orgKey)) {
        latestByOrg.set(orgKey, row);
      }
    }
    const registeredOrganizationMetrics = Array.from(latestByOrg.values()).map((row) => ({
      organizationId: row.organizationId || null,
      organizationName: row.organizationName || 'Unknown',
      totalOrganizations: row.totalOrganizations || 0,
      totalUsers: row.totalUsers || 0,
      totalOrgAdmins: row.totalOrgAdmins || 0,
      totalTrainers: row.totalTrainers || 0,
      totalLearners: row.totalLearners || 0,
      totalCustSupers: row.totalCustSupers || 0,
      totalSuperAdmins: row.totalSuperAdmins || 0,
      totalDemoOrganizations: row.totalDemoOrganizations || 0,
      totalDemoUsers: row.totalDemoUsers || 0,
      totalCourses: row.totalCourses || 0,
      totalPublishedCourses: row.totalPublishedCourses || 0,
      totalDemoCourses: row.totalDemoCourses || 0,
      totalDemoPublishedCourses: row.totalDemoPublishedCourses || 0,
      totalEnrollments: row.totalEnrollments || 0,
      totalPublishedEnrollments: row.totalPublishedEnrollments || 0,
      totalDemoEnrollments: row.totalDemoEnrollments || 0,
      totalPaidCourseEnrollments: row.totalPaidCourseEnrollments || 0,
      totalFreeCourseEnrollments: row.totalFreeCourseEnrollments || 0,
      totalPaidEnrollmentValue: row.totalPaidEnrollmentValue || '0',
      totalDemoPaidEnrollmentValue: row.totalDemoPaidEnrollmentValue || '0',
      totalFreeEnrollmentValue: row.totalFreeEnrollmentValue || '0',
      totalAssignments: row.totalAssignments || 0,
      totalPublishedAssignments: row.totalPublishedAssignments || 0,
      totalDemoCompletions: row.totalDemoCompletions || 0,
      totalPaidCourseCompletions: row.totalPaidCourseCompletions || 0,
      totalFreeCourseCompletions: row.totalFreeCourseCompletions || 0,
      totalPaidCompletionValue: row.totalPaidCompletionValue || '0',
      totalDemoPaidCompletionValue: row.totalDemoPaidCompletionValue || '0',
      totalFreeCourseCompletionsValue: row.totalFreeCourseCompletionsValue || '0',
      activeUsers30Days: row.activeUsers30Days || 0,
      royaltyRevenueEnrollments: row.royaltyRevenueEnrollments || '0',
      royaltyRevenueCompletions: row.royaltyRevenueCompletions || '0',
      royaltyPercentageApplied: row.royaltyPercentageApplied || '0',
      royaltyRevenueTotal: row.royaltyRevenueTotal || '0',
      metricCurrency: row.metricCurrency || 'USD',
      metricsSchemaVersion: row.metricsSchemaVersion || 1,
      reportDate: row.reportDate || null,
      reportedAt: row.reportedAt || null,
      systemType: row.systemType || null,
      hostname: row.hostname || null,
      serverBaseUrl: row.serverBaseUrl || null,
    }));
    const metricsLastUpdatedAt = registeredOrganizationMetrics.reduce<Date | null>((latest, row) => {
      if (!row.reportedAt) return latest;
      const dt = new Date(row.reportedAt);
      if (Number.isNaN(dt.getTime())) return latest;
      if (!latest || dt > latest) return dt;
      return latest;
    }, null);

    const profileKey = `ENTERPRISE_BUSINESS_PROFILE_${id}`;
    const [profileRow] = await db
      .select({ value: platformConfiguration.value })
      .from(platformConfiguration)
      .where(eq(platformConfiguration.key, profileKey))
      .limit(1);
    const businessProfile = parseBusinessProfile(profileRow?.value || null);

    const { passwordHash, ...customerData } = customer;

    const systemsWithRoyalty = sortEnterpriseLicenseRecords(systems.map((s) => ({
      ...s,
      royaltyPercentage: systemRoyaltyMap.has(s.id)
        ? Number(systemRoyaltyMap.get(s.id))
        : Number((customerData as any).royaltyPercentage || 0),
    })));
    const activeSystemsWithRoyalty = systemsWithRoyalty.filter((s) =>
      String(s.status || '').toLowerCase() !== 'archived'
    );

    res.json({
      ...customerData,
      royaltyPercentage: Number((customerData as any).royaltyPercentage || 0),
      businessRegistrationNumber: businessProfile?.businessRegistrationNumber || null,
      countryCode: businessProfile?.countryCode || null,
      vatNumber: businessProfile?.vatNumber || null,
      billingNotes: businessProfile?.notes || null,
      businessProfile,
      subCompanies: subCompanies.map(({ passwordHash: _, ...sc }) => sc),
      documents,
      licenseRequests: compactedLicenseRequests,
      systems: activeSystemsWithRoyalty,
      archivedSystems: systemsWithRoyalty.filter((s) =>
        String(s.status || '').toLowerCase() === 'archived'
      ),
      registeredOrganizationMetrics,
      metricsLastUpdatedAt: metricsLastUpdatedAt ? metricsLastUpdatedAt.toISOString() : null,
    });
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error getting customer detail:', error);
    res.status(500).json({ error: 'Failed to get enterprise customer detail' });
  }
});

router.put('/customers/:id/activate', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [customer] = await db
      .select({ id: enterpriseCustomers.id })
      .from(enterpriseCustomers)
      .where(eq(enterpriseCustomers.id, id))
      .limit(1);

    if (!customer) {
      return res.status(404).json({ error: 'Enterprise customer not found' });
    }

    const [updated] = await db
      .update(enterpriseCustomers)
      .set({
        status: 'active',
        accountActivatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(enterpriseCustomers.id, id))
      .returning();

    console.log(`[EnterpriseSuperAdmin] Customer ${id} activated by SuperAdmin ${req.session.userId}`);

    const { passwordHash, ...data } = updated;
    res.json({ success: true, customer: data });
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error activating customer:', error);
    res.status(500).json({ error: 'Failed to activate enterprise customer' });
  }
});

router.put('/customers/:id/suspend', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const reason = String(req.body?.reason || 'Customer suspended by SuperAdmin').trim();

    const [customer] = await db
      .select({ id: enterpriseCustomers.id })
      .from(enterpriseCustomers)
      .where(eq(enterpriseCustomers.id, id))
      .limit(1);

    if (!customer) {
      return res.status(404).json({ error: 'Enterprise customer not found' });
    }

    const [updated] = await db
      .update(enterpriseCustomers)
      .set({
        status: 'suspended',
        updatedAt: new Date(),
      })
      .where(eq(enterpriseCustomers.id, id))
      .returning();

    const systems = await db
      .select({ id: enterpriseSystems.id })
      .from(enterpriseSystems)
      .where(eq(enterpriseSystems.enterpriseCustomerId, id));
    const cascadeResults: Array<{ systemId: string; delivered: boolean; error?: string }> = [];
    for (const system of systems) {
      try {
        const result = await deactivateSystemLicense({
          enterpriseCustomerId: id,
          systemId: system.id,
          reason: `Customer suspended: ${reason}`,
          actorUserId: req.session.userId!,
          cascadeStatus: 'suspended',
        });
        cascadeResults.push({ systemId: system.id, delivered: result.push.delivered, error: result.push.error });
      } catch (error: any) {
        cascadeResults.push({ systemId: system.id, delivered: false, error: error?.message || 'Cascade deactivation failed' });
      }
    }

    console.log(`[EnterpriseSuperAdmin] Customer ${id} suspended by SuperAdmin ${req.session.userId}`);

    const { passwordHash, ...data } = updated;
    res.json({ success: true, customer: data, cascadeResults });
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error suspending customer:', error);
    res.status(500).json({ error: 'Failed to suspend enterprise customer' });
  }
});

router.put('/customers/:id', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const payload = {
      companyName: req.body?.companyName ? String(req.body.companyName).trim() : undefined,
      contactPersonName: req.body?.contactPersonName ? String(req.body.contactPersonName).trim() : undefined,
      contactEmail: req.body?.contactEmail ? String(req.body.contactEmail).trim().toLowerCase() : undefined,
      contactMobile: req.body?.contactMobile !== undefined ? String(req.body.contactMobile || '').trim() : undefined,
      companyAddress: req.body?.companyAddress !== undefined ? String(req.body.companyAddress || '').trim() : undefined,
      country: req.body?.country !== undefined ? String(req.body.country || '').trim() : undefined,
      businessRegistrationNumber: req.body?.businessRegistrationNumber !== undefined ? String(req.body.businessRegistrationNumber || '').trim() : undefined,
      countryCode: req.body?.countryCode !== undefined ? String(req.body.countryCode || '').trim() : undefined,
      vatNumber: req.body?.vatNumber !== undefined ? String(req.body.vatNumber || '').trim() : undefined,
      billingNotes: req.body?.billingNotes !== undefined ? String(req.body.billingNotes || '').trim() : undefined,
      royaltyPercentage: req.body?.royaltyPercentage !== undefined
        ? (() => {
            const n = Number(req.body.royaltyPercentage);
            if (!Number.isFinite(n)) return 0;
            return Math.max(0, Math.min(100, n));
          })()
        : undefined,
    };

    const [existing] = await db
      .select()
      .from(enterpriseCustomers)
      .where(eq(enterpriseCustomers.id, id))
      .limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Enterprise customer not found' });
    }

    if (payload.companyName) {
      const [dup] = await db
        .select({ id: enterpriseCustomers.id })
        .from(enterpriseCustomers)
        .where(and(
          sql`lower(trim(${enterpriseCustomers.companyName})) = ${payload.companyName.toLowerCase()}`,
          sql`${enterpriseCustomers.parentEnterpriseId} IS NULL`,
          sql`${enterpriseCustomers.id} <> ${id}`
        ))
        .limit(1);
      if (dup) {
        return res.status(409).json({ error: 'Another enterprise customer with this company name already exists' });
      }
    }

    const [updated] = await db
      .update(enterpriseCustomers)
      .set({
        ...(payload.companyName !== undefined ? { companyName: payload.companyName } : {}),
        ...(payload.contactPersonName !== undefined ? { contactPersonName: payload.contactPersonName } : {}),
        ...(payload.contactEmail !== undefined ? { contactEmail: payload.contactEmail } : {}),
        ...(payload.contactMobile !== undefined ? { contactMobile: payload.contactMobile || null } : {}),
        ...(payload.companyAddress !== undefined ? { companyAddress: payload.companyAddress || null } : {}),
        ...(payload.country !== undefined ? { country: payload.country || null } : {}),
        ...(payload.royaltyPercentage !== undefined ? { royaltyPercentage: String(payload.royaltyPercentage.toFixed(2)) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(enterpriseCustomers.id, id))
      .returning();

    const profileKey = `ENTERPRISE_BUSINESS_PROFILE_${id}`;
    const [existingProfile] = await db
      .select({ id: platformConfiguration.id, value: platformConfiguration.value })
      .from(platformConfiguration)
      .where(eq(platformConfiguration.key, profileKey))
      .limit(1);

    const currentProfile = parseBusinessProfile(existingProfile?.value || null) || {};
    const mergedProfile = {
      ...currentProfile,
      ...(payload.companyName !== undefined ? { businessName: payload.companyName || '' } : {}),
      ...(payload.companyAddress !== undefined ? { businessAddress: payload.companyAddress || '' } : {}),
      ...(payload.contactPersonName !== undefined ? { billingContactName: payload.contactPersonName || '' } : {}),
      ...(payload.contactEmail !== undefined ? { billingContactEmail: payload.contactEmail || '' } : {}),
      ...(payload.contactMobile !== undefined ? { billingContactPhone: payload.contactMobile || '' } : {}),
      ...(payload.businessRegistrationNumber !== undefined ? { businessRegistrationNumber: payload.businessRegistrationNumber || '' } : {}),
      ...(payload.countryCode !== undefined ? { countryCode: payload.countryCode || '' } : {}),
      ...(payload.vatNumber !== undefined ? { vatNumber: payload.vatNumber || '' } : {}),
      ...(payload.billingNotes !== undefined ? { notes: payload.billingNotes || '' } : {}),
      updatedAt: new Date().toISOString(),
    };

    if (existingProfile) {
      await db
        .update(platformConfiguration)
        .set({
          value: JSON.stringify(mergedProfile),
          dataType: 'json',
          description: 'Enterprise customer business profile synced from on-prem system',
          updatedAt: new Date(),
        })
        .where(eq(platformConfiguration.id, existingProfile.id));
    } else {
      await db
        .insert(platformConfiguration)
        .values({
          key: profileKey,
          value: JSON.stringify(mergedProfile),
          dataType: 'json',
          description: 'Enterprise customer business profile synced from on-prem system',
          isEditable: true,
          lastModifiedBy: req.session.userId || null,
        });
    }

    const { passwordHash, ...safeCustomer } = updated;
    res.json({
      success: true,
      customer: {
        ...safeCustomer,
        royaltyPercentage: Number((safeCustomer as any).royaltyPercentage || 0),
        businessRegistrationNumber: mergedProfile.businessRegistrationNumber || null,
        countryCode: mergedProfile.countryCode || null,
        vatNumber: mergedProfile.vatNumber || null,
        billingNotes: mergedProfile.notes || null,
        businessProfile: mergedProfile,
      },
    });
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error updating customer:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

router.delete('/customers/:id', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const force = req.query?.force === 'true';
    const actorUserId = req.session.userId || 'system';

    const [existing] = await db
      .select()
      .from(enterpriseCustomers)
      .where(eq(enterpriseCustomers.id, id))
      .limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Enterprise customer not found' });
    }

    const [licenseRequestCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(enterpriseLicenseRequests)
      .where(eq(enterpriseLicenseRequests.enterpriseCustomerId, id));
    const [systemCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(enterpriseSystems)
      .where(eq(enterpriseSystems.enterpriseCustomerId, id));
    const [docCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(enterpriseDocuments)
      .where(eq(enterpriseDocuments.enterpriseCustomerId, id));

    const hasDependencies = (licenseRequestCount?.count || 0) > 0 || (systemCount?.count || 0) > 0 || (docCount?.count || 0) > 0;
    if (hasDependencies && !force) {
      return res.status(409).json({
        error: 'Customer has linked data. Re-run with ?force=true to cascade delete.',
      });
    }

    if (force) {
      const revokeReason = `Customer deleted by SuperAdmin (${actorUserId})`;
      const systems = await db
        .select({
          id: enterpriseSystems.id,
          systemType: enterpriseSystems.systemType,
          hardwareKey: enterpriseSystems.hardwareKey,
          internalHostname: enterpriseSystems.internalHostname,
          baseUrl: enterpriseSystems.baseUrl,
          autoApproveRenewals: enterpriseSystems.autoApproveRenewals,
          graceDays: enterpriseSystems.graceDays,
          monthlyFee: enterpriseSystems.monthlyFee,
          feeCurrency: enterpriseSystems.feeCurrency,
          billingStatus: enterpriseSystems.billingStatus,
        })
        .from(enterpriseSystems)
        .where(eq(enterpriseSystems.enterpriseCustomerId, id));
      const customerLicenseKeys = await db
        .select({
          id: enterpriseLicenseKeys.id,
          licenseId: enterpriseLicenseKeys.licenseId,
          encryptedKeyData: enterpriseLicenseKeys.encryptedKeyData,
          systemType: enterpriseLicenseKeys.systemType,
          expiresAt: enterpriseLicenseKeys.expiresAt,
        })
        .from(enterpriseLicenseKeys)
        .where(eq(enterpriseLicenseKeys.enterpriseCustomerId, id));

      // Best-effort immediate enforcement: push deactivation to reachable systems.
      for (const system of systems) {
        try {
          await deactivateSystemLicense({
            enterpriseCustomerId: id,
            systemId: system.id,
            reason: revokeReason,
            actorUserId,
            cascadeStatus: 'suspended',
          });
        } catch (pushError: any) {
          console.warn('[EnterpriseSuperAdmin] Delete cascade push failed (continuing with tombstone enforcement):', pushError?.message || pushError);
        }
      }

      // Durable enforcement for next check-in: keep revocation tombstones even after hard-delete.
      for (const key of customerLicenseKeys) {
        if (key.licenseId) {
          await upsertRevokedLicenseTombstone({
            key: revokedLicenseByIdConfigKey(String(key.licenseId)),
            reason: revokeReason,
            enterpriseCustomerId: id,
            actorUserId,
            metadata: {
              systemType: key.systemType || null,
              expiresAt: key.expiresAt ? new Date(key.expiresAt).toISOString() : null,
            },
          });
        }
        const keyHash = crypto.createHash('sha256').update(String(key.encryptedKeyData || '')).digest('hex');
        await upsertRevokedLicenseTombstone({
          key: revokedLicenseByHashConfigKey(keyHash),
          reason: revokeReason,
          enterpriseCustomerId: id,
          actorUserId,
          metadata: {
            systemType: key.systemType || null,
            expiresAt: key.expiresAt ? new Date(key.expiresAt).toISOString() : null,
          },
        });
      }

      await upsertDeletedCustomerRecoveryPolicy({
        deletedCustomerId: id,
        actorUserId,
        systems: systems.map((system) => ({
          id: system.id,
          systemType: system.systemType,
          hardwareKey: system.hardwareKey,
          internalHostname: system.internalHostname,
          baseUrl: system.baseUrl,
          autoApproveRenewals: system.autoApproveRenewals === true,
          graceDays: Number(system.graceDays || 15),
          monthlyFee: system.monthlyFee ? String(system.monthlyFee) : null,
          feeCurrency: system.feeCurrency ? String(system.feeCurrency) : null,
          billingStatus: system.billingStatus ? String(system.billingStatus) : null,
        })),
      });

      await db.delete(enterpriseSystemDailyTelemetry).where(eq(enterpriseSystemDailyTelemetry.enterpriseCustomerId, id));
      await db.delete(enterpriseRevenueSync).where(eq(enterpriseRevenueSync.enterpriseCustomerId, id));
      await db.delete(enterpriseSystems).where(eq(enterpriseSystems.enterpriseCustomerId, id));
      await db.delete(enterpriseLicenseKeys).where(eq(enterpriseLicenseKeys.enterpriseCustomerId, id));
      await db.delete(enterpriseLicenseRequests).where(eq(enterpriseLicenseRequests.enterpriseCustomerId, id));
      await db.delete(enterpriseDocuments).where(eq(enterpriseDocuments.enterpriseCustomerId, id));
      await db.delete(enterpriseKeyring).where(eq(enterpriseKeyring.enterpriseCustomerId, id));
      await db
        .update(enterpriseCustomers)
        .set({ parentEnterpriseId: null, updatedAt: new Date() })
        .where(eq(enterpriseCustomers.parentEnterpriseId, id));
    }

    await db.delete(enterpriseCustomers).where(eq(enterpriseCustomers.id, id));

    res.json({ success: true });
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error deleting customer:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

router.get('/builds', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { page, pageSize } = parsePagination(req);
    const search = String(req.query?.search || '').trim().toLowerCase();
    const activeFilter = String(req.query?.isActive || '').trim().toLowerCase();
    const builds = await db
      .select()
      .from(buildVersions)
      .orderBy(desc(buildVersions.createdAt));
    const filtered = builds.filter((build: any) => {
      if (activeFilter === 'true' && build.isActive !== true) return false;
      if (activeFilter === 'false' && build.isActive !== false) return false;
      if (!search) return true;
      return (
        includesText(build.versionNumber, search) ||
        includesText(build.releaseNotes, search) ||
        includesText(build.fileName, search)
      );
    });
    res.json(paginateItems(filtered, page, pageSize));
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error listing builds:', error);
    res.status(500).json({ error: 'Failed to list build versions' });
  }
});

router.post('/builds/upload', isSuperAdmin, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { versionNumber, releaseNotes, buildDate } = req.body;
    const file = req.file;

    if (!versionNumber || !file) {
      return res.status(400).json({ error: 'versionNumber and file are required' });
    }

    if (!buildDate) {
      return res.status(400).json({ error: 'buildDate is required' });
    }

    const parsedBuildDate = new Date(buildDate);
    if (isNaN(parsedBuildDate.getTime())) {
      return res.status(400).json({ error: 'buildDate must be a valid date' });
    }

    const versionRegex = /^LearnPlay \d+\.\d{2}\.\d{2}\.\d{2}$/;
    if (!versionRegex.test(versionNumber)) {
      return res.status(400).json({ error: 'Version must be in format "LearnPlay X.XX.XX.XX" (e.g. LearnPlay 1.00.00.01)' });
    }

    const [existing] = await db
      .select({ id: buildVersions.id })
      .from(buildVersions)
      .where(eq(buildVersions.versionNumber, versionNumber))
      .limit(1);

    if (existing) {
      return res.status(409).json({ error: 'A build with this version number already exists' });
    }

    const storagePath = buildCanonicalStorageKey({
      scope: 'private',
      domain: 'ent-build',
      extension: normalizeExtension(path.extname(file.originalname || '')) || '.zip',
      seed: `enterprise-build:${versionNumber}:${file.originalname}:${Date.now()}`,
    });

    await uploadBufferToStorage(storagePath, file.buffer, file.mimetype);

    const [build] = await db
      .insert(buildVersions)
      .values({
        versionNumber,
        releaseNotes: releaseNotes || null,
        fileName: file.originalname,
        filePath: storagePath,
        fileSize: file.size,
        uploadedBy: req.session.userId!,
        buildDate: parsedBuildDate,
      })
      .returning();

    console.log(`[EnterpriseSuperAdmin] Build ${versionNumber} uploaded by SuperAdmin ${req.session.userId}`);

    res.status(201).json(build);
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error uploading build:', error);
    res.status(500).json({ error: 'Failed to upload build version' });
  }
});

router.put('/builds/:id', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { releaseNotes, isActive } = req.body;

    const [existing] = await db
      .select({ id: buildVersions.id })
      .from(buildVersions)
      .where(eq(buildVersions.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Build version not found' });
    }

    const updateData: any = {};
    if (releaseNotes !== undefined) updateData.releaseNotes = releaseNotes;
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await db
      .update(buildVersions)
      .set(updateData)
      .where(eq(buildVersions.id, id))
      .returning();

    console.log(`[EnterpriseSuperAdmin] Build ${id} updated by SuperAdmin ${req.session.userId}`);

    res.json(updated);
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error updating build:', error);
    res.status(500).json({ error: 'Failed to update build version' });
  }
});

router.delete('/builds/:id', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { hardDelete } = req.query;

    const [existing] = await db
      .select()
      .from(buildVersions)
      .where(eq(buildVersions.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Build version not found' });
    }

    if (hardDelete === 'true') {
      await db.delete(buildVersions).where(eq(buildVersions.id, id));
      console.log(`[EnterpriseSuperAdmin] Build ${id} hard deleted by SuperAdmin ${req.session.userId}`);
    } else {
      await db
        .update(buildVersions)
        .set({ isActive: false })
        .where(eq(buildVersions.id, id));
      console.log(`[EnterpriseSuperAdmin] Build ${id} soft deleted by SuperAdmin ${req.session.userId}`);
    }

    res.json({ success: true, message: 'Build version deleted' });
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error deleting build:', error);
    res.status(500).json({ error: 'Failed to delete build version' });
  }
});

router.get('/license-requests', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { page, pageSize } = parsePagination(req);
    const search = String(req.query?.search || '').trim().toLowerCase();
    const statusFilter = String(req.query?.status || '').trim().toLowerCase();
    const systemTypeFilter = String(req.query?.systemType || '').trim().toLowerCase();
    const requestTypeFilter = String(req.query?.requestType || '').trim().toLowerCase();
    const customerFilter = String(req.query?.enterpriseCustomerId || '').trim();
    const requests = await db
      .select({
        id: enterpriseLicenseRequests.id,
        enterpriseCustomerId: enterpriseLicenseRequests.enterpriseCustomerId,
        requestData: enterpriseLicenseRequests.requestData,
        hardwareKey: enterpriseLicenseRequests.hardwareKey,
        hostname: enterpriseLicenseRequests.hostname,
        serverBaseUrl: enterpriseLicenseRequests.serverBaseUrl,
        systemType: enterpriseLicenseRequests.systemType,
        status: enterpriseLicenseRequests.status,
        denialReason: enterpriseLicenseRequests.denialReason,
        monthlyFee: enterpriseLicenseRequests.monthlyFee,
        feeCurrency: enterpriseLicenseRequests.feeCurrency,
        requestType: enterpriseLicenseRequests.requestType,
        reviewedBy: enterpriseLicenseRequests.reviewedBy,
        reviewedAt: enterpriseLicenseRequests.reviewedAt,
        createdAt: enterpriseLicenseRequests.createdAt,
        customerCompanyName: enterpriseCustomers.companyName,
        customerEmail: enterpriseCustomers.email,
        customerContactName: enterpriseCustomers.contactPersonName,
      })
      .from(enterpriseLicenseRequests)
      .leftJoin(enterpriseCustomers, eq(enterpriseLicenseRequests.enterpriseCustomerId, enterpriseCustomers.id))
      .orderBy(desc(enterpriseLicenseRequests.createdAt));
    const filtered = requests.filter((row: any) => {
      if (statusFilter && statusFilter !== 'all' && String(row.status || '').toLowerCase() !== statusFilter) return false;
      if (systemTypeFilter && systemTypeFilter !== 'all' && String(row.systemType || '').toLowerCase() !== systemTypeFilter) return false;
      if (requestTypeFilter && requestTypeFilter !== 'all' && String(row.requestType || '').toLowerCase() !== requestTypeFilter) return false;
      if (customerFilter && row.enterpriseCustomerId !== customerFilter) return false;
      if (!search) return true;
      return (
        includesText(row.customerCompanyName, search) ||
        includesText(row.customerEmail, search) ||
        includesText(row.customerContactName, search) ||
        includesText(row.hostname, search) ||
        includesText(row.hardwareKey, search)
      );
    });

    res.json(paginateItems(sortEnterpriseLicenseRecords(filtered), page, pageSize));
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error listing license requests:', error);
    res.status(500).json({ error: 'Failed to list license requests' });
  }
});

router.get('/license-requests/:id', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [request] = await db
      .select({
        id: enterpriseLicenseRequests.id,
        enterpriseCustomerId: enterpriseLicenseRequests.enterpriseCustomerId,
        requestData: enterpriseLicenseRequests.requestData,
        hardwareKey: enterpriseLicenseRequests.hardwareKey,
        hostname: enterpriseLicenseRequests.hostname,
        serverBaseUrl: enterpriseLicenseRequests.serverBaseUrl,
        systemType: enterpriseLicenseRequests.systemType,
        status: enterpriseLicenseRequests.status,
        denialReason: enterpriseLicenseRequests.denialReason,
        monthlyFee: enterpriseLicenseRequests.monthlyFee,
        feeCurrency: enterpriseLicenseRequests.feeCurrency,
        requestType: enterpriseLicenseRequests.requestType,
        reviewedBy: enterpriseLicenseRequests.reviewedBy,
        reviewedAt: enterpriseLicenseRequests.reviewedAt,
        createdAt: enterpriseLicenseRequests.createdAt,
        customerCompanyName: enterpriseCustomers.companyName,
        customerEmail: enterpriseCustomers.email,
        customerContactName: enterpriseCustomers.contactPersonName,
      })
      .from(enterpriseLicenseRequests)
      .leftJoin(enterpriseCustomers, eq(enterpriseLicenseRequests.enterpriseCustomerId, enterpriseCustomers.id))
      .where(eq(enterpriseLicenseRequests.id, id))
      .limit(1);

    if (!request) {
      return res.status(404).json({ error: 'License request not found' });
    }

    const licenseKeys = await db
      .select()
      .from(enterpriseLicenseKeys)
      .where(eq(enterpriseLicenseKeys.licenseRequestId, id));

    res.json({ ...request, licenseKeys });
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error getting license request detail:', error);
    res.status(500).json({ error: 'Failed to get license request detail' });
  }
});

router.put('/license-requests/:id/set-fee', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { monthlyFee } = req.body;
    const rawFeeCurrency = req.body?.feeCurrency;
    if (rawFeeCurrency !== undefined && !isSupportedCurrency(rawFeeCurrency)) {
      return res.status(400).json({ error: 'feeCurrency must be EUR, USD, or ZAR' });
    }
    const feeCurrency = normalizeSupportedCurrency(req.body?.feeCurrency, 'USD');

    if (monthlyFee === undefined || !feeCurrency) {
      return res.status(400).json({ error: 'monthlyFee and feeCurrency are required' });
    }

    const parsedMonthlyFee = Number(monthlyFee);
    if (!Number.isFinite(parsedMonthlyFee) || parsedMonthlyFee < 0) {
      return res.status(400).json({ error: 'monthlyFee must be a valid number greater than or equal to 0' });
    }

    const [existing] = await db
      .select({ id: enterpriseLicenseRequests.id })
      .from(enterpriseLicenseRequests)
      .where(eq(enterpriseLicenseRequests.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'License request not found' });
    }

    const [updated] = await db
      .update(enterpriseLicenseRequests)
      .set({
        monthlyFee: parsedMonthlyFee.toFixed(4),
        feeCurrency,
      })
      .where(eq(enterpriseLicenseRequests.id, id))
      .returning();

    console.log(`[EnterpriseSuperAdmin] Fee set for license request ${id} by SuperAdmin ${req.session.userId}`);

    res.json(updated);
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error setting fee:', error);
    res.status(500).json({ error: 'Failed to set license fee' });
  }
});

router.put('/license-requests/:id/approve', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { monthlyFee: bodyMonthlyFee, feeCurrency: bodyFeeCurrency } = req.body;
    if (bodyFeeCurrency !== undefined && !isSupportedCurrency(bodyFeeCurrency)) {
      return res.status(400).json({ error: 'feeCurrency must be EUR, USD, or ZAR' });
    }

    const [request] = await db
      .select()
      .from(enterpriseLicenseRequests)
      .where(eq(enterpriseLicenseRequests.id, id))
      .limit(1);

    if (!request) {
      return res.status(404).json({ error: 'License request not found' });
    }

    if (request.status === 'approved') {
      return res.status(400).json({ error: 'License request is already approved' });
    }

    const approvedSiblings = await db
      .select()
      .from(enterpriseLicenseRequests)
      .where(and(
        eq(enterpriseLicenseRequests.enterpriseCustomerId, request.enterpriseCustomerId),
        eq(enterpriseLicenseRequests.systemType, request.systemType),
        eq(enterpriseLicenseRequests.requestType, request.requestType || 'initial'),
        eq(enterpriseLicenseRequests.status, 'approved'),
      ))
      .orderBy(desc(enterpriseLicenseRequests.updatedAt), desc(enterpriseLicenseRequests.createdAt));

    const duplicateApproved = findLatestMatchingLicenseRequest(approvedSiblings, {
      hardwareKey: request.hardwareKey,
      hostname: request.hostname,
      serverBaseUrl: request.serverBaseUrl,
      systemType: request.systemType,
      requestType: request.requestType || 'initial',
      status: 'approved',
    });

    if (duplicateApproved && duplicateApproved.id !== request.id) {
      const now = new Date();
      await db
        .update(enterpriseLicenseRequests)
        .set({
          status: 'denied',
          denialReason: `Superseded duplicate request. Existing approved request: ${duplicateApproved.id}`,
          reviewedBy: req.session.userId!,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(eq(enterpriseLicenseRequests.id, request.id));

      return res.json({
        success: true,
        deduped: true,
        message: 'A matching approved request already exists; duplicate request was superseded.',
        licenseRequest: duplicateApproved,
      });
    }

    const finalMonthlyFeeRaw = bodyMonthlyFee !== undefined ? String(bodyMonthlyFee) : request.monthlyFee;
    const finalFeeCurrency = normalizeSupportedCurrency(bodyFeeCurrency || request.feeCurrency || 'USD', 'USD');
    const finalMonthlyFeeParsed = Number(finalMonthlyFeeRaw || '0');

    if (!Number.isFinite(finalMonthlyFeeParsed) || finalMonthlyFeeParsed < 0) {
      return res.status(400).json({ error: 'Monthly fee and currency must be set before approval. Use set-fee endpoint or provide in body.' });
    }
    const finalMonthlyFee = finalMonthlyFeeParsed.toFixed(4);

    const [customer] = await db
      .select()
      .from(enterpriseCustomers)
      .where(eq(enterpriseCustomers.id, request.enterpriseCustomerId))
      .limit(1);

    if (!customer) {
      return res.status(404).json({ error: 'Associated enterprise customer not found' });
    }

    const now = new Date();
    const expiresAt = endOfCalendarMonth(now);
    const graceDays = request.graceDays && request.graceDays > 0 ? request.graceDays : 15;
    const autoApproveRenewals = request.autoApproveRenewals === true;
    const renewalSequence = 1;
    const licenseId = `LIC-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const encryptedKeyData = signLicenseKey({
      licenseId,
      enterpriseCustomerId: request.enterpriseCustomerId,
      hardwareKey: request.hardwareKey || '',
      hostname: request.hostname || '',
      serverBaseUrl: request.serverBaseUrl || '',
      systemType: request.systemType as 'development' | 'qa' | 'production',
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      monthlyFee: finalMonthlyFee,
      feeCurrency: finalFeeCurrency,
      companyName: customer.companyName,
      renewalSequence,
      issuedReason: 'initial',
      graceDays,
      autoApproveRenewals,
      nextRenewalDueAt: expiresAt.toISOString(),
      issuedBy: req.session.userId!,
    });

    const [updatedRequest] = await db
      .update(enterpriseLicenseRequests)
      .set({
        status: 'approved',
        monthlyFee: finalMonthlyFee,
        feeCurrency: finalFeeCurrency,
        autoApproveRenewals,
        graceDays,
        billingStatus: request.billingStatus || 'due',
        lastRenewedAt: now,
        nextRenewalDueAt: expiresAt,
        reviewedBy: req.session.userId!,
        reviewedAt: now,
      })
      .where(eq(enterpriseLicenseRequests.id, id))
      .returning();

    const [licenseKey] = await db
      .insert(enterpriseLicenseKeys)
      .values({
        licenseId,
        licenseRequestId: id,
        enterpriseCustomerId: request.enterpriseCustomerId,
        encryptedKeyData,
        systemType: request.systemType,
        issuedReason: 'initial',
        renewalSequence,
        issuedAt: now,
        expiresAt,
      })
      .returning();

    await upsertEnterpriseSystemForLicense({
      enterpriseCustomerId: request.enterpriseCustomerId,
      systemType: request.systemType,
      hostname: request.hostname,
      serverBaseUrl: request.serverBaseUrl,
      hardwareKey: request.hardwareKey,
      licenseRequestId: id,
      licenseKeyId: licenseKey.id,
      expiresAt,
      monthlyFee: finalMonthlyFee,
      feeCurrency: finalFeeCurrency,
      autoApproveRenewals: true,
      graceDays,
      billingStatus: request.billingStatus || 'due',
    });

    console.log(`[EnterpriseSuperAdmin] License request ${id} approved by SuperAdmin ${req.session.userId}`);

    try {
      await provisionKeysForCustomer(request.enterpriseCustomerId);
      console.log(`[EnterpriseSuperAdmin] Keys provisioned for customer ${request.enterpriseCustomerId}`);
    } catch (keyError) {
      console.error('[EnterpriseSuperAdmin] Failed to provision keys (non-fatal):', keyError);
    }

    try {
      const baseUrl = getBaseUrl();
      const downloadUrl = `${baseUrl}/enterprise/license-keys`;
      const fromEmail = getEmailFrom();

      await sendRawEmail({
        from: { email: fromEmail, name: 'LearnPlay Enterprise' },
        to: [{ email: customer.email, name: customer.contactPersonName }],
        subject: 'Your Enterprise License Key is Ready',
        html: `
          <h2>License Key Approved</h2>
          <p>Hi ${customer.contactPersonName},</p>
          <p>Great news! Your license request for <strong>${customer.companyName}</strong> has been approved.</p>
          <p><strong>System Type:</strong> ${request.systemType}</p>
          <p><strong>Monthly Fee:</strong> ${finalFeeCurrency} ${finalMonthlyFee}</p>
          <p><strong>Expires:</strong> ${expiresAt.toLocaleDateString()}</p>
          <p>You can download your license key from your enterprise portal:</p>
          <p><a href="${downloadUrl}" style="display:inline-block;padding:12px 24px;background-color:#6366f1;color:#fff;text-decoration:none;border-radius:6px;">Download License Key</a></p>
          <p>Best regards,<br/>The LearnPlay Team</p>
        `,
      });
      console.log(`[EnterpriseSuperAdmin] Approval notification email sent to ${customer.email}`);
    } catch (emailError) {
      console.error('[EnterpriseSuperAdmin] Failed to send approval email:', emailError);
    }

    res.json({ success: true, licenseRequest: updatedRequest, licenseKey });
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error approving license request:', error);
    res.status(500).json({ error: 'Failed to approve license request' });
  }
});

router.put('/license-requests/:id/deny', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const denialReason = String(req.body?.denialReason || req.body?.reason || '').trim();

    if (!denialReason) {
      return res.status(400).json({ error: 'denialReason is required' });
    }

    const [request] = await db
      .select()
      .from(enterpriseLicenseRequests)
      .where(eq(enterpriseLicenseRequests.id, id))
      .limit(1);

    if (!request) {
      return res.status(404).json({ error: 'License request not found' });
    }

    const now = new Date();

    const [updated] = await db
      .update(enterpriseLicenseRequests)
      .set({
        status: 'denied',
        denialReason,
        reviewedBy: req.session.userId!,
        reviewedAt: now,
      })
      .where(eq(enterpriseLicenseRequests.id, id))
      .returning();

    console.log(`[EnterpriseSuperAdmin] License request ${id} denied by SuperAdmin ${req.session.userId}`);

    try {
      const [customer] = await db
        .select()
        .from(enterpriseCustomers)
        .where(eq(enterpriseCustomers.id, request.enterpriseCustomerId))
        .limit(1);

      if (customer) {
        const fromEmail = getEmailFrom();

        await sendRawEmail({
          from: { email: fromEmail, name: 'LearnPlay Enterprise' },
          to: [{ email: customer.email, name: customer.contactPersonName }],
          subject: 'Enterprise License Request Update',
          html: `
            <h2>License Request Update</h2>
            <p>Hi ${customer.contactPersonName},</p>
            <p>We regret to inform you that your license request for <strong>${customer.companyName}</strong> has been denied.</p>
            <p><strong>Reason:</strong> ${denialReason}</p>
            <p>If you have questions or would like to discuss this further, please contact our support team.</p>
            <p>Best regards,<br/>The LearnPlay Team</p>
          `,
        });
        console.log(`[EnterpriseSuperAdmin] Denial notification email sent to ${customer.email}`);
      }
    } catch (emailError) {
      console.error('[EnterpriseSuperAdmin] Failed to send denial email:', emailError);
    }

    res.json({ success: true, licenseRequest: updated });
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error denying license request:', error);
    res.status(500).json({ error: 'Failed to deny license request' });
  }
});

router.post('/license-requests/:id/decrypt', isSuperAdmin, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [request] = await db
      .select()
      .from(enterpriseLicenseRequests)
      .where(eq(enterpriseLicenseRequests.id, id))
      .limit(1);

    if (!request) {
      return res.status(404).json({ error: 'License request not found' });
    }

    let encryptedData: string;
    if (req.file) {
      encryptedData = req.file.buffer.toString('utf-8').trim();
    } else if (request.requestData) {
      encryptedData = request.requestData;
    } else {
      return res.status(400).json({ error: 'No encrypted data available. Upload a .lreq file or ensure request has requestData.' });
    }

    const decrypted = decryptLicenseRequest(encryptedData);

    const { persist } = req.body;
    if (persist === 'true' || persist === true) {
      await db.update(enterpriseLicenseRequests)
        .set({
          hardwareKey: decrypted.hardwareKey,
          hostname: decrypted.hostname,
          serverBaseUrl: decrypted.serverBaseUrl,
          systemType: decrypted.systemType,
        })
        .where(eq(enterpriseLicenseRequests.id, id));
    }

    console.log(`[EnterpriseSuperAdmin] License request ${id} decrypted by SuperAdmin ${req.session.userId}`);

    res.json({ success: true, decryptedData: decrypted });
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error decrypting license request:', error);
    res.status(500).json({ error: 'Failed to decrypt license request' });
  }
});

router.get('/customers/:id/keys', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { page, pageSize } = parsePagination(req);
    const search = String(req.query?.search || '').trim().toLowerCase();
    const purposeFilter = String(req.query?.purpose || '').trim().toLowerCase();
    const activeFilter = String(req.query?.isActive || '').trim().toLowerCase();
    const keys = await getCustomerKeys(id);
    const filtered = keys.filter((key: any) => {
      if (purposeFilter && purposeFilter !== 'all' && String(key.purpose || '').toLowerCase() !== purposeFilter) return false;
      if (activeFilter === 'true' && key.isActive !== true) return false;
      if (activeFilter === 'false' && key.isActive !== false) return false;
      if (!search) return true;
      return includesText(key.keyId, search) || includesText(key.purpose, search);
    });
    res.json(paginateItems(filtered, page, pageSize));
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error listing customer keys:', error);
    res.status(500).json({ error: 'Failed to list customer keys' });
  }
});

router.post('/customers/:id/keys/provision', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const provisioning = await provisionKeysForCustomer(id);
    const keys = await getCustomerKeys(id);
    console.log(`[EnterpriseSuperAdmin] Keys provisioned for customer ${id} by SuperAdmin ${req.session.userId}`);
    res.json({ success: true, keys, provisioning });
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error provisioning keys:', error);
    res.status(500).json({ error: 'Failed to provision keys' });
  }
});

router.post('/customers/:id/keys/rotate', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { purpose } = req.body;

    if (!purpose || !KEY_PURPOSES.includes(purpose)) {
      return res.status(400).json({ error: `purpose must be one of: ${KEY_PURPOSES.join(', ')}` });
    }

    await rotateKey(id, purpose);
    const keys = await getCustomerKeys(id);
    console.log(`[EnterpriseSuperAdmin] Key rotated for customer ${id}, purpose: ${purpose} by SuperAdmin ${req.session.userId}`);
    res.json({ success: true, keys });
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error rotating key:', error);
    res.status(500).json({ error: 'Failed to rotate key' });
  }
});

router.get('/customers/:id/keys/bundle', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const bundle = await buildProvisionBundle(id);
    console.log(`[EnterpriseSuperAdmin] Provision bundle generated for customer ${id} by SuperAdmin ${req.session.userId}`);
    res.json(bundle);
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error generating provision bundle:', error);
    res.status(500).json({ error: 'Failed to generate provision bundle' });
  }
});

router.get('/agreements', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { page, pageSize } = parsePagination(req);
    const search = String(req.query?.search || '').trim().toLowerCase();
    const activeFilter = String(req.query?.isActive || '').trim().toLowerCase();
    const typeFilter = String(req.query?.templateType || '').trim().toLowerCase();
    const templates = await db
      .select()
      .from(enterpriseAgreementTemplates)
      .orderBy(desc(enterpriseAgreementTemplates.createdAt));
    const filtered = templates.filter((template: any) => {
      if (activeFilter === 'true' && template.isActive !== true) return false;
      if (activeFilter === 'false' && template.isActive !== false) return false;
      if (typeFilter && typeFilter !== 'all' && String(template.templateType || '').toLowerCase() !== typeFilter) return false;
      if (!search) return true;
      return (
        includesText(template.templateName, search) ||
        includesText(template.version, search) ||
        includesText(template.fileName, search)
      );
    });
    res.json(paginateItems(filtered, page, pageSize));
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error listing agreement templates:', error);
    res.status(500).json({ error: 'Failed to list agreement templates' });
  }
});

router.post('/agreements/upload', isSuperAdmin, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { templateName, templateType, version } = req.body;
    const file = req.file;

    if (!templateName || !templateType || !file) {
      return res.status(400).json({ error: 'templateName, templateType, and file are required' });
    }

    if (!['sla', 'license_agreement'].includes(templateType)) {
      return res.status(400).json({ error: 'templateType must be sla or license_agreement' });
    }

    const storagePath = buildCanonicalStorageKey({
      scope: 'private',
      domain: 'ent-agr',
      extension: normalizeExtension(path.extname(file.originalname || '')) || '.pdf',
      seed: `enterprise-agreement:${templateType}:${templateName}:${file.originalname}:${Date.now()}`,
    });

    await uploadBufferToStorage(storagePath, file.buffer, file.mimetype);

    const [template] = await db
      .insert(enterpriseAgreementTemplates)
      .values({
        templateName,
        templateType,
        filePath: storagePath,
        fileName: file.originalname,
        version: version || null,
        uploadedBy: req.session.userId!,
      })
      .returning();

    console.log(`[EnterpriseSuperAdmin] Agreement template uploaded by SuperAdmin ${req.session.userId}`);

    res.status(201).json(template);
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error uploading agreement template:', error);
    res.status(500).json({ error: 'Failed to upload agreement template' });
  }
});

router.put('/agreements/:id', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { templateName, isActive } = req.body;

    const [existing] = await db
      .select({ id: enterpriseAgreementTemplates.id })
      .from(enterpriseAgreementTemplates)
      .where(eq(enterpriseAgreementTemplates.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Agreement template not found' });
    }

    const updateData: any = {};
    if (templateName !== undefined) updateData.templateName = templateName;
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await db
      .update(enterpriseAgreementTemplates)
      .set(updateData)
      .where(eq(enterpriseAgreementTemplates.id, id))
      .returning();

    console.log(`[EnterpriseSuperAdmin] Agreement template ${id} updated by SuperAdmin ${req.session.userId}`);

    res.json(updated);
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error updating agreement template:', error);
    res.status(500).json({ error: 'Failed to update agreement template' });
  }
});

router.delete('/agreements/:id', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [existing] = await db
      .select({ id: enterpriseAgreementTemplates.id })
      .from(enterpriseAgreementTemplates)
      .where(eq(enterpriseAgreementTemplates.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Agreement template not found' });
    }

    await db.delete(enterpriseAgreementTemplates).where(eq(enterpriseAgreementTemplates.id, id));

    console.log(`[EnterpriseSuperAdmin] Agreement template ${id} deleted by SuperAdmin ${req.session.userId}`);

    res.json({ success: true, message: 'Agreement template deleted' });
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error deleting agreement template:', error);
    res.status(500).json({ error: 'Failed to delete agreement template' });
  }
});

router.get('/revenue', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const {
      enterpriseCustomerId,
      startDate,
      endDate,
      systemType,
      includeNonProduction,
      reportingCurrency: reportingCurrencyParam,
    } = req.query;

    if (reportingCurrencyParam !== undefined && !isSupportedCurrency(reportingCurrencyParam)) {
      return res.status(400).json({ error: 'reportingCurrency must be EUR, USD, or ZAR' });
    }

    let reportingCurrency = normalizeSupportedCurrency(reportingCurrencyParam, 'USD');
    if (!reportingCurrencyParam) {
      const [platformCurrencyRow] = await db
        .select({ value: platformConfiguration.value })
        .from(platformConfiguration)
        .where(eq(platformConfiguration.key, 'platform_currency'))
        .limit(1);
      reportingCurrency = normalizeSupportedCurrency(platformCurrencyRow?.value || 'USD', 'USD');
    }

    const conversionWarnings = new Set<string>();
    const conversionRateCache = new Map<string, number>();
    const toNumber = (value: any): number => {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    };
    const delta = (latest: number, earliest: number): number => Math.max(0, latest - earliest);
    const toReportingAmount = async (rawAmount: number, sourceCurrencyRaw: unknown): Promise<number> => {
      const amount = toNumber(rawAmount);
      if (amount <= 0) return 0;
      const sourceCurrency = normalizeSupportedCurrency(sourceCurrencyRaw, reportingCurrency);
      if (sourceCurrency === reportingCurrency) return amount;

      const cacheKey = `${sourceCurrency}->${reportingCurrency}`;
      let rate = conversionRateCache.get(cacheKey);
      if (rate === undefined) {
        try {
          const directRate = await CurrencyService.getLatestRate(sourceCurrency, reportingCurrency);
          if (directRate?.rate) {
            rate = toNumber(directRate.rate);
          } else {
            const inverseRate = await CurrencyService.getLatestRate(reportingCurrency, sourceCurrency);
            const inverse = toNumber(inverseRate?.rate || 0);
            rate = inverse > 0 ? (1 / inverse) : 0;
          }
        } catch {
          rate = 0;
        }
        conversionRateCache.set(cacheKey, rate);
      }

      if (!rate || rate <= 0) {
        conversionWarnings.add(`Missing FX rate ${sourceCurrency}->${reportingCurrency}; value kept in source amount`);
        return amount;
      }
      return amount * rate;
    };

    const conditions: any[] = [];
    if (typeof enterpriseCustomerId === 'string' && enterpriseCustomerId) {
      conditions.push(eq(enterpriseSystemDailyTelemetry.enterpriseCustomerId, enterpriseCustomerId));
    }
    if (typeof startDate === 'string' && startDate) {
      conditions.push(gte(enterpriseSystemDailyTelemetry.reportDate, startDate as any));
    }
    if (typeof endDate === 'string' && endDate) {
      conditions.push(lte(enterpriseSystemDailyTelemetry.reportDate, endDate as any));
    }
    if (typeof systemType === 'string' && ['development', 'qa', 'production'].includes(systemType)) {
      conditions.push(eq(enterpriseSystemDailyTelemetry.systemType, systemType));
    }
    const includeNonProd = String(includeNonProduction || 'true') !== 'false';
    if (!includeNonProd && !(typeof systemType === 'string' && systemType === 'production')) {
      conditions.push(eq(enterpriseSystemDailyTelemetry.systemType, 'production'));
    }

    let telemetryQuery = db
      .select({
        id: enterpriseSystemDailyTelemetry.id,
        enterpriseCustomerId: enterpriseSystemDailyTelemetry.enterpriseCustomerId,
        enterpriseSystemId: enterpriseSystemDailyTelemetry.enterpriseSystemId,
        systemType: enterpriseSystemDailyTelemetry.systemType,
        organizationId: enterpriseSystemDailyTelemetry.organizationId,
        organizationName: enterpriseSystemDailyTelemetry.organizationName,
        hostname: enterpriseSystemDailyTelemetry.hostname,
        serverBaseUrl: enterpriseSystemDailyTelemetry.serverBaseUrl,
        totalUsers: enterpriseSystemDailyTelemetry.totalUsers,
        totalOrgAdmins: enterpriseSystemDailyTelemetry.totalOrgAdmins,
        totalTrainers: enterpriseSystemDailyTelemetry.totalTrainers,
        totalLearners: enterpriseSystemDailyTelemetry.totalLearners,
        totalCustSupers: enterpriseSystemDailyTelemetry.totalCustSupers,
        totalSuperAdmins: enterpriseSystemDailyTelemetry.totalSuperAdmins,
        totalDemoOrganizations: enterpriseSystemDailyTelemetry.totalDemoOrganizations,
        totalDemoUsers: enterpriseSystemDailyTelemetry.totalDemoUsers,
        totalOrganizations: enterpriseSystemDailyTelemetry.totalOrganizations,
        totalCourses: enterpriseSystemDailyTelemetry.totalCourses,
        totalPublishedCourses: enterpriseSystemDailyTelemetry.totalPublishedCourses,
        totalDemoCourses: enterpriseSystemDailyTelemetry.totalDemoCourses,
        totalDemoPublishedCourses: enterpriseSystemDailyTelemetry.totalDemoPublishedCourses,
        totalEnrollments: enterpriseSystemDailyTelemetry.totalEnrollments,
        totalPublishedEnrollments: enterpriseSystemDailyTelemetry.totalPublishedEnrollments,
        totalDemoEnrollments: enterpriseSystemDailyTelemetry.totalDemoEnrollments,
        totalPaidCourseEnrollments: enterpriseSystemDailyTelemetry.totalPaidCourseEnrollments,
        totalFreeCourseEnrollments: enterpriseSystemDailyTelemetry.totalFreeCourseEnrollments,
        totalPaidEnrollmentValue: enterpriseSystemDailyTelemetry.totalPaidEnrollmentValue,
        totalDemoPaidEnrollmentValue: enterpriseSystemDailyTelemetry.totalDemoPaidEnrollmentValue,
        totalFreeEnrollmentValue: enterpriseSystemDailyTelemetry.totalFreeEnrollmentValue,
        totalAssignments: enterpriseSystemDailyTelemetry.totalAssignments,
        totalPublishedAssignments: enterpriseSystemDailyTelemetry.totalPublishedAssignments,
        totalDemoCompletions: enterpriseSystemDailyTelemetry.totalDemoCompletions,
        totalPaidCourseCompletions: enterpriseSystemDailyTelemetry.totalPaidCourseCompletions,
        totalFreeCourseCompletions: enterpriseSystemDailyTelemetry.totalFreeCourseCompletions,
        totalPaidCompletionValue: enterpriseSystemDailyTelemetry.totalPaidCompletionValue,
        totalDemoPaidCompletionValue: enterpriseSystemDailyTelemetry.totalDemoPaidCompletionValue,
        totalFreeCourseCompletionsValue: enterpriseSystemDailyTelemetry.totalFreeCourseCompletionsValue,
        activeUsers30Days: enterpriseSystemDailyTelemetry.activeUsers30Days,
        royaltyPercentageApplied: enterpriseSystemDailyTelemetry.royaltyPercentageApplied,
        royaltyRevenueEnrollments: enterpriseSystemDailyTelemetry.royaltyRevenueEnrollments,
        royaltyRevenueCompletions: enterpriseSystemDailyTelemetry.royaltyRevenueCompletions,
        royaltyRevenueTotal: enterpriseSystemDailyTelemetry.royaltyRevenueTotal,
        metricCurrency: enterpriseSystemDailyTelemetry.metricCurrency,
        metricsSchemaVersion: enterpriseSystemDailyTelemetry.metricsSchemaVersion,
        reportDate: enterpriseSystemDailyTelemetry.reportDate,
        reportedAt: enterpriseSystemDailyTelemetry.reportedAt,
        customerCompanyName: enterpriseCustomers.companyName,
      })
      .from(enterpriseSystemDailyTelemetry)
      .leftJoin(enterpriseCustomers, eq(enterpriseSystemDailyTelemetry.enterpriseCustomerId, enterpriseCustomers.id));

    if (conditions.length > 0) {
      telemetryQuery = telemetryQuery.where(and(...conditions)) as any;
    }

    const telemetryRows = await (telemetryQuery as any).orderBy(
      desc(enterpriseSystemDailyTelemetry.reportDate),
      desc(enterpriseSystemDailyTelemetry.reportedAt),
    );

    const systemRows = await db
      .select({
        id: enterpriseSystems.id,
        enterpriseCustomerId: enterpriseSystems.enterpriseCustomerId,
        systemType: enterpriseSystems.systemType,
        licenseStatus: enterpriseSystems.licenseStatus,
        monthlyFee: enterpriseSystems.monthlyFee,
        feeCurrency: enterpriseSystems.feeCurrency,
        updatedAt: enterpriseSystems.updatedAt,
      })
      .from(enterpriseSystems);

    const customerRows = await db
      .select({
        id: enterpriseCustomers.id,
        companyName: enterpriseCustomers.companyName,
        royaltyPercentage: enterpriseCustomers.royaltyPercentage,
      })
      .from(enterpriseCustomers);

    type Row = any;
    const groupMap = new Map<string, { latest: Row; earliest: Row }>();
    for (const row of telemetryRows as Row[]) {
      const key = [
        row.enterpriseCustomerId || '',
        row.enterpriseSystemId || '',
        row.organizationId || row.organizationName || '',
      ].join('|');
      const existing = groupMap.get(key);
      if (!existing) {
        groupMap.set(key, { latest: row, earliest: row });
      } else {
        existing.earliest = row;
      }
    }

    const pointInTime = {
      totalOrganizations: 0,
      totalUsers: 0,
      totalOrgAdmins: 0,
      totalTrainers: 0,
      totalLearners: 0,
      totalCustSupers: 0,
      totalSuperAdmins: 0,
      totalDemoOrganizations: 0,
      totalDemoUsers: 0,
      totalCourses: 0,
      totalPublishedCourses: 0,
      totalDemoCourses: 0,
      totalDemoPublishedCourses: 0,
      totalAssignments: 0,
      totalPublishedAssignments: 0,
      totalEnrollments: 0,
      totalPublishedEnrollments: 0,
      totalDemoEnrollments: 0,
      totalDemoCompletions: 0,
      activeUsers30Days: 0,
    };
    const periodTotals = {
      totalPaidCourseEnrollments: 0,
      totalFreeCourseEnrollments: 0,
      totalPaidEnrollmentValue: 0,
      totalDemoPaidEnrollmentValue: 0,
      totalFreeEnrollmentValue: 0,
      totalPaidCourseCompletions: 0,
      totalFreeCourseCompletions: 0,
      totalPaidCompletionValue: 0,
      totalDemoPaidCompletionValue: 0,
      totalFreeCourseCompletionsValue: 0,
      royaltyRevenue: 0,
    };

    for (const { latest, earliest } of Array.from(groupMap.values())) {
      pointInTime.totalOrganizations += toNumber(latest.totalOrganizations || 0);
      pointInTime.totalUsers += toNumber(latest.totalUsers || 0);
      pointInTime.totalOrgAdmins += toNumber(latest.totalOrgAdmins || 0);
      pointInTime.totalTrainers += toNumber(latest.totalTrainers || 0);
      pointInTime.totalLearners += toNumber(latest.totalLearners || 0);
      pointInTime.totalCustSupers += toNumber(latest.totalCustSupers || 0);
      pointInTime.totalSuperAdmins += toNumber(latest.totalSuperAdmins || 0);
      pointInTime.totalDemoOrganizations += toNumber(latest.totalDemoOrganizations || 0);
      pointInTime.totalDemoUsers += toNumber(latest.totalDemoUsers || 0);
      pointInTime.totalCourses += toNumber(latest.totalCourses || 0);
      pointInTime.totalPublishedCourses += toNumber(latest.totalPublishedCourses || 0);
      pointInTime.totalDemoCourses += toNumber(latest.totalDemoCourses || 0);
      pointInTime.totalDemoPublishedCourses += toNumber(latest.totalDemoPublishedCourses || 0);
      pointInTime.totalAssignments += toNumber(latest.totalAssignments || 0);
      pointInTime.totalPublishedAssignments += toNumber(latest.totalPublishedAssignments || 0);
      pointInTime.totalEnrollments += toNumber(latest.totalEnrollments || 0);
      pointInTime.totalPublishedEnrollments += toNumber(latest.totalPublishedEnrollments || 0);
      pointInTime.totalDemoEnrollments += toNumber(latest.totalDemoEnrollments || 0);
      pointInTime.totalDemoCompletions += toNumber(latest.totalDemoCompletions || 0);
      pointInTime.activeUsers30Days += toNumber(latest.activeUsers30Days || 0);

      periodTotals.totalPaidCourseEnrollments += delta(
        toNumber(latest.totalPaidCourseEnrollments || 0),
        toNumber(earliest.totalPaidCourseEnrollments || 0),
      );
      periodTotals.totalFreeCourseEnrollments += delta(
        toNumber(latest.totalFreeCourseEnrollments || 0),
        toNumber(earliest.totalFreeCourseEnrollments || 0),
      );
      periodTotals.totalPaidEnrollmentValue += await toReportingAmount(delta(
        toNumber(latest.totalPaidEnrollmentValue || 0),
        toNumber(earliest.totalPaidEnrollmentValue || 0),
      ), latest.metricCurrency || reportingCurrency);
      periodTotals.totalDemoPaidEnrollmentValue += await toReportingAmount(delta(
        toNumber(latest.totalDemoPaidEnrollmentValue || 0),
        toNumber(earliest.totalDemoPaidEnrollmentValue || 0),
      ), latest.metricCurrency || reportingCurrency);
      periodTotals.totalFreeEnrollmentValue += await toReportingAmount(delta(
        toNumber(latest.totalFreeEnrollmentValue || 0),
        toNumber(earliest.totalFreeEnrollmentValue || 0),
      ), latest.metricCurrency || reportingCurrency);
      periodTotals.totalPaidCourseCompletions += delta(
        toNumber(latest.totalPaidCourseCompletions || 0),
        toNumber(earliest.totalPaidCourseCompletions || 0),
      );
      periodTotals.totalFreeCourseCompletions += delta(
        toNumber(latest.totalFreeCourseCompletions || 0),
        toNumber(earliest.totalFreeCourseCompletions || 0),
      );
      periodTotals.totalPaidCompletionValue += await toReportingAmount(delta(
        toNumber(latest.totalPaidCompletionValue || 0),
        toNumber(earliest.totalPaidCompletionValue || 0),
      ), latest.metricCurrency || reportingCurrency);
      periodTotals.totalDemoPaidCompletionValue += await toReportingAmount(delta(
        toNumber(latest.totalDemoPaidCompletionValue || 0),
        toNumber(earliest.totalDemoPaidCompletionValue || 0),
      ), latest.metricCurrency || reportingCurrency);
      periodTotals.totalFreeCourseCompletionsValue += await toReportingAmount(delta(
        toNumber(latest.totalFreeCourseCompletionsValue || 0),
        toNumber(earliest.totalFreeCourseCompletionsValue || 0),
      ), latest.metricCurrency || reportingCurrency);
      periodTotals.royaltyRevenue += await toReportingAmount(delta(
        toNumber(latest.royaltyRevenueTotal || 0),
        toNumber(earliest.royaltyRevenueTotal || 0),
      ), latest.metricCurrency || reportingCurrency);
    }

    const activeStatuses = new Set(['active', 'grace']);
    const filteredSystems = systemRows.filter((system) => {
      if (typeof enterpriseCustomerId === 'string' && enterpriseCustomerId && system.enterpriseCustomerId !== enterpriseCustomerId) {
        return false;
      }
      if (!includeNonProd && system.systemType !== 'production') {
        return false;
      }
      if (typeof systemType === 'string' && ['development', 'qa', 'production'].includes(systemType) && system.systemType !== systemType) {
        return false;
      }
      return true;
    });

    const activeLicensesCount = filteredSystems.filter((s) => activeStatuses.has(String(s.licenseStatus || ''))).length;
    let totalLicenseRevenue = 0;
    for (const system of filteredSystems) {
      totalLicenseRevenue += await toReportingAmount(
        toNumber(system.monthlyFee || 0),
        system.feeCurrency || reportingCurrency,
      );
    }
    const totalRoyaltyRevenue = periodTotals.royaltyRevenue;
    const totalRevenue = totalLicenseRevenue + totalRoyaltyRevenue;

    const customerRollupMap = new Map<string, any>();
    for (const row of telemetryRows as Row[]) {
      const key = row.enterpriseCustomerId;
      if (!key) continue;
      if (!customerRollupMap.has(key)) {
        const customer = customerRows.find((c) => c.id === key);
        customerRollupMap.set(key, {
          enterpriseCustomerId: key,
          companyName: row.customerCompanyName || customer?.companyName || 'Unknown',
          royaltyPercentage: toNumber(customer?.royaltyPercentage || row.royaltyPercentageApplied || 0),
          latestReportedAt: row.reportedAt || null,
          licenseCount: 0,
          monthlyRevenue: 0,
          royaltyRevenue: 0,
          totalPaidEnrollmentValue: 0,
          totalFreeEnrollmentValue: 0,
          totalPaidCompletionValue: 0,
          totalFreeCourseCompletionsValue: 0,
          totalPaidCourseEnrollments: 0,
          totalFreeCourseEnrollments: 0,
          totalPaidCourseCompletions: 0,
          totalFreeCourseCompletions: 0,
        });
      }
      const rollup = customerRollupMap.get(key)!;
      const reportedAt = row.reportedAt ? new Date(row.reportedAt) : null;
      const latestReportedAt = rollup.latestReportedAt ? new Date(rollup.latestReportedAt) : null;
      if (!latestReportedAt || (reportedAt && reportedAt > latestReportedAt)) {
        rollup.latestReportedAt = row.reportedAt || null;
      }
    }

    for (const system of filteredSystems) {
      const rollup = customerRollupMap.get(system.enterpriseCustomerId);
      if (!rollup) continue;
      rollup.licenseCount += 1;
      rollup.monthlyRevenue += await toReportingAmount(
        toNumber(system.monthlyFee || 0),
        system.feeCurrency || reportingCurrency,
      );
    }

    // Add period deltas per customer from telemetry group map
    for (const { latest, earliest } of Array.from(groupMap.values())) {
      const rollup = customerRollupMap.get(latest.enterpriseCustomerId);
      if (!rollup) continue;
      rollup.totalPaidCourseEnrollments += delta(
        toNumber(latest.totalPaidCourseEnrollments || 0),
        toNumber(earliest.totalPaidCourseEnrollments || 0),
      );
      rollup.totalPaidCourseCompletions += delta(
        toNumber(latest.totalPaidCourseCompletions || 0),
        toNumber(earliest.totalPaidCourseCompletions || 0),
      );
      rollup.totalPaidEnrollmentValue += await toReportingAmount(delta(
        toNumber(latest.totalPaidEnrollmentValue || 0),
        toNumber(earliest.totalPaidEnrollmentValue || 0),
      ), latest.metricCurrency || reportingCurrency);
      rollup.totalFreeEnrollmentValue += await toReportingAmount(delta(
        toNumber(latest.totalFreeEnrollmentValue || 0),
        toNumber(earliest.totalFreeEnrollmentValue || 0),
      ), latest.metricCurrency || reportingCurrency);
      rollup.totalPaidCompletionValue += await toReportingAmount(delta(
        toNumber(latest.totalPaidCompletionValue || 0),
        toNumber(earliest.totalPaidCompletionValue || 0),
      ), latest.metricCurrency || reportingCurrency);
      rollup.totalFreeCourseCompletionsValue += await toReportingAmount(delta(
        toNumber(latest.totalFreeCourseCompletionsValue || 0),
        toNumber(earliest.totalFreeCourseCompletionsValue || 0),
      ), latest.metricCurrency || reportingCurrency);
      rollup.totalFreeCourseEnrollments += delta(
        toNumber(latest.totalFreeCourseEnrollments || 0),
        toNumber(earliest.totalFreeCourseEnrollments || 0),
      );
      rollup.totalFreeCourseCompletions += delta(
        toNumber(latest.totalFreeCourseCompletions || 0),
        toNumber(earliest.totalFreeCourseCompletions || 0),
      );
      rollup.royaltyRevenue += await toReportingAmount(delta(
        toNumber(latest.royaltyRevenueTotal || 0),
        toNumber(earliest.royaltyRevenueTotal || 0),
      ), latest.metricCurrency || reportingCurrency);
    }

    const syncData = Array.from(customerRollupMap.values()).map((row) => ({
      ...row,
      monthlyRevenue: Number(row.monthlyRevenue.toFixed(4)),
      royaltyRevenue: Number(row.royaltyRevenue.toFixed(4)),
      totalPaidEnrollmentValue: Number(row.totalPaidEnrollmentValue.toFixed(4)),
      totalFreeEnrollmentValue: Number(row.totalFreeEnrollmentValue.toFixed(4)),
      totalPaidCompletionValue: Number(row.totalPaidCompletionValue.toFixed(4)),
      totalFreeCourseCompletionsValue: Number(row.totalFreeCourseCompletionsValue.toFixed(4)),
      commission: Number(row.royaltyRevenue.toFixed(4)),
      lastSyncedAt: row.latestReportedAt,
    }));

    res.json({
      filters: {
        enterpriseCustomerId: typeof enterpriseCustomerId === 'string' ? enterpriseCustomerId : null,
        startDate: typeof startDate === 'string' ? startDate : null,
        endDate: typeof endDate === 'string' ? endDate : null,
        systemType: typeof systemType === 'string' ? systemType : null,
        includeNonProduction: includeNonProd,
        reportingCurrency,
      },
      reportingCurrency,
      totalRevenue: Number(totalRevenue.toFixed(4)),
      totalLicenseRevenue: Number(totalLicenseRevenue.toFixed(4)),
      totalRoyaltyRevenue: Number(totalRoyaltyRevenue.toFixed(4)),
      totalCommissions: Number(totalRoyaltyRevenue.toFixed(4)),
      activeLicensesCount,
      syncData,
      conversionWarnings: Array.from(conversionWarnings),
      summary: {
        ...pointInTime,
        ...periodTotals,
      },
      telemetryRows,
    });
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error getting revenue data:', error);
    res.status(500).json({ error: 'Failed to get enterprise revenue data' });
  }
});

router.get('/customers/:id/systems', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const systems = await db
      .select()
      .from(enterpriseSystems)
      .where(eq(enterpriseSystems.enterpriseCustomerId, req.params.id))
      .orderBy(desc(enterpriseSystems.updatedAt));

    res.json(systems);
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error listing customer systems:', error);
    res.status(500).json({ error: 'Failed to list customer systems' });
  }
});

router.post('/customers/:id/systems/:systemId/sync-auth/rotate', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const customerId = String(req.params.id || '').trim();
    const systemId = String(req.params.systemId || '').trim();
    if (!customerId || !systemId) {
      return res.status(400).json({ error: 'customerId and systemId are required' });
    }
    const owns = await verifyEnterpriseSystemOwnership(systemId, customerId);
    if (!owns) {
      return res.status(404).json({ error: 'System not found for customer' });
    }
    const rotated = await ensureSystemSyncCredential(systemId, { forceRotate: true });
    return res.json({
      success: true,
      systemId,
      syncAuth: {
        mode: 'system',
        enterpriseSystemId: systemId,
        version: rotated.credential.version,
        issuedAt: rotated.credential.issuedAt,
        rotated: true,
      },
      message: 'Per-system sync credential rotated. New credential will be propagated on next successful check-in.',
    });
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error rotating system sync auth credential:', error);
    return res.status(500).json({ error: 'Failed to rotate system sync auth credential' });
  }
});

router.post('/customers/:id/systems/:systemId/sync-auth/revoke', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const customerId = String(req.params.id || '').trim();
    const systemId = String(req.params.systemId || '').trim();
    if (!customerId || !systemId) {
      return res.status(400).json({ error: 'customerId and systemId are required' });
    }
    const owns = await verifyEnterpriseSystemOwnership(systemId, customerId);
    if (!owns) {
      return res.status(404).json({ error: 'System not found for customer' });
    }
    const reason = String(req.body?.reason || 'revoked_by_superadmin').trim();
    await revokeSystemSyncCredential(systemId, reason);
    return res.json({
      success: true,
      systemId,
      revoked: true,
      message: 'Per-system sync credential revoked. System must re-bootstrap via shared secret path or manual re-linking.',
    });
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error revoking system sync auth credential:', error);
    return res.status(500).json({ error: 'Failed to revoke system sync auth credential' });
  }
});

router.post('/propagation/license-context/manual', isSuperAdmin, async (_req: Request, res: Response) => {
  try {
    if (resolveCloudRuntimeStage() !== 'prd') {
      return res.status(403).json({ error: 'Manual propagation is only available on cloud PRD.' });
    }

    const targets = mirrorTargetsForPrd();
    const mirrorKey = getMirrorKey();
    if (!isValidMirrorKeyConfig()) {
      return res.status(503).json({ error: 'ENTERPRISE_LICENSE_CONTEXT_MIRROR_KEY missing or too short.' });
    }
    const systems = await db.select().from(enterpriseSystems).orderBy(desc(enterpriseSystems.updatedAt));
    let attemptedSystems = 0;
    let mirroredSystems = 0;
    let skippedSystems = 0;
    const failures: Array<{ systemId: string; target: string; error: string }> = [];

    for (const system of systems) {
      const [customer] = await db
        .select()
        .from(enterpriseCustomers)
        .where(eq(enterpriseCustomers.id, system.enterpriseCustomerId))
        .limit(1);
      if (!customer) {
        skippedSystems += 1;
        continue;
      }

      const [requestById] = system.activeLicenseRequestId
        ? await db
            .select()
            .from(enterpriseLicenseRequests)
            .where(eq(enterpriseLicenseRequests.id, system.activeLicenseRequestId))
            .limit(1)
        : [];
      const [requestFallback] = !requestById
        ? await db
            .select()
            .from(enterpriseLicenseRequests)
            .where(and(
              eq(enterpriseLicenseRequests.enterpriseCustomerId, system.enterpriseCustomerId),
              eq(enterpriseLicenseRequests.systemType, system.systemType),
            ))
            .orderBy(desc(enterpriseLicenseRequests.updatedAt))
            .limit(1)
        : [];
      const request = requestById || requestFallback || null;

      const [keyById] = system.activeLicenseKeyId
        ? await db
            .select()
            .from(enterpriseLicenseKeys)
            .where(eq(enterpriseLicenseKeys.id, system.activeLicenseKeyId))
            .limit(1)
        : [];
      const [keyFallback] = !keyById && request?.id
        ? await db
            .select()
            .from(enterpriseLicenseKeys)
            .where(eq(enterpriseLicenseKeys.licenseRequestId, request.id))
            .orderBy(desc(enterpriseLicenseKeys.createdAt))
            .limit(1)
        : [];
      const licenseKey = keyById || keyFallback || null;

      const [profileConfig] = await db
        .select()
        .from(platformConfiguration)
        .where(eq(platformConfiguration.key, `ENTERPRISE_BUSINESS_PROFILE_${system.enterpriseCustomerId}`))
        .limit(1);
      const [royaltyConfig] = await db
        .select()
        .from(platformConfiguration)
        .where(eq(platformConfiguration.key, `ENTERPRISE_SYSTEM_ROYALTY_${system.id}`))
        .limit(1);

      attemptedSystems += 1;
      const payload = {
        customer,
        system,
        licenseRequest: request,
        licenseKey,
        businessProfileConfig: profileConfig || null,
        systemRoyaltyConfig: royaltyConfig || null,
      };

      let allTargetsOk = true;
      for (const target of targets) {
        try {
          const response = await fetch(`${target}/api/enterprise/public/internal/license-context-mirror`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-enterprise-license-context-mirror-key': mirrorKey,
            },
            body: JSON.stringify(payload),
          });
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            failures.push({
              systemId: system.id,
              target,
              error: String(body?.error || `HTTP ${response.status}`),
            });
            allTargetsOk = false;
          }
        } catch (error: any) {
          failures.push({
            systemId: system.id,
            target,
            error: error?.message || 'Network failure',
          });
          allTargetsOk = false;
        }
      }

      if (allTargetsOk) mirroredSystems += 1;
    }

    res.json({
      success: failures.length === 0,
      stage: resolveCloudRuntimeStage(),
      targets,
      attemptedSystems,
      mirroredSystems,
      skippedSystems,
      failures,
      mirroredAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Manual license-context propagation failed:', error);
    res.status(500).json({ error: 'Failed to run manual propagation' });
  }
});

router.patch('/customers/:id/systems/:systemId/license-policy', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id, systemId } = req.params;
    const graceDaysRaw = Number(req.body?.graceDays);
    const graceDays = Number.isFinite(graceDaysRaw) && graceDaysRaw >= 0 ? Math.min(Math.floor(graceDaysRaw), 30) : undefined;
    const allowedBillingStatuses = new Set(['due', 'paid', 'overdue', 'waived', 'suspended']);
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (typeof req.body?.autoApproveRenewals === 'boolean') updateData.autoApproveRenewals = req.body.autoApproveRenewals;
    if (graceDays !== undefined) updateData.graceDays = graceDays;
    if (typeof req.body?.billingStatus === 'string' && req.body.billingStatus.trim()) {
      const normalizedBillingStatus = req.body.billingStatus.trim().toLowerCase();
      if (!allowedBillingStatuses.has(normalizedBillingStatus)) {
        return res.status(400).json({ error: `billingStatus must be one of: ${Array.from(allowedBillingStatuses).join(', ')}` });
      }
      updateData.billingStatus = normalizedBillingStatus;
    }
    if (req.body?.monthlyFee !== undefined) {
      const parsedFee = parsePolicyMonthlyFee(req.body.monthlyFee);
      if (parsedFee === null) {
        return res.status(400).json({ error: 'monthlyFee must be a non-negative number and may use comma or period delimiter' });
      }
      updateData.monthlyFee = parsedFee;
    }
    if (req.body?.feeCurrency !== undefined) {
      if (!isSupportedCurrency(req.body.feeCurrency)) {
        return res.status(400).json({ error: 'feeCurrency must be EUR, USD, or ZAR' });
      }
      updateData.feeCurrency = normalizeSupportedCurrency(req.body.feeCurrency, 'USD');
    }
    let royaltyPercentage: number | undefined;
    if (req.body?.royaltyPercentage !== undefined) {
      const parsed = Number(String(req.body.royaltyPercentage).replace(',', '.'));
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        return res.status(400).json({ error: 'royaltyPercentage must be between 0 and 100' });
      }
      royaltyPercentage = Number(parsed.toFixed(2));
    }

    const [updated] = await db
      .update(enterpriseSystems)
      .set(updateData)
      .where(and(
        eq(enterpriseSystems.id, systemId),
        eq(enterpriseSystems.enterpriseCustomerId, id),
      ))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'System not found' });
    }

    if (updated.activeLicenseRequestId) {
      const reqUpdate: Record<string, any> = {
        updatedAt: new Date(),
      };
      if (updateData.autoApproveRenewals !== undefined) reqUpdate.autoApproveRenewals = updateData.autoApproveRenewals;
      if (updateData.graceDays !== undefined) reqUpdate.graceDays = updateData.graceDays;
      if (updateData.billingStatus !== undefined) reqUpdate.billingStatus = updateData.billingStatus;
      if (updateData.monthlyFee !== undefined) reqUpdate.monthlyFee = updateData.monthlyFee;
      if (updateData.feeCurrency !== undefined) reqUpdate.feeCurrency = updateData.feeCurrency;

      if (updateData.autoApproveRenewals === false) {
        reqUpdate.autoApproveDisabledAt = new Date();
        reqUpdate.autoApproveDisabledBy = req.session.userId!;
        reqUpdate.autoApproveDisableReason = req.body?.autoApproveDisableReason || 'Disabled by SuperAdmin';
      }

      if (updateData.autoApproveRenewals === true) {
        reqUpdate.autoApproveDisabledAt = null;
        reqUpdate.autoApproveDisabledBy = null;
        reqUpdate.autoApproveDisableReason = null;
      }

      await db
        .update(enterpriseLicenseRequests)
        .set(reqUpdate)
        .where(eq(enterpriseLicenseRequests.id, updated.activeLicenseRequestId));
    }

    if (royaltyPercentage !== undefined) {
      const key = systemRoyaltyConfigKey(updated.id);
      const [existingRoyalty] = await db
        .select({ id: platformConfiguration.id })
        .from(platformConfiguration)
        .where(eq(platformConfiguration.key, key))
        .limit(1);
      if (existingRoyalty) {
        await db
          .update(platformConfiguration)
          .set({
            value: String(royaltyPercentage.toFixed(2)),
            dataType: 'decimal',
            description: 'Royalty percentage configured per enterprise system',
            updatedAt: new Date(),
          })
          .where(eq(platformConfiguration.id, existingRoyalty.id));
      } else {
        await db
          .insert(platformConfiguration)
          .values({
            key,
            value: String(royaltyPercentage.toFixed(2)),
            dataType: 'decimal',
            description: 'Royalty percentage configured per enterprise system',
            isEditable: true,
            lastModifiedBy: req.session.userId || null,
          });
      }
    }

    res.json({
      success: true,
      system: {
        ...updated,
        royaltyPercentage: royaltyPercentage ?? undefined,
      },
    });
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error updating system license policy:', error);
    res.status(500).json({ error: 'Failed to update system license policy' });
  }
});

router.patch('/customers/:id/systems/:systemId/license-deactivate', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id, systemId } = req.params;
    const reason = String(req.body?.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ error: 'reason is required' });
    }
    const result = await deactivateSystemLicense({
      enterpriseCustomerId: id,
      systemId,
      reason,
      actorUserId: req.session.userId!,
    });
    res.json({ success: true, system: result.system, push: result.push });
  } catch (error: any) {
    console.error('[EnterpriseSuperAdmin] Error deactivating system license:', error);
    res.status(500).json({ error: error?.message || 'Failed to deactivate system license' });
  }
});

router.delete('/customers/:id/systems/:systemId/license', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id, systemId } = req.params;
    const reason = String(req.body?.reason || 'System license deleted by SuperAdmin').trim();

    const [system] = await db
      .select()
      .from(enterpriseSystems)
      .where(and(eq(enterpriseSystems.id, systemId), eq(enterpriseSystems.enterpriseCustomerId, id)))
      .limit(1);
    if (!system) {
      return res.status(404).json({ error: 'System not found' });
    }

    await revokeAllSystemLicenseKeys(system, reason);
    await retireActiveSystemLicenseRequest(system, reason, req.session.userId!);

    const [updatedSystem] = await db
      .update(enterpriseSystems)
      .set({
        activeLicenseRequestId: null,
        activeLicenseKeyId: null,
        licenseStatus: 'revoked',
        licenseExpiresAt: null,
        nextCheckInDueAt: null,
        status: 'archived',
        billingStatus: 'due',
        autoApproveRenewals: false,
        updatedAt: new Date(),
      })
      .where(eq(enterpriseSystems.id, system.id))
      .returning();

    await setSystemLicenseReason(updatedSystem.id, reason);

    const push = await dispatchOnpremLicensePush(updatedSystem, {
      action: 'deactivate',
      reason,
      source: 'cloud-superadmin',
      at: new Date().toISOString(),
    });

    res.json({ success: true, system: updatedSystem, push });
  } catch (error: any) {
    console.error('[EnterpriseSuperAdmin] Error deleting system license:', error);
    res.status(500).json({ error: error?.message || 'Failed to delete system license' });
  }
});

router.patch('/customers/:id/systems/:systemId/license-activate', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id, systemId } = req.params;
    const [system] = await db
      .select()
      .from(enterpriseSystems)
      .where(and(eq(enterpriseSystems.id, systemId), eq(enterpriseSystems.enterpriseCustomerId, id)))
      .limit(1);
    if (!system) {
      return res.status(404).json({ error: 'System not found' });
    }
    let requestId = system.activeLicenseRequestId || null;
    let request: any = null;
    if (requestId) {
      const [existingRequest] = await db
        .select()
        .from(enterpriseLicenseRequests)
        .where(eq(enterpriseLicenseRequests.id, requestId))
        .limit(1);
      request = existingRequest || null;
    }
    if (!request) {
      const siblings = await db
        .select()
        .from(enterpriseLicenseRequests)
        .where(and(
          eq(enterpriseLicenseRequests.enterpriseCustomerId, id),
          eq(enterpriseLicenseRequests.systemType, system.systemType),
          eq(enterpriseLicenseRequests.requestType, 'initial'),
        ))
        .orderBy(desc(enterpriseLicenseRequests.updatedAt), desc(enterpriseLicenseRequests.createdAt));

      const existingMatch = findLatestMatchingLicenseRequest(siblings, {
        hardwareKey: system.hardwareKey,
        hostname: system.internalHostname,
        serverBaseUrl: system.baseUrl,
        systemType: system.systemType,
        requestType: 'initial',
      });

      if (existingMatch) {
        request = existingMatch;
        requestId = existingMatch.id;
      } else {
        const [newRequest] = await db
          .insert(enterpriseLicenseRequests)
          .values({
            enterpriseCustomerId: id,
            requestData: JSON.stringify({
              generatedBy: 'system-license-activate',
              generatedAt: new Date().toISOString(),
            }),
            hardwareKey: system.hardwareKey,
            hostname: system.internalHostname,
            serverBaseUrl: system.baseUrl,
            systemType: system.systemType,
            status: 'approved',
            requestType: 'initial',
            monthlyFee: system.monthlyFee || '0.00',
            feeCurrency: system.feeCurrency || 'USD',
            autoApproveRenewals: system.autoApproveRenewals === true,
            graceDays: system.graceDays || 15,
            billingStatus: system.billingStatus || 'due',
            reviewedBy: req.session.userId!,
            reviewedAt: new Date(),
          })
          .returning();
        request = newRequest;
        requestId = newRequest.id;
      }
    }
    if (request.status !== 'approved') {
      await db
        .update(enterpriseLicenseRequests)
        .set({
          status: 'approved',
          reviewedBy: req.session.userId!,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(enterpriseLicenseRequests.id, request.id));
      request.status = 'approved';
    }

    const [customer] = await db
      .select()
      .from(enterpriseCustomers)
      .where(eq(enterpriseCustomers.id, id))
      .limit(1);
    if (!customer) {
      return res.status(404).json({ error: 'Enterprise customer not found' });
    }
    if (String(customer.status || '').toLowerCase() === 'suspended') {
      return res.status(409).json({ error: 'Cannot activate system license while customer is suspended' });
    }

    const now = new Date();
    const expiresAt = endOfCalendarMonth(now);
    const licenseId = `LIC-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const renewalSequence = 1;
    const graceDays = request.graceDays && request.graceDays > 0 ? request.graceDays : 15;
    const monthlyFee = parsePolicyMonthlyFee(request.monthlyFee || system.monthlyFee || '0') || '0.00';
    const feeCurrency = normalizeSupportedCurrency(request.feeCurrency || system.feeCurrency || 'USD', 'USD');

    const encryptedKeyData = signLicenseKey({
      licenseId,
      enterpriseCustomerId: id,
      hardwareKey: request.hardwareKey || system.hardwareKey || '',
      hostname: request.hostname || system.internalHostname || '',
      serverBaseUrl: request.serverBaseUrl || system.baseUrl || '',
      systemType: request.systemType as 'development' | 'qa' | 'production',
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      monthlyFee,
      feeCurrency,
      companyName: customer.companyName,
      renewalSequence,
      issuedReason: 'replacement',
      graceDays,
      autoApproveRenewals: request.autoApproveRenewals === true,
      nextRenewalDueAt: expiresAt.toISOString(),
      issuedBy: req.session.userId!,
    });

    const [licenseKey] = await db
      .insert(enterpriseLicenseKeys)
      .values({
        licenseId,
        licenseRequestId: request.id,
        enterpriseCustomerId: id,
        encryptedKeyData,
        systemType: request.systemType,
        issuedReason: 'replacement',
        renewalSequence,
        issuedAt: now,
        expiresAt,
        isRevoked: false,
      })
      .returning();

    await supersedePriorSystemLicenseKeys({
      licenseRequestId: request.id,
      activeLicenseKeyId: licenseKey.id,
    });

    const [updatedSystem] = await db
      .update(enterpriseSystems)
      .set({
        activeLicenseRequestId: request.id,
        activeLicenseKeyId: licenseKey.id,
        licenseStatus: 'active',
        status: 'active',
        licenseExpiresAt: expiresAt,
        nextCheckInDueAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(enterpriseSystems.id, system.id))
      .returning();

    await setSystemLicenseReason(updatedSystem.id, null);
    const push = await dispatchOnpremLicensePush(updatedSystem, {
      action: 'activate',
      licenseKeyData: encryptedKeyData,
      source: 'cloud-superadmin',
      at: new Date().toISOString(),
    });

    res.json({ success: true, system: updatedSystem, licenseKeyId: licenseKey.id, push });
  } catch (error: any) {
    console.error('[EnterpriseSuperAdmin] Error activating system license:', error);
    res.status(500).json({ error: error?.message || 'Failed to activate system license' });
  }
});

router.patch('/license-requests/:id/auto-renewal', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const autoApproveRenewals = req.body?.autoApproveRenewals === true;
    const graceDaysRaw = Number(req.body?.graceDays);
    const graceDays = Number.isFinite(graceDaysRaw) && graceDaysRaw >= 0 ? Math.min(Math.floor(graceDaysRaw), 30) : undefined;

    const updateData: Record<string, any> = {
      autoApproveRenewals,
      updatedAt: new Date(),
    };
    if (graceDays !== undefined) updateData.graceDays = graceDays;
    if (!autoApproveRenewals) {
      updateData.autoApproveDisabledAt = new Date();
      updateData.autoApproveDisabledBy = req.session.userId!;
      updateData.autoApproveDisableReason = req.body?.reason || 'Disabled by SuperAdmin';
    } else {
      updateData.autoApproveDisabledAt = null;
      updateData.autoApproveDisabledBy = null;
      updateData.autoApproveDisableReason = null;
    }

    const [updated] = await db
      .update(enterpriseLicenseRequests)
      .set(updateData)
      .where(eq(enterpriseLicenseRequests.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'License request not found' });
    }

    await db
      .update(enterpriseSystems)
      .set({
        autoApproveRenewals,
        ...(graceDays !== undefined ? { graceDays } : {}),
        updatedAt: new Date(),
      })
      .where(eq(enterpriseSystems.activeLicenseRequestId, updated.id));

    res.json({ success: true, licenseRequest: updated });
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error updating auto-renewal policy:', error);
    res.status(500).json({ error: 'Failed to update auto-renewal policy' });
  }
});

router.patch('/license-requests/:id/billing-status', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const billingStatus = String(req.body?.billingStatus || '').trim();
    if (!billingStatus) {
      return res.status(400).json({ error: 'billingStatus is required' });
    }

    const [updated] = await db
      .update(enterpriseLicenseRequests)
      .set({
        billingStatus,
        billingNotes: req.body?.billingNotes || null,
        updatedAt: new Date(),
      })
      .where(eq(enterpriseLicenseRequests.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'License request not found' });
    }

    await db
      .update(enterpriseSystems)
      .set({
        billingStatus,
        updatedAt: new Date(),
      })
      .where(eq(enterpriseSystems.activeLicenseRequestId, updated.id));

    res.json({ success: true, licenseRequest: updated });
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error updating billing status:', error);
    res.status(500).json({ error: 'Failed to update billing status' });
  }
});

router.post('/license-requests/:id/renew-now', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const [request] = await db
      .select()
      .from(enterpriseLicenseRequests)
      .where(eq(enterpriseLicenseRequests.id, req.params.id))
      .limit(1);

    if (!request) {
      return res.status(404).json({ error: 'License request not found' });
    }
    if (request.status !== 'approved') {
      return res.status(400).json({ error: 'Only approved license requests can be renewed' });
    }

    const [customer] = await db
      .select()
      .from(enterpriseCustomers)
      .where(eq(enterpriseCustomers.id, request.enterpriseCustomerId))
      .limit(1);
    if (!customer) {
      return res.status(404).json({ error: 'Associated enterprise customer not found' });
    }

    const [latestKey] = await db
      .select()
      .from(enterpriseLicenseKeys)
      .where(eq(enterpriseLicenseKeys.licenseRequestId, request.id))
      .orderBy(desc(enterpriseLicenseKeys.createdAt))
      .limit(1);

    const baseDate = latestKey?.expiresAt ? new Date(latestKey.expiresAt) : new Date();
    const now = new Date();
    const issuedAt = now;
    const renewalAnchor = baseDate > now ? baseDate : now;
    const expiresAt = baseDate > now
      ? endOfNextCalendarMonth(renewalAnchor)
      : endOfCalendarMonth(renewalAnchor);
    const renewalSequence = (latestKey?.renewalSequence || 1) + 1;
    const licenseId = `LIC-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const graceDays = request.graceDays && request.graceDays > 0 ? request.graceDays : 15;

    const encryptedKeyData = signLicenseKey({
      licenseId,
      enterpriseCustomerId: request.enterpriseCustomerId,
      hardwareKey: request.hardwareKey || '',
      hostname: request.hostname || '',
      serverBaseUrl: request.serverBaseUrl || '',
      systemType: request.systemType as 'development' | 'qa' | 'production',
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      monthlyFee: String(request.monthlyFee || '0'),
      feeCurrency: String(request.feeCurrency || 'USD'),
      companyName: customer.companyName,
      renewalSequence,
      issuedReason: 'renewal',
      graceDays,
      autoApproveRenewals: request.autoApproveRenewals === true,
      nextRenewalDueAt: expiresAt.toISOString(),
      issuedBy: req.session.userId!,
    });

    const [newKey] = await db
      .insert(enterpriseLicenseKeys)
      .values({
        licenseId,
        licenseRequestId: request.id,
        enterpriseCustomerId: request.enterpriseCustomerId,
        encryptedKeyData,
        systemType: request.systemType,
        issuedReason: 'renewal',
        renewalSequence,
        issuedAt,
        expiresAt,
      })
      .returning();

    await db
      .update(enterpriseLicenseRequests)
      .set({
        lastRenewedAt: issuedAt,
        nextRenewalDueAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(enterpriseLicenseRequests.id, request.id));

    await upsertEnterpriseSystemForLicense({
      enterpriseCustomerId: request.enterpriseCustomerId,
      systemType: request.systemType,
      hostname: request.hostname,
      serverBaseUrl: request.serverBaseUrl,
      hardwareKey: request.hardwareKey,
      licenseRequestId: request.id,
      licenseKeyId: newKey.id,
      expiresAt,
      monthlyFee: String(request.monthlyFee || '0'),
      feeCurrency: String(request.feeCurrency || 'USD'),
      autoApproveRenewals: request.autoApproveRenewals === true,
      graceDays,
      billingStatus: request.billingStatus || 'due',
    });

    res.json({ success: true, licenseKey: newKey });
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error renewing license request:', error);
    res.status(500).json({ error: 'Failed to renew license key' });
  }
});

router.get('/telemetry', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { enterpriseCustomerId, days } = req.query;
    const lookback = Math.max(1, Math.min(Number(days) || 30, 365));
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - lookback);

    const conditions: any[] = [gte(enterpriseSystemDailyTelemetry.reportedAt, fromDate)];
    if (typeof enterpriseCustomerId === 'string' && enterpriseCustomerId) {
      conditions.push(eq(enterpriseSystemDailyTelemetry.enterpriseCustomerId, enterpriseCustomerId));
    }

    const rows = await db
      .select({
        id: enterpriseSystemDailyTelemetry.id,
        enterpriseCustomerId: enterpriseSystemDailyTelemetry.enterpriseCustomerId,
        enterpriseSystemId: enterpriseSystemDailyTelemetry.enterpriseSystemId,
        systemType: enterpriseSystemDailyTelemetry.systemType,
        serverBaseUrl: enterpriseSystemDailyTelemetry.serverBaseUrl,
        hostname: enterpriseSystemDailyTelemetry.hostname,
        organizationId: enterpriseSystemDailyTelemetry.organizationId,
        organizationName: enterpriseSystemDailyTelemetry.organizationName,
        totalUsers: enterpriseSystemDailyTelemetry.totalUsers,
        totalOrgAdmins: enterpriseSystemDailyTelemetry.totalOrgAdmins,
        totalTrainers: enterpriseSystemDailyTelemetry.totalTrainers,
        totalLearners: enterpriseSystemDailyTelemetry.totalLearners,
        totalCustSupers: enterpriseSystemDailyTelemetry.totalCustSupers,
        totalSuperAdmins: enterpriseSystemDailyTelemetry.totalSuperAdmins,
        totalDemoOrganizations: enterpriseSystemDailyTelemetry.totalDemoOrganizations,
        totalDemoUsers: enterpriseSystemDailyTelemetry.totalDemoUsers,
        totalOrganizations: enterpriseSystemDailyTelemetry.totalOrganizations,
        totalCourses: enterpriseSystemDailyTelemetry.totalCourses,
        totalPublishedCourses: enterpriseSystemDailyTelemetry.totalPublishedCourses,
        totalDemoCourses: enterpriseSystemDailyTelemetry.totalDemoCourses,
        totalDemoPublishedCourses: enterpriseSystemDailyTelemetry.totalDemoPublishedCourses,
        totalEnrollments: enterpriseSystemDailyTelemetry.totalEnrollments,
        totalPublishedEnrollments: enterpriseSystemDailyTelemetry.totalPublishedEnrollments,
        totalDemoEnrollments: enterpriseSystemDailyTelemetry.totalDemoEnrollments,
        totalPaidCourseEnrollments: enterpriseSystemDailyTelemetry.totalPaidCourseEnrollments,
        totalFreeCourseEnrollments: enterpriseSystemDailyTelemetry.totalFreeCourseEnrollments,
        totalPaidEnrollmentValue: enterpriseSystemDailyTelemetry.totalPaidEnrollmentValue,
        totalDemoPaidEnrollmentValue: enterpriseSystemDailyTelemetry.totalDemoPaidEnrollmentValue,
        totalAssignments: enterpriseSystemDailyTelemetry.totalAssignments,
        totalPublishedAssignments: enterpriseSystemDailyTelemetry.totalPublishedAssignments,
        totalDemoCompletions: enterpriseSystemDailyTelemetry.totalDemoCompletions,
        totalPaidCourseCompletions: enterpriseSystemDailyTelemetry.totalPaidCourseCompletions,
        totalFreeCourseCompletions: enterpriseSystemDailyTelemetry.totalFreeCourseCompletions,
        totalPaidCompletionValue: enterpriseSystemDailyTelemetry.totalPaidCompletionValue,
        totalDemoPaidCompletionValue: enterpriseSystemDailyTelemetry.totalDemoPaidCompletionValue,
        activeUsers30Days: enterpriseSystemDailyTelemetry.activeUsers30Days,
        royaltyPercentageApplied: enterpriseSystemDailyTelemetry.royaltyPercentageApplied,
        royaltyRevenueEnrollments: enterpriseSystemDailyTelemetry.royaltyRevenueEnrollments,
        royaltyRevenueCompletions: enterpriseSystemDailyTelemetry.royaltyRevenueCompletions,
        royaltyRevenueTotal: enterpriseSystemDailyTelemetry.royaltyRevenueTotal,
        metricCurrency: enterpriseSystemDailyTelemetry.metricCurrency,
        metricsSchemaVersion: enterpriseSystemDailyTelemetry.metricsSchemaVersion,
        reportDate: enterpriseSystemDailyTelemetry.reportDate,
        reportedAt: enterpriseSystemDailyTelemetry.reportedAt,
        customerName: enterpriseCustomers.companyName,
      })
      .from(enterpriseSystemDailyTelemetry)
      .leftJoin(enterpriseCustomers, eq(enterpriseSystemDailyTelemetry.enterpriseCustomerId, enterpriseCustomers.id))
      .where(and(...conditions))
      .orderBy(desc(enterpriseSystemDailyTelemetry.reportedAt));

    res.json(rows);
  } catch (error) {
    console.error('[EnterpriseSuperAdmin] Error fetching telemetry:', error);
    res.status(500).json({ error: 'Failed to fetch telemetry' });
  }
});

export function registerEnterpriseSuperAdminRoutes(app: Express) {
  if (isOnPremMode()) {
    return;
  }
  app.use('/api/admin/enterprise', router);
}
