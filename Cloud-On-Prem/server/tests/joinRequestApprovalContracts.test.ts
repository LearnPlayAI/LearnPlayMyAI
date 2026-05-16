import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { validateUnitSubjectAssignments } from '../services/joinRequestAssignmentValidationService';
import {
  joinRequests,
  organizations,
  organizationUnits,
  subjects,
  unitSubjects,
  users,
} from '@shared/schema';

describe('join request approval contracts', () => {
  let orgId = '';
  let reviewerId = '';
  let joiningUserId = '';
  let gradeUnitId = '';
  let otherGradeUnitId = '';
  let subjectId = '';

  beforeAll(async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const [reviewer] = await db.insert(users).values({
      gamerName: `approval_reviewer_${unique}`,
      email: `approval-reviewer-${unique}@test.local`,
      password: 'test-password',
      firstName: 'Approval',
      lastName: 'Reviewer',
      sessionVersion: 1,
    }).returning();
    reviewerId = reviewer.id;

    const [joiningUser] = await db.insert(users).values({
      gamerName: `approval_joiner_${unique}`,
      email: `approval-joiner-${unique}@test.local`,
      password: 'test-password',
      firstName: 'Approval',
      lastName: 'Joiner',
      sessionVersion: 1,
    }).returning();
    joiningUserId = joiningUser.id;

    const [org] = await db.insert(organizations).values({
      name: `Join Approval Org ${unique}`,
      inviteCode: `JA-${unique}`,
      type: 'education',
    }).returning();
    orgId = org.id;

    const [gradeUnit] = await db.insert(organizationUnits).values({
      organizationId: orgId,
      name: 'Grade 10',
      joinCode: `JA-${unique}-G10`,
      displayOrder: 10,
    }).returning();
    gradeUnitId = gradeUnit.id;

    const [otherGradeUnit] = await db.insert(organizationUnits).values({
      organizationId: orgId,
      name: 'Grade 11',
      joinCode: `JA-${unique}-G11`,
      displayOrder: 11,
    }).returning();
    otherGradeUnitId = otherGradeUnit.id;

    const [subject] = await db.insert(subjects).values({
      organizationId: orgId,
      unitId: gradeUnitId,
      name: 'Life Sciences',
      createdBy: reviewerId,
    }).returning();
    subjectId = subject.id;

    await db.insert(unitSubjects).values({
      unitId: gradeUnitId,
      subjectId,
    });
  });

  afterAll(async () => {
    await db.delete(joinRequests).where(eq(joinRequests.organizationId, orgId));
    await db.delete(unitSubjects).where(eq(unitSubjects.subjectId, subjectId));
    await db.delete(subjects).where(eq(subjects.organizationId, orgId));
    await db.delete(organizationUnits).where(eq(organizationUnits.organizationId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await db.delete(users).where(eq(users.id, joiningUserId));
    await db.delete(users).where(eq(users.id, reviewerId));
  });

  it('rejects subject ids that are not linked to the approved grade before approval mutates status', async () => {
    const [request] = await db.insert(joinRequests).values({
      userId: joiningUserId,
      organizationId: orgId,
      requestedUnitId: otherGradeUnitId,
      requestedSubjectIds: [subjectId],
      status: 'pending',
    }).returning();

    await expect(
      validateUnitSubjectAssignments({
        unitId: otherGradeUnitId,
        subjectIds: [subjectId],
      }),
    ).rejects.toThrow('not linked');

    const [unchangedRequest] = await db
      .select()
      .from(joinRequests)
      .where(eq(joinRequests.id, request.id))
      .limit(1);

    expect(unchangedRequest.status).toBe('pending');
  });

  it('validates final subject assignments before approving join requests in route flows', () => {
    const source = readFileSync(join(process.cwd(), 'server/routes/orgRoutes.ts'), 'utf8');
    const singleApproval = source.slice(
      source.indexOf('app.post("/api/org/join-requests/:id/approve"'),
      source.indexOf('app.post("/api/org/join-requests/bulk-approve"'),
    );
    const bulkApproval = source.slice(
      source.indexOf('app.post("/api/org/join-requests/bulk-approve"'),
      source.indexOf('app.post("/api/org/join-requests/bulk-deny"'),
    );

    expect(singleApproval.indexOf('validateUnitSubjectAssignments')).toBeGreaterThan(-1);
    expect(singleApproval.indexOf('validateUnitSubjectAssignments')).toBeLessThan(
      singleApproval.indexOf('storage.approveJoinRequest'),
    );
    expect(bulkApproval.indexOf('validateUnitSubjectAssignments')).toBeGreaterThan(-1);
    expect(bulkApproval.indexOf('validateUnitSubjectAssignments')).toBeLessThan(
      bulkApproval.indexOf('storage.approveJoinRequest'),
    );
  });

  it('keeps on-prem development role policy learner-safe for education organizations', () => {
    const source = readFileSync(join(process.cwd(), 'server/routes/orgRoutes.ts'), 'utf8');
    const helper = source.slice(
      source.indexOf('async function getDefaultRoleForApprovedJoinRequest'),
      source.indexOf('const orgRegistrationSchema'),
    );

    expect(helper).toContain("if (orgType === 'business')");
    expect(helper).toContain("return 'team_lead'");
    expect(helper).toContain("orgType === 'education' ? 'student' : 'learner'");
    expect(helper).not.toContain("orgType === 'business' ? 'team_lead' : 'teacher'");
  });
});
