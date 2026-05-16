/**
 * Organization Sales Routes Module
 * 
 * API endpoints for Org Admins to view their course revenue and sales data.
 * - GET /api/org-sales/revenue-summary
 * - GET /api/org-sales/course-breakdown
 * - GET /api/org-sales/monthly-trends
 */

import { Router, Request, Response } from 'express';
import { RevenueTrackingService } from '../services/revenueTrackingService';
import {
  storage,
  withSessionAuthMiddleware,
  getEffectiveOrganizationId,
  ADMIN_ROLES,
} from './sharedResources';
import {
  resolveEffectiveOrganization,
  type RequestWithEffectiveOrg,
} from '../middleware/sessionAuthMiddleware';

const router = Router();

async function requireOrgAdminAccess(req: Request, res: Response, next: any) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const user = await storage.getUser(req.session.userId!);
    if (user?.isSuperAdmin || user?.isCustSuper) {
      const effectiveResult = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      (req as RequestWithEffectiveOrg).effectiveOrganization = effectiveResult;
      next();
      return;
    }

    const effectiveResult = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
    (req as RequestWithEffectiveOrg).effectiveOrganization = effectiveResult;

    if (!effectiveResult.organizationId) {
      return res.status(403).json({ error: "No organization context" });
    }

    const roles = effectiveResult.organization?.roles || [];
    const isOrgAdminOrAbove = roles.includes('SuperAdmin') || 
                              roles.includes('OrgAdmin') || 
                              roles.some(role => ADMIN_ROLES.includes(role as any));

    if (!isOrgAdminOrAbove) {
      return res.status(403).json({ error: "Access denied: Organization admin role required" });
    }

    next();
  } catch (error) {
    console.error('[OrgSales] Error in requireOrgAdminAccess:', error);
    return res.status(500).json({ error: "Failed to verify access" });
  }
}

router.get(
  '/api/org-sales/revenue-summary',
  withSessionAuthMiddleware,
  requireOrgAdminAccess,
  async (req: Request, res: Response) => {
    try {
      const effectiveResult = (req as RequestWithEffectiveOrg).effectiveOrganization;
      const organizationId = effectiveResult?.organizationId;

      if (!organizationId) {
        return res.status(400).json({ error: "Organization context required" });
      }

      const { startDate, endDate } = req.query;
      
      let periodStart: Date;
      let periodEnd: Date = new Date();

      if (startDate) {
        periodStart = new Date(startDate as string);
      } else {
        periodStart = new Date();
        periodStart.setDate(periodStart.getDate() - 30);
      }

      if (endDate) {
        periodEnd = new Date(endDate as string);
      }

      const revenueSummary = await RevenueTrackingService.getOrganizationRevenue(
        organizationId,
        periodStart,
        periodEnd
      );

      res.json({
        totalRevenue: revenueSummary.totalRevenue,
        platformCommission: revenueSummary.platformCommission,
        netProfit: revenueSummary.netProfit,
        salesCount: revenueSummary.salesCount,
        currency: revenueSummary.currency,
        periodStart: revenueSummary.periodStart,
        periodEnd: revenueSummary.periodEnd,
        organizationName: revenueSummary.organizationName,
      });
    } catch (error: any) {
      console.error('[OrgSales] Error fetching revenue summary:', error);
      res.status(500).json({ error: error.message || "Failed to fetch revenue summary" });
    }
  }
);

router.get(
  '/api/org-sales/course-breakdown',
  withSessionAuthMiddleware,
  requireOrgAdminAccess,
  async (req: Request, res: Response) => {
    try {
      const effectiveResult = (req as RequestWithEffectiveOrg).effectiveOrganization;
      const organizationId = effectiveResult?.organizationId;

      if (!organizationId) {
        return res.status(400).json({ error: "Organization context required" });
      }

      const { startDate, endDate } = req.query;
      
      let periodStart: Date | undefined;
      let periodEnd: Date | undefined;

      if (startDate) {
        periodStart = new Date(startDate as string);
      }

      if (endDate) {
        periodEnd = new Date(endDate as string);
      }

      const courseBreakdown = await RevenueTrackingService.getCourseRevenueBreakdown(
        organizationId,
        periodStart,
        periodEnd
      );

      res.json({
        courses: courseBreakdown.map(course => ({
          courseId: course.courseId,
          courseTitle: course.courseTitle,
          salesCount: course.totalSales,
          revenue: course.totalRevenue,
          commission: course.platformCommission,
          netEarnings: course.netRevenue,
          currency: course.currency,
          averageRating: course.averageRating,
        })),
      });
    } catch (error: any) {
      console.error('[OrgSales] Error fetching course breakdown:', error);
      res.status(500).json({ error: error.message || "Failed to fetch course breakdown" });
    }
  }
);

router.get(
  '/api/org-sales/monthly-trends',
  withSessionAuthMiddleware,
  requireOrgAdminAccess,
  async (req: Request, res: Response) => {
    try {
      const effectiveResult = (req as RequestWithEffectiveOrg).effectiveOrganization;
      const organizationId = effectiveResult?.organizationId;

      if (!organizationId) {
        return res.status(400).json({ error: "Organization context required" });
      }

      const monthsParam = req.query.months as string;
      const monthsBack = monthsParam ? parseInt(monthsParam, 10) : 12;

      if (isNaN(monthsBack) || monthsBack < 1 || monthsBack > 36) {
        return res.status(400).json({ error: "Invalid months parameter (1-36)" });
      }

      const monthlyTrends = await RevenueTrackingService.getMonthlyTrends(
        organizationId,
        monthsBack
      );

      res.json({
        trends: monthlyTrends.map(trend => ({
          month: trend.month,
          revenue: trend.revenue,
          salesCount: trend.salesCount,
          commission: trend.commissionDeducted,
          netProfit: trend.netProfit,
        })),
      });
    } catch (error: any) {
      console.error('[OrgSales] Error fetching monthly trends:', error);
      res.status(500).json({ error: error.message || "Failed to fetch monthly trends" });
    }
  }
);

router.get(
  '/api/org-sales/all/revenue-summary',
  withSessionAuthMiddleware,
  async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    const user = await storage.getUser(req.session.userId!);
    const isSuperAdminUser = user?.isSuperAdmin || false;
    const isCustSuperUser = user?.isCustSuper || false;
    if (!isSuperAdminUser && !isCustSuperUser) {
      return res.status(403).json({ error: "SuperAdmin access required" });
    }

    try {
      const { startDate, endDate, orgId } = req.query;
      const filterOrgId = orgId as string | undefined;
      let periodStart: Date;
      let periodEnd: Date = new Date();

      if (startDate) {
        periodStart = new Date(startDate as string);
      } else {
        periodStart = new Date();
        periodStart.setDate(periodStart.getDate() - 30);
      }
      if (endDate) {
        periodEnd = new Date(endDate as string);
      }

      const revenueSummary = filterOrgId
        ? await RevenueTrackingService.getOrganizationRevenue(filterOrgId, periodStart, periodEnd)
        : await RevenueTrackingService.getAllOrganizationsRevenue(periodStart, periodEnd);

      res.json({
        totalRevenue: revenueSummary.totalRevenue,
        platformCommission: revenueSummary.platformCommission,
        netProfit: revenueSummary.netProfit,
        salesCount: revenueSummary.salesCount,
        currency: revenueSummary.currency,
        periodStart: revenueSummary.periodStart,
        periodEnd: revenueSummary.periodEnd,
        organizationName: revenueSummary.organizationName,
      });
    } catch (error: any) {
      console.error('[OrgSales] Error fetching all-org revenue summary:', error);
      res.status(500).json({ error: error.message || "Failed to fetch revenue summary" });
    }
  }
);

router.get(
  '/api/org-sales/all/course-breakdown',
  withSessionAuthMiddleware,
  async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    const user = await storage.getUser(req.session.userId!);
    const isSuperAdminUser = user?.isSuperAdmin || false;
    const isCustSuperUser = user?.isCustSuper || false;
    if (!isSuperAdminUser && !isCustSuperUser) {
      return res.status(403).json({ error: "SuperAdmin access required" });
    }

    try {
      const { startDate, endDate, orgId } = req.query;
      const filterOrgId = orgId as string | undefined;
      let periodStart: Date | undefined;
      let periodEnd: Date | undefined;

      if (startDate) {
        periodStart = new Date(startDate as string);
      }
      if (endDate) {
        periodEnd = new Date(endDate as string);
      }

      const courseBreakdown = filterOrgId
        ? await RevenueTrackingService.getCourseRevenueBreakdown(filterOrgId, periodStart, periodEnd)
        : await RevenueTrackingService.getAllCourseRevenueBreakdown(periodStart, periodEnd);

      res.json({
        courses: courseBreakdown.map(course => ({
          courseId: course.courseId,
          courseTitle: course.courseTitle,
          salesCount: course.totalSales,
          revenue: course.totalRevenue,
          commission: course.platformCommission,
          netEarnings: course.netRevenue,
          currency: course.currency,
          averageRating: course.averageRating,
          organizationName: (course as any).organizationName,
        })),
      });
    } catch (error: any) {
      console.error('[OrgSales] Error fetching all-org course breakdown:', error);
      res.status(500).json({ error: error.message || "Failed to fetch course breakdown" });
    }
  }
);

router.get(
  '/api/org-sales/all/monthly-trends',
  withSessionAuthMiddleware,
  async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    const user = await storage.getUser(req.session.userId!);
    const isSuperAdminUser = user?.isSuperAdmin || false;
    const isCustSuperUser = user?.isCustSuper || false;
    if (!isSuperAdminUser && !isCustSuperUser) {
      return res.status(403).json({ error: "SuperAdmin access required" });
    }

    try {
      const orgId = req.query.orgId as string | undefined;
      const monthsParam = req.query.months as string;
      const monthsBack = monthsParam ? parseInt(monthsParam, 10) : 12;

      if (isNaN(monthsBack) || monthsBack < 1 || monthsBack > 36) {
        return res.status(400).json({ error: "Invalid months parameter (1-36)" });
      }

      const monthlyTrends = orgId
        ? await RevenueTrackingService.getMonthlyTrends(orgId, monthsBack)
        : await RevenueTrackingService.getAllMonthlyTrends(monthsBack);

      res.json({
        trends: monthlyTrends.map(trend => ({
          month: trend.month,
          revenue: trend.revenue,
          salesCount: trend.salesCount,
          commission: trend.commissionDeducted,
          netProfit: trend.netProfit,
        })),
      });
    } catch (error: any) {
      console.error('[OrgSales] Error fetching all-org monthly trends:', error);
      res.status(500).json({ error: error.message || "Failed to fetch monthly trends" });
    }
  }
);

router.get(
  '/api/org-sales/enrollment-details',
  withSessionAuthMiddleware,
  requireOrgAdminAccess,
  async (req: Request, res: Response) => {
    try {
      const effectiveResult = (req as RequestWithEffectiveOrg).effectiveOrganization;
      const organizationId = effectiveResult?.organizationId;

      if (!organizationId) {
        return res.status(400).json({ error: "Organization context required" });
      }

      const { page, limit: limitParam, search, startDate, endDate } = req.query;

      const result = await RevenueTrackingService.getEnrollmentDetails(organizationId, {
        page: page ? parseInt(page as string, 10) : 1,
        limit: limitParam ? parseInt(limitParam as string, 10) : 20,
        search: search as string,
        startDate: startDate as string,
        endDate: endDate as string,
      });

      res.json(result);
    } catch (error: any) {
      console.error('[OrgSales] Error fetching enrollment details:', error);
      res.status(500).json({ error: error.message || "Failed to fetch enrollment details" });
    }
  }
);

router.get(
  '/api/org-sales/roi-metrics',
  withSessionAuthMiddleware,
  requireOrgAdminAccess,
  async (req: Request, res: Response) => {
    try {
      const effectiveResult = (req as RequestWithEffectiveOrg).effectiveOrganization;
      const organizationId = effectiveResult?.organizationId;

      if (!organizationId) {
        return res.status(400).json({ error: "Organization context required" });
      }

      const result = await RevenueTrackingService.getRoiMetrics(organizationId);
      res.json(result);
    } catch (error: any) {
      console.error('[OrgSales] Error fetching ROI metrics:', error);
      res.status(500).json({ error: error.message || "Failed to fetch ROI metrics" });
    }
  }
);

router.get(
  '/api/org-sales/all/enrollment-details',
  withSessionAuthMiddleware,
  async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const user = await storage.getUser(req.session.userId!);
    const isSuperAdminUser = user?.isSuperAdmin || false;
    const isCustSuperUser = user?.isCustSuper || false;
    if (!isSuperAdminUser && !isCustSuperUser) {
      return res.status(403).json({ error: "SuperAdmin access required" });
    }

    try {
      const { page, limit: limitParam, search, startDate, endDate, orgId } = req.query;
      const filterOrgId = orgId as string | undefined;

      const result = await RevenueTrackingService.getEnrollmentDetails(filterOrgId || null, {
        page: page ? parseInt(page as string, 10) : 1,
        limit: limitParam ? parseInt(limitParam as string, 10) : 20,
        search: search as string,
        startDate: startDate as string,
        endDate: endDate as string,
      });

      res.json(result);
    } catch (error: any) {
      console.error('[OrgSales] Error fetching all-org enrollment details:', error);
      res.status(500).json({ error: error.message || "Failed to fetch enrollment details" });
    }
  }
);

router.get(
  '/api/org-sales/all/roi-metrics',
  withSessionAuthMiddleware,
  async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const user = await storage.getUser(req.session.userId!);
    const isSuperAdminUser = user?.isSuperAdmin || false;
    const isCustSuperUser = user?.isCustSuper || false;
    if (!isSuperAdminUser && !isCustSuperUser) {
      return res.status(403).json({ error: "SuperAdmin access required" });
    }

    try {
      const orgId = req.query.orgId as string | undefined;
      const result = await RevenueTrackingService.getRoiMetrics(orgId || null);
      res.json(result);
    } catch (error: any) {
      console.error('[OrgSales] Error fetching all-org ROI metrics:', error);
      res.status(500).json({ error: error.message || "Failed to fetch ROI metrics" });
    }
  }
);

export function registerOrgSalesRoutes(app: any) {
  app.use('/', router);
  console.log('[OrgSalesRoutes] Registered /api/org-sales/* routes');
}
