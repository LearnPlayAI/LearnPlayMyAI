# Linux-On-Prem Reconciliation and Retirement

Generated: 2026-03-10 10:32:53 UTC

## Summary
- Cloud-only files: 575
- Linux-only files: 2
- Common files changed: 335
- Common files identical: 414

## Notable Differences
- Linux tree contained legacy variant artifacts and route/config divergence in server and client modules.
- Cloud tree contains current installer/update hardening, runtime marker, provenance, and policy controls.

## Samples
### Cloud-only (sample)
- `.env.bak-20260305-isolation`
- `.gitignore`
- `Cloud-On-Prem.zip`
- `InstallerTasks.md`
- `attached_assets/generated_images/LP_quiz_logo_full_canvas_11536a40.png`
- `attached_assets/generated_images/LP_quiz_logo_purple_gold_511b8754.png`
- `attached_assets/generated_images/LP_quiz_logo_tight_crop_a32dd14b.png`
- `attached_assets/generated_images/LearnPlay_card_back_design_83ca1184.png`
- `attached_assets/generated_images/LearnPlay_professional_logo_design_afe7c89c.png`
- `attached_assets/generated_images/LearnPlay_purple_and_gold_logo_24eedd12.png`
- `attached_assets/generated_images/LearnPlay_quiz-themed_logo_design_ce3726af.png`
- `attached_assets/generated_images/T-Rex_trading_card_artwork_b728905a.png`
- `attached_assets/generated_images/Trumped_app_icon_design_79bd8bdd.png`
- `attached_assets/update_20260215_133427_1771162581645.log`
- `build-cloud-linux.sh`
- `cloud/INSTALLATION-GUIDE.md`
- `cloud/INSTALLATION_UBUNTU.md`
- `cloud/UPDATE-GUIDE.md`
- `cloud/app-install.sh`
- `cloud/configure-env.sh`
- `cloud/data/achievementCatalog.json`
- `cloud/data/adminChallengeConfig.json`
- `cloud/data/branding_themes.json`
- `cloud/data/businessPackagePrices.json`
- `cloud/data/businessPackages.json`

### Linux-only (sample)
- `client/src/config/enterprisePortal.ts`
- `learnplay-onprem.tar.gz`

### Changed common files (sample)
- `.env`
- `.env.example`
- `HANDOVER.md`
- `client/src/App.tsx`
- `client/src/components/AdminNavSidebar.tsx`
- `client/src/components/CommandDialogNav.tsx`
- `client/src/components/EnterprisePortalLayout.tsx`
- `client/src/components/ProtectedRoute.tsx`
- `client/src/components/QuizAdminLayout.tsx`
- `client/src/components/StudentInsightsTab.tsx`
- `client/src/config/adminNavConfig.ts`
- `client/src/pages/AISettings.tsx`
- `client/src/pages/CourseDocumentWizard.tsx`
- `client/src/pages/CourseEdit.tsx`
- `client/src/pages/GamificationSettings.tsx`
- `client/src/pages/LessonWizard.tsx`
- `client/src/pages/OnPremEnrollmentManagement.tsx`
- `client/src/pages/OnPremLicenseManagement.tsx`
- `client/src/pages/PlatformPricing.tsx`
- `client/src/pages/UserManagement.tsx`
- `client/src/pages/landing.jsx`
- `client/src/pages/login.jsx`
- `components.json`
- `drizzle/migrations/0001_join_request_approval_tokens.sql`
- `drizzle/migrations/0002_framework_generation_status.sql`
- `eng.traineddata`
- `migrations/0059_build_date_column.sql`
- `server/challengeScheduler.ts`
- `server/config/base-url.ts`
- `server/config/cloud-license-public-key.pem`
- `server/config/featureFlags.ts`
- `server/config/paymentFeatureFlags.ts`
- `server/ensureSeasonPass.ts`
- `server/featureFlags.ts`
- `server/index.ts`
- `server/integrityCheck.ts`
- `server/middleware/orgIsolationMiddleware.ts`
- `server/middleware/sessionAuthMiddleware.ts`
- `server/middleware/trialLockoutMiddleware.ts`
- `server/routes.ts`

## Retirement Decision
- Linux-On-Prem is retired on this host after archival snapshot.
- Cloud-On-Prem is the single source of truth.
- Archive snapshot path: `/antigravity/archives/Linux-On-Prem-retired-20260310_103252.tar.gz`
- Note: Archive was captured while files were actively changing; use this snapshot for forensic reference only.
