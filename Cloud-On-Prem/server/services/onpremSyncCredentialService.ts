import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { enterpriseSystems, platformConfiguration } from '@shared/schema';

const CONFIG_KEY_PREFIX = 'ENTERPRISE_SYSTEM_SYNC_AUTH_';
const ENC_PREFIX = 'enc:v1:';

type StoredCredentialRecord = {
  version: number;
  secretEnc: string;
  issuedAt: string;
  rotatedAt: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
};

export type OnpremSystemSyncCredential = {
  enterpriseSystemId: string;
  secret: string;
  version: number;
  issuedAt: string;
  rotatedAt: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
};

function recordKey(systemId: string): string {
  return `${CONFIG_KEY_PREFIX}${systemId}`;
}

function getEncryptionMaster(): Buffer {
  const source =
    process.env.INTEGRATION_SECRETS_MASTER_KEY ||
    process.env.SESSION_SECRET ||
    process.env.CLOUD_LICENSE_PRIVATE_KEY;
  if (!source) {
    throw new Error('Onprem sync credential encryption key not configured');
  }
  return crypto.createHash('sha256').update(source).digest();
}

function encryptSecret(plain: string): string {
  const key = getEncryptionMaster();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plain, 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = JSON.stringify({
    v: 1,
    iv: iv.toString('base64'),
    data: encrypted.toString('base64'),
    tag: tag.toString('base64'),
  });
  return `${ENC_PREFIX}${Buffer.from(payload, 'utf8').toString('base64')}`;
}

function decryptSecret(stored: string): string {
  const value = String(stored || '').trim();
  if (!value.startsWith(ENC_PREFIX)) return value;
  const encoded = value.slice(ENC_PREFIX.length);
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const parsed = JSON.parse(decoded);
  const key = getEncryptionMaster();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(parsed.data, 'base64')),
    decipher.final(),
  ]);
  return plain.toString('utf8');
}

export function hashSyncSecret(secret: string): string {
  return crypto.createHash('sha256').update(String(secret || '')).digest('hex');
}

export function generateSystemSyncSecret(): string {
  return crypto.randomBytes(48).toString('hex');
}

async function upsertConfigValue(key: string, value: string, description: string): Promise<void> {
  const [existing] = await db
    .select({ id: platformConfiguration.id })
    .from(platformConfiguration)
    .where(eq(platformConfiguration.key, key))
    .limit(1);

  if (existing) {
    await db
      .update(platformConfiguration)
      .set({
        value,
        dataType: 'json',
        description,
        isEditable: false,
        updatedAt: new Date(),
      })
      .where(eq(platformConfiguration.id, existing.id));
    return;
  }

  await db.insert(platformConfiguration).values({
    key,
    value,
    dataType: 'json',
    description,
    isEditable: false,
  });
}

async function readRecord(systemId: string): Promise<StoredCredentialRecord | null> {
  const [row] = await db
    .select({ value: platformConfiguration.value })
    .from(platformConfiguration)
    .where(eq(platformConfiguration.key, recordKey(systemId)))
    .limit(1);
  if (!row?.value) return null;
  try {
    const parsed = JSON.parse(row.value);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.secretEnc) return null;
    return {
      version: Number(parsed.version || 1) || 1,
      secretEnc: String(parsed.secretEnc || ''),
      issuedAt: String(parsed.issuedAt || new Date().toISOString()),
      rotatedAt: parsed.rotatedAt ? String(parsed.rotatedAt) : null,
      revokedAt: parsed.revokedAt ? String(parsed.revokedAt) : null,
      revocationReason: parsed.revocationReason ? String(parsed.revocationReason) : null,
    };
  } catch {
    return null;
  }
}

export async function getSystemSyncCredential(systemId: string): Promise<OnpremSystemSyncCredential | null> {
  const id = String(systemId || '').trim();
  if (!id) return null;
  const record = await readRecord(id);
  if (!record?.secretEnc) return null;
  return {
    enterpriseSystemId: id,
    secret: decryptSecret(record.secretEnc),
    version: record.version,
    issuedAt: record.issuedAt,
    rotatedAt: record.rotatedAt,
    revokedAt: record.revokedAt,
    revocationReason: record.revocationReason,
  };
}

async function applySystemAuthState(params: {
  systemId: string;
  mode: 'shared' | 'system';
  version?: number;
  secretHash?: string | null;
  revokedAt?: Date | null;
}): Promise<void> {
  const [existing] = await db
    .select({ id: enterpriseSystems.id })
    .from(enterpriseSystems)
    .where(eq(enterpriseSystems.id, params.systemId))
    .limit(1);
  if (!existing) return;

  await db
    .update(enterpriseSystems)
    .set({
      syncAuthMode: params.mode,
      syncAuthVersion: params.version ?? 0,
      syncAuthSecretHash: params.secretHash ?? null,
      syncAuthRevokedAt: params.revokedAt ?? null,
      updatedAt: new Date(),
    })
    .where(eq(enterpriseSystems.id, params.systemId));
}

export async function ensureSystemSyncCredential(systemId: string, options?: {
  forceRotate?: boolean;
}): Promise<{ credential: OnpremSystemSyncCredential; issued: boolean; rotated: boolean }> {
  const id = String(systemId || '').trim();
  if (!id) {
    throw new Error('enterpriseSystemId is required for sync credential provisioning');
  }

  const current = await getSystemSyncCredential(id);
  const nowIso = new Date().toISOString();

  if (current && !options?.forceRotate) {
    if (!current.revokedAt) {
      await applySystemAuthState({
        systemId: id,
        mode: 'system',
        version: current.version,
        secretHash: hashSyncSecret(current.secret),
        revokedAt: null,
      });
    }
    return { credential: current, issued: false, rotated: false };
  }

  const nextVersion = current ? current.version + 1 : 1;
  const nextSecret = generateSystemSyncSecret();
  const record: StoredCredentialRecord = {
    version: nextVersion,
    secretEnc: encryptSecret(nextSecret),
    issuedAt: current ? current.issuedAt : nowIso,
    rotatedAt: current ? nowIso : null,
    revokedAt: null,
    revocationReason: null,
  };

  await upsertConfigValue(
    recordKey(id),
    JSON.stringify(record),
    'Per-system onprem cloud sync credential (encrypted at rest)',
  );
  await applySystemAuthState({
    systemId: id,
    mode: 'system',
    version: nextVersion,
    secretHash: hashSyncSecret(nextSecret),
    revokedAt: null,
  });

  return {
    credential: {
      enterpriseSystemId: id,
      secret: nextSecret,
      version: nextVersion,
      issuedAt: record.issuedAt,
      rotatedAt: record.rotatedAt,
      revokedAt: null,
      revocationReason: null,
    },
    issued: !current,
    rotated: !!current,
  };
}

export async function revokeSystemSyncCredential(systemId: string, reason?: string): Promise<void> {
  const id = String(systemId || '').trim();
  if (!id) throw new Error('enterpriseSystemId is required');
  const existing = await readRecord(id);
  if (!existing) return;
  const nowIso = new Date().toISOString();
  const updated: StoredCredentialRecord = {
    ...existing,
    revokedAt: nowIso,
    revocationReason: reason ? String(reason).trim() : 'revoked_by_admin',
  };
  await upsertConfigValue(
    recordKey(id),
    JSON.stringify(updated),
    'Per-system onprem cloud sync credential (encrypted at rest)',
  );
  await applySystemAuthState({
    systemId: id,
    mode: 'shared',
    version: 0,
    secretHash: null,
    revokedAt: new Date(),
  });
}

export async function verifySystemSyncCredentialState(systemId: string): Promise<{
  exists: boolean;
  revoked: boolean;
  version: number;
}> {
  const cred = await getSystemSyncCredential(systemId);
  if (!cred) return { exists: false, revoked: false, version: 0 };
  return {
    exists: true,
    revoked: !!cred.revokedAt,
    version: cred.version,
  };
}

export async function verifyEnterpriseSystemOwnership(systemId: string, customerId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: enterpriseSystems.id })
    .from(enterpriseSystems)
    .where(and(
      eq(enterpriseSystems.id, systemId),
      eq(enterpriseSystems.enterpriseCustomerId, customerId),
    ))
    .limit(1);
  return !!row;
}
