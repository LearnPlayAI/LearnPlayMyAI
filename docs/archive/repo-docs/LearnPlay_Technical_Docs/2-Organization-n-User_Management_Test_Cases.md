# Organization & User Management — Test Cases Document

**Document Version:** 1.0  
**Date:** February 6, 2026  
**Module Under Test:** Organization & User Management (LESSON 4)  
**Methodology:** STLC-Aligned (Software Testing Life Cycle)  
**Requirements Source:** LESSON 4 — Organization & User Management (8 Slides)  
**Technical Reference:** [`TECHNICAL_AUDIT.md`](./TECHNICAL_AUDIT.md) — Phase 1 Technical Stocktake  
**Author:** QA Engineering Team  

---

## Table of Contents

1. [Document Purpose & Scope](#1-document-purpose--scope)
2. [Test Environment & Prerequisites](#2-test-environment--prerequisites)
3. [Phase 1: Technical Stocktake — Feature-to-Code Mapping](#3-phase-1-technical-stocktake--feature-to-code-mapping)
   - 3.1 [Slide 1 — Title / Overview ("Your Organization, Your Way")](#31-slide-1--title--overview-your-organization-your-way)
   - 3.2 [Slide 2 — Self-Service Registration (Smart Join Codes, Easy Onboarding)](#32-slide-2--self-service-registration-smart-join-codes-easy-onboarding)
   - 3.3 [Slide 3 — 3-Level Hierarchy (Departments → Units → Teams)](#33-slide-3--3-level-hierarchy-departments--units--teams)
   - 3.4 [Slide 4 — Organization Management Hub (Drag-and-Drop User Management)](#34-slide-4--organization-management-hub-drag-and-drop-user-management)
   - 3.5 [Slide 5 — Role-Based Access (Right Access for the Right People)](#35-slide-5--role-based-access-right-access-for-the-right-people)
   - 3.6 [Slide 6 — Join Request Workflow (Approve or Reject New Member Requests)](#36-slide-6--join-request-workflow-approve-or-reject-new-member-requests)
   - 3.7 [Slide 7 — User Profiles (Track Individual Progress and Achievements)](#37-slide-7--user-profiles-track-individual-progress-and-achievements)
   - 3.8 [Slide 8 — Audit Trails (Complete Visibility into Platform Activities)](#38-slide-8--audit-trails-complete-visibility-into-platform-activities)
4. [Phase 2: Master Test Documentation](#4-phase-2-master-test-documentation)
   - 4.1 [Self-Service Registration Tests (Slide 2)](#41-self-service-registration-tests-slide-2)
   - 4.2 [3-Level Hierarchy Tests (Slide 3)](#42-3-level-hierarchy-tests-slide-3)
   - 4.3 [Organization Management Hub Tests (Slide 4)](#43-organization-management-hub-tests-slide-4)
   - 4.4 [Role-Based Access Control Tests (Slide 5)](#44-role-based-access-control-tests-slide-5)
   - 4.5 [Join Request Workflow Tests (Slide 6)](#45-join-request-workflow-tests-slide-6)
   - 4.6 [User Profile Tests (Slide 7)](#46-user-profile-tests-slide-7)
   - 4.7 [Audit Trail Tests (Slide 8)](#47-audit-trail-tests-slide-8)
5. [Traceability Matrix](#5-traceability-matrix)
6. [Glossary](#6-glossary)

---

## 1. Document Purpose & Scope

This document provides a comprehensive, tester-friendly test case suite for the **Organization & User Management** module of the LearnPlay e-learning platform. It is derived from the functional requirements outlined in "LESSON 4: Organization & User Management" (8 slides) and mapped directly to the verified codebase implementation as documented in [`TECHNICAL_AUDIT.md`](./TECHNICAL_AUDIT.md).

**In Scope:**
- Self-Service Registration with multi-level join codes (organization, department, unit, team)
- 3-Level Organizational Hierarchy management (Departments → Units → Teams)
- Organization Management Hub with drag-and-drop user management
- Role-Based Access Control (org_admin, teacher, team_lead, student, employee)
- Join Request Workflow (approve, deny, bulk operations, email-based approval)
- User Profiles and progress tracking (XP, certificates, course progress)
- Audit Trails (financial audit logs, join request audit, license flag audit)

**Out of Scope:**
- AI-powered course creation, gamification, marketplace, payments
- Infrastructure and deployment testing
- Performance and load testing (separate document)

**Implementation Gaps Identified:**
1. **Invitation Workflows** — Slide 2 references "administrators can send direct invitations to specific email addresses." This feature is **MISSING IN IMPLEMENTATION**. The system uses join codes and email-based approval links instead of direct email invitations.
2. **Comprehensive Audit Trails** — Slide 8 describes complete visibility into all platform activities. The implementation is **PARTIALLY IMPLEMENTED** — specific audit tables exist for financial events (`financialAuditLog`), license flag changes (`licenseFlagAudit`), and immutable financial records (`platformFinancialAuditLog`), but there is no unified "all platform activities" audit log that tracks user creation, role changes, course assignments, and all admin actions as a single audit stream.

---

## 2. Test Environment & Prerequisites

### 2.1 Required User Roles

| Role | Purpose | Access Level |
|------|---------|-------------|
| **SuperAdmin** | Platform-wide administration, audit log access, role management | All features |
| **OrgAdmin** | Organization-level management, user management, join request approval | Organization-scoped |
| **Teacher / Instructor** | Org management hub access, student oversight | Organization-scoped |
| **Team Lead** | Team-level management | Team-scoped |
| **Student / Learner** | Registration, profile access, course consumption | Read-only access |

### 2.2 Pre-requisites for All Tests

1. Active user session (logged in with appropriate role)
2. At least one active organization exists in the system (education, business, or elearning type)
3. Organization has a valid `inviteCode` (join code)
4. Database is accessible and migration is current
5. Email service (MailerSend) is configured for notification tests
6. General Organization exists for no-code registration tests

### 2.3 Test Data Requirements

| Item | Description |
|------|-------------|
| Organization (Education type) | An active education org with departments (Grades), units (Classes), and teams (Sections) |
| Organization (Business type) | An active business org with Departments, Units, and Teams |
| Organization (E-learning type) | An active elearning org with Courses, Modules, and Cohorts |
| Join Codes | Valid join codes at each level: organization, department, unit, team |
| Test Users | At least 5 test user accounts with varying roles (SuperAdmin, OrgAdmin, Teacher, Student, Employee) |
| Invalid Join Code | A string that does not match any existing join code |
| Completed Courses | At least one user with completed course progress and certificates for profile testing |

---

## 3. Phase 1: Technical Stocktake — Feature-to-Code Mapping

This section maps each requirement slide to the actual codebase implementation, linking feature descriptions to database tables, API endpoints, backend services, and frontend components.

---

### 3.1 Slide 1 — Title / Overview ("Your Organization, Your Way")

**Requirement:** Overview slide introducing flexible organization management — "Your Organization, Your Way."

**Assessment:** This is a title slide providing context. No discrete testable features. The capabilities described are validated through Slides 2–8.

| Requirement | Implementation Status |
|-------------|----------------------|
| Flexible organization management | Implemented across hierarchy, roles, join codes, and management hub (Slides 2–8) |

---

### 3.2 Slide 2 — Self-Service Registration (Smart Join Codes, Easy Onboarding)

**Requirement:** Smart join codes for self-service registration, multi-level code validation (organization, department, unit, team), easy onboarding, direct email invitations by administrators.

| Feature | DB Tables | API Endpoints | Services/Logic | Frontend Components | Status |
|---------|-----------|---------------|----------------|---------------------|--------|
| Organization-level join code registration | `organizations.inviteCode`, `joinRequests` (status: pending) | `POST /api/auth/register` (with `organizationCode`) | `authRoutes.ts` — validates org code, creates joinRequest | `register.jsx` | **Implemented** |
| Department-level join code (auto-placement) | `organizationUnits.joinCode`, `joinRequests.requestedUnitId` | `POST /api/auth/register` (code resolves to unit) | `authRoutes.ts` — cascading code validation at unit level | `register.jsx` | **Implemented** |
| Unit/SubUnit-level join code (auto-placement) | `organizationSubUnits.joinCode`, `joinRequests.requestedSubUnitId` | `POST /api/auth/register` (code resolves to subunit) | `authRoutes.ts` — cascading code validation at subunit level | `register.jsx` | **Implemented** |
| Team-level join code (auto-placement) | `organizationTeams.joinCode`, `joinRequests.requestedTeamId` | `POST /api/auth/register` (code resolves to team) | `authRoutes.ts` — cascading code validation at team level | `register.jsx` | **Implemented** |
| Join code validation (pre-registration check) | `organizations`, `organizationUnits`, `organizationSubUnits`, `organizationTeams` | `GET /api/auth/validate-join-code?code=X` | `authRoutes.ts` — returns type, level, org info, terminology | `register.jsx` | **Implemented** |
| General Org auto-enrollment (no code) | `organizations` (isGeneralOrg), `joinRequests` (auto-approved) | `POST /api/auth/register` (no organizationCode) | `authRoutes.ts` — auto-enrolls to General Org | `register.jsx` | **Implemented** |
| Email verification on registration | `users.emailVerified` | `POST /api/auth/register` | `emailVerificationService.ts` | `verify-email.tsx` | **Implemented** |
| Admin notification of new join request | `joinRequests` | Triggered internally on registration | `joinRequestApprovalService.ts` (`notifyAdminsOfJoinRequest`) | N/A (email-based) | **Implemented** |
| Direct email invitations by admin | — | — | — | — | **MISSING** — No `/api/invite` endpoint exists. System uses join codes + email notification on approval instead. |

---

### 3.3 Slide 3 — 3-Level Hierarchy (Departments → Units → Teams)

**Requirement:** Three-level organizational hierarchy: Departments (Level 1) → Units (Level 2) → Teams (Level 3), with terminology adapting to organization type.

| Feature | DB Tables | API Endpoints | Services/Logic | Frontend Components | Status |
|---------|-----------|---------------|----------------|---------------------|--------|
| Create Department (Level 1) | `organizationUnits` (id, organizationId, name, displayOrder, joinCode, isActive) | `POST /api/organization/:organizationId/departments` | `orgRoutes.ts` — auto-generates joinCode via `generateDepartmentCode()` | `OrgManagementHub.tsx` | **Implemented** |
| Update Department | `organizationUnits` | `PATCH /api/organization/:organizationId/departments/:departmentId` | `orgRoutes.ts` | `OrgManagementHub.tsx` | **Implemented** |
| Delete Department | `organizationUnits` | `DELETE /api/organization/:organizationId/departments/:departmentId` | `orgRoutes.ts` | `OrgManagementHub.tsx` | **Implemented** |
| Create Unit (Level 2) | `organizationSubUnits` (id, unitId FK→organizationUnits, name, displayOrder, joinCode, isActive) | `POST /api/organization/:organizationId/departments/:departmentId/units` | `orgRoutes.ts` — auto-generates joinCode via `generateUnitCode()` | `OrgManagementHub.tsx` | **Implemented** |
| Update Unit | `organizationSubUnits` | `PATCH /api/organization/:organizationId/units/:unitId` | `orgRoutes.ts` | `OrgManagementHub.tsx` | **Implemented** |
| Delete Unit | `organizationSubUnits` | `DELETE /api/organization/:organizationId/units/:unitId` | `orgRoutes.ts` | `OrgManagementHub.tsx` | **Implemented** |
| Create Team (Level 3) | `organizationTeams` (id, subUnitId FK→organizationSubUnits, name, displayOrder, joinCode, isActive) | `POST /api/organization/:organizationId/units/:unitId/teams` | `orgRoutes.ts` — auto-generates joinCode via `generateTeamCode()` | `OrgManagementHub.tsx` | **Implemented** |
| Update Team | `organizationTeams` | `PATCH /api/organization/:organizationId/teams/:teamId` | `orgRoutes.ts` | `OrgManagementHub.tsx` | **Implemented** |
| Delete Team | `organizationTeams` | `DELETE /api/organization/:organizationId/teams/:teamId` | `orgRoutes.ts` | `OrgManagementHub.tsx` | **Implemented** |
| Full hierarchy tree view | `organizationUnits`, `organizationSubUnits`, `organizationTeams`, `userOrganizationAssignments` | `GET /api/organization/hierarchy/:organizationId` | `orgRoutes.ts` — builds tree with directCount, totalCount per node | `OrgManagementHub.tsx` (collapsible tree) | **Implemented** |
| Adaptive terminology | `organizations.type` (education/business/elearning) | `GET /api/auth/validate-join-code` (returns terminology) | `authRoutes.ts` (`getTerminologyForOrgType`) — education: Grade/Class/Section; business: Department/Unit/Team; elearning: Course/Module/Cohort | `OrgManagementHub.tsx`, `Terminology.tsx` | **Implemented** |

---

### 3.4 Slide 4 — Organization Management Hub (Drag-and-Drop User Management)

**Requirement:** Central hub for organization management with drag-and-drop user reassignment, visual hierarchy display, search, join code management, and real-time updates.

| Feature | DB Tables | API Endpoints | Services/Logic | Frontend Components | Status |
|---------|-----------|---------------|----------------|---------------------|--------|
| Visual hierarchy tree display | `organizationUnits`, `organizationSubUnits`, `organizationTeams` | `GET /api/organization/hierarchy/:organizationId` | `orgRoutes.ts` | `OrgManagementHub.tsx` (collapsible tree with ChevronRight/ChevronDown icons) | **Implemented** |
| Drag-and-drop user reassignment | `userOrganizationAssignments` (unitId, subUnitId, teamId updated) | `POST /api/organization/move-user` | `orgRoutes.ts` — validates org membership, only org_admin/superadmin can move | `OrgManagementHub.tsx` (uses `@dnd-kit/core`: DndContext, useDraggable, useDroppable, DragOverlay, closestCenter) | **Implemented** |
| Assign users to hierarchy node | `userOrganizationAssignments` | `POST /api/organization/:organizationId/hierarchy/:nodeType/:nodeId/assign` | `orgRoutes.ts` | `OrgManagementHub.tsx` | **Implemented** |
| Remove user from hierarchy node | `userOrganizationAssignments` | `DELETE /api/organization/:organizationId/hierarchy/:nodeType/:nodeId/users/:userId` | `orgRoutes.ts` | `OrgManagementHub.tsx` | **Implemented** |
| Search across org (users, departments, units, teams, courses) | `users`, `organizationUnits`, `organizationSubUnits`, `organizationTeams`, `courses` | `GET /api/organization/:orgId/search` | `orgRoutes.ts` — multi-entity search | `OrgManagementHub.tsx` (Search input with results) | **Implemented** |
| View node members | `userOrganizationAssignments`, `users` | `GET /api/organization/:organizationId/hierarchy/:nodeType/:nodeId/members` | `orgRoutes.ts` | `OrgManagementHub.tsx` (member list panel) | **Implemented** |
| Join code copy to clipboard | `organizationUnits.joinCode`, `organizationSubUnits.joinCode`, `organizationTeams.joinCode` | N/A (frontend-only) | N/A | `OrgManagementHub.tsx` (Copy icon button with toast) | **Implemented** |
| Regenerate team join code | `organizationTeams.joinCode` | `POST /api/organization/:organizationId/teams/:teamId/regenerate-code` | `orgRoutes.ts` — generates new unique code via `generateTeamCode()` + `ensureUniqueCode()` | `OrgManagementHub.tsx` (RefreshCw icon button) | **Implemented** |
| User detail navigation | — | — | — | `OrgManagementHub.tsx` (Link to `/org-management/users/:userId` → `OrgUserDetail.tsx`) | **Implemented** |

---

### 3.5 Slide 5 — Role-Based Access (Right Access for the Right People)

**Requirement:** Role-based access control with principle of least privilege, organization-level roles (org_admin, teacher, team_lead, student, employee), system-level roles (isAdmin, isSuperAdmin), and auto-assignment on join approval.

| Feature | DB Tables | API Endpoints | Services/Logic | Frontend Components | Status |
|---------|-----------|---------------|----------------|---------------------|--------|
| Organization-level roles | `userOrganizationRoles` (userId, organizationId, role: org_admin/teacher/team_lead/student/employee) | `GET /api/user/roles`, `PATCH /admin/users/:id/roles` | `adminRoutes.ts`, `sharedResources.ts` (ADMIN_ROLES, INSTRUCTOR_ROLES, LEARNER_ROLES) | `UserManagement.tsx`, `OrgManagementHub.tsx` | **Implemented** |
| System-level roles | `users.isAdmin`, `users.isSuperAdmin` | `PATCH /admin/users/:id/roles` (only SuperAdmins can modify) | `adminRoutes.ts` — restricts isAdmin/isSuperAdmin changes to SuperAdmins | `SuperAdmin.tsx`, `UserManagement.tsx` | **Implemented** |
| Role auto-assignment on approval | `userOrganizationRoles` | `POST /api/org/join-requests/:id/approve` | `orgRoutes.ts` — education org → "student", elearning/business org → "learner" | N/A (server-side logic) | **Implemented** |
| Route protection by role | — | All protected endpoints use middleware | `ProtectedRoute.tsx`, `sessionAuthMiddleware.ts`, `isTeacherOrAdmin()`, `isSuperAdmin()`, `isAdmin()` | `ProtectedRoute.tsx` (allowedRoles prop), `App.tsx` (route definitions with role checks) | **Implemented** |
| Lock user account | `users.isLocked`, `users.lockedUntil` | `PATCH /admin/users/:id/lock` | `adminRoutes.ts` | `UserManagement.tsx` | **Implemented** |
| Unlock user account | `users.isLocked`, `users.lockedUntil` | `PATCH /admin/users/:id/unlock` | `adminRoutes.ts` | `UserManagement.tsx` | **Implemented** |
| Disable user account | `users.isDisabled` | `PATCH /admin/users/:id/disable` | `adminRoutes.ts` | `UserManagement.tsx` | **Implemented** |
| Enable user account | `users.isDisabled` | `PATCH /admin/users/:id/enable` | `adminRoutes.ts` | `UserManagement.tsx` | **Implemented** |
| Admin password reset | `users.password` | `PATCH /admin/users/:id/reset-password` | `adminRoutes.ts` | `UserManagement.tsx` | **Implemented** |
| Update user email | `users.email` | `PUT /admin/users/:id/email` | `adminRoutes.ts` | `UserManagement.tsx` | **Implemented** |

---

### 3.6 Slide 6 — Join Request Workflow (Approve or Reject New Member Requests)

**Requirement:** Workflow for managing join requests — view pending requests, approve with placement, deny with reason, bulk operations, admin email notifications, one-click email approval via token.

| Feature | DB Tables | API Endpoints | Services/Logic | Frontend Components | Status |
|---------|-----------|---------------|----------------|---------------------|--------|
| Join request creation on registration | `joinRequests` (userId, organizationId, requestedUnitId, requestedSubUnitId, requestedTeamId, status: "pending") | `POST /api/auth/register` | `authRoutes.ts` — creates joinRequest with status "pending" when org code provided | `register.jsx` | **Implemented** |
| View pending request queue | `joinRequests`, `users` (enriched) | `GET /api/org/:organizationId/join-requests?status=pending` | `orgRoutes.ts` — enriches with user info, reviewer info, requested unit/subunit names | `JoinRequests.tsx` | **Implemented** |
| Pending request count | `joinRequests` | `GET /api/org/:organizationId/join-requests/pending-count` | `orgRoutes.ts` | `OrgAdminDashboard.tsx` (badge count) | **Implemented** |
| Approve with placement override | `joinRequests` (status → "approved", assignedUnitId, assignedSubUnitId, assignedTeamId, approvedAt, approvalMethod: "dashboard"), `userOrganizationRoles`, `userOrganizationAssignments` | `POST /api/org/join-requests/:id/approve` (body: optional { unitId, subUnitId, teamId, subjectIds }) | `orgRoutes.ts` — assigns role based on org type, assigns to unit/team, invalidates user sessions via `SessionInvalidationService` | `JoinRequests.tsx` | **Implemented** |
| Deny with reason | `joinRequests` (status → "denied", denialReason, reviewedBy, reviewedAt) | `POST /api/org/join-requests/:id/deny` (body: { reason }) | `orgRoutes.ts` | `JoinRequests.tsx` | **Implemented** |
| Bulk approve | `joinRequests` (multiple rows updated) | `POST /api/org/join-requests/bulk-approve` | `orgRoutes.ts` | `JoinRequests.tsx` | **Implemented** |
| Bulk deny | `joinRequests` (multiple rows updated) | `POST /api/org/join-requests/bulk-deny` | `orgRoutes.ts` | `JoinRequests.tsx` | **Implemented** |
| Email notification to admins | `joinRequestApprovalTokens` | Triggered internally after joinRequest creation | `joinRequestApprovalService.ts` (`notifyAdminsOfJoinRequest`), `mailerSendService.ts` | N/A (email-based) | **Implemented** |
| One-click email approval via token | `joinRequestApprovalTokens` (token, expiresAt), `joinRequests` (approvalMethod: "email_link") | `GET /api/org/join-requests/approve-via-token/:token` | `joinRequestApprovalService.ts` — validates token, approves request, returns HTML confirmation page | N/A (email link → HTML response) | **Implemented** |

---

### 3.7 Slide 7 — User Profiles (Track Individual Progress and Achievements)

**Requirement:** User profiles with personal dashboards, progress metrics, XP tracking, certificates, course progress, and avatar customization.

| Feature | DB Tables | API Endpoints | Services/Logic | Frontend Components | Status |
|---------|-----------|---------------|----------------|---------------------|--------|
| Authenticated user data | `users`, `userOrganizationRoles`, `organizations` | `GET /api/auth/user` | `authRoutes.ts` — returns user data with org context | `ProfilePage.tsx`, all dashboard pages | **Implemented** |
| Player stats (XP, level, rank) | `playerStats` (currentXP, currentLevel, currentRank, totalGamesPlayed, totalWins, totalLosses, winPercentage, currentWinStreak, bestWinStreak, totalXPEarned, totalXPLost) | `GET /api/auth/user` (includes player stats) | `xpService.ts`, `gamificationService.ts` | `ProfilePage.tsx` | **Implemented** |
| Certificate access | `certificates` (certificateId, certificateType: lesson/course, pdfStoragePath) | `GET /api/auth/user` (certificates count in playerStats), certificate download endpoints | `certificateService.ts` | `ProfilePage.tsx`, `CertificateGallery.tsx` | **Implemented** |
| Course progress display | `courseProgress` (userId, courseId, status: not_started/in_progress/completed, percentComplete, completedLessons, totalLessons) | `GET /api/organization/:organizationId/users/:userId/details` (includes courseProgress) | `orgRoutes.ts` | `OrgUserDetail.tsx`, `StudentDashboard.tsx` | **Implemented** |
| Game history | `quizGameResults`, `gameResults` | `GET /api/user/game-history` | `gameRoutes.ts` | `ProfilePage.tsx`, `GameHistory.jsx` | **Implemented** |
| User preferences (timezone, currency) | `users` (via preferences) | `GET /api/user/preferences`, `PUT /api/user/preferences/timezone`, `PUT /api/user/preferences/currency` | `timezonePreferenceService.ts` | `ProfilePage.tsx` | **Implemented** |
| Avatar/profile image | `users.profileImageUrl`, `users.avatarImageUrl` | `GET /api/auth/user`, profile update endpoints | `authRoutes.ts` | `ProfilePage.tsx`, `AvatarUpload.jsx`, `PlayerAvatar.jsx` | **Implemented** |
| Comprehensive user details (admin view) | `users`, `courseProgress`, `courseAssignments`, `quizGameResults` | `GET /api/organization/:organizationId/users/:userId/details` | `orgRoutes.ts` — aggregates profile, course progress, assignments, quiz attempts | `OrgUserDetail.tsx` | **Implemented** |

---

### 3.8 Slide 8 — Audit Trails (Complete Visibility into Platform Activities)

**Requirement:** Complete visibility into platform activities — financial event logging, actor identification, timestamp accuracy, filtering by action/entity/date range, comprehensive logging of all platform activities.

| Feature | DB Tables | API Endpoints | Services/Logic | Frontend Components | Status |
|---------|-----------|---------------|----------------|---------------------|--------|
| Financial audit log | `financialAuditLog` (eventType, entityType, entityId, userId, beforeState JSONB, afterState JSONB, ipAddress, userAgent, timestamp, notes) | `GET /super-admin/audit-logs?action=X&entityType=X&startDate=X&endDate=X&limit=X&offset=X` | `superAdminRoutes.ts` — query with filters, returns { logs, total } | `SuperAdmin.tsx` (audit log tab) | **Implemented** |
| Audit log filtering | `financialAuditLog` (indexed: IDX_financial_audit_entity, IDX_financial_audit_timestamp) | `GET /super-admin/audit-logs` (query params: action, entityType, startDate, endDate, limit, offset) | `superAdminRoutes.ts` | `SuperAdmin.tsx` | **Implemented** |
| Join request audit trail | `joinRequests` (reviewedBy, reviewedAt, approvalMethod, denialReason), `joinRequestApprovalTokens` | `GET /api/org/:organizationId/billing/audit-log` | `orgRoutes.ts` | `BillingAuditLog.tsx` | **Implemented** |
| License flag audit | `licenseFlagAudit` (changedBy, createdAt) | Internal usage | `featureFlags.ts` | `SuperAdmin.tsx` | **Implemented** |
| Immutable financial audit trail | `platformFinancialAuditLog` (tableName, recordId, changedBy, changedAt) | `GET /super-admin/organizations/:organizationId/billing/audit-log` | `superAdminRoutes.ts` | `SuperAdmin.tsx` | **Implemented** |
| General-purpose platform activity audit (all user actions, role changes, course assignments, etc.) | — | — | — | — | **PARTIALLY IMPLEMENTED** — Only financial and join request audit logs exist. No unified "all platform activities" audit log table tracks every admin action, user creation, role change, or course assignment. |

---

## 4. Phase 2: Master Test Documentation

This section contains detailed test cases organized by requirement slide. Each test case includes granular, non-technical steps suitable for a human tester, along with expected UI outcomes and expected database states.

---

### 4.1 Self-Service Registration Tests (Slide 2)

---

#### TC-REG-001: Register with Organization Join Code

**Feature:** Register a new user account using an organization-level join code, creating a pending join request for admin approval.

**Intended Use / Business Case:** Organizations share their unique join code with prospective members (employees, students). When a new user registers with this code, the system creates a pending join request that an org admin can approve — providing controlled onboarding while keeping registration self-service.

**Pre-conditions:**
- An active organization exists with a valid `inviteCode` (e.g., "ORG-ABC123")
- No existing user account with the test email address
- The organization is not the General Org

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Registration page (`/register`). |
| 2 | Fill in the required registration fields: Gamer Name, Email, Password, First Name, Last Name. |
| 3 | In the "Organization Code" or "Join Code" field, enter a valid organization-level join code (e.g., "ORG-ABC123"). |
| 4 | Observe whether the system validates the join code in real-time (inline validation or on blur). |
| 5 | If the code is validated, confirm the organization name is displayed to the user as confirmation. |
| 6 | Click the "Register" or "Sign Up" button. |
| 7 | Observe the success message confirming registration. |
| 8 | Check the email inbox for a verification email. Click the verification link. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Registration succeeds with a confirmation message. The organization name is displayed when a valid join code is entered. An email verification prompt is shown. After email verification, the user is informed their join request is pending approval. |
| **Database** | A new row in `users` with the provided registration details. `users.emailVerified` = false (until email link clicked). A new row in `joinRequests` with: `userId` = new user's ID, `organizationId` = matched organization, `status` = "pending", `requestedUnitId` = null (org-level code), `requestedSubUnitId` = null, `requestedTeamId` = null. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-REG-002: Register with Department-Level Join Code (Auto-Placement)

**Feature:** Register a new user with a department-level join code, which auto-places the user into the corresponding department when their join request is approved.

**Intended Use / Business Case:** Department heads can share their department's specific join code with new members. Upon registration, the system records the requested department placement, so when an admin approves the request, the user is automatically assigned to the correct department — eliminating manual placement steps.

**Pre-conditions:**
- An active organization exists with at least one department (Level 1 unit) that has a valid `joinCode`
- The department's join code is known (e.g., "DEP-XYZ789")
- No existing user account with the test email address

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Registration page (`/register`). |
| 2 | Fill in the required registration fields: Gamer Name, Email, Password, First Name, Last Name. |
| 3 | In the "Organization Code" field, enter a valid department-level join code (e.g., "DEP-XYZ789"). |
| 4 | Observe the real-time validation response — the system should display the organization name AND the department name. |
| 5 | Confirm the displayed terminology matches the organization type (e.g., "Grade" for education, "Department" for business). |
| 6 | Click the "Register" button. |
| 7 | Verify registration success. Check the email inbox for verification. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The validated join code displays both the organization name and the department name. Registration completes successfully. The user is informed their request is pending. |
| **Database** | A new `users` row. A new `joinRequests` row with: `status` = "pending", `organizationId` = the department's parent organization, `requestedUnitId` = the department's ID (from `organizationUnits`), `requestedSubUnitId` = null, `requestedTeamId` = null. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-REG-003: Register with Unit-Level Join Code (Auto-Placement)

**Feature:** Register a new user with a unit-level (Level 2 sub-unit) join code, which auto-places the user into the corresponding unit and its parent department.

**Intended Use / Business Case:** Unit managers or class coordinators share unit-specific codes. When a user registers with this code, the system records both the requested department and unit, ensuring precise placement upon approval.

**Pre-conditions:**
- An active organization with a department containing at least one unit (Level 2 sub-unit) that has a valid `joinCode`
- The unit's join code is known
- No existing user account with the test email address

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Registration page (`/register`). |
| 2 | Fill in the required registration fields. |
| 3 | Enter a valid unit-level join code in the "Organization Code" field. |
| 4 | Observe the validation response — the system should display the organization name, department name, and unit name. |
| 5 | Confirm the terminology adapts to the org type (e.g., "Class" for education orgs). |
| 6 | Click the "Register" button and verify success. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The organization name, department name, and unit name are all displayed upon code validation. Registration completes successfully. |
| **Database** | A new `joinRequests` row with: `status` = "pending", `requestedUnitId` = parent department ID, `requestedSubUnitId` = the unit's ID (from `organizationSubUnits`), `requestedTeamId` = null. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-REG-004: Register with Team-Level Join Code (Auto-Placement)

**Feature:** Register a new user with a team-level (Level 3) join code, which auto-places the user into the corresponding team, unit, and department.

**Intended Use / Business Case:** Team leaders share their team's specific join code. Upon registration, the system captures the full hierarchy placement (department + unit + team), so approved users are automatically placed at the most granular level.

**Pre-conditions:**
- An active organization with a full 3-level hierarchy: department → unit → team, where the team has a valid `joinCode`
- The team's join code is known
- No existing user account with the test email address

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Registration page (`/register`). |
| 2 | Fill in the required registration fields. |
| 3 | Enter a valid team-level join code in the "Organization Code" field. |
| 4 | Observe the validation response — the system should display the organization name, department name, unit name, and team name. |
| 5 | Click the "Register" button and verify success. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | All four levels (organization, department, unit, team) are displayed upon code validation. Registration completes successfully. |
| **Database** | A new `joinRequests` row with: `status` = "pending", `requestedUnitId` = department ID, `requestedSubUnitId` = unit ID, `requestedTeamId` = team ID (from `organizationTeams`). All three hierarchy level IDs are populated. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-REG-005: Register Without Join Code (General Org Auto-Enrollment)

**Feature:** Register a new user without providing any organization join code, resulting in automatic enrollment in the General Organization with auto-approval.

**Intended Use / Business Case:** Users who want to explore the platform without joining a specific organization can register freely. They are automatically placed in the General Organization, giving them immediate access without requiring admin approval.

**Pre-conditions:**
- A General Organization exists in the system (`organizations.isGeneralOrg` = true)
- No existing user account with the test email address

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Registration page (`/register`). |
| 2 | Fill in the required registration fields: Gamer Name, Email, Password, First Name, Last Name. |
| 3 | Leave the "Organization Code" field empty (do not enter any code). |
| 4 | Click the "Register" button. |
| 5 | Verify registration success — the user should be immediately enrolled without a "pending approval" message. |
| 6 | Check the email inbox for a verification email. Complete email verification. |
| 7 | Log in with the new account and verify the user has access to the platform. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Registration succeeds without any "pending approval" message. After email verification and login, the user has access to the platform home page and their dashboard. No join request pending banner is shown. |
| **Database** | A new `users` row. The user is associated with the General Organization: a `userOrganizationRoles` row with `organizationId` = General Org ID. If a `joinRequests` row exists, its `status` = "approved" (auto-approved). No pending join request remains. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-REG-006: Validate Join Code Before Registration

**Feature:** Pre-validate a join code to determine its type (organization, department, unit, or team) and display the corresponding organization and hierarchy information before the user completes registration.

**Intended Use / Business Case:** Users can verify their join code is valid and see which organization (and hierarchy level) they will be joining before committing to registration — reducing errors and building confidence in the onboarding process.

**Pre-conditions:**
- Valid join codes exist at each level: organization, department, unit, team
- The validation endpoint is accessible without authentication

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Registration page (`/register`). |
| 2 | Enter a valid organization-level join code in the "Organization Code" field. |
| 3 | Observe the inline validation result: confirm it shows the organization name and indicates "Organization" level. |
| 4 | Clear the field and enter a valid department-level join code. |
| 5 | Observe the result: confirm it shows the organization name, department name, and indicates "Department" level. |
| 6 | Clear the field and enter a valid unit-level join code. |
| 7 | Observe the result: confirm it shows organization, department, unit, and indicates "Unit" level. |
| 8 | Clear the field and enter a valid team-level join code. |
| 9 | Observe the result: confirm it shows organization, department, unit, team, and indicates "Team" level. |
| 10 | Verify that the terminology adapts to the organization type (e.g., "Grade/Class/Section" for education). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Each valid code displays the correct hierarchy level and organization info. Terminology adapts to the organization type. The validation occurs in real-time (on blur or as user types) without requiring form submission. |
| **Database** | No database changes occur — this is a read-only validation. The `GET /api/auth/validate-join-code?code=X` endpoint returns: `{ valid: true, type: "organization"/"unit"/"subunit"/"team", level: ..., organization: { name, type }, unit/subUnit/team: { name } }`. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-REG-007: Registration with Invalid/Expired Join Code

**Feature:** Attempting to register with an invalid, non-existent, or malformed join code results in a clear error message — the registration is blocked or the code is rejected.

**Intended Use / Business Case:** Prevents users from registering with incorrect codes that would create orphaned requests or confusion. Provides immediate feedback so users can correct typos or obtain a valid code from their organization administrator.

**Pre-conditions:**
- An invalid/non-existent join code is prepared (e.g., "INVALID-999", random string)
- No existing user account with the test email address

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Registration page (`/register`). |
| 2 | Fill in the required registration fields. |
| 3 | Enter an invalid join code in the "Organization Code" field (e.g., "INVALID-999"). |
| 4 | Observe the inline validation response — the system should indicate the code is invalid. |
| 5 | Attempt to click the "Register" button. |
| 6 | Verify that registration is either blocked (button disabled) or completes with an error message indicating the invalid code. |
| 7 | Try a random alphanumeric string as the join code and confirm the same error handling. |
| 8 | Try an empty string with only spaces and confirm validation rejects it. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The system clearly indicates the join code is invalid with an error message (e.g., "Invalid join code" or "Organization not found"). Registration is prevented or the user is warned before proceeding. No ambiguous state occurs. |
| **Database** | No `users` row is created (if registration is blocked). No `joinRequests` row is created with an invalid organization reference. The `GET /api/auth/validate-join-code?code=INVALID` returns `{ valid: false }`. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

### 4.2 3-Level Hierarchy Tests (Slide 3)

---

#### TC-HIER-001: Create Department (Level 1)

**Feature:** Create a new department (Level 1) within an organization, with an auto-generated unique join code.

**Intended Use / Business Case:** Organization administrators structure their organization into departments (or Grades for education, Courses for elearning). Each department gets its own join code that can be shared with members for self-service registration at that level.

**Pre-conditions:**
- User is logged in as OrgAdmin or SuperAdmin
- An active organization exists
- User is on the Organization Management Hub page (`/org-management`)

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Organization Management Hub (`/org-management`). |
| 2 | Locate the "Add Department" or "+" button (labeled according to the org's terminology, e.g., "Add Grade" for education). |
| 3 | Click the button to open the department creation dialog. |
| 4 | Enter a department name (e.g., "Engineering" for business, "Grade 10" for education). |
| 5 | Click "Create" or "Save" to create the department. |
| 6 | Observe a success notification (toast message). |
| 7 | Verify the new department appears in the hierarchy tree view. |
| 8 | Verify the department has an auto-generated join code displayed next to it. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The new department appears in the hierarchy tree with its name. A join code is displayed (e.g., with a copy icon). A success toast notification is shown. The department count in the totals updates. |
| **Database** | A new row in `organizationUnits` with: `organizationId` = current org, `name` = entered name, `joinCode` = auto-generated unique code, `isActive` = true, `displayOrder` = auto-assigned. The `IDX_organization_unit_join_code` index covers the new code. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-HIER-002: Create Unit Within Department (Level 2)

**Feature:** Create a new unit (Level 2 sub-unit) within an existing department, with an auto-generated unique join code.

**Intended Use / Business Case:** After creating departments, administrators add sub-divisions. For education: Classes within a Grade. For business: Units within a Department. Each unit gets its own join code for targeted registration.

**Pre-conditions:**
- User is logged in as OrgAdmin or SuperAdmin
- At least one department exists in the organization
- User is on the Organization Management Hub page

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Organization Management Hub (`/org-management`). |
| 2 | Expand a department in the hierarchy tree by clicking on it. |
| 3 | Locate the "Add Unit" or "+" button within the expanded department (labeled according to org terminology, e.g., "Add Class" for education). |
| 4 | Click the button to open the unit creation dialog. |
| 5 | Enter a unit name (e.g., "Frontend Team" for business, "Class 10A" for education). |
| 6 | Click "Create" or "Save". |
| 7 | Verify the new unit appears nested under the parent department in the tree. |
| 8 | Verify the unit has an auto-generated join code. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The new unit appears indented under its parent department in the hierarchy tree. A join code is shown. A success toast is displayed. The unit count in totals updates. |
| **Database** | A new row in `organizationSubUnits` with: `unitId` = parent department's ID (FK to `organizationUnits`), `name` = entered name, `joinCode` = auto-generated unique code, `isActive` = true, `displayOrder` = auto-assigned. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-HIER-003: Create Team Within Unit (Level 3)

**Feature:** Create a new team (Level 3) within an existing unit, with an auto-generated unique join code.

**Intended Use / Business Case:** The most granular organizational level. For business: project teams or squads. For education: sections or study groups. Teams enable fine-grained user management and targeted content assignment.

**Pre-conditions:**
- User is logged in as OrgAdmin or SuperAdmin
- At least one unit (Level 2) exists under a department
- User is on the Organization Management Hub page

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Organization Management Hub (`/org-management`). |
| 2 | Expand a department, then expand a unit within it. |
| 3 | Locate the "Add Team" or "+" button within the expanded unit (labeled according to org terminology, e.g., "Add Section" for education). |
| 4 | Click the button to open the team creation dialog. |
| 5 | Enter a team name (e.g., "Sprint Alpha" for business, "Section A" for education). |
| 6 | Click "Create" or "Save". |
| 7 | Verify the new team appears nested under the parent unit in the tree. |
| 8 | Verify the team has an auto-generated join code. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The new team appears indented under its parent unit, which is under the department. A join code is displayed. A success toast is shown. The team count in totals updates. The full 3-level hierarchy (Department → Unit → Team) is visually clear. |
| **Database** | A new row in `organizationTeams` with: `subUnitId` = parent unit's ID (FK to `organizationSubUnits`), `name` = entered name, `joinCode` = auto-generated unique code, `isActive` = true, `displayOrder` = auto-assigned. Indexes `IDX_organization_team_join_code` and `IDX_organization_team_subunit` cover the new row. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-HIER-004: View Full Hierarchy Tree

**Feature:** View the complete organizational hierarchy tree showing all departments, units, and teams with their nesting relationships and member counts.

**Intended Use / Business Case:** Administrators need a comprehensive, at-a-glance view of their entire organization's structure to understand team composition, identify gaps, and plan resource allocation.

**Pre-conditions:**
- User is logged in as OrgAdmin, Teacher, or SuperAdmin
- The organization has at least one department with a nested unit and team
- At least some users are assigned to various hierarchy levels

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Organization Management Hub (`/org-management`). |
| 2 | Observe the hierarchy tree displayed on the page. |
| 3 | Verify departments (Level 1) are shown at the top level with expand/collapse controls. |
| 4 | Click to expand a department and verify its units (Level 2) are displayed nested beneath it. |
| 5 | Click to expand a unit and verify its teams (Level 3) are displayed nested beneath it. |
| 6 | Verify each node shows a member count (direct members and/or total members). |
| 7 | Verify the page header shows summary totals: total departments, total units, total teams, total users. |
| 8 | Collapse and expand nodes to verify the tree interaction is smooth. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The hierarchy tree displays a clear 3-level structure with proper nesting and indentation. Each node shows its name, join code, and member counts (directCount, totalCount). Expand/collapse controls (ChevronRight/ChevronDown) work correctly. Summary totals at the top match the tree contents. |
| **Database** | The `GET /api/organization/hierarchy/:organizationId` endpoint returns the complete tree structure with: `hierarchy[]` (array of department nodes, each with `children[]` containing unit nodes, each with `children[]` containing team nodes), `totals` (departments, units, teams, users counts). Member counts are calculated from `userOrganizationAssignments`. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-HIER-005: Hierarchy Member Counts (Direct and Total)

**Feature:** Each hierarchy node displays accurate member counts, distinguishing between direct members (assigned directly to that node) and total members (including all nested children).

**Intended Use / Business Case:** Administrators need to know not just how many members are directly in a department, but also the total headcount including all sub-units and teams. This is critical for capacity planning, reporting, and ensuring balanced distribution of users.

**Pre-conditions:**
- User is logged in as OrgAdmin or SuperAdmin
- The organization has a multi-level hierarchy with users assigned at various levels
- At least 3 users are assigned: one at department level, one at unit level, one at team level

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Organization Management Hub (`/org-management`). |
| 2 | Expand a department that has users assigned at multiple levels (department, unit, and team). |
| 3 | Note the member count displayed on the department node. |
| 4 | Expand the units and teams within that department. |
| 5 | Note the member counts on each unit and team node. |
| 6 | Manually verify: the department's total count should equal its direct members PLUS the total members of all its child units and teams. |
| 7 | Click on a node to view its member list and count the actual members shown. |
| 8 | Confirm the displayed count matches the actual members listed. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Each node shows accurate `directCount` and `totalCount`. The department's totalCount is the sum of its directCount plus all descendant member counts. Clicking a node and viewing its member list confirms the count is accurate. No double-counting occurs. |
| **Database** | The hierarchy API response includes `directCount` (members directly assigned via `userOrganizationAssignments` with matching unitId/subUnitId/teamId) and `totalCount` (recursive aggregation) for each node. Counts are derived from `userOrganizationAssignments` rows. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-HIER-006: Delete Hierarchy Node (Cascade Behavior)

**Feature:** Delete a hierarchy node (department, unit, or team) and verify the system handles the deletion properly, including any child nodes and user assignments.

**Intended Use / Business Case:** When organizational restructuring occurs, administrators need to remove obsolete departments, units, or teams. The system must handle deletions safely — either preventing deletion if children exist, cascading the removal, or reassigning affected users.

**Pre-conditions:**
- User is logged in as OrgAdmin or SuperAdmin
- The organization has a hierarchy with at least one deletable node
- Some nodes have child elements and/or assigned users for cascade testing

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Organization Management Hub (`/org-management`). |
| 2 | Identify a team (Level 3, leaf node) with no members or minimal members. |
| 3 | Click the "Delete" or trash icon on the team node. |
| 4 | If a confirmation dialog appears, read the warning message and confirm the deletion. |
| 5 | Verify the team is removed from the hierarchy tree and a success toast is shown. |
| 6 | Now identify a unit (Level 2) that has child teams. Attempt to delete it. |
| 7 | Observe the system behavior — does it prevent deletion (because of children), cascade delete, or prompt for confirmation with a warning about child nodes? |
| 8 | If deletion proceeds, verify all child teams under that unit are also removed. |
| 9 | Attempt to delete a department (Level 1) that has child units and teams. |
| 10 | Document the cascade behavior observed. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Deletion of a leaf node (team with no children) succeeds with a confirmation dialog and success toast. Attempting to delete a node with children either: (a) shows a warning about cascading effects and requires explicit confirmation, or (b) is blocked with an error message requiring children to be deleted first. The hierarchy tree updates immediately after deletion. |
| **Database** | For a team deletion: the row in `organizationTeams` is removed. Any `userOrganizationAssignments` rows referencing the deleted `teamId` are updated (teamId set to null) or deleted. For cascade deletion: child rows in `organizationSubUnits` and `organizationTeams` are also removed. The `DELETE /api/organization/:organizationId/departments/:departmentId` (or units/teams equivalent) endpoint is called. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

### 4.3 Organization Management Hub Tests (Slide 4)

---

#### TC-HUB-001: Visual Hierarchy Display in Management Hub

**Feature:** The Organization Management Hub displays the complete organizational hierarchy as an interactive, collapsible tree with visual node indicators, member counts, and join codes.

**Intended Use / Business Case:** Org admins and teachers need a centralized dashboard to visualize and manage their entire organization structure. The hub provides an intuitive tree view where they can see all departments, units, teams, their membership, and available join codes at a glance.

**Pre-conditions:**
- User is logged in as OrgAdmin or Teacher
- The organization has a populated hierarchy (at least 2 departments, each with units and teams)
- Users are assigned to various hierarchy nodes

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Organization Management Hub (`/org-management`). |
| 2 | Verify the page loads without errors and displays the hierarchy tree. |
| 3 | Confirm departments are shown with Building2/FolderTree icons and expand/collapse chevrons. |
| 4 | Expand all departments and verify units are shown nested beneath their parent departments. |
| 5 | Expand all units and verify teams are shown nested beneath their parent units. |
| 6 | Verify each node shows: its name, a member count badge, and a join code (with copy icon). |
| 7 | Click on a department node to select it and verify its members are listed in the detail panel. |
| 8 | Click on a team node and verify its members are listed. |
| 9 | Verify the page header shows organization summary: total departments, units, teams, and users. |
| 10 | Verify the hub is accessible at the `/org-management` route. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The hierarchy tree is fully rendered with proper nesting (3 levels visible). Each node has an icon, name, member count badge (Users icon + count), and join code section. The tree is collapsible/expandable. Selecting a node shows its member list. The page summary (departments/units/teams/users counts) is accurate and visible. |
| **Database** | Data is fetched via `GET /api/organization/hierarchy/:organizationId`, which returns the complete `hierarchy[]` array and `totals` object. No database writes occur for this view-only test. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-HUB-002: Drag-and-Drop User Reassignment

**Feature:** Move a user from one hierarchy node to another using drag-and-drop interaction, updating the user's organizational assignment in real-time.

**Intended Use / Business Case:** When employees transfer between departments, students change classes, or team compositions shift, administrators can simply drag a user from their current position in the hierarchy and drop them into a new node — instantly reassigning them without navigating through multiple screens or forms.

**Pre-conditions:**
- User is logged in as OrgAdmin or SuperAdmin
- The organization has at least two different hierarchy nodes (e.g., two teams or two departments)
- At least one user is assigned to a hierarchy node and visible in the member list
- The Organization Management Hub is loaded

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Organization Management Hub (`/org-management`). |
| 2 | Expand the hierarchy tree to reveal at least two different nodes (e.g., "Team Alpha" under "Engineering" and "Team Beta" under "Marketing"). |
| 3 | Click on the source node (e.g., "Team Alpha") to display its member list. |
| 4 | Identify a user in the member list who will be moved. Note their name. |
| 5 | Click and hold the drag handle (GripVertical icon) on the user's row. |
| 6 | Drag the user item toward the target node in the hierarchy tree (e.g., "Team Beta"). |
| 7 | Observe the visual feedback: the target node should highlight or change color to indicate it is a valid drop zone. |
| 8 | Drop the user on the target node by releasing the mouse button. |
| 9 | Observe a success notification (toast) confirming the user was moved. |
| 10 | Click on the target node to verify the moved user now appears in its member list. |
| 11 | Click on the source node to verify the moved user no longer appears there. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The drag-and-drop interaction is smooth with visual feedback (DragOverlay). The source node shows the user is being dragged (opacity change). The target node highlights as a drop zone. After drop, a success toast appears. Member lists update: user appears in the target node's list and is removed from the source node's list. Member counts on both nodes update accordingly. |
| **Database** | The `POST /api/organization/move-user` endpoint is called with: `{ userId, organizationId, targetType, targetId }`. The `userOrganizationAssignments` row for the user is updated: the `unitId`, `subUnitId`, and/or `teamId` fields change to reflect the new placement. The user's `organizationId` remains the same (intra-org move). |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-HUB-003: Search Across Organization (Users, Departments, Courses)

**Feature:** Search across the organization to find users, departments, units, teams, and courses by name or keyword.

**Intended Use / Business Case:** In large organizations with hundreds of members and dozens of teams, administrators need a quick search to locate specific users, find which department someone belongs to, or identify which team handles a particular course — without manually browsing the entire hierarchy tree.

**Pre-conditions:**
- User is logged in as OrgAdmin or Teacher
- The organization has multiple departments, units, teams, users, and courses
- The Organization Management Hub is loaded

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Organization Management Hub (`/org-management`). |
| 2 | Locate the search input field (Search icon). |
| 3 | Type a known user's name (or partial name) into the search field. |
| 4 | Observe the search results — the matching user(s) should appear. |
| 5 | Clear the search and type a known department name. |
| 6 | Verify the matching department appears in the results. |
| 7 | Clear the search and type a known team name. |
| 8 | Verify the matching team appears. |
| 9 | Clear the search and type a non-existent term (e.g., "ZZZNONEXISTENT"). |
| 10 | Verify the search returns no results with an appropriate message (e.g., "No results found"). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The search input is prominently displayed. Results update as the user types (or on submit). Results include matches from multiple entity types: users, departments, units, teams, and courses. Each result type is visually distinguishable. Clicking a result navigates to or highlights the matching item. Empty searches show a "No results" message. |
| **Database** | The `GET /api/organization/:orgId/search` endpoint is called with the search query. The API searches across `users`, `organizationUnits`, `organizationSubUnits`, `organizationTeams`, and `courses` tables for matching records within the organization scope. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-HUB-004: Bulk User Assignment to Hierarchy Node

**Feature:** Assign multiple users to a hierarchy node (department, unit, or team) in a single operation.

**Intended Use / Business Case:** When onboarding a group of new employees or students, administrators need to assign them all to the appropriate team at once rather than moving them one by one. Bulk assignment streamlines the onboarding process for large batches of users.

**Pre-conditions:**
- User is logged in as OrgAdmin or SuperAdmin
- Multiple users exist in the organization who are not yet assigned to a specific hierarchy node
- At least one target hierarchy node exists (department, unit, or team)

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Organization Management Hub (`/org-management`). |
| 2 | Select a target hierarchy node (e.g., a team) where users will be assigned. |
| 3 | Locate the "Assign Users" or "Add Members" button/option for the selected node. |
| 4 | In the assignment dialog, select multiple users from the available list (use checkboxes or multi-select). |
| 5 | Click "Assign" or "Add" to assign all selected users to the node. |
| 6 | Observe a success notification confirming the bulk assignment. |
| 7 | Verify the node's member count has increased by the number of assigned users. |
| 8 | Click on the node to view its member list and confirm all assigned users appear. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The assignment dialog allows selecting multiple users. After confirmation, a success toast shows the number of users assigned. The node's member count updates immediately. The member list shows all newly assigned users. |
| **Database** | The `POST /api/organization/:organizationId/hierarchy/:nodeType/:nodeId/assign` endpoint is called with the list of user IDs. New rows are created in `userOrganizationAssignments` for each assigned user, with the appropriate `unitId`, `subUnitId`, and/or `teamId` set based on the target node type. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-HUB-005: Join Code Copy and Regeneration

**Feature:** Copy a hierarchy node's join code to the clipboard and regenerate a new join code for a team.

**Intended Use / Business Case:** Administrators need to share join codes with prospective members. The copy-to-clipboard feature enables quick sharing via email, chat, or documents. Code regeneration is needed when a code is compromised or when an administrator wants to invalidate previously shared codes.

**Pre-conditions:**
- User is logged in as OrgAdmin or SuperAdmin
- The organization has hierarchy nodes with join codes displayed
- The Organization Management Hub is loaded

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Organization Management Hub (`/org-management`). |
| 2 | Expand the hierarchy tree to reveal a node with a visible join code. |
| 3 | Click the "Copy" icon (Link2 or Copy icon) next to the join code. |
| 4 | Verify a toast notification confirms the code was copied to the clipboard. |
| 5 | Paste from the clipboard (Ctrl+V / Cmd+V) into a text editor to verify the correct code was copied. |
| 6 | Locate a team node in the hierarchy tree. |
| 7 | Click the "Regenerate" icon (RefreshCw icon) next to the team's join code. |
| 8 | If a confirmation dialog appears, confirm the regeneration. |
| 9 | Verify a success toast confirms the code was regenerated. |
| 10 | Verify the displayed join code has changed to a new value. |
| 11 | Copy the new code and confirm it is different from the old one. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Copy action: a "Code copied to clipboard" toast appears. The clipboard contains the exact join code. Regenerate action: a "Code regenerated" toast appears. The displayed join code changes to a new unique value. The old code is no longer shown. |
| **Database** | Copy: no database changes (frontend-only action). Regenerate: `POST /api/organization/:organizationId/teams/:teamId/regenerate-code` is called. The `organizationTeams.joinCode` for the target team is updated to a new unique value generated by `generateTeamCode()` + `ensureUniqueCode()`. The old code is no longer valid for registration. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-HUB-006: Real-Time Update Verification After User Operations

**Feature:** After performing user management operations (move, assign, remove), the hierarchy tree and member counts update in real-time without requiring a page refresh.

**Intended Use / Business Case:** Administrators performing multiple user management operations in sequence need immediate visual feedback. Real-time updates ensure the displayed state always reflects the latest data, preventing errors from stale information.

**Pre-conditions:**
- User is logged in as OrgAdmin or SuperAdmin
- The hierarchy tree is displayed with accurate member counts
- At least one user can be moved or assigned

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Organization Management Hub and note the current member counts on two different nodes. |
| 2 | Perform a drag-and-drop move of a user from Node A to Node B. |
| 3 | Immediately verify: Node A's member count has decreased by 1. |
| 4 | Immediately verify: Node B's member count has increased by 1. |
| 5 | Assign a new user to Node B via the assign dialog. |
| 6 | Verify Node B's member count increases by 1 again without page refresh. |
| 7 | Remove a user from Node B (via the remove/delete action on the member). |
| 8 | Verify Node B's member count decreases by 1. |
| 9 | Verify the totals in the page header update correctly after each operation. |
| 10 | Confirm no page reload was needed for any of these updates. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | All member counts update immediately after each operation (move, assign, remove). The hierarchy tree re-renders with updated counts without a full page reload. The page header totals remain consistent with the tree data. React Query cache invalidation triggers automatic refetch of hierarchy data. |
| **Database** | Each operation calls the appropriate API endpoint (move-user, assign, remove). The `userOrganizationAssignments` table reflects the current state after each operation. Subsequent calls to `GET /api/organization/hierarchy/:organizationId` return updated counts. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

### 4.4 Role-Based Access Control Tests (Slide 5)

---

#### TC-RBAC-001: Learner (Student/Employee) Role Permissions

**Feature:** Users with the "student" or "employee" role can only access learner-oriented features: their dashboard, assigned courses, quizzes, profile, and game features — they cannot access admin, management, or content creation features.

**Intended Use / Business Case:** The principle of least privilege ensures learners can only consume content and participate in activities. They should not be able to create courses, manage organizations, approve join requests, or modify other users' data.

**Pre-conditions:**
- A user exists with only the "student" role in a specific organization (no admin, teacher, or other elevated roles)
- The user is logged in

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as a user who has ONLY the "student" (or "employee") role. |
| 2 | Verify the user can access their Student Dashboard (`/student-dashboard`). |
| 3 | Verify the user can access their Profile page (`/profile`). |
| 4 | Verify the user can browse and view assigned courses. |
| 5 | Attempt to navigate to the Organization Management Hub (`/org-management`). Verify access is denied (redirect to "Not Authorized" page or dashboard). |
| 6 | Attempt to navigate to the Admin Dashboard (`/admin-dashboard`). Verify access is denied. |
| 7 | Attempt to navigate to the User Management page (`/admin/user-management`). Verify access is denied. |
| 8 | Attempt to navigate to the Join Requests page (`/admin/join-requests`). Verify access is denied. |
| 9 | Attempt to navigate to the Course Builder (`/course-builder`). Verify access is denied or the page is restricted. |
| 10 | Verify the navigation menu does not show admin or teacher links. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The learner can access: Student Dashboard, Profile, Browse Courses, Quiz Lobby, Leaderboard, Game features. The learner CANNOT access: Org Management Hub, Admin Dashboard, Teacher Dashboard, User Management, Join Requests, Course Builder, AI Settings, Billing Dashboard. Navigation menu only shows learner-appropriate links. Unauthorized routes redirect to a "Not Authorized" page or back to the dashboard. |
| **Database** | The user's `userOrganizationRoles` has only a "student" or "employee" role. The `ProtectedRoute` component checks `allowedRoles` and blocks access when the user's role is not in the allowed list. API endpoints return 403 when the user lacks the required role. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-RBAC-002: Instructor (Teacher) Role Permissions

**Feature:** Users with the "teacher" role can access content creation tools, org management hub, student oversight, and course management — in addition to learner features.

**Intended Use / Business Case:** Instructors need to create and manage courses, view student progress, manage their assigned classes/units, and access the org management hub. They should not have full admin access to billing, subscription management, or user role changes.

**Pre-conditions:**
- A user exists with the "teacher" role in a specific organization
- The user is logged in

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as a user who has the "teacher" role. |
| 2 | Verify the user can access the Teacher Dashboard (`/teacher-dashboard`). |
| 3 | Verify the user can access the Organization Management Hub (`/org-management`). |
| 4 | Verify the user can access the Course Builder and Lesson Wizard for content creation. |
| 5 | Verify the user can view student progress and assignments. |
| 6 | Verify the user can access the Quiz Wizard for quiz creation. |
| 7 | Attempt to navigate to the SuperAdmin panel (`/super-admin`). Verify access is denied. |
| 8 | Attempt to modify another user's role. Verify the action is restricted to admins. |
| 9 | Verify the teacher can see reports relevant to their classes/courses. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The teacher can access: Teacher Dashboard, Org Management Hub, Course Builder, Lesson Wizard, Quiz Wizard, Reports (scoped to their org), student progress views. The teacher CANNOT access: SuperAdmin panel, User Role Management, Billing administration, Subscription Management. Navigation menu shows teacher-appropriate links. |
| **Database** | The user's `userOrganizationRoles` has the "teacher" role. Route protection via `ProtectedRoute` allows "teacher" for routes like `/org-management` (where `allowedRoles` includes "orgadmin" and "teacher"). API middleware (`isTeacherOrAdmin`) validates the role. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-RBAC-003: Org Admin Role Permissions

**Feature:** Users with the "org_admin" role have full organizational management capabilities including user management, join request approval, hierarchy management, billing, and content oversight — scoped to their organization.

**Intended Use / Business Case:** Organization administrators are responsible for managing their organization's structure, users, and content. They need complete control within their organization boundary but should not have platform-wide (SuperAdmin) access.

**Pre-conditions:**
- A user exists with the "org_admin" role in a specific organization
- The user is logged in

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as a user who has the "org_admin" role. |
| 2 | Verify the user can access the OrgAdmin Dashboard (`/org-admin-dashboard`). |
| 3 | Verify the user can access the Organization Management Hub (`/org-management`) with full CRUD on hierarchy nodes. |
| 4 | Verify the user can access the Join Requests page and approve/deny requests. |
| 5 | Verify the user can access User Management and modify org-level roles for other users. |
| 6 | Verify the user can access the Billing Dashboard. |
| 7 | Verify the user can create departments, units, and teams. |
| 8 | Verify the user can move users via drag-and-drop. |
| 9 | Attempt to navigate to the SuperAdmin panel (`/super-admin`). Verify access is denied. |
| 10 | Attempt to modify `isAdmin` or `isSuperAdmin` flags on another user. Verify this is restricted to SuperAdmins. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The org admin can access: OrgAdmin Dashboard, Org Management Hub (full CRUD), Join Requests (approve/deny), User Management (org-level roles), Billing Dashboard, Course Management, Reports. The org admin CANNOT access: SuperAdmin panel, platform-wide settings, other organizations' data. Navigation menu shows full org admin links. |
| **Database** | The user's `userOrganizationRoles` has the "org_admin" role. The org admin can modify `userOrganizationRoles` for users within their organization (via `PATCH /admin/users/:id/roles` with `organizationRoles`). The org admin CANNOT modify `users.isAdmin` or `users.isSuperAdmin` (enforced server-side in `adminRoutes.ts`). |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-RBAC-004: Role Assignment by Admin

**Feature:** An OrgAdmin or SuperAdmin can assign or modify organizational roles for users within their organization.

**Intended Use / Business Case:** As users' responsibilities change — a student becomes a teaching assistant, an employee becomes a team lead — administrators need to update their roles to grant or revoke appropriate access levels without creating new accounts.

**Pre-conditions:**
- User is logged in as OrgAdmin or SuperAdmin
- A target user exists in the same organization with a current role (e.g., "student")
- User Management page is accessible

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the User Management page. |
| 2 | Locate the target user in the user list. |
| 3 | Click the user's "Edit Roles" or role management option. |
| 4 | In the role editing interface, change the user's organization role from "student" to "teacher". |
| 5 | Save the role change. |
| 6 | Verify a success notification confirms the role update. |
| 7 | Verify the user's displayed role in the list has changed to "teacher". |
| 8 | Log out and log in as the modified user. |
| 9 | Verify the user now has access to teacher-level features (e.g., Teacher Dashboard, Course Builder). |
| 10 | Verify the user no longer sees student-only navigation items (if applicable). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The role editing interface shows available roles. Role change saves successfully with a confirmation toast. The user list reflects the updated role. The modified user's session reflects new permissions after re-login (session invalidation via `SessionInvalidationService`). |
| **Database** | `PATCH /admin/users/:id/roles` is called with `{ organizationRoles: [{ organizationId, roles: ["teacher"] }] }`. The `userOrganizationRoles` row for the user is updated: old role removed, new role inserted. The user's `sessionVersion` may be incremented (triggering re-authentication). |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-RBAC-005: Multiple Role Combinations

**Feature:** A user can hold multiple roles simultaneously within an organization (e.g., "teacher" + "team_lead"), and the system grants the union of all role permissions.

**Intended Use / Business Case:** In many organizations, individuals wear multiple hats. A department head might be both an "org_admin" and a "teacher". The system must correctly aggregate permissions from all assigned roles without conflicts.

**Pre-conditions:**
- User is logged in as SuperAdmin or OrgAdmin
- A target user exists in the organization
- The role management interface allows assigning multiple roles

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to User Management and locate a user currently with the "student" role. |
| 2 | Edit the user's roles to add "team_lead" in addition to "student" (do not remove "student"). |
| 3 | Save the role change. |
| 4 | Verify the user now shows both roles in the User Management list. |
| 5 | Log in as the modified user. |
| 6 | Verify the user can access both student features AND team_lead features. |
| 7 | Now edit the user again and add "teacher" as a third role. |
| 8 | Log in as the user again and verify they can access teacher-level features (Course Builder, Org Management Hub) in addition to the previous access. |
| 9 | Remove the "teacher" role, keeping "student" and "team_lead". |
| 10 | Verify teacher-specific features are no longer accessible but student and team_lead features remain. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The user's role badges show all assigned roles. Feature access is the union of all role permissions. Adding a role grants additional access. Removing a role revokes only the permissions unique to that role. Navigation menu adapts to show links for all active roles. |
| **Database** | Multiple rows in `userOrganizationRoles` for the same `userId` and `organizationId`, each with a different `role` value. The `GET /api/user/roles` endpoint returns all roles. Route protection checks if any of the user's roles matches the `allowedRoles` array. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-RBAC-006: Principle of Least Privilege Enforcement

**Feature:** The system enforces the principle of least privilege — users can only perform actions and access resources that are explicitly granted by their assigned role(s). API endpoints validate roles server-side, not just in the UI.

**Intended Use / Business Case:** Security compliance requires that access control is enforced at the API layer, not just the UI. Even if a user discovers or constructs API URLs directly, the server must reject unauthorized requests. This prevents privilege escalation attacks.

**Pre-conditions:**
- A user with only the "student" role is logged in
- API testing tools (browser developer console or similar) are available to make direct API calls

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as a user with only the "student" role. |
| 2 | Using the browser's developer console (or a tool like curl), attempt to call `POST /api/organization/:orgId/departments` to create a department. |
| 3 | Verify the API returns a 403 Forbidden or 401 Unauthorized response. |
| 4 | Attempt to call `POST /api/organization/move-user` to move a user. |
| 5 | Verify the API rejects the request. |
| 6 | Attempt to call `POST /api/org/join-requests/:id/approve` to approve a join request. |
| 7 | Verify the API rejects the request. |
| 8 | Attempt to call `PATCH /admin/users/:id/roles` to change another user's role. |
| 9 | Verify the API rejects the request. |
| 10 | Verify all rejections return appropriate error messages (not stack traces or internal details). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Direct API calls from an unauthorized user are rejected with 403 Forbidden responses. Error messages are generic and do not leak internal implementation details. No data is modified or exposed by the unauthorized requests. |
| **Database** | No changes occur in any table. The middleware chain (`withSessionAuthMiddleware`, `isTeacherOrAdmin`, `isAdmin`, `isSuperAdmin`) validates the user's role before any database operation. Unauthorized requests are rejected before reaching the route handler logic. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

### 4.5 Join Request Workflow Tests (Slide 6)

---

#### TC-JR-001: Join Request Creation on Registration

**Feature:** When a user registers with a valid organization join code, a join request is automatically created with "pending" status, capturing the requested hierarchy placement.

**Intended Use / Business Case:** Self-service registration with organizational codes creates a controlled onboarding pipeline. The join request records the user's intent to join a specific organization (and optionally a specific department/unit/team), which an administrator can then review and approve or deny.

**Pre-conditions:**
- An active organization with a valid join code exists
- No existing user account with the test email address
- An org admin exists who can verify the join request was created

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Registration page (`/register`). |
| 2 | Fill in all required registration fields. |
| 3 | Enter a valid organization join code. |
| 4 | Complete the registration. |
| 5 | Log in as an OrgAdmin for the target organization. |
| 6 | Navigate to the Join Requests page (`/admin/join-requests`). |
| 7 | Verify the newly registered user's join request appears in the pending queue. |
| 8 | Verify the join request shows: the user's name/email, the organization name, and the requested hierarchy level (if the code was department/unit/team specific). |
| 9 | Verify the pending count badge has incremented. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The join request appears in the pending requests list on the Join Requests page. The request shows the user's display name, email (potentially masked), requested organization, requested department/unit/team (if applicable), and submission timestamp. The pending count badge is accurate. |
| **Database** | A new row in `joinRequests` with: `userId` = registered user's ID, `organizationId` = matched org, `status` = "pending", `requestedUnitId`/`requestedSubUnitId`/`requestedTeamId` populated based on the join code level, `createdAt` = registration timestamp. `GET /api/org/:organizationId/join-requests/pending-count` returns an incremented count. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-JR-002: View Pending Request Queue

**Feature:** Organization administrators can view a queue of all pending join requests, enriched with user information, requested hierarchy placement, and submission timestamps.

**Intended Use / Business Case:** Admins need a centralized view of all incoming membership requests to process them efficiently. The enriched display (showing user details and requested placement) allows informed approval decisions without needing to look up each user separately.

**Pre-conditions:**
- User is logged in as OrgAdmin
- At least 2–3 pending join requests exist for the organization
- The Join Requests page is accessible

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as an OrgAdmin. |
| 2 | Navigate to the Join Requests page (`/admin/join-requests`). |
| 3 | Verify the page displays a list/table of pending join requests. |
| 4 | For each request, verify the following information is displayed: user name, user email (may be masked), requested organization/department/unit, submission date/time. |
| 5 | Verify the list is filterable by status (pending, approved, denied). |
| 6 | Select the "pending" filter and verify only pending requests are shown. |
| 7 | Select the "approved" filter and verify only approved requests are shown (with reviewer info and approval date). |
| 8 | Select the "denied" filter and verify only denied requests are shown (with denial reason, if provided). |
| 9 | Verify the pending count badge matches the number of pending requests in the list. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The join request queue displays all requests with user details, hierarchy placement info, and timestamps. Status filtering works correctly (pending/approved/denied). Approved requests show reviewer name and approval date. Denied requests show the denial reason. The pending count badge is accurate. |
| **Database** | `GET /api/org/:organizationId/join-requests?status=pending` returns enriched records with: user info (joined from `users`), reviewer info (joined from `users` via `reviewedBy`), requested unit/subunit names (joined from `organizationUnits`/`organizationSubUnits`). |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-JR-003: Approve Join Request with Placement

**Feature:** An OrgAdmin approves a pending join request, optionally overriding the requested hierarchy placement, which assigns the user a role and places them in the specified department/unit/team.

**Intended Use / Business Case:** Administrators review incoming requests and decide where to place each new member. They can accept the user's requested placement or override it (e.g., redirecting a user who requested Department A to Department B based on organizational needs). Upon approval, the user receives a role and organizational access.

**Pre-conditions:**
- User is logged in as OrgAdmin
- At least one pending join request exists
- The organization has departments/units/teams available for placement

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Join Requests page (`/admin/join-requests`). |
| 2 | Locate a pending join request. |
| 3 | Click the "Approve" button on the request. |
| 4 | If a placement dialog appears, review the default placement (based on the user's requested hierarchy). |
| 5 | Optionally override the placement by selecting a different department, unit, or team from dropdowns. |
| 6 | Click "Confirm Approval". |
| 7 | Verify a success notification confirms the approval. |
| 8 | Verify the request's status changes from "pending" to "approved" in the list. |
| 9 | Log in as the approved user. |
| 10 | Verify the user can now access the organization's resources and their dashboard shows the correct organization context. |
| 11 | Verify the user is placed in the correct department/unit/team (as approved). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The approval succeeds with a confirmation toast. The request moves from the pending queue to the approved list. The approved user can log in and access the organization. The user's dashboard shows the correct organization name and hierarchy placement. |
| **Database** | `joinRequests` row updated: `status` = "approved", `assignedUnitId`/`assignedSubUnitId`/`assignedTeamId` set (either matching requested or overridden), `reviewedBy` = admin's userId, `reviewedAt` = current timestamp, `approvedAt` = current timestamp, `approvalMethod` = "dashboard". New row in `userOrganizationRoles`: `role` = "student" (for education org) or "learner" (for elearning/business). New row in `userOrganizationAssignments` with appropriate `unitId`, `subUnitId`, `teamId`. User's session is invalidated via `SessionInvalidationService`. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-JR-004: Deny Join Request with Reason

**Feature:** An OrgAdmin denies a pending join request with a mandatory or optional reason for denial.

**Intended Use / Business Case:** When a membership request is inappropriate (wrong organization, unrecognized user, or the org is at capacity), administrators need to formally deny it with a reason — providing transparency and enabling the user to understand why they were rejected.

**Pre-conditions:**
- User is logged in as OrgAdmin
- At least one pending join request exists

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Join Requests page (`/admin/join-requests`). |
| 2 | Locate a pending join request. |
| 3 | Click the "Deny" or "Reject" button on the request. |
| 4 | In the denial dialog, enter a reason for denial (e.g., "This organization is for Department X employees only. Please use code ABC for Department Y."). |
| 5 | Click "Confirm Denial". |
| 6 | Verify a success notification confirms the denial. |
| 7 | Verify the request's status changes to "denied" in the list. |
| 8 | Switch to the "denied" filter and verify the denied request shows the reason provided. |
| 9 | Log in as the denied user and verify they see a notification or banner indicating their join request was denied (with the reason if displayed). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The denial succeeds with a confirmation toast. The request moves to the denied list with the denial reason displayed. The denied user sees feedback about the denial (via `JoinRequestDeniedModal.tsx` or `JoinRequestStatusBanner.tsx`). |
| **Database** | `joinRequests` row updated: `status` = "denied", `denialReason` = provided text, `reviewedBy` = admin's userId, `reviewedAt` = current timestamp. No `userOrganizationRoles` or `userOrganizationAssignments` rows are created for the denied user. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-JR-005: Bulk Approve Multiple Join Requests

**Feature:** Approve multiple pending join requests in a single operation, assigning roles and placement to all selected users at once.

**Intended Use / Business Case:** When onboarding a class of students or a batch of new employees, administrators receive many join requests simultaneously. Bulk approval allows processing them all at once, saving significant time compared to individual approvals.

**Pre-conditions:**
- User is logged in as OrgAdmin
- At least 3 pending join requests exist for the organization
- The Join Requests page supports bulk selection

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Join Requests page (`/admin/join-requests`). |
| 2 | Verify there are at least 3 pending requests. |
| 3 | Select multiple pending requests using checkboxes or a "Select All" option. |
| 4 | Click the "Bulk Approve" button. |
| 5 | If a placement dialog appears, configure the default placement for all selected requests. |
| 6 | Confirm the bulk approval. |
| 7 | Verify a success notification indicates how many requests were approved (e.g., "3 requests approved"). |
| 8 | Verify all selected requests have moved from "pending" to "approved" status. |
| 9 | Verify each approved user now has a role and assignment in the organization. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | All selected requests are approved in one operation. A success toast shows the count of approved requests. The pending queue is reduced by the number of approved requests. The pending count badge updates. |
| **Database** | `POST /api/org/join-requests/bulk-approve` is called with the list of request IDs. All selected `joinRequests` rows are updated: `status` = "approved", `approvalMethod` = "dashboard". `userOrganizationRoles` and `userOrganizationAssignments` rows are created for each approved user. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-JR-006: Email Notification to Admins on New Join Request

**Feature:** When a new user registers with an organization's join code and a pending join request is created, all org admins receive an email notification containing the request details and an approval link.

**Intended Use / Business Case:** Administrators should be proactively notified of new membership requests so they can act quickly. Email notifications ensure timely processing even if admins are not actively monitoring the dashboard.

**Pre-conditions:**
- Email service (MailerSend) is configured and operational
- At least one org admin exists with a valid email address
- A new user is about to register with the organization's join code

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Note the email addresses of all org admins for the target organization. |
| 2 | Open a new browser window/incognito session. |
| 3 | Register a new user with the organization's join code. |
| 4 | Complete the registration successfully. |
| 5 | Check the email inbox of each org admin. |
| 6 | Verify each admin received an email notification about the new join request. |
| 7 | Verify the email contains: the applicant's name/email, the requested organization, and an approval link/button. |
| 8 | Verify the email's approval link is clickable and leads to the approval action (either the dashboard or the one-click approval page). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | N/A (email-based test). Each org admin receives a notification email. The email is well-formatted with applicant details and an action link. |
| **Database** | The `JoinRequestApprovalService.notifyAdminsOfJoinRequest(joinRequestId)` method is invoked. It queries `userOrganizationRoles` for all users with `role` = "org_admin" in the organization. A `joinRequestApprovalTokens` row is created with a secure token and expiry date (TOKEN_EXPIRY_DAYS = 7). The `mailerSendService.ts` sends the email via the MailerSend API. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-JR-007: One-Click Email Approval via Token

**Feature:** Org admins can approve a join request directly from an email notification by clicking a one-click approval link, without needing to log in to the dashboard.

**Intended Use / Business Case:** For quick turnaround, administrators who receive a join request email can approve it with a single click — the system validates the approval token and processes the approval, returning a confirmation HTML page. This is especially useful for mobile administrators or those not logged in.

**Pre-conditions:**
- A join request notification email has been received by an org admin
- The email contains a one-click approval link with a valid token
- The token has not expired (within 7 days of creation)

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Open the join request notification email received by an org admin. |
| 2 | Locate the one-click approval button/link in the email. |
| 3 | Click the approval link. |
| 4 | Verify a new browser tab opens with the approval confirmation page. |
| 5 | Verify the page displays a success message confirming the user has been approved (e.g., "Join request approved for [User Name]"). |
| 6 | Navigate to the Join Requests page in the dashboard and verify the request is now listed as "approved". |
| 7 | Verify the `approvalMethod` for this request is recorded as "email_link". |
| 8 | Test with an expired or already-used token — click the link again and verify an appropriate error message is shown (e.g., "This approval link has expired or has already been used"). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Clicking the email link opens a browser page showing an HTML confirmation of approval. The page includes the approved user's name and the organization name. For expired/used tokens, an error page is displayed instead. |
| **Database** | `GET /api/org/join-requests/approve-via-token/:token` is called. The `joinRequestApprovalTokens` row is validated (not expired, not already used). The `joinRequests` row is updated: `status` = "approved", `approvalMethod` = "email_link", `reviewedBy` = the token's associated admin, `approvedAt` = current timestamp. `userOrganizationRoles` and `userOrganizationAssignments` are created for the approved user. The token is marked as used. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

### 4.6 User Profile Tests (Slide 7)

---

#### TC-PROF-001: Personal Dashboard Display

**Feature:** Each user has a personal dashboard displaying their key information: name, role, organization, gamification stats, and quick-access links to their courses and activities.

**Intended Use / Business Case:** Users need a centralized personal homepage that orients them within the platform — showing their identity, current role, organization membership, and providing quick access to their learning activities and achievements.

**Pre-conditions:**
- A user is logged in with at least one organization membership and role
- The user has some activity history (at least one course or quiz attempt)

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as any authenticated user. |
| 2 | Navigate to the Profile page (`/profile`). |
| 3 | Verify the page displays the user's name (gamerName and/or firstName + lastName). |
| 4 | Verify the user's profile image or avatar is displayed. |
| 5 | Verify the user's organization name is shown. |
| 6 | Verify the user's role(s) are displayed (e.g., "Student", "Teacher"). |
| 7 | Verify gamification stats are visible: XP, Level, Rank. |
| 8 | Verify there are links/sections for: courses, game history, achievements/certificates. |
| 9 | Verify the page loads without errors and all data fields are populated (no "undefined" or empty placeholders). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The profile page displays a complete user identity: name, avatar, organization, role badges. Gamification stats (XP, Level, Rank) are visible with current values. Navigation links to courses, game history, and certificates are present and functional. All data fields show actual values (no blank or undefined fields). |
| **Database** | Data is fetched via `GET /api/auth/user` which returns: `users` fields (gamerName, firstName, lastName, profileImageUrl, avatarImageUrl), organization context (from `userOrganizationRoles`), and player stats (from `playerStats`: currentXP, currentLevel, currentRank). |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-PROF-002: Progress Metrics and XP Tracking

**Feature:** The user profile displays detailed gamification progress metrics including current XP, level, rank, win/loss statistics, win streaks, and total XP earned.

**Intended Use / Business Case:** Gamification drives engagement. Users need to see their progress metrics — XP earned, current level, ranking, and win streaks — to stay motivated and track their learning journey over time.

**Pre-conditions:**
- A user is logged in who has played at least several quizzes/games
- The user has XP accumulated from game activities
- PlayerStats data exists for the user

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as a user who has gaming/quiz history. |
| 2 | Navigate to the Profile page (`/profile`). |
| 3 | Locate the gamification/stats section. |
| 4 | Verify the following metrics are displayed with non-zero values: |
| 5 | — Current XP (e.g., "1,250 XP") |
| 6 | — Current Level (e.g., "Level 5") |
| 7 | — Current Rank (e.g., "Gold") |
| 8 | — Total Games Played |
| 9 | — Win/Loss record (totalWins, totalLosses) |
| 10 | — Win Percentage |
| 11 | — Current Win Streak and Best Win Streak |
| 12 | Verify the XP and level values are consistent (higher XP = higher level). |
| 13 | Verify win percentage = totalWins / totalGamesPlayed * 100. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | All gamification metrics are displayed with accurate, formatted values. XP shows with number formatting (commas for thousands). Level and rank display with appropriate visual badges or icons. Win/loss stats are mathematically consistent. The stats section is visually organized and easy to scan. |
| **Database** | Data is sourced from `playerStats` table: `currentXP`, `currentLevel`, `currentRank`, `totalGamesPlayed`, `totalWins`, `totalLosses`, `winPercentage`, `currentWinStreak`, `bestWinStreak`, `totalXPEarned`, `totalXPLost`. Values are calculated and maintained by `xpService.ts` and `gamificationService.ts`. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-PROF-003: Certificate Access and Download

**Feature:** Users can view their earned certificates and download them as PDF files from their profile.

**Intended Use / Business Case:** Certificates are tangible proof of course or lesson completion. Users need to access and download their certificates for professional development records, resumes, or compliance documentation. Each certificate has a unique verification ID for authenticity.

**Pre-conditions:**
- A user is logged in who has completed at least one course or lesson that awards a certificate
- At least one `certificates` row exists for the user with a valid `pdfStoragePath`

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as a user who has earned certificates. |
| 2 | Navigate to the Profile page or Certificate Gallery (`/certificates`). |
| 3 | Verify a list of earned certificates is displayed. |
| 4 | For each certificate, verify the following are shown: certificate type (lesson/course), the title of the completed lesson or course, and the date earned. |
| 5 | Verify each certificate has a unique verification ID (certificateId). |
| 6 | Click on a certificate or its "Download" button. |
| 7 | Verify a PDF file downloads successfully. |
| 8 | Open the downloaded PDF and verify it contains the user's name, the course/lesson title, and the verification ID. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The certificate gallery/list shows all earned certificates with type, title, date, and verification ID. Download buttons are functional. PDFs download as valid, viewable files. The certificate count matches `playerStats.certificatesEarned`. |
| **Database** | Data sourced from `certificates` table: `certificateId` (unique verification), `certificateType` ("lesson"/"course"), `lessonTitle`/`courseTitle`, `pdfStoragePath`, `createdAt`. PDF files are stored in object storage and served via the `pdfStoragePath` reference. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-PROF-004: Course Progress Display

**Feature:** The user profile or admin user detail page displays course progress for each enrolled course, including completion percentage, completed lessons count, and current status.

**Intended Use / Business Case:** Users and administrators need visibility into course progression. Users track their own learning journey, while administrators use progress data to identify struggling learners, report on completion rates, and ensure training compliance.

**Pre-conditions:**
- A user is enrolled in at least 2 courses with varying progress levels (one in-progress, one completed)
- CourseProgress data exists for the user

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as the test user OR log in as OrgAdmin and navigate to the user's detail page (`/org-management/users/:userId`). |
| 2 | Locate the course progress section. |
| 3 | Verify a list of enrolled courses is displayed. |
| 4 | For each course, verify the following are shown: course title, progress status (not_started / in_progress / completed), completion percentage (e.g., "75%"), completed lessons count vs total lessons (e.g., "6 of 8 lessons"). |
| 5 | Verify an in-progress course shows a progress bar reflecting the `percentComplete` value. |
| 6 | Verify a completed course shows 100% with a completion date. |
| 7 | Verify a not-started course shows 0% with no started date. |
| 8 | For the admin view, verify course assignment information is also displayed (who assigned the course and when). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Course progress cards/rows display all relevant fields: title, status badge (color-coded), progress bar, lesson completion ratio, and dates (startedAt, completedAt). The data is accurate and matches the actual completion state. Admin view additionally shows course assignment info. |
| **Database** | Data sourced from `courseProgress` table: `status` (courseProgressStatusEnum: "not_started"/"in_progress"/"completed"), `percentComplete`, `completedLessons`, `totalLessons`, `startedAt`, `completedAt`. Admin view uses `GET /api/organization/:organizationId/users/:userId/details` which joins `courseProgress` with `courseAssignments`. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-PROF-005: Avatar and Profile Customization

**Feature:** Users can upload or change their profile image and avatar, and update personal information such as bio, country, and position at organization.

**Intended Use / Business Case:** Personalization makes the platform feel like the user's own space. Profile customization enables identity expression within the organization and helps other users recognize each other in leaderboards, game lobbies, and team directories.

**Pre-conditions:**
- A user is logged in
- A test image file (JPG/PNG) is prepared for upload

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Profile page (`/profile`). |
| 2 | Locate the avatar/profile image section. |
| 3 | Click the avatar or "Change Avatar" button. |
| 4 | Upload a new image file (JPG or PNG). |
| 5 | Verify the new avatar is displayed immediately after upload. |
| 6 | Locate the "Edit Profile" or bio section. |
| 7 | Update the user's bio text (e.g., "Passionate about learning and development"). |
| 8 | Update the country field. |
| 9 | Save the profile changes. |
| 10 | Verify a success notification confirms the update. |
| 11 | Refresh the page and verify all changes persist. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The new avatar image is displayed immediately after upload. Bio and country fields update successfully with a confirmation toast. Changes persist after page refresh. The avatar appears consistently across the platform (profile page, navigation bar, game lobbies, leaderboards). |
| **Database** | `users.profileImageUrl` or `users.avatarImageUrl` is updated with the new image reference (object storage URL). `users.bio` is updated with the new text. `users.country` is updated. Changes are persisted via the profile update API endpoint. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

### 4.7 Audit Trail Tests (Slide 8)

> **Implementation Note:** The audit trail system is **PARTIALLY IMPLEMENTED**. The platform has specific audit tables for financial events (`financialAuditLog`), license flag changes (`licenseFlagAudit`), and immutable financial records (`platformFinancialAuditLog`). Join request workflows are audited via the `joinRequests` table (with `reviewedBy`, `reviewedAt`, `approvalMethod`). However, there is NO unified "all platform activities" audit log that tracks every user action (user creation, role changes, course assignments, login/logout events, etc.) as described in the requirements. The tests below cover the implemented audit capabilities.

---

#### TC-AUD-001: Financial Audit Log Query

**Feature:** SuperAdmins can query the financial audit log to view financial events with full before/after state snapshots, actor identification, and timestamps.

**Intended Use / Business Case:** Financial audit trails are essential for compliance, fraud detection, and operational transparency. Every financial event (credit transactions, payment changes, subscription modifications) is logged with a complete before/after state diff, the acting user, their IP address, and precise timestamp.

**Pre-conditions:**
- User is logged in as SuperAdmin
- Financial events have occurred (e.g., credit transactions, payment settings changes, subscription updates)
- The `financialAuditLog` table has entries

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as a SuperAdmin. |
| 2 | Navigate to the SuperAdmin panel → Audit Logs section. |
| 3 | Verify the audit log list loads and displays log entries. |
| 4 | For each log entry, verify the following fields are shown: event type, entity type, entity ID, acting user, timestamp. |
| 5 | Click on a specific log entry to view its details. |
| 6 | Verify the detail view shows: `beforeState` (JSONB — the state before the change), `afterState` (JSONB — the state after the change), `ipAddress`, `userAgent`, and `notes`. |
| 7 | Verify the timestamps are in a readable format with timezone information. |
| 8 | Verify the `beforeState` and `afterState` allow you to identify exactly what changed. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The audit log displays a paginated list of financial events. Each entry shows event type, entity, actor, and timestamp. Detail views show before/after state diffs in a readable format. IP address and user agent are available for security auditing. |
| **Database** | Data sourced from `financialAuditLog` table via `GET /super-admin/audit-logs`. Each row contains: `eventType`, `entityType`, `entityId`, `userId` (actor), `beforeState` (JSONB), `afterState` (JSONB), `ipAddress`, `userAgent`, `timestamp`, `notes`. Indexed by `IDX_financial_audit_entity` and `IDX_financial_audit_timestamp` for efficient querying. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-AUD-002: Audit Log Filtering (by Action, Entity, Date Range)

**Feature:** The audit log supports filtering by event type (action), entity type, and date range, with pagination for large result sets.

**Intended Use / Business Case:** Compliance officers and auditors need to narrow down audit logs to specific events, entities, or time periods. Filtering by action type (e.g., "credit_deduction"), entity type (e.g., "subscription"), or date range enables targeted investigations and routine compliance reviews.

**Pre-conditions:**
- User is logged in as SuperAdmin
- The `financialAuditLog` has entries spanning multiple event types, entity types, and dates
- At least 20 audit log entries exist for pagination testing

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the SuperAdmin Audit Logs section. |
| 2 | Verify the log loads with all entries (no filter applied). |
| 3 | Apply a filter by event type (action) — select a specific event type from the dropdown. |
| 4 | Verify only entries matching the selected event type are displayed. |
| 5 | Clear the filter and apply a filter by entity type — select a specific entity type. |
| 6 | Verify only entries matching the selected entity type are displayed. |
| 7 | Clear the filter and apply a date range filter (start date to end date). |
| 8 | Verify only entries within the specified date range are displayed. |
| 9 | Apply multiple filters simultaneously (e.g., event type + date range). |
| 10 | Verify the results satisfy all applied filter criteria. |
| 11 | Verify pagination controls work: navigate to the next page of results, then back. |
| 12 | Verify the total count shown reflects the filtered result set. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Filter controls are available for: action (event type), entity type, start date, end date. Filters can be combined. Results update dynamically after filter changes. Pagination works correctly with `limit` and `offset` controls. The total count reflects filtered results. Clearing filters restores the full list. |
| **Database** | `GET /super-admin/audit-logs?action=X&entityType=X&startDate=X&endDate=X&limit=X&offset=X` applies WHERE conditions on `financialAuditLog`: `eventType` = action, `entityType` = entityType, `timestamp` >= startDate, `timestamp` <= endDate. Returns `{ logs: [...], total: N }` where `total` is the filtered count. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-AUD-003: Join Request Audit Trail

**Feature:** The join request audit trail provides a chronological record of all join request approvals, denials, and approval methods, accessible at the organization level.

**Intended Use / Business Case:** Organization administrators need to review the history of membership decisions — who was approved, who was denied, when, by whom, and through which method (dashboard or email link). This audit trail supports HR compliance and ensures accountability in membership management.

**Pre-conditions:**
- User is logged in as OrgAdmin or SuperAdmin
- The organization has processed join requests (some approved, some denied)
- The Billing Audit Log page is accessible

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Billing Audit Log page (`/billing-audit-log`) or access it via the Organization Dashboard. |
| 2 | Verify the page displays a chronological list of join request events. |
| 3 | For each approved request, verify the following are shown: user name, approval date (`approvedAt`), approving admin (`reviewedBy`), approval method ("dashboard" or "email_link"). |
| 4 | For each denied request, verify: user name, denial date (`reviewedAt`), denying admin (`reviewedBy`), denial reason (`denialReason`). |
| 5 | Verify the audit entries are sorted by date (most recent first). |
| 6 | Verify the list includes both dashboard approvals and email link approvals (if both methods have been used). |
| 7 | Cross-reference the audit entries with the actual join request records to verify data accuracy. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The audit log displays a clear, chronological list of join request decisions. Each entry shows the actor (admin who approved/denied), the subject (user who requested), the action (approved/denied), the method (dashboard/email_link), and the timestamp. Denied requests include the denial reason. |
| **Database** | Data sourced from `joinRequests` table via `GET /api/org/:organizationId/billing/audit-log`. Relevant fields: `status`, `reviewedBy` (FK to `users`), `reviewedAt`, `approvedAt`, `approvalMethod` ("dashboard"/"email_link"/"auto"), `denialReason`. Data enriched with user names from `users` table join. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-AUD-004: Actor Identification and Timestamp Accuracy

**Feature:** Every audit log entry includes accurate actor identification (who performed the action) and precise timestamps that reflect the actual event time.

**Intended Use / Business Case:** For legal and compliance purposes, it is essential that every recorded event in the audit trail can be attributed to a specific user (actor) and has an accurate, tamper-evident timestamp. This enables forensic investigations, dispute resolution, and regulatory reporting.

**Pre-conditions:**
- User is logged in as SuperAdmin
- The audit log has entries with known actors and known event times
- At least one audit event was created during the current test session (so the timestamp can be verified as recent)

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Perform a known auditable action as SuperAdmin (e.g., change a payment setting or approve a join request). Note the exact time you performed the action. |
| 2 | Navigate to the audit log section. |
| 3 | Locate the entry for the action you just performed. |
| 4 | Verify the actor (userId/name) matches your SuperAdmin identity. |
| 5 | Verify the timestamp on the entry is within 1–2 minutes of the actual time you performed the action. |
| 6 | For a financial audit log entry, verify the `ipAddress` field is populated and matches your current IP. |
| 7 | Verify the `userAgent` field is populated and matches your current browser's user agent string. |
| 8 | Review entries from other admins and verify their actor information is distinct and accurate. |
| 9 | Verify that the `platformFinancialAuditLog` (immutable audit) also records the `changedBy` and `changedAt` for relevant financial events. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The audit entry shows the correct actor name/ID. The timestamp is accurate (within seconds of the actual action time). IP address and user agent are visible for security review. Multiple actors are clearly distinguished in the log. |
| **Database** | `financialAuditLog.userId` correctly references the acting user. `financialAuditLog.timestamp` is accurate (server-generated at event time, not client-provided). `financialAuditLog.ipAddress` and `financialAuditLog.userAgent` are captured from the HTTP request. For immutable financial records: `platformFinancialAuditLog.changedBy` references the actor and `platformFinancialAuditLog.changedAt` is the event timestamp. `licenseFlagAudit.changedBy` is populated for feature flag changes. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

> **Gap Note:** The requirements (Slide 8) describe "Complete Visibility into Platform Activities" including comprehensive logging of all admin actions, user creation events, role changes, and course assignments. The current implementation provides:
> - **Financial events** → `financialAuditLog` (comprehensive with before/after state)
> - **License flag changes** → `licenseFlagAudit` (changedBy, createdAt)
> - **Join request decisions** → `joinRequests` table fields (reviewedBy, reviewedAt, approvalMethod)
> - **Immutable financial records** → `platformFinancialAuditLog` (tableName, recordId, changedBy, changedAt)
>
> **NOT YET IMPLEMENTED:** A unified, general-purpose platform activity audit log that tracks all user actions (user creation, role changes, login events, course assignments, hierarchy modifications) as a single queryable audit stream. This is flagged for future development to achieve the full audit trail vision described in the requirements.

---

## 5. Traceability Matrix

This matrix maps each requirement slide to its corresponding test cases, ensuring complete coverage.

| Requirement Slide | Test Case IDs | Coverage Status |
|-------------------|---------------|-----------------|
| Slide 1 (Title/Overview — "Your Organization, Your Way") | N/A — Context only | N/A |
| Slide 2 (Self-Service Registration — Smart Join Codes) | TC-REG-001, TC-REG-002, TC-REG-003, TC-REG-004, TC-REG-005, TC-REG-006, TC-REG-007 | Full (Note: Direct email invitations feature MISSING IN IMPLEMENTATION) |
| Slide 3 (3-Level Hierarchy — Departments → Units → Teams) | TC-HIER-001, TC-HIER-002, TC-HIER-003, TC-HIER-004, TC-HIER-005, TC-HIER-006 | Full |
| Slide 4 (Organization Management Hub — Drag-and-Drop) | TC-HUB-001, TC-HUB-002, TC-HUB-003, TC-HUB-004, TC-HUB-005, TC-HUB-006 | Full |
| Slide 5 (Role-Based Access — Right Access for Right People) | TC-RBAC-001, TC-RBAC-002, TC-RBAC-003, TC-RBAC-004, TC-RBAC-005, TC-RBAC-006 | Full |
| Slide 6 (Join Request Workflow — Approve or Reject) | TC-JR-001, TC-JR-002, TC-JR-003, TC-JR-004, TC-JR-005, TC-JR-006, TC-JR-007 | Full |
| Slide 7 (User Profiles — Track Progress and Achievements) | TC-PROF-001, TC-PROF-002, TC-PROF-003, TC-PROF-004, TC-PROF-005 | Full |
| Slide 8 (Audit Trails — Complete Visibility) | TC-AUD-001, TC-AUD-002, TC-AUD-003, TC-AUD-004 | Partial (General-purpose platform activity audit PARTIALLY IMPLEMENTED) |

**Total Test Cases:** 41

**Implementation Gaps Summary:**
1. **Slide 2 — Direct Email Invitations:** MISSING. No `/api/invite` endpoint exists. System uses join codes + email-based approval links instead.
2. **Slide 8 — Comprehensive Platform Activity Audit:** PARTIALLY IMPLEMENTED. Financial and join request audits exist. No unified audit log for all platform activities (user creation, role changes, course assignments, etc.).

---

## 6. Glossary

| Term | Definition |
|------|-----------|
| **approvalMethod** | Enum field on `joinRequests` indicating how the request was approved: "dashboard" (via the web UI), "email_link" (via one-click email token), or "auto" (automatic approval for General Org). |
| **DnD (Drag-and-Drop)** | UI interaction pattern where users can click, hold, and move elements (e.g., user cards) to new positions (e.g., hierarchy nodes). Implemented using the `@dnd-kit/core` library. |
| **financialAuditLog** | Database table that records all financial events with before/after state snapshots, actor identification, IP address, user agent, and timestamp. Used for compliance and forensic auditing. |
| **General Organization** | A special organization (where `isGeneralOrg` = true) that users are auto-enrolled into when they register without a join code. Provides immediate platform access without admin approval. |
| **Hierarchy Node** | A single element in the organizational tree: a Department (Level 1), Unit (Level 2), or Team (Level 3). Each node can have children and assigned members. |
| **inviteCode** | A unique code assigned to an organization at the top level. Used during registration to link a new user to the organization via a join request. |
| **Join Code** | A unique alphanumeric code assigned to each hierarchy level (organization, department, unit, team). When entered during registration, it determines which level the user is requesting to join. |
| **joinCode** | A unique code on `organizationUnits`, `organizationSubUnits`, and `organizationTeams` tables. Auto-generated during hierarchy node creation. Can be regenerated for teams. |
| **Join Request** | A record in the `joinRequests` table representing a user's request to join an organization. Has a lifecycle: pending → approved/denied. Captures the requested hierarchy placement and tracks the review process. |
| **licenseFlagAudit** | Database table that tracks changes to feature flags, recording who made the change (`changedBy`) and when (`createdAt`). |
| **Org Admin** | A user with the "org_admin" role in `userOrganizationRoles`. Has full management capabilities within their organization: hierarchy CRUD, user management, join request processing, and billing. |
| **organizationSubUnits** | Database table for Level 2 hierarchy nodes (Units in business, Classes in education, Modules in elearning). FK to `organizationUnits` via `unitId`. |
| **organizationTeams** | Database table for Level 3 hierarchy nodes (Teams in business, Sections in education, Cohorts in elearning). FK to `organizationSubUnits` via `subUnitId`. |
| **organizationUnits** | Database table for Level 1 hierarchy nodes (Departments in business, Grades in education, Courses in elearning). FK to `organizations` via `organizationId`. |
| **Principle of Least Privilege** | Security concept where users are granted only the minimum access necessary to perform their role. Enforced via role checks on both frontend routes (`ProtectedRoute`) and backend API middleware. |
| **platformFinancialAuditLog** | Immutable database audit trail for financial records. Tracks `tableName`, `recordId`, `changedBy`, and `changedAt`. Cannot be modified after creation. |
| **playerStats** | Database table tracking gamification metrics per user: XP, level, rank, game statistics (wins, losses, streaks), and certificates earned. |
| **SessionInvalidationService** | Server-side service that invalidates a user's active sessions (by incrementing `sessionVersion`), forcing re-authentication. Used after role changes or join request approvals to ensure the user's session reflects updated permissions. |
| **STLC** | Software Testing Life Cycle — the systematic process for planning, designing, executing, and evaluating software tests. |
| **Terminology** | Organization-type-specific labels for hierarchy levels. Education: Grade/Class/Section. Business: Department/Unit/Team. E-learning: Course/Module/Cohort. Configured via `getTerminologyForOrgType()`. |
| **userOrganizationAssignments** | Database table linking a user to a specific position in the organizational hierarchy. Fields: `unitId` (Department L1), `subUnitId` (Unit L2), `teamId` (Team L3). Updated when users are moved or assigned. |
| **userOrganizationRoles** | Database table storing organization-level role assignments. Valid roles: "org_admin", "teacher", "team_lead", "student", "employee". A user can have multiple roles in the same organization. |

---

*End of Document*
