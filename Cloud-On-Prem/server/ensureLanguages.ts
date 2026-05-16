import { db } from './db';
import { supportedLanguages, lessons, courses } from '@shared/schema';
import { eq, isNull, sql } from 'drizzle-orm';

const LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', region: 'Global', sortOrder: 0 },
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans', region: 'Africa', sortOrder: 1 },
  { code: 'zu', name: 'isiZulu', nativeName: 'isiZulu', region: 'Africa', sortOrder: 2 },
  { code: 'xh', name: 'isiXhosa', nativeName: 'isiXhosa', region: 'Africa', sortOrder: 3 },
  { code: 'sw', name: 'Kiswahili', nativeName: 'Kiswahili', region: 'Africa', sortOrder: 4 },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', region: 'Middle East', sortOrder: 5 },
  { code: 'fr', name: 'French', nativeName: 'Français', region: 'Europe', sortOrder: 6 },
  { code: 'de', name: 'German', nativeName: 'Deutsch', region: 'Europe', sortOrder: 7 },
  { code: 'es', name: 'Spanish', nativeName: 'Español', region: 'Europe', sortOrder: 8 },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', region: 'Europe', sortOrder: 9 },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', region: 'Europe', sortOrder: 10 },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', region: 'Europe', sortOrder: 11 },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', region: 'Europe', sortOrder: 12 },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', region: 'Europe', sortOrder: 13 },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', region: 'Europe', sortOrder: 14 },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština', region: 'Europe', sortOrder: 15 },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', region: 'Europe', sortOrder: 16 },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', region: 'Europe', sortOrder: 17 },
  { code: 'da', name: 'Danish', nativeName: 'Dansk', region: 'Europe', sortOrder: 18 },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi', region: 'Europe', sortOrder: 19 },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina', region: 'Europe', sortOrder: 20 },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български', region: 'Europe', sortOrder: 21 },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski', region: 'Europe', sortOrder: 22 },
  { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių', region: 'Europe', sortOrder: 23 },
  { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina', region: 'Europe', sortOrder: 24 },
  { code: 'lv', name: 'Latvian', nativeName: 'Latviešu', region: 'Europe', sortOrder: 25 },
  { code: 'et', name: 'Estonian', nativeName: 'Eesti', region: 'Europe', sortOrder: 26 },
  { code: 'ga', name: 'Irish', nativeName: 'Gaeilge', region: 'Europe', sortOrder: 27 },
  { code: 'mt', name: 'Maltese', nativeName: 'Malti', region: 'Europe', sortOrder: 28 },
];

export async function ensureSupportedLanguages(): Promise<{
  languagesCreated: number;
  languagesUpserted: number;
}> {
  console.log('🌍 Ensuring supported languages are initialized...');

  let languagesCreated = 0;
  let languagesUpserted = 0;

  await db.transaction(async (tx) => {
    // Serialize startup language seeding across clustered instances.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('ensureSupportedLanguages_v1'))`);

    const count = await tx
      .select({ count: sql<number>`count(*)` })
      .from(supportedLanguages);

    const isEmpty = count[0]?.count === 0;
    if (isEmpty) {
      console.log('  📝 Table is empty, inserting all languages...');
    } else {
      console.log('  🧹 De-duplicating any historical duplicate language codes...');
      try {
        await tx.execute(sql`
          DELETE FROM "supportedLanguages" a
          USING "supportedLanguages" b
          WHERE a.code = b.code
            AND a.ctid < b.ctid
        `);
      } catch (error) {
        console.warn('  ⚠️ Duplicate cleanup skipped:', error);
      }
    }

    console.log('  📝 Canonicalizing language rows...');
    for (const lang of LANGUAGES) {
      try {
        const updated = await tx
          .update(supportedLanguages)
          .set({
            name: lang.name,
            nativeName: lang.nativeName,
            region: lang.region,
            isActive: true,
            sortOrder: lang.sortOrder,
          })
          .where(eq(supportedLanguages.code, lang.code))
          .returning({ code: supportedLanguages.code });

        if (updated.length === 0) {
          await tx.insert(supportedLanguages).values({
            code: lang.code,
            name: lang.name,
            nativeName: lang.nativeName,
            region: lang.region,
            isActive: true,
            sortOrder: lang.sortOrder,
          });
          languagesCreated++;
        } else {
          languagesUpserted++;
        }
      } catch (error) {
        console.error(`  ✗ Error canonicalizing language ${lang.code}:`, error);
      }
    }
  });
  console.log(`  ✓ Created ${languagesCreated}, canonicalized ${languagesUpserted}`);

  const summary = { languagesCreated, languagesUpserted };
  console.log(`✅ Language initialization complete:`, summary);
  return summary;
}

export async function backfillContentGroupIds(): Promise<{
  lessonsUpdated: number;
  coursesUpdated: number;
}> {
  console.log('📋 Backfilling contentGroupIds...');

  let lessonsUpdated = 0;
  let coursesUpdated = 0;

  try {
    const lessonsResult = await db.execute(sql`
      UPDATE "lessons"
      SET "contentGroupId" = "id",
          "languageCode" = COALESCE("languageCode", 'en'),
          "isDefaultLanguage" = COALESCE("isDefaultLanguage", true)
      WHERE "contentGroupId" IS NULL
    `);
    lessonsUpdated = lessonsResult.rowCount || 0;
    console.log(`  ✓ Updated ${lessonsUpdated} lessons`);
  } catch (error) {
    console.error('  ✗ Error updating lessons:', error);
  }

  try {
    const coursesResult = await db.execute(sql`
      UPDATE "courses"
      SET "contentGroupId" = "id",
          "languageCode" = COALESCE("languageCode", 'en'),
          "isDefaultLanguage" = COALESCE("isDefaultLanguage", true)
      WHERE "contentGroupId" IS NULL
    `);
    coursesUpdated = coursesResult.rowCount || 0;
    console.log(`  ✓ Updated ${coursesUpdated} courses`);
  } catch (error) {
    console.error('  ✗ Error updating courses:', error);
  }

  const summary = { lessonsUpdated, coursesUpdated };
  console.log(`✅ Contentgroup ID backfill complete:`, summary);
  return summary;
}
