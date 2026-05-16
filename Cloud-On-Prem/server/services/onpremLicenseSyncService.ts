import os from 'os';
import crypto from 'crypto';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  onpremLicenseState,
  organizations,
  platformPricing,
  platformConfiguration,
} from '@shared/schema';
import { generateHardwareKey, verifyAndDecodeLicenseKey, isLocalHardwareKeyMatch } from './licenseCryptoService';
import { parseOnpremSystemType } from './onpremLicenseStatus';

async function upsertPlatformConfigurationValue(params: {
  key: string;
  value: string;
  dataType?: string;
  description?: string;
}) {
  const now = new Date();
  const [existing] = await db
    .select({ id: platformConfiguration.id })
    .from(platformConfiguration)
    .where(eq(platformConfiguration.key, params.key))
    .limit(1);

  if (existing) {
    await db
      .update(platformConfiguration)
      .set({
        value: params.value,
        dataType: params.dataType || 'string',
        description: params.description,
        updatedAt: now,
      })
      .where(eq(platformConfiguration.id, existing.id));
    return;
  }

  await db
    .insert(platformConfiguration)
    .values({
      key: params.key,
      value: params.value,
      dataType: params.dataType || 'string',
      description: params.description,
      isEditable: true,
    });
}

function clampRoyaltyPercentage(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(100, parsed));
}

async function enforceOnpremRoyaltyFromCloud(royaltyPercentage: number) {
  const normalizedPct = Math.max(0, Math.min(100, royaltyPercentage));
  const commissionRate = Number((normalizedPct / 100).toFixed(4));

  const [existingPricing] = await db
    .select()
    .from(platformPricing)
    .orderBy(desc(platformPricing.updatedAt), desc(platformPricing.createdAt))
    .limit(1);

  if (existingPricing) {
    await db
      .update(platformPricing)
      .set({
        defaultCourseCommissionRate: commissionRate.toFixed(4),
        updatedAt: new Date(),
      })
      .where(eq(platformPricing.id, existingPricing.id));
    return;
  }

  await db
    .insert(platformPricing)
    .values({
      defaultCourseCommissionRate: commissionRate.toFixed(4),
      updatedAt: new Date(),
      createdAt: new Date(),
    });
}

async function pushLocalLicenseStatusToCloud(status: string, reason: string | null) {
  if (process.env.ONPREM_MODE !== 'true') return;
  try {
    await hydrateOnpremSyncCredentialFromConfig();
    const portalBaseUrl = getEnterprisePortalBaseUrl();
    const endpoint = `${portalBaseUrl}/api/enterprise/public/onprem/license-status-sync`;
    const [license] = await db.select().from(onpremLicenseState).limit(1);
    const enterpriseCustomerId = await getEnterpriseCustomerIdFromConfig();
    const payload = {
      status: String(status || '').trim().toLowerCase(),
      reason: reason || null,
      observedAt: new Date().toISOString(),
      systemType: normalizeOnpremSystemTypeInput(process.env.SYSTEM_TYPE),
      enterpriseCustomerId: enterpriseCustomerId || null,
      hardwareKey: generateHardwareKey(),
      hostname: os.hostname(),
      serverBaseUrl: getLocalServerBaseUrl(),
      licenseKeyData: license?.licenseKeyData || null,
    };
    await postSignedOnpremJson(endpoint, payload);
  } catch (error) {
    console.warn('[OnpremLicenseSync] Failed to push local license status to cloud:', error);
  }
}

export async function publishOnpremRemoteLicenseStatus(status: string, reason: string | null) {
  await upsertPlatformConfigurationValue({
    key: 'ONPREM_LICENSE_REMOTE_STATUS',
    value: JSON.stringify({
      status,
      reason: reason || null,
      updatedAt: new Date().toISOString(),
    }),
    dataType: 'json',
    description: 'Last known remote cloud licensing status for this onprem system',
  });
  await pushLocalLicenseStatusToCloud(status, reason);
}

type OnpremBusinessProfile = {
  businessName?: string;
  businessRegistrationNumber?: string;
  businessAddress?: string;
  billingContactName?: string;
  billingContactEmail?: string;
  billingContactPhone?: string;
  countryCode?: string;
  vatNumber?: string;
  notes?: string;
} | null;

const REQUIRED_BUSINESS_PROFILE_FIELDS: Array<{ key: keyof NonNullable<OnpremBusinessProfile>; label: string }> = [
  { key: 'businessName', label: 'Business Name' },
  { key: 'businessRegistrationNumber', label: 'Business Registration Number' },
  { key: 'businessAddress', label: 'Business Address' },
  { key: 'billingContactName', label: 'Main Contact Person' },
  { key: 'billingContactEmail', label: 'Main Contact Email' },
  { key: 'billingContactPhone', label: 'Main Contact Phone' },
  { key: 'countryCode', label: 'Country Code' },
  { key: 'vatNumber', label: 'VAT Number' },
];

export function evaluateBusinessProfileCompleteness(profile: OnpremBusinessProfile): { isComplete: boolean; missingFields: string[] } {
  const missingFields = REQUIRED_BUSINESS_PROFILE_FIELDS
    .filter(({ key }) => !String(profile?.[key] || '').trim())
    .map(({ label }) => label);
  return {
    isComplete: missingFields.length === 0,
    missingFields,
  };
}

type RuntimeStage = 'dev' | 'acc' | 'prd';

// Intentionally hardcoded for on-prem customer safety and data-isolation guarantees.
// Customers must not be able to alter control-plane or telemetry routing via env/config.
const HARD_CODED_CLOUD_ENDPOINTS = {
  licenseControlPlaneByStage: {
    prd: 'https://learnplay.co.za',
    // License authority is always PRD, regardless of on-prem runtime stage.
    acc: 'https://learnplay.co.za',
    dev: 'https://learnplay.co.za',
  } as Record<RuntimeStage, string>,
  metricsByStage: {
    prd: 'https://learnplay.co.za',
    acc: 'https://acccl.learnplay.co.za',
    dev: 'http://stcloud.learnplay.co.za',
  } as Record<RuntimeStage, string>,
  licenseReplicaByStage: {
    acc: 'https://acccl.learnplay.co.za',
    dev: 'http://stcloud.learnplay.co.za',
  },
} as const;

function normalizeBaseUrl(raw: string | null | undefined): string | null {
  const value = String(raw || '').trim();
  if (!value) return null;
  return value.replace(/\/+$/, '');
}

function resolveRuntimeStage(): RuntimeStage {
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

function getLicenseControlPlaneBaseUrl(): string {
  return HARD_CODED_CLOUD_ENDPOINTS.licenseControlPlaneByStage.prd;
}

function getMetricsPortalBaseUrlForStage(stage: RuntimeStage): string | null {
  void stage;
  return HARD_CODED_CLOUD_ENDPOINTS.metricsByStage.prd;
}

function getEnterprisePortalBaseUrl(): string {
  return getLicenseControlPlaneBaseUrl();
}

function safeIso(input: Date | string | null | undefined): string | null {
  if (!input) return null;
  const dt = new Date(input);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function normalizeOnpremSystemTypeInput(input: unknown): 'development' | 'qa' | 'production' {
  const parsed = parseOnpremSystemType(String(input || ''));
  return parsed || 'development';
}

function getOnpremCloudSyncSharedSecret(): string {
  // On-prem check-ins are always verified by cloud PRD.
  // Do not fall back to stage-local/generic shared secrets, otherwise DEV/ACC on-prem
  // can sign with a non-PRD key and fail with "Invalid onprem request signature".
  return String(process.env.ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD || '').trim();
}

function getOnpremCloudSyncSharedSecretCandidates(): string[] {
  const primary = getOnpremCloudSyncSharedSecret();
  const previous = String(process.env.ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD_PREVIOUS || '').trim();
  const fallbackList = String(process.env.ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD_FALLBACKS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set([primary, previous, ...fallbackList].filter(Boolean)));
}

function getOnpremSystemSyncSecret(): string {
  return String(process.env.ONPREM_CLOUD_SYNC_SYSTEM_SECRET || '').trim();
}

function getOnpremSystemSyncVersion(): string {
  return String(process.env.ONPREM_CLOUD_SYNC_SYSTEM_VERSION || '0').trim() || '0';
}

function signOnpremRequestBody(bodyRaw: string, timestampMs: number, nonce: string, secret: string): string {
  if (!secret) {
    throw new Error('No onprem cloud sync signing secret is configured');
  }
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestampMs}.${nonce}.${bodyRaw}`)
    .digest('hex');
}

export function buildSignedOnpremHeaders(
  payload: unknown,
  options?: { forceShared?: boolean; sharedSecretOverride?: string },
): Record<string, string> {
  const forceShared = options?.forceShared === true;
  const bodyRaw = JSON.stringify(payload ?? {});
  const timestampMs = Date.now();
  const nonce = crypto.randomBytes(16).toString('hex');
  const systemSecret = forceShared ? '' : getOnpremSystemSyncSecret();
  const sharedSecret = String(options?.sharedSecretOverride || getOnpremCloudSyncSharedSecret()).trim();
  const secret = systemSecret || sharedSecret;
  const signature = signOnpremRequestBody(bodyRaw, timestampMs, nonce, secret);
  const enterpriseSystemId = String(process.env.ONPREM_ENTERPRISE_SYSTEM_ID || '').trim();
  const useSystemAuth = !!systemSecret && !!enterpriseSystemId;
  return {
    'Content-Type': 'application/json',
    'x-lp-onprem-ts': String(timestampMs),
    'x-lp-onprem-nonce': nonce,
    'x-lp-onprem-signature': signature,
    'x-lp-onprem-auth-mode': useSystemAuth ? 'system' : 'shared',
    ...(useSystemAuth ? { 'x-lp-onprem-system-id': enterpriseSystemId } : {}),
    ...(useSystemAuth ? { 'x-lp-onprem-auth-version': getOnpremSystemSyncVersion() } : {}),
  };
}

type SignedPostJsonResult = {
  response: Response;
  data: any;
  usedAuthMode: 'system' | 'shared';
  fallbackAttempted: boolean;
  fallbackSucceeded: boolean;
};

function canFallbackFromSystemToShared(status: number, payload: any): boolean {
  if (status !== 403) return false;
  const message = String(payload?.error || payload?.message || '').trim().toLowerCase();
  return (
    message.includes('invalid per-system onprem request signature')
    || message.includes('per-system credential is missing or revoked')
  );
}

export async function postSignedOnpremJson(endpoint: string, payload: unknown): Promise<SignedPostJsonResult> {
  const bodyRaw = JSON.stringify(payload ?? {});
  const primaryHeaders = buildSignedOnpremHeaders(payload);
  const primaryMode = String(primaryHeaders['x-lp-onprem-auth-mode'] || 'shared').toLowerCase() === 'system'
    ? 'system'
    : 'shared';

  let response = await fetch(endpoint, {
    method: 'POST',
    headers: primaryHeaders,
    body: bodyRaw,
  });
  let data = await response.json().catch(() => ({}));

  const sharedSecretCandidates = getOnpremCloudSyncSharedSecretCandidates();

  if (primaryMode !== 'system') {
    // Shared-mode signer rotation support: retry with explicitly configured
    // PRD previous/fallback candidates when current signature is rejected.
    if (
      response.status === 403
      && String(data?.error || '').toLowerCase().includes('invalid onprem request signature')
      && sharedSecretCandidates.length > 1
    ) {
      for (const candidateSecret of sharedSecretCandidates.slice(1)) {
        const retryHeaders = buildSignedOnpremHeaders(payload, {
          forceShared: true,
          sharedSecretOverride: candidateSecret,
        });
        const retryResponse = await fetch(endpoint, {
          method: 'POST',
          headers: retryHeaders,
          body: bodyRaw,
        });
        const retryData = await retryResponse.json().catch(() => ({}));
        if (retryResponse.ok) {
          return {
            response: retryResponse,
            data: retryData,
            usedAuthMode: 'shared',
            fallbackAttempted: true,
            fallbackSucceeded: true,
          };
        }
        response = retryResponse;
        data = retryData;
      }
    }

    return {
      response,
      data,
      usedAuthMode: 'shared',
      fallbackAttempted: false,
      fallbackSucceeded: false,
    };
  }

  const sharedSecret = getOnpremCloudSyncSharedSecret();
  const shouldFallback = !!sharedSecret && canFallbackFromSystemToShared(response.status, data);
  if (!shouldFallback) {
    return {
      response,
      data,
      usedAuthMode: 'system',
      fallbackAttempted: false,
      fallbackSucceeded: false,
    };
  }

  let fallbackSucceeded = false;
  for (const candidateSecret of sharedSecretCandidates) {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: buildSignedOnpremHeaders(payload, {
        forceShared: true,
        sharedSecretOverride: candidateSecret,
      }),
      body: bodyRaw,
    });
    data = await response.json().catch(() => ({}));
    if (response.ok) {
      fallbackSucceeded = true;
      break;
    }
    const errorMessage = String(data?.error || '').toLowerCase();
    if (!errorMessage.includes('invalid onprem request signature')) {
      break;
    }
  }

  if (fallbackSucceeded) {
    console.warn('[OnpremLicenseSync] Per-system auth signature was rejected; shared bootstrap fallback succeeded.');
  }

  return {
    response,
    data,
    usedAuthMode: fallbackSucceeded ? 'shared' : 'system',
    fallbackAttempted: true,
    fallbackSucceeded,
  };
}

async function postMetricsTelemetryNonBlocking(params: {
  stage: RuntimeStage;
  telemetry: any[];
  licenseKeyData: string;
  enterpriseSystemId: string | null;
  enterpriseCustomerId: string | null;
}) {
  if (!Array.isArray(params.telemetry) || params.telemetry.length === 0) return;
  const targetBaseUrl = getMetricsPortalBaseUrlForStage(params.stage);
  if (!targetBaseUrl) {
    console.warn(`[OnpremLicenseSync] Metrics sync skipped: no target configured for stage=${params.stage}.`);
    return;
  }

  const endpoint = `${targetBaseUrl}/api/enterprise/public/onprem/metrics-sync`;
  try {
    const payload = {
      licenseKeyData: params.licenseKeyData,
      enterpriseSystemId: params.enterpriseSystemId || null,
      enterpriseCustomerId: params.enterpriseCustomerId || null,
      telemetry: params.telemetry,
    };
    const result = await postSignedOnpremJson(endpoint, payload);
    if (!result.response.ok) {
      console.warn(`[OnpremLicenseSync] Metrics sync failed for stage=${params.stage} (${result.response.status}): ${String(result.data?.error || 'unknown error')}`);
    }
  } catch (error) {
    console.warn(`[OnpremLicenseSync] Metrics sync target unreachable for stage=${params.stage}; will retry on next check-in.`, error);
  }
}

async function propagateLicenseStatusToLowerCloudsNonBlocking(params: {
  status: string;
  reason: string | null;
  licenseKeyData: string;
  systemType: 'development' | 'qa' | 'production' | null;
  enterpriseCustomerId: string | null;
  enterpriseSystemId: string | null;
}) {
  // License state must have a single source of truth in PRD.
  // Do not mirror license status to lower environments.
  void params;
  return;
}

async function collectDailyTelemetry() {
  const orgs = await db
    .select({ id: organizations.id, name: organizations.name, isDemo: organizations.isDemo })
    .from(organizations);

  const totalOrganizations = orgs.length;
  const totalDemoOrganizations = orgs.filter((org) => org.isDemo === true).length;
  const reportDate = new Date().toISOString().slice(0, 10);
  const metricsSchemaVersion = 3;

  const toNumber = (value: any): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const [roleRows, superRoleRows, publishedCourseRows, assignmentRows, enrollmentRows, completionRows, activeUsersRows, demoUserRows, demoCourseRows, demoEnrollmentRows, demoCompletionRows] = await Promise.all([
    db.execute(sql`
      select
        uor."organizationId" as "organizationId",
        count(distinct uor."userId")::int as "totalUsers",
        count(distinct case when uor.role = 'org_admin' then uor."userId" end)::int as "totalOrgAdmins",
        count(distinct case when uor.role in ('teacher', 'team_lead') then uor."userId" end)::int as "totalTrainers",
        count(distinct case when uor.role in ('student', 'employee', 'learner') then uor."userId" end)::int as "totalLearners",
        count(distinct case when u."isCustSuper" = true then uor."userId" end)::int as "totalCustSupers",
        count(distinct case when u."isSuperAdmin" = true then uor."userId" end)::int as "totalSuperAdmins"
      from "userOrganizationRoles" uor
      join "users" u on u.id = uor."userId"
      group by uor."organizationId"
    `),
    db.execute(sql`
      select
        uor."organizationId" as "organizationId",
        count(distinct u.id)::int as "totalSuperAdmins"
      from "users" u
      join "userOrganizationRoles" uor on uor."userId" = u.id
      where u."isSuperAdmin" = true
      group by uor."organizationId"
    `),
    db.execute(sql`
      select
        c."organizationId" as "organizationId",
        count(*)::int as "totalCourses",
        count(*) filter (where c.status = 'active')::int as "totalPublishedCourses"
      from "courses" c
      group by c."organizationId"
    `),
    db.execute(sql`
      select
        c."organizationId" as "organizationId",
        count(a.id)::int as "totalAssignments",
        count(a.id) filter (where c.status = 'active')::int as "totalPublishedAssignments"
      from "courseAssignments" a
      join "courses" c on c.id = a."courseId"
      group by c."organizationId"
    `),
    db.execute(sql`
      select
        c."organizationId" as "organizationId",
        count(e.id)::int as "totalEnrollments",
        count(e.id) filter (where c.status = 'active')::int as "totalPublishedEnrollments",
        count(e.id) filter (where c.status = 'active' and cp.id is not null and cp.status = 'completed' and coalesce(cp."purchasePrice", '0')::numeric > 0)::int as "totalPaidCourseEnrollments",
        count(e.id) filter (where c.status = 'active' and (cp.id is null or cp.status <> 'completed' or coalesce(cp."purchasePrice", '0')::numeric <= 0))::int as "totalFreeCourseEnrollments",
        coalesce(sum(case when c.status = 'active' and cp.id is not null and cp.status = 'completed' and coalesce(cp."purchasePrice", '0')::numeric > 0 then coalesce(cp."platformAmount", cp."purchasePrice", '0')::numeric else 0 end), 0)::numeric(19,4) as "totalPaidEnrollmentValue",
        coalesce(sum(case when c.status = 'active' and (cp.id is null or cp.status <> 'completed' or coalesce(cp."purchasePrice", '0')::numeric <= 0) then 0 else 0 end), 0)::numeric(19,4) as "totalFreeEnrollmentValue"
      from "userCourseEnrollments" e
      join "courses" c on c.id = e."courseId"
      left join "coursePurchases" cp
        on cp."courseId" = e."courseId"
       and cp."userId" = e."userId"
       and cp.status = 'completed'
      group by c."organizationId"
    `),
    db.execute(sql`
      select
        c."organizationId" as "organizationId",
        count(p.id) filter (where p.status = 'completed' and c.status = 'active')::int as "totalCompletions",
        count(p.id) filter (where p.status = 'completed' and c.status = 'active' and cp.id is not null and cp.status = 'completed' and coalesce(cp."purchasePrice", '0')::numeric > 0)::int as "totalPaidCourseCompletions",
        count(p.id) filter (where p.status = 'completed' and c.status = 'active' and (cp.id is null or cp.status <> 'completed' or coalesce(cp."purchasePrice", '0')::numeric <= 0))::int as "totalFreeCourseCompletions",
        coalesce(sum(case when p.status = 'completed' and c.status = 'active' and cp.id is not null and cp.status = 'completed' and coalesce(cp."purchasePrice", '0')::numeric > 0 then coalesce(cp."platformAmount", cp."purchasePrice", '0')::numeric else 0 end), 0)::numeric(19,4) as "totalPaidCompletionValue"
      from "courseProgress" p
      join "courses" c on c.id = p."courseId"
      left join "coursePurchases" cp
        on cp."courseId" = p."courseId"
       and cp."userId" = p."userId"
       and cp.status = 'completed'
      group by c."organizationId"
    `),
    db.execute(sql`
      select
        p."organizationId" as "organizationId",
        count(distinct p."userId")::int as "activeUsers30Days"
      from "courseProgress" p
      where coalesce(p."lastAccessedAt", p."updatedAt", p."createdAt") >= now() - interval '30 days'
      group by p."organizationId"
    `),
    db.execute(sql`
      select
        o.id as "organizationId",
        count(distinct case when (o."isDemo" = true or lower(u.email) like '%+demo-%@learnplay.demo.local') then uor."userId" end)::int as "totalDemoUsers"
      from "organizations" o
      left join "userOrganizationRoles" uor on uor."organizationId" = o.id
      left join "users" u on u.id = uor."userId"
      group by o.id
    `),
    db.execute(sql`
      select
        c."organizationId" as "organizationId",
        count(*) filter (where o."isDemo" = true or c.title like '[DEMO] %')::int as "totalDemoCourses",
        count(*) filter (where c.status = 'active' and (o."isDemo" = true or c.title like '[DEMO] %'))::int as "totalDemoPublishedCourses"
      from "courses" c
      join "organizations" o on o.id = c."organizationId"
      group by c."organizationId"
    `),
    db.execute(sql`
      select
        c."organizationId" as "organizationId",
        count(e.id) filter (where o."isDemo" = true or c.title like '[DEMO] %')::int as "totalDemoEnrollments",
        coalesce(sum(case when (o."isDemo" = true or c.title like '[DEMO] %') and cp.id is not null and cp.status = 'completed' and coalesce(cp."purchasePrice", '0')::numeric > 0 then coalesce(cp."platformAmount", cp."purchasePrice", '0')::numeric else 0 end), 0)::numeric(19,4) as "totalDemoPaidEnrollmentValue"
      from "userCourseEnrollments" e
      join "courses" c on c.id = e."courseId"
      join "organizations" o on o.id = c."organizationId"
      left join "coursePurchases" cp
        on cp."courseId" = e."courseId"
       and cp."userId" = e."userId"
       and cp.status = 'completed'
      group by c."organizationId"
    `),
    db.execute(sql`
      select
        c."organizationId" as "organizationId",
        count(p.id) filter (where p.status = 'completed' and (o."isDemo" = true or c.title like '[DEMO] %'))::int as "totalDemoCompletions",
        coalesce(sum(case when p.status = 'completed' and (o."isDemo" = true or c.title like '[DEMO] %') and cp.id is not null and cp.status = 'completed' and coalesce(cp."purchasePrice", '0')::numeric > 0 then coalesce(cp."platformAmount", cp."purchasePrice", '0')::numeric else 0 end), 0)::numeric(19,4) as "totalDemoPaidCompletionValue"
      from "courseProgress" p
      join "courses" c on c.id = p."courseId"
      join "organizations" o on o.id = c."organizationId"
      left join "coursePurchases" cp
        on cp."courseId" = p."courseId"
       and cp."userId" = p."userId"
       and cp.status = 'completed'
      group by c."organizationId"
    `),
  ]);

  const indexByOrg = (rows: any[], key = 'organizationId') => {
    const map = new Map<string, any>();
    for (const row of rows || []) {
      const k = String((row as any)?.[key] || '');
      if (k) map.set(k, row);
    }
    return map;
  };

  const rolesByOrg = indexByOrg((roleRows as any).rows || []);
  const superRoleByOrg = indexByOrg((superRoleRows as any).rows || []);
  const coursesByOrg = indexByOrg((publishedCourseRows as any).rows || []);
  const assignmentsByOrg = indexByOrg((assignmentRows as any).rows || []);
  const enrollmentsByOrg = indexByOrg((enrollmentRows as any).rows || []);
  const completionsByOrg = indexByOrg((completionRows as any).rows || []);
  const activeUsersByOrg = indexByOrg((activeUsersRows as any).rows || []);
  const demoUsersByOrg = indexByOrg((demoUserRows as any).rows || []);
  const demoCoursesByOrg = indexByOrg((demoCourseRows as any).rows || []);
  const demoEnrollmentsByOrg = indexByOrg((demoEnrollmentRows as any).rows || []);
  const demoCompletionsByOrg = indexByOrg((demoCompletionRows as any).rows || []);

  const [systemCurrencyRow] = await db
    .select({ value: platformConfiguration.value })
    .from(platformConfiguration)
    .where(eq(platformConfiguration.key, 'platform_currency'))
    .limit(1);
  const metricCurrency = String(systemCurrencyRow?.value || 'USD');

  const telemetry: Array<{
    organizationId: string;
    organizationName: string;
    totalUsers: number;
    totalOrgAdmins: number;
    totalTrainers: number;
    totalLearners: number;
    totalCustSupers: number;
    totalSuperAdmins: number;
    totalDemoOrganizations: number;
    totalDemoUsers: number;
    totalOrganizations: number;
    totalCourses: number;
    totalPublishedCourses: number;
    totalDemoCourses: number;
    totalDemoPublishedCourses: number;
    totalEnrollments: number;
    totalPublishedEnrollments: number;
    totalDemoEnrollments: number;
    totalPaidCourseEnrollments: number;
    totalFreeCourseEnrollments: number;
    totalDemoCompletions: number;
    totalPaidEnrollmentValue: string;
    totalDemoPaidEnrollmentValue: string;
    totalFreeEnrollmentValue: string;
    totalAssignments: number;
    totalPublishedAssignments: number;
    totalCompletions: number;
    totalPaidCourseCompletions: number;
    totalFreeCourseCompletions: number;
    totalPaidCompletionValue: string;
    totalDemoPaidCompletionValue: string;
    totalFreeCourseCompletionsValue: string;
    activeUsers30Days: number;
    metricCurrency: string;
    metricsSchemaVersion: number;
    reportDate: string;
  }> = [];
  for (const org of orgs) {
    const roleMetrics = rolesByOrg.get(org.id) || {};
    const superRoleMetrics = superRoleByOrg.get(org.id) || {};
    const courseMetrics = coursesByOrg.get(org.id) || {};
    const assignmentMetrics = assignmentsByOrg.get(org.id) || {};
    const enrollmentMetrics = enrollmentsByOrg.get(org.id) || {};
    const completionMetrics = completionsByOrg.get(org.id) || {};
    const activeMetrics = activeUsersByOrg.get(org.id) || {};
    const demoUserMetrics = demoUsersByOrg.get(org.id) || {};
    const demoCourseMetrics = demoCoursesByOrg.get(org.id) || {};
    const demoEnrollmentMetrics = demoEnrollmentsByOrg.get(org.id) || {};
    const demoCompletionMetrics = demoCompletionsByOrg.get(org.id) || {};

    telemetry.push({
      organizationId: org.id,
      organizationName: org.name,
      totalUsers: toNumber(roleMetrics.totalUsers),
      totalOrgAdmins: toNumber(roleMetrics.totalOrgAdmins),
      totalTrainers: toNumber(roleMetrics.totalTrainers),
      totalLearners: toNumber(roleMetrics.totalLearners),
      totalCustSupers: toNumber(roleMetrics.totalCustSupers),
      totalSuperAdmins: Math.max(toNumber(roleMetrics.totalSuperAdmins), toNumber(superRoleMetrics.totalSuperAdmins)),
      totalDemoOrganizations,
      totalDemoUsers: toNumber(demoUserMetrics.totalDemoUsers),
      totalOrganizations,
      totalCourses: toNumber(courseMetrics.totalCourses),
      totalPublishedCourses: toNumber(courseMetrics.totalPublishedCourses),
      totalDemoCourses: toNumber(demoCourseMetrics.totalDemoCourses),
      totalDemoPublishedCourses: toNumber(demoCourseMetrics.totalDemoPublishedCourses),
      totalEnrollments: toNumber(enrollmentMetrics.totalEnrollments),
      totalPublishedEnrollments: toNumber(enrollmentMetrics.totalPublishedEnrollments),
      totalDemoEnrollments: toNumber(demoEnrollmentMetrics.totalDemoEnrollments),
      totalPaidCourseEnrollments: toNumber(enrollmentMetrics.totalPaidCourseEnrollments),
      totalFreeCourseEnrollments: toNumber(enrollmentMetrics.totalFreeCourseEnrollments),
      totalPaidEnrollmentValue: String(enrollmentMetrics.totalPaidEnrollmentValue || '0'),
      totalDemoPaidEnrollmentValue: String(demoEnrollmentMetrics.totalDemoPaidEnrollmentValue || '0'),
      totalFreeEnrollmentValue: String(enrollmentMetrics.totalFreeEnrollmentValue || '0'),
      totalAssignments: toNumber(assignmentMetrics.totalAssignments),
      totalPublishedAssignments: toNumber(assignmentMetrics.totalPublishedAssignments),
      totalCompletions: toNumber(completionMetrics.totalCompletions),
      totalDemoCompletions: toNumber(demoCompletionMetrics.totalDemoCompletions),
      totalPaidCourseCompletions: toNumber(completionMetrics.totalPaidCourseCompletions),
      totalFreeCourseCompletions: toNumber(completionMetrics.totalFreeCourseCompletions),
      totalPaidCompletionValue: String(completionMetrics.totalPaidCompletionValue || '0'),
      totalDemoPaidCompletionValue: String(demoCompletionMetrics.totalDemoPaidCompletionValue || '0'),
      totalFreeCourseCompletionsValue: '0',
      activeUsers30Days: toNumber(activeMetrics.activeUsers30Days),
      metricCurrency,
      metricsSchemaVersion,
      reportDate,
    });
  }

  return telemetry;
}

async function collectContactEmails() {
  const result = await db.execute(sql`
    select distinct trim(lower(u.email)) as email
    from "userOrganizationRoles" uor
    join "users" u on u.id = uor."userId"
    where u.email is not null
      and u."isDisabled" = false
      and uor.role in ('org_admin', 'teacher')
  `);
  const custSuperResult = await db.execute(sql`
    select distinct trim(lower(email)) as email
    from "users"
    where email is not null
      and "isDisabled" = false
      and "isCustSuper" = true
  `);
  const emails = new Set<string>();
  for (const row of result.rows as any[]) {
    if (row?.email && String(row.email).includes('@')) {
      emails.add(String(row.email));
    }
  }
  for (const row of custSuperResult.rows as any[]) {
    if (row?.email && String(row.email).includes('@')) {
      emails.add(String(row.email));
    }
  }
  return Array.from(emails);
}

async function getBusinessProfile() {
  const [row] = await db
    .select()
    .from(platformConfiguration)
    .where(eq(platformConfiguration.key, 'ONPREM_BUSINESS_PROFILE'))
    .limit(1);
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

export async function getEnterpriseCustomerIdFromConfig(): Promise<string | null> {
  const [row] = await db
    .select({ value: platformConfiguration.value })
    .from(platformConfiguration)
    .where(eq(platformConfiguration.key, 'ONPREM_ENTERPRISE_CUSTOMER_ID'))
    .limit(1);
  return row?.value ? String(row.value) : null;
}

export async function getEnterpriseSystemIdFromConfig(): Promise<string | null> {
  const [row] = await db
    .select({ value: platformConfiguration.value })
    .from(platformConfiguration)
    .where(eq(platformConfiguration.key, 'ONPREM_ENTERPRISE_SYSTEM_ID'))
    .limit(1);
  return row?.value ? String(row.value) : null;
}

async function getSystemSyncSecretFromConfig(): Promise<string | null> {
  const [row] = await db
    .select({ value: platformConfiguration.value })
    .from(platformConfiguration)
    .where(eq(platformConfiguration.key, 'ONPREM_CLOUD_SYNC_SYSTEM_SECRET'))
    .limit(1);
  return row?.value ? String(row.value).trim() : null;
}

async function getSystemSyncVersionFromConfig(): Promise<string> {
  const [row] = await db
    .select({ value: platformConfiguration.value })
    .from(platformConfiguration)
    .where(eq(platformConfiguration.key, 'ONPREM_CLOUD_SYNC_SYSTEM_VERSION'))
    .limit(1);
  return row?.value ? String(row.value).trim() : '0';
}

export async function hydrateOnpremSyncCredentialFromConfig(): Promise<void> {
  const systemId = await getEnterpriseSystemIdFromConfig();
  if (systemId) {
    process.env.ONPREM_ENTERPRISE_SYSTEM_ID = systemId;
  }
  const secret = await getSystemSyncSecretFromConfig();
  if (secret) {
    process.env.ONPREM_CLOUD_SYNC_SYSTEM_SECRET = secret;
  }
  process.env.ONPREM_CLOUD_SYNC_SYSTEM_VERSION = await getSystemSyncVersionFromConfig();
}

async function applyCloudSyncAuthCredentialFromResponse(payload: any): Promise<void> {
  const syncAuth = payload?.syncAuth;
  if (!syncAuth || typeof syncAuth !== 'object') return;
  const mode = String(syncAuth.mode || '').trim().toLowerCase();
  if (mode !== 'system') return;

  const enterpriseSystemId = String(syncAuth.enterpriseSystemId || '').trim();
  const secret = typeof syncAuth.secret === 'string' ? syncAuth.secret.trim() : '';
  const version = Number(syncAuth.version || 0);
  if (!enterpriseSystemId || !secret) return;

  await upsertPlatformConfigurationValue({
    key: 'ONPREM_ENTERPRISE_SYSTEM_ID',
    value: enterpriseSystemId,
    dataType: 'string',
    description: 'Cloud enterprise system identifier linked to this on-prem deployment',
  });
  await upsertPlatformConfigurationValue({
    key: 'ONPREM_CLOUD_SYNC_SYSTEM_SECRET',
    value: secret,
    dataType: 'string',
    description: 'Per-system onprem cloud sync secret issued by cloud control plane',
  });
  await upsertPlatformConfigurationValue({
    key: 'ONPREM_CLOUD_SYNC_SYSTEM_VERSION',
    value: String(Number.isFinite(version) ? version : 0),
    dataType: 'number',
    description: 'Version of per-system onprem cloud sync secret',
  });

  process.env.ONPREM_ENTERPRISE_SYSTEM_ID = enterpriseSystemId;
  process.env.ONPREM_CLOUD_SYNC_SYSTEM_SECRET = secret;
  process.env.ONPREM_CLOUD_SYNC_SYSTEM_VERSION = String(Number.isFinite(version) ? version : 0);
}

type OnpremCloudProfileReadResult = {
  matched: boolean;
  readOnly: boolean;
  authoritativeSystemType: 'development' | 'qa' | 'production';
  cloudProfile: Record<string, any> | null;
  enterpriseCustomerId: string | null;
  enterpriseSystemId: string | null;
  customerStatus: string | null;
  message: string | null;
};

export function getLocalServerBaseUrl(): string {
  const fromEnv = String(process.env.BASE_URL || '').trim();
  if (fromEnv) return fromEnv;
  return `https://${os.hostname()}`;
}

function canonicalBaseDomainKey(input: string | null | undefined): string | null {
  const raw = String(input || '').trim();
  if (!raw) return null;
  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withProtocol);
    const host = String(u.hostname || '').trim().toLowerCase();
    if (!host) return null;
    const parts = host.split('.').filter(Boolean);
    if (parts.length < 2) return host;
    const suffix2 = parts.slice(-2).join('.');
    const useThirdLevel = new Set(['co.za', 'org.za', 'net.za', 'gov.za', 'ac.za']);
    if (parts.length >= 3 && useThirdLevel.has(suffix2)) {
      return parts.slice(-3).join('.');
    }
    return suffix2;
  } catch {
    return null;
  }
}

async function readBusinessProfileFromCloud(): Promise<OnpremCloudProfileReadResult> {
  await hydrateOnpremSyncCredentialFromConfig();
  const portalBaseUrl = getEnterprisePortalBaseUrl();
  const endpoint = `${portalBaseUrl}/api/enterprise/public/onprem/business-profile-read`;
  const enterpriseCustomerId = await getEnterpriseCustomerIdFromConfig();
  const enterpriseSystemId = await getEnterpriseSystemIdFromConfig();
  const localSystemType = normalizeOnpremSystemTypeInput(process.env.SYSTEM_TYPE);

  const readPayload = {
    enterpriseCustomerId: enterpriseCustomerId || null,
    enterpriseSystemId: enterpriseSystemId || null,
    systemType: localSystemType,
    hardwareKey: generateHardwareKey(),
    hostname: os.hostname(),
    serverBaseUrl: getLocalServerBaseUrl(),
    rootBaseDomain: canonicalBaseDomainKey(getLocalServerBaseUrl()),
  };
  const result = await postSignedOnpremJson(endpoint, readPayload);
  const upstream = result.response;

  if (upstream.status === 404) {
    return {
      matched: false,
      readOnly: false,
      authoritativeSystemType: localSystemType,
      cloudProfile: null,
      enterpriseCustomerId: null,
      enterpriseSystemId: null,
      customerStatus: null,
      message: 'No matching cloud profile found for this on-prem system.',
    };
  }

  const data = result.data || {};
  await applyCloudSyncAuthCredentialFromResponse(data);
  if (!upstream.ok) {
    const err: any = new Error(data?.error || 'Failed to read business profile from cloud control plane');
    err.status = upstream.status;
    err.details = data;
    throw err;
  }

  const authoritativeSystemType = normalizeOnpremSystemTypeInput(data?.authoritativeSystemType);
  return {
    matched: true,
    readOnly: !!data?.readOnly,
    authoritativeSystemType,
    cloudProfile: data?.cloudProfile && typeof data.cloudProfile === 'object' ? data.cloudProfile : null,
    enterpriseCustomerId: String(data?.enterpriseCustomerId || '').trim() || null,
    enterpriseSystemId: String(data?.enterpriseSystemId || '').trim() || null,
    customerStatus: String(data?.customerStatus || '').trim().toLowerCase() || null,
    message: String(data?.message || '').trim() || null,
  };
}

export async function hydrateOnpremBusinessProfileFromCloud(options?: {
  persist?: boolean;
}): Promise<OnpremCloudProfileReadResult> {
  const persist = options?.persist !== false;
  const cloud = await readBusinessProfileFromCloud();
  if (!persist) return cloud;

  if (cloud.enterpriseCustomerId) {
    await upsertPlatformConfigurationValue({
      key: 'ONPREM_ENTERPRISE_CUSTOMER_ID',
      value: cloud.enterpriseCustomerId,
      dataType: 'string',
      description: 'Cloud enterprise customer identifier linked to this on-prem deployment',
    });
  }
  if (cloud.enterpriseSystemId) {
    await upsertPlatformConfigurationValue({
      key: 'ONPREM_ENTERPRISE_SYSTEM_ID',
      value: cloud.enterpriseSystemId,
      dataType: 'string',
      description: 'Cloud enterprise system identifier linked to this on-prem deployment',
    });
  }
  if (cloud.matched) {
    await upsertPlatformConfigurationValue({
      key: 'ONPREM_REGISTRATION_STATUS',
      value: 'registered',
      dataType: 'string',
      description: 'Cloud registration state for this on-prem deployment',
    });
  }

  await upsertPlatformConfigurationValue({
    key: 'ONPREM_BUSINESS_PROFILE_LOCK',
    value: JSON.stringify({
      readOnly: cloud.readOnly,
      authoritativeSystemType: cloud.authoritativeSystemType,
      reason: cloud.readOnly ? 'managed_by_higher_track_system' : 'local_track_is_authoritative',
      updatedAt: new Date().toISOString(),
    }),
    dataType: 'json',
    description: 'On-prem business profile edit lock based on higher-track authority',
  });

  if (cloud.cloudProfile) {
    await upsertPlatformConfigurationValue({
      key: 'ONPREM_BUSINESS_PROFILE',
      value: JSON.stringify({
        ...cloud.cloudProfile,
        updatedAt: new Date().toISOString(),
      }),
      dataType: 'json',
      description: 'On-prem customer business profile synced to cloud enterprise portal',
    });
  }

  return cloud;
}

async function getReissueStatus() {
  const [row] = await db
    .select({ value: platformConfiguration.value })
    .from(platformConfiguration)
    .where(eq(platformConfiguration.key, 'ONPREM_LICENSE_REISSUE_REQUIRED'))
    .limit(1);
  if (!row?.value) return null;
  try {
    const parsed = JSON.parse(row.value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

async function getMainOrganizationContext() {
  const [mainOrgCfg] = await db
    .select({ value: platformConfiguration.value })
    .from(platformConfiguration)
    .where(eq(platformConfiguration.key, 'ONPREM_MAIN_ORGANIZATION_ID'))
    .limit(1);

  const mainOrganizationId = mainOrgCfg?.value ? String(mainOrgCfg.value) : null;
  if (!mainOrganizationId) {
    return { mainOrganizationId: null, mainOrganizationName: null };
  }

  const [mainOrg] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, mainOrganizationId))
    .limit(1);

  return {
    mainOrganizationId,
    mainOrganizationName: mainOrg?.name || null,
  };
}

async function replaceOnpremLicenseStateFromRenewal(params: {
  licenseKeyData: string;
  hardwareKey: string;
  hostname: string;
  serverBaseUrl: string;
  systemType: 'development' | 'qa' | 'production';
  expiresAt: Date;
}) {
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(onpremLicenseState);
    if (rows.length > 0) {
      const [primary, ...duplicates] = rows;
      await tx
        .update(onpremLicenseState)
        .set({
          licenseKeyData: params.licenseKeyData,
          hardwareKey: params.hardwareKey,
          hostname: params.hostname,
          serverBaseUrl: params.serverBaseUrl,
          systemType: params.systemType,
          installedAt: new Date(),
          expiresAt: params.expiresAt,
          isValid: true,
          lastValidatedAt: new Date(),
        })
        .where(eq(onpremLicenseState.id, primary.id));

      for (const duplicate of duplicates) {
        await tx.delete(onpremLicenseState).where(eq(onpremLicenseState.id, duplicate.id));
      }
      return;
    }

    await tx.insert(onpremLicenseState).values({
      licenseKeyData: params.licenseKeyData,
      hardwareKey: params.hardwareKey,
      hostname: params.hostname,
      serverBaseUrl: params.serverBaseUrl,
      systemType: params.systemType,
      installedAt: new Date(),
      expiresAt: params.expiresAt,
      isValid: true,
      lastValidatedAt: new Date(),
    });
  });
}

export async function syncOnpremBusinessProfileToCloud(params: {
  businessProfile: NonNullable<OnpremBusinessProfile>;
  systemType: string | null | undefined;
  hardwareKey: string;
  hostname: string;
  serverBaseUrl: string;
  enterpriseCustomerId?: string | null;
}) {
  await hydrateOnpremSyncCredentialFromConfig();
  const runtimeStage = resolveRuntimeStage();
  const portalBaseUrl = getEnterprisePortalBaseUrl();
  const endpoint = `${portalBaseUrl}/api/enterprise/public/onprem/business-profile-sync`;
  const rawMainOrganization = await getMainOrganizationContext();
  const mainOrganization = runtimeStage === 'prd'
    ? rawMainOrganization
    : { mainOrganizationId: null, mainOrganizationName: null };
  const syncPayload = {
    businessProfile: params.businessProfile,
    systemType: normalizeOnpremSystemTypeInput(params.systemType),
    hardwareKey: params.hardwareKey,
    hostname: params.hostname,
    serverBaseUrl: params.serverBaseUrl,
    rootBaseDomain: canonicalBaseDomainKey(params.serverBaseUrl),
    enterpriseCustomerId: params.enterpriseCustomerId || null,
    mainOrganization,
  };
  const result = await postSignedOnpremJson(endpoint, syncPayload);
  const upstream = result.response;
  const upstreamData = result.data || {};
  await applyCloudSyncAuthCredentialFromResponse(upstreamData);
  if (!upstream.ok) {
    const err = new Error(upstreamData?.error || 'Business profile sync failed');
    (err as any).status = upstream.status;
    (err as any).details = upstreamData;
    throw err;
  }

  return upstreamData;
}

export async function requestOnpremLicenseReissue(params: {
  reason?: string;
  changedFields?: string[];
}) {
  await hydrateOnpremSyncCredentialFromConfig();
  const runtimeStage = resolveRuntimeStage();
  const businessProfile = await getBusinessProfile();
  const completeness = evaluateBusinessProfileCompleteness(businessProfile);
  if (!completeness.isComplete) {
    const err: any = new Error(`Business profile is incomplete: ${completeness.missingFields.join(', ')}`);
    err.status = 400;
    err.details = { missingFields: completeness.missingFields };
    throw err;
  }

  const [license] = await db.select().from(onpremLicenseState).limit(1);
  if (!license?.licenseKeyData) {
    const err: any = new Error('No installed license found. Import a valid license before requesting reissue.');
    err.status = 409;
    throw err;
  }

  const enterpriseCustomerId = await getEnterpriseCustomerIdFromConfig();
  const portalBaseUrl = getEnterprisePortalBaseUrl();
  const endpoint = `${portalBaseUrl}/api/enterprise/public/onprem/request-reissue`;

  const rawMainOrganization = await getMainOrganizationContext();
  const mainOrganization = runtimeStage === 'prd'
    ? rawMainOrganization
    : { mainOrganizationId: null, mainOrganizationName: null };

  const reissuePayload = {
    licenseKeyData: license.licenseKeyData,
    systemType: normalizeOnpremSystemTypeInput(process.env.SYSTEM_TYPE),
    enterpriseCustomerId: enterpriseCustomerId || null,
    businessProfile,
    hardwareKey: generateHardwareKey(),
    hostname: os.hostname(),
    serverBaseUrl: getLocalServerBaseUrl(),
    rootBaseDomain: canonicalBaseDomainKey(getLocalServerBaseUrl()),
    reason: params.reason || 'Business identity changed',
    changedFields: Array.isArray(params.changedFields) ? params.changedFields : [],
    mainOrganization,
  };
  const result = await postSignedOnpremJson(endpoint, reissuePayload);
  const upstream = result.response;
  const upstreamData = result.data || {};
  await applyCloudSyncAuthCredentialFromResponse(upstreamData);
  if (!upstream.ok) {
    const err: any = new Error(upstreamData?.error || 'Failed to submit reissue request');
    err.status = upstream.status;
    err.details = upstreamData;
    throw err;
  }

  await publishOnpremRemoteLicenseStatus(
    'reissue_requested',
    `Replacement request ${upstreamData?.request?.id || ''} submitted and awaiting SuperAdmin approval.`,
  );

  return upstreamData;
}

export async function runOnpremLicenseCheckIn(): Promise<any> {
  await hydrateOnpremSyncCredentialFromConfig();
  const runtimeStage = resolveRuntimeStage();
  let hydrationResult: OnpremCloudProfileReadResult | null = null;
  try {
    hydrationResult = await hydrateOnpremBusinessProfileFromCloud({ persist: true });
  } catch (error) {
    console.warn('[OnpremLicenseSync] Cloud profile hydration before check-in failed:', error);
  }

  let [license] = await db
    .select()
    .from(onpremLicenseState)
    .limit(1);
  let localLicenseDecodeError: string | null = null;
  if (license?.licenseKeyData) {
    try {
      verifyAndDecodeLicenseKey(license.licenseKeyData);
    } catch (error: any) {
      localLicenseDecodeError = error?.message || 'Installed license failed local signature verification';
    }
  }

  const businessProfile = await getBusinessProfile();
  const completeness = evaluateBusinessProfileCompleteness(businessProfile);
  const hasCloudLinkHint = !!(await getEnterpriseCustomerIdFromConfig()) || !!(await getEnterpriseSystemIdFromConfig());
  const allowIncompleteByCloudMatch = hydrationResult?.matched === true || hasCloudLinkHint || !!license?.licenseKeyData;
  if (!completeness.isComplete && !allowIncompleteByCloudMatch) {
    await publishOnpremRemoteLicenseStatus('incomplete_profile', 'Business profile is incomplete. Complete required fields before cloud check-in.');
    const err: any = new Error('Business profile is incomplete. Complete all required business fields before cloud check-in.');
    err.status = 400;
    err.details = { missingFields: completeness.missingFields };
    throw err;
  }
  const reissueStatus = await getReissueStatus();
  if (reissueStatus?.required) {
    await publishOnpremRemoteLicenseStatus('reissue_required', 'Business identity change requires a new approved license before further cloud check-ins.');
    const err: any = new Error('Business identity change requires a new approved license before further cloud check-ins.');
    err.status = 409;
    err.details = reissueStatus;
    throw err;
  }
  const telemetry = await collectDailyTelemetry();
  const alertEmails = runtimeStage === 'prd' ? await collectContactEmails() : [];
  const rawMainOrganization = await getMainOrganizationContext();
  const mainOrganization = runtimeStage === 'prd'
    ? rawMainOrganization
    : { mainOrganizationId: null, mainOrganizationName: null };

  const cloudStatusToLocalValidity = async (statusRaw: unknown, reasonRaw?: unknown) => {
    const status = String(statusRaw || '').trim().toLowerCase();
    const reason = String(reasonRaw || '').trim() || null;
    const isCloudActive = status === 'active' || status === 'grace';

    const [current] = await db.select().from(onpremLicenseState).limit(1);
    if (current?.id) {
      await db
        .update(onpremLicenseState)
        .set({
          isValid: isCloudActive,
          lastValidatedAt: new Date(),
        })
        .where(eq(onpremLicenseState.id, current.id));
    }

    await publishOnpremRemoteLicenseStatus(isCloudActive ? 'active' : (status || 'inactive'), reason);
  };

  let bootstrap: {
    attempted: boolean;
    installed: boolean;
    requestStatus: string | null;
    requestId: string | null;
    message: string | null;
  } = {
    attempted: false,
    installed: false,
    requestStatus: null,
    requestId: null,
    message: null,
  };

  if (!license || !license.licenseKeyData || !!localLicenseDecodeError) {
    bootstrap.attempted = true;
    if (localLicenseDecodeError) {
      bootstrap.message = `Installed key is not locally verifiable (${localLicenseDecodeError}). Attempting cloud bootstrap recovery.`;
    }
    const portalBaseUrl = getEnterprisePortalBaseUrl();
    const bootstrapEndpoint = `${portalBaseUrl}/api/enterprise/public/onprem/business-profile-sync`;
    const hardwareKey = generateHardwareKey();
    const hostname = os.hostname();
    const enterpriseCustomerId = await getEnterpriseCustomerIdFromConfig();
    const bootstrapPayload = {
      businessProfile,
      systemType: normalizeOnpremSystemTypeInput(process.env.SYSTEM_TYPE),
      hardwareKey,
      hostname,
      serverBaseUrl: getLocalServerBaseUrl(),
      rootBaseDomain: canonicalBaseDomainKey(getLocalServerBaseUrl()),
      enterpriseCustomerId: enterpriseCustomerId || null,
      requestBootstrapKey: true,
      mainOrganization,
    };
    const bootstrapResult = await postSignedOnpremJson(bootstrapEndpoint, bootstrapPayload);
    const upstreamBootstrap = bootstrapResult.response;
    const bootstrapData: any = bootstrapResult.data || {};
    await applyCloudSyncAuthCredentialFromResponse(bootstrapData);
    if (!upstreamBootstrap.ok) {
      const err = new Error(bootstrapData?.error || 'Bootstrap sync failed');
      (err as any).status = upstreamBootstrap.status;
      (err as any).details = bootstrapData;
      throw err;
    }

    bootstrap.requestStatus = String(bootstrapData?.licenseRequest?.status || '').trim() || null;
    bootstrap.requestId = String(bootstrapData?.licenseRequest?.id || '').trim() || null;
    bootstrap.message = String(bootstrapData?.message || '').trim() || null;

    const bootstrapEnterpriseCustomerId = String(bootstrapData?.enterpriseCustomerId || '').trim();
    const bootstrapEnterpriseSystemId = String(bootstrapData?.enterpriseSystemId || '').trim();
    if (bootstrapEnterpriseCustomerId) {
      await upsertPlatformConfigurationValue({
        key: 'ONPREM_ENTERPRISE_CUSTOMER_ID',
        value: bootstrapEnterpriseCustomerId,
        dataType: 'string',
        description: 'Cloud enterprise customer identifier linked to this on-prem deployment',
      });
    }
    if (bootstrapEnterpriseSystemId) {
      await upsertPlatformConfigurationValue({
        key: 'ONPREM_ENTERPRISE_SYSTEM_ID',
        value: bootstrapEnterpriseSystemId,
        dataType: 'string',
        description: 'Cloud enterprise system identifier linked to this on-prem deployment',
      });
    }
    await upsertPlatformConfigurationValue({
      key: 'ONPREM_REGISTRATION_STATUS',
      value: String(bootstrapData?.registrationStatus || bootstrap.requestStatus || 'pending_registration'),
      dataType: 'string',
      description: 'Cloud registration state for this on-prem deployment',
    });

    const bootstrapKeyData = typeof bootstrapData?.bootstrapLicense?.licenseKeyData === 'string'
      ? bootstrapData.bootstrapLicense.licenseKeyData.trim()
      : '';

    if (bootstrapKeyData) {
      const payload = verifyAndDecodeLicenseKey(bootstrapKeyData);
      const expiryDate = new Date(payload.expiresAt);
      const envSystemType = parseOnpremSystemType(process.env.SYSTEM_TYPE);
      const keySystemType = parseOnpremSystemType(payload.systemType);

      if (!isLocalHardwareKeyMatch(payload.hardwareKey)) {
        throw new Error('Bootstrap key hardware mismatch');
      }
      if (payload.hostname !== hostname) {
        throw new Error(`Bootstrap key hostname mismatch (${payload.hostname} !== ${hostname})`);
      }
      if (!keySystemType) {
        throw new Error('Bootstrap key has invalid systemType');
      }
      if (envSystemType && envSystemType !== keySystemType) {
        throw new Error(`Bootstrap key type mismatch (${keySystemType} for ${envSystemType} system)`);
      }
      if (new Date() > expiryDate) {
        throw new Error('Bootstrap key received but already expired');
      }

      await replaceOnpremLicenseStateFromRenewal({
        licenseKeyData: bootstrapKeyData,
        hardwareKey: payload.hardwareKey,
        hostname: payload.hostname,
        serverBaseUrl: payload.serverBaseUrl,
        systemType: keySystemType,
        expiresAt: expiryDate,
      });
      bootstrap.installed = true;
    }

    [license] = await db
      .select()
      .from(onpremLicenseState)
      .limit(1);
  }

  if (!license) {
    await publishOnpremRemoteLicenseStatus('pending_approval', bootstrap?.message || 'No installed license found yet. Awaiting cloud approval or license bootstrap.');
    const err: any = new Error('No installed license found. A pending request has been created in cloud; approve it, then click Check In Now again.');
    err.status = 409;
    err.details = bootstrap;
    throw err;
  }
  if (!license.licenseKeyData) {
    await publishOnpremRemoteLicenseStatus('invalid_local_state', 'Installed license is missing key data.');
    const err: any = new Error('Installed license is missing key data');
    err.status = 409;
    err.details = bootstrap;
    throw err;
  }

  const portalBaseUrl = getEnterprisePortalBaseUrl();
  const endpoint = `${portalBaseUrl}/api/enterprise/public/onprem/check-in`;
  let enterpriseSystemId = await getEnterpriseSystemIdFromConfig();
  const enterpriseCustomerId = await getEnterpriseCustomerIdFromConfig();

  const postCheckIn = async (enterpriseSystemIdHint: string | null) => {
    const payload = {
      licenseKeyData: license.licenseKeyData,
      enterpriseSystemId: enterpriseSystemIdHint || null,
      enterpriseCustomerId: enterpriseCustomerId || null,
      rootBaseDomain: canonicalBaseDomainKey(getLocalServerBaseUrl()),
      telemetry: [],
      alertEmails,
      businessProfile,
      mainOrganization,
    };
    return postSignedOnpremJson(endpoint, payload);
  };

  let checkInResult = await postCheckIn(enterpriseSystemId);
  let upstream = checkInResult.response;
  let upstreamData: any = checkInResult.data || {};
  await applyCloudSyncAuthCredentialFromResponse(upstreamData);

  const remoteStatusFirst = String(upstreamData?.status || '').trim().toLowerCase();
  const suggestedEnterpriseSystemId = String(upstreamData?.enterpriseSystemId || '').trim() || null;
  if (
    !upstream.ok &&
    remoteStatusFirst === 'identity_mismatch' &&
    suggestedEnterpriseSystemId &&
    suggestedEnterpriseSystemId !== enterpriseSystemId
  ) {
    await upsertPlatformConfigurationValue({
      key: 'ONPREM_ENTERPRISE_SYSTEM_ID',
      value: suggestedEnterpriseSystemId,
      dataType: 'string',
      description: 'Cloud enterprise system identifier linked to this on-prem deployment',
    });
    enterpriseSystemId = suggestedEnterpriseSystemId;
    checkInResult = await postCheckIn(enterpriseSystemId);
    upstream = checkInResult.response;
    upstreamData = checkInResult.data || {};
    await applyCloudSyncAuthCredentialFromResponse(upstreamData);
  }

  if (!upstream.ok) {
    let remoteStatus = String(upstreamData?.status || '').trim().toLowerCase();
    let remoteReason = String(upstreamData?.error || upstreamData?.message || '').trim() || null;
    const looksLikeDeletedCustomer =
      remoteStatus === 'customer_deleted' ||
      /customer deleted by superadmin/i.test(String(remoteReason || ''));

    if (looksLikeDeletedCustomer) {
      try {
        const bootstrapEndpoint = `${portalBaseUrl}/api/enterprise/public/onprem/business-profile-sync`;
        const bootstrapPayload = {
          businessProfile,
          systemType: normalizeOnpremSystemTypeInput(process.env.SYSTEM_TYPE),
          hardwareKey: generateHardwareKey(),
          hostname: os.hostname(),
          serverBaseUrl: getLocalServerBaseUrl(),
          rootBaseDomain: canonicalBaseDomainKey(getLocalServerBaseUrl()),
          enterpriseCustomerId: enterpriseCustomerId || null,
          requestBootstrapKey: true,
          mainOrganization,
        };
        const recoveryBootstrapResult = await postSignedOnpremJson(bootstrapEndpoint, bootstrapPayload);
        const recoveryBootstrapResponse = recoveryBootstrapResult.response;
        const recoveryBootstrapData: any = recoveryBootstrapResult.data || {};
        await applyCloudSyncAuthCredentialFromResponse(recoveryBootstrapData);

        if (recoveryBootstrapResponse.ok) {
          const bootstrapEnterpriseCustomerId = String(recoveryBootstrapData?.enterpriseCustomerId || '').trim();
          const bootstrapEnterpriseSystemId = String(recoveryBootstrapData?.enterpriseSystemId || '').trim();
          if (bootstrapEnterpriseCustomerId) {
            await upsertPlatformConfigurationValue({
              key: 'ONPREM_ENTERPRISE_CUSTOMER_ID',
              value: bootstrapEnterpriseCustomerId,
              dataType: 'string',
              description: 'Cloud enterprise customer identifier linked to this on-prem deployment',
            });
          }
          if (bootstrapEnterpriseSystemId) {
            await upsertPlatformConfigurationValue({
              key: 'ONPREM_ENTERPRISE_SYSTEM_ID',
              value: bootstrapEnterpriseSystemId,
              dataType: 'string',
              description: 'Cloud enterprise system identifier linked to this on-prem deployment',
            });
            enterpriseSystemId = bootstrapEnterpriseSystemId;
          }
          await upsertPlatformConfigurationValue({
            key: 'ONPREM_REGISTRATION_STATUS',
            value: String(recoveryBootstrapData?.registrationStatus || 'registered_pending_approval'),
            dataType: 'string',
            description: 'Cloud registration state for this on-prem deployment',
          });

          const bootstrapKeyData = typeof recoveryBootstrapData?.bootstrapLicense?.licenseKeyData === 'string'
            ? recoveryBootstrapData.bootstrapLicense.licenseKeyData.trim()
            : '';

          if (bootstrapKeyData) {
            const decoded = verifyAndDecodeLicenseKey(bootstrapKeyData);
            const expiryDate = new Date(decoded.expiresAt);
            const envSystemType = parseOnpremSystemType(process.env.SYSTEM_TYPE);
            const keySystemType = parseOnpremSystemType(decoded.systemType);
            if (!isLocalHardwareKeyMatch(decoded.hardwareKey)) {
              throw new Error('Recovery bootstrap key hardware mismatch');
            }
            if (decoded.hostname !== os.hostname()) {
              throw new Error(`Recovery bootstrap key hostname mismatch (${decoded.hostname} !== ${os.hostname()})`);
            }
            if (!keySystemType) {
              throw new Error('Recovery bootstrap key has invalid systemType');
            }
            if (envSystemType && envSystemType !== keySystemType) {
              throw new Error(`Recovery bootstrap key type mismatch (${keySystemType} for ${envSystemType} system)`);
            }
            if (new Date() > expiryDate) {
              throw new Error('Recovery bootstrap key received but already expired');
            }

            await replaceOnpremLicenseStateFromRenewal({
              licenseKeyData: bootstrapKeyData,
              hardwareKey: decoded.hardwareKey,
              hostname: decoded.hostname,
              serverBaseUrl: decoded.serverBaseUrl,
              systemType: keySystemType,
              expiresAt: expiryDate,
            });
          }

          const recoveredCheckIn = await postCheckIn(enterpriseSystemId);
          upstream = recoveredCheckIn.response;
          upstreamData = recoveredCheckIn.data || {};
          await applyCloudSyncAuthCredentialFromResponse(upstreamData);
          remoteStatus = String(upstreamData?.status || '').trim().toLowerCase();
          remoteReason = String(upstreamData?.error || upstreamData?.message || '').trim() || null;
        } else {
          remoteStatus = String(recoveryBootstrapData?.status || remoteStatus || '').trim().toLowerCase();
          remoteReason = String(recoveryBootstrapData?.error || recoveryBootstrapData?.message || remoteReason || '').trim() || null;
        }
      } catch (recoveryError: any) {
        console.warn('[OnpremLicenseSync] Customer-delete recovery bootstrap failed:', recoveryError?.message || recoveryError);
      }
    }

    if (!upstream.ok) {
      if (remoteStatus) {
        await cloudStatusToLocalValidity(remoteStatus, remoteReason);
      } else if (upstream.status === 403) {
        await cloudStatusToLocalValidity('inactive', remoteReason || 'Cloud control plane rejected this license check-in.');
      }
      const err = new Error(upstreamData?.error || 'Check-in failed');
      (err as any).status = upstream.status;
      (err as any).details = upstreamData;
      throw err;
    }
  }

  let importedRenewal = false;
  let renewalError: string | null = null;

  const renewalKeyData = typeof upstreamData?.renewal?.licenseKeyData === 'string'
    ? upstreamData.renewal.licenseKeyData.trim()
    : '';

  if (renewalKeyData) {
    try {
      const payload = verifyAndDecodeLicenseKey(renewalKeyData);
      const localHostname = os.hostname();
      const expiryDate = new Date(payload.expiresAt);

      if (!isLocalHardwareKeyMatch(payload.hardwareKey)) {
        throw new Error('Renewal key hardware mismatch');
      }
      if (payload.hostname !== localHostname) {
        throw new Error(`Renewal key hostname mismatch (${payload.hostname} !== ${localHostname})`);
      }

      const envSystemType = parseOnpremSystemType(process.env.SYSTEM_TYPE);
      const renewalType = parseOnpremSystemType(payload.systemType);
      if (!renewalType) {
        throw new Error('Renewal key has invalid systemType');
      }
      if (envSystemType && envSystemType !== renewalType) {
        throw new Error(`Renewal key type mismatch (${renewalType} for ${envSystemType} system)`);
      }
      if (new Date() > expiryDate) {
        throw new Error('Renewal key received but already expired');
      }

      await replaceOnpremLicenseStateFromRenewal({
        licenseKeyData: renewalKeyData,
        hardwareKey: payload.hardwareKey,
        hostname: payload.hostname,
        serverBaseUrl: payload.serverBaseUrl,
        systemType: renewalType,
        expiresAt: expiryDate,
      });
      importedRenewal = true;
    } catch (error: any) {
      renewalError = error?.message || 'Failed to import renewal key';
    }
  }

  const authoritativeStatus = String(upstreamData?.status || '').trim().toLowerCase();
  const authoritativeReason = String(upstreamData?.reason || '').trim() || null;
  await cloudStatusToLocalValidity(authoritativeStatus, authoritativeReason);

  if (String(upstreamData?.enterpriseCustomerId || '').trim()) {
    await upsertPlatformConfigurationValue({
      key: 'ONPREM_ENTERPRISE_CUSTOMER_ID',
      value: String(upstreamData.enterpriseCustomerId).trim(),
      dataType: 'string',
      description: 'Cloud enterprise customer identifier linked to this on-prem deployment',
    });
  }
  if (String(upstreamData?.enterpriseSystemId || '').trim()) {
    await upsertPlatformConfigurationValue({
      key: 'ONPREM_ENTERPRISE_SYSTEM_ID',
      value: String(upstreamData.enterpriseSystemId).trim(),
      dataType: 'string',
      description: 'Cloud enterprise system identifier linked to this on-prem deployment',
    });
  }
  await upsertPlatformConfigurationValue({
    key: 'ONPREM_REGISTRATION_STATUS',
    value: String(upstreamData?.registrationStatus || 'registered'),
    dataType: 'string',
    description: 'Cloud registration state for this on-prem deployment',
  });

  const cloudRoyaltyPercentage = clampRoyaltyPercentage(upstreamData?.systemRoyaltyPercentage);
  if (cloudRoyaltyPercentage !== null) {
    await upsertPlatformConfigurationValue({
      key: 'ONPREM_SYSTEM_ROYALTY_PERCENTAGE',
      value: cloudRoyaltyPercentage.toFixed(2),
      dataType: 'decimal',
      description: 'Royalty percentage for this on-prem track, enforced from cloud PRD license check-in',
    });
    await enforceOnpremRoyaltyFromCloud(cloudRoyaltyPercentage);
  }

  await postMetricsTelemetryNonBlocking({
    stage: runtimeStage,
    telemetry,
    licenseKeyData: license.licenseKeyData,
    enterpriseCustomerId: String(upstreamData?.enterpriseCustomerId || enterpriseCustomerId || '').trim() || null,
    enterpriseSystemId: String(upstreamData?.enterpriseSystemId || enterpriseSystemId || '').trim() || null,
  });

  await propagateLicenseStatusToLowerCloudsNonBlocking({
    status: authoritativeStatus,
    reason: authoritativeReason,
    licenseKeyData: license.licenseKeyData,
    systemType: parseOnpremSystemType(process.env.SYSTEM_TYPE),
    enterpriseCustomerId: String(upstreamData?.enterpriseCustomerId || enterpriseCustomerId || '').trim() || null,
    enterpriseSystemId: String(upstreamData?.enterpriseSystemId || enterpriseSystemId || '').trim() || null,
  });

  const [updated] = await db.select().from(onpremLicenseState).limit(1);
  const expiresAt = updated?.expiresAt ? new Date(updated.expiresAt) : null;
  const daysUntilExpiry = expiresAt ? Math.floor((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;

  return {
    success: true,
    checkedInAt: new Date().toISOString(),
    bootstrap,
    controlPlane: upstreamData,
    importedRenewal,
    renewalError,
    localLicense: {
      systemType: updated?.systemType || null,
      expiresAt: safeIso(updated?.expiresAt),
      daysUntilExpiry,
      isValid: !!updated?.isValid,
    },
  };
}
