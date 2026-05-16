#!/usr/bin/env tsx
/**
 * Migration Script: Convert player answer columns from integer to jsonb
 * 
 * This script safely converts the player1Answer and player2Answer columns
 * in the activeQuizGames table from integer to jsonb type.
 * 
 * Usage:
 *   tsx scripts/migrate-answer-columns.ts
 * 
 * Or with explicit DATABASE_URL:
 *   DATABASE_URL="your-db-url" tsx scripts/migrate-answer-columns.ts
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  console.error('Usage: DATABASE_URL="your-db-url" tsx scripts/migrate-answer-columns.ts');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  console.log('🔄 Starting migration: Convert answer columns to jsonb...');
  
  try {
    // Check if columns exist and get their current types
    const checkQuery = `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'activeQuizGames' 
      AND column_name IN ('player1Answer', 'player2Answer')
    `;
    
    const checkResult = await pool.query(checkQuery);
    
    if (checkResult.rows.length === 0) {
      console.error('❌ Table activeQuizGames or columns not found');
      console.error('💡 Make sure the database schema is initialized first');
      process.exit(1);
    }
    
    console.log('\n📊 Current column types:');
    checkResult.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
    // Check if migration is needed
    const needsMigration = checkResult.rows.some(row => row.data_type !== 'jsonb');
    
    if (!needsMigration) {
      console.log('\n✅ Columns are already jsonb type - no migration needed!');
      await pool.end();
      process.exit(0);
    }
    
    console.log('\n🔧 Converting columns to jsonb...');
    
    // Migrate player1Answer
    const player1Exists = checkResult.rows.find(r => r.column_name === 'player1Answer');
    if (player1Exists && player1Exists.data_type !== 'jsonb') {
      console.log('  Converting player1Answer...');
      await pool.query(`
        ALTER TABLE "activeQuizGames" 
        ALTER COLUMN "player1Answer" TYPE jsonb 
        USING CASE 
          WHEN "player1Answer" IS NULL THEN NULL 
          ELSE to_jsonb("player1Answer") 
        END
      `);
      console.log('  ✓ player1Answer converted');
    }
    
    // Migrate player2Answer
    const player2Exists = checkResult.rows.find(r => r.column_name === 'player2Answer');
    if (player2Exists && player2Exists.data_type !== 'jsonb') {
      console.log('  Converting player2Answer...');
      await pool.query(`
        ALTER TABLE "activeQuizGames" 
        ALTER COLUMN "player2Answer" TYPE jsonb 
        USING CASE 
          WHEN "player2Answer" IS NULL THEN NULL 
          ELSE to_jsonb("player2Answer") 
        END
      `);
      console.log('  ✓ player2Answer converted');
    }
    
    // Verify migration
    const verifyResult = await pool.query(checkQuery);
    console.log('\n✅ Migration complete! Final column types:');
    verifyResult.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
    console.log('\n🎉 You can now deploy your application!');
    
  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nError details:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
