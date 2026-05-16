/**
 * Auth Routes Module
 * 
 * Contains all /api/auth/* routes and /api/internal/session-* routes for authentication,
 * registration, password reset, email verification, and session management.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { 
  registerUserSchema, 
  loginUserSchema,
  users,
  userOrganizationRoles,
  organizations,
  onpremLicenseState
} from '@shared/schema';
import { 
  storage,
  isAdmin,
  isSuperAdmin,
  withSessionAuthMiddleware,
  withOrgContext,
  type RequestWithOrgContext,
} from './sharedResources';
import { PasswordResetService, PasswordResetRateLimiter } from '../services/passwordResetService';
import { EmailVerificationService } from '../services/emailVerificationService';
import { SessionContextService } from '../services/sessionContextService';
import { MailerSendService } from '../services/mailerSendService';
import { CreditService } from '../services/creditService';
import { JoinRequestApprovalService } from '../services/joinRequestApprovalService';
import { gamificationService } from '../gamificationService';
import { sendError, ErrorCode } from '../utils/errorResponses';
import { isFeatureEnabled, isOnPremMode } from '../featureFlags';
import { 
  checkConcurrentUserLimit, 
  trackUserLogin, 
  trackUserLogout 
} from '../usageLimitMiddleware';
import { 
  getSessionHealthMetrics, 
  resetSessionHealthMetrics, 
  getSessionHealthSummary 
} from '../monitoring/sessionHealthMonitor';
import { getBaseUrl } from '../config/base-url';
import { OnpremLicensePolicyError } from '../services/onpremLicensePolicy';
import { resolveEffectiveLocale } from '../utils/effectiveLocale';
import { PublicOrganizationService, getPublicLearnerRole } from '../services/publicOrganizationService';

const router = Router();

/**
 * Mask email address for safe logging (PII protection)
 * Transforms "user@example.com" to "u***@e***.com"
 */
function maskEmail(email: string): string {
  if (!email || typeof email !== 'string') return '[INVALID_EMAIL]';
  const parts = email.split('@');
  if (parts.length !== 2) return '[INVALID_EMAIL]';
  const [local, domain] = parts;
  const domainParts = domain.split('.');
  const maskedLocal = local.length > 1 ? local[0] + '***' : '***';
  const maskedDomain = domainParts[0].length > 1 
    ? domainParts[0][0] + '***' + '.' + domainParts.slice(1).join('.')
    : '***.' + domainParts.slice(1).join('.');
  return `${maskedLocal}@${maskedDomain}`;
}

/**
 * Get terminology labels based on organization type
 * Returns the appropriate labels for unit, subUnit, and team hierarchy
 */
function getTerminologyForOrgType(orgType: string): { unit: string; subUnit: string; team: string } {
  switch (orgType) {
    case 'business':
      return { unit: 'Department', subUnit: 'Unit', team: 'Team' };
    case 'education':
      return { unit: 'Grade', subUnit: 'Class', team: 'Section' };
    case 'elearning':
      return { unit: 'Course', subUnit: 'Module', team: 'Cohort' };
    default:
      return { unit: 'Unit', subUnit: 'SubUnit', team: 'Team' };
  }
}

interface OnpremRegistrationCheck {
  allowed: boolean;
  errorMessage?: string;
}

interface OnpremLoginAccessCheck {
  allowed: boolean;
  lockActive: boolean;
  errorMessage?: string;
}

async function checkOnpremRegistration(options: { hasOrganizationCode: boolean }): Promise<OnpremRegistrationCheck> {
  if (process.env.ONPREM_MODE !== 'true') {
    return { allowed: true };
  }

  const { getOnpremRolePolicy } = await import('../services/onpremLicensePolicy');
  const policy = await getOnpremRolePolicy();
  if (!policy.learnerRolesAllowed) {
    if ((policy.systemType === 'development' || policy.systemType === 'qa') && options.hasOrganizationCode) {
      return { allowed: true };
    }
    if (policy.systemType === 'development' || policy.systemType === 'qa') {
      return {
        allowed: false,
        errorMessage: `Learner registration is disabled on on-prem ${policy.systemType.toUpperCase()} systems, including when licensed.`,
      };
    }
    return {
      allowed: false,
      errorMessage: 'Learner registration is disabled on unlicensed on-prem systems. Install a valid license to enable learner users.',
    };
  }
  return { allowed: true };
}

async function checkOnpremLoginAccess(user: { isCustSuper?: boolean }): Promise<OnpremLoginAccessCheck> {
  if (process.env.ONPREM_MODE !== 'true') {
    return { allowed: true, lockActive: false };
  }

  const { getOnpremLicenseStatus } = await import('../services/onpremLicenseStatus');
  const ls = await getOnpremLicenseStatus();
  if (ls.hasValidLicense) {
    return { allowed: true, lockActive: false };
  }

  // Unlicensed grace period: 30 days from on-prem installation marker.
  // Prefer onpremLicenseState.installedAt, then createdAt, then first platform user creation timestamp.
  const licenseRow = await db.select({
    installedAt: onpremLicenseState.installedAt,
    createdAt: onpremLicenseState.createdAt,
    lastValidatedAt: onpremLicenseState.lastValidatedAt,
    id: onpremLicenseState.id,
  }).from(onpremLicenseState).limit(1);
  const fallbackUserTs = await db
    .select({ firstUserCreatedAt: sql<Date | null>`min(${users.createdAt})` })
    .from(users);

  const coerceDateOrNull = (value: unknown): Date | null => {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const parsed = new Date(value as string | number);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const graceAnchor =
    coerceDateOrNull(licenseRow[0]?.installedAt) ||
    coerceDateOrNull(licenseRow[0]?.createdAt) ||
    coerceDateOrNull(fallbackUserTs[0]?.firstUserCreatedAt) ||
    new Date();
  const graceEnd = new Date(graceAnchor);
  graceEnd.setDate(graceEnd.getDate() + 30);
  const now = new Date();
  const toleranceMs = 15 * 60 * 1000;
  const lastValidatedAt = coerceDateOrNull(licenseRow[0]?.lastValidatedAt);
  const tamperDetected =
    now.getTime() + toleranceMs < graceAnchor.getTime() ||
    (lastValidatedAt ? now.getTime() + toleranceMs < lastValidatedAt.getTime() : false);

  if (tamperDetected) {
    if (user.isCustSuper) {
      return {
        allowed: true,
        lockActive: true,
        errorMessage:
          'System time rollback or clock tampering was detected. Runtime is in remediation mode; only customer super admin access is allowed until time integrity is restored and license revalidated.',
      };
    }
    return {
      allowed: false,
      lockActive: true,
      errorMessage:
        'System time integrity check failed. Only customer super admin can login while clock tamper remediation is active.',
    };
  }

  if (licenseRow[0]?.id) {
    const existingValidatedAt = licenseRow[0]?.lastValidatedAt;
    if (!existingValidatedAt || now > existingValidatedAt) {
      try {
        await db
          .update(onpremLicenseState)
          .set({ lastValidatedAt: now })
          .where(eq(onpremLicenseState.id, licenseRow[0].id));
      } catch (error) {
        console.warn('[OnpremAuth] Failed to update lastValidatedAt during login:', error);
      }
    }
  }

  if (now <= graceEnd) {
    return { allowed: true, lockActive: false };
  }

  if (user.isCustSuper) {
    return { allowed: true, lockActive: true };
  }

  return {
    allowed: false,
    lockActive: true,
    errorMessage: `On-prem license grace period expired on ${graceEnd.toISOString()}. Only customer super admin can login until system licensing is completed.`,
  };
}

// ==================== REGISTRATION ROUTES ====================

router.post("/api/auth/register", async (req: Request, res: Response) => {
  try {
    const validatedData = registerUserSchema.parse(req.body);
    
    // STEP 1: Validate organization code FIRST to determine org type
    let organization: any = null;
    let requestedUnitId: string | undefined;
    let requestedSubUnitId: string | undefined;
    let requestedTeamId: string | undefined;
    let isDemoOrg = false;
    
    if (validatedData.organizationCode) {
      const code = validatedData.organizationCode;
      
      // Try organization invite code first
      organization = await storage.getOrganizationByInviteCode(code);
      
      if (!organization) {
        // Try unit join code
        const unit = await storage.getOrganizationUnitByJoinCode(code);
        if (unit) {
          organization = await storage.getOrganization(unit.organizationId);
          requestedUnitId = unit.id;
        }
      }
      
      if (!organization) {
        // Try subunit join code
        const subUnit = await storage.getOrganizationSubUnitByJoinCode(code);
        if (subUnit) {
          const unit = await storage.getOrganizationUnit(subUnit.unitId);
          if (unit) {
            organization = await storage.getOrganization(unit.organizationId);
            requestedUnitId = unit.id;
            requestedSubUnitId = subUnit.id;
          }
        }
      }
      
      if (!organization) {
        // Try team join code
        const team = await storage.getOrganizationTeamByJoinCode(code);
        if (team) {
          const subUnit = await storage.getOrganizationSubUnit(team.subUnitId);
          if (subUnit) {
            const unit = await storage.getOrganizationUnit(subUnit.unitId);
            if (unit) {
              organization = await storage.getOrganization(unit.organizationId);
              requestedUnitId = unit.id;
              requestedSubUnitId = subUnit.id;
              requestedTeamId = team.id;
            }
          }
        }
      }
      
      if (!organization) {
        return res.status(400).json({ 
          error: "Invalid join code. Please check the code and try again." 
        });
      }
      
      isDemoOrg = organization.isDemo || false;
    }
    
    // STEP 1.5: On-prem registration check
    // DEV/QA on-prem allows org-code registrations (approved later as teacher/team_lead),
    // while learner/no-code registrations remain blocked by license policy.
    const onpremCheck = await checkOnpremRegistration({
      hasOrganizationCode: Boolean(organization),
    });
    if (!onpremCheck.allowed) {
      return res.status(403).json({
        error: onpremCheck.errorMessage || "Registration is not available. A valid license is required.",
        code: "LICENSE_REQUIRED"
      });
    }

    // STEP 2: Check for existing users with specific error messages
    const existingUserByEmail = await storage.getUserByEmail(validatedData.email);
    if (existingUserByEmail) {
      // For demo orgs, suggest login instead of registration
      if (isDemoOrg) {
        return res.status(409).json({ 
          error: `The email "${validatedData.email}" is already registered. Please login to your existing account to join this organization.`,
          errorType: 'existing_user',
          suggestLogin: true
        });
      }
      return res.status(409).json({ 
        error: `The email "${validatedData.email}" is already registered. Please use a different email address or login to your existing account.`,
        errorType: 'email_taken'
      });
    }
    
    const existingUserByGamerName = await storage.getUserByGamerName(validatedData.gamerName);
    if (existingUserByGamerName) {
      return res.status(409).json({ 
        error: `The gamer name "${validatedData.gamerName}" is already taken. Please choose a different gamer name.`,
        errorType: 'gamer_name_taken'
      });
    }
    
    // STEP 3: Create user (now we know there are no duplicates)
    const user = await storage.createUser({
      ...validatedData,
      firstName: validatedData.firstName,
      lastName: validatedData.lastName,
    });
    
    // STEP 4: Handle organization enrollment
    let requiresApproval = false;
    
    if (organization) {
      // All organizations (including Special Plan/isDemo) use standard pending join request flow
      const joinRequest = await storage.createJoinRequest({
        userId: user.id,
        organizationId: organization.id,
        requestedUnitId,
        requestedSubUnitId,
        requestedTeamId,
        requestedSubjectIds: validatedData.selectedSubjects || [],
        status: 'pending'
      });
      requiresApproval = true;

      // Send notification emails to all org admins (non-blocking)
      JoinRequestApprovalService.notifyAdminsOfJoinRequest(joinRequest.id)
        .then(result => {
          console.log(`[JoinRequest] Notified ${result.emailsSent} admins of new join request ${joinRequest.id}`);
          if (result.errors.length > 0) {
            console.warn(`[JoinRequest] Notification errors:`, result.errors);
          }
        })
        .catch(err => {
          console.error(`[JoinRequest] Failed to send join request notifications:`, err);
        });
    } else {
      // No org code provided - auto-enroll to the default public learner org.
      // This is REQUIRED as all functionality in the platform requires org membership
      let defaultOrgId = process.env.DEFAULT_ORG_ID;
      
      try {
        let defaultOrg = defaultOrgId ? await storage.getOrganization(defaultOrgId) : null;
        if (!defaultOrg) {
          defaultOrg = await PublicOrganizationService.getOrCreatePublicOrganization();
          defaultOrgId = defaultOrg.id;
        }
        const resolvedDefaultOrgId = defaultOrg.id;
        
        // Assign user as a learner to the default org
        // Note: For e-learning orgs like "Public Organization", no unit/subject assignment is needed
        const learnerRole = getPublicLearnerRole(defaultOrg.type);
        try {
          await storage.assignUserRole(user.id, resolvedDefaultOrgId, learnerRole);
          console.log(`[Registration] User ${user.id} auto-enrolled to default org "${defaultOrg.name}" as ${learnerRole}`);
        } catch (roleError: any) {
          // Handle duplicate role assignment gracefully (idempotent for retries)
          if (roleError?.code === '23505' || roleError?.message?.includes('duplicate')) {
            console.log(`[Registration] User ${user.id} already has role in default org (retry detected)`);
          } else {
            throw roleError; // Re-throw non-duplicate errors
          }
        }
        
        // Also assign user to the "General" department in the default org
        try {
          const orgUnits = await storage.getOrganizationUnits(resolvedDefaultOrgId);
          // Find the top-level "General" department (case-insensitive, no parent)
          const generalDepartment = orgUnits.find(
            (unit: any) => unit.name.toLowerCase() === 'general' && !unit.parentId
          );
          
          if (generalDepartment) {
            await storage.assignUserToUnit(user.id, resolvedDefaultOrgId, generalDepartment.id);
            console.log(`[Registration] User ${user.id} assigned to "${generalDepartment.name}" department in default org`);
          } else {
            console.warn(`[Registration] "General" department not found in default org ${defaultOrgId} - user not assigned to department`);
          }
        } catch (deptError: any) {
          // Handle duplicate assignment gracefully (idempotent for retries)
          if (deptError?.code === '23505' || deptError?.message?.includes('duplicate')) {
            console.log(`[Registration] User ${user.id} already assigned to department (retry detected)`);
          } else {
            console.error(`[Registration] Failed to assign user to department:`, deptError);
            // Don't fail registration for department assignment failure - user is still in org
          }
        }
      } catch (defaultOrgError) {
        console.error('[Registration] Failed to enroll user in default org:', defaultOrgError);
        return res.status(500).json({
          error: "Failed to complete registration. Please try again or contact support.",
          errorType: 'enrollment_error'
        });
      }
    }
    
    // STEP 5: Send email verification email
    let emailVerificationSent = false;
    try {
      const sendDecision = await EmailVerificationService.shouldSendVerificationEmail(user.id, user.email);
      if (!sendDecision.shouldSend) {
        console.log(
          `[Registration] Skipping duplicate verification email for ${maskEmail(user.email)} (reason=${sendDecision.reason})`,
        );
      } else {
        const verificationToken = await EmailVerificationService.createVerificationToken(user.id);
        if (!verificationToken) {
          console.error(`[Registration] Failed to create verification token for user ${user.id}`);
        } else {
        const baseUrl = getBaseUrl();
        const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}`;
        
        await MailerSendService.sendEmailVerificationEmail({
          to: user.email,
          userName: user.firstName || user.gamerName,
          verificationUrl,
          expiresIn: '24 hours'
        });
        emailVerificationSent = true;
        console.log(`[Registration] Verification email sent to ${maskEmail(user.email)}`);
        }
      }
    } catch (emailError) {
      console.error('[Registration] Failed to send verification email:', emailError);
    }
    
    // STEP 6: Return success response
    let message = emailVerificationSent 
      ? "Registration successful! Please check your email to verify your account, then login."
      : "Registration successful! Please login to access the platform. You can request a verification email from your profile.";
    
    if (organization && requiresApproval) {
      // All organizations (including Special Plan) now use pending approval flow
      message = emailVerificationSent
        ? "Registration successful! Please check your email to verify your account. Your join request has been submitted for approval."
        : "Registration successful! Your join request has been submitted for approval.";
    }
    
    res.status(201).json({ 
      message, 
      user: { id: user.id, gamerName: user.gamerName, email: user.email },
      requiresApproval,
      emailVerificationSent
    });
  } catch (error) {
    if (error instanceof OnpremLicensePolicyError) {
      return res.status(error.statusCode).json({
        error: error.message,
        errorType: 'license_policy',
      });
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: error.errors[0].message,
        errorType: 'validation_error'
      });
    }
    console.error("Registration error:", error);
    res.status(500).json({ 
      error: "Registration failed. Please try again.",
      errorType: 'server_error'
    });
  }
});

// ==================== VALIDATE JOIN CODE ====================

router.get("/api/auth/validate-join-code", async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: "Join code is required" });
    }
    
    // Check organization invite code first
    const organization = await storage.getOrganizationByInviteCode(code);
    if (organization) {
      return res.json({
        valid: true,
        type: 'organization',
        level: 'organization',
        organization: {
          id: organization.id,
          name: organization.name,
          type: organization.type
        },
        terminology: getTerminologyForOrgType(organization.type)
      });
    }
    
    // Check unit join code
    const unit = await storage.getOrganizationUnitByJoinCode(code);
    if (unit) {
      const org = await storage.getOrganization(unit.organizationId);
      return res.json({
        valid: true,
        type: 'unit',
        level: 'department',
        organization: {
          id: org!.id,
          name: org!.name,
          type: org!.type
        },
        unit: {
          id: unit.id,
          name: unit.name
        },
        terminology: getTerminologyForOrgType(org!.type)
      });
    }
    
    // Check subunit join code
    const subUnit = await storage.getOrganizationSubUnitByJoinCode(code);
    if (subUnit) {
      const unit = await storage.getOrganizationUnit(subUnit.unitId);
      const org = await storage.getOrganization(unit!.organizationId);
      return res.json({
        valid: true,
        type: 'subunit',
        level: 'unit',
        organization: {
          id: org!.id,
          name: org!.name,
          type: org!.type
        },
        unit: {
          id: unit!.id,
          name: unit!.name
        },
        subUnit: {
          id: subUnit.id,
          name: subUnit.name
        },
        terminology: getTerminologyForOrgType(org!.type)
      });
    }
    
    // Check team join code
    const team = await storage.getOrganizationTeamByJoinCode(code);
    if (team) {
      const subUnit = await storage.getOrganizationSubUnit(team.subUnitId);
      const unit = await storage.getOrganizationUnit(subUnit!.unitId);
      const org = await storage.getOrganization(unit!.organizationId);
      return res.json({
        valid: true,
        type: 'team',
        level: 'team',
        organization: {
          id: org!.id,
          name: org!.name,
          type: org!.type
        },
        unit: {
          id: unit!.id,
          name: unit!.name
        },
        subUnit: {
          id: subUnit!.id,
          name: subUnit!.name
        },
        team: {
          id: team.id,
          name: team.name
        },
        terminology: getTerminologyForOrgType(org!.type)
      });
    }
    
    // Join code not found
    return res.json({ valid: false });
    
  } catch (error) {
    console.error("Validate join code error:", error);
    res.status(500).json({ error: "Failed to validate join code" });
  }
});

// ==================== SUBJECTS FOR GRADE ====================

router.get("/api/auth/subjects-for-grade", async (req: Request, res: Response) => {
  try {
    const { unitId } = req.query;
    
    if (!unitId || typeof unitId !== 'string') {
      return res.status(400).json({ error: "Unit ID is required" });
    }
    
    const subjects = await storage.getUnitSubjects(unitId);
    return res.json(subjects);
    
  } catch (error) {
    console.error("Get subjects for grade error:", error);
    res.status(500).json({ error: "Failed to get subjects" });
  }
});

// ==================== LOGIN ====================

router.post("/api/auth/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = loginUserSchema.parse(req.body);
    
    // Try to find user by email, gamer name, or first+last name
    let user = await storage.getUserByEmail(email);
    
    // If not found by email, try gamer name
    if (!user) {
      user = await storage.getUserByGamerName(email);
    }
    
    // If still not found, try first + last name combination
    if (!user && email.includes(' ')) {
      const nameParts = email.trim().split(/\s+/);
      if (nameParts.length >= 2) {
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ');
        user = await storage.getUserByFirstLastName(firstName, lastName);
      }
    }
    
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    // Check if account is locked
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const minutesRemaining = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / (1000 * 60));
      return res.status(403).json({ 
        error: "Account locked", 
        message: `Too many failed login attempts. Your account is locked for ${minutesRemaining} more minute${minutesRemaining !== 1 ? 's' : ''}.`
      });
    }

    // Check if account is disabled
    if (user.isDisabled) {
      return res.status(403).json({ 
        error: "Account disabled", 
        message: "Your account has been disabled. Please contact your administrator."
      });
    }
    
    // Validate password
    const isValidPassword = await storage.validatePassword(password, user.password);
    if (!isValidPassword) {
      // Increment failed login attempts
      const newFailedAttempts = (user.failedLoginAttempts || 0) + 1;
      
      if (newFailedAttempts >= 3) {
        // Lock account for 30 minutes
        const lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
        await storage.updateUser(user.id, {
          failedLoginAttempts: newFailedAttempts,
          lockedUntil
        });
        
        return res.status(403).json({ 
          error: "Account locked", 
          message: "Too many failed login attempts. Your account has been locked for 30 minutes."
        });
      } else {
        // Increment failed attempts but don't lock yet
        await storage.updateUser(user.id, {
          failedLoginAttempts: newFailedAttempts
        });
        
        const attemptsRemaining = 3 - newFailedAttempts;
        return res.status(401).json({ 
          error: "Invalid credentials",
          attemptsRemaining,
          message: `Invalid credentials. ${attemptsRemaining} attempt${attemptsRemaining !== 1 ? 's' : ''} remaining before account lockout.`
        });
      }
    }
    
    // Password is valid - reset failed login attempts
    if (user.failedLoginAttempts && user.failedLoginAttempts > 0) {
      await storage.updateUser(user.id, {
        failedLoginAttempts: 0,
        lockedUntil: null
      });
    }

    // On-prem unlicensed lock mode:
    // after 30-day grace only customer super admin can login.
    const onpremLoginAccess = await checkOnpremLoginAccess({ isCustSuper: user.isCustSuper || false });
    if (!onpremLoginAccess.allowed) {
      return res.status(403).json({
        error: onpremLoginAccess.errorMessage || 'Login blocked by on-prem licensing policy.',
        lockMode: onpremLoginAccess.lockActive,
      });
    }
    
    // Check if user has a pending or denied join request
    // Allow them to login but track their status
    const joinRequest = await storage.getJoinRequestByUserId(user.id);
    let joinRequestStatus = 'approved'; // Default for users without join requests
    let joinRequestMessage = null;
    
    if (joinRequest) {
      joinRequestStatus = joinRequest.status;
      if (joinRequest.status === 'pending') {
        joinRequestMessage = "Your join request is still under review. You can access public quizzes while waiting for approval.";
      } else if (joinRequest.status === 'denied') {
        joinRequestMessage = joinRequest.denialReason 
          ? `Your join request was denied. Reason: ${joinRequest.denialReason}. You can only access public quizzes.`
          : "Your join request was denied. You can only access public quizzes. Please contact your organization administrator.";
      }
      // If status is 'approved', continue with normal login flow
    }
    
    // Check seat limits using unified seat policy (trial, package-based)
    const userRoles = await storage.getUserRoles(user.id);
    if (isOnPremMode() && userRoles.length > 0) {
      const learnerRoles = new Set(['student', 'learner', 'employee']);
      const normalizedRoleNames = userRoles
        .map((role) => String(role.role || '').toLowerCase())
        .filter(Boolean);
      const hasLearnerRole = normalizedRoleNames.some((role) => learnerRoles.has(role));
      const hasNonLearnerRole = normalizedRoleNames.some((role) => !learnerRoles.has(role));

      const { getOnpremRolePolicy, evaluateOnpremLearnerLoginAccess } = await import('../services/onpremLicensePolicy');
      const policy = await getOnpremRolePolicy();
      const learnerLoginDecision = evaluateOnpremLearnerLoginAccess({
        onpremMode: policy.onpremMode,
        systemType: policy.systemType,
        hasValidLicense: policy.hasValidLicense,
        learnerRolesAllowed: policy.learnerRolesAllowed,
        hasLearnerRole,
        hasNonLearnerRole,
        isSuperAdmin: !!user.isSuperAdmin,
        isCustSuper: !!user.isCustSuper,
      });

      if (!learnerLoginDecision.allowed) {
        return res.status(403).json({
          error: 'Learner login disabled',
          message: learnerLoginDecision.errorMessage,
        });
      }

      const learnerOrgIds = Array.from(
        new Set(
          userRoles
            .filter((role) => learnerRoles.has(String(role.role || '').toLowerCase()))
            .map((role) => role.organizationId)
            .filter(Boolean)
        )
      );

      if (learnerOrgIds.length > 0) {
        const inactiveLearnerOrgs = await db
          .select({ id: organizations.id, name: organizations.name })
          .from(organizations)
          .where(and(inArray(organizations.id, learnerOrgIds as string[]), eq(organizations.isActive, false)));

        if (inactiveLearnerOrgs.length > 0) {
          const blockedOrgNames = inactiveLearnerOrgs.map((org) => org.name).join(', ');
          return res.status(403).json({
            error: 'Organization deactivated',
            message: `Learner access is disabled for deactivated organization(s): ${blockedOrgNames}. Please contact your platform administrator.`,
          });
        }
      }
    }

    if (userRoles.length > 0) {
      const organizationId = userRoles[0].organizationId;
      const userRole = userRoles[0].role;
      const limitCheck = await checkConcurrentUserLimit(organizationId, userRole);
      
      if (!limitCheck.allowed) {
        if (limitCheck.trialExpired) {
          return res.status(403).json({
            error: 'Trial expired',
            limitType: 'trial_expired',
            message: limitCheck.message || 'Your organization\'s trial has expired. Please contact your administrator to subscribe.',
            trialExpired: true,
          });
        }
        return res.status(403).json({
          error: 'Access denied',
          limitType: limitCheck.limitType,
          message: limitCheck.message,
          currentUsage: limitCheck.currentUsage,
          limit: limitCheck.limit
        });
      }
      
      await trackUserLogin(organizationId);
    }
    
    // Set session
    req.session.userId = user.id;
    req.session.user = { id: user.id, gamerName: user.gamerName, email: user.email };
    
    // Populate session context for session-based auth optimization (if enabled)
    if (isFeatureEnabled('SESSION_AUTH_ENABLED')) {
      try {
        const sessionContext = await SessionContextService.buildSessionContext(user.id);
        req.session.context = sessionContext;
        console.log(`[Login] Session context populated for user ${user.id}`);
    
        if (user.isCustSuper && !user.isSuperAdmin && !sessionContext.impersonatedOrganization) {
          try {
            // Pin CustSuper org context to one of the organizations they actually belong to.
            // Falling back to the first org in the database can mis-scope impersonation.
            const custSuperPrimaryOrgId =
              userRoles.find((r) => !!r.organizationId)?.organizationId ||
              null;

            let org = null as (typeof organizations.$inferSelect) | null;
            if (custSuperPrimaryOrgId) {
              const [orgByRole] = await db
                .select()
                .from(organizations)
                .where(eq(organizations.id, custSuperPrimaryOrgId))
                .limit(1);
              org = orgByRole || null;
            }

            if (!org) {
              const allOrgs = await db.select().from(organizations).limit(1);
              org = allOrgs[0] || null;
            }

            if (org) {
              req.session.context.impersonatedOrganization = {
                orgId: org.id,
                orgName: org.name,
                orgType: org.type as 'education' | 'business' | 'elearning',
                roles: ['org_admin'],
              };
              console.log(`[Login] CustSuper auto-impersonating org ${org.id} (${org.name})`);
            }
          } catch (impError) {
            console.error('[Login] Failed to auto-impersonate org for CustSuper:', impError);
          }
        }
      } catch (error) {
        console.error('[Login] Failed to build session context, falling back to database lookups:', error);
        // Don't fail login if session context fails, just log and continue
      }
    }
    
    // Update login streak and award daily coins
    let streakData = null;
    try {
      const { streak, coinsAwarded } = await gamificationService.updateLoginStreak(user.id);
      streakData = {
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        coinsAwarded
      };
    } catch (error) {
      console.error("Error updating login streak:", error);
    }
    
    // Persist session before responding to avoid intermittent login races
    // where /api/auth/user is called before the session store commit completes.
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });

    // Get user roles to determine redirect
    const roles = await storage.getUserRoles(user.id);
    let primaryRole = 'student'; // Default role
    if (user.isSuperAdmin) {
      primaryRole = 'superadmin';
    } else if (user.isCustSuper) {
      primaryRole = 'custsuper';
    } else if (roles.length > 0) {
      // Priority: superadmin > org_admin > teacher > student
      const roleTypes = roles.map(r => r.role);
      if (roleTypes.includes('superadmin')) primaryRole = 'superadmin';
      else if (roleTypes.includes('org_admin')) primaryRole = 'org_admin';
      else if (roleTypes.includes('teacher')) primaryRole = 'teacher';
      else if (roleTypes.includes('student')) primaryRole = 'student';
    }
    
    res.json({ 
      message: "Login successful", 
      user: { id: user.id, gamerName: user.gamerName, email: user.email },
      primaryRole,
      joinRequestStatus,
      joinRequestMessage,
      streakData
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error("Login error:", error);
    return sendError(res, 500, "Login failed", ErrorCode.INTERNAL_ERROR, "An unexpected error occurred during login");
  }
});

// ==================== PASSWORD RESET ROUTES ====================

router.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    // Rate limiting checks
    if (!PasswordResetRateLimiter.checkEmailLimit(email)) {
      console.log(`[PasswordReset] Email rate limit exceeded: ${maskEmail(email)}`);
      // Return success to prevent account enumeration
      return res.json({ 
        message: "If that email address is registered, you will receive password reset instructions shortly." 
      });
    }

    if (!PasswordResetRateLimiter.checkIPLimit(clientIp)) {
      console.log(`[PasswordReset] IP rate limit exceeded: ${clientIp}`);
      return res.status(429).json({ 
        error: "Too many password reset requests. Please try again later." 
      });
    }

    // Look up user by email (don't reveal if user exists)
    const user = await storage.getUserByEmail(email);
    
    // Audit log
    console.log(`[PasswordReset] Forgot password request - Email: ${maskEmail(email)}, IP: ${clientIp}, UserExists: ${!!user}`);

    if (user) {
      // Check if user is disabled - silently skip sending email to prevent account enumeration
      if (user.isDisabled) {
        console.log(`[PasswordReset] Disabled user attempted password reset - Email: ${maskEmail(email)}, IP: ${clientIp}`);
        // Return success message anyway to prevent account enumeration
        return res.json({ 
          message: "If that email address is registered, you will receive password reset instructions shortly." 
        });
      }

      // Generate reset token
      const { token, hashedToken, expiresAt } = PasswordResetService.generateResetToken();

      // Store hashed token in database
      const stored = await PasswordResetService.storeResetToken(user.id, hashedToken, expiresAt);

      if (stored) {
        // Send reset email via MailerSend
        const baseUrl = getBaseUrl();
        const resetUrl = `${baseUrl}/reset-password?token=${token}`;
        
        try {
          await MailerSendService.sendPasswordResetEmail({
            to: user.email,
            userName: user.firstName || user.gamerName,
            resetUrl,
            expiresIn: '1 hour'
          });
          console.log(`[PasswordReset] Reset email sent to ${maskEmail(user.email)}`);
        } catch (emailError) {
          console.error('[PasswordReset] Email send error:', emailError);
          // Don't reveal email failure to user
        }
      }
    }

    // Always return success (security: don't reveal if email exists)
    res.json({ 
      message: "If that email address is registered, you will receive password reset instructions shortly." 
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid email address" });
    }
    console.error("[PasswordReset] Forgot password error:", error);
    // Return generic success to prevent enumeration
    res.json({ 
      message: "If that email address is registered, you will receive password reset instructions shortly." 
    });
  }
});

router.get("/api/auth/verify-reset-token/:token", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const normalizedToken = token?.trim().replace(/\s+/g, '');

    if (!normalizedToken) {
      return res.status(400).json({ valid: false, error: "Token is required" });
    }

    const verification = await PasswordResetService.verifyResetToken(normalizedToken);

    res.json({ 
      valid: verification.valid,
      ...(verification.error && { error: verification.error })
    });

  } catch (error) {
    console.error("[PasswordReset] Token verification error:", error);
    res.json({ valid: false, error: "Token verification failed" });
  }
});

router.post("/api/auth/reset-password", async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = z.object({
      token: z.string().min(1),
      newPassword: z.string()
        .min(8, "Password must be at least 8 characters")
        .max(128, "Password must be less than 128 characters")
        .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
        .regex(/[a-z]/, "Password must contain at least one lowercase letter")
        .regex(/[0-9]/, "Password must contain at least one number")
        .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character")
    }).parse(req.body);

    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const normalizedToken = token.trim().replace(/\s+/g, '');

    // Verify token
    const verification = await PasswordResetService.verifyResetToken(normalizedToken);

    if (!verification.valid || !verification.userId) {
      console.log(`[PasswordReset] Invalid token attempt from IP: ${clientIp}`);
      return res.status(400).json({ 
        error: verification.error || "Invalid or expired reset token" 
      });
    }

    // Check if user is disabled - they cannot reset their password
    const targetUser = await storage.getUser(verification.userId);
    if (targetUser?.isDisabled) {
      console.log(`[PasswordReset] Disabled user attempted to reset password - UserId: ${verification.userId}, IP: ${clientIp}`);
      return res.status(403).json({ 
        error: "Your account has been disabled. Please contact your administrator." 
      });
    }

    // Reset password (with token to prevent concurrent reuse)
    const resetResult = await PasswordResetService.resetPassword(
      verification.userId, 
      newPassword,
      normalizedToken
    );

    if (!resetResult.success) {
      // Return 400 for token-related errors, 500 for internal errors
      const statusCode = resetResult.errorCode === 'INTERNAL_ERROR' ? 500 : 400;
      console.log(`[PasswordReset] Reset failed - Code: ${resetResult.errorCode}, Error: ${resetResult.error}, IP: ${clientIp}`);
      return res.status(statusCode).json({ error: resetResult.error || "Password reset failed. Please try again." });
    }

    // Invalidate all user sessions (best-effort, never fails the reset)
    try {
      if (req.sessionStore) {
        await PasswordResetService.invalidateUserSessions(verification.userId, req.sessionStore);
      }
    } catch (sessionError) {
      // Log but don't fail - password was already reset successfully
      console.error('[PasswordReset] Session invalidation error (non-fatal):', sessionError);
    }

    // Audit log (before any optional steps that could fail)
    console.log(`[PasswordReset] Password reset successful - UserId: ${verification.userId}, IP: ${clientIp}`);

    // Get user for confirmation email (best-effort, never fails the reset)
    try {
      const user = await storage.getUser(verification.userId);
      if (user) {
        await MailerSendService.sendPasswordResetConfirmation({
          to: user.email,
          userName: user.firstName || user.gamerName
        });
      }
    } catch (emailError) {
      console.error('[PasswordReset] Confirmation email error (non-fatal):', emailError);
      // Don't fail the reset if email fails
    }

    res.json({ 
      message: "Password reset successful. Please login with your new password." 
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: error.errors[0].message 
      });
    }
    console.error("[PasswordReset] Reset password error:", error);
    return sendError(res, 500, "Password reset failed. Please try again.", ErrorCode.INTERNAL_ERROR);
  }
});

// ==================== EMAIL VERIFICATION ROUTES ====================

router.post("/api/auth/verify-email", async (req: Request, res: Response) => {
  try {
    const { token } = z.object({
      token: z.string().min(1, "Verification token is required")
    }).parse(req.body);

    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    // Verify token
    const verification = await EmailVerificationService.verifyToken(token);

    if (!verification.valid || !verification.userId) {
      console.log(`[EmailVerification] Invalid token attempt from IP: ${clientIp}`);
      return res.status(400).json({ 
        error: verification.error || "Invalid or expired verification token" 
      });
    }

    // Mark email as verified
    const success = await EmailVerificationService.markEmailAsVerified(verification.userId);

    if (!success) {
      return sendError(res, 500, "Email verification failed. Please try again.", ErrorCode.DATABASE_ERROR);
    }

    // Audit log
    console.log(`[EmailVerification] Email verified - UserId: ${verification.userId}, Email: ${maskEmail(verification.email || '')}, IP: ${clientIp}`);

    // Award trial credits if user is org admin of a trial org
    let creditsAwarded = 0;
    try {
      const userRoles = await storage.getUserRoles(verification.userId);
      for (const role of userRoles) {
        if (role.role === 'org_admin') {
          const result = await CreditService.awardTrialCreditsAfterVerification(
            verification.userId,
            role.organizationId
          );
          if (result.success) {
            creditsAwarded = result.creditsAwarded;
            console.log(`[EmailVerification] Awarded ${creditsAwarded} trial credits after verification`);
          }
        }
      }
    } catch (creditError) {
      console.error('[EmailVerification] Error awarding trial credits:', creditError);
      // Don't fail verification if credit awarding fails
    }

    res.json({ 
      message: creditsAwarded > 0 
        ? `Email verified successfully! You've unlocked your ${creditsAwarded} free lesson credits.`
        : "Email verified successfully! You can now access all features.",
      email: verification.email,
      creditsAwarded
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: error.errors[0].message 
      });
    }
    console.error("[EmailVerification] Verification error:", error);
    return sendError(res, 500, "Email verification failed. Please try again.", ErrorCode.INTERNAL_ERROR);
  }
});

router.post("/api/auth/resend-verification", async (req: Request, res: Response) => {
  try {
    // User must be logged in to resend verification
    if (!req.session.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const userId = req.session.userId;
    const user = await storage.getUser(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: "Email is already verified" });
    }

    const sendDecision = await EmailVerificationService.shouldSendVerificationEmail(userId, user.email);
    if (!sendDecision.shouldSend) {
      return res.json({
        message: "Verification email was already sent recently. Please check your inbox and spam folder before requesting another.",
      });
    }

    // Generate new verification token only when sending is actually required
    const verificationToken = await EmailVerificationService.createVerificationToken(userId);
    if (!verificationToken) {
      return sendError(res, 500, "Failed to generate verification token", ErrorCode.DATABASE_ERROR);
    }

    const baseUrl = getBaseUrl();
    const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}`;
    
    await MailerSendService.sendEmailVerificationEmail({
      to: user.email,
      userName: user.firstName || user.gamerName,
      verificationUrl,
      expiresIn: '24 hours'
    });

    console.log(`[EmailVerification] Resent verification email to ${maskEmail(user.email)}`);

    res.json({ 
      message: "Verification email sent. Please check your inbox." 
    });

  } catch (error) {
    console.error("[EmailVerification] Resend error:", error);
    return sendError(res, 500, "Failed to resend verification email. Please try again.", ErrorCode.INTERNAL_ERROR);
  }
});

router.get("/api/auth/verification-status", async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const isVerified = await EmailVerificationService.isEmailVerified(req.session.userId);

    res.json({ emailVerified: isVerified });

  } catch (error) {
    console.error("[EmailVerification] Status check error:", error);
    return sendError(res, 500, "Failed to check verification status", ErrorCode.DATABASE_ERROR);
  }
});

// ==================== LOGOUT ====================

router.post("/api/auth/logout", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    
    // Track user logout before destroying session
    if (userId) {
      const userRoles = await storage.getUserRoles(userId);
      if (userRoles.length > 0) {
        const organizationId = userRoles[0].organizationId;
        await trackUserLogout(organizationId);
      }
    }
    
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return sendError(res, 500, "Logout failed", ErrorCode.INTERNAL_ERROR);
      }
      // Clear the session cookie with proper options matching session config
      const isSecureHTTPS = process.env.COOKIE_SECURE !== undefined
        ? process.env.COOKIE_SECURE === 'true'
        : (
          (process.env.NODE_ENV === 'production' || 
          process.env.REPLIT_DEPLOYMENT === 'true' || 
          process.env.REPL_SLUG === 'learnplay'
          ) && process.env.REPL_SLUG !== 'workspace'
        );
      
      const deploymentMode = ((process.env.DEPLOYMENT_MODE || '').trim().toLowerCase() === 'onprem' || process.env.ONPREM_MODE === 'true')
        ? 'onprem'
        : 'cloud';
      const defaultCookieName = deploymentMode === 'onprem' ? 'lp_onprem.sid' : 'lp_cloud.sid';
      const sessionCookieName = process.env.SESSION_COOKIE_NAME || defaultCookieName;
      const rawSameSite = (process.env.SESSION_COOKIE_SAMESITE || '').trim().toLowerCase();
      const sessionCookieSameSite: 'lax' | 'none' | 'strict' =
        rawSameSite === 'none' || rawSameSite === 'strict' || rawSameSite === 'lax'
          ? (rawSameSite as 'lax' | 'none' | 'strict')
          : 'lax';

      res.clearCookie(sessionCookieName, {
        path: "/",
        httpOnly: true,
        secure: isSecureHTTPS,
        sameSite: sessionCookieSameSite,
      });
      res.json({ message: "Logout successful" });
    });
  } catch (error) {
    console.error("Logout tracking error:", error);
    return sendError(res, 500, "Logout failed", ErrorCode.INTERNAL_ERROR);
  }
});

// ==================== SESSION REFRESH ROUTES ====================

router.post("/api/auth/refresh", async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!isFeatureEnabled('SESSION_AUTH_ENABLED')) {
      return res.status(501).json({ 
        error: "Session refresh not available",
        message: "Session-based authentication is not enabled"
      });
    }

    const userId = req.session.userId;
    const currentSessionVersion = req.session.context?.sessionVersion;

    if (!currentSessionVersion) {
      // No session context exists, build it
      const context = await SessionContextService.buildSessionContext(userId);
      req.session.context = context;
      return res.json({ 
        message: "Session context created successfully",
        context: {
          organizations: context.organizations.length,
          effectiveRole: context.effectiveRole,
          sessionVersion: context.sessionVersion,
        }
      });
    }

    // Refresh existing session context
    const refreshedContext = await SessionContextService.refreshSessionContext(
      userId,
      currentSessionVersion
    );

    if (!refreshedContext) {
      // Session version mismatch - force re-authentication
      req.session.destroy((err) => {
        if (err) console.error('[SessionRefresh] Error destroying stale session:', err);
      });

      return res.status(401).json({
        error: "Session expired",
        message: "Your account settings have changed. Please log in again.",
        code: "STALE_SESSION",
      });
    }

    // Update session with fresh context
    req.session.context = refreshedContext;
    
    res.json({ 
      message: "Session refreshed successfully",
      context: {
        organizations: refreshedContext.organizations.length,
        effectiveRole: refreshedContext.effectiveRole,
        sessionVersion: refreshedContext.sessionVersion,
      }
    });
  } catch (error) {
    console.error("[SessionRefresh] Error refreshing session:", error);
    res.status(500).json({ error: "Session refresh failed" });
  }
});

// ==================== SWITCH ORGANIZATION ====================

router.post("/api/user/switch-organization", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { organizationId } = req.body;
    if (!organizationId) {
      return res.status(400).json({ error: "organizationId is required" });
    }

    const userRoles = await storage.getUserRoles(userId);
    const hasAccess = userRoles.some((r: any) => r.organizationId === organizationId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You do not have access to this organization" });
    }

    const context = await SessionContextService.buildSessionContext(userId);
    
    const targetOrg = context.organizations.find(org => org.orgId === organizationId);
    if (targetOrg) {
      context.primaryOrganization = targetOrg;
    }
    
    req.session.context = context;

    console.log(`[SwitchOrg] User ${userId} switched to org ${organizationId}`);

    res.json({
      success: true,
      message: "Organization switched successfully",
      organization: targetOrg ? {
        id: targetOrg.orgId,
        name: targetOrg.orgName,
        type: targetOrg.orgType,
      } : null,
    });
  } catch (error) {
    console.error("[SwitchOrg] Error switching organization:", error);
    res.status(500).json({ error: "Failed to switch organization" });
  }
});

router.post("/api/auth/refresh-context", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {

    const userId = req.session.userId;
    
    console.log(`[RefreshContext] User ${userId} requested context refresh for org switching`);

    // Preserve impersonation state before rebuilding
    const existingImpersonation = req.session.context?.impersonatedOrganization || null;
    const existingPrimaryOrgId = req.session.context?.primaryOrganization?.orgId || null;

    // Rebuild session context with fresh data
    const context = await SessionContextService.buildSessionContext(userId!);

    // Restore impersonation state (set by /api/superadmin/impersonation endpoint)
    if (existingImpersonation) {
      context.impersonatedOrganization = existingImpersonation;
    }

    // Restore user-selected primary org (set by /api/user/switch-organization)
    if (existingPrimaryOrgId && context.organizations.length > 0) {
      const selectedOrg = context.organizations.find(org => org.orgId === existingPrimaryOrgId);
      if (selectedOrg) {
        context.primaryOrganization = selectedOrg;
      }
    }

    req.session.context = context;

    console.log(`[RefreshContext] Context refreshed for user ${userId}. Primary org: ${context.primaryOrganization?.orgId}, Role: ${context.effectiveRole}`);

    res.json({ 
      success: true,
      message: "Session context refreshed successfully",
      context: {
        primaryOrganization: context.primaryOrganization ? {
          id: context.primaryOrganization.orgId,
          name: context.primaryOrganization.orgName,
          type: context.primaryOrganization.orgType,
        } : null,
        organizationCount: context.organizations.length,
        effectiveRole: context.effectiveRole,
        hasSubscription: !!context.subscription,
      }
    });
  } catch (error) {
    console.error("[RefreshContext] Error refreshing context:", error);
    res.status(500).json({ error: "Failed to refresh context" });
  }
});

// ==================== SESSION METRICS (Internal) ====================

router.get("/api/internal/session-metrics", isAdmin, async (req: Request, res: Response) => {
  try {
    if (!req.session.userId || !req.session.context) {
      return res.json({
        authenticated: false,
        sessionAuth: isFeatureEnabled('SESSION_AUTH_ENABLED'),
      });
    }

    const sessionSize = JSON.stringify(req.session).length;
    const contextSize = JSON.stringify(req.session.context).length;

    res.json({
      authenticated: true,
      sessionAuth: isFeatureEnabled('SESSION_AUTH_ENABLED'),
      sessionSize,
      contextSize,
      organizations: req.session.context.organizations?.length || 0,
      effectiveRole: req.session.context.effectiveRole,
      sessionVersion: req.session.context.sessionVersion,
      hasSubscription: !!req.session.context.subscription,
    });
  } catch (error) {
    console.error("[SessionMetrics] Error retrieving metrics:", error);
    res.status(500).json({ error: "Failed to retrieve session metrics" });
  }
});

router.get("/api/internal/session-health", isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const metrics = getSessionHealthMetrics();
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      featureFlags: {
        SESSION_AUTH_ENABLED: isFeatureEnabled('SESSION_AUTH_ENABLED'),
        SESSION_PAYLOAD_MONITORING: isFeatureEnabled('SESSION_PAYLOAD_MONITORING'),
      },
      metrics,
    });
  } catch (error) {
    console.error("[SessionHealth] Error retrieving metrics:", error);
    res.status(500).json({ error: "Failed to retrieve session health metrics" });
  }
});

router.post("/api/internal/session-health/reset", isSuperAdmin, async (req: Request, res: Response) => {
  try {
    resetSessionHealthMetrics();
    res.json({
      success: true,
      message: "Session health metrics reset successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[SessionHealth] Error resetting metrics:", error);
    res.status(500).json({ error: "Failed to reset session health metrics" });
  }
});

router.get("/api/internal/session-health/summary", isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const summary = getSessionHealthSummary();
    res.type('text/plain').send(summary);
  } catch (error) {
    console.error("[SessionHealth] Error retrieving summary:", error);
    res.status(500).json({ error: "Failed to retrieve session health summary" });
  }
});

// ==================== GET CURRENT USER ====================

router.get("/api/auth/user", withSessionAuthMiddleware, withOrgContext, async (req: RequestWithOrgContext, res: Response) => {
  try {
    const user = await storage.getUser(req.session.userId!);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Update last active timestamp
    await storage.updateUserLastActive(user.id);
    
    // Use session context instead of database queries (session-based auth optimization)
    let organizationId: string | null = null;
    let organizationType: 'education' | 'business' | 'elearning' | null = null;
    let primaryRole: string | null = null;
    let userRoles: any[] = [];
    let impersonatedOrg: { id: string; name: string; type: string } | null = null;
    let isDemo: boolean = false;
    let fallbackOrganizationTimezone: string | null = null;
    let fallbackOrganizationCurrency: string | null = null;
    
    if (isFeatureEnabled('SESSION_AUTH_ENABLED') && req.session.context) {
      const sessionScope = SessionContextService.getCanonicalSessionScope(req.session.context);

      impersonatedOrg = sessionScope.impersonatedOrganization
        ? {
            id: sessionScope.impersonatedOrganization.orgId,
            name: sessionScope.impersonatedOrganization.orgName,
            type: sessionScope.impersonatedOrganization.orgType,
          }
        : null;

      userRoles = sessionScope.organizationRoles.map((orgRole) => ({
        role: orgRole.role,
        organizationId: orgRole.organizationId,
      }));

      if (req.orgContext) {
        organizationId = req.orgContext.organizationId;
        organizationType = req.orgContext.organizationType;
        primaryRole = req.orgContext.effectiveRole;
      } else {
        organizationId = sessionScope.effectiveOrganizationId;
        organizationType = sessionScope.effectiveOrganizationType;
        primaryRole = sessionScope.primaryRole;
      }
    } else if (req.orgContext) {
      // Session-based with org context
      organizationId = req.orgContext.organizationId;
      organizationType = req.orgContext.organizationType;
      primaryRole = req.orgContext.effectiveRole;
    } else {
      // Database fallback: query roles and organization (legacy behavior)
      const dbUserRoles = await db
        .select({
          role: userOrganizationRoles.role,
          organizationId: userOrganizationRoles.organizationId,
        })
        .from(userOrganizationRoles)
        .where(eq(userOrganizationRoles.userId, user.id));
      
      userRoles = dbUserRoles;
      primaryRole = dbUserRoles.length > 0 ? dbUserRoles[0].role : null;
      organizationId = dbUserRoles.length > 0 ? dbUserRoles[0].organizationId : null;
      
      if (organizationId) {
        const organization = await db
          .select({ type: organizations.type, timezone: organizations.timezone, currency: organizations.currency })
          .from(organizations)
          .where(eq(organizations.id, organizationId))
          .limit(1);
        organizationType = organization.length > 0 ? organization[0].type : null;
        fallbackOrganizationTimezone = organization.length > 0 ? organization[0].timezone : null;
        fallbackOrganizationCurrency = organization.length > 0 ? organization[0].currency : null;
      }
    }
    
    // Check for join request status
    const joinRequest = await storage.getJoinRequestByUserId(user.id);
    let joinRequestStatus = null;
    let joinRequestMessage = null;
    
    if (joinRequest && joinRequest.status !== 'approved') {
      joinRequestStatus = joinRequest.status;
      if (joinRequest.status === 'pending') {
        joinRequestMessage = "Your join request is still under review. You can access public quizzes while waiting for approval.";
      } else if (joinRequest.status === 'denied') {
        joinRequestMessage = joinRequest.denialReason 
          ? `Your join request was denied. Reason: ${joinRequest.denialReason}. You can only access public quizzes.`
          : "Your join request was denied. You can only access public quizzes. Please contact your organization administrator.";
      }
    }
    
    // Get user preferences from session context or fallback to user/org records
        const sessionPrefs = req.session.context?.userPreferences;
        const fallbackEffectiveLocale = resolveEffectiveLocale({
          userTimezone: user.timezone ?? null,
	      organizationTimezone: req.session.context?.primaryOrganization?.orgTimezone ?? fallbackOrganizationTimezone,
	      userCurrency: user.preferredCurrency ?? null,
	      organizationCurrency: req.session.context?.primaryOrganization?.orgCurrency ?? fallbackOrganizationCurrency,
	    });
    const userPreferences = {
      preferredCurrency: sessionPrefs?.preferredCurrency ?? fallbackEffectiveLocale.currency,
      needsCurrencyOnboarding: sessionPrefs?.needsCurrencyOnboarding ?? user.needsCurrencyOnboarding ?? true,
      timezone: sessionPrefs?.timezone ?? fallbackEffectiveLocale.timezone,
      preferredLanguage: sessionPrefs?.preferredLanguage ?? user.preferredLanguage ?? 'en',
      effectiveLocale: sessionPrefs?.effectiveLocale ?? fallbackEffectiveLocale,
    };
    
    // Get effective org for isDemo check
    const effectiveOrgId = impersonatedOrg?.id || organizationId;
    if (effectiveOrgId) {
      const org = await storage.getOrganization(effectiveOrgId);
      isDemo = org?.isDemo || false;
    }
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Auth User] isDemo: ${isDemo} for org: ${effectiveOrgId}`);
    }

    const effectiveOrganizationId = effectiveOrgId || null;
    const effectiveOrganizationType =
      (impersonatedOrg?.type as 'education' | 'business' | 'elearning' | null) ||
      organizationType;
    
    res.json({ 
      id: user.id, 
      gamerName: user.gamerName, 
      email: user.email,
      emailVerified: user.emailVerified || false,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarImageUrl: user.avatarImageUrl,
      country: user.country,
      bio: user.bio,
      playerTitle: user.playerTitle,
      preferredGameModes: user.preferredGameModes,
      isStatsPublic: user.isStatsPublic,
      totalGamesPlayed: user.totalGamesPlayed,
      totalWins: user.totalWins,
      winPercentage: user.winPercentage,
      bestWinStreak: user.bestWinStreak,
      currentWinStreak: user.currentWinStreak,
      averageGameDuration: user.averageGameDuration,
      preferredLanguage: user.preferredLanguage ?? 'en',
      lastActiveAt: user.lastActiveAt,
      createdAt: user.createdAt,
      isAuthenticated: true,
      isAdmin: user.isAdmin || false,
      isSuperAdmin: user.isSuperAdmin || false,
      isCustSuper: user.isCustSuper || false,
      role: primaryRole,
      organizationId: effectiveOrganizationId,
      organizationType: effectiveOrganizationType,
      effectiveOrganizationId: effectiveOrganizationId,
      organization: effectiveOrganizationId ? { id: effectiveOrganizationId, type: effectiveOrganizationType } : null,
      organizationRoles: userRoles,
      joinRequestStatus,
      joinRequestMessage,
      // SuperAdmin impersonation info
      impersonatedOrganization: impersonatedOrg,
      isImpersonating: !!impersonatedOrg,
      // Demo organization status
      isDemo,
      // User preferences from session context
      userPreferences,
      // On-prem license status for banner rendering
      ...(process.env.ONPREM_MODE === 'true' ? await (async () => {
        const { getOnpremLicenseStatus } = await import('../services/onpremLicenseStatus');
        const ls = await getOnpremLicenseStatus();
        return {
          onpremMode: true,
          onpremSystemType: ls.systemType,
          onpremLicensed: ls.hasValidLicense,
          onpremLicenseExpired: ls.isExpired,
          onpremLicenseExpiresAt: ls.licenseExpiresAt?.toISOString() || null,
          onpremLicenseStatusReason: ls.statusReason || null,
          onpremRemoteLicenseStatus: ls.remoteStatus || null,
        };
      })() : {}),
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Failed to get user" });
  }
});

/**
 * Create and configure the auth router
 * Returns the router instance with all auth routes registered
 */
export function createAuthRouter(): Router {
  return router;
}

export { router as authRouter };
