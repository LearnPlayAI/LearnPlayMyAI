# Public Course Marketplace - Changes & Test Scenarios

**Date:** February 2, 2026  
**Session Summary:** Comprehensive public course marketplace implementation with gamification isolation, General org support, and certificate enhancements.

---

## Table of Contents
1. [Summary of Changes](#summary-of-changes)
2. [Test Scenarios](#test-scenarios)
   - [1. Gamification Org Isolation](#1-gamification-org-isolation)
   - [2. Quiz Explanation Error Handling](#2-quiz-explanation-error-handling)
   - [3. Challenge Progress Updates](#3-challenge-progress-updates)
   - [4. General Org Registration](#4-general-org-registration)
   - [5. Public Course Certificates](#5-public-course-certificates)
   - [6. Category Creation & Course Save](#6-category-creation--course-save)
   - [7. Purchase Button Logic](#7-purchase-button-logic)
   - [8. Browse Marketplace Link](#8-browse-marketplace-link)
   - [9. Org-Level Course Assignments](#9-org-level-course-assignments)
   - [10. Platform Pricing Database Fix](#10-platform-pricing-database-fix)

---

## Summary of Changes

### 1. Gamification Org Isolation (Tasks 1a-1b)
**Files Modified:**
- `server/routes/gamificationRoutes.ts`

**Changes:**
- Added `withSessionAuthMiddleware` to all gamification routes requiring authentication
- Leaderboard queries now filter by user's `organizationId` by default
- SuperAdmin can only see cross-org data when explicit `crossOrg=true` flag is passed
- Challenges, cosmetics, and achievements are now scoped to user's organization

---

### 2. Quiz Explanation Error Handling (Tasks 2a-2b)
**Files Modified:**
- `client/src/components/ExplanationModal.tsx`

**Changes:**
- Added specific error messages based on HTTP status codes:
  - 401: "Login Required" with Login button
  - 402: "Insufficient Credits" with Buy Credits button
  - 403: "Organization Required" message
- Added "Generate Explanation" button when no explanation exists yet
- Added "Try Again" button for generic errors
- Improved visual feedback with AlertCircle, LogIn, Coins icons

---

### 3. Challenge Progress Updates (Tasks 3a-3b)
**Files Modified:**
- `server/services/lessonProgressService.ts`
- `server/gameEngine.ts`
- `shared/challengeConstants.ts`
- `client/src/pages/GamificationSettings.tsx`

**Changes:**
- Added `LESSON_COMPLETIONS` and `BATTLE_WINS` goal types to challenge constants
- Lesson completions now trigger challenge progress update in `finalizeCompletion()`
- Battle game wins trigger challenge progress update in `finishGame()`
- Admin UI updated to allow creating challenges with new goal types

---

### 4. General Org Registration (Tasks 4a-4b)
**Files Modified:**
- `shared/schema.ts` - Added `isGeneralOrg` column to organizations table
- `server/usageLimitMiddleware.ts` - Added General org check to `isOrgUnlimited()`
- `server/services/seatPolicyService.ts` - Added `general_org` reason type and exemption logic

**Database Changes:**
- Added `isGeneralOrg` boolean column to organizations table
- Set `isGeneralOrg = true` for existing General Org (ID: `08b8b57e-4c4f-4c04-ac0b-c411b6c873a8`)

**Behavior:**
- Users registering WITHOUT a join code are auto-assigned to General Org
- General Org users get auto-approval (no pending join request)
- General Org is exempt from all subscription/seat limits
- Existing join code registration flow remains unchanged

---

### 5. Public Course Certificates (Task 4c)
**Files Modified:**
- `server/services/certificateService.ts`

**Changes:**
- Certificate generation for PUBLIC courses now includes creator organization name
- Added "Created by [Organization Name]" section on certificate PDF
- General Org users receive platform default branding (LearnPlay theme)
- Other org users receive the course creator's organization branding

---

### 6. Category Creation & Course Save (Tasks 5a-5b)
**Files Modified:**
- `client/src/pages/CourseEdit.tsx`

**Changes:**
- Fixed category creation toast to correctly read `response.category.name` instead of `response.name`
- Fixed `setSelectedCategoryId(data.category.id)` to correctly set the new category
- Added `queryClient.invalidateQueries({ queryKey: ['/api/courses/categories'] })` for cache invalidation
- Verified course save includes `price`, `currency`, `categoryId` in payload

---

### 7. Purchase Button Logic (Task 5c)
**Files Modified:**
- `client/src/pages/CourseDetail.tsx`

**Changes:**
- Added computed `hasAccess` logic that varies by course visibility:
  - **Public courses:** `hasAccess = hasPurchased` (based on purchase status)
  - **Org-only courses:** `hasAccess = isAssigned` (based on assignment)
- Purchase button now correctly shows "Purchase" for unpurchased public courses
- "Continue Learning" only shows after purchase is complete

---

### 8. Browse Marketplace Link (Task 6)
**Files Modified:**
- `client/src/pages/landing.jsx`

**Changes:**
- Added "Browse Marketplace" link with Store icon to desktop dropdown menu
- Added matching link to mobile menu for responsive support
- Link navigates to `/browse-courses`

---

### 9. Org-Level Course Assignments (Task 7)
**Files Modified:**
- `server/services/courseAssignmentService.ts`

**Changes:**
- Updated `getCourseAssignmentsForUser` method to include organization-scope assignments
- Added condition: `WHERE organizationId = :orgId AND assignmentScope = 'organization'`
- Results merged with existing department/unit/team assignment queries
- Deduplication handled by caller using `seenCourseIds` Set

---

### 10. Platform Pricing Database Fix (Task 10)
**Database Changes:**
- Added 3 missing columns to `platformPricing` table:
  - `creditsPerLessonGeneration` (INTEGER, DEFAULT 50)
  - `creditsPerAiFix` (INTEGER, DEFAULT 10)
  - `creditsPerQuizGeneration` (INTEGER, DEFAULT 15)

---

## Test Scenarios

### 1. Gamification Org Isolation

#### Test 1.1: Leaderboard Org Scoping
**Objective:** Verify leaderboard only shows users from the same organization.

**Test Steps:**
1. Log in as a user in Organization A
2. Navigate to Leaderboard page
3. Verify only users from Organization A appear
4. Log in as a different user in Organization B
5. Navigate to Leaderboard page
6. Verify only users from Organization B appear
7. Confirm no cross-org data leakage

**Expected Result:** Each organization's leaderboard is completely isolated.

#### Test 1.2: SuperAdmin Cross-Org Access
**Objective:** Verify SuperAdmin can only see cross-org data with explicit flag.

**Test Steps:**
1. Log in as SuperAdmin
2. Navigate to Leaderboard page (normal view)
3. Verify leaderboard shows org-scoped data (not all orgs)
4. If there's a "View All Organizations" toggle, enable it
5. Verify all organizations' data now appears

**Expected Result:** SuperAdmin sees org-scoped data by default; cross-org requires explicit action.

#### Test 1.3: Challenges Org Isolation
**Objective:** Verify challenges are scoped to user's organization.

**Test Steps:**
1. Log in as a user in Organization A
2. Navigate to Challenges page
3. Complete a challenge
4. Log in as a different user in Organization B
5. Verify Organization B user cannot see Organization A's challenge progress

**Expected Result:** Challenge progress is completely isolated per organization.

---

### 2. Quiz Explanation Error Handling

#### Test 2.1: Unauthenticated User Error
**Objective:** Verify proper error message for unauthenticated users.

**Test Steps:**
1. Open the app without logging in
2. Navigate to a public quiz (if accessible)
3. Attempt to view an explanation
4. Verify "Login Required" message appears with Login button
5. Click Login button
6. Verify redirect to login page

**Expected Result:** Clear "Login Required" message with actionable Login button.

#### Test 2.2: Insufficient Credits Error
**Objective:** Verify proper error message when user has no credits.

**Test Steps:**
1. Log in as a user with 0 LP Credits
2. Take a quiz
3. Submit an answer
4. Click to view explanation (if it charges credits)
5. Verify "Insufficient Credits" message appears with Buy Credits button
6. Click Buy Credits button
7. Verify redirect to credits purchase page

**Expected Result:** Clear "Insufficient Credits" message with actionable Buy Credits button.

#### Test 2.3: Generate Explanation Button
**Objective:** Verify "Generate Explanation" button appears when none exists.

**Test Steps:**
1. Log in as a user with sufficient credits
2. Take a quiz with a question that has no pre-generated explanation
3. Submit an answer
4. Click to view explanation
5. Verify "Generate Explanation" button appears
6. Click the button
7. Verify explanation is generated and displayed

**Expected Result:** User can generate explanations on-demand.

---

### 3. Challenge Progress Updates

#### Test 3.1: Lesson Completion Challenge
**Objective:** Verify lesson completions update challenge progress.

**Test Steps:**
1. Log in as an admin
2. Navigate to Gamification Settings
3. Create a new challenge with goal type "Lesson Completions" (target: 2)
4. Save and activate the challenge
5. Log in as a learner
6. Complete Lesson 1
7. Navigate to Challenges page
8. Verify challenge progress shows 1/2
9. Complete Lesson 2
10. Verify challenge progress shows 2/2 (completed)

**Expected Result:** Challenge progress increments with each lesson completion.

#### Test 3.2: Battle Wins Challenge
**Objective:** Verify battle wins update challenge progress.

**Test Steps:**
1. Log in as an admin
2. Create a new challenge with goal type "Battle Wins" (target: 1)
3. Activate the challenge
4. Log in as Learner A
5. Start a battle card game
6. Win the game
7. Navigate to Challenges page
8. Verify challenge progress shows 1/1 (completed)

**Expected Result:** Challenge progress increments when user wins a battle.

---

### 4. General Org Registration

#### Test 4.1: Registration Without Join Code
**Objective:** Verify users without join code are auto-assigned to General Org.

**Test Steps:**
1. Open registration page
2. Fill in user details (email, password, name)
3. Leave Join Code field empty
4. Submit registration
5. Log in with new account
6. Navigate to Profile or Organization settings
7. Verify user is assigned to "General Org"
8. Verify user status is "Active" (not pending approval)

**Expected Result:** User is immediately active in General Org without approval needed.

#### Test 4.2: Registration With Join Code (Unchanged)
**Objective:** Verify join code registration still works as before.

**Test Steps:**
1. Open registration page
2. Fill in user details
3. Enter a valid join code for Organization A
4. Submit registration
5. Verify join request is created (pending approval)
6. Log in as Organization A admin
7. Approve the join request
8. Log in as the new user
9. Verify user is now part of Organization A

**Expected Result:** Join code registration flow remains unchanged.

#### Test 4.3: General Org Subscription Exemption
**Objective:** Verify General Org is exempt from subscription limits.

**Test Steps:**
1. Log in as a user in General Org
2. Attempt to use features that normally require subscription:
   - Create quizzes (if limited)
   - Generate AI content (if limited)
   - Access premium features
3. Verify no subscription/trial expiration errors appear
4. Verify no seat limit errors appear

**Expected Result:** General Org users bypass all subscription and seat limits.

---

### 5. Public Course Certificates

#### Test 5.1: Public Course Certificate Shows Creator Org
**Objective:** Verify public course certificates display the creator's organization name.

**Test Steps:**
1. Log in as a course creator in "ABC Academy"
2. Create a public course
3. Set course to Active
4. Log in as a learner (different org or General Org)
5. Purchase the public course
6. Complete all lessons and quizzes
7. Generate/download the completion certificate
8. Verify certificate shows "Created by ABC Academy"

**Expected Result:** Certificate includes course creator's organization name.

#### Test 5.2: General Org User Certificate Branding
**Objective:** Verify General Org users receive platform default branding.

**Test Steps:**
1. Log in as a General Org user
2. Complete a public course
3. Generate/download the completion certificate
4. Verify certificate uses LearnPlay platform branding (not a specific org's branding)
5. Compare with a certificate from a regular org user
6. Verify General Org certificate has platform default colors/logo

**Expected Result:** General Org certificates use platform default theme.

---

### 6. Category Creation & Course Save

#### Test 6.1: Create New Category
**Objective:** Verify category creation shows correct toast and updates dropdown.

**Test Steps:**
1. Log in as a course creator
2. Navigate to Course Edit page
3. Open Category dropdown
4. Click "Create New Category" (or similar)
5. Enter category name: "Test Category XYZ"
6. Submit
7. Verify toast shows "Created category: Test Category XYZ"
8. Verify dropdown now includes "Test Category XYZ"
9. Verify "Test Category XYZ" is automatically selected

**Expected Result:** Toast shows correct category name; dropdown updates immediately.

#### Test 6.2: Course Save With Price and Category
**Objective:** Verify course saves price, currency, and category correctly.

**Test Steps:**
1. Log in as a course creator
2. Create or edit a public course
3. Set visibility to "Public"
4. Set price to 99.99
5. Set currency to ZAR
6. Select a category
7. Save the course
8. Refresh the page
9. Verify price shows 99.99
10. Verify currency shows ZAR
11. Verify category is correctly selected
12. Navigate to Browse Marketplace
13. Verify course appears with correct price and category

**Expected Result:** All course fields persist correctly after save.

---

### 7. Purchase Button Logic

#### Test 7.1: Unpurchased Public Course Shows "Purchase"
**Objective:** Verify unpurchased public courses show Purchase button.

**Test Steps:**
1. Log in as a learner who has NOT purchased any courses
2. Navigate to Browse Marketplace
3. Click on a paid public course
4. Verify "Purchase" button is displayed (not "Continue Learning")
5. Verify price is shown correctly
6. Click Purchase
7. Complete payment flow
8. Verify button now shows "Continue Learning"

**Expected Result:** Purchase button shown for unpurchased courses; Continue Learning after purchase.

#### Test 7.2: Org-Only Course Access (Unchanged)
**Objective:** Verify org-only courses use assignment-based access.

**Test Steps:**
1. Log in as an org admin
2. Create an org-only course
3. Assign the course to a user
4. Log in as the assigned user
5. Navigate to My Courses
6. Verify the course appears
7. Click on the course
8. Verify "Continue Learning" button appears (based on assignment, not purchase)

**Expected Result:** Org-only courses grant access based on assignment.

---

### 8. Browse Marketplace Link

#### Test 8.1: Landing Page Dropdown Has Marketplace Link
**Objective:** Verify "Browse Marketplace" link appears in landing page dropdown.

**Test Steps:**
1. Log in as any user
2. Navigate to the landing/home page
3. Click on user dropdown (top-right menu)
4. Verify "Browse Marketplace" option is visible
5. Click "Browse Marketplace"
6. Verify redirect to `/browse-courses` page
7. Verify marketplace page loads correctly

**Expected Result:** Browse Marketplace link is accessible from landing page dropdown.

#### Test 8.2: Mobile Menu Has Marketplace Link
**Objective:** Verify mobile menu includes Browse Marketplace.

**Test Steps:**
1. Open the app on mobile (or resize browser to mobile width)
2. Log in as any user
3. Open the mobile menu (hamburger icon)
4. Verify "Browse Marketplace" option is visible
5. Tap "Browse Marketplace"
6. Verify redirect to marketplace page

**Expected Result:** Mobile users can access Browse Marketplace.

---

### 9. Org-Level Course Assignments

#### Test 9.1: Organization-Scope Assignment Appears in My Courses
**Objective:** Verify courses assigned at organization level appear for all org members.

**Test Steps:**
1. Log in as an org admin
2. Create a course
3. Navigate to Course Assignment
4. Assign the course to the entire organization (scope = "Organization")
5. Save assignment
6. Log in as a learner in that organization
7. Navigate to My Courses
8. Verify the organization-assigned course appears
9. Log in as a different learner in the same org
10. Verify the course also appears for them

**Expected Result:** All organization members see organization-scope assigned courses.

#### Test 9.2: Multiple Assignment Levels
**Objective:** Verify courses assigned at multiple levels don't duplicate.

**Test Steps:**
1. Log in as org admin
2. Assign Course A at organization level
3. Also assign Course A to a specific department
4. Log in as a user in that department
5. Navigate to My Courses
6. Verify Course A appears only ONCE (not duplicated)

**Expected Result:** Courses appear once even if assigned at multiple hierarchy levels.

---

### 10. Platform Pricing Database Fix

#### Test 10.1: SuperAdmin Platform Pricing Page Loads
**Objective:** Verify Platform Pricing page loads without errors.

**Test Steps:**
1. Log in as SuperAdmin
2. Navigate to Admin Dashboard
3. Click on "Platform Pricing" or similar menu item
4. Verify page loads without errors
5. Verify all pricing settings are displayed:
   - Credits per Lesson Generation
   - Credits per AI Fix
   - Credits per Quiz Generation
   - Other pricing fields
6. Check browser console for any errors
7. Verify no "column does not exist" errors

**Expected Result:** Platform Pricing page loads and displays all fields correctly.

#### Test 10.2: Update Platform Pricing Settings
**Objective:** Verify pricing settings can be updated.

**Test Steps:**
1. Log in as SuperAdmin
2. Navigate to Platform Pricing page
3. Change "Credits per Lesson Generation" to a new value (e.g., 75)
4. Save changes
5. Refresh the page
6. Verify new value persists
7. Test that the new pricing is applied when generating a lesson

**Expected Result:** Platform pricing settings can be saved and take effect.

---

## Regression Testing Checklist

After testing the new features, perform these regression tests to ensure existing functionality still works:

### Authentication & Authorization
- [ ] User login works
- [ ] User registration works
- [ ] Password reset works
- [ ] Session management works
- [ ] Role-based access control works

### Course Management
- [ ] Create course works
- [ ] Edit course works
- [ ] Delete course works
- [ ] Course visibility (public/org-only) works
- [ ] Course assignment wizard works

### Quiz System
- [ ] Create quiz works
- [ ] Take quiz works
- [ ] Quiz scoring works
- [ ] Quiz results display correctly
- [ ] AI quiz generation works

### Gamification
- [ ] XP earning works
- [ ] Leveling up works
- [ ] Achievements unlock correctly
- [ ] Season pass progression works
- [ ] Cosmetics can be equipped

### E-Learning Marketplace
- [ ] Browse courses works
- [ ] Course purchase flow works
- [ ] Course enrollment works
- [ ] Reviews can be submitted
- [ ] Payouts display correctly

### AI Features
- [ ] AI lesson generation works
- [ ] AI quiz generation works
- [ ] AI explanations work
- [ ] AI content coach works

### Organization Management
- [ ] Create organization works
- [ ] Department/Unit/Team hierarchy works
- [ ] User management works
- [ ] Join code generation works
- [ ] Subscription management works

---

## Notes

- **Pre-existing Issues:** There are 18 LSP diagnostics in `server/routes/adminRoutes.ts` that existed before this session. These are unrelated to the changes made and should be addressed in a separate maintenance task.

- **Database Migrations:** The `isGeneralOrg` column and platform pricing columns were added directly via SQL ALTER TABLE commands. These changes are now in production but are not captured in Drizzle migration files.

- **General Org ID:** The General Org has ID `08b8b57e-4c4f-4c04-ac0b-c411b6c873a8`. This should not be changed.

---

*Document created: February 2, 2026*
