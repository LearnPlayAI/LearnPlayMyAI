import { eq, isNull, inArray } from "drizzle-orm";
import { db } from "../db";
import { courses, lessons, quizCollections, lessonTranslationJobs } from "@shared/schema";

type RunMode = "dry-run" | "live";

const mode: RunMode = process.argv.includes("--live") ? "live" : "dry-run";

async function reconcileCourses() {
  const missingLanguage = await db
    .select({ id: courses.id })
    .from(courses)
    .where(isNull(courses.languageCode));
  const missingGroup = await db
    .select({ id: courses.id })
    .from(courses)
    .where(isNull(courses.contentGroupId));

  if (mode === "live") {
    if (missingLanguage.length > 0) {
      await db
        .update(courses)
        .set({ languageCode: "en", updatedAt: new Date() })
        .where(isNull(courses.languageCode));
    }
    for (const row of missingGroup) {
      await db
        .update(courses)
        .set({ contentGroupId: row.id, updatedAt: new Date() })
        .where(eq(courses.id, row.id));
    }
  }

  return {
    table: "courses",
    missingLanguageCode: missingLanguage.length,
    missingContentGroupId: missingGroup.length,
    languageBackfilled: mode === "live" ? missingLanguage.length : 0,
    contentGroupBackfilled: mode === "live" ? missingGroup.length : 0,
  };
}

async function reconcileLessons() {
  const missingLanguage = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(isNull(lessons.languageCode));
  const missingGroup = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(isNull(lessons.contentGroupId));

  if (mode === "live") {
    if (missingLanguage.length > 0) {
      await db
        .update(lessons)
        .set({ languageCode: "en", updatedAt: new Date() })
        .where(isNull(lessons.languageCode));
    }
    for (const row of missingGroup) {
      await db
        .update(lessons)
        .set({ contentGroupId: row.id, updatedAt: new Date() })
        .where(eq(lessons.id, row.id));
    }
  }

  return {
    table: "lessons",
    missingLanguageCode: missingLanguage.length,
    missingContentGroupId: missingGroup.length,
    languageBackfilled: mode === "live" ? missingLanguage.length : 0,
    contentGroupBackfilled: mode === "live" ? missingGroup.length : 0,
  };
}

async function reconcileQuizCollections() {
  const missingLanguage = await db
    .select({ id: quizCollections.id })
    .from(quizCollections)
    .where(isNull(quizCollections.languageCode));
  const missingGroup = await db
    .select({ id: quizCollections.id })
    .from(quizCollections)
    .where(isNull(quizCollections.contentGroupId));

  if (mode === "live") {
    if (missingLanguage.length > 0) {
      await db
        .update(quizCollections)
        .set({ languageCode: "en", updatedAt: new Date() })
        .where(isNull(quizCollections.languageCode));
    }
    for (const row of missingGroup) {
      await db
        .update(quizCollections)
        .set({ contentGroupId: row.id, updatedAt: new Date() })
        .where(eq(quizCollections.id, row.id));
    }
  }

  return {
    table: "quizCollections",
    missingLanguageCode: missingLanguage.length,
    missingContentGroupId: missingGroup.length,
    languageBackfilled: mode === "live" ? missingLanguage.length : 0,
    contentGroupBackfilled: mode === "live" ? missingGroup.length : 0,
  };
}

async function reconcileOrphanTranslationJobs() {
  const jobs = await db
    .select({
      id: lessonTranslationJobs.id,
      lessonId: lessonTranslationJobs.lessonId,
      status: lessonTranslationJobs.status,
    })
    .from(lessonTranslationJobs);

  const lessonIds = Array.from(new Set(jobs.map((job) => job.lessonId).filter(Boolean))) as string[];
  const existingLessonIds = lessonIds.length > 0
    ? new Set(
        (await db.select({ id: lessons.id }).from(lessons).where(inArray(lessons.id, lessonIds))).map((row) => row.id)
      )
    : new Set<string>();

  const orphanJobs = jobs.filter((job) => !job.lessonId || !existingLessonIds.has(job.lessonId));

  if (mode === "live") {
    for (const orphan of orphanJobs) {
      if (String(orphan.status || "").toLowerCase() === "completed") continue;
      await db
        .update(lessonTranslationJobs)
        .set({
          status: "failed",
          errorMessage: "Reconciliation marked orphaned translation job (lesson missing).",
          updatedAt: new Date(),
        })
        .where(eq(lessonTranslationJobs.id, orphan.id));
    }
  }

  return {
    orphanJobsDetected: orphanJobs.length,
    orphanJobsMarkedFailed: mode === "live"
      ? orphanJobs.filter((job) => String(job.status || "").toLowerCase() !== "completed").length
      : 0,
  };
}

async function main() {
  const start = Date.now();
  console.log(`[reconcileTranslationRecords] Starting in ${mode} mode...`);

  const results = await Promise.all([
    reconcileCourses(),
    reconcileLessons(),
    reconcileQuizCollections(),
  ]);
  const orphanSummary = await reconcileOrphanTranslationJobs();

  const output = {
    mode,
    durationMs: Date.now() - start,
    results,
    orphanSummary,
    rollbackHint: mode === "live"
      ? "Use a DB backup/PITR snapshot created immediately before this run."
      : "Dry-run only. Re-run with --live to apply changes.",
  };

  console.log(JSON.stringify(output, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[reconcileTranslationRecords] Failed:", error);
    process.exit(1);
  });

