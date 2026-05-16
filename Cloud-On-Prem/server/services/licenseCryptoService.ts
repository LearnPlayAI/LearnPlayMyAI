import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { hostname } from 'os';

export interface LicenseRequestPayload {
  hardwareKey: string;
  hostname: string;
  serverBaseUrl: string;
  systemType: 'development' | 'qa' | 'production';
  requestedAt: string;
  companyName: string;
  contactEmail: string;
}

export interface LicenseKeyPayload {
  licenseId: string;
  enterpriseCustomerId: string;
  hardwareKey: string;
  hostname: string;
  serverBaseUrl: string;
  systemType: 'development' | 'qa' | 'production';
  issuedAt: string;
  expiresAt: string;
  monthlyFee: string;
  feeCurrency: string;
  companyName: string;
  renewalSequence?: number;
  issuedReason?: 'initial' | 'renewal' | 'replacement';
  graceDays?: number;
  autoApproveRenewals?: boolean;
  nextRenewalDueAt?: string;
  issuedBy?: string;
}

export interface SignedLicenseKey {
  payload: string;
  signature: string;
  keyId: string;
  version: number;
}

export interface EncryptedLicenseRequest {
  ephemeralPublicKey: string;
  iv: string;
  encryptedData: string;
  authTag: string;
  keyId: string;
  version: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const PROTOCOL_VERSION = 1;
const HKDF_SALT = 'lp-license-ecdh-salt';
const HKDF_INFO = 'learnplay-license-v1';
const IV_LENGTH = 16;

export function normalizePem(raw: string): string {
  let pem = raw.replace(/\\n/g, '\n').trim();
  
  if (pem.includes('-----BEGIN') && !pem.includes('\n')) {
    pem = pem
      .replace(/-----BEGIN ([A-Z ]+)-----\s*/, '-----BEGIN $1-----\n')
      .replace(/\s*-----END ([A-Z ]+)-----/, '\n-----END $1-----');
    const headerMatch = pem.match(/^(-----BEGIN [A-Z ]+-----)\n([\s\S]+)\n(-----END [A-Z ]+-----)$/);
    if (headerMatch) {
      const body = headerMatch[2].replace(/\s+/g, '');
      const lines = body.match(/.{1,64}/g) || [body];
      pem = `${headerMatch[1]}\n${lines.join('\n')}\n${headerMatch[3]}`;
    }
  }
  
  if (!pem.startsWith('-----BEGIN')) {
    const body = pem.replace(/\s+/g, '');
    const lines = body.match(/.{1,64}/g) || [body];
    pem = `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----`;
  }
  
  return pem;
}

export function getCloudPrivateKey(): crypto.KeyObject {
  const raw = process.env.CLOUD_LICENSE_PRIVATE_KEY;
  if (!raw) {
    throw new Error('Cloud private key not configured. Set CLOUD_LICENSE_PRIVATE_KEY environment variable.');
  }
  return crypto.createPrivateKey(normalizePem(raw));
}

export function getCloudPublicKey(): crypto.KeyObject {
  const currentDir = typeof __dirname === 'string' ? __dirname : process.cwd();

  const envPath = String(process.env.CLOUD_LICENSE_PUBLIC_KEY_PATH || '').trim();
  // Resolve relative to the running runtime first so both DEV (/opt/learnplay/onprem)
  // and installed ACC/PRD (/opt/learnplay) layouts work correctly.
  const candidates = [
    ...(envPath ? [envPath] : []),
    path.resolve(currentDir, '../config/cloud-license-public-key.pem'),
    path.resolve(currentDir, 'config/cloud-license-public-key.pem'),
    path.join(process.cwd(), 'server/config/cloud-license-public-key.pem'),
    '/opt/learnplay/onprem/server/config/cloud-license-public-key.pem',
    '/opt/learnplay/server/config/cloud-license-public-key.pem',
  ];
  
  let keyPath: string | null = null;
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      keyPath = p;
      break;
    }
  }
  
  if (!keyPath) {
    throw new Error(`Cloud public key not found. Searched: ${candidates.join(', ')}`);
  }
  const pem = fs.readFileSync(keyPath, 'utf-8');
  return crypto.createPublicKey(pem);
}

function getKeyId(): string {
  const pubKey = getCloudPublicKey();
  const der = pubKey.export({ type: 'spki', format: 'der' });
  return crypto.createHash('sha256').update(der).digest('hex').substring(0, 16);
}

function deriveSharedKey(privateKey: crypto.KeyObject, publicKey: crypto.KeyObject): Buffer {
  const sharedSecret = crypto.diffieHellman({ privateKey, publicKey });
  return Buffer.from(
    crypto.hkdfSync('sha256', sharedSecret, HKDF_SALT, HKDF_INFO, 32)
  );
}

function readMachineId(): string | null {
  const candidates = ['/etc/machine-id', '/var/lib/dbus/machine-id'];
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const value = fs.readFileSync(candidate, 'utf-8').trim();
      if (value) return value;
    } catch {
      // ignore and continue
    }
  }
  return null;
}

function generateLegacyHostnameHardwareKey(): string {
  const systemHostname = hostname();
  return crypto.createHash('sha256').update(systemHostname).digest('hex');
}

function generateCompositeHardwareKey(): string {
  const machineId = readMachineId() || 'no-machine-id';
  const systemHostname = hostname();
  const seed = `v2|${machineId}|${systemHostname}`;
  return crypto.createHash('sha256').update(seed).digest('hex');
}

export function generateHardwareKeyCandidates(): string[] {
  const set = new Set<string>();
  // Prefer stronger composite key when possible, but keep legacy hostname-only key
  // as backward-compatible fallback for existing deployed licenses.
  set.add(generateCompositeHardwareKey());
  set.add(generateLegacyHostnameHardwareKey());
  return Array.from(set);
}

export function isLocalHardwareKeyMatch(candidate: unknown): boolean {
  const normalized = String(candidate || '').trim();
  if (!normalized) return false;
  return generateHardwareKeyCandidates().includes(normalized);
}

export function generateHardwareKey(): string {
  return generateHardwareKeyCandidates()[0];
}

export function signLicenseKey(payload: LicenseKeyPayload): string {
  const privateKey = getCloudPrivateKey();
  const payloadJson = JSON.stringify(payload);
  const signature = crypto.sign('sha256', Buffer.from(payloadJson), privateKey);

  const signed: SignedLicenseKey = {
    payload: payloadJson,
    signature: signature.toString('base64'),
    keyId: getKeyId(),
    version: PROTOCOL_VERSION,
  };

  return Buffer.from(JSON.stringify(signed)).toString('base64');
}

export function verifyAndDecodeLicenseKey(signedData: string): LicenseKeyPayload {
  const json = Buffer.from(signedData, 'base64').toString('utf-8');
  const signed: SignedLicenseKey = JSON.parse(json);

  const publicKey = getCloudPublicKey();
  const signatureBuffer = Buffer.from(signed.signature, 'base64');
  const isValid = crypto.verify(
    'sha256',
    Buffer.from(signed.payload),
    publicKey,
    signatureBuffer
  );

  if (!isValid) {
    throw new Error('License key signature verification failed - the file may be tampered or corrupt');
  }

  return JSON.parse(signed.payload) as LicenseKeyPayload;
}

export function validateLicenseKey(
  payload: LicenseKeyPayload,
  localHardwareKey: string
): ValidationResult {
  const candidates = new Set<string>([localHardwareKey, ...generateHardwareKeyCandidates()]);
  if (!candidates.has(String(payload.hardwareKey || '').trim())) {
    return {
      valid: false,
      error: 'Hardware key mismatch - license is bound to a different system',
    };
  }

  const now = new Date();
  const expiryDate = new Date(payload.expiresAt);

  if (now > expiryDate) {
    return {
      valid: false,
      error: 'License has expired',
    };
  }

  return {
    valid: true,
  };
}

export function encryptLicenseRequest(payload: LicenseRequestPayload): string {
  const cloudPubKey = getCloudPublicKey();

  const { privateKey: ephPriv, publicKey: ephPub } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });

  const aesKey = deriveSharedKey(ephPriv, cloudPubKey);

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const jsonData = JSON.stringify(payload);
  let encrypted = cipher.update(jsonData, 'utf-8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  const envelope: EncryptedLicenseRequest = {
    ephemeralPublicKey: ephPub.export({ type: 'spki', format: 'pem' }) as string,
    iv: iv.toString('base64'),
    encryptedData: encrypted.toString('base64'),
    authTag: authTag.toString('base64'),
    keyId: getKeyId(),
    version: PROTOCOL_VERSION,
  };

  return Buffer.from(JSON.stringify(envelope)).toString('base64');
}

export function decryptLicenseRequest(encryptedData: string): LicenseRequestPayload {
  try {
    const json = Buffer.from(encryptedData, 'base64').toString('utf-8');
    const envelope: EncryptedLicenseRequest = JSON.parse(json);

    const cloudPrivKey = getCloudPrivateKey();
    const ephPub = crypto.createPublicKey(envelope.ephemeralPublicKey);

    const aesKey = deriveSharedKey(cloudPrivKey, ephPub);

    const iv = Buffer.from(envelope.iv, 'base64');
    const ciphertext = Buffer.from(envelope.encryptedData, 'base64');
    const authTag = Buffer.from(envelope.authTag, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return JSON.parse(decrypted.toString('utf-8')) as LicenseRequestPayload;
  } catch (err: any) {
    if (err.message?.includes('Cloud private key')) {
      throw err;
    }
    throw new Error('Failed to decrypt license request - ensure the correct cloud private key is configured');
  }
}
