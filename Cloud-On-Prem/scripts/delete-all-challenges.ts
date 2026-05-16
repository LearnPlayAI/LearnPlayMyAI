import { neon } from '@neondatabase/serverless';

interface DatabaseConfig {
  name: string;
  connectionString: string;
}

interface DeletionResult {
  table: string;
  count: number;
}

async function deleteChallenges(config: DatabaseConfig): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Processing: ${config.name}`);
  console.log('='.repeat(60));
  
  const sql = neon(config.connectionString);
  const results: DeletionResult[] = [];

  try {
    // First, count records before deletion
    console.log('\n📊 Counting challenge records before deletion...\n');
    
    const challengeCountResult = await sql(`SELECT COUNT(*) as count FROM "adminChallengeConfig"`);
    const challengeCount = parseInt(challengeCountResult[0].count);
    console.log(`  adminChallengeConfig: ${challengeCount} records`);
    
    const progressCountResult = await sql(`SELECT COUNT(*) as count FROM "challengeProgress"`);
    const progressCount = parseInt(progressCountResult[0].count);
    console.log(`  challengeProgress: ${progressCount} records`);

    // Start deletion process
    console.log('\n🗑️  Starting deletion process...\n');

    // 1. Delete challengeProgress first (child table, references adminChallengeConfig)
    const deletedProgress = await sql('DELETE FROM "challengeProgress" WHERE 1=1 RETURNING id');
    results.push({ table: 'challengeProgress', count: deletedProgress.length });
    console.log(`  ✓ Deleted ${deletedProgress.length} records from challengeProgress`);

    // 2. Delete ALL challenges from adminChallengeConfig
    const deletedChallenges = await sql('DELETE FROM "adminChallengeConfig" WHERE 1=1 RETURNING id');
    results.push({ table: 'adminChallengeConfig', count: deletedChallenges.length });
    console.log(`  ✓ Deleted ${deletedChallenges.length} records from adminChallengeConfig`);

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
    const verifyChallenge = await sql(`SELECT COUNT(*) as count FROM "adminChallengeConfig"`);
    const verifyChallengeCount = parseInt(verifyChallenge[0].count);
    console.log(`  adminChallengeConfig: ${verifyChallengeCount} records remaining ${verifyChallengeCount === 0 ? '✓' : '⚠️'}`);
    
    const verifyProgress = await sql(`SELECT COUNT(*) as count FROM "challengeProgress"`);
    const verifyProgressCount = parseInt(verifyProgress[0].count);
    console.log(`  challengeProgress: ${verifyProgressCount} records remaining ${verifyProgressCount === 0 ? '✓' : '⚠️'}`);

    console.log(`\n✅ ${config.name} challenge deletion completed successfully!`);

  } catch (error) {
    console.error(`\n❌ Error during ${config.name} challenge deletion:`, error);
    throw error;
  }
}

async function main() {
  console.log('\n🧹 Delete ALL Challenges Utility');
  console.log('This script will delete ALL challenges (daily and weekly) and all challenge progress');
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
      await deleteChallenges(db);
    } catch (error) {
      console.error(`Failed to delete challenges from ${db.name}`);
      // Continue with next database even if one fails
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎉 All challenge deletion operations completed!');
  console.log('='.repeat(60) + '\n');
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
