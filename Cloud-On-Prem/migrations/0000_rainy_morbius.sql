CREATE TABLE "achievementCatalog" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"description" text NOT NULL,
	"category" varchar NOT NULL,
	"requirement" varchar NOT NULL,
	"targetValue" integer NOT NULL,
	"coinReward" integer DEFAULT 0,
	"badgeUrl" varchar,
	"permanentBonus" jsonb,
	"isActive" boolean DEFAULT true,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "achievementUnlocks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"achievementId" varchar NOT NULL,
	"progress" integer DEFAULT 0,
	"isUnlocked" boolean DEFAULT false,
	"unlockedAt" timestamp,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "UNQ_user_achievement" UNIQUE("userId","achievementId")
);
--> statement-breakpoint
CREATE TABLE "activeOneVOneGames" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gameId" varchar NOT NULL,
	"collectionId" varchar NOT NULL,
	"player1Id" varchar NOT NULL,
	"player1Name" varchar NOT NULL,
	"player1SocketId" varchar,
	"player1Ready" boolean DEFAULT false,
	"player2Id" varchar NOT NULL,
	"player2Name" varchar NOT NULL,
	"player2SocketId" varchar,
	"player2Ready" boolean DEFAULT false,
	"currentTurn" varchar DEFAULT 'player1' NOT NULL,
	"gamePhase" varchar DEFAULT 'waiting' NOT NULL,
	"bothPlayersReady" boolean DEFAULT false,
	"roundTimeSeconds" integer DEFAULT 5 NOT NULL,
	"gameTimeSeconds" integer DEFAULT 120 NOT NULL,
	"gameStartedAt" timestamp,
	"lastActivityAt" timestamp DEFAULT now(),
	"createdAt" timestamp DEFAULT now(),
	"gameSeed" text,
	"roundNumber" integer DEFAULT 1,
	"player1Deck" text,
	"player2Deck" text,
	"player1WonCards" text,
	"player2WonCards" text,
	"player1RoundsWon" integer DEFAULT 0,
	"player2RoundsWon" integer DEFAULT 0,
	"tiedCards" text,
	"player1CurrentCard" text,
	"player2CurrentCard" text,
	"selectedStatTypeId" varchar,
	"roundWinner" varchar,
	"roundPhase" varchar DEFAULT 'selecting',
	"isSpecialTieMode" boolean DEFAULT false,
	"tiedStats" text,
	"specialTieStatName" varchar,
	CONSTRAINT "activeOneVOneGames_gameId_unique" UNIQUE("gameId")
);
--> statement-breakpoint
CREATE TABLE "activePowerUps" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"powerUpId" varchar NOT NULL,
	"activatedAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"effect" jsonb NOT NULL,
	"gameId" varchar,
	"usesRemaining" integer
);
--> statement-breakpoint
CREATE TABLE "activeQuizGames" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gameId" varchar NOT NULL,
	"collectionId" varchar NOT NULL,
	"gameMode" varchar NOT NULL,
	"player1Id" varchar NOT NULL,
	"player1Name" varchar NOT NULL,
	"player1SocketId" varchar,
	"player1Ready" boolean DEFAULT false,
	"player1CardCount" integer DEFAULT 0,
	"player1RoundsWon" integer DEFAULT 0,
	"player2Id" varchar,
	"player2Name" varchar,
	"player2SocketId" varchar,
	"player2Ready" boolean DEFAULT false,
	"player2CardCount" integer DEFAULT 0,
	"player2RoundsWon" integer DEFAULT 0,
	"gamePhase" varchar DEFAULT 'waiting' NOT NULL,
	"bothPlayersReady" boolean DEFAULT false,
	"roundTimeSeconds" integer DEFAULT 5 NOT NULL,
	"gameTimeSeconds" integer DEFAULT 120 NOT NULL,
	"gameStartedAt" timestamp,
	"lastActivityAt" timestamp DEFAULT now(),
	"createdAt" timestamp DEFAULT now(),
	"currentCardIndex" integer DEFAULT 0,
	"currentCard" jsonb,
	"shuffledCardIds" text[],
	"turnVersion" integer DEFAULT 0,
	"player1Answer" jsonb,
	"player2Answer" jsonb,
	"player1AnswerTime" integer,
	"player2AnswerTime" integer,
	"player1Correct" boolean,
	"player2Correct" boolean,
	"roundNumber" integer DEFAULT 1,
	CONSTRAINT "activeQuizGames_gameId_unique" UNIQUE("gameId")
);
--> statement-breakpoint
CREATE TABLE "adminChallengeConfig" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar DEFAULT 'organization' NOT NULL,
	"organizationId" varchar,
	"challengeType" varchar NOT NULL,
	"title" varchar NOT NULL,
	"description" text NOT NULL,
	"goalType" varchar NOT NULL,
	"goalTarget" integer NOT NULL,
	"coinReward" integer DEFAULT 0,
	"xpReward" integer DEFAULT 0,
	"powerUpReward" varchar,
	"isActive" boolean DEFAULT true,
	"createdBy" varchar,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "aiConfig" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar DEFAULT 'gemini' NOT NULL,
	"apiKey" varchar NOT NULL,
	"modelName" varchar NOT NULL,
	"isActive" boolean DEFAULT true,
	"createdBy" varchar NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cardCollections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"totalCards" integer NOT NULL,
	"imageKey" varchar,
	"isActive" boolean DEFAULT true,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cardStats" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cardId" varchar NOT NULL,
	"statTypeId" varchar NOT NULL,
	"value" numeric(10, 3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collectionId" varchar NOT NULL,
	"name" varchar NOT NULL,
	"imageKey" varchar,
	"displayOrder" integer NOT NULL,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "challengeProgress" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"challengeId" varchar NOT NULL,
	"currentValue" integer DEFAULT 0,
	"isCompleted" boolean DEFAULT false,
	"isClaimed" boolean DEFAULT false,
	"completedAt" timestamp,
	"claimedAt" timestamp,
	"resetAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "challengeTemplates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"description" text NOT NULL,
	"type" varchar NOT NULL,
	"requirement" varchar NOT NULL,
	"targetValue" integer NOT NULL,
	"coinReward" integer NOT NULL,
	"xpReward" integer DEFAULT 0,
	"powerUpReward" varchar,
	"isActive" boolean DEFAULT true,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coinAdjustments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"adminId" varchar NOT NULL,
	"organizationId" varchar,
	"balanceBefore" integer NOT NULL,
	"balanceAfter" integer NOT NULL,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coinTransactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"amount" integer NOT NULL,
	"balance" integer NOT NULL,
	"type" varchar NOT NULL,
	"description" text,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "collectionStatTypes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collectionId" varchar NOT NULL,
	"statName" varchar NOT NULL,
	"statUnit" varchar,
	"universalUnitId" varchar,
	"displayOrder" integer NOT NULL,
	"comparisonType" varchar DEFAULT 'highest'
);
--> statement-breakpoint
CREATE TABLE "cosmeticCatalog" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"description" text NOT NULL,
	"type" varchar NOT NULL,
	"effect" jsonb NOT NULL,
	"coinCost" integer NOT NULL,
	"tier" varchar DEFAULT 'common',
	"isActive" boolean DEFAULT true,
	"previewUrl" varchar,
	"isSeasonPassExclusive" boolean DEFAULT false,
	"seasonNumber" integer,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cosmeticOwnership" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"cosmeticId" varchar NOT NULL,
	"purchasedAt" timestamp DEFAULT now(),
	CONSTRAINT "UNQ_user_cosmetic" UNIQUE("userId","cosmeticId")
);
--> statement-breakpoint
CREATE TABLE "equippedCosmetics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"cosmeticId" varchar NOT NULL,
	"slot" varchar NOT NULL,
	"equippedAt" timestamp DEFAULT now(),
	CONSTRAINT "UNQ_user_slot" UNIQUE("userId","slot")
);
--> statement-breakpoint
CREATE TABLE "explanationTerms" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"explanationId" varchar NOT NULL,
	"termId" varchar NOT NULL,
	"termOccurrences" integer DEFAULT 1,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gameResults" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gameRoomId" varchar,
	"collectionId" varchar NOT NULL,
	"winnerId" varchar,
	"gameMode" varchar NOT NULL,
	"playerIds" text[] NOT NULL,
	"playerXPChanges" jsonb,
	"totalRounds" integer NOT NULL,
	"gameDuration" integer,
	"isMultiplayer" boolean DEFAULT true,
	"gameStartedAt" timestamp NOT NULL,
	"gameEndedAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gameRooms" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hostPlayerId" varchar NOT NULL,
	"collectionId" varchar NOT NULL,
	"gameMode" varchar NOT NULL,
	"maxPlayers" integer NOT NULL,
	"currentPlayers" integer DEFAULT 1,
	"gameState" varchar DEFAULT 'waiting',
	"gameData" jsonb,
	"roundTimeSeconds" integer DEFAULT 5,
	"gameTimeSeconds" integer DEFAULT 120,
	"joinCode" varchar NOT NULL,
	"gameStartedAt" timestamp,
	"gameEndedAt" timestamp,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "gameRooms_joinCode_unique" UNIQUE("joinCode")
);
--> statement-breakpoint
CREATE TABLE "gamificationEconomyRules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar DEFAULT 'organization' NOT NULL,
	"organizationId" varchar,
	"actionType" varchar NOT NULL,
	"coinReward" integer DEFAULT 0,
	"xpReward" integer DEFAULT 0,
	"description" text,
	"isActive" boolean DEFAULT true,
	"createdBy" varchar,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "UNQ_scope_org_activity" UNIQUE("scope","organizationId","actionType")
);
--> statement-breakpoint
CREATE TABLE "guestSessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sessionId" varchar NOT NULL,
	"guestName" varchar NOT NULL,
	"lastActiveAt" timestamp DEFAULT now(),
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "guestSessions_sessionId_unique" UNIQUE("sessionId")
);
--> statement-breakpoint
CREATE TABLE "joinRequests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"organizationId" varchar NOT NULL,
	"requestedUnitId" varchar,
	"requestedSubUnitId" varchar,
	"requestedSubjectIds" text[],
	"assignedUnitId" varchar,
	"assignedSubUnitId" varchar,
	"assignedSubjectIds" text[],
	"status" varchar DEFAULT 'pending' NOT NULL,
	"denialReason" text,
	"reviewedBy" varchar,
	"reviewedAt" timestamp,
	"approvedAt" timestamp,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "leaderBoard" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gamerName" varchar NOT NULL,
	"avatarImageUrl" varchar,
	"country" varchar(3),
	"playerTitle" varchar DEFAULT 'Rookie',
	"rank" integer DEFAULT 0,
	"totalWins" integer DEFAULT 0,
	"totalGames" integer DEFAULT 0,
	"winPercentage" numeric(5, 2) DEFAULT '0.00',
	"bestWinStreak" integer DEFAULT 0,
	"currentWinStreak" integer DEFAULT 0,
	"averageGameDuration" integer DEFAULT 0,
	"lastActiveAt" timestamp DEFAULT now(),
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "leaderBoard_gamerName_unique" UNIQUE("gamerName")
);
--> statement-breakpoint
CREATE TABLE "loginStreaks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"currentStreak" integer DEFAULT 0,
	"longestStreak" integer DEFAULT 0,
	"lastLoginDate" timestamp,
	"totalCoinsEarned" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "loginStreaks_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "organizationSubUnits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unitId" varchar NOT NULL,
	"name" varchar NOT NULL,
	"displayOrder" integer NOT NULL,
	"joinCode" varchar(50),
	"isActive" boolean DEFAULT true,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "organizationSubUnits_joinCode_unique" UNIQUE("joinCode")
);
--> statement-breakpoint
CREATE TABLE "organizationUnits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" varchar NOT NULL,
	"name" varchar NOT NULL,
	"displayOrder" integer NOT NULL,
	"joinCode" varchar(50),
	"isActive" boolean DEFAULT true,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "organizationUnits_joinCode_unique" UNIQUE("joinCode")
);
--> statement-breakpoint
CREATE TABLE "organizationUsageLimits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" varchar NOT NULL,
	"concurrentUsers" integer DEFAULT 0,
	"dailyQuizCount" integer DEFAULT 0,
	"aiExplanationCount" integer DEFAULT 0,
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "organizationUsageLimits_organizationId_unique" UNIQUE("organizationId")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"type" varchar NOT NULL,
	"inviteCode" varchar NOT NULL,
	"curriculum" varchar,
	"streetAddress" varchar,
	"city" varchar,
	"province" varchar,
	"postalCode" varchar,
	"country" varchar DEFAULT 'South Africa',
	"contactPhone" varchar,
	"studentCount" integer DEFAULT 0,
	"howHeardAboutUs" varchar,
	"isActive" boolean DEFAULT true,
	"isDemo" boolean DEFAULT false,
	"subscriptionStatus" varchar DEFAULT 'trial',
	"trialStartDate" timestamp DEFAULT now(),
	"trialEndDate" timestamp,
	"subscriptionStartDate" timestamp,
	"billingEmail" varchar,
	"pricingTier" varchar DEFAULT 'starter',
	"monthlyPrice" numeric(10, 2) DEFAULT '0.00',
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "organizations_inviteCode_unique" UNIQUE("inviteCode")
);
--> statement-breakpoint
CREATE TABLE "playerSessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gameRoomId" varchar NOT NULL,
	"playerId" varchar,
	"playerName" varchar NOT NULL,
	"playerPosition" integer NOT NULL,
	"cardStack" text[] NOT NULL,
	"cardCount" integer NOT NULL,
	"isActive" boolean DEFAULT false,
	"isNPC" boolean DEFAULT false,
	"joinedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "playerStats" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playerId" varchar NOT NULL,
	"gamerName" varchar NOT NULL,
	"currentXP" integer DEFAULT 0,
	"currentLevel" integer DEFAULT 1,
	"currentRank" varchar DEFAULT 'Rookie',
	"totalGamesPlayed" integer DEFAULT 0,
	"totalWins" integer DEFAULT 0,
	"totalLosses" integer DEFAULT 0,
	"winPercentage" numeric(5, 2) DEFAULT '0.00',
	"currentWinStreak" integer DEFAULT 0,
	"bestWinStreak" integer DEFAULT 0,
	"singlePlayerGames" integer DEFAULT 0,
	"singlePlayerWins" integer DEFAULT 0,
	"multiplayerGames" integer DEFAULT 0,
	"multiplayerWins" integer DEFAULT 0,
	"averageGameDuration" integer DEFAULT 0,
	"totalXPEarned" integer DEFAULT 0,
	"totalXPLost" integer DEFAULT 0,
	"lastGameAt" timestamp,
	"lastLevelChangeAt" timestamp,
	"lastRankChangeAt" timestamp,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "playerStats_playerId_unique" UNIQUE("playerId")
);
--> statement-breakpoint
CREATE TABLE "powerUpCatalog" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"description" text NOT NULL,
	"type" varchar NOT NULL,
	"effect" jsonb NOT NULL,
	"coinCost" integer NOT NULL,
	"tier" varchar DEFAULT 'common',
	"isActive" boolean DEFAULT true,
	"iconUrl" varchar,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "powerUpInventory" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"powerUpId" varchar NOT NULL,
	"quantity" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "UNQ_user_powerup" UNIQUE("userId","powerUpId")
);
--> statement-breakpoint
CREATE TABLE "quizCardExplanations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cardId" varchar NOT NULL,
	"explanation" text NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "quizCardExplanations_cardId_unique" UNIQUE("cardId")
);
--> statement-breakpoint
CREATE TABLE "quizCards" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collectionId" varchar NOT NULL,
	"questionType" varchar DEFAULT 'multiple-choice' NOT NULL,
	"question" text NOT NULL,
	"answer1" text NOT NULL,
	"answer2" text NOT NULL,
	"answer3" text NOT NULL,
	"answer4" text NOT NULL,
	"answer5" text NOT NULL,
	"answer6" text NOT NULL,
	"correctAnswerIndex" integer NOT NULL,
	"matchPairs" jsonb,
	"correctAnswer" text,
	"imageKey" varchar,
	"displayOrder" integer NOT NULL,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quizCollectionAssignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collectionId" varchar NOT NULL,
	"subjectId" varchar,
	"unitId" varchar,
	"subUnitId" varchar,
	"requiredPassPercentage" integer DEFAULT 70,
	"availableFrom" timestamp,
	"availableTo" timestamp,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quizCollections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" varchar,
	"subjectId" varchar,
	"createdBy" varchar,
	"name" varchar NOT NULL,
	"description" text,
	"totalCards" integer DEFAULT 0,
	"imageKey" varchar,
	"isActive" boolean DEFAULT true,
	"isPublic" boolean DEFAULT false,
	"isDeleted" boolean DEFAULT false,
	"difficulty" varchar(50),
	"passPercentage" integer DEFAULT 70,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quizDrafts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" varchar NOT NULL,
	"createdBy" varchar NOT NULL,
	"gradeId" varchar,
	"subjectId" varchar,
	"topic" text,
	"primaryTopic" text,
	"subtopic1" text,
	"subtopic2" text,
	"numberOfQuestions" integer DEFAULT 10,
	"difficulty" varchar(50) DEFAULT 'medium',
	"requiredPassPercentage" integer DEFAULT 70,
	"questionTypeDistribution" jsonb,
	"name" varchar,
	"description" text,
	"quizName" varchar,
	"quizDescription" text,
	"isPublic" boolean DEFAULT false,
	"passPercentage" integer DEFAULT 70,
	"generatedQuestions" jsonb,
	"currentStep" integer DEFAULT 1,
	"isPublished" boolean DEFAULT false,
	"publishedCollectionId" varchar,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quizGameProgress" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"collectionId" varchar NOT NULL,
	"organizationId" varchar,
	"unitId" varchar,
	"subUnitId" varchar,
	"totalGamesPlayed" integer DEFAULT 0,
	"totalGamesWon" integer DEFAULT 0,
	"totalCorrectAnswers" integer DEFAULT 0,
	"totalAnswers" integer DEFAULT 0,
	"averageScore" numeric(5, 2) DEFAULT '0.00',
	"bestScore" integer DEFAULT 0,
	"lastPlayedAt" timestamp,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quizGameResults" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gameId" varchar NOT NULL,
	"collectionId" varchar NOT NULL,
	"gameMode" varchar NOT NULL,
	"player1Id" varchar NOT NULL,
	"player1Name" varchar NOT NULL,
	"player1Score" integer NOT NULL,
	"player1CorrectAnswers" integer NOT NULL,
	"player1TotalAnswers" integer NOT NULL,
	"player2Id" varchar,
	"player2Name" varchar,
	"player2Score" integer,
	"player2CorrectAnswers" integer,
	"player2TotalAnswers" integer,
	"winnerId" varchar,
	"gameDuration" integer,
	"gameStartedAt" timestamp NOT NULL,
	"gameEndedAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "salesInquiries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"surname" varchar NOT NULL,
	"email" varchar NOT NULL,
	"phone" varchar NOT NULL,
	"organizationName" varchar NOT NULL,
	"position" varchar NOT NULL,
	"positionOther" text,
	"studentCount" varchar NOT NULL,
	"hearAboutUs" varchar NOT NULL,
	"hearAboutUsOther" text,
	"customMessage" text,
	"status" varchar DEFAULT 'Follow Up' NOT NULL,
	"statusUpdatedAt" timestamp DEFAULT now(),
	"statusUpdatedBy" varchar,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "seasonPassConfig" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar DEFAULT 'organization' NOT NULL,
	"organizationId" varchar,
	"seasonNumber" integer NOT NULL,
	"seasonName" varchar NOT NULL,
	"description" text,
	"tierDefinitions" jsonb NOT NULL,
	"coinCost" integer DEFAULT 0,
	"coinMultiplier" numeric(4, 2) DEFAULT '1.00',
	"xpMultiplier" numeric(4, 2) DEFAULT '1.00',
	"advantages" text,
	"startDate" timestamp NOT NULL,
	"endDate" timestamp NOT NULL,
	"isActive" boolean DEFAULT true,
	"createdBy" varchar,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "UNQ_scope_org_season" UNIQUE("scope","organizationId","seasonNumber")
);
--> statement-breakpoint
CREATE TABLE "seasonPassProgress" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"seasonNumber" integer NOT NULL,
	"currentTier" integer DEFAULT 0,
	"seasonXP" integer DEFAULT 0,
	"unlockedTiers" text[] DEFAULT ARRAY[]::text[],
	"claimedTiers" text[] DEFAULT ARRAY[]::text[],
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "UNQ_user_season" UNIQUE("userId","seasonNumber")
);
--> statement-breakpoint
CREATE TABLE "seasonPassPurchases" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"seasonPassConfigId" varchar NOT NULL,
	"purchasedAt" timestamp DEFAULT now(),
	"expiresAt" timestamp NOT NULL,
	"coinsPaid" integer NOT NULL,
	"isActive" boolean DEFAULT true,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "UNQ_user_season_pass" UNIQUE("userId","seasonPassConfigId")
);
--> statement-breakpoint
CREATE TABLE "seasonPassTiers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seasonNumber" integer NOT NULL,
	"tier" integer NOT NULL,
	"xpRequired" integer NOT NULL,
	"rewardType" varchar NOT NULL,
	"rewardId" varchar,
	"rewardAmount" integer,
	"isActive" boolean DEFAULT true,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopItemPricing" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar DEFAULT 'organization' NOT NULL,
	"organizationId" varchar,
	"itemType" varchar NOT NULL,
	"itemId" varchar NOT NULL,
	"coinCost" integer NOT NULL,
	"isAvailable" boolean DEFAULT true,
	"customDescription" text,
	"createdBy" varchar,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "UNQ_scope_org_item" UNIQUE("scope","organizationId","itemType","itemId")
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" varchar NOT NULL,
	"unitId" varchar,
	"name" varchar NOT NULL,
	"description" text,
	"createdBy" varchar NOT NULL,
	"isActive" boolean DEFAULT true,
	"isDeleted" boolean DEFAULT false,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "termDefinitions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term" varchar NOT NULL,
	"definition" text NOT NULL,
	"subjectId" varchar,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "unitSubjects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unitId" varchar NOT NULL,
	"subjectId" varchar NOT NULL,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "universalStatUnits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unitName" varchar NOT NULL,
	"unitSymbol" varchar NOT NULL,
	"description" text,
	"category" varchar,
	"isActive" boolean DEFAULT true,
	"isPredefined" boolean DEFAULT false,
	"createdBy" varchar,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "universalStatUnits_unitName_unique" UNIQUE("unitName")
);
--> statement-breakpoint
CREATE TABLE "userCosmeticLoadouts" (
	"userId" varchar PRIMARY KEY NOT NULL,
	"equippedBorder" varchar,
	"equippedGlow" varchar,
	"equippedBadge" varchar,
	"equippedAnimation" varchar,
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "userOrganizationAssignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"organizationId" varchar NOT NULL,
	"unitId" varchar,
	"subUnitId" varchar,
	"subjectId" varchar,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "userOrganizationRoles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"organizationId" varchar NOT NULL,
	"role" varchar NOT NULL,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "userQuizProgress" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"collectionId" varchar NOT NULL,
	"assignmentId" varchar,
	"organizationId" varchar,
	"unitId" varchar,
	"subUnitId" varchar,
	"attemptsCount" integer DEFAULT 0,
	"bestScore" integer DEFAULT 0,
	"bestPercentage" numeric(5, 2) DEFAULT '0.00',
	"isPassed" boolean DEFAULT false,
	"completionStatus" varchar DEFAULT 'outstanding',
	"lastAttemptAt" timestamp,
	"passedAt" timestamp,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gamerName" varchar NOT NULL,
	"email" varchar NOT NULL,
	"password" varchar NOT NULL,
	"isAdmin" boolean DEFAULT false,
	"isSuperAdmin" boolean DEFAULT false,
	"firstName" varchar,
	"lastName" varchar,
	"positionAtOrg" varchar,
	"profileImageUrl" varchar,
	"avatarImageUrl" varchar,
	"country" varchar(3),
	"bio" text,
	"playerTitle" varchar DEFAULT 'Rookie',
	"preferredGameModes" jsonb,
	"isStatsPublic" boolean DEFAULT true,
	"bestWinStreak" integer DEFAULT 0,
	"currentWinStreak" integer DEFAULT 0,
	"averageGameDuration" integer DEFAULT 0,
	"totalGamesPlayed" integer DEFAULT 0,
	"totalWins" integer DEFAULT 0,
	"winPercentage" numeric(5, 2) DEFAULT '0.00',
	"isLocked" boolean DEFAULT false,
	"failedLoginAttempts" integer DEFAULT 0,
	"lockedUntil" timestamp,
	"passwordResetToken" varchar,
	"passwordResetExpires" timestamp,
	"lastActiveAt" timestamp DEFAULT now(),
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "users_gamerName_unique" UNIQUE("gamerName"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "achievementUnlocks" ADD CONSTRAINT "achievementUnlocks_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievementUnlocks" ADD CONSTRAINT "achievementUnlocks_achievementId_achievementCatalog_id_fk" FOREIGN KEY ("achievementId") REFERENCES "public"."achievementCatalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activeOneVOneGames" ADD CONSTRAINT "activeOneVOneGames_collectionId_cardCollections_id_fk" FOREIGN KEY ("collectionId") REFERENCES "public"."cardCollections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activePowerUps" ADD CONSTRAINT "activePowerUps_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activePowerUps" ADD CONSTRAINT "activePowerUps_powerUpId_powerUpCatalog_id_fk" FOREIGN KEY ("powerUpId") REFERENCES "public"."powerUpCatalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activeQuizGames" ADD CONSTRAINT "activeQuizGames_collectionId_quizCollections_id_fk" FOREIGN KEY ("collectionId") REFERENCES "public"."quizCollections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adminChallengeConfig" ADD CONSTRAINT "adminChallengeConfig_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adminChallengeConfig" ADD CONSTRAINT "adminChallengeConfig_powerUpReward_powerUpCatalog_id_fk" FOREIGN KEY ("powerUpReward") REFERENCES "public"."powerUpCatalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adminChallengeConfig" ADD CONSTRAINT "adminChallengeConfig_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aiConfig" ADD CONSTRAINT "aiConfig_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cardStats" ADD CONSTRAINT "cardStats_cardId_cards_id_fk" FOREIGN KEY ("cardId") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cardStats" ADD CONSTRAINT "cardStats_statTypeId_collectionStatTypes_id_fk" FOREIGN KEY ("statTypeId") REFERENCES "public"."collectionStatTypes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_collectionId_cardCollections_id_fk" FOREIGN KEY ("collectionId") REFERENCES "public"."cardCollections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challengeProgress" ADD CONSTRAINT "challengeProgress_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challengeProgress" ADD CONSTRAINT "challengeProgress_challengeId_challengeTemplates_id_fk" FOREIGN KEY ("challengeId") REFERENCES "public"."challengeTemplates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challengeTemplates" ADD CONSTRAINT "challengeTemplates_powerUpReward_powerUpCatalog_id_fk" FOREIGN KEY ("powerUpReward") REFERENCES "public"."powerUpCatalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coinAdjustments" ADD CONSTRAINT "coinAdjustments_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coinAdjustments" ADD CONSTRAINT "coinAdjustments_adminId_users_id_fk" FOREIGN KEY ("adminId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coinAdjustments" ADD CONSTRAINT "coinAdjustments_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coinTransactions" ADD CONSTRAINT "coinTransactions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectionStatTypes" ADD CONSTRAINT "collectionStatTypes_collectionId_cardCollections_id_fk" FOREIGN KEY ("collectionId") REFERENCES "public"."cardCollections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectionStatTypes" ADD CONSTRAINT "collectionStatTypes_universalUnitId_universalStatUnits_id_fk" FOREIGN KEY ("universalUnitId") REFERENCES "public"."universalStatUnits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cosmeticOwnership" ADD CONSTRAINT "cosmeticOwnership_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cosmeticOwnership" ADD CONSTRAINT "cosmeticOwnership_cosmeticId_cosmeticCatalog_id_fk" FOREIGN KEY ("cosmeticId") REFERENCES "public"."cosmeticCatalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equippedCosmetics" ADD CONSTRAINT "equippedCosmetics_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equippedCosmetics" ADD CONSTRAINT "equippedCosmetics_cosmeticId_cosmeticCatalog_id_fk" FOREIGN KEY ("cosmeticId") REFERENCES "public"."cosmeticCatalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "explanationTerms" ADD CONSTRAINT "explanationTerms_explanationId_quizCardExplanations_id_fk" FOREIGN KEY ("explanationId") REFERENCES "public"."quizCardExplanations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "explanationTerms" ADD CONSTRAINT "explanationTerms_termId_termDefinitions_id_fk" FOREIGN KEY ("termId") REFERENCES "public"."termDefinitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gameResults" ADD CONSTRAINT "gameResults_gameRoomId_gameRooms_id_fk" FOREIGN KEY ("gameRoomId") REFERENCES "public"."gameRooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gameResults" ADD CONSTRAINT "gameResults_collectionId_cardCollections_id_fk" FOREIGN KEY ("collectionId") REFERENCES "public"."cardCollections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gameResults" ADD CONSTRAINT "gameResults_winnerId_users_id_fk" FOREIGN KEY ("winnerId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gameRooms" ADD CONSTRAINT "gameRooms_hostPlayerId_users_id_fk" FOREIGN KEY ("hostPlayerId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gameRooms" ADD CONSTRAINT "gameRooms_collectionId_cardCollections_id_fk" FOREIGN KEY ("collectionId") REFERENCES "public"."cardCollections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamificationEconomyRules" ADD CONSTRAINT "gamificationEconomyRules_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamificationEconomyRules" ADD CONSTRAINT "gamificationEconomyRules_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "joinRequests" ADD CONSTRAINT "joinRequests_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "joinRequests" ADD CONSTRAINT "joinRequests_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "joinRequests" ADD CONSTRAINT "joinRequests_requestedUnitId_organizationUnits_id_fk" FOREIGN KEY ("requestedUnitId") REFERENCES "public"."organizationUnits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "joinRequests" ADD CONSTRAINT "joinRequests_requestedSubUnitId_organizationSubUnits_id_fk" FOREIGN KEY ("requestedSubUnitId") REFERENCES "public"."organizationSubUnits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "joinRequests" ADD CONSTRAINT "joinRequests_assignedUnitId_organizationUnits_id_fk" FOREIGN KEY ("assignedUnitId") REFERENCES "public"."organizationUnits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "joinRequests" ADD CONSTRAINT "joinRequests_assignedSubUnitId_organizationSubUnits_id_fk" FOREIGN KEY ("assignedSubUnitId") REFERENCES "public"."organizationSubUnits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "joinRequests" ADD CONSTRAINT "joinRequests_reviewedBy_users_id_fk" FOREIGN KEY ("reviewedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loginStreaks" ADD CONSTRAINT "loginStreaks_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizationSubUnits" ADD CONSTRAINT "organizationSubUnits_unitId_organizationUnits_id_fk" FOREIGN KEY ("unitId") REFERENCES "public"."organizationUnits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizationUnits" ADD CONSTRAINT "organizationUnits_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizationUsageLimits" ADD CONSTRAINT "organizationUsageLimits_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playerSessions" ADD CONSTRAINT "playerSessions_gameRoomId_gameRooms_id_fk" FOREIGN KEY ("gameRoomId") REFERENCES "public"."gameRooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playerSessions" ADD CONSTRAINT "playerSessions_playerId_users_id_fk" FOREIGN KEY ("playerId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playerStats" ADD CONSTRAINT "playerStats_playerId_users_id_fk" FOREIGN KEY ("playerId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "powerUpInventory" ADD CONSTRAINT "powerUpInventory_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "powerUpInventory" ADD CONSTRAINT "powerUpInventory_powerUpId_powerUpCatalog_id_fk" FOREIGN KEY ("powerUpId") REFERENCES "public"."powerUpCatalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizCardExplanations" ADD CONSTRAINT "quizCardExplanations_cardId_quizCards_id_fk" FOREIGN KEY ("cardId") REFERENCES "public"."quizCards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizCards" ADD CONSTRAINT "quizCards_collectionId_quizCollections_id_fk" FOREIGN KEY ("collectionId") REFERENCES "public"."quizCollections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizCollectionAssignments" ADD CONSTRAINT "quizCollectionAssignments_collectionId_quizCollections_id_fk" FOREIGN KEY ("collectionId") REFERENCES "public"."quizCollections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizCollectionAssignments" ADD CONSTRAINT "quizCollectionAssignments_subjectId_subjects_id_fk" FOREIGN KEY ("subjectId") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizCollectionAssignments" ADD CONSTRAINT "quizCollectionAssignments_unitId_organizationUnits_id_fk" FOREIGN KEY ("unitId") REFERENCES "public"."organizationUnits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizCollectionAssignments" ADD CONSTRAINT "quizCollectionAssignments_subUnitId_organizationSubUnits_id_fk" FOREIGN KEY ("subUnitId") REFERENCES "public"."organizationSubUnits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizCollections" ADD CONSTRAINT "quizCollections_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizCollections" ADD CONSTRAINT "quizCollections_subjectId_subjects_id_fk" FOREIGN KEY ("subjectId") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizCollections" ADD CONSTRAINT "quizCollections_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizDrafts" ADD CONSTRAINT "quizDrafts_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizDrafts" ADD CONSTRAINT "quizDrafts_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizDrafts" ADD CONSTRAINT "quizDrafts_gradeId_organizationUnits_id_fk" FOREIGN KEY ("gradeId") REFERENCES "public"."organizationUnits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizDrafts" ADD CONSTRAINT "quizDrafts_subjectId_subjects_id_fk" FOREIGN KEY ("subjectId") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizDrafts" ADD CONSTRAINT "quizDrafts_publishedCollectionId_quizCollections_id_fk" FOREIGN KEY ("publishedCollectionId") REFERENCES "public"."quizCollections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizGameProgress" ADD CONSTRAINT "quizGameProgress_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizGameProgress" ADD CONSTRAINT "quizGameProgress_collectionId_quizCollections_id_fk" FOREIGN KEY ("collectionId") REFERENCES "public"."quizCollections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizGameProgress" ADD CONSTRAINT "quizGameProgress_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizGameProgress" ADD CONSTRAINT "quizGameProgress_unitId_organizationUnits_id_fk" FOREIGN KEY ("unitId") REFERENCES "public"."organizationUnits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizGameProgress" ADD CONSTRAINT "quizGameProgress_subUnitId_organizationSubUnits_id_fk" FOREIGN KEY ("subUnitId") REFERENCES "public"."organizationSubUnits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizGameResults" ADD CONSTRAINT "quizGameResults_collectionId_quizCollections_id_fk" FOREIGN KEY ("collectionId") REFERENCES "public"."quizCollections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salesInquiries" ADD CONSTRAINT "salesInquiries_statusUpdatedBy_users_id_fk" FOREIGN KEY ("statusUpdatedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasonPassConfig" ADD CONSTRAINT "seasonPassConfig_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasonPassConfig" ADD CONSTRAINT "seasonPassConfig_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasonPassProgress" ADD CONSTRAINT "seasonPassProgress_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasonPassPurchases" ADD CONSTRAINT "seasonPassPurchases_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasonPassPurchases" ADD CONSTRAINT "seasonPassPurchases_seasonPassConfigId_seasonPassConfig_id_fk" FOREIGN KEY ("seasonPassConfigId") REFERENCES "public"."seasonPassConfig"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopItemPricing" ADD CONSTRAINT "shopItemPricing_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopItemPricing" ADD CONSTRAINT "shopItemPricing_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_unitId_organizationUnits_id_fk" FOREIGN KEY ("unitId") REFERENCES "public"."organizationUnits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "termDefinitions" ADD CONSTRAINT "termDefinitions_subjectId_subjects_id_fk" FOREIGN KEY ("subjectId") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unitSubjects" ADD CONSTRAINT "unitSubjects_unitId_organizationUnits_id_fk" FOREIGN KEY ("unitId") REFERENCES "public"."organizationUnits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unitSubjects" ADD CONSTRAINT "unitSubjects_subjectId_subjects_id_fk" FOREIGN KEY ("subjectId") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universalStatUnits" ADD CONSTRAINT "universalStatUnits_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userCosmeticLoadouts" ADD CONSTRAINT "userCosmeticLoadouts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userOrganizationAssignments" ADD CONSTRAINT "userOrganizationAssignments_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userOrganizationAssignments" ADD CONSTRAINT "userOrganizationAssignments_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userOrganizationAssignments" ADD CONSTRAINT "userOrganizationAssignments_unitId_organizationUnits_id_fk" FOREIGN KEY ("unitId") REFERENCES "public"."organizationUnits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userOrganizationAssignments" ADD CONSTRAINT "userOrganizationAssignments_subUnitId_organizationSubUnits_id_fk" FOREIGN KEY ("subUnitId") REFERENCES "public"."organizationSubUnits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userOrganizationAssignments" ADD CONSTRAINT "userOrganizationAssignments_subjectId_subjects_id_fk" FOREIGN KEY ("subjectId") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userOrganizationRoles" ADD CONSTRAINT "userOrganizationRoles_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userOrganizationRoles" ADD CONSTRAINT "userOrganizationRoles_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userQuizProgress" ADD CONSTRAINT "userQuizProgress_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userQuizProgress" ADD CONSTRAINT "userQuizProgress_collectionId_quizCollections_id_fk" FOREIGN KEY ("collectionId") REFERENCES "public"."quizCollections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userQuizProgress" ADD CONSTRAINT "userQuizProgress_assignmentId_quizCollectionAssignments_id_fk" FOREIGN KEY ("assignmentId") REFERENCES "public"."quizCollectionAssignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userQuizProgress" ADD CONSTRAINT "userQuizProgress_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userQuizProgress" ADD CONSTRAINT "userQuizProgress_unitId_organizationUnits_id_fk" FOREIGN KEY ("unitId") REFERENCES "public"."organizationUnits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userQuizProgress" ADD CONSTRAINT "userQuizProgress_subUnitId_organizationSubUnits_id_fk" FOREIGN KEY ("subUnitId") REFERENCES "public"."organizationSubUnits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_achievement_unlocks_user" ON "achievementUnlocks" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_active_games_last_activity" ON "activeOneVOneGames" USING btree ("lastActivityAt");--> statement-breakpoint
CREATE INDEX "IDX_active_games_game_phase" ON "activeOneVOneGames" USING btree ("gamePhase");--> statement-breakpoint
CREATE INDEX "IDX_active_powerups_user" ON "activePowerUps" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_active_powerups_expires" ON "activePowerUps" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "IDX_active_quiz_games_phase" ON "activeQuizGames" USING btree ("gamePhase");--> statement-breakpoint
CREATE INDEX "IDX_admin_challenge_config_org" ON "adminChallengeConfig" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "IDX_admin_challenge_config_scope" ON "adminChallengeConfig" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "IDX_challenge_progress_user" ON "challengeProgress" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_challenge_progress_reset" ON "challengeProgress" USING btree ("resetAt");--> statement-breakpoint
CREATE INDEX "IDX_coin_adjustments_user" ON "coinAdjustments" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_coin_adjustments_admin" ON "coinAdjustments" USING btree ("adminId");--> statement-breakpoint
CREATE INDEX "IDX_coin_transactions_user" ON "coinTransactions" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_coin_transactions_created" ON "coinTransactions" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "IDX_cosmetic_ownership_user" ON "cosmeticOwnership" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_equipped_cosmetics_user" ON "equippedCosmetics" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_explanation_terms" ON "explanationTerms" USING btree ("explanationId","termId");--> statement-breakpoint
CREATE INDEX "IDX_economy_rules_org" ON "gamificationEconomyRules" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "IDX_economy_rules_scope" ON "gamificationEconomyRules" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "IDX_join_requests_user" ON "joinRequests" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_join_requests_org" ON "joinRequests" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "IDX_join_requests_status" ON "joinRequests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_login_streaks_user" ON "loginStreaks" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_organization_subunit_join_code" ON "organizationSubUnits" USING btree ("joinCode");--> statement-breakpoint
CREATE INDEX "IDX_organization_unit_join_code" ON "organizationUnits" USING btree ("joinCode");--> statement-breakpoint
CREATE INDEX "IDX_org_usage_limits" ON "organizationUsageLimits" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "IDX_powerup_inventory_user" ON "powerUpInventory" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_quiz_card_explanations_card" ON "quizCardExplanations" USING btree ("cardId");--> statement-breakpoint
CREATE INDEX "IDX_quiz_assignments" ON "quizCollectionAssignments" USING btree ("collectionId");--> statement-breakpoint
CREATE INDEX "IDX_quiz_drafts_org" ON "quizDrafts" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "IDX_quiz_drafts_creator" ON "quizDrafts" USING btree ("createdBy");--> statement-breakpoint
CREATE INDEX "IDX_quiz_progress" ON "quizGameProgress" USING btree ("userId","collectionId");--> statement-breakpoint
CREATE INDEX "IDX_quiz_results_player" ON "quizGameResults" USING btree ("player1Id");--> statement-breakpoint
CREATE INDEX "IDX_quiz_results_collection" ON "quizGameResults" USING btree ("collectionId");--> statement-breakpoint
CREATE INDEX "IDX_sales_inquiries_created" ON "salesInquiries" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "IDX_sales_inquiries_status" ON "salesInquiries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_season_config_org" ON "seasonPassConfig" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "IDX_season_config_scope" ON "seasonPassConfig" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "IDX_season_progress_user" ON "seasonPassProgress" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_season_pass_purchases_user" ON "seasonPassPurchases" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_season_pass_purchases_config" ON "seasonPassPurchases" USING btree ("seasonPassConfigId");--> statement-breakpoint
CREATE INDEX "IDX_season_pass_purchases_active" ON "seasonPassPurchases" USING btree ("isActive");--> statement-breakpoint
CREATE INDEX "IDX_season_tiers" ON "seasonPassTiers" USING btree ("seasonNumber","tier");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "IDX_shop_pricing_org" ON "shopItemPricing" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "IDX_shop_pricing_scope" ON "shopItemPricing" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "IDX_subjects_org" ON "subjects" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "IDX_term_definitions_term" ON "termDefinitions" USING btree ("term");--> statement-breakpoint
CREATE INDEX "IDX_term_definitions_subject" ON "termDefinitions" USING btree ("subjectId");--> statement-breakpoint
CREATE INDEX "IDX_unit_subjects" ON "unitSubjects" USING btree ("unitId","subjectId");--> statement-breakpoint
CREATE INDEX "IDX_user_cosmetic_loadouts_user" ON "userCosmeticLoadouts" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_user_org_assignments" ON "userOrganizationAssignments" USING btree ("userId","organizationId");--> statement-breakpoint
CREATE INDEX "IDX_user_org_roles" ON "userOrganizationRoles" USING btree ("userId","organizationId");--> statement-breakpoint
CREATE INDEX "IDX_user_quiz_progress" ON "userQuizProgress" USING btree ("userId","collectionId");