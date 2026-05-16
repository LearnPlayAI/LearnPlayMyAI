import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

function normalizePemKey(raw: string): string {
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

export function deriveAndSaveCloudPublicKey(): void {
  if (process.env.ONPREM_MODE === 'true') {
    return;
  }

  let privateKeyPem = process.env.CLOUD_LICENSE_PRIVATE_KEY;
  if (!privateKeyPem) {
    console.warn('[LicenseCrypto] CLOUD_LICENSE_PRIVATE_KEY not configured - license signing disabled');
    return;
  }

  privateKeyPem = normalizePemKey(privateKeyPem);

  try {
    const privateKey = crypto.createPrivateKey(privateKeyPem);

    const publicKeyPem = crypto.createPublicKey(privateKey).export({
      type: 'spki',
      format: 'pem',
    }) as string;

    const pemPath = path.join(process.cwd(), 'server', 'config', 'cloud-license-public-key.pem');

    let existingPem = '';
    try {
      existingPem = fs.readFileSync(pemPath, 'utf-8');
    } catch {}

    if (existingPem.trim() !== publicKeyPem.trim()) {
      fs.writeFileSync(pemPath, publicKeyPem, 'utf-8');
      console.log('[LicenseCrypto] Cloud public key derived and saved to cloud-license-public-key.pem');
    } else {
      console.log('[LicenseCrypto] Cloud public key PEM is up to date');
    }
  } catch (err) {
    console.error('[LicenseCrypto] Failed to derive public key from CLOUD_LICENSE_PRIVATE_KEY:', err);
  }
}
