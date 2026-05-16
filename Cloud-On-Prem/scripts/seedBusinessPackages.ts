import { db } from '../server/db';
import { businessPackages, businessPackagePrices } from '../shared/schema';

const packages = [
  {
    name: 'Starter',
    tier: 'starter',
    maxLearners: 25,
    maxTeachers: 3,
    maxOrgAdmins: 2,
    monthlyCredits: 100,
    annualDiscountPercent: '10.00',
    valueProposition: 'Perfect for small teams getting started with LearnPlay. Get 2 months free when you pay annually!',
    features: ['Up to 25 learners', '3 teachers', '100 monthly LP Credits', 'Standard support', 'Quiz creation', 'Basic analytics'],
    badge: null,
    colorScheme: 'green',
    isActive: true,
    displayOrder: 1,
  },
  {
    name: 'Professional',
    tier: 'professional',
    maxLearners: 100,
    maxTeachers: 10,
    maxOrgAdmins: 5,
    monthlyCredits: 500,
    annualDiscountPercent: '15.00',
    valueProposition: 'Ideal for growing organizations. Save 15% with annual billing!',
    features: ['Up to 100 learners', '10 teachers', '500 monthly LP Credits', 'Priority support', 'AI quiz generation', 'Advanced analytics', 'Custom branding'],
    badge: 'Most Popular',
    colorScheme: 'blue',
    isActive: true,
    displayOrder: 2,
  },
  {
    name: 'Enterprise',
    tier: 'enterprise',
    maxLearners: 500,
    maxTeachers: 50,
    maxOrgAdmins: 20,
    monthlyCredits: 2500,
    annualDiscountPercent: '20.00',
    valueProposition: 'For large organizations with unlimited potential. Best value with 20% annual discount!',
    features: ['Up to 500 learners', '50 teachers', '2500 monthly LP Credits', 'Dedicated support', 'API access', 'SSO integration', 'White-label options', 'Custom integrations'],
    badge: 'Best Value',
    colorScheme: 'purple',
    isActive: true,
    displayOrder: 3,
  },
];

const prices = [
  // Starter ZAR
  { tier: 'starter', currency: 'ZAR', pricePerLearner: '79.00', pricePerTeacher: '149.00', pricePerOrgAdmin: '199.00' },
  // Starter EUR
  { tier: 'starter', currency: 'EUR', pricePerLearner: '4.50', pricePerTeacher: '8.50', pricePerOrgAdmin: '12.00' },
  // Professional ZAR
  { tier: 'professional', currency: 'ZAR', pricePerLearner: '69.00', pricePerTeacher: '129.00', pricePerOrgAdmin: '179.00' },
  // Professional EUR
  { tier: 'professional', currency: 'EUR', pricePerLearner: '3.90', pricePerTeacher: '7.50', pricePerOrgAdmin: '10.50' },
  // Enterprise ZAR
  { tier: 'enterprise', currency: 'ZAR', pricePerLearner: '59.00', pricePerTeacher: '109.00', pricePerOrgAdmin: '149.00' },
  // Enterprise EUR
  { tier: 'enterprise', currency: 'EUR', pricePerLearner: '3.40', pricePerTeacher: '6.50', pricePerOrgAdmin: '8.50' },
];

async function seed() {
  console.log('Seeding business packages...');
  
  // Insert packages
  for (const pkg of packages) {
    const result = await db.insert(businessPackages).values(pkg).onConflictDoNothing().returning();
    
    if (result.length === 0) {
      console.log(`Package already exists: ${pkg.name} (skipping)`);
      continue;
    }
    
    const inserted = result[0];
    console.log(`Created package: ${inserted.name}`);
    
    // Insert prices for this package
    const packagePrices = prices.filter(p => p.tier === pkg.tier);
    for (const price of packagePrices) {
      await db.insert(businessPackagePrices).values({
        packageId: inserted.id,
        currency: price.currency as any,
        pricePerLearner: price.pricePerLearner,
        pricePerTeacher: price.pricePerTeacher,
        pricePerOrgAdmin: price.pricePerOrgAdmin,
        isActive: true,
      }).onConflictDoNothing();
      console.log(`  Added ${price.currency} pricing`);
    }
  }
  
  console.log('Seeding complete!');
  process.exit(0);
}

seed().catch(console.error);
