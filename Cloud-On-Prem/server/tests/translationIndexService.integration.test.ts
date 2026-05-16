import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { createHash, randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { courses, organizations, users, translationIndexFailures, translationIndexJobs, translationSearchDocuments } from "@shared/schema";
import { TranslationIndexService } from "../services/translationIndexService";

describe("TranslationIndexService integration", () => {
  let orgId = "";
  let userId = "";
  let courseId = "";

  beforeAll(async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [user] = await db.insert(users).values({
      gamerName: `idx_user_${unique}`,
      email: `idx-${unique}@test.local`,
      password: "test-password",
      firstName: "Index",
      lastName: "Test",
      sessionVersion: 1,
    }).returning();
    userId = user.id;

    const [org] = await db.insert(organizations).values({
      name: `Index Org ${unique}`,
      inviteCode: `IDX-${unique}`,
      type: "education",
    }).returning();
    orgId = org.id;

    const [course] = await db.insert(courses).values({
      title: `Indexed Course ${unique}`,
      description: "Indexing integration test",
      organizationId: orgId,
      createdBy: userId,
      currency: "ZAR",
      price: "0",
      languageCode: "en",
      contentGroupId: randomUUID(),
      isDefaultLanguage: true,
      status: "active",
      visibility: "public",
    }).returning();
    courseId = course.id;
  });

  afterAll(async () => {
    await db.delete(translationSearchDocuments).where(eq(translationSearchDocuments.entityId, courseId));
    await db.delete(translationIndexFailures).where(eq(translationIndexFailures.organizationId, orgId));
    await db.delete(translationIndexJobs).where(eq(translationIndexJobs.organizationId, orgId));
    await db.delete(courses).where(eq(courses.id, courseId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("deduplicates enqueued jobs and indexes translated search document", async () => {
    const seed = `course-create-${courseId}`;
    const first = await TranslationIndexService.enqueue({
      organizationId: orgId,
      entityType: "course",
      entityId: courseId,
      eventType: "create",
      languageCode: "en",
      dedupeSeed: seed,
    });

    const second = await TranslationIndexService.enqueue({
      organizationId: orgId,
      entityType: "course",
      entityId: courseId,
      eventType: "create",
      languageCode: "en",
      dedupeSeed: seed,
    });

    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);

    const processed = await TranslationIndexService.processQueue();
    expect(processed.processed).toBeGreaterThanOrEqual(1);

    const [doc] = await db.select().from(translationSearchDocuments).where(and(
      eq(translationSearchDocuments.entityType, "course"),
      eq(translationSearchDocuments.entityId, courseId),
      eq(translationSearchDocuments.languageCode, "en"),
    )).limit(1);

    expect(doc).toBeTruthy();
    expect(String(doc.title || "")).toContain("Indexed Course");
  });

  it("persists failure state and supports dead-letter replay", async () => {
    const originalBuildSnapshot = (TranslationIndexService as any).buildSnapshot;
    (TranslationIndexService as any).buildSnapshot = async () => {
      throw new Error("forced indexing failure");
    };

    const failSeed = `forced-fail-${Date.now()}`;
    await TranslationIndexService.enqueue({
      organizationId: orgId,
      entityType: "course",
      entityId: courseId,
      eventType: "update",
      languageCode: "en",
      dedupeSeed: failSeed,
    });

    for (let i = 0; i < 5; i += 1) {
      await TranslationIndexService.processQueue(10);
    }

    const [failedJob] = await db.select().from(translationIndexJobs).where(eq(translationIndexJobs.dedupeKey, firstDedupeKey(orgId, "course", courseId, "update", "en", "", failSeed))).limit(1);
    expect(failedJob).toBeTruthy();
    expect(["failed", "dead_letter"]).toContain(String(failedJob.status));

    const failures = await db.select().from(translationIndexFailures).where(eq(translationIndexFailures.jobId, failedJob.id));
    expect(failures.length).toBeGreaterThan(0);

    if (String(failedJob.status) === "dead_letter") {
      const replayCount = await TranslationIndexService.replayDeadLetters(10);
      expect(replayCount).toBeGreaterThanOrEqual(1);
    }

    (TranslationIndexService as any).buildSnapshot = originalBuildSnapshot;
  });
});

function firstDedupeKey(
  organizationId: string,
  entityType: string,
  entityId: string,
  eventType: string,
  languageCode: string,
  contentGroupId: string,
  seed: string,
): string {
  const raw = [organizationId, entityType, entityId, eventType, languageCode, contentGroupId, seed].join(":");
  return createHash("sha256").update(raw).digest("hex");
}
