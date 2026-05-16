import { Express, Request, Response } from 'express';
import os from 'os';
import multer from 'multer';
import crypto from 'crypto';
import { db } from '../db';
import { eq, sql } from 'drizzle-orm';
import { onpremLicenseState, organizations, users, userOrganizationRoles, courseAssignments, courseProgress, courses, platformConfiguration } from '@shared/schema';
import { getBaseUrl } from '../config/base-url';
import {
  generateHardwareKey,
  encryptLicenseRequest,
  verifyAndDecodeLicenseKey,
  validateLicenseKey,
  isLocalHardwareKeyMatch,
  type LicenseRequestPayload,
} from '../services/licenseCryptoService';
import { isCustSuper } from '../adminAuth';
import {
  parseOnpremSystemType,
  normalizeOnpremSystemType,
  getOnpremLicenseStatus,
  type OnpremSystemType,
} from '../services/onpremLicenseStatus';
import {
  evaluateBusinessProfileCompleteness,
  runOnpremLicenseCheckIn,
  requestOnpremLicenseReissue,
  syncOnpremBusinessProfileToCloud,
  publishOnpremRemoteLicenseStatus,
  hydrateOnpremBusinessProfileFromCloud,
} from '../services/onpremLicenseSyncService';
import { getOnpremRolePolicy } from '../services/onpremLicensePolicy';
import { isOnPremMode } from '../featureFlags';

const upload = multer({ storage: multer.memoryStorage() });

function requireOnpremMode(req: Request, res: Response, next: any) {
  if (!isOnPremMode()) {
    return res.status(403).json({ error: 'This endpoint is only available in on-premises mode' });
  }
  next();
}

function parseJsonValue(value: string | null | undefined): any {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizedIdentityValue(input: unknown): string {
  return String(input || '').trim().toLowerCase();
}

function isValidPushSignature(expected: string, provided: string): boolean {
  const expectedBuf = Buffer.from(String(expected || '').trim(), 'utf-8');
  const providedBuf = Buffer.from(String(provided || '').trim(), 'utf-8');
  return expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf);
}

function isCalendarMonthLicenseLifetimeValid(issuedAt: Date, expiresAt: Date): boolean {
  if (Number.isNaN(issuedAt.getTime()) || Number.isNaN(expiresAt.getTime())) return false;
  const lifetimeMs = expiresAt.getTime() - issuedAt.getTime();
  if (lifetimeMs <= 0) return false;

  // Calendar-month licenses may be issued near month-end and renewed before expiry.
  // Allow up to ~2 months to safely cover "end of next month" renewal windows.
  const maxLifetimeMs = 62 * 24 * 60 * 60 * 1000;
  return lifetimeMs <= maxLifetimeMs;
}

async function upsertPlatformConfigurationValue(params: {
  key: string;
  value: string;
  dataType?: string;
  description?: string;
  isEditable?: boolean;
  userId?: string | null;
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
        lastModifiedBy: params.userId || null,
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
      isEditable: params.isEditable ?? true,
      lastModifiedBy: params.userId || null,
    });
}

async function replaceOnpremLicenseState(params: {
  licenseKeyData: string;
  hardwareKey: string;
  hostname: string;
  serverBaseUrl: string;
  systemType: string;
  expiresAt: Date;
}) {
  return db.transaction(async (tx) => {
    const existingRows = await tx.select().from(onpremLicenseState);

    if (existingRows.length > 0) {
      const [primary, ...duplicates] = existingRows;
      const [updated] = await tx
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
        .where(eq(onpremLicenseState.id, primary.id))
        .returning();

      for (const duplicate of duplicates) {
        await tx.delete(onpremLicenseState).where(eq(onpremLicenseState.id, duplicate.id));
      }
      return updated;
    }

    const [inserted] = await tx
      .insert(onpremLicenseState)
      .values({
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
      .returning();

    return inserted;
  });
}

export function registerOnpremLicenseRoutes(app: Express) {
  app.post('/api/onprem/license/push-update', requireOnpremMode, async (req: Request, res: Response) => {
    try {
      const sharedSecret = String(process.env.ONPREM_PUSH_SHARED_SECRET || '').trim();
      if (!sharedSecret) {
        return res.status(503).json({ error: 'Push update is not configured on this host' });
      }
      const signature = String(req.headers['x-lp-signature'] || '').trim();
      if (!signature) {
        return res.status(401).json({ error: 'Missing push signature' });
      }
      const bodyRaw = JSON.stringify(req.body || {});
      const expected = crypto.createHmac('sha256', sharedSecret).update(bodyRaw).digest('hex');
      if (!isValidPushSignature(expected, signature)) {
        return res.status(403).json({ error: 'Invalid push signature' });
      }

      const action = String(req.body?.action || '').trim().toLowerCase();
      if (action === 'activate') {
        const licenseKeyData = String(req.body?.licenseKeyData || '').trim();
        if (!licenseKeyData) {
          return res.status(400).json({ error: 'licenseKeyData is required for activate action' });
        }
        let licensePayload: any;
        try {
          licensePayload = verifyAndDecodeLicenseKey(licenseKeyData);
        } catch {
          return res.status(400).json({ error: 'Invalid license key data supplied' });
        }
        const localHostname = os.hostname();
        const envSystemType = parseOnpremSystemType(process.env.SYSTEM_TYPE);
        const licenseSystemType = parseOnpremSystemType(licensePayload.systemType);
        if (!licenseSystemType) {
          return res.status(400).json({ error: 'Invalid license system type' });
        }
        if (!isLocalHardwareKeyMatch(licensePayload.hardwareKey)) {
          return res.status(400).json({ error: 'Hardware key mismatch for pushed license' });
        }
        if (licensePayload.hostname !== localHostname) {
          return res.status(400).json({ error: 'Hostname mismatch for pushed license' });
        }
        if (envSystemType && envSystemType !== licenseSystemType) {
          return res.status(400).json({ error: 'System type mismatch for pushed license' });
        }
        const expiryDate = new Date(licensePayload.expiresAt);
        if (new Date() > expiryDate) {
          return res.status(400).json({ error: 'Pushed license is already expired' });
        }
        await replaceOnpremLicenseState({
          licenseKeyData,
          hardwareKey: licensePayload.hardwareKey,
          hostname: licensePayload.hostname,
          serverBaseUrl: licensePayload.serverBaseUrl,
          systemType: licenseSystemType,
          expiresAt: expiryDate,
        });
        await publishOnpremRemoteLicenseStatus('active', null);
        return res.json({ success: true, action: 'activate' });
      }

      if (action === 'deactivate') {
        const reason = String(req.body?.reason || 'License deactivated by cloud control plane').trim();
        const [currentLicense] = await db.select().from(onpremLicenseState).limit(1);
        if (currentLicense) {
          await db
            .update(onpremLicenseState)
            .set({
              isValid: false,
              lastValidatedAt: new Date(),
            })
            .where(eq(onpremLicenseState.id, currentLicense.id));
        }
        await publishOnpremRemoteLicenseStatus('revoked', reason);
        return res.json({ success: true, action: 'deactivate' });
      }

      return res.status(400).json({ error: 'Unsupported action. Use activate or deactivate.' });
    } catch (error) {
      console.error('[OnpremLicense] Push update error:', error);
      return res.status(500).json({ error: 'Failed to process license push update' });
    }
  });

  app.get('/api/onprem/license/business-profile', requireOnpremMode, isCustSuper, async (_req: Request, res: Response) => {
    try {
      const [row] = await db
        .select()
        .from(platformConfiguration)
        .where(eq(platformConfiguration.key, 'ONPREM_BUSINESS_PROFILE'))
        .limit(1);
      const profile = row?.value ? JSON.parse(row.value) : null;
      res.json({ profile });
    } catch (error) {
      console.error('[OnpremLicense] Error fetching business profile:', error);
      res.status(500).json({ error: 'Failed to fetch business profile' });
    }
  });

  app.put('/api/onprem/license/business-profile', requireOnpremMode, isCustSuper, async (req: Request, res: Response) => {
    try {
      const now = new Date();
      let hydratedAuthority: Awaited<ReturnType<typeof hydrateOnpremBusinessProfileFromCloud>> | null = null;
      try {
        hydratedAuthority = await hydrateOnpremBusinessProfileFromCloud({ persist: true });
      } catch (error) {
        console.warn('[OnpremLicense] Cloud authority hydration before save failed:', error);
      }

      if (hydratedAuthority?.matched && hydratedAuthority.readOnly) {
        return res.status(403).json({
          error: `Business profile is managed by ${hydratedAuthority.authoritativeSystemType.toUpperCase()} system track.`,
          profileLock: {
            readOnly: true,
            authoritativeSystemType: hydratedAuthority.authoritativeSystemType,
            reason: 'managed_by_higher_track_system',
            updatedAt: now.toISOString(),
          },
          cloudProfile: hydratedAuthority.cloudProfile,
        });
      }

      let payload: any = {
        businessName: String(req.body?.businessName || '').trim(),
        businessRegistrationNumber: String(req.body?.businessRegistrationNumber || '').trim(),
        businessAddress: String(req.body?.businessAddress || '').trim(),
        billingContactName: String(req.body?.billingContactName || '').trim(),
        billingContactEmail: String(req.body?.billingContactEmail || '').trim().toLowerCase(),
        billingContactPhone: String(req.body?.billingContactPhone || '').trim(),
        countryCode: String(req.body?.countryCode || '').trim(),
        vatNumber: String(req.body?.vatNumber || '').trim(),
        notes: String(req.body?.notes || '').trim(),
        updatedAt: now.toISOString(),
      };

      const [existingBusinessProfileRow] = await db
        .select({ value: platformConfiguration.value })
        .from(platformConfiguration)
        .where(eq(platformConfiguration.key, 'ONPREM_BUSINESS_PROFILE'))
        .limit(1);
      const previousProfile = parseJsonValue(existingBusinessProfileRow?.value || null);
      const completeness = evaluateBusinessProfileCompleteness(payload);
      const [existingEnterpriseCustomerRow] = await db
        .select({ value: platformConfiguration.value })
        .from(platformConfiguration)
        .where(eq(platformConfiguration.key, 'ONPREM_ENTERPRISE_CUSTOMER_ID'))
        .limit(1);

      let profileLock: {
        readOnly: boolean;
        authoritativeSystemType: string;
        reason: string;
        updatedAt: string;
      } = {
        readOnly: false,
        authoritativeSystemType: hydratedAuthority?.authoritativeSystemType || normalizeOnpremSystemType(process.env.SYSTEM_TYPE || 'development') || 'development',
        reason: 'local_track_is_authoritative',
        updatedAt: now.toISOString(),
      };

      let cloudSync: {
        attempted: boolean;
        success: boolean;
        message?: string;
        enterpriseCustomerId?: string;
        enterpriseSystemId?: string;
        registrationStatus?: string;
      } = {
        attempted: false,
        success: false,
      };

      if (completeness.isComplete) {
        try {
          cloudSync.attempted = true;
          const cloudResult = await syncOnpremBusinessProfileToCloud({
            businessProfile: payload,
            systemType: normalizeOnpremSystemType(process.env.SYSTEM_TYPE || null),
            hardwareKey: generateHardwareKey(),
            hostname: os.hostname(),
            serverBaseUrl: getBaseUrl(),
            enterpriseCustomerId: String(existingEnterpriseCustomerRow?.value || '').trim() || null,
          });
          cloudSync.success = true;
          cloudSync.message = cloudResult?.message || 'Business profile synced to cloud enterprise portal.';
          cloudSync.enterpriseCustomerId = cloudResult?.enterpriseCustomerId || undefined;
          cloudSync.enterpriseSystemId = cloudResult?.enterpriseSystemId || undefined;
          cloudSync.registrationStatus = cloudResult?.registrationStatus || undefined;

          if (cloudResult?.readOnly) {
            const cloudProfile = parseJsonValue(JSON.stringify(cloudResult?.cloudProfile || {})) || {};
            payload = {
              ...payload,
              ...cloudProfile,
              updatedAt: now.toISOString(),
            };
            profileLock = {
              readOnly: true,
              authoritativeSystemType: String(cloudResult?.authoritativeSystemType || profileLock.authoritativeSystemType),
              reason: 'managed_by_higher_track_system',
              updatedAt: now.toISOString(),
            };
            cloudSync.message = cloudResult?.message || `Business profile is managed by ${profileLock.authoritativeSystemType.toUpperCase()} track. Local edits were not applied.`;
          } else {
            profileLock = {
              readOnly: false,
              authoritativeSystemType: String(cloudResult?.authoritativeSystemType || profileLock.authoritativeSystemType),
              reason: 'local_track_is_authoritative',
              updatedAt: now.toISOString(),
            };
          }
        } catch (syncError: any) {
          cloudSync.success = false;
          cloudSync.message = syncError?.message || 'Business profile saved locally; cloud sync failed';
        }
      } else {
        cloudSync.message = `Saved locally. Complete all required fields before cloud sync: ${completeness.missingFields.join(', ')}`;
      }

      const [installedLicense] = await db
        .select()
        .from(onpremLicenseState)
        .limit(1);

      const changedIdentityFields: string[] = [];
      if (!profileLock.readOnly && normalizedIdentityValue(previousProfile?.businessName) !== normalizedIdentityValue(payload.businessName)) {
        changedIdentityFields.push('businessName');
      }
      if (!profileLock.readOnly && normalizedIdentityValue(previousProfile?.businessRegistrationNumber) !== normalizedIdentityValue(payload.businessRegistrationNumber)) {
        changedIdentityFields.push('businessRegistrationNumber');
      }
      if (!profileLock.readOnly && normalizedIdentityValue(previousProfile?.vatNumber) !== normalizedIdentityValue(payload.vatNumber)) {
        changedIdentityFields.push('vatNumber');
      }

      const reissueRequired = changedIdentityFields.length > 0 && !!installedLicense;
      const reissuePayload = reissueRequired ? {
        required: true,
        changedFields: changedIdentityFields,
        requestedAt: now.toISOString(),
        message: 'Business identity changed. SuperAdmin approval is required for a replacement license.',
      } : {
        required: false,
        changedFields: [],
        clearedAt: now.toISOString(),
      };

      await upsertPlatformConfigurationValue({
        key: 'ONPREM_BUSINESS_PROFILE',
        value: JSON.stringify(payload),
        dataType: 'json',
        description: 'On-prem customer business profile synced to cloud enterprise portal',
        userId: req.session.userId || null,
      });
      await upsertPlatformConfigurationValue({
        key: 'ONPREM_LICENSE_REISSUE_REQUIRED',
        value: JSON.stringify(reissuePayload),
        dataType: 'json',
        description: 'On-prem license reissue status after identity/profile changes',
        userId: req.session.userId || null,
      });
      await upsertPlatformConfigurationValue({
        key: 'ONPREM_BUSINESS_PROFILE_LOCK',
        value: JSON.stringify(profileLock),
        dataType: 'json',
        description: 'On-prem business profile edit lock based on higher-track authority',
        userId: req.session.userId || null,
      });
      if (cloudSync.enterpriseCustomerId) {
        await upsertPlatformConfigurationValue({
          key: 'ONPREM_ENTERPRISE_CUSTOMER_ID',
          value: String(cloudSync.enterpriseCustomerId),
          dataType: 'string',
          description: 'Cloud enterprise customer identifier linked to this on-prem deployment',
          userId: req.session.userId || null,
        });
      }
      if (String(cloudSync.enterpriseSystemId || '').trim()) {
        await upsertPlatformConfigurationValue({
          key: 'ONPREM_ENTERPRISE_SYSTEM_ID',
          value: String(cloudSync.enterpriseSystemId).trim(),
          dataType: 'string',
          description: 'Cloud enterprise system identifier linked to this on-prem deployment',
          userId: req.session.userId || null,
        });
      }
      await upsertPlatformConfigurationValue({
        key: 'ONPREM_REGISTRATION_STATUS',
        value: String(cloudSync.registrationStatus || (cloudSync.success ? 'registered' : 'pending_registration')),
        dataType: 'string',
        description: 'Cloud registration state for this on-prem deployment',
        userId: req.session.userId || null,
      });

      if (reissueRequired) {
        await publishOnpremRemoteLicenseStatus(
          'reissue_required',
          `Business identity fields changed (${changedIdentityFields.join(', ')}). A newly approved license must be issued before next cloud check-in.`,
        );
        cloudSync.message = cloudSync.message
          ? `${cloudSync.message} Business identity changed; request and approve a replacement license.`
          : 'Saved locally. Business identity changed; request and approve a replacement license.';
      } else if (installedLicense?.licenseKeyData) {
        await publishOnpremRemoteLicenseStatus(
          'pending_cloud_confirm',
          'Local license present. Final activation requires cloud PRD check-in confirmation.',
        );
      }

      res.json({
        success: true,
        profile: payload,
        completeness,
        reissueRequired,
        changedIdentityFields,
        profileLock,
        cloudSync,
      });
    } catch (error) {
      console.error('[OnpremLicense] Error saving business profile:', error);
      res.status(500).json({ error: 'Failed to save business profile' });
    }
  });

  app.get('/api/onprem/license/system-info', requireOnpremMode, isCustSuper, async (req: Request, res: Response) => {
    try {
      try {
        await hydrateOnpremBusinessProfileFromCloud({ persist: true });
      } catch (error) {
        console.warn('[OnpremLicense] Cloud profile hydration during system-info failed:', error);
      }

      const hardwareKey = generateHardwareKey();
      const hostname = os.hostname();
      const baseUrl = getBaseUrl();
      const effectiveLicenseStatus = await getOnpremLicenseStatus();

      const [existingLicense] = await db
        .select()
        .from(onpremLicenseState)
        .limit(1);

      let currentLicense = null;
      if (existingLicense) {
        const now = new Date();
        const expiresAt = existingLicense.expiresAt ? new Date(existingLicense.expiresAt) : null;
        const isExpired = expiresAt ? now > expiresAt : false;
        const toleranceMs = 15 * 60 * 1000;
        const tamperDetected =
          (existingLicense.installedAt ? now.getTime() + toleranceMs < new Date(existingLicense.installedAt).getTime() : false) ||
          (existingLicense.lastValidatedAt ? now.getTime() + toleranceMs < new Date(existingLicense.lastValidatedAt).getTime() : false);
        let monthlyLifetimeValid = true;
        try {
          const decoded = verifyAndDecodeLicenseKey(existingLicense.licenseKeyData);
          const issuedAt = new Date(decoded.issuedAt);
          const expiresAtDecoded = new Date(decoded.expiresAt);
          monthlyLifetimeValid = isCalendarMonthLicenseLifetimeValid(issuedAt, expiresAtDecoded);
        } catch {
          monthlyLifetimeValid = false;
        }
        const hasStrictValidLicense = !!existingLicense.isValid && !isExpired && !tamperDetected && monthlyLifetimeValid;
        const hasCloudAuthoritativeLicense = hasStrictValidLicense && !!effectiveLicenseStatus.hasValidLicense;

        currentLicense = {
          status: isExpired ? 'expired' : (hasCloudAuthoritativeLicense ? 'active' : 'invalid'),
          installedDate: existingLicense.installedAt,
          expiryDate: existingLicense.expiresAt,
          systemType: existingLicense.systemType,
          monthlyFee: null as string | null,
          feeCurrency: null as string | null,
          companyName: null as string | null,
          nextRenewalDueAt: null as string | null,
        };
        try {
          const decoded = verifyAndDecodeLicenseKey(existingLicense.licenseKeyData);
          currentLicense.monthlyFee = decoded.monthlyFee || null;
          currentLicense.feeCurrency = decoded.feeCurrency || null;
          currentLicense.companyName = decoded.companyName || null;
          currentLicense.nextRenewalDueAt = decoded.nextRenewalDueAt || decoded.expiresAt || null;
        } catch {
          // Keep license display resilient if old key cannot be decoded.
        }
      }

      const policy = await getOnpremRolePolicy();
      const orgRows = await db.select({ id: organizations.id, name: organizations.name }).from(organizations);
      const organizationMetrics: Array<{
        organizationId: string;
        organizationName: string;
        totalUsers: number;
        totalCourses: number;
        totalEnrollments: number;
        totalAssignments: number;
      }> = [];
      for (const org of orgRows) {
        const [usersCount] = await db
          .select({ value: sql<number>`count(distinct ${userOrganizationRoles.userId})::int` })
          .from(userOrganizationRoles)
          .where(eq(userOrganizationRoles.organizationId, org.id));
        const [coursesCount] = await db
          .select({ value: sql<number>`count(*)::int` })
          .from(courses)
          .where(eq(courses.organizationId, org.id));
        const [enrollmentsCount] = await db
          .select({ value: sql<number>`count(*)::int` })
          .from(courseProgress)
          .where(eq(courseProgress.organizationId, org.id));
        const [assignmentsCount] = await db
          .select({ value: sql<number>`count(*)::int` })
          .from(courseAssignments)
          .where(eq(courseAssignments.organizationId, org.id));
        organizationMetrics.push({
          organizationId: org.id,
          organizationName: org.name,
          totalUsers: usersCount?.value || 0,
          totalCourses: coursesCount?.value || 0,
          totalEnrollments: enrollmentsCount?.value || 0,
          totalAssignments: assignmentsCount?.value || 0,
        });
      }

      const [businessRow] = await db
        .select()
        .from(platformConfiguration)
        .where(eq(platformConfiguration.key, 'ONPREM_BUSINESS_PROFILE'))
        .limit(1);
      const businessProfile = businessRow?.value ? JSON.parse(businessRow.value) : null;
      const businessProfileCompleteness = evaluateBusinessProfileCompleteness(businessProfile);

      const [reissueRow] = await db
        .select({ value: platformConfiguration.value })
        .from(platformConfiguration)
        .where(eq(platformConfiguration.key, 'ONPREM_LICENSE_REISSUE_REQUIRED'))
        .limit(1);
      const reissueStatus = parseJsonValue(reissueRow?.value || null);
      const [profileLockRow] = await db
        .select({ value: platformConfiguration.value })
        .from(platformConfiguration)
        .where(eq(platformConfiguration.key, 'ONPREM_BUSINESS_PROFILE_LOCK'))
        .limit(1);
      const profileLock = parseJsonValue(profileLockRow?.value || null);
      const [enterpriseCustomerIdRow] = await db
        .select({ value: platformConfiguration.value })
        .from(platformConfiguration)
        .where(eq(platformConfiguration.key, 'ONPREM_ENTERPRISE_CUSTOMER_ID'))
        .limit(1);
      const [enterpriseSystemIdRow] = await db
        .select({ value: platformConfiguration.value })
        .from(platformConfiguration)
        .where(eq(platformConfiguration.key, 'ONPREM_ENTERPRISE_SYSTEM_ID'))
        .limit(1);
      const [registrationStatusRow] = await db
        .select({ value: platformConfiguration.value })
        .from(platformConfiguration)
        .where(eq(platformConfiguration.key, 'ONPREM_REGISTRATION_STATUS'))
        .limit(1);
      const [remoteLicenseStatusRow] = await db
        .select({ value: platformConfiguration.value })
        .from(platformConfiguration)
        .where(eq(platformConfiguration.key, 'ONPREM_LICENSE_REMOTE_STATUS'))
        .limit(1);
      const remoteLicenseStatus = parseJsonValue(remoteLicenseStatusRow?.value || null);

      res.json({
        hardwareKey,
        hostname,
        baseUrl,
        systemType: effectiveLicenseStatus.systemType || normalizeOnpremSystemType(existingLicense?.systemType || process.env.SYSTEM_TYPE || null),
        envSystemType: normalizeOnpremSystemType(process.env.SYSTEM_TYPE || null),
        currentLicense,
        policy,
        organizationMetrics,
        businessProfile,
        businessProfileCompleteness,
        licenseReissueStatus: reissueStatus && typeof reissueStatus === 'object' ? reissueStatus : { required: false, changedFields: [] },
        businessProfileLock: profileLock && typeof profileLock === 'object' ? profileLock : { readOnly: false },
        enterpriseCustomerId: enterpriseCustomerIdRow?.value || null,
        enterpriseSystemId: enterpriseSystemIdRow?.value || null,
        registrationStatus: registrationStatusRow?.value || null,
        remoteLicenseStatus: remoteLicenseStatus && typeof remoteLicenseStatus === 'object'
          ? remoteLicenseStatus
          : { status: null, reason: null, updatedAt: null },
      });
    } catch (error) {
      console.error('[OnpremLicense] Error getting system info:', error);
      res.status(500).json({ error: 'Failed to get system information' });
    }
  });

  app.post('/api/onprem/license/generate-request', requireOnpremMode, isCustSuper, async (req: Request, res: Response) => {
    try {
      const { serverBaseUrl, hostname } = req.body;
      const [businessRow] = await db
        .select({ value: platformConfiguration.value })
        .from(platformConfiguration)
        .where(eq(platformConfiguration.key, 'ONPREM_BUSINESS_PROFILE'))
        .limit(1);
      const businessProfile = parseJsonValue(businessRow?.value || null);
      const completeness = evaluateBusinessProfileCompleteness(businessProfile);
      if (!completeness.isComplete) {
        return res.status(400).json({
          error: `Business profile is incomplete: ${completeness.missingFields.join(', ')}`,
          missingFields: completeness.missingFields,
        });
      }

      const envSystemType = parseOnpremSystemType(process.env.SYSTEM_TYPE);
      let systemType = parseOnpremSystemType(req.body.systemType);

      if (envSystemType) {
        systemType = envSystemType;
      }

      if (!systemType) {
        return res.status(400).json({ error: 'Invalid systemType. Must be "development", "qa", or "production"' });
      }
      if (!serverBaseUrl) {
        return res.status(400).json({ error: 'serverBaseUrl is required' });
      }
      if (!hostname) {
        return res.status(400).json({ error: 'hostname is required' });
      }

      const hardwareKey = generateHardwareKey();
      const [currentUser] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, req.session.userId!))
        .limit(1);
      const [primaryOrg] = await db
        .select({ name: organizations.name })
        .from(organizations)
        .limit(1);

      const payload: LicenseRequestPayload = {
        hardwareKey,
        hostname,
        serverBaseUrl,
        systemType: systemType as OnpremSystemType,
        requestedAt: new Date().toISOString(),
        companyName: primaryOrg?.name || '',
        contactEmail: currentUser?.email || '',
      };

      const encryptedData = encryptLicenseRequest(payload);
      const filename = `license-request-${systemType}-${Date.now()}.lreq`;

      res.json({ fileContent: encryptedData, filename });
    } catch (error) {
      console.error('[OnpremLicense] Error generating license request:', error);
      res.status(500).json({ error: 'Failed to generate license request' });
    }
  });

  app.post('/api/onprem/license/request-reissue', requireOnpremMode, isCustSuper, async (req: Request, res: Response) => {
    try {
      const [reissueRow] = await db
        .select({ value: platformConfiguration.value })
        .from(platformConfiguration)
        .where(eq(platformConfiguration.key, 'ONPREM_LICENSE_REISSUE_REQUIRED'))
        .limit(1);
      const reissueState = parseJsonValue(reissueRow?.value || null) || {};
      if (reissueState?.required !== true) {
        return res.status(409).json({ error: 'A license reissue is not currently required for this system.' });
      }

      const changedFields = Array.isArray(reissueState?.changedFields)
        ? reissueState.changedFields.map((v: any) => String(v || '').trim()).filter(Boolean)
        : [];

      const result = await requestOnpremLicenseReissue({
        reason: String(req.body?.reason || reissueState?.message || 'Business identity changed').trim(),
        changedFields,
      });

      await upsertPlatformConfigurationValue({
        key: 'ONPREM_LICENSE_REISSUE_REQUIRED',
        value: JSON.stringify({
          required: true,
          changedFields,
          requestedAt: new Date().toISOString(),
          requestedBy: req.session.userId || null,
          requestId: result?.request?.id || null,
          message: 'Replacement request submitted to cloud PRD and is awaiting SuperAdmin approval.',
        }),
        dataType: 'json',
        description: 'On-prem license reissue status after identity/profile changes',
        userId: req.session.userId || null,
      });

      res.json({
        success: true,
        request: result?.request || null,
        message: result?.message || 'Replacement request submitted successfully.',
      });
    } catch (error) {
      console.error('[OnpremLicense] Error requesting reissue:', error);
      const status = (error as any)?.status || 500;
      res.status(status).json({
        error: (error as any)?.message || 'Failed to request license reissue',
        details: (error as any)?.details,
      });
    }
  });

  app.post('/api/onprem/license/import-key', requireOnpremMode, isCustSuper, upload.single('licenseKey'), async (req: Request, res: Response) => {
    try {
      const [enterpriseCustomerIdRow] = await db
        .select({ value: platformConfiguration.value })
        .from(platformConfiguration)
        .where(eq(platformConfiguration.key, 'ONPREM_ENTERPRISE_CUSTOMER_ID'))
        .limit(1);
      const [enterpriseSystemIdRow] = await db
        .select({ value: platformConfiguration.value })
        .from(platformConfiguration)
        .where(eq(platformConfiguration.key, 'ONPREM_ENTERPRISE_SYSTEM_ID'))
        .limit(1);
      if (!String(enterpriseCustomerIdRow?.value || '').trim() || !String(enterpriseSystemIdRow?.value || '').trim()) {
        return res.status(409).json({
          error: 'System is not registered with cloud PRD yet. Save business profile and complete cloud registration before importing a license key.',
        });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const fileContent = req.file.buffer.toString('utf-8').trim();

      let licensePayload;
      try {
        licensePayload = verifyAndDecodeLicenseKey(fileContent);
      } catch (decryptError) {
        console.error('[OnpremLicense] Failed to decrypt license key:', decryptError);
        return res.status(400).json({ error: 'Invalid license key file. Could not decrypt the file.' });
      }

      const localHardwareKey = generateHardwareKey();

      if (!isLocalHardwareKeyMatch(licensePayload.hardwareKey)) {
        return res.status(400).json({
          error: 'Hardware key mismatch - this license key was generated for a different system',
        });
      }

      const localHostname = os.hostname();
      if (licensePayload.hostname !== localHostname) {
        return res.status(400).json({
          error: `Hostname mismatch - license is for "${licensePayload.hostname}" but this system is "${localHostname}"`,
        });
      }

      const envSystemType = parseOnpremSystemType(process.env.SYSTEM_TYPE);
      const licenseSystemType = parseOnpremSystemType(licensePayload.systemType);
      if (!licenseSystemType) {
        return res.status(400).json({
          error: 'Invalid license key systemType. Must be "development", "qa", or "production".',
        });
      }

      if (envSystemType && envSystemType !== licenseSystemType) {
        return res.status(400).json({
          error: `This system is configured as "${envSystemType}" and cannot import a "${licenseSystemType}" license.`,
        });
      }

      const now = new Date();
      const expiryDate = new Date(licensePayload.expiresAt);
      if (now > expiryDate) {
        return res.status(400).json({
          error: 'License key has expired',
        });
      }

      const validation = validateLicenseKey(licensePayload, localHardwareKey);
      if (!validation.valid) {
        return res.status(400).json({
          error: validation.error || 'License key validation failed',
        });
      }

      const issuedAt = new Date(licensePayload.issuedAt);
      if (!isCalendarMonthLicenseLifetimeValid(issuedAt, expiryDate)) {
        return res.status(400).json({
          error: 'Invalid license lifetime. On-prem licenses must align to calendar-month validity.',
        });
      }

      const newLicense = await replaceOnpremLicenseState({
        licenseKeyData: fileContent,
        hardwareKey: licensePayload.hardwareKey,
        hostname: licensePayload.hostname,
        serverBaseUrl: licensePayload.serverBaseUrl,
        systemType: licenseSystemType,
        expiresAt: expiryDate,
      });

      await db
        .update(onpremLicenseState)
        .set({
          isValid: false,
          lastValidatedAt: new Date(),
        })
        .where(eq(onpremLicenseState.id, newLicense.id));

      await publishOnpremRemoteLicenseStatus(
        'pending_cloud_confirm',
        'License imported locally. Activation is pending cloud PRD confirmation on next check-in.',
      );

      await upsertPlatformConfigurationValue({
        key: 'ONPREM_LICENSE_REISSUE_REQUIRED',
        value: JSON.stringify({
          required: false,
          changedFields: [],
          clearedAt: new Date().toISOString(),
          clearedReason: 'new_license_imported',
        }),
        dataType: 'json',
        description: 'On-prem license reissue status after identity/profile changes',
        userId: req.session.userId || null,
      });

      console.log(`[OnpremLicense] License key imported successfully. System type: ${licensePayload.systemType}, Expires: ${licensePayload.expiresAt}`);

      res.json({
        success: true,
        message: 'License key imported successfully (pending cloud confirmation)',
        license: {
          systemType: newLicense.systemType,
          installedAt: newLicense.installedAt,
          expiresAt: newLicense.expiresAt,
          isValid: newLicense.isValid,
          hostname: newLicense.hostname,
          serverBaseUrl: newLicense.serverBaseUrl,
        },
      });
    } catch (error) {
      console.error('[OnpremLicense] Error importing license key:', error);
      res.status(500).json({ error: 'Failed to import license key' });
    }
  });

  app.get('/api/onprem/license/status', requireOnpremMode, async (req: Request, res: Response) => {
    try {
      const ls = await getOnpremLicenseStatus();
      res.json({
        hasValidLicense: ls.hasValidLicense,
        tamperDetected: ls.tamperDetected,
        remoteStatus: ls.remoteStatus,
        registrationStatus: ls.registrationStatus,
        statusReason: ls.statusReason,
        license: {
          systemType: ls.systemType,
          expiresAt: ls.licenseExpiresAt,
          isValid: ls.hasValidLicense,
        },
      });
    } catch (error) {
      console.error('[OnpremLicense] Error checking license status:', error);
      res.status(500).json({ error: 'Failed to check license status' });
    }
  });

  app.get('/api/onprem/license/validate', requireOnpremMode, async (req: Request, res: Response) => {
    try {
      const [license] = await db.select().from(onpremLicenseState).limit(1);
      const ls = await getOnpremLicenseStatus();
      res.json({
        valid: ls.hasValidLicense,
        hasLicense: !!license,
        systemType: ls.systemType,
        expiresAt: ls.licenseExpiresAt,
        isExpired: ls.isExpired,
        tamperDetected: ls.tamperDetected,
        remoteStatus: ls.remoteStatus,
        registrationStatus: ls.registrationStatus,
        statusReason: ls.statusReason,
      });
    } catch (error) {
      console.error('[OnpremLicense] Error validating license:', error);
      res.status(500).json({ error: 'Failed to validate license' });
    }
  });

  app.post('/api/onprem/license/check-in', requireOnpremMode, isCustSuper, async (req: Request, res: Response) => {
    try {
      const result = await runOnpremLicenseCheckIn();
      res.json(result);
    } catch (error) {
      console.error('[OnpremLicense] Error during cloud check-in:', error);
      const status = (error as any)?.status || 500;
      res.status(status).json({
        error: (error as any)?.message || 'Failed to complete onprem check-in',
        details: (error as any)?.details,
      });
    }
  });

  console.log('[Routes] On-prem license routes registered');
}
