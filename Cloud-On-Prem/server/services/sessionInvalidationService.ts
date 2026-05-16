/**
 * Session Invalidation Service
 * 
 * Manages session version bumping to invalidate cached session context
 * when user roles, organizations, or subscriptions change.
 */

import { db } from '../db';
import { users, userOrganizationRoles } from '@shared/schema';
import { eq, sql, inArray } from 'drizzle-orm';
import { trackSessionInvalidation } from '../monitoring/sessionHealthMonitor';

export class SessionInvalidationService {
  /**
   * Bump user's session version to invalidate all active sessions
   * Forces re-authentication and fresh session context population
   */
  static async invalidateUserSessions(userId: string, reason: string): Promise<void> {
    try {
      const [updatedUser] = await db
        .update(users)
        .set({
          sessionVersion: sql`${users.sessionVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

      if (updatedUser) {
        console.log(`[SessionInvalidation] User ${userId} session invalidated. New version: ${updatedUser.sessionVersion}. Reason: ${reason}`);
        trackSessionInvalidation(userId, reason, 'user', 1);
      }
    } catch (error) {
      console.error(`[SessionInvalidation] Failed to invalidate sessions for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Bulk invalidate sessions for multiple users
   * Useful when organization-wide changes occur
   */
  static async invalidateMultipleUserSessions(userIds: string[], reason: string): Promise<void> {
    try {
      for (const userId of userIds) {
        await this.invalidateUserSessions(userId, reason);
      }
      console.log(`[SessionInvalidation] Invalidated sessions for ${userIds.length} users. Reason: ${reason}`);
      trackSessionInvalidation(userIds[0] || 'bulk', reason, 'bulk', userIds.length);
    } catch (error) {
      console.error('[SessionInvalidation] Failed to invalidate multiple user sessions:', error);
      throw error;
    }
  }

  /**
   * Invalidate sessions for all users in an organization
   * Used when organization-wide changes affect user permissions
   */
  static async invalidateOrganizationSessions(organizationId: string, reason: string): Promise<void> {
    try {
      // Find all users in this organization
      const orgUsers = await db
        .select({ userId: userOrganizationRoles.userId })
        .from(userOrganizationRoles)
        .where(eq(userOrganizationRoles.organizationId, organizationId));

      const userIds = Array.from(new Set(orgUsers.map(u => u.userId)));

      if (userIds.length === 0) {
        console.log(`[SessionInvalidation] No users found in organization ${organizationId}`);
        return;
      }

      // Bulk update session versions
      await db
        .update(users)
        .set({
          sessionVersion: sql`${users.sessionVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(inArray(users.id, userIds));

      console.log(`[SessionInvalidation] Invalidated sessions for ${userIds.length} users in organization ${organizationId}. Reason: ${reason}`);
      trackSessionInvalidation(organizationId, reason, 'organization', userIds.length);
    } catch (error) {
      console.error(`[SessionInvalidation] Failed to invalidate organization sessions for ${organizationId}:`, error);
      throw error;
    }
  }

  /**
   * Check if session version matches user's current version
   * Returns true if session is valid, false if stale
   */
  static async isSessionValid(userId: string, sessionVersion: number): Promise<boolean> {
    try {
      const [user] = await db
        .select({ sessionVersion: users.sessionVersion })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return false;
      }

      return user.sessionVersion === sessionVersion;
    } catch (error) {
      console.error('[SessionInvalidation] Failed to validate session version:', error);
      return false;
    }
  }
}
