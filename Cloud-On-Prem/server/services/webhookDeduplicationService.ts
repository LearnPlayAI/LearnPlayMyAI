import { db } from "../db";
import { paymentWebhookEvents } from "@shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export interface WebhookEventMetadata {
  checkoutId: string;
  eventType: string;
  rawPayload?: any;
  source?: 'webhook' | 'reconciliation' | 'manual';
}

export interface DeduplicationResult {
  isDuplicate: boolean;
  eventId: string;
  existingEvent?: {
    id: string;
    processedAt: Date | null;
    success: boolean;
  };
}

export class WebhookDeduplicationService {
  
  static generateEventId(checkoutId: string, eventType: string, idempotencyKey?: string): string {
    if (idempotencyKey) {
      return idempotencyKey;
    }
    const hash = crypto.createHash('sha256');
    hash.update(`${checkoutId}:${eventType}`);
    return hash.digest('hex').substring(0, 32);
  }

  static async checkAndClaim(metadata: WebhookEventMetadata): Promise<DeduplicationResult> {
    const eventId = this.generateEventId(metadata.checkoutId, metadata.eventType);
    
    try {
      const [existingEvent] = await db
        .select({
          id: paymentWebhookEvents.id,
          processedAt: paymentWebhookEvents.processedAt,
          success: paymentWebhookEvents.success,
        })
        .from(paymentWebhookEvents)
        .where(eq(paymentWebhookEvents.eventId, eventId))
        .limit(1);
      
      if (existingEvent) {
        console.log(`[WebhookDedup] Duplicate event detected: ${eventId} for checkout ${metadata.checkoutId}`);
        return {
          isDuplicate: true,
          eventId,
          existingEvent: {
            id: existingEvent.id,
            processedAt: existingEvent.processedAt,
            success: existingEvent.success,
          },
        };
      }

      await db.insert(paymentWebhookEvents).values({
        eventId,
        checkoutId: metadata.checkoutId,
        eventType: metadata.eventType,
        fulfilledBy: metadata.source || 'webhook',
        success: true,
        metadata: metadata.rawPayload ? JSON.stringify(metadata.rawPayload) : null,
      });

      console.log(`[WebhookDedup] Claimed event: ${eventId} for checkout ${metadata.checkoutId}`);
      return {
        isDuplicate: false,
        eventId,
      };
    } catch (error: any) {
      if (error.code === '23505') {
        console.log(`[WebhookDedup] Race condition - event already claimed: ${eventId}`);
        const [existingEvent] = await db
          .select({
            id: paymentWebhookEvents.id,
            processedAt: paymentWebhookEvents.processedAt,
            success: paymentWebhookEvents.success,
          })
          .from(paymentWebhookEvents)
          .where(eq(paymentWebhookEvents.eventId, eventId))
          .limit(1);
        
        return {
          isDuplicate: true,
          eventId,
          existingEvent: existingEvent ? {
            id: existingEvent.id,
            processedAt: existingEvent.processedAt,
            success: existingEvent.success,
          } : undefined,
        };
      }
      throw error;
    }
  }

  static async recordCompletion(
    eventId: string,
    success: boolean,
    processingDurationMs: number,
    errorMessage?: string
  ): Promise<void> {
    await db
      .update(paymentWebhookEvents)
      .set({
        processedAt: new Date(),
        processingDurationMs,
        success,
        errorMessage: errorMessage || null,
      })
      .where(eq(paymentWebhookEvents.eventId, eventId));
    
    console.log(`[WebhookDedup] Recorded completion for ${eventId}: success=${success}, duration=${processingDurationMs}ms`);
  }

  static async getEventStats(): Promise<{
    totalEvents: number;
    successfulEvents: number;
    failedEvents: number;
    avgProcessingTimeMs: number;
  }> {
    const result = await db.execute<{
      total: string;
      successful: string;
      failed: string;
      avg_duration: string;
    }>(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE success = true) as successful,
        COUNT(*) FILTER (WHERE success = false) as failed,
        COALESCE(AVG("processingDurationMs"), 0) as avg_duration
      FROM "paymentWebhookEvents"
      WHERE "createdAt" > NOW() - INTERVAL '24 hours'
    `);
    
    const row = result.rows[0];
    return {
      totalEvents: parseInt(row?.total || '0'),
      successfulEvents: parseInt(row?.successful || '0'),
      failedEvents: parseInt(row?.failed || '0'),
      avgProcessingTimeMs: parseFloat(row?.avg_duration || '0'),
    };
  }

  static async cleanupOldEvents(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const result = await db.execute<{ count: string }>(
      `DELETE FROM "paymentWebhookEvents"
       WHERE "createdAt" < '${cutoffDate.toISOString()}'
       RETURNING id`
    );
    
    const deletedCount = result.rows?.length || 0;
    console.log(`[WebhookDedup] Cleaned up ${deletedCount} events older than ${daysToKeep} days`);
    return deletedCount;
  }
}
