import crypto from 'crypto';
import { db } from '../db';
import { users, emailLogs } from '@shared/schema';
import { eq, and, sql, gte, inArray } from 'drizzle-orm';

export interface TokenGenerationResult {
  token: string;
  hashedToken: string;
  expiresAt: Date;
}

export interface TokenVerificationResult {
  valid: boolean;
  userId?: string;
  email?: string;
  error?: string;
}

export interface VerificationSendDecision {
  shouldSend: boolean;
  reason: 'send_required' | 'already_verified' | 'recent_email_with_valid_token';
}

export class EmailVerificationService {
  private static readonly TOKEN_EXPIRY_HOURS = 24;
  private static readonly TOKEN_LENGTH = 32;

  /**
   * Generate a secure email verification token
   * Returns both the plain token (to send to user) and hashed token (to store in DB)
   */
  static generateVerificationToken(): TokenGenerationResult {
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
   * Hash a token using HMAC-SHA256
   * SECURITY: Uses dedicated secret to prevent compromise if other secrets are leaked
   */
  static hashToken(token: string): string {
    const isProduction = process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT === '1' || process.env.COOKIE_SECURE === 'true';
    
    // SECURITY: Require secret in production - fail closed
    if (!process.env.EMAIL_VERIFICATION_SECRET && !process.env.SESSION_SECRET) {
      if (isProduction) {
        throw new Error('[SECURITY] EMAIL_VERIFICATION_SECRET or SESSION_SECRET required in production');
      }
    }
    
    const secret = process.env.EMAIL_VERIFICATION_SECRET || process.env.SESSION_SECRET || 'dev-only-insecure-secret';
    
    if (!process.env.EMAIL_VERIFICATION_SECRET && process.env.NODE_ENV !== 'test') {
      console.warn('[EmailVerificationService] EMAIL_VERIFICATION_SECRET not set - using SESSION_SECRET fallback.');
    }
    
    return crypto
      .createHmac('sha256', secret)
      .update(token)
      .digest('hex');
  }

  /**
   * Store verification token in database for a user
   */
  static async storeVerificationToken(
    userId: string,
    hashedToken: string,
    expiresAt: Date
  ): Promise<boolean> {
    try {
      await db
        .update(users)
        .set({
          emailVerificationToken: hashedToken,
          emailVerificationExpiry: expiresAt,
        })
        .where(eq(users.id, userId));

      console.log(`[EmailVerificationService] Stored verification token for user ${userId}`);
      return true;
    } catch (error) {
      console.error('[EmailVerificationService] Failed to store token:', error);
      return false;
    }
  }

  /**
   * Verify an email verification token
   * Returns user info if valid, or error message if invalid
   */
  static async verifyToken(token: string): Promise<TokenVerificationResult> {
    try {
      const hashedToken = this.hashToken(token);
      const now = new Date();

      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          emailVerificationToken: users.emailVerificationToken,
          emailVerificationExpiry: users.emailVerificationExpiry,
          emailVerified: users.emailVerified,
        })
        .from(users)
        .where(
          and(
            eq(users.emailVerificationToken, hashedToken),
            sql`${users.emailVerificationExpiry} > ${now}`
          )
        )
        .limit(1);

      if (!user) {
        return {
          valid: false,
          error: 'Invalid or expired verification token',
        };
      }

      if (user.emailVerified) {
        return {
          valid: false,
          error: 'Email has already been verified',
        };
      }

      return {
        valid: true,
        userId: user.id,
        email: user.email,
      };
    } catch (error) {
      console.error('[EmailVerificationService] Token verification error:', error);
      return {
        valid: false,
        error: 'Token verification failed',
      };
    }
  }

  /**
   * Mark email as verified and clear the token
   * Returns true only if the update actually affected a row
   */
  static async markEmailAsVerified(userId: string): Promise<boolean> {
    try {
      const result = await db
        .update(users)
        .set({
          emailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpiry: null,
        })
        .where(eq(users.id, userId))
        .returning({ id: users.id });

      if (!result || result.length === 0) {
        console.error(`[EmailVerificationService] No user found with id ${userId} to verify`);
        return false;
      }

      console.log(`[EmailVerificationService] Email verified for user ${userId}`);
      return true;
    } catch (error) {
      console.error('[EmailVerificationService] Failed to mark email as verified:', error);
      return false;
    }
  }

  /**
   * Check if a user's email is verified
   */
  static async isEmailVerified(userId: string): Promise<boolean> {
    try {
      const [user] = await db
        .select({ emailVerified: users.emailVerified })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      return user?.emailVerified === true;
    } catch (error) {
      console.error('[EmailVerificationService] Failed to check email verification:', error);
      return false;
    }
  }

  /**
   * Generate and store a new verification token for a user
   * Returns the plain token to be sent in the email
   */
  static async createVerificationToken(userId: string): Promise<string | null> {
    const { token, hashedToken, expiresAt } = this.generateVerificationToken();
    
    const stored = await this.storeVerificationToken(userId, hashedToken, expiresAt);
    if (!stored) {
      return null;
    }

    return token;
  }

  /**
   * Checks whether a verification email was sent recently to this recipient.
   * This prevents unnecessary duplicate API calls when the current token is still valid.
   */
  static async hasRecentVerificationEmail(recipientEmail: string, withinHours = 24): Promise<boolean> {
    try {
      const windowStart = new Date(Date.now() - withinHours * 60 * 60 * 1000);
      const rows = await db
        .select({ id: emailLogs.id })
        .from(emailLogs)
        .where(
          and(
            eq(emailLogs.recipientEmail, recipientEmail),
            eq(emailLogs.templateType, 'email_verification'),
            inArray(emailLogs.status, ['queued', 'sent']),
            gte(emailLogs.createdAt, windowStart),
          ),
        )
        .limit(1);
      return rows.length > 0;
    } catch (error) {
      console.error('[EmailVerificationService] Failed checking recent verification email logs:', error);
      // Fail-open so email flow remains available even if log lookup fails.
      return false;
    }
  }

  /**
   * Decide if a new verification email should be sent for a user.
   * Skip sending when:
   * - user is already verified, or
   * - user has a valid token and a recent verification email was already sent.
   */
  static async shouldSendVerificationEmail(userId: string, recipientEmail: string): Promise<VerificationSendDecision> {
    try {
      const now = new Date();
      const [user] = await db
        .select({
          emailVerified: users.emailVerified,
          emailVerificationToken: users.emailVerificationToken,
          emailVerificationExpiry: users.emailVerificationExpiry,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return { shouldSend: true, reason: 'send_required' };
      }

      if (user.emailVerified) {
        return { shouldSend: false, reason: 'already_verified' };
      }

      const hasValidToken =
        !!user.emailVerificationToken &&
        !!user.emailVerificationExpiry &&
        user.emailVerificationExpiry > now;

      if (hasValidToken) {
        const alreadySentRecently = await this.hasRecentVerificationEmail(recipientEmail, this.TOKEN_EXPIRY_HOURS);
        if (alreadySentRecently) {
          return { shouldSend: false, reason: 'recent_email_with_valid_token' };
        }
      }

      return { shouldSend: true, reason: 'send_required' };
    } catch (error) {
      console.error('[EmailVerificationService] Failed deciding verification email send policy:', error);
      // Fail-open on policy errors to avoid blocking verification flows.
      return { shouldSend: true, reason: 'send_required' };
    }
  }
}
