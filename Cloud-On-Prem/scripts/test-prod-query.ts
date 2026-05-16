import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Configure for production
neonConfig.webSocketConstructor = ws;
neonConfig.poolQueryViaFetch = true;

const prodDatabaseUrl = process.env.PRD_DB_URL;
if (!prodDatabaseUrl) {
  console.error('❌ PRD_DB_URL not found');
  process.exit(1);
}

const pool = new Pool({ connectionString: prodDatabaseUrl });

async function testQuery() {
  try {
    // Student's data from earlier query
    const studentUserId = '74a42c03-68f5-4807-8ef9-dca59c4f06f4';
    const studentUnitId = '4cec788d-0a3c-4a4a-8ec1-9e690a3a0466'; // Grade 9
    const studentSubjectId = '8df9a1db-9024-4ca5-8444-8003c8a5926b'; // LO
    const orgId = '859c6749-4924-46d7-96df-61410b77868f'; // Heart High

    console.log('🧪 Testing production query logic...\n');
    console.log('Student Info:');
    console.log('  - Unit ID (Grade 9):', studentUnitId);
    console.log('  - Subject ID (LO):', studentSubjectId);
    console.log('  - Organization:', orgId);
    console.log();

    // Simulate the actual query from getQuizCollectionsForUserAccess
    console.log('=== Running the actual query logic ===');
    const result = await pool.query(`
      SELECT
        qc.id,
        qc.name,
        qc."organizationId",
        qc."subjectId" as quiz_subject_id,
        qc."isPublic",
        qc."isActive",
        qc."isDeleted",
        qc."createdAt",
        qca."subjectId" as assignment_subject_id,
        qca."unitId" as assignment_unit_id
      FROM "quizCollections" qc
      LEFT JOIN "quizCollectionAssignments" qca ON qc.id = qca."collectionId"
      WHERE qc."isActive" = true
        AND (qc."isDeleted" = false OR qc."isDeleted" IS NULL)
        AND (
          qc."organizationId" = $1 OR qc."isPublic" = true
        )
        AND (
          qc."isPublic" = true
          OR (
            -- Assignment unit matches student's unit OR no unit restriction
            (qca."unitId" = $2 OR qca."unitId" IS NULL)
            AND
            -- Assignment subject matches student's subject OR no subject restriction  
            (qca."subjectId" = $3 OR qca."subjectId" IS NULL)
          )
        )
      ORDER BY qc."createdAt" DESC;
    `, [orgId, studentUnitId, studentSubjectId]);

    console.log(`\nFound ${result.rows.length} quiz collections\n`);
    console.log(JSON.stringify(result.rows, null, 2));

    // Also check quiz collections without the assignment filter
    console.log('\n\n=== Check all quiz collections for this org ===');
    const allQuizzes = await pool.query(`
      SELECT id, name, "organizationId", "subjectId", "isPublic", "isActive", "isDeleted"
      FROM "quizCollections"
      WHERE "organizationId" = $1
        AND "isActive" = true
        AND ("isDeleted" = false OR "isDeleted" IS NULL)
      ORDER BY "createdAt" DESC;
    `, [orgId]);
    
    console.log(`\nTotal quizzes in org: ${allQuizzes.rows.length}`);
    console.log(JSON.stringify(allQuizzes.rows, null, 2));

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

testQuery();
