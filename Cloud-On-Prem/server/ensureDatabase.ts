import { db } from './db';
import { sql } from 'drizzle-orm';

export async function checkDatabaseReady(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    
    const tables = await db.execute(sql`
      SELECT tablename 
      FROM pg_catalog.pg_tables 
      WHERE schemaname = 'public' 
      LIMIT 5
    `);
    
    if (tables.rows.length === 0) {
      console.warn('⚠️ Database is empty - no tables found');
      console.warn('💡 Run: npm run db:push');
      return false;
    }
    
    return true;
  } catch (error: any) {
    console.error('❌ Database connection check failed:', error?.message || error);
    return false;
  }
}

export async function ensureCriticalTables(): Promise<void> {
  const criticalTables = [
    'users',
    'sessions',
    'playerStats',
    'powerUpCatalog',
    'cosmeticCatalog',
    'seasonPassConfig',
    'organizations'
  ];

  try {
    for (const tableName of criticalTables) {
      const result = await db.execute(sql.raw(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = '${tableName}'
        )
      `));
      
      const exists = result.rows[0]?.exists;
      
      if (!exists) {
        throw new Error(`Critical table "${tableName}" is missing from database`);
      }
    }
    
    console.log('✅ All critical tables exist');
  } catch (error: any) {
    console.error('❌ Database schema validation failed:', error?.message || error);
    console.error('\n📋 To fix this, run: npm run db:push\n');
    throw error;
  }
}
