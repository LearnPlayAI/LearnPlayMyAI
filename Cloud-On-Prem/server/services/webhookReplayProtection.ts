import { db } from '../db';
import { webhookEvents } from '@shared/schema';
import { eq, and, lt } from 'drizzle-orm';

/**
 * Webhook Replay Protection Service
 * 
 * Prevents replay attacks by tracking unique event IDs from webhooks.
 * Uses database constraint to ensure idempotency.
 */
export class WebhookReplayProtection {
  private static readonly DEFAULT_TTL_DAYS = 7;

  /**
   * Check if webhook event has already been processed (replay attack detection)
   * 
   * @param source - Webhook source (yoco, mailersend)
   * @param eventId - Unique event identifier from webhook payload
   * @param signature - Webhook signature for audit trail
   * @returns true if event is new and was recorded, false if replay detected
   */
  static async checkAndRecordEvent(
    source: 'yoco' | 'mailersend',
    eventId: string,
    signature: string
  ): Promise<boolean> {
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.DEFAULT_TTL_DAYS);

      await db.insert(webhookEvents).values({
        source,
        eventId,
        signature,
        expiresAt,
        processed: true,
      });

      console.log(`[WebhookReplay] Recorded new event: ${source}:${eventId}`);
      return true;
    } catch (error: any) {
      // Unique constraint violation = replay attack detected
      if (error.code === '23505') {
        console.warn(`[WebhookReplay] REPLAY DETECTED: ${source}:${eventId}`);
        return false;
      }

      // Other errors should be logged but not block processing
      console.error('[WebhookReplay] Error recording event:', error);
      throw error;
    }
  }

  /**
   * Cleanup expired webhook events (called by periodic scheduler)
   * Removes events older than TTL to prevent database bloat
   */
  static async cleanupExpiredEvents(): Promise<number> {
    try {
      const now = new Date();
      const deleted = await db.delete(webhookEvents)
        .where(lt(webhookEvents.expiresAt, now));

      const count = deleted.rowCount || 0;
      if (count > 0) {
        console.log(`[WebhookReplay] Cleaned up ${count} expired webhook events`);
      }

      return count;
    } catch (error) {
      console.error('[WebhookReplay] Error cleaning up expired events:', error);
      throw error;
    }
  }

  /**
   * Extract event ID from webhook payload based on source
   */
  static extractEventId(source: 'yoco' | 'mailersend', payload: any): string | null {
    try {
      if (source === 'yoco') {
        // YOCO sends unique ID in payload.id or payload.metadata.eventId
        return payload?.id || payload?.metadata?.eventId || null;
      }

      if (source === 'mailersend') {
        // MailerSend sends unique ID in data.email.message.id
        return payload?.data?.email?.message?.id || null;
      }

      return null;
    } catch (error) {
      console.error('[WebhookReplay] Error extracting event ID:', error);
      return null;
    }
  }
}
