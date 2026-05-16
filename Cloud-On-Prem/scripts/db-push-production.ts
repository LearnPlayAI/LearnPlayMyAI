#!/usr/bin/env tsx
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const prodDatabaseUrl = process.env.PRD_DB_URL;

if (!prodDatabaseUrl) {
  console.error('❌ PRD_DB_URL environment variable is required');
  console.error('   This script pushes schema changes to the production database');
  process.exit(1);
}

console.log('⚠️  WARNING: This will push schema changes to PRODUCTION database');
console.log('📍 Production DB:', prodDatabaseUrl.replace(/:[^:]*@/, ':****@')); // Hide password
console.log('');

// Ask for confirmation in interactive mode
if (process.stdin.isTTY) {
  console.log('Type "yes" to continue:');
  process.stdin.once('data', async (data) => {
    const input = data.toString().trim().toLowerCase();
    if (input === 'yes') {
      await pushToProduction();
    } else {
      console.log('❌ Aborted');
      process.exit(0);
    }
  });
} else {
  // Non-interactive mode (CI/CD)
  await pushToProduction();
}

async function pushToProduction() {
  try {
    console.log('🚀 Pushing schema to production database...\n');
    
    const { stdout, stderr } = await execAsync('drizzle-kit push', {
      env: {
        ...process.env,
        DATABASE_URL: prodDatabaseUrl,
      },
    });
    
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    
    console.log('\n✅ Production schema updated successfully!');
  } catch (error: any) {
    console.error('\n❌ Error pushing to production:', error.message);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
    process.exit(1);
  }
}
