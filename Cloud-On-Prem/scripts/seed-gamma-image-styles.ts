#!/usr/bin/env tsx
/**
 * Seed Gamma Image Styles
 * 
 * This script seeds the gammaImageStyles table with preset image styles.
 * These styles are used in the Lesson Wizard for AI-generated presentations.
 * 
 * Usage:
 *   Development: npx tsx scripts/seed-gamma-image-styles.ts
 *   Production:  PRD_DB_URL=<prod_url> npx tsx scripts/seed-gamma-image-styles.ts --production
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { gammaImageStyles } from "../shared/schema";
import { GAMMA_IMAGE_STYLE_DEFINITIONS } from "../server/catalogDefinitions";
import { eq } from "drizzle-orm";

async function seedGammaImageStyles() {
  const isProduction = process.argv.includes("--production");
  const dbUrl = isProduction 
    ? process.env.PRD_DB_URL || process.env.DATABASE_URL
    : process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error("❌ Database URL not found");
    console.error(isProduction 
      ? "Set PRD_DB_URL for production or DATABASE_URL" 
      : "Set DATABASE_URL for development");
    process.exit(1);
  }

  console.log(`🎨 Seeding Gamma Image Styles (${isProduction ? "PRODUCTION" : "DEVELOPMENT"})...`);
  console.log(`📊 Database: ${dbUrl.split('@')[1]?.split('/')[0] || 'unknown'}`);

  const sql = neon(dbUrl);
  const db = drizzle(sql);

  try {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const styleDef of GAMMA_IMAGE_STYLE_DEFINITIONS) {
      // Check if style already exists
      const existing = await db
        .select()
        .from(gammaImageStyles)
        .where(eq(gammaImageStyles.styleKey, styleDef.styleKey))
        .limit(1);

      if (existing.length > 0) {
        // Update existing style (preserve custom thumbnailUrl if set)
        const existingStyle = existing[0];
        await db
          .update(gammaImageStyles)
          .set({
            displayName: styleDef.displayName,
            description: styleDef.description,
            ...( (!existingStyle.thumbnailUrl || existingStyle.thumbnailUrl.trim() === '') && styleDef.thumbnailUrl
              ? { thumbnailUrl: styleDef.thumbnailUrl }
              : {} ),
            recommendedUseCases: styleDef.recommendedUseCases as any,
            source: styleDef.source,
            isActive: styleDef.isActive,
            weight: styleDef.weight,
            updatedAt: new Date(),
          })
          .where(eq(gammaImageStyles.styleKey, styleDef.styleKey));
        
        console.log(`  ↻ Updated: ${styleDef.displayName} (${styleDef.styleKey})`);
        updated++;
      } else {
        // Insert new style
        await db
          .insert(gammaImageStyles)
          .values({
            styleKey: styleDef.styleKey,
            displayName: styleDef.displayName,
            description: styleDef.description,
            thumbnailUrl: styleDef.thumbnailUrl,
            recommendedUseCases: styleDef.recommendedUseCases as any,
            source: styleDef.source,
            isActive: styleDef.isActive,
            weight: styleDef.weight,
            lastSyncedAt: styleDef.lastSyncedAt,
          });
        
        console.log(`  ✓ Created: ${styleDef.displayName} (${styleDef.styleKey})`);
        inserted++;
      }
    }

    console.log("\n✅ Seed complete!");
    console.log(`   Created: ${inserted}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total styles: ${GAMMA_IMAGE_STYLE_DEFINITIONS.length}`);

  } catch (error) {
    console.error("\n❌ Seed failed:", error);
    process.exit(1);
  }
}

seedGammaImageStyles();
