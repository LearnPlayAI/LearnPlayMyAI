import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { db } from "../db";
import { users, organizations, userOrganizationRoles, lessons } from "@shared/schema";
import { eq } from "drizzle-orm";
import { canUserPlayLessonPodcast } from "../routes/courseRoutes";

describe("Podcast playback access", () => {
  let testUser: any;
  let outsiderUser: any;
  let testOrg: any;
  let testLesson: any;

  beforeEach(async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    [testUser] = await db.insert(users).values({
      gamerName: `podcast_access_${unique}`,
      email: `podcast-access-${unique}@test.local`,
      password: "test-password",
      firstName: "Podcast",
      lastName: "Access",
      sessionVersion: 1,
    }).returning();

    [outsiderUser] = await db.insert(users).values({
      gamerName: `podcast_outsider_${unique}`,
      email: `podcast-outsider-${unique}@test.local`,
      password: "test-password",
      firstName: "Outside",
      lastName: "User",
      sessionVersion: 1,
    }).returning();

    [testOrg] = await db.insert(organizations).values({
      name: `Podcast Access Org ${unique}`,
      inviteCode: `PODACC-${unique}`,
      type: "education",
    }).returning();

    await db.insert(userOrganizationRoles).values({
      userId: testUser.id,
      organizationId: testOrg.id,
      role: "org_admin",
    });

    [testLesson] = await db.insert(lessons).values({
      organizationId: testOrg.id,
      createdBy: testUser.id,
      title: "Podcast Access Lesson",
      generationStatus: "completed",
    }).returning();
  });

  afterEach(async () => {
    if (testLesson?.id) {
      await db.delete(lessons).where(eq(lessons.id, testLesson.id));
    }
    if (testOrg?.id) {
      await db.delete(userOrganizationRoles).where(eq(userOrganizationRoles.organizationId, testOrg.id));
      await db.delete(organizations).where(eq(organizations.id, testOrg.id));
    }
    if (testUser?.id) {
      await db.delete(users).where(eq(users.id, testUser.id));
    }
    if (outsiderUser?.id) {
      await db.delete(users).where(eq(users.id, outsiderUser.id));
    }
  });

  it("allows org staff users to play non-overview lesson podcasts", async () => {
    const req = { session: { userId: testUser.id } } as any;
    const result = await canUserPlayLessonPodcast(req, testLesson.id);
    expect(result.allowed).toBe(true);
    expect(result.isOverview).toBe(false);
  });

  it("denies cross-tenant user without enrollment or staff role", async () => {
    const req = { session: { userId: outsiderUser.id } } as any;
    const result = await canUserPlayLessonPodcast(req, testLesson.id);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Enrollment or access is required/i);
  });
});
