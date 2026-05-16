import { Router, Request, Response } from 'express';
import type { Express } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { eq, and, or, desc, sql, inArray } from 'drizzle-orm';
import crypto from 'crypto';
import path from 'path';

import { db } from '../db';
import {
  enterpriseCustomers,
  enterpriseDocuments,
  buildVersions,
  enterpriseLicenseRequests,
  enterpriseLicenseKeys,
  enterpriseAgreementTemplates,
  enterpriseSystems,
  enterpriseSystemDailyTelemetry,
  platformConfiguration,
} from '@shared/schema';
import { sortEnterpriseLicenseRecords } from '@shared/enterpriseLicenseOrdering';
import { requireEnterpriseAuth } from './enterpriseAuthRoutes';
import { decryptLicenseRequest, signLicenseKey, verifyAndDecodeLicenseKey } from '../services/licenseCryptoService';
import {
  getCourseTransferPublicKeyId,
  getCourseTransferPublicKeyPem,
  signCourseTransferAuthorization,
  unwrapCourseTransferDataKeyFromDescriptor,
  verifyCourseTransferAuthorization,
  type ProtectedTransferDescriptor,
} from '../services/courseTransferUtils';
import { ObjectStorageService } from '../objectStorage';
import { buildCanonicalStorageKey, normalizeExtension } from '../utils/storageKeyManager';
import { normalizeEnterpriseSystemLicenseStatus, shouldSystemRuntimeBeActive } from '../services/licenseStatusContract';
import {
  ensureSystemSyncCredential,
  getSystemSyncCredential,
  revokeSystemSyncCredential,
} from '../services/onpremSyncCredentialService';
import { findLatestMatchingPendingRequest } from '../services/licenseRequestDedupe';

const objectStorage = new ObjectStorageService();

function requireEnterpriseCustomerSelected(req: Request, res: Response, next: any) {
  if (!req.session.enterpriseCustomerId) {
    if (req.session?.user?.role === 'superadmin') {
      return res.status(400).json({ 
        error: 'Please select an enterprise customer first',
        code: 'CUSTOMER_SELECTION_REQUIRED',
        needsCustomerSelection: true 
      });
    }
    return res.status(401).json({ error: 'Enterprise authentication required' });
  }
  next();
}

const upload = multer({
  storage: multer.memoryStorage(),
});

function stripPasswordHash(customer: any) {
  const { passwordHash, ...rest } = customer;
  return rest;
}

function endOfCalendarMonth(base: Date): Date {
  return new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59, 999);
}

function endOfNextCalendarMonth(base: Date): Date {
  return new Date(base.getFullYear(), base.getMonth() + 2, 0, 23, 59, 59, 999);
}

function normalizeBusinessProfile(input: any) {
  if (!input || typeof input !== 'object') return null;
  return {
    businessName: String(input.businessName || '').trim(),
    businessRegistrationNumber: String(input.businessRegistrationNumber || '').trim(),
    businessAddress: String(input.businessAddress || '').trim(),
    billingContactName: String(input.billingContactName || '').trim(),
    billingContactEmail: String(input.billingContactEmail || '').trim().toLowerCase(),
    billingContactPhone: String(input.billingContactPhone || '').trim(),
    countryCode: String(input.countryCode || '').trim(),
    vatNumber: String(input.vatNumber || '').trim(),
    notes: String(input.notes || '').trim(),
  };
}

function normalizeIdentityValue(input: unknown): string {
  return String(input || '').trim().toLowerCase();
}

function normalizeOnpremSystemType(input: unknown): 'development' | 'qa' | 'production' | null {
  const normalized = String(input || '').trim().toLowerCase();
  if (normalized === 'development' || normalized === 'dev' || normalized === 'onprem') return 'development';
  if (normalized === 'qa' || normalized === 'acc' || normalized === 'test' || normalized === 'testing') return 'qa';
  if (normalized === 'production' || normalized === 'prod' || normalized === 'prd') return 'production';
  return null;
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

function cloudMirrorTargetsForPrd(): string[] {
  return ['https://acccl.learnplay.co.za', 'https://stcloud.learnplay.co.za'];
}

function getLicenseContextMirrorKey(): string {
  const fromEnv = String(process.env.ENTERPRISE_LICENSE_CONTEXT_MIRROR_KEY || '').trim();
  return fromEnv;
}

function isValidMirrorKeyConfig(): boolean {
  return getLicenseContextMirrorKey().length >= 32;
}

function constantTimeMirrorKeyMatch(expected: string, provided: string): boolean {
  const expectedBuf = Buffer.from(expected, 'utf-8');
  const providedBuf = Buffer.from(provided, 'utf-8');
  return expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf);
}

async function mirrorLicenseContextToLowerCloudsNonBlocking(payload: any) {
  if (resolveCloudRuntimeStage() !== 'prd') return;
  const key = getLicenseContextMirrorKey();
  if (!isValidMirrorKeyConfig()) {
    console.warn('[EnterprisePortal] ENTERPRISE_LICENSE_CONTEXT_MIRROR_KEY missing or too short; skipping lower-cloud mirror.');
    return;
  }
  await Promise.all(
    cloudMirrorTargetsForPrd().map(async (baseUrl) => {
      try {
        const response = await fetch(`${baseUrl}/api/enterprise/public/internal/license-context-mirror`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-enterprise-license-context-mirror-key': key,
          },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          console.warn(`[EnterprisePortal] License context mirror to ${baseUrl} failed (${response.status}): ${String(body?.error || 'unknown error')}`);
        }
      } catch (error) {
        console.warn(`[EnterprisePortal] License context mirror to ${baseUrl} unreachable; retry on next check-in.`, error);
      }
    }),
  );
}

function normalizeBillingStatus(input: unknown): 'due' | 'paid' | 'overdue' | 'waived' | 'unknown' {
  const status = String(input || '').trim().toLowerCase();
  if (status === 'due' || status === 'paid' || status === 'overdue' || status === 'waived') {
    return status;
  }
  return 'unknown';
}

function policyAllowsAutomaticIssuance(params: {
  autoApproveRenewals: boolean;
  billingStatus: unknown;
}): boolean {
  if (params.autoApproveRenewals !== true) return false;
  const billingStatus = normalizeBillingStatus(params.billingStatus);
  return billingStatus === 'paid' || billingStatus === 'waived';
}

function systemTypePriority(systemType: string): number {
  if (systemType === 'production') return 3;
  if (systemType === 'qa') return 2;
  if (systemType === 'development') return 1;
  return 0;
}

function extractHostname(input: string | null | undefined): string | null {
  const raw = String(input || '').trim();
  if (!raw) return null;
  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withProtocol);
    return String(u.hostname || '').trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

function canonicalBaseDomainKey(input: string | null | undefined): string | null {
  const host = extractHostname(input);
  if (!host) return null;
  const parts = host.split('.').filter(Boolean);
  if (parts.length < 2) return host;
  const suffix2 = parts.slice(-2).join('.');
  const useThirdLevel = new Set(['co.za', 'org.za', 'net.za', 'gov.za', 'ac.za']);
  if (parts.length >= 3 && useThirdLevel.has(suffix2)) {
    return parts.slice(-3).join('.');
  }
  return suffix2;
}

function normalizeBaseUrl(input: string | null | undefined): string | null {
  const raw = String(input || '').trim();
  if (!raw) return null;
  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withProtocol);
    const protocol = String(u.protocol || '').toLowerCase();
    const host = String(u.hostname || '').toLowerCase();
    if (!protocol || !host) return raw.replace(/\/+$/, '').toLowerCase();
    const port = u.port ? `:${u.port}` : '';
    const path = String(u.pathname || '').replace(/\/+$/, '');
    return `${protocol}//${host}${port}${path}`;
  } catch {
    return raw.replace(/\/+$/, '').toLowerCase();
  }
}

type NormalizedBusinessProfile = NonNullable<ReturnType<typeof normalizeBusinessProfile>>;

const requiredBusinessProfileFields: Array<{ key: keyof NormalizedBusinessProfile; label: string }> = [
  { key: 'businessName', label: 'Business Name' },
  { key: 'businessRegistrationNumber', label: 'Business Registration Number' },
  { key: 'businessAddress', label: 'Business Address' },
  { key: 'billingContactName', label: 'Main Contact Person' },
  { key: 'billingContactEmail', label: 'Main Contact Email' },
  { key: 'billingContactPhone', label: 'Main Contact Phone' },
  { key: 'countryCode', label: 'Country Code' },
  { key: 'vatNumber', label: 'VAT Number' },
];

function evaluateBusinessProfileCompleteness(profile: ReturnType<typeof normalizeBusinessProfile>) {
  const missingFields = requiredBusinessProfileFields
    .filter(({ key }) => !String(profile?.[key] || '').trim())
    .map(({ label }) => label);
  return {
    isComplete: missingFields.length === 0,
    missingFields,
  };
}

function profileConfigKey(enterpriseCustomerId: string): string {
  return `ENTERPRISE_BUSINESS_PROFILE_${enterpriseCustomerId}`;
}

function observedLicenseStatusConfigKey(enterpriseSystemId: string): string {
  return `ENTERPRISE_SYSTEM_OBSERVED_LICENSE_STATUS_${enterpriseSystemId}`;
}

async function upsertObservedSystemLicenseStatus(params: {
  enterpriseSystemId: string;
  status: string;
  reason: string | null;
  source: string;
  hardwareKey?: string | null;
  hostname?: string | null;
  serverBaseUrl?: string | null;
  licenseKeyHash?: string | null;
}) {
  const now = new Date();
  const key = observedLicenseStatusConfigKey(params.enterpriseSystemId);
  const payload = JSON.stringify({
    status: params.status,
    reason: params.reason,
    source: params.source,
    hardwareKey: params.hardwareKey || null,
    hostname: params.hostname || null,
    serverBaseUrl: params.serverBaseUrl || null,
    licenseKeyHash: params.licenseKeyHash || null,
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
      .set({ value: payload, updatedAt: now })
      .where(eq(platformConfiguration.id, existing.id));
    return;
  }

  await db.insert(platformConfiguration).values({
    key,
    value: payload,
    dataType: 'json',
    description: 'Latest observed on-prem runtime license status report',
    isEditable: false,
    updatedAt: now,
  });
}

function buildOnpremSyntheticEmail(seedInput: string): string {
  const seed = crypto.createHash('sha1').update(seedInput).digest('hex').slice(0, 24);
  return `onprem-${seed}@enterprise.learnplay.local`;
}

function parseSystemRoyalty(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(100, parsed));
}

function parseStoredBusinessProfile(value: string | null | undefined): any | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeCourseTransferIdentityValue(input: unknown): string {
  return String(input || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildCourseTransferOrganizationIdentity(profile: any, fallbackName: unknown) {
  const businessName = String(profile?.businessName || fallbackName || '').trim();
  const businessRegistrationNumber = String(profile?.businessRegistrationNumber || '').trim();
  const identityHash = crypto
    .createHash('sha256')
    .update([
      normalizeCourseTransferIdentityValue(businessName),
      normalizeCourseTransferIdentityValue(businessRegistrationNumber),
    ].join('|'))
    .digest('hex');
  return {
    businessName,
    businessRegistrationNumber,
    identityHash,
  };
}

function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const dt = new Date(String(value));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

async function ingestOnpremTelemetryRows(params: {
  enterpriseCustomerId: string;
  trackedSystemId: string;
  requestSystemType: 'development' | 'qa' | 'production';
  trackedServerBaseUrl: string | null;
  trackedHostname: string | null;
  customerRoyaltyPercentage: unknown;
  systemRoyaltyConfigValue: string | null | undefined;
  payloadFeeCurrency: string | null | undefined;
  telemetryRows: any[];
  now: Date;
}) {
  const telemetryRows = Array.isArray(params.telemetryRows) ? params.telemetryRows : [];
  const todayReportDate = params.now.toISOString().slice(0, 10);

  // Always advance last telemetry heartbeat, even when a system currently has zero organizations.
  await db
    .update(enterpriseSystems)
    .set({
      lastTelemetryAt: params.now,
      updatedAt: params.now,
    })
    .where(eq(enterpriseSystems.id, params.trackedSystemId));

  if (telemetryRows.length === 0) {
    // Remove same-day rows so a delete-all + check-in reflects zero org metrics immediately.
    await db.execute(sql`
      delete from "enterpriseSystemDailyTelemetry"
      where "enterpriseCustomerId" = ${params.enterpriseCustomerId}
        and "enterpriseSystemId" = ${params.trackedSystemId}
        and "reportDate" = ${todayReportDate}
    `);
    return 0;
  }

  const royaltyPercentage = parseSystemRoyalty(params.systemRoyaltyConfigValue) ?? Number(params.customerRoyaltyPercentage || 0);
  const royaltyFactor = Math.max(0, Math.min(100, royaltyPercentage)) / 100;
  const isRoyaltyTrack = params.requestSystemType === 'production';
  let telemetryRowsProcessed = 0;
  const incomingOrgIdsByDate = new Map<string, Set<string>>();

  for (const row of telemetryRows) {
    const reportDate = typeof row?.reportDate === 'string' && row.reportDate ? row.reportDate : todayReportDate;
    const orgId = String(row?.organizationId || '').trim() || null;
    if (orgId) {
      const existing = incomingOrgIdsByDate.get(reportDate) || new Set<string>();
      existing.add(orgId);
      incomingOrgIdsByDate.set(reportDate, existing);
    }
    const totalPaidEnrollmentValue = Number(row?.totalPaidEnrollmentValue || 0);
    const totalPaidCompletionValue = Number(row?.totalPaidCompletionValue || 0);
    const royaltyRevenueEnrollments = isRoyaltyTrack ? totalPaidEnrollmentValue * royaltyFactor : 0;
    const royaltyRevenueCompletions = isRoyaltyTrack ? totalPaidCompletionValue * royaltyFactor : 0;
    const royaltyRevenueTotal = royaltyRevenueEnrollments + royaltyRevenueCompletions;
    const values = {
      enterpriseCustomerId: params.enterpriseCustomerId,
      enterpriseSystemId: params.trackedSystemId,
      systemType: params.requestSystemType,
      serverBaseUrl: params.trackedServerBaseUrl,
      hostname: params.trackedHostname,
      organizationId: orgId,
      organizationName: row?.organizationName || null,
      totalUsers: Number(row?.totalUsers || 0),
      totalOrgAdmins: Number(row?.totalOrgAdmins || 0),
      totalTrainers: Number(row?.totalTrainers || 0),
      totalLearners: Number(row?.totalLearners || 0),
      totalCustSupers: Number(row?.totalCustSupers || 0),
      totalSuperAdmins: Number(row?.totalSuperAdmins || 0),
      totalDemoOrganizations: Number(row?.totalDemoOrganizations || 0),
      totalDemoUsers: Number(row?.totalDemoUsers || 0),
      totalOrganizations: Number(row?.totalOrganizations || 0),
      totalCourses: Number(row?.totalCourses || 0),
      totalPublishedCourses: Number(row?.totalPublishedCourses || 0),
      totalDemoCourses: Number(row?.totalDemoCourses || 0),
      totalDemoPublishedCourses: Number(row?.totalDemoPublishedCourses || 0),
      totalEnrollments: Number(row?.totalEnrollments || 0),
      totalPublishedEnrollments: Number(row?.totalPublishedEnrollments || 0),
      totalDemoEnrollments: Number(row?.totalDemoEnrollments || 0),
      totalPaidCourseEnrollments: Number(row?.totalPaidCourseEnrollments || 0),
      totalFreeCourseEnrollments: Number(row?.totalFreeCourseEnrollments || 0),
      totalDemoCompletions: Number(row?.totalDemoCompletions || 0),
      totalPaidEnrollmentValue: totalPaidEnrollmentValue.toFixed(4),
      totalDemoPaidEnrollmentValue: Number(row?.totalDemoPaidEnrollmentValue || 0).toFixed(4),
      totalFreeEnrollmentValue: Number(row?.totalFreeEnrollmentValue || 0).toFixed(4),
      totalAssignments: Number(row?.totalAssignments || 0),
      totalPublishedAssignments: Number(row?.totalPublishedAssignments || 0),
      totalPaidCourseCompletions: Number(row?.totalPaidCourseCompletions || 0),
      totalFreeCourseCompletions: Number(row?.totalFreeCourseCompletions || 0),
      totalPaidCompletionValue: totalPaidCompletionValue.toFixed(4),
      totalDemoPaidCompletionValue: Number(row?.totalDemoPaidCompletionValue || 0).toFixed(4),
      totalFreeCourseCompletionsValue: Number(row?.totalFreeCourseCompletionsValue || 0).toFixed(4),
      activeUsers30Days: Number(row?.activeUsers30Days || 0),
      royaltyPercentageApplied: Math.max(0, Math.min(100, royaltyPercentage)).toFixed(2),
      royaltyRevenueEnrollments: royaltyRevenueEnrollments.toFixed(4),
      royaltyRevenueCompletions: royaltyRevenueCompletions.toFixed(4),
      royaltyRevenueTotal: royaltyRevenueTotal.toFixed(4),
      metricCurrency: String(row?.metricCurrency || params.payloadFeeCurrency || 'USD'),
      metricsSchemaVersion: Number(row?.metricsSchemaVersion || 1),
      reportDate,
      reportedAt: params.now,
    };

    await db
      .insert(enterpriseSystemDailyTelemetry)
      .values(values as any)
      .onConflictDoUpdate({
        target: [
          enterpriseSystemDailyTelemetry.enterpriseCustomerId,
          enterpriseSystemDailyTelemetry.enterpriseSystemId,
          enterpriseSystemDailyTelemetry.organizationId,
          enterpriseSystemDailyTelemetry.reportDate,
        ],
        set: {
          totalUsers: values.totalUsers,
          totalOrgAdmins: values.totalOrgAdmins,
          totalTrainers: values.totalTrainers,
          totalLearners: values.totalLearners,
          totalCustSupers: values.totalCustSupers,
          totalSuperAdmins: values.totalSuperAdmins,
          totalDemoOrganizations: values.totalDemoOrganizations,
          totalDemoUsers: values.totalDemoUsers,
          totalOrganizations: values.totalOrganizations,
          totalCourses: values.totalCourses,
          totalPublishedCourses: values.totalPublishedCourses,
          totalDemoCourses: values.totalDemoCourses,
          totalDemoPublishedCourses: values.totalDemoPublishedCourses,
          totalEnrollments: values.totalEnrollments,
          totalPublishedEnrollments: values.totalPublishedEnrollments,
          totalDemoEnrollments: values.totalDemoEnrollments,
          totalPaidCourseEnrollments: values.totalPaidCourseEnrollments,
          totalFreeCourseEnrollments: values.totalFreeCourseEnrollments,
          totalDemoCompletions: values.totalDemoCompletions,
          totalPaidEnrollmentValue: values.totalPaidEnrollmentValue,
          totalDemoPaidEnrollmentValue: values.totalDemoPaidEnrollmentValue,
          totalFreeEnrollmentValue: values.totalFreeEnrollmentValue,
          totalAssignments: values.totalAssignments,
          totalPublishedAssignments: values.totalPublishedAssignments,
          totalPaidCourseCompletions: values.totalPaidCourseCompletions,
          totalFreeCourseCompletions: values.totalFreeCourseCompletions,
          totalPaidCompletionValue: values.totalPaidCompletionValue,
          totalDemoPaidCompletionValue: values.totalDemoPaidCompletionValue,
          totalFreeCourseCompletionsValue: values.totalFreeCourseCompletionsValue,
          activeUsers30Days: values.activeUsers30Days,
          royaltyPercentageApplied: values.royaltyPercentageApplied,
          royaltyRevenueEnrollments: values.royaltyRevenueEnrollments,
          royaltyRevenueCompletions: values.royaltyRevenueCompletions,
          royaltyRevenueTotal: values.royaltyRevenueTotal,
          metricCurrency: values.metricCurrency,
          metricsSchemaVersion: values.metricsSchemaVersion,
          reportedAt: params.now,
        },
      });
    telemetryRowsProcessed += 1;
  }

  // Prune stale same-day organizations that were removed on onprem before this check-in.
  for (const [reportDate, orgIdsSet] of incomingOrgIdsByDate.entries()) {
    const orgIds = Array.from(orgIdsSet);
    if (orgIds.length > 0) {
      await db.execute(sql`
        delete from "enterpriseSystemDailyTelemetry"
        where "enterpriseCustomerId" = ${params.enterpriseCustomerId}
          and "enterpriseSystemId" = ${params.trackedSystemId}
          and "reportDate" = ${reportDate}
          and "organizationId" is not null
          and "organizationId" not in (${sql.join(orgIds.map((id) => sql`${id}`), sql`,`)})
      `);
    } else {
      await db.execute(sql`
        delete from "enterpriseSystemDailyTelemetry"
        where "enterpriseCustomerId" = ${params.enterpriseCustomerId}
          and "enterpriseSystemId" = ${params.trackedSystemId}
          and "reportDate" = ${reportDate}
      `);
    }
  }

  return telemetryRowsProcessed;
}

function splitContactMobile(value: string | null | undefined): { countryCode: string; billingContactPhone: string } {
  const raw = String(value || '').trim();
  if (!raw) return { countryCode: '', billingContactPhone: '' };
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { countryCode: '', billingContactPhone: raw };
  }
  return {
    countryCode: parts[0],
    billingContactPhone: parts.slice(1).join(' '),
  };
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

type DeletedCustomerRecoverySystemPolicy = {
  id: string;
  systemType: 'development' | 'qa' | 'production' | null;
  hardwareKey: string | null;
  internalHostname: string | null;
  baseUrl: string | null;
  autoApproveRenewals: boolean;
  graceDays: number;
  monthlyFee: string | null;
  feeCurrency: string | null;
  billingStatus: string;
};

type DeletedCustomerRecoveryPolicy = {
  deletedCustomerId: string;
  deletedAt: string | null;
  deletedBy: string | null;
  recoverable: boolean;
  systems: DeletedCustomerRecoverySystemPolicy[];
  recoveredAt?: string | null;
  recoveredCustomerId?: string | null;
  recoveredSystemId?: string | null;
};

function parseDeletedCustomerRecoveryPolicy(value: string | null | undefined): DeletedCustomerRecoveryPolicy | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    const rawSystems = Array.isArray((parsed as any).systems) ? (parsed as any).systems : [];
    const systems: DeletedCustomerRecoverySystemPolicy[] = rawSystems.map((row: any) => ({
      id: String(row?.id || '').trim(),
      systemType: normalizeOnpremSystemType(row?.systemType),
      hardwareKey: String(row?.hardwareKey || '').trim() || null,
      internalHostname: String(row?.internalHostname || '').trim() || null,
      baseUrl: String(row?.baseUrl || '').trim() || null,
      autoApproveRenewals: row?.autoApproveRenewals === true,
      graceDays: Number.isFinite(Number(row?.graceDays)) ? Math.max(0, Number(row.graceDays)) : 15,
      monthlyFee: row?.monthlyFee != null ? String(row.monthlyFee) : null,
      feeCurrency: row?.feeCurrency != null ? String(row.feeCurrency).toUpperCase() : null,
      billingStatus: normalizeBillingStatus(row?.billingStatus),
    })).filter((row: DeletedCustomerRecoverySystemPolicy) => !!row.id);

    return {
      deletedCustomerId: String((parsed as any).deletedCustomerId || '').trim(),
      deletedAt: String((parsed as any).deletedAt || '').trim() || null,
      deletedBy: String((parsed as any).deletedBy || '').trim() || null,
      recoverable: (parsed as any).recoverable !== false,
      systems,
      recoveredAt: String((parsed as any).recoveredAt || '').trim() || null,
      recoveredCustomerId: String((parsed as any).recoveredCustomerId || '').trim() || null,
      recoveredSystemId: String((parsed as any).recoveredSystemId || '').trim() || null,
    };
  } catch {
    return null;
  }
}

function selectRecoverySystemPolicy(params: {
  policy: DeletedCustomerRecoveryPolicy | null;
  systemType: 'development' | 'qa' | 'production' | null;
  hardwareKey: string | null;
  hostname: string | null;
  serverBaseUrl: string | null;
}): DeletedCustomerRecoverySystemPolicy | null {
  if (!params.policy || params.policy.recoverable === false) return null;
  const systems = params.policy.systems || [];
  if (systems.length === 0) return null;

  const normalizedHardware = normalizeIdentityValue(params.hardwareKey);
  const normalizedHostname = normalizeIdentityValue(params.hostname);
  const normalizedBaseUrl = normalizeIdentityValue(normalizeBaseUrl(params.serverBaseUrl));

  const byIdentity = systems.find((system) => {
    if (params.systemType && system.systemType && system.systemType !== params.systemType) return false;
    if (normalizedHardware && normalizeIdentityValue(system.hardwareKey) === normalizedHardware) return true;
    if (normalizedHostname && normalizeIdentityValue(system.internalHostname) === normalizedHostname) return true;
    if (normalizedBaseUrl && normalizeIdentityValue(normalizeBaseUrl(system.baseUrl)) === normalizedBaseUrl) return true;
    return false;
  });
  if (byIdentity) return byIdentity;

  if (params.systemType) {
    const byType = systems.find((system) => system.systemType === params.systemType);
    if (byType) return byType;
  }
  return systems[0] || null;
}

function parseRevocationTombstone(value: string | null | undefined): { reason: string | null } {
  if (!value) return { reason: null };
  try {
    const parsed = JSON.parse(value);
    return {
      reason: parsed?.reason ? String(parsed.reason) : null,
    };
  } catch {
    return { reason: null };
  }
}

function normalizeSystemLicenseStatus(input: unknown): string {
  return normalizeEnterpriseSystemLicenseStatus(input, 'inactive');
}

function getOnpremCloudSyncSharedSecret(): string {
  // Cloud PRD is the single verification authority for all on-prem check-ins.
  // Accept only PRD-scoped shared secrets to avoid stage drift.
  return String(process.env.ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD || '').trim();
}

function getOnpremCloudSyncSharedSecretCandidates(): string[] {
  const primary = getOnpremCloudSyncSharedSecret();
  const prdPrevious = String(process.env.ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD_PREVIOUS || '').trim();
  const prdFallbacks = String(process.env.ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD_FALLBACKS || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return Array.from(new Set([primary, prdPrevious, ...prdFallbacks].filter(Boolean)));
}

async function markOnpremRequestNonce(nonce: string, tsMs: number): Promise<boolean> {
  const nonceHash = crypto.createHash('sha256').update(nonce).digest('hex');
  const key = `ONPREM_REQUEST_NONCE_${nonceHash}`;
  try {
    await db.insert(platformConfiguration).values({
      key,
      value: JSON.stringify({ tsMs, seenAt: new Date().toISOString() }),
      dataType: 'json',
      description: 'Replay-protection nonce registry for onprem public API calls',
      isEditable: false,
    });
    return true;
  } catch {
    return false;
  }
}

type OnpremSyncRequestVerification =
  | { ok: true; authMode: 'system' | 'shared'; enterpriseSystemId: string | null; credentialProvisioned: boolean }
  | { ok: false; status: number; error: string };

type OnpremSystemIdentity = {
  enterpriseCustomerId?: unknown;
  systemType?: unknown;
  hardwareKey?: unknown;
  hostname?: unknown;
  serverBaseUrl?: unknown;
};

function resolveRequestedSystemId(req: Request): string | null {
  const fromHeader = String(req.headers['x-lp-onprem-system-id'] || '').trim();
  if (fromHeader) return fromHeader;
  const fromBody = String((req.body as any)?.enterpriseSystemId || '').trim();
  return fromBody || null;
}

async function findActiveSystemByOnpremIdentity(input: OnpremSystemIdentity): Promise<any | null> {
  const enterpriseCustomerId = String(input.enterpriseCustomerId || '').trim();
  const systemType = normalizeOnpremSystemType(input.systemType);
  const hardwareKey = normalizeIdentityValue(input.hardwareKey);
  const hostname = normalizeIdentityValue(input.hostname);
  const serverBaseUrl = normalizeIdentityValue(input.serverBaseUrl);

  if (!enterpriseCustomerId || !systemType || (!hardwareKey && !hostname && !serverBaseUrl)) {
    return null;
  }

  const candidates = await db
    .select()
    .from(enterpriseSystems)
    .where(and(
      eq(enterpriseSystems.enterpriseCustomerId, enterpriseCustomerId),
      eq(enterpriseSystems.systemType, systemType),
    ))
    .orderBy(desc(enterpriseSystems.updatedAt));

  return candidates.find((system) => {
    if (String(system.status || '').toLowerCase() === 'archived') return false;
    if (hardwareKey && normalizeIdentityValue(system.hardwareKey) === hardwareKey) return true;
    if (hostname && normalizeIdentityValue(system.internalHostname) === hostname) return true;
    if (serverBaseUrl && normalizeIdentityValue(system.baseUrl) === serverBaseUrl) return true;
    return false;
  }) || null;
}

function verifyRequestSignatureWithSecret(params: {
  secret: string;
  req: Request;
  tsMs: number;
  nonce: string;
  signature: string;
}): boolean {
  const bodyRaw = JSON.stringify(params.req.body || {});
  const expected = crypto
    .createHmac('sha256', params.secret)
    .update(`${params.tsMs}.${params.nonce}.${bodyRaw}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf-8');
  const providedBuf = Buffer.from(params.signature, 'utf-8');
  return expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf);
}

async function verifySignedOnpremPublicRequest(req: Request): Promise<OnpremSyncRequestVerification> {
  const sharedSecrets = getOnpremCloudSyncSharedSecretCandidates();

  const tsRaw = String(req.headers['x-lp-onprem-ts'] || '').trim();
  const nonce = String(req.headers['x-lp-onprem-nonce'] || '').trim();
  const signature = String(req.headers['x-lp-onprem-signature'] || '').trim();
  const requestedAuthMode = String(req.headers['x-lp-onprem-auth-mode'] || '').trim().toLowerCase();
  const requestedSystemId = resolveRequestedSystemId(req);

  if (!tsRaw || !nonce || !signature) {
    return { ok: false, status: 401, error: 'Missing onprem request signature headers' };
  }

  const tsMs = Number(tsRaw);
  if (!Number.isFinite(tsMs)) {
    return { ok: false, status: 401, error: 'Invalid onprem request timestamp' };
  }
  const nowMs = Date.now();
  const maxSkewMs = 5 * 60 * 1000;
  if (Math.abs(nowMs - tsMs) > maxSkewMs) {
    return { ok: false, status: 401, error: 'Onprem request timestamp outside allowed window' };
  }

  if (!/^[a-f0-9]{16,128}$/i.test(nonce)) {
    return { ok: false, status: 401, error: 'Invalid onprem request nonce' };
  }

  const authModeHeader = requestedAuthMode === 'system' || requestedAuthMode === 'shared'
    ? requestedAuthMode
    : null;

  let usedAuthMode: 'system' | 'shared' | null = null;
  let resolvedEnterpriseSystemId = requestedSystemId;
  let credentialProvisioned = false;
  const verifySystemCredential = (systemCredential: NonNullable<Awaited<ReturnType<typeof getSystemSyncCredential>>>) => verifyRequestSignatureWithSecret({
    secret: systemCredential.secret,
    req,
    tsMs,
    nonce,
    signature,
  });
  const recoverSystemModeByIdentity = async (): Promise<boolean> => {
    const matchedSystem = await findActiveSystemByOnpremIdentity({
      enterpriseCustomerId: (req.body as any)?.enterpriseCustomerId,
      systemType: (req.body as any)?.systemType,
      hardwareKey: (req.body as any)?.hardwareKey,
      hostname: (req.body as any)?.hostname,
      serverBaseUrl: (req.body as any)?.serverBaseUrl,
    });
    if (!matchedSystem?.id || matchedSystem.id === requestedSystemId) return false;

    const matchedCredential = await getSystemSyncCredential(matchedSystem.id);
    if (!matchedCredential || matchedCredential.revokedAt) return false;
    if (!verifySystemCredential(matchedCredential)) return false;

    usedAuthMode = 'system';
    resolvedEnterpriseSystemId = matchedSystem.id;
    credentialProvisioned = true;
    return true;
  };
  const verifySystemMode = async (): Promise<OnpremSyncRequestVerification | null> => {
    if (!requestedSystemId) {
      return { ok: false, status: 401, error: 'Missing enterpriseSystemId for per-system onprem auth mode' };
    }
    const systemCredential = await getSystemSyncCredential(requestedSystemId);
    if (!systemCredential || systemCredential.revokedAt) {
      return { ok: false, status: 403, error: 'Per-system credential is missing or revoked for this enterpriseSystemId' };
    }
    const validSystemSignature = verifySystemCredential(systemCredential);
    if (!validSystemSignature) {
      if (await recoverSystemModeByIdentity()) return null;
      return { ok: false, status: 403, error: 'Invalid per-system onprem request signature' };
    }
    usedAuthMode = 'system';
    resolvedEnterpriseSystemId = requestedSystemId;
    return null;
  };

  const verifySharedMode = async (): Promise<OnpremSyncRequestVerification | null> => {
    if (sharedSecrets.length === 0) {
      return { ok: false, status: 503, error: 'Cloud bootstrap onprem sync secret is not configured' };
    }
    const validSharedSignature = sharedSecrets.some((secret) => verifyRequestSignatureWithSecret({
      secret,
      req,
      tsMs,
      nonce,
      signature,
    }));
    if (!validSharedSignature) {
      return { ok: false, status: 403, error: 'Invalid onprem request signature' };
    }
    usedAuthMode = 'shared';
    if (requestedSystemId) {
      await ensureSystemSyncCredential(requestedSystemId);
      credentialProvisioned = true;
    }
    return null;
  };

  if (authModeHeader === 'system') {
    const verifyResult = await verifySystemMode();
    if (verifyResult) return verifyResult;
  } else if (authModeHeader === 'shared') {
    const verifyResult = await verifySharedMode();
    if (verifyResult) return verifyResult;
  } else {
    // Legacy client behavior (no explicit auth mode header): prefer system verification
    // when a system id and active credential are present, otherwise fallback to shared.
    if (requestedSystemId) {
      const systemCredential = await getSystemSyncCredential(requestedSystemId);
      if (systemCredential && !systemCredential.revokedAt) {
        const validSystemSignature = verifySystemCredential(systemCredential);
        if (validSystemSignature) {
          usedAuthMode = 'system';
          resolvedEnterpriseSystemId = requestedSystemId;
        } else if (await recoverSystemModeByIdentity()) {
          usedAuthMode = 'system';
        } else {
          return { ok: false, status: 403, error: 'Invalid per-system onprem request signature' };
        }
      }
    }
    if (!usedAuthMode) {
      const verifyResult = await verifySharedMode();
      if (verifyResult) return verifyResult;
    }
  }

  const nonceFresh = await markOnpremRequestNonce(
    requestedSystemId ? `${requestedSystemId}:${nonce}` : nonce,
    tsMs,
  );
  if (!nonceFresh) {
    return { ok: false, status: 409, error: 'Replay detected for onprem public request nonce' };
  }

  if (!usedAuthMode) {
    return { ok: false, status: 401, error: 'Unable to determine onprem request auth mode' };
  }

  return {
    ok: true,
    authMode: usedAuthMode,
    enterpriseSystemId: resolvedEnterpriseSystemId,
    credentialProvisioned,
  };
}

async function buildOnpremSyncAuthResponse(params: {
  enterpriseSystemId: string | null | undefined;
  verification: Extract<OnpremSyncRequestVerification, { ok: true }>;
  forceRotate?: boolean;
}): Promise<{
  mode: 'system';
  enterpriseSystemId: string;
  version: number;
  issuedAt: string;
  rotated: boolean;
  secret?: string;
} | null> {
  const systemId = String(params.enterpriseSystemId || '').trim();
  if (!systemId) return null;

  const result = await ensureSystemSyncCredential(systemId, { forceRotate: !!params.forceRotate });
  const includeSecret = params.verification.authMode === 'shared' || params.verification.credentialProvisioned || !!params.forceRotate;
  return {
    mode: 'system',
    enterpriseSystemId: systemId,
    version: result.credential.version,
    issuedAt: result.credential.issuedAt,
    rotated: result.rotated,
    ...(includeSecret ? { secret: result.credential.secret } : {}),
  };
}

async function setEnterpriseSystemLicenseReason(systemId: string, status: string, reason: string | null) {
  const key = `ENTERPRISE_SYSTEM_LICENSE_REASON_${systemId}`;
  const now = new Date();
  const payload = JSON.stringify({
    status,
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
        description: 'Latest cloud-observed on-prem system license status reason',
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
      description: 'Latest cloud-observed on-prem system license status reason',
      isEditable: true,
    });
}

async function findActiveReplacementLicenseForVerifiedSystem(params: {
  verified: Extract<OnpremSyncRequestVerification, { ok: true }>;
  payload: any;
  now: Date;
}): Promise<{ replacementSystem: any; replacementKey: any } | null> {
  const verifiedSystemId = String(params.verified.enterpriseSystemId || '').trim();
  if (!verifiedSystemId) return null;

  const [system] = await db
    .select()
    .from(enterpriseSystems)
    .where(eq(enterpriseSystems.id, verifiedSystemId))
    .limit(1);
  if (!system) return null;

  const payloadCustomerId = String(params.payload?.enterpriseCustomerId || '').trim();
  if (payloadCustomerId && payloadCustomerId !== system.enterpriseCustomerId) return null;

  const payloadSystemType = normalizeOnpremSystemType(params.payload?.systemType);
  if (payloadSystemType && payloadSystemType !== String(system.systemType || '').toLowerCase()) return null;

  if (system.activeLicenseKeyId) {
    const [activeKey] = await db
      .select()
      .from(enterpriseLicenseKeys)
      .where(and(
        eq(enterpriseLicenseKeys.id, system.activeLicenseKeyId),
        eq(enterpriseLicenseKeys.isRevoked, false),
      ))
      .limit(1);
    if (activeKey && new Date(activeKey.expiresAt) > params.now) {
      return { replacementSystem: system, replacementKey: activeKey };
    }
  }

  if (system.activeLicenseRequestId) {
    const [requestKey] = await db
      .select()
      .from(enterpriseLicenseKeys)
      .where(and(
        eq(enterpriseLicenseKeys.licenseRequestId, system.activeLicenseRequestId),
        eq(enterpriseLicenseKeys.isRevoked, false),
      ))
      .orderBy(desc(enterpriseLicenseKeys.createdAt))
      .limit(1);
    if (requestKey && new Date(requestKey.expiresAt) > params.now) {
      return { replacementSystem: system, replacementKey: requestKey };
    }
  }

  return null;
}

async function requireActiveCourseTransferSystem(
  verified: Extract<OnpremSyncRequestVerification, { ok: true }>,
): Promise<any> {
  const systemId = String(verified.enterpriseSystemId || '').trim();
  if (!systemId) {
    throw Object.assign(new Error('Course transfer requires a registered per-system Cloud PRD credential.'), { status: 403 });
  }

  const [system] = await db
    .select()
    .from(enterpriseSystems)
    .where(eq(enterpriseSystems.id, systemId))
    .limit(1);
  if (!system) {
    throw Object.assign(new Error('Registered enterprise system was not found.'), { status: 404 });
  }

  const licenseStatus = String(system.licenseStatus || '').trim().toLowerCase();
  const runtimeStatus = String(system.status || '').trim().toLowerCase();
  if (licenseStatus !== 'active' || runtimeStatus !== 'active') {
    throw Object.assign(new Error('Course transfer requires an active Cloud PRD license.'), { status: 403 });
  }

  if (!system.activeLicenseKeyId) {
    throw Object.assign(new Error('Course transfer requires an active Cloud PRD license key.'), { status: 403 });
  }

  const [key] = await db
    .select()
    .from(enterpriseLicenseKeys)
    .where(and(
      eq(enterpriseLicenseKeys.id, system.activeLicenseKeyId),
      eq(enterpriseLicenseKeys.isRevoked, false),
    ))
    .limit(1);
  if (!key || new Date(key.expiresAt).getTime() < Date.now()) {
    throw Object.assign(new Error('Course transfer requires a non-expired active Cloud PRD license key.'), { status: 403 });
  }

  return system;
}

async function upsertEnterpriseBusinessProfile(params: {
  enterpriseCustomerId: string;
  businessProfile: ReturnType<typeof normalizeBusinessProfile>;
  authoritativeSystemType: 'development' | 'qa' | 'production';
  sourceSystem: {
    hardwareKey: string | null;
    hostname: string | null;
    serverBaseUrl: string | null;
  };
  mainOrganization: {
    mainOrganizationId: string | null;
    mainOrganizationName: string | null;
  } | null;
}) {
  const key = profileConfigKey(params.enterpriseCustomerId);
  const now = new Date();
  const [existing] = await db
    .select()
    .from(platformConfiguration)
    .where(eq(platformConfiguration.key, key))
    .limit(1);
  const existingProfile = parseStoredBusinessProfile(existing?.value);
  const syncMetadata = {
    authoritativeSystemType: params.authoritativeSystemType,
    updatedAt: now.toISOString(),
    sourceSystem: params.sourceSystem,
    mainOrganization: params.mainOrganization || null,
  };
  const mergedProfile = {
    ...(existingProfile || {}),
    ...(params.businessProfile || {}),
    syncMetadata,
  };

  if (existing) {
    await db
      .update(platformConfiguration)
      .set({
        value: JSON.stringify(mergedProfile),
        dataType: 'json',
        description: 'Enterprise customer business profile synced from on-prem systems',
        updatedAt: now,
      })
      .where(eq(platformConfiguration.id, existing.id));
  } else {
    await db
      .insert(platformConfiguration)
      .values({
        key,
        value: JSON.stringify(mergedProfile),
        dataType: 'json',
        description: 'Enterprise customer business profile synced from on-prem systems',
        isEditable: true,
      });
  }

  return mergedProfile;
}

async function upsertSystemLicenseSnapshot(params: {
  enterpriseCustomerId: string;
  systemType: string;
  hardwareKey: string | null;
  hostname: string | null;
  serverBaseUrl: string | null;
  licenseRequestId: string;
  licenseKeyId: string;
  expiresAt: Date;
  autoApproveRenewals: boolean;
  graceDays: number;
  monthlyFee?: string | null;
  feeCurrency?: string | null;
  billingStatus?: string | null;
  alertEmails?: string[] | null;
}) {
  const systemName = buildEnterpriseSystemDisplayName({
    systemType: params.systemType,
    hostname: params.hostname,
    serverBaseUrl: params.serverBaseUrl,
  });
  const list = await db
    .select()
    .from(enterpriseSystems)
    .where(and(
      eq(enterpriseSystems.enterpriseCustomerId, params.enterpriseCustomerId),
      eq(enterpriseSystems.systemType, params.systemType),
    ));

  const found = list.find((s) =>
    (params.hardwareKey && s.hardwareKey === params.hardwareKey) ||
    (params.serverBaseUrl && s.baseUrl === params.serverBaseUrl) ||
    (params.hostname && s.internalHostname === params.hostname),
  );

  const data = {
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
    monthlyFee: params.monthlyFee || null,
    feeCurrency: params.feeCurrency || null,
    billingStatus: params.billingStatus || 'due',
    alertEmails: params.alertEmails && params.alertEmails.length > 0 ? params.alertEmails.join(',') : null,
    lastContactSyncAt: new Date(),
    updatedAt: new Date(),
  };

  if (found) {
    const [updated] = await db
      .update(enterpriseSystems)
      .set(data)
      .where(eq(enterpriseSystems.id, found.id))
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
      ...data,
    })
    .returning();

  return created;
}

async function ensurePendingEnterpriseSystemBinding(params: {
  enterpriseCustomerId: string;
  systemType: 'development' | 'qa' | 'production';
  enterpriseSystemIdHint?: string | null;
  hardwareKey: string | null;
  hostname: string | null;
  serverBaseUrl: string | null;
  requestId: string;
  autoApproveRenewals?: boolean;
  graceDays?: number;
  monthlyFee?: string | null;
  feeCurrency?: string | null;
  billingStatus?: string | null;
  licenseStatus?: string;
}) {
  const now = new Date();
  const systemName = buildEnterpriseSystemDisplayName({
    systemType: params.systemType,
    hostname: params.hostname,
    serverBaseUrl: params.serverBaseUrl,
  });
  const list = await db
    .select()
    .from(enterpriseSystems)
    .where(and(
      eq(enterpriseSystems.enterpriseCustomerId, params.enterpriseCustomerId),
      eq(enterpriseSystems.systemType, params.systemType),
    ))
    .orderBy(desc(enterpriseSystems.updatedAt));

  const normalizedHardware = normalizeIdentityValue(params.hardwareKey);
  const normalizedHostname = normalizeIdentityValue(params.hostname);
  const normalizedBaseUrl = normalizeIdentityValue(params.serverBaseUrl);
  const hintedId = String(params.enterpriseSystemIdHint || '').trim() || null;

  const found = list.find((system) => {
    if (hintedId && system.id === hintedId) return true;
    if (normalizedHardware && normalizeIdentityValue(system.hardwareKey) === normalizedHardware) return true;
    if (normalizedHostname && normalizeIdentityValue(system.internalHostname) === normalizedHostname) return true;
    if (normalizedBaseUrl && normalizeIdentityValue(system.baseUrl) === normalizedBaseUrl) return true;
    return false;
  }) || null;

  const data = {
    name: systemName.slice(0, 100),
    hardwareKey: params.hardwareKey,
    baseUrl: params.serverBaseUrl,
    internalHostname: params.hostname,
    activeLicenseRequestId: params.requestId,
    activeLicenseKeyId: null,
    licenseStatus: params.licenseStatus || 'pending_approval',
    licenseExpiresAt: null,
    nextCheckInDueAt: null,
    autoApproveRenewals: params.autoApproveRenewals === true,
    graceDays: params.graceDays && params.graceDays > 0 ? params.graceDays : 15,
    monthlyFee: params.monthlyFee || null,
    feeCurrency: params.feeCurrency || null,
    billingStatus: params.billingStatus || 'due',
    lastContactSyncAt: now,
    updatedAt: now,
  };

  if (found) {
    const [updated] = await db
      .update(enterpriseSystems)
      .set(data)
      .where(eq(enterpriseSystems.id, found.id))
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
      ...data,
    })
    .returning();

  return created;
}

async function ensureSystemLicenseRequestForOnpremSync(params: {
  enterpriseCustomerId: string;
  enterpriseSystemId: string;
  systemType: 'development' | 'qa' | 'production';
  hardwareKey: string | null;
  hostname: string | null;
  serverBaseUrl: string | null;
  businessProfile: ReturnType<typeof normalizeBusinessProfile>;
  requestBootstrapKey: boolean;
}) {
  const identityClauses: any[] = [];
  if (params.hardwareKey) identityClauses.push(eq(enterpriseLicenseRequests.hardwareKey, params.hardwareKey));
  if (params.hostname) identityClauses.push(eq(enterpriseLicenseRequests.hostname, params.hostname));
  if (params.serverBaseUrl) identityClauses.push(eq(enterpriseLicenseRequests.serverBaseUrl, params.serverBaseUrl));

  const [systemPolicyRow] = await db
    .select({
      autoApproveRenewals: enterpriseSystems.autoApproveRenewals,
      billingStatus: enterpriseSystems.billingStatus,
      monthlyFee: enterpriseSystems.monthlyFee,
      feeCurrency: enterpriseSystems.feeCurrency,
    })
    .from(enterpriseSystems)
    .where(eq(enterpriseSystems.id, params.enterpriseSystemId))
    .limit(1);

  const policyAutoApprove = !!systemPolicyRow?.autoApproveRenewals;
  const policyBillingStatus = String(systemPolicyRow?.billingStatus || 'due');
  const canAutoIssueByPolicy = policyAllowsAutomaticIssuance({
    autoApproveRenewals: policyAutoApprove,
    billingStatus: policyBillingStatus,
  });

  let [request] = await db
    .select()
    .from(enterpriseLicenseRequests)
    .where(and(
      eq(enterpriseLicenseRequests.enterpriseCustomerId, params.enterpriseCustomerId),
      eq(enterpriseLicenseRequests.systemType, params.systemType),
      ...(identityClauses.length > 0 ? [or(...identityClauses)] : []),
    ))
    .orderBy(desc(enterpriseLicenseRequests.createdAt))
    .limit(1);

  let requestCreated = false;
  if (!request) {
    const generatedRequestData = JSON.stringify({
      generatedBy: 'onprem_business_profile_sync',
      generatedAt: new Date().toISOString(),
      businessProfile: params.businessProfile,
      identity: {
        hardwareKey: params.hardwareKey,
        hostname: params.hostname,
        serverBaseUrl: params.serverBaseUrl,
      },
    });

    [request] = await db
      .insert(enterpriseLicenseRequests)
      .values({
        enterpriseCustomerId: params.enterpriseCustomerId,
        requestData: generatedRequestData,
        hardwareKey: params.hardwareKey,
        hostname: params.hostname,
        serverBaseUrl: params.serverBaseUrl,
        systemType: params.systemType,
        status: canAutoIssueByPolicy ? 'approved' : 'pending',
        requestType: 'initial',
        monthlyFee: String(systemPolicyRow?.monthlyFee || '0'),
        feeCurrency: String(systemPolicyRow?.feeCurrency || 'USD'),
        autoApproveRenewals: policyAutoApprove,
        graceDays: 15,
        billingStatus: policyBillingStatus,
        reviewedAt: canAutoIssueByPolicy ? new Date() : null,
      })
      .returning();
    requestCreated = true;
  } else {
    const [updatedRequest] = await db
      .update(enterpriseLicenseRequests)
      .set({
        hardwareKey: params.hardwareKey,
        hostname: params.hostname,
        serverBaseUrl: params.serverBaseUrl,
        autoApproveRenewals: policyAutoApprove,
        billingStatus: policyBillingStatus,
        monthlyFee: String(systemPolicyRow?.monthlyFee || '0'),
        feeCurrency: String(systemPolicyRow?.feeCurrency || 'USD'),
        ...(canAutoIssueByPolicy && String(request.status || '').toLowerCase() !== 'approved'
          ? {
              status: 'approved',
              reviewedAt: new Date(),
              reviewedBy: 'system-policy-auto-approval',
              denialReason: null,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(enterpriseLicenseRequests.id, request.id))
      .returning();
    if (updatedRequest) {
      request = updatedRequest;
    }
  }

  const now = new Date();

  let bootstrapLicenseKeyData: string | null = null;
  let activeLicenseKeyId: string | null = null;
  let activeLicenseExpiresAt: Date | null = null;

  if (request.status === 'approved') {
    let [latestActiveKey] = await db
      .select()
      .from(enterpriseLicenseKeys)
      .where(and(
        eq(enterpriseLicenseKeys.licenseRequestId, request.id),
        eq(enterpriseLicenseKeys.isRevoked, false),
      ))
      .orderBy(desc(enterpriseLicenseKeys.issuedAt))
      .limit(1);

    if (!latestActiveKey && canAutoIssueByPolicy) {
      const now = new Date();
      const expiresAt = endOfCalendarMonth(now);
      const [customer] = await db
        .select({ companyName: enterpriseCustomers.companyName })
        .from(enterpriseCustomers)
        .where(eq(enterpriseCustomers.id, params.enterpriseCustomerId))
        .limit(1);

      const newLicenseId = `LIC-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const issuedKeyData = signLicenseKey({
        licenseId: newLicenseId,
        enterpriseCustomerId: params.enterpriseCustomerId,
        hardwareKey: params.hardwareKey || '',
        hostname: params.hostname || '',
        serverBaseUrl: params.serverBaseUrl || '',
        systemType: params.systemType,
        issuedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        monthlyFee: String(systemPolicyRow?.monthlyFee || '0'),
        feeCurrency: String(systemPolicyRow?.feeCurrency || 'USD'),
        companyName: String(customer?.companyName || ''),
        renewalSequence: 1,
        issuedReason: 'initial',
        graceDays: request.graceDays && request.graceDays > 0 ? request.graceDays : 15,
        autoApproveRenewals: policyAutoApprove,
        nextRenewalDueAt: expiresAt.toISOString(),
        issuedBy: 'system-policy-auto-approval',
      });

      const [inserted] = await db
        .insert(enterpriseLicenseKeys)
        .values({
          licenseId: newLicenseId,
          licenseRequestId: request.id,
          enterpriseCustomerId: params.enterpriseCustomerId,
          encryptedKeyData: issuedKeyData,
          systemType: params.systemType,
          issuedReason: 'initial',
          renewalSequence: 1,
          issuedAt: now,
          expiresAt,
          isRevoked: false,
        })
        .returning();

      latestActiveKey = inserted;
    }

    if (latestActiveKey) {
      activeLicenseKeyId = latestActiveKey.id;
      activeLicenseExpiresAt = latestActiveKey.expiresAt ? new Date(latestActiveKey.expiresAt) : null;
      if (params.requestBootstrapKey) {
        bootstrapLicenseKeyData = latestActiveKey.encryptedKeyData || null;
      }
    }
  }

  const effectiveLicenseStatus = request.status === 'approved' && activeLicenseExpiresAt && activeLicenseExpiresAt > now
    ? 'active'
    : request.status === 'approved'
      ? 'expired'
      : 'pending_approval';

  await db
    .update(enterpriseSystems)
    .set({
      activeLicenseRequestId: request.id,
      activeLicenseKeyId,
      hardwareKey: params.hardwareKey,
      internalHostname: params.hostname,
      baseUrl: params.serverBaseUrl,
      licenseStatus: effectiveLicenseStatus,
      licenseExpiresAt: activeLicenseExpiresAt,
      nextCheckInDueAt: activeLicenseExpiresAt,
      autoApproveRenewals: request.autoApproveRenewals === true,
      graceDays: request.graceDays && request.graceDays > 0 ? request.graceDays : 15,
      monthlyFee: request.monthlyFee || null,
      feeCurrency: request.feeCurrency || null,
      billingStatus: request.billingStatus || 'due',
      lastContactSyncAt: now,
      updatedAt: now,
    })
    .where(eq(enterpriseSystems.id, params.enterpriseSystemId));

  return {
    request,
    requestCreated,
    bootstrapLicenseKeyData,
    effectiveLicenseStatus,
    activeLicenseKeyId,
    activeLicenseExpiresAt,
    registrationStatus: request.status === 'approved' ? 'registered' : 'registered_pending_approval',
  };
}

const updateProfileSchema = z.object({
  companyName: z.string().min(1).optional(),
  contactPersonName: z.string().min(1).optional(),
  contactEmail: z.string().email().optional(),
  contactMobile: z.string().optional(),
  companyAddress: z.string().optional(),
  country: z.string().optional(),
});

const createSubCompanySchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  contactPersonName: z.string().min(1, 'Contact person name is required'),
  contactEmail: z.string().email('Invalid contact email'),
  contactMobile: z.string().optional(),
  companyAddress: z.string().optional(),
  country: z.string().optional(),
});

const createSystemSchema = z.object({
  name: z.string().min(1, 'System name is required').max(100),
  systemType: z.enum(['development', 'qa', 'production']),
  baseUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  internalHostname: z.string().max(255).optional().or(z.literal('')),
  cpu: z.string().max(100).optional().or(z.literal('')),
  memory: z.string().max(100).optional().or(z.literal('')),
  appPort: z.number().int().min(1).max(65535).optional(),
  dbPort: z.number().int().min(1).max(65535).optional(),
  nginxHttpPort: z.number().int().min(1).max(65535).optional(),
  nginxHttpsPort: z.number().int().min(1).max(65535).optional(),
});

const updateSystemSchema = createSystemSchema.partial();

const updateSubCompanySchema = z.object({
  companyName: z.string().min(1).optional(),
  contactPersonName: z.string().min(1).optional(),
  contactEmail: z.string().email().optional(),
  contactMobile: z.string().optional(),
  companyAddress: z.string().optional(),
  country: z.string().optional(),
});

const documentTypeSchema = z.enum([
  'business_registration',
  'banking_proof',
  'address_proof',
  'signed_sla',
  'signed_license_agreement',
  'other',
]);

export function registerEnterprisePortalRoutes(app: Express): void {
  if (process.env.ONPREM_MODE === 'true') {
    return;
  }
  const router = Router();

  router.get("/api/enterprise/profile", requireEnterpriseAuth, requireEnterpriseCustomerSelected, async (req: Request, res: Response) => {
    try {
      const [customer] = await db
        .select()
        .from(enterpriseCustomers)
        .where(eq(enterpriseCustomers.id, req.session.enterpriseCustomerId!))
        .limit(1);

      if (!customer) {
        return res.status(404).json({ error: 'Enterprise customer not found' });
      }

      const [subCompanyResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(enterpriseCustomers)
        .where(eq(enterpriseCustomers.parentEnterpriseId, req.session.enterpriseCustomerId!));

      const [documentResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(enterpriseDocuments)
        .where(eq(enterpriseDocuments.enterpriseCustomerId, req.session.enterpriseCustomerId!));

      const [systemsResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(enterpriseSystems)
        .where(eq(enterpriseSystems.enterpriseCustomerId, req.session.enterpriseCustomerId!));

      res.json({
        customer: stripPasswordHash(customer),
        subCompanyCount: subCompanyResult?.count || 0,
        documentCount: documentResult?.count || 0,
        systemsCount: systemsResult?.count || 0,
      });
    } catch (error) {
      console.error('[EnterprisePortal] Get profile error:', error);
      res.status(500).json({ error: 'Failed to get profile' });
    }
  });

  router.put("/api/enterprise/profile", requireEnterpriseAuth, requireEnterpriseCustomerSelected, async (req: Request, res: Response) => {
    try {
      const validatedData = updateProfileSchema.parse(req.body);

      const [updated] = await db
        .update(enterpriseCustomers)
        .set({
          ...validatedData,
          updatedAt: new Date(),
        })
        .where(eq(enterpriseCustomers.id, req.session.enterpriseCustomerId!))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Enterprise customer not found' });
      }

      res.json({ customer: stripPasswordHash(updated) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error('[EnterprisePortal] Update profile error:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  // ==================== SUB-COMPANIES ====================

  router.get("/api/enterprise/sub-companies", requireEnterpriseAuth, requireEnterpriseCustomerSelected, async (req: Request, res: Response) => {
    try {
      const subCompanies = await db
        .select()
        .from(enterpriseCustomers)
        .where(eq(enterpriseCustomers.parentEnterpriseId, req.session.enterpriseCustomerId!))
        .orderBy(desc(enterpriseCustomers.createdAt));

      res.json({
        subCompanies: subCompanies.map(stripPasswordHash),
      });
    } catch (error) {
      console.error('[EnterprisePortal] List sub-companies error:', error);
      res.status(500).json({ error: 'Failed to list sub-companies' });
    }
  });

  router.post("/api/enterprise/sub-companies", requireEnterpriseAuth, requireEnterpriseCustomerSelected, async (req: Request, res: Response) => {
    try {
      const validatedData = createSubCompanySchema.parse(req.body);

      const randomPassword = crypto.randomBytes(32).toString('hex');

      const [subCompany] = await db
        .insert(enterpriseCustomers)
        .values({
          email: validatedData.contactEmail,
          passwordHash: randomPassword,
          companyName: validatedData.companyName,
          contactPersonName: validatedData.contactPersonName,
          contactEmail: validatedData.contactEmail,
          contactMobile: validatedData.contactMobile || null,
          companyAddress: validatedData.companyAddress || null,
          country: validatedData.country || null,
          parentEnterpriseId: req.session.enterpriseCustomerId!,
          status: 'active',
          emailVerified: true,
        })
        .returning();

      res.status(201).json({ subCompany: stripPasswordHash(subCompany) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error('[EnterprisePortal] Create sub-company error:', error);
      res.status(500).json({ error: 'Failed to create sub-company' });
    }
  });

  router.put("/api/enterprise/sub-companies/:id", requireEnterpriseAuth, requireEnterpriseCustomerSelected, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const validatedData = updateSubCompanySchema.parse(req.body);

      const [existing] = await db
        .select()
        .from(enterpriseCustomers)
        .where(
          and(
            eq(enterpriseCustomers.id, id),
            eq(enterpriseCustomers.parentEnterpriseId, req.session.enterpriseCustomerId!)
          )
        )
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: 'Sub-company not found' });
      }

      const [updated] = await db
        .update(enterpriseCustomers)
        .set({
          ...validatedData,
          updatedAt: new Date(),
        })
        .where(eq(enterpriseCustomers.id, id))
        .returning();

      res.json({ subCompany: stripPasswordHash(updated) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error('[EnterprisePortal] Update sub-company error:', error);
      res.status(500).json({ error: 'Failed to update sub-company' });
    }
  });

  router.delete("/api/enterprise/sub-companies/:id", requireEnterpriseAuth, requireEnterpriseCustomerSelected, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const [existing] = await db
        .select()
        .from(enterpriseCustomers)
        .where(
          and(
            eq(enterpriseCustomers.id, id),
            eq(enterpriseCustomers.parentEnterpriseId, req.session.enterpriseCustomerId!)
          )
        )
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: 'Sub-company not found' });
      }

      await db
        .delete(enterpriseCustomers)
        .where(eq(enterpriseCustomers.id, id));

      res.json({ message: 'Sub-company deleted successfully' });
    } catch (error) {
      console.error('[EnterprisePortal] Delete sub-company error:', error);
      res.status(500).json({ error: 'Failed to delete sub-company' });
    }
  });

  // ==================== DOCUMENTS ====================

  router.get("/api/enterprise/documents", requireEnterpriseAuth, requireEnterpriseCustomerSelected, async (req: Request, res: Response) => {
    try {
      const documents = await db
        .select()
        .from(enterpriseDocuments)
        .where(eq(enterpriseDocuments.enterpriseCustomerId, req.session.enterpriseCustomerId!))
        .orderBy(desc(enterpriseDocuments.createdAt));

      res.json({ documents });
    } catch (error) {
      console.error('[EnterprisePortal] List documents error:', error);
      res.status(500).json({ error: 'Failed to list documents' });
    }
  });

  router.post("/api/enterprise/documents/upload", requireEnterpriseAuth, requireEnterpriseCustomerSelected, upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'File is required' });
      }

      const documentType = documentTypeSchema.parse(req.body.documentType);
      const enterpriseCustomerId = req.session.enterpriseCustomerId!;
      const fileName = req.file.originalname;
      const filePath = buildCanonicalStorageKey({
        scope: 'private',
        domain: 'ent-doc',
        extension: normalizeExtension(path.extname(fileName || '')) || '.bin',
        seed: `enterprise-doc:${enterpriseCustomerId}:${documentType}:${fileName}:${Date.now()}`,
      });
      await objectStorage.uploadCourseDraftDocument(filePath, req.file.buffer, req.file.mimetype);

      const [document] = await db
        .insert(enterpriseDocuments)
        .values({
          enterpriseCustomerId,
          documentType,
          fileName,
          filePath,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
          status: 'uploaded',
        })
        .returning();

      res.status(201).json({ document });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid document type' });
      }
      console.error('[EnterprisePortal] Upload document error:', error);
      res.status(500).json({ error: 'Failed to upload document' });
    }
  });

  router.get("/api/enterprise/documents/:id/download", requireEnterpriseAuth, requireEnterpriseCustomerSelected, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const [document] = await db
        .select()
        .from(enterpriseDocuments)
        .where(
          and(
            eq(enterpriseDocuments.id, id),
            eq(enterpriseDocuments.enterpriseCustomerId, req.session.enterpriseCustomerId!)
          )
        )
        .limit(1);

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const contents = await objectStorage.downloadFileToBuffer(document.filePath);
      if (!contents) {
        return res.status(404).json({ error: 'Document file not found in storage' });
      }

      res.set({
        'Content-Type': document.mimeType || 'application/octet-stream',
        'Content-Length': contents.length.toString(),
        'Content-Disposition': `attachment; filename="${encodeURIComponent(document.fileName)}"`,
      });
      res.send(contents);
    } catch (error) {
      console.error('[EnterprisePortal] Download document error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download document' });
      }
    }
  });

  router.delete("/api/enterprise/documents/:id", requireEnterpriseAuth, requireEnterpriseCustomerSelected, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const [document] = await db
        .select()
        .from(enterpriseDocuments)
        .where(
          and(
            eq(enterpriseDocuments.id, id),
            eq(enterpriseDocuments.enterpriseCustomerId, req.session.enterpriseCustomerId!)
          )
        )
        .limit(1);

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      try {
        await objectStorage.deleteObject(document.filePath);
      } catch (storageError) {
        console.warn('[EnterprisePortal] Could not delete file from storage:', storageError);
      }

      await db
        .delete(enterpriseDocuments)
        .where(eq(enterpriseDocuments.id, id));

      res.json({ message: 'Document deleted successfully' });
    } catch (error) {
      console.error('[EnterprisePortal] Delete document error:', error);
      res.status(500).json({ error: 'Failed to delete document' });
    }
  });

  // ==================== BUILD VERSIONS ====================

  router.get("/api/enterprise/builds", requireEnterpriseAuth, async (req: Request, res: Response) => {
    try {
      const builds = await db
        .select()
        .from(buildVersions)
        .where(eq(buildVersions.isActive, true))
        .orderBy(desc(buildVersions.createdAt));

      res.json({ builds });
    } catch (error) {
      console.error('[EnterprisePortal] List builds error:', error);
      res.status(500).json({ error: 'Failed to list build versions' });
    }
  });

  router.get("/api/enterprise/builds/:id/download", requireEnterpriseAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const [build] = await db
        .select()
        .from(buildVersions)
        .where(eq(buildVersions.id, id))
        .limit(1);

      if (!build) {
        return res.status(404).json({ error: 'Build version not found' });
      }

      const contents = await objectStorage.downloadFileToBuffer(build.filePath);
      if (!contents) {
        return res.status(404).json({ error: 'Build file not found in storage' });
      }

      res.set({
        'Content-Type': 'application/zip',
        'Content-Length': contents.length.toString(),
        'Content-Disposition': `attachment; filename="${encodeURIComponent(build.fileName)}"`,
      });
      res.send(contents);
    } catch (error) {
      console.error('[EnterprisePortal] Download build error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download build' });
      }
    }
  });

  // ==================== LICENSE MANAGEMENT ====================

  router.get("/api/enterprise/licenses", requireEnterpriseAuth, requireEnterpriseCustomerSelected, async (req: Request, res: Response) => {
    try {
      const enterpriseCustomerId = req.session.enterpriseCustomerId!;

      const requests = await db
        .select()
        .from(enterpriseLicenseRequests)
        .where(eq(enterpriseLicenseRequests.enterpriseCustomerId, enterpriseCustomerId))
        .orderBy(desc(enterpriseLicenseRequests.createdAt));

      const keys = await db
        .select()
        .from(enterpriseLicenseKeys)
        .where(eq(enterpriseLicenseKeys.enterpriseCustomerId, enterpriseCustomerId))
        .orderBy(desc(enterpriseLicenseKeys.createdAt));

      const keysByRequest = new Map(keys.map(k => [k.licenseRequestId, k]));
      const enrichedRequests = sortEnterpriseLicenseRecords(requests.map(r => ({
        ...r,
        licenseKeyId: keysByRequest.get(r.id)?.id || null,
      })));

      res.json({ licenseRequests: enrichedRequests, licenseKeys: keys });
    } catch (error) {
      console.error('[EnterprisePortal] List licenses error:', error);
      res.status(500).json({ error: 'Failed to list licenses' });
    }
  });

  router.post("/api/enterprise/licenses/upload-request", requireEnterpriseAuth, requireEnterpriseCustomerSelected, upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'License request file is required' });
      }

      const systemType = z.enum(['development', 'qa', 'production']).parse(req.body.systemType);
      const enterpriseCustomerId = req.session.enterpriseCustomerId!;

      const fileContent = req.file.buffer.toString('utf-8').trim();

      let hardwareKey: string | null = null;
      let hostname: string | null = null;
      let serverBaseUrl: string | null = null;

      try {
        const decrypted = decryptLicenseRequest(fileContent);
        hardwareKey = decrypted.hardwareKey || null;
        hostname = decrypted.hostname || null;
        serverBaseUrl = decrypted.serverBaseUrl || null;
      } catch (decryptError) {
        console.warn('[EnterprisePortal] Could not decrypt license request, storing raw data:', decryptError);
      }

      const [licenseRequest] = await db
        .insert(enterpriseLicenseRequests)
        .values({
          enterpriseCustomerId,
          requestData: fileContent,
          hardwareKey,
          hostname,
          serverBaseUrl,
          systemType,
          requestType: 'initial',
          status: 'pending',
          monthlyFee: '0',
          feeCurrency: 'USD',
          autoApproveRenewals: false,
          graceDays: 15,
          billingStatus: 'due',
          reviewedAt: undefined,
          reviewedBy: undefined,
        })
        .returning();

      res.status(201).json({ licenseRequest });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'systemType must be "development", "qa", or "production"' });
      }
      console.error('[EnterprisePortal] Upload license request error:', error);
      res.status(500).json({ error: 'Failed to upload license request' });
    }
  });

  router.get("/api/enterprise/licenses/keys/:id/download", requireEnterpriseAuth, requireEnterpriseCustomerSelected, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const enterpriseCustomerId = req.session.enterpriseCustomerId!;

      const [licenseKey] = await db
        .select()
        .from(enterpriseLicenseKeys)
        .where(
          and(
            eq(enterpriseLicenseKeys.id, id),
            eq(enterpriseLicenseKeys.enterpriseCustomerId, enterpriseCustomerId)
          )
        )
        .limit(1);

      if (!licenseKey) {
        return res.status(404).json({ error: 'License key not found' });
      }

      await db
        .update(enterpriseLicenseKeys)
        .set({ downloadedAt: new Date() })
        .where(eq(enterpriseLicenseKeys.id, id));

      const keyBuffer = Buffer.from(licenseKey.encryptedKeyData, 'utf-8');

      res.set({
        'Content-Type': 'application/octet-stream',
        'Content-Length': keyBuffer.length.toString(),
        'Content-Disposition': `attachment; filename="license-key-${licenseKey.systemType}.lpkey"`,
      });

      res.send(keyBuffer);
    } catch (error) {
      console.error('[EnterprisePortal] Download license key error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download license key' });
      }
    }
  });

  // ==================== AGREEMENT TEMPLATES ====================

  router.get("/api/enterprise/agreements", requireEnterpriseAuth, async (req: Request, res: Response) => {
    try {
      const templates = await db
        .select()
        .from(enterpriseAgreementTemplates)
        .where(eq(enterpriseAgreementTemplates.isActive, true))
        .orderBy(desc(enterpriseAgreementTemplates.createdAt));

      res.json({ agreements: templates });
    } catch (error) {
      console.error('[EnterprisePortal] List agreements error:', error);
      res.status(500).json({ error: 'Failed to list agreement templates' });
    }
  });

  router.get("/api/enterprise/agreements/:id/download", requireEnterpriseAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const [template] = await db
        .select()
        .from(enterpriseAgreementTemplates)
        .where(eq(enterpriseAgreementTemplates.id, id))
        .limit(1);

      if (!template) {
        return res.status(404).json({ error: 'Agreement template not found' });
      }

      const contents = await objectStorage.downloadFileToBuffer(template.filePath);
      if (!contents) {
        return res.status(404).json({ error: 'Agreement file not found in storage' });
      }

      res.set({
        'Content-Type': 'application/octet-stream',
        'Content-Length': contents.length.toString(),
        'Content-Disposition': `attachment; filename="${encodeURIComponent(template.fileName)}"`,
      });
      res.send(contents);
    } catch (error) {
      console.error('[EnterprisePortal] Download agreement error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download agreement template' });
      }
    }
  });

  router.get("/api/enterprise/systems", requireEnterpriseAuth, requireEnterpriseCustomerSelected, async (req: Request, res: Response) => {
    try {
      const systems = await db
        .select()
        .from(enterpriseSystems)
        .where(eq(enterpriseSystems.enterpriseCustomerId, req.session.enterpriseCustomerId!))
        .orderBy(desc(enterpriseSystems.createdAt));

      res.json({ systems });
    } catch (error) {
      console.error('[EnterprisePortal] List systems error:', error);
      res.status(500).json({ error: 'Failed to list systems' });
    }
  });

  router.post("/api/enterprise/systems", requireEnterpriseAuth, requireEnterpriseCustomerSelected, async (req: Request, res: Response) => {
    try {
      const validatedData = createSystemSchema.parse(req.body);

      const [system] = await db
        .insert(enterpriseSystems)
        .values({
          ...validatedData,
          baseUrl: validatedData.baseUrl || null,
          internalHostname: validatedData.internalHostname || null,
          cpu: validatedData.cpu || null,
          memory: validatedData.memory || null,
          enterpriseCustomerId: req.session.enterpriseCustomerId!,
        })
        .returning();

      res.status(201).json({ system });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('[EnterprisePortal] Create system error:', error);
      res.status(500).json({ error: 'Failed to create system' });
    }
  });

  router.put("/api/enterprise/systems/:id", requireEnterpriseAuth, requireEnterpriseCustomerSelected, async (req: Request, res: Response) => {
    try {
      const validatedData = updateSystemSchema.parse(req.body);

      const [existing] = await db
        .select()
        .from(enterpriseSystems)
        .where(and(
          eq(enterpriseSystems.id, req.params.id),
          eq(enterpriseSystems.enterpriseCustomerId, req.session.enterpriseCustomerId!)
        ))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: 'System not found' });
      }

      const updateData: any = { ...validatedData, updatedAt: new Date() };
      if (validatedData.baseUrl === '') updateData.baseUrl = null;
      if (validatedData.internalHostname === '') updateData.internalHostname = null;
      if (validatedData.cpu === '') updateData.cpu = null;
      if (validatedData.memory === '') updateData.memory = null;

      const [updated] = await db
        .update(enterpriseSystems)
        .set(updateData)
        .where(and(
          eq(enterpriseSystems.id, req.params.id),
          eq(enterpriseSystems.enterpriseCustomerId, req.session.enterpriseCustomerId!)
        ))
        .returning();

      res.json({ system: updated });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('[EnterprisePortal] Update system error:', error);
      res.status(500).json({ error: 'Failed to update system' });
    }
  });

  router.delete("/api/enterprise/systems/:id", requireEnterpriseAuth, requireEnterpriseCustomerSelected, async (req: Request, res: Response) => {
    try {
      const [existing] = await db
        .select()
        .from(enterpriseSystems)
        .where(and(
          eq(enterpriseSystems.id, req.params.id),
          eq(enterpriseSystems.enterpriseCustomerId, req.session.enterpriseCustomerId!)
        ))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: 'System not found' });
      }

      await db
        .delete(enterpriseSystems)
        .where(and(
          eq(enterpriseSystems.id, req.params.id),
          eq(enterpriseSystems.enterpriseCustomerId, req.session.enterpriseCustomerId!)
        ));
      try {
        await revokeSystemSyncCredential(req.params.id, 'system_deleted');
      } catch (revokeError) {
        console.warn('[EnterprisePortal] Failed to revoke sync credential for deleted system:', revokeError);
      }

      res.json({ message: 'System deleted successfully' });
    } catch (error) {
      console.error('[EnterprisePortal] Delete system error:', error);
      res.status(500).json({ error: 'Failed to delete system' });
    }
  });

  router.post("/api/enterprise/public/onprem/business-profile-sync", async (req: Request, res: Response) => {
    try {
      const verified = await verifySignedOnpremPublicRequest(req);
      if (!verified.ok) {
        return res.status(verified.status).json({ error: verified.error });
      }
      const requestedBusinessProfile = normalizeBusinessProfile(req.body?.businessProfile);
      const systemType = normalizeOnpremSystemType(req.body?.systemType);
      const requestBootstrapKey = req.body?.requestBootstrapKey === true || String(req.body?.requestBootstrapKey || '').toLowerCase() === 'true';
      const hardwareKey = String(req.body?.hardwareKey || '').trim() || null;
      const hostname = String(req.body?.hostname || '').trim() || null;
      const serverBaseUrl = String(req.body?.serverBaseUrl || '').trim() || null;
      const providedRootBaseDomain = String(req.body?.rootBaseDomain || '').trim().toLowerCase() || null;
      const incomingBaseDomain = providedRootBaseDomain || canonicalBaseDomainKey(serverBaseUrl);
      const requestedEnterpriseCustomerId = String(req.body?.enterpriseCustomerId || '').trim() || null;
      const mainOrganization = req.body?.mainOrganization && typeof req.body.mainOrganization === 'object'
        ? {
            mainOrganizationId: String(req.body.mainOrganization.mainOrganizationId || '').trim() || null,
            mainOrganizationName: String(req.body.mainOrganization.mainOrganizationName || '').trim() || null,
          }
        : null;

      if (!systemType) {
        return res.status(400).json({ error: 'systemType must be development, qa, or production' });
      }

      let customer: any | null = null;
      let deletedRecoveryPolicy: DeletedCustomerRecoveryPolicy | null = null;

      if (!customer && incomingBaseDomain) {
        const candidateSystems = await db
          .select({
            enterpriseCustomerId: enterpriseSystems.enterpriseCustomerId,
            baseUrl: enterpriseSystems.baseUrl,
            updatedAt: enterpriseSystems.updatedAt,
          })
          .from(enterpriseSystems)
          .where(sql`${enterpriseSystems.baseUrl} IS NOT NULL`)
          .orderBy(desc(enterpriseSystems.updatedAt));

        const byBaseDomain = candidateSystems.find((s) =>
          canonicalBaseDomainKey(String(s.baseUrl || '')) === incomingBaseDomain,
        );

        if (byBaseDomain?.enterpriseCustomerId) {
          const [byDomainCustomer] = await db
            .select()
            .from(enterpriseCustomers)
            .where(eq(enterpriseCustomers.id, byBaseDomain.enterpriseCustomerId))
            .limit(1);
          customer = byDomainCustomer || null;
        }
      }

      if (!customer && requestedEnterpriseCustomerId) {
        const [byId] = await db
          .select()
          .from(enterpriseCustomers)
          .where(eq(enterpriseCustomers.id, requestedEnterpriseCustomerId))
          .limit(1);
        customer = byId || null;
        if (!customer) {
          const [recoveryPolicyRow] = await db
            .select({ value: platformConfiguration.value })
            .from(platformConfiguration)
            .where(eq(platformConfiguration.key, deletedCustomerRecoveryPolicyKey(requestedEnterpriseCustomerId)))
            .limit(1);
          deletedRecoveryPolicy = parseDeletedCustomerRecoveryPolicy(recoveryPolicyRow?.value);
        }
      }

      if (!customer && (hardwareKey || hostname || serverBaseUrl)) {
        const systemMatchClauses: any[] = [];
        if (hardwareKey) systemMatchClauses.push(eq(enterpriseSystems.hardwareKey, hardwareKey));
        if (hostname) systemMatchClauses.push(eq(enterpriseSystems.internalHostname, hostname));
        if (serverBaseUrl) systemMatchClauses.push(eq(enterpriseSystems.baseUrl, serverBaseUrl));

        const candidates = systemMatchClauses.length > 0
          ? await db
              .select()
              .from(enterpriseSystems)
              .where(or(...systemMatchClauses))
              .orderBy(desc(enterpriseSystems.updatedAt))
          : [];
        if (candidates.length > 0) {
          const [bySystem] = await db
            .select()
            .from(enterpriseCustomers)
            .where(eq(enterpriseCustomers.id, candidates[0].enterpriseCustomerId))
            .limit(1);
          customer = bySystem || null;
        }
      }

      if (!customer) {
        if (!requestedBusinessProfile) {
          return res.status(400).json({ error: 'businessProfile is required for new customer registration' });
        }
        const completeness = evaluateBusinessProfileCompleteness(requestedBusinessProfile);
        if (!completeness.isComplete) {
          return res.status(400).json({
            error: `Business profile is incomplete: ${completeness.missingFields.join(', ')}`,
            missingFields: completeness.missingFields,
          });
        }

        const rootCustomers = await db
          .select()
          .from(enterpriseCustomers)
          .where(sql`${enterpriseCustomers.parentEnterpriseId} IS NULL`);
        const profileRows = await db
          .select({ key: platformConfiguration.key, value: platformConfiguration.value })
          .from(platformConfiguration)
          .where(sql`${platformConfiguration.key} like 'ENTERPRISE_BUSINESS_PROFILE_%'`);
        const profileMap = new Map<string, any>();
        for (const row of profileRows) {
          const customerId = row.key.replace('ENTERPRISE_BUSINESS_PROFILE_', '');
          profileMap.set(customerId, parseStoredBusinessProfile(row.value));
        }

        const registrationMatches = rootCustomers.filter((c) => {
          const profile = profileMap.get(c.id);
          return normalizeIdentityValue(profile?.businessRegistrationNumber) !== '' &&
            normalizeIdentityValue(profile?.businessRegistrationNumber) === normalizeIdentityValue(requestedBusinessProfile.businessRegistrationNumber);
        });
        if (registrationMatches.length > 1) {
          return res.status(409).json({ error: 'Duplicate enterprise customers found for this registration number', code: 'REGISTRATION_CONFLICT' });
        }
        if (registrationMatches.length === 1) {
          customer = registrationMatches[0];
        }

        if (!customer) {
          const vatMatches = rootCustomers.filter((c) => {
            const profile = profileMap.get(c.id);
            return normalizeIdentityValue(profile?.vatNumber) !== '' &&
              normalizeIdentityValue(profile?.vatNumber) === normalizeIdentityValue(requestedBusinessProfile.vatNumber);
          });
          if (vatMatches.length > 1) {
            return res.status(409).json({ error: 'Duplicate enterprise customers found for this VAT number', code: 'VAT_CONFLICT' });
          }
          if (vatMatches.length === 1) {
            customer = vatMatches[0];
          }
        }

        if (!customer) {
          const nameAndEmailMatches = rootCustomers.filter((c) =>
            normalizeIdentityValue(c.companyName) === normalizeIdentityValue(requestedBusinessProfile.businessName) &&
            normalizeIdentityValue(c.contactEmail) === normalizeIdentityValue(requestedBusinessProfile.billingContactEmail)
          );
          if (nameAndEmailMatches.length > 1) {
            return res.status(409).json({ error: 'Duplicate enterprise customers found for this business profile', code: 'PROFILE_CONFLICT' });
          }
          if (nameAndEmailMatches.length === 1) {
            customer = nameAndEmailMatches[0];
          }
        }
      }

      let customerCreated = false;
      if (!customer) {
        const businessProfile = requestedBusinessProfile!;
        const now = new Date();
        const syntheticEmail = buildOnpremSyntheticEmail([
          businessProfile.businessName,
          businessProfile.businessRegistrationNumber,
          businessProfile.vatNumber,
          serverBaseUrl || '',
          hostname || '',
          hardwareKey || '',
          now.toISOString(),
        ].join('|'));
        const [created] = await db
          .insert(enterpriseCustomers)
          .values({
            email: syntheticEmail,
            passwordHash: crypto.randomBytes(48).toString('hex'),
            companyName: businessProfile.businessName || 'OnPrem Customer',
            contactPersonName: businessProfile.billingContactName || 'OnPrem Contact',
            contactEmail: businessProfile.billingContactEmail || syntheticEmail,
            contactMobile: [businessProfile.countryCode, businessProfile.billingContactPhone].filter(Boolean).join(' ') || null,
            companyAddress: businessProfile.businessAddress || null,
            country: businessProfile.countryCode || null,
            status: 'active',
            emailVerified: true,
            accountActivatedAt: now,
          })
          .returning();
        customer = created;
        customerCreated = true;
      }

      if (String(customer.status || '').toLowerCase() === 'suspended') {
        return res.status(403).json({
          error: 'Enterprise customer is suspended. Licensing is disabled until reactivated by SuperAdmin.',
          status: 'suspended',
        });
      }

      const existingSystems = await db
        .select()
        .from(enterpriseSystems)
        .where(eq(enterpriseSystems.enterpriseCustomerId, customer.id));
      const matchingSystem = existingSystems.find((s) =>
        (hardwareKey && s.hardwareKey === hardwareKey) ||
        (serverBaseUrl && s.baseUrl === serverBaseUrl) ||
        (hostname && s.internalHostname === hostname) ||
        (s.systemType === systemType && !s.hardwareKey && !s.baseUrl && !s.internalHostname)
      );

      let trackedSystem: any;
      const recoveredPolicyForSystem = selectRecoverySystemPolicy({
        policy: deletedRecoveryPolicy,
        systemType,
        hardwareKey,
        hostname,
        serverBaseUrl,
      });
      if (matchingSystem) {
        const [updatedSystem] = await db
          .update(enterpriseSystems)
          .set({
            hardwareKey,
            internalHostname: hostname,
            baseUrl: serverBaseUrl,
            systemType,
            autoApproveRenewals: recoveredPolicyForSystem?.autoApproveRenewals ?? matchingSystem.autoApproveRenewals ?? false,
            graceDays: recoveredPolicyForSystem?.graceDays ?? matchingSystem.graceDays ?? 15,
            billingStatus: recoveredPolicyForSystem?.billingStatus ?? matchingSystem.billingStatus ?? 'due',
            monthlyFee: recoveredPolicyForSystem?.monthlyFee ?? matchingSystem.monthlyFee ?? '0.00',
            feeCurrency: recoveredPolicyForSystem?.feeCurrency ?? matchingSystem.feeCurrency ?? 'USD',
            status: 'active',
            lastContactSyncAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(enterpriseSystems.id, matchingSystem.id))
          .returning();
        trackedSystem = updatedSystem;
      } else {
        const [createdSystem] = await db
          .insert(enterpriseSystems)
          .values({
            enterpriseCustomerId: customer.id,
            name: `${systemType.toUpperCase()} ${hostname || serverBaseUrl || 'OnPrem'}`.slice(0, 100),
            systemType,
            baseUrl: serverBaseUrl,
            internalHostname: hostname,
            hardwareKey,
            autoApproveRenewals: recoveredPolicyForSystem?.autoApproveRenewals ?? false,
            graceDays: recoveredPolicyForSystem?.graceDays ?? 15,
            billingStatus: recoveredPolicyForSystem?.billingStatus ?? 'due',
            monthlyFee: recoveredPolicyForSystem?.monthlyFee ?? '0.00',
            feeCurrency: recoveredPolicyForSystem?.feeCurrency ?? 'USD',
            status: 'active',
            lastContactSyncAt: new Date(),
            appPort: 3000,
            dbPort: 5432,
            nginxHttpPort: 80,
            nginxHttpsPort: 443,
          })
          .returning();
        trackedSystem = createdSystem;
      }

      const bootstrapMobile = splitContactMobile(customer.contactMobile);
      const bootstrapBusinessProfile = requestedBusinessProfile || {
        businessName: String(customer.companyName || '').trim(),
        businessRegistrationNumber: '',
        businessAddress: String(customer.companyAddress || '').trim(),
        billingContactName: String(customer.contactPersonName || '').trim(),
        billingContactEmail: String(customer.contactEmail || '').trim().toLowerCase(),
        billingContactPhone: bootstrapMobile.billingContactPhone,
        countryCode: String(customer.country || bootstrapMobile.countryCode || '').trim(),
        vatNumber: '',
        notes: '',
      };

      const licenseBootstrap = await ensureSystemLicenseRequestForOnpremSync({
        enterpriseCustomerId: customer.id,
        enterpriseSystemId: trackedSystem.id,
        systemType,
        hardwareKey,
        hostname,
        serverBaseUrl,
        businessProfile: bootstrapBusinessProfile,
        requestBootstrapKey,
      });

      const allSystems = await db
        .select()
        .from(enterpriseSystems)
        .where(eq(enterpriseSystems.enterpriseCustomerId, customer.id));

      const [existingProfileRow] = await db
        .select({ value: platformConfiguration.value })
        .from(platformConfiguration)
        .where(eq(platformConfiguration.key, profileConfigKey(customer.id)))
        .limit(1);
      const existingProfile = parseStoredBusinessProfile(existingProfileRow?.value);
      const fallbackMobile = splitContactMobile(customer.contactMobile);
      const fallbackProfile = {
        businessName: String(customer.companyName || '').trim(),
        businessRegistrationNumber: '',
        businessAddress: String(customer.companyAddress || '').trim(),
        billingContactName: String(customer.contactPersonName || '').trim(),
        billingContactEmail: String(customer.contactEmail || '').trim().toLowerCase(),
        billingContactPhone: fallbackMobile.billingContactPhone,
        countryCode: String(customer.country || fallbackMobile.countryCode || '').trim(),
        vatNumber: '',
        notes: '',
      };
      const businessProfile = requestedBusinessProfile || existingProfile || fallbackProfile;
      const authoritativeSystemType = normalizeOnpremSystemType(existingProfile?.syncMetadata?.authoritativeSystemType);
      const effectiveAuthoritativeSystemType = authoritativeSystemType || allSystems
        .map((s) => normalizeOnpremSystemType(s.systemType))
        .filter((v): v is 'development' | 'qa' | 'production' => !!v)
        .sort((a, b) => systemTypePriority(b) - systemTypePriority(a))[0] || systemType;

      const incomingPriority = systemTypePriority(systemType);
      const authoritativePriority = systemTypePriority(effectiveAuthoritativeSystemType);
      const readOnly = incomingPriority < authoritativePriority;
      const syncAuth = await buildOnpremSyncAuthResponse({
        enterpriseSystemId: trackedSystem.id,
        verification: verified,
      });

      if (readOnly) {
        return res.json({
          success: true,
          customerCreated,
          readOnly: true,
          enterpriseCustomerId: customer.id,
          enterpriseSystemId: trackedSystem.id,
          licenseRequest: {
            id: licenseBootstrap.request.id,
            status: licenseBootstrap.request.status,
            createdAt: licenseBootstrap.request.createdAt,
            monthlyFee: licenseBootstrap.request.monthlyFee,
            feeCurrency: licenseBootstrap.request.feeCurrency,
            billingStatus: licenseBootstrap.request.billingStatus,
            requestCreated: licenseBootstrap.requestCreated,
          },
          registrationStatus: licenseBootstrap.registrationStatus,
          licenseStatus: licenseBootstrap.effectiveLicenseStatus,
          bootstrapLicense: requestBootstrapKey ? {
            available: !!licenseBootstrap.bootstrapLicenseKeyData,
            licenseKeyData: licenseBootstrap.bootstrapLicenseKeyData,
          } : undefined,
          authoritativeSystemType: effectiveAuthoritativeSystemType,
          cloudProfile: existingProfile || businessProfile,
          syncAuth,
          message: `Business profile is managed by ${effectiveAuthoritativeSystemType.toUpperCase()} system track.`,
        });
      }

      await db
        .update(enterpriseCustomers)
        .set({
          companyName: businessProfile.businessName || customer.companyName,
          contactPersonName: businessProfile.billingContactName || customer.contactPersonName,
          contactEmail: businessProfile.billingContactEmail || customer.contactEmail,
          contactMobile: [businessProfile.countryCode, businessProfile.billingContactPhone].filter(Boolean).join(' ') || null,
          companyAddress: businessProfile.businessAddress || null,
          country: businessProfile.countryCode || null,
          updatedAt: new Date(),
        })
        .where(eq(enterpriseCustomers.id, customer.id));

      const storedProfile = await upsertEnterpriseBusinessProfile({
        enterpriseCustomerId: customer.id,
        businessProfile,
        authoritativeSystemType: systemType,
        sourceSystem: {
          hardwareKey,
          hostname,
          serverBaseUrl,
        },
        mainOrganization,
      });

      if (deletedRecoveryPolicy && requestedEnterpriseCustomerId) {
        const now = new Date();
        const recoveryKey = deletedCustomerRecoveryPolicyKey(requestedEnterpriseCustomerId);
        const snapshot = {
          ...deletedRecoveryPolicy,
          recoveredAt: now.toISOString(),
          recoveredCustomerId: customer.id,
          recoveredSystemId: trackedSystem.id,
        };
        await db
          .insert(platformConfiguration)
          .values({
            key: recoveryKey,
            value: JSON.stringify(snapshot),
            dataType: 'json',
            description: 'Deleted customer recovery policy snapshot for on-prem reprovisioning',
            isEditable: true,
          })
          .onConflictDoUpdate({
            target: [platformConfiguration.key],
            set: {
              value: JSON.stringify(snapshot),
              dataType: 'json',
              description: 'Deleted customer recovery policy snapshot for on-prem reprovisioning',
              updatedAt: now,
            },
          });
      }

      res.json({
        success: true,
        customerCreated,
        recoveredFromDeletedCustomer: !!(deletedRecoveryPolicy && requestedEnterpriseCustomerId),
        readOnly: false,
        enterpriseCustomerId: customer.id,
        enterpriseSystemId: trackedSystem.id,
        licenseRequest: {
          id: licenseBootstrap.request.id,
          status: licenseBootstrap.request.status,
          createdAt: licenseBootstrap.request.createdAt,
          monthlyFee: licenseBootstrap.request.monthlyFee,
          feeCurrency: licenseBootstrap.request.feeCurrency,
          billingStatus: licenseBootstrap.request.billingStatus,
          requestCreated: licenseBootstrap.requestCreated,
        },
        registrationStatus: licenseBootstrap.registrationStatus,
        licenseStatus: licenseBootstrap.effectiveLicenseStatus,
        bootstrapLicense: requestBootstrapKey ? {
          available: !!licenseBootstrap.bootstrapLicenseKeyData,
          licenseKeyData: licenseBootstrap.bootstrapLicenseKeyData,
        } : undefined,
        authoritativeSystemType: systemType,
        cloudProfile: storedProfile,
        syncAuth,
        message: customerCreated
          ? 'Enterprise customer record created and business profile synced.'
          : 'Business profile synced to enterprise control plane.',
      });
    } catch (error) {
      console.error('[EnterprisePortal] Onprem business profile sync error:', error);
      res.status(500).json({ error: 'Failed to sync onprem business profile' });
    }
  });

  router.post("/api/enterprise/public/onprem/business-profile-read", async (req: Request, res: Response) => {
    try {
      const verified = await verifySignedOnpremPublicRequest(req);
      if (!verified.ok) {
        return res.status(verified.status).json({ error: verified.error });
      }
      const requestedEnterpriseCustomerId = String(req.body?.enterpriseCustomerId || '').trim() || null;
      const requestedEnterpriseSystemId = String(req.body?.enterpriseSystemId || '').trim() || null;
      const incomingSystemType = normalizeOnpremSystemType(req.body?.systemType);
      const hardwareKey = String(req.body?.hardwareKey || '').trim() || null;
      const hostname = String(req.body?.hostname || '').trim() || null;
      const serverBaseUrl = String(req.body?.serverBaseUrl || '').trim() || null;
      const providedRootBaseDomain = String(req.body?.rootBaseDomain || '').trim().toLowerCase() || null;
      const incomingBaseDomain = providedRootBaseDomain || canonicalBaseDomainKey(serverBaseUrl);

      let trackedSystem: any | null = null;
      let customerId: string | null = null;

      if (verified.enterpriseSystemId && verified.enterpriseSystemId !== requestedEnterpriseSystemId) {
        const [verifiedSystem] = await db
          .select()
          .from(enterpriseSystems)
          .where(eq(enterpriseSystems.id, verified.enterpriseSystemId))
          .limit(1);
        if (verifiedSystem) {
          trackedSystem = verifiedSystem;
          customerId = verifiedSystem.enterpriseCustomerId;
        }
      }

      // Resolve explicit system-id hints first so stale base-domain matches cannot cross tracks.
      if (!trackedSystem && requestedEnterpriseSystemId) {
        const [bySystemId] = await db
          .select()
          .from(enterpriseSystems)
          .where(eq(enterpriseSystems.id, requestedEnterpriseSystemId))
          .limit(1);
        const bySystemIdType = normalizeOnpremSystemType(bySystemId?.systemType);
        const incomingMatchesSystemType = !incomingSystemType || !bySystemIdType || bySystemIdType === incomingSystemType;
        if (bySystemId && incomingMatchesSystemType) {
          trackedSystem = bySystemId;
          customerId = bySystemId.enterpriseCustomerId;
        }
      }

      if (!customerId && incomingBaseDomain) {
        const baseDomainWhere = incomingSystemType
          ? and(
              sql`${enterpriseSystems.baseUrl} IS NOT NULL`,
              eq(enterpriseSystems.systemType, incomingSystemType),
            )
          : sql`${enterpriseSystems.baseUrl} IS NOT NULL`;

        const candidateSystems = await db
          .select({
            id: enterpriseSystems.id,
            enterpriseCustomerId: enterpriseSystems.enterpriseCustomerId,
            baseUrl: enterpriseSystems.baseUrl,
            updatedAt: enterpriseSystems.updatedAt,
          })
          .from(enterpriseSystems)
          .where(baseDomainWhere)
          .orderBy(desc(enterpriseSystems.updatedAt));

        const byBaseDomain = candidateSystems.find((s) =>
          canonicalBaseDomainKey(String(s.baseUrl || '')) === incomingBaseDomain,
        );
        if (byBaseDomain) {
          customerId = byBaseDomain.enterpriseCustomerId;
          trackedSystem = byBaseDomain;
        }
      }

      if (!customerId && requestedEnterpriseCustomerId) {
        customerId = requestedEnterpriseCustomerId;
      }

      if (!customerId && (hardwareKey || hostname || serverBaseUrl)) {
        const systemMatchClauses: any[] = [];
        if (hardwareKey) systemMatchClauses.push(eq(enterpriseSystems.hardwareKey, hardwareKey));
        if (hostname) systemMatchClauses.push(eq(enterpriseSystems.internalHostname, hostname));
        if (serverBaseUrl) systemMatchClauses.push(eq(enterpriseSystems.baseUrl, serverBaseUrl));

        if (systemMatchClauses.length > 0) {
          const systemWhere = incomingSystemType
            ? and(eq(enterpriseSystems.systemType, incomingSystemType), or(...systemMatchClauses))
            : or(...systemMatchClauses);
          const [matchedSystem] = await db
            .select()
            .from(enterpriseSystems)
            .where(systemWhere)
            .orderBy(desc(enterpriseSystems.updatedAt))
            .limit(1);
          trackedSystem = matchedSystem || trackedSystem;
          customerId = matchedSystem?.enterpriseCustomerId || customerId;
        }
      }

      if (!customerId) {
        return res.status(404).json({ error: 'Enterprise customer could not be resolved for profile read' });
      }

      let [customer] = customerId
        ? await db
            .select({
              id: enterpriseCustomers.id,
              status: enterpriseCustomers.status,
              companyName: enterpriseCustomers.companyName,
              contactPersonName: enterpriseCustomers.contactPersonName,
              contactEmail: enterpriseCustomers.contactEmail,
              contactMobile: enterpriseCustomers.contactMobile,
              companyAddress: enterpriseCustomers.companyAddress,
              country: enterpriseCustomers.country,
            })
            .from(enterpriseCustomers)
            .where(eq(enterpriseCustomers.id, customerId))
            .limit(1)
        : [null as any];

      // Stale local config IDs should not block identity/base-domain fallback matching.
      if (!customer && (requestedEnterpriseCustomerId || requestedEnterpriseSystemId)) {
        customerId = null;
        trackedSystem = null;

        if (hardwareKey || hostname || serverBaseUrl) {
          const retryClauses: any[] = [];
          if (hardwareKey) retryClauses.push(eq(enterpriseSystems.hardwareKey, hardwareKey));
          if (hostname) retryClauses.push(eq(enterpriseSystems.internalHostname, hostname));
          if (serverBaseUrl) retryClauses.push(eq(enterpriseSystems.baseUrl, serverBaseUrl));

          if (retryClauses.length > 0) {
            const retryWhere = incomingSystemType
              ? and(eq(enterpriseSystems.systemType, incomingSystemType), or(...retryClauses))
              : or(...retryClauses);
            const [retryMatchedSystem] = await db
              .select()
              .from(enterpriseSystems)
              .where(retryWhere)
              .orderBy(desc(enterpriseSystems.updatedAt))
              .limit(1);
            trackedSystem = retryMatchedSystem || null;
            customerId = retryMatchedSystem?.enterpriseCustomerId || null;
          }
        }

        if (!customerId && incomingBaseDomain) {
            const retryBaseDomainWhere = incomingSystemType
              ? and(
                  sql`${enterpriseSystems.baseUrl} IS NOT NULL`,
                  eq(enterpriseSystems.systemType, incomingSystemType),
                )
              : sql`${enterpriseSystems.baseUrl} IS NOT NULL`;
            const retryCandidateSystems = await db
              .select({
                id: enterpriseSystems.id,
                enterpriseCustomerId: enterpriseSystems.enterpriseCustomerId,
                baseUrl: enterpriseSystems.baseUrl,
                updatedAt: enterpriseSystems.updatedAt,
              })
              .from(enterpriseSystems)
              .where(retryBaseDomainWhere)
              .orderBy(desc(enterpriseSystems.updatedAt));

            const retryByBaseDomain = retryCandidateSystems.find((s) =>
              canonicalBaseDomainKey(String(s.baseUrl || '')) === incomingBaseDomain,
            );
            if (retryByBaseDomain) {
              customerId = retryByBaseDomain.enterpriseCustomerId;
              trackedSystem = trackedSystem || retryByBaseDomain;
            }
        }

        if (customerId) {
          const [retryCustomer] = await db
            .select({
              id: enterpriseCustomers.id,
              status: enterpriseCustomers.status,
              companyName: enterpriseCustomers.companyName,
              contactPersonName: enterpriseCustomers.contactPersonName,
              contactEmail: enterpriseCustomers.contactEmail,
              contactMobile: enterpriseCustomers.contactMobile,
              companyAddress: enterpriseCustomers.companyAddress,
              country: enterpriseCustomers.country,
            })
            .from(enterpriseCustomers)
            .where(eq(enterpriseCustomers.id, customerId))
            .limit(1);
          customer = retryCustomer || null;
        }
      }

      if (!customer) {
        return res.status(404).json({ error: 'Enterprise customer not found' });
      }

      const systems = await db
        .select()
        .from(enterpriseSystems)
        .where(eq(enterpriseSystems.enterpriseCustomerId, customer.id));

      if (!trackedSystem && incomingSystemType) {
        trackedSystem = systems.find((s) => String(s.systemType || '').toLowerCase() === incomingSystemType) || null;
      }
      if (!trackedSystem && systems.length > 0) {
        trackedSystem = systems[0];
      }

      const [existingProfileRow] = await db
        .select({ value: platformConfiguration.value })
        .from(platformConfiguration)
        .where(eq(platformConfiguration.key, profileConfigKey(customer.id)))
        .limit(1);
      const existingProfile = parseStoredBusinessProfile(existingProfileRow?.value);
      const mobileParts = splitContactMobile(customer.contactMobile);
      const fallbackProfile = {
        businessName: String(customer.companyName || '').trim(),
        businessRegistrationNumber: '',
        businessAddress: String(customer.companyAddress || '').trim(),
        billingContactName: String(customer.contactPersonName || '').trim(),
        billingContactEmail: String(customer.contactEmail || '').trim().toLowerCase(),
        billingContactPhone: mobileParts.billingContactPhone,
        countryCode: String(customer.country || mobileParts.countryCode || '').trim(),
        vatNumber: '',
        notes: '',
      };
      const cloudProfilePayload = existingProfile || fallbackProfile;

      const authoritativeSystemType = normalizeOnpremSystemType(existingProfile?.syncMetadata?.authoritativeSystemType);
      const highestKnownSystemType = systems
        .map((s) => normalizeOnpremSystemType(s.systemType))
        .filter((v): v is 'development' | 'qa' | 'production' => !!v)
        .sort((a, b) => systemTypePriority(b) - systemTypePriority(a))[0] || incomingSystemType || 'development';
      const effectiveAuthoritativeSystemType = authoritativeSystemType || highestKnownSystemType;

      const incomingType = incomingSystemType || normalizeOnpremSystemType(trackedSystem?.systemType) || 'development';
      const readOnly = systemTypePriority(incomingType) < systemTypePriority(effectiveAuthoritativeSystemType);
      const syncAuth = await buildOnpremSyncAuthResponse({
        enterpriseSystemId: trackedSystem?.id || null,
        verification: verified,
      });

      res.json({
        success: true,
        readOnly,
        enterpriseCustomerId: customer.id,
        enterpriseSystemId: trackedSystem?.id || null,
        authoritativeSystemType: effectiveAuthoritativeSystemType,
        cloudProfile: cloudProfilePayload,
        customerStatus: String(customer.status || '').toLowerCase(),
        syncAuth,
        message: existingProfile
          ? `Business profile loaded from cloud control plane (${effectiveAuthoritativeSystemType.toUpperCase()} authoritative).`
          : 'Business profile loaded from cloud customer record.',
      });
    } catch (error) {
      console.error('[EnterprisePortal] Onprem business profile read error:', error);
      res.status(500).json({ error: 'Failed to read onprem business profile' });
    }
  });

  router.post("/api/enterprise/public/onprem/license-status-sync", async (req: Request, res: Response) => {
    try {
      const verified = await verifySignedOnpremPublicRequest(req);
      if (!verified.ok) {
        return res.status(verified.status).json({ error: verified.error });
      }
      const status = normalizeSystemLicenseStatus(req.body?.status);
      const reason = String(req.body?.reason || '').trim() || null;
      const enterpriseCustomerIdHint = String(req.body?.enterpriseCustomerId || '').trim() || null;
      const systemType = normalizeOnpremSystemType(req.body?.systemType);
      const hardwareKey = String(req.body?.hardwareKey || '').trim() || null;
      const hostname = String(req.body?.hostname || '').trim() || null;
      const serverBaseUrl = String(req.body?.serverBaseUrl || '').trim() || null;
      const licenseKeyData = String(req.body?.licenseKeyData || '').trim() || null;

      let enterpriseCustomerId = enterpriseCustomerIdHint;
      let resolvedSystemType = systemType;

      if (licenseKeyData) {
        try {
          const decoded = verifyAndDecodeLicenseKey(licenseKeyData);
          enterpriseCustomerId = enterpriseCustomerId || String(decoded.enterpriseCustomerId || '').trim() || null;
          resolvedSystemType = resolvedSystemType || normalizeOnpremSystemType(decoded.systemType);
        } catch {
          // Ignore decode errors; fallback identity matching below.
        }
      }

      let targetSystem: any | null = null;
      const identityClauses: any[] = [];
      if (hardwareKey) identityClauses.push(eq(enterpriseSystems.hardwareKey, hardwareKey));
      if (hostname) identityClauses.push(eq(enterpriseSystems.internalHostname, hostname));
      if (serverBaseUrl) identityClauses.push(eq(enterpriseSystems.baseUrl, serverBaseUrl));

      if (verified.enterpriseSystemId) {
        const [verifiedSystem] = await db
          .select()
          .from(enterpriseSystems)
          .where(eq(enterpriseSystems.id, verified.enterpriseSystemId))
          .limit(1);
        targetSystem = verifiedSystem || null;
        enterpriseCustomerId = targetSystem?.enterpriseCustomerId || enterpriseCustomerId;
        resolvedSystemType = normalizeOnpremSystemType(targetSystem?.systemType) || resolvedSystemType;
      }

      if (!targetSystem && enterpriseCustomerId) {
        const systems = await db
          .select()
          .from(enterpriseSystems)
          .where(eq(enterpriseSystems.enterpriseCustomerId, enterpriseCustomerId))
          .orderBy(desc(enterpriseSystems.updatedAt));
        targetSystem = systems.find((s) =>
          (resolvedSystemType ? String(s.systemType || '').toLowerCase() === resolvedSystemType : true) &&
          (
            (hardwareKey && s.hardwareKey === hardwareKey) ||
            (hostname && s.internalHostname === hostname) ||
            (serverBaseUrl && s.baseUrl === serverBaseUrl)
          ),
        ) || systems.find((s) =>
          resolvedSystemType ? String(s.systemType || '').toLowerCase() === resolvedSystemType : true,
        ) || systems[0] || null;
      } else if (identityClauses.length > 0) {
        const [matched] = await db
          .select()
          .from(enterpriseSystems)
          .where(or(...identityClauses))
          .orderBy(desc(enterpriseSystems.updatedAt))
          .limit(1);
        targetSystem = matched || null;
        enterpriseCustomerId = targetSystem?.enterpriseCustomerId || null;
      }

      if (!enterpriseCustomerId || !targetSystem) {
        return res.status(404).json({ error: 'Unable to resolve enterprise system for status sync' });
      }

      const now = new Date();
      await db
        .update(enterpriseSystems)
        .set({
          lastContactSyncAt: now,
          updatedAt: now,
        })
        .where(eq(enterpriseSystems.id, targetSystem.id));

      const licenseKeyHash = licenseKeyData
        ? crypto.createHash('sha256').update(licenseKeyData).digest('hex')
        : null;
      await upsertObservedSystemLicenseStatus({
        enterpriseSystemId: targetSystem.id,
        status,
        reason,
        source: 'onprem-license-status-sync',
        hardwareKey,
        hostname,
        serverBaseUrl,
        licenseKeyHash,
      });
      const syncAuth = await buildOnpremSyncAuthResponse({
        enterpriseSystemId: targetSystem.id,
        verification: verified,
      });

      res.json({
        success: true,
        enterpriseCustomerId,
        enterpriseSystemId: targetSystem.id,
        status: targetSystem.licenseStatus,
        authoritativeStatus: targetSystem.licenseStatus,
        observedStatus: status,
        reason,
        syncAuth,
      });
    } catch (error) {
      console.error('[EnterprisePortal] Onprem license status sync error:', error);
      res.status(500).json({ error: 'Failed to sync onprem license status' });
    }
  });

  router.post("/api/enterprise/public/course-transfer/export-authorize", async (req: Request, res: Response) => {
    try {
      const verified = await verifySignedOnpremPublicRequest(req);
      if (!verified.ok) {
        return res.status(verified.status).json({ error: verified.error });
      }
      const system = await requireActiveCourseTransferSystem(verified);
      const organizationId = String(req.body?.organizationId || '').trim();
      const courseId = String(req.body?.courseId || '').trim();
      if (!organizationId || !courseId) {
        return res.status(400).json({ error: 'organizationId and courseId are required' });
      }
      const [profileRow] = await db
        .select({ value: platformConfiguration.value })
        .from(platformConfiguration)
        .where(eq(platformConfiguration.key, profileConfigKey(system.enterpriseCustomerId)))
        .limit(1);
      const businessProfile = parseStoredBusinessProfile(profileRow?.value);
      const organizationIdentity = buildCourseTransferOrganizationIdentity(businessProfile, system.name);
      const transferPublicKeyPem = getCourseTransferPublicKeyPem();
      const transferPublicKeyId = getCourseTransferPublicKeyId(transferPublicKeyPem);

      const exportAuthorization = signCourseTransferAuthorization({
        action: 'export',
        sourceVariant: 'onprem',
        enterpriseCustomerId: system.enterpriseCustomerId,
        enterpriseSystemId: system.id,
        systemType: system.systemType,
        organizationIdentity,
        licenseGroupScope: 'enterprise_customer',
        transferPortability: {
          variants: ['cloud', 'onprem'],
          tracks: ['development', 'qa', 'production'],
          onpremImportScope: 'same_enterprise_customer',
        },
        organizationId,
        courseId,
        licenseStatus: system.licenseStatus,
        authorizedAt: new Date().toISOString(),
      });

      res.json({
        success: true,
        enterpriseCustomerId: system.enterpriseCustomerId,
        enterpriseSystemId: system.id,
        licenseStatus: system.licenseStatus,
        organizationIdentity,
        transferPublicKeyPem,
        transferPublicKeyId,
        exportAuthorization,
      });
    } catch (error: any) {
      console.error('[EnterprisePortal] Course transfer export authorization failed:', error);
      res.status(Number(error?.status || 500)).json({ error: error?.message || 'Failed to authorize course transfer export' });
    }
  });

  router.post("/api/enterprise/public/course-transfer/decrypt-key", async (req: Request, res: Response) => {
    try {
      const verified = await verifySignedOnpremPublicRequest(req);
      if (!verified.ok) {
        return res.status(verified.status).json({ error: verified.error });
      }
      const targetSystem = await requireActiveCourseTransferSystem(verified);
      const descriptor = req.body?.descriptor as ProtectedTransferDescriptor | undefined;
      if (!descriptor || descriptor.format !== 'learnplay.course-transfer.protected.v1') {
        return res.status(400).json({ error: 'Protected course package descriptor is required' });
      }
      const encryptedPayloadSha256 = String(req.body?.encryptedPayloadSha256 || '').trim();
      if (descriptor.encryptedSha256 && encryptedPayloadSha256 && descriptor.encryptedSha256 !== encryptedPayloadSha256) {
        return res.status(400).json({ error: 'Protected package integrity check failed' });
      }

      const sourceVariant = String(descriptor.source?.variant || '').trim().toLowerCase();
      if (sourceVariant === 'onprem') {
        const authPayload = verifyCourseTransferAuthorization(descriptor.exportAuthorization);
        if (String(authPayload.action || '') !== 'export') {
          return res.status(400).json({ error: 'Protected package export authorization is invalid' });
        }
        if (String(authPayload.enterpriseSystemId || '') !== String(descriptor.source?.enterpriseSystemId || '')) {
          return res.status(400).json({ error: 'Protected package source system does not match its export authorization' });
        }
        if (String(authPayload.enterpriseCustomerId || '') !== String(targetSystem.enterpriseCustomerId || '')) {
          return res.status(403).json({ error: 'On-prem course packages can only be imported into systems licensed to the same company as the source export.' });
        }
      }

      const dataKey = unwrapCourseTransferDataKeyFromDescriptor(descriptor);
      res.json({
        success: true,
        enterpriseCustomerId: targetSystem.enterpriseCustomerId,
        enterpriseSystemId: targetSystem.id,
        dataKey: dataKey.toString('base64'),
      });
    } catch (error: any) {
      console.error('[EnterprisePortal] Course transfer decrypt authorization failed:', error);
      res.status(Number(error?.status || 500)).json({ error: error?.message || 'Failed to authorize course transfer package decrypt' });
    }
  });

  router.post("/api/enterprise/public/onprem/metrics-sync", async (req: Request, res: Response) => {
    try {
      const verified = await verifySignedOnpremPublicRequest(req);
      if (!verified.ok) {
        return res.status(verified.status).json({ error: verified.error });
      }
      const licenseKeyData = String(req.body?.licenseKeyData || '').trim();
      if (!licenseKeyData) {
        return res.status(400).json({ error: 'licenseKeyData is required' });
      }

      let payload: any;
      try {
        payload = verifyAndDecodeLicenseKey(licenseKeyData);
      } catch {
        return res.status(400).json({ error: 'Invalid license key data' });
      }

      const telemetryRows = Array.isArray(req.body?.telemetry) ? req.body.telemetry : [];
      if (telemetryRows.length === 0) {
        const syncAuth = await buildOnpremSyncAuthResponse({
          enterpriseSystemId: String(req.body?.enterpriseSystemId || '').trim() || null,
          verification: verified,
        });
        return res.json({ success: true, telemetry: { rowsReceived: 0, rowsProcessed: 0 }, skipped: true, syncAuth });
      }

      const enterpriseCustomerIdHint = String(req.body?.enterpriseCustomerId || '').trim() || null;
      const enterpriseSystemIdHint = String(req.body?.enterpriseSystemId || '').trim() || null;
      const systemTypeHint = normalizeOnpremSystemType(req.body?.systemType);
      const systemTypeFromKey = normalizeOnpremSystemType(payload?.systemType);
      const resolvedSystemType = systemTypeHint || systemTypeFromKey || 'development';
      const enterpriseCustomerId = enterpriseCustomerIdHint || String(payload?.enterpriseCustomerId || '').trim() || null;
      if (!enterpriseCustomerId) {
        return res.status(400).json({ error: 'Unable to resolve enterpriseCustomerId for metrics sync' });
      }

      const hardwareKey = String(req.body?.hardwareKey || payload?.hardwareKey || '').trim() || null;
      const hostname = String(req.body?.hostname || payload?.hostname || '').trim() || null;
      const serverBaseUrl = String(req.body?.serverBaseUrl || payload?.serverBaseUrl || '').trim() || null;

      let trackedSystem: any | null = null;
      if (enterpriseSystemIdHint) {
        const [direct] = await db
          .select()
          .from(enterpriseSystems)
          .where(and(
            eq(enterpriseSystems.id, enterpriseSystemIdHint),
            eq(enterpriseSystems.enterpriseCustomerId, enterpriseCustomerId),
          ))
          .limit(1);
        trackedSystem = direct || null;
      }

      if (!trackedSystem) {
        const systems = await db
          .select()
          .from(enterpriseSystems)
          .where(eq(enterpriseSystems.enterpriseCustomerId, enterpriseCustomerId))
          .orderBy(desc(enterpriseSystems.updatedAt));

        trackedSystem = systems.find((s) =>
          String(s.systemType || '').toLowerCase() === resolvedSystemType &&
          (
            (hardwareKey && s.hardwareKey === hardwareKey) ||
            (hostname && s.internalHostname === hostname) ||
            (serverBaseUrl && s.baseUrl === serverBaseUrl)
          ),
        ) || systems.find((s) => String(s.systemType || '').toLowerCase() === resolvedSystemType) || systems[0] || null;
      }

      if (!trackedSystem) {
        return res.status(404).json({ error: 'Unable to resolve enterprise system for metrics sync' });
      }

      const [customerRow] = await db
        .select({ royaltyPercentage: enterpriseCustomers.royaltyPercentage })
        .from(enterpriseCustomers)
        .where(eq(enterpriseCustomers.id, enterpriseCustomerId))
        .limit(1);
      const [systemRoyaltyConfig] = await db
        .select({ value: platformConfiguration.value })
        .from(platformConfiguration)
        .where(eq(platformConfiguration.key, `ENTERPRISE_SYSTEM_ROYALTY_${trackedSystem.id}`))
        .limit(1);
      const now = new Date();
      const rowsProcessed = await ingestOnpremTelemetryRows({
        enterpriseCustomerId,
        trackedSystemId: trackedSystem.id,
        requestSystemType: resolvedSystemType,
        trackedServerBaseUrl: serverBaseUrl || trackedSystem.baseUrl || null,
        trackedHostname: hostname || trackedSystem.internalHostname || null,
        customerRoyaltyPercentage: customerRow?.royaltyPercentage,
        systemRoyaltyConfigValue: systemRoyaltyConfig?.value,
        payloadFeeCurrency: payload?.feeCurrency,
        telemetryRows,
        now,
      });

      res.json({
        success: true,
        enterpriseCustomerId,
        enterpriseSystemId: trackedSystem.id,
        syncAuth: await buildOnpremSyncAuthResponse({
          enterpriseSystemId: trackedSystem.id,
          verification: verified,
        }),
        telemetry: {
          rowsReceived: telemetryRows.length,
          rowsProcessed,
          updatedAt: now.toISOString(),
        },
      });
    } catch (error) {
      console.error('[EnterprisePortal] Onprem metrics sync error:', error);
      res.status(500).json({ error: 'Failed to sync onprem metrics' });
    }
  });

  router.post("/api/enterprise/public/internal/license-context-mirror", async (req: Request, res: Response) => {
    try {
      const providedKey = String(req.headers['x-enterprise-license-context-mirror-key'] || '').trim();
      const expectedKey = getLicenseContextMirrorKey();
      if (!isValidMirrorKeyConfig()) {
        return res.status(503).json({ error: 'License context mirror key is not configured' });
      }
      if (!providedKey || !constantTimeMirrorKeyMatch(expectedKey, providedKey)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const customer = req.body?.customer;
      const system = req.body?.system;
      const licenseRequest = req.body?.licenseRequest || null;
      const licenseKey = req.body?.licenseKey || null;
      const businessProfileConfig = req.body?.businessProfileConfig || null;
      const systemRoyaltyConfig = req.body?.systemRoyaltyConfig || null;

      const customerId = String(customer?.id || '').trim();
      const systemId = String(system?.id || '').trim();
      if (!customerId || !systemId) {
        return res.status(400).json({ error: 'customer.id and system.id are required' });
      }

      const customerEmail = String(customer?.email || '').trim().toLowerCase();
      const customerPasswordHash = String(customer?.passwordHash || '').trim();
      const customerCompanyName = String(customer?.companyName || '').trim();
      const customerContactPersonName = String(customer?.contactPersonName || '').trim();
      const customerContactEmail = String(customer?.contactEmail || '').trim().toLowerCase();
      if (!customerEmail || !customerPasswordHash || !customerCompanyName || !customerContactPersonName || !customerContactEmail) {
        return res.status(400).json({ error: 'customer payload missing required fields' });
      }

      await db
        .insert(enterpriseCustomers)
        .values({
          id: customerId,
          email: customerEmail,
          passwordHash: customerPasswordHash,
          companyName: customerCompanyName,
          contactPersonName: customerContactPersonName,
          contactEmail: customerContactEmail,
          contactMobile: customer?.contactMobile || null,
          companyAddress: customer?.companyAddress || null,
          country: customer?.country || null,
          royaltyPercentage: String(customer?.royaltyPercentage || '0'),
          status: String(customer?.status || 'active'),
          emailVerified: customer?.emailVerified === true,
          emailVerificationToken: customer?.emailVerificationToken || null,
          emailVerificationExpiry: toDateOrNull(customer?.emailVerificationExpiry),
          accountActivatedAt: toDateOrNull(customer?.accountActivatedAt),
          parentEnterpriseId: customer?.parentEnterpriseId || null,
          createdAt: toDateOrNull(customer?.createdAt) || new Date(),
          updatedAt: new Date(),
        } as any)
        .onConflictDoUpdate({
          target: [enterpriseCustomers.id],
          set: {
            email: customerEmail,
            passwordHash: customerPasswordHash,
            companyName: customerCompanyName,
            contactPersonName: customerContactPersonName,
            contactEmail: customerContactEmail,
            contactMobile: customer?.contactMobile || null,
            companyAddress: customer?.companyAddress || null,
            country: customer?.country || null,
            royaltyPercentage: String(customer?.royaltyPercentage || '0'),
            status: String(customer?.status || 'active'),
            emailVerified: customer?.emailVerified === true,
            emailVerificationToken: customer?.emailVerificationToken || null,
            emailVerificationExpiry: toDateOrNull(customer?.emailVerificationExpiry),
            accountActivatedAt: toDateOrNull(customer?.accountActivatedAt),
            parentEnterpriseId: customer?.parentEnterpriseId || null,
            updatedAt: new Date(),
          } as any,
        });

      if (licenseRequest?.id) {
        await db
          .insert(enterpriseLicenseRequests)
          .values({
            id: String(licenseRequest.id),
            enterpriseCustomerId: customerId,
            requestData: String(licenseRequest.requestData || '{}'),
            hardwareKey: licenseRequest.hardwareKey || null,
            hostname: licenseRequest.hostname || null,
            serverBaseUrl: licenseRequest.serverBaseUrl || null,
            systemType: String(licenseRequest.systemType || system.systemType || 'development'),
            status: String(licenseRequest.status || 'approved'),
            denialReason: licenseRequest.denialReason || null,
            monthlyFee: licenseRequest.monthlyFee ? String(licenseRequest.monthlyFee) : null,
            feeCurrency: licenseRequest.feeCurrency || null,
            requestType: String(licenseRequest.requestType || 'initial'),
            autoApproveRenewals: licenseRequest.autoApproveRenewals === true,
            autoApproveDisabledAt: toDateOrNull(licenseRequest.autoApproveDisabledAt),
            autoApproveDisabledBy: licenseRequest.autoApproveDisabledBy || null,
            autoApproveDisableReason: licenseRequest.autoApproveDisableReason || null,
            graceDays: Number(licenseRequest.graceDays || 15),
            billingStatus: String(licenseRequest.billingStatus || 'due'),
            billingNotes: licenseRequest.billingNotes || null,
            lastCheckInAt: toDateOrNull(licenseRequest.lastCheckInAt),
            lastRenewedAt: toDateOrNull(licenseRequest.lastRenewedAt),
            nextRenewalDueAt: toDateOrNull(licenseRequest.nextRenewalDueAt),
            reminder5SentAt: toDateOrNull(licenseRequest.reminder5SentAt),
            reminder3SentAt: toDateOrNull(licenseRequest.reminder3SentAt),
            reminder1SentAt: toDateOrNull(licenseRequest.reminder1SentAt),
            overdueNoticeSentAt: toDateOrNull(licenseRequest.overdueNoticeSentAt),
            reviewedBy: licenseRequest.reviewedBy || null,
            reviewedAt: toDateOrNull(licenseRequest.reviewedAt),
            updatedAt: new Date(),
            createdAt: toDateOrNull(licenseRequest.createdAt) || new Date(),
          } as any)
          .onConflictDoUpdate({
            target: [enterpriseLicenseRequests.id],
            set: {
              enterpriseCustomerId: customerId,
              requestData: String(licenseRequest.requestData || '{}'),
              hardwareKey: licenseRequest.hardwareKey || null,
              hostname: licenseRequest.hostname || null,
              serverBaseUrl: licenseRequest.serverBaseUrl || null,
              systemType: String(licenseRequest.systemType || system.systemType || 'development'),
              status: String(licenseRequest.status || 'approved'),
              denialReason: licenseRequest.denialReason || null,
              monthlyFee: licenseRequest.monthlyFee ? String(licenseRequest.monthlyFee) : null,
              feeCurrency: licenseRequest.feeCurrency || null,
              requestType: String(licenseRequest.requestType || 'initial'),
              autoApproveRenewals: licenseRequest.autoApproveRenewals === true,
              autoApproveDisabledAt: toDateOrNull(licenseRequest.autoApproveDisabledAt),
              autoApproveDisabledBy: licenseRequest.autoApproveDisabledBy || null,
              autoApproveDisableReason: licenseRequest.autoApproveDisableReason || null,
              graceDays: Number(licenseRequest.graceDays || 15),
              billingStatus: String(licenseRequest.billingStatus || 'due'),
              billingNotes: licenseRequest.billingNotes || null,
              lastCheckInAt: toDateOrNull(licenseRequest.lastCheckInAt),
              lastRenewedAt: toDateOrNull(licenseRequest.lastRenewedAt),
              nextRenewalDueAt: toDateOrNull(licenseRequest.nextRenewalDueAt),
              reminder5SentAt: toDateOrNull(licenseRequest.reminder5SentAt),
              reminder3SentAt: toDateOrNull(licenseRequest.reminder3SentAt),
              reminder1SentAt: toDateOrNull(licenseRequest.reminder1SentAt),
              overdueNoticeSentAt: toDateOrNull(licenseRequest.overdueNoticeSentAt),
              reviewedBy: licenseRequest.reviewedBy || null,
              reviewedAt: toDateOrNull(licenseRequest.reviewedAt),
              updatedAt: new Date(),
            } as any,
          });
      }

      if (licenseKey?.id && licenseKey?.licenseRequestId) {
        await db
          .insert(enterpriseLicenseKeys)
          .values({
            id: String(licenseKey.id),
            licenseId: String(licenseKey.licenseId || ''),
            licenseRequestId: String(licenseKey.licenseRequestId),
            enterpriseCustomerId: customerId,
            encryptedKeyData: String(licenseKey.encryptedKeyData || ''),
            systemType: String(licenseKey.systemType || system.systemType || 'development'),
            issuedReason: String(licenseKey.issuedReason || 'initial'),
            renewalSequence: Number(licenseKey.renewalSequence || 1),
            issuedAt: toDateOrNull(licenseKey.issuedAt) || new Date(),
            expiresAt: toDateOrNull(licenseKey.expiresAt) || new Date(),
            downloadedAt: toDateOrNull(licenseKey.downloadedAt),
            lastCheckInAt: toDateOrNull(licenseKey.lastCheckInAt),
            checkInCount: Number(licenseKey.checkInCount || 0),
            isRevoked: licenseKey.isRevoked === true,
            revokedAt: toDateOrNull(licenseKey.revokedAt),
            revokedReason: licenseKey.revokedReason || null,
            createdAt: toDateOrNull(licenseKey.createdAt) || new Date(),
          } as any)
          .onConflictDoUpdate({
            target: [enterpriseLicenseKeys.id],
            set: {
              licenseId: String(licenseKey.licenseId || ''),
              licenseRequestId: String(licenseKey.licenseRequestId),
              enterpriseCustomerId: customerId,
              encryptedKeyData: String(licenseKey.encryptedKeyData || ''),
              systemType: String(licenseKey.systemType || system.systemType || 'development'),
              issuedReason: String(licenseKey.issuedReason || 'initial'),
              renewalSequence: Number(licenseKey.renewalSequence || 1),
              issuedAt: toDateOrNull(licenseKey.issuedAt) || new Date(),
              expiresAt: toDateOrNull(licenseKey.expiresAt) || new Date(),
              downloadedAt: toDateOrNull(licenseKey.downloadedAt),
              lastCheckInAt: toDateOrNull(licenseKey.lastCheckInAt),
              checkInCount: Number(licenseKey.checkInCount || 0),
              isRevoked: licenseKey.isRevoked === true,
              revokedAt: toDateOrNull(licenseKey.revokedAt),
              revokedReason: licenseKey.revokedReason || null,
            } as any,
          });
      }

      await db
        .insert(enterpriseSystems)
        .values({
          id: systemId,
          enterpriseCustomerId: customerId,
          name: String(system?.name || `${String(system?.systemType || 'SYSTEM').toUpperCase()} ${String(system?.internalHostname || system?.baseUrl || 'OnPrem')}`),
          systemType: String(system?.systemType || 'development'),
          baseUrl: system?.baseUrl || null,
          internalHostname: system?.internalHostname || null,
          cpu: system?.cpu || null,
          memory: system?.memory || null,
          appPort: Number(system?.appPort || 3000),
          dbPort: Number(system?.dbPort || 5432),
          nginxHttpPort: Number(system?.nginxHttpPort || 80),
          nginxHttpsPort: Number(system?.nginxHttpsPort || 443),
          hardwareKey: system?.hardwareKey || null,
          activeLicenseRequestId: system?.activeLicenseRequestId || licenseRequest?.id || null,
          activeLicenseKeyId: system?.activeLicenseKeyId || licenseKey?.id || null,
          licenseStatus: String(system?.licenseStatus || 'active'),
          licenseExpiresAt: toDateOrNull(system?.licenseExpiresAt),
          lastCheckInAt: toDateOrNull(system?.lastCheckInAt),
          nextCheckInDueAt: toDateOrNull(system?.nextCheckInDueAt),
          lastTelemetryAt: toDateOrNull(system?.lastTelemetryAt),
          alertEmails: system?.alertEmails || null,
          lastContactSyncAt: toDateOrNull(system?.lastContactSyncAt),
          autoApproveRenewals: system?.autoApproveRenewals === true,
          graceDays: Number(system?.graceDays || 15),
          billingStatus: String(system?.billingStatus || 'due'),
          monthlyFee: system?.monthlyFee ? String(system.monthlyFee) : null,
          feeCurrency: system?.feeCurrency || null,
          status: String(system?.status || 'active'),
          createdAt: toDateOrNull(system?.createdAt) || new Date(),
          updatedAt: new Date(),
        } as any)
        .onConflictDoUpdate({
          target: [enterpriseSystems.id],
          set: {
            enterpriseCustomerId: customerId,
            name: String(system?.name || `${String(system?.systemType || 'SYSTEM').toUpperCase()} ${String(system?.internalHostname || system?.baseUrl || 'OnPrem')}`),
            systemType: String(system?.systemType || 'development'),
            baseUrl: system?.baseUrl || null,
            internalHostname: system?.internalHostname || null,
            cpu: system?.cpu || null,
            memory: system?.memory || null,
            appPort: Number(system?.appPort || 3000),
            dbPort: Number(system?.dbPort || 5432),
            nginxHttpPort: Number(system?.nginxHttpPort || 80),
            nginxHttpsPort: Number(system?.nginxHttpsPort || 443),
            hardwareKey: system?.hardwareKey || null,
            activeLicenseRequestId: system?.activeLicenseRequestId || licenseRequest?.id || null,
            activeLicenseKeyId: system?.activeLicenseKeyId || licenseKey?.id || null,
            licenseStatus: String(system?.licenseStatus || 'active'),
            licenseExpiresAt: toDateOrNull(system?.licenseExpiresAt),
            lastCheckInAt: toDateOrNull(system?.lastCheckInAt),
            nextCheckInDueAt: toDateOrNull(system?.nextCheckInDueAt),
            lastTelemetryAt: toDateOrNull(system?.lastTelemetryAt),
            alertEmails: system?.alertEmails || null,
            lastContactSyncAt: toDateOrNull(system?.lastContactSyncAt),
            autoApproveRenewals: system?.autoApproveRenewals === true,
            graceDays: Number(system?.graceDays || 15),
            billingStatus: String(system?.billingStatus || 'due'),
            monthlyFee: system?.monthlyFee ? String(system.monthlyFee) : null,
            feeCurrency: system?.feeCurrency || null,
            status: String(system?.status || 'active'),
            updatedAt: new Date(),
          } as any,
        });

      const upsertPlatformConfigWithConstraintFallback = async (params: {
        key: string;
        value: string;
        dataType: string;
        description: string;
      }) => {
        try {
          await db
            .insert(platformConfiguration)
            .values({
              key: params.key,
              value: params.value,
              dataType: params.dataType,
              description: params.description,
              isEditable: false,
            })
            .onConflictDoUpdate({
              target: [platformConfiguration.key],
              set: {
                value: params.value,
                dataType: params.dataType,
                description: params.description,
                updatedAt: new Date(),
              },
            });
          return;
        } catch (error: any) {
          const message = String(error?.message || "");
          if (!message.includes("no unique or exclusion constraint matching")) {
            throw error;
          }
        }

        const existing = await db
          .select({ id: platformConfiguration.id })
          .from(platformConfiguration)
          .where(eq(platformConfiguration.key, params.key))
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(platformConfiguration)
            .set({
              value: params.value,
              dataType: params.dataType,
              description: params.description,
              updatedAt: new Date(),
            })
            .where(eq(platformConfiguration.id, existing[0].id));
          return;
        }

        await db
          .insert(platformConfiguration)
          .values({
            key: params.key,
            value: params.value,
            dataType: params.dataType,
            description: params.description,
            isEditable: false,
          });
      };

      if (businessProfileConfig?.key && businessProfileConfig?.value) {
        await upsertPlatformConfigWithConstraintFallback({
          key: String(businessProfileConfig.key),
          value: String(businessProfileConfig.value),
          dataType: String(businessProfileConfig.dataType || 'json'),
          description: String(businessProfileConfig.description || 'Enterprise business profile mirror from cloud PRD'),
        });
      }

      if (systemRoyaltyConfig?.key && systemRoyaltyConfig?.value !== undefined) {
        await upsertPlatformConfigWithConstraintFallback({
          key: String(systemRoyaltyConfig.key),
          value: String(systemRoyaltyConfig.value),
          dataType: String(systemRoyaltyConfig.dataType || 'string'),
          description: String(systemRoyaltyConfig.description || 'System royalty mirror from cloud PRD'),
        });
      }

      res.json({ success: true, mirroredAt: new Date().toISOString(), customerId, systemId });
    } catch (error) {
      console.error('[EnterprisePortal] Internal license context mirror failed:', error);
      res.status(500).json({ error: 'Failed to mirror license context' });
    }
  });

  router.post("/api/enterprise/public/onprem/request-reissue", async (req: Request, res: Response) => {
    try {
      const verified = await verifySignedOnpremPublicRequest(req);
      if (!verified.ok) {
        return res.status(verified.status).json({ error: verified.error });
      }
      const licenseKeyData = String(req.body?.licenseKeyData || '').trim();
      const reason = String(req.body?.reason || 'Business identity changed').trim();
      const changedFields = Array.isArray(req.body?.changedFields)
        ? req.body.changedFields.map((v: any) => String(v || '').trim()).filter(Boolean)
        : [];
      const enterpriseCustomerIdHint = String(req.body?.enterpriseCustomerId || '').trim() || null;
      const systemTypeHint = normalizeOnpremSystemType(req.body?.systemType);
      const businessProfile = normalizeBusinessProfile(req.body?.businessProfile);
      const hardwareKey = String(req.body?.hardwareKey || '').trim() || null;
      const hostname = String(req.body?.hostname || '').trim() || null;
      const serverBaseUrl = String(req.body?.serverBaseUrl || '').trim() || null;

      if (!licenseKeyData) {
        return res.status(400).json({ error: 'licenseKeyData is required' });
      }

      let payload: any;
      try {
        payload = verifyAndDecodeLicenseKey(licenseKeyData);
      } catch {
        return res.status(400).json({ error: 'Invalid license key data' });
      }

      const resolvedSystemType = normalizeOnpremSystemType(payload?.systemType) || systemTypeHint;
      if (!resolvedSystemType) {
        return res.status(400).json({ error: 'Could not resolve systemType (development/qa/production)' });
      }

      let customerId = enterpriseCustomerIdHint;
      if (!customerId && payload?.enterpriseCustomerId) {
        customerId = String(payload.enterpriseCustomerId);
      }

      if (!customerId) {
        const [knownLicense] = await db
          .select({
            enterpriseCustomerId: enterpriseLicenseKeys.enterpriseCustomerId,
          })
          .from(enterpriseLicenseKeys)
          .where(eq(enterpriseLicenseKeys.licenseId, String(payload.licenseId || '')))
          .limit(1);
        customerId = knownLicense?.enterpriseCustomerId || null;
      }

      if (!customerId) {
        return res.status(404).json({ error: 'Could not resolve enterprise customer for reissue request' });
      }

      const [customer] = await db
        .select({
          id: enterpriseCustomers.id,
          status: enterpriseCustomers.status,
        })
        .from(enterpriseCustomers)
        .where(eq(enterpriseCustomers.id, customerId))
        .limit(1);

      if (!customer) {
        return res.status(404).json({ error: 'Enterprise customer not found' });
      }
      if (String(customer.status || '').toLowerCase() === 'suspended') {
        return res.status(403).json({ error: 'Enterprise customer is suspended' });
      }

      const pendingFilters: any[] = [
        eq(enterpriseLicenseRequests.enterpriseCustomerId, customerId),
        eq(enterpriseLicenseRequests.systemType, resolvedSystemType),
        eq(enterpriseLicenseRequests.requestType, 'replacement'),
        eq(enterpriseLicenseRequests.status, 'pending'),
      ];
      if (payload?.hardwareKey || hardwareKey) {
        pendingFilters.push(eq(enterpriseLicenseRequests.hardwareKey, String(payload?.hardwareKey || hardwareKey)));
      }
      if (payload?.hostname || hostname) {
        pendingFilters.push(eq(enterpriseLicenseRequests.hostname, String(payload?.hostname || hostname)));
      }
      if (payload?.serverBaseUrl || serverBaseUrl) {
        pendingFilters.push(eq(enterpriseLicenseRequests.serverBaseUrl, String(payload?.serverBaseUrl || serverBaseUrl)));
      }

      const [existingPending] = await db
        .select()
        .from(enterpriseLicenseRequests)
        .where(and(...pendingFilters))
        .orderBy(desc(enterpriseLicenseRequests.createdAt))
        .limit(1);

      if (existingPending) {
        const syncAuth = await buildOnpremSyncAuthResponse({
          enterpriseSystemId: String(req.body?.enterpriseSystemId || '').trim() || null,
          verification: verified,
        });
        return res.json({
          success: true,
          reused: true,
          request: {
            id: existingPending.id,
            status: existingPending.status,
            requestType: existingPending.requestType,
            systemType: existingPending.systemType,
            createdAt: existingPending.createdAt,
          },
          syncAuth,
          message: 'A pending replacement request already exists for this system.',
        });
      }

      const requestData = JSON.stringify({
        generatedBy: 'onprem_reissue_request',
        generatedAt: new Date().toISOString(),
        reason,
        changedFields,
        businessProfile,
        identity: {
          hardwareKey: payload?.hardwareKey || hardwareKey || null,
          hostname: payload?.hostname || hostname || null,
          serverBaseUrl: payload?.serverBaseUrl || serverBaseUrl || null,
        },
      });

      const [request] = await db
        .insert(enterpriseLicenseRequests)
        .values({
          enterpriseCustomerId: customerId,
          requestData,
          hardwareKey: payload?.hardwareKey || hardwareKey || null,
          hostname: payload?.hostname || hostname || null,
          serverBaseUrl: payload?.serverBaseUrl || serverBaseUrl || null,
          systemType: resolvedSystemType,
          status: 'pending',
          requestType: 'replacement',
          monthlyFee: String(payload?.monthlyFee || '0'),
          feeCurrency: String(payload?.feeCurrency || 'USD'),
          autoApproveRenewals: false,
          graceDays: 15,
          billingStatus: 'due',
        })
        .returning();

      await ensurePendingEnterpriseSystemBinding({
        enterpriseCustomerId: customerId,
        systemType: resolvedSystemType,
        enterpriseSystemIdHint: String(req.body?.enterpriseSystemId || '').trim() || null,
        hardwareKey: String(payload?.hardwareKey || hardwareKey || '').trim() || null,
        hostname: String(payload?.hostname || hostname || '').trim() || null,
        serverBaseUrl: String(payload?.serverBaseUrl || serverBaseUrl || '').trim() || null,
        requestId: request.id,
        autoApproveRenewals: false,
        graceDays: 15,
        monthlyFee: String(payload?.monthlyFee || '0'),
        feeCurrency: String(payload?.feeCurrency || 'USD'),
        billingStatus: 'due',
        licenseStatus: 'reissue_required',
      });

      res.status(201).json({
        success: true,
        reused: false,
        request: {
          id: request.id,
          status: request.status,
          requestType: request.requestType,
          systemType: request.systemType,
          createdAt: request.createdAt,
        },
        syncAuth: await buildOnpremSyncAuthResponse({
          enterpriseSystemId: String(req.body?.enterpriseSystemId || '').trim() || null,
          verification: verified,
        }),
        message: 'Replacement request submitted and awaiting SuperAdmin approval.',
      });
    } catch (error) {
      console.error('[EnterprisePortal] Onprem reissue request error:', error);
      res.status(500).json({ error: 'Failed to submit reissue request' });
    }
  });

  // ==================== PUBLIC ON-PREM CHECK-IN & TELEMETRY ====================
  // Auth model: valid signed license key is treated as machine identity.
  router.post("/api/enterprise/public/onprem/check-in", async (req: Request, res: Response) => {
    try {
      const verified = await verifySignedOnpremPublicRequest(req);
      if (!verified.ok) {
        return res.status(verified.status).json({ error: verified.error });
      }
      const licenseKeyData = String(req.body?.licenseKeyData || '').trim();
      if (!licenseKeyData) {
        return res.status(400).json({ error: 'licenseKeyData is required' });
      }

      let payload;
      try {
        payload = verifyAndDecodeLicenseKey(licenseKeyData);
      } catch (error) {
        return res.status(400).json({ error: 'Invalid license key data' });
      }
      const licenseKeyHash = crypto.createHash('sha256').update(licenseKeyData).digest('hex');
      const parsedLicenseId = String(payload.licenseId || '').trim();
      const revocationKeys = [
        ...(parsedLicenseId ? [revokedLicenseByIdConfigKey(parsedLicenseId)] : []),
        revokedLicenseByHashConfigKey(licenseKeyHash),
      ];
      if (revocationKeys.length > 0) {
        const revocationRows = await db
          .select({ key: platformConfiguration.key, value: platformConfiguration.value })
          .from(platformConfiguration)
          .where(inArray(platformConfiguration.key, revocationKeys));
        if (revocationRows.length > 0) {
          const matched = (parsedLicenseId
            ? revocationRows.find((row) => row.key === revokedLicenseByIdConfigKey(parsedLicenseId))
            : null)
            || revocationRows[0];
          const tombstone = parseRevocationTombstone(matched?.value || null);
          // Recovery path:
          // When SuperAdmin intentionally deletes a system license, on-prem may still present
          // the previously installed key on next check-in. If system policy explicitly allows
          // auto-approval, issue a fresh replacement key instead of hard-failing as revoked.
          const payloadSystemType = normalizeOnpremSystemType(payload.systemType);
          const payloadCustomerId = String(payload.enterpriseCustomerId || '').trim();
          const hintedEnterpriseSystemId = String(req.body?.enterpriseSystemId || '').trim() || null;
          if (payloadSystemType && payloadCustomerId) {
            const systemCandidates = await db
              .select()
              .from(enterpriseSystems)
              .where(and(
                eq(enterpriseSystems.enterpriseCustomerId, payloadCustomerId),
                eq(enterpriseSystems.systemType, payloadSystemType),
              ))
              .orderBy(desc(enterpriseSystems.updatedAt));

            const normalizedHardware = normalizeIdentityValue(payload.hardwareKey);
            const normalizedHostname = normalizeIdentityValue(payload.hostname);
            const normalizedBaseUrl = normalizeIdentityValue(payload.serverBaseUrl);

            const matchedSystem = systemCandidates.find((system) => {
              if (hintedEnterpriseSystemId && system.id === hintedEnterpriseSystemId) return true;
              if (normalizedHardware && normalizeIdentityValue(system.hardwareKey) === normalizedHardware) return true;
              if (normalizedHostname && normalizeIdentityValue(system.internalHostname) === normalizedHostname) return true;
              if (normalizedBaseUrl && normalizeIdentityValue(system.baseUrl) === normalizedBaseUrl) return true;
              return false;
            }) || null;

            if (matchedSystem) {
              const [customer] = await db
                .select()
                .from(enterpriseCustomers)
                .where(eq(enterpriseCustomers.id, payloadCustomerId))
                .limit(1);

              const customerSuspended = String(customer?.status || '').trim().toLowerCase() === 'suspended';
              const billingStatus = String(matchedSystem.billingStatus || 'due').trim().toLowerCase();
              const canAutoReplace =
                matchedSystem.autoApproveRenewals === true &&
                ['paid', 'waived'].includes(billingStatus) &&
                !customerSuspended;

              if (canAutoReplace) {
                const now = new Date();
                const expiresAt = endOfCalendarMonth(now);
                const graceDays = matchedSystem.graceDays && matchedSystem.graceDays >= 0 ? matchedSystem.graceDays : 15;

                const [latestRequest] = await db
                  .select()
                  .from(enterpriseLicenseRequests)
                  .where(and(
                    eq(enterpriseLicenseRequests.enterpriseCustomerId, payloadCustomerId),
                    eq(enterpriseLicenseRequests.systemType, payloadSystemType),
                  ))
                  .orderBy(desc(enterpriseLicenseRequests.updatedAt))
                  .limit(1);

                let requestId = latestRequest?.id || null;
                if (!latestRequest) {
                  const [createdRequest] = await db
                    .insert(enterpriseLicenseRequests)
                    .values({
                      enterpriseCustomerId: payloadCustomerId,
                      requestData: JSON.stringify({
                        generatedBy: 'onprem_checkin_revocation_recovery',
                        generatedAt: now.toISOString(),
                        source: 'cloud-control-plane',
                        reason: tombstone.reason || 'Previous key revoked; replacement issued via check-in',
                      }),
                      hardwareKey: payload.hardwareKey || matchedSystem.hardwareKey || null,
                      hostname: payload.hostname || matchedSystem.internalHostname || null,
                      serverBaseUrl: payload.serverBaseUrl || matchedSystem.baseUrl || null,
                      systemType: payloadSystemType,
                      status: 'approved',
                      requestType: 'replacement',
                      monthlyFee: String(matchedSystem.monthlyFee || payload.monthlyFee || '0'),
                      feeCurrency: String(matchedSystem.feeCurrency || payload.feeCurrency || 'USD'),
                      autoApproveRenewals: true,
                      graceDays,
                      billingStatus,
                      reviewedAt: now,
                      reviewedBy: 'system-onprem-checkin-recovery',
                      lastRenewedAt: now,
                      nextRenewalDueAt: expiresAt,
                    })
                    .returning();
                  requestId = createdRequest.id;
                } else {
                  const [updatedRequest] = await db
                    .update(enterpriseLicenseRequests)
                    .set({
                      status: 'approved',
                      requestType: 'replacement',
                      hardwareKey: payload.hardwareKey || matchedSystem.hardwareKey || latestRequest.hardwareKey || null,
                      hostname: payload.hostname || matchedSystem.internalHostname || latestRequest.hostname || null,
                      serverBaseUrl: payload.serverBaseUrl || matchedSystem.baseUrl || latestRequest.serverBaseUrl || null,
                      monthlyFee: String(matchedSystem.monthlyFee || latestRequest.monthlyFee || payload.monthlyFee || '0'),
                      feeCurrency: String(matchedSystem.feeCurrency || latestRequest.feeCurrency || payload.feeCurrency || 'USD'),
                      autoApproveRenewals: true,
                      graceDays,
                      billingStatus,
                      denialReason: null,
                      reviewedAt: now,
                      reviewedBy: 'system-onprem-checkin-recovery',
                      updatedAt: now,
                    })
                    .where(eq(enterpriseLicenseRequests.id, latestRequest.id))
                    .returning();
                  requestId = updatedRequest.id;
                }

                const [latestKey] = await db
                  .select()
                  .from(enterpriseLicenseKeys)
                  .where(and(
                    eq(enterpriseLicenseKeys.enterpriseCustomerId, payloadCustomerId),
                    eq(enterpriseLicenseKeys.systemType, payloadSystemType),
                  ))
                  .orderBy(desc(enterpriseLicenseKeys.createdAt))
                  .limit(1);

                const renewalSequence = Number(latestKey?.renewalSequence || payload.renewalSequence || 0) + 1;
                const licenseId = `LIC-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
                const monthlyFee = String(matchedSystem.monthlyFee || payload.monthlyFee || '0');
                const feeCurrency = String(matchedSystem.feeCurrency || payload.feeCurrency || 'USD');
                const issuedKeyData = signLicenseKey({
                  licenseId,
                  enterpriseCustomerId: payloadCustomerId,
                  hardwareKey: payload.hardwareKey || matchedSystem.hardwareKey || '',
                  hostname: payload.hostname || matchedSystem.internalHostname || '',
                  serverBaseUrl: payload.serverBaseUrl || matchedSystem.baseUrl || '',
                  systemType: payloadSystemType,
                  issuedAt: now.toISOString(),
                  expiresAt: expiresAt.toISOString(),
                  monthlyFee,
                  feeCurrency,
                  companyName: customer?.companyName || payload.companyName || '',
                  renewalSequence,
                  issuedReason: 'replacement',
                  graceDays,
                  autoApproveRenewals: true,
                  nextRenewalDueAt: expiresAt.toISOString(),
                  issuedBy: 'system-onprem-checkin-recovery',
                });

                const [createdKey] = await db
                  .insert(enterpriseLicenseKeys)
                  .values({
                    licenseId,
                    licenseRequestId: requestId!,
                    enterpriseCustomerId: payloadCustomerId,
                    encryptedKeyData: issuedKeyData,
                    systemType: payloadSystemType,
                    issuedReason: 'replacement',
                    renewalSequence,
                    issuedAt: now,
                    expiresAt,
                    isRevoked: false,
                  })
                  .returning();

                const trackedSystem = await upsertSystemLicenseSnapshot({
                  enterpriseCustomerId: payloadCustomerId,
                  systemType: payloadSystemType,
                  hardwareKey: payload.hardwareKey || matchedSystem.hardwareKey || null,
                  hostname: payload.hostname || matchedSystem.internalHostname || null,
                  serverBaseUrl: payload.serverBaseUrl || matchedSystem.baseUrl || null,
                  licenseRequestId: requestId!,
                  licenseKeyId: createdKey.id,
                  expiresAt,
                  autoApproveRenewals: true,
                  graceDays,
                  monthlyFee,
                  feeCurrency,
                  billingStatus,
                });

                await setEnterpriseSystemLicenseReason(trackedSystem.id, 'active', null);

                return res.json({
                  valid: true,
                  status: 'active',
                  registrationStatus: 'registered',
                  enterpriseCustomerId: payloadCustomerId,
                  enterpriseSystemId: trackedSystem.id,
                  decisionVersion: now.toISOString(),
                  expiresAt: expiresAt.toISOString(),
                  daysUntilExpiry: Math.floor((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
                  overdueDays: 0,
                  graceDays,
                  warningLevels: {
                    d5: false,
                    d3: false,
                    d1: false,
                  },
                  renewal: {
                    issued: true,
                    licenseKeyData: issuedKeyData,
                    expiresAt: expiresAt.toISOString(),
                  },
                });
              }

              if (customerSuspended) {
                return res.status(403).json({
                  error: 'Enterprise customer is suspended. License replacement is blocked.',
                  status: 'suspended',
                });
              }
            }
          }

          return res.status(403).json({
            error: tombstone.reason || 'License key has been revoked by cloud control plane',
            status: 'revoked',
          });
        }
      }
      const businessProfile = normalizeBusinessProfile(req.body?.businessProfile);

      let [licenseRow] = await db
        .select()
        .from(enterpriseLicenseKeys)
        .where(eq(enterpriseLicenseKeys.licenseId, payload.licenseId))
        .limit(1);

      // Backward-compatibility path for legacy rows that predate licenseId storage.
      if (!licenseRow) {
        const [legacyRow] = await db
          .select()
          .from(enterpriseLicenseKeys)
          .where(eq(enterpriseLicenseKeys.encryptedKeyData, licenseKeyData))
          .limit(1);

        if (legacyRow) {
          licenseRow = legacyRow;
          if (!legacyRow.licenseId) {
            try {
              await db
                .update(enterpriseLicenseKeys)
                .set({ licenseId: payload.licenseId })
                .where(eq(enterpriseLicenseKeys.id, legacyRow.id));
            } catch (backfillError) {
              // Non-fatal: continue processing with matched legacy row.
              console.warn('[EnterprisePortal] Legacy licenseId backfill failed:', backfillError);
            }
          }
        }
      }

      let recoveredPendingRequestId: string | null = null;

      // Self-healing path:
      // if the signed key is valid but metadata rows were deleted in control plane,
      // recover by re-linking to a resolvable enterprise customer and recreating
      // minimal request/key records.
      if (!licenseRow) {
        const now = new Date();
        let recoveredCustomer: any = null;

        if (payload.enterpriseCustomerId) {
          const [byId] = await db
            .select()
            .from(enterpriseCustomers)
            .where(eq(enterpriseCustomers.id, payload.enterpriseCustomerId))
            .limit(1);
          recoveredCustomer = byId || null;
        }

        if (!recoveredCustomer && businessProfile?.businessName) {
          const matches = await db
            .select()
            .from(enterpriseCustomers)
            .where(eq(enterpriseCustomers.companyName, businessProfile.businessName))
            .orderBy(desc(enterpriseCustomers.updatedAt));
          if (matches.length === 1) {
            recoveredCustomer = matches[0];
          }
        }

        if (!recoveredCustomer && payload.companyName) {
          const matches = await db
            .select()
            .from(enterpriseCustomers)
            .where(eq(enterpriseCustomers.companyName, payload.companyName))
            .orderBy(desc(enterpriseCustomers.updatedAt));
          if (matches.length === 1) {
            recoveredCustomer = matches[0];
          }
        }

        if (!recoveredCustomer && businessProfile?.billingContactEmail) {
          const [byPrimaryEmail] = await db
            .select()
            .from(enterpriseCustomers)
            .where(eq(enterpriseCustomers.email, businessProfile.billingContactEmail))
            .limit(1);
          if (byPrimaryEmail) {
            recoveredCustomer = byPrimaryEmail;
          }
        }

        if (!recoveredCustomer && businessProfile?.billingContactEmail) {
          const [byContactEmail] = await db
            .select()
            .from(enterpriseCustomers)
            .where(eq(enterpriseCustomers.contactEmail, businessProfile.billingContactEmail))
            .limit(1);
          if (byContactEmail) {
            recoveredCustomer = byContactEmail;
          }
        }

        if (recoveredCustomer) {
          const recoveredSystemType = normalizeOnpremSystemType(payload.systemType) || 'development';
          const hintedEnterpriseSystemId = String(req.body?.enterpriseSystemId || '').trim() || null;
          const policySystems = await db
            .select()
            .from(enterpriseSystems)
            .where(and(
              eq(enterpriseSystems.enterpriseCustomerId, recoveredCustomer.id),
              eq(enterpriseSystems.systemType, recoveredSystemType),
            ))
            .orderBy(desc(enterpriseSystems.updatedAt));

          const normalizedPayloadHardware = normalizeIdentityValue(payload.hardwareKey);
          const normalizedPayloadHostname = normalizeIdentityValue(payload.hostname);
          const normalizedPayloadBaseUrl = normalizeIdentityValue(payload.serverBaseUrl);

          const matchedPolicySystem = policySystems.find((system) => {
            if (hintedEnterpriseSystemId && system.id === hintedEnterpriseSystemId) return true;
            if (normalizedPayloadHardware && normalizeIdentityValue(system.hardwareKey) === normalizedPayloadHardware) return true;
            if (normalizedPayloadHostname && normalizeIdentityValue(system.internalHostname) === normalizedPayloadHostname) return true;
            if (normalizedPayloadBaseUrl && normalizeIdentityValue(system.baseUrl) === normalizedPayloadBaseUrl) return true;
            return false;
          }) || policySystems[0] || null;

          const recoveredAutoApproveRenewals = matchedPolicySystem?.autoApproveRenewals === true;
          const recoveredBillingStatus = String(matchedPolicySystem?.billingStatus || 'due');
          const canAutoIssueByPolicy = policyAllowsAutomaticIssuance({
            autoApproveRenewals: recoveredAutoApproveRenewals,
            billingStatus: recoveredBillingStatus,
          });

          const recoveredRequestData = JSON.stringify({
            recoveredFromCheckIn: true,
            recoveredAt: now.toISOString(),
            payload,
            matchedPolicySystemId: matchedPolicySystem?.id || null,
          });
          const existingPendingRequests = await db
            .select()
            .from(enterpriseLicenseRequests)
            .where(and(
              eq(enterpriseLicenseRequests.enterpriseCustomerId, recoveredCustomer.id),
              eq(enterpriseLicenseRequests.systemType, recoveredSystemType),
              eq(enterpriseLicenseRequests.requestType, 'initial'),
              eq(enterpriseLicenseRequests.status, 'pending'),
            ))
            .orderBy(desc(enterpriseLicenseRequests.updatedAt), desc(enterpriseLicenseRequests.createdAt));

          const existingPendingRequest = findLatestMatchingPendingRequest(existingPendingRequests, {
            hardwareKey: payload.hardwareKey || null,
            hostname: payload.hostname || null,
            serverBaseUrl: payload.serverBaseUrl || null,
            systemType: recoveredSystemType,
            requestType: 'initial',
            status: 'pending',
          });

          let recoveredRequest: any;
          if (existingPendingRequest) {
            const [updatedRequest] = await db
              .update(enterpriseLicenseRequests)
              .set({
                requestData: recoveredRequestData,
                hardwareKey: payload.hardwareKey || null,
                hostname: payload.hostname || null,
                serverBaseUrl: payload.serverBaseUrl || null,
                status: canAutoIssueByPolicy ? 'approved' : 'pending',
                monthlyFee: String(matchedPolicySystem?.monthlyFee || payload.monthlyFee || '0'),
                feeCurrency: String(matchedPolicySystem?.feeCurrency || payload.feeCurrency || 'USD'),
                autoApproveRenewals: recoveredAutoApproveRenewals,
                graceDays: payload.graceDays ?? 15,
                billingStatus: recoveredBillingStatus,
                lastRenewedAt: now,
                nextRenewalDueAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
                reviewedAt: canAutoIssueByPolicy ? now : null,
                reviewedBy: canAutoIssueByPolicy ? 'system-onprem-checkin-recovery' : null,
                denialReason: canAutoIssueByPolicy ? null : existingPendingRequest.denialReason,
                updatedAt: now,
              })
              .where(eq(enterpriseLicenseRequests.id, existingPendingRequest.id))
              .returning();
            recoveredRequest = updatedRequest || existingPendingRequest;
          } else {
            const [createdRequest] = await db
              .insert(enterpriseLicenseRequests)
              .values({
                enterpriseCustomerId: recoveredCustomer.id,
                requestData: recoveredRequestData,
                hardwareKey: payload.hardwareKey || null,
                hostname: payload.hostname || null,
                serverBaseUrl: payload.serverBaseUrl || null,
                systemType: recoveredSystemType,
                status: canAutoIssueByPolicy ? 'approved' : 'pending',
                requestType: 'initial',
                monthlyFee: String(matchedPolicySystem?.monthlyFee || payload.monthlyFee || '0'),
                feeCurrency: String(matchedPolicySystem?.feeCurrency || payload.feeCurrency || 'USD'),
                autoApproveRenewals: recoveredAutoApproveRenewals,
                graceDays: payload.graceDays ?? 15,
                billingStatus: recoveredBillingStatus,
                lastRenewedAt: now,
                nextRenewalDueAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
                reviewedAt: canAutoIssueByPolicy ? now : null,
                reviewedBy: canAutoIssueByPolicy ? 'system-onprem-checkin-recovery' : null,
              })
              .returning();
            recoveredRequest = createdRequest;
          }

          if (canAutoIssueByPolicy) {
            const [recoveredLicense] = await db
              .insert(enterpriseLicenseKeys)
              .values({
                licenseId: payload.licenseId,
                licenseRequestId: recoveredRequest.id,
                enterpriseCustomerId: recoveredCustomer.id,
                encryptedKeyData: licenseKeyData,
                systemType: recoveredSystemType,
                issuedReason: payload.issuedReason || 'replacement',
                renewalSequence: payload.renewalSequence || 1,
                issuedAt: payload.issuedAt ? new Date(payload.issuedAt) : now,
                expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : now,
                checkInCount: 0,
                isRevoked: false,
              })
              .returning();
            licenseRow = recoveredLicense;
          } else {
            recoveredPendingRequestId = recoveredRequest.id;
            await ensurePendingEnterpriseSystemBinding({
              enterpriseCustomerId: recoveredCustomer.id,
              systemType: recoveredSystemType,
              enterpriseSystemIdHint: hintedEnterpriseSystemId || matchedPolicySystem?.id || null,
              hardwareKey: payload.hardwareKey || null,
              hostname: payload.hostname || null,
              serverBaseUrl: payload.serverBaseUrl || null,
              requestId: recoveredRequest.id,
              autoApproveRenewals: recoveredAutoApproveRenewals,
              graceDays: payload.graceDays ?? 15,
              monthlyFee: String(matchedPolicySystem?.monthlyFee || payload.monthlyFee || '0'),
              feeCurrency: String(matchedPolicySystem?.feeCurrency || payload.feeCurrency || 'USD'),
              billingStatus: recoveredBillingStatus,
              licenseStatus: 'pending_approval',
            });
          }
          console.log('[EnterprisePortal] Recovered missing license metadata from check-in', {
            licenseId: payload.licenseId,
            enterpriseCustomerId: recoveredCustomer.id,
            requestId: recoveredRequest.id,
            recoveredSystemType,
            matchedPolicySystemId: matchedPolicySystem?.id || null,
            policyAutoApproveRenewals: recoveredAutoApproveRenewals,
            policyBillingStatus: recoveredBillingStatus,
            requestStatus: canAutoIssueByPolicy ? 'approved' : 'pending',
          });
        }
      }

      if (!licenseRow) {
        if (recoveredPendingRequestId) {
          return res.status(409).json({
            error: 'Replacement license requires manual SuperAdmin approval before check-in can continue',
            status: 'pending_approval',
            requestId: recoveredPendingRequestId,
          });
        }
        return res.status(404).json({ error: 'License key not recognized by control plane' });
      }
      if (licenseRow.isRevoked) {
        const now = new Date();
        let replacementKey: any | null = null;
        let replacementSystem: any | null = null;

        const verifiedSystemReplacement = await findActiveReplacementLicenseForVerifiedSystem({
          verified,
          payload,
          now,
        });
        if (verifiedSystemReplacement) {
          replacementKey = verifiedSystemReplacement.replacementKey;
          replacementSystem = verifiedSystemReplacement.replacementSystem;
        }

        if (!replacementKey) {
          const [sameRequestReplacement] = await db
            .select()
            .from(enterpriseLicenseKeys)
            .where(and(
              eq(enterpriseLicenseKeys.licenseRequestId, licenseRow.licenseRequestId),
              eq(enterpriseLicenseKeys.isRevoked, false),
            ))
            .orderBy(desc(enterpriseLicenseKeys.createdAt))
            .limit(1);

          if (sameRequestReplacement && new Date(sameRequestReplacement.expiresAt) > now) {
            replacementKey = sameRequestReplacement;
          }
        }

        if (!replacementKey && payload.enterpriseCustomerId && payload.systemType) {
          const candidateRequests = await db
            .select()
            .from(enterpriseLicenseRequests)
            .where(and(
              eq(enterpriseLicenseRequests.enterpriseCustomerId, payload.enterpriseCustomerId),
              eq(enterpriseLicenseRequests.systemType, payload.systemType),
            ))
            .orderBy(desc(enterpriseLicenseRequests.updatedAt));

          const matchedRequest = candidateRequests.find((r) =>
            (!r.hardwareKey || !payload.hardwareKey || r.hardwareKey === payload.hardwareKey) &&
            (!r.hostname || !payload.hostname || r.hostname === payload.hostname) &&
            (!r.serverBaseUrl || !payload.serverBaseUrl || r.serverBaseUrl === payload.serverBaseUrl)
          );

          if (matchedRequest) {
            const [fallbackReplacement] = await db
              .select()
              .from(enterpriseLicenseKeys)
              .where(and(
                eq(enterpriseLicenseKeys.licenseRequestId, matchedRequest.id),
                eq(enterpriseLicenseKeys.isRevoked, false),
              ))
              .orderBy(desc(enterpriseLicenseKeys.createdAt))
              .limit(1);
            if (fallbackReplacement && new Date(fallbackReplacement.expiresAt) > now) {
              replacementKey = fallbackReplacement;
            }
          }
        }

        if (replacementKey) {
          if (!replacementSystem && replacementKey.licenseRequestId) {
            const [systemForReplacement] = await db
              .select()
              .from(enterpriseSystems)
              .where(eq(enterpriseSystems.activeLicenseRequestId, replacementKey.licenseRequestId))
              .orderBy(desc(enterpriseSystems.updatedAt))
              .limit(1);
            replacementSystem = systemForReplacement || null;
          }
          const replacementExpiry = new Date(replacementKey.expiresAt);
          const replacementDaysUntilExpiry = Math.floor((replacementExpiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
          const replacementOverdueDays = replacementDaysUntilExpiry < 0 ? Math.abs(replacementDaysUntilExpiry) : 0;
          const graceDays = 15;
          const replacementStatus =
            replacementDaysUntilExpiry >= 0 ? 'active' : replacementOverdueDays <= graceDays ? 'grace' : 'expired';
          const syncAuth = await buildOnpremSyncAuthResponse({
            enterpriseSystemId: replacementSystem?.id || null,
            verification: verified,
          });

          if (replacementSystem?.id && replacementStatus !== 'expired') {
            await db
              .update(enterpriseSystems)
              .set({
                activeLicenseKeyId: replacementKey.id,
                licenseStatus: replacementStatus,
                status: shouldSystemRuntimeBeActive(replacementStatus) ? 'active' : 'inactive',
                licenseExpiresAt: replacementExpiry,
                lastContactSyncAt: now,
                updatedAt: now,
              })
              .where(eq(enterpriseSystems.id, replacementSystem.id));
            await setEnterpriseSystemLicenseReason(replacementSystem.id, replacementStatus, null);
          }

          return res.json({
            valid: replacementStatus !== 'expired',
            status: replacementStatus,
            enterpriseCustomerId: replacementSystem?.enterpriseCustomerId || replacementKey.enterpriseCustomerId || payload.enterpriseCustomerId || null,
            enterpriseSystemId: replacementSystem?.id || null,
            registrationStatus: replacementSystem?.id ? 'registered' : 'unregistered',
            expiresAt: replacementExpiry.toISOString(),
            daysUntilExpiry: replacementDaysUntilExpiry,
            overdueDays: replacementOverdueDays,
            graceDays,
            warningLevels: {
              d5: replacementDaysUntilExpiry <= 5 && replacementDaysUntilExpiry >= 0,
              d3: replacementDaysUntilExpiry <= 3 && replacementDaysUntilExpiry >= 0,
              d1: replacementDaysUntilExpiry <= 1 && replacementDaysUntilExpiry >= 0,
            },
            renewal: {
              issued: true,
              licenseKeyData: replacementKey.encryptedKeyData,
              expiresAt: replacementExpiry.toISOString(),
            },
            syncAuth,
          });
        }

        return res.status(403).json({ error: 'License key has been revoked', status: 'revoked' });
      }

      const [requestRow] = await db
        .select()
        .from(enterpriseLicenseRequests)
        .where(eq(enterpriseLicenseRequests.id, licenseRow.licenseRequestId))
        .limit(1);

      if (!requestRow) {
        return res.status(404).json({ error: 'Associated license request not found' });
      }
      const [customerRow] = await db
        .select({
          id: enterpriseCustomers.id,
          companyName: enterpriseCustomers.companyName,
          royaltyPercentage: enterpriseCustomers.royaltyPercentage,
          status: enterpriseCustomers.status,
        })
        .from(enterpriseCustomers)
        .where(eq(enterpriseCustomers.id, requestRow.enterpriseCustomerId))
        .limit(1);

      const [existingSystemRow] = await db
        .select({ id: enterpriseSystems.id })
        .from(enterpriseSystems)
        .where(and(
          eq(enterpriseSystems.enterpriseCustomerId, requestRow.enterpriseCustomerId),
          eq(enterpriseSystems.systemType, requestRow.systemType),
        ))
        .orderBy(desc(enterpriseSystems.updatedAt))
        .limit(1);

      if (String(customerRow?.status || '').toLowerCase() === 'suspended') {
        return res.status(403).json({
          error: 'Enterprise customer is suspended. License access is disabled.',
          status: 'suspended',
          reason: 'Customer is suspended by cloud SuperAdmin',
          registrationStatus: 'registered_suspended',
          enterpriseCustomerId: requestRow.enterpriseCustomerId,
          enterpriseSystemId: existingSystemRow?.id || null,
          decisionVersion: new Date().toISOString(),
        });
      }

      const requestStatus = String(requestRow.status || '').trim().toLowerCase();
      if (requestStatus !== 'approved') {
        const now = new Date();
        const pendingLike = requestStatus === 'pending' || requestStatus === 'pending_review';
        return res.status(403).json({
          error: pendingLike
            ? 'License request is pending SuperAdmin approval'
            : 'License request is not approved',
          status: pendingLike ? 'pending_approval' : requestStatus || 'inactive',
          reason: requestRow.denialReason || (pendingLike
            ? 'Cloud PRD has not approved this on-prem license request yet'
            : 'License request is not in approved state'),
          registrationStatus: pendingLike ? 'registered_pending_approval' : 'registered',
          enterpriseCustomerId: requestRow.enterpriseCustomerId,
          enterpriseSystemId: existingSystemRow?.id || null,
          decisionVersion: now.toISOString(),
        });
      }

      if (businessProfile && (businessProfile.businessName || businessProfile.billingContactName || businessProfile.billingContactEmail)) {
        const now = new Date();
        await db
          .update(enterpriseCustomers)
          .set({
            companyName: businessProfile.businessName || undefined,
            contactPersonName: businessProfile.billingContactName || undefined,
            contactEmail: businessProfile.billingContactEmail || undefined,
            contactMobile: [
              businessProfile.countryCode,
              businessProfile.billingContactPhone,
            ].filter(Boolean).join(' ') || undefined,
            companyAddress: businessProfile.businessAddress || undefined,
            country: businessProfile.countryCode || undefined,
            updatedAt: now,
          })
          .where(eq(enterpriseCustomers.id, requestRow.enterpriseCustomerId));

        const profileKey = `ENTERPRISE_BUSINESS_PROFILE_${requestRow.enterpriseCustomerId}`;
        const [existingProfile] = await db
          .select({ id: platformConfiguration.id, value: platformConfiguration.value })
          .from(platformConfiguration)
          .where(eq(platformConfiguration.key, profileKey))
          .limit(1);

        const existingProfileValue = parseStoredBusinessProfile(existingProfile?.value);
        const mergedProfile = {
          ...(existingProfileValue || {}),
          ...(businessProfile || {}),
          syncMetadata: existingProfileValue?.syncMetadata || null,
        };

        if (existingProfile) {
          await db
            .update(platformConfiguration)
            .set({
              value: JSON.stringify(mergedProfile),
              dataType: 'json',
              description: 'Enterprise customer business profile synced from on-prem system',
              updatedAt: now,
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
            });
        }
      }
      if (
        requestRow.hardwareKey &&
        payload.hardwareKey &&
        normalizeIdentityValue(requestRow.hardwareKey) !== normalizeIdentityValue(payload.hardwareKey)
      ) {
        return res.status(400).json({ error: 'License hardware key does not match registered request' });
      }
      if (
        requestRow.hostname &&
        payload.hostname &&
        normalizeIdentityValue(requestRow.hostname) !== normalizeIdentityValue(payload.hostname)
      ) {
        return res.status(400).json({ error: 'License hostname does not match registered request' });
      }
      if (
        requestRow.serverBaseUrl &&
        payload.serverBaseUrl &&
        normalizeIdentityValue(normalizeBaseUrl(requestRow.serverBaseUrl)) !==
          normalizeIdentityValue(normalizeBaseUrl(payload.serverBaseUrl))
      ) {
        return res.status(400).json({ error: 'License server base URL does not match registered request' });
      }

      const now = new Date();
      const expiresAt = new Date(payload.expiresAt);
      const msDiff = expiresAt.getTime() - now.getTime();
      const daysUntilExpiry = Math.floor(msDiff / (24 * 60 * 60 * 1000));
      const overdueDays = daysUntilExpiry < 0 ? Math.abs(daysUntilExpiry) : 0;
      const graceDays = requestRow.graceDays && requestRow.graceDays >= 0 ? requestRow.graceDays : 15;
      const withinGrace = daysUntilExpiry < 0 && overdueDays <= graceDays;

      await db
        .update(enterpriseLicenseKeys)
        .set({
          lastCheckInAt: now,
          checkInCount: (licenseRow.checkInCount || 0) + 1,
        })
        .where(eq(enterpriseLicenseKeys.id, licenseRow.id));

      await db
        .update(enterpriseLicenseRequests)
        .set({
          lastCheckInAt: now,
          updatedAt: now,
        })
        .where(eq(enterpriseLicenseRequests.id, requestRow.id));

      let activeLicenseKey = licenseRow;
      let renewedLicenseKeyData: string | null = null;
      let renewedLicenseExpiresAt: Date | null = null;
      const alertEmails = Array.isArray(req.body?.alertEmails)
        ? req.body.alertEmails
            .map((v: any) => String(v || '').trim().toLowerCase())
            .filter((v: string) => v.includes('@'))
            .filter((v: string, idx: number, arr: string[]) => arr.indexOf(v) === idx)
        : [];
      const canAutoRenew =
        requestRow.status === 'approved' &&
        requestRow.autoApproveRenewals === true &&
        ['paid', 'waived'].includes(String(requestRow.billingStatus || '').trim().toLowerCase());

      if (canAutoRenew && (daysUntilExpiry <= 5 || withinGrace)) {
        const [latestKey] = await db
          .select()
          .from(enterpriseLicenseKeys)
          .where(eq(enterpriseLicenseKeys.licenseRequestId, requestRow.id))
          .orderBy(desc(enterpriseLicenseKeys.createdAt))
          .limit(1);

        if (latestKey && new Date(latestKey.expiresAt) > expiresAt && !latestKey.isRevoked) {
          activeLicenseKey = latestKey;
          renewedLicenseKeyData = latestKey.encryptedKeyData;
          renewedLicenseExpiresAt = new Date(latestKey.expiresAt);
        } else {
          const [customer] = await db
            .select()
            .from(enterpriseCustomers)
            .where(eq(enterpriseCustomers.id, requestRow.enterpriseCustomerId))
            .limit(1);

          const issueAt = now;
          const renewalAnchor = expiresAt > now ? expiresAt : now;
          const newExpires = expiresAt > now
            ? endOfNextCalendarMonth(renewalAnchor)
            : endOfCalendarMonth(renewalAnchor);
          const newLicenseId = `LIC-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
          const renewalSequence = (latestKey?.renewalSequence || payload.renewalSequence || 1) + 1;

          renewedLicenseKeyData = signLicenseKey({
            licenseId: newLicenseId,
            enterpriseCustomerId: requestRow.enterpriseCustomerId,
            hardwareKey: requestRow.hardwareKey || payload.hardwareKey || '',
            hostname: requestRow.hostname || payload.hostname || '',
            serverBaseUrl: requestRow.serverBaseUrl || payload.serverBaseUrl || '',
            systemType: requestRow.systemType as 'development' | 'qa' | 'production',
            issuedAt: issueAt.toISOString(),
            expiresAt: newExpires.toISOString(),
            monthlyFee: String(requestRow.monthlyFee || payload.monthlyFee || '0'),
            feeCurrency: String(requestRow.feeCurrency || payload.feeCurrency || 'USD'),
            companyName: customer?.companyName || payload.companyName || '',
            renewalSequence,
            issuedReason: 'renewal',
            graceDays,
            autoApproveRenewals: true,
            nextRenewalDueAt: newExpires.toISOString(),
            issuedBy: 'system-auto-renewal',
          });

          const [inserted] = await db
            .insert(enterpriseLicenseKeys)
            .values({
              licenseId: newLicenseId,
              licenseRequestId: requestRow.id,
              enterpriseCustomerId: requestRow.enterpriseCustomerId,
              encryptedKeyData: renewedLicenseKeyData,
              systemType: requestRow.systemType,
              issuedReason: 'renewal',
              renewalSequence,
              issuedAt: issueAt,
              expiresAt: newExpires,
            })
            .returning();

          activeLicenseKey = inserted;
          renewedLicenseExpiresAt = newExpires;

          await db
            .update(enterpriseLicenseRequests)
            .set({
              lastRenewedAt: issueAt,
              nextRenewalDueAt: newExpires,
              reminder5SentAt: null,
              reminder3SentAt: null,
              reminder1SentAt: null,
              overdueNoticeSentAt: null,
              updatedAt: new Date(),
            })
            .where(eq(enterpriseLicenseRequests.id, requestRow.id));
        }
      }

      const trackedSystem = await upsertSystemLicenseSnapshot({
        enterpriseCustomerId: requestRow.enterpriseCustomerId,
        systemType: requestRow.systemType,
        hardwareKey: requestRow.hardwareKey || payload.hardwareKey,
        hostname: requestRow.hostname || payload.hostname,
        serverBaseUrl: requestRow.serverBaseUrl || payload.serverBaseUrl,
        licenseRequestId: requestRow.id,
        licenseKeyId: activeLicenseKey.id,
        expiresAt: renewedLicenseExpiresAt || expiresAt,
        autoApproveRenewals: requestRow.autoApproveRenewals === true,
        graceDays,
        monthlyFee: String(requestRow.monthlyFee || payload.monthlyFee || '0'),
        feeCurrency: String(requestRow.feeCurrency || payload.feeCurrency || 'USD'),
        billingStatus: requestRow.billingStatus || 'due',
        alertEmails,
      });

      const hintedEnterpriseSystemId = String(req.body?.enterpriseSystemId || '').trim() || null;
      if (hintedEnterpriseSystemId && hintedEnterpriseSystemId !== trackedSystem.id) {
        return res.status(409).json({
          error: 'Check-in system identity mismatch. Re-register this on-prem system in cloud PRD.',
          status: 'identity_mismatch',
          enterpriseSystemId: trackedSystem.id,
        });
      }

      const [systemRoyaltyConfig] = await db
        .select({ value: platformConfiguration.value })
        .from(platformConfiguration)
        .where(eq(platformConfiguration.key, `ENTERPRISE_SYSTEM_ROYALTY_${trackedSystem.id}`))
        .limit(1);
      const effectiveSystemRoyaltyPercentage =
        parseSystemRoyalty(systemRoyaltyConfig?.value) ??
        parseSystemRoyalty(customerRow?.royaltyPercentage) ??
        0;

      const telemetryRows = Array.isArray(req.body?.telemetry) ? req.body.telemetry : [];
      const telemetryRowsProcessed = await ingestOnpremTelemetryRows({
        enterpriseCustomerId: requestRow.enterpriseCustomerId,
        trackedSystemId: trackedSystem.id,
        requestSystemType: normalizeOnpremSystemType(requestRow.systemType) || 'development',
        trackedServerBaseUrl: requestRow.serverBaseUrl || payload.serverBaseUrl || null,
        trackedHostname: requestRow.hostname || payload.hostname || null,
        customerRoyaltyPercentage: customerRow?.royaltyPercentage,
        systemRoyaltyConfigValue: systemRoyaltyConfig?.value,
        payloadFeeCurrency: payload.feeCurrency,
        telemetryRows,
        now,
      });

      const responseExpiry = renewedLicenseExpiresAt || expiresAt;
      const responseDaysUntilExpiry = Math.floor((responseExpiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      const responseOverdueDays = responseDaysUntilExpiry < 0 ? Math.abs(responseDaysUntilExpiry) : 0;
      const responseStatus =
        responseDaysUntilExpiry >= 0 ? 'active' : responseOverdueDays <= graceDays ? 'grace' : 'expired';

      await db
        .update(enterpriseSystems)
        .set({
          lastCheckInAt: now,
          licenseStatus: responseStatus,
          licenseExpiresAt: responseExpiry,
          nextCheckInDueAt: responseExpiry,
          updatedAt: now,
        })
        .where(eq(enterpriseSystems.id, trackedSystem.id));

      try {
        const [customerFull] = await db
          .select()
          .from(enterpriseCustomers)
          .where(eq(enterpriseCustomers.id, requestRow.enterpriseCustomerId))
          .limit(1);
        const [profileConfig] = await db
          .select()
          .from(platformConfiguration)
          .where(eq(platformConfiguration.key, profileConfigKey(requestRow.enterpriseCustomerId)))
          .limit(1);
        const [royaltyConfig] = await db
          .select()
          .from(platformConfiguration)
          .where(eq(platformConfiguration.key, `ENTERPRISE_SYSTEM_ROYALTY_${trackedSystem.id}`))
          .limit(1);

        if (customerFull) {
          await mirrorLicenseContextToLowerCloudsNonBlocking({
            customer: customerFull,
            system: {
              ...trackedSystem,
              licenseStatus: responseStatus,
              licenseExpiresAt: responseExpiry,
              lastCheckInAt: now,
              nextCheckInDueAt: responseExpiry,
            },
            licenseRequest: requestRow,
            licenseKey: activeLicenseKey,
            businessProfileConfig: profileConfig || null,
            systemRoyaltyConfig: royaltyConfig || null,
          });
        }
      } catch (mirrorError) {
        console.warn('[EnterprisePortal] Automatic license-context mirror skipped due to error:', mirrorError);
      }

      res.json({
        valid: responseStatus !== 'expired',
        status: responseStatus,
        reason: responseStatus === 'expired'
          ? 'License has expired and is outside grace window'
          : null,
        registrationStatus: requestRow.status === 'approved' ? 'registered' : 'registered_pending_approval',
        enterpriseCustomerId: requestRow.enterpriseCustomerId,
        enterpriseSystemId: trackedSystem.id,
        syncAuth: await buildOnpremSyncAuthResponse({
          enterpriseSystemId: trackedSystem.id,
          verification: verified,
        }),
        decisionVersion: now.toISOString(),
        expiresAt: responseExpiry.toISOString(),
        daysUntilExpiry: responseDaysUntilExpiry,
        overdueDays: responseOverdueDays,
        graceDays,
        systemRoyaltyPercentage: effectiveSystemRoyaltyPercentage,
        warningLevels: {
          d5: responseDaysUntilExpiry <= 5 && responseDaysUntilExpiry >= 0,
          d3: responseDaysUntilExpiry <= 3 && responseDaysUntilExpiry >= 0,
          d1: responseDaysUntilExpiry <= 1 && responseDaysUntilExpiry >= 0,
        },
        renewal: {
          issued: !!renewedLicenseKeyData,
          licenseKeyData: renewedLicenseKeyData,
          expiresAt: renewedLicenseExpiresAt?.toISOString() || null,
        },
        telemetry: {
          rowsReceived: telemetryRows.length,
          rowsProcessed: telemetryRowsProcessed,
          updatedAt: now.toISOString(),
        },
      });
    } catch (error) {
      console.error('[EnterprisePortal] Onprem check-in error:', error);
      res.status(500).json({ error: 'Failed to process onprem check-in' });
    }
  });

  app.use(router);
}
