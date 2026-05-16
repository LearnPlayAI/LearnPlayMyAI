import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, timestamp, jsonb, index, unique, uniqueIndex, pgEnum, date, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import type { LearningAssetContract } from "./contentParsers";

// ==================== E-LEARNING PLATFORM ENUMS ====================

// Organization type enum (education, business, elearning)
export const organizationTypeEnum = pgEnum("organizationType", [
  "education",
  "business",
  "elearning"
]);

// Currency codes for multi-currency support
export const currencyCodeEnum = pgEnum("currencyCode", [
  "ZAR",
  "USD",
  "EUR"
]);

// Course status enum
export const courseStatusEnum = pgEnum("courseStatus", [
  "draft",
  "active",
  "inactive",
  "archived"
]);

// Course visibility enum - controls who can access the course
export const courseVisibilityEnum = pgEnum("courseVisibility", [
  "public",    // Visible to all users, purchasable on marketplace (elearning orgs)
  "org_only"   // Only visible to members of the owning organization (education/business orgs)
]);

// Payout status enum
export const payoutStatusEnum = pgEnum("payoutStatus", [
  "pending",
  "paid",
  "cancelled"
]);

// Payment transaction status enum
export const paymentStatusEnum = pgEnum("paymentStatus", [
  "pending",
  "completed",
  "failed",
  "cancelled"
]);

// Currency rate source enum
export const rateSourceEnum = pgEnum("rateSource", [
  "auto",
  "manual"
]);

// Course difficulty level enum
export const difficultyLevelEnum = pgEnum("difficultyLevel", [
  "beginner",
  "intermediate",
  "advanced"
]);

// Lesson progress status enum
export const lessonProgressStatusEnum = pgEnum("lessonProgressStatus", [
  "not_started",
  "in_progress",
  "completed"
]);

// YOCO payment mode enum
export const yocoModeEnum = pgEnum("yocoMode", [
  "test",
  "live"
]);

// Webhook event source enum
export const webhookSourceEnum = pgEnum("webhookSource", [
  "yoco",
  "mailersend"
]);

// Subscription status enum
export const subscriptionStatusEnum = pgEnum("subscriptionStatus", [
  "active",
  "grace",
  "past_due",
  "suspended",
  "cancelled"
]);

// Subscription interval enum
export const subscriptionIntervalEnum = pgEnum("subscriptionInterval", [
  "monthly",
  "annual"
]);

// Subscription plan type enum
export const subscriptionPlanTypeEnum = pgEnum("subscriptionPlanType", [
  "learner",
  "educator"
]);

// Subscription target type enum
export const subscriptionTargetTypeEnum = pgEnum("subscriptionTargetType", [
  "organization",
  "user"
]);

// Invoice status enum
export const invoiceStatusEnum = pgEnum("invoiceStatus", [
  "pending",
  "paid",
  "failed",
  "cancelled"
]);

// Email status enum
export const emailStatusEnum = pgEnum("emailStatus", [
  "queued",
  "sent",
  "delivered",
  "failed",
  "bounced"
]);

// License tier enum
export const licenseTierEnum = pgEnum("licenseTier", [
  "blue",
  "red",
  "gold"
]);

// License status enum
export const licenseStatusEnum = pgEnum("licenseStatus", [
  "active",
  "inactive",
  "expired"
]);

// License payment fulfillment status enum
export const fulfillmentStatusEnum = pgEnum("fulfillmentStatus", [
  "pending",
  "succeeded",
  "failed"
]);

// Organization license status enum
export const organizationLicenseStatusEnum = pgEnum("organizationLicenseStatus", [
  "pending",
  "active",
  "expired",
  "suspended"
]);

// Notification type enum
export const notificationTypeEnum = pgEnum("notificationType", [
  "course_purchase",
  "course_version_update",
  "payout_processed",
  "review_posted",
  "system_announcement"
]);

// Bulk job status enum
export const bulkJobStatusEnum = pgEnum("bulkJobStatus", [
  "pending",
  "in_progress",
  "completed",
  "failed",
  "partial"
]);

// Review moderation action enum
export const reviewModerationActionEnum = pgEnum("reviewModerationAction", [
  "hide",
  "unhide",
  "flag_spam",
  "approve"
]);

// Course refund status enum
export const courseRefundStatusEnum = pgEnum("courseRefundStatus", [
  "pending",
  "approved",
  "declined",
  "paid"
]);

// Subscription cancellation source enum
export const subscriptionCancellationSourceEnum = pgEnum("subscriptionCancellationSource", [
  "user",
  "admin",
  "system",
  "payment_failed"
]);

// Certificate type enum - course certificates only
export const certificateTypeEnum = pgEnum("certificateType", [
  "course"
]);

// ==================== PLATFORM REVENUE REPORTS ENUMS ====================

// Revenue source type enum
export const revenueSourceTypeEnum = pgEnum("revenueSourceType", [
  "course_purchase",
  "credit_purchase",
  "license_purchase",
  "subscription_payment",
  "yoco_settlement",
  "chargeback",
  "sponsorship",
  "manual_entry"
]);

// Cost category type enum
export const costCategoryTypeEnum = pgEnum("costCategoryType", [
  "infrastructure",
  "payment_processing",
  "api_services",
  "staffing",
  "marketing",
  "revenue_share",
  "refund_payout",
  "other"
]);

// Cost recurrence enum
export const costRecurrenceEnum = pgEnum("costRecurrence", [
  "one_time",
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "annual"
]);

// Report status enum
export const reportStatusEnum = pgEnum("reportStatus", [
  "pending",
  "processing",
  "completed",
  "failed"
]);

// Report format enum
export const reportFormatEnum = pgEnum("reportFormat", [
  "csv",
  "pdf",
  "json"
]);

// ==================== END PLATFORM REVENUE REPORTS ENUMS ====================

export const translationStatusEnum = pgEnum("translationStatus", ["published", "draft"]);

// ==================== END E-LEARNING ENUMS ====================

// Session storage table (required for auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User accounts with gamer profiles
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gamerName: varchar("gamerName").notNull().unique(),
  email: varchar("email").notNull().unique(),
  password: varchar("password").notNull(),
  isAdmin: boolean("isAdmin").default(false),
  isSuperAdmin: boolean("isSuperAdmin").default(false), // Super admin can create organizations
  isCustSuper: boolean("isCustSuper").default(false),
  firstName: varchar("firstName"),
  lastName: varchar("lastName"),
  positionAtOrg: varchar("positionAtOrg"), // User's position/role title at their organization
  profileImageUrl: varchar("profileImageUrl"),
  avatarImageUrl: varchar("avatarImageUrl"),
  country: varchar("country", { length: 3 }), // ISO 3166-1 alpha-3 country codes
  bio: text("bio"), // Player bio/about section
  playerTitle: varchar("playerTitle").default("Rookie"), // Rookie, Champion, Legend, etc.
  preferredGameModes: jsonb("preferredGameModes"), // Array of preferred game modes
  isStatsPublic: boolean("isStatsPublic").default(true), // Privacy setting for stats
  bestWinStreak: integer("bestWinStreak").default(0),
  currentWinStreak: integer("currentWinStreak").default(0),
  averageGameDuration: integer("averageGameDuration").default(0), // in seconds
  totalGamesPlayed: integer("totalGamesPlayed").default(0),
  totalWins: integer("totalWins").default(0),
  winPercentage: decimal("winPercentage", { precision: 5, scale: 2 }).default("0.00"),
  isLocked: boolean("isLocked").default(false),
  isDisabled: boolean("isDisabled").default(false), // Disabled users cannot log in or reset password
  failedLoginAttempts: integer("failedLoginAttempts").default(0),
  lockedUntil: timestamp("lockedUntil"),
  passwordResetToken: varchar("passwordResetToken"),
  passwordResetExpires: timestamp("passwordResetExpires"),
  emailVerified: boolean("emailVerified").default(false),
  emailVerificationToken: varchar("emailVerificationToken"),
  emailVerificationExpiry: timestamp("emailVerificationExpiry"),
  lastActiveAt: timestamp("lastActiveAt").defaultNow(),
  timezone: varchar("timezone"), // E-learning: User timezone preference (e.g., "Africa/Johannesburg", "America/New_York")
  preferredCurrency: currencyCodeEnum("preferredCurrency").default("ZAR"), // E-learning: User's preferred display currency (defaults to ZAR)
  preferredLanguage: varchar("preferredLanguage", { length: 10 }).default("en"),
  needsCurrencyOnboarding: boolean("needsCurrencyOnboarding").default(true), // E-learning: Show currency preference modal on first login
  sessionVersion: integer("sessionVersion").notNull().default(1), // Session invalidation version - increment to force re-authentication
  lpCreditBalance: integer("lpCreditBalance").notNull().default(0), // Unified LP Credit balance (single source of truth)
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

// Universal stat units that can be used across all collections (includes both predefined and custom units)
export const universalStatUnits = pgTable("universalStatUnits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  unitName: varchar("unitName").notNull().unique(), // e.g., "kg", "°C", "mph", "amu"
  unitSymbol: varchar("unitSymbol").notNull(), // The actual symbol to display
  description: text("description"), // Optional description of what this unit measures
  category: varchar("category"), // e.g., "weight", "temperature", "speed", "atomic"
  isActive: boolean("isActive").default(true),
  isPredefined: boolean("isPredefined").default(false), // true for system predefined units, false for custom user-created units
  createdBy: varchar("createdBy").references(() => users.id), // null for predefined units, user ID for custom units
  createdAt: timestamp("createdAt").defaultNow(),
});

// Card collections (Dinosaurs, Cars, etc.)
export const cardCollections = pgTable("cardCollections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description"),
  totalCards: integer("totalCards").notNull(),
  imageKey: varchar("imageKey"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow(),
});

// Defines what stats each collection uses
export const collectionStatTypes = pgTable("collectionStatTypes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collectionId: varchar("collectionId").notNull().references(() => cardCollections.id),
  statName: varchar("statName").notNull(),
  statUnit: varchar("statUnit"), // Can be custom unit or reference to universal unit symbol
  universalUnitId: varchar("universalUnitId").references(() => universalStatUnits.id), // Optional reference to universal unit
  displayOrder: integer("displayOrder").notNull(),
  comparisonType: varchar("comparisonType").default("highest"), // "highest", "closest_to_zero"
});

// Individual cards within collections
export const cards = pgTable("cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collectionId: varchar("collectionId").notNull().references(() => cardCollections.id),
  name: varchar("name").notNull(),
  imageKey: varchar("imageKey"),
  displayOrder: integer("displayOrder").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
});

// Actual stat values for each card
export const cardStats = pgTable("cardStats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cardId: varchar("cardId").notNull().references(() => cards.id),
  statTypeId: varchar("statTypeId").notNull().references(() => collectionStatTypes.id),
  value: decimal("value", { precision: 10, scale: 3 }).notNull(),
});

// Active game rooms for real-time multiplayer
export const gameRooms = pgTable("gameRooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hostPlayerId: varchar("hostPlayerId").notNull().references(() => users.id),
  collectionId: varchar("collectionId").notNull().references(() => cardCollections.id),
  gameMode: varchar("gameMode").notNull(), // "single", "1v1", "4player"
  maxPlayers: integer("maxPlayers").notNull(),
  currentPlayers: integer("currentPlayers").default(1),
  gameState: varchar("gameState").default("waiting"), // "waiting", "playing", "finished"
  gameData: jsonb("gameData"), // Current game state, timers, etc.
  roundTimeSeconds: integer("roundTimeSeconds").default(5), // Time to choose stat (3, 5, 10)
  gameTimeSeconds: integer("gameTimeSeconds").default(120), // Total game time (120=2min, 300=5min, 600=10min)
  joinCode: varchar("joinCode").notNull().unique(),
  gameStartedAt: timestamp("gameStartedAt"),
  gameEndedAt: timestamp("gameEndedAt"),
  createdAt: timestamp("createdAt").defaultNow(),
});

// Player sessions in active games
export const playerSessions = pgTable("playerSessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameRoomId: varchar("gameRoomId").notNull().references(() => gameRooms.id),
  playerId: varchar("playerId").references(() => users.id), // null for NPC
  playerName: varchar("playerName").notNull(), // "NPC" for AI players
  playerPosition: integer("playerPosition").notNull(), // 0, 1, 2, 3
  cardStack: text("cardStack").array().notNull(), // Array of card IDs
  cardCount: integer("cardCount").notNull(),
  isActive: boolean("isActive").default(false), // Current turn player
  isNPC: boolean("isNPC").default(false),
  joinedAt: timestamp("joinedAt").defaultNow(),
});

// Game results for leaderboard calculation
export const gameResults = pgTable("gameResults", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameRoomId: varchar("gameRoomId").references(() => gameRooms.id), // null for single player games
  collectionId: varchar("collectionId").notNull().references(() => cardCollections.id),
  winnerId: varchar("winnerId").references(() => users.id), // can be null for ties or guest wins
  gameMode: varchar("gameMode").notNull(), // "single", "1v1", "4player"
  playerIds: text("playerIds").array().notNull(),
  playerXPChanges: jsonb("playerXPChanges"), // JSON object mapping player IDs to their XP changes: { "playerId": { xpChange: number, newXP: number, newRank: string } }
  totalRounds: integer("totalRounds").notNull(),
  gameDuration: integer("gameDuration"), // in seconds
  isMultiplayer: boolean("isMultiplayer").default(true), // false for single player
  gameStartedAt: timestamp("gameStartedAt").notNull(),
  gameEndedAt: timestamp("gameEndedAt").notNull(),
},
(table) => [
  // Composite index for leaderboard: queries by winnerId, sorted by gameEndedAt DESC
  index("IDX_game_results_winner_ended").on(table.winnerId, table.gameEndedAt),
  // GIN index for player game history: supports ANY(playerIds) array lookups
  // Note: Created via direct SQL: CREATE INDEX "IDX_game_results_player_ids" ON "gameResults" USING GIN ("playerIds")
]);

// Leaderboard table for demo players and rankings
export const leaderBoard = pgTable("leaderBoard", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gamerName: varchar("gamerName").notNull().unique(),
  avatarImageUrl: varchar("avatarImageUrl"),
  country: varchar("country", { length: 3 }), // ISO 3166-1 alpha-3 country codes
  playerTitle: varchar("playerTitle").default("Rookie"), // Rookie, Champion, Legend, etc.
  rank: integer("rank").default(0), // Calculated rank based on player stats
  totalWins: integer("totalWins").default(0),
  totalGames: integer("totalGames").default(0),
  winPercentage: decimal("winPercentage", { precision: 5, scale: 2 }).default("0.00"),
  bestWinStreak: integer("bestWinStreak").default(0),
  currentWinStreak: integer("currentWinStreak").default(0),
  averageGameDuration: integer("averageGameDuration").default(0), // in seconds
  lastActiveAt: timestamp("lastActiveAt").defaultNow(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

// Player stats table for XP and calculated statistics
export const playerStats = pgTable("playerStats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("playerId").notNull().references(() => users.id).unique(),
  gamerName: varchar("gamerName").notNull(),
  currentXP: integer("currentXP").default(0),
  currentLevel: integer("currentLevel").default(1),
  currentRank: varchar("currentRank").default("Rookie"), // Kept for backwards compatibility
  totalGamesPlayed: integer("totalGamesPlayed").default(0),
  totalWins: integer("totalWins").default(0),
  totalLosses: integer("totalLosses").default(0),
  winPercentage: decimal("winPercentage", { precision: 5, scale: 2 }).default("0.00"),
  currentWinStreak: integer("currentWinStreak").default(0),
  bestWinStreak: integer("bestWinStreak").default(0),
  singlePlayerGames: integer("singlePlayerGames").default(0),
  singlePlayerWins: integer("singlePlayerWins").default(0),
  multiplayerGames: integer("multiplayerGames").default(0),
  multiplayerWins: integer("multiplayerWins").default(0),
  averageGameDuration: integer("averageGameDuration").default(0), // in seconds
  totalXPEarned: integer("totalXPEarned").default(0),
  totalXPLost: integer("totalXPLost").default(0),
  certificatesEarned: integer("certificatesEarned").default(0), // Track earned course certificates
  lastGameAt: timestamp("lastGameAt"),
  lastLevelChangeAt: timestamp("lastLevelChangeAt"),
  lastRankChangeAt: timestamp("lastRankChangeAt"), // Kept for backwards compatibility
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

// Guest sessions for anonymous users
export const guestSessions = pgTable("guestSessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("sessionId").notNull().unique(), // From express session
  guestName: varchar("guestName").notNull(), // Generated consistent name like "Guest_RedDragon"
  lastActiveAt: timestamp("lastActiveAt").defaultNow(),
  createdAt: timestamp("createdAt").defaultNow(),
});

// Active 1v1 games for matchmaking and game state
export const activeOneVOneGames = pgTable("activeOneVOneGames", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("gameId").notNull().unique(), // Match ID like "match_1234567890_abc123"
  collectionId: varchar("collectionId").notNull().references(() => cardCollections.id),
  player1Id: varchar("player1Id").notNull(), // Session ID or user ID
  player1Name: varchar("player1Name").notNull(),
  player1SocketId: varchar("player1SocketId"),
  player1Ready: boolean("player1Ready").default(false),
  player2Id: varchar("player2Id").notNull(), // Session ID or user ID  
  player2Name: varchar("player2Name").notNull(),
  player2SocketId: varchar("player2SocketId"),
  player2Ready: boolean("player2Ready").default(false),
  currentTurn: varchar("currentTurn").notNull().default("player1"), // "player1" or "player2"
  gamePhase: varchar("gamePhase").notNull().default("waiting"), // "waiting", "playing", "finished"
  bothPlayersReady: boolean("bothPlayersReady").default(false),
  roundTimeSeconds: integer("roundTimeSeconds").notNull().default(5),
  gameTimeSeconds: integer("gameTimeSeconds").notNull().default(120),
  gameStartedAt: timestamp("gameStartedAt"),
  lastActivityAt: timestamp("lastActivityAt").defaultNow(),
  createdAt: timestamp("createdAt").defaultNow(),
  
  // Server-side game state for authoritative gameplay
  gameSeed: text("gameSeed"), // For deterministic card shuffling (using text to store large timestamp values)
  roundNumber: integer("roundNumber").default(1),
  player1Deck: text("player1Deck"), // JSON array of remaining cards
  player2Deck: text("player2Deck"), // JSON array of remaining cards  
  player1WonCards: text("player1WonCards"), // JSON array of won cards
  player2WonCards: text("player2WonCards"), // JSON array of won cards
  player1RoundsWon: integer("player1RoundsWon").default(0), // Track rounds won for XP display
  player2RoundsWon: integer("player2RoundsWon").default(0), // Track rounds won for XP display
  tiedCards: text("tiedCards"), // JSON array of tied cards
  player1CurrentCard: text("player1CurrentCard"), // JSON object of current card
  player2CurrentCard: text("player2CurrentCard"), // JSON object of current card
  selectedStatTypeId: varchar("selectedStatTypeId"), // Currently selected stat for comparison
  roundWinner: varchar("roundWinner"), // "player1", "player2", or "tie"
  roundPhase: varchar("roundPhase").default("selecting"), // "selecting", "revealing", "processing"
  
  // Special tie mode fields (when someone has 1 card left)
  isSpecialTieMode: boolean("isSpecialTieMode").default(false), // Flag for special tie handling
  tiedStats: text("tiedStats"), // JSON array of stat IDs that have tied in special mode
  specialTieStatName: varchar("specialTieStatName"), // Name of original tied stat for display
},
(table) => [
  index("IDX_active_games_last_activity").on(table.lastActivityAt),
  index("IDX_active_games_game_phase").on(table.gamePhase),
]);

// Organizations (Schools, Businesses)
export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  type: organizationTypeEnum("type").notNull().default("education"), // "education", "business", or "elearning"
  inviteCode: varchar("inviteCode").notNull().unique(), // Unique code for registration
  curriculum: varchar("curriculum"), // "CAPS" or "IEB" for education type
  streetAddress: varchar("streetAddress"),
  city: varchar("city"),
  province: varchar("province"),
  postalCode: varchar("postalCode"),
  country: varchar("country").default("South Africa"),
  contactPhone: varchar("contactPhone"), // Organization contact phone number
  studentCount: integer("studentCount").default(0), // Expected number of students
  howHeardAboutUs: varchar("howHeardAboutUs"), // How they found out about LearnPlay
  isActive: boolean("isActive").default(true),
  isDemo: boolean("isDemo").default(false), // Demo orgs are excluded from trial expiration and billing
  isGeneralOrg: boolean("isGeneralOrg").default(false), // General org: auto-approve users without join code, bypass subscription checks
  isShowcaseOrg: boolean("isShowcaseOrg").default(false), // Showcase org: courses in showcase departments are publicly accessible without auth
  subscriptionStatus: varchar("subscriptionStatus").default("trial"), // "trial", "active", "suspended", "cancelled"
  trialStartDate: timestamp("trialStartDate").defaultNow(),
  trialEndDate: timestamp("trialEndDate"), // Calculated: trialStartDate + 30 days
  subscriptionStartDate: timestamp("subscriptionStartDate"), // When converted from trial
  billingEmail: varchar("billingEmail"),
  pricingTier: varchar("pricingTier").default("starter"), // "starter", "professional", "enterprise"
  monthlyPrice: decimal("monthlyPrice", { precision: 10, scale: 2 }).default("0.00"),
  lastCreditResetDate: timestamp("lastCreditResetDate"), // Last time credits were reset (30-day cycle)
  bonusCredits: integer("bonusCredits").default(0), // Admin-added bonus credits (don't reset monthly)
  trialGammaUserId: varchar("trialGammaUserId").references(() => users.id), // User authorized to use Gamma API credits in trial orgs
  trialCreditsAwarded: boolean("trialCreditsAwarded").default(false), // Whether one-time trial credits have been given
  orgCreditWallet: integer("orgCreditWallet").default(0), // Organization-level purchased credits (shared by authorized users)
  useOrgCreditWallet: boolean("useOrgCreditWallet").default(true), // Feature flag: when true, org admins use org wallet instead of personal credits (default enabled for new orgs)
  allowTeachersToSpendCredits: boolean("allowTeachersToSpendCredits").default(true), // When true, teachers can also spend org credits (default enabled for new orgs)
  timezone: varchar("timezone"), // E-learning: Organization timezone (e.g., "Africa/Johannesburg") - used as default for all users
  currency: currencyCodeEnum("currency"), // E-learning: Default currency for course pricing (ZAR/USD/EUR)
  defaultLanguage: varchar("defaultLanguage", { length: 10 }).default("en"),
  commissionRate: decimal("commissionRate", { precision: 5, scale: 4 }), // E-learning: Custom commission rate override (e.g., 0.3000 = 30%), null uses platform default
  hasBankingDetails: boolean("hasBankingDetails").default(false), // E-learning: Whether org has banking details for payouts
  licenseEnabled: boolean("licenseEnabled").default(false), // License System: Whether per-seat licensing is enabled for this organization
  licenseBillingStartDate: timestamp("licenseBillingStartDate"), // License System: Date when license billing begins (null if licenses not enabled)
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

// Supported languages for content translation
export const supportedLanguages = pgTable("supportedLanguages", {
  code: varchar("code", { length: 10 }).primaryKey(),
  name: varchar("name").notNull(),
  nativeName: varchar("nativeName").notNull(),
  region: varchar("region"),
  isActive: boolean("isActive").default(true),
  sortOrder: integer("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow(),
});

// Organizational units (Grades for education, Departments for business)
export const organizationUnits = pgTable("organizationUnits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  name: varchar("name").notNull(), // "Grade 1", "Grade 2" or "Engineering", "Sales"
  displayOrder: integer("displayOrder").notNull(),
  joinCode: varchar("joinCode", { length: 50 }).unique(), // Unique join code for this unit
  isActive: boolean("isActive").default(true),
  isShowcaseDepartment: boolean("isShowcaseDepartment").default(false), // Showcase department: courses assigned here are publicly accessible without auth
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_organization_unit_join_code").on(table.joinCode),
]);

// Sub-units (Classes for education, Units for business) - Level 2
export const organizationSubUnits = pgTable("organizationSubUnits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  unitId: varchar("unitId").notNull().references(() => organizationUnits.id),
  name: varchar("name").notNull(), // "Class A", "Class B" or "Sales Unit", "Marketing Unit"
  displayOrder: integer("displayOrder").notNull(),
  joinCode: varchar("joinCode", { length: 50 }).unique(), // Unique join code for this sub-unit
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_organization_subunit_join_code").on(table.joinCode),
]);

// Teams (Sections for education, Teams for business) - Level 3
export const organizationTeams = pgTable("organizationTeams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subUnitId: varchar("subUnitId").notNull().references(() => organizationSubUnits.id),
  name: varchar("name").notNull(), // "Section A", "Section B" or "SEO Team", "Content Team"
  displayOrder: integer("displayOrder").notNull(),
  joinCode: varchar("joinCode", { length: 50 }).unique(), // Unique join code for this team
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_organization_team_join_code").on(table.joinCode),
  index("IDX_organization_team_subunit").on(table.subUnitId),
]);

// User roles within organizations
export const userOrganizationRoles = pgTable("userOrganizationRoles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  role: varchar("role").notNull(), // "org_admin", "teacher", "team_lead", "student", "employee"
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_user_org_roles").on(table.userId, table.organizationId),
]);

// User assignments to units, sub-units, and teams (3-level hierarchy)
export const userOrganizationAssignments = pgTable("userOrganizationAssignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  unitId: varchar("unitId").references(() => organizationUnits.id),       // Department (Level 1)
  subUnitId: varchar("subUnitId").references(() => organizationSubUnits.id), // Unit (Level 2)
  teamId: varchar("teamId").references(() => organizationTeams.id),       // Team (Level 3)
  subjectId: varchar("subjectId").references(() => subjects.id), // Optional subject assignment
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_user_org_assignments").on(table.userId, table.organizationId),
  index("IDX_user_org_assignments_team").on(table.teamId),
]);

// Join requests for students wanting to join organizations
export const joinRequests = pgTable("joinRequests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  requestedUnitId: varchar("requestedUnitId").references(() => organizationUnits.id), // What they requested via join code (Department)
  requestedSubUnitId: varchar("requestedSubUnitId").references(() => organizationSubUnits.id), // Unit
  requestedTeamId: varchar("requestedTeamId").references(() => organizationTeams.id), // Team (Level 3)
  requestedSubjectIds: text("requestedSubjectIds").array(), // Subjects from join code
  assignedUnitId: varchar("assignedUnitId").references(() => organizationUnits.id), // What admin assigns them to (Department)
  assignedSubUnitId: varchar("assignedSubUnitId").references(() => organizationSubUnits.id), // Unit
  assignedTeamId: varchar("assignedTeamId").references(() => organizationTeams.id), // Team (Level 3)
  assignedSubjectIds: text("assignedSubjectIds").array(), // Subjects admin assigns
  status: varchar("status").notNull().default("pending"), // "pending", "approved", "denied"
  denialReason: text("denialReason"), // Admin's reason for denial
  reviewedBy: varchar("reviewedBy").references(() => users.id), // Admin who reviewed
  reviewedAt: timestamp("reviewedAt"), // When reviewed
  approvedAt: timestamp("approvedAt"), // When approved (used for billing)
  approvalMethod: varchar("approvalMethod"), // How the request was approved: 'dashboard', 'email_link', 'auto', etc.
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_join_requests_user").on(table.userId),
  index("IDX_join_requests_org").on(table.organizationId),
  index("IDX_join_requests_status").on(table.status),
  // Composite index for common query: getJoinRequestsByOrganization(orgId, status) ORDER BY createdAt DESC
  index("IDX_join_requests_org_status_created").on(table.organizationId, table.status, table.createdAt),
]);

// Join request approval tokens for email-based approvals
export const joinRequestApprovalTokens = pgTable("joinRequestApprovalTokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  token: varchar("token").notNull().unique(), // Unique approval token
  joinRequestId: varchar("joinRequestId").notNull().references(() => joinRequests.id),
  adminUserId: varchar("adminUserId").notNull().references(() => users.id), // The admin who will approve via this token
  expiresAt: timestamp("expiresAt").notNull(), // Token expiration time
  usedAt: timestamp("usedAt"), // When the token was used (null if unused)
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_join_approval_tokens_token").on(table.token),
  index("IDX_join_approval_tokens_request").on(table.joinRequestId),
]);

// Organization usage limits (for trial/expired organizations)
export const organizationUsageLimits = pgTable("organizationUsageLimits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id).unique(),
  concurrentUsers: integer("concurrentUsers").default(0), // Current number of logged-in users
  dailyQuizCount: integer("dailyQuizCount").default(0), // Number of quizzes created today
  aiExplanationCount: integer("aiExplanationCount").default(0), // Number of AI explanations used today
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_org_usage_limits").on(table.organizationId),
]);

// Subjects (e.g., Math, Science, History) within organizations/units
export const subjects = pgTable("subjects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  unitId: varchar("unitId").references(() => organizationUnits.id), // Optional - if null, applies to whole org
  name: varchar("name").notNull(),
  description: text("description"),
  createdBy: varchar("createdBy").notNull().references(() => users.id),
  isActive: boolean("isActive").default(true),
  isDeleted: boolean("isDeleted").default(false),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_subjects_org").on(table.organizationId),
]);

// Unit-Subject assignments (many-to-many relationship)
export const unitSubjects = pgTable("unitSubjects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  unitId: varchar("unitId").notNull().references(() => organizationUnits.id),
  subjectId: varchar("subjectId").notNull().references(() => subjects.id),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_unit_subjects").on(table.unitId, table.subjectId),
]);

// Quiz collections (separate from regular card collections)
export const quizCollections = pgTable("quizCollections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").references(() => organizations.id),
  subjectId: varchar("subjectId").references(() => subjects.id), // Link to subject
  createdBy: varchar("createdBy").references(() => users.id),
  name: varchar("name").notNull(),
  description: text("description"),
  totalCards: integer("totalCards").default(0),
  imageKey: varchar("imageKey"),
  isActive: boolean("isActive").default(true),
  isPublic: boolean("isPublic").default(false),
  isDeleted: boolean("isDeleted").default(false),
  difficulty: varchar("difficulty", { length: 50 }),
  passPercentage: integer("passPercentage").default(70),
  languageCode: varchar("languageCode", { length: 10 }).default("en"),
  contentGroupId: varchar("contentGroupId"),
  isDefaultLanguage: boolean("isDefaultLanguage").default(true),
  sourceLanguageVersion: integer("sourceLanguageVersion"),
  translationStatus: translationStatusEnum("translationStatus").default("published"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  // Composite index for common query: getQuizCollections(orgId) filtered by isDeleted, ORDER BY createdAt DESC
  index("IDX_quiz_collections_org_deleted_created").on(table.organizationId, table.isDeleted, table.createdAt),
]);

// Quiz cards with questions and multiple choice answers
export const quizCards = pgTable("quizCards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collectionId: varchar("collectionId").notNull().references(() => quizCollections.id),
  questionType: varchar("questionType").notNull().default("multiple-choice"), // "multiple-choice", "true-false", "match", "fill-blank"
  question: text("question").notNull(),
  answer1: text("answer1"), // Nullable for non-multiple-choice questions
  answer2: text("answer2"), // Nullable for non-multiple-choice questions
  answer3: text("answer3"), // Nullable for non-multiple-choice questions
  answer4: text("answer4"), // Nullable for non-multiple-choice questions
  answer5: text("answer5"), // Nullable for non-multiple-choice questions
  answer6: text("answer6"), // Nullable for non-multiple-choice questions
  correctAnswerIndex: integer("correctAnswerIndex"), // Nullable for non-multiple-choice questions
  matchPairs: jsonb("matchPairs"), // For match questions: [{left: "item", right: "match"}]
  correctAnswer: text("correctAnswer"), // For fill-in-the-blank questions
  imageKey: varchar("imageKey"),
  displayOrder: integer("displayOrder").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
});

// Quiz card explanations (AI-generated explanations for quiz answers)
export const quizCardExplanations = pgTable("quizCardExplanations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cardId: varchar("cardId").notNull().references(() => quizCards.id).unique(),
  explanation: text("explanation").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_quiz_card_explanations_card").on(table.cardId),
]);

// Quiz collection version history (snapshots of quiz collections at each version)
export const quizCollectionVersions = pgTable("quizCollectionVersions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collectionId: varchar("collectionId").notNull().references(() => quizCollections.id, { onDelete: "cascade" }),
  organizationId: varchar("organizationId").references(() => organizations.id),
  versionNumber: integer("versionNumber").notNull(),
  name: varchar("name"),
  description: text("description"),
  totalCards: integer("totalCards"),
  difficulty: varchar("difficulty", { length: 50 }),
  passPercentage: integer("passPercentage"),
  collectionSnapshot: jsonb("collectionSnapshot").notNull(),
  changeDescription: text("changeDescription"),
  diffSummary: jsonb("diffSummary"),
  editedBy: varchar("editedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_quiz_collection_versions_collection").on(table.collectionId),
  index("IDX_quiz_collection_versions_org").on(table.organizationId),
  index("IDX_quiz_collection_versions_number").on(table.collectionId, table.versionNumber),
]);

// Quiz card version history (snapshots of individual quiz cards at each version)
export const quizCardVersions = pgTable("quizCardVersions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cardId: varchar("cardId").notNull().references(() => quizCards.id, { onDelete: "cascade" }),
  collectionId: varchar("collectionId").notNull().references(() => quizCollections.id, { onDelete: "cascade" }),
  versionNumber: integer("versionNumber").notNull(),
  questionType: varchar("questionType"),
  question: text("question"),
  answer1: text("answer1"),
  answer2: text("answer2"),
  answer3: text("answer3"),
  answer4: text("answer4"),
  answer5: text("answer5"),
  answer6: text("answer6"),
  correctAnswerIndex: integer("correctAnswerIndex"),
  matchPairs: jsonb("matchPairs"),
  correctAnswer: text("correctAnswer"),
  cardSnapshot: jsonb("cardSnapshot").notNull(),
  changeDescription: text("changeDescription"),
  editedBy: varchar("editedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_quiz_card_versions_card").on(table.cardId),
  index("IDX_quiz_card_versions_collection").on(table.collectionId),
  index("IDX_quiz_card_versions_number").on(table.cardId, table.versionNumber),
]);

// Content translation jobs (tracks AI translation of courses between languages)
export const contentTranslationJobs = pgTable("contentTranslationJobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  sourceCourseId: varchar("sourceCourseId").notNull().references(() => courses.id),
  targetLanguageCode: varchar("targetLanguageCode", { length: 10 }).notNull(),
  sourceLanguageCode: varchar("sourceLanguageCode", { length: 10 }).notNull().default("en"),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  progress: integer("progress").default(0),
  currentStage: varchar("currentStage", { length: 50 }),
  totalItems: integer("totalItems").default(0),
  completedItems: integer("completedItems").default(0),
  failedItems: integer("failedItems").default(0),
  translatedCourseId: varchar("translatedCourseId").references(() => courses.id),
  stageDetails: jsonb("stageDetails"),
  creditsCharged: integer("creditsCharged").default(0),
  creditCorrelationId: varchar("creditCorrelationId"),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  initiatedBy: varchar("initiatedBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_content_translation_jobs_org").on(table.organizationId),
  index("IDX_content_translation_jobs_source").on(table.sourceCourseId),
  index("IDX_content_translation_jobs_status").on(table.status),
  uniqueIndex("UNQ_active_translation")
    .on(table.sourceCourseId, table.targetLanguageCode)
    .where(sql`${table.status} IN ('pending', 'in_progress')`),
]);

export const lessonTranslationJobs = pgTable("lessonTranslationJobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lessonId: varchar("lessonId").notNull().references(() => lessons.id),
  sourceLessonId: varchar("sourceLessonId").notNull().references(() => lessons.id),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  targetLanguageCode: varchar("targetLanguageCode", { length: 10 }).notNull(),
  sourceLanguageCode: varchar("sourceLanguageCode", { length: 10 }).notNull().default("en"),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  currentStep: varchar("currentStep", { length: 50 }),
  creditsCharged: integer("creditsCharged").default(0),
  errorMessage: text("errorMessage"),
  initiatedBy: varchar("initiatedBy").notNull().references(() => users.id),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_lesson_translation_jobs_lesson").on(table.lessonId),
  index("IDX_lesson_translation_jobs_org").on(table.organizationId),
  index("IDX_lesson_translation_jobs_status").on(table.status),
]);

// Term definitions (global glossary of terms that can be used across all explanations)
export const termDefinitions = pgTable("termDefinitions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  term: varchar("term").notNull(),
  definition: text("definition").notNull(),
  subjectId: varchar("subjectId").references(() => subjects.id), // Optional context for subject-specific definitions
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_term_definitions_term").on(table.term),
  index("IDX_term_definitions_subject").on(table.subjectId),
]);

// Explanation terms (junction table linking explanations to the terms they contain)
export const explanationTerms = pgTable("explanationTerms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  explanationId: varchar("explanationId").notNull().references(() => quizCardExplanations.id),
  termId: varchar("termId").notNull().references(() => termDefinitions.id),
  termOccurrences: integer("termOccurrences").default(1), // How many times term appears in explanation
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_explanation_terms").on(table.explanationId, table.termId),
]);

// Quiz collection assignments (which subjects/units/sub-units can access which collections)
export const quizCollectionAssignments = pgTable("quizCollectionAssignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collectionId: varchar("collectionId").notNull().references(() => quizCollections.id),
  subjectId: varchar("subjectId").references(() => subjects.id), // Quiz assigned to subject (subject determines which grades can access)
  unitId: varchar("unitId").references(() => organizationUnits.id), // If null, all units can access
  subUnitId: varchar("subUnitId").references(() => organizationSubUnits.id), // If null, all sub-units in unit can access
  requiredPassPercentage: integer("requiredPassPercentage").default(70), // Minimum percentage to pass (0-100)
  availableFrom: timestamp("availableFrom"), // When quiz becomes available for students
  availableTo: timestamp("availableTo"), // When quiz closes for students
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_quiz_assignments").on(table.collectionId),
  unique("UNQ_quiz_assignment").on(table.collectionId, table.unitId, table.subUnitId, table.subjectId), // Prevent duplicate assignments
]);

// Active quiz games (for single and 1v1)
export const activeQuizGames = pgTable("activeQuizGames", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("gameId").notNull().unique(),
  collectionId: varchar("collectionId").notNull().references(() => quizCollections.id),
  gameMode: varchar("gameMode").notNull(), // "quiz_single" or "quiz_1v1"
  player1Id: varchar("player1Id").notNull(),
  player1Name: varchar("player1Name").notNull(),
  player1SocketId: varchar("player1SocketId"),
  player1Ready: boolean("player1Ready").default(false),
  player1CardCount: integer("player1CardCount").default(0),
  player1RoundsWon: integer("player1RoundsWon").default(0),
  player2Id: varchar("player2Id"), // null for single player
  player2Name: varchar("player2Name"),
  player2SocketId: varchar("player2SocketId"),
  player2Ready: boolean("player2Ready").default(false),
  player2CardCount: integer("player2CardCount").default(0),
  player2RoundsWon: integer("player2RoundsWon").default(0),
  gamePhase: varchar("gamePhase").notNull().default("waiting"), // "waiting", "playing", "finished"
  bothPlayersReady: boolean("bothPlayersReady").default(false),
  roundTimeSeconds: integer("roundTimeSeconds").notNull().default(5),
  gameTimeSeconds: integer("gameTimeSeconds").notNull().default(120),
  gameStartedAt: timestamp("gameStartedAt"),
  lastActivityAt: timestamp("lastActivityAt").defaultNow(),
  createdAt: timestamp("createdAt").defaultNow(),
  
  // Quiz game state
  currentCardIndex: integer("currentCardIndex").default(0), // Which card in collection is active
  currentCard: jsonb("currentCard"), // Current quiz card data
  shuffledCardIds: text("shuffledCardIds").array(), // Array of card IDs in shuffled order
  turnVersion: integer("turnVersion").default(0), // Atomic version for card advancement (prevents duplicate advances)
  player1Answer: jsonb("player1Answer"), // Answer: integer (MC/TF), array (match), or string (fill-blank)
  player2Answer: jsonb("player2Answer"), // Answer: integer (MC/TF), array (match), or string (fill-blank)
  player1AnswerTime: integer("player1AnswerTime"), // Time taken to answer in ms
  player2AnswerTime: integer("player2AnswerTime"), // Time taken to answer in ms
  player1Correct: boolean("player1Correct"), // Whether player 1's answer was correct
  player2Correct: boolean("player2Correct"), // Whether player 2's answer was correct
  roundNumber: integer("roundNumber").default(1),
},
(table) => [
  index("IDX_active_quiz_games_phase").on(table.gamePhase),
]);

// Quiz game progress tracking
export const quizGameProgress = pgTable("quizGameProgress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  collectionId: varchar("collectionId").notNull().references(() => quizCollections.id),
  organizationId: varchar("organizationId").references(() => organizations.id),
  unitId: varchar("unitId").references(() => organizationUnits.id),
  subUnitId: varchar("subUnitId").references(() => organizationSubUnits.id),
  totalGamesPlayed: integer("totalGamesPlayed").default(0),
  totalGamesWon: integer("totalGamesWon").default(0),
  totalCorrectAnswers: integer("totalCorrectAnswers").default(0),
  totalAnswers: integer("totalAnswers").default(0),
  averageScore: decimal("averageScore", { precision: 5, scale: 2 }).default("0.00"),
  bestScore: integer("bestScore").default(0),
  lastPlayedAt: timestamp("lastPlayedAt"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_quiz_progress").on(table.userId, table.collectionId),
]);

// User quiz progress (tracks completion status per quiz collection)
export const userQuizProgress = pgTable("userQuizProgress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  collectionId: varchar("collectionId").notNull().references(() => quizCollections.id),
  assignmentId: varchar("assignmentId").references(() => quizCollectionAssignments.id), // Link to assignment for pass requirement
  organizationId: varchar("organizationId").references(() => organizations.id),
  unitId: varchar("unitId").references(() => organizationUnits.id),
  subUnitId: varchar("subUnitId").references(() => organizationSubUnits.id),
  attemptsCount: integer("attemptsCount").default(0),
  bestScore: integer("bestScore").default(0),
  bestPercentage: decimal("bestPercentage", { precision: 5, scale: 2 }).default("0.00"),
  isPassed: boolean("isPassed").default(false), // True if best percentage >= required pass percentage
  completionStatus: varchar("completionStatus").default("outstanding"), // "outstanding", "completed_passed", "completed_failed"
  lastAttemptAt: timestamp("lastAttemptAt"),
  passedAt: timestamp("passedAt"), // When they first passed
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_user_quiz_progress").on(table.userId, table.collectionId),
]);

// Quiz game results
export const quizGameResults = pgTable("quizGameResults", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("gameId").notNull(),
  collectionId: varchar("collectionId").notNull().references(() => quizCollections.id),
  gameMode: varchar("gameMode").notNull(), // "quiz_single" or "quiz_1v1"
  player1Id: varchar("player1Id").notNull(),
  player1Name: varchar("player1Name").notNull(),
  player1Score: integer("player1Score").notNull(),
  player1CorrectAnswers: integer("player1CorrectAnswers").notNull(),
  player1TotalAnswers: integer("player1TotalAnswers").notNull(),
  player2Id: varchar("player2Id"),
  player2Name: varchar("player2Name"),
  player2Score: integer("player2Score"),
  player2CorrectAnswers: integer("player2CorrectAnswers"),
  player2TotalAnswers: integer("player2TotalAnswers"),
  winnerId: varchar("winnerId"),
  gameDuration: integer("gameDuration"), // in seconds
  gameStartedAt: timestamp("gameStartedAt").notNull(),
  gameEndedAt: timestamp("gameEndedAt").notNull(),
  courseId: varchar("courseId").references(() => courses.id), // nullable - quiz can be played standalone
  lessonId: varchar("lessonId").references(() => lessons.id), // nullable - quiz can be played standalone
  courseVersionId: varchar("courseVersionId").references(() => courseVersions.id), // nullable - tracks specific course version
  organizationId: varchar("organizationId").references(() => organizations.id), // nullable - tracks org context
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_quiz_results_player").on(table.player1Id),
  index("IDX_quiz_results_collection").on(table.collectionId),
  index("IDX_quiz_results_course").on(table.courseId),
  index("IDX_quiz_results_lesson").on(table.lessonId),
  index("IDX_quiz_results_org").on(table.organizationId),
]);

// Sales inquiries from prospective customers
export const salesInquiries = pgTable("salesInquiries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  surname: varchar("surname").notNull(),
  email: varchar("email").notNull(),
  phone: varchar("phone").notNull(),
  organizationName: varchar("organizationName").notNull(),
  position: varchar("position").notNull(), // "Principal", "Teacher", "Student", "Other"
  positionOther: text("positionOther"), // If position is "Other"
  studentCount: varchar("studentCount").notNull(), // Number of students/pupils
  hearAboutUs: varchar("hearAboutUs").notNull(), // "TikTok", "YouTube", "Google", "Friend", "Other"
  hearAboutUsOther: text("hearAboutUsOther"), // If hearAboutUs is "Other"
  customMessage: text("customMessage"),
  status: varchar("status").notNull().default("Follow Up"), // "Follow Up", "Responded", "In Progress", "Closed"
  statusUpdatedAt: timestamp("statusUpdatedAt").defaultNow(),
  statusUpdatedBy: varchar("statusUpdatedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_sales_inquiries_created").on(table.createdAt),
  index("IDX_sales_inquiries_status").on(table.status),
]);

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  gamerName: true,
  email: true,
  firstName: true,
  lastName: true,
  profileImageUrl: true,
  avatarImageUrl: true,
});

// Profile update schema
export const updateProfileSchema = createInsertSchema(users).pick({
  gamerName: true,
  firstName: true,
  lastName: true,
  bio: true,
  country: true,
  playerTitle: true,
  preferredGameModes: true,
  isStatsPublic: true,
}).partial();

// Avatar update schema
export const updateAvatarSchema = z.object({
  avatarImageUrl: z.string().nullable(),
});

// Registration schema with password validation
export const registerUserSchema = createInsertSchema(users).pick({
  gamerName: true,
  email: true,
  password: true,
}).extend({
  confirmPassword: z.string(),
  organizationCode: z.string().optional(),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  selectedSubjects: z.array(z.string()).optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Login schema
export const loginUserSchema = z.object({
  email: z.string().min(1, "Please enter your email, gamer name, or full name"),
  password: z.string().min(1, "Password is required"),
});

export const insertUniversalStatUnitSchema = createInsertSchema(universalStatUnits).pick({
  unitName: true,
  unitSymbol: true,
  description: true,
  category: true,
  isActive: true,
  isPredefined: true,
  createdBy: true,
}).extend({
  isPredefined: z.boolean().default(false).optional(), // Default to false for custom units
  createdBy: z.string().optional(), // User ID who created the custom unit
});

export const insertCardCollectionSchema = createInsertSchema(cardCollections).pick({
  name: true,
  description: true,
  isActive: true,
}).extend({
  totalCards: z.number().default(0).optional(), // Allow frontend to provide 0, but make it optional
});

export const insertCollectionStatTypeSchema = createInsertSchema(collectionStatTypes).pick({
  collectionId: true,
  statName: true,
  statUnit: true,
  universalUnitId: true,
  displayOrder: true,
  comparisonType: true,
}).extend({
  comparisonType: z.string().default("highest").optional(), // Make comparisonType optional with default
  universalUnitId: z.string().optional(), // Optional reference to universal unit
});

export const insertCardSchema = createInsertSchema(cards).pick({
  collectionId: true,
  name: true,
  imageKey: true,
  displayOrder: true,
});

export const insertCardStatSchema = createInsertSchema(cardStats).pick({
  cardId: true,
  statTypeId: true,
  value: true,
});

export const insertGameRoomSchema = createInsertSchema(gameRooms).pick({
  hostPlayerId: true,
  collectionId: true,
  gameMode: true,
  maxPlayers: true,
  currentPlayers: true,
  gameState: true,
  gameData: true,
  joinCode: true,
  gameStartedAt: true,
  gameEndedAt: true,
});

export const insertPlayerSessionSchema = createInsertSchema(playerSessions).pick({
  gameRoomId: true,
  playerId: true,
  playerName: true,
  playerPosition: true,
  cardStack: true,
  cardCount: true,
  isActive: true,
  isNPC: true,
});

export const insertGameResultSchema = createInsertSchema(gameResults).pick({
  gameRoomId: true,
  collectionId: true,
  winnerId: true,
  gameMode: true,
  playerIds: true,
  playerXPChanges: true,
  totalRounds: true,
  gameDuration: true,
  isMultiplayer: true,
  gameStartedAt: true,
  gameEndedAt: true,
});

export const insertPlayerStatsSchema = createInsertSchema(playerStats).pick({
  playerId: true,
  gamerName: true,
  currentXP: true,
  currentLevel: true,
  currentRank: true,
  totalGamesPlayed: true,
  totalWins: true,
  totalLosses: true,
  winPercentage: true,
  currentWinStreak: true,
  bestWinStreak: true,
  singlePlayerGames: true,
  singlePlayerWins: true,
  multiplayerGames: true,
  multiplayerWins: true,
  averageGameDuration: true,
  totalXPEarned: true,
  totalXPLost: true,
  lastGameAt: true,
  lastLevelChangeAt: true,
  lastRankChangeAt: true,
});

export const insertGuestSessionSchema = createInsertSchema(guestSessions).pick({
  sessionId: true,
  guestName: true,
});

export const insertActiveOneVOneGameSchema = createInsertSchema(activeOneVOneGames).pick({
  gameId: true,
  collectionId: true,
  player1Id: true,
  player1Name: true,
  player1SocketId: true,
  player1Ready: true,
  player2Id: true,
  player2Name: true,
  player2SocketId: true,
  player2Ready: true,
  currentTurn: true,
  gamePhase: true,
  bothPlayersReady: true,
  roundTimeSeconds: true,
  gameTimeSeconds: true,
  gameStartedAt: true,
  gameSeed: true,
  roundNumber: true,
  player1Deck: true,
  player2Deck: true,
  player1WonCards: true,
  player2WonCards: true,
  tiedCards: true,
  player1CurrentCard: true,
  player2CurrentCard: true,
  selectedStatTypeId: true,
  roundWinner: true,
  roundPhase: true,
  isSpecialTieMode: true,
  tiedStats: true,
  specialTieStatName: true,
});

export const insertOrganizationSchema = createInsertSchema(organizations).pick({
  name: true,
  type: true,
  inviteCode: true,
  curriculum: true,
  streetAddress: true,
  city: true,
  province: true,
  postalCode: true,
  country: true,
  contactPhone: true,
  studentCount: true,
  howHeardAboutUs: true,
  isActive: true,
  trialStartDate: true,
  trialEndDate: true,
  subscriptionStatus: true,
  timezone: true,
  currency: true,
});

export const insertOrganizationUnitSchema = createInsertSchema(organizationUnits).pick({
  organizationId: true,
  name: true,
  displayOrder: true,
  isActive: true,
});

export const insertOrganizationSubUnitSchema = createInsertSchema(organizationSubUnits).pick({
  unitId: true,
  name: true,
  displayOrder: true,
  isActive: true,
});

export const insertOrganizationTeamSchema = createInsertSchema(organizationTeams).pick({
  subUnitId: true,
  name: true,
  displayOrder: true,
  joinCode: true,
  isActive: true,
});

export const insertUserOrganizationRoleSchema = createInsertSchema(userOrganizationRoles).pick({
  userId: true,
  organizationId: true,
  role: true,
});

export const insertJoinRequestSchema = createInsertSchema(joinRequests).pick({
  userId: true,
  organizationId: true,
  requestedUnitId: true,
  requestedSubUnitId: true,
  requestedTeamId: true,
  requestedSubjectIds: true,
  assignedUnitId: true,
  assignedSubUnitId: true,
  assignedTeamId: true,
  assignedSubjectIds: true,
  status: true,
  denialReason: true,
  reviewedBy: true,
  reviewedAt: true,
  approvedAt: true,
});

export const insertJoinRequestApprovalTokenSchema = createInsertSchema(joinRequestApprovalTokens).pick({
  token: true,
  joinRequestId: true,
  adminUserId: true,
  expiresAt: true,
});

export const insertUserOrganizationAssignmentSchema = createInsertSchema(userOrganizationAssignments).pick({
  userId: true,
  organizationId: true,
  unitId: true,
  subUnitId: true,
});

export const insertOrganizationUsageLimitsSchema = createInsertSchema(organizationUsageLimits).omit({
  id: true,
  updatedAt: true,
});

export const insertSubjectSchema = createInsertSchema(subjects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertQuizCollectionSchema = createInsertSchema(quizCollections).pick({
  organizationId: true,
  subjectId: true,
  createdBy: true,
  name: true,
  description: true,
  totalCards: true,
  imageKey: true,
  isActive: true,
  isPublic: true,
  difficulty: true,
  passPercentage: true,
});

export const insertQuizCardSchema = createInsertSchema(quizCards).pick({
  collectionId: true,
  question: true,
  answer1: true,
  answer2: true,
  answer3: true,
  answer4: true,
  answer5: true,
  answer6: true,
  correctAnswerIndex: true,
  imageKey: true,
  displayOrder: true,
});

export const insertQuizCollectionAssignmentSchema = createInsertSchema(quizCollectionAssignments).pick({
  collectionId: true,
  unitId: true,
  subUnitId: true,
});

export const insertActiveQuizGameSchema = createInsertSchema(activeQuizGames).pick({
  gameId: true,
  collectionId: true,
  gameMode: true,
  player1Id: true,
  player1Name: true,
  player1SocketId: true,
  player1Ready: true,
  player1CardCount: true,
  player1RoundsWon: true,
  player2Id: true,
  player2Name: true,
  player2SocketId: true,
  player2Ready: true,
  player2CardCount: true,
  player2RoundsWon: true,
  gamePhase: true,
  bothPlayersReady: true,
  roundTimeSeconds: true,
  gameTimeSeconds: true,
  gameStartedAt: true,
  currentCardIndex: true,
  currentCard: true,
  shuffledCardIds: true,
  player1Answer: true,
  player2Answer: true,
  player1AnswerTime: true,
  player2AnswerTime: true,
  roundNumber: true,
});

export const insertQuizGameProgressSchema = createInsertSchema(quizGameProgress).pick({
  userId: true,
  collectionId: true,
  totalGamesPlayed: true,
  totalGamesWon: true,
  totalCorrectAnswers: true,
  totalAnswers: true,
  averageScore: true,
  bestScore: true,
  lastPlayedAt: true,
});

export const insertQuizGameResultSchema = createInsertSchema(quizGameResults).pick({
  gameId: true,
  collectionId: true,
  gameMode: true,
  player1Id: true,
  player1Name: true,
  player1Score: true,
  player1CorrectAnswers: true,
  player1TotalAnswers: true,
  player2Id: true,
  player2Name: true,
  player2Score: true,
  player2CorrectAnswers: true,
  player2TotalAnswers: true,
  winnerId: true,
  gameDuration: true,
  gameStartedAt: true,
  gameEndedAt: true,
  courseId: true,
  lessonId: true,
  courseVersionId: true,
  organizationId: true,
});

// XP Change Data Types
export type PlayerXPChangeData = {
  xpChange: number;
  newXP: number;
  newRank: string;
  wasPromotion?: boolean;
  finalCardCount: number;
};

export type PlayerXPChanges = Record<string, PlayerXPChangeData>;

// Types
export type User = typeof users.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateProfile = z.infer<typeof updateProfileSchema>;
export type UpdateAvatar = z.infer<typeof updateAvatarSchema>;
export type RegisterUser = z.infer<typeof registerUserSchema>;
export type LoginUser = z.infer<typeof loginUserSchema>;
export type CardCollection = typeof cardCollections.$inferSelect;
export type InsertCardCollection = z.infer<typeof insertCardCollectionSchema>;
export type CollectionStatType = typeof collectionStatTypes.$inferSelect;
export type InsertCollectionStatType = z.infer<typeof insertCollectionStatTypeSchema>;
export type Card = typeof cards.$inferSelect;
export type InsertCard = z.infer<typeof insertCardSchema>;
export type CardStat = typeof cardStats.$inferSelect;
export type InsertCardStat = z.infer<typeof insertCardStatSchema>;
export type GameRoom = typeof gameRooms.$inferSelect;
export type InsertGameRoom = z.infer<typeof insertGameRoomSchema>;
export type PlayerSession = typeof playerSessions.$inferSelect;
export type InsertPlayerSession = z.infer<typeof insertPlayerSessionSchema>;
export type GameResult = typeof gameResults.$inferSelect;
export type LeaderBoardEntry = typeof leaderBoard.$inferSelect;
export type PlayerStats = typeof playerStats.$inferSelect;
export type InsertGameResult = z.infer<typeof insertGameResultSchema>;
export type InsertPlayerStats = z.infer<typeof insertPlayerStatsSchema>;
export type GuestSession = typeof guestSessions.$inferSelect;
export type InsertGuestSession = z.infer<typeof insertGuestSessionSchema>;
export type ActiveOneVOneGame = typeof activeOneVOneGames.$inferSelect;
export type InsertActiveOneVOneGame = z.infer<typeof insertActiveOneVOneGameSchema>;
export type UniversalStatUnit = typeof universalStatUnits.$inferSelect;
export type InsertUniversalStatUnit = z.infer<typeof insertUniversalStatUnitSchema>;
export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type OrganizationUnit = typeof organizationUnits.$inferSelect;
export type InsertOrganizationUnit = z.infer<typeof insertOrganizationUnitSchema>;
export type OrganizationSubUnit = typeof organizationSubUnits.$inferSelect;
export type InsertOrganizationSubUnit = z.infer<typeof insertOrganizationSubUnitSchema>;
export type OrganizationTeam = typeof organizationTeams.$inferSelect;
export type InsertOrganizationTeam = z.infer<typeof insertOrganizationTeamSchema>;
export type UserOrganizationRole = typeof userOrganizationRoles.$inferSelect;
export type InsertUserOrganizationRole = z.infer<typeof insertUserOrganizationRoleSchema>;
export type UserOrganizationAssignment = typeof userOrganizationAssignments.$inferSelect;
export type InsertUserOrganizationAssignment = z.infer<typeof insertUserOrganizationAssignmentSchema>;
export type JoinRequest = typeof joinRequests.$inferSelect;
export type InsertJoinRequest = z.infer<typeof insertJoinRequestSchema>;
export type JoinRequestApprovalToken = typeof joinRequestApprovalTokens.$inferSelect;
export type InsertJoinRequestApprovalToken = z.infer<typeof insertJoinRequestApprovalTokenSchema>;
export type OrganizationUsageLimits = typeof organizationUsageLimits.$inferSelect;
export type InsertOrganizationUsageLimits = z.infer<typeof insertOrganizationUsageLimitsSchema>;
export type Subject = typeof subjects.$inferSelect;
export type InsertSubject = z.infer<typeof insertSubjectSchema>;
export type QuizCollection = typeof quizCollections.$inferSelect;
export type InsertQuizCollection = z.infer<typeof insertQuizCollectionSchema>;
export type QuizCard = typeof quizCards.$inferSelect;
export type InsertQuizCard = z.infer<typeof insertQuizCardSchema>;
export type QuizCollectionAssignment = typeof quizCollectionAssignments.$inferSelect;
export type InsertQuizCollectionAssignment = z.infer<typeof insertQuizCollectionAssignmentSchema>;
export type ActiveQuizGame = typeof activeQuizGames.$inferSelect;
export type InsertActiveQuizGame = z.infer<typeof insertActiveQuizGameSchema>;
export type QuizGameProgress = typeof quizGameProgress.$inferSelect;
export type InsertQuizGameProgress = z.infer<typeof insertQuizGameProgressSchema>;
export type QuizGameResult = typeof quizGameResults.$inferSelect;
export type InsertQuizGameResult = z.infer<typeof insertQuizGameResultSchema>;

// ========================================
// AI LESSON GENERATOR SYSTEM TABLES
// ========================================

// System settings for configurable parameters (Super Admin)
export const systemSettings = pgTable("systemSettings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  settingKey: varchar("settingKey").notNull().unique(), // e.g., "max_file_size_bytes", "learner_monthly_price"
  settingValue: text("settingValue").notNull(), // Stored as string, parsed as needed
  dataType: varchar("dataType").notNull().default("string"), // "string", "number", "boolean", "json"
  description: text("description"),
  updatedBy: varchar("updatedBy").references(() => users.id),
  updatedAt: timestamp("updatedAt").defaultNow(),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_system_settings_key").on(table.settingKey),
]);

// Organization-scoped source intelligence providers.
// These are tenant-owned credentials/configuration, unlike platform-wide artifact integrations.
export const organizationSourceIntelligenceProviders = pgTable("organizationSourceIntelligenceProviders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  provider: varchar("provider").notNull(), // notebooklm_enterprise
  enabled: boolean("enabled").notNull().default(false),
  authMode: varchar("authMode").notNull().default("service_account_json"),
  projectNumber: varchar("projectNumber"),
  location: varchar("location").notNull().default("global"),
  endpointLocation: varchar("endpointLocation").notNull().default("global-"),
  defaultNotebookTitle: varchar("defaultNotebookTitle"),
  encryptedCredentials: text("encryptedCredentials"),
  credentialSummary: jsonb("credentialSummary"),
  settings: jsonb("settings").notNull().default(sql`'{}'::jsonb`),
  connectionStatus: varchar("connectionStatus").notNull().default("not_configured"),
  lastTestedAt: timestamp("lastTestedAt"),
  lastError: text("lastError"),
  createdBy: varchar("createdBy").references(() => users.id),
  updatedBy: varchar("updatedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_org_source_intel_org").on(table.organizationId),
  unique("UNQ_org_source_intel_org_provider").on(table.organizationId, table.provider),
]);

// Credit tracking enums (must be defined before tables that use them)
export const userAllocationStatusEnum = pgEnum("userAllocationStatus", [
  "active",
  "suspended",
  "archived"
]);

export const gammaEventTypeEnum = pgEnum("gammaEventType", [
  "lesson_deduction",
  "quiz_deduction",
  "top_up",
  "manual_correction",
  "snapshot_adjustment"
]);

// Quiz question tier enum for LP Credit pricing
export const quizQuestionTierEnum = pgEnum("quizQuestionTier", [
  "10",
  "15",
  "20"
]);

export const adjustmentStatusEnum = pgEnum("adjustmentStatus", [
  "pending",
  "approved",
  "rejected"
]);

// LP Credit transaction type enum for unified credit ledger
export const lpTransactionTypeEnum = pgEnum("lpTransactionType", [
  "purchase",           // Credit purchase via payment
  "deduction",          // Usage deduction (lesson, quiz, etc.)
  "refund",             // Refund of credits
  "bonus",              // Bonus credits (promotions, etc.)
  "adjustment",         // Admin adjustment
  "subscription_topup", // Subscription-based credit allocation
  "trial_grant",        // One-time trial credits
  "thumbnail_generation", // AI thumbnail generation for courses
  "quiz_generation"     // AI quiz generation
]);

// Credit purchase target enum - who receives the purchased credits
export const creditPurchaseTargetEnum = pgEnum("creditPurchaseTarget", [
  "user",          // Credits go to the purchasing user's personal wallet
  "organization"   // Credits go to the organization's shared wallet
]);

// Org credit activity type enum - what the credits were used for
export const orgCreditActivityTypeEnum = pgEnum("orgCreditActivityType", [
  "lesson_generation",      // AI lesson creation
  "quiz_generation",        // AI quiz creation
  "thumbnail_generation",   // AI thumbnail generation
  "course_framework",       // AI course framework generation
  "lesson_feedback",        // Lesson feedback/health report
  "ai_content_improvement", // AI-powered content improvement
  "topic_analysis",         // AI topic analysis in course wizard
  "purchase",               // Credit purchase
  "refund",                 // Credit refund
  "adjustment",             // Admin adjustment
  "trial_grant",            // Trial credit grant
  "content_translation"     // Content translation
]);

// Thumbnail source enum - tracks how course thumbnail was created
export const thumbnailSourceEnum = pgEnum("thumbnailSource", [
  "upload",  // Manually uploaded by user
  "ai"       // Generated by AI
]);

export const lessonAssignmentAudienceEnum = pgEnum("lessonAssignmentAudience", [
  "learner",
  "instructor"
]);

export const courseProgressStatusEnum = pgEnum("courseProgressStatus", [
  "not_started",
  "in_progress", 
  "completed"
]);

export const courseAssignmentAudienceEnum = pgEnum("courseAssignmentAudience", [
  "learner",
  "instructor"
]);

// Course assignment scope enum - determines cascade level for course access
export const courseAssignmentScopeEnum = pgEnum("courseAssignmentScope", [
  "organization", // All users in the organization
  "department",   // All users in the department (unit) + child units + teams
  "subject",      // All users assigned to a subject within a department/grade
  "unit",         // All users in the unit (subUnit) + child teams
  "team",         // Only users in specific team
  "user"          // Individual user assignment
]);

// Subscription plans for AI lesson generation (Standard, Premium, Enterprise)
export const subscriptionPlans = pgTable("subscriptionPlans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(), // "Standard", "Premium", "Enterprise"
  tier: varchar("tier").notNull().unique(), // "standard", "premium", "enterprise"
  monthlyCredits: integer("monthlyCredits").notNull(), // e.g., 1000, 3000, 10000
  pricePerTeacher: decimal("pricePerTeacher", { precision: 10, scale: 2 }).notNull(), // e.g., 99.00, 289.00, 959.00
  currency: varchar("currency").default("ZAR"), // South African Rand
  badge: varchar("badge"), // "Most Popular", "Best Value", etc.
  features: jsonb("features"), // Array of feature descriptions
  colorScheme: varchar("colorScheme"), // "green", "blue", "purple", "orange" for gradient styling
  isActive: boolean("isActive").default(true),
  displayOrder: integer("displayOrder").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_subscription_plans_tier").on(table.tier),
  index("IDX_subscription_plans_active").on(table.isActive),
]);

// Platform-level pricing configuration (SuperAdmin managed)
export const platformPricing = pgTable("platformPricing", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  learnerMonthlyCost: decimal("learnerMonthlyCost", { precision: 10, scale: 2 }).notNull().default("8.99"), // Education/Business: Cost per learner/student per month (full platform access)
  elearningLearnerMonthlyCost: decimal("elearningLearnerMonthlyCost", { precision: 10, scale: 2 }).notNull().default("19.99"), // E-learning: Cost per learner per month (discount on course purchases)
  elearningLearnerDiscountPercent: decimal("elearningLearnerDiscountPercent", { precision: 5, scale: 2 }).notNull().default("15.00"), // E-learning: Discount % for subscribed learners (0-100)
  currency: varchar("currency").notNull().default("ZAR"), // Currency code
  defaultCourseCommissionRate: decimal("defaultCourseCommissionRate", { precision: 5, scale: 4 }).default("0.3000"), // E-learning: Default platform commission rate (30%)
  minCoursePrice: decimal("minCoursePrice", { precision: 10, scale: 2 }).default("50.00"), // Minimum course price in ZAR
  maxCoursePrice: decimal("maxCoursePrice", { precision: 10, scale: 2 }).default("10000.00"), // Maximum course price in ZAR
  creditsPerThumbnailGeneration: integer("creditsPerThumbnailGeneration").notNull().default(15), // LP Credits charged per AI thumbnail generation
  creditsPerHealthReport: integer("creditsPerHealthReport").notNull().default(10), // LP Credits charged per lesson feedback/health report
  creditsPerTopicAnalysis: integer("creditsPerTopicAnalysis").notNull().default(5), // LP Credits charged per AI topic analysis in Course Document Wizard
  creditsPerFrameworkGeneration: integer("creditsPerFrameworkGeneration").notNull().default(20), // LP Credits charged per course framework generation
  creditsPerExplanationGeneration: integer("creditsPerExplanationGeneration").notNull().default(25), // LP Credits charged per quiz explanation generation
  creditsPerAnswerCheck: integer("creditsPerAnswerCheck").notNull().default(20), // LP Credits charged per quiz answer verification
  podcastEstimateLpcPerCharacter: decimal("podcastEstimateLpcPerCharacter", { precision: 10, scale: 6 }).notNull().default("0.060000"), // LPC estimate rate per character
  podcastConversationMultiplier: decimal("podcastConversationMultiplier", { precision: 10, scale: 4 }).notNull().default("1.1500"), // Estimate multiplier for conversation mode
  podcastMinLpc: integer("podcastMinLpc").notNull().default(40), // Minimum LPC for podcast estimate/settlement
  podcastMaxLpc: integer("podcastMaxLpc").notNull().default(0), // Deprecated cap (0 = uncapped, enforced as uncapped in runtime logic)
  podcastElevenUsdPer1kChars: decimal("podcastElevenUsdPer1kChars", { precision: 10, scale: 6 }).notNull().default("0.300000"), // Provider USD rate per 1k chars
  podcastElevenSubscriptionUsdMonthly: decimal("podcastElevenSubscriptionUsdMonthly", { precision: 12, scale: 6 }).notNull().default("0.000000"), // ElevenLabs base subscription cost in USD
  podcastElevenSubscriptionIncludedChars: integer("podcastElevenSubscriptionIncludedChars").notNull().default(0), // Included chars in subscription package
  podcastElevenTopupUsdPer1kChars: decimal("podcastElevenTopupUsdPer1kChars", { precision: 10, scale: 6 }).notNull().default("0.300000"), // Additional/top-up USD rate per 1k chars
  podcastElevenExpectedMonthlyChars: integer("podcastElevenExpectedMonthlyChars").notNull().default(0), // Expected monthly chars used to calculate blended provider unit cost
  podcastUsePackageFloorLpcValue: boolean("podcastUsePackageFloorLpcValue").notNull().default(true), // Derive local currency per LPC from active package floor pricing
  podcastEnforceNoLossFloor: boolean("podcastEnforceNoLossFloor").notNull().default(true), // Prevent settlements below provider break-even
  podcastUsdToLocalFxRate: decimal("podcastUsdToLocalFxRate", { precision: 12, scale: 6 }).notNull().default("18.500000"), // Manual USD to platform currency FX
  podcastTargetMarginPercent: decimal("podcastTargetMarginPercent", { precision: 5, scale: 2 }).notNull().default("35.00"), // Target gross margin %
  podcastLocalCurrencyPerLpc: decimal("podcastLocalCurrencyPerLpc", { precision: 10, scale: 6 }).notNull().default("1.000000"), // Local currency value represented by 1 LPC
  podcastSettlementGuardrailPct: decimal("podcastSettlementGuardrailPct", { precision: 5, scale: 2 }).notNull().default("20.00"), // Max allowed settlement over estimate (%)
  creditsPerLessonGeneration: integer("creditsPerLessonGeneration").notNull().default(50), // LP Credits charged per AI lesson content generation
  creditsPerAiFix: integer("creditsPerAiFix").notNull().default(10), // LP Credits charged per AI fix suggestion
  creditsPerQuizGeneration: integer("creditsPerQuizGeneration").notNull().default(15), // LP Credits charged per AI quiz generation
  creditsPerLessonTranslation: integer("creditsPerLessonTranslation").notNull().default(10),
  creditsPerQuizTranslation: integer("creditsPerQuizTranslation").notNull().default(5),
  creditsPerCourseTranslation: integer("creditsPerCourseTranslation").notNull().default(50), // LP Credits charged per AI-powered course framework translation
  creditsPerTranslatedPptxGeneration: integer("creditsPerTranslatedPptxGeneration").notNull().default(50),
  creditsPerOverviewGeneration: integer("creditsPerOverviewGeneration").notNull().default(25),
  creditsPerKeyTakeawaysGeneration: integer("creditsPerKeyTakeawaysGeneration").notNull().default(25),
  updatedBy: varchar("updatedBy").references(() => users.id), // SuperAdmin who updated
  updatedAt: timestamp("updatedAt").defaultNow(),
  createdAt: timestamp("createdAt").defaultNow(),
});

// Platform payment settings (SuperAdmin managed) - YOCO test/live mode toggle
export const platformPaymentSettings = pgTable("platformPaymentSettings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  yocoMode: yocoModeEnum("yocoMode").notNull().default("test"), // test or live mode for YOCO payments
  updatedBy: varchar("updatedBy").references(() => users.id), // SuperAdmin who toggled
  updatedAt: timestamp("updatedAt").defaultNow(),
  createdAt: timestamp("createdAt").defaultNow(),
});

// Lesson Credit Pricing Calculator Settings (SuperAdmin managed)
export const lessonCreditPricingSettings = pgTable("lessonCreditPricingSettings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  minimumProfitPercentage: decimal("minimumProfitPercentage", { precision: 5, scale: 2 }).notNull().default("30.00"), // Minimum profit margin for largest package
  profitStepDecrease: decimal("profitStepDecrease", { precision: 5, scale: 2 }).notNull().default("5.00"), // How much profit decreases per tier
  platformCostTiers: jsonb("platformCostTiers").notNull().default('[]'), // Canonical USD tiers: [{credits: number, cost: number, currency: 'USD'}]
  // Lesson generation cost configuration (for calculating lesson estimates on credit packages)
  creditsPerLessonTextOnlyMin: integer("creditsPerLessonTextOnlyMin").notNull().default(40), // Min credits for text-only lesson
  creditsPerLessonTextOnlyMax: integer("creditsPerLessonTextOnlyMax").notNull().default(90), // Max credits for text-only lesson
  creditsPerLessonWithImagesMin: integer("creditsPerLessonWithImagesMin").notNull().default(140), // Min credits for lesson with images
  creditsPerLessonWithImagesMax: integer("creditsPerLessonWithImagesMax").notNull().default(290), // Max credits for lesson with images
  updatedBy: varchar("updatedBy").references(() => users.id),
  updatedAt: timestamp("updatedAt").defaultNow(),
  createdAt: timestamp("createdAt").defaultNow(),
});

export const insertLessonCreditPricingSettingsSchema = createInsertSchema(lessonCreditPricingSettings).omit({
  id: true,
  createdAt: true,
});
export type InsertLessonCreditPricingSettings = z.infer<typeof insertLessonCreditPricingSettingsSchema>;
export type LessonCreditPricingSettings = typeof lessonCreditPricingSettings.$inferSelect;

// Webhook registrations (SuperAdmin managed) - Track registered YOCO webhooks
export const webhookRegistrations = pgTable("webhookRegistrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  webhookId: varchar("webhookId").notNull(), // Webhook ID from YOCO (e.g., sub_xxxxx)
  mode: yocoModeEnum("mode").notNull(), // test or live mode
  webhookUrl: varchar("webhookUrl").notNull(), // The webhook URL registered with YOCO
  isActive: boolean("isActive").default(true), // Current active webhook for this mode
  registeredBy: varchar("registeredBy").notNull().references(() => users.id), // SuperAdmin who registered
  registeredAt: timestamp("registeredAt").defaultNow(),
},
(table) => [
  index("IDX_webhook_registrations_mode").on(table.mode),
  index("IDX_webhook_registrations_active").on(table.isActive),
  unique("UNQ_webhook_mode_active").on(table.mode, table.isActive), // Only one active webhook per mode
]);

// E-Learning Subscription Plans (extends existing subscriptionPlans for learner subscriptions)
export const elearningSubscriptionPlans = pgTable("elearningSubscriptionPlans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(), // "Basic Learner", "Pro Learner", "Enterprise"
  planType: subscriptionPlanTypeEnum("planType").notNull(), // learner or educator
  interval: subscriptionIntervalEnum("interval").notNull().default("monthly"), // monthly or annual
  priceAmount: decimal("priceAmount", { precision: 10, scale: 2 }).notNull(), // Subscription price
  currency: currencyCodeEnum("currency").notNull().default("ZAR"),
  learnerAllotment: integer("learnerAllotment"), // For learner plans: number of learners included
  creditAllotment: integer("creditAllotment"), // For educator plans: monthly credits
  features: jsonb("features"), // Array of feature descriptions
  badge: varchar("badge"), // "Most Popular", "Best Value"
  colorScheme: varchar("colorScheme"), // "green", "blue", "purple", "orange"
  isActive: boolean("isActive").default(true),
  displayOrder: integer("displayOrder").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_elearning_plans_type").on(table.planType),
  index("IDX_elearning_plans_active").on(table.isActive),
]);

// Subscriptions for organizations (learner plans) and users (educator plans)
export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("planId").notNull().references(() => elearningSubscriptionPlans.id),
  targetType: subscriptionTargetTypeEnum("targetType").notNull(), // organization or user
  targetId: varchar("targetId").notNull(), // organizationId or userId
  status: subscriptionStatusEnum("status").notNull().default("active"),
  currentPeriodStart: timestamp("currentPeriodStart").notNull(),
  currentPeriodEnd: timestamp("currentPeriodEnd").notNull(),
  nextBillingDate: timestamp("nextBillingDate").notNull(),
  graceUntil: timestamp("graceUntil"), // Suspension deadline
  autoRenew: boolean("autoRenew").default(true),
  cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").default(false), // Cancel at end of current billing period
  cancelRequestedAt: timestamp("cancelRequestedAt"), // When cancellation was requested
  cancellationSource: subscriptionCancellationSourceEnum("cancellationSource"), // Who initiated cancellation
  cancelledAt: timestamp("cancelledAt"), // When subscription was actually cancelled
  cancelReason: text("cancelReason"),
  processedBy: varchar("processedBy").references(() => users.id), // Admin who processed cancellation (if applicable)
  scheduledSeatReleaseAt: timestamp("scheduledSeatReleaseAt"), // When license seats should be released
  reactivatedAt: timestamp("reactivatedAt"), // If subscription was reactivated
  reactivationEligible: boolean("reactivationEligible").default(true), // Can this subscription be reactivated
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_subscriptions_plan").on(table.planId),
  index("IDX_subscriptions_target").on(table.targetType, table.targetId),
  index("IDX_subscriptions_status").on(table.status),
  index("IDX_subscriptions_next_billing").on(table.nextBillingDate),
  index("IDX_subscriptions_cancel_at_period_end").on(table.cancelAtPeriodEnd),
  index("IDX_subscriptions_scheduled_seat_release").on(table.scheduledSeatReleaseAt),
]);

// Subscription invoices with YOCO checkout tracking
export const subscriptionInvoices = pgTable("subscriptionInvoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subscriptionId: varchar("subscriptionId").references(() => subscriptions.id), // Nullable for learner plan invoices (linked after payment)
  yocoCheckoutId: varchar("yocoCheckoutId"), // YOCO checkout session ID
  checkoutUrl: varchar("checkoutUrl"), // YOCO payment link
  amountDue: decimal("amountDue", { precision: 10, scale: 2 }).notNull(),
  currency: currencyCodeEnum("currency").notNull().default("ZAR"),
  originalAmount: decimal("originalAmount", { precision: 10, scale: 2 }), // Pre-conversion amount
  originalCurrency: currencyCodeEnum("originalCurrency"), // Original currency before conversion
  exchangeRate: decimal("exchangeRate", { precision: 12, scale: 6 }), // FX rate snapshot for audit
  billingPeriodStart: timestamp("billingPeriodStart"), // Start of billing period
  billingPeriodEnd: timestamp("billingPeriodEnd"), // End of billing period
  status: invoiceStatusEnum("status").notNull().default("pending"),
  dueAt: timestamp("dueAt").notNull(),
  paidAt: timestamp("paidAt"),
  reminderSent: boolean("reminderSent").default(false),
  pdfStoragePath: varchar("pdfStoragePath"), // Object storage path for invoice PDF
  metadata: jsonb("metadata"), // Additional payment metadata
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_invoices_subscription").on(table.subscriptionId),
  index("IDX_invoices_status").on(table.status),
  index("IDX_invoices_due_date").on(table.dueAt),
  index("IDX_invoices_yoco").on(table.yocoCheckoutId),
]);

// Subscription lifecycle events (audit log)
export const subscriptionEvents = pgTable("subscriptionEvents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subscriptionId: varchar("subscriptionId").notNull().references(() => subscriptions.id),
  eventType: varchar("eventType").notNull(), // created, renewed, upgraded, downgraded, suspended, cancelled, reactivated
  previousStatus: subscriptionStatusEnum("previousStatus"),
  newStatus: subscriptionStatusEnum("newStatus"),
  metadata: jsonb("metadata"), // Event details
  initiatedBy: varchar("initiatedBy").references(() => users.id), // User who triggered event
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_sub_events_subscription").on(table.subscriptionId),
  index("IDX_sub_events_type").on(table.eventType),
  index("IDX_sub_events_created").on(table.createdAt),
]);

// Email delivery tracking
export const emailLogs = pgTable("emailLogs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recipientEmail: varchar("recipientEmail").notNull(),
  recipientName: varchar("recipientName"),
  subject: varchar("subject").notNull(),
  templateType: varchar("templateType"), // renewal_reminder, payment_success, payment_failed, etc.
  status: emailStatusEnum("status").notNull().default("queued"),
  mailersendId: varchar("mailersendId"), // MailerSend message ID
  subscriptionId: varchar("subscriptionId").references(() => subscriptions.id),
  invoiceId: varchar("invoiceId").references(() => subscriptionInvoices.id),
  attachmentPaths: jsonb("attachmentPaths"), // Array of object storage paths for attachments
  errorMessage: text("errorMessage"),
  retryCount: integer("retryCount").default(0),
  sentAt: timestamp("sentAt"),
  deliveredAt: timestamp("deliveredAt"),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_email_logs_status").on(table.status),
  index("IDX_email_logs_subscription").on(table.subscriptionId),
  index("IDX_email_logs_invoice").on(table.invoiceId),
  index("IDX_email_logs_created").on(table.createdAt),
]);

// Payment intent type enum
export const paymentIntentTypeEnum = pgEnum("paymentIntentType", [
  "course",
  "credits",
  "subscription",
  "license"
]);

// Payment intent status enum
export const paymentIntentStatusEnum = pgEnum("paymentIntentStatus", [
  "pending",
  "started",      // YOCO returns this when checkout is initiated but not completed
  "processing",
  "succeeded",
  "failed",
  "cancelled",
  "refunded"      // Payment was refunded after successful completion
]);

// Credit order status enum (includes retryable states)
export const creditOrderStatusEnum = pgEnum("creditOrderStatus", [
  "pending",           // Initial state before payment
  "processing",        // Payment being processed
  "succeeded",         // Payment succeeded and fully fulfilled
  "failed",            // Payment failed permanently
  "pending_receipt",   // Payment succeeded but PDF generation failed (retryable)
  "pending_retry",     // Payment succeeded but fulfillment failed (retryable)
  "cancelled",         // Payment cancelled
  "refunded"           // Payment was refunded after successful completion
]);

// Payment intents - centralized tracking of all YOCO checkout sessions
export const paymentIntents = pgTable("paymentIntents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  checkoutId: varchar("checkoutId").unique(), // YOCO checkout session ID (nullable until populated)
  intentType: paymentIntentTypeEnum("intentType").notNull(),
  intentId: varchar("intentId").notNull(), // courseId, packageId, or subscriptionId
  invoiceId: varchar("invoiceId"), // For subscriptions
  organizationId: varchar("organizationId"), // For credit purchases (org wallet)
  userId: varchar("userId").notNull().references(() => users.id), // Purchaser
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: currencyCodeEnum("currency").notNull(),
  originalAmount: decimal("originalAmount", { precision: 10, scale: 2 }), // Pre-conversion amount
  originalCurrency: currencyCodeEnum("originalCurrency"), // Original currency before ZAR conversion
  status: paymentIntentStatusEnum("status").notNull().default("pending"),
  metadata: jsonb("metadata"), // Full payment context snapshot
  checkoutUrl: varchar("checkoutUrl"), // YOCO redirect URL
  successUrl: varchar("successUrl"),
  cancelUrl: varchar("cancelUrl"),
  failureUrl: varchar("failureUrl"),
  lastWebhookAt: timestamp("lastWebhookAt"),  // Last webhook received
  reconciledAt: timestamp("reconciledAt"), // When reconciliation job processed this
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_payment_intents_checkout").on(table.checkoutId),
  index("IDX_payment_intents_type").on(table.intentType),
  index("IDX_payment_intents_intent").on(table.intentId),
  index("IDX_payment_intents_status").on(table.status),
  index("IDX_payment_intents_user").on(table.userId),
  index("IDX_payment_intents_created").on(table.createdAt),
  unique("UNQ_payment_intent_composite").on(table.intentType, table.intentId, table.invoiceId),
]);

// Payment fulfillments - idempotent tracking of payment application
export const paymentFulfillments = pgTable("paymentFulfillments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  paymentIntentId: varchar("paymentIntentId").notNull().references(() => paymentIntents.id),
  checkoutId: varchar("checkoutId").notNull(), // YOCO checkout ID for quick lookup
  intentType: paymentIntentTypeEnum("intentType").notNull(),
  intentId: varchar("intentId").notNull(),
  invoiceId: varchar("invoiceId"),
  fulfilledBy: varchar("fulfilledBy").notNull(), // 'webhook', 'reconciliation', 'manual'
  fulfillmentData: jsonb("fulfillmentData"), // Handler-specific data (credits added, course enrolled, etc.)
  fulfilledAt: timestamp("fulfilledAt").defaultNow(),
},
(table) => [
  index("IDX_payment_fulfillments_intent").on(table.paymentIntentId),
  index("IDX_payment_fulfillments_checkout").on(table.checkoutId),
  index("IDX_payment_fulfillments_type_intent").on(table.intentType, table.intentId),
  unique("UNQ_payment_fulfillment_once").on(table.checkoutId), // Prevent duplicate fulfillment
]);

// Payment webhook events - deduplication tracking for YOCO webhooks
// Phase 3a: Prevents duplicate webhook processing by tracking unique event IDs
export const paymentWebhookEvents = pgTable("paymentWebhookEvents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("eventId").notNull(), // YOCO webhook event ID or generated hash
  checkoutId: varchar("checkoutId").notNull(), // YOCO checkout ID
  eventType: varchar("eventType").notNull(), // 'payment.succeeded', 'payment.failed', etc.
  processedAt: timestamp("processedAt").defaultNow(), // When we processed this event
  processingDurationMs: integer("processingDurationMs"), // How long processing took (for metrics)
  fulfilledBy: varchar("fulfilledBy"), // 'webhook', 'reconciliation', 'manual'
  success: boolean("success").notNull().default(true), // Did processing succeed?
  errorMessage: text("errorMessage"), // Error details if failed
  metadata: jsonb("metadata"), // Raw webhook payload snapshot
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  unique("UNQ_webhook_event").on(table.eventId), // Primary deduplication key
  index("IDX_webhook_events_checkout").on(table.checkoutId),
  index("IDX_webhook_events_type").on(table.eventType),
  index("IDX_webhook_events_created").on(table.createdAt),
  index("IDX_webhook_events_processed").on(table.processedAt),
]);

// Credit orders - tracking of credit package purchases
export const creditOrders = pgTable("creditOrders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  packageId: varchar("packageId").notNull().references(() => creditPurchasePackages.id),
  purchaserId: varchar("purchaserId").notNull().references(() => users.id),
  organizationId: varchar("organizationId").references(() => organizations.id), // For org wallet credits
  checkoutId: varchar("checkoutId").unique(), // YOCO checkout session ID
  paymentIntentId: varchar("paymentIntentId").references(() => paymentIntents.id),
  creditsAmount: integer("creditsAmount").notNull(), // Credits purchased
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(), // Price paid
  currency: currencyCodeEnum("currency").notNull(),
  status: creditOrderStatusEnum("status").notNull().default("pending"), // Uses creditOrderStatus enum with retryable states
  purchaseTarget: creditPurchaseTargetEnum("purchaseTarget").notNull().default("user"), // Who receives credits: user or organization
  receiptPdfPath: varchar("receiptPdfPath"), // Object storage path for receipt PDF
  fulfillmentAt: timestamp("fulfillmentAt"), // When credits were added to wallet
  metadata: jsonb("metadata"), // Snapshot of package details at purchase time
  retryCount: integer("retryCount").default(0), // Number of retry attempts for failed fulfillments
  lastRetryAt: timestamp("lastRetryAt"), // Last retry attempt timestamp
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_credit_orders_package").on(table.packageId),
  index("IDX_credit_orders_purchaser").on(table.purchaserId),
  index("IDX_credit_orders_org").on(table.organizationId),
  index("IDX_credit_orders_checkout").on(table.checkoutId),
  index("IDX_credit_orders_status").on(table.status),
  index("IDX_credit_orders_created").on(table.createdAt),
  unique("UNQ_credit_order_checkout").on(table.checkoutId), // One order per checkout
  index("IDX_credit_orders_payment_intent").on(table.paymentIntentId), // Phase 1b: Fast fallback lookup
]);

// Post-fulfillment background jobs for receipt/email generation
// Decouples slow operations from the critical credit fulfillment path
export const postFulfillmentJobTypeEnum = pgEnum("postFulfillmentJobType", [
  "receipt_generation",    // Generate PDF receipt
  "confirmation_email",    // Send confirmation email
  "receipt_and_email"      // Combined: generate receipt then send email with attachment
]);

export const postFulfillmentJobStatusEnum = pgEnum("postFulfillmentJobStatus", [
  "pending",      // Waiting to be processed
  "claimed",      // Worker has claimed the job (prevents duplicate processing)
  "completed",    // Successfully processed
  "failed",       // Failed after all retries (in DLQ for manual review)
  "cancelled"     // Manually cancelled
]);

export const postFulfillmentJobs = pgTable("postFulfillmentJobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("orderId").notNull().references(() => creditOrders.id),
  jobType: postFulfillmentJobTypeEnum("jobType").notNull(),
  status: postFulfillmentJobStatusEnum("status").notNull().default("pending"),
  retryCount: integer("retryCount").default(0),
  maxRetries: integer("maxRetries").default(3),
  lastAttemptAt: timestamp("lastAttemptAt"),
  nextRetryAt: timestamp("nextRetryAt"), // For exponential backoff
  claimedAt: timestamp("claimedAt"), // When worker claimed the job
  completedAt: timestamp("completedAt"),
  errorMessage: text("errorMessage"),
  resultData: jsonb("resultData"), // Store receipt path, email ID, etc.
  metadata: jsonb("metadata"), // Order context snapshot for idempotent processing
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_post_fulfillment_jobs_order").on(table.orderId),
  index("IDX_post_fulfillment_jobs_status").on(table.status),
  index("IDX_post_fulfillment_jobs_type").on(table.jobType),
  index("IDX_post_fulfillment_jobs_next_retry").on(table.nextRetryAt),
  index("IDX_post_fulfillment_jobs_created").on(table.createdAt),
  unique("UNQ_post_fulfillment_job_order_type").on(table.orderId, table.jobType), // Idempotency: one job per order per type
]);

// User-level credit allocations for teachers/team leads
export const userCreditAllocations = pgTable("userCreditAllocations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  currentBalance: integer("currentBalance").default(0), // Current available credits
  monthlyAllocation: integer("monthlyAllocation").notNull(), // Credits allocated per month based on org tier
  lastResetDate: timestamp("lastResetDate"), // Last time credits were reset
  status: userAllocationStatusEnum("status").notNull().default("active"), // active, suspended, archived
  isTrialAllocation: boolean("isTrialAllocation").default(false), // Marks one-time trial credit allocation (no resets)
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_user_credits_user").on(table.userId),
  index("IDX_user_credits_org").on(table.organizationId),
  index("IDX_user_credits_status").on(table.status),
  unique("UNQ_user_org_credits").on(table.userId, table.organizationId),
]);

// Credit transaction log for audit trail (user-level)
export const creditTransactions = pgTable("creditTransactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  allocationId: varchar("allocationId").references(() => userCreditAllocations.id), // Link to user allocation
  amount: integer("amount").notNull(), // Negative for deduction, positive for allocation
  balanceAfter: integer("balanceAfter").notNull(), // User balance after this transaction
  transactionType: varchar("transactionType").notNull(), // "deduction", "reset", "bonus_admin", "bonus_trial", "quiz_deduction"
  description: text("description"), // Human-readable description
  lessonId: varchar("lessonId").references(() => lessons.id), // If related to lesson generation
  quizId: varchar("quizId").references(() => quizCollections.id), // If related to quiz generation
  questionTier: quizQuestionTierEnum("questionTier"), // Quiz tier if this is a quiz generation transaction
  adminUserId: varchar("adminUserId").references(() => users.id), // If manually added by admin
  correlationId: varchar("correlationId"), // Links to corresponding Gamma ledger entry
  gammaLedgerEntryId: varchar("gammaLedgerEntryId"), // Direct reference to Gamma ledger entry
  metadata: jsonb("metadata"), // Additional context
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_credit_transactions_user").on(table.userId),
  index("IDX_credit_transactions_org").on(table.organizationId),
  index("IDX_credit_transactions_allocation").on(table.allocationId),
  index("IDX_credit_transactions_type").on(table.transactionType),
  index("IDX_credit_transactions_correlation").on(table.correlationId),
  index("IDX_credit_transactions_created").on(table.createdAt),
]);

// System-wide Gamma API credit ledger
export const gammaCreditLedger = pgTable("gammaCreditLedger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  correlationId: varchar("correlationId").notNull(), // Shared with user creditTransactions
  eventType: gammaEventTypeEnum("eventType").notNull(), // lesson_deduction, top_up, manual_correction, snapshot_adjustment
  deltaCredits: integer("deltaCredits").notNull(), // Positive for credit, negative for debit
  runningBalance: integer("runningBalance").notNull(), // System-wide Gamma balance after this event
  gammaRequestId: varchar("gammaRequestId"), // Gamma API request ID if applicable
  lessonId: varchar("lessonId").references(() => lessons.id), // If related to lesson generation
  initiatedByUserId: varchar("initiatedByUserId").references(() => users.id), // User who triggered the event
  metadata: jsonb("metadata"), // Additional context (Gamma response data, etc.)
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_gamma_ledger_correlation").on(table.correlationId),
  index("IDX_gamma_ledger_event_type").on(table.eventType),
  index("IDX_gamma_ledger_created").on(table.createdAt),
  index("IDX_gamma_ledger_lesson").on(table.lessonId),
]);

// Credit usage logs for analytics
export const creditUsageLogs = pgTable("creditUsageLogs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  lessonId: varchar("lessonId").references(() => lessons.id),
  creditsUsed: integer("creditsUsed").notNull(),
  actionType: varchar("actionType").notNull(),
  userId: varchar("userId").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_credit_usage_logs_org").on(table.organizationId),
  index("IDX_credit_usage_logs_lesson").on(table.lessonId),
  index("IDX_credit_usage_logs_user").on(table.userId),
]);

// Gamma API balance snapshots for reconciliation
export const gammaCreditSnapshots = pgTable("gammaCreditSnapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  capturedAt: timestamp("capturedAt").notNull().defaultNow(),
  reportedBalance: integer("reportedBalance").notNull(), // Balance reported by Gamma API
  source: varchar("source").notNull(), // "webhook", "polling", "lesson_generation"
  gammaRequestId: varchar("gammaRequestId"), // Gamma API request ID
  ledgerRunningBalanceAtCapture: integer("ledgerRunningBalanceAtCapture").notNull(), // Our internal ledger balance at this time
  varianceFromLedger: integer("varianceFromLedger").notNull(), // reportedBalance - ledgerRunningBalanceAtCapture
  metadata: jsonb("metadata"), // Full Gamma API response
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_gamma_snapshots_captured").on(table.capturedAt),
  index("IDX_gamma_snapshots_source").on(table.source),
  index("IDX_gamma_snapshots_variance").on(table.varianceFromLedger),
]);

// User credit adjustment workflow (admin-initiated)
export const userCreditAdjustments = pgTable("userCreditAdjustments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  allocationId: varchar("allocationId").notNull().references(() => userCreditAllocations.id),
  requestedBy: varchar("requestedBy").notNull().references(() => users.id), // SuperAdmin who requested
  approvedBy: varchar("approvedBy").references(() => users.id), // SuperAdmin who approved (if different)
  amountChange: integer("amountChange").notNull(), // Positive or negative credit change
  reason: text("reason").notNull(), // Human-readable reason for adjustment
  status: adjustmentStatusEnum("status").notNull().default("approved"), // pending, approved, rejected
  correlationId: varchar("correlationId"), // Links to creditTransactions and gammaCreditLedger if approved
  approvedAt: timestamp("approvedAt"),
  rejectedAt: timestamp("rejectedAt"),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_user_adjustments_allocation").on(table.allocationId),
  index("IDX_user_adjustments_status").on(table.status),
  index("IDX_user_adjustments_requested").on(table.requestedBy),
  index("IDX_user_adjustments_created").on(table.createdAt),
]);

// ==================== UNIFIED LP CREDIT SYSTEM ====================

// Unified LP Credit Ledger - single source of truth for all credit transactions
export const lpCreditLedger = pgTable("lpCreditLedger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  organizationId: varchar("organizationId").references(() => organizations.id), // Nullable - user can have credits outside org context
  transactionType: lpTransactionTypeEnum("transactionType").notNull(),
  amount: integer("amount").notNull(), // Positive for credits added, negative for deductions
  balanceAfter: integer("balanceAfter").notNull(), // User's balance after this transaction
  correlationId: varchar("correlationId").notNull(), // Unique ID for idempotency (e.g., orderId, lessonId)
  description: text("description"), // Human-readable description
  metadata: jsonb("metadata"), // Context: { intentId, checkoutId, lessonId, quizId, packageId, tier, etc. }
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_lp_ledger_user_created").on(table.userId, table.createdAt),
  index("IDX_lp_ledger_org").on(table.organizationId),
  index("IDX_lp_ledger_type").on(table.transactionType),
  index("IDX_lp_ledger_created").on(table.createdAt),
  unique("UNQ_lp_ledger_correlation").on(table.correlationId), // Idempotency constraint
]);

// ==================== ORGANIZATION CREDIT LEDGER ====================
// Organization-level credit ledger for tracking org wallet transactions
// Separate from lpCreditLedger (user credits) to maintain clean separation and avoid breaking changes
export const orgCreditLedger = pgTable("orgCreditLedger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  actorUserId: varchar("actorUserId").notNull().references(() => users.id), // Who performed the action (spent/purchased/adjusted)
  transactionType: lpTransactionTypeEnum("transactionType").notNull(), // purchase, deduction, refund, adjustment, etc.
  activityType: orgCreditActivityTypeEnum("activityType").notNull(), // lesson_generation, quiz_generation, etc.
  activityId: varchar("activityId"), // ID of the related entity (lessonId, quizId, orderId, etc.)
  amount: integer("amount").notNull(), // Positive for credits added, negative for deductions
  balanceAfter: integer("balanceAfter").notNull(), // Organization's balance after this transaction
  correlationId: varchar("correlationId").notNull(), // Unique ID for idempotency
  description: text("description"), // Human-readable description
  metadata: jsonb("metadata"), // Additional context: { packageId, lessonTitle, quizTitle, adjustmentReason, etc. }
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_org_ledger_org_created").on(table.organizationId, table.createdAt),
  index("IDX_org_ledger_actor").on(table.actorUserId),
  index("IDX_org_ledger_activity_type").on(table.activityType),
  index("IDX_org_ledger_type").on(table.transactionType),
  index("IDX_org_ledger_created").on(table.createdAt),
  unique("UNQ_org_ledger_correlation").on(table.correlationId), // Idempotency constraint
]);

// Podcast provider-cost ledger (raw provider usage/cost evidence, USD-first)
export const podcastProviderCostLedger = pgTable("podcastProviderCostLedger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  correlationId: varchar("correlationId").notNull(),
  lessonId: varchar("lessonId").notNull().references(() => lessons.id),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  versionId: varchar("versionId").notNull(),
  userId: varchar("userId").references(() => users.id),
  usageUnit: varchar("usageUnit").notNull().default("character"),
  usageAmount: integer("usageAmount").notNull().default(0),
  providerCostUsd: decimal("providerCostUsd", { precision: 14, scale: 6 }).notNull().default("0"),
  providerCurrency: varchar("providerCurrency").notNull().default("USD"),
  providerUnitPriceUsd: decimal("providerUnitPriceUsd", { precision: 14, scale: 6 }),
  fxRateUsdToLocal: decimal("fxRateUsdToLocal", { precision: 16, scale: 8 }),
  localCurrency: varchar("localCurrency").notNull().default("ZAR"),
  providerCostLocal: decimal("providerCostLocal", { precision: 14, scale: 6 }),
  pricingConfigVersion: varchar("pricingConfigVersion"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").defaultNow(),
}, (table) => [
  index("IDX_podcast_provider_cost_lesson").on(table.lessonId),
  index("IDX_podcast_provider_cost_org").on(table.organizationId),
  index("IDX_podcast_provider_cost_version").on(table.versionId),
  index("IDX_podcast_provider_cost_created").on(table.createdAt),
  unique("UNQ_podcast_provider_cost_correlation").on(table.correlationId),
]);

// Podcast settlement ledger (estimate vs final LPC, linked to actual credit transactions)
export const podcastSettlementLedger = pgTable("podcastSettlementLedger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  correlationId: varchar("correlationId").notNull(),
  lessonId: varchar("lessonId").notNull().references(() => lessons.id),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  versionId: varchar("versionId").notNull(),
  userId: varchar("userId").references(() => users.id),
  estimateCharacters: integer("estimateCharacters").notNull().default(0),
  estimatedLpcCost: integer("estimatedLpcCost").notNull().default(0),
  settledLpcCost: integer("settledLpcCost").notNull().default(0),
  estimateToFinalLpcDelta: integer("estimateToFinalLpcDelta").notNull().default(0),
  settlementReason: varchar("settlementReason").notNull().default("provider_cost_based"),
  targetMarginPercent: decimal("targetMarginPercent", { precision: 6, scale: 2 }),
  localCurrencyPerLpc: decimal("localCurrencyPerLpc", { precision: 14, scale: 6 }),
  settlementGuardrailPct: decimal("settlementGuardrailPct", { precision: 6, scale: 2 }),
  pricingConfigVersion: varchar("pricingConfigVersion"),
  userLedgerTransactionId: varchar("userLedgerTransactionId").references(() => lpCreditLedger.id),
  orgLedgerTransactionId: varchar("orgLedgerTransactionId").references(() => orgCreditLedger.id),
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").defaultNow(),
}, (table) => [
  index("IDX_podcast_settlement_lesson").on(table.lessonId),
  index("IDX_podcast_settlement_org").on(table.organizationId),
  index("IDX_podcast_settlement_version").on(table.versionId),
  index("IDX_podcast_settlement_created").on(table.createdAt),
  unique("UNQ_podcast_settlement_correlation").on(table.correlationId),
  unique("UNQ_podcast_settlement_version").on(table.versionId),
]);

// Quiz LP Credit pricing tiers (SuperAdmin configured, org-scoped with platform defaults)
export const quizCreditPricing = pgTable("quizCreditPricing", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").references(() => organizations.id), // Null = platform default
  questionTier: quizQuestionTierEnum("questionTier").notNull(), // 10, 15, or 20 questions
  creditCost: integer("creditCost").notNull(), // LP Credits cost for this tier
  isActive: boolean("isActive").default(true),
  createdBy: varchar("createdBy").references(() => users.id), // SuperAdmin who created
  updatedBy: varchar("updatedBy").references(() => users.id), // SuperAdmin who last updated
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_quiz_pricing_org").on(table.organizationId),
  index("IDX_quiz_pricing_tier").on(table.questionTier),
  index("IDX_quiz_pricing_active").on(table.isActive),
  unique("UNQ_quiz_pricing_org_tier").on(table.organizationId, table.questionTier), // One price per org per tier (null org = platform default)
]);

// Credit purchase packages (SuperAdmin configured)
export const creditPurchasePackages = pgTable("creditPurchasePackages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(), // "Starter Pack", "Professional Pack", "Enterprise Pack", "Custom Pack"
  creditsAmount: integer("creditsAmount").notNull(), // e.g., 500, 2000, 5000, 10000
  priceAmount: decimal("priceAmount", { precision: 10, scale: 2 }).notNull(), // e.g., 49.99, 149.99, 399.99
  currency: varchar("currency").default("ZAR"), // South African Rand
  badge: varchar("badge"), // "Popular", "Best Value", etc.
  features: jsonb("features"), // Array of feature descriptions
  isActive: boolean("isActive").default(true),
  displayOrder: integer("displayOrder").notNull(), // Display sequence (1, 2, 3, 4)
  colorScheme: varchar("colorScheme"), // "green", "blue", "purple", "orange" for gradient styling
  createdBy: varchar("createdBy").references(() => users.id), // SuperAdmin who created
  updatedBy: varchar("updatedBy").references(() => users.id), // SuperAdmin who last updated
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_credit_packages_active").on(table.isActive),
  index("IDX_credit_packages_display_order").on(table.displayOrder),
]);

// ==================== LICENSE SYSTEM TABLES ====================
// 
// @deprecated LEGACY - These tables are from the retired per-user license system (blue/red/gold tiers).
// The license system has been replaced by the business package subscription system (businessPackages, 
// businessPackageAssignments tables). These tables are preserved for data migration and audit purposes only.
// DO NOT use these tables for new features - use businessPackages and SeatPolicyService instead.
// Target removal: After data migration complete and audit period ends.

// @deprecated - User licenses - tracks individual user licenses within organizations
export const userLicenses = pgTable("userLicenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  tier: licenseTierEnum("tier").notNull(), // "blue", "red", "gold"
  status: licenseStatusEnum("status").notNull().default("active"), // "active", "inactive", "expired"
  activatedAt: timestamp("activatedAt").notNull().defaultNow(),
  expiresAt: timestamp("expiresAt"), // Null = no expiration (e.g., e-learning instructor subscriptions)
  deactivatedAt: timestamp("deactivatedAt"), // When license was deactivated
  activatedBy: varchar("activatedBy").references(() => users.id), // OrgAdmin who activated this license
  deactivatedBy: varchar("deactivatedBy").references(() => users.id), // OrgAdmin who deactivated
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_user_licenses_user").on(table.userId),
  index("IDX_user_licenses_org").on(table.organizationId),
  index("IDX_user_licenses_status").on(table.status),
  index("IDX_user_licenses_expires").on(table.expiresAt),
  unique("UNQ_user_org_license").on(table.userId, table.organizationId), // One license per user per org
]);

// @deprecated - License payments - tracks monthly license billing for organizations
export const licensePayments = pgTable("licensePayments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  paymentIntentId: varchar("paymentIntentId").references(() => paymentIntents.id), // Link to PaymentOrchestrator
  billingPeriodStart: timestamp("billingPeriodStart").notNull(), // Start of billing period (e.g., 2025-01-01)
  billingPeriodEnd: timestamp("billingPeriodEnd").notNull(), // End of billing period (e.g., 2025-01-31)
  seatsCount: integer("seatsCount").notNull(), // Number of licenses purchased
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: currencyCodeEnum("currency").notNull().default("ZAR"),
  status: varchar("status").notNull().default("pending"), // "pending", "processing", "paid", "failed"
  paidAt: timestamp("paidAt"), // When payment was completed
  metadata: jsonb("metadata"), // Snapshot: userIds, tier, pricing
  // Fulfillment tracking (Phase 4: Webhook fulfillment)
  fulfilledAt: timestamp("fulfilledAt"), // When license seats were provisioned
  fulfillmentStatus: fulfillmentStatusEnum("fulfillmentStatus").notNull().default("pending"), // Idempotency tracking
  errorMessage: text("errorMessage"), // Error details if fulfillment failed
  processedByWebhookId: varchar("processedByWebhookId").references(() => webhookEvents.id), // Audit trail
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_license_payments_org").on(table.organizationId),
  index("IDX_license_payments_intent").on(table.paymentIntentId),
  index("IDX_license_payments_status").on(table.status),
  index("IDX_license_payments_period").on(table.billingPeriodStart),
  unique("UNQ_license_payment_period").on(table.organizationId, table.billingPeriodStart), // Idempotency: one payment per org per period
]);

// @deprecated - Organization license settings - configuration for per-seat licensing
export const organizationLicenseSettings = pgTable("organizationLicenseSettings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id).unique(), // One setting per org
  autoRenew: boolean("autoRenew").default(true), // Auto-renew licenses monthly
  maxSeats: integer("maxSeats"), // Maximum allowed seats (null = unlimited for e-learning)
  billingDay: integer("billingDay").default(1), // Day of month to bill (1-28, default 1st)
  trialEndsAt: timestamp("trialEndsAt"), // Trial period end date for this org
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_org_license_settings_org").on(table.organizationId),
  index("IDX_org_license_settings_trial").on(table.trialEndsAt),
]);

// @deprecated - Organization licenses - tracks organization-level license entitlements (Phase 4)
export const organizationLicenses = pgTable("organizationLicenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  tier: licenseTierEnum("tier").notNull(), // "blue", "red", "gold"
  totalSeats: integer("totalSeats").notNull(), // Total seats purchased
  seatsConsumed: integer("seatsConsumed").notNull().default(0), // Seats currently allocated to users
  billingPeriodMonths: integer("billingPeriodMonths").notNull(), // 1, 3, 6, or 12 months
  currentTermStart: timestamp("currentTermStart").notNull(), // Start of current license term
  currentTermEnd: timestamp("currentTermEnd").notNull(), // End of current license term
  autoRenew: boolean("autoRenew").notNull().default(true), // Auto-renew on expiration
  status: organizationLicenseStatusEnum("status").notNull().default("pending"), // "pending", "active", "expired", "suspended"
  metadata: jsonb("metadata"), // Additional data (e.g., pricing snapshot, discount codes)
  fulfilledPaymentId: varchar("fulfilledPaymentId").references(() => licensePayments.id), // Payment that provisioned this license
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_org_licenses_org").on(table.organizationId),
  index("IDX_org_licenses_tier").on(table.tier),
  index("IDX_org_licenses_status").on(table.status),
  index("IDX_org_licenses_term_end").on(table.currentTermEnd),
  unique("UNQ_org_license_term").on(table.organizationId, table.tier, table.currentTermStart), // One license per org/tier/term
]);

// License Feature Flag Overrides (Phase 5) - Runtime control for license system rollout
export const licenseFlagOverrides = pgTable("licenseFlagOverrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  flagKey: varchar("flagKey").notNull().unique(), // "licenseSystemEnabled", "licensePaymentsEnabled", etc.
  value: boolean("value").notNull(), // Override value (true/false)
  description: text("description"), // Human-readable explanation of this override
  setBy: varchar("setBy").notNull().references(() => users.id), // SuperAdmin who set this override
  expiresAt: timestamp("expiresAt"), // Optional auto-expiry for temporary overrides
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_license_flag_overrides_key").on(table.flagKey),
  index("IDX_license_flag_overrides_expires").on(table.expiresAt),
]);

// License Feature Flag Audit Log (Phase 5) - Track all changes to feature flags
export const licenseFlagAudit = pgTable("licenseFlagAudit", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  flagKey: varchar("flagKey").notNull(), // Which flag was changed
  action: varchar("action").notNull(), // "enable", "disable", "update", "emergency_disable"
  oldValue: jsonb("oldValue"), // Previous state (for rollback reference)
  newValue: jsonb("newValue"), // New state
  changedBy: varchar("changedBy").notNull().references(() => users.id), // SuperAdmin who made the change
  reason: text("reason"), // Optional reason for the change
  metadata: jsonb("metadata"), // Additional context (IP address, session ID, etc.)
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_license_flag_audit_key").on(table.flagKey),
  index("IDX_license_flag_audit_user").on(table.changedBy),
  index("IDX_license_flag_audit_created").on(table.createdAt),
]);

// License Rollout Organization Allowlist (Phase 5) - Control which organizations have access
export const licenseRolloutOrganizations = pgTable("licenseRolloutOrganizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id).unique(),
  addedBy: varchar("addedBy").notNull().references(() => users.id), // SuperAdmin who added org to rollout
  notes: text("notes"), // Why this org was added to rollout
  expiresAt: timestamp("expiresAt"), // Optional auto-expiry for temporary rollout access
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_license_rollout_orgs_org").on(table.organizationId),
  index("IDX_license_rollout_orgs_expires").on(table.expiresAt),
]);

// License Rollout User Beta List (Phase 5) - Beta users for early access
export const licenseRolloutBetaUsers = pgTable("licenseRolloutBetaUsers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id).unique(),
  addedBy: varchar("addedBy").notNull().references(() => users.id), // SuperAdmin who added user to beta
  notes: text("notes"), // Why this user was added to beta
  expiresAt: timestamp("expiresAt"), // Optional auto-expiry for temporary beta access
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_license_rollout_beta_user").on(table.userId),
  index("IDX_license_rollout_beta_expires").on(table.expiresAt),
]);

// ==================== END LICENSE SYSTEM TABLES ====================

// AI-generated lessons
export const lessons = pgTable("lessons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  createdBy: varchar("createdBy").notNull().references(() => users.id),
  title: varchar("title").notNull(),
  description: text("description"),
  
  // Dynamic labeling fields (Grade/Department, Subject/Unit based on org type)
  gradeLevel: varchar("gradeLevel"), // For education orgs
  department: varchar("department"), // For business orgs
  subject: varchar("subject"), // For education orgs
  unit: varchar("unit"), // For business orgs
  
  // Generation tracking
  generationMode: varchar("generationMode"), // "gemini-topics", "text-input", "document-upload", "manual-upload"
  generationStatus: varchar("generationStatus").notNull().default("pending"), // "pending", "processing", "completed", "failed"
  transcriptStatus: varchar("transcriptStatus"), // "pending", "processing", "completed", "failed" - tracks PPTX text extraction
  transcriptKey: varchar("transcriptKey"), // Object Storage path for extracted transcript JSON
  
  // Learning Asset Contract - unified slide/topic structure (v1.0.0+)
  // Contains validated slides with key points, provenance tracking, and version metadata
  // Used by lesson generator, quiz generator, and course framework generator
  learningAssetContract: jsonb("learningAssetContract").$type<LearningAssetContract>(),
  
  // 10-topic structure for gemini-topics mode (each lesson has exactly 10 slides)
  // Topic 1 = Overview, Topics 2-10 = Slide content
  // Format: [{ position: 1-10, title: string, role: 'overview' | 'slide' }]
  // NOTE: Legacy field - use learningAssetContract for new lessons
  topics: jsonb("topics").$type<Array<{ position: number; title: string; role: 'overview' | 'slide' }>>(),
  
  // Legacy topic fields (deprecated - use learningAssetContract instead)
  mainTopic: varchar("mainTopic"), // For gemini-topics mode (legacy)
  subtopic1: varchar("subtopic1"), // For gemini-topics mode (legacy)
  subtopic2: varchar("subtopic2"), // For gemini-topics mode (legacy)
  inputText: text("inputText"), // For text-input mode
  
  // Gamma API integration
  gammaCardId: varchar("gammaCardId"), // Gamma presentation/card ID
  presentationUrl: varchar("presentationUrl"), // Gamma public presentation URL
  
  // Object Storage
  storageKey: varchar("storageKey"), // Object Storage path for PPTX file
  sourceDocumentPath: varchar("sourceDocumentPath"), // Object Storage path for uploaded source document (Word/PDF) used in document-upload mode
  generationParamsKey: varchar("generationParamsKey"), // Object Storage path for generation parameters backup
  // Note: viewerUrl is NOT stored in DB - generated dynamically via LessonService.getViewerUrl() to ensure fresh signed URLs
  
  // Video support - Creator can upload MP4 video walkthrough with narration
  videoStorageKey: varchar("videoStorageKey"), // Object Storage path for MP4 video file (optional)
  videoDurationSec: integer("videoDurationSec"), // Video duration in seconds (extracted from MP4)
  videoSizeBytes: integer("videoSizeBytes"), // Video file size in bytes
  videoUploadedAt: timestamp("videoUploadedAt"), // When video was uploaded
  presenterNotesJson: jsonb("presenterNotesJson"), // Gamma-generated speaker notes/scripts per slide for creator reference
  
  // Configuration
  themeId: varchar("themeId"), // Gamma theme used
  gammaImageOptions: jsonb("gammaImageOptions"), // Image generation options (source, model, style)
  gammaTextOptions: jsonb("gammaTextOptions"), // Text generation options (amount, tone, audience)
  slideCount: integer("slideCount").default(10),
  creditsUsed: integer("creditsUsed"), // Credits deducted for generation
  
  // Slide versioning (Task 3b) - tracks which version of lessonSlides is current
  currentSlideVersion: integer("currentSlideVersion").default(0), // 0 = no slides, 1+ = version in lessonSlides table
  
  // Publishing workflow
  isPublished: boolean("isPublished").default(false),
  publishedAt: timestamp("publishedAt"),
  publishedBy: varchar("publishedBy").references(() => users.id),
  
  // Archiving (soft delete)
  isArchived: boolean("isArchived").default(false),
  archivedAt: timestamp("archivedAt"),
  
  // Quiz integration
  relatedQuizId: varchar("relatedQuizId").references(() => quizCollections.id),
  
  // Analytics
  viewCount: integer("viewCount").default(0),
  completionCount: integer("completionCount").default(0),
  
  // Flexible metadata storage
  metadata: jsonb("metadata"), // Additional config, error messages, etc.
  
  // Content Feedback/Health Report fields
  contentScore10: decimal("contentScore10", { precision: 3, scale: 1 }), // Content quality score 0.0-10.0
  previousScore10: decimal("previousScore10", { precision: 3, scale: 1 }), // Previous score for improvement tracking
  lastFeedbackAt: timestamp("lastFeedbackAt"), // When last feedback report was generated
  lastFeedbackHash: varchar("lastFeedbackHash"), // Hash of content at last feedback (for caching)
  feedbackReport: jsonb("feedbackReport"), // Cached detailed feedback report from ContentCoachService
  feedbackStatus: varchar("feedbackStatus", { length: 20 }), // null | 'processing' | 'completed' | 'failed'
  aiImproveStatus: varchar("aiImproveStatus", { length: 20 }), // null | 'processing' | 'completed' | 'failed'
  aiImproveResult: jsonb("aiImproveResult"), // Cached AI improve result (changesSummary, word counts, etc.)
  
  // Zero-hallucination framework fields
  detail: text("detail"), // Extended explanation/detail for lesson content
  realWorldExample: text("realWorldExample"), // Real-world example application
  sourceMap: jsonb("sourceMap").$type<{
    documentId?: string;
    documentName?: string;
    sections: Array<{
      sectionId: string;
      startOffset: number;
      endOffset: number;
      textSpan: string;
      confidence: number;
    }>;
    extractedAt?: string;
  }>(), // Source document mapping for zero-hallucination validation
  
  languageCode: varchar("languageCode", { length: 10 }).default("en"),
  contentGroupId: varchar("contentGroupId"),
  isDefaultLanguage: boolean("isDefaultLanguage").default(true),
  sourceLanguageVersion: integer("sourceLanguageVersion"),
  translationStatus: translationStatusEnum("translationStatus").default("published"),
  activeLessonVersionId: varchar("activeLessonVersionId"),
  
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_lessons_org").on(table.organizationId),
  index("IDX_lessons_creator").on(table.createdBy),
  index("IDX_lessons_generation_status").on(table.generationStatus),
  index("IDX_lessons_published").on(table.isPublished),
  index("IDX_lessons_archived").on(table.isArchived),
  index("IDX_lessons_created").on(table.createdAt),
  index("IDX_lessons_quiz").on(table.relatedQuizId),
  index("IDX_lessons_active_version").on(table.activeLessonVersionId),
]);

// Lesson version history - Hybrid design with queryable metadata + full snapshot
export const lessonVersions = pgTable("lessonVersions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lessonId: varchar("lessonId").notNull().references(() => lessons.id),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  versionNumber: integer("versionNumber").notNull(), // Auto-incremented per lesson
  
  // Queryable metadata (for version timeline UI)
  title: varchar("title").notNull(),
  description: text("description"),
  gradeLevel: varchar("gradeLevel"),
  department: varchar("department"),
  subject: varchar("subject"),
  unit: varchar("unit"),
  generationMode: varchar("generationMode"),
  generationStatus: varchar("generationStatus"),
  themeId: varchar("themeId"),
  slideCount: integer("slideCount"),
  creditsUsed: integer("creditsUsed"),
  relatedQuizId: varchar("relatedQuizId"),
  isPublished: boolean("isPublished"),
  isArchived: boolean("isArchived"),
  publishedAt: timestamp("publishedAt"),
  publishedBy: varchar("publishedBy"),
  viewCount: integer("viewCount"),
  completionCount: integer("completionCount"),
  languageCode: varchar("languageCode").default('en'),
  
  // Complete snapshot for lossless restore (includes all lesson fields)
  lessonSnapshot: jsonb("lessonSnapshot").notNull(),
  
  // File versioning
  storageKey: varchar("storageKey").notNull(), // Object Storage key for PPTX file
  fileSize: integer("fileSize"), // In bytes
  
  // Video versioning (mirrors lessons table video fields)
  videoStorageKey: varchar("videoStorageKey"), // Object Storage path for MP4 video (if uploaded at this version)
  videoDurationSec: integer("videoDurationSec"), // Video duration at this version
  videoSizeBytes: integer("videoSizeBytes"), // Video file size at this version
  videoUploadedAt: timestamp("videoUploadedAt"), // When video was uploaded for this version
  presenterNotesJson: jsonb("presenterNotesJson"), // Speaker notes snapshot at this version
  
  // Version metadata
  changeDescription: text("changeDescription"), // Human-readable summary of changes
  diffSummary: jsonb("diffSummary"), // Structured diff data for UI display
  
  // Audit trail
  editedBy: varchar("editedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_lesson_versions_lesson").on(table.lessonId),
  index("IDX_lesson_versions_org").on(table.organizationId),
  index("IDX_lesson_versions_created").on(table.createdAt),
  unique("UNQ_lesson_version").on(table.lessonId, table.versionNumber),
]);

// Lesson content version history - tracks AI improvements and manual edits to lesson content
// Lightweight table focused on content changes with before/after snapshots
export const lessonContentVersions = pgTable("lessonContentVersions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lessonId: varchar("lessonId").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  versionNumber: integer("versionNumber").notNull(),
  source: text("source").notNull(), // 'ai_improve', 'manual_edit', etc.
  changeDescription: text("changeDescription"),
  previousContent: text("previousContent"), // Content before change (inputText)
  newContent: text("newContent"), // Content after change (inputText)
  previousTitle: text("previousTitle"),
  newTitle: text("newTitle"),
  previousDescription: text("previousDescription"),
  newDescription: text("newDescription"),
  metadata: jsonb("metadata"), // credits charged, AI model used, etc.
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  createdBy: varchar("createdBy").references(() => users.id),
},
(table) => [
  index("IDX_lesson_content_versions_lesson").on(table.lessonId),
  index("IDX_lesson_content_versions_created").on(table.createdAt),
  index("IDX_lesson_content_versions_source").on(table.source),
]);

export const lessonFeedbackCategoryEnum = pgEnum("lessonFeedbackCategory", [
  "on_topic",
  "possibly_off_topic",
  "off_topic",
]);

export const lessonFeedbackDecisionEnum = pgEnum("lessonFeedbackDecision", [
  "pending",
  "accepted",
  "rejected",
  "ignored",
  "applied",
  "stale",
]);

export const lessonFeedbackRuns = pgTable("lessonFeedbackRuns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lessonId: varchar("lessonId").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  languageCode: varchar("languageCode", { length: 10 }).default("en"),
  contentVersionRef: varchar("contentVersionRef").notNull(),
  contentHash: varchar("contentHash", { length: 64 }).notNull(),
  feedbackMode: varchar("feedbackMode", { length: 20 }).notNull().default("quick"),
  score10: decimal("score10", { precision: 3, scale: 1 }),
  summary: text("summary"),
  actionable: jsonb("actionable"),
  report: jsonb("report"),
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
  generatedBy: varchar("generatedBy").references(() => users.id),
  appliedAt: timestamp("appliedAt"),
  appliedBy: varchar("appliedBy").references(() => users.id),
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [
  index("IDX_lesson_feedback_runs_lesson").on(table.lessonId),
  index("IDX_lesson_feedback_runs_org").on(table.organizationId),
  index("IDX_lesson_feedback_runs_generated").on(table.generatedAt),
  index("IDX_lesson_feedback_runs_version").on(table.contentVersionRef),
]);

export const lessonFeedbackItems = pgTable("lessonFeedbackItems", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("runId").notNull().references(() => lessonFeedbackRuns.id, { onDelete: "cascade" }),
  lessonId: varchar("lessonId").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  languageCode: varchar("languageCode", { length: 10 }).default("en"),
  itemIndex: integer("itemIndex").notNull().default(0),
  itemHash: varchar("itemHash", { length: 64 }).notNull(),
  category: lessonFeedbackCategoryEnum("category").notNull().default("possibly_off_topic"),
  confidence: decimal("confidence", { precision: 5, scale: 4 }).notNull().default("0.5000"),
  title: text("title").notNull(),
  reason: text("reason"),
  excerpt: text("excerpt"),
  spanStart: integer("spanStart"),
  spanEnd: integer("spanEnd"),
  suggestedAction: text("suggestedAction"),
  replacementText: text("replacementText"),
  defaultSelected: boolean("defaultSelected").notNull().default(false),
  userDecision: lessonFeedbackDecisionEnum("userDecision").notNull().default("pending"),
  decisionReason: text("decisionReason"),
  decidedAt: timestamp("decidedAt"),
  decidedBy: varchar("decidedBy").references(() => users.id),
  appliedAt: timestamp("appliedAt"),
  appliedBy: varchar("appliedBy").references(() => users.id),
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [
  index("IDX_lesson_feedback_items_run").on(table.runId),
  index("IDX_lesson_feedback_items_lesson").on(table.lessonId),
  index("IDX_lesson_feedback_items_org").on(table.organizationId),
  index("IDX_lesson_feedback_items_hash").on(table.itemHash),
]);

// Gamma themes catalog - synced from Gamma API every 24 hours
export const gammaThemes = pgTable("gammaThemes", {
  id: varchar("id").primaryKey(), // Gamma's theme ID
  name: varchar("name").notNull(),
  description: text("description"),
  thumbnailUrl: varchar("thumbnailUrl"),
  categories: jsonb("categories"), // Array of category strings
  isActive: boolean("isActive").default(true),
  lastSyncedAt: timestamp("lastSyncedAt").defaultNow(),
  lastSyncError: text("lastSyncError"), // Error message from last sync attempt
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_gamma_themes_active").on(table.isActive),
  index("IDX_gamma_themes_synced").on(table.lastSyncedAt),
]);

// Gamma image styles - curated list with optional Gamma sync
export const gammaImageStyles = pgTable("gammaImageStyles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  styleKey: varchar("styleKey").notNull().unique(), // e.g., "photorealistic", "illustrated"
  displayName: varchar("displayName").notNull(),
  description: text("description"),
  thumbnailUrl: varchar("thumbnailUrl"), // Uploaded style example thumbnail
  recommendedUseCases: jsonb("recommendedUseCases"), // Array of use case strings
  source: varchar("source").notNull().default("manual"), // "gamma" or "manual"
  isActive: boolean("isActive").default(true),
  weight: integer("weight").default(0), // For ordering (higher = shown first)
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_gamma_image_styles_active").on(table.isActive),
  index("IDX_gamma_image_styles_weight").on(table.weight),
]);

// PHASE 1.2: Lesson progress status enum (references lessonProgressStatusEnum defined above)
// Removed duplicate - using lessonProgressStatusEnum from line 62

// Course completion certificates
export const certificates = pgTable("certificates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateId: varchar("certificateId").notNull().unique(), // Unique ID for verification
  certificateType: certificateTypeEnum("certificateType").notNull().default("course"),
  userId: varchar("userId").notNull().references(() => users.id),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  courseId: varchar("courseId").references(() => courses.id), // Course completion certificates
  learnerName: varchar("learnerName").notNull(),
  organizationName: varchar("organizationName").notNull(),
  courseTitle: varchar("courseTitle"), // Course completion certificates
  pdfStoragePath: varchar("pdfStoragePath"), // Permanent object storage key (e.g., bucket/.private/certificates/...)
  pdfFileUrl: varchar("pdfFileUrl"), // DEPRECATED: Expiring signed URL - regenerate from pdfStoragePath instead
  previewImageUrl: varchar("previewImageUrl"), // For social sharing
  xpEarned: integer("xpEarned").default(0), // PHASE 1.1: XP awarded for completion
  shareToken: varchar("shareToken"), // PHASE 1.1: Unique token for social sharing
  sharedPlatforms: jsonb("sharedPlatforms"), // PHASE 1.1: Array of platforms shared to ["linkedin", "twitter", "facebook"]
  completedAt: timestamp("completedAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_certificates_user").on(table.userId),
  index("IDX_certificates_org").on(table.organizationId),
  index("IDX_certificates_course").on(table.courseId),
  index("IDX_certificates_type").on(table.certificateType),
  unique("UNQ_user_course_cert").on(table.userId, table.courseId),
]);

// PHASE 1.2: Learner lesson progress tracking
export const lessonProgress = pgTable("lessonProgress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lessonId: varchar("lessonId").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  userId: varchar("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  
  status: lessonProgressStatusEnum("status").notNull().default("not_started"),
  percentComplete: integer("percentComplete").default(0), // 0-100, validated in service layer
  secondsSpent: integer("secondsSpent").default(0), // >=0, validated in service layer
  lastCheckpoint: varchar("lastCheckpoint"), // Last slide/section viewed
  slidesViewedCount: integer("slidesViewedCount").default(0), // Number of unique slides viewed
  totalSlides: integer("totalSlides").default(0), // Total slides in lesson (from lesson metadata)
  
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_lesson_progress_user").on(table.userId),
  index("IDX_lesson_progress_lesson").on(table.lessonId),
  index("IDX_lesson_progress_org").on(table.organizationId),
  index("IDX_lesson_progress_status").on(table.status),
  index("IDX_lesson_progress_org_user").on(table.organizationId, table.userId), // For org-scoped queries
  unique("UNQ_lesson_user_org_progress").on(table.lessonId, table.userId, table.organizationId), // Prevent duplicates per org
]);

export const lessonProgressSlides = pgTable("lessonProgressSlides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lessonProgressId: varchar("lessonProgressId").notNull().references(() => lessonProgress.id, { onDelete: "cascade" }),
  slideIndex: integer("slideIndex").notNull(),
  viewedAt: timestamp("viewedAt").defaultNow(),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  unique("unique_lesson_progress_slide").on(table.lessonProgressId, table.slideIndex), // Prevent duplicate slide views
]);

// PHASE 1.3: Lesson assignments to students
export const lessonAssignments = pgTable("lessonAssignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lessonId: varchar("lessonId").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  studentId: varchar("studentId").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  assignedBy: varchar("assignedBy").notNull().references(() => users.id),
  
  gradeLevel: varchar("gradeLevel").references(() => organizationUnits.id),
  departmentId: varchar("departmentId").references(() => organizationUnits.id),
  subjectId: varchar("subjectId").references(() => organizationSubUnits.id),
  unitId: varchar("unitId").references(() => organizationSubUnits.id),
  
  dueDate: timestamp("dueDate"), // Optional deadline
  assignedAt: timestamp("assignedAt").defaultNow(),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_lesson_assignments_lesson").on(table.lessonId),
  index("IDX_lesson_assignments_student").on(table.studentId),
  index("IDX_lesson_assignments_org").on(table.organizationId),
  index("IDX_lesson_assignments_org_student").on(table.organizationId, table.studentId), // For fetching student's assigned lessons
  unique("UNQ_lesson_assignment_scope").on(table.lessonId, table.studentId, table.organizationId, table.gradeLevel, table.departmentId, table.subjectId, table.unitId), // Prevent duplicate scoped assignments
]);

// PHASE 1.3: Many-to-many lesson-quiz links (replaces single relatedQuizId)
export const lessonQuizLinks = pgTable("lessonQuizLinks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lessonId: varchar("lessonId").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  quizId: varchar("quizId").notNull().references(() => quizCollections.id, { onDelete: "cascade" }),
  isPrimary: boolean("isPrimary").default(false), // One quiz can be marked as primary
  
  // Quiz versioning - track which presentation version generated this quiz
  presentationVersionId: integer("presentationVersionId"), // Links to lesson.currentSlideVersion
  slideContentHash: varchar("slideContentHash"), // Hash of slide content for change detection
  isOutdated: boolean("isOutdated").default(false), // True if slides have changed since quiz generation
  
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_lesson_quiz_links_lesson").on(table.lessonId),
  index("IDX_lesson_quiz_links_quiz").on(table.quizId),
  unique("UNQ_lesson_quiz_link").on(table.lessonId, table.quizId), // Prevent duplicate links
]);

// PHASE 1.3: Scope-based lesson assignments (like quizCollectionAssignments)
// This allows lessons to be assigned to department/unit combinations without requiring students to exist
// When students are assigned to a department/unit, they automatically get access to these lessons
export const lessonScopeAssignments = pgTable("lessonScopeAssignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lessonId: varchar("lessonId").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  unitId: varchar("unitId").references(() => organizationUnits.id), // Department/Grade - if null, all units
  subjectId: varchar("subjectId").references(() => organizationSubUnits.id), // Subject/Unit - if null, all subjects in unit
  audience: lessonAssignmentAudienceEnum("audience").notNull().default("learner"), // Target audience: learner (students/employees) or instructor (teachers/team_leads)
  assignedBy: varchar("assignedBy").notNull().references(() => users.id),
  dueDate: timestamp("dueDate"), // Optional deadline
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => ({
  IDX_lesson_scope_assignments_lesson: index("IDX_lesson_scope_assignments_lesson").on(table.lessonId),
  IDX_lesson_scope_assignments_org: index("IDX_lesson_scope_assignments_org").on(table.organizationId),
  IDX_lesson_scope_assignments_unit: index("IDX_lesson_scope_assignments_unit").on(table.unitId),
  IDX_lesson_scope_assignments_subject: index("IDX_lesson_scope_assignments_subject").on(table.subjectId),
  IDX_lesson_scope_assignments_audience: index("IDX_lesson_scope_assignments_audience").on(table.audience),
  UNQ_lesson_scope_assignment: unique("UNQ_lesson_scope_assignment")
    .on(table.lessonId, table.organizationId, table.audience, table.unitId, table.subjectId)
    .nullsNotDistinct(), // Treat NULL values as equal for idempotent upserts on unit-only/org-wide scopes
}));

// PHASE 1.2: Daily completion streaks for learners
export const dailyStreaks = pgTable("dailyStreaks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  
  currentStreak: integer("currentStreak").default(0), // Days in a row
  bestStreak: integer("bestStreak").default(0), // Personal record
  lastCompletedDate: date("lastCompletedDate"), // Date of last lesson completion (avoids timezone drift)
  
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_daily_streaks_user").on(table.userId),
  index("IDX_daily_streaks_org").on(table.organizationId),
  unique("UNQ_user_org_streak").on(table.userId, table.organizationId), // One streak record per user per org
]);

// ==================== E-LEARNING PLATFORM TABLES ====================

// Course categories for marketplace browsing
export const courseCategories = pgTable("courseCategories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id), // Tenancy: categories owned by org
  name: varchar("name").notNull(),
  description: text("description"),
  iconName: varchar("iconName"), // lucide-react icon name
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_course_categories_org").on(table.organizationId),
]);

// Main courses table
export const courses = pgTable("courses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  title: varchar("title").notNull(),
  description: text("description"),
  thumbnailUrl: varchar("thumbnailUrl"), // Replit App Storage path
  thumbnailSource: thumbnailSourceEnum("thumbnailSource"), // How thumbnail was created: 'upload' or 'ai'
  thumbnailGeneratedAt: timestamp("thumbnailGeneratedAt"), // When AI thumbnail was generated
  thumbnailPromptSummary: text("thumbnailPromptSummary"), // Summary of prompt used for AI generation (for debugging)
  price: decimal("price", { precision: 19, scale: 4 }).notNull(), // Financial best practice: decimal(19,4)
  currency: currencyCodeEnum("currency").notNull(), // ZAR/USD/EUR
  categoryId: varchar("categoryId"), // Deprecated - no longer using categories, use unitId (department) instead
  difficultyLevel: difficultyLevelEnum("difficultyLevel"),
  estimatedDuration: integer("estimatedDuration"), // in minutes
  status: courseStatusEnum("status").notNull().default("draft"), // draft/active/inactive/archived
  visibility: courseVisibilityEnum("visibility").notNull().default("org_only"), // public (marketplace) or org_only (internal)
  unitId: varchar("unitId").references(() => organizationUnits.id), // Department - if null, visible to all departments in org
  subUnitId: varchar("subUnitId").references(() => organizationSubUnits.id), // Sub-unit within department - if null, visible to all sub-units
  teamId: varchar("teamId").references(() => organizationTeams.id), // Team (Level 3) - if null, visible to all teams in sub-unit
  currentVersionId: varchar("currentVersionId"), // Points to latest published version
  averageRating: decimal("averageRating", { precision: 3, scale: 2 }).default("0.00"),
  totalRatings: integer("totalRatings").default(0),
  createdBy: varchar("createdBy").notNull().references(() => users.id),
  languageCode: varchar("languageCode", { length: 10 }).default("en"),
  contentGroupId: varchar("contentGroupId"),
  isDefaultLanguage: boolean("isDefaultLanguage").default(true),
  sourceLanguageVersion: integer("sourceLanguageVersion"),
  translationStatus: translationStatusEnum("translationStatus").default("published"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
  
  // Course versioning fields for full-clone draft approach
  sourceVersionCourseId: varchar("sourceVersionCourseId"), // When this is a draft clone, points to the original active course
  cloneMapping: jsonb("cloneMapping").$type<{
    originalCourseId: string;
    lessonIdMap: Record<string, string>;
    quizIdMap: Record<string, string>;
    quizCardIdMap: Record<string, string>;
    courseLessonIdMap: Record<string, string>;
    filesMap: Array<{ original: string; cloned: string }>;
    clonedAt: string;
  }>(), // ID mappings for publish reconciliation
},
(table) => [
  index("IDX_courses_org").on(table.organizationId),
  index("IDX_courses_status").on(table.status),
  index("IDX_courses_category").on(table.categoryId),
  index("IDX_courses_title").on(table.title), // For full-text search
  index("IDX_courses_visibility").on(table.visibility), // For visibility-based filtering
  // Composite index for marketplace browsing: active public courses
  index("IDX_courses_status_visibility").on(table.status, table.visibility),
  // Composite index for marketplace browsing: active courses sorted by createdAt DESC
  index("IDX_courses_status_created").on(table.status, table.createdAt),
  index("IDX_courses_source_version").on(table.sourceVersionCourseId), // For finding draft clones
]);

// Course drafts - stores draft versions of courses for editing without affecting learner access
export const courseDrafts = pgTable("courseDrafts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  originalCourseId: varchar("originalCourseId").notNull().references(() => courses.id, { onDelete: "cascade" }),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  createdBy: varchar("createdBy").notNull().references(() => users.id),
  
  // Draft data - copy of course fields that can be edited
  title: varchar("title").notNull(),
  description: text("description"),
  thumbnailUrl: varchar("thumbnailUrl"),
  price: decimal("price", { precision: 19, scale: 4 }).default("0"),
  currency: currencyCodeEnum("currency").default("ZAR"),
  difficultyLevel: difficultyLevelEnum("difficultyLevel"),
  estimatedDuration: integer("estimatedDuration"),
  visibility: courseVisibilityEnum("visibility").default("org_only"),
  category: varchar("category"),
  tags: text("tags").array(),
  
  // Draft metadata
  draftNotes: text("draftNotes"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_course_drafts_original").on(table.originalCourseId),
  index("IDX_course_drafts_org").on(table.organizationId),
  unique("UNQ_course_draft_active").on(table.originalCourseId),
]);

// Course framework for AI-assisted topic structure
export const courseFrameworks = pgTable("courseFrameworks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("courseId").notNull().references(() => courses.id, { onDelete: "cascade" }),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  topics: jsonb("topics").notNull(), // [{ id: uuid, order: int, name: string, lessonId: uuid | null }]
  
  // Zero-hallucination framework - source document provenance
  sourceMap: jsonb("sourceMap").$type<{
    documentId?: string;
    documentName?: string;
    rawTextHash?: string;
    sectionSpans: Array<{
      topicId: string;
      sectionId: string;
      startOffset: number;
      endOffset: number;
      textSpan: string;
    }>;
    extractedAt?: string;
  }>(), // Maps framework topics to source document spans
  
  // Content health scoring for framework-level validation
  contentHealth: jsonb("contentHealth").$type<{
    overallScore: number;
    topicScores: Array<{
      topicId: string;
      score: number;
      issues: string[];
    }>;
    hasOverview: boolean;
    hasKeyTakeaways: boolean;
    validatedAt?: string;
  }>(),
  
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_course_frameworks_course").on(table.courseId),
  unique("UNQ_course_framework").on(table.courseId), // One framework per course
]);

// Links lessons to courses
export const courseLessons = pgTable("courseLessons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("courseId").notNull().references(() => courses.id, { onDelete: "cascade" }),
  lessonId: varchar("lessonId").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  topicId: varchar("topicId"), // Framework topic ID for stable matching (nullable for legacy records)
  topicOrder: integer("topicOrder").notNull(), // Position in course structure
  topicName: varchar("topicName").notNull(),
  primaryQuizId: varchar("primaryQuizId").references(() => quizCollections.id, { onDelete: "set null" }), // Auto-linked when quiz generated from lesson
  
  // N+1 Framework required lesson fields
  learningObjectives: text("learningObjectives").array(), // Array of learning objectives with Bloom's taxonomy levels
  lessonDetail: text("lessonDetail"), // Extended explanation/detail for this lesson
  realWorldExample: text("realWorldExample"), // Real-world example application
  lessonType: varchar("lessonType").$type<"overview" | "content" | "key_takeaways">(), // N+1 structure: Overview first, Key Takeaways last
  
  // Content health for this specific lesson in the course context
  contentHealth: jsonb("contentHealth").$type<{
    score: number;
    wordCount: number;
    objectiveCoverage: number;
    sourceConfidence: number;
    issues: string[];
    validatedAt?: string;
  }>(),
  
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_course_lessons_course").on(table.courseId),
  index("IDX_course_lessons_lesson").on(table.lessonId),
  index("IDX_course_lessons_quiz").on(table.primaryQuizId), // For efficient quiz lookups
  unique("UNQ_course_lesson").on(table.courseId, table.lessonId), // Architect requirement: unique constraint
]);

// Course tags for enhanced search
export const courseTags = pgTable("courseTags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id), // Tenancy: tags owned by org
  courseId: varchar("courseId").notNull().references(() => courses.id, { onDelete: "cascade" }),
  tagName: varchar("tagName").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_course_tags_course").on(table.courseId),
  index("IDX_course_tags_name").on(table.tagName), // For tag-based search
]);

// Course assignments - assign courses to users/units/departments/teams with scope-based cascade
export const courseAssignments = pgTable("courseAssignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("courseId").notNull().references(() => courses.id, { onDelete: "cascade" }),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  assignedBy: varchar("assignedBy").notNull().references(() => users.id),
  
  // Assignment scope determines cascade level
  assignmentScope: courseAssignmentScopeEnum("assignmentScope").notNull().default("user"),
  
  // Target IDs based on scope
  userId: varchar("userId").references(() => users.id, { onDelete: "cascade" }), // For scope='user'
  unitId: varchar("unitId").references(() => organizationUnits.id),              // Department (Level 1) - for scope='department'
  subjectId: varchar("subjectId").references(() => subjects.id),                 // Subject - for scope='subject' or subject-specific class/team
  subUnitId: varchar("subUnitId").references(() => organizationSubUnits.id),     // Unit (Level 2) - for scope='unit'
  teamId: varchar("teamId").references(() => organizationTeams.id),              // Team (Level 3) - for scope='team'
  
  targetOrganizationId: varchar("targetOrganizationId").references(() => organizations.id),
  audience: courseAssignmentAudienceEnum("audience").notNull().default("learner"),
  mandatory: boolean("mandatory").notNull().default(false),
  dueDate: timestamp("dueDate"),
  assignedAt: timestamp("assignedAt").defaultNow(),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_course_assignments_course").on(table.courseId),
  index("IDX_course_assignments_org").on(table.organizationId),
  index("IDX_course_assignments_user").on(table.userId),
  index("IDX_course_assignments_unit").on(table.unitId),
  index("IDX_course_assignments_subject").on(table.subjectId),
  index("IDX_course_assignments_subunit").on(table.subUnitId),
  index("IDX_course_assignments_team").on(table.teamId),
  index("IDX_course_assignments_scope").on(table.assignmentScope),
  index("IDX_course_assignments_target_org").on(table.targetOrganizationId),
  unique("UNQ_course_assignment_user").on(table.courseId, table.userId, table.organizationId, table.targetOrganizationId).nullsNotDistinct(),
  unique("UNQ_course_assignment_scope").on(table.courseId, table.organizationId, table.audience, table.unitId, table.subjectId, table.subUnitId, table.teamId, table.targetOrganizationId).nullsNotDistinct(),
]);

// Inter-org course assignment rules - defines which orgs can assign courses to each other (on-prem only)
export const interOrgCourseAssignmentRules = pgTable("interOrgCourseAssignmentRules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceOrganizationId: varchar("sourceOrganizationId").notNull().references(() => organizations.id),
  targetOrganizationId: varchar("targetOrganizationId").notNull().references(() => organizations.id),
  enabled: boolean("enabled").notNull().default(true),
  createdBy: varchar("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_interorg_rules_source").on(table.sourceOrganizationId),
  index("IDX_interorg_rules_target").on(table.targetOrganizationId),
  unique("UNQ_interorg_rule_pair").on(table.sourceOrganizationId, table.targetOrganizationId),
]);

// Course progress - tracks user progress through a course
export const courseProgress = pgTable("courseProgress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("courseId").notNull().references(() => courses.id, { onDelete: "cascade" }),
  userId: varchar("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  
  status: courseProgressStatusEnum("status").notNull().default("not_started"),
  completedLessons: integer("completedLessons").default(0),
  totalLessons: integer("totalLessons").default(0),
  percentComplete: integer("percentComplete").default(0),
  
  lastAccessedAt: timestamp("lastAccessedAt"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_course_progress_course").on(table.courseId),
  index("IDX_course_progress_user").on(table.userId),
  index("IDX_course_progress_org").on(table.organizationId),
  index("IDX_course_progress_status").on(table.status),
  unique("UNQ_course_progress_user_course").on(table.userId, table.courseId, table.organizationId),
]);

// Course versioning
export const courseVersions = pgTable("courseVersions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("courseId").notNull().references(() => courses.id, { onDelete: "cascade" }),
  versionNumber: varchar("versionNumber").notNull(), // "1.0", "2.0", etc.
  title: varchar("title").notNull(),
  description: text("description"),
  thumbnailUrl: varchar("thumbnailUrl"),
  basePrice: decimal("basePrice", { precision: 19, scale: 4 }).notNull(), // Base price for this version
  baseCurrency: currencyCodeEnum("baseCurrency").notNull(), // Currency for base price (ZAR/USD/EUR)
  isPublished: boolean("isPublished").default(false),
  publishedAt: timestamp("publishedAt"),
  previousVersionId: varchar("previousVersionId"), // Nullable - links to previous version for upgrade path
  upgradePrice: decimal("upgradePrice", { precision: 19, scale: 4 }), // Price to upgrade from previous version
  upgradeCurrency: currencyCodeEnum("upgradeCurrency"), // Currency for upgrade price
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_course_versions_course").on(table.courseId),
  index("IDX_course_versions_published").on(table.isPublished),
]);

// Purchase status enum
export const purchaseStatusEnum = pgEnum("purchaseStatus", ["pending", "completed", "refunded", "failed"]);

// Course purchases with exchange rate snapshots
export const coursePurchases = pgTable("coursePurchases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("courseId").notNull().references(() => courses.id),
  courseVersionId: varchar("courseVersionId").notNull().references(() => courseVersions.id),
  userId: varchar("userId").notNull().references(() => users.id),
  checkoutId: varchar("checkoutId"), // YOCO checkout ID for payment tracking
  status: purchaseStatusEnum("status").default("pending").notNull(), // Payment/purchase status
  purchasePrice: decimal("purchasePrice", { precision: 19, scale: 4 }).notNull(),
  purchaseCurrency: currencyCodeEnum("purchaseCurrency").notNull(),
  platformCurrency: currencyCodeEnum("platformCurrency").notNull(), // Platform's base currency for commission calc
  exchangeRateUsed: decimal("exchangeRateUsed", { precision: 19, scale: 8 }).notNull(), // Financial best practice: decimal(19,8) for rates
  platformAmount: decimal("platformAmount", { precision: 19, scale: 4 }).notNull(), // Amount in platform currency
  commissionRate: decimal("commissionRate", { precision: 5, scale: 4 }).notNull(), // e.g., 0.3000 = 30%
  commissionAmount: decimal("commissionAmount", { precision: 19, scale: 4 }).notNull(),
  creatorEarnings: decimal("creatorEarnings", { precision: 19, scale: 4 }).notNull(),
  purchasedAt: timestamp("purchasedAt").defaultNow(),
  refundedAt: timestamp("refundedAt"), // When purchase was refunded (if applicable)
  // FX rate storage for refund consistency (Task 8)
  baseCurrency: currencyCodeEnum("baseCurrency"), // Course's original pricing currency (nullable for backward compatibility)
  basePrice: decimal("basePrice", { precision: 19, scale: 4 }), // Course's original price in baseCurrency (nullable for backward compatibility)
  receiptPdfPath: varchar("receiptPdfPath"), // Path to receipt PDF in Object Storage (nullable for backward compatibility)
},
(table) => [
  index("IDX_course_purchases_course").on(table.courseId),
  index("IDX_course_purchases_user").on(table.userId),
  index("IDX_course_purchases_status").on(table.status),
  index("IDX_course_purchases_checkout").on(table.checkoutId),
  unique("UNQ_user_course_purchase").on(table.userId, table.courseId), // Architect requirement: one purchase per user per course
]);

// Course refund requests (OrgAdmin approval required)
export const courseRefunds = pgTable("courseRefunds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  purchaseId: varchar("purchaseId").notNull().references(() => coursePurchases.id),
  courseId: varchar("courseId").notNull().references(() => courses.id),
  userId: varchar("userId").notNull().references(() => users.id), // User requesting refund
  organizationId: varchar("organizationId").notNull().references(() => organizations.id), // E-learning org that owns the course
  status: courseRefundStatusEnum("status").notNull().default("pending"),
  requestReason: text("requestReason").notNull(), // User's reason for requesting refund
  decisionReason: text("decisionReason"), // Admin's reason for approval/decline
  decidedBy: varchar("decidedBy").references(() => users.id), // OrgAdmin who made decision
  originalAmount: decimal("originalAmount", { precision: 19, scale: 4 }).notNull(), // Original purchase price
  originalCurrency: currencyCodeEnum("originalCurrency").notNull(), // Currency at time of purchase
  exchangeRateSnapshot: decimal("exchangeRateSnapshot", { precision: 19, scale: 8 }).notNull(), // FX rate at purchase
  platformCommission: decimal("platformCommission", { precision: 19, scale: 4 }).notNull(), // Commission platform keeps
  creatorRefundAmount: decimal("creatorRefundAmount", { precision: 19, scale: 4 }).notNull(), // Amount creator org must refund (price - commission)
  platformCurrency: currencyCodeEnum("platformCurrency").notNull(), // Platform's base currency
  completionPercentage: decimal("completionPercentage", { precision: 5, scale: 2 }).default("0.00"), // Course completion % at time of request
  eligibilityWindowDays: integer("eligibilityWindowDays").notNull().default(14), // Refund eligibility window
  requestedAt: timestamp("requestedAt").notNull().defaultNow(),
  decidedAt: timestamp("decidedAt"), // When admin made decision
  paidOutAt: timestamp("paidOutAt"), // When refund was processed
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_course_refunds_purchase").on(table.purchaseId),
  index("IDX_course_refunds_course").on(table.courseId),
  index("IDX_course_refunds_user").on(table.userId),
  index("IDX_course_refunds_org").on(table.organizationId),
  index("IDX_course_refunds_status").on(table.status),
  index("IDX_course_refunds_requested").on(table.requestedAt),
]);

// Version upgrade purchases
export const courseVersionUpgrades = pgTable("courseVersionUpgrades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  courseId: varchar("courseId").notNull().references(() => courses.id),
  fromVersionId: varchar("fromVersionId").notNull().references(() => courseVersions.id),
  toVersionId: varchar("toVersionId").notNull().references(() => courseVersions.id),
  upgradePrice: decimal("upgradePrice", { precision: 19, scale: 4 }).notNull(),
  upgradeCurrency: currencyCodeEnum("upgradeCurrency").notNull(),
  exchangeRateUsed: decimal("exchangeRateUsed", { precision: 19, scale: 8 }).notNull(),
  platformAmount: decimal("platformAmount", { precision: 19, scale: 4 }).notNull(),
  commissionAmount: decimal("commissionAmount", { precision: 19, scale: 4 }).notNull(),
  creatorEarnings: decimal("creatorEarnings", { precision: 19, scale: 4 }).notNull(),
  purchasedAt: timestamp("purchasedAt").defaultNow(),
},
(table) => [
  index("IDX_course_version_upgrades_user").on(table.userId),
  index("IDX_course_version_upgrades_course").on(table.courseId),
  unique("UNQ_user_version_upgrade").on(table.userId, table.courseId, table.toVersionId), // Architect requirement
]);

// User enrollments (multi-org access control)
export const userCourseEnrollments = pgTable("userCourseEnrollments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  courseId: varchar("courseId").notNull().references(() => courses.id),
  courseVersionId: varchar("courseVersionId").notNull().references(() => courseVersions.id),
  hasNewerVersion: boolean("hasNewerVersion").default(false),
  latestVersionId: varchar("latestVersionId").references(() => courseVersions.id),
  enrolledAt: timestamp("enrolledAt").defaultNow(),
},
(table) => [
  index("IDX_user_course_enrollments_user").on(table.userId),
  index("IDX_user_course_enrollments_course").on(table.courseId),
]);

// Lesson progress tracking (version-aware)
export const userCourseLessonProgress = pgTable("userCourseLessonProgress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  courseId: varchar("courseId").notNull().references(() => courses.id),
  courseVersionId: varchar("courseVersionId").notNull().references(() => courseVersions.id), // Architect requirement: disambiguate across versions
  lessonId: varchar("lessonId").notNull().references(() => lessons.id),
  status: lessonProgressStatusEnum("status").default("not_started"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_user_course_lesson_progress_user").on(table.userId),
  index("IDX_user_course_lesson_progress_course").on(table.courseId),
  index("IDX_user_course_lesson_progress_lesson").on(table.lessonId),
]);

// Monthly course payouts for organizations
export const coursePayouts = pgTable("coursePayouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  currency: currencyCodeEnum("currency").notNull(),
  grossRevenue: decimal("grossRevenue", { precision: 19, scale: 4 }).notNull(),
  platformCommission: decimal("platformCommission", { precision: 19, scale: 4 }).notNull(),
  netAmount: decimal("netAmount", { precision: 19, scale: 4 }).notNull(),
  exchangeRateSnapshot: jsonb("exchangeRateSnapshot").notNull(), // IMMUTABLE snapshot at payout creation
  status: payoutStatusEnum("status").default("pending"),
  paidAt: timestamp("paidAt"),
  paymentReference: varchar("paymentReference"), // For idempotency
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_course_payouts_org").on(table.organizationId),
  index("IDX_course_payouts_status").on(table.status),
  index("IDX_course_payouts_period").on(table.periodEnd),
]);

// Course payout line items
export const coursePayoutLineItems = pgTable("coursePayoutLineItems", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  payoutId: varchar("payoutId").notNull().references(() => coursePayouts.id, { onDelete: "cascade" }),
  courseId: varchar("courseId").notNull().references(() => courses.id),
  salesCount: integer("salesCount").notNull(),
  grossRevenue: decimal("grossRevenue", { precision: 19, scale: 4 }).notNull(),
  platformCommission: decimal("platformCommission", { precision: 19, scale: 4 }).notNull(),
  netAmount: decimal("netAmount", { precision: 19, scale: 4 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_course_payout_line_items_payout").on(table.payoutId),
  index("IDX_course_payout_line_items_course").on(table.courseId),
]);

// Course reviews and ratings
export const courseReviews = pgTable("courseReviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("courseId").notNull().references(() => courses.id),
  userId: varchar("userId").notNull().references(() => users.id),
  organizationId: varchar("organizationId").references(() => organizations.id), // Reviewer's org for org-isolation of reviews
  rating: decimal("rating", { precision: 3, scale: 1 }).notNull(), // 0.5 to 5.0 (half-star increments)
  comment: text("comment"), // Required if rating < 4.5
  displayName: varchar("displayName").notNull(),
  reviewerDisplayName: varchar("reviewerDisplayName"),
  useRealName: boolean("useRealName").default(false),
  isHidden: boolean("isHidden").default(false), // Creator moderation (legacy field)
  isVisible: boolean("isVisible").default(true), // Moderation visibility
  moderatedBy: varchar("moderatedBy").references(() => users.id),
  moderatedAt: timestamp("moderatedAt"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_course_reviews_course").on(table.courseId),
  index("IDX_course_reviews_user").on(table.userId),
  index("IDX_course_reviews_org").on(table.organizationId),
  unique("UNQ_user_course_review").on(table.courseId, table.userId), // Architect requirement: one review per user per course
]);

// Course price history
export const coursePriceHistory = pgTable("coursePriceHistory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("courseId").notNull().references(() => courses.id),
  oldPrice: decimal("oldPrice", { precision: 19, scale: 4 }),
  newPrice: decimal("newPrice", { precision: 19, scale: 4 }).notNull(),
  currency: currencyCodeEnum("currency").notNull(),
  changedAt: timestamp("changedAt").defaultNow(),
  changedBy: varchar("changedBy").notNull().references(() => users.id),
},
(table) => [
  index("IDX_course_price_history_course").on(table.courseId),
]);

// Payout disbursements with immutable exchange rate snapshots
export const payoutDisbursements = pgTable("payoutDisbursements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id), // Tenancy: payouts owned by org
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  originalCurrency: currencyCodeEnum("originalCurrency").notNull(),
  originalAmount: decimal("originalAmount", { precision: 19, scale: 4 }).notNull(),
  convertedCurrency: currencyCodeEnum("convertedCurrency").notNull(),
  convertedAmount: decimal("convertedAmount", { precision: 19, scale: 4 }).notNull(),
  exchangeRateSnapshot: jsonb("exchangeRateSnapshot").notNull(), // IMMUTABLE: { usdToZar, usdToEur, eurToZar, rateDate, rateSource, rateProvider }
  totalSales: decimal("totalSales", { precision: 19, scale: 4 }).notNull(),
  commissionRate: decimal("commissionRate", { precision: 5, scale: 4 }).notNull(),
  commissionAmount: decimal("commissionAmount", { precision: 19, scale: 4 }).notNull(),
  netPayout: decimal("netPayout", { precision: 19, scale: 4 }).notNull(),
  dueDate: timestamp("dueDate").notNull(),
  status: payoutStatusEnum("status").default("pending"),
  paidAt: timestamp("paidAt"),
  paymentReference: varchar("paymentReference"), // Unique payment reference for idempotency
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_payout_disbursements_org").on(table.organizationId),
  index("IDX_payout_disbursements_status").on(table.status),
  index("IDX_payout_disbursements_period").on(table.periodEnd),
]);

// Organization banking details (encrypted)
export const organizationBankingDetails = pgTable("organizationBankingDetails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  bankName: varchar("bankName").notNull(),
  accountHolderName: varchar("accountHolderName").notNull(),
  accountNumber: text("accountNumber").notNull(), // ENCRYPTED - stored as encrypted text
  branchCode: varchar("branchCode"),
  swiftCode: varchar("swiftCode"),
  accountType: varchar("accountType"), // "business" or "personal"
  bankAddress: text("bankAddress"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
  updatedBy: varchar("updatedBy").references(() => users.id), // Audit trail
},
(table) => [
  unique("UNQ_org_banking").on(table.organizationId), // One banking record per org
]);

// Currency conversion rates
export const currencyConversionRates = pgTable("currencyConversionRates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  baseCurrency: currencyCodeEnum("baseCurrency").notNull(),
  targetCurrency: currencyCodeEnum("targetCurrency").notNull(),
  rate: decimal("rate", { precision: 19, scale: 8 }).notNull(), // Financial best practice: high precision for rates
  source: rateSourceEnum("source").notNull(), // "auto" or "manual"
  lastUpdated: timestamp("lastUpdated").defaultNow(),
  updatedBy: varchar("updatedBy").references(() => users.id), // For manual overrides
  isActive: boolean("isActive").default(true),
},
(table) => [
  index("IDX_currency_rates_base_target").on(table.baseCurrency, table.targetCurrency),
  index("IDX_currency_rates_active").on(table.isActive),
]);

// Financial audit log (complete audit trail)
export const financialAuditLog = pgTable("financialAuditLog", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: varchar("eventType").notNull(), // "payout_created", "payout_paid", "rate_override", etc.
  entityType: varchar("entityType").notNull(), // "payout", "purchase", "rate", etc.
  entityId: varchar("entityId").notNull(),
  userId: varchar("userId").references(() => users.id),
  beforeState: jsonb("beforeState"), // Snapshot before change
  afterState: jsonb("afterState"), // Snapshot after change
  ipAddress: varchar("ipAddress"),
  userAgent: text("userAgent"),
  timestamp: timestamp("timestamp").defaultNow(),
  notes: text("notes"),
},
(table) => [
  index("IDX_financial_audit_entity").on(table.entityType, table.entityId),
  index("IDX_financial_audit_timestamp").on(table.timestamp),
]);

// Payment transactions (YOCO ready - stubbed)
export const paymentTransactions = pgTable("paymentTransactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id), // Tenancy: transactions owned by org
  userId: varchar("userId").notNull().references(() => users.id),
  courseId: varchar("courseId").references(() => courses.id),
  courseVersionId: varchar("courseVersionId").references(() => courseVersions.id),
  provider: varchar("provider").default("yoco"), // Payment provider
  checkoutId: varchar("checkoutId").notNull(), // External checkout ID from payment provider
  amount: decimal("amount", { precision: 19, scale: 4 }).notNull(),
  currency: currencyCodeEnum("currency").notNull(),
  status: paymentStatusEnum("status").default("pending"),
  metadata: jsonb("metadata"), // Additional transaction data
  createdAt: timestamp("createdAt").defaultNow(),
  completedAt: timestamp("completedAt"),
},
(table) => [
  index("IDX_payment_transactions_user").on(table.userId),
  index("IDX_payment_transactions_course").on(table.courseId),
  index("IDX_payment_transactions_status").on(table.status),
  unique("UNQ_payment_checkout").on(table.checkoutId), // Architect requirement: unique checkout ID
]);

// Payout batches for platform-wide payout processing
export const payoutBatches = pgTable("payoutBatches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  batchDate: timestamp("batchDate").notNull(),
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  status: varchar("status").notNull().default("pending"), // "pending", "processing", "completed", "failed"
  totalPayouts: decimal("totalPayouts", { precision: 19, scale: 4 }).default("0"),
  totalAmount: decimal("totalAmount", { precision: 19, scale: 4 }).default("0"),
  currency: currencyCodeEnum("currency").default("ZAR"),
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow(),
  createdBy: varchar("createdBy").references(() => users.id),
},
(table) => [
  index("IDX_payout_batches_status").on(table.status),
  index("IDX_payout_batches_date").on(table.batchDate),
]);

// Platform revenue reports (cached analytics)
export const platformRevenueReports = pgTable("platformRevenueReports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reportDate: timestamp("reportDate").notNull(),
  organizationType: organizationTypeEnum("organizationType"), // null for aggregate reports
  totalRevenue: decimal("totalRevenue", { precision: 19, scale: 4 }).notNull(),
  totalCommission: decimal("totalCommission", { precision: 19, scale: 4 }).notNull(),
  totalPayouts: decimal("totalPayouts", { precision: 19, scale: 4 }).notNull(),
  currency: varchar("currency").notNull().default("ZAR"),
  reportData: jsonb("reportData"), // Cached full report data (byOrgType, periodStart, periodEnd)
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_platform_revenue_date").on(table.reportDate),
  index("IDX_platform_revenue_org_type").on(table.organizationType),
  // Enforce one aggregate (NULL orgType) report per reportDate.
  uniqueIndex("UNQ_platform_revenue_reports_date_null_orgtype")
    .on(table.reportDate)
    .where(sql`${table.organizationType} IS NULL`),
  // Enforce one orgType-specific report per reportDate.
  uniqueIndex("UNQ_platform_revenue_reports_date_orgtype")
    .on(table.reportDate, table.organizationType)
    .where(sql`${table.organizationType} IS NOT NULL`),
]);

// Translation search indexing pipeline
export const translationIndexJobStatusEnum = pgEnum("translationIndexJobStatus", [
  "pending",
  "processing",
  "completed",
  "failed",
  "dead_letter",
]);

export const translationIndexEventTypeEnum = pgEnum("translationIndexEventType", [
  "create",
  "update",
  "translate",
  "publish",
  "unpublish",
  "set_current",
  "set_active",
]);

export const translationIndexEntityTypeEnum = pgEnum("translationIndexEntityType", [
  "course",
  "lesson",
  "quiz",
  "podcast",
]);

export const translationIndexJobs = pgTable("translationIndexJobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  entityType: translationIndexEntityTypeEnum("entityType").notNull(),
  entityId: varchar("entityId").notNull(),
  eventType: translationIndexEventTypeEnum("eventType").notNull(),
  languageCode: varchar("languageCode", { length: 10 }),
  contentGroupId: varchar("contentGroupId"),
  dedupeKey: varchar("dedupeKey").notNull(),
  status: translationIndexJobStatusEnum("status").notNull().default("pending"),
  attemptCount: integer("attemptCount").notNull().default(0),
  maxAttempts: integer("maxAttempts").notNull().default(5),
  nextRetryAt: timestamp("nextRetryAt"),
  processedAt: timestamp("processedAt"),
  lastError: text("lastError"),
  payload: jsonb("payload"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
}, (table) => [
  unique("UNQ_translation_index_jobs_dedupe").on(table.dedupeKey),
  index("IDX_translation_index_jobs_status").on(table.status),
  index("IDX_translation_index_jobs_next_retry").on(table.nextRetryAt),
  index("IDX_translation_index_jobs_entity").on(table.entityType, table.entityId),
  index("IDX_translation_index_jobs_org").on(table.organizationId),
]);

export const translationIndexFailures = pgTable("translationIndexFailures", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("jobId").notNull().references(() => translationIndexJobs.id, { onDelete: "cascade" }),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  errorMessage: text("errorMessage").notNull(),
  attemptCount: integer("attemptCount").notNull(),
  deadLettered: boolean("deadLettered").notNull().default(false),
  payload: jsonb("payload"),
  createdAt: timestamp("createdAt").defaultNow(),
}, (table) => [
  index("IDX_translation_index_failures_job").on(table.jobId),
  index("IDX_translation_index_failures_org").on(table.organizationId),
  index("IDX_translation_index_failures_deadletter").on(table.deadLettered),
]);

export const translationSearchDocuments = pgTable("translationSearchDocuments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  entityType: translationIndexEntityTypeEnum("entityType").notNull(),
  entityId: varchar("entityId").notNull(),
  languageCode: varchar("languageCode", { length: 10 }).notNull().default("en"),
  contentGroupId: varchar("contentGroupId"),
  sourceEntityId: varchar("sourceEntityId"),
  title: text("title"),
  summary: text("summary"),
  searchableText: text("searchableText").notNull(),
  variantUpdatedAt: timestamp("variantUpdatedAt"),
  indexedAt: timestamp("indexedAt").defaultNow(),
  metadata: jsonb("metadata"),
}, (table) => [
  unique("UNQ_translation_search_docs_entity_lang").on(table.entityType, table.entityId, table.languageCode),
  index("IDX_translation_search_docs_org").on(table.organizationId),
  index("IDX_translation_search_docs_group_lang").on(table.contentGroupId, table.languageCode),
  index("IDX_translation_search_docs_entity").on(table.entityType, table.entityId),
]);

export const translationAnalyticsEventTypeEnum = pgEnum("translationAnalyticsEventType", [
  "content_view",
  "quiz_attempt",
  "quiz_review",
  "podcast_play",
  "podcast_download",
  "podcast_set_active",
  "translation_start",
  "translation_retry",
  "translation_fail",
  "translation_success",
  "translation_publish",
  "publish_readiness_check",
  "publish_action",
]);

export const translationAnalyticsEvents = pgTable("translationAnalyticsEvents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  userId: varchar("userId").references(() => users.id),
  eventType: translationAnalyticsEventTypeEnum("eventType").notNull(),
  resourceType: translationIndexEntityTypeEnum("resourceType").notNull(),
  resourceId: varchar("resourceId").notNull(),
  languageCode: varchar("languageCode", { length: 10 }),
  variantId: varchar("variantId"),
  contentGroupId: varchar("contentGroupId"),
  canonicalGroupId: varchar("canonicalGroupId"),
  dedupeKey: varchar("dedupeKey"),
  metadata: jsonb("metadata"),
  occurredAt: timestamp("occurredAt").defaultNow(),
  createdAt: timestamp("createdAt").defaultNow(),
}, (table) => [
  unique("UNQ_translation_analytics_dedupe").on(table.dedupeKey),
  index("IDX_translation_analytics_org").on(table.organizationId),
  index("IDX_translation_analytics_event").on(table.eventType),
  index("IDX_translation_analytics_lang").on(table.languageCode),
  index("IDX_translation_analytics_variant").on(table.variantId),
  index("IDX_translation_analytics_occurred").on(table.occurredAt),
]);

// ==================== END E-LEARNING TABLES ====================

// Background job queue for Gamma API polling
export const pendingGammaJobs = pgTable("pendingGammaJobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id), // For org isolation
  lessonId: varchar("lessonId").notNull().references(() => lessons.id),
  gammaGenerationId: varchar("gammaGenerationId").unique(), // Gamma API job ID (unique for idempotent retries) - nullable until populated
  status: varchar("status").notNull().default("pending"), // "pending", "polling", "completed", "failed"
  retryCount: integer("retryCount").default(0),
  lastPolledAt: timestamp("lastPolledAt"),
  firstPollingAt: timestamp("firstPollingAt"), // HIGH FIX #7: Track when job first entered polling state for timeout detection
  errorMessage: text("errorMessage"),
  metadata: jsonb("metadata"), // Request details
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_gamma_jobs_org").on(table.organizationId),
  index("IDX_gamma_jobs_status").on(table.status),
  index("IDX_gamma_jobs_created").on(table.createdAt),
  index("IDX_gamma_jobs_lesson").on(table.lessonId),
  index("IDX_gamma_jobs_org_status").on(table.organizationId, table.status), // For org-scoped queue processing
  // TASK 2b: Partial unique index to ensure only one active job per lesson at database level
  // This is a safety net on top of application-level cancelActiveJobsForLesson logic
  uniqueIndex("UNQ_active_job_per_lesson")
    .on(table.lessonId)
    .where(sql`${table.status} IN ('pending', 'claimed', 'polling')`),
]);

// Lesson access audit log (for signed URL generation)
export const lessonAccessLogs = pgTable("lessonAccessLogs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lessonId: varchar("lessonId").notNull().references(() => lessons.id),
  userId: varchar("userId").notNull().references(() => users.id),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  actionType: varchar("actionType").notNull(), // "view", "download", "signed_url_generated"
  ipAddress: varchar("ipAddress"),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_lesson_access_lesson").on(table.lessonId),
  index("IDX_lesson_access_user").on(table.userId),
  index("IDX_lesson_access_created").on(table.createdAt),
]);

// ========================================
// LESSON SLIDES TABLE (Task 3a)
// Versioned slide storage for AI-enriched lesson content
// ========================================
export const lessonSlides = pgTable("lessonSlides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lessonId: varchar("lessonId").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1), // Slide generation version (1, 2, 3...)
  slideIndex: integer("slideIndex").notNull(), // 0-9 for 10-slide lessons
  title: varchar("title", { length: 200 }).notNull(), // Slide title
  bullets: text("bullets").array().notNull().default(sql`'{}'::text[]`), // 2-5 bullet points per slide
  speakerNotes: text("speakerNotes"), // AI-generated speaker notes for instructors
  mediaPrompt: text("mediaPrompt"), // AI prompt for image generation (if applicable)
  role: varchar("role", { length: 20 }).notNull().default("slide"), // "overview" | "slide"
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_lesson_slides_lesson").on(table.lessonId),
  index("IDX_lesson_slides_version").on(table.lessonId, table.version),
  // Unique constraint: one slide per position per version per lesson
  unique("UNQ_lesson_slide_position").on(table.lessonId, table.version, table.slideIndex),
]);

// ========================================
// LESSON PRESENTATION VERSIONS TABLE
// Tracks each Gamma-generated PPTX version for download history
// ========================================
export const lessonPresentationVersions = pgTable("lessonPresentationVersions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lessonId: varchar("lessonId").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  version: integer("version").notNull(), // Sequential version per lesson (1, 2, 3...)
  gammaCardId: varchar("gammaCardId").notNull(), // Gamma presentation/card ID
  presentationUrl: varchar("presentationUrl").notNull(), // Gamma public presentation URL
  storageKey: varchar("storageKey").notNull(), // Object Storage path for PPTX file
  themeId: varchar("themeId"), // Gamma theme used for this version
  gammaImageOptions: jsonb("gammaImageOptions"), // Image generation options snapshot (source, model, style)
  gammaTextOptions: jsonb("gammaTextOptions"), // Text generation options snapshot (amount, tone, audience)
  creditsCharged: integer("creditsCharged"), // LP credits used for this generation
  isGenerated: boolean("isGenerated").default(false), // Distinguishes AI-generated presentations (via Gamma API, true) from user-uploaded ones (false)
  isCompressed: boolean("isCompressed").default(false), // Tracks if PPTX was compressed to prevent double-compression on replacement
  languageCode: varchar("languageCode").default('en'),
  createdAt: timestamp("createdAt").defaultNow(),
  createdBy: varchar("createdBy").notNull().references(() => users.id),
},
(table) => [
  index("IDX_lesson_presentation_versions_lesson").on(table.lessonId),
  index("IDX_lesson_presentation_versions_created").on(table.createdAt),
  // Unique constraint: one version per sequence per lesson
  unique("UNQ_lesson_presentation_version").on(table.lessonId, table.version),
]);

// ========================================
// GAMIFICATION SYSTEM TABLES
// ========================================

// Coin transactions ledger for full audit trail
export const coinTransactions = pgTable("coinTransactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  amount: integer("amount").notNull(), // Positive for earning, negative for spending
  balance: integer("balance").notNull(), // Balance after this transaction
  type: varchar("type").notNull(), // "quiz_completion", "challenge_reward", "level_up", "purchase", "streak_bonus"
  description: text("description"), // Human-readable description
  metadata: jsonb("metadata"), // Additional context (e.g., {quizId, challengeId, powerUpId})
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_coin_transactions_user").on(table.userId),
  index("IDX_coin_transactions_created").on(table.createdAt),
]);

// Challenge templates defining available challenges
export const challengeTemplates = pgTable("challengeTemplates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description").notNull(),
  type: varchar("type").notNull(), // "daily", "weekly"
  requirement: varchar("requirement").notNull(), // "complete_quizzes", "pass_quizzes", "perfect_scores", "win_streak"
  targetValue: integer("targetValue").notNull(), // e.g., 5 quizzes
  coinReward: integer("coinReward").notNull(),
  xpReward: integer("xpReward").default(0),
  powerUpReward: varchar("powerUpReward").references(() => powerUpCatalog.id), // Optional power-up reward
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow(),
});

// User progress on challenges
export const challengeProgress = pgTable("challengeProgress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  challengeId: varchar("challengeId").notNull().references(() => challengeTemplates.id),
  currentValue: integer("currentValue").default(0), // Current progress towards target
  isCompleted: boolean("isCompleted").default(false),
  isClaimed: boolean("isClaimed").default(false), // Whether reward has been claimed
  completedAt: timestamp("completedAt"),
  claimedAt: timestamp("claimedAt"),
  resetAt: timestamp("resetAt").notNull(), // When this challenge resets (end of day/week)
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_challenge_progress_user").on(table.userId),
  index("IDX_challenge_progress_reset").on(table.resetAt),
]);

// Power-up catalog defining all available power-ups
export const powerUpCatalog = pgTable("powerUpCatalog", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description").notNull(),
  type: varchar("type").notNull(), // "xp_boost", "change_answer", "time_extension", "hint"
  effect: jsonb("effect").notNull(), // e.g., {multiplier: 2, duration: 600} or {uses: 1}
  coinCost: integer("coinCost").notNull(),
  tier: varchar("tier").default("common"), // "common", "rare", "epic", "legendary"
  isActive: boolean("isActive").default(true),
  iconUrl: varchar("iconUrl"),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  unique("UNQ_powerUpCatalog_name_type").on(table.name, table.type),
]);

// User's power-up inventory
export const powerUpInventory = pgTable("powerUpInventory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  powerUpId: varchar("powerUpId").notNull().references(() => powerUpCatalog.id),
  quantity: integer("quantity").default(0),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_powerup_inventory_user").on(table.userId),
  unique("UNQ_user_powerup").on(table.userId, table.powerUpId),
]);

// Active power-ups with expiry tracking
export const activePowerUps = pgTable("activePowerUps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  powerUpId: varchar("powerUpId").notNull().references(() => powerUpCatalog.id),
  activatedAt: timestamp("activatedAt").notNull().defaultNow(),
  expiresAt: timestamp("expiresAt").notNull(), // When the power-up effect ends
  effect: jsonb("effect").notNull(), // Copy of effect for consistency
  gameId: varchar("gameId"), // Optional: specific game/quiz this applies to
  usesRemaining: integer("usesRemaining"), // For single-use power-ups like change answer
},
(table) => [
  index("IDX_active_powerups_user").on(table.userId),
  index("IDX_active_powerups_expires").on(table.expiresAt),
]);

// Cosmetic items catalog
export const cosmeticCatalog = pgTable("cosmeticCatalog", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description").notNull(),
  type: varchar("type").notNull(), // "avatar_ring", "avatar_frame", "name_color", "victory_animation"
  effect: jsonb("effect").notNull(), // Visual effect data (e.g., {color: "#ff0000", animation: "fire"})
  coinCost: integer("coinCost").notNull(),
  tier: varchar("tier").default("common"), // "common", "rare", "epic", "legendary"
  isActive: boolean("isActive").default(true),
  previewUrl: varchar("previewUrl"), // URL to preview image
  isSeasonPassExclusive: boolean("isSeasonPassExclusive").default(false), // Only available to season pass holders
  seasonNumber: integer("seasonNumber"), // Which season this cosmetic belongs to (null if not season-specific)
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  unique("UNQ_cosmeticCatalog_name_type").on(table.name, table.type),
]);

// User's cosmetic ownership
export const cosmeticOwnership = pgTable("cosmeticOwnership", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  cosmeticId: varchar("cosmeticId").notNull().references(() => cosmeticCatalog.id),
  purchasedAt: timestamp("purchasedAt").defaultNow(),
},
(table) => [
  index("IDX_cosmetic_ownership_user").on(table.userId),
  unique("UNQ_user_cosmetic").on(table.userId, table.cosmeticId),
]);

// Currently equipped cosmetics
export const equippedCosmetics = pgTable("equippedCosmetics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  cosmeticId: varchar("cosmeticId").notNull().references(() => cosmeticCatalog.id),
  slot: varchar("slot").notNull(), // "avatar_ring", "avatar_frame", "name_color"
  equippedAt: timestamp("equippedAt").defaultNow(),
},
(table) => [
  index("IDX_equipped_cosmetics_user").on(table.userId),
  unique("UNQ_user_slot").on(table.userId, table.slot),
]);

// Season pass tiers and rewards
export const seasonPassTiers = pgTable("seasonPassTiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  seasonPassConfigId: varchar("seasonPassConfigId").notNull().references(() => seasonPassConfig.id, { onDelete: 'cascade' }),
  tier: integer("tier").notNull(),
  xpRequired: integer("xpRequired").notNull(), // Cumulative XP to reach this tier
  
  // Free tier rewards
  freeRewardType: varchar("freeRewardType"), // "coins", "power_up", "cosmetic", null
  freeRewardId: varchar("freeRewardId"), // FK to powerUpCatalog or cosmeticCatalog if applicable
  freeRewardAmount: integer("freeRewardAmount"), // Amount of coins if coin reward
  
  // Premium tier rewards
  premiumRewardType: varchar("premiumRewardType"), // "coins", "power_up", "cosmetic", null
  premiumRewardId: varchar("premiumRewardId"), // FK to powerUpCatalog or cosmeticCatalog if applicable
  premiumRewardAmount: integer("premiumRewardAmount"), // Amount of coins if coin reward
  
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_season_tiers_config").on(table.seasonPassConfigId, table.tier),
  unique("UNQ_season_tier").on(table.seasonPassConfigId, table.tier),
]);

// User's season pass progress
export const seasonPassProgress = pgTable("seasonPassProgress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  seasonPassConfigId: varchar("seasonPassConfigId").notNull().references(() => seasonPassConfig.id),
  currentTier: integer("currentTier").default(0),
  seasonXP: integer("seasonXP").default(0), // XP earned this season
  unlockedTiers: text("unlockedTiers").array().default(sql`ARRAY[]::text[]`), // Array of tier IDs unlocked
  claimedTiers: text("claimedTiers").array().default(sql`ARRAY[]::text[]`), // Array of tier IDs claimed
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_season_progress_user").on(table.userId),
  index("IDX_season_progress_config").on(table.seasonPassConfigId),
  unique("UNQ_user_season_config").on(table.userId, table.seasonPassConfigId),
]);

// Player season rewards - permanent ownership of claimed rewards from any season
export const playerSeasonRewards = pgTable("playerSeasonRewards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  seasonPassConfigId: varchar("seasonPassConfigId").notNull().references(() => seasonPassConfig.id),
  tier: integer("tier").notNull(),
  isPremiumReward: boolean("isPremiumReward").default(false), // true if this was a premium tier reward
  rewardType: varchar("rewardType").notNull(), // "coins", "power_up", "cosmetic"
  rewardId: varchar("rewardId"), // FK to catalog item if applicable
  rewardAmount: integer("rewardAmount"), // Amount if coins
  rewardSnapshot: jsonb("rewardSnapshot"), // Full reward details at time of claim (name, description, etc.)
  claimedAt: timestamp("claimedAt").defaultNow(),
},
(table) => [
  index("IDX_player_season_rewards_user").on(table.userId),
  index("IDX_player_season_rewards_config").on(table.seasonPassConfigId),
  unique("UNQ_user_season_tier_reward").on(table.userId, table.seasonPassConfigId, table.tier, table.isPremiumReward),
]);

// Achievement catalog
export const achievementCatalog = pgTable("achievementCatalog", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description").notNull(),
  category: varchar("category").notNull(), // "quizzes", "streaks", "perfection", "milestones"
  requirement: varchar("requirement").notNull(), // "complete_100_quizzes", "perfect_streak_10", "reach_level_50"
  targetValue: integer("targetValue").notNull(),
  coinReward: integer("coinReward").default(0),
  badgeUrl: varchar("badgeUrl"), // URL to badge image
  permanentBonus: jsonb("permanentBonus"), // Optional permanent bonus (e.g., {xpMultiplier: 1.05})
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow(),
});

// User's unlocked achievements
export const achievementUnlocks = pgTable("achievementUnlocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  achievementId: varchar("achievementId").notNull().references(() => achievementCatalog.id),
  progress: integer("progress").default(0), // Current progress towards achievement
  isUnlocked: boolean("isUnlocked").default(false),
  unlockedAt: timestamp("unlockedAt"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_achievement_unlocks_user").on(table.userId),
  unique("UNQ_user_achievement").on(table.userId, table.achievementId),
]);

// Login streak tracking
export const loginStreaks = pgTable("loginStreaks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id).unique(),
  currentStreak: integer("currentStreak").default(0),
  longestStreak: integer("longestStreak").default(0),
  lastLoginDate: timestamp("lastLoginDate"),
  totalCoinsEarned: integer("totalCoinsEarned").default(0), // Total coins earned from login streaks
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_login_streaks_user").on(table.userId),
]);

// GAMIFICATION ADMIN CONFIGURATION TABLES

// Economy rules - configurable coin/XP rewards for various activities
export const gamificationEconomyRules = pgTable("gamificationEconomyRules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scope: varchar("scope").notNull().default("organization"), // "global" or "organization"
  organizationId: varchar("organizationId").references(() => organizations.id), // Null for global defaults (when scope='global')
  actionType: varchar("actionType").notNull(), // "quiz_win", "quiz_participation", "daily_login", "perfect_score", "streak_bonus"
  coinReward: integer("coinReward").default(0),
  xpReward: integer("xpReward").default(0),
  description: text("description"), // Admin notes about this rule
  isActive: boolean("isActive").default(true),
  createdBy: varchar("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_economy_rules_org").on(table.organizationId),
  index("IDX_economy_rules_scope").on(table.scope),
  unique("UNQ_scope_org_activity").on(table.scope, table.organizationId, table.actionType),
]);

// Shop item pricing - override default prices for power-ups and cosmetics
export const shopItemPricing = pgTable("shopItemPricing", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scope: varchar("scope").notNull().default("organization"), // "global" or "organization"
  organizationId: varchar("organizationId").references(() => organizations.id), // Null for global defaults (when scope='global')
  itemType: varchar("itemType").notNull(), // "power_up", "cosmetic"
  itemId: varchar("itemId").notNull(), // ID of the power-up or cosmetic
  coinCost: integer("coinCost").notNull(),
  isAvailable: boolean("isAvailable").default(true), // Can hide items per organization
  customDescription: text("customDescription"), // Optional custom description
  createdBy: varchar("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_shop_pricing_org").on(table.organizationId),
  index("IDX_shop_pricing_scope").on(table.scope),
  unique("UNQ_scope_org_item").on(table.scope, table.organizationId, table.itemType, table.itemId),
]);

// Admin-managed challenge configurations (replaces hardcoded challenges)
export const adminChallengeConfig = pgTable("adminChallengeConfig", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scope: varchar("scope").notNull().default("organization"), // "global" or "organization"
  organizationId: varchar("organizationId").references(() => organizations.id), // Null for global challenges (when scope='global')
  challengeType: varchar("challengeType").notNull(), // "daily", "weekly"
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  goalType: varchar("goalType").notNull(), // "quiz_completions", "quiz_passes", "correct_answers", "xp_earned"
  goalTarget: integer("goalTarget").notNull(), // Target value to complete
  coinReward: integer("coinReward").default(0),
  xpReward: integer("xpReward").default(0),
  powerUpReward: varchar("powerUpReward").references(() => powerUpCatalog.id),
  isActive: boolean("isActive").default(true),
  createdBy: varchar("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_admin_challenge_config_org").on(table.organizationId),
  index("IDX_admin_challenge_config_scope").on(table.scope),
]);

// Season pass configuration - admin-defined tier structure
export const seasonPassConfig = pgTable("seasonPassConfig", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scope: varchar("scope").notNull().default("organization"), // "global" or "organization"
  organizationId: varchar("organizationId").references(() => organizations.id), // Null for global config (when scope='global')
  seasonNumber: integer("seasonNumber").notNull(),
  seasonName: varchar("seasonName").notNull(), // "Summer Challenge 2025"
  description: text("description"), // Description of the season pass
  status: varchar("status").notNull().default("draft"), // "draft", "scheduled", "active", "expired"
  tierDefinitions: jsonb("tierDefinitions").notNull(), // Array of {tier, xpRequired, rewardType, rewardId, rewardAmount}
  coinCost: integer("coinCost").default(0), // Cost to purchase premium season pass
  coinMultiplier: decimal("coinMultiplier", { precision: 4, scale: 2 }).default("1.00"), // Coin earning multiplier (e.g., 2.00 for 2x coins)
  xpMultiplier: decimal("xpMultiplier", { precision: 4, scale: 2 }).default("1.00"), // XP earning multiplier (e.g., 1.50 for 1.5x XP)
  advantages: text("advantages"), // Description of premium pass benefits
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  activatedAt: timestamp("activatedAt"), // When the season pass was activated
  expiredAt: timestamp("expiredAt"), // When the season pass expired
  isActive: boolean("isActive").default(false), // Convenience field - true only when status='active'
  createdBy: varchar("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_season_config_org").on(table.organizationId),
  index("IDX_season_config_scope").on(table.scope),
  index("IDX_season_config_status").on(table.status),
  index("IDX_season_config_active").on(table.scope, table.organizationId, table.isActive),
  unique("UNQ_scope_org_season").on(table.scope, table.organizationId, table.seasonNumber),
]);

// Coin adjustments audit log - manual credits/debits by admins
export const coinAdjustments = pgTable("coinAdjustments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  amount: integer("amount").notNull(), // Positive for credit, negative for debit
  reason: text("reason").notNull(),
  adminId: varchar("adminId").notNull().references(() => users.id),
  balanceBefore: integer("balanceBefore").notNull(),
  balanceAfter: integer("balanceAfter").notNull(),
  adjustedAt: timestamp("adjustedAt").notNull().defaultNow(),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_coin_adjustments_user").on(table.userId),
  index("IDX_coin_adjustments_admin").on(table.adminId),
]);

// User cosmetic loadouts - tracks which cosmetics each user has equipped
export const userCosmeticLoadouts = pgTable("userCosmeticLoadouts", {
  userId: varchar("userId").primaryKey().references(() => users.id),
  equippedBorder: varchar("equippedBorder"), // e.g., "border_gold", "border_platinum"
  equippedGlow: varchar("equippedGlow"), // e.g., "glow_diamond", "glow_emerald"
  equippedBadge: varchar("equippedBadge"), // e.g., "badge_legendary", "badge_champion"
  equippedAnimation: varchar("equippedAnimation"), // e.g., "animation_fireworks", "animation_sparkle"
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_user_cosmetic_loadouts_user").on(table.userId),
]);

// Season pass purchases - tracks which users have purchased premium season passes
export const seasonPassPurchases = pgTable("seasonPassPurchases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  seasonPassConfigId: varchar("seasonPassConfigId").notNull().references(() => seasonPassConfig.id),
  purchasedAt: timestamp("purchasedAt").defaultNow(),
  expiresAt: timestamp("expiresAt").notNull(), // Copied from seasonPassConfig.endDate at purchase time
  coinsPaid: integer("coinsPaid").notNull(), // How many coins were spent
  isActive: boolean("isActive").default(true), // Whether this pass is currently active
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_season_pass_purchases_user").on(table.userId),
  index("IDX_season_pass_purchases_config").on(table.seasonPassConfigId),
  index("IDX_season_pass_purchases_active").on(table.isActive),
  unique("UNQ_user_season_pass").on(table.userId, table.seasonPassConfigId),
]);

// AI Configuration - SuperAdmin managed AI settings
// ARCHITECTURE: Multi-purpose AI configuration (not per-organization)
// - Only SuperAdmins can manage these configurations
// - Supports separate active configs per PURPOSE: 'text' (quizzes, topics, descriptions) and 'image' (thumbnails)
// - Each purpose can have ONE active config at a time
// - Text services (AIService, courseTopicAIService, lessonDescriptionAIService, aiEnrichmentService) use purpose='text'
// - Image services (courseThumbnailAIService) use purpose='image' 
// - To change active model for a purpose, use the /api/ai/config/:id/activate endpoint (uses transaction)
export const aiConfig = pgTable("aiConfig", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: varchar("provider").notNull().default("gemini"), // "gemini", "openai", etc.
  apiKey: varchar("apiKey").notNull(),
  modelName: varchar("modelName").notNull(), // e.g., "gemini-2.5-flash" for text, "gemini-2.5-flash-image" for images
  purpose: varchar("purpose", { length: 20 }).notNull().default("text"), // "text" or "image" - determines which AI service uses this config
  isActive: boolean("isActive").default(false), // Default to false - only one active per purpose
  createdBy: varchar("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

// Quiz Drafts - Stores in-progress AI-generated quiz collections
export const quizDrafts = pgTable("quizDrafts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  createdBy: varchar("createdBy").notNull().references(() => users.id),
  
  // Criteria (Step 1)
  gradeId: varchar("gradeId").references(() => organizationUnits.id), // Selected grade/unit
  subjectId: varchar("subjectId").references(() => subjects.id), // Selected subject
  topic: text("topic"), // User-defined topic for questions (legacy - kept for backward compatibility)
  primaryTopic: text("primaryTopic"), // Primary topic for structured topic input
  subtopic1: text("subtopic1"), // First subtopic/focus area
  subtopic2: text("subtopic2"), // Second subtopic/focus area
  numberOfQuestions: integer("numberOfQuestions").default(10),
  difficulty: varchar("difficulty", { length: 50 }).default("medium"),
  requiredPassPercentage: integer("requiredPassPercentage").default(70),
  questionTypeDistribution: jsonb("questionTypeDistribution"), // {multipleChoice: 50, trueFalse: 20, match: 10, fillBlank: 20}
  
  // Generated content (Step 2 & 3)
  name: varchar("name"), // Quiz collection name (legacy - kept for backward compatibility)
  description: text("description"), // Quiz description (legacy - kept for backward compatibility)
  quizName: varchar("quizName"), // Quiz collection name (preferred)
  quizDescription: text("quizDescription"), // Quiz description (preferred)
  isPublic: boolean("isPublic").default(false), // Whether quiz is public or organization-only
  passPercentage: integer("passPercentage").default(70), // Required pass percentage
  generatedQuestions: jsonb("generatedQuestions"), // Array of {questionType, question, answers: [], correctIndex, matchPairs, correctAnswer, selected: boolean}

  // Source provenance for grounded AI generation (lesson-linked quizzes)
  sourceSelection: jsonb("sourceSelection"), // Selected source/version contract captured in wizard
  lastGeneratedSourceContract: jsonb("lastGeneratedSourceContract"), // Source contract actually used on successful generation
  
  // Wizard state
  currentStep: integer("currentStep").default(1), // 1=criteria, 2=generate, 3=review, 4=publish
  isPublished: boolean("isPublished").default(false),
  publishedCollectionId: varchar("publishedCollectionId").references(() => quizCollections.id),
  
  // Source lesson for quiz generation and linking
  lessonId: varchar("lessonId").references(() => lessons.id, { onDelete: "set null" }),
  
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_quiz_drafts_org").on(table.organizationId),
  index("IDX_quiz_drafts_creator").on(table.createdBy),
  index("IDX_quiz_drafts_lesson").on(table.lessonId),
]);

// Zod schemas for AI config
export const insertAiConfigSchema = createInsertSchema(aiConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Zod schemas for quiz drafts
export const insertQuizDraftSchema = createInsertSchema(quizDrafts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Zod schemas for sales inquiries
export const insertSalesInquirySchema = createInsertSchema(salesInquiries).omit({
  id: true,
  createdAt: true,
  status: true,
  statusUpdatedAt: true,
  statusUpdatedBy: true,
});

// Schema for updating sales inquiry status
export const updateSalesInquiryStatusSchema = z.object({
  status: z.enum(["Follow Up", "Responded", "In Progress", "Closed"]),
});

// Zod schemas for quiz card explanations
export const insertQuizCardExplanationSchema = createInsertSchema(quizCardExplanations).omit({
  id: true,
  createdAt: true,
});

// Zod schemas for term definitions
export const insertTermDefinitionSchema = createInsertSchema(termDefinitions).omit({
  id: true,
  createdAt: true,
});

// Zod schemas for explanation terms
export const insertExplanationTermSchema = createInsertSchema(explanationTerms).omit({
  id: true,
  createdAt: true,
});

// Zod schemas for gamification tables
export const insertCoinTransactionSchema = createInsertSchema(coinTransactions).omit({
  id: true,
  createdAt: true,
});

export const insertChallengeTemplateSchema = createInsertSchema(challengeTemplates).omit({
  id: true,
  createdAt: true,
});

export const insertChallengeProgressSchema = createInsertSchema(challengeProgress).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPowerUpCatalogSchema = createInsertSchema(powerUpCatalog).omit({
  id: true,
  createdAt: true,
});

export const insertPowerUpInventorySchema = createInsertSchema(powerUpInventory).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertActivePowerUpSchema = createInsertSchema(activePowerUps).omit({
  id: true,
  activatedAt: true,
});

export const insertCosmeticCatalogSchema = createInsertSchema(cosmeticCatalog).omit({
  id: true,
  createdAt: true,
});

export const insertCosmeticOwnershipSchema = createInsertSchema(cosmeticOwnership).omit({
  id: true,
  purchasedAt: true,
});

export const insertEquippedCosmeticSchema = createInsertSchema(equippedCosmetics).omit({
  id: true,
  equippedAt: true,
});

export const insertSeasonPassTierSchema = createInsertSchema(seasonPassTiers).omit({
  id: true,
  createdAt: true,
});

export const insertSeasonPassProgressSchema = createInsertSchema(seasonPassProgress).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPlayerSeasonRewardSchema = createInsertSchema(playerSeasonRewards).omit({
  id: true,
  claimedAt: true,
});

export const insertAchievementCatalogSchema = createInsertSchema(achievementCatalog).omit({
  id: true,
  createdAt: true,
});

export const insertAchievementUnlockSchema = createInsertSchema(achievementUnlocks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLoginStreakSchema = createInsertSchema(loginStreaks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Zod schemas for gamification admin configuration tables
export const insertGamificationEconomyRuleSchema = createInsertSchema(gamificationEconomyRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertShopItemPricingSchema = createInsertSchema(shopItemPricing).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAdminChallengeConfigSchema = createInsertSchema(adminChallengeConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSeasonPassConfigSchema = createInsertSchema(seasonPassConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  startDate: z.union([z.date(), z.string()]).transform(val => typeof val === 'string' ? new Date(val) : val),
  endDate: z.union([z.date(), z.string()]).transform(val => typeof val === 'string' ? new Date(val) : val),
  advantages: z.union([z.string(), z.array(z.string())]).optional().transform(val => 
    Array.isArray(val) ? val.join('\n') : val
  ),
});

export const insertCoinAdjustmentSchema = createInsertSchema(coinAdjustments).omit({
  id: true,
  createdAt: true,
});

export const insertUserCosmeticLoadoutSchema = createInsertSchema(userCosmeticLoadouts).omit({
  updatedAt: true,
});

// Types for userCosmeticLoadouts
export type UserCosmeticLoadout = typeof userCosmeticLoadouts.$inferSelect;
export type InsertUserCosmeticLoadout = z.infer<typeof insertUserCosmeticLoadoutSchema>;

export const insertSeasonPassPurchaseSchema = createInsertSchema(seasonPassPurchases).omit({
  id: true,
  createdAt: true,
});

// Types for seasonPassPurchases
export type SeasonPassPurchase = typeof seasonPassPurchases.$inferSelect;
export type InsertSeasonPassPurchase = z.infer<typeof insertSeasonPassPurchaseSchema>;

// Gamification API Request Validation Schemas
export const purchasePowerUpSchema = z.object({
  powerUpId: z.string().min(1, "Power-up ID is required"),
});

export const activatePowerUpSchema = z.object({
  powerUpId: z.string().min(1, "Power-up ID is required"),
  gameId: z.string().optional(),
  duration: z.number().int().positive().optional(),
});

export const purchaseCosmeticSchema = z.object({
  cosmeticId: z.string().min(1, "Cosmetic ID is required"),
});

export const equipCosmeticSchema = z.object({
  cosmeticId: z.string().min(1, "Cosmetic ID is required"),
  slot: z.string().min(1, "Slot is required"),
});

export const unequipCosmeticSchema = z.object({
  slot: z.string().min(1, "Slot is required"),
});

export const claimChallengeRewardSchema = z.object({
  challengeId: z.string().min(1, "Challenge ID is required"),
});

export const purchaseSeasonPassSchema = z.object({
  seasonPassConfigId: z.string().min(1, "Season pass ID is required"),
});

// Zod schemas for question types
export const questionTypeEnum = z.enum(["multiple-choice", "true-false", "match", "fill-blank"]);

export const questionTypeDistributionSchema = z.object({
  multipleChoice: z.number().min(0).max(100).default(100),
  trueFalse: z.number().min(0).max(100).default(0),
  match: z.number().min(0).max(100).default(0),
  fillBlank: z.number().min(0).max(100).default(0),
}).refine(
  (data) => data.multipleChoice + data.trueFalse + data.match + data.fillBlank === 100,
  { message: "Question type distribution must sum to 100%" }
);

export const matchPairSchema = z.object({
  left: z.string(),
  right: z.string(),
});

export const generatedQuestionSchema = z.object({
  questionType: questionTypeEnum.default("multiple-choice"),
  question: z.string(),
  answers: z.array(z.string()).optional(), // For multiple-choice and true-false
  correctIndex: z.number().optional(), // For multiple-choice and true-false
  matchPairs: z.array(matchPairSchema).optional(), // For match questions
  correctAnswer: z.string().optional(), // For fill-blank questions
  selected: z.boolean().default(true),
});

// Gamification Types
export type CoinTransaction = typeof coinTransactions.$inferSelect;
export type InsertCoinTransaction = z.infer<typeof insertCoinTransactionSchema>;
export type ChallengeTemplate = typeof challengeTemplates.$inferSelect;
export type InsertChallengeTemplate = z.infer<typeof insertChallengeTemplateSchema>;
export type ChallengeProgress = typeof challengeProgress.$inferSelect;
export type InsertChallengeProgress = z.infer<typeof insertChallengeProgressSchema>;
export type PowerUpCatalog = typeof powerUpCatalog.$inferSelect;
export type InsertPowerUpCatalog = z.infer<typeof insertPowerUpCatalogSchema>;
export type PowerUpInventory = typeof powerUpInventory.$inferSelect;
export type InsertPowerUpInventory = z.infer<typeof insertPowerUpInventorySchema>;
export type ActivePowerUp = typeof activePowerUps.$inferSelect;
export type InsertActivePowerUp = z.infer<typeof insertActivePowerUpSchema>;
export type CosmeticCatalog = typeof cosmeticCatalog.$inferSelect;
export type InsertCosmeticCatalog = z.infer<typeof insertCosmeticCatalogSchema>;
export type CosmeticOwnership = typeof cosmeticOwnership.$inferSelect;
export type InsertCosmeticOwnership = z.infer<typeof insertCosmeticOwnershipSchema>;
export type EquippedCosmetic = typeof equippedCosmetics.$inferSelect;
export type InsertEquippedCosmetic = z.infer<typeof insertEquippedCosmeticSchema>;
export type SeasonPassTier = typeof seasonPassTiers.$inferSelect;
export type InsertSeasonPassTier = z.infer<typeof insertSeasonPassTierSchema>;
export type SeasonPassProgress = typeof seasonPassProgress.$inferSelect;
export type InsertSeasonPassProgress = z.infer<typeof insertSeasonPassProgressSchema>;
export type PlayerSeasonReward = typeof playerSeasonRewards.$inferSelect;
export type InsertPlayerSeasonReward = z.infer<typeof insertPlayerSeasonRewardSchema>;
export type AchievementCatalog = typeof achievementCatalog.$inferSelect;
export type InsertAchievementCatalog = z.infer<typeof insertAchievementCatalogSchema>;
export type AchievementUnlock = typeof achievementUnlocks.$inferSelect;
export type InsertAchievementUnlock = z.infer<typeof insertAchievementUnlockSchema>;
export type LoginStreak = typeof loginStreaks.$inferSelect;
export type InsertLoginStreak = z.infer<typeof insertLoginStreakSchema>;
export type GamificationEconomyRule = typeof gamificationEconomyRules.$inferSelect;
export type InsertGamificationEconomyRule = z.infer<typeof insertGamificationEconomyRuleSchema>;
export type ShopItemPricing = typeof shopItemPricing.$inferSelect;
export type InsertShopItemPricing = z.infer<typeof insertShopItemPricingSchema>;
export type AdminChallengeConfig = typeof adminChallengeConfig.$inferSelect;
export type InsertAdminChallengeConfig = z.infer<typeof insertAdminChallengeConfigSchema>;
export type SeasonPassConfig = typeof seasonPassConfig.$inferSelect;
export type InsertSeasonPassConfig = z.infer<typeof insertSeasonPassConfigSchema>;
export type CoinAdjustment = typeof coinAdjustments.$inferSelect;
export type InsertCoinAdjustment = z.infer<typeof insertCoinAdjustmentSchema>;

// Types
export type QuestionType = z.infer<typeof questionTypeEnum>;
export type QuestionTypeDistribution = z.infer<typeof questionTypeDistributionSchema>;
export type MatchPair = z.infer<typeof matchPairSchema>;
export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;
export type AiConfig = typeof aiConfig.$inferSelect;
export type InsertAiConfig = z.infer<typeof insertAiConfigSchema>;
export type QuizDraft = typeof quizDrafts.$inferSelect;
export type InsertQuizDraft = z.infer<typeof insertQuizDraftSchema>;
export type SalesInquiry = typeof salesInquiries.$inferSelect;
export type InsertSalesInquiry = z.infer<typeof insertSalesInquirySchema>;
export type QuizCardExplanation = typeof quizCardExplanations.$inferSelect;
export type InsertQuizCardExplanation = z.infer<typeof insertQuizCardExplanationSchema>;
export type TermDefinition = typeof termDefinitions.$inferSelect;
export type InsertTermDefinition = z.infer<typeof insertTermDefinitionSchema>;
export type ExplanationTerm = typeof explanationTerms.$inferSelect;
export type InsertExplanationTerm = z.infer<typeof insertExplanationTermSchema>;

// ========================================
// COURSE DRAFT FRAMEWORK GENERATOR
// ========================================

// Course draft extraction status enum
export const extractionStatusEnum = pgEnum("extractionStatus", [
  "pending",
  "processing",
  "completed",
  "failed"
]);

// Course draft wizard step enum
export const courseDraftStepEnum = pgEnum("courseDraftStep", [
  "upload",
  "select_content",
  "generate",
  "review",
  "complete"
]);

// Framework generation status enum (for background job queue)
export const frameworkGenerationStatusEnum = pgEnum("frameworkGenerationStatus", [
  "idle",
  "generating",
  "completed",
  "failed"
]);

// Course Draft Frameworks - Stores in-progress AI-assisted course creation
export const courseDraftFrameworks = pgTable("courseDraftFrameworks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  createdBy: varchar("createdBy").notNull().references(() => users.id),
  
  // User input
  courseDescription: text("courseDescription"),
  
  // Topic analysis state (persisted for navigation)
  analyzedTopics: jsonb("analyzedTopics"), // Array of topic strings from AI analysis
  selectedTopics: jsonb("selectedTopics"), // Array of selected topic strings
  customTopics: jsonb("customTopics"), // Array of {name: string, documentId?: string}
  suggestedTitle: varchar("suggestedTitle"), // AI-suggested course title from topic analysis
  
  // AI-generated framework
  generatedTitle: varchar("generatedTitle"),
  generatedDescription: text("generatedDescription"),
  generatedLessons: jsonb("generatedLessons"),
  recommendedLessons: jsonb("recommendedLessons"),
  courseSettings: jsonb("courseSettings"),
  
  // Framework generation job status (for background processing)
  generationStatus: frameworkGenerationStatusEnum("generationStatus").default("idle"),
  generationError: text("generationError"),
  generationStartedAt: timestamp("generationStartedAt"),
  generationCompletedAt: timestamp("generationCompletedAt"),
  generationMetadata: jsonb("generationMetadata"), // Stores target audience, lesson count, etc.
  
  // Wizard state
  currentStep: courseDraftStepEnum("currentStep").default("upload"),
  version: integer("version").notNull().default(1),
  
  // Lifecycle
  expiresAt: timestamp("expiresAt"),
  isPublished: boolean("isPublished").default(false),
  publishedCourseId: varchar("publishedCourseId").references(() => courses.id),
  
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_course_draft_frameworks_org").on(table.organizationId),
  index("IDX_course_draft_frameworks_creator").on(table.createdBy),
  index("IDX_course_draft_frameworks_expires").on(table.expiresAt),
  index("IDX_course_draft_frameworks_generation_status").on(table.generationStatus),
]);

// Course Draft Documents - Tracks uploaded files for draft frameworks
export const courseDraftDocuments = pgTable("courseDraftDocuments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  draftId: varchar("draftId").notNull().references(() => courseDraftFrameworks.id, { onDelete: "cascade" }),
  
  // File info
  fileName: varchar("fileName").notNull(),
  mimeType: varchar("mimeType").notNull(),
  fileSize: integer("fileSize").notNull(),
  storagePath: varchar("storagePath").notNull(),
  checksum: varchar("checksum"),
  
  // Extraction
  extractionStatus: extractionStatusEnum("extractionStatus").default("pending"),
  extractedContent: jsonb("extractedContent"),
  extractionError: text("extractionError"),
  
  // For lesson mapping
  lessonIndex: integer("lessonIndex"),
  
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_course_draft_documents_draft").on(table.draftId),
  index("IDX_course_draft_documents_status").on(table.extractionStatus),
]);

// Durable Course Source Documents - source packages preserved after draft finalization
export const courseSourceDocuments = pgTable("courseSourceDocuments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  createdBy: varchar("createdBy").notNull().references(() => users.id),
  draftId: varchar("draftId").references(() => courseDraftFrameworks.id, { onDelete: "set null" }),
  draftDocumentId: varchar("draftDocumentId").references(() => courseDraftDocuments.id, { onDelete: "set null" }),
  courseId: varchar("courseId").references(() => courses.id, { onDelete: "set null" }),
  fileName: varchar("fileName").notNull(),
  mimeType: varchar("mimeType").notNull(),
  fileSize: integer("fileSize").notNull(),
  originalStoragePath: varchar("originalStoragePath").notNull(),
  checksum: varchar("checksum"),
  pageCount: integer("pageCount"),
  slideCount: integer("slideCount"),
  extractionStatus: extractionStatusEnum("extractionStatus").default("pending"),
  extractionError: text("extractionError"),
  extractedTextHash: varchar("extractedTextHash"),
  licenseMetadata: jsonb("licenseMetadata"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_course_source_documents_org").on(table.organizationId),
  index("IDX_course_source_documents_draft").on(table.draftId),
  index("IDX_course_source_documents_draft_doc").on(table.draftDocumentId),
  index("IDX_course_source_documents_course").on(table.courseId),
]);

// Durable Course Source Assets - extracted figures, page snapshots, and slide visuals
export const courseSourceAssets = pgTable("courseSourceAssets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceDocumentId: varchar("sourceDocumentId").notNull().references(() => courseSourceDocuments.id, { onDelete: "cascade" }),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  assetType: varchar("assetType").notNull(),
  storageKey: varchar("storageKey").notNull(),
  mimeType: varchar("mimeType").notNull(),
  pageOrSlide: integer("pageOrSlide"),
  caption: text("caption"),
  altText: text("altText"),
  width: integer("width"),
  height: integer("height"),
  textBefore: text("textBefore"),
  textAfter: text("textAfter"),
  containsEmbeddedText: boolean("containsEmbeddedText").default(false),
  extractionMethod: varchar("extractionMethod").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_course_source_assets_document").on(table.sourceDocumentId),
  index("IDX_course_source_assets_org").on(table.organizationId),
  index("IDX_course_source_assets_page").on(table.sourceDocumentId, table.pageOrSlide),
]);

// Links selected source assets to draft lessons, finalized lessons, courses, and quiz cards
export const courseSourceAssetLinks = pgTable("courseSourceAssetLinks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  assetId: varchar("assetId").notNull().references(() => courseSourceAssets.id, { onDelete: "cascade" }),
  linkedEntityType: varchar("linkedEntityType").notNull(),
  linkedEntityId: varchar("linkedEntityId").notNull(),
  recommendedUse: varchar("recommendedUse").notNull().default("reference"),
  sourceSegmentIds: jsonb("sourceSegmentIds"),
  createdBy: varchar("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_course_source_asset_links_asset").on(table.assetId),
  index("IDX_course_source_asset_links_entity").on(table.linkedEntityType, table.linkedEntityId),
]);

// Course Draft Document Segments - Immutable extracted source segments for deterministic assignment
export const courseDraftDocumentSegments = pgTable("courseDraftDocumentSegments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  draftId: varchar("draftId").notNull().references(() => courseDraftFrameworks.id, { onDelete: "cascade" }),
  documentId: varchar("documentId").notNull().references(() => courseDraftDocuments.id, { onDelete: "cascade" }),
  segmentIndex: integer("segmentIndex").notNull(),
  segmentType: varchar("segmentType").notNull().default("paragraph"), // heading | paragraph | list | table | note | other
  text: text("text").notNull(),
  textHash: varchar("textHash").notNull(),
  startOffset: integer("startOffset").notNull().default(0),
  endOffset: integer("endOffset").notNull().default(0),
  headingPath: text("headingPath").array(),
  pageOrSlide: integer("pageOrSlide"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_course_draft_segments_draft").on(table.draftId),
  index("IDX_course_draft_segments_document").on(table.documentId),
  unique("UNQ_course_draft_segment_index").on(table.documentId, table.segmentIndex),
]);

// Course Draft Topic Assignments - One-topic-per-segment deterministic mapping
export const courseDraftTopicAssignments = pgTable("courseDraftTopicAssignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  draftId: varchar("draftId").notNull().references(() => courseDraftFrameworks.id, { onDelete: "cascade" }),
  topicId: varchar("topicId").notNull(), // Draft-scoped topic identifier
  segmentId: varchar("segmentId").notNull().references(() => courseDraftDocumentSegments.id, { onDelete: "cascade" }),
  assignmentMethod: varchar("assignmentMethod").notNull().default("rules"), // strict_heading | rules | manual | imported
  confidence: real("confidence"),
  isUserConfirmed: boolean("isUserConfirmed").default(false),
  createdBy: varchar("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_course_draft_topic_assignments_draft").on(table.draftId),
  index("IDX_course_draft_topic_assignments_topic").on(table.topicId),
  index("IDX_course_draft_topic_assignments_segment").on(table.segmentId),
  unique("UNQ_course_draft_assignment_segment").on(table.draftId, table.segmentId),
]);

// Course Draft Coverage Reports - Finalize gate snapshot
export const courseDraftCoverageReports = pgTable("courseDraftCoverageReports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  draftId: varchar("draftId").notNull().references(() => courseDraftFrameworks.id, { onDelete: "cascade" }),
  totalSegments: integer("totalSegments").notNull().default(0),
  assignedSegments: integer("assignedSegments").notNull().default(0),
  unassignedSegments: integer("unassignedSegments").notNull().default(0),
  overlapSegments: integer("overlapSegments").notNull().default(0),
  excludedSegments: integer("excludedSegments").notNull().default(0),
  status: varchar("status").notNull().default("fail"), // pass | fail
  details: jsonb("details"),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_course_draft_coverage_reports_draft").on(table.draftId),
  index("IDX_course_draft_coverage_reports_created").on(table.createdAt),
]);

// Course Draft Framework Relations
export const courseDraftFrameworksRelations = relations(courseDraftFrameworks, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [courseDraftFrameworks.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [courseDraftFrameworks.createdBy],
    references: [users.id],
  }),
  documents: many(courseDraftDocuments),
  segments: many(courseDraftDocumentSegments),
  topicAssignments: many(courseDraftTopicAssignments),
  coverageReports: many(courseDraftCoverageReports),
  publishedCourse: one(courses, {
    fields: [courseDraftFrameworks.publishedCourseId],
    references: [courses.id],
  }),
}));

export const courseDraftDocumentsRelations = relations(courseDraftDocuments, ({ one }) => ({
  draft: one(courseDraftFrameworks, {
    fields: [courseDraftDocuments.draftId],
    references: [courseDraftFrameworks.id],
  }),
}));

export const courseSourceDocumentsRelations = relations(courseSourceDocuments, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [courseSourceDocuments.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [courseSourceDocuments.createdBy],
    references: [users.id],
  }),
  draft: one(courseDraftFrameworks, {
    fields: [courseSourceDocuments.draftId],
    references: [courseDraftFrameworks.id],
  }),
  draftDocument: one(courseDraftDocuments, {
    fields: [courseSourceDocuments.draftDocumentId],
    references: [courseDraftDocuments.id],
  }),
  course: one(courses, {
    fields: [courseSourceDocuments.courseId],
    references: [courses.id],
  }),
  assets: many(courseSourceAssets),
}));

export const courseSourceAssetsRelations = relations(courseSourceAssets, ({ one, many }) => ({
  sourceDocument: one(courseSourceDocuments, {
    fields: [courseSourceAssets.sourceDocumentId],
    references: [courseSourceDocuments.id],
  }),
  organization: one(organizations, {
    fields: [courseSourceAssets.organizationId],
    references: [organizations.id],
  }),
  links: many(courseSourceAssetLinks),
}));

export const courseSourceAssetLinksRelations = relations(courseSourceAssetLinks, ({ one }) => ({
  asset: one(courseSourceAssets, {
    fields: [courseSourceAssetLinks.assetId],
    references: [courseSourceAssets.id],
  }),
  organization: one(organizations, {
    fields: [courseSourceAssetLinks.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [courseSourceAssetLinks.createdBy],
    references: [users.id],
  }),
}));

export const courseDraftDocumentSegmentsRelations = relations(courseDraftDocumentSegments, ({ one }) => ({
  draft: one(courseDraftFrameworks, {
    fields: [courseDraftDocumentSegments.draftId],
    references: [courseDraftFrameworks.id],
  }),
  document: one(courseDraftDocuments, {
    fields: [courseDraftDocumentSegments.documentId],
    references: [courseDraftDocuments.id],
  }),
}));

export const courseDraftTopicAssignmentsRelations = relations(courseDraftTopicAssignments, ({ one }) => ({
  draft: one(courseDraftFrameworks, {
    fields: [courseDraftTopicAssignments.draftId],
    references: [courseDraftFrameworks.id],
  }),
  segment: one(courseDraftDocumentSegments, {
    fields: [courseDraftTopicAssignments.segmentId],
    references: [courseDraftDocumentSegments.id],
  }),
}));

export const courseDraftCoverageReportsRelations = relations(courseDraftCoverageReports, ({ one }) => ({
  draft: one(courseDraftFrameworks, {
    fields: [courseDraftCoverageReports.draftId],
    references: [courseDraftFrameworks.id],
  }),
}));

// Course Draft Framework Insert Schemas
export const insertCourseDraftFrameworkSchema = createInsertSchema(courseDraftFrameworks).omit({
  id: true,
  version: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCourseDraftDocumentSchema = createInsertSchema(courseDraftDocuments).omit({
  id: true,
  extractionStatus: true,
  extractedContent: true,
  extractionError: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCourseDraftDocumentSegmentSchema = createInsertSchema(courseDraftDocumentSegments).omit({
  id: true,
  createdAt: true,
});

export const insertCourseDraftTopicAssignmentSchema = createInsertSchema(courseDraftTopicAssignments).omit({
  id: true,
  createdAt: true,
});

export const insertCourseDraftCoverageReportSchema = createInsertSchema(courseDraftCoverageReports).omit({
  id: true,
  createdAt: true,
});

// Course Draft Framework Types
export type CourseDraftFramework = typeof courseDraftFrameworks.$inferSelect;
export type InsertCourseDraftFramework = z.infer<typeof insertCourseDraftFrameworkSchema>;
export type CourseDraftDocument = typeof courseDraftDocuments.$inferSelect;
export type InsertCourseDraftDocument = z.infer<typeof insertCourseDraftDocumentSchema>;
export type CourseDraftDocumentSegment = typeof courseDraftDocumentSegments.$inferSelect;
export type InsertCourseDraftDocumentSegment = z.infer<typeof insertCourseDraftDocumentSegmentSchema>;
export type CourseDraftTopicAssignment = typeof courseDraftTopicAssignments.$inferSelect;
export type InsertCourseDraftTopicAssignment = z.infer<typeof insertCourseDraftTopicAssignmentSchema>;
export type CourseDraftCoverageReport = typeof courseDraftCoverageReports.$inferSelect;
export type InsertCourseDraftCoverageReport = z.infer<typeof insertCourseDraftCoverageReportSchema>;

// ========================================
// AI LESSON GENERATOR INSERT SCHEMAS & TYPES
// ========================================

// Zod schemas for lesson system tables
export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOrganizationSourceIntelligenceProviderSchema = createInsertSchema(organizationSourceIntelligenceProviders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  colorScheme: z.enum(["green", "blue", "purple", "orange"]).optional(),
  features: z.union([
    z.array(z.string()),
    z.string().transform(str => str.split(',').map(s => s.trim()).filter(Boolean))
  ]).optional(),
});

export const insertPlatformPricingSchema = createInsertSchema(platformPricing).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPlatformPaymentSettingsSchema = createInsertSchema(platformPaymentSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWebhookRegistrationSchema = createInsertSchema(webhookRegistrations).omit({
  id: true,
  registeredAt: true,
});

export const insertElearningSubscriptionPlanSchema = createInsertSchema(elearningSubscriptionPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  colorScheme: z.enum(["green", "blue", "purple", "orange"]).optional(),
  features: z.union([
    z.array(z.string()),
    z.string().transform(str => str.split(',').map(s => s.trim()).filter(Boolean))
  ]).optional(),
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSubscriptionInvoiceSchema = createInsertSchema(subscriptionInvoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSubscriptionEventSchema = createInsertSchema(subscriptionEvents).omit({
  id: true,
  createdAt: true,
});

export const insertEmailLogSchema = createInsertSchema(emailLogs).omit({
  id: true,
  createdAt: true,
});

// Payment Intent insert/select schemas
export const insertPaymentIntentSchema = createInsertSchema(paymentIntents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPaymentFulfillmentSchema = createInsertSchema(paymentFulfillments).omit({
  id: true,
  fulfilledAt: true,
});

export const insertPaymentWebhookEventSchema = createInsertSchema(paymentWebhookEvents).omit({
  id: true,
  createdAt: true,
});

export const insertCreditOrderSchema = createInsertSchema(creditOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPostFulfillmentJobSchema = createInsertSchema(postFulfillmentJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserCreditAllocationSchema = createInsertSchema(userCreditAllocations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCreditPurchasePackageSchema = createInsertSchema(creditPurchasePackages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCreditTransactionSchema = createInsertSchema(creditTransactions).omit({
  id: true,
  createdAt: true,
});

export const insertLpCreditLedgerSchema = createInsertSchema(lpCreditLedger).omit({
  id: true,
  createdAt: true,
});

export const insertQuizCreditPricingSchema = createInsertSchema(quizCreditPricing).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// License system insert schemas
export const insertUserLicenseSchema = createInsertSchema(userLicenses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLicensePaymentSchema = createInsertSchema(licensePayments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOrganizationLicenseSettingsSchema = createInsertSchema(organizationLicenseSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOrganizationLicenseSchema = createInsertSchema(organizationLicenses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// License Feature Flag Management schemas (Phase 5)
export const insertLicenseFlagOverrideSchema = createInsertSchema(licenseFlagOverrides).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLicenseFlagAuditSchema = createInsertSchema(licenseFlagAudit).omit({
  id: true,
  createdAt: true,
});

export const insertLicenseRolloutOrganizationSchema = createInsertSchema(licenseRolloutOrganizations).omit({
  id: true,
  createdAt: true,
});

export const insertLicenseRolloutBetaUserSchema = createInsertSchema(licenseRolloutBetaUsers).omit({
  id: true,
  createdAt: true,
});

// TypeScript types for license feature flag management
export type InsertLicenseFlagOverride = z.infer<typeof insertLicenseFlagOverrideSchema>;
export type LicenseFlagOverride = typeof licenseFlagOverrides.$inferSelect;
export type InsertLicenseFlagAudit = z.infer<typeof insertLicenseFlagAuditSchema>;
export type LicenseFlagAudit = typeof licenseFlagAudit.$inferSelect;
export type InsertLicenseRolloutOrganization = z.infer<typeof insertLicenseRolloutOrganizationSchema>;
export type LicenseRolloutOrganization = typeof licenseRolloutOrganizations.$inferSelect;
export type InsertLicenseRolloutBetaUser = z.infer<typeof insertLicenseRolloutBetaUserSchema>;
export type LicenseRolloutBetaUser = typeof licenseRolloutBetaUsers.$inferSelect;

export const insertLessonSchema = createInsertSchema(lessons).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
  viewCount: true,
  completionCount: true,
});

export const updateLessonMetadataSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title must be less than 200 characters"),
  description: z.string().optional().nullable(),
  gradeLevel: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  subject: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  isPublished: z.boolean().optional(),
});

export type UpdateLessonMetadata = z.infer<typeof updateLessonMetadataSchema>;

// Course lesson unlink/relink API validation schemas
export const unlinkLessonParamsSchema = z.object({
  courseId: z.string().uuid("Invalid course ID format"),
  lessonId: z.string().uuid("Invalid lesson ID format"),
});

export const relinkLessonParamsSchema = z.object({
  courseId: z.string().uuid("Invalid course ID format"),
  lessonId: z.string().uuid("Invalid lesson ID format"),
});

export const relinkLessonBodySchema = z.object({
  orderOverride: z.number().int("Order override must be an integer").positive("Order override must be positive").optional(),
});

export const relinkableLessonsParamsSchema = z.object({
  courseId: z.string().uuid("Invalid course ID format"),
});

export const insertLessonVersionSchema = createInsertSchema(lessonVersions).omit({
  id: true,
  createdAt: true,
});

export const insertGammaThemeSchema = createInsertSchema(gammaThemes).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertGammaImageStyleSchema = createInsertSchema(gammaImageStyles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCertificateSchema = createInsertSchema(certificates).omit({
  id: true,
  createdAt: true,
});

export const insertPendingGammaJobSchema = createInsertSchema(pendingGammaJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLessonAccessLogSchema = createInsertSchema(lessonAccessLogs).omit({
  id: true,
  createdAt: true,
});

// TASK 3a: Lesson slides insert/select schemas
export const insertLessonSlideSchema = createInsertSchema(lessonSlides).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLessonSlide = z.infer<typeof insertLessonSlideSchema>;
export type SelectLessonSlide = typeof lessonSlides.$inferSelect;

// Lesson presentation versions insert/select schemas
export const insertLessonPresentationVersionSchema = createInsertSchema(lessonPresentationVersions).omit({
  id: true,
  createdAt: true,
});

export type InsertLessonPresentationVersion = z.infer<typeof insertLessonPresentationVersionSchema>;
export type SelectLessonPresentationVersion = typeof lessonPresentationVersions.$inferSelect;

// PHASE 1.2: Lesson progress base schema
const baseLessonProgressSchema = createInsertSchema(lessonProgress).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  lessonId: z.string().uuid(),
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
  status: z.enum(lessonProgressStatusEnum.enumValues).default("not_started"),
  percentComplete: z.number().int().min(0).max(100).default(0),
  secondsSpent: z.number().int().min(0).default(0),
  lastCheckpoint: z.string().optional(),
  completedAt: z.date().optional(),
});

// Insert schema with cross-field validation
export const insertLessonProgressSchema = baseLessonProgressSchema.superRefine((data, ctx) => {
  // Enforce completion rules: status "completed" requires percentComplete=100 and completedAt
  if (data.status === "completed") {
    if (data.percentComplete !== 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "percentComplete must be 100 when status is 'completed'",
        path: ["percentComplete"],
      });
    }
    if (!data.completedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "completedAt is required when status is 'completed'",
        path: ["completedAt"],
      });
    }
  }
  // Prevent completedAt for non-completed statuses
  if (data.status !== "completed" && data.completedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "completedAt should only be set when status is 'completed'",
      path: ["completedAt"],
    });
  }
});

// Update schema for PATCH operations (all fields optional except identifiers)
export const updateLessonProgressSchema = baseLessonProgressSchema.pick({
  status: true,
  percentComplete: true,
  secondsSpent: true,
  lastCheckpoint: true,
  completedAt: true,
}).partial();

// PHASE 1.2: Daily streaks insert schema with date normalization
export const insertDailyStreaksSchema = createInsertSchema(dailyStreaks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
  currentStreak: z.number().int().min(0).default(0),
  bestStreak: z.number().int().min(0).default(0),
  // Coerce to date and normalize to midnight UTC to avoid timezone drift
  lastCompletedDate: z.coerce.date().transform((date) => {
    const normalized = new Date(date);
    normalized.setUTCHours(0, 0, 0, 0);
    return normalized.toISOString().split('T')[0]; // Return YYYY-MM-DD format
  }).optional(),
});

// PHASE 1.3: Lesson assignment insert schema
export const insertLessonAssignmentSchema = createInsertSchema(lessonAssignments).omit({
  id: true,
  createdAt: true,
  assignedAt: true,
}).extend({
  lessonId: z.string().uuid(),
  studentId: z.string().uuid(),
  organizationId: z.string().uuid(),
  assignedBy: z.string().uuid(),
  dueDate: z.date().optional(),
});

// PHASE 1.3: Lesson-quiz link insert schema
export const insertLessonQuizLinkSchema = createInsertSchema(lessonQuizLinks).omit({
  id: true,
  createdAt: true,
}).extend({
  lessonId: z.string().uuid(),
  quizId: z.string().uuid(),
  isPrimary: z.boolean().default(false),
});

// PHASE 1.3: Lesson scope assignment insert schema
export const insertLessonScopeAssignmentSchema = createInsertSchema(lessonScopeAssignments).omit({
  id: true,
  createdAt: true,
}).extend({
  lessonId: z.string().uuid(),
  organizationId: z.string().uuid(),
  unitId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  assignedBy: z.string().uuid(),
  dueDate: z.date().optional(),
});

// Lesson system types
export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;
export type OrganizationSourceIntelligenceProvider = typeof organizationSourceIntelligenceProviders.$inferSelect;
export type InsertOrganizationSourceIntelligenceProvider = z.infer<typeof insertOrganizationSourceIntelligenceProviderSchema>;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type PlatformPricing = typeof platformPricing.$inferSelect;
export type InsertPlatformPricing = z.infer<typeof insertPlatformPricingSchema>;

// Payment Orchestrator types
export type PaymentIntent = typeof paymentIntents.$inferSelect;
export type InsertPaymentIntent = z.infer<typeof insertPaymentIntentSchema>;
export type PaymentFulfillment = typeof paymentFulfillments.$inferSelect;
export type InsertPaymentFulfillment = z.infer<typeof insertPaymentFulfillmentSchema>;
export type PaymentWebhookEvent = typeof paymentWebhookEvents.$inferSelect;
export type InsertPaymentWebhookEvent = z.infer<typeof insertPaymentWebhookEventSchema>;
export type CreditOrder = typeof creditOrders.$inferSelect;
export type InsertCreditOrder = z.infer<typeof insertCreditOrderSchema>;

export type PostFulfillmentJob = typeof postFulfillmentJobs.$inferSelect;
export type InsertPostFulfillmentJob = z.infer<typeof insertPostFulfillmentJobSchema>;

export type UserCreditAllocation = typeof userCreditAllocations.$inferSelect;
export type InsertUserCreditAllocation = z.infer<typeof insertUserCreditAllocationSchema>;
export type CreditPurchasePackage = typeof creditPurchasePackages.$inferSelect;
export type InsertCreditPurchasePackage = z.infer<typeof insertCreditPurchasePackageSchema>;
export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type InsertCreditTransaction = z.infer<typeof insertCreditTransactionSchema>;
export type LpCreditLedger = typeof lpCreditLedger.$inferSelect;
export type InsertLpCreditLedger = z.infer<typeof insertLpCreditLedgerSchema>;
export type LpTransactionType = typeof lpTransactionTypeEnum.enumValues[number];
export type ThumbnailSource = typeof thumbnailSourceEnum.enumValues[number];

// Organization Credit Ledger schemas and types
export const insertOrgCreditLedgerSchema = createInsertSchema(orgCreditLedger).omit({
  id: true,
  createdAt: true,
});

export type OrgCreditLedger = typeof orgCreditLedger.$inferSelect;
export type InsertOrgCreditLedger = z.infer<typeof insertOrgCreditLedgerSchema>;
export type OrgCreditActivityType = typeof orgCreditActivityTypeEnum.enumValues[number];
export type CreditPurchaseTarget = typeof creditPurchaseTargetEnum.enumValues[number];
export type QuizCreditPricing = typeof quizCreditPricing.$inferSelect;
export type InsertQuizCreditPricing = z.infer<typeof insertQuizCreditPricingSchema>;
export type QuizQuestionTier = typeof quizQuestionTierEnum.enumValues[number];

// License System types
export type UserLicense = typeof userLicenses.$inferSelect;
export type InsertUserLicense = z.infer<typeof insertUserLicenseSchema>;
export type LicensePayment = typeof licensePayments.$inferSelect;
export type InsertLicensePayment = z.infer<typeof insertLicensePaymentSchema>;
export type OrganizationLicenseSettings = typeof organizationLicenseSettings.$inferSelect;
export type InsertOrganizationLicenseSettings = z.infer<typeof insertOrganizationLicenseSettingsSchema>;
export type OrganizationLicense = typeof organizationLicenses.$inferSelect;
export type InsertOrganizationLicense = z.infer<typeof insertOrganizationLicenseSchema>;

// Gamma Credit Ledger schemas and types
export const insertGammaCreditLedgerSchema = createInsertSchema(gammaCreditLedger).omit({
  id: true,
  createdAt: true,
});

export type GammaCreditLedger = typeof gammaCreditLedger.$inferSelect;
export type InsertGammaCreditLedger = z.infer<typeof insertGammaCreditLedgerSchema>;

// Gamma Credit Snapshots schemas and types
export const insertGammaCreditSnapshotSchema = createInsertSchema(gammaCreditSnapshots).omit({
  id: true,
  createdAt: true,
});

export type GammaCreditSnapshot = typeof gammaCreditSnapshots.$inferSelect;
export type InsertGammaCreditSnapshot = z.infer<typeof insertGammaCreditSnapshotSchema>;

// User Credit Adjustments schemas and types
export const insertUserCreditAdjustmentSchema = createInsertSchema(userCreditAdjustments).omit({
  id: true,
  createdAt: true,
});

export type UserCreditAdjustment = typeof userCreditAdjustments.$inferSelect;
export type InsertUserCreditAdjustment = z.infer<typeof insertUserCreditAdjustmentSchema>;
export type Lesson = typeof lessons.$inferSelect;
export type InsertLesson = z.infer<typeof insertLessonSchema>;
export type LessonVersion = typeof lessonVersions.$inferSelect;
export type InsertLessonVersion = z.infer<typeof insertLessonVersionSchema>;
export type GammaTheme = typeof gammaThemes.$inferSelect;
export type InsertGammaTheme = z.infer<typeof insertGammaThemeSchema>;
export type GammaImageStyle = typeof gammaImageStyles.$inferSelect;
export type InsertGammaImageStyle = z.infer<typeof insertGammaImageStyleSchema>;
export type Certificate = typeof certificates.$inferSelect;
export type InsertCertificate = z.infer<typeof insertCertificateSchema>;
export type PendingGammaJob = typeof pendingGammaJobs.$inferSelect;
export type InsertPendingGammaJob = z.infer<typeof insertPendingGammaJobSchema>;
export type LessonAccessLog = typeof lessonAccessLogs.$inferSelect;
export type InsertLessonAccessLog = z.infer<typeof insertLessonAccessLogSchema>;
export type LessonProgress = typeof lessonProgress.$inferSelect;
export type InsertLessonProgress = z.infer<typeof insertLessonProgressSchema>;
export type UpdateLessonProgress = z.infer<typeof updateLessonProgressSchema>;
export type LessonAssignment = typeof lessonAssignments.$inferSelect;
export type InsertLessonAssignment = z.infer<typeof insertLessonAssignmentSchema>;
export type LessonQuizLink = typeof lessonQuizLinks.$inferSelect;
export type InsertLessonQuizLink = z.infer<typeof insertLessonQuizLinkSchema>;
export type LessonScopeAssignment = typeof lessonScopeAssignments.$inferSelect;
export type InsertLessonScopeAssignment = z.infer<typeof insertLessonScopeAssignmentSchema>;
export type DailyStreaks = typeof dailyStreaks.$inferSelect;
export type InsertDailyStreaks = z.infer<typeof insertDailyStreaksSchema>;

// ==================== E-LEARNING SCHEMAS & TYPES ====================

// Course Categories
export const insertCourseCategorySchema = createInsertSchema(courseCategories).omit({
  id: true,
  createdAt: true,
});

export type CourseCategory = typeof courseCategories.$inferSelect;
export type InsertCourseCategory = z.infer<typeof insertCourseCategorySchema>;

// Courses
export const insertCourseSchema = createInsertSchema(courses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  price: z.string().or(z.number()).transform(val => typeof val === 'number' ? val.toString() : val),
});

export type Course = typeof courses.$inferSelect;
export type InsertCourse = z.infer<typeof insertCourseSchema>;

// Course Drafts
export const insertCourseDraftSchema = createInsertSchema(courseDrafts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCourseDraft = z.infer<typeof insertCourseDraftSchema>;
export type CourseDraft = typeof courseDrafts.$inferSelect;

// Bloom's Taxonomy levels for learning objectives
export const bloomsLevelSchema = z.enum(['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']);
export type BloomsLevel = z.infer<typeof bloomsLevelSchema>;

// Learning objective with Bloom's Taxonomy level
export const learningObjectiveSchema = z.object({
  id: z.string().uuid(),
  bloomLevel: bloomsLevelSchema,
  objective: z.string(), // e.g., "Explain the core principles of the FIC Act"
  assessmentIdea: z.string().optional(), // How to assess this objective
});
export type LearningObjective = z.infer<typeof learningObjectiveSchema>;

// Course Frameworks - Enhanced topic structure for AI-powered course building
export const courseTopicSchema = z.object({
  id: z.string().uuid(),
  order: z.number().int(),
  name: z.string(),
  description: z.string().optional(), // Brief AI-generated or user-edited topic description
  detailedSummary: z.string().optional(), // Rich narrative summary of what this topic covers
  isOverview: z.boolean().optional().default(false), // First topic is always the overview
  userEditedName: z.boolean().optional().default(false), // Track if user manually edited the name
  userEditedDescription: z.boolean().optional().default(false), // Track if user manually edited description
  lessonId: z.string().uuid().nullable(),
  // Enhanced fields for contextual lesson generation
  learningObjectives: z.array(learningObjectiveSchema).optional(), // Bloom's Taxonomy-aligned objectives
  prerequisiteTopicIds: z.array(z.string().uuid()).optional(), // Topics that should be completed first
  keyTerms: z.array(z.string()).optional(), // Important terminology introduced in this topic
  assessmentIdeas: z.array(z.string()).optional(), // Suggested formative assessment approaches
  estimatedDurationMinutes: z.number().int().optional(), // Suggested lesson duration
  // Source document content for lesson generation
  sourceContent: z.string().optional(), // Full text excerpt from source document for this topic
  sourceDocumentId: z.string().optional(), // Reference to the originating draft document
  sourceSummary: z.string().optional(), // AI-generated summary of the source content
});

export type CourseTopic = z.infer<typeof courseTopicSchema>;

export const insertCourseFrameworkSchema = createInsertSchema(courseFrameworks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  topics: z.array(courseTopicSchema),
});

export type CourseFramework = typeof courseFrameworks.$inferSelect;
export type InsertCourseFramework = z.infer<typeof insertCourseFrameworkSchema>;

// Course Lessons
export const insertCourseLessonSchema = createInsertSchema(courseLessons).omit({
  id: true,
  createdAt: true,
});

export type CourseLesson = typeof courseLessons.$inferSelect;
export type InsertCourseLesson = z.infer<typeof insertCourseLessonSchema>;

// Course Tags
export const insertCourseTagSchema = createInsertSchema(courseTags).omit({
  id: true,
  createdAt: true,
});

export type CourseTag = typeof courseTags.$inferSelect;
export type InsertCourseTag = z.infer<typeof insertCourseTagSchema>;

// Course Assignments
export const insertCourseAssignmentSchema = createInsertSchema(courseAssignments).omit({
  id: true,
  createdAt: true,
  assignedAt: true,
}).extend({
  courseId: z.string().uuid(),
  organizationId: z.string().uuid(),
  assignedBy: z.string().uuid(),
  assignmentScope: z.enum(courseAssignmentScopeEnum.enumValues).default("user"),
  userId: z.string().uuid().optional().nullable(),
  unitId: z.string().uuid().optional().nullable(),
  subjectId: z.string().uuid().optional().nullable(),
  subUnitId: z.string().uuid().optional().nullable(),
  teamId: z.string().uuid().optional().nullable(),
  targetOrganizationId: z.string().uuid().optional().nullable(),
  audience: z.enum(courseAssignmentAudienceEnum.enumValues).default("learner"),
  mandatory: z.boolean().default(false),
  dueDate: z.preprocess(
    (val) => (typeof val === 'string' ? new Date(val) : val),
    z.date().optional().nullable()
  ),
});

export type CourseAssignment = typeof courseAssignments.$inferSelect;
export type InsertCourseAssignment = z.infer<typeof insertCourseAssignmentSchema>;

// Inter-Org Course Assignment Rules
export const insertInterOrgCourseAssignmentRuleSchema = createInsertSchema(interOrgCourseAssignmentRules).omit({
  id: true,
  createdAt: true,
}).extend({
  sourceOrganizationId: z.string().uuid(),
  targetOrganizationId: z.string().uuid(),
  enabled: z.boolean().default(true),
  createdBy: z.string().uuid(),
});

export type InterOrgCourseAssignmentRule = typeof interOrgCourseAssignmentRules.$inferSelect;
export type InsertInterOrgCourseAssignmentRule = z.infer<typeof insertInterOrgCourseAssignmentRuleSchema>;

// Course Progress
export const insertCourseProgressSchema = createInsertSchema(courseProgress).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  courseId: z.string().uuid(),
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
  status: z.enum(courseProgressStatusEnum.enumValues).default("not_started"),
  completedLessons: z.number().int().min(0).default(0),
  totalLessons: z.number().int().min(0).default(0),
  percentComplete: z.number().int().min(0).max(100).default(0),
});

export const updateCourseProgressSchema = insertCourseProgressSchema.partial().extend({
  courseId: z.string().uuid(),
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
});

export type CourseProgress = typeof courseProgress.$inferSelect;
export type InsertCourseProgress = z.infer<typeof insertCourseProgressSchema>;
export type UpdateCourseProgress = z.infer<typeof updateCourseProgressSchema>;

// Course Versions
export const insertCourseVersionSchema = createInsertSchema(courseVersions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
});

export type CourseVersion = typeof courseVersions.$inferSelect;
export type InsertCourseVersion = z.infer<typeof insertCourseVersionSchema>;

// Course Purchases
export const insertCoursePurchaseSchema = createInsertSchema(coursePurchases).omit({
  id: true,
  purchasedAt: true,
});

export type CoursePurchase = typeof coursePurchases.$inferSelect;
export type InsertCoursePurchase = z.infer<typeof insertCoursePurchaseSchema>;

// Course Refunds
export const insertCourseRefundSchema = createInsertSchema(courseRefunds).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  requestedAt: true,
  decidedAt: true,
  paidOutAt: true,
});

export type CourseRefund = typeof courseRefunds.$inferSelect;
export type InsertCourseRefund = z.infer<typeof insertCourseRefundSchema>;

// Course Version Upgrades
export const insertCourseVersionUpgradeSchema = createInsertSchema(courseVersionUpgrades).omit({
  id: true,
  purchasedAt: true,
});

export type CourseVersionUpgrade = typeof courseVersionUpgrades.$inferSelect;
export type InsertCourseVersionUpgrade = z.infer<typeof insertCourseVersionUpgradeSchema>;

// User Course Enrollments
export const insertUserCourseEnrollmentSchema = createInsertSchema(userCourseEnrollments).omit({
  id: true,
  enrolledAt: true,
});

export type UserCourseEnrollment = typeof userCourseEnrollments.$inferSelect;
export type InsertUserCourseEnrollment = z.infer<typeof insertUserCourseEnrollmentSchema>;

// User Course Lesson Progress
export const insertUserCourseLessonProgressSchema = createInsertSchema(userCourseLessonProgress).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});

export type UserCourseLessonProgress = typeof userCourseLessonProgress.$inferSelect;
export type InsertUserCourseLessonProgress = z.infer<typeof insertUserCourseLessonProgressSchema>;

// Course Payouts
export const insertCoursePayoutSchema = createInsertSchema(coursePayouts).omit({
  id: true,
  createdAt: true,
  paidAt: true,
});

export type CoursePayout = typeof coursePayouts.$inferSelect;
export type InsertCoursePayout = z.infer<typeof insertCoursePayoutSchema>;

// Course Payout Line Items
export const insertCoursePayoutLineItemSchema = createInsertSchema(coursePayoutLineItems).omit({
  id: true,
  createdAt: true,
});

export type CoursePayoutLineItem = typeof coursePayoutLineItems.$inferSelect;
export type InsertCoursePayoutLineItem = z.infer<typeof insertCoursePayoutLineItemSchema>;

// Course Reviews
export const insertCourseReviewSchema = createInsertSchema(courseReviews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  rating: z.number().min(0.5).max(5.0).multipleOf(0.5), // Half-star increments only
  comment: z.string().optional().refine((val) => {
    // Comment required if rating < 4.5
    return true; // Validation will be done in backend with rating context
  }),
});

export type CourseReview = typeof courseReviews.$inferSelect;
export type InsertCourseReview = z.infer<typeof insertCourseReviewSchema>;

// Course Price History
export const insertCoursePriceHistorySchema = createInsertSchema(coursePriceHistory).omit({
  id: true,
  changedAt: true,
});

export type CoursePriceHistory = typeof coursePriceHistory.$inferSelect;
export type InsertCoursePriceHistory = z.infer<typeof insertCoursePriceHistorySchema>;

// Payout Disbursements
export const insertPayoutDisbursementSchema = createInsertSchema(payoutDisbursements).omit({
  id: true,
  createdAt: true,
  paidAt: true,
}).extend({
  exchangeRateSnapshot: z.object({
    usdToZar: z.number().or(z.string()),
    usdToEur: z.number().or(z.string()),
    eurToZar: z.number().or(z.string()),
    rateDate: z.string(),
    rateSource: z.enum(["auto", "manual"]),
    rateProvider: z.string(),
  }),
});

export type PayoutDisbursement = typeof payoutDisbursements.$inferSelect;
export type InsertPayoutDisbursement = z.infer<typeof insertPayoutDisbursementSchema>;

// Organization Banking Details
export const insertOrganizationBankingDetailsSchema = createInsertSchema(organizationBankingDetails).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type OrganizationBankingDetails = typeof organizationBankingDetails.$inferSelect;
export type InsertOrganizationBankingDetails = z.infer<typeof insertOrganizationBankingDetailsSchema>;

// Currency Conversion Rates
export const insertCurrencyConversionRateSchema = createInsertSchema(currencyConversionRates).omit({
  id: true,
  lastUpdated: true,
});

export type CurrencyConversionRate = typeof currencyConversionRates.$inferSelect;
export type InsertCurrencyConversionRate = z.infer<typeof insertCurrencyConversionRateSchema>;

// Financial Audit Log
export const insertFinancialAuditLogSchema = createInsertSchema(financialAuditLog).omit({
  id: true,
  timestamp: true,
}).extend({
  beforeState: z.record(z.any()).optional(),
  afterState: z.record(z.any()).optional(),
});

export type FinancialAuditLog = typeof financialAuditLog.$inferSelect;
export type InsertFinancialAuditLog = z.infer<typeof insertFinancialAuditLogSchema>;

// Payment Transactions
export const insertPaymentTransactionSchema = createInsertSchema(paymentTransactions).omit({
  id: true,
  createdAt: true,
  completedAt: true,
}).extend({
  metadata: z.record(z.any()).optional(),
});

export type PaymentTransaction = typeof paymentTransactions.$inferSelect;
export type InsertPaymentTransaction = z.infer<typeof insertPaymentTransactionSchema>;

// ==================== ADDITIONAL E-LEARNING TABLES ====================

// In-app user notifications
export const userNotifications = pgTable("userNotifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  type: notificationTypeEnum("type").notNull(),
  title: varchar("title").notNull(),
  message: text("message").notNull(),
  metadata: jsonb("metadata"), // Additional context (courseId, versionId, etc.)
  isRead: boolean("isRead").default(false),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_user_notifications_user").on(table.userId),
  index("IDX_user_notifications_read").on(table.isRead),
  index("IDX_user_notifications_created").on(table.createdAt),
]);

// User notification preferences
export const notificationPreferences = pgTable("notificationPreferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  emailNotifications: boolean("emailNotifications").default(true),
  inAppNotifications: boolean("inAppNotifications").default(true),
  coursePurchaseNotifications: boolean("coursePurchaseNotifications").default(true),
  courseVersionNotifications: boolean("courseVersionNotifications").default(true),
  payoutNotifications: boolean("payoutNotifications").default(true),
  reviewNotifications: boolean("reviewNotifications").default(true),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  unique("UNQ_notification_preferences_user").on(table.userId),
]);

// Review moderation action audit trail
export const reviewModerationActions = pgTable("reviewModerationActions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reviewId: varchar("reviewId").notNull().references(() => courseReviews.id),
  moderatorId: varchar("moderatorId").notNull().references(() => users.id),
  action: reviewModerationActionEnum("action").notNull(),
  reason: text("reason"),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_review_moderation_review").on(table.reviewId),
  index("IDX_review_moderation_moderator").on(table.moderatorId),
  index("IDX_review_moderation_created").on(table.createdAt),
]);

// Bulk quiz generation job tracking
export const bulkQuizGenerationJobs = pgTable("bulkQuizGenerationJobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("courseId").notNull().references(() => courses.id),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  createdBy: varchar("createdBy").notNull().references(() => users.id),
  status: bulkJobStatusEnum("status").default("pending"),
  totalLessons: integer("totalLessons").notNull(),
  completedLessons: integer("completedLessons").default(0),
  failedLessons: integer("failedLessons").default(0),
  jobResults: jsonb("jobResults"), // Array of { lessonId, quizId, status, error }
  createdAt: timestamp("createdAt").defaultNow(),
  completedAt: timestamp("completedAt"),
},
(table) => [
  index("IDX_bulk_quiz_jobs_course").on(table.courseId),
  index("IDX_bulk_quiz_jobs_org").on(table.organizationId),
  index("IDX_bulk_quiz_jobs_status").on(table.status),
]);

// Historical exchange rate snapshots
export const exchangeRateHistory = pgTable("exchangeRateHistory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  baseCurrency: currencyCodeEnum("baseCurrency").notNull(),
  targetCurrency: currencyCodeEnum("targetCurrency").notNull(),
  rate: decimal("rate", { precision: 19, scale: 8 }).notNull(),
  source: rateSourceEnum("source").notNull(),
  provider: varchar("provider"), // "ExchangeRate-API", "Fawazahmed0", etc.
  recordedAt: timestamp("recordedAt").defaultNow(),
},
(table) => [
  index("IDX_exchange_rate_history_currencies").on(table.baseCurrency, table.targetCurrency),
  index("IDX_exchange_rate_history_recorded").on(table.recordedAt),
]);

// Platform-wide configuration settings
export const platformConfiguration = pgTable("platformConfiguration", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key").notNull().unique(),
  value: text("value").notNull(),
  dataType: varchar("dataType").notNull(), // "string", "number", "boolean", "json"
  description: text("description"),
  isEditable: boolean("isEditable").default(true),
  lastModifiedBy: varchar("lastModifiedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  uniqueIndex("IDX_platform_config_key").on(table.key),
]);

// Centralized system settings change audit trail
export const systemChangeEvents = pgTable("systemChangeEvents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  domain: varchar("domain").notNull(), // integration, platform, payment, licensing, etc.
  action: varchar("action").notNull(), // create, update, delete, rotate, test
  key: varchar("key").notNull(), // mutated setting key or logical key
  provider: varchar("provider"), // integration provider name if applicable
  isSecret: boolean("isSecret").default(false),
  beforeValue: text("beforeValue"),
  afterValue: text("afterValue"),
  actorUserId: varchar("actorUserId").references(() => users.id),
  actorRole: varchar("actorRole"),
  organizationId: varchar("organizationId").references(() => organizations.id),
  ipAddress: varchar("ipAddress"),
  userAgent: text("userAgent"),
  correlationId: varchar("correlationId"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_system_change_events_domain_created").on(table.domain, table.createdAt),
  index("IDX_system_change_events_provider_created").on(table.provider, table.createdAt),
  index("IDX_system_change_events_actor_created").on(table.actorUserId, table.createdAt),
  index("IDX_system_change_events_key_created").on(table.key, table.createdAt),
]);

// Track which users have been notified about course version updates
export const courseVersionNotifications = pgTable("courseVersionNotifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  courseId: varchar("courseId").notNull().references(() => courses.id),
  oldVersionId: varchar("oldVersionId").notNull().references(() => courseVersions.id),
  newVersionId: varchar("newVersionId").notNull().references(() => courseVersions.id),
  notifiedAt: timestamp("notifiedAt").defaultNow(),
  wasViewed: boolean("wasViewed").default(false),
  viewedAt: timestamp("viewedAt"),
},
(table) => [
  index("IDX_course_version_notifications_user").on(table.userId),
  index("IDX_course_version_notifications_course").on(table.courseId),
  unique("UNQ_user_course_version_notification").on(table.userId, table.courseId, table.newVersionId),
]);

// ==================== END ADDITIONAL E-LEARNING TABLES ====================

// ==================== WEBHOOK REPLAY PROTECTION ====================

// Webhook event tracking for replay protection
export const webhookEvents = pgTable("webhookEvents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  source: webhookSourceEnum("source").notNull(), // yoco, mailersend
  eventId: varchar("eventId").notNull(), // Unique event ID from webhook payload
  signature: varchar("signature").notNull(), // Webhook signature for audit trail
  receivedAt: timestamp("receivedAt").defaultNow(),
  expiresAt: timestamp("expiresAt").notNull(), // TTL for cleanup (7 days typical)
  processed: boolean("processed").default(true), // Track if successfully processed
},
(table) => [
  uniqueIndex("IDX_webhook_events_source_eventId").on(table.source, table.eventId),
  index("IDX_webhook_events_expiresAt").on(table.expiresAt), // For cleanup job
  index("IDX_webhook_events_received").on(table.receivedAt),
]);

// Normalized integration runtime events/logs
export const integrationEvents = pgTable("integrationEvents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: varchar("provider").notNull(), // smtp, mailersend, gemini, gamma, elevenlabs, yoco
  operation: varchar("operation").notNull(), // send_email, list_voices, tts_generate, webhook_verify, etc.
  status: varchar("status").notNull(), // success, failure, degraded
  severity: varchar("severity").notNull().default("info"), // info, warn, error
  message: text("message"),
  requestSummary: jsonb("requestSummary"),
  responseSummary: jsonb("responseSummary"),
  errorCode: varchar("errorCode"),
  durationMs: integer("durationMs"),
  actorUserId: varchar("actorUserId").references(() => users.id),
  organizationId: varchar("organizationId").references(() => organizations.id),
  correlationId: varchar("correlationId"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_integration_events_provider_created").on(table.provider, table.createdAt),
  index("IDX_integration_events_status_created").on(table.status, table.createdAt),
  index("IDX_integration_events_org_created").on(table.organizationId, table.createdAt),
  index("IDX_integration_events_actor_created").on(table.actorUserId, table.createdAt),
]);

export const insertWebhookEventSchema = createInsertSchema(webhookEvents).omit({
  id: true,
  receivedAt: true,
});

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type InsertWebhookEvent = z.infer<typeof insertWebhookEventSchema>;

export const insertSystemChangeEventSchema = createInsertSchema(systemChangeEvents).omit({
  id: true,
  createdAt: true,
});
export type SystemChangeEvent = typeof systemChangeEvents.$inferSelect;
export type InsertSystemChangeEvent = z.infer<typeof insertSystemChangeEventSchema>;

export const insertIntegrationEventSchema = createInsertSchema(integrationEvents).omit({
  id: true,
  createdAt: true,
});
export type IntegrationEvent = typeof integrationEvents.$inferSelect;
export type InsertIntegrationEvent = z.infer<typeof insertIntegrationEventSchema>;

// User Notifications
export const insertUserNotificationSchema = createInsertSchema(userNotifications).omit({
  id: true,
  createdAt: true,
  readAt: true,
}).extend({
  metadata: z.record(z.any()).optional(),
});

export type UserNotification = typeof userNotifications.$inferSelect;
export type InsertUserNotification = z.infer<typeof insertUserNotificationSchema>;

// Notification Preferences
export const insertNotificationPreferencesSchema = createInsertSchema(notificationPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreferences = z.infer<typeof insertNotificationPreferencesSchema>;

// Review Moderation Actions
export const insertReviewModerationActionSchema = createInsertSchema(reviewModerationActions).omit({
  id: true,
  createdAt: true,
});

export type ReviewModerationAction = typeof reviewModerationActions.$inferSelect;
export type InsertReviewModerationAction = z.infer<typeof insertReviewModerationActionSchema>;

// Bulk Quiz Generation Jobs
export const insertBulkQuizGenerationJobSchema = createInsertSchema(bulkQuizGenerationJobs).omit({
  id: true,
  createdAt: true,
  completedAt: true,
}).extend({
  jobResults: z.array(z.record(z.any())).optional(),
});

export type BulkQuizGenerationJob = typeof bulkQuizGenerationJobs.$inferSelect;
export type InsertBulkQuizGenerationJob = z.infer<typeof insertBulkQuizGenerationJobSchema>;

// Exchange Rate History
export const insertExchangeRateHistorySchema = createInsertSchema(exchangeRateHistory).omit({
  id: true,
  recordedAt: true,
});

export type ExchangeRateHistory = typeof exchangeRateHistory.$inferSelect;
export type InsertExchangeRateHistory = z.infer<typeof insertExchangeRateHistorySchema>;

// Platform Configuration
export const insertPlatformConfigurationSchema = createInsertSchema(platformConfiguration).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PlatformConfiguration = typeof platformConfiguration.$inferSelect;
export type InsertPlatformConfiguration = z.infer<typeof insertPlatformConfigurationSchema>;

// Course Version Notifications
export const insertCourseVersionNotificationSchema = createInsertSchema(courseVersionNotifications).omit({
  id: true,
  notifiedAt: true,
  viewedAt: true,
});

export type CourseVersionNotification = typeof courseVersionNotifications.$inferSelect;
export type InsertCourseVersionNotification = z.infer<typeof insertCourseVersionNotificationSchema>;

// ==================== PLATFORM REVENUE REPORTS TABLES ====================

// Cost category types (dynamic lookup table replaces static enum)
export const platformCostCategoryTypes = pgTable("platformCostCategoryTypes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull().unique(),
  label: varchar("label").notNull(),
  description: text("description"),
  isActive: boolean("isActive").default(true),
  displayOrder: integer("displayOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  uniqueIndex("UNQ_platform_cost_category_types_name_ci")
    .on(sql`LOWER(TRIM(${table.name}))`),
]);

// Cost category definitions
export const platformCostCategories = pgTable("platformCostCategories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  type: varchar("type").notNull(),
  description: text("description"),
  isActive: boolean("isActive").default(true),
  displayOrder: integer("displayOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  uniqueIndex("UNQ_platform_cost_categories_name_type_ci")
    .on(sql`LOWER(TRIM(${table.name}))`, sql`LOWER(TRIM(${table.type}))`),
]);

// Raw revenue events
export const platformRevenueSources = pgTable("platformRevenueSources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceType: revenueSourceTypeEnum("sourceType").notNull(),
  sourceId: varchar("sourceId"),
  organizationId: varchar("organizationId").references(() => organizations.id),
  userId: varchar("userId").references(() => users.id),
  grossAmount: decimal("grossAmount", { precision: 18, scale: 4 }).notNull(),
  netAmount: decimal("netAmount", { precision: 18, scale: 4 }).notNull(),
  platformCommission: decimal("platformCommission", { precision: 18, scale: 4 }).default("0"),
  processingFee: decimal("processingFee", { precision: 18, scale: 4 }).default("0"),
  currency: currencyCodeEnum("currency").notNull(),
  exchangeRateUsed: decimal("exchangeRateUsed", { precision: 12, scale: 8 }),
  normalizedAmountZAR: decimal("normalizedAmountZAR", { precision: 18, scale: 4 }).notNull(),
  metadata: jsonb("metadata"),
  recordedAt: timestamp("recordedAt").defaultNow(),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_platform_revenue_sources_recorded_type").on(table.recordedAt, table.sourceType),
  index("IDX_platform_revenue_sources_org").on(table.organizationId),
  index("IDX_platform_revenue_sources_amount").on(table.normalizedAmountZAR),
  // Prevent duplicate ingestion for external source events when sourceId is present.
  uniqueIndex("UNQ_platform_revenue_sources_type_sourceid")
    .on(table.sourceType, table.sourceId)
    .where(sql`${table.sourceId} IS NOT NULL`),
]);

// Cost records (manual and automated)
export const platformCostEntries = pgTable("platformCostEntries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  categoryId: varchar("categoryId").references(() => platformCostCategories.id),
  organizationId: varchar("organizationId").references(() => organizations.id),
  description: varchar("description").notNull(),
  amount: decimal("amount", { precision: 18, scale: 4 }).notNull(),
  currency: currencyCodeEnum("currency").notNull(),
  exchangeRateUsed: decimal("exchangeRateUsed", { precision: 12, scale: 8 }),
  normalizedAmountZAR: decimal("normalizedAmountZAR", { precision: 18, scale: 4 }).notNull(),
  recurrence: costRecurrenceEnum("recurrence").default("one_time"),
  effectiveDate: date("effectiveDate").notNull(),
  endDate: date("endDate"),
  isAutomated: boolean("isAutomated").default(false),
  sourceReference: varchar("sourceReference"),
  metadata: jsonb("metadata"),
  createdBy: varchar("createdBy").references(() => users.id),
  updatedBy: varchar("updatedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
},
(table) => [
  index("IDX_platform_cost_entries_effective_date").on(table.effectiveDate),
  index("IDX_platform_cost_entries_category").on(table.categoryId),
  index("IDX_platform_cost_entries_org").on(table.organizationId),
  // Automated cost jobs must be idempotent per source reference and effective date.
  uniqueIndex("UNQ_platform_cost_entries_automated_source")
    .on(table.categoryId, table.organizationId, table.sourceReference, table.effectiveDate)
    .where(sql`${table.isAutomated} = true AND ${table.sourceReference} IS NOT NULL`),
]);

// Split costs across orgs
export const platformCostAllocations = pgTable("platformCostAllocations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  costEntryId: varchar("costEntryId").notNull().references(() => platformCostEntries.id, { onDelete: "cascade" }),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  allocationPercentage: decimal("allocationPercentage", { precision: 5, scale: 2 }).notNull(),
  allocatedAmountZAR: decimal("allocatedAmountZAR", { precision: 18, scale: 4 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  unique("UNQ_platform_cost_allocation_entry_org").on(table.costEntryId, table.organizationId),
]);

// Aggregated period summaries
export const platformFinancialSnapshots = pgTable("platformFinancialSnapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  periodStart: date("periodStart").notNull(),
  periodEnd: date("periodEnd").notNull(),
  periodType: varchar("periodType").notNull(),
  organizationId: varchar("organizationId").references(() => organizations.id),
  grossRevenueZAR: decimal("grossRevenueZAR", { precision: 18, scale: 4 }).default("0"),
  netRevenueZAR: decimal("netRevenueZAR", { precision: 18, scale: 4 }).default("0"),
  totalCostsZAR: decimal("totalCostsZAR", { precision: 18, scale: 4 }).default("0"),
  netProfitZAR: decimal("netProfitZAR", { precision: 18, scale: 4 }).default("0"),
  profitMarginPercent: decimal("profitMarginPercent", { precision: 5, scale: 2 }),
  courseRevenue: decimal("courseRevenue", { precision: 18, scale: 4 }).default("0"),
  creditRevenue: decimal("creditRevenue", { precision: 18, scale: 4 }).default("0"),
  licenseRevenue: decimal("licenseRevenue", { precision: 18, scale: 4 }).default("0"),
  subscriptionRevenue: decimal("subscriptionRevenue", { precision: 18, scale: 4 }).default("0"),
  chargebackAmount: decimal("chargebackAmount", { precision: 18, scale: 4 }).default("0"),
  refundAmount: decimal("refundAmount", { precision: 18, scale: 4 }).default("0"),
  transactionCount: integer("transactionCount").default(0),
  metadata: jsonb("metadata"),
  generatedAt: timestamp("generatedAt").defaultNow(),
},
(table) => [
  uniqueIndex("UNQ_platform_financial_snapshot_period_null_org")
    .on(table.periodStart, table.periodEnd, table.periodType)
    .where(sql`${table.organizationId} IS NULL`),
  uniqueIndex("UNQ_platform_financial_snapshot_period_org")
    .on(table.periodStart, table.periodEnd, table.periodType, table.organizationId)
    .where(sql`${table.organizationId} IS NOT NULL`),
  index("IDX_platform_financial_snapshots_period").on(table.periodStart, table.periodType),
  index("IDX_platform_financial_snapshots_org").on(table.organizationId),
]);

// Immutable audit trail
export const platformFinancialAuditLog = pgTable("platformFinancialAuditLog", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tableName: varchar("tableName").notNull(),
  recordId: varchar("recordId").notNull(),
  action: varchar("action").notNull(),
  beforeData: jsonb("beforeData"),
  afterData: jsonb("afterData"),
  changedBy: varchar("changedBy").references(() => users.id),
  changedAt: timestamp("changedAt").defaultNow(),
  ipAddress: varchar("ipAddress"),
  userAgent: text("userAgent"),
},
(table) => [
  index("IDX_platform_financial_audit_table_record").on(table.tableName, table.recordId),
  index("IDX_platform_financial_audit_changed_at").on(table.changedAt),
  index("IDX_platform_financial_audit_changed_by").on(table.changedBy),
]);

// Scheduled/on-demand report generation
export const platformReportJobs = pgTable("platformReportJobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reportName: varchar("reportName").notNull(),
  reportType: varchar("reportType").notNull(),
  format: reportFormatEnum("format").notNull(),
  status: reportStatusEnum("status").default("pending"),
  parameters: jsonb("parameters"),
  filePath: varchar("filePath"),
  fileSize: integer("fileSize"),
  generatedAt: timestamp("generatedAt"),
  expiresAt: timestamp("expiresAt"),
  errorMessage: text("errorMessage"),
  requestedBy: varchar("requestedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow(),
},
(table) => [
  index("IDX_platform_report_jobs_status").on(table.status),
  index("IDX_platform_report_jobs_requested_by").on(table.requestedBy),
  index("IDX_platform_report_jobs_created_at").on(table.createdAt),
]);

// Recurring report schedules
export const platformReportSchedules = pgTable("platformReportSchedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reportName: varchar("reportName").notNull(),
  reportType: varchar("reportType").notNull(),
  format: reportFormatEnum("format").notNull(),
  schedule: varchar("schedule").notNull(),
  parameters: jsonb("parameters"),
  recipients: text("recipients").array(),
  isActive: boolean("isActive").default(true),
  lastRunAt: timestamp("lastRunAt"),
  nextRunAt: timestamp("nextRunAt"),
  createdBy: varchar("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

// ==================== PLATFORM REVENUE REPORTS INSERT SCHEMAS & TYPES ====================

// Platform Cost Category Types (dynamic lookup)
export const insertPlatformCostCategoryTypeSchema = createInsertSchema(platformCostCategoryTypes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  description: z.string().optional().nullable(),
});

export type PlatformCostCategoryType = typeof platformCostCategoryTypes.$inferSelect;
export type InsertPlatformCostCategoryType = z.infer<typeof insertPlatformCostCategoryTypeSchema>;

// Platform Cost Categories
export const insertPlatformCostCategorySchema = createInsertSchema(platformCostCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  description: z.string().optional().nullable(),
});

export type PlatformCostCategory = typeof platformCostCategories.$inferSelect;
export type InsertPlatformCostCategory = z.infer<typeof insertPlatformCostCategorySchema>;

// Platform Revenue Sources
export const insertPlatformRevenueSourceSchema = createInsertSchema(platformRevenueSources).omit({
  id: true,
  recordedAt: true,
  createdAt: true,
}).extend({
  metadata: z.record(z.any()).optional(),
});

export type PlatformRevenueSource = typeof platformRevenueSources.$inferSelect;
export type InsertPlatformRevenueSource = z.infer<typeof insertPlatformRevenueSourceSchema>;

// Platform Cost Entries
export const insertPlatformCostEntrySchema = createInsertSchema(platformCostEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  normalizedAmountZAR: true,
  exchangeRateUsed: true,
  createdBy: true,
  updatedBy: true,
  isAutomated: true,
  sourceReference: true,
}).extend({
  metadata: z.record(z.any()).optional(),
});

export type PlatformCostEntry = typeof platformCostEntries.$inferSelect;
export type InsertPlatformCostEntry = z.infer<typeof insertPlatformCostEntrySchema>;

// Platform Cost Allocations
export const insertPlatformCostAllocationSchema = createInsertSchema(platformCostAllocations).omit({
  id: true,
  createdAt: true,
});

export type PlatformCostAllocation = typeof platformCostAllocations.$inferSelect;
export type InsertPlatformCostAllocation = z.infer<typeof insertPlatformCostAllocationSchema>;

// Platform Financial Snapshots
export const insertPlatformFinancialSnapshotSchema = createInsertSchema(platformFinancialSnapshots).omit({
  id: true,
  generatedAt: true,
}).extend({
  metadata: z.record(z.any()).optional(),
});

export type PlatformFinancialSnapshot = typeof platformFinancialSnapshots.$inferSelect;
export type InsertPlatformFinancialSnapshot = z.infer<typeof insertPlatformFinancialSnapshotSchema>;

// Platform Financial Audit Log
export const insertPlatformFinancialAuditLogSchema = createInsertSchema(platformFinancialAuditLog).omit({
  id: true,
  changedAt: true,
}).extend({
  beforeData: z.record(z.any()).optional(),
  afterData: z.record(z.any()).optional(),
});

export type PlatformFinancialAuditLog = typeof platformFinancialAuditLog.$inferSelect;
export type InsertPlatformFinancialAuditLog = z.infer<typeof insertPlatformFinancialAuditLogSchema>;

// Platform Report Jobs
export const insertPlatformReportJobSchema = createInsertSchema(platformReportJobs).omit({
  id: true,
  createdAt: true,
  generatedAt: true,
}).extend({
  parameters: z.record(z.any()).optional(),
});

export type PlatformReportJob = typeof platformReportJobs.$inferSelect;
export type InsertPlatformReportJob = z.infer<typeof insertPlatformReportJobSchema>;

// Platform Report Schedules
export const insertPlatformReportScheduleSchema = createInsertSchema(platformReportSchedules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastRunAt: true,
  nextRunAt: true,
}).extend({
  parameters: z.record(z.any()).optional(),
  recipients: z.array(z.string()).optional(),
});

export type PlatformReportSchedule = typeof platformReportSchedules.$inferSelect;
export type InsertPlatformReportSchedule = z.infer<typeof insertPlatformReportScheduleSchema>;

// ==================== END PLATFORM REVENUE REPORTS TABLES ====================

// ==================== END E-LEARNING SCHEMAS & TYPES ====================

// ==================== BUSINESS PACKAGE SUBSCRIPTION SYSTEM ====================

// Package interval enum (monthly or annual billing)
export const packageIntervalEnum = pgEnum("packageInterval", ["monthly", "annual"]);

// Package assignment status enum
export const packageAssignmentStatusEnum = pgEnum("packageAssignmentStatus", ["active", "past_due", "cancelled", "scheduled_downgrade"]);

// Package change type enum (for audit trail)
export const packageChangeTypeEnum = pgEnum("packageChangeType", [
  "package_created", "package_updated", "package_deleted",
  "price_created", "price_updated", "price_deleted",
  "org_subscribed", "org_upgraded", "org_downgraded", "org_cancelled"
]);

// Business packages table (Starter, Professional, Enterprise tiers)
export const businessPackages = pgTable("businessPackages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(), // "Starter", "Professional", "Enterprise"
  tier: varchar("tier").notNull().unique(), // "starter", "professional", "enterprise"
  maxLearners: integer("maxLearners").notNull(), // Seat limit for learners
  maxTeachers: integer("maxTeachers").notNull(), // Seat limit for teachers/instructors
  maxOrgAdmins: integer("maxOrgAdmins").notNull(), // Seat limit for org admins
  monthlyCredits: integer("monthlyCredits").notNull(), // LP Credits included per month
  annualDiscountPercent: decimal("annualDiscountPercent", { precision: 5, scale: 2 }).default("10.00"), // Discount for annual plans
  valueProposition: text("valueProposition"), // Marketing text for annual plan promotion
  features: jsonb("features"), // Array of feature descriptions
  badge: varchar("badge"), // "Most Popular", "Best Value"
  colorScheme: varchar("colorScheme"), // "green", "blue", "purple", "orange"
  isActive: boolean("isActive").default(true),
  displayOrder: integer("displayOrder").notNull(),
  createdBy: varchar("createdBy").references(() => users.id),
  updatedBy: varchar("updatedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
}, (table) => [
  index("IDX_business_packages_tier").on(table.tier),
  index("IDX_business_packages_active").on(table.isActive),
  index("IDX_business_packages_display_order").on(table.displayOrder),
]);

// Business package prices table (multi-currency pricing)
export const businessPackagePrices = pgTable("businessPackagePrices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  packageId: varchar("packageId").notNull().references(() => businessPackages.id, { onDelete: "cascade" }),
  currency: currencyCodeEnum("currency").notNull(), // ZAR, EUR, USD, etc.
  pricePerLearner: decimal("pricePerLearner", { precision: 10, scale: 2 }).notNull(), // Monthly price per learner seat
  pricePerTeacher: decimal("pricePerTeacher", { precision: 10, scale: 2 }).notNull(), // Monthly price per teacher seat
  pricePerOrgAdmin: decimal("pricePerOrgAdmin", { precision: 10, scale: 2 }).notNull(), // Monthly price per org admin seat
  isActive: boolean("isActive").default(true),
  effectiveFrom: timestamp("effectiveFrom").defaultNow(), // When this pricing becomes effective
  createdBy: varchar("createdBy").references(() => users.id),
  updatedBy: varchar("updatedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
}, (table) => [
  index("IDX_business_package_prices_package").on(table.packageId),
  index("IDX_business_package_prices_currency").on(table.currency),
  unique("UNQ_package_currency").on(table.packageId, table.currency), // One price per package per currency
]);

// Organization package assignments table (links organizations to their subscribed package)
export const organizationPackageAssignments = pgTable("organizationPackageAssignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id).unique(),
  packageId: varchar("packageId").notNull().references(() => businessPackages.id),
  interval: packageIntervalEnum("interval").notNull().default("monthly"), // monthly or annual
  status: packageAssignmentStatusEnum("status").notNull().default("active"),
  currency: currencyCodeEnum("currency").notNull().default("ZAR"),
  currentPeriodStart: timestamp("currentPeriodStart").notNull(),
  currentPeriodEnd: timestamp("currentPeriodEnd").notNull(),
  nextBillingDate: timestamp("nextBillingDate"),
  // Scheduled downgrade fields
  scheduledPackageId: varchar("scheduledPackageId").references(() => businessPackages.id),
  scheduledEffectiveDate: timestamp("scheduledEffectiveDate"),
  scheduledUserSelections: jsonb("scheduledUserSelections"), // { disabledUserIds: string[] }
  // Billing
  lastPaymentId: varchar("lastPaymentId"),
  lastPaymentDate: timestamp("lastPaymentDate"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
}, (table) => [
  index("IDX_org_package_org").on(table.organizationId),
  index("IDX_org_package_package").on(table.packageId),
  index("IDX_org_package_status").on(table.status),
  index("IDX_org_package_next_billing").on(table.nextBillingDate),
]);

// Package change events table (audit trail for all package-related changes)
export const packageChangeEvents = pgTable("packageChangeEvents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  packageId: varchar("packageId").references(() => businessPackages.id),
  organizationId: varchar("organizationId").references(() => organizations.id),
  changeType: packageChangeTypeEnum("changeType").notNull(),
  previousValues: jsonb("previousValues"), // Snapshot before change
  newValues: jsonb("newValues"), // Snapshot after change
  changedBy: varchar("changedBy").references(() => users.id),
  ipAddress: varchar("ipAddress"),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt").defaultNow(),
}, (table) => [
  index("IDX_package_events_package").on(table.packageId),
  index("IDX_package_events_org").on(table.organizationId),
  index("IDX_package_events_type").on(table.changeType),
  index("IDX_package_events_date").on(table.createdAt),
]);

// Business Package insert schemas and types
export const insertBusinessPackageSchema = createInsertSchema(businessPackages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBusinessPackage = z.infer<typeof insertBusinessPackageSchema>;
export type BusinessPackage = typeof businessPackages.$inferSelect;

export const insertBusinessPackagePriceSchema = createInsertSchema(businessPackagePrices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBusinessPackagePrice = z.infer<typeof insertBusinessPackagePriceSchema>;
export type BusinessPackagePrice = typeof businessPackagePrices.$inferSelect;

export const insertOrganizationPackageAssignmentSchema = createInsertSchema(organizationPackageAssignments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOrganizationPackageAssignment = z.infer<typeof insertOrganizationPackageAssignmentSchema>;
export type OrganizationPackageAssignment = typeof organizationPackageAssignments.$inferSelect;

export const insertPackageChangeEventSchema = createInsertSchema(packageChangeEvents).omit({
  id: true,
  createdAt: true,
});
export type InsertPackageChangeEvent = z.infer<typeof insertPackageChangeEventSchema>;
export type PackageChangeEvent = typeof packageChangeEvents.$inferSelect;

// Package recommendation dismissals table (tracks when orgs dismiss upgrade recommendations)
export const packageRecommendationDismissals = pgTable("packageRecommendationDismissals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  dismissedBy: varchar("dismissedBy").notNull().references(() => users.id),
  recommendedPackageId: varchar("recommendedPackageId").references(() => businessPackages.id),
  dismissedAt: timestamp("dismissedAt").defaultNow(),
  expiresAt: timestamp("expiresAt").notNull(), // 30 days from dismissal
}, (table) => [
  index("IDX_pkg_rec_dismissal_org").on(table.organizationId),
  index("IDX_pkg_rec_dismissal_expires").on(table.expiresAt),
]);

export const insertPackageRecommendationDismissalSchema = createInsertSchema(packageRecommendationDismissals).omit({
  id: true,
  dismissedAt: true,
});
export type InsertPackageRecommendationDismissal = z.infer<typeof insertPackageRecommendationDismissalSchema>;
export type PackageRecommendationDismissal = typeof packageRecommendationDismissals.$inferSelect;

// ==================== END BUSINESS PACKAGE SUBSCRIPTION SYSTEM ====================

// ==================== DRIZZLE RELATIONS FOR RELATIONAL QUERIES ====================
// These enable db.query.*.findMany({ with: {...} }) syntax

export const coursesRelations = relations(courses, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [courses.organizationId],
    references: [organizations.id],
  }),
  category: one(courseCategories, {
    fields: [courses.categoryId],
    references: [courseCategories.id],
  }),
  creator: one(users, {
    fields: [courses.createdBy],
    references: [users.id],
  }),
  courseLessons: many(courseLessons),
  versions: many(courseVersions),
  tags: many(courseTags),
  reviews: many(courseReviews),
  purchases: many(coursePurchases),
  enrollments: many(userCourseEnrollments),
  progress: many(userCourseLessonProgress),
  drafts: many(courseDrafts),
}));

export const courseDraftsRelations = relations(courseDrafts, ({ one }) => ({
  originalCourse: one(courses, {
    fields: [courseDrafts.originalCourseId],
    references: [courses.id],
  }),
  organization: one(organizations, {
    fields: [courseDrafts.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [courseDrafts.createdBy],
    references: [users.id],
  }),
}));

export const courseLessonsRelations = relations(courseLessons, ({ one }) => ({
  course: one(courses, {
    fields: [courseLessons.courseId],
    references: [courses.id],
  }),
  lesson: one(lessons, {
    fields: [courseLessons.lessonId],
    references: [lessons.id],
  }),
  primaryQuiz: one(quizCollections, {
    fields: [courseLessons.primaryQuizId],
    references: [quizCollections.id],
  }),
}));

export const lessonsRelations = relations(lessons, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [lessons.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [lessons.createdBy],
    references: [users.id],
  }),
  courseLessons: many(courseLessons),
}));

export const courseVersionsRelations = relations(courseVersions, ({ one }) => ({
  course: one(courses, {
    fields: [courseVersions.courseId],
    references: [courses.id],
  }),
}));

export const courseFrameworksRelations = relations(courseFrameworks, ({ one }) => ({
  course: one(courses, {
    fields: [courseFrameworks.courseId],
    references: [courses.id],
  }),
  organization: one(organizations, {
    fields: [courseFrameworks.organizationId],
    references: [organizations.id],
  }),
}));

export const coursePurchasesRelations = relations(coursePurchases, ({ one, many }) => ({
  course: one(courses, {
    fields: [coursePurchases.courseId],
    references: [courses.id],
  }),
  courseVersion: one(courseVersions, {
    fields: [coursePurchases.courseVersionId],
    references: [courseVersions.id],
  }),
  user: one(users, {
    fields: [coursePurchases.userId],
    references: [users.id],
  }),
  refunds: many(courseRefunds),
}));

export const courseRefundsRelations = relations(courseRefunds, ({ one }) => ({
  purchase: one(coursePurchases, {
    fields: [courseRefunds.purchaseId],
    references: [coursePurchases.id],
  }),
  course: one(courses, {
    fields: [courseRefunds.courseId],
    references: [courses.id],
  }),
  user: one(users, {
    fields: [courseRefunds.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [courseRefunds.organizationId],
    references: [organizations.id],
  }),
  decider: one(users, {
    fields: [courseRefunds.decidedBy],
    references: [users.id],
  }),
}));

export const userCourseLessonProgressRelations = relations(userCourseLessonProgress, ({ one }) => ({
  user: one(users, {
    fields: [userCourseLessonProgress.userId],
    references: [users.id],
  }),
  course: one(courses, {
    fields: [userCourseLessonProgress.courseId],
    references: [courses.id],
  }),
  lesson: one(lessons, {
    fields: [userCourseLessonProgress.lessonId],
    references: [lessons.id],
  }),
}));

export const courseReviewsRelations = relations(courseReviews, ({ one }) => ({
  course: one(courses, {
    fields: [courseReviews.courseId],
    references: [courses.id],
  }),
  user: one(users, {
    fields: [courseReviews.userId],
    references: [users.id],
  }),
}));

export const userCourseEnrollmentsRelations = relations(userCourseEnrollments, ({ one }) => ({
  user: one(users, {
    fields: [userCourseEnrollments.userId],
    references: [users.id],
  }),
  course: one(courses, {
    fields: [userCourseEnrollments.courseId],
    references: [courses.id],
  }),
}));

export const courseTagsRelations = relations(courseTags, ({ one }) => ({
  organization: one(organizations, {
    fields: [courseTags.organizationId],
    references: [organizations.id],
  }),
  course: one(courses, {
    fields: [courseTags.courseId],
    references: [courses.id],
  }),
}));

// ==================== PLATFORM REVENUE REPORTS RELATIONS ====================

export const platformCostCategoriesRelations = relations(platformCostCategories, ({ many }) => ({
  costEntries: many(platformCostEntries),
}));

export const platformRevenueSourcesRelations = relations(platformRevenueSources, ({ one }) => ({
  organization: one(organizations, {
    fields: [platformRevenueSources.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [platformRevenueSources.userId],
    references: [users.id],
  }),
}));

export const platformCostEntriesRelations = relations(platformCostEntries, ({ one, many }) => ({
  category: one(platformCostCategories, {
    fields: [platformCostEntries.categoryId],
    references: [platformCostCategories.id],
  }),
  organization: one(organizations, {
    fields: [platformCostEntries.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [platformCostEntries.createdBy],
    references: [users.id],
  }),
  updater: one(users, {
    fields: [platformCostEntries.updatedBy],
    references: [users.id],
  }),
  allocations: many(platformCostAllocations),
}));

export const platformCostAllocationsRelations = relations(platformCostAllocations, ({ one }) => ({
  costEntry: one(platformCostEntries, {
    fields: [platformCostAllocations.costEntryId],
    references: [platformCostEntries.id],
  }),
  organization: one(organizations, {
    fields: [platformCostAllocations.organizationId],
    references: [organizations.id],
  }),
}));

export const platformFinancialSnapshotsRelations = relations(platformFinancialSnapshots, ({ one }) => ({
  organization: one(organizations, {
    fields: [platformFinancialSnapshots.organizationId],
    references: [organizations.id],
  }),
}));

export const platformFinancialAuditLogRelations = relations(platformFinancialAuditLog, ({ one }) => ({
  changedByUser: one(users, {
    fields: [platformFinancialAuditLog.changedBy],
    references: [users.id],
  }),
}));

export const platformReportJobsRelations = relations(platformReportJobs, ({ one }) => ({
  requestedByUser: one(users, {
    fields: [platformReportJobs.requestedBy],
    references: [users.id],
  }),
}));

export const platformReportSchedulesRelations = relations(platformReportSchedules, ({ one }) => ({
  createdByUser: one(users, {
    fields: [platformReportSchedules.createdBy],
    references: [users.id],
  }),
}));

// ==================== END PLATFORM REVENUE REPORTS RELATIONS ====================

// ==================== ORGANIZATION PACKAGE OVERRIDES ====================

// Organization Package Overrides - Custom pricing for specific orgs (marketing/sales deals)
export const organizationPackageOverrides = pgTable("organizationPackageOverrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  
  // Custom seat limits (null = use default package limits)
  maxLearners: integer("maxLearners"),
  maxTeachers: integer("maxTeachers"),
  maxOrgAdmins: integer("maxOrgAdmins"),
  
  // Custom monthly credits (null = use default package credits)
  monthlyCredits: integer("monthlyCredits"),
  
  // Custom pricing per role per currency (null = use default package pricing)
  pricePerLearnerZAR: decimal("pricePerLearnerZAR", { precision: 10, scale: 2 }),
  pricePerLearnerUSD: decimal("pricePerLearnerUSD", { precision: 10, scale: 2 }),
  pricePerLearnerEUR: decimal("pricePerLearnerEUR", { precision: 10, scale: 2 }),
  
  pricePerTeacherZAR: decimal("pricePerTeacherZAR", { precision: 10, scale: 2 }),
  pricePerTeacherUSD: decimal("pricePerTeacherUSD", { precision: 10, scale: 2 }),
  pricePerTeacherEUR: decimal("pricePerTeacherEUR", { precision: 10, scale: 2 }),
  
  pricePerOrgAdminZAR: decimal("pricePerOrgAdminZAR", { precision: 10, scale: 2 }),
  pricePerOrgAdminUSD: decimal("pricePerOrgAdminUSD", { precision: 10, scale: 2 }),
  pricePerOrgAdminEUR: decimal("pricePerOrgAdminEUR", { precision: 10, scale: 2 }),
  
  // Discount percentage (0-100) to apply to base package price
  discountPercentage: integer("discountPercentage").default(0),
  
  // Override reason for audit
  reason: text("reason"),
  
  // Validity period (null = no expiration)
  validFrom: timestamp("validFrom").defaultNow(),
  validUntil: timestamp("validUntil"),
  
  // Audit fields
  createdBy: varchar("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedBy: varchar("updatedBy").references(() => users.id),
  updatedAt: timestamp("updatedAt").defaultNow(),
  
  // Is this override active?
  isActive: boolean("isActive").default(true),
}, (table) => [
  index("IDX_org_package_overrides_org").on(table.organizationId),
  unique("UNQ_org_package_override").on(table.organizationId), // One override per org
]);

// Insert/select types
export const insertOrganizationPackageOverrideSchema = createInsertSchema(organizationPackageOverrides)
  .omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrganizationPackageOverride = z.infer<typeof insertOrganizationPackageOverrideSchema>;
export type OrganizationPackageOverride = typeof organizationPackageOverrides.$inferSelect;

export const organizationPackageOverridesRelations = relations(organizationPackageOverrides, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationPackageOverrides.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [organizationPackageOverrides.createdBy],
    references: [users.id],
  }),
}));

// ==================== END ORGANIZATION PACKAGE OVERRIDES ====================

// ==================== WHITE-LABEL BRANDING SYSTEM ====================

export const brandingThemeStatusEnum = pgEnum("brandingThemeStatus", [
  "draft",
  "active"
]);
export const themeModeIntentEnum = pgEnum("themeModeIntent", ["light", "dark"]);

export type LocalizedString = string | Record<string, string>;

export interface CustomCopy {
  loginTitle?: LocalizedString;
  loginSubtitle?: LocalizedString;
  loginCta?: LocalizedString;
  loginHelper?: LocalizedString;
  signupTitle?: LocalizedString;
  signupSubtitle?: LocalizedString;
  signupCta?: LocalizedString;
  signupHelper?: LocalizedString;
  dashboardWelcome?: LocalizedString;
  footerText?: LocalizedString;
}

export const brandingThemes = pgTable("brandingThemes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").references(() => organizations.id).unique(),
  orgName: text("orgName").notNull(),
  status: brandingThemeStatusEnum("status").notNull().default("draft"),
  themeModeIntent: themeModeIntentEnum("themeModeIntent"),
  presetId: text("presetId"),
  tokens: jsonb("tokens").$type<Record<string, string>>().notNull().default({}),
  tokensLight: jsonb("tokensLight").$type<Record<string, string>>(),
  tokensDark: jsonb("tokensDark").$type<Record<string, string>>(),
  logoUrl: text("logoUrl"),
  faviconUrl: text("faviconUrl"),
  fontHeading: text("fontHeading").default("Inter"),
  fontBody: text("fontBody").default("Inter"),
  supportUrl: text("supportUrl"),
  supportEmail: text("supportEmail"),
  termsUrl: text("termsUrl"),
  privacyUrl: text("privacyUrl"),
  allowEmailBranding: boolean("allowEmailBranding").default(false),
  enableContrastCorrections: boolean("enableContrastCorrections").default(true),
  gradientEnabled: boolean("gradientEnabled").default(false),
  gradientFrom: text("gradientFrom"),
  gradientTo: text("gradientTo"),
  gradientAngle: text("gradientAngle").default("135deg"),
  customCopy: jsonb("customCopy").$type<CustomCopy>().default({}),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

export const insertBrandingThemeSchema = createInsertSchema(brandingThemes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type BrandingTheme = typeof brandingThemes.$inferSelect;
export type InsertBrandingTheme = z.infer<typeof insertBrandingThemeSchema>;

export const organizationDomains = pgTable("organizationDomains", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").references(() => organizations.id).notNull(),
  domain: text("domain").notNull().unique(),
  verified: boolean("verified").notNull().default(false),
  verificationToken: text("verificationToken").notNull(),
  verifiedAt: timestamp("verifiedAt"),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow(),
});

export const insertOrganizationDomainSchema = createInsertSchema(organizationDomains).omit({
  id: true,
  verified: true,
  verifiedAt: true,
  isActive: true,
  createdAt: true,
});

export type OrganizationDomain = typeof organizationDomains.$inferSelect;
export type InsertOrganizationDomain = z.infer<typeof insertOrganizationDomainSchema>;

export const brandingThemesRelations = relations(brandingThemes, ({ one }) => ({
  organization: one(organizations, {
    fields: [brandingThemes.organizationId],
    references: [organizations.id],
  }),
}));

export const organizationDomainsRelations = relations(organizationDomains, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationDomains.organizationId],
    references: [organizations.id],
  }),
}));

// ==================== END WHITE-LABEL BRANDING SYSTEM ====================

// ==================== VERSIONING + LANGUAGE FOUNDATION INSERT SCHEMAS ====================

export const insertSupportedLanguageSchema = createInsertSchema(supportedLanguages);
export type InsertSupportedLanguage = z.infer<typeof insertSupportedLanguageSchema>;
export type SelectSupportedLanguage = typeof supportedLanguages.$inferSelect;

export const insertQuizCollectionVersionSchema = createInsertSchema(quizCollectionVersions).omit({ id: true, createdAt: true });
export type InsertQuizCollectionVersion = z.infer<typeof insertQuizCollectionVersionSchema>;
export type SelectQuizCollectionVersion = typeof quizCollectionVersions.$inferSelect;

export const insertQuizCardVersionSchema = createInsertSchema(quizCardVersions).omit({ id: true, createdAt: true });
export type InsertQuizCardVersion = z.infer<typeof insertQuizCardVersionSchema>;
export type SelectQuizCardVersion = typeof quizCardVersions.$inferSelect;

export const insertContentTranslationJobSchema = createInsertSchema(contentTranslationJobs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertContentTranslationJob = z.infer<typeof insertContentTranslationJobSchema>;
export type SelectContentTranslationJob = typeof contentTranslationJobs.$inferSelect;

export const insertLessonTranslationJobSchema = createInsertSchema(lessonTranslationJobs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLessonTranslationJob = z.infer<typeof insertLessonTranslationJobSchema>;
export type SelectLessonTranslationJob = typeof lessonTranslationJobs.$inferSelect;

// ==================== END VERSIONING + LANGUAGE FOUNDATION ====================

// ==================== COURSE UPGRADE ORDERS ====================

export const courseUpgradeOrders = pgTable("courseUpgradeOrders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("userId").notNull().references(() => users.id),
  courseId: varchar("courseId").notNull().references(() => courses.id),
  versionId: varchar("versionId").notNull().references(() => courseVersions.id),
  status: varchar("status").notNull().default("pending"),
  checkoutId: varchar("checkoutId"),
  amount: decimal("amount", { precision: 19, scale: 4 }),
  currency: varchar("currency"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
}, (table) => [
  index("IDX_course_upgrade_orders_user").on(table.userId),
  index("IDX_course_upgrade_orders_version").on(table.versionId),
  index("IDX_course_upgrade_orders_status").on(table.status),
]);

export const insertCourseUpgradeOrderSchema = createInsertSchema(courseUpgradeOrders).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCourseUpgradeOrder = z.infer<typeof insertCourseUpgradeOrderSchema>;
export type CourseUpgradeOrder = typeof courseUpgradeOrders.$inferSelect;

// ==================== END COURSE UPGRADE ORDERS ====================

// ==================== COURSE RATINGS ====================

export const courseRatings = pgTable("courseRatings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("courseId").notNull().references(() => courses.id),
  userId: varchar("userId").notNull().references(() => users.id),
  rating: decimal("rating", { precision: 3, scale: 1 }).notNull(),
  review: text("review"),
  isHidden: boolean("isHidden").default(false),
  isReported: boolean("isReported").default(false),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
}, (table) => [
  index("IDX_course_ratings_course").on(table.courseId),
  index("IDX_course_ratings_user").on(table.userId),
  index("IDX_course_ratings_rating").on(table.rating),
  unique("UQ_course_ratings_user_course").on(table.userId, table.courseId),
]);

export const courseRatingsRelations = relations(courseRatings, ({ one }) => ({
  course: one(courses, { fields: [courseRatings.courseId], references: [courses.id] }),
  user: one(users, { fields: [courseRatings.userId], references: [users.id] }),
}));

export const insertCourseRatingSchema = createInsertSchema(courseRatings).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCourseRating = z.infer<typeof insertCourseRatingSchema>;
export type CourseRating = typeof courseRatings.$inferSelect;

// ==================== END COURSE RATINGS ====================

// ==================== ORGANIZATION BANK DETAILS ====================

export const organizationBankDetails = pgTable("organizationBankDetails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organizationId").notNull().references(() => organizations.id),
  bankName: varchar("bankName"),
  accountNumber: varchar("accountNumber"),
  branchCode: varchar("branchCode"),
  accountHolderName: varchar("accountHolderName"),
  isVerified: boolean("isVerified").default(false),
  verifiedAt: timestamp("verifiedAt"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
}, (table) => [
  uniqueIndex("IDX_org_bank_details_org").on(table.organizationId),
]);

export const insertOrganizationBankDetailSchema = createInsertSchema(organizationBankDetails).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrganizationBankDetail = z.infer<typeof insertOrganizationBankDetailSchema>;
export type OrganizationBankDetail = typeof organizationBankDetails.$inferSelect;

// ==================== END ORGANIZATION BANK DETAILS ====================

// ==================== ENTERPRISE CUSTOMER PORTAL & ON-PREM LICENSING ====================

export const enterpriseCustomers = pgTable("enterpriseCustomers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").notNull().unique(),
  passwordHash: varchar("passwordHash").notNull(),
  companyName: varchar("companyName").notNull(),
  contactPersonName: varchar("contactPersonName").notNull(),
  contactEmail: varchar("contactEmail").notNull(),
  contactMobile: varchar("contactMobile"),
  companyAddress: text("companyAddress"),
  country: varchar("country"),
  royaltyPercentage: decimal("royaltyPercentage", { precision: 5, scale: 2 }).notNull().default("0.00"),
  status: varchar("status").default("pending"),
  emailVerified: boolean("emailVerified").default(false),
  emailVerificationToken: varchar("emailVerificationToken"),
  emailVerificationExpiry: timestamp("emailVerificationExpiry"),
  accountActivatedAt: timestamp("accountActivatedAt"),
  parentEnterpriseId: varchar("parentEnterpriseId"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
}, (table) => [
  uniqueIndex("IDX_enterprise_customers_email").on(table.email),
  index("IDX_enterprise_customers_parent").on(table.parentEnterpriseId),
]);

export const insertEnterpriseCustomerSchema = createInsertSchema(enterpriseCustomers).omit({ id: true, createdAt: true });
export type InsertEnterpriseCustomer = z.infer<typeof insertEnterpriseCustomerSchema>;
export type EnterpriseCustomer = typeof enterpriseCustomers.$inferSelect;

export const enterpriseDocuments = pgTable("enterpriseDocuments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseCustomerId: varchar("enterpriseCustomerId").notNull().references(() => enterpriseCustomers.id),
  documentType: varchar("documentType").notNull(),
  fileName: varchar("fileName").notNull(),
  filePath: varchar("filePath").notNull(),
  fileSize: integer("fileSize"),
  mimeType: varchar("mimeType"),
  status: varchar("status").default("uploaded"),
  rejectionReason: text("rejectionReason"),
  verifiedBy: varchar("verifiedBy"),
  verifiedAt: timestamp("verifiedAt"),
  createdAt: timestamp("createdAt").defaultNow(),
}, (table) => [
  index("IDX_enterprise_documents_customer").on(table.enterpriseCustomerId),
  index("IDX_enterprise_documents_type").on(table.documentType),
]);

export const insertEnterpriseDocumentSchema = createInsertSchema(enterpriseDocuments).omit({ id: true, createdAt: true });
export type InsertEnterpriseDocument = z.infer<typeof insertEnterpriseDocumentSchema>;
export type EnterpriseDocument = typeof enterpriseDocuments.$inferSelect;

export const buildVersions = pgTable("buildVersions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  versionNumber: varchar("versionNumber").notNull().unique(),
  releaseNotes: text("releaseNotes"),
  fileName: varchar("fileName").notNull(),
  filePath: varchar("filePath").notNull(),
  fileSize: integer("fileSize"),
  uploadedBy: varchar("uploadedBy").notNull(),
  isActive: boolean("isActive").default(true),
  buildDate: timestamp("buildDate"),
  createdAt: timestamp("createdAt").defaultNow(),
}, (table) => [
  uniqueIndex("IDX_build_versions_version").on(table.versionNumber),
  index("IDX_build_versions_active").on(table.isActive),
]);

export const insertBuildVersionSchema = createInsertSchema(buildVersions).omit({ id: true, createdAt: true });
export type InsertBuildVersion = z.infer<typeof insertBuildVersionSchema>;
export type BuildVersion = typeof buildVersions.$inferSelect;

export const enterpriseLicenseRequests = pgTable("enterpriseLicenseRequests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseCustomerId: varchar("enterpriseCustomerId").notNull().references(() => enterpriseCustomers.id),
  requestData: text("requestData").notNull(),
  hardwareKey: varchar("hardwareKey"),
  hostname: varchar("hostname"),
  serverBaseUrl: varchar("serverBaseUrl"),
  systemType: varchar("systemType").notNull(),
  status: varchar("status").default("pending"),
  denialReason: text("denialReason"),
  monthlyFee: decimal("monthlyFee", { precision: 19, scale: 4 }),
  feeCurrency: varchar("feeCurrency"),
  requestType: varchar("requestType").notNull().default("initial"), // initial | renewal
  autoApproveRenewals: boolean("autoApproveRenewals").notNull().default(false),
  autoApproveDisabledAt: timestamp("autoApproveDisabledAt"),
  autoApproveDisabledBy: varchar("autoApproveDisabledBy"),
  autoApproveDisableReason: text("autoApproveDisableReason"),
  graceDays: integer("graceDays").notNull().default(15),
  billingStatus: varchar("billingStatus").notNull().default("due"), // due | paid | overdue | waived
  billingNotes: text("billingNotes"),
  lastCheckInAt: timestamp("lastCheckInAt"),
  lastRenewedAt: timestamp("lastRenewedAt"),
  nextRenewalDueAt: timestamp("nextRenewalDueAt"),
  reminder5SentAt: timestamp("reminder5SentAt"),
  reminder3SentAt: timestamp("reminder3SentAt"),
  reminder1SentAt: timestamp("reminder1SentAt"),
  overdueNoticeSentAt: timestamp("overdueNoticeSentAt"),
  reviewedBy: varchar("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  updatedAt: timestamp("updatedAt").defaultNow(),
  createdAt: timestamp("createdAt").defaultNow(),
}, (table) => [
  index("IDX_enterprise_license_requests_customer").on(table.enterpriseCustomerId),
  index("IDX_enterprise_license_requests_status").on(table.status),
  index("IDX_enterprise_license_requests_renewal").on(table.enterpriseCustomerId, table.autoApproveRenewals),
]);

export const insertEnterpriseLicenseRequestSchema = createInsertSchema(enterpriseLicenseRequests).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEnterpriseLicenseRequest = z.infer<typeof insertEnterpriseLicenseRequestSchema>;
export type EnterpriseLicenseRequest = typeof enterpriseLicenseRequests.$inferSelect;

export const enterpriseLicenseKeys = pgTable("enterpriseLicenseKeys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  licenseId: varchar("licenseId").notNull().unique(),
  licenseRequestId: varchar("licenseRequestId").notNull().references(() => enterpriseLicenseRequests.id),
  enterpriseCustomerId: varchar("enterpriseCustomerId").notNull().references(() => enterpriseCustomers.id),
  encryptedKeyData: text("encryptedKeyData").notNull(),
  systemType: varchar("systemType").notNull(),
  issuedReason: varchar("issuedReason").notNull().default("initial"), // initial | renewal | replacement
  renewalSequence: integer("renewalSequence").notNull().default(1),
  issuedAt: timestamp("issuedAt").defaultNow(),
  expiresAt: timestamp("expiresAt").notNull(),
  downloadedAt: timestamp("downloadedAt"),
  lastCheckInAt: timestamp("lastCheckInAt"),
  checkInCount: integer("checkInCount").notNull().default(0),
  isRevoked: boolean("isRevoked").default(false),
  revokedAt: timestamp("revokedAt"),
  revokedReason: text("revokedReason"),
  createdAt: timestamp("createdAt").defaultNow(),
}, (table) => [
  index("IDX_enterprise_license_keys_request").on(table.licenseRequestId),
  index("IDX_enterprise_license_keys_customer").on(table.enterpriseCustomerId),
  index("IDX_enterprise_license_keys_system_type").on(table.systemType),
  index("IDX_enterprise_license_keys_license_id").on(table.licenseId),
]);

export const insertEnterpriseLicenseKeySchema = createInsertSchema(enterpriseLicenseKeys).omit({ id: true, createdAt: true });
export type InsertEnterpriseLicenseKey = z.infer<typeof insertEnterpriseLicenseKeySchema>;
export type EnterpriseLicenseKey = typeof enterpriseLicenseKeys.$inferSelect;

export const onpremLicenseState = pgTable("onpremLicenseState", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  licenseKeyData: text("licenseKeyData").notNull(),
  hardwareKey: varchar("hardwareKey").notNull(),
  hostname: varchar("hostname").notNull(),
  serverBaseUrl: varchar("serverBaseUrl").notNull(),
  systemType: varchar("systemType").notNull(),
  installedAt: timestamp("installedAt").defaultNow(),
  expiresAt: timestamp("expiresAt"),
  isValid: boolean("isValid").default(true),
  lastValidatedAt: timestamp("lastValidatedAt"),
  createdAt: timestamp("createdAt").defaultNow(),
});

export const insertOnpremLicenseStateSchema = createInsertSchema(onpremLicenseState).omit({ id: true, createdAt: true });
export type InsertOnpremLicenseState = z.infer<typeof insertOnpremLicenseStateSchema>;
export type OnpremLicenseState = typeof onpremLicenseState.$inferSelect;

export const enterpriseRevenueSync = pgTable("enterpriseRevenueSync", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseCustomerId: varchar("enterpriseCustomerId").notNull().references(() => enterpriseCustomers.id),
  licenseKeyId: varchar("licenseKeyId").references(() => enterpriseLicenseKeys.id),
  orgName: varchar("orgName").notNull(),
  orgId: varchar("orgId"),
  systemBaseUrl: varchar("systemBaseUrl"),
  systemType: varchar("systemType"),
  totalUsers: integer("totalUsers").default(0),
  totalLearners: integer("totalLearners").default(0),
  totalInstructors: integer("totalInstructors").default(0),
  totalAdmins: integer("totalAdmins").default(0),
  totalCourses: integer("totalCourses").default(0),
  totalEnrollments: integer("totalEnrollments").default(0),
  totalRevenueLocal: decimal("totalRevenueLocal", { precision: 19, scale: 4 }).default("0"),
  revenueCurrency: varchar("revenueCurrency"),
  commissionPercentage: decimal("commissionPercentage", { precision: 5, scale: 2 }),
  commissionValue: decimal("commissionValue", { precision: 19, scale: 4 }),
  syncPeriodStart: timestamp("syncPeriodStart"),
  syncPeriodEnd: timestamp("syncPeriodEnd"),
  syncedAt: timestamp("syncedAt").defaultNow(),
  createdAt: timestamp("createdAt").defaultNow(),
}, (table) => [
  index("IDX_enterprise_revenue_sync_customer").on(table.enterpriseCustomerId),
  index("IDX_enterprise_revenue_sync_license").on(table.licenseKeyId),
  index("IDX_enterprise_revenue_sync_synced").on(table.syncedAt),
]);

export const insertEnterpriseRevenueSyncSchema = createInsertSchema(enterpriseRevenueSync).omit({ id: true, createdAt: true });
export type InsertEnterpriseRevenueSync = z.infer<typeof insertEnterpriseRevenueSyncSchema>;
export type EnterpriseRevenueSync = typeof enterpriseRevenueSync.$inferSelect;

export const enterpriseAgreementTemplates = pgTable("enterpriseAgreementTemplates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateName: varchar("templateName").notNull(),
  templateType: varchar("templateType").notNull(),
  filePath: varchar("filePath").notNull(),
  fileName: varchar("fileName").notNull(),
  version: varchar("version"),
  uploadedBy: varchar("uploadedBy").notNull(),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow(),
}, (table) => [
  index("IDX_enterprise_agreement_templates_type").on(table.templateType),
  index("IDX_enterprise_agreement_templates_active").on(table.isActive),
]);

export const insertEnterpriseAgreementTemplateSchema = createInsertSchema(enterpriseAgreementTemplates).omit({ id: true, createdAt: true });
export type InsertEnterpriseAgreementTemplate = z.infer<typeof insertEnterpriseAgreementTemplateSchema>;
export type EnterpriseAgreementTemplate = typeof enterpriseAgreementTemplates.$inferSelect;

export const enterpriseKeyring = pgTable("enterpriseKeyring", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseCustomerId: varchar("enterpriseCustomerId").notNull().references(() => enterpriseCustomers.id),
  keyId: varchar("keyId").notNull().default(sql`gen_random_uuid()`),
  purpose: varchar("purpose").notNull(),
  encryptedKeyBlob: text("encryptedKeyBlob").notNull(),
  keyVersion: integer("keyVersion").notNull().default(1),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow(),
  retiredAt: timestamp("retiredAt"),
}, (table) => [
  index("IDX_enterprise_keyring_customer").on(table.enterpriseCustomerId),
  index("IDX_enterprise_keyring_purpose").on(table.enterpriseCustomerId, table.purpose),
  index("IDX_enterprise_keyring_active").on(table.enterpriseCustomerId, table.isActive),
]);

export const insertEnterpriseKeyringSchema = createInsertSchema(enterpriseKeyring).omit({ id: true, createdAt: true });
export type InsertEnterpriseKeyring = z.infer<typeof insertEnterpriseKeyringSchema>;
export type EnterpriseKeyring = typeof enterpriseKeyring.$inferSelect;

export const enterpriseSystems = pgTable("enterpriseSystems", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseCustomerId: varchar("enterpriseCustomerId").notNull().references(() => enterpriseCustomers.id),
  name: varchar("name").notNull(),
  systemType: varchar("systemType").notNull(),
  baseUrl: varchar("baseUrl"),
  internalHostname: varchar("internalHostname"),
  cpu: varchar("cpu"),
  memory: varchar("memory"),
  appPort: integer("appPort").default(3000),
  dbPort: integer("dbPort").default(5432),
  nginxHttpPort: integer("nginxHttpPort").default(80),
  nginxHttpsPort: integer("nginxHttpsPort").default(443),
  hardwareKey: varchar("hardwareKey"),
  activeLicenseRequestId: varchar("activeLicenseRequestId").references(() => enterpriseLicenseRequests.id),
  activeLicenseKeyId: varchar("activeLicenseKeyId").references(() => enterpriseLicenseKeys.id),
  licenseStatus: varchar("licenseStatus").notNull().default("unlicensed"), // contract: active | grace | expired | revoked | suspended | inactive | unlicensed | pending_approval | reissue_required | reissue_requested | incomplete_profile | invalid_local_state | pending_cloud_confirm | identity_mismatch
  licenseExpiresAt: timestamp("licenseExpiresAt"),
  lastCheckInAt: timestamp("lastCheckInAt"),
  nextCheckInDueAt: timestamp("nextCheckInDueAt"),
  lastTelemetryAt: timestamp("lastTelemetryAt"),
  alertEmails: text("alertEmails"),
  lastContactSyncAt: timestamp("lastContactSyncAt"),
  syncAuthMode: varchar("syncAuthMode").notNull().default("shared"), // shared | system
  syncAuthVersion: integer("syncAuthVersion").notNull().default(0),
  syncAuthSecretHash: varchar("syncAuthSecretHash"),
  syncAuthRevokedAt: timestamp("syncAuthRevokedAt"),
  autoApproveRenewals: boolean("autoApproveRenewals").notNull().default(false),
  graceDays: integer("graceDays").notNull().default(15),
  billingStatus: varchar("billingStatus").notNull().default("due"),
  monthlyFee: decimal("monthlyFee", { precision: 19, scale: 4 }),
  feeCurrency: varchar("feeCurrency"),
  status: varchar("status").default("active"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
}, (table) => [
  index("IDX_enterprise_systems_customer").on(table.enterpriseCustomerId),
  index("IDX_enterprise_systems_type").on(table.enterpriseCustomerId, table.systemType),
  index("IDX_enterprise_systems_license_status").on(table.enterpriseCustomerId, table.licenseStatus),
]);

export const insertEnterpriseSystemSchema = createInsertSchema(enterpriseSystems).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEnterpriseSystem = z.infer<typeof insertEnterpriseSystemSchema>;
export type EnterpriseSystem = typeof enterpriseSystems.$inferSelect;

export const enterpriseSystemDailyTelemetry = pgTable("enterpriseSystemDailyTelemetry", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseCustomerId: varchar("enterpriseCustomerId").notNull().references(() => enterpriseCustomers.id),
  enterpriseSystemId: varchar("enterpriseSystemId").references(() => enterpriseSystems.id),
  systemType: varchar("systemType"),
  serverBaseUrl: varchar("serverBaseUrl"),
  hostname: varchar("hostname"),
  organizationId: varchar("organizationId"),
  organizationName: varchar("organizationName"),
  totalUsers: integer("totalUsers").default(0),
  totalOrgAdmins: integer("totalOrgAdmins").default(0),
  totalTrainers: integer("totalTrainers").default(0),
  totalLearners: integer("totalLearners").default(0),
  totalCustSupers: integer("totalCustSupers").default(0),
  totalSuperAdmins: integer("totalSuperAdmins").default(0),
  totalDemoOrganizations: integer("totalDemoOrganizations").default(0),
  totalDemoUsers: integer("totalDemoUsers").default(0),
  totalOrganizations: integer("totalOrganizations").default(0),
  totalCourses: integer("totalCourses").default(0),
  totalPublishedCourses: integer("totalPublishedCourses").default(0),
  totalDemoCourses: integer("totalDemoCourses").default(0),
  totalDemoPublishedCourses: integer("totalDemoPublishedCourses").default(0),
  totalEnrollments: integer("totalEnrollments").default(0),
  totalPublishedEnrollments: integer("totalPublishedEnrollments").default(0),
  totalDemoEnrollments: integer("totalDemoEnrollments").default(0),
  totalPaidCourseEnrollments: integer("totalPaidCourseEnrollments").default(0),
  totalFreeCourseEnrollments: integer("totalFreeCourseEnrollments").default(0),
  totalDemoCompletions: integer("totalDemoCompletions").default(0),
  totalPaidEnrollmentValue: decimal("totalPaidEnrollmentValue", { precision: 19, scale: 4 }).default("0"),
  totalDemoPaidEnrollmentValue: decimal("totalDemoPaidEnrollmentValue", { precision: 19, scale: 4 }).default("0"),
  totalFreeEnrollmentValue: decimal("totalFreeEnrollmentValue", { precision: 19, scale: 4 }).default("0"),
  totalAssignments: integer("totalAssignments").default(0),
  totalPublishedAssignments: integer("totalPublishedAssignments").default(0),
  totalPaidCourseCompletions: integer("totalPaidCourseCompletions").default(0),
  totalFreeCourseCompletions: integer("totalFreeCourseCompletions").default(0),
  totalPaidCompletionValue: decimal("totalPaidCompletionValue", { precision: 19, scale: 4 }).default("0"),
  totalDemoPaidCompletionValue: decimal("totalDemoPaidCompletionValue", { precision: 19, scale: 4 }).default("0"),
  totalFreeCourseCompletionsValue: decimal("totalFreeCourseCompletionsValue", { precision: 19, scale: 4 }).default("0"),
  activeUsers30Days: integer("activeUsers30Days").default(0),
  royaltyPercentageApplied: decimal("royaltyPercentageApplied", { precision: 5, scale: 2 }).default("0"),
  royaltyRevenueEnrollments: decimal("royaltyRevenueEnrollments", { precision: 19, scale: 4 }).default("0"),
  royaltyRevenueCompletions: decimal("royaltyRevenueCompletions", { precision: 19, scale: 4 }).default("0"),
  royaltyRevenueTotal: decimal("royaltyRevenueTotal", { precision: 19, scale: 4 }).default("0"),
  metricCurrency: varchar("metricCurrency"),
  metricsSchemaVersion: integer("metricsSchemaVersion").default(1),
  reportDate: date("reportDate").default(sql`CURRENT_DATE`).notNull(),
  reportedAt: timestamp("reportedAt").defaultNow(),
  createdAt: timestamp("createdAt").defaultNow(),
}, (table) => [
  index("IDX_enterprise_telemetry_customer").on(table.enterpriseCustomerId),
  index("IDX_enterprise_telemetry_system").on(table.enterpriseSystemId),
  index("IDX_enterprise_telemetry_report_date").on(table.reportDate),
  uniqueIndex("IDX_enterprise_telemetry_unique_daily").on(
    table.enterpriseCustomerId,
    table.enterpriseSystemId,
    table.organizationId,
    table.reportDate,
  ),
]);

export const insertEnterpriseSystemDailyTelemetrySchema = createInsertSchema(enterpriseSystemDailyTelemetry).omit({ id: true, createdAt: true });
export type InsertEnterpriseSystemDailyTelemetry = z.infer<typeof insertEnterpriseSystemDailyTelemetrySchema>;
export type EnterpriseSystemDailyTelemetry = typeof enterpriseSystemDailyTelemetry.$inferSelect;

// Enterprise Relations
export const enterpriseCustomersRelations = relations(enterpriseCustomers, ({ one, many }) => ({
  parentEnterprise: one(enterpriseCustomers, {
    fields: [enterpriseCustomers.parentEnterpriseId],
    references: [enterpriseCustomers.id],
    relationName: "enterpriseParentChild",
  }),
  childEnterprises: many(enterpriseCustomers, {
    relationName: "enterpriseParentChild",
  }),
  documents: many(enterpriseDocuments),
  licenseRequests: many(enterpriseLicenseRequests),
  licenseKeys: many(enterpriseLicenseKeys),
  revenueSyncs: many(enterpriseRevenueSync),
  keys: many(enterpriseKeyring),
  systems: many(enterpriseSystems),
}));

export const enterpriseDocumentsRelations = relations(enterpriseDocuments, ({ one }) => ({
  enterpriseCustomer: one(enterpriseCustomers, {
    fields: [enterpriseDocuments.enterpriseCustomerId],
    references: [enterpriseCustomers.id],
  }),
}));

export const enterpriseLicenseRequestsRelations = relations(enterpriseLicenseRequests, ({ one }) => ({
  enterpriseCustomer: one(enterpriseCustomers, {
    fields: [enterpriseLicenseRequests.enterpriseCustomerId],
    references: [enterpriseCustomers.id],
  }),
}));

export const enterpriseLicenseKeysRelations = relations(enterpriseLicenseKeys, ({ one }) => ({
  licenseRequest: one(enterpriseLicenseRequests, {
    fields: [enterpriseLicenseKeys.licenseRequestId],
    references: [enterpriseLicenseRequests.id],
  }),
  enterpriseCustomer: one(enterpriseCustomers, {
    fields: [enterpriseLicenseKeys.enterpriseCustomerId],
    references: [enterpriseCustomers.id],
  }),
}));

export const enterpriseRevenueSyncRelations = relations(enterpriseRevenueSync, ({ one }) => ({
  enterpriseCustomer: one(enterpriseCustomers, {
    fields: [enterpriseRevenueSync.enterpriseCustomerId],
    references: [enterpriseCustomers.id],
  }),
  licenseKey: one(enterpriseLicenseKeys, {
    fields: [enterpriseRevenueSync.licenseKeyId],
    references: [enterpriseLicenseKeys.id],
  }),
}));

export const enterpriseKeyringRelations = relations(enterpriseKeyring, ({ one }) => ({
  enterpriseCustomer: one(enterpriseCustomers, {
    fields: [enterpriseKeyring.enterpriseCustomerId],
    references: [enterpriseCustomers.id],
  }),
}));

// ==================== END ENTERPRISE CUSTOMER PORTAL & ON-PREM LICENSING ====================

// ==================== END DRIZZLE RELATIONS ====================
