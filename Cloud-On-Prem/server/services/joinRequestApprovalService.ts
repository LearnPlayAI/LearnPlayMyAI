import { db } from "../db";
import { joinRequestApprovalTokens, joinRequests, users, organizations, userOrganizationRoles, userOrganizationAssignments, organizationUnits, organizationSubUnits } from "@shared/schema";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { randomBytes } from "crypto";
import { MailerSendService } from "./mailerSendService";
import { storage } from "../storage";
import { validateUnitSubjectAssignments } from "./joinRequestAssignmentValidationService";

const TOKEN_EXPIRY_DAYS = 7;

export class JoinRequestApprovalService {
  /**
   * Generate a secure approval token
   */
  private static generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Get all org admins for an organization
   */
  static async getOrganizationAdmins(organizationId: string): Promise<Array<{ userId: string; email: string; name: string }>> {
    const admins = await db
      .select({
        userId: userOrganizationRoles.userId,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        gamerName: users.gamerName,
      })
      .from(userOrganizationRoles)
      .innerJoin(users, eq(users.id, userOrganizationRoles.userId))
      .where(
        and(
          eq(userOrganizationRoles.organizationId, organizationId),
          eq(userOrganizationRoles.role, 'org_admin')
        )
      );

    return admins.map(admin => ({
      userId: admin.userId,
      email: admin.email,
      name: admin.firstName && admin.lastName 
        ? `${admin.firstName} ${admin.lastName}` 
        : admin.gamerName,
    }));
  }

  /**
   * Get teachers assigned to a specific unit/subunit within an organization
   */
  static async getUnitTeachers(organizationId: string, unitId?: string | null, subUnitId?: string | null): Promise<Array<{ userId: string; email: string; name: string }>> {
    // If no unit specified, return empty array
    if (!unitId) {
      return [];
    }

    // Find users who:
    // 1. Have role='teacher' in this organization (from userOrganizationRoles)
    // 2. Are assigned to this unit or subunit (from userOrganizationAssignments)
    const teachers = await db
      .select({
        userId: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        gamerName: users.gamerName,
      })
      .from(userOrganizationAssignments)
      .innerJoin(users, eq(users.id, userOrganizationAssignments.userId))
      .innerJoin(
        userOrganizationRoles,
        and(
          eq(userOrganizationRoles.userId, userOrganizationAssignments.userId),
          eq(userOrganizationRoles.organizationId, userOrganizationAssignments.organizationId)
        )
      )
      .where(
        and(
          eq(userOrganizationAssignments.organizationId, organizationId),
          eq(userOrganizationRoles.role, 'teacher'),
          // Match unit - if subUnitId is provided, match that; otherwise match unitId
          subUnitId 
            ? eq(userOrganizationAssignments.subUnitId, subUnitId)
            : eq(userOrganizationAssignments.unitId, unitId)
        )
      );

    return teachers.map(teacher => ({
      userId: teacher.userId,
      email: teacher.email,
      name: teacher.firstName && teacher.lastName 
        ? `${teacher.firstName} ${teacher.lastName}` 
        : teacher.gamerName,
    }));
  }

  /**
   * Create approval tokens for all org admins and send notification emails
   */
  static async notifyAdminsOfJoinRequest(joinRequestId: string): Promise<{ emailsSent: number; errors: string[] }> {
    const errors: string[] = [];
    let emailsSent = 0;

    try {
      // Get join request with related data
      const [joinRequest] = await db
        .select()
        .from(joinRequests)
        .where(eq(joinRequests.id, joinRequestId))
        .limit(1);

      if (!joinRequest) {
        errors.push(`Join request ${joinRequestId} not found`);
        return { emailsSent, errors };
      }

      // Get learner info
      const [learner] = await db
        .select()
        .from(users)
        .where(eq(users.id, joinRequest.userId))
        .limit(1);

      if (!learner) {
        errors.push(`Learner user not found`);
        return { emailsSent, errors };
      }

      // Get organization
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, joinRequest.organizationId))
        .limit(1);

      if (!org) {
        errors.push(`Organization not found`);
        return { emailsSent, errors };
      }

      // Get unit/subunit names if present
      let unitName: string | undefined;
      let subUnitName: string | undefined;

      if (joinRequest.requestedUnitId) {
        const [unit] = await db
          .select()
          .from(organizationUnits)
          .where(eq(organizationUnits.id, joinRequest.requestedUnitId))
          .limit(1);
        unitName = unit?.name;
      }

      if (joinRequest.requestedSubUnitId) {
        const [subUnit] = await db
          .select()
          .from(organizationSubUnits)
          .where(eq(organizationSubUnits.id, joinRequest.requestedSubUnitId))
          .limit(1);
        subUnitName = subUnit?.name;
      }

      // Get all org admins
      const admins = await this.getOrganizationAdmins(joinRequest.organizationId);

      // Get teachers of the selected unit/department
      const teachers = await this.getUnitTeachers(
        joinRequest.organizationId,
        joinRequest.requestedUnitId,
        joinRequest.requestedSubUnitId
      );

      // Merge and deduplicate recipients by userId
      const recipientMap = new Map<string, { userId: string; email: string; name: string; role: string }>();

      for (const admin of admins) {
        recipientMap.set(admin.userId, { ...admin, role: 'org_admin' });
      }

      for (const teacher of teachers) {
        // Don't overwrite if already added as admin (admin takes precedence)
        if (!recipientMap.has(teacher.userId)) {
          recipientMap.set(teacher.userId, { ...teacher, role: 'teacher' });
        }
      }

      const recipients = Array.from(recipientMap.values());

      // Handle edge cases
      if (recipients.length === 0) {
        console.error(`[JoinRequestApproval] No recipients found for organization ${joinRequest.organizationId}`);
        errors.push('No org admins or teachers found to notify');
        return { emailsSent, errors };
      }

      if (admins.length === 0) {
        console.warn(`[JoinRequestApproval] No org admins found for organization ${joinRequest.organizationId} - only notifying teachers`);
      }

      if (teachers.length === 0 && joinRequest.requestedUnitId) {
        console.warn(`[JoinRequestApproval] No teachers assigned to unit ${joinRequest.requestedUnitId} - only notifying org admins`);
      }

      console.log(`[JoinRequestApproval] Found ${admins.length} admins and ${teachers.length} teachers (${recipients.length} unique recipients)`);

      // Create token and send email for each recipient
      const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
      const learnerName = learner.firstName && learner.lastName
        ? `${learner.firstName} ${learner.lastName}`
        : learner.gamerName;

      for (const recipient of recipients) {
        try {
          // Generate unique token for this recipient
          const token = this.generateToken();

          // Store token in database
          await db.insert(joinRequestApprovalTokens).values({
            token,
            joinRequestId,
            adminUserId: recipient.userId,
            expiresAt,
          });

          // Send notification email
          const result = await MailerSendService.sendJoinRequestNotification({
            recipientEmail: recipient.email,
            recipientName: recipient.name,
            learnerName,
            learnerEmail: learner.email,
            organizationName: org.name,
            unitName,
            subUnitName,
            approvalToken: token,
            organizationId: joinRequest.organizationId,
          });

          if (result.success) {
            emailsSent++;
            console.log(`[JoinRequestApproval] Sent notification to ${recipient.role} ${recipient.email} for join request ${joinRequestId}`);
          } else {
            errors.push(`Failed to send email to ${recipient.email}: ${result.error}`);
          }
        } catch (err: any) {
          errors.push(`Error notifying ${recipient.role} ${recipient.email}: ${err.message}`);
        }
      }

      console.log(`[JoinRequestApproval] Notified ${emailsSent}/${recipients.length} recipients (${admins.length} admins, ${teachers.length} teachers) for join request ${joinRequestId}`);
      return { emailsSent, errors };

    } catch (error: any) {
      console.error('[JoinRequestApproval] Error notifying admins:', error);
      errors.push(error.message);
      return { emailsSent, errors };
    }
  }

  /**
   * Validate token and approve join request
   * Returns the approved join request or error info
   */
  static async approveViaToken(token: string): Promise<{
    success: boolean;
    message: string;
    joinRequest?: any;
    error?: string;
  }> {
    try {
      // Find the token
      const [tokenRecord] = await db
        .select()
        .from(joinRequestApprovalTokens)
        .where(eq(joinRequestApprovalTokens.token, token))
        .limit(1);

      if (!tokenRecord) {
        return { success: false, message: 'Invalid approval link', error: 'Token not found' };
      }

      // Check if already used
      if (tokenRecord.usedAt) {
        return { success: false, message: 'This approval link has already been used', error: 'Token already used' };
      }

      // Check if expired
      if (new Date() > tokenRecord.expiresAt) {
        return { success: false, message: 'This approval link has expired. Please log in to approve the request.', error: 'Token expired' };
      }

      // Get the join request
      const [joinRequest] = await db
        .select()
        .from(joinRequests)
        .where(eq(joinRequests.id, tokenRecord.joinRequestId))
        .limit(1);

      if (!joinRequest) {
        return { success: false, message: 'Join request not found', error: 'Join request not found' };
      }

      // Check if already processed
      if (joinRequest.status !== 'pending') {
        return { success: false, message: `This request has already been ${joinRequest.status}`, error: 'Already processed' };
      }

      await validateUnitSubjectAssignments({
        unitId: joinRequest.requestedUnitId,
        subjectIds: joinRequest.requestedSubjectIds || [],
      });

      // Approve the join request using the storage method
      // Use requested unit/subunit/team as assignments (admin can change later if needed)
      const updatedRequest = await storage.approveJoinRequest(
        joinRequest.id,
        tokenRecord.adminUserId,
        {
          unitId: joinRequest.requestedUnitId || undefined,
          subUnitId: joinRequest.requestedSubUnitId || undefined,
          teamId: joinRequest.requestedTeamId || undefined,
          subjectIds: joinRequest.requestedSubjectIds || [],
        },
        'email_link'
      );

      if (!updatedRequest) {
        return { success: false, message: 'Failed to approve request', error: 'Approval failed' };
      }

      // Mark token as used
      await db
        .update(joinRequestApprovalTokens)
        .set({ usedAt: new Date() })
        .where(eq(joinRequestApprovalTokens.id, tokenRecord.id));

      // Invalidate all other tokens for this join request
      await db
        .update(joinRequestApprovalTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(joinRequestApprovalTokens.joinRequestId, joinRequest.id),
            isNull(joinRequestApprovalTokens.usedAt)
          )
        );

      // Get admin info for audit
      const [admin] = await db
        .select()
        .from(users)
        .where(eq(users.id, tokenRecord.adminUserId))
        .limit(1);

      console.log(`[JoinRequestApproval] Join request ${joinRequest.id} approved via email token by admin ${admin?.email || tokenRecord.adminUserId}`);

      return {
        success: true,
        message: 'Join request approved successfully!',
        joinRequest: updatedRequest,
      };

    } catch (error: any) {
      console.error('[JoinRequestApproval] Error approving via token:', error);
      return { success: false, message: 'An error occurred while processing your request', error: error.message };
    }
  }
}
