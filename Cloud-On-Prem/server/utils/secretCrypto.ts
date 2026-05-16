import crypto from "crypto";

const ENC_PREFIX = "enc:v1:";

function getEncryptionMaster(): Buffer {
  const source =
    process.env.INTEGRATION_SECRETS_MASTER_KEY ||
    process.env.SESSION_SECRET ||
    process.env.CLOUD_LICENSE_PRIVATE_KEY;
  if (!source) {
    throw new Error("Integration secret encryption key not configured.");
  }
  return crypto.createHash("sha256").update(source).digest();
}

export function encryptSecret(plain: string): string {
  const key = getEncryptionMaster();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plain, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = JSON.stringify({
    v: 1,
    iv: iv.toString("base64"),
    data: encrypted.toString("base64"),
    tag: tag.toString("base64"),
  });
  return `${ENC_PREFIX}${Buffer.from(payload, "utf8").toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  const value = String(stored || "").trim();
  if (!value.startsWith(ENC_PREFIX)) {
    return value;
  }
  const encoded = value.slice(ENC_PREFIX.length);
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const parsed = JSON.parse(decoded);
  const key = getEncryptionMaster();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(parsed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(parsed.data, "base64")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}

export function maskSecret(raw?: string | null): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (value.length <= 6) return "***";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}
