# LearnPlayLocal Memory Bank

> Last updated: 2026-05-16
> Scope: cloud + onprem (both variants)
> Source: `Cloud-On-Prem/` workspace
> Docs: `docs/`

---

## 1. Project Overview

**LearnPlay** is a comprehensive AI-powered e-learning platform that supports:
- AI-assisted course creation from source content (PDF, DOCX, PPTX)
- Multi-language translation and localization
- Podcast generation from lesson content
- Quiz creation, gamification, and competitive learning
- Multi-company organizational structure with role-based access
- Enterprise-grade deployment in both cloud and on-premises variants
- White-label branding per organization
- Commerce with course marketplace, subscriptions, and credit packages

**Repo:** `https://github.com/LearnPlayAI/LearnPlayMyAI.git`
**Current Commit:** `e091607 fix table import from docx and gamma table generation`
**Branch:** `main`

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Wouter (routing), Tailwind CSS 3, Radix UI, Framer Motion, shadcn/ui components |
| **Backend** | Express.js (Node.js), TypeScript via tsx, Socket.IO (WebSocket), Passport.js (auth) |
| **Database** | PostgreSQL 16, Drizzle ORM, Drizzle Kit (migrations) |
| **Build** | Vite (bundler), esbuild (server bundle), Jest + ts-jest (testing) |
| **Storage** | Google Cloud Storage (cloud), local filesystem (onprem), Uppy (file uploads) |
| **AI/ML** | Google Gemini (AI content generation), Gamma (slide decks), ElevenLabs (podcast TTS) |
| **PDF/Docs** | pdf-parse, PDFKit, mammoth (DOCX), fast-xml-parser, pptx-in-html-out, pptx-preview, unzipper |
| **Streaming** | HLS.js (podcast playback), HLS streaming |
| **Charts** | Recharts |
| **Validation** | Zod, Zod Validation Error |
| **Other** | date-fns, canvas-confetti, lucide-react, react-icons, recharts, sharp (image processing) |

---

## 3. Directory Structure

```
LearnPlayLocal/
├── .agents/skills/            # AI agent skill definitions (governance, testing, UI/UX, etc.)
├── .skills/                   # Local skill mirrors
├── Cloud-On-Prem/             # ← MAIN SOURCE WORKSPACE
│   ├── client/                # Frontend React application
│   │   ├── public/            # Static assets
│   │   └── src/
│   │       ├── components/    # Reusable UI components
│   │       ├── config/        # Configuration modules
│   │       ├── contexts/      # React contexts
│   │       ├── hooks/         # Custom React hooks
│   │       ├── lib/           # Shared library code
│   │       ├── pages/         # Page components (~120+ pages)
│   │       ├── tests/         # Frontend tests
│   │       ├── types/         # TypeScript type definitions
│   │       └── utils/         # Utility functions
│   ├── cloud/                 # Cloud deployment scripts (install, update, backup, etc.)
│   ├── contracts/schema/      # API/schema contract definitions (JSON)
│   ├── docs/                  # Cloud-On-Prem specific documentation
│   ├── drizzle/               # Drizzle ORM migration SQL files
│   ├── migrations/            # 100+ numbered migration SQL files
│   ├── onprem/                # On-prem deployment scripts
│   ├── scripts/               # Build, audit, and utility scripts
│   ├── server/                # Backend Express.js application
│   │   ├── ai/                # AI service integration
│   │   ├── api/               # API modules
│   │   ├── config/            # Server configuration
│   │   ├── middleware/        # Express middleware
│   │   ├── monitoring/        # Health monitoring
│   │   ├── routes/            # API route handlers (30 route files)
│   │   ├── schedulers/        # Background job schedulers
│   │   ├── scripts/           # Server-side utility scripts
│   │   ├── services/          # Business logic services
│   │   ├── tests/             # Backend tests
│   │   ├── utils/             # Server utilities
│   │   └── workers/           # Background workers
│   ├── shared/                # Shared TypeScript between client/server
│   │   └── schema.ts          # ← PRIMARY DATABASE SCHEMA
│   └── tests/                 # Integration and contract tests
├── docs/                       # ← CANONICAL DOCUMENTATION ROOT
│   ├── aimem/                  # AI Development Operating Standard
│   ├── archive/                # Historical/archive documentation
│   ├── architecture/           # Architecture documents
│   ├── changelog/              # Current changelog
│   ├── features/               # Feature documentation
│   ├── func/                   # Functional domain documentation
│   ├── handover/               # Current handover/release state
│   ├── handoverdocs/           # Legacy handover docs
│   ├── knowledge/              # Knowledge kernel and index
│   ├── landscape/              # Runtime landscape and scope maps
│   ├── lppadminv2/             # LPPAdmin v2 overhaul plans
│   ├── operations/             # Operations runbooks
│   ├── prompts/                # AI prompt templates
│   ├── testing/                # Testing index and plans
│   ├── TODO/                   # Execution tracking
│   └── ui/                     # UI component documentation
├── scripts/                    # Workspace-level scripts
│   ├── devadmin/               # Dev admin scripts
│   ├── dr/                     # Disaster recovery scripts
│   ├── check-workspace-cdp.sh
│   ├── start-workspace-cdp.sh
│   └── synthesis-journey-audit.mjs
├── devadmin.sh                 # Main deployment/orchestration tool
├── devtools.sh                 # Development tools setup
├── update-acc.sh               # ACC promotion script
├── update-dev.sh               # DEV deployment script
├── update-prd.sh               # PRD deployment script
├── package.json                # Root package manifest
└── .gitignore
```

---

## 4. Key Entry Points

### Backend
| File | Purpose |
|------|---------|
| `server/index.ts` | Main server entry point |
| `server/routes.ts` | Central route registration |
| `server/db.ts` | Cloud database connection |
| `server/db-onprem.ts` | Onprem database connection |
| `server/vite.ts` / `server/vite-onprem.ts` | Vite dev server integration |
| `server/loadEnv.ts` | Environment variable loading |
| `server/tenantMiddleware.ts` | Multi-tenant middleware |

### Frontend
| File | Purpose |
|------|---------|
| `client/src/main.tsx` | React app entry point |
| `client/src/App.tsx` | Main app component with routing |
| `client/src/index.css` | Global styles |

### Schema
| File | Purpose |
|------|---------|
| `shared/schema.ts` | **Primary database schema** (Drizzle ORM) |
| `shared/*.ts` | Domain-specific schema constants and contracts |

### Configuration
| File | Purpose |
|------|---------|
| `drizzle.config.ts` | Drizzle Kit configuration (PostgreSQL) |
| `client/vite.config.ts` | Vite bundler configuration |
| `tailwind.config.ts` | Tailwind CSS configuration |
| `postcss.config.js` | PostCSS configuration |
| `tsconfig.json` | TypeScript configuration |
| `components.json` | shadcn/ui component configuration |

---

## 5. API Routes (30 route modules)

| Route File | Domain |
|-----------|--------|
| `authRoutes.ts` | Authentication (login, register, password) |
| `courseRoutes.ts` | Courses (CRUD, publishing, pricing) |
| `courseFrameworkRoutes.ts` | Course framework and structure |
| `quizRoutes.ts` | Quiz creation and management |
| `lessonWizard.ts` (via courses) | Lesson authoring |
| `aiRoutes.ts` | AI integration endpoints |
| `gamificationRoutes.ts` | Gamification system |
| `gameRoutes.ts` | Game engine |
| `enterprisePortalRoutes.ts` | Enterprise customer portal |
| `enterpriseAuthRoutes.ts` | Enterprise authentication |
| `enterpriseSuperAdminRoutes.ts` | SuperAdmin governance |
| `enterpriseRevenueRoutes.ts` | Enterprise revenue |
| `orgRoutes.ts` | Organization management |
| `orgSalesRoutes.ts` | Organization sales |
| `orgSalesRoutes.ts` | Org sales management |
| `paymentsRoutes.ts` | Payment processing |
| `platformRevenue.ts` | Platform revenue analytics |
| `subscription` endpoints | Subscription management |
| `languageRoutes.ts` | Language/translation management |
| `brandingRoutes.ts` | Theme/branding management |
| `superAdminRoutes.ts` | SuperAdmin operations |
| `reportRoutes.ts` | Reporting/analytics |
| `demoDataRoutes.ts` | Demo data management |
| `sourceIntelligenceRoutes.ts` | Source document management |
| `certficates` endpoints | Certificate generation |
| `webhook` endpoints | Payment webhooks |
| `public.ts` | Public-facing endpoints |
| `sharedResources.ts` | Shared static resources |

---

## 6. Frontend Pages (~120 page components)

Key page categories:
- **Auth:** login, register, forgot-password, reset-password, verify-email
- **Student:** StudentDashboard, MyCourses, LessonViewer, BrowseCourses, CourseDetail
- **Creator:** CourseBuilder, CourseBuilderUpload, LessonContentStudio, LessonWizard, QuizWizard
- **Admin:** SuperAdmin, SuperAdminImpersonate, PlatformConfiguration, IntegrationSettings
- **Enterprise:** EnterpriseDashboard, EnterpriseLicenses, EnterpriseSystems, EnterpriseAgreements
- **Commerce:** CoursePurchase, CreditPurchase, SubscriptionManagement, BillingDashboard
- **Analytics:** PlatformRevenueReports, MarketplaeRevenue, RevenueAnalyticsDashboard
- **Gamification:** GameLobby, GamePlay, GameRoom, QuizLobby, QuizSinglePlayer, Quiz1v1
- **Management:** OrgManagementHub, UserManagement, CourseAssignments, GradeManager
- **Theme:** ThemeEditor, GammaThemes
- **Settings:** AISettings, GamificationSettings, SourceIntelligenceSettings

---

## 7. Deployment Variants

### Environments
| Environment | Cloud URL | OnPrem URL |
|------------|-----------|------------|
| DEV | https://stcloud.learnplay.co.za | https://stonprem.learnplay.co.za |
| ACC | https://acccl.learnplay.co.za | https://accop.learnplay.co.za |
| PRD | https://learnplay.co.za | https://prdop.learnplay.co.za |

### Runtime Paths
| Variant | App Root | DB Data Dir | Uploads |
|---------|----------|-------------|---------|
| Cloud | `/opt/learnplay/cloud` | `/opt/lpdb/cloud/pg16/main` | `/opt/learnplay/cloud/uploads` |
| OnPrem | `/opt/learnplay/onprem` | `/opt/lpdb/onprem/pg16/main` | `/opt/learnplay/onprem/uploads` |

### Deployment Flow
```
DEV → ACC → PRD (per variant)
cloud DEV → cloud ACC → cloud PRD
onprem DEV → onprem ACC → onprem PRD
```

### DevOps Scripts
| Script | Purpose |
|--------|---------|
| `devadmin.sh` | Main deployment/orchestration tool |
| `devtools.sh` | Development tools setup |
| `update-dev.sh` | Deploy to DEV |
| `update-acc.sh` | Promote to ACC |
| `update-prd.sh` | Promote to PRD |
| `Cloud-On-Prem/cloud/master-install.sh` | Cloud initial installation |
| `Cloud-On-Prem/cloud/update.sh` | Cloud updates |
| `Cloud-On-Prem/onprem/install.sh` | OnPrem initial installation |

---

## 8. Database & Migrations

- **Engine:** PostgreSQL 16
- **ORM:** Drizzle ORM
- **Migration Tool:** Drizzle Kit
- **Migration Files:** 100+ numbered SQL migrations in `Cloud-On-Prem/migrations/`
- **Schema Definition:** `Cloud-On-Prem/shared/schema.ts` (TypeScript)
- **API Contracts:** `Cloud-On-Prem/contracts/schema/` (JSON exports for cloud, onprem, shared)

Migration numbering: `0000_*` through `0108_*` with domain-specific changes covering:
- Course framework, lessons, assignments
- Enterprise licensing and governance
- Gamification, quizzes, translations
- Theme/branding system
- Payment/webhook systems
- Source intelligence

---

## 9. Testing Infrastructure

- **Framework:** Jest + ts-jest
- **Test Command:** `npm test` (full), `npm run test:critical` (critical path)
- **Smoke Tests:** `Cloud-On-Prem/tests/smoke/validate-endpoints.ts`
- **Contract Tests:** Various `*.contracts.test.ts` files
- **Load Testing:** k6 scripts in `Cloud-On-Prem/tests/load/`
- **Test Fixtures:** Course framework fixtures in `Cloud-On-Prem/tests/fixtures/`
- **Test Index:** `docs/testing/TESTING_INDEX.md`

---

## 10. Key Operating Standards (from aimem.md)

### Priority P0 Rules (Highest)
- Default scope is **cloud + onprem** (both variants) unless explicitly scoped
- All development in **DEV workspace only** — DEV is the single source of truth
- Deployment flow: **DEV → ACC → PRD** through `devadmin`
- All changes must be **idempotent** and state-aware
- **No compatibility bridges** — strict naming alignment, zero drift
- **Source code changes** made in workspace, never as runtime hotpatches
- **User-driven E2E validation** — AI provides source changes + test steps, user confirms deployment
- DB backup required before any app/DB update
- Strict **organization isolation** for multi-company operation

### Skill Routing (Mandatory)
1. Always load `learnplay-core-governance` first
2. Add `learnplay-ui-ux-tokens` for UI/frontend/styling/accessibility
3. Add `learnplay-api-data-contracts` for API/backend/schema/migration
4. Add `learnplay-testing-release-gates` for substantial changes
5. Add `learnplay-observability-rollback` for runtime/deployment changes

---

## 11. Functional Domains

Documented in `docs/func/<Domain>/`:
- AdminAccess
- CourseLessons
- CrossOrgAssignmentSecurity
- DemoData
- Deployment
- EnterpriseManagement
- EnrollmentManagement
- Gamification
- IntegrationSettings
- InterOrgConfig
- Licensing
- OrganizationManagement
- PlatformRevenue
- PodCasting
- Storage
- UserManagement

---

## 12. Shared Domain Modules

Located in `Cloud-On-Prem/shared/`:
| Module | Purpose |
|--------|---------|
| `schema.ts` | Primary database schema (all tables/columns) |
| `brandingTokens.ts` | Theme branding token definitions |
| `businessConstants.ts` | Business logic constants |
| `challengeConstants.ts` | Gamification challenge definitions |
| `contentParsers.ts` | Document parsing utilities |
| `courseCategories.ts` | Course category definitions |
| `courseFrameworkContracts.ts` | Course framework contracts |
| `creditConstants.ts` | Credit system constants |
| `enterpriseLicenseOrdering.ts` | Enterprise license ordering |
| `gameUtils.ts` | Game engine utilities |
| `learningAssetTypes.ts` | Learning asset type definitions |
| `levelUtils.ts` | Level progression utilities |
| `sourceLessonContent.ts` | Source lesson content model |
| `sourceLessonMaterialV2.ts` | Source lesson material v2 |
| `themeComponentContracts.ts` | Theme component contracts |
| `themeContrastGuard.ts` | Accessibility contrast enforcement |
| `themePresetCatalog.ts` | Theme preset catalog |
| `themeTokenBuilder.ts` | Theme token construction |
| `tokenSectionMapping.ts` | Token-to-section mapping |

---

## 13. Project Statistics

- **Total Files:** 1,966 (excluding `.git/` and `node_modules/`)
- **Total Directories:** 294
- **Migrations:** 109 numbered migration files
- **API Routes:** 30 route modules
- **Frontend Pages:** 120+ page components
- **Test Files:** 20+ contract/smoke tests + fixtures

---

## 14. Important Paths References

| Reference | Path |
|-----------|------|
| Workspace | `/vscode/LearnPlayLocal` (local), `/antigravity/` (remote host) |
| Source | `Cloud-On-Prem/` |
| Docs | `docs/` |
| Schema | `Cloud-On-Prem/shared/schema.ts` |
| Server Entry | `Cloud-On-Prem/server/index.ts` |
| Client Entry | `Cloud-On-Prem/client/src/main.tsx` |
| Cloud Install | `Cloud-On-Prem/cloud/master-install.sh` |
| OnPrem Install | `Cloud-On-Prem/onprem/install.sh` |
| DevAdmin | `devadmin.sh` |
| Knowledge Kernel | `docs/knowledge/KNOWLEDGE_KERNEL.md` |
| Operating Standard | `docs/aimem/aimem.md` |
| Current Handover | `docs/handover/CURRENT_HANDOVER.md` |
| Release State | `docs/handover/RELEASE_STATE.md` |
| Landscape | `docs/landscape/CURRENT_LANDSCAPE.md` |

---

## 15. Development Workflow

1. **Work in DEV workspace** — all source changes in `Cloud-On-Prem/`
2. **Run tests:** `npm test` or `npm run check` (full conformance)
3. **Deploy to DEV:** `./update-dev.sh`
4. **User validates** on DEV runtimes (cloud + onprem)
5. **Promote to ACC:** `./update-acc.sh`
6. **User accepts** ACC acceptance criteria
7. **Promote to PRD:** `./update-prd.sh`
8. **Update docs:** handover, changelog, release state

### Local Development
```bash
cd Cloud-On-Prem
npm run dev          # Start dev server (tsx)
npm run dev:watch    # Watch mode
npm run build        # Build for production
npm test             # Run test suite
npm run check        # Full conformance check
```

---

## 16. Quick Reference — Role System

| Role | Scope |
|------|-------|
| `SuperAdmin` | Platform-wide governance |
| `CustSuper` | Customer/enterprise super admin |
| `Admin` | Organization admin |
| `Teacher` | Course creator/manager |
| `Learner` | Student/enrolled user |

---

## 17. External Service Integrations

| Service | Purpose |
|---------|---------|
| Google Gemini | AI content generation (course framework, lessons, quizzes) |
| Gamma | Slide deck generation |
| ElevenLabs | Podcast text-to-speech |
| Google Cloud Storage | Cloud file storage |
| MailerSend / SMTP | Email delivery |
| Stripe / Payment Gateway | Payment processing |

---

> This memory bank is a living document. Update it when major structural changes occur to the codebase.