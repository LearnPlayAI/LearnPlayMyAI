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

async function getTableColumns(pool: Pool, tableName: string) {
  const result = await pool.query(`
    SELECT 
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position;
  `, [tableName]);
  
  return result.rows;
}

async function findDifferences() {
  console.log('🔍 Finding detailed schema differences...\n');
  
  const devPool = new Pool({ connectionString: devDatabaseUrl });
  const prodPool = new Pool({ connectionString: prodDatabaseUrl });
  
  try {
    // Get all tables
    const devTablesResult = await devPool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' ORDER BY table_name;
    `);
    const devTables: string[] = devTablesResult.rows.map((r: any) => r.table_name);
    
    console.log(`Checking ${devTables.length} tables for differences...\n`);
    
    let differencesFound = 0;
    
    // Check each table
    for (const tableName of devTables.slice(0, 10)) { // Check first 10 tables as sample
      const [devCols, prodCols] = await Promise.all([
        getTableColumns(devPool, tableName),
        getTableColumns(prodPool, tableName),
      ]);
      
      const devColsStr = JSON.stringify(devCols);
      const prodColsStr = JSON.stringify(prodCols);
      
      if (devColsStr !== prodColsStr) {
        console.log(`⚠️  Table: ${tableName}`);
        console.log(`   Dev columns: ${devCols.length}, Prod columns: ${prodCols.length}`);
        
        // Find missing columns
        const devColNames = devCols.map((c: any) => c.column_name);
        const prodColNames = prodCols.map((c: any) => c.column_name);
        
        const missingInProd = devColNames.filter(name => !prodColNames.includes(name));
        const missingInDev = prodColNames.filter(name => !devColNames.includes(name));
        
        if (missingInProd.length > 0) {
          console.log(`   Missing in prod: ${missingInProd.join(', ')}`);
        }
        if (missingInDev.length > 0) {
          console.log(`   Missing in dev: ${missingInDev.join(', ')}`);
        }
        
        console.log('');
        differencesFound++;
      }
    }
    
    if (differencesFound === 0) {
      console.log('✅ No differences found in sampled tables');
    } else {
      console.log(`Found differences in ${differencesFound} tables (sampled first 10)`);
    }
    
  } finally {
    await devPool.end();
    await prodPool.end();
  }
}

findDifferences();
