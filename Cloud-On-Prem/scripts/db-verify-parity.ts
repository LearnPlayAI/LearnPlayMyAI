#!/usr/bin/env tsx
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;
neonConfig.poolQueryViaFetch = true;

const devDatabaseUrl = process.env.DATABASE_URL;
const prodDatabaseUrl = process.env.PRD_DB_URL;

if (!devDatabaseUrl || !prodDatabaseUrl) {
  console.error('❌ Both DATABASE_URL and PRD_DB_URL must be set');
  process.exit(1);
}

async function getSchemaHash(pool: Pool): Promise<string> {
  // Get a hash of the schema by querying table structures
  const result = await pool.query(`
    SELECT 
      table_name,
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position;
  `);
  
  return JSON.stringify(result.rows);
}

async function getTables(pool: Pool): Promise<string[]> {
  const result = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `);
  
  return result.rows.map((r: any) => r.table_name);
}

async function verifyParity() {
  console.log('🔍 Verifying schema parity between development and production...\n');
  
  const devPool = new Pool({ connectionString: devDatabaseUrl });
  const prodPool = new Pool({ connectionString: prodDatabaseUrl });
  
  try {
    // Get tables from both environments
    const [devTables, prodTables] = await Promise.all([
      getTables(devPool),
      getTables(prodPool),
    ]);
    
    console.log(`📊 Development tables: ${devTables.length}`);
    console.log(`📊 Production tables: ${prodTables.length}`);
    console.log('');
    
    // Check for missing tables
    const missingInProd = devTables.filter(t => !prodTables.includes(t));
    const missingInDev = prodTables.filter(t => !devTables.includes(t));
    
    if (missingInProd.length > 0) {
      console.log('⚠️  Tables missing in PRODUCTION:');
      missingInProd.forEach(t => console.log(`   - ${t}`));
      console.log('');
    }
    
    if (missingInDev.length > 0) {
      console.log('⚠️  Tables missing in DEVELOPMENT:');
      missingInDev.forEach(t => console.log(`   - ${t}`));
      console.log('');
    }
    
    // Get full schema hash
    const [devHash, prodHash] = await Promise.all([
      getSchemaHash(devPool),
      getSchemaHash(prodPool),
    ]);
    
    if (devHash === prodHash) {
      console.log('✅ Schemas are IDENTICAL - perfect parity!');
      console.log('   Development and production databases have the same structure.');
      process.exit(0);
    } else {
      console.log('❌ Schemas DIFFER - parity check failed!');
      console.log('');
      console.log('   Development and production databases have different structures.');
      console.log('   Run `npm run db:push:prod` to sync production with development.');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error verifying parity:', error);
    process.exit(1);
  } finally {
    await devPool.end();
    await prodPool.end();
  }
}

verifyParity();
