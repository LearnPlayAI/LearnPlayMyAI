# E-Learning Marketplace — Test Cases Document

**Document Version:** 1.0  
**Date:** February 6, 2026  
**Module Under Test:** E-Learning Marketplace (LESSON 7)  
**Methodology:** STLC-Aligned (Software Testing Life Cycle)  
**Requirements Source:** LESSON 7 — E-Learning Marketplace (10 Slides)  
**Technical Reference:** [`TECHNICAL_AUDIT.md`](./TECHNICAL_AUDIT.md) — Phase 1 Technical Stocktake  
**Author:** QA Engineering Team  

---

## Table of Contents

1. [Document Purpose & Scope](#1-document-purpose--scope)
2. [Test Environment & Prerequisites](#2-test-environment--prerequisites)
3. [Phase 1: Technical Stocktake — Feature-to-Code Mapping](#3-phase-1-technical-stocktake--feature-to-code-mapping)
   - 3.1 [Slide 1 — Title / Overview (Create, Sell, Grow)](#31-slide-1--title--overview-create-sell-grow)
   - 3.2 [Slide 2 — Course Marketplace (Browse & Purchase)](#32-slide-2--course-marketplace-browse--purchase)
   - 3.3 [Slide 3 — Create & Sell (Publish for External Sales)](#33-slide-3--create--sell-publish-for-external-sales)
   - 3.4 [Slide 4 — Multi-Currency Support (ZAR/EUR/USD)](#34-slide-4--multi-currency-support-zareurusd)
   - 3.5 [Slide 5 — Secure Payment Processing (YOCO Integration)](#35-slide-5--secure-payment-processing-yoco-integration)
   - 3.6 [Slide 6 — Course Reviews & Ratings (Social Proof)](#36-slide-6--course-reviews--ratings-social-proof)
   - 3.7 [Slide 7 — Purchaser Access Protection (Permanent Access)](#37-slide-7--purchaser-access-protection-permanent-access)
   - 3.8 [Slide 8 — Sales Dashboard (Revenue Overview)](#38-slide-8--sales-dashboard-revenue-overview)
   - 3.9 [Slide 9 — Monthly Payouts (Payout Processing)](#39-slide-9--monthly-payouts-payout-processing)
   - 3.10 [Slide 10 — Revenue Analytics (Comprehensive Reporting)](#310-slide-10--revenue-analytics-comprehensive-reporting)
4. [Phase 2: Master Test Documentation](#4-phase-2-master-test-documentation)
   - 4.1 [Course Marketplace Browsing Tests (Slides 1–2)](#41-course-marketplace-browsing-tests-slides-12)
   - 4.2 [Course Publishing & Selling Tests (Slide 3)](#42-course-publishing--selling-tests-slide-3)
   - 4.3 [Multi-Currency Support Tests (Slide 4)](#43-multi-currency-support-tests-slide-4)
   - 4.4 [Payment Processing Tests (Slide 5)](#44-payment-processing-tests-slide-5)
   - 4.5 [Course Reviews & Ratings Tests (Slide 6)](#45-course-reviews--ratings-tests-slide-6)
   - 4.6 [Purchaser Access Protection Tests (Slide 7)](#46-purchaser-access-protection-tests-slide-7)
   - 4.7 [Sales Dashboard Tests (Slide 8)](#47-sales-dashboard-tests-slide-8)
   - 4.8 [Monthly Payouts Tests (Slide 9)](#48-monthly-payouts-tests-slide-9)
   - 4.9 [Revenue Analytics Tests (Slide 10)](#49-revenue-analytics-tests-slide-10)
5. [Traceability Matrix](#5-traceability-matrix)
6. [Glossary](#6-glossary)

---

## 1. Document Purpose & Scope

This document provides a comprehensive, tester-friendly test case suite for the **E-Learning Marketplace** module of the LearnPlay e-learning platform. It is derived from the functional requirements outlined in "LESSON 7: E-Learning Marketplace" (10 slides) and mapped directly to the verified codebase implementation as documented in [`TECHNICAL_AUDIT.md`](./TECHNICAL_AUDIT.md).

**In Scope:**
- Course Marketplace browsing, searching, and purchasing (public catalog)
- Course publishing workflow (visibility, pricing, currency)
- Multi-currency support (ZAR/EUR/USD) with automatic conversion and hourly updates
- YOCO payment gateway integration (checkout, webhooks, verification, receipts)
- Course reviews and ratings (0.5–5.0 half-star, verified purchase, moderation)
- Purchaser access protection (permanent access regardless of course status changes)
- Org-level sales dashboard (revenue summary, course breakdown, monthly trends)
- Monthly payout processing (calculation, batch creation, PDF invoices, banking)
- Revenue analytics and platform reporting (SuperAdmin)
- Refund system (14-day eligibility window, approval/decline workflow)

**Out of Scope:**
- AI-powered course creation, gamification, card trading, user management
- Infrastructure and deployment testing
- Performance and load testing (separate document)

**Implementation Gaps Identified:**
1. **PayFast, Google Pay, Apple Pay** — Slide 5 references additional payment methods. These are **NOT IMPLEMENTED**. Only YOCO is integrated as the payment gateway.
2. **Conversion Insights** — Slide 8 mentions "course views convert to purchases." No view tracking or conversion analytics exist. This is **NOT IMPLEMENTED**.
3. **Market Insights / Benchmarks** — Slide 10 mentions "compare to marketplace benchmarks." This is **NOT IMPLEMENTED**. No benchmarking data or comparison engine exists.
4. **Export Capabilities** — Slide 10 mentions "export data for external BI tools." This is **NOT IMPLEMENTED**. No CSV/Excel export for revenue data exists.
5. **Pricing Analysis** — Slide 10 mentions "evaluate how pricing affects performance." No price-vs-performance correlation analysis exists. This is **NOT IMPLEMENTED**.

---

## 2. Test Environment & Prerequisites

### 2.1 Required User Roles

| Role | Purpose | Access Level |
|------|---------|-------------|
| **SuperAdmin** | Platform-wide administration, payment settings, payout management, revenue analytics, currency rate management | All features |
| **OrgAdmin** | Organization-level course publishing, sales dashboard, payout history, refund management | Organization-scoped |
| **Teacher / Instructor** | Course creation and publishing, price setting, review moderation | Organization-scoped |
| **Student / Learner** | Marketplace browsing, course purchasing, review submission, purchase history | Buyer-scoped access |

### 2.2 Pre-requisites for All Tests

1. Active user session (logged in with appropriate role)
2. At least one e-learning type organization exists with public courses
3. YOCO payment gateway is configured (test mode keys: `YOCO_TEST_SECRET_KEY`, `YOCO_TEST_PUBLIC_KEY`)
4. Currency conversion rates are populated in `currencyConversionRates` table
5. Database is accessible and migration is current
6. Email service (MailerSend) is configured for receipt and notification tests
7. Replit Object Storage is configured for receipt PDF storage

### 2.3 Test Data Requirements

| Item | Description |
|------|-------------|
| Public Course (ZAR) | An active course with `visibility` = "public", `price` = "199.99", `currency` = "ZAR", at least 3 lessons with PPTX content and quizzes, one lesson marked as demo/overview |
| Public Course (USD) | An active course with `visibility` = "public", `price` = "29.99", `currency` = "USD" |
| Public Course (EUR) | An active course with `visibility` = "public", `price` = "24.99", `currency` = "EUR" |
| Internal Course | An active course with `visibility` = "org_only" (should NOT appear on marketplace) |
| Draft Course | A course with `status` = "draft" (should NOT appear on marketplace) |
| E-Learning Organization | An organization with `type` = "elearning" owning the public courses |
| Test Buyer | A learner account belonging to a DIFFERENT organization from the course creator |
| Completed Buyer | A buyer who has purchased AND completed all lessons in a course (eligible for review) |
| YOCO Test Keys | Valid YOCO test mode API keys configured in environment |
| Exchange Rates | Active rates for USD→ZAR, EUR→ZAR, USD→EUR pairs in `currencyConversionRates` |
| Banking Details | Organization banking details configured in `organizationBankingDetails` for payout tests |

---

## 3. Phase 1: Technical Stocktake — Feature-to-Code Mapping

This section maps each requirement slide to the actual codebase implementation, linking feature descriptions to database tables, API endpoints, backend services, and frontend components.

---

### 3.1 Slide 1 — Title / Overview (Create, Sell, Grow)

**Requirement:** E-Learning Marketplace overview — "Create, Sell, Grow" — marketplace value proposition enabling course creators to monetize their expertise.

**Assessment:** This is a title slide providing context. No discrete testable features. The capabilities described are validated through Slides 2–10.

| Requirement | Implementation Status |
|-------------|----------------------|
| Create courses for marketplace | Implemented via course publishing with `visibility` = "public" (Slide 3) |
| Sell courses globally | Implemented via YOCO payment processing with multi-currency (Slides 4–5) |
| Grow revenue through analytics | Implemented via sales dashboard and revenue analytics (Slides 8–10) |

---

### 3.2 Slide 2 — Course Marketplace (Browse & Purchase)

**Requirement:** Browse and purchase courses from creators — curated catalog, category navigation, search, course previews with demo lesson, pricing transparency, and instant access upon purchase.

| Feature | DB Tables | API Endpoints | Services/Logic | Frontend Components | Status |
|---------|-----------|---------------|----------------|---------------------|--------|
| Browse public course catalog | `courses` (status = "active", visibility = "public") | `GET /api/public/courses` (rate-limited, no auth) | `CourseService` — filters by status + visibility | `BrowseCourses.tsx` | **Implemented** |
| Popular courses listing | `courses` (ordered by totalRatings, averageRating) | `GET /api/public/popular-courses` | `ShowcaseCourseService` | `BrowseCourses.tsx` | **Implemented** |
| Single course detail (public) | `courses` (price, currency, averageRating, totalRatings, description, objectives) | `GET /api/public/courses/:courseId` (rate-limited) | `CourseService` | `CourseDetail.tsx` | **Implemented** |
| Category/department filtering | `courses` joined with `courseLessons`, `organizationUnits` | `GET /api/public/courses` (query params for filtering) | `CourseService` — category-based filtering | `BrowseCourses.tsx` (filter controls) | **Implemented** |
| Search by title/keyword | `courses` (ILIKE search on title, description) | `GET /api/public/courses` (query: search) | `CourseService` — text search | `BrowseCourses.tsx` (search input) | **Implemented** |
| Course preview (description, objectives, curriculum) | `courses`, `courseLessons`, `lessons` | `GET /api/public/courses/:courseId` | `CourseService` — returns enriched course detail | `CourseDetail.tsx` (description, objectives, lesson list) | **Implemented** |
| Demo/overview lesson access | `lessons` (isOverview = true), `lessonSlides` | `GET /api/courses/:id/demo-lesson`, `GET /api/courses/:courseId/lessons/:lessonId/demo` (no auth) | `LessonService` | `DemoLessonViewer.tsx` | **Implemented** |
| Pricing display with currency | `courses.price` decimal(19,4), `courses.currency` currencyCodeEnum | `GET /api/public/courses/:courseId` | N/A (data field) | `CourseDetail.tsx`, `CurrencyIndicatorBadge.tsx` | **Implemented** |
| Instant access upon purchase | `userCourseEnrollments` (created on purchase fulfillment) | Triggered via webhook fulfillment | `PurchaseService.grantAccess()` — creates enrollment record | `CoursePurchaseSuccess.tsx`, `MyCourses.tsx` | **Implemented** |
| Rate limiting on public endpoints | In-memory rate limit store (100 req/min per IP) | All `/api/public/*` endpoints | `checkPublicRateLimit()` in `public.ts` | N/A (server-side) | **Implemented** |

---

### 3.3 Slide 3 — Create & Sell (Publish for External Sales)

**Requirement:** Publish courses for external sales — expertise monetization, course publishing workflow, pricing control, global distribution, passive revenue, brand exposure, content ownership, quality standards.

| Feature | DB Tables | API Endpoints | Services/Logic | Frontend Components | Status |
|---------|-----------|---------------|----------------|---------------------|--------|
| Set course visibility to "public" | `courses.visibility` courseVisibilityEnum ("public" / "org_only") | `PATCH /api/courses/:id` (body: visibility) | `CourseVisibilityService` | `CourseEdit.tsx` (visibility toggle) | **Implemented** |
| Set course price | `courses.price` decimal(19,4) | `PATCH /api/courses/:id` (body: price) | `RevenueTrackingService.recordPriceHistory()` | `CourseEdit.tsx` (price input) | **Implemented** |
| Select pricing currency | `courses.currency` currencyCodeEnum (ZAR/USD/EUR) | `PATCH /api/courses/:id` (body: currency) | N/A (enum field) | `CourseEdit.tsx` (currency dropdown) | **Implemented** |
| Price change audit trail | `coursePriceHistory` (courseId, oldPrice, newPrice, currency, changedAt, changedBy) | Triggered internally on price change | `RevenueTrackingService.recordPriceHistory()` | N/A (server-side) | **Implemented** |
| Course listing on marketplace after publish | `courses` (status = "active", visibility = "public") | `GET /api/public/courses` (includes newly published) | `CourseService` | `BrowseCourses.tsx` | **Implemented** |
| Organization branding on course cards | `organizations` (name, logo), `courses.organizationId` | `GET /api/public/courses` (returns org info) | `CourseService` — enriches with organization data | `BrowseCourses.tsx`, `CourseDetail.tsx` | **Implemented** |
| Content ownership (no transfer on purchase) | `courses.organizationId` (unchanged after purchase), `coursePurchases` (separate record) | N/A | PurchaseService — creates purchase record; course ownership remains with creator org | N/A | **Implemented** |
| Quality standards (publish validation) | `courses`, `courseLessons`, `lessons` | `GET /api/courses/:id/validate-publish` | `CourseService.validateCourseForPublish()` — checks lessons, PPTX content, quizzes | `CourseEdit.tsx` (validation warnings) | **Implemented** |

---

### 3.4 Slide 4 — Multi-Currency Support (ZAR/EUR/USD)

**Requirement:** ZAR/EUR/USD support — global currency options, automatic conversion, hourly exchange rate updates, locked purchase rates, display preferences, seller simplicity, payout clarity.

| Feature | DB Tables | API Endpoints | Services/Logic | Frontend Components | Status |
|---------|-----------|---------------|----------------|---------------------|--------|
| Three-currency support (ZAR/EUR/USD) | `currencyCodeEnum` ("ZAR", "USD", "EUR"), `courses.currency` | All course/payment endpoints | `CurrencyService` — SUPPORTED_CURRENCIES constant | `CurrencyPreferenceModal.tsx`, `AdminCurrencyToggle.tsx` | **Implemented** |
| Automatic currency conversion | `currencyConversionRates` (baseCurrency, targetCurrency, rate decimal(19,8)) | `GET /api/admin/currency/rates` | `CurrencyService.convertAmount()`, `CurrencyService.getLatestRate()` | `CheckoutConversionConfirmation.tsx`, `CurrencyConversionTooltip.tsx` | **Implemented** |
| Hourly exchange rate updates | `currencyConversionRates` (lastUpdated, source = "auto") | `POST /api/admin/currency-rates/refresh` | `CurrencyService.fetchLatestRates()`, `CurrencyService.updateAutomaticRates()` — primary API: exchangerate-api.com, fallback: fawazahmed0 | N/A (scheduler-based) | **Implemented** |
| Locked purchase rate at checkout | `coursePurchases.exchangeRateUsed` decimal(19,8), `paymentIntents` metadata (exchangeRate, rateSource: "locked"/"fresh") | `POST /api/payments/create-checkout` | `PaymentOrchestratorService.createCourseCheckout()` — snapshots rate at checkout time | `PurchaseConfirmationModal.tsx`, `CheckoutConversionConfirmation.tsx` | **Implemented** |
| Buyer currency display preferences | User preference (client-side) | N/A (frontend-only) | N/A | `CurrencyPreferenceModal.tsx`, `useCurrencyPreference.ts`, `useCurrencyDisplay.ts` | **Implemented** |
| Seller price in home currency | `courses.currency` (set by creator) | `GET /api/courses/:id` | N/A (stored in creator's chosen currency) | `CourseEdit.tsx` | **Implemented** |
| Payout in seller's currency | `coursePayouts.currency`, `coursePayouts.exchangeRateSnapshot` (JSONB, immutable) | `GET /api/admin/payouts` | `PayoutService.calculateMonthlyPayouts()` — snapshots rates via `CurrencyService.snapshotRatesForPayout()` | `PayoutManagement.tsx` | **Implemented** |
| Rate staleness check | `currencyConversionRates.lastUpdated` | `GET /api/admin/currency/rates` | `CurrencyService.checkRateStaleness()` | `ExchangeRateFreshness.tsx` | **Implemented** |
| Manual rate override (SuperAdmin) | `currencyConversionRates` (source = "manual", updatedBy) | `PUT /api/admin/currency/rates/:currency/override`, `POST /api/admin/currency-rates/override` | `CurrencyService.manualOverride()` | `CurrencyManagement.tsx` | **Implemented** |
| Rate history | `currencyConversionRates` (historical records) | `GET /api/admin/currency/history` | `CurrencyService.getRateHistory()` | `CurrencyManagement.tsx` | **Implemented** |

---

### 3.5 Slide 5 — Secure Payment Processing (YOCO Integration)

**Requirement:** YOCO integrated checkout — secure checkout, payment methods (credit cards, YOCO), transaction protection, instant confirmation, receipt generation via email, failed payment handling, compliance standards.

| Feature | DB Tables | API Endpoints | Services/Logic | Frontend Components | Status |
|---------|-----------|---------------|----------------|---------------------|--------|
| YOCO checkout session creation | `paymentIntents` (intentType = "course", checkoutId, status, metadata JSONB) | `POST /api/payments/create-checkout` (auth required) | `PaymentOrchestratorService.createCourseCheckout()`, `PaymentService.createYocoCheckout()` | `CoursePurchase.tsx`, `PurchaseConfirmationModal.tsx` | **Implemented** |
| Payment intent tracking | `paymentIntents` (intentId, intentType, checkoutId, status, metadata) | `GET /api/payment-intents/:intentId/confirmation` | `PaymentOrchestratorService.getPaymentIntentByCheckoutId()` | `CoursePurchaseSuccess.tsx` | **Implemented** |
| Successful payment webhook | `coursePurchases` (status = "completed"), `userCourseEnrollments` (created), `paymentFulfillments` | `POST /api/webhooks/yoco` (signature verified) | `PaymentRouter.handleCoursePayment()`, `PurchaseService.createPurchase()`, `PurchaseService.grantAccess()` | N/A (server-side) | **Implemented** |
| Failed payment handling | `paymentIntents` (status = "failed"/"cancelled"), `coursePurchases` (status = "failed") | `POST /api/webhooks/yoco` (failure event) | `PaymentRouter.handleWebhook()` — updates status | `CoursePurchase.tsx` (error state) | **Implemented** |
| Payment verification | `paymentIntents`, `coursePurchases` | `GET /api/payments/verify/:checkoutId` | `PaymentService.verifyYocoPayment()` | `CoursePurchaseSuccess.tsx` | **Implemented** |
| Receipt PDF generation | `coursePurchases.receiptPdfPath` (Object Storage path) | Triggered via webhook fulfillment | `PaymentRouter` — generates PDF, stores in Object Storage | `InvoiceHistory.tsx`, `PurchaseHistory.tsx` | **Implemented** |
| Purchase receipt email to buyer | N/A (email delivery) | Triggered via webhook fulfillment | `NotificationService.sendPurchaseReceiptEmail()` — HTML email with receipt | N/A (email-based) | **Implemented** |
| Sales notification to org admins | N/A (email delivery) | Triggered via webhook fulfillment | `NotificationService.sendSalesNotificationToOrgAdmins()` — alert to creator org | N/A (email-based) | **Implemented** |
| Webhook deduplication | `paymentFulfillments` (unique checkoutId constraint) | `POST /api/webhooks/yoco` | `WebhookDeduplicationService`, `WebhookReplayProtection` | N/A (server-side) | **Implemented** |
| Webhook signature verification | N/A | `POST /api/webhooks/yoco` | `yocoWebhookVerifier.ts` — HMAC signature verification | N/A (server-side) | **Implemented** |
| One purchase per user per course | `coursePurchases` unique constraint: UNQ_user_course_purchase | `POST /api/payments/create-checkout` (pre-check) | `PurchaseService.hasPurchased()` — boolean check before checkout | `CourseDetail.tsx` (shows "Already Purchased" state) | **Implemented** |
| Payment system status | `platformPaymentSettings` | `GET /api/payments/status`, `GET /api/payments/yoco-mode` | `PaymentService.getSetupStatus()`, `PaymentService.getYocoMode()` | `SuperAdminPaymentModeModal.tsx` | **Implemented** |
| PayFast integration | — | — | — | — | **NOT IMPLEMENTED** — Only YOCO is integrated |
| Google Pay / Apple Pay | — | — | — | — | **NOT IMPLEMENTED** — Only YOCO credit card processing |

---

### 3.6 Slide 6 — Course Reviews & Ratings (Social Proof)

**Requirement:** Social proof system — star ratings (0.5–5.0 half-star), written reviews, verified purchases only, aggregate visibility, review volume, recent reviews, seller feedback, quality incentive.

| Feature | DB Tables | API Endpoints | Services/Logic | Frontend Components | Status |
|---------|-----------|---------------|----------------|---------------------|--------|
| Submit star rating (0.5–5.0) | `courseReviews.rating` decimal(3,1) — 0.5 to 5.0 in half-star increments | `POST /api/courses/:courseId/reviews` (auth required) | `ReviewService.createReview()` | `CourseRating.tsx` | **Implemented** |
| Written review with comment | `courseReviews.comment` (required if rating < 4.5) | `POST /api/courses/:courseId/reviews` (body: comment) | `ReviewService.createReview()` — validates comment requirement | `CourseRating.tsx` | **Implemented** |
| Verified purchase check | `coursePurchases` (userId + courseId must exist with status = "completed") | `POST /api/courses/:courseId/reviews` (internal check) | `ReviewService.createReview()` — verified purchase validation | `CourseRating.tsx` (disabled if not purchased) | **Implemented** |
| One review per user per course | `courseReviews` unique constraint: UNQ_user_course_review | `POST /api/courses/:courseId/reviews` | `ReviewService.createReview()` — checks for existing review | `CourseRating.tsx` (shows existing review if present) | **Implemented** |
| Aggregate rating on course | `courses.averageRating` decimal(3,2), `courses.totalRatings` integer | Updated internally after review submission | `ReviewService.updateCourseRating()` — recalculates average and count | `CourseDetail.tsx`, `BrowseCourses.tsx` (star display) | **Implemented** |
| Rating distribution breakdown | `courseReviews` (aggregated by rating value) | `GET /api/courses/:courseId/reviews` | `ReviewService.getRatingDistribution()` | `CourseDetail.tsx` (distribution bars) | **Implemented** |
| Paginated review listing | `courseReviews` (ordered by createdAt DESC) | `GET /api/courses/:courseId/reviews` (query: limit, offset — no auth required) | `ReviewService.getCourseReviews()` | `CourseDetail.tsx` (review list) | **Implemented** |
| Review moderation (admin hide/show) | `courseReviews.isVisible`, `courseReviews.moderatedBy`, `courseReviews.moderatedAt` | Admin moderation endpoint | `ReviewService.moderateReview()` | Admin interface | **Implemented** |
| Review eligibility (all lessons completed) | `userCourseLessonProgress`, `courseLessons` | `POST /api/courses/:courseId/reviews` (internal check) | `ReviewService.checkAllLessonsCompleted()` — verifies all course lessons are completed | `CourseRating.tsx` | **Implemented** |
| Reviewer display name | `courseReviews.displayName`, `courseReviews.reviewerDisplayName`, `courseReviews.useRealName` | `POST /api/courses/:courseId/reviews` | `ReviewService.createReview()` | `CourseRating.tsx` | **Implemented** |

---

### 3.7 Slide 7 — Purchaser Access Protection (Permanent Access)

**Requirement:** "Buyers Keep Access Regardless of Status Changes" — purchase protection, status independence (inactive/archived/draft), visibility changes don't affect buyers, version access (latest version automatically), permanent library, organizational purchases.

| Feature | DB Tables | API Endpoints | Services/Logic | Frontend Components | Status |
|---------|-----------|---------------|----------------|---------------------|--------|
| Access retained when course set to inactive | `userCourseEnrollments` (persists regardless of `courses.status`), `coursePurchases` (status = "completed") | `GET /api/my-public-courses` (returns purchases regardless of course status) | `PurchaseService.getUserPurchases()` — does NOT filter by course status | `MyCourses.tsx` | **Implemented** |
| Access retained when course archived | `userCourseEnrollments` (persists), `courses.status` = "archived" | `GET /api/my-public-courses` | `PurchaseService` — enrollment record independent of course status | `MyCourses.tsx` | **Implemented** |
| Access retained on visibility change (public → org_only) | `userCourseEnrollments` (persists), `courses.visibility` changed | `GET /api/my-public-courses` | `PurchaseService` — enrollment checked, not visibility | `MyCourses.tsx` | **Implemented** |
| Automatic version upgrade for purchasers | `userCourseEnrollments.hasNewerVersion`, `userCourseEnrollments.latestVersionId` | `POST /api/courses/:id/upgrade` | `PurchaseService.purchaseUpgrade()`, `VersionService` | `MyCourses.tsx` (upgrade prompt) | **Implemented** |
| Permanent library (my-public-courses) | `coursePurchases` JOIN `courses` | `GET /api/my-public-courses` | Route handler — returns all purchased public courses for user | `MyCourses.tsx` (purchased courses tab) | **Implemented** |
| Purchase grants enrollment record | `userCourseEnrollments` (userId, courseId, courseVersionId, enrolledAt) | Triggered via purchase fulfillment | `PurchaseService.grantAccess()` — creates enrollment row | N/A (server-side) | **Implemented** |
| One purchase per user per course | `coursePurchases` unique constraint: UNQ_user_course_purchase | `POST /api/payments/create-checkout` (pre-check) | `PurchaseService.hasPurchased()` | `CourseDetail.tsx` | **Implemented** |

---

### 3.8 Slide 8 — Sales Dashboard (Revenue Overview)

**Requirement:** Revenue overview, per-course breakdown, transaction history, time period analysis, conversion insights, performance comparisons.

| Feature | DB Tables | API Endpoints | Services/Logic | Frontend Components | Status |
|---------|-----------|---------------|----------------|---------------------|--------|
| Revenue summary (total, commission, net, sales count) | `coursePurchases` (aggregated by organizationId via courses) | `GET /api/org-sales/revenue-summary` (OrgAdmin+, date range filter) | `RevenueTrackingService.getOrganizationRevenue()` — returns totalRevenue, platformCommission, netProfit, salesCount | `OrgSalesDashboard.tsx` | **Implemented** |
| Per-course revenue breakdown | `coursePurchases` grouped by courseId | `GET /api/org-sales/course-breakdown` (OrgAdmin+) | `RevenueTrackingService.getCourseRevenueBreakdown()` — per-course: salesCount, revenue, commission, averageRating | `OrgSalesDashboard.tsx` | **Implemented** |
| Monthly revenue trends | `coursePurchases` grouped by month | `GET /api/org-sales/monthly-trends` (OrgAdmin+, months param 1–36) | `RevenueTrackingService.getMonthlyTrends()` — monthly: revenue, salesCount, commission, netProfit | `OrgSalesDashboard.tsx`, `OrgRevenueDashboard.tsx` | **Implemented** |
| Time period filtering (startDate/endDate) | `coursePurchases` (filtered by purchasedAt range) | `GET /api/org-sales/revenue-summary` (query: startDate, endDate) | `RevenueTrackingService.getOrganizationRevenue()` — accepts date range | `OrgSalesDashboard.tsx` (date picker) | **Implemented** |
| OrgAdmin RBAC access | `userOrganizationRoles` (role check) | All `/api/org-sales/*` endpoints | `requireOrgAdminAccess` middleware — validates OrgAdmin/SuperAdmin role | N/A (middleware) | **Implemented** |
| Conversion insights (views → purchases) | — | — | — | — | **NOT IMPLEMENTED** — No view tracking or conversion analytics exist |

---

### 3.9 Slide 9 — Monthly Payouts (Payout Processing)

**Requirement:** Payout processing, monthly cycles, transparent calculation, payout history, banking integration, status visibility, issue resolution.

| Feature | DB Tables | API Endpoints | Services/Logic | Frontend Components | Status |
|---------|-----------|---------------|----------------|---------------------|--------|
| Monthly payout calculation | `coursePayouts` (organizationId, periodStart, periodEnd, grossRevenue, platformCommission, netAmount) | Triggered via admin action | `PayoutService.calculateMonthlyPayouts()` — iterates e-learning orgs, calculates per-period | `PayoutManagement.tsx` | **Implemented** |
| Payout record with FX snapshot | `coursePayouts.exchangeRateSnapshot` (JSONB, immutable) | `GET /api/admin/payouts` | `PayoutService` — snapshots via `CurrencyService.snapshotRatesForPayout()` | `PayoutManagement.tsx` | **Implemented** |
| Per-course payout line items | `coursePayoutLineItems` (payoutId, courseId, salesCount, grossRevenue, platformCommission, netAmount) | `GET /api/admin/payouts/:id/breakdown` | `PayoutProcessorService.getPayoutBatchDetails()` | `PayoutManagement.tsx` (breakdown view) | **Implemented** |
| Payout batch processing | `payoutBatches` (batchDate, periodStart, periodEnd, status, totalPayouts, totalAmount) | Admin batch creation | `PayoutProcessorService.createPayoutBatch()` | `PayoutManagement.tsx` | **Implemented** |
| Mark payout as paid (SuperAdmin) | `coursePayouts.status` → "paid", `coursePayouts.paidAt`, `coursePayouts.paymentReference` | `POST /api/admin/payouts/:id/mark-paid` | `PayoutProcessorService.markAsPaid()` — logs to `financialAuditLog` | `PayoutManagement.tsx` | **Implemented** |
| Payout invoice PDF generation | Generated PDF document | `GET /api/admin/payouts/:id/invoice` | `PayoutProcessorService.generatePayoutInvoice()` — PDFKit generation | `PayoutManagement.tsx` (download button) | **Implemented** |
| Payout history listing | `coursePayouts` (ordered by periodEnd DESC) | `GET /api/admin/payouts` (filterable by currency, status, org) | `PayoutProcessorService.getPayoutBatches()` | `PayoutManagement.tsx` | **Implemented** |
| Banking details configuration | `organizationBankingDetails` (bankName, accountHolderName, accountNumber ENCRYPTED, branchCode, swiftCode) | Banking details management endpoints | N/A (stored encrypted) | `PayoutManagement.tsx` | **Implemented** |
| Payout status tracking | `coursePayouts.status` payoutStatusEnum (pending/paid/cancelled) | `GET /api/admin/payouts` | `PayoutProcessorService` | `PayoutManagement.tsx` (status badges) | **Implemented** |
| Cancel payout batch | `coursePayouts.status` → "cancelled" | Admin action | `PayoutProcessorService.cancelPayoutBatch()` | `PayoutManagement.tsx` | **Implemented** |

---

### 3.10 Slide 10 — Revenue Analytics (Comprehensive Reporting)

**Requirement:** Comprehensive reporting, trend analysis, course lifecycle, market insights, pricing analysis, opportunity identification, export capabilities.

| Feature | DB Tables | API Endpoints | Services/Logic | Frontend Components | Status |
|---------|-----------|---------------|----------------|---------------------|--------|
| Platform revenue overview (SuperAdmin) | `coursePurchases`, `platformRevenueSources` | `GET /api/platform-revenue/overview` (SuperAdmin only) | `PlatformRevenueIngestionService` | `PlatformRevenueReports.tsx` | **Implemented** |
| Revenue streams breakdown | `platformRevenueSources` | `GET /api/platform-revenue/streams` (SuperAdmin) | `PlatformRevenueIngestionService` | `PlatformRevenueReports.tsx` | **Implemented** |
| Per-org analytics | `coursePurchases` grouped by organization | `GET /api/platform-revenue/org-analytics` (SuperAdmin) | `PlatformRevenueIngestionService` | `PlatformRevenueReports.tsx` | **Implemented** |
| Revenue snapshots generation | `platformFinancialSnapshots` (periodType, totalRevenue, data JSONB) | `POST /api/platform-revenue/snapshots/generate`, `GET /api/platform-revenue/snapshots` | `PlatformFinancialSnapshotService` | `PlatformRevenueReports.tsx` | **Implemented** |
| Financial audit log | `financialAuditLog` (eventType, entityType, entityId, userId, beforeState/afterState JSONB) | `GET /api/platform-revenue/audit-log` (SuperAdmin) | Logged on financial events (payout, rate changes) | `PlatformRevenueReports.tsx` | **Implemented** |
| Price history tracking | `coursePriceHistory` (courseId, oldPrice, newPrice, currency, changedAt, changedBy) | Triggered on price change | `RevenueTrackingService.recordPriceHistory()` | N/A (audit data) | **Implemented** |
| Platform costs management | `platformCostEntries`, `platformCostCategories` | `GET/POST/PATCH/DELETE /api/platform-revenue/costs` | `PlatformCostService` | `PlatformRevenueReports.tsx` | **Implemented** |
| Market insights / benchmarks | — | — | — | — | **NOT IMPLEMENTED** — No marketplace benchmarking data exists |
| Pricing analysis (price vs performance) | — | — | — | — | **NOT IMPLEMENTED** — No price-vs-performance correlation |
| Export capabilities (CSV/Excel) | — | — | — | — | **NOT IMPLEMENTED** — No export functionality for revenue data |

---

## 4. Phase 2: Master Test Documentation

This section contains granular, executable test cases organized by functional area. Each test case follows the STLC format with TC-ID, business context, pre-conditions, test steps, expected outcomes, and a testing result table.

---

### 4.1 Course Marketplace Browsing Tests (Slides 1–2)

---

#### TC-MARKET-001: Browse Public Course Catalog

**Feature:** Browse the public marketplace catalog showing all active courses with visibility = "public".

**Intended Use / Business Case:** A potential buyer visits the marketplace to explore available courses. They expect to see only courses that are published, active, and set to public visibility — not draft, inactive, archived, or organization-only courses.

**Pre-conditions:**
- At least one course exists with `status` = "active" and `visibility` = "public"
- At least one course exists with `status` = "draft" (should NOT appear)
- At least one course exists with `visibility` = "org_only" (should NOT appear)
- No authentication required

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Browse Courses page (`/browse-courses`) without logging in. |
| 2 | Observe the course catalog grid/list. |
| 3 | Verify that only courses with `status` = "active" and `visibility` = "public" are displayed. |
| 4 | Verify that draft, inactive, archived, or org_only courses are NOT shown. |
| 5 | Verify each course card displays: title, creator organization name, price with currency symbol, average rating (stars), and a thumbnail/placeholder image. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The marketplace catalog displays a grid of public active courses. Each card shows the course title, creator org name, price (e.g., "R199.99" or "$29.99"), star rating, and image. No internal or draft courses appear. Rate-limited to 100 requests per minute per IP. |
| **Database** | `GET /api/public/courses` queries `courses` table with `WHERE status = 'active' AND visibility = 'public'`. Composite index `IDX_courses_status_visibility` optimizes this query. Results include `price`, `currency`, `averageRating`, `totalRatings`, organization info. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-002: Search Courses by Title/Keyword

**Feature:** Search the marketplace catalog by course title or keyword to find specific courses.

**Intended Use / Business Case:** A buyer knows what topic they want to learn and uses the search bar to quickly find relevant courses rather than browsing the entire catalog.

**Pre-conditions:**
- Multiple public active courses exist with different titles and descriptions
- No authentication required

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Browse Courses page (`/browse-courses`). |
| 2 | Locate the search input field. |
| 3 | Enter a keyword that matches one course's title (e.g., "Banking Regulations"). |
| 4 | Verify the catalog filters to show only matching courses. |
| 5 | Clear the search input. |
| 6 | Enter a keyword that matches no courses (e.g., "xyznonexistent123"). |
| 7 | Verify the catalog shows an empty state with an appropriate "No courses found" message. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The search input filters the course catalog in real-time or on submit. Matching courses appear; non-matching courses are hidden. An empty search returns all courses. A search with no results shows a clear empty state message. |
| **Database** | `GET /api/public/courses?search=keyword` applies ILIKE search on `courses.title` and `courses.description`. Only results with `status` = "active" AND `visibility` = "public" are returned. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-003: View Course Detail Page (Public)

**Feature:** View the full detail page of a public marketplace course, including description, objectives, curriculum, pricing, and creator information.

**Intended Use / Business Case:** A buyer clicks on a course card to view the full course detail before making a purchase decision. They expect to see comprehensive information including what the course covers, its price, who created it, and ratings from other buyers.

**Pre-conditions:**
- A public active course exists with at least 3 lessons, a description, objectives, and at least one review
- No authentication required for viewing

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Browse Courses page. |
| 2 | Click on a course card to open the course detail page (`/courses/:courseId`). |
| 3 | Verify the course title, description, and learning objectives are displayed. |
| 4 | Verify the curriculum section shows a list of lessons with titles. |
| 5 | Verify the price is displayed with the correct currency symbol (e.g., "R199.99", "$29.99", "€24.99"). |
| 6 | Verify the average star rating and total number of ratings are shown. |
| 7 | Verify the creator organization name is displayed. |
| 8 | Verify a "Purchase" or "Buy Now" call-to-action button is visible. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The course detail page shows: title, description, objectives, curriculum (lesson list), price with currency, average rating (star display), total ratings count, creator org name, and a purchase CTA button. The demo lesson (if available) is accessible via a "Preview" or "Try Demo" button. |
| **Database** | `GET /api/public/courses/:courseId` returns the full course object including `price`, `currency`, `averageRating`, `totalRatings`, `description`, organization info, and lesson list (titles only, not full content). |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-004: Access Demo/Overview Lesson (Pre-Purchase)

**Feature:** Access a demo or overview lesson for a course before purchasing, allowing potential buyers to preview content quality.

**Intended Use / Business Case:** A buyer is considering a purchase but wants to preview the quality of content before committing. The demo lesson gives them a taste of the course material without requiring payment.

**Pre-conditions:**
- A public active course exists with at least one lesson marked as the demo/overview lesson
- No authentication required

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the course detail page for a public course. |
| 2 | Locate the demo lesson indicator or "Preview" button. |
| 3 | Click to access the demo lesson. |
| 4 | Verify the demo lesson viewer opens and displays the lesson content (PPTX slides). |
| 5 | Verify that other (non-demo) lessons are NOT accessible without a purchase. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The demo lesson opens in `DemoLessonViewer.tsx`, displaying the lesson's PPTX slides with navigation controls. Non-demo lessons are locked with a "Purchase to Access" indicator. No authentication is required to view the demo. |
| **Database** | `GET /api/courses/:id/demo-lesson` returns the overview/demo lesson data (no auth middleware). `GET /api/courses/:courseId/lessons/:lessonId/demo` returns the demo lesson content. The `lessons.isOverview` field identifies the demo lesson. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-005: Popular Courses Listing

**Feature:** View a curated list of popular courses on the marketplace, sorted by ratings and engagement.

**Intended Use / Business Case:** New visitors to the marketplace want to discover the most popular and highest-rated courses as a starting point for their learning journey.

**Pre-conditions:**
- Multiple public active courses exist with varying ratings and review counts

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Browse Courses page or landing page. |
| 2 | Locate the "Popular Courses" section. |
| 3 | Verify popular courses are displayed with ratings and review counts. |
| 4 | Verify courses are ordered by popularity (rating + review count). |
| 5 | Verify only public active courses appear in the popular list. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | A "Popular Courses" section displays top-rated courses with their star ratings and review counts. Courses are sorted by a combination of `averageRating` and `totalRatings`. |
| **Database** | `GET /api/public/popular-courses` queries `courses` with `status` = "active" AND `visibility` = "public", ordered by `totalRatings` DESC and `averageRating` DESC. `ShowcaseCourseService` provides the curated list. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-006: Pricing Display with Currency Symbol

**Feature:** Verify that course prices are displayed with the correct currency symbol based on the course's pricing currency.

**Intended Use / Business Case:** Buyers from different regions need to clearly understand the price and currency of a course. Correct currency symbol display prevents confusion and builds trust.

**Pre-conditions:**
- Three public courses exist with different currencies: ZAR, USD, EUR

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Browse Courses page. |
| 2 | Locate the ZAR-priced course. Verify the price displays with "R" prefix (e.g., "R199.99"). |
| 3 | Locate the USD-priced course. Verify the price displays with "$" prefix (e.g., "$29.99"). |
| 4 | Locate the EUR-priced course. Verify the price displays with "€" prefix (e.g., "€24.99"). |
| 5 | Click into each course detail page and verify the same currency formatting. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | ZAR courses show "R" prefix, USD courses show "$" prefix, EUR courses show "€" prefix. The `CurrencyIndicatorBadge.tsx` component consistently formats currency display across catalog and detail pages. |
| **Database** | `courses.currency` enum field stores "ZAR", "USD", or "EUR". Frontend `currency.ts` library maps enum values to display symbols. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-007: Instant Access After Purchase

**Feature:** Verify that a buyer receives immediate access to course content after completing a successful purchase.

**Intended Use / Business Case:** A buyer completes payment and expects to start learning immediately. The system must create an enrollment record and grant access without delay.

**Pre-conditions:**
- User is logged in as a buyer (learner)
- A public active course exists that the user has NOT purchased
- YOCO test mode is configured

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the course detail page and click "Buy Now". |
| 2 | Complete the YOCO checkout process (using test card credentials). |
| 3 | Verify redirection to the purchase success page (`/course-purchase-success`). |
| 4 | Navigate to My Courses (`/my-courses`) or My Public Courses. |
| 5 | Verify the purchased course now appears in the user's course library. |
| 6 | Click on the purchased course and verify all lessons are now accessible. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | After successful payment, the user is redirected to `CoursePurchaseSuccess.tsx` with a confirmation message. The course appears in `MyCourses.tsx` under the purchased courses section. All lessons are unlocked and accessible. |
| **Database** | `coursePurchases` has a new row with `status` = "completed", `userId` = buyer, `courseId` = purchased course, `purchasedAt` = current timestamp. `userCourseEnrollments` has a new row with `userId`, `courseId`, `courseVersionId`, `enrolledAt`. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-008: Rate Limiting on Public Endpoints

**Feature:** Verify that public marketplace endpoints enforce rate limiting to prevent abuse.

**Intended Use / Business Case:** The public endpoints are accessible without authentication, making them vulnerable to abuse. Rate limiting protects the platform from excessive requests.

**Pre-conditions:**
- No authentication required
- Access to the public courses endpoint

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Send 100 rapid requests to `GET /api/public/courses` from the same IP. |
| 2 | Verify all 100 requests succeed (within the 100/minute window). |
| 3 | Send an additional request (101st). |
| 4 | Verify the 101st request receives a 429 (Too Many Requests) response with a `retryAfter` value. |
| 5 | Wait for the rate limit window to reset (1 minute). |
| 6 | Verify requests succeed again after the reset. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | N/A — API-level test. The frontend gracefully handles 429 responses with a user-friendly message. |
| **Database** | In-memory `ipRateLimitStore` tracks request counts per IP. `PUBLIC_RATE_LIMIT_MAX` = 100, `PUBLIC_RATE_LIMIT_WINDOW_MS` = 60000 (1 minute). `checkPublicRateLimit()` returns `{ allowed: false, retryAfter: seconds }` when exceeded. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-009: Org-Only Course Excluded from Marketplace

**Feature:** Verify that courses with `visibility` = "org_only" do NOT appear in the public marketplace catalog.

**Intended Use / Business Case:** Organizations using internal training (education/business orgs) set courses to "org_only". These internal courses must never be visible to external buyers on the public marketplace.

**Pre-conditions:**
- A course exists with `status` = "active" and `visibility` = "org_only"
- No authentication required

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Browse Courses page. |
| 2 | Search for the org_only course by its exact title. |
| 3 | Verify the course does NOT appear in search results. |
| 4 | Attempt to access the course directly via URL (`/courses/:courseId` with the org_only course ID). |
| 5 | Verify the course is either not accessible or shows an appropriate "not available" message. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The org_only course does not appear in the marketplace browse page, search results, or popular courses list. Direct URL access either returns a 404/403 or shows a "course not available" message. |
| **Database** | `GET /api/public/courses` query filters `WHERE visibility = 'public'`, excluding all "org_only" courses. The org_only course exists in `courses` table but is filtered out at the query level. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-010: Draft/Inactive/Archived Courses Excluded from Marketplace

**Feature:** Verify that courses with `status` of "draft", "inactive", or "archived" do NOT appear in the public marketplace.

**Intended Use / Business Case:** Only active courses should be purchasable. Draft courses are still being created, inactive courses are temporarily disabled, and archived courses are no longer current.

**Pre-conditions:**
- Courses exist with each status: draft, inactive, archived (all with `visibility` = "public")

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Browse Courses page. |
| 2 | Verify that no draft courses appear in the catalog. |
| 3 | Verify that no inactive courses appear in the catalog. |
| 4 | Verify that no archived courses appear in the catalog. |
| 5 | Only "active" status courses with "public" visibility are shown. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The marketplace catalog shows only active courses. Draft, inactive, and archived courses are completely hidden from the public browsing experience. |
| **Database** | `GET /api/public/courses` applies `WHERE status = 'active' AND visibility = 'public'`. Composite index `IDX_courses_status_visibility` optimizes this query. Courses with status "draft", "inactive", or "archived" are excluded regardless of visibility setting. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

### 4.2 Course Publishing & Selling Tests (Slide 3)

---

#### TC-MARKET-011: Set Course Visibility to Public for Marketplace

**Feature:** Set a course's visibility to "public" to make it available on the marketplace for external buyers.

**Intended Use / Business Case:** An e-learning organization has created a course and wants to monetize it by making it available on the public marketplace. Setting visibility to "public" is the key step to list it for external sales.

**Pre-conditions:**
- User is logged in as OrgAdmin or Teacher for an e-learning type organization
- An active course exists with `visibility` = "org_only"
- The course has at least one lesson with PPTX content

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Course Edit page (`/courses/:id/edit`). |
| 2 | Locate the visibility setting (toggle or dropdown). |
| 3 | Change visibility from "Organization Only" to "Public (Marketplace)". |
| 4 | Save the changes. |
| 5 | Navigate to the Browse Courses page (logged out or as a different user). |
| 6 | Verify the course now appears in the public marketplace catalog. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The visibility toggle/dropdown updates to "Public". A success toast confirms the change. The course appears in the marketplace browse page. |
| **Database** | `courses.visibility` updated from "org_only" to "public" via `PATCH /api/courses/:id`. `CourseVisibilityService` handles the update. The course is now returned by `GET /api/public/courses`. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-012: Set Course Price

**Feature:** Set a monetary price on a course to enable paid sales on the marketplace.

**Intended Use / Business Case:** A course creator determines the value of their course and sets a price. The price must support high precision (decimal 19,4) to accommodate various currencies and pricing strategies.

**Pre-conditions:**
- User is logged in as OrgAdmin or Teacher
- An active public course exists
- User is on the Course Edit page

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Course Edit page. |
| 2 | Locate the price input field. |
| 3 | Enter a valid price (e.g., "199.99"). |
| 4 | Save the changes. |
| 5 | Verify the price is displayed on the course detail page with the correct format. |
| 6 | Change the price to a different value (e.g., "249.50"). |
| 7 | Verify the price change is reflected and a price history record is created. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The price input accepts decimal values. After saving, the updated price displays on the course detail page and browse catalog. A success toast confirms the update. |
| **Database** | `courses.price` updated to the new decimal(19,4) value. `coursePriceHistory` has a new row with `courseId`, `oldPrice`, `newPrice`, `currency`, `changedAt`, `changedBy`. `RevenueTrackingService.recordPriceHistory()` is invoked on price change. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-013: Select Pricing Currency (ZAR/USD/EUR)

**Feature:** Select the pricing currency for a course from the three supported currencies: ZAR, USD, EUR.

**Intended Use / Business Case:** Course creators in different regions want to price their courses in their local currency. A South African creator uses ZAR, a European creator uses EUR, and a US-based creator uses USD.

**Pre-conditions:**
- User is logged in as OrgAdmin or Teacher
- An active public course exists
- User is on the Course Edit page

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Course Edit page. |
| 2 | Locate the currency selection dropdown. |
| 3 | Verify the dropdown shows three options: ZAR, USD, EUR. |
| 4 | Select "USD" as the currency. |
| 5 | Set a price (e.g., "29.99"). |
| 6 | Save the changes. |
| 7 | Navigate to the course detail page and verify the price shows with "$" symbol. |
| 8 | Repeat for EUR and verify "€" symbol. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The currency dropdown shows ZAR, USD, EUR options. After selecting a currency and saving, the course detail page shows the price with the correct symbol: "R" for ZAR, "$" for USD, "€" for EUR. |
| **Database** | `courses.currency` updated to the selected `currencyCodeEnum` value ("ZAR", "USD", or "EUR"). The `price` field stores the amount in the chosen currency. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-014: Course Listing on Marketplace After Publish

**Feature:** Verify that a newly created course appears on the marketplace immediately after being set to active status with public visibility.

**Intended Use / Business Case:** A course creator finishes content, sets the course to active and public, and expects it to be immediately purchasable by buyers worldwide.

**Pre-conditions:**
- User is logged in as OrgAdmin or Teacher
- A course exists with `status` = "draft", `visibility` = "public", price set

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Course Edit page for the draft course. |
| 2 | Complete all publish validation requirements (lessons, PPTX content, quizzes). |
| 3 | Publish the course (set `status` to "active"). |
| 4 | Open a new browser session (or log out). |
| 5 | Navigate to the Browse Courses page. |
| 6 | Verify the newly published course appears in the catalog with correct pricing. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The course transitions from draft to active. It immediately appears in the public marketplace browse page with title, price, and rating. No cache delay prevents immediate visibility. |
| **Database** | `courses.status` = "active", `courses.visibility` = "public". `CourseService.validateCourseForPublish()` passes all checks. The course is returned by `GET /api/public/courses`. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-015: Organization Branding on Course Cards

**Feature:** Verify that course cards on the marketplace display the creator organization's branding (name and/or logo).

**Intended Use / Business Case:** Course creators want brand exposure. Buyers want to know who created the course for trust and credibility purposes.

**Pre-conditions:**
- A public active course exists belonging to an e-learning organization with a name and logo

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Browse Courses page. |
| 2 | Locate a public course card. |
| 3 | Verify the creator organization's name is displayed on the course card. |
| 4 | Click into the course detail page. |
| 5 | Verify the creator organization's name and/or logo is displayed prominently. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Course cards display the creator organization name. The course detail page shows the organization name and logo (if configured). `BrowseCourses.tsx` and `CourseDetail.tsx` render org branding. |
| **Database** | `GET /api/public/courses` returns `courses.organizationId` joined with `organizations.name` and logo information. The org data is enriched in the API response. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-016: Content Ownership Preserved After Purchase

**Feature:** Verify that purchasing a course does NOT transfer content ownership — the creator organization retains full ownership.

**Intended Use / Business Case:** Course creators need assurance that selling their courses does not give up control. The purchase grants ACCESS, not ownership. The creator can still edit, update, or unpublish the course.

**Pre-conditions:**
- A buyer has purchased a course from a creator organization
- Both buyer and creator are logged in

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as the buyer. Verify access to the purchased course content. |
| 2 | Log in as the creator (OrgAdmin). Navigate to the Course Edit page. |
| 3 | Verify the creator can still edit the course title, description, and price. |
| 4 | Verify the course still belongs to the creator's organization (`organizationId` unchanged). |
| 5 | Verify the creator can change the course visibility or status without losing the purchase record. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The creator retains full editing capabilities on the course. The buyer has read-only access to the content. No "transfer ownership" functionality exists. |
| **Database** | `courses.organizationId` remains the creator's org ID. `coursePurchases` records the buyer's purchase separately. `PATCH /api/courses/:id` is accessible only by the course owner's org. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

### 4.3 Multi-Currency Support Tests (Slide 4)

---

#### TC-MARKET-017: Three-Currency Support (ZAR/EUR/USD)

**Feature:** Verify that the platform supports exactly three currencies: ZAR (South African Rand), EUR (Euro), and USD (US Dollar) across all marketplace operations.

**Intended Use / Business Case:** The platform targets a global audience with a focus on South Africa and international markets. All three currencies must be supported for pricing, purchasing, and payouts.

**Pre-conditions:**
- Currency conversion rates exist in the database for all three currency pairs

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Verify courses can be priced in ZAR by creating/editing a course with currency = "ZAR". |
| 2 | Verify courses can be priced in USD by setting currency = "USD". |
| 3 | Verify courses can be priced in EUR by setting currency = "EUR". |
| 4 | Verify no other currencies are available in the dropdown (only ZAR, USD, EUR). |
| 5 | Check the `currencyConversionRates` table for active rates between all pairs. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Currency selection dropdowns show exactly three options: ZAR, USD, EUR. No other currencies are available. All marketplace components respect the three-currency model. |
| **Database** | `currencyCodeEnum` defines exactly three values: "ZAR", "USD", "EUR". `CurrencyService.SUPPORTED_CURRENCIES` constant contains these three values. `currencyConversionRates` has active rates for all six directional pairs (USD→ZAR, ZAR→USD, EUR→ZAR, ZAR→EUR, USD→EUR, EUR→USD). |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-018: Automatic Currency Conversion at Checkout

**Feature:** Verify that when a buyer purchases a course priced in a different currency, the system automatically converts the amount using current exchange rates.

**Intended Use / Business Case:** A buyer in South Africa wants to purchase a course priced in USD. The system converts $29.99 to ZAR at the current exchange rate for the YOCO payment (which only supports ZAR natively).

**Pre-conditions:**
- User is logged in as a buyer
- A course is priced in USD (e.g., $29.99)
- Active exchange rates exist (USD→ZAR)
- YOCO test mode configured

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the course detail page for a USD-priced course. |
| 2 | Click "Buy Now" to initiate checkout. |
| 3 | Verify the checkout confirmation shows the original price in USD AND the converted amount in ZAR. |
| 4 | Verify the exchange rate used is displayed. |
| 5 | Complete the checkout process. |
| 6 | Verify the purchase record stores both the original and converted amounts. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `CheckoutConversionConfirmation.tsx` displays: original price (e.g., "$29.99 USD"), converted price (e.g., "R554.82 ZAR"), and the exchange rate used (e.g., "1 USD = 18.50 ZAR"). The buyer sees both amounts before confirming. |
| **Database** | `coursePurchases` stores: `baseCurrency` = "USD", `basePrice` = "29.99", `purchaseCurrency` = "ZAR" (YOCO native), `purchasePrice` = converted ZAR amount, `exchangeRateUsed` = snapshot rate. `paymentIntents.metadata` includes `originalAmount`, `originalCurrency`, `exchangeRate`. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-019: Hourly Exchange Rate Auto-Update

**Feature:** Verify that exchange rates are automatically updated on an hourly basis from external API sources.

**Intended Use / Business Case:** Currency exchange rates fluctuate throughout the day. Hourly updates ensure prices are reasonably current without excessive API calls.

**Pre-conditions:**
- SuperAdmin is logged in
- Access to currency management page
- Exchange rate API is accessible

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Currency Management page (SuperAdmin). |
| 2 | Note the current exchange rates and their `lastUpdated` timestamps. |
| 3 | Trigger a manual rate refresh via `POST /api/admin/currency-rates/refresh`. |
| 4 | Verify the rates update with new values from the external API. |
| 5 | Verify the `lastUpdated` timestamp is updated to the current time. |
| 6 | Verify the `source` field is set to "auto" for automatic updates. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The Currency Management page (`CurrencyManagement.tsx`) shows current rates with timestamps. After refresh, rates update with new timestamps. `ExchangeRateFreshness.tsx` shows the freshness indicator. |
| **Database** | `currencyConversionRates` rows updated with new `rate` values, `lastUpdated` = current timestamp, `source` = "auto". `CurrencyService.fetchLatestRates()` calls the primary API (exchangerate-api.com) with fallback to fawazahmed0. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-020: Locked Purchase Rate at Checkout

**Feature:** Verify that the exchange rate is locked at the moment of checkout creation, preventing rate changes during the payment process.

**Intended Use / Business Case:** A buyer starts checkout at a specific exchange rate. If rates change while they are entering payment details, the original rate must be honored to prevent surprise charges.

**Pre-conditions:**
- A course is priced in a foreign currency (e.g., USD for a ZAR buyer)
- YOCO test mode is configured

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Note the current USD→ZAR exchange rate. |
| 2 | Initiate a checkout for a USD-priced course. |
| 3 | Verify the checkout session is created with a locked exchange rate. |
| 4 | Even if the exchange rate changes externally before payment completion, the locked rate is used for the purchase. |
| 5 | Complete the purchase and verify the purchase record uses the locked rate. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The checkout confirmation shows the locked exchange rate. This rate remains fixed throughout the payment process regardless of real-time rate fluctuations. |
| **Database** | `paymentIntents.metadata.exchangeRate` stores the locked rate. `paymentIntents.metadata.rateSource` = "locked" or "fresh". `coursePurchases.exchangeRateUsed` decimal(19,8) contains the exact rate used at checkout time. The rate is snapshotted by `PaymentOrchestratorService.createCourseCheckout()`. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-021: Buyer Currency Display Preferences

**Feature:** Verify that buyers can set their preferred display currency to see prices in their familiar currency.

**Intended Use / Business Case:** A European buyer browsing the marketplace wants to see all prices in EUR, even for courses priced in ZAR or USD. The display preference converts prices visually without changing the actual checkout currency.

**Pre-conditions:**
- User is logged in
- Courses exist in multiple currencies
- Exchange rates are populated

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the marketplace browse page. |
| 2 | Open the currency preference modal. |
| 3 | Select "EUR" as the preferred display currency. |
| 4 | Verify that course prices on browse page now show EUR equivalents. |
| 5 | Switch preference to "USD" and verify prices update. |
| 6 | Verify that the actual checkout still uses the course's native currency for the transaction. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `CurrencyPreferenceModal.tsx` allows selecting a display currency. Course cards show prices converted to the preferred currency using `useCurrencyDisplay.ts` hook. The conversion is display-only; the actual purchase transaction uses the course's native currency. |
| **Database** | Currency preference is stored client-side via `useCurrencyPreference.ts`. `CurrencyConversionTooltip.tsx` shows both original and converted amounts. No database storage for display preference. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-022: Rate Staleness Detection

**Feature:** Verify that the system detects stale exchange rates and provides a visual warning when rates are outdated.

**Intended Use / Business Case:** If the external API fails and rates are not updated for several hours, the platform must warn administrators to prevent purchases at severely outdated rates.

**Pre-conditions:**
- SuperAdmin is logged in
- Exchange rates exist with `lastUpdated` timestamps

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Currency Management page. |
| 2 | View the rate freshness indicator (`ExchangeRateFreshness.tsx`). |
| 3 | Verify that recently updated rates show a "Fresh" or green indicator. |
| 4 | If rates are older than the staleness threshold, verify a "Stale" or warning indicator appears. |
| 5 | Trigger a refresh and verify the staleness warning clears. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `ExchangeRateFreshness.tsx` shows a color-coded indicator: green/fresh for recent rates, amber/warning for aging rates, red/stale for outdated rates. The timestamp of the last update is visible. |
| **Database** | `CurrencyService.checkRateStaleness()` compares `currencyConversionRates.lastUpdated` against the current time and the staleness threshold. Returns a staleness status. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-023: Manual Exchange Rate Override (SuperAdmin)

**Feature:** SuperAdmin can manually override an exchange rate, replacing the automatic rate with a custom value.

**Intended Use / Business Case:** In exceptional market conditions (e.g., flash crash, API outage returning incorrect rates), a SuperAdmin needs to manually set an accurate exchange rate to protect both buyers and sellers.

**Pre-conditions:**
- User is logged in as SuperAdmin
- Active exchange rates exist
- User is on the Currency Management page

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Currency Management page. |
| 2 | Locate the USD→ZAR rate and note the current automatic value. |
| 3 | Enter a manual override rate (e.g., "18.75"). |
| 4 | Submit the override. |
| 5 | Verify the rate updates to the manual value. |
| 6 | Verify the rate source changes from "auto" to "manual". |
| 7 | Verify the `updatedBy` field records the SuperAdmin's user ID. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The Currency Management page shows the overridden rate with a "Manual" badge. The previous automatic rate is replaced. The admin who set the override is recorded. |
| **Database** | `currencyConversionRates` row updated: `rate` = manual value, `source` = "manual", `updatedBy` = SuperAdmin's userId, `lastUpdated` = current timestamp. `CurrencyService.manualOverride()` handles the update. `PUT /api/admin/currency/rates/:currency/override` or `POST /api/admin/currency-rates/override` endpoint is used. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

### 4.4 Payment Processing Tests (Slide 5)

---

#### TC-MARKET-024: YOCO Checkout Session Creation

**Feature:** Create a YOCO checkout session for a course purchase, generating a payment URL for the buyer.

**Intended Use / Business Case:** A buyer decides to purchase a course and clicks "Buy Now". The system creates a YOCO checkout session with the correct amount, currency, and metadata, then redirects the buyer to the YOCO payment page.

**Pre-conditions:**
- User is logged in as a buyer
- A public active course with a price is available
- YOCO test mode is configured with valid keys
- User has NOT already purchased this course

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the course detail page. |
| 2 | Click "Buy Now" or "Purchase" button. |
| 3 | Verify the purchase confirmation modal (`PurchaseConfirmationModal.tsx`) displays course info and price. |
| 4 | Confirm the purchase. |
| 5 | Verify a YOCO checkout session is created via `POST /api/payments/create-checkout`. |
| 6 | Verify the response includes a `checkoutUrl` pointing to YOCO's payment page. |
| 7 | Verify a `paymentIntents` record is created in the database. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `PurchaseConfirmationModal.tsx` shows course name, price, currency, and conversion details (if applicable). On confirmation, the user is redirected to YOCO's hosted checkout page. |
| **Database** | `paymentIntents` new row: `intentType` = "course", `intentId` = courseId, `checkoutId` = YOCO checkout ID, `status` = "pending", `metadata` = JSONB with userId, originalAmount, originalCurrency, exchangeRate. `PaymentOrchestratorService.createCourseCheckout()` orchestrates the creation. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-025: Successful Payment Webhook Processing

**Feature:** Process a successful payment webhook from YOCO, creating purchase and enrollment records.

**Intended Use / Business Case:** After a buyer completes payment on YOCO's page, YOCO sends a webhook notification. The system must process this to fulfill the purchase — creating a purchase record, granting course access, and sending confirmation emails.

**Pre-conditions:**
- A pending payment intent exists for a course purchase
- YOCO webhook is configured with the correct secret for signature verification

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Simulate a successful YOCO webhook event (or complete a test payment). |
| 2 | Verify the webhook reaches `POST /api/webhooks/yoco`. |
| 3 | Verify webhook signature is validated via `yocoWebhookVerifier.ts`. |
| 4 | Verify a `coursePurchases` record is created with `status` = "completed". |
| 5 | Verify a `userCourseEnrollments` record is created for the buyer. |
| 6 | Verify a receipt PDF is generated and stored in Object Storage. |
| 7 | Verify a purchase receipt email is sent to the buyer. |
| 8 | Verify a sales notification email is sent to the creator org admins. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The buyer sees the purchase success page (`CoursePurchaseSuccess.tsx`). The course appears in their library. |
| **Database** | `coursePurchases`: new row with `status` = "completed", `purchasePrice`, `purchaseCurrency`, `exchangeRateUsed`, `commissionRate`, `commissionAmount`, `creatorEarnings`, `receiptPdfPath`. `userCourseEnrollments`: new row granting access. `paymentFulfillments`: deduplication record created. `PaymentRouter.handleCoursePayment()` orchestrates fulfillment. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-026: Failed Payment Handling

**Feature:** Handle a failed payment gracefully, updating the payment status and informing the buyer.

**Intended Use / Business Case:** A buyer's credit card is declined or the payment times out. The system must update the payment status to "failed" and provide a clear error message without creating a purchase or granting access.

**Pre-conditions:**
- A pending payment intent exists
- YOCO webhook is configured

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Simulate a failed YOCO payment (e.g., using a test card that triggers a decline). |
| 2 | Verify the YOCO failure webhook reaches the system. |
| 3 | Verify the `paymentIntents` status is updated to "failed" or "cancelled". |
| 4 | Verify NO `coursePurchases` record with `status` = "completed" is created. |
| 5 | Verify NO `userCourseEnrollments` record is created. |
| 6 | Verify the buyer sees an error message on the payment result page. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The buyer is redirected to the failure URL showing an error message (e.g., "Payment failed. Please try again."). The course remains unpurchased. `CoursePurchase.tsx` displays the error state. |
| **Database** | `paymentIntents.status` = "failed" or "cancelled". No `coursePurchases` row with `status` = "completed". No `userCourseEnrollments` row. `PaymentRouter` handles the failure event without creating fulfillment records. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-027: Payment Verification

**Feature:** Verify the status of a payment using the checkout ID after the payment process completes.

**Intended Use / Business Case:** After returning from the YOCO payment page, the frontend needs to verify whether the payment succeeded or failed before showing the appropriate result page.

**Pre-conditions:**
- A checkout has been completed (success or failure)
- The checkout ID is available

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Complete a YOCO checkout process (success scenario). |
| 2 | Call `GET /api/payments/verify/:checkoutId` with the checkout ID. |
| 3 | Verify the response includes the payment status ("completed"). |
| 4 | Verify the response includes purchase details (courseId, amount, currency). |
| 5 | Repeat for a failed checkout and verify status = "failed". |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `CoursePurchaseSuccess.tsx` calls the verification endpoint to confirm payment status before displaying the success/failure page. |
| **Database** | `GET /api/payments/verify/:checkoutId` queries `paymentIntents` and `coursePurchases` by `checkoutId`. `PaymentService.verifyYocoPayment()` handles the verification. Returns payment status and associated metadata. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-028: Receipt PDF Generation and Storage

**Feature:** Verify that a PDF receipt is automatically generated after a successful purchase and stored in Object Storage.

**Intended Use / Business Case:** Buyers need formal receipts for personal records, expense reports, or tax purposes. The receipt PDF must be stored and retrievable.

**Pre-conditions:**
- A successful purchase has been completed
- Object Storage is configured

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Complete a successful course purchase. |
| 2 | Navigate to the Purchase History page (`/purchase-history`). |
| 3 | Locate the purchase and verify a "Download Receipt" option is available. |
| 4 | Click to download the receipt. |
| 5 | Verify the downloaded file is a valid PDF document. |
| 6 | Verify the PDF contains: course name, purchase date, amount, currency, buyer info. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `PurchaseHistory.tsx` and `InvoiceHistory.tsx` show a download button for receipts. Clicking downloads a PDF. The PDF is professionally formatted with purchase details. |
| **Database** | `coursePurchases.receiptPdfPath` contains the Object Storage key for the PDF. `PaymentRouter` generates the PDF during webhook fulfillment and stores it via the Object Storage service. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-029: Purchase Receipt Email to Buyer

**Feature:** Verify that a purchase confirmation email with receipt details is sent to the buyer after successful purchase.

**Intended Use / Business Case:** Buyers expect immediate email confirmation of their purchase with receipt details for their records.

**Pre-conditions:**
- MailerSend is configured
- A successful purchase has been completed

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Complete a successful course purchase. |
| 2 | Check the buyer's email inbox. |
| 3 | Verify a purchase receipt email was received. |
| 4 | Verify the email contains: course name, purchase amount, currency, date, and access instructions. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | N/A — email delivery test. Buyer receives email without any platform action required. |
| **Database** | `NotificationService.sendPurchaseReceiptEmail()` is invoked during webhook fulfillment in `PaymentRouter`. The email is sent non-blocking. HTML email template includes purchase details. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-030: Sales Notification Email to Org Admins

**Feature:** Verify that org admins of the course creator's organization receive a sales notification email when a course is purchased.

**Intended Use / Business Case:** Course creators want to be notified immediately when someone purchases their course, providing visibility into sales activity.

**Pre-conditions:**
- MailerSend is configured
- A successful purchase has been completed
- The creator organization has OrgAdmin users

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Complete a successful course purchase (as a buyer from a different org). |
| 2 | Check the email inbox of an OrgAdmin of the creator's organization. |
| 3 | Verify a sales notification email was received. |
| 4 | Verify the email contains: course name, buyer info (anonymized if applicable), sale amount. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | N/A — email delivery test. Org admins receive the notification automatically. |
| **Database** | `NotificationService.sendSalesNotificationToOrgAdmins()` is invoked during webhook fulfillment in `PaymentRouter`. The email targets all users with OrgAdmin role in the creator's organization. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-031: Webhook Deduplication

**Feature:** Verify that duplicate webhook events from YOCO are handled idempotently, preventing double-fulfillment.

**Intended Use / Business Case:** YOCO may retry webhook deliveries if the initial response is delayed. The system must not create duplicate purchase records, double-charge, or grant double access.

**Pre-conditions:**
- A pending payment intent exists
- YOCO webhook is configured

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Process a successful YOCO webhook for a course purchase. |
| 2 | Verify the purchase is fulfilled (purchase record + enrollment created). |
| 3 | Send the EXACT same webhook payload again (duplicate). |
| 4 | Verify the system does NOT create a second purchase record. |
| 5 | Verify the system does NOT create a second enrollment. |
| 6 | Verify the response indicates the event was already processed. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | N/A — server-side test. The buyer sees no effect from duplicate webhooks. |
| **Database** | `paymentFulfillments` has a unique constraint on `checkoutId`. `WebhookDeduplicationService` checks for existing fulfillment before processing. `WebhookReplayProtection` prevents replay attacks. The second webhook is acknowledged but not re-processed. Only one `coursePurchases` record exists. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-032: One Purchase Per User Per Course Constraint

**Feature:** Verify that a user cannot purchase the same course twice, enforced by a unique database constraint.

**Intended Use / Business Case:** Once a buyer has purchased a course, they should not be able to accidentally purchase it again. The system must prevent duplicate purchases at both the UI and database levels.

**Pre-conditions:**
- User is logged in as a buyer
- The user has already purchased a specific course

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the course detail page of an already-purchased course. |
| 2 | Verify the "Buy Now" button is replaced with an "Already Purchased" or "Go to Course" state. |
| 3 | Attempt to call `POST /api/payments/create-checkout` for the same course via API. |
| 4 | Verify the API returns an error indicating the course is already purchased. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `CourseDetail.tsx` checks `PurchaseService.hasPurchased()` and shows an "Already Purchased" state instead of the buy button. A "Go to Course" or "Continue Learning" button is shown instead. |
| **Database** | `coursePurchases` has unique constraint `UNQ_user_course_purchase` on (userId, courseId). Attempting to insert a duplicate purchase throws a constraint violation error. `PurchaseService.hasPurchased(userId, courseId)` returns true. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-033: Refund Request and Eligibility (14-Day Window)

**Feature:** Verify that a buyer can request a refund within the 14-day eligibility window, and the system checks completion percentage.

**Intended Use / Business Case:** A buyer purchases a course but is not satisfied. They can request a refund within 14 days of purchase, provided they haven't completed too much of the course content.

**Pre-conditions:**
- User is logged in as a buyer who has completed a purchase within the last 14 days
- The purchase status is "completed"

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Purchase History page. |
| 2 | Locate the recent purchase (within 14 days). |
| 3 | Click "Request Refund" and provide a reason. |
| 4 | Verify the refund request is created with `status` = "pending". |
| 5 | Attempt to request a refund for a purchase older than 14 days. |
| 6 | Verify the system rejects the request with an "Outside refund window" message. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `CourseRefunds.tsx` allows refund requests for eligible purchases. The refund reason is required. The system shows eligibility status before submission. Ineligible purchases show a clear "Not eligible" message with the reason. |
| **Database** | `courseRefunds` new row: `purchaseId`, `courseId`, `userId`, `status` = "pending", `requestReason`, `completionPercentage` (calculated at request time), `eligibilityWindowDays` = 14. `CourseRefundService.checkEligibility()` validates the 14-day window. `CourseRefundService.calculateCourseCompletion()` captures the current completion %. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-034: PayFast / Google Pay / Apple Pay — NOT IMPLEMENTED

**Feature:** Alternative payment methods beyond YOCO — PayFast, Google Pay, Apple Pay.

**Intended Use / Business Case:** Slide 5 mentions support for multiple payment methods. These are expected as "coming soon" features to provide buyers with more payment flexibility.

**Pre-conditions:**
- N/A — Feature not implemented

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Search the codebase for "PayFast", "Google Pay", "Apple Pay" integrations. |
| 2 | Verify no PayFast service, route, or configuration exists. |
| 3 | Verify no Google Pay or Apple Pay integration exists. |
| 4 | Confirm the only payment provider is YOCO (`PaymentService` with YOCO API). |
| 5 | Document the gap for future implementation. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | No PayFast, Google Pay, or Apple Pay options appear in the checkout flow. Only YOCO credit card processing is available. |
| **Database** | `paymentTransactions.provider` defaults to "yoco". No other provider values exist. No PayFast/Google Pay/Apple Pay service files, API keys, or configurations exist in the codebase. |

> **Implementation Gap:** Slide 5 mentions PayFast, Google Pay, and Apple Pay as additional payment methods. These are **NOT IMPLEMENTED**. Only YOCO is integrated as the payment gateway. This is flagged as a future development item.

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

### 4.5 Course Reviews & Ratings Tests (Slide 6)

---

#### TC-MARKET-035: Submit Star Rating (0.5–5.0 Half-Star)

**Feature:** Submit a star rating for a purchased course using a 0.5 to 5.0 half-star increment scale.

**Intended Use / Business Case:** After completing a course, a buyer rates it using a half-star system. This rating contributes to the course's aggregate score and helps other buyers make informed decisions.

**Pre-conditions:**
- User is logged in as a buyer who has purchased AND completed all lessons in the course
- The user has NOT already reviewed this course

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Course Rating page (`/courses/:courseId/rate`). |
| 2 | Verify the star rating input supports half-star increments (0.5, 1.0, 1.5, ..., 5.0). |
| 3 | Select a rating of 4.0 stars. |
| 4 | Enter a review comment (required for ratings below 4.5). |
| 5 | Submit the review. |
| 6 | Verify the review is created and the course's aggregate rating updates. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `CourseRating.tsx` displays an interactive star rating component supporting half-star increments. After submission, a success message appears. The course detail page shows the updated average rating. |
| **Database** | `courseReviews` new row: `rating` = "4.0" (decimal 3,1), `comment` = provided text, `userId`, `courseId`, `isVisible` = true. `courses.averageRating` recalculated by `ReviewService.updateCourseRating()`. `courses.totalRatings` incremented by 1. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-036: Written Review Comment (Required if Rating < 4.5)

**Feature:** Verify that a written comment is required when the star rating is below 4.5, but optional for ratings of 4.5 or above.

**Intended Use / Business Case:** Lower ratings should include constructive feedback explaining why the course fell short. High ratings (4.5+) don't require explanation since they indicate strong satisfaction.

**Pre-conditions:**
- User is eligible to review (purchased, completed all lessons, no existing review)

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Course Rating page. |
| 2 | Select a rating of 3.0 stars. |
| 3 | Attempt to submit WITHOUT a comment. |
| 4 | Verify validation prevents submission with an error message (e.g., "Comment required for ratings below 4.5"). |
| 5 | Enter a comment and submit successfully. |
| 6 | For a new course, select a rating of 5.0 stars. |
| 7 | Submit WITHOUT a comment. |
| 8 | Verify submission succeeds without a comment. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The comment field shows a "Required" indicator when rating < 4.5. Form validation prevents submission without a comment for low ratings. Ratings of 4.5 and above can be submitted with or without a comment. |
| **Database** | `courseReviews.comment` is non-null for ratings < 4.5. `ReviewService.createReview()` validates the comment requirement based on the rating value. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-037: Verified Purchase Check Before Review

**Feature:** Verify that only users who have purchased a course can submit a review, preventing fake reviews.

**Intended Use / Business Case:** Reviews must be from verified buyers to maintain trust and credibility in the marketplace. Non-buyers should be blocked from submitting reviews.

**Pre-conditions:**
- Two users: one who has purchased the course, one who has NOT

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as the user who has NOT purchased the course. |
| 2 | Attempt to navigate to the Course Rating page. |
| 3 | Verify the user is blocked with a "Purchase required" message or the review form is not accessible. |
| 4 | Attempt to call `POST /api/courses/:courseId/reviews` directly via API. |
| 5 | Verify the API returns an error (e.g., "Cannot review course without a purchase"). |
| 6 | Log in as the verified purchaser and confirm they CAN access the review form. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Non-purchasers see a disabled review form or a "Purchase to Review" message. Verified purchasers see the full review submission form. |
| **Database** | `ReviewService.createReview()` internally checks `coursePurchases` for a completed purchase by the user for the course. If no purchase exists, the service throws "Cannot review course without a purchase" error. The endpoint `POST /api/courses/:courseId/reviews` enforces this check. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-038: One Review Per User Per Course

**Feature:** Verify that a user can only submit one review per course, enforced by a unique database constraint.

**Intended Use / Business Case:** To prevent review manipulation, each buyer can only leave one review. They should be able to see their existing review but not submit a duplicate.

**Pre-conditions:**
- User is logged in as a buyer who has already submitted a review for a course

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Course Rating page for a course the user has already reviewed. |
| 2 | Verify the existing review is displayed. |
| 3 | Attempt to submit a new review via the API `POST /api/courses/:courseId/reviews`. |
| 4 | Verify the API returns an error: "User has already reviewed this course". |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `CourseRating.tsx` shows the existing review instead of the submission form. An "Edit" option may be available (for updating the review). |
| **Database** | `courseReviews` unique constraint `UNQ_user_course_review` on (userId, courseId) prevents duplicate inserts. `ReviewService.createReview()` checks for existing reviews before attempting insertion. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-039: Aggregate Rating Update on Course

**Feature:** Verify that the course's aggregate rating and total ratings count update automatically when a new review is submitted.

**Intended Use / Business Case:** The course card and detail page must reflect the latest aggregate rating. When a new review is submitted, the average should recalculate immediately.

**Pre-conditions:**
- A course has existing reviews with known ratings
- A new reviewer is ready to submit

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Note the course's current `averageRating` and `totalRatings` on the detail page. |
| 2 | Submit a new review with a known rating (e.g., 5.0). |
| 3 | Refresh the course detail page. |
| 4 | Verify `averageRating` has been recalculated to include the new rating. |
| 5 | Verify `totalRatings` has incremented by 1. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The course detail page shows the updated average rating (star display) and incremented review count. The change is visible immediately on page refresh. |
| **Database** | `courses.averageRating` recalculated as AVG of all `courseReviews.rating` for the course. `courses.totalRatings` = COUNT of all visible reviews. `ReviewService.updateCourseRating()` performs the recalculation after each review submission or moderation action. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-040: Rating Distribution Breakdown

**Feature:** View the distribution of ratings (how many 5-star, 4-star, etc.) for a course.

**Intended Use / Business Case:** Buyers want to see not just the average rating but the distribution — a course with all 5-star reviews is different from one with a mix of 1-star and 5-star reviews.

**Pre-conditions:**
- A course has multiple reviews with varied ratings

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the course detail page. |
| 2 | Locate the rating distribution section. |
| 3 | Verify the distribution shows counts or percentages for each star level (1–5). |
| 4 | Verify the distribution matches the actual reviews in the database. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `CourseDetail.tsx` displays a rating distribution breakdown (e.g., bar chart or star-level list) showing the count of reviews at each star level. |
| **Database** | `ReviewService.getRatingDistribution()` aggregates `courseReviews` by rating value, returning counts per star level. `GET /api/courses/:courseId/reviews` returns distribution data alongside paginated reviews. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-041: Review Moderation (Admin Hide/Show)

**Feature:** OrgAdmin or SuperAdmin can moderate reviews by hiding or showing them, controlling visibility of inappropriate or spam reviews.

**Intended Use / Business Case:** Course creators may receive inappropriate or spam reviews. Admins need the ability to hide such reviews from public view while preserving the data for records.

**Pre-conditions:**
- User is logged in as OrgAdmin or SuperAdmin
- A visible course review exists

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the course review management interface. |
| 2 | Locate a visible review. |
| 3 | Click "Hide" or "Moderate" to hide the review. |
| 4 | Verify the review's `isVisible` field is set to false. |
| 5 | Verify the hidden review no longer appears in the public review listing. |
| 6 | Verify the course's `averageRating` and `totalRatings` are recalculated excluding the hidden review. |
| 7 | Unhide the review and verify it reappears with ratings recalculated. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The admin interface shows all reviews with moderation controls. Hidden reviews are marked with a "Hidden" badge. Public-facing review listings exclude hidden reviews. |
| **Database** | `courseReviews.isVisible` set to false. `courseReviews.moderatedBy` = admin userId. `courseReviews.moderatedAt` = current timestamp. `ReviewService.moderateReview()` handles the toggle. `ReviewService.updateCourseRating()` recalculates averages excluding hidden reviews. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-042: Review Eligibility — All Lessons Completed

**Feature:** Verify that a buyer must complete all course lessons before being eligible to submit a review.

**Intended Use / Business Case:** Reviews should only come from buyers who have experienced the full course content. This ensures meaningful, informed feedback.

**Pre-conditions:**
- User is logged in as a buyer who has purchased the course
- The user has NOT completed all lessons

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Course Rating page for a course where the buyer has NOT completed all lessons. |
| 2 | Verify the review form is disabled or shows "Complete all lessons to review". |
| 3 | Attempt to submit a review via `POST /api/courses/:courseId/reviews`. |
| 4 | Verify the API returns an error: "Cannot review course until all lessons are completed". |
| 5 | Complete all remaining lessons in the course. |
| 6 | Return to the Course Rating page and verify the review form is now enabled. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `CourseRating.tsx` checks completion status and disables the review form until all lessons are completed. A clear message explains the requirement. |
| **Database** | `ReviewService.checkAllLessonsCompleted()` queries `userCourseLessonProgress` and `courseLessons` to verify all lessons have `status` = "completed". If incomplete, the review submission is rejected. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

### 4.6 Purchaser Access Protection Tests (Slide 7)

---

#### TC-MARKET-043: Access Retained When Course Set to Inactive

**Feature:** Verify that buyers who have purchased a course retain access even when the course creator sets the course status to "inactive".

**Intended Use / Business Case:** A creator temporarily deactivates a course (e.g., for content updates). Existing buyers must not lose access to the content they paid for.

**Pre-conditions:**
- A buyer has a completed purchase for a public course
- The buyer has an enrollment record in `userCourseEnrollments`

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as the buyer. Verify access to the course content. |
| 2 | Log in as the course creator (OrgAdmin). Change the course status to "inactive". |
| 3 | Log back in as the buyer. |
| 4 | Navigate to My Public Courses (`/my-courses`). |
| 5 | Verify the purchased course still appears in the library. |
| 6 | Click on the course and verify all lessons are still accessible. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The buyer's My Courses page still shows the purchased course. The course may have an "Inactive" badge but content remains fully accessible. `MyCourses.tsx` renders purchased courses regardless of status. |
| **Database** | `userCourseEnrollments` persists unchanged when `courses.status` changes to "inactive". `GET /api/my-public-courses` returns courses based on `coursePurchases` join, NOT filtered by `courses.status`. The buyer's enrollment record is independent of the course status. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-044: Access Retained When Course Archived

**Feature:** Verify that buyers retain access when a course is archived by the creator.

**Intended Use / Business Case:** A creator archives a course that is no longer marketed. Existing buyers must retain permanent access to the content they purchased.

**Pre-conditions:**
- A buyer has a completed purchase for a public course
- The course is currently active

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as the buyer. Verify access to the course. |
| 2 | Log in as the creator (OrgAdmin). Change the course status to "archived". |
| 3 | Log back in as the buyer. |
| 4 | Verify the course still appears in My Public Courses. |
| 5 | Verify the course content (lessons, quizzes) is still accessible. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The archived course remains in the buyer's library. Content is fully accessible. The course may no longer appear on the public marketplace, but the buyer's access is unaffected. |
| **Database** | `courses.status` = "archived" does NOT affect `userCourseEnrollments` or `coursePurchases`. `GET /api/my-public-courses` returns the course because the enrollment record exists regardless of course status. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-045: Access Retained When Visibility Changed (Public → Org Only)

**Feature:** Verify that buyers retain access when the creator changes the course visibility from "public" to "org_only".

**Intended Use / Business Case:** A creator decides to stop public sales and make the course internal only. Existing buyers must retain their paid access even though the course is no longer visible on the marketplace.

**Pre-conditions:**
- A buyer has a completed purchase for a public course
- The course is currently public

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as the buyer. Verify access. |
| 2 | Log in as the creator. Change course visibility from "public" to "org_only". |
| 3 | Verify the course NO LONGER appears on the public marketplace. |
| 4 | Log back in as the buyer. |
| 5 | Verify the course still appears in My Public Courses and is fully accessible. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The course disappears from the marketplace browse page (`GET /api/public/courses` no longer returns it). However, the buyer's My Courses page still shows the course with full access. |
| **Database** | `courses.visibility` changed to "org_only". The `userCourseEnrollments` record is unaffected. `GET /api/my-public-courses` uses `coursePurchases` to determine access, not `courses.visibility`. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-046: Automatic Version Upgrade for Purchasers

**Feature:** Verify that purchasers can upgrade to the latest version of a course when a new version is published.

**Intended Use / Business Case:** A course creator publishes an updated version with new content. Existing buyers should be able to access the latest version, potentially through an upgrade process.

**Pre-conditions:**
- A buyer has purchased a course (version 1)
- The creator publishes a new version (version 2)
- The buyer's enrollment shows `hasNewerVersion` = true

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as the buyer. Navigate to My Courses. |
| 2 | Verify the purchased course shows an "Update Available" or "New Version" indicator. |
| 3 | Click "Upgrade" to access the latest version. |
| 4 | Verify the upgrade via `POST /api/courses/:id/upgrade`. |
| 5 | Verify the enrollment now points to the latest version. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `MyCourses.tsx` shows a version upgrade indicator when `userCourseEnrollments.hasNewerVersion` = true. After upgrade, the user accesses the latest course content. |
| **Database** | `userCourseEnrollments.courseVersionId` updated to latest version. `userCourseEnrollments.hasNewerVersion` set to false. `userCourseEnrollments.latestVersionId` updated. `PurchaseService.purchaseUpgrade()` handles the version upgrade. `courseVersionUpgrades` records the upgrade transaction. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-047: Permanent Library (My Public Courses)

**Feature:** Verify that all purchased marketplace courses appear in the user's permanent library accessible via My Public Courses.

**Intended Use / Business Case:** Buyers build a library of purchased courses over time. This library must be permanent and always accessible, serving as the buyer's course portfolio.

**Pre-conditions:**
- User is logged in as a buyer who has purchased multiple public courses

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to My Courses (`/my-courses`). |
| 2 | Locate the "Purchased Courses" or "My Public Courses" section. |
| 3 | Verify all purchased courses appear in the library. |
| 4 | Verify each course shows: title, creator org, purchase date, progress status. |
| 5 | Click on a course and verify it opens with full access to content. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `MyCourses.tsx` displays a dedicated section for purchased marketplace courses. All purchases are listed with course details and progress information. Courses are clickable and lead to full content access. |
| **Database** | `GET /api/my-public-courses` queries `coursePurchases` WHERE `userId` = current user AND `status` = "completed", joined with `courses` for course details. Returns all completed purchases regardless of course status or visibility. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-048: Purchase Grants Enrollment Record

**Feature:** Verify that a successful purchase automatically creates an enrollment record granting the buyer access to the course.

**Intended Use / Business Case:** The enrollment record is the mechanism that grants course access. Without it, the buyer cannot access the content even if a purchase record exists.

**Pre-conditions:**
- A buyer has just completed a successful purchase

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Complete a successful course purchase. |
| 2 | Query the `userCourseEnrollments` table for the buyer's userId and courseId. |
| 3 | Verify an enrollment record exists with correct `courseVersionId` and `enrolledAt` timestamp. |
| 4 | Navigate to the course as the buyer. |
| 5 | Verify all lessons are accessible (not locked). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | After purchase, the course appears in the buyer's library with full access. All lessons are unlocked. |
| **Database** | `userCourseEnrollments` new row: `userId` = buyer, `courseId` = purchased course, `courseVersionId` = current version, `enrolledAt` = timestamp. Created by `PurchaseService.grantAccess()` during webhook fulfillment. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

### 4.7 Sales Dashboard Tests (Slide 8)

---

#### TC-MARKET-049: Revenue Summary (Total, Commission, Net, Sales Count)

**Feature:** View the organization's revenue summary showing total revenue, platform commission, net profit, and total sales count.

**Intended Use / Business Case:** An OrgAdmin needs a high-level overview of their course sales performance including how much revenue was generated, how much the platform takes as commission, and the net earnings.

**Pre-conditions:**
- User is logged in as OrgAdmin of an e-learning organization
- The organization has at least one completed course sale

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Org Sales Dashboard (`/org-sales`). |
| 2 | Verify the revenue summary section displays: Total Revenue, Platform Commission, Net Profit, Sales Count. |
| 3 | Verify the values are non-zero and calculated correctly. |
| 4 | Apply a date range filter (e.g., last 30 days). |
| 5 | Verify the summary values update to reflect only sales within the filtered period. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `OrgSalesDashboard.tsx` displays KPI cards showing Total Revenue, Platform Commission, Net Profit, and Sales Count. Values update dynamically when date filters are applied. |
| **Database** | `GET /api/org-sales/revenue-summary` returns `RevenueSummary` object: `totalRevenue`, `platformCommission`, `netProfit`, `salesCount`, `currency`, `periodStart`, `periodEnd`. `RevenueTrackingService.getOrganizationRevenue()` aggregates from `coursePurchases` for the org's courses. Date range filtering via `startDate`/`endDate` query params. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-050: Per-Course Revenue Breakdown

**Feature:** View revenue breakdown by individual course, showing sales count, revenue, commission, and rating per course.

**Intended Use / Business Case:** An OrgAdmin wants to identify which courses are top performers and which are underperforming to make data-driven decisions about content investment and pricing.

**Pre-conditions:**
- User is logged in as OrgAdmin
- The organization has multiple courses with sales data

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Org Sales Dashboard. |
| 2 | Locate the per-course breakdown section/table. |
| 3 | Verify each course row shows: title, sales count, total revenue, platform commission, net revenue, average rating. |
| 4 | Verify the breakdown totals match the revenue summary KPIs. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `OrgSalesDashboard.tsx` displays a table or card list with per-course metrics. Courses are sortable by revenue, sales count, or rating. |
| **Database** | `GET /api/org-sales/course-breakdown` returns `CourseRevenueSummary[]` array: per course — `courseId`, `courseTitle`, `totalSales`, `totalRevenue`, `platformCommission`, `netRevenue`, `averageRating`, `purchaseCount`. `RevenueTrackingService.getCourseRevenueBreakdown()` groups `coursePurchases` by courseId. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-051: Monthly Revenue Trends

**Feature:** View monthly revenue trends over a configurable time period (1–36 months), showing revenue, sales count, commission, and net profit per month.

**Intended Use / Business Case:** An OrgAdmin wants to track revenue growth or decline over time to identify seasonal patterns and the impact of new course launches.

**Pre-conditions:**
- User is logged in as OrgAdmin
- The organization has sales data spanning multiple months

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Org Sales Dashboard or Revenue Dashboard. |
| 2 | Locate the monthly trends chart/section. |
| 3 | Verify data is displayed for the default number of months. |
| 4 | Change the period to 12 months. Verify the chart updates to show 12 months of data. |
| 5 | Verify each month shows: revenue, sales count, commission deducted, net profit. |
| 6 | Change the period to 1 month. Verify only the current month is shown. |
| 7 | Change the period to 36 months (maximum). Verify it is accepted. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `OrgSalesDashboard.tsx` / `OrgRevenueDashboard.tsx` displays a line or bar chart with monthly revenue trends. The months parameter is configurable (1–36). |
| **Database** | `GET /api/org-sales/monthly-trends?months=12` returns `MonthlyRevenueTrend[]` array: per month — `month` (YYYY-MM), `revenue`, `salesCount`, `commissionDeducted`, `netProfit`. `RevenueTrackingService.getMonthlyTrends()` groups `coursePurchases` by month. The `months` parameter accepts values 1–36. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-052: Time Period Filtering (startDate/endDate)

**Feature:** Filter sales dashboard data by a custom date range using start and end dates.

**Intended Use / Business Case:** An OrgAdmin needs to analyze revenue for a specific quarter, fiscal year, or campaign period to evaluate performance and report to stakeholders.

**Pre-conditions:**
- User is logged in as OrgAdmin
- Sales data exists across multiple date ranges

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Org Sales Dashboard. |
| 2 | Set a custom date range (e.g., "2026-01-01" to "2026-01-31"). |
| 3 | Verify the revenue summary updates to show only sales within the range. |
| 4 | Verify the per-course breakdown reflects the same date range. |
| 5 | Clear the date filter and verify all-time data is restored. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Date picker controls allow setting start and end dates. All dashboard sections (summary, breakdown, trends) filter by the selected period. Clearing dates restores the full view. |
| **Database** | `GET /api/org-sales/revenue-summary?startDate=2026-01-01&endDate=2026-01-31` filters `coursePurchases.purchasedAt` within the range. `RevenueTrackingService.getOrganizationRevenue()` accepts `periodStart` and `periodEnd` parameters. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-053: OrgAdmin RBAC Access Control

**Feature:** Verify that only OrgAdmin (and above) can access the sales dashboard, and lower-privilege roles are denied.

**Intended Use / Business Case:** Financial data is sensitive. Only organization administrators should have access to revenue and sales information. Students and teachers should not see sales dashboards.

**Pre-conditions:**
- Users exist with different roles: OrgAdmin, Teacher, Student

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as an OrgAdmin. Navigate to the Sales Dashboard. |
| 2 | Verify full access to all dashboard features. |
| 3 | Log in as a Teacher. Attempt to navigate to the Sales Dashboard. |
| 4 | Verify access is denied (403 Forbidden or redirect). |
| 5 | Log in as a Student. Attempt to access the Sales Dashboard URL directly. |
| 6 | Verify access is denied. |
| 7 | Log in as a SuperAdmin. Verify full access. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | OrgAdmin and SuperAdmin can access the Sales Dashboard. Teacher and Student roles are denied access (redirected to a "Not Authorized" page or shown a 403 error). The sidebar/navigation does not show Sales Dashboard links for unauthorized roles. |
| **Database** | `requireOrgAdminAccess` middleware on all `/api/org-sales/*` endpoints validates the user's role includes "OrgAdmin" or "SuperAdmin". `ADMIN_ROLES` from `sharedResources.ts` defines the authorized role list. Unauthorized requests receive HTTP 403. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-054: Conversion Insights — NOT IMPLEMENTED

**Feature:** View conversion insights showing how course views convert to purchases.

**Intended Use / Business Case:** Slide 8 describes "conversion insights" tracking how many course page views result in purchases. This would help creators optimize course listings.

**Pre-conditions:**
- N/A — Feature not implemented

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Search the codebase for "conversion", "view tracking", "page views" functionality. |
| 2 | Verify no course view counter or tracking mechanism exists. |
| 3 | Verify no conversion rate calculation exists in `RevenueTrackingService` or dashboard endpoints. |
| 4 | Document the gap. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | No conversion insights section exists on the Sales Dashboard. No view count is tracked on course detail pages. |
| **Database** | No `courseViews` or `pageViews` table exists. No view counter column on `courses`. `RevenueTrackingService` does not calculate conversion rates. |

> **Implementation Gap:** Slide 8 mentions "conversion insights" for tracking course views to purchase conversion rates. This feature is **NOT IMPLEMENTED**. No view tracking, page view counters, or conversion analytics exist in the codebase.

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

### 4.8 Monthly Payouts Tests (Slide 9)

---

#### TC-MARKET-055: Monthly Payout Calculation

**Feature:** Calculate monthly payouts for all e-learning organizations based on their completed sales within the period.

**Intended Use / Business Case:** At the end of each month, the platform calculates how much each creator organization is owed based on their course sales minus platform commission.

**Pre-conditions:**
- E-learning organizations exist with completed course sales
- SuperAdmin is logged in

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Trigger a monthly payout calculation for the current period. |
| 2 | Verify payout records are created for each e-learning org with sales. |
| 3 | Verify each payout includes: gross revenue, platform commission, net amount. |
| 4 | Verify the exchange rate snapshot is captured and stored as immutable JSONB. |
| 5 | Verify organizations with no sales do NOT get a payout record. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `PayoutManagement.tsx` shows newly calculated payouts with status = "pending" for each org with sales. |
| **Database** | `coursePayouts` new rows per org: `organizationId`, `periodStart`, `periodEnd`, `grossRevenue`, `platformCommission`, `netAmount`, `currency`, `exchangeRateSnapshot` (JSONB), `status` = "pending". `PayoutService.calculateMonthlyPayouts()` iterates e-learning orgs and aggregates `coursePurchases` for the period. SuperAdmin test payments (from `paymentIntents`) are excluded. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-056: Per-Course Payout Line Items

**Feature:** Verify that each payout includes per-course line items showing the breakdown of sales, revenue, and commission per course.

**Intended Use / Business Case:** Organizations need transparency into how their payout was calculated — which courses contributed how much revenue.

**Pre-conditions:**
- A payout record exists with multiple course sales

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Payout Management page. |
| 2 | Click on a specific payout to view details. |
| 3 | Verify the breakdown shows line items per course. |
| 4 | Each line item should show: course title, sales count, gross revenue, platform commission, net amount. |
| 5 | Verify the sum of line items equals the payout totals. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `PayoutManagement.tsx` displays a detailed breakdown view with a table of line items. Each row represents a course with its sales metrics. The total row matches the payout header amounts. |
| **Database** | `GET /api/admin/payouts/:id/breakdown` returns `coursePayoutLineItems` for the payout: `payoutId`, `courseId`, `salesCount`, `grossRevenue`, `platformCommission`, `netAmount`. `PayoutProcessorService.getPayoutBatchDetails()` provides the detailed breakdown. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-057: Payout Batch Processing

**Feature:** Create and process a payout batch for platform-wide payout administration.

**Intended Use / Business Case:** The platform processes payouts in batches — grouping multiple organization payouts for efficient processing and tracking.

**Pre-conditions:**
- SuperAdmin is logged in
- Pending payouts exist for multiple organizations

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Payout Management page. |
| 2 | Initiate batch creation for a specific period. |
| 3 | Verify a `payoutBatches` record is created with `status` = "pending". |
| 4 | Verify the batch includes totals: `totalPayouts` count, `totalAmount`. |
| 5 | Verify the batch `periodStart` and `periodEnd` match the selected period. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `PayoutManagement.tsx` shows the new batch with status "Pending", total payouts count, total amount, and period dates. |
| **Database** | `payoutBatches` new row: `batchDate`, `periodStart`, `periodEnd`, `status` = "pending", `totalPayouts`, `totalAmount`, `currency`, `createdBy` = SuperAdmin userId. `PayoutProcessorService.createPayoutBatch()` creates the batch. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-058: Mark Payout as Paid (SuperAdmin)

**Feature:** SuperAdmin marks a payout as paid after transferring funds to the organization, recording the payment reference.

**Intended Use / Business Case:** After the platform manually transfers funds to a creator organization's bank account, the SuperAdmin marks the payout as paid for tracking and audit purposes.

**Pre-conditions:**
- SuperAdmin is logged in
- A pending payout exists

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Payout Management page. |
| 2 | Locate a payout with `status` = "pending". |
| 3 | Click "Mark as Paid". |
| 4 | Enter a payment reference (e.g., bank transfer reference number). |
| 5 | Confirm the action. |
| 6 | Verify the payout status changes to "paid". |
| 7 | Verify the `paidAt` timestamp and `paymentReference` are recorded. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `PayoutManagement.tsx` updates the payout status badge from "Pending" to "Paid". The payment reference and paid date are displayed. |
| **Database** | `coursePayouts.status` = "paid", `coursePayouts.paidAt` = current timestamp, `coursePayouts.paymentReference` = entered reference. `financialAuditLog` new entry recording the payout-paid event with `beforeState` and `afterState` JSONB. `PayoutProcessorService.markAsPaid()` handles the update. `POST /api/admin/payouts/:id/mark-paid` endpoint used. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-059: Payout Invoice PDF Generation

**Feature:** Generate a downloadable PDF invoice for a specific payout, detailing the payout breakdown.

**Intended Use / Business Case:** Organizations need formal invoices for their accounting and tax records. The payout invoice PDF provides a professional document with all financial details.

**Pre-conditions:**
- SuperAdmin is logged in
- A payout record exists (pending or paid)

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Payout Management page. |
| 2 | Locate a payout record. |
| 3 | Click "Download Invoice" or "Generate Invoice". |
| 4 | Verify a PDF file is downloaded. |
| 5 | Open the PDF and verify it contains: organization name, period, per-course breakdown, gross revenue, commission, net amount, exchange rate snapshot, banking details. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `PayoutManagement.tsx` provides an invoice download button per payout. Clicking triggers `GET /api/admin/payouts/:id/invoice` which returns a PDF. |
| **Database** | `PayoutProcessorService.generatePayoutInvoice()` uses PDFKit to generate the invoice. The PDF includes data from `coursePayouts`, `coursePayoutLineItems`, `organizations`, and `organizationBankingDetails`. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-060: Payout History Listing with Filters

**Feature:** View a list of all payouts with filtering capabilities by currency, status, and organization.

**Intended Use / Business Case:** SuperAdmins need to manage and track payouts across all organizations. Filters help them find specific payouts, such as all pending payouts or all payouts for a specific organization.

**Pre-conditions:**
- SuperAdmin is logged in
- Multiple payouts exist with varying statuses, currencies, and organizations

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Payout Management page. |
| 2 | Verify all payouts are listed with columns: org name, period, amount, currency, status, paid date. |
| 3 | Filter by status = "pending". Verify only pending payouts appear. |
| 4 | Filter by currency = "ZAR". Verify only ZAR payouts appear. |
| 5 | Filter by a specific organization. Verify only that org's payouts appear. |
| 6 | Clear all filters and verify the full list is restored. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `PayoutManagement.tsx` displays a filterable payout list with filter controls for status, currency, and organization. Applied filters narrow the displayed results. |
| **Database** | `GET /api/admin/payouts` accepts query params: `currency`, `status`, `organizationId`. The endpoint applies WHERE conditions based on active filters. `PayoutProcessorService.getPayoutBatches()` supports filtered queries. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-061: Banking Details Configuration

**Feature:** Verify that organization banking details are configured and stored securely for payout processing.

**Intended Use / Business Case:** Before payouts can be processed, organizations must configure their banking details. Account numbers must be stored encrypted for security.

**Pre-conditions:**
- OrgAdmin is logged in for an e-learning organization
- No banking details are currently configured

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the payout or banking configuration section. |
| 2 | Enter banking details: bank name, account holder name, account number, branch code, SWIFT code, account type. |
| 3 | Save the banking details. |
| 4 | Verify the details are saved with the account number encrypted. |
| 5 | Verify the stored details can be retrieved (with account number masked or partially hidden). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The banking details form accepts all required fields. After saving, the account number is displayed masked (e.g., "****1234"). Success confirmation is shown. |
| **Database** | `organizationBankingDetails` new row: `organizationId` (unique), `bankName`, `accountHolderName`, `accountNumber` (ENCRYPTED text), `branchCode`, `swiftCode`, `accountType`, `bankAddress`. The `accountNumber` column stores encrypted data, not plain text. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

### 4.9 Revenue Analytics Tests (Slide 10)

---

#### TC-MARKET-062: Platform Revenue Overview (SuperAdmin)

**Feature:** SuperAdmin views the platform-wide revenue overview, including total revenue, commission earned, and payout summaries.

**Intended Use / Business Case:** The platform owner needs visibility into overall financial performance — total marketplace revenue, commission income, and outstanding payouts across all organizations.

**Pre-conditions:**
- User is logged in as SuperAdmin
- Course sales exist across multiple organizations

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Platform Revenue Reports page. |
| 2 | Verify the overview displays: total revenue, total platform commission, total payouts, outstanding payouts. |
| 3 | Verify the data covers all organizations, not just one. |
| 4 | Apply a time period filter and verify the overview updates. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `PlatformRevenueReports.tsx` displays KPI cards with platform-wide financial metrics. Data is aggregated across all e-learning organizations. Time period filters adjust the displayed values. |
| **Database** | `GET /api/platform-revenue/overview` (SuperAdmin only, protected by `isSuperAdmin` middleware). Returns aggregated data from `coursePurchases`, `coursePayouts`, and `platformRevenueSources`. Uses in-memory caching (5-minute TTL) for performance. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-063: Revenue Streams Breakdown

**Feature:** View revenue broken down by different streams (course sales, credits, subscriptions, licenses).

**Intended Use / Business Case:** The platform has multiple revenue sources. Understanding the breakdown helps in strategic planning and resource allocation.

**Pre-conditions:**
- SuperAdmin is logged in
- Revenue exists from course sales

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Platform Revenue Reports page. |
| 2 | Locate the Revenue Streams section. |
| 3 | Verify the breakdown shows revenue by stream type. |
| 4 | Verify course marketplace revenue is accurately represented. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `PlatformRevenueReports.tsx` shows a breakdown of revenue by source (e.g., marketplace courses, LP credits, subscriptions). Each stream shows its contribution amount and percentage. |
| **Database** | `GET /api/platform-revenue/streams` returns `platformRevenueSources` aggregated by stream type. `PlatformRevenueIngestionService` categorizes revenue by source. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-064: Per-Organization Analytics (SuperAdmin)

**Feature:** View revenue analytics broken down by individual organization.

**Intended Use / Business Case:** The platform owner wants to identify top-performing creator organizations, track their growth, and ensure fair commission distribution.

**Pre-conditions:**
- SuperAdmin is logged in
- Multiple organizations have course sales

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Platform Revenue Reports page. |
| 2 | Locate the Per-Organization Analytics section. |
| 3 | Verify each organization shows: name, total revenue, commission paid, net amount, sales count. |
| 4 | Verify the data is accurate by cross-referencing with individual org dashboards. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `PlatformRevenueReports.tsx` displays a table or card list with per-org metrics. Organizations are sortable by revenue. |
| **Database** | `GET /api/platform-revenue/org-analytics` (SuperAdmin) returns per-org revenue data. `PlatformRevenueIngestionService` aggregates `coursePurchases` grouped by `courses.organizationId`. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-065: Revenue Snapshot Generation

**Feature:** Generate a point-in-time financial snapshot for audit and reporting purposes.

**Intended Use / Business Case:** For accounting and compliance, the platform needs to capture periodic financial snapshots that are immutable and auditable.

**Pre-conditions:**
- SuperAdmin is logged in
- Revenue data exists

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Platform Revenue Reports page. |
| 2 | Click "Generate Snapshot" or trigger snapshot generation. |
| 3 | Verify a new snapshot record is created in `platformFinancialSnapshots`. |
| 4 | Verify the snapshot contains: period type, total revenue, data JSONB with detailed breakdown. |
| 5 | View the list of existing snapshots and verify the new one appears. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `PlatformRevenueReports.tsx` provides a "Generate Snapshot" button. Existing snapshots are listed with their period and date. |
| **Database** | `POST /api/platform-revenue/snapshots/generate` creates a new `platformFinancialSnapshots` row: `periodType`, `totalRevenue`, `data` (JSONB with detailed breakdown). `PlatformFinancialSnapshotService` generates the snapshot. `GET /api/platform-revenue/snapshots` lists all snapshots. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-066: Financial Audit Log

**Feature:** View the financial audit log recording all financial events (payout markings, rate changes, etc.).

**Intended Use / Business Case:** For compliance and accountability, every financial action must be logged with before/after state, the user who performed it, and the timestamp.

**Pre-conditions:**
- SuperAdmin is logged in
- Financial events have occurred (payouts marked paid, rates overridden)

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Platform Revenue Reports page. |
| 2 | Locate the Financial Audit Log section. |
| 3 | Verify audit entries show: event type, entity type, entity ID, user, timestamp. |
| 4 | Click on an entry and verify `beforeState` and `afterState` JSONB are viewable. |
| 5 | Verify the log includes the user's IP address and user agent. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | `PlatformRevenueReports.tsx` displays a scrollable audit log with filterable entries. Each entry shows the event type, who performed it, and when. Expanding an entry reveals before/after state details. |
| **Database** | `GET /api/platform-revenue/audit-log` returns `financialAuditLog` entries: `eventType`, `entityType`, `entityId`, `userId`, `beforeState` (JSONB), `afterState` (JSONB), `ipAddress`, `userAgent`, `createdAt`. Entries are created by services like `PayoutProcessorService.markAsPaid()`. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-067: Price History Tracking

**Feature:** Verify that all course price changes are recorded in a price history audit trail.

**Intended Use / Business Case:** For revenue analysis and audit purposes, the platform tracks every price change including old price, new price, currency, who changed it, and when.

**Pre-conditions:**
- An OrgAdmin has changed a course's price at least once

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Note a course's current price (e.g., R199.99). |
| 2 | Change the price to R249.99 as an OrgAdmin. |
| 3 | Query the `coursePriceHistory` table for the courseId. |
| 4 | Verify a new row exists with: `oldPrice` = "199.99", `newPrice` = "249.99", `currency` = "ZAR", `changedBy` = admin userId, `changedAt` = timestamp. |
| 5 | Change the price again and verify another history record is created. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Price changes are recorded automatically when a course price is updated via the Course Edit page. No explicit user action is needed to create the history record. |
| **Database** | `coursePriceHistory` new row per price change: `courseId`, `oldPrice`, `newPrice`, `currency`, `changedAt`, `changedBy`. `RevenueTrackingService.recordPriceHistory()` creates the record during price update operations. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MARKET-068: Market Insights, Pricing Analysis & Export — NOT IMPLEMENTED

**Feature:** Marketplace benchmarks, pricing-vs-performance analysis, and data export for external BI tools.

**Intended Use / Business Case:** Slide 10 describes comprehensive analytics including marketplace benchmarking, pricing analysis to evaluate how pricing affects performance, and export capabilities for external reporting tools.

**Pre-conditions:**
- N/A — Features not implemented

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Search the codebase for "benchmark", "market insight", "pricing analysis" functionality. |
| 2 | Verify no marketplace benchmarking data or comparison engine exists. |
| 3 | Verify no price-vs-performance correlation analysis exists in any service. |
| 4 | Search for CSV/Excel export functionality in revenue routes. |
| 5 | Verify no export endpoint (returning CSV, XLSX, or downloadable data file) exists for revenue data. |
| 6 | Document all three gaps. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | No "Market Insights", "Pricing Analysis", or "Export" buttons/sections exist on any revenue dashboard. |
| **Database** | No benchmarking tables, no price-performance correlation views, no CSV/export endpoints exist. `RevenueTrackingService` does not include methods for benchmarking or export. |

> **Implementation Gaps:**
> 1. **Market Insights / Benchmarks** — Slide 10 mentions "compare to marketplace benchmarks." **NOT IMPLEMENTED.** No benchmarking data source or comparison engine exists.
> 2. **Pricing Analysis** — Slide 10 mentions "evaluate how pricing affects performance." **NOT IMPLEMENTED.** No price-vs-performance correlation analysis exists.
> 3. **Export Capabilities** — Slide 10 mentions "export data for external BI tools." **NOT IMPLEMENTED.** No CSV, Excel, or data export functionality exists for revenue analytics.

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

## 5. Traceability Matrix

This matrix maps each requirement slide to its corresponding test cases, ensuring complete coverage.

| Requirement Slide | Test Case IDs | Coverage Status |
|-------------------|---------------|-----------------|
| Slide 1 (Title/Overview — Create, Sell, Grow) | N/A — Context only | N/A |
| Slide 2 (Course Marketplace — Browse & Purchase) | TC-MARKET-001, TC-MARKET-002, TC-MARKET-003, TC-MARKET-004, TC-MARKET-005, TC-MARKET-006, TC-MARKET-007, TC-MARKET-008, TC-MARKET-009, TC-MARKET-010 | Full |
| Slide 3 (Create & Sell — Publish for External Sales) | TC-MARKET-011, TC-MARKET-012, TC-MARKET-013, TC-MARKET-014, TC-MARKET-015, TC-MARKET-016 | Full |
| Slide 4 (Multi-Currency Support — ZAR/EUR/USD) | TC-MARKET-017, TC-MARKET-018, TC-MARKET-019, TC-MARKET-020, TC-MARKET-021, TC-MARKET-022, TC-MARKET-023 | Full |
| Slide 5 (Secure Payment Processing — YOCO Integration) | TC-MARKET-024, TC-MARKET-025, TC-MARKET-026, TC-MARKET-027, TC-MARKET-028, TC-MARKET-029, TC-MARKET-030, TC-MARKET-031, TC-MARKET-032, TC-MARKET-033, TC-MARKET-034 | Full (PayFast/GPay/APay flagged as NOT IMPLEMENTED) |
| Slide 6 (Course Reviews & Ratings — Social Proof) | TC-MARKET-035, TC-MARKET-036, TC-MARKET-037, TC-MARKET-038, TC-MARKET-039, TC-MARKET-040, TC-MARKET-041, TC-MARKET-042 | Full |
| Slide 7 (Purchaser Access Protection — Permanent Access) | TC-MARKET-043, TC-MARKET-044, TC-MARKET-045, TC-MARKET-046, TC-MARKET-047, TC-MARKET-048 | Full |
| Slide 8 (Sales Dashboard — Revenue Overview) | TC-MARKET-049, TC-MARKET-050, TC-MARKET-051, TC-MARKET-052, TC-MARKET-053, TC-MARKET-054 | Partial (Conversion Insights NOT IMPLEMENTED) |
| Slide 9 (Monthly Payouts — Payout Processing) | TC-MARKET-055, TC-MARKET-056, TC-MARKET-057, TC-MARKET-058, TC-MARKET-059, TC-MARKET-060, TC-MARKET-061 | Full |
| Slide 10 (Revenue Analytics — Comprehensive Reporting) | TC-MARKET-062, TC-MARKET-063, TC-MARKET-064, TC-MARKET-065, TC-MARKET-066, TC-MARKET-067, TC-MARKET-068 | Partial (Market Insights, Pricing Analysis, Export NOT IMPLEMENTED) |

**Total Test Cases:** 68

**Implementation Gaps Summary:**
1. **Slide 5 — PayFast, Google Pay, Apple Pay:** NOT IMPLEMENTED. Only YOCO is integrated as the payment gateway.
2. **Slide 8 — Conversion Insights:** NOT IMPLEMENTED. No view tracking or conversion analytics exist.
3. **Slide 10 — Market Insights / Benchmarks:** NOT IMPLEMENTED. No marketplace benchmarking data exists.
4. **Slide 10 — Pricing Analysis:** NOT IMPLEMENTED. No price-vs-performance correlation analysis exists.
5. **Slide 10 — Export Capabilities:** NOT IMPLEMENTED. No CSV/Excel export for revenue data exists.

---

## 6. Glossary

| Term | Definition |
|------|-----------|
| **averageRating** | Decimal(3,2) field on `courses` storing the aggregate average star rating calculated from all visible `courseReviews`. Recalculated by `ReviewService.updateCourseRating()` after each review submission or moderation action. |
| **baseCurrency** | The original currency in which a course is priced by the creator (stored in `courses.currency`). Also recorded on `coursePurchases.baseCurrency` to preserve the original pricing context. |
| **checkoutId** | Unique identifier returned by YOCO's Checkout API when creating a payment session. Used as the primary key for payment tracking, verification, and webhook deduplication. Stored on `paymentIntents`, `coursePurchases`, and `paymentFulfillments`. |
| **commissionRate** | Decimal(5,4) field on `coursePurchases` storing the platform's commission percentage applied to the sale (e.g., 0.3000 = 30%). Retrieved via `RevenueTrackingService.getGlobalCommissionRate()` or `getOrganizationCommissionRate()`. |
| **coursePayoutLineItems** | Database table storing per-course breakdown within a payout: `payoutId`, `courseId`, `salesCount`, `grossRevenue`, `platformCommission`, `netAmount`. Provides transparency into how each course contributed to the payout total. |
| **coursePayouts** | Database table storing monthly organization payout records: `organizationId`, `periodStart`, `periodEnd`, `currency`, `grossRevenue`, `platformCommission`, `netAmount`, `exchangeRateSnapshot` (immutable JSONB), `status` (pending/paid/cancelled). |
| **coursePriceHistory** | Audit table tracking every course price change: `courseId`, `oldPrice`, `newPrice`, `currency`, `changedAt`, `changedBy`. Created by `RevenueTrackingService.recordPriceHistory()`. |
| **coursePurchases** | Database table recording all course purchases: `userId`, `courseId`, `courseVersionId`, `checkoutId`, `status` (pending/completed/refunded/failed), `purchasePrice`, `purchaseCurrency`, `exchangeRateUsed`, `commissionRate`, `commissionAmount`, `creatorEarnings`, `receiptPdfPath`. Unique constraint UNQ_user_course_purchase (one purchase per user per course). |
| **courseRefunds** | Database table for refund requests: `purchaseId`, `courseId`, `userId`, `status` (pending/approved/declined/paid), `requestReason`, `completionPercentage`, `eligibilityWindowDays` (default 14). Managed by `CourseRefundService`. |
| **courseReviews** | Database table for course reviews: `courseId`, `userId`, `rating` decimal(3,1) (0.5–5.0), `comment`, `isVisible`, `moderatedBy`, `moderatedAt`. Unique constraint UNQ_user_course_review. Managed by `ReviewService`. |
| **CurrencyService** | Backend service in `server/services/currencyService.ts` handling all currency operations: fetching external rates, automatic updates, manual overrides, conversion calculations, rate snapshots, and staleness checks. Supports ZAR, USD, EUR. |
| **currencyCodeEnum** | PostgreSQL enum defining supported currencies: "ZAR" (South African Rand), "USD" (US Dollar), "EUR" (Euro). Used across `courses`, `coursePurchases`, `coursePayouts`, and related tables. |
| **exchangeRateSnapshot** | Immutable JSONB field on `coursePayouts` and `payoutDisbursements` capturing the exact exchange rates at the time of payout calculation. Includes rates like usdToZar, usdToEur, eurToZar, rateDate, rateSource. Cannot be modified after creation. |
| **exchangeRateUsed** | Decimal(19,8) field on `coursePurchases` storing the exact exchange rate applied during the purchase conversion. Locked at checkout time to prevent rate fluctuation during payment processing. |
| **financialAuditLog** | Database table providing a complete audit trail for all financial events: `eventType`, `entityType`, `entityId`, `userId`, `beforeState`/`afterState` (JSONB), `ipAddress`, `userAgent`. Entries created by payout, rate change, and other financial operations. |
| **intentType** | Field on `paymentIntents` categorizing the payment purpose: "course" (marketplace purchase), "credits" (LP credit purchase), "subscription" (plan subscription), "license" (seat license). Used by `PaymentRouter` to dispatch webhook events. |
| **NotificationService** | Backend service handling email notifications: `sendPurchaseReceiptEmail()` (HTML receipt to buyer) and `sendSalesNotificationToOrgAdmins()` (sales alert to creator org admins). Triggered during webhook fulfillment. |
| **organizationBankingDetails** | Database table storing encrypted banking information for payout processing: `organizationId` (unique), `bankName`, `accountHolderName`, `accountNumber` (ENCRYPTED), `branchCode`, `swiftCode`, `accountType`, `bankAddress`. |
| **PaymentOrchestratorService** | Central payment coordination service in `server/services/paymentOrchestratorService.ts`. Orchestrates checkout creation for courses, credits, subscriptions, and licenses. Handles exchange rate locking and metadata preparation. |
| **PaymentRouter** | Centralized webhook handler in `server/services/paymentRouter.ts`. Dispatches YOCO webhook events by `intentType` to appropriate handlers (course, credit, subscription, refund). Ensures idempotent fulfillment via `paymentFulfillments`. |
| **PayoutProcessorService** | Backend service in `server/services/payoutProcessorService.ts` handling payout batch operations: calculation, creation, marking as paid, cancellation, and PDF invoice generation using PDFKit. |
| **platformPaymentSettings** | Database table storing YOCO gateway configuration: `yocoMode` ("test"/"live"). Controlled by SuperAdmin via `PATCH /api/admin/payment-settings`. |
| **purchaseStatusEnum** | PostgreSQL enum for purchase status: "pending" (checkout created), "completed" (payment confirmed), "refunded" (refund processed), "failed" (payment failed). |
| **PurchaseService** | Backend service in `server/services/purchaseService.ts` managing course purchases: `createPurchase()`, `grantAccess()`, `purchaseUpgrade()`, `getUserPurchases()`, `hasPurchased()`, `revokeAccess()`. Creates purchase records and enrollment entries. |
| **rateSourceEnum** | PostgreSQL enum for exchange rate source: "auto" (fetched from external API) or "manual" (SuperAdmin override). Stored on `currencyConversionRates.source`. |
| **receiptPdfPath** | Text field on `coursePurchases` storing the Object Storage key/path for the purchase receipt PDF. Generated by `PaymentRouter` during fulfillment and stored via the Object Storage service. |
| **ReviewService** | Backend service in `server/services/reviewService.ts` managing course reviews: `createReview()`, `updateReview()`, `moderateReview()`, `checkAllLessonsCompleted()`, `updateCourseRating()`, `getCourseReviews()`, `canReview()`, `getRatingDistribution()`. |
| **STLC** | Software Testing Life Cycle — the systematic process for planning, designing, executing, and evaluating software tests. This document follows STLC methodology. |
| **totalRatings** | Integer field on `courses` storing the count of all visible reviews. Updated by `ReviewService.updateCourseRating()` whenever a review is submitted, updated, or moderated. |
| **userCourseEnrollments** | Database table granting course access to buyers: `userId`, `courseId`, `courseVersionId`, `hasNewerVersion`, `latestVersionId`, `enrolledAt`. Created by `PurchaseService.grantAccess()`. Persists regardless of course status or visibility changes (purchase protection). |
| **visibility** | courseVisibilityEnum field on `courses`: "public" (visible on marketplace, purchasable by anyone) or "org_only" (only visible to members of the owning organization). Controls marketplace listing eligibility. |
| **WebhookDeduplicationService** | Backend service ensuring YOCO webhooks are processed exactly once. Uses `paymentFulfillments` table with a unique constraint on `checkoutId` to prevent duplicate fulfillment. |
| **YOCO** | South African payment gateway integrated via the YOCO Checkout API. Supports credit card payments in ZAR (native). USD/EUR amounts are pre-converted to ZAR before checkout. Operates in "test" or "live" mode controlled by SuperAdmin. |

---

*End of Document*