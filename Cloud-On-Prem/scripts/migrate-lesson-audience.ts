#!/usr/bin/env tsx
/**
 * Migration Script: Add audience column to lessonScopeAssignments
 * 
 * This script verifies the audience column exists and all rows have a value.
 * The actual migration happens via db:push with default value 'learner'.
 * 
 * Usage:
 *   tsx scripts/migrate-lesson-audience.ts
 * 
 * Or with explicit DATABASE_URL:
 *   DATABASE_URL="your-db-url" tsx scripts/migrate-lesson-audience.ts
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  console.error('Usage: DATABASE_URL="your-db-url" tsx scripts/migrate-lesson-audience.ts');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  console.log('🔄 Verifying lesson audience migration...');
  
  try {
    // Check if audience column exists
    const checkQuery = `
      SELECT column_name, data_type, column_default
      FROM information_schema.columns 
      WHERE table_name = 'lessonScopeAssignments' 
      AND column_name = 'audience'
    `;
    
    const checkResult = await pool.query(checkQuery);
    
    if (checkResult.rows.length === 0) {
      console.error('❌ audience column not found in lessonScopeAssignments');
      console.error('💡 Run: npm run db:push');
      process.exit(1);
    }
    
    console.log('\n✅ audience column exists:');
    console.log(`  - Type: ${checkResult.rows[0].data_type}`);
    console.log(`  - Default: ${checkResult.rows[0].column_default || 'none'}`);
    
    // Check if enum type exists
    const enumQuery = `
      SELECT enumlabel 
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'lesson_assignment_audience'
      ORDER BY enumsortorder
    `;
    
    const enumResult = await pool.query(enumQuery);
    
    if (enumResult.rows.length === 0) {
      console.error('\n❌ lesson_assignment_audience enum not found');
      console.error('💡 Run: npm run db:push');
      process.exit(1);
    }
    
    console.log('\n✅ lesson_assignment_audience enum values:');
    enumResult.rows.forEach(row => {
      console.log(`  - ${row.enumlabel}`);
    });
    
    // Count rows and verify no nulls
    const countQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(audience) as with_audience,
        SUM(CASE WHEN audience = 'learner' THEN 1 ELSE 0 END) as learner_count,
        SUM(CASE WHEN audience = 'instructor' THEN 1 ELSE 0 END) as instructor_count
      FROM "lessonScopeAssignments"
    `;
    
    const countResult = await pool.query(countQuery);
    const stats = countResult.rows[0];
    
    console.log('\n📊 Assignment statistics:');
    console.log(`  Total rows: ${stats.total}`);
    console.log(`  With audience: ${stats.with_audience}`);
    console.log(`  Learner assignments: ${stats.learner_count}`);
    console.log(`  Instructor assignments: ${stats.instructor_count}`);
    
    if (parseInt(stats.total) !== parseInt(stats.with_audience)) {
      console.error('\n❌ Found rows with NULL audience values!');
      console.log('🔧 Fixing NULL values...');
      
      await pool.query(`
        UPDATE "lessonScopeAssignments"
        SET audience = 'learner'
        WHERE audience IS NULL
      `);
      
      console.log('✅ NULL values fixed');
    }
    
    console.log('\n🎉 Migration verification complete!');
    
  } catch (error: any) {
    console.error('\n❌ Verification failed:', error.message);
    console.error('\nError details:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
