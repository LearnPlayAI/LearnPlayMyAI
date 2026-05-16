import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Configure for production
neonConfig.webSocketConstructor = ws;
neonConfig.poolQueryViaFetch = true;

const prodDatabaseUrl = process.env.PRD_DB_URL;

if (!prodDatabaseUrl) {
  console.error('❌ PRD_DB_URL not found in environment');
  process.exit(1);
}

console.log('🔍 Connecting to production database...\n');

const pool = new Pool({ connectionString: prodDatabaseUrl });
const db = drizzle(pool);

async function diagnose() {
  try {
    // Query 1: Find all Life Orientation subjects
    console.log('=== QUERY 1: All Life Orientation Subjects ===');
    const loSubjects = await pool.query(`
      SELECT 
        s.id AS "subjectId",
        s.name AS "subjectName",
        s."organizationId" AS "orgId",
        o.name AS "orgName",
        s."createdAt"
      FROM subjects s
      LEFT JOIN organizations o ON s."organizationId" = o.id
      WHERE LOWER(s.name) LIKE '%life%orientation%' OR LOWER(s.name) = 'lo'
      ORDER BY s."createdAt";
    `);
    console.log(JSON.stringify(loSubjects.rows, null, 2));
    console.log(`\nFound ${loSubjects.rows.length} Life Orientation subjects\n`);

    // Query 2: Check unitSubjects for the Life Orientation subject ID
    console.log('=== QUERY 2: unitSubjects entries for Life Orientation ===');
    const loSubjectId = loSubjects.rows[0]?.subjectId;
    const unitSubjectLinks = await pool.query(`
      SELECT *
      FROM "unitSubjects"
      WHERE "subjectId" = $1;
    `, [loSubjectId]);
    console.log(JSON.stringify(unitSubjectLinks.rows, null, 2));
    console.log(`\nFound ${unitSubjectLinks.rows.length} unitSubjects entries linking to Life Orientation\n`);

    // Query 3: Check student enrollments (userOrganizationAssignments)
    console.log('=== QUERY 3: Student Enrollments in Life Orientation ===');
    const studentEnrollments = await pool.query(`
      SELECT *
      FROM "userOrganizationAssignments"
      WHERE "subjectId" = $1;
    `, [loSubjectId]);
    console.log(JSON.stringify(studentEnrollments.rows, null, 2));
    console.log(`\nFound ${studentEnrollments.rows.length} student enrollments in Life Orientation\n`);

    // Query 4: Check quiz assignments (quizCollectionAssignments)
    console.log('=== QUERY 4: Quiz Assignments for Life Orientation ===');
    const quizAssignments = await pool.query(`
      SELECT *
      FROM "quizCollectionAssignments"
      WHERE "subjectId" = $1;
    `, [loSubjectId]);
    console.log(JSON.stringify(quizAssignments.rows, null, 2));
    console.log(`\nFound ${quizAssignments.rows.length} quiz assignments for Life Orientation\n`);

    // Query 5: Cross-check subject IDs
    console.log('=== QUERY 5: Subject ID Cross-Check ===');
    const subjectIds = new Set();
    loSubjects.rows.forEach((r: any) => subjectIds.add(r.subjectId));
    unitSubjectLinks.rows.forEach((r: any) => subjectIds.add(r.subjectId));
    studentEnrollments.rows.forEach((r: any) => subjectIds.add(r.subjectId));
    quizAssignments.rows.forEach((r: any) => subjectIds.add(r.subjectId));

    console.log('Unique Life Orientation subject IDs found across all tables:');
    console.log(Array.from(subjectIds));
    console.log(`\nTotal unique subject IDs: ${subjectIds.size}`);

    if (subjectIds.size > 1) {
      console.log('\n⚠️  WARNING: Multiple Life Orientation subject IDs detected!');
      console.log('This indicates a data consistency issue.\n');
    }

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

diagnose();
