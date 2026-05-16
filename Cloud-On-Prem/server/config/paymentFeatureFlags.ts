/**
 * Payment & Fulfillment Feature Flags
 * 
 * Lightweight feature flag system for payment-related features.
 * Uses environment variables with safe defaults.
 * 
 * Environment Variables:
 * - ASYNC_RECEIPT_EMAIL: Enable async background processing for receipts/emails (default: true)
 *   Set to 'false' to revert to synchronous processing (rollback)
 */

export interface PaymentFeatureFlags {
  asyncReceiptEmailEnabled: boolean;
}

let cachedFlags: PaymentFeatureFlags | null = null;

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') return defaultValue;
  return value.toLowerCase() === 'true';
}

export function getPaymentFeatureFlags(): PaymentFeatureFlags {
  if (cachedFlags) {
    return cachedFlags;
  }

  cachedFlags = {
    asyncReceiptEmailEnabled: parseBool(process.env.ASYNC_RECEIPT_EMAIL, true),
  };

  return cachedFlags;
}

export function isAsyncReceiptEmailEnabled(): boolean {
  return getPaymentFeatureFlags().asyncReceiptEmailEnabled;
}

export function logPaymentFeatureFlags(): void {
  const flags = getPaymentFeatureFlags();
  console.log(`   ASYNC_RECEIPT_EMAIL: ${flags.asyncReceiptEmailEnabled ? '✅ ENABLED' : '❌ DISABLED'}`);
  
  if (flags.asyncReceiptEmailEnabled) {
    console.log('📧 Async receipt/email processing is ENABLED - receipts will be generated in background');
  } else {
    console.log('📧 Async receipt/email processing is DISABLED - using synchronous processing');
  }
}

export function resetPaymentFeatureFlagsCache(): void {
  cachedFlags = null;
}
