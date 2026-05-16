import { createHmac, timingSafeEqual } from 'crypto';
import { Request, Response } from 'express';
import { IntegrationConfigService } from './integrationConfigService';
import { IntegrationAuditService } from './integrationAuditService';

/**
 * YOCO Webhook Signature Verifier
 * 
 * Implements the official YOCO webhook signature verification per:
 * https://developer.yoco.com/guides/online-payments/webhooks/verifying-the-events
 * 
 * This shared helper ensures consistent webhook verification across all endpoints.
 */

export interface YocoWebhookVerificationResult {
  valid: boolean;
  error?: string;
  statusCode: number;
  webhookId?: string;
  timestamp?: number;
}

/**
 * Verify YOCO webhook signature according to official API specification.
 * 
 * Cryptographic Implementation (per official Yoco Node.js example):
 * 1. Extract headers: webhook-id, webhook-timestamp, webhook-signature
 * 2. Build signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
 * 3. Process secret: Remove 'whsec_' prefix, base64 decode to get key bytes
 * 4. Generate HMAC-SHA256 signature, output as base64
 * 5. Extract signature from header: .split(" ")[0].split(",")[1]
 * 6. Compare using timingSafeEqual with Buffer.from(expected) and Buffer.from(signature)
 * 
 * HTTP Status Codes (per Yoco spec):
 * - 200: Valid webhook
 * - 400: Invalid request (missing headers, malformed data)
 * - 403: Invalid signature
 * 
 * @param req Express request object with rawBody attached
 * @returns YocoWebhookVerificationResult with validation status
 */
export async function verifyYocoWebhook(req: Request): Promise<YocoWebhookVerificationResult> {
  const startedAt = Date.now();
  const webhookId = req.headers['webhook-id'] as string;
  const webhookTimestamp = req.headers['webhook-timestamp'] as string;
  const webhookSignature = req.headers['webhook-signature'] as string;
  const rawBody = (req as any).rawBody as string;
  
  const webhookSecret = await IntegrationConfigService.getSecret('yoco', 'webhookSecret');
  const isProduction = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
  
  // SECURITY: In production, webhook secret MUST be configured - fail closed
  if (!webhookSecret && isProduction) {
    console.error('[YOCO Webhook] CRITICAL: YOCO_WEBHOOK_SECRET not configured in production');
    return {
      valid: false,
      error: 'Webhook verification not configured',
      statusCode: 500
    };
  }
  
  // SECURITY: In development, require explicit flag to skip verification
  // This prevents accidental bypass if YOCO_WEBHOOK_SECRET is simply missing
  if (!webhookSecret) {
    const skipVerification = process.env.YOCO_SKIP_WEBHOOK_VERIFICATION === 'true';
    if (skipVerification) {
      console.warn('[YOCO Webhook] INSECURE: Webhook verification explicitly skipped via YOCO_SKIP_WEBHOOK_VERIFICATION=true');
      const result = {
        valid: true,
        webhookId,
        timestamp: webhookTimestamp ? Number(webhookTimestamp) : undefined,
        statusCode: 200
      };
      await IntegrationAuditService.logIntegrationEvent({
        provider: 'yoco',
        operation: 'verify_webhook_signature',
        status: 'degraded',
        severity: 'warn',
        message: 'YOCO webhook verification bypassed by development flag',
        durationMs: Date.now() - startedAt,
        requestSummary: { webhookId: webhookId || null },
      });
      return result;
    }
    // Fail closed by default - no secret means reject
    console.error('[YOCO Webhook] No webhook secret configured - rejecting webhook');
    return {
      valid: false,
      error: 'Webhook verification not configured. Set YOCO webhook secret in Integration Settings (or use YOCO_SKIP_WEBHOOK_VERIFICATION=true only for development).',
      statusCode: 500
    };
  }
  
  // Validate required headers per Yoco spec
  // HTTP 400 for missing/malformed request data
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    console.error('[YOCO Webhook] Missing required headers:', {
      'webhook-id': !!webhookId,
      'webhook-timestamp': !!webhookTimestamp,
      'webhook-signature': !!webhookSignature
    });
    return {
      valid: false,
      error: 'Missing required YOCO webhook headers',
      statusCode: 400  // Per Yoco spec: 400 for invalid request data
    };
  }
  
  if (!rawBody) {
    console.error('[YOCO Webhook] Raw body not available for signature verification');
    return {
      valid: false,
      error: 'Internal configuration error - raw body not captured',
      statusCode: 500
    };
  }
  
  // Parse signature format per Yoco spec: "v1,<base64_signature>" or "v1,sig1 v2,sig2"
  // Extract first signature: .split(" ")[0].split(",")[1]
  const signatureHeader = (webhookSignature || '').trim();
  const firstToken = signatureHeader.split(' ')[0];
  const signatureParts = firstToken.split(',');
  
  if (signatureParts.length < 2 || signatureParts[0] !== 'v1') {
    console.error('[YOCO Webhook] Invalid signature format - expected v1,<signature>');
    return {
      valid: false,
      error: 'Invalid webhook signature format',
      statusCode: 400  // Malformed request data
    };
  }
  
  const providedSignature = signatureParts[1];
  
  // Build signed content per Yoco spec: webhook-id.webhook-timestamp.rawBody
  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  
  // Process webhook secret per Yoco spec: 
  // Secret format: "whsec_<base64_encoded_key>"
  // Extract and base64 decode: secret.split("_")[1] then Buffer.from(..., 'base64')
  const secretParts = webhookSecret.split('_');
  const secretBytes = secretParts.length > 1 
    ? Buffer.from(secretParts[1], 'base64')
    : Buffer.from(webhookSecret);  // Fallback for non-standard format
  
  // Generate expected signature using HMAC-SHA256 with decoded secret bytes
  const expectedSignature = createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');
  
  // Compare signatures using timing-safe comparison
  // Per official Yoco Node.js example: crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  // Both are base64 strings converted to UTF-8 buffers
  try {
    const expectedBuffer = Buffer.from(expectedSignature);
    const providedBuffer = Buffer.from(providedSignature);
    
    // Log for debugging (no secrets exposed)
    console.log('[YOCO Webhook] Signature verification:', {
      secretFormat: webhookSecret.startsWith('whsec_') ? 'whsec_format' : 'raw',
      secretBytesLength: secretBytes.length,
      signedContentLength: signedContent.length,
      expectedLength: expectedBuffer.length,
      providedLength: providedBuffer.length
    });
    
    // Length check required for timingSafeEqual
    if (expectedBuffer.length !== providedBuffer.length) {
      console.error('[YOCO Webhook] Signature length mismatch');
      return {
        valid: false,
        error: 'Invalid webhook signature',
        statusCode: 403  // Per Yoco spec: 403 for invalid signature
      };
    }
    
    if (!timingSafeEqual(expectedBuffer, providedBuffer)) {
      console.error('[YOCO Webhook] Signature verification failed');
      return {
        valid: false,
        error: 'Invalid webhook signature',
        statusCode: 403  // Per Yoco spec: 403 for invalid signature
      };
    }
  } catch (e) {
    console.error('[YOCO Webhook] Signature comparison error:', e);
    return {
      valid: false,
      error: 'Invalid webhook signature',
      statusCode: 403
    };
  }
  
  // Validate timestamp is within 3 minutes to prevent replay attacks
  const timestamp = Number(webhookTimestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  
  if (Number.isNaN(timestamp) || Math.abs(nowSeconds - timestamp) > 180) {
    console.error('[YOCO Webhook] Timestamp outside 3-minute tolerance window');
    return {
      valid: false,
      error: 'Webhook timestamp outside tolerance',
      statusCode: 403  // Treat as invalid for security
    };
  }
  
  console.log('[YOCO Webhook] Signature verified successfully');
  
  const successResult = {
    valid: true,
    webhookId,
    timestamp,
    statusCode: 200
  };
  await IntegrationAuditService.logIntegrationEvent({
    provider: 'yoco',
    operation: 'verify_webhook_signature',
    status: 'success',
    message: 'YOCO webhook signature verified',
    durationMs: Date.now() - startedAt,
    requestSummary: { webhookId, timestamp },
  });
  return successResult;
}

/**
 * Express middleware helper that performs verification and sends error response if invalid.
 * Returns true if verification passed, false if error response was sent.
 * 
 * @param req Express request
 * @param res Express response
 * @returns true if valid, false if error response was sent
 */
export async function verifyYocoWebhookMiddleware(req: Request, res: Response): Promise<{ verified: boolean; webhookId?: string }> {
  const result = await verifyYocoWebhook(req);
  
  if (!result.valid) {
    res.status(result.statusCode).json({ error: result.error });
    return { verified: false };
  }
  
  return { verified: true, webhookId: result.webhookId };
}
