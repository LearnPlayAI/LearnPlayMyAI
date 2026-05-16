import { db } from './db';
import { sql } from 'drizzle-orm';

/**
 * Performs data integrity checks on startup to detect orphaned assignments
 * These checks help prevent the "quiz lobby bug" where students can't see quizzes
 * because of mismatched relationships between tables.
 */
export async function performDataIntegrityCheck() {
  console.log('🔍 Running data integrity checks...');
  
  let warningsFound = 0;
  
  try {
    // Check 1: Find student enrollments where subjectId doesn't exist in unitSubjects for their unitId
    const orphanedStudentAssignments = await db.execute(sql`
      SELECT 
        uoa.id,
        uoa."userId",
        uoa."unitId",
        uoa."subjectId",
        u."gamerName" as username
      FROM "userOrganizationAssignments" uoa
      LEFT JOIN users u ON uoa."userId" = u.id
      WHERE uoa."subjectId" IS NOT NULL
        AND uoa."unitId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "unitSubjects" us
          WHERE us."unitId" = uoa."unitId"
            AND us."subjectId" = uoa."subjectId"
        )
      LIMIT 10;
    `);
    
    if (orphanedStudentAssignments.rows.length > 0) {
      console.warn(`⚠️  Found ${orphanedStudentAssignments.rows.length} orphaned student enrollments:`);
      orphanedStudentAssignments.rows.forEach((row: any) => {
        console.warn(`   - User "${row.username}" (${row.userId}): assigned to subject ${row.subjectId} for unit ${row.unitId}, but this combination does not exist in unitSubjects`);
      });
      console.warn('   💡 These students may not see quiz assignments correctly.');
      console.warn('   💡 Fix: Ensure subjects are linked to units in unitSubjects table before assigning to students.');
      console.warn('');
      warningsFound += orphanedStudentAssignments.rows.length;
    }
    
    // Check 2: Find quiz assignments where unitId+subjectId do not exist in unitSubjects
    const orphanedQuizAssignments = await db.execute(sql`
      SELECT 
        qca.id,
        qca."collectionId",
        qca."unitId",
        qca."subjectId",
        qc.name as quiz_name
      FROM "quizCollectionAssignments" qca
      LEFT JOIN "quizCollections" qc ON qca."collectionId" = qc.id
      WHERE qca."subjectId" IS NOT NULL
        AND qca."unitId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "unitSubjects" us
          WHERE us."unitId" = qca."unitId"
            AND us."subjectId" = qca."subjectId"
        )
      LIMIT 10;
    `);
    
    if (orphanedQuizAssignments.rows.length > 0) {
      console.warn(`⚠️  Found ${orphanedQuizAssignments.rows.length} orphaned quiz assignments:`);
      orphanedQuizAssignments.rows.forEach((row: any) => {
        console.warn(`   - Quiz "${row.quiz_name}" (${row.collectionId}): assigned to unit ${row.unitId} + subject ${row.subjectId}, but this combination does not exist in unitSubjects`);
      });
      console.warn('   💡 Students enrolled in these grades/subjects will not see these quizzes.');
      console.warn('   💡 Fix: Either create unitSubjects link or remove/update the quiz assignment.');
      console.warn('');
      warningsFound += orphanedQuizAssignments.rows.length;
    }
    
    // Check 3: Find orphaned unitSubjects where subjectId doesn't exist in subjects table
    const orphanedUnitSubjects = await db.execute(sql`
      SELECT 
        us.id,
        us."unitId",
        us."subjectId",
        u.name as unit_name
      FROM "unitSubjects" us
      LEFT JOIN "organizationUnits" u ON us."unitId" = u.id
      LEFT JOIN subjects s ON us."subjectId" = s.id
      WHERE s.id IS NULL
      LIMIT 10;
    `);
    
    if (orphanedUnitSubjects.rows.length > 0) {
      console.warn(`⚠️  Found ${orphanedUnitSubjects.rows.length} orphaned unitSubjects (subject deleted but link remains):`);
      orphanedUnitSubjects.rows.forEach((row: any) => {
        console.warn(`   - Unit "${row.unit_name}" (${row.unitId}): linked to deleted subject ${row.subjectId}`);
      });
      console.warn('   💡 These cause React duplicate key warnings and should be cleaned up.');
      console.warn('   💡 Fix: Run DELETE FROM "unitSubjects" WHERE id IN (...orphaned ids...)');
      console.warn('');
      warningsFound += orphanedUnitSubjects.rows.length;
    }
    
    // Check 4: Find orphaned lesson scope assignments where unit+subject combo doesn't exist in unitSubjects
    const orphanedLessonAssignments = await db.execute(sql`
      SELECT 
        lsa.id,
        lsa."lessonId",
        lsa."unitId",
        lsa."subjectId",
        l.title as lesson_title
      FROM "lessonScopeAssignments" lsa
      LEFT JOIN lessons l ON lsa."lessonId" = l.id
      WHERE lsa."subjectId" IS NOT NULL
        AND lsa."unitId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "unitSubjects" us
          WHERE us."unitId" = lsa."unitId"
            AND us."subjectId" = lsa."subjectId"
        )
      LIMIT 10;
    `);
    
    if (orphanedLessonAssignments.rows.length > 0) {
      console.warn(`⚠️  Found ${orphanedLessonAssignments.rows.length} orphaned lesson scope assignments:`);
      orphanedLessonAssignments.rows.forEach((row: any) => {
        console.warn(`   - Lesson "${row.lesson_title}" (${row.lessonId}): assigned to unit ${row.unitId} + subject ${row.subjectId}, but this combination does not exist in unitSubjects`);
      });
      console.warn('   💡 Students will not see these lesson assignments.');
      console.warn('   💡 Fix: Either create unitSubjects link or remove/update the lesson assignment.');
      console.warn('');
      warningsFound += orphanedLessonAssignments.rows.length;
    }
    
    // Check 5: Find orphaned userOrganizationAssignments where subjectId doesn't exist in subjects table
    const orphanedUserSubjects = await db.execute(sql`
      SELECT 
        uoa.id,
        uoa."userId",
        uoa."subjectId",
        u."gamerName" as username
      FROM "userOrganizationAssignments" uoa
      LEFT JOIN users u ON uoa."userId" = u.id
      LEFT JOIN subjects s ON uoa."subjectId" = s.id
      WHERE uoa."subjectId" IS NOT NULL
        AND s.id IS NULL
      LIMIT 10;
    `);
    
    if (orphanedUserSubjects.rows.length > 0) {
      console.warn(`⚠️  Found ${orphanedUserSubjects.rows.length} orphaned user subject assignments (subject deleted):`);
      orphanedUserSubjects.rows.forEach((row: any) => {
        console.warn(`   - User "${row.username}" (${row.userId}): assigned to deleted subject ${row.subjectId}`);
      });
      console.warn('   💡 These should be cleaned up automatically by CASCADE delete logic.');
      console.warn('');
      warningsFound += orphanedUserSubjects.rows.length;
    }
    
    if (warningsFound === 0) {
      console.log('✅ Data integrity check passed - no orphaned assignments found');
      console.log('');
    } else {
      console.warn(`⚠️  Data integrity check found ${warningsFound} potential issues`);
      console.warn('   These will not prevent startup but may cause visibility problems.');
      console.warn('');
    }
    
  } catch (error) {
    console.error('❌ Data integrity check failed:', error);
    // Don't crash the server - integrity checks are informational
  }
}
