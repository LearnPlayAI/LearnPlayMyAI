import { db } from '../db';
import { onpremLicenseState, platformConfiguration } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { verifyAndDecodeLicenseKey } from './licenseCryptoService';
import { isCloudAuthoritativeActiveStatus } from './licenseStatusContract';

export type OnpremSystemType = 'development' | 'qa' | 'production';

export function parseOnpremSystemType(rawValue: string | null | undefined): OnpremSystemType | null {
  const normalized = String(rawValue || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'development' || normalized === 'dev' || normalized === 'onprem') return 'development';
  if (
    normalized === 'qa' ||
    normalized === 'acc' ||
    normalized === 'test' ||
    normalized === 'testing' ||
    normalized === 'qualityassurance' ||
    normalized === 'quality_assurance' ||
    normalized === 'quality-assurance'
  ) {
    return 'qa';
  }
  if (normalized === 'production' || normalized === 'prod' || normalized === 'prd') return 'production';
  return null;
}

export function normalizeOnpremSystemType(
  rawValue: string | null | undefined,
  fallback: OnpremSystemType = 'production',
): OnpremSystemType {
  return parseOnpremSystemType(rawValue) || fallback;
}

export interface OnpremLicenseStatus {
  onpremMode: boolean;
  systemType: OnpremSystemType | null;
  hasValidLicense: boolean;
  isExpired: boolean;
  licenseExpiresAt: Date | null;
  tamperDetected: boolean;
  remediationMode: boolean;
  statusReason: string | null;
  remoteStatus: string | null;
  registrationStatus: string | null;
  cloudAuthoritativeActive: boolean;
}

function isCalendarMonthLicenseLifetimeValid(issuedAt: Date, expiresAt: Date): boolean {
  if (Number.isNaN(issuedAt.getTime()) || Number.isNaN(expiresAt.getTime())) return false;
  const lifetimeMs = expiresAt.getTime() - issuedAt.getTime();
  if (lifetimeMs <= 0) return false;
  const maxLifetimeMs = 62 * 24 * 60 * 60 * 1000;
  return lifetimeMs <= maxLifetimeMs;
}

async function getRemoteLicenseStatusInfo(): Promise<{ remoteStatus: string | null; statusReason: string | null }> {
  const [row] = await db
    .select({ value: platformConfiguration.value })
    .from(platformConfiguration)
    .where(eq(platformConfiguration.key, 'ONPREM_LICENSE_REMOTE_STATUS'))
    .limit(1);

  if (!row?.value) {
    return { remoteStatus: null, statusReason: null };
  }

  try {
    const parsed = JSON.parse(row.value);
    return {
      remoteStatus: parsed?.status ? String(parsed.status) : null,
      statusReason: parsed?.reason ? String(parsed.reason) : null,
    };
  } catch {
    return { remoteStatus: null, statusReason: null };
  }
}

async function getRegistrationStatusInfo(): Promise<{ registrationStatus: string | null; hasCloudLink: boolean }> {
  const [registrationRow] = await db
    .select({ value: platformConfiguration.value })
    .from(platformConfiguration)
    .where(eq(platformConfiguration.key, 'ONPREM_REGISTRATION_STATUS'))
    .limit(1);
  const [customerRow] = await db
    .select({ value: platformConfiguration.value })
    .from(platformConfiguration)
    .where(eq(platformConfiguration.key, 'ONPREM_ENTERPRISE_CUSTOMER_ID'))
    .limit(1);
  const [systemRow] = await db
    .select({ value: platformConfiguration.value })
    .from(platformConfiguration)
    .where(eq(platformConfiguration.key, 'ONPREM_ENTERPRISE_SYSTEM_ID'))
    .limit(1);

  return {
    registrationStatus: registrationRow?.value ? String(registrationRow.value) : null,
    hasCloudLink: !!String(customerRow?.value || '').trim() && !!String(systemRow?.value || '').trim(),
  };
}

export async function getOnpremLicenseStatus(): Promise<OnpremLicenseStatus> {
  // On-prem license enforcement is mandatory and cannot be disabled.
  if (process.env.ONPREM_MODE !== 'true') {
    return {
      onpremMode: false,
      systemType: null,
      hasValidLicense: false,
      isExpired: false,
      licenseExpiresAt: null,
      tamperDetected: false,
      remediationMode: false,
      statusReason: null,
      remoteStatus: null,
      registrationStatus: null,
      cloudAuthoritativeActive: false,
    };
  }

  const remoteInfo = await getRemoteLicenseStatusInfo();
  const registrationInfo = await getRegistrationStatusInfo();

  // Query the first license row from the onpremLicenseState table
  const license = await db.query.onpremLicenseState.findFirst();

  // Get systemType from env var, falling back to license type (legacy values normalized)
  const envSystemType = parseOnpremSystemType(process.env.SYSTEM_TYPE);
  // Resolve track from env first, then persisted license state. Do not default to production
  // when track is unknown, otherwise banners can show incorrect track wording.
  const systemType = envSystemType || parseOnpremSystemType(license?.systemType) || null;

  // If no license exists
  if (!license) {
    return {
      onpremMode: true,
      systemType,
      hasValidLicense: false,
      isExpired: false,
      licenseExpiresAt: null,
      tamperDetected: false,
      remediationMode: false,
      statusReason: remoteInfo.statusReason,
      remoteStatus: remoteInfo.remoteStatus,
      registrationStatus: registrationInfo.registrationStatus,
      cloudAuthoritativeActive: false,
    };
  }

  // Check if license is expired
  const now = new Date();
  const toleranceMs = 15 * 60 * 1000;
  const licenseExpiresAt = license.expiresAt;
  const isExpired = licenseExpiresAt ? now > licenseExpiresAt : false;
  const tamperDetected =
    (license.installedAt ? now.getTime() + toleranceMs < license.installedAt.getTime() : false) ||
    (license.lastValidatedAt ? now.getTime() + toleranceMs < license.lastValidatedAt.getTime() : false);

  // Determine if license is valid
  let monthlyLifetimeValid = true;
  try {
    const decoded = verifyAndDecodeLicenseKey(license.licenseKeyData);
    const issuedAt = new Date(decoded.issuedAt);
    const expiresAt = new Date(decoded.expiresAt);
    monthlyLifetimeValid = isCalendarMonthLicenseLifetimeValid(issuedAt, expiresAt);
  } catch {
    monthlyLifetimeValid = false;
  }

  const remoteStatus = String(remoteInfo.remoteStatus || '').trim().toLowerCase();
  const cloudAuthoritativeActive = isCloudAuthoritativeActiveStatus(remoteStatus);
  const registrationReady = registrationInfo.hasCloudLink && ['registered', 'registered_active'].includes(String(registrationInfo.registrationStatus || '').trim().toLowerCase());
  const hasValidLicense = !!license.isValid && !isExpired && !tamperDetected && monthlyLifetimeValid && cloudAuthoritativeActive && registrationReady;

  return {
    onpremMode: true,
    systemType,
    hasValidLicense,
    isExpired,
    licenseExpiresAt,
    tamperDetected,
    remediationMode: tamperDetected,
    statusReason: remoteInfo.statusReason,
    remoteStatus: remoteInfo.remoteStatus,
    registrationStatus: registrationInfo.registrationStatus,
    cloudAuthoritativeActive,
  };
}
