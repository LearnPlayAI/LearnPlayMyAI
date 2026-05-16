import crypto from 'crypto';
import { db } from '../db';
import { enterpriseKeyring } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { normalizePem } from './licenseCryptoService';

const MASTER_KEY_SALT = 'lp-keyring-master-v1';
const MASTER_KEY_INFO = 'learnplay-keyring-master';
const KEY_PURPOSES = ['backup', 'secrets', 'vault'] as const;
type KeyPurpose = typeof KEY_PURPOSES[number];

function getMasterKey(): Buffer {
  const raw = process.env.CLOUD_LICENSE_PRIVATE_KEY;
  if (!raw) throw new Error('CLOUD_LICENSE_PRIVATE_KEY not configured');
  const pem = normalizePem(raw);
  const privKey = crypto.createPrivateKey(pem);
  const der = privKey.export({ type: 'pkcs8', format: 'der' });
  return Buffer.from(crypto.hkdfSync('sha256', der, MASTER_KEY_SALT, MASTER_KEY_INFO, 32));
}

function encryptKeyBlob(rawKey: Buffer): string {
  const masterKey = getMasterKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  let enc = cipher.update(rawKey);
  enc = Buffer.concat([enc, cipher.final()]);
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('base64'),
    data: enc.toString('base64'),
    tag: authTag.toString('base64'),
    v: 1,
  });
}

function decryptKeyBlob(blob: string): Buffer {
  const masterKey = getMasterKey();
  const { iv, data, tag } = JSON.parse(blob);
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  let dec = decipher.update(Buffer.from(data, 'base64'));
  dec = Buffer.concat([dec, decipher.final()]);
  return dec;
}

export async function provisionKeysForCustomer(enterpriseCustomerId: string): Promise<{
  created: number;
  alreadyProvisioned: number;
  totalActive: number;
}> {
  let created = 0;
  let alreadyProvisioned = 0;
  for (const purpose of KEY_PURPOSES) {
    const existingForPurpose = await db.select().from(enterpriseKeyring)
      .where(and(eq(enterpriseKeyring.enterpriseCustomerId, enterpriseCustomerId), eq(enterpriseKeyring.purpose, purpose), eq(enterpriseKeyring.isActive, true)))
      .limit(1);
    if (existingForPurpose.length > 0) {
      alreadyProvisioned += 1;
      continue;
    }

    const rawKey = crypto.randomBytes(32);
    const encryptedBlob = encryptKeyBlob(rawKey);
    await db.insert(enterpriseKeyring).values({
      enterpriseCustomerId,
      purpose,
      encryptedKeyBlob: encryptedBlob,
      keyVersion: 1,
    });
    created += 1;
  }

  const [activeCountRow] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(enterpriseKeyring)
    .where(and(
      eq(enterpriseKeyring.enterpriseCustomerId, enterpriseCustomerId),
      eq(enterpriseKeyring.isActive, true),
    ));

  return {
    created,
    alreadyProvisioned,
    totalActive: activeCountRow?.value || 0,
  };
}

export async function getCustomerKeys(enterpriseCustomerId: string) {
  return db.select({
    id: enterpriseKeyring.id,
    keyId: enterpriseKeyring.keyId,
    purpose: enterpriseKeyring.purpose,
    keyVersion: enterpriseKeyring.keyVersion,
    isActive: enterpriseKeyring.isActive,
    createdAt: enterpriseKeyring.createdAt,
    retiredAt: enterpriseKeyring.retiredAt,
  }).from(enterpriseKeyring)
    .where(eq(enterpriseKeyring.enterpriseCustomerId, enterpriseCustomerId));
}

export async function rotateKey(enterpriseCustomerId: string, purpose: string): Promise<void> {
  const [current] = await db.select().from(enterpriseKeyring)
    .where(and(eq(enterpriseKeyring.enterpriseCustomerId, enterpriseCustomerId), eq(enterpriseKeyring.purpose, purpose), eq(enterpriseKeyring.isActive, true)))
    .limit(1);

  if (current) {
    await db.update(enterpriseKeyring)
      .set({ isActive: false, retiredAt: new Date() })
      .where(eq(enterpriseKeyring.id, current.id));
  }

  const rawKey = crypto.randomBytes(32);
  const encryptedBlob = encryptKeyBlob(rawKey);
  const nextVersion = current ? current.keyVersion + 1 : 1;
  await db.insert(enterpriseKeyring).values({
    enterpriseCustomerId,
    purpose,
    encryptedKeyBlob: encryptedBlob,
    keyVersion: nextVersion,
  });
}

export async function getDecryptedKeyForPurpose(enterpriseCustomerId: string, purpose: string): Promise<{ keyId: string; key: string; version: number } | null> {
  const [record] = await db.select().from(enterpriseKeyring)
    .where(and(eq(enterpriseKeyring.enterpriseCustomerId, enterpriseCustomerId), eq(enterpriseKeyring.purpose, purpose), eq(enterpriseKeyring.isActive, true)))
    .limit(1);
  if (!record) return null;
  const rawKey = decryptKeyBlob(record.encryptedKeyBlob);
  return { keyId: record.keyId, key: rawKey.toString('base64'), version: record.keyVersion };
}

export async function buildProvisionBundle(enterpriseCustomerId: string): Promise<object> {
  const keys = await db.select().from(enterpriseKeyring)
    .where(and(eq(enterpriseKeyring.enterpriseCustomerId, enterpriseCustomerId), eq(enterpriseKeyring.isActive, true)));

  const bundle: Record<string, { keyId: string; key: string; version: number }> = {};
  for (const k of keys) {
    const rawKey = decryptKeyBlob(k.encryptedKeyBlob);
    bundle[k.purpose] = { keyId: k.keyId, key: rawKey.toString('base64'), version: k.keyVersion };
  }

  const payloadJson = JSON.stringify({ enterpriseCustomerId, keys: bundle, issuedAt: new Date().toISOString() });

  const raw = process.env.CLOUD_LICENSE_PRIVATE_KEY;
  if (!raw) throw new Error('CLOUD_LICENSE_PRIVATE_KEY not configured');
  const pem = normalizePem(raw);
  const privKey = crypto.createPrivateKey(pem);
  const signature = crypto.sign('sha256', Buffer.from(payloadJson), privKey).toString('base64');

  return { payload: payloadJson, signature, version: 1 };
}

export { KEY_PURPOSES, KeyPurpose };
