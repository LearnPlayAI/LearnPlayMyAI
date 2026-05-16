# Demo Issues Report

**Date:** February 2, 2026  
**Context:** Issues identified during live customer demo using published site  
**Analysis Status:** Complete - Expert Approved  
**Implementation Status:** In Progress

---

## Executive Summary

This document catalogs 19 issues discovered during a live demonstration to a potential customer. Each issue includes a description, root cause analysis, affected files, expert-approved solutions, and implementation approach.

---

## Expert-Approved Implementation Plan

### Phase 1: Low-Risk, High-Impact Fixes
**Priority:** Critical | **Risk:** Low | **Dependencies:** None

| Task | Issue | Solution | Files |
|------|-------|----------|-------|
| P1-A | #1 User Profile Data | Fix field mapping (avatarImageUrl, country, bio) | orgRoutes.ts, OrgUserDetail.tsx |
| P1-B | #14 Role Assignment | Change 'employee' → 'learner' for business orgs | storage.ts:3225 |
| P1-C | #7 Reviewer Info | Join users table; add reviewedByUser column | orgRoutes.ts, JoinRequests.tsx |
| P1-D | #8 Cache Invalidation | Add invalidateQueries for hierarchy after approval | JoinRequests.tsx |
| P1-E | #19 Duplicate Numbering | Group warnings by lesson ID; reset index per section | CourseDocumentWizard.tsx |

### Phase 2: Organization Tree & Registration Flow
**Priority:** High | **Risk:** Medium | **Dependencies:** Phase 1

| Task | Issue | Solution | Files |
|------|-------|----------|-------|
| P2-A | #2 Team Members in Tree | Add user nodes under teams with expand-load pattern | orgRoutes.ts, OrgManagementHub.tsx |
| P2-B | #9 Registration Step 3 | Skip structure step for business orgs | OrgRegistrationWizard.tsx |
| P2-C | #6 Subject Selection | Hide subjects for business org join codes | Registration components |

### Phase 3: Public Course Marketplace
**Priority:** High | **Risk:** Medium | **Dependencies:** Phase 1

| Task | Issue | Solution | Files |
|------|-------|----------|-------|
| P3-A | #5 Public Toggle | Add visibility toggle with price field | CourseBuilder.tsx, CourseEdit.tsx, CourseDocumentWizard.tsx |
| P3-B | #3 BrowseCourses | Filter public only; add category filter | BrowseCourses.tsx, courseRoutes.ts |
| P3-C | #4 MyCourses Tab | Rename to "Public Courses"; cross-org query | MyCourses.tsx, courseRoutes.ts |

### Phase 4: AI Generation & Persistence
**Priority:** High | **Risk:** High | **Dependencies:** Phase 1, 2

| Task | Issue | Solution | Files |
|------|-------|----------|-------|
| P4-A | #10 Draft Persistence | Auto-save to DB; resume endpoint | courseFrameworkRoutes.ts, CourseDocumentWizard.tsx |
| P4-B | #13 Gamma Status | Update lesson status on completion; manual refresh | gammaService.ts, jobQueueService.ts, CourseLessons.tsx |
| P4-C | #16 Document Extraction | Review token limits; overlapping chunks | documentExtractionWorker.ts |
| P4-D | #11 Elapsed Timer | Client-side setInterval timer | CourseDocumentWizard.tsx |
| P4-E | #12 Bloom's Async | Parallel requests; optimistic UI | CourseDocumentWizard.tsx, CourseBuilder.tsx |
| P4-F | #17 Feedback Persist | Store in DB; View Last Feedback button | CourseLessons.tsx, courseRoutes.ts |
| P4-G | #18 AI Cost Config | Add pricing fields; display on buttons | PlatformPricing.tsx, CourseLessons.tsx |

### Phase 5: Quiz Explanations
**Priority:** Medium | **Risk:** Low | **Dependencies:** None

| Task | Issue | Solution | Files |
|------|-------|----------|-------|
| P5-A | #15 Explanations | Concise AI prompt; keyword extraction; breadcrumb fix | quizRoutes.ts, quiz components |

---

## Detailed Issue Analysis

### Issue 1: User Profile Data Not Reflected in Central Management Hub

**Category:** Data Synchronization  
**Severity:** High  
**Status:** 🔧 In Progress

#### Description
When a user sets their avatar image, country, and bio in their profile page, these settings are NOT reflected on the user details page when accessed via the Central Management Hub.

#### Root Cause (Expert Verified)
The `OrgUserDetail.tsx` page fetches user data from `/api/organization/:orgId/users/:userId/details`. The API endpoint returns user profile data but:
1. The interface defines `profileImageUrl` but the database field is `avatarImageUrl` - field name mismatch
2. The country field shows currency code ("ZAR") instead of country name - wrong field returned
3. Bio field is not included in the API response or UserProfile interface

#### Expert-Approved Solution
1. Update the API endpoint to include and correctly map:
   - `avatarImageUrl` → `profileImageUrl` (or update interface to match)
   - `country` (the actual country name, not preferredCurrency)
   - `bio` field
2. Update `OrgUserDetail.tsx` UserProfile interface to include `bio`
3. Display avatar using correct field; display country name

#### Affected Files
- `server/routes/orgRoutes.ts` - API endpoint for user details
- `client/src/pages/OrgUserDetail.tsx` - Frontend interface and display

#### Test Cases
- [ ] Avatar image displays correctly in user details
- [ ] Country shows "South Africa" not "ZAR"
- [ ] Bio text displays when present
- [ ] Profile page settings persist to user details view

---

### Issue 2: Team Members Not Displayed in Org Structure Tree

**Category:** UI/Data Display  
**Severity:** High  
**Status:** ⏳ Pending

#### Description
In the Organization Hierarchy tree view, users assigned to teams do NOT appear when expanding the tree structure. However, searching for a user correctly shows the full org path.

#### Root Cause (Expert Verified)
The organization hierarchy API builds tree structure for departments → units → teams but:
1. User nodes are NOT added as children of team nodes
2. Only counts are returned (`directCount`, `totalCount`)
3. Search uses different query that joins users correctly

#### Expert-Approved Solution
1. Modify hierarchy API to include user nodes as children under teams
2. Implement expand-on-demand loading for performance
3. Update `HierarchyNode` interface to support user children
4. Update tree rendering in `OrgManagementHub.tsx`

#### Risk Mitigation
- Use pagination/lazy loading to avoid performance issues with large orgs
- Only load users when team node is expanded

#### Affected Files
- `server/routes/orgRoutes.ts` - Hierarchy endpoint
- `client/src/pages/OrgManagementHub.tsx` - Tree rendering

#### Test Cases
- [ ] Expanding team shows member list
- [ ] Large teams paginate correctly
- [ ] User click navigates to user details
- [ ] Performance acceptable with 100+ users

---

### Issue 3: Browse Courses Page Redesign Required

**Category:** UI/UX Redesign  
**Severity:** Medium  
**Status:** ⏳ Pending

#### Description
The Browse Courses page needs to focus on public courses only, with appropriate filters.

#### Root Cause (Expert Verified)
Current `BrowseCourses.tsx` was designed for internal org course browsing with department/unit filters that don't apply to public marketplace.

#### Expert-Approved Solution
1. Create/modify API to filter: `visibility = 'public'`, `status = 'active'`
2. Remove "All Departments" and "All Units" dropdowns
3. Add "Course Category" dropdown (using `category` field)
4. Keep search bar, "All Levels", "All Progress" filters

#### Affected Files
- `client/src/pages/BrowseCourses.tsx`
- `server/routes/courseRoutes.ts`

#### Test Cases
- [ ] Only public courses displayed
- [ ] Category filter works correctly
- [ ] Search filters by title/description
- [ ] Level filter works

---

### Issue 4: My Courses "Enrolled Courses" Tab Needs Redesign

**Category:** UI/UX Redesign  
**Severity:** Medium  
**Status:** ⏳ Pending

#### Description
"Enrolled Courses" tab needs to be renamed to "Public Courses" with cross-org support.

#### Root Cause (Expert Verified)
Current implementation only shows courses within user's current organization context and doesn't differentiate between assigned and self-enrolled courses.

#### Expert-Approved Solution
1. Rename "Enrolled Courses" → "Public Courses"
2. Create API to fetch public courses enrolled by user across ALL organizations
3. Filter to only show courses where `visibility = 'public'`
4. Remove due date display for public courses

#### Affected Files
- `client/src/pages/MyCourses.tsx`
- `server/routes/courseRoutes.ts`

#### Test Cases
- [ ] Tab displays "Public Courses"
- [ ] Shows courses from any org
- [ ] No due dates on public courses
- [ ] Cross-org enrollment works

---

### Issue 5: Missing Public Course Toggle in Course Creation/Editing

**Category:** Missing Feature  
**Severity:** High  
**Status:** ⏳ Pending

#### Description
No option to set course as public when creating or editing.

#### Root Cause (Expert Verified)
Schema already has `courseVisibilityEnum` ("public", "org_only") and `visibility` field, but:
1. UI does not expose toggle for visibility
2. No price input field when public selected
3. Business orgs restricted from e-learning features

#### Expert-Approved Solution
1. Add "Public Course" toggle in Course Settings
2. When toggled ON:
   - Show price input with currency selector
   - Add "Free Course" checkbox (price = 0)
3. Remove org type restrictions for public courses
4. Update create/update APIs to accept visibility and price

#### Affected Files
- `client/src/pages/CourseBuilder.tsx`
- `client/src/pages/CourseEdit.tsx`
- `client/src/pages/CourseDocumentWizard.tsx`
- `server/routes/courseRoutes.ts`

#### Test Cases
- [ ] Toggle appears in course settings
- [ ] Price field shows when public
- [ ] Free course checkbox works
- [ ] Course saved with correct visibility

---

### Issue 6: Remove Subject Selection from Business Org Registration

**Category:** Registration Flow  
**Severity:** Medium  
**Status:** ⏳ Pending

#### Description
Subject selection appears during business org registration but should only show for education orgs.

#### Root Cause (Expert Verified)
Registration flow reuses same components for all org types without conditional logic.

#### Expert-Approved Solution
1. Detect org type from join code validation response
2. Conditionally hide subject selection when org type is "business"
3. Keep subject selection for "education" org types

#### Affected Files
- Registration components (join code flow)

#### Test Cases
- [ ] Business org join: no subject selection
- [ ] Education org join: subject selection appears
- [ ] Registration completes successfully for both

---

### Issue 7: Missing Reviewer Information on Join Requests

**Category:** Missing Feature  
**Severity:** Low  
**Status:** ⏳ Pending

#### Description
After join request approval/denial, only date shown - not WHO reviewed.

#### Root Cause (Expert Verified)
- `joinRequests` table has `reviewedBy` field (references users.id)
- API response doesn't join with users table
- UI doesn't display reviewer information

#### Expert-Approved Solution
1. Update join request list API to join with users table on `reviewedBy`
2. Return reviewer name (firstName + lastName or gamerName)
3. Add "Reviewed By" column in Approved/Denied tabs

#### Affected Files
- `server/routes/orgRoutes.ts`
- `client/src/pages/JoinRequests.tsx`

#### Test Cases
- [ ] Reviewer name displays in list
- [ ] Shows correct reviewer for each request
- [ ] Handles null reviewer gracefully

---

### Issue 8: Query Invalidation Missing for Join Requests

**Category:** Cache/State Management  
**Severity:** High  
**Status:** ⏳ Pending

#### Description
After approving join requests, Central Management Hub doesn't auto-update.

#### Root Cause (Expert Verified)
Join request approval mutation invalidates join request queries but NOT:
- Organization hierarchy query
- Organization members query
- User list queries

#### Expert-Approved Solution
After join request approval, invalidate these query keys:
- `['/api/organization', orgId, 'hierarchy']`
- `['/api/organization', orgId, 'members']`
- `['/api/organization', orgId, 'users']`

#### Affected Files
- `client/src/pages/JoinRequests.tsx`

#### Test Cases
- [ ] Org tree updates after approval
- [ ] Member list refreshes
- [ ] No manual refresh needed

---

### Issue 9: Remove Org Structure Step from Business Registration

**Category:** Registration Flow  
**Severity:** Medium  
**Status:** ⏳ Pending

#### Description
"Step 3: Structure" should be removed from business registration wizard.

#### Root Cause (Expert Verified)
`OrgRegistrationWizard.tsx` has 4 steps for all org types. Step 3 is hardcoded to appear without conditional logic.

#### Expert-Approved Solution
1. Add conditional logic to check org type from step 2
2. If org type is "business", skip step 3 (go to Review)
3. Update step numbers/progress (3 steps for business, 4 for education)

#### Affected Files
- `client/src/pages/OrgRegistrationWizard.tsx`

#### Test Cases
- [ ] Business reg: 3 steps (no structure)
- [ ] Education reg: 4 steps (includes structure)
- [ ] Progress indicator updates correctly
- [ ] Validation works for both paths

---

### Issue 10: Course Draft Not Saved During AI Generation

**Category:** Data Persistence  
**Severity:** Critical  
**Status:** ⏳ Pending

#### Description
Draft is NOT saved during AI course creation - users cannot return to incomplete courses.

#### Root Cause (Expert Verified)
- Draft state stored in React component state only
- Framework generation triggered but draft not persisted
- Schema has `courseDraftFramework` support but not used
- Navigation away = state lost

#### Expert-Approved Solution
1. Create/update draft save endpoint at each wizard step
2. Auto-save when:
   - Documents uploaded (step 1)
   - Content selected (step 2)
   - Framework generation starts (step 3)
   - Modifications in Review step
3. Add "Continue Draft" option to resume
4. Store with user ID, org ID, timestamp

#### Risk Mitigation
- Implement with feature flag initially
- Use debounced auto-save (500ms)
- Handle conflicts gracefully

#### Affected Files
- `server/routes/courseFrameworkRoutes.ts`
- `client/src/pages/CourseDocumentWizard.tsx`

#### Test Cases
- [ ] Draft saves automatically
- [ ] Draft list shows on course creation page
- [ ] Resume loads correct state
- [ ] Draft deleted after course published

---

### Issue 11: Elapsed Time Updates Too Slowly

**Category:** UX/Feedback  
**Severity:** Low  
**Status:** ⏳ Pending

#### Description
Elapsed time display during framework generation updates too slowly.

#### Root Cause (Expert Verified)
Timer based on server poll interval, not client-side timer.

#### Expert-Approved Solution
1. Implement client-side timer with `setInterval` (1s updates)
2. Start on generation begin, stop on complete
3. Keep server polling for status (can be less frequent)

#### Affected Files
- `client/src/pages/CourseDocumentWizard.tsx`

#### Test Cases
- [ ] Timer updates every second
- [ ] Stops on completion
- [ ] Accurate elapsed time shown

---

### Issue 12: Bloom's Taxonomy Selection Runs Synchronously

**Category:** Performance/UX  
**Severity:** Medium  
**Status:** ⏳ Pending

#### Description
Selecting Bloom's level blocks UI; must wait for each to complete.

#### Root Cause (Expert Verified)
- Handler uses `await` pattern blocking selections
- UI disabled during async operation
- Each selection waits for previous

#### Expert-Approved Solution
1. Make updates async and non-blocking
2. Allow parallel API calls
3. Use optimistic UI updates
4. Show per-lesson loading indicator
5. Debounce rapid selections (300-500ms)

#### Affected Files
- `client/src/pages/CourseDocumentWizard.tsx`
- `client/src/pages/CourseBuilder.tsx`

#### Test Cases
- [ ] Can select multiple levels quickly
- [ ] Loading shows per-lesson
- [ ] UI not blocked
- [ ] All selections applied correctly

---

### Issue 13: Gamma Lesson Generation Stuck on "Generating..."

**Category:** Integration/Status  
**Severity:** Critical  
**Status:** ⏳ Pending

#### Description
Gamma "Generating..." badge never completes even when PPTX created.

#### Root Cause (Expert Verified)
- `gammaService.waitForCompletion` has retry logic for `exportUrl`
- If `exportUrl` delayed, function returns but lesson status not updated
- Lesson database record may not be marked "completed"
- UI polling may not detect status change

#### Expert-Approved Solution
1. Ensure `waitForCompletion` always updates lesson DB on completion
2. Mark lesson "completed" even if `exportUrl` delayed
3. Add fallback: after N retries, mark "completed_pending_export"
4. Improve frontend polling for all completion states
5. Add manual "Refresh Status" button

#### Risk Mitigation
- Use idempotent updates
- Log and alert on timeouts

#### Affected Files
- `server/services/gammaService.ts`
- `server/services/jobQueueService.ts`
- `client/src/pages/CourseLessons.tsx`

#### Test Cases
- [ ] Status updates to completed
- [ ] Manual refresh works
- [ ] exportUrl delay doesn't block
- [ ] No stuck "Generating" lessons

---

### Issue 14: Incorrect Role Assignment After Join

**Category:** User Management  
**Severity:** High  
**Status:** ⏳ Pending

#### Description
Business org users assigned "employee" role instead of "learner".

#### Root Cause (Expert Verified)
In `server/storage.ts` line 3225:
```javascript
const defaultRole = organization?.type === 'education' ? 'student' : 'employee';
```

#### Expert-Approved Solution
Change to:
```javascript
const defaultRole = organization?.type === 'education' ? 'student' : 'learner';
```

Consider migration to update existing "employee" role users.

#### Affected Files
- `server/storage.ts` line 3225

#### Test Cases
- [ ] New business org users get "learner" role
- [ ] Users appear in org hierarchy
- [ ] Education users still get "student"
- [ ] Existing functionality unchanged

---

### Issue 15: Quiz Explanation Feature Issues

**Category:** Feature Regression  
**Severity:** Medium  
**Status:** ⏳ Pending

#### Description
Explanations too long, missing keyword definitions, broken breadcrumbs.

#### Root Cause (Expert Verified)
- AI prompt changed to verbose format
- Keyword extraction/linking removed or broken
- Breadcrumb state not persisting

#### Expert-Approved Solution
1. Update AI prompt for concise explanations (100-150 words)
2. Request structured keyword definitions
3. Restore keyword extraction with clickable definitions
4. Fix breadcrumb navigation state

#### Affected Files
- `server/routes/quizRoutes.ts`
- Quiz explanation components

#### Test Cases
- [ ] Explanations concise and clear
- [ ] Keywords clickable with definitions
- [ ] Breadcrumbs navigate correctly
- [ ] Easy to understand

---

### Issue 16: Large Document Content Lost

**Category:** AI Processing  
**Severity:** Critical  
**Status:** ⏳ Pending

#### Description
5000+ word documents lose content during AI course creation.

#### Root Cause (Expert Verified)
- Token limits may truncate large documents
- Content chunking may not aggregate per topic
- Topic-to-content mapping loses context

#### Expert-Approved Solution
1. Review and increase token limits
2. Implement chunking with overlap
3. Improve topic-to-content mapping
4. Pre-validate content coverage
5. Show word count per topic in UI

#### Risk Mitigation
- Monitor memory usage
- Consider cost implications
- Implement progressively

#### Affected Files
- `server/workers/documentExtractionWorker.ts`
- `server/routes/courseFrameworkRoutes.ts`

#### Test Cases
- [ ] Large documents processed fully
- [ ] Content preserved per topic
- [ ] Word counts accurate
- [ ] No truncation warnings

---

### Issue 17: Feedback Report Not Accessible

**Category:** UX  
**Severity:** Medium  
**Status:** ⏳ Pending

#### Description
After closing feedback modal, no way to view feedback again.

#### Root Cause (Expert Verified)
- Feedback stored in transient React state
- Closing modal clears state
- No persistence or reopen UI

#### Expert-Approved Solution
1. Store feedback per lesson in database
2. Add "View Last Feedback" button
3. Show feedback history with timestamps

#### Affected Files
- `client/src/pages/CourseDocumentWizard.tsx`
- `client/src/pages/CourseLessons.tsx`
- `server/routes/courseRoutes.ts`

#### Test Cases
- [ ] Feedback persists after close
- [ ] View Last Feedback works
- [ ] History shows correctly

---

### Issue 18: "Generate with AI" Missing Cost

**Category:** Pricing/Credits  
**Severity:** Medium  
**Status:** ⏳ Pending

#### Description
AI generation buttons don't show LPC cost; no admin config.

#### Root Cause (Expert Verified)
- Platform pricing page missing AI cost config
- Buttons don't fetch/display cost
- Credit deduction may not be implemented

#### Expert-Approved Solution
1. Add pricing config fields:
   - `aiContentGenerationCost`
   - `aiFixCost`
2. Fetch and display cost on buttons
3. Implement credit check before action

#### Affected Files
- `client/src/pages/PlatformPricing.tsx`
- `client/src/pages/CourseLessons.tsx`

#### Test Cases
- [ ] Admin can set AI costs
- [ ] Cost displays on buttons
- [ ] Credits deducted correctly
- [ ] Insufficient credits shows error

---

### Issue 19: Recommendations Modal Issues

**Category:** AI Processing/UX  
**Severity:** High  
**Status:** ⏳ Pending

#### Description
Duplicate lesson numbers; questionable content warnings; possible hallucination.

#### Root Cause (Expert Verified)
- Lesson numbering from flat array index with duplicates
- Multiple warnings per lesson create duplicate entries
- No word count per topic validation

#### Expert-Approved Solution
1. Fix numbering: group warnings by lesson ID
2. Show word count per topic in "Select Content" step
3. Allow deselecting low-content topics
4. Add AI grounding validation

#### Affected Files
- `client/src/pages/CourseDocumentWizard.tsx`

#### Test Cases
- [ ] No duplicate lesson numbers
- [ ] Word counts display
- [ ] Topics can be deselected
- [ ] Content warnings accurate

---

## Risk Assessment

### Low Risk Changes
- Issue 14: Single line change, well-defined
- Issue 7: Additive - new column only
- Issue 8: Additive - cache invalidation
- Issue 11: Client-side only
- Issue 19: UI numbering fix

### Medium Risk Changes
- Issue 1: API response shape change
- Issue 5: New UI controls + API updates
- Issue 6/9: Wizard flow changes
- Issue 12: Async pattern changes

### High Risk Changes
- Issue 2: Tree structure changes + performance
- Issue 10: New persistence layer
- Issue 13: Integration status handling
- Issue 16: Document processing changes

---

## Regression Prevention

### Critical Paths to Test
1. User registration flow (all org types)
2. Join request approval/denial
3. Course creation (AI and manual)
4. Lesson generation with Gamma
5. Quiz gameplay and explanations
6. Organization hierarchy display
7. User profile management

### Automated Test Requirements
- Unit tests for all API changes
- Integration tests for workflows
- E2E tests for critical paths

---

*Last Updated: February 2, 2026*  
*Expert Analysis: Approved*  
*Implementation: In Progress*
