#!/usr/bin/env node

import { db } from '../server/db.ts';
import { 
  users, 
  leaderBoard, 
  cardCollections, 
  collectionStatTypes, 
  cards, 
  cardStats 
} from '../shared/schema.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to convert timestamp strings back to Date objects
function convertTimestamps(records) {
  return records.map(record => {
    const converted = { ...record };
    // Convert common timestamp fields
    if (converted.createdAt && typeof converted.createdAt === 'string') {
      converted.createdAt = new Date(converted.createdAt);
    }
    if (converted.updatedAt && typeof converted.updatedAt === 'string') {
      converted.updatedAt = new Date(converted.updatedAt);
    }
    if (converted.lastActiveAt && typeof converted.lastActiveAt === 'string') {
      converted.lastActiveAt = new Date(converted.lastActiveAt);
    }
    return converted;
  });
}

async function importToProduction() {
  try {
    console.log('🚀 Starting production data import...');
    
    // Read exported data
    const dataPath = path.join(__dirname, 'production-data.json');
    if (!fs.existsSync(dataPath)) {
      throw new Error('❌ No production-data.json found! Run export script first.');
    }
    
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    console.log(`📥 Loaded data from ${data.timestamp}`);

    // Clear existing data (in correct order to avoid foreign key issues)
    console.log('🧹 Clearing existing production data...');
    
    await db.delete(cardStats);
    await db.delete(cards);
    await db.delete(collectionStatTypes);
    await db.delete(cardCollections);
    await db.delete(leaderBoard);
    await db.delete(users);
    
    console.log('✅ Production database cleared');

    // Import data (in correct order for foreign key dependencies)
    console.log('📤 Importing users...');
    if (data.users && data.users.length > 0) {
      const convertedUsers = convertTimestamps(data.users);
      await db.insert(users).values(convertedUsers);
      console.log(`✅ Imported ${convertedUsers.length} users`);
    }

    console.log('📤 Importing leaderboard...');
    if (data.leaderBoard && data.leaderBoard.length > 0) {
      const convertedLeaderBoard = convertTimestamps(data.leaderBoard);
      await db.insert(leaderBoard).values(convertedLeaderBoard);
      console.log(`✅ Imported ${convertedLeaderBoard.length} leaderboard entries`);
    }

    console.log('📤 Importing card collections...');
    if (data.cardCollections && data.cardCollections.length > 0) {
      const convertedCardCollections = convertTimestamps(data.cardCollections);
      await db.insert(cardCollections).values(convertedCardCollections);
      console.log(`✅ Imported ${convertedCardCollections.length} card collections`);
    }

    console.log('📤 Importing collection stat types...');
    if (data.collectionStatTypes && data.collectionStatTypes.length > 0) {
      const convertedStatTypes = convertTimestamps(data.collectionStatTypes);
      await db.insert(collectionStatTypes).values(convertedStatTypes);
      console.log(`✅ Imported ${convertedStatTypes.length} stat types`);
    }

    console.log('📤 Importing cards...');
    if (data.cards && data.cards.length > 0) {
      const convertedCards = convertTimestamps(data.cards);
      await db.insert(cards).values(convertedCards);
      console.log(`✅ Imported ${convertedCards.length} cards`);
    }

    console.log('📤 Importing card stats...');
    if (data.cardStats && data.cardStats.length > 0) {
      const convertedCardStats = convertTimestamps(data.cardStats);
      await db.insert(cardStats).values(convertedCardStats);
      console.log(`✅ Imported ${convertedCardStats.length} card stats`);
    }

    console.log('🎯 Production database now matches development!');
    console.log('✨ Import completed successfully!');

  } catch (error) {
    console.error('❌ Import failed:', error);
    throw error;
  }
}

// Run import
importToProduction()
  .then(() => {
    console.log('🏆 Production database is now identical to development!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Import failed:', error);
    process.exit(1);
  });