CREATE TABLE IF NOT EXISTS "enterprise_systems" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "enterpriseCustomerId" varchar NOT NULL REFERENCES "enterprise_customers"("id"),
  "name" varchar NOT NULL,
  "systemType" varchar NOT NULL,
  "baseUrl" varchar,
  "internalHostname" varchar,
  "cpu" varchar,
  "memory" varchar,
  "appPort" integer DEFAULT 3000,
  "dbPort" integer DEFAULT 5432,
  "nginxHttpPort" integer DEFAULT 80,
  "nginxHttpsPort" integer DEFAULT 443,
  "status" varchar DEFAULT 'active',
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_enterprise_systems_customer" ON "enterprise_systems" ("enterpriseCustomerId");
CREATE INDEX IF NOT EXISTS "IDX_enterprise_systems_type" ON "enterprise_systems" ("enterpriseCustomerId", "systemType");
