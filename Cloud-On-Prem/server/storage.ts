// @ts-nocheck
import {
  users,
  sessions,
  cardCollections,
  collectionStatTypes,
  universalStatUnits,
  cards,
  cardStats,
  gameResults,

  gameRooms,
  playerSessions,
  leaderBoard,
  playerStats,
  guestSessions,
  activeOneVOneGames,
  organizations,
  organizationUnits,
  organizationSubUnits,
  organizationTeams,
  userOrganizationRoles,
  userOrganizationAssignments,
  joinRequests,
  organizationUsageLimits,
  subjects,
  unitSubjects,
  quizCollections,
  quizCards,
  quizCollectionAssignments,
  activeQuizGames,
  quizGameProgress,
  userQuizProgress,
  quizGameResults,
  aiConfig,
  quizDrafts,
  salesInquiries,
  quizCardExplanations,
  termDefinitions,
  explanationTerms,
  coinTransactions,
  challengeTemplates,
  challengeProgress,
  powerUpCatalog,
  powerUpInventory,
  activePowerUps,
  cosmeticCatalog,
  cosmeticOwnership,
  equippedCosmetics,
  seasonPassTiers,
  seasonPassProgress,
  playerSeasonRewards,
  achievementCatalog,
  achievementUnlocks,
  loginStreaks,
  gamificationEconomyRules,
  shopItemPricing,
  adminChallengeConfig,
  seasonPassConfig,
  coinAdjustments,
  userCosmeticLoadouts,
  seasonPassPurchases,
  lessonScopeAssignments,
  lessonQuizLinks,
  lessons,
  courses,
  courseLessons,
  licenseFlagOverrides,
  licenseFlagAudit,
  licenseRolloutOrganizations,
  licenseRolloutBetaUsers,
  brandingThemes,
  organizationDomains,
  type BrandingTheme,
  type InsertBrandingTheme,
  type CustomCopy,
  type OrganizationDomain,
  type InsertOrganizationDomain,
  type AiConfig,
  type InsertAiConfig,
  type QuizDraft,
  type InsertQuizDraft,
  type SalesInquiry,
  type InsertSalesInquiry,
  type QuizCardExplanation,
  type InsertQuizCardExplanation,
  type TermDefinition,
  type InsertTermDefinition,
  type ExplanationTerm,
  type InsertExplanationTerm,
  type CoinTransaction,
  type InsertCoinTransaction,
  type ChallengeTemplate,
  type InsertChallengeTemplate,
  type ChallengeProgress,
  type InsertChallengeProgress,
  type PowerUpCatalog,
  type InsertPowerUpCatalog,
  type PowerUpInventory,
  type InsertPowerUpInventory,
  type ActivePowerUp,
  type InsertActivePowerUp,
  type CosmeticCatalog,
  type InsertCosmeticCatalog,
  type CosmeticOwnership,
  type InsertCosmeticOwnership,
  type EquippedCosmetic,
  type InsertEquippedCosmetic,
  type SeasonPassTier,
  type InsertSeasonPassTier,
  type SeasonPassProgress,
  type InsertSeasonPassProgress,
  type PlayerSeasonReward,
  type InsertPlayerSeasonReward,
  type AchievementCatalog,
  type InsertAchievementCatalog,
  type AchievementUnlock,
  type InsertAchievementUnlock,
  type LoginStreak,
  type InsertLoginStreak,
  type GamificationEconomyRule,
  type InsertGamificationEconomyRule,
  type ShopItemPricing,
  type InsertShopItemPricing,
  type AdminChallengeConfig,
  type InsertAdminChallengeConfig,
  type SeasonPassConfig,
  type InsertSeasonPassConfig,
  type CoinAdjustment,
  type InsertCoinAdjustment,
  type UserCosmeticLoadout,
  type InsertUserCosmeticLoadout,
  type SeasonPassPurchase,
  type InsertSeasonPassPurchase,
  type User,
  type UpsertUser,
  type RegisterUser,
  type UpdateProfile,
  type UpdateAvatar,
  type CardCollection,
  type InsertCardCollection,
  type CollectionStatType,
  type InsertCollectionStatType,
  type UniversalStatUnit,
  type InsertUniversalStatUnit,
  type Card,
  type InsertCard,
  type CardStat,
  type InsertCardStat,
  type GameResult,
  type InsertGameResult,
  type GameRoom,
  type InsertGameRoom,
  type PlayerSession,
  type InsertPlayerSession,
  type LeaderBoardEntry,
  type PlayerStats,
  type InsertPlayerStats,
  type GuestSession,
  type InsertGuestSession,
  type ActiveOneVOneGame,
  type InsertActiveOneVOneGame,
  type PlayerXPChanges,
  type PlayerXPChangeData,
  type Organization,
  type InsertOrganization,
  type OrganizationUnit,
  type InsertOrganizationUnit,
  type OrganizationSubUnit,
  type InsertOrganizationSubUnit,
  type OrganizationTeam,
  type InsertOrganizationTeam,
  type UserOrganizationRole,
  type InsertUserOrganizationRole,
  type UserOrganizationAssignment,
  type InsertUserOrganizationAssignment,
  type JoinRequest,
  type InsertJoinRequest,
  type Subject,
  type InsertSubject,
  type QuizCollection,
  type InsertQuizCollection,
  type QuizCard,
  type InsertQuizCard,
  type QuizCollectionAssignment,
  type InsertQuizCollectionAssignment,
  type ActiveQuizGame,
  type InsertActiveQuizGame,
  type QuizGameProgress,
  type InsertQuizGameProgress,
  type QuizGameResult,
  type InsertQuizGameResult,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, sql, gte, lte, lt, desc, count, avg, sum, or, inArray, ilike, isNotNull, isNull } from "drizzle-orm";
import bcrypt from "bcrypt";
import { enforceOrgRolePolicy } from "./services/onpremLicensePolicy";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  // User operations (required for auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getUserByGamerName(gamerName: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByFirstLastName(firstName: string, lastName: string): Promise<User | undefined>;
  createUser(userData: RegisterUser): Promise<User>;
  validatePassword(plainPassword: string, hashedPassword: string): Promise<boolean>;
  makeUserAdmin(email: string): Promise<User | undefined>;
  lockUser(userId: string): Promise<User | undefined>;
  unlockUser(userId: string): Promise<User | undefined>;
  disableUser(userId: string): Promise<User | undefined>;
  enableUser(userId: string): Promise<User | undefined>;
  resetUserPassword(userId: string, newPassword: string): Promise<User | undefined>;
  updateUserRoles(userId: string, roles: { isAdmin?: boolean; isSuperAdmin?: boolean; isCustSuper?: boolean }): Promise<User | undefined>;
  updateUser(userId: string, updates: Partial<{
    email: string;
    failedLoginAttempts: number;
    lockedUntil: Date | null;
    emailVerified: boolean;
    emailVerificationToken: string | null;
    emailVerificationExpiry: Date | null;
  }>): Promise<User | undefined>;
  
  // Profile operations
  updateUserProfile(id: string, profileData: UpdateProfile): Promise<User | undefined>;
  updateUserAvatar(id: string, avatarData: UpdateAvatar): Promise<User | undefined>;
  updateUserLastActive(id: string): Promise<void>;
  getLeaderboard(limit?: number, organizationId?: string): Promise<LeaderBoardEntry[]>;
  getLeaderboardStats(organizationId?: string): Promise<{
    activePlayersThisMonth: number;
    totalGamesPlayed: number;
    activeCollections: number;
    averageWinRate: number;
  }>;
  upsertLeaderboardEntry(gamerName: string, data: Partial<LeaderBoardEntry>): Promise<LeaderBoardEntry>;
  updateLeaderboardRank(gamerName: string, rank: number): Promise<void>;
  
  // Player stats operations
  getPlayerStats(playerId: string): Promise<PlayerStats | undefined>;
  getAllPlayerStats(): Promise<PlayerStats[]>;
  getAllPlayerStatsWithUsers(): Promise<Array<PlayerStats & { user: User | null }>>;
  createPlayerStats(playerStats: InsertPlayerStats): Promise<PlayerStats>;
  updatePlayerStats(playerId: string, updates: Partial<InsertPlayerStats>): Promise<PlayerStats | undefined>;
  upsertPlayerStats(playerId: string, updates: Partial<InsertPlayerStats>): Promise<PlayerStats>;
  
  // Card collection operations (admin)
  getAllCardCollections(): Promise<CardCollection[]>;
  getCardCollections(): Promise<CardCollection[]>;
  getCardCollection(id: string): Promise<CardCollection | undefined>;
  createCardCollection(collection: InsertCardCollection): Promise<CardCollection>;
  updateCardCollection(id: string, collection: Partial<InsertCardCollection>): Promise<CardCollection | undefined>;
  updateCollectionImageKey(id: string, imageKey: string | null): Promise<CardCollection | undefined>;
  deleteCardCollection(id: string): Promise<boolean>;
  
  // Collection stat types (admin)
  getCollectionStatTypes(collectionId: string): Promise<CollectionStatType[]>;
  createCollectionStatType(statType: InsertCollectionStatType): Promise<CollectionStatType>;
  updateCollectionStatType(id: string, statType: Partial<InsertCollectionStatType>): Promise<CollectionStatType | undefined>;
  deleteCollectionStatType(id: string): Promise<boolean>;
  
  // Card operations (admin)
  getCardsByCollection(collectionId: string): Promise<Card[]>;
  getCardsWithStats(collectionId: string): Promise<any[]>;
  getCard(id: string): Promise<Card | undefined>;
  createCard(card: InsertCard): Promise<Card>;
  updateCard(id: string, card: Partial<InsertCard>): Promise<Card | undefined>;
  updateCardImageKey(id: string, imageKey: string | null): Promise<Card | undefined>;
  deleteCard(id: string): Promise<boolean>;
  
  // Card stats (admin)
  getCardStats(cardId: string): Promise<CardStat[]>;
  createCardStat(cardStat: InsertCardStat): Promise<CardStat>;
  updateCardStat(id: string, cardStat: Partial<InsertCardStat>): Promise<CardStat | undefined>;
  upsertCardStats(cardId: string, stats: Array<{statTypeId: string, value: string}>): Promise<CardStat[]>;
  deleteCardStat(id: string): Promise<boolean>;
  
  // Game results
  createGameResult(gameResult: InsertGameResult): Promise<GameResult>;
  getGameResultsByUser(userId: string): Promise<GameResult[]>;
  getPlayerGameHistory(userId: string, limit?: number, timeframe?: 'today' | 'week' | 'month' | 'all'): Promise<Array<{
    id: string;
    collectionId: string;
    collectionName: string;
    collectionImageKey: string | null;
    winnerId: string | null;
    gameMode: string;
    playerIds: string[];
    playerNames: string[];
    opponents: Array<{ id: string; name: string }>;
    totalRounds: number;
    gameDuration: number | null;
    isMultiplayer: boolean;
    gameStartedAt: Date;
    gameEndedAt: Date;
    result: 'win' | 'loss' | 'tie';
    xpChange?: number;
    finalCardCounts: Record<string, number>;
  }>>;
  
  // Game rooms and sessions
  createGameRoom(gameRoom: InsertGameRoom): Promise<GameRoom>;
  getGameRoom(id: string): Promise<GameRoom | undefined>;
  updateGameRoom(id: string, updates: Partial<InsertGameRoom>): Promise<GameRoom | undefined>;
  getActiveGameRooms(): Promise<GameRoom[]>;
  cleanupAbandonedGameRooms(): Promise<number>;
  cleanupFinishedGameRooms(): Promise<number>;
  cleanupOrphanedPlayerSessions(): Promise<number>;
  cleanupOldPlayerSessions(): Promise<number>;
  
  // Player sessions
  createPlayerSession(session: InsertPlayerSession): Promise<PlayerSession>;
  getPlayerSessions(gameRoomId: string): Promise<PlayerSession[]>;
  updatePlayerSession(id: string, updates: Partial<InsertPlayerSession>): Promise<PlayerSession | undefined>;
  
  // Game-specific queries
  getCardsForCollection(collectionId: string): Promise<Card[]>;
  getCollectionStatType(id: string): Promise<CollectionStatType | undefined>;
  getCardStat(cardId: string, statTypeId: string): Promise<CardStat | undefined>;
  
  // Dashboard stats
  getDashboardStats(): Promise<{
    totalCollections: number;
    activeCollections: number;
    totalCards: number;
    totalUsers: number;
    activePlayersNow: number;
    activePlayers7Days: number;
    activePlayers30Days: number;
    newUsersThisMonth: number;
    totalGamesToday: number;
    totalGamesThisWeek: number;
    averageGameDuration: number;
    averageRoundsPerGame: number;
    playerEngagementRate: number;
    topPlayers: Array<{
      id: string;
      gamerName: string;
      totalWins: number;
      winPercentage: string;
      totalGames: number;
    }>;
    topCollections: Array<{
      id: string;
      name: string;
      gamesPlayed: number;
      popularity: number;
    }>;
    gamesPerDayTrend: Array<{
      date: string;
      games: number;
    }>;
  }>;

  // Guest session management
  getOrCreateGuestSession(sessionId: string): Promise<GuestSession>;
  updateGuestSessionActivity(sessionId: string): Promise<void>;
  getGuestSession(sessionId: string): Promise<GuestSession | undefined>;
  cleanupExpiredGuestSessions(): Promise<number>;
  cleanupAbandonedGames(): Promise<number>;

  // Active 1v1 game management
  createActiveOneVOneGame(gameData: InsertActiveOneVOneGame): Promise<ActiveOneVOneGame>;
  getActiveOneVOneGame(gameId: string): Promise<ActiveOneVOneGame | undefined>;
  updateActiveOneVOneGame(gameId: string, updates: Partial<InsertActiveOneVOneGame>): Promise<ActiveOneVOneGame | undefined>;
  deleteActiveOneVOneGame(gameId: string): Promise<boolean>;
  updateGameActivity(gameId: string): Promise<void>;
  cleanupExpiredGames(): Promise<number>;
  getActiveGamesByPlayer(playerId: string): Promise<ActiveOneVOneGame[]>;
  getAllActiveOneVOneGames(): Promise<ActiveOneVOneGame[]>;
  
  // Enhanced game validation and atomic operations
  isPlayerInActiveGame(playerId: string): Promise<{ inGame: boolean, gameType?: string, gameId?: string }>;
  atomicJoinGameRoom(gameRoomId: string, playerId: string, playerName: string): Promise<{
    success: boolean;
    error?: string;
    playerSession?: PlayerSession;
    newPlayerCount?: number;
    gameRoom?: GameRoom;
  }>;
  
  // Admin operations
  clearAllData(): Promise<void>;
  
  // Organization management
  createOrganization(org: InsertOrganization): Promise<Organization>;
  getAllOrganizations(): Promise<Organization[]>;
  getOrganization(id: string): Promise<Organization | undefined>;
  updateOrganization(id: string, updates: Partial<InsertOrganization>): Promise<Organization | undefined>;
  deleteOrganization(id: string): Promise<boolean>;
  getOrganizationByInviteCode(inviteCode: string): Promise<Organization | undefined>;
  
  // Organization units (grades/departments)
  createOrganizationUnit(unit: any): Promise<any>;
  getOrganizationUnits(organizationId: string): Promise<any[]>;
  getOrganizationUnit(id: string): Promise<any | undefined>;
  getOrganizationUnitByJoinCode(joinCode: string): Promise<any | undefined>;
  updateOrganizationUnit(id: string, updates: any): Promise<any | undefined>;
  deleteOrganizationUnit(id: string): Promise<boolean>;
  
  // Organization sub-units (classes/sub-departments) - Level 2
  createOrganizationSubUnit(subUnit: any): Promise<any>;
  getOrganizationSubUnits(unitId: string): Promise<any[]>;
  getAllOrganizationSubUnits(organizationId: string): Promise<any[]>;
  getOrganizationSubUnit(id: string): Promise<any | undefined>;
  getOrganizationSubUnitByJoinCode(joinCode: string): Promise<any | undefined>;
  updateOrganizationSubUnit(id: string, updates: any): Promise<any | undefined>;
  deleteOrganizationSubUnit(id: string): Promise<boolean>;
  
  // Organization teams (sections/teams) - Level 3
  createOrganizationTeam(team: InsertOrganizationTeam): Promise<OrganizationTeam>;
  getOrganizationTeams(subUnitId: string): Promise<OrganizationTeam[]>;
  getAllOrganizationTeams(organizationId: string): Promise<OrganizationTeam[]>;
  getOrganizationTeam(id: string): Promise<OrganizationTeam | undefined>;
  getOrganizationTeamByJoinCode(joinCode: string): Promise<OrganizationTeam | undefined>;
  updateOrganizationTeam(id: string, updates: Partial<InsertOrganizationTeam>): Promise<OrganizationTeam | undefined>;
  deleteOrganizationTeam(id: string): Promise<boolean>;
  reorderOrganizationTeams(teamIds: string[]): Promise<boolean>;
  
  // User organization roles
  assignUserRole(userId: string, organizationId: string, role: string): Promise<any>;
  getUserRoles(userId: string, organizationId?: string): Promise<any[]>;
  getUserRole(id: string): Promise<any | undefined>;
  getUserOrganizationAssignments(userId: string, organizationId?: string): Promise<any[]>;
  updateUserRole(id: string, role: string): Promise<any | undefined>;
  removeUserRole(id: string): Promise<boolean>;
  removeAllUserRolesInOrg(userId: string, organizationId: string): Promise<boolean>;
  getUsersByRole(organizationId: string, role: string): Promise<any[]>;
  getOrganizationUsers(organizationId: string): Promise<any[]>;
  getAllStudentsAcrossOrganizations(): Promise<any[]>;
  
  // User organization assignments (3-level hierarchy)
  assignUserToUnit(userId: string, organizationId: string, unitId: string, subUnitId?: string, teamId?: string, subjectId?: string): Promise<any>;
  assignSubjectsToUser(userId: string, organizationId: string, unitId: string, subUnitId: string | undefined, subjectIds: string[]): Promise<any[]>;
  getUserAssignments(userId: string, organizationId?: string): Promise<any[]>;
  getUserAssignment(id: string): Promise<any | undefined>;
  getOrganizationSubjectAssignments(organizationId: string): Promise<Map<string, string[]>>;
  removeUserAssignment(id: string): Promise<boolean>;
  removeAllUserAssignmentsInOrg(userId: string, organizationId: string): Promise<boolean>;
  getUsersInUnit(unitId: string, subUnitId?: string): Promise<any[]>;
  getOrganizationAssignments(organizationId: string): Promise<any[]>;
  getOrganizationQuizAssignments(organizationId: string): Promise<any[]>;
  
  // Join requests
  createJoinRequest(joinRequest: InsertJoinRequest): Promise<JoinRequest>;
  getJoinRequest(id: string): Promise<JoinRequest | undefined>;
  getJoinRequestByUserId(userId: string): Promise<JoinRequest | undefined>;
  getJoinRequestsByOrganization(organizationId: string, status?: string): Promise<JoinRequest[]>;
  getPendingJoinRequestCount(organizationId: string): Promise<number>;
  approveJoinRequest(id: string, reviewedBy: string, assignments: { unitId?: string; subUnitId?: string; teamId?: string; subjectIds?: string[] }, approvalMethod?: string): Promise<JoinRequest | undefined>;
  denyJoinRequest(id: string, reviewedBy: string, denialReason: string): Promise<JoinRequest | undefined>;
  updateJoinRequest(id: string, updates: Partial<InsertJoinRequest>): Promise<JoinRequest | undefined>;
  autoApproveDemoJoin(userId: string, organizationId: string, unitId?: string, subUnitId?: string, subjectIds?: string[], teamId?: string): Promise<JoinRequest>;
  getJoinRequestAuditLog(organizationId: string, filters?: {
    unitId?: string;
    subjectId?: string;
    studentName?: string;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
  }): Promise<any[]>;
  
  // Subjects
  createSubject(subject: InsertSubject): Promise<Subject>;
  getSubjects(organizationId: string, unitId?: string): Promise<Subject[]>;
  getSubject(id: string): Promise<Subject | undefined>;
  updateSubject(id: string, updates: Partial<InsertSubject>): Promise<Subject | undefined>;
  deleteSubject(id: string): Promise<boolean>;
  
  // Organization usage limits and trial management
  getOrganizationUsageLimits(organizationId: string): Promise<any | undefined>;
  incrementDailyQuizCount(organizationId: string): Promise<any>;
  incrementAIExplanationCount(organizationId: string): Promise<any>;
  updateConcurrentUsers(organizationId: string, count: number): Promise<any>;
  resetDailyLimits(organizationId: string): Promise<any>;
  checkTrialStatus(organizationId: string): Promise<{ isTrialActive: boolean; daysRemaining: number; trialEndDate: Date | null }>;
  
  // Quiz collections
  createQuizCollection(collection: any): Promise<any>;
  getQuizCollections(organizationId?: string): Promise<any[]>;
  getQuizCollection(id: string): Promise<any | undefined>;
  updateQuizCollection(id: string, updates: any): Promise<any | undefined>;
  updateQuizCollectionTotalCards(id: string, totalCards: number): Promise<void>;
  deleteQuizCollection(id: string): Promise<boolean>;
  getQuizCollectionsForUser(userId: string): Promise<any[]>;
  getQuizCollectionsForUserAccess(userId: string, organizationId?: string): Promise<any[]>;
  getQuizCollectionsByOrganization(organizationId: string): Promise<any[]>;
  
  // Quiz cards
  createQuizCard(card: any): Promise<any>;
  getQuizCards(collectionId: string): Promise<any[]>;
  getQuizCard(id: string): Promise<any | undefined>;
  updateQuizCard(id: string, updates: any): Promise<any | undefined>;
  deleteQuizCard(id: string): Promise<boolean>;
  
  // Quiz collection assignments
  assignQuizCollection(collectionId: string, unitId?: string, subUnitId?: string, requiredPassPercentage?: number, subjectId?: string, availableFrom?: string | null, availableTo?: string | null): Promise<any>;
  getQuizCollectionAssignments(collectionId: string): Promise<any[]>;
  getQuizCollectionAssignment(id: string): Promise<any | undefined>;
  removeQuizCollectionAssignment(id: string): Promise<boolean>;
  updateQuizAssignmentAvailability(id: string, availableFrom: string | null, availableTo: string | null): Promise<boolean>;
  
  // Active quiz games
  createActiveQuizGame(gameData: any): Promise<any>;
  getActiveQuizGame(gameId: string): Promise<any | undefined>;
  updateActiveQuizGame(gameId: string, updates: any): Promise<any | undefined>;
  deleteActiveQuizGame(gameId: string): Promise<boolean>;
  
  // Quiz game progress and results
  upsertQuizGameProgress(userId: string, collectionId: string, updates: any, orgMeta?: { organizationId?: string; unitId?: string; subUnitId?: string }): Promise<any>;
  getQuizGameProgress(userId: string, collectionId: string): Promise<any | undefined>;
  createQuizGameResult(result: any): Promise<any>;
  getQuizGameResults(userId: string, collectionId?: string): Promise<any[]>;
  getQuizLeaderboard(filters: { organizationId?: string; unitId?: string; subUnitId?: string; subjectId?: string; days?: number; limit?: number; collectionType?: 'public' | 'organization' }): Promise<any[]>;
  
  // User quiz progress (completion tracking)
  upsertUserQuizProgress(userId: string, collectionId: string, data: {
    attempts: number;
    lastScore: number;
    bestScore: number;
    lastPercentage: number;
    bestPercentage: number;
    completionStatus: 'outstanding' | 'completed_passed' | 'completed_failed';
  }, orgMeta?: { organizationId?: string; unitId?: string; subUnitId?: string }): Promise<any>;
  getUserQuizProgress(userId: string, collectionId: string): Promise<any | undefined>;
  getUserAllQuizProgress(userId: string): Promise<any[]>;
  
  // Reporting
  getStudentPerformanceByCollection(userId: string, orgId: string): Promise<any[]>;
  getUnitPerformanceSummary(unitId: string, orgId: string): Promise<any>;
  getOrganizationPerformanceSummary(orgId: string): Promise<any>;
  getStudentDetailedResults(userId: string, orgId: string, collectionId?: string): Promise<any[]>;
  getTopPerformers(orgId: string, filters?: { 
    unitId?: string; 
    subjectId?: string; 
    studentId?: string;
    startDate?: Date; 
    endDate?: Date; 
    limit?: number 
  }): Promise<any[]>;
  getStudentAnalytics(studentId: string, organizationId: string, filters?: {
    unitId?: string;
    subjectId?: string;
  }): Promise<any>;
  
  // AI Configuration (SuperAdmin only)
  createAiConfig(config: InsertAiConfig): Promise<AiConfig>;
  getActiveAiConfig(): Promise<AiConfig | undefined>;
  getActiveAiConfigByPurpose(purpose: string): Promise<AiConfig | undefined>;
  getAllAiConfigs(): Promise<AiConfig[]>;
  getAiConfigById(id: string): Promise<AiConfig | undefined>;
  updateAiConfig(id: string, updates: Partial<InsertAiConfig>): Promise<AiConfig | undefined>;
  setActiveAiConfig(id: string): Promise<AiConfig | undefined>;
  deleteAiConfig(id: string): Promise<boolean>;
  
  // Quiz Drafts (with tenant isolation)
  createQuizDraft(draft: InsertQuizDraft): Promise<QuizDraft>;
  getQuizDrafts(organizationId: string, userId?: string): Promise<QuizDraft[]>;
  getQuizDraft(id: string, organizationId: string): Promise<QuizDraft | undefined>;
  updateQuizDraft(id: string, organizationId: string, updates: Partial<InsertQuizDraft>): Promise<QuizDraft | undefined>;
  deleteQuizDraft(id: string, organizationId: string): Promise<boolean>;
  
  // Sales Inquiries
  createSalesInquiry(inquiry: InsertSalesInquiry): Promise<SalesInquiry>;
  getAllSalesInquiries(filters?: {
    search?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<SalesInquiry[]>;
  getSalesInquiry(id: string): Promise<SalesInquiry | undefined>;
  updateSalesInquiryStatus(id: string, status: string, userId?: string): Promise<SalesInquiry | undefined>;
  getSuperAdmins(): Promise<{ id: string; email: string; gamerName: string; firstName: string | null; lastName: string | null }[]>;
  
  // Quiz Card Explanations
  getQuizCardExplanation(cardId: string): Promise<QuizCardExplanation | undefined>;
  createQuizCardExplanation(data: InsertQuizCardExplanation): Promise<QuizCardExplanation>;
  
  // Term Definitions
  getTermDefinition(term: string, subjectId?: string): Promise<TermDefinition | undefined>;
  getTermDefinitionById(id: string): Promise<TermDefinition | undefined>;
  createTermDefinition(data: InsertTermDefinition): Promise<TermDefinition>;
  
  // Explanation Terms (junction table)
  linkExplanationToTerms(explanationId: string, termIds: string[]): Promise<void>;
  getExplanationTerms(explanationId: string): Promise<TermDefinition[]>;
  
  // Gamification Admin Configuration
  // Economy Rules
  getGamificationEconomyRules(organizationId: string): Promise<GamificationEconomyRule[]>;
  upsertGamificationEconomyRule(rule: InsertGamificationEconomyRule): Promise<GamificationEconomyRule>;
  
  // Shop Pricing
  getShopItemPricing(organizationId: string): Promise<ShopItemPricing[]>;
  upsertShopItemPricing(pricing: InsertShopItemPricing): Promise<ShopItemPricing>;
  
  // Challenge Configuration
  getAdminChallengeConfigs(organizationId: string): Promise<AdminChallengeConfig[]>;
  createAdminChallengeConfig(config: InsertAdminChallengeConfig): Promise<AdminChallengeConfig>;
  updateAdminChallengeConfig(id: string, updates: Partial<InsertAdminChallengeConfig>): Promise<AdminChallengeConfig | undefined>;
  deleteAdminChallengeConfig(id: string): Promise<boolean>;
  
  // Season Pass Configuration
  getSeasonPassConfig(organizationId: string): Promise<SeasonPassConfig | undefined>;
  upsertSeasonPassConfig(config: InsertSeasonPassConfig): Promise<SeasonPassConfig>;
  
  // Season Pass Management (new methods for backend infrastructure)
  getSeasonPasses(organizationId?: string): Promise<SeasonPassConfig[]>;
  getSeasonPassById(id: string): Promise<SeasonPassConfig | undefined>;
  createSeasonPass(data: InsertSeasonPassConfig): Promise<SeasonPassConfig>;
  updateSeasonPass(id: string, data: Partial<InsertSeasonPassConfig>): Promise<SeasonPassConfig | undefined>;
  activateSeasonPass(id: string): Promise<SeasonPassConfig | undefined>;
  expireSeasonPass(id: string): Promise<SeasonPassConfig | undefined>;
  getActiveSeasonPass(organizationId?: string): Promise<SeasonPassConfig | undefined>;
  createPlayerSeasonReward(playerId: string, seasonConfigId: string, tier: number, isPremiumReward: boolean, rewardData: Partial<InsertPlayerSeasonReward>): Promise<PlayerSeasonReward>;
  
  // Coin Adjustments (manual balance management)
  getCoinAdjustments(userId: string): Promise<CoinAdjustment[]>;
  createCoinAdjustment(adjustment: InsertCoinAdjustment): Promise<CoinAdjustment>;
  getOrganizationCoinAdjustments(organizationId: string, limit?: number): Promise<CoinAdjustment[]>;
  
  // User Cosmetic Loadouts (equipped cosmetics tracking)
  getUserCosmeticLoadout(userId: string): Promise<UserCosmeticLoadout | undefined>;
  upsertUserCosmeticLoadout(loadout: InsertUserCosmeticLoadout): Promise<UserCosmeticLoadout>;
  
  // Season Pass Purchases (track premium pass ownership)
  getUserSeasonPassPurchases(userId: string): Promise<SeasonPassPurchase[]>;
  createSeasonPassPurchase(purchase: InsertSeasonPassPurchase): Promise<SeasonPassPurchase>;
  getUserActiveSeasonPass(userId: string, seasonPassConfigId: string): Promise<SeasonPassPurchase | undefined>;
  deactivateExpiredSeasonPasses(): Promise<number>;
  
  // License Feature Flag Management (Phase 5)
  getLicenseFlagOverrides(): Promise<any[]>;
  setLicenseFlagOverride(data: { flagKey: string; value: boolean; description: string | null; setBy: string; expiresAt: Date | null }): Promise<any>;
  removeLicenseFlagOverride(flagKey: string, removedBy: string): Promise<void>;
  emergencyDisableLicenseFeatures(userId: string, reason: string): Promise<void>;
  getLicenseFlagAuditLog(limit: number, flagKey?: string): Promise<any[]>;
  getLicenseRolloutOrganizations(): Promise<any[]>;
  addOrganizationToLicenseRollout(data: { organizationId: string; addedBy: string; notes: string | null }): Promise<any>;
  removeOrganizationFromLicenseRollout(organizationId: string, removedBy: string): Promise<void>;
  getLicenseRolloutBetaUsers(): Promise<any[]>;
  addUserToLicenseBeta(data: { userId: string; addedBy: string; notes: string | null }): Promise<any>;
  removeUserFromLicenseBeta(userId: string, removedBy: string): Promise<void>;
  
  // White-Label Branding System
  getBrandingThemeByOrgId(organizationId: string): Promise<BrandingTheme | undefined>;
  getActiveBrandingThemeByOrgId(organizationId: string): Promise<BrandingTheme | undefined>;
  getBrandingThemeByDomain(domain: string): Promise<BrandingTheme | undefined>;
  upsertBrandingTheme(theme: InsertBrandingTheme): Promise<BrandingTheme>;
  activateBrandingTheme(organizationId: string): Promise<BrandingTheme | undefined>;
  resetBrandingTheme(
    organizationId: string,
    options?: {
      presetTokens: Record<string, string>;
      presetId: string;
      themeModeIntent?: 'light' | 'dark';
      tokensLight?: Record<string, string> | null;
      tokensDark?: Record<string, string> | null;
    }
  ): Promise<BrandingTheme | undefined>;
  getOrganizationDomains(organizationId: string): Promise<OrganizationDomain[]>;
  addOrganizationDomain(domain: InsertOrganizationDomain): Promise<OrganizationDomain>;
  removeOrganizationDomain(domainId: string, organizationId: string): Promise<boolean>;
  verifyOrganizationDomain(domainId: string, organizationId: string): Promise<OrganizationDomain | undefined>;
  getOrganizationDomainByDomain(domain: string): Promise<OrganizationDomain | undefined>;
  toggleDomainActive(domainId: string, organizationId: string, isActive: boolean): Promise<OrganizationDomain | undefined>;
  
  // Platform Default Theme (orgId = null)
  getPlatformDefaultTheme(): Promise<BrandingTheme | undefined>;
  getActivePlatformDefaultTheme(): Promise<BrandingTheme | undefined>;
  upsertPlatformDefaultTheme(theme: Omit<InsertBrandingTheme, 'organizationId'>): Promise<BrandingTheme>;
  activatePlatformDefaultTheme(): Promise<BrandingTheme | undefined>;
  resetPlatformDefaultTheme(): Promise<boolean>;
}

// Define role groups based on semantic meaning across organization types
// Education orgs use: org_admin, teacher, student
// Business orgs use: org_admin, team_lead/instructor, employee/learner
export const LEARNER_ROLES = ['student', 'employee', 'learner'];  // Learners in both org types
export const INSTRUCTOR_ROLES = ['teacher', 'team_lead', 'instructor'];  // Instructors in supported org types
export const ADMIN_ROLES = ['org_admin'];  // Admins in both org types
export const ALL_STAFF_ROLES = ['teacher', 'team_lead', 'instructor', 'org_admin'];  // Instructors + admins

/**
 * Helper to validate organizationId is provided for org-scoped methods.
 * Throws a clear error if organizationId is missing/empty to prevent unscoped queries
 * that could leak data across organizations.
 */
function requireOrgId(organizationId: string | undefined | null, methodName: string): asserts organizationId is string {
  if (!organizationId || organizationId.trim() === '') {
    throw new Error(`[Storage] organizationId is required for ${methodName}`);
  }
}

const ECONOMY_ACTION_ALIASES: Record<string, string> = {
  quiz_pass: "quiz_win",
  game_win: "quiz_win",
  game_participation: "quiz_participation",
  game_loss: "quiz_participation",
  login_streak: "daily_login",
};

function normalizeEconomyActionType(actionType: string): string {
  return ECONOMY_ACTION_ALIASES[actionType] || actionType;
}

function dedupeEconomyRules(rules: GamificationEconomyRule[]): GamificationEconomyRule[] {
  const seen = new Set<string>();
  const normalized: GamificationEconomyRule[] = [];
  for (const rule of rules) {
    const canonical = normalizeEconomyActionType(rule.actionType);
    if (seen.has(canonical)) {
      continue;
    }
    seen.add(canonical);
    normalized.push({
      ...rule,
      actionType: canonical,
    });
  }
  return normalized;
}

export class DatabaseStorage implements IStorage {
  // User operations (required for auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getUserByGamerName(gamerName: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(ilike(users.gamerName, gamerName));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(ilike(users.email, email));
    return user;
  }

  async getUserByFirstLastName(firstName: string, lastName: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(
      and(ilike(users.firstName, firstName), ilike(users.lastName, lastName))
    );
    return user;
  }

  async createUser(userData: RegisterUser): Promise<User> {
    const hashedPassword = await bcrypt.hash(userData.password, 12);
    const [user] = await db
      .insert(users)
      .values({
        gamerName: userData.gamerName,
        email: userData.email,
        password: hashedPassword,
        firstName: userData.firstName,
        lastName: userData.lastName,
      })
      .returning();
    return user;
  }

  async validatePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  async makeUserAdmin(email: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ isAdmin: true })
      .where(eq(users.email, email))
      .returning();
    return user;
  }

  async lockUser(userId: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ isLocked: true, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async unlockUser(userId: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ isLocked: false, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async disableUser(userId: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ isDisabled: true, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async enableUser(userId: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ isDisabled: false, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async resetUserPassword(userId: string, newPassword: string): Promise<User | undefined> {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const [user] = await db
      .update(users)
      .set({ 
        password: hashedPassword, 
        passwordResetToken: null,
        passwordResetExpires: null,
        updatedAt: new Date() 
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateUserRoles(userId: string, roles: { isAdmin?: boolean; isSuperAdmin?: boolean; isCustSuper?: boolean }): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ 
        ...roles, 
        updatedAt: new Date() 
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateUser(userId: string, updates: Partial<{
    email: string;
    failedLoginAttempts: number;
    lockedUntil: Date | null;
    emailVerified: boolean;
    emailVerificationToken: string | null;
    emailVerificationExpiry: Date | null;
  }>): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  // Profile operations
  async updateUserProfile(id: string, profileData: UpdateProfile): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ 
        ...profileData, 
        updatedAt: new Date() 
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserAvatar(id: string, avatarData: UpdateAvatar): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ 
        avatarImageUrl: avatarData.avatarImageUrl,
        updatedAt: new Date() 
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserLastActive(id: string): Promise<void> {
    await db
      .update(users)
      .set({ lastActiveAt: new Date() })
      .where(eq(users.id, id));
  }

  async getLeaderboard(limit: number = 10, organizationId?: string): Promise<LeaderBoardEntry[]> {
    // Build the query based on organizationId filter
    let baseQuery;
    
    if (organizationId) {
      // Filter leaderboard entries by users who belong to the specified organization
      baseQuery = db
        .select({
          leaderboard: leaderBoard,
          totalCorrectAnswers: sql<number>`COALESCE(SUM(${quizGameProgress.totalCorrectAnswers}), 0)`,
          totalAnswers: sql<number>`COALESCE(SUM(${quizGameProgress.totalAnswers}), 0)`,
          totalQuizGames: sql<number>`COALESCE(SUM(${quizGameProgress.totalGamesPlayed}), 0)`,
          totalQuizWins: sql<number>`COALESCE(SUM(${quizGameProgress.totalGamesWon}), 0)`,
          currentXP: playerStats.currentXP,
        })
        .from(leaderBoard)
        .innerJoin(users, eq(leaderBoard.gamerName, users.gamerName))
        .innerJoin(userOrganizationRoles, eq(users.id, userOrganizationRoles.userId))
        .leftJoin(quizGameProgress, eq(users.id, quizGameProgress.userId))
        .leftJoin(playerStats, eq(users.id, playerStats.playerId))
        .where(eq(userOrganizationRoles.organizationId, organizationId))
        .groupBy(leaderBoard.id, playerStats.currentXP);
    } else {
      // No org filter - return all (only for superadmin with explicit cross-org)
      baseQuery = db
        .select({
          leaderboard: leaderBoard,
          totalCorrectAnswers: sql<number>`COALESCE(SUM(${quizGameProgress.totalCorrectAnswers}), 0)`,
          totalAnswers: sql<number>`COALESCE(SUM(${quizGameProgress.totalAnswers}), 0)`,
          totalQuizGames: sql<number>`COALESCE(SUM(${quizGameProgress.totalGamesPlayed}), 0)`,
          totalQuizWins: sql<number>`COALESCE(SUM(${quizGameProgress.totalGamesWon}), 0)`,
          currentXP: playerStats.currentXP,
        })
        .from(leaderBoard)
        .leftJoin(users, eq(leaderBoard.gamerName, users.gamerName))
        .leftJoin(quizGameProgress, eq(users.id, quizGameProgress.userId))
        .leftJoin(playerStats, eq(users.id, playerStats.playerId))
        .groupBy(leaderBoard.id, playerStats.currentXP);
    }
    
    const usersWithProgress = await baseQuery;

    // Calculate accuracy and sort
    const sortedLeaderboard = usersWithProgress
      .map(entry => ({
        ...entry.leaderboard,
        currentXP: entry.currentXP || 0,
        accuracy: entry.totalAnswers > 0 
          ? (entry.totalCorrectAnswers / entry.totalAnswers) * 100 
          : 0,
        totalQuizGames: entry.totalQuizGames,
        totalQuizWins: entry.totalQuizWins,
      }))
      .sort((a, b) => {
        // Primary: XP
        if (b.currentXP !== a.currentXP) return b.currentXP - a.currentXP;
        // Secondary: Accuracy (% of questions correct)
        if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
        // Tertiary: Number of games played
        if (b.totalQuizGames !== a.totalQuizGames) return b.totalQuizGames - a.totalQuizGames;
        // Quaternary: Total wins
        return b.totalQuizWins - a.totalQuizWins;
      })
      .slice(0, limit);

    // Return just the leaderboard entries (without extra fields)
    return sortedLeaderboard.map(({ currentXP, accuracy, totalQuizGames, totalQuizWins, ...entry }) => entry);
  }

  async upsertLeaderboardEntry(gamerName: string, data: Partial<LeaderBoardEntry>): Promise<LeaderBoardEntry> {
    // First try to update existing entry
    const [updatedEntry] = await db
      .update(leaderBoard)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(leaderBoard.gamerName, gamerName))
      .returning();

    if (updatedEntry) {
      return updatedEntry;
    }

    // If no existing entry, create a new one
    const [newEntry] = await db
      .insert(leaderBoard)
      .values({
        gamerName,
        avatarImageUrl: data.avatarImageUrl || null,
        country: data.country || null,
        playerTitle: data.playerTitle || "Rookie",
        rank: data.rank || 0,
        totalWins: data.totalWins || 0,
        totalGames: data.totalGames || 0,
        winPercentage: data.winPercentage || "0.00",
        bestWinStreak: data.bestWinStreak || 0,
        currentWinStreak: data.currentWinStreak || 0,
        averageGameDuration: data.averageGameDuration || 0,
        lastActiveAt: data.lastActiveAt || new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return newEntry;
  }

  async updateLeaderboardRank(gamerName: string, rank: number): Promise<void> {
    await db
      .update(leaderBoard)
      .set({ rank })
      .where(eq(leaderBoard.gamerName, gamerName));
  }

  // Card collection operations (admin)
  async getAllCardCollections(): Promise<CardCollection[]> {
    // OPTIMIZATION: Use correlated subquery to compute totalCards in ONE query
    // This keeps one row per collection, preventing inflated counts if downstream callers add joins
    return await db.select({
      id: cardCollections.id,
      name: cardCollections.name,
      description: cardCollections.description,
      imageKey: cardCollections.imageKey,
      isActive: cardCollections.isActive,
      createdAt: cardCollections.createdAt,
      totalCards: sql<number>`(SELECT COUNT(*) FROM ${cards} WHERE ${cards.collectionId} = ${cardCollections.id})`.as('totalCards')
    }).from(cardCollections);
  }

  async getCardCollections(): Promise<CardCollection[]> {
    // OPTIMIZATION: Use correlated subquery to compute totalCards in ONE query
    // This keeps one row per collection, preventing inflated counts if downstream callers add joins
    return await db.select({
      id: cardCollections.id,
      name: cardCollections.name,
      description: cardCollections.description,
      imageKey: cardCollections.imageKey,
      isActive: cardCollections.isActive,
      createdAt: cardCollections.createdAt,
      totalCards: sql<number>`(SELECT COUNT(*) FROM ${cards} WHERE ${cards.collectionId} = ${cardCollections.id})`.as('totalCards')
    }).from(cardCollections).where(sql`${cardCollections.isActive} IS TRUE`);
  }

  async getCardCollection(id: string): Promise<CardCollection | undefined> {
    const [collection] = await db.select().from(cardCollections).where(eq(cardCollections.id, id));
    return collection;
  }

  async createCardCollection(collection: InsertCardCollection): Promise<CardCollection> {
    // Remove totalCards from input as it should be calculated automatically
    const { totalCards, ...collectionData } = collection;
    const [newCollection] = await db.insert(cardCollections).values({
      ...collectionData,
      totalCards: 0 // Start with 0 cards, will be updated when cards are added
    }).returning();
    return newCollection;
  }

  async updateCardCollection(id: string, collection: Partial<InsertCardCollection>): Promise<CardCollection | undefined> {
    // Remove totalCards from updates as it should be calculated automatically
    const { totalCards, ...collectionData } = collection;
    const [updatedCollection] = await db
      .update(cardCollections)
      .set(collectionData)
      .where(eq(cardCollections.id, id))
      .returning();
    
    // Return collection with actual card count
    if (updatedCollection) {
      const cardCount = await db.select({ count: sql<number>`count(*)` })
        .from(cards)
        .where(eq(cards.collectionId, id));
      updatedCollection.totalCards = cardCount[0]?.count || 0;
    }
    
    return updatedCollection;
  }

  async updateCollectionImageKey(id: string, imageKey: string | null): Promise<CardCollection | undefined> {
    const [updatedCollection] = await db
      .update(cardCollections)
      .set({ imageKey })
      .where(eq(cardCollections.id, id))
      .returning();
    return updatedCollection;
  }

  async deleteCardCollection(id: string): Promise<boolean> {
    const result = await db.delete(cardCollections).where(eq(cardCollections.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Collection stat types
  async getCollectionStatTypes(collectionId: string): Promise<CollectionStatType[]> {
    return await db
      .select()
      .from(collectionStatTypes)
      .where(eq(collectionStatTypes.collectionId, collectionId))
      .orderBy(collectionStatTypes.displayOrder);
  }

  async createCollectionStatType(statType: InsertCollectionStatType): Promise<CollectionStatType> {
    const [newStatType] = await db.insert(collectionStatTypes).values(statType).returning();
    return newStatType;
  }

  async updateCollectionStatType(id: string, statType: Partial<InsertCollectionStatType>): Promise<CollectionStatType | undefined> {
    const [updatedStatType] = await db
      .update(collectionStatTypes)
      .set(statType)
      .where(eq(collectionStatTypes.id, id))
      .returning();
    return updatedStatType;
  }

  async deleteCollectionStatType(id: string): Promise<boolean> {
    const result = await db.delete(collectionStatTypes).where(eq(collectionStatTypes.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Universal stat units (predefined + custom)
  async getUniversalStatUnits(): Promise<UniversalStatUnit[]> {
    return await db
      .select()
      .from(universalStatUnits)
      .where(sql`${universalStatUnits.isActive} IS TRUE`)
      .orderBy(desc(universalStatUnits.isPredefined), universalStatUnits.category, universalStatUnits.unitName);
  }

  // Get custom stat units created by a specific user
  async getCustomStatUnitsByUser(userId: string): Promise<UniversalStatUnit[]> {
    return await db
      .select()
      .from(universalStatUnits)
      .where(and(eq(universalStatUnits.createdBy, userId), sql`${universalStatUnits.isActive} IS TRUE`))
      .orderBy(universalStatUnits.category, universalStatUnits.unitName);
  }

  async createUniversalStatUnit(unit: InsertUniversalStatUnit): Promise<UniversalStatUnit> {
    const [newUnit] = await db.insert(universalStatUnits).values(unit).returning();
    return newUnit;
  }

  async updateUniversalStatUnit(id: string, unit: Partial<InsertUniversalStatUnit>): Promise<UniversalStatUnit | undefined> {
    const [updatedUnit] = await db
      .update(universalStatUnits)
      .set(unit)
      .where(eq(universalStatUnits.id, id))
      .returning();
    return updatedUnit;
  }

  async deleteUniversalStatUnit(id: string): Promise<boolean> {
    const result = await db.delete(universalStatUnits).where(eq(universalStatUnits.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Card operations
  async getCardsByCollection(collectionId: string): Promise<Card[]> {
    return await db
      .select()
      .from(cards)
      .where(eq(cards.collectionId, collectionId))
      .orderBy(cards.displayOrder);
  }

  // Get cards with their stats for admin interface
  async getCardsWithStats(collectionId: string) {
    const cardsWithStats = await db
      .select({
        card: cards,
        statType: collectionStatTypes,
        stat: cardStats,
      })
      .from(cards)
      .leftJoin(cardStats, eq(cards.id, cardStats.cardId))
      .leftJoin(collectionStatTypes, eq(cardStats.statTypeId, collectionStatTypes.id))
      .where(eq(cards.collectionId, collectionId))
      .orderBy(cards.displayOrder, collectionStatTypes.displayOrder);

    // Group stats by card
    const cardMap = new Map();
    
    for (const row of cardsWithStats) {
      const cardId = row.card.id;
      
      if (!cardMap.has(cardId)) {
        cardMap.set(cardId, {
          id: row.card.id,
          collectionId: row.card.collectionId,
          name: row.card.name,
          imageKey: row.card.imageKey,
          displayOrder: row.card.displayOrder,
          createdAt: row.card.createdAt,
          stats: []
        });
      }
      
      // Add stat if it exists
      if (row.stat && row.statType) {
        cardMap.get(cardId).stats.push({
          id: row.stat.id,
          statTypeId: row.statType.id,
          statName: row.statType.statName,
          statUnit: row.statType.statUnit,
          value: row.stat.value,
          displayOrder: row.statType.displayOrder
        });
      }
    }
    
    return Array.from(cardMap.values());
  }

  async getCard(id: string): Promise<Card | undefined> {
    const [card] = await db.select().from(cards).where(eq(cards.id, id));
    return card;
  }

  async createCard(card: InsertCard): Promise<Card> {
    const [newCard] = await db.insert(cards).values(card).returning();
    return newCard;
  }

  async updateCard(id: string, card: Partial<InsertCard>): Promise<Card | undefined> {
    const [updatedCard] = await db
      .update(cards)
      .set(card)
      .where(eq(cards.id, id))
      .returning();
    return updatedCard;
  }

  async updateCardImageKey(id: string, imageKey: string | null): Promise<Card | undefined> {
    const [updatedCard] = await db
      .update(cards)
      .set({ imageKey })
      .where(eq(cards.id, id))
      .returning();
    return updatedCard;
  }

  async deleteCard(id: string): Promise<boolean> {
    const result = await db.delete(cards).where(eq(cards.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Card stats
  async getCardStats(cardId: string): Promise<CardStat[]> {
    return await db.select().from(cardStats).where(eq(cardStats.cardId, cardId));
  }

  async createCardStat(cardStat: InsertCardStat): Promise<CardStat> {
    const [newCardStat] = await db.insert(cardStats).values(cardStat).returning();
    return newCardStat;
  }

  async updateCardStat(id: string, cardStat: Partial<InsertCardStat>): Promise<CardStat | undefined> {
    const [updatedCardStat] = await db
      .update(cardStats)
      .set(cardStat)
      .where(eq(cardStats.id, id))
      .returning();
    return updatedCardStat;
  }

  async deleteCardStat(id: string): Promise<boolean> {
    const result = await db.delete(cardStats).where(eq(cardStats.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async upsertCardStats(cardId: string, stats: Array<{statTypeId: string, value: string}>): Promise<CardStat[]> {
    const results: CardStat[] = [];
    
    for (const stat of stats) {
      // Check if stat already exists
      const [existingStat] = await db
        .select()
        .from(cardStats)
        .where(and(
          eq(cardStats.cardId, cardId),
          eq(cardStats.statTypeId, stat.statTypeId)
        ));
      
      if (existingStat) {
        // Update existing stat
        const [updatedStat] = await db
          .update(cardStats)
          .set({ value: stat.value })
          .where(eq(cardStats.id, existingStat.id))
          .returning();
        results.push(updatedStat);
      } else {
        // Create new stat
        const [newStat] = await db
          .insert(cardStats)
          .values({
            cardId,
            statTypeId: stat.statTypeId,
            value: stat.value
          })
          .returning();
        results.push(newStat);
      }
    }
    
    return results;
  }

  // Game results
  async createGameResult(gameResult: InsertGameResult): Promise<GameResult> {
    const [newGameResult] = await db.insert(gameResults).values(gameResult).returning();
    return newGameResult;
  }

  async getGameResultsByUser(userId: string): Promise<GameResult[]> {
    return await db
      .select()
      .from(gameResults)
      .where(eq(gameResults.winnerId, userId));
  }

  async getPlayerGameHistory(userId: string, limit = 20, timeframe: 'today' | 'week' | 'month' | 'all' = 'all'): Promise<Array<{
    id: string;
    collectionId: string;
    collectionName: string;
    collectionImageKey: string | null;
    winnerId: string | null;
    gameMode: string;
    playerIds: string[];
    playerNames: string[];
    opponents: Array<{ id: string; name: string }>;
    totalRounds: number;
    gameDuration: number | null;
    isMultiplayer: boolean;
    gameStartedAt: Date;
    gameEndedAt: Date;
    result: 'win' | 'loss' | 'tie';
    xpChange?: number;
    finalCardCounts: Record<string, number>;
  }>> {
    // Calculate time filter based on timeframe
    let timeFilter: any = null;
    const now = new Date();
    
    switch (timeframe) {
      case 'today':
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        timeFilter = gte(gameResults.gameEndedAt, startOfDay);
        break;
      case 'week':
        const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        timeFilter = gte(gameResults.gameEndedAt, startOfWeek);
        break;
      case 'month':
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        timeFilter = gte(gameResults.gameEndedAt, startOfMonth);
        break;
      case 'all':
      default:
        timeFilter = null;
        break;
    }
    
    // First, get all games where the user participated (either as winner or in playerIds array)
    const games = await db
      .select({
        gameResult: gameResults,
        collection: cardCollections,
      })
      .from(gameResults)
      .innerJoin(cardCollections, eq(gameResults.collectionId, cardCollections.id))
      .where(
        and(
          or(
            eq(gameResults.winnerId, userId),
            sql`${userId} = ANY(${gameResults.playerIds})`
          ),
          timeFilter
        )
      )
      .orderBy(desc(gameResults.gameEndedAt))
      .limit(limit);

    // OPTIMIZATION: Collect all unique player IDs from all games first
    const allPlayerIdsSet = new Set<string>();
    games.forEach(game => {
      const playerIds = game.gameResult.playerIds || [];
      playerIds.forEach(id => allPlayerIdsSet.add(id));
    });

    // Batch-fetch all player names in ONE query (eliminates N+1)
    let playerUsersMap = new Map<string, string>(); // playerId -> gamerName
    if (allPlayerIdsSet.size > 0) {
      const playerUsers = await db
        .select({ id: users.id, gamerName: users.gamerName })
        .from(users)
        .where(inArray(users.id, Array.from(allPlayerIdsSet)));
      
      playerUsers.forEach(p => {
        playerUsersMap.set(p.id, p.gamerName);
      });
    }

    // Now enrich games using the pre-fetched player data (no more queries in loop)
    const enrichedGames = games.map((game) => {
        const { gameResult, collection } = game;
        
        // Map player IDs to names using the batch-fetched data
        const allPlayerIds = gameResult.playerIds || [];
        const playerNames = allPlayerIds.map(id => playerUsersMap.get(id) || 'Unknown Player');
        const opponents = allPlayerIds
          .filter(id => id !== userId)
          .map(id => ({ id, name: playerUsersMap.get(id) || 'Unknown Player' }));

        // Determine game result for this player
        let result: 'win' | 'loss' | 'tie';
        if (gameResult.winnerId === userId) {
          result = 'win';
        } else if (gameResult.winnerId === null) {
          result = 'tie';
        } else {
          result = 'loss';
        }

        // Extract XP change and final card counts for this player from stored playerXPChanges with enhanced null safety
        let xpChange: number | undefined;
        let finalCardCounts: Record<string, number> = {};
        
        try {
          if (gameResult.playerXPChanges && typeof gameResult.playerXPChanges === 'object') {
            const playerXPChanges = gameResult.playerXPChanges as PlayerXPChanges;
            const playerXPData = playerXPChanges[userId];
            if (playerXPData && typeof playerXPData === 'object' && typeof playerXPData.xpChange === 'number') {
              xpChange = playerXPData.xpChange;
            }
            
            // Extract final card counts for all players in this game
            for (const playerId of gameResult.playerIds || []) {
              const playerData = playerXPChanges[playerId];
              if (playerData && typeof playerData === 'object' && typeof playerData.finalCardCount === 'number') {
                finalCardCounts[playerId] = playerData.finalCardCount;
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to extract XP change and card counts for player ${userId} in game ${gameResult.id}:`, error);
          // Leave xpChange as undefined and finalCardCounts as empty object for malformed data
        }

        return {
          id: gameResult.id,
          collectionId: gameResult.collectionId,
          collectionName: collection.name,
          collectionImageKey: collection.imageKey,
          winnerId: gameResult.winnerId,
          gameMode: gameResult.gameMode,
          playerIds: gameResult.playerIds || [],
          playerNames,
          opponents,
          totalRounds: gameResult.totalRounds,
          gameDuration: gameResult.gameDuration,
          isMultiplayer: gameResult.isMultiplayer ?? true,
          gameStartedAt: gameResult.gameStartedAt!,
          gameEndedAt: gameResult.gameEndedAt!,
          result,
          xpChange, // Now retrieved from database instead of calculated on frontend
          finalCardCounts, // Final card counts for all players in this game
        };
      });

    return enrichedGames;
  }

  // Dashboard stats
  async getDashboardStats(): Promise<{
    totalCollections: number;
    activeCollections: number;
    totalCards: number;
    totalUsers: number;
    activePlayersNow: number;
    activePlayers7Days: number;
    activePlayers30Days: number;
    newUsersThisMonth: number;
    totalGamesToday: number;
    totalGamesThisWeek: number;
    averageGameDuration: number;
    averageRoundsPerGame: number;
    playerEngagementRate: number;
    topPlayers: Array<{
      id: string;
      gamerName: string;
      totalWins: number;
      winPercentage: string;
      totalGames: number;
    }>;
    topCollections: Array<{
      id: string;
      name: string;
      gamesPlayed: number;
      popularity: number;
    }>;
    gamesPerDayTrend: Array<{
      date: string;
      games: number;
    }>;
  }> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Basic counts
    const [collections, allUsers, allGames] = await Promise.all([
      db.select().from(cardCollections),
      db.select().from(users),
      db.select().from(gameResults)
    ]);

    const totalCollections = collections.length;
    const activeCollections = collections.filter(c => c.isActive).length;
    const totalCards = collections.reduce((sum, c) => sum + (c.totalCards || 0), 0);
    const totalUsers = allUsers.length;

    // Active players calculations
    const activePlayers7DaysResult = await db
      .selectDistinct({ winnerId: gameResults.winnerId })
      .from(gameResults)
      .where(gte(gameResults.gameEndedAt, sevenDaysAgo));

    const activePlayers30DaysResult = await db
      .selectDistinct({ winnerId: gameResults.winnerId })
      .from(gameResults)
      .where(gte(gameResults.gameEndedAt, thirtyDaysAgo));

    // Get all unique player IDs from games (winners and participants)
    const recentPlayerIds = new Set<string>();
    const allRecentGames = await db
      .select()
      .from(gameResults)
      .where(gte(gameResults.gameEndedAt, thirtyDaysAgo));

    allRecentGames.forEach(game => {
      if (game.winnerId) {
        recentPlayerIds.add(game.winnerId);
      }
      if (game.playerIds) {
        game.playerIds.forEach(id => {
          if (id) {
            recentPlayerIds.add(id);
          }
        });
      }
    });

    const activePlayers7Days = activePlayers7DaysResult.length;
    const activePlayers30Days = activePlayers30DaysResult.length;
    // Get real-time active players (currently playing games)
    const activePlayersNow = await this.getRealTimeActivePlayers();

    // New users this month
    const newUsersResult = await db
      .select()
      .from(users)
      .where(gte(users.createdAt, monthStart));
    const newUsersThisMonth = newUsersResult.length;

    // Games today and this week
    const gamesTodayResult = await db
      .select()
      .from(gameResults)
      .where(gte(gameResults.gameStartedAt, todayStart));
    const totalGamesToday = gamesTodayResult.length;

    const gamesThisWeekResult = await db
      .select()
      .from(gameResults)
      .where(gte(gameResults.gameStartedAt, weekStart));
    const totalGamesThisWeek = gamesThisWeekResult.length;

    // Average game duration and rounds per game
    const gameStatsResult = await db
      .select({
        avgDuration: avg(sql`EXTRACT(EPOCH FROM (${gameResults.gameEndedAt} - ${gameResults.gameStartedAt}))`),
        avgRounds: avg(gameResults.totalRounds)
      })
      .from(gameResults)
      .where(gte(gameResults.gameEndedAt, thirtyDaysAgo));

    const averageGameDuration = Math.round(Number(gameStatsResult[0]?.avgDuration || 0));
    const averageRoundsPerGame = Math.round(Number(gameStatsResult[0]?.avgRounds || 0));

    // Player engagement rate (% of users who played in last 30 days)
    const playerEngagementRate = totalUsers > 0 ? Math.round((activePlayersNow / totalUsers) * 100) : 0;

    // Top players (prioritize wins, then win percentage)
    const topPlayersData = await db
      .select({
        id: users.id,
        gamerName: users.gamerName,
        totalWins: users.totalWins,
        totalGames: users.totalGamesPlayed,
        winPercentage: users.winPercentage
      })
      .from(users)
      .where(gte(users.totalGamesPlayed, 1))
      .orderBy(desc(users.totalWins), desc(users.winPercentage))
      .limit(3);

    const topPlayers = topPlayersData.map(player => ({
      id: player.id,
      gamerName: player.gamerName,
      totalWins: player.totalWins || 0,
      winPercentage: player.winPercentage || "0.00",
      totalGames: player.totalGames || 0
    }));

    // Top collections by games played
    const collectionGamesResult = await db
      .select({
        collectionId: gameResults.collectionId,
        gamesCount: count(gameResults.id)
      })
      .from(gameResults)
      .where(gte(gameResults.gameEndedAt, thirtyDaysAgo))
      .groupBy(gameResults.collectionId)
      .orderBy(desc(count(gameResults.id)));

    const topCollections = await Promise.all(
      collectionGamesResult.slice(0, 5).map(async (result) => {
        const [collection] = await db
          .select()
          .from(cardCollections)
          .where(eq(cardCollections.id, result.collectionId));
        
        const totalGamesInPeriod = allRecentGames.length;
        const popularity = totalGamesInPeriod > 0 ? Math.round((Number(result.gamesCount) / totalGamesInPeriod) * 100) : 0;
        
        return {
          id: collection?.id || result.collectionId,
          name: collection?.name || "Unknown Collection",
          gamesPlayed: Number(result.gamesCount),
          popularity
        };
      })
    );

    // Games per day trend (last 7 days)
    const gamesPerDayTrend: Array<{ date: string; games: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      
      const dayGamesResult = await db
        .select()
        .from(gameResults)
        .where(and(
          gte(gameResults.gameStartedAt, dayStart),
          lte(gameResults.gameStartedAt, dayEnd)
        ));
      
      gamesPerDayTrend.push({
        date: dayStart.toISOString().split('T')[0],
        games: dayGamesResult.length
      });
    }

    return {
      totalCollections,
      activeCollections,
      totalCards,
      totalUsers,
      activePlayersNow,
      activePlayers7Days,
      activePlayers30Days,
      newUsersThisMonth,
      totalGamesToday,
      totalGamesThisWeek,
      averageGameDuration,
      averageRoundsPerGame,
      playerEngagementRate,
      topPlayers,
      topCollections,
      gamesPerDayTrend
    };
  }

  // Public leaderboard stats for leaderboard page - with org isolation
  async getLeaderboardStats(organizationId?: string): Promise<{
    activePlayersThisMonth: number;
    totalGamesPlayed: number;
    activeCollections: number;
    averageWinRate: number;
  }> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get org users if organizationId is provided, otherwise all users
    let orgUserIds: Set<string> | null = null;
    if (organizationId) {
      const orgRoles = await db
        .select({ userId: userOrganizationRoles.userId })
        .from(userOrganizationRoles)
        .where(eq(userOrganizationRoles.organizationId, organizationId));
      orgUserIds = new Set(orgRoles.map(r => r.userId));
    }

    // Get all recent games and users - filter by org if needed
    const [allUsers, allGames, collections] = await Promise.all([
      organizationId 
        ? db.select().from(users).innerJoin(userOrganizationRoles, and(eq(users.id, userOrganizationRoles.userId), eq(userOrganizationRoles.organizationId, organizationId)))
        : db.select().from(users),
      db.select().from(gameResults).where(gte(gameResults.gameEndedAt, thirtyDaysAgo)),
      organizationId 
        ? db.select().from(cardCollections).where(eq(cardCollections.organizationId, organizationId))
        : db.select().from(cardCollections)
    ]);

    // Active players in last 30 days (filtered by org if needed)
    const activePlayerIds = new Set<string>();
    allGames.forEach(game => {
      if (game.winnerId) {
        // If org filter is active, only count users in that org
        if (!orgUserIds || orgUserIds.has(game.winnerId)) {
          activePlayerIds.add(game.winnerId);
        }
      }
      if (game.playerIds) {
        game.playerIds.forEach(id => {
          if (id && (!orgUserIds || orgUserIds.has(id))) {
            activePlayerIds.add(id);
          }
        });
      }
    });
    const activePlayersThisMonth = activePlayerIds.size;

    // Total multiplayer games played ever (filtered by org if needed)
    let allMultiplayerGames;
    if (organizationId && orgUserIds) {
      allMultiplayerGames = await db
        .select()
        .from(gameResults)
        .where(eq(gameResults.gameMode, 'multiplayer'));
      // Filter games where at least one player is from the org
      allMultiplayerGames = allMultiplayerGames.filter(game => {
        if (game.playerIds) {
          return game.playerIds.some(id => id && orgUserIds!.has(id));
        }
        return game.winnerId && orgUserIds!.has(game.winnerId);
      });
    } else {
      allMultiplayerGames = await db
        .select()
        .from(gameResults)
        .where(eq(gameResults.gameMode, 'multiplayer'));
    }
    const totalGamesPlayed = allMultiplayerGames.length;

    // Active collections (already filtered above)
    const activeCollections = collections.filter(c => {
      // Access the cardCollections data - handle both join result and direct query
      const collection = (c as any).card_collections || c;
      return collection.isActive;
    }).length;

    // Calculate average win rate from users with games played (filtered by org if needed)
    const usersData = organizationId 
      ? allUsers.map((u: any) => u.users || u) 
      : allUsers;
    const usersWithGames = usersData.filter((user: any) => (user.totalGamesPlayed || 0) > 0);
    const totalWinRate = usersWithGames.reduce((sum: number, user: any) => {
      const winRate = parseFloat(user.winPercentage || "0");
      return sum + winRate;
    }, 0);
    const averageWinRate = usersWithGames.length > 0 ? 
      Math.round(totalWinRate / usersWithGames.length) : 0;

    return {
      activePlayersThisMonth,
      totalGamesPlayed,
      activeCollections,
      averageWinRate
    };
  }

  // Game rooms and sessions implementation
  async createGameRoom(gameRoom: InsertGameRoom): Promise<GameRoom> {
    const [room] = await db
      .insert(gameRooms)
      .values(gameRoom)
      .returning();
    return room;
  }

  async getGameRoom(id: string): Promise<GameRoom | undefined> {
    const [room] = await db
      .select()
      .from(gameRooms)
      .where(eq(gameRooms.id, id));
    return room;
  }

  async updateGameRoom(id: string, updates: Partial<InsertGameRoom>): Promise<GameRoom | undefined> {
    const [room] = await db
      .update(gameRooms)
      .set(updates)
      .where(eq(gameRooms.id, id))
      .returning();
    return room;
  }

  async getActiveGameRooms(): Promise<GameRoom[]> {
    // Clean up abandoned rooms and orphaned sessions before returning active ones
    await this.cleanupAbandonedGameRooms();
    await this.cleanupOrphanedPlayerSessions();
    
    return db
      .select()
      .from(gameRooms)
      .where(eq(gameRooms.gameState, "waiting"));
  }

  async cleanupAbandonedGameRooms(): Promise<number> {
    // Clean up rooms abandoned for more than 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    try {
      // Find abandoned rooms (waiting state for over 30 minutes)
      const abandonedRooms = await db
        .select()
        .from(gameRooms)
        .where(
          and(
            eq(gameRooms.gameState, "waiting"),
            lt(gameRooms.createdAt, thirtyMinutesAgo)
          )
        );

      if (abandonedRooms.length === 0) {
        return 0;
      }

      console.log(`Cleaning up ${abandonedRooms.length} abandoned game rooms`);

      // Delete player sessions for these rooms first (foreign key constraint)
      for (const room of abandonedRooms) {
        const deletedSessions = await db
          .delete(playerSessions)
          .where(eq(playerSessions.gameRoomId, room.id));
        console.log(`Deleted player sessions for room ${room.id}`);
      }

      // Delete the abandoned game rooms
      const deletedCount = await db
        .delete(gameRooms)
        .where(
          and(
            eq(gameRooms.gameState, "waiting"),
            lt(gameRooms.createdAt, thirtyMinutesAgo)
          )
        );

      console.log(`Successfully cleaned up ${abandonedRooms.length} abandoned game rooms and their player sessions`);
      return abandonedRooms.length;
    } catch (error) {
      console.error("Error cleaning up abandoned game rooms:", error);
      return 0;
    }
  }

  async cleanupFinishedGameRooms(): Promise<number> {
    // Clean up finished games older than 2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    
    try {
      // Find old finished rooms
      const oldFinishedRooms = await db
        .select()
        .from(gameRooms)
        .where(
          and(
            eq(gameRooms.gameState, "finished"),
            lt(gameRooms.gameEndedAt, twoHoursAgo)
          )
        );

      if (oldFinishedRooms.length === 0) {
        return 0;
      }

      console.log(`Cleaning up ${oldFinishedRooms.length} old finished game rooms`);

      // Delete player sessions for these rooms first (foreign key constraint)
      for (const room of oldFinishedRooms) {
        const deletedSessions = await db
          .delete(playerSessions)
          .where(eq(playerSessions.gameRoomId, room.id));
        console.log(`Deleted player sessions for finished room ${room.id}`);
      }

      // Delete the old finished game rooms
      await db
        .delete(gameRooms)
        .where(
          and(
            eq(gameRooms.gameState, "finished"),
            lt(gameRooms.gameEndedAt, twoHoursAgo)
          )
        );

      console.log(`Successfully cleaned up ${oldFinishedRooms.length} old finished game rooms and their player sessions`);
      return oldFinishedRooms.length;
    } catch (error) {
      console.error("Error cleaning up finished game rooms:", error);
      return 0;
    }
  }

  async cleanupOrphanedPlayerSessions(): Promise<number> {
    // Clean up player sessions that reference non-existent game rooms
    try {
      // Find orphaned player sessions (gameRoomId doesn't exist in gameRooms table)
      const orphanedSessions = await db
        .select({
          id: playerSessions.id,
          gameRoomId: playerSessions.gameRoomId,
          playerName: playerSessions.playerName,
          joinedAt: playerSessions.joinedAt
        })
        .from(playerSessions)
        .leftJoin(gameRooms, eq(playerSessions.gameRoomId, gameRooms.id))
        .where(sql`${gameRooms.id} IS NULL`);

      if (orphanedSessions.length === 0) {
        return 0;
      }

      console.log(`Found ${orphanedSessions.length} orphaned player sessions`);

      // Delete orphaned player sessions
      const orphanedIds = orphanedSessions.map(session => session.id);
      
      for (const sessionId of orphanedIds) {
        await db
          .delete(playerSessions)
          .where(eq(playerSessions.id, sessionId));
      }

      console.log(`Successfully cleaned up ${orphanedSessions.length} orphaned player sessions`);
      return orphanedSessions.length;
    } catch (error) {
      console.error("Error cleaning up orphaned player sessions:", error);
      return 0;
    }
  }

  async cleanupOldPlayerSessions(): Promise<number> {
    // Clean up player sessions older than 4 hours (beyond session timeout)
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    
    try {
      // Find old player sessions
      const oldSessions = await db
        .select()
        .from(playerSessions)
        .where(lt(playerSessions.joinedAt, fourHoursAgo));

      if (oldSessions.length === 0) {
        return 0;
      }

      console.log(`Cleaning up ${oldSessions.length} old player sessions (>4 hours)`);

      // Delete old player sessions
      const deletedCount = await db
        .delete(playerSessions)
        .where(lt(playerSessions.joinedAt, fourHoursAgo));

      console.log(`Successfully cleaned up ${oldSessions.length} old player sessions`);
      return oldSessions.length;
    } catch (error) {
      console.error("Error cleaning up old player sessions:", error);
      return 0;
    }
  }

  // Player sessions implementation
  async createPlayerSession(session: InsertPlayerSession): Promise<PlayerSession> {
    const [playerSession] = await db
      .insert(playerSessions)
      .values(session)
      .returning();
    return playerSession;
  }

  async getPlayerSessions(gameRoomId: string): Promise<PlayerSession[]> {
    return db
      .select()
      .from(playerSessions)
      .where(eq(playerSessions.gameRoomId, gameRoomId));
  }

  async updatePlayerSession(id: string, updates: Partial<InsertPlayerSession>): Promise<PlayerSession | undefined> {
    const [session] = await db
      .update(playerSessions)
      .set(updates)
      .where(eq(playerSessions.id, id))
      .returning();
    return session;
  }

  // Game-specific queries implementation
  async getCardsForCollection(collectionId: string): Promise<Card[]> {
    return db
      .select()
      .from(cards)
      .where(eq(cards.collectionId, collectionId));
  }

  async getCollectionStatType(id: string): Promise<CollectionStatType | undefined> {
    const [statType] = await db
      .select()
      .from(collectionStatTypes)
      .where(eq(collectionStatTypes.id, id));
    return statType;
  }

  async getCardStat(cardId: string, statTypeId: string): Promise<CardStat | undefined> {
    const [cardStat] = await db
      .select()
      .from(cardStats)
      .where(and(
        eq(cardStats.cardId, cardId),
        eq(cardStats.statTypeId, statTypeId)
      ));
    return cardStat;
  }

  // Guest session management
  async getOrCreateGuestSession(sessionId: string): Promise<GuestSession> {
    // First try to get existing session
    let [session] = await db
      .select()
      .from(guestSessions)
      .where(eq(guestSessions.sessionId, sessionId));

    if (session) {
      // Update last activity
      await this.updateGuestSessionActivity(sessionId);
      return session;
    }

    // Generate unique guest name with expanded pool
    const guestName = this.generateUniqueGuestName(sessionId);

    // Create new guest session with uniqueness retry logic
    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts) {
      try {
        [session] = await db
          .insert(guestSessions)
          .values({
            sessionId,
            guestName: attempts === 0 ? guestName : `${guestName}_${attempts}`,
          })
          .returning();
        
        return session;
      } catch (error) {
        // If unique constraint fails on guestName, try with suffix
        attempts++;
        if (attempts >= maxAttempts) {
          throw new Error(`Failed to create unique guest name after ${maxAttempts} attempts`);
        }
      }
    }

    throw new Error('Unexpected error in guest session creation');
  }

  private generateUniqueGuestName(sessionId: string): string {
    // Expanded guest name pool for better uniqueness
    const adjectives = [
      'Red', 'Blue', 'Green', 'Gold', 'Silver', 'Black', 'Purple', 'Orange', 'Pink', 'Yellow',
      'Crimson', 'Azure', 'Emerald', 'Bronze', 'Platinum', 'Violet', 'Amber', 'Coral', 'Teal', 'Cyan',
      'Fierce', 'Swift', 'Brave', 'Wise', 'Strong', 'Bold', 'Quick', 'Sharp', 'Silent', 'Mighty',
      'Noble', 'Wild', 'Free', 'Epic', 'Royal', 'Elite', 'Prime', 'Alpha', 'Ultra', 'Mega'
    ];
    
    const creatures = [
      'Dragon', 'Wolf', 'Eagle', 'Lion', 'Fox', 'Panther', 'Tiger', 'Bear', 'Hawk', 'Shark',
      'Phoenix', 'Griffin', 'Falcon', 'Viper', 'Cobra', 'Raven', 'Lynx', 'Jaguar', 'Puma', 'Cheetah',
      'Stallion', 'Mustang', 'Thunder', 'Lightning', 'Storm', 'Blaze', 'Frost', 'Shadow', 'Ghost', 'Spirit',
      'Warrior', 'Knight', 'Hunter', 'Ranger', 'Scout', 'Guardian', 'Champion', 'Hero', 'Legend', 'Master'
    ];

    // Use session ID hash to select names consistently
    const sessionHash = this.hashString(sessionId);
    const adjIndex = sessionHash % adjectives.length;
    const creatureIndex = Math.floor(sessionHash / adjectives.length) % creatures.length;
    
    // Add timestamp-based suffix for uniqueness
    const timestamp = Date.now().toString().slice(-4); // Last 4 digits of timestamp
    const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    
    return `Guest_${adjectives[adjIndex]}${creatures[creatureIndex]}_${timestamp}${randomSuffix}`;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  async updateGuestSessionActivity(sessionId: string): Promise<void> {
    await db
      .update(guestSessions)
      .set({ lastActiveAt: new Date() })
      .where(eq(guestSessions.sessionId, sessionId));
  }

  async getGuestSession(sessionId: string): Promise<GuestSession | undefined> {
    const [session] = await db
      .select()
      .from(guestSessions)
      .where(eq(guestSessions.sessionId, sessionId));
    return session;
  }

  async cleanupExpiredGuestSessions(): Promise<number> {
    // Remove guest sessions inactive for more than 24 hours
    const expiredThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await db
      .delete(guestSessions)
      .where(lt(guestSessions.lastActiveAt, expiredThreshold));
    return result.rowCount || 0;
  }

  // Active 1v1 game management
  async createActiveOneVOneGame(gameData: InsertActiveOneVOneGame): Promise<ActiveOneVOneGame> {
    const [game] = await db
      .insert(activeOneVOneGames)
      .values(gameData)
      .returning();
    return game;
  }

  async getActiveOneVOneGame(gameId: string): Promise<ActiveOneVOneGame | undefined> {
    const [game] = await db
      .select()
      .from(activeOneVOneGames)
      .where(eq(activeOneVOneGames.gameId, gameId));
    return game;
  }

  async updateActiveOneVOneGame(gameId: string, updates: Partial<InsertActiveOneVOneGame>): Promise<ActiveOneVOneGame | undefined> {
    const [game] = await db
      .update(activeOneVOneGames)
      .set({ ...updates, lastActivityAt: new Date() })
      .where(eq(activeOneVOneGames.gameId, gameId))
      .returning();
    return game;
  }

  async deleteActiveOneVOneGame(gameId: string): Promise<boolean> {
    const result = await db
      .delete(activeOneVOneGames)
      .where(eq(activeOneVOneGames.gameId, gameId));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async updateGameActivity(gameId: string): Promise<void> {
    await db
      .update(activeOneVOneGames)
      .set({ lastActivityAt: new Date() })
      .where(eq(activeOneVOneGames.gameId, gameId));
  }

  async cleanupExpiredGames(): Promise<number> {
    // Remove games inactive for more than 15 minutes (more aggressive cleanup)
    const expiredThreshold = new Date(Date.now() - 15 * 60 * 1000);
    const result = await db
      .delete(activeOneVOneGames)
      .where(lt(activeOneVOneGames.lastActivityAt, expiredThreshold));
    return result.rowCount || 0;
  }

  async cleanupAbandonedGames(): Promise<number> {
    // Remove games where both players likely disconnected (inactive for more than 5 minutes)
    const abandonedThreshold = new Date(Date.now() - 5 * 60 * 1000);
    const result = await db
      .delete(activeOneVOneGames)
      .where(
        and(
          lt(activeOneVOneGames.lastActivityAt, abandonedThreshold),
          eq(activeOneVOneGames.gamePhase, "playing")
        )
      );
    return result.rowCount || 0;
  }

  async getActiveGamesByPlayer(playerId: string): Promise<ActiveOneVOneGame[]> {
    return await db
      .select()
      .from(activeOneVOneGames)
      .where(
        sql`${activeOneVOneGames.player1Id} = ${playerId} OR ${activeOneVOneGames.player2Id} = ${playerId}`
      );
  }

  // Check if player is in ANY active game (both gameRooms and 1v1 games)
  async isPlayerInActiveGame(playerId: string): Promise<{ inGame: boolean, gameType?: string, gameId?: string }> {
    // Check regular game rooms (lobby-based games)
    const activeSessions = await db
      .select({ gameRoomId: playerSessions.gameRoomId })
      .from(playerSessions)
      .innerJoin(gameRooms, eq(playerSessions.gameRoomId, gameRooms.id))
      .where(
        and(
          eq(playerSessions.playerId, playerId),
          or(
            eq(gameRooms.gameState, "waiting"),
            eq(gameRooms.gameState, "playing")
          )
        )
      )
      .limit(1);

    if (activeSessions.length > 0) {
      return { inGame: true, gameType: "lobby", gameId: activeSessions[0].gameRoomId };
    }

    // Check 1v1 games
    const active1v1Games = await db
      .select({ gameId: activeOneVOneGames.gameId })
      .from(activeOneVOneGames)
      .where(
        and(
          sql`${activeOneVOneGames.player1Id} = ${playerId} OR ${activeOneVOneGames.player2Id} = ${playerId}`,
          or(
            eq(activeOneVOneGames.gamePhase, "waiting"),
            eq(activeOneVOneGames.gamePhase, "playing")
          )
        )
      )
      .limit(1);

    if (active1v1Games.length > 0) {
      return { inGame: true, gameType: "1v1", gameId: active1v1Games[0].gameId };
    }

    return { inGame: false };
  }

  // Atomic join operation to prevent race conditions
  async atomicJoinGameRoom(gameRoomId: string, playerId: string, playerName: string): Promise<{
    success: boolean;
    error?: string;
    playerSession?: PlayerSession;
    newPlayerCount?: number;
    gameRoom?: GameRoom;
  }> {
    // Use a transaction to ensure atomic operations
    const result = await db.transaction(async (tx) => {
      try {
        // 1. Check if player is already in any active game
        const playerInGame = await this.isPlayerInActiveGame(playerId);
        if (playerInGame.inGame) {
          return { 
            success: false, 
            error: `Already in active ${playerInGame.gameType} game: ${playerInGame.gameId}` 
          };
        }

        // 2. Get current game room with lock (select for update)
        const [gameRoom] = await tx
          .select()
          .from(gameRooms)
          .where(eq(gameRooms.id, gameRoomId))
          .for('update'); // Explicit row lock

        if (!gameRoom) {
          return { success: false, error: "Game room not found" };
        }

        // 3. Check if room is full
        if ((gameRoom.currentPlayers || 0) >= gameRoom.maxPlayers) {
          return { success: false, error: "Game lobby is full" };
        }

        // 4. Check if game already started
        if (gameRoom.gameState === 'playing') {
          return { success: false, error: "Game has already started" };
        }

        // 5. Check if player already in this specific game
        const existingSessions = await tx
          .select()
          .from(playerSessions)
          .where(
            and(
              eq(playerSessions.gameRoomId, gameRoomId),
              eq(playerSessions.playerId, playerId)
            )
          );

        if (existingSessions.length > 0) {
          return { success: false, error: "Already in this game" };
        }

        // 6. Create player session
        const [playerSession] = await tx
          .insert(playerSessions)
          .values({
            gameRoomId,
            playerId,
            playerName,
            playerPosition: gameRoom.currentPlayers || 0,
            cardStack: [],
            cardCount: 0,
            isActive: false,
            isNPC: false,
          })
          .returning();

        // 7. Update game room player count
        const newPlayerCount = (gameRoom.currentPlayers || 0) + 1;
        const [updatedRoom] = await tx
          .update(gameRooms)
          .set({ currentPlayers: newPlayerCount })
          .where(eq(gameRooms.id, gameRoomId))
          .returning();

        return {
          success: true,
          playerSession,
          newPlayerCount,
          gameRoom: updatedRoom
        };
      } catch (error) {
        console.error('Atomic join transaction error:', error);
        return { success: false, error: 'Failed to join game due to database error' };
      }
    });

    return result;
  }

  async getAllActiveOneVOneGames(): Promise<ActiveOneVOneGame[]> {
    return await db
      .select()
      .from(activeOneVOneGames);
  }

  // Player stats operations
  async getPlayerStats(playerId: string): Promise<PlayerStats | undefined> {
    const [stats] = await db
      .select()
      .from(playerStats)
      .where(eq(playerStats.playerId, playerId));
    return stats;
  }

  async getAllPlayerStats(): Promise<PlayerStats[]> {
    return await db
      .select()
      .from(playerStats)
      .orderBy(desc(playerStats.updatedAt));
  }

  async getAllPlayerStatsWithUsers(): Promise<Array<PlayerStats & { user: User | null }>> {
    const results = await db
      .select({
        playerStats: playerStats,
        user: users,
      })
      .from(playerStats)
      .leftJoin(users, eq(playerStats.playerId, users.id))
      .orderBy(desc(playerStats.updatedAt));
    
    return results.map(r => ({
      ...r.playerStats,
      user: r.user,
    }));
  }

  async createPlayerStats(playerStatsData: InsertPlayerStats): Promise<PlayerStats> {
    const [stats] = await db
      .insert(playerStats)
      .values(playerStatsData)
      .returning();
    return stats;
  }

  async updatePlayerStats(playerId: string, updates: Partial<InsertPlayerStats>): Promise<PlayerStats | undefined> {
    const [stats] = await db
      .update(playerStats)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(playerStats.playerId, playerId))
      .returning();
    return stats;
  }

  async upsertPlayerStats(playerId: string, updates: Partial<InsertPlayerStats>): Promise<PlayerStats> {
    // First try to get existing stats
    const existingStats = await this.getPlayerStats(playerId);
    
    if (existingStats) {
      // Update existing stats
      const updatedStats = await this.updatePlayerStats(playerId, updates);
      return updatedStats!;
    } else {
      // Create new stats record
      const user = await this.getUser(playerId);
      if (!user) {
        throw new Error(`User not found with ID: ${playerId}`);
      }
      
      const newStats = await this.createPlayerStats({
        playerId,
        gamerName: user.gamerName,
        ...updates,
      });
      return newStats;
    }
  }

  // Get count of players currently playing games (includes guests and registered users)
  async getRealTimeActivePlayers(): Promise<number> {
    const activePlayerIds = new Set<string>();

    try {
      // Get ALL players from active game rooms (status 'playing') - both registered and guests
      const activeGameRoomsSessions = await db
        .select({
          playerId: playerSessions.playerId,
          playerName: playerSessions.playerName,
          sessionId: playerSessions.id // Use session ID as unique identifier for guests
        })
        .from(playerSessions)
        .innerJoin(gameRooms, eq(playerSessions.gameRoomId, gameRooms.id))
        .where(eq(gameRooms.gameState, "playing"));

      // Add all players from active game rooms (registered users + guests)
      activeGameRoomsSessions.forEach(session => {
        if (session.playerId) {
          // Registered user - use their user ID
          activePlayerIds.add(`user_${session.playerId}`);
        } else {
          // Guest player - use their session ID as unique identifier
          activePlayerIds.add(`guest_${session.sessionId}`);
        }
      });

      // Get players from active 1v1 games (phase 'playing')
      const active1v1Games = await db
        .select({
          player1Id: activeOneVOneGames.player1Id,
          player2Id: activeOneVOneGames.player2Id,
          player1Name: activeOneVOneGames.player1Name,
          player2Name: activeOneVOneGames.player2Name
        })
        .from(activeOneVOneGames)
        .where(eq(activeOneVOneGames.gamePhase, "playing"));

      // Check if 1v1 game player IDs are guest sessions or user IDs
      const guestSessionIds = await db
        .select({ id: guestSessions.id })
        .from(guestSessions);
      
      const guestSessionIdSet = new Set(guestSessionIds.map(g => g.id));

      // Add player IDs from active 1v1 games
      active1v1Games.forEach(game => {
        // Player 1
        if (game.player1Id) {
          if (guestSessionIdSet.has(game.player1Id)) {
            // Guest player
            activePlayerIds.add(`guest_${game.player1Id}`);
          } else {
            // Registered user
            activePlayerIds.add(`user_${game.player1Id}`);
          }
        }
        
        // Player 2
        if (game.player2Id) {
          if (guestSessionIdSet.has(game.player2Id)) {
            // Guest player
            activePlayerIds.add(`guest_${game.player2Id}`);
          } else {
            // Registered user
            activePlayerIds.add(`user_${game.player2Id}`);
          }
        }
      });

      return activePlayerIds.size;
    } catch (error) {
      console.error('Error getting real-time active players:', error);
      return 0;
    }
  }

  // Get all users for admin dashboard (optimized: batch-fetch roles to avoid N+1 queries)
  async getAllUsersForAdmin(): Promise<Array<{
    id: string;
    gamerName: string;
    email: string;
    firstName?: string;
    lastName?: string;
    createdAt: Date;
    lastActiveAt: Date;
    totalGamesPlayed: number;
    country?: string;
    playerTitle?: string;
    isAdmin?: boolean;
    isSuperAdmin?: boolean;
    isCustSuper?: boolean;
    isLocked?: boolean;
    isDisabled?: boolean;
    organizationRoles?: Array<{
      roleId: string;
      organizationId: string;
      organizationName: string;
      role: string;
    }>;
  }>> {
    try {
      // Batch-fetch users and all organization roles in parallel to avoid N+1 queries
      const [rawUsers, allRoles] = await Promise.all([
        db
          .select({
            id: users.id,
            gamerName: users.gamerName,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
            createdAt: users.createdAt,
            lastActiveAt: users.lastActiveAt,
            totalGamesPlayed: users.totalGamesPlayed,
            country: users.country,
            playerTitle: users.playerTitle,
            isAdmin: users.isAdmin,
            isSuperAdmin: users.isSuperAdmin,
            isCustSuper: users.isCustSuper,
            isLocked: users.isLocked,
            isDisabled: users.isDisabled
          })
          .from(users)
          .orderBy(users.createdAt),
        db
          .select({
            userId: userOrganizationRoles.userId,
            roleId: userOrganizationRoles.id,
            organizationId: userOrganizationRoles.organizationId,
            organizationName: organizations.name,
            role: userOrganizationRoles.role
          })
          .from(userOrganizationRoles)
          .leftJoin(organizations, eq(userOrganizationRoles.organizationId, organizations.id))
      ]);
      
      // Build a lookup map: userId -> roles[]
      const rolesByUserId = new Map<string, Array<{
        roleId: string;
        organizationId: string;
        organizationName: string;
        role: string;
      }>>();
      
      for (const r of allRoles) {
        if (!rolesByUserId.has(r.userId)) {
          rolesByUserId.set(r.userId, []);
        }
        rolesByUserId.get(r.userId)!.push({
          roleId: r.roleId,
          organizationId: r.organizationId,
          organizationName: r.organizationName || 'Unknown',
          role: r.role
        });
      }
      
      // Map users with their roles from the lookup
      const allUsers = rawUsers.map((user) => ({
        id: user.id,
        gamerName: user.gamerName,
        email: user.email,
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        createdAt: user.createdAt || new Date(),
        lastActiveAt: user.lastActiveAt || new Date(),
        totalGamesPlayed: user.totalGamesPlayed || 0,
        country: user.country || undefined,
        playerTitle: user.playerTitle || undefined,
        isAdmin: user.isAdmin || false,
        isSuperAdmin: user.isSuperAdmin || false,
        isCustSuper: user.isCustSuper || false,
        isLocked: user.isLocked || false,
        isDisabled: user.isDisabled || false,
        organizationRoles: rolesByUserId.get(user.id) || []
      }));
      
      return allUsers;
    } catch (error) {
      console.error('Error getting all users for admin:', error);
      return [];
    }
  }

  // Admin operations - Clear game progress data (preserve users, collections and cards)
  async clearAllData(): Promise<void> {
    console.log('🗑️ Starting game progress clear (preserving users, collections and cards)...');
    
    try {
      // Clear only game-related tables in correct order to respect foreign key constraints
      // PRESERVE: users, cardCollections, collectionStatTypes, cards, cardStats (accounts and game content)
      // CLEAR: Game results, sessions, player stats (game progress only)
      
      console.log('Clearing playerSessions...');
      await db.delete(playerSessions);
      
      console.log('Clearing gameResults...');
      await db.delete(gameResults);
      
      console.log('Clearing gameRooms...');
      await db.delete(gameRooms);
      
      console.log('Clearing activeOneVOneGames...');
      await db.delete(activeOneVOneGames);
      
      console.log('Clearing playerStats...');
      await db.delete(playerStats);
      
      console.log('Clearing leaderBoard...');
      await db.delete(leaderBoard);
      
      console.log('Clearing guestSessions...');
      await db.delete(guestSessions);
      
      console.log('Clearing sessions...');
      await db.delete(sessions);
      
      console.log('✅ Player data cleared successfully (users, collections and cards preserved)');
    } catch (error) {
      console.error('❌ Error clearing player data:', error);
      throw error;
    }
  }
  
  // Organization management
  async createOrganization(org: InsertOrganization): Promise<Organization> {
    const orgAny = org as any;
    const orgValues = process.env.ONPREM_MODE === 'true'
      ? {
          ...org,
          isDemo: true,
          orgCreditWallet: orgAny.orgCreditWallet ?? 20000,
          useOrgCreditWallet: orgAny.useOrgCreditWallet ?? true,
          allowTeachersToSpendCredits: orgAny.allowTeachersToSpendCredits ?? true,
          trialCreditsAwarded: orgAny.trialCreditsAwarded ?? false,
        }
      : org;
    const [organization] = await db.insert(organizations).values(orgValues).returning();
    return organization;
  }
  
  async getAllOrganizations(): Promise<any[]> {
    // Get all organizations with user counts (total, active, disabled)
    const result = await db.execute(sql`
      SELECT 
        o.*,
        COALESCE(
          (SELECT COUNT(*)::int 
           FROM "joinRequests" jr 
           WHERE jr."organizationId" = o.id 
           AND jr.status = 'approved'),
          0
        ) as "studentCount",
        COALESCE(
          (SELECT COUNT(DISTINCT uor."userId")::int 
           FROM "userOrganizationRoles" uor 
           WHERE uor."organizationId" = o.id),
          0
        ) as "totalUsers",
        COALESCE(
          (SELECT COUNT(DISTINCT uor."userId")::int 
           FROM "userOrganizationRoles" uor 
           JOIN users u ON u.id = uor."userId"
           WHERE uor."organizationId" = o.id 
           AND (u."isDisabled" IS NULL OR u."isDisabled" = false)),
          0
        ) as "activeUsers",
        COALESCE(
          (SELECT COUNT(DISTINCT uor."userId")::int 
           FROM "userOrganizationRoles" uor 
           JOIN users u ON u.id = uor."userId"
           WHERE uor."organizationId" = o.id 
           AND u."isDisabled" = true),
          0
        ) as "disabledUsers"
      FROM organizations o
      ORDER BY o."createdAt" DESC
    `);
    
    return result.rows as any[];
  }
  
  async getOrganization(id: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    return org;
  }
  
  async updateOrganization(id: string, updates: Partial<InsertOrganization>): Promise<Organization | undefined> {
    const [org] = await db.update(organizations).set({ ...updates, updatedAt: new Date() }).where(eq(organizations.id, id)).returning();
    return org;
  }
  
  async deleteOrganization(id: string): Promise<boolean> {
    try {
      // Delete all related data in correct order (respecting foreign key constraints)
      // Start with most dependent tables first
      
      // 1. Delete quiz drafts
      await db.delete(quizDrafts).where(eq(quizDrafts.organizationId, id));
      
      // 2. Delete quiz game results and progress for this org's quizzes
      const orgQuizCollections = await db.select({ id: quizCollections.id })
        .from(quizCollections)
        .where(eq(quizCollections.organizationId, id));
      const orgQuizCollectionIds = orgQuizCollections.map(qc => qc.id);
      
      if (orgQuizCollectionIds.length > 0) {
        await db.delete(quizGameResults).where(inArray(quizGameResults.collectionId, orgQuizCollectionIds));
        await db.delete(quizGameProgress).where(inArray(quizGameProgress.collectionId, orgQuizCollectionIds));
        
        // Delete quiz cards
        await db.delete(quizCards).where(inArray(quizCards.collectionId, orgQuizCollectionIds));
        
        // Delete quiz collection assignments
        await db.delete(quizCollectionAssignments).where(inArray(quizCollectionAssignments.collectionId, orgQuizCollectionIds));
      }
      
      // 3. Delete quiz collections
      await db.delete(quizCollections).where(eq(quizCollections.organizationId, id));
      
      // 4. Delete join requests
      await db.delete(joinRequests).where(eq(joinRequests.organizationId, id));
      
      // 5. Delete user organization assignments
      await db.delete(userOrganizationAssignments).where(eq(userOrganizationAssignments.organizationId, id));
      
      // 6. Delete user organization roles
      await db.delete(userOrganizationRoles).where(eq(userOrganizationRoles.organizationId, id));
      
      // 7. Delete organization usage limits
      await db.delete(organizationUsageLimits).where(eq(organizationUsageLimits.organizationId, id));
      
      // 8. Delete unit-subject assignments (via units)
      const orgUnits = await db.select({ id: organizationUnits.id })
        .from(organizationUnits)
        .where(eq(organizationUnits.organizationId, id));
      const orgUnitIds = orgUnits.map(u => u.id);
      
      if (orgUnitIds.length > 0) {
        await db.delete(unitSubjects).where(inArray(unitSubjects.unitId, orgUnitIds));
      }
      
      // 9. Delete subjects
      await db.delete(subjects).where(eq(subjects.organizationId, id));
      
      // 10. Delete organization sub-units (they belong to units, not directly to org)
      if (orgUnitIds.length > 0) {
        await db.delete(organizationSubUnits).where(inArray(organizationSubUnits.unitId, orgUnitIds));
      }
      
      // 11. Delete organization units
      await db.delete(organizationUnits).where(eq(organizationUnits.organizationId, id));
      
      // 12. Finally, delete the organization itself
      await db.delete(organizations).where(eq(organizations.id, id));
      
      console.log(`✅ Successfully deleted organization ${id} and all related data`);
      return true;
    } catch (error) {
      console.error(`❌ Error deleting organization ${id}:`, error);
      throw error;
    }
  }
  
  async getOrganizationByInviteCode(inviteCode: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.inviteCode, inviteCode));
    return org;
  }
  
  // Organization units
  async createOrganizationUnit(unit: InsertOrganizationUnit): Promise<OrganizationUnit> {
    const [orgUnit] = await db.insert(organizationUnits).values(unit).returning();
    return orgUnit;
  }
  
  async getOrganizationUnits(organizationId: string): Promise<OrganizationUnit[]> {
    requireOrgId(organizationId, 'getOrganizationUnits');
    return await db.select().from(organizationUnits).where(eq(organizationUnits.organizationId, organizationId)).orderBy(organizationUnits.displayOrder);
  }
  
  async getOrganizationUnit(id: string): Promise<OrganizationUnit | undefined> {
    const [unit] = await db.select().from(organizationUnits).where(eq(organizationUnits.id, id));
    return unit;
  }
  
  async getOrganizationUnitByJoinCode(joinCode: string): Promise<OrganizationUnit | undefined> {
    const [unit] = await db.select().from(organizationUnits).where(eq(organizationUnits.joinCode, joinCode));
    return unit;
  }
  
  async updateOrganizationUnit(id: string, updates: Partial<InsertOrganizationUnit>): Promise<OrganizationUnit | undefined> {
    const [unit] = await db.update(organizationUnits).set(updates).where(eq(organizationUnits.id, id)).returning();
    return unit;
  }
  
  async deleteOrganizationUnit(id: string): Promise<boolean> {
    await db.delete(organizationUnits).where(eq(organizationUnits.id, id));
    return true;
  }
  
  // Organization sub-units
  async createOrganizationSubUnit(subUnit: InsertOrganizationSubUnit): Promise<OrganizationSubUnit> {
    const [orgSubUnit] = await db.insert(organizationSubUnits).values(subUnit).returning();
    return orgSubUnit;
  }
  
  async getOrganizationSubUnits(unitId: string): Promise<OrganizationSubUnit[]> {
    return await db.select().from(organizationSubUnits).where(eq(organizationSubUnits.unitId, unitId)).orderBy(organizationSubUnits.displayOrder);
  }
  
  async getAllOrganizationSubUnits(organizationId: string): Promise<OrganizationSubUnit[]> {
    requireOrgId(organizationId, 'getAllOrganizationSubUnits');
    return await db
      .select()
      .from(organizationSubUnits)
      .innerJoin(organizationUnits, eq(organizationSubUnits.unitId, organizationUnits.id))
      .where(eq(organizationUnits.organizationId, organizationId))
      .orderBy(organizationUnits.displayOrder, organizationSubUnits.displayOrder)
      .then(rows => rows.map(row => row.organizationSubUnits));
  }
  
  async getOrganizationSubUnit(id: string): Promise<OrganizationSubUnit | undefined> {
    const [subUnit] = await db.select().from(organizationSubUnits).where(eq(organizationSubUnits.id, id));
    return subUnit;
  }
  
  async getOrganizationSubUnitByJoinCode(joinCode: string): Promise<OrganizationSubUnit | undefined> {
    const [subUnit] = await db.select().from(organizationSubUnits).where(eq(organizationSubUnits.joinCode, joinCode));
    return subUnit;
  }
  
  async updateOrganizationSubUnit(id: string, updates: Partial<InsertOrganizationSubUnit>): Promise<OrganizationSubUnit | undefined> {
    const [subUnit] = await db.update(organizationSubUnits).set(updates).where(eq(organizationSubUnits.id, id)).returning();
    return subUnit;
  }
  
  async deleteOrganizationSubUnit(id: string): Promise<boolean> {
    // CASCADE cleanup: Delete dependent records to prevent orphaned data
    await db.transaction(async (tx) => {
      // 1. Delete user assignments for this subunit
      await tx.delete(userOrganizationAssignments).where(
        eq(userOrganizationAssignments.subUnitId, id)
      );

      // 2. Delete the subunit itself
      await tx.delete(organizationSubUnits).where(eq(organizationSubUnits.id, id));
    });

    console.log(`[CASCADE] Cleaned up dependent records for subunit ${id}`);
    return true;
  }
  
  // Organization teams (sections/teams) - Level 3
  async createOrganizationTeam(team: InsertOrganizationTeam): Promise<OrganizationTeam> {
    const [newTeam] = await db.insert(organizationTeams).values(team).returning();
    return newTeam;
  }
  
  async getOrganizationTeams(subUnitId: string): Promise<OrganizationTeam[]> {
    return await db.select().from(organizationTeams)
      .where(eq(organizationTeams.subUnitId, subUnitId))
      .orderBy(organizationTeams.displayOrder);
  }
  
  async getAllOrganizationTeams(organizationId: string): Promise<OrganizationTeam[]> {
    return await db.select({
      id: organizationTeams.id,
      subUnitId: organizationTeams.subUnitId,
      name: organizationTeams.name,
      displayOrder: organizationTeams.displayOrder,
      joinCode: organizationTeams.joinCode,
      isActive: organizationTeams.isActive,
      createdAt: organizationTeams.createdAt,
    })
      .from(organizationTeams)
      .innerJoin(organizationSubUnits, eq(organizationTeams.subUnitId, organizationSubUnits.id))
      .innerJoin(organizationUnits, eq(organizationSubUnits.unitId, organizationUnits.id))
      .where(eq(organizationUnits.organizationId, organizationId))
      .orderBy(organizationTeams.displayOrder);
  }
  
  async getOrganizationTeam(id: string): Promise<OrganizationTeam | undefined> {
    const [team] = await db.select().from(organizationTeams).where(eq(organizationTeams.id, id));
    return team;
  }
  
  async getOrganizationTeamByJoinCode(joinCode: string): Promise<OrganizationTeam | undefined> {
    const [team] = await db.select().from(organizationTeams).where(eq(organizationTeams.joinCode, joinCode));
    return team;
  }
  
  async updateOrganizationTeam(id: string, updates: Partial<InsertOrganizationTeam>): Promise<OrganizationTeam | undefined> {
    const [updated] = await db.update(organizationTeams).set(updates).where(eq(organizationTeams.id, id)).returning();
    return updated;
  }
  
  async deleteOrganizationTeam(id: string): Promise<boolean> {
    await db.transaction(async (tx) => {
      await tx.delete(userOrganizationAssignments).where(eq(userOrganizationAssignments.teamId, id));
      await tx.delete(organizationTeams).where(eq(organizationTeams.id, id));
    });
    console.log(`[CASCADE] Cleaned up dependent records for team ${id}`);
    return true;
  }
  
  async reorderOrganizationTeams(teamIds: string[]): Promise<boolean> {
    await db.transaction(async (tx) => {
      for (let i = 0; i < teamIds.length; i++) {
        await tx.update(organizationTeams)
          .set({ displayOrder: i })
          .where(eq(organizationTeams.id, teamIds[i]));
      }
    });
    return true;
  }
  
  // User organization roles
  async assignUserRole(userId: string, organizationId: string, role: string): Promise<UserOrganizationRole> {
    requireOrgId(organizationId, 'assignUserRole');
    const [existing] = await db
      .select()
      .from(userOrganizationRoles)
      .where(
        and(
          eq(userOrganizationRoles.userId, userId),
          eq(userOrganizationRoles.organizationId, organizationId),
          eq(userOrganizationRoles.role, role),
        ),
      )
      .limit(1);
    if (existing) {
      return existing;
    }
    await enforceOrgRolePolicy({ organizationId, role, targetUserId: userId });
    const [userRole] = await db.insert(userOrganizationRoles).values({ userId, organizationId, role }).returning();
    return userRole;
  }
  
  async getUserRoles(userId: string, organizationId?: string): Promise<UserOrganizationRole[]> {
    if (organizationId) {
      return await db.select().from(userOrganizationRoles).where(and(eq(userOrganizationRoles.userId, userId), eq(userOrganizationRoles.organizationId, organizationId)));
    }
    return await db.select().from(userOrganizationRoles).where(eq(userOrganizationRoles.userId, userId));
  }
  
  async getUserOrganizationAssignments(userId: string, organizationId?: string): Promise<UserOrganizationAssignment[]> {
    if (organizationId) {
      return await db.select().from(userOrganizationAssignments).where(and(eq(userOrganizationAssignments.userId, userId), eq(userOrganizationAssignments.organizationId, organizationId)));
    }
    return await db.select().from(userOrganizationAssignments).where(eq(userOrganizationAssignments.userId, userId));
  }
  
  async updateUserRole(id: string, role: string): Promise<UserOrganizationRole | undefined> {
    const [currentRole] = await db.select().from(userOrganizationRoles).where(eq(userOrganizationRoles.id, id)).limit(1);
    if (!currentRole) {
      return undefined;
    }
    if (currentRole.role !== role) {
      await enforceOrgRolePolicy({
        organizationId: currentRole.organizationId,
        role,
        targetUserId: currentRole.userId,
      });
    }
    const [userRole] = await db.update(userOrganizationRoles).set({ role }).where(eq(userOrganizationRoles.id, id)).returning();
    return userRole;
  }
  
  async getUserRole(id: string): Promise<UserOrganizationRole | undefined> {
    const [role] = await db.select().from(userOrganizationRoles).where(eq(userOrganizationRoles.id, id));
    return role;
  }
  
  async removeUserRole(id: string): Promise<boolean> {
    await db.delete(userOrganizationRoles).where(eq(userOrganizationRoles.id, id));
    return true;
  }

  async removeAllUserRolesInOrg(userId: string, organizationId: string): Promise<boolean> {
    await db.delete(userOrganizationRoles).where(and(eq(userOrganizationRoles.userId, userId), eq(userOrganizationRoles.organizationId, organizationId)));
    return true;
  }
  
  async getUsersByRole(organizationId: string, role: string): Promise<any[]> {
    requireOrgId(organizationId, 'getUsersByRole');
    return await db.select({
      id: users.id,
      userId: users.id,
      gamerName: users.gamerName,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      isLocked: users.isLocked,
      role: userOrganizationRoles.role,
      roleId: userOrganizationRoles.id
    }).from(userOrganizationRoles).innerJoin(users, eq(userOrganizationRoles.userId, users.id)).where(and(eq(userOrganizationRoles.organizationId, organizationId), eq(userOrganizationRoles.role, role)));
  }

  async getOrganizationUsers(organizationId: string): Promise<any[]> {
    requireOrgId(organizationId, 'getOrganizationUsers');
    const rows = await db.select({
      id: users.id,
      userId: users.id,
      gamerName: users.gamerName,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      isLocked: users.isLocked,
      role: userOrganizationRoles.role,
      roleId: userOrganizationRoles.id,
      organizationId: userOrganizationRoles.organizationId,
      unitId: userOrganizationAssignments.unitId,
      subUnitId: userOrganizationAssignments.subUnitId,
    })
    .from(userOrganizationRoles)
    .innerJoin(users, eq(userOrganizationRoles.userId, users.id))
    .leftJoin(userOrganizationAssignments, eq(userOrganizationAssignments.userId, users.id))
    .where(eq(userOrganizationRoles.organizationId, organizationId));
    
    // Group roles by user
    const userMap = new Map<string, any>();
    for (const row of rows) {
      if (!userMap.has(row.id)) {
        userMap.set(row.id, {
          id: row.id,
          gamerName: row.gamerName,
          email: row.email,
          firstName: row.firstName,
          lastName: row.lastName,
          isLocked: row.isLocked,
          unitId: row.unitId,
          subUnitId: row.subUnitId,
          organizationRoles: []
        });
      }
      userMap.get(row.id)!.organizationRoles.push({
        organizationId: row.organizationId,
        role: row.role,
        roleId: row.roleId
      });
    }
    
    return Array.from(userMap.values());
  }

  async getAllStudentsAcrossOrganizations(): Promise<any[]> {
    // Get all students across all organizations with their organization info
    const rows = await db.select({
      id: users.id,
      gamerName: users.gamerName,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      isLocked: users.isLocked,
      role: userOrganizationRoles.role,
      roleId: userOrganizationRoles.id,
      organizationId: userOrganizationRoles.organizationId,
      organizationName: organizations.name
    })
      .from(userOrganizationRoles)
      .innerJoin(users, eq(userOrganizationRoles.userId, users.id))
      .innerJoin(organizations, eq(userOrganizationRoles.organizationId, organizations.id))
      .where(inArray(userOrganizationRoles.role, LEARNER_ROLES));
    
    // Map to expected format (similar to getOrganizationUsers but with organizationName)
    return rows.map(row => ({
      user: {
        id: row.id,
        gamerName: row.gamerName,
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
        isLocked: row.isLocked
      },
      role: row.role,
      roleId: row.roleId,
      organizationName: row.organizationName
    }));
  }
  
  // User organization assignments (3-level hierarchy)
  async assignUserToUnit(userId: string, organizationId: string, unitId: string, subUnitId?: string, teamId?: string, subjectId?: string): Promise<UserOrganizationAssignment> {
    requireOrgId(organizationId, 'assignUserToUnit');
    // TRANSACTIONAL + IDEMPOTENT: Wrap delete+insert in transaction with unique constraint protection
    return await db.transaction(async (tx) => {
      // Delete ALL existing assignments for this user across ALL organizations
      // This ensures a user is only assigned to ONE organization at a time
      await tx.delete(userOrganizationAssignments)
        .where(eq(userOrganizationAssignments.userId, userId));
      
      // Create new assignment with ON CONFLICT DO NOTHING for idempotency
      const [assignment] = await tx.insert(userOrganizationAssignments)
        .values({ userId, organizationId, unitId, subUnitId, teamId, subjectId })
        .onConflictDoNothing()
        .returning();
      
      return assignment;
    });
  }
  
  async assignSubjectsToUser(userId: string, organizationId: string, unitId: string, subUnitId: string | undefined, subjectIds: string[]): Promise<UserOrganizationAssignment[]> {
    requireOrgId(organizationId, 'assignSubjectsToUser');
    // DEDUPLICATE incoming subject IDs to prevent duplicates
    const uniqueSubjectIds = Array.from(new Set(subjectIds));
    
    // Validate that each subject exists in unitSubjects for this unit
    // This prevents orphaned assignments where students are assigned to subjects
    // that aren't linked to their grade in the unitSubjects table
    if (uniqueSubjectIds.length > 0) {
      const validSubjects = await db.select()
        .from(unitSubjects)
        .where(
          and(
            eq(unitSubjects.unitId, unitId),
            sql`${unitSubjects.subjectId} IN (${sql.join(uniqueSubjectIds.map(id => sql`${id}`), sql`, `)})`
          )
        );
      
      if (validSubjects.length !== uniqueSubjectIds.length) {
        const validSubjectIds = validSubjects.map(s => s.subjectId);
        const invalidSubjectIds = uniqueSubjectIds.filter(id => !validSubjectIds.includes(id));
        throw new Error(`Invalid subject assignment: subjects [${invalidSubjectIds.join(', ')}] are not linked to unit ${unitId} in unitSubjects table. Please ensure subjects are properly configured for this grade.`);
      }
    }
    
    // TRANSACTIONAL + IDEMPOTENT: Wrap delete+insert in transaction with unique constraint protection
    return await db.transaction(async (tx) => {
      // Delete ALL existing assignments for this user across ALL organizations
      // This ensures a user is only assigned to ONE organization at a time
      await tx.delete(userOrganizationAssignments)
        .where(eq(userOrganizationAssignments.userId, userId));
      
      // Create new assignments for each subject with ON CONFLICT DO NOTHING for idempotency
      // The UNIQUE constraint ensures concurrent requests won't create duplicates
      const assignments = await tx.insert(userOrganizationAssignments)
        .values(uniqueSubjectIds.map(subjectId => ({
          userId,
          organizationId,
          unitId,
          subUnitId,
          subjectId
        })))
        .onConflictDoNothing()
        .returning();
      
      return assignments;
    });
  }
  
  async getUserAssignments(userId: string, organizationId?: string): Promise<any[]> {
    if (organizationId) {
      return await db.select().from(userOrganizationAssignments).where(and(eq(userOrganizationAssignments.userId, userId), eq(userOrganizationAssignments.organizationId, organizationId)));
    }
    return await db.select().from(userOrganizationAssignments).where(eq(userOrganizationAssignments.userId, userId));
  }
  
  async getUserAssignment(id: string): Promise<UserOrganizationAssignment | undefined> {
    const [assignment] = await db.select().from(userOrganizationAssignments).where(eq(userOrganizationAssignments.id, id));
    return assignment;
  }
  
  async getOrganizationSubjectAssignments(organizationId: string): Promise<Map<string, string[]>> {
    requireOrgId(organizationId, 'getOrganizationSubjectAssignments');
    // Fetch all subject assignments for the organization in a single query
    const assignments = await db
      .select()
      .from(userOrganizationAssignments)
      .where(and(
        eq(userOrganizationAssignments.organizationId, organizationId),
        isNotNull(userOrganizationAssignments.subjectId)
      ));
    
    // Group by userId
    const grouped = new Map<string, string[]>();
    for (const assignment of assignments) {
      if (!assignment.subjectId) continue;
      
      const existing = grouped.get(assignment.userId) || [];
      existing.push(assignment.subjectId);
      grouped.set(assignment.userId, existing);
    }
    
    return grouped;
  }
  
  async removeUserAssignment(id: string): Promise<boolean> {
    await db.delete(userOrganizationAssignments).where(eq(userOrganizationAssignments.id, id));
    return true;
  }

  async removeAllUserAssignmentsInOrg(userId: string, organizationId: string): Promise<boolean> {
    await db.delete(userOrganizationAssignments).where(and(eq(userOrganizationAssignments.userId, userId), eq(userOrganizationAssignments.organizationId, organizationId)));
    return true;
  }
  
  async getUsersInUnit(unitId: string, subUnitId?: string): Promise<any[]> {
    if (subUnitId) {
      return await db.select({
        id: userOrganizationAssignments.id,
        userId: userOrganizationAssignments.userId,
        gamerName: users.gamerName,
        email: users.email,
        unitId: userOrganizationAssignments.unitId,
        subUnitId: userOrganizationAssignments.subUnitId
      }).from(userOrganizationAssignments).innerJoin(users, eq(userOrganizationAssignments.userId, users.id)).where(and(eq(userOrganizationAssignments.unitId, unitId), eq(userOrganizationAssignments.subUnitId, subUnitId)));
    }
    return await db.select({
      id: userOrganizationAssignments.id,
      userId: userOrganizationAssignments.userId,
      gamerName: users.gamerName,
      email: users.email,
      unitId: userOrganizationAssignments.unitId,
      subUnitId: userOrganizationAssignments.subUnitId
    }).from(userOrganizationAssignments).innerJoin(users, eq(userOrganizationAssignments.userId, users.id)).where(eq(userOrganizationAssignments.unitId, unitId));
  }
  
  async getOrganizationAssignments(organizationId: string): Promise<any[]> {
    requireOrgId(organizationId, 'getOrganizationAssignments');
    return await db.select().from(userOrganizationAssignments).where(eq(userOrganizationAssignments.organizationId, organizationId));
  }
  
  async getOrganizationQuizAssignments(organizationId: string): Promise<any[]> {
    requireOrgId(organizationId, 'getOrganizationQuizAssignments');
    return await db.select({
      id: quizCollectionAssignments.id,
      collectionId: quizCollectionAssignments.collectionId,
      unitId: quizCollectionAssignments.unitId,
      subUnitId: quizCollectionAssignments.subUnitId,
      subjectId: quizCollectionAssignments.subjectId,
      requiredPassPercentage: quizCollectionAssignments.requiredPassPercentage,
      availableFrom: quizCollectionAssignments.availableFrom,
      availableTo: quizCollectionAssignments.availableTo,
      collectionName: quizCollections.name,
    }).from(quizCollectionAssignments)
      .innerJoin(quizCollections, eq(quizCollectionAssignments.collectionId, quizCollections.id))
      .where(eq(quizCollections.organizationId, organizationId));
  }
  
  // Join requests
  async createJoinRequest(joinRequest: InsertJoinRequest): Promise<JoinRequest> {
    const [newRequest] = await db.insert(joinRequests).values(joinRequest).returning();
    return newRequest;
  }
  
  async getJoinRequest(id: string): Promise<JoinRequest | undefined> {
    const [request] = await db.select().from(joinRequests).where(eq(joinRequests.id, id));
    return request;
  }
  
  async getJoinRequestByUserId(userId: string): Promise<JoinRequest | undefined> {
    const [request] = await db.select().from(joinRequests).where(eq(joinRequests.userId, userId)).orderBy(desc(joinRequests.createdAt)).limit(1);
    return request;
  }
  
  async getJoinRequestsByOrganization(organizationId: string, status?: string): Promise<JoinRequest[]> {
    requireOrgId(organizationId, 'getJoinRequestsByOrganization');
    if (status) {
      return await db.select().from(joinRequests).where(and(eq(joinRequests.organizationId, organizationId), eq(joinRequests.status, status))).orderBy(desc(joinRequests.createdAt));
    }
    return await db.select().from(joinRequests).where(eq(joinRequests.organizationId, organizationId)).orderBy(desc(joinRequests.createdAt));
  }
  
  async getPendingJoinRequestCount(organizationId: string): Promise<number> {
    requireOrgId(organizationId, 'getPendingJoinRequestCount');
    const result = await db.select({ count: count() }).from(joinRequests).where(and(eq(joinRequests.organizationId, organizationId), eq(joinRequests.status, 'pending')));
    return result[0]?.count || 0;
  }
  
  async getAllJoinRequests(status?: string): Promise<JoinRequest[]> {
    if (status) {
      return await db.select().from(joinRequests)
        .where(eq(joinRequests.status, status))
        .orderBy(desc(joinRequests.createdAt));
    }
    
    return await db.select().from(joinRequests).orderBy(desc(joinRequests.createdAt));
  }
  
  async approveJoinRequest(id: string, reviewedBy: string, assignments: { unitId?: string; subUnitId?: string; teamId?: string; subjectIds?: string[] }, approvalMethod?: string): Promise<JoinRequest | undefined> {
    const [updatedRequest] = await db.update(joinRequests)
      .set({
        status: 'approved',
        reviewedBy,
        reviewedAt: new Date(),
        approvedAt: new Date(),
        assignedUnitId: assignments.unitId,
        assignedSubUnitId: assignments.subUnitId,
        assignedTeamId: assignments.teamId,
        assignedSubjectIds: assignments.subjectIds || [],
        approvalMethod: approvalMethod || 'dashboard'
      })
      .where(eq(joinRequests.id, id))
      .returning();
    return updatedRequest;
  }
  
  async denyJoinRequest(id: string, reviewedBy: string, denialReason: string): Promise<JoinRequest | undefined> {
    const [updatedRequest] = await db.update(joinRequests)
      .set({
        status: 'denied',
        reviewedBy,
        reviewedAt: new Date(),
        denialReason
      })
      .where(eq(joinRequests.id, id))
      .returning();
    return updatedRequest;
  }
  
  async updateJoinRequest(id: string, updates: Partial<InsertJoinRequest>): Promise<JoinRequest | undefined> {
    const [updatedRequest] = await db.update(joinRequests).set(updates).where(eq(joinRequests.id, id)).returning();
    return updatedRequest;
  }

  async autoApproveDemoJoin(userId: string, organizationId: string, unitId?: string, subUnitId?: string, subjectIds?: string[], teamId?: string): Promise<JoinRequest> {
    requireOrgId(organizationId, 'autoApproveDemoJoin');
    // Create join request
    const joinRequest = await this.createJoinRequest({
      userId,
      organizationId,
      requestedUnitId: unitId,
      requestedSubUnitId: subUnitId,
      requestedTeamId: teamId,
      requestedSubjectIds: subjectIds || [],
      status: 'pending'
    });

    // Validate subject IDs - only keep subjects that actually exist
    let finalSubjectIds = subjectIds || [];
    if (finalSubjectIds.length > 0) {
      const allSubjects = await this.getSubjects(organizationId);
      const validSubjectIds = new Set(allSubjects.map(s => s.id));
      const originalCount = finalSubjectIds.length;
      finalSubjectIds = finalSubjectIds.filter((id: string) => validSubjectIds.has(id));
      
      if (finalSubjectIds.length < originalCount) {
        console.warn(`[Auto-Approve DEMO] Filtered out ${originalCount - finalSubjectIds.length} invalid subject IDs`);
      }
    }

    // Auto-approve the request (use userId as reviewer for demo orgs since there's no admin)
    const approvedRequest = await this.approveJoinRequest(joinRequest.id, userId, {
      unitId,
      subUnitId,
      teamId,
      subjectIds: finalSubjectIds
    });

    if (!approvedRequest) {
      throw new Error('Failed to auto-approve join request');
    }

    // Get organization to determine default role
    const organization = await this.getOrganization(organizationId);
    const defaultRole = organization?.type === 'education' ? 'student' : 'learner';

    const existingRoles = await this.getUserRoles(userId);
    const otherOrgIds = [...new Set(existingRoles.filter((r: any) => r.organizationId !== organizationId).map((r: any) => r.organizationId))];
    for (const oldOrgId of otherOrgIds) {
      await this.removeAllUserRolesInOrg(userId, oldOrgId);
      await this.removeAllUserAssignmentsInOrg(userId, oldOrgId);
      console.log(`[Auto-Approve Demo] Removed user ${userId} from org ${oldOrgId} (single-org enforcement)`);
    }

    await db.update(joinRequests)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(joinRequests.userId, userId),
          eq(joinRequests.status, 'pending')
        )
      );

    // Assign user role to organization
    await this.assignUserRole(userId, organizationId, defaultRole);

    // Assign user to unit/subunit/subjects
    if (unitId) {
      if (finalSubjectIds.length > 0) {
        // If subjects are specified, create one assignment per subject
        await this.assignSubjectsToUser(
          userId,
          organizationId,
          unitId,
          subUnitId,
          finalSubjectIds
        );
      } else {
        // No subjects specified: create a single assignment for grade/class only
        await this.assignUserToUnit(
          userId,
          organizationId,
          unitId,
          subUnitId,
          teamId
        );
      }
    }

    return approvedRequest;
  }
  
  async getJoinRequestAuditLog(organizationId: string, filters?: {
    unitId?: string;
    subjectId?: string;
    studentName?: string;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
  }): Promise<any[]> {
    requireOrgId(organizationId, 'getJoinRequestAuditLog');
    // Build WHERE conditions
    let baseConditions = and(
      eq(joinRequests.organizationId, organizationId),
      or(
        eq(joinRequests.status, 'approved'),
        eq(joinRequests.status, 'denied')
      )
    );

    const conditions = [baseConditions];

    if (filters?.unitId) {
      conditions.push(eq(joinRequests.assignedUnitId, filters.unitId));
    }

    if (filters?.status) {
      conditions.push(eq(joinRequests.status, filters.status));
    }

    if (filters?.dateFrom) {
      conditions.push(gte(joinRequests.reviewedAt, new Date(filters.dateFrom)));
    }

    if (filters?.dateTo) {
      const endDate = new Date(filters.dateTo);
      endDate.setHours(23, 59, 59, 999);
      conditions.push(lte(joinRequests.reviewedAt, endDate));
    }

    // Fetch join requests
    const requests = await db
      .select()
      .from(joinRequests)
      .where(and(...conditions))
      .orderBy(desc(joinRequests.reviewedAt));

    // Get all unique user IDs (students and reviewers)
    const userIds = Array.from(new Set([
      ...requests.map(r => r.userId),
      ...requests.filter(r => r.reviewedBy).map(r => r.reviewedBy!)
    ]));

    // Get all unique unit IDs
    const unitIds = Array.from(new Set(requests.filter(r => r.assignedUnitId).map(r => r.assignedUnitId!)));
    
    // Get all unique sub-unit IDs
    const subUnitIds = Array.from(new Set(requests.filter(r => r.assignedSubUnitId).map(r => r.assignedSubUnitId!)));

    // Fetch related data in parallel
    const [allUsers, units, subUnits] = await Promise.all([
      userIds.length > 0 ? db.select().from(users).where(inArray(users.id, userIds)) : Promise.resolve([]),
      unitIds.length > 0 ? db.select().from(organizationUnits).where(inArray(organizationUnits.id, unitIds)) : Promise.resolve([]),
      subUnitIds.length > 0 ? db.select().from(organizationSubUnits).where(inArray(organizationSubUnits.id, subUnitIds)) : Promise.resolve([])
    ]);

    // Create lookup maps for fast access
    const userMap = new Map(allUsers.map(u => [u.id, u]));
    const unitMap = new Map(units.map(u => [u.id, u]));
    const subUnitMap = new Map(subUnits.map(s => [s.id, s]));

    // Transform results to flat structure with joins
    let flatResults = requests.map(r => {
      const student = userMap.get(r.userId);
      const reviewer = r.reviewedBy ? userMap.get(r.reviewedBy) : undefined;
      const unit = r.assignedUnitId ? unitMap.get(r.assignedUnitId) : undefined;
      const subUnit = r.assignedSubUnitId ? subUnitMap.get(r.assignedSubUnitId) : undefined;

      return {
        id: r.id,
        status: r.status,
        requestedAt: r.createdAt,
        reviewedAt: r.reviewedAt,
        approvedAt: r.approvedAt,
        denialReason: r.denialReason,
        studentId: r.userId,
        studentFirstName: student?.firstName,
        studentLastName: student?.lastName,
        studentEmail: student?.email,
        studentGamerName: student?.gamerName,
        reviewerId: r.reviewedBy,
        reviewerFirstName: reviewer?.firstName,
        reviewerLastName: reviewer?.lastName,
        reviewerGamerName: reviewer?.gamerName,
        assignedUnitId: r.assignedUnitId,
        assignedSubUnitId: r.assignedSubUnitId,
        assignedSubjectIds: r.assignedSubjectIds,
        unitName: unit?.name,
        subUnitName: subUnit?.name,
      };
    });

    // Apply student name filter client-side for flexibility (partial matching)
    if (filters?.studentName) {
      const searchTerm = filters.studentName.toLowerCase();
      flatResults = flatResults.filter(r => {
        const fullName = `${r.studentFirstName || ''} ${r.studentLastName || ''}`.toLowerCase();
        const gamerName = (r.studentGamerName || '').toLowerCase();
        const email = (r.studentEmail || '').toLowerCase();
        return fullName.includes(searchTerm) || gamerName.includes(searchTerm) || email.includes(searchTerm);
      });
    }

    // Apply subject filter client-side (since assignedSubjectIds is an array)
    if (filters?.subjectId) {
      flatResults = flatResults.filter(r => 
        r.assignedSubjectIds && r.assignedSubjectIds.includes(filters.subjectId!)
      );
    }

    return flatResults;
  }
  
  // Subjects
  async createSubject(subject: InsertSubject): Promise<Subject> {
    return await db.transaction(async (tx) => {
      const [newSubject] = await tx.insert(subjects).values(subject).returning();

      if (newSubject.unitId) {
        const [existingLink] = await tx
          .select({ id: unitSubjects.id })
          .from(unitSubjects)
          .where(
            and(
              eq(unitSubjects.unitId, newSubject.unitId),
              eq(unitSubjects.subjectId, newSubject.id),
            ),
          )
          .limit(1);

        if (!existingLink) {
          await tx.insert(unitSubjects).values({
            unitId: newSubject.unitId,
            subjectId: newSubject.id,
          });
        }
      }

      return newSubject;
    });
  }
  
  async getSubjects(organizationId: string, unitId?: string): Promise<Subject[]> {
    requireOrgId(organizationId, 'getSubjects');
    if (unitId) {
      return await db.select().from(subjects).where(and(
        eq(subjects.organizationId, organizationId), 
        eq(subjects.unitId, unitId),
        or(eq(subjects.isDeleted, false), sql`${subjects.isDeleted} IS NULL`)
      ));
    }
    return await db.select().from(subjects).where(and(
      eq(subjects.organizationId, organizationId),
      or(eq(subjects.isDeleted, false), sql`${subjects.isDeleted} IS NULL`)
    ));
  }
  
  async getSubject(id: string): Promise<Subject | undefined> {
    const [subject] = await db.select().from(subjects).where(and(
      eq(subjects.id, id),
      or(eq(subjects.isDeleted, false), sql`${subjects.isDeleted} IS NULL`)
    ));
    return subject;
  }
  
  async updateSubject(id: string, updates: Partial<InsertSubject>): Promise<Subject | undefined> {
    const [updatedSubject] = await db.update(subjects).set(updates).where(eq(subjects.id, id)).returning();
    return updatedSubject;
  }
  
  async deleteSubject(id: string): Promise<boolean> {
    // Soft delete: set isDeleted to true instead of deleting
    // This preserves all historical data and relationships
    const result = await db.update(subjects)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(eq(subjects.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }
  
  // Organization usage limits and trial management
  async getOrganizationUsageLimits(organizationId: string): Promise<any | undefined> {
    requireOrgId(organizationId, 'getOrganizationUsageLimits');
    const result = await db.execute(sql`
      SELECT * FROM "organizationUsageLimits" WHERE "organizationId" = ${organizationId}
    `);
    return result.rows[0];
  }

  async incrementDailyQuizCount(organizationId: string): Promise<any> {
    requireOrgId(organizationId, 'incrementDailyQuizCount');
    const result = await db.execute(sql`
      UPDATE "organizationUsageLimits" 
      SET "dailyQuizCount" = "dailyQuizCount" + 1, "updatedAt" = NOW()
      WHERE "organizationId" = ${organizationId}
      RETURNING *
    `);
    return result.rows[0];
  }

  async incrementAIExplanationCount(organizationId: string): Promise<any> {
    requireOrgId(organizationId, 'incrementAIExplanationCount');
    const result = await db.execute(sql`
      UPDATE "organizationUsageLimits" 
      SET "aiExplanationCount" = "aiExplanationCount" + 1, "updatedAt" = NOW()
      WHERE "organizationId" = ${organizationId}
      RETURNING *
    `);
    return result.rows[0];
  }

  async updateConcurrentUsers(organizationId: string, count: number): Promise<any> {
    requireOrgId(organizationId, 'updateConcurrentUsers');
    const result = await db.execute(sql`
      UPDATE "organizationUsageLimits" 
      SET "concurrentUsers" = ${count}, "updatedAt" = NOW()
      WHERE "organizationId" = ${organizationId}
      RETURNING *
    `);
    return result.rows[0];
  }

  async resetDailyLimits(organizationId: string): Promise<any> {
    requireOrgId(organizationId, 'resetDailyLimits');
    const result = await db.execute(sql`
      UPDATE "organizationUsageLimits" 
      SET "dailyQuizCount" = 0, "aiExplanationCount" = 0, "updatedAt" = NOW()
      WHERE "organizationId" = ${organizationId}
      RETURNING *
    `);
    return result.rows[0];
  }

  async checkTrialStatus(organizationId: string): Promise<{ isTrialActive: boolean; daysRemaining: number; trialEndDate: Date | null }> {
    requireOrgId(organizationId, 'checkTrialStatus');
    const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
    
    if (!org) {
      return { isTrialActive: false, daysRemaining: 0, trialEndDate: null };
    }

    // Demo organizations are always considered active (unlimited trial)
    if (org.isDemo) {
      return { isTrialActive: true, daysRemaining: 999, trialEndDate: org.trialEndDate };
    }

    const now = new Date();
    
    // Calculate trialEndDate: use explicit value, or derive from trialStartDate + 30 days
    let trialEndDate = org.trialEndDate;
    if (!trialEndDate && org.trialStartDate && org.subscriptionStatus === 'trial') {
      // Calculate trial end date as 30 days from trial start
      const TRIAL_DURATION_DAYS = 30;
      trialEndDate = new Date(org.trialStartDate.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);
    }
    
    if (!trialEndDate) {
      // No trial end date and couldn't calculate one - not in trial
      return { isTrialActive: false, daysRemaining: 0, trialEndDate: null };
    }

    const daysRemaining = Math.ceil((trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const isTrialActive = (org.subscriptionStatus === 'trial') && daysRemaining > 0;

    return { isTrialActive, daysRemaining: Math.max(0, daysRemaining), trialEndDate };
  }
  
  // Unit-Subject assignments
  async assignSubjectToUnit(unitId: string, subjectId: string): Promise<any> {
    // First, get the organization context from the target unit
    const [targetUnit] = await db.select().from(organizationUnits).where(eq(organizationUnits.id, unitId));
    
    if (!targetUnit) {
      throw new Error("Unit not found");
    }
    
    // Delete any existing assignments for this subject within the same organization
    // This ensures a subject can only be assigned to one unit (grade) per organization
    await db.delete(unitSubjects).where(
      and(
        eq(unitSubjects.subjectId, subjectId),
        inArray(
          unitSubjects.unitId,
          db.select({ id: organizationUnits.id })
            .from(organizationUnits)
            .where(eq(organizationUnits.organizationId, targetUnit.organizationId))
        )
      )
    );
    
    // Now insert the new assignment
    const [assignment] = await db.insert(unitSubjects).values({ unitId, subjectId }).returning();
    return assignment;
  }
  
  async unassignSubjectFromUnit(unitId: string, subjectId: string): Promise<boolean> {
    // CASCADE cleanup: Delete dependent records to prevent orphaned data
    await db.transaction(async (tx) => {
      // 1. Delete user assignments for this unit+subject combination
      await tx.delete(userOrganizationAssignments).where(
        and(
          eq(userOrganizationAssignments.unitId, unitId),
          eq(userOrganizationAssignments.subjectId, subjectId)
        )
      );

      // 2. Delete lesson scope assignments for this unit+subject combination
      await tx.delete(lessonScopeAssignments).where(
        and(
          eq(lessonScopeAssignments.unitId, unitId),
          eq(lessonScopeAssignments.subjectId, subjectId)
        )
      );

      // 3. Delete quiz collection assignments for this unit+subject combination
      await tx.delete(quizCollectionAssignments).where(
        and(
          eq(quizCollectionAssignments.unitId, unitId),
          eq(quizCollectionAssignments.subjectId, subjectId)
        )
      );

      // 4. Finally, delete the unit-subject link
      await tx.delete(unitSubjects).where(
        and(
          eq(unitSubjects.unitId, unitId),
          eq(unitSubjects.subjectId, subjectId)
        )
      );
    });

    console.log(`[CASCADE] Cleaned up dependent records for unit ${unitId} + subject ${subjectId}`);
    return true;
  }
  
  async getUnitSubjects(unitId: string): Promise<any[]> {
    return await db.select({
      id: unitSubjects.id,
      unitId: unitSubjects.unitId,
      subjectId: unitSubjects.subjectId,
      subjectName: subjects.name,
      subjectDescription: subjects.description,
      createdAt: unitSubjects.createdAt
    }).from(unitSubjects).innerJoin(subjects, eq(unitSubjects.subjectId, subjects.id)).where(and(
      eq(unitSubjects.unitId, unitId),
      or(eq(subjects.isDeleted, false), sql`${subjects.isDeleted} IS NULL`)
    ));
  }
  
  // Quiz collections
  async createQuizCollection(collection: InsertQuizCollection): Promise<QuizCollection> {
    const [quizCollection] = await db.insert(quizCollections).values(collection).returning();
    if (!quizCollection.contentGroupId) {
      const [updated] = await db.update(quizCollections)
        .set({ contentGroupId: quizCollection.id })
        .where(eq(quizCollections.id, quizCollection.id))
        .returning();
      return updated;
    }
    return quizCollection;
  }
  
  async getQuizCollections(organizationId?: string, page?: number, pageSize?: number): Promise<any> {
    // Fetch collections with grade information from subject-unit assignments
    let query;
    const isPaginated = page !== undefined && pageSize !== undefined;
    
    if (organizationId) {
      query = db.select({
        id: quizCollections.id,
        name: quizCollections.name,
        description: quizCollections.description,
        totalCards: quizCollections.totalCards,
        imageKey: quizCollections.imageKey,
        organizationId: quizCollections.organizationId,
        subjectId: quizCollections.subjectId,
        isActive: quizCollections.isActive,
        isPublic: quizCollections.isPublic,
        difficulty: quizCollections.difficulty,
        passPercentage: quizCollections.passPercentage,
        createdAt: quizCollections.createdAt,
        updatedAt: quizCollections.updatedAt,
        createdBy: quizCollections.createdBy,
        gradeId: unitSubjects.unitId, // Get grade from subject assignment
      })
      .from(quizCollections)
      .leftJoin(unitSubjects, eq(quizCollections.subjectId, unitSubjects.subjectId))
      .where(and(
        eq(quizCollections.organizationId, organizationId),
        or(eq(quizCollections.isDeleted, false), sql`${quizCollections.isDeleted} IS NULL`)
      ))
      .orderBy(desc(quizCollections.createdAt));
    } else {
      query = db.select({
        id: quizCollections.id,
        name: quizCollections.name,
        description: quizCollections.description,
        totalCards: quizCollections.totalCards,
        imageKey: quizCollections.imageKey,
        organizationId: quizCollections.organizationId,
        subjectId: quizCollections.subjectId,
        isActive: quizCollections.isActive,
        isPublic: quizCollections.isPublic,
        difficulty: quizCollections.difficulty,
        passPercentage: quizCollections.passPercentage,
        createdAt: quizCollections.createdAt,
        updatedAt: quizCollections.updatedAt,
        createdBy: quizCollections.createdBy,
        gradeId: unitSubjects.unitId, // Get grade from subject assignment
      })
      .from(quizCollections)
      .leftJoin(unitSubjects, eq(quizCollections.subjectId, unitSubjects.subjectId))
      .where(or(eq(quizCollections.isDeleted, false), sql`${quizCollections.isDeleted} IS NULL`))
      .orderBy(desc(quizCollections.createdAt));
    }
    
    // Get total count before pagination
    let totalCount = 0;
    if (isPaginated) {
      const countQuery = organizationId 
        ? await db.select({ count: sql<number>`count(*)` }).from(quizCollections).where(and(
            eq(quizCollections.organizationId, organizationId),
            or(eq(quizCollections.isDeleted, false), sql`${quizCollections.isDeleted} IS NULL`)
          ))
        : await db.select({ count: sql<number>`count(*)` }).from(quizCollections).where(
            or(eq(quizCollections.isDeleted, false), sql`${quizCollections.isDeleted} IS NULL`)
          );
      totalCount = Number(countQuery[0]?.count || 0);
    }
    
    // Apply pagination
    const collections = isPaginated 
      ? await query.limit(pageSize!).offset((page! - 1) * pageSize!)
      : await query;
    
    // OPTIMIZATION: Batch-fetch assignments for all collections in ONE query (eliminates N+1)
    const collectionIds = collections.map(c => c.id);
    let assignmentsMap = new Map<string, any[]>();
    
    if (collectionIds.length > 0) {
      const allAssignments = await db
        .select()
        .from(quizCollectionAssignments)
        .where(inArray(quizCollectionAssignments.collectionId, collectionIds));
      
      // Group assignments by collection ID
      allAssignments.forEach(assignment => {
        if (!assignmentsMap.has(assignment.collectionId)) {
          assignmentsMap.set(assignment.collectionId, []);
        }
        assignmentsMap.get(assignment.collectionId)!.push(assignment);
      });
    }
    
    // OPTIMIZATION: Batch-fetch lesson-quiz links for all collections in ONE query
    let lessonLinksMap = new Map<string, any>();
    
    if (collectionIds.length > 0) {
      const allLessonLinks = await db
        .select({
          quizId: lessonQuizLinks.quizId,
          lessonId: lessonQuizLinks.lessonId,
          lessonTitle: lessons.title,
        })
        .from(lessonQuizLinks)
        .leftJoin(lessons, eq(lessonQuizLinks.lessonId, lessons.id))
        .where(inArray(lessonQuizLinks.quizId, collectionIds));
      
      // Map lesson links by quiz ID (take first/primary lesson)
      allLessonLinks.forEach(link => {
        if (!lessonLinksMap.has(link.quizId)) {
          lessonLinksMap.set(link.quizId, link);
        }
      });
    }
    
    // OPTIMIZATION: Batch-fetch course-lesson associations for all linked lessons
    const lessonIds = Array.from(lessonLinksMap.values()).map(l => l.lessonId).filter(Boolean);
    let courseLinkMap = new Map<string, { courseId: string; courseTitle: string; topicOrder: number }>();
    
    if (lessonIds.length > 0) {
      const allCourseLinks = await db
        .select({
          lessonId: courseLessons.lessonId,
          courseId: courseLessons.courseId,
          courseTitle: courses.title,
          topicOrder: courseLessons.topicOrder,
        })
        .from(courseLessons)
        .leftJoin(courses, eq(courseLessons.courseId, courses.id))
        .where(inArray(courseLessons.lessonId, lessonIds));
      
      // Map course links by lesson ID (take first course)
      allCourseLinks.forEach(link => {
        if (!courseLinkMap.has(link.lessonId)) {
          courseLinkMap.set(link.lessonId, {
            courseId: link.courseId,
            courseTitle: link.courseTitle || 'Unknown Course',
            topicOrder: link.topicOrder,
          });
        }
      });

      const unresolvedLessonIds = lessonIds.filter(id => id && !courseLinkMap.has(id)) as string[];
      if (unresolvedLessonIds.length > 0) {
        const translatedLessons = await db
          .select({
            id: lessons.id,
            contentGroupId: lessons.contentGroupId,
            isDefaultLanguage: lessons.isDefaultLanguage,
          })
          .from(lessons)
          .where(
            and(
              inArray(lessons.id, unresolvedLessonIds),
              eq(lessons.isDefaultLanguage, false),
              isNotNull(lessons.contentGroupId)
            )
          );

        if (translatedLessons.length > 0) {
          const contentGroupIds = translatedLessons.map(l => l.contentGroupId).filter(Boolean) as string[];
          const defaultLessons = await db
            .select({
              id: lessons.id,
              contentGroupId: lessons.contentGroupId,
            })
            .from(lessons)
            .where(
              and(
                inArray(lessons.contentGroupId, contentGroupIds),
                eq(lessons.isDefaultLanguage, true)
              )
            );

          const contentGroupToDefaultLesson = new Map<string, string>();
          defaultLessons.forEach(dl => {
            if (dl.contentGroupId) {
              contentGroupToDefaultLesson.set(dl.contentGroupId, dl.id);
            }
          });

          const defaultLessonIds = Array.from(contentGroupToDefaultLesson.values());
          if (defaultLessonIds.length > 0) {
            const defaultCourseLinks = await db
              .select({
                lessonId: courseLessons.lessonId,
                courseId: courseLessons.courseId,
                courseTitle: courses.title,
                topicOrder: courseLessons.topicOrder,
              })
              .from(courseLessons)
              .leftJoin(courses, eq(courseLessons.courseId, courses.id))
              .where(inArray(courseLessons.lessonId, defaultLessonIds));

            const defaultLessonCourseMap = new Map<string, { courseId: string; courseTitle: string; topicOrder: number }>();
            defaultCourseLinks.forEach(link => {
              if (!defaultLessonCourseMap.has(link.lessonId)) {
                defaultLessonCourseMap.set(link.lessonId, {
                  courseId: link.courseId,
                  courseTitle: link.courseTitle || 'Unknown Course',
                  topicOrder: link.topicOrder,
                });
              }
            });

            translatedLessons.forEach(tl => {
              if (tl.contentGroupId) {
                const defaultLessonId = contentGroupToDefaultLesson.get(tl.contentGroupId);
                if (defaultLessonId) {
                  const courseInfo = defaultLessonCourseMap.get(defaultLessonId);
                  if (courseInfo) {
                    courseLinkMap.set(tl.id, courseInfo);
                  }
                }
              }
            });
          }
        }
      }
    }
    
    // Map assignments and linked lesson/course info to collections
    const collectionsWithAssignments = collections.map(collection => {
      const lessonLink = lessonLinksMap.get(collection.id);
      const courseLink = lessonLink?.lessonId ? courseLinkMap.get(lessonLink.lessonId) : null;
      
      return {
        ...collection,
        assignments: assignmentsMap.get(collection.id) || [],
        linkedLesson: lessonLink ? {
          lessonId: lessonLink.lessonId,
          lessonTitle: lessonLink.lessonTitle,
        } : null,
        linkedCourse: courseLink ? {
          courseId: courseLink.courseId,
          courseTitle: courseLink.courseTitle,
          topicOrder: courseLink.topicOrder,
        } : null,
      };
    });
    
    // Return paginated response or just array for backward compatibility
    return isPaginated 
      ? { quizzes: collectionsWithAssignments, totalCount, page, pageSize }
      : collectionsWithAssignments;
  }
  
  async getQuizCollection(id: string): Promise<QuizCollection | undefined> {
    const [collection] = await db.select().from(quizCollections).where(eq(quizCollections.id, id));
    return collection;
  }
  
  async updateQuizCollection(id: string, updates: Partial<InsertQuizCollection>): Promise<QuizCollection | undefined> {
    const [collection] = await db.update(quizCollections).set({ ...updates, updatedAt: new Date() }).where(eq(quizCollections.id, id)).returning();
    return collection;
  }
  
  async updateQuizCollectionTotalCards(id: string, totalCards: number): Promise<void> {
    await db.update(quizCollections)
      .set({ totalCards, updatedAt: new Date() })
      .where(eq(quizCollections.id, id));
  }
  
  async deleteQuizCollection(id: string): Promise<boolean> {
    // Soft delete the quiz collection: Set isDeleted flag instead of actually deleting
    // This preserves all quiz history, student progress, XP, and related data
    // However, we hard-delete the assignments to prevent deleted quizzes from showing in reports
    await db.transaction(async (tx) => {
      // First, delete all assignments for this quiz collection
      await tx.delete(quizCollectionAssignments)
        .where(eq(quizCollectionAssignments.collectionId, id));
      
      // Then soft-delete the quiz collection itself
      await tx.update(quizCollections)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(eq(quizCollections.id, id));
    });
    return true;
  }
  
  async getQuizCollectionsForUser(userId: string): Promise<any[]> {
    // Get user's organization roles
    const userRoles = await this.getUserRoles(userId);
    if (userRoles.length === 0) return [];
    
    // Get all organizations the user belongs to
    const organizationIds = Array.from(new Set(userRoles.map(r => r.organizationId)));
    
    // OPTIMIZATION: Fetch all quiz collections for ALL organizations in ONE query (eliminates N+1)
    const allCollections = await db.select({
      id: quizCollections.id,
      name: quizCollections.name,
      description: quizCollections.description,
      totalCards: quizCollections.totalCards,
      imageKey: quizCollections.imageKey,
      organizationId: quizCollections.organizationId,
      subjectId: quizCollections.subjectId,
      isActive: quizCollections.isActive,
      difficulty: quizCollections.difficulty,
      subjectName: subjects.name,
      unitId: unitSubjects.unitId,
      unitName: organizationUnits.name
    }).from(quizCollections)
      .leftJoin(subjects, eq(quizCollections.subjectId, subjects.id))
      .leftJoin(unitSubjects, eq(subjects.id, unitSubjects.subjectId))
      .leftJoin(organizationUnits, eq(unitSubjects.unitId, organizationUnits.id))
      .where(
        and(
          inArray(quizCollections.organizationId, organizationIds),
          sql`${quizCollections.isActive} IS TRUE`,
          or(sql`${quizCollections.isDeleted} IS FALSE`, sql`${quizCollections.isDeleted} IS NULL`)
        )
      );
    
    // Remove duplicates (in case user has multiple roles in same org or multiple unit assignments)
    const unique = Array.from(new Map(allCollections.map(item => [item.id, item])).values());
    return unique;
  }
  
  async getQuizCollectionsByOrganization(organizationId: string): Promise<any[]> {
    requireOrgId(organizationId, 'getQuizCollectionsByOrganization');
    // Get all active quiz collections for this organization with subject and unit names
    const orgCollections = await db.select({
      id: quizCollections.id,
      name: quizCollections.name,
      description: quizCollections.description,
      totalCards: quizCollections.totalCards,
      imageKey: quizCollections.imageKey,
      organizationId: quizCollections.organizationId,
      subjectId: quizCollections.subjectId,
      isActive: quizCollections.isActive,
      difficulty: quizCollections.difficulty,
      subjectName: subjects.name,
      unitId: unitSubjects.unitId,
      unitName: organizationUnits.name
    }).from(quizCollections)
      .leftJoin(subjects, eq(quizCollections.subjectId, subjects.id))
      .leftJoin(unitSubjects, eq(subjects.id, unitSubjects.subjectId))
      .leftJoin(organizationUnits, eq(unitSubjects.unitId, organizationUnits.id))
      .where(
        and(
          eq(quizCollections.organizationId, organizationId),
          sql`${quizCollections.isActive} IS TRUE`,
          or(sql`${quizCollections.isDeleted} IS FALSE`, sql`${quizCollections.isDeleted} IS NULL`)
        )
      );
    
    // Remove duplicates (in case of multiple unit associations)
    const unique = Array.from(new Map(orgCollections.map(item => [item.id, item])).values());
    return unique;
  }
  
  async getQuizCollectionsForUserAccess(userId: string, organizationId?: string): Promise<any[]> {
    // Check if user is admin/teacher/SuperAdmin - they see ALL organization quizzes
    const userRoles = await this.getUserRoles(userId);
    console.log('[getQuizCollectionsForUserAccess] userId:', userId, 'userRoles:', JSON.stringify(userRoles));
    
    const isSuperAdmin = userRoles.some((role: any) => role.role === 'super_admin');
    const isOrgAdminOrTeacher = userRoles.some((role: any) => 
      ALL_STAFF_ROLES.includes(role.role)
    );
    
    console.log('[getQuizCollectionsForUserAccess] isSuperAdmin:', isSuperAdmin, 'isOrgAdminOrTeacher:', isOrgAdminOrTeacher);
    
    if (isSuperAdmin || isOrgAdminOrTeacher) {
      // Admins/Teachers see ALL quizzes from their organization(s) via assignments + public quizzes
      const adminOrgIds = userRoles.map((r: any) => r.organizationId).filter(Boolean);
      
      console.log('[getQuizCollectionsForUserAccess] Admin query - organizationId:', organizationId, 'adminOrgIds:', adminOrgIds);
      
      // Validate access for non-SuperAdmins
      if (!isSuperAdmin && organizationId && !adminOrgIds.includes(organizationId)) {
        console.log('[getQuizCollectionsForUserAccess] Access denied - OrgAdmin requesting unauthorized org');
        // OrgAdmin/Teacher requesting unauthorized org → only public quizzes
        const publicQuizzes = await db.select({
          id: quizCollections.id,
          name: quizCollections.name,
          description: quizCollections.description,
          totalCards: quizCollections.totalCards,
          imageKey: quizCollections.imageKey,
          organizationId: quizCollections.organizationId,
          subjectId: quizCollections.subjectId,
          isActive: quizCollections.isActive,
          isPublic: quizCollections.isPublic,
          difficulty: quizCollections.difficulty,
          passPercentage: quizCollections.passPercentage,
          createdAt: quizCollections.createdAt,
          updatedAt: quizCollections.updatedAt,
          createdBy: quizCollections.createdBy,
          gradeId: sql<string | null>`NULL`.as('gradeId'),
          subjectName: sql<string | null>`NULL`.as('subjectName'),
          gradeName: sql<string | null>`NULL`.as('gradeName'),
        })
        .from(quizCollections)
        .where(
          and(
            eq(quizCollections.isPublic, true),
            sql`${quizCollections.isActive} IS TRUE`,
            or(sql`${quizCollections.isDeleted} IS FALSE`, sql`${quizCollections.isDeleted} IS NULL`)
          )!
        )
        .orderBy(desc(quizCollections.createdAt));
        return publicQuizzes;
      }
      
      // Build query using assignment joins to filter by organization
      const targetOrgIds = organizationId ? [organizationId] : (isSuperAdmin ? [] : adminOrgIds);
      
      console.log('[getQuizCollectionsForUserAccess] Fetching quizzes for orgs:', targetOrgIds);
      
      const adminQuizzes = await db.select({
        id: quizCollections.id,
        name: quizCollections.name,
        description: quizCollections.description,
        totalCards: quizCollections.totalCards,
        imageKey: quizCollections.imageKey,
        organizationId: organizationUnits.organizationId,
        subjectId: quizCollections.subjectId,
        isActive: quizCollections.isActive,
        isPublic: quizCollections.isPublic,
        difficulty: quizCollections.difficulty,
        passPercentage: quizCollections.passPercentage,
        createdAt: quizCollections.createdAt,
        updatedAt: quizCollections.updatedAt,
        createdBy: quizCollections.createdBy,
        gradeId: quizCollectionAssignments.unitId,
        subjectName: subjects.name,
        gradeName: organizationUnits.name,
      })
      .from(quizCollections)
      .leftJoin(quizCollectionAssignments, eq(quizCollections.id, quizCollectionAssignments.collectionId))
      .leftJoin(organizationUnits, eq(quizCollectionAssignments.unitId, organizationUnits.id))
      .leftJoin(subjects, eq(quizCollectionAssignments.subjectId, subjects.id))
      .where(
        and(
          sql`${quizCollections.isActive} IS TRUE`,
          or(sql`${quizCollections.isDeleted} IS FALSE`, sql`${quizCollections.isDeleted} IS NULL`),
          targetOrgIds.length > 0
            ? or(
                // Quizzes assigned to this organization via unit (specific grade)
                sql`${organizationUnits.organizationId} IN (${sql.join(targetOrgIds.map((id: string) => sql`${id}`), sql`, `)})`,
                // OR via subject (General grade - unitId NULL but has subject)
                sql`${subjects.organizationId} IN (${sql.join(targetOrgIds.map((id: string) => sql`${id}`), sql`, `)})`,
                // OR via collection's direct organizationId (General grade - both unitId and subjectId NULL)
                sql`${quizCollections.organizationId} IN (${sql.join(targetOrgIds.map((id: string) => sql`${id}`), sql`, `)})`,
                // OR public quizzes
                eq(quizCollections.isPublic, true)
              )!
            : sql`1=1` // SuperAdmin with no org filter: show all
        )!
      )
      .orderBy(desc(quizCollections.createdAt));
      
      console.log('[getQuizCollectionsForUserAccess] Found', adminQuizzes.length, 'quizzes (before dedup)');
      
      // Remove duplicates
      const unique = Array.from(new Map(adminQuizzes.map(item => [item.id, item])).values());
      console.log('[getQuizCollectionsForUserAccess] Returning', unique.length, 'unique quizzes');
      return unique;
    }
    
    // For students: apply subject-assignment filtering
    // Check if user has a join request
    const joinRequest = await this.getJoinRequestByUserId(userId);
    
    // If user has pending or denied join request, only show public quizzes
    if (joinRequest && (joinRequest.status === 'pending' || joinRequest.status === 'denied')) {
      const publicQuizzes = await db.select({
        id: quizCollections.id,
        name: quizCollections.name,
        description: quizCollections.description,
        totalCards: quizCollections.totalCards,
        imageKey: quizCollections.imageKey,
        organizationId: quizCollections.organizationId,
        subjectId: quizCollections.subjectId,
        isActive: quizCollections.isActive,
        isPublic: quizCollections.isPublic,
        difficulty: quizCollections.difficulty,
        passPercentage: quizCollections.passPercentage,
        createdAt: quizCollections.createdAt,
        updatedAt: quizCollections.updatedAt,
        createdBy: quizCollections.createdBy,
      })
      .from(quizCollections)
      .where(
        and(
          sql`${quizCollections.isPublic} IS TRUE`,
          sql`${quizCollections.isActive} IS TRUE`,
          or(sql`${quizCollections.isDeleted} IS FALSE`, sql`${quizCollections.isDeleted} IS NULL`)
        )
      )
      .orderBy(desc(quizCollections.createdAt));
      
      return publicQuizzes;
    }
    
    // Get user's assignments to determine grade/subject access
    const userAssignments = await db.select()
      .from(userOrganizationAssignments)
      .where(eq(userOrganizationAssignments.userId, userId));
    
    // If user has no assignments, only show public quizzes
    if (userAssignments.length === 0) {
      const publicQuizzes = await db.select({
        id: quizCollections.id,
        name: quizCollections.name,
        description: quizCollections.description,
        totalCards: quizCollections.totalCards,
        imageKey: quizCollections.imageKey,
        organizationId: quizCollections.organizationId,
        subjectId: quizCollections.subjectId,
        isActive: quizCollections.isActive,
        isPublic: quizCollections.isPublic,
        difficulty: quizCollections.difficulty,
        passPercentage: quizCollections.passPercentage,
        createdAt: quizCollections.createdAt,
        updatedAt: quizCollections.updatedAt,
        createdBy: quizCollections.createdBy,
      })
      .from(quizCollections)
      .where(
        and(
          sql`${quizCollections.isPublic} IS TRUE`,
          sql`${quizCollections.isActive} IS TRUE`,
          or(sql`${quizCollections.isDeleted} IS FALSE`, sql`${quizCollections.isDeleted} IS NULL`)
        )
      )
      .orderBy(desc(quizCollections.createdAt));
      
      return publicQuizzes;
    }
    
    // User is approved - get quizzes for their assigned grades/subjects
    const userOrgIds = Array.from(new Set(userAssignments.map(a => a.organizationId)));
    const userUnitIds = userAssignments.map(a => a.unitId).filter(id => id !== null) as string[];
    const userSubUnitIds = userAssignments.map(a => a.subUnitId).filter(id => id !== null) as string[];
    const userSubjectIds = userAssignments.map(a => a.subjectId).filter(id => id !== null) as string[];
    
    // Get subject-unit pairs for validation (subjects that belong to user's departments)
    const validSubjects = userAssignments
      .filter(a => a.unitId && a.subjectId)
      .map(a => a.subjectId!);
    const uniqueValidSubjects = Array.from(new Set(validSubjects));
    
    // Build query to get quizzes accessible to this user
    // Join with quizCollectionAssignments to filter by assignments
    let baseQuery = db.select({
      id: quizCollections.id,
      name: quizCollections.name,
      description: quizCollections.description,
      totalCards: quizCollections.totalCards,
      imageKey: quizCollections.imageKey,
      organizationId: quizCollections.organizationId,
      subjectId: quizCollections.subjectId,
      isActive: quizCollections.isActive,
      isPublic: quizCollections.isPublic,
      difficulty: quizCollections.difficulty,
      passPercentage: quizCollections.passPercentage,
      createdAt: quizCollections.createdAt,
      updatedAt: quizCollections.updatedAt,
      createdBy: quizCollections.createdBy,
      gradeId: unitSubjects.unitId,
      subjectName: subjects.name,
      gradeName: organizationUnits.name,
    })
    .from(quizCollections)
    .leftJoin(subjects, eq(quizCollections.subjectId, subjects.id))
    .leftJoin(unitSubjects, eq(quizCollections.subjectId, unitSubjects.subjectId))
    .leftJoin(organizationUnits, eq(unitSubjects.unitId, organizationUnits.id))
    .leftJoin(quizCollectionAssignments, eq(quizCollections.id, quizCollectionAssignments.collectionId));
    
    // Apply filters
    const conditions = [
      sql`${quizCollections.isActive} IS TRUE`,
      or(sql`${quizCollections.isDeleted} IS FALSE`, sql`${quizCollections.isDeleted} IS NULL`)!
    ];
    
    // Filter by organization if specified
    if (organizationId) {
      conditions.push(
        or(
          eq(quizCollections.organizationId, organizationId),
          eq(quizCollections.isPublic, true)
        )!
      );
    } else {
      // Show public quizzes + quizzes from user's organizations
      conditions.push(
        or(
          sql`${quizCollections.organizationId} IN (${sql.join(userOrgIds.map(id => sql`${id}`), sql`, `)})`,
          eq(quizCollections.isPublic, true)
        )!
      );
    }
    
    // Filter by quiz assignments matching user's assigned departments and subjects
    // FIXED LOGIC: Support all assignment patterns while preserving subject-specific access
    // A quiz is accessible if:
    // 1. It's a public quiz, OR
    // 2. It matches one of these patterns:
    //    - Exact match: assignment's unit+subject matches user's enrollment
    //    - Department-wide: assignment has user's unit but NO subject restriction
    //    - Subject-only: assignment has NO unit but matches user's subject
    if (userUnitIds.length > 0 || userSubjectIds.length > 0) {
      const assignmentConditions = [];
      
      // Public quizzes are always accessible
      assignmentConditions.push(eq(quizCollections.isPublic, true));
      
      // Pattern 1: Exact match - quiz assigned to user's specific unit+subject combinations
      // Iterate through each exact pair to prevent cross-product unauthorized access
      for (const assignment of userAssignments) {
        if (assignment.unitId && assignment.subjectId) {
          assignmentConditions.push(
            and(
              eq(quizCollectionAssignments.unitId, assignment.unitId),
              eq(quizCollectionAssignments.subjectId, assignment.subjectId)
            )!
          );
        }
      }
      
      // Pattern 2: Department-wide quizzes - user has department, quiz has no subject restriction
      // These quizzes are available to ALL users in the department regardless of their subject assignments
      if (userUnitIds.length > 0) {
        assignmentConditions.push(
          and(
            sql`${quizCollectionAssignments.unitId} IN (${sql.join(userUnitIds.map(id => sql`${id}`), sql`, `)})`,
            sql`${quizCollectionAssignments.subjectId} IS NULL`
          )!
        );
      }
      
      // Pattern 3: Subject-only quizzes - CONSTRAINED to subjects in user's departments
      // Only show subject-only quizzes if the subject is part of user's department-subject enrollments
      if (uniqueValidSubjects.length > 0) {
        assignmentConditions.push(
          and(
            sql`${quizCollectionAssignments.unitId} IS NULL`,
            sql`${quizCollectionAssignments.subjectId} IN (${sql.join(uniqueValidSubjects.map(id => sql`${id}`), sql`, `)})`
          )!
        );
      }
      
      // Pattern 4: Organization-wide quizzes (NULL unit AND NULL subject)
      assignmentConditions.push(
        and(
          sql`${quizCollectionAssignments.unitId} IS NULL`,
          sql`${quizCollectionAssignments.subjectId} IS NULL`
        )!
      );
      
      conditions.push(or(...assignmentConditions)!);
    }
    
    const collections = await baseQuery
      .where(and(...conditions))
      .orderBy(desc(quizCollections.createdAt));
    
    // Remove duplicates
    const unique = Array.from(new Map(collections.map(item => [item.id, item])).values());
    return unique;
  }
  
  // Quiz cards
  async createQuizCard(card: InsertQuizCard): Promise<QuizCard> {
    const [quizCard] = await db.insert(quizCards).values(card).returning();
    await db.update(quizCollections).set({ totalCards: sql`${quizCollections.totalCards} + 1` }).where(eq(quizCollections.id, card.collectionId));
    return quizCard;
  }
  
  async getQuizCards(collectionId: string): Promise<any[]> {
    const cards = await db.select().from(quizCards).where(eq(quizCards.collectionId, collectionId)).orderBy(quizCards.displayOrder);
    return cards.map(card => ({
      id: card.id,
      collectionId: card.collectionId,
      question: card.question,
      questionType: card.questionType,
      answer1: card.answer1,
      answer2: card.answer2,
      answer3: card.answer3,
      answer4: card.answer4,
      answer5: card.answer5,
      answer6: card.answer6,
      correctAnswerIndex: card.correctAnswerIndex,
      matchPairs: card.matchPairs,
      correctAnswer: card.correctAnswer,
      imageKey: card.imageKey,
      displayOrder: card.displayOrder,
      createdAt: card.createdAt
    }));
  }
  
  async getQuizCard(id: string): Promise<QuizCard | undefined> {
    const [card] = await db.select().from(quizCards).where(eq(quizCards.id, id));
    return card;
  }
  
  async updateQuizCard(id: string, updates: Partial<InsertQuizCard>): Promise<QuizCard | undefined> {
    const [card] = await db.update(quizCards).set(updates).where(eq(quizCards.id, id)).returning();
    return card;
  }
  
  async deleteQuizCard(id: string): Promise<boolean> {
    const [card] = await db.select().from(quizCards).where(eq(quizCards.id, id));
    if (card) {
      await db.delete(quizCards).where(eq(quizCards.id, id));
      await db.update(quizCollections).set({ totalCards: sql`${quizCollections.totalCards} - 1` }).where(eq(quizCollections.id, card.collectionId));
    }
    return true;
  }
  
  // Quiz collection assignments
  async assignQuizCollection(collectionId: string, unitId?: string, subUnitId?: string, requiredPassPercentage?: number, subjectId?: string, availableFrom?: string | null, availableTo?: string | null): Promise<QuizCollectionAssignment | null> {
    // Validate that if both unitId and subjectId are provided, they exist together in unitSubjects
    // This prevents quiz assignments to unit+subject combinations that don't exist
    if (unitId && subjectId) {
      const validCombination = await db.select()
        .from(unitSubjects)
        .where(
          and(
            eq(unitSubjects.unitId, unitId),
            eq(unitSubjects.subjectId, subjectId)
          )
        )
        .limit(1);
      
      if (validCombination.length === 0) {
        throw new Error(`Invalid quiz assignment: unit ${unitId} and subject ${subjectId} are not linked in unitSubjects table. Please ensure this subject is configured for this grade before assigning quizzes.`);
      }
    }
    
    // Use onConflictDoUpdate to update existing assignments instead of creating duplicates
    // The unique constraint is on (collectionId, unitId, subUnitId, subjectId)
    const [assignment] = await db.insert(quizCollectionAssignments).values({ 
      collectionId, 
      unitId, 
      subUnitId,
      subjectId,
      requiredPassPercentage: requiredPassPercentage || 70,
      availableFrom: availableFrom ? new Date(availableFrom) : null,
      availableTo: availableTo ? new Date(availableTo) : null,
    })
    .onConflictDoUpdate({
      target: [
        quizCollectionAssignments.collectionId,
        quizCollectionAssignments.unitId,
        quizCollectionAssignments.subUnitId,
        quizCollectionAssignments.subjectId
      ],
      set: {
        requiredPassPercentage: requiredPassPercentage || 70,
        availableFrom: availableFrom ? new Date(availableFrom) : null,
        availableTo: availableTo ? new Date(availableTo) : null,
      }
    })
    .returning();
    return assignment;
  }
  
  async getQuizCollectionAssignments(collectionId: string): Promise<QuizCollectionAssignment[]> {
    return await db.select().from(quizCollectionAssignments).where(eq(quizCollectionAssignments.collectionId, collectionId));
  }
  
  async getQuizCollectionAssignment(id: string): Promise<QuizCollectionAssignment | undefined> {
    const [assignment] = await db.select().from(quizCollectionAssignments).where(eq(quizCollectionAssignments.id, id));
    return assignment;
  }
  
  async removeQuizCollectionAssignment(id: string): Promise<boolean> {
    await db.delete(quizCollectionAssignments).where(eq(quizCollectionAssignments.id, id));
    return true;
  }

  async updateQuizAssignmentAvailability(id: string, availableFrom: string | null, availableTo: string | null): Promise<boolean> {
    await db.update(quizCollectionAssignments).set({
      availableFrom: availableFrom ? new Date(availableFrom) : null,
      availableTo: availableTo ? new Date(availableTo) : null,
    }).where(eq(quizCollectionAssignments.id, id));
    return true;
  }
  
  // Active quiz games
  async createActiveQuizGame(gameData: InsertActiveQuizGame): Promise<ActiveQuizGame> {
    const [game] = await db.insert(activeQuizGames).values(gameData).returning();
    return game;
  }
  
  async getActiveQuizGame(gameId: string): Promise<ActiveQuizGame | undefined> {
    const [game] = await db.select().from(activeQuizGames).where(eq(activeQuizGames.gameId, gameId));
    return game;
  }
  
  async updateActiveQuizGame(gameId: string, updates: Partial<InsertActiveQuizGame>): Promise<ActiveQuizGame | undefined> {
    // Filter out undefined values and build update object
    const setData: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) {
        // Skip undefined values - they shouldn't be updated
        continue;
      }
      // Drizzle automatically handles jsonb serialization for jsonb columns
      // Just pass the value directly - no manual JSON.stringify or sql casting needed
      setData[key] = value;
    }
    
    // Always update lastActivityAt
    setData.lastActivityAt = new Date();
    
    if (Object.keys(setData).length === 1) { // Only lastActivityAt
      return this.getActiveQuizGame(gameId);
    }
    
    // Use Drizzle's query builder - it will automatically serialize jsonb columns
    const [game] = await db.update(activeQuizGames)
      .set(setData)
      .where(eq(activeQuizGames.gameId, gameId))
      .returning();
    return game;
  }
  
  async deleteActiveQuizGame(gameId: string): Promise<boolean> {
    await db.delete(activeQuizGames).where(eq(activeQuizGames.gameId, gameId));
    return true;
  }
  
  // Quiz game progress and results
  async upsertQuizGameProgress(userId: string, collectionId: string, updates: Partial<InsertQuizGameProgress>, orgMeta?: { organizationId?: string; unitId?: string; subUnitId?: string }): Promise<QuizGameProgress> {
    const [existing] = await db.select().from(quizGameProgress).where(and(eq(quizGameProgress.userId, userId), eq(quizGameProgress.collectionId, collectionId)));
    
    if (existing) {
      const [updated] = await db.update(quizGameProgress).set({ ...updates, updatedAt: new Date() }).where(and(eq(quizGameProgress.userId, userId), eq(quizGameProgress.collectionId, collectionId))).returning();
      return updated;
    } else {
      const [created] = await db.insert(quizGameProgress).values({ userId, collectionId, ...updates, ...orgMeta }).returning();
      return created;
    }
  }
  
  async getQuizGameProgress(userId: string, collectionId: string): Promise<QuizGameProgress | undefined> {
    const [progress] = await db.select().from(quizGameProgress).where(and(eq(quizGameProgress.userId, userId), eq(quizGameProgress.collectionId, collectionId)));
    return progress;
  }
  
  async createQuizGameResult(result: InsertQuizGameResult): Promise<QuizGameResult> {
    const [gameResult] = await db.insert(quizGameResults).values(result).returning();
    return gameResult;
  }
  
  async getQuizGameResults(userId: string, collectionId?: string): Promise<QuizGameResult[]> {
    if (collectionId) {
      return await db.select().from(quizGameResults).where(and(eq(quizGameResults.player1Id, userId), eq(quizGameResults.collectionId, collectionId))).orderBy(desc(quizGameResults.createdAt));
    }
    return await db.select().from(quizGameResults).where(eq(quizGameResults.player1Id, userId)).orderBy(desc(quizGameResults.createdAt));
  }
  
  // User quiz progress (completion tracking)
  async upsertUserQuizProgress(userId: string, collectionId: string, data: {
    attempts: number;
    lastScore: number;
    bestScore: number;
    lastPercentage: number;
    bestPercentage: number;
    completionStatus: 'outstanding' | 'completed_passed' | 'completed_failed';
  }, orgMeta?: { organizationId?: string; unitId?: string; subUnitId?: string }): Promise<any> {
    const [existing] = await db.select().from(userQuizProgress)
      .where(and(
        eq(userQuizProgress.userId, userId),
        eq(userQuizProgress.collectionId, collectionId)
      ));
    
    if (existing) {
      const [updated] = await db.update(userQuizProgress)
        .set({
          attemptsCount: data.attempts,
          bestScore: data.bestScore,
          bestPercentage: data.bestPercentage.toString(),
          completionStatus: data.completionStatus,
          isPassed: data.completionStatus === 'completed_passed',
          lastAttemptAt: new Date(),
          passedAt: data.completionStatus === 'completed_passed' && !existing.passedAt ? new Date() : existing.passedAt
        })
        .where(and(
          eq(userQuizProgress.userId, userId),
          eq(userQuizProgress.collectionId, collectionId)
        ))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(userQuizProgress)
        .values({
          userId,
          collectionId,
          attemptsCount: data.attempts,
          bestScore: data.bestScore,
          bestPercentage: data.bestPercentage.toString(),
          completionStatus: data.completionStatus,
          isPassed: data.completionStatus === 'completed_passed',
          lastAttemptAt: new Date(),
          passedAt: data.completionStatus === 'completed_passed' ? new Date() : null,
          ...orgMeta
        })
        .returning();
      return created;
    }
  }
  
  async getUserQuizProgress(userId: string, collectionId: string): Promise<any | undefined> {
    const [progress] = await db.select().from(userQuizProgress)
      .where(and(
        eq(userQuizProgress.userId, userId),
        eq(userQuizProgress.collectionId, collectionId)
      ));
    return progress;
  }
  
  async getUserAllQuizProgress(userId: string): Promise<any[]> {
    return await db.select().from(userQuizProgress)
      .where(eq(userQuizProgress.userId, userId));
  }
  
  async getQuizLeaderboard(filters: { organizationId?: string; unitId?: string; subUnitId?: string; subjectId?: string; days?: number; limit?: number; collectionType?: 'public' | 'organization' }): Promise<any[]> {
    const { organizationId, unitId, subUnitId, subjectId, days, limit = 50, collectionType } = filters;
    
    // Build the base query with aggregated quiz progress
    // SUM totalGamesPlayed across collections (total quiz attempts including replays)
    // SUM totalGamesWon across collections (number of quizzes passed)
    let query = db
      .select({
        userId: quizGameProgress.userId,
        gamerName: users.gamerName,
        avatarImageUrl: users.avatarImageUrl,
        country: users.country,
        currentXP: playerStats.currentXP,
        currentLevel: playerStats.currentLevel,
        totalGamesPlayed: sql<number>`SUM(${quizGameProgress.totalGamesPlayed})`.as('totalGamesPlayed'),
        totalGamesWon: sql<number>`SUM(${quizGameProgress.totalGamesWon})`.as('totalGamesWon'),
        totalCorrectAnswers: sql<number>`SUM(${quizGameProgress.totalCorrectAnswers})`.as('totalCorrectAnswers'),
        totalAnswers: sql<number>`SUM(${quizGameProgress.totalAnswers})`.as('totalAnswers'),
        averageAccuracy: sql<number>`ROUND((SUM(${quizGameProgress.totalCorrectAnswers})::NUMERIC / NULLIF(SUM(${quizGameProgress.totalAnswers}), 0)) * 100, 2)`.as('averageAccuracy'),
        organizationId: userOrganizationRoles.organizationId,
        organizationName: organizations.name,
        unitId: userOrganizationAssignments.unitId,
        unitName: organizationUnits.name,
        subUnitId: userOrganizationAssignments.subUnitId,
        subUnitName: organizationSubUnits.name,
        coinBalance: sql<number>`
          COALESCE((
            SELECT balance
            FROM "coinTransactions"
            WHERE "userId" = ${users.id}
            ORDER BY "createdAt" DESC
            LIMIT 1
          ), 0)
        `.as('coinBalance'),
        equippedCosmetics: sql<any>`
          (SELECT json_object_agg(ec.slot, json_build_object(
            'cosmeticId', ec."cosmeticId",
            'name', cc.name,
            'effect', cc.effect,
            'tier', cc.tier
          ))
          FROM "equippedCosmetics" ec
          LEFT JOIN "cosmeticCatalog" cc ON ec."cosmeticId" = cc.id
          WHERE ec."userId" = ${users.id})
        `.as('equippedCosmetics'),
      })
      .from(quizGameProgress)
      .innerJoin(users, eq(quizGameProgress.userId, users.id))
      .leftJoin(playerStats, eq(users.id, playerStats.playerId))
      .leftJoin(userOrganizationRoles, eq(users.id, userOrganizationRoles.userId))
      .leftJoin(organizations, eq(userOrganizationRoles.organizationId, organizations.id))
      .leftJoin(userOrganizationAssignments, eq(users.id, userOrganizationAssignments.userId))
      .leftJoin(organizationUnits, eq(userOrganizationAssignments.unitId, organizationUnits.id))
      .leftJoin(organizationSubUnits, eq(userOrganizationAssignments.subUnitId, organizationSubUnits.id))
      .leftJoin(quizCollections, eq(quizGameProgress.collectionId, quizCollections.id));
    
    // Apply organization filter
    const conditions = [];
    if (organizationId) {
      conditions.push(eq(userOrganizationRoles.organizationId, organizationId));
    }
    
    // Apply unit filter
    if (unitId) {
      conditions.push(eq(userOrganizationAssignments.unitId, unitId));
    }
    
    // Apply subUnit filter
    if (subUnitId) {
      conditions.push(eq(userOrganizationAssignments.subUnitId, subUnitId));
    }
    
    // Apply subject filter (through quiz collections)
    if (subjectId) {
      conditions.push(eq(quizCollections.subjectId, subjectId));
    }
    
    // Apply collection type filter
    if (collectionType === 'public') {
      conditions.push(eq(quizCollections.isPublic, true));
    } else if (collectionType === 'organization') {
      conditions.push(eq(quizCollections.isPublic, false));
    }
    
    // Apply date filter if specified
    if (days) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      conditions.push(sql`${quizGameProgress.lastPlayedAt} >= ${cutoffDate}`);
    }
    
    // Apply all conditions
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    // Group by user and organization details
    const results = await query
      .groupBy(
        quizGameProgress.userId,
        users.gamerName,
        users.avatarImageUrl,
        users.country,
        users.id,
        playerStats.currentXP,
        playerStats.currentLevel,
        userOrganizationRoles.organizationId,
        organizations.name,
        userOrganizationAssignments.unitId,
        organizationUnits.name,
        userOrganizationAssignments.subUnitId,
        organizationSubUnits.name
      )
      .orderBy(
        desc(playerStats.currentXP), // Primary: XP
        desc(sql`ROUND((SUM(${quizGameProgress.totalCorrectAnswers})::NUMERIC / NULLIF(SUM(${quizGameProgress.totalAnswers}), 0)) * 100, 2)`), // Secondary: Average accuracy percentage
        desc(sql`SUM(${quizGameProgress.totalGamesPlayed})`), // Tertiary: total games played
        desc(sql`SUM(${quizGameProgress.totalGamesWon})`) // Quaternary: quizzes passed
      )
      .limit(limit);
    
    return results;
  }
  
  // Reporting methods
  async getStudentPerformanceByCollection(userId: string, orgId: string): Promise<any[]> {
    // First verify user belongs to this organization
    const userRole = await db
      .select()
      .from(userOrganizationRoles)
      .where(and(
        eq(userOrganizationRoles.userId, userId),
        eq(userOrganizationRoles.organizationId, orgId)
      ))
      .limit(1);
    
    if (userRole.length === 0) {
      throw new Error('User not found in this organization');
    }
    
    const progress = await db
      .select({
        collectionId: quizGameProgress.collectionId,
        collectionName: quizCollections.name,
        subjectId: quizCollections.subjectId,
        subjectName: subjects.name,
        totalGamesPlayed: quizGameProgress.totalGamesPlayed,
        totalGamesWon: quizGameProgress.totalGamesWon,
        totalCorrectAnswers: quizGameProgress.totalCorrectAnswers,
        totalAnswers: quizGameProgress.totalAnswers,
        averageScore: quizGameProgress.averageScore,
        bestScore: quizGameProgress.bestScore,
        lastPlayedAt: quizGameProgress.lastPlayedAt,
      })
      .from(quizGameProgress)
      .leftJoin(quizCollections, eq(quizGameProgress.collectionId, quizCollections.id))
      .leftJoin(subjects, eq(quizCollections.subjectId, subjects.id))
      .where(and(
        eq(quizGameProgress.userId, userId),
        or(eq(quizCollections.isDeleted, false), sql`${quizCollections.isDeleted} IS NULL`)
      ))
      .orderBy(desc(quizGameProgress.lastPlayedAt));
    
    return progress;
  }
  
  async getUnitPerformanceSummary(unitId: string, orgId: string): Promise<any> {
    // First verify unit belongs to this organization
    const unit = await db
      .select()
      .from(organizationUnits)
      .where(and(
        eq(organizationUnits.id, unitId),
        eq(organizationUnits.organizationId, orgId)
      ))
      .limit(1);
    
    if (unit.length === 0) {
      throw new Error('Unit not found in this organization');
    }
    
    // Get all students in this unit
    const studentsInUnit = await db
      .select({
        userId: userOrganizationRoles.userId,
        gamerName: users.gamerName,
      })
      .from(userOrganizationRoles)
      .innerJoin(userOrganizationAssignments, eq(userOrganizationRoles.userId, userOrganizationAssignments.userId))
      .leftJoin(users, eq(userOrganizationRoles.userId, users.id))
      .where(and(
        eq(userOrganizationAssignments.unitId, unitId),
        inArray(userOrganizationRoles.role, LEARNER_ROLES)
      ));
    
    const studentIds = studentsInUnit.map(s => s.userId);
    
    if (studentIds.length === 0) {
      return {
        totalStudents: 0,
        totalGamesPlayed: 0,
        averageScore: 0,
        topPerformers: [],
      };
    }
    
    // Get aggregated performance data
    const performanceData = await db
      .select({
        totalGamesPlayed: sql<number>`SUM(${quizGameProgress.totalGamesPlayed})`,
        totalGamesWon: sql<number>`SUM(${quizGameProgress.totalGamesWon})`,
        avgScore: sql<number>`AVG(${quizGameProgress.averageScore})`,
      })
      .from(quizGameProgress)
      .where(sql`${quizGameProgress.userId} IN (${sql.join(studentIds.map(id => sql`${id}`), sql`, `)})`);
    
    // Get top performers
    const topPerformers = await db
      .select({
        userId: quizGameProgress.userId,
        gamerName: users.gamerName,
        currentXP: playerStats.currentXP,
        totalGamesPlayed: sql<number>`SUM(${quizGameProgress.totalGamesPlayed})`,
        totalGamesWon: sql<number>`SUM(${quizGameProgress.totalGamesWon})`,
        totalCorrectAnswers: sql<number>`SUM(${quizGameProgress.totalCorrectAnswers})`,
        totalAnswers: sql<number>`SUM(${quizGameProgress.totalAnswers})`,
        averageScore: sql<number>`AVG(${quizGameProgress.averageScore})`,
        averageAccuracy: sql<number>`ROUND((SUM(${quizGameProgress.totalCorrectAnswers})::NUMERIC / NULLIF(SUM(${quizGameProgress.totalAnswers}), 0)) * 100, 2)`,
      })
      .from(quizGameProgress)
      .leftJoin(users, eq(quizGameProgress.userId, users.id))
      .leftJoin(playerStats, eq(users.id, playerStats.playerId))
      .where(sql`${quizGameProgress.userId} IN (${sql.join(studentIds.map(id => sql`${id}`), sql`, `)})`)
      .groupBy(quizGameProgress.userId, users.gamerName, playerStats.currentXP)
      .orderBy(
        desc(playerStats.currentXP),
        desc(sql`ROUND((SUM(${quizGameProgress.totalCorrectAnswers})::NUMERIC / NULLIF(SUM(${quizGameProgress.totalAnswers}), 0)) * 100, 2)`),
        desc(sql`SUM(${quizGameProgress.totalGamesPlayed})`),
        desc(sql`SUM(${quizGameProgress.totalGamesWon})`)
      )
      .limit(10);
    
    return {
      totalStudents: studentIds.length,
      totalGamesPlayed: performanceData[0]?.totalGamesPlayed || 0,
      totalGamesWon: performanceData[0]?.totalGamesWon || 0,
      averageScore: performanceData[0]?.avgScore || 0,
      topPerformers,
    };
  }
  
  async getOrganizationPerformanceSummary(orgId: string): Promise<any> {
    // Get all students in this organization
    const studentsInOrg = await db
      .select({
        userId: userOrganizationRoles.userId,
        gamerName: users.gamerName,
        unitId: userOrganizationAssignments.unitId,
        unitName: organizationUnits.name,
      })
      .from(userOrganizationRoles)
      .leftJoin(users, eq(userOrganizationRoles.userId, users.id))
      .leftJoin(userOrganizationAssignments, eq(userOrganizationRoles.userId, userOrganizationAssignments.userId))
      .leftJoin(organizationUnits, eq(userOrganizationAssignments.unitId, organizationUnits.id))
      .where(and(
        eq(userOrganizationRoles.organizationId, orgId),
        inArray(userOrganizationRoles.role, LEARNER_ROLES)
      ));
    
    const studentIds = studentsInOrg.map(s => s.userId);
    
    if (studentIds.length === 0) {
      return {
        totalStudents: 0,
        totalGamesPlayed: 0,
        averageScore: 0,
        topPerformers: [],
        unitBreakdown: [],
      };
    }
    
    // Get aggregated performance data
    const performanceData = await db
      .select({
        totalGamesPlayed: sql<number>`SUM(${quizGameProgress.totalGamesPlayed})`,
        totalGamesWon: sql<number>`SUM(${quizGameProgress.totalGamesWon})`,
        avgScore: sql<number>`AVG(${quizGameProgress.averageScore})`,
      })
      .from(quizGameProgress)
      .where(sql`${quizGameProgress.userId} IN (${sql.join(studentIds.map(id => sql`${id}`), sql`, `)})`);
    
    // Get top performers
    const topPerformers = await db
      .select({
        userId: quizGameProgress.userId,
        gamerName: users.gamerName,
        currentXP: playerStats.currentXP,
        totalGamesPlayed: sql<number>`SUM(${quizGameProgress.totalGamesPlayed})`,
        totalGamesWon: sql<number>`SUM(${quizGameProgress.totalGamesWon})`,
        totalCorrectAnswers: sql<number>`SUM(${quizGameProgress.totalCorrectAnswers})`,
        totalAnswers: sql<number>`SUM(${quizGameProgress.totalAnswers})`,
        averageScore: sql<number>`AVG(${quizGameProgress.averageScore})`,
        averageAccuracy: sql<number>`ROUND((SUM(${quizGameProgress.totalCorrectAnswers})::NUMERIC / NULLIF(SUM(${quizGameProgress.totalAnswers}), 0)) * 100, 2)`,
      })
      .from(quizGameProgress)
      .leftJoin(users, eq(quizGameProgress.userId, users.id))
      .leftJoin(playerStats, eq(users.id, playerStats.playerId))
      .where(sql`${quizGameProgress.userId} IN (${sql.join(studentIds.map(id => sql`${id}`), sql`, `)})`)
      .groupBy(quizGameProgress.userId, users.gamerName, playerStats.currentXP)
      .orderBy(
        desc(playerStats.currentXP),
        desc(sql`ROUND((SUM(${quizGameProgress.totalCorrectAnswers})::NUMERIC / NULLIF(SUM(${quizGameProgress.totalAnswers}), 0)) * 100, 2)`),
        desc(sql`SUM(${quizGameProgress.totalGamesPlayed})`),
        desc(sql`SUM(${quizGameProgress.totalGamesWon})`)
      )
      .limit(10);
    
    return {
      totalStudents: studentIds.length,
      totalGamesPlayed: performanceData[0]?.totalGamesPlayed || 0,
      totalGamesWon: performanceData[0]?.totalGamesWon || 0,
      averageScore: performanceData[0]?.avgScore || 0,
      topPerformers,
    };
  }
  
  async getTopPerformers(orgId: string, filters?: { 
    unitId?: string; 
    subjectId?: string; 
    studentId?: string;
    startDate?: Date; 
    endDate?: Date; 
    limit?: number 
  }): Promise<any[]> {
    const limit = filters?.limit || 20;
    
    // Build student filter conditions
    const studentConditions: any[] = [
      eq(userOrganizationRoles.organizationId, orgId),
    ];
    
    // Filter by specific student if provided
    if (filters?.studentId) {
      studentConditions.push(eq(userOrganizationRoles.userId, filters.studentId));
    }
    
    // Get students in organization (with optional unit filter)
    let studentsQuery = db
      .select({
        userId: userOrganizationRoles.userId,
        gamerName: users.gamerName,
        email: users.email,
        unitId: userOrganizationAssignments.unitId,
        unitName: organizationUnits.name,
      })
      .from(userOrganizationRoles)
      .leftJoin(users, eq(userOrganizationRoles.userId, users.id))
      .leftJoin(userOrganizationAssignments, eq(userOrganizationRoles.userId, userOrganizationAssignments.userId))
      .leftJoin(organizationUnits, eq(userOrganizationAssignments.unitId, organizationUnits.id))
      .where(and(...studentConditions));
    
    const students = await studentsQuery;
    
    // Apply unit filter if provided
    let filteredStudents = students;
    if (filters?.unitId) {
      filteredStudents = students.filter(s => s.unitId === filters.unitId);
    }
    
    const studentIds = filteredStudents.map(s => s.userId);
    
    if (studentIds.length === 0) {
      return [];
    }
    
    // Build progress query conditions
    const progressConditions: any[] = [
      sql`${quizGameProgress.userId} IN (${sql.join(studentIds.map(id => sql`${id}`), sql`, `)})`
    ];
    
    // Filter by date range if provided
    if (filters?.startDate) {
      progressConditions.push(sql`${quizGameProgress.lastPlayedAt} >= ${filters.startDate}`);
    }
    if (filters?.endDate) {
      progressConditions.push(sql`${quizGameProgress.lastPlayedAt} <= ${filters.endDate}`);
    }
    
    // Filter by subject if provided, OR if unitId is provided without subjectId,
    // include all subjects assigned to that unit
    if (filters?.subjectId) {
      progressConditions.push(eq(quizCollections.subjectId, filters.subjectId));
    } else if (filters?.unitId) {
      // Get all subjects assigned to this unit
      const unitSubjectsData = await db
        .select({ subjectId: unitSubjects.subjectId })
        .from(unitSubjects)
        .where(eq(unitSubjects.unitId, filters.unitId));
      
      const subjectIds = unitSubjectsData.map(us => us.subjectId);
      
      if (subjectIds.length > 0) {
        // Filter quiz collections to only those with subjects assigned to this unit
        progressConditions.push(
          sql`${quizCollections.subjectId} IN (${sql.join(subjectIds.map(id => sql`${id}`), sql`, `)})`
        );
      }
    }
    
    // Get top performers with all filters applied
    const topPerformers = await db
      .select({
        userId: quizGameProgress.userId,
        gamerName: users.gamerName,
        email: users.email,
        currentXP: playerStats.currentXP,
        unitId: userOrganizationAssignments.unitId,
        unitName: organizationUnits.name,
        totalGamesPlayed: sql<number>`SUM(${quizGameProgress.totalGamesPlayed})`,
        totalGamesWon: sql<number>`SUM(${quizGameProgress.totalGamesWon})`,
        totalCorrectAnswers: sql<number>`SUM(${quizGameProgress.totalCorrectAnswers})`,
        totalAnswers: sql<number>`SUM(${quizGameProgress.totalAnswers})`,
        averageScore: sql<number>`AVG(${quizGameProgress.averageScore})`,
        averageAccuracy: sql<number>`ROUND((SUM(${quizGameProgress.totalCorrectAnswers})::NUMERIC / NULLIF(SUM(${quizGameProgress.totalAnswers}), 0)) * 100, 2)`,
        bestScore: sql<number>`MAX(${quizGameProgress.bestScore})`,
        lastPlayedAt: sql<Date>`MAX(${quizGameProgress.lastPlayedAt})`,
      })
      .from(quizGameProgress)
      .leftJoin(users, eq(quizGameProgress.userId, users.id))
      .leftJoin(playerStats, eq(users.id, playerStats.playerId))
      .leftJoin(quizCollections, eq(quizGameProgress.collectionId, quizCollections.id))
      .leftJoin(userOrganizationAssignments, eq(quizGameProgress.userId, userOrganizationAssignments.userId))
      .leftJoin(organizationUnits, eq(userOrganizationAssignments.unitId, organizationUnits.id))
      .where(and(...progressConditions))
      .groupBy(
        quizGameProgress.userId, 
        users.gamerName, 
        users.email,
        playerStats.currentXP,
        userOrganizationAssignments.unitId,
        organizationUnits.name
      )
      .orderBy(
        desc(playerStats.currentXP),
        desc(sql`ROUND((SUM(${quizGameProgress.totalCorrectAnswers})::NUMERIC / NULLIF(SUM(${quizGameProgress.totalAnswers}), 0)) * 100, 2)`),
        desc(sql`SUM(${quizGameProgress.totalGamesPlayed})`),
        desc(sql`SUM(${quizGameProgress.totalGamesWon})`)
      )
      .limit(limit);
    
    return topPerformers;
  }
  
  async getStudentDetailedResults(userId: string, orgId: string, collectionId?: string): Promise<any[]> {
    // First verify user belongs to this organization
    const userRole = await db
      .select()
      .from(userOrganizationRoles)
      .where(and(
        eq(userOrganizationRoles.userId, userId),
        eq(userOrganizationRoles.organizationId, orgId)
      ))
      .limit(1);
    
    if (userRole.length === 0) {
      throw new Error('User not found in this organization');
    }
    
    if (collectionId) {
      return await db
        .select({
          id: quizGameResults.id,
          gameId: quizGameResults.gameId,
          collectionId: quizGameResults.collectionId,
          collectionName: quizCollections.name,
          gameMode: quizGameResults.gameMode,
          score: quizGameResults.player1Score,
          correctAnswers: quizGameResults.player1CorrectAnswers,
          totalAnswers: quizGameResults.player1TotalAnswers,
          gameDuration: quizGameResults.gameDuration,
          gameStartedAt: quizGameResults.gameStartedAt,
          gameEndedAt: quizGameResults.gameEndedAt,
        })
        .from(quizGameResults)
        .leftJoin(quizCollections, eq(quizGameResults.collectionId, quizCollections.id))
        .where(and(
          eq(quizGameResults.player1Id, userId),
          eq(quizGameResults.collectionId, collectionId),
          or(eq(quizCollections.isDeleted, false), sql`${quizCollections.isDeleted} IS NULL`)
        ))
        .orderBy(desc(quizGameResults.createdAt));
    }
    
    return await db
      .select({
        id: quizGameResults.id,
        gameId: quizGameResults.gameId,
        collectionId: quizGameResults.collectionId,
        collectionName: quizCollections.name,
        gameMode: quizGameResults.gameMode,
        score: quizGameResults.player1Score,
        correctAnswers: quizGameResults.player1CorrectAnswers,
        totalAnswers: quizGameResults.player1TotalAnswers,
        gameDuration: quizGameResults.gameDuration,
        gameStartedAt: quizGameResults.gameStartedAt,
        gameEndedAt: quizGameResults.gameEndedAt,
      })
      .from(quizGameResults)
      .leftJoin(quizCollections, eq(quizGameResults.collectionId, quizCollections.id))
      .where(and(
        eq(quizGameResults.player1Id, userId),
        or(eq(quizCollections.isDeleted, false), sql`${quizCollections.isDeleted} IS NULL`)
      ))
      .orderBy(desc(quizGameResults.createdAt));
  }

  // Comprehensive Student Analytics
  async getStudentAnalytics(studentId: string, organizationId: string, filters?: {
    unitId?: string;
    subjectId?: string;
  }): Promise<any> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Build progress query conditions with organization scoping
    const progressConditions: any[] = [
      eq(quizGameProgress.userId, studentId),
      eq(quizGameProgress.organizationId, organizationId)
    ];
    
    if (filters?.unitId && filters.unitId !== 'all') {
      progressConditions.push(eq(quizGameProgress.unitId, filters.unitId));
    }
    
    if (filters?.subjectId && filters.subjectId !== 'all') {
      progressConditions.push(eq(quizCollections.subjectId, filters.subjectId));
    }

    // Get overall performance (scoped to organization and unit)
    const [overallPerf] = await db
      .select({
        totalGames: sql<number>`SUM(${quizGameProgress.totalGamesPlayed})`,
        totalCorrect: sql<number>`SUM(${quizGameProgress.totalCorrectAnswers})`,
        totalAnswers: sql<number>`SUM(${quizGameProgress.totalAnswers})`,
      })
      .from(quizGameProgress)
      .leftJoin(quizCollections, eq(quizGameProgress.collectionId, quizCollections.id))
      .where(and(
        ...progressConditions,
        or(eq(quizCollections.isDeleted, false), sql`${quizCollections.isDeleted} IS NULL`)
      ));

    // Get average time from quiz results (scoped by matching with quizGameProgress)
    const avgTimeConditions: any[] = [
      eq(quizGameResults.player1Id, studentId)
    ];
    
    if (filters?.subjectId && filters.subjectId !== 'all') {
      avgTimeConditions.push(eq(quizCollections.subjectId, filters.subjectId));
    }
    
    // Filter by collections that match the organization/unit criteria from progress
    const allowedCollections = await db
      .select({ collectionId: quizGameProgress.collectionId })
      .from(quizGameProgress)
      .leftJoin(quizCollections, eq(quizGameProgress.collectionId, quizCollections.id))
      .where(and(...progressConditions))
      .groupBy(quizGameProgress.collectionId);
    
    // If no progress records exist for this student in the organization, return empty analytics
    if (allowedCollections.length === 0) {
      return {
        overallAccuracy: 0,
        totalGames: 0,
        averageTimeMinutes: null,
        riskLevel: 'good' as const,
        performanceTrend: [],
        subjectBreakdown: [],
        strengths: [],
        weaknesses: [],
        quizAttempts: [],
      };
    }
    
    const collectionIds = allowedCollections.map(c => c.collectionId);
    avgTimeConditions.push(sql`${quizGameResults.collectionId} IN (${sql.join(collectionIds.map(id => sql`${id}`), sql`, `)})`);

    
    const [avgTimeData] = await db
      .select({
        avgDuration: sql<number>`AVG(${quizGameResults.gameDuration})`,
      })
      .from(quizGameResults)
      .leftJoin(quizCollections, eq(quizGameResults.collectionId, quizCollections.id))
      .where(and(...avgTimeConditions));

    const overallAccuracy = overallPerf?.totalAnswers 
      ? Math.round((overallPerf.totalCorrect / overallPerf.totalAnswers) * 100) 
      : 0;

    // Get performance trend (last 30 days, scoped by matching with progress)
    const trendConditions: any[] = [
      eq(quizGameResults.player1Id, studentId),
      gte(quizGameResults.gameEndedAt, thirtyDaysAgo)
    ];
    
    if (filters?.subjectId && filters.subjectId !== 'all') {
      trendConditions.push(eq(quizCollections.subjectId, filters.subjectId));
    }
    
    // Use allowed collections (already checked above, safe to use)
    trendConditions.push(sql`${quizGameResults.collectionId} IN (${sql.join(collectionIds.map(id => sql`${id}`), sql`, `)})`);

    
    const trendData = await db
      .select({
        date: sql<string>`DATE(${quizGameResults.gameEndedAt})`,
        correct: sql<number>`SUM(${quizGameResults.player1CorrectAnswers})`,
        total: sql<number>`SUM(${quizGameResults.player1TotalAnswers})`,
      })
      .from(quizGameResults)
      .leftJoin(quizCollections, eq(quizGameResults.collectionId, quizCollections.id))
      .where(and(...trendConditions))
      .groupBy(sql`DATE(${quizGameResults.gameEndedAt})`)
      .orderBy(sql`DATE(${quizGameResults.gameEndedAt})`);

    const performanceTrend = trendData.map(d => ({
      date: d.date,
      accuracy: d.total ? Math.round((d.correct / d.total) * 100) : 0,
    }));

    // Get subject breakdown (scoped to organization)
    const subjectConditions: any[] = [
      eq(quizGameProgress.userId, studentId),
      eq(quizGameProgress.organizationId, organizationId),
      sql`${quizCollections.subjectId} IS NOT NULL`
    ];
    
    if (filters?.unitId && filters.unitId !== 'all') {
      subjectConditions.push(eq(quizGameProgress.unitId, filters.unitId));
    }
    
    const subjectData = await db
      .select({
        subjectId: quizCollections.subjectId,
        subjectName: subjects.name,
        correct: sql<number>`SUM(${quizGameProgress.totalCorrectAnswers})`,
        total: sql<number>`SUM(${quizGameProgress.totalAnswers})`,
        attempts: sql<number>`SUM(${quizGameProgress.totalGamesPlayed})`,
      })
      .from(quizGameProgress)
      .leftJoin(quizCollections, eq(quizGameProgress.collectionId, quizCollections.id))
      .leftJoin(subjects, eq(quizCollections.subjectId, subjects.id))
      .where(and(...subjectConditions))
      .groupBy(quizCollections.subjectId, subjects.name);

    const subjectBreakdown = subjectData.map(s => ({
      name: s.subjectName || 'Unknown',
      accuracy: s.total ? Math.round((s.correct / s.total) * 100) : 0,
      attempts: s.attempts,
    }));

    // Identify strengths (top 3 subjects)
    const strengths = [...subjectBreakdown]
      .filter(s => s.attempts >= 2)
      .sort((a, b) => b.accuracy - a.accuracy)
      .slice(0, 3);

    // Identify weaknesses (bottom 3 subjects with <70% accuracy)
    const weaknesses = [...subjectBreakdown]
      .filter(s => s.accuracy < 70 && s.attempts >= 2)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 3)
      .map(w => ({
        ...w,
        recommendation: w.accuracy < 50 
          ? 'Consider additional practice and review sessions'
          : 'Focus on understanding key concepts',
      }));

    // Get quiz attempts with details (scoped by matching with progress)
    const quizAttemptsConditions: any[] = [
      eq(quizGameResults.player1Id, studentId)
    ];
    
    if (filters?.subjectId && filters.subjectId !== 'all') {
      quizAttemptsConditions.push(eq(quizCollections.subjectId, filters.subjectId));
    }
    
    // Use allowed collections (already checked above, safe to use)
    quizAttemptsConditions.push(sql`${quizGameResults.collectionId} IN (${sql.join(collectionIds.map(id => sql`${id}`), sql`, `)})`);

    
    const quizAttempts = await db
      .select({
        id: quizGameResults.id,
        collectionName: quizCollections.name,
        score: quizGameResults.player1Score,
        correctAnswers: quizGameResults.player1CorrectAnswers,
        incorrectAnswers: sql<number>`${quizGameResults.player1TotalAnswers} - ${quizGameResults.player1CorrectAnswers}`,
        skippedAnswers: sql<number>`0`,
        timeTaken: quizGameResults.gameDuration,
        playedAt: quizGameResults.gameEndedAt,
        subject: subjects.name,
      })
      .from(quizGameResults)
      .leftJoin(quizCollections, eq(quizGameResults.collectionId, quizCollections.id))
      .leftJoin(subjects, eq(quizCollections.subjectId, subjects.id))
      .where(and(...quizAttemptsConditions))
      .orderBy(desc(quizGameResults.gameEndedAt))
      .limit(20);

    // Calculate class average for comparison (simplified)
    const [classAvg] = await db
      .select({
        avgAccuracy: sql<number>`ROUND((SUM(${quizGameProgress.totalCorrectAnswers})::NUMERIC / NULLIF(SUM(${quizGameProgress.totalAnswers}), 0)) * 100, 2)`,
      })
      .from(quizGameProgress)
      .leftJoin(userOrganizationRoles, eq(quizGameProgress.userId, userOrganizationRoles.userId))
      .where(eq(userOrganizationRoles.organizationId, organizationId));

    const quizAttemptsWithComparison = quizAttempts.map(q => ({
      ...q,
      score: q.score ? Math.round(q.score) : 0,
      vsClassAverage: q.score && classAvg?.avgAccuracy 
        ? Math.round(q.score - classAvg.avgAccuracy) 
        : 0,
      recommendation: q.score < 60 
        ? 'Review incorrect answers and retry this quiz'
        : q.score < 80
        ? 'Good progress! Focus on challenging questions'
        : null,
    }));

    // Determine risk level
    let riskLevel: 'critical' | 'warning' | 'good' = 'good';
    if (overallAccuracy < 50 || (overallPerf?.totalGames < 3 && overallAccuracy < 70)) {
      riskLevel = 'critical';
    } else if (overallAccuracy < 70 || overallPerf?.totalGames < 3) {
      riskLevel = 'warning';
    }

    return {
      overallAccuracy,
      totalGames: overallPerf?.totalGames || 0,
      averageTimeMinutes: avgTimeData?.avgDuration ? Math.round(avgTimeData.avgDuration / 60) : null,
      riskLevel,
      performanceTrend,
      subjectBreakdown,
      strengths,
      weaknesses,
      quizAttempts: quizAttemptsWithComparison,
    };
  }
  
  // Student Insights - At-Risk Students Detection
  async getAtRiskStudents(orgId: string, filters?: { 
    unitId?: string; 
    subjectId?: string;
    search?: string;
  }): Promise<any[]> {
    console.log('[getAtRiskStudents] orgId:', orgId, 'filters:', JSON.stringify(filters));
    
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Get students in organization
    const studentConditions: any[] = [
      eq(userOrganizationRoles.organizationId, orgId),
    ];
    
    // Add search filter for student names if provided
    if (filters?.search && filters.search.trim()) {
      const searchPattern = `%${filters.search.trim()}%`;
      studentConditions.push(
        or(
          sql`LOWER(${users.gamerName}) LIKE LOWER(${searchPattern})`,
          sql`LOWER(${users.firstName}) LIKE LOWER(${searchPattern})`,
          sql`LOWER(${users.lastName}) LIKE LOWER(${searchPattern})`,
          sql`LOWER(CONCAT(${users.firstName}, ' ', ${users.lastName})) LIKE LOWER(${searchPattern})`
        )!
      );
    }
    
    let studentsQuery = db
      .selectDistinct({
        userId: userOrganizationRoles.userId,
        gamerName: users.gamerName,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        avatarImageUrl: users.avatarImageUrl,
        unitId: userOrganizationAssignments.unitId,
        unitName: organizationUnits.name,
      })
      .from(userOrganizationRoles)
      .leftJoin(users, eq(userOrganizationRoles.userId, users.id))
      .leftJoin(userOrganizationAssignments, eq(userOrganizationRoles.userId, userOrganizationAssignments.userId))
      .leftJoin(organizationUnits, eq(userOrganizationAssignments.unitId, organizationUnits.id))
      .where(and(...studentConditions));
    
    let students = await studentsQuery;
    console.log('[getAtRiskStudents] Initial student count:', students.length);
    console.log('[getAtRiskStudents] Sample students:', students.slice(0, 3).map(s => ({ userId: s.userId, gamerName: s.gamerName, unitId: s.unitId, unitName: s.unitName })));
    
    // Check if selected unit is "General" (shows all students)
    let isGeneralUnit = false;
    if (filters?.unitId && filters.unitId !== 'all') {
      const selectedUnit = await db
        .select({ name: organizationUnits.name })
        .from(organizationUnits)
        .where(eq(organizationUnits.id, filters.unitId))
        .limit(1);
      
      isGeneralUnit = selectedUnit.length > 0 && selectedUnit[0].name === 'General';
      console.log('[getAtRiskStudents] Selected unit is General?', isGeneralUnit);
    }
    
    // Apply unit filter if provided (but NOT for "General" which shows all students)
    if (filters?.unitId && filters.unitId !== 'all' && !isGeneralUnit) {
      console.log('[getAtRiskStudents] Applying unit filter:', filters.unitId);
      students = students.filter(s => s.unitId === filters.unitId);
      console.log('[getAtRiskStudents] After unit filter:', students.length);
    }
    
    let studentIds = students.map(s => s.userId);
    console.log('[getAtRiskStudents] studentIds count:', studentIds.length);
    
    // Also find students who have taken quizzes with matching names
    if (filters?.search && filters.search.trim()) {
      const searchPattern = `%${filters.search.trim()}%`;
      const quizMatchResults = await db
        .selectDistinct({
          userId: quizGameResults.player1Id
        })
        .from(quizGameResults)
        .innerJoin(quizCollections, eq(quizGameResults.collectionId, quizCollections.id))
        .innerJoin(userOrganizationRoles, and(
          eq(quizGameResults.player1Id, userOrganizationRoles.userId),
          eq(userOrganizationRoles.organizationId, orgId),
        ))
        .where(and(
          sql`LOWER(${quizCollections.name}) LIKE LOWER(${searchPattern})`,
          sql`${quizGameResults.gameEndedAt} >= ${thirtyDaysAgo}`,
          filters?.subjectId ? eq(quizCollections.subjectId, filters.subjectId) : sql`1=1`
        ));
      
      // Merge student IDs from quiz name matches
      const quizMatchStudentIds = quizMatchResults.map(r => r.userId);
      const mergedIds = new Set([...studentIds, ...quizMatchStudentIds]);
      studentIds = Array.from(mergedIds);
      
      // Re-fetch full student data for any additional students found via quiz name match
      if (quizMatchStudentIds.length > 0) {
        const additionalStudentIds = quizMatchStudentIds.filter(id => !students.find(s => s.userId === id));
        if (additionalStudentIds.length > 0) {
          const additionalStudents = await db
            .selectDistinct({
              userId: userOrganizationRoles.userId,
              gamerName: users.gamerName,
              firstName: users.firstName,
              lastName: users.lastName,
              email: users.email,
              avatarImageUrl: users.avatarImageUrl,
              unitId: userOrganizationAssignments.unitId,
              unitName: organizationUnits.name,
            })
            .from(userOrganizationRoles)
            .leftJoin(users, eq(userOrganizationRoles.userId, users.id))
            .leftJoin(userOrganizationAssignments, eq(userOrganizationRoles.userId, userOrganizationAssignments.userId))
            .leftJoin(organizationUnits, eq(userOrganizationAssignments.unitId, organizationUnits.id))
            .where(and(
              sql`${userOrganizationRoles.userId} IN (${sql.join(additionalStudentIds.map(id => sql`${id}`), sql`, `)})`,
              eq(userOrganizationRoles.organizationId, orgId),
              inArray(userOrganizationRoles.role, LEARNER_ROLES),
              filters?.unitId && filters.unitId !== 'all' ? sql`${userOrganizationAssignments.unitId} = ${filters.unitId}` : sql`1=1`
            ));
          
          students = [...students, ...additionalStudents];
        }
      }
    }
    
    if (studentIds.length === 0) {
      return [];
    }
    
    // Get recent and previous period performance with subject and quiz details
    const recentResults = await db
      .select({
        userId: quizGameResults.player1Id,
        correctAnswers: quizGameResults.player1CorrectAnswers,
        totalAnswers: quizGameResults.player1TotalAnswers,
        gameEndedAt: quizGameResults.gameEndedAt,
        collectionId: quizGameResults.collectionId,
        collectionName: quizCollections.name,
        subjectId: quizCollections.subjectId,
        description: quizCollections.description,
      })
      .from(quizGameResults)
      .leftJoin(quizCollections, eq(quizGameResults.collectionId, quizCollections.id))
      .where(and(
        sql`${quizGameResults.player1Id} IN (${sql.join(studentIds.map(id => sql`${id}`), sql`, `)})`,
        sql`${quizGameResults.gameEndedAt} >= ${thirtyDaysAgo}`,
        filters?.subjectId ? eq(quizCollections.subjectId, filters.subjectId) : sql`1=1`
      ));
    
    // Calculate metrics for each student
    const studentMetrics = studentIds.map(studentId => {
      const student = students.find(s => s.userId === studentId)!;
      const allResults = recentResults.filter(r => r.userId === studentId);
      const recentPeriodResults = allResults.filter(r => r.gameEndedAt && r.gameEndedAt >= sevenDaysAgo);
      const previousPeriodResults = allResults.filter(r => r.gameEndedAt && r.gameEndedAt >= fifteenDaysAgo && r.gameEndedAt < sevenDaysAgo);
      
      const totalGames = allResults.length;
      const totalCorrect = allResults.reduce((sum, r) => sum + (r.correctAnswers || 0), 0);
      const totalAnswers = allResults.reduce((sum, r) => sum + (r.totalAnswers || 0), 0);
      const accuracy = totalAnswers > 0 ? (totalCorrect / totalAnswers) * 100 : 0;
      
      // Calculate trend
      const recentCorrect = recentPeriodResults.reduce((sum, r) => sum + (r.correctAnswers || 0), 0);
      const recentTotal = recentPeriodResults.reduce((sum, r) => sum + (r.totalAnswers || 0), 0);
      const recentAccuracy = recentTotal > 0 ? (recentCorrect / recentTotal) * 100 : 0;
      
      const prevCorrect = previousPeriodResults.reduce((sum, r) => sum + (r.correctAnswers || 0), 0);
      const prevTotal = previousPeriodResults.reduce((sum, r) => sum + (r.totalAnswers || 0), 0);
      const prevAccuracy = prevTotal > 0 ? (prevCorrect / prevTotal) * 100 : 0;
      
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (recentTotal > 0 && prevTotal > 0) {
        const diff = recentAccuracy - prevAccuracy;
        if (diff > 5) trend = 'up';
        else if (diff < -5) trend = 'down';
      }
      
      // Calculate per-subject breakdown
      const subjectMap = new Map<string, any>();
      
      allResults.forEach(result => {
        // Use 'general' as key for quizzes without a subjectId
        const subjectKey = result.subjectId || 'general';
        
        if (!subjectMap.has(subjectKey)) {
          subjectMap.set(subjectKey, {
            subjectId: subjectKey,
            quizzes: [],
            totalCorrect: 0,
            totalAnswers: 0,
          });
        }
        
        const subjectData = subjectMap.get(subjectKey)!;
        subjectData.totalCorrect += result.correctAnswers || 0;
        subjectData.totalAnswers += result.totalAnswers || 0;
        
        // Track all quiz attempts (we'll use the latest one for accuracy)
        const existingQuiz = subjectData.quizzes.find((q: any) => q.collectionId === result.collectionId);
        if (existingQuiz) {
          existingQuiz.allAttempts.push({
            correctAnswers: result.correctAnswers || 0,
            totalAnswers: result.totalAnswers || 0,
            gameEndedAt: result.gameEndedAt,
          });
        } else {
          subjectData.quizzes.push({
            collectionId: result.collectionId,
            collectionName: result.collectionName,
            description: result.description,
            allAttempts: [{
              correctAnswers: result.correctAnswers || 0,
              totalAnswers: result.totalAnswers || 0,
              gameEndedAt: result.gameEndedAt,
            }],
          });
        }
      });
      
      // Process subjects and calculate accuracy
      const subjects = Array.from(subjectMap.values()).map(subject => {
        const accuracy = subject.totalAnswers > 0 ? (subject.totalCorrect / subject.totalAnswers) * 100 : 0;
        
        // Process quizzes - use LATEST attempt only (matching heatmap logic)
        const quizzes = subject.quizzes.map((quiz: any) => {
          // Sort attempts by date to get the latest
          const sortedAttempts = quiz.allAttempts.sort((a: any, b: any) => {
            if (!a.gameEndedAt || !b.gameEndedAt) return 0;
            return b.gameEndedAt.getTime() - a.gameEndedAt.getTime();
          });
          
          const latestAttempt = sortedAttempts[0];
          const latestAccuracy = latestAttempt.totalAnswers > 0 
            ? Math.round((latestAttempt.correctAnswers / latestAttempt.totalAnswers) * 100 * 100) / 100 
            : 0;
          
          return {
            collectionId: quiz.collectionId,
            collectionName: quiz.collectionName,
            description: quiz.description,
            attempts: quiz.allAttempts.length,
            accuracy: latestAccuracy,
            completedAt: latestAttempt.gameEndedAt,
          };
        }).sort((a: any, b: any) => a.accuracy - b.accuracy); // Sort by accuracy (worst first)
        
        return {
          subjectId: subject.subjectId,
          accuracy: Math.round(accuracy * 100) / 100,
          totalGames: subject.quizzes.length,
          quizzes,
        };
      }).sort((a, b) => a.accuracy - b.accuracy); // Sort subjects by accuracy (worst first)
      
      // Determine risk level
      let riskLevel: 'critical' | 'warning' | 'good' = 'good';
      
      // Calculate performance decline
      const decline = prevAccuracy - recentAccuracy;
      
      // Critical: Low accuracy OR (low engagement AND low accuracy)
      if (accuracy < 50 || (totalGames < 3 && accuracy < 70)) {
        riskLevel = 'critical';
      } 
      // Warning: Significant decline (≥10 points) AND recent performance below 75%
      // OR overall accuracy below 70%
      else if ((decline >= 10 && recentAccuracy < 75) || accuracy < 70) {
        riskLevel = 'warning';
      }
      
      return {
        userId: student.userId,
        gamerName: student.gamerName,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        avatarImageUrl: student.avatarImageUrl,
        unitId: student.unitId,
        unitName: student.unitName,
        totalGames,
        accuracy: Math.round(accuracy * 100) / 100,
        trend,
        riskLevel,
        recentAccuracy: Math.round(recentAccuracy * 100) / 100,
        previousAccuracy: Math.round(prevAccuracy * 100) / 100,
        subjects, // Per-subject breakdown with quizzes
      };
    });
    
    // Return all students and sort by risk level (critical > warning > good), then by accuracy
    const allStudents = studentMetrics
      .sort((a, b) => {
        // Sort critical first, then warning, then good
        const riskOrder = { critical: 0, warning: 1, good: 2 };
        const riskDiff = riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
        if (riskDiff !== 0) return riskDiff;
        // Within same risk level, sort by accuracy (lowest first)
        return a.accuracy - b.accuracy;
      });
    
    return allStudents;
  }
  
  // Student Insights - Performance Distribution
  async getPerformanceDistribution(orgId: string, filters?: { 
    unitId?: string; 
    subjectId?: string;
    search?: string;
  }): Promise<any[]> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Get students in organization
    const studentConditions: any[] = [
      eq(userOrganizationRoles.organizationId, orgId),
      inArray(userOrganizationRoles.role, LEARNER_ROLES)
    ];
    
    // Add search filter for student names if provided
    if (filters?.search && filters.search.trim()) {
      const searchPattern = `%${filters.search.trim()}%`;
      studentConditions.push(
        or(
          sql`LOWER(${users.gamerName}) LIKE LOWER(${searchPattern})`,
          sql`LOWER(${users.firstName}) LIKE LOWER(${searchPattern})`,
          sql`LOWER(${users.lastName}) LIKE LOWER(${searchPattern})`,
          sql`LOWER(CONCAT(${users.firstName}, ' ', ${users.lastName})) LIKE LOWER(${searchPattern})`
        )!
      );
    }
    
    let studentsQuery = db
      .select({
        userId: userOrganizationRoles.userId,
        unitId: userOrganizationAssignments.unitId,
      })
      .from(userOrganizationRoles)
      .leftJoin(users, eq(userOrganizationRoles.userId, users.id))
      .leftJoin(userOrganizationAssignments, eq(userOrganizationRoles.userId, userOrganizationAssignments.userId))
      .where(and(...studentConditions));
    
    let students = await studentsQuery;
    
    // Check if selected unit is "General" (shows all students)
    let isGeneralUnit = false;
    if (filters?.unitId && filters.unitId !== 'all') {
      const selectedUnit = await db
        .select({ name: organizationUnits.name })
        .from(organizationUnits)
        .where(eq(organizationUnits.id, filters.unitId))
        .limit(1);
      
      isGeneralUnit = selectedUnit.length > 0 && selectedUnit[0].name === 'General';
    }
    
    // Apply unit filter if provided (but NOT for "General" which shows all students)
    if (filters?.unitId && filters.unitId !== 'all' && !isGeneralUnit) {
      students = students.filter(s => s.unitId === filters.unitId);
    }
    
    // Deduplicate students by userId (JOIN with assignments can create duplicates)
    // Keep the first occurrence of each unique userId after filtering
    const uniqueStudentsMap = new Map();
    students.forEach(student => {
      if (student.userId && !uniqueStudentsMap.has(student.userId)) {
        uniqueStudentsMap.set(student.userId, student);
      }
    });
    students = Array.from(uniqueStudentsMap.values());
    
    let studentIds = students.map(s => s.userId);
    
    // Also find students who have taken quizzes with matching names
    if (filters?.search && filters.search.trim()) {
      const searchPattern = `%${filters.search.trim()}%`;
      const quizMatchResults = await db
        .selectDistinct({
          userId: quizGameResults.player1Id
        })
        .from(quizGameResults)
        .innerJoin(quizCollections, eq(quizGameResults.collectionId, quizCollections.id))
        .innerJoin(userOrganizationRoles, and(
          eq(quizGameResults.player1Id, userOrganizationRoles.userId),
          eq(userOrganizationRoles.organizationId, orgId),
          inArray(userOrganizationRoles.role, LEARNER_ROLES)
        ))
        .where(and(
          sql`LOWER(${quizCollections.name}) LIKE LOWER(${searchPattern})`,
          sql`${quizGameResults.gameEndedAt} >= ${thirtyDaysAgo}`,
          filters?.subjectId ? eq(quizCollections.subjectId, filters.subjectId) : sql`1=1`
        ));
      
      // Merge student IDs from quiz name matches
      const quizMatchStudentIds = quizMatchResults.map(r => r.userId);
      const mergedIds = new Set([...studentIds, ...quizMatchStudentIds]);
      studentIds = Array.from(mergedIds);
    }
    
    if (studentIds.length === 0) {
      return [
        { range: '0-20%', count: 0 },
        { range: '20-40%', count: 0 },
        { range: '40-60%', count: 0 },
        { range: '60-80%', count: 0 },
        { range: '80-100%', count: 0 }
      ];
    }
    
    // Get recent performance
    const recentResults = await db
      .select({
        userId: quizGameResults.player1Id,
        correctAnswers: quizGameResults.player1CorrectAnswers,
        totalAnswers: quizGameResults.player1TotalAnswers,
      })
      .from(quizGameResults)
      .leftJoin(quizCollections, eq(quizGameResults.collectionId, quizCollections.id))
      .where(and(
        sql`${quizGameResults.player1Id} IN (${sql.join(studentIds.map(id => sql`${id}`), sql`, `)})`,
        sql`${quizGameResults.gameEndedAt} >= ${thirtyDaysAgo}`,
        filters?.subjectId ? eq(quizCollections.subjectId, filters.subjectId) : sql`1=1`
      ));
    
    // Calculate accuracy per student
    const studentAccuracies = studentIds.map(studentId => {
      const results = recentResults.filter(r => r.userId === studentId);
      const totalCorrect = results.reduce((sum, r) => sum + (r.correctAnswers || 0), 0);
      const totalAnswers = results.reduce((sum, r) => sum + (r.totalAnswers || 0), 0);
      return totalAnswers > 0 ? (totalCorrect / totalAnswers) * 100 : 0;
    });
    
    // Distribute into ranges
    const distribution = [
      { range: '0-20%', count: studentAccuracies.filter(a => a >= 0 && a < 20).length },
      { range: '20-40%', count: studentAccuracies.filter(a => a >= 20 && a < 40).length },
      { range: '40-60%', count: studentAccuracies.filter(a => a >= 40 && a < 60).length },
      { range: '60-80%', count: studentAccuracies.filter(a => a >= 60 && a < 80).length },
      { range: '80-100%', count: studentAccuracies.filter(a => a >= 80 && a <= 100).length }
    ];
    
    return distribution;
  }
  
  // Student Insights - Get Students by Performance Range
  async getStudentsByPerformanceRange(orgId: string, range: string, filters?: { 
    unitId?: string; 
    subjectId?: string; 
  }): Promise<any[]> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Get students in organization with their user info
    const studentConditions: any[] = [
      eq(userOrganizationRoles.organizationId, orgId),
      inArray(userOrganizationRoles.role, LEARNER_ROLES)
    ];
    
    let studentsQuery = db
      .select({
        userId: userOrganizationRoles.userId,
        unitId: userOrganizationAssignments.unitId,
        gamerName: users.gamerName,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(userOrganizationRoles)
      .leftJoin(userOrganizationAssignments, eq(userOrganizationRoles.userId, userOrganizationAssignments.userId))
      .leftJoin(users, eq(userOrganizationRoles.userId, users.id))
      .where(and(...studentConditions));
    
    let students = await studentsQuery;
    
    // Check if selected unit is "General" (shows all students)
    let isGeneralUnit = false;
    if (filters?.unitId && filters.unitId !== 'all') {
      const selectedUnit = await db
        .select({ name: organizationUnits.name })
        .from(organizationUnits)
        .where(eq(organizationUnits.id, filters.unitId))
        .limit(1);
      
      isGeneralUnit = selectedUnit.length > 0 && selectedUnit[0].name === 'General';
    }
    
    // Apply unit filter if provided (but NOT for "General" which shows all students)
    if (filters?.unitId && filters.unitId !== 'all' && !isGeneralUnit) {
      students = students.filter(s => s.unitId === filters.unitId);
    }
    
    // Deduplicate students by userId (JOIN with assignments can create duplicates)
    // Keep the first occurrence of each unique userId after filtering
    const uniqueStudentsMap = new Map();
    students.forEach(student => {
      if (student.userId && !uniqueStudentsMap.has(student.userId)) {
        uniqueStudentsMap.set(student.userId, student);
      }
    });
    students = Array.from(uniqueStudentsMap.values());
    
    const studentIds = students.map(s => s.userId);
    
    if (studentIds.length === 0) {
      return [];
    }
    
    // Get recent performance
    const recentResults = await db
      .select({
        userId: quizGameResults.player1Id,
        correctAnswers: quizGameResults.player1CorrectAnswers,
        totalAnswers: quizGameResults.player1TotalAnswers,
      })
      .from(quizGameResults)
      .leftJoin(quizCollections, eq(quizGameResults.collectionId, quizCollections.id))
      .where(and(
        sql`${quizGameResults.player1Id} IN (${sql.join(studentIds.map(id => sql`${id}`), sql`, `)})`,
        sql`${quizGameResults.gameEndedAt} >= ${thirtyDaysAgo}`,
        filters?.subjectId ? eq(quizCollections.subjectId, filters.subjectId) : sql`1=1`
      ));
    
    // Calculate accuracy per student and filter by range
    const [minAccuracy, maxAccuracy] = range === '0-20%' ? [0, 20] 
      : range === '20-40%' ? [20, 40]
      : range === '40-60%' ? [40, 60]
      : range === '60-80%' ? [60, 80]
      : [80, 101]; // 80-100%
    
    const studentsInRange = students
      .map(student => {
        const results = recentResults.filter(r => r.userId === student.userId);
        const totalCorrect = results.reduce((sum, r) => sum + (r.correctAnswers || 0), 0);
        const totalAnswers = results.reduce((sum, r) => sum + (r.totalAnswers || 0), 0);
        const accuracy = totalAnswers > 0 ? (totalCorrect / totalAnswers) * 100 : 0;
        
        return {
          userId: student.userId,
          gamerName: student.gamerName,
          firstName: student.firstName,
          lastName: student.lastName,
          accuracy: Math.round(accuracy * 100) / 100,
          totalGames: results.length
        };
      })
      .filter(student => student.accuracy >= minAccuracy && student.accuracy < maxAccuracy)
      .sort((a, b) => b.accuracy - a.accuracy); // Sort by accuracy descending
    
    return studentsInRange;
  }
  
  // Student Insights - Student Timeline
  async getStudentTimeline(orgId: string, studentId: string, filters?: { 
    subjectId?: string; 
  }): Promise<any[]> {
    // Verify student belongs to organization
    const userRole = await db
      .select()
      .from(userOrganizationRoles)
      .where(and(
        eq(userOrganizationRoles.userId, studentId),
        eq(userOrganizationRoles.organizationId, orgId)
      ))
      .limit(1);
    
    if (userRole.length === 0) {
      throw new Error('Student not found in this organization');
    }
    
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Get all results for the student
    const results = await db
      .select({
        correctAnswers: quizGameResults.player1CorrectAnswers,
        totalAnswers: quizGameResults.player1TotalAnswers,
        gameEndedAt: quizGameResults.gameEndedAt,
      })
      .from(quizGameResults)
      .leftJoin(quizCollections, eq(quizGameResults.collectionId, quizCollections.id))
      .where(and(
        eq(quizGameResults.player1Id, studentId),
        sql`${quizGameResults.gameEndedAt} >= ${thirtyDaysAgo}`,
        filters?.subjectId ? eq(quizCollections.subjectId, filters.subjectId) : sql`1=1`
      ))
      .orderBy(quizGameResults.gameEndedAt);
    
    // Group by day and calculate daily accuracy
    const dailyData = new Map<string, { correct: number; total: number }>();
    
    results.forEach(result => {
      if (result.gameEndedAt) {
        const dateKey = result.gameEndedAt.toISOString().split('T')[0];
        const existing = dailyData.get(dateKey) || { correct: 0, total: 0 };
        dailyData.set(dateKey, {
          correct: existing.correct + (result.correctAnswers || 0),
          total: existing.total + (result.totalAnswers || 0)
        });
      }
    });
    
    // Convert to timeline array
    const timeline = Array.from(dailyData.entries()).map(([date, data]) => ({
      date,
      accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100 * 100) / 100 : 0,
      totalGames: results.filter(r => r.gameEndedAt?.toISOString().split('T')[0] === date).length
    }));
    
    return timeline;
  }
  
  // Student Insights - Performance Heatmap
  async getPerformanceHeatmap(orgId: string, filters?: { 
    unitId?: string;
    subjectId?: string;
    search?: string;
  }): Promise<any[]> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Get students in organization
    const studentConditions: any[] = [
      eq(userOrganizationRoles.organizationId, orgId),
      inArray(userOrganizationRoles.role, LEARNER_ROLES)
    ];
    
    // Add search filter for student names if provided
    if (filters?.search && filters.search.trim()) {
      const searchPattern = `%${filters.search.trim()}%`;
      studentConditions.push(
        or(
          sql`LOWER(${users.gamerName}) LIKE LOWER(${searchPattern})`,
          sql`LOWER(${users.firstName}) LIKE LOWER(${searchPattern})`,
          sql`LOWER(${users.lastName}) LIKE LOWER(${searchPattern})`,
          sql`LOWER(CONCAT(${users.firstName}, ' ', ${users.lastName})) LIKE LOWER(${searchPattern})`
        )!
      );
    }
    
    let studentsQuery = db
      .select({
        userId: userOrganizationRoles.userId,
        gamerName: users.gamerName,
        firstName: users.firstName,
        lastName: users.lastName,
        unitId: userOrganizationAssignments.unitId,
      })
      .from(userOrganizationRoles)
      .leftJoin(users, eq(userOrganizationRoles.userId, users.id))
      .leftJoin(userOrganizationAssignments, eq(userOrganizationRoles.userId, userOrganizationAssignments.userId))
      .where(and(...studentConditions));
    
    let students = await studentsQuery;
    
    // Check if selected unit is "General" (shows all students)
    let isGeneralUnit = false;
    if (filters?.unitId && filters.unitId !== 'all') {
      const selectedUnit = await db
        .select({ name: organizationUnits.name })
        .from(organizationUnits)
        .where(eq(organizationUnits.id, filters.unitId))
        .limit(1);
      
      isGeneralUnit = selectedUnit.length > 0 && selectedUnit[0].name === 'General';
    }
    
    // Apply unit filter if provided (but NOT for "General" which shows all students)
    if (filters?.unitId && filters.unitId !== 'all' && !isGeneralUnit) {
      students = students.filter(s => s.unitId === filters.unitId);
    }
    
    // Deduplicate students by userId (JOIN with assignments can create duplicates)
    // Keep the first occurrence of each unique userId after filtering
    const uniqueStudentsMap = new Map();
    students.forEach(student => {
      if (student.userId && !uniqueStudentsMap.has(student.userId)) {
        uniqueStudentsMap.set(student.userId, student);
      }
    });
    students = Array.from(uniqueStudentsMap.values());
    
    let studentIds = students.map(s => s.userId);
    
    // Also find students who have taken quizzes with matching names
    if (filters?.search && filters.search.trim()) {
      const searchPattern = `%${filters.search.trim()}%`;
      const quizMatchResults = await db
        .selectDistinct({
          userId: quizGameResults.player1Id
        })
        .from(quizGameResults)
        .innerJoin(quizCollections, eq(quizGameResults.collectionId, quizCollections.id))
        .innerJoin(userOrganizationRoles, and(
          eq(quizGameResults.player1Id, userOrganizationRoles.userId),
          eq(userOrganizationRoles.organizationId, orgId),
          inArray(userOrganizationRoles.role, LEARNER_ROLES)
        ))
        .where(and(
          sql`LOWER(${quizCollections.name}) LIKE LOWER(${searchPattern})`,
          sql`${quizGameResults.gameEndedAt} >= ${thirtyDaysAgo}`,
          filters?.subjectId ? eq(quizCollections.subjectId, filters.subjectId) : sql`1=1`
        ));
      
      // Merge student IDs from quiz name matches
      const quizMatchStudentIds = quizMatchResults.map(r => r.userId);
      const mergedIds = new Set([...studentIds, ...quizMatchStudentIds]);
      studentIds = Array.from(mergedIds);
      
      // Re-fetch full student data for any additional students found via quiz name match
      if (quizMatchStudentIds.length > 0) {
        const additionalStudentIds = quizMatchStudentIds.filter(id => !students.find(s => s.userId === id));
        if (additionalStudentIds.length > 0) {
          const additionalStudents = await db
            .selectDistinct({
              userId: userOrganizationRoles.userId,
              gamerName: users.gamerName,
              firstName: users.firstName,
              lastName: users.lastName,
              unitId: userOrganizationAssignments.unitId,
            })
            .from(userOrganizationRoles)
            .leftJoin(users, eq(userOrganizationRoles.userId, users.id))
            .leftJoin(userOrganizationAssignments, eq(userOrganizationRoles.userId, userOrganizationAssignments.userId))
            .where(and(
              sql`${userOrganizationRoles.userId} IN (${sql.join(additionalStudentIds.map(id => sql`${id}`), sql`, `)})`,
              eq(userOrganizationRoles.organizationId, orgId),
              inArray(userOrganizationRoles.role, LEARNER_ROLES),
              filters?.unitId && filters.unitId !== 'all' ? sql`${userOrganizationAssignments.unitId} = ${filters.unitId}` : sql`1=1`
            ));
          
          students = [...students, ...additionalStudents];
        }
      }
    }
    
    if (studentIds.length === 0) {
      return [];
    }
    
    // Get performance data with collection info (LEFT JOIN to handle deleted quizzes)
    // Filter to only include completed quizzes and exclude 0% scores
    const performanceDataQuery = db
      .select({
        userId: quizGameResults.player1Id,
        collectionId: quizGameResults.collectionId,
        correctAnswers: quizGameResults.player1CorrectAnswers,
        totalAnswers: quizGameResults.player1TotalAnswers,
        gameEndedAt: quizGameResults.gameEndedAt,
        collectionName: quizCollections.name,
        subjectId: quizCollections.subjectId,
      })
      .from(quizGameResults)
      .leftJoin(quizCollections, eq(quizGameResults.collectionId, quizCollections.id))
      .where(and(
        sql`${quizGameResults.player1Id} IN (${sql.join(studentIds.map(id => sql`${id}`), sql`, `)})`,
        sql`${quizGameResults.gameEndedAt} >= ${thirtyDaysAgo}`,
        isNotNull(quizGameResults.gameEndedAt),
        sql`${quizGameResults.player1TotalAnswers} > 0`
      ));
    
    const performanceData = await performanceDataQuery;
    
    // Filter performance data to exclude 0% accuracy and apply subject filter
    const filteredPerformanceData = performanceData.filter(p => {
      const accuracy = p.totalAnswers > 0 ? (p.correctAnswers / p.totalAnswers) * 100 : 0;
      // Exclude 0% accuracy
      if (accuracy === 0) return false;
      
      // Apply subject filter if provided (only for non-deleted quizzes)
      if (filters?.subjectId && filters.subjectId !== 'all') {
        // Include result if collection exists and matches subject, or if collection is deleted
        return p.subjectId === filters.subjectId || !p.collectionName;
      }
      
      return true;
    });
    
    // Get unique collections from the filtered performance data
    // Show ALL quizzes that students have completed, regardless of assignment status
    const collectionsMap = new Map();
    filteredPerformanceData.forEach(p => {
      if (!collectionsMap.has(p.collectionId)) {
        collectionsMap.set(p.collectionId, {
          id: p.collectionId,
          name: p.collectionName || 'Deleted Quiz',
          subjectId: p.subjectId,
        });
      }
    });
    
    // Use all collections from actual student performance data
    // Do NOT filter by assignments - show any quiz the student has completed
    const collections = Array.from(collectionsMap.values());
    
    // Build heatmap data
    const heatmapData = students.map(student => {
      const studentPerformance: any = {
        userId: student.userId,
        gamerName: student.gamerName,
        firstName: student.firstName,
        lastName: student.lastName,
        collections: {}
      };
      
      collections.forEach(collection => {
        const collectionResults = filteredPerformanceData.filter(
          p => p.userId === student.userId && p.collectionId === collection.id
        );
        
        if (collectionResults.length === 0) {
          studentPerformance.collections[collection.id] = {
            name: collection.name,
            accuracy: null,
            attempts: 0,
            latestAccuracy: null,
            totalAttempts: 0
          };
          return;
        }
        
        // Sort by gameEndedAt to get the most recent attempt
        const sortedResults = collectionResults.sort((a, b) => {
          if (!a.gameEndedAt || !b.gameEndedAt) return 0;
          return b.gameEndedAt.getTime() - a.gameEndedAt.getTime();
        });
        
        const latestResult = sortedResults[0];
        const latestAccuracy = latestResult.totalAnswers > 0 
          ? Math.round((latestResult.correctAnswers / latestResult.totalAnswers) * 100) 
          : null;
        
        studentPerformance.collections[collection.id] = {
          name: collection.name,
          accuracy: latestAccuracy,
          attempts: collectionResults.length,
          latestAccuracy: latestAccuracy,
          totalAttempts: collectionResults.length
        };
      });
      
      return studentPerformance;
    });
    
    return heatmapData;
  }
  
  // AI Configuration methods
  async createAiConfig(config: InsertAiConfig): Promise<AiConfig> {
    const [newConfig] = await db
      .insert(aiConfig)
      .values(config)
      .returning();
    return newConfig;
  }
  
  async getActiveAiConfig(): Promise<AiConfig | undefined> {
    const [config] = await db
      .select()
      .from(aiConfig)
      .where(sql`${aiConfig.isActive} IS TRUE`)
      .orderBy(desc(aiConfig.updatedAt))
      .limit(1);
    return config;
  }
  
  async getActiveAiConfigByPurpose(purpose: string): Promise<AiConfig | undefined> {
    const [config] = await db
      .select()
      .from(aiConfig)
      .where(and(
        sql`${aiConfig.isActive} IS TRUE`,
        eq(aiConfig.purpose, purpose)
      ))
      .orderBy(desc(aiConfig.updatedAt))
      .limit(1);
    return config;
  }

  async getAllAiConfigs(): Promise<AiConfig[]> {
    return await db
      .select()
      .from(aiConfig)
      .orderBy(desc(aiConfig.createdAt));
  }
  
  async getAiConfigById(id: string): Promise<AiConfig | undefined> {
    const [config] = await db
      .select()
      .from(aiConfig)
      .where(eq(aiConfig.id, id))
      .limit(1);
    return config;
  }
  
  async updateAiConfig(id: string, updates: Partial<InsertAiConfig>): Promise<AiConfig | undefined> {
    const [updated] = await db
      .update(aiConfig)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(aiConfig.id, id))
      .returning();
    return updated;
  }
  
  
  async setActiveAiConfig(id: string): Promise<AiConfig | undefined> {
    // Use transaction to ensure atomic single-active-per-purpose enforcement
    return await db.transaction(async (tx) => {
      // First get the config to find its purpose
      const [configToActivate] = await tx
        .select()
        .from(aiConfig)
        .where(eq(aiConfig.id, id))
        .limit(1);
      
      if (!configToActivate) {
        return undefined;
      }
      
      // Idempotency guard: if already active, return early (no-op)
      if (configToActivate.isActive) {
        return configToActivate;
      }
      
      // Deactivate only configs with the same purpose
      await tx
        .update(aiConfig)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(aiConfig.purpose, configToActivate.purpose));
      
      // Then activate the selected one
      const [activated] = await tx
        .update(aiConfig)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(aiConfig.id, id))
        .returning();
      
      return activated;
    });
  }
  async deleteAiConfig(id: string): Promise<boolean> {
    const result = await db
      .delete(aiConfig)
      .where(eq(aiConfig.id, id))
      .returning();
    return result.length > 0;
  }
  
  // Quiz Drafts methods with tenant isolation
  async createQuizDraft(draft: InsertQuizDraft): Promise<QuizDraft> {
    const [newDraft] = await db
      .insert(quizDrafts)
      .values(draft)
      .returning();
    return newDraft;
  }
  
  async getQuizDrafts(organizationId: string, userId?: string): Promise<QuizDraft[]> {
    requireOrgId(organizationId, 'getQuizDrafts');
    const conditions = [eq(quizDrafts.organizationId, organizationId)];
    
    if (userId) {
      conditions.push(eq(quizDrafts.createdBy, userId));
    }
    
    return await db
      .select()
      .from(quizDrafts)
      .where(and(...conditions))
      .orderBy(desc(quizDrafts.updatedAt));
  }
  
  async getQuizDraft(id: string, organizationId: string): Promise<QuizDraft | undefined> {
    const [draft] = await db
      .select()
      .from(quizDrafts)
      .where(and(
        eq(quizDrafts.id, id),
        eq(quizDrafts.organizationId, organizationId)
      ))
      .limit(1);
    return draft;
  }
  
  async updateQuizDraft(id: string, organizationId: string, updates: Partial<InsertQuizDraft>): Promise<QuizDraft | undefined> {
    const [updated] = await db
      .update(quizDrafts)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(
        eq(quizDrafts.id, id),
        eq(quizDrafts.organizationId, organizationId)
      ))
      .returning();
    return updated;
  }
  
  async deleteQuizDraft(id: string, organizationId: string): Promise<boolean> {
    const result = await db
      .delete(quizDrafts)
      .where(and(
        eq(quizDrafts.id, id),
        eq(quizDrafts.organizationId, organizationId)
      ));
    return result.rowCount ? result.rowCount > 0 : false;
  }
  
  // Sales Inquiries methods
  async getSuperAdmins(): Promise<{ id: string; email: string; gamerName: string; firstName: string | null; lastName: string | null }[]> {
    const superAdmins = await db
      .select({
        id: users.id,
        email: users.email,
        gamerName: users.gamerName,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(and(eq(users.isSuperAdmin, true), isNotNull(users.email)));
    return superAdmins;
  }

  async createSalesInquiry(inquiry: InsertSalesInquiry): Promise<SalesInquiry> {
    const [newInquiry] = await db
      .insert(salesInquiries)
      .values(inquiry)
      .returning();
    return newInquiry;
  }
  
  async getAllSalesInquiries(filters?: {
    search?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<SalesInquiry[]> {
    const conditions = [];
    
    if (filters?.search) {
      conditions.push(
        or(
          ilike(salesInquiries.name, `%${filters.search}%`),
          ilike(salesInquiries.surname, `%${filters.search}%`),
          ilike(salesInquiries.email, `%${filters.search}%`),
          ilike(salesInquiries.organizationName, `%${filters.search}%`)
        )
      );
    }
    
    if (filters?.status) {
      conditions.push(eq(salesInquiries.status, filters.status));
    }
    
    if (filters?.dateFrom) {
      conditions.push(gte(salesInquiries.createdAt, new Date(filters.dateFrom)));
    }
    
    if (filters?.dateTo) {
      conditions.push(lte(salesInquiries.createdAt, new Date(filters.dateTo)));
    }
    
    const query = db
      .select()
      .from(salesInquiries)
      .orderBy(desc(salesInquiries.createdAt));
    
    if (conditions.length > 0) {
      return await query.where(and(...conditions));
    }
    
    return await query;
  }
  
  async getSalesInquiry(id: string): Promise<SalesInquiry | undefined> {
    const [inquiry] = await db
      .select()
      .from(salesInquiries)
      .where(eq(salesInquiries.id, id))
      .limit(1);
    return inquiry;
  }
  
  async updateSalesInquiryStatus(id: string, status: string, userId?: string): Promise<SalesInquiry | undefined> {
    const [updated] = await db
      .update(salesInquiries)
      .set({
        status,
        statusUpdatedAt: new Date(),
        statusUpdatedBy: userId || null,
      })
      .where(eq(salesInquiries.id, id))
      .returning();
    return updated;
  }
  
  // Quiz Card Explanations
  async getQuizCardExplanation(cardId: string): Promise<QuizCardExplanation | undefined> {
    const [explanation] = await db
      .select()
      .from(quizCardExplanations)
      .where(eq(quizCardExplanations.cardId, cardId))
      .limit(1);
    return explanation;
  }
  
  async createQuizCardExplanation(data: InsertQuizCardExplanation): Promise<QuizCardExplanation> {
    const [explanation] = await db
      .insert(quizCardExplanations)
      .values(data)
      .returning();
    return explanation;
  }
  
  // Term Definitions
  async getTermDefinition(term: string, subjectId?: string): Promise<TermDefinition | undefined> {
    const conditions = [eq(termDefinitions.term, term)];
    if (subjectId) {
      conditions.push(eq(termDefinitions.subjectId, subjectId));
    }
    
    const [definition] = await db
      .select()
      .from(termDefinitions)
      .where(and(...conditions))
      .limit(1);
    return definition;
  }
  
  async getTermDefinitionById(id: string): Promise<TermDefinition | undefined> {
    const [definition] = await db
      .select()
      .from(termDefinitions)
      .where(eq(termDefinitions.id, id))
      .limit(1);
    return definition;
  }
  
  async createTermDefinition(data: InsertTermDefinition): Promise<TermDefinition> {
    const [definition] = await db
      .insert(termDefinitions)
      .values(data)
      .returning();
    return definition;
  }
  
  // Explanation Terms (junction table)
  async linkExplanationToTerms(explanationId: string, termIds: string[]): Promise<void> {
    if (termIds.length === 0) return;
    
    const values = termIds.map(termId => ({
      explanationId,
      termId,
    }));
    
    await db.insert(explanationTerms).values(values);
  }
  
  async getExplanationTerms(explanationId: string): Promise<TermDefinition[]> {
    const terms = await db
      .select({
        id: termDefinitions.id,
        term: termDefinitions.term,
        definition: termDefinitions.definition,
        subjectId: termDefinitions.subjectId,
        createdAt: termDefinitions.createdAt,
      })
      .from(explanationTerms)
      .innerJoin(termDefinitions, eq(explanationTerms.termId, termDefinitions.id))
      .where(eq(explanationTerms.explanationId, explanationId));
    return terms;
  }
  
  // Gamification Admin Configuration
  async getGamificationEconomyRules(organizationId: string): Promise<GamificationEconomyRule[]> {
    requireOrgId(organizationId, 'getGamificationEconomyRules');
    
    // If explicitly requesting global rules, return only global
    if (organizationId === 'global') {
      const globalRules = await db
        .select()
        .from(gamificationEconomyRules)
        .where(
          and(
            eq(gamificationEconomyRules.scope, 'global'),
            isNull(gamificationEconomyRules.organizationId)
          )
        );
      return dedupeEconomyRules(globalRules);
    }
    
    // For org-specific requests: get org rules first, then merge with global rules
    // Global rules apply platform-wide and are used as defaults
    const [orgRules, globalRules] = await Promise.all([
      db
        .select()
        .from(gamificationEconomyRules)
        .where(
          and(
            eq(gamificationEconomyRules.scope, 'organization'),
            eq(gamificationEconomyRules.organizationId, organizationId)
          )
        ),
      db
        .select()
        .from(gamificationEconomyRules)
        .where(
          and(
            eq(gamificationEconomyRules.scope, 'global'),
            isNull(gamificationEconomyRules.organizationId)
          )
        )
    ]);
    
    // Merge: org-specific rules take precedence over global rules
    const orgCanonicalTypes = new Set(orgRules.map(r => normalizeEconomyActionType(r.actionType)));
    const mergedRules = [
      ...orgRules,
      ...globalRules.filter(r => !orgCanonicalTypes.has(normalizeEconomyActionType(r.actionType)))
    ];

    return dedupeEconomyRules(mergedRules);
  }
  
  async upsertGamificationEconomyRule(rule: InsertGamificationEconomyRule): Promise<GamificationEconomyRule> {
    const normalizedActionType = normalizeEconomyActionType(rule.actionType);
    const normalizedRule: InsertGamificationEconomyRule = {
      ...rule,
      actionType: normalizedActionType,
    };

    // PostgreSQL treats NULL != NULL in unique constraints, so onConflictDoUpdate
    // won't work when organizationId is null (global scope). Handle this explicitly.
    const existingCondition = normalizedRule.organizationId === null || normalizedRule.organizationId === undefined
      ? and(
          eq(gamificationEconomyRules.scope, normalizedRule.scope || 'organization'),
          isNull(gamificationEconomyRules.organizationId),
          eq(gamificationEconomyRules.actionType, normalizedActionType)
        )
      : and(
          eq(gamificationEconomyRules.scope, normalizedRule.scope || 'organization'),
          eq(gamificationEconomyRules.organizationId, normalizedRule.organizationId),
          eq(gamificationEconomyRules.actionType, normalizedActionType)
        );

    const [existing] = await db
      .select()
      .from(gamificationEconomyRules)
      .where(existingCondition)
      .limit(1);

    if (existing) {
      const nextCoinReward = normalizedRule.coinReward ?? existing.coinReward;
      const nextXpReward = normalizedRule.xpReward ?? existing.xpReward;
      const nextDescription = normalizedRule.description ?? existing.description;
      const nextIsActive = normalizedRule.isActive ?? existing.isActive;

      const [result] = await db
        .update(gamificationEconomyRules)
        .set({
          coinReward: nextCoinReward,
          xpReward: nextXpReward,
          description: nextDescription,
          isActive: nextIsActive,
          updatedAt: new Date(),
        })
        .where(eq(gamificationEconomyRules.id, existing.id))
        .returning();
      return result;
    }

    const [result] = await db
      .insert(gamificationEconomyRules)
      .values(normalizedRule)
      .returning();
    return result;
  }
  
  async getShopItemPricing(organizationId: string): Promise<ShopItemPricing[]> {
    // Handle 'global' scope separately
    const isGlobal = organizationId === 'global';
    const pricing = await db
      .select()
      .from(shopItemPricing)
      .where(
        isGlobal
          ? and(
              eq(shopItemPricing.scope, 'global'),
              isNull(shopItemPricing.organizationId)
            )
          : and(
              eq(shopItemPricing.scope, 'organization'),
              eq(shopItemPricing.organizationId, organizationId)
            )
      );
    return pricing;
  }
  
  async upsertShopItemPricing(pricing: InsertShopItemPricing): Promise<ShopItemPricing> {
    const [result] = await db
      .insert(shopItemPricing)
      .values(pricing)
      .onConflictDoUpdate({
        target: [shopItemPricing.scope, shopItemPricing.organizationId, shopItemPricing.itemId, shopItemPricing.itemType],
        set: {
          coinCost: pricing.coinCost,
          isAvailable: pricing.isAvailable,
          customDescription: pricing.customDescription,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }
  
  async getAdminChallengeConfigs(organizationId: string): Promise<AdminChallengeConfig[]> {
    // Handle 'global' scope separately
    const isGlobal = organizationId === 'global';
    const configs = await db
      .select()
      .from(adminChallengeConfig)
      .where(
        isGlobal
          ? and(
              eq(adminChallengeConfig.scope, 'global'),
              isNull(adminChallengeConfig.organizationId)
            )
          : and(
              eq(adminChallengeConfig.scope, 'organization'),
              eq(adminChallengeConfig.organizationId, organizationId)
            )
      );
    return configs;
  }
  
  async createAdminChallengeConfig(config: InsertAdminChallengeConfig): Promise<AdminChallengeConfig> {
    const [result] = await db
      .insert(adminChallengeConfig)
      .values(config)
      .returning();
    return result;
  }
  
  async updateAdminChallengeConfig(id: string, updates: Partial<InsertAdminChallengeConfig>): Promise<AdminChallengeConfig | undefined> {
    const [result] = await db
      .update(adminChallengeConfig)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(adminChallengeConfig.id, id))
      .returning();
    return result;
  }
  
  async deleteAdminChallengeConfig(id: string): Promise<boolean> {
    const result = await db
      .delete(adminChallengeConfig)
      .where(eq(adminChallengeConfig.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }
  
  async getSeasonPassConfig(organizationId: string): Promise<SeasonPassConfig | undefined> {
    // Handle 'global' scope separately
    // Only return ACTIVE season passes (status='active')
    const isGlobal = organizationId === 'global';
    const [config] = await db
      .select()
      .from(seasonPassConfig)
      .where(
        isGlobal
          ? and(
              eq(seasonPassConfig.scope, 'global'),
              isNull(seasonPassConfig.organizationId),
              eq(seasonPassConfig.status, 'active')
            )
          : and(
              eq(seasonPassConfig.scope, 'organization'),
              eq(seasonPassConfig.organizationId, organizationId),
              eq(seasonPassConfig.status, 'active')
            )
      )
      .limit(1);
    return config;
  }
  
  async getSeasonPassConfigById(id: string): Promise<SeasonPassConfig | undefined> {
    const [config] = await db
      .select()
      .from(seasonPassConfig)
      .where(eq(seasonPassConfig.id, id))
      .limit(1);
    return config;
  }
  
  async upsertSeasonPassConfig(config: InsertSeasonPassConfig): Promise<SeasonPassConfig> {
    const [result] = await db
      .insert(seasonPassConfig)
      .values(config)
      .onConflictDoUpdate({
        target: [seasonPassConfig.scope, seasonPassConfig.organizationId, seasonPassConfig.seasonNumber],
        set: {
          seasonName: config.seasonName,
          description: config.description,
          status: config.status,
          startDate: config.startDate,
          endDate: config.endDate,
          tierDefinitions: config.tierDefinitions,
          coinCost: config.coinCost,
          coinMultiplier: config.coinMultiplier,
          xpMultiplier: config.xpMultiplier,
          advantages: config.advantages,
          isActive: config.isActive,
          activatedAt: config.activatedAt,
          expiredAt: config.expiredAt,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }
  
  // Season Pass Management (new methods for backend infrastructure)
  async getSeasonPasses(organizationId?: string): Promise<SeasonPassConfig[]> {
    if (!organizationId) {
      // Get all season passes (SuperAdmin view)
      return await db
        .select()
        .from(seasonPassConfig)
        .orderBy(desc(seasonPassConfig.createdAt));
    }
    
    // Handle 'global' scope separately
    const isGlobal = organizationId === 'global';
    return await db
      .select()
      .from(seasonPassConfig)
      .where(
        isGlobal
          ? and(
              eq(seasonPassConfig.scope, 'global'),
              isNull(seasonPassConfig.organizationId)
            )
          : and(
              eq(seasonPassConfig.scope, 'organization'),
              eq(seasonPassConfig.organizationId, organizationId)
            )
      )
      .orderBy(desc(seasonPassConfig.createdAt));
  }
  
  async getSeasonPassById(id: string): Promise<SeasonPassConfig | undefined> {
    const [config] = await db
      .select()
      .from(seasonPassConfig)
      .where(eq(seasonPassConfig.id, id))
      .limit(1);
    return config;
  }
  
  async createSeasonPass(data: InsertSeasonPassConfig): Promise<SeasonPassConfig> {
    const [result] = await db
      .insert(seasonPassConfig)
      .values({
        ...data,
        status: 'draft',
        isActive: false,
      })
      .returning();
    return result;
  }
  
  async updateSeasonPass(id: string, data: Partial<InsertSeasonPassConfig>): Promise<SeasonPassConfig | undefined> {
    const [existing] = await db
      .select()
      .from(seasonPassConfig)
      .where(eq(seasonPassConfig.id, id))
      .limit(1);

    if (!existing) {
      return undefined;
    }

    // Ensure tierDefinitions is properly formatted as JSONB
    const updateData: any = {
      ...data,
      updatedAt: new Date(),
    };
    
    // If tierDefinitions is provided, ensure it's properly formatted
    if (data.tierDefinitions) {
      updateData.tierDefinitions = typeof data.tierDefinitions === 'string' 
        ? JSON.parse(data.tierDefinitions)
        : data.tierDefinitions;
      console.log('Updating season pass with tierDefinitions:', JSON.stringify(updateData.tierDefinitions, null, 2));
    }

    // Keep season status in sync with edited date windows.
    // Draft records stay draft unless explicitly changed.
    if (updateData.status === undefined && existing.status !== 'draft') {
      const now = new Date();
      const effectiveStartDate = updateData.startDate ?? existing.startDate;
      const effectiveEndDate = updateData.endDate ?? existing.endDate;

      let computedStatus: 'scheduled' | 'active' | 'expired' = 'active';
      if (effectiveStartDate && now < new Date(effectiveStartDate)) {
        computedStatus = 'scheduled';
      } else if (effectiveEndDate && now >= new Date(effectiveEndDate)) {
        computedStatus = 'expired';
      }

      updateData.status = computedStatus;
      updateData.isActive = computedStatus === 'active';
      if (computedStatus === 'active') {
        updateData.activatedAt = existing.activatedAt || now;
        updateData.expiredAt = null;
      } else if (computedStatus === 'scheduled') {
        updateData.expiredAt = null;
      } else if (computedStatus === 'expired') {
        updateData.expiredAt = existing.expiredAt || now;
      }
    } else if (updateData.status !== undefined) {
      // If status is set explicitly, keep isActive aligned.
      if (updateData.status === 'active') {
        updateData.isActive = true;
        updateData.activatedAt = existing.activatedAt || new Date();
        updateData.expiredAt = null;
      } else if (updateData.status === 'scheduled' || updateData.status === 'draft') {
        updateData.isActive = false;
        updateData.expiredAt = null;
      } else if (updateData.status === 'expired') {
        updateData.isActive = false;
        updateData.expiredAt = existing.expiredAt || new Date();
      }
    }
    
    const [result] = await db
      .update(seasonPassConfig)
      .set(updateData)
      .where(eq(seasonPassConfig.id, id))
      .returning();
    
    console.log('Season pass updated successfully, tierDefinitions saved:', result.tierDefinitions ? 'YES' : 'NO');
    return result;
  }
  
  async activateSeasonPass(id: string): Promise<SeasonPassConfig | undefined> {
    const [result] = await db
      .update(seasonPassConfig)
      .set({
        status: 'active',
        isActive: true,
        activatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(seasonPassConfig.id, id))
      .returning();
    return result;
  }
  
  async expireSeasonPass(id: string): Promise<SeasonPassConfig | undefined> {
    const [result] = await db
      .update(seasonPassConfig)
      .set({
        status: 'expired',
        isActive: false,
        expiredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(seasonPassConfig.id, id))
      .returning();
    return result;
  }
  
  async getActiveSeasonPass(organizationId?: string): Promise<SeasonPassConfig | undefined> {
    if (!organizationId) {
      // Get global active season pass
      const [config] = await db
        .select()
        .from(seasonPassConfig)
        .where(
          and(
            eq(seasonPassConfig.scope, 'global'),
            eq(seasonPassConfig.status, 'active')
          )
        )
        .limit(1);
      return config;
    }
    
    // Handle 'global' scope separately
    const isGlobal = organizationId === 'global';
    const [config] = await db
      .select()
      .from(seasonPassConfig)
      .where(
        isGlobal
          ? and(
              eq(seasonPassConfig.scope, 'global'),
              isNull(seasonPassConfig.organizationId),
              eq(seasonPassConfig.status, 'active')
            )
          : and(
              eq(seasonPassConfig.scope, 'organization'),
              eq(seasonPassConfig.organizationId, organizationId),
              eq(seasonPassConfig.status, 'active')
            )
      )
      .limit(1);
    return config;
  }
  
  async createPlayerSeasonReward(
    playerId: string,
    seasonConfigId: string,
    tier: number,
    isPremiumReward: boolean,
    rewardData: Partial<InsertPlayerSeasonReward>
  ): Promise<PlayerSeasonReward> {
    const [result] = await db
      .insert(playerSeasonRewards)
      .values([{
        userId: playerId,
        seasonPassConfigId: seasonConfigId,
        tier,
        isPremiumReward,
        rewardType: rewardData.rewardType || 'coins',
        ...rewardData,
      }])
      .returning();
    return result;
  }
  
  async getCoinAdjustments(userId: string): Promise<CoinAdjustment[]> {
    const adjustments = await db
      .select()
      .from(coinAdjustments)
      .where(eq(coinAdjustments.userId, userId))
      .orderBy(desc(coinAdjustments.createdAt));
    return adjustments;
  }
  
  async createCoinAdjustment(adjustment: InsertCoinAdjustment): Promise<CoinAdjustment> {
    const [result] = await db
      .insert(coinAdjustments)
      .values(adjustment)
      .returning();
    return result;
  }
  
  async getOrganizationCoinAdjustments(organizationId: string, limit: number = 100): Promise<CoinAdjustment[]> {
    const adjustments = await db
      .select()
      .from(coinAdjustments)
      .where(eq(coinAdjustments.organizationId, organizationId))
      .orderBy(desc(coinAdjustments.createdAt))
      .limit(limit);
    return adjustments;
  }
  
  // User Cosmetic Loadouts
  async getUserCosmeticLoadout(userId: string): Promise<UserCosmeticLoadout | undefined> {
    const [loadout] = await db
      .select()
      .from(userCosmeticLoadouts)
      .where(eq(userCosmeticLoadouts.userId, userId))
      .limit(1);
    return loadout;
  }
  
  async upsertUserCosmeticLoadout(loadout: InsertUserCosmeticLoadout): Promise<UserCosmeticLoadout> {
    const [result] = await db
      .insert(userCosmeticLoadouts)
      .values(loadout)
      .onConflictDoUpdate({
        target: [userCosmeticLoadouts.userId],
        set: {
          equippedBorder: loadout.equippedBorder,
          equippedGlow: loadout.equippedGlow,
          equippedBadge: loadout.equippedBadge,
          equippedAnimation: loadout.equippedAnimation,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }
  
  // Season Pass Purchases
  async getUserSeasonPassPurchases(userId: string): Promise<SeasonPassPurchase[]> {
    const purchases = await db
      .select()
      .from(seasonPassPurchases)
      .where(eq(seasonPassPurchases.userId, userId))
      .orderBy(desc(seasonPassPurchases.purchasedAt));
    return purchases;
  }
  
  async createSeasonPassPurchase(purchase: InsertSeasonPassPurchase): Promise<SeasonPassPurchase> {
    // Upsert to handle renewals - updates existing record when user repurchases same season pass
    const [result] = await db
      .insert(seasonPassPurchases)
      .values(purchase)
      .onConflictDoUpdate({
        target: [seasonPassPurchases.userId, seasonPassPurchases.seasonPassConfigId],
        set: {
          purchasedAt: purchase.purchasedAt,
          expiresAt: purchase.expiresAt,
          coinsPaid: purchase.coinsPaid,
          isActive: true, // Reactivate on renewal
        },
      })
      .returning();
    return result;
  }
  
  async getUserActiveSeasonPass(userId: string, seasonPassConfigId: string): Promise<SeasonPassPurchase | undefined> {
    const [purchase] = await db
      .select()
      .from(seasonPassPurchases)
      .where(and(
        eq(seasonPassPurchases.userId, userId),
        eq(seasonPassPurchases.seasonPassConfigId, seasonPassConfigId),
        sql`${seasonPassPurchases.expiresAt} > NOW()`
      ))
      .limit(1);
    return purchase;
  }
  
  async deactivateExpiredSeasonPasses(): Promise<number> {
    const result = await db
      .update(seasonPassPurchases)
      .set({ isActive: false })
      .where(sql`${seasonPassPurchases.expiresAt} < NOW()`);
    return result.rowCount || 0;
  }
  
  // License Feature Flag Management (Phase 5)
  async getLicenseFlagOverrides(): Promise<any[]> {
    return await db.select().from(licenseFlagOverrides).orderBy(desc(licenseFlagOverrides.createdAt));
  }
  
  async setLicenseFlagOverride(data: { 
    flagKey: string; 
    value: boolean; 
    description: string | null; 
    setBy: string; 
    expiresAt: Date | null;
    requestMetadata?: { ip: string; userAgent: string; timestamp: string };
  }): Promise<any> {
    // Sanitize inputs
    const sanitizedData = {
      ...data,
      description: data.description?.substring(0, 500) || null,
    };
    
    // Get previous state for audit
    const [existing] = await db.select().from(licenseFlagOverrides).where(eq(licenseFlagOverrides.flagKey, sanitizedData.flagKey)).limit(1);
    
    // Upsert the override
    const [result] = await db
      .insert(licenseFlagOverrides)
      .values({
        flagKey: sanitizedData.flagKey,
        value: sanitizedData.value,
        description: sanitizedData.description,
        setBy: sanitizedData.setBy,
        expiresAt: sanitizedData.expiresAt,
      })
      .onConflictDoUpdate({
        target: licenseFlagOverrides.flagKey,
        set: {
          value: sanitizedData.value,
          description: sanitizedData.description,
          setBy: sanitizedData.setBy,
          expiresAt: sanitizedData.expiresAt,
          updatedAt: new Date(),
        },
      })
      .returning();
    
    // Enhanced audit logging with previous values and request context
    await db.insert(licenseFlagAudit).values({
      flagKey: sanitizedData.flagKey,
      action: existing ? 'update' : 'create',
      oldValue: existing ? { 
        value: existing.value, 
        description: existing.description,
        expiresAt: existing.expiresAt 
      } : null,
      newValue: { 
        value: sanitizedData.value, 
        description: sanitizedData.description,
        expiresAt: sanitizedData.expiresAt 
      },
      changedBy: sanitizedData.setBy,
      reason: `Flag ${existing ? 'updated' : 'created'} via API`,
      metadata: { 
        previousValue: existing?.value,
        changedFields: existing ? this.getChangedFields(existing, sanitizedData) : ['all'],
        requestContext: sanitizedData.requestMetadata || null,
        delta: existing ? {
          from: existing.value,
          to: sanitizedData.value,
        } : null,
      },
    });
    
    return result;
  }
  
  private getChangedFields(existing: any, updated: any): string[] {
    const changed: string[] = [];
    if (existing.value !== updated.value) changed.push('value');
    if (existing.description !== updated.description) changed.push('description');
    if (existing.expiresAt?.getTime() !== updated.expiresAt?.getTime()) changed.push('expiresAt');
    return changed;
  }
  
  async removeLicenseFlagOverride(flagKey: string, removedBy: string): Promise<void> {
    // Get existing value for audit
    const [existing] = await db.select().from(licenseFlagOverrides).where(eq(licenseFlagOverrides.flagKey, flagKey)).limit(1);
    
    if (existing) {
      // Remove the override
      await db.delete(licenseFlagOverrides).where(eq(licenseFlagOverrides.flagKey, flagKey));
      
      // Log to audit trail
      await db.insert(licenseFlagAudit).values({
        flagKey,
        action: 'delete',
        oldValue: { value: existing.value, description: existing.description },
        newValue: null,
        changedBy: removedBy,
        reason: 'Override removed via API',
        metadata: null,
      });
    }
  }
  
  async emergencyDisableLicenseFeatures(userId: string, reason: string): Promise<void> {
    const flagKeys = [
      'licenseSystemEnabled',
      'licenseMiddlewareEnabled',
      'licenseUIEnabled',
      'licensePaymentsEnabled',
    ];
    
    const sanitizedReason = reason?.substring(0, 500) || 'Emergency disable';
    
    try {
      // Use transaction to ensure atomic multi-flag disable
      await db.transaction(async (tx) => {
        // Get existing overrides for audit (collect all state first)
        const existing = await tx.select().from(licenseFlagOverrides).where(inArray(licenseFlagOverrides.flagKey, flagKeys));
        const existingMap = new Map(existing.map(e => [e.flagKey, e]));
        const flagDeltas: Record<string, { from: boolean | null; to: boolean }> = {};
        
        // Prepare all operations first, then execute
        const flagUpdates: Promise<any>[] = [];
        const auditUpdates: Promise<any>[] = [];
        
        for (const flagKey of flagKeys) {
          const prev = existingMap.get(flagKey);
          flagDeltas[flagKey] = { from: prev?.value ?? null, to: false };
          
          // Queue flag update
          flagUpdates.push(
            tx
              .insert(licenseFlagOverrides)
              .values({
                flagKey,
                value: false,
                description: sanitizedReason,
                setBy: userId,
                expiresAt: null,
              })
              .onConflictDoUpdate({
                target: licenseFlagOverrides.flagKey,
                set: {
                  value: false,
                  description: sanitizedReason,
                  setBy: userId,
                  updatedAt: new Date(),
                },
              })
          );
          
          // Queue individual audit log
          auditUpdates.push(
            tx.insert(licenseFlagAudit).values({
              flagKey,
              action: 'emergency_disable',
              oldValue: prev ? { value: prev.value, description: prev.description } : null,
              newValue: { value: false, description: sanitizedReason },
              changedBy: userId,
              reason: `Emergency disable (part of multi-flag operation)`,
              metadata: { emergencyDisable: true, allFlagsDisabled: flagKeys, delta: flagDeltas[flagKey] },
            })
          );
        }
        
        // Execute all flag updates in parallel
        await Promise.all(flagUpdates);
        
        // Execute all audit updates in parallel
        await Promise.all(auditUpdates);
        
        // Write summary audit entry with per-flag deltas
        await tx.insert(licenseFlagAudit).values({
          flagKey: 'ALL_LICENSE_FLAGS',
          action: 'emergency_disable',
          oldValue: Object.fromEntries(existing.map(e => [e.flagKey, e.value])),
          newValue: Object.fromEntries(flagKeys.map(k => [k, false])),
          changedBy: userId,
          reason: sanitizedReason,
          metadata: { 
            emergencyDisable: true, 
            flagsAffected: flagKeys,
            deltas: flagDeltas,
            timestamp: new Date().toISOString()
          },
        });
      });
    } catch (error) {
      console.error('[EmergencyDisable] Transaction failed:', error);
      // Log failure to audit (outside transaction)
      try {
        await db.insert(licenseFlagAudit).values({
          flagKey: 'ALL_LICENSE_FLAGS',
          action: 'emergency_disable',
          oldValue: null,
          newValue: null,
          changedBy: userId,
          reason: `FAILED: ${sanitizedReason}`,
          metadata: { 
            emergencyDisable: true, 
            failed: true,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString()
          },
        });
      } catch (auditError) {
        console.error('[EmergencyDisable] Failed to log failure:', auditError);
      }
      throw error; // Re-throw to propagate failure to caller
    }
  }
  
  async getLicenseFlagAuditLog(limit: number, flagKey?: string): Promise<any[]> {
    const query = db.select().from(licenseFlagAudit).$dynamic();
    
    if (flagKey) {
      return await query.where(eq(licenseFlagAudit.flagKey, flagKey)).orderBy(desc(licenseFlagAudit.createdAt)).limit(limit);
    }
    
    return await query.orderBy(desc(licenseFlagAudit.createdAt)).limit(limit);
  }
  
  async getLicenseRolloutOrganizations(): Promise<any[]> {
    return await db.select().from(licenseRolloutOrganizations).orderBy(desc(licenseRolloutOrganizations.createdAt));
  }
  
  async addOrganizationToLicenseRollout(data: { organizationId: string; addedBy: string; notes: string | null; expiresAt?: Date | null }): Promise<any> {
    // Sanitize inputs
    const sanitizedData = {
      ...data,
      notes: data.notes?.substring(0, 500) || null,
      expiresAt: data.expiresAt || null,
    };
    
    const [result] = await db
      .insert(licenseRolloutOrganizations)
      .values(sanitizedData)
      .onConflictDoNothing({ target: licenseRolloutOrganizations.organizationId })
      .returning();
    
    if (!result) {
      // Already exists, fetch it
      const [existing] = await db.select().from(licenseRolloutOrganizations).where(eq(licenseRolloutOrganizations.organizationId, sanitizedData.organizationId)).limit(1);
      return existing;
    }
    
    // Log to audit
    await db.insert(licenseFlagAudit).values({
      flagKey: 'rolloutOrganizations',
      action: 'update',
      oldValue: null,
      newValue: { organizationId: sanitizedData.organizationId, expiresAt: sanitizedData.expiresAt },
      changedBy: sanitizedData.addedBy,
      reason: sanitizedData.notes || 'Organization added to license rollout',
      metadata: { organizationId: sanitizedData.organizationId, expiresAt: sanitizedData.expiresAt },
    });
    
    return result;
  }
  
  async removeOrganizationFromLicenseRollout(organizationId: string, removedBy: string): Promise<void> {
    await db.delete(licenseRolloutOrganizations).where(eq(licenseRolloutOrganizations.organizationId, organizationId));
    
    // Log to audit
    await db.insert(licenseFlagAudit).values({
      flagKey: 'rolloutOrganizations',
      action: 'update',
      oldValue: { organizationId },
      newValue: null,
      changedBy: removedBy,
      reason: 'Organization removed from license rollout',
      metadata: { organizationId },
    });
  }
  
  async getLicenseRolloutBetaUsers(): Promise<any[]> {
    return await db.select().from(licenseRolloutBetaUsers).orderBy(desc(licenseRolloutBetaUsers.createdAt));
  }
  
  async addUserToLicenseBeta(data: { userId: string; addedBy: string; notes: string | null; expiresAt?: Date | null }): Promise<any> {
    // Sanitize inputs
    const sanitizedData = {
      ...data,
      notes: data.notes?.substring(0, 500) || null,
      expiresAt: data.expiresAt || null,
    };
    
    const [result] = await db
      .insert(licenseRolloutBetaUsers)
      .values(sanitizedData)
      .onConflictDoNothing({ target: licenseRolloutBetaUsers.userId })
      .returning();
    
    if (!result) {
      // Already exists, fetch it
      const [existing] = await db.select().from(licenseRolloutBetaUsers).where(eq(licenseRolloutBetaUsers.userId, sanitizedData.userId)).limit(1);
      return existing;
    }
    
    // Log to audit
    await db.insert(licenseFlagAudit).values({
      flagKey: 'betaUsers',
      action: 'update',
      oldValue: null,
      newValue: { userId: sanitizedData.userId, expiresAt: sanitizedData.expiresAt },
      changedBy: sanitizedData.addedBy,
      reason: sanitizedData.notes || 'User added to license beta',
      metadata: { userId: sanitizedData.userId, expiresAt: sanitizedData.expiresAt },
    });
    
    return result;
  }
  
  async removeUserFromLicenseBeta(userId: string, removedBy: string): Promise<void> {
    await db.delete(licenseRolloutBetaUsers).where(eq(licenseRolloutBetaUsers.userId, userId));
    
    // Log to audit
    await db.insert(licenseFlagAudit).values({
      flagKey: 'betaUsers',
      action: 'update',
      oldValue: { userId },
      newValue: null,
      changedBy: removedBy,
      reason: 'User removed from license beta',
      metadata: { userId },
    });
  }
  
  // ==================== WHITE-LABEL BRANDING SYSTEM ====================
  
  async getBrandingThemeByOrgId(organizationId: string): Promise<BrandingTheme | undefined> {
    requireOrgId(organizationId, 'getBrandingThemeByOrgId');
    const [theme] = await db
      .select()
      .from(brandingThemes)
      .where(eq(brandingThemes.organizationId, organizationId))
      .orderBy(desc(brandingThemes.updatedAt), desc(brandingThemes.createdAt), desc(brandingThemes.id))
      .limit(1);
    return theme;
  }

  async getActiveBrandingThemeByOrgId(organizationId: string): Promise<BrandingTheme | undefined> {
    requireOrgId(organizationId, 'getActiveBrandingThemeByOrgId');
    const [theme] = await db
      .select()
      .from(brandingThemes)
      .where(
        and(
          eq(brandingThemes.organizationId, organizationId),
          eq(brandingThemes.status, 'active')
        )
      )
      .orderBy(desc(brandingThemes.updatedAt), desc(brandingThemes.createdAt), desc(brandingThemes.id))
      .limit(1);
    return theme;
  }
  
  async getBrandingThemeByDomain(domain: string): Promise<BrandingTheme | undefined> {
    const [orgDomain] = await db.select().from(organizationDomains).where(
      and(
        eq(organizationDomains.domain, domain.toLowerCase()),
        eq(organizationDomains.verified, true)
      )
    );
    
    if (!orgDomain) return undefined;
    
    const [theme] = await db.select().from(brandingThemes).where(
      and(
        eq(brandingThemes.organizationId, orgDomain.organizationId),
        eq(brandingThemes.status, 'active')
      )
    );
    
    return theme;
  }
  
  async upsertBrandingTheme(theme: InsertBrandingTheme): Promise<BrandingTheme> {
    requireOrgId(theme.organizationId, 'upsertBrandingTheme');
    const payload = {
      ...theme,
      organizationId: theme.organizationId,
      customCopy: (theme.customCopy ?? null) as CustomCopy | null,
    };

    // Do not depend on ON CONFLICT constraints for runtime safety: select canonical row,
    // update exactly one row, and prune duplicates when discovered.
    const existingRows = await db
      .select({ id: brandingThemes.id })
      .from(brandingThemes)
      .where(eq(brandingThemes.organizationId, theme.organizationId))
      .orderBy(desc(brandingThemes.updatedAt), desc(brandingThemes.createdAt), desc(brandingThemes.id));

    if (existingRows.length > 0) {
      const keepId = existingRows[0].id;
      const staleIds = existingRows.slice(1).map((row) => row.id);
      if (staleIds.length > 0) {
        await db.delete(brandingThemes).where(inArray(brandingThemes.id, staleIds));
      }
      const [updated] = await db
        .update(brandingThemes)
        .set({
          ...payload,
          updatedAt: new Date(),
        })
        .where(eq(brandingThemes.id, keepId))
        .returning();
      if (updated) return updated;
    }

    const [inserted] = await db
      .insert(brandingThemes)
      .values([payload])
      .returning();
    if (inserted) return inserted;

    // Defensive final read for race windows.
    const [resolved] = await db
      .select()
      .from(brandingThemes)
      .where(eq(brandingThemes.organizationId, theme.organizationId))
      .orderBy(desc(brandingThemes.updatedAt), desc(brandingThemes.createdAt), desc(brandingThemes.id))
      .limit(1);
    if (!resolved) {
      throw new Error('Failed to persist branding theme');
    }
    return resolved;
  }
  
  async activateBrandingTheme(organizationId: string): Promise<BrandingTheme | undefined> {
    const [result] = await db
      .update(brandingThemes)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(brandingThemes.organizationId, organizationId))
      .returning();
    return result;
  }
  
  async resetBrandingTheme(
    organizationId: string,
    options?: {
      presetTokens: Record<string, string>;
      presetId: string;
      themeModeIntent?: 'light' | 'dark';
      tokensLight?: Record<string, string> | null;
      tokensDark?: Record<string, string> | null;
    }
  ): Promise<BrandingTheme | undefined> {
    if (options?.presetTokens && options?.presetId) {
      const [result] = await db
        .update(brandingThemes)
        .set({
          tokens: options.presetTokens,
          presetId: options.presetId,
          themeModeIntent: options.themeModeIntent || 'light',
          tokensLight: options.tokensLight ?? null,
          tokensDark: options.tokensDark ?? null,
          updatedAt: new Date(),
        })
        .where(eq(brandingThemes.organizationId, organizationId))
        .returning();
      return result;
    } else {
      await db.delete(brandingThemes).where(eq(brandingThemes.organizationId, organizationId));
      return undefined;
    }
  }
  
  async getOrganizationDomains(organizationId: string): Promise<OrganizationDomain[]> {
    requireOrgId(organizationId, 'getOrganizationDomains');
    return db.select().from(organizationDomains).where(eq(organizationDomains.organizationId, organizationId));
  }
  
  async addOrganizationDomain(domain: InsertOrganizationDomain): Promise<OrganizationDomain> {
    const [result] = await db.insert(organizationDomains).values({
      ...domain,
      domain: domain.domain.toLowerCase(),
    }).returning();
    return result;
  }
  
  async removeOrganizationDomain(domainId: string, organizationId: string): Promise<boolean> {
    await db.delete(organizationDomains).where(
      and(
        eq(organizationDomains.id, domainId),
        eq(organizationDomains.organizationId, organizationId)
      )
    );
    return true;
  }
  
  async verifyOrganizationDomain(domainId: string, organizationId: string): Promise<OrganizationDomain | undefined> {
    const [result] = await db
      .update(organizationDomains)
      .set({ verified: true, verifiedAt: new Date() })
      .where(
        and(
          eq(organizationDomains.id, domainId),
          eq(organizationDomains.organizationId, organizationId)
        )
      )
      .returning();
    return result;
  }
  
  async getOrganizationDomainByDomain(domain: string): Promise<OrganizationDomain | undefined> {
    const [result] = await db.select().from(organizationDomains).where(eq(organizationDomains.domain, domain.toLowerCase()));
    return result;
  }
  
  async toggleDomainActive(domainId: string, organizationId: string, isActive: boolean): Promise<OrganizationDomain | undefined> {
    const [result] = await db
      .update(organizationDomains)
      .set({ isActive })
      .where(
        and(
          eq(organizationDomains.id, domainId),
          eq(organizationDomains.organizationId, organizationId)
        )
      )
      .returning();
    return result;
  }
  
  // Platform Default Theme (orgId = null) - for SuperAdmins to set platform-wide defaults
  async getPlatformDefaultTheme(): Promise<BrandingTheme | undefined> {
    const [theme] = await db
      .select()
      .from(brandingThemes)
      .where(isNull(brandingThemes.organizationId))
      .orderBy(desc(brandingThemes.updatedAt), desc(brandingThemes.createdAt), desc(brandingThemes.id))
      .limit(1);
    return theme;
  }

  async getActivePlatformDefaultTheme(): Promise<BrandingTheme | undefined> {
    const [theme] = await db
      .select()
      .from(brandingThemes)
      .where(
        and(
          isNull(brandingThemes.organizationId),
          eq(brandingThemes.status, 'active')
        )
      )
      .orderBy(desc(brandingThemes.updatedAt), desc(brandingThemes.createdAt), desc(brandingThemes.id))
      .limit(1);
    return theme;
  }
  
  async upsertPlatformDefaultTheme(theme: Omit<InsertBrandingTheme, 'organizationId'>): Promise<BrandingTheme> {
    const payload = {
      ...theme,
      customCopy: (theme.customCopy ?? null) as CustomCopy | null,
    };

    const existingRows = await db
      .select({ id: brandingThemes.id })
      .from(brandingThemes)
      .where(isNull(brandingThemes.organizationId))
      .orderBy(desc(brandingThemes.updatedAt), desc(brandingThemes.createdAt), desc(brandingThemes.id));

    if (existingRows.length > 0) {
      const keepId = existingRows[0].id;
      const staleIds = existingRows.slice(1).map((row) => row.id);
      if (staleIds.length > 0) {
        await db.delete(brandingThemes).where(inArray(brandingThemes.id, staleIds));
      }
      const [updated] = await db
        .update(brandingThemes)
        .set({
          ...payload,
          updatedAt: new Date(),
        })
        .where(eq(brandingThemes.id, keepId))
        .returning();
      if (updated) return updated;
    }

    const [inserted] = await db
      .insert(brandingThemes)
      .values([{
        ...payload,
        organizationId: null,
      } as InsertBrandingTheme])
      .returning();
    if (inserted) return inserted;

    const [resolved] = await db
      .select()
      .from(brandingThemes)
      .where(isNull(brandingThemes.organizationId))
      .orderBy(desc(brandingThemes.updatedAt), desc(brandingThemes.createdAt), desc(brandingThemes.id))
      .limit(1);
    if (!resolved) {
      throw new Error('Failed to persist platform default theme');
    }
    return resolved;
  }
  
  async activatePlatformDefaultTheme(): Promise<BrandingTheme | undefined> {
    const [result] = await db
      .update(brandingThemes)
      .set({ status: 'active', updatedAt: new Date() })
      .where(isNull(brandingThemes.organizationId))
      .returning();
    return result;
  }
  
  async resetPlatformDefaultTheme(): Promise<boolean> {
    await db.delete(brandingThemes).where(isNull(brandingThemes.organizationId));
    return true;
  }
}

export const storage = new DatabaseStorage();
