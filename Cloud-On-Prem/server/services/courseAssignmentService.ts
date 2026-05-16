import { db } from '../db';
import { isNull } from 'drizzle-orm';
import {
  courseAssignments,
  courseProgress,
  courseAssignmentAudienceEnum,
  courseProgressStatusEnum,
  courses,
  userOrganizationAssignments,
  organizationUnits,
  organizationSubUnits,
  organizationTeams,
  unitSubjects,
  users,
  interOrgCourseAssignmentRules,
  type CourseAssignment,
  type InsertCourseAssignment,
  type CourseProgress,
  type InsertCourseProgress,
} from '@shared/schema';
import { eq, and, or, inArray, sql, asc, desc } from 'drizzle-orm';
import { CourseService } from './courseService';

export interface EnrichedCourseAssignment extends CourseAssignment {
  courseTitle: string | null;
  unitName: string | null;
  subUnitName: string | null;
  teamName: string | null;
  assignedByName: string | null;
}

export interface UpdateCourseAssignmentData {
  dueDate?: string | null;
  mandatory?: boolean;
  userId?: string | null;
  unitId?: string | null;
  subjectId?: string | null;
  subUnitId?: string | null;
  teamId?: string | null;
  assignmentScope?: 'organization' | 'department' | 'subject' | 'unit' | 'team' | 'user';
}

export interface CourseWithProgress {
  assignment: CourseAssignment;
  course: {
    id: string;
    title: string;
    description: string | null;
    thumbnailUrl: string | null;
    price: string;
    currency: string;
    status: string;
    difficultyLevel: string | null;
    estimatedDuration: number | null;
    visibility: string | null;
  };
  progress: CourseProgress | null;
}

export interface CourseWithAssignment {
  course: {
    id: string;
    title: string;
    description: string | null;
    thumbnailUrl: string | null;
    status: string;
    difficultyLevel: string | null;
  };
  assignment: {
    id: string;
    dueDate: Date | null;
    mandatory: boolean;
    assignmentScope: string;
    assignedAt: Date | null;
  };
}

export class CourseAssignmentService {
  /**
   * Create a new course assignment
   */
  static async createCourseAssignment(data: InsertCourseAssignment): Promise<CourseAssignment> {
    const [assignment] = await db.insert(courseAssignments).values(data).returning();
    console.log(`[CourseAssignmentService] Created assignment: ${assignment.id} for course ${data.courseId}`);
    return assignment;
  }

  /**
   * Get all course assignments for an organization
   */
  static async getCourseAssignmentsForOrg(organizationId: string): Promise<CourseAssignment[]> {
    const assignments = await db.query.courseAssignments.findMany({
      where: eq(courseAssignments.organizationId, organizationId),
    });
    return assignments;
  }

  /**
   * Get all course assignments for a specific course within an organization
   */
  static async getCourseAssignmentsForCourse(courseId: string, organizationId: string): Promise<CourseAssignment[]> {
    const assignments = await db.query.courseAssignments.findMany({
      where: and(
        eq(courseAssignments.courseId, courseId),
        eq(courseAssignments.organizationId, organizationId)
      ),
    });
    return assignments;
  }

  /**
   * Find existing course assignments by course and organization
   * Returns all assignments for a course within an org (for upsert/replacement logic)
   * Ordered by assignedAt DESC for deterministic selection (most recent first)
   */
  static async findExistingAssignmentsByCourse(
    courseId: string,
    organizationId: string
  ): Promise<CourseAssignment[]> {
    const existing = await db
      .select()
      .from(courseAssignments)
      .where(and(
        eq(courseAssignments.courseId, courseId),
        eq(courseAssignments.organizationId, organizationId)
      ))
      .orderBy(desc(courseAssignments.assignedAt));
    return existing;
  }

  /**
   * Upsert a course assignment - update if exists, create if not
   * Uses deterministic ordering (most recent first) and clears mutually exclusive scope fields
   * Deletes any duplicates to ensure only one assignment per course per organization
   */
  static inferAssignmentScope(data: { userId?: string | null; unitId?: string | null; subjectId?: string | null; subUnitId?: string | null; teamId?: string | null; assignmentScope?: string | null }): string {
    if (data.assignmentScope && data.assignmentScope !== 'user') {
      return data.assignmentScope;
    }
    if (data.teamId) return 'team';
    if (data.subUnitId) return 'unit';
    if (data.subjectId) return 'subject';
    if (data.unitId && !data.userId) return 'department';
    if (data.userId) return 'user';
    return data.assignmentScope || 'organization';
  }

  static getAssignmentTargetKey(data: {
    courseId: string;
    organizationId: string;
    targetOrganizationId?: string | null;
    audience?: string | null;
    assignmentScope?: string | null;
    userId?: string | null;
    unitId?: string | null;
    subjectId?: string | null;
    subUnitId?: string | null;
    teamId?: string | null;
  }): string {
    const assignmentScope = this.inferAssignmentScope(data);
    return [
      data.courseId,
      data.organizationId,
      data.targetOrganizationId || '',
      data.audience || 'learner',
      assignmentScope,
      data.userId || '',
      data.unitId || '',
      data.subjectId || '',
      data.subUnitId || '',
      data.teamId || '',
    ].join('::');
  }

  static getDeliveryOrganizationId(data: {
    organizationId: string;
    targetOrganizationId?: string | null;
  }): string {
    return data.targetOrganizationId || data.organizationId;
  }

  static getNormalizedAssignmentUpdateData(
    data: InsertCourseAssignment,
    correctedScope: string
  ): Record<string, any> {
    const updateData: Record<string, any> = {
      userId: null,
      unitId: null,
      subjectId: null,
      subUnitId: null,
      teamId: null,
      assignmentScope: correctedScope,
    };

    if (data.userId) updateData.userId = data.userId;
    if (data.unitId) updateData.unitId = data.unitId;
    if (data.subjectId) updateData.subjectId = data.subjectId;
    if (data.subUnitId) updateData.subUnitId = data.subUnitId;
    if (data.teamId) updateData.teamId = data.teamId;

    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate;
    if (data.mandatory !== undefined) updateData.mandatory = data.mandatory;
    if (data.audience !== undefined) updateData.audience = data.audience;
    if (data.targetOrganizationId !== undefined) updateData.targetOrganizationId = data.targetOrganizationId;
    if (data.assignedBy !== undefined) updateData.assignedBy = data.assignedBy;

    return updateData;
  }

  private static courseAssignmentDeliveryCondition(organizationId: string) {
    return or(
      and(
        eq(courseAssignments.organizationId, organizationId),
        isNull(courseAssignments.targetOrganizationId)
      ),
      eq(courseAssignments.targetOrganizationId, organizationId)
    );
  }

  static async upsertCourseAssignment(
    data: InsertCourseAssignment
  ): Promise<CourseAssignment> {
    const { courseId, organizationId } = data;

    const correctedScope = this.inferAssignmentScope(data);
    if (correctedScope !== data.assignmentScope) {
      console.log(`[CourseAssignmentService] Auto-corrected assignmentScope from '${data.assignmentScope}' to '${correctedScope}' based on populated fields`);
      data = { ...data, assignmentScope: correctedScope as any };
    }
    
    const existingAssignments = await this.findExistingAssignmentsByCourse(courseId, organizationId);
    const incomingTargetKey = this.getAssignmentTargetKey(data);
    const matchingAssignments = existingAssignments.filter(
      (assignment) => this.getAssignmentTargetKey(assignment) === incomingTargetKey
    );
    
    if (matchingAssignments.length > 0) {
      const assignmentToUpdate = matchingAssignments[0];
      const updateData = this.getNormalizedAssignmentUpdateData(data, correctedScope);
      
      const [updated] = await db
        .update(courseAssignments)
        .set(updateData)
        .where(eq(courseAssignments.id, assignmentToUpdate.id))
        .returning();
      
      // Delete duplicate rows for the same exact assignment target, but preserve
      // other departments/users/teams for this course.
      if (matchingAssignments.length > 1) {
        const duplicateIds = matchingAssignments.slice(1).map(a => a.id);
        await db.delete(courseAssignments).where(inArray(courseAssignments.id, duplicateIds));
        console.log(`[CourseAssignmentService] Cleaned up ${duplicateIds.length} duplicate assignments for course ${courseId} target ${incomingTargetKey}`);
      }
      
      console.log(`[CourseAssignmentService] Updated existing assignment: ${updated.id} for course ${courseId}`);
      return updated;
    }

    const incomingIsUserAssignment = Boolean(data.userId);
    if (!incomingIsUserAssignment) {
      const sameCourseNonUserAssignments = existingAssignments.filter((assignment) =>
        !assignment.userId &&
        (assignment.targetOrganizationId || '') === (data.targetOrganizationId || '')
      );

      if (sameCourseNonUserAssignments.length > 0) {
        const assignmentToUpdate = sameCourseNonUserAssignments[0];
        const updateData = this.getNormalizedAssignmentUpdateData(data, correctedScope);

        const [updated] = await db
          .update(courseAssignments)
          .set(updateData)
          .where(eq(courseAssignments.id, assignmentToUpdate.id))
          .returning();

        if (sameCourseNonUserAssignments.length > 1) {
          const duplicateIds = sameCourseNonUserAssignments.slice(1).map(a => a.id);
          await db.delete(courseAssignments).where(inArray(courseAssignments.id, duplicateIds));
          console.log(`[CourseAssignmentService] Cleaned up ${duplicateIds.length} older non-user assignments for course ${courseId}`);
        }

        console.log(`[CourseAssignmentService] Replaced existing non-user assignment: ${updated.id} for course ${courseId}`);
        return updated;
      }
    }
    
    // No existing assignment, create new one
    const [assignment] = await db.insert(courseAssignments).values(data).returning();
    console.log(`[CourseAssignmentService] Created new assignment: ${assignment.id} for course ${courseId}`);
    return assignment;
  }

  /**
   * Get all course assignments for an organization with enriched data
   * Includes joined course title, unit name, subUnit name, and assignedBy user name
   */
  static async getCourseAssignmentsForOrgEnriched(organizationId: string): Promise<EnrichedCourseAssignment[]> {
    const results = await db
      .select({
        id: courseAssignments.id,
        courseId: courseAssignments.courseId,
        organizationId: courseAssignments.organizationId,
        assignedBy: courseAssignments.assignedBy,
        assignmentScope: courseAssignments.assignmentScope,
        userId: courseAssignments.userId,
        unitId: courseAssignments.unitId,
        subUnitId: courseAssignments.subUnitId,
        teamId: courseAssignments.teamId,
        audience: courseAssignments.audience,
        mandatory: courseAssignments.mandatory,
        dueDate: courseAssignments.dueDate,
        assignedAt: courseAssignments.assignedAt,
        createdAt: courseAssignments.createdAt,
        courseTitle: courses.title,
        unitName: organizationUnits.name,
        subUnitName: organizationSubUnits.name,
        teamName: organizationTeams.name,
        assignedByName: users.gamerName,
      })
      .from(courseAssignments)
      .leftJoin(courses, eq(courseAssignments.courseId, courses.id))
      .leftJoin(organizationUnits, eq(courseAssignments.unitId, organizationUnits.id))
      .leftJoin(organizationSubUnits, eq(courseAssignments.subUnitId, organizationSubUnits.id))
      .leftJoin(organizationTeams, eq(courseAssignments.teamId, organizationTeams.id))
      .leftJoin(users, eq(courseAssignments.assignedBy, users.id))
      .where(eq(courseAssignments.organizationId, organizationId));

    return results as EnrichedCourseAssignment[];
  }

  /**
   * Update a course assignment
   */
  static async updateCourseAssignment(
    id: string,
    organizationId: string,
    data: UpdateCourseAssignmentData
  ): Promise<CourseAssignment | null> {
    const updateData: Partial<Record<string, any>> = {};

    if (data.dueDate !== undefined) {
      updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    }
    if (data.mandatory !== undefined) {
      updateData.mandatory = data.mandatory;
    }
    
    // Handle assignmentScope with proper mutual exclusion
    // When assignmentScope is provided, it takes precedence and we set the appropriate IDs
    if (data.assignmentScope !== undefined) {
      updateData.assignmentScope = data.assignmentScope;
      
      // Clear all scope fields first, then set the appropriate ones based on scope
      switch (data.assignmentScope) {
        case 'organization':
          updateData.unitId = null;
          updateData.subUnitId = null;
          updateData.teamId = null;
          updateData.userId = null;
          break;
        case 'department':
          updateData.unitId = data.unitId ?? null;
          updateData.subUnitId = null;
          updateData.teamId = null;
          updateData.userId = null;
          break;
        case 'unit':
          updateData.unitId = data.unitId ?? null;
          updateData.subUnitId = data.subUnitId ?? null;
          updateData.teamId = null;
          updateData.userId = null;
          break;
        case 'team':
          updateData.unitId = data.unitId ?? null;
          updateData.subUnitId = data.subUnitId ?? null;
          updateData.teamId = data.teamId ?? null;
          updateData.userId = null;
          break;
        case 'user':
          updateData.unitId = null;
          updateData.subUnitId = null;
          updateData.teamId = null;
          updateData.userId = data.userId ?? null;
          break;
      }
    } else {
      // Legacy behavior for backward compatibility when assignmentScope is not provided
      if (data.userId !== undefined) {
        updateData.userId = data.userId;
        if (data.userId !== null) {
          updateData.unitId = null;
          updateData.subUnitId = null;
          updateData.teamId = null;
        }
      }
      if (data.unitId !== undefined) {
        updateData.unitId = data.unitId;
        if (data.unitId !== null) {
          updateData.userId = null;
          updateData.subUnitId = null;
          updateData.teamId = null;
        }
      }
      if (data.subUnitId !== undefined) {
        updateData.subUnitId = data.subUnitId;
        if (data.subUnitId !== null) {
          updateData.userId = null;
        }
      }
      if (data.teamId !== undefined) {
        updateData.teamId = data.teamId;
        if (data.teamId !== null) {
          updateData.userId = null;
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      const existing = await db.query.courseAssignments.findFirst({
        where: and(
          eq(courseAssignments.id, id),
          eq(courseAssignments.organizationId, organizationId)
        ),
      });
      return existing ?? null;
    }

    const result = await db
      .update(courseAssignments)
      .set(updateData)
      .where(
        and(
          eq(courseAssignments.id, id),
          eq(courseAssignments.organizationId, organizationId)
        )
      )
      .returning();

    if (result.length === 0) {
      return null;
    }

    console.log(`[CourseAssignmentService] Updated assignment: ${id}`);
    return result[0];
  }

  /**
   * Get course assignments for a specific user within an organization
   * This includes:
   * - Direct user assignments (userId matches)
   * - Unit-based assignments with HIERARCHICAL CASCADE (user is in the assigned unit OR any sub-unit/team under it)
   * - SubUnit-based assignments with HIERARCHICAL CASCADE (user is in the assigned sub-unit OR any team under it)
   * - Team-based assignments (user is in the assigned team)
   * - Organization-wide assignments (no userId, unitId, subUnitId, or teamId specified)
   * - Organization-scoped assignments (assignmentScope = 'organization')
   * 
   * HIERARCHICAL CASCADE BEHAVIOR:
   * - Department (unitId): Matches users in that department + users in any sub-units under it + users in any teams under those sub-units
   * - Unit (subUnitId): Matches users in that unit + users in any teams under it
   * - Team (teamId): Matches users in that team only
   * - Organization: Matches all users in the organization
   * 
   * Note: Deduplication is handled by callers (e.g., getAssignedCoursesWithProgress) using courseId
   */
  static async getCourseAssignmentsForUser(
    userId: string,
    organizationId: string
  ): Promise<CourseAssignment[]> {
    // Get user's organization assignments (unit, sub-unit, and team)
    const userAssignments = await db.query.userOrganizationAssignments.findMany({
      where: and(
        eq(userOrganizationAssignments.userId, userId),
        eq(userOrganizationAssignments.organizationId, organizationId)
      ),
    });

    const userUnitIds = userAssignments
      .map(a => a.unitId)
      .filter((id): id is string => id !== null);
    const userSubUnitIds = userAssignments
      .map(a => a.subUnitId)
      .filter((id): id is string => id !== null);
    const userTeamIds = userAssignments
      .map(a => a.teamId)
      .filter((id): id is string => id !== null);
    const userSubjectIds = userAssignments
      .map(a => a.subjectId)
      .filter((id): id is string => id !== null);

    // Get the parent hierarchy for user's sub-units (to know which departments they belong to)
    let subUnitParentUnitIds: string[] = [];
    if (userSubUnitIds.length > 0) {
      const subUnitsWithParents = await db
        .select({ unitId: organizationSubUnits.unitId })
        .from(organizationSubUnits)
        .where(inArray(organizationSubUnits.id, userSubUnitIds));
      subUnitParentUnitIds = subUnitsWithParents
        .map(s => s.unitId)
        .filter((id): id is string => id !== null);
    }

    // Get the parent hierarchy for user's teams (to know which sub-units and departments they belong to)
    let teamParentSubUnitIds: string[] = [];
    let teamParentUnitIds: string[] = [];
    if (userTeamIds.length > 0) {
      const teamsWithParents = await db
        .select({ subUnitId: organizationTeams.subUnitId })
        .from(organizationTeams)
        .where(inArray(organizationTeams.id, userTeamIds));
      teamParentSubUnitIds = teamsWithParents
        .map(t => t.subUnitId)
        .filter((id): id is string => id !== null);
      
      // Get the departments for these sub-units
      if (teamParentSubUnitIds.length > 0) {
        const subUnitsForTeams = await db
          .select({ unitId: organizationSubUnits.unitId })
          .from(organizationSubUnits)
          .where(inArray(organizationSubUnits.id, teamParentSubUnitIds));
        teamParentUnitIds = subUnitsForTeams
          .map(s => s.unitId)
          .filter((id): id is string => id !== null);
      }
    }

    // Build conditions for matching assignments
    const deliveryOrganizationCondition = this.courseAssignmentDeliveryCondition(organizationId);
    const conditions = [
      // Direct user assignment
      and(
        deliveryOrganizationCondition,
        eq(courseAssignments.userId, userId)
      ),
    ];

    // DEPARTMENT-SCOPED assignments (unitId set, subUnitId/teamId null)
    // With hierarchical cascade: match if user is in that department, or in any sub-unit under it, or in any team under those sub-units
    const allUserDepartmentIds = Array.from(new Set([
      ...userUnitIds,
      ...subUnitParentUnitIds,
      ...teamParentUnitIds
    ]));
    
    if (allUserDepartmentIds.length > 0) {
      conditions.push(
        and(
          deliveryOrganizationCondition,
          inArray(courseAssignments.unitId, allUserDepartmentIds),
          sql`${courseAssignments.userId} IS NULL`,
          sql`${courseAssignments.subjectId} IS NULL`,
          sql`${courseAssignments.subUnitId} IS NULL`,
          sql`${courseAssignments.teamId} IS NULL`
        )
      );
    }

    if (allUserDepartmentIds.length > 0 && userSubjectIds.length > 0) {
      conditions.push(
        and(
          deliveryOrganizationCondition,
          inArray(courseAssignments.unitId, allUserDepartmentIds),
          inArray(courseAssignments.subjectId, Array.from(new Set(userSubjectIds))),
          sql`${courseAssignments.userId} IS NULL`,
          sql`${courseAssignments.subUnitId} IS NULL`,
          sql`${courseAssignments.teamId} IS NULL`
        )
      );
    }

    // UNIT-SCOPED assignments (subUnitId set, teamId null)
    // With hierarchical cascade: match if user is in that sub-unit, or in any team under it
    const allUserSubUnitIds = Array.from(new Set([
      ...userSubUnitIds,
      ...teamParentSubUnitIds
    ]));
    
    if (allUserSubUnitIds.length > 0) {
      conditions.push(
        and(
          deliveryOrganizationCondition,
          inArray(courseAssignments.subUnitId, allUserSubUnitIds),
          sql`${courseAssignments.userId} IS NULL`,
          userSubjectIds.length > 0
            ? or(
                sql`${courseAssignments.subjectId} IS NULL`,
                inArray(courseAssignments.subjectId, Array.from(new Set(userSubjectIds)))
              )
            : sql`${courseAssignments.subjectId} IS NULL`,
          sql`${courseAssignments.teamId} IS NULL`
        )
      );
    }

    // TEAM-SCOPED assignments (teamId set)
    // No cascade - direct team match only
    if (userTeamIds.length > 0) {
      conditions.push(
        and(
          deliveryOrganizationCondition,
          inArray(courseAssignments.teamId, userTeamIds),
          userSubjectIds.length > 0
            ? or(
                sql`${courseAssignments.subjectId} IS NULL`,
                inArray(courseAssignments.subjectId, Array.from(new Set(userSubjectIds)))
              )
            : sql`${courseAssignments.subjectId} IS NULL`,
          sql`${courseAssignments.userId} IS NULL`
        )
      );
    }

    // Organization-wide assignments (no specific user, unit, sub-unit, or team)
    // Legacy check: all scope fields null
    conditions.push(
      and(
        deliveryOrganizationCondition,
        sql`${courseAssignments.userId} IS NULL`,
        sql`${courseAssignments.unitId} IS NULL`,
        sql`${courseAssignments.subjectId} IS NULL`,
        sql`${courseAssignments.subUnitId} IS NULL`,
        sql`${courseAssignments.teamId} IS NULL`
      )
    );

    // Organization-scoped assignments (explicitly set assignmentScope = 'organization')
    conditions.push(
      and(
        deliveryOrganizationCondition,
        eq(courseAssignments.assignmentScope, 'organization')
      )
    );

    const assignments = await db
      .select()
      .from(courseAssignments)
      .where(or(...conditions));

    return assignments;
  }

  /**
   * Delete a course assignment
   */
  static async deleteCourseAssignment(id: string, organizationId: string): Promise<boolean> {
    const result = await db
      .delete(courseAssignments)
      .where(
        and(
          eq(courseAssignments.id, id),
          eq(courseAssignments.organizationId, organizationId)
        )
      )
      .returning({ id: courseAssignments.id });

    const deleted = result.length > 0;
    if (deleted) {
      console.log(`[CourseAssignmentService] Deleted assignment: ${id}`);
    }
    return deleted;
  }

  /**
   * Get course progress for a specific user, course, and organization
   */
  static async getCourseProgress(
    userId: string,
    courseId: string,
    organizationId: string
  ): Promise<CourseProgress | null> {
    const progress = await db.query.courseProgress.findFirst({
      where: and(
        eq(courseProgress.userId, userId),
        eq(courseProgress.courseId, courseId),
        eq(courseProgress.organizationId, organizationId)
      ),
    });
    return progress ?? null;
  }

  /**
   * Create or update course progress (upsert)
   */
  static async upsertCourseProgress(data: InsertCourseProgress): Promise<CourseProgress> {
    const existing = await this.getCourseProgress(
      data.userId,
      data.courseId,
      data.organizationId
    );

    if (existing) {
      const [updated] = await db
        .update(courseProgress)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(courseProgress.id, existing.id))
        .returning();
      console.log(`[CourseAssignmentService] Updated progress: ${updated.id}`);
      return updated;
    }

    const [created] = await db.insert(courseProgress).values(data).returning();
    console.log(`[CourseAssignmentService] Created progress: ${created.id}`);
    return created;
  }

  /**
   * Update course progress with partial updates
   */
  static async updateCourseProgress(
    userId: string,
    courseId: string,
    organizationId: string,
    updates: Partial<InsertCourseProgress>
  ): Promise<CourseProgress> {
    const existing = await this.getCourseProgress(userId, courseId, organizationId);

    if (!existing) {
      throw new Error('Course progress not found');
    }

    const [updated] = await db
      .update(courseProgress)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(courseProgress.id, existing.id))
      .returning();

    console.log(`[CourseAssignmentService] Updated progress: ${updated.id}`);
    return updated;
  }

  /**
   * Get assigned courses with their progress for a user
   * Joins courseAssignments with courses and calculates progress using dual-mechanism logic
   * Progress is calculated using quiz passes, auto-complete for overview lessons, and lesson progress fallback
   */
  static async getAssignedCoursesWithProgress(
    userId: string,
    organizationId: string
  ): Promise<CourseWithProgress[]> {
    // Get all assignments for the user
    const assignments = await this.getCourseAssignmentsForUser(userId, organizationId);

    if (assignments.length === 0) {
      return [];
    }

    // Get unique course IDs
    const courseIds = Array.from(new Set(assignments.map(a => a.courseId)));

    // Fetch courses - only return active courses for learners
    const coursesData = await db
      .select({
        id: courses.id,
        title: courses.title,
        description: courses.description,
        thumbnailUrl: courses.thumbnailUrl,
        price: courses.price,
        currency: courses.currency,
        status: courses.status,
        difficultyLevel: courses.difficultyLevel,
        estimatedDuration: courses.estimatedDuration,
        visibility: courses.visibility,
        organizationId: courses.organizationId,
      })
      .from(courses)
      .where(and(inArray(courses.id, courseIds), eq(courses.status, 'active')));

    // Get active course IDs only
    const activeCourseIds = coursesData.map(c => c.id);

    // Calculate progress using dual-mechanism logic (quiz passes + auto-complete + lesson progress)
    const progressResults = await CourseService.calculateCourseProgressBatch(activeCourseIds, userId);

    // Fetch existing courseProgress records for additional metadata (lastAccessedAt, etc.)
    const progressData = await db
      .select()
      .from(courseProgress)
      .where(
        and(
          eq(courseProgress.userId, userId),
          eq(courseProgress.organizationId, organizationId),
          inArray(courseProgress.courseId, courseIds)
        )
      );

    // Create lookup maps
    const courseMap = new Map(coursesData.map(c => [c.id, c]));
    const existingProgressMap = new Map(progressData.map(p => [p.courseId, p]));

    // Build result with deduplication by courseId
    const seenCourseIds = new Set<string>();
    const result: CourseWithProgress[] = [];

    for (const assignment of assignments) {
      if (seenCourseIds.has(assignment.courseId)) {
        continue;
      }
      seenCourseIds.add(assignment.courseId);

      const course = courseMap.get(assignment.courseId);
      if (!course) {
        continue;
      }

      // Get calculated progress from dual-mechanism
      const calculatedProgress = progressResults.get(assignment.courseId);
      // Get existing courseProgress record for additional metadata
      const existingProgress = existingProgressMap.get(assignment.courseId);

      // Create a combined progress object with calculated values but existing metadata
      const combinedProgress: CourseProgress | null = existingProgress
        ? {
            ...existingProgress,
            // Override with calculated values from dual-mechanism
            completedLessons: calculatedProgress?.completedLessons ?? existingProgress.completedLessons,
            totalLessons: calculatedProgress?.totalLessons ?? existingProgress.totalLessons,
            percentComplete: calculatedProgress?.percentComplete ?? existingProgress.percentComplete,
            status: calculatedProgress?.status ?? existingProgress.status,
          }
        : calculatedProgress
          ? {
              id: null as unknown as string, // Synthetic record - no DB id exists yet
              userId,
              courseId: assignment.courseId,
              organizationId,
              completedLessons: calculatedProgress.completedLessons,
              totalLessons: calculatedProgress.totalLessons,
              percentComplete: calculatedProgress.percentComplete,
              status: calculatedProgress.status,
              startedAt: null,
              completedAt: null,
              lastAccessedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            }
          : null;

      result.push({
        assignment,
        course,
        progress: combinedProgress,
      });
    }

    return result;
  }

  /**
   * Get courses assigned to a specific organizational scope with optional hierarchical cascade DOWN
   * 
   * SCOPE MAPPING:
   * - department: matches unitId in courseAssignments
   * - unit: matches subUnitId in courseAssignments  
   * - team: matches teamId in courseAssignments
   * 
   * HIERARCHICAL CASCADE DOWN ONLY (when includeChildren = true):
   * - Department: includes assignments for child units (subUnits) and teams under those units
   * - Unit: includes assignments for child teams
   * - Team: no children, so no cascade
   * 
   * NOTE: Courses never cascade UP. A course assigned to a unit will NOT appear when
   * viewing the parent department. This ensures users only see courses specifically
   * assigned at their level or below.
   */
  static async getCoursesByScope(params: {
    organizationId: string;
    scopeType: 'department' | 'subject' | 'unit' | 'team';
    scopeId: string;
    subjectId?: string;
    includeChildren?: boolean;
    includeParents?: boolean;
  }): Promise<CourseWithAssignment[]> {
    // CASCADE DOWN: Courses assigned at higher levels cascade to all lower levels
    // - Department shows: department-level courses only (no upward cascade)
    // - Unit shows: unit-level courses + parent department courses (cascade down from department)
    // - Team shows: team-level courses + parent unit courses + grandparent department courses
    // includeChildren: also show assignments from child scopes (e.g., department shows unit+team assignments too)
    const { organizationId, scopeType, scopeId, subjectId, includeChildren = false } = params;

    const conditions: ReturnType<typeof and>[] = [];

    if (scopeType === 'department') {
      conditions.push(
        and(
          eq(courseAssignments.organizationId, organizationId),
          eq(courseAssignments.unitId, scopeId),
          isNull(courseAssignments.subjectId),
          eq(courseAssignments.assignmentScope, 'department')
        )
      );

      if (includeChildren) {
        const childSubUnits = await db
          .select({ id: organizationSubUnits.id })
          .from(organizationSubUnits)
          .where(eq(organizationSubUnits.unitId, scopeId));
        const childSubUnitIds = childSubUnits.map(s => s.id);

        if (childSubUnitIds.length > 0) {
          conditions.push(
            and(
              eq(courseAssignments.organizationId, organizationId),
              inArray(courseAssignments.subUnitId, childSubUnitIds),
              isNull(courseAssignments.subjectId),
              eq(courseAssignments.assignmentScope, 'unit')
            )
          );

          const childTeams = await db
            .select({ id: organizationTeams.id })
            .from(organizationTeams)
            .where(inArray(organizationTeams.subUnitId, childSubUnitIds));
          const childTeamIds = childTeams.map(t => t.id);

          if (childTeamIds.length > 0) {
            conditions.push(
              and(
                eq(courseAssignments.organizationId, organizationId),
                inArray(courseAssignments.teamId, childTeamIds),
                isNull(courseAssignments.subjectId),
                eq(courseAssignments.assignmentScope, 'team')
              )
            );
          }
        }
      }
    } else if (scopeType === 'subject') {
      const subjectLink = await db
        .select({ unitId: unitSubjects.unitId })
        .from(unitSubjects)
        .innerJoin(organizationUnits, eq(unitSubjects.unitId, organizationUnits.id))
        .where(and(
          eq(unitSubjects.subjectId, scopeId),
          eq(organizationUnits.organizationId, organizationId)
        ))
        .limit(1);

      if (subjectLink.length > 0) {
        conditions.push(
          and(
            eq(courseAssignments.organizationId, organizationId),
            eq(courseAssignments.unitId, subjectLink[0].unitId),
            eq(courseAssignments.subjectId, scopeId),
            eq(courseAssignments.assignmentScope, 'subject')
          )
        );

        conditions.push(
          and(
            eq(courseAssignments.organizationId, organizationId),
            eq(courseAssignments.unitId, subjectLink[0].unitId),
            isNull(courseAssignments.subjectId),
            eq(courseAssignments.assignmentScope, 'department')
          )
        );

        if (includeChildren) {
          const childSubUnits = await db
            .select({ id: organizationSubUnits.id })
            .from(organizationSubUnits)
            .where(eq(organizationSubUnits.unitId, subjectLink[0].unitId));
          const childSubUnitIds = childSubUnits.map(s => s.id);

          if (childSubUnitIds.length > 0) {
            conditions.push(
              and(
                eq(courseAssignments.organizationId, organizationId),
                inArray(courseAssignments.subUnitId, childSubUnitIds),
                eq(courseAssignments.subjectId, scopeId),
                eq(courseAssignments.assignmentScope, 'unit')
              )
            );
          }
        }
      }
    } else if (scopeType === 'unit') {
      conditions.push(
        and(
          eq(courseAssignments.organizationId, organizationId),
          eq(courseAssignments.subUnitId, scopeId),
          subjectId ? eq(courseAssignments.subjectId, subjectId) : isNull(courseAssignments.subjectId),
          eq(courseAssignments.assignmentScope, 'unit')
        )
      );

      // CASCADE DOWN from parent department: find the parent department for this sub-unit
      // and include department-level assignments that cascade to this unit
      const parentDepartment = await db
        .select({ unitId: organizationSubUnits.unitId })
        .from(organizationSubUnits)
        .where(eq(organizationSubUnits.id, scopeId))
        .limit(1);

      if (parentDepartment.length > 0 && parentDepartment[0].unitId) {
        conditions.push(
          and(
            eq(courseAssignments.organizationId, organizationId),
            eq(courseAssignments.unitId, parentDepartment[0].unitId),
            isNull(courseAssignments.subjectId),
            eq(courseAssignments.assignmentScope, 'department')
          )
        );
        if (subjectId) {
          conditions.push(
            and(
              eq(courseAssignments.organizationId, organizationId),
              eq(courseAssignments.unitId, parentDepartment[0].unitId),
              eq(courseAssignments.subjectId, subjectId),
              eq(courseAssignments.assignmentScope, 'subject')
            )
          );
        }
      }

      if (includeChildren) {
        const childTeams = await db
          .select({ id: organizationTeams.id })
          .from(organizationTeams)
          .where(eq(organizationTeams.subUnitId, scopeId));
        const childTeamIds = childTeams.map(t => t.id);

        if (childTeamIds.length > 0) {
          conditions.push(
            and(
              eq(courseAssignments.organizationId, organizationId),
              inArray(courseAssignments.teamId, childTeamIds),
              subjectId ? eq(courseAssignments.subjectId, subjectId) : isNull(courseAssignments.subjectId),
              eq(courseAssignments.assignmentScope, 'team')
            )
          );
        }
      }
    } else {
      conditions.push(
        and(
          eq(courseAssignments.organizationId, organizationId),
          eq(courseAssignments.teamId, scopeId),
          subjectId ? eq(courseAssignments.subjectId, subjectId) : isNull(courseAssignments.subjectId),
          eq(courseAssignments.assignmentScope, 'team')
        )
      );

      // CASCADE DOWN from parent unit: find the parent sub-unit for this team
      // and include unit-level assignments that cascade to this team
      const parentSubUnit = await db
        .select({ subUnitId: organizationTeams.subUnitId, })
        .from(organizationTeams)
        .where(eq(organizationTeams.id, scopeId))
        .limit(1);

      if (parentSubUnit.length > 0 && parentSubUnit[0].subUnitId) {
        conditions.push(
          and(
            eq(courseAssignments.organizationId, organizationId),
            eq(courseAssignments.subUnitId, parentSubUnit[0].subUnitId),
            subjectId ? eq(courseAssignments.subjectId, subjectId) : isNull(courseAssignments.subjectId),
            eq(courseAssignments.assignmentScope, 'unit')
          )
        );

        // CASCADE DOWN from grandparent department: find the department above the parent sub-unit
        const grandparentDepartment = await db
          .select({ unitId: organizationSubUnits.unitId })
          .from(organizationSubUnits)
          .where(eq(organizationSubUnits.id, parentSubUnit[0].subUnitId))
          .limit(1);

        if (grandparentDepartment.length > 0 && grandparentDepartment[0].unitId) {
          conditions.push(
            and(
              eq(courseAssignments.organizationId, organizationId),
              eq(courseAssignments.unitId, grandparentDepartment[0].unitId),
              isNull(courseAssignments.subjectId),
              eq(courseAssignments.assignmentScope, 'department')
            )
          );
          if (subjectId) {
            conditions.push(
              and(
                eq(courseAssignments.organizationId, organizationId),
                eq(courseAssignments.unitId, grandparentDepartment[0].unitId),
                eq(courseAssignments.subjectId, subjectId),
                eq(courseAssignments.assignmentScope, 'subject')
              )
            );
          }
        }
      }
    }

    // Query assignments with joined course data, filter by active status, order by title
    const assignmentResults = conditions.length > 0 ? await db
      .select({
        courseId: courses.id,
        courseTitle: courses.title,
        courseDescription: courses.description,
        courseThumbnailUrl: courses.thumbnailUrl,
        courseStatus: courses.status,
        courseDifficultyLevel: courses.difficultyLevel,
        assignmentId: courseAssignments.id,
        assignmentDueDate: courseAssignments.dueDate,
        assignmentMandatory: courseAssignments.mandatory,
        assignmentScope: courseAssignments.assignmentScope,
        assignedAt: courseAssignments.assignedAt,
        source: sql<string>`'assignment'`.as('source'),
      })
      .from(courseAssignments)
      .innerJoin(courses, eq(courseAssignments.courseId, courses.id))
      .where(
        and(
          or(...conditions),
          eq(courses.status, 'active')
        )
      )
      .orderBy(asc(courses.title)) : [];

    // courseAssignments is the single source of truth for course scope
    // No longer querying courses.unitId/subUnitId/teamId directly

    // Deduplicate by courseId (in case same course assigned at multiple scope levels)
    const seenCourseIds = new Set<string>();
    const dedupedResults: CourseWithAssignment[] = [];

    for (const row of assignmentResults) {
      if (seenCourseIds.has(row.courseId)) {
        continue;
      }
      seenCourseIds.add(row.courseId);

      dedupedResults.push({
        course: {
          id: row.courseId,
          title: row.courseTitle,
          description: row.courseDescription,
          thumbnailUrl: row.courseThumbnailUrl,
          status: row.courseStatus,
          difficultyLevel: row.courseDifficultyLevel,
        },
        assignment: {
          id: row.assignmentId,
          dueDate: row.assignmentDueDate,
          mandatory: row.assignmentMandatory,
          assignmentScope: row.assignmentScope,
          assignedAt: row.assignedAt,
        },
      });
    }

    return dedupedResults;
  }

  static async repairMisclassifiedScopes(): Promise<number> {
    const misclassified = await db
      .select({ id: courseAssignments.id, unitId: courseAssignments.unitId, subjectId: courseAssignments.subjectId, subUnitId: courseAssignments.subUnitId, teamId: courseAssignments.teamId, userId: courseAssignments.userId, assignmentScope: courseAssignments.assignmentScope })
      .from(courseAssignments)
      .where(
        and(
          eq(courseAssignments.assignmentScope, 'user'),
          isNull(courseAssignments.userId)
        )
      );

    let repaired = 0;
    for (const record of misclassified) {
      const correctedScope = this.inferAssignmentScope(record);
      if (correctedScope !== record.assignmentScope) {
        await db
          .update(courseAssignments)
          .set({ assignmentScope: correctedScope as any })
          .where(eq(courseAssignments.id, record.id));
        console.log(`[CourseAssignmentService] Repaired assignment ${record.id}: '${record.assignmentScope}' -> '${correctedScope}'`);
        repaired++;
      }
    }

    if (repaired > 0) {
      console.log(`[CourseAssignmentService] Repaired ${repaired} misclassified assignment scope(s)`);
    }
    return repaired;
  }
}
