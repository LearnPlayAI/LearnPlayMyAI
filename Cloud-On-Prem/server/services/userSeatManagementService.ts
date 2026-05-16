import { db } from '../db';
import { eq, and, inArray, not, sql } from 'drizzle-orm';
import {
  users,
  userOrganizationRoles,
  organizations,
  businessPackages,
  organizationPackageAssignments,
  packageChangeEvents,
} from '@shared/schema';
import { packageEmailService } from './packageEmailService';
import { businessPackageService } from './businessPackageService';

interface SeatUtilization {
  learners: { current: number; max: number; remaining: number };
  teachers: { current: number; max: number; remaining: number };
  orgAdmins: { current: number; max: number; remaining: number };
}

interface DisableUserResult {
  userId: string;
  email: string;
  name: string;
  role: string;
  success: boolean;
  error?: string;
}

interface UserBasicInfo {
  id: string;
  email: string;
  name: string;
}

export class UserSeatManagementService {
  async getSeatUtilization(organizationId: string): Promise<SeatUtilization | null> {
    try {
      const [assignment] = await db
        .select()
        .from(organizationPackageAssignments)
        .where(eq(organizationPackageAssignments.organizationId, organizationId))
        .limit(1);

      if (!assignment) {
        console.log(`[UserSeatManagement] No package assignment found for org ${organizationId}`);
        return null;
      }

      const pkg = await businessPackageService.getPackageById(assignment.packageId);
      if (!pkg) {
        console.error(`[UserSeatManagement] Package ${assignment.packageId} not found`);
        return null;
      }

      const userCounts = await businessPackageService.getOrganizationUserCounts(organizationId);

      return {
        learners: {
          current: userCounts.learners,
          max: pkg.maxLearners,
          remaining: Math.max(0, pkg.maxLearners - userCounts.learners),
        },
        teachers: {
          current: userCounts.teachers,
          max: pkg.maxTeachers,
          remaining: Math.max(0, pkg.maxTeachers - userCounts.teachers),
        },
        orgAdmins: {
          current: userCounts.orgAdmins,
          max: pkg.maxOrgAdmins,
          remaining: Math.max(0, pkg.maxOrgAdmins - userCounts.orgAdmins),
        },
      };
    } catch (error: any) {
      console.error('[UserSeatManagement] Error getting seat utilization:', error.message);
      throw error;
    }
  }

  async canAddUser(organizationId: string, role: string): Promise<{
    canAdd: boolean;
    currentCount: number;
    maxAllowed: number;
    message: string;
  }> {
    try {
      const utilization = await this.getSeatUtilization(organizationId);
      
      if (!utilization) {
        return {
          canAdd: false,
          currentCount: 0,
          maxAllowed: 0,
          message: 'No package assignment found for organization',
        };
      }

      const normalizedRole = this.normalizeRole(role);
      let seatInfo: { current: number; max: number; remaining: number };
      let roleLabel: string;

      switch (normalizedRole) {
        case 'learner':
          seatInfo = utilization.learners;
          roleLabel = 'learner';
          break;
        case 'teacher':
          seatInfo = utilization.teachers;
          roleLabel = 'teacher';
          break;
        case 'org_admin':
          seatInfo = utilization.orgAdmins;
          roleLabel = 'organization admin';
          break;
        default:
          return {
            canAdd: false,
            currentCount: 0,
            maxAllowed: 0,
            message: `Unknown role: ${role}`,
          };
      }

      const canAdd = seatInfo.remaining > 0;

      return {
        canAdd,
        currentCount: seatInfo.current,
        maxAllowed: seatInfo.max,
        message: canAdd
          ? `Can add ${roleLabel}. ${seatInfo.remaining} seat(s) remaining.`
          : `Cannot add ${roleLabel}. All ${seatInfo.max} seat(s) are occupied.`,
      };
    } catch (error: any) {
      console.error('[UserSeatManagement] Error checking if can add user:', error.message);
      throw error;
    }
  }

  async disableUsers(
    organizationId: string,
    userIds: string[],
    reason: string,
    disabledBy: string
  ): Promise<DisableUserResult[]> {
    const results: DisableUserResult[] = [];
    
    if (userIds.length === 0) {
      return results;
    }

    try {
      const [org] = await db
        .select({ name: organizations.name, billingEmail: organizations.billingEmail })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);

      const orgName = org?.name || 'Your Organization';
      const orgAdminEmail = org?.billingEmail || 'admin@organization.com';

      const activeOrgAdmins = await db
        .select({ userId: userOrganizationRoles.userId })
        .from(userOrganizationRoles)
        .innerJoin(users, eq(userOrganizationRoles.userId, users.id))
        .where(
          and(
            eq(userOrganizationRoles.organizationId, organizationId),
            eq(userOrganizationRoles.role, 'org_admin'),
            eq(users.isLocked, false)
          )
        );

      const activeOrgAdminIds = new Set(activeOrgAdmins.map(a => a.userId));
      const orgAdminsBeingDisabled = userIds.filter(id => activeOrgAdminIds.has(id));
      
      if (orgAdminsBeingDisabled.length >= activeOrgAdminIds.size) {
        return userIds.map(userId => ({
          userId,
          email: '',
          name: '',
          role: '',
          success: false,
          error: 'Cannot disable all organization admins. At least one org admin must remain active.',
        }));
      }

      const usersToDisable = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          gamerName: users.gamerName,
          role: userOrganizationRoles.role,
        })
        .from(users)
        .innerJoin(userOrganizationRoles, eq(users.id, userOrganizationRoles.userId))
        .where(
          and(
            inArray(users.id, userIds),
            eq(userOrganizationRoles.organizationId, organizationId)
          )
        );

      for (const user of usersToDisable) {
        try {
          await db
            .update(users)
            .set({
              isLocked: true,
              updatedAt: new Date(),
            })
            .where(eq(users.id, user.id));

          const userName = user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`
            : user.gamerName || 'User';

          try {
            await packageEmailService.sendUserDisabledNotification(
              user.email,
              userName,
              orgName,
              orgAdminEmail
            );
          } catch (emailError: any) {
            console.warn(`[UserSeatManagement] Failed to send email to ${user.email}:`, emailError.message);
          }

          results.push({
            userId: user.id,
            email: user.email,
            name: userName,
            role: user.role,
            success: true,
          });
        } catch (userError: any) {
          results.push({
            userId: user.id,
            email: user.email,
            name: user.firstName && user.lastName 
              ? `${user.firstName} ${user.lastName}` 
              : user.gamerName || 'User',
            role: user.role,
            success: false,
            error: userError.message,
          });
        }
      }

      await this.logUserDisableEvent(organizationId, userIds, reason, disabledBy);

      console.log(`[UserSeatManagement] Disabled ${results.filter(r => r.success).length} users in org ${organizationId}`);
      return results;
    } catch (error: any) {
      console.error('[UserSeatManagement] Error disabling users:', error.message);
      throw error;
    }
  }

  async enableUsers(
    organizationId: string,
    userIds: string[],
    enabledBy: string
  ): Promise<Array<{ userId: string; success: boolean; error?: string }>> {
    const results: Array<{ userId: string; success: boolean; error?: string }> = [];
    
    if (userIds.length === 0) {
      return results;
    }

    try {
      const utilization = await this.getSeatUtilization(organizationId);
      if (!utilization) {
        return userIds.map(userId => ({
          userId,
          success: false,
          error: 'No package assignment found for organization',
        }));
      }

      const usersToEnable = await db
        .select({
          id: users.id,
          role: userOrganizationRoles.role,
        })
        .from(users)
        .innerJoin(userOrganizationRoles, eq(users.id, userOrganizationRoles.userId))
        .where(
          and(
            inArray(users.id, userIds),
            eq(userOrganizationRoles.organizationId, organizationId),
            eq(users.isLocked, true)
          )
        );

      const countsByRole = { learner: 0, teacher: 0, org_admin: 0 };
      for (const user of usersToEnable) {
        const normalizedRole = this.normalizeRole(user.role);
        if (normalizedRole in countsByRole) {
          countsByRole[normalizedRole as keyof typeof countsByRole]++;
        }
      }

      if (countsByRole.learner > utilization.learners.remaining) {
        return userIds.map(userId => ({
          userId,
          success: false,
          error: `Cannot enable ${countsByRole.learner} learners. Only ${utilization.learners.remaining} seats available.`,
        }));
      }
      if (countsByRole.teacher > utilization.teachers.remaining) {
        return userIds.map(userId => ({
          userId,
          success: false,
          error: `Cannot enable ${countsByRole.teacher} teachers. Only ${utilization.teachers.remaining} seats available.`,
        }));
      }
      if (countsByRole.org_admin > utilization.orgAdmins.remaining) {
        return userIds.map(userId => ({
          userId,
          success: false,
          error: `Cannot enable ${countsByRole.org_admin} org admins. Only ${utilization.orgAdmins.remaining} seats available.`,
        }));
      }

      for (const user of usersToEnable) {
        try {
          await db
            .update(users)
            .set({
              isLocked: false,
              updatedAt: new Date(),
            })
            .where(eq(users.id, user.id));

          results.push({
            userId: user.id,
            success: true,
          });
        } catch (userError: any) {
          results.push({
            userId: user.id,
            success: false,
            error: userError.message,
          });
        }
      }

      console.log(`[UserSeatManagement] Enabled ${results.filter(r => r.success).length} users in org ${organizationId}`);
      return results;
    } catch (error: any) {
      console.error('[UserSeatManagement] Error enabling users:', error.message);
      throw error;
    }
  }

  async getDisabledUsers(organizationId: string): Promise<Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    disabledAt: Date;
    disabledReason: string;
  }>> {
    try {
      const disabledUsers = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          gamerName: users.gamerName,
          role: userOrganizationRoles.role,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .innerJoin(userOrganizationRoles, eq(users.id, userOrganizationRoles.userId))
        .where(
          and(
            eq(userOrganizationRoles.organizationId, organizationId),
            eq(users.isLocked, true)
          )
        );

      return disabledUsers.map(user => ({
        id: user.id,
        email: user.email,
        name: user.firstName && user.lastName
          ? `${user.firstName} ${user.lastName}`
          : user.gamerName || 'Unknown User',
        role: user.role,
        disabledAt: user.updatedAt || new Date(),
        disabledReason: 'Account disabled due to package change',
      }));
    } catch (error: any) {
      console.error('[UserSeatManagement] Error getting disabled users:', error.message);
      throw error;
    }
  }

  async getUsersToDisableOnDowngrade(
    organizationId: string,
    newPackageId: string
  ): Promise<{
    learnersToDisable: number;
    teachersToDisable: number;
    orgAdminsToDisable: number;
    learners: UserBasicInfo[];
    teachers: UserBasicInfo[];
    orgAdmins: UserBasicInfo[];
  }> {
    try {
      const pkg = await businessPackageService.getPackageById(newPackageId);
      if (!pkg) {
        throw new Error(`Package ${newPackageId} not found`);
      }

      const userCounts = await businessPackageService.getOrganizationUserCounts(organizationId);

      const learnersToDisable = Math.max(0, userCounts.learners - pkg.maxLearners);
      const teachersToDisable = Math.max(0, userCounts.teachers - pkg.maxTeachers);
      const orgAdminsToDisable = Math.max(0, userCounts.orgAdmins - pkg.maxOrgAdmins);

      const [learners, teachers, orgAdmins] = await Promise.all([
        this.getActiveUsersByRole(organizationId, 'learner'),
        this.getActiveUsersByRole(organizationId, 'teacher'),
        this.getActiveUsersByRole(organizationId, 'org_admin'),
      ]);

      return {
        learnersToDisable,
        teachersToDisable,
        orgAdminsToDisable,
        learners,
        teachers,
        orgAdmins,
      };
    } catch (error: any) {
      console.error('[UserSeatManagement] Error getting users to disable on downgrade:', error.message);
      throw error;
    }
  }

  async validateDowngradeSelections(
    organizationId: string,
    newPackageId: string,
    keepUserIds: string[]
  ): Promise<{
    valid: boolean;
    issues: string[];
    learnerCount: number;
    teacherCount: number;
    orgAdminCount: number;
  }> {
    try {
      const pkg = await businessPackageService.getPackageById(newPackageId);
      if (!pkg) {
        return {
          valid: false,
          issues: ['Package not found'],
          learnerCount: 0,
          teacherCount: 0,
          orgAdminCount: 0,
        };
      }

      if (keepUserIds.length === 0) {
        return {
          valid: false,
          issues: ['At least one user must be selected to keep'],
          learnerCount: 0,
          teacherCount: 0,
          orgAdminCount: 0,
        };
      }

      const keptUsers = await db
        .select({
          id: users.id,
          role: userOrganizationRoles.role,
        })
        .from(users)
        .innerJoin(userOrganizationRoles, eq(users.id, userOrganizationRoles.userId))
        .where(
          and(
            inArray(users.id, keepUserIds),
            eq(userOrganizationRoles.organizationId, organizationId),
            eq(users.isLocked, false)
          )
        );

      let learnerCount = 0;
      let teacherCount = 0;
      let orgAdminCount = 0;

      for (const user of keptUsers) {
        const normalizedRole = this.normalizeRole(user.role);
        if (normalizedRole === 'learner') learnerCount++;
        else if (normalizedRole === 'teacher') teacherCount++;
        else if (normalizedRole === 'org_admin') orgAdminCount++;
      }

      const issues: string[] = [];

      if (orgAdminCount === 0) {
        issues.push('At least one organization admin must be kept active');
      }

      if (learnerCount > pkg.maxLearners) {
        issues.push(`Too many learners selected (${learnerCount}). Maximum allowed: ${pkg.maxLearners}`);
      }

      if (teacherCount > pkg.maxTeachers) {
        issues.push(`Too many teachers selected (${teacherCount}). Maximum allowed: ${pkg.maxTeachers}`);
      }

      if (orgAdminCount > pkg.maxOrgAdmins) {
        issues.push(`Too many org admins selected (${orgAdminCount}). Maximum allowed: ${pkg.maxOrgAdmins}`);
      }

      return {
        valid: issues.length === 0,
        issues,
        learnerCount,
        teacherCount,
        orgAdminCount,
      };
    } catch (error: any) {
      console.error('[UserSeatManagement] Error validating downgrade selections:', error.message);
      throw error;
    }
  }

  async executeDowngradeUserChanges(
    organizationId: string,
    keepUserIds: string[],
    disabledBy: string
  ): Promise<{
    disabled: DisableUserResult[];
    emailsSent: number;
  }> {
    try {
      const allActiveUsers = await db
        .select({ id: users.id })
        .from(users)
        .innerJoin(userOrganizationRoles, eq(users.id, userOrganizationRoles.userId))
        .where(
          and(
            eq(userOrganizationRoles.organizationId, organizationId),
            eq(users.isLocked, false)
          )
        );

      const keepSet = new Set(keepUserIds);
      const usersToDisable = allActiveUsers
        .filter(user => !keepSet.has(user.id))
        .map(user => user.id);

      if (usersToDisable.length === 0) {
        return {
          disabled: [],
          emailsSent: 0,
        };
      }

      const disabled = await this.disableUsers(
        organizationId,
        usersToDisable,
        'Package downgrade - user selection',
        disabledBy
      );

      const emailsSent = disabled.filter(r => r.success).length;

      return {
        disabled,
        emailsSent,
      };
    } catch (error: any) {
      console.error('[UserSeatManagement] Error executing downgrade user changes:', error.message);
      throw error;
    }
  }

  private normalizeRole(role: string): string {
    const roleMap: Record<string, string> = {
      'learner': 'learner',
      'student': 'learner',
      'teacher': 'teacher',
      'instructor': 'teacher',
      'org_admin': 'org_admin',
      'admin': 'org_admin',
    };
    return roleMap[role.toLowerCase()] || role.toLowerCase();
  }

  private async getActiveUsersByRole(organizationId: string, role: string): Promise<UserBasicInfo[]> {
    const roleVariants = this.getRoleVariants(role);
    
    const activeUsers = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        gamerName: users.gamerName,
      })
      .from(users)
      .innerJoin(userOrganizationRoles, eq(users.id, userOrganizationRoles.userId))
      .where(
        and(
          eq(userOrganizationRoles.organizationId, organizationId),
          inArray(userOrganizationRoles.role, roleVariants),
          eq(users.isLocked, false)
        )
      );

    return activeUsers.map(user => ({
      id: user.id,
      email: user.email,
      name: user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`
        : user.gamerName || 'Unknown User',
    }));
  }

  private getRoleVariants(role: string): string[] {
    switch (role) {
      case 'learner':
        return ['learner', 'student'];
      case 'teacher':
        return ['teacher', 'instructor'];
      case 'org_admin':
        return ['org_admin', 'admin'];
      default:
        return [role];
    }
  }

  private async logUserDisableEvent(
    organizationId: string,
    userIds: string[],
    reason: string,
    performedBy: string
  ): Promise<void> {
    try {
      await db.insert(packageChangeEvents).values({
        organizationId,
        changeType: 'org_downgraded',
        previousValues: null,
        newValues: {
          action: 'users_disabled',
          userIds,
          reason,
          timestamp: new Date().toISOString(),
        },
        changedBy: performedBy,
      });
    } catch (error: any) {
      console.warn('[UserSeatManagement] Failed to log user disable event:', error.message);
    }
  }

  async checkUpgradeReenableOpportunity(
    organizationId: string,
    newPackageId: string
  ): Promise<{
    canReenableUsers: boolean;
    disabledUsers: Array<{ id: string; email: string; name: string; role: string }>;
    newLimits: { maxLearners: number; maxTeachers: number; maxOrgAdmins: number };
  }> {
    try {
      const newPkg = await businessPackageService.getPackageById(newPackageId);
      if (!newPkg) {
        throw new Error(`Package ${newPackageId} not found`);
      }

      const disabledUsers = await this.getDisabledUsers(organizationId);

      const newLimits = {
        maxLearners: newPkg.maxLearners,
        maxTeachers: newPkg.maxTeachers,
        maxOrgAdmins: newPkg.maxOrgAdmins,
      };

      const canReenableUsers = disabledUsers.length > 0;

      return {
        canReenableUsers,
        disabledUsers: disabledUsers.map(u => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
        })),
        newLimits,
      };
    } catch (error: any) {
      console.error('[UserSeatManagement] Error checking upgrade reenable opportunity:', error.message);
      throw error;
    }
  }

  async reenableUsersOnUpgrade(
    organizationId: string,
    userIds: string[],
    enabledBy: string
  ): Promise<{
    enabled: Array<{ userId: string; email: string; success: boolean; error?: string }>;
    emailsSent: number;
  }> {
    const results: Array<{ userId: string; email: string; success: boolean; error?: string }> = [];
    let emailsSent = 0;

    if (userIds.length === 0) {
      return { enabled: results, emailsSent: 0 };
    }

    try {
      const utilization = await this.getSeatUtilization(organizationId);
      if (!utilization) {
        return {
          enabled: userIds.map(userId => ({
            userId,
            email: '',
            success: false,
            error: 'No package assignment found for organization',
          })),
          emailsSent: 0,
        };
      }

      const [org] = await db
        .select({ name: organizations.name, billingEmail: organizations.billingEmail })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);

      const orgName = org?.name || 'Your Organization';

      const usersToEnable = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          gamerName: users.gamerName,
          role: userOrganizationRoles.role,
        })
        .from(users)
        .innerJoin(userOrganizationRoles, eq(users.id, userOrganizationRoles.userId))
        .where(
          and(
            inArray(users.id, userIds),
            eq(userOrganizationRoles.organizationId, organizationId),
            eq(users.isLocked, true)
          )
        );

      const countsByRole = { learner: 0, teacher: 0, org_admin: 0 };
      for (const user of usersToEnable) {
        const normalizedRole = this.normalizeRole(user.role);
        if (normalizedRole in countsByRole) {
          countsByRole[normalizedRole as keyof typeof countsByRole]++;
        }
      }

      if (countsByRole.learner > utilization.learners.remaining) {
        return {
          enabled: userIds.map(userId => ({
            userId,
            email: '',
            success: false,
            error: `Cannot enable ${countsByRole.learner} learners. Only ${utilization.learners.remaining} seats available.`,
          })),
          emailsSent: 0,
        };
      }
      if (countsByRole.teacher > utilization.teachers.remaining) {
        return {
          enabled: userIds.map(userId => ({
            userId,
            email: '',
            success: false,
            error: `Cannot enable ${countsByRole.teacher} teachers. Only ${utilization.teachers.remaining} seats available.`,
          })),
          emailsSent: 0,
        };
      }
      if (countsByRole.org_admin > utilization.orgAdmins.remaining) {
        return {
          enabled: userIds.map(userId => ({
            userId,
            email: '',
            success: false,
            error: `Cannot enable ${countsByRole.org_admin} org admins. Only ${utilization.orgAdmins.remaining} seats available.`,
          })),
          emailsSent: 0,
        };
      }

      for (const user of usersToEnable) {
        try {
          await db
            .update(users)
            .set({
              isLocked: false,
              updatedAt: new Date(),
            })
            .where(eq(users.id, user.id));

          const userName = user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`
            : user.gamerName || 'User';

          try {
            await packageEmailService.sendUserReenabledNotification(
              user.email,
              userName,
              orgName
            );
            emailsSent++;
          } catch (emailError: any) {
            console.warn(`[UserSeatManagement] Failed to send welcome back email to ${user.email}:`, emailError.message);
          }

          results.push({
            userId: user.id,
            email: user.email,
            success: true,
          });
        } catch (userError: any) {
          results.push({
            userId: user.id,
            email: user.email,
            success: false,
            error: userError.message,
          });
        }
      }

      await this.logUserReenableEvent(organizationId, userIds, 'Package upgrade', enabledBy);

      console.log(`[UserSeatManagement] Re-enabled ${results.filter(r => r.success).length} users in org ${organizationId}`);
      return { enabled: results, emailsSent };
    } catch (error: any) {
      console.error('[UserSeatManagement] Error re-enabling users on upgrade:', error.message);
      throw error;
    }
  }

  private async logUserReenableEvent(
    organizationId: string,
    userIds: string[],
    reason: string,
    performedBy: string
  ): Promise<void> {
    try {
      await db.insert(packageChangeEvents).values({
        organizationId,
        changeType: 'org_upgraded',
        previousValues: null,
        newValues: {
          action: 'users_reenabled',
          userIds,
          reason,
          timestamp: new Date().toISOString(),
        },
        changedBy: performedBy,
      });
    } catch (error: any) {
      console.warn('[UserSeatManagement] Failed to log user reenable event:', error.message);
    }
  }
}

export const userSeatManagementService = new UserSeatManagementService();
