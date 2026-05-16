import { neon } from '@neondatabase/serverless';

interface DatabaseConfig {
  name: string;
  connectionString: string;
}

interface DeletionResult {
  table: string;
  count: number;
}

async function cleanupDatabase(config: DatabaseConfig): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Processing: ${config.name}`);
  console.log('='.repeat(60));
  
  const sql = neon(config.connectionString);
  const results: DeletionResult[] = [];

  try {
    // First, count records before deletion
    console.log('\n📊 Counting records before deletion...\n');
    
    const tables = [
      'explanationTerms',
      'quizCardExplanations',
      'quizCards',
      'userQuizProgress',
      'quizCollectionAssignments',
      'activeQuizGames',
      'quizGameProgress',
      'quizGameResults',
      'quizDrafts',
      'quizCollections',
      'adminChallengeConfig'
    ];

    for (const table of tables) {
      const countResult = await sql(`SELECT COUNT(*) as count FROM "${table}"`);
      const count = parseInt(countResult[0].count);
      console.log(`  ${table}: ${count} records`);
    }

    // Count orphaned challenges specifically (daily challenges with no active status or that don't appear in UI)
    const orphanedChallengesResult = await sql(`
      SELECT COUNT(*) as count 
      FROM "adminChallengeConfig" 
      WHERE "challengeType" = 'daily'
    `);
    const orphanedCount = parseInt(orphanedChallengesResult[0].count);
    console.log(`\n  Daily challenges (to be deleted): ${orphanedCount} records`);

    // Start deletion process
    console.log('\n🗑️  Starting deletion process...\n');

    // Delete quiz-related data in correct order (respecting foreign key constraints)
    
    // 1. Delete explanationTerms (references quizCardExplanations)
    const deletedExplanationTerms = await sql('DELETE FROM "explanationTerms" WHERE 1=1 RETURNING id');
    results.push({ table: 'explanationTerms', count: deletedExplanationTerms.length });
    console.log(`  ✓ Deleted ${deletedExplanationTerms.length} records from explanationTerms`);

    // 2. Delete quizCardExplanations (references quizCards)
    const deletedQuizCardExplanations = await sql('DELETE FROM "quizCardExplanations" WHERE 1=1 RETURNING id');
    results.push({ table: 'quizCardExplanations', count: deletedQuizCardExplanations.length });
    console.log(`  ✓ Deleted ${deletedQuizCardExplanations.length} records from quizCardExplanations`);

    // 3. Delete quizCards (references quizCollections)
    const deletedQuizCards = await sql('DELETE FROM "quizCards" WHERE 1=1 RETURNING id');
    results.push({ table: 'quizCards', count: deletedQuizCards.length });
    console.log(`  ✓ Deleted ${deletedQuizCards.length} records from quizCards`);

    // 4. Delete userQuizProgress (references quizCollections and quizCollectionAssignments)
    const deletedUserQuizProgress = await sql('DELETE FROM "userQuizProgress" WHERE 1=1 RETURNING id');
    results.push({ table: 'userQuizProgress', count: deletedUserQuizProgress.length });
    console.log(`  ✓ Deleted ${deletedUserQuizProgress.length} records from userQuizProgress`);

    // 5. Delete quizCollectionAssignments (references quizCollections)
    const deletedQuizCollectionAssignments = await sql('DELETE FROM "quizCollectionAssignments" WHERE 1=1 RETURNING id');
    results.push({ table: 'quizCollectionAssignments', count: deletedQuizCollectionAssignments.length });
    console.log(`  ✓ Deleted ${deletedQuizCollectionAssignments.length} records from quizCollectionAssignments`);

    // 6. Delete activeQuizGames (references quizCollections)
    const deletedActiveQuizGames = await sql('DELETE FROM "activeQuizGames" WHERE 1=1 RETURNING id');
    results.push({ table: 'activeQuizGames', count: deletedActiveQuizGames.length });
    console.log(`  ✓ Deleted ${deletedActiveQuizGames.length} records from activeQuizGames`);

    // 7. Delete quizGameProgress (references quizCollections)
    const deletedQuizGameProgress = await sql('DELETE FROM "quizGameProgress" WHERE 1=1 RETURNING id');
    results.push({ table: 'quizGameProgress', count: deletedQuizGameProgress.length });
    console.log(`  ✓ Deleted ${deletedQuizGameProgress.length} records from quizGameProgress`);

    // 8. Delete quizGameResults (references quizCollections)
    const deletedQuizGameResults = await sql('DELETE FROM "quizGameResults" WHERE 1=1 RETURNING id');
    results.push({ table: 'quizGameResults', count: deletedQuizGameResults.length });
    console.log(`  ✓ Deleted ${deletedQuizGameResults.length} records from quizGameResults`);

    // 9. Delete quizDrafts (references quizCollections)
    const deletedQuizDrafts = await sql('DELETE FROM "quizDrafts" WHERE 1=1 RETURNING id');
    results.push({ table: 'quizDrafts', count: deletedQuizDrafts.length });
    console.log(`  ✓ Deleted ${deletedQuizDrafts.length} records from quizDrafts`);

    // 10. Delete quizCollections (main quiz table)
    const deletedQuizCollections = await sql('DELETE FROM "quizCollections" WHERE 1=1 RETURNING id');
    results.push({ table: 'quizCollections', count: deletedQuizCollections.length });
    console.log(`  ✓ Deleted ${deletedQuizCollections.length} records from quizCollections`);

    // 11. Delete orphaned daily challenges from adminChallengeConfig
    const deletedChallenges = await sql(`
      DELETE FROM "adminChallengeConfig" 
      WHERE "challengeType" = 'daily'
      RETURNING id
    `);
    results.push({ table: 'adminChallengeConfig (daily challenges)', count: deletedChallenges.length });
    console.log(`  ✓ Deleted ${deletedChallenges.length} orphaned daily challenges from adminChallengeConfig`);

    // Summary
    console.log('\n📋 Deletion Summary:\n');
    const totalDeleted = results.reduce((sum, r) => sum + r.count, 0);
    results.forEach(r => {
      console.log(`  ${r.table.padEnd(40)} ${r.count.toString().padStart(6)} records`);
    });
    console.log(`  ${'-'.repeat(48)}`);
    console.log(`  ${'TOTAL'.padEnd(40)} ${totalDeleted.toString().padStart(6)} records`);

    // Verify deletion
    console.log('\n✅ Verifying deletion...\n');
    for (const table of tables) {
      const countResult = await sql(`SELECT COUNT(*) as count FROM "${table}"`);
      const count = parseInt(countResult[0].count);
      
      if (table === 'adminChallengeConfig') {
        // Check for daily challenges specifically
        const dailyChallengesResult = await sql(`
          SELECT COUNT(*) as count 
          FROM "adminChallengeConfig" 
          WHERE "challengeType" = 'daily'
        `);
        const dailyCount = parseInt(dailyChallengesResult[0].count);
        console.log(`  ${table} (daily): ${dailyCount} records remaining ${dailyCount === 0 ? '✓' : '⚠️'}`);
      } else if (table.startsWith('quiz')) {
        console.log(`  ${table}: ${count} records remaining ${count === 0 ? '✓' : '⚠️'}`);
      } else if (table === 'explanationTerms') {
        console.log(`  ${table}: ${count} records remaining ${count === 0 ? '✓' : '⚠️'}`);
      }
    }

    console.log(`\n✅ ${config.name} cleanup completed successfully!`);

  } catch (error) {
    console.error(`\n❌ Error during ${config.name} cleanup:`, error);
    throw error;
  }
}

async function main() {
  console.log('\n🧹 Quiz and Challenge Cleanup Utility');
  console.log('This script will delete ALL quiz data and orphaned daily challenges');
  console.log('from both DEVELOPMENT and PRODUCTION databases.\n');

  const databases: DatabaseConfig[] = [];

  // Development database
  if (process.env.DATABASE_URL) {
    databases.push({
      name: 'DEVELOPMENT Database',
      connectionString: process.env.DATABASE_URL
    });
  } else {
    console.warn('⚠️  DATABASE_URL not found, skipping development database');
  }

  // Production database
  if (process.env.PRD_PGHOST && process.env.PRD_PGUSER && process.env.PRD_PGPASSWORD && process.env.PRD_PGDATABASE) {
    const prdPort = process.env.PRD_PGPORT || '5432';
    const productionConnectionString = `postgresql://${process.env.PRD_PGUSER}:${process.env.PRD_PGPASSWORD}@${process.env.PRD_PGHOST}:${prdPort}/${process.env.PRD_PGDATABASE}?sslmode=require`;
    
    databases.push({
      name: 'PRODUCTION Database',
      connectionString: productionConnectionString
    });
  } else {
    console.warn('⚠️  Production database credentials (PRD_*) not found, skipping production database');
  }

  if (databases.length === 0) {
    console.error('❌ No database configurations found. Please check your environment variables.');
    process.exit(1);
  }

  // Process each database
  for (const db of databases) {
    try {
      await cleanupDatabase(db);
    } catch (error) {
      console.error(`Failed to cleanup ${db.name}`);
      // Continue with next database even if one fails
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎉 All database cleanup operations completed!');
  console.log('='.repeat(60) + '\n');
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
