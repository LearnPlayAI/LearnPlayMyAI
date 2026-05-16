import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;
neonConfig.poolQueryViaFetch = true;

const prodDatabaseUrl = process.env.PRD_DB_URL;
if (!prodDatabaseUrl) {
  console.error('❌ PRD_DB_URL not found');
  process.exit(1);
}

const pool = new Pool({ connectionString: prodDatabaseUrl });

async function checkSchema() {
  try {
    console.log('📋 Checking production database schema...\n');
    
    // Get all table names
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    
    console.log('Tables in production database:');
    tables.rows.forEach((row: any) => {
      console.log(`  - ${row.table_name}`);
    });
    
    console.log(`\nTotal tables: ${tables.rows.length}`);
    
    // Check specifically for the tables we need
    const criticalTables = ['unitSubjects', 'organizationUnits', 'quizCollectionAssignments', 'subjects'];
    console.log('\n=== Critical Table Check ===');
    for (const tableName of criticalTables) {
      const exists = tables.rows.some((r: any) => r.table_name === tableName);
      console.log(`${exists ? '✅' : '❌'} ${tableName}`);
    }
    
    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

checkSchema();
