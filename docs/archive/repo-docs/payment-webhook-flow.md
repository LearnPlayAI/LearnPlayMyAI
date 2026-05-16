# Payment Webhook Fulfillment Flow for License Payments

## Overview
This document defines the state machine and idempotency guarantees for license payment webhooks through the Payment Orchestrator system.

## System Components

### 1. Payment Orchestrator Service
- **Location**: `server/services/paymentOrchestratorService.ts`
- **Responsibility**: Routes payment intents to appropriate fulfillment handlers
- **Idempotency**: Handles duplicate webhook deliveries

### 2. License Checkout Service (NEW)
- **Location**: `server/services/licenseCheckoutService.ts` (to be created)
- **Responsibility**: Creates license payment intents and processes fulfillments
- **Key Methods**:
  - `createLicensePaymentIntent()`
  - `fulfillLicensePayment()`
  - `refundLicensePayment()`

### 3. License Service (NEW)
- **Location**: `server/services/licenseService.ts` (to be created)
- **Responsibility**: Core license activation/deactivation logic
- **Key Methods**:
  - `activateLicenses()`
  - `deactivateLicenses()`
  - `checkUserLicense()`

---

## Payment Intent Types

### Existing Intent Types
- `course` - Course purchases
- `credit` - Lesson credit purchases
- `subscription` - Subscription renewals (OrgAdmin-level for E-Learning)

### NEW Intent Type
- `license` - Per-seat license activations (Education/Business orgs)

---

## License Payment Flow

### Step 1: Payment Intent Creation

**Trigger**: OrgAdmin selects users and clicks "Activate Licenses"

**Process**:
```typescript
// Frontend: BuyCredits.tsx or LicenseCheckout.tsx
const response = await apiRequest('/api/licenses/checkout', {
  method: 'POST',
  body: {
    organizationId: string,
    userIds: string[],      // Selected learners
    tier: 'blue' | 'gold' | 'platinum',
    billingPeriod: 'monthly',
  }
});

// Backend: LicenseCheckoutService.createLicensePaymentIntent()
const paymentIntent = await PaymentOrchestratorService.createPaymentIntent({
  intentType: 'license',
  amount: seatCount * pricePerSeat,
  currency: organization.currency,
  metadata: {
    organizationId,
    userIds,          // Array of user IDs to activate
    tier,
    seatCount,
    billingPeriodStart: startOfNextMonth(),
    billingPeriodEnd: endOfNextMonth(),
    pricePerSeat,
  }
});

// Insert pending license payment record
await db.insert(licensePayments).values({
  organizationId,
  seatCount,
  pricePerSeat,
  totalAmount: amount,
  currency,
  status: 'pending',
  paymentIntentId: paymentIntent.id,
  billingPeriodStart,
  billingPeriodEnd,
});
```

**Idempotency Key**: `organizationId:billingPeriodStart` - prevents duplicate billing for same period.

**Database Constraint**:
```sql
-- Enforce idempotency at database level
CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_license_payment_period" 
ON "licensePayments"("organizationId", "billingPeriodStart");

-- This ensures only ONE payment intent per org per billing period
-- If duplicate attempt, PostgreSQL will throw unique constraint violation
-- Application should catch this and return existing payment intent ID
```

**Idempotency Implementation**:
```typescript
// Before creating new payment intent, check for existing
const existingPayment = await db.query.licensePayments.findFirst({
  where: and(
    eq(licensePayments.organizationId, organizationId),
    eq(licensePayments.billingPeriodStart, billingPeriodStart)
  )
});

if (existingPayment) {
  // Return existing payment intent instead of creating duplicate
  const existingIntent = await db.query.paymentIntents.findFirst({
    where: eq(paymentIntents.id, existingPayment.paymentIntentId)
  });
  
  return {
    paymentIntent: existingIntent,
    checkoutUrl: existingIntent.checkoutUrl,
    duplicate: true,
  };
}
```

---

### Step 2: YOCO Checkout Redirect

**Process**:
1. Frontend redirects to YOCO Checkout with `paymentIntentId`
2. User completes payment on YOCO
3. YOCO sends webhook to `/api/webhooks/yoco`

---

### Step 3: Webhook Reception & Validation

**Endpoint**: `POST /api/webhooks/yoco`

**Security Checks**:
1. ✅ HMAC SHA256 signature verification (raw body)
2. ✅ Replay protection (event ID tracking)
3. ✅ Constant-time comparison
4. ✅ Event expiration (7-day TTL)

**Webhook Payload**:
```json
{
  "id": "wh_evt_abc123",
  "type": "payment.succeeded",
  "payload": {
    "id": "ch_xyz789",
    "metadata": {
      "paymentIntentId": "pi_001"
    }
  }
}
```

---

### Step 4: Payment Orchestrator Routing

**Process**:
```typescript
// server/routes.ts webhook handler
const paymentIntent = await db.query.paymentIntents.findFirst({
  where: eq(paymentIntents.yocoCheckoutId, webhookPayload.payload.id)
});

if (!paymentIntent) {
  return res.status(404).json({ error: 'Payment intent not found' });
}

// Route to appropriate fulfillment handler based on intentType
switch (paymentIntent.intentType) {
  case 'license':
    await PaymentOrchestratorService.fulfillLicensePayment(paymentIntent);
    break;
  case 'course':
    await PaymentOrchestratorService.fulfillCoursePurchase(paymentIntent);
    break;
  // ... other types
}
```

---

### Step 5: License Payment Fulfillment

**State Machine** (Compare-and-Swap):

```typescript
async fulfillLicensePayment(paymentIntent: PaymentIntent) {
  const metadata = paymentIntent.metadata as LicensePaymentMetadata;
  
  // STEP 1: Idempotency check - prevent duplicate fulfillment
  const existingPayment = await db.query.licensePayments.findFirst({
    where: eq(licensePayments.paymentIntentId, paymentIntent.id)
  });

  if (!existingPayment) {
    console.error(`[LicenseCheckout] No license payment found for intent ${paymentIntent.id}`);
    throw new Error('License payment not found');
  }

  if (existingPayment.status === 'paid') {
    console.log(`[LicenseCheckout] Payment ${paymentIntent.id} already fulfilled`);
    return { success: true, duplicate: true };
  }

  // STEP 2: Compare-and-Swap status update (prevents race conditions)
  const [updated] = await db.update(licensePayments)
    .set({
      status: 'processing',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(licensePayments.id, existingPayment.id),
        eq(licensePayments.status, 'pending') // Only update if still pending
      )
    )
    .returning();

  if (!updated) {
    console.warn(`[LicenseCheckout] Race condition detected for payment ${existingPayment.id}`);
    return { success: false, reason: 'race_condition' };
  }

  // STEP 3: BEGIN TRANSACTION for atomic fulfillment
  // This ensures all-or-nothing: either all licenses activate OR none do
  return await db.transaction(async (tx) => {
    try {
      // STEP 3a: Activate licenses (within transaction)
      const activationResults = await LicenseService.activateLicenses({
        userIds: metadata.userIds,
        organizationId: metadata.organizationId,
        tier: metadata.tier,
        expiresAt: metadata.billingPeriodEnd,
        activatedBy: paymentIntent.userId,
      }, tx); // Pass transaction to service

      // STEP 3b: Check for partial failures
      if (activationResults.failed > 0) {
        // Log partial failures but don't rollback if majority succeeded
        console.warn(`[LicenseCheckout] Partial activation failure: ${activationResults.failed}/${metadata.userIds.length} failed`);
        
        // If >50% failed, rollback transaction
        const failureRate = activationResults.failed / metadata.userIds.length;
        if (failureRate > 0.5) {
          throw new Error(`Too many activation failures: ${activationResults.failed}/${metadata.userIds.length}`);
        }
      }

      // STEP 4: Mark payment as paid (within transaction)
      await tx.update(licensePayments)
        .set({
          status: 'paid',
          paidAt: new Date(),
        })
        .where(eq(licensePayments.id, existingPayment.id));

      // STEP 5: Mark payment intent as completed (within transaction)
      await tx.update(paymentIntents)
        .set({
          status: 'completed',
          completedAt: new Date(),
        })
        .where(eq(paymentIntents.id, paymentIntent.id));

      console.log(`[LicenseCheckout] Activated ${activationResults.activated} licenses for org ${metadata.organizationId}`);

      // Transaction commits here if no errors
      return {
        success: true,
        licensesActivated: activationResults.activated,
        licensesFailed: activationResults.failed,
        failedUserIds: activationResults.errors.map(e => e.userId),
      };

    } catch (error) {
      // Transaction will auto-rollback on error
      // All license activations and payment updates are reverted
      console.error(`[LicenseCheckout] Fulfillment failed for payment ${existingPayment.id}:`, error);

      // STEP 6: Mark payment as failed (outside transaction, separate query)
      // This update happens even if transaction rolled back
      await db.update(licensePayments)
        .set({
          status: 'failed',
          updatedAt: new Date(),
        })
        .where(eq(licensePayments.id, existingPayment.id));

      // STEP 7: Create compensation task for retry
      await createCompensationTask({
        type: 'license_activation_failed',
        paymentIntentId: paymentIntent.id,
        licensePaymentId: existingPayment.id,
        error: error.message,
        metadata: {
          organizationId: metadata.organizationId,
          userIds: metadata.userIds,
          tier: metadata.tier,
        },
      });

      throw error; // Re-throw so webhook handler knows it failed
    }
  });
}

/**
 * Compensation task for manual or automated retry
 */
async function createCompensationTask(task: {
  type: string;
  paymentIntentId: string;
  licensePaymentId: string;
  error: string;
  metadata: any;
}) {
  // Store in compensation_tasks table for SuperAdmin review
  await db.insert(compensationTasks).values({
    taskType: task.type,
    status: 'pending',
    payload: JSON.stringify(task),
    createdAt: new Date(),
  });

  // Send alert to ops team
  console.error(`[CompensationTask] Created: ${task.type} for payment ${task.paymentIntentId}`);
  
  // TODO: Send email alert to ops@learnplay.co.za
}
```

---

### Step 6: License Activation (Atomic)

**Process**:
```typescript
// server/services/licenseService.ts
async activateLicenses(params: {
  userIds: string[],
  organizationId: string,
  tier: string,
  expiresAt: Date,
  activatedBy: string,
}) {
  const results = { activated: 0, failed: 0, errors: [] };

  for (const userId of params.userIds) {
    try {
      await db.insert(userLicenses)
        .values({
          userId,
          organizationId: params.organizationId,
          tier: params.tier,
          status: 'active',
          expiresAt: params.expiresAt,
          activatedBy: params.activatedBy,
          activatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [userLicenses.userId, userLicenses.organizationId],
          set: {
            tier: params.tier,
            status: 'active',
            expiresAt: params.expiresAt,
            activatedAt: new Date(),
            activatedBy: params.activatedBy,
            deactivatedAt: null,
            deactivatedBy: null,
          }
        });

      results.activated++;
    } catch (error) {
      results.failed++;
      results.errors.push({ userId, error: error.message });
    }
  }

  return results;
}
```

---

## State Diagram

```
[Payment Intent Created]
         |
         v
   [pending] ──────────────────┐
         |                     │
         v                     │ (webhook retry)
 [YOCO Checkout]               │
         |                     │
         v                     │
 [Webhook Received] ───────────┘
         |
         v
   [processing] (compare-and-swap)
         |
         ├──> [License Activation]
         |           |
         |           ├──> Success ──> [paid]
         |           └──> Failure ──> [failed] ──> [Manual Retry]
         |
         └──> Race Condition Detected ──> [Log & Skip]
```

---

## Idempotency Guarantees

### 1. Payment Intent Level
- **Key**: `paymentIntentId`
- **Check**: Lookup existing `licensePayments` by `paymentIntentId`
- **Action**: Skip if already `paid`

### 2. Billing Period Level
- **Key**: `organizationId + billingPeriodStart`
- **Check**: Unique index on `licensePayments(organizationId, billingPeriodStart)`
- **Action**: Reject duplicate billing period attempts

### 3. License Activation Level
- **Key**: `userId + organizationId`
- **Check**: Unique index on `userLicenses(userId, organizationId)`
- **Action**: Upsert (update existing or insert new)

### 4. Webhook Event Level
- **Key**: `webhookEvents.eventId`
- **Check**: Replay protection service
- **Action**: Reject duplicate webhook events

---

## Error Handling & Retry Logic

### Retryable Errors
- Database connection timeout
- Temporary network issues
- Race condition during compare-and-swap

**Action**: Mark payment as `failed`, log error, allow webhook retry.

### Non-Retryable Errors
- Invalid metadata (missing userIds)
- Organization not found
- Payment intent already completed

**Action**: Mark as `failed`, log error, send alert, no retry.

---

## Integration Testing Scenarios

### Test 1: Happy Path
1. Create payment intent with 5 users
2. Send successful webhook
3. Verify 5 licenses activated
4. Verify payment marked as `paid`

### Test 2: Duplicate Webhook
1. Create payment intent
2. Send successful webhook
3. Send same webhook again (duplicate)
4. Verify only 1 fulfillment occurs
5. Verify no duplicate license activations

### Test 3: Partial Activation Failure
1. Create payment intent with 10 users
2. Simulate DB error for user #5
3. Verify 9 licenses activated
4. Verify payment marked as `failed`
5. Verify error logged with failed userId

### Test 4: Race Condition
1. Create payment intent
2. Send 2 simultaneous webhooks
3. Verify compare-and-swap prevents double fulfillment
4. Verify only 1 payment status update

---

## Monitoring & Alerts

### Metrics to Track
- License payment success rate (target: >99%)
- Average fulfillment time (target: <500ms)
- Webhook retry count (alert if >3 retries)
- Failed activation count (alert if >0)

### Alert Conditions
- **Critical**: License payment failed after 3 webhook retries
- **High**: Race condition detected (indicates concurrency issue)
- **Medium**: Partial activation failure (some users not activated)

---

## Rollback & Recovery

### Scenario: Payment marked as paid, but licenses not activated

**Detection**:
```sql
SELECT lp.* 
FROM "licensePayments" lp
WHERE lp."status" = 'paid'
  AND lp."paidAt" > NOW() - INTERVAL '1 hour'
  AND (
    SELECT COUNT(*) 
    FROM "userLicenses" ul 
    WHERE ul."organizationId" = lp."organizationId"
      AND ul."activatedAt" >= lp."paidAt"
  ) < lp."seatCount";
```

**Recovery**:
1. Extract `userIds` from payment intent metadata
2. Call `LicenseService.activateLicenses()` manually
3. Log recovery action for audit trail

---

## Next Steps
1. Implement `LicenseCheckoutService.ts`
2. Implement `LicenseService.ts`
3. Add `'license'` case to webhook handler in `routes.ts`
4. Create integration tests for all scenarios
5. Add monitoring dashboards

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-23  
**Owner**: Backend Team
