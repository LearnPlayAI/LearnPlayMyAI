import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { organizations, users, translationAnalyticsEvents } from "@shared/schema";
import { TranslationAnalyticsService } from "../services/translationAnalyticsService";

describe("TranslationAnalyticsService integration", () => {
  let orgId = "";
  let userId = "";

  beforeAll(async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const [user] = await db.insert(users).values({
      gamerName: `analytics_user_${unique}`,
      email: `analytics-${unique}@test.local`,
      password: "test-password",
      firstName: "Analytics",
      lastName: "Tester",
      sessionVersion: 1,
    }).returning();
    userId = user.id;

    const [org] = await db.insert(organizations).values({
      name: `Analytics Org ${unique}`,
      inviteCode: `AN-${unique}`,
      type: "education",
    }).returning();
    orgId = org.id;
  });

  afterAll(async () => {
    await db.delete(translationAnalyticsEvents).where(eq(translationAnalyticsEvents.organizationId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("deduplicates events and returns language-segmented summary", async () => {
    const dedupeSeed = `summary-seed-${Date.now()}`;

    await TranslationAnalyticsService.trackEvent({
      organizationId: orgId,
      userId,
      eventType: "content_view",
      resourceType: "lesson",
      resourceId: "lesson-1",
      languageCode: "nl",
      variantId: "lesson-1-nl",
      contentGroupId: "cg-lesson-1",
      dedupeSeed,
    });

    await TranslationAnalyticsService.trackEvent({
      organizationId: orgId,
      userId,
      eventType: "content_view",
      resourceType: "lesson",
      resourceId: "lesson-1",
      languageCode: "nl",
      variantId: "lesson-1-nl",
      contentGroupId: "cg-lesson-1",
      dedupeSeed,
    });

    await TranslationAnalyticsService.trackEvent({
      organizationId: orgId,
      userId,
      eventType: "podcast_play",
      resourceType: "podcast",
      resourceId: "lesson-1",
      languageCode: "en",
      variantId: "podcast-v1",
      contentGroupId: "cg-lesson-1",
      dedupeSeed: `podcast-${Date.now()}`,
    });

    const summary = await TranslationAnalyticsService.getLanguageSummary({ organizationId: orgId });

    const nlContentView = summary.find((row) => row.languageCode === "nl" && row.eventType === "content_view");
    expect(nlContentView).toBeTruthy();
    expect(nlContentView?.totalEvents).toBe(1);
    expect(nlContentView?.dedupedEvents).toBeGreaterThanOrEqual(1);

    const enPodcastPlay = summary.find((row) => row.languageCode === "en" && row.eventType === "podcast_play");
    expect(enPodcastPlay).toBeTruthy();
    expect(enPodcastPlay?.totalEvents).toBe(1);
  });
});
