/**
 * Idempotent seed script for platform cost categories
 * Safe to run in both development and production - uses ON CONFLICT DO NOTHING
 * 
 * Run with: npx tsx scripts/seed-platform-costs.ts
 */

import { db } from '../server/db';
import { platformCostCategories } from '../shared/schema';
import { sql } from 'drizzle-orm';

const defaultCategories = [
  {
    name: 'Infrastructure',
    type: 'infrastructure' as const,
    description: 'Cloud hosting, servers, CDN, database, and infrastructure services',
    displayOrder: 1,
  },
  {
    name: 'Payment Processing',
    type: 'payment_processing' as const,
    description: 'Transaction fees from payment processors (YOCO, Stripe)',
    displayOrder: 2,
  },
  {
    name: 'API Services',
    type: 'api_services' as const,
    description: 'Third-party API costs (AI/ML, Gemini, OpenAI, etc.)',
    displayOrder: 3,
  },
  {
    name: 'Staffing',
    type: 'staffing' as const,
    description: 'Staff salaries, contractors, and HR costs',
    displayOrder: 4,
  },
  {
    name: 'Marketing',
    type: 'marketing' as const,
    description: 'Advertising, campaigns, and promotional costs',
    displayOrder: 5,
  },
  {
    name: 'Revenue Share',
    type: 'revenue_share' as const,
    description: 'Payouts to content creators and partners',
    displayOrder: 6,
  },
  {
    name: 'Refunds & Payouts',
    type: 'refund_payout' as const,
    description: 'Customer refunds and miscellaneous payouts',
    displayOrder: 7,
  },
  {
    name: 'Other',
    type: 'other' as const,
    description: 'Miscellaneous costs not fitting other categories',
    displayOrder: 99,
  },
];

async function seedCostCategories() {
  console.log('[Seed] Starting platform cost categories seed...');
  
  let inserted = 0;
  let skipped = 0;
  
  for (const category of defaultCategories) {
    try {
      // Use ON CONFLICT to make this idempotent
      const result = await db
        .insert(platformCostCategories)
        .values({
          name: category.name,
          type: category.type,
          description: category.description,
          displayOrder: category.displayOrder,
          isActive: true,
        })
        .onConflictDoNothing()
        .returning({ id: platformCostCategories.id });
      
      if (result.length > 0) {
        console.log(`  ✓ Created category: ${category.name}`);
        inserted++;
      } else {
        console.log(`  ↻ Skipped (exists): ${category.name}`);
        skipped++;
      }
    } catch (error) {
      // Category likely already exists with this name
      console.log(`  ↻ Skipped (conflict): ${category.name}`);
      skipped++;
    }
  }
  
  console.log(`[Seed] Complete: ${inserted} created, ${skipped} skipped`);
}

// Run if called directly
seedCostCategories()
  .then(() => {
    console.log('[Seed] Platform cost categories seeding finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[Seed] Failed:', error);
    process.exit(1);
  });

export { seedCostCategories };
