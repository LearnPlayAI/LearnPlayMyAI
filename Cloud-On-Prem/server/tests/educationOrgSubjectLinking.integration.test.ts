import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { storage } from '../storage';
import {
  organizations,
  organizationUnits,
  subjects,
  unitSubjects,
  users,
} from '@shared/schema';

describe('education organization subject linking contracts', () => {
  let orgId = '';
  let userId = '';
  let gradeUnitId = '';

  beforeAll(async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const [user] = await db.insert(users).values({
      gamerName: `subject_link_user_${unique}`,
      email: `subject-link-${unique}@test.local`,
      password: 'test-password',
      firstName: 'Subject',
      lastName: 'Linker',
      sessionVersion: 1,
    }).returning();
    userId = user.id;

    const [org] = await db.insert(organizations).values({
      name: `Education Subject Link Org ${unique}`,
      inviteCode: `ESL-${unique}`,
      type: 'education',
    }).returning();
    orgId = org.id;

    const [unit] = await db.insert(organizationUnits).values({
      organizationId: orgId,
      name: 'Grade 10',
      joinCode: `ESL-${unique}-G10`,
      displayOrder: 10,
    }).returning();
    gradeUnitId = unit.id;
  });

  afterAll(async () => {
    await db.delete(unitSubjects).where(eq(unitSubjects.unitId, gradeUnitId));
    await db.delete(subjects).where(eq(subjects.organizationId, orgId));
    await db.delete(organizationUnits).where(eq(organizationUnits.organizationId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('links manually created education subjects to their selected grade', async () => {
    const subject = await storage.createSubject({
      organizationId: orgId,
      unitId: gradeUnitId,
      name: 'Physical Sciences',
      description: 'Grade 10 science subject',
      createdBy: userId,
    });

    const linkedSubjects = await storage.getUnitSubjects(gradeUnitId);

    expect(linkedSubjects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subjectId: subject.id,
          subjectName: 'Physical Sciences',
          unitId: gradeUnitId,
        }),
      ]),
    );
  });
});
