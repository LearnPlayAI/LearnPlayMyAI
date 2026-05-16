import { Express, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
import {
  enterpriseRevenueSync,
  enterpriseCustomers,
  users,
  courses,
  organizations,
  userCourseEnrollments,
  coursePurchases,
  userOrganizationRoles,
} from '@shared/schema';
import { requireEnterpriseAuth } from './enterpriseAuthRoutes';
import { isCustSuper } from '../adminAuth';

function requireOnpremMode(req: Request, res: Response, next: any) {
  if (process.env.ONPREM_MODE !== 'true') {
    return res.status(403).json({ error: 'This endpoint is only available in on-premises mode' });
  }
  next();
}

export function registerEnterpriseRevenueRoutes(app: Express) {
  if (process.env.ONPREM_MODE === 'true') {
    return;
  }

  app.get('/api/onprem/revenue/export', requireOnpremMode, isCustSuper, async (req: Request, res: Response) => {
    try {
      const allOrgs = await db.select().from(organizations);

      const exportData = [];

      for (const org of allOrgs) {
        const roleCountsRaw = await db
          .select({
            role: userOrganizationRoles.role,
            count: sql<number>`count(*)::int`,
          })
          .from(userOrganizationRoles)
          .where(eq(userOrganizationRoles.organizationId, org.id))
          .groupBy(userOrganizationRoles.role);

        const roleCounts: Record<string, number> = {};
        let totalUsers = 0;
        let totalLearners = 0;
        let totalInstructors = 0;
        let totalAdmins = 0;

        for (const rc of roleCountsRaw) {
          roleCounts[rc.role] = rc.count;
          totalUsers += rc.count;
          if (['student', 'learner'].includes(rc.role)) {
            totalLearners += rc.count;
          }
          if (['teacher', 'instructor', 'team_lead'].includes(rc.role)) {
            totalInstructors += rc.count;
          }
          if (['org_admin'].includes(rc.role)) {
            totalAdmins += rc.count;
          }
        }

        const [courseCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(courses)
          .where(eq(courses.organizationId, org.id));

        const [enrollmentCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(userCourseEnrollments)
          .innerJoin(courses, eq(userCourseEnrollments.courseId, courses.id))
          .where(eq(courses.organizationId, org.id));

        const [revenueResult] = await db
          .select({
            total: sql<string>`coalesce(sum(${coursePurchases.purchasePrice}), 0)`,
            currency: coursePurchases.purchaseCurrency,
          })
          .from(coursePurchases)
          .innerJoin(courses, eq(coursePurchases.courseId, courses.id))
          .where(
            and(
              eq(courses.organizationId, org.id),
              eq(coursePurchases.status, 'completed')
            )
          )
          .groupBy(coursePurchases.purchaseCurrency)
          .limit(1);

        const now = new Date();
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        exportData.push({
          orgName: org.name,
          orgId: org.id,
          systemBaseUrl: process.env.BASE_URL || null,
          systemType: process.env.SYSTEM_TYPE || 'production',
          totalUsers,
          totalLearners,
          totalInstructors,
          totalAdmins,
          totalCourses: courseCount?.count || 0,
          totalEnrollments: enrollmentCount?.count || 0,
          totalRevenueLocal: revenueResult?.total || '0',
          revenueCurrency: revenueResult?.currency || 'ZAR',
          syncPeriodStart: thirtyDaysAgo.toISOString(),
          syncPeriodEnd: now.toISOString(),
          syncedAt: now.toISOString(),
        });
      }

      res.json({
        exportedAt: new Date().toISOString(),
        organizationCount: exportData.length,
        data: exportData,
      });
    } catch (error) {
      console.error('[EnterpriseRevenue] Error generating revenue export:', error);
      res.status(500).json({ error: 'Failed to generate revenue export' });
    }
  });

  app.post('/api/enterprise/revenue/sync', requireEnterpriseAuth, async (req: Request, res: Response) => {
    try {
      const enterpriseCustomerId = req.session.enterpriseCustomerId!;
      const { data } = req.body;

      if (!Array.isArray(data) || data.length === 0) {
        return res.status(400).json({ error: 'data must be a non-empty array of revenue sync objects' });
      }

      const inserted = [];

      for (const item of data) {
        if (!item.orgName) {
          return res.status(400).json({ error: 'Each revenue sync object must have an orgName' });
        }

        const [record] = await db
          .insert(enterpriseRevenueSync)
          .values({
            enterpriseCustomerId,
            licenseKeyId: item.licenseKeyId || null,
            orgName: item.orgName,
            orgId: item.orgId || null,
            systemBaseUrl: item.systemBaseUrl || null,
            systemType: item.systemType || null,
            totalUsers: item.totalUsers || 0,
            totalLearners: item.totalLearners || 0,
            totalInstructors: item.totalInstructors || 0,
            totalAdmins: item.totalAdmins || 0,
            totalCourses: item.totalCourses || 0,
            totalEnrollments: item.totalEnrollments || 0,
            totalRevenueLocal: item.totalRevenueLocal || '0',
            revenueCurrency: item.revenueCurrency || null,
            commissionPercentage: item.commissionPercentage || null,
            commissionValue: item.commissionValue || null,
            syncPeriodStart: item.syncPeriodStart ? new Date(item.syncPeriodStart) : null,
            syncPeriodEnd: item.syncPeriodEnd ? new Date(item.syncPeriodEnd) : null,
            syncedAt: new Date(),
          })
          .returning();

        inserted.push(record);
      }

      console.log(`[EnterpriseRevenue] ${inserted.length} revenue sync records uploaded by enterprise customer ${enterpriseCustomerId}`);

      res.status(201).json({
        success: true,
        message: `${inserted.length} revenue sync records uploaded successfully`,
        records: inserted,
      });
    } catch (error) {
      console.error('[EnterpriseRevenue] Error syncing revenue data:', error);
      res.status(500).json({ error: 'Failed to sync revenue data' });
    }
  });

  app.get('/api/enterprise/revenue/dashboard', requireEnterpriseAuth, async (req: Request, res: Response) => {
    try {
      const enterpriseCustomerId = req.session.enterpriseCustomerId!;
      const { startDate, endDate, orgId } = req.query;

      const conditions: any[] = [eq(enterpriseRevenueSync.enterpriseCustomerId, enterpriseCustomerId)];

      if (startDate) {
        conditions.push(gte(enterpriseRevenueSync.syncPeriodEnd, new Date(startDate as string)));
      }
      if (endDate) {
        conditions.push(lte(enterpriseRevenueSync.syncPeriodStart, new Date(endDate as string)));
      }
      if (orgId) {
        conditions.push(eq(enterpriseRevenueSync.orgId, orgId as string));
      }

      const records = await db
        .select()
        .from(enterpriseRevenueSync)
        .where(and(...conditions))
        .orderBy(desc(enterpriseRevenueSync.syncedAt));

      let totalUsers = 0;
      let totalLearners = 0;
      let totalInstructors = 0;
      let totalAdmins = 0;
      let totalCourses = 0;
      let totalEnrollments = 0;
      let totalRevenue = 0;
      let totalCommission = 0;

      const orgBreakdown: Record<string, any> = {};

      for (const record of records) {
        totalUsers += record.totalUsers || 0;
        totalLearners += record.totalLearners || 0;
        totalInstructors += record.totalInstructors || 0;
        totalAdmins += record.totalAdmins || 0;
        totalCourses += record.totalCourses || 0;
        totalEnrollments += record.totalEnrollments || 0;
        totalRevenue += parseFloat(record.totalRevenueLocal || '0');
        totalCommission += parseFloat(record.commissionValue || '0');

        const orgKey = record.orgName || record.orgId || 'Unknown';
        if (!orgBreakdown[orgKey]) {
          orgBreakdown[orgKey] = {
            orgName: record.orgName,
            orgId: record.orgId,
            totalUsers: 0,
            totalLearners: 0,
            totalCourses: 0,
            totalEnrollments: 0,
            totalRevenue: 0,
            totalCommission: 0,
            recordCount: 0,
            latestSync: null as string | null,
          };
        }
        orgBreakdown[orgKey].totalUsers += record.totalUsers || 0;
        orgBreakdown[orgKey].totalLearners += record.totalLearners || 0;
        orgBreakdown[orgKey].totalCourses += record.totalCourses || 0;
        orgBreakdown[orgKey].totalEnrollments += record.totalEnrollments || 0;
        orgBreakdown[orgKey].totalRevenue += parseFloat(record.totalRevenueLocal || '0');
        orgBreakdown[orgKey].totalCommission += parseFloat(record.commissionValue || '0');
        orgBreakdown[orgKey].recordCount += 1;
        const syncedStr = record.syncedAt?.toISOString() || null;
        if (!orgBreakdown[orgKey].latestSync || (syncedStr && syncedStr > orgBreakdown[orgKey].latestSync!)) {
          orgBreakdown[orgKey].latestSync = syncedStr;
        }
      }

      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sixtyDaysAgo = new Date(now);
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const ninetyDaysAgo = new Date(now);
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const periodBreakdown = {
        last30Days: { revenue: 0, enrollments: 0, users: 0 },
        last60Days: { revenue: 0, enrollments: 0, users: 0 },
        last90Days: { revenue: 0, enrollments: 0, users: 0 },
      };

      for (const record of records) {
        const syncDate = record.syncedAt;
        if (!syncDate) continue;

        if (syncDate >= thirtyDaysAgo) {
          periodBreakdown.last30Days.revenue += parseFloat(record.totalRevenueLocal || '0');
          periodBreakdown.last30Days.enrollments += record.totalEnrollments || 0;
          periodBreakdown.last30Days.users += record.totalUsers || 0;
        }
        if (syncDate >= sixtyDaysAgo) {
          periodBreakdown.last60Days.revenue += parseFloat(record.totalRevenueLocal || '0');
          periodBreakdown.last60Days.enrollments += record.totalEnrollments || 0;
          periodBreakdown.last60Days.users += record.totalUsers || 0;
        }
        if (syncDate >= ninetyDaysAgo) {
          periodBreakdown.last90Days.revenue += parseFloat(record.totalRevenueLocal || '0');
          periodBreakdown.last90Days.enrollments += record.totalEnrollments || 0;
          periodBreakdown.last90Days.users += record.totalUsers || 0;
        }
      }

      res.json({
        summary: {
          totalUsers,
          totalLearners,
          totalInstructors,
          totalAdmins,
          totalCourses,
          totalEnrollments,
          totalRevenue,
          totalCommission,
          recordCount: records.length,
        },
        organizationBreakdown: Object.values(orgBreakdown),
        periodBreakdown,
        records,
      });
    } catch (error) {
      console.error('[EnterpriseRevenue] Error fetching revenue dashboard:', error);
      res.status(500).json({ error: 'Failed to fetch revenue dashboard' });
    }
  });

  app.get('/api/enterprise/revenue/export-csv', requireEnterpriseAuth, async (req: Request, res: Response) => {
    try {
      const enterpriseCustomerId = req.session.enterpriseCustomerId!;
      const { startDate, endDate } = req.query;

      const conditions: any[] = [eq(enterpriseRevenueSync.enterpriseCustomerId, enterpriseCustomerId)];

      if (startDate) {
        conditions.push(gte(enterpriseRevenueSync.syncPeriodEnd, new Date(startDate as string)));
      }
      if (endDate) {
        conditions.push(lte(enterpriseRevenueSync.syncPeriodStart, new Date(endDate as string)));
      }

      const records = await db
        .select()
        .from(enterpriseRevenueSync)
        .where(and(...conditions))
        .orderBy(desc(enterpriseRevenueSync.syncedAt));

      const headers = [
        'Organization Name',
        'Organization ID',
        'System Base URL',
        'System Type',
        'Total Users',
        'Total Learners',
        'Total Instructors',
        'Total Admins',
        'Total Courses',
        'Total Enrollments',
        'Total Revenue (Local)',
        'Revenue Currency',
        'Commission %',
        'Commission Value',
        'Sync Period Start',
        'Sync Period End',
        'Synced At',
      ];

      const csvRows = [headers.join(',')];

      for (const record of records) {
        const row = [
          `"${(record.orgName || '').replace(/"/g, '""')}"`,
          record.orgId || '',
          record.systemBaseUrl || '',
          record.systemType || '',
          record.totalUsers || 0,
          record.totalLearners || 0,
          record.totalInstructors || 0,
          record.totalAdmins || 0,
          record.totalCourses || 0,
          record.totalEnrollments || 0,
          record.totalRevenueLocal || '0',
          record.revenueCurrency || '',
          record.commissionPercentage || '',
          record.commissionValue || '',
          record.syncPeriodStart?.toISOString() || '',
          record.syncPeriodEnd?.toISOString() || '',
          record.syncedAt?.toISOString() || '',
        ];
        csvRows.push(row.join(','));
      }

      const csv = csvRows.join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="revenue-report-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv);
    } catch (error) {
      console.error('[EnterpriseRevenue] Error exporting revenue CSV:', error);
      res.status(500).json({ error: 'Failed to export revenue CSV' });
    }
  });

  console.log('[Routes] Enterprise revenue routes registered');
}
