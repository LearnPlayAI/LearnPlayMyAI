// @ts-nocheck
import { db } from "./db";
import {
  powerUpCatalog,
  cosmeticCatalog,
  challengeTemplates,
  achievementCatalog,
  seasonPassTiers,
} from "@shared/schema";

export async function seedGamificationData() {
  console.log("Seeding gamification data...");

  // Clear existing data (optional - comment out if you want to keep existing data)
  await db.delete(powerUpCatalog);
  await db.delete(cosmeticCatalog);
  await db.delete(challengeTemplates);
  await db.delete(achievementCatalog);
  await db.delete(seasonPassTiers);

  // Seed Power-Ups
  const powerUps = [
    {
      name: "XP Boost (10 min)",
      description: "Double XP for 10 minutes",
      type: "xp_boost",
      effect: { multiplier: 2, duration: 600 },
      coinCost: 100,
      tier: "common",
      isActive: true,
    },
    {
      name: "XP Boost (30 min)",
      description: "Double XP for 30 minutes",
      type: "xp_boost",
      effect: { multiplier: 2, duration: 1800 },
      coinCost: 250,
      tier: "rare",
      isActive: true,
    },
    {
      name: "Triple XP (5 min)",
      description: "Triple XP for 5 minutes",
      type: "xp_boost",
      effect: { multiplier: 3, duration: 300 },
      coinCost: 300,
      tier: "epic",
      isActive: true,
    },
    {
      name: "Time Extension",
      description: "+30 seconds for each question",
      type: "time_extension",
      effect: { bonus: 30, duration: 600 },
      coinCost: 200,
      tier: "rare",
      isActive: true,
    },
  ];

  await db.insert(powerUpCatalog).values(powerUps);
  console.log(`✓ Seeded ${powerUps.length} power-ups`);

  // Seed Cosmetics
  const cosmetics = [
    {
      name: "Red Glow",
      description: "Red glow effect around avatar",
      type: "avatar_ring",
      effect: { color: "#ff0000", animation: "glow" },
      coinCost: 500,
      tier: "common",
      isActive: true,
    },
    {
      name: "Blue Glow",
      description: "Blue glow effect around avatar",
      type: "avatar_ring",
      effect: { color: "#0066ff", animation: "glow" },
      coinCost: 500,
      tier: "common",
      isActive: true,
    },
    {
      name: "Golden Glow",
      description: "Golden glow effect around avatar",
      type: "avatar_ring",
      effect: { color: "#ffd700", animation: "glow" },
      coinCost: 1000,
      tier: "rare",
      isActive: true,
    },
    {
      name: "Fire Ring",
      description: "Ring of fire around avatar",
      type: "avatar_ring",
      effect: { color: "#ff4500", animation: "fire" },
      coinCost: 2000,
      tier: "epic",
      isActive: true,
    },
    {
      name: "Lightning Aura",
      description: "Electric lightning aura",
      type: "avatar_ring",
      effect: { color: "#00ffff", animation: "lightning" },
      coinCost: 3000,
      tier: "legendary",
      isActive: true,
    },
    {
      name: "Diamond Frame",
      description: "Diamond-shaped avatar frame",
      type: "avatar_frame",
      effect: { shape: "diamond", color: "#ffffff" },
      coinCost: 1500,
      tier: "rare",
      isActive: true,
    },
    {
      name: "Crown Frame",
      description: "Crown-shaped avatar frame",
      type: "avatar_frame",
      effect: { shape: "crown", color: "#ffd700" },
      coinCost: 2500,
      tier: "epic",
      isActive: true,
    },
    {
      name: "Purple Name",
      description: "Purple colored username",
      type: "name_color",
      effect: { color: "#9b59b6" },
      coinCost: 800,
      tier: "common",
      isActive: true,
    },
    {
      name: "Golden Name",
      description: "Golden colored username",
      type: "name_color",
      effect: { color: "#ffd700" },
      coinCost: 1200,
      tier: "rare",
      isActive: true,
    },
    {
      name: "Rainbow Name",
      description: "Rainbow gradient username",
      type: "name_color",
      effect: { color: "rainbow", animation: "gradient" },
      coinCost: 2000,
      tier: "epic",
      isActive: true,
    },
  ];

  await db.insert(cosmeticCatalog).values(cosmetics);
  console.log(`✓ Seeded ${cosmetics.length} cosmetics`);

  // Seed Daily Challenges
  const dailyChallenges = [
    {
      name: "Daily Learner",
      description: "Complete 3 quizzes today",
      type: "daily",
      requirement: "complete_quizzes",
      targetValue: 3,
      coinReward: 50,
      xpReward: 100,
      isActive: true,
    },
    {
      name: "Perfect Day",
      description: "Pass 5 quizzes today",
      type: "daily",
      requirement: "pass_quizzes",
      targetValue: 5,
      coinReward: 100,
      xpReward: 200,
      isActive: true,
    },
    {
      name: "Streak Master",
      description: "Win 3 quizzes in a row",
      type: "daily",
      requirement: "win_streak",
      targetValue: 3,
      coinReward: 150,
      xpReward: 300,
      isActive: true,
    },
  ];

  await db.insert(challengeTemplates).values(dailyChallenges);
  console.log(`✓ Seeded ${dailyChallenges.length} daily challenges`);

  // Seed Weekly Challenges
  const weeklyChallenges = [
    {
      name: "Weekly Scholar",
      description: "Complete 20 quizzes this week",
      type: "weekly",
      requirement: "complete_quizzes",
      targetValue: 20,
      coinReward: 300,
      xpReward: 500,
      isActive: true,
    },
    {
      name: "Perfect Week",
      description: "Pass 15 quizzes this week",
      type: "weekly",
      requirement: "pass_quizzes",
      targetValue: 15,
      coinReward: 500,
      xpReward: 1000,
      isActive: true,
    },
    {
      name: "Quiz Marathon",
      description: "Complete 50 quizzes this week",
      type: "weekly",
      requirement: "complete_quizzes",
      targetValue: 50,
      coinReward: 1000,
      xpReward: 2000,
      isActive: true,
    },
  ];

  await db.insert(challengeTemplates).values(weeklyChallenges);
  console.log(`✓ Seeded ${weeklyChallenges.length} weekly challenges`);

  // Seed Achievements
  const achievements = [
    {
      name: "First Steps",
      description: "Complete your first quiz",
      category: "quizzes",
      requirement: "complete_quizzes",
      targetValue: 1,
      coinReward: 100,
      isActive: true,
    },
    {
      name: "Quiz Novice",
      description: "Complete 10 quizzes",
      category: "quizzes",
      requirement: "complete_quizzes",
      targetValue: 10,
      coinReward: 200,
      isActive: true,
    },
    {
      name: "Quiz Expert",
      description: "Complete 50 quizzes",
      category: "quizzes",
      requirement: "complete_quizzes",
      targetValue: 50,
      coinReward: 500,
      isActive: true,
    },
    {
      name: "Quiz Master",
      description: "Complete 100 quizzes",
      category: "quizzes",
      requirement: "complete_quizzes",
      targetValue: 100,
      coinReward: 1000,
      permanentBonus: { xpMultiplier: 1.05 },
      isActive: true,
    },
    {
      name: "Perfect Score",
      description: "Get 100% on a quiz",
      category: "perfection",
      requirement: "perfect_scores",
      targetValue: 1,
      coinReward: 150,
      isActive: true,
    },
    {
      name: "Perfectionist",
      description: "Get 100% on 10 quizzes",
      category: "perfection",
      requirement: "perfect_scores",
      targetValue: 10,
      coinReward: 500,
      permanentBonus: { xpMultiplier: 1.03 },
      isActive: true,
    },
    {
      name: "Week Warrior",
      description: "Login for 7 days in a row",
      category: "streaks",
      requirement: "login_streak",
      targetValue: 7,
      coinReward: 300,
      isActive: true,
    },
    {
      name: "Month Master",
      description: "Login for 30 days in a row",
      category: "streaks",
      requirement: "login_streak",
      targetValue: 30,
      coinReward: 1500,
      permanentBonus: { xpMultiplier: 1.1 },
      isActive: true,
    },
    {
      name: "Level 10",
      description: "Reach level 10",
      category: "milestones",
      requirement: "reach_level",
      targetValue: 10,
      coinReward: 250,
      isActive: true,
    },
    {
      name: "Level 25",
      description: "Reach level 25",
      category: "milestones",
      requirement: "reach_level",
      targetValue: 25,
      coinReward: 750,
      isActive: true,
    },
    {
      name: "Level 50",
      description: "Reach level 50",
      category: "milestones",
      requirement: "reach_level",
      targetValue: 50,
      coinReward: 2000,
      permanentBonus: { xpMultiplier: 1.15 },
      isActive: true,
    },
  ];

  await db.insert(achievementCatalog).values(achievements);
  console.log(`✓ Seeded ${achievements.length} achievements`);

  // Seed Season Pass Tiers (Season 1)
  const seasonTiers = [];
  for (let tier = 1; tier <= 20; tier++) {
    const xpRequired = tier * 1000; // Progressive XP requirements
    
    let rewardType: string;
    let rewardAmount = 0;
    
    if (tier % 5 === 0) {
      // Every 5th tier gives a power-up or cosmetic
      rewardType = tier % 10 === 0 ? "cosmetic" : "power_up";
    } else {
      // Other tiers give coins
      rewardType = "coins";
      rewardAmount = 50 + (tier * 10);
    }

    seasonTiers.push({
      seasonNumber: 1,
      tier,
      xpRequired,
      rewardType,
      rewardId: null, // Would be set to specific power-up/cosmetic IDs
      rewardAmount,
      isActive: true,
    });
  }

  await db.insert(seasonPassTiers).values(seasonTiers);
  console.log(`✓ Seeded ${seasonTiers.length} season pass tiers`);

  console.log("✓ Gamification data seeded successfully!");
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedGamificationData()
    .then(() => {
      console.log("Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Error seeding gamification data:", error);
      process.exit(1);
    });
}
