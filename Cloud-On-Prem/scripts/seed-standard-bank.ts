import { db } from '../server/db';
import { organizations, brandingThemes } from '../shared/schema';
import { buildFullTokens } from '../shared/themeTokenBuilder';
import { sql } from 'drizzle-orm';

async function seedStandardBank() {
  console.log('Seeding Standard Bank organization and branding theme...');

  const tokens = buildFullTokens({
    primary: 'hsl(221, 100%, 32%)',
    primaryForeground: 'hsl(0, 0%, 100%)',
    secondary: 'hsl(208, 100%, 30%)',
    secondaryForeground: 'hsl(0, 0%, 100%)',
    accent: 'hsl(352, 75%, 52%)',
    accentForeground: 'hsl(0, 0%, 100%)',
    background: 'hsl(220, 20%, 98%)',
    foreground: 'hsl(221, 30%, 12%)',
    card: 'hsl(0, 0%, 100%)',
    cardForeground: 'hsl(221, 30%, 12%)',
    muted: 'hsl(220, 15%, 94%)',
    mutedForeground: 'hsl(221, 12%, 50%)',
    border: 'hsl(220, 15%, 88%)',
    ring: 'hsl(221, 100%, 32%)',
    gradientFrom: 'hsl(221, 100%, 32%)',
    gradientTo: 'hsl(208, 100%, 30%)',
    gamePrimary: 'hsl(45, 90%, 50%)',
    gameGlow: 'hsla(45, 90%, 50%, 0.5)',
  });

  const inviteCode = 'SB-DEMO-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  
  const [org] = await db.insert(organizations).values({
    name: 'Standard Bank',
    type: 'business',
    inviteCode,
    country: 'South Africa',
    city: 'Johannesburg',
    province: 'Gauteng',
    isActive: true,
    isDemo: true,
    subscriptionStatus: 'active',
    pricingTier: 'enterprise',
  }).returning();

  console.log(`Created organization: ${org.name} (${org.id})`);
  console.log(`Invite code: ${inviteCode}`);

  const [theme] = await db.insert(brandingThemes).values({
    organizationId: org.id,
    orgName: 'Standard Bank',
    status: 'active',
    presetId: 'standard-bank',
    tokens,
    fontHeading: 'Inter',
    fontBody: 'Inter',
    allowEmailBranding: false,
    enableContrastCorrections: true,
    gradientEnabled: true,
    gradientFrom: 'hsl(221, 100%, 32%)',
    gradientTo: 'hsl(208, 100%, 30%)',
    gradientAngle: '135deg',
  }).returning();

  console.log(`Created branding theme: ${theme.id} for organization ${org.id}`);
  console.log('Standard Bank seed complete!');
  
  process.exit(0);
}

seedStandardBank().catch((err) => {
  console.error('Error seeding Standard Bank:', err);
  process.exit(1);
});
