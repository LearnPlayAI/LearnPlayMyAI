# Course Assignment & Progress Tracking — Test Cases Document

> Policy update (April 6, 2026): lesson certificates are deprecated and removed. Course certificates are the only supported certificate type. Any legacy lesson-certificate scenarios in this document are historical only and should not be executed in current environments.

**Document Version:** 1.0  
**Date:** February 6, 2026  
**Module Under Test:** Course Assignment & Progress Tracking (LESSON 5)  
**Methodology:** STLC-Aligned (Software Testing Life Cycle)  
**Requirements Source:** LESSON 5 — Course Assignment & Progress Tracking (9 Slides)  
**Technical Reference:** [`TECHNICAL_AUDIT.md`](./TECHNICAL_AUDIT.md) — Phase 1 Technical Stocktake  
**Author:** QA Engineering Team  

---

## Table of Contents

1. [Document Purpose & Scope](#1-document-purpose--scope)
2. [Test Environment & Prerequisites](#2-test-environment--prerequisites)
3. [Phase 1: Technical Stocktake — Feature-to-Code Mapping](#3-phase-1-technical-stocktake--feature-to-code-mapping)
   - 3.1 [Slide 1 — Title / Overview (Assign, Track, Certify)](#31-slide-1--title--overview-assign-track-certify)
   - 3.2 [Slide 2 — Course Assignment System (5-Level Scope)](#32-slide-2--course-assignment-system-5-level-scope)
   - 3.3 [Slide 3 — Progress Tracking (Real-Time Learner Progress)](#33-slide-3--progress-tracking-real-time-learner-progress)
   - 3.4 [Slide 4 — Draft Versioning System (Edit Without Disruption)](#34-slide-4--draft-versioning-system-edit-without-disruption)
   - 3.5 [Slide 5 — Certificate Management (Recognize Achievement)](#35-slide-5--certificate-management-recognize-achievement)
   - 3.6 [Slide 6 — Learner Analytics & Reporting (Data-Driven Insights)](#36-slide-6--learner-analytics--reporting-data-driven-insights)
   - 3.7 [Slide 7 — Deadline Management & Overdue Tracking](#37-slide-7--deadline-management--overdue-tracking)
   - 3.8 [Slide 8 — Notifications & Reminders](#38-slide-8--notifications--reminders)
   - 3.9 [Slide 9 — End-to-End Assignment Lifecycle](#39-slide-9--end-to-end-assignment-lifecycle)
4. [Phase 2: Master Test Documentation](#4-phase-2-master-test-documentation)
   - 4.1 [Course Assignment Management Tests (Slide 2)](#41-course-assignment-management-tests-slide-2)
   - 4.2 [Progress Tracking Tests (Slide 3)](#42-progress-tracking-tests-slide-3)
   - 4.3 [Draft Versioning Tests (Slide 4)](#43-draft-versioning-tests-slide-4)
   - 4.4 [Certificate Management Tests (Slide 5)](#44-certificate-management-tests-slide-5)
   - 4.5 [Learner Analytics & Reporting Tests (Slide 6)](#45-learner-analytics--reporting-tests-slide-6)
   - 4.6 [Notifications & Reminders Tests (Slide 8)](#46-notifications--reminders-tests-slide-8)
5. [Traceability Matrix](#5-traceability-matrix)
6. [Glossary](#6-glossary)

---

## 1. Document Purpose & Scope

This document provides a comprehensive, tester-friendly test case suite for the **Course Assignment & Progress Tracking** module of the LearnPlay e-learning platform. It is derived from the functional requirements outlined in "LESSON 5: Course Assignment & Progress Tracking" (9 slides) and mapped directly to the verified codebase implementation as documented in [`TECHNICAL_AUDIT.md`](./TECHNICAL_AUDIT.md).

**In Scope:**
- Course Assignment System with 5-level scope cascade (organization, department, unit, team, user)
- Mandatory/optional assignment flags and due date management
- Audience targeting (learner vs instructor)
- Course progress tracking (course-level and lesson-level)
- Dual-mechanism completion detection (quiz-based primary, lesson progress fallback)
- Draft versioning with full-clone approach and publish migration
- Certificate management (automatic generation, PDF download, social sharing, verification)
- Learner analytics and reporting (13 endpoints, KPIs, funnels, at-risk detection)
- Deadline tracking (overdue and upcoming assignments)
- Manual deadline email notifications

**Out of Scope:**
- AI-powered course creation, gamification, card trading, marketplace
- Infrastructure and deployment testing
- Performance and load testing (separate document)

**Implementation Gaps Identified:**
1. **Automated Reminder/Notification System** — The requirements describe automated escalation and scheduled reminders for overdue assignments. This feature is **NOT IMPLEMENTED**. Only manual email sending via `POST /:orgId/deadlines/email` exists. No automated escalation, no scheduled reminders, no cron-based notifications for overdue assignments.

---

## 2. Test Environment & Prerequisites

### 2.1 Required User Roles

| Role | Purpose | Access Level |
|------|---------|-------------|
| **SuperAdmin** | Platform-wide administration, analytics access, impersonation | All features |
| **OrgAdmin** | Organization-level course assignment, reporting, certificate management | Organization-scoped |
| **Teacher / Instructor** | Course assignment creation, progress monitoring, deadline management | Organization-scoped |
| **Team Lead** | Team-level oversight | Team-scoped |
| **Student / Learner** | Course consumption, progress tracking, certificate claiming | Read-only access to assigned courses |

### 2.2 Pre-requisites for All Tests

1. Active user session (logged in with appropriate role)
2. User belongs to an active organization (education, business, or elearning type)
3. Organization has a 3-level hierarchy with at least one department, unit, and team populated with users
4. At least one active course exists with lessons, quizzes, and PPTX content
5. Database is accessible and migration is current
6. Email service (MailerSend) is configured for notification tests
7. Replit Object Storage is configured for certificate PDF storage

### 2.3 Test Data Requirements

| Item | Description |
|------|-------------|
| Active Course | A published (status = "active") course with at least 3 lessons, each with linked quizzes and PPTX content |
| Organization Hierarchy | An organization with at least 2 departments, each containing 1+ units and 1+ teams |
| Test Learners | At least 5 learner accounts assigned to different levels of the hierarchy |
| Test Teacher | A teacher account with organization-scoped access |
| Completed Course | At least one learner who has passed all quizzes in a course (eligible for certificate) |
| Overdue Assignment | A course assignment with `dueDate` in the past and a learner who has not completed it |
| Second Course | A second active course for multi-assignment and analytics testing |

---

## 3. Phase 1: Technical Stocktake — Feature-to-Code Mapping

This section maps each requirement slide to the actual codebase implementation, linking feature descriptions to database tables, API endpoints, backend services, and frontend components.

---

### 3.1 Slide 1 — Title / Overview (Assign, Track, Certify)

**Requirement:** Overview slide introducing the Course Assignment & Progress Tracking module — "Assign, Track, Certify."

**Assessment:** This is a title slide providing context. No discrete testable features. The capabilities described are validated through Slides 2–9.

| Requirement | Implementation Status |
|-------------|----------------------|
| Assign courses to learners | Implemented via 5-level scope assignment system (Slide 2) |
| Track learner progress | Implemented via course and lesson progress tracking (Slide 3) |
| Certify achievement | Implemented via automatic certificate generation (Slide 5) |

---

### 3.2 Slide 2 — Course Assignment System (5-Level Scope)

**Requirement:** Assign courses to learners at 5 organizational levels — organization-wide, department, unit, team, and individual user — with mandatory/optional flags, due dates, and audience targeting.

| Feature | DB Tables | API Endpoints | Services/Logic | Frontend Components | Status |
|---------|-----------|---------------|----------------|---------------------|--------|
| Organization-level assignment | `courseAssignments` (assignmentScope = "organization", organizationId set) | `POST /api/course-assignments` | `CourseAssignmentService.createCourseAssignment()` | `CourseAssignments.tsx`, `AssignmentWizard.tsx` | **Implemented** |
| Department-level assignment | `courseAssignments` (assignmentScope = "department", unitId set) | `POST /api/course-assignments` | `CourseAssignmentService.createCourseAssignment()` | `CourseAssignments.tsx`, `AssignmentWizard.tsx` | **Implemented** |
| Multi-department assignment | `courseAssignments` (multiple assignmentScope = "department" rows for the same course, one per unitId) | `POST /api/course-assignments` (supports `targets[]`) | `CourseAssignmentService.upsertCourseAssignment()` — target identity preserves separate department rows | `CourseAssignmentModal.tsx`, `CourseAssignments.tsx` | **Implemented** |
| Unit-level assignment | `courseAssignments` (assignmentScope = "unit", subUnitId set) | `POST /api/course-assignments` | `CourseAssignmentService.createCourseAssignment()` | `CourseAssignments.tsx`, `AssignmentWizard.tsx` | **Implemented** |
| Team-level assignment | `courseAssignments` (assignmentScope = "team", teamId set) | `POST /api/course-assignments` | `CourseAssignmentService.createCourseAssignment()` | `CourseAssignments.tsx`, `AssignmentWizard.tsx` | **Implemented** |
| User-level assignment | `courseAssignments` (assignmentScope = "user", userId set) | `POST /api/course-assignments` | `CourseAssignmentService.createCourseAssignment()` | `CourseAssignments.tsx`, `AssignmentWizard.tsx` | **Implemented** |
| Mandatory/optional flag | `courseAssignments.mandatory` (boolean) | `POST /api/course-assignments` (body: mandatory) | `CourseAssignmentService` | `CourseEdit.tsx` (mandatory toggle), `AssignmentWizard.tsx` | **Implemented** |
| Due date setting | `courseAssignments.dueDate` (timestamp) | `POST /api/course-assignments` (body: dueDate) | `CourseAssignmentService` | `CourseEdit.tsx` (due date picker), `AssignmentWizard.tsx` | **Implemented** |
| Audience targeting (learner/instructor) | `courseAssignments.audience` (enum: learner/instructor) | `POST /api/course-assignments` (body: audience) | `CourseAssignmentService` | `AssignmentWizard.tsx` | **Implemented** |
| Assignment deletion | `courseAssignments` (row deleted) | `DELETE /api/course-assignments/:id` | `CourseAssignmentService.deleteCourseAssignment(id, orgId)` — with org isolation check | `CourseAssignments.tsx` | **Implemented** |
| Cascade resolution (user sees assignments from all levels) | `courseAssignments` queried at all scope levels matching user's org position | `GET /api/my-assigned-courses` | `CourseAssignmentService.getCourseAssignmentsForUser(userId, orgId)` — resolves user/team/subUnit/unit/org | `MyCourses.tsx` | **Implemented** |
| List assignments for org | `courseAssignments` (filtered by organizationId) | `GET /api/course-assignments` | `CourseAssignmentService.getCourseAssignmentsForOrg(orgId)` | `CourseAssignments.tsx` | **Implemented** |
| List assignments for specific course | `courseAssignments` (filtered by courseId + orgId) | `GET /api/course-assignments/course/:courseId` | `CourseAssignmentService.getCourseAssignmentsForCourse(courseId, orgId)` | `CourseLessons.tsx`, `CourseAssignments.tsx` | **Implemented** |

---

### 3.3 Slide 3 — Progress Tracking (Real-Time Learner Progress)

**Requirement:** Track learner progress at both the course level and individual lesson level, with percentage completion, status transitions (not_started → in_progress → completed), and dual-mechanism completion detection.

| Feature | DB Tables | API Endpoints | Services/Logic | Frontend Components | Status |
|---------|-----------|---------------|----------------|---------------------|--------|
| Course-level progress tracking | `courseProgress` (userId, courseId, organizationId, status, percentComplete, completedLessons, totalLessons, completedAt, updatedAt) | `GET /api/course-progress/:courseId` | `CourseCompletionService` | `MyCourses.tsx`, `StudentDashboard.tsx` | **Implemented** |
| Lesson-level progress tracking | `userCourseLessonProgress` (userId, courseId, lessonId, organizationId, status, completedAt) | `GET /api/my-assigned-courses` (enriched) | `CourseAssignmentService.getAssignedCoursesWithProgress()` | `MyCourses.tsx` | **Implemented** |
| Progress status enum | `courseProgressStatusEnum`: not_started, in_progress, completed | N/A (schema-level) | N/A | Progress badges and indicators | **Implemented** |
| Lesson progress status enum | `lessonProgressStatusEnum`: not_started, in_progress, completed | N/A (schema-level) | N/A | Lesson completion indicators | **Implemented** |
| Percentage complete calculation | `courseProgress.percentComplete` (decimal), `completedLessons` / `totalLessons` | `GET /api/course-progress/:courseId` | `CourseCompletionService` — computes based on quiz pass status | `MyCourses.tsx` (progress bar) | **Implemented** |
| Quiz-based completion (primary) | `userQuizProgress`, `quizGameResults` cross-referenced with `courseLessons` | Internally invoked on quiz completion | `CourseCompletionService.computeCourseQuizProgress()` — all quizzes passed = course complete | N/A (automatic) | **Implemented** |
| Lesson progress fallback | `userCourseLessonProgress` (status = "completed") | Internally checked when quiz data unavailable | `CourseCompletionService` — fallback mechanism | N/A (automatic) | **Implemented** |
| Assigned courses with progress | `courseAssignments` JOIN `courseProgress` JOIN `courses` | `GET /api/my-assigned-courses` | `CourseAssignmentService.getAssignedCoursesWithProgress(userId, orgId)` — filters to org_only visibility | `MyCourses.tsx` | **Implemented** |

---

### 3.4 Slide 4 — Draft Versioning System (Edit Without Disruption)

**Requirement:** Allow course creators to edit published courses without disrupting active learners. Full-clone draft approach — create a copy, edit the copy, then publish the draft which migrates all learner data seamlessly.

| Feature | DB Tables | API Endpoints | Services/Logic | Frontend Components | Status |
|---------|-----------|---------------|----------------|---------------------|--------|
| Create draft (full clone) | `courses` (new row with status = "draft", sourceVersionCourseId set), `courseLessons`, `lessons`, `lessonSlides`, `lessonPresentationVersions`, `quizCollections`, `quizCards`, `lessonQuizLinks` (all cloned), `courses.cloneMapping` (JSONB) | `POST /api/courses/:id/create-draft` | `CourseVersioningService.createDraft()` — atomic transaction, clones ALL content including Object Storage files | `CourseEdit.tsx` | **Implemented** |
| Get active draft | `courses` (where sourceVersionCourseId = original AND status = "draft") | `GET /api/courses/:id/draft` | `CourseVersioningService.getDraft(courseId)` | `CourseEdit.tsx` | **Implemented** |
| Update draft fields | `courses` (draft row updated) | `PATCH /api/courses/:id/draft` | `CourseVersioningService` | `CourseEdit.tsx` | **Implemented** |
| Publish draft (full data migration) | `courseProgress`, `coursePurchases`, `courseAssignments`, `userCourseEnrollments`, `userCourseLessonProgress`, `certificates` — all migrated from original to draft course; original marked "archived", draft promoted to "active" | `POST /api/courses/:id/publish-draft` | `CourseVersioningService.publishDraft()` — 6-table migration with lesson ID remapping via cloneMapping | `CourseEdit.tsx` | **Implemented** |
| Discard draft | `courses` (draft row and all cloned content deleted) | `DELETE /api/courses/:id/draft` | `CourseVersioningService.discardDraft()` | `CourseEdit.tsx` | **Implemented** |
| Duplicate draft prevention | `courses` (check for existing draft) | `POST /api/courses/:id/create-draft` — returns 409 if draft exists | `CourseVersioningService.createDraft()` — throws error if draft already exists | `CourseEdit.tsx` (disabled button) | **Implemented** |
| Dual-ID resolution | `courses` (if passed ID is draft with sourceVersionCourseId, resolves to original) | All draft endpoints | `CourseVersioningService` — resolves draft ID to real original course | N/A (server-side) | **Implemented** |
| Draft status listing | `courses` (all courses with draft status info) | `GET /api/courses/drafts-status` | `CourseVersioningService` | `CourseEdit.tsx` | **Implemented** |
| Validation before publish | `courses`, `courseLessons`, `lessons` (validated for PPTX content, quizzes, department assignment) | `POST /api/courses/:id/publish-draft` (internally calls validation) | `CourseService.validateCourseForPublish(draftId)` | `CourseEdit.tsx` (validation warnings) | **Implemented** |
| cloneMapping integrity | `courses.cloneMapping` (JSONB: originalCourseId, lessonIdMap, quizIdMap, quizCardIdMap, courseLessonIdMap, filesMap, clonedAt) | N/A (internal data structure) | `CourseVersioningService` — used during publish for ID remapping | N/A | **Implemented** |

---

### 3.5 Slide 5 — Certificate Management (Recognize Achievement)

**Requirement:** Automatically generate certificates on course completion, support lesson-level certificates, provide PDF download, social sharing, public verification, and email delivery.

| Feature | DB Tables | API Endpoints | Services/Logic | Frontend Components | Status |
|---------|-----------|---------------|----------------|---------------------|--------|
| Automatic course certificate generation | `certificates` (certificateType = "course", userId, courseId, organizationId, completedAt, certificateId, pdfStoragePath, pdfFileUrl) | Triggered internally on course completion | `CourseCompletionService` → `CertificateService.issueCertificate()` | N/A (automatic) | **Implemented** |
| Lesson certificate issuance | `certificates` (certificateType = "lesson", lessonId set) | `POST /api/lessons/:lessonId/certificates` | `CertificateService.issueLessonCertificate()` | `LessonViewer.tsx` | **Implemented** |
| Certificate gallery listing | `certificates` (paginated query for user) | `GET /api/certificates` (query: limit, offset) | `CertificateService` | `CertificateGallery.tsx` | **Implemented** |
| Get specific certificate | `certificates` (by certificateId) | `GET /api/certificates/:certificateId` | `CertificateService` | `CertificateGallery.tsx` | **Implemented** |
| PDF download with signed URL | `certificates.pdfStoragePath`, Object Storage signed URL | `GET /api/certificates/:certificateId/download` | `CertificateService` → `ObjectStorageService` (generates signed URL) | `CertificateGallery.tsx` (download button) | **Implemented** |
| Social sharing (LinkedIn/Twitter/Facebook) | `certificates.shareToken` (generated on share request) | `POST /api/certificates/:displayCertId/share` | `CertificateService` — generates share links for linkedin/twitter/facebook | `CertificateGallery.tsx` (share buttons) | **Implemented** |
| Public share token access | `certificates` (queried by shareToken, no auth) | `GET /api/certificates/shared/:shareToken` | `CertificateService` — public endpoint, no authentication required | Public certificate page | **Implemented** |
| Certificate verification | `certificates` (queried by certificateId) | `GET /api/verify/:certificateId` | `CertificateService` — public endpoint, no authentication required | Public verification page | **Implemented** |
| Email delivery with PDF attachment | `certificates` (emailSent tracking) | Triggered internally after certificate generation | `MailerSendService.sendCertificateEmail()` — non-blocking, with PDF attachment | N/A (email-based) | **Implemented** |
| Unclaimed certificate detection | `courseProgress` (completed) LEFT JOIN `certificates` (missing) | `GET /api/certificates/unclaimed-courses` | `CertificateService` — finds courses completed but certificate not yet claimed | `CertificateGallery.tsx` | **Implemented** |

---

### 3.6 Slide 6 — Learner Analytics & Reporting (Data-Driven Insights)

**Requirement:** Comprehensive learner analytics dashboard with KPIs, completion funnels, top performers, at-risk learner detection, quiz analytics, individual learner profiles, and filterable reports.

| Feature | DB Tables | API Endpoints | Services/Logic | Frontend Components | Status |
|---------|-----------|---------------|----------------|---------------------|--------|
| Overview KPIs with trends | `courseProgress`, `courseAssignments`, `userQuizProgress`, `users` | `GET /api/reports/learner-analytics/:orgId/overview` | `reportRoutes.ts` — activeLearners, totalLearners, completedCourses, avgQuizScore, completionRate, overdueCount, dueSoonCount + trend calculations | `Reports.tsx` | **Implemented** |
| Completion funnel (4 stages) | `courseProgress`, `userCourseEnrollments` | `GET /api/reports/learner-analytics/:orgId/completion-funnel` | `reportRoutes.ts` — enrolled → started → in_progress → completed (overall + per-course) | `Reports.tsx` | **Implemented** |
| Top performers | `userQuizProgress`, `courseProgress`, `users` | `GET /api/reports/learner-analytics/:orgId/top-performers` | `reportRoutes.ts` — ranked by quiz scores and courses completed | `Reports.tsx` | **Implemented** |
| At-risk learners | `courseProgress`, `courseAssignments`, `userQuizProgress` | `GET /api/reports/learner-analytics/:orgId/at-risk-learners` | `reportRoutes.ts` — low scores or overdue assignments | `Reports.tsx` | **Implemented** |
| Quiz analytics | `userQuizProgress`, `quizGameResults` | `GET /api/reports/learner-analytics/:orgId/quiz-analytics` | `reportRoutes.ts` | `Reports.tsx` | **Implemented** |
| Individual learner profile | `users`, `courseProgress`, `courseAssignments`, `userQuizProgress`, `certificates` | `GET /api/reports/learner-analytics/:orgId/learner/:userId/profile` | `reportRoutes.ts` — detailed analytics for a single learner | `Reports.tsx` | **Implemented** |
| Funnel drill-down | `courseProgress`, `users` | `GET /api/reports/learner-analytics/:orgId/funnel-details/:stage` | `reportRoutes.ts` — drill into specific funnel stage (enrolled/started/in_progress/completed) | `Reports.tsx`, `DrilldownModal.tsx` | **Implemented** |
| At-risk drill-down | `courseProgress`, `courseAssignments`, `users` | `GET /api/reports/learner-analytics/:orgId/at-risk-details/:type` | `reportRoutes.ts` — drill into at-risk category | `Reports.tsx`, `DrilldownModal.tsx` | **Implemented** |
| Per-course learner list | `courseProgress`, `courseAssignments`, `users` | `GET /api/reports/learner-analytics/:orgId/course-learners/:courseId` | `reportRoutes.ts` | `Reports.tsx` | **Implemented** |
| Quiz breakdown | `userQuizProgress`, `quizGameResults` | `GET /api/reports/learner-analytics/:orgId/quiz-breakdown` | `reportRoutes.ts` | `Reports.tsx` | **Implemented** |
| Quiz score range | `userQuizProgress` | `GET /api/reports/learner-analytics/:orgId/quiz-score-range/:range` | `reportRoutes.ts` | `Reports.tsx`, `StudentRangeModal.tsx` | **Implemented** |
| Filter support | All analytics tables | All learner-analytics endpoints (query params: courseId, departmentId/unitId, startDate, endDate, courseStatus, search, limit) | `parseReportFilters()` in `reportRoutes.ts` | `Reports.tsx` (filter controls) | **Implemented** |
| Performance heatmap | `courseProgress`, `userQuizProgress` | `GET /api/reports/organizations/:orgId/performance-heatmap` | `reportRoutes.ts` | `Reports.tsx` | **Implemented** |
| Organization summary | `courseProgress`, `users`, `courses` | `GET /api/reports/organizations/:orgId/summary` | `reportRoutes.ts` | `Reports.tsx` | **Implemented** |

---

### 3.7 Slide 7 — Deadline Management & Overdue Tracking

**Requirement:** Track overdue and upcoming assignment deadlines, display overdue badges, and provide deadline management views for administrators.

| Feature | DB Tables | API Endpoints | Services/Logic | Frontend Components | Status |
|---------|-----------|---------------|----------------|---------------------|--------|
| Deadline tracking (overdue + upcoming) | `courseAssignments` (dueDate), `courseProgress` (status) | `GET /api/reports/learner-analytics/:orgId/deadlines` | `reportRoutes.ts` — effective_assignments CTE resolving user/unit/subUnit/team cascade; overdue = dueDate < NOW() AND not completed; upcoming = dueDate within 7 days AND not completed | `Reports.tsx` | **Implemented** |
| Overdue count in KPIs | `courseAssignments`, `courseProgress` | `GET /api/reports/learner-analytics/:orgId/overview` (overdueCount field) | `reportRoutes.ts` — ca."dueDate" < NOW() AND (cp.status IS NULL OR cp.status != 'completed') | `Reports.tsx` (KPI card) | **Implemented** |
| Due soon count in KPIs | `courseAssignments`, `courseProgress` | `GET /api/reports/learner-analytics/:orgId/overview` (dueSoonCount field) | `reportRoutes.ts` — ca."dueDate" >= NOW() AND ca."dueDate" <= NOW() + INTERVAL '7 days' AND not completed | `Reports.tsx` (KPI card) | **Implemented** |
| Overdue badge on assigned courses | `courseAssignments.dueDate`, `courseProgress.status` | `GET /api/my-assigned-courses` (includes dueDate and progress) | `CourseAssignmentService.getAssignedCoursesWithProgress()` | `MyCourses.tsx` (overdue badge/indicator) | **Implemented** |

---

### 3.8 Slide 8 — Notifications & Reminders

**Requirement:** Automated reminders for overdue and upcoming assignments, certificate notification emails, escalation workflows.

| Feature | DB Tables | API Endpoints | Services/Logic | Frontend Components | Status |
|---------|-----------|---------------|----------------|---------------------|--------|
| Manual deadline email sending | `courseAssignments`, `users` | `POST /api/reports/learner-analytics/:orgId/deadlines/email` | `reportRoutes.ts` — RBAC: teacher/instructor/org_admin/super_admin only; sends reminder emails via MailerSendService | `Reports.tsx` (send reminder button) | **Implemented** |
| Certificate email notification | `certificates`, `users` | Triggered internally on certificate generation | `MailerSendService.sendCertificateEmail()` — non-blocking, with PDF attachment | N/A (email-based) | **Implemented** |
| Automated reminder system (cron-based) | — | — | — | — | **NOT IMPLEMENTED** — No automated escalation, no scheduled reminders, no cron-based notifications for overdue assignments. Only manual email sending exists. |
| Escalation workflows | — | — | — | — | **NOT IMPLEMENTED** — No automated escalation chains for overdue assignments. |

---

### 3.9 Slide 9 — End-to-End Assignment Lifecycle

**Requirement:** Complete lifecycle from course assignment to certification — assign course → learner receives assignment → learner progresses through course → learner completes all quizzes → automatic certificate generation → certificate sharing.

**Assessment:** This is a workflow slide validated by the combination of features tested in Slides 2–8. The end-to-end lifecycle test (TC-ASSIGN-015) covers this complete flow.

| Workflow Step | Validated By |
|---------------|-------------|
| 1. Assign course to learners | Course Assignment System (Slide 2) |
| 2. Learner sees assigned courses | Cascade resolution + My Courses page (Slide 2) |
| 3. Learner progresses through course | Progress Tracking (Slide 3) |
| 4. Course completion detection | Dual-mechanism completion (Slide 3) |
| 5. Automatic certificate generation | Certificate Management (Slide 5) |
| 6. Certificate sharing | Social sharing + verification (Slide 5) |
| 7. Admin monitors progress | Learner Analytics (Slide 6) |

---

## 4. Phase 2: Master Test Documentation

This section contains detailed test cases organized by requirement slide. Each test case includes granular, non-technical steps suitable for a human tester, along with expected UI outcomes and expected database states.

---

### 4.1 Course Assignment Management Tests (Slide 2)

---

#### TC-ASSIGN-001: Assign Course at Organization Level

**Feature:** Assign a course to all users in an organization using the "organization" scope level.

**Intended Use / Business Case:** An organization administrator wants all members across all departments, units, and teams to complete a mandatory compliance course. By assigning at the organization level, every current member receives the assignment without needing to specify individual departments or teams.

**Pre-conditions:**
- User is logged in as Teacher, OrgAdmin, or SuperAdmin
- An active course exists in the organization
- The organization has at least 5 members across different hierarchy levels
- User is on the Course Assignments page (`/course-assignments`)

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Course Assignments page (`/course-assignments`). |
| 2 | Click the "Assign Course" or "New Assignment" button to open the Assignment Wizard. |
| 3 | Select a course from the course selection dropdown or list. |
| 4 | In the scope selection, choose "Organization" (or "Entire Organization"). |
| 5 | Set the audience to "Learner". |
| 6 | Toggle the mandatory flag to "Mandatory". |
| 7 | Set a due date (e.g., 30 days from today). |
| 8 | Click "Assign" or "Create Assignment" to confirm. |
| 9 | Observe the success notification. |
| 10 | Verify the new assignment appears in the assignments list. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | A success toast notification confirms the assignment was created. The new assignment appears in the assignments list showing the course name, scope = "Organization", mandatory badge, due date, and audience = "Learner". |
| **Database** | A new row in `courseAssignments` with: `courseId` = selected course, `organizationId` = current org, `assignmentScope` = "organization", `userId` = null (group assignment), `unitId` = null, `subUnitId` = null, `teamId` = null, `audience` = "learner", `mandatory` = true, `dueDate` = set date, `assignedBy` = current user ID, `assignedAt` = current timestamp. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ASSIGN-002: Assign Course at Department Level

**Feature:** Assign a course to all users within a specific department (Level 1 unit) using the "department" scope level.

**Intended Use / Business Case:** A department head needs all members in their department — including those in sub-units and teams — to complete a department-specific training course. The department-level assignment cascades to all child units and teams.

**Pre-conditions:**
- User is logged in as Teacher, OrgAdmin, or SuperAdmin
- An active course exists
- The organization has at least one department with users
- User is on the Course Assignments page

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Course Assignments page (`/course-assignments`). |
| 2 | Click "Assign Course" to open the Assignment Wizard. |
| 3 | Select a course. |
| 4 | In the scope selection, choose "Department" (or Level 1 hierarchy terminology). |
| 5 | From the department dropdown, select a specific department. |
| 6 | Set the audience to "Learner" and mandatory to "Optional". |
| 7 | Set a due date. |
| 8 | Click "Assign" to create the assignment. |
| 9 | Verify the assignment appears in the list with scope = "Department" and the department name. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Success toast. Assignment appears in the list with course name, scope = "Department", department name, optional badge, due date, and audience. |
| **Database** | A new row in `courseAssignments` with: `assignmentScope` = "department", `unitId` = selected department ID (from `organizationUnits`), `subUnitId` = null, `teamId` = null, `userId` = null, `mandatory` = false. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ASSIGN-003: Assign Course at Unit Level

**Feature:** Assign a course to all users within a specific unit (Level 2 sub-unit) using the "unit" scope level.

**Intended Use / Business Case:** A unit manager assigns a technical training course to all team members within their unit, including all teams nested under it. Other units in the same department are not affected.

**Pre-conditions:**
- User is logged in as Teacher, OrgAdmin, or SuperAdmin
- An active course exists
- The organization has a department with at least one unit containing users
- User is on the Course Assignments page

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Course Assignments page (`/course-assignments`). |
| 2 | Click "Assign Course" to open the Assignment Wizard. |
| 3 | Select a course. |
| 4 | Choose scope = "Unit" (Level 2). |
| 5 | Select the parent department, then select the specific unit. |
| 6 | Set audience, mandatory flag, and due date as desired. |
| 7 | Click "Assign" to create the assignment. |
| 8 | Verify the assignment appears with scope = "Unit" and the unit name. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Success toast. Assignment listed with scope = "Unit", showing the unit name. Only users in that unit (and its child teams) will see this assignment on their My Courses page. |
| **Database** | A new row in `courseAssignments` with: `assignmentScope` = "unit", `subUnitId` = selected unit ID (from `organizationSubUnits`), `unitId` = parent department ID, `teamId` = null, `userId` = null. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ASSIGN-004: Assign Course at Team Level

**Feature:** Assign a course to all users within a specific team (Level 3) using the "team" scope level.

**Intended Use / Business Case:** A team lead assigns a specialized skills course to their specific team only. No other teams or units are affected.

**Pre-conditions:**
- User is logged in as Teacher, OrgAdmin, or SuperAdmin
- An active course exists
- The organization has a team with assigned users
- User is on the Course Assignments page

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Course Assignments page (`/course-assignments`). |
| 2 | Click "Assign Course" to open the Assignment Wizard. |
| 3 | Select a course. |
| 4 | Choose scope = "Team" (Level 3). |
| 5 | Select the parent department, then unit, then the specific team. |
| 6 | Set audience, mandatory flag, and due date. |
| 7 | Click "Assign" to create the assignment. |
| 8 | Verify the assignment appears with scope = "Team" and the team name. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Success toast. Assignment listed with scope = "Team", showing the team name. Only users directly assigned to that specific team will see this assignment. |
| **Database** | A new row in `courseAssignments` with: `assignmentScope` = "team", `teamId` = selected team ID (from `organizationTeams`), `subUnitId` = parent unit ID, `unitId` = parent department ID, `userId` = null. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ASSIGN-005: Assign Course to Individual User

**Feature:** Assign a course to a specific individual user using the "user" scope level.

**Intended Use / Business Case:** An instructor identifies a specific learner who needs remedial training or a specialized elective. The individual assignment ensures only that one user receives the course assignment.

**Pre-conditions:**
- User is logged in as Teacher, OrgAdmin, or SuperAdmin
- An active course exists
- At least one learner exists in the organization
- User is on the Course Assignments page

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Course Assignments page (`/course-assignments`). |
| 2 | Click "Assign Course" to open the Assignment Wizard. |
| 3 | Select a course. |
| 4 | Choose scope = "User" (Individual). |
| 5 | Search for and select a specific user from the user list or search input. |
| 6 | Set audience to "Learner", mandatory = true, and a due date. |
| 7 | Click "Assign" to create the assignment. |
| 8 | Verify the assignment appears with scope = "User" and the user's name. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Success toast. Assignment listed with scope = "User", showing the individual user's name. Only that specific user will see this assignment on their My Courses page. |
| **Database** | A new row in `courseAssignments` with: `assignmentScope` = "user", `userId` = selected user's ID, `unitId` = null, `subUnitId` = null, `teamId` = null, `mandatory` = true. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ASSIGN-006: Mandatory vs Optional Assignment Flags

**Feature:** Create two assignments for the same course — one mandatory and one optional — and verify the mandatory flag is correctly stored and displayed.

**Intended Use / Business Case:** Organizations need to distinguish between courses that are required for compliance (mandatory) and courses that are recommended but not required (optional). The mandatory flag drives overdue tracking and reporting.

**Pre-conditions:**
- User is logged in as Teacher, OrgAdmin, or SuperAdmin
- An active course exists
- User is on the Course Assignments page

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Create a new course assignment with mandatory = true (follow TC-ASSIGN-001 steps). |
| 2 | Note the assignment ID and verify "Mandatory" badge appears in the assignment list. |
| 3 | Create a second course assignment (different scope or audience) with mandatory = false. |
| 4 | Verify "Optional" badge (or absence of "Mandatory" badge) appears for the second assignment. |
| 5 | Log in as a learner who falls within both assignment scopes. |
| 6 | Navigate to My Courses (`/my-courses`). |
| 7 | Verify both courses appear. Confirm the mandatory course shows a "Mandatory" indicator while the optional one does not. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The assignment list clearly distinguishes mandatory and optional assignments with visual badges. On the learner's My Courses page, mandatory assignments show a "Mandatory" label or badge. Optional assignments do not show the mandatory indicator. |
| **Database** | Two `courseAssignments` rows: one with `mandatory` = true, another with `mandatory` = false. Both have valid `courseId`, `organizationId`, and `assignedBy`. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ASSIGN-007: Due Date Setting and Overdue Detection

**Feature:** Set a due date on a course assignment and verify that assignments past the due date are flagged as overdue for learners who have not completed the course.

**Intended Use / Business Case:** Training managers set deadlines for compliance courses. When learners miss the deadline, the system flags the assignment as overdue in reports and on the learner's dashboard, enabling timely follow-up.

**Pre-conditions:**
- User is logged in as Teacher, OrgAdmin, or SuperAdmin
- An active course exists
- A learner exists who has not completed the course
- User is on the Course Assignments page

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Create a new course assignment with a due date set to yesterday (already past). |
| 2 | Verify the assignment is created with the past due date. |
| 3 | Log in as a learner who falls within the assignment scope. |
| 4 | Navigate to My Courses (`/my-courses`). |
| 5 | Verify the assigned course shows an "Overdue" badge or warning indicator. |
| 6 | Log back in as the teacher/admin. |
| 7 | Navigate to the Reports page (`/reports`). |
| 8 | Check the Overview KPIs — verify `overdueCount` includes this assignment. |
| 9 | Navigate to the Deadlines section and verify this assignment appears in the "Overdue" list. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The learner sees an overdue badge/indicator on the assigned course. The admin's Reports page shows an incremented overdueCount KPI. The Deadlines section lists this assignment as overdue with the learner's name, course name, and past due date. |
| **Database** | `courseAssignments.dueDate` < NOW(). `courseProgress` for this user/course either does not exist (not started) or has `status` != "completed". The deadlines endpoint query: `ca."dueDate" < NOW() AND (cp.status IS NULL OR cp.status != 'completed')` matches this record. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ASSIGN-008: Audience Targeting (Learner vs Instructor)

**Feature:** Create course assignments targeting different audiences — one for learners and one for instructors — and verify each audience only sees their relevant assignments.

**Intended Use / Business Case:** An organization may assign a course to learners for training purposes and separately assign a "train-the-trainer" version to instructors. Audience targeting ensures the right people see the right assignments.

**Pre-conditions:**
- User is logged in as Teacher, OrgAdmin, or SuperAdmin
- An active course exists
- The organization has users with both "learner" and "instructor" roles

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Create a course assignment with audience = "Learner" at the organization scope. |
| 2 | Create a second course assignment (same or different course) with audience = "Instructor". |
| 3 | Log in as a user with the "learner/student" role. |
| 4 | Navigate to My Courses (`/my-courses`). |
| 5 | Verify only the learner-targeted assignment appears. |
| 6 | Log in as a user with the "teacher/instructor" role. |
| 7 | Verify the instructor-targeted assignment appears in their relevant views. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Learners see only assignments with `audience` = "learner". Instructors see assignments with `audience` = "instructor". The audience filtering is enforced on the My Courses page and relevant dashboard views. |
| **Database** | Two `courseAssignments` rows: one with `audience` = "learner", another with `audience` = "instructor". The `courseAssignmentAudienceEnum` values are correctly stored. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ASSIGN-009: Delete Course Assignment

**Feature:** Delete an existing course assignment, removing it from all affected learners' assigned courses lists.

**Intended Use / Business Case:** An administrator realizes a course assignment was created in error or is no longer needed. Deleting the assignment removes it from all learners' dashboards immediately.

**Pre-conditions:**
- User is logged in as Teacher, OrgAdmin, or SuperAdmin
- An existing course assignment exists in the organization
- The assignment ID is known
- User is on the Course Assignments page

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Course Assignments page (`/course-assignments`). |
| 2 | Locate the assignment to be deleted in the assignments list. |
| 3 | Click the "Delete" or trash icon button on the assignment row. |
| 4 | If a confirmation dialog appears, confirm the deletion. |
| 5 | Observe the success notification confirming deletion. |
| 6 | Verify the assignment no longer appears in the assignments list. |
| 7 | Log in as a learner who was affected by this assignment. |
| 8 | Navigate to My Courses (`/my-courses`). |
| 9 | Verify the deleted assignment no longer appears in their assigned courses. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Success toast confirms deletion. The assignment disappears from the assignments list. The learner no longer sees this course in their assigned courses on My Courses. |
| **Database** | The `courseAssignments` row with the specified ID is deleted. `DELETE /api/course-assignments/:id` enforces org isolation — only assignments within the user's organization can be deleted. The `courseProgress` records for learners are NOT deleted (progress is preserved even after assignment removal). |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ASSIGN-010: Cascade Resolution — Learner Sees Assignments from All Levels

**Feature:** A learner who is assigned to a specific team in the hierarchy sees course assignments from all applicable scope levels — organization, department, unit, team, and individual.

**Intended Use / Business Case:** A learner in "Team Alpha" within "Unit Backend" within "Department Engineering" should see: organization-wide assignments, Engineering department assignments, Backend unit assignments, Team Alpha assignments, and any individual assignments. This cascade ensures no required training is missed.

**Pre-conditions:**
- A learner account is assigned to: Organization → Department "Engineering" → Unit "Backend" → Team "Alpha"
- Separate course assignments exist at each of the 5 scope levels, each targeting a different course
- Learner is logged in

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | As an admin, create 5 separate course assignments (each with a different course): one at organization scope, one at department "Engineering" scope, one at unit "Backend" scope, one at team "Alpha" scope, and one for this specific user. |
| 2 | Log in as the learner assigned to Team Alpha. |
| 3 | Navigate to My Courses (`/my-courses`). |
| 4 | Count the number of assigned courses displayed. |
| 5 | Verify all 5 courses appear in the assigned courses list. |
| 6 | Verify each course shows the correct assignment metadata (mandatory/optional, due date). |
| 7 | Log in as a learner in a DIFFERENT department (not Engineering). |
| 8 | Navigate to My Courses. |
| 9 | Verify this learner sees only the organization-level assignment (and not the Engineering/Backend/Alpha assignments). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The Team Alpha learner sees all 5 courses on their My Courses page. The learner from a different department sees only 1 course (the org-wide assignment). The cascade correctly resolves from the most specific (user) to the broadest (organization) scope. |
| **Database** | `GET /api/my-assigned-courses` calls `CourseAssignmentService.getCourseAssignmentsForUser(userId, orgId)` which queries `courseAssignments` at all 5 scope levels based on the user's `userOrganizationAssignments` (unitId, subUnitId, teamId) and `userId`. Returns the union of all matching assignments. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ASSIGN-011: Organization Isolation — Cross-Org Assignment Prevention

**Feature:** Course assignments are isolated to the organization they belong to. Users cannot view, modify, or delete assignments from other organizations.

**Intended Use / Business Case:** In a multi-tenant platform, organizations must be fully isolated. An admin in Organization A must not be able to see or manipulate assignments belonging to Organization B, even if they know the assignment ID.

**Pre-conditions:**
- Two separate organizations exist (Org A and Org B)
- Each organization has at least one course assignment
- Admin users exist in both organizations
- The assignment ID from Org B is known

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as an admin in Organization A. |
| 2 | Navigate to the Course Assignments page (`/course-assignments`). |
| 3 | Verify only Organization A's assignments are displayed. |
| 4 | Attempt to delete an assignment from Organization B by calling `DELETE /api/course-assignments/:orgBAssignmentId` via the browser console or API tool. |
| 5 | Verify the deletion is rejected with an authorization error. |
| 6 | Log in as an admin in Organization B. |
| 7 | Verify Organization B's assignments are intact and visible. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Organization A's admin sees only Organization A's assignments. No cross-org data leakage occurs. Attempting to delete Org B's assignment returns an error. |
| **Database** | `CourseAssignmentService.deleteCourseAssignment(id, orgId)` verifies the assignment's `organizationId` matches the requesting user's org before deletion. If mismatch, the operation is rejected. No rows in `courseAssignments` from Org B are modified. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ASSIGN-012: Learner Views Assigned Courses with Progress

**Feature:** A learner views their assigned courses on the My Courses page, enriched with progress data (status, percentage, completed lessons count).

**Intended Use / Business Case:** Learners need a central dashboard showing all their assigned courses with progress indicators — so they know what to work on, how far they've come, and which courses need attention.

**Pre-conditions:**
- A learner has at least 3 assigned courses via course assignments
- The learner has started at least one course (partial progress)
- The learner has completed at least one course
- The learner has not started at least one course

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as the learner. |
| 2 | Navigate to My Courses (`/my-courses`). |
| 3 | Verify assigned courses are displayed. |
| 4 | For the not-started course: verify status shows "Not Started" and progress is 0%. |
| 5 | For the in-progress course: verify status shows "In Progress" with a partial progress percentage (e.g., 33% or 66%). |
| 6 | For the completed course: verify status shows "Completed" with 100% progress and a completion date. |
| 7 | Verify each course card shows: course title, thumbnail, mandatory/optional badge, due date (if set), and progress bar. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | My Courses page displays all assigned courses with accurate progress indicators. Not-started courses show 0% with "Not Started" status. In-progress courses show partial completion with a progress bar. Completed courses show 100% with "Completed" status and a green indicator. Each card includes the course title, thumbnail, and assignment metadata. |
| **Database** | `GET /api/my-assigned-courses` calls `CourseAssignmentService.getAssignedCoursesWithProgress(userId, orgId)` which JOINs `courseAssignments` with `courseProgress` and `courses`. Results filtered to `org_only` visibility. Each result includes: `assignment` object, `course` object (title, thumbnailUrl, status), and `progress` object (status, percentComplete, completedLessons, totalLessons, completedAt). |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ASSIGN-013: Assign Course from CourseEdit Page

**Feature:** Assign a course directly from the Course Edit page using the due date picker and mandatory toggle embedded in the course editing interface.

**Intended Use / Business Case:** Course creators want to set assignment parameters (mandatory flag, due date) while editing the course content, without navigating to a separate assignment management page.

**Pre-conditions:**
- User is logged in as Teacher, OrgAdmin, or SuperAdmin
- An active course exists and the user is on the Course Edit page (`/courses/:id/edit`)

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Course Edit page for an active course (`/courses/:id/edit`). |
| 2 | Locate the assignment section (due date picker and mandatory toggle). |
| 3 | Set the due date using the date picker. |
| 4 | Toggle the mandatory flag on. |
| 5 | Save the course changes. |
| 6 | Navigate to the Course Assignments page and verify the assignment reflects the updated due date and mandatory flag. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The Course Edit page provides inline controls for assignment parameters. Changes save successfully with a toast notification. The Course Assignments page reflects the updated values. |
| **Database** | The `courseAssignments` record for this course is updated with the new `dueDate` and `mandatory` values. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ASSIGN-014: RBAC — Non-Teacher Cannot Create Assignments

**Feature:** Users with the "student" or "learner" role are prevented from creating, modifying, or deleting course assignments.

**Intended Use / Business Case:** Only authorized personnel (teachers, org admins, super admins) should be able to assign courses. Students should not be able to manipulate assignments.

**Pre-conditions:**
- A learner/student account exists in the organization
- Learner is logged in

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as a student/learner. |
| 2 | Attempt to navigate to the Course Assignments page (`/course-assignments`). |
| 3 | Verify the page is either not accessible (403/redirect) or does not show assignment creation controls. |
| 4 | Attempt to call `POST /api/course-assignments` directly via the browser console with valid assignment data. |
| 5 | Verify the API returns a 401 or 403 error rejecting the request. |
| 6 | Attempt to call `DELETE /api/course-assignments/:id` for an existing assignment. |
| 7 | Verify the API returns a 401 or 403 error. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The Course Assignments management page is either inaccessible (route protected) or does not render creation/deletion controls for learner roles. No "Assign Course" button is visible. |
| **Database** | No `courseAssignments` rows are created or deleted. The API middleware (`isTeacherOrAdmin`) blocks the request before it reaches the service layer. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ASSIGN-015: End-to-End Assignment Lifecycle

**Feature:** Complete lifecycle from assignment creation to learner completion and certificate generation.

**Intended Use / Business Case:** Validates the full flow: admin assigns a mandatory course → learner receives it → learner completes all lessons/quizzes → system detects completion → certificate is generated → admin sees completion in reports.

**Pre-conditions:**
- A teacher/admin account and a learner account exist in the same organization
- An active course with 2+ lessons (each with quizzes) exists
- The learner is assigned to a department/unit/team in the hierarchy

**Test Steps:**

| Step | Action |
|------|--------|
| **STEP 1: Assignment** | |
| 1.1 | Log in as teacher. Navigate to Course Assignments. |
| 1.2 | Assign the course at the team level targeting the learner's team. Set mandatory = true with a due date 30 days from now. |
| 1.3 | Verify assignment creation success. |
| **STEP 2: Learner Receives Assignment** | |
| 2.1 | Log in as the learner. Navigate to My Courses (`/my-courses`). |
| 2.2 | Verify the assigned course appears with "Mandatory" badge and due date. |
| 2.3 | Verify progress shows "Not Started" (0%). |
| **STEP 3: Learner Progresses** | |
| 3.1 | Click on the course to open it. Begin the first lesson. |
| 3.2 | Complete the first lesson's quiz (pass). |
| 3.3 | Return to My Courses and verify progress has updated (e.g., 50% for a 2-lesson course). |
| **STEP 4: Learner Completes Course** | |
| 4.1 | Complete the remaining lesson quizzes. |
| 4.2 | Verify My Courses shows 100% progress and "Completed" status. |
| **STEP 5: Certificate Generation** | |
| 5.1 | Navigate to the Certificate Gallery (`/certificates`). |
| 5.2 | Verify a course completion certificate has been automatically generated. |
| 5.3 | Download the certificate PDF and verify it opens correctly. |
| **STEP 6: Admin Verification** | |
| 6.1 | Log in as teacher. Navigate to Reports (`/reports`). |
| 6.2 | Verify the learner appears in the completion funnel "completed" stage. |
| 6.3 | Verify the overview KPIs reflect the new completion. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The complete lifecycle executes without errors across all steps. Assignment → progress → completion → certification → reporting all function correctly. |
| **Database — Step 1** | `courseAssignments` row created with scope, mandatory, dueDate. |
| **Database — Step 2** | `GET /api/my-assigned-courses` returns the assignment with course details. |
| **Database — Step 3** | `courseProgress` row created/updated with `status` = "in_progress", `percentComplete` updated, `completedLessons` incremented. `userCourseLessonProgress` rows created for completed lessons. |
| **Database — Step 4** | `courseProgress.status` = "completed", `percentComplete` = 100, `completedAt` set. |
| **Database — Step 5** | `certificates` row created with `certificateType` = "course", `pdfStoragePath` populated, `certificateId` (display ID) generated. |
| **Database — Step 6** | Reports endpoints aggregate data from `courseProgress`, `courseAssignments`, and `certificates` tables. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

### 4.2 Progress Tracking Tests (Slide 3)

---

#### TC-PROG-001: Course Progress Initialization (Not Started)

**Feature:** When a learner is assigned a course but has not yet opened it, the progress status is "not_started" with 0% completion.

**Intended Use / Business Case:** The system accurately reflects that a learner has not begun a course, allowing admins to identify who hasn't started their training.

**Pre-conditions:**
- A learner has been assigned a course via `courseAssignments`
- The learner has not opened or interacted with the course

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as the learner. |
| 2 | Navigate to My Courses (`/my-courses`). |
| 3 | Locate the assigned course. |
| 4 | Verify the progress indicator shows "Not Started" or 0%. |
| 5 | Call `GET /api/course-progress/:courseId` and verify the response. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The course card displays "Not Started" status with a 0% progress bar (or empty progress indicator). No completion date is shown. |
| **Database** | Either no `courseProgress` row exists for this user/course (null progress = not started) OR a `courseProgress` row exists with `status` = "not_started", `percentComplete` = 0, `completedLessons` = 0. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-PROG-002: Progress Update to In-Progress

**Feature:** When a learner starts a course by completing at least one lesson quiz, the progress status transitions from "not_started" to "in_progress" with the appropriate percentage.

**Intended Use / Business Case:** Administrators can distinguish between learners who haven't started and those who are actively working through a course. The progress percentage helps identify who is on track.

**Pre-conditions:**
- A learner has an assigned course with at least 3 lessons (each with quizzes)
- The learner has not started the course yet

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as the learner. Navigate to My Courses. |
| 2 | Open the assigned course and start the first lesson. |
| 3 | Complete the first lesson's quiz (pass it). |
| 4 | Return to My Courses. |
| 5 | Verify the progress has updated from "Not Started" to "In Progress". |
| 6 | Verify the percentage shows approximately 33% (1 of 3 lessons completed). |
| 7 | Call `GET /api/course-progress/:courseId` and check the response. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | My Courses page shows the course with "In Progress" status. The progress bar fills to approximately 33%. The completed lessons count shows "1 of 3". |
| **Database** | `courseProgress` row exists with: `status` = "in_progress", `percentComplete` ≈ 33.33, `completedLessons` = 1, `totalLessons` = 3, `completedAt` = null, `updatedAt` = recent timestamp. `userCourseLessonProgress` row exists for the completed lesson with `status` = "completed", `completedAt` set. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-PROG-003: Lesson Completion Tracking

**Feature:** Each lesson completion is individually tracked in the `userCourseLessonProgress` table, recording the user, course, lesson, and completion timestamp.

**Intended Use / Business Case:** Granular lesson-level tracking enables admins to see exactly which lessons a learner has completed and which remain, enabling targeted support for struggling learners.

**Pre-conditions:**
- A learner has an assigned course with 3+ lessons
- The learner has completed at least 2 lessons

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as the learner. Open the assigned course. |
| 2 | Complete the first lesson quiz. Note the completion time. |
| 3 | Complete the second lesson quiz. Note the completion time. |
| 4 | Navigate to My Courses and verify the progress count shows "2 of N" lessons completed. |
| 5 | Verify each completed lesson shows a completion indicator (checkmark, green icon). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The course progress shows "2 of N" lessons completed. Each completed lesson displays a visual completion indicator. Uncompleted lessons show as pending or not started. |
| **Database** | Two `userCourseLessonProgress` rows exist for this user/course: each with `status` = "completed", `completedAt` = timestamp of completion, `lessonId` = the completed lesson's ID, `organizationId` = user's org. Remaining lessons either have no row or `status` = "not_started". |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-PROG-004: Percentage Complete Calculation

**Feature:** The `percentComplete` field accurately reflects the ratio of completed lessons to total lessons, updating in real-time as lessons are completed.

**Intended Use / Business Case:** Progress bars and percentage displays give learners and admins an at-a-glance view of how far along a learner is in a course. Accuracy is critical for reporting and compliance tracking.

**Pre-conditions:**
- A course has exactly 4 lessons (each with quizzes)
- A learner is assigned to this course

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Before starting: verify percentComplete = 0%. |
| 2 | Complete lesson 1 quiz. Verify percentComplete = 25%. |
| 3 | Complete lesson 2 quiz. Verify percentComplete = 50%. |
| 4 | Complete lesson 3 quiz. Verify percentComplete = 75%. |
| 5 | Complete lesson 4 quiz. Verify percentComplete = 100%. |
| 6 | After each step, call `GET /api/course-progress/:courseId` and verify the `percentComplete` field. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The progress bar and percentage text update after each lesson completion: 0% → 25% → 50% → 75% → 100%. The visual progress bar accurately reflects the percentage. |
| **Database** | `courseProgress.percentComplete` updates incrementally: 0 → 25 → 50 → 75 → 100. `courseProgress.completedLessons` increments: 0 → 1 → 2 → 3 → 4. `courseProgress.totalLessons` = 4 throughout. At 100%, `courseProgress.status` = "completed" and `completedAt` is set. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-PROG-005: Course Completion Detection (All Quizzes Passed)

**Feature:** The system automatically detects course completion when a learner has passed all quizzes linked to lessons in the course. This triggers the status transition to "completed" and sets the completion timestamp.

**Intended Use / Business Case:** Course completion is the prerequisite for certificate generation. The system must accurately and automatically detect when all required assessments have been passed.

**Pre-conditions:**
- A course has 3 lessons, each with a linked quiz
- A learner has completed 2 of 3 lesson quizzes
- The learner is about to complete the final quiz

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as the learner. Open the course. |
| 2 | Verify progress shows "In Progress" (2/3 completed). |
| 3 | Complete the final (3rd) lesson quiz — pass it. |
| 4 | Observe the completion notification or indicator. |
| 5 | Navigate to My Courses. Verify the course now shows "Completed" with 100% progress. |
| 6 | Verify a completion date is displayed. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Upon completing the final quiz, the system transitions the course to "Completed" status. My Courses shows 100% progress with a completion date. A congratulatory notification may appear. |
| **Database** | `courseProgress.status` = "completed", `percentComplete` = 100, `completedLessons` = `totalLessons`, `completedAt` = current timestamp. `CourseCompletionService.computeCourseQuizProgress()` returns `allQuizzesPassed` = true, `isEligibleForCertificate` = true. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-PROG-006: Dual-Mechanism Completion (Quiz-Based Primary + Fallback)

**Feature:** Course completion uses a dual mechanism: quiz-based completion is the primary method (all quizzes passed), with `userCourseLessonProgress` as a fallback for lessons without quizzes.

**Intended Use / Business Case:** Some lessons may be overview or introductory content without quizzes. The fallback mechanism ensures these lessons can still be tracked as "completed" based on the learner viewing/interacting with them.

**Pre-conditions:**
- A course has 3 lessons: 2 with quizzes and 1 overview lesson (topicOrder = 0) without a quiz
- A learner is assigned to this course

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as the learner. Open the course. |
| 2 | View/complete the overview lesson (no quiz). |
| 3 | Complete the two quiz-linked lessons by passing their quizzes. |
| 4 | Verify the course shows as "Completed" despite the overview lesson having no quiz. |
| 5 | Check that the completion logic correctly excluded the overview lesson (topicOrder = 0) from quiz requirements. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The course is marked as "Completed" once all quiz-bearing lessons are passed. The overview lesson's lack of quiz does not block completion. |
| **Database** | `CourseCompletionService.computeCourseQuizProgress()` excludes lessons with `topicOrder` = 0 and "Key Takeaways" from quiz requirements. Only lessons with `primaryQuizId` set are counted toward completion. `courseProgress.status` = "completed". |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-PROG-007: Progress Persistence Across Sessions

**Feature:** Learner progress is persisted in the database and survives session logouts, browser closures, and device switches.

**Intended Use / Business Case:** Learners should be able to close their browser, log out, or switch devices and have their course progress preserved. No progress should be lost due to session changes.

**Pre-conditions:**
- A learner has a course with partial progress (e.g., 2 of 4 lessons completed)
- Progress is confirmed visible on My Courses

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as the learner and verify My Courses shows 50% progress (2/4 lessons). |
| 2 | Log out of the application. |
| 3 | Close the browser entirely. |
| 4 | Reopen the browser and log in as the same learner. |
| 5 | Navigate to My Courses. |
| 6 | Verify progress still shows 50% (2/4 lessons completed). |
| 7 | Verify the completed lessons are still marked as completed. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | After re-login, My Courses displays the exact same progress state: 50% complete, 2 of 4 lessons done. No progress is lost. Completed lessons remain checked/green. |
| **Database** | `courseProgress` row is unchanged: `status` = "in_progress", `percentComplete` = 50, `completedLessons` = 2. `userCourseLessonProgress` rows for the 2 completed lessons persist with `status` = "completed" and original `completedAt` timestamps. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-PROG-008: Overdue Progress Warning Display

**Feature:** When a learner has an assigned course that is past its due date and not yet completed, the system displays an overdue warning on the learner's dashboard.

**Intended Use / Business Case:** Learners need clear visual cues when they are behind schedule on mandatory training. Overdue warnings motivate timely completion and help learners prioritize their workload.

**Pre-conditions:**
- A course assignment exists with `dueDate` set to yesterday
- The learner has not completed the course (status = "in_progress" or "not_started")

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as the learner. |
| 2 | Navigate to My Courses (`/my-courses`). |
| 3 | Locate the overdue course assignment. |
| 4 | Verify an overdue badge, warning icon, or red indicator is displayed on the course card. |
| 5 | Verify the due date is shown with visual emphasis (red text, past date formatting). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The course card displays a clear overdue warning: red badge, "Overdue" label, or warning icon. The due date is shown in a highlighted/red format indicating it has passed. The course is visually distinguished from on-time assignments. |
| **Database** | `courseAssignments.dueDate` < NOW(). `courseProgress.status` != "completed" (or no courseProgress row exists). The frontend compares the due date from the API response against the current date to determine overdue status. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-PROG-009: Progress with Draft Versioning Migration

**Feature:** When a course draft is published, all learner progress (courseProgress and userCourseLessonProgress) is migrated from the original course to the new draft course, preserving learner achievements.

**Intended Use / Business Case:** Course creators may update content while learners are mid-progress. The system must ensure no learner loses their progress when a draft is published.

**Pre-conditions:**
- An active course with learner progress exists (some learners in-progress, some completed)
- A draft has been created from this course via `POST /api/courses/:id/create-draft`
- Edits have been made to the draft
- Admin is about to publish the draft

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Before publish: note the learner's progress on the original course (e.g., 2/3 lessons, 66%). |
| 2 | As admin, publish the draft via `POST /api/courses/:id/publish-draft`. |
| 3 | Log in as the learner. Navigate to My Courses. |
| 4 | Verify the learner still sees the course with their progress preserved. |
| 5 | Verify the progress values match the pre-publish state (2/3 lessons, 66%). |
| 6 | Verify the course content reflects the draft's edits (updated title, modified content). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | After draft publish, the learner's My Courses page shows the updated course with progress fully preserved. Progress percentage, completed lessons count, and status are unchanged. The course content reflects the new draft's edits. |
| **Database** | `courseProgress` records migrated: `courseId` now points to the new (published draft) course ID. `userCourseLessonProgress` records migrated with `lessonId` remapped via `cloneMapping.lessonIdMap` (old lesson IDs → new lesson IDs). Original course `status` = "archived". Draft course `status` = "active". |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-PROG-010: Progress for Completed User After Draft Publish

**Feature:** A learner who has already completed a course retains their "completed" status and certificate after a draft is published, even if the new draft has additional content.

**Intended Use / Business Case:** Learners who have already earned their completion status and certificate should not be forced to redo the course when the content is updated. Their achievement is grandfathered.

**Pre-conditions:**
- A learner has completed a course (status = "completed", certificate exists)
- A draft has been created and published for this course

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Before publish: verify learner's progress is "completed" with 100% and a certificate exists. |
| 2 | Publish the draft. |
| 3 | Log in as the learner. Navigate to My Courses. |
| 4 | Verify the course still shows "Completed" with 100% progress. |
| 5 | Navigate to Certificate Gallery. Verify the certificate is still accessible and downloadable. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Completed status is preserved. Certificate remains in the gallery and is downloadable. |
| **Database** | `courseProgress` migrated with `status` = "completed", `completedAt` preserved. `certificates` migrated with `courseId` updated to new course, `lessonId` remapped via cloneMapping. `pdfStoragePath` remains valid. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

### 4.3 Draft Versioning Tests (Slide 4)

---

#### TC-DRAFT-001: Create Draft (Full Clone)

**Feature:** Create a draft copy of a published course. The system performs a full clone of all course content: metadata, lessons, slides, presentation versions, quiz collections, quiz cards, and Object Storage files.

**Intended Use / Business Case:** Course creators need to update published courses without disrupting active learners. Creating a draft gives them a complete copy to edit freely.

**Pre-conditions:**
- An active (published) course exists with at least 2 lessons, each with quizzes and PPTX content
- No draft currently exists for this course
- User is logged in as Teacher, OrgAdmin, or SuperAdmin

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Course Edit page for the active course. |
| 2 | Click the "Create Draft" or "Edit as Draft" button. |
| 3 | Wait for the cloning process to complete (may take a few seconds for Object Storage file copies). |
| 4 | Verify a success notification confirms the draft was created. |
| 5 | Verify the interface transitions to the draft editing view. |
| 6 | Verify the draft title shows "[DRAFT]" prefix. |
| 7 | Navigate through the draft's lessons and verify all content was cloned: lesson titles, slides, quizzes. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Draft creation succeeds with a progress indicator. The Course Edit page now shows the draft version with "[DRAFT]" prefix. All lessons, quizzes, and content are present in the draft, identical to the original. |
| **Database** | A new `courses` row with: `status` = "draft", `sourceVersionCourseId` = original course ID, `title` = "[DRAFT] Original Title", `cloneMapping` (JSONB) populated with: `originalCourseId`, `lessonIdMap` (old→new lesson IDs), `quizIdMap` (old→new quiz IDs), `quizCardIdMap`, `courseLessonIdMap`, `filesMap`, `clonedAt`. New rows in `courseLessons`, `lessons`, `lessonSlides`, `lessonPresentationVersions`, `quizCollections`, `quizCards` — all with new IDs mapped in cloneMapping. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-DRAFT-002: Edit Draft Without Affecting Learners

**Feature:** Edits made to a draft course do not affect the active (published) version that learners are currently using.

**Intended Use / Business Case:** While the creator edits content in the draft, learners continue to use the original published version uninterrupted. Changes only take effect when the draft is published.

**Pre-conditions:**
- An active course exists with learners currently progressing through it
- A draft has been created from this course (TC-DRAFT-001)
- A learner is mid-progress on the original course

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | As the course creator, open the draft version and modify a lesson title (e.g., change "Introduction" to "Welcome Overview"). |
| 2 | Save the changes to the draft. |
| 3 | Log in as a learner who is currently progressing through the original course. |
| 4 | Navigate to the course content. |
| 5 | Verify the lesson title still shows the ORIGINAL title ("Introduction"), not the draft's modified title. |
| 6 | Verify all course content is unchanged from the learner's perspective. |
| 7 | Verify the learner's progress is unaffected. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The learner sees the original, unmodified course content. Draft edits are completely invisible to learners. Progress continues normally on the original course. |
| **Database** | The original `courses` row remains `status` = "active" with unchanged content. The draft `courses` row (with `sourceVersionCourseId` set) has the modified content. The two courses have different IDs — learner's `courseProgress.courseId` points to the original. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-DRAFT-003: Draft Validation Before Publish

**Feature:** Before a draft can be published, the system validates it for completeness: PPTX content for all non-overview lessons, quizzes linked to lessons, and at least one assignment scope.

**Intended Use / Business Case:** Ensures course quality by preventing incomplete drafts from being published. This protects learners from encountering courses with missing content.

**Pre-conditions:**
- A draft exists with intentional gaps: one lesson missing PPTX content and one lesson missing a quiz
- User is on the Course Edit page for the draft

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the draft's Course Edit page. |
| 2 | Click "Publish Draft" or "Validate for Publishing". |
| 3 | Observe the validation results — the system should report the missing PPTX and missing quiz. |
| 4 | Verify specific validation error messages identify which lessons have issues. |
| 5 | Address the validation errors by adding the missing content. |
| 6 | Click "Publish Draft" again and verify validation passes. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Validation errors are displayed clearly, identifying specific lessons with missing PPTX content or quizzes. The publish action is blocked until all validation criteria are met. After fixing the issues, publish proceeds successfully. |
| **Database** | `CourseService.validateCourseForPublish(draftId)` checks: (1) all non-overview lessons have PPTX content (`lessons.storageKey` is not null), (2) all non-overview lessons have linked quizzes (`courseLessons.primaryQuizId` is not null), (3) non-public courses have at least one relevant row in `courseAssignments` (`assignmentScope` department/unit/team/organization or `unitId` set). Multiple department rows are allowed for the same course. Returns validation errors if any check fails. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-DRAFT-004: Publish Draft with Full Data Migration (6 Tables)

**Feature:** Publishing a draft migrates ALL learner data from the original course to the draft course across 6 database tables, then archives the original and promotes the draft to active.

**Intended Use / Business Case:** When a course update is published, all learner progress, purchases, assignments, enrollments, lesson progress, and certificates must seamlessly transfer to the new version — ensuring zero data loss.

**Pre-conditions:**
- An active course exists with: courseProgress (multiple learners), coursePurchases, courseAssignments, userCourseEnrollments, userCourseLessonProgress, and certificates
- A validated draft exists ready for publishing

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Before publish: record the counts of records in each of the 6 tables for the original course ID. |
| 2 | As admin, click "Publish Draft". |
| 3 | Wait for the publish process to complete. |
| 4 | Verify the success notification confirms the publish. |
| 5 | Check the original course status (should be "archived"). |
| 6 | Check the new course status (should be "active"). |
| 7 | Verify all 6 types of records now reference the new course ID. |
| 8 | Verify no records remain pointing to the original (archived) course. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Publish completes successfully. The course page now shows the updated content. Learners see the new version with their progress preserved. |
| **Database** | Six-table migration completed: (1) `courseProgress` records: `courseId` updated to draft ID, (2) `coursePurchases` records: `courseId` updated, (3) `courseAssignments` records: `courseId` updated, (4) `userCourseEnrollments` records: `courseId` updated, (5) `userCourseLessonProgress` records: `courseId` updated AND `lessonId` remapped via `cloneMapping.lessonIdMap`, (6) `certificates` records: `courseId` updated AND `lessonId` remapped. Original course: `status` = "archived". Draft course: `status` = "active", `title` has "[DRAFT]" prefix removed. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-DRAFT-005: Discard Draft Cleanup

**Feature:** Discarding a draft deletes the draft course and all its cloned content (lessons, slides, quizzes, Object Storage files) without affecting the original published course.

**Intended Use / Business Case:** A creator decides the draft changes are not needed and wants to abandon the edits. Discarding cleanly removes all draft data.

**Pre-conditions:**
- A draft exists for an active course
- The original course has active learners
- User is on the Course Edit page for the draft

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the draft's Course Edit page. |
| 2 | Click "Discard Draft" or "Delete Draft". |
| 3 | If a confirmation dialog appears, confirm the discard. |
| 4 | Verify a success notification confirms the draft was discarded. |
| 5 | Navigate to the original course. Verify it is still active and unmodified. |
| 6 | Log in as a learner. Verify the original course and progress are unaffected. |
| 7 | As admin, try creating a new draft to verify the "Create Draft" button is re-enabled. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Draft is discarded with success notification. The Course Edit page reverts to the original active course. "Create Draft" button is available again. Learner experience is completely unaffected. |
| **Database** | The draft `courses` row is deleted. All cloned records are cleaned up: `courseLessons`, `lessons`, `lessonSlides`, `lessonPresentationVersions`, `quizCollections`, `quizCards` with IDs from the clone mapping are deleted. Object Storage files from `cloneMapping.filesMap` are cleaned up. Original course remains `status` = "active" with all content intact. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-DRAFT-006: Duplicate Draft Prevention (409 Conflict)

**Feature:** Attempting to create a second draft when one already exists for the same course returns a 409 Conflict error.

**Intended Use / Business Case:** Only one draft should exist per course at a time. This prevents confusion from multiple parallel edits and ensures a single, consistent editing flow.

**Pre-conditions:**
- An active course exists
- A draft has already been created for this course

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Course Edit page for the active course that already has a draft. |
| 2 | Attempt to click "Create Draft" again (if the button is visible). |
| 3 | Alternatively, call `POST /api/courses/:id/create-draft` directly via the browser console. |
| 4 | Verify the system rejects the request with a 409 Conflict error or appropriate error message. |
| 5 | Verify the existing draft remains intact and unmodified. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Either the "Create Draft" button is disabled/hidden when a draft already exists, OR clicking it shows an error message: "A draft already exists for this course." No duplicate draft is created. |
| **Database** | `CourseVersioningService.createDraft()` checks for existing draft via `getDraft(courseId)`. If a draft exists, throws Error "A draft already exists for this course." The API returns HTTP 409 Conflict. No new `courses` row is created. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-DRAFT-007: Dual-ID Resolution

**Feature:** If a client passes a draft's course ID to endpoints that expect the original course ID, the system automatically resolves the draft ID to the real original course.

**Intended Use / Business Case:** During editing, the draft course has its own ID. If a user navigates using the draft's ID, the system transparently resolves to the correct original course, preventing 404 errors and broken flows.

**Pre-conditions:**
- A draft exists for a course, with its own unique course ID
- The draft has `status` = "draft" and `sourceVersionCourseId` pointing to the original

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Note the draft's course ID and the original course ID. |
| 2 | Call `GET /api/courses/:draftId/draft` using the draft's ID. |
| 3 | Verify the system correctly resolves and returns the draft information. |
| 4 | Call `POST /api/courses/:draftId/create-draft` using the draft ID. |
| 5 | Verify the system resolves the draft ID to the original and correctly returns a 409 (draft already exists). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Navigation and operations work seamlessly regardless of whether the original or draft ID is used. No 404 errors or broken flows. |
| **Database** | When the passed ID has `status` = "draft" AND `sourceVersionCourseId` is not null, the system resolves to `sourceVersionCourseId` as the real original course. All subsequent operations use the resolved original ID. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-DRAFT-008: Draft Status Listing

**Feature:** List all courses in the organization along with their draft status (has draft, no draft, draft creation date).

**Intended Use / Business Case:** Admins need an overview of which courses have active drafts being edited, so they can coordinate content updates across the team.

**Pre-conditions:**
- The organization has multiple courses: some with drafts, some without
- User is logged in as Teacher, OrgAdmin, or SuperAdmin

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Call `GET /api/courses/drafts-status`. |
| 2 | Verify the response includes all courses in the organization. |
| 3 | For courses with drafts: verify `hasDraft` = true and draft creation date is shown. |
| 4 | For courses without drafts: verify `hasDraft` = false. |
| 5 | Verify the listing is accessible from the Course Edit or Course Management interface. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | A list/table of courses shows draft status for each. Courses with active drafts are indicated with a badge, icon, or label. Draft creation date is visible for courses with drafts. |
| **Database** | `GET /api/courses/drafts-status` queries `courses` table and checks for rows where `sourceVersionCourseId` = each course's ID AND `status` = "draft". Returns aggregated status for all org courses. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-DRAFT-009: CloneMapping Integrity

**Feature:** The `cloneMapping` JSONB field on the draft course accurately maps all original IDs to their cloned counterparts, ensuring data integrity during publish migration.

**Intended Use / Business Case:** When publishing a draft, the system relies on cloneMapping to correctly remap lesson IDs in learner progress and certificates. If the mapping is incorrect, data migration will fail or corrupt learner records.

**Pre-conditions:**
- A draft has been created for a course with 3 lessons, 3 quiz collections, and associated quiz cards
- The draft's cloneMapping is accessible

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Query the draft course record and extract the `cloneMapping` JSON. |
| 2 | Verify `originalCourseId` matches the original course's ID. |
| 3 | Verify `lessonIdMap` contains entries for each original lesson ID → new (cloned) lesson ID. |
| 4 | Verify `quizIdMap` contains entries for each original quiz collection ID → new quiz collection ID. |
| 5 | Verify `quizCardIdMap` contains entries for each original quiz card ID → new quiz card ID. |
| 6 | Verify `courseLessonIdMap` contains entries for each original courseLesson ID → new courseLesson ID. |
| 7 | Verify `filesMap` contains entries for cloned Object Storage files (original path → cloned path). |
| 8 | Verify `clonedAt` is a valid ISO timestamp. |
| 9 | Cross-reference: for each entry in `lessonIdMap`, verify the new lesson ID exists in the `lessons` table. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | N/A — this is a data integrity check. |
| **Database** | `courses.cloneMapping` (JSONB) for the draft contains: `{ originalCourseId: "uuid", lessonIdMap: { "old-id-1": "new-id-1", "old-id-2": "new-id-2", ... }, quizIdMap: { ... }, quizCardIdMap: { ... }, courseLessonIdMap: { ... }, filesMap: [{ original: "path", cloned: "path" }], clonedAt: "ISO-8601" }`. All mapped IDs correspond to actual records in their respective tables. No orphaned mappings exist. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-DRAFT-010: Lesson ID Remapping During Migration

**Feature:** During draft publish, `userCourseLessonProgress` and `certificates` records have their `lessonId` fields remapped from the original lesson IDs to the new (cloned) lesson IDs using the `cloneMapping.lessonIdMap`.

**Intended Use / Business Case:** After publishing a draft, the original lessons are archived. Learner progress and certificates must point to the new lesson IDs so they remain accessible and valid.

**Pre-conditions:**
- A draft exists with cloneMapping containing lessonIdMap entries
- Learners have `userCourseLessonProgress` records and `certificates` referencing the original lesson IDs
- The draft is ready to be published

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Before publish: record the original lesson IDs from `userCourseLessonProgress` for a specific learner. |
| 2 | Record the `lessonIdMap` from the draft's `cloneMapping`. |
| 3 | Publish the draft. |
| 4 | After publish: query `userCourseLessonProgress` for the same learner. |
| 5 | Verify each `lessonId` has been remapped according to the `lessonIdMap`. |
| 6 | Query `certificates` for the same learner. |
| 7 | Verify `lessonId` on certificates has been remapped. |
| 8 | Verify the remapped lesson IDs correspond to actual lessons in the new (published) course. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Learners can still access their completed lessons and certificates after the draft publish. No broken links or missing data. |
| **Database** | `userCourseLessonProgress.lessonId`: old values replaced with mapped values per `cloneMapping.lessonIdMap[oldLessonId]`. `certificates.lessonId`: similarly remapped. All new lesson IDs exist in `lessons` table and are linked to the new course via `courseLessons`. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

### 4.4 Certificate Management Tests (Slide 5)

---

#### TC-CERT-001: Automatic Certificate Generation on Course Completion

**Feature:** When a learner completes all quizzes in a course, the system automatically generates a course completion certificate with a unique certificate ID, PDF document, and storage in Object Storage.

**Intended Use / Business Case:** Learners receive formal recognition of their achievement upon completing a course. The certificate is auto-generated without admin intervention, providing immediate gratification.

**Pre-conditions:**
- A learner has completed all lesson quizzes in a course (TC-PROG-005 completed)
- The course is eligible for certificate generation (`isEligibleForCertificate` = true)
- Object Storage is configured

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | As a learner, complete the final quiz in a course (all quizzes now passed). |
| 2 | Observe any completion notification or certificate generation indicator. |
| 3 | Navigate to the Certificate Gallery (`/certificates`). |
| 4 | Verify a new certificate appears for the completed course. |
| 5 | Verify the certificate shows: course name, learner name, completion date, and a unique certificate ID. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | A course completion certificate appears in the Certificate Gallery. The certificate displays the course title, learner's name, completion date, and a display certificate ID (e.g., "CERT-XXXXXXXX"). |
| **Database** | A new `certificates` row with: `certificateType` = "course", `userId` = learner's ID, `courseId` = completed course ID, `organizationId` = org ID, `certificateId` = unique display ID, `pdfStoragePath` = Object Storage path, `pdfFileUrl` = signed URL or null, `completedAt` = course completion timestamp, `createdAt` = now. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-CERT-002: Lesson Certificate Issuance

**Feature:** Issue a lesson-level certificate for a specific lesson completion, separate from the course-level certificate.

**Intended Use / Business Case:** Some organizations want to recognize individual lesson completions (e.g., completing a specific compliance module) in addition to full course completion.

**Pre-conditions:**
- A learner has completed a quiz for a specific lesson
- The lesson belongs to a course
- User is interacting with the lesson

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | As a learner, complete a lesson's quiz. |
| 2 | On the lesson completion screen or Lesson Viewer, locate the "Get Certificate" or equivalent button. |
| 3 | Click the button to issue a lesson certificate. |
| 4 | Verify a success notification confirms the certificate was generated. |
| 5 | Navigate to the Certificate Gallery. |
| 6 | Verify a lesson-type certificate appears for the specific lesson. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | A lesson certificate is generated and appears in the Certificate Gallery. The certificate is clearly labeled as a "Lesson" type certificate, showing the lesson name and completion date. |
| **Database** | A new `certificates` row with: `certificateType` = "lesson", `lessonId` = the specific lesson's ID, `userId` = learner's ID, `courseId` = parent course ID, `pdfStoragePath` populated. `POST /api/lessons/:lessonId/certificates` was called. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-CERT-003: Certificate Gallery Listing (Paginated)

**Feature:** View all earned certificates in a paginated gallery, showing certificate type (lesson/course), course name, date, and certificate ID.

**Intended Use / Business Case:** Learners need a central place to view, manage, and access all their earned certificates — both lesson-level and course-level.

**Pre-conditions:**
- The learner has earned multiple certificates (mix of lesson and course types)
- At least 5+ certificates exist for pagination testing

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as the learner. Navigate to Certificate Gallery (`/certificates`). |
| 2 | Verify all certificates are displayed. |
| 3 | Verify each certificate card shows: certificate type (lesson/course), course name, completion date, certificate ID. |
| 4 | If pagination controls are visible, click "Next" to load more certificates. |
| 5 | Verify the pagination works correctly (new certificates load, no duplicates). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The Certificate Gallery displays certificate cards with type, course name, date, and ID. Pagination controls (if present) work correctly. Both lesson and course certificates are listed. |
| **Database** | `GET /api/certificates` (with `limit` and `offset` query params) returns paginated results from the `certificates` table filtered by `userId`. Results ordered by `createdAt` DESC. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-CERT-004: PDF Download with Signed URL

**Feature:** Download a certificate as a PDF file via a signed URL generated from Replit Object Storage.

**Intended Use / Business Case:** Learners need to download and keep a copy of their certificates for their personal records, CV/resume, or to share with employers.

**Pre-conditions:**
- The learner has at least one certificate with a `pdfStoragePath`
- Object Storage is accessible

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as the learner. Navigate to Certificate Gallery. |
| 2 | Locate a certificate and click the "Download" button. |
| 3 | Verify the browser initiates a PDF download. |
| 4 | Open the downloaded PDF file. |
| 5 | Verify the PDF contains: certificate title, learner name, course name, completion date, certificate ID, organization branding (if configured). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Clicking "Download" triggers a PDF file download. The file opens successfully in a PDF viewer. The certificate is professionally formatted with all expected information. |
| **Database** | `GET /api/certificates/:certificateId/download` reads `certificates.pdfStoragePath`, generates a signed URL via `ObjectStorageService`, and redirects/streams the PDF to the client. The signed URL provides time-limited access. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-CERT-005: Social Sharing (LinkedIn, Twitter, Facebook)

**Feature:** Share a certificate on social media platforms (LinkedIn, Twitter, Facebook) using a generated share token and platform-specific share links.

**Intended Use / Business Case:** Learners want to showcase their achievements on professional and social networks. The sharing feature generates shareable links that display certificate details publicly.

**Pre-conditions:**
- The learner has a certificate
- The certificate has a display certificate ID

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as the learner. Navigate to Certificate Gallery. |
| 2 | Click the "Share" button on a certificate. |
| 3 | Verify share options appear for LinkedIn, Twitter, and Facebook. |
| 4 | Click the LinkedIn share option. |
| 5 | Verify a new window/tab opens with a LinkedIn share dialog pre-populated with certificate details. |
| 6 | Verify the share URL includes a share token (e.g., `/certificates/shared/:shareToken`). |
| 7 | Copy the share URL and open it in an incognito/private browser window (not logged in). |
| 8 | Verify the certificate details are publicly visible without authentication. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Share buttons for LinkedIn, Twitter, and Facebook are available. Clicking a share button opens the platform's share dialog with the certificate URL pre-populated. The shared certificate page is publicly accessible without login. |
| **Database** | `POST /api/certificates/:displayCertId/share` generates a `shareToken` (stored in `certificates.shareToken`) and returns share URLs for each platform. `GET /api/certificates/shared/:shareToken` is a public endpoint (no auth required) that returns certificate details by `shareToken`. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-CERT-006: Public Certificate Verification

**Feature:** Verify the authenticity of a certificate using a public verification endpoint that accepts the certificate ID and returns verification details.

**Intended Use / Business Case:** Employers, HR departments, or training regulators can verify that a certificate is legitimate by entering the certificate ID on the verification page — confirming the learner's name, course, and completion date.

**Pre-conditions:**
- A certificate exists with a known `certificateId` (display ID)
- The verification endpoint is publicly accessible

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Note a certificate's display ID (e.g., "CERT-XXXXXXXX"). |
| 2 | Open an incognito/private browser window (not logged in). |
| 3 | Navigate to `/verify/:certificateId` (public verification page). |
| 4 | Verify the page displays certificate verification details: learner name, course name, completion date, issuing organization. |
| 5 | Try an invalid certificate ID (e.g., "CERT-INVALID") and verify the system returns a "not found" or "invalid" message. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The public verification page displays verified certificate details for valid certificate IDs. Invalid IDs show a clear "Certificate not found" or "Invalid certificate" message. No authentication is required. |
| **Database** | `GET /api/verify/:certificateId` queries `certificates` by `certificateId` (display ID). Returns certificate details with learner info (joined from `users`), course info (joined from `courses`), and organization info. No authentication middleware applied to this endpoint. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-CERT-007: Certificate Email Delivery

**Feature:** When a certificate is generated, the system sends a non-blocking email to the learner with the certificate PDF attached.

**Intended Use / Business Case:** Learners receive their certificates automatically via email, providing a convenient backup copy and immediate notification of their achievement.

**Pre-conditions:**
- A learner with a valid email address completes a course
- MailerSend is configured
- Certificate generation is triggered

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Complete a course as a learner (trigger automatic certificate generation). |
| 2 | Wait for the certificate to be generated (verify in Certificate Gallery). |
| 3 | Check the learner's email inbox. |
| 4 | Verify a certificate notification email was received. |
| 5 | Verify the email contains: congratulations message, course name, and a PDF attachment or download link. |
| 6 | Open/download the attached PDF and verify it matches the certificate in the gallery. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | N/A — this is an email delivery test. |
| **Database** | `MailerSendService.sendCertificateEmail()` is called non-blocking (does not delay the certificate generation response). The email contains the certificate PDF as an attachment. Email delivery is tracked via MailerSend's delivery status (not stored in the local database). |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-CERT-008: Unclaimed Certificate Detection

**Feature:** Detect courses that a learner has completed but has not yet claimed their certificate, providing a prompt to claim.

**Intended Use / Business Case:** Some learners may complete courses without triggering certificate generation (e.g., if the automatic generation failed or for legacy courses). This feature identifies these gaps and provides a mechanism to claim missing certificates.

**Pre-conditions:**
- A learner has completed a course (`courseProgress.status` = "completed")
- No certificate exists for this learner/course combination

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as the learner. |
| 2 | Navigate to the Certificate Gallery (`/certificates`). |
| 3 | Look for an "Unclaimed Certificates" section or banner. |
| 4 | Verify the completed course without a certificate is listed as "unclaimed". |
| 5 | Click "Claim Certificate" or equivalent button. |
| 6 | Verify the certificate is generated and appears in the gallery. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The Certificate Gallery shows unclaimed certificates with a "Claim" action. After claiming, the certificate appears in the main gallery list. |
| **Database** | `GET /api/certificates/unclaimed-courses` queries `courseProgress` (status = "completed") LEFT JOIN `certificates` (where certificate is null) to find completed courses without certificates. After claiming, a new `certificates` row is created. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-CERT-009: Certificate Migration During Draft Publish

**Feature:** When a course draft is published, existing certificates for the original course are migrated to the new course, with lesson IDs remapped via the cloneMapping.

**Intended Use / Business Case:** Certificates earned on the original course version must remain valid and accessible after the course is updated. The migration ensures certificates point to the new course and lesson IDs.

**Pre-conditions:**
- A learner has earned a certificate on a course
- A draft exists for this course and is ready to publish

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Before publish: note the certificate's `courseId` and `lessonId` (original IDs). |
| 2 | Publish the draft. |
| 3 | After publish: query the certificate record. |
| 4 | Verify `courseId` has been updated to the new (published draft) course ID. |
| 5 | Verify `lessonId` has been remapped according to `cloneMapping.lessonIdMap`. |
| 6 | Log in as the learner. Navigate to Certificate Gallery. |
| 7 | Verify the certificate is still accessible and downloadable. |
| 8 | Verify the certificate PDF (if re-generated) reflects the course name correctly. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The certificate remains in the learner's gallery after draft publish. Download and share functions still work. The certificate displays the correct course title (updated if the draft changed it). |
| **Database** | `certificates.courseId` updated to new course ID. `certificates.lessonId` remapped per `cloneMapping.lessonIdMap`. `certificates.pdfStoragePath` remains valid (PDF not regenerated unless explicitly requested). `certificates.certificateId` (display ID) unchanged. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-CERT-010: Multiple Certificate Types per Course

**Feature:** A learner can earn both lesson-level certificates (for individual lessons) and a course-level certificate (for completing all quizzes), all displayed in the same gallery.

**Intended Use / Business Case:** Organizations may want granular recognition at both lesson and course levels. Learners see all their achievements in one place.

**Pre-conditions:**
- A learner has completed individual lessons (earning lesson certificates) and has completed the full course (earning a course certificate)

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Log in as the learner. Navigate to Certificate Gallery. |
| 2 | Verify both lesson-type and course-type certificates are displayed. |
| 3 | Verify lesson certificates show `certificateType` = "lesson" with the specific lesson name. |
| 4 | Verify the course certificate shows `certificateType` = "course" with the full course name. |
| 5 | Verify each certificate has a unique `certificateId` (display ID). |
| 6 | Download both types and verify the PDFs are correctly formatted. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Both certificate types appear in the gallery. They are visually distinguishable (different badges, labels, or icons for "Lesson" vs "Course"). Each has its own unique ID, download button, and share functionality. |
| **Database** | Multiple `certificates` rows for the same user/course: some with `certificateType` = "lesson" (each with a distinct `lessonId`), and one with `certificateType` = "course" (covering the entire course). Each has a unique `id` and `certificateId`. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

### 4.5 Learner Analytics & Reporting Tests (Slide 6)

---

#### TC-ANALYTICS-001: Overview KPIs with Trend Calculations

**Feature:** View the learner analytics overview dashboard showing key performance indicators: active learners, total learners, completed courses, average quiz score, completion rate, overdue count, due soon count — each with period-over-period trend percentages.

**Intended Use / Business Case:** Training managers need an at-a-glance view of their organization's learning performance, including whether metrics are improving or declining compared to the previous period.

**Pre-conditions:**
- User is logged in as Teacher, OrgAdmin, or SuperAdmin
- The organization has learners with varied progress states
- Historical data exists for trend calculation (activity in previous and current periods)

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Reports page (`/reports`). |
| 2 | Verify the Overview section displays KPI cards. |
| 3 | Check that each KPI card shows: the metric value, a trend arrow (up/down/neutral), and the trend percentage. |
| 4 | Verify the following KPIs are present: Active Learners, Total Learners, Completed Courses, Avg Quiz Score, Completion Rate, Overdue Count, Due Soon Count. |
| 5 | Verify trend percentages are calculated (positive = green/up, negative = red/down, zero = neutral). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The Reports page displays 7 KPI cards with current values and trend indicators. Trends show directional arrows and percentage changes. |
| **Database** | `GET /api/reports/learner-analytics/:orgId/overview` returns: `{ activeLearners, totalLearners, completedCourses, avgQuizScore, completionRate, overdueCount, dueSoonCount, trends: { activeLearnersTrend, completedCoursesTrend, avgQuizScoreTrend, ... } }`. Trend calculation: `((current - previous) / previous) * 100` comparing current period vs previous period of equal length. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ANALYTICS-002: Completion Funnel (4 Stages)

**Feature:** View the completion funnel showing how learners progress through 4 stages: Enrolled → Started → In Progress → Completed, with counts at each stage and per-course breakdown.

**Intended Use / Business Case:** Identifies where learners drop off in the learning journey. If many enroll but few start, outreach is needed. If many start but few complete, course difficulty or engagement may need attention.

**Pre-conditions:**
- The organization has learners at various stages of course progress
- At least one course has learners distributed across all 4 stages

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Reports page (`/reports`). |
| 2 | Locate the Completion Funnel section or tab. |
| 3 | Verify the funnel displays 4 stages: Enrolled, Started, In Progress, Completed. |
| 4 | Verify each stage shows a count of learners at that stage. |
| 5 | Verify the funnel narrows visually from enrolled (largest) to completed (smallest). |
| 6 | If per-course breakdown is available, verify individual course funnels match the overall funnel. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | A visual funnel chart shows 4 stages with learner counts. The funnel clearly shows drop-off between stages. Per-course breakdown (if available) allows filtering by specific course. |
| **Database** | `GET /api/reports/learner-analytics/:orgId/completion-funnel` returns: `{ overall: { enrolled: N, started: N, inProgress: N, completed: N }, perCourse: [{ courseId, courseName, enrolled, started, inProgress, completed }] }`. Data sourced from `courseProgress` status distribution and `userCourseEnrollments`. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ANALYTICS-003: Top Performers Report

**Feature:** View a ranked list of top-performing learners based on quiz scores and courses completed.

**Intended Use / Business Case:** Recognizing top performers motivates learning and allows organizations to identify high-potential employees or students for advancement or mentoring roles.

**Pre-conditions:**
- Multiple learners have completed quizzes with varying scores
- At least some learners have completed courses

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Reports page (`/reports`). |
| 2 | Locate the Top Performers section or tab. |
| 3 | Verify a ranked list of learners is displayed. |
| 4 | Verify each entry shows: learner name, average quiz score, courses completed count, and rank position. |
| 5 | Verify the list is sorted by performance (highest scores/completions first). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | A ranked leaderboard-style list shows top performers. Each entry includes the learner's name, avatar, quiz score average, and courses completed. The list is ordered from highest to lowest performance. |
| **Database** | `GET /api/reports/learner-analytics/:orgId/top-performers` aggregates data from `userQuizProgress` (average scores) and `courseProgress` (completed courses count) per user. Results sorted by composite performance metric. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ANALYTICS-004: At-Risk Learners Detection

**Feature:** Identify learners who are at risk of failing or falling behind — those with low quiz scores or overdue assignments.

**Intended Use / Business Case:** Early identification of at-risk learners enables proactive intervention: additional support, deadline extensions, or one-on-one coaching before learners fail or disengage.

**Pre-conditions:**
- Learners exist with low quiz scores (below passing threshold)
- Learners exist with overdue assignments (past due date, not completed)

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Reports page (`/reports`). |
| 2 | Locate the At-Risk Learners section or tab. |
| 3 | Verify the list includes learners with low quiz scores. |
| 4 | Verify the list includes learners with overdue assignments. |
| 5 | Verify each entry shows: learner name, risk reason (low score or overdue), relevant course, and metric values. |
| 6 | Click on an at-risk learner to view their detailed profile (if drill-down is available). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The At-Risk Learners list displays learners grouped or flagged by risk type: low scores, overdue assignments. Each entry provides actionable context (which course, what score, how overdue). Drill-down to individual profiles is available. |
| **Database** | `GET /api/reports/learner-analytics/:orgId/at-risk-learners` queries `userQuizProgress` (low scores), `courseAssignments` + `courseProgress` (overdue = dueDate < NOW() AND not completed). Returns categorized at-risk learners with risk reasons. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ANALYTICS-005: Quiz Analytics

**Feature:** View quiz performance analytics showing pass rates, average scores, score distributions, and question-level analytics.

**Intended Use / Business Case:** Course creators and training managers analyze quiz performance to identify poorly performing questions, assess overall course difficulty, and improve assessment quality.

**Pre-conditions:**
- Multiple learners have completed quizzes with varying scores
- Quiz results data exists in `userQuizProgress` and `quizGameResults`

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Reports page (`/reports`). |
| 2 | Locate the Quiz Analytics section or tab. |
| 3 | Verify overall quiz performance metrics are displayed: average score, pass rate, total attempts. |
| 4 | Verify per-quiz breakdown shows individual quiz performance. |
| 5 | If available, review question-level analytics (most missed questions, easiest questions). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Quiz analytics dashboard shows aggregate quiz performance. Charts or tables display score distributions, pass rates, and per-quiz breakdowns. |
| **Database** | `GET /api/reports/learner-analytics/:orgId/quiz-analytics` aggregates data from `userQuizProgress` and `quizGameResults`. Returns average scores, pass rates, and per-quiz statistics. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ANALYTICS-006: Deadline Tracking (Overdue + Upcoming)

**Feature:** View a consolidated list of overdue assignments (past due, not completed) and upcoming assignments (due within 7 days, not completed), resolving the effective assignments across all scope levels.

**Intended Use / Business Case:** Training managers need to identify which learners are behind schedule and which deadlines are approaching, enabling timely reminders and follow-up.

**Pre-conditions:**
- Course assignments exist with various due dates (some past, some within 7 days, some future)
- Learners exist with incomplete courses

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Reports page (`/reports`). |
| 2 | Locate the Deadlines section or tab. |
| 3 | Verify two categories are displayed: "Overdue" and "Upcoming" (or equivalent). |
| 4 | In the Overdue list: verify entries show learner name, course name, due date (past), and days overdue. |
| 5 | In the Upcoming list: verify entries show learner name, course name, due date (within 7 days), and days remaining. |
| 6 | Verify the effective_assignments CTE correctly resolves assignments across user/unit/subUnit/team cascade. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Overdue and Upcoming sections display actionable deadline information. Overdue items are highlighted in red/warning. Upcoming items show countdown to deadline. Both lists include learner and course identification. |
| **Database** | `GET /api/reports/learner-analytics/:orgId/deadlines` uses an `effective_assignments` CTE that resolves the cascade: organization → department → unit → team → user assignments. Overdue: `ca."dueDate" < NOW() AND (cp.status IS NULL OR cp.status != 'completed')`. Upcoming: `ca."dueDate" >= NOW() AND ca."dueDate" <= NOW() + INTERVAL '7 days' AND not completed`. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ANALYTICS-007: Manual Deadline Email Sending

**Feature:** Send manual deadline reminder emails to learners with overdue or upcoming assignments, restricted to teacher/instructor/org_admin/super_admin roles.

**Intended Use / Business Case:** Admins can proactively send reminder emails to learners who are behind schedule, nudging them to complete their training before further escalation.

**Pre-conditions:**
- User is logged in as Teacher, OrgAdmin, or SuperAdmin
- Overdue or upcoming assignments exist
- MailerSend is configured

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Reports page (`/reports`). |
| 2 | Locate the Deadlines section with overdue assignments. |
| 3 | Click the "Send Reminder" or "Email Reminder" button. |
| 4 | Verify a confirmation dialog appears. |
| 5 | Confirm sending the reminder emails. |
| 6 | Verify a success notification confirms emails were sent. |
| 7 | Check a test learner's email inbox for the reminder email. |
| 8 | Log in as a student and attempt to access the same "Send Reminder" functionality. |
| 9 | Verify the student cannot send reminder emails (button hidden or API returns 403). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The "Send Reminder" button is visible only to authorized roles (teacher/instructor/org_admin/super_admin). Clicking it sends emails and shows a success notification. Students do not see the button or receive a 403 error if they attempt the API call. |
| **Database** | `POST /api/reports/learner-analytics/:orgId/deadlines/email` sends emails via MailerSendService. RBAC middleware restricts access to teacher/instructor/org_admin/super_admin roles. Email delivery is tracked via MailerSend (not locally stored). |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ANALYTICS-008: Individual Learner Profile Analytics

**Feature:** View a detailed analytics profile for a specific learner, including all their course progress, quiz scores, certificates earned, and assignment statuses.

**Intended Use / Business Case:** Instructors need to assess individual learner performance in detail — reviewing their progress across all assigned courses, identifying strengths and weaknesses, and determining if additional support is needed.

**Pre-conditions:**
- A learner exists with diverse data: multiple courses in various progress states, quiz results, and certificates
- User is logged in as Teacher or OrgAdmin

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Reports page (`/reports`). |
| 2 | Search for or click on a specific learner to view their profile. |
| 3 | Verify the profile shows: learner name, overall completion rate, average quiz score. |
| 4 | Verify a course-by-course breakdown is displayed with progress status for each assigned course. |
| 5 | Verify quiz scores per course are listed. |
| 6 | Verify certificates earned are shown. |
| 7 | Verify assignment due dates and overdue status are indicated. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | A comprehensive learner profile page shows all relevant analytics. Course progress, quiz scores, certificates, and deadline statuses are organized clearly. The profile enables informed decision-making about learner support. |
| **Database** | `GET /api/reports/learner-analytics/:orgId/learner/:userId/profile` aggregates data from: `courseProgress` (per-course progress), `userQuizProgress` (quiz scores), `certificates` (earned certs), `courseAssignments` (assigned courses with due dates). Returns a unified learner analytics profile. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ANALYTICS-009: Funnel Drill-Down by Stage

**Feature:** Drill down into a specific completion funnel stage (enrolled, started, in_progress, completed) to see the list of learners at that stage.

**Intended Use / Business Case:** When the funnel shows many learners stalled at a particular stage, admins need to see exactly who those learners are to take targeted action.

**Pre-conditions:**
- The completion funnel has learners at various stages
- User is on the Reports page

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Reports page and view the Completion Funnel. |
| 2 | Click on a funnel stage (e.g., "In Progress"). |
| 3 | Verify a drill-down view or modal opens showing a list of learners at that stage. |
| 4 | Verify each learner entry shows: name, email, specific course, and progress details. |
| 5 | Repeat for another stage (e.g., "Enrolled") and verify the appropriate learners are listed. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Clicking a funnel stage opens a detailed list of learners at that stage. The drill-down is displayed in a modal (`DrilldownModal.tsx`) or a new view. Learner details are actionable (clickable for full profile). |
| **Database** | `GET /api/reports/learner-analytics/:orgId/funnel-details/:stage` (where stage = enrolled/started/in_progress/completed) returns a list of users at that funnel stage with their course details. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ANALYTICS-010: Per-Course Learner List

**Feature:** View the list of learners enrolled in a specific course, with their individual progress statuses.

**Intended Use / Business Case:** Course instructors need to see all learners in their course with progress details to identify who needs help and who is on track.

**Pre-conditions:**
- A course has multiple enrolled learners with varying progress levels

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Reports page. |
| 2 | Select or filter by a specific course. |
| 3 | View the list of learners enrolled in that course. |
| 4 | Verify each learner entry shows: name, progress status, percentage complete, quiz scores. |
| 5 | Verify the list is sortable by progress or score. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | A table or list of learners for the selected course shows individual progress. Sorting and filtering options are available. Each learner's status (not started/in progress/completed) is clearly indicated. |
| **Database** | `GET /api/reports/learner-analytics/:orgId/course-learners/:courseId` returns: list of users with their `courseProgress` data (status, percentComplete, completedLessons) and `courseAssignments` data (dueDate, mandatory) for the specified course. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ANALYTICS-011: Quiz Breakdown Analytics

**Feature:** View detailed quiz breakdown showing per-quiz pass rates, average scores, and attempt statistics.

**Intended Use / Business Case:** Identifies which quizzes are too easy, too hard, or have problematic questions. Helps course creators calibrate assessment difficulty.

**Pre-conditions:**
- Multiple quizzes have been completed by multiple learners

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Reports page. |
| 2 | Locate the Quiz Breakdown section. |
| 3 | Verify each quiz shows: quiz name, associated course/lesson, pass rate, average score, total attempts. |
| 4 | Identify quizzes with unusually high or low pass rates. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Quiz breakdown table shows per-quiz statistics. Easy identification of outlier quizzes (very high or very low pass rates). |
| **Database** | `GET /api/reports/learner-analytics/:orgId/quiz-breakdown` aggregates from `userQuizProgress` and `quizGameResults` grouped by quiz/lesson. Returns per-quiz statistics. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ANALYTICS-012: Filter Application (Course, Department, Date Range)

**Feature:** Apply filters to all learner analytics endpoints: filter by course, department/unit, date range, course status, and search by learner name.

**Intended Use / Business Case:** Large organizations need to slice analytics by specific criteria — viewing only a particular department's performance, or a specific course's results within a date range.

**Pre-conditions:**
- Multiple courses, departments, and learners exist with varied data
- Data spans multiple date ranges

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Reports page. |
| 2 | Apply a course filter — select a specific course. |
| 3 | Verify all analytics (KPIs, funnel, etc.) update to reflect only the selected course. |
| 4 | Clear the course filter. Apply a department filter — select a specific department. |
| 5 | Verify analytics update to reflect only learners in the selected department. |
| 6 | Apply a date range filter (start date to end date). |
| 7 | Verify analytics only include activity within the specified date range. |
| 8 | Apply multiple filters simultaneously (course + department + date range). |
| 9 | Verify the results satisfy all filter criteria. |
| 10 | Use the search field to filter by a specific learner name. |
| 11 | Verify results narrow to include only the searched learner. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Filter controls for course, department, date range, course status, and search are available on the Reports page. Applying filters updates all analytics sections dynamically. Multiple filters can be combined. Clearing filters restores the full dataset. |
| **Database** | All learner-analytics endpoints accept query parameters: `courseId`, `departmentId`/`unitId`, `startDate`, `endDate`, `courseStatus`, `search`, `limit`. `parseReportFilters()` in `reportRoutes.ts` standardizes these parameters. SQL queries apply WHERE conditions based on active filters. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ANALYTICS-013: Performance Heatmap

**Feature:** View a performance heatmap showing learner performance distribution across courses and organizational units.

**Intended Use / Business Case:** Visual heatmaps provide an immediate, intuitive understanding of where performance is strong (green) and where it needs attention (red) across the organization.

**Pre-conditions:**
- Multiple courses with varied learner performance exist
- Multiple organizational units have learners with quiz results

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Reports page. |
| 2 | Locate the Performance Heatmap section. |
| 3 | Verify the heatmap displays a matrix of courses/units with color-coded performance cells. |
| 4 | Verify the color gradient represents performance levels (e.g., red = low, yellow = medium, green = high). |
| 5 | Hover over cells to see detailed performance numbers (if tooltips are available). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | A heatmap visualization shows performance distribution. Color coding provides immediate visual insight. Hovering or clicking cells reveals detailed metrics. |
| **Database** | `GET /api/reports/organizations/:orgId/performance-heatmap` aggregates data from `courseProgress` and `userQuizProgress` grouped by course and organizational unit. Returns a matrix of performance values suitable for heatmap rendering. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ANALYTICS-014: Quiz Score Range Drill-Down

**Feature:** Drill down into a specific quiz score range (e.g., 0-20%, 21-40%, etc.) to see which learners fall within that range.

**Intended Use / Business Case:** When the performance distribution shows a cluster of learners in a low score range, admins need to identify those specific learners for targeted remediation.

**Pre-conditions:**
- Learners have quiz results spanning various score ranges

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Reports page. |
| 2 | Locate the performance distribution or quiz score chart. |
| 3 | Click on a specific score range segment (e.g., "0-20%"). |
| 4 | Verify a drill-down view or modal opens showing learners within that range. |
| 5 | Verify each learner shows: name, actual score, associated quiz/course. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Clicking a score range opens a list of learners within that range. Each entry provides the learner's name, specific score, and the quiz/course context. The modal (`StudentRangeModal.tsx`) provides an actionable drill-down. |
| **Database** | `GET /api/reports/learner-analytics/:orgId/quiz-score-range/:range` (where range = e.g., "0-20") returns a list of users whose quiz scores fall within the specified range. Data from `userQuizProgress` filtered by score boundaries. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ANALYTICS-015: Organization Summary Report

**Feature:** View a high-level organization summary report including total courses, total learners, overall completion rates, and key performance metrics.

**Intended Use / Business Case:** Executive stakeholders need a single-page summary of the organization's learning and development performance for board meetings, compliance reports, or budget justifications.

**Pre-conditions:**
- The organization has courses, learners, and progress data
- User is logged in as OrgAdmin or SuperAdmin

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Reports page. |
| 2 | View the Organization Summary section or tab. |
| 3 | Verify the summary includes: total courses count, total learners count, overall completion rate, average quiz score, total certificates issued. |
| 4 | Verify the data aligns with the detailed analytics (KPIs, funnel, etc.). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | A concise organization summary displays key metrics in an executive-friendly format. Numbers are consistent with the detailed analytics views. |
| **Database** | `GET /api/reports/organizations/:orgId/summary` aggregates data from `courses` (count), `users` (learner count), `courseProgress` (completion rate), `userQuizProgress` (avg score), `certificates` (count). Returns a summary object with all key metrics. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

### 4.6 Notifications & Reminders Tests (Slide 8)

---

#### TC-NOTIFY-001: Manual Deadline Email Sending

**Feature:** Administrators can manually send deadline reminder emails to learners with overdue or upcoming assignments via the Reports page.

**Intended Use / Business Case:** When automated reminders are not available, admins need a manual mechanism to nudge learners about approaching or missed deadlines.

**Pre-conditions:**
- Overdue assignments exist
- User is logged in as Teacher, OrgAdmin, or SuperAdmin
- MailerSend is configured

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Reports page (`/reports`). |
| 2 | Go to the Deadlines section showing overdue assignments. |
| 3 | Click "Send Reminder Email" or equivalent button. |
| 4 | Confirm the action in the confirmation dialog. |
| 5 | Verify a success notification shows emails were sent. |
| 6 | Check a test learner's email inbox for the reminder. |
| 7 | Verify the email content includes: course name, due date, overdue status, and a link to the course. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The "Send Reminder" action is available on the Deadlines section. Success notification confirms email delivery. The process is manual, not automated. |
| **Database** | `POST /api/reports/learner-analytics/:orgId/deadlines/email` triggers `MailerSendService` to send reminder emails. RBAC restricts to teacher/instructor/org_admin/super_admin. No automated scheduling exists — this is purely on-demand. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-NOTIFY-002: Certificate Email Notification

**Feature:** When a certificate is generated (automatically on course completion or manually via lesson certificate), an email notification with the certificate PDF is sent to the learner.

**Intended Use / Business Case:** Learners receive immediate email notification of their achievement, along with a copy of their certificate for easy access without needing to log in.

**Pre-conditions:**
- A learner has just completed a course, triggering certificate generation
- MailerSend is configured and operational

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Complete a course as a learner (trigger automatic certificate generation). |
| 2 | Wait a few moments for the non-blocking email to be sent. |
| 3 | Check the learner's email inbox. |
| 4 | Verify a certificate email was received from the platform. |
| 5 | Verify the email contains: congratulations message, course name, certificate details, and a PDF attachment or download link. |
| 6 | Open/download the attached PDF and verify it's a valid certificate document. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | N/A — email delivery test. The learner receives the email without needing to take any action on the platform. |
| **Database** | `MailerSendService.sendCertificateEmail()` is invoked non-blocking (asynchronous, does not delay the certificate generation response). The PDF from `certificates.pdfStoragePath` is attached to the email. Email delivery status tracked by MailerSend. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-NOTIFY-003: Automated Reminders — NOT IMPLEMENTED

**Feature:** Automated, scheduled reminder notifications for overdue and upcoming assignment deadlines.

**Intended Use / Business Case:** Organizations expect the system to automatically send reminder emails (e.g., 7 days before deadline, on the deadline day, and escalation emails for overdue assignments) without manual administrator intervention.

**Pre-conditions:**
- N/A — Feature not implemented

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Verify no cron job, scheduler, or background worker exists for automated deadline reminders. |
| 2 | Search the codebase for automated reminder functionality in `server/schedulers/` and `server/workers/`. |
| 3 | Confirm that the only mechanism for sending deadline reminders is the manual `POST /:orgId/deadlines/email` endpoint. |
| 4 | Document the gap: no automated escalation chains, no scheduled reminders, no cron-based notifications for overdue assignments. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | No automated reminder settings or scheduling interface exists. The only reminder mechanism is the manual "Send Reminder" button on the Reports page. |
| **Database** | No scheduler entries in `server/schedulers/` handle deadline reminders. No background workers in `server/workers/` process overdue notifications. The `emailSchedulerService.ts` does not contain deadline reminder scheduling. Only `POST /api/reports/learner-analytics/:orgId/deadlines/email` exists for manual sending. |

> **Implementation Gap:** The requirements (Slide 8) describe automated reminder and escalation workflows for overdue and upcoming assignments. The current implementation provides **ONLY manual email sending** via the Reports page. There is no automated escalation, no scheduled reminders, and no cron-based notifications for overdue assignments. This is flagged for future development.

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

## 5. Traceability Matrix

This matrix maps each requirement slide to its corresponding test cases, ensuring complete coverage.

| Requirement Slide | Test Case IDs | Coverage Status |
|-------------------|---------------|-----------------|
| Slide 1 (Title/Overview — Assign, Track, Certify) | N/A — Context only | N/A |
| Slide 2 (Course Assignment System — 5-Level Scope) | TC-ASSIGN-001, TC-ASSIGN-002, TC-ASSIGN-003, TC-ASSIGN-004, TC-ASSIGN-005, TC-ASSIGN-006, TC-ASSIGN-007, TC-ASSIGN-008, TC-ASSIGN-009, TC-ASSIGN-010, TC-ASSIGN-011, TC-ASSIGN-012, TC-ASSIGN-013, TC-ASSIGN-014, TC-ASSIGN-015 | Full |
| Slide 3 (Progress Tracking — Real-Time Learner Progress) | TC-PROG-001, TC-PROG-002, TC-PROG-003, TC-PROG-004, TC-PROG-005, TC-PROG-006, TC-PROG-007, TC-PROG-008, TC-PROG-009, TC-PROG-010 | Full |
| Slide 4 (Draft Versioning System — Edit Without Disruption) | TC-DRAFT-001, TC-DRAFT-002, TC-DRAFT-003, TC-DRAFT-004, TC-DRAFT-005, TC-DRAFT-006, TC-DRAFT-007, TC-DRAFT-008, TC-DRAFT-009, TC-DRAFT-010 | Full |
| Slide 5 (Certificate Management — Recognize Achievement) | TC-CERT-001, TC-CERT-002, TC-CERT-003, TC-CERT-004, TC-CERT-005, TC-CERT-006, TC-CERT-007, TC-CERT-008, TC-CERT-009, TC-CERT-010 | Full |
| Slide 6 (Learner Analytics & Reporting — Data-Driven Insights) | TC-ANALYTICS-001, TC-ANALYTICS-002, TC-ANALYTICS-003, TC-ANALYTICS-004, TC-ANALYTICS-005, TC-ANALYTICS-006, TC-ANALYTICS-007, TC-ANALYTICS-008, TC-ANALYTICS-009, TC-ANALYTICS-010, TC-ANALYTICS-011, TC-ANALYTICS-012, TC-ANALYTICS-013, TC-ANALYTICS-014, TC-ANALYTICS-015 | Full |
| Slide 7 (Deadline Management & Overdue Tracking) | TC-ASSIGN-007, TC-PROG-008, TC-ANALYTICS-006 | Full (covered across assignment, progress, and analytics sections) |
| Slide 8 (Notifications & Reminders) | TC-NOTIFY-001, TC-NOTIFY-002, TC-NOTIFY-003 | Partial (Automated reminders NOT IMPLEMENTED — manual email only) |
| Slide 9 (End-to-End Assignment Lifecycle) | TC-ASSIGN-015 | Full (end-to-end lifecycle test) |

**Total Test Cases:** 63

**Implementation Gaps Summary:**
1. **Slide 8 — Automated Reminder/Notification System:** NOT IMPLEMENTED. No automated escalation, no scheduled reminders, no cron-based notifications for overdue assignments. Only manual email sending via `POST /:orgId/deadlines/email` exists.

---

## 6. Glossary

| Term | Definition |
|------|-----------|
| **assignmentScope** | Enum field on `courseAssignments` defining the level of assignment: "organization" (all org members), "department" (Level 1 unit + children), "unit" (Level 2 sub-unit + teams), "team" (Level 3 specific team), "user" (individual user). |
| **audience** | Enum field on `courseAssignments` specifying the target audience: "learner" (students/employees) or "instructor" (teachers/trainers). |
| **Cascade Resolution** | The process by which `CourseAssignmentService.getCourseAssignmentsForUser()` resolves all assignment scopes a user falls under — from their specific user ID, team, unit, department, to organization — returning a union of all applicable assignments. |
| **certificateId** | A human-readable display identifier for a certificate (e.g., "CERT-XXXXXXXX"), distinct from the internal UUID `id`. Used for verification and sharing. |
| **certificateType** | Enum field on `certificates`: "lesson" (issued for completing a specific lesson quiz) or "course" (issued for completing all quizzes in a course). |
| **cloneMapping** | JSONB field on draft `courses` that maps all original IDs to their cloned counterparts: `lessonIdMap`, `quizIdMap`, `quizCardIdMap`, `courseLessonIdMap`, `filesMap`. Used during publish migration for ID remapping. |
| **completedAt** | Timestamp field on `courseProgress` and `certificates` recording when the course was completed or certificate was earned. |
| **courseProgress** | Database table tracking overall course-level progress per user: status (not_started/in_progress/completed), percentComplete, completedLessons, totalLessons, completedAt. |
| **CourseAssignmentService** | Backend service class in `server/services/courseAssignmentService.ts` that handles all course assignment CRUD operations, cascade resolution, and progress enrichment. |
| **CourseCompletionService** | Backend service class in `server/services/courseCompletionService.ts` that computes course completion by checking quiz pass status for all course lessons. Uses dual-mechanism detection. |
| **CourseVersioningService** | Backend service class in `server/services/courseVersioningService.ts` that handles the full-clone draft approach: create draft, publish draft (with 6-table migration), and discard draft. |
| **Dual-Mechanism Completion** | Course completion detection uses two mechanisms: (1) Primary — quiz-based: all lesson quizzes passed = course complete; (2) Fallback — `userCourseLessonProgress` status for lessons without quizzes. |
| **Dual-ID Resolution** | When a draft course ID is passed to API endpoints, the system checks if the ID belongs to a draft (status = "draft" AND `sourceVersionCourseId` exists) and automatically resolves to the real original course ID. |
| **effective_assignments CTE** | A Common Table Expression (CTE) used in the deadlines analytics query that resolves the full cascade of course assignments (user → team → unit → department → organization) to determine which assignments effectively apply to each user. |
| **mandatory** | Boolean field on `courseAssignments` indicating whether the assignment is required (true) or optional (false). Mandatory assignments are tracked for overdue reporting. |
| **MailerSendService** | Backend service that sends transactional emails via the MailerSend API. Used for certificate delivery (`sendCertificateEmail`) and deadline reminders. |
| **ObjectStorageService** | Backend service that interacts with Replit Object Storage for file operations (storing/retrieving certificate PDFs, PPTX files). Generates signed URLs for time-limited download access. |
| **overdue** | An assignment is overdue when: `courseAssignments.dueDate` < NOW() AND the learner has not completed the course (`courseProgress.status` IS NULL OR != "completed"). |
| **parseReportFilters** | Utility function in `reportRoutes.ts` that standardizes query parameters (courseId, unitId/departmentId, startDate, endDate, courseStatus, search, limit) for consistent filtering across all analytics endpoints. |
| **percentComplete** | Decimal field on `courseProgress` representing the completion percentage (0–100). Calculated as `(completedLessons / totalLessons) * 100`. |
| **shareToken** | A unique token generated on `certificates` when a user shares their certificate publicly. Allows unauthenticated access to certificate details via `GET /api/certificates/shared/:shareToken`. |
| **sourceVersionCourseId** | UUID field on `courses` that links a draft course to its original parent course. Present only on draft copies. Used for dual-ID resolution and publish migration. |
| **STLC** | Software Testing Life Cycle — the systematic process for planning, designing, executing, and evaluating software tests. |
| **Trend Calculation** | Formula used in analytics overview: `((currentPeriodValue - previousPeriodValue) / previousPeriodValue) * 100`. Compares the current period against a previous period of equal length. |
| **userCourseLessonProgress** | Database table tracking individual lesson-level progress within a course: userId, courseId, lessonId, status (not_started/in_progress/completed), completedAt. |

---

*End of Document*
