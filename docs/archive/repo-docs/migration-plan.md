# Database Migration Plan for License Management System

## Overview
This document outlines the safe migration strategy for adding per-seat license management to LearnPlay while maintaining data integrity and zero downtime for existing organizations.

## Migration Philosophy
- **Zero Downtime**: All migrations run without service interruption
- **Backward Compatible**: Existing features continue working during rollout
- **Rollback Ready**: Every change has a documented rollback procedure
- **Audit Trail**: All changes logged for compliance

---

## Phase 1: Schema Extensions (Zero Risk)

### 1.1 Create New Tables
These tables are net-new and don't affect existing functionality.

```sql
-- User licenses table (tracks individual learner activations)
CREATE TABLE IF NOT EXISTS "userLicenses" (
  "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" VARCHAR NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "organizationId" VARCHAR NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "tier" VARCHAR NOT NULL CHECK ("tier" IN ('free', 'blue', 'gold', 'platinum')),
  "status" VARCHAR NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'inactive', 'expired')),
  "activatedAt" TIMESTAMP DEFAULT NOW(),
  "expiresAt" TIMESTAMP,
  "activatedBy" VARCHAR REFERENCES "users"("id"),
  "deactivatedAt" TIMESTAMP,
  "deactivatedBy" VARCHAR REFERENCES "users"("id"),
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX "IDX_user_licenses_user" ON "userLicenses"("userId");
CREATE INDEX "IDX_user_licenses_org" ON "userLicenses"("organizationId");
CREATE INDEX "IDX_user_licenses_status" ON "userLicenses"("status");
CREATE UNIQUE INDEX "UNQ_user_org_license" ON "userLicenses"("userId", "organizationId");

-- License payments table (tracks monthly billing for per-seat licenses)
CREATE TABLE IF NOT EXISTS "licensePayments" (
  "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" VARCHAR NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "billingPeriodStart" TIMESTAMP NOT NULL,
  "billingPeriodEnd" TIMESTAMP NOT NULL,
  "seatCount" INTEGER NOT NULL,
  "pricePerSeat" DECIMAL(19, 4) NOT NULL,
  "totalAmount" DECIMAL(19, 4) NOT NULL,
  "currency" VARCHAR NOT NULL CHECK ("currency" IN ('ZAR', 'USD', 'EUR')),
  "status" VARCHAR NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'processing', 'paid', 'failed', 'refunded')),
  "paymentIntentId" VARCHAR REFERENCES "paymentIntents"("id"),
  "paidAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX "IDX_license_payments_org" ON "licensePayments"("organizationId");
CREATE INDEX "IDX_license_payments_status" ON "licensePayments"("status");
CREATE INDEX "IDX_license_payments_period" ON "licensePayments"("billingPeriodStart", "billingPeriodEnd");

-- Organization license settings (org-level configuration)
CREATE TABLE IF NOT EXISTS "organizationLicenseSettings" (
  "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" VARCHAR NOT NULL UNIQUE REFERENCES "organizations"("id") ON DELETE CASCADE,
  "autoRenew" BOOLEAN DEFAULT TRUE,
  "maxSeats" INTEGER,
  "billingDay" INTEGER DEFAULT 1 CHECK ("billingDay" BETWEEN 1 AND 28),
  "paymentMethodId" VARCHAR,
  "trialEndsAt" TIMESTAMP,
  "gracePeriodEndsAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX "IDX_org_license_settings_org" ON "organizationLicenseSettings"("organizationId");
```

**Rollback Plan**: `DROP TABLE IF EXISTS "organizationLicenseSettings", "licensePayments", "userLicenses" CASCADE;`

### 1.2 Extend Existing Tables (Low Risk)
Add optional columns to existing tables without affecting current functionality.

```sql
-- Add license tier to users (optional, defaults to null)
ALTER TABLE "users" 
ADD COLUMN IF NOT EXISTS "licenseTier" VARCHAR CHECK ("licenseTier" IN ('free', 'blue', 'gold', 'platinum'));

-- Add license-related flags to organizations
ALTER TABLE "organizations"
ADD COLUMN IF NOT EXISTS "licenseEnabled" BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS "licenseBillingStartDate" TIMESTAMP;

CREATE INDEX IF NOT EXISTS "IDX_orgs_license_enabled" ON "organizations"("licenseEnabled");
```

**Rollback Plan**:
```sql
ALTER TABLE "users" DROP COLUMN IF EXISTS "licenseTier";
ALTER TABLE "organizations" 
  DROP COLUMN IF EXISTS "licenseEnabled",
  DROP COLUMN IF EXISTS "licenseBillingStartDate";
```

---

## Phase 2: Payment Orchestrator Extension (Medium Risk)

### 2.1 Add License Intent Type
Extend `paymentIntents` metadata to support license payments.

**Implementation**:
1. Update `insertPaymentIntentSchema` in `shared/schema.ts` to include `intentType: 'license'`
2. Add metadata validation for license payments:
   ```typescript
   {
     intentType: 'license',
     organizationId: string,
     seatCount: number,
     billingPeriodStart: ISO8601,
     billingPeriodEnd: ISO8601
   }
   ```
3. Implement idempotency guards in `PaymentOrchestratorService`:
   - Check for duplicate `paymentIntentId` in `licensePayments`
   - Use compare-and-swap for status updates
   - Log all state transitions

**Rollback Plan**: Feature flag `ENABLE_LICENSE_PAYMENTS=false` to disable license payment processing.

---

## Phase 3: Middleware & Performance (High Risk)

### 3.1 License Check Middleware Design

**Implementation Strategy**:
```typescript
// Request-scoped cache (singleton per request)
const LICENSE_CACHE_KEY = Symbol('licenseCache');

interface LicenseCache {
  userId: string;
  organizationId: string;
  hasActiveLicense: boolean;
  tier: string | null;
  checkedAt: number;
}

export function licenseCheckMiddleware(req, res, next) {
  // Skip for whitelisted routes
  if (WHITELISTED_ROUTES.includes(req.path)) {
    return next();
  }

  // Skip for non-authenticated users
  if (!req.user) {
    return next();
  }

  // Check request-scoped cache
  if (req[LICENSE_CACHE_KEY]) {
    return applyLicensePolicy(req, res, next, req[LICENSE_CACHE_KEY]);
  }

  // Query database once per request
  const licenseStatus = await LicenseService.checkUserLicense(
    req.user.id,
    req.user.organizationId
  );

  // Store in request-scoped cache
  req[LICENSE_CACHE_KEY] = licenseStatus;

  return applyLicensePolicy(req, res, next, licenseStatus);
}
```

**Whitelisted Routes** (no license check):
- `/api/auth/*` - Authentication endpoints
- `/api/user/profile` - Basic profile access
- `/api/organization/license/*` - License management itself
- `/api/health` - Health checks
- `/api/webhooks/*` - Webhook handlers

**Performance Benchmarks**:
- Target: <10ms overhead per request
- Max DB queries: 1 per request
- Cache hit rate: >95% for same-user requests

**Rollback Plan**: Feature flag `ENABLE_LICENSE_MIDDLEWARE=false` to bypass all license checks.

---

## Phase 4: Data Migration & Backfill (Critical)

### 4.1 Pre-Migration Audit

**Step 1: Inventory Existing Organizations**
```sql
-- Count organizations by type
SELECT type, COUNT(*) as org_count, 
       COUNT(DISTINCT ou."userId") as total_users
FROM "organizations" o
LEFT JOIN "organizationUsers" ou ON ou."organizationId" = o."id"
WHERE o."isActive" = TRUE
GROUP BY type;

-- Expected output:
-- education: X orgs, Y users
-- business: A orgs, B users
-- elearning: C orgs, D users
```

**Step 2: Identify Organizations to Migrate**
```sql
-- Active organizations with users (candidates for license system)
CREATE TEMP TABLE migration_candidates AS
SELECT o.id, o.name, o.type, o."subscriptionStatus",
       COUNT(DISTINCT ou."userId") as user_count
FROM "organizations" o
JOIN "organizationUsers" ou ON ou."organizationId" = o."id"
WHERE o."isActive" = TRUE
  AND o."isDemo" = FALSE  -- Exclude demo orgs
GROUP BY o.id, o.name, o.type, o."subscriptionStatus"
HAVING COUNT(DISTINCT ou."userId") > 0
ORDER BY o.type, user_count DESC;

-- Export for review
\copy (SELECT * FROM migration_candidates) TO '/tmp/migration_candidates.csv' CSV HEADER;
```

---

### 4.2 Staged Backfill Execution

**Stage 1: Create Organization License Settings (Day 1)**
```sql
-- Create settings for all organizations (starts disabled)
INSERT INTO "organizationLicenseSettings" (
  "organizationId", 
  "autoRenew", 
  "maxSeats", 
  "billingDay",
  "trialEndsAt"
)
SELECT 
  id,
  FALSE,  -- autoRenew disabled by default
  CASE 
    WHEN type = 'education' THEN "studentCount"
    WHEN type = 'business' THEN 100  -- Default max seats
    ELSE NULL  -- E-learning has no seat limit
  END,
  1,  -- Bill on 1st of month
  CASE 
    WHEN "subscriptionStatus" = 'trial' THEN "trialEndDate"
    ELSE NULL
  END
FROM "organizations"
WHERE "isActive" = TRUE 
  AND "isDemo" = FALSE
ON CONFLICT ("organizationId") DO NOTHING;

-- Verification: All active orgs now have license settings
SELECT COUNT(*) as orgs_with_settings
FROM "organizations" o
WHERE o."isActive" = TRUE AND o."isDemo" = FALSE
  AND EXISTS (
    SELECT 1 FROM "organizationLicenseSettings" 
    WHERE "organizationId" = o.id
  );
```

**Stage 2: Backfill E-Learning Instructors (Day 2)**
```sql
-- E-Learning: Grant blue tier to OrgAdmins with active subscriptions
WITH eligible_instructors AS (
  SELECT DISTINCT
    ou."userId",
    o.id as "organizationId",
    o.name as org_name,
    s.status as subscription_status
  FROM "organizations" o
  JOIN "organizationUsers" ou ON ou."organizationId" = o.id
  LEFT JOIN "subscriptions" s ON s."targetType" = 'user' 
    AND s."targetId" = ou."userId"
    AND s.status IN ('active', 'grace')
  WHERE o.type = 'elearning'
    AND ou.role = 'orgadmin'
    AND o."isActive" = TRUE
)
INSERT INTO "userLicenses" (
  "userId", 
  "organizationId", 
  "tier", 
  "status", 
  "activatedAt",
  "expiresAt"
)
SELECT 
  "userId",
  "organizationId",
  'blue',
  'active',
  NOW(),
  NULL  -- No expiration for subscription-based licenses
FROM eligible_instructors
WHERE subscription_status IN ('active', 'grace')
ON CONFLICT ("userId", "organizationId") DO UPDATE
SET 
  tier = EXCLUDED.tier,
  status = EXCLUDED.status,
  activatedAt = EXCLUDED.activatedAt;

-- Verification: Count backfilled licenses
SELECT COUNT(*) as backfilled_licenses
FROM "userLicenses" ul
JOIN "organizations" o ON o.id = ul."organizationId"
WHERE o.type = 'elearning'
  AND ul.tier = 'blue'
  AND ul.status = 'active'
  AND ul."activatedAt" >= CURRENT_DATE;

-- Alert if mismatch
WITH expected AS (
  SELECT COUNT(*) as count FROM eligible_instructors WHERE subscription_status IN ('active', 'grace')
),
actual AS (
  SELECT COUNT(*) as count FROM "userLicenses" WHERE "activatedAt" >= CURRENT_DATE
)
SELECT 
  expected.count as expected_licenses,
  actual.count as actual_licenses,
  CASE WHEN expected.count = actual.count THEN 'OK' ELSE 'MISMATCH' END as status
FROM expected, actual;
```

**Stage 3: Enable License System for Beta Orgs (Day 3)**
```sql
-- Manually enable for 5 beta organizations
UPDATE "organizations"
SET 
  "licenseEnabled" = TRUE,
  "licenseBillingStartDate" = DATE_TRUNC('month', NOW() + INTERVAL '1 month')
WHERE id IN (
  'org_beta_1',
  'org_beta_2',
  'org_beta_3',
  'org_beta_4',
  'org_beta_5'
);

-- Also set feature flag
-- ENABLE_LICENSE_MIDDLEWARE=true
-- LICENSE_ROLLOUT_ORG_IDS=org_beta_1,org_beta_2,org_beta_3,org_beta_4,org_beta_5
```

---

### 4.3 Post-Migration Validation

**Validation Query 1: Orphaned Licenses**
```sql
-- Find licenses for deleted users
SELECT ul.*, u.id as user_exists
FROM "userLicenses" ul
LEFT JOIN "users" u ON u.id = ul."userId"
WHERE u.id IS NULL;

-- Expected: 0 rows
```

**Validation Query 2: Missing License Settings**
```sql
-- Find orgs enabled without settings
SELECT o.id, o.name, o.type
FROM "organizations" o
WHERE o."licenseEnabled" = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM "organizationLicenseSettings" 
    WHERE "organizationId" = o.id
  );

-- Expected: 0 rows
```

**Validation Query 3: E-Learning Instructor Coverage**
```sql
-- Find OrgAdmins without licenses in e-learning orgs
WITH elearning_admins AS (
  SELECT ou."userId", o.id as "organizationId", o.name
  FROM "organizations" o
  JOIN "organizationUsers" ou ON ou."organizationId" = o.id
  WHERE o.type = 'elearning' AND ou.role = 'orgadmin'
)
SELECT ea.*
FROM elearning_admins ea
LEFT JOIN "userLicenses" ul ON ul."userId" = ea."userId" 
  AND ul."organizationId" = ea."organizationId"
WHERE ul.id IS NULL;

-- Expected: Only instructors without active subscriptions
```

**Validation Query 4: Count Summary**
```sql
-- Summary of backfilled data
SELECT 
  o.type,
  COUNT(DISTINCT ul."userId") as users_with_licenses,
  COUNT(DISTINCT ols."organizationId") as orgs_with_settings,
  SUM(CASE WHEN o."licenseEnabled" THEN 1 ELSE 0 END) as orgs_enabled
FROM "organizations" o
LEFT JOIN "userLicenses" ul ON ul."organizationId" = o.id
LEFT JOIN "organizationLicenseSettings" ols ON ols."organizationId" = o.id
WHERE o."isActive" = TRUE
GROUP BY o.type;
```

---

### 4.4 Rollback Playbook (Phase 4 Specific)

**Scenario 1: Backfill Created Duplicate Licenses**
```sql
-- Find duplicates
SELECT "userId", "organizationId", COUNT(*) as duplicate_count
FROM "userLicenses"
GROUP BY "userId", "organizationId"
HAVING COUNT(*) > 1;

-- Fix: Unique constraint should prevent this, but if it happens:
DELETE FROM "userLicenses" ul1
WHERE EXISTS (
  SELECT 1 FROM "userLicenses" ul2
  WHERE ul2."userId" = ul1."userId"
    AND ul2."organizationId" = ul1."organizationId"
    AND ul2.id > ul1.id  -- Keep newest record
);
```

**Scenario 2: Incorrect Licenses Granted**
```sql
-- Disable all backfilled licenses (soft delete)
UPDATE "userLicenses"
SET status = 'inactive', "deactivatedAt" = NOW()
WHERE "activatedAt" >= '<BACKFILL_START_DATE>';

-- Hard delete if needed
DELETE FROM "userLicenses"
WHERE "activatedAt" >= '<BACKFILL_START_DATE>';
```

**Scenario 3: Org Settings Incorrect**
```sql
-- Reset all license settings
DELETE FROM "organizationLicenseSettings";

-- Disable license system
UPDATE "organizations"
SET "licenseEnabled" = FALSE, "licenseBillingStartDate" = NULL;
```

---

### 4.5 Coordinated Feature Flag Cutover

**Timeline for Beta Rollout (Week 1)**

**Monday**:
- ✅ Run Stage 1 (create org settings)
- ✅ Run Stage 2 (backfill e-learning instructors)
- ✅ Validate with queries
- ❌ License middleware DISABLED
- ❌ License UI DISABLED

**Tuesday**:
- ✅ Enable Stage 3 (5 beta orgs)
- ✅ Set `ENABLE_LICENSE_UI=true` for beta orgs only
- ❌ License middleware DISABLED (UI visible but not enforced)

**Wednesday**:
- ✅ Test license activation flows in beta orgs
- ✅ Enable `ENABLE_LICENSE_MIDDLEWARE=true` + `LICENSE_ROLLOUT_ORG_IDS=<beta_orgs>`
- ✅ Monitor middleware performance

**Thursday**:
- ✅ Test license payments with test mode YOCO
- ✅ Enable `ENABLE_LICENSE_PAYMENTS=true` for beta orgs
- ✅ Monitor payment success rate

**Friday**:
- ✅ Validate beta week success metrics
- ✅ Collect feedback from beta organizations
- ✅ Prepare for 25% rollout next week

**Rollback Trigger**: If >5% error rate OR >2 critical bugs OR beta org requests rollback

---

### 4.6 Gradual Rollout Schedule

**Week 2: 25% Rollout**
```sql
-- Enable for 25% of organizations (by type)
WITH org_sample AS (
  SELECT id 
  FROM "organizations"
  WHERE "isActive" = TRUE AND "isDemo" = FALSE
  ORDER BY RANDOM()
  LIMIT (SELECT COUNT(*) * 0.25 FROM "organizations" WHERE "isActive" = TRUE)
)
UPDATE "organizations"
SET "licenseEnabled" = TRUE
WHERE id IN (SELECT id FROM org_sample);

-- Update feature flags
-- LICENSE_ROLLOUT_ORG_IDS=<comma_separated_25%_org_ids>
```

**Week 3: 50% Rollout**
**Week 4: 100% Rollout**

---

### 4.7 Monitoring During Backfill

**Metrics to Track**:
- Licenses created per minute (should be <100 to avoid DB overload)
- Unique constraint violations (should be 0)
- Failed backfill queries (should be 0)
- Orphaned records (should be 0)

**Alert Conditions**:
- **Critical**: Backfill query fails with constraint violation
- **High**: Validation query finds orphaned licenses
- **Medium**: Backfill takes >10 minutes (indicates performance issue)

---

## Phase 5: Feature Flags & Rollout Toggles

### 5.1 Environment Variables
```bash
# Feature flags (all default to FALSE for safety)
ENABLE_LICENSE_SYSTEM=false          # Master kill switch
ENABLE_LICENSE_MIDDLEWARE=false      # Middleware enforcement
ENABLE_LICENSE_PAYMENTS=false        # YOCO license billing
ENABLE_LICENSE_UI=false              # Frontend license management

# Rollout controls
LICENSE_ROLLOUT_ORG_IDS=            # Comma-separated list of org IDs for gradual rollout
LICENSE_BETA_USERS=                  # Comma-separated list of user IDs for beta testing
```

### 5.2 Gradual Rollout Plan
1. **Week 1**: Internal testing with demo organizations
2. **Week 2**: Beta with 5 selected organizations
3. **Week 3**: Rollout to 25% of organizations
4. **Week 4**: Rollout to 100% if no issues

---

## Phase 6: Monitoring & Alerts

### 6.1 Critical Metrics
- License activation success rate (target: >99%)
- Middleware performance (target: <10ms avg)
- Payment success rate (target: >95%)
- Database query count per request (target: <2)

### 6.2 Alerts
- **Critical**: License payment failures >5% in 1 hour
- **High**: Middleware latency >50ms for 5 minutes
- **Medium**: Cache hit rate <90% for 10 minutes

---

## Phase 7: Rollback Procedures

### Emergency Rollback (< 5 minutes)
```bash
# 1. Disable all license features
ENABLE_LICENSE_SYSTEM=false
ENABLE_LICENSE_MIDDLEWARE=false
ENABLE_LICENSE_PAYMENTS=false

# 2. Restart application
npm run restart

# 3. Verify users can access platform normally
```

### Full Schema Rollback (if needed, < 30 minutes)
```sql
-- Drop new tables (preserves audit trail via backups)
DROP TABLE IF EXISTS "organizationLicenseSettings", "licensePayments", "userLicenses" CASCADE;

-- Remove columns from existing tables
ALTER TABLE "users" DROP COLUMN IF EXISTS "licenseTier";
ALTER TABLE "organizations" 
  DROP COLUMN IF EXISTS "licenseEnabled",
  DROP COLUMN IF EXISTS "licenseBillingStartDate";
```

---

## Phase 8: Testing Checklist

### Pre-Migration Testing
- [ ] Backup production database
- [ ] Test migrations on staging environment
- [ ] Verify rollback procedures on staging
- [ ] Load test middleware with 1000 concurrent requests
- [ ] Test payment intent idempotency with duplicate webhooks

### Post-Migration Testing
- [ ] Verify existing users can log in
- [ ] Verify existing courses still accessible
- [ ] Verify existing payments still processing
- [ ] Verify new license activation flow
- [ ] Verify license expiration handling

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Payment duplication | Medium | Critical | Idempotency keys, transaction locks |
| Performance degradation | Low | High | Request-scoped caching, route whitelisting |
| Data corruption | Low | Critical | Transactions, foreign key constraints |
| Trial users locked out | Medium | Medium | Grace periods, soft locks first |
| Migration rollback | Low | High | Feature flags, documented procedures |

---

## Success Criteria
- ✅ Zero downtime during migration
- ✅ No data loss or corruption
- ✅ <1% increase in average response time
- ✅ Existing features work unchanged
- ✅ All new tables have proper indexes
- ✅ Rollback plan tested and documented

---

## Timeline
- **Day 1-2**: Schema migrations (Phase 1)
- **Day 3-4**: Payment orchestrator extension (Phase 2)
- **Day 5-6**: Middleware implementation (Phase 3)
- **Day 7**: Data backfill and validation (Phase 4)
- **Day 8-14**: Gradual rollout with monitoring (Phase 5-6)

---

## Sign-off Required
- [ ] Database Administrator
- [ ] Backend Lead
- [ ] Product Owner
- [ ] Security Team

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-23  
**Next Review**: Before Phase 2 implementation
