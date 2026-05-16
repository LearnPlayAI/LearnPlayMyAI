// @ts-nocheck
/**
 * Organization Routes Module
 * 
 * This module contains all organization-related routes including:
 * - /api/org/* routes (registration, join requests, billing, etc.)
 * - /api/org-wallet/* routes (organization credit wallet)
 * - /api/admin/org-credits/* routes (SuperAdmin org credit management)
 * - /api/organization/* routes (units, sub-units, subjects)
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getBaseUrl } from '../config/base-url';
import { eq, and, sql, inArray, desc, gte, lte, max, or, isNull } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { db } from '../db';
import * as schema from '@shared/schema';
import {
  users,
  organizations,
  userOrganizationRoles,
  userOrganizationAssignments,
  organizationUnits,
  organizationSubUnits,
  organizationTeams,
  subjects,
  unitSubjects,
  lessons,
  quizCollections,
  lpCreditLedger,
  courses,
  courseProgress,
  courseAssignments,
  quizGameResults,
  courseLessons,
  lessonQuizLinks,
  joinRequests,
} from '@shared/schema';
import { BUSINESS_DEPARTMENTS } from '@shared/businessConstants';
import {
  storage,
  isTeacherOrAdmin,
  validateJoinRequestAccess,
  withSessionAuthMiddleware,
  isSuperAdmin,
  ADMIN_ROLES,
  INSTRUCTOR_ROLES,
  getEffectiveOrganizationId,
} from './sharedResources';
import { generateOrgCode, generateGradeCode, generateClassCode, extractGradeNumber, getNextClassLetter, generateDepartmentCode, generateUnitCode, generateTeamCode, ensureUniqueCode } from '../utils/joinCodeGenerator';
import { OrganizationCreditService, InsufficientOrgCreditsError, UnauthorizedOrgCreditSpendError } from '../services/organizationCreditService';
import { JoinRequestApprovalService } from '../services/joinRequestApprovalService';
import { EmailVerificationService } from '../services/emailVerificationService';
import { MailerSendService } from '../services/mailerSendService';
import { SessionInvalidationService } from '../services/sessionInvalidationService';
import { businessPackageService } from '../services/businessPackageService';
import { packageBillingService } from '../services/packageBillingService';
import { userSeatManagementService } from '../services/userSeatManagementService';
import { packageRecommendationService } from '../services/packageRecommendationService';
import { seatPolicyService } from '../services/seatPolicyService';
import { CourseAssignmentService } from '../services/courseAssignmentService';
import { ContentLanguageService } from '../services/contentLanguageService';
import { organizationPackageAssignments } from '@shared/schema';
import { isAuthenticated } from './sharedResources';
import { ObjectStorageService } from '../objectStorage';
import { SessionContextService } from '../services/sessionContextService';
import { isFeatureEnabled } from '../featureFlags';
import { enforceOrganizationCreatePolicy, enforcePlatformRolePolicy, getOnpremRolePolicy, OnpremLicensePolicyError } from '../services/onpremLicensePolicy';
import { canonicalizeTimezone, isValidIanaTimezone } from '../utils/timezone';
import { resolveEffectiveOrganization, type RequestWithEffectiveOrg } from '../middleware/sessionAuthMiddleware';
import { isSuperAdminOrCustSuper } from '../adminAuth';
import { validateUnitSubjectAssignments } from '../services/joinRequestAssignmentValidationService';

const router = Router();
const objectStorageService = new ObjectStorageService();

function isShowcaseDepartmentName(name: string | null | undefined): boolean {
  return String(name || '').trim().toLowerCase() === 'showcase';
}

function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return '***@***.***';
  const maskedLocal = localPart.length > 2
    ? localPart[0] + '*'.repeat(Math.max(1, localPart.length - 2)) + localPart[localPart.length - 1]
    : '**';
  return `${maskedLocal}@${domain}`;
}

async function getDefaultRoleForApprovedJoinRequest(orgType?: string | null): Promise<string> {
  if (process.env.ONPREM_MODE === 'true') {
    const policy = await getOnpremRolePolicy();
    if (policy.systemType === 'development' || policy.systemType === 'qa') {
      if (orgType === 'business') {
        return 'team_lead';
      }
    }
  }

  return orgType === 'education' ? 'student' : 'learner';
}

const orgRegistrationSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  gamerName: z.string().min(3),
  positionAtOrg: z.string().min(2),
  orgName: z.string().min(3),
  streetAddress: z.string().min(5),
  city: z.string().min(2),
  province: z.string().min(2),
  postalCode: z.string().min(3),
  country: z.string().default('South Africa'),
  contactPhone: z.string().min(10),
  studentCount: z.number().min(1),
  howHeardAboutUs: z.string().min(3),
  organizationType: z.enum(['education', 'business', 'elearning']),
  selectedGrades: z.array(z.number()).optional(),
  gradeSubjects: z.record(z.array(z.string())).optional(),
  selectedDepartments: z.array(z.string()).optional(),
  departmentUnits: z.record(z.array(z.string())).optional(),
  courseThemes: z.array(z.string()).optional(),
}).refine(
  (data) => {
    if (data.organizationType === 'education') {
      return data.selectedGrades && data.selectedGrades.length > 0;
    } else if (data.organizationType === 'business') {
      // Business orgs can skip structure setup - selectedDepartments is optional
      return true;
    } else if (data.organizationType === 'elearning') {
      return true;
    }
    return false;
  },
  {
    message: "Education organizations must have selectedGrades",
  }
);

const approveJoinRequestSchema = z.object({
  unitId: z.string().uuid("Unit ID must be a valid UUID").optional().nullable(),
  subUnitId: z.string().uuid("SubUnit ID must be a valid UUID").optional().nullable(),
  teamId: z.string().uuid("Team ID must be a valid UUID").optional().nullable(),
  subjectIds: z.array(z.string()).optional(),
});

const denyJoinRequestSchema = z.object({
  reason: z.string().min(1, "Denial reason is required").trim(),
});

const bulkApproveJoinRequestSchema = z.object({
  requestIds: z.array(z.string()).min(1, "At least one request ID is required"),
});

const bulkDenyJoinRequestSchema = z.object({
  requestIds: z.array(z.string()).min(1, "At least one request ID is required"),
  reason: z.string().min(1, "Denial reason is required").trim(),
});

// ==================== PACKAGE SUBSCRIPTION VALIDATION SCHEMAS ====================

const subscribeSchema = z.object({
  packageId: z.string().uuid("Package ID must be a valid UUID"),
  interval: z.enum(['monthly', 'annual']),
  currency: z.enum(['ZAR', 'USD', 'EUR']),
});

const upgradeSchema = z.object({
  packageId: z.string().uuid("Package ID must be a valid UUID"),
  paymentId: z.string().optional(),
});

const scheduleDowngradeSchema = z.object({
  packageId: z.string().uuid("Package ID must be a valid UUID"),
  keepUserIds: z.object({
    learnerIds: z.array(z.string()),
    teacherIds: z.array(z.string()),
    orgAdminIds: z.array(z.string()),
  }),
});

async function verifyOrgAdmin(userId: string, organizationId: string): Promise<boolean> {
  const userRoles = await storage.getUserRoles(userId);
  return userRoles.some(
    (role: any) => role.organizationId === organizationId && role.role === 'org_admin'
  );
}

async function verifyOrgTeacherOrAdmin(userId: string, organizationId: string): Promise<boolean> {
  const userRoles = await storage.getUserRoles(userId);
  return userRoles.some(
    (role: any) => role.organizationId === organizationId && 
      ['org_admin', 'teacher', 'instructor'].includes(role.role)
  );
}

async function canAccessOrganizationFromSession(req: Request, organizationId: string): Promise<boolean> {
  if (!req.session?.userId || !organizationId) {
    return false;
  }

  const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
  const context = req.session.context;

  if (context) {
    const hasPlatformWideAccess =
      context.effectiveRole === 'SuperAdmin' || context.effectiveRole === 'CustSuper';

    if (hasPlatformWideAccess && context.impersonatedOrganization) {
      return context.impersonatedOrganization.orgId === organizationId;
    }

    if (hasPlatformWideAccess && !context.impersonatedOrganization) {
      return true;
    }

    return effectiveOrg.organizationId === organizationId;
  }

  const userRoles = await storage.getUserRoles(req.session.userId, organizationId);
  return userRoles.length > 0;
}

async function hasOrgAdminWriteAccess(req: Request, organizationId: string): Promise<boolean> {
  if (!req.session?.userId || !organizationId) {
    return false;
  }

  const context = req.session.context;
  if (context) {
    const hasPlatformWideAccess =
      context.effectiveRole === 'SuperAdmin' || context.effectiveRole === 'CustSuper';

    if (hasPlatformWideAccess && context.impersonatedOrganization) {
      return context.impersonatedOrganization.orgId === organizationId;
    }

    if (hasPlatformWideAccess && !context.impersonatedOrganization) {
      return true;
    }
  }

  const userRoles = await storage.getUserRoles(req.session.userId);
  return userRoles.some((role: any) =>
    role.organizationId === organizationId && ADMIN_ROLES.includes(role.role)
  );
}

async function hasOrgTeacherOrAdminAccess(req: Request, organizationId: string): Promise<boolean> {
  const hasOrgAccess = await canAccessOrganizationFromSession(req, organizationId);
  if (!hasOrgAccess) {
    return false;
  }

  const userId = req.session?.userId;
  if (!userId) {
    return false;
  }

  const context = req.session?.context;
  if (context) {
    const hasPlatformWideAccess =
      context.effectiveRole === 'SuperAdmin' || context.effectiveRole === 'CustSuper';
    if (hasPlatformWideAccess) {
      return true;
    }
  }

  return verifyOrgTeacherOrAdmin(userId, organizationId);
}

async function hasOrgMemberAccess(req: Request, organizationId: string): Promise<boolean> {
  return canAccessOrganizationFromSession(req, organizationId);
}

export function registerOrgRoutes(app: any) {
  // ===== ORGANIZATION SELF-REGISTRATION (PUBLIC) =====
  app.post("/api/org/register", async (req: Request, res: Response) => {
    try {
      const validatedData = orgRegistrationSchema.parse(req.body);
      
      const {
        firstName,
        lastName,
        email,
        password,
        gamerName,
        positionAtOrg,
        orgName,
        streetAddress,
        city,
        province,
        postalCode,
        country,
        contactPhone,
        studentCount,
        howHeardAboutUs,
        organizationType,
        selectedGrades,
        gradeSubjects,
        selectedDepartments,
        departmentUnits,
        courseThemes,
      } = validatedData;

      const onPremMode = process.env.ONPREM_MODE === 'true';
      let existingOrgCount = 0;
      let canAssignCustSuperForCreator = false;
      if (onPremMode) {
        const allOrgs = await storage.getAllOrganizations();
        existingOrgCount = allOrgs.length;
        await enforceOrganizationCreatePolicy(existingOrgCount);
        await enforcePlatformRolePolicy({ assignCustSuper: true });
        canAssignCustSuperForCreator = true;
      }

      const existingUserByEmail = await storage.getUserByEmail(email);
      if (existingUserByEmail) {
        return res.status(400).json({ error: "Email already registered" });
      }

      const existingUserByGamerName = await storage.getUserByGamerName(gamerName);
      if (existingUserByGamerName) {
        return res.status(400).json({ error: "Gamer name already taken" });
      }

      const result = await db.transaction(async (tx) => {
        const hashedPassword = await bcrypt.hash(password, 10);

        const assignCustSuper = onPremMode && canAssignCustSuperForCreator;
        const [user] = await tx.insert(users).values({
          firstName,
          lastName,
          email,
          password: hashedPassword,
          gamerName,
          positionAtOrg,
          isSuperAdmin: false,
          isCustSuper: assignCustSuper,
        }).returning();

        let orgJoinCode = generateOrgCode(orgName);
        let existingOrg = await storage.getOrganizationByInviteCode(orgJoinCode);
        let attempt = 1;
        while (existingOrg && attempt < 10) {
          orgJoinCode = generateOrgCode(orgName + attempt);
          existingOrg = await storage.getOrganizationByInviteCode(orgJoinCode);
          attempt++;
        }

        if (existingOrg) {
          throw new Error("Failed to generate unique organization code");
        }

        const trialStartDate = new Date();
        const trialEndDate = new Date();
        trialEndDate.setDate(trialEndDate.getDate() + 30);

        const orgValues = {
          name: orgName,
          type: organizationType as 'education' | 'business' | 'elearning',
          inviteCode: orgJoinCode,
          streetAddress,
          city,
          province,
          postalCode,
          country: country || 'South Africa',
          contactPhone,
          studentCount,
          howHeardAboutUs,
          trialStartDate,
          trialEndDate,
          isTrialActive: true,
          subscriptionStatus: 'trial' as const,
          trialGammaUserId: user.id,
          trialCreditsAwarded: false,
          orgCreditWallet: onPremMode ? 20000 : 0,
          useOrgCreditWallet: true,
          allowTeachersToSpendCredits: true,
          ...(process.env.ONPREM_MODE === 'true' ? { isDemo: true } : {}),
        };
        
        const [organization] = await tx.insert(organizations).values(orgValues).returning();

        // Always make the org creator an org_admin of the newly created organization.
        await tx.insert(userOrganizationRoles).values({
          userId: user.id,
          organizationId: organization.id,
          role: 'org_admin',
        });

        const gradeJoinCodes: { grade: number; joinCode: string }[] = [];
        const classJoinCodes: { grade: number; className: string; joinCode: string }[] = [];
        const departmentJoinCodes: { department: string; joinCode: string }[] = [];
        const teamJoinCodes: { department: string; teamName: string; joinCode: string }[] = [];

        if (organizationType === 'education' && selectedGrades) {
          for (const grade of selectedGrades) {
            const gradeCode = `${orgJoinCode}_G${grade}`;
            gradeJoinCodes.push({ grade, joinCode: gradeCode });

            const [gradeUnit] = await tx.insert(organizationUnits).values({
              organizationId: organization.id,
              name: `Grade ${grade}`,
              joinCode: gradeCode,
              displayOrder: grade,
            }).returning();

            const classCode = `${orgJoinCode}_G${grade}_A`;
            classJoinCodes.push({ grade, className: 'Class A', joinCode: classCode });

            await tx.insert(organizationSubUnits).values({
              unitId: gradeUnit.id,
              name: 'Class A',
              joinCode: classCode,
              displayOrder: 1,
            });

            const subjectNames = gradeSubjects?.[grade.toString()] || [];
            for (const subjectName of subjectNames) {
              const [subject] = await tx.insert(subjects).values({
                organizationId: organization.id,
                unitId: gradeUnit.id,
                name: subjectName,
                createdBy: user.id,
              }).returning();

              await tx.insert(unitSubjects).values({
                unitId: gradeUnit.id,
                subjectId: subject.id,
              });
            }
          }
        } else if (organizationType === 'business' && selectedDepartments) {
          const userSelectedDepartments = selectedDepartments.filter(id => id !== 'general');
          
          for (const departmentId of userSelectedDepartments) {
            const departmentDef = BUSINESS_DEPARTMENTS.find(d => d.id === departmentId);
            if (!departmentDef) continue;

            const departmentJoinCode = `${orgJoinCode}_${departmentDef.id.toUpperCase()}`;
            departmentJoinCodes.push({ department: departmentDef.name, joinCode: departmentJoinCode });

            const [departmentUnit] = await tx.insert(organizationUnits).values({
              organizationId: organization.id,
              name: departmentDef.name,
              joinCode: departmentJoinCode,
              displayOrder: BUSINESS_DEPARTMENTS.indexOf(departmentDef) + 1,
            }).returning();

            const teamJoinCode = `${orgJoinCode}_${departmentDef.id.toUpperCase()}_TA`;
            teamJoinCodes.push({ department: departmentDef.name, teamName: 'Team A', joinCode: teamJoinCode });

            await tx.insert(organizationSubUnits).values({
              unitId: departmentUnit.id,
              name: 'Team A',
              joinCode: teamJoinCode,
              displayOrder: 1,
            });

            const departmentKey = departmentDef.id;
            const unitNames = departmentUnits?.[departmentKey] || [];
            const validUnits = unitNames.filter(name => 
              departmentDef.units.includes(name)
            );

            for (const unitName of validUnits) {
              const [subject] = await tx.insert(subjects).values({
                organizationId: organization.id,
                unitId: departmentUnit.id,
                name: unitName,
                createdBy: user.id,
              }).returning();

              await tx.insert(unitSubjects).values({
                unitId: departmentUnit.id,
                subjectId: subject.id,
              });
            }
          }
        }

        const generalDef = BUSINESS_DEPARTMENTS.find(d => d.id === 'general');
        if (generalDef) {
          const generalJoinCode = `${orgJoinCode}_GENERAL`;
          
          const [generalUnit] = await tx.insert(organizationUnits).values({
            organizationId: organization.id,
            name: 'General',
            joinCode: generalJoinCode,
            displayOrder: 0,
          }).returning();

          if (organizationType === 'business') {
            const allLearnersJoinCode = `${orgJoinCode}_GENERAL_AL`;
            await tx.insert(organizationSubUnits).values({
              unitId: generalUnit.id,
              name: 'All Learners',
              joinCode: allLearnersJoinCode,
              displayOrder: 1,
            });

            departmentJoinCodes.unshift({ department: 'General', joinCode: generalJoinCode });
            teamJoinCodes.unshift({ department: 'General', teamName: 'All Learners', joinCode: allLearnersJoinCode });

            for (const unitName of generalDef.units) {
              const [subject] = await tx.insert(subjects).values({
                organizationId: organization.id,
                unitId: generalUnit.id,
                name: unitName,
                createdBy: user.id,
              }).returning();

              await tx.insert(unitSubjects).values({
                unitId: generalUnit.id,
                subjectId: subject.id,
              });
            }
          } else {
            const allClassesJoinCode = `${orgJoinCode}_GENERAL_AC`;
            await tx.insert(organizationSubUnits).values({
              unitId: generalUnit.id,
              name: 'All Classes',
              joinCode: allClassesJoinCode,
              displayOrder: 1,
            });

            gradeJoinCodes.unshift({ grade: 0, joinCode: generalJoinCode });
            classJoinCodes.unshift({ grade: 0, className: 'All Classes', joinCode: allClassesJoinCode });
          }
        }

        await tx.insert(organizationUnits).values({
          organizationId: organization.id,
          name: 'Public',
          joinCode: `${orgJoinCode}_PUBLIC`,
          displayOrder: 9999,
          isActive: true,
        }).onConflictDoNothing();

        await tx.execute(sql`
          INSERT INTO "organizationUsageLimits" ("organizationId", "dailyQuizCount", "aiExplanationCount", "concurrentUsers")
          VALUES (${organization.id}, 0, 0, 0)
        `);

        return {
          user,
          organization,
          gradeJoinCodes,
          classJoinCodes,
          departmentJoinCodes,
          teamJoinCodes,
        };
      });

      req.session.userId = result.user.id;
      req.session.user = { 
        id: result.user.id, 
        gamerName: result.user.gamerName, 
        email: result.user.email 
      };

      if (isFeatureEnabled('SESSION_AUTH_ENABLED')) {
        try {
          const sessionContext = await SessionContextService.buildSessionContext(result.user.id);
          req.session.context = sessionContext;
          console.log(`[OrgRegistration] Session context populated for new user ${result.user.id}, org: ${result.organization.id}`);
        } catch (ctxError) {
          console.error('[OrgRegistration] Failed to build session context:', ctxError);
        }
      }

      try {
        const sendDecision = await EmailVerificationService.shouldSendVerificationEmail(result.user.id, result.user.email);
        if (!sendDecision.shouldSend) {
          console.log(
            `[OrgRegistration] Skipping duplicate verification email for ${maskEmail(result.user.email)} (reason=${sendDecision.reason})`,
          );
        } else {
          const verificationToken = await EmailVerificationService.createVerificationToken(result.user.id);
          if (verificationToken) {
            const baseUrl = getBaseUrl();
            const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}`;
            
            await MailerSendService.sendEmailVerificationEmail({
              to: result.user.email,
              userName: result.user.firstName || result.user.gamerName,
              verificationUrl,
              expiresIn: '24 hours',
              organizationId: result.organization.id
            });
            console.log(`[OrgRegistration] Verification email sent to ${maskEmail(result.user.email)}`);
          }
        }
      } catch (emailError) {
        console.error('[OrgRegistration] Failed to send verification email:', emailError);
      }

      const responseData: any = {
        success: true,
        message: "Organization created successfully",
        organizationId: result.organization.id,
        organizationType: result.organization.type,
        orgJoinCode: result.organization.inviteCode,
        trialEndDate: result.organization.trialEndDate,
        user: {
          id: result.user.id,
          gamerName: result.user.gamerName,
          email: result.user.email,
        },
      };

      if (result.organization.type === 'education') {
        responseData.gradeJoinCodes = result.gradeJoinCodes;
        responseData.classJoinCodes = result.classJoinCodes;
      } else if (result.organization.type === 'business') {
        responseData.departmentJoinCodes = result.departmentJoinCodes;
        responseData.teamJoinCodes = result.teamJoinCodes;
      }

      res.status(201).json(responseData);

    } catch (error) {
      if (error instanceof OnpremLicensePolicyError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      console.error("Organization registration error:", error);
      res.status(500).json({ 
        error: "Failed to create organization", 
        details: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // ===== GET CURRENT ORGANIZATION =====
  app.get("/api/organizations/current", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const organizationId = getEffectiveOrganizationId(req.session);
      if (!organizationId) {
        return res.status(404).json({ error: "No organization context" });
      }
      
      const org = await storage.getOrganization(organizationId);
      if (!org) {
        return res.status(404).json({ error: "Organization not found" });
      }
      
      res.json({
        id: org.id,
        name: org.name,
        type: org.type || 'education'
      });
    } catch (error) {
      console.error("Get current organization error:", error);
      res.status(500).json({ error: "Failed to get organization" });
    }
  });

  // ==================== ORGANIZATION CREDIT WALLET ROUTES ====================
  
  app.get("/api/org-wallet/:organizationId/balance", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const { organizationId } = req.params;
      const userId = req.session.userId;

      const canView = await OrganizationCreditService.canViewOrgCreditsReadOnly(userId, organizationId);
      if (!canView) {
        return res.status(403).json({ error: "Not authorized to view organization credits" });
      }

      const balance = await OrganizationCreditService.getBalance(organizationId);
      const isEnabled = await OrganizationCreditService.isOrgWalletEnabled(organizationId);

      const [org] = await db
        .select({
          name: organizations.name,
          allowTeachersToSpendCredits: organizations.allowTeachersToSpendCredits,
          useOrgCreditWallet: organizations.useOrgCreditWallet,
        })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);

      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.json({
        organizationId,
        organizationName: org?.name || "Unknown",
        balance,
        isEnabled,
        allowTeachersToSpendCredits: org?.allowTeachersToSpendCredits ?? false,
      });
    } catch (error: any) {
      console.error("[Org Wallet] Error fetching balance:", error);
      res.status(500).json({ error: "Failed to fetch organization credit balance" });
    }
  });

  app.get("/api/org-wallet/:organizationId/transactions", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const { organizationId } = req.params;
      const userId = req.session.userId;
      const { 
        limit = "50", 
        offset = "0", 
        startDate, 
        endDate, 
        actorUserId: filterActorUserId, 
        activityType, 
        transactionType 
      } = req.query;

      const canView = await OrganizationCreditService.canViewOrgCredits(userId, organizationId);
      if (!canView) {
        return res.status(403).json({ error: "Not authorized to view organization credit history" });
      }

      const result = await OrganizationCreditService.getTransactionHistoryWithUserDetails({
        organizationId,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        actorUserId: filterActorUserId as string | undefined,
        activityType: activityType as any,
        transactionType: transactionType as any,
      });

      res.json(result);
    } catch (error: any) {
      console.error("[Org Wallet] Error fetching transactions:", error);
      res.status(500).json({ error: "Failed to fetch organization credit transactions" });
    }
  });

  app.get("/api/org-wallet/:organizationId/summary", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const { organizationId } = req.params;
      const userId = req.session.userId;
      const { startDate, endDate } = req.query;

      const canView = await OrganizationCreditService.canViewOrgCredits(userId, organizationId);
      if (!canView) {
        return res.status(403).json({ error: "Not authorized to view organization credit summary" });
      }

      const startDateParsed = startDate ? new Date(startDate as string) : undefined;
      const endDateParsed = endDate ? new Date(endDate as string) : undefined;

      const summary = await OrganizationCreditService.getCreditSummary(
        organizationId,
        startDateParsed,
        endDateParsed
      );

      res.json(summary);
    } catch (error: any) {
      console.error("[Org Wallet] Error fetching summary:", error);
      res.status(500).json({ error: "Failed to fetch organization credit summary" });
    }
  });

  app.get("/api/org-wallet/:organizationId/combined-transactions", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const { organizationId } = req.params;
      const userId = req.session.userId;
      const { 
        limit = "50", 
        offset = "0", 
        startDate, 
        endDate, 
        actorUserId: filterActorUserId,
        activityType,
        source = "all"
      } = req.query;

      const canView = await OrganizationCreditService.canViewOrgCredits(userId, organizationId);
      if (!canView) {
        return res.status(403).json({ error: "Not authorized to view organization credit history" });
      }

      const limitNum = parseInt(limit as string);
      const offsetNum = parseInt(offset as string);
      const startDateParsed = startDate ? new Date(startDate as string) : undefined;
      const endDateParsed = endDate ? new Date(endDate as string) : undefined;

      const orgMembers = await db
        .select({ memberId: userOrganizationRoles.userId })
        .from(userOrganizationRoles)
        .where(eq(userOrganizationRoles.organizationId, organizationId));
      
      const memberIds = orgMembers.map(m => m.memberId);

      let orgTransactions: any[] = [];
      let userTransactions: any[] = [];
      let orgTotal = 0;
      let userTotal = 0;

      if (source === "all" || source === "org") {
        const orgConditions = [eq(schema.orgCreditLedger.organizationId, organizationId)];
        if (startDateParsed) orgConditions.push(gte(schema.orgCreditLedger.createdAt, startDateParsed));
        if (endDateParsed) orgConditions.push(lte(schema.orgCreditLedger.createdAt, endDateParsed));
        if (filterActorUserId) orgConditions.push(eq(schema.orgCreditLedger.actorUserId, filterActorUserId as string));
        if (activityType) orgConditions.push(eq(schema.orgCreditLedger.activityType, activityType as any));

        const [orgCountResult] = await db
          .select({ count: sql<number>`count(*)::int`})
          .from(schema.orgCreditLedger)
          .where(and(...orgConditions));
        orgTotal = orgCountResult?.count ?? 0;

        const orgResults = await db
          .select({
            transaction: schema.orgCreditLedger,
            actorUser: { gamerName: users.gamerName, email: users.email }
          })
          .from(schema.orgCreditLedger)
          .leftJoin(users, eq(schema.orgCreditLedger.actorUserId, users.id))
          .where(and(...orgConditions))
          .orderBy(desc(schema.orgCreditLedger.createdAt));

        orgTransactions = orgResults.map(r => ({
          id: r.transaction.id,
          source: 'org' as const,
          userId: r.transaction.actorUserId,
          actorUser: r.actorUser,
          transactionType: r.transaction.transactionType,
          activityType: r.transaction.activityType,
          amount: r.transaction.amount,
          balanceAfter: r.transaction.balanceAfter,
          description: r.transaction.description,
          metadata: r.transaction.metadata,
          createdAt: r.transaction.createdAt,
        }));
      }

      if ((source === "all" || source === "personal") && memberIds.length > 0) {
        const userConditions = [inArray(lpCreditLedger.userId, memberIds)];
        if (startDateParsed) userConditions.push(gte(lpCreditLedger.createdAt, startDateParsed));
        if (endDateParsed) userConditions.push(lte(lpCreditLedger.createdAt, endDateParsed));
        if (filterActorUserId) userConditions.push(eq(lpCreditLedger.userId, filterActorUserId as string));

        if (activityType) {
          const activityToTxType: Record<string, string[]> = {
            lesson_generation: ['deduction'],
            quiz_generation: ['deduction'],
            thumbnail_generation: ['deduction', 'thumbnail_generation'],
            purchase: ['purchase'],
            refund: ['refund'],
            adjustment: ['adjustment'],
            trial_grant: ['trial_grant'],
          };
          const txTypes = activityToTxType[activityType as string];
          if (txTypes && txTypes.length > 0) {
            userConditions.push(inArray(lpCreditLedger.transactionType, txTypes as any));
          }
        }

        const [userCountResult] = await db
          .select({ count: sql<number>`count(*)::int`})
          .from(lpCreditLedger)
          .where(and(...userConditions));
        userTotal = userCountResult?.count ?? 0;

        const userResults = await db
          .select({
            transaction: lpCreditLedger,
            actorUser: { gamerName: users.gamerName, email: users.email }
          })
          .from(lpCreditLedger)
          .leftJoin(users, eq(lpCreditLedger.userId, users.id))
          .where(and(...userConditions))
          .orderBy(desc(lpCreditLedger.createdAt));

        userTransactions = userResults.map(r => ({
          id: r.transaction.id,
          source: 'personal' as const,
          userId: r.transaction.userId,
          actorUser: r.actorUser,
          transactionType: r.transaction.transactionType,
          activityType: r.transaction.transactionType,
          amount: r.transaction.amount,
          balanceAfter: r.transaction.balanceAfter,
          description: r.transaction.description,
          metadata: r.transaction.metadata,
          createdAt: r.transaction.createdAt,
        }));
      }

      const allTransactions = [...orgTransactions, ...userTransactions]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      const total = orgTotal + userTotal;
      const paginatedTransactions = allTransactions.slice(offsetNum, offsetNum + limitNum);

      const lessonIds = new Set<string>();
      const courseIds = new Set<string>();
      const quizIds = new Set<string>();

      for (const tx of paginatedTransactions) {
        const meta = tx.metadata as { lessonId?: string; courseId?: string; quizId?: string } | null;
        if (meta?.lessonId) lessonIds.add(meta.lessonId);
        if (meta?.courseId) courseIds.add(meta.courseId);
        if (meta?.quizId) quizIds.add(meta.quizId);
      }

      const lessonMap = new Map<string, string>();
      const courseMap = new Map<string, string>();
      const quizMap = new Map<string, string>();

      if (lessonIds.size > 0) {
        const lessonRows = await db
          .select({ id: lessons.id, title: lessons.title })
          .from(lessons)
          .where(inArray(lessons.id, Array.from(lessonIds)));
        for (const row of lessonRows) {
          lessonMap.set(row.id, row.title);
        }
      }

      if (courseIds.size > 0) {
        const courseRows = await db
          .select({ id: schema.courses.id, title: schema.courses.title })
          .from(schema.courses)
          .where(inArray(schema.courses.id, Array.from(courseIds)));
        for (const row of courseRows) {
          courseMap.set(row.id, row.title);
        }
      }

      if (quizIds.size > 0) {
        const quizRows = await db
          .select({ id: quizCollections.id, name: quizCollections.name })
          .from(quizCollections)
          .where(inArray(quizCollections.id, Array.from(quizIds)));
        for (const row of quizRows) {
          quizMap.set(row.id, row.name);
        }
      }

      const enrichedTransactions = paginatedTransactions.map(tx => {
        const meta = tx.metadata as { lessonId?: string; courseId?: string; quizId?: string } | null;
        return {
          ...tx,
          enrichedDetails: {
            lessonName: meta?.lessonId ? lessonMap.get(meta.lessonId) || null : null,
            courseName: meta?.courseId ? courseMap.get(meta.courseId) || null : null,
            quizName: meta?.quizId ? quizMap.get(meta.quizId) || null : null,
          }
        };
      });

      res.json({
        transactions: enrichedTransactions,
        total,
        hasMore: offsetNum + limitNum < total,
        breakdown: {
          orgTotal,
          userTotal,
        }
      });
    } catch (error: any) {
      console.error("[Org Wallet] Error fetching combined transactions:", error);
      res.status(500).json({ error: "Failed to fetch combined transactions" });
    }
  });

  app.get("/api/org-wallet/:organizationId/combined-summary", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const { organizationId } = req.params;
      const userId = req.session.userId;
      const { startDate, endDate } = req.query;

      const canView = await OrganizationCreditService.canViewOrgCredits(userId, organizationId);
      if (!canView) {
        return res.status(403).json({ error: "Not authorized to view organization credit summary" });
      }

      const startDateParsed = startDate ? new Date(startDate as string) : undefined;
      const endDateParsed = endDate ? new Date(endDate as string) : undefined;

      const orgSummary = await OrganizationCreditService.getCreditSummary(
        organizationId,
        startDateParsed,
        endDateParsed
      );

      const orgMembers = await db
        .select({ memberId: userOrganizationRoles.userId })
        .from(userOrganizationRoles)
        .where(eq(userOrganizationRoles.organizationId, organizationId));
      
      const memberIds = orgMembers.map(m => m.memberId);

      let personalCreditsUsed = 0;
      let personalCreditsAdded = 0;
      let personalTransactionCount = 0;
      let personalTopSpenders: { usrId: string; gamerName: string; totalSpent: number }[] = [];

      if (memberIds.length > 0) {
        const userConditions = [inArray(lpCreditLedger.userId, memberIds)];
        if (startDateParsed) userConditions.push(gte(lpCreditLedger.createdAt, startDateParsed));
        if (endDateParsed) userConditions.push(lte(lpCreditLedger.createdAt, endDateParsed));

        const [personalTotals] = await db
          .select({
            totalAdded: sql<number>`COALESCE(SUM(CASE WHEN "lpCreditLedger"."amount" > 0 THEN "lpCreditLedger"."amount" ELSE 0 END), 0)::int`,
            totalUsed: sql<number>`COALESCE(SUM(CASE WHEN "lpCreditLedger"."amount" < 0 THEN ABS("lpCreditLedger"."amount") ELSE 0 END), 0)::int`,
            transactionCount: sql<number>`COUNT(*)::int`,
          })
          .from(lpCreditLedger)
          .where(and(...userConditions));

        personalCreditsUsed = personalTotals?.totalUsed ?? 0;
        personalCreditsAdded = personalTotals?.totalAdded ?? 0;
        personalTransactionCount = personalTotals?.transactionCount ?? 0;

        const personalSpenders = await db
          .select({
            spenderUserId: lpCreditLedger.userId,
            gamerName: users.gamerName,
            totalSpent: sql<number>`COALESCE(SUM(CASE WHEN "lpCreditLedger"."amount" < 0 THEN ABS("lpCreditLedger"."amount") ELSE 0 END), 0)::int`,
          })
          .from(lpCreditLedger)
          .leftJoin(users, eq(lpCreditLedger.userId, users.id))
          .where(and(...userConditions))
          .groupBy(lpCreditLedger.userId, users.gamerName)
          .orderBy(desc(sql`SUM(CASE WHEN "lpCreditLedger"."amount" < 0 THEN ABS("lpCreditLedger"."amount") ELSE 0 END)`))
          .limit(10);

        personalTopSpenders = personalSpenders.map(s => ({
          usrId: s.spenderUserId,
          gamerName: s.gamerName || 'Unknown',
          totalSpent: s.totalSpent,
        }));
      }

      const combinedTopSpenders = [
        ...orgSummary.topSpenders,
        ...personalTopSpenders.map(s => ({ userId: s.usrId, gamerName: s.gamerName, totalSpent: s.totalSpent }))
      ]
        .reduce((acc, curr) => {
          const existing = acc.find(s => s.userId === curr.userId);
          if (existing) {
            existing.totalSpent += curr.totalSpent;
          } else {
            acc.push({ ...curr });
          }
          return acc;
        }, [] as { userId: string; gamerName: string; totalSpent: number }[])
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 10);

      res.json({
        currentBalance: orgSummary.currentBalance,
        orgCreditsAdded: orgSummary.totalCreditsAdded,
        orgCreditsUsed: orgSummary.totalCreditsUsed,
        personalCreditsAdded,
        personalCreditsUsed,
        totalCreditsAdded: orgSummary.totalCreditsAdded + personalCreditsAdded,
        totalCreditsUsed: orgSummary.totalCreditsUsed + personalCreditsUsed,
        orgTransactionCount: orgSummary.transactionCount,
        personalTransactionCount,
        totalTransactionCount: orgSummary.transactionCount + personalTransactionCount,
        topSpenders: combinedTopSpenders,
        activityBreakdown: orgSummary.activityBreakdown,
      });
    } catch (error: any) {
      console.error("[Org Wallet] Error fetching combined summary:", error);
      res.status(500).json({ error: "Failed to fetch combined credit summary" });
    }
  });

  // ==================== SUPERADMIN ORG CREDIT ROUTES ====================

  app.post("/api/admin/org-credits/:organizationId/adjust", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.params;
      const { amount, reason } = req.body;
      const adminUserId = req.session.userId!;

      if (amount === undefined || amount === 0) {
        return res.status(400).json({ error: "amount is required and cannot be zero" });
      }

      if (!reason) {
        return res.status(400).json({ error: "reason is required" });
      }

      const correlationId = `admin_org_adjustment_${organizationId}_${Date.now()}`;

      const result = await OrganizationCreditService.adminAdjustment({
        organizationId,
        amount: parseInt(amount),
        correlationId,
        reason,
        adminUserId,
      });

      console.log(`[Org Wallet] Admin ${adminUserId} adjusted org ${organizationId} credits by ${amount}. Reason: ${reason}`);

      res.json({
        success: true,
        organizationId,
        adjustment: amount,
        reason,
        newBalance: result.newBalance,
        transactionId: result.transactionId,
      });
    } catch (error: any) {
      console.error("[Org Wallet] Error adjusting credits:", error);
      res.status(500).json({ error: error.message || "Failed to adjust organization credits" });
    }
  });

  app.patch("/api/admin/org-credits/:organizationId/settings", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.params;
      const { useOrgCreditWallet, allowTeachersToSpendCredits } = req.body;
      const adminUserId = req.session.userId!;

      const updates: any = { updatedAt: new Date() };

      if (useOrgCreditWallet !== undefined) {
        updates.useOrgCreditWallet = useOrgCreditWallet;
      }

      if (allowTeachersToSpendCredits !== undefined) {
        updates.allowTeachersToSpendCredits = allowTeachersToSpendCredits;
      }

      await db
        .update(organizations)
        .set(updates)
        .where(eq(organizations.id, organizationId));

      const [org] = await db
        .select({
          name: organizations.name,
          useOrgCreditWallet: organizations.useOrgCreditWallet,
          allowTeachersToSpendCredits: organizations.allowTeachersToSpendCredits,
          orgCreditWallet: organizations.orgCreditWallet,
        })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);

      console.log(`[Org Wallet] Admin ${adminUserId} updated org ${organizationId} settings: useOrgCreditWallet=${org?.useOrgCreditWallet}, allowTeachersToSpendCredits=${org?.allowTeachersToSpendCredits}`);

      res.json({
        success: true,
        organizationId,
        name: org?.name,
        useOrgCreditWallet: org?.useOrgCreditWallet,
        allowTeachersToSpendCredits: org?.allowTeachersToSpendCredits,
        orgCreditWallet: org?.orgCreditWallet,
      });
    } catch (error: any) {
      console.error("[Org Wallet] Error updating settings:", error);
      res.status(500).json({ error: "Failed to update organization credit wallet settings" });
    }
  });

  app.get("/api/admin/org-credits", isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
    try {
      const { search, limit = "50", offset = "0" } = req.query;

      let query = db
        .select({
          id: organizations.id,
          name: organizations.name,
          orgCreditWallet: organizations.orgCreditWallet,
          useOrgCreditWallet: organizations.useOrgCreditWallet,
          allowTeachersToSpendCredits: organizations.allowTeachersToSpendCredits,
          subscriptionStatus: organizations.subscriptionStatus,
          isDemo: organizations.isDemo,
          createdAt: organizations.createdAt,
        })
        .from(organizations)
        .$dynamic();

      if (search) {
        query = query.where(sql`${organizations.name} ILIKE ${`%${search}%`}`);
      }

      const orgs = await query
        .orderBy(desc(organizations.createdAt))
        .limit(parseInt(limit as string))
        .offset(parseInt(offset as string));

      res.json({ organizations: orgs });
    } catch (error: any) {
      console.error("[Org Wallet] Error fetching organizations:", error);
      res.status(500).json({ error: "Failed to fetch organizations" });
    }
  });

  // ==================== JOIN REQUESTS ROUTES ====================

  app.get("/api/org/:organizationId/join-requests", isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.params;
      const { status } = req.query;
      
      const requests = await storage.getJoinRequestsByOrganization(
        organizationId, 
        status as string | undefined
      );
      
      const enrichedRequests = await Promise.all(
        requests.map(async (request) => {
          const user = await storage.getUser(request.userId);
          const reviewer = request.reviewedBy ? await storage.getUser(request.reviewedBy) : null;
          const unit = request.requestedUnitId ? await storage.getOrganizationUnit(request.requestedUnitId) : null;
          const subUnit = request.requestedSubUnitId ? await storage.getOrganizationSubUnit(request.requestedSubUnitId) : null;
          
          let requestedSubjects: Array<Awaited<ReturnType<typeof storage.getSubject>>> = [];
          if (request.requestedSubjectIds && request.requestedSubjectIds.length > 0) {
            requestedSubjects = await Promise.all(
              request.requestedSubjectIds.map(async (subjectId) => {
                const subject = await storage.getSubject(subjectId);
                return subject;
              })
            );
            requestedSubjects = requestedSubjects.filter(s => s !== undefined);
          }
          
          return {
            ...request,
            user: user ? {
              id: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              gamerName: user.gamerName
            } : null,
            reviewedByUser: reviewer ? {
              id: reviewer.id,
              firstName: reviewer.firstName,
              lastName: reviewer.lastName,
              gamerName: reviewer.gamerName
            } : null,
            requestedUnit: unit,
            requestedSubUnit: subUnit,
            requestedSubjects
          };
        })
      );
      
      res.json(enrichedRequests);
    } catch (error) {
      console.error("Get join requests error:", error);
      res.status(500).json({ error: "Failed to retrieve join requests" });
    }
  });

  app.get("/api/org/:organizationId/join-requests/pending-count", isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.params;
      const count = await storage.getPendingJoinRequestCount(organizationId);
      res.json({ count });
    } catch (error) {
      console.error("Get pending count error:", error);
      res.status(500).json({ error: "Failed to get pending count" });
    }
  });

  app.get("/api/org/join-requests/approve-via-token/:token", async (req: Request, res: Response) => {
    const baseUrl = getBaseUrl();
    return res.redirect(`${baseUrl}/join-requests`);
  });

  app.post("/api/org/join-requests/:id/approve", validateJoinRequestAccess, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const reviewerId = req.session.userId!;
      
      const validation = approveJoinRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validation.error.format() 
        });
      }
      
      const { unitId, subUnitId, teamId, subjectIds } = validation.data;
      
      console.log('=== BACKEND APPROVAL STARTED ===');
      console.log('Request body:', { unitId, subUnitId, teamId, subjectIds });
      
      const joinRequest = req.joinRequest!;
      console.log('Join request from DB:', {
        id: joinRequest.id,
        userId: joinRequest.userId,
        requestedUnitId: joinRequest.requestedUnitId,
        requestedSubUnitId: joinRequest.requestedSubUnitId,
        requestedSubjectIds: joinRequest.requestedSubjectIds
      });
      
      const finalUnitId = unitId || joinRequest.requestedUnitId;
      const finalSubUnitId = subUnitId || joinRequest.requestedSubUnitId;
      const finalTeamId = teamId || joinRequest.requestedTeamId;
      let finalSubjectIds = (subjectIds && subjectIds.length > 0) ? subjectIds : (joinRequest.requestedSubjectIds || []);
      console.log('Final assignments before validation:', { finalUnitId, finalSubUnitId, finalTeamId, finalSubjectIds });
      
      if (finalSubjectIds.length > 0) {
        const allSubjects = await storage.getSubjects(joinRequest.organizationId);
        const validSubjectIds = new Set(allSubjects.map(s => s.id));
        const originalCount = finalSubjectIds.length;
        finalSubjectIds = finalSubjectIds.filter((id: string) => validSubjectIds.has(id));
        
        if (finalSubjectIds.length < originalCount) {
          console.warn(`Filtered out ${originalCount - finalSubjectIds.length} invalid subject IDs from join request ${id}`);
        }
      }
      console.log('Final subject IDs after validation:', finalSubjectIds);

      await validateUnitSubjectAssignments({
        unitId: finalUnitId,
        subjectIds: finalSubjectIds,
      });
      
      const updatedRequest = await storage.approveJoinRequest(id, reviewerId, {
        unitId: finalUnitId ?? undefined,
        subUnitId: finalSubUnitId ?? undefined,
        teamId: finalTeamId ?? undefined,
        subjectIds: finalSubjectIds
      });
      
      if (!updatedRequest) {
        return res.status(500).json({ error: "Failed to approve request" });
      }
      
      const organization = await storage.getOrganization(joinRequest.organizationId);
      const defaultRole = await getDefaultRoleForApprovedJoinRequest(organization?.type);
      
      const existingRoles = await storage.getUserRoles(joinRequest.userId);
      const otherOrgIds = [...new Set(existingRoles.filter((r: any) => r.organizationId !== joinRequest.organizationId).map((r: any) => r.organizationId))];
      for (const oldOrgId of otherOrgIds) {
        await storage.removeAllUserRolesInOrg(joinRequest.userId, oldOrgId);
        await storage.removeAllUserAssignmentsInOrg(joinRequest.userId, oldOrgId);
        console.log(`[Join Approval] Removed user ${joinRequest.userId} from org ${oldOrgId} (single-org enforcement)`);
      }
      
      await db.update(joinRequests)
        .set({ status: 'cancelled' })
        .where(
          and(
            eq(joinRequests.userId, joinRequest.userId),
            eq(joinRequests.status, 'pending')
          )
        );
      
      await storage.assignUserRole(joinRequest.userId, joinRequest.organizationId, defaultRole);
      
      await SessionInvalidationService.invalidateUserSessions(
        joinRequest.userId,
        `Join request approved - joined ${organization?.name || 'organization'}`
      );
      
      if (finalUnitId) {
        if (finalSubjectIds.length > 0) {
          console.log('Creating subject assignments with assignSubjectsToUser:', {
            userId: joinRequest.userId,
            organizationId: joinRequest.organizationId,
            unitId: finalUnitId,
            subUnitId: finalSubUnitId,
            teamId: finalTeamId,
            subjectIds: finalSubjectIds
          });
          await storage.assignSubjectsToUser(
            joinRequest.userId,
            joinRequest.organizationId,
            finalUnitId,
            finalSubUnitId || undefined,
            finalSubjectIds
          );
        } else {
          await storage.assignUserToUnit(
            joinRequest.userId,
            joinRequest.organizationId,
            finalUnitId,
            finalSubUnitId || undefined,
            finalTeamId || undefined
          );
        }
      }
      console.log('=== BACKEND APPROVAL COMPLETE ===');
      
      res.json({ 
        message: "Join request approved successfully", 
        request: updatedRequest 
      });
    } catch (error) {
      if (error instanceof OnpremLicensePolicyError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      console.error("Approve join request error:", error);
      res.status(500).json({ error: "Failed to approve request" });
    }
  });

  app.post("/api/org/join-requests/:id/deny", validateJoinRequestAccess, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const reviewerId = req.session.userId!;
      
      const validation = denyJoinRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validation.error.format() 
        });
      }
      
      const { reason } = validation.data;
      
      const joinRequest = req.joinRequest!;
      
      const updatedRequest = await storage.denyJoinRequest(id, reviewerId, reason);
      
      if (!updatedRequest) {
        return res.status(500).json({ error: "Failed to deny request" });
      }
      
      res.json({ 
        message: "Join request denied", 
        request: updatedRequest 
      });
    } catch (error) {
      console.error("Deny join request error:", error);
      res.status(500).json({ error: "Failed to deny request" });
    }
  });

  app.post("/api/org/join-requests/bulk-approve", isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const reviewerId = req.session.userId!;
      
      const validation = bulkApproveJoinRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validation.error.format() 
        });
      }
      
      const { requestIds } = validation.data;
      
      const results = [];
      const errors = [];
      
      for (const requestId of requestIds) {
        try {
          const joinRequest = await storage.getJoinRequest(requestId);
          if (!joinRequest) {
            errors.push({ requestId, error: "Request not found" });
            continue;
          }
          
          let finalSubjectIds = joinRequest.requestedSubjectIds || [];
          if (finalSubjectIds.length > 0) {
            const allSubjects = await storage.getSubjects(joinRequest.organizationId);
            const validSubjectIds = new Set(allSubjects.map(s => s.id));
            const originalCount = finalSubjectIds.length;
            finalSubjectIds = finalSubjectIds.filter((id: string) => validSubjectIds.has(id));
            
            if (finalSubjectIds.length < originalCount) {
              console.warn(`Filtered out ${originalCount - finalSubjectIds.length} invalid subject IDs from join request ${requestId}`);
            }
          }

          await validateUnitSubjectAssignments({
            unitId: joinRequest.requestedUnitId,
            subjectIds: finalSubjectIds,
          });
          
          const updatedRequest = await storage.approveJoinRequest(requestId, reviewerId, {
            unitId: joinRequest.requestedUnitId || undefined,
            subUnitId: joinRequest.requestedSubUnitId || undefined,
            teamId: joinRequest.requestedTeamId || undefined,
            subjectIds: finalSubjectIds
          });
          
          if (!updatedRequest) {
            errors.push({ requestId, error: "Failed to approve" });
            continue;
          }
          
          const organization = await storage.getOrganization(joinRequest.organizationId);
          const defaultRole = await getDefaultRoleForApprovedJoinRequest(organization?.type);
          
          const existingRoles = await storage.getUserRoles(joinRequest.userId);
          const otherOrgIds = [...new Set(existingRoles.filter((r: any) => r.organizationId !== joinRequest.organizationId).map((r: any) => r.organizationId))];
          for (const oldOrgId of otherOrgIds) {
            await storage.removeAllUserRolesInOrg(joinRequest.userId, oldOrgId);
            await storage.removeAllUserAssignmentsInOrg(joinRequest.userId, oldOrgId);
            console.log(`[Bulk Join Approval] Removed user ${joinRequest.userId} from org ${oldOrgId} (single-org enforcement)`);
          }
          
          await db.update(joinRequests)
            .set({ status: 'cancelled' })
            .where(
              and(
                eq(joinRequests.userId, joinRequest.userId),
                eq(joinRequests.status, 'pending')
              )
            );
          
          await storage.assignUserRole(joinRequest.userId, joinRequest.organizationId, defaultRole);
          
          await SessionInvalidationService.invalidateUserSessions(
            joinRequest.userId,
            `Bulk join request approved - joined ${organization?.name || 'organization'}`
          );
          
          if (joinRequest.requestedUnitId) {
            if (finalSubjectIds.length > 0) {
              await storage.assignSubjectsToUser(
                joinRequest.userId,
                joinRequest.organizationId,
                joinRequest.requestedUnitId,
                joinRequest.requestedSubUnitId || undefined,
                finalSubjectIds
              );
            } else {
              await storage.assignUserToUnit(
                joinRequest.userId,
                joinRequest.organizationId,
                joinRequest.requestedUnitId,
                joinRequest.requestedSubUnitId || undefined,
                joinRequest.requestedTeamId || undefined
              );
            }
          }
          
          results.push({ requestId, success: true });
        } catch (error) {
          console.error(`Error approving request ${requestId}:`, error);
          errors.push({ requestId, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }
      
      res.json({ 
        message: `${results.length} request(s) approved successfully`,
        approved: results.length,
        failed: errors.length,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      console.error("Bulk approve error:", error);
      res.status(500).json({ error: "Failed to approve requests" });
    }
  });

  app.post("/api/org/join-requests/bulk-deny", isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const reviewerId = req.session.userId!;
      
      const validation = bulkDenyJoinRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validation.error.format() 
        });
      }
      
      const { requestIds, reason } = validation.data;
      
      const results = [];
      const errors = [];
      
      for (const requestId of requestIds) {
        try {
          const updatedRequest = await storage.denyJoinRequest(requestId, reviewerId, reason);
          
          if (!updatedRequest) {
            errors.push({ requestId, error: "Request not found" });
            continue;
          }
          
          results.push({ requestId, success: true });
        } catch (error) {
          console.error(`Error denying request ${requestId}:`, error);
          errors.push({ requestId, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }
      
      res.json({ 
        message: `${results.length} request(s) denied`,
        denied: results.length,
        failed: errors.length,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      console.error("Bulk deny error:", error);
      res.status(500).json({ error: "Failed to deny requests" });
    }
  });

  // ==================== PACKAGE SUBSCRIPTION MANAGEMENT ====================

  // GET /api/organizations/:id/eligible-packages - Get packages org can subscribe to
  app.get("/api/organizations/:id/eligible-packages", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const { id: organizationId } = req.params;
      const userId = req.session.userId;

      const isOrgAdmin = await verifyOrgAdmin(userId, organizationId);
      if (!isOrgAdmin) {
        return res.status(403).json({ error: "Not authorized - org admin role required" });
      }

      const org = await storage.getOrganization(organizationId);
      if (!org) {
        return res.status(404).json({ error: "Organization not found" });
      }

      const currency = (req.query.currency as string) || org.currency || 'ZAR';

      const eligiblePackages = await businessPackageService.getEligiblePackagesForOrg(organizationId, currency);

      const [currentAssignment] = await db
        .select()
        .from(organizationPackageAssignments)
        .where(eq(organizationPackageAssignments.organizationId, organizationId))
        .limit(1);

      res.json({
        packages: eligiblePackages,
        currentAssignment: currentAssignment || null,
        currency,
      });
    } catch (error: any) {
      console.error("[OrgSubscription] Error fetching eligible packages:", error);
      res.status(500).json({ error: "Failed to fetch eligible packages" });
    }
  });

  // GET /api/organizations/:id/subscription - Get current subscription
  app.get("/api/organizations/:id/subscription", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const { id: organizationId } = req.params;
      const userId = req.session.userId;

      const isOrgAdmin = await verifyOrgAdmin(userId, organizationId);
      if (!isOrgAdmin) {
        return res.status(403).json({ error: "Not authorized - org admin role required" });
      }

      const [assignment] = await db
        .select()
        .from(organizationPackageAssignments)
        .where(eq(organizationPackageAssignments.organizationId, organizationId))
        .limit(1);

      if (!assignment) {
        return res.json({ subscription: null });
      }

      const pkg = await businessPackageService.getPackageById(assignment.packageId);
      const price = await businessPackageService.getPackagePrice(assignment.packageId, assignment.currency);

      let scheduledPackage = null;
      if (assignment.scheduledPackageId) {
        scheduledPackage = await businessPackageService.getPackageById(assignment.scheduledPackageId);
      }

      res.json({
        subscription: {
          ...assignment,
          package: pkg,
          pricing: price,
          scheduledPackage,
        },
      });
    } catch (error: any) {
      console.error("[OrgSubscription] Error fetching subscription:", error);
      res.status(500).json({ error: "Failed to fetch subscription details" });
    }
  });

  // POST /api/organizations/:id/subscribe - Create new subscription
  app.post("/api/organizations/:id/subscribe", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const { id: organizationId } = req.params;
      const userId = req.session.userId;

      const isOrgAdmin = await verifyOrgAdmin(userId, organizationId);
      if (!isOrgAdmin) {
        return res.status(403).json({ error: "Not authorized - org admin role required" });
      }

      const validatedData = subscribeSchema.parse(req.body);
      const { packageId, interval, currency } = validatedData;

      const eligibility = await businessPackageService.checkPackageEligibility(organizationId, packageId);
      if (!eligibility.eligible) {
        return res.status(400).json({
          error: "Not eligible for this package",
          issues: eligibility.issues,
        });
      }

      const [existingAssignment] = await db
        .select()
        .from(organizationPackageAssignments)
        .where(eq(organizationPackageAssignments.organizationId, organizationId))
        .limit(1);

      if (existingAssignment) {
        return res.status(400).json({
          error: "Organization already has an active subscription. Use upgrade or downgrade endpoints.",
        });
      }

      const assignment = await packageBillingService.createSubscription(
        organizationId,
        packageId,
        interval,
        currency
      );

      await businessPackageService.logPackageChange(
        'org_subscribed',
        packageId,
        organizationId,
        null,
        { packageId, interval, currency },
        userId
      );

      res.status(201).json({
        success: true,
        subscription: assignment,
      });
    } catch (error: any) {
      console.error("[OrgSubscription] Error creating subscription:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: error.message || "Failed to create subscription" });
    }
  });

  // POST /api/organizations/:id/upgrade - Upgrade package immediately
  app.post("/api/organizations/:id/upgrade", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const { id: organizationId } = req.params;
      const userId = req.session.userId;

      const isOrgAdmin = await verifyOrgAdmin(userId, organizationId);
      if (!isOrgAdmin) {
        return res.status(403).json({ error: "Not authorized - org admin role required" });
      }

      const validatedData = upgradeSchema.parse(req.body);
      const { packageId, paymentId } = validatedData;

      const eligibility = await businessPackageService.checkPackageEligibility(organizationId, packageId);
      if (!eligibility.eligible) {
        return res.status(400).json({
          error: "Not eligible for this package",
          issues: eligibility.issues,
        });
      }

      const proration = await packageBillingService.calculateUpgradeProration(organizationId, packageId);

      const result = await packageBillingService.executeUpgrade(organizationId, packageId, paymentId);

      await businessPackageService.logPackageChange(
        'org_upgraded',
        packageId,
        organizationId,
        { proration },
        { packageId, paymentId, result },
        userId
      );

      res.json({
        success: true,
        assignment: result.assignment,
        proration: result.proration,
        reenableOpportunity: result.reenableOpportunity,
      });
    } catch (error: any) {
      console.error("[OrgSubscription] Error upgrading package:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: error.message || "Failed to upgrade package" });
    }
  });

  // POST /api/organizations/:id/schedule-downgrade - Schedule downgrade for 1st of month
  app.post("/api/organizations/:id/schedule-downgrade", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const { id: organizationId } = req.params;
      const userId = req.session.userId;

      const isOrgAdmin = await verifyOrgAdmin(userId, organizationId);
      if (!isOrgAdmin) {
        return res.status(403).json({ error: "Not authorized - org admin role required" });
      }

      const validatedData = scheduleDowngradeSchema.parse(req.body);
      const { packageId, keepUserIds } = validatedData;

      const allKeepUserIds = [
        ...keepUserIds.learnerIds,
        ...keepUserIds.teacherIds,
        ...keepUserIds.orgAdminIds,
      ];

      const validation = await userSeatManagementService.validateDowngradeSelections(
        organizationId,
        packageId,
        allKeepUserIds
      );

      if (!validation.valid) {
        return res.status(400).json({
          error: "Invalid user selections",
          issues: validation.issues,
        });
      }

      const result = await packageBillingService.scheduleDowngrade(
        organizationId,
        packageId,
        {
          keepLearnerIds: keepUserIds.learnerIds,
          keepTeacherIds: keepUserIds.teacherIds,
          keepOrgAdminIds: keepUserIds.orgAdminIds,
        }
      );

      await businessPackageService.logPackageChange(
        'org_downgrade_scheduled',
        packageId,
        organizationId,
        null,
        { packageId, effectiveDate: result.effectiveDate, keepUserIds },
        userId
      );

      res.json({
        success: true,
        effectiveDate: result.effectiveDate,
        assignment: result.assignment,
      });
    } catch (error: any) {
      console.error("[OrgSubscription] Error scheduling downgrade:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: error.message || "Failed to schedule downgrade" });
    }
  });

  // DELETE /api/organizations/:id/scheduled-downgrade - Cancel scheduled downgrade
  app.delete("/api/organizations/:id/scheduled-downgrade", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const { id: organizationId } = req.params;
      const userId = req.session.userId;

      const isOrgAdmin = await verifyOrgAdmin(userId, organizationId);
      if (!isOrgAdmin) {
        return res.status(403).json({ error: "Not authorized - org admin role required" });
      }

      const success = await packageBillingService.cancelScheduledDowngrade(organizationId);

      if (!success) {
        return res.status(400).json({
          error: "No scheduled downgrade found to cancel",
        });
      }

      await businessPackageService.logPackageChange(
        'org_downgrade_cancelled',
        null,
        organizationId,
        null,
        { cancelledAt: new Date().toISOString() },
        userId
      );

      res.json({
        success: true,
        message: "Scheduled downgrade cancelled successfully",
      });
    } catch (error: any) {
      console.error("[OrgSubscription] Error cancelling scheduled downgrade:", error);
      res.status(500).json({ error: error.message || "Failed to cancel scheduled downgrade" });
    }
  });

  // GET /api/organizations/:id/seat-utilization - Get seat usage stats (uses unified SeatPolicyService)
  app.get("/api/organizations/:id/seat-utilization", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const { id: organizationId } = req.params;
      const userId = req.session.userId;

      const isOrgAdmin = await verifyOrgAdmin(userId, organizationId);
      if (!isOrgAdmin) {
        return res.status(403).json({ error: "Not authorized - org admin role required" });
      }

      const limits = await seatPolicyService.getEffectiveSeatLimits(organizationId);

      const calculatePercentage = (current: number, max: number, isUnlimited: boolean): number => {
        if (isUnlimited || max === 0) return 0;
        return Math.round((current / max) * 100);
      };

      res.json({
        isUnlimited: limits.isUnlimited,
        reason: limits.reason,
        message: limits.message,
        learners: {
          current: limits.learners.current,
          max: limits.isUnlimited ? -1 : limits.learners.max,
          percentage: calculatePercentage(limits.learners.current, limits.learners.max, limits.isUnlimited),
        },
        teachers: {
          current: limits.teachers.current,
          max: limits.isUnlimited ? -1 : limits.teachers.max,
          percentage: calculatePercentage(limits.teachers.current, limits.teachers.max, limits.isUnlimited),
        },
        orgAdmins: {
          current: limits.orgAdmins.current,
          max: limits.isUnlimited ? -1 : limits.orgAdmins.max,
          percentage: calculatePercentage(limits.orgAdmins.current, limits.orgAdmins.max, limits.isUnlimited),
        },
      });
    } catch (error: any) {
      console.error("[OrgSubscription] Error fetching seat utilization:", error);
      res.status(500).json({ error: "Failed to fetch seat utilization" });
    }
  });

  // GET /api/organizations/:id/disabled-users - Get list of disabled users
  app.get("/api/organizations/:id/disabled-users", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const { id: organizationId } = req.params;
      const userId = req.session.userId;

      const isOrgAdmin = await verifyOrgAdmin(userId, organizationId);
      if (!isOrgAdmin) {
        return res.status(403).json({ error: "Not authorized - org admin role required" });
      }

      const disabledUsers = await userSeatManagementService.getDisabledUsers(organizationId);

      res.json({
        disabledUsers,
        count: disabledUsers.length,
      });
    } catch (error: any) {
      console.error("[OrgSubscription] Error fetching disabled users:", error);
      res.status(500).json({ error: "Failed to fetch disabled users" });
    }
  });

  // POST /api/organizations/:id/reenable-users - Re-enable selected users
  app.post("/api/organizations/:id/reenable-users", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const { id: organizationId } = req.params;
      const userId = req.session.userId;

      const isOrgAdmin = await verifyOrgAdmin(userId, organizationId);
      if (!isOrgAdmin) {
        return res.status(403).json({ error: "Not authorized - org admin role required" });
      }

      const { userIds } = req.body;

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: "userIds array is required" });
      }

      const result = await userSeatManagementService.reenableUsersOnUpgrade(
        organizationId,
        userIds,
        userId
      );

      await businessPackageService.logPackageChange(
        'users_reenabled',
        null,
        organizationId,
        null,
        { 
          userIds, 
          enabledCount: result.enabled.filter(e => e.success).length,
          emailsSent: result.emailsSent 
        },
        userId
      );

      res.json({
        success: true,
        enabled: result.enabled,
        emailsSent: result.emailsSent,
      });
    } catch (error: any) {
      console.error("[OrgSubscription] Error re-enabling users:", error);
      res.status(500).json({ error: error.message || "Failed to re-enable users" });
    }
  });

  // GET /api/organizations/:id/downgrade-preview - Preview users to disable
  app.get("/api/organizations/:id/downgrade-preview", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const { id: organizationId } = req.params;
      const { packageId } = req.query;
      const userId = req.session.userId;

      const isOrgAdmin = await verifyOrgAdmin(userId, organizationId);
      if (!isOrgAdmin) {
        return res.status(403).json({ error: "Not authorized - org admin role required" });
      }

      if (!packageId || typeof packageId !== 'string') {
        return res.status(400).json({
          error: "packageId query parameter is required",
        });
      }

      const preview = await userSeatManagementService.getUsersToDisableOnDowngrade(organizationId, packageId);

      res.json(preview);
    } catch (error: any) {
      console.error("[OrgSubscription] Error fetching downgrade preview:", error);
      res.status(500).json({ error: "Failed to fetch downgrade preview" });
    }
  });

  // ==================== BILLING ROUTES ====================

  app.get("/api/org/:organizationId/billing", isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.params;
      const { month, year } = req.query;
      
      const org = await storage.getOrganization(organizationId);
      if (!org) {
        return res.status(404).json({ error: "Organization not found" });
      }
      
      if (org.isDemo) {
        const now = new Date();
        const targetMonth = month !== undefined ? parseInt(month as string) : now.getMonth();
        const targetYear = year !== undefined ? parseInt(year as string) : now.getFullYear();
        const monthStart = new Date(targetYear, targetMonth, 1);
        
        return res.json({
          month: monthStart.toLocaleString('default', { month: 'long' }),
          year: targetYear,
          students: [],
          totalStudents: 0,
          totalCost: 0,
          monthlyRate: 8.99,
          daysInMonth: new Date(targetYear, targetMonth + 1, 0).getDate(),
          isDemo: true,
          message: 'Demo organizations are not billed'
        });
      }
      
      const joinRequests = await storage.getJoinRequestsByOrganization(organizationId, 'approved');
      
      const students = await Promise.all(
        joinRequests
          .filter(jr => jr.approvedAt)
          .map(async (jr) => {
            const user = await storage.getUser(jr.userId);
            return {
              userId: jr.userId,
              approvedAt: jr.approvedAt ? jr.approvedAt.toISOString() : null,
              firstName: user?.firstName || '',
              lastName: user?.lastName || '',
              email: user?.email || '',
            };
          })
      );
      
      const { getCurrentMonthBilling, calculateMonthlyBilling, getPlatformLearnerRate } = await import('../billing');
      
      const monthlyRate = await getPlatformLearnerRate();
      
      let billingReport;
      if (month !== undefined && year !== undefined) {
        billingReport = calculateMonthlyBilling(students, parseInt(month as string), parseInt(year as string), monthlyRate);
      } else {
        billingReport = getCurrentMonthBilling(students, monthlyRate);
      }
      
      res.json(billingReport);
    } catch (error) {
      console.error("Get billing error:", error);
      res.status(500).json({ error: "Failed to retrieve billing information" });
    }
  });

  app.get("/api/org/:organizationId/billing/audit-log", isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.params;
      const { unitId, subjectId, studentName, dateFrom, dateTo, status } = req.query;
      
      const auditLog = await storage.getJoinRequestAuditLog(organizationId, {
        unitId: unitId as string | undefined,
        subjectId: subjectId as string | undefined,
        studentName: studentName as string | undefined,
        dateFrom: dateFrom as string | undefined,
        dateTo: dateTo as string | undefined,
        status: status as string | undefined,
      });
      
      res.json(auditLog);
    } catch (error) {
      console.error("Get billing audit log error:", error);
      res.status(500).json({ error: "Failed to retrieve billing audit log" });
    }
  });

  // ==================== ORGANIZATION UNITS ROUTES ====================

  app.get("/api/organization/units", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.json([]);
      }

      const requestedOrgId = (req.query.organizationId as string | undefined)?.trim() || null;
      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      const organizationId = requestedOrgId || effectiveOrg.organizationId;

      if (!organizationId) {
        return res.status(400).json({
          error: "Organization context required",
          message: "Select an organization (or impersonate one) before loading units",
        });
      }

      const canAccess = await canAccessOrganizationFromSession(req, organizationId);
      if (!canAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      const units = await storage.getOrganizationUnits(organizationId);
      res.json(units.map((u: any) => ({ id: u.id, name: u.name })));
    } catch (error) {
      console.error('Get organization units error:', error);
      res.status(500).json({ error: "Failed to fetch organization units" });
    }
  });

  app.get("/api/organization/sub-units/:unitId", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.json([]);
      }
      
      const unit = await storage.getOrganizationUnit(req.params.unitId);
      if (!unit) {
        return res.status(404).json({ error: "Unit not found" });
      }
      
      const requestedOrgId = (req.query.organizationId as string | undefined)?.trim() || null;
      const organizationId = requestedOrgId || unit.organizationId;
      const canAccess = await canAccessOrganizationFromSession(req, organizationId);
      if (!canAccess || unit.organizationId !== organizationId) {
        return res.status(403).json({ error: "Access denied: Unit belongs to another organization" });
      }

      const subUnits = await storage.getOrganizationSubUnits(req.params.unitId);
      res.json(subUnits.map((su: any) => ({ id: su.id, name: su.name })));
    } catch (error) {
      console.error('Get organization sub-units error:', error);
      res.status(500).json({ error: "Failed to fetch organization sub-units" });
    }
  });

  // ==================== ORGANIZATION TEAMS (LEVEL 3) ROUTES ====================

  app.get("/api/organization/teams/:subUnitId", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.json([]);
      }
      
      const subUnit = await storage.getOrganizationSubUnit(req.params.subUnitId);
      if (!subUnit) {
        return res.status(404).json({ error: "Sub-unit not found" });
      }
      
      const unit = await storage.getOrganizationUnit(subUnit.unitId);
      if (!unit) {
        return res.status(404).json({ error: "Unit not found" });
      }
      
      const canAccess = await canAccessOrganizationFromSession(req, unit.organizationId);
      if (!canAccess) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const teams = await storage.getOrganizationTeams(req.params.subUnitId);
      res.json(teams.map((t: any) => ({ id: t.id, name: t.name, subUnitId: t.subUnitId, joinCode: t.joinCode, displayOrder: t.displayOrder })));
    } catch (error) {
      console.error('Get organization teams error:', error);
      res.status(500).json({ error: "Failed to fetch organization teams" });
    }
  });

  app.get("/api/organization/all-teams/:organizationId", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const hasAccessToOrg = await canAccessOrganizationFromSession(req, req.params.organizationId);
      if (!hasAccessToOrg) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const teams = await storage.getAllOrganizationTeams(req.params.organizationId);
      res.json(teams);
    } catch (error) {
      console.error('Get all organization teams error:', error);
      res.status(500).json({ error: "Failed to fetch all organization teams" });
    }
  });

  app.post("/api/organization/teams", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const { subUnitId, name, organizationId } = req.body;
      
      if (!subUnitId || !name) {
        return res.status(400).json({ error: "subUnitId and name are required" });
      }
      
      const subUnit = await storage.getOrganizationSubUnit(subUnitId);
      if (!subUnit) {
        return res.status(404).json({ error: "Sub-unit not found" });
      }
      
      const unit = await storage.getOrganizationUnit(subUnit.unitId);
      if (!unit) {
        return res.status(404).json({ error: "Unit not found" });
      }
      
      const canWrite = await hasOrgAdminWriteAccess(req, unit.organizationId);
      if (!canWrite) {
        return res.status(403).json({ error: "Only organization admins can create teams" });
      }
      
      const existingTeams = await storage.getOrganizationTeams(subUnitId);
      const displayOrder = existingTeams.length;
      
      const org = await storage.getOrganization(unit.organizationId);
      const orgCode = org?.inviteCode || 'ORG';
      const teamLetter = String.fromCharCode(65 + displayOrder);
      const joinCode = `${orgCode}_${unit.name.slice(0, 3).toUpperCase()}_${subUnit.name.slice(0, 2).toUpperCase()}_T${teamLetter}`;
      
      const team = await storage.createOrganizationTeam({
        subUnitId,
        name,
        displayOrder,
        joinCode,
      });
      
      res.status(201).json(team);
    } catch (error) {
      console.error('Create team error:', error);
      res.status(500).json({ error: "Failed to create team" });
    }
  });

  app.put("/api/organization/teams/:teamId", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const team = await storage.getOrganizationTeam(req.params.teamId);
      if (!team) {
        return res.status(404).json({ error: "Team not found" });
      }
      
      const subUnit = await storage.getOrganizationSubUnit(team.subUnitId);
      const unit = subUnit ? await storage.getOrganizationUnit(subUnit.unitId) : null;
      
      if (!unit) {
        return res.status(404).json({ error: "Parent unit not found" });
      }
      
      const canWrite = await hasOrgAdminWriteAccess(req, unit.organizationId);
      if (!canWrite) {
        return res.status(403).json({ error: "Only organization admins can update teams" });
      }
      
      const { name, isActive } = req.body;
      const updated = await storage.updateOrganizationTeam(req.params.teamId, { name, isActive });
      res.json(updated);
    } catch (error) {
      console.error('Update team error:', error);
      res.status(500).json({ error: "Failed to update team" });
    }
  });

  app.delete("/api/organization/teams/:teamId", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const team = await storage.getOrganizationTeam(req.params.teamId);
      if (!team) {
        return res.status(404).json({ error: "Team not found" });
      }
      
      const subUnit = await storage.getOrganizationSubUnit(team.subUnitId);
      const unit = subUnit ? await storage.getOrganizationUnit(subUnit.unitId) : null;
      
      if (!unit) {
        return res.status(404).json({ error: "Parent unit not found" });
      }
      
      const canWrite = await hasOrgAdminWriteAccess(req, unit.organizationId);
      if (!canWrite) {
        return res.status(403).json({ error: "Only organization admins can delete teams" });
      }
      
      await storage.deleteOrganizationTeam(req.params.teamId);
      res.json({ success: true });
    } catch (error) {
      console.error('Delete team error:', error);
      res.status(500).json({ error: "Failed to delete team" });
    }
  });

  app.post("/api/organization/teams/reorder", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const { teamIds, organizationId } = req.body;
      
      if (!teamIds || !Array.isArray(teamIds) || teamIds.length === 0) {
        return res.status(400).json({ error: "teamIds array is required" });
      }
      
      if (organizationId) {
        const canWrite = await hasOrgAdminWriteAccess(req, organizationId);
        if (!canWrite) {
          return res.status(403).json({ error: "Only organization admins can reorder teams" });
        }
      }
      
      await storage.reorderOrganizationTeams(teamIds);
      res.json({ success: true });
    } catch (error) {
      console.error('Reorder teams error:', error);
      res.status(500).json({ error: "Failed to reorder teams" });
    }
  });

  app.get("/api/organization/hierarchy/:organizationId", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const { organizationId } = req.params;
      
      const hasAccessToOrg = await canAccessOrganizationFromSession(req, organizationId);
      if (!hasAccessToOrg) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const units = await storage.getOrganizationUnits(organizationId);
      const allSubUnits = await storage.getAllOrganizationSubUnits(organizationId);
      const allTeams = await storage.getAllOrganizationTeams(organizationId);
      const assignments = await storage.getOrganizationAssignments(organizationId);
      const unitSubjectsByUnitId = new Map<string, any[]>();

      for (const unit of units) {
        const unitSubjectsForUnit = await storage.getUnitSubjects(unit.id);
        unitSubjectsByUnitId.set(
          unit.id,
          unitSubjectsForUnit.map((unitSubject: any) => ({
            id: unitSubject.subjectId,
            name: unitSubject.subjectName,
            description: unitSubject.subjectDescription,
            assignmentId: unitSubject.id,
            unitId: unit.id,
          }))
        );
      }
      
      const getUserCountAtLevel = (unitId?: string, subUnitId?: string, teamId?: string, subjectId?: string) => {
        return assignments.filter((a: any) => {
          if (teamId) return a.teamId === teamId && (!subjectId || a.subjectId === subjectId);
          if (subUnitId) return a.subUnitId === subUnitId && !a.teamId && (!subjectId || a.subjectId === subjectId);
          if (subjectId) return a.unitId === unitId && a.subjectId === subjectId && !a.subUnitId && !a.teamId;
          if (unitId) return a.unitId === unitId && !a.subjectId && !a.subUnitId && !a.teamId;
          return !a.unitId && !a.subUnitId && !a.teamId;
        }).length;
      };
      
      const getTotalUserCount = (unitId?: string, subUnitId?: string, subjectId?: string) => {
        if (subUnitId) {
          const subUnitTeams = allTeams.filter((t: any) => t.subUnitId === subUnitId);
          // Fix: Only count users directly assigned to sub-unit (exclude those with teamId to prevent double-counting)
          const directCount = assignments.filter((a: any) => a.subUnitId === subUnitId && !a.teamId && (!subjectId || a.subjectId === subjectId)).length;
          const teamCount = subUnitTeams.reduce((sum: number, t: any) => 
            sum + assignments.filter((a: any) => a.teamId === t.id && (!subjectId || a.subjectId === subjectId)).length, 0);
          return directCount + teamCount;
        }
        if (unitId && subjectId) {
          const unitSubUnits = allSubUnits.filter((su: any) => su.unitId === unitId);
          let total = assignments.filter((a: any) => a.unitId === unitId && a.subjectId === subjectId && !a.subUnitId && !a.teamId).length;
          for (const su of unitSubUnits) {
            total += getTotalUserCount(unitId, su.id, subjectId);
          }
          return total;
        }
        if (unitId) {
          const unitSubUnits = allSubUnits.filter((su: any) => su.unitId === unitId);
          // Fix: Only count users directly assigned to department (exclude those with subUnitId/teamId to prevent double-counting)
          let total = assignments.filter((a: any) => a.unitId === unitId && !a.subjectId && !a.subUnitId && !a.teamId).length;
          for (const su of unitSubUnits) {
            total += getTotalUserCount(undefined, su.id);
          }
          return total;
        }
        return assignments.length;
      };
      
      const sortWithGeneralFirst = (a: any, b: any) => {
        const aIsGeneral = a.name.toLowerCase() === 'general';
        const bIsGeneral = b.name.toLowerCase() === 'general';
        if (aIsGeneral && !bIsGeneral) return -1;
        if (!aIsGeneral && bIsGeneral) return 1;
        return a.name.localeCompare(b.name);
      };

      const hierarchy = units.map((unit: any) => {
        const unitSubUnits = allSubUnits.filter((su: any) => su.unitId === unit.id);
        const unitSubjects = unitSubjectsByUnitId.get(unit.id) || [];
        
        return {
          id: unit.id,
          name: unit.name,
          type: 'department',
          joinCode: unit.joinCode,
          isShowcaseDepartment: unit.isShowcaseDepartment === true || isShowcaseDepartmentName(unit.name),
          displayOrder: unit.displayOrder,
          directCount: getUserCountAtLevel(unit.id),
          totalCount: getTotalUserCount(unit.id),
          children: unitSubjects.map((subject: any) => ({
            id: subject.id,
            name: subject.name,
            type: 'subject',
            joinCode: null,
            displayOrder: 0,
            directCount: getUserCountAtLevel(unit.id, undefined, undefined, subject.id),
            totalCount: getTotalUserCount(unit.id, undefined, subject.id),
            subjectId: subject.id,
            unitId: unit.id,
            subjectDescription: subject.description,
            assignmentId: subject.assignmentId,
            children: unitSubUnits.map((subUnit: any) => {
              const subUnitTeams = allTeams.filter((t: any) => t.subUnitId === subUnit.id);

              return {
                id: subUnit.id,
                name: subUnit.name,
                type: 'unit',
                joinCode: subUnit.joinCode,
                displayOrder: subUnit.displayOrder,
                directCount: getUserCountAtLevel(unit.id, subUnit.id, undefined, subject.id),
                totalCount: getTotalUserCount(unit.id, subUnit.id, subject.id),
                subjectId: subject.id,
                unitId: unit.id,
                children: subUnitTeams.sort(sortWithGeneralFirst).map((team: any) => ({
                  id: team.id,
                  name: team.name,
                  type: 'team',
                  joinCode: team.joinCode,
                  displayOrder: team.displayOrder,
                  directCount: getUserCountAtLevel(unit.id, subUnit.id, team.id, subject.id),
                  totalCount: getUserCountAtLevel(unit.id, subUnit.id, team.id, subject.id),
                  subjectId: subject.id,
                  unitId: unit.id,
                })),
              };
            }).sort(sortWithGeneralFirst),
          })).sort(sortWithGeneralFirst),
        };
      }).sort(sortWithGeneralFirst);
      
      res.json({
        organizationId,
        hierarchy,
        totals: {
          departments: units.length,
          units: allSubUnits.length,
          teams: allTeams.length,
          users: assignments.length,
        },
      });
    } catch (error) {
      console.error('Get organization hierarchy error:', error);
      res.status(500).json({ error: "Failed to fetch organization hierarchy" });
    }
  });

  // ==================== ORG MANAGEMENT HUB ENDPOINTS ====================

  // 1. GET /api/organization/:organizationId/hierarchy/:nodeType/:nodeId/members
  // Returns users assigned to a specific department/unit/team
  // Query params:
  //   - scope: 'direct' (only direct assignments) or 'all' (includes children) - default 'direct'
  app.get("/api/organization/:organizationId/hierarchy/:nodeType/:nodeId/members", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { organizationId, nodeType, nodeId } = req.params;
      const requestedSubjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : undefined;
      const scope = (req.query.scope as string) || 'direct';

      if (!['department', 'subject', 'unit', 'team'].includes(nodeType)) {
        return res.status(400).json({ error: "Invalid nodeType. Must be 'department', 'subject', 'unit', or 'team'" });
      }

      const hasAccess = await hasOrgTeacherOrAdminAccess(req, organizationId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      let whereClause;
      
      if (scope === 'direct') {
        // Direct only: users assigned specifically to this node, excluding child-level assignments
        if (nodeType === 'department') {
          // Direct only: users assigned to this department but NOT to any sub-unit or team
          whereClause = and(
            eq(userOrganizationAssignments.unitId, nodeId),
            isNull(userOrganizationAssignments.subjectId),
            isNull(userOrganizationAssignments.subUnitId),
            isNull(userOrganizationAssignments.teamId)
          );
        } else if (nodeType === 'subject') {
          const [subjectLink] = await db
            .select({ unitId: unitSubjects.unitId })
            .from(unitSubjects)
            .innerJoin(organizationUnits, eq(unitSubjects.unitId, organizationUnits.id))
            .where(and(
              eq(unitSubjects.subjectId, nodeId),
              eq(organizationUnits.organizationId, organizationId)
            ))
            .limit(1);
          if (!subjectLink) return res.status(404).json({ error: "Subject not found in this organization hierarchy" });
          whereClause = and(
            eq(userOrganizationAssignments.unitId, subjectLink.unitId),
            eq(userOrganizationAssignments.subjectId, nodeId),
            isNull(userOrganizationAssignments.subUnitId),
            isNull(userOrganizationAssignments.teamId)
          );
        } else if (nodeType === 'unit') {
          // Direct only: users assigned to this sub-unit but NOT to any team
          const conditions = [
            eq(userOrganizationAssignments.subUnitId, nodeId),
            isNull(userOrganizationAssignments.teamId)
          ];
          if (requestedSubjectId) {
            conditions.push(eq(userOrganizationAssignments.subjectId, requestedSubjectId));
          } else {
            conditions.push(isNull(userOrganizationAssignments.subjectId));
          }
          whereClause = and(...conditions);
        } else {
          // Direct only: users assigned to this team
          const conditions = [eq(userOrganizationAssignments.teamId, nodeId)];
          if (requestedSubjectId) {
            conditions.push(eq(userOrganizationAssignments.subjectId, requestedSubjectId));
          }
          whereClause = and(...conditions);
        }
      } else {
        // All: include members from this node and all children
        if (nodeType === 'department') {
          // Get all sub-units under this department
          const subUnits = await db
            .select({ id: organizationSubUnits.id })
            .from(organizationSubUnits)
            .where(eq(organizationSubUnits.unitId, nodeId));
          const subUnitIds = subUnits.map(su => su.id);
          
          // Get all teams under those sub-units
          let teamIds: string[] = [];
          if (subUnitIds.length > 0) {
            const teams = await db
              .select({ id: organizationTeams.id })
              .from(organizationTeams)
              .where(inArray(organizationTeams.subUnitId, subUnitIds));
            teamIds = teams.map(t => t.id);
          }
          
          // Include: direct to department, or assigned to any sub-unit, or assigned to any team
          const conditions = [eq(userOrganizationAssignments.unitId, nodeId)];
          if (subUnitIds.length > 0) {
            conditions.push(inArray(userOrganizationAssignments.subUnitId, subUnitIds));
          }
          if (teamIds.length > 0) {
            conditions.push(inArray(userOrganizationAssignments.teamId, teamIds));
          }
          whereClause = or(...conditions);
        } else if (nodeType === 'subject') {
          const [subjectLink] = await db
            .select({ unitId: unitSubjects.unitId })
            .from(unitSubjects)
            .innerJoin(organizationUnits, eq(unitSubjects.unitId, organizationUnits.id))
            .where(and(
              eq(unitSubjects.subjectId, nodeId),
              eq(organizationUnits.organizationId, organizationId)
            ))
            .limit(1);
          if (!subjectLink) return res.status(404).json({ error: "Subject not found in this organization hierarchy" });

          const subUnits = await db
            .select({ id: organizationSubUnits.id })
            .from(organizationSubUnits)
            .where(eq(organizationSubUnits.unitId, subjectLink.unitId));
          const subUnitIds = subUnits.map(su => su.id);

          let teamIds: string[] = [];
          if (subUnitIds.length > 0) {
            const teams = await db
              .select({ id: organizationTeams.id })
              .from(organizationTeams)
              .where(inArray(organizationTeams.subUnitId, subUnitIds));
            teamIds = teams.map(t => t.id);
          }

          const conditions = [
            and(
              eq(userOrganizationAssignments.unitId, subjectLink.unitId),
              eq(userOrganizationAssignments.subjectId, nodeId)
            ),
          ];
          if (subUnitIds.length > 0) {
            conditions.push(and(
              inArray(userOrganizationAssignments.subUnitId, subUnitIds),
              eq(userOrganizationAssignments.subjectId, nodeId)
            ));
          }
          if (teamIds.length > 0) {
            conditions.push(and(
              inArray(userOrganizationAssignments.teamId, teamIds),
              eq(userOrganizationAssignments.subjectId, nodeId)
            ));
          }
          whereClause = or(...conditions);
        } else if (nodeType === 'unit') {
          // Get all teams under this sub-unit
          const teams = await db
            .select({ id: organizationTeams.id })
            .from(organizationTeams)
            .where(eq(organizationTeams.subUnitId, nodeId));
          const teamIds = teams.map(t => t.id);
          
          // Include: direct to sub-unit, or assigned to any team
          const conditions = [
            requestedSubjectId
              ? and(
                  eq(userOrganizationAssignments.subUnitId, nodeId),
                  eq(userOrganizationAssignments.subjectId, requestedSubjectId)
                )
              : eq(userOrganizationAssignments.subUnitId, nodeId)
          ];
          if (teamIds.length > 0) {
            conditions.push(
              requestedSubjectId
                ? and(
                    inArray(userOrganizationAssignments.teamId, teamIds),
                    eq(userOrganizationAssignments.subjectId, requestedSubjectId)
                  )
                : inArray(userOrganizationAssignments.teamId, teamIds)
            );
          }
          whereClause = or(...conditions);
        } else {
          // Teams have no children, so 'all' is the same as 'direct'
          const conditions = [eq(userOrganizationAssignments.teamId, nodeId)];
          if (requestedSubjectId) {
            conditions.push(eq(userOrganizationAssignments.subjectId, requestedSubjectId));
          }
          whereClause = and(...conditions);
        }
      }

      const assignments = await db
        .select({
          assignmentId: userOrganizationAssignments.id,
          id: userOrganizationAssignments.userId,
          userId: userOrganizationAssignments.userId,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          gamerName: users.gamerName,
          unitId: userOrganizationAssignments.unitId,
          subjectId: userOrganizationAssignments.subjectId,
          subUnitId: userOrganizationAssignments.subUnitId,
          teamId: userOrganizationAssignments.teamId,
        })
        .from(userOrganizationAssignments)
        .innerJoin(users, eq(userOrganizationAssignments.userId, users.id))
        .where(and(
          eq(userOrganizationAssignments.organizationId, organizationId),
          whereClause
        ));

      // Deduplicate by userId in case same user appears multiple times
      const uniqueMembers = Array.from(
        new Map(assignments.map(a => [a.userId, a])).values()
      );

      res.json({ members: uniqueMembers });
    } catch (error) {
      console.error('Get hierarchy members error:', error);
      res.status(500).json({ error: "Failed to fetch members" });
    }
  });

  // 1.5. GET /api/organization/:orgId/search
  // Search across nodes (departments, units, teams), users, and optionally courses
  // Query params:
  //   - q: search term (minimum 2 characters)
  //   - includeCourses: 'true' (default) or 'false'
  app.get("/api/organization/:orgId/search", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { orgId } = req.params;
      const { q, includeCourses } = req.query;

      const searchTerm = String(q || '').trim();
      if (searchTerm.length < 2) {
        return res.json({ nodes: [], users: [], courses: [] });
      }

      const hasOrgAccess = await hasOrgMemberAccess(req, orgId);
      if (!hasOrgAccess) {
        return res.status(403).json({ error: "Access denied to this organization" });
      }

      const isAdminOrTeacher = await hasOrgTeacherOrAdminAccess(req, orgId);

      const searchPattern = `%${searchTerm}%`;

      const departmentResults = await db
        .select({
          id: organizationUnits.id,
          name: organizationUnits.name,
          joinCode: organizationUnits.joinCode,
        })
        .from(organizationUnits)
        .where(and(
          eq(organizationUnits.organizationId, orgId),
          sql`${organizationUnits.name} ILIKE ${searchPattern}`
        ))
        .limit(10);

      const unitResults = await db
        .select({
          id: organizationSubUnits.id,
          name: organizationSubUnits.name,
          joinCode: organizationSubUnits.joinCode,
          parentId: organizationSubUnits.unitId,
        })
        .from(organizationSubUnits)
        .innerJoin(organizationUnits, eq(organizationSubUnits.unitId, organizationUnits.id))
        .where(and(
          eq(organizationUnits.organizationId, orgId),
          sql`${organizationSubUnits.name} ILIKE ${searchPattern}`
        ))
        .limit(10);

      const teamResults = await db
        .select({
          id: organizationTeams.id,
          name: organizationTeams.name,
          joinCode: organizationTeams.joinCode,
          parentId: organizationTeams.subUnitId,
        })
        .from(organizationTeams)
        .innerJoin(organizationSubUnits, eq(organizationTeams.subUnitId, organizationSubUnits.id))
        .innerJoin(organizationUnits, eq(organizationSubUnits.unitId, organizationUnits.id))
        .where(and(
          eq(organizationUnits.organizationId, orgId),
          sql`${organizationTeams.name} ILIKE ${searchPattern}`
        ))
        .limit(10);

      const nodes = [
        ...departmentResults.map(d => ({ ...d, type: 'department' as const })),
        ...unitResults.map(u => ({ ...u, type: 'unit' as const })),
        ...teamResults.map(t => ({ ...t, type: 'team' as const })),
      ];

      const userResults = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          gamerName: users.gamerName,
          role: userOrganizationRoles.role,
        })
        .from(users)
        .innerJoin(userOrganizationRoles, eq(users.id, userOrganizationRoles.userId))
        .where(and(
          eq(userOrganizationRoles.organizationId, orgId),
          or(
            sql`${users.firstName} ILIKE ${searchPattern}`,
            sql`${users.lastName} ILIKE ${searchPattern}`,
            sql`${users.email} ILIKE ${searchPattern}`,
            sql`${users.gamerName} ILIKE ${searchPattern}`
          )
        ))
        .limit(20);

      let courseResults: Array<{
        id: string;
        title: string;
        status: string | null;
        thumbnailUrl: string | null;
      }> = [];

      if (includeCourses !== 'false') {
        const courseConditions = [
          eq(courses.organizationId, orgId),
          sql`${courses.title} ILIKE ${searchPattern}`
        ];

        if (!isAdminOrTeacher) {
          courseConditions.push(eq(courses.status, 'active'));
        }

        const rawCourseResults = await db
          .select({
            id: courses.id,
            title: courses.title,
            status: courses.status,
            thumbnailUrl: courses.thumbnailUrl,
          })
          .from(courses)
          .where(and(...courseConditions))
          .limit(20);

        // Convert storage keys to signed URLs for thumbnails
        courseResults = await Promise.all(
          rawCourseResults.map(async (course) => {
            let signedThumbnailUrl = course.thumbnailUrl;
            
            if (course.thumbnailUrl) {
              // Check if it's already a full URL (starts with https://)
              if (!course.thumbnailUrl.startsWith('https://')) {
                try {
                  // Convert storage key to signed URL
                  signedThumbnailUrl = await objectStorageService.getCourseThumbnailSignedURL(
                    course.thumbnailUrl,
                    3600 // 1 hour TTL
                  );
                  console.log(`[OrgSearch] Converted thumbnail for course ${course.id}`);
                } catch (error) {
                  console.error(`[OrgSearch] Failed to generate signed URL for course ${course.id}:`, error);
                  // Keep original URL if conversion fails
                }
              }
            }
            
            return {
              ...course,
              thumbnailUrl: signedThumbnailUrl,
            };
          })
        );
      }

      res.json({
        nodes,
        users: userResults,
        courses: courseResults,
      });
    } catch (error) {
      console.error('Organization search error:', error);
      res.status(500).json({ error: "Failed to search organization" });
    }
  });

  // 2. GET /api/organization/:organizationId/users
  // Returns ALL users in the organization (for user picker)
  app.get("/api/organization/:organizationId/users", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { organizationId } = req.params;

      const hasAccess = await hasOrgTeacherOrAdminAccess(req, organizationId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      const orgUsers = await db
        .select({
          id: users.id,
          userId: userOrganizationRoles.userId,
          role: userOrganizationRoles.role,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          gamerName: users.gamerName,
          unitId: userOrganizationAssignments.unitId,
          subjectId: userOrganizationAssignments.subjectId,
          subUnitId: userOrganizationAssignments.subUnitId,
          teamId: userOrganizationAssignments.teamId,
        })
        .from(userOrganizationRoles)
        .innerJoin(users, eq(userOrganizationRoles.userId, users.id))
        .leftJoin(userOrganizationAssignments, and(
          eq(userOrganizationAssignments.userId, users.id),
          eq(userOrganizationAssignments.organizationId, organizationId)
        ))
        .where(eq(userOrganizationRoles.organizationId, organizationId));

      res.json({ users: orgUsers });
    } catch (error) {
      console.error('Get organization users error:', error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // 3. POST /api/organization/:organizationId/hierarchy/:nodeType/:nodeId/assign
  // Assign multiple users to a node
  const assignUsersSchema = z.object({
    userIds: z.array(z.string().uuid()).min(1, "At least one user ID is required"),
    subjectId: z.string().uuid().optional(),
  });

  app.post("/api/organization/:organizationId/hierarchy/:nodeType/:nodeId/assign", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { organizationId, nodeType, nodeId } = req.params;

      if (!['department', 'subject', 'unit', 'team'].includes(nodeType)) {
        return res.status(400).json({ error: "Invalid nodeType. Must be 'department', 'subject', 'unit', or 'team'" });
      }

      const hasAccess = await hasOrgTeacherOrAdminAccess(req, organizationId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      const validatedData = assignUsersSchema.parse(req.body);
      const { userIds, subjectId: bodySubjectId } = validatedData;

      await db.transaction(async (tx) => {
        for (const userId of userIds) {
          let unitId: string | null = null;
          let subjectId: string | null = bodySubjectId || null;
          let subUnitId: string | null = null;
          let teamId: string | null = null;

          if (nodeType === 'department') {
            unitId = nodeId;
            subjectId = null;
          } else if (nodeType === 'subject') {
            const [subjectLink] = await tx
              .select({ unitId: unitSubjects.unitId })
              .from(unitSubjects)
              .innerJoin(organizationUnits, eq(unitSubjects.unitId, organizationUnits.id))
              .where(and(
                eq(unitSubjects.subjectId, nodeId),
                eq(organizationUnits.organizationId, organizationId)
              ))
              .limit(1);
            if (!subjectLink) {
              throw new Error(`Subject ${nodeId} not found in this organization hierarchy`);
            }
            unitId = subjectLink.unitId;
            subjectId = nodeId;
          } else if (nodeType === 'unit') {
            const subUnit = await tx.select().from(organizationSubUnits).where(eq(organizationSubUnits.id, nodeId)).limit(1);
            if (!subUnit.length) {
              throw new Error(`SubUnit ${nodeId} not found`);
            }
            unitId = subUnit[0].unitId;
            subUnitId = nodeId;
            if (subjectId) {
              const subjectLink = await tx
                .select({ id: unitSubjects.id })
                .from(unitSubjects)
                .where(and(
                  eq(unitSubjects.unitId, unitId),
                  eq(unitSubjects.subjectId, subjectId)
                ))
                .limit(1);
              if (!subjectLink.length) {
                throw new Error(`Subject ${subjectId} is not linked to grade ${unitId}`);
              }
            }
          } else if (nodeType === 'team') {
            const team = await tx.select().from(organizationTeams).where(eq(organizationTeams.id, nodeId)).limit(1);
            if (!team.length) {
              throw new Error(`Team ${nodeId} not found`);
            }
            const subUnit = await tx.select().from(organizationSubUnits).where(eq(organizationSubUnits.id, team[0].subUnitId)).limit(1);
            if (!subUnit.length) {
              throw new Error(`Parent subUnit not found`);
            }
            unitId = subUnit[0].unitId;
            subUnitId = team[0].subUnitId;
            teamId = nodeId;
            if (subjectId) {
              const subjectLink = await tx
                .select({ id: unitSubjects.id })
                .from(unitSubjects)
                .where(and(
                  eq(unitSubjects.unitId, unitId),
                  eq(unitSubjects.subjectId, subjectId)
                ))
                .limit(1);
              if (!subjectLink.length) {
                throw new Error(`Subject ${subjectId} is not linked to grade ${unitId}`);
              }
            }
          }

          const existing = await tx.select().from(userOrganizationAssignments)
            .where(and(
              eq(userOrganizationAssignments.userId, userId),
              eq(userOrganizationAssignments.organizationId, organizationId)
            )).limit(1);

          if (existing.length) {
            await tx.update(userOrganizationAssignments)
              .set({ unitId, subjectId, subUnitId, teamId })
              .where(eq(userOrganizationAssignments.id, existing[0].id));
          } else {
            await tx.insert(userOrganizationAssignments).values({
              userId,
              organizationId,
              unitId,
              subjectId,
              subUnitId,
              teamId,
            });
          }
        }
      });

      res.json({ success: true, assignedCount: userIds.length });
    } catch (error) {
      console.error('Assign users error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to assign users" });
    }
  });

  // 4. DELETE /api/organization/:organizationId/hierarchy/:nodeType/:nodeId/users/:userId
  // Remove a user from a specific node
  app.delete("/api/organization/:organizationId/hierarchy/:nodeType/:nodeId/users/:userId", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { organizationId, nodeType, nodeId, userId } = req.params;

      const requestedSubjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : undefined;

      if (!['department', 'subject', 'unit', 'team'].includes(nodeType)) {
        return res.status(400).json({ error: "Invalid nodeType" });
      }

      const hasAccess = await hasOrgTeacherOrAdminAccess(req, organizationId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      let whereClause;
      if (nodeType === 'department') {
        whereClause = and(
          eq(userOrganizationAssignments.userId, userId),
          eq(userOrganizationAssignments.organizationId, organizationId),
          eq(userOrganizationAssignments.unitId, nodeId),
          isNull(userOrganizationAssignments.subjectId)
        );
      } else if (nodeType === 'subject') {
        whereClause = and(
          eq(userOrganizationAssignments.userId, userId),
          eq(userOrganizationAssignments.organizationId, organizationId),
          eq(userOrganizationAssignments.subjectId, nodeId)
        );
      } else if (nodeType === 'unit') {
        const conditions = [
          eq(userOrganizationAssignments.userId, userId),
          eq(userOrganizationAssignments.organizationId, organizationId),
          eq(userOrganizationAssignments.subUnitId, nodeId)
        ];
        if (requestedSubjectId) {
          conditions.push(eq(userOrganizationAssignments.subjectId, requestedSubjectId));
        }
        whereClause = and(...conditions);
      } else {
        const conditions = [
          eq(userOrganizationAssignments.userId, userId),
          eq(userOrganizationAssignments.organizationId, organizationId),
          eq(userOrganizationAssignments.teamId, nodeId)
        ];
        if (requestedSubjectId) {
          conditions.push(eq(userOrganizationAssignments.subjectId, requestedSubjectId));
        }
        whereClause = and(...conditions);
      }

      await db.delete(userOrganizationAssignments).where(whereClause);

      res.json({ success: true });
    } catch (error) {
      console.error('Remove user from node error:', error);
      res.status(500).json({ error: "Failed to remove user" });
    }
  });

  // 5. GET /api/organization/:orgId/hierarchy/:scopeType/:scopeId/courses
  // Get courses assigned to an organizational scope (department, unit, or team)
  app.get(
    '/api/organization/:orgId/hierarchy/:scopeType/:scopeId/courses',
    withSessionAuthMiddleware,
    async (req: Request, res: Response) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const { orgId, scopeType, scopeId } = req.params;

        // Validate scopeType
        if (!['department', 'subject', 'unit', 'team'].includes(scopeType)) {
          return res.status(400).json({ 
            error: "Invalid scopeType. Must be one of: 'department', 'subject', 'unit', 'team'"
          });
        }

        // Validate scopeId is a valid UUID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(scopeId)) {
          return res.status(400).json({ error: "Invalid scopeId. Must be a valid UUID" });
        }

        // Get optional query param includeChildren (default true)
        const includeChildrenParam = req.query.includeChildren;
        const includeChildren = includeChildrenParam === 'false' ? false : true;
        const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : undefined;

        // Verify user has access to the organization (teacher, instructor, or admin)
        const userId = req.session.userId;
        const hasAccess = await hasOrgTeacherOrAdminAccess(req, orgId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }

        // Call CourseAssignmentService.getCoursesByScope()
        const coursesWithAssignments = await CourseAssignmentService.getCoursesByScope({
          organizationId: orgId,
          scopeType: scopeType as 'department' | 'subject' | 'unit' | 'team',
          scopeId,
          subjectId,
          includeChildren,
        });

        const preferredLanguage = await ContentLanguageService.resolveLanguage(req.session.userId!, orgId);

        let languageResolvedCourses = coursesWithAssignments;
        if (preferredLanguage) {
          const courseIds = coursesWithAssignments.map(item => item.course.id);
          const courseMetadata = courseIds.length > 0
            ? await db
                .select({ id: courses.id, contentGroupId: courses.contentGroupId, languageCode: courses.languageCode })
                .from(courses)
                .where(inArray(courses.id, courseIds))
            : [];
          const metaMap = new Map(courseMetadata.map(c => [c.id, c]));

          const groupIdsToResolve = courseMetadata
            .filter(c => c.contentGroupId && c.languageCode !== preferredLanguage)
            .map(c => c.contentGroupId!);

          let preferredVariantsMap = new Map<string, any>();
          if (groupIdsToResolve.length > 0) {
            const preferredVariants = await db
              .select({ id: courses.id, title: courses.title, description: courses.description, thumbnailUrl: courses.thumbnailUrl, status: courses.status, contentGroupId: courses.contentGroupId })
              .from(courses)
              .where(and(
                inArray(courses.contentGroupId, groupIdsToResolve),
                eq(courses.languageCode, preferredLanguage),
                eq(courses.status, 'active')
              ));
            preferredVariantsMap = new Map(preferredVariants.map(v => [v.contentGroupId!, v]));
          }

          languageResolvedCourses = coursesWithAssignments.map(item => {
            const meta = metaMap.get(item.course.id);
            if (!meta?.contentGroupId || meta.languageCode === preferredLanguage) return item;
            const preferred = preferredVariantsMap.get(meta.contentGroupId);
            if (!preferred || preferred.id === item.course.id) return item;
            return {
              ...item,
              course: {
                ...item.course,
                id: preferred.id,
                title: preferred.title,
                description: preferred.description || item.course.description,
                thumbnailUrl: preferred.thumbnailUrl || item.course.thumbnailUrl,
                status: preferred.status || item.course.status,
              },
            };
          });
        }

        // Convert storage keys to signed URLs for thumbnails
        const coursesWithSignedUrls = await Promise.all(
          languageResolvedCourses.map(async (item) => {
            if (item.course.thumbnailUrl) {
              // Check if it's already a full URL
              if (!item.course.thumbnailUrl.startsWith('http')) {
                try {
                  const signedUrl = await objectStorageService.getCourseThumbnailSignedURL(item.course.thumbnailUrl);
                  return {
                    ...item,
                    course: {
                      ...item.course,
                      thumbnailUrl: signedUrl,
                    },
                  };
                } catch (err) {
                  console.error('Failed to generate signed URL for thumbnail:', err);
                  return item;
                }
              }
            }
            return item;
          })
        );

        res.json({ courses: coursesWithSignedUrls });
      } catch (error) {
        console.error('Get courses by scope error:', error);
        res.status(500).json({ error: "Failed to fetch courses for scope" });
      }
    }
  );

  // 6. POST /api/organization/:organizationId/departments
  // Create a new department
  const createDepartmentSchema = z.object({
    name: z.string().min(1, "Department name is required").trim(),
    isShowcaseDepartment: z.boolean().optional(),
  });

  app.post("/api/organization/:organizationId/departments", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { organizationId } = req.params;

      const isAdmin = await hasOrgAdminWriteAccess(req, organizationId);
      if (!isAdmin) {
        return res.status(403).json({ error: "Access denied" });
      }

      const validatedData = createDepartmentSchema.parse(req.body);
      const { name } = validatedData;

      const org = await storage.getOrganization(organizationId);
      if (!org) {
        return res.status(404).json({ error: "Organization not found" });
      }

      const maxOrderResult = await db
        .select({ maxOrder: max(organizationUnits.displayOrder) })
        .from(organizationUnits)
        .where(eq(organizationUnits.organizationId, organizationId));
      
      const displayOrder = (maxOrderResult[0]?.maxOrder ?? 0) + 1;
      
      const existingDeptCodes = await db
        .select({ joinCode: organizationUnits.joinCode })
        .from(organizationUnits)
        .where(eq(organizationUnits.organizationId, organizationId));
      const existingCodes = existingDeptCodes.map(c => c.joinCode).filter(Boolean) as string[];
      
      const baseJoinCode = generateDepartmentCode(org.inviteCode, name);
      const joinCode = ensureUniqueCode(baseJoinCode, existingCodes);

      const [department] = await db.insert(organizationUnits).values({
        organizationId,
        name,
        displayOrder,
        joinCode,
        isShowcaseDepartment: validatedData.isShowcaseDepartment === true || isShowcaseDepartmentName(name),
      }).returning();

      res.json({ department });
    } catch (error) {
      console.error('Create department error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to create department" });
    }
  });

  // 6. PATCH /api/organization/:organizationId/departments/:departmentId
  // Update department name and/or join code
  const updateDepartmentSchema = z.object({
    name: z.string().min(1, "Department name is required").trim(),
    joinCode: z.string().min(1).trim().optional(),
    isShowcaseDepartment: z.boolean().optional(),
  });

  app.patch("/api/organization/:organizationId/departments/:departmentId", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { organizationId, departmentId } = req.params;

      const isAdmin = await hasOrgAdminWriteAccess(req, organizationId);
      if (!isAdmin) {
        return res.status(403).json({ error: "Access denied" });
      }

      const validatedData = updateDepartmentSchema.parse(req.body);
      const { name, joinCode, isShowcaseDepartment } = validatedData;

      const updateData: { name: string; joinCode?: string; isShowcaseDepartment?: boolean } = { name };
      if (joinCode) {
        updateData.joinCode = joinCode;
      }
      if (isShowcaseDepartment !== undefined) {
        updateData.isShowcaseDepartment = isShowcaseDepartment;
      } else if (isShowcaseDepartmentName(name)) {
        updateData.isShowcaseDepartment = true;
      }

      const [updated] = await db.update(organizationUnits)
        .set(updateData)
        .where(and(
          eq(organizationUnits.id, departmentId),
          eq(organizationUnits.organizationId, organizationId)
        ))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Department not found" });
      }

      res.json({ department: updated });
    } catch (error) {
      console.error('Update department error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to update department" });
    }
  });

  // 7. DELETE /api/organization/:organizationId/departments/:departmentId
  // Delete a department (move users to General)
  app.delete("/api/organization/:organizationId/departments/:departmentId", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { organizationId, departmentId } = req.params;

      const isAdmin = await hasOrgAdminWriteAccess(req, organizationId);
      if (!isAdmin) {
        return res.status(403).json({ error: "Access denied" });
      }

      const department = await db.select().from(organizationUnits)
        .where(and(
          eq(organizationUnits.id, departmentId),
          eq(organizationUnits.organizationId, organizationId)
        )).limit(1);

      if (!department.length) {
        return res.status(404).json({ error: "Department not found" });
      }

      if (department[0].name === 'General') {
        return res.status(400).json({ error: "Cannot delete the General department" });
      }

      await db.transaction(async (tx) => {
        let generalDept = await tx.select().from(organizationUnits)
          .where(and(
            eq(organizationUnits.organizationId, organizationId),
            eq(organizationUnits.name, 'General')
          )).limit(1);

        if (!generalDept.length) {
          const org = await storage.getOrganization(organizationId);
          const [newGeneral] = await tx.insert(organizationUnits).values({
            organizationId,
            name: 'General',
            displayOrder: 0,
            joinCode: `${org?.inviteCode}_GENERAL`,
          }).returning();
          generalDept = [newGeneral];
        }

        const generalDeptId = generalDept[0].id;

        const subUnits = await tx.select().from(organizationSubUnits)
          .where(eq(organizationSubUnits.unitId, departmentId));

        for (const subUnit of subUnits) {
          let generalSubUnit = await tx.select().from(organizationSubUnits)
            .where(and(
              eq(organizationSubUnits.unitId, generalDeptId),
              eq(organizationSubUnits.name, subUnit.name)
            )).limit(1);

          if (!generalSubUnit.length) {
            const [newSubUnit] = await tx.insert(organizationSubUnits).values({
              unitId: generalDeptId,
              name: subUnit.name,
              displayOrder: subUnit.displayOrder,
              joinCode: `${generalDept[0].joinCode}_${subUnit.name.toUpperCase().replace(/\s+/g, '')}`,
            }).returning();
            generalSubUnit = [newSubUnit];
          }

          const teams = await tx.select().from(organizationTeams)
            .where(eq(organizationTeams.subUnitId, subUnit.id));

          for (const team of teams) {
            let generalTeam = await tx.select().from(organizationTeams)
              .where(and(
                eq(organizationTeams.subUnitId, generalSubUnit[0].id),
                eq(organizationTeams.name, team.name)
              )).limit(1);

            if (!generalTeam.length) {
              const [newTeam] = await tx.insert(organizationTeams).values({
                subUnitId: generalSubUnit[0].id,
                name: team.name,
                displayOrder: team.displayOrder,
                joinCode: `${generalSubUnit[0].joinCode}_${team.name.toUpperCase().replace(/\s+/g, '')}`,
              }).returning();
              generalTeam = [newTeam];
            }

            await tx.update(userOrganizationAssignments)
              .set({ unitId: generalDeptId, subUnitId: generalSubUnit[0].id, teamId: generalTeam[0].id })
              .where(eq(userOrganizationAssignments.teamId, team.id));

            await tx.delete(organizationTeams).where(eq(organizationTeams.id, team.id));
          }

          await tx.update(userOrganizationAssignments)
            .set({ unitId: generalDeptId, subUnitId: generalSubUnit[0].id })
            .where(and(
              eq(userOrganizationAssignments.subUnitId, subUnit.id),
              sql`${userOrganizationAssignments.teamId} IS NULL`
            ));

          await tx.delete(organizationSubUnits).where(eq(organizationSubUnits.id, subUnit.id));
        }

        await tx.update(userOrganizationAssignments)
          .set({ unitId: generalDeptId, subUnitId: null, teamId: null })
          .where(and(
            eq(userOrganizationAssignments.unitId, departmentId),
            sql`${userOrganizationAssignments.subUnitId} IS NULL`
          ));

        await tx.delete(organizationUnits).where(eq(organizationUnits.id, departmentId));
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Delete department error:', error);
      res.status(500).json({ error: "Failed to delete department" });
    }
  });

  // 8. POST /api/organization/:organizationId/departments/:departmentId/units
  // Create a unit under a department
  const createUnitSchema = z.object({
    name: z.string().min(1, "Unit name is required").trim(),
  });

  app.post("/api/organization/:organizationId/departments/:departmentId/units", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { organizationId, departmentId } = req.params;

      const isAdmin = await hasOrgAdminWriteAccess(req, organizationId);
      if (!isAdmin) {
        return res.status(403).json({ error: "Access denied" });
      }

      const validatedData = createUnitSchema.parse(req.body);
      const { name } = validatedData;

      const department = await db.select().from(organizationUnits)
        .where(and(
          eq(organizationUnits.id, departmentId),
          eq(organizationUnits.organizationId, organizationId)
        )).limit(1);

      if (!department.length) {
        return res.status(404).json({ error: "Department not found" });
      }

      const maxOrderResult = await db
        .select({ maxOrder: max(organizationSubUnits.displayOrder) })
        .from(organizationSubUnits)
        .where(eq(organizationSubUnits.unitId, departmentId));

      const displayOrder = (maxOrderResult[0]?.maxOrder ?? 0) + 1;
      const org = await storage.getOrganization(organizationId);
      const parentCode = department[0].joinCode || generateDepartmentCode(org?.inviteCode || 'ORG', department[0].name);
      
      const existingUnitCodes = await db
        .select({ joinCode: organizationSubUnits.joinCode })
        .from(organizationSubUnits);
      const existingCodes = existingUnitCodes.map(c => c.joinCode).filter(Boolean) as string[];
      
      const baseJoinCode = generateUnitCode(parentCode, name);
      const joinCode = ensureUniqueCode(baseJoinCode, existingCodes);

      const [unit] = await db.insert(organizationSubUnits).values({
        unitId: departmentId,
        name,
        displayOrder,
        joinCode,
      }).returning();

      res.json({ unit });
    } catch (error) {
      console.error('Create unit error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to create unit" });
    }
  });

  // 9. PATCH /api/organization/:organizationId/units/:unitId
  // Update unit name and/or join code
  const updateUnitSchema = z.object({
    name: z.string().min(1, "Unit name is required").trim(),
    joinCode: z.string().min(1).trim().optional(),
  });

  app.patch("/api/organization/:organizationId/units/:unitId", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { organizationId, unitId } = req.params;

      const isAdmin = await hasOrgAdminWriteAccess(req, organizationId);
      if (!isAdmin) {
        return res.status(403).json({ error: "Access denied" });
      }

      const validatedData = updateUnitSchema.parse(req.body);
      const { name, joinCode } = validatedData;

      const subUnit = await db.select().from(organizationSubUnits)
        .innerJoin(organizationUnits, eq(organizationSubUnits.unitId, organizationUnits.id))
        .where(and(
          eq(organizationSubUnits.id, unitId),
          eq(organizationUnits.organizationId, organizationId)
        )).limit(1);

      if (!subUnit.length) {
        return res.status(404).json({ error: "Unit not found" });
      }

      const updateData: { name: string; joinCode?: string } = { name };
      if (joinCode) {
        updateData.joinCode = joinCode;
      }

      const [updated] = await db.update(organizationSubUnits)
        .set(updateData)
        .where(eq(organizationSubUnits.id, unitId))
        .returning();

      res.json({ unit: updated });
    } catch (error) {
      console.error('Update unit error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to update unit" });
    }
  });

  // 10. DELETE /api/organization/:organizationId/units/:unitId
  // Delete a unit (move users to General->same unit name)
  app.delete("/api/organization/:organizationId/units/:unitId", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { organizationId, unitId } = req.params;

      const isAdmin = await hasOrgAdminWriteAccess(req, organizationId);
      if (!isAdmin) {
        return res.status(403).json({ error: "Access denied" });
      }

      const subUnit = await db.select({ 
        subUnit: organizationSubUnits, 
        dept: organizationUnits 
      })
        .from(organizationSubUnits)
        .innerJoin(organizationUnits, eq(organizationSubUnits.unitId, organizationUnits.id))
        .where(and(
          eq(organizationSubUnits.id, unitId),
          eq(organizationUnits.organizationId, organizationId)
        )).limit(1);

      if (!subUnit.length) {
        return res.status(404).json({ error: "Unit not found" });
      }

      await db.transaction(async (tx) => {
        let generalDept = await tx.select().from(organizationUnits)
          .where(and(
            eq(organizationUnits.organizationId, organizationId),
            eq(organizationUnits.name, 'General')
          )).limit(1);

        if (!generalDept.length) {
          const org = await storage.getOrganization(organizationId);
          const [newGeneral] = await tx.insert(organizationUnits).values({
            organizationId,
            name: 'General',
            displayOrder: 0,
            joinCode: `${org?.inviteCode}_GENERAL`,
          }).returning();
          generalDept = [newGeneral];
        }

        let generalSubUnit = await tx.select().from(organizationSubUnits)
          .where(and(
            eq(organizationSubUnits.unitId, generalDept[0].id),
            eq(organizationSubUnits.name, subUnit[0].subUnit.name)
          )).limit(1);

        if (!generalSubUnit.length) {
          const [newSubUnit] = await tx.insert(organizationSubUnits).values({
            unitId: generalDept[0].id,
            name: subUnit[0].subUnit.name,
            displayOrder: subUnit[0].subUnit.displayOrder,
            joinCode: `${generalDept[0].joinCode}_${subUnit[0].subUnit.name.toUpperCase().replace(/\s+/g, '')}`,
          }).returning();
          generalSubUnit = [newSubUnit];
        }

        const teams = await tx.select().from(organizationTeams)
          .where(eq(organizationTeams.subUnitId, unitId));

        for (const team of teams) {
          let generalTeam = await tx.select().from(organizationTeams)
            .where(and(
              eq(organizationTeams.subUnitId, generalSubUnit[0].id),
              eq(organizationTeams.name, team.name)
            )).limit(1);

          if (!generalTeam.length) {
            const [newTeam] = await tx.insert(organizationTeams).values({
              subUnitId: generalSubUnit[0].id,
              name: team.name,
              displayOrder: team.displayOrder,
              joinCode: `${generalSubUnit[0].joinCode}_${team.name.toUpperCase().replace(/\s+/g, '')}`,
            }).returning();
            generalTeam = [newTeam];
          }

          await tx.update(userOrganizationAssignments)
            .set({ unitId: generalDept[0].id, subUnitId: generalSubUnit[0].id, teamId: generalTeam[0].id })
            .where(eq(userOrganizationAssignments.teamId, team.id));

          await tx.delete(organizationTeams).where(eq(organizationTeams.id, team.id));
        }

        await tx.update(userOrganizationAssignments)
          .set({ unitId: generalDept[0].id, subUnitId: generalSubUnit[0].id })
          .where(and(
            eq(userOrganizationAssignments.subUnitId, unitId),
            sql`${userOrganizationAssignments.teamId} IS NULL`
          ));

        await tx.delete(organizationSubUnits).where(eq(organizationSubUnits.id, unitId));
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Delete unit error:', error);
      res.status(500).json({ error: "Failed to delete unit" });
    }
  });

  // 11. POST /api/organization/:organizationId/units/:unitId/teams
  // Create a team under a unit
  const createTeamSchema = z.object({
    name: z.string().min(1, "Team name is required").trim(),
  });

  app.post("/api/organization/:organizationId/units/:unitId/teams", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { organizationId, unitId } = req.params;

      const isAdmin = await hasOrgAdminWriteAccess(req, organizationId);
      if (!isAdmin) {
        return res.status(403).json({ error: "Access denied" });
      }

      const validatedData = createTeamSchema.parse(req.body);
      const { name } = validatedData;

      const subUnit = await db.select({ subUnit: organizationSubUnits, dept: organizationUnits })
        .from(organizationSubUnits)
        .innerJoin(organizationUnits, eq(organizationSubUnits.unitId, organizationUnits.id))
        .where(and(
          eq(organizationSubUnits.id, unitId),
          eq(organizationUnits.organizationId, organizationId)
        )).limit(1);

      if (!subUnit.length) {
        return res.status(404).json({ error: "Unit not found" });
      }

      const maxOrderResult = await db
        .select({ maxOrder: max(organizationTeams.displayOrder) })
        .from(organizationTeams)
        .where(eq(organizationTeams.subUnitId, unitId));

      const displayOrder = (maxOrderResult[0]?.maxOrder ?? 0) + 1;
      const org = await storage.getOrganization(organizationId);
      const deptCode = subUnit[0].dept.joinCode || generateDepartmentCode(org?.inviteCode || 'ORG', subUnit[0].dept.name);
      const parentCode = subUnit[0].subUnit.joinCode || generateUnitCode(deptCode, subUnit[0].subUnit.name);
      
      const existingTeamCodes = await db
        .select({ joinCode: organizationTeams.joinCode })
        .from(organizationTeams);
      const existingCodes = existingTeamCodes.map(c => c.joinCode).filter(Boolean) as string[];
      
      const baseJoinCode = generateTeamCode(parentCode, name);
      const joinCode = ensureUniqueCode(baseJoinCode, existingCodes);

      const [team] = await db.insert(organizationTeams).values({
        subUnitId: unitId,
        name,
        displayOrder,
        joinCode,
      }).returning();

      res.json({ team });
    } catch (error) {
      console.error('Create team error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to create team" });
    }
  });

  // 12. PATCH /api/organization/:organizationId/teams/:teamId
  // Update team name and/or join code
  const updateTeamSchema = z.object({
    name: z.string().min(1, "Team name is required").trim(),
    joinCode: z.string().min(1).trim().optional(),
  });

  app.patch("/api/organization/:organizationId/teams/:teamId", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { organizationId, teamId } = req.params;

      const isAdmin = await hasOrgAdminWriteAccess(req, organizationId);
      if (!isAdmin) {
        return res.status(403).json({ error: "Access denied" });
      }

      const validatedData = updateTeamSchema.parse(req.body);
      const { name, joinCode } = validatedData;

      const team = await db.select()
        .from(organizationTeams)
        .innerJoin(organizationSubUnits, eq(organizationTeams.subUnitId, organizationSubUnits.id))
        .innerJoin(organizationUnits, eq(organizationSubUnits.unitId, organizationUnits.id))
        .where(and(
          eq(organizationTeams.id, teamId),
          eq(organizationUnits.organizationId, organizationId)
        )).limit(1);

      if (!team.length) {
        return res.status(404).json({ error: "Team not found" });
      }

      const updateData: { name: string; joinCode?: string } = { name };
      if (joinCode) {
        updateData.joinCode = joinCode;
      }

      const [updated] = await db.update(organizationTeams)
        .set(updateData)
        .where(eq(organizationTeams.id, teamId))
        .returning();

      res.json({ team: updated });
    } catch (error) {
      console.error('Update team error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to update team" });
    }
  });

  // 13. DELETE /api/organization/:organizationId/teams/:teamId
  // Delete a team (move users to General->parent unit->same team name)
  app.delete("/api/organization/:organizationId/teams/:teamId", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { organizationId, teamId } = req.params;

      const isAdmin = await hasOrgAdminWriteAccess(req, organizationId);
      if (!isAdmin) {
        return res.status(403).json({ error: "Access denied" });
      }

      const team = await db.select({
        team: organizationTeams,
        subUnit: organizationSubUnits,
        dept: organizationUnits,
      })
        .from(organizationTeams)
        .innerJoin(organizationSubUnits, eq(organizationTeams.subUnitId, organizationSubUnits.id))
        .innerJoin(organizationUnits, eq(organizationSubUnits.unitId, organizationUnits.id))
        .where(and(
          eq(organizationTeams.id, teamId),
          eq(organizationUnits.organizationId, organizationId)
        )).limit(1);

      if (!team.length) {
        return res.status(404).json({ error: "Team not found" });
      }

      await db.transaction(async (tx) => {
        let generalDept = await tx.select().from(organizationUnits)
          .where(and(
            eq(organizationUnits.organizationId, organizationId),
            eq(organizationUnits.name, 'General')
          )).limit(1);

        if (!generalDept.length) {
          const org = await storage.getOrganization(organizationId);
          const [newGeneral] = await tx.insert(organizationUnits).values({
            organizationId,
            name: 'General',
            displayOrder: 0,
            joinCode: `${org?.inviteCode}_GENERAL`,
          }).returning();
          generalDept = [newGeneral];
        }

        let generalSubUnit = await tx.select().from(organizationSubUnits)
          .where(and(
            eq(organizationSubUnits.unitId, generalDept[0].id),
            eq(organizationSubUnits.name, team[0].subUnit.name)
          )).limit(1);

        if (!generalSubUnit.length) {
          const [newSubUnit] = await tx.insert(organizationSubUnits).values({
            unitId: generalDept[0].id,
            name: team[0].subUnit.name,
            displayOrder: team[0].subUnit.displayOrder,
            joinCode: `${generalDept[0].joinCode}_${team[0].subUnit.name.toUpperCase().replace(/\s+/g, '')}`,
          }).returning();
          generalSubUnit = [newSubUnit];
        }

        let generalTeam = await tx.select().from(organizationTeams)
          .where(and(
            eq(organizationTeams.subUnitId, generalSubUnit[0].id),
            eq(organizationTeams.name, team[0].team.name)
          )).limit(1);

        if (!generalTeam.length) {
          const [newTeam] = await tx.insert(organizationTeams).values({
            subUnitId: generalSubUnit[0].id,
            name: team[0].team.name,
            displayOrder: team[0].team.displayOrder,
            joinCode: `${generalSubUnit[0].joinCode}_${team[0].team.name.toUpperCase().replace(/\s+/g, '')}`,
          }).returning();
          generalTeam = [newTeam];
        }

        await tx.update(userOrganizationAssignments)
          .set({ unitId: generalDept[0].id, subUnitId: generalSubUnit[0].id, teamId: generalTeam[0].id })
          .where(eq(userOrganizationAssignments.teamId, teamId));

        await tx.delete(organizationTeams).where(eq(organizationTeams.id, teamId));
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Delete team error:', error);
      res.status(500).json({ error: "Failed to delete team" });
    }
  });

  // 14. POST /api/organization/:organizationId/teams/:teamId/regenerate-code
  // Regenerate joinCode for team
  app.post("/api/organization/:organizationId/teams/:teamId/regenerate-code", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { organizationId, teamId } = req.params;

      const isAdmin = await hasOrgAdminWriteAccess(req, organizationId);
      if (!isAdmin) {
        return res.status(403).json({ error: "Access denied" });
      }

      const team = await db.select({
        team: organizationTeams,
        subUnit: organizationSubUnits,
        dept: organizationUnits,
      })
        .from(organizationTeams)
        .innerJoin(organizationSubUnits, eq(organizationTeams.subUnitId, organizationSubUnits.id))
        .innerJoin(organizationUnits, eq(organizationSubUnits.unitId, organizationUnits.id))
        .where(and(
          eq(organizationTeams.id, teamId),
          eq(organizationUnits.organizationId, organizationId)
        )).limit(1);

      if (!team.length) {
        return res.status(404).json({ error: "Team not found" });
      }

      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const newJoinCode = `${team[0].subUnit.joinCode}_${team[0].team.name.toUpperCase().replace(/\s+/g, '')}_${randomSuffix}`;

      const [updated] = await db.update(organizationTeams)
        .set({ joinCode: newJoinCode })
        .where(eq(organizationTeams.id, teamId))
        .returning();

      res.json({ joinCode: updated.joinCode });
    } catch (error) {
      console.error('Regenerate team code error:', error);
      res.status(500).json({ error: "Failed to regenerate join code" });
    }
  });

  // 14.5. GET /api/organization/:organizationId/teams/:teamId/members
  // Get users assigned to a specific team (lazy-load for tree view)
  app.get("/api/organization/:organizationId/teams/:teamId/members", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { organizationId, teamId } = req.params;

      // Verify user has access to this org
      const isOrgMember = await hasOrgTeacherOrAdminAccess(req, organizationId);
      if (!isOrgMember) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Get users assigned to this team
      const assignments = await db.select({
        id: userOrganizationAssignments.userId,
        userId: userOrganizationAssignments.userId,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        gamerName: users.gamerName,
      })
        .from(userOrganizationAssignments)
        .innerJoin(users, eq(users.id, userOrganizationAssignments.userId))
        .where(and(
          eq(userOrganizationAssignments.organizationId, organizationId),
          eq(userOrganizationAssignments.teamId, teamId)
        ));

      res.json({ members: assignments });
    } catch (error) {
      console.error("Get team members error:", error);
      res.status(500).json({ error: "Failed to get team members" });
    }
  });

  // 15. GET /api/organization/:organizationId/settings
  // Get org timezone and currency settings
  app.get("/api/organization/:organizationId/settings", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { organizationId } = req.params;

      const isOrgMember = await hasOrgMemberAccess(req, organizationId);
      if (!isOrgMember) {
        return res.status(403).json({ error: "Access denied" });
      }

      const [org] = await db.select({
        id: organizations.id,
        timezone: organizations.timezone,
        currency: organizations.currency,
        defaultLanguage: organizations.defaultLanguage,
      })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);

      if (!org) {
        return res.status(404).json({ error: "Organization not found" });
      }

      res.json({ organization: { id: org.id, timezone: org.timezone, currency: org.currency, defaultLanguage: org.defaultLanguage } });
    } catch (error) {
      console.error('Get organization settings error:', error);
      res.status(500).json({ error: "Failed to get organization settings" });
    }
  });

  // 16. PATCH /api/organization/:organizationId/settings
  // Update org timezone and currency
  const updateOrgSettingsSchema = z.object({
    timezone: z.string().optional(),
    currency: z.enum(['ZAR', 'USD', 'EUR', 'GBP']).optional(),
  });

  app.patch("/api/organization/:organizationId/settings", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { organizationId } = req.params;

      const isAdmin = await hasOrgAdminWriteAccess(req, organizationId);
      if (!isAdmin) {
        return res.status(403).json({ error: "Access denied" });
      }

      const validatedData = updateOrgSettingsSchema.parse(req.body);

      const updateData: Record<string, any> = {};
      if (validatedData.timezone !== undefined) {
        const normalizedTimezone = canonicalizeTimezone(validatedData.timezone);
        if (!normalizedTimezone || !isValidIanaTimezone(normalizedTimezone)) {
          return res.status(400).json({ error: "Invalid timezone. Use an IANA timezone (e.g., UTC, Africa/Johannesburg)." });
        }
        updateData.timezone = normalizedTimezone;
      }
      if (validatedData.currency !== undefined) {
        updateData.currency = validatedData.currency;
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      const [updated] = await db.update(organizations)
        .set(updateData)
        .where(eq(organizations.id, organizationId))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Organization not found" });
      }

      if (req.session.userId) {
        const newContext = await SessionContextService.buildSessionContext(req.session.userId);
        req.session.context = newContext;
        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => (err ? reject(err) : resolve()));
        });
      }

      res.json({ organization: { id: updated.id, timezone: updated.timezone, currency: updated.currency } });
    } catch (error) {
      console.error('Update organization settings error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to update organization settings" });
    }
  });

  // 17. GET /api/organization/:organizationId/users/:userId/details
  // Get comprehensive user details including profile, courses, and quiz performance
  app.get("/api/organization/:organizationId/users/:userId/details", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { organizationId, userId: rawUserId } = req.params;

      const isOrgMember = await hasOrgTeacherOrAdminAccess(req, organizationId);
      if (!isOrgMember) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Accept canonical user IDs and gracefully resolve accidental role/assignment IDs.
      // This keeps older UI payloads and migrated datasets compatible.
      let resolvedUserId = rawUserId;

      let [targetUser] = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        gamerName: users.gamerName,
        country: users.country,
        profileImageUrl: users.avatarImageUrl,
        bio: users.bio,
      })
        .from(users)
        .where(eq(users.id, resolvedUserId))
        .limit(1);

      if (!targetUser) {
        const [assignmentMatch] = await db.select({
          userId: userOrganizationAssignments.userId,
        })
          .from(userOrganizationAssignments)
          .where(and(
            eq(userOrganizationAssignments.id, rawUserId),
            eq(userOrganizationAssignments.organizationId, organizationId)
          ))
          .limit(1);

        const [roleMatch] = assignmentMatch ? [null] : await db.select({
          userId: userOrganizationRoles.userId,
        })
          .from(userOrganizationRoles)
          .where(and(
            eq(userOrganizationRoles.id, rawUserId),
            eq(userOrganizationRoles.organizationId, organizationId)
          ))
          .limit(1);

        const fallbackUserId = assignmentMatch?.userId || roleMatch?.userId;
        if (fallbackUserId) {
          resolvedUserId = fallbackUserId;
          [targetUser] = await db.select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            gamerName: users.gamerName,
            country: users.country,
            profileImageUrl: users.avatarImageUrl,
            bio: users.bio,
          })
            .from(users)
            .where(eq(users.id, resolvedUserId))
            .limit(1);
        }
      }

      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const roleMembership = await db.select({ id: userOrganizationRoles.id })
        .from(userOrganizationRoles)
        .where(and(
          eq(userOrganizationRoles.userId, resolvedUserId),
          eq(userOrganizationRoles.organizationId, organizationId)
        ))
        .limit(1);

      const assignmentMembership = await db.select({ id: userOrganizationAssignments.id })
        .from(userOrganizationAssignments)
        .where(and(
          eq(userOrganizationAssignments.userId, resolvedUserId),
          eq(userOrganizationAssignments.organizationId, organizationId)
        ))
        .limit(1);

      if (roleMembership.length === 0 && assignmentMembership.length === 0) {
        return res.status(404).json({ error: "User not found in this organization" });
      }

      const userCourseProgress = await db.select({
        id: courseProgress.id,
        courseId: courseProgress.courseId,
        courseName: courses.title,
        status: courseProgress.status,
        percentComplete: courseProgress.percentComplete,
        completedLessons: courseProgress.completedLessons,
        totalLessons: courseProgress.totalLessons,
        startedAt: courseProgress.startedAt,
        completedAt: courseProgress.completedAt,
      })
        .from(courseProgress)
        .innerJoin(courses, eq(courseProgress.courseId, courses.id))
        .where(and(
          eq(courseProgress.userId, resolvedUserId),
          eq(courseProgress.organizationId, organizationId)
        ))
        .orderBy(desc(courseProgress.startedAt));

      // Get all course assignments for the user (including department/unit/team scoped assignments)
      const allAssignments = await CourseAssignmentService.getCourseAssignmentsForUser(resolvedUserId, organizationId);
      
      // Build course name lookup from assignments
      const assignmentCourseIds = allAssignments.map(a => a.courseId);
      const assignedCoursesData = assignmentCourseIds.length > 0 
        ? await db.select({ id: courses.id, title: courses.title })
            .from(courses)
            .where(inArray(courses.id, assignmentCourseIds))
        : [];
      const courseNameMap = new Map(assignedCoursesData.map(c => [c.id, c.title]));

      const existingCourseIds = new Set(userCourseProgress.map(p => p.courseId));
      const additionalCourses = allAssignments
        .filter(a => !existingCourseIds.has(a.courseId))
        .map(a => ({
          id: `assignment-${a.courseId}`,
          courseId: a.courseId,
          courseName: courseNameMap.get(a.courseId) || 'Unknown Course',
          status: 'not_started' as const,
          percentComplete: 0,
          completedLessons: 0,
          totalLessons: 0,
          startedAt: null,
          completedAt: null,
        }));

      const allCourses = [...userCourseProgress, ...additionalCourses];

      const quizAttempts = await db.select({
        id: quizGameResults.id,
        gameId: quizGameResults.gameId,
        collectionId: quizGameResults.collectionId,
        collectionName: quizCollections.name,
        lessonId: quizGameResults.lessonId,
        lessonName: lessons.title,
        lessonCourseId: courseLessons.courseId,
        courseId: quizGameResults.courseId,
        courseName: courses.title,
        lessonCourseName: sql<string | null>`"lessonCoursesAlias"."title"`,
        linkedLessonId: sql<string | null>`"linkedLessonsAlias"."id"`,
        linkedLessonName: sql<string | null>`"linkedLessonsAlias"."title"`,
        linkedLessonCourseId: sql<string | null>`"linkedCourseLessonsAlias"."courseId"`,
        linkedLessonCourseName: sql<string | null>`"linkedCoursesAlias"."title"`,
        score: quizGameResults.player1Score,
        correctAnswers: quizGameResults.player1CorrectAnswers,
        totalAnswers: quizGameResults.player1TotalAnswers,
        completedAt: quizGameResults.gameEndedAt,
      })
        .from(quizGameResults)
        .innerJoin(quizCollections, eq(quizGameResults.collectionId, quizCollections.id))
        .leftJoin(lessons, eq(quizGameResults.lessonId, lessons.id))
        .leftJoin(courses, eq(quizGameResults.courseId, courses.id))
        .leftJoin(courseLessons, eq(quizGameResults.lessonId, courseLessons.lessonId))
        .leftJoin(
          sql`"courses" AS "lessonCoursesAlias"`,
          sql`"courseLessons"."courseId" = "lessonCoursesAlias"."id"`
        )
        .leftJoin(lessonQuizLinks, eq(quizCollections.id, lessonQuizLinks.quizId))
        .leftJoin(
          sql`"lessons" AS "linkedLessonsAlias"`,
          sql`"lessonQuizLinks"."lessonId" = "linkedLessonsAlias"."id"`
        )
        .leftJoin(
          sql`"courseLessons" AS "linkedCourseLessonsAlias"`,
          sql`"linkedLessonsAlias"."id" = "linkedCourseLessonsAlias"."lessonId"`
        )
        .leftJoin(
          sql`"courses" AS "linkedCoursesAlias"`,
          sql`"linkedCourseLessonsAlias"."courseId" = "linkedCoursesAlias"."id"`
        )
        .where(and(
          eq(quizGameResults.player1Id, resolvedUserId),
          or(
            eq(quizGameResults.organizationId, organizationId),
            isNull(quizGameResults.organizationId)
          )
        ))
        .orderBy(desc(quizGameResults.gameEndedAt))
        .limit(100);

      const formattedAttempts = quizAttempts.map(attempt => {
        const percentage = attempt.totalAnswers > 0 
          ? (attempt.correctAnswers / attempt.totalAnswers) * 100 
          : 0;
        const effectiveCourseId = attempt.courseId || attempt.lessonCourseId || attempt.linkedLessonCourseId || null;
        const effectiveCourseName = attempt.courseName || attempt.lessonCourseName || attempt.linkedLessonCourseName || 'Standalone Quiz';
        const effectiveLessonId = attempt.lessonId || attempt.linkedLessonId || null;
        const effectiveLessonName = attempt.lessonName || attempt.linkedLessonName || null;
        return {
          id: attempt.id,
          gameId: attempt.gameId,
          collectionId: attempt.collectionId,
          collectionName: attempt.collectionName,
          lessonId: effectiveLessonId,
          lessonName: effectiveLessonName,
          courseId: effectiveCourseId,
          courseName: effectiveCourseName,
          score: attempt.score,
          correctAnswers: attempt.correctAnswers,
          totalAnswers: attempt.totalAnswers,
          percentage,
          passed: percentage >= 70,
          completedAt: attempt.completedAt,
        };
      });

      // Group by course, then by quiz, with per-quiz attempt numbering
      const groupedByCourse: Record<string, {
        courseId: string;
        courseName: string;
        quizzes: Record<string, {
          collectionId: string;
          collectionName: string;
          lessonId: string | null;
          lessonName: string | null;
          attempts: (typeof formattedAttempts[0] & { attemptNumber: number })[];
        }>;
      }> = {};

      // Sort attempts by completedAt ascending to calculate attempt numbers
      const sortedAttempts = [...formattedAttempts].sort((a, b) => {
        if (!a.completedAt || !b.completedAt) return 0;
        return new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime();
      });

      // Track attempt number per quiz
      const attemptCountByQuiz: Record<string, number> = {};

      for (const attempt of sortedAttempts) {
        const courseKey = attempt.courseId || 'standalone';
        const courseName = attempt.courseName || 'Standalone Quiz';
        
        if (!groupedByCourse[courseKey]) {
          groupedByCourse[courseKey] = {
            courseId: courseKey,
            courseName,
            quizzes: {},
          };
        }
        
        const quizKey = attempt.collectionId;
        if (!groupedByCourse[courseKey].quizzes[quizKey]) {
          groupedByCourse[courseKey].quizzes[quizKey] = {
            collectionId: attempt.collectionId,
            collectionName: attempt.collectionName,
            lessonId: attempt.lessonId,
            lessonName: attempt.lessonName,
            attempts: [],
          };
        }
        
        // Calculate per-quiz attempt number
        attemptCountByQuiz[quizKey] = (attemptCountByQuiz[quizKey] || 0) + 1;
        
        groupedByCourse[courseKey].quizzes[quizKey].attempts.push({
          ...attempt,
          attemptNumber: attemptCountByQuiz[quizKey],
        });
      }

      // Convert to array format
      const quizPerformance = Object.values(groupedByCourse).map(course => ({
        courseId: course.courseId,
        courseName: course.courseName,
        quizzes: Object.values(course.quizzes).map(quiz => ({
          ...quiz,
          // Sort attempts by most recent first for display
          attempts: quiz.attempts.sort((a, b) => {
            if (!a.completedAt || !b.completedAt) return 0;
            return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
          }),
        })),
      }));

      const quizSummary = {
        totalAttempts: formattedAttempts.length,
        totalPassed: formattedAttempts.filter(a => a.passed).length,
        averageScore: formattedAttempts.length > 0
          ? formattedAttempts.reduce((sum, a) => sum + a.percentage, 0) / formattedAttempts.length
          : 0,
      };

      res.json({
        user: {
          id: targetUser.id,
          firstName: targetUser.firstName || '',
          lastName: targetUser.lastName || '',
          email: targetUser.email,
          gamerName: targetUser.gamerName,
          country: targetUser.country,
          profileImageUrl: targetUser.profileImageUrl,
          bio: targetUser.bio,
        },
        courses: allCourses,
        quizAttempts: formattedAttempts,
        quizPerformance,
        quizSummary,
      });
    } catch (error) {
      console.error('Get user details error:', error);
      res.status(500).json({ error: "Failed to get user details" });
    }
  });

  // ==================== END ORG MANAGEMENT HUB ENDPOINTS ====================

  app.post("/api/organization/move-user", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const { userId, organizationId, targetType, targetId, unitId: directUnitId, subUnitId: directSubUnitId, teamId: directTeamId, subjectId: directSubjectId } = req.body;
      
      if (!userId || !organizationId) {
        return res.status(400).json({ error: "userId and organizationId are required" });
      }
      
      const isOrgAdmin = await hasOrgAdminWriteAccess(req, organizationId);
      if (!isOrgAdmin) {
        return res.status(403).json({ error: "Only organization admins can move users" });
      }
      
      let unitId: string | undefined;
      let subjectId: string | undefined;
      let subUnitId: string | undefined;
      let teamId: string | undefined;
      
      if (targetType && targetId) {
        if (targetType === 'department') {
          const unit = await storage.getOrganizationUnit(targetId);
          if (!unit) {
            return res.status(404).json({ error: "Department not found" });
          }
          if (unit.organizationId !== organizationId) {
            return res.status(400).json({ error: "Department does not belong to this organization" });
          }
          unitId = targetId;
          subjectId = undefined;
          subUnitId = undefined;
          teamId = undefined;
        } else if (targetType === 'subject') {
          const [subjectLink] = await db
            .select({ unitId: unitSubjects.unitId })
            .from(unitSubjects)
            .innerJoin(organizationUnits, eq(unitSubjects.unitId, organizationUnits.id))
            .where(and(
              eq(unitSubjects.subjectId, targetId),
              eq(organizationUnits.organizationId, organizationId)
            ))
            .limit(1);
          if (!subjectLink) {
            return res.status(404).json({ error: "Subject not found in this organization hierarchy" });
          }
          unitId = subjectLink.unitId;
          subjectId = targetId;
          subUnitId = undefined;
          teamId = undefined;
        } else if (targetType === 'unit') {
          const subUnit = await storage.getOrganizationSubUnit(targetId);
          if (!subUnit) {
            return res.status(404).json({ error: "Unit not found" });
          }
          const parentUnit = await storage.getOrganizationUnit(subUnit.unitId);
          if (!parentUnit || parentUnit.organizationId !== organizationId) {
            return res.status(400).json({ error: "Unit does not belong to this organization" });
          }
          unitId = subUnit.unitId;
          subjectId = directSubjectId;
          if (subjectId) {
            const [subjectLink] = await db
              .select({ id: unitSubjects.id })
              .from(unitSubjects)
              .where(and(
                eq(unitSubjects.unitId, unitId),
                eq(unitSubjects.subjectId, subjectId)
              ))
              .limit(1);
            if (!subjectLink) {
              return res.status(400).json({ error: "Subject does not belong to this grade" });
            }
          }
          subUnitId = targetId;
          teamId = undefined;
        } else if (targetType === 'team') {
          const team = await storage.getOrganizationTeam(targetId);
          if (!team) {
            return res.status(404).json({ error: "Team not found" });
          }
          const parentSubUnit = await storage.getOrganizationSubUnit(team.subUnitId);
          if (!parentSubUnit) {
            return res.status(404).json({ error: "Parent unit not found" });
          }
          const parentUnit = await storage.getOrganizationUnit(parentSubUnit.unitId);
          if (!parentUnit || parentUnit.organizationId !== organizationId) {
            return res.status(400).json({ error: "Team does not belong to this organization" });
          }
          unitId = parentSubUnit.unitId;
          subjectId = directSubjectId;
          if (subjectId) {
            const [subjectLink] = await db
              .select({ id: unitSubjects.id })
              .from(unitSubjects)
              .where(and(
                eq(unitSubjects.unitId, unitId),
                eq(unitSubjects.subjectId, subjectId)
              ))
              .limit(1);
            if (!subjectLink) {
              return res.status(400).json({ error: "Subject does not belong to this grade" });
            }
          }
          subUnitId = team.subUnitId;
          teamId = targetId;
        } else {
          return res.status(400).json({ error: "Invalid targetType. Must be 'department', 'subject', 'unit', or 'team'" });
        }
      } else if (directUnitId || directSubUnitId || directTeamId) {
        unitId = directUnitId;
        subjectId = directSubjectId;
        subUnitId = directSubUnitId;
        teamId = directTeamId;
      } else {
        return res.status(400).json({ error: "Either targetType/targetId or unitId/subUnitId/teamId are required" });
      }
      
      const assignment = await storage.assignUserToUnit(userId, organizationId, unitId!, subUnitId, teamId, subjectId);
      res.json({ success: true, assignment });
    } catch (error) {
      console.error('Move user error:', error);
      res.status(500).json({ error: "Failed to move user" });
    }
  });

  app.get("/api/organization/unit-subjects", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.json([]);
      }
      
      const requestedOrgId = (req.query.organizationId as string | undefined)?.trim() || null;
      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      const organizationId = requestedOrgId || effectiveOrg.organizationId;
      if (!organizationId) {
        return res.status(400).json({
          error: "Organization context required",
          message: "Select an organization (or impersonate one) before loading unit subjects",
        });
      }

      const hasAccess = await hasOrgMemberAccess(req, organizationId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const units = await storage.getOrganizationUnits(organizationId);
      const allUnitSubjects = [];
      
      for (const unit of units) {
        const unitSubjectsResult = await storage.getUnitSubjects(unit.id);
        allUnitSubjects.push(...unitSubjectsResult.map((us: any) => ({ ...us, unitId: unit.id, unitName: unit.name })));
      }
      
      res.json(allUnitSubjects);
    } catch (error) {
      console.error('Get organization unit-subjects error:', error);
      res.status(500).json({ error: "Failed to fetch unit-subject assignments" });
    }
  });

  // ==================== PACKAGE RECOMMENDATION ROUTES ====================
  
  // GET /api/organizations/:id/package-recommendation - Get package upgrade recommendation
  app.get("/api/organizations/:id/package-recommendation", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const organizationId = req.params.id;
      const userId = req.session.userId;
      
      // Verify user is org admin for this organization
      const isAdmin = await verifyOrgAdmin(userId, organizationId);
      const hasAdminAccess = await hasOrgAdminWriteAccess(req, organizationId);
      if (!isAdmin && !hasAdminAccess) {
        return res.status(403).json({ error: "Not authorized to view package recommendations" });
      }
      
      const currency = (req.query.currency as string) || 'ZAR';
      const recommendation = await packageRecommendationService.getRecommendation(organizationId, currency);
      res.json(recommendation);
    } catch (error: any) {
      console.error("[Package Recommendation] Error getting recommendation:", error);
      res.status(500).json({ error: "Failed to get package recommendation" });
    }
  });

  // POST /api/organizations/:id/dismiss-recommendation - Dismiss recommendation for 30 days
  app.post("/api/organizations/:id/dismiss-recommendation", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const organizationId = req.params.id;
      const userId = req.session.userId;
      
      // Verify user is org admin for this organization
      const isAdmin = await verifyOrgAdmin(userId, organizationId);
      const hasAdminAccess = await hasOrgAdminWriteAccess(req, organizationId);
      if (!isAdmin && !hasAdminAccess) {
        return res.status(403).json({ error: "Not authorized to dismiss recommendations" });
      }
      
      await packageRecommendationService.dismissRecommendation(organizationId, userId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Package Recommendation] Error dismissing recommendation:", error);
      res.status(500).json({ error: "Failed to dismiss recommendation" });
    }
  });

  console.log('[Routes] Organization routes registered');
}
