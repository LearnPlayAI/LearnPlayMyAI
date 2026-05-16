# LearnPlay Cloud-On-Prem — AI Developer Handover Document

**For:** GPT-5.3-CODEX in Google Antigravity IDE  
**Target OS:** Ubuntu Server 24.04 LTS  
**Project root:** `/antigravity/learnplay/cloud-on-prem/`  
**Date:** 2026-03-04  

Read this entire document before writing or modifying any code. It covers every system, integration, database table, environment variable, and architectural convention in use.

---

## Table of Contents

1. [Variant Identity and Purpose](#1-variant-identity-and-purpose)
2. [Technology Stack](#2-technology-stack)
3. [OS Dependencies (Ubuntu 24.04)](#3-os-dependencies-ubuntu-2404)
4. [Directory Structure](#4-directory-structure)
5. [Environment Variables — Complete Reference](#5-environment-variables--complete-reference)
6. [Database Schema — Every Table](#6-database-schema--every-table)
7. [Authentication and User Roles](#7-authentication-and-user-roles)
8. [File Storage Architecture](#8-file-storage-architecture)
9. [Google Gemini AI Integration](#9-google-gemini-ai-integration)
10. [Gamma Presentation Generation](#10-gamma-presentation-generation)
11. [Yoco Payment Integration](#11-yoco-payment-integration)
12. [MailerSend Email Integration](#12-mailersend-email-integration)
13. [Multi-Tenancy Architecture](#13-multi-tenancy-architecture)
14. [Gamification System](#14-gamification-system)
15. [LMS — Courses, Lessons, Quizzes, Certificates](#15-lms--courses-lessons-quizzes-certificates)
16. [Real-Time Features (Socket.io)](#16-real-time-features-socketio)
17. [Background Jobs and Schedulers](#17-background-jobs-and-schedulers)
18. [Route File Reference](#18-route-file-reference)
19. [Frontend Architecture](#19-frontend-architecture)
20. [NPM Scripts](#20-npm-scripts)
21. [First-Time Setup on Ubuntu 24.04](#21-first-time-setup-on-ubuntu-2404)
22. [Architecture Rules and Conventions](#22-architecture-rules-and-conventions)

---

## 1. Variant Identity and Purpose

This is the **Cloud-On-Prem** build of the LearnPlay platform. It is a dual-mode codebase:

| Mode | When | File storage | DB |
|---|---|---|---|
| **Cloud production** | `ONPREM_MODE` unset | Google Cloud Storage (GCS) | Neon serverless or standard PostgreSQL |
| **Local development** | `ONPREM_MODE=true` | Local filesystem (`./uploads/`) | Any PostgreSQL |

For development on Ubuntu 24.04 with Google Antigravity IDE, always use `ONPREM_MODE=true`. This eliminates the GCS dependency entirely — files land in `./uploads/` on disk and are served by Express.

The platform is a full-featured Learning Management System (LMS) with:
- Multi-tenant organization management (schools, businesses, e-learning platforms)
- AI-powered course and quiz generation (Google Gemini)
- AI-powered presentation generation (Gamma API)
- Gamified trading card and quiz battle system (Socket.io real-time)
- Payment processing (Yoco, South African gateway, ZAR primary)
- Transactional email (MailerSend)
- White-label branding per organization
- Certificate generation and social sharing

---

## 2. Technology Stack

### Backend

| Technology | Version | Role |
|---|---|---|
| Node.js | 20 LTS | Runtime (install via nvm, not apt) |
| TypeScript | 5.6.3 | Language throughout |
| Express.js | — | HTTP server |
| express-session | — | Session management |
| Drizzle ORM | — | Type-safe database queries |
| @neondatabase/serverless | — | PostgreSQL driver (works with standard PG too) |
| PostgreSQL | 14+ | Database |
| Socket.io | — | Real-time bidirectional events |
| Zod | — | Runtime validation (shared with frontend) |
| tsx | — | TypeScript execution for dev (`npm run dev`) |
| esbuild | — | Server compilation for production |
| bcrypt | 6.0.0 | Password hashing (native C++ — needs build-essential) |
| sharp | 0.34.3 | Image processing (native C++ — needs build-essential) |

### Frontend

| Technology | Version | Role |
|---|---|---|
| React | 18.3.1 | UI framework |
| TypeScript | 5.6.3 | Language |
| Vite | 5.4 | Build tool + dev server (HMR) |
| wouter | 3.3.5 | Client-side routing |
| TanStack Query | 5.60.5 | Server state management |
| react-hook-form | 7.55.0 | Form management |
| @hookform/resolvers/zod | — | Zod validation in forms |
| Tailwind CSS | — | Utility-first CSS |
| shadcn/ui | — | Radix UI component library |
| framer-motion | — | Animations |
| recharts | — | Data visualization charts |
| lucide-react | — | Icons |
| react-icons | — | Company/brand icons |

### Key npm packages (full list)

```
@dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
@google-cloud/storage @google/genai
@neondatabase/serverless @replit/object-storage
@tanstack/react-query @hookform/resolvers
archiver axios bcrypt canvas-confetti class-variance-authority
clsx cmdk connect-pg-simple date-fns date-fns-tz docx
drizzle-orm drizzle-zod embla-carousel-react express express-session
fast-xml-parser flag-icons framer-motion input-otp
lucide-react mailersend mammoth memoizee multer
nodemailer openid-client passport passport-local
pdf-parse pdfkit pptx-in-html-out pptx-preview
react react-day-picker react-dom react-hook-form react-icons
react-resizable-panels recharts sharp socket.io socket.io-client
tailwind-merge tw-animate-css unzipper uuid vaul wouter ws
zod zod-validation-error
```

---

## 3. OS Dependencies (Ubuntu 24.04)

### REQUIRED — install before `npm install`

`sharp` and `bcrypt` are native C++ addons. Without build tools, `npm install` will abort with a node-gyp compilation error.

```bash
sudo apt update
sudo apt install -y build-essential python3 python3-dev curl git unzip postgresql-client
```

### Node.js 20 via nvm (do NOT use apt for Node.js)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
nvm alias default 20
node --version    # v20.x.x
npm --version
```

### Local PostgreSQL (if not using Neon)

```bash
sudo apt install -y postgresql
sudo systemctl enable --now postgresql
sudo -u postgres psql -c "CREATE DATABASE learnplay_dev;"
sudo -u postgres psql -c "CREATE USER learnplay WITH PASSWORD 'yourpassword';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE learnplay_dev TO learnplay;"
```

Connection string: `postgresql://learnplay:yourpassword@localhost:5432/learnplay_dev`

---

## 4. Directory Structure

```
Cloud-On-Prem/
├── client/                         React frontend (Vite)
│   ├── src/
│   │   ├── App.tsx                 Central router (wouter Switch/Route)
│   │   ├── main.tsx                Entry point
│   │   ├── components/             Reusable + domain-specific components
│   │   │   ├── ui/                 shadcn atomic components (Button, Input, etc.)
│   │   │   ├── brand-editor/       Live org theme preview system
│   │   │   ├── ObjectUploader.tsx  File upload (handles both GCS signed URL and on-prem token)
│   │   │   ├── QuizLeaderboard.tsx Real-time quiz standings
│   │   │   ├── CourseAssignmentModal.tsx Scope-based assignment wizard
│   │   │   ├── OrgSwitcher.tsx     Multi-org context switcher
│   │   │   └── ThemeGalleryPanel.tsx Gamma theme browser
│   │   ├── pages/                  Role-organized page components
│   │   │   ├── admin/              Org admin pages
│   │   │   ├── super-admin/        Platform admin pages
│   │   │   ├── teacher/            Course/quiz creation pages
│   │   │   ├── enterprise/         Enterprise customer portal pages
│   │   │   └── *.tsx               Shared pages (dashboard, auth, lesson player, etc.)
│   │   ├── lib/
│   │   │   └── queryClient.ts      TanStack Query config + apiRequest wrapper
│   │   └── hooks/                  Custom React hooks
│   └── index.html
├── server/
│   ├── index.ts                    Entry point: Express init, schedulers, Vite
│   ├── routes.ts                   Central router: mounts all domain routers
│   ├── db.ts                       Drizzle + Neon/PostgreSQL connection
│   ├── storage.ts                  IStorage interface + MemStorage implementation
│   ├── objectStorage.ts            Storage router: checks ONPREM_MODE, loads correct impl
│   ├── objectStorage-gcs.ts        GCS implementation (cloud production)
│   ├── objectStorage-onprem.ts     Local filesystem implementation (dev + on-prem)
│   ├── adminAuth.ts                Role-check middleware (isAdmin, isSuperAdmin, isOrgAdmin)
│   ├── tenantMiddleware.ts         RBAC helpers (isTeacherOrAdmin, etc.)
│   ├── xpService.ts                XP award logic
│   ├── gamificationService.ts      Gamification orchestration
│   ├── featureFlags.ts             Feature flag helpers
│   ├── vaultLoader.ts              Secrets/vault configuration
│   ├── ai/
│   │   └── aiService.ts            Primary Gemini AI abstraction
│   ├── routes/                     Domain route handlers (20+ files)
│   ├── services/                   Business logic services (80+ files)
│   ├── middleware/
│   │   ├── sessionAuthMiddleware.ts  Session validation, user context
│   │   ├── orgIsolationMiddleware.ts Cross-tenant data access prevention
│   │   └── usageLimitMiddleware.ts   AI rate limits, concurrent user caps
│   ├── schedulers/
│   │   ├── billingScheduler.ts     Subscription renewal, invoice, suspension
│   │   ├── challengeScheduler.ts   Daily challenge reset
│   │   └── seasonPassScheduler.ts  Season pass progression
│   ├── workers/
│   │   └── jobQueueWorker.ts       Async AI job processor
│   ├── config/                     Feature flags, vault config
│   └── scripts/                    Utility scripts (setup-yoco-webhook.ts, etc.)
├── shared/
│   └── schema.ts                   Drizzle table definitions + Zod schemas + TypeScript types
│                                   SINGLE SOURCE OF TRUTH for all data types
├── cloud/
│   ├── build-cloud-linux.sh        Production distribution build → dist-cloud/
│   ├── export-all.sh               Export DB + object store data from Replit
│   ├── import-platform-data.sh     Import DB tables from exported JSON
│   ├── package-source.sh           Bundle source + data for distribution
│   └── INSTALLATION_UBUNTU.md      Developer setup guide
├── uploads/                        Local file storage (ONPREM_MODE=true dev only)
│   ├── public/                     Publicly served (no auth)
│   └── private/                    Auth-gated (served via Express API)
├── dist-cloud/                     Compiled production output (git-ignored)
├── .env.example                    Environment variable template
├── .env                            Your local config (never commit)
├── drizzle.config.ts               Drizzle migration config — DO NOT MODIFY
├── vite.config.ts                  Vite config — DO NOT MODIFY
├── build-cloud-linux.sh            Top-level build script symlink
└── package.json                    Dependencies — DO NOT MODIFY directly
```

---

## 5. Environment Variables — Complete Reference

Copy `.env.example` to `.env` and fill in values. Generate secrets with `openssl rand -hex 32`.

### Core Platform

| Variable | Dev value | Prod value | Purpose |
|---|---|---|---|
| `NODE_ENV` | `development` | `production` | Dev=HMR+tsx; Prod=compiled dist |
| `PORT` | `8000` | `8000` | HTTP listen port |
| `BASE_URL` | `http://localhost:8000` | `https://yourdomain.com` | All generated links (emails, certs, webhooks) |
| `FRONTEND_URL` | same as BASE_URL | same as BASE_URL | Must equal BASE_URL |
| `VITE_DOMAIN` | same as BASE_URL | same as BASE_URL | Must equal BASE_URL |
| `DATABASE_URL` | `postgresql://...` | `postgresql://...` | Full PostgreSQL connection string |
| `SESSION_SECRET` | `openssl rand -hex 32` | strong random string | Session cookie signing (32+ chars required) |
| `COOKIE_SECURE` | `false` | `true` | `false`=HTTP dev; `true`=HTTPS only |
| `PLATFORM_DOMAINS` | — | `app.domain.com,...` | Extra allowed CORS/cookie domains |
| `DEFAULT_ORG_ID` | — | seed org ID | Default organization |

### Storage Mode
all defaults must be the same for Cloud prod as it is for Dev (local)

| Variable | Dev (local) | Cloud prod | Purpose |
|---|---|---|---|
| `ONPREM_MODE` | `true` | unset | `true`=local disk; unset=GCS |
| `UPLOAD_DIR` | `./uploads` | unset | Local upload root (dev/on-prem only)|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | not needed | full JSON string | GCS service account (inline) |
| `GOOGLE_APPLICATION_CREDENTIALS` | not needed | `/path/key.json` | GCS service account key file (alternative) |
| `GCS_BUCKET_PUBLIC` | not needed | `learnplay-public` | GCS bucket for public files |
| `GCS_BUCKET_PRIVATE` | not needed | `learnplay-private` | GCS bucket for private files |

### AI Services

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google Gemini (get from aistudio.google.com) |
| `GAMMA_API_KEY` | No | Gamma API for presentation generation |
| `ENABLE_AI_THUMBNAILS` | No | Toggle AI course thumbnail generation (`true`/`false`) |

### Email (MailerSend)

| Variable | Required | Purpose |
|---|---|---|
| `MAILERSEND_API_KEY` | Yes | MailerSend API token |
| `EMAIL_FROM` | Yes | Sender email address |
| `MAILERSEND_FROM_NAME` | No | Sender display name |
| `MAILERSEND_WEBHOOK_SECRET` | No | Webhook signature key |
| `MAILERSEND_TEMPLATE_RENEWAL_REMINDER` | No | MailerSend Template ID |
| `MAILERSEND_TEMPLATE_PAYMENT_SUCCESS` | No | MailerSend Template ID |
| `MAILERSEND_TEMPLATE_PAYMENT_FAILED` | No | MailerSend Template ID |
| `MAILERSEND_TEMPLATE_GRACE_PERIOD` | No | MailerSend Template ID |
| `MAILERSEND_TEMPLATE_SUSPENSION` | No | MailerSend Template ID |
| `MAILERSEND_TEMPLATE_CREDIT_CONFIRMATION` | No | MailerSend Template ID |
| `SMTP_HOST` | No | SMTP fallback host |
| `SMTP_PORT` | No | SMTP fallback port |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |

### Payments (Yoco — South African gateway, ZAR primary)

| Variable | Mode | Purpose |
|---|---|---|
| `YOCO_TEST_SECRET_KEY` | dev/staging | `sk_test_...` |
| `YOCO_TEST_PUBLIC_KEY` | dev/staging | `pk_test_...` |
| `YOCO_LIVE_SECRET_KEY` | production | `sk_live_...` |
| `YOCO_LIVE_PUBLIC_KEY` | production | `pk_live_...` |
| `YOCO_WEBHOOK_SECRET` | both | HMAC-SHA256 webhook verification key |

### Licensing

| Variable | Purpose |
|---|---|
| `CLOUD_LICENSE_PRIVATE_KEY` | ECDSA PEM private key — cloud server uses this to sign license files issued to on-prem customers |

### Feature Flags (optional — all have safe defaults)

| Variable | Default | Purpose |
|---|---|---|
| `SESSION_AUTH_ENABLED` | `true` | Session-based auth (faster than per-request DB lookup) |
| `ENABLE_MULTI_ORG_SWITCHING` | — | Allow users in multiple orgs to switch active context |
| `ENABLE_QUIZ_CREDIT_CHARGING` | — | Gate quiz AI generation behind LP credits |
| `ENABLE_AI_THUMBNAILS` | — | AI-generated course thumbnails |
| `COURSE_VISIBILITY_ENABLED` | — | Enforce public vs org-only course access |
| `PAYMENT_GATEWAY_ENABLED` | — | Enable/disable Yoco checkout system |
| `ENABLE_LICENSE_SYSTEM` | `false` | On-prem license enforcement |
| `ASYNC_RECEIPT_EMAIL` | — | Process receipt emails asynchronously |

---

## 6. Database Schema — Every Table

**ORM:** Drizzle ORM  
**Schema file:** `shared/schema.ts` — the single source of truth for all types  
**Pattern:** Every table exports: Drizzle table object + `createInsertSchema` (drizzle-zod) + insert type + select type

### A. Sessions and Users

**`sessions`** — PostgreSQL session store (managed by connect-pg-simple)
- `sid` varchar — PRIMARY KEY
- `sess` jsonb — full session data object
- `expire` timestamp — session expiry

**`users`** — all platform accounts
- `id` varchar — PRIMARY KEY (UUID)
- `email` varchar — UNIQUE
- `gamerName` varchar — UNIQUE (display name in game and quiz contexts)
- `password` varchar — scrypt hash (not bcrypt — uses Node crypto.scrypt)
- `isAdmin` boolean — platform content/support admin
- `isSuperAdmin` boolean — global platform admin; can impersonate any org
- `isCustSuper` boolean — on-prem customer super admin role
- `firstName`, `lastName` varchar
- `lpCreditBalance` integer — personal LP Credit balance
- `preferredCurrency` enum — `ZAR` | `USD` | `EUR`
- `lastActiveAt` timestamp
- `sessionVersion` integer — increment = all existing sessions for this user are invalidated
- `emailVerified` boolean
- `avatarUrl` varchar — storage key for avatar image

**`guestSessions`** — anonymous sessions for public quiz participation
- `id` — PRIMARY KEY
- `sessionId` varchar — UNIQUE
- `guestName` varchar

### B. Organizations (Multi-Tenancy)

**`organizations`** — tenant roots
- `id` varchar — PRIMARY KEY (UUID)
- `name` varchar
- `type` enum — `education` | `business` | `elearning`
- `inviteCode` varchar — UNIQUE; org-level join code
- `subscriptionStatus` varchar — `active` | `past_due` | `cancelled` | `trial`
- `pricingTier` varchar
- `timezone` varchar
- `currency` varchar — org default currency
- `useOrgCreditWallet` boolean — if true, AI credit charges go to org wallet, not personal balance
- `licenseEnabled` boolean — on-prem license enforcement flag

**`organizationUnits`** — Level 1: Departments / Grades
- `id` — PRIMARY KEY
- `organizationId` FK → organizations
- `name` varchar
- `joinCode` varchar — unit-specific join code

**`organizationSubUnits`** — Level 2: Units / Classes
- `id` — PRIMARY KEY
- `unitId` FK → organizationUnits
- `name` varchar

**`organizationTeams`** — Level 3: Teams / Sections
- `id` — PRIMARY KEY
- `subUnitId` FK → organizationSubUnits
- `name` varchar

**`userOrganizationRoles`** — user roles per org (a user can have different roles in different orgs)
- `userId` FK → users
- `organizationId` FK → organizations
- `role` varchar — `org_admin` | `teacher` | `team_lead` | `student` | `learner` | `employee`

**`userOrganizationAssignments`** — user placement in the hierarchy
- `userId`, `organizationId`, `unitId`, `subUnitId`, `teamId`

**`organizationCreditWallets`** — shared LP Credit pool for org members
- `id` — PRIMARY KEY
- `organizationId` FK → organizations — UNIQUE
- `balance` integer

### C. Gamification — Trading Cards and Game Rooms

**`cardCollections`** — themed card sets (e.g., "African Dinosaurs", "World Capitals")
- `id` — PRIMARY KEY
- `name` varchar
- `totalCards` integer
- `isActive` boolean

**`cards`** — individual cards within a collection
- `id` — PRIMARY KEY
- `collectionId` FK → cardCollections
- `name` varchar
- `imageKey` varchar — storage key for card art

**`universalStatUnits`** — units of measure for card stats
- `id` — PRIMARY KEY
- `unitName` varchar (e.g., "kilograms")
- `abbreviation` varchar (e.g., "kg")

**`collectionStatTypes`** — stats applicable to a collection (e.g., "Speed", "Strength")
- `id` — PRIMARY KEY
- `collectionId` FK → cardCollections
- `statName` varchar
- `statUnit` varchar
- `universalUnitId` FK → universalStatUnits

**`cardStats`** — numeric stat values per card
- `id` — PRIMARY KEY
- `cardId` FK → cards
- `statTypeId` FK → collectionStatTypes
- `value` decimal

**`playerStats`** — XP, level, win/loss tracking per user
- `playerId` FK → users — UNIQUE
- `currentXP` integer
- `currentLevel` integer
- `totalWins` integer
- `totalLosses` integer
- `bestStreak` integer

**`dailyStreaks`** — learning streak tracking
- `userId` FK → users — UNIQUE
- `currentStreak` integer
- `bestStreak` integer
- `lastStreakDate` date

**`gameRooms`** — multiplayer card game lobbies
- `id` — PRIMARY KEY
- `hostPlayerId` FK → users
- `collectionId` FK → cardCollections
- `gameState` jsonb — full live game state
- `joinCode` varchar — 4-digit room code

**`activeOneVOneGames`** — real-time 1v1 card battle state
- Stores live game state for two players; updated via Socket.io events

**`activeQuizGames`** — real-time competitive quiz battle state
- Stores live quiz match state; updated via Socket.io events

### D. Quizzes and Subjects

**`quizCollections`** — quiz sets, each belonging to a subject
- `id` — PRIMARY KEY
- `organizationId` FK → organizations
- `subjectId` FK → subjects
- `name` varchar
- `difficulty` varchar — `easy` | `medium` | `hard`
- `passPercentage` integer — minimum % to pass (e.g., 70)

**`quizCards`** — individual quiz questions
- `id` — PRIMARY KEY
- `collectionId` FK → quizCollections
- `questionType` enum — `multiple_choice` | `true_false` | `match` | `fill_blank`
- `question` text
- `answer1` through `answer6` varchar — answer options
- `correctAnswerIndex` integer
- `imageKey` varchar — optional question image

**`quizCardExplanations`** — AI-generated explanations per question
- `cardId` FK → quizCards — UNIQUE
- `explanation` text

**`subjects`** — subject categories per org
- `id` — PRIMARY KEY
- `organizationId` FK → organizations
- `name` varchar (e.g., "Mathematics", "Life Sciences")

**`termDefinitions`** — global glossary, referenced in AI explanations
- `id` — PRIMARY KEY
- `term` varchar
- `definition` text

### E. Courses and Lessons

**`courses`** — learning modules (marketable or org-internal)
- `id` varchar — PRIMARY KEY (UUID)
- `organizationId` FK → organizations
- `title` varchar
- `price` decimal — list price
- `currency` enum — `ZAR` | `USD` | `EUR`
- `status` enum — `draft` | `published` | `archived`
- `visibility` enum — `public` (marketplace) | `org_only` (internal)
- `createdBy` FK → users

**`lessons`** — individual content units (slides, video, document)
- `id` varchar — PRIMARY KEY (UUID)
- `organizationId` FK → organizations
- `title` varchar
- `presentationUrl` varchar — URL to the hosted PPTX or slide HTML
- `learningAssetContract` jsonb — unified slide/topic structure consumed by the lesson player
- `storageKey` varchar — object storage key for the raw file
- `isPublished` boolean
- `sourceLessonId` FK → lessons — self-reference for translated lesson variants

**`courseLessons`** — junction: ordered lessons within a course
- `courseId` FK → courses
- `lessonId` FK → lessons
- `topicOrder` integer — display order
- `primaryQuizId` FK → quizCollections — quiz that gates lesson completion

**`courseVersions`** — immutable published snapshots of a course
- `id` — PRIMARY KEY
- `courseId` FK → courses
- `versionNumber` integer
- `isPublished` boolean
- `previousVersionId` FK → courseVersions — version chain

**`courseDrafts`** — full-clone draft for editing without disrupting live learners
- `id` — PRIMARY KEY
- `courseId` FK → courses
- `draftData` jsonb — complete course snapshot

**`courseAssignments`** — assign a course to users, units, or org-wide
- `courseId` FK → courses
- `userId` FK → users (nullable — null = unit/org-wide)
- `unitId` FK → organizationUnits (nullable)
- `assignmentScope` enum — `user` | `unit` | `sub_unit` | `team` | `organization`
- `mandatory` boolean
- `dueDate` timestamp

**`lessonAssignments`** — lesson-level assignments (same scope system)
- `lessonId` FK → lessons
- `userId`, `unitId` (nullable)
- `mandatory` boolean
- `dueDate` timestamp

**`userCourseEnrollments`** — tracks which version a learner is enrolled in
- `userId` FK → users
- `courseId` FK → courses
- `versionId` FK → courseVersions
- `enrolledAt` timestamp

**`lessonProgress`** — granular per-slide progress
- `userId` FK → users
- `lessonId` FK → lessons
- `percentComplete` integer
- `slidesViewedCount` integer
- `secondsSpent` integer
- `lastCheckpoint` varchar — last slide ID viewed

**`courseProgress`** — course-level completion rollup
- `userId` FK → users
- `courseId` FK → courses
- `completedLessons` integer
- `totalLessons` integer
- `status` enum — `not_started` | `in_progress` | `completed`

**`certificates`** — course completion certificates
- `id` — PRIMARY KEY
- `userId` FK → users
- `courseId` FK → courses (required)
- `certificateId` varchar — UNIQUE; public verification ID
- `shareToken` varchar — token for social sharing URL
- `pdfStorageKey` varchar — object storage key for the PDF
- `issuedAt` timestamp

**`courseFrameworks`** — AI-generated course structures from uploaded documents
- `id` — PRIMARY KEY
- `organizationId` FK → organizations
- `title` varchar
- `sourceMap` jsonb — zero-hallucination provenance: every claim mapped to source text spans
- `topics` jsonb — generated lesson topics and content scaffold

### F. Financial — Transactions, Credits, Payments

**`coursePurchases`** — records of course sales
- `id` — PRIMARY KEY
- `courseId` FK → courses
- `userId` FK → users
- `purchasePrice` decimal
- `exchangeRateUsed` decimal — ZAR rate at time of purchase
- `commissionAmount` decimal — 5% platform fee

**`creditOrders`** — LP Credit package purchases
- `id` — PRIMARY KEY
- `purchaserId` FK → users
- `organizationId` FK → organizations
- `amount` integer — credits to add
- `status` varchar — `pending` | `fulfilled` | `failed`

**`userCreditAllocations`** — personal credit balance per org context
- `userId` FK → users
- `organizationId` FK → organizations
- `balance` integer

**`creditTransactions`** — complete audit log of all credit movements
- `id` — PRIMARY KEY
- `userId` varchar
- `amount` integer (positive = credit, negative = debit)
- `transactionType` varchar
- `correlationId` varchar — links to source order/job

**`paymentIntents`** — Yoco checkout sessions
- `id` — PRIMARY KEY
- `userId` FK → users
- `type` varchar — `course` | `credits` | `subscription`
- `status` varchar — `pending` | `succeeded` | `failed` | `cancelled`
- `checkoutId` varchar — Yoco checkout ID
- `yocoCheckoutUrl` varchar — redirect URL for payment page
- `metadata` jsonb — context (courseId, packageId, etc.)

**`paymentFulfillments`** — idempotency guard (one row per fulfilled intent)
- `id` — PRIMARY KEY
- `paymentIntentId` FK → paymentIntents — UNIQUE
- `fulfilledAt` timestamp

**`webhookEvents`** — Yoco webhook deduplication store
- `id` — PRIMARY KEY
- `eventId` varchar — UNIQUE; Yoco event ID
- `processedAt` timestamp

### G. Subscriptions and Billing

**`subscriptionPlans`** — tiered plans for education/business orgs
- `id` — PRIMARY KEY
- `name` varchar
- `monthlyCredits` integer — LP Credits included per month
- `seatLimit` integer — max concurrent users
- `price` decimal, `currency` varchar

**`elearningSubscriptionPlans`** — plans for e-learning organizations
- `id` — PRIMARY KEY
- `name` varchar
- `learnerLimit` integer — max enrolled learners
- `price` decimal, `currency` varchar

**`organizationSubscriptions`** — active subscription per org
- `id` — PRIMARY KEY
- `organizationId` FK → organizations
- `planId` FK → subscriptionPlans
- `status` varchar — `active` | `past_due` | `grace_period` | `suspended` | `cancelled`
- `graceUntil` timestamp — deadline before suspension
- `autoRenew` boolean
- `currentPeriodEnd` timestamp

**`emailLogs`** — audit trail for all outgoing emails
- `id` — PRIMARY KEY
- `recipient` varchar — masked PII (e.g., `j***@example.com`)
- `subject` varchar
- `templateType` varchar
- `status` varchar — `queued` | `sent` | `failed`
- `mailerSendMessageId` varchar
- `sentAt` timestamp

### H. Branding, Themes, and System Configuration

**`brandingThemes`** — per-org white-label branding configuration
- `id` — PRIMARY KEY
- `organizationId` FK → organizations — UNIQUE
- `logoUrl` varchar — storage key for org logo
- `faviconUrl` varchar — storage key for favicon
- `tokens` jsonb — CSS design tokens: `{ primary, secondary, accent, background, foreground, ... }`
- `fontHeading` varchar, `fontBody` varchar
- `supportEmail` varchar, `supportUrl` varchar
- `allowEmailBranding` boolean — use org branding in transactional emails
- `customCopy` jsonb — override UI text (login page, dashboard header, etc.)

**`organizationDomains`** — custom domain mapping
- `id` — PRIMARY KEY
- `organizationId` FK → organizations
- `domain` varchar
- `verified` boolean

**`systemSettings`** — global key-value platform configuration
- `key` varchar — PRIMARY KEY
- `value` text
- `description` text
- Used for: `gamma_api_key`, platform-wide feature settings, seed configuration

### I. AI and Content Generation

**`gammaThemes`** — presentation themes synced from Gamma API (24h cycle)
- `id` varchar — PRIMARY KEY (Gamma API theme ID)
- `name` varchar, `description` text
- `thumbnailUrl` varchar — manually uploaded by SuperAdmin (Gamma does not provide)
- `categories` jsonb — auto-mapped array: `["Dark"]` | `["Light"]` | `["Professional"]` | `["Colorful"]`
- `isActive` boolean — false if deprecated by Gamma
- `lastSyncedAt` timestamp

**`gammaImageStyles`** — AI image generation styles for lesson slides
- `id` — PRIMARY KEY
- `styleKey` varchar (e.g., `photorealistic`, `illustrated`)
- `displayName` varchar
- `description` text
- `thumbnailUrl` varchar

**`contentTranslationJobs`** — async translation tracking
- `id` — PRIMARY KEY
- `status` varchar — `pending` | `processing` | `completed` | `failed`
- `sourceLanguage` varchar, `targetLanguage` varchar
- `sourceId` varchar, `sourceType` varchar — what is being translated
- `createdAt` timestamp

### J. Licensing

**`onpremLicenses`** — licenses issued to on-prem (Linux-On-Cloud) customer installations
- `id` — PRIMARY KEY
- `organizationId` FK → organizations
- `licenseKey` varchar — ECDSA-signed JWT or similar
- `issuedAt` timestamp, `expiresAt` timestamp
- `seats` integer — max concurrent users
- `features` jsonb — feature flags included in license

**`enterpriseSystems`** — registered Linux-On-Prem installations
- `id` — PRIMARY KEY
- `name` varchar
- `type` varchar
- `licenseId` FK → onpremLicenses

---

## 7. Authentication and User Roles

### Role Hierarchy

**Platform-level roles** (boolean flags on `users`):

| Flag | Role | Can do |
|---|---|---|
| `isSuperAdmin` | SuperAdmin | Everything — manage all orgs, impersonate any org admin, global analytics |
| `isCustSuper` | Customer SuperAdmin | High-level access within one on-prem instance |
| `isAdmin` | Platform Admin | Content moderation, support tasks |

**Organization-level roles** (in `userOrganizationRoles`, scoped per org):

| Role | Can do |
|---|---|
| `org_admin` | Full control of one org — users, content, billing, branding, units |
| `teacher` | Create courses/quizzes, manage units and class performance |
| `team_lead` | Unit-level management |
| `student` / `learner` / `employee` | End-user — learn, play, take quizzes |

Terminology (org type determines label shown in UI):
- Education org: `student`
- Business org: `employee`
- E-learning org: `learner`

**First registration on an empty database automatically assigns SuperAdmin.** Register your first account before anyone else.

### Session Management

- **Storage:** PostgreSQL `sessions` table via `connect-pg-simple`
- **TTL:** 4 hours by default
- **Invalidation:** Incrementing `users.sessionVersion` immediately invalidates ALL active sessions for that user (password change, role update, security reset)
- **Impersonation:** SuperAdmin sets `impersonatedOrganization` in session context → `effectiveRole` becomes `org_admin` for that tenant → all queries scoped to impersonated org
- **Multi-org switching:** `X-Organization-Context` request header lets a user in multiple orgs select which org context to operate in

### Middleware Chain (request lifecycle)

1. **`sessionAuthMiddleware.ts`** — validates session cookie, builds `SessionContext` object containing: `user`, `primaryOrganization`, all orgs, `effectiveRole`, subscription details
2. **`withOrgContext`** — resolves active org (precedence: impersonation > `X-Organization-Context` header > primary org)
3. **`orgIsolationMiddleware.ts`** — blocks any query where `organizationId` does not match the active org context
4. **`tenantMiddleware.ts`** — RBAC checks: `isTeacherOrAdmin`, `isOrgAdminOnly`, etc.
5. **`usageLimitMiddleware.ts`** — rate limits AI endpoints and caps concurrent users per subscription plan
6. **Route handler** — thin controller calling service layer

### Auth Routes (`server/routes/authRoutes.ts`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` | New user registration |
| POST | `/api/auth/login` | Login (email OR gamerName OR full name) |
| POST | `/api/auth/logout` | Clear session |
| GET | `/api/auth/validate-join-code` | Check org/unit/team join code |
| POST | `/api/auth/verify-email` | Process email verification token |
| POST | `/api/auth/forgot-password` | Initiate password reset |
| POST | `/api/auth/reset-password` | Complete password reset with token |

---

## 8. File Storage Architecture

### Mode Detection

`server/objectStorage.ts` reads `process.env.ONPREM_MODE`:
- `=== 'true'` → loads `objectStorage-onprem.ts` (local filesystem)
- anything else → loads `objectStorage-gcs.ts` (Google Cloud Storage)

**Never import GCS or on-prem implementations directly.** Always import from `objectStorage.ts`.

### Cloud Mode — Google Cloud Storage (`objectStorage-gcs.ts`)

Authentication (one of three methods, checked in order):
1. `GOOGLE_SERVICE_ACCOUNT_JSON` — inline JSON string in env var
2. `GOOGLE_APPLICATION_CREDENTIALS` — path to key file on disk
3. Application Default Credentials (ADC) — `gcloud auth application-default login`

Upload flow:
1. Client requests a signed upload URL from the server
2. Server generates a GCS Signed URL (PUT method, time-limited)
3. Client PUTs the file directly to GCS (bypasses Express — efficient for large files)
4. Client notifies server of completed upload with the storage key

Download flow:
1. Server generates a GCS Signed URL (GET method)
2. Client redirects to or fetches directly from signed URL

Buckets:
- `GCS_BUCKET_PUBLIC` — logos, branding assets, Gamma thumbnails, card images
- `GCS_BUCKET_PRIVATE` — lessons, course thumbnails, certificates, PPTX source files

### On-Prem/Dev Mode — Local Filesystem (`objectStorage-onprem.ts`)

Base directory: `process.env.UPLOAD_DIR || './uploads'` (for dev, set `UPLOAD_DIR=./uploads`)

Directory layout:
```
uploads/
  public/    — served at http://localhost:3000/uploads/public/  (static)
  private/   — served at /api/files/{base64path}              (auth-gated)
```

Upload flow:
1. Client requests an upload token from server
2. Server issues a UUID token → stores `{uuid: destinationPath}` in `pendingUploads` map
3. Client POSTs file to `/api/upload/{uuid}`
4. Server writes file to disk at `UPLOAD_DIR/{destinationPath}`

Download flow:
- Private files: client requests `/api/files/{base64encodedRelativePath}` → Express streams from disk
- Public files: served as static assets at `/uploads/public/`

`LocalFile` class mimics the GCS `File` API (`createReadStream`, `getMetadata`, `exists`, `delete`) so all services remain storage-agnostic.

### Storage Path Conventions

| Content type | Path |
|---|---|
| User avatar | `public/avatars/{userId}/{filename}` |
| Org logo | `public/branding/org-{orgId}/logo.{ext}` |
| Org favicon | `public/branding/org-{orgId}/favicon.{ext}` |
| Gamma theme thumbnail | `public/gamma/themes/{themeId}.{ext}` |
| Card image | `public/cards/{collectionId}/{cardId}.{ext}` |
| Lesson PPTX/HTML | `private/lessons/{orgId}/{lessonId}/{lang}/v{version}.{ext}` |
| Course thumbnail | `private/courses/{orgId}/{courseId}/thumbnail.{ext}` |
| Certificate PDF | `private/certificates/{userId}/{certId}.pdf` |
| Course framework docs | `private/frameworks/{orgId}/{frameworkId}/{filename}` |

### File Processing

| File type | Library | Purpose |
|---|---|---|
| `.jpg .jpeg .png .webp .svg` | sharp | Resize + optimize (thumbnails → 1024×576 WebP) |
| `.docx .doc` | mammoth | Extract text for AI processing |
| `.pdf` | pdf-parse | Extract text content |
| `.pptx` | pptx-preview, pptx-in-html-out | Convert to HTML slides |
| `.pptx` | LibreOffice (optional) | High-fidelity PPTX → HTML conversion |
| `.mp4` | stored as-is | Video walkthrough |

---

## 9. Google Gemini AI Integration

**SDK:** `@google/genai`  
**Default model:** `gemini-2.0-flash`  
**Key:** `GEMINI_API_KEY` (get from aistudio.google.com)

### Features

**1. Course Framework Generation**
- Upload .docx or .pptx (up to 20MB; smart chunking for large files)
- AI extracts key topics, suggested lesson titles, and content structure
- Curriculum alignment: CAPS, IEB, or custom standards
- **Zero-Hallucination Policy:** every generated claim MUST be traceable to a specific text span in the source document — this is enforced via prompt engineering with mandatory self-check
- Provenance stored in `courseFrameworks.sourceMap` jsonb

**2. Lesson Content Generation**
- 10-topic structure for any lesson title: `POST /api/ai/generate-lesson-topics`
- Lesson descriptions from course context: `POST /api/ai/generate-lesson-description`
- Full slide content enrichment from uploaded documents
- Image generation using Gemini multimodal or Imagen via Vertex AI

**3. Quiz Generation**
- Question types: Multiple Choice, True/False, Match, Fill-in-the-blank
- Context-aware: generates from lesson transcripts OR specific topics
- `POST /api/ai/generate-quiz` (deducts LP Credits)
- `POST /api/ai/generate-quiz-metadata` (generates quiz name and description)
- Individual question replacement: `POST /api/ai/regenerate-question`

**4. Explanations and Definitions**
- Per-question AI explanation: `POST /api/ai/generate-explanation` → stored in `quizCardExplanations`
- Key term definitions stored in `termDefinitions` table

**5. Content Coaching**
- Analyzes lesson content for educational quality
- Provides structured feedback (`contentCoachService.ts`)

**6. Translation**
- Detects document language automatically
- Translates lesson content and PPTX files
- Tracked asynchronously in `contentTranslationJobs` table

### LP Credit Costs

| Operation | Credits consumed |
|---|---|
| Lesson generation | 50 credits |
| Quiz generation | 15 credits |
| Content translation | 50 credits |

Credit source selected by `HybridCreditService`:
- If org has `useOrgCreditWallet=true` → deducted from `organizationCreditWallets`
- Otherwise → deducted from `users.lpCreditBalance`

### Async Job System

Long-running AI tasks (lesson generation, translation) are offloaded to prevent HTTP timeouts:

1. `jobQueueService.ts` — enqueue task, return job ID to client
2. `jobQueueWorker.ts` — background loop polls queue, executes task, updates status
3. Client polls job status endpoint until complete

### Key Service Files

| File | Purpose |
|---|---|
| `server/ai/aiService.ts` | Primary Gemini abstraction, model management, core prompts |
| `server/services/courseFrameworkAIService.ts` | Course structure from documents + zero-hallucination |
| `server/services/lessonDescriptionAIService.ts` | Lesson metadata generation |
| `server/services/contentCoachService.ts` | Educational quality analysis |
| `server/services/aiTranslationService.ts` | Content translation orchestration |
| `server/services/courseThumbnailAIService.ts` | AI thumbnail generation |
| `server/services/jobQueueService.ts` | Async job queue management |
| `server/workers/jobQueueWorker.ts` | Background AI job processor |

---

## 10. Gamma Presentation Generation

**Provider:** Gamma API v1.0  
**Key:** `GAMMA_API_KEY` — stored in `systemSettings` table as `gamma_api_key` (not just env var)  
**Service:** `server/services/gammaService.ts`

### What it does

Gamma generates professional PPTX presentations from structured text input:
- Always exactly **10 cards (slides)**, **4:3 tall** format
- Image model: `imagen-4-pro` — photorealistic, **no text in images** (prevents AI-generated typos on slides)
- Speaker notes generated alongside each slide (used as video walkthrough scripts)
- Async API: `createPresentation` → poll `pollUntilComplete` → `downloadFile` as PPTX

### Gamma Themes

Users select a theme in the Lesson Wizard. Theme selection controls fonts, colors, and layouts.

Database: `gammaThemes` table
- `id` — Gamma API's theme ID (passed back to API on createPresentation)
- `name`, `description`
- `thumbnailUrl` — **manually uploaded by SuperAdmin** (Gamma API does not provide previews)
- `categories` jsonb — auto-mapped from theme name: Dark / Light / Professional / Colorful
- `isActive` boolean — false if Gamma deprecated the theme
- `lastSyncedAt` timestamp

Sync: `gammaThemeSyncService.ts` runs every 24 hours, updates `gammaThemes` table from Gamma API.

### Gamma Image Styles

Stored in `gammaImageStyles` table. Allows user to pick art style for lesson imagery (photorealistic, illustrated, abstract, etc.).

### Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/gamma/themes` | authenticated | List themes (search + category filter) |
| GET | `/api/gamma/image-styles` | authenticated | List image styles |
| PATCH | `/api/admin/gamma-themes/:id/thumbnail` | SuperAdmin | Upload theme thumbnail |
| DELETE | `/api/admin/gamma-themes/:id/thumbnail` | SuperAdmin | Remove theme thumbnail |

---

## 11. Yoco Payment Integration

**Provider:** Yoco (South African payment gateway)  
**Primary currency:** ZAR  
**Feature flag:** `PAYMENT_GATEWAY_ENABLED`

### Three Payment Flows

**1. Course Purchase**
```
POST /api/courses/:courseId/checkout
  → Creates paymentIntent in DB
  → Calls Yoco API → returns checkout URL
  → Client redirects to Yoco payment page
  → User pays → Yoco fires webhook
  → PaymentRouter.handleCoursePayment()
  → userCourseEnrollments row created
  → Revenue recorded in coursePurchases
```

**2. LP Credit Package Purchase**
```
POST /api/credit-packages/:packageId/purchase
  → Same Yoco checkout flow
  → On webhook: CreditOrderService.fulfillOrder()
  → Credits added to org wallet OR user lpCreditBalance
```

**3. Subscription**
```
POST /api/subscriptions
  → Creates subscription record
  → billingScheduler.ts handles renewals
  → Sends renewal/invoice/grace/suspension emails
```

### Webhook Architecture

```
Yoco sends POST /api/webhooks/yoco
  ↓
yocoWebhookVerifier.ts: HMAC-SHA256(raw body, YOCO_WEBHOOK_SECRET)
  ↓ (signature valid)
webhookReplayProtection.ts: check webhookEvents for duplicate eventId
  ↓ (not duplicate)
PaymentRouter.handleWebhook() dispatches by event type:
  payment.succeeded → handleCoursePayment | fulfillOrder | renewSubscription
  payment.failed    → update paymentIntent status
  payment.cancelled → update paymentIntent status
  refund.succeeded  → reverse fulfillment
  ↓
paymentFulfillments.insert() — idempotency guard (UNIQUE constraint on intentId)
```

### Payment Routes

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/webhooks/yoco` | Primary webhook endpoint |
| POST | `/api/payments/webhook` | Legacy webhook path |
| POST | `/api/courses/:courseId/checkout` | Initiate course purchase |
| POST | `/api/credit-packages/:packageId/purchase` | Initiate credit purchase |
| GET | `/api/payments/status` | Payment gateway config status |
| GET | `/api/payments/yoco-mode` | Returns `test` or `live` |
| GET | `/api/currency/rates` | Public FX rates (ZAR/USD/EUR) |
| GET | `/api/purchases/:checkoutId/confirmation` | Poll for purchase completion after redirect |

### Key Files

| File | Purpose |
|---|---|
| `server/routes/paymentsRoutes.ts` | Route definitions and top-level webhook dispatch |
| `server/services/paymentRouter.ts` | Central webhook dispatcher |
| `server/services/paymentOrchestratorService.ts` | Checkout session creation |
| `server/services/yocoWebhookVerifier.ts` | HMAC signature verification |
| `server/services/webhookReplayProtection.ts` | Webhook deduplication |
| `server/services/creditOrderService.ts` | Credit package fulfillment |
| `server/services/subscriptionService.ts` | Subscription lifecycle |

---

## 12. MailerSend Email Integration

**Primary transport:** MailerSend API (`mailersend` npm package)  
**Fallback transport:** SMTP (nodemailer) — activated if `MAILERSEND_API_KEY` is absent  
**Audit log:** `emailLogs` table (all sent emails, PII masked)

### Emails and Triggers

| Email | Trigger |
|---|---|
| Email verification | Registration or manual resend |
| Password reset | `POST /api/auth/forgot-password` |
| Reset confirmation | Successful password change |
| Join request (admin notification) | User uses org/unit/team join code |
| Payment success | `payment.succeeded` Yoco webhook |
| Invoice / renewal reminder | `billingScheduler.ts` — 3 days before renewal |
| Payment reminder | `billingScheduler.ts` — 1 day after overdue |
| Grace period notice | `billingScheduler.ts` — 3 days after overdue |
| Suspension notice | `billingScheduler.ts` — 7 days after overdue |
| Credit purchase confirmation | Credit order fulfillment |
| Sales / support inquiry | User submits help form |
| Refund request | User requests course refund |
| Refund decision | Admin approves or declines refund |
| Subscription cancel / reactivation | User changes subscription |

### Template System

Two layers — both always available:

**Layer 1 — MailerSend Dynamic Templates** (configured via env vars):  
`MAILERSEND_TEMPLATE_*` vars map event types to MailerSend Template IDs. If set, Mailer Send renders from its template.

**Layer 2 — Programmatic HTML Fallback** (`mailerSendService.generateFallbackEmailHtml`):  
Used when no template ID is configured. Generates fully branded HTML using org's `brandingThemes` data:
- `generateBrandedHeader(org)` — logo + gradient background
- `generateBrandedFooter(org)` — support links
- `generateBrandedButton(text, url, org)` — branded CTA button

### Key Files

| File | Purpose |
|---|---|
| `server/services/mailerSendService.ts` | Business logic, branding, template generation |
| `server/services/emailTransport.ts` | Low-level transport (MailerSend API vs SMTP) |
| `server/services/emailVerificationService.ts` | Email verification tokens |
| `server/services/passwordResetService.ts` | Password reset tokens (rate-limited) |
| `server/services/billingScheduler.ts` | Scheduled billing emails |
| `server/services/emailTemplates.ts` | HTML template components |

---

## 13. Multi-Tenancy Architecture

### Organization Types and Terminology

| Org type | Level 1 label | Level 2 label | Level 3 label | End-user label |
|---|---|---|---|---|
| `education` | Grade / Year | Class | Group | Student |
| `business` | Department | Unit | Team | Employee |
| `elearning` | Category | Sub-category | Group | Learner |

The `OrganizationContext` React context exposes a `terminology` map — every component reads labels from this map. Never hardcode "Student" or "Department" — always use the terminology map.

### Isolation Strategy

Shared Database, Logical Separation:
- Every entity (courses, lessons, quizzes, users, files) has an `organizationId` column
- `enforceOrgIsolation` middleware is applied to all tenant-scoped routes; it rejects any request where the queried `organizationId` does not match the user's active org context
- Storage paths are org-scoped: `branding/org-{orgId}/`, `lessons/{orgId}/`
- File metadata validated: `validateThumbnailOrgAccess` etc. prevent cross-org file reads

### Branding

`brandingThemes` per org → `BrandingContext` React context:
1. On page load, `BrandingContext` fetches org branding via `/api/org/branding`
2. Applies CSS custom properties to `document.documentElement`:
   - `--primary`, `--secondary`, `--accent`, `--background`, `--foreground`, font variables
3. All Tailwind utility classes map to these CSS variables — entire UI reflects org theme without reload

`customCopy` jsonb: override specific UI strings (login page heading, dashboard welcome, etc.) without a code change.

### Join and Approval Flow

1. User provides an invite/join code (org-level `inviteCode` or unit-level `joinCode`)
2. System validates code → creates `pending` join request
3. OrgAdmin approves via:
   - Email token (link in join request notification email)
   - Dashboard (approve/deny via `PATCH /api/org/join-requests/:id`)
4. `joinRequestApprovalService.ts` processes approval → assigns role → sends notification

### Credit System

- **LP Credits** — internal virtual currency for AI operations
- Sources: subscription plan monthly allotment, manual purchase (Yoco), admin grant
- `HybridCreditService` selects charge source:
  - Org wallet (`organizationCreditWallets`) if `useOrgCreditWallet=true`
  - Personal balance (`users.lpCreditBalance`) otherwise
- `creditTransactions` table is the complete audit log

---

## 14. Gamification System

### XP and Levels

- `playerStats` table: `currentXP`, `currentLevel`, `totalWins`, `totalLosses`
- XP awarded by `xpService.ts` for: slide views, quiz passes, certificate earning
- Level thresholds defined in `gamificationService.ts`
- Level titles: Rookie → Apprentice → Adventurer → Scholar → Champion → Legend

### Daily Streaks

- `dailyStreaks` table: `currentStreak`, `bestStreak`, `lastStreakDate`
- `challengeScheduler.ts` resets daily challenge state at midnight

### Trading Card Game (1v1 competitive)

Game flow via Socket.io:
1. Host creates `gameRoom` → receives `joinCode`
2. Opponent joins with code → room status = `active`
3. Both players receive their hand (subset of cards from collection)
4. Rounds: each player picks a stat to compare → higher value wins round
5. State persisted in `activeOneVOneGames.gameState` jsonb between events
6. Game result: `playerStats` updated for both players (wins, losses, XP)

### Competitive Quiz (1v1 real-time)

Flow via Socket.io:
1. Challenge created → opponent notified
2. Both connected → questions broadcast simultaneously
3. First correct answer scores the point
4. State in `activeQuizGames`
5. Final score → XP awarded → leaderboard updated

### Season Pass

- `seasonPassDefinitions.ts` — tier rewards and XP thresholds
- `seasonPassScheduler.ts` — progression evaluation
- `ensureSeasonPass.ts` — initialization on startup

---

## 15. LMS — Courses, Lessons, Quizzes, Certificates

### Course Lifecycle

```
Draft created
  → Lessons added and ordered (courseLessons)
  → Quizzes linked to lessons (primaryQuizId)
  → Published → courseVersions snapshot created
  → Learners enrolled in specific version (userCourseEnrollments)
  → Future edits use courseDrafts (full clone) → new version on re-publish
```

Course types:
- **Marketplace** (`visibility=public`): priced, purchasable by any platform user → Yoco checkout → enrollment
- **Org-internal** (`visibility=org_only`): free, assigned by org admin → courseAssignments

### Lesson Content Types

| Type | How created | Storage |
|---|---|---|
| AI slides (Gamma) | Lesson Wizard → Gamma API → PPTX → HTML | `private/lessons/{orgId}/{lessonId}/` |
| Manual slides | Teacher types content directly | Saved in `learningAssetContract` jsonb |
| Uploaded PPTX | Teacher uploads → converted to HTML | Same path as above |
| Uploaded PDF | Teacher uploads | `private/lessons/{orgId}/{lessonId}/` |
| Video walkthrough | Teacher uploads MP4 | Same path |

`learningAssetContract` jsonb is the unified slide/topic structure consumed by the lesson player frontend regardless of content type.

### Zero-Hallucination Framework

When AI generates course content from a source document:
1. AI response includes mandatory `sourceRef` citations for each claim
2. `courseFrameworkAIService.ts` validates that every citation exists in the source text
3. Failed citations → AI is re-prompted until validation passes
4. Final `sourceMap` jsonb in `courseFrameworks` stores text span coordinates for auditability

### Progress Tracking

```
User opens lesson → lessonProgress row created/updated
  → percentComplete updated on each slide advance
  → slidesViewedCount incremented
  → secondsSpent accumulated
  → lastCheckpoint = last slide ID seen

On lesson/quiz completion:
  → courseProgress.completedLessons incremented
  → If all lessons done: courseProgress.status = 'completed'
  → XP awarded via xpService.ts
  → Certificate generated (if passing score)
```

### Completion Gate

`courseCompletionService.ts` enforces:
- Course = complete ONLY when all quizzes linked via `courseLessons.primaryQuizId` are passed
- Pass threshold: `quizCollections.passPercentage` (e.g., 70%)
- Overview and key-takeaway lessons excluded from quiz requirement
- Re-take supported: improved score triggers certificate re-issue

### Certificates

| Type | Issued when |
|---|---|
| Course certificate | All course quizzes passed |

Generation:
1. `certificateService.ts` generates branded PDF via `pdfkit`
2. Org logo + CSS color tokens applied from `brandingThemes`
3. PDF stored in object storage at `private/certificates/{userId}/{certId}.pdf`
4. Email sent to learner (via MailerSend) with PDF attached or download link

Verification:
- Public URL: `/verify/{shareToken}` — no auth required
- Displays certificate details, issued date, org branding
- Social sharing: LinkedIn + Twitter pre-filled share URLs

### PPTX Conversion Pipeline

```
Teacher uploads .pptx file
  → multer saves to temp location
  → pptxHtmlConverterService.ts attempts conversion:
      → First: pptx-in-html-out library (always available)
      → If LibreOffice installed: high-fidelity conversion
  → HTML output stored at UPLOAD_DIR/private/lessons/{orgId}/{lessonId}/
  → storageKey saved to lessons table
  → lessonProgress initialized
```

---

## 16. Real-Time Features (Socket.io)

Socket.io server is attached to the same Express HTTP server. No separate WebSocket port.

**Events — Card Game:**

| Event | Direction | Payload |
|---|---|---|
| `joinRoom` | client → server | `{ joinCode }` |
| `roomJoined` | server → client | `{ gameState }` |
| `playCard` | client → server | `{ cardId, statTypeId }` |
| `roundResult` | server → both clients | `{ winner, scores }` |
| `gameOver` | server → both clients | `{ finalScores }` |

**Events — Quiz Battle:**

| Event | Direction | Payload |
|---|---|---|
| `joinQuiz` | client → server | `{ quizId }` |
| `questionBroadcast` | server → both | `{ question, timeLimit }` |
| `submitAnswer` | client → server | `{ answerIndex }` |
| `answerResult` | server → both | `{ correct, scores }` |
| `quizOver` | server → both | `{ finalScores }` |

State persistence: game state is written to `activeOneVOneGames.gameState` or `activeQuizGames.gameState` after every event, enabling reconnect recovery.

---

## 17. Background Jobs and Schedulers

All schedulers are started in `server/index.ts` on application boot. `schedulerRunGuard.ts` prevents duplicate runs in multi-process environments.

| Component | File | Schedule | Purpose |
|---|---|---|---|
| AI Job Worker | `workers/jobQueueWorker.ts` | Continuous poll | Process async AI generation tasks |
| Billing Scheduler | `schedulers/billingScheduler.ts` | Daily | Renewal reminders, invoices, grace, suspension |
| Challenge Scheduler | `schedulers/challengeScheduler.ts` | Daily midnight | Reset daily challenge state |
| Season Pass Scheduler | `schedulers/seasonPassScheduler.ts` | Periodic | Season pass progression |
| Enrollment Email Scheduler | `services/enrollmentEmailScheduler.ts` | Periodic | Enrollment status digests |
| Gamma Sync | `services/gammaThemeSyncService.ts` | Every 24h | Sync themes from Gamma API |

---

## 18. Route File Reference

All route files are in `server/routes/` and registered in `server/routes.ts`.

| File | Covers |
|---|---|
| `authRoutes.ts` | Register, login, logout, email verify, password reset, join codes |
| `courseRoutes.ts` | Courses, lessons, enrollments, assignments, progress, certificates, PPTX conversion |
| `quizRoutes.ts` | Quiz CRUD, AI question generation, explanations, multiplayer quiz |
| `gameRoutes.ts` | Trading card game rooms, matchmaking, game state |
| `gamificationRoutes.ts` | XP, levels, streaks, card game leaderboards |
| `aiRoutes.ts` | AI configuration, quiz/lesson generation, explanations |
| `courseFrameworkRoutes.ts` | AI course framework from documents |
| `adminRoutes.ts` | Org admin — members, branding, units, credits, billing |
| `superAdminRoutes.ts` | Platform admin — orgs, impersonation, global stats |
| `enterpriseSuperAdminRoutes.ts` | Enterprise org creation and management |
| `enterpriseAuthRoutes.ts` | Enterprise-specific authentication |
| `enterprisePortalRoutes.ts` | Enterprise customer portal (reports, usage) |
| `enterpriseRevenueRoutes.ts` | Enterprise revenue reporting |
| `orgRoutes.ts` | Org hierarchy management, join requests, branding API |
| `orgSalesRoutes.ts` | Org-level sales and inquiry forms |
| `onpremLicenseRoutes.ts` | On-prem license issuance and validation |
| `paymentsRoutes.ts` | Checkout, webhooks, Yoco, FX rates, credit packages |
| `platformRevenue.ts` | Platform-level revenue tracking and snapshots |
| `languageRoutes.ts` | Supported languages, translation job management |
| `reportRoutes.ts` | Analytics exports, content health reports |
| `miscRoutes.ts` | Gamma themes, image styles, system settings |
| `public.ts` | Public endpoints (no auth required) |
| `shared.ts` | Session config and shared route utilities |
| `sharedResources.ts` | Shared resource endpoints |

---

## 19. Frontend Architecture

### Routing

`client/src/App.tsx` defines all routes using wouter's `<Switch>` and `<Route>`.

`<ProtectedRoute>` wraps authenticated routes:
```tsx
<ProtectedRoute role="superadmin">   // isSuperAdmin required
<ProtectedRoute role="orgadmin">     // org_admin role required
<ProtectedRoute role="teacher">      // teacher or above required
<ProtectedRoute role="authenticated"> // any logged-in user
```

Redirect: unauthenticated users → `/auth`

Key page routes:
- `/auth` — login / register
- `/dashboard` — learner home
- `/lesson/:lessonId` — lesson player
- `/quiz/:quizId` — quiz play
- `/game/:roomId` — card game
- `/verify/:token` — certificate verification (public)
- `/admin/*` — org admin panel
- `/super-admin/*` — platform admin
- `/teacher/*` — course and quiz creation
- `/enterprise/*` — enterprise customer portal

### Server State (TanStack Query v5)

All data fetching and mutation uses TanStack Query. Object syntax only (v5 requirement):
```typescript
// CORRECT
useQuery({ queryKey: ['/api/courses', courseId], ... })
// WRONG
useQuery(['/api/courses', courseId], ...)
```

Hierarchical query keys for cache invalidation:
```typescript
// CORRECT — allows invalidating all /api/courses queries at once
queryKey: ['/api/courses', courseId]
// WRONG — can only invalidate exact match
queryKey: [`/api/courses/${courseId}`]
```

Cache invalidation helpers (call these after mutations):
```typescript
import { invalidateWalletCaches } from '@lib/queryClient';
invalidateWalletCaches();       // after credit changes
invalidateOrgContextCaches();   // after org/role changes
invalidateCourseScopeCaches();  // after course/enrollment changes
```

### API Requests

```typescript
import { apiRequest } from '@lib/queryClient';

// Mutation
const mutation = useMutation({
  mutationFn: (data) => apiRequest('POST', '/api/courses', data),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/courses'] }),
});
```

### Global Contexts

**`BrandingContext`:**
- Fetches org branding on mount via `/api/org/branding`
- Applies CSS custom properties to `document.documentElement`
- Variables: `--primary`, `--secondary`, `--accent`, `--background`, `--foreground`, `--font-heading`, `--font-body`
- All Tailwind classes use these variables — org theme applied automatically

**`OrganizationContext`:**
- Provides `terminology` map: `{ student: 'Student'|'Employee'|'Learner', ... }`
- Read org labels from this map; never hardcode "Student"

### Forms

Standard pattern (always use controlled forms with defaultValues):
```typescript
const form = useForm<InsertCourse>({
  resolver: zodResolver(insertCourseSchema.extend({
    title: z.string().min(3, 'Title too short'),
  })),
  defaultValues: {
    title: '',
    price: 0,
    currency: 'ZAR',
  },
});
```

### File Upload

Use `ObjectUploader` component — it handles both GCS and on-prem modes transparently:
```tsx
<ObjectUploader
  accept=".pptx,.pdf"
  onUploadComplete={(storageKey) => setValue('storageKey', storageKey)}
  orgId={orgId}
/>
```

---

## 20. NPM Scripts

| Script | Command | Purpose |
|---|---|---|
| `npm run dev` | tsx watch (server) + Vite HMR (client) | Development server — use this daily |
| `npm run build` | esbuild (server) + vite build (client) | Compile for production → `dist/` |
| `npm start` | node `dist/index.js` | Run production build |
| `npm run db:push` | drizzle-kit push | Apply `shared/schema.ts` changes to database |
| `npm run db:studio` | drizzle-kit studio | Visual database browser (Drizzle Studio) |
| `npm run check` | tsc --noEmit | TypeScript type checking |

### Build and Distribution Scripts

| Script | Purpose |
|---|---|
| `bash build-cloud-linux.sh` | Full production build → `dist-cloud/` directory |
| `bash cloud/export-all.sh` | Export database tables + object store files from Replit |
| `bash cloud/export-all.sh --include-private` | Include private user-uploaded files in export |
| `bash cloud/import-platform-data.sh /path/to/data` | Import 35 platform config tables into local DB |
| `bash cloud/package-source.sh` | Bundle source + data for distribution (generates SETUP.md) |

---

## 21. First-Time Setup on Ubuntu 24.04

```bash
# 1. System dependencies (once per machine)
sudo apt update
sudo apt install -y build-essential python3 python3-dev curl git unzip postgresql-client

# 2. Node.js 20 via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20 && nvm use 20 && nvm alias default 20

# 3. Enter project directory
cd /antigravity/learnplay/cloud-on-prem

# 4. Configure environment
cp .env.example .env
nano .env
# Set these values:
#   NODE_ENV=development
#   PORT=3000
#   BASE_URL=http://localhost:3000
#   FRONTEND_URL=http://localhost:3000
#   VITE_DOMAIN=http://localhost:3000
#   DATABASE_URL=postgresql://user:pass@host:5432/dbname
#   SESSION_SECRET=$(openssl rand -hex 32)   ← run this and paste output
#   COOKIE_SECURE=false
#   ONPREM_MODE=true
#   UPLOAD_DIR=./uploads
#   GEMINI_API_KEY=your-key-here

# 5. Create upload directories
mkdir -p uploads/public uploads/private

# 6. Install dependencies (build-essential must be installed first)
npm install

# 7. Push database schema (creates all 50+ tables)
npm run db:push

# 8. Seed platform data + install asset files
bash cloud/setup-dev.sh
# Runs three steps automatically:
#   Step 1/3 — db:push (schema sync, idempotent)
#   Step 2/3 — imports all 35 JSON seed files from cloud/data/ (ON CONFLICT DO NOTHING)
#   Step 3/3 — copies platform asset files from learnplay-export-20260304/ bundle:
#              • 5 Gamma image-style thumbnails (photorealistic, illustrated, etc.)
#              • 104 Gamma theme thumbnails
#              • Platform branding files (logo, favicon history)
#              Destination: uploads/public/ (cp -rn — never overwrites existing files)
#              If no learnplay-export-*/ bundle found, prints instructions to run
#              export-all.sh from the Replit Shell, then re-run setup-dev.sh.
# Idempotent — safe to re-run at any time.
#
# Seeded data includes:
#   • Dinosaurs card collection (30 cards + 180 card stats)
#   • 4 power-ups, 10 cosmetics, 5 Gamma image styles
#   • 29 supported languages (English through Maltese)
#   • 3 business packages with ZAR + EUR pricing
#   • 4 credit purchase packages
#   • 3 subscription tiers + 4 e-learning subscription plans
#   • Quiz credit pricing defaults (10/15/20 questions)
#   • Lesson credit pricing settings
#   • Platform pricing defaults (LP Credit costs per AI operation)
#   • Gamification economy rules (XP/coin rewards per activity)
#   • 8 challenge templates (4 daily + 4 weekly)
#   • 10 achievement catalog entries
#   • Currency conversion rates (ZAR ↔ USD/EUR)
# NOT seeded (no transactional data): users, orgs, courses, quizzes, payments

# 9. Start development server
npm run dev
# → http://localhost:3000
# → Navigate to /auth → register first user → auto-becomes SuperAdmin
```

### Daily Development

```bash
npm run dev           # start server with hot reload
npm run db:push       # after editing shared/schema.ts
npm run check         # TypeScript validation
openssl rand -hex 32  # generate a new secret
ss -tlnp | grep :3000 # check port in use
PORT=3001 npm run dev # start on alternate port if conflict
```

---

## 21.5. Seed Data Directory Reference

The `cloud/data/` directory contains **35 JSON seed files** providing all system-required catalog and configuration data. No transactional data (users, orgs, courses, payments) is included.

### Quick reference

| Command | Purpose |
|---|---|
| `bash cloud/setup-dev.sh` | Full first-time setup: db:push + import 35 seed files + copy asset files from learnplay-export bundle |
| `bash cloud/import-platform-data.sh cloud/data` | Import seed data only (schema must already exist) |

**Export bundle:** The `learnplay-export-20260304/` directory in the `Cloud-On-Prem/` root is the exported Object Store snapshot. It provides 145 platform asset files that `setup-dev.sh` automatically copies into `uploads/public/` during Step 3:
- `files/public/gamma/image-styles/` — 5 Gamma image-style thumbnails
- `files/public/gamma/themes/` — 104 Gamma theme thumbnails
- `files/public/branding/platform/` — platform logo and favicon files

Card images (`collection/Dinosaurs/{Name}/image.jpg`) are **not** in the bundle — they were never uploaded to the Object Store. The card game is fully playable without them; add art files manually to `uploads/public/collection/Dinosaurs/{Name}/image.jpg` to enable card thumbnails.

### What is in cloud/data/ (35 files)

| File | Rows | Content |
|---|---|---|
| `cardCollections.json` | 1 | Dinosaurs collection (the built-in card game set) |
| `collectionStatTypes.json` | 6 | Stat types: Height, Weight, Length, Killer Rating, Intelligence, Age |
| `cards.json` | 30 | All 30 dinosaur trading cards with imageKey paths |
| `cardStats.json` | 180 | Stat values (6 stats × 30 cards) |
| `supportedLanguages.json` | 29 | English through Maltese — all AI translation target languages |
| `universalStatUnits.json` | 8 | Unit definitions: meters, kg, km/h, /10 rating, million years, etc. |
| `powerUpCatalog.json` | 4 | XP Boost 10min, XP Boost 30min, Triple XP, Time Extension |
| `cosmeticCatalog.json` | 10 | Avatar rings, frames, and name colour effects |
| `gammaImageStyles.json` | 5 | AI image styles: photorealistic, illustrated, minimal, corporate, playful |
| `platformPricing.json` | 1 | LP Credit costs per AI operation + learner monthly pricing |
| `platformPaymentSettings.json` | 1 | Yoco mode set to "test" (dev-safe default) |
| `platformCostCategoryTypes.json` | 8 | Cost category type definitions for financial tracking |
| `platformCostCategories.json` | 8 | Infrastructure, Payment Processing, API Services, etc. |
| `businessPackages.json` | 3 | Starter / Professional / Enterprise org packages |
| `businessPackagePrices.json` | 6 | ZAR + EUR pricing for each business package |
| `creditPurchasePackages.json` | 4 | Starter / Professional / Enterprise / Power credit packs |
| `subscriptionPlans.json` | 3 | Standard / Professional / Enterprise org subscription tiers |
| `elearningSubscriptionPlans.json` | 4 | Basic/Pro Learner + Basic/Pro Educator e-learning plans |
| `currencyConversionRates.json` | 4 | ZAR↔USD and ZAR↔EUR exchange rates |
| `lessonCreditPricingSettings.json` | 1 | Credit cost tiers for lesson generation calculator |
| `quizCreditPricing.json` | 3 | Platform-default quiz credit pricing (10/15/20 questions) |
| `challengeTemplates.json` | 8 | Daily (×4) and weekly (×4) challenge template definitions |
| `achievementCatalog.json` | 10 | Achievements across 4 categories: quizzes, streaks, perfection, milestones |
| `gamificationEconomyRules.json` | 1 | Global XP and coin reward rates for all activities |
| `systemSettings.json` | 0 | Empty — managed via SuperAdmin UI |
| `platformConfiguration.json` | 0 | Empty — managed via SuperAdmin UI |
| `platformRevenueSources.json` | 0 | Empty — transactional data, populated at runtime |
| `courseTags.json` | 0 | Empty — org-scoped, requires org and course FKs |
| `adminChallengeConfig.json` | 0 | Empty — admin-configured post-login |
| `branding_themes.json` | 0 | Empty — import script protects existing org branding |
| `gammaThemes.json` | 0 | Empty — synced from Gamma API on first use |
| `seasonPassConfig.json` | 0 | Empty — no active season on fresh install |
| `seasonPassTiers.json` | 0 | Empty — requires seasonPassConfigId FK |
| `shopItemPricing.json` | 0 | Empty — admin-configured post-login |
| `licenseFlagOverrides.json` | 0 | Empty — requires users table FK (no users on install) |

### Card images

The seed data includes `imageKey` paths for all 30 dinosaur cards but the image files are **not bundled**. The card game is fully playable without them. To enable card thumbnails, place image files at:

```
uploads/public/collection/Dinosaurs/{DinosaurName}/image.jpg
```

Example: `uploads/public/collection/Dinosaurs/Triceratops/image.jpg`

---

## 22. Architecture Rules and Conventions

### Data Model (Critical)

- `shared/schema.ts` is the **single source of truth** for all types — both backend routes and frontend forms import from here
- Every new table requires: Drizzle table + `createInsertSchema` + insert type + select type
- Array columns: `text().array()` NOT `array(text())`
- Never change primary key column type (serial ↔ varchar) — causes destructive migrations

### File Storage

- **Never import `objectStorage-gcs.ts` or `objectStorage-onprem.ts` directly** — always import from `objectStorage.ts`
- **Never hardcode `/opt/uploads`** — always `process.env.UPLOAD_DIR || './uploads'`

### Routes and Services

- Routes are thin controllers — validate input with Zod, call service, return result
- Business logic belongs in `server/services/` — keep it testable and reusable
- Validate request body before calling any service: `insertSchema.parse(req.body)`

### Frontend Conventions

- Use `apiRequest` from `@lib/queryClient` for all mutations (not bare fetch)
- Always provide `defaultValues` to `useForm` — forms are controlled
- After every mutation: call `queryClient.invalidateQueries({ queryKey: [...] })`
- Use hierarchical query keys: `['/api/courses', courseId]` not `['/api/courses/${courseId}']`
- Never hardcode org terminology — use `OrganizationContext.terminology`
- Access env vars with `import.meta.env.VITE_*` (not `process.env`) in frontend code

### Files Never to Modify

| File | Reason |
|---|---|
| `drizzle.config.ts` | Drizzle migration config — wrong changes break all DB operations |
| `vite.config.ts` | Vite aliases and plugins are pre-configured |
| `server/vite.ts` | Express-Vite integration — serves frontend in dev |
| `package.json` | Use package manager tools to add dependencies |

### Coding Conventions

- TypeScript strict mode — no `any` unless absolutely necessary
- Zod schemas for all external input (request bodies, env vars, API responses)
- Services return typed results — use the select types from `shared/schema.ts`
- Error handling: services throw typed errors; routes catch and return appropriate HTTP status
- No silent fallbacks — if something fails, throw explicitly with a descriptive message
