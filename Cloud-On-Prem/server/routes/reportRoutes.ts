/**
 * Report Routes
 * 
 * Contains all /api/reports/* and /api/admin/reports/* routes for learner analytics,
 * organization performance, and student insights.
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { sql, eq } from 'drizzle-orm';
import { userOrganizationRoles } from '@shared/schema';
import { storage } from './sharedResources';
import { isFeatureEnabled } from '../featureFlags';
import {
  withSessionAuthMiddleware,
  resolveEffectiveOrganization,
  type RequestWithEffectiveOrg,
} from '../middleware/sessionAuthMiddleware';

const router = Router();

/**
 * Shared filter interface for consistent report filtering
 */
interface ReportFilters {
  courseId?: string | null;
  unitId?: string | null;
  subUnitId?: string | null;
  teamId?: string | null;
  departmentId?: string | null;  // Legacy alias for unitId
  studentId?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  search?: string | null;
  courseStatus?: string | null;  // Filter by course status: active, draft, archived, inactive
  limit?: number;
}

const LOW_SCORE_THRESHOLD = 60;

/**
 * Parse query parameters into consistent report filters
 * Handles departmentId as the parent unit filter and subUnitId/unitId as the
 * child unit filter used by the Reports page.
 */
function parseReportFilters(query: any): ReportFilters {
  const filters: ReportFilters = {};
  
  if (query.departmentId && query.departmentId !== 'all') filters.unitId = query.departmentId;
  if (query.subUnitId && query.subUnitId !== 'all') filters.subUnitId = query.subUnitId;
  if (!filters.subUnitId && query.unitId && query.unitId !== 'all') filters.subUnitId = query.unitId;
  
  if (query.courseId && query.courseId !== 'all') filters.courseId = query.courseId;
  if (query.teamId && query.teamId !== 'all') filters.teamId = query.teamId;
  if (query.studentId && query.studentId !== 'all') filters.studentId = query.studentId;
  if (query.startDate) filters.startDate = new Date(query.startDate);
  if (query.endDate) filters.endDate = new Date(query.endDate);
  if (query.search?.trim()) filters.search = query.search.trim();
  if (query.courseStatus && query.courseStatus !== 'all') filters.courseStatus = query.courseStatus;
  if (query.limit) filters.limit = parseInt(query.limit);
  
  return filters;
}

/**
 * Middleware to validate organization access
 * Copied from routes.ts - ensures user has access to the requested organization
 */
async function requireOrgAccess(req: Request, res: Response, next: any) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  const effectiveResult = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
  (req as RequestWithEffectiveOrg).effectiveOrganization = effectiveResult;
  
  const requestedOrgId = req.params.orgId || req.query.organizationId || req.body?.organizationId;
  
  if (isFeatureEnabled('SESSION_AUTH_ENABLED') && req.session.context) {
    const { effectiveRole, organizations } = req.session.context;
    
    if (effectiveRole === 'SuperAdmin' && !effectiveResult.isImpersonation) {
      return next();
    }
    
    if (effectiveRole === 'SuperAdmin' && effectiveResult.isImpersonation) {
      if (!requestedOrgId) {
        return next();
      }
      if (requestedOrgId === effectiveResult.organizationId) {
        return next();
      }
      return res.status(403).json({ error: "Access denied: You are impersonating a different organization" });
    }
    
    if (!effectiveResult.organizationId) {
      return res.status(403).json({ error: "No organization context" });
    }
    
    if (requestedOrgId && requestedOrgId !== effectiveResult.organizationId) {
      console.log(`[OrgAccess] Blocked: User ${req.session.userId} tried to access org ${requestedOrgId} but effective org is ${effectiveResult.organizationId}`);
      return res.status(403).json({ error: "Access denied: Cross-organization access not permitted" });
    }
    
    return next();
  }
  
  const user = await storage.getUser(req.session.userId);
  const isImpersonating = !!req.session.context?.impersonatedOrganization;
  if (user?.isSuperAdmin && !isImpersonating) {
    return next();
  }
  
  if (!effectiveResult.organizationId) {
    return res.status(403).json({ error: "No organization context" });
  }
  
  if (requestedOrgId && requestedOrgId !== effectiveResult.organizationId) {
    console.log(`[OrgAccess] Blocked (fallback): User ${req.session.userId} tried to access org ${requestedOrgId} but effective org is ${effectiveResult.organizationId}`);
    return res.status(403).json({ error: "Access denied: Cross-organization access not permitted" });
  }
  
  const userRoles = await storage.getUserRoles(req.session.userId, effectiveResult.organizationId);
  
  if (userRoles.length === 0) {
    return res.status(403).json({ error: "Access denied: You do not belong to this organization" });
  }
  
  next();
}

// ============== ADMIN REPORT ROUTES ==============

router.get("/organizations/:orgId/student/:userId", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const performance = await storage.getStudentPerformanceByCollection(req.params.userId, req.params.orgId);
    res.json(performance);
  } catch (error) {
    console.error('Get student performance error:', error);
    res.status(500).json({ error: "Failed to fetch student performance" });
  }
});

router.get("/organizations/:orgId/student/:userId/results", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const collectionId = req.query.collectionId as string | undefined;
    const results = await storage.getStudentDetailedResults(req.params.userId, req.params.orgId, collectionId);
    res.json(results);
  } catch (error) {
    console.error('Get student results error:', error);
    res.status(500).json({ error: "Failed to fetch student results" });
  }
});

router.get("/organizations/:orgId/unit/:unitId/summary", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const summary = await storage.getUnitPerformanceSummary(req.params.unitId, req.params.orgId);
    res.json(summary);
  } catch (error) {
    console.error('Get unit summary error:', error);
    res.status(500).json({ error: "Failed to fetch unit summary" });
  }
});

router.get("/organizations/:orgId/summary", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const summary = await storage.getOrganizationPerformanceSummary(req.params.orgId);
    res.json(summary);
  } catch (error) {
    console.error('Get organization summary error:', error);
    res.status(500).json({ error: "Failed to fetch organization summary" });
  }
});

router.get("/organizations/:orgId/top-performers", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const filters: any = {};
    
    if (req.query.unitId && req.query.unitId !== 'all') {
      filters.unitId = req.query.unitId as string;
    }
    if (req.query.subjectId && req.query.subjectId !== 'all') {
      filters.subjectId = req.query.subjectId as string;
    }
    if (req.query.studentId && req.query.studentId !== 'all') {
      filters.studentId = req.query.studentId as string;
    }
    if (req.query.startDate) {
      filters.startDate = new Date(req.query.startDate as string);
    }
    if (req.query.endDate) {
      filters.endDate = new Date(req.query.endDate as string);
    }
    if (req.query.limit) {
      filters.limit = parseInt(req.query.limit as string);
    }
    
    const topPerformers = await storage.getTopPerformers(req.params.orgId, filters);
    res.json(topPerformers);
  } catch (error) {
    console.error('Get top performers error:', error);
    res.status(500).json({ error: "Failed to fetch top performers" });
  }
});

router.get("/organizations/:orgId/at-risk-students", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const filters: any = {};
    
    if (req.query.unitId && req.query.unitId !== 'all') {
      filters.unitId = req.query.unitId as string;
    }
    if (req.query.subjectId && req.query.subjectId !== 'all') {
      filters.subjectId = req.query.subjectId as string;
    }
    if (req.query.search && (req.query.search as string).trim()) {
      filters.search = (req.query.search as string).trim();
    }
    
    const atRiskStudents = await storage.getAtRiskStudents(req.params.orgId, filters);
    res.json(atRiskStudents);
  } catch (error) {
    console.error('Get at-risk students error:', error);
    res.status(500).json({ error: "Failed to fetch at-risk students" });
  }
});

router.get("/organizations/:orgId/performance-distribution", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const filters: any = {};
    
    if (req.query.unitId && req.query.unitId !== 'all') {
      filters.unitId = req.query.unitId as string;
    }
    if (req.query.subjectId && req.query.subjectId !== 'all') {
      filters.subjectId = req.query.subjectId as string;
    }
    
    const distribution = await storage.getPerformanceDistribution(req.params.orgId, filters);
    res.json(distribution);
  } catch (error) {
    console.error('Get performance distribution error:', error);
    res.status(500).json({ error: "Failed to fetch performance distribution" });
  }
});

router.get("/organizations/:orgId/students-by-range/:range", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const filters: any = {};
    
    if (req.query.unitId && req.query.unitId !== 'all') {
      filters.unitId = req.query.unitId as string;
    }
    if (req.query.subjectId && req.query.subjectId !== 'all') {
      filters.subjectId = req.query.subjectId as string;
    }
    
    const students = await storage.getStudentsByPerformanceRange(req.params.orgId, req.params.range, filters);
    res.json(students);
  } catch (error) {
    console.error('Get students by range error:', error);
    res.status(500).json({ error: "Failed to fetch students by performance range" });
  }
});

router.get("/organizations/:orgId/student-timeline/:studentId", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const filters: any = {};
    
    if (req.query.subjectId && req.query.subjectId !== 'all') {
      filters.subjectId = req.query.subjectId as string;
    }
    
    const timeline = await storage.getStudentTimeline(req.params.orgId, req.params.studentId, filters);
    res.json(timeline);
  } catch (error) {
    console.error('Get student timeline error:', error);
    res.status(500).json({ error: "Failed to fetch student timeline" });
  }
});

router.get("/student-analytics/:studentId", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const effectiveResult = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
    const organizationId = effectiveResult.organizationId;
    
    if (!organizationId) {
      return res.status(400).json({ error: "Organization context required" });
    }
    
    const filters: any = {};
    
    if (req.query.unitId && req.query.unitId !== 'all') {
      filters.unitId = req.query.unitId as string;
    }
    if (req.query.subjectId && req.query.subjectId !== 'all') {
      filters.subjectId = req.query.subjectId as string;
    }
    
    const analytics = await storage.getStudentAnalytics(req.params.studentId, organizationId, filters);
    res.json(analytics);
  } catch (error) {
    console.error('Get student analytics error:', error);
    res.status(500).json({ error: "Failed to fetch student analytics" });
  }
});

router.get("/organizations/:orgId/performance-heatmap", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const filters: any = {};
    
    if (req.query.unitId && req.query.unitId !== 'all') {
      filters.unitId = req.query.unitId as string;
    }
    
    if (req.query.subjectId && req.query.subjectId !== 'all') {
      filters.subjectId = req.query.subjectId as string;
    }
    
    if (req.query.search && (req.query.search as string).trim()) {
      filters.search = (req.query.search as string).trim();
    }
    
    const heatmap = await storage.getPerformanceHeatmap(req.params.orgId, filters);
    res.json(heatmap);
  } catch (error) {
    console.error('Get performance heatmap error:', error);
    res.status(500).json({ error: "Failed to fetch performance heatmap" });
  }
});

// ============== LEARNER ANALYTICS ENDPOINTS ==============

const learnerAnalyticsRouter = Router();

// 1. Overview KPIs
learnerAnalyticsRouter.get("/:orgId/overview", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const { courseId, departmentId, unitId, subUnitId, startDate: startDateStr, endDate: endDateStr, courseStatus } = req.query;
    
    const effectiveUnitId = (departmentId && departmentId !== 'all') ? departmentId as string : null;
    const effectiveSubUnitId = (subUnitId && subUnitId !== 'all') ? subUnitId as string :
                               (unitId && unitId !== 'all') ? unitId as string : null;
    const effectiveCourseId = (courseId && courseId !== 'all') ? courseId as string : null;
    const effectiveCourseStatus = (courseStatus && courseStatus !== 'all') ? courseStatus as string : null;
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const startDate = startDateStr ? new Date(startDateStr as string) : thirtyDaysAgo;
    const endDate = endDateStr ? new Date(endDateStr as string) : new Date();
    
    const periodLength = endDate.getTime() - startDate.getTime();
    const prevEndDate = new Date(startDate.getTime());
    const prevStartDate = new Date(startDate.getTime() - periodLength);
    
    const calculateTrend = (current: number, previous: number): number => {
      if (previous === 0) {
        return current > 0 ? 100 : 0;
      }
      return Math.round(((current - previous) / previous) * 1000) / 10;
    };
    
    const totalLearnersResult = await db.execute(sql`
      SELECT COUNT(DISTINCT uor."userId") as count 
      FROM "userOrganizationRoles" uor
      ${effectiveUnitId || effectiveSubUnitId || req.query.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = uor."userId" AND uoa."organizationId" = uor."organizationId"` : sql``}
      WHERE uor."organizationId" = ${orgId}
      AND uor.role IN ('learner', 'student', 'employee')
      ${effectiveUnitId ? sql`AND uoa."unitId" = ${effectiveUnitId}` : sql``}
      ${effectiveSubUnitId ? sql`AND uoa."subUnitId" = ${effectiveSubUnitId}` : sql``}
      ${req.query.teamId && req.query.teamId !== 'all' ? sql`AND uoa."teamId" = ${req.query.teamId as string}` : sql``}
    `);
    
    const activeLearnersResult = await db.execute(sql`
      SELECT COUNT(DISTINCT qgr."player1Id") as count 
      FROM "quizGameResults" qgr
      JOIN "userOrganizationRoles" uor ON qgr."player1Id" = uor."userId"
      ${effectiveUnitId || effectiveSubUnitId || req.query.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = uor."userId" AND uoa."organizationId" = uor."organizationId"` : sql``}
      LEFT JOIN "lessonQuizLinks" lql ON lql."quizId" = qgr."collectionId"
      LEFT JOIN "courseLessons" cl ON cl."lessonId" = COALESCE(qgr."lessonId", lql."lessonId")
      LEFT JOIN courses c ON c.id = COALESCE(qgr."courseId", cl."courseId")
      WHERE uor."organizationId" = ${orgId} 
      AND uor.role IN ('learner', 'student', 'employee')
      AND qgr."createdAt" >= ${startDate.toISOString()}
      AND qgr."createdAt" <= ${endDate.toISOString()}
      ${effectiveCourseId ? sql`AND COALESCE(qgr."courseId", cl."courseId") = ${effectiveCourseId}` : sql``}
      ${effectiveUnitId ? sql`AND uoa."unitId" = ${effectiveUnitId}` : sql``}
      ${effectiveSubUnitId ? sql`AND uoa."subUnitId" = ${effectiveSubUnitId}` : sql``}
      ${req.query.teamId && req.query.teamId !== 'all' ? sql`AND uoa."teamId" = ${req.query.teamId as string}` : sql``}
      ${effectiveCourseStatus ? sql`AND c.status = ${effectiveCourseStatus}` : sql``}
    `);
    
    const prevActiveLearnersResult = await db.execute(sql`
      SELECT COUNT(DISTINCT qgr."player1Id") as count 
      FROM "quizGameResults" qgr
      JOIN "userOrganizationRoles" uor ON qgr."player1Id" = uor."userId"
      ${effectiveUnitId || effectiveSubUnitId || req.query.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = uor."userId" AND uoa."organizationId" = uor."organizationId"` : sql``}
      LEFT JOIN "lessonQuizLinks" lql ON lql."quizId" = qgr."collectionId"
      LEFT JOIN "courseLessons" cl ON cl."lessonId" = COALESCE(qgr."lessonId", lql."lessonId")
      LEFT JOIN courses c ON c.id = COALESCE(qgr."courseId", cl."courseId")
      WHERE uor."organizationId" = ${orgId} 
      AND uor.role IN ('learner', 'student', 'employee')
      AND qgr."createdAt" >= ${prevStartDate.toISOString()}
      AND qgr."createdAt" < ${prevEndDate.toISOString()}
      ${effectiveCourseId ? sql`AND COALESCE(qgr."courseId", cl."courseId") = ${effectiveCourseId}` : sql``}
      ${effectiveUnitId ? sql`AND uoa."unitId" = ${effectiveUnitId}` : sql``}
      ${effectiveSubUnitId ? sql`AND uoa."subUnitId" = ${effectiveSubUnitId}` : sql``}
      ${req.query.teamId && req.query.teamId !== 'all' ? sql`AND uoa."teamId" = ${req.query.teamId as string}` : sql``}
      ${effectiveCourseStatus ? sql`AND c.status = ${effectiveCourseStatus}` : sql``}
    `);
    
    const completedCoursesResult = await db.execute(sql`
      SELECT COUNT(*) as count 
      FROM "courseProgress" cp
      ${effectiveUnitId || effectiveSubUnitId || req.query.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = cp."userId" AND uoa."organizationId" = cp."organizationId"` : sql``}
      ${effectiveCourseStatus ? sql`JOIN courses c ON c.id = cp."courseId"` : sql``}
      WHERE cp."organizationId" = ${orgId} 
      AND cp.status = 'completed'
      AND cp."completedAt" >= ${startDate.toISOString()}
      AND cp."completedAt" <= ${endDate.toISOString()}
      ${effectiveCourseId ? sql`AND cp."courseId" = ${effectiveCourseId}` : sql``}
      ${effectiveUnitId ? sql`AND uoa."unitId" = ${effectiveUnitId}` : sql``}
      ${effectiveSubUnitId ? sql`AND uoa."subUnitId" = ${effectiveSubUnitId}` : sql``}
      ${req.query.teamId && req.query.teamId !== 'all' ? sql`AND uoa."teamId" = ${req.query.teamId as string}` : sql``}
      ${effectiveCourseStatus ? sql`AND c.status = ${effectiveCourseStatus}` : sql``}
    `);
    
    const prevCompletedCoursesResult = await db.execute(sql`
      SELECT COUNT(*) as count 
      FROM "courseProgress" cp
      ${effectiveUnitId || effectiveSubUnitId || req.query.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = cp."userId" AND uoa."organizationId" = cp."organizationId"` : sql``}
      ${effectiveCourseStatus ? sql`JOIN courses c ON c.id = cp."courseId"` : sql``}
      WHERE cp."organizationId" = ${orgId} 
      AND cp.status = 'completed'
      AND cp."completedAt" >= ${prevStartDate.toISOString()}
      AND cp."completedAt" < ${prevEndDate.toISOString()}
      ${effectiveCourseId ? sql`AND cp."courseId" = ${effectiveCourseId}` : sql``}
      ${effectiveUnitId ? sql`AND uoa."unitId" = ${effectiveUnitId}` : sql``}
      ${effectiveSubUnitId ? sql`AND uoa."subUnitId" = ${effectiveSubUnitId}` : sql``}
      ${req.query.teamId && req.query.teamId !== 'all' ? sql`AND uoa."teamId" = ${req.query.teamId as string}` : sql``}
      ${effectiveCourseStatus ? sql`AND c.status = ${effectiveCourseStatus}` : sql``}
    `);
    
    const avgScoreResult = await db.execute(sql`
      SELECT AVG(CASE WHEN qgr."player1TotalAnswers" > 0 
            THEN (qgr."player1CorrectAnswers"::numeric / qgr."player1TotalAnswers") * 100 
            ELSE 0 END) as avg_score 
      FROM "quizGameResults" qgr
      JOIN "userOrganizationRoles" uor ON qgr."player1Id" = uor."userId"
      ${effectiveUnitId || effectiveSubUnitId || req.query.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = uor."userId" AND uoa."organizationId" = uor."organizationId"` : sql``}
      LEFT JOIN "lessonQuizLinks" lql ON lql."quizId" = qgr."collectionId"
      LEFT JOIN "courseLessons" cl ON cl."lessonId" = COALESCE(qgr."lessonId", lql."lessonId")
      LEFT JOIN courses c ON c.id = COALESCE(qgr."courseId", cl."courseId")
      WHERE uor."organizationId" = ${orgId}
      AND uor.role IN ('learner', 'student', 'employee')
      AND qgr."createdAt" >= ${startDate.toISOString()}
      AND qgr."createdAt" <= ${endDate.toISOString()}
      ${effectiveCourseId ? sql`AND COALESCE(qgr."courseId", cl."courseId") = ${effectiveCourseId}` : sql``}
      ${effectiveUnitId ? sql`AND uoa."unitId" = ${effectiveUnitId}` : sql``}
      ${effectiveSubUnitId ? sql`AND uoa."subUnitId" = ${effectiveSubUnitId}` : sql``}
      ${req.query.teamId && req.query.teamId !== 'all' ? sql`AND uoa."teamId" = ${req.query.teamId as string}` : sql``}
      ${effectiveCourseStatus ? sql`AND c.status = ${effectiveCourseStatus}` : sql``}
    `);
    
    const prevAvgScoreResult = await db.execute(sql`
      SELECT AVG(CASE WHEN qgr."player1TotalAnswers" > 0 
            THEN (qgr."player1CorrectAnswers"::numeric / qgr."player1TotalAnswers") * 100 
            ELSE 0 END) as avg_score 
      FROM "quizGameResults" qgr
      JOIN "userOrganizationRoles" uor ON qgr."player1Id" = uor."userId"
      ${effectiveUnitId || effectiveSubUnitId || req.query.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = uor."userId" AND uoa."organizationId" = uor."organizationId"` : sql``}
      LEFT JOIN "lessonQuizLinks" lql ON lql."quizId" = qgr."collectionId"
      LEFT JOIN "courseLessons" cl ON cl."lessonId" = COALESCE(qgr."lessonId", lql."lessonId")
      LEFT JOIN courses c ON c.id = COALESCE(qgr."courseId", cl."courseId")
      WHERE uor."organizationId" = ${orgId}
      AND uor.role IN ('learner', 'student', 'employee')
      AND qgr."createdAt" >= ${prevStartDate.toISOString()}
      AND qgr."createdAt" < ${prevEndDate.toISOString()}
      ${effectiveCourseId ? sql`AND COALESCE(qgr."courseId", cl."courseId") = ${effectiveCourseId}` : sql``}
      ${effectiveUnitId ? sql`AND uoa."unitId" = ${effectiveUnitId}` : sql``}
      ${effectiveSubUnitId ? sql`AND uoa."subUnitId" = ${effectiveSubUnitId}` : sql``}
      ${req.query.teamId && req.query.teamId !== 'all' ? sql`AND uoa."teamId" = ${req.query.teamId as string}` : sql``}
      ${effectiveCourseStatus ? sql`AND c.status = ${effectiveCourseStatus}` : sql``}
    `);
    
    const totalAssignments = await db.execute(sql`
      WITH effective_assignments AS (
        SELECT ca."courseId", ca."dueDate", ca."createdAt", ca."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        WHERE ca."userId" IS NOT NULL AND ca."organizationId" = ${orgId}

        UNION

        SELECT ca."courseId", ca."dueDate", ca."createdAt", uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."unitId" = ca."unitId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."unitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}

        UNION

        SELECT ca."courseId", ca."dueDate", ca."createdAt", uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."subUnitId" = ca."subUnitId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."subUnitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}

        UNION

        SELECT ca."courseId", ca."dueDate", ca."createdAt", uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."teamId" = ca."teamId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."teamId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
      )
      SELECT COUNT(*) as total
      FROM effective_assignments ea
      JOIN "userOrganizationRoles" uor ON uor."userId" = ea.user_id AND uor."organizationId" = ea."organizationId"
      ${effectiveUnitId || effectiveSubUnitId || req.query.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = ea.user_id AND uoa."organizationId" = ea."organizationId"` : sql``}
      ${effectiveCourseStatus ? sql`JOIN courses c ON c.id = ea."courseId"` : sql``}
      WHERE ea."createdAt" >= ${startDate.toISOString()}
      AND ea."createdAt" <= ${endDate.toISOString()}
      AND uor.role IN ('learner', 'student', 'employee')
      ${effectiveCourseId ? sql`AND ea."courseId" = ${effectiveCourseId}` : sql``}
      ${effectiveUnitId ? sql`AND uoa."unitId" = ${effectiveUnitId}` : sql``}
      ${effectiveSubUnitId ? sql`AND uoa."subUnitId" = ${effectiveSubUnitId}` : sql``}
      ${req.query.teamId && req.query.teamId !== 'all' ? sql`AND uoa."teamId" = ${req.query.teamId as string}` : sql``}
      ${effectiveCourseStatus ? sql`AND c.status = ${effectiveCourseStatus}` : sql``}
    `);
    const completedAssignments = await db.execute(sql`
      WITH effective_assignments AS (
        SELECT ca."courseId", ca."dueDate", ca."createdAt", ca."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        WHERE ca."userId" IS NOT NULL AND ca."organizationId" = ${orgId}
        UNION
        SELECT ca."courseId", ca."dueDate", ca."createdAt", uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."unitId" = ca."unitId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."unitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
        UNION
        SELECT ca."courseId", ca."dueDate", ca."createdAt", uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."subUnitId" = ca."subUnitId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."subUnitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
        UNION
        SELECT ca."courseId", ca."dueDate", ca."createdAt", uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."teamId" = ca."teamId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."teamId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
      )
      SELECT COUNT(*) as completed
      FROM effective_assignments ea
      JOIN "courseProgress" cp ON cp."userId" = ea.user_id AND cp."courseId" = ea."courseId" AND cp."organizationId" = ea."organizationId"
      JOIN "userOrganizationRoles" uor ON uor."userId" = ea.user_id AND uor."organizationId" = ea."organizationId"
      ${effectiveUnitId || effectiveSubUnitId || req.query.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = ea.user_id AND uoa."organizationId" = ea."organizationId"` : sql``}
      ${effectiveCourseStatus ? sql`JOIN courses c ON c.id = ea."courseId"` : sql``}
      WHERE cp.status = 'completed'
      AND ea."createdAt" >= ${startDate.toISOString()}
      AND ea."createdAt" <= ${endDate.toISOString()}
      AND uor.role IN ('learner', 'student', 'employee')
      ${effectiveCourseId ? sql`AND ea."courseId" = ${effectiveCourseId}` : sql``}
      ${effectiveUnitId ? sql`AND uoa."unitId" = ${effectiveUnitId}` : sql``}
      ${effectiveSubUnitId ? sql`AND uoa."subUnitId" = ${effectiveSubUnitId}` : sql``}
      ${req.query.teamId && req.query.teamId !== 'all' ? sql`AND uoa."teamId" = ${req.query.teamId as string}` : sql``}
      ${effectiveCourseStatus ? sql`AND c.status = ${effectiveCourseStatus}` : sql``}
    `);
    
    const prevTotalAssignments = await db.execute(sql`
      WITH effective_assignments AS (
        SELECT ca."courseId", ca."dueDate", ca."createdAt", ca."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        WHERE ca."userId" IS NOT NULL AND ca."organizationId" = ${orgId}
        UNION
        SELECT ca."courseId", ca."dueDate", ca."createdAt", uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."unitId" = ca."unitId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."unitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
        UNION
        SELECT ca."courseId", ca."dueDate", ca."createdAt", uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."subUnitId" = ca."subUnitId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."subUnitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
        UNION
        SELECT ca."courseId", ca."dueDate", ca."createdAt", uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."teamId" = ca."teamId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."teamId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
      )
      SELECT COUNT(*) as total
      FROM effective_assignments ea
      JOIN "userOrganizationRoles" uor ON uor."userId" = ea.user_id AND uor."organizationId" = ea."organizationId"
      ${effectiveUnitId || effectiveSubUnitId || req.query.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = ea.user_id AND uoa."organizationId" = ea."organizationId"` : sql``}
      ${effectiveCourseStatus ? sql`JOIN courses c ON c.id = ea."courseId"` : sql``}
      WHERE ea."createdAt" >= ${prevStartDate.toISOString()}
      AND ea."createdAt" < ${prevEndDate.toISOString()}
      AND uor.role IN ('learner', 'student', 'employee')
      ${effectiveCourseId ? sql`AND ea."courseId" = ${effectiveCourseId}` : sql``}
      ${effectiveUnitId ? sql`AND uoa."unitId" = ${effectiveUnitId}` : sql``}
      ${effectiveSubUnitId ? sql`AND uoa."subUnitId" = ${effectiveSubUnitId}` : sql``}
      ${req.query.teamId && req.query.teamId !== 'all' ? sql`AND uoa."teamId" = ${req.query.teamId as string}` : sql``}
      ${effectiveCourseStatus ? sql`AND c.status = ${effectiveCourseStatus}` : sql``}
    `);
    const prevCompletedAssignments = await db.execute(sql`
      WITH effective_assignments AS (
        SELECT ca."courseId", ca."dueDate", ca."createdAt", ca."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        WHERE ca."userId" IS NOT NULL AND ca."organizationId" = ${orgId}
        UNION
        SELECT ca."courseId", ca."dueDate", ca."createdAt", uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."unitId" = ca."unitId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."unitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
        UNION
        SELECT ca."courseId", ca."dueDate", ca."createdAt", uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."subUnitId" = ca."subUnitId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."subUnitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
        UNION
        SELECT ca."courseId", ca."dueDate", ca."createdAt", uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."teamId" = ca."teamId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."teamId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
      )
      SELECT COUNT(*) as completed
      FROM effective_assignments ea
      JOIN "courseProgress" cp ON cp."userId" = ea.user_id AND cp."courseId" = ea."courseId" AND cp."organizationId" = ea."organizationId"
      JOIN "userOrganizationRoles" uor ON uor."userId" = ea.user_id AND uor."organizationId" = ea."organizationId"
      ${effectiveUnitId || effectiveSubUnitId || req.query.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = ea.user_id AND uoa."organizationId" = ea."organizationId"` : sql``}
      ${effectiveCourseStatus ? sql`JOIN courses c ON c.id = ea."courseId"` : sql``}
      WHERE cp.status = 'completed'
      AND ea."createdAt" >= ${prevStartDate.toISOString()}
      AND ea."createdAt" < ${prevEndDate.toISOString()}
      AND uor.role IN ('learner', 'student', 'employee')
      ${effectiveCourseId ? sql`AND ea."courseId" = ${effectiveCourseId}` : sql``}
      ${effectiveUnitId ? sql`AND uoa."unitId" = ${effectiveUnitId}` : sql``}
      ${effectiveSubUnitId ? sql`AND uoa."subUnitId" = ${effectiveSubUnitId}` : sql``}
      ${req.query.teamId && req.query.teamId !== 'all' ? sql`AND uoa."teamId" = ${req.query.teamId as string}` : sql``}
      ${effectiveCourseStatus ? sql`AND c.status = ${effectiveCourseStatus}` : sql``}
    `);
    
    const overdueResult = await db.execute(sql`
      WITH effective_assignments AS (
        SELECT ca."courseId", ca."dueDate", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, ca."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        WHERE ca."userId" IS NOT NULL AND ca."organizationId" = ${orgId}
        UNION
        SELECT ca."courseId", ca."dueDate", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."unitId" = ca."unitId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."unitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
        UNION
        SELECT ca."courseId", ca."dueDate", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."subUnitId" = ca."subUnitId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."subUnitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
        UNION
        SELECT ca."courseId", ca."dueDate", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."teamId" = ca."teamId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."teamId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
      )
      SELECT COUNT(*) as count
      FROM effective_assignments ea
      LEFT JOIN "courseProgress" cp ON cp."userId" = ea.user_id AND cp."courseId" = ea."courseId" AND cp."organizationId" = ea."organizationId"
      JOIN "userOrganizationRoles" uor ON uor."userId" = ea.user_id AND uor."organizationId" = ea."organizationId"
      ${effectiveUnitId || effectiveSubUnitId || req.query.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = ea.user_id AND uoa."organizationId" = ea."organizationId"` : sql``}
      ${effectiveCourseStatus ? sql`JOIN courses c ON c.id = ea."courseId"` : sql``}
      WHERE ea."dueDate" < NOW()
      AND (cp.status IS NULL OR cp.status != 'completed')
      AND uor.role IN ('learner', 'student', 'employee')
      ${effectiveCourseId ? sql`AND ea."courseId" = ${effectiveCourseId}` : sql``}
      ${effectiveUnitId ? sql`AND uoa."unitId" = ${effectiveUnitId}` : sql``}
      ${effectiveSubUnitId ? sql`AND uoa."subUnitId" = ${effectiveSubUnitId}` : sql``}
      ${req.query.teamId && req.query.teamId !== 'all' ? sql`AND uoa."teamId" = ${req.query.teamId as string}` : sql``}
      ${effectiveCourseStatus ? sql`AND c.status = ${effectiveCourseStatus}` : sql``}
    `);

    const dueSoonResult = await db.execute(sql`
      WITH effective_assignments AS (
        SELECT ca."courseId", ca."dueDate", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, ca."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        WHERE ca."userId" IS NOT NULL AND ca."organizationId" = ${orgId}
        UNION
        SELECT ca."courseId", ca."dueDate", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."unitId" = ca."unitId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."unitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
        UNION
        SELECT ca."courseId", ca."dueDate", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."subUnitId" = ca."subUnitId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."subUnitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
        UNION
        SELECT ca."courseId", ca."dueDate", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."teamId" = ca."teamId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."teamId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
      )
      SELECT COUNT(*) as count
      FROM effective_assignments ea
      LEFT JOIN "courseProgress" cp ON cp."userId" = ea.user_id AND cp."courseId" = ea."courseId" AND cp."organizationId" = ea."organizationId"
      JOIN "userOrganizationRoles" uor ON uor."userId" = ea.user_id AND uor."organizationId" = ea."organizationId"
      ${effectiveUnitId || effectiveSubUnitId || req.query.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = ea.user_id AND uoa."organizationId" = ea."organizationId"` : sql``}
      ${effectiveCourseStatus ? sql`JOIN courses c ON c.id = ea."courseId"` : sql``}
      WHERE ea."dueDate" >= NOW()
      AND ea."dueDate" <= NOW() + INTERVAL '7 days'
      AND (cp.status IS NULL OR cp.status != 'completed')
      AND uor.role IN ('learner', 'student', 'employee')
      ${effectiveCourseId ? sql`AND ea."courseId" = ${effectiveCourseId}` : sql``}
      ${effectiveUnitId ? sql`AND uoa."unitId" = ${effectiveUnitId}` : sql``}
      ${effectiveSubUnitId ? sql`AND uoa."subUnitId" = ${effectiveSubUnitId}` : sql``}
      ${req.query.teamId && req.query.teamId !== 'all' ? sql`AND uoa."teamId" = ${req.query.teamId as string}` : sql``}
      ${effectiveCourseStatus ? sql`AND c.status = ${effectiveCourseStatus}` : sql``}
    `);
    
    const activeLearners = Number((activeLearnersResult.rows[0] as any)?.count || 0);
    const prevActiveLearners = Number((prevActiveLearnersResult.rows[0] as any)?.count || 0);
    const coursesCompletedValue = Number((completedCoursesResult.rows[0] as any)?.count || 0);
    const prevCoursesCompleted = Number((prevCompletedCoursesResult.rows[0] as any)?.count || 0);
    const avgQuizScoreValue = Number((avgScoreResult.rows[0] as any)?.avg_score || 0);
    const prevAvgQuizScore = Number((prevAvgScoreResult.rows[0] as any)?.avg_score || 0);
    
    const total = Number((totalAssignments.rows[0] as any)?.total || 0);
    const completed = Number((completedAssignments.rows[0] as any)?.completed || 0);
    const completionRate = total > 0 ? (completed / total) * 100 : 0;
    
    const prevTotal = Number((prevTotalAssignments.rows[0] as any)?.total || 0);
    const prevCompleted = Number((prevCompletedAssignments.rows[0] as any)?.completed || 0);
    const prevCompletionRate = prevTotal > 0 ? (prevCompleted / prevTotal) * 100 : 0;
    
    const activeLearnersTrend = calculateTrend(activeLearners, prevActiveLearners);
    const coursesCompletedTrend = calculateTrend(coursesCompletedValue, prevCoursesCompleted);
    const averageQuizScoreTrend = calculateTrend(avgQuizScoreValue, prevAvgQuizScore);
    const completionRateTrend = calculateTrend(completionRate, prevCompletionRate);
    
    res.json({
      activeLearners,
      totalLearners: Number((totalLearnersResult.rows[0] as any)?.count || 0),
      completedCourses: coursesCompletedValue,
      coursesCompleted: coursesCompletedValue,
      avgQuizScore: avgQuizScoreValue,
      averageQuizScore: avgQuizScoreValue,
      completionRate,
      overdueCount: Number((overdueResult.rows[0] as any)?.count || 0),
      dueSoonCount: Number((dueSoonResult.rows[0] as any)?.count || 0),
      activeLearnersTrend,
      coursesCompletedTrend,
      averageQuizScoreTrend,
      completionRateTrend
    });
  } catch (error) {
    console.error("Error fetching learner overview:", error);
    res.status(500).json({ error: "Failed to fetch learner overview" });
  }
});

// 2. Completion Funnel
learnerAnalyticsRouter.get("/:orgId/completion-funnel", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const filters = parseReportFilters(req.query);
    
    const enrolledResult = await db.execute(sql`
      WITH effective_assignments AS (
        SELECT ca."courseId", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, ca."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        WHERE ca."userId" IS NOT NULL AND ca."organizationId" = ${orgId}
        UNION
        SELECT ca."courseId", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."unitId" = ca."unitId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."unitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
        UNION
        SELECT ca."courseId", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."subUnitId" = ca."subUnitId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."subUnitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
        UNION
        SELECT ca."courseId", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."teamId" = ca."teamId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."teamId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
      )
      SELECT COUNT(DISTINCT ea.user_id) as count
      FROM effective_assignments ea
      JOIN "userOrganizationRoles" uor ON uor."userId" = ea.user_id AND uor."organizationId" = ea."organizationId"
      ${filters.unitId || filters.subUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = ea.user_id AND uoa."organizationId" = ea."organizationId"` : sql``}
      ${filters.courseStatus ? sql`JOIN courses c ON c.id = ea."courseId"` : sql``}
      WHERE 1=1
      AND uor.role IN ('learner', 'student', 'employee')
      ${filters.courseId ? sql`AND ea."courseId" = ${filters.courseId}` : sql``}
      ${filters.unitId ? sql`AND uoa."unitId" = ${filters.unitId}` : sql``}
      ${filters.subUnitId ? sql`AND uoa."subUnitId" = ${filters.subUnitId}` : sql``}
      ${filters.teamId ? sql`AND uoa."teamId" = ${filters.teamId}` : sql``}
      ${filters.courseStatus ? sql`AND c.status = ${filters.courseStatus}` : sql``}
      ${filters.startDate ? sql`AND ea.assigned_on >= ${filters.startDate.toISOString()}` : sql``}
      ${filters.endDate ? sql`AND ea.assigned_on <= ${filters.endDate.toISOString()}` : sql``}
      ${filters.search ? sql`AND EXISTS (SELECT 1 FROM courses c_search WHERE c_search.id = ea."courseId" AND c_search.title ILIKE ${'%' + filters.search + '%'})` : sql``}
    `);
    
    const startedResult = await db.execute(sql`
      SELECT COUNT(DISTINCT cp."userId") as count 
      FROM "courseProgress" cp
      ${filters.unitId || filters.subUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = cp."userId" AND uoa."organizationId" = cp."organizationId"` : sql``}
      ${filters.courseStatus ? sql`JOIN courses c ON c.id = cp."courseId"` : sql``}
      JOIN "userOrganizationRoles" uor ON uor."userId" = cp."userId" AND uor."organizationId" = cp."organizationId"
      WHERE cp."organizationId" = ${orgId}
      AND uor.role IN ('learner', 'student', 'employee')
      AND cp.status IN ('in_progress', 'completed')
      ${filters.courseId ? sql`AND cp."courseId" = ${filters.courseId}` : sql``}
      ${filters.unitId ? sql`AND uoa."unitId" = ${filters.unitId}` : sql``}
      ${filters.subUnitId ? sql`AND uoa."subUnitId" = ${filters.subUnitId}` : sql``}
      ${filters.teamId ? sql`AND uoa."teamId" = ${filters.teamId}` : sql``}
      ${filters.courseStatus ? sql`AND c.status = ${filters.courseStatus}` : sql``}
      ${filters.startDate ? sql`AND cp."updatedAt" >= ${filters.startDate.toISOString()}` : sql``}
      ${filters.endDate ? sql`AND cp."updatedAt" <= ${filters.endDate.toISOString()}` : sql``}
      ${filters.search ? sql`AND EXISTS (SELECT 1 FROM courses c_search WHERE c_search.id = cp."courseId" AND c_search.title ILIKE ${'%' + filters.search + '%'})` : sql``}
    `);
    
    const inProgressResult = await db.execute(sql`
      SELECT COUNT(DISTINCT cp."userId") as count 
      FROM "courseProgress" cp
      ${filters.unitId || filters.subUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = cp."userId" AND uoa."organizationId" = cp."organizationId"` : sql``}
      ${filters.courseStatus ? sql`JOIN courses c ON c.id = cp."courseId"` : sql``}
      JOIN "userOrganizationRoles" uor ON uor."userId" = cp."userId" AND uor."organizationId" = cp."organizationId"
      WHERE cp."organizationId" = ${orgId}
      AND uor.role IN ('learner', 'student', 'employee')
      AND cp.status = 'in_progress'
      ${filters.courseId ? sql`AND cp."courseId" = ${filters.courseId}` : sql``}
      ${filters.unitId ? sql`AND uoa."unitId" = ${filters.unitId}` : sql``}
      ${filters.subUnitId ? sql`AND uoa."subUnitId" = ${filters.subUnitId}` : sql``}
      ${filters.teamId ? sql`AND uoa."teamId" = ${filters.teamId}` : sql``}
      ${filters.courseStatus ? sql`AND c.status = ${filters.courseStatus}` : sql``}
      ${filters.startDate ? sql`AND cp."updatedAt" >= ${filters.startDate.toISOString()}` : sql``}
      ${filters.endDate ? sql`AND cp."updatedAt" <= ${filters.endDate.toISOString()}` : sql``}
      ${filters.search ? sql`AND EXISTS (SELECT 1 FROM courses c_search WHERE c_search.id = cp."courseId" AND c_search.title ILIKE ${'%' + filters.search + '%'})` : sql``}
    `);
    
    const completedResult = await db.execute(sql`
      SELECT COUNT(DISTINCT cp."userId") as count 
      FROM "courseProgress" cp
      ${filters.unitId || filters.subUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = cp."userId" AND uoa."organizationId" = cp."organizationId"` : sql``}
      ${filters.courseStatus ? sql`JOIN courses c ON c.id = cp."courseId"` : sql``}
      JOIN "userOrganizationRoles" uor ON uor."userId" = cp."userId" AND uor."organizationId" = cp."organizationId"
      WHERE cp."organizationId" = ${orgId}
      AND uor.role IN ('learner', 'student', 'employee')
      AND cp.status = 'completed'
      ${filters.courseId ? sql`AND cp."courseId" = ${filters.courseId}` : sql``}
      ${filters.unitId ? sql`AND uoa."unitId" = ${filters.unitId}` : sql``}
      ${filters.subUnitId ? sql`AND uoa."subUnitId" = ${filters.subUnitId}` : sql``}
      ${filters.teamId ? sql`AND uoa."teamId" = ${filters.teamId}` : sql``}
      ${filters.courseStatus ? sql`AND c.status = ${filters.courseStatus}` : sql``}
      ${filters.startDate ? sql`AND cp."completedAt" >= ${filters.startDate.toISOString()}` : sql``}
      ${filters.endDate ? sql`AND cp."completedAt" <= ${filters.endDate.toISOString()}` : sql``}
      ${filters.search ? sql`AND EXISTS (SELECT 1 FROM courses c_search WHERE c_search.id = cp."courseId" AND c_search.title ILIKE ${'%' + filters.search + '%'})` : sql``}
    `);
    
    // Per-course breakdown for the Courses tab - apply all filters to subqueries
    const coursesResult = await db.execute(sql`
      WITH effective_assignments AS (
        SELECT ca."courseId", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, ca."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        WHERE ca."userId" IS NOT NULL AND ca."organizationId" = ${orgId}
        UNION
        SELECT ca."courseId", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."unitId" = ca."unitId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."unitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
        UNION
        SELECT ca."courseId", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."subUnitId" = ca."subUnitId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."subUnitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
        UNION
        SELECT ca."courseId", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."teamId" = ca."teamId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."teamId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
      ),
      filtered_enrolled AS (
        SELECT ea."courseId", COUNT(DISTINCT ea.user_id) as count
        FROM effective_assignments ea
        JOIN "userOrganizationRoles" uor ON uor."userId" = ea.user_id AND uor."organizationId" = ea."organizationId"
        ${filters.unitId || filters.subUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = ea.user_id AND uoa."organizationId" = ea."organizationId"` : sql``}
        ${filters.courseStatus ? sql`JOIN courses c ON c.id = ea."courseId"` : sql``}
        WHERE uor.role IN ('learner', 'student', 'employee')
        ${filters.unitId ? sql`AND uoa."unitId" = ${filters.unitId}` : sql``}
      ${filters.subUnitId ? sql`AND uoa."subUnitId" = ${filters.subUnitId}` : sql``}
        ${filters.teamId ? sql`AND uoa."teamId" = ${filters.teamId}` : sql``}
        ${filters.courseStatus ? sql`AND c.status = ${filters.courseStatus}` : sql``}
        ${filters.startDate ? sql`AND ea.assigned_on >= ${filters.startDate.toISOString()}` : sql``}
        ${filters.endDate ? sql`AND ea.assigned_on <= ${filters.endDate.toISOString()}` : sql``}
        GROUP BY ea."courseId"
      ),
      filtered_started AS (
        SELECT cp."courseId", COUNT(DISTINCT cp."userId") as count
        FROM "courseProgress" cp
        ${filters.unitId || filters.subUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = cp."userId" AND uoa."organizationId" = cp."organizationId"` : sql``}
        ${filters.courseStatus ? sql`JOIN courses c ON c.id = cp."courseId"` : sql``}
        JOIN "userOrganizationRoles" uor ON uor."userId" = cp."userId" AND uor."organizationId" = cp."organizationId"
        WHERE cp."organizationId" = ${orgId} 
        AND uor.role IN ('learner', 'student', 'employee')
        AND cp.status IN ('in_progress', 'completed')
        ${filters.unitId ? sql`AND uoa."unitId" = ${filters.unitId}` : sql``}
      ${filters.subUnitId ? sql`AND uoa."subUnitId" = ${filters.subUnitId}` : sql``}
        ${filters.teamId ? sql`AND uoa."teamId" = ${filters.teamId}` : sql``}
        ${filters.courseStatus ? sql`AND c.status = ${filters.courseStatus}` : sql``}
        ${filters.startDate ? sql`AND cp."updatedAt" >= ${filters.startDate.toISOString()}` : sql``}
        ${filters.endDate ? sql`AND cp."updatedAt" <= ${filters.endDate.toISOString()}` : sql``}
        GROUP BY cp."courseId"
      ),
      filtered_in_progress AS (
        SELECT cp."courseId", COUNT(DISTINCT cp."userId") as count
        FROM "courseProgress" cp
        ${filters.unitId || filters.subUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = cp."userId" AND uoa."organizationId" = cp."organizationId"` : sql``}
        ${filters.courseStatus ? sql`JOIN courses c ON c.id = cp."courseId"` : sql``}
        JOIN "userOrganizationRoles" uor ON uor."userId" = cp."userId" AND uor."organizationId" = cp."organizationId"
        WHERE cp."organizationId" = ${orgId} 
        AND uor.role IN ('learner', 'student', 'employee')
        AND cp.status = 'in_progress'
        ${filters.unitId ? sql`AND uoa."unitId" = ${filters.unitId}` : sql``}
      ${filters.subUnitId ? sql`AND uoa."subUnitId" = ${filters.subUnitId}` : sql``}
        ${filters.teamId ? sql`AND uoa."teamId" = ${filters.teamId}` : sql``}
        ${filters.courseStatus ? sql`AND c.status = ${filters.courseStatus}` : sql``}
        ${filters.startDate ? sql`AND cp."updatedAt" >= ${filters.startDate.toISOString()}` : sql``}
        ${filters.endDate ? sql`AND cp."updatedAt" <= ${filters.endDate.toISOString()}` : sql``}
        GROUP BY cp."courseId"
      ),
      filtered_completed AS (
        SELECT cp."courseId", COUNT(DISTINCT cp."userId") as count
        FROM "courseProgress" cp
        ${filters.unitId || filters.subUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = cp."userId" AND uoa."organizationId" = cp."organizationId"` : sql``}
        ${filters.courseStatus ? sql`JOIN courses c ON c.id = cp."courseId"` : sql``}
        JOIN "userOrganizationRoles" uor ON uor."userId" = cp."userId" AND uor."organizationId" = cp."organizationId"
        WHERE cp."organizationId" = ${orgId} 
        AND uor.role IN ('learner', 'student', 'employee')
        AND cp.status = 'completed'
        ${filters.unitId ? sql`AND uoa."unitId" = ${filters.unitId}` : sql``}
      ${filters.subUnitId ? sql`AND uoa."subUnitId" = ${filters.subUnitId}` : sql``}
        ${filters.teamId ? sql`AND uoa."teamId" = ${filters.teamId}` : sql``}
        ${filters.courseStatus ? sql`AND c.status = ${filters.courseStatus}` : sql``}
        ${filters.startDate ? sql`AND cp."completedAt" >= ${filters.startDate.toISOString()}` : sql``}
        ${filters.endDate ? sql`AND cp."completedAt" <= ${filters.endDate.toISOString()}` : sql``}
        GROUP BY cp."courseId"
      )
      SELECT 
        c.id as "courseId",
        c.title as "courseName",
        COALESCE(enrolled.count, 0) as enrolled,
        COALESCE(started.count, 0) as started,
        COALESCE(in_progress.count, 0) as "inProgress",
        COALESCE(completed.count, 0) as completed
      FROM courses c
      LEFT JOIN filtered_enrolled enrolled ON enrolled."courseId" = c.id
      LEFT JOIN filtered_started started ON started."courseId" = c.id
      LEFT JOIN filtered_in_progress in_progress ON in_progress."courseId" = c.id
      LEFT JOIN filtered_completed completed ON completed."courseId" = c.id
      WHERE c."organizationId" = ${orgId}
      ${filters.courseId ? sql`AND c.id = ${filters.courseId}` : sql``}
      ${filters.courseStatus ? sql`AND c.status = ${filters.courseStatus}` : sql``}
      ${filters.search ? sql`AND c.title ILIKE ${'%' + filters.search + '%'}` : sql``}
      ORDER BY c.title
    `);
    
    res.json({
      enrolled: Number((enrolledResult.rows[0] as any)?.count || 0),
      started: Number((startedResult.rows[0] as any)?.count || 0),
      inProgress: Number((inProgressResult.rows[0] as any)?.count || 0),
      completed: Number((completedResult.rows[0] as any)?.count || 0),
      courses: coursesResult.rows.map((row: any) => ({
        courseId: row.courseId,
        courseName: row.courseName,
        enrolled: Number(row.enrolled || 0),
        started: Number(row.started || 0),
        inProgress: Number(row.inProgress || 0),
        completed: Number(row.completed || 0)
      }))
    });
  } catch (error) {
    console.error("Error fetching completion funnel:", error);
    res.status(500).json({ error: "Failed to fetch completion funnel" });
  }
});

// 3. Top Performers
learnerAnalyticsRouter.get("/:orgId/top-performers", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const filters = parseReportFilters(req.query);
    const limit = filters.limit || 10;
    
    const result = await db.execute(sql`
      SELECT 
        u.id as user_id,
        COALESCE(u."gamerName", u."firstName" || ' ' || u."lastName", 'Unknown') as name,
        u.email,
        (SELECT COUNT(*) FROM "courseProgress" cp2 
          ${filters.courseStatus ? sql`JOIN courses c2 ON c2.id = cp2."courseId"` : sql``}
          WHERE cp2."userId" = u.id AND cp2.status = 'completed'
          ${filters.courseId ? sql`AND cp2."courseId" = ${filters.courseId}` : sql``}
          ${filters.courseStatus ? sql`AND c2.status = ${filters.courseStatus}` : sql``}
          ${filters.startDate ? sql`AND cp2."completedAt" >= ${filters.startDate.toISOString()}` : sql``}
          ${filters.endDate ? sql`AND cp2."completedAt" <= ${filters.endDate.toISOString()}` : sql``}
        ) as courses_completed,
        COUNT(qgr.id) as total_quizzes,
        AVG(CASE WHEN qgr."player1TotalAnswers" > 0 
          THEN (qgr."player1CorrectAnswers"::numeric / qgr."player1TotalAnswers") * 100 
          ELSE 0 END) as avg_score
      FROM users u
      JOIN "userOrganizationRoles" uor ON uor."userId" = u.id AND uor."organizationId" = ${orgId}
      LEFT JOIN "quizGameResults" qgr ON qgr."player1Id" = u.id
        ${filters.startDate ? sql`AND qgr."createdAt" >= ${filters.startDate.toISOString()}` : sql``}
        ${filters.endDate ? sql`AND qgr."createdAt" <= ${filters.endDate.toISOString()}` : sql``}
      ${filters.unitId || filters.subUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = u.id AND uoa."organizationId" = ${orgId}` : sql``}
      LEFT JOIN "lessonQuizLinks" lql ON lql."quizId" = qgr."collectionId"
      LEFT JOIN "courseLessons" cl ON cl."lessonId" = COALESCE(qgr."lessonId", lql."lessonId")
      LEFT JOIN courses c ON c.id = COALESCE(qgr."courseId", cl."courseId")
      WHERE 1=1
      AND uor.role IN ('learner', 'student', 'employee')
      ${filters.unitId ? sql`AND uoa."unitId" = ${filters.unitId}` : sql``}
      ${filters.subUnitId ? sql`AND uoa."subUnitId" = ${filters.subUnitId}` : sql``}
      ${filters.teamId ? sql`AND uoa."teamId" = ${filters.teamId}` : sql``}
      ${filters.search ? sql`AND (u."gamerName" ILIKE ${'%' + filters.search + '%'} OR u."firstName" ILIKE ${'%' + filters.search + '%'} OR u."lastName" ILIKE ${'%' + filters.search + '%'} OR u.email ILIKE ${'%' + filters.search + '%'})` : sql``}
      ${filters.courseId ? sql`AND COALESCE(qgr."courseId", cl."courseId") = ${filters.courseId}` : sql``}
      ${filters.courseStatus ? sql`AND (c.status = ${filters.courseStatus} OR c.id IS NULL)` : sql``}
      GROUP BY u.id, u."gamerName", u."firstName", u."lastName", u.email
      HAVING (
        SELECT COUNT(*) FROM "courseProgress" cp2 
        ${filters.courseStatus ? sql`JOIN courses c2 ON c2.id = cp2."courseId"` : sql``}
        WHERE cp2."userId" = u.id AND cp2.status = 'completed'
        ${filters.courseId ? sql`AND cp2."courseId" = ${filters.courseId}` : sql``}
        ${filters.courseStatus ? sql`AND c2.status = ${filters.courseStatus}` : sql``}
      ) > 0 OR COUNT(qgr.id) >= 1
      ORDER BY 
        (SELECT COUNT(*) FROM "courseProgress" cp2 
          ${filters.courseStatus ? sql`JOIN courses c2 ON c2.id = cp2."courseId"` : sql``}
          WHERE cp2."userId" = u.id AND cp2.status = 'completed'
          ${filters.courseId ? sql`AND cp2."courseId" = ${filters.courseId}` : sql``}
          ${filters.courseStatus ? sql`AND c2.status = ${filters.courseStatus}` : sql``}
        ) DESC,
        avg_score DESC NULLS LAST
      LIMIT ${limit}
    `);
    
    res.json({
      performers: (result.rows as any[]).map((r, i) => ({
        userId: r.user_id,
        name: r.name || 'Unknown',
        email: r.email || '',
        coursesCompleted: Number(r.courses_completed || 0),
        totalQuizzes: Number(r.total_quizzes || 0),
        avgScore: Number(r.avg_score || 0),
        rank: i + 1
      }))
    });
  } catch (error) {
    console.error("Error fetching top performers:", error);
    res.status(500).json({ error: "Failed to fetch top performers" });
  }
});

// 4. At-Risk Learners
learnerAnalyticsRouter.get("/:orgId/at-risk-learners", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const filters = parseReportFilters(req.query);
    
    const effectiveUnitId = filters.unitId || null;
    const effectiveSubUnitId = filters.subUnitId || null;
    const effectiveCourseId = filters.courseId || null;
    const effectiveCourseStatus = filters.courseStatus || null;
    const searchFilter = filters.search || null;
    const startDate = filters.startDate || null;
    const endDate = filters.endDate || null;
    
    const atRisk: any[] = [];
    
    // Overdue assignments query with expanded assignment coverage and learner-only filtering
    const overdueResult = await db.execute(sql`
      WITH effective_assignments AS (
        SELECT ca."courseId", ca."dueDate", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, ca."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        WHERE ca."userId" IS NOT NULL AND ca."organizationId" = ${orgId}

        UNION

        SELECT ca."courseId", ca."dueDate", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."unitId" = ca."unitId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."unitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}

        UNION

        SELECT ca."courseId", ca."dueDate", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."subUnitId" = ca."subUnitId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."subUnitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}

        UNION

        SELECT ca."courseId", ca."dueDate", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."teamId" = ca."teamId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."teamId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
      )
      SELECT 
        u.id as user_id,
        u.email,
        COALESCE(u."gamerName", u."firstName" || ' ' || u."lastName", 'Unknown') as name,
        COUNT(*) as overdue_count
      FROM effective_assignments ea
      JOIN users u ON u.id = ea.user_id
      JOIN "userOrganizationRoles" uor ON uor."userId" = ea.user_id AND uor."organizationId" = ea."organizationId"
      LEFT JOIN "courseProgress" cp ON cp."userId" = ea.user_id AND cp."courseId" = ea."courseId" AND cp."organizationId" = ea."organizationId"
      JOIN courses c ON c.id = ea."courseId"
      ${effectiveUnitId || effectiveSubUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = ea.user_id AND uoa."organizationId" = ea."organizationId"` : sql``}
      WHERE ea."dueDate" < NOW() - INTERVAL '7 days'
      AND uor.role IN ('learner', 'student', 'employee')
      AND (cp.status IS NULL OR cp.status != 'completed')
      ${effectiveCourseId ? sql`AND ea."courseId" = ${effectiveCourseId}` : sql``}
      ${effectiveUnitId ? sql`AND uoa."unitId" = ${effectiveUnitId}` : sql``}
      ${effectiveSubUnitId ? sql`AND uoa."subUnitId" = ${effectiveSubUnitId}` : sql``}
      ${filters.teamId ? sql`AND uoa."teamId" = ${filters.teamId}` : sql``}
      ${effectiveCourseStatus ? sql`AND c.status = ${effectiveCourseStatus}` : sql``}
      ${startDate ? sql`AND ea.assigned_on >= ${startDate.toISOString()}` : sql``}
      ${endDate ? sql`AND ea.assigned_on <= ${endDate.toISOString()}` : sql``}
      ${searchFilter ? sql`AND (u."gamerName" ILIKE ${'%' + searchFilter + '%'} OR u."firstName" ILIKE ${'%' + searchFilter + '%'} OR u."lastName" ILIKE ${'%' + searchFilter + '%'} OR u.email ILIKE ${'%' + searchFilter + '%'})` : sql``}
      GROUP BY u.id, u.email, u."gamerName", u."firstName", u."lastName"
    `);
    
    for (const r of overdueResult.rows as any[]) {
      atRisk.push({
        userId: r.user_id,
        name: r.name || 'Unknown',
        email: r.email || '',
        reason: 'overdue_assignments',
        details: `${r.overdue_count} courses past due`,
        daysOverdue: 0,
        progress: '0%'
      });
    }
    
    // Low score detection with fallback joins (always applied) and date range/courseStatus filtering
    const lowScoreResult = await db.execute(sql`
      SELECT 
        u.id as user_id,
        u.email,
        COALESCE(u."gamerName", u."firstName" || ' ' || u."lastName", 'Unknown') as name,
        AVG(CASE WHEN qgr."player1TotalAnswers" > 0 
       THEN (qgr."player1CorrectAnswers"::numeric / qgr."player1TotalAnswers") * 100 
       ELSE 0 END) as avg_score,
        COUNT(*) as total_attempts
      FROM users u
      JOIN "quizGameResults" qgr ON qgr."player1Id" = u.id
      JOIN "userOrganizationRoles" uor ON uor."userId" = qgr."player1Id" AND uor."organizationId" = ${orgId}
      ${effectiveUnitId || effectiveSubUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = u.id AND uoa."organizationId" = uor."organizationId"` : sql``}
      LEFT JOIN "lessonQuizLinks" lql ON lql."quizId" = qgr."collectionId"
      LEFT JOIN "courseLessons" cl ON cl."lessonId" = COALESCE(qgr."lessonId", lql."lessonId")
      LEFT JOIN courses c ON c.id = COALESCE(qgr."courseId", cl."courseId")
      WHERE 1=1
      AND uor.role IN ('learner', 'student', 'employee')
      ${effectiveCourseId ? sql`AND COALESCE(qgr."courseId", cl."courseId") = ${effectiveCourseId}` : sql``}
      ${effectiveUnitId ? sql`AND uoa."unitId" = ${effectiveUnitId}` : sql``}
      ${effectiveSubUnitId ? sql`AND uoa."subUnitId" = ${effectiveSubUnitId}` : sql``}
      ${filters.teamId ? sql`AND uoa."teamId" = ${filters.teamId}` : sql``}
      ${effectiveCourseStatus ? sql`AND c.status = ${effectiveCourseStatus}` : sql``}
      ${startDate ? sql`AND qgr."createdAt" >= ${startDate.toISOString()}` : sql``}
      ${endDate ? sql`AND qgr."createdAt" <= ${endDate.toISOString()}` : sql``}
      ${searchFilter ? sql`AND (u."gamerName" ILIKE ${'%' + searchFilter + '%'} OR u."firstName" ILIKE ${'%' + searchFilter + '%'} OR u."lastName" ILIKE ${'%' + searchFilter + '%'} OR u.email ILIKE ${'%' + searchFilter + '%'})` : sql``}
      GROUP BY u.id, u.email, u."gamerName", u."firstName", u."lastName"
      HAVING AVG(CASE WHEN qgr."player1TotalAnswers" > 0 
            THEN (qgr."player1CorrectAnswers"::numeric / qgr."player1TotalAnswers") * 100 
            ELSE 0 END) < ${LOW_SCORE_THRESHOLD}
    `);
    
    for (const r of lowScoreResult.rows as any[]) {
      if (!atRisk.find(a => a.userId === r.user_id)) {
        atRisk.push({
          userId: r.user_id,
          name: r.name || 'Unknown',
          email: r.email || '',
          reason: 'low_quiz_scores',
          avgScore: Math.round(r.avg_score) + '%',
          totalAttempts: Number(r.total_attempts || 0),
          details: `Average score: ${Math.round(r.avg_score)}%`
        });
      }
    }
    
    // Inactive detection: check both quiz activity AND course progress activity
    // Use date range if provided, otherwise default to 14 days
    const inactivityWindow = startDate ? startDate : (() => {
      const d = new Date();
      d.setDate(d.getDate() - 14);
      return d;
    })();
    
    const inactiveResult = await db.execute(sql`
      SELECT 
        u.id as user_id,
        u.email,
        COALESCE(u."gamerName", u."firstName" || ' ' || u."lastName", 'Unknown') as name,
        MAX(qgr."createdAt") as last_quiz_activity,
        MAX(cp."updatedAt") as last_course_activity,
        GREATEST(MAX(qgr."createdAt"), MAX(cp."updatedAt")) as last_active
      FROM users u
      JOIN "userOrganizationRoles" uor ON uor."userId" = u.id AND uor."organizationId" = ${orgId}
      ${effectiveUnitId || effectiveSubUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = u.id AND uoa."organizationId" = uor."organizationId"` : sql``}
      LEFT JOIN "quizGameResults" qgr ON qgr."player1Id" = u.id
      LEFT JOIN "courseProgress" cp ON cp."userId" = u.id AND cp."organizationId" = ${orgId}
      ${effectiveCourseId ? sql`LEFT JOIN "lessonQuizLinks" lql ON lql."quizId" = qgr."collectionId"` : sql``}
      ${effectiveCourseId ? sql`LEFT JOIN "courseLessons" cl ON cl."lessonId" = COALESCE(qgr."lessonId", lql."lessonId")` : sql``}
      ${effectiveCourseStatus ? sql`LEFT JOIN courses c ON c.id = COALESCE(qgr."courseId", ${effectiveCourseId ? sql`cl."courseId"` : sql`cp."courseId"`})` : sql``}
      WHERE 1=1
      AND uor.role IN ('learner', 'student', 'employee')
      ${effectiveUnitId ? sql`AND uoa."unitId" = ${effectiveUnitId}` : sql``}
      ${effectiveSubUnitId ? sql`AND uoa."subUnitId" = ${effectiveSubUnitId}` : sql``}
      ${filters.teamId ? sql`AND uoa."teamId" = ${filters.teamId}` : sql``}
      ${effectiveCourseId ? sql`AND (COALESCE(qgr."courseId", cl."courseId") = ${effectiveCourseId} OR cp."courseId" = ${effectiveCourseId})` : sql``}
      ${effectiveCourseStatus ? sql`AND c.status = ${effectiveCourseStatus}` : sql``}
      ${searchFilter ? sql`AND (u."gamerName" ILIKE ${'%' + searchFilter + '%'} OR u."firstName" ILIKE ${'%' + searchFilter + '%'} OR u."lastName" ILIKE ${'%' + searchFilter + '%'} OR u.email ILIKE ${'%' + searchFilter + '%'})` : sql``}
      GROUP BY u.id, u.email, u."gamerName", u."firstName", u."lastName"
      HAVING (
        (MAX(qgr."createdAt") IS NULL OR MAX(qgr."createdAt") < ${inactivityWindow.toISOString()})
        AND (MAX(cp."updatedAt") IS NULL OR MAX(cp."updatedAt") < ${inactivityWindow.toISOString()})
      )
    `);
    
    for (const r of inactiveResult.rows as any[]) {
      if (!atRisk.find(a => a.userId === r.user_id)) {
        const lastActive = r.last_active ? new Date(r.last_active) : null;
        const daysInactive = lastActive ? Math.floor((Date.now() - lastActive.getTime()) / (1000 * 60 * 60 * 24)) : 999;
        atRisk.push({
          userId: r.user_id,
          name: r.name || 'Unknown',
          email: r.email || '',
          reason: 'inactive',
          daysInactive,
          lastActive: lastActive ? lastActive.toISOString().split('T')[0] : 'Never',
          details: lastActive ? `Last active ${daysInactive} days ago` : 'Never active'
        });
      }
    }
    
    res.json({ atRisk });
  } catch (error) {
    console.error("Error fetching at-risk learners:", error);
    res.status(500).json({ error: "Failed to fetch at-risk learners" });
  }
});

// 5. Quiz Analytics
learnerAnalyticsRouter.get("/:orgId/quiz-analytics", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const filters = parseReportFilters(req.query);
    
    console.log(`[QuizAnalytics] Fetching for org ${orgId} with filters:`, filters);
    
    // ALWAYS use fallback join path to include quiz results linked via collections:
    // Primary: qgr.courseId/lessonId directly
    // Fallback: qgr.collectionId → lessonQuizLinks.quizId → lessonQuizLinks.lessonId → courseLessons.lessonId → courseLessons.courseId
    const passRateResult = await db.execute(sql`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN qgr."player1TotalAnswers" > 0 
         AND (qgr."player1CorrectAnswers"::numeric / qgr."player1TotalAnswers") * 100 >= 70 
         THEN 1 END) as passed,
        COUNT(DISTINCT qgr."player1Id") as unique_quizzers
      FROM "quizGameResults" qgr
      JOIN "userOrganizationRoles" uor ON qgr."player1Id" = uor."userId"
      ${filters.unitId || filters.subUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = uor."userId" AND uoa."organizationId" = uor."organizationId"` : sql``}
      LEFT JOIN "lessonQuizLinks" lql ON lql."quizId" = qgr."collectionId"
      LEFT JOIN "courseLessons" cl ON cl."lessonId" = COALESCE(qgr."lessonId", lql."lessonId")
      LEFT JOIN courses c ON c.id = COALESCE(qgr."courseId", cl."courseId")
      WHERE uor."organizationId" = ${orgId}
      AND uor.role IN ('learner', 'student', 'employee')
      ${filters.courseId ? sql`AND COALESCE(qgr."courseId", cl."courseId") = ${filters.courseId}` : sql``}
      ${filters.unitId ? sql`AND uoa."unitId" = ${filters.unitId}` : sql``}
      ${filters.subUnitId ? sql`AND uoa."subUnitId" = ${filters.subUnitId}` : sql``}
      ${filters.teamId ? sql`AND uoa."teamId" = ${filters.teamId}` : sql``}
      ${filters.courseStatus ? sql`AND c.status = ${filters.courseStatus}` : sql``}
      ${filters.startDate ? sql`AND qgr."createdAt" >= ${filters.startDate.toISOString()}` : sql``}
      ${filters.endDate ? sql`AND qgr."createdAt" <= ${filters.endDate.toISOString()}` : sql``}
      ${filters.search ? sql`AND (c.title ILIKE ${'%' + filters.search + '%'} OR qgr."collectionId"::text ILIKE ${'%' + filters.search + '%'})` : sql``}
    `);
    
    const total = Number((passRateResult.rows[0] as any)?.total || 0);
    const passed = Number((passRateResult.rows[0] as any)?.passed || 0);
    const uniqueQuizzers = Number((passRateResult.rows[0] as any)?.unique_quizzers || 0);
    
    // Calculate real average attempts to pass (for learners who passed at least once)
    const avgAttemptsResult = await db.execute(sql`
      WITH first_pass AS (
        SELECT 
          qgr."player1Id",
          qgr."collectionId",
          MIN(qgr."createdAt") as first_pass_date
        FROM "quizGameResults" qgr
        JOIN "userOrganizationRoles" uor ON qgr."player1Id" = uor."userId"
        ${filters.unitId || filters.subUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = uor."userId" AND uoa."organizationId" = uor."organizationId"` : sql``}
        LEFT JOIN "lessonQuizLinks" lql ON lql."quizId" = qgr."collectionId"
        LEFT JOIN "courseLessons" cl ON cl."lessonId" = COALESCE(qgr."lessonId", lql."lessonId")
        LEFT JOIN courses c ON c.id = COALESCE(qgr."courseId", cl."courseId")
        WHERE uor."organizationId" = ${orgId}
        AND uor.role IN ('learner', 'student', 'employee')
        AND qgr."player1TotalAnswers" > 0
        AND (qgr."player1CorrectAnswers"::numeric / qgr."player1TotalAnswers") * 100 >= 70
        ${filters.courseId ? sql`AND COALESCE(qgr."courseId", cl."courseId") = ${filters.courseId}` : sql``}
        ${filters.unitId ? sql`AND uoa."unitId" = ${filters.unitId}` : sql``}
      ${filters.subUnitId ? sql`AND uoa."subUnitId" = ${filters.subUnitId}` : sql``}
        ${filters.teamId ? sql`AND uoa."teamId" = ${filters.teamId}` : sql``}
        ${filters.courseStatus ? sql`AND c.status = ${filters.courseStatus}` : sql``}
        ${filters.startDate ? sql`AND qgr."createdAt" >= ${filters.startDate.toISOString()}` : sql``}
        ${filters.endDate ? sql`AND qgr."createdAt" <= ${filters.endDate.toISOString()}` : sql``}
        ${filters.search ? sql`AND (c.title ILIKE ${'%' + filters.search + '%'} OR qgr."collectionId"::text ILIKE ${'%' + filters.search + '%'})` : sql``}
        GROUP BY qgr."player1Id", qgr."collectionId"
      ),
      attempts_before_pass AS (
        SELECT 
          fp."player1Id",
          fp."collectionId",
          COUNT(qgr.id) as attempts
        FROM first_pass fp
        JOIN "quizGameResults" qgr ON qgr."player1Id" = fp."player1Id" 
          AND qgr."collectionId" = fp."collectionId"
          AND qgr."createdAt" <= fp.first_pass_date
        GROUP BY fp."player1Id", fp."collectionId"
      )
      SELECT AVG(attempts) as avg_attempts FROM attempts_before_pass
    `);
    
    const avgAttemptsToPass = Number((avgAttemptsResult.rows[0] as any)?.avg_attempts || 1);
    
    // Score distribution
    const distributionResult = await db.execute(sql`
      SELECT 
        CASE 
          WHEN (qgr."player1CorrectAnswers"::numeric / NULLIF(qgr."player1TotalAnswers", 0)) * 100 >= 81 THEN '81-100'
          WHEN (qgr."player1CorrectAnswers"::numeric / NULLIF(qgr."player1TotalAnswers", 0)) * 100 >= 61 THEN '61-80'
          WHEN (qgr."player1CorrectAnswers"::numeric / NULLIF(qgr."player1TotalAnswers", 0)) * 100 >= 41 THEN '41-60'
          WHEN (qgr."player1CorrectAnswers"::numeric / NULLIF(qgr."player1TotalAnswers", 0)) * 100 >= 21 THEN '21-40'
          ELSE '0-20'
        END as range,
        COUNT(*) as count
      FROM "quizGameResults" qgr
      JOIN "userOrganizationRoles" uor ON qgr."player1Id" = uor."userId"
      ${filters.unitId || filters.subUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = uor."userId" AND uoa."organizationId" = uor."organizationId"` : sql``}
      LEFT JOIN "lessonQuizLinks" lql ON lql."quizId" = qgr."collectionId"
      LEFT JOIN "courseLessons" cl ON cl."lessonId" = COALESCE(qgr."lessonId", lql."lessonId")
      LEFT JOIN courses c ON c.id = COALESCE(qgr."courseId", cl."courseId")
      WHERE uor."organizationId" = ${orgId}
      AND uor.role IN ('learner', 'student', 'employee')
      ${filters.courseId ? sql`AND COALESCE(qgr."courseId", cl."courseId") = ${filters.courseId}` : sql``}
      ${filters.unitId ? sql`AND uoa."unitId" = ${filters.unitId}` : sql``}
      ${filters.subUnitId ? sql`AND uoa."subUnitId" = ${filters.subUnitId}` : sql``}
      ${filters.teamId ? sql`AND uoa."teamId" = ${filters.teamId}` : sql``}
      ${filters.courseStatus ? sql`AND c.status = ${filters.courseStatus}` : sql``}
      ${filters.startDate ? sql`AND qgr."createdAt" >= ${filters.startDate.toISOString()}` : sql``}
      ${filters.endDate ? sql`AND qgr."createdAt" <= ${filters.endDate.toISOString()}` : sql``}
      ${filters.search ? sql`AND (c.title ILIKE ${'%' + filters.search + '%'} OR qgr."collectionId"::text ILIKE ${'%' + filters.search + '%'})` : sql``}
      GROUP BY range
      ORDER BY range
    `);
    
    // Lesson difficulty analysis - lessons ranked by quiz pass rate (hardest first)
    const lessonDifficultyResult = await db.execute(sql`
      SELECT 
        COALESCE(l.id::text, 'standalone') as lesson_id,
        COALESCE(l.title, qc.name, 'Standalone Quiz') as lesson_name,
        COALESCE(c.title, 'No Course') as course_name,
        c.id as course_id,
        COUNT(*) as attempts,
        COUNT(CASE WHEN qgr."player1TotalAnswers" > 0 
         AND (qgr."player1CorrectAnswers"::numeric / qgr."player1TotalAnswers") * 100 >= 70 
         THEN 1 END) as passed,
        CASE WHEN COUNT(*) > 0 THEN 
          (COUNT(CASE WHEN qgr."player1TotalAnswers" > 0 
           AND (qgr."player1CorrectAnswers"::numeric / qgr."player1TotalAnswers") * 100 >= 70 
           THEN 1 END)::numeric / COUNT(*)) * 100 
        ELSE 0 END as pass_rate
      FROM "quizGameResults" qgr
      JOIN "userOrganizationRoles" uor ON qgr."player1Id" = uor."userId"
      LEFT JOIN "quizCollections" qc ON qc.id = qgr."collectionId"
      ${filters.unitId || filters.subUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = uor."userId" AND uoa."organizationId" = uor."organizationId"` : sql``}
      LEFT JOIN "lessonQuizLinks" lql ON lql."quizId" = qgr."collectionId"
      LEFT JOIN "courseLessons" cl ON cl."lessonId" = COALESCE(qgr."lessonId", lql."lessonId")
      LEFT JOIN lessons l ON l.id = COALESCE(qgr."lessonId", lql."lessonId")
      LEFT JOIN courses c ON c.id = COALESCE(qgr."courseId", cl."courseId")
      WHERE uor."organizationId" = ${orgId}
      AND uor.role IN ('learner', 'student', 'employee')
      ${filters.courseId ? sql`AND COALESCE(qgr."courseId", cl."courseId") = ${filters.courseId}` : sql``}
      ${filters.unitId ? sql`AND uoa."unitId" = ${filters.unitId}` : sql``}
      ${filters.subUnitId ? sql`AND uoa."subUnitId" = ${filters.subUnitId}` : sql``}
      ${filters.teamId ? sql`AND uoa."teamId" = ${filters.teamId}` : sql``}
      ${filters.courseStatus ? sql`AND (c.status = ${filters.courseStatus} OR c.id IS NULL)` : sql``}
      ${filters.startDate ? sql`AND qgr."createdAt" >= ${filters.startDate.toISOString()}` : sql``}
      ${filters.endDate ? sql`AND qgr."createdAt" <= ${filters.endDate.toISOString()}` : sql``}
      ${filters.search ? sql`AND (COALESCE(l.title, qc.name, 'Standalone Quiz') ILIKE ${'%' + filters.search + '%'} OR COALESCE(c.title, 'No Course') ILIKE ${'%' + filters.search + '%'})` : sql``}
      GROUP BY COALESCE(l.id::text, 'standalone'), COALESCE(l.title, qc.name, 'Standalone Quiz'), c.title, c.id
      HAVING COUNT(*) >= 1
      ORDER BY pass_rate ASC
      LIMIT 20
    `);
    
    console.log(`[QuizAnalytics] Results: total=${total}, passed=${passed}, uniqueQuizzers=${uniqueQuizzers}, avgAttempts=${avgAttemptsToPass}, lessons=${lessonDifficultyResult.rows.length}`);
    
    res.json({
      overallPassRate: total > 0 ? (passed / total) * 100 : 0,
      avgAttemptsToPass: Math.round(avgAttemptsToPass * 10) / 10,
      totalAttempts: total,
      totalUniqueQuizzers: uniqueQuizzers,
      scoreDistribution: (distributionResult.rows as any[]).map((r: any) => ({
        range: r.range,
        count: Number(r.count)
      })),
      lessonDifficulty: (lessonDifficultyResult.rows as any[]).map((r: any) => ({
        lessonId: r.lesson_id,
        lessonName: r.lesson_name,
        courseName: r.course_name || 'No Course',
        courseId: r.course_id || null,
        attempts: Number(r.attempts || 0),
        passed: Number(r.passed || 0),
        passRate: Number(r.pass_rate || 0)
      }))
    });
  } catch (error) {
    console.error("Error fetching quiz analytics:", error);
    res.status(500).json({ error: "Failed to fetch quiz analytics" });
  }
});

// 6. Deadlines
learnerAnalyticsRouter.get("/:orgId/deadlines", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const filters = parseReportFilters(req.query);
    
    const overdueResult = await db.execute(sql`
      WITH effective_assignments AS (
        -- Direct user assignments
        SELECT ca."courseId", ca."dueDate", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, ca."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        WHERE ca."userId" IS NOT NULL AND ca."organizationId" = ${orgId}
        
        UNION
        
        -- Users in assigned units
        SELECT ca."courseId", ca."dueDate", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."unitId" = ca."unitId" 
          AND uoa."organizationId" = ca."organizationId"
        WHERE ca."unitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
        
        UNION
        
        -- Users in assigned subUnits
        SELECT ca."courseId", ca."dueDate", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."subUnitId" = ca."subUnitId"
          AND uoa."organizationId" = ca."organizationId"
        WHERE ca."subUnitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
        
        UNION
        
        -- Users in assigned teams
        SELECT ca."courseId", ca."dueDate", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."teamId" = ca."teamId"
          AND uoa."organizationId" = ca."organizationId"
        WHERE ca."teamId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
      )
      SELECT DISTINCT
        ea.user_id,
        COALESCE(u."gamerName", u."firstName" || ' ' || u."lastName", 'Unknown') as user_name,
        ea."courseId" as course_id,
        c.title as course_name,
        ea."dueDate" as due_date,
        EXTRACT(DAY FROM NOW() - ea."dueDate") as days_overdue
      FROM effective_assignments ea
      JOIN users u ON u.id = ea.user_id
      JOIN courses c ON c.id = ea."courseId"
      LEFT JOIN "courseProgress" cp ON cp."userId" = ea.user_id AND cp."courseId" = ea."courseId"
      ${filters.unitId || filters.subUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa_filter ON uoa_filter."userId" = ea.user_id AND uoa_filter."organizationId" = ea."organizationId"` : sql``}
      WHERE ea."dueDate" < NOW()
      AND (cp.status IS NULL OR cp.status != 'completed')
      ${filters.courseId ? sql`AND ea."courseId" = ${filters.courseId}` : sql``}
      ${filters.unitId ? sql`AND uoa_filter."unitId" = ${filters.unitId}` : sql``}
      ${filters.subUnitId ? sql`AND uoa_filter."subUnitId" = ${filters.subUnitId}` : sql``}
      ${filters.teamId ? sql`AND uoa_filter."teamId" = ${filters.teamId}` : sql``}
      ${filters.courseStatus ? sql`AND c.status = ${filters.courseStatus}` : sql``}
      ${filters.startDate ? sql`AND ea.assigned_on >= ${filters.startDate.toISOString()}` : sql``}
      ${filters.endDate ? sql`AND ea.assigned_on <= ${filters.endDate.toISOString()}` : sql``}
      ${filters.search ? sql`AND (u."gamerName" ILIKE ${'%' + filters.search + '%'} OR u."firstName" ILIKE ${'%' + filters.search + '%'} OR u."lastName" ILIKE ${'%' + filters.search + '%'} OR c.title ILIKE ${'%' + filters.search + '%'})` : sql``}
      ORDER BY ea."dueDate" ASC
      LIMIT 50
    `);
    
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    
    const upcomingResult = await db.execute(sql`
      WITH effective_assignments AS (
        -- Direct user assignments
        SELECT ca."courseId", ca."dueDate", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, ca."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        WHERE ca."userId" IS NOT NULL AND ca."organizationId" = ${orgId}
        
        UNION
        
        -- Users in assigned units
        SELECT ca."courseId", ca."dueDate", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."unitId" = ca."unitId" 
          AND uoa."organizationId" = ca."organizationId"
        WHERE ca."unitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
        
        UNION
        
        -- Users in assigned subUnits
        SELECT ca."courseId", ca."dueDate", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."subUnitId" = ca."subUnitId"
          AND uoa."organizationId" = ca."organizationId"
        WHERE ca."subUnitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
        
        UNION
        
        -- Users in assigned teams
        SELECT ca."courseId", ca."dueDate", COALESCE(ca."assignedAt", ca."createdAt") as assigned_on, uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."teamId" = ca."teamId"
          AND uoa."organizationId" = ca."organizationId"
        WHERE ca."teamId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
      )
      SELECT DISTINCT
        ea.user_id,
        COALESCE(u."gamerName", u."firstName" || ' ' || u."lastName", 'Unknown') as user_name,
        ea."courseId" as course_id,
        c.title as course_name,
        ea."dueDate" as due_date,
        EXTRACT(DAY FROM ea."dueDate" - NOW()) as days_remaining
      FROM effective_assignments ea
      JOIN users u ON u.id = ea.user_id
      JOIN courses c ON c.id = ea."courseId"
      LEFT JOIN "courseProgress" cp ON cp."userId" = ea.user_id AND cp."courseId" = ea."courseId"
      ${filters.unitId || filters.subUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa_filter ON uoa_filter."userId" = ea.user_id AND uoa_filter."organizationId" = ea."organizationId"` : sql``}
      WHERE ea."dueDate" >= NOW()
      AND ea."dueDate" <= ${sevenDaysFromNow.toISOString()}
      AND (cp.status IS NULL OR cp.status != 'completed')
      ${filters.courseId ? sql`AND ea."courseId" = ${filters.courseId}` : sql``}
      ${filters.unitId ? sql`AND uoa_filter."unitId" = ${filters.unitId}` : sql``}
      ${filters.subUnitId ? sql`AND uoa_filter."subUnitId" = ${filters.subUnitId}` : sql``}
      ${filters.teamId ? sql`AND uoa_filter."teamId" = ${filters.teamId}` : sql``}
      ${filters.courseStatus ? sql`AND c.status = ${filters.courseStatus}` : sql``}
      ${filters.startDate ? sql`AND ea.assigned_on >= ${filters.startDate.toISOString()}` : sql``}
      ${filters.endDate ? sql`AND ea.assigned_on <= ${filters.endDate.toISOString()}` : sql``}
      ${filters.search ? sql`AND (u."gamerName" ILIKE ${'%' + filters.search + '%'} OR u."firstName" ILIKE ${'%' + filters.search + '%'} OR u."lastName" ILIKE ${'%' + filters.search + '%'} OR c.title ILIKE ${'%' + filters.search + '%'})` : sql``}
      ORDER BY ea."dueDate" ASC
      LIMIT 50
    `);
    
    res.json({
      overdue: (overdueResult.rows as any[]).map((r: any) => ({
        userId: r.user_id,
        userName: r.user_name || 'Unknown',
        courseId: r.course_id,
        courseName: r.course_name,
        dueDate: r.due_date,
        daysOverdue: Math.max(1, Math.floor(Number(r.days_overdue) || 1))
      })),
      upcoming: (upcomingResult.rows as any[]).map((r: any) => ({
        userId: r.user_id,
        userName: r.user_name || 'Unknown',
        courseId: r.course_id,
        courseName: r.course_name,
        dueDate: r.due_date,
        daysRemaining: Math.max(0, Math.floor(Number(r.days_remaining) || 0))
      }))
    });
  } catch (error) {
    console.error("Error fetching deadlines:", error);
    res.status(500).json({ error: "Failed to fetch deadlines" });
  }
});

// 6b. Send Deadline Reminder Emails
learnerAnalyticsRouter.post("/:orgId/deadlines/email", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const { type, recipients, courseId } = req.body;
    const sessionUser = (req as any).session?.user;
    
    // RBAC check: Only allow teacher, instructor, org_admin roles
    const allowedRoles = ['teacher', 'instructor', 'org_admin', 'super_admin'];
    const userRoles = await db.execute(sql`
      SELECT role FROM "userOrganizationRoles" 
      WHERE "userId" = ${sessionUser?.id} AND "organizationId" = ${orgId}
    `);
    
    const hasPermission = sessionUser?.isSuperAdmin || 
      (userRoles.rows as any[]).some(r => allowedRoles.includes(r.role));
    
    if (!hasPermission) {
      return res.status(403).json({ error: "Access denied. Only teachers and admins can send deadline reminder emails." });
    }

    // Validate request body
    if (!type || !['overdue', 'upcoming'].includes(type)) {
      return res.status(400).json({ error: "Invalid type. Must be 'overdue' or 'upcoming'" });
    }

    if (!recipients || (Array.isArray(recipients) && recipients.length === 0)) {
      return res.status(400).json({ error: "Recipients are required" });
    }

    // Get sender name for email from-name
    const senderResult = await db.execute(sql`
      SELECT COALESCE("gamerName", "firstName" || ' ' || "lastName", email) as name
      FROM users WHERE id = ${sessionUser?.id}
    `);
    const senderName = (senderResult.rows[0] as any)?.name || 'Your Instructor';

    // Fetch deadline data based on type using effective_assignments CTE
    // This handles all assignment scopes: direct user, department, unit, and team
    let deadlineData: any[] = [];
    
    if (type === 'overdue') {
      const result = await db.execute(sql`
        WITH effective_assignments AS (
          -- Direct user assignments
          SELECT ca."courseId", ca."dueDate", ca."userId" as user_id, ca."organizationId"
          FROM "courseAssignments" ca
          WHERE ca."userId" IS NOT NULL AND ca."organizationId" = ${orgId}
          
          UNION
          
          -- Users in assigned departments (unitId)
          SELECT ca."courseId", ca."dueDate", uoa."userId" as user_id, ca."organizationId"
          FROM "courseAssignments" ca
          JOIN "userOrganizationAssignments" uoa ON uoa."unitId" = ca."unitId" 
            AND uoa."organizationId" = ca."organizationId"
          WHERE ca."unitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
          
          UNION
          
          -- Users in assigned units (subUnitId)
          SELECT ca."courseId", ca."dueDate", uoa."userId" as user_id, ca."organizationId"
          FROM "courseAssignments" ca
          JOIN "userOrganizationAssignments" uoa ON uoa."subUnitId" = ca."subUnitId"
            AND uoa."organizationId" = ca."organizationId"
          WHERE ca."subUnitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
          
          UNION
          
          -- Users in assigned teams
          SELECT ca."courseId", ca."dueDate", uoa."userId" as user_id, ca."organizationId"
          FROM "courseAssignments" ca
          JOIN "userOrganizationAssignments" uoa ON uoa."teamId" = ca."teamId"
            AND uoa."organizationId" = ca."organizationId"
          WHERE ca."teamId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
        )
        SELECT DISTINCT
          u.id as user_id,
          u.email,
          COALESCE(u."gamerName", u."firstName" || ' ' || u."lastName", 'Learner') as user_name,
          c.id as course_id,
          c.title as course_name,
          ea."dueDate" as due_date,
          EXTRACT(DAY FROM NOW() - ea."dueDate") as days_overdue
        FROM effective_assignments ea
        JOIN users u ON u.id = ea.user_id
        JOIN courses c ON c.id = ea."courseId"
        LEFT JOIN "courseProgress" cp ON cp."userId" = ea.user_id AND cp."courseId" = ea."courseId"
        WHERE ea."dueDate" < NOW()
        AND (cp.status IS NULL OR cp.status != 'completed')
        ${courseId ? sql`AND ea."courseId" = ${courseId}` : sql``}
        ORDER BY days_overdue DESC
      `);
      deadlineData = result.rows as any[];
    } else {
      const result = await db.execute(sql`
        WITH effective_assignments AS (
          -- Direct user assignments
          SELECT ca."courseId", ca."dueDate", ca."userId" as user_id, ca."organizationId"
          FROM "courseAssignments" ca
          WHERE ca."userId" IS NOT NULL AND ca."organizationId" = ${orgId}
          
          UNION
          
          -- Users in assigned departments (unitId)
          SELECT ca."courseId", ca."dueDate", uoa."userId" as user_id, ca."organizationId"
          FROM "courseAssignments" ca
          JOIN "userOrganizationAssignments" uoa ON uoa."unitId" = ca."unitId" 
            AND uoa."organizationId" = ca."organizationId"
          WHERE ca."unitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
          
          UNION
          
          -- Users in assigned units (subUnitId)
          SELECT ca."courseId", ca."dueDate", uoa."userId" as user_id, ca."organizationId"
          FROM "courseAssignments" ca
          JOIN "userOrganizationAssignments" uoa ON uoa."subUnitId" = ca."subUnitId"
            AND uoa."organizationId" = ca."organizationId"
          WHERE ca."subUnitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
          
          UNION
          
          -- Users in assigned teams
          SELECT ca."courseId", ca."dueDate", uoa."userId" as user_id, ca."organizationId"
          FROM "courseAssignments" ca
          JOIN "userOrganizationAssignments" uoa ON uoa."teamId" = ca."teamId"
            AND uoa."organizationId" = ca."organizationId"
          WHERE ca."teamId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
        )
        SELECT DISTINCT
          u.id as user_id,
          u.email,
          COALESCE(u."gamerName", u."firstName" || ' ' || u."lastName", 'Learner') as user_name,
          c.id as course_id,
          c.title as course_name,
          ea."dueDate" as due_date,
          EXTRACT(DAY FROM ea."dueDate" - NOW()) as days_remaining
        FROM effective_assignments ea
        JOIN users u ON u.id = ea.user_id
        JOIN courses c ON c.id = ea."courseId"
        LEFT JOIN "courseProgress" cp ON cp."userId" = ea.user_id AND cp."courseId" = ea."courseId"
        WHERE ea."dueDate"::date >= CURRENT_DATE
        AND ea."dueDate"::date <= CURRENT_DATE + INTERVAL '7 days'
        AND (cp.status IS NULL OR cp.status != 'completed')
        ${courseId ? sql`AND ea."courseId" = ${courseId}` : sql``}
        ORDER BY days_remaining ASC
      `);
      deadlineData = result.rows as any[];
    }

    // Filter by recipients if not 'all'
    if (recipients !== 'all' && Array.isArray(recipients)) {
      deadlineData = deadlineData.filter((d: any) => recipients.includes(d.user_id));
    }

    if (deadlineData.length === 0) {
      console.log(`[Deadline Emails] No matching recipients found for org ${orgId}, type=${type}, courseId=${courseId || 'all'}`);
      return res.json({ 
        success: true, 
        sent: 0, 
        failed: 0, 
        message: `No learners found with ${type === 'overdue' ? 'overdue' : 'upcoming'} deadlines matching your filters` 
      });
    }

    // Import MailerSend service dynamically to avoid circular dependencies
    const { MailerSendService } = await import('../services/mailerSendService');

    // Send emails to each recipient
    let sentCount = 0;
    let failedCount = 0;

    for (const recipient of deadlineData) {
      try {
        const result = await MailerSendService.sendDeadlineReminderEmail({
          recipientEmail: recipient.email,
          recipientName: recipient.user_name,
          courseName: recipient.course_name,
          dueDate: new Date(recipient.due_date),
          type,
          daysOverdue: type === 'overdue' ? Math.floor(Number(recipient.days_overdue) || 0) : undefined,
          daysRemaining: type === 'upcoming' ? Math.floor(Number(recipient.days_remaining) || 0) : undefined,
          organizationId: orgId,
          senderName,
        });

        if (result.success) {
          sentCount++;
        } else {
          failedCount++;
          console.error(`Failed to send email to ${recipient.email}: ${result.error}`);
        }
      } catch (emailError) {
        failedCount++;
        console.error(`Exception sending email to ${recipient.email}:`, emailError);
      }
    }

    console.log(`[Deadline Emails] Sent ${sentCount}, Failed ${failedCount} for org ${orgId}`);

    res.json({
      success: failedCount === 0,
      sent: sentCount,
      failed: failedCount,
      message: failedCount === 0 
        ? `Successfully sent ${sentCount} reminder email${sentCount !== 1 ? 's' : ''}` 
        : `Sent ${sentCount} emails, ${failedCount} failed`
    });
  } catch (error) {
    console.error("Error sending deadline emails:", error);
    res.status(500).json({ error: "Failed to send deadline emails" });
  }
});

// 7. Learner Profile
learnerAnalyticsRouter.get("/:orgId/learner/:userId/profile", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const { orgId, userId } = req.params;
    const filters = parseReportFilters(req.query);
    
    const userResult = await db.execute(sql`
      SELECT u.id, COALESCE(u."gamerName", u."firstName" || ' ' || u."lastName", 'Unknown') as name, u.email 
      FROM users u
      JOIN "userOrganizationRoles" uor ON uor."userId" = u.id
      WHERE u.id = ${userId} AND uor."organizationId" = ${orgId}
    `);
    
    if (!userResult.rows.length) {
      return res.status(404).json({ error: "Learner not found" });
    }
    
    const coursesResult = await db.execute(sql`
      WITH effective_assignments AS (
        SELECT ca."courseId", ca."dueDate", ca."assignedAt", ca."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        WHERE ca."userId" IS NOT NULL AND ca."organizationId" = ${orgId}
        UNION
        SELECT ca."courseId", ca."dueDate", ca."assignedAt", uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."unitId" = ca."unitId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."unitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
        UNION
        SELECT ca."courseId", ca."dueDate", ca."assignedAt", uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."subUnitId" = ca."subUnitId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."subUnitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
        UNION
        SELECT ca."courseId", ca."dueDate", ca."assignedAt", uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."teamId" = ca."teamId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."teamId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
      )
      SELECT 
        c.id as course_id,
        c.title as name,
        COALESCE(cp."percentComplete", 0) as progress,
        COALESCE(cp.status, 'not_started') as status,
        ea."dueDate" as due_date
      FROM effective_assignments ea
      JOIN courses c ON c.id = ea."courseId"
      LEFT JOIN "courseProgress" cp ON cp."userId" = ea.user_id AND cp."courseId" = ea."courseId" AND cp."organizationId" = ea."organizationId"
      WHERE ea.user_id = ${userId}
      ${filters.courseId ? sql`AND ea."courseId" = ${filters.courseId}` : sql``}
      ORDER BY ea."assignedAt" DESC
    `);
    
    const quizResult = await db.execute(sql`
      SELECT 
        qgr."collectionId" as quiz_id,
        qc.name as quiz_name,
        CASE WHEN qgr."player1TotalAnswers" > 0 
          THEN (qgr."player1CorrectAnswers"::numeric / qgr."player1TotalAnswers") * 100 
          ELSE 0 END as score,
        CASE WHEN qgr."player1TotalAnswers" > 0 
          AND (qgr."player1CorrectAnswers"::numeric / qgr."player1TotalAnswers") * 100 >= 70 
          THEN true ELSE false END as passed,
        qgr."createdAt" as date
      FROM "quizGameResults" qgr
      JOIN "quizCollections" qc ON qc.id = qgr."collectionId"
      JOIN "userOrganizationRoles" uor ON uor."userId" = qgr."player1Id" AND uor."organizationId" = ${orgId}
      ${filters.courseId ? sql`LEFT JOIN "lessonQuizLinks" lql ON lql."quizId" = qgr."collectionId"` : sql``}
      ${filters.courseId ? sql`LEFT JOIN "courseLessons" cl ON cl."lessonId" = COALESCE(qgr."lessonId", lql."lessonId")` : sql``}
      WHERE qgr."player1Id" = ${userId}
      ${filters.courseId ? sql`AND COALESCE(qgr."courseId", cl."courseId") = ${filters.courseId}` : sql``}
      ORDER BY qgr."createdAt" DESC
      LIMIT 20
    `);
    
    // Fetch real certificates for this learner
    const certificatesResult = await db.execute(sql`
      SELECT 
        cert.id,
        cert."certificateType" as type,
        COALESCE(cert."courseTitle", 'Certificate') as title,
        cert."completedAt" as earned_at,
        cert."pdfStoragePath" as pdf_path
      FROM certificates cert
      WHERE cert."userId" = ${userId}
      AND cert."organizationId" = ${orgId}
      AND cert."certificateType" = 'course'
      ORDER BY cert."completedAt" DESC
      LIMIT 20
    `);
    
    res.json({
      user: userResult.rows[0],
      courses: (coursesResult.rows as any[]).map((r: any) => ({
        courseId: r.course_id,
        name: r.name,
        progress: Number(r.progress || 0),
        status: r.status || 'not_started',
        dueDate: r.due_date
      })),
      quizHistory: (quizResult.rows as any[]).map((r: any) => ({
        quizId: r.quiz_id,
        quizName: r.quiz_name,
        score: Number(r.score || 0),
        passed: r.passed,
        date: r.date
      })),
      certificates: (certificatesResult.rows as any[]).map((r: any) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        earnedAt: r.earned_at,
        pdfPath: r.pdf_path
      }))
    });
  } catch (error) {
    console.error("Error fetching learner profile:", error);
    res.status(500).json({ error: "Failed to fetch learner profile" });
  }
});

// Funnel Stage Details
learnerAnalyticsRouter.get("/:orgId/funnel-details/:stage", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const { orgId, stage } = req.params;
    const filters = parseReportFilters(req.query);
    const validStages = ['enrolled', 'started', 'in_progress', 'completed'];
    
    if (!validStages.includes(stage)) {
      return res.status(400).json({ error: "Invalid stage. Must be one of: enrolled, started, in_progress, completed" });
    }

    let result;
    
    if (stage === 'enrolled') {
      result = await db.execute(sql`
        WITH effective_assignments AS (
          SELECT ca."courseId", ca."dueDate", ca."assignedAt", ca."userId" as user_id, ca."organizationId"
          FROM "courseAssignments" ca
          WHERE ca."userId" IS NOT NULL AND ca."organizationId" = ${orgId}
          UNION
          SELECT ca."courseId", ca."dueDate", ca."assignedAt", uoa."userId" as user_id, ca."organizationId"
          FROM "courseAssignments" ca
          JOIN "userOrganizationAssignments" uoa ON uoa."unitId" = ca."unitId" AND uoa."organizationId" = ca."organizationId"
          WHERE ca."unitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
          UNION
          SELECT ca."courseId", ca."dueDate", ca."assignedAt", uoa."userId" as user_id, ca."organizationId"
          FROM "courseAssignments" ca
          JOIN "userOrganizationAssignments" uoa ON uoa."subUnitId" = ca."subUnitId" AND uoa."organizationId" = ca."organizationId"
          WHERE ca."subUnitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
          UNION
          SELECT ca."courseId", ca."dueDate", ca."assignedAt", uoa."userId" as user_id, ca."organizationId"
          FROM "courseAssignments" ca
          JOIN "userOrganizationAssignments" uoa ON uoa."teamId" = ca."teamId" AND uoa."organizationId" = ca."organizationId"
          WHERE ca."teamId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
        )
        SELECT 
          u.id as user_id,
          COALESCE(u."gamerName", u."firstName" || ' ' || u."lastName", 'Unknown') as name,
          u.email,
          c.id as course_id,
          c.title as course_name,
          ea."assignedAt" as enrolled_date,
          COALESCE(cp.status, 'not_started') as status,
          COALESCE(cp."percentComplete", 0) as progress
        FROM effective_assignments ea
        JOIN users u ON u.id = ea.user_id
        JOIN "userOrganizationRoles" uor ON uor."userId" = ea.user_id AND uor."organizationId" = ea."organizationId"
        JOIN courses c ON c.id = ea."courseId"
        LEFT JOIN "courseProgress" cp ON cp."userId" = ea.user_id AND cp."courseId" = ea."courseId" AND cp."organizationId" = ea."organizationId"
        ${filters.unitId || filters.subUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = ea.user_id AND uoa."organizationId" = ea."organizationId"` : sql``}
        WHERE uor.role IN ('learner', 'student', 'employee')
        ${filters.courseId ? sql`AND ea."courseId" = ${filters.courseId}` : sql``}
        ${filters.unitId ? sql`AND uoa."unitId" = ${filters.unitId}` : sql``}
      ${filters.subUnitId ? sql`AND uoa."subUnitId" = ${filters.subUnitId}` : sql``}
        ${filters.teamId ? sql`AND uoa."teamId" = ${filters.teamId}` : sql``}
        ${filters.courseStatus ? sql`AND c.status = ${filters.courseStatus}` : sql``}
        ${filters.startDate ? sql`AND ea."assignedAt" >= ${filters.startDate.toISOString()}` : sql``}
        ${filters.endDate ? sql`AND ea."assignedAt" <= ${filters.endDate.toISOString()}` : sql``}
        ${filters.search ? sql`AND (u."gamerName" ILIKE ${'%' + filters.search + '%'} OR u."firstName" ILIKE ${'%' + filters.search + '%'} OR u."lastName" ILIKE ${'%' + filters.search + '%'} OR u.email ILIKE ${'%' + filters.search + '%'})` : sql``}
        ORDER BY ea."assignedAt" DESC
        LIMIT 100
      `);
    } else if (stage === 'started') {
      result = await db.execute(sql`
        SELECT 
          u.id as user_id,
          COALESCE(u."gamerName", u."firstName" || ' ' || u."lastName", 'Unknown') as name,
          u.email,
          c.id as course_id,
          c.title as course_name,
          cp."startedAt" as started_date,
          cp.status,
          COALESCE(cp."percentComplete", 0) as progress
        FROM "courseProgress" cp
        JOIN users u ON u.id = cp."userId"
        JOIN courses c ON c.id = cp."courseId"
        ${filters.unitId || filters.subUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = cp."userId" AND uoa."organizationId" = cp."organizationId"` : sql``}
        JOIN "userOrganizationRoles" uor ON uor."userId" = cp."userId" AND uor."organizationId" = cp."organizationId"
        WHERE cp."organizationId" = ${orgId}
        AND uor.role IN ('learner', 'student', 'employee')
        AND cp.status IN ('in_progress', 'completed')
        ${filters.courseId ? sql`AND cp."courseId" = ${filters.courseId}` : sql``}
        ${filters.unitId ? sql`AND uoa."unitId" = ${filters.unitId}` : sql``}
      ${filters.subUnitId ? sql`AND uoa."subUnitId" = ${filters.subUnitId}` : sql``}
        ${filters.teamId ? sql`AND uoa."teamId" = ${filters.teamId}` : sql``}
        ${filters.courseStatus ? sql`AND c.status = ${filters.courseStatus}` : sql``}
        ${filters.startDate ? sql`AND cp."startedAt" >= ${filters.startDate.toISOString()}` : sql``}
        ${filters.endDate ? sql`AND cp."startedAt" <= ${filters.endDate.toISOString()}` : sql``}
        ${filters.search ? sql`AND (u."gamerName" ILIKE ${'%' + filters.search + '%'} OR u."firstName" ILIKE ${'%' + filters.search + '%'} OR u."lastName" ILIKE ${'%' + filters.search + '%'} OR u.email ILIKE ${'%' + filters.search + '%'})` : sql``}
        ORDER BY cp."startedAt" DESC
        LIMIT 100
      `);
    } else if (stage === 'in_progress') {
      result = await db.execute(sql`
        SELECT 
          u.id as user_id,
          COALESCE(u."gamerName", u."firstName" || ' ' || u."lastName", 'Unknown') as name,
          u.email,
          c.id as course_id,
          c.title as course_name,
          cp."startedAt" as started_date,
          cp."lastAccessedAt" as last_activity,
          COALESCE(cp."percentComplete", 0) as progress
        FROM "courseProgress" cp
        JOIN users u ON u.id = cp."userId"
        JOIN courses c ON c.id = cp."courseId"
        ${filters.unitId || filters.subUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = cp."userId" AND uoa."organizationId" = cp."organizationId"` : sql``}
        JOIN "userOrganizationRoles" uor ON uor."userId" = cp."userId" AND uor."organizationId" = cp."organizationId"
        WHERE cp."organizationId" = ${orgId}
        AND uor.role IN ('learner', 'student', 'employee')
        AND cp.status = 'in_progress'
        ${filters.courseId ? sql`AND cp."courseId" = ${filters.courseId}` : sql``}
        ${filters.unitId ? sql`AND uoa."unitId" = ${filters.unitId}` : sql``}
      ${filters.subUnitId ? sql`AND uoa."subUnitId" = ${filters.subUnitId}` : sql``}
        ${filters.teamId ? sql`AND uoa."teamId" = ${filters.teamId}` : sql``}
        ${filters.courseStatus ? sql`AND c.status = ${filters.courseStatus}` : sql``}
        ${filters.startDate ? sql`AND cp."lastAccessedAt" >= ${filters.startDate.toISOString()}` : sql``}
        ${filters.endDate ? sql`AND cp."lastAccessedAt" <= ${filters.endDate.toISOString()}` : sql``}
        ${filters.search ? sql`AND (u."gamerName" ILIKE ${'%' + filters.search + '%'} OR u."firstName" ILIKE ${'%' + filters.search + '%'} OR u."lastName" ILIKE ${'%' + filters.search + '%'} OR u.email ILIKE ${'%' + filters.search + '%'})` : sql``}
        ORDER BY cp."lastAccessedAt" DESC
        LIMIT 100
      `);
    } else {
      result = await db.execute(sql`
        SELECT 
          u.id as user_id,
          COALESCE(u."gamerName", u."firstName" || ' ' || u."lastName", 'Unknown') as name,
          u.email,
          c.id as course_id,
          c.title as course_name,
          cp."completedAt" as completed_date,
          COALESCE(cp."percentComplete", 100) as progress
        FROM "courseProgress" cp
        JOIN users u ON u.id = cp."userId"
        JOIN courses c ON c.id = cp."courseId"
        ${filters.unitId || filters.subUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = cp."userId" AND uoa."organizationId" = cp."organizationId"` : sql``}
        JOIN "userOrganizationRoles" uor ON uor."userId" = cp."userId" AND uor."organizationId" = cp."organizationId"
        WHERE cp."organizationId" = ${orgId}
        AND uor.role IN ('learner', 'student', 'employee')
        AND cp.status = 'completed'
        ${filters.courseId ? sql`AND cp."courseId" = ${filters.courseId}` : sql``}
        ${filters.unitId ? sql`AND uoa."unitId" = ${filters.unitId}` : sql``}
      ${filters.subUnitId ? sql`AND uoa."subUnitId" = ${filters.subUnitId}` : sql``}
        ${filters.teamId ? sql`AND uoa."teamId" = ${filters.teamId}` : sql``}
        ${filters.courseStatus ? sql`AND c.status = ${filters.courseStatus}` : sql``}
        ${filters.startDate ? sql`AND cp."completedAt" >= ${filters.startDate.toISOString()}` : sql``}
        ${filters.endDate ? sql`AND cp."completedAt" <= ${filters.endDate.toISOString()}` : sql``}
        ${filters.search ? sql`AND (u."gamerName" ILIKE ${'%' + filters.search + '%'} OR u."firstName" ILIKE ${'%' + filters.search + '%'} OR u."lastName" ILIKE ${'%' + filters.search + '%'} OR u.email ILIKE ${'%' + filters.search + '%'})` : sql``}
        ORDER BY cp."completedAt" DESC
        LIMIT 100
      `);
    }

    res.json({
      stage,
      learners: (result.rows as any[]).map((r: any) => ({
        userId: r.user_id,
        name: r.name,
        email: r.email,
        courseId: r.course_id,
        courseName: r.course_name,
        enrolledDate: r.enrolled_date,
        startedDate: r.started_date,
        completedDate: r.completed_date,
        lastActivity: r.last_activity,
        status: r.status,
        progress: Number(r.progress || 0)
      }))
    });
  } catch (error) {
    console.error("Error fetching funnel details:", error);
    res.status(500).json({ error: "Failed to fetch funnel details" });
  }
});

// At-Risk Learners by Type
learnerAnalyticsRouter.get("/:orgId/at-risk-details/:type", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const { orgId, type } = req.params;
    const filters = parseReportFilters(req.query);
    const validTypes = ['overdue', 'low_scores', 'inactive', 'behind_schedule'];
    
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: "Invalid type. Must be one of: overdue, low_scores, inactive, behind_schedule" });
    }
    
    const effectiveType = type === 'behind_schedule' ? 'overdue' : type;

    const effectiveUnitId = filters.unitId || null;
    const effectiveSubUnitId = filters.subUnitId || null;
    const effectiveCourseId = filters.courseId || null;

    let result;
    
    if (effectiveType === 'overdue') {
      result = await db.execute(sql`
        WITH effective_assignments AS (
          SELECT ca."courseId", ca."dueDate", ca."assignedAt", ca."userId" as user_id, ca."organizationId"
          FROM "courseAssignments" ca
          WHERE ca."userId" IS NOT NULL AND ca."organizationId" = ${orgId}
          UNION
          SELECT ca."courseId", ca."dueDate", ca."assignedAt", uoa."userId" as user_id, ca."organizationId"
          FROM "courseAssignments" ca
          JOIN "userOrganizationAssignments" uoa ON uoa."unitId" = ca."unitId" AND uoa."organizationId" = ca."organizationId"
          WHERE ca."unitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
          UNION
          SELECT ca."courseId", ca."dueDate", ca."assignedAt", uoa."userId" as user_id, ca."organizationId"
          FROM "courseAssignments" ca
          JOIN "userOrganizationAssignments" uoa ON uoa."subUnitId" = ca."subUnitId" AND uoa."organizationId" = ca."organizationId"
          WHERE ca."subUnitId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
          UNION
          SELECT ca."courseId", ca."dueDate", ca."assignedAt", uoa."userId" as user_id, ca."organizationId"
          FROM "courseAssignments" ca
          JOIN "userOrganizationAssignments" uoa ON uoa."teamId" = ca."teamId" AND uoa."organizationId" = ca."organizationId"
          WHERE ca."teamId" IS NOT NULL AND ca."userId" IS NULL AND ca."organizationId" = ${orgId}
        )
        SELECT 
          u.id as user_id,
          COALESCE(u."gamerName", u."firstName" || ' ' || u."lastName", 'Unknown') as name,
          u.email,
          c.id as course_id,
          c.title as course_name,
          ea."dueDate" as due_date,
          EXTRACT(DAY FROM NOW() - ea."dueDate") as days_overdue,
          COALESCE(cp."percentComplete", 0) as progress
        FROM effective_assignments ea
        JOIN users u ON u.id = ea.user_id
        JOIN "userOrganizationRoles" uor ON uor."userId" = u.id AND uor."organizationId" = ea."organizationId"
        JOIN courses c ON c.id = ea."courseId"
        LEFT JOIN "courseProgress" cp ON cp."userId" = ea.user_id AND cp."courseId" = ea."courseId" AND cp."organizationId" = ea."organizationId"
        ${effectiveUnitId || effectiveSubUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = u.id AND uoa."organizationId" = ea."organizationId"` : sql``}
        WHERE ea."dueDate" < NOW() - INTERVAL '7 days'
        AND uor.role IN ('learner', 'student', 'employee')
        AND (cp.status IS NULL OR cp.status != 'completed')
        ${effectiveCourseId ? sql`AND ea."courseId" = ${effectiveCourseId}` : sql``}
        ${effectiveUnitId ? sql`AND uoa."unitId" = ${effectiveUnitId}` : sql``}
      ${effectiveSubUnitId ? sql`AND uoa."subUnitId" = ${effectiveSubUnitId}` : sql``}
        ${filters.teamId ? sql`AND uoa."teamId" = ${filters.teamId}` : sql``}
        ${filters.courseStatus ? sql`AND c.status = ${filters.courseStatus}` : sql``}
        ${filters.startDate ? sql`AND ea."assignedAt" >= ${filters.startDate.toISOString()}` : sql``}
        ${filters.endDate ? sql`AND ea."assignedAt" <= ${filters.endDate.toISOString()}` : sql``}
        ${filters.search ? sql`AND (u."gamerName" ILIKE ${'%' + filters.search + '%'} OR u."firstName" ILIKE ${'%' + filters.search + '%'} OR u."lastName" ILIKE ${'%' + filters.search + '%'} OR u.email ILIKE ${'%' + filters.search + '%'})` : sql``}
        ORDER BY days_overdue DESC
        LIMIT 100
      `);
      
      res.json({
        type,
        learners: (result.rows as any[]).map((r: any) => ({
          userId: r.user_id,
          name: r.name,
          email: r.email,
          courseId: r.course_id,
          courseName: r.course_name,
          dueDate: r.due_date,
          daysOverdue: Math.floor(Number(r.days_overdue || 0)),
          progress: Number(r.progress || 0),
          reason: `${Math.floor(Number(r.days_overdue || 0))} days overdue`
        }))
      });
    } else if (effectiveType === 'low_scores') {
      // Use fallback join path for low scores drilldown
      result = await db.execute(sql`
        SELECT 
          u.id as user_id,
          COALESCE(u."gamerName", u."firstName" || ' ' || u."lastName", 'Unknown') as name,
          u.email,
          COUNT(*) as total_attempts,
          AVG(CASE WHEN qgr."player1TotalAnswers" > 0 
            THEN (qgr."player1CorrectAnswers"::numeric / qgr."player1TotalAnswers") * 100 
            ELSE 0 END) as avg_score
        FROM users u
        JOIN "quizGameResults" qgr ON qgr."player1Id" = u.id
        JOIN "userOrganizationRoles" uor ON uor."userId" = u.id AND uor."organizationId" = ${orgId}
        ${effectiveUnitId || effectiveSubUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = u.id AND uoa."organizationId" = uor."organizationId"` : sql``}
        ${effectiveCourseId ? sql`LEFT JOIN "lessonQuizLinks" lql ON lql."quizId" = qgr."collectionId"` : sql``}
        ${effectiveCourseId ? sql`LEFT JOIN "courseLessons" cl ON cl."lessonId" = COALESCE(qgr."lessonId", lql."lessonId")` : sql``}
        ${filters.courseStatus ? sql`LEFT JOIN courses c ON c.id = COALESCE(qgr."courseId", ${effectiveCourseId ? sql`cl."courseId"` : sql`qgr."courseId"`})` : sql``}
        WHERE 1=1
        AND uor.role IN ('learner', 'student', 'employee')
        ${effectiveCourseId ? sql`AND COALESCE(qgr."courseId", cl."courseId") = ${effectiveCourseId}` : sql``}
        ${effectiveUnitId ? sql`AND uoa."unitId" = ${effectiveUnitId}` : sql``}
      ${effectiveSubUnitId ? sql`AND uoa."subUnitId" = ${effectiveSubUnitId}` : sql``}
        ${filters.teamId ? sql`AND uoa."teamId" = ${filters.teamId}` : sql``}
        ${filters.courseStatus ? sql`AND c.status = ${filters.courseStatus}` : sql``}
        ${filters.startDate ? sql`AND qgr."createdAt" >= ${filters.startDate.toISOString()}` : sql``}
        ${filters.endDate ? sql`AND qgr."createdAt" <= ${filters.endDate.toISOString()}` : sql``}
        ${filters.search ? sql`AND (u."gamerName" ILIKE ${'%' + filters.search + '%'} OR u."firstName" ILIKE ${'%' + filters.search + '%'} OR u."lastName" ILIKE ${'%' + filters.search + '%'} OR u.email ILIKE ${'%' + filters.search + '%'})` : sql``}
        GROUP BY u.id, u."gamerName", u."firstName", u."lastName", u.email
        HAVING AVG(CASE WHEN qgr."player1TotalAnswers" > 0 
              THEN (qgr."player1CorrectAnswers"::numeric / qgr."player1TotalAnswers") * 100 
              ELSE 0 END) < ${LOW_SCORE_THRESHOLD}
        ORDER BY avg_score ASC
        LIMIT 100
      `);
      
      res.json({
        type,
        learners: (result.rows as any[]).map((r: any) => ({
          userId: r.user_id,
          name: r.name,
          email: r.email,
          avgScore: Math.round(Number(r.avg_score || 0)),
          totalAttempts: Number(r.total_attempts || 0),
          reason: `Average score: ${Math.round(Number(r.avg_score || 0))}%`
        }))
      });
    } else {
      result = await db.execute(sql`
        SELECT 
          u.id as user_id,
          COALESCE(u."gamerName", u."firstName" || ' ' || u."lastName", 'Unknown') as name,
          u.email,
          MAX(GREATEST(
            COALESCE(qgr."createdAt", '1970-01-01'::timestamp),
            COALESCE(cp."lastAccessedAt", '1970-01-01'::timestamp),
            COALESCE(lp."updatedAt", '1970-01-01'::timestamp)
          )) as last_activity,
          EXTRACT(DAY FROM NOW() - MAX(GREATEST(
            COALESCE(qgr."createdAt", '1970-01-01'::timestamp),
            COALESCE(cp."lastAccessedAt", '1970-01-01'::timestamp),
            COALESCE(lp."updatedAt", '1970-01-01'::timestamp)
          ))) as days_inactive
        FROM users u
        JOIN "userOrganizationRoles" uor ON uor."userId" = u.id AND uor."organizationId" = ${orgId}
        ${effectiveUnitId || effectiveSubUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = u.id AND uoa."organizationId" = uor."organizationId"` : sql``}
        ${effectiveCourseId ? sql`JOIN "courseAssignments" caf ON caf."userId" = u.id AND caf."courseId" = ${effectiveCourseId}` : sql``}
        LEFT JOIN "quizGameResults" qgr ON qgr."player1Id" = u.id
        LEFT JOIN "courseProgress" cp ON cp."userId" = u.id ${effectiveCourseId ? sql`AND cp."courseId" = ${effectiveCourseId}` : sql``}
        LEFT JOIN "lessonProgress" lp ON lp."userId" = u.id
        WHERE 1=1
        AND uor.role IN ('learner', 'student', 'employee')
        ${effectiveUnitId ? sql`AND uoa."unitId" = ${effectiveUnitId}` : sql``}
      ${effectiveSubUnitId ? sql`AND uoa."subUnitId" = ${effectiveSubUnitId}` : sql``}
        ${filters.teamId ? sql`AND uoa."teamId" = ${filters.teamId}` : sql``}
        ${filters.search ? sql`AND (u."gamerName" ILIKE ${'%' + filters.search + '%'} OR u."firstName" ILIKE ${'%' + filters.search + '%'} OR u."lastName" ILIKE ${'%' + filters.search + '%'} OR u.email ILIKE ${'%' + filters.search + '%'})` : sql``}
        GROUP BY u.id, u."gamerName", u."firstName", u."lastName", u.email
        HAVING MAX(GREATEST(
          COALESCE(qgr."createdAt", '1970-01-01'::timestamp),
          COALESCE(cp."lastAccessedAt", '1970-01-01'::timestamp),
          COALESCE(lp."updatedAt", '1970-01-01'::timestamp)
        )) < NOW() - INTERVAL '14 days'
        ORDER BY days_inactive DESC
        LIMIT 100
      `);
      
      res.json({
        type,
        learners: (result.rows as any[]).map((r: any) => ({
          userId: r.user_id,
          name: r.name,
          email: r.email,
          lastActive: r.last_activity ? new Date(r.last_activity).toLocaleDateString() : 'Never',
          daysInactive: Math.floor(Number(r.days_inactive || 0)),
          reason: `${Math.floor(Number(r.days_inactive || 0))} days inactive`
        }))
      });
    }
  } catch (error) {
    console.error("Error fetching at-risk details:", error);
    res.status(500).json({ error: "Failed to fetch at-risk details" });
  }
});

// Course Learner Details
learnerAnalyticsRouter.get("/:orgId/course-learners/:courseId", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const { orgId, courseId } = req.params;
    const filters = parseReportFilters(req.query);
    
    const courseResult = await db.execute(sql`
      SELECT id, title FROM courses
      WHERE id = ${courseId}
      AND "organizationId" = ${orgId}
      ${filters.courseStatus ? sql`AND status = ${filters.courseStatus}` : sql``}
    `);
    
    if (!courseResult.rows.length) {
      return res.status(404).json({ error: "Course not found" });
    }
    
    const result = await db.execute(sql`
      WITH effective_assignments AS (
        SELECT ca."courseId", ca."dueDate", ca."assignedAt", ca."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        WHERE ca."courseId" = ${courseId}
        AND ca."organizationId" = ${orgId}
        AND ca."userId" IS NOT NULL
        UNION
        SELECT ca."courseId", ca."dueDate", ca."assignedAt", uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."unitId" = ca."unitId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."courseId" = ${courseId}
        AND ca."organizationId" = ${orgId}
        AND ca."unitId" IS NOT NULL AND ca."userId" IS NULL
        UNION
        SELECT ca."courseId", ca."dueDate", ca."assignedAt", uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."subUnitId" = ca."subUnitId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."courseId" = ${courseId}
        AND ca."organizationId" = ${orgId}
        AND ca."subUnitId" IS NOT NULL AND ca."userId" IS NULL
        UNION
        SELECT ca."courseId", ca."dueDate", ca."assignedAt", uoa."userId" as user_id, ca."organizationId"
        FROM "courseAssignments" ca
        JOIN "userOrganizationAssignments" uoa ON uoa."teamId" = ca."teamId" AND uoa."organizationId" = ca."organizationId"
        WHERE ca."courseId" = ${courseId}
        AND ca."organizationId" = ${orgId}
        AND ca."teamId" IS NOT NULL AND ca."userId" IS NULL
      )
      SELECT 
        u.id as user_id,
        COALESCE(u."gamerName", u."firstName" || ' ' || u."lastName", 'Unknown') as name,
        u.email,
        COALESCE(ea."assignedAt", cp."startedAt") as enrolled_date,
        ea."dueDate" as due_date,
        COALESCE(cp.status, 'not_started') as status,
        COALESCE(cp."percentComplete", 0) as progress,
        cp."startedAt" as started_date,
        cp."completedAt" as completed_date,
        cp."lastAccessedAt" as last_activity
      FROM effective_assignments ea
      JOIN users u ON u.id = ea.user_id
      JOIN "userOrganizationRoles" uor ON uor."userId" = ea.user_id AND uor."organizationId" = ea."organizationId"
      LEFT JOIN "courseProgress" cp ON cp."userId" = ea.user_id AND cp."courseId" = ea."courseId" AND cp."organizationId" = ea."organizationId"
      ${filters.unitId || filters.subUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = ea.user_id AND uoa."organizationId" = ea."organizationId"` : sql``}
      WHERE uor.role IN ('learner', 'student', 'employee')
      ${filters.unitId ? sql`AND uoa."unitId" = ${filters.unitId}` : sql``}
      ${filters.subUnitId ? sql`AND uoa."subUnitId" = ${filters.subUnitId}` : sql``}
      ${filters.teamId ? sql`AND uoa."teamId" = ${filters.teamId}` : sql``}
      ${filters.search ? sql`AND (u."gamerName" ILIKE ${'%' + filters.search + '%'} OR u."firstName" ILIKE ${'%' + filters.search + '%'} OR u."lastName" ILIKE ${'%' + filters.search + '%'} OR u.email ILIKE ${'%' + filters.search + '%'})` : sql``}
      ${filters.startDate ? sql`AND COALESCE(ea."assignedAt", cp."startedAt") >= ${filters.startDate.toISOString()}` : sql``}
      ${filters.endDate ? sql`AND COALESCE(ea."assignedAt", cp."startedAt") <= ${filters.endDate.toISOString()}` : sql``}
      ORDER BY COALESCE(cp."startedAt", ea."assignedAt") DESC
      LIMIT 200
    `);
    
    res.json({
      course: {
        id: (courseResult.rows[0] as any).id,
        title: (courseResult.rows[0] as any).title
      },
      learners: (result.rows as any[]).map((r: any) => ({
        userId: r.user_id,
        name: r.name,
        email: r.email,
        enrolledDate: r.enrolled_date,
        dueDate: r.due_date,
        status: r.status,
        progress: Number(r.progress || 0),
        startedDate: r.started_date,
        completedDate: r.completed_date,
        lastActivity: r.last_activity
      }))
    });
  } catch (error) {
    console.error("Error fetching course learners:", error);
    res.status(500).json({ error: "Failed to fetch course learners" });
  }
});

// Quiz Pass Rate Breakdown
learnerAnalyticsRouter.get("/:orgId/quiz-breakdown", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const filters = parseReportFilters(req.query);
    
    const result = await db.execute(sql`
      SELECT 
        qc.id as quiz_id,
        qc.name as quiz_name,
        COUNT(*) as total_attempts,
        COUNT(CASE WHEN qgr."player1TotalAnswers" > 0 
          AND (qgr."player1CorrectAnswers"::numeric / qgr."player1TotalAnswers") * 100 >= 70 
          THEN 1 END) as passed_attempts,
        AVG(CASE WHEN qgr."player1TotalAnswers" > 0 
          THEN (qgr."player1CorrectAnswers"::numeric / qgr."player1TotalAnswers") * 100 
          ELSE 0 END) as avg_score,
        COUNT(DISTINCT qgr."player1Id") as unique_learners
      FROM "quizCollections" qc
      JOIN "quizGameResults" qgr ON qgr."collectionId" = qc.id
      JOIN "userOrganizationRoles" uor ON uor."userId" = qgr."player1Id" AND uor."organizationId" = ${orgId}
      ${filters.unitId || filters.subUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = qgr."player1Id" AND uoa."organizationId" = ${orgId}` : sql``}
      LEFT JOIN "lessonQuizLinks" lql ON lql."quizId" = qc.id
      LEFT JOIN "courseLessons" cl ON cl."lessonId" = lql."lessonId"
      LEFT JOIN courses c ON c.id = cl."courseId"
      WHERE qc."organizationId" = ${orgId}
      AND uor.role IN ('learner', 'student', 'employee')
      ${filters.unitId ? sql`AND uoa."unitId" = ${filters.unitId}` : sql``}
      ${filters.subUnitId ? sql`AND uoa."subUnitId" = ${filters.subUnitId}` : sql``}
      ${filters.teamId ? sql`AND uoa."teamId" = ${filters.teamId}` : sql``}
      ${filters.courseId ? sql`AND cl."courseId" = ${filters.courseId}` : sql``}
      ${filters.courseStatus ? sql`AND c.status = ${filters.courseStatus}` : sql``}
      ${filters.startDate ? sql`AND qgr."createdAt" >= ${filters.startDate.toISOString()}` : sql``}
      ${filters.endDate ? sql`AND qgr."createdAt" <= ${filters.endDate.toISOString()}` : sql``}
      ${filters.search ? sql`AND qc.name ILIKE ${'%' + filters.search + '%'}` : sql``}
      GROUP BY qc.id, qc.name
      ORDER BY total_attempts DESC
      LIMIT 50
    `);
    
    res.json({
      quizzes: (result.rows as any[]).map((r: any) => {
        const total = Number(r.total_attempts || 0);
        const passed = Number(r.passed_attempts || 0);
        return {
          quizId: r.quiz_id,
          quizName: r.quiz_name,
          totalAttempts: total,
          passedAttempts: passed,
          passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
          avgScore: Math.round(Number(r.avg_score || 0)),
          uniqueLearners: Number(r.unique_learners || 0)
        };
      })
    });
  } catch (error) {
    console.error("Error fetching quiz breakdown:", error);
    res.status(500).json({ error: "Failed to fetch quiz breakdown" });
  }
});

// Quiz Score Range Drill-Down
learnerAnalyticsRouter.get("/:orgId/quiz-score-range/:range", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const { orgId, range } = req.params;
    
    const [minStr, maxStr] = range.split('-');
    const minScore = parseInt(minStr);
    const maxScore = parseInt(maxStr);
    
    if (isNaN(minScore) || isNaN(maxScore)) {
      return res.status(400).json({ error: "Invalid range format. Use format like '61-80'" });
    }
    
    const filters = parseReportFilters(req.query);
    
    const result = await db.execute(sql`
      SELECT 
        u.id as user_id,
        COALESCE(u."gamerName", u."firstName" || ' ' || u."lastName", 'Unknown') as name,
        u.email,
        COUNT(*) as total_attempts,
        AVG(CASE WHEN qgr."player1TotalAnswers" > 0 
          THEN (qgr."player1CorrectAnswers"::numeric / qgr."player1TotalAnswers") * 100 
          ELSE 0 END) as avg_score,
        MAX(qgr."createdAt") as last_attempt
      FROM users u
      JOIN "quizGameResults" qgr ON qgr."player1Id" = u.id
      JOIN "userOrganizationRoles" uor ON uor."userId" = u.id AND uor."organizationId" = ${orgId}
      ${filters.unitId || filters.subUnitId || filters.teamId ? sql`JOIN "userOrganizationAssignments" uoa ON uoa."userId" = u.id AND uoa."organizationId" = ${orgId}` : sql``}
      LEFT JOIN "lessonQuizLinks" lql ON lql."quizId" = qgr."collectionId"
      LEFT JOIN "courseLessons" cl ON cl."lessonId" = COALESCE(qgr."lessonId", lql."lessonId")
      LEFT JOIN courses c ON c.id = COALESCE(qgr."courseId", cl."courseId")
      WHERE 1=1
      AND uor.role IN ('learner', 'student', 'employee')
      ${filters.unitId ? sql`AND uoa."unitId" = ${filters.unitId}` : sql``}
      ${filters.subUnitId ? sql`AND uoa."subUnitId" = ${filters.subUnitId}` : sql``}
      ${filters.teamId ? sql`AND uoa."teamId" = ${filters.teamId}` : sql``}
      ${filters.courseId ? sql`AND COALESCE(qgr."courseId", cl."courseId") = ${filters.courseId}` : sql``}
      ${filters.courseStatus ? sql`AND c.status = ${filters.courseStatus}` : sql``}
      ${filters.startDate ? sql`AND qgr."createdAt" >= ${filters.startDate.toISOString()}` : sql``}
      ${filters.endDate ? sql`AND qgr."createdAt" <= ${filters.endDate.toISOString()}` : sql``}
      ${filters.search ? sql`AND (u."gamerName" ILIKE ${'%' + filters.search + '%'} OR u."firstName" ILIKE ${'%' + filters.search + '%'} OR u."lastName" ILIKE ${'%' + filters.search + '%'} OR u.email ILIKE ${'%' + filters.search + '%'})` : sql``}
      GROUP BY u.id, u."gamerName", u."firstName", u."lastName", u.email
      HAVING AVG(CASE WHEN qgr."player1TotalAnswers" > 0 
            THEN (qgr."player1CorrectAnswers"::numeric / qgr."player1TotalAnswers") * 100 
            ELSE 0 END) >= ${minScore}
         AND AVG(CASE WHEN qgr."player1TotalAnswers" > 0 
            THEN (qgr."player1CorrectAnswers"::numeric / qgr."player1TotalAnswers") * 100 
            ELSE 0 END) <= ${maxScore}
      ORDER BY avg_score DESC
      LIMIT 100
    `);
    
    res.json({
      range,
      learners: (result.rows as any[]).map((r: any) => ({
        userId: r.user_id,
        name: r.name,
        email: r.email,
        avgScore: Math.round(Number(r.avg_score || 0)),
        totalAttempts: Number(r.total_attempts || 0),
        lastAttempt: r.last_attempt ? new Date(r.last_attempt).toLocaleDateString() : 'N/A'
      }))
    });
  } catch (error) {
    console.error("Error fetching quiz score range:", error);
    res.status(500).json({ error: "Failed to fetch quiz score range" });
  }
});

/**
 * Create and return the reports router
 */
export function createReportsRouter(): Router {
  return router;
}

/**
 * Create and return the learner analytics router
 */
export function createLearnerAnalyticsRouter(): Router {
  return learnerAnalyticsRouter;
}

/**
 * Register report routes with the Express app
 */
export function registerReportRoutes(app: any) {
  app.use('/api/admin/reports', router);
  app.use('/api/reports/learner-analytics', learnerAnalyticsRouter);
  console.log('[Routes] Report routes registered at /api/admin/reports');
  console.log('[Routes] Learner Analytics routes registered at /api/reports/learner-analytics');
}
