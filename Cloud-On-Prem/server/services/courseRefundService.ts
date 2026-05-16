import { db } from "../db";
import { 
  courseRefunds, 
  coursePurchases, 
  courses, 
  users, 
  organizations,
  userCourseLessonProgress,
  lessonProgress,
  courseLessons,
  courseReviews,
  CourseRefund,
  CoursePurchase
} from "@shared/schema";
import { eq, and, desc, sql, count, inArray } from "drizzle-orm";
import { PurchaseService } from "./purchaseService";
import { MailerSendService } from "./mailerSendService";

const DEFAULT_REFUND_WINDOW_DAYS = 14;

export class CourseRefundService {
  
  static async requestRefund(params: {
    purchaseId: string;
    userId: string;
    reason: string;
  }): Promise<{ success: boolean; refundId?: string; error?: string }> {
    try {
      const { purchaseId, userId, reason } = params;

      const [purchase] = await db
        .select()
        .from(coursePurchases)
        .where(and(
          eq(coursePurchases.id, purchaseId),
          eq(coursePurchases.userId, userId)
        ))
        .limit(1);

      if (!purchase) {
        return { success: false, error: "Purchase not found or does not belong to you" };
      }

      if (purchase.status === "refunded") {
        return { success: false, error: "This purchase has already been refunded" };
      }

      if (purchase.status !== "completed") {
        return { success: false, error: "Only completed purchases can be refunded" };
      }

      const existingRefund = await db
        .select()
        .from(courseRefunds)
        .where(and(
          eq(courseRefunds.purchaseId, purchaseId),
          inArray(courseRefunds.status, ["pending", "approved"])
        ))
        .limit(1);

      if (existingRefund.length > 0) {
        return { success: false, error: "A refund request already exists for this purchase" };
      }

      const [course] = await db
        .select()
        .from(courses)
        .where(eq(courses.id, purchase.courseId))
        .limit(1);

      if (!course) {
        return { success: false, error: "Course not found" };
      }

      const eligibility = await this.checkEligibility(purchaseId, userId);
      
      if (!eligibility.eligible) {
        return { success: false, error: eligibility.reason };
      }

      const commissionRate = parseFloat(purchase.commissionRate?.toString() || "0.30");
      const originalAmount = parseFloat(purchase.purchasePrice?.toString() || "0");
      const platformCommission = parseFloat(purchase.commissionAmount?.toString() || "0");
      const creatorRefundAmount = originalAmount - platformCommission;

      const [refund] = await db
        .insert(courseRefunds)
        .values({
          purchaseId,
          courseId: purchase.courseId,
          userId,
          organizationId: course.organizationId,
          status: "pending",
          requestReason: reason,
          originalAmount: originalAmount.toFixed(4),
          originalCurrency: purchase.purchaseCurrency,
          exchangeRateSnapshot: purchase.exchangeRateUsed?.toString() || "1.00000000",
          platformCommission: platformCommission.toFixed(4),
          creatorRefundAmount: creatorRefundAmount.toFixed(4),
          platformCurrency: purchase.platformCurrency || "ZAR",
          completionPercentage: eligibility.completionPercentage?.toFixed(2) || "0.00",
          eligibilityWindowDays: DEFAULT_REFUND_WINDOW_DAYS,
        })
        .returning();

      console.log(`[CourseRefundService] Refund request created: ${refund.id} for purchase ${purchaseId}`);

      return { success: true, refundId: refund.id };

    } catch (error: any) {
      console.error("[CourseRefundService] Failed to request refund:", error);
      return { success: false, error: error.message || "Failed to request refund" };
    }
  }

  static async checkEligibility(purchaseId: string, userId: string): Promise<{
    eligible: boolean;
    reason?: string;
    completionPercentage?: number;
    daysRemaining?: number;
    reviewRating?: number;
  }> {
    try {
      const [purchase] = await db
        .select()
        .from(coursePurchases)
        .where(and(
          eq(coursePurchases.id, purchaseId),
          eq(coursePurchases.userId, userId)
        ))
        .limit(1);

      if (!purchase) {
        return { eligible: false, reason: "Purchase not found" };
      }

      if (!purchase.purchasedAt) {
        return { eligible: false, reason: "Purchase date not available" };
      }

      // Check refund window
      const purchaseDate = new Date(purchase.purchasedAt);
      const now = new Date();
      const daysSincePurchase = Math.floor((now.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysSincePurchase > DEFAULT_REFUND_WINDOW_DAYS) {
        return { 
          eligible: false, 
          reason: `Refund window has expired (${DEFAULT_REFUND_WINDOW_DAYS} days from purchase)`,
          daysRemaining: 0
        };
      }

      // NEW: Check course completion - must be 100%
      const completionPercentage = await this.calculateCourseCompletion(purchase.courseId, userId);
      
      if (completionPercentage < 0) {
        return { 
          eligible: false, 
          reason: "Unable to verify course completion. Please contact support.",
          completionPercentage: 0
        };
      }
      
      if (completionPercentage < 100) {
        return { 
          eligible: false, 
          reason: `Course must be fully completed for refund eligibility (currently ${completionPercentage.toFixed(1)}% complete)`,
          completionPercentage
        };
      }

      // NEW: Check for qualifying review (≤2 stars with comment)
      const [review] = await db
        .select()
        .from(courseReviews)
        .where(and(
          eq(courseReviews.courseId, purchase.courseId),
          eq(courseReviews.userId, userId)
        ))
        .limit(1);

      if (!review) {
        return {
          eligible: false,
          reason: "You must submit a review of the course before requesting a refund",
          completionPercentage
        };
      }

      const reviewRating = parseFloat(review.rating?.toString() || "5");
      
      if (reviewRating > 2) {
        return {
          eligible: false,
          reason: `Refund only available for courses rated 2 stars or below (your rating: ${reviewRating} stars)`,
          completionPercentage,
          reviewRating
        };
      }

      if (!review.comment || review.comment.trim().length === 0) {
        return {
          eligible: false,
          reason: "Your review must include a comment explaining why you're unsatisfied",
          completionPercentage,
          reviewRating
        };
      }

      return { 
        eligible: true,
        completionPercentage,
        daysRemaining: DEFAULT_REFUND_WINDOW_DAYS - daysSincePurchase,
        reviewRating
      };

    } catch (error: any) {
      console.error("[CourseRefundService] Failed to check eligibility:", error);
      return { eligible: false, reason: "Failed to check eligibility" };
    }
  }

  /**
   * Calculate course completion percentage using authoritative lesson count
   * Gets total lessons from courseLessons table (source of truth)
   * Gets completed lessons from userCourseLessonProgress table
   * Returns -1 if calculation fails (used to deny refund on error)
   */
  static async calculateCourseCompletion(courseId: string, userId: string): Promise<number> {
    try {
      // Get total number of lessons in the course from courseLessons table (authoritative source)
      const [lessonCount] = await db
        .select({
          total: sql<number>`COUNT(*)::int`
        })
        .from(courseLessons)
        .where(eq(courseLessons.courseId, courseId));

      const totalLessons = lessonCount?.total || 0;

      // If course has no lessons, return 0% (course not set up yet, allow refund)
      if (totalLessons === 0) {
        console.log(`[CourseRefundService] Course ${courseId} has no lessons, returning 0% completion`);
        return 0;
      }

      // Get completed lessons for this user from progress tracking
      const progressRecords = await db
        .select({
          lessonId: userCourseLessonProgress.lessonId,
          completedAt: userCourseLessonProgress.completedAt
        })
        .from(userCourseLessonProgress)
        .where(and(
          eq(userCourseLessonProgress.courseId, courseId),
          eq(userCourseLessonProgress.userId, userId)
        ));

      // Count only lessons marked as completed (completedAt is not null)
      const completedCount = progressRecords.filter(p => p.completedAt !== null).length;
      
      // Calculate percentage based on authoritative lesson count
      const completionPercentage = (completedCount / totalLessons) * 100;
      
      console.log(`[CourseRefundService] Course ${courseId} completion: ${completedCount}/${totalLessons} = ${completionPercentage.toFixed(1)}%`);
      
      return completionPercentage;

    } catch (error: any) {
      console.error("[CourseRefundService] Failed to calculate completion:", error);
      // Return -1 to indicate error - this will cause refund to be denied
      // Fail safe: don't allow refund if we can't verify completion
      return -1;
    }
  }

  static async approveRefund(params: {
    refundId: string;
    decidedBy: string;
    decisionReason?: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { refundId, decidedBy, decisionReason } = params;

      const [refund] = await db
        .select()
        .from(courseRefunds)
        .where(eq(courseRefunds.id, refundId))
        .limit(1);

      if (!refund) {
        return { success: false, error: "Refund request not found" };
      }

      if (refund.status !== "pending") {
        return { success: false, error: `Cannot approve refund with status: ${refund.status}` };
      }

      await db.transaction(async (tx) => {
        await tx
          .update(courseRefunds)
          .set({
            status: "approved",
            decidedBy,
            decisionReason: decisionReason || "Approved by organization admin",
            decidedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(courseRefunds.id, refundId));

        await tx
          .update(coursePurchases)
          .set({
            status: "refunded",
            refundedAt: new Date(),
          })
          .where(eq(coursePurchases.id, refund.purchaseId));

        console.log(`[CourseRefundService] Refund ${refundId} approved - purchase ${refund.purchaseId} marked as refunded`);
      });

      console.log(`[CourseRefundService] Refund approved: ${refundId} by ${decidedBy}`);
      
      // Send email notification to user
      try {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, refund.userId))
          .limit(1);

        const [course] = await db
          .select()
          .from(courses)
          .where(eq(courses.id, refund.courseId))
          .limit(1);

        if (user && course) {
          await MailerSendService.sendRefundDecisionEmail({
            to: user.email,
            userName: user.gamerName || user.email,
            courseTitle: course.title,
            refundAmount: refund.creatorRefundAmount?.toString() || "0.00",
            currency: refund.originalCurrency || "ZAR",
            decision: 'approved',
            decisionReason: decisionReason || "Your refund has been approved",
          });
        }
      } catch (emailError: any) {
        console.error("[CourseRefundService] Failed to send refund approval email:", emailError);
      }
      
      return { success: true };

    } catch (error: any) {
      console.error("[CourseRefundService] Failed to approve refund:", error);
      return { success: false, error: error.message || "Failed to approve refund" };
    }
  }

  static async declineRefund(params: {
    refundId: string;
    decidedBy: string;
    decisionReason: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { refundId, decidedBy, decisionReason } = params;

      if (!decisionReason || decisionReason.trim().length < 10) {
        return { success: false, error: "A detailed reason is required for declining a refund" };
      }

      const [refund] = await db
        .select()
        .from(courseRefunds)
        .where(eq(courseRefunds.id, refundId))
        .limit(1);

      if (!refund) {
        return { success: false, error: "Refund request not found" };
      }

      if (refund.status !== "pending") {
        return { success: false, error: `Cannot decline refund with status: ${refund.status}` };
      }

      await db
        .update(courseRefunds)
        .set({
          status: "declined",
          decidedBy,
          decisionReason,
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(courseRefunds.id, refundId));

      console.log(`[CourseRefundService] Refund declined: ${refundId} by ${decidedBy}, reason: ${decisionReason}`);
      
      // Send email notification to user
      try {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, refund.userId))
          .limit(1);

        const [course] = await db
          .select()
          .from(courses)
          .where(eq(courses.id, refund.courseId))
          .limit(1);

        if (user && course) {
          await MailerSendService.sendRefundDecisionEmail({
            to: user.email,
            userName: user.gamerName || user.email,
            courseTitle: course.title,
            refundAmount: refund.originalAmount?.toString() || "0.00",
            currency: refund.originalCurrency || "ZAR",
            decision: 'declined',
            decisionReason,
          });
        }
      } catch (emailError: any) {
        console.error("[CourseRefundService] Failed to send refund declined email:", emailError);
      }
      
      return { success: true };

    } catch (error: any) {
      console.error("[CourseRefundService] Failed to decline refund:", error);
      return { success: false, error: error.message || "Failed to decline refund" };
    }
  }

  static async markRefundPaid(refundId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const [refund] = await db
        .select()
        .from(courseRefunds)
        .where(eq(courseRefunds.id, refundId))
        .limit(1);

      if (!refund) {
        return { success: false, error: "Refund request not found" };
      }

      if (refund.status !== "approved") {
        return { success: false, error: `Cannot mark as paid - refund status is: ${refund.status}` };
      }

      await db
        .update(courseRefunds)
        .set({
          status: "paid",
          paidOutAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(courseRefunds.id, refundId));

      console.log(`[CourseRefundService] Refund marked as paid: ${refundId}`);
      
      return { success: true };

    } catch (error: any) {
      console.error("[CourseRefundService] Failed to mark refund as paid:", error);
      return { success: false, error: error.message || "Failed to mark refund as paid" };
    }
  }

  static async getPendingRefundsForOrg(organizationId: string): Promise<{
    refunds: (CourseRefund & { 
      course: { title: string; id: string } | null;
      user: { gamerName: string | null; email: string; id: string } | null;
    })[];
    totalCount: number;
  }> {
    try {
      const refunds = await db
        .select({
          refund: courseRefunds,
          courseTitle: courses.title,
          courseId: courses.id,
          userGamerName: users.gamerName,
          userEmail: users.email,
          userId: users.id,
        })
        .from(courseRefunds)
        .leftJoin(courses, eq(courseRefunds.courseId, courses.id))
        .leftJoin(users, eq(courseRefunds.userId, users.id))
        .where(and(
          eq(courseRefunds.organizationId, organizationId),
          eq(courseRefunds.status, "pending")
        ))
        .orderBy(desc(courseRefunds.requestedAt));

      const mappedRefunds = refunds.map(r => ({
        ...r.refund,
        course: r.courseTitle ? { title: r.courseTitle, id: r.courseId! } : null,
        user: r.userEmail ? { 
          gamerName: r.userGamerName, 
          email: r.userEmail,
          id: r.userId!
        } : null,
      }));

      return {
        refunds: mappedRefunds,
        totalCount: refunds.length,
      };

    } catch (error: any) {
      console.error("[CourseRefundService] Failed to get pending refunds:", error);
      return { refunds: [], totalCount: 0 };
    }
  }

  static async getAllRefundsForOrg(params: {
    organizationId: string;
    status?: "pending" | "approved" | "declined" | "paid";
    limit?: number;
    offset?: number;
  }): Promise<{
    refunds: (CourseRefund & { 
      course: { title: string; id: string } | null;
      user: { gamerName: string | null; email: string; id: string } | null;
      decidedByUser: { gamerName: string | null; email: string } | null;
    })[];
    totalCount: number;
  }> {
    try {
      const { organizationId, status, limit = 50, offset = 0 } = params;

      const whereConditions = [eq(courseRefunds.organizationId, organizationId)];
      if (status) {
        whereConditions.push(eq(courseRefunds.status, status));
      }

      const decidedByUsers = db
        .select()
        .from(users)
        .as("decidedByUsers");

      const refunds = await db
        .select({
          refund: courseRefunds,
          courseTitle: courses.title,
          courseId: courses.id,
          userGamerName: users.gamerName,
          userEmail: users.email,
          userId: users.id,
        })
        .from(courseRefunds)
        .leftJoin(courses, eq(courseRefunds.courseId, courses.id))
        .leftJoin(users, eq(courseRefunds.userId, users.id))
        .where(and(...whereConditions))
        .orderBy(desc(courseRefunds.requestedAt))
        .limit(limit)
        .offset(offset);

      const [countResult] = await db
        .select({ count: count() })
        .from(courseRefunds)
        .where(and(...whereConditions));

      const mappedRefunds = refunds.map(r => ({
        ...r.refund,
        course: r.courseTitle ? { title: r.courseTitle, id: r.courseId! } : null,
        user: r.userEmail ? { 
          gamerName: r.userGamerName, 
          email: r.userEmail,
          id: r.userId!
        } : null,
        decidedByUser: null,
      }));

      return {
        refunds: mappedRefunds,
        totalCount: countResult?.count || 0,
      };

    } catch (error: any) {
      console.error("[CourseRefundService] Failed to get all refunds:", error);
      return { refunds: [], totalCount: 0 };
    }
  }

  static async getRefundById(refundId: string): Promise<CourseRefund | null> {
    try {
      const [refund] = await db
        .select()
        .from(courseRefunds)
        .where(eq(courseRefunds.id, refundId))
        .limit(1);

      return refund || null;

    } catch (error: any) {
      console.error("[CourseRefundService] Failed to get refund:", error);
      return null;
    }
  }

  static async getRefundsForUser(userId: string): Promise<CourseRefund[]> {
    try {
      const refunds = await db
        .select()
        .from(courseRefunds)
        .where(eq(courseRefunds.userId, userId))
        .orderBy(desc(courseRefunds.requestedAt));

      return refunds;

    } catch (error: any) {
      console.error("[CourseRefundService] Failed to get user refunds:", error);
      return [];
    }
  }

  static async getRefundStats(organizationId: string): Promise<{
    pendingCount: number;
    approvedCount: number;
    declinedCount: number;
    paidCount: number;
    totalRefundAmount: number;
    totalCommissionRetained: number;
  }> {
    try {
      const stats = await db
        .select({
          status: courseRefunds.status,
          count: count(),
          totalRefund: sql<string>`COALESCE(SUM(${courseRefunds.creatorRefundAmount}::numeric), 0)`,
          totalCommission: sql<string>`COALESCE(SUM(${courseRefunds.platformCommission}::numeric), 0)`,
        })
        .from(courseRefunds)
        .where(eq(courseRefunds.organizationId, organizationId))
        .groupBy(courseRefunds.status);

      const result = {
        pendingCount: 0,
        approvedCount: 0,
        declinedCount: 0,
        paidCount: 0,
        totalRefundAmount: 0,
        totalCommissionRetained: 0,
      };

      for (const stat of stats) {
        switch (stat.status) {
          case "pending":
            result.pendingCount = stat.count;
            break;
          case "approved":
            result.approvedCount = stat.count;
            result.totalRefundAmount += parseFloat(stat.totalRefund);
            result.totalCommissionRetained += parseFloat(stat.totalCommission);
            break;
          case "declined":
            result.declinedCount = stat.count;
            break;
          case "paid":
            result.paidCount = stat.count;
            result.totalRefundAmount += parseFloat(stat.totalRefund);
            result.totalCommissionRetained += parseFloat(stat.totalCommission);
            break;
        }
      }

      return result;

    } catch (error: any) {
      console.error("[CourseRefundService] Failed to get refund stats:", error);
      return {
        pendingCount: 0,
        approvedCount: 0,
        declinedCount: 0,
        paidCount: 0,
        totalRefundAmount: 0,
        totalCommissionRetained: 0,
      };
    }
  }
}
