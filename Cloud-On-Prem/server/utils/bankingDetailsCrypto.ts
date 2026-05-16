import crypto from "crypto";

const ENC_PREFIX = "bankenc:v1:";
let didWarnMissingKey = false;

function getEncryptionMaster(): Buffer | null {
  const source =
    process.env.BANKING_DETAILS_MASTER_KEY ||
    process.env.BANKING_DATA_ENCRYPTION_KEY ||
    process.env.INTEGRATION_SECRETS_MASTER_KEY ||
    process.env.SESSION_SECRET ||
    process.env.CLOUD_LICENSE_PRIVATE_KEY;

  if (!source) {
    if (!didWarnMissingKey) {
      didWarnMissingKey = true;
      console.warn(
        "[BankingCrypto] No banking encryption key configured; falling back to plaintext storage.",
      );
    }
    return null;
  }

  return crypto.createHash("sha256").update(source).digest();
}

export function isEncryptedBankAccountNumber(value: string | null | undefined): boolean {
  return String(value || "").startsWith(ENC_PREFIX);
}

export function encryptBankAccountNumber(accountNumber: string): string {
  const value = String(accountNumber || "").trim();
  if (!value) return value;
  if (isEncryptedBankAccountNumber(value)) return value;

  const key = getEncryptionMaster();
  if (!key) return value;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(value, "utf8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const payload = JSON.stringify({
    v: 1,
    iv: iv.toString("base64"),
    data: encrypted.toString("base64"),
    tag: tag.toString("base64"),
  });
  return `${ENC_PREFIX}${Buffer.from(payload, "utf8").toString("base64")}`;
}

export function decryptBankAccountNumber(stored: string | null | undefined): string {
  const value = String(stored || "");
  if (!isEncryptedBankAccountNumber(value)) {
    return value;
  }

  try {
    const encoded = value.slice(ENC_PREFIX.length);
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    const key = getEncryptionMaster();
    if (!key) {
      return "";
    }
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(parsed.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(parsed.data, "base64")),
      decipher.final(),
    ]);
    return plain.toString("utf8");
  } catch {
    return "";
  }
}

