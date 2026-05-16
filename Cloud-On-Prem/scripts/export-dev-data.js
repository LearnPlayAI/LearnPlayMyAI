#!/usr/bin/env node

import { db } from '../server/db.ts';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function exportDevelopmentData() {
  try {
    console.log('🚀 Exporting development database data...');
    
    const data = {
      timestamp: new Date().toISOString(),
      environment: 'development'
    };

    // Export users
    console.log('📤 Exporting users...');
    const users = await db.query.users.findMany();
    data.users = users;
    console.log(`✅ Exported ${users.length} users`);

    // Export leaderBoard
    console.log('📤 Exporting leaderboard...');
    const leaderBoard = await db.query.leaderBoard.findMany();
    data.leaderBoard = leaderBoard;
    console.log(`✅ Exported ${leaderBoard.length} leaderboard entries`);

    // Export cardCollections
    console.log('📤 Exporting card collections...');
    const cardCollections = await db.query.cardCollections.findMany();
    data.cardCollections = cardCollections;
    console.log(`✅ Exported ${cardCollections.length} card collections`);

    // Export collectionStatTypes
    console.log('📤 Exporting collection stat types...');
    const collectionStatTypes = await db.query.collectionStatTypes.findMany();
    data.collectionStatTypes = collectionStatTypes;
    console.log(`✅ Exported ${collectionStatTypes.length} stat types`);

    // Export cards
    console.log('📤 Exporting cards...');
    const cards = await db.query.cards.findMany();
    data.cards = cards;
    console.log(`✅ Exported ${cards.length} cards`);

    // Export cardStats
    console.log('📤 Exporting card stats...');
    const cardStats = await db.query.cardStats.findMany();
    data.cardStats = cardStats;
    console.log(`✅ Exported ${cardStats.length} card stats`);

    // Write to file
    const outputPath = path.join(__dirname, 'production-data.json');
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    
    console.log(`💾 Development data exported to: ${outputPath}`);
    console.log('🎯 Ready for production import!');
    
    return data;
  } catch (error) {
    console.error('❌ Export failed:', error);
    throw error;
  }
}

// Run export
exportDevelopmentData()
  .then(() => {
    console.log('✨ Export completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Export failed:', error);
    process.exit(1);
  });