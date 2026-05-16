# LearnPlay E-Learning Platform — Technical Audit & Master Test Documentation

> Policy update (April 6, 2026): lesson certificates are deprecated and removed. Course certificates are the only supported certificate type. Legacy lesson-certificate references in this audit are historical and not part of current runtime behavior.

**Document Version:** 1.0  
**Audit Date:** February 6, 2026  
**Phases:** Phase 1 (Technical Stocktake) + Phase 2 (Master Test Documentation)  
**Methodology:** STLC-Aligned (Software Testing Life Cycle)  
**Author:** Platform Engineering Team  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Platform Architecture Overview](#2-platform-architecture-overview)
   - 2.1 Technology Stack
   - 2.2 Architecture Pattern
   - 2.3 Key Directory Structure
   - 2.4 Codebase Statistics
3. [Phase 1: Technical Stocktake — Feature-by-Feature Codebase Mapping](#3-phase-1-technical-stocktake--feature-by-feature-codebase-mapping)
   - 3.1 AI-Powered Course Creation (Create Pillar)
   - 3.2 Gamification System (Engage Pillar)
   - 3.3 Analytics & Reporting (Measure Pillar)
   - 3.4 Enterprise Security & Multi-Tenancy
   - 3.5 White-Label Branding
   - 3.6 Organization Management
   - 3.7 Course Assignment & Progress Tracking
   - 3.8 Notifications & Email System
   - 3.9 Marketplace & Payments
   - 3.10 Quiz System
   - 3.11 Credit & Wallet System
   - 3.12 Subscription & Licensing System
   - 3.13 Platform Revenue & Financial Management
   - 3.14 Business Packages
   - 3.15 Card Trading Game System
   - 3.16 Course Versioning & Marketplace Publishing
   - 3.17 Course Reviews & Moderation
   - 3.18 Payout & Commission System
4. [Security & Infrastructure Audit](#4-security--infrastructure-audit)
   - 4.1 Authentication Security
   - 4.2 Multi-Tenant Isolation
   - 4.3 Data Integrity
   - 4.4 Session Security
   - 4.5 Monitoring & Observability
5. [Gap Analysis — Features Requiring Verification](#5-gap-analysis--features-requiring-verification)
6. [Database Schema Summary](#6-database-schema-summary)
7. [API Endpoint Inventory](#7-api-endpoint-inventory)
8. [Service Layer Inventory](#8-service-layer-inventory)
9. [Frontend Component Inventory](#9-frontend-component-inventory)
10. [Appendix A: Enum Registry](#appendix-a-enum-registry)
11. [Appendix B: Middleware Chain Reference](#appendix-b-middleware-chain-reference)
12. [Appendix C: Feature Flag Registry](#appendix-c-feature-flag-registry)
13. [Phase 2: Master Test Documentation](#phase-2-master-test-documentation)
    - P2.1 Test Strategy
    - P2.2 Test Suite: Authentication & Security (TS-AUTH)
    - P2.3 Test Suite: AI Course Creation (TS-COURSE)
    - P2.4 Test Suite: Gamification (TS-GAME)
    - P2.5 Test Suite: Organization Management (TS-ORG)
    - P2.6 Test Suite: Course Assignment & Progress (TS-ASSIGN)
    - P2.7 Test Suite: Analytics & Reporting (TS-REPORT)
    - P2.8 Test Suite: White-Label Branding (TS-BRAND)
    - P2.9 Test Suite: Marketplace & Payments (TS-PAY)
    - P2.10 Test Suite: Notifications & Email (TS-NOTIF)
    - P2.11 Test Suite: Quiz System (TS-QUIZ)
    - P2.12 Traceability Matrix
    - P2.13 Test Execution Summary Template
    - P2.14 Defect Report Template

---

## 1. Executive Summary

LearnPlay is a multi-tenant e-learning platform built on a modern full-stack JavaScript/TypeScript architecture: **Node.js/Express** (backend), **React/Vite** (frontend), and **PostgreSQL** with **Drizzle ORM** (data layer). The platform follows a **"Create → Engage → Measure"** model:

- **Create**: AI-powered course creation using Google Gemini API with document extraction, topic analysis, and Gamma API for PPTX presentation generation.
- **Engage**: Full gamification engine with virtual coins, XP/leveling, daily/weekly challenges, power-ups, cosmetics shop, season pass, achievements, and leaderboards.
- **Measure**: Comprehensive analytics dashboard with learner progress tracking, at-risk identification, performance heatmaps, quiz analytics, and completion funnels.

The platform serves three organization types — **Education**, **Business**, and **E-learning** — each with differentiated features. It implements enterprise-grade security through session-based authentication, multi-tenant data isolation, RBAC (Role-Based Access Control), and white-label branding.

### Key Metrics at a Glance

| Metric | Value |
|--------|-------|
| Schema Definition (shared/schema.ts) | 6,241 lines |
| Database Tables | 162 |
| Database Enums | 57 |
| Route Files | 17 |
| Total Route File Lines | 37,418 |
| API Endpoints (verified) | 708 |
| Backend Services | 85 |
| Frontend Pages | 92 |
| Frontend Components | 97+ |
| Custom Hooks | 20 |

This document provides a complete **Phase 1 Technical Stocktake** mapping every feature from the LearnPlay overview to its exact codebase implementation, identifying implementation status, and flagging gaps — followed by a **Phase 2 Master Test Documentation** with 113 manual test cases across 10 test suites, traceability matrix, and execution/defect templates.

---

## 2. Platform Architecture Overview

### 2.1 Technology Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| **Backend Runtime** | Node.js + Express.js | TypeScript, session-based REST API |
| **Frontend Framework** | React 18 | TypeScript, Vite build tool |
| **Routing (Client)** | Wouter | Lightweight React router |
| **State Management** | TanStack Query v5 | Server state with caching, mutations |
| **Styling** | Tailwind CSS + shadcn/ui | Utility-first CSS with component library |
| **Database** | PostgreSQL | Neon-backed, managed by Replit |
| **ORM** | Drizzle ORM | Type-safe schema, migrations |
| **Schema Validation** | Zod + drizzle-zod | Runtime validation with type inference |
| **AI Provider** | Google Gemini API | Course generation, quiz generation, content coaching |
| **Presentation API** | Gamma API | PPTX slide generation |
| **Email Service** | MailerSend | Transactional emails, templates |
| **Payment Gateway** | YOCO | South African payment processing |
| **File Storage** | Replit Object Storage | PPTX files, thumbnails, documents, certificates |
| **Session Store** | connect-pg-simple | PostgreSQL-backed session persistence |
| **Image Processing** | Sharp | Image compression, favicon/logo processing |
| **Document Processing** | Mammoth | DOCX text extraction |
| **Charts** | Recharts | Frontend data visualization |

### 2.2 Architecture Pattern

```
┌──────────────────────────────────────────────────────────────┐
│                      CLIENT (React/Vite)                      │
│  Pages → Components → Hooks → TanStack Query → API Client    │
├──────────────────────────────────────────────────────────────┤
│                    MIDDLEWARE CHAIN                            │
│  Session Auth → Org Resolution → Org Isolation → RBAC Guard   │
├──────────────────────────────────────────────────────────────┤
│                  EXPRESS.JS ROUTE LAYER                        │
│  17 route modules → Request validation → Response formatting  │
├──────────────────────────────────────────────────────────────┤
│                   SERVICE LAYER (85 services)                 │
│  Business logic → Transaction management → External APIs      │
├──────────────────────────────────────────────────────────────┤
│               DATA ACCESS (Drizzle ORM + PostgreSQL)          │
│  162 tables → 57 enums → Composite indexes → FK constraints   │
├──────────────────────────────────────────────────────────────┤
│                  EXTERNAL SERVICES                            │
│  Gemini AI │ Gamma API │ MailerSend │ YOCO │ Object Storage   │
└──────────────────────────────────────────────────────────────┘
```

**Multi-Tenant SaaS Model**:
- Organization isolation enforced at middleware and query levels
- `organizationId` foreign key on all tenant-scoped tables
- 4-source effective organization resolution: Impersonation > Header > Primary > Fallback

**RBAC Hierarchy** (highest to lowest privilege):
1. **SuperAdmin** — Platform-wide access, impersonation, financial management
2. **OrgAdmin** — Full organization management, billing, user management
3. **Teacher** — Course creation, lesson management, quiz creation, reporting
4. **TeamLead** — Team-scoped management
5. **Student/Employee** — Course consumption, quiz participation, gamification

**Feature Flag System**:
- Gradual rollout capability via `server/config/featureFlags.ts`
- Organization-level and beta-user targeting
- Emergency disable capability
- Audit logging for flag changes

### 2.3 Key Directory Structure

```
shared/
  schema.ts                  — 6,241 lines: all DB tables, types, enums, Zod schemas
  brandingTokens.ts          — Branding token definitions
  businessConstants.ts       — Business package constants
  challengeConstants.ts      — Challenge goal types
  contentParsers.ts          — Learning Asset Contract types
  courseCategories.ts         — Course category definitions
  courseFrameworkContracts.ts — Framework generation contracts
  creditConstants.ts         — Credit system constants
  gameUtils.ts               — Game utility functions
  learningAssetTypes.ts      — Asset type definitions
  levelUtils.ts              — XP/level calculation utilities
  themeTokenBuilder.ts       — Theme token construction
  tokenSectionMapping.ts     — Token-to-section mapping

server/
  index.ts                   — Application entry point
  db.ts                      — Database connection (pool + session pool)
  storage.ts                 — Storage interface (IStorage) and implementation
  routes.ts                  — Route registration orchestrator
  routes/
    authRoutes.ts            — 18 endpoints: login, register, password reset, email verify
    courseRoutes.ts           — 111 endpoints: courses, lessons, assignments, progress
    aiRoutes.ts              — 13 endpoints: AI generation, content coaching
    gamificationRoutes.ts    — 61 endpoints: coins, challenges, shop, leaderboards
    reportRoutes.ts          — 24 endpoints: analytics, student reports, heatmaps
    orgRoutes.ts             — 62 endpoints: org CRUD, join requests, billing, hierarchy
    adminRoutes.ts           — 198 endpoints: admin panel, users, settings, revenue
    quizRoutes.ts            — 46 endpoints: quiz CRUD, assignments, progress, drafts
    paymentsRoutes.ts        — 28 endpoints: checkout, webhooks, subscriptions, invoices
    superAdminRoutes.ts      — 56 endpoints: impersonation, analytics, payouts, config
    gameRoutes.ts            — 6 endpoints: lobby, game rooms, card games
    courseFrameworkRoutes.ts  — 24 endpoints: course draft framework wizard
    platformRevenue.ts       — 12 endpoints: revenue overview, costs, snapshots
    miscRoutes.ts            — 10 endpoints: monitoring, notifications, gamma themes
    public.ts                — 15 endpoints: public course browse, feature flags, health
    orgSalesRoutes.ts        — 3 endpoints: org sales dashboard
    shared.ts                — Session configuration, middleware exports
    sharedResources.ts       — Shared imports and middleware re-exports
  middleware/
    sessionAuthMiddleware.ts — Dual-path session auth with effective org resolution
    orgIsolationMiddleware.ts — Multi-tenant data isolation enforcement
    trialLockoutMiddleware.ts — Trial expiry enforcement
  services/                  — 85 service files (business logic layer)
  ai/
    aiService.ts             — Google Gemini API integration
  monitoring/
    authQueryTracker.ts      — Auth query performance tracking
    performanceMonitor.ts    — Request performance monitoring
    queryLogger.ts           — Database query logging
    sessionHealthMonitor.ts  — Session health metrics
  workers/
    documentExtractionWorker.ts — Async document extraction
    jobQueueWorker.ts        — Gamma job queue processing
    postFulfillmentWorker.ts — Post-payment fulfillment
  schedulers/
    annualPlanPromotionScheduler.ts — Annual plan promotions
    trialExpiryScheduler.ts  — Trial expiry processing
  config/
    featureFlags.ts          — Feature flag definitions
    paymentFeatureFlags.ts   — Payment-specific feature flags
  adminAuth.ts               — Admin/SuperAdmin guards
  tenantMiddleware.ts        — Tenant access control helpers
  gamificationService.ts     — Core gamification business logic
  xpService.ts               — XP/leveling system
  challengeScheduler.ts      — Daily/weekly challenge resets
  seasonPassScheduler.ts     — Season pass lifecycle
  seedGamification.ts        — Gamification seed data
  catalogDefinitions.ts      — Catalog seed definitions
  ensureCatalogs.ts          — Catalog initialization on startup
  ensureDatabase.ts          — Database schema validation
  ensureSeasonPass.ts        — Season pass initialization
  brandingRoutes.ts          — 21 endpoints: white-label branding, domains
  billing.ts                 — Billing utilities
  gameEngine.ts              — Card game engine logic
  objectStorage.ts           — Object storage client wrapper
  usageLimitMiddleware.ts    — Usage limit enforcement

client/src/
  App.tsx                    — Root component with route definitions
  main.tsx                   — React entry point
  index.css                  — Global styles with Tailwind
  pages/                     — 92 page components
  components/                — 97+ reusable components
    ui/                      — shadcn/ui primitives (50+ components)
    admin/                   — Admin-specific components
    brand-editor/            — Brand editor components with previews
  hooks/                     — 20 custom React hooks
  contexts/                  — BrandingContext, OrganizationContext
  lib/                       — Utility libraries (queryClient, currency, etc.)
  config/                    — Configuration (admin nav, landing page, theme presets)
  utils/                     — Utility functions (contrast, terminology, timezones)
```

### 2.4 Codebase Statistics

| Category | Count | Details |
|----------|-------|---------|
| Database Tables | 162 | Defined in `shared/schema.ts` |
| Database Enums | 57 | Covering status types, roles, currencies, etc. |
| Route Modules | 17 | Domain-specific Express routers |
| Total API Endpoints | 708 | Across all route modules |
| Backend Services | 85 | Business logic service files |
| Middleware Files | 5 | Auth, org isolation, trial lockout, tenant, usage limits |
| Workers | 3 | Document extraction, job queue, post-fulfillment |
| Schedulers | 4 | Challenges, season pass, trial expiry, annual promotions |
| Frontend Pages | 92 | React page components |
| Frontend Components | 97+ | Reusable React components |
| Custom Hooks | 20 | React hooks for shared logic |
| Shared Type Modules | 13 | Cross-cutting type definitions |

---

## 3. Phase 1: Technical Stocktake — Feature-by-Feature Codebase Mapping

### 3.1 AI-Powered Course Creation (Slide: "Create Pillar")

**Slide Reference**: Create Pillar — "AI-Powered Course Creation"  
**Feature Description**: Teachers and admins create courses via AI assistance. The system supports four generation modes: `gemini-topics` (AI generates topics from a title), `text-input` (user provides text content), `document-upload` (DOCX extraction + AI analysis), and `manual-upload` (user uploads PPTX directly). A structured "Learning Asset Contract" defines slide/topic data. The Gamma API generates PPTX presentations from AI-generated content. A zero-hallucination framework ensures source traceability via `sourceMap` fields.

#### Database Tables

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `lessons` | id, organizationId, createdBy, title, generationMode, generationStatus, learningAssetContract, gammaCardId, storageKey, isPublished, videoStorageKey, contentScore10, feedbackReport, sourceMap, thumbnailUrl, thumbnailSource, extractedContent, extractionStatus | Core lesson entity with AI generation metadata |
| `courses` | id, organizationId, title, description, price, currency, status, visibility, unitId, subUnitId, teamId, currentVersionId, sourceVersionCourseId, cloneMapping, category | Course container linking multiple lessons |
| `courseLessons` | courseId, lessonId, topicId, topicOrder, topicName, primaryQuizId, learningObjectives, lessonType, contentHealth | Links lessons to courses with ordering and health tracking |
| `courseFrameworks` | courseId, topics (JSONB), sourceMap, contentHealth | AI-generated course structure/framework |
| `lessonSlides` | lessonId, version, slideIndex, title, bullets, speakerNotes, role | Versioned slide content from AI generation |
| `lessonPresentationVersions` | lessonId, version, gammaCardId, storageKey, creditsCharged, isGenerated, isCompressed | PPTX version history with credit tracking |
| `lessonContentVersions` | lessonId, version, content, createdAt | Content version history |
| `lessonVersions` | lessonId, version, title, content | Lesson version snapshots |
| `pendingGammaJobs` | lessonId, organizationId, status (pending/claimed/polling/completed/failed), gammaCardId, retryCount | Async job queue for Gamma API presentation generation |
| `lessonAccessLogs` | lessonId, userId, actionType, ipAddress, userAgent | Audit trail for lesson access |
| `courseDrafts` | originalCourseId, title, description, price, category, status | Draft editing system for courses |
| `courseDraftFrameworks` | draftId, topics, sourceMap | Draft-specific framework data |
| `courseDraftDocuments` | draftId, fileName, storageKey, extractionStatus, extractedContent | Documents uploaded during draft creation |
| `courseTags` | courseId, tagName, organizationId | Search tags for course discovery |
| `courseCategories` | id, name, slug, description | Course category taxonomy |
| `gammaThemes` | id, name, themeKey, isDefault, thumbnailUrl | Gamma presentation themes |
| `gammaImageStyles` | id, styleKey, name, description, thumbnailUrl | Gamma image style options |
| `aiConfig` | id, provider, model, isActive, maxTokens, temperature | AI provider configuration |

#### Backend Routes

**Course Routes** (`server/routes/courseRoutes.ts` — 111 endpoints, 6,899 lines):

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/courses` | withSessionAuth | List courses (org-scoped) |
| GET | `/api/courses/counts` | isTeacherOrAdmin | Course count statistics |
| GET | `/api/courses/drafts-status` | isTeacherOrAdmin | Draft status overview |
| GET | `/api/courses/:id` | Public/Auth | Get course detail |
| PATCH | `/api/courses/:id` | isTeacherOrAdmin | Update course |
| DELETE | `/api/courses/:id` | isTeacherOrAdmin | Delete course |
| PATCH | `/api/courses/:id/status` | isTeacherOrAdmin | Change course status |
| GET | `/api/courses/:id/validate-publish` | isTeacherOrAdmin | Validate before publishing |
| POST | `/api/courses/:id/publish` | isTeacherOrAdmin | Publish course |
| POST | `/api/courses/:id/create-draft` | isTeacherOrAdmin | Create editing draft |
| GET | `/api/courses/:id/draft` | isTeacherOrAdmin | Get draft details |
| PATCH | `/api/courses/:id/draft` | isTeacherOrAdmin | Update draft |
| POST | `/api/courses/:id/publish-draft` | isTeacherOrAdmin | Publish draft changes |
| DELETE | `/api/courses/:id/draft` | isTeacherOrAdmin | Discard draft |
| POST | `/api/courses/:courseId/lessons/:lessonId` | isTeacherOrAdmin | Link lesson to course |
| DELETE | `/api/courses/:courseId/lessons/:lessonId` | isTeacherOrAdmin | Unlink lesson from course |
| POST | `/api/courses/:courseId/lessons/:lessonId/relink` | isTeacherOrAdmin | Relink lesson |
| GET | `/api/courses/:courseId/relinkable-lessons` | isTeacherOrAdmin | Get relinkable lessons |
| GET | `/api/courses/:id/framework` | withSessionAuth | Get course framework |
| PATCH | `/api/courses/:courseId/framework/reorder` | withSessionAuth | Reorder framework topics |
| POST | `/api/courses/:courseId/lessons/:lessonId/complete` | withSessionAuth | Mark lesson complete |
| GET | `/api/courses/:courseId/quizzes` | withSessionAuth | Get course quizzes |
| GET | `/api/courses/:id/demo-lesson` | Public | Get demo lesson |
| GET | `/api/courses/:courseId/certificate-status` | withSessionAuth | Certificate eligibility |
| POST | `/api/courses/:courseId/certificate` | withSessionAuth | Generate certificate |
| GET | `/api/courses/:courseId/quiz-progress` | withSessionAuth | Quiz progress for course |
| POST | `/api/lessons` | requireOrgAccess | Create lesson |
| GET | `/api/lessons` | requireOrgAccess | List lessons (org-scoped) |
| GET | `/api/lessons/assigned/:orgId` | enforceOrgIsolation | Get assigned lessons |
| GET | `/api/lessons/assigned` | requireOrgAccess | Get assigned lessons (implicit org) |
| GET | `/api/lessons/:lessonId` | requireLessonOrgAccess | Get lesson detail |
| PUT | `/api/lessons/:lessonId` | requireLessonOrgAccess | Update lesson |
| POST | `/api/lessons/:lessonId/publish` | requireLessonOrgAccess | Publish lesson |
| POST | `/api/lessons/:lessonId/unpublish` | requireLessonOrgAccess | Unpublish lesson |
| POST | `/api/lessons/:lessonId/archive` | requireLessonOrgAccess | Archive lesson |
| POST | `/api/lessons/:lessonId/restore` | requireLessonOrgAccess | Restore archived lesson |
| DELETE | `/api/lessons/:lessonId` | requireLessonOrgAccess | Delete lesson |
| GET | `/api/lessons/:lessonId/download` | requireLessonAdminAccess | Download PPTX |
| GET | `/api/lessons/:lessonId/download-video` | requireLessonAdminAccess | Download video |
| GET | `/api/lessons/:lessonId/presentation-versions` | requireLessonOrgAccess | List PPTX versions |
| GET | `/api/lessons/:lessonId/presentation-versions/:versionId/download` | requireLessonOrgAccess | Download specific version |
| GET | `/api/lessons/:lessonId/viewer` | requireLessonOrgAccess | Get viewer URL |
| GET | `/api/lessons/:lessonId/quiz-params` | requireLessonOrgAccess | Get quiz parameters |
| GET | `/api/lessons/:lessonId/extracted-content` | requireLessonOrgAccess | Get extracted document content |
| POST | `/api/lessons/:lessonId/upload` | requireLessonOrgAccess | Upload PPTX file |
| POST | `/api/lessons/:lessonId/upload-video` | requireLessonOrgAccess | Upload video walkthrough |
| POST | `/api/lessons/:lessonId/upload-pptx` | requireLessonOrgAccess | Upload replacement PPTX |
| POST | `/api/lessons/:lessonId/supplement` | requireLessonOrgAccess | Upload supplementary document |
| GET | `/api/lessons/:lessonId/source-document` | requireLessonOrgAccess | Get source document |
| DELETE | `/api/lessons/:lessonId/source-document` | requireLessonAdminAccess | Delete source document |
| POST | `/api/lessons/:lessonId/link-quiz` | requireLessonOrgAccess | Link quiz to lesson |
| POST | `/api/lessons/:lessonId/unlink-quiz` | requireLessonOrgAccess | Unlink quiz from lesson |
| GET | `/api/lessons/:lessonId/linked-quizzes` | requireLessonOrgAccess | Get linked quizzes |
| GET | `/api/lessons/:lessonId/capabilities` | requireLessonOrgAccess | Get lesson capabilities |
| POST | `/api/lessons/:lessonId/orchestrate` | requireLessonOrgAccess | Orchestrate full lesson creation |
| POST | `/api/lessons/manual-upload` | withSessionAuth | Manual PPTX upload lesson creation |
| POST | `/api/lessons/document-upload` | withSessionAuth | Document-upload lesson creation |
| POST | `/api/lessons/assign` | requireOrgAccess | Assign lesson to scope |
| DELETE | `/api/lessons/assignments/:assignmentId` | withSessionAuth | Remove lesson assignment |

**AI Routes** (`server/routes/aiRoutes.ts` — 13 endpoints, 745 lines):

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/ai/config` | isSuperAdmin | List AI configurations |
| GET | `/api/ai/models` | isSuperAdmin | List available AI models |
| POST | `/api/ai/config` | isSuperAdmin | Create AI configuration |
| PATCH | `/api/ai/config/:id/activate` | isSuperAdmin | Activate AI config |
| PUT | `/api/ai/config/:id` | isSuperAdmin | Update AI configuration |
| DELETE | `/api/ai/config/:id` | isSuperAdmin | Delete AI configuration |
| POST | `/api/ai/generate-quiz-metadata` | withSessionAuth | Generate quiz metadata |
| POST | `/api/ai/generate-lesson-topics` | withSessionAuth | AI topic generation from title |
| POST | `/api/ai/generate-lesson-description` | withSessionAuth | AI lesson description |
| POST | `/api/ai/generate-quiz` | withSessionAuth | Generate quiz from lesson content |
| POST | `/api/ai/regenerate-question` | withSessionAuth | Regenerate specific quiz question |
| POST | `/api/ai/regenerate-answers` | withSessionAuth | Regenerate quiz answer options |
| POST | `/api/ai/test` | withSessionAuth | Test AI configuration |

**Course Framework Routes** (`server/routes/courseFrameworkRoutes.ts` — 24 endpoints, 2,874 lines):

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/course-drafts/` | requireAuth | Create course draft |
| GET | `/api/course-drafts/topic-analysis-cost` | requireAuth | Get topic analysis credit cost |
| GET | `/api/course-drafts/framework-generation-cost` | requireAuth | Get framework generation cost |
| GET | `/api/course-drafts/content-generation-cost` | requireAuth | Get content generation cost |
| GET | `/api/course-drafts/:draftId` | requireAuth | Get draft details |
| POST | `/api/course-drafts/:draftId/documents` | requireAuth | Upload document to draft |
| GET | `/api/course-drafts/:draftId/documents/:docId` | requireAuth | Get document metadata |
| GET | `/api/course-drafts/:draftId/documents/:docId/content` | requireAuth | Get extracted content |
| PATCH | `/api/course-drafts/:draftId` | requireAuth | Update draft |
| DELETE | `/api/course-drafts/:draftId` | requireAuth | Delete draft |
| DELETE | `/api/course-drafts/:draftId/documents/:docId` | requireAuth | Delete draft document |
| POST | `/api/course-drafts/:draftId/description` | requireAuth | Generate AI description |
| POST | `/api/course-drafts/:draftId/analyze-topics` | requireAuth | AI topic analysis |
| POST | `/api/course-drafts/:draftId/advisor` | requireAuth | AI content advisor |
| POST | `/api/course-drafts/:draftId/generate` | requireAuth | Generate full course framework |
| GET | `/api/course-drafts/:draftId/generation-status` | requireAuth | Check generation status |
| POST | `/api/course-drafts/:draftId/lessons/:lessonIndex/objectives` | requireAuth | Generate learning objectives |
| POST | `/api/course-drafts/:draftId/duplicate` | requireAuth | Duplicate draft |
| POST | `/api/course-drafts/:draftId/lessons/:lessonIndex/supplement` | requireAuth | Upload lesson supplement |
| POST | `/api/course-drafts/:draftId/lessons/:lessonIndex/generate-content` | requireAuth | Generate lesson content |

#### Services / Business Logic

| Service File | Purpose |
|-------------|---------|
| `server/ai/aiService.ts` | Google Gemini API integration, prompt construction, response parsing |
| `server/services/documentExtractor.ts` | DOCX text extraction via mammoth, section parsing, heading detection, lesson structure identification |
| `server/services/pptxExtractor.ts` | PPTX content extraction for existing presentations |
| `server/services/lessonService.ts` | Lesson CRUD operations, viewer URL generation, status management |
| `server/services/courseService.ts` | Course CRUD, visibility management, org scoping |
| `server/services/courseLessonService.ts` | Course-lesson linking, ordering, content health |
| `server/services/courseFrameworkAIService.ts` | AI framework generation from documents |
| `server/services/courseFrameworkExtractor.ts` | Framework data extraction and parsing |
| `server/services/lessonOrchestrationService.ts` | End-to-end lesson creation orchestration |
| `server/services/courseTopicAIService.ts` | AI topic generation from titles |
| `server/services/lessonDescriptionAIService.ts` | AI lesson description generation |
| `server/services/contentCoachService.ts` | ContentCoach AI quality scoring and feedback |
| `server/services/contentHealthService.ts` | Content health assessment |
| `server/services/courseThumbnailAIService.ts` | AI thumbnail generation |
| `server/services/gammaService.ts` | Gamma API client for PPTX generation |
| `server/services/gammaImageStyleService.ts` | Gamma image style management |
| `server/services/gammaThemeSyncService.ts` | Gamma theme synchronization |
| `server/services/jobQueueService.ts` | Async job queue for Gamma API calls |
| `server/workers/jobQueueWorker.ts` | Worker processing Gamma generation jobs |
| `server/workers/documentExtractionWorker.ts` | Async document extraction worker |
| `server/services/lessonVersioningService.ts` | Lesson version management |
| `server/services/lessonGenerationPricingService.ts` | Credit pricing for lesson generation |
| `server/services/frameworkPricingService.ts` | Credit pricing for framework generation |
| `server/services/topicAnalysisPricingService.ts` | Credit pricing for topic analysis |
| `server/services/healthReportPricingService.ts` | Credit pricing for health reports |
| `server/services/thumbnailPricingService.ts` | Credit pricing for thumbnail generation |
| `server/services/aiEnrichmentService.ts` | AI content enrichment |

#### Middleware Guards

- `withSessionAuthMiddleware` — Requires authenticated session
- `requireOrgAccess` / `requireLessonOrgAccess` — Organization-scoped access control
- `requireLessonAdminAccess` — Admin-level access for lesson management
- `isTeacherOrAdmin` — Requires Teacher, OrgAdmin, or SuperAdmin role
- `enforceOrgIsolation()` — Multi-tenant data isolation
- `isSuperAdmin` — AI config management restricted to SuperAdmin

#### Frontend Components

| Component | Path | Purpose |
|-----------|------|---------|
| CourseDocumentWizard | `client/src/pages/CourseDocumentWizard.tsx` | Document upload + AI framework wizard |
| CourseFrameworkWizard | `client/src/pages/CourseFrameworkWizard.tsx` | Framework review, editing, generation |
| CourseBuilder | `client/src/pages/CourseBuilder.tsx` | Course builder dashboard |
| CourseBuilderUpload | `client/src/pages/CourseBuilderUpload.tsx` | Upload-based course creation |
| LessonWizard | `client/src/pages/LessonWizard.tsx` | Lesson creation wizard (all modes) |
| LessonViewer | `client/src/pages/LessonViewer.tsx` | Lesson viewing with PPTX embed |
| DemoLessonViewer | `client/src/pages/DemoLessonViewer.tsx` | Public demo lesson viewer |
| LessonLibrary | `client/src/pages/LessonLibrary.tsx` | Lesson management library |
| CourseEdit | `client/src/pages/CourseEdit.tsx` | Course editing page |
| CourseDetail | `client/src/pages/CourseDetail.tsx` | Course detail view |
| CourseLessons | `client/src/pages/CourseLessons.tsx` | Course lesson list |
| CoursePreview | `client/src/pages/CoursePreview.tsx` | Course preview |
| GammaThemes | `client/src/pages/GammaThemes.tsx` | Gamma theme management |
| AISettings | `client/src/pages/AISettings.tsx` | AI configuration management |
| ContentCoachPanel | `client/src/components/ContentCoachPanel.tsx` | Content quality scoring panel |
| LearningAssetChainPanel | `client/src/components/LearningAssetChainPanel.tsx` | Source traceability panel |
| LessonActionsMenu | `client/src/components/LessonActionsMenu.tsx` | Lesson action dropdown |
| LessonEditDialog | `client/src/components/LessonEditDialog.tsx` | Inline lesson editing |
| LessonVersionHistory | `client/src/components/LessonVersionHistory.tsx` | Version history viewer |
| LessonContentDiffModal | `client/src/components/LessonContentDiffModal.tsx` | Content diff comparison |
| LessonPickerModal | `client/src/components/LessonPickerModal.tsx` | Lesson selection modal |
| PresentationConfigurationSection | `client/src/components/PresentationConfigurationSection.tsx` | Gamma config UI |
| ImageStyleSelector | `client/src/components/ImageStyleSelector.tsx` | Image style picker |
| VideoPlayer | `client/src/components/VideoPlayer.tsx` | Video walkthrough player |
| ObjectUploader | `client/src/components/ObjectUploader.tsx` | File upload component |

#### Custom Hooks

| Hook | Path | Purpose |
|------|------|---------|
| useLessonProgress | `client/src/hooks/useLessonProgress.ts` | Lesson progress tracking |
| useLessonVersions | `client/src/hooks/useLessonVersions.ts` | Lesson version management |
| useLessonCreditCosts | `client/src/hooks/useLessonCreditCosts.ts` | Credit cost calculations |
| useTimeTracker | `client/src/hooks/useTimeTracker.ts` | Time spent tracking |

**Implementation Status**: ✅ **IMPLEMENTED**

---

### 3.2 Gamification System (Slide: "Engage Pillar")

**Slide Reference**: Engage Pillar — "Gamification Engine"  
**Feature Description**: Full gamification engine with virtual coins (LearnPlay Coins), XP/leveling system (levels 1-100 with progressive formula), daily/weekly challenges with automatic resets, power-ups (XP boost, change answer, time extension, hint), cosmetics shop (avatar rings, frames, name colors, victory animations), season pass with tiered rewards, achievements, login streaks, and competitive leaderboards.

#### Database Tables

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `coinTransactions` | userId, amount, balance, type, description, metadata, organizationId | Full audit ledger for all coin movements |
| `coinAdjustments` | userId, amount, reason, adjustedBy | Manual coin adjustments by admins |
| `challengeTemplates` | name, type (daily/weekly), requirement, targetValue, coinReward, xpReward, isActive | Challenge definition templates |
| `challengeProgress` | userId, challengeId, currentValue, isCompleted, isClaimed, resetAt, organizationId | Per-user challenge tracking |
| `adminChallengeConfig` | scope (global/org), challengeType, title, goalType, goalTarget, coinReward, xpReward, organizationId | Admin-configurable challenges |
| `powerUpCatalog` | name, type (xp_boost/change_answer/time_extension/hint), effect, coinCost, tier, isActive | Power-up store definitions |
| `powerUpInventory` | userId, powerUpId, quantity | User's owned power-ups |
| `activePowerUps` | userId, powerUpId, activatedAt, expiresAt, effect, usesRemaining, quizSessionId | Currently active power-up effects |
| `cosmeticCatalog` | name, type (avatar_ring/avatar_frame/name_color/victory_animation), effect, coinCost, tier, isActive | Cosmetic item definitions |
| `cosmeticOwnership` | userId, cosmeticId | Owned cosmetics |
| `equippedCosmetics` | userId, cosmeticId, slot | Currently equipped cosmetic per slot |
| `userCosmeticLoadouts` | userId, name, cosmeticIds | Saved cosmetic loadout presets |
| `seasonPassConfig` | seasonNumber, name, startDate, endDate, isActive, isPremiumAvailable, premiumCoinCost | Season configuration |
| `seasonPassTiers` | seasonConfigId, tierNumber, xpRequired, coinReward, xpReward, cosmeticReward, powerUpReward, isPremium | Tiered season rewards |
| `seasonPassProgress` | userId, seasonConfigId, currentTier, currentXP | Per-user season progress |
| `seasonPassPurchases` | userId, seasonConfigId, purchasedAt, coinsPaid | Premium pass purchases |
| `playerSeasonRewards` | userId, seasonConfigId, tierNumber, claimedAt | Claimed season rewards |
| `achievementCatalog` | name, category, description, requirement, targetValue, coinReward, xpReward, permanentBonus | Achievement definitions |
| `achievementUnlocks` | userId, achievementId, progress, isUnlocked, unlockedAt | User achievement progress |
| `loginStreaks` | userId, currentStreak, longestStreak, lastLoginDate, totalCoinsEarned | Login streak tracking |
| `gamificationEconomyRules` | scope (global/org), actionType, coinReward, xpReward, organizationId | Configurable reward amounts |
| `shopItemPricing` | scope (global/org), itemType, itemId, coinCost, organizationId | Price override per org |
| `leaderBoard` | userId, rank, score, wins, losses, totalGamesPlayed | Competitive rankings |
| `playerStats` | userId, totalXP, level, wins, losses, currentStreak, longestStreak, stats (JSONB) | Player statistics and level |

#### Backend Routes (`server/routes/gamificationRoutes.ts` — 61 endpoints, 1,722 lines)

**Leaderboard & Stats:**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/leaderboard/:limit?` | withSessionAuth | Get leaderboard rankings |
| GET | `/api/leaderboard/stats` | withSessionAuth | Get leaderboard statistics |
| GET | `/api/quiz-leaderboard` | withSessionAuth | Quiz-specific leaderboard |
| GET | `/api/user/leaderboard-stats` | withSessionAuth | Current user's leaderboard stats |

**Coins:**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/gamification/coins/balance` | withSessionAuth | Get coin balance |
| GET | `/api/gamification/coins/transactions` | withSessionAuth | Transaction history |

**Power-ups:**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/gamification/powerups/catalog` | withSessionAuth | Browse power-up catalog |
| POST | `/api/admin/gamification/powerups` | isSuperAdmin | Create power-up |
| PATCH | `/api/admin/gamification/powerups/:id` | isSuperAdmin | Update power-up |
| DELETE | `/api/admin/gamification/powerups/:id` | isSuperAdmin | Delete power-up |
| PATCH | `/api/gamification/powerups/catalog/:id` | withSessionAuth | Update catalog item |
| GET | `/api/gamification/powerups/inventory` | withSessionAuth | User's power-up inventory |
| POST | `/api/gamification/powerups/purchase` | withSessionAuth | Purchase power-up |
| POST | `/api/gamification/powerups/:powerupId/purchase` | withSessionAuth | Purchase specific power-up |
| POST | `/api/gamification/powerups/activate` | withSessionAuth | Activate power-up |
| GET | `/api/gamification/powerups/active` | withSessionAuth | Get active power-ups |

**Cosmetics:**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/gamification/cosmetics/catalog` | withSessionAuth | Browse cosmetics catalog |
| PATCH | `/api/gamification/cosmetics/catalog/:id` | withSessionAuth | Update cosmetic item |
| GET | `/api/gamification/cosmetics/owned` | withSessionAuth | User's owned cosmetics |
| POST | `/api/gamification/cosmetics/purchase` | withSessionAuth | Purchase cosmetic |
| POST | `/api/gamification/cosmetics/:cosmeticId/purchase` | withSessionAuth | Purchase specific cosmetic |
| POST | `/api/gamification/cosmetics/equip` | withSessionAuth | Equip cosmetic to slot |
| POST | `/api/gamification/cosmetics/unequip` | withSessionAuth | Unequip cosmetic |
| GET | `/api/gamification/cosmetics/equipped` | withSessionAuth | Get equipped cosmetics |
| GET | `/api/gamification/cosmetics/active/:userId` | withSessionAuth | Get another user's cosmetics |

**Season Pass:**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/gamification/season-pass/purchase` | withSessionAuth | Purchase premium season pass |
| GET | `/api/admin/season-pass/all` | withSessionAuth | List all season passes |
| GET | `/api/gamification/season-pass/active-purchases` | withSessionAuth | Active pass purchases |
| GET | `/api/gamification/season-pass/purchases` | withSessionAuth | Purchase history |
| GET | `/api/gamification/season-pass` | withSessionAuth | Current season pass details |
| GET | `/api/gamification/season-pass/active` | withSessionAuth | Get active season |
| POST | `/api/gamification/season-pass/claim-tier` | withSessionAuth | Claim tier reward |
| GET | `/api/season-pass/list` | isSuperAdmin | List all seasons (admin) |
| GET | `/api/season-pass/:id` | withSessionAuth | Get specific season |
| POST | `/api/season-pass` | isSuperAdmin | Create new season |
| PATCH | `/api/season-pass/:id` | isSuperAdmin | Update season config |
| POST | `/api/season-pass/:id/activate` | isSuperAdmin | Activate season |
| POST | `/api/season-pass/:id/expire` | isSuperAdmin | Force-expire season |
| POST | `/api/season-pass/claim-reward` | withSessionAuth | Claim season reward |

**Challenges, Streaks & Achievements:**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/gamification/challenges` | withSessionAuth | Active daily/weekly challenges |
| POST | `/api/gamification/challenges/:challengeId/claim` | withSessionAuth | Claim challenge reward |
| GET | `/api/gamification/streak` | withSessionAuth | Login streak info |
| GET | `/api/gamification/achievements` | withSessionAuth | User achievements |
| GET | `/api/gamification/dashboard` | withSessionAuth | Gamification dashboard summary |

**Admin Economy Config:**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/gamification/economy` | isTeacherOrAdmin | Get economy rules |
| POST | `/api/admin/gamification/economy` | isTeacherOrAdmin | Create/update economy rule |
| GET | `/api/admin/gamification/shop-pricing` | isTeacherOrAdmin | Get shop pricing |
| POST | `/api/admin/gamification/shop-pricing` | isTeacherOrAdmin | Set shop pricing |
| GET | `/api/admin/gamification/challenges` | isTeacherOrAdmin | Get admin challenges |
| POST | `/api/admin/gamification/challenges` | isTeacherOrAdmin | Create admin challenge |

#### Services / Business Logic

| Service File | Purpose |
|-------------|---------|
| `server/gamificationService.ts` | Core gamification logic: coin balance management with `SELECT FOR UPDATE` (race-condition safe), challenge CRUD and progress, power-up purchase/activation with expiry, cosmetic purchase/equip/unequip, season pass tier claims, achievement checks, login streak updates |
| `server/xpService.ts` | XP earning calculation, level progression (1-100 with formula `50 * level^1.5`), win streak bonuses, quiz pass/perfect bonuses, XP multiplier support from power-ups |
| `server/challengeScheduler.ts` | Cron-like scheduler with 1-minute polling interval: daily challenges reset at 00:03, weekly challenges reset Monday 00:01, with last-reset tracking to prevent double execution |
| `server/seasonPassScheduler.ts` | Season pass lifecycle management: activation, expiration, tier progression |
| `server/seedGamification.ts` | Seed data initialization for challenge templates, power-up catalog, cosmetic catalog, achievement catalog |
| `server/catalogDefinitions.ts` | Catalog item definitions |
| `server/ensureCatalogs.ts` | Ensures catalogs are populated on startup |
| `server/ensureSeasonPass.ts` | Ensures season pass is initialized |
| `server/seasonPassDefinitions.ts` | Season pass tier definitions |

#### Frontend Components

| Component | Path | Purpose |
|-----------|------|---------|
| GamificationSettings | `client/src/pages/GamificationSettings.tsx` | Admin gamification configuration |
| Leaderboard | `client/src/pages/Leaderboard.jsx` | Leaderboard page |
| QuizLeaderboard | `client/src/pages/QuizLeaderboard.jsx` | Quiz-specific leaderboard |
| GamificationHUD | `client/src/components/GamificationHUD.tsx` | Heads-up display (coins, XP, level) |
| ChallengesPanel | `client/src/components/ChallengesPanel.tsx` | Challenge tracker panel |
| CosmeticsShop | `client/src/components/CosmeticsShop.tsx` | Cosmetics shop interface |
| PowerUpsShop | `client/src/components/PowerUpsShop.tsx` | Power-ups shop interface |
| UnifiedShop | `client/src/components/UnifiedShop.tsx` | Unified shop (power-ups + cosmetics) |
| SeasonPass | `client/src/components/SeasonPass.tsx` | Season pass viewer |
| SeasonPassProgressBar | `client/src/components/SeasonPassProgressBar.tsx` | Season progress visualization |
| ActivePowerUpsOverlay | `client/src/components/ActivePowerUpsOverlay.tsx` | Active effects overlay |
| WalletInventory | `client/src/components/WalletInventory.tsx` | Wallet and inventory viewer |
| CosmeticEffect | `client/src/components/CosmeticEffect.tsx` | Cosmetic effect renderer |
| XPAnimationModal | `client/src/components/XPAnimationModal.jsx` | XP gain animation |
| QuizLeaderboard | `client/src/components/QuizLeaderboard.tsx` | Quiz leaderboard component |

**Implementation Status**: ✅ **IMPLEMENTED**

---

### 3.3 Analytics & Reporting (Slide: "Measure Pillar")

**Slide Reference**: Measure Pillar — "Analytics & Reporting"  
**Feature Description**: Comprehensive analytics for admins and teachers: organization performance summaries, student progress tracking, at-risk learner identification, performance heatmaps, quiz analytics, completion funnels, course leaderboards, and deadline management with email reminders.

#### Database Tables

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `courseProgress` | courseId, userId, organizationId, status (not_started/in_progress/completed), completedLessons, totalLessons, percentComplete, startedAt, completedAt | Course-level progress tracking |
| `lessonProgress` | lessonId, userId, organizationId, status, percentComplete, secondsSpent, slidesViewedCount, totalSlides, startedAt, completedAt | Lesson-level progress with time tracking |
| `lessonProgressSlides` | lessonProgressId, slideIndex, viewedAt, timeSpentSeconds | Per-slide view tracking |
| `userQuizProgress` | userId, quizId, score, passed, attempts, lastAttemptAt | Quiz results tracking |
| `quizGameResults` | userId, quizId, score, correctAnswers, totalQuestions, gameMode, timeTaken | Quiz game outcome details |
| `quizGameProgress` | gameRoomId, round, questionId, playerAnswer, isCorrect | Per-round quiz game data |
| `dailyStreaks` | userId, organizationId, currentStreak, longestStreak, lastActivityDate | Daily activity streaks |
| `userCourseLessonProgress` | userId, courseId, lessonId, status, percentComplete | Per-lesson progress within course context |

#### Backend Routes (`server/routes/reportRoutes.ts` — 24 endpoints, 2,067 lines)

**Admin Reports** (mounted at `/api/admin/reports/*`):

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/organizations/:orgId/student/:userId` | withSessionAuth + requireOrgAccess | Individual student report |
| GET | `/organizations/:orgId/student/:userId/results` | withSessionAuth + requireOrgAccess | Student quiz results |
| GET | `/organizations/:orgId/unit/:unitId/summary` | withSessionAuth + requireOrgAccess | Department summary |
| GET | `/organizations/:orgId/summary` | withSessionAuth + requireOrgAccess | Organization-wide summary |
| GET | `/organizations/:orgId/top-performers` | withSessionAuth + requireOrgAccess | Top performers list |
| GET | `/organizations/:orgId/at-risk-students` | withSessionAuth + requireOrgAccess | At-risk student identification |
| GET | `/organizations/:orgId/performance-distribution` | withSessionAuth + requireOrgAccess | Score distribution chart data |
| GET | `/organizations/:orgId/students-by-range/:range` | withSessionAuth + requireOrgAccess | Students in specific score range |
| GET | `/organizations/:orgId/student-timeline/:studentId` | withSessionAuth + requireOrgAccess | Student activity timeline |
| GET | `/student-analytics/:studentId` | withSessionAuth | Deep student analytics |
| GET | `/organizations/:orgId/performance-heatmap` | withSessionAuth + requireOrgAccess | Performance heatmap data |

**Learner Analytics** (mounted at `/api/reports/learner-analytics/*`):

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/:orgId/overview` | withSessionAuth + requireOrgAccess | Analytics overview dashboard |
| GET | `/:orgId/completion-funnel` | withSessionAuth + requireOrgAccess | Course completion funnel |
| GET | `/:orgId/top-performers` | withSessionAuth + requireOrgAccess | Top performers |
| GET | `/:orgId/at-risk-learners` | withSessionAuth + requireOrgAccess | At-risk learner identification |
| GET | `/:orgId/quiz-analytics` | withSessionAuth + requireOrgAccess | Quiz analytics overview |
| GET | `/:orgId/deadlines` | withSessionAuth + requireOrgAccess | Deadline tracking |
| POST | `/:orgId/deadlines/email` | withSessionAuth + requireOrgAccess | Send deadline email reminders |
| GET | `/:orgId/learner/:userId/profile` | withSessionAuth + requireOrgAccess | Learner profile detail |
| GET | `/:orgId/funnel-details/:stage` | withSessionAuth + requireOrgAccess | Funnel stage drill-down |
| GET | `/:orgId/at-risk-details/:type` | withSessionAuth + requireOrgAccess | At-risk category drill-down |
| GET | `/:orgId/course-learners/:courseId` | withSessionAuth + requireOrgAccess | Course learner list |
| GET | `/:orgId/quiz-breakdown` | withSessionAuth + requireOrgAccess | Quiz score breakdown |
| GET | `/:orgId/quiz-score-range/:range` | withSessionAuth + requireOrgAccess | Quiz score range detail |

#### Services / Business Logic

| Service File | Purpose |
|-------------|---------|
| `server/services/analyticsService.ts` | MRR/ARR calculations, subscription health metrics, revenue breakdown, churn analysis, payment trends |
| `server/services/platformAnalyticsService.ts` | Platform-wide analytics for SuperAdmin: org metrics, user growth, revenue, CSV report generation |

#### Frontend Components

| Component | Path | Purpose |
|-----------|------|---------|
| Reports | `client/src/pages/Reports.tsx` | Reports dashboard with tabs and charts |
| OrganizationAnalytics | `client/src/pages/OrganizationAnalytics.tsx` | Organization-level analytics |
| AdminDashboard | `client/src/pages/AdminDashboard.jsx` | Admin overview dashboard |
| OrgAdminDashboard | `client/src/pages/OrgAdminDashboard.tsx` | OrgAdmin-specific dashboard |
| TeacherDashboard | `client/src/pages/TeacherDashboard.tsx` | Teacher dashboard |
| StudentDashboard | `client/src/pages/StudentDashboard.tsx` | Student/learner dashboard |
| StudentInsightsTab | `client/src/components/StudentInsightsTab.tsx` | Student insights panel |
| StudentPerformanceTab | `client/src/components/StudentPerformanceTab.tsx` | Performance details tab |
| StudentProgressWidget | `client/src/components/StudentProgressWidget.tsx` | Progress widget |
| StudentRangeModal | `client/src/components/StudentRangeModal.tsx` | Score range drill-down modal |
| DrilldownModal | `client/src/components/DrilldownModal.tsx` | Data drill-down modal |
| EngagementPerformanceModal | `client/src/components/EngagementPerformanceModal.tsx` | Engagement metrics |

**Implementation Status**: ✅ **IMPLEMENTED**

---

### 3.4 Enterprise Security & Multi-Tenancy (Slide: "Enterprise Security")

**Slide Reference**: Enterprise Security — "Multi-Tenant Isolation & RBAC"  
**Feature Description**: Session-based authentication with PostgreSQL session store, multi-tenant isolation via middleware, RBAC with 5-tier role hierarchy, account security features (lockout after failed attempts, email verification, password reset with tokens), session invalidation via version increment, and comprehensive audit logging.

#### Database Tables

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `sessions` | sid, sess (JSONB), expire | PostgreSQL session store |
| `users` | id, email, password (bcrypt), name, isAdmin, isSuperAdmin, isLocked, isDisabled, failedLoginAttempts, lockedUntil, emailVerified, emailVerificationToken, emailVerificationExpires, passwordResetToken, passwordResetExpires, sessionVersion, avatar, timezone, preferredCurrency | User accounts with security fields |
| `organizations` | id, name, type (education/business/elearning), inviteCode, joinCode, subscriptionStatus, pricingTier, isActive, isDemo, isGeneralOrg, isShowcaseOrg, trialStartDate, trialEndDate, maxSeats | Organization entities |
| `userOrganizationRoles` | userId, organizationId, role (org_admin/teacher/team_lead/student/employee) | Role assignments per org |
| `userOrganizationAssignments` | userId, organizationId, unitId, subUnitId, teamId | Hierarchy placement |
| `joinRequests` | userId, organizationId, status (pending/approved/denied), unitId, subUnitId, teamId, message | Join request workflow |
| `joinRequestApprovalTokens` | joinRequestId, token, expiresAt, usedAt, approvedBy | Email-based approval tokens |
| `lessonAccessLogs` | lessonId, userId, actionType, ipAddress, userAgent, metadata | Access audit trail |
| `reviewModerationActions` | reviewId, moderatorId, action (approve/reject/flag), reason, actionDate | Content moderation audit |
| `financialAuditLog` | id, entityType, entityId, action, details, performedBy | Financial operation audit |
| `licenseFlagAudit` | flagKey, action, performedBy, details | Feature flag change audit |

#### Middleware Stack

**Primary Authentication** (`server/middleware/sessionAuthMiddleware.ts`):

| Export | Function | Description |
|--------|----------|-------------|
| `withSessionAuthMiddleware` | Dual-path authentication | Checks cached session context (if feature flag `SESSION_AUTH_ENABLED` is on) OR falls back to database lookup. Validates `sessionVersion` against DB to detect forced re-auth. |
| `resolveEffectiveOrganization` | 4-source org resolution | Priority: (1) Impersonated org → (2) `x-organization-id` header → (3) Primary org from session → (4) Fallback to first org |
| `RequestWithEffectiveOrg` | Type extension | Request with `effectiveOrg` property |

**Organization Isolation** (`server/middleware/orgIsolationMiddleware.ts`):

| Export | Function | Description |
|--------|----------|-------------|
| `enforceOrgIsolation(options?)` | Parameter tampering prevention | Validates that org IDs in request params/body/query match user's effective org. Blocks cross-org access attempts. Supports `skipIfSuperAdminNoImpersonation` option. |

**Role Guards** (`server/adminAuth.ts`):

| Export | Required Role | Description |
|--------|--------------|-------------|
| `isAdmin` | OrgAdmin or SuperAdmin | Checks session context or DB lookup for admin role |
| `isSuperAdmin` | SuperAdmin only | Platform-wide administrative access |
| `isOrgAdmin` | OrgAdmin | Organization-level admin |
| `isAuthenticated` | Any authenticated user | Basic authentication check |

**Tenant Guards** (`server/tenantMiddleware.ts`):

| Export | Required Role | Description |
|--------|--------------|-------------|
| `isTeacherOrAdmin` | Teacher, OrgAdmin, or SuperAdmin | Content creation access |
| `hasOrgAccess` | Any org member | Organization membership verification |
| `validateJoinRequestAccess` | Admin for target org | Join request management |

**Trial Enforcement** (`server/middleware/trialLockoutMiddleware.ts`):
- Blocks access to premium features when trial has expired

**Usage Limits** (`server/usageLimitMiddleware.ts`):
- Enforces per-org usage limits based on subscription tier

#### Session Configuration (`server/routes/shared.ts`)

| Setting | Value | Notes |
|---------|-------|-------|
| Session Store | `connect-pg-simple` | PostgreSQL-backed with dedicated session pool |
| Cookie Name | `connect.sid` | Standard Express session cookie |
| Max Age | 4 hours (14,400,000ms) | Session TTL |
| httpOnly | `true` | Prevents JavaScript access |
| sameSite | `lax` | CSRF protection |
| secure | `true` in production | HTTPS-only cookies |
| SESSION_SECRET | Required in production | Fail-closed — app refuses to start without it |
| Session Context | Cached JSONB | Contains: `primaryOrganization`, `organizations` (max 10), `effectiveRole`, `subscription`, `sessionVersion`, `userPreferences`, `impersonatedOrganization` |

#### Backend Routes (`server/routes/authRoutes.ts` — 18 endpoints, 1,380 lines)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | Public | User registration with optional org invite code |
| POST | `/api/auth/login` | Public | Login with failed attempt tracking and lockout |
| POST | `/api/auth/logout` | Authenticated | Session destruction |
| GET | `/api/auth/user` | withSessionAuth + withOrgContext | Get current user with org context |
| GET | `/api/auth/validate-join-code` | Public | Validate organization join code |
| GET | `/api/auth/subjects-for-grade` | Public | Get subjects for grade level |
| POST | `/api/auth/forgot-password` | Public | Initiate password reset (rate-limited) |
| GET | `/api/auth/verify-reset-token/:token` | Public | Validate reset token |
| POST | `/api/auth/reset-password` | Public | Execute password reset |
| POST | `/api/auth/verify-email` | Public | Verify email address |
| POST | `/api/auth/resend-verification` | Public | Resend verification email |
| GET | `/api/auth/verification-status` | Public | Check verification status |
| POST | `/api/auth/refresh` | Authenticated | Refresh session |
| POST | `/api/auth/refresh-context` | withSessionAuth | Refresh session context |
| GET | `/api/internal/session-metrics` | isAdmin | Session performance metrics |
| GET | `/api/internal/session-health` | isSuperAdmin | Session health dashboard |
| POST | `/api/internal/session-health/reset` | isSuperAdmin | Reset health counters |
| GET | `/api/internal/session-health/summary` | isSuperAdmin | Health summary |

#### Services / Business Logic

| Service File | Purpose |
|-------------|---------|
| `server/services/passwordResetService.ts` | Secure token generation (crypto.randomBytes), token validation with expiry, bcrypt password hashing (salt rounds: 10), in-memory rate limiter per email and IP |
| `server/services/emailVerificationService.ts` | Verification token management, token expiry enforcement |
| `server/services/sessionInvalidationService.ts` | Force re-auth by incrementing user's `sessionVersion` field, causing all existing sessions to fail validation |
| `server/services/sessionContextService.ts` | Session enrichment: builds context object with org/role/subscription data, caches in session store |

#### Monitoring

| File | Purpose |
|------|---------|
| `server/monitoring/authQueryTracker.ts` | Tracks auth-related database query counts and latencies |
| `server/monitoring/sessionHealthMonitor.ts` | Monitors session cache hit rates, context enrichment latencies, session sizes |
| `server/monitoring/performanceMonitor.ts` | Request duration tracking, slow endpoint detection |
| `server/monitoring/queryLogger.ts` | Database query logging and slow query detection |

#### Frontend Components

| Component | Path | Purpose |
|-----------|------|---------|
| Login | `client/src/pages/login.jsx` | Login form with error handling |
| Register | `client/src/pages/register.jsx` | Registration with invite code support |
| ForgotPassword | `client/src/pages/ForgotPassword.tsx` | Password reset request |
| ResetPassword | `client/src/pages/ResetPassword.tsx` | Password reset form |
| VerifyEmail | `client/src/pages/verify-email.tsx` | Email verification handler |
| UserManagement | `client/src/pages/UserManagement.tsx` | Admin user CRUD |
| ProtectedRoute | `client/src/components/ProtectedRoute.tsx` | Client-side route guard |
| EmailVerificationModal | `client/src/components/EmailVerificationModal.tsx` | Verification prompt |
| ImpersonationBanner | `client/src/components/ImpersonationBanner.tsx` | SuperAdmin impersonation indicator |
| UserMenu | `client/src/components/UserMenu.tsx` | User dropdown with session info |
| OrgSwitcher | `client/src/components/OrgSwitcher.tsx` | Multi-org context switcher |
| NotAuthorized | `client/src/pages/NotAuthorized.tsx` | 403 page |

**Implementation Status**: ✅ **IMPLEMENTED**

---

### 3.5 White-Label Branding (Slide: "White-Label")

**Slide Reference**: White-Label — "Full Platform Customization"  
**Feature Description**: Organizations can fully customize the platform appearance including: color tokens (primary, secondary, accent, background, text, border), logos, favicons, font selection (heading and body), gradient backgrounds, custom copy text, support URLs, email branding, and custom domains with DNS TXT record verification.

#### Database Tables

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `brandingThemes` (table: `branding_themes`) | organizationId, orgName, status (draft/published), presetId, tokens (JSONB color map), logoUrl, faviconUrl, fontHeading, fontBody, supportUrl, supportEmail, termsUrl, privacyUrl, allowEmailBranding, enableContrastCorrections, gradientEnabled, gradientFrom, gradientTo, gradientAngle, customCopy (JSONB) | Full theme configuration |
| `organizationDomains` (table: `organization_domains`) | organizationId, domain, verified, verificationToken, isActive, verifiedAt | Custom domain with DNS verification |

#### Backend Routes (`server/brandingRoutes.ts` — 21 endpoints, 1,295 lines)

**Public/Resolved:**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/public/branding/:folder/:filename` | Public | Serve branding assets (logos, favicons) |
| GET | `/api/theme/resolved` | Public | Resolve theme by domain or org |
| GET | `/api/branding/manifest` | Public | Dynamic PWA manifest.json |
| GET | `/api/theme/embed-styles` | Public | CSS custom properties for embedding |

**Org Admin:**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/theme` | isOrgAdmin | Get current org theme |
| POST | `/api/theme` | isOrgAdmin | Create/update theme |
| POST | `/api/theme/activate` | isOrgAdmin | Publish/activate theme |
| POST | `/api/theme/reset` | isOrgAdmin | Reset theme to defaults |
| POST | `/api/branding/upload` | isOrgAdmin | Upload logo/favicon |

**Domains:**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/domains` | isOrgAdmin | List custom domains |
| POST | `/api/domains` | isOrgAdmin | Add custom domain |
| DELETE | `/api/domains/:id` | isOrgAdmin | Remove domain |
| POST | `/api/domains/:id/verify` | isOrgAdmin | Verify domain via DNS TXT |
| POST | `/api/domains/:id/toggle-active` | isOrgAdmin | Toggle domain active status |

**SuperAdmin:**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/superadmin/branding/themes` | isSuperAdmin | List all themes |
| GET | `/api/superadmin/branding/org/:orgId/theme` | isSuperAdmin | Get specific org theme |
| POST | `/api/superadmin/branding/org/:orgId/theme` | isSuperAdmin | Set org theme |
| GET | `/api/superadmin/branding/platform` | isSuperAdmin | Platform default theme |
| POST | `/api/superadmin/branding/platform` | isSuperAdmin | Update platform theme |
| POST | `/api/superadmin/branding/platform/activate` | isSuperAdmin | Activate platform theme |
| POST | `/api/superadmin/branding/platform/reset` | isSuperAdmin | Reset platform theme |

#### Supporting Shared Modules

| Module | Path | Purpose |
|--------|------|---------|
| Branding Tokens | `shared/brandingTokens.ts` | Token definitions and defaults |
| Theme Token Builder | `shared/themeTokenBuilder.ts` | Constructs full token set from partial input |
| Token Section Mapping | `shared/tokenSectionMapping.ts` | Maps tokens to UI sections |
| Theme Presets | `client/src/config/themePresets.ts` | Preset theme configurations |

#### Frontend Components

| Component | Path | Purpose |
|-----------|------|---------|
| ThemeEditor | `client/src/pages/ThemeEditor.tsx` | Theme editor page |
| BrandEditorShell | `client/src/components/brand-editor/BrandEditorShell.tsx` | Main brand editor container |
| ControlRail | `client/src/components/brand-editor/ControlRail.tsx` | Settings sidebar |
| ColorPicker | `client/src/components/brand-editor/ColorPicker.tsx` | Color customization |
| ThemeGallery | `client/src/components/brand-editor/ThemeGallery.tsx` | Preset theme gallery |
| PreviewTabs | `client/src/components/brand-editor/PreviewTabs.tsx` | Preview tab navigation |
| PreviewFrame | `client/src/components/brand-editor/PreviewFrame.tsx` | Preview container |
| **Preview Components** (11): | `client/src/components/brand-editor/previews/` | |
| — PreviewHomepage | `previews/PreviewHomepage.tsx` | Homepage preview |
| — PreviewCourseBrowser | `previews/PreviewCourseBrowser.tsx` | Course browser preview |
| — PreviewLessonViewer | `previews/PreviewLessonViewer.tsx` | Lesson viewer preview |
| — PreviewQuizLobby | `previews/PreviewQuizLobby.tsx` | Quiz lobby preview |
| — PreviewGameQuiz | `previews/PreviewGameQuiz.tsx` | Game quiz preview |
| — PreviewCertificates | `previews/PreviewCertificates.tsx` | Certificate preview |
| — PreviewEmail | `previews/PreviewEmail.tsx` | Email template preview |
| — PreviewCommerce | `previews/PreviewCommerce.tsx` | Commerce/pricing preview |
| — PreviewInvoice | `previews/PreviewInvoice.tsx` | Invoice preview |
| — PreviewAdminPanel | `previews/PreviewAdminPanel.tsx` | Admin panel preview |
| — PreviewUIKit | `previews/PreviewUIKit.tsx` | UI kit component preview |
| EmbedThemeLoader | `client/src/components/EmbedThemeLoader.tsx` | Theme CSS injection |
| BrandingContext | `client/src/contexts/BrandingContext.tsx` | React context for theme |
| ThemeCard | `client/src/components/ThemeCard.tsx` | Theme selection card |
| ThemeGalleryPanel | `client/src/components/ThemeGalleryPanel.tsx` | Theme gallery panel |
| ThemePreviewPanel | `client/src/components/ThemePreviewPanel.tsx` | Theme preview panel |

**Implementation Status**: ✅ **IMPLEMENTED**

---

### 3.6 Organization Management (Slide: "Multi-Organization")

**Slide Reference**: Multi-Organization — "Organization Lifecycle & Hierarchy"  
**Feature Description**: Full organization lifecycle management: registration wizard with 3-level hierarchy (Units/Departments → Sub-Units → Teams), join request workflow with email-based approval, user management with role assignment, subscription/billing management, seat licensing with overage handling, organization credit wallet, and SuperAdmin impersonation for support.

#### Database Tables

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `organizations` | id, name, type, inviteCode, joinCode, subscriptionStatus, pricingTier, isActive, isDemo, isGeneralOrg, isShowcaseOrg, trialStartDate, trialEndDate, maxSeats, customTerminology (JSONB) | Organization entity |
| `organizationUnits` | id, organizationId, name, code, sortOrder | Departments (Level 1) |
| `organizationSubUnits` | id, unitId, organizationId, name, code, sortOrder | Sub-departments (Level 2) |
| `organizationTeams` | id, subUnitId, organizationId, name, code, joinCode, sortOrder | Teams (Level 3) |
| `userOrganizationRoles` | userId, organizationId, role | User role per org |
| `userOrganizationAssignments` | userId, organizationId, unitId, subUnitId, teamId | Hierarchy placement |
| `joinRequests` | userId, organizationId, status, unitId, subUnitId, teamId, message | Join workflow |
| `joinRequestApprovalTokens` | joinRequestId, token, expiresAt, usedAt, approvedBy | Email approval |
| `organizationUsageLimits` | organizationId, limitType, currentUsage, maxAllowed | Usage limits |
| `organizationLicenseSettings` | organizationId, maxSeats, seatEnforcementEnabled | Seat configuration |
| `organizationLicenses` | organizationId, licenseTier, status, startDate, endDate | License management |

#### Backend Routes (`server/routes/orgRoutes.ts` — 62 endpoints, 4,382 lines)

**Registration & Context:**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/org/register` | Public | Organization registration wizard |
| GET | `/api/organizations/current` | withSessionAuth | Current org context |

**Credit Wallet:**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/org-wallet/:orgId/balance` | withSessionAuth | Credit balance |
| GET | `/api/org-wallet/:orgId/transactions` | Public | Transaction history |
| GET | `/api/org-wallet/:orgId/summary` | Public | Wallet summary |
| GET | `/api/org-wallet/:orgId/combined-transactions` | withSessionAuth | Combined transaction view |
| GET | `/api/org-wallet/:orgId/combined-summary` | withSessionAuth | Combined summary |
| POST | `/api/admin/org-credits/:orgId/adjust` | isSuperAdmin | Credit adjustment |
| PATCH | `/api/admin/org-credits/:orgId/settings` | isSuperAdmin | Update credit settings |
| GET | `/api/admin/org-credits` | isSuperAdmin | List all org credits |

**Join Requests:**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/org/:orgId/join-requests` | isTeacherOrAdmin | List join requests |
| GET | `/api/org/:orgId/join-requests/pending-count` | isTeacherOrAdmin | Pending count |
| GET | `/api/org/join-requests/approve-via-token/:token` | Public | Email-based approval |
| POST | `/api/org/join-requests/:id/approve` | validateJoinRequestAccess | Approve request |
| POST | `/api/org/join-requests/:id/deny` | validateJoinRequestAccess | Deny request |
| POST | `/api/org/join-requests/bulk-approve` | isTeacherOrAdmin | Bulk approve |
| POST | `/api/org/join-requests/bulk-deny` | isTeacherOrAdmin | Bulk deny |

**Subscription & Billing:**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/organizations/:id/eligible-packages` | isAuthenticated | List eligible packages |
| GET | `/api/organizations/:id/subscription` | isAuthenticated | Subscription details |
| POST | `/api/organizations/:id/subscribe` | isAuthenticated | Subscribe to plan |
| POST | `/api/organizations/:id/upgrade` | isAuthenticated | Upgrade plan |
| POST | `/api/organizations/:id/schedule-downgrade` | isAuthenticated | Schedule downgrade |
| DELETE | `/api/organizations/:id/scheduled-downgrade` | isAuthenticated | Cancel scheduled downgrade |
| GET | `/api/organizations/:id/seat-utilization` | isAuthenticated | Seat usage |
| GET | `/api/organizations/:id/disabled-users` | isAuthenticated | Disabled users list |
| POST | `/api/organizations/:id/reenable-users` | isAuthenticated | Re-enable users |
| GET | `/api/organizations/:id/downgrade-preview` | isAuthenticated | Downgrade impact preview |
| GET | `/api/org/:orgId/billing` | isTeacherOrAdmin | Billing details |
| GET | `/api/org/:orgId/billing/audit-log` | isTeacherOrAdmin | Billing audit log |

**Hierarchy Management:**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/organization/units` | withSessionAuth | List departments |
| GET | `/api/organization/sub-units/:unitId` | withSessionAuth | List sub-units |
| GET | `/api/organization/teams/:subUnitId` | withSessionAuth | List teams |
| GET | `/api/organization/all-teams/:orgId` | withSessionAuth | All teams in org |
| POST | `/api/organization/teams` | withSessionAuth | Create team |
| PUT | `/api/organization/teams/:teamId` | withSessionAuth | Update team |
| DELETE | `/api/organization/teams/:teamId` | withSessionAuth | Delete team |
| POST | `/api/organization/teams/reorder` | withSessionAuth | Reorder teams |
| GET | `/api/organization/hierarchy/:orgId` | withSessionAuth | Full hierarchy tree |
| GET | `/api/organization/:orgId/hierarchy/:nodeType/:nodeId/members` | withSessionAuth | Node members |
| GET | `/api/organization/:orgId/search` | withSessionAuth | Search hierarchy |
| GET | `/api/organization/:orgId/users` | withSessionAuth | List org users |
| POST | `/api/organization/:orgId/hierarchy/:nodeType/:nodeId/assign` | withSessionAuth | Assign user to node |
| DELETE | `/api/organization/:orgId/hierarchy/:nodeType/:nodeId/users/:userId` | withSessionAuth | Remove user from node |
| POST | `/api/organization/:orgId/departments` | withSessionAuth | Create department |
| PATCH | `/api/organization/:orgId/departments/:deptId` | withSessionAuth | Update department |
| DELETE | `/api/organization/:orgId/departments/:deptId` | withSessionAuth | Delete department |
| POST | `/api/organization/:orgId/departments/:deptId/units` | withSessionAuth | Create sub-unit |
| PATCH | `/api/organization/:orgId/units/:unitId` | withSessionAuth | Update sub-unit |
| DELETE | `/api/organization/:orgId/units/:unitId` | withSessionAuth | Delete sub-unit |
| POST | `/api/organization/:orgId/units/:unitId/teams` | withSessionAuth | Create team |
| PATCH | `/api/organization/:orgId/teams/:teamId` | withSessionAuth | Update team |
| DELETE | `/api/organization/:orgId/teams/:teamId` | withSessionAuth | Delete team |
| POST | `/api/organization/:orgId/teams/:teamId/regenerate-code` | withSessionAuth | Regenerate join code |
| GET | `/api/organization/:orgId/teams/:teamId/members` | withSessionAuth | Team members |
| GET | `/api/organization/:orgId/settings` | withSessionAuth | Org settings |
| PATCH | `/api/organization/:orgId/settings` | withSessionAuth | Update org settings |
| GET | `/api/organization/:orgId/users/:userId/details` | withSessionAuth | User detail with hierarchy |
| POST | `/api/organization/move-user` | withSessionAuth | Move user to different node |
| GET | `/api/organization/unit-subjects` | withSessionAuth | Unit subject associations |

#### Services / Business Logic

| Service File | Purpose |
|-------------|---------|
| `server/services/joinRequestApprovalService.ts` | Join request processing with email notifications |
| `server/services/organizationCreditService.ts` | Organization credit wallet management |
| `server/services/seatPolicyService.ts` | Seat limit enforcement and overage handling |
| `server/services/userSeatManagementService.ts` | User enable/disable based on seat limits |
| `server/services/orgTypePolicy.ts` | Organization type policy enforcement |
| `server/services/subscriptionService.ts` | Subscription lifecycle management |

#### Frontend Components

| Component | Path | Purpose |
|-----------|------|---------|
| OrgRegistrationWizard | `client/src/pages/OrgRegistrationWizard.tsx` | Multi-step org registration |
| OrgManagementHub | `client/src/pages/OrgManagementHub.tsx` | Central org management |
| OrgStructureManager | `client/src/pages/OrgStructureManager.tsx` | Hierarchy management |
| UnifiedManagementHub | `client/src/pages/UnifiedManagementHub.tsx` | Unified management view |
| UserManagement | `client/src/pages/UserManagement.tsx` | User CRUD for org admins |
| OrgUserDetail | `client/src/pages/OrgUserDetail.tsx` | Individual user detail |
| JoinRequests | `client/src/pages/JoinRequests.tsx` | Join request management |
| OrgCreditUsageReportPage | `client/src/pages/OrgCreditUsageReportPage.tsx` | Credit usage reports |
| SuperAdminImpersonate | `client/src/pages/SuperAdminImpersonate.tsx` | Impersonation management |
| OrganizationTreeView | `client/src/components/OrganizationTreeView.tsx` | Hierarchy tree component |
| OrgSwitcher | `client/src/components/OrgSwitcher.tsx` | Organization context switcher |
| OrgCreditUsageReport | `client/src/components/OrgCreditUsageReport.tsx` | Credit usage visualization |
| BulkUserManager | `client/src/components/BulkUserManager.tsx` | Bulk user operations |
| JoinRequestStatusBanner | `client/src/components/JoinRequestStatusBanner.tsx` | Status notification |
| JoinRequestDeniedModal | `client/src/components/JoinRequestDeniedModal.tsx` | Denial notification |
| Terminology | `client/src/components/Terminology.tsx` | Custom terminology component |
| ExpiredTrialBanner | `client/src/components/ExpiredTrialBanner.tsx` | Trial expiry notification |
| TrialWarningBanner | `client/src/components/TrialWarningBanner.tsx` | Trial warning |
| TrialStatusIndicator | `client/src/components/TrialStatusIndicator.tsx` | Trial status badge |

**Implementation Status**: ✅ **IMPLEMENTED**

---

### 3.7 Course Assignment & Progress Tracking

**Slide Reference**: Engage Pillar — "Course Assignments & Progress"  
**Feature Description**: Scope-based course assignments (user/department/unit/team/organization), with mandatory/optional flags, due dates, audience targeting (learner/teacher), automatic progress tracking through lesson completion, quiz gating (first lesson exempt), certificate issuance on completion, and daily activity streaks.

#### Database Tables

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `courseAssignments` | courseId, organizationId, assignmentScope (organization/department/unit/team/user), userId, unitId, subUnitId, teamId, audience (learner/teacher), mandatory, dueDate, assignedBy | Assignment rules with scope cascade |
| `courseProgress` | courseId, userId, organizationId, status (not_started/in_progress/completed), completedLessons, totalLessons, percentComplete, startedAt, completedAt | Course-level progress |
| `lessonProgress` | lessonId, userId, organizationId, status (not_started/in_progress/completed), percentComplete, secondsSpent, slidesViewedCount, totalSlides, startedAt, completedAt | Lesson-level progress with time |
| `lessonProgressSlides` | lessonProgressId, slideIndex, viewedAt, timeSpentSeconds | Per-slide viewing data |
| `lessonAssignments` | lessonId, organizationId, userId, unitId, subUnitId, teamId, audience, mandatory | Lesson-level assignments |
| `lessonScopeAssignments` | lessonId, organizationId, assignmentScope, userId, unitId, subUnitId, teamId | Lesson scope assignments |
| `certificates` | certificateId, certificateType (lesson/course), userId, organizationId, lessonId, courseId, pdfStoragePath, xpEarned, shareToken, issuedAt | Completion certificates |
| `dailyStreaks` | userId, organizationId, currentStreak, longestStreak, lastActivityDate | Activity streak tracking |
| `userCourseEnrollments` | userId, courseId, organizationId, enrolledAt | Course enrollment records |
| `userCourseLessonProgress` | userId, courseId, lessonId, status, percentComplete | Per-lesson progress in course context |

#### Services / Business Logic

| Service File | Purpose |
|-------------|---------|
| `server/services/lessonProgressService.ts` | Lesson completion tracking with invariants: `completedAt` MUST be set when status = "completed", certificate issuance idempotent via UNQ constraint, streak updates use normalized dates, quiz gating (first lesson exempt) |
| `server/services/courseAssignmentService.ts` | Assignment resolution: resolves which courses a user is assigned to based on scope cascade (user → team → sub-unit → unit → department → organization). Supports enriched assignments with course/unit/team names. |
| `server/services/courseCompletionService.ts` | Course completion detection: checks all lessons completed, triggers course certificate generation |
| `server/services/certificateService.ts` | PDF certificate generation using organization branding (colors, logo), unique certificate IDs, share tokens for public verification |
| `server/services/courseContextService.ts` | Course context enrichment |

#### Frontend Components

| Component | Path | Purpose |
|-----------|------|---------|
| CourseAssignments | `client/src/pages/CourseAssignments.tsx` | Assignment management for admins |
| MyCourses | `client/src/pages/MyCourses.tsx` | Student's assigned courses |
| CourseLessons | `client/src/pages/CourseLessons.tsx` | Course lesson list with progress |
| LessonViewer | `client/src/pages/LessonViewer.tsx` | Lesson viewing with progress tracking |
| CertificateGallery | `client/src/pages/CertificateGallery.tsx` | Certificate collection |
| AssignmentWizard | `client/src/components/AssignmentWizard.tsx` | Assignment creation wizard |
| CourseAssignmentModal | `client/src/components/CourseAssignmentModal.tsx` | Assignment modal |
| LessonAssignmentWizard | `client/src/components/LessonAssignmentWizard.tsx` | Lesson assignment wizard |

**Implementation Status**: ✅ **IMPLEMENTED**

---

### 3.8 Notifications & Email System

**Slide Reference**: Platform Features — "Notifications & Communication"  
**Feature Description**: In-app notification center with real-time updates, email notifications via MailerSend with branded templates, notification preferences per user, and email scheduling.

#### Database Tables

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `userNotifications` | userId, type, title, message, metadata (JSONB), isRead, link, createdAt | In-app notification queue |
| `notificationPreferences` | userId, emailNotifications, inAppNotifications, coursePurchaseNotifications, courseAssignmentNotifications, quizCompletionNotifications, achievementNotifications | Per-user notification settings |
| `emailLogs` | id, recipientEmail, subject, templateId, status (sent/failed/bounced), sentAt | Email delivery tracking |

#### Services / Business Logic

| Service File | Purpose |
|-------------|---------|
| `server/services/notificationService.ts` | In-app notification creation, marking as read, preference-aware delivery |
| `server/services/emailTemplates.ts` | Invoice reminders, payment success, subscription changes, credit confirmations, join request notifications |
| `server/services/mailerSendService.ts` | MailerSend API client with retry logic, template variable injection, attachment support |
| `server/services/emailSchedulerService.ts` | Scheduled email delivery |
| `server/services/packageEmailService.ts` | Package-specific email templates |

#### Backend Routes (in `server/routes/miscRoutes.ts`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/notifications` | withSessionAuth | Get user notifications |
| POST | `/api/notifications/:id/read` | withSessionAuth | Mark notification as read |
| GET | `/api/notifications/unread-count` | withSessionAuth | Unread notification count |

#### Frontend Components

| Component | Path | Purpose |
|-----------|------|---------|
| NotificationCenter | `client/src/pages/NotificationCenter.tsx` | Notification center page |

**Implementation Status**: ✅ **IMPLEMENTED**

---

### 3.9 Marketplace & Payments

**Slide Reference**: Platform Features — "Marketplace & Commerce"  
**Feature Description**: Course marketplace with multi-currency support (ZAR/USD/EUR), exchange rate management with live API + manual overrides, commission calculations, YOCO payment gateway integration (test and live modes), webhook handling with deduplication, version-based course upgrades, and refund processing.

#### Database Tables

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `coursePurchases` | userId, courseId, organizationId, amount, currency, status, checkoutId, yocoPaymentId, commissionAmount, exchangeRate | Purchase records |
| `courseVersions` | courseId, versionNumber, changes, publishedAt | Course version tracking |
| `courseVersionUpgrades` | userId, courseId, fromVersion, toVersion | Version upgrade records |
| `courseVersionNotifications` | userId, courseId, versionNumber, isRead | Version update notifications |
| `currencyConversionRates` | fromCurrency, toCurrency, rate, source, lastUpdated | Exchange rates |
| `exchangeRateHistory` | fromCurrency, toCurrency, rate, source, recordedAt | Rate history |
| `subscriptions` | organizationId, planId, status, startDate, endDate, interval | Subscription records |
| `subscriptionInvoices` | subscriptionId, amount, currency, status, dueDate, paidAt | Invoice records |
| `subscriptionEvents` | subscriptionId, eventType, metadata | Subscription event log |
| `elearningSubscriptionPlans` | name, priceMonthly, priceAnnual, features, maxCourses, maxStudents | E-learning plans |
| `paymentIntents` | id, type, amount, currency, status, userId, organizationId, metadata | Payment intent records |
| `paymentFulfillments` | paymentIntentId, status, fulfilledAt | Payment fulfillment |
| `paymentWebhookEvents` | webhookId, eventType, payload, processedAt, idempotencyKey | Webhook deduplication |
| `paymentTransactions` | id, amount, currency, type, status, userId | Transaction records |
| `creditOrders` | userId, amount, currency, status, packageId | Credit purchase orders |
| `postFulfillmentJobs` | paymentIntentId, jobType, status, attempts, lastError | Post-payment async jobs |
| `courseRefunds` | purchaseId, userId, reason, amount, status, processedAt | Refund records |
| `coursePriceHistory` | courseId, price, currency, changedBy, changedAt | Price change audit |
| `platformPaymentSettings` | yocoMode, testSecretKey, liveSecretKey, webhookSecret | Payment config |

#### Backend Routes (`server/routes/paymentsRoutes.ts` — 28 endpoints, 2,217 lines)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/currency/rates` | Public | Get exchange rates |
| GET | `/api/credit-packages` | isTeacherOrAdmin | List credit packages |
| POST | `/api/credit-packages/:packageId/purchase` | isTeacherOrAdmin | Purchase credit package |
| POST | `/api/courses/:courseId/checkout` | withSessionAuth | Create course checkout |
| POST | `/api/payments/create-checkout` | withSessionAuth | Create payment checkout |
| GET | `/api/payments/verify/:checkoutId` | withSessionAuth | Verify payment |
| POST | `/api/webhooks/yoco` | Public | YOCO webhook handler |
| POST | `/api/payments/webhook` | Public | General payment webhook |
| POST | `/api/webhooks/mailersend` | Public | MailerSend webhook |
| GET | `/api/payments/status` | withSessionAuth | Payment status |
| GET | `/api/payments/yoco-mode` | withSessionAuth | Current YOCO mode |
| GET | `/api/purchases/:checkoutId/confirmation` | withSessionAuth | Purchase confirmation |
| GET | `/api/payment-intents/:intentId/confirmation` | withSessionAuth | Intent confirmation |
| POST | `/api/subscriptions/:id/cancel` | withSessionAuth | Cancel subscription |
| POST | `/api/subscriptions/:id/undo-cancel` | withSessionAuth | Undo cancellation |
| GET | `/api/subscriptions/:id/cancellation-status` | withSessionAuth | Cancellation status |
| POST | `/api/subscriptions` | isSuperAdmin | Create subscription |
| GET | `/api/subscriptions/:id` | withSessionAuth | Get subscription |
| GET | `/api/subscriptions` | withSessionAuth | List subscriptions |
| PATCH | `/api/subscriptions/:id` | withSessionAuth | Update subscription |
| POST | `/api/subscription-plans/:planId/purchase` | withSessionAuth | Purchase plan |
| DELETE | `/api/subscriptions/:id/cancel` | withSessionAuth | Delete/cancel subscription |
| GET | `/api/invoices` | withSessionAuth | List invoices |
| GET | `/api/credit-orders` | withSessionAuth | List credit orders |
| GET | `/api/webhooks/events` | isSuperAdmin | Webhook event log |
| GET | `/api/invoices/:id/download` | withSessionAuth | Download invoice PDF |
| GET | `/api/receipts/:id/download` | withSessionAuth | Download receipt PDF |
| GET | `/api/course-receipts/:id/download` | withSessionAuth | Download course receipt |

#### Services / Business Logic

| Service File | Purpose |
|-------------|---------|
| `server/services/paymentService.ts` | YOCO payment integration, checkout creation |
| `server/services/paymentOrchestratorService.ts` | Payment flow orchestration |
| `server/services/paymentRouter.ts` | Payment routing logic |
| `server/services/purchaseService.ts` | Course purchase processing |
| `server/services/invoiceService.ts` | Invoice generation and PDF rendering |
| `server/services/subscriptionService.ts` | Subscription lifecycle |
| `server/services/currencyService.ts` | Currency conversion |
| `server/services/exchangeRateService.ts` | Exchange rate fetching and caching |
| `server/services/creditOrderService.ts` | Credit order processing |
| `server/services/courseRefundService.ts` | Refund processing |
| `server/services/webhookDeduplicationService.ts` | Webhook idempotency |
| `server/services/webhookReplayProtection.ts` | Webhook replay attack prevention |
| `server/services/yocoWebhookVerifier.ts` | YOCO webhook signature verification |
| `server/services/postFulfillmentJobService.ts` | Post-payment async jobs |
| `server/workers/postFulfillmentWorker.ts` | Async job processor |
| `server/services/reconciliationService.ts` | Payment reconciliation |
| `server/services/billingScheduler.ts` | Billing cycle automation |

#### Frontend Components

| Component | Path | Purpose |
|-----------|------|---------|
| CoursePurchase | `client/src/pages/CoursePurchase.tsx` | Course purchase flow |
| CoursePurchaseSuccess | `client/src/pages/CoursePurchaseSuccess.tsx` | Purchase confirmation |
| CourseRefunds | `client/src/pages/CourseRefunds.tsx` | Refund management |
| BillingDashboard | `client/src/pages/BillingDashboard.tsx` | Billing overview |
| BillingAuditLog | `client/src/pages/BillingAuditLog.tsx` | Billing audit trail |
| InvoiceHistory | `client/src/pages/InvoiceHistory.tsx` | Invoice listing |
| PurchaseHistory | `client/src/pages/PurchaseHistory.tsx` | Purchase history |
| CurrencyManagement | `client/src/pages/CurrencyManagement.tsx` | Currency/rate management |
| SubscriptionManagement | `client/src/pages/SubscriptionManagement.tsx` | Subscription management |
| SubscriptionAdminConsole | `client/src/pages/SubscriptionAdminConsole.tsx` | Admin subscription console |
| CreditPurchase | `client/src/pages/CreditPurchase.tsx` | Credit purchase flow |
| BuyCredits | `client/src/pages/BuyCredits.tsx` | Buy credits page |
| PlatformPricing | `client/src/pages/PlatformPricing.tsx` | Pricing page |
| WebhookAdmin | `client/src/pages/WebhookAdmin.tsx` | Webhook management |
| CheckoutConversionConfirmation | `client/src/components/CheckoutConversionConfirmation.tsx` | Checkout conversion |
| PurchaseConfirmationModal | `client/src/components/PurchaseConfirmationModal.tsx` | Purchase confirmation |
| CurrencyConversionTooltip | `client/src/components/CurrencyConversionTooltip.tsx` | Currency tooltip |
| CurrencyIndicatorBadge | `client/src/components/CurrencyIndicatorBadge.tsx` | Currency badge |
| CurrencyPreferenceModal | `client/src/components/CurrencyPreferenceModal.tsx` | Currency preference |
| ExchangeRateFreshness | `client/src/components/ExchangeRateFreshness.tsx` | Rate freshness indicator |
| SuperAdminPaymentModeModal | `client/src/components/SuperAdminPaymentModeModal.tsx` | YOCO mode toggle |
| BillingCard | `client/src/components/BillingCard.tsx` | Billing info card |
| PricingCTA | `client/src/components/PricingCTA.tsx` | Pricing call-to-action |
| SalesInquiryModal | `client/src/components/SalesInquiryModal.tsx` | Sales inquiry |

**Implementation Status**: ✅ **IMPLEMENTED**

---

### 3.10 Quiz System

**Slide Reference**: Engage Pillar — "Quiz & Assessment Engine"  
**Feature Description**: Quiz collections with multiple-choice cards, AI-generated quizzes from lesson content, timed quiz games, quiz drafts for editing, quiz card explanations with AI-generated term definitions, bulk quiz generation, quiz assignments by scope, progress tracking, and certificate issuance.

#### Database Tables

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `quizCollections` | id, title, organizationId, createdBy, subjectId, gradeLevel, isPublished, isAssigned, passRate, timeLimit | Quiz container |
| `quizCards` | id, collectionId, question, answers (JSONB), correctAnswer, difficulty, tier, explanation | Question cards |
| `quizCardExplanations` | cardId, explanation, termDefinitions | AI-generated explanations |
| `termDefinitions` | id, term, definition, context | Term glossary |
| `explanationTerms` | explanationId, termId | Links explanations to terms |
| `quizCollectionAssignments` | collectionId, organizationId, unitId, subUnitId, teamId, audience | Quiz assignments |
| `activeQuizGames` | gameRoomId, quizId, playerIds, status | Active game sessions |
| `quizGameProgress` | gameRoomId, round, questionId, playerAnswer, isCorrect | Per-round game data |
| `userQuizProgress` | userId, quizId, score, passed, attempts, bestScore, lastAttemptAt | User quiz tracking |
| `quizGameResults` | userId, quizId, score, correctAnswers, totalQuestions, timeTaken | Game results |
| `quizDrafts` | originalQuizId, title, description, cards (JSONB) | Draft quiz editing |
| `bulkQuizGenerationJobs` | organizationId, status, totalQuizzes, completedQuizzes | Bulk generation tracking |
| `quizCreditPricing` | questionCount, creditCost | Credit pricing tiers |
| `lessonQuizLinks` | lessonId, quizId | Quiz-lesson associations |

#### Backend Routes (`server/routes/quizRoutes.ts` — 46 endpoints, 2,802 lines)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/drafts` | withSessionAuth | List quiz drafts |
| POST | `/api/drafts` | withSessionAuth | Create quiz draft |
| GET | `/api/drafts/:id` | withSessionAuth | Get draft detail |
| PATCH | `/api/drafts/:id` | withSessionAuth | Update draft |
| DELETE | `/api/drafts/:id` | withSessionAuth | Delete draft |
| POST | `/api/drafts/:id/publish` | withSessionAuth | Publish draft |
| POST | `/api/quiz-collections/:id/to-draft` | withSessionAuth | Convert to draft |
| GET | `/api/quiz-leaderboard` | withSessionAuth | Quiz leaderboard |
| GET | `/api/quiz-pricing` | withSessionAuth | Get quiz pricing |
| POST | `/api/admin/quiz-collections` | withSessionAuth | Create quiz collection |
| GET | `/api/admin/quiz-collections` | Public | List admin collections |
| GET | `/api/quiz-collections` | withSessionAuth | List user collections |
| GET | `/api/quiz-collections/:id` | withSessionAuth | Get collection detail |
| PUT | `/api/admin/quiz-collections/:id` | withSessionAuth | Update collection |
| DELETE | `/api/admin/quiz-collections/:id` | withSessionAuth | Delete collection |
| POST | `/api/admin/quiz-collections/:id/cards` | withSessionAuth | Add cards to collection |
| POST | `/api/admin/quiz-collections/:id/cards/bulk-csv` | withSessionAuth | Bulk CSV card import |
| GET | `/api/quiz-collections/:id/cards` | withSessionAuth | List collection cards |
| GET | `/api/quiz-cards/:id` | withSessionAuth | Get card detail |
| GET | `/api/quiz-cards/:id/explanation` | Public | Get card explanation |
| POST | `/api/quiz-collections/:id/generate-all-explanations` | withSessionAuth | Bulk explanation generation |
| POST | `/api/quiz-collections/:id/verify-answers` | withSessionAuth | AI answer verification |
| PUT | `/api/admin/quiz-cards/:id` | withSessionAuth | Update card |
| DELETE | `/api/admin/quiz-cards/:id` | withSessionAuth | Delete card |
| PATCH | `/api/quiz-cards/:id/correct-answer` | withSessionAuth | Update correct answer |
| GET | `/api/quiz/assignments` | withSessionAuth | List assignments |
| POST | `/api/quiz/assign` | withSessionAuth | Create assignment |
| DELETE | `/api/quiz/assign/:id` | withSessionAuth | Remove assignment |
| GET | `/api/quiz/assigned` | withSessionAuth | My assigned quizzes |
| GET | `/api/quiz/my-progress` | withSessionAuth | My quiz progress |
| GET | `/api/quiz/completion-status` | withSessionAuth | Completion status |
| GET | `/api/quiz/:quizId/certificate` | withSessionAuth | Get quiz certificate |
| POST | `/api/admin/quiz-collections/:id/assignments` | withSessionAuth | Create quiz assignment |
| GET | `/api/quiz-collections/:id/assignments` | withSessionAuth | List quiz assignments |
| PATCH | `/api/admin/quiz-assignments/:id/availability` | withSessionAuth | Toggle assignment |
| DELETE | `/api/admin/quiz-assignments/:id` | withSessionAuth | Delete assignment |

#### Services

| Service File | Purpose |
|-------------|---------|
| `server/services/quizPricingService.ts` | Quiz generation credit pricing |
| `server/services/quizCourseLinkerService.ts` | Quiz-course linking service |

#### Frontend Components

| Component | Path | Purpose |
|-----------|------|---------|
| QuizWizard | `client/src/pages/QuizWizard.tsx` | Quiz creation wizard |
| QuizCardManager | `client/src/pages/QuizCardManager.tsx` | Card management |
| QuizDraftsPage | `client/src/pages/QuizDraftsPage.tsx` | Draft management |
| QuizLobby | `client/src/pages/QuizLobby.tsx` | Quiz game lobby |
| QuizSinglePlayer | `client/src/pages/QuizSinglePlayer.tsx` | Single player quiz |
| Quiz1v1 | `client/src/pages/Quiz1v1.tsx` | 1v1 quiz game |
| GameLobby | `client/src/pages/GameLobby.jsx` | Game lobby |
| GamePlay | `client/src/pages/GamePlay.jsx` | Game play |
| SinglePlayer | `client/src/pages/SinglePlayer.jsx` | Single player mode |
| MultiPlayer1v1 | `client/src/pages/MultiPlayer1v1.jsx` | Multiplayer 1v1 |
| GameRoom | `client/src/pages/GameRoom.jsx` | Game room |
| GameHistory | `client/src/pages/GameHistory.jsx` | Game history |
| QuizAdminLayout | `client/src/components/QuizAdminLayout.tsx` | Quiz admin layout |
| GamefiedQuizResultModal | `client/src/components/GamefiedQuizResultModal.tsx` | Quiz result modal |
| ExplanationModal | `client/src/components/ExplanationModal.tsx` | Card explanation |
| PremiumGameHeader | `client/src/components/PremiumGameHeader.tsx` | Game header |
| PremiumGameResultModal | `client/src/components/PremiumGameResultModal.tsx` | Premium result |
| EnhancedPlayerTimer | `client/src/components/EnhancedPlayerTimer.tsx` | Quiz timer |
| RoundResultOverlay | `client/src/components/RoundResultOverlay.tsx` | Round result |
| QuizRoundResultModal | `client/src/components/QuizRoundResultModal.tsx` | Round modal |

**Implementation Status**: ✅ **IMPLEMENTED**

---

### 3.11 Credit & Wallet System

**Slide Reference**: Platform Features — "Credit Economy"  
**Feature Description**: Dual credit systems — per-user LP credits for content generation and per-organization credit wallet for organizational spending. Credit purchase packages, hybrid credit service (user + org credits), usage tracking, and admin adjustments.

#### Database Tables

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `userCreditAllocations` | userId, totalCredits, usedCredits, status | User credit balance |
| `creditTransactions` | userId, amount, type, description, entityId | User credit transaction log |
| `gammaCreditLedger` | userId, credits, type, lessonId | Gamma-specific credit tracking |
| `creditUsageLogs` | userId, creditType, amount, action, entityId | Usage audit log |
| `gammaCreditSnapshots` | userId, balance, snapshotDate | Point-in-time snapshots |
| `userCreditAdjustments` | userId, amount, reason, adjustedBy, status | Manual adjustments |
| `lpCreditLedger` | userId, organizationId, credits, type, description | LP credit ledger |
| `orgCreditLedger` | organizationId, credits, type, description, performedBy | Org credit ledger |
| `creditPurchasePackages` | name, credits, price, currency, isActive, target | Purchase package definitions |

#### Services

| Service File | Purpose |
|-------------|---------|
| `server/services/creditService.ts` | User credit management |
| `server/services/unifiedCreditService.ts` | Unified credit service across user/org |
| `server/services/hybridCreditService.ts` | Hybrid credit deduction (user first, then org) |
| `server/services/organizationCreditService.ts` | Organization credit wallet |
| `server/services/creditOrderService.ts` | Credit purchase order processing |

#### Frontend Components

| Component | Path | Purpose |
|-----------|------|---------|
| LessonCredits | `client/src/pages/LessonCredits.tsx` | Credit management |
| CreditCenter | `client/src/components/CreditCenter.tsx` | Credit overview |
| LessonCreditPricingCalculator | `client/src/components/LessonCreditPricingCalculator.tsx` | Pricing calculator |
| LessonCreditTiers | `client/src/components/LessonCreditTiers.tsx` | Credit tier display |
| LpCreditAmount | `client/src/components/LpCreditAmount.tsx` | Credit amount display |
| LPCreditIcon | `client/src/components/LPCreditIcon.tsx` | Credit icon |
| NavbarLpCreditBadge | `client/src/components/NavbarLpCreditBadge.tsx` | Navbar credit badge |
| InsufficientCreditsModal | `client/src/components/InsufficientCreditsModal.tsx` | Insufficient credits modal |

**Implementation Status**: ✅ **IMPLEMENTED**

---

### 3.12 Subscription & Licensing System

**Slide Reference**: Platform Features — "Subscription & Licensing"  
**Feature Description**: E-learning subscription plans with monthly/annual billing, organization licensing with seat management, license tiers (Blue/Red/Gold), usage-based limits, and billing automation.

#### Database Tables

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `subscriptionPlans` | name, price, interval, features | Plan definitions |
| `elearningSubscriptionPlans` | name, priceMonthly, priceAnnual, features, maxCourses, maxStudents | E-learning plans |
| `subscriptions` | organizationId, planId, status, startDate, endDate | Active subscriptions |
| `subscriptionInvoices` | subscriptionId, amount, currency, status, dueDate | Invoices |
| `subscriptionEvents` | subscriptionId, eventType, metadata | Event log |
| `userLicenses` | userId, organizationId, licenseTier, status, startDate, endDate | Per-user licenses |
| `licensePayments` | licenseId, amount, currency, status | License payments |
| `organizationLicenseSettings` | organizationId, maxSeats, seatEnforcementEnabled | Seat settings |
| `organizationLicenses` | organizationId, licenseTier, status | Org-level licenses |
| `licenseFlagOverrides` | organizationId, flagKey, value | Feature overrides |
| `licenseRolloutOrganizations` | organizationId, flagKey | Rollout targeting |
| `licenseRolloutBetaUsers` | userId, flagKey | Beta user targeting |

#### Services

| Service File | Purpose |
|-------------|---------|
| `server/services/subscriptionService.ts` | Subscription lifecycle management |
| `server/services/packageBillingService.ts` | Package billing calculations |
| `server/services/seatPolicyService.ts` | Seat limit enforcement |
| `server/services/userSeatManagementService.ts` | User seat allocation |
| `server/services/billingScheduler.ts` | Billing automation |

**Implementation Status**: ✅ **IMPLEMENTED**

---

### 3.13 Platform Revenue & Financial Management

**Slide Reference**: SuperAdmin Features — "Revenue Analytics"  
**Feature Description**: Comprehensive financial management for SuperAdmins: revenue tracking across all streams, cost management with categories, financial snapshots, audit logging, org-level revenue breakdown, and report generation.

#### Database Tables

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `platformRevenueReports` | periodStart, periodEnd, totalRevenue, breakdown | Revenue reports |
| `platformCostCategoryTypes` | name, description | Cost category definitions |
| `platformCostCategories` | name, type, description | Cost categories |
| `platformRevenueSources` | name, type, description | Revenue source definitions |
| `platformCostEntries` | categoryId, amount, currency, recurrence, description | Cost entries |
| `platformCostAllocations` | costId, organizationId, amount | Cost allocation to orgs |
| `platformFinancialSnapshots` | periodStart, periodEnd, revenue, costs, profit | Financial snapshots |
| `platformFinancialAuditLog` | action, entityType, entityId, details, performedBy | Financial audit |
| `platformReportJobs` | reportType, status, format, generatedAt | Report generation jobs |
| `platformReportSchedules` | reportType, schedule, lastRun, nextRun | Scheduled reports |
| `platformConfiguration` | key, value, description | Platform-wide config |

#### Backend Routes (`server/routes/platformRevenue.ts` — 12 endpoints)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/platform-revenue/overview` | isSuperAdmin | Revenue overview |
| GET | `/api/platform-revenue/streams` | isSuperAdmin | Revenue streams |
| GET | `/api/platform-revenue/costs` | isSuperAdmin | Cost entries |
| POST | `/api/platform-revenue/costs` | isSuperAdmin | Create cost entry |
| PATCH | `/api/platform-revenue/costs/:costId` | isSuperAdmin | Update cost |
| DELETE | `/api/platform-revenue/costs/:costId` | isSuperAdmin | Delete cost |
| GET | `/api/platform-revenue/costs/categories` | isSuperAdmin | Cost categories |
| GET | `/api/platform-revenue/costs/summary` | isSuperAdmin | Cost summary |
| GET | `/api/platform-revenue/org-analytics` | isSuperAdmin | Org-level analytics |
| GET | `/api/platform-revenue/snapshots` | isSuperAdmin | Financial snapshots |
| POST | `/api/platform-revenue/snapshots/generate` | isSuperAdmin | Generate snapshot |
| GET | `/api/platform-revenue/audit-log` | isSuperAdmin | Financial audit log |

#### Services

| Service File | Purpose |
|-------------|---------|
| `server/services/platformCostService.ts` | Cost management |
| `server/services/platformFinancialSnapshotService.ts` | Snapshot generation |
| `server/services/platformRevenueIngestionService.ts` | Revenue data ingestion |
| `server/services/platformAnalyticsService.ts` | Platform-wide analytics |
| `server/services/lpcRevenueService.ts` | LPC revenue tracking |
| `server/services/lpcSpendService.ts` | LPC spend tracking |
| `server/services/revenueTrackingService.ts` | Revenue tracking |

#### Frontend Components

| Component | Path | Purpose |
|-----------|------|---------|
| PlatformRevenueReports | `client/src/pages/PlatformRevenueReports.tsx` | Revenue reports |
| RevenueAnalyticsDashboard | `client/src/pages/RevenueAnalyticsDashboard.tsx` | Revenue analytics |
| OrgRevenueDashboard | `client/src/pages/OrgRevenueDashboard.tsx` | Org revenue |
| MarketplaceRevenue | `client/src/pages/MarketplaceRevenue.tsx` | Marketplace revenue |
| PlatformConfiguration | `client/src/pages/PlatformConfiguration.tsx` | Platform config |

**Implementation Status**: ✅ **IMPLEMENTED**

---

### 3.14 Business Packages

**Slide Reference**: Platform Features — "Business Packages"  
**Feature Description**: Tiered business packages for organizations with configurable pricing, seat limits, feature bundles, and recommendation engine.

#### Database Tables

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `businessPackages` | name, description, seatLimit, features, isActive | Package definitions |
| `businessPackagePrices` | packageId, currency, monthlyPrice, annualPrice | Multi-currency pricing |
| `organizationPackageAssignments` | organizationId, packageId, status, startDate | Org-package mapping |
| `packageChangeEvents` | organizationId, fromPackageId, toPackageId, changeType, reason | Change audit |
| `packageRecommendationDismissals` | organizationId, packageId, dismissedAt | Dismissed recommendations |
| `organizationPackageOverrides` | organizationId, overrideType, value | Per-org overrides |

#### Services

| Service File | Purpose |
|-------------|---------|
| `server/services/businessPackageService.ts` | Package CRUD and assignment |
| `server/services/packageCalculatorService.ts` | Pricing calculations |
| `server/services/packageRecommendationService.ts` | AI-driven package recommendations |
| `server/services/packageProposalService.ts` | Package proposal generation |
| `server/services/packageBillingService.ts` | Billing integration |
| `server/services/packageEmailService.ts` | Package-related emails |

#### Frontend Components

| Component | Path | Purpose |
|-----------|------|---------|
| OrgPackageOverrides | `client/src/pages/admin/OrgPackageOverrides.tsx` | Package override management |
| BusinessPackageManager | `client/src/components/admin/BusinessPackageManager.tsx` | Package management |
| PackageAnalytics | `client/src/components/admin/PackageAnalytics.tsx` | Package analytics |
| PackageCalculator | `client/src/components/admin/PackageCalculator.tsx` | Pricing calculator |
| RecommendationBanner | `client/src/components/admin/RecommendationBanner.tsx` | Package recommendation |
| CostManagement | `client/src/components/admin/CostManagement.tsx` | Cost management |

**Implementation Status**: ✅ **IMPLEMENTED**

---

### 3.15 Card Trading Game System

**Slide Reference**: Engage Pillar — "Card Collection Games"  
**Feature Description**: Card collection system with custom stats, game rooms for 1v1 multiplayer card battles, and leaderboards.

#### Database Tables

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `cardCollections` | id, name, organizationId, createdBy | Card collection sets |
| `collectionStatTypes` | collectionId, name, unit | Custom stat definitions |
| `cards` | id, collectionId, name, imageUrl, rarity | Card entities |
| `cardStats` | cardId, statTypeId, value | Card stat values |
| `universalStatUnits` | name, abbreviation | Universal stat units |
| `gameRooms` | id, hostId, guestId, collectionId, status | 1v1 game rooms |
| `playerSessions` | gameRoomId, userId, selectedCards | Player card selections |
| `gameResults` | gameRoomId, winnerId, loserId, score | Game outcomes |
| `activeOneVOneGames` | gameRoomId, currentRound, status | Active game tracking |
| `guestSessions` | guestToken, displayName | Guest player support |

#### Backend Routes (`server/routes/gameRoutes.ts` — 6 endpoints)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/games/create-lobby` | optionalAuth | Create game lobby |
| POST | `/api/games/join-lobby` | optionalAuth | Join game lobby |
| GET | `/api/games/lobbies` | optionalAuth | List lobbies |
| POST | `/api/games/:gameRoomId/forfeit` | optionalAuth | Forfeit game |
| GET | `/api/games/:gameRoomId` | optionalAuth | Get game state |
| GET | `/api/games/:gameRoomId/current-cards` | optionalAuth | Get current round cards |

#### Frontend Components

| Component | Path | Purpose |
|-----------|------|---------|
| AdminCards | `client/src/pages/AdminCards.jsx` | Card management |
| AdminCollections | `client/src/pages/AdminCollections.jsx` | Collection management |
| CardsManager | `client/src/pages/CardsManager.tsx` | Card manager |
| CollectionsManager | `client/src/pages/CollectionsManager.tsx` | Collection manager |
| CustomStatUnits | `client/src/pages/CustomStatUnits.jsx` | Stat unit management |
| GradesManager | `client/src/pages/GradesManager.tsx` | Grade management |

**Implementation Status**: ✅ **IMPLEMENTED**

---

### 3.16 Course Versioning & Marketplace Publishing

**Slide Reference**: Create Pillar — "Course Versioning"  
**Feature Description**: Course version control with draft→publish workflow, version-based upgrades for purchasers, marketplace listing for e-learning organizations, course cloning across organizations, and showcase courses.

#### Database Tables

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `courseVersions` | courseId, versionNumber, changes, publishedAt | Version history |
| `courseVersionUpgrades` | userId, courseId, fromVersion, toVersion | Upgrade tracking |
| `courseVersionNotifications` | userId, courseId, versionNumber, isRead | Version notifications |

#### Services

| Service File | Purpose |
|-------------|---------|
| `server/services/courseVersioningService.ts` | Version management |
| `server/services/courseVersionService.ts` | Version CRUD |
| `server/services/courseVisibilityService.ts` | Visibility management (public/org_only) |
| `server/services/showcaseCourseService.ts` | Showcase course management |
| `server/services/versionService.ts` | General version utilities |

**Implementation Status**: ✅ **IMPLEMENTED**

---

### 3.17 Course Reviews & Moderation

**Slide Reference**: Engage Pillar — "Course Reviews"  
**Feature Description**: Course reviews with star ratings, text reviews, moderation queue for admin approval, and moderation action audit trail.

#### Database Tables

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `courseReviews` | userId, courseId, rating, reviewText, isApproved, isFlagged | Course reviews |
| `reviewModerationActions` | reviewId, moderatorId, action, reason | Moderation audit |

#### Services

| Service File | Purpose |
|-------------|---------|
| `server/services/reviewService.ts` | Review CRUD and moderation |

**Implementation Status**: ✅ **IMPLEMENTED**

---

### 3.18 Payout & Commission System

**Slide Reference**: Platform Features — "Creator Payouts"  
**Feature Description**: Revenue sharing between platform and course creators, configurable commission rates (global and per-org), payout batching, disbursement tracking, and organization banking details.

#### Database Tables

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `coursePayouts` | organizationId, amount, currency, status, periodStart, periodEnd | Payout records |
| `coursePayoutLineItems` | payoutId, purchaseId, amount, commissionAmount | Line-item details |
| `payoutDisbursements` | payoutId, amount, currency, status, reference | Disbursement tracking |
| `payoutBatches` | batchId, totalAmount, currency, status | Batch processing |
| `organizationBankingDetails` | organizationId, bankName, accountNumber, branchCode, verified | Banking info |

#### Services

| Service File | Purpose |
|-------------|---------|
| `server/services/payoutService.ts` | Payout calculation and processing |
| `server/services/payoutProcessorService.ts` | Payout batch processing |

#### Frontend Components

| Component | Path | Purpose |
|-----------|------|---------|
| PayoutManagement | `client/src/pages/PayoutManagement.tsx` | Payout management |
| OrgSalesDashboard | `client/src/pages/OrgSalesDashboard.tsx` | Org sales overview |

**Implementation Status**: ✅ **IMPLEMENTED**

---

## 4. Security & Infrastructure Audit

### 4.1 Authentication Security

| Security Feature | Implementation | File Reference | Status |
|-----------------|----------------|----------------|--------|
| Password Hashing | bcrypt with 10 salt rounds | `server/services/passwordResetService.ts:180`, `server/routes/orgRoutes.ts:213` | ✅ Confirmed |
| Account Lockout | `failedLoginAttempts` counter + `lockedUntil` timestamp on `users` table | `server/routes/authRoutes.ts` (login flow) | ✅ Confirmed |
| Email Verification | Secure token with expiry (`emailVerificationToken`, `emailVerificationExpires`) | `server/services/emailVerificationService.ts` | ✅ Confirmed |
| Password Reset | Secure token with expiry (`passwordResetToken`, `passwordResetExpires`) | `server/services/passwordResetService.ts` | ✅ Confirmed |
| Session Invalidation | `sessionVersion` increment forces re-auth across all devices | `server/services/sessionInvalidationService.ts` | ✅ Confirmed |
| HTTPS Cookies | `secure: true` in production | `server/routes/shared.ts` | ✅ Confirmed |
| CSRF Protection | `sameSite: lax` cookie setting | `server/routes/shared.ts` | ✅ Confirmed |
| Session Secret | Fail-closed: app refuses to start without `SESSION_SECRET` in production | `server/routes/shared.ts` | ✅ Confirmed |
| Password Reset Rate Limiting | In-memory rate limiter per email and IP address | `server/services/passwordResetService.ts` | ✅ Confirmed (in-memory only — see gap analysis) |
| Cookie httpOnly | `true` — prevents JavaScript access | `server/routes/shared.ts` | ✅ Confirmed |

### 4.2 Multi-Tenant Isolation

| Isolation Layer | Implementation | Details |
|----------------|----------------|---------|
| Middleware Enforcement | `orgIsolationMiddleware.ts` | Validates org ID in params/body/query matches effective org. Blocks cross-org parameter tampering. |
| Effective Org Resolution | `sessionAuthMiddleware.ts` | 4-source resolution: Impersonation > Header > Primary > Fallback |
| Database-Level | `organizationId` FK | All tenant-scoped tables have `organizationId` foreign key |
| Index Coverage | Composite indexes | `(organizationId, ...)` pattern on tenant-scoped tables for query performance |
| SuperAdmin Bypass | Controlled impersonation | SuperAdmin can impersonate orgs via dedicated endpoints, tracked in session |
| Query Scoping | Service layer | All service methods accept and enforce `organizationId` parameter |

### 4.3 Data Integrity

| Integrity Feature | Implementation | Details |
|-------------------|----------------|---------|
| Unique Constraints | Database-level | Prevent duplicate assignments, progress records, certificates (e.g., `UNQ_user_lesson_cert`) |
| Transactional Coin Updates | `SELECT FOR UPDATE` | `gamificationService.ts` uses row-level locking to prevent race conditions on coin balance |
| Partial Unique Index | `pendingGammaJobs` | Ensures only one active Gamma generation job per lesson |
| Cascade Deletes | FK constraints | Dependent records cleaned up on parent deletion |
| Idempotent Operations | Certificate issuance | Unique constraint prevents duplicate certificates for same user/lesson/course combination |
| Webhook Deduplication | `paymentWebhookEvents` | `idempotencyKey` prevents double-processing of payment webhooks |

### 4.4 Session Security

| Feature | Configuration | Details |
|---------|--------------|---------|
| Store | PostgreSQL via `connect-pg-simple` | Persistent, survives server restarts |
| Pool | Dedicated `sessionPool` | Separate connection pool for session operations |
| TTL | 4 hours (14,400,000ms) | `maxAge` setting on cookie |
| Context Size | Max 10 organizations | Session context caps org list to prevent bloat |
| Monitoring | `sessionHealthMonitor.ts` | Tracks cache hit rates, context sizes, session payload vs PostgreSQL limits |
| Version Control | `sessionVersion` field | Incrementing version invalidates all existing sessions for a user |

### 4.5 Monitoring & Observability

| Monitor | File | Purpose |
|---------|------|---------|
| Auth Query Tracker | `server/monitoring/authQueryTracker.ts` | Counts and times auth-related DB queries |
| Performance Monitor | `server/monitoring/performanceMonitor.ts` | Request duration tracking, slow endpoint detection |
| Query Logger | `server/monitoring/queryLogger.ts` | DB query logging with slow query alerts |
| Session Health | `server/monitoring/sessionHealthMonitor.ts` | Session cache efficiency, context enrichment latency |

**Monitoring Endpoints** (in `server/routes/miscRoutes.ts`):

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/server-time` | Public | Server time check |
| GET | `/api/monitoring/metrics` | isSuperAdmin | Performance metrics |
| GET | `/api/monitoring/slow-endpoints` | isSuperAdmin | Slow endpoint report |
| GET | `/api/monitoring/slow-queries` | isSuperAdmin | Slow query report |
| POST | `/api/monitoring/reset` | isSuperAdmin | Reset monitoring counters |

---

## 5. Gap Analysis — Features Requiring Verification

### 5.1 Confirmed Implementations (No Gap)

| Feature | Evidence | Status |
|---------|----------|--------|
| AI Course Generation | Full implementation across 4 generation modes | ✅ No Gap |
| Gamification Engine | 162+ DB tables, 61 endpoints, complete service layer | ✅ No Gap |
| Analytics & Reporting | 24 report endpoints, 2 analytics services | ✅ No Gap |
| Multi-Tenant Isolation | Middleware + DB-level enforcement | ✅ No Gap |
| White-Label Branding | Full brand editor with 11 preview components, custom domains | ✅ No Gap |
| Organization Hierarchy | 3-level hierarchy with full CRUD | ✅ No Gap |
| Course Assignments | Scope-based with cascade resolution | ✅ No Gap |
| Quiz System | Full quiz engine with AI generation, games, progress | ✅ No Gap |
| Notifications | In-app + email via MailerSend | ✅ No Gap |
| Payments | YOCO integration with webhook deduplication | ✅ No Gap |
| Credit System | Dual credit (user + org) with hybrid deduction | ✅ No Gap |
| Certificate Generation | PDF certificates with org branding | ✅ No Gap |
| Session-Based Auth | Dual-path middleware with context caching | ✅ No Gap |
| Password Hashing | bcrypt with salt rounds | ✅ No Gap |

### 5.2 Potential Gaps

| # | Feature | Finding | Severity | Recommendation |
|---|---------|---------|----------|----------------|
| GAP-001 | **API Rate Limiting (Authenticated)** | Rate limiting exists only for public endpoints (`publicRateLimitMiddleware` in `server/routes/public.ts`). No general rate limiting middleware for authenticated API endpoints. Password reset has an in-memory rate limiter. | **MEDIUM** | Implement Express rate-limiting middleware (e.g., `express-rate-limit`) for authenticated endpoints, especially AI generation and payment routes. |
| GAP-002 | **Password Reset Rate Limiter Persistence** | The `PasswordResetRateLimiter` uses in-memory maps, which reset on server restart and won't work in multi-instance deployments. Code comment at line 388 explicitly warns about this. | **MEDIUM** | Migrate to database-backed or Redis-backed rate limiting for production reliability. |
| GAP-003 | **SCORM/xAPI Integration** | No SCORM or xAPI related code found anywhere in the codebase. | **LOW** | Only a gap if mentioned in the overview document as a feature. Mark as "NOT IMPLEMENTED" if referenced. |
| GAP-004 | **Two-Factor Authentication (2FA)** | No 2FA/TOTP/authenticator implementation found. An `input-otp.tsx` component exists but is a generic OTP input component, not connected to any 2FA flow. | **LOW** | Only a gap if mentioned in the overview document. Consider implementing for enterprise customers. |
| GAP-005 | **Bulk User Import (CSV)** | Bulk CSV import exists for quiz cards (`POST /api/admin/quiz-collections/:id/cards/bulk-csv`), but no bulk CSV user import found in standard routes. A `BulkUserManager.tsx` component exists in the frontend. | **LOW** | Verify if `BulkUserManager.tsx` connects to a backend endpoint or is UI-only. |
| GAP-006 | **PWA Offline Support** | Service worker exists (`client/public/sw.js`) with stale-while-revalidate strategy and static asset caching. However, only minimal assets are pre-cached (manifest, icons). No offline-first data strategy. | **LOW** | Expand service worker caching strategy if offline access is a marketed feature. |
| GAP-007 | **Mobile Responsiveness** | Tailwind CSS responsive classes are used throughout. No dedicated mobile testing automation found. | **LOW** | Implement cross-device testing suite. See `docs/responsive-audit.md` for existing audit. |
| GAP-008 | **HTTPS Enforcement** | `secure: true` only set on cookies in production. No explicit HTTP → HTTPS redirect middleware found. | **LOW** | Typically handled by reverse proxy/CDN. Verify deployment configuration. |

### 5.3 Items Requiring Test Verification

| # | Item | What to Verify | Priority |
|---|------|---------------|----------|
| TV-001 | Session Version Invalidation | Verify that incrementing `sessionVersion` actually invalidates all existing sessions | HIGH |
| TV-002 | Account Lockout | Verify lockout activates after correct number of failed attempts and auto-unlocks after `lockedUntil` | HIGH |
| TV-003 | Org Isolation Cross-Access | Attempt to access data from Org B while authenticated as Org A member | CRITICAL |
| TV-004 | Coin Balance Race Conditions | Concurrent coin transactions should not result in incorrect balances | HIGH |
| TV-005 | Challenge Reset Timing | Verify daily/weekly resets occur at scheduled times | MEDIUM |
| TV-006 | Webhook Deduplication | Send duplicate webhooks and verify only one is processed | HIGH |
| TV-007 | Session Context Size | Verify session context doesn't exceed PostgreSQL column limits with 10 organizations | MEDIUM |
| TV-008 | Certificate Uniqueness | Verify duplicate certificate requests are idempotently handled | MEDIUM |
| TV-009 | Course Completion Detection | Verify course is marked complete only when all lessons are completed | HIGH |
| TV-010 | Quiz Gating | Verify quiz must be passed before subsequent lessons unlock (except first lesson) | HIGH |
| TV-011 | Exchange Rate Freshness | Verify exchange rates are refreshed and stale rates trigger warnings | MEDIUM |
| TV-012 | Domain DNS Verification | Verify custom domain DNS TXT verification flow | MEDIUM |
| TV-013 | SuperAdmin Impersonation Cleanup | Verify impersonation sessions are properly cleaned up on logout | HIGH |
| TV-014 | Trial Expiry Enforcement | Verify trial lockout middleware blocks premium features after expiry | HIGH |

---

## 6. Database Schema Summary

### 6.1 Table Count by Domain

| Domain | Table Count | Key Tables |
|--------|------------|------------|
| Authentication & Users | 8 | sessions, users, userOrganizationRoles, userOrganizationAssignments, joinRequests, joinRequestApprovalTokens, guestSessions |
| Organizations | 7 | organizations, organizationUnits, organizationSubUnits, organizationTeams, organizationUsageLimits, organizationLicenseSettings, organizationLicenses |
| Courses & Lessons | 24 | courses, courseLessons, courseFrameworks, courseDrafts, courseDraftFrameworks, courseDraftDocuments, courseTags, courseCategories, lessons, lessonSlides, lessonPresentationVersions, lessonVersions, lessonContentVersions, lessonProgress, lessonProgressSlides, lessonAssignments, lessonScopeAssignments, lessonQuizLinks, lessonAccessLogs, courseAssignments, courseProgress, courseVersions, coursePurchases, certificates |
| Quizzes | 12 | quizCollections, quizCards, quizCardExplanations, termDefinitions, explanationTerms, quizCollectionAssignments, activeQuizGames, quizGameProgress, userQuizProgress, quizGameResults, quizDrafts, bulkQuizGenerationJobs |
| Gamification | 21 | coinTransactions, coinAdjustments, challengeTemplates, challengeProgress, adminChallengeConfig, powerUpCatalog, powerUpInventory, activePowerUps, cosmeticCatalog, cosmeticOwnership, equippedCosmetics, userCosmeticLoadouts, seasonPassConfig, seasonPassTiers, seasonPassProgress, seasonPassPurchases, playerSeasonRewards, achievementCatalog, achievementUnlocks, loginStreaks, gamificationEconomyRules |
| Card Games | 7 | cardCollections, collectionStatTypes, cards, cardStats, universalStatUnits, gameRooms, playerSessions, gameResults, activeOneVOneGames |
| Payments & Billing | 16 | paymentIntents, paymentFulfillments, paymentWebhookEvents, paymentTransactions, subscriptionPlans, elearningSubscriptionPlans, subscriptions, subscriptionInvoices, subscriptionEvents, creditOrders, postFulfillmentJobs, courseRefunds, coursePriceHistory, currencyConversionRates, exchangeRateHistory, platformPaymentSettings |
| Credits | 12 | userCreditAllocations, creditTransactions, gammaCreditLedger, creditUsageLogs, gammaCreditSnapshots, userCreditAdjustments, lpCreditLedger, orgCreditLedger, quizCreditPricing, creditPurchasePackages |
| Licensing | 5 | userLicenses, licensePayments, licenseFlagOverrides, licenseFlagAudit, licenseRolloutOrganizations, licenseRolloutBetaUsers |
| Branding | 2 | brandingThemes, organizationDomains |
| Notifications | 3 | userNotifications, notificationPreferences, emailLogs |
| Revenue & Finance | 13 | coursePayouts, coursePayoutLineItems, payoutDisbursements, payoutBatches, organizationBankingDetails, financialAuditLog, platformRevenueReports, platformCostCategoryTypes, platformCostCategories, platformRevenueSources, platformCostEntries, platformCostAllocations, platformFinancialSnapshots |
| Platform Config | 7 | systemSettings, platformPricing, platformConfiguration, webhookRegistrations, webhookEvents, salesInquiries, aiConfig |
| Miscellaneous | 8 | dailyStreaks, userCourseEnrollments, userCourseLessonProgress, shopItemPricing, leaderBoard, playerStats, reviewModerationActions, businessPackages (+ related) |

### 6.2 Total: 162 tables, 57 enums

---

## 7. API Endpoint Inventory

### 7.1 Endpoints by Route Module

| Route Module | File | Endpoints | Lines |
|-------------|------|-----------|-------|
| Course & Lesson Routes | `server/routes/courseRoutes.ts` | 111 | 6,899 |
| Admin Routes | `server/routes/adminRoutes.ts` | 198 | 6,740 |
| Organization Routes | `server/routes/orgRoutes.ts` | 62 | 4,382 |
| Course Framework Routes | `server/routes/courseFrameworkRoutes.ts` | 24 | 2,874 |
| Quiz Routes | `server/routes/quizRoutes.ts` | 46 | 2,802 |
| Payment Routes | `server/routes/paymentsRoutes.ts` | 28 | 2,217 |
| SuperAdmin Routes | `server/routes/superAdminRoutes.ts` | 56 | 2,136 |
| Report Routes | `server/routes/reportRoutes.ts` | 24 | 2,067 |
| Gamification Routes | `server/routes/gamificationRoutes.ts` | 61 | 1,722 |
| Auth Routes | `server/routes/authRoutes.ts` | 18 | 1,380 |
| Branding Routes | `server/brandingRoutes.ts` | 21 | 1,295 |
| Public Routes | `server/routes/public.ts` | 15 | 781 |
| AI Routes | `server/routes/aiRoutes.ts` | 13 | 745 |
| Platform Revenue | `server/routes/platformRevenue.ts` | 12 | 735 |
| Game Routes | `server/routes/gameRoutes.ts` | 6 | 297 |
| Org Sales Routes | `server/routes/orgSalesRoutes.ts` | 3 | 200 |
| Misc Routes | `server/routes/miscRoutes.ts` | 10 | 146 |
| **TOTAL** | | **708** | **37,418** |

### 7.2 Auth Coverage Summary

| Auth Level | Approximate Endpoints | Description |
|-----------|----------------------|-------------|
| Public (no auth) | ~30 | Health check, public courses, feature flags, webhooks, login/register |
| `withSessionAuthMiddleware` | ~400 | Standard authenticated endpoints |
| `isTeacherOrAdmin` | ~80 | Content creation and management |
| `isAdmin` (OrgAdmin+) | ~60 | Organization administration |
| `isSuperAdmin` | ~120 | Platform administration |
| `optionalAuth` | ~10 | Game routes, public features with optional user context |

---

## 8. Service Layer Inventory

### 8.1 All 85 Services

| # | Service | File | Domain |
|---|---------|------|--------|
| 1 | AI Service | `server/ai/aiService.ts` | AI |
| 2 | AI Enrichment Service | `server/services/aiEnrichmentService.ts` | AI |
| 3 | Analytics Service | `server/services/analyticsService.ts` | Analytics |
| 4 | Billing Scheduler | `server/services/billingScheduler.ts` | Billing |
| 5 | Business Package Service | `server/services/businessPackageService.ts` | Packages |
| 6 | Certificate Service | `server/services/certificateService.ts` | Certificates |
| 7 | Content Coach Service | `server/services/contentCoachService.ts` | AI |
| 8 | Content Health Service | `server/services/contentHealthService.ts` | AI |
| 9 | Course Assignment Service | `server/services/courseAssignmentService.ts` | Courses |
| 10 | Course Completion Service | `server/services/courseCompletionService.ts` | Courses |
| 11 | Course Context Service | `server/services/courseContextService.ts` | Courses |
| 12 | Course Framework AI Service | `server/services/courseFrameworkAIService.ts` | AI |
| 13 | Course Framework Extractor | `server/services/courseFrameworkExtractor.ts` | AI |
| 14 | Course Lesson Service | `server/services/courseLessonService.ts` | Courses |
| 15 | Course Refund Service | `server/services/courseRefundService.ts` | Payments |
| 16 | Course Service | `server/services/courseService.ts` | Courses |
| 17 | Course Thumbnail AI Service | `server/services/courseThumbnailAIService.ts` | AI |
| 18 | Course Topic AI Service | `server/services/courseTopicAIService.ts` | AI |
| 19 | Course Versioning Service | `server/services/courseVersioningService.ts` | Courses |
| 20 | Course Version Service | `server/services/courseVersionService.ts` | Courses |
| 21 | Course Visibility Service | `server/services/courseVisibilityService.ts` | Courses |
| 22 | Credit Order Service | `server/services/creditOrderService.ts` | Credits |
| 23 | Credit Service | `server/services/creditService.ts` | Credits |
| 24 | Currency Service | `server/services/currencyService.ts` | Payments |
| 25 | Document Extractor | `server/services/documentExtractor.ts` | AI |
| 26 | Email Scheduler Service | `server/services/emailSchedulerService.ts` | Email |
| 27 | Email Templates | `server/services/emailTemplates.ts` | Email |
| 28 | Email Verification Service | `server/services/emailVerificationService.ts` | Auth |
| 29 | Exchange Rate Service | `server/services/exchangeRateService.ts` | Payments |
| 30 | Framework Pricing Service | `server/services/frameworkPricingService.ts` | Credits |
| 31 | Gamma Image Style Service | `server/services/gammaImageStyleService.ts` | AI |
| 32 | Gamma Service | `server/services/gammaService.ts` | AI |
| 33 | Gamma Theme Sync Service | `server/services/gammaThemeSyncService.ts` | AI |
| 34 | Health Report Pricing Service | `server/services/healthReportPricingService.ts` | Credits |
| 35 | Hybrid Credit Service | `server/services/hybridCreditService.ts` | Credits |
| 36 | Invoice Service | `server/services/invoiceService.ts` | Payments |
| 37 | Job Queue Service | `server/services/jobQueueService.ts` | Infrastructure |
| 38 | Join Request Approval Service | `server/services/joinRequestApprovalService.ts` | Orgs |
| 39 | Lesson Description AI Service | `server/services/lessonDescriptionAIService.ts` | AI |
| 40 | Lesson Generation Pricing Service | `server/services/lessonGenerationPricingService.ts` | Credits |
| 41 | Lesson Orchestration Service | `server/services/lessonOrchestrationService.ts` | Courses |
| 42 | Lesson Progress Service | `server/services/lessonProgressService.ts` | Progress |
| 43 | Lesson Service | `server/services/lessonService.ts` | Courses |
| 44 | Lesson Versioning Service | `server/services/lessonVersioningService.ts` | Courses |
| 45 | LPC Revenue Service | `server/services/lpcRevenueService.ts` | Revenue |
| 46 | LPC Spend Service | `server/services/lpcSpendService.ts` | Revenue |
| 47 | MailerSend Service | `server/services/mailerSendService.ts` | Email |
| 48 | Notification Service | `server/services/notificationService.ts` | Notifications |
| 49 | Organization Credit Service | `server/services/organizationCreditService.ts` | Credits |
| 50 | Org Type Policy | `server/services/orgTypePolicy.ts` | Orgs |
| 51 | Package Billing Service | `server/services/packageBillingService.ts` | Packages |
| 52 | Package Calculator Service | `server/services/packageCalculatorService.ts` | Packages |
| 53 | Package Email Service | `server/services/packageEmailService.ts` | Packages |
| 54 | Package Proposal Service | `server/services/packageProposalService.ts` | Packages |
| 55 | Package Recommendation Service | `server/services/packageRecommendationService.ts` | Packages |
| 56 | Password Reset Service | `server/services/passwordResetService.ts` | Auth |
| 57 | Payment Orchestrator Service | `server/services/paymentOrchestratorService.ts` | Payments |
| 58 | Payment Router | `server/services/paymentRouter.ts` | Payments |
| 59 | Payment Service | `server/services/paymentService.ts` | Payments |
| 60 | Payout Processor Service | `server/services/payoutProcessorService.ts` | Payments |
| 61 | Payout Service | `server/services/payoutService.ts` | Payments |
| 62 | Platform Analytics Service | `server/services/platformAnalyticsService.ts` | Analytics |
| 63 | Platform Cost Service | `server/services/platformCostService.ts` | Revenue |
| 64 | Platform Financial Snapshot Service | `server/services/platformFinancialSnapshotService.ts` | Revenue |
| 65 | Platform Revenue Ingestion Service | `server/services/platformRevenueIngestionService.ts` | Revenue |
| 66 | Post Fulfillment Job Service | `server/services/postFulfillmentJobService.ts` | Payments |
| 67 | PPTX Extractor | `server/services/pptxExtractor.ts` | AI |
| 68 | Purchase Service | `server/services/purchaseService.ts` | Payments |
| 69 | Quiz Course Linker Service | `server/services/quizCourseLinkerService.ts` | Quizzes |
| 70 | Quiz Pricing Service | `server/services/quizPricingService.ts` | Credits |
| 71 | Reconciliation Service | `server/services/reconciliationService.ts` | Payments |
| 72 | Revenue Tracking Service | `server/services/revenueTrackingService.ts` | Revenue |
| 73 | Review Service | `server/services/reviewService.ts` | Reviews |
| 74 | Seat Policy Service | `server/services/seatPolicyService.ts` | Orgs |
| 75 | Session Context Service | `server/services/sessionContextService.ts` | Auth |
| 76 | Session Invalidation Service | `server/services/sessionInvalidationService.ts` | Auth |
| 77 | Showcase Course Service | `server/services/showcaseCourseService.ts` | Courses |
| 78 | Subscription Service | `server/services/subscriptionService.ts` | Billing |
| 79 | Thumbnail Pricing Service | `server/services/thumbnailPricingService.ts` | Credits |
| 80 | Timezone Preference Service | `server/services/timezonePreferenceService.ts` | Settings |
| 81 | Topic Analysis Pricing Service | `server/services/topicAnalysisPricingService.ts` | Credits |
| 82 | Unified Credit Service | `server/services/unifiedCreditService.ts` | Credits |
| 83 | User Seat Management Service | `server/services/userSeatManagementService.ts` | Orgs |
| 84 | Version Service | `server/services/versionService.ts` | Courses |
| 85 | Webhook Deduplication Service | `server/services/webhookDeduplicationService.ts` | Payments |
| 86 | Webhook Replay Protection | `server/services/webhookReplayProtection.ts` | Payments |
| 87 | YOCO Webhook Verifier | `server/services/yocoWebhookVerifier.ts` | Payments |

---

## 9. Frontend Component Inventory

### 9.1 Pages (92 total)

| Category | Pages | Count |
|----------|-------|-------|
| **Auth** | login, register, ForgotPassword, ResetPassword, verify-email, NotAuthorized | 6 |
| **Courses** | CourseBuilder, CourseBuilderUpload, CourseDocumentWizard, CourseFrameworkWizard, CourseEdit, CourseDetail, CourseLessons, CoursePreview, CoursePurchase, CoursePurchaseSuccess, CourseRefunds, CourseRating, BrowseCourses, MyCourses, CourseAssignments | 15 |
| **Lessons** | LessonWizard, LessonViewer, DemoLessonViewer, LessonLibrary, LessonCredits | 5 |
| **Quizzes** | QuizWizard, QuizCardManager, QuizDraftsPage, QuizLobby, QuizSinglePlayer, Quiz1v1, QuizLeaderboard | 7 |
| **Games** | GameLobby, GamePlay, GameRoom, GameHistory, SinglePlayer, MultiPlayer1v1 | 6 |
| **Gamification** | GamificationSettings, Leaderboard | 2 |
| **Organization** | OrgRegistrationWizard, OrgManagementHub, OrgStructureManager, OrgUserDetail, JoinRequests, UnifiedManagementHub | 6 |
| **Admin** | AdminDashboard, AdminCards, AdminCollections, UserManagement, SuperAdmin, SuperAdminImpersonate, AISettings, GammaThemes, PlatformConfiguration, WebhookAdmin | 10 |
| **Billing/Payments** | BillingDashboard, BillingAuditLog, InvoiceHistory, PurchaseHistory, SubscriptionManagement, SubscriptionAdminConsole, CreditPurchase, BuyCredits, PlatformPricing, CurrencyManagement, PayoutManagement, SalesInquiries | 12 |
| **Analytics** | Reports, OrganizationAnalytics, OrgAdminDashboard, TeacherDashboard, StudentDashboard, OrgCreditUsageReportPage, PlatformRevenueReports, RevenueAnalyticsDashboard, OrgRevenueDashboard, MarketplaceRevenue, OrgSalesDashboard | 11 |
| **Branding** | ThemeEditor | 1 |
| **Profile** | ProfilePage, CertificateGallery, NotificationCenter | 3 |
| **Content** | CardsManager, CollectionsManager, CustomStatUnits, GradesManager | 4 |
| **Landing/Other** | landing, AuthenticatedHome, not-found, SimplePlaceholder | 4 |

### 9.2 Custom Hooks (20 total)

| Hook | File | Purpose |
|------|------|---------|
| useAuth | `useAuth.ts` | Authentication state and actions |
| useUser | `use-user.ts` | Current user data |
| useToast | `use-toast.ts` | Toast notifications |
| useMobile | `use-mobile.tsx` | Mobile responsive detection |
| useCommandDialog | `use-command-dialog.ts` | Command palette |
| use100vh | `use100vh.ts` | Mobile viewport height |
| useAutoFitText | `useAutoFitText.ts` | Auto-sizing text |
| useCurrencyDisplay | `useCurrencyDisplay.ts` | Currency formatting |
| useCurrencyPreference | `useCurrencyPreference.ts` | Currency preference |
| useLessonCreditCosts | `useLessonCreditCosts.ts` | Credit cost calculation |
| useLessonProgress | `useLessonProgress.ts` | Lesson progress tracking |
| useLessonVersions | `useLessonVersions.ts` | Lesson version management |
| useLockBodyScroll | `useLockBodyScroll.ts` | Scroll lock for modals |
| useModalResponsive | `useModalResponsive.ts` | Responsive modal sizing |
| usePurchaseConfirmation | `usePurchaseConfirmation.ts` | Purchase flow state |
| useRewardNotification | `useRewardNotification.tsx` | Reward animations |
| useScreenWakeLock | `useScreenWakeLock.ts` | Screen wake lock for presentations |
| useShowcaseMode | `useShowcaseMode.ts` | Showcase/demo mode |
| useTimeTracker | `useTimeTracker.ts` | Time-on-page tracking |
| useWallet | `useWallet.ts` | Wallet data |

---

## Appendix A: Enum Registry

All 57 database enums defined in `shared/schema.ts`:

| # | Enum Name | Values | Domain |
|---|-----------|--------|--------|
| 1 | `organizationType` | education, business, elearning | Organizations |
| 2 | `currencyCode` | ZAR, USD, EUR | Payments |
| 3 | `courseStatus` | draft, active, inactive, archived | Courses |
| 4 | `courseVisibility` | public, org_only | Courses |
| 5 | `payoutStatus` | pending, processing, paid, failed | Payouts |
| 6 | `paymentStatus` | pending, completed, failed, refunded | Payments |
| 7 | `rateSource` | api, manual, fallback | Currency |
| 8 | `difficultyLevel` | easy, medium, hard, expert | Quizzes |
| 9 | `lessonProgressStatus` | not_started, in_progress, completed | Progress |
| 10 | `yocoMode` | test, live | Payments |
| 11 | `webhookSource` | yoco, mailersend | Webhooks |
| 12 | `subscriptionStatus` | active, cancelled, expired, past_due | Subscriptions |
| 13 | `subscriptionInterval` | monthly, annual | Subscriptions |
| 14 | `subscriptionPlanType` | basic, professional, enterprise | Subscriptions |
| 15 | `subscriptionTargetType` | organization, user | Subscriptions |
| 16 | `invoiceStatus` | pending, paid, overdue, cancelled | Invoices |
| 17 | `emailStatus` | sent, failed, bounced | Email |
| 18 | `licenseTier` | Blue, Red, Gold | Licensing |
| 19 | `licenseStatus` | active, expired, suspended | Licensing |
| 20 | `fulfillmentStatus` | pending, completed, failed | Payments |
| 21 | `organizationLicenseStatus` | active, expired, suspended | Licensing |
| 22 | `notificationType` | info, success, warning, error | Notifications |
| 23 | `bulkJobStatus` | pending, processing, completed, failed | Jobs |
| 24 | `reviewModerationAction` | approve, reject, flag | Reviews |
| 25 | `courseRefundStatus` | pending, approved, rejected, processed | Refunds |
| 26 | `subscriptionCancellationSource` | user, admin, system | Subscriptions |
| 27 | `certificateType` | lesson, course | Certificates |
| 28 | `revenueSourceType` | subscription, credit, course | Revenue |
| 29 | `costCategoryType` | infrastructure, personnel, service | Costs |
| 30 | `costRecurrence` | one_time, monthly, annual | Costs |
| 31 | `reportStatus` | pending, generating, completed, failed | Reports |
| 32 | `reportFormat` | csv, pdf, json | Reports |
| 33 | `userAllocationStatus` | active, exhausted, suspended | Credits |
| 34 | `gammaEventType` | generation, download, error | Gamma |
| 35 | `quizQuestionTier` | basic, intermediate, advanced | Quizzes |
| 36 | `adjustmentStatus` | pending, approved, rejected | Adjustments |
| 37 | `lpTransactionType` | earn, spend, refund, adjustment | Credits |
| 38 | `creditPurchaseTarget` | user, organization | Credits |
| 39 | `orgCreditActivityType` | adjustment, spend, refund | Credits |
| 40 | `thumbnailSource` | ai_generated, manual_upload, placeholder | Thumbnails |
| 41 | `lessonAssignmentAudience` | learner, teacher | Assignments |
| 42 | `courseProgressStatus` | not_started, in_progress, completed | Progress |
| 43 | `courseAssignmentAudience` | learner, teacher | Assignments |
| 44 | `courseAssignmentScope` | organization, department, unit, team, user | Assignments |
| 45 | `paymentIntentType` | course_purchase, credit_purchase, subscription | Payments |
| 46 | `paymentIntentStatus` | pending, processing, completed, failed | Payments |
| 47 | `creditOrderStatus` | pending, completed, failed | Credits |
| 48 | `postFulfillmentJobType` | credit_allocation, notification | Jobs |
| 49 | `postFulfillmentJobStatus` | pending, processing, completed, failed | Jobs |
| 50 | `purchaseStatus` | pending, completed, refunded, failed | Purchases |
| 51 | `extractionStatus` | pending, processing, completed, failed | Documents |
| 52 | `courseDraftStep` | info, documents, framework, review | Drafts |
| 53 | `frameworkGenerationStatus` | pending, processing, completed, failed | Frameworks |
| 54 | `packageInterval` | monthly, annual | Packages |
| 55 | `packageAssignmentStatus` | active, past_due, cancelled, scheduled_downgrade | Packages |
| 56 | `packageChangeType` | upgrade, downgrade, cancel, reactivate | Packages |
| 57 | `brandingThemeStatus` | draft, published | Branding |

---

## Appendix B: Middleware Chain Reference

### B.1 Standard Authenticated Request Flow

```
Request
  → express-session (cookie parsing, session hydration from PostgreSQL)
  → withSessionAuthMiddleware
    → Check session.userId exists
    → If SESSION_AUTH_ENABLED:
      → Check session.context exists and sessionVersion matches DB
      → Return cached context (fast path)
    → Else:
      → Query DB for user, roles, org membership (slow path)
  → resolveEffectiveOrganization
    → Check impersonatedOrganization (SuperAdmin)
    → Check x-organization-id header
    → Use primaryOrganization from context
    → Fallback to first org
  → enforceOrgIsolation (optional)
    → Validate org IDs in request match effective org
    → Block cross-org parameter tampering
  → Role-specific guard (isAdmin/isSuperAdmin/isTeacherOrAdmin)
  → Route handler
  → Response
```

### B.2 Public Request Flow (with rate limiting)

```
Request
  → publicRateLimitMiddleware (IP-based, in-memory counter)
  → Route handler
  → Response
```

---

## Appendix C: Feature Flag Registry

Feature flags are managed via `server/config/featureFlags.ts` with runtime override support:

| Flag | Purpose | Default |
|------|---------|---------|
| `SESSION_AUTH_ENABLED` | Enable cached session context (dual-path middleware) | Configurable |
| `QUIZ_CREDIT_CHARGING_ENABLED` | Charge credits for quiz generation | Configurable |
| Various payment flags | Control payment modes and features | See `server/config/paymentFeatureFlags.ts` |

**Feature Flag Management Endpoints** (SuperAdmin only):

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/feature-flags/status` | View all flag states |
| POST | `/api/admin/feature-flags/reload` | Reload flag config |
| POST | `/api/admin/feature-flags/override` | Override flag value |
| DELETE | `/api/admin/feature-flags/override/:flagKey` | Remove override |
| POST | `/api/admin/feature-flags/emergency-disable` | Emergency disable |
| GET | `/api/admin/feature-flags/audit` | Audit log |
| POST | `/api/admin/feature-flags/rollout/organizations` | Add org to rollout |
| DELETE | `/api/admin/feature-flags/rollout/organizations/:orgId` | Remove org from rollout |
| POST | `/api/admin/feature-flags/rollout/beta-users` | Add beta user |
| DELETE | `/api/admin/feature-flags/rollout/beta-users/:userId` | Remove beta user |

---

*End of Technical Audit Document — Phase 1: Technical Stocktake*  
*Document generated: February 6, 2026*  

---

## PHASE 2: MASTER TEST DOCUMENTATION

**Phase:** Phase 2 — Test Case Design & Execution Planning  
**Methodology:** STLC-Aligned (Software Testing Life Cycle)  
**Test Approach:** Manual Functional Testing  
**Total Test Cases:** 113  
**Date:** February 6, 2026  

---

### P2.1 Test Strategy

#### P2.1.1 Testing Approach

This phase defines a **manual functional testing** strategy aligned with STLC best practices. All test cases target the LearnPlay e-learning platform's core business flows and are designed to be executed by QA engineers through the browser-based UI and direct API interaction.

**Testing Types Covered:**

| Testing Type | Scope | Tools |
|:-------------|:------|:------|
| Functional Testing | All feature areas | Browser (Chrome/Firefox), Postman/cURL |
| Integration Testing | Cross-module data flows | Browser + API calls |
| Security Testing | Auth, RBAC, multi-tenant isolation | Browser + direct API manipulation |
| Regression Testing | After bug fixes or deployments | Re-execute relevant test suites |
| Boundary Testing | Input validation, limits, edge cases | Manual input variations |
| Concurrency Testing | Race conditions (coin balance) | Parallel API calls via script |

**Out of Scope (Phase 2):**

- Automated end-to-end test scripts (Phase 3)
- Performance/load testing (see `tests/load/` for k6 baseline)
- Accessibility (WCAG) testing
- Mobile-native testing (PWA only)

#### P2.1.2 Test Environment Requirements

| Requirement | Specification |
|:------------|:-------------|
| **Application URL** | Development: `http://localhost:5000` / Staging deployment URL |
| **Database** | PostgreSQL (Neon-backed) with seeded test data |
| **Browser** | Chrome 120+ or Firefox 120+ (latest stable) |
| **Authentication** | Test accounts for each role: SuperAdmin, OrgAdmin, Teacher, TeamLead, Student |
| **Organizations** | Minimum 2 test organizations (Org A, Org B) for isolation testing |
| **AI Provider** | Google Gemini API key configured in `aiConfig` table |
| **Payment Gateway** | YOCO test mode enabled (`yocoMode = 'test'`) |
| **Email Service** | MailerSend API key configured (or mock SMTP for local testing) |
| **Object Storage** | Replit Object Storage accessible for file uploads |
| **Session Secret** | `SESSION_SECRET` environment variable set |
| **Feature Flags** | All feature flags at default values unless test specifies otherwise |

**Required Test Accounts:**

| Role | Email Pattern | Organization | Purpose |
|:-----|:-------------|:-------------|:--------|
| SuperAdmin | `superadmin@test.com` | Platform-wide | Full platform access, impersonation |
| OrgAdmin (Org A) | `orgadmin-a@test.com` | Test Organization A | Org management, billing, users |
| OrgAdmin (Org B) | `orgadmin-b@test.com` | Test Organization B | Multi-tenant isolation testing |
| Teacher (Org A) | `teacher-a@test.com` | Test Organization A | Course creation, quiz management |
| Student (Org A) | `student-a@test.com` | Test Organization A | Course consumption, gamification |
| Student (Org B) | `student-b@test.com` | Test Organization B | Cross-org isolation testing |
| Unregistered | `newuser@test.com` | None | Registration flow testing |

#### P2.1.3 Entry / Exit Criteria

**Entry Criteria (Test Execution May Begin When):**

| # | Criterion | Verification |
|:--|:----------|:-------------|
| EC-1 | Application builds and starts without errors | `npm run dev` succeeds, health check returns 200 |
| EC-2 | Database is accessible with schema applied | `GET /api/health` returns OK; tables exist |
| EC-3 | All test accounts are seeded | Login succeeds for each role account |
| EC-4 | At least 2 test organizations exist | Org A and Org B visible in admin panel |
| EC-5 | AI configuration is active | `GET /api/ai/config` returns active config (SuperAdmin) |
| EC-6 | Payment gateway is in test mode | `GET /api/payments/yoco-mode` returns `test` |
| EC-7 | Test data prerequisites documented per suite | Pre-conditions column in each test case |

**Exit Criteria (Testing Is Complete When):**

| # | Criterion | Threshold |
|:--|:----------|:----------|
| EX-1 | All P1 (Critical) test cases executed | 100% executed |
| EX-2 | All P1 test cases pass | 100% pass rate |
| EX-3 | All P2 (High) test cases executed | 100% executed |
| EX-4 | P2 test cases pass rate | ≥ 95% pass rate |
| EX-5 | All P3/P4 test cases executed | ≥ 90% executed |
| EX-6 | No Severity-1 (Blocker) defects open | 0 open blockers |
| EX-7 | No Severity-2 (Critical) defects open | 0 open critical defects |
| EX-8 | All defects logged in defect tracker | 100% logged with reproduction steps |

#### P2.1.4 Risk-Based Prioritization

Test cases are prioritized using a risk-based approach. Risk is assessed by combining **business impact** (how critical the feature is to users) with **technical complexity** (likelihood of failure based on codebase complexity).

| Priority | Label | Definition | Execution Order |
|:---------|:------|:-----------|:----------------|
| **P1** | Critical | Security, authentication, data isolation, payment processing — failure causes data breach, financial loss, or complete service outage | Execute first, block release if failing |
| **P2** | High | Core business flows — course creation, assignment, progress tracking, quiz completion — failure prevents primary use cases | Execute second, block release if > 5% failing |
| **P3** | Medium | Supporting features — gamification, branding, analytics, notifications — failure degrades experience but workarounds exist | Execute third, defer fixes to next sprint if needed |
| **P4** | Low | Edge cases, cosmetic issues, admin-only features with low usage — failure has minimal user impact | Execute last, fix in backlog |

**Risk Heat Map:**

| Feature Area | Business Impact | Technical Complexity | Overall Risk | Priority |
|:-------------|:---------------|:--------------------|:-------------|:---------|
| Authentication & RBAC | Critical | High (dual-path middleware, session versioning) | **Critical** | P1 |
| Multi-Tenant Isolation | Critical | High (middleware chain, 4-source org resolution) | **Critical** | P1 |
| Payment Processing | Critical | High (external API, webhooks, async fulfillment) | **Critical** | P1 |
| Course Assignment & Progress | High | Medium (scope cascade, quiz gating) | **High** | P2 |
| AI Course Creation | High | High (external APIs, async jobs, credit deduction) | **High** | P2 |
| Quiz System | High | Medium (scoring, progress, certificate triggers) | **High** | P2 |
| Gamification Engine | Medium | High (concurrent transactions, scheduled resets) | **Medium** | P3 |
| Organization Management | Medium | Medium (hierarchy CRUD, join workflows) | **Medium** | P3 |
| White-Label Branding | Medium | Medium (theme tokens, DNS verification) | **Medium** | P3 |
| Analytics & Reporting | Medium | Low (read-only aggregation queries) | **Medium** | P3 |
| Notifications & Email | Low | Low (template rendering, preference storage) | **Low** | P4 |

---

### P2.2 Test Suite: Authentication & Security (TS-AUTH)

**Suite Objective:** Validate authentication flows, role-based access control (RBAC), session management, and multi-tenant data isolation.  
**Related Phase 1 Section:** 3.4 Enterprise Security & Multi-Tenancy  
**Primary Route Module:** `server/routes/authRoutes.ts` (18 endpoints)  
**Primary Middleware:** `server/middleware/sessionAuthMiddleware.ts`, `server/middleware/orgIsolationMiddleware.ts`  

#### TS-AUTH-001: User Login (Valid Credentials)

| Field | Value |
|:------|:------|
| **Test ID** | TS-AUTH-001 |
| **Test Scenario** | Verify that a registered user can log in with valid email and password |
| **Pre-conditions** | 1. User account exists with email `student-a@test.com` and known password. 2. Account is not locked or disabled. 3. Email verification is not required (or already verified). |
| **Test Steps** | 1. Navigate to `/login`. 2. Enter email `student-a@test.com`. 3. Enter the correct password. 4. Click the "Login" button. 5. Observe the response and redirect. |
| **Expected Result** | 1. `POST /api/auth/login` returns HTTP 200. 2. Response body contains user object with `id`, `email`, `name`, `isSuperAdmin` fields. 3. Session cookie `connect.sid` is set (httpOnly, sameSite=lax). 4. User is redirected to the authenticated home page. 5. `failedLoginAttempts` on the user record remains at 0. |
| **Priority** | P1 (Critical) |
| **Status** | Not Executed |

#### TS-AUTH-002: User Login (Invalid Password + Account Lockout)

| Field | Value |
|:------|:------|
| **Test ID** | TS-AUTH-002 |
| **Test Scenario** | Verify that invalid login attempts are tracked and the account locks after N consecutive failures |
| **Pre-conditions** | 1. User account exists with email `student-a@test.com`. 2. Account is not currently locked (`lockedUntil` is null or in the past). 3. `failedLoginAttempts` is 0. |
| **Test Steps** | 1. Navigate to `/login`. 2. Enter email `student-a@test.com` with an incorrect password. 3. Click "Login" and note the error message. 4. Repeat steps 2-3 for a total of 5 consecutive failed attempts. 5. On the 6th attempt, enter the correct password. 6. Check the `users` table for `failedLoginAttempts` and `lockedUntil` values. |
| **Expected Result** | 1. Each failed attempt returns HTTP 401 with error message "Invalid email or password". 2. `failedLoginAttempts` increments by 1 after each failure. 3. After 5 failed attempts, account is locked — `lockedUntil` is set to a future timestamp. 4. The 6th attempt (even with correct password) returns HTTP 403 with "Account is locked" message. 5. After the lockout period expires, login succeeds with correct credentials. 6. Successful login resets `failedLoginAttempts` to 0. |
| **Priority** | P1 (Critical) |
| **Status** | Not Executed |

#### TS-AUTH-003: User Login (Disabled Account)

| Field | Value |
|:------|:------|
| **Test ID** | TS-AUTH-003 |
| **Test Scenario** | Verify that a disabled user account cannot log in |
| **Pre-conditions** | 1. User account exists with `isDisabled = true` in the `users` table. 2. User has valid credentials. |
| **Test Steps** | 1. Navigate to `/login`. 2. Enter the disabled user's email and correct password. 3. Click "Login". 4. Observe the response. |
| **Expected Result** | 1. `POST /api/auth/login` returns HTTP 403. 2. Response contains error message indicating the account is disabled. 3. No session cookie is created. 4. User is not redirected to authenticated pages. |
| **Priority** | P1 (Critical) |
| **Status** | Not Executed |

#### TS-AUTH-004: User Registration with Org Invite Code

| Field | Value |
|:------|:------|
| **Test ID** | TS-AUTH-004 |
| **Test Scenario** | Verify that a new user can register using a valid organization invite code and is placed in the correct org with the correct role |
| **Pre-conditions** | 1. Organization A exists with a valid `inviteCode`. 2. No user account exists for `newuser@test.com`. 3. The invite code is known (e.g., retrieved from org settings). |
| **Test Steps** | 1. Navigate to `/register`. 2. Enter the organization invite code. 3. Verify the organization name is displayed after code validation (`GET /api/auth/validate-join-code`). 4. Fill in name, email (`newuser@test.com`), and password. 5. Select unit/department and team if prompted. 6. Click "Register". 7. Check the `users`, `userOrganizationRoles`, and `joinRequests` tables. |
| **Expected Result** | 1. `POST /api/auth/register` returns HTTP 201. 2. New user record is created in `users` table. 3. A `userOrganizationRoles` record links the user to Org A. 4. User's role is set to `student` (default) or per org configuration. 5. A `joinRequests` record is created with status `pending` (if approval required) or `approved` (if auto-approve). 6. User receives an email verification email (if enabled). 7. User is redirected to login or dashboard. |
| **Priority** | P1 (Critical) |
| **Status** | Not Executed |

#### TS-AUTH-005: Password Reset Flow (Request + Token + Reset)

| Field | Value |
|:------|:------|
| **Test ID** | TS-AUTH-005 |
| **Test Scenario** | Verify the complete password reset flow: request → token generation → token validation → password update |
| **Pre-conditions** | 1. User account exists with email `student-a@test.com`. 2. MailerSend is configured (or email logs are accessible). 3. No active password reset token exists for this user. |
| **Test Steps** | 1. Navigate to `/forgot-password`. 2. Enter email `student-a@test.com`. 3. Click "Send Reset Link". 4. Verify `POST /api/auth/forgot-password` returns HTTP 200. 5. Retrieve the reset token from the `users` table (`passwordResetToken` field) or from the email. 6. Navigate to `/reset-password?token=<token>`. 7. Verify `GET /api/auth/verify-reset-token/<token>` returns HTTP 200. 8. Enter a new password and confirm it. 9. Click "Reset Password". 10. Attempt login with the new password. 11. Attempt login with the old password. |
| **Expected Result** | 1. Reset request returns success message regardless of email existence (no user enumeration). 2. `passwordResetToken` and `passwordResetExpires` are set on the user record. 3. Token validation returns success for valid, non-expired tokens. 4. `POST /api/auth/reset-password` returns HTTP 200. 5. Password is updated (bcrypt hash changes in DB). 6. `passwordResetToken` is cleared after use. 7. Login with new password succeeds. 8. Login with old password fails. 9. Rate limiter prevents excessive reset requests from same email/IP. |
| **Priority** | P1 (Critical) |
| **Status** | Not Executed |

#### TS-AUTH-006: Email Verification Flow

| Field | Value |
|:------|:------|
| **Test ID** | TS-AUTH-006 |
| **Test Scenario** | Verify that email verification tokens are generated, validated, and update the user's verified status |
| **Pre-conditions** | 1. User account exists with `emailVerified = false`. 2. `emailVerificationToken` is set on the user record. 3. MailerSend is configured. |
| **Test Steps** | 1. Retrieve the verification token from the `users` table or verification email. 2. Call `POST /api/auth/verify-email` with the token. 3. Check the user's `emailVerified` field in the database. 4. Attempt to resend verification via `POST /api/auth/resend-verification`. 5. Check verification status via `GET /api/auth/verification-status`. |
| **Expected Result** | 1. `POST /api/auth/verify-email` returns HTTP 200 with success message. 2. User's `emailVerified` is set to `true`. 3. `emailVerificationToken` and `emailVerificationExpires` are cleared. 4. Resubmitting the same token returns an error (token already used). 5. Resend generates a new token and sends a new email. 6. Verification status endpoint returns the current status. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-AUTH-007: Session Expiry & Invalidation

| Field | Value |
|:------|:------|
| **Test ID** | TS-AUTH-007 |
| **Test Scenario** | Verify that sessions expire after the configured TTL and that forced invalidation via sessionVersion increment works correctly |
| **Pre-conditions** | 1. User is logged in with an active session. 2. Session TTL is configured to 4 hours (14,400,000ms). 3. User's current `sessionVersion` value is known. |
| **Test Steps** | 1. Log in as `student-a@test.com` and note the session cookie. 2. Make an authenticated API call (`GET /api/auth/user`) — should return 200. 3. Increment the user's `sessionVersion` in the database (simulating forced invalidation via `SessionInvalidationService`). 4. Make another authenticated API call with the same session cookie. 5. Observe the response. 6. (TTL test) Alternatively, wait for session expiry or manually expire the session in the `sessions` table. 7. Make an authenticated API call after expiry. |
| **Expected Result** | 1. Step 2: API call succeeds (HTTP 200). 2. Step 4: API call returns HTTP 401 (session version mismatch detected by `withSessionAuthMiddleware`). 3. Step 7: API call returns HTTP 401 (session expired). 4. In both cases, user is required to re-authenticate. 5. The expired/invalidated session is no longer valid for any endpoint. |
| **Priority** | P1 (Critical) |
| **Status** | Not Executed |

#### TS-AUTH-008: RBAC — SuperAdmin Access

| Field | Value |
|:------|:------|
| **Test ID** | TS-AUTH-008 |
| **Test Scenario** | Verify that SuperAdmin can access all platform-wide admin endpoints |
| **Pre-conditions** | 1. User is logged in as SuperAdmin (`isSuperAdmin = true`). 2. Session context has `effectiveRole = 'SuperAdmin'`. |
| **Test Steps** | 1. Log in as `superadmin@test.com`. 2. Call `GET /api/admin/feature-flags/status` (isSuperAdmin guard). 3. Call `GET /api/ai/config` (isSuperAdmin guard). 4. Call `GET /api/platform-revenue/overview` (isSuperAdmin guard). 5. Call `GET /api/superadmin/branding/themes` (isSuperAdmin guard). 6. Call `GET /api/admin/org-credits` (isSuperAdmin guard). 7. Call `GET /api/internal/session-health` (isSuperAdmin guard). |
| **Expected Result** | 1. All calls return HTTP 200 with valid data. 2. SuperAdmin can access endpoints guarded by `isSuperAdmin`, `isAdmin`, `isTeacherOrAdmin`, and `withSessionAuthMiddleware`. 3. No 403 Forbidden responses for any admin endpoint. |
| **Priority** | P1 (Critical) |
| **Status** | Not Executed |

#### TS-AUTH-009: RBAC — OrgAdmin Restricted to Own Org

| Field | Value |
|:------|:------|
| **Test ID** | TS-AUTH-009 |
| **Test Scenario** | Verify that an OrgAdmin can manage their own organization but cannot access other organizations' data |
| **Pre-conditions** | 1. User is logged in as OrgAdmin of Organization A. 2. Organization B exists with separate data. 3. User has no roles in Organization B. |
| **Test Steps** | 1. Log in as `orgadmin-a@test.com`. 2. Call `GET /api/org/<OrgA_ID>/join-requests` — should succeed. 3. Call `GET /api/org/<OrgB_ID>/join-requests` — should fail. 4. Call `POST /api/theme` with Org A context — should succeed. 5. Attempt to set `x-organization-id` header to Org B's ID and call `GET /api/organization/units`. 6. Call `GET /api/admin/feature-flags/status` (isSuperAdmin guard). |
| **Expected Result** | 1. Step 2: HTTP 200 — OrgAdmin can access own org data. 2. Step 3: HTTP 403 — blocked by `enforceOrgIsolation` middleware. 3. Step 4: HTTP 200 — theme operations scoped to own org. 4. Step 5: HTTP 403 — org isolation middleware blocks cross-org header override (effective org resolved from session, not header for non-SuperAdmin). 5. Step 6: HTTP 403 — OrgAdmin cannot access SuperAdmin-only endpoints. |
| **Priority** | P1 (Critical) |
| **Status** | Not Executed |

#### TS-AUTH-010: RBAC — Teacher Cannot Access Admin Routes

| Field | Value |
|:------|:------|
| **Test ID** | TS-AUTH-010 |
| **Test Scenario** | Verify that a Teacher role can create content but cannot access admin-only endpoints |
| **Pre-conditions** | 1. User is logged in as Teacher in Organization A. 2. User has `role = 'teacher'` in `userOrganizationRoles`. |
| **Test Steps** | 1. Log in as `teacher-a@test.com`. 2. Call `POST /api/courses` (isTeacherOrAdmin guard) — should succeed. 3. Call `POST /api/lessons` (requireOrgAccess + isTeacherOrAdmin) — should succeed. 4. Call `GET /api/org/<OrgA_ID>/join-requests` (isTeacherOrAdmin guard) — should succeed. 5. Call `POST /api/org/join-requests/<id>/approve` (validateJoinRequestAccess) — check behavior. 6. Call `GET /api/admin/feature-flags/status` (isSuperAdmin guard) — should fail. 7. Call `POST /api/theme/activate` (isOrgAdmin guard) — should fail. 8. Call `GET /api/platform-revenue/overview` (isSuperAdmin guard) — should fail. |
| **Expected Result** | 1. Steps 2-4: HTTP 200 — Teacher can access content creation and some admin-read endpoints. 2. Step 5: Depends on `validateJoinRequestAccess` implementation (may require admin role). 3. Steps 6-8: HTTP 403 — Teacher is blocked from SuperAdmin and OrgAdmin endpoints. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-AUTH-011: RBAC — Student Cannot Access Teacher Routes

| Field | Value |
|:------|:------|
| **Test ID** | TS-AUTH-011 |
| **Test Scenario** | Verify that a Student role can consume content but cannot create courses, manage quizzes, or access teacher/admin endpoints |
| **Pre-conditions** | 1. User is logged in as Student in Organization A. 2. User has `role = 'student'` in `userOrganizationRoles`. |
| **Test Steps** | 1. Log in as `student-a@test.com`. 2. Call `GET /api/courses` (withSessionAuth) — should succeed. 3. Call `GET /api/lessons/<lessonId>` (withSessionAuth + org scoping) — should succeed. 4. Call `POST /api/courses` (isTeacherOrAdmin guard) — should fail. 5. Call `POST /api/lessons` (requireOrgAccess + isTeacherOrAdmin) — should fail. 6. Call `POST /api/admin/quiz-collections` (isTeacherOrAdmin) — should fail. 7. Call `GET /api/org/<OrgA_ID>/join-requests` (isTeacherOrAdmin) — should fail. 8. Call `POST /api/theme` (isOrgAdmin guard) — should fail. |
| **Expected Result** | 1. Steps 2-3: HTTP 200 — Student can view courses and lessons. 2. Steps 4-8: HTTP 403 — Student is blocked from all content creation and admin endpoints. 3. Student can still access gamification, quiz-taking, progress, and profile endpoints. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-AUTH-012: Multi-Tenant Isolation (User A Cannot See Org B Data)

| Field | Value |
|:------|:------|
| **Test ID** | TS-AUTH-012 |
| **Test Scenario** | Verify that a user in Organization A cannot access, view, or modify data belonging to Organization B |
| **Pre-conditions** | 1. User `student-a@test.com` belongs to Organization A only. 2. Organization B has courses, lessons, users, and quiz data. 3. Organization B IDs are known for direct API testing. |
| **Test Steps** | 1. Log in as `student-a@test.com` (Org A). 2. Call `GET /api/courses` — note only Org A courses are returned. 3. Attempt `GET /api/courses/<OrgB_CourseId>` (a course belonging to Org B). 4. Attempt `GET /api/lessons/<OrgB_LessonId>` (a lesson belonging to Org B). 5. Attempt `GET /api/organization/units` with `x-organization-id: <OrgB_ID>` header. 6. Attempt `POST /api/organization/<OrgB_ID>/departments` to create a department in Org B. 7. Attempt to call org wallet endpoint `GET /api/org-wallet/<OrgB_ID>/balance`. 8. Verify leaderboard data is org-scoped: `GET /api/leaderboard`. |
| **Expected Result** | 1. Step 2: Only Org A courses returned (filtered by `organizationId`). 2. Step 3: HTTP 403 or 404 — course not accessible. 3. Step 4: HTTP 403 or 404 — lesson not accessible. 4. Step 5: HTTP 403 — org isolation middleware blocks header override. 5. Step 6: HTTP 403 — blocked by org isolation. 6. Step 7: HTTP 403 — wallet access restricted to own org. 7. Step 8: Leaderboard shows only Org A users (unless SuperAdmin with `crossOrg=true`). |
| **Priority** | P1 (Critical) |
| **Status** | Not Executed |

#### TS-AUTH-013: SuperAdmin Impersonation

| Field | Value |
|:------|:------|
| **Test ID** | TS-AUTH-013 |
| **Test Scenario** | Verify that a SuperAdmin can impersonate an organization and see data as that org, and that impersonation is properly tracked and can be ended |
| **Pre-conditions** | 1. User is logged in as SuperAdmin. 2. Organization B exists with courses, users, and data. 3. SuperAdmin is not currently impersonating any organization. |
| **Test Steps** | 1. Log in as `superadmin@test.com`. 2. Navigate to the impersonation page (`/super-admin/impersonate`). 3. Select Organization B from the list. 4. Activate impersonation. 5. Verify `session.context.impersonatedOrganization` is set to Org B. 6. Call `GET /api/courses` — should return Org B courses. 7. Call `GET /api/organization/units` — should return Org B hierarchy. 8. Verify the ImpersonationBanner is displayed in the UI. 9. End impersonation. 10. Call `GET /api/courses` — should return SuperAdmin's default view. 11. Verify `session.context.impersonatedOrganization` is cleared. |
| **Expected Result** | 1. Impersonation activation updates session context with Org B as effective org. 2. All org-scoped API calls return Org B data during impersonation. 3. `resolveEffectiveOrganization` returns `source: 'impersonation'` with Org B ID. 4. ImpersonationBanner component renders with Org B name. 5. Ending impersonation clears the impersonated org from session. 6. After ending, effective org reverts to SuperAdmin's primary or none. 7. Impersonation is auditable via session context changes. |
| **Priority** | P1 (Critical) |
| **Status** | Not Executed |

---

### P2.3 Test Suite: AI Course Creation (TS-COURSE)

**Suite Objective:** Validate the AI-powered course creation pipeline including all generation modes, document extraction, framework generation, Gamma PPTX creation, versioning, and content lifecycle.  
**Related Phase 1 Section:** 3.1 AI-Powered Course Creation (Create Pillar)  
**Primary Route Modules:** `server/routes/courseRoutes.ts`, `server/routes/aiRoutes.ts`, `server/routes/courseFrameworkRoutes.ts`  

#### TS-COURSE-001: Create Course (Basic Metadata)

| Field | Value |
|:------|:------|
| **Test ID** | TS-COURSE-001 |
| **Test Scenario** | Verify that a Teacher or Admin can create a new course with basic metadata (title, description, category) |
| **Pre-conditions** | 1. User is logged in as Teacher or OrgAdmin. 2. Organization has an active subscription. 3. At least one course category exists. |
| **Test Steps** | 1. Navigate to the Course Builder page. 2. Enter course title: "Test Course Alpha". 3. Enter description: "A test course for QA validation". 4. Select a category from the dropdown. 5. Select difficulty level: "beginner". 6. Click "Create Course". 7. Verify the course appears in the courses list. |
| **Expected Result** | 1. `POST /api/courses` (or course draft endpoint) returns HTTP 201. 2. Course record created in `courses` table with `status = 'draft'`. 3. Course has correct `organizationId` matching the user's effective org. 4. Course appears in `GET /api/courses` listing. 5. Course has a unique UUID `id`. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-COURSE-002: AI Topic Generation from User Input

| Field | Value |
|:------|:------|
| **Test ID** | TS-COURSE-002 |
| **Test Scenario** | Verify that the AI generates a list of lesson topics from a course title input |
| **Pre-conditions** | 1. User is logged in as Teacher. 2. Active AI configuration exists with valid Gemini API key. 3. User has sufficient credits for topic generation. |
| **Test Steps** | 1. Navigate to Course Builder or Lesson Wizard. 2. Enter a course title: "Introduction to Machine Learning". 3. Trigger AI topic generation (`POST /api/ai/generate-lesson-topics`). 4. Wait for the AI response. 5. Review the generated topics list. |
| **Expected Result** | 1. API returns HTTP 200 with an array of generated topics. 2. Each topic has a title and optional description. 3. Topics are relevant to the input title. 4. Credits are deducted from user's balance (per `topicAnalysisPricingService`). 5. Response time is reasonable (< 30 seconds). |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-COURSE-003: Document Upload + Extraction (DOCX)

| Field | Value |
|:------|:------|
| **Test ID** | TS-COURSE-003 |
| **Test Scenario** | Verify that a DOCX file can be uploaded and its text content is extracted for course framework generation |
| **Pre-conditions** | 1. User is logged in as Teacher. 2. A valid DOCX file (with headings, paragraphs) is available for upload. 3. Course draft exists or can be created. |
| **Test Steps** | 1. Create a new course draft via `POST /api/course-drafts/`. 2. Upload a DOCX file via `POST /api/course-drafts/:draftId/documents`. 3. Wait for extraction to complete (check `extractionStatus`). 4. Retrieve extracted content via `GET /api/course-drafts/:draftId/documents/:docId/content`. 5. Verify the extracted text matches the document content. |
| **Expected Result** | 1. File upload returns HTTP 200 with document metadata. 2. `extractionStatus` transitions from `pending` → `completed`. 3. `extractedContent` contains the text from the DOCX file. 4. Headings, paragraphs, and sections are preserved in the extraction. 5. Document is stored in Object Storage with a valid `storageKey`. 6. Document record exists in `courseDraftDocuments` table. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-COURSE-004: Framework Generation from Document

| Field | Value |
|:------|:------|
| **Test ID** | TS-COURSE-004 |
| **Test Scenario** | Verify that a course framework (topic structure with learning objectives) is generated from an uploaded document using AI |
| **Pre-conditions** | 1. User is logged in as Teacher. 2. Course draft exists with at least one extracted document (TS-COURSE-003 passed). 3. Sufficient credits for framework generation. |
| **Test Steps** | 1. Call `POST /api/course-drafts/:draftId/generate` to trigger framework generation. 2. Poll `GET /api/course-drafts/:draftId/generation-status` until complete. 3. Review the generated framework via `GET /api/course-drafts/:draftId`. 4. Verify topics, lesson structure, and learning objectives. |
| **Expected Result** | 1. Generation returns HTTP 200 or 202 (accepted). 2. Status transitions: `pending` → `generating` → `completed`. 3. Framework contains structured topics with titles and descriptions. 4. Each topic has learning objectives. 5. Framework data is stored in `courseDraftFrameworks` table. 6. Credits are deducted per `frameworkPricingService`. 7. `sourceMap` field traces content back to document sections. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-COURSE-005: Lesson Creation (gemini-topics Mode)

| Field | Value |
|:------|:------|
| **Test ID** | TS-COURSE-005 |
| **Test Scenario** | Verify that a lesson can be created using the `gemini-topics` generation mode where AI generates slide content from topic data |
| **Pre-conditions** | 1. User is logged in as Teacher. 2. Course exists with a framework topic. 3. Active Gemini AI configuration. 4. Sufficient credits. |
| **Test Steps** | 1. Navigate to lesson creation for a course topic. 2. Select generation mode: `gemini-topics`. 3. Confirm topic title and any additional instructions. 4. Trigger lesson orchestration via `POST /api/lessons/:lessonId/orchestrate`. 5. Monitor generation status. 6. Review generated slide content. |
| **Expected Result** | 1. Lesson record is created with `generationMode = 'gemini-topics'`. 2. `generationStatus` transitions through `pending` → `generating` → `completed`. 3. `learningAssetContract` (JSONB) is populated with slide data conforming to Learning Asset Contract format. 4. `lessonSlides` records are created for each slide. 5. A `pendingGammaJobs` record is created for PPTX generation. 6. Credits are deducted from user or org wallet. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-COURSE-006: Lesson Creation (document-upload Mode)

| Field | Value |
|:------|:------|
| **Test ID** | TS-COURSE-006 |
| **Test Scenario** | Verify that a lesson can be created by uploading a document, extracting content, and generating slides from it |
| **Pre-conditions** | 1. User is logged in as Teacher. 2. DOCX document is available for upload. 3. Active AI configuration with sufficient credits. |
| **Test Steps** | 1. Navigate to lesson creation. 2. Select generation mode: `document-upload`. 3. Upload a DOCX file via `POST /api/lessons/document-upload`. 4. Wait for document extraction and AI processing. 5. Review the generated lesson content and slides. |
| **Expected Result** | 1. Lesson record created with `generationMode = 'document-upload'`. 2. Document is extracted via `documentExtractor` service. 3. AI generates slide content from extracted text. 4. `learningAssetContract` populated with structured slides. 5. Content traces back to source document via `sourceMap`. 6. Credits deducted appropriately. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-COURSE-007: Lesson Creation (manual-upload Mode)

| Field | Value |
|:------|:------|
| **Test ID** | TS-COURSE-007 |
| **Test Scenario** | Verify that a lesson can be created by directly uploading an existing PPTX file |
| **Pre-conditions** | 1. User is logged in as Teacher. 2. Valid PPTX file available. |
| **Test Steps** | 1. Navigate to lesson creation. 2. Select generation mode: `manual-upload`. 3. Upload PPTX file via `POST /api/lessons/manual-upload`. 4. Verify lesson is created with the uploaded presentation. 5. Verify the PPTX is stored in Object Storage. |
| **Expected Result** | 1. Lesson created with `generationMode = 'manual-upload'`. 2. PPTX file stored with valid `storageKey`. 3. Lesson is viewable via the lesson viewer. 4. `lessonPresentationVersions` record created with `version = 1`. 5. No AI credits deducted (manual upload). |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-COURSE-008: Gamma PPTX Generation Job Lifecycle

| Field | Value |
|:------|:------|
| **Test ID** | TS-COURSE-008 |
| **Test Scenario** | Verify the asynchronous Gamma API job queue lifecycle: job creation → claiming → polling → completion/failure |
| **Pre-conditions** | 1. Lesson exists with generated slide content (gemini-topics or document-upload mode). 2. Gamma API is accessible. 3. `pendingGammaJobs` table is accessible. |
| **Test Steps** | 1. Trigger PPTX generation for a lesson (via lesson orchestration). 2. Verify a `pendingGammaJobs` record is created with `status = 'pending'`. 3. Observe the job queue worker pick up the job (`status → 'claimed'`). 4. Observe polling phase (`status → 'polling'`). 5. Wait for completion (`status → 'completed'`). 6. Verify the PPTX is stored in Object Storage. 7. Verify `lessonPresentationVersions` is updated. |
| **Expected Result** | 1. Job progresses through statuses: `pending` → `claimed` → `polling` → `completed`. 2. `gammaCardId` is set on the job record after Gamma API responds. 3. PPTX file is downloaded and stored with a valid `storageKey`. 4. `isGenerated = true` on the presentation version. 5. On failure: `status = 'failed'`, `retryCount` increments, error is logged. 6. Partial unique index ensures only one active job per lesson. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-COURSE-009: Lesson Publishing Workflow

| Field | Value |
|:------|:------|
| **Test ID** | TS-COURSE-009 |
| **Test Scenario** | Verify that a lesson can transition from unpublished to published state, and that publishing makes it accessible to learners |
| **Pre-conditions** | 1. Lesson exists with `isPublished = false`. 2. Lesson has generated content (PPTX available). 3. User is Teacher or Admin. |
| **Test Steps** | 1. Call `POST /api/lessons/:lessonId/publish`. 2. Verify `isPublished` is set to `true`. 3. As a Student, verify the lesson is now visible/accessible. 4. Call `POST /api/lessons/:lessonId/unpublish`. 5. Verify `isPublished` is set back to `false`. 6. As a Student, verify the lesson is no longer accessible. |
| **Expected Result** | 1. Publish returns HTTP 200. 2. `isPublished = true` in database. 3. Published lessons appear in student course views. 4. Unpublish returns HTTP 200. 5. `isPublished = false` in database. 6. Unpublished lessons are hidden from students. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-COURSE-010: Course Versioning (Draft Clone + Publish)

| Field | Value |
|:------|:------|
| **Test ID** | TS-COURSE-010 |
| **Test Scenario** | Verify the course versioning workflow: create a draft clone of an active course, edit it, and publish changes as a new version |
| **Pre-conditions** | 1. Active published course exists with lessons. 2. User is Teacher or Admin. |
| **Test Steps** | 1. Call `POST /api/courses/:id/create-draft` to create a draft. 2. Verify draft record exists in `courseDrafts`. 3. Edit the draft title and description via `PATCH /api/courses/:id/draft`. 4. Add or remove lessons from the draft. 5. Call `POST /api/courses/:id/publish-draft` to publish. 6. Verify the course is updated with new content. 7. Check `courseVersions` for a new version record. |
| **Expected Result** | 1. Draft creation returns HTTP 200 with draft data. 2. Draft is editable without affecting the live course. 3. Publishing merges draft changes into the live course. 4. A new `courseVersions` record is created with incremented `versionNumber`. 5. Students see the updated course content. 6. Draft record is cleaned up after publishing. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-COURSE-011: Lesson Video Upload

| Field | Value |
|:------|:------|
| **Test ID** | TS-COURSE-011 |
| **Test Scenario** | Verify that a video walkthrough can be uploaded and attached to a lesson |
| **Pre-conditions** | 1. Lesson exists. 2. User is Teacher or Admin. 3. Valid video file available (MP4). |
| **Test Steps** | 1. Call `POST /api/lessons/:lessonId/upload-video` with a video file. 2. Verify the video is stored in Object Storage. 3. Verify `videoStorageKey` is set on the lesson record. 4. Access the lesson viewer and verify the video player renders. 5. Call `GET /api/lessons/:lessonId/download-video` to download. |
| **Expected Result** | 1. Upload returns HTTP 200. 2. `videoStorageKey` populated on lesson record. 3. Video is playable in the `VideoPlayer` component. 4. Download endpoint returns the video file. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-COURSE-012: Content Feedback / Quality Scoring

| Field | Value |
|:------|:------|
| **Test ID** | TS-COURSE-012 |
| **Test Scenario** | Verify that the ContentCoach AI generates quality scores and feedback for lesson content |
| **Pre-conditions** | 1. Lesson exists with slide content. 2. Active AI configuration. 3. Sufficient credits. |
| **Test Steps** | 1. Open a lesson detail. 2. Trigger content quality assessment via the ContentCoach panel. 3. Review the quality score (1-10 scale). 4. Review the feedback report. 5. Verify credits are deducted. |
| **Expected Result** | 1. Quality score (`contentScore10`) is set on the lesson record (range 1-10). 2. `feedbackReport` contains actionable improvement suggestions. 3. Scores and feedback are persisted in the database. 4. Credits deducted per `healthReportPricingService`. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-COURSE-013: Slide Versioning

| Field | Value |
|:------|:------|
| **Test ID** | TS-COURSE-013 |
| **Test Scenario** | Verify that slide content is versioned and previous versions can be compared |
| **Pre-conditions** | 1. Lesson exists with at least 2 presentation versions. 2. User is Teacher or Admin. |
| **Test Steps** | 1. Call `GET /api/lessons/:lessonId/presentation-versions` to list versions. 2. Verify multiple versions are returned. 3. Download a specific version via `GET /api/lessons/:lessonId/presentation-versions/:versionId/download`. 4. Open the LessonVersionHistory component to view version timeline. 5. Open LessonContentDiffModal to compare two versions. |
| **Expected Result** | 1. Version list returns all presentation versions with timestamps. 2. Each version has `version` number, `gammaCardId`, `storageKey`, `creditsCharged`. 3. Download returns the PPTX file for the specific version. 4. Version history displays chronologically. 5. Content diff shows changes between versions. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-COURSE-014: Course Deletion (Cascade)

| Field | Value |
|:------|:------|
| **Test ID** | TS-COURSE-014 |
| **Test Scenario** | Verify that deleting a course cascades to related records (lessons, assignments, progress, frameworks) |
| **Pre-conditions** | 1. Course exists with linked lessons, assignments, progress records, and frameworks. 2. User is Teacher or Admin. |
| **Test Steps** | 1. Note the course ID and all related record IDs. 2. Call `DELETE /api/courses/:id`. 3. Check `courses` table — record should be removed. 4. Check `courseLessons` — link records should be removed. 5. Check `courseAssignments` — assignment records should be removed. 6. Check `courseProgress` — progress records should be removed. 7. Check `courseFrameworks` — framework record should be removed. 8. Check that the lessons themselves are NOT deleted (they are reusable). |
| **Expected Result** | 1. Course deletion returns HTTP 200. 2. All cascade-dependent records are cleaned up. 3. Lessons still exist in the `lessons` table (not cascade deleted). 4. No orphaned records remain in linking tables. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-COURSE-015: Lesson Archiving

| Field | Value |
|:------|:------|
| **Test ID** | TS-COURSE-015 |
| **Test Scenario** | Verify that a lesson can be archived and restored |
| **Pre-conditions** | 1. Published lesson exists. 2. User is Teacher or Admin. |
| **Test Steps** | 1. Call `POST /api/lessons/:lessonId/archive`. 2. Verify lesson status changes (archived flag or status field). 3. As a Student, verify the lesson is no longer accessible. 4. Call `POST /api/lessons/:lessonId/restore`. 5. Verify the lesson is restored and accessible again. |
| **Expected Result** | 1. Archive returns HTTP 200. 2. Lesson is hidden from student views. 3. Lesson data is preserved (not deleted). 4. Restore returns HTTP 200. 5. Lesson becomes visible and accessible again. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

---

### P2.4 Test Suite: Gamification (TS-GAME)

**Suite Objective:** Validate the gamification engine including coins, challenges, power-ups, cosmetics, season pass, achievements, streaks, XP/leveling, and leaderboards.  
**Related Phase 1 Section:** 3.2 Gamification System (Engage Pillar)  
**Primary Route Module:** `server/routes/gamificationRoutes.ts` (61 endpoints)  
**Primary Service:** `server/gamificationService.ts`  

#### TS-GAME-001: Coin Earning from Quiz Completion

| Field | Value |
|:------|:------|
| **Test ID** | TS-GAME-001 |
| **Test Scenario** | Verify that a student earns coins after completing a quiz, based on gamification economy rules |
| **Pre-conditions** | 1. Student is logged in. 2. Quiz collection exists and is assigned to student. 3. Gamification economy rules define coin rewards for quiz completion. 4. Student's current coin balance is known. |
| **Test Steps** | 1. Note the student's current coin balance via `GET /api/coins/balance`. 2. Complete a quiz with a passing score. 3. Check the coin balance again via `GET /api/coins/balance`. 4. Check `coinTransactions` for a new transaction record. |
| **Expected Result** | 1. Coin balance increases by the amount defined in `gamificationEconomyRules` for `quiz_completion`. 2. A `coinTransactions` record is created with `type = 'quiz_reward'`. 3. Transaction `amount` matches the configured reward. 4. `balance` field on the transaction reflects the running total. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-GAME-002: Coin Balance Accuracy (Transaction Ledger)

| Field | Value |
|:------|:------|
| **Test ID** | TS-GAME-002 |
| **Test Scenario** | Verify that the coin balance is accurately maintained as a running total in the transaction ledger |
| **Pre-conditions** | 1. Student is logged in. 2. Student has existing coin transactions. |
| **Test Steps** | 1. Get current balance via `GET /api/coins/balance`. 2. Get full transaction history via `GET /api/coins/history`. 3. Manually sum all transaction amounts from oldest to newest. 4. Compare the calculated sum with the reported balance. 5. Verify the `balance` field on the latest transaction matches the API response. |
| **Expected Result** | 1. The sum of all transaction `amount` values equals the current balance. 2. Each transaction's `balance` field equals the running total at that point. 3. No discrepancies between computed and stored balance. 4. Transactions are ordered chronologically by `createdAt`. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-GAME-003: Daily Challenge Progress Tracking

| Field | Value |
|:------|:------|
| **Test ID** | TS-GAME-003 |
| **Test Scenario** | Verify that daily challenges track progress correctly as the student completes qualifying actions |
| **Pre-conditions** | 1. Student is logged in. 2. Active daily challenges exist (e.g., "Complete 3 quizzes today"). 3. Challenge progress is at 0 for today. |
| **Test Steps** | 1. Get current challenges via `GET /api/challenges/daily`. 2. Note the `currentValue` and `targetValue` for a daily challenge. 3. Complete the qualifying action (e.g., complete a quiz). 4. Check challenge progress again. 5. Repeat until `currentValue` reaches `targetValue`. |
| **Expected Result** | 1. `currentValue` increments by 1 after each qualifying action. 2. `isCompleted` remains `false` until target is reached. 3. When `currentValue >= targetValue`, `isCompleted` becomes `true`. 4. Progress is tracked in `challengeProgress` table. 5. Challenge does not auto-claim rewards (requires explicit claim). |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-GAME-004: Weekly Challenge Reset

| Field | Value |
|:------|:------|
| **Test ID** | TS-GAME-004 |
| **Test Scenario** | Verify that weekly challenges reset at the scheduled time with new challenges generated |
| **Pre-conditions** | 1. Weekly challenges exist with progress data. 2. Challenge scheduler is running (`server/challengeScheduler.ts`). 3. Current time is near or past the weekly reset point. |
| **Test Steps** | 1. Note current weekly challenge IDs and progress. 2. Trigger or wait for the weekly reset (via scheduler or manual trigger). 3. Get weekly challenges via `GET /api/challenges/weekly`. 4. Verify new challenges are generated. 5. Verify previous week's progress is archived or reset. |
| **Expected Result** | 1. New weekly challenges are created with fresh `challengeProgress` records. 2. Previous progress records have `resetAt` timestamp set. 3. `currentValue` on new challenges starts at 0. 4. Unclaimed rewards from expired challenges are forfeited. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-GAME-005: Challenge Reward Claiming

| Field | Value |
|:------|:------|
| **Test ID** | TS-GAME-005 |
| **Test Scenario** | Verify that a student can claim rewards (coins + XP) for completed challenges |
| **Pre-conditions** | 1. Student has a completed challenge (`isCompleted = true`, `isClaimed = false`). 2. Student's current coin and XP balance are known. |
| **Test Steps** | 1. Get completed challenges via `GET /api/challenges/daily` or `GET /api/challenges/weekly`. 2. Find a challenge with `isCompleted = true` and `isClaimed = false`. 3. Claim the reward via `POST /api/challenges/:challengeId/claim`. 4. Verify coin balance increased. 5. Verify XP increased. 6. Verify `isClaimed` is now `true`. |
| **Expected Result** | 1. Claim returns HTTP 200 with reward details. 2. Coin balance increases by challenge's `coinReward`. 3. XP increases by challenge's `xpReward`. 4. `isClaimed = true` on the challenge progress record. 5. A `coinTransactions` record is created with `type = 'challenge_reward'`. 6. Attempting to claim again returns error (already claimed). |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-GAME-006: Power-Up Purchase from Shop

| Field | Value |
|:------|:------|
| **Test ID** | TS-GAME-006 |
| **Test Scenario** | Verify that a student can purchase a power-up from the shop using coins |
| **Pre-conditions** | 1. Student is logged in with sufficient coin balance. 2. Power-up catalog has active items (e.g., XP Boost, Hint). 3. Student's current coin balance >= power-up cost. |
| **Test Steps** | 1. Get power-up catalog via `GET /api/powerups/catalog`. 2. Note a power-up's `id` and `coinCost`. 3. Get current coin balance. 4. Purchase the power-up via `POST /api/powerups/purchase`. 5. Verify coin balance decreased. 6. Check inventory via `GET /api/powerups/inventory`. |
| **Expected Result** | 1. Purchase returns HTTP 200. 2. Coin balance decreases by `coinCost`. 3. A `coinTransactions` record is created with `type = 'powerup_purchase'` and negative amount. 4. `powerUpInventory` record created/incremented for the user. 5. Attempting purchase with insufficient coins returns HTTP 400. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-GAME-007: Power-Up Activation and Expiry

| Field | Value |
|:------|:------|
| **Test ID** | TS-GAME-007 |
| **Test Scenario** | Verify that a purchased power-up can be activated, applies its effect, and expires correctly |
| **Pre-conditions** | 1. Student has a power-up in inventory (quantity >= 1). 2. Power-up type and effect are known (e.g., XP Boost = 2x XP for duration). |
| **Test Steps** | 1. Activate the power-up via `POST /api/powerups/activate`. 2. Verify an `activePowerUps` record is created with `activatedAt` and `expiresAt`. 3. Verify the effect is applied (e.g., XP earnings doubled during active period). 4. Wait for expiry or check after `expiresAt`. 5. Verify the power-up is no longer active. 6. Verify inventory quantity decreased by 1. |
| **Expected Result** | 1. Activation returns HTTP 200. 2. `activePowerUps` record created with correct `effect`, `activatedAt`, `expiresAt`. 3. During active period, the power-up effect modifies quiz/XP outcomes. 4. After `expiresAt`, power-up no longer applies. 5. `powerUpInventory` quantity decremented. 6. `usesRemaining` tracks limited-use power-ups. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-GAME-008: Cosmetic Purchase and Equip

| Field | Value |
|:------|:------|
| **Test ID** | TS-GAME-008 |
| **Test Scenario** | Verify that a student can purchase a cosmetic item and equip it to their profile |
| **Pre-conditions** | 1. Student is logged in with sufficient coins. 2. Cosmetic catalog has active items (e.g., avatar_ring, name_color). |
| **Test Steps** | 1. Get cosmetic catalog via `GET /api/cosmetics/catalog`. 2. Purchase a cosmetic via `POST /api/cosmetics/purchase`. 3. Verify ownership via `GET /api/cosmetics/owned`. 4. Equip the cosmetic via `POST /api/cosmetics/equip`. 5. Verify the cosmetic is equipped via `GET /api/cosmetics/equipped`. 6. Unequip via `POST /api/cosmetics/unequip`. |
| **Expected Result** | 1. Purchase creates `cosmeticOwnership` record. 2. Coins deducted by `coinCost`. 3. Equip creates/updates `equippedCosmetics` record for the appropriate `slot`. 4. Only one cosmetic per slot can be equipped at a time. 5. Unequip removes the `equippedCosmetics` record. 6. Cosmetic effects render in the UI (e.g., colored name, avatar ring). |
| **Priority** | P4 (Low) |
| **Status** | Not Executed |

#### TS-GAME-009: Season Pass Progression

| Field | Value |
|:------|:------|
| **Test ID** | TS-GAME-009 |
| **Test Scenario** | Verify that the season pass tracks XP progress across tiers and grants rewards at each tier milestone |
| **Pre-conditions** | 1. Active season pass exists (`seasonPassConfig` with `isActive = true`). 2. Season pass tiers are defined with XP requirements and rewards. 3. Student has season pass progress record. |
| **Test Steps** | 1. Get season pass info via `GET /api/season-pass`. 2. Note current tier and XP. 3. Earn XP through quiz completion or other actions. 4. Check season pass progress update. 5. When XP exceeds next tier's `xpRequired`, verify tier advancement. 6. Claim tier rewards. |
| **Expected Result** | 1. `seasonPassProgress` updates `currentXP` as XP is earned. 2. `currentTier` advances when `currentXP >= xpRequired` for next tier. 3. Tier rewards (coins, XP, cosmetics, power-ups) are claimable. 4. Premium tiers are only accessible if premium pass is purchased. 5. `playerSeasonRewards` tracks claimed rewards per tier. |
| **Priority** | P4 (Low) |
| **Status** | Not Executed |

#### TS-GAME-010: Achievement Unlock Tracking

| Field | Value |
|:------|:------|
| **Test ID** | TS-GAME-010 |
| **Test Scenario** | Verify that achievements unlock when their requirements are met |
| **Pre-conditions** | 1. Achievement catalog contains achievements with defined requirements (e.g., "Complete 10 quizzes"). 2. Student's progress is below the achievement threshold. |
| **Test Steps** | 1. Get achievement list via `GET /api/achievements`. 2. Note an achievement's `requirement` and `targetValue`. 3. Perform actions to increment progress toward the achievement. 4. Check achievement progress updates. 5. When `progress >= targetValue`, verify `isUnlocked = true`. |
| **Expected Result** | 1. `achievementUnlocks.progress` increments with qualifying actions. 2. When threshold is met, `isUnlocked = true` and `unlockedAt` is set. 3. Achievement rewards (coins, XP, permanentBonus) are granted. 4. Achievement notification is displayed in the UI. |
| **Priority** | P4 (Low) |
| **Status** | Not Executed |

#### TS-GAME-011: Login Streak Tracking

| Field | Value |
|:------|:------|
| **Test ID** | TS-GAME-011 |
| **Test Scenario** | Verify that consecutive daily logins increment the login streak and missing a day resets it |
| **Pre-conditions** | 1. Student account exists with `loginStreaks` record. 2. Student has not logged in today. |
| **Test Steps** | 1. Note the student's `currentStreak` and `lastLoginDate`. 2. Log in today. 3. Verify `currentStreak` increments by 1. 4. Verify `lastLoginDate` updates to today. 5. Verify streak coins are awarded. 6. (Reset test) Skip a day and log in again. 7. Verify `currentStreak` resets to 1. |
| **Expected Result** | 1. Consecutive daily login increments `currentStreak`. 2. `longestStreak` updates if current exceeds previous longest. 3. Missing a day resets `currentStreak` to 1. 4. `totalCoinsEarned` tracks cumulative streak rewards. 5. Date comparison uses normalized dates (ignoring time) to avoid timezone issues. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-GAME-012: Leaderboard Ranking

| Field | Value |
|:------|:------|
| **Test ID** | TS-GAME-012 |
| **Test Scenario** | Verify that the leaderboard accurately ranks users within an organization by score |
| **Pre-conditions** | 1. Multiple students exist in the same organization with varying scores. 2. Leaderboard data is populated in `leaderBoard` and/or `playerStats`. |
| **Test Steps** | 1. Log in as a student. 2. Get leaderboard via `GET /api/leaderboard`. 3. Verify users are ranked by score in descending order. 4. Verify the list is scoped to the user's organization. 5. Verify current user's position is included. 6. As SuperAdmin, test cross-org leaderboard with `?crossOrg=true`. |
| **Expected Result** | 1. Leaderboard returns users sorted by score (highest first). 2. Each entry includes `userId`, `rank`, `score`, `wins`, `losses`. 3. Only users from the same organization are shown (unless SuperAdmin cross-org). 4. Current user's rank and stats are included. 5. Leaderboard limit parameter works correctly. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-GAME-013: XP Earning and Level Up

| Field | Value |
|:------|:------|
| **Test ID** | TS-GAME-013 |
| **Test Scenario** | Verify that XP is awarded for qualifying actions and that levels advance correctly using the progressive XP formula |
| **Pre-conditions** | 1. Student account has `playerStats` with known `totalXP` and `level`. 2. XP reward rules are configured in `gamificationEconomyRules`. |
| **Test Steps** | 1. Note current `totalXP` and `level` from `playerStats`. 2. Complete a qualifying action (e.g., quiz completion). 3. Verify XP is added to `totalXP`. 4. If XP crosses the level threshold (per `shared/levelUtils.ts` formula), verify `level` increments. 5. Check that level-up triggers are fired (e.g., achievement check, notification). |
| **Expected Result** | 1. `totalXP` increases by the configured XP reward amount. 2. Level calculation follows the progressive formula in `levelUtils.ts` (levels 1-100). 3. Level advances when `totalXP >= xpRequiredForNextLevel`. 4. `playerStats.level` is updated. 5. Level-up awards any bonus rewards. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-GAME-014: Admin Economy Rules Configuration

| Field | Value |
|:------|:------|
| **Test ID** | TS-GAME-014 |
| **Test Scenario** | Verify that an admin can configure gamification economy rules (coin/XP rewards per action) and that changes take effect |
| **Pre-conditions** | 1. User is logged in as OrgAdmin or SuperAdmin. 2. Gamification economy rules table is accessible. |
| **Test Steps** | 1. Get current economy rules via `GET /api/gamification/economy-rules`. 2. Create or update a rule via `POST /api/gamification/economy-rules` (e.g., set quiz_completion reward to 50 coins). 3. Have a student complete a quiz. 4. Verify the student receives the updated coin amount (50 coins). 5. Update the rule to a different value (e.g., 100 coins). 6. Have the student complete another quiz. 7. Verify the new amount (100 coins) is awarded. |
| **Expected Result** | 1. Economy rules CRUD operations succeed. 2. Rules can be scoped to `global` or `org` level. 3. Org-level rules override global rules for that organization. 4. Changed rules take effect immediately for subsequent actions. 5. `gamificationEconomyRules` records persist correctly. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-GAME-015: Concurrent Coin Operations (Race Condition Test)

| Field | Value |
|:------|:------|
| **Test ID** | TS-GAME-015 |
| **Test Scenario** | Verify that concurrent coin transactions do not result in incorrect balances due to race conditions |
| **Pre-conditions** | 1. Student account exists with a known coin balance (e.g., 1000 coins). 2. Ability to send concurrent API requests (via script or Postman runner). |
| **Test Steps** | 1. Note the student's current coin balance: 1000. 2. Simultaneously send 10 concurrent requests that each deduct 100 coins (e.g., power-up purchases). 3. Wait for all responses. 4. Check the final coin balance. 5. Count the number of successful vs. failed transactions. 6. Verify the balance is consistent with the number of successful deductions. |
| **Expected Result** | 1. The `gamificationService` uses `SELECT FOR UPDATE` row-level locking for coin operations. 2. Exactly 10 of the 10 requests succeed (if balance allows) or some fail with "insufficient funds". 3. Final balance = 1000 - (successful_deductions * 100). 4. No negative balance is possible. 5. `coinTransactions` ledger is consistent — each transaction's `balance` field matches the running total. 6. No duplicate or missing transactions. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

---

### P2.5 Test Suite: Organization Management (TS-ORG)

**Suite Objective:** Validate organization lifecycle management including registration, hierarchy, join requests, subscriptions, seat management, and credit wallets.  
**Related Phase 1 Section:** 3.6 Organization Management  
**Primary Route Module:** `server/routes/orgRoutes.ts` (62 endpoints)  

#### TS-ORG-001: Organization Registration

| Field | Value |
|:------|:------|
| **Test ID** | TS-ORG-001 |
| **Test Scenario** | Verify that a new organization can be registered via the registration wizard with correct type, hierarchy, and admin user |
| **Pre-conditions** | 1. No organization exists with the proposed name. 2. Registering user has a valid account. |
| **Test Steps** | 1. Navigate to `/org-registration`. 2. Select organization type: "business". 3. Enter organization name: "Test Corp Ltd". 4. Configure initial hierarchy (units, sub-units, teams). 5. Submit registration via `POST /api/org/register`. 6. Verify the organization record in the database. 7. Verify the registering user is assigned the `org_admin` role. |
| **Expected Result** | 1. Organization record created in `organizations` table with `type = 'business'`, `isActive = true`. 2. `inviteCode` and `joinCode` are generated. 3. `trialStartDate` and `trialEndDate` are set (trial period begins). 4. `subscriptionStatus = 'active'` (trial). 5. User gets `org_admin` role in `userOrganizationRoles`. 6. Organization hierarchy records created in `organizationUnits`, `organizationSubUnits`, `organizationTeams`. 7. `customTerminology` is set based on org type. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-ORG-002: 3-Level Hierarchy Creation (Unit > SubUnit > Team)

| Field | Value |
|:------|:------|
| **Test ID** | TS-ORG-002 |
| **Test Scenario** | Verify the complete 3-level hierarchy CRUD: create, read, update, and delete units, sub-units, and teams |
| **Pre-conditions** | 1. Organization exists. 2. User is logged in as OrgAdmin. |
| **Test Steps** | 1. Create a department (unit) via `POST /api/organization/:orgId/departments`. 2. Create a sub-unit under the department via `POST /api/organization/:orgId/departments/:deptId/units`. 3. Create a team under the sub-unit via `POST /api/organization/:orgId/units/:unitId/teams`. 4. Read full hierarchy via `GET /api/organization/hierarchy/:orgId`. 5. Update the team name via `PATCH /api/organization/:orgId/teams/:teamId`. 6. Delete the team via `DELETE /api/organization/:orgId/teams/:teamId`. 7. Verify cascade behavior. |
| **Expected Result** | 1. All hierarchy levels are created with unique codes and correct parent references. 2. Full hierarchy read returns a tree structure with all 3 levels. 3. Updates persist correctly. 4. Delete removes the entity and updates sort orders. 5. Teams have join codes generated. 6. Hierarchy data is org-scoped (cannot see other org's hierarchy). |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-ORG-003: Join Request Submission

| Field | Value |
|:------|:------|
| **Test ID** | TS-ORG-003 |
| **Test Scenario** | Verify that a registered user can submit a join request to an organization |
| **Pre-conditions** | 1. User exists but is not a member of Organization A. 2. Organization A's invite code is known. |
| **Test Steps** | 1. Log in as a user not affiliated with Org A. 2. Submit a join request with the org's invite code. 3. Optionally select unit, sub-unit, and team. 4. Verify join request record is created in `joinRequests` table. |
| **Expected Result** | 1. Join request created with `status = 'pending'`. 2. Request includes `userId`, `organizationId`, `unitId`, `subUnitId`, `teamId`. 3. OrgAdmin receives a notification (in-app and/or email). 4. User cannot submit duplicate pending requests to the same org. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-ORG-004: Join Request Approval (Manual)

| Field | Value |
|:------|:------|
| **Test ID** | TS-ORG-004 |
| **Test Scenario** | Verify that an OrgAdmin can manually approve a pending join request, granting the user membership and a role |
| **Pre-conditions** | 1. Pending join request exists. 2. User is logged in as OrgAdmin. |
| **Test Steps** | 1. List pending requests via `GET /api/org/:orgId/join-requests`. 2. Approve the request via `POST /api/org/join-requests/:id/approve`. 3. Verify `joinRequests.status` changes to `approved`. 4. Verify `userOrganizationRoles` record is created for the user. 5. Verify `userOrganizationAssignments` places the user in the correct hierarchy node. |
| **Expected Result** | 1. Approval returns HTTP 200. 2. Request status = `approved`. 3. User now has a role in the organization. 4. User is placed in the requested unit/sub-unit/team. 5. User can now access Org A's resources. 6. Approval email is sent to the user. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-ORG-005: Join Request Approval via Email Token

| Field | Value |
|:------|:------|
| **Test ID** | TS-ORG-005 |
| **Test Scenario** | Verify that a join request can be approved via a one-click email token link |
| **Pre-conditions** | 1. Pending join request exists. 2. `joinRequestApprovalTokens` record exists with valid (non-expired) token. |
| **Test Steps** | 1. Retrieve the approval token (from email or `joinRequestApprovalTokens` table). 2. Call `GET /api/org/join-requests/approve-via-token/:token`. 3. Verify the join request status changes to `approved`. 4. Verify the token is marked as used (`usedAt` set). 5. Attempt to use the same token again. |
| **Expected Result** | 1. Token approval returns HTTP 200. 2. Join request status = `approved`. 3. Token's `usedAt` is set to current timestamp. 4. Reusing the token returns an error (already used). 5. Expired tokens return an error (token expired). 6. User membership is granted as in manual approval. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-ORG-006: Bulk Approve/Deny Join Requests

| Field | Value |
|:------|:------|
| **Test ID** | TS-ORG-006 |
| **Test Scenario** | Verify that an admin can bulk approve or deny multiple join requests simultaneously |
| **Pre-conditions** | 1. Multiple pending join requests exist (at least 3). 2. User is logged in as OrgAdmin or Teacher. |
| **Test Steps** | 1. List pending requests. 2. Select 3 request IDs. 3. Call `POST /api/org/join-requests/bulk-approve` with the selected IDs. 4. Verify all 3 requests are approved. 5. Create 3 more pending requests. 6. Call `POST /api/org/join-requests/bulk-deny` with the new IDs. 7. Verify all 3 are denied. |
| **Expected Result** | 1. Bulk approve processes all requests — each status = `approved`. 2. User roles and assignments created for each approved user. 3. Bulk deny sets all statuses to `denied`. 4. Denied users do not receive org membership. 5. Appropriate notification emails sent for each action. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-ORG-007: User Role Assignment

| Field | Value |
|:------|:------|
| **Test ID** | TS-ORG-007 |
| **Test Scenario** | Verify that an admin can assign and change user roles within an organization |
| **Pre-conditions** | 1. User exists in Organization A with role `student`. 2. Admin (OrgAdmin) is logged in. |
| **Test Steps** | 1. View the user's current role. 2. Change the user's role to `teacher` via the admin interface. 3. Verify `userOrganizationRoles.role` is updated. 4. Verify the user can now access teacher-level endpoints. 5. Change the role back to `student`. 6. Verify access is restricted again. |
| **Expected Result** | 1. Role change persists in `userOrganizationRoles`. 2. Session context is invalidated (user may need to re-login to get new role). 3. New role grants appropriate endpoint access. 4. Role hierarchy is enforced: `org_admin > teacher > team_lead > student`. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-ORG-008: Subscription Lifecycle (Trial → Active → Upgrade → Downgrade)

| Field | Value |
|:------|:------|
| **Test ID** | TS-ORG-008 |
| **Test Scenario** | Verify the complete subscription lifecycle from trial through active, upgrade, and downgrade |
| **Pre-conditions** | 1. Organization exists in trial period (`subscriptionStatus = 'active'`, `trialEndDate` in the future). 2. Subscription plans exist in `subscriptionPlans` or `elearningSubscriptionPlans`. |
| **Test Steps** | 1. Verify org is in trial: `GET /api/organizations/:id/subscription`. 2. Subscribe to a plan via `POST /api/organizations/:id/subscribe`. 3. Verify `subscriptions` record is created with correct plan. 4. Upgrade to a higher plan via `POST /api/organizations/:id/upgrade`. 5. Verify subscription updated. 6. Schedule a downgrade via `POST /api/organizations/:id/schedule-downgrade`. 7. Preview downgrade impact via `GET /api/organizations/:id/downgrade-preview`. 8. Cancel the scheduled downgrade via `DELETE /api/organizations/:id/scheduled-downgrade`. |
| **Expected Result** | 1. Trial org has limited features per `trialLockoutMiddleware`. 2. Subscription creates a `subscriptions` record and invoice. 3. Upgrade changes plan ID and may prorate charges. 4. Downgrade is scheduled for end of billing period (not immediate). 5. Downgrade preview shows what features/seats will be lost. 6. Canceling scheduled downgrade reverts to current plan. 7. Each state change creates a `subscriptionEvents` record. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-ORG-009: Seat Utilization Tracking

| Field | Value |
|:------|:------|
| **Test ID** | TS-ORG-009 |
| **Test Scenario** | Verify that seat utilization is tracked and enforcement prevents exceeding the seat limit |
| **Pre-conditions** | 1. Organization has `maxSeats` configured (e.g., 10 seats). 2. Organization currently has < maxSeats active users. |
| **Test Steps** | 1. Check seat utilization via `GET /api/organizations/:id/seat-utilization`. 2. Add users until at the seat limit. 3. Attempt to add one more user beyond the limit. 4. Verify the overage is handled per `seatPolicyService`. |
| **Expected Result** | 1. Seat utilization reports `usedSeats / maxSeats`. 2. When at limit, new user addition is either blocked or handled per policy. 3. `organizationLicenseSettings.seatEnforcementEnabled` controls strict vs. soft enforcement. 4. Disabled users do not count toward seat limit (per `GET /api/organizations/:id/disabled-users`). |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-ORG-010: Org Credit Wallet Operations

| Field | Value |
|:------|:------|
| **Test ID** | TS-ORG-010 |
| **Test Scenario** | Verify that the organization credit wallet tracks credits accurately across deposits and deductions |
| **Pre-conditions** | 1. Organization exists with credit wallet. 2. OrgAdmin or SuperAdmin is logged in. |
| **Test Steps** | 1. Get wallet balance via `GET /api/org-wallet/:orgId/balance`. 2. Perform an action that deducts org credits (e.g., AI generation that uses hybrid credit service). 3. Check balance again. 4. View transaction history via `GET /api/org-wallet/:orgId/transactions`. 5. View wallet summary via `GET /api/org-wallet/:orgId/summary`. |
| **Expected Result** | 1. Balance reflects current org credit amount. 2. Deductions reduce balance and create `orgCreditLedger` records. 3. Transaction history shows all credit movements with timestamps. 4. Summary provides aggregated credit usage data. 5. Combined view (`GET /api/org-wallet/:orgId/combined-transactions`) merges user and org transactions. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-ORG-011: SuperAdmin Credit Adjustment

| Field | Value |
|:------|:------|
| **Test ID** | TS-ORG-011 |
| **Test Scenario** | Verify that a SuperAdmin can manually adjust an organization's credit balance |
| **Pre-conditions** | 1. User is logged in as SuperAdmin. 2. Target organization exists. |
| **Test Steps** | 1. Get current org credit balance. 2. Call `POST /api/admin/org-credits/:orgId/adjust` with `{ amount: 500, reason: "QA test adjustment" }`. 3. Verify balance increased by 500. 4. Call the same endpoint with `{ amount: -200, reason: "QA test deduction" }`. 5. Verify balance decreased by 200. 6. Check `orgCreditLedger` for both transactions. |
| **Expected Result** | 1. Positive adjustment increases balance. 2. Negative adjustment decreases balance. 3. Both create `orgCreditLedger` records with `performedBy = superadmin userId`. 4. Only SuperAdmin can access this endpoint (isSuperAdmin guard). 5. OrgAdmin or Teacher receives HTTP 403. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-ORG-012: Demo Org Behavior (Bypass Trial Expiration)

| Field | Value |
|:------|:------|
| **Test ID** | TS-ORG-012 |
| **Test Scenario** | Verify that demo organizations bypass trial expiration enforcement |
| **Pre-conditions** | 1. Organization exists with `isDemo = true`. 2. Organization's `trialEndDate` is in the past. |
| **Test Steps** | 1. Log in as a user in the demo organization. 2. Access a premium feature that would be locked for expired-trial orgs. 3. Verify the feature is accessible despite expired trial. 4. Compare with a non-demo org with expired trial. |
| **Expected Result** | 1. Demo org users can access all features regardless of trial status. 2. `trialLockoutMiddleware` skips enforcement for demo orgs. 3. Non-demo orgs with expired trials are correctly locked out. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

---

### P2.6 Test Suite: Course Assignment & Progress (TS-ASSIGN)

**Suite Objective:** Validate course assignment workflows, progress tracking, quiz gating, certificate generation, and completion detection.  
**Related Phase 1 Section:** 3.7 Course Assignment & Progress Tracking  
**Primary Route Module:** `server/routes/courseRoutes.ts` (assignment & progress endpoints)  
**Primary Services:** `courseAssignmentService.ts`, `lessonProgressService.ts`, `courseCompletionService.ts`, `certificateService.ts`  

#### TS-ASSIGN-001: Assign Course to Individual User

| Field | Value |
|:------|:------|
| **Test ID** | TS-ASSIGN-001 |
| **Test Scenario** | Verify that a Teacher or Admin can assign a course to a specific user |
| **Pre-conditions** | 1. Published course exists with at least 2 lessons. 2. Target student user exists in the same organization. 3. Assigner is logged in as Teacher or Admin. |
| **Test Steps** | 1. Open the CourseAssignmentModal or call the assignment API. 2. Select the target user. 3. Assign the course via `POST /api/course-assignments`. 4. Verify assignment record in `courseAssignments`. 5. As the student, verify the course appears in `GET /api/my-assigned-courses`. |
| **Expected Result** | 1. Assignment created with `userId`, `courseId`, `organizationId`. 2. Student sees the assigned course in their dashboard. 3. `courseProgress` record is initialized for the user. 4. Duplicate assignment for the same user+course is prevented (unique constraint). |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-ASSIGN-002: Assign Course to Department (Scope Cascade)

| Field | Value |
|:------|:------|
| **Test ID** | TS-ASSIGN-002 |
| **Test Scenario** | Verify that assigning a course to a department cascades to all users within that department hierarchy |
| **Pre-conditions** | 1. Published course exists. 2. Department (unit) has sub-units and teams with users. 3. Assigner is logged in as Teacher or Admin. |
| **Test Steps** | 1. Assign course to a department (scope = unit level). 2. Verify all users in the department's sub-units and teams can see the assignment. 3. Add a new user to the department after assignment. 4. Verify the new user also receives the assignment (if real-time cascade). |
| **Expected Result** | 1. Assignment record created with `unitId` scope. 2. All existing users in the unit hierarchy can access the course. 3. Scope-based resolution includes sub-units and teams under the unit. 4. `courseAssignmentService` resolves the scope cascade correctly. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-ASSIGN-003: Assign Course to Team

| Field | Value |
|:------|:------|
| **Test ID** | TS-ASSIGN-003 |
| **Test Scenario** | Verify that assigning a course to a team makes it available to all team members |
| **Pre-conditions** | 1. Published course exists. 2. Team has at least 2 members. |
| **Test Steps** | 1. Assign course to a specific team. 2. As each team member, verify the course is accessible. 3. As a user from a different team, verify the course is NOT accessible via this assignment. |
| **Expected Result** | 1. Assignment record created with `teamId` scope. 2. Team members see the course. 3. Non-team members do not see the course (unless separately assigned). |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-ASSIGN-004: Mandatory Assignment with Due Date

| Field | Value |
|:------|:------|
| **Test ID** | TS-ASSIGN-004 |
| **Test Scenario** | Verify that mandatory assignments with due dates are tracked and deadlines are enforced |
| **Pre-conditions** | 1. Course assignment exists with `isMandatory = true` and a `dueDate` set. |
| **Test Steps** | 1. Create a mandatory assignment with due date 7 days in the future. 2. Verify assignment record has `isMandatory = true` and `dueDate`. 3. As a student, verify the due date is displayed. 4. After the due date passes, verify the assignment is flagged as overdue. 5. Check that deadline tracking reports capture this. |
| **Expected Result** | 1. Mandatory flag and due date persist in `courseAssignments`. 2. Student UI shows deadline indicator. 3. After due date, assignment is marked as overdue in reports. 4. `emailSchedulerService` may send deadline reminder emails. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-ASSIGN-005: Lesson Progress Tracking (Slide Viewed Count)

| Field | Value |
|:------|:------|
| **Test ID** | TS-ASSIGN-005 |
| **Test Scenario** | Verify that lesson progress is tracked by counting slides viewed |
| **Pre-conditions** | 1. Lesson exists with multiple slides. 2. Student has not viewed this lesson. |
| **Test Steps** | 1. Open the lesson viewer as a student. 2. View slide 1. 3. Check progress via API — `lessonProgress.percentComplete` should be > 0. 4. View slides 2 and 3. 5. Check that `percentComplete` increases proportionally. 6. View all slides. 7. Verify `percentComplete` is near or at 100. |
| **Expected Result** | 1. `lessonProgress` record created on first access with `status = 'in_progress'`. 2. `lessonProgressSlides` tracks which slides have been viewed. 3. `percentComplete` = (slides viewed / total slides) * 100. 4. Progress updates persist across sessions. 5. Viewing the same slide twice does not double-count. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-ASSIGN-006: Lesson Completion (Triggers Certificate)

| Field | Value |
|:------|:------|
| **Test ID** | TS-ASSIGN-006 |
| **Test Scenario** | Verify that completing a lesson (100% progress) triggers automatic certificate generation |
| **Pre-conditions** | 1. Lesson exists with all slides. 2. Student has viewed all slides except the last one. 3. Certificate generation is enabled for the organization. |
| **Test Steps** | 1. View the final slide to reach 100% progress. 2. Verify `lessonProgress.status` changes to `completed`. 3. Verify `lessonProgress.completedAt` is set. 4. Check `certificates` table for a new certificate record. 5. Verify the certificate has `type = 'lesson'`, correct `userId`, `lessonId`. |
| **Expected Result** | 1. Status transitions to `completed` when `percentComplete = 100`. 2. `completedAt` timestamp is set. 3. Certificate is auto-generated via `CertificateService`. 4. Certificate includes organization branding (colors, logo). 5. Certificate is unique per user+lesson (`UNQ_user_lesson_cert` constraint). 6. Daily streak is updated for the student. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-ASSIGN-007: Course Completion (All Lessons Done)

| Field | Value |
|:------|:------|
| **Test ID** | TS-ASSIGN-007 |
| **Test Scenario** | Verify that a course is marked as complete when all lessons within it are completed |
| **Pre-conditions** | 1. Course exists with 3 lessons. 2. Student has completed 2 of 3 lessons. 3. Course assignment exists. |
| **Test Steps** | 1. Complete the final lesson in the course. 2. Verify `courseProgress` record updates. 3. Check course completion status via `GET /api/courses/:courseId/certificate-status`. 4. Generate course certificate via `POST /api/courses/:courseId/certificate`. |
| **Expected Result** | 1. `courseCompletionService` detects all lessons are complete. 2. `courseProgress.percentComplete = 100`. 3. Course certificate is generated with `type = 'course'`. 4. Certificate includes all lesson completions. 5. `userCourseLessonProgress` tracks per-lesson status within the course. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-ASSIGN-008: Quiz Gating (Must Pass Quiz Before Next Lesson)

| Field | Value |
|:------|:------|
| **Test ID** | TS-ASSIGN-008 |
| **Test Scenario** | Verify that quiz gating prevents accessing the next lesson until the current lesson's quiz is passed |
| **Pre-conditions** | 1. Course has lessons with linked quizzes (via `courseLessons.primaryQuizId`). 2. Quiz has a `passRate` threshold configured. 3. Student has completed Lesson 1 but not passed its quiz. |
| **Test Steps** | 1. Complete Lesson 2 (view all slides). 2. Attempt to access Lesson 3. 3. Verify access is blocked because Lesson 2's quiz has not been passed. 4. Take and pass Lesson 2's quiz. 5. Attempt to access Lesson 3 again. |
| **Expected Result** | 1. `LessonProgressService.checkQuizRequirementForLesson` returns `{ requiresQuiz: true, quizPassed: false }`. 2. Lesson 3 access is blocked until quiz is passed. 3. After passing the quiz, `quizPassed = true` and Lesson 3 becomes accessible. 4. Gating is per-course context (same lesson in a different course may not have gating). |
| **Priority** | P1 (Critical) |
| **Status** | Not Executed |

#### TS-ASSIGN-009: First Lesson Exemption from Quiz Gating

| Field | Value |
|:------|:------|
| **Test ID** | TS-ASSIGN-009 |
| **Test Scenario** | Verify that the first lesson in a course (overview/introduction) is exempt from quiz gating |
| **Pre-conditions** | 1. Course exists with the first lesson at `topicOrder = 1`. 2. First lesson has a linked quiz. 3. Student has not taken any quizzes. |
| **Test Steps** | 1. As a student, access Lesson 1 (first in course order). 2. Verify access is granted without quiz requirement. 3. Complete Lesson 1 without taking its quiz. 4. Attempt to access Lesson 2. 5. Verify Lesson 2 is accessible (gating applies from Lesson 2 onward). |
| **Expected Result** | 1. `LessonProgressService.checkQuizRequirementForLesson` returns `{ isFirstLesson: true }` for `topicOrder = 1`. 2. First lesson is always accessible regardless of quiz status. 3. Quiz gating only applies to lessons after the first one. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-ASSIGN-010: Certificate Generation (Lesson Type)

| Field | Value |
|:------|:------|
| **Test ID** | TS-ASSIGN-010 |
| **Test Scenario** | Verify that a lesson completion certificate is generated with correct data and organization branding |
| **Pre-conditions** | 1. Student has completed a lesson. 2. Organization has branding theme with logo and colors. |
| **Test Steps** | 1. Trigger certificate generation (automatic on completion or manual). 2. Retrieve the certificate record from `certificates` table. 3. Verify certificate data: `type = 'lesson'`, `userId`, `lessonId`, `organizationId`. 4. Verify branding: org logo URL, primary/secondary/accent colors from theme. 5. Verify certificate is downloadable/viewable. |
| **Expected Result** | 1. Certificate record created in `certificates` table. 2. `certificateData` (JSONB) contains user name, lesson title, completion date, org branding. 3. Branding colors are extracted from the org's `brandingThemes` via `extractColorFromTokens`. 4. Certificate renders correctly with custom branding. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-ASSIGN-011: Certificate Generation (Course Type)

| Field | Value |
|:------|:------|
| **Test ID** | TS-ASSIGN-011 |
| **Test Scenario** | Verify that a course completion certificate is generated when all lessons in a course are completed |
| **Pre-conditions** | 1. Course exists with all lessons completed by the student. 2. Student has passed all required quizzes. |
| **Test Steps** | 1. Verify course completion via `GET /api/courses/:courseId/certificate-status`. 2. Generate certificate via `POST /api/courses/:courseId/certificate`. 3. Verify certificate record: `type = 'course'`, `courseId` set. 4. Verify certificate includes course title and all lesson completions. |
| **Expected Result** | 1. Certificate eligibility check returns `eligible = true`. 2. Course certificate is generated with `type = 'course'`. 3. Certificate data includes course title, all lesson titles, completion dates. 4. Certificate is unique per user+course combination. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-ASSIGN-012: Certificate Uniqueness (No Duplicate per User+Lesson)

| Field | Value |
|:------|:------|
| **Test ID** | TS-ASSIGN-012 |
| **Test Scenario** | Verify that attempting to generate a duplicate certificate for the same user+lesson combination is handled idempotently |
| **Pre-conditions** | 1. Student has already received a certificate for a specific lesson. 2. Certificate record exists with `UNQ_user_lesson_cert` constraint. |
| **Test Steps** | 1. Verify existing certificate exists for user+lesson. 2. Re-trigger lesson completion (or manual certificate generation). 3. Observe behavior — should not create a duplicate. 4. Verify only one certificate record exists. |
| **Expected Result** | 1. `UNQ_user_lesson_cert` unique constraint prevents duplicate inserts. 2. Second attempt either returns the existing certificate or is silently ignored. 3. No error is thrown (idempotent operation). 4. `certificates` table has exactly one record for the user+lesson+type combination. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

---

### P2.7 Test Suite: Analytics & Reporting (TS-REPORT)

**Suite Objective:** Validate analytics dashboards, reports, and data aggregation accuracy.  
**Related Phase 1 Section:** 3.3 Analytics & Reporting (Measure Pillar)  
**Primary Route Module:** `server/routes/reportRoutes.ts` (24 endpoints)  
**Primary Services:** `analyticsService.ts`, `platformAnalyticsService.ts`  

#### TS-REPORT-001: Organization Summary Report

| Field | Value |
|:------|:------|
| **Test ID** | TS-REPORT-001 |
| **Test Scenario** | Verify that the organization summary report accurately displays key metrics (total users, active courses, completion rates) |
| **Pre-conditions** | 1. Organization has users, courses, and progress data. 2. User is logged in as OrgAdmin. |
| **Test Steps** | 1. Navigate to the Reports page. 2. Call `GET /api/reports/:orgId/summary`. 3. Verify total users count matches `userOrganizationRoles` count for the org. 4. Verify active courses count matches `courses` with `status = 'active'`. 5. Verify completion rate calculation. |
| **Expected Result** | 1. Report returns aggregated metrics for the organization. 2. User counts, course counts, and completion rates are mathematically correct. 3. Data is scoped to the requesting user's organization only. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-REPORT-002: Department Summary Report

| Field | Value |
|:------|:------|
| **Test ID** | TS-REPORT-002 |
| **Test Scenario** | Verify that reports can be filtered by department (unit) to show department-specific metrics |
| **Pre-conditions** | 1. Organization has multiple departments with users. 2. Courses assigned to specific departments. |
| **Test Steps** | 1. Call `GET /api/reports/:orgId/summary?unitId=<deptId>`. 2. Verify results are filtered to only include users in the specified department. 3. Compare with unfiltered results to confirm filtering works. |
| **Expected Result** | 1. Only users assigned to the specified `unitId` are included in metrics. 2. Course completion data is scoped to department members. 3. `departmentId` and `unitId` are interchangeable (legacy alias supported). |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-REPORT-003: Student Individual Report

| Field | Value |
|:------|:------|
| **Test ID** | TS-REPORT-003 |
| **Test Scenario** | Verify that a detailed individual student report shows all courses, progress, quiz scores, and activity |
| **Pre-conditions** | 1. Student has course assignments, progress, and quiz results. 2. Admin or Teacher is logged in. |
| **Test Steps** | 1. Call `GET /api/reports/:orgId/student/:studentId`. 2. Verify the report includes all assigned courses with progress percentages. 3. Verify quiz scores are included. 4. Verify time-based activity data. |
| **Expected Result** | 1. Report shows comprehensive student data. 2. Each course shows `percentComplete`, `status`, `assignedDate`. 3. Quiz results show `score`, `passed`, `attempts`. 4. Only data within the requesting org is included. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-REPORT-004: Top Performers List

| Field | Value |
|:------|:------|
| **Test ID** | TS-REPORT-004 |
| **Test Scenario** | Verify that the top performers report identifies and ranks the highest-achieving students |
| **Pre-conditions** | 1. Multiple students with varying course completion and quiz scores. |
| **Test Steps** | 1. Call `GET /api/reports/:orgId/top-performers`. 2. Verify students are ranked by a composite performance metric. 3. Verify the list is limited to the top N students. |
| **Expected Result** | 1. Students are ranked by performance (completion %, quiz scores, XP). 2. Top performers are listed in descending order. 3. Data is org-scoped. |
| **Priority** | P4 (Low) |
| **Status** | Not Executed |

#### TS-REPORT-005: At-Risk Learners Identification

| Field | Value |
|:------|:------|
| **Test ID** | TS-REPORT-005 |
| **Test Scenario** | Verify that the at-risk learners report identifies students who are behind on assignments or performing poorly |
| **Pre-conditions** | 1. Students exist with overdue assignments or low quiz scores. |
| **Test Steps** | 1. Call `GET /api/reports/:orgId/at-risk`. 2. Verify students with overdue mandatory assignments are included. 3. Verify students with below-threshold quiz scores are included. 4. Verify students with no activity within a defined period are flagged. |
| **Expected Result** | 1. At-risk students are identified based on defined criteria. 2. Report includes the reason for being flagged (overdue, low score, inactive). 3. Results are actionable for admins/teachers. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-REPORT-006: Performance Distribution Chart

| Field | Value |
|:------|:------|
| **Test ID** | TS-REPORT-006 |
| **Test Scenario** | Verify that the performance distribution report accurately groups students into score ranges |
| **Pre-conditions** | 1. Students with quiz scores exist across various ranges (0-20, 21-40, 41-60, 61-80, 81-100). |
| **Test Steps** | 1. Call `GET /api/reports/:orgId/quiz-score-range/:range`. 2. Verify students are grouped into correct score buckets. 3. Verify the count in each bucket is accurate. |
| **Expected Result** | 1. Distribution data correctly categorizes students by score range. 2. Totals across all ranges equal the total number of students with quiz attempts. 3. Drill-down into a range shows individual student scores. |
| **Priority** | P4 (Low) |
| **Status** | Not Executed |

#### TS-REPORT-007: Completion Funnel Analytics

| Field | Value |
|:------|:------|
| **Test ID** | TS-REPORT-007 |
| **Test Scenario** | Verify that the completion funnel shows the drop-off at each stage of course progression |
| **Pre-conditions** | 1. Course assigned to multiple students. 2. Students at various stages of completion. |
| **Test Steps** | 1. Call the completion funnel endpoint for a specific course. 2. Verify the funnel shows: Assigned → Started → In Progress → Completed. 3. Verify counts at each stage are accurate. |
| **Expected Result** | 1. Funnel stages decrease monotonically (assigned >= started >= in_progress >= completed). 2. Counts match actual student progress data. 3. Drop-off percentages are calculated correctly. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-REPORT-008: Quiz Analytics Breakdown

| Field | Value |
|:------|:------|
| **Test ID** | TS-REPORT-008 |
| **Test Scenario** | Verify that quiz analytics show per-question performance metrics and difficulty analysis |
| **Pre-conditions** | 1. Quiz has been attempted by multiple students. 2. `quizGameResults` and `quizGameProgress` data exists. |
| **Test Steps** | 1. Navigate to quiz analytics for a specific quiz. 2. Verify overall pass/fail rate. 3. Verify per-question correct/incorrect rates. 4. Verify average score and time metrics. |
| **Expected Result** | 1. Pass rate = (students who passed / total attempts) * 100. 2. Per-question metrics show which questions are hardest. 3. Average score matches computed mean of all attempts. 4. Time metrics show average quiz completion time. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-REPORT-009: Performance Heatmap

| Field | Value |
|:------|:------|
| **Test ID** | TS-REPORT-009 |
| **Test Scenario** | Verify that the performance heatmap visualizes learner activity across time periods |
| **Pre-conditions** | 1. Students have activity data across multiple dates. |
| **Test Steps** | 1. Call the heatmap endpoint with a date range. 2. Verify data is grouped by day/week. 3. Verify intensity values correlate with activity volume. |
| **Expected Result** | 1. Heatmap data returns date-value pairs. 2. Higher activity days show higher intensity values. 3. Date range filtering works correctly. |
| **Priority** | P4 (Low) |
| **Status** | Not Executed |

#### TS-REPORT-010: Deadline Tracking

| Field | Value |
|:------|:------|
| **Test ID** | TS-REPORT-010 |
| **Test Scenario** | Verify that deadline tracking shows upcoming and overdue assignments |
| **Pre-conditions** | 1. Mandatory course assignments exist with due dates (past and future). |
| **Test Steps** | 1. Call the deadline tracking endpoint. 2. Verify upcoming deadlines are listed with days remaining. 3. Verify overdue assignments are flagged. |
| **Expected Result** | 1. Upcoming deadlines sorted by nearest due date. 2. Overdue items clearly flagged with days overdue. 3. Data scoped to the requesting user's organization. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-REPORT-011: Email Deadline Reminders

| Field | Value |
|:------|:------|
| **Test ID** | TS-REPORT-011 |
| **Test Scenario** | Verify that email deadline reminders are sent via the email scheduler for upcoming assignment deadlines |
| **Pre-conditions** | 1. Mandatory assignments with due dates within reminder threshold. 2. `emailSchedulerService` is running. 3. MailerSend is configured. |
| **Test Steps** | 1. Create a mandatory assignment with due date 3 days out. 2. Trigger or wait for the email scheduler to run. 3. Check `emailLogs` for a reminder email record. 4. Verify the email content includes assignment details and deadline. |
| **Expected Result** | 1. Reminder email is generated by `emailSchedulerService`. 2. Email sent via `mailerSendService` with correct template. 3. `emailLogs` records the email event. 4. Reminder includes course name, lesson name, deadline, and action link. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-REPORT-012: Report Date Range Filtering

| Field | Value |
|:------|:------|
| **Test ID** | TS-REPORT-012 |
| **Test Scenario** | Verify that all reports support date range filtering and return data only within the specified range |
| **Pre-conditions** | 1. Data exists across multiple date ranges. 2. User is logged in as Admin. |
| **Test Steps** | 1. Call a report endpoint with `startDate` and `endDate` parameters. 2. Verify all returned records fall within the date range. 3. Change the date range and verify different results. 4. Omit date range parameters and verify all data is returned. |
| **Expected Result** | 1. Only records within `[startDate, endDate]` are included. 2. `parseReportFilters` correctly parses date parameters. 3. Changing dates produces different result sets. 4. Without date filters, full historical data is returned. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

---

### P2.8 Test Suite: White-Label Branding (TS-BRAND)

**Suite Objective:** Validate the white-label branding system including theme customization, asset uploads, domain management, and dynamic PWA manifest generation.  
**Related Phase 1 Section:** 3.5 White-Label Branding  
**Primary Route Module:** `server/brandingRoutes.ts` (21 endpoints)  

#### TS-BRAND-001: Theme Creation and Save

| Field | Value |
|:------|:------|
| **Test ID** | TS-BRAND-001 |
| **Test Scenario** | Verify that an OrgAdmin can create and save a branding theme with custom settings |
| **Pre-conditions** | 1. User is logged in as OrgAdmin. 2. No theme exists for the organization (or existing theme can be overwritten). |
| **Test Steps** | 1. Navigate to Theme Editor. 2. Customize primary color, secondary color, accent color. 3. Set font heading and font body. 4. Toggle gradient settings. 5. Save the theme via `POST /api/theme`. 6. Reload the page and verify settings persist. |
| **Expected Result** | 1. Theme record created in `brandingThemes` with `status = 'draft'`. 2. `tokens` (JSONB) contains all color values. 3. Font settings persisted in `fontHeading` and `fontBody`. 4. Gradient settings stored in `gradientEnabled`, `gradientFrom`, `gradientTo`, `gradientAngle`. 5. Theme is scoped to the organization. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-BRAND-002: Logo Upload

| Field | Value |
|:------|:------|
| **Test ID** | TS-BRAND-002 |
| **Test Scenario** | Verify that an OrgAdmin can upload a logo image that is processed and stored correctly |
| **Pre-conditions** | 1. User is logged in as OrgAdmin. 2. Valid image file available (PNG/JPEG, under 2MB). |
| **Test Steps** | 1. Upload a logo via `POST /api/branding/upload` with type "logo". 2. Verify the image is processed (resized to max 400x200 via Sharp). 3. Verify the image is stored in Object Storage. 4. Verify `logoUrl` is updated on the branding theme. 5. Upload an invalid file (e.g., .exe) and verify rejection. |
| **Expected Result** | 1. Logo upload returns HTTP 200 with the storage URL. 2. Image is resized/compressed via Sharp. 3. `logoUrl` on `brandingThemes` is updated. 4. Logo renders in the BrandEditor preview. 5. Invalid file types are rejected with error message. 6. Files > 2MB are rejected. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-BRAND-003: Favicon Upload

| Field | Value |
|:------|:------|
| **Test ID** | TS-BRAND-003 |
| **Test Scenario** | Verify that an OrgAdmin can upload a favicon that is resized and applied to the platform |
| **Pre-conditions** | 1. User is logged in as OrgAdmin. 2. Valid favicon image available (square image). |
| **Test Steps** | 1. Upload a favicon via `POST /api/branding/upload` with type "favicon". 2. Verify the image is resized to 64x64 pixels. 3. Verify `faviconUrl` is updated on the branding theme. 4. Verify the favicon appears in the browser tab when theme is active. |
| **Expected Result** | 1. Favicon processed to `MAX_FAVICON_SIZE = 64` pixels. 2. `faviconUrl` stored on theme record. 3. Favicon renders in browser when theme is published. |
| **Priority** | P4 (Low) |
| **Status** | Not Executed |

#### TS-BRAND-004: Color Token Customization

| Field | Value |
|:------|:------|
| **Test ID** | TS-BRAND-004 |
| **Test Scenario** | Verify that color tokens can be customized and the full token set is built correctly from partial input |
| **Pre-conditions** | 1. OrgAdmin is in the Theme Editor. |
| **Test Steps** | 1. Set primary color to `hsl(260, 70%, 50%)`. 2. Set secondary color to `hsl(45, 80%, 60%)`. 3. Save the theme. 4. Verify `tokens` JSONB contains the full expanded token set (via `buildFullTokens` from `shared/themeTokenBuilder.ts`). 5. Verify CSS custom properties are served via `GET /api/theme/embed-styles`. |
| **Expected Result** | 1. Partial token input is expanded to full token set by `buildFullTokens`. 2. All CSS custom properties (--primary, --secondary, --accent, --background, etc.) are generated. 3. Token values are valid CSS color values. 4. `enableContrastCorrections` flag adjusts light/dark text for readability when enabled. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-BRAND-005: Theme Publish Workflow

| Field | Value |
|:------|:------|
| **Test ID** | TS-BRAND-005 |
| **Test Scenario** | Verify that publishing a theme changes its status from draft to published and applies it to all org users |
| **Pre-conditions** | 1. Draft theme exists for the organization. 2. OrgAdmin is logged in. |
| **Test Steps** | 1. Verify theme `status = 'draft'`. 2. Publish the theme via `POST /api/theme/activate`. 3. Verify theme `status = 'published'`. 4. Log in as a student in the same org. 5. Verify the published theme colors and branding are applied. 6. Call `GET /api/theme/resolved` and verify the theme is returned. |
| **Expected Result** | 1. Publishing changes `status` from `draft` to `published`. 2. All users in the org see the updated branding. 3. `GET /api/theme/resolved` returns the published theme for the org's domain/ID. 4. CSS custom properties are injected via `EmbedThemeLoader`. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-BRAND-006: Custom Domain Registration

| Field | Value |
|:------|:------|
| **Test ID** | TS-BRAND-006 |
| **Test Scenario** | Verify that an OrgAdmin can register a custom domain for their organization |
| **Pre-conditions** | 1. OrgAdmin is logged in. 2. Domain name is available (e.g., `learn.testcorp.com`). |
| **Test Steps** | 1. Add a custom domain via `POST /api/domains` with `domain: "learn.testcorp.com"`. 2. Verify `organizationDomains` record is created. 3. Verify `verified = false` initially. 4. Verify `verificationToken` is generated (for DNS TXT record). |
| **Expected Result** | 1. Domain record created with `verified = false`. 2. `verificationToken` is a random string for DNS TXT verification. 3. Domain is associated with the organization. 4. Instructions for DNS setup are provided. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-BRAND-007: Domain Verification

| Field | Value |
|:------|:------|
| **Test ID** | TS-BRAND-007 |
| **Test Scenario** | Verify that domain ownership is confirmed by checking DNS TXT records |
| **Pre-conditions** | 1. Custom domain exists with `verified = false`. 2. DNS TXT record is set (or can be simulated). |
| **Test Steps** | 1. Call `POST /api/domains/:id/verify`. 2. System performs DNS TXT lookup via `resolveTxt` from `dns/promises`. 3. If TXT record matches `verificationToken`, domain is verified. 4. Verify `verified = true` and `verifiedAt` is set. |
| **Expected Result** | 1. Successful verification sets `verified = true`. 2. `verifiedAt` timestamp is recorded. 3. If DNS record doesn't match, verification fails with clear error. 4. Domain can be toggled active/inactive via `POST /api/domains/:id/toggle-active`. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-BRAND-008: Email Branding Toggle

| Field | Value |
|:------|:------|
| **Test ID** | TS-BRAND-008 |
| **Test Scenario** | Verify that the email branding toggle controls whether org branding appears in outgoing emails |
| **Pre-conditions** | 1. Organization has a published theme with logo. 2. `allowEmailBranding` is configurable. |
| **Test Steps** | 1. Set `allowEmailBranding = true` in theme settings. 2. Trigger an email (e.g., join request approval). 3. Verify the email includes org branding (logo, colors). 4. Set `allowEmailBranding = false`. 5. Trigger another email. 6. Verify the email uses default platform branding. |
| **Expected Result** | 1. When enabled, emails include org logo and color scheme. 2. When disabled, emails use LearnPlay default branding. 3. `CertificateService` respects the branding flag for certificate colors. |
| **Priority** | P4 (Low) |
| **Status** | Not Executed |

#### TS-BRAND-009: PWA Manifest Dynamic Generation

| Field | Value |
|:------|:------|
| **Test ID** | TS-BRAND-009 |
| **Test Scenario** | Verify that the PWA manifest.json is dynamically generated with organization branding |
| **Pre-conditions** | 1. Organization has a published theme with name and colors. |
| **Test Steps** | 1. Call `GET /api/branding/manifest`. 2. Verify the response is valid JSON with PWA manifest fields. 3. Verify `name`, `short_name`, `theme_color`, `background_color` reflect org branding. 4. Verify `icons` array points to uploaded or default icons. |
| **Expected Result** | 1. Manifest JSON includes org name as `name`. 2. `theme_color` matches the primary color from the theme. 3. `background_color` matches the background color. 4. Icons reference the correct paths. |
| **Priority** | P4 (Low) |
| **Status** | Not Executed |

#### TS-BRAND-010: Contrast Correction Enforcement

| Field | Value |
|:------|:------|
| **Test ID** | TS-BRAND-010 |
| **Test Scenario** | Verify that enabling contrast corrections automatically adjusts text colors for readability against background colors |
| **Pre-conditions** | 1. Theme with low-contrast color combination (e.g., light text on light background). 2. `enableContrastCorrections` toggle available. |
| **Test Steps** | 1. Set a theme with poor contrast (e.g., white text on yellow background). 2. Enable `enableContrastCorrections = true`. 3. Save and publish the theme. 4. Verify that text colors are adjusted for WCAG contrast compliance. 5. Disable the flag and verify original (poor contrast) colors return. |
| **Expected Result** | 1. With corrections enabled, text colors are adjusted to meet minimum contrast ratios. 2. Adjustment logic uses the contrast utility (`client/src/utils/contrast.ts`). 3. UI remains functional and readable with corrections applied. |
| **Priority** | P4 (Low) |
| **Status** | Not Executed |

---

### P2.9 Test Suite: Marketplace & Payments (TS-PAY)

**Suite Objective:** Validate payment processing, course purchasing, exchange rates, commission calculations, and subscription billing.  
**Related Phase 1 Section:** 3.9 Marketplace & Payments  
**Primary Route Module:** `server/routes/paymentsRoutes.ts` (28 endpoints)  

#### TS-PAY-001: Course Pricing Display (Multi-Currency)

| Field | Value |
|:------|:------|
| **Test ID** | TS-PAY-001 |
| **Test Scenario** | Verify that course prices display correctly in multiple currencies (ZAR, USD, EUR) with current exchange rates |
| **Pre-conditions** | 1. Course exists with `price` set in base currency. 2. `currencyConversionRates` table has rates for ZAR/USD/EUR. |
| **Test Steps** | 1. View course detail page with default currency. 2. Switch preferred currency to USD. 3. Verify price converts correctly using exchange rates. 4. Switch to EUR and verify again. 5. Compare converted prices with manual calculation. |
| **Expected Result** | 1. Prices display in the user's preferred currency. 2. Conversion uses rates from `currencyConversionRates` table. 3. Converted price = base price * exchange rate. 4. `CurrencyConversionTooltip` shows the conversion details. 5. `ExchangeRateFreshness` indicates when rates were last updated. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-PAY-002: Course Purchase Flow (YOCO)

| Field | Value |
|:------|:------|
| **Test ID** | TS-PAY-002 |
| **Test Scenario** | Verify the complete course purchase flow using YOCO payment gateway in test mode |
| **Pre-conditions** | 1. YOCO is in test mode (`yocoMode = 'test'`). 2. Course is published and purchasable (`visibility = 'public'`, price > 0). 3. Student is logged in. |
| **Test Steps** | 1. Navigate to course purchase page. 2. Click "Buy Now" — `POST /api/courses/:courseId/checkout`. 3. Verify checkout session is created. 4. Complete payment using YOCO test card. 5. Verify YOCO webhook fires (`POST /api/webhooks/yoco`). 6. Verify `coursePurchases` record is created with `status = 'completed'`. 7. Verify student can now access the course. |
| **Expected Result** | 1. Checkout creates a `paymentIntents` record. 2. YOCO redirects to payment page in test mode. 3. Webhook processes payment confirmation. 4. `coursePurchases` record created with correct amount, currency, checkoutId. 5. Post-fulfillment job grants course access to student. 6. Webhook deduplication prevents double-processing (`paymentWebhookEvents`). |
| **Priority** | P1 (Critical) |
| **Status** | Not Executed |

#### TS-PAY-003: Exchange Rate Snapshot on Purchase

| Field | Value |
|:------|:------|
| **Test ID** | TS-PAY-003 |
| **Test Scenario** | Verify that the exchange rate at the time of purchase is captured and stored with the transaction |
| **Pre-conditions** | 1. Course priced in ZAR. 2. Student purchases in USD. 3. Current exchange rate is known. |
| **Test Steps** | 1. Note the current ZAR/USD exchange rate. 2. Purchase the course as a USD user. 3. Check `coursePurchases.exchangeRate` field. 4. Verify it matches the rate at purchase time (not a later rate). |
| **Expected Result** | 1. `exchangeRate` field stores the rate used for conversion at purchase time. 2. Rate is captured from `exchangeRateService` at checkout creation. 3. Historical rate is preserved even if rates change later. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-PAY-004: Commission Calculation Accuracy

| Field | Value |
|:------|:------|
| **Test ID** | TS-PAY-004 |
| **Test Scenario** | Verify that the platform commission is calculated correctly on each course sale |
| **Pre-conditions** | 1. Commission rate is configured (global or per-org). 2. Course purchase has been completed. |
| **Test Steps** | 1. Complete a course purchase for amount X. 2. Check `coursePurchases.commissionAmount`. 3. Verify commission = purchase amount * commission rate. 4. Check `coursePayoutLineItems` for net payout amount. 5. Verify net payout = purchase amount - commission. |
| **Expected Result** | 1. `commissionAmount` = `amount` * commission_rate. 2. Net payout to org = `amount` - `commissionAmount`. 3. Commission is recorded in `coursePayoutLineItems`. 4. Commission rates may differ per organization. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-PAY-005: Course Version Upgrade Pricing

| Field | Value |
|:------|:------|
| **Test ID** | TS-PAY-005 |
| **Test Scenario** | Verify that users who purchased a previous version of a course can upgrade at a discounted price |
| **Pre-conditions** | 1. User purchased version 1 of a course. 2. Course has been updated to version 2. 3. Upgrade pricing is configured. |
| **Test Steps** | 1. Check for upgrade availability via `courseVersionNotifications`. 2. View upgrade pricing. 3. Purchase the upgrade. 4. Verify `courseVersionUpgrades` record is created. 5. Verify user has access to the new version. |
| **Expected Result** | 1. Upgrade price is less than full course price. 2. `courseVersionUpgrades` records `fromVersion` and `toVersion`. 3. User gains access to new version content. 4. Previous version purchase is referenced. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-PAY-006: Subscription Invoice Generation

| Field | Value |
|:------|:------|
| **Test ID** | TS-PAY-006 |
| **Test Scenario** | Verify that subscription invoices are generated correctly at each billing cycle |
| **Pre-conditions** | 1. Organization has an active subscription. 2. Billing cycle is due. |
| **Test Steps** | 1. Verify current subscription via `GET /api/subscriptions/:id`. 2. Trigger billing cycle (via scheduler or manually). 3. Check `subscriptionInvoices` for a new invoice. 4. Verify invoice amount, currency, and due date. 5. Download invoice via `GET /api/invoices/:id/download`. |
| **Expected Result** | 1. Invoice created in `subscriptionInvoices` with correct amount. 2. Invoice `status = 'pending'` until paid. 3. Invoice amount matches the subscription plan price. 4. Invoice download returns a formatted document. 5. `subscriptionEvents` logs the invoice creation event. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-PAY-007: Payment Status Tracking

| Field | Value |
|:------|:------|
| **Test ID** | TS-PAY-007 |
| **Test Scenario** | Verify that payment statuses are tracked correctly throughout the payment lifecycle |
| **Pre-conditions** | 1. Payment intent exists in various states. |
| **Test Steps** | 1. Create a payment via checkout. 2. Verify initial status is `pending`. 3. After successful webhook, verify status is `completed`. 4. For a failed payment, verify status is `failed`. 5. Check `paymentTransactions` for status history. |
| **Expected Result** | 1. Status transitions: `pending` → `completed` (success) or `pending` → `failed`. 2. `paymentFulfillments` tracks fulfillment status. 3. Status is consistent across `paymentIntents`, `paymentTransactions`, and `coursePurchases`. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

---

### P2.10 Test Suite: Notifications & Email (TS-NOTIF)

**Suite Objective:** Validate in-app notifications and email delivery workflows.  
**Related Phase 1 Section:** 3.8 Notifications & Email System  

#### TS-NOTIF-001: In-App Notification Creation

| Field | Value |
|:------|:------|
| **Test ID** | TS-NOTIF-001 |
| **Test Scenario** | Verify that in-app notifications are created for relevant user actions and events |
| **Pre-conditions** | 1. User has a valid account. 2. An action that triggers a notification occurs (e.g., course assignment, join request approval). |
| **Test Steps** | 1. Trigger a notification event (e.g., assign a course to a student). 2. As the student, check notifications via the notification endpoint. 3. Verify a `userNotifications` record exists. 4. Verify notification content includes relevant details. |
| **Expected Result** | 1. `userNotifications` record created with `isRead = false`. 2. Notification includes type, message, and reference data. 3. Notification is scoped to the target user only. 4. NotificationCenter component displays the notification. |
| **Priority** | P4 (Low) |
| **Status** | Not Executed |

#### TS-NOTIF-002: Mark Notification as Read

| Field | Value |
|:------|:------|
| **Test ID** | TS-NOTIF-002 |
| **Test Scenario** | Verify that a user can mark notifications as read and the unread count updates |
| **Pre-conditions** | 1. User has unread notifications. |
| **Test Steps** | 1. Get unread notification count. 2. Mark a notification as read via API. 3. Verify `isRead = true` on the notification record. 4. Verify unread count decreases by 1. |
| **Expected Result** | 1. Mark-as-read updates `isRead` flag. 2. Unread count is accurate. 3. Read notifications remain in history but are visually distinguished. |
| **Priority** | P4 (Low) |
| **Status** | Not Executed |

#### TS-NOTIF-003: Notification Preference Management

| Field | Value |
|:------|:------|
| **Test ID** | TS-NOTIF-003 |
| **Test Scenario** | Verify that users can configure notification preferences (opt in/out of email notifications) |
| **Pre-conditions** | 1. User has a valid account. 2. `notificationPreferences` table is accessible. |
| **Test Steps** | 1. Get current notification preferences. 2. Disable email notifications for a specific type. 3. Trigger the notification type. 4. Verify in-app notification is created but email is NOT sent. 5. Re-enable email notifications. 6. Trigger again and verify email IS sent. |
| **Expected Result** | 1. Preferences persist in `notificationPreferences`. 2. Disabled email types suppress email delivery. 3. In-app notifications are always created regardless of email preference. 4. `notificationService` checks preferences before sending email. |
| **Priority** | P4 (Low) |
| **Status** | Not Executed |

#### TS-NOTIF-004: Email Template Rendering

| Field | Value |
|:------|:------|
| **Test ID** | TS-NOTIF-004 |
| **Test Scenario** | Verify that email templates render correctly with dynamic data |
| **Pre-conditions** | 1. MailerSend is configured. 2. Email template data is available. |
| **Test Steps** | 1. Trigger an email-generating action (e.g., password reset, join request approval). 2. Check `emailLogs` for the sent email record. 3. Verify the email template includes correct dynamic data (user name, org name, action links). 4. Verify email branding matches the org theme (if `allowEmailBranding = true`). |
| **Expected Result** | 1. Email is sent via `mailerSendService`. 2. Template variables are populated correctly. 3. `emailLogs` records the email with status. 4. Email contains proper links and call-to-action buttons. |
| **Priority** | P4 (Low) |
| **Status** | Not Executed |

#### TS-NOTIF-005: Invoice Reminder Email

| Field | Value |
|:------|:------|
| **Test ID** | TS-NOTIF-005 |
| **Test Scenario** | Verify that invoice reminder emails are sent for upcoming or overdue subscription invoices |
| **Pre-conditions** | 1. Organization has a pending invoice approaching due date. 2. Email scheduler is running. |
| **Test Steps** | 1. Create or identify a pending invoice with due date approaching. 2. Wait for or trigger the email scheduler. 3. Check `emailLogs` for an invoice reminder record. 4. Verify the email includes invoice amount, due date, and payment link. |
| **Expected Result** | 1. Reminder email generated for invoices approaching due date. 2. Email includes invoice details and payment action. 3. Overdue invoices trigger overdue notification. |
| **Priority** | P4 (Low) |
| **Status** | Not Executed |

---

### P2.11 Test Suite: Quiz System (TS-QUIZ)

**Suite Objective:** Validate quiz creation, AI generation, scoring, progress tracking, and leaderboard integration.  
**Related Phase 1 Section:** 3.10 Quiz System  
**Primary Route Module:** `server/routes/quizRoutes.ts` (46 endpoints)  

#### TS-QUIZ-001: AI Quiz Generation from Lesson Content

| Field | Value |
|:------|:------|
| **Test ID** | TS-QUIZ-001 |
| **Test Scenario** | Verify that AI can generate quiz questions from lesson slide content |
| **Pre-conditions** | 1. Lesson exists with slide content (learningAssetContract populated). 2. Active AI configuration with Gemini API key. 3. Sufficient credits for quiz generation. |
| **Test Steps** | 1. Select a lesson with content. 2. Trigger quiz generation via `POST /api/ai/generate-quiz` with lessonId. 3. Wait for generation to complete. 4. Review generated questions and answers. 5. Verify credit deduction. |
| **Expected Result** | 1. Quiz collection created in `quizCollections` with generated cards. 2. Each `quizCards` record has: `question`, `answers` (JSONB array), `correctAnswer`, `difficulty`. 3. Questions are relevant to the lesson content. 4. Credits deducted per `quizPricingService` tier. 5. Quiz is linked to the lesson via `lessonQuizLinks`. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-QUIZ-002: Quiz Attempt and Scoring

| Field | Value |
|:------|:------|
| **Test ID** | TS-QUIZ-002 |
| **Test Scenario** | Verify that a student can attempt a quiz and receive an accurate score |
| **Pre-conditions** | 1. Quiz collection exists with 10 questions and known correct answers. 2. Student is logged in and quiz is assigned/accessible. |
| **Test Steps** | 1. Start a quiz attempt. 2. Answer each question (mix of correct and incorrect). 3. Submit the quiz. 4. Verify the score calculation: `score = correctAnswers / totalQuestions * 100`. 5. Check `quizGameResults` for the result record. 6. Check `userQuizProgress` for updated progress. |
| **Expected Result** | 1. Score is calculated as percentage of correct answers. 2. `quizGameResults` record: `score`, `correctAnswers`, `totalQuestions`, `timeTaken`. 3. `userQuizProgress` updated: `score`, `attempts`, `bestScore`, `lastAttemptAt`. 4. `bestScore` updates only if new score exceeds previous best. 5. Coins and XP are awarded based on performance. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-QUIZ-003: Quiz Pass/Fail Threshold

| Field | Value |
|:------|:------|
| **Test ID** | TS-QUIZ-003 |
| **Test Scenario** | Verify that the pass/fail threshold (`passRate`) is correctly applied to quiz results |
| **Pre-conditions** | 1. Quiz collection has `passRate = 70` (70% required to pass). 2. Student is about to attempt the quiz. |
| **Test Steps** | 1. Attempt quiz and score 60% (below pass rate). 2. Verify `userQuizProgress.passed = false`. 3. Attempt quiz again and score 75% (above pass rate). 4. Verify `userQuizProgress.passed = true`. |
| **Expected Result** | 1. Score < passRate: `passed = false`. 2. Score >= passRate: `passed = true`. 3. Pass status is used for quiz gating (TS-ASSIGN-008). 4. `attempts` count increments with each attempt. |
| **Priority** | P2 (High) |
| **Status** | Not Executed |

#### TS-QUIZ-004: Quiz Results Recording

| Field | Value |
|:------|:------|
| **Test ID** | TS-QUIZ-004 |
| **Test Scenario** | Verify that quiz results are fully recorded with per-question details |
| **Pre-conditions** | 1. Student has completed a quiz. |
| **Test Steps** | 1. Complete a quiz. 2. Check `quizGameResults` for the summary record. 3. Check `quizGameProgress` for per-question data. 4. Verify each question's answer and correctness are recorded. |
| **Expected Result** | 1. `quizGameResults`: `userId`, `quizId`, `score`, `correctAnswers`, `totalQuestions`, `timeTaken`. 2. `quizGameProgress`: per-round `questionId`, `playerAnswer`, `isCorrect`. 3. Data is queryable for analytics (TS-REPORT-008). |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-QUIZ-005: Bulk Quiz Generation for Course

| Field | Value |
|:------|:------|
| **Test ID** | TS-QUIZ-005 |
| **Test Scenario** | Verify that quizzes can be bulk-generated for all lessons in a course |
| **Pre-conditions** | 1. Course exists with multiple lessons having content. 2. Sufficient credits for all quiz generation. |
| **Test Steps** | 1. Trigger bulk quiz generation for the course. 2. Check `bulkQuizGenerationJobs` for the job record. 3. Verify `totalQuizzes` matches number of lessons. 4. Wait for `completedQuizzes` to equal `totalQuizzes`. 5. Verify each lesson now has a linked quiz. |
| **Expected Result** | 1. `bulkQuizGenerationJobs` tracks the bulk operation. 2. Status transitions: `pending` → `processing` → `completed`. 3. Each lesson in the course gets a quiz collection. 4. `lessonQuizLinks` are created for each lesson-quiz pair. 5. `courseLessons.primaryQuizId` is set for each lesson. |
| **Priority** | P3 (Medium) |
| **Status** | Not Executed |

#### TS-QUIZ-006: Quiz Leaderboard

| Field | Value |
|:------|:------|
| **Test ID** | TS-QUIZ-006 |
| **Test Scenario** | Verify that the quiz leaderboard ranks users by quiz performance within the organization |
| **Pre-conditions** | 1. Multiple students have completed quizzes in the same org. |
| **Test Steps** | 1. Call `GET /api/quiz-leaderboard`. 2. Verify users are ranked by score/performance. 3. Verify the leaderboard is org-scoped. 4. Verify current user's position is included. |
| **Expected Result** | 1. Users ranked by aggregate quiz performance (total score, best scores, or win count). 2. Only users from the same organization are included. 3. Leaderboard data is consistent with `quizGameResults`. |
| **Priority** | P4 (Low) |
| **Status** | Not Executed |

---

### P2.12 Traceability Matrix

The following matrix maps each test case to its requirement origin, feature area, primary implementation files, and risk level.

| Test ID | Requirement | Feature Area | Implementation Files | Risk |
|:--------|:-----------|:-------------|:--------------------|:-----|
| TS-AUTH-001 | User Authentication | Auth & Security | `server/routes/authRoutes.ts`, `server/routes/shared.ts` | Critical |
| TS-AUTH-002 | Account Lockout | Auth & Security | `server/routes/authRoutes.ts`, `shared/schema.ts` (users table) | Critical |
| TS-AUTH-003 | Disabled Account Handling | Auth & Security | `server/routes/authRoutes.ts` | Critical |
| TS-AUTH-004 | User Registration | Auth & Security | `server/routes/authRoutes.ts`, `server/services/joinRequestApprovalService.ts` | Critical |
| TS-AUTH-005 | Password Reset | Auth & Security | `server/services/passwordResetService.ts`, `server/routes/authRoutes.ts` | Critical |
| TS-AUTH-006 | Email Verification | Auth & Security | `server/services/emailVerificationService.ts`, `server/routes/authRoutes.ts` | High |
| TS-AUTH-007 | Session Management | Auth & Security | `server/middleware/sessionAuthMiddleware.ts`, `server/services/sessionInvalidationService.ts` | Critical |
| TS-AUTH-008 | SuperAdmin RBAC | Auth & Security | `server/adminAuth.ts`, `server/middleware/sessionAuthMiddleware.ts` | Critical |
| TS-AUTH-009 | OrgAdmin RBAC | Auth & Security | `server/adminAuth.ts`, `server/middleware/orgIsolationMiddleware.ts` | Critical |
| TS-AUTH-010 | Teacher RBAC | Auth & Security | `server/tenantMiddleware.ts`, `server/adminAuth.ts` | High |
| TS-AUTH-011 | Student RBAC | Auth & Security | `server/tenantMiddleware.ts`, `server/adminAuth.ts` | High |
| TS-AUTH-012 | Multi-Tenant Isolation | Auth & Security | `server/middleware/orgIsolationMiddleware.ts`, `server/middleware/sessionAuthMiddleware.ts` | Critical |
| TS-AUTH-013 | SuperAdmin Impersonation | Auth & Security | `server/routes/superAdminRoutes.ts`, `server/middleware/sessionAuthMiddleware.ts` | Critical |
| TS-COURSE-001 | Course Creation | AI Course Creation | `server/routes/courseRoutes.ts`, `server/services/courseService.ts` | High |
| TS-COURSE-002 | AI Topic Generation | AI Course Creation | `server/routes/aiRoutes.ts`, `server/services/courseTopicAIService.ts` | High |
| TS-COURSE-003 | Document Extraction | AI Course Creation | `server/routes/courseFrameworkRoutes.ts`, `server/services/documentExtractor.ts` | High |
| TS-COURSE-004 | Framework Generation | AI Course Creation | `server/routes/courseFrameworkRoutes.ts`, `server/services/courseFrameworkAIService.ts` | High |
| TS-COURSE-005 | Gemini-Topics Lesson | AI Course Creation | `server/routes/courseRoutes.ts`, `server/services/lessonOrchestrationService.ts` | High |
| TS-COURSE-006 | Document-Upload Lesson | AI Course Creation | `server/routes/courseRoutes.ts`, `server/services/documentExtractor.ts` | High |
| TS-COURSE-007 | Manual-Upload Lesson | AI Course Creation | `server/routes/courseRoutes.ts`, `server/services/lessonService.ts` | Medium |
| TS-COURSE-008 | Gamma Job Queue | AI Course Creation | `server/services/jobQueueService.ts`, `server/workers/jobQueueWorker.ts`, `server/services/gammaService.ts` | High |
| TS-COURSE-009 | Lesson Publishing | AI Course Creation | `server/routes/courseRoutes.ts`, `server/services/lessonService.ts` | High |
| TS-COURSE-010 | Course Versioning | AI Course Creation | `server/routes/courseRoutes.ts`, `server/services/courseVersioningService.ts` | High |
| TS-COURSE-011 | Video Upload | AI Course Creation | `server/routes/courseRoutes.ts`, `server/objectStorage.ts` | Medium |
| TS-COURSE-012 | Content Quality Scoring | AI Course Creation | `server/services/contentCoachService.ts`, `server/services/contentHealthService.ts` | Medium |
| TS-COURSE-013 | Slide Versioning | AI Course Creation | `server/services/lessonVersioningService.ts` | Medium |
| TS-COURSE-014 | Course Deletion | AI Course Creation | `server/routes/courseRoutes.ts`, `server/services/courseService.ts` | High |
| TS-COURSE-015 | Lesson Archiving | AI Course Creation | `server/routes/courseRoutes.ts`, `server/services/lessonService.ts` | Medium |
| TS-GAME-001 | Coin Earning | Gamification | `server/gamificationService.ts`, `server/routes/gamificationRoutes.ts` | Medium |
| TS-GAME-002 | Coin Ledger Accuracy | Gamification | `server/gamificationService.ts` | High |
| TS-GAME-003 | Daily Challenge Tracking | Gamification | `server/gamificationService.ts`, `server/challengeScheduler.ts` | Medium |
| TS-GAME-004 | Weekly Challenge Reset | Gamification | `server/challengeScheduler.ts` | Medium |
| TS-GAME-005 | Challenge Reward Claiming | Gamification | `server/gamificationService.ts`, `server/routes/gamificationRoutes.ts` | Medium |
| TS-GAME-006 | Power-Up Purchase | Gamification | `server/gamificationService.ts`, `server/routes/gamificationRoutes.ts` | Medium |
| TS-GAME-007 | Power-Up Lifecycle | Gamification | `server/gamificationService.ts` | Medium |
| TS-GAME-008 | Cosmetic Purchase/Equip | Gamification | `server/gamificationService.ts`, `server/routes/gamificationRoutes.ts` | Low |
| TS-GAME-009 | Season Pass Progress | Gamification | `server/seasonPassScheduler.ts`, `server/gamificationService.ts` | Low |
| TS-GAME-010 | Achievement Tracking | Gamification | `server/gamificationService.ts` | Low |
| TS-GAME-011 | Login Streak | Gamification | `server/gamificationService.ts` | Medium |
| TS-GAME-012 | Leaderboard | Gamification | `server/routes/gamificationRoutes.ts` | Medium |
| TS-GAME-013 | XP & Leveling | Gamification | `server/xpService.ts`, `shared/levelUtils.ts` | Medium |
| TS-GAME-014 | Economy Config | Gamification | `server/routes/gamificationRoutes.ts` | Medium |
| TS-GAME-015 | Concurrent Coins | Gamification | `server/gamificationService.ts` (SELECT FOR UPDATE) | High |
| TS-ORG-001 | Org Registration | Organization Mgmt | `server/routes/orgRoutes.ts` | High |
| TS-ORG-002 | Hierarchy CRUD | Organization Mgmt | `server/routes/orgRoutes.ts`, `shared/schema.ts` | Medium |
| TS-ORG-003 | Join Request Submit | Organization Mgmt | `server/routes/authRoutes.ts`, `server/routes/orgRoutes.ts` | Medium |
| TS-ORG-004 | Manual Approval | Organization Mgmt | `server/routes/orgRoutes.ts`, `server/services/joinRequestApprovalService.ts` | High |
| TS-ORG-005 | Email Token Approval | Organization Mgmt | `server/routes/orgRoutes.ts`, `server/services/joinRequestApprovalService.ts` | Medium |
| TS-ORG-006 | Bulk Approve/Deny | Organization Mgmt | `server/routes/orgRoutes.ts` | Medium |
| TS-ORG-007 | Role Assignment | Organization Mgmt | `server/routes/orgRoutes.ts`, `server/routes/adminRoutes.ts` | High |
| TS-ORG-008 | Subscription Lifecycle | Organization Mgmt | `server/routes/orgRoutes.ts`, `server/services/subscriptionService.ts` | High |
| TS-ORG-009 | Seat Tracking | Organization Mgmt | `server/services/seatPolicyService.ts`, `server/services/userSeatManagementService.ts` | High |
| TS-ORG-010 | Org Credit Wallet | Organization Mgmt | `server/services/organizationCreditService.ts`, `server/routes/orgRoutes.ts` | High |
| TS-ORG-011 | SA Credit Adjustment | Organization Mgmt | `server/routes/orgRoutes.ts` | High |
| TS-ORG-012 | Demo Org Bypass | Organization Mgmt | `server/middleware/trialLockoutMiddleware.ts` | Medium |
| TS-ASSIGN-001 | Individual Assignment | Assignment & Progress | `server/routes/courseRoutes.ts`, `server/services/courseAssignmentService.ts` | High |
| TS-ASSIGN-002 | Department Cascade | Assignment & Progress | `server/services/courseAssignmentService.ts` | High |
| TS-ASSIGN-003 | Team Assignment | Assignment & Progress | `server/services/courseAssignmentService.ts` | Medium |
| TS-ASSIGN-004 | Mandatory Due Date | Assignment & Progress | `server/services/courseAssignmentService.ts`, `server/services/emailSchedulerService.ts` | Medium |
| TS-ASSIGN-005 | Slide Progress | Assignment & Progress | `server/services/lessonProgressService.ts` | High |
| TS-ASSIGN-006 | Lesson Completion Cert | Assignment & Progress | `server/services/lessonProgressService.ts`, `server/services/certificateService.ts` | High |
| TS-ASSIGN-007 | Course Completion | Assignment & Progress | `server/services/courseCompletionService.ts` | High |
| TS-ASSIGN-008 | Quiz Gating | Assignment & Progress | `server/services/lessonProgressService.ts` | Critical |
| TS-ASSIGN-009 | First Lesson Exemption | Assignment & Progress | `server/services/lessonProgressService.ts` | High |
| TS-ASSIGN-010 | Lesson Certificate | Assignment & Progress | `server/services/certificateService.ts` | High |
| TS-ASSIGN-011 | Course Certificate | Assignment & Progress | `server/services/certificateService.ts` | High |
| TS-ASSIGN-012 | Certificate Uniqueness | Assignment & Progress | `server/services/certificateService.ts`, `shared/schema.ts` (unique constraint) | High |
| TS-REPORT-001 | Org Summary | Analytics & Reporting | `server/routes/reportRoutes.ts`, `server/services/analyticsService.ts` | Medium |
| TS-REPORT-002 | Dept Summary | Analytics & Reporting | `server/routes/reportRoutes.ts` | Medium |
| TS-REPORT-003 | Student Report | Analytics & Reporting | `server/routes/reportRoutes.ts` | Medium |
| TS-REPORT-004 | Top Performers | Analytics & Reporting | `server/routes/reportRoutes.ts` | Low |
| TS-REPORT-005 | At-Risk Learners | Analytics & Reporting | `server/routes/reportRoutes.ts` | Medium |
| TS-REPORT-006 | Score Distribution | Analytics & Reporting | `server/routes/reportRoutes.ts` | Low |
| TS-REPORT-007 | Completion Funnel | Analytics & Reporting | `server/routes/reportRoutes.ts` | Medium |
| TS-REPORT-008 | Quiz Analytics | Analytics & Reporting | `server/routes/reportRoutes.ts` | Medium |
| TS-REPORT-009 | Heatmap | Analytics & Reporting | `server/routes/reportRoutes.ts` | Low |
| TS-REPORT-010 | Deadline Tracking | Analytics & Reporting | `server/routes/reportRoutes.ts`, `server/services/courseAssignmentService.ts` | Medium |
| TS-REPORT-011 | Email Reminders | Analytics & Reporting | `server/services/emailSchedulerService.ts`, `server/services/mailerSendService.ts` | Medium |
| TS-REPORT-012 | Date Filtering | Analytics & Reporting | `server/routes/reportRoutes.ts` | Medium |
| TS-BRAND-001 | Theme Creation | White-Label Branding | `server/brandingRoutes.ts` | Medium |
| TS-BRAND-002 | Logo Upload | White-Label Branding | `server/brandingRoutes.ts`, `server/objectStorage.ts` | Medium |
| TS-BRAND-003 | Favicon Upload | White-Label Branding | `server/brandingRoutes.ts` | Low |
| TS-BRAND-004 | Color Tokens | White-Label Branding | `server/brandingRoutes.ts`, `shared/themeTokenBuilder.ts` | Medium |
| TS-BRAND-005 | Theme Publishing | White-Label Branding | `server/brandingRoutes.ts` | Medium |
| TS-BRAND-006 | Domain Registration | White-Label Branding | `server/brandingRoutes.ts` | Medium |
| TS-BRAND-007 | Domain Verification | White-Label Branding | `server/brandingRoutes.ts` | Medium |
| TS-BRAND-008 | Email Branding | White-Label Branding | `server/brandingRoutes.ts`, `server/services/emailTemplates.ts` | Low |
| TS-BRAND-009 | PWA Manifest | White-Label Branding | `server/brandingRoutes.ts` | Low |
| TS-BRAND-010 | Contrast Correction | White-Label Branding | `server/brandingRoutes.ts`, `client/src/utils/contrast.ts` | Low |
| TS-PAY-001 | Multi-Currency Pricing | Marketplace & Payments | `server/services/currencyService.ts`, `server/services/exchangeRateService.ts` | High |
| TS-PAY-002 | Course Purchase (YOCO) | Marketplace & Payments | `server/routes/paymentsRoutes.ts`, `server/services/paymentService.ts`, `server/services/yocoWebhookVerifier.ts` | Critical |
| TS-PAY-003 | Exchange Rate Snapshot | Marketplace & Payments | `server/services/exchangeRateService.ts`, `server/services/purchaseService.ts` | High |
| TS-PAY-004 | Commission Calculation | Marketplace & Payments | `server/services/purchaseService.ts`, `server/services/payoutService.ts` | High |
| TS-PAY-005 | Version Upgrade Pricing | Marketplace & Payments | `server/services/courseVersionService.ts` | Medium |
| TS-PAY-006 | Invoice Generation | Marketplace & Payments | `server/services/invoiceService.ts`, `server/services/billingScheduler.ts` | High |
| TS-PAY-007 | Payment Status | Marketplace & Payments | `server/routes/paymentsRoutes.ts`, `server/services/paymentOrchestratorService.ts` | High |
| TS-NOTIF-001 | In-App Notifications | Notifications & Email | `server/services/notificationService.ts` | Low |
| TS-NOTIF-002 | Mark as Read | Notifications & Email | `server/services/notificationService.ts` | Low |
| TS-NOTIF-003 | Preferences | Notifications & Email | `server/services/notificationService.ts` | Low |
| TS-NOTIF-004 | Email Templates | Notifications & Email | `server/services/emailTemplates.ts`, `server/services/mailerSendService.ts` | Low |
| TS-NOTIF-005 | Invoice Reminders | Notifications & Email | `server/services/emailSchedulerService.ts` | Low |
| TS-QUIZ-001 | AI Quiz Generation | Quiz System | `server/routes/aiRoutes.ts`, `server/ai/aiService.ts`, `server/services/quizPricingService.ts` | High |
| TS-QUIZ-002 | Quiz Scoring | Quiz System | `server/routes/quizRoutes.ts` | High |
| TS-QUIZ-003 | Pass/Fail Threshold | Quiz System | `server/routes/quizRoutes.ts`, `shared/schema.ts` (quizCollections.passRate) | High |
| TS-QUIZ-004 | Results Recording | Quiz System | `server/routes/quizRoutes.ts` | Medium |
| TS-QUIZ-005 | Bulk Quiz Generation | Quiz System | `server/routes/quizRoutes.ts`, `server/ai/aiService.ts` | Medium |
| TS-QUIZ-006 | Quiz Leaderboard | Quiz System | `server/routes/quizRoutes.ts` | Low |

---

### P2.13 Test Execution Summary Template

Use the following template to record test execution results. Copy this table for each test execution cycle.

**Test Execution Cycle:** _[Cycle Name / Sprint]_  
**Environment:** _[Dev / Staging / Production]_  
**Start Date:** _[YYYY-MM-DD]_  
**End Date:** _[YYYY-MM-DD]_  
**Executed By:** _[Tester Name]_  

| Test ID | Tester | Date | Environment | Result (Pass/Fail/Blocked) | Defect ID | Notes |
|:--------|:-------|:-----|:------------|:--------------------------|:----------|:------|
| TS-AUTH-001 | | | | | | |
| TS-AUTH-002 | | | | | | |
| TS-AUTH-003 | | | | | | |
| TS-AUTH-004 | | | | | | |
| TS-AUTH-005 | | | | | | |
| TS-AUTH-006 | | | | | | |
| TS-AUTH-007 | | | | | | |
| TS-AUTH-008 | | | | | | |
| TS-AUTH-009 | | | | | | |
| TS-AUTH-010 | | | | | | |
| TS-AUTH-011 | | | | | | |
| TS-AUTH-012 | | | | | | |
| TS-AUTH-013 | | | | | | |
| TS-COURSE-001 | | | | | | |
| TS-COURSE-002 | | | | | | |
| TS-COURSE-003 | | | | | | |
| TS-COURSE-004 | | | | | | |
| TS-COURSE-005 | | | | | | |
| TS-COURSE-006 | | | | | | |
| TS-COURSE-007 | | | | | | |
| TS-COURSE-008 | | | | | | |
| TS-COURSE-009 | | | | | | |
| TS-COURSE-010 | | | | | | |
| TS-COURSE-011 | | | | | | |
| TS-COURSE-012 | | | | | | |
| TS-COURSE-013 | | | | | | |
| TS-COURSE-014 | | | | | | |
| TS-COURSE-015 | | | | | | |
| TS-GAME-001 | | | | | | |
| TS-GAME-002 | | | | | | |
| TS-GAME-003 | | | | | | |
| TS-GAME-004 | | | | | | |
| TS-GAME-005 | | | | | | |
| TS-GAME-006 | | | | | | |
| TS-GAME-007 | | | | | | |
| TS-GAME-008 | | | | | | |
| TS-GAME-009 | | | | | | |
| TS-GAME-010 | | | | | | |
| TS-GAME-011 | | | | | | |
| TS-GAME-012 | | | | | | |
| TS-GAME-013 | | | | | | |
| TS-GAME-014 | | | | | | |
| TS-GAME-015 | | | | | | |
| TS-ORG-001 | | | | | | |
| TS-ORG-002 | | | | | | |
| TS-ORG-003 | | | | | | |
| TS-ORG-004 | | | | | | |
| TS-ORG-005 | | | | | | |
| TS-ORG-006 | | | | | | |
| TS-ORG-007 | | | | | | |
| TS-ORG-008 | | | | | | |
| TS-ORG-009 | | | | | | |
| TS-ORG-010 | | | | | | |
| TS-ORG-011 | | | | | | |
| TS-ORG-012 | | | | | | |
| TS-ASSIGN-001 | | | | | | |
| TS-ASSIGN-002 | | | | | | |
| TS-ASSIGN-003 | | | | | | |
| TS-ASSIGN-004 | | | | | | |
| TS-ASSIGN-005 | | | | | | |
| TS-ASSIGN-006 | | | | | | |
| TS-ASSIGN-007 | | | | | | |
| TS-ASSIGN-008 | | | | | | |
| TS-ASSIGN-009 | | | | | | |
| TS-ASSIGN-010 | | | | | | |
| TS-ASSIGN-011 | | | | | | |
| TS-ASSIGN-012 | | | | | | |
| TS-REPORT-001 | | | | | | |
| TS-REPORT-002 | | | | | | |
| TS-REPORT-003 | | | | | | |
| TS-REPORT-004 | | | | | | |
| TS-REPORT-005 | | | | | | |
| TS-REPORT-006 | | | | | | |
| TS-REPORT-007 | | | | | | |
| TS-REPORT-008 | | | | | | |
| TS-REPORT-009 | | | | | | |
| TS-REPORT-010 | | | | | | |
| TS-REPORT-011 | | | | | | |
| TS-REPORT-012 | | | | | | |
| TS-BRAND-001 | | | | | | |
| TS-BRAND-002 | | | | | | |
| TS-BRAND-003 | | | | | | |
| TS-BRAND-004 | | | | | | |
| TS-BRAND-005 | | | | | | |
| TS-BRAND-006 | | | | | | |
| TS-BRAND-007 | | | | | | |
| TS-BRAND-008 | | | | | | |
| TS-BRAND-009 | | | | | | |
| TS-BRAND-010 | | | | | | |
| TS-PAY-001 | | | | | | |
| TS-PAY-002 | | | | | | |
| TS-PAY-003 | | | | | | |
| TS-PAY-004 | | | | | | |
| TS-PAY-005 | | | | | | |
| TS-PAY-006 | | | | | | |
| TS-PAY-007 | | | | | | |
| TS-NOTIF-001 | | | | | | |
| TS-NOTIF-002 | | | | | | |
| TS-NOTIF-003 | | | | | | |
| TS-NOTIF-004 | | | | | | |
| TS-NOTIF-005 | | | | | | |
| TS-QUIZ-001 | | | | | | |
| TS-QUIZ-002 | | | | | | |
| TS-QUIZ-003 | | | | | | |
| TS-QUIZ-004 | | | | | | |
| TS-QUIZ-005 | | | | | | |
| TS-QUIZ-006 | | | | | | |

**Execution Summary:**

| Metric | Count |
|:-------|:------|
| Total Test Cases | 113 |
| Passed | _[count]_ |
| Failed | _[count]_ |
| Blocked | _[count]_ |
| Not Executed | _[count]_ |
| Pass Rate | _[%]_ |
| Defects Found | _[count]_ |

---

### P2.14 Defect Report Template

Use the following template to log defects discovered during test execution.

**Severity Definitions:**

| Severity | Definition |
|:---------|:-----------|
| S1 — Blocker | System crash, data loss, security breach, complete feature failure. Blocks release. |
| S2 — Critical | Major feature broken, no workaround available. Must fix before release. |
| S3 — Major | Feature partially broken, workaround available. Fix in current sprint. |
| S4 — Minor | Cosmetic issue, minor UX problem, edge case. Fix in backlog. |

**Defect Log:**

| Defect ID | Test ID | Severity | Summary | Steps to Reproduce | Expected | Actual | Status |
|:----------|:--------|:---------|:--------|:-------------------|:---------|:-------|:-------|
| DEF-001 | | | | | | | Open |
| DEF-002 | | | | | | | Open |
| DEF-003 | | | | | | | Open |
| DEF-004 | | | | | | | Open |
| DEF-005 | | | | | | | Open |
| DEF-006 | | | | | | | Open |
| DEF-007 | | | | | | | Open |
| DEF-008 | | | | | | | Open |
| DEF-009 | | | | | | | Open |
| DEF-010 | | | | | | | Open |

**Defect Status Definitions:**

| Status | Definition |
|:-------|:-----------|
| Open | Defect reported, not yet assigned |
| In Progress | Developer working on fix |
| Fixed | Fix implemented, awaiting retest |
| Retest | Fix deployed to test environment, QA retesting |
| Closed | Fix verified, defect resolved |
| Deferred | Fix postponed to future sprint |
| Won't Fix | Accepted risk, will not be addressed |
| Duplicate | Same as existing defect |

---

*End of Technical Audit Document — Phase 2: Master Test Documentation*  
*Document updated: February 6, 2026*  
*Next Phase: Phase 3 — Automated Test Implementation & CI/CD Integration*
