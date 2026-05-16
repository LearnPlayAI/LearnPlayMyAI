-- Enterprise Keyring: Per-customer encryption keys managed on cloud
CREATE TABLE IF NOT EXISTS "enterprise_keyring" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "enterpriseCustomerId" varchar NOT NULL REFERENCES "enterprise_customers"("id"),
  "keyId" varchar NOT NULL DEFAULT gen_random_uuid(),
  "purpose" varchar NOT NULL,
  "encryptedKeyBlob" text NOT NULL,
  "keyVersion" integer NOT NULL DEFAULT 1,
  "isActive" boolean DEFAULT true,
  "createdAt" timestamp DEFAULT now(),
  "retiredAt" timestamp
);

CREATE INDEX IF NOT EXISTS "IDX_enterprise_keyring_customer" ON "enterprise_keyring" ("enterpriseCustomerId");
CREATE INDEX IF NOT EXISTS "IDX_enterprise_keyring_purpose" ON "enterprise_keyring" ("enterpriseCustomerId", "purpose");
CREATE INDEX IF NOT EXISTS "IDX_enterprise_keyring_active" ON "enterprise_keyring" ("enterpriseCustomerId", "isActive");
