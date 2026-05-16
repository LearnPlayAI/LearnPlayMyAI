// @ts-nocheck
/**
 * SuperAdmin Routes
 * 
 * All /api/superadmin/* routes for platform administration.
 * Extracted from server/routes.ts for better organization.
 */

import { Router, Request, Response, Express } from 'express';
import { db } from '../db';
import * as schema from '@shared/schema';
import { getBaseUrl } from '../config/base-url';
import { users, organizations } from '@shared/schema';
import { eq, and, gte, lte, desc, sql, inArray } from 'drizzle-orm';
import crypto from 'crypto';
import axios from 'axios';

import { isSuperAdmin, isSuperAdminOrCustSuper } from '../adminAuth';
import { 
  storage,
  withSessionAuthMiddleware,
} from './sharedResources';
import { sendError, ErrorCode } from '../utils/errorResponses';
import { PaymentService } from '../services/paymentService';
import { PayoutService } from '../services/payoutService';
import { CurrencyService } from '../services/currencyService';
import { SessionContextService } from '../services/sessionContextService';
import { AnalyticsService } from '../services/analyticsService';
import { isOnPremMode, isPaymentGatewayEnabled } from '../featureFlags';
import { IntegrationConfigService } from '../services/integrationConfigService';

const router = Router();

function denyOnpremPaymentOperations(res: Response): boolean {
  if (isOnPremMode() || !isPaymentGatewayEnabled()) {
    res.status(403).json({
      error: 'Payment integration is disabled for this deployment mode.',
    });
    return true;
  }
  return false;
}

async function getLatestPlatformPaymentSettings() {
  const [settings] = await db
    .select()
    .from(schema.platformPaymentSettings)
    .orderBy(
      desc(schema.platformPaymentSettings.updatedAt),
      desc(schema.platformPaymentSettings.createdAt),
    )
    .limit(1);
  return settings;
}

// ========================================
// PAYMENT SETTINGS
// ========================================

router.get('/payment-settings', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    if (denyOnpremPaymentOperations(res)) return;
    const settings = await getLatestPlatformPaymentSettings();

    if (!settings) {
      const [newSettings] = await db
        .insert(schema.platformPaymentSettings)
        .values({ yocoMode: 'test' })
        .returning();
      
      return res.json({ paymentSettings: newSettings });
    }

    res.json({ paymentSettings: settings });
  } catch (error: any) {
    console.error("[Payment Settings] Error fetching settings:", error);
    res.status(500).json({ error: "Failed to fetch payment settings" });
  }
});

router.patch('/payment-settings', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    if (denyOnpremPaymentOperations(res)) return;
    const userId = req.session.userId!;
    const { yocoMode } = req.body;

    if (!yocoMode || !['test', 'live'].includes(yocoMode)) {
      return res.status(400).json({ error: "Invalid YOCO mode. Must be 'test' or 'live'." });
    }

    const existing = await getLatestPlatformPaymentSettings();

    let updated;
    if (existing) {
      [updated] = await db
        .update(schema.platformPaymentSettings)
        .set({
          yocoMode,
          updatedBy: userId,
          updatedAt: new Date()
        })
        .where(eq(schema.platformPaymentSettings.id, existing.id))
        .returning();
      
      console.log(`[Payment Settings] YOCO mode updated to ${yocoMode} by SuperAdmin ${userId}`);
    } else {
      [updated] = await db
        .insert(schema.platformPaymentSettings)
        .values({
          yocoMode,
          updatedBy: userId
        })
        .returning();
      
      console.log(`[Payment Settings] YOCO mode created as ${yocoMode} by SuperAdmin ${userId}`);
    }

    res.json({ paymentSettings: updated });
  } catch (error: any) {
    console.error("[Payment Settings] Error updating settings:", error);
    res.status(500).json({ error: "Failed to update payment settings" });
  }
});

// ========================================
// WEBHOOK STATUS & MANAGEMENT
// ========================================

router.get('/webhook-status', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    if (denyOnpremPaymentOperations(res)) return;
    const mode = await PaymentService.getYocoMode();
    
    const webhookSecretConfigured = !!(await IntegrationConfigService.getSecret('yoco', 'webhookSecret'));
    
    const [activeWebhook] = await db
      .select()
      .from(schema.webhookRegistrations)
      .where(and(
        eq(schema.webhookRegistrations.mode, mode),
        eq(schema.webhookRegistrations.isActive, true)
      ))
      .orderBy(desc(schema.webhookRegistrations.registeredAt))
      .limit(1);

    const webhookUrl = `${getBaseUrl()}/api/webhooks/yoco`;
    
    res.json({
      currentMode: mode,
      webhookSecretConfigured,
      webhookUrl,
      activeWebhook: activeWebhook || null
    });
  } catch (error: any) {
    console.error("[Webhook Status] Error fetching status:", error);
    res.status(500).json({ error: "Failed to fetch webhook status" });
  }
});

router.post('/register-webhook', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    if (denyOnpremPaymentOperations(res)) return;
    const userId = req.session.userId!;
    
    const secretKey = String((await IntegrationConfigService.getSecret('yoco', 'liveSecretKey')) || '').trim();

    if (!secretKey) {
      return res.status(409).json({ 
        error: 'YOCO live secret key not configured in Integration Settings. Webhooks must be registered with LIVE credentials to obtain the whsec_ secret.'
      });
    }

    const webhookUrl = `${getBaseUrl()}/api/webhooks/yoco`;

    console.log(`[Webhook Registration] Starting clean re-registration using LIVE credentials by SuperAdmin ${userId}`);

    const existingWebhooks = await db
      .select()
      .from(schema.webhookRegistrations);

    if (existingWebhooks.length > 0) {
      for (const webhook of existingWebhooks) {
        console.log(`[Webhook Registration] Deleting existing webhook ${webhook.webhookId} from YOCO...`);
        try {
          await axios.delete(
            `https://payments.yoco.com/api/webhooks/${webhook.webhookId}`,
            {
              headers: {
                'Authorization': `Bearer ${secretKey}`
              }
            }
          );
          console.log(`[Webhook Registration] Successfully deleted webhook ${webhook.webhookId} from YOCO`);
        } catch (deleteError: any) {
          console.log(`[Webhook Registration] Could not delete webhook ${webhook.webhookId} from YOCO (may already be deleted): ${deleteError.response?.status || deleteError.message}`);
        }
      }
    }

    try {
      console.log(`[Webhook Registration] Checking for existing webhooks on YOCO...`);
      const listResponse = await axios.get(
        'https://payments.yoco.com/api/webhooks',
        {
          headers: {
            'Authorization': `Bearer ${secretKey}`
          }
        }
      );
      
      const yocoWebhooks = listResponse.data?.subscriptions || listResponse.data || [];
      console.log(`[Webhook Registration] Found ${yocoWebhooks.length} existing webhooks on YOCO`);
      for (const yocoWebhook of yocoWebhooks) {
        if (yocoWebhook.url === webhookUrl || yocoWebhook.name?.includes('learnplay')) {
          console.log(`[Webhook Registration] Found matching webhook ${yocoWebhook.id} on YOCO, deleting...`);
          try {
            await axios.delete(
              `https://payments.yoco.com/api/webhooks/${yocoWebhook.id}`,
              {
                headers: {
                  'Authorization': `Bearer ${secretKey}`
                }
              }
            );
            console.log(`[Webhook Registration] Successfully deleted webhook ${yocoWebhook.id} from YOCO`);
          } catch (deleteError: any) {
            console.log(`[Webhook Registration] Could not delete webhook ${yocoWebhook.id}: ${deleteError.response?.status || deleteError.message}`);
          }
        }
      }
    } catch (listError: any) {
      console.log(`[Webhook Registration] Could not list YOCO webhooks: ${listError.message}`);
    }

    await db.delete(schema.webhookRegistrations);

    console.log(`[Webhook Registration] Registering new webhook at ${webhookUrl}`);
    const response = await axios.post(
      'https://payments.yoco.com/api/webhooks',
      {
        name: 'learnplay-live',
        url: webhookUrl
      },
      {
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const webhookData = response.data;
    const webhookSecret = String(webhookData?.secret || "").trim();
    if (webhookSecret) {
      await IntegrationConfigService.setProviderSecret({
        provider: "yoco",
        secretKey: "webhookSecret",
        value: webhookSecret,
        updatedBy: userId,
      });
    }

    const [newWebhook] = await db
      .insert(schema.webhookRegistrations)
      .values({
        webhookId: webhookData.id,
        mode: 'live',
        webhookUrl,
        isActive: true,
        registeredBy: userId
      })
      .returning();

    console.log(`[Webhook Registration] Webhook registered successfully: ${webhookData.id} (LIVE credentials)`);

    res.json({
      webhookId: webhookData.id,
      webhookSecret,
      webhookSecretSaved: !!webhookSecret,
      webhookUrl: webhookData.url,
      mode: webhookData.mode,
      registeredAt: newWebhook.registeredAt
    });
  } catch (error: any) {
    console.error("[Webhook Registration] Error registering webhook:", error);
    
    if (error.response) {
      console.error("[Webhook Registration] YOCO API Response:", {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        headers: error.response.headers
      });
    }
    
    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;
      
      if (status === 401) {
        return res.status(401).json({ 
          error: 'Invalid YOCO LIVE credentials. Please check Integration Settings.'
        });
      } else if (status === 409) {
        return res.status(409).json({ 
          error: 'Webhook URL already registered. Please delete existing webhook first.' 
        });
      } else {
        return res.status(status).json({ 
          error: errorData?.message || errorData?.error || "Failed to register webhook" 
        });
      }
    }
    
    return sendError(res, 500, "Failed to register webhook. Please try again.", ErrorCode.EXTERNAL_SERVICE_ERROR);
  }
});

router.delete('/webhook/:webhookId', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    if (denyOnpremPaymentOperations(res)) return;
    const { webhookId } = req.params;
    
    const secretKey = String((await IntegrationConfigService.getSecret('yoco', 'liveSecretKey')) || '').trim();

    if (!secretKey) {
      return res.status(409).json({ 
        error: 'YOCO live secret key not configured in Integration Settings. Webhook operations require LIVE credentials.'
      });
    }

    console.log(`[Webhook Delete] Deleting webhook ${webhookId} using LIVE credentials`);

    await axios.delete(
      `https://payments.yoco.com/api/webhooks/${webhookId}`,
      {
        headers: {
          'Authorization': `Bearer ${secretKey}`
        }
      }
    );

    await db
      .delete(schema.webhookRegistrations)
      .where(eq(schema.webhookRegistrations.webhookId, webhookId));

    console.log(`[Webhook Delete] Webhook ${webhookId} deleted successfully`);
    res.json({ success: true, message: "Webhook deleted successfully" });
  } catch (error: any) {
    console.error("[Webhook Delete] Error deleting webhook:", error);
    
    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;
      
      if (status === 404) {
        await db
          .delete(schema.webhookRegistrations)
          .where(eq(schema.webhookRegistrations.webhookId, req.params.webhookId));
        
        return res.json({ success: true, message: "Webhook was already deleted or doesn't exist" });
      } else if (status === 401) {
        return res.status(401).json({ 
          error: 'Invalid YOCO LIVE credentials. Please check Integration Settings.'
        });
      } else {
        return res.status(status).json({ 
          error: errorData?.message || errorData?.error || "Failed to delete webhook" 
        });
      }
    }
    
    return sendError(res, 500, "Failed to delete webhook. Please try again.", ErrorCode.EXTERNAL_SERVICE_ERROR);
  }
});

router.get('/webhooks/list', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    if (denyOnpremPaymentOperations(res)) return;
    const secretKey = String((await IntegrationConfigService.getSecret('yoco', 'liveSecretKey')) || '').trim();

    if (!secretKey) {
      return res.status(409).json({ 
        error: 'YOCO live secret key not configured in Integration Settings. Webhook operations require LIVE credentials.'
      });
    }

    console.log(`[Webhook List] Listing webhooks using LIVE credentials`);

    const response = await axios.get(
      'https://payments.yoco.com/api/webhooks',
      {
        headers: {
          'Authorization': `Bearer ${secretKey}`
        }
      }
    );

    const webhooks = response.data?.subscriptions || response.data || [];
    console.log(`[Webhook List] Found ${webhooks.length} webhooks`);

    res.json({ 
      mode: 'live',
      webhooks: webhooks 
    });
  } catch (error: any) {
    console.error("[Webhook List] Error listing webhooks:", error);
    
    if (error.response) {
      return res.status(error.response.status).json({ 
        error: error.response.data?.message || "Failed to list webhooks" 
      });
    }
    
    return sendError(res, 500, "Failed to list webhooks. Please try again.", ErrorCode.EXTERNAL_SERVICE_ERROR);
  }
});

// ========================================
// ORGANIZATIONS
// ========================================

const ONPREM_MAIN_ORG_CONFIG_KEY = 'ONPREM_MAIN_ORGANIZATION_ID';

async function getOnpremMainOrganizationId(): Promise<string | null> {
  const [row] = await db
    .select({ value: schema.platformConfiguration.value })
    .from(schema.platformConfiguration)
    .where(eq(schema.platformConfiguration.key, ONPREM_MAIN_ORG_CONFIG_KEY))
    .limit(1);
  return row?.value ? String(row.value) : null;
}

async function setOnpremMainOrganizationId(organizationId: string, userId: string): Promise<void> {
  const [existing] = await db
    .select({ id: schema.platformConfiguration.id })
    .from(schema.platformConfiguration)
    .where(eq(schema.platformConfiguration.key, ONPREM_MAIN_ORG_CONFIG_KEY))
    .limit(1);

  if (existing?.id) {
    await db
      .update(schema.platformConfiguration)
      .set({
        value: organizationId,
        dataType: 'string',
        description: 'Primary organization used for on-prem enterprise licensing context',
        isEditable: true,
        lastModifiedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(schema.platformConfiguration.id, existing.id));
  } else {
    await db.insert(schema.platformConfiguration).values({
      key: ONPREM_MAIN_ORG_CONFIG_KEY,
      value: organizationId,
      dataType: 'string',
      description: 'Primary organization used for on-prem enterprise licensing context',
      isEditable: true,
      lastModifiedBy: userId,
    });
  }
}

router.get('/organizations', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const configuredMainOrganizationId = await getOnpremMainOrganizationId();
    const orgs = await storage.getAllOrganizations();
    const mainOrganizationId = configuredMainOrganizationId || orgs[0]?.id || null;
    
    // Enhance organizations with package data
    const enrichedOrgs = await Promise.all(orgs.map(async (org: any) => {
      try {
        let packageData = null;
        let roleCounts: any = {};

        // Try to get package assignment for this organization - gracefully handle if tables don't exist
        try {
          const [packageAssignment] = await db
            .select()
            .from(schema.organizationPackageAssignments)
            .where(eq(schema.organizationPackageAssignments.organizationId, org.id))
            .limit(1);
          
          if (packageAssignment) {
            // Get the package details
            const [packageInfo] = await db
              .select()
              .from(schema.businessPackages)
              .where(eq(schema.businessPackages.id, packageAssignment.packageId))
              .limit(1);
            
            packageData = {
              tier: packageInfo?.tier || 'N/A',
              name: packageInfo?.name || 'N/A',
              maxLearners: packageInfo?.maxLearners || 0,
              maxTeachers: packageInfo?.maxTeachers || 0,
              maxOrgAdmins: packageInfo?.maxOrgAdmins || 0,
              status: packageAssignment.status,
              currency: packageAssignment.currency,
            };
          }
        } catch (packageError: any) {
          // If the business package tables haven't been migrated yet, skip package enrichment
          if (packageError.message?.includes('does not exist') || packageError.message?.includes('relation')) {
            console.warn(`[Organizations] Package tables not found for org ${org.id} - tables may not be migrated yet`);
            packageData = null;
          } else {
            // Log unexpected errors but don't fail the entire endpoint
            console.error(`Error fetching package data for org ${org.id}:`, packageError);
            packageData = null;
          }
        }
        
        // Count active users by role
        try {
          const roleStats = await db.execute(sql`
            SELECT 
              uor.role,
              COUNT(DISTINCT uor."userId") as count
            FROM "userOrganizationRoles" uor
            WHERE uor."organizationId" = ${org.id}
            GROUP BY uor.role
          `);
          
          roleCounts = roleStats.rows.reduce((acc: any, row: any) => {
            acc[row.role] = row.count;
            return acc;
          }, {});
        } catch (roleError: any) {
          console.error(`Error counting roles for org ${org.id}:`, roleError);
          roleCounts = {};
        }
        
        // Calculate learner count (sum of student and employee roles)
        const learnerCount = (roleCounts.student || 0) + (roleCounts.employee || 0);
        // Calculate teacher count (sum of teacher and team_lead roles)
        const teacherCount = (roleCounts.teacher || 0) + (roleCounts.team_lead || 0);
        // Get admin count (org_admin role)
        const adminCount = roleCounts.org_admin || 0;
        
        return {
          ...org,
          isMainOrganization: mainOrganizationId ? org.id === mainOrganizationId : false,
          totalUsers: org.totalUsers || 0,
          activeUsers: org.activeUsers || 0,
          adminCount,
          teacherCount,
          learnerCount,
          packageTier: packageData?.tier || 'N/A',
          packageName: packageData?.name || 'N/A',
          packageStatus: packageData?.status || 'N/A',
          studentCount: learnerCount,
          seatUtilization: packageData ? {
            learners: {
              current: learnerCount,
              max: packageData.maxLearners
            },
            teachers: {
              current: teacherCount,
              max: packageData.maxTeachers
            },
            admins: {
              current: adminCount,
              max: packageData.maxOrgAdmins
            }
          } : null,
          mrrContribution: 'N/A', // Will be populated when billing data is available
        };
      } catch (error) {
        console.error(`Error enriching org ${org.id} with package data:`, error);
        // Return org without package data if enrichment fails
        return {
          ...org,
          isMainOrganization: mainOrganizationId ? org.id === mainOrganizationId : false,
          totalUsers: org.totalUsers || 0,
          activeUsers: org.activeUsers || 0,
          adminCount: 0,
          teacherCount: 0,
          learnerCount: 0,
          packageTier: 'N/A',
          packageName: 'N/A',
          packageStatus: 'N/A',
          studentCount: 0,
          seatUtilization: null,
          mrrContribution: 'N/A',
        };
      }
    }));
    
    res.json(enrichedOrgs);
  } catch (error) {
    console.error("Get organizations error:", error);
    // Always try to return organizations even if enrichment fails completely
    try {
      const orgs = await storage.getAllOrganizations();
      const fallbackOrgs = orgs.map((org: any) => ({
        ...org,
        isMainOrganization: false,
        totalUsers: org.totalUsers || 0,
        activeUsers: org.activeUsers || 0,
        adminCount: 0,
        teacherCount: 0,
        learnerCount: 0,
        packageTier: 'N/A',
        packageName: 'N/A',
        packageStatus: 'N/A',
        studentCount: 0,
        seatUtilization: null,
        mrrContribution: 'N/A',
      }));
      res.json(fallbackOrgs);
    } catch (fallbackError) {
      console.error("Fallback failed to get organizations:", fallbackError);
      res.status(500).json({ error: "Failed to get organizations" });
    }
  }
});

router.get('/organizations/main', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    let organizationId = await getOnpremMainOrganizationId();
    if (!organizationId) {
      const orgs = await storage.getAllOrganizations();
      organizationId = orgs[0]?.id || null;
    }
    res.json({ organizationId });
  } catch (error) {
    console.error('Get main organization error:', error);
    res.status(500).json({ error: 'Failed to get main organization' });
  }
});

router.post('/organizations/main', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.body;
    if (!organizationId || typeof organizationId !== 'string') {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    const org = await storage.getOrganization(organizationId);
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const userId = req.session.userId!;
    await setOnpremMainOrganizationId(organizationId, userId);

    res.json({
      success: true,
      organizationId,
      message: `Main organization set to ${org.name}`,
    });
  } catch (error) {
    console.error('Set main organization error:', error);
    res.status(500).json({ error: 'Failed to set main organization' });
  }
});

router.post('/organizations/:organizationId/active', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const { isActive } = req.body;
    
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: "isActive must be a boolean" });
    }
    
    const org = await storage.getOrganization(organizationId);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }
    
    const updated = await storage.updateOrganization(organizationId, { isActive });
    if (!updated) {
      return res.status(500).json({ error: "Failed to update organization" });
    }
    
    console.log(`[OrgManagement] Organization ${organizationId} (${org.name}) isActive set to ${isActive} by user ${req.session.userId}`);
    
    res.json({ 
      success: true, 
      message: `Organization ${isActive ? 'enabled' : 'disabled'} successfully`,
      organizationId,
      isActive 
    });
  } catch (error) {
    console.error("Toggle organization active status error:", error);
    res.status(500).json({ error: "Failed to update organization status" });
  }
});

router.get('/organizations/:organizationId/billing/audit-log', isSuperAdmin, async (req: Request, res: Response) => {
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

// ========================================
// IMPERSONATION
// ========================================

router.get('/impersonation', withSessionAuthMiddleware, isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const impersonatedOrg = req.session.context?.impersonatedOrganization || null;
    res.json({
      isImpersonating: !!impersonatedOrg,
      impersonatedOrganization: impersonatedOrg ? {
        id: impersonatedOrg.orgId,
        name: impersonatedOrg.orgName,
        type: impersonatedOrg.orgType,
      } : null,
    });
  } catch (error) {
    console.error("Get impersonation status error:", error);
    res.status(500).json({ error: "Failed to get impersonation status" });
  }
});

router.post('/impersonation', withSessionAuthMiddleware, isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.body;
    
    if (!organizationId) {
      return res.status(400).json({ error: "Organization ID is required" });
    }

    const organization = await storage.getOrganization(organizationId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    const previousOrg = req.session.context?.impersonatedOrganization || null;
    const isSwitching = previousOrg !== null && previousOrg.orgId !== organizationId;

    const impersonatedOrg = {
      orgId: organization.id,
      orgName: organization.name,
      orgType: organization.type as 'education' | 'business' | 'elearning',
      roles: ['org_admin'],
    };

    if (req.session.context) {
      req.session.context.impersonatedOrganization = impersonatedOrg;
    } else {
      const context = await SessionContextService.buildSessionContext(req.session.userId!);
      context.impersonatedOrganization = impersonatedOrg;
      req.session.context = context;
    }

    if (isSwitching) {
      console.log(`[SuperAdmin Impersonation] User ${req.session.userId} switched impersonation from org ${previousOrg!.orgId} (${previousOrg!.orgName}) to org ${organization.id} (${organization.name})`);
    } else if (previousOrg && previousOrg.orgId === organizationId) {
      console.log(`[SuperAdmin Impersonation] User ${req.session.userId} refreshed impersonation for org ${organization.id} (${organization.name})`);
    } else {
      console.log(`[SuperAdmin Impersonation] User ${req.session.userId} started impersonating org ${organization.id} (${organization.name})`);
    }

    await new Promise<void>((resolve, reject) => {
      req.session.save((err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({
      success: true,
      message: isSwitching 
        ? `Switched to acting as OrgAdmin for ${organization.name}`
        : `Now acting as OrgAdmin for ${organization.name}`,
      impersonatedOrganization: {
        id: organization.id,
        name: organization.name,
        type: organization.type,
      },
    });
  } catch (error) {
    console.error("Set impersonation error:", error);
    res.status(500).json({ error: "Failed to set impersonation" });
  }
});

router.delete('/impersonation', withSessionAuthMiddleware, isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const previousOrg = req.session.context?.impersonatedOrganization || null;

    if (!previousOrg) {
      return res.json({
        success: true,
        message: "Not currently impersonating any organization",
      });
    }

    if (req.session.context) {
      req.session.context.impersonatedOrganization = null;
      const fallbackOrgId = req.session.context.primaryOrganization?.orgId || req.session.context.organizations?.[0]?.orgId || null;
      if (fallbackOrgId) {
        req.session.organizationId = fallbackOrgId;
        if (req.session.user && typeof req.session.user === 'object') {
          (req.session.user as { organizationId?: string }).organizationId = fallbackOrgId;
        }
      } else {
        delete req.session.organizationId;
        if (req.session.user && typeof req.session.user === 'object') {
          delete (req.session.user as { organizationId?: string }).organizationId;
        }
      }
    }

    console.log(`[SuperAdmin Impersonation] User ${req.session.userId} stopped impersonating org ${previousOrg.orgId} (${previousOrg.orgName})`);

    await new Promise<void>((resolve, reject) => {
      req.session.save((err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({
      success: true,
      message: `Stopped acting as OrgAdmin for ${previousOrg.orgName}`,
    });
  } catch (error) {
    console.error("Clear impersonation error:", error);
    res.status(500).json({ error: "Failed to clear impersonation" });
  }
});

// ========================================
// METRICS
// ========================================

router.get('/metrics', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const orgs = await storage.getAllOrganizations();
    const activeTrials = orgs.filter((org: any) => {
      if (!org.trialEndDate) return false;
      return new Date(org.trialEndDate) > new Date() && org.subscriptionStatus === 'trial';
    }).length;

    // Get package distribution with graceful fallback if tables don't exist
    let distribution: any = {};
    try {
      const packageDistribution = await db.execute(sql`
        SELECT 
          bp.tier,
          bp.name,
          COUNT(opa.id) as count
        FROM "organizationPackageAssignments" opa
        LEFT JOIN "businessPackages" bp ON opa."packageId" = bp.id
        WHERE opa.status = 'active'
        GROUP BY bp.tier, bp.name
        ORDER BY bp.tier
      `);
      
      distribution = packageDistribution.rows.reduce((acc: any, row: any) => {
        acc[row.tier || 'unassigned'] = {
          name: row.name || 'No Package',
          count: row.count || 0
        };
        return acc;
      }, {});
    } catch (tableError: any) {
      // If the business package tables haven't been migrated yet, return empty distribution
      if (tableError.message?.includes('does not exist') || tableError.message?.includes('relation') || tableError.code === 'ENOENT') {
        console.warn("Package assignment tables not found - using empty distribution. Tables may not be migrated yet.", tableError.message);
        distribution = {};
      } else {
        // Re-throw unexpected errors
        throw tableError;
      }
    }

    // Calculate total MRR from active package assignments (seat counts × per-seat prices)
    let totalMRR = 0;
    try {
      const mrrResult = await db.execute(sql`
        SELECT COALESCE(SUM(
          (COALESCE(bp."maxLearners", 0) * CAST(bpp."pricePerLearner" AS DECIMAL)) +
          (COALESCE(bp."maxTeachers", 0) * CAST(bpp."pricePerTeacher" AS DECIMAL)) +
          (COALESCE(bp."maxOrgAdmins", 0) * CAST(bpp."pricePerOrgAdmin" AS DECIMAL))
        ), 0) as total_mrr
        FROM "organizationPackageAssignments" opa
        LEFT JOIN "businessPackages" bp ON opa."packageId" = bp.id
        LEFT JOIN "businessPackagePrices" bpp ON opa."packageId" = bpp."packageId" 
          AND opa.currency = bpp.currency
        WHERE opa.status = 'active'
      `);
      totalMRR = parseFloat(mrrResult.rows[0]?.total_mrr || '0');
    } catch (mrrError: any) {
      console.warn("Failed to calculate MRR:", mrrError.message);
      totalMRR = 0;
    }

    res.json({
      totalOrgs: orgs.length,
      activeTrials,
      expiredTrials: orgs.length - activeTrials,
      totalMRR,
      packageDistribution: distribution,
    });
  } catch (error) {
    console.error("Get metrics error:", error);
    res.status(500).json({ error: "Failed to get metrics" });
  }
});

// ========================================
// JOIN REQUESTS (SuperAdmin View)
// ========================================

router.get('/join-requests', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    
    const requests = await storage.getAllJoinRequests(status as string | undefined);
    
    const enrichedRequests = await Promise.all(
      requests.map(async (request) => {
        const user = await storage.getUser(request.userId);
        const organization = await storage.getOrganization(request.organizationId);
        const unit = request.requestedUnitId ? await storage.getOrganizationUnit(request.requestedUnitId) : null;
        const subUnit = request.requestedSubUnitId ? await storage.getOrganizationSubUnit(request.requestedSubUnitId) : null;
        
        let requestedSubjects: any[] = [];
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
          organization: organization ? {
            id: organization.id,
            name: organization.name,
            inviteCode: organization.inviteCode
          } : null,
          requestedUnit: unit,
          requestedSubUnit: subUnit,
          requestedSubjects
        };
      })
    );
    
    res.json(enrichedRequests);
  } catch (error) {
    console.error("Get all join requests error:", error);
    res.status(500).json({ error: "Failed to retrieve join requests" });
  }
});

// ========================================
// INITIALIZE CATALOGS
// ========================================

router.post('/initialize-catalogs', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    console.log("🎮 SuperAdmin triggered manual catalog initialization");
    const { ensureGamificationCatalogs } = await import('../ensureCatalogs');
    const result = await ensureGamificationCatalogs();
    
    res.json({
      success: true,
      message: "Gamification catalogs initialized successfully",
      ...result,
    });
  } catch (error: any) {
    console.error("Initialize catalogs error:", error);
    res.status(500).json({ 
      error: "Failed to initialize gamification catalogs",
      details: error?.message || "Unknown error"
    });
  }
});

// ========================================
// PAYOUTS (using PayoutProcessorService from original routes.ts)
// ========================================

router.get('/payouts', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { currency, status, organizationId, limit = '50', offset = '0' } = req.query;

    const { PayoutProcessorService } = await import('../services/payoutProcessorService');

    const payouts = await PayoutProcessorService.getPayouts({
      currency: currency as 'ZAR' | 'USD' | 'EUR' | undefined,
      status: status as 'pending' | 'processing' | 'paid' | 'failed' | undefined,
      organizationId: organizationId as string | undefined,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });

    res.json(payouts);
  } catch (error) {
    console.error('Error getting payouts:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/payouts/:id/breakdown', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id: payoutId } = req.params;

    const { PayoutProcessorService } = await import('../services/payoutProcessorService');

    const breakdown = await PayoutProcessorService.getPayoutBreakdown(payoutId);

    res.json(breakdown);
  } catch (error) {
    console.error('Error getting payout breakdown:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/payouts/:id/mark-paid', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id: payoutId } = req.params;
    const { paymentReference, paymentMethod } = req.body;

    const { PayoutProcessorService } = await import('../services/payoutProcessorService');

    const payout = await PayoutProcessorService.markAsPaid(payoutId, {
      paymentReference,
      paymentMethod: paymentMethod || 'Bank Transfer',
    });

    res.json(payout);
  } catch (error) {
    console.error('Error marking payout as paid:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/payouts/:id/invoice', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id: payoutId } = req.params;

    const { PayoutProcessorService } = await import('../services/payoutProcessorService');

    const invoice = await PayoutProcessorService.generateInvoice(payoutId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=payout-${payoutId}.pdf`);
    res.send(invoice);
  } catch (error) {
    console.error('Error downloading invoice:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ========================================
// ANALYTICS
// ========================================

router.get('/analytics/revenue', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { currency = 'ZAR', startDate, endDate } = req.query;

    const { PlatformAnalyticsService } = await import('../services/platformAnalyticsService');

    const revenue = await PlatformAnalyticsService.getTotalRevenue({
      displayCurrency: currency as 'ZAR' | 'USD' | 'EUR',
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.json(revenue);
  } catch (error) {
    console.error('Error getting platform revenue:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/analytics/top-performers', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { limit = '10', metric = 'revenue' } = req.query;

    const { PlatformAnalyticsService } = await import('../services/platformAnalyticsService');

    const topPerformers = await PlatformAnalyticsService.getTopPerformers(
      parseInt(limit as string)
    );

    res.json(topPerformers);
  } catch (error) {
    console.error('Error getting top performers:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/analytics/org-breakdown', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { PlatformAnalyticsService } = await import('../services/platformAnalyticsService');

    const breakdown = await PlatformAnalyticsService.getOrgTypeBreakdown();

    res.json(breakdown);
  } catch (error) {
    console.error('Error getting org breakdown:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/analytics/download-report', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { format = 'csv', startDate, endDate, currency = 'ZAR' } = req.body;

    const { PlatformAnalyticsService } = await import('../services/platformAnalyticsService');

    const report = await PlatformAnalyticsService.generateCSVReport({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=platform-report.${format}`);
    res.send(report);
  } catch (error) {
    console.error('Error downloading report:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/analytics/licenses', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const {
      status,
      tier,
      dateFrom,
      dateTo,
      search,
      limit = '50',
      offset = '0'
    } = req.query;

    const limitNum = Math.min(parseInt(limit as string) || 50, 100);
    const offsetNum = parseInt(offset as string) || 0;

    const licenseFilters: any[] = [];
    
    if (status && status !== 'all') {
      licenseFilters.push(eq(schema.userLicenses.status, status as 'active' | 'inactive' | 'expired'));
    }
    
    if (tier && tier !== 'all') {
      licenseFilters.push(eq(schema.userLicenses.tier, tier as 'blue' | 'red' | 'gold'));
    }
    
    if (dateFrom) {
      licenseFilters.push(gte(schema.userLicenses.activatedAt, new Date(dateFrom as string)));
    }
    
    if (dateTo) {
      licenseFilters.push(lte(schema.userLicenses.activatedAt, new Date(dateTo as string)));
    }

    const allLicenses = await db.select().from(schema.userLicenses);
    
    const totalLicenses = allLicenses.length;
    const activeLicenses = allLicenses.filter(l => l.status === 'active').length;
    const expiredLicenses = allLicenses.filter(l => l.status === 'expired').length;
    const inactiveLicenses = allLicenses.filter(l => l.status === 'inactive').length;
    
    const byTier = {
      blue: allLicenses.filter(l => l.tier === 'blue').length,
      red: allLicenses.filter(l => l.tier === 'red').length,
      gold: allLicenses.filter(l => l.tier === 'gold').length
    };

    const orgSettings = await db.select().from(schema.organizationLicenseSettings);
    const orgSettingsMap = new Map(orgSettings.map(s => [s.organizationId, s]));

    const totalMaxSeats = orgSettings.reduce((sum, s) => sum + (s.maxSeats || 0), 0);
    const utilizationRate = totalMaxSeats > 0 
      ? Math.round((activeLicenses / totalMaxSeats) * 100) 
      : 0;

    const orgsQuery = await db
      .select({
        orgId: schema.organizations.id,
        orgName: schema.organizations.name,
        licenseEnabled: schema.organizations.licenseEnabled
      })
      .from(schema.organizations)
      .where(
        search 
          ? sql`LOWER(${schema.organizations.name}) LIKE LOWER(${'%' + search + '%'})`
          : undefined
      );

    const orgLicenseData = await Promise.all(
      orgsQuery.map(async (org) => {
        const orgLicenses = await db
          .select()
          .from(schema.userLicenses)
          .where(
            and(
              eq(schema.userLicenses.organizationId, org.orgId),
              ...(licenseFilters.length > 0 ? licenseFilters : [])
            )
          );

        const orgActiveLicenses = orgLicenses.filter(l => l.status === 'active').length;
        const settings = orgSettingsMap.get(org.orgId);
        const maxSeats = settings?.maxSeats || null;
        const orgUtilization = maxSeats ? Math.round((orgActiveLicenses / maxSeats) * 100) : 0;
        
        const tierCounts = {
          blue: orgLicenses.filter(l => l.tier === 'blue').length,
          red: orgLicenses.filter(l => l.tier === 'red').length,
          gold: orgLicenses.filter(l => l.tier === 'gold').length
        };
        const primaryTier = Object.entries(tierCounts)
          .sort((a, b) => b[1] - a[1])[0];
        
        return {
          id: org.orgId,
          name: org.orgName,
          activeLicenses: orgActiveLicenses,
          totalLicenses: orgLicenses.length,
          maxSeats,
          tier: primaryTier && primaryTier[1] > 0 ? primaryTier[0] : null,
          utilizationRate: orgUtilization,
          licenseEnabled: org.licenseEnabled
        };
      })
    );

    const filteredOrgs = orgLicenseData.filter(org => 
      org.totalLicenses > 0 || org.licenseEnabled
    );

    filteredOrgs.sort((a, b) => b.activeLicenses - a.activeLicenses);

    const total = filteredOrgs.length;
    const paginatedOrgs = filteredOrgs.slice(offsetNum, offsetNum + limitNum);

    res.json({
      summary: {
        totalLicenses,
        activeLicenses,
        expiredLicenses,
        inactiveLicenses,
        byTier,
        utilizationRate
      },
      organizations: paginatedOrgs.map(org => ({
        id: org.id,
        name: org.name,
        activeLicenses: org.activeLicenses,
        totalLicenses: org.totalLicenses,
        maxSeats: org.maxSeats,
        tier: org.tier,
        utilizationRate: org.utilizationRate
      })),
      pagination: {
        total,
        limit: limitNum,
        offset: offsetNum
      }
    });
  } catch (error) {
    console.error('Error getting license analytics:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ========================================
// CURRENCY
// ========================================

router.get('/currency/rates', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const rates = await CurrencyService.getAllCurrentRates();

    res.json(rates);
  } catch (error) {
    console.error('Error getting currency rates:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.put('/currency/rates/:currency/override', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { currency: targetCurrency } = req.params;
    const { baseCurrency = 'ZAR', rate, reason } = req.body;
    const userId = req.session.userId!;

    const override = await CurrencyService.manualOverride(
      baseCurrency as 'ZAR' | 'USD' | 'EUR',
      targetCurrency as 'ZAR' | 'USD' | 'EUR',
      String(rate),
      userId,
      reason,
    );

    res.json(override);
  } catch (error) {
    console.error('Error overriding currency rate:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/currency/test-api', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    await CurrencyService.fetchLatestRates();
    res.json({
      primary: true,
      fallback: true,
      message: 'Currency API connectivity test succeeded',
    });
  } catch (error) {
    console.error('Error testing currency API:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/currency/history', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { baseCurrency = 'ZAR', targetCurrency } = req.query;
    if (!targetCurrency) {
      return res.json([]);
    }

    const history = await CurrencyService.getRateHistory(
      baseCurrency as 'ZAR' | 'USD' | 'EUR',
      targetCurrency as 'ZAR' | 'USD' | 'EUR',
      100,
    );

    res.json(
      history.map((h) => ({
        timestamp: h.lastUpdated ? new Date(h.lastUpdated).toISOString() : new Date().toISOString(),
        rate: h.rate,
        source: h.source === 'manual' ? 'manual' : 'api',
      })),
    );
  } catch (error) {
    console.error('Error getting currency history:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ========================================
// CONFIG (Commission)
// ========================================

router.get('/config/commission', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const globalConfig = await db.query.platformConfiguration.findFirst({
      where: eq(schema.platformConfiguration.key, 'globalCommissionRate'),
    });

    const orgs = await db.query.organizations.findMany({
      where: sql`${schema.organizations.commissionRate} IS NOT NULL`,
      columns: {
        id: true,
        name: true,
        commissionRate: true,
      },
    });

    res.json({
      globalRate: globalConfig?.value ? parseFloat(globalConfig.value) : 30,
      orgOverrides: orgs,
    });
  } catch (error) {
    console.error('Error getting commission config:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.put('/config/commission/global', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { rate } = req.body;
    const user = (req.session as any).user;

    const existing = await db.query.platformConfiguration.findFirst({
      where: eq(schema.platformConfiguration.key, 'globalCommissionRate'),
    });

    if (existing) {
      await db
        .update(schema.platformConfiguration)
        .set({
          value: rate.toString(),
          updatedAt: new Date(),
        })
        .where(eq(schema.platformConfiguration.key, 'globalCommissionRate'));
    } else {
      await db
        .insert(schema.platformConfiguration)
        .values({
          key: 'globalCommissionRate',
          value: rate.toString(),
          dataType: 'number',
          updatedAt: new Date(),
        });
    }

    res.json({ success: true, message: 'Global commission rate updated', newRate: rate });
  } catch (error) {
    console.error('Error updating global commission:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.put('/config/commission/:orgId', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const { rate } = req.body;

    await db
      .update(schema.organizations)
      .set({
        commissionRate: rate,
        updatedAt: new Date(),
      })
      .where(eq(schema.organizations.id, orgId));

    res.json({ success: true, message: 'Organization commission rate updated' });
  } catch (error) {
    console.error('Error updating org commission:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ========================================
// AUDIT LOGS
// ========================================

router.get('/audit-logs', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { action, entityType, startDate, endDate, limit = '100', offset = '0' } = req.query;

    const filters: any[] = [];

    if (action) {
      filters.push(eq(schema.financialAuditLog.eventType, action as string));
    }

    if (entityType) {
      filters.push(eq(schema.financialAuditLog.entityType, entityType as string));
    }

    if (startDate) {
      filters.push(gte(schema.financialAuditLog.createdAt, new Date(startDate as string)));
    }

    if (endDate) {
      filters.push(lte(schema.financialAuditLog.createdAt, new Date(endDate as string)));
    }

    const logs = await db.query.financialAuditLog.findMany({
      where: filters.length > 0 ? and(...filters) : undefined,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      orderBy: desc(schema.financialAuditLog.createdAt),
    });

    const total = await db
      .select({ count: sql<number>`count(*)`})
      .from(schema.financialAuditLog)
      .where(filters.length > 0 ? and(...filters) : undefined);

    res.json({ logs, total: Number(total[0]?.count || 0) });
  } catch (error) {
    console.error('Error getting audit logs:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ========================================
// LICENSE SETTINGS
// ========================================

const VALID_LICENSE_FLAG_KEYS = [
  'ENABLE_LICENSE_SYSTEM',
  'ENABLE_LICENSE_MIDDLEWARE',
  'ENABLE_LICENSE_UI',
  'ENABLE_LICENSE_PAYMENTS',
] as const;

type LicenseFlagKey = typeof VALID_LICENSE_FLAG_KEYS[number];

router.get('/license-settings', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { getFeatureFlags } = await import("../config/featureFlags");
    const flagConfig = getFeatureFlags();
    const flags = flagConfig.getFlags();

    const dbOverrides = await db.query.licenseFlagOverrides.findMany();
    const overrideMap = new Map(dbOverrides.map(o => [o.flagKey, o]));

    const flagsResponse: Record<string, { value: boolean; source: 'env' | 'db'; description?: string }> = {};
    for (const key of VALID_LICENSE_FLAG_KEYS) {
      const override = overrideMap.get(key);
      flagsResponse[key] = {
        value: flags[key as keyof typeof flags] as boolean,
        source: flags._sources[key as keyof typeof flags._sources],
        description: override?.description || undefined,
      };
    }

    const parseBool = (val: string | undefined): boolean => val?.toLowerCase() === 'true';

    const envVars = {
      ENABLE_LICENSE_SYSTEM: parseBool(process.env.ENABLE_LICENSE_SYSTEM),
      ENABLE_LICENSE_MIDDLEWARE: parseBool(process.env.ENABLE_LICENSE_MIDDLEWARE),
      ENABLE_LICENSE_UI: parseBool(process.env.ENABLE_LICENSE_UI),
      ENABLE_LICENSE_PAYMENTS: parseBool(process.env.ENABLE_LICENSE_PAYMENTS),
    };

    const excludedOrgsRaw = await db
      .select({
        id: schema.licenseRolloutOrganizations.id,
        organizationId: schema.licenseRolloutOrganizations.organizationId,
        organizationName: schema.organizations.name,
        notes: schema.licenseRolloutOrganizations.notes,
        addedBy: schema.licenseRolloutOrganizations.addedBy,
        addedByName: users.gamerName,
        expiresAt: schema.licenseRolloutOrganizations.expiresAt,
        createdAt: schema.licenseRolloutOrganizations.createdAt,
      })
      .from(schema.licenseRolloutOrganizations)
      .leftJoin(schema.organizations, eq(schema.licenseRolloutOrganizations.organizationId, schema.organizations.id))
      .leftJoin(users, eq(schema.licenseRolloutOrganizations.addedBy, users.id))
      .orderBy(desc(schema.licenseRolloutOrganizations.createdAt));

    const betaUsersRaw = await db
      .select({
        id: schema.licenseRolloutBetaUsers.id,
        userId: schema.licenseRolloutBetaUsers.userId,
        userName: users.gamerName,
        notes: schema.licenseRolloutBetaUsers.notes,
        addedBy: schema.licenseRolloutBetaUsers.addedBy,
        expiresAt: schema.licenseRolloutBetaUsers.expiresAt,
        createdAt: schema.licenseRolloutBetaUsers.createdAt,
      })
      .from(schema.licenseRolloutBetaUsers)
      .leftJoin(users, eq(schema.licenseRolloutBetaUsers.userId, users.id))
      .orderBy(desc(schema.licenseRolloutBetaUsers.createdAt));

    const betaUserAddedByIds = [...new Set(betaUsersRaw.map(b => b.addedBy))];
    const addedByUsers = betaUserAddedByIds.length > 0 
      ? await db.select({ id: users.id, gamerName: users.gamerName }).from(users).where(inArray(users.id, betaUserAddedByIds))
      : [];
    const addedByMap = new Map(addedByUsers.map(u => [u.id, u.gamerName]));

    const betaUsers = betaUsersRaw.map(b => ({
      ...b,
      addedByName: addedByMap.get(b.addedBy) || null,
    }));

    const auditLog = await db
      .select()
      .from(schema.licenseFlagAudit)
      .orderBy(desc(schema.licenseFlagAudit.createdAt))
      .limit(50);

    res.json({
      flags: flagsResponse,
      envVars,
      excludedOrgs: excludedOrgsRaw,
      betaUsers,
      auditLog,
    });
  } catch (error) {
    console.error('Error getting license settings:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.put('/license-settings/flags/:flagKey', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { flagKey } = req.params;
    const { value, description, reason } = req.body;
    const user = (req as any).user;

    if (!VALID_LICENSE_FLAG_KEYS.includes(flagKey as LicenseFlagKey)) {
      return res.status(400).json({ 
        error: 'Invalid flagKey', 
        validKeys: VALID_LICENSE_FLAG_KEYS 
      });
    }

    if (typeof value !== 'boolean') {
      return res.status(400).json({ error: 'value must be a boolean' });
    }

    const existing = await db.query.licenseFlagOverrides.findFirst({
      where: eq(schema.licenseFlagOverrides.flagKey, flagKey),
    });

    const oldValue = existing?.value ?? null;

    if (existing) {
      await db
        .update(schema.licenseFlagOverrides)
        .set({
          value,
          description: description || existing.description,
          setBy: user.id,
          updatedAt: new Date(),
        })
        .where(eq(schema.licenseFlagOverrides.flagKey, flagKey));
    } else {
      await db
        .insert(schema.licenseFlagOverrides)
        .values({
          flagKey,
          value,
          description: description || null,
          setBy: user.id,
        });
    }

    await db.insert(schema.licenseFlagAudit).values({
      flagKey,
      action: existing ? 'update' : 'enable',
      oldValue: oldValue !== null ? { value: oldValue } : null,
      newValue: { value, description },
      changedBy: user.id,
      reason: reason || null,
      metadata: { ip: req.ip, userAgent: req.headers['user-agent'] },
    });

    const { getFeatureFlags } = await import("../config/featureFlags");
    await getFeatureFlags().reload();

    const flagConfig = getFeatureFlags();
    const flags = flagConfig.getFlags();

    res.json({
      success: true,
      message: `Flag ${flagKey} updated`,
      flag: {
        key: flagKey,
        value: flags[flagKey as keyof typeof flags],
        source: 'db' as const,
        description,
      },
    });
  } catch (error) {
    console.error('Error updating license flag:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.delete('/license-settings/flags/:flagKey', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { flagKey } = req.params;
    const { reason } = req.body || {};
    const user = (req as any).user;

    if (!VALID_LICENSE_FLAG_KEYS.includes(flagKey as LicenseFlagKey)) {
      return res.status(400).json({ 
        error: 'Invalid flagKey', 
        validKeys: VALID_LICENSE_FLAG_KEYS 
      });
    }

    const existing = await db.query.licenseFlagOverrides.findFirst({
      where: eq(schema.licenseFlagOverrides.flagKey, flagKey),
    });

    if (!existing) {
      return res.status(404).json({ error: 'No override exists for this flag' });
    }

    await db
      .delete(schema.licenseFlagOverrides)
      .where(eq(schema.licenseFlagOverrides.flagKey, flagKey));

    await db.insert(schema.licenseFlagAudit).values({
      flagKey,
      action: 'disable',
      oldValue: { value: existing.value, description: existing.description },
      newValue: null,
      changedBy: user.id,
      reason: reason || 'Reverted to env var',
      metadata: { ip: req.ip, userAgent: req.headers['user-agent'] },
    });

    const { getFeatureFlags } = await import("../config/featureFlags");
    await getFeatureFlags().reload();

    res.json({
      success: true,
      message: `Flag ${flagKey} override removed, reverting to env var`,
    });
  } catch (error) {
    console.error('Error deleting license flag override:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/license-settings/excluded-orgs', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { organizationId, notes, expiresAt } = req.body;
    const user = (req as any).user;

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    const org = await db.query.organizations.findFirst({
      where: eq(schema.organizations.id, organizationId),
    });

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const existing = await db.query.licenseRolloutOrganizations.findFirst({
      where: eq(schema.licenseRolloutOrganizations.organizationId, organizationId),
    });

    if (existing) {
      return res.status(409).json({ error: 'Organization is already in the exclusion list' });
    }

    const [inserted] = await db
      .insert(schema.licenseRolloutOrganizations)
      .values({
        organizationId,
        notes: notes || null,
        addedBy: user.id,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      })
      .returning();

    await db.insert(schema.licenseFlagAudit).values({
      flagKey: 'ORG_EXCLUSION',
      action: 'enable',
      oldValue: null,
      newValue: { organizationId, notes },
      changedBy: user.id,
      reason: notes || 'Added to exclusion list',
      metadata: { ip: req.ip, userAgent: req.headers['user-agent'] },
    });

    res.json({
      success: true,
      message: `Organization ${org.name} excluded from license system`,
      excludedOrg: {
        id: inserted.id,
        organizationId,
        organizationName: org.name,
        notes: inserted.notes,
        addedBy: user.id,
        addedByName: user.gamerName,
        expiresAt: inserted.expiresAt,
        createdAt: inserted.createdAt,
      },
    });
  } catch (error) {
    console.error('Error excluding organization:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.delete('/license-settings/excluded-orgs/:orgId', isSuperAdminOrCustSuper, async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const { reason } = req.body || {};
    const user = (req as any).user;

    const existingEntry = await db
      .select({
        id: schema.licenseRolloutOrganizations.id,
        organizationId: schema.licenseRolloutOrganizations.organizationId,
        organizationName: schema.organizations.name,
        notes: schema.licenseRolloutOrganizations.notes,
      })
      .from(schema.licenseRolloutOrganizations)
      .leftJoin(schema.organizations, eq(schema.licenseRolloutOrganizations.organizationId, schema.organizations.id))
      .where(eq(schema.licenseRolloutOrganizations.organizationId, orgId))
      .limit(1);

    if (existingEntry.length === 0) {
      return res.status(404).json({ error: 'Organization not found in exclusion list' });
    }

    const entry = existingEntry[0];

    await db
      .delete(schema.licenseRolloutOrganizations)
      .where(eq(schema.licenseRolloutOrganizations.organizationId, orgId));

    await db.insert(schema.licenseFlagAudit).values({
      flagKey: 'ORG_EXCLUSION',
      action: 'disable',
      oldValue: { organizationId: orgId, notes: entry.notes },
      newValue: null,
      changedBy: user.id,
      reason: reason || 'Removed from exclusion list',
      metadata: { ip: req.ip, userAgent: req.headers['user-agent'] },
    });

    res.json({
      success: true,
      message: `Organization ${entry.organizationName || orgId} removed from exclusion list`,
    });
  } catch (error) {
    console.error('Error removing organization from exclusion list:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ========================================
// SUBSCRIPTIONS
// ========================================

router.get('/subscriptions', withSessionAuthMiddleware, isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    
    let whereClause = status && status !== 'all' 
      ? eq(schema.subscriptions.status, status as 'active' | 'cancelled' | 'grace' | 'past_due' | 'suspended') 
      : undefined;
    
    const subs = await db
      .select({
        id: schema.subscriptions.id,
        planId: schema.subscriptions.planId,
        status: schema.subscriptions.status,
        createdAt: schema.subscriptions.createdAt,
        currentPeriodStart: schema.subscriptions.currentPeriodStart,
        currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
        cancelledAt: schema.subscriptions.cancelledAt,
        suspendedAt: schema.subscriptions.suspendedAt,
        planName: schema.elearningSubscriptionPlans.name,
        planPrice: schema.elearningSubscriptionPlans.priceAmount,
        planCurrency: schema.elearningSubscriptionPlans.currency,
        planInterval: schema.elearningSubscriptionPlans.interval,
      })
      .from(schema.subscriptions)
      .leftJoin(schema.elearningSubscriptionPlans, eq(schema.subscriptions.planId, schema.elearningSubscriptionPlans.id))
      .where(whereClause)
      .orderBy(desc(schema.subscriptions.createdAt))
      .limit(500);

    res.json(subs);
  } catch (error) {
    console.error('Error getting subscriptions:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/subscriptions/:id/events', withSessionAuthMiddleware, isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const events = await db
      .select()
      .from(schema.subscriptionEvents)
      .where(eq(schema.subscriptionEvents.subscriptionId, id))
      .orderBy(desc(schema.subscriptionEvents.createdAt))
      .limit(100);

    res.json(events);
  } catch (error) {
    console.error('Error getting subscription events:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.patch('/subscriptions/:id/status', withSessionAuthMiddleware, isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!['active', 'grace', 'past_due', 'suspended', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ error: 'Reason is required for manual status changes' });
    }

    const sub = await db.query.subscriptions.findFirst({
      where: eq(schema.subscriptions.id, id),
    });

    if (!sub) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const updateData: any = { status };
    
    if (status === 'suspended' && !sub.suspendedAt) {
      updateData.suspendedAt = new Date();
    }
    if (status === 'cancelled' && !sub.cancelledAt) {
      updateData.cancelledAt = new Date();
    }
    
    if (status === 'active' || status === 'grace') {
      updateData.cancelledAt = null;
      updateData.suspendedAt = null;
    }

    await db.update(schema.subscriptions)
      .set(updateData)
      .where(eq(schema.subscriptions.id, id));

    await db.insert(schema.subscriptionEvents).values({
      subscriptionId: id,
      eventType: 'status_changed',
      previousStatus: sub.status,
      newStatus: status,
      metadata: { changedBy: 'SuperAdmin', reason },
    });

    res.json({ success: true, newStatus: status });
  } catch (error) {
    console.error('Error updating subscription status:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/subscriptions/:id/reactivate', withSessionAuthMiddleware, isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const sub = await db.query.subscriptions.findFirst({
      where: eq(schema.subscriptions.id, id),
    });

    if (!sub) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const plan = await db.query.elearningSubscriptionPlans.findFirst({
      where: eq(schema.elearningSubscriptionPlans.id, sub.planId),
    });

    if (!plan) {
      return res.status(404).json({ error: 'Subscription plan not found' });
    }

    const now = new Date();
    let daysToAdd: number;
    
    if (plan.interval === 'monthly') {
      daysToAdd = 30;
    } else if (plan.interval === 'annual') {
      daysToAdd = 365;
    } else {
      console.error(`[Subscriptions] Invalid interval encountered: ${plan.interval}`);
      return res.status(500).json({ 
        error: 'Invalid subscription interval configuration. Please contact support.' 
      });
    }
    
    const newPeriodEnd = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

    await db.update(schema.subscriptions)
      .set({
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: newPeriodEnd,
        cancelledAt: null,
        suspendedAt: null,
      })
      .where(eq(schema.subscriptions.id, id));

    await db.insert(schema.subscriptionEvents).values({
      subscriptionId: id,
      eventType: 'reactivated',
      previousStatus: sub.status,
      newStatus: 'active',
      metadata: { 
        reactivatedBy: 'SuperAdmin', 
        newPeriodEnd: newPeriodEnd.toISOString(),
        reason: 'Manual reactivation'
      },
    });

    res.json({ success: true, newPeriodEnd });
  } catch (error) {
    console.error('Error reactivating subscription:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ========================================
// ADDITIONAL ANALYTICS ROUTES (with session middleware)
// ========================================

router.get('/analytics/dashboard', withSessionAuthMiddleware, isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const dashboardData = await AnalyticsService.getDashboardData();
    res.json(dashboardData);
  } catch (error) {
    console.error('Error getting analytics dashboard:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/analytics/mrr', withSessionAuthMiddleware, isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const mrr = await AnalyticsService.getMRR();
    res.json(mrr);
  } catch (error) {
    console.error('Error getting MRR:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/analytics/arr', withSessionAuthMiddleware, isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const arr = await AnalyticsService.getARR();
    res.json(arr);
  } catch (error) {
    console.error('Error getting ARR:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/analytics/subscription-health', withSessionAuthMiddleware, isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const health = await AnalyticsService.getSubscriptionHealth();
    res.json(health);
  } catch (error) {
    console.error('Error getting subscription health:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/analytics/payments', withSessionAuthMiddleware, isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, currency = 'ZAR' } = req.query;
    const payments = await AnalyticsService.getPaymentAnalytics({
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      currency: currency as 'ZAR' | 'USD' | 'EUR',
    });
    res.json(payments);
  } catch (error) {
    console.error('Error getting payment analytics:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/analytics/trends', withSessionAuthMiddleware, isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { period = '30', metric = 'revenue' } = req.query;
    const trends = await AnalyticsService.getTrends({
      days: parseInt(period as string),
      metric: metric as 'revenue' | 'users' | 'licenses',
    });
    res.json(trends);
  } catch (error) {
    console.error('Error getting trends:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/analytics/licenses/:organizationId', withSessionAuthMiddleware, isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    
    const licenses = await db.select().from(schema.userLicenses)
      .where(eq(schema.userLicenses.organizationId, organizationId));
    
    const settings = await db.query.organizationLicenseSettings.findFirst({
      where: eq(schema.organizationLicenseSettings.organizationId, organizationId),
    });
    
    res.json({ licenses, settings });
  } catch (error) {
    console.error('Error getting org license details:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ========================================
// CURRENCY RATES (with session middleware)
// ========================================

router.get('/currency-rates', withSessionAuthMiddleware, isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const rates = await CurrencyService.getAllCurrentRates();
    res.json({ rates });
  } catch (error) {
    console.error('Error getting currency rates:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/currency-rates/override', withSessionAuthMiddleware, isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { baseCurrency, targetCurrency, rate, reason } = req.body;
    const adminId = (req.session as any).user.id;

    await CurrencyService.manualOverride(
      baseCurrency,
      targetCurrency,
      rate,
      adminId,
      reason
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error overriding currency rate:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/currency-rates/refresh', withSessionAuthMiddleware, isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const refreshResult = await CurrencyService.updateAutomaticRates({
      forceOverwriteManual: true,
      cleanupDuplicates: true,
    });
    const rates = await CurrencyService.getAllCurrentRates();
    const summary = refreshResult.changed > 0
      ? `Refreshed ${refreshResult.updated} pairs (${refreshResult.changed} changed).`
      : `Refreshed ${refreshResult.updated} pairs; market rates are currently unchanged.`;
    res.json({ rates, refreshResult, summary });
  } catch (error) {
    console.error('Error refreshing currency rates:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ========================================
// ORGANIZATION PACKAGE OVERRIDES
// ========================================

router.get('/package-overrides', withSessionAuthMiddleware, isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const overrides = await db.query.organizationPackageOverrides.findMany({
      with: {
        organization: true,
        createdByUser: true,
      },
      orderBy: desc(schema.organizationPackageOverrides.createdAt),
    });
    
    res.json({ overrides });
  } catch (error) {
    console.error('Error fetching package overrides:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/package-overrides', withSessionAuthMiddleware, isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const data = req.body;
    
    const existingOverride = await db.query.organizationPackageOverrides.findFirst({
      where: eq(schema.organizationPackageOverrides.organizationId, data.organizationId),
    });
    
    if (existingOverride) {
      return res.status(400).json({ error: 'An override already exists for this organization. Please edit the existing override.' });
    }
    
    const [override] = await db.insert(schema.organizationPackageOverrides)
      .values({
        ...data,
        createdBy: userId,
        validFrom: data.validFrom ? new Date(data.validFrom) : new Date(),
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
      })
      .returning();
    
    console.log(`[Package Override] Created override for org ${data.organizationId} by SuperAdmin ${userId}`);
    res.json({ override });
  } catch (error) {
    console.error('Error creating package override:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.patch('/package-overrides/:id', withSessionAuthMiddleware, isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId!;
    const data = req.body;
    
    const existing = await db.query.organizationPackageOverrides.findFirst({
      where: eq(schema.organizationPackageOverrides.id, id),
    });
    
    if (!existing) {
      return res.status(404).json({ error: 'Override not found' });
    }
    
    const [updated] = await db.update(schema.organizationPackageOverrides)
      .set({
        ...data,
        updatedBy: userId,
        updatedAt: new Date(),
        validFrom: data.validFrom ? new Date(data.validFrom) : undefined,
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
      })
      .where(eq(schema.organizationPackageOverrides.id, id))
      .returning();
    
    console.log(`[Package Override] Updated override ${id} by SuperAdmin ${userId}`);
    res.json({ override: updated });
  } catch (error) {
    console.error('Error updating package override:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.delete('/package-overrides/:id', withSessionAuthMiddleware, isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId!;
    
    const existing = await db.query.organizationPackageOverrides.findFirst({
      where: eq(schema.organizationPackageOverrides.id, id),
    });
    
    if (!existing) {
      return res.status(404).json({ error: 'Override not found' });
    }
    
    await db.delete(schema.organizationPackageOverrides)
      .where(eq(schema.organizationPackageOverrides.id, id));
    
    console.log(`[Package Override] Deleted override ${id} by SuperAdmin ${userId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting package override:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/organizations-for-override', withSessionAuthMiddleware, isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const allOrganizations = await db.select({
      id: schema.organizations.id,
      name: schema.organizations.name,
      type: schema.organizations.type,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.isActive, true))
    .orderBy(schema.organizations.name);
    
    res.json({ organizations: allOrganizations });
  } catch (error) {
    console.error('Error fetching organizations for override:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ========================================
// LEGACY LICENSE MANAGEMENT
// ========================================

router.post('/legacy-license/disable-all', withSessionAuthMiddleware, isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { reason } = req.body;

    const flagsToDisable = [
      'licenseSystemEnabled',
      'licenseMiddlewareEnabled',
      'licenseUIEnabled',
      'licensePaymentsEnabled',
    ];

    const description = `LEGACY LICENSE DISABLE: ${reason || 'Legacy license system being phased out'}`;

    console.log(`[Legacy License] Starting bulk disable of all license flags by SuperAdmin ${userId}`);
    console.log(`[Legacy License] Reason: ${reason || 'Not provided'}`);

    for (const flagKey of flagsToDisable) {
      await storage.setLicenseFlagOverride({
        flagKey,
        value: false,
        description,
        setBy: userId,
        expiresAt: null,
      });
      console.log(`[Legacy License] Disabled flag: ${flagKey}`);
    }

    const { getFeatureFlags } = await import("../config/featureFlags");
    await getFeatureFlags().reload();

    console.log(`[Legacy License] All legacy license flags successfully disabled by SuperAdmin ${userId}`);

    res.json({
      success: true,
      message: "All legacy license feature flags have been disabled",
      disabledFlags: flagsToDisable,
      disabledAt: new Date().toISOString(),
      disabledBy: userId,
    });
  } catch (error) {
    console.error("[Legacy License] Error disabling legacy license flags:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to disable legacy license flags" 
    });
  }
});

// ========================================
// REGISTRATION FUNCTION
// ========================================

export function registerSuperAdminRoutes(app: Express) {
  app.use('/api/superadmin', router);
}
