import crypto from 'crypto';
import { db } from '../db';
import { users } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import bcrypt from 'bcrypt';

export interface TokenGenerationResult {
  token: string;
  hashedToken: string;
  expiresAt: Date;
}

export interface TokenVerificationResult {
  valid: boolean;
  userId?: string;
  error?: string;
}

export class PasswordResetService {
  private static readonly TOKEN_EXPIRY_HOURS = 1;
  private static readonly TOKEN_LENGTH = 32;

  /**
   * Generate a secure password reset token
   * Returns both the plain token (to send to user) and hashed token (to store in DB)
   */
  static generateResetToken(): TokenGenerationResult {
    const token = crypto.randomBytes(this.TOKEN_LENGTH).toString('hex');
    const hashedToken = this.hashToken(token);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.TOKEN_EXPIRY_HOURS);

    return {
      token,
      hashedToken,
      expiresAt,
    };
  }

  /**
   * Hash a token using HMAC-SHA256 with dedicated PASSWORD_RESET_SECRET
   * SECURITY: Uses dedicated secret to prevent compromise if SESSION_SECRET is leaked
   */
  static hashToken(token: string): string {
    const isProduction = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
    
    // SECURITY: Require secret in production - fail closed
    if (!process.env.PASSWORD_RESET_SECRET && !process.env.SESSION_SECRET) {
      if (isProduction) {
        throw new Error('[SECURITY] PASSWORD_RESET_SECRET or SESSION_SECRET required in production');
      }
    }
    
    const secret = process.env.PASSWORD_RESET_SECRET || process.env.SESSION_SECRET || 'dev-only-insecure-secret';
    
    if (!process.env.PASSWORD_RESET_SECRET && process.env.NODE_ENV !== 'test') {
      console.warn('[PasswordResetService] PASSWORD_RESET_SECRET not set - using SESSION_SECRET fallback. Set a dedicated secret for production.');
    }
    
    return crypto
      .createHmac('sha256', secret)
      .update(token)
      .digest('hex');
  }

  /**
   * Verify a password reset token
   * Returns user ID if valid, or error message if invalid
   * 
   * SECURITY: This method only verifies but doesn't consume the token.
   * The token is consumed in resetPassword() using a transaction to prevent reuse.
   */
  static async verifyResetToken(token: string): Promise<TokenVerificationResult> {
    try {
      const hashedToken = this.hashToken(token);

      const [user] = await db
        .select({
          id: users.id,
          passwordResetToken: users.passwordResetToken,
          passwordResetExpires: users.passwordResetExpires,
          isLocked: users.isLocked,
        })
        .from(users)
        .where(
          and(
            eq(users.passwordResetToken, hashedToken),
            // Use DB clock for comparison to avoid timezone serialization drift
            sql`${users.passwordResetExpires} > NOW()`
          )
        )
        .limit(1);

      if (!user) {
        return {
          valid: false,
          error: 'Invalid or expired reset token',
        };
      }

      if (user.isLocked) {
        return {
          valid: false,
          error: 'Account is locked. Please contact support.',
        };
      }

      return {
        valid: true,
        userId: user.id,
      };
    } catch (error) {
      console.error('[PasswordResetService] Token verification error:', error);
      return {
        valid: false,
        error: 'Token verification failed',
      };
    }
  }

  /**
   * Store reset token in database for a user
   */
  static async storeResetToken(
    userId: string,
    hashedToken: string,
    expiresAt: Date
  ): Promise<boolean> {
    try {
      await db
        .update(users)
        .set({
          passwordResetToken: hashedToken,
          passwordResetExpires: expiresAt,
        })
        .where(eq(users.id, userId));

      return true;
    } catch (error) {
      console.error('[PasswordResetService] Store token error:', error);
      return false;
    }
  }

  /**
   * Clear reset token from database (after successful reset or expiration)
   */
  static async clearResetToken(userId: string): Promise<boolean> {
    try {
      await db
        .update(users)
        .set({
          passwordResetToken: null,
          passwordResetExpires: null,
        })
        .where(eq(users.id, userId));

      return true;
    } catch (error) {
      console.error('[PasswordResetService] Clear token error:', error);
      return false;
    }
  }

  /**
   * Reset user password (hash with bcrypt)
   * 
   * SECURITY: Uses a conditional update to ensure the token hasn't been used.
   * If the token was already cleared by another concurrent request, this will fail.
   * This prevents token reuse in race conditions.
   * 
   * Returns { success: true } on success, or { success: false, error: string, errorCode: string } on failure
   */
  static async resetPassword(
    userId: string, 
    newPassword: string, 
    expectedToken: string
  ): Promise<{ success: boolean; error?: string; errorCode?: string }> {
    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const hashedToken = this.hashToken(expectedToken);
      const now = new Date();

      // First, check if the user exists and what state their token is in for better error messages
      const [existingUser] = await db
        .select({
          id: users.id,
          passwordResetToken: users.passwordResetToken,
          passwordResetExpires: users.passwordResetExpires,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!existingUser) {
        console.error(`[PasswordResetService] User not found: ${userId}`);
        return { success: false, error: 'User not found', errorCode: 'USER_NOT_FOUND' };
      }

      // Check if token has already been used (cleared)
      if (!existingUser.passwordResetToken) {
        console.error(`[PasswordResetService] Token already used for user ${userId}`);
        return { success: false, error: 'This reset link has already been used. Please request a new password reset.', errorCode: 'TOKEN_ALREADY_USED' };
      }

      // Check if token has expired
      if (existingUser.passwordResetExpires && existingUser.passwordResetExpires < now) {
        console.error(`[PasswordResetService] Token expired for user ${userId}`);
        return { success: false, error: 'This reset link has expired. Please request a new password reset.', errorCode: 'TOKEN_EXPIRED' };
      }

      // Check if token matches
      if (existingUser.passwordResetToken !== hashedToken) {
        console.error(`[PasswordResetService] Token mismatch for user ${userId}`);
        return { success: false, error: 'Invalid reset link. Please request a new password reset.', errorCode: 'TOKEN_MISMATCH' };
      }

      // Atomic update: Only update if the token still matches and is not expired
      // This prevents concurrent resets with the same token
      const result = await db
        .update(users)
        .set({
          password: hashedPassword,
          passwordResetToken: null,
          passwordResetExpires: null,
          failedLoginAttempts: 0,
          isLocked: false,
          lockedUntil: null,
        })
        .where(
          and(
            eq(users.id, userId),
            eq(users.passwordResetToken, hashedToken),
            // Use DB clock for comparison to avoid timezone serialization drift
            sql`${users.passwordResetExpires} > NOW()`
          )
        )
        .returning({ id: users.id });

      // If no rows were updated, there was a race condition
      if (result.length === 0) {
        console.error(`[PasswordResetService] Race condition - token used concurrently for user ${userId}`);
        return { success: false, error: 'This reset link was just used. Please request a new password reset if needed.', errorCode: 'RACE_CONDITION' };
      }

      console.log(`[PasswordResetService] Password reset successful for user ${userId}`);
      return { success: true };
    } catch (error) {
      console.error('[PasswordResetService] Password reset error:', error);
      return { success: false, error: 'An unexpected error occurred. Please try again.', errorCode: 'INTERNAL_ERROR' };
    }
  }

  /**
   * Clean up expired reset tokens (for scheduled job)
   */
  static async cleanupExpiredTokens(): Promise<number> {
    try {
      const result = await db
        .update(users)
        .set({
          passwordResetToken: null,
          passwordResetExpires: null,
        })
        .where(sql`${users.passwordResetExpires} < NOW()`)
        .returning({ id: users.id });

      const count = result.length;
      if (count > 0) {
        console.log(`[PasswordResetService] Cleaned up ${count} expired reset tokens`);
      }
      return count;
    } catch (error) {
      console.error('[PasswordResetService] Cleanup error:', error);
      return 0;
    }
  }

  /**
   * Invalidate all sessions for a user
   * This ensures user must re-login after password reset
   * 
   * NOTE: This method is best-effort and should never throw.
   * Session invalidation failure should not prevent password reset success.
   */
  static async invalidateUserSessions(userId: string, sessionStore: any): Promise<void> {
    try {
      // Check if sessionStore has the 'all' method (not all session stores implement it)
      if (!sessionStore || typeof sessionStore.all !== 'function') {
        console.log('[PasswordResetService] Session store does not support listing sessions - skipping invalidation');
        return;
      }

      return new Promise((resolve) => {
        try {
          sessionStore.all((err: any, sessions: any) => {
            try {
              if (err) {
                console.error('[PasswordResetService] Session fetch error:', err);
                resolve();
                return;
              }

              // Handle different session store return formats
              // Some stores return an array, others return an object keyed by session ID
              let sessionList: any[] = [];
              if (Array.isArray(sessions)) {
                sessionList = sessions;
              } else if (sessions && typeof sessions === 'object') {
                // Convert object to array of sessions with sid
                sessionList = Object.entries(sessions).map(([sid, sess]: [string, any]) => ({
                  ...sess,
                  sid
                }));
              }

              if (!sessionList || sessionList.length === 0) {
                console.log('[PasswordResetService] No sessions to invalidate');
                resolve();
                return;
              }

              let destroyed = 0;
              const userSessions = sessionList.filter((session: any) => {
                // Check both session.userId and session.passport?.user for compatibility
                const sessionUserId = session?.userId || session?.passport?.user;
                return sessionUserId === userId;
              });

              if (userSessions.length === 0) {
                console.log(`[PasswordResetService] No sessions found for user ${userId}`);
                resolve();
                return;
              }

              const destroyPromises = userSessions.map((session: any) => {
                return new Promise<void>((resolveDestroy) => {
                  try {
                    const sid = session.sid || session.id;
                    if (!sid) {
                      resolveDestroy();
                      return;
                    }
                    sessionStore.destroy(sid, (destroyErr: any) => {
                      if (destroyErr) {
                        console.error('[PasswordResetService] Session destroy error:', destroyErr);
                      } else {
                        destroyed++;
                      }
                      resolveDestroy();
                    });
                  } catch (innerErr) {
                    console.error('[PasswordResetService] Session destroy exception:', innerErr);
                    resolveDestroy();
                  }
                });
              });

              Promise.all(destroyPromises)
                .then(() => {
                  console.log(`[PasswordResetService] Invalidated ${destroyed} sessions for user ${userId}`);
                  resolve();
                })
                .catch((promiseErr) => {
                  console.error('[PasswordResetService] Session invalidation promise error:', promiseErr);
                  resolve();
                });
            } catch (callbackErr) {
              console.error('[PasswordResetService] Session callback error:', callbackErr);
              resolve();
            }
          });
        } catch (allErr) {
          console.error('[PasswordResetService] Session all() error:', allErr);
          resolve();
        }
      });
    } catch (outerErr) {
      console.error('[PasswordResetService] Session invalidation outer error:', outerErr);
      // Never throw - always resolve gracefully
    }
  }
}

/**
 * Rate limiting for password reset requests
 * In-memory cache with TTL
 * 
 * PRODUCTION WARNING: This in-memory rate limiter will NOT work correctly in
 * multi-node/horizontal scaling environments. Each application instance maintains
 * its own separate cache, allowing users to bypass limits by hitting different nodes.
 * 
 * For production deployments with multiple instances, use one of:
 * 1. Redis-backed rate limiting (recommended)
 * 2. Database-backed rate limiting with appropriate indexes
 * 3. Reverse proxy/load balancer rate limiting (nginx, HAProxy, Cloudflare)
 * 
 * This implementation is suitable for:
 * - Single-node deployments
 * - Development/testing environments
 * - Applications with sticky sessions (same user always hits same node)
 */
export class PasswordResetRateLimiter {
  private static emailCache = new Map<string, { count: number; resetAt: number }>();
  private static ipCache = new Map<string, { count: number; resetAt: number }>();
  private static readonly EMAIL_LIMIT = 3; // 3 requests per hour per email
  private static readonly IP_LIMIT = 10; // 10 requests per hour per IP
  private static readonly WINDOW_MS = 60 * 60 * 1000; // 1 hour

  /**
   * Check if email has exceeded rate limit
   */
  static checkEmailLimit(email: string): boolean {
    const now = Date.now();
    const entry = this.emailCache.get(email.toLowerCase());

    if (!entry || now > entry.resetAt) {
      this.emailCache.set(email.toLowerCase(), { count: 1, resetAt: now + this.WINDOW_MS });
      return true;
    }

    if (entry.count >= this.EMAIL_LIMIT) {
      return false;
    }

    entry.count++;
    return true;
  }

  /**
   * Check if IP has exceeded rate limit
   */
  static checkIPLimit(ip: string): boolean {
    const now = Date.now();
    const entry = this.ipCache.get(ip);

    if (!entry || now > entry.resetAt) {
      this.ipCache.set(ip, { count: 1, resetAt: now + this.WINDOW_MS });
      return true;
    }

    if (entry.count >= this.IP_LIMIT) {
      return false;
    }

    entry.count++;
    return true;
  }

  /**
   * Clean up expired entries (call periodically)
   */
  static cleanup(): void {
    const now = Date.now();
    
    const emailEntries = Array.from(this.emailCache.entries());
    for (const [key, value] of emailEntries) {
      if (now > value.resetAt) {
        this.emailCache.delete(key);
      }
    }

    const ipEntries = Array.from(this.ipCache.entries());
    for (const [key, value] of ipEntries) {
      if (now > value.resetAt) {
        this.ipCache.delete(key);
      }
    }
  }
}
