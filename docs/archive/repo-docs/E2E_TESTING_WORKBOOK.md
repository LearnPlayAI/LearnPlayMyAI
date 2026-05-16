# LearnPlay Platform - End-to-End Testing Workbook

**Version:** 1.0  
**Last Updated:** December 2025  
**Document Owner:** QA Team

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Test Environment Setup](#2-test-environment-setup)
3. [Test Account Credentials](#3-test-account-credentials)
4. [How to Use This Document](#4-how-to-use-this-document)
5. [Learner Test Scenarios](#5-learner-test-scenarios)
6. [Teacher Test Scenarios](#6-teacher-test-scenarios)
7. [Organization Admin Test Scenarios](#7-organization-admin-test-scenarios)
8. [SuperAdmin Test Scenarios](#8-superadmin-test-scenarios)
9. [Cross-Role Integration Tests](#9-cross-role-integration-tests)
10. [Shared Services & Regression Tests](#10-shared-services--regression-tests)
11. [Findings Summary Template](#11-findings-summary-template)
12. [Glossary of Terms](#12-glossary-of-terms)

---

## 1. Introduction

### Purpose
This workbook provides comprehensive end-to-end test scenarios for the LearnPlay gamified education platform. It is designed to be followed by non-technical testers to validate all platform features across all user types.

### Scope
- **User Types Covered:** Learner, Teacher, Organization Admin, SuperAdmin
- **Features Covered:** All platform functionality including authentication, courses, quizzes, battle cards, payments, branding, and administration
- **Testing Type:** Functional end-to-end testing

### Testing Priorities
| Priority | Description | When to Test |
|----------|-------------|--------------|
| P0 - Critical | Core functionality that blocks all users | Every release |
| P1 - High | Major features affecting most users | Every release |
| P2 - Medium | Secondary features | Major releases |
| P3 - Low | Nice-to-have features | Quarterly |

---

## 2. Test Environment Setup

### Environment URLs
| Environment | URL | Purpose |
|-------------|-----|---------|
| Development | `https://workspace.replit.app` | Active development testing |
| Production | `https://learnplay.co.za` | Live environment (read-only tests) |

### Browser Requirements
- **Primary:** Chrome (latest version)
- **Secondary:** Firefox, Safari, Edge
- **Mobile:** Chrome Mobile, Safari Mobile

### Pre-Test Checklist
- [ ] Clear browser cache and cookies
- [ ] Disable browser extensions that may interfere
- [ ] Ensure stable internet connection
- [ ] Have test account credentials ready
- [ ] Open browser developer tools (F12) for error monitoring

### How to Perform a Hard Refresh
- **Windows/Linux:** Ctrl + Shift + R
- **Mac:** Cmd + Shift + R

---

## 3. Test Account Credentials

> **Note:** Request test account credentials from your QA Lead. Never use production credentials for testing.

### Test Accounts Needed

| Role | Account Type | Purpose |
|------|--------------|---------|
| Learner | Standard user | Test learning features |
| Teacher | Teacher role | Test content creation |
| Org Admin | Organization administrator | Test org management |
| SuperAdmin | Platform administrator | Test platform-wide features |

### Test Organizations
| Org Name | Type | Purpose |
|----------|------|---------|
| Test School A | School | Standard org testing |
| Test Business B | Business | Business features testing |
| Demo Organization | Demo | Demo mode testing |

---

## 4. How to Use This Document

### Test Table Legend

| Column | Description |
|--------|-------------|
| **ID** | Unique test identifier (e.g., L-001 for Learner test 1) |
| **Feature** | Feature or module being tested |
| **Preconditions** | Setup required before testing |
| **Steps** | Numbered actions to perform |
| **Expected Result** | What should happen |
| **Status** | Pass / Fail / Blocked / Not Run |
| **Tester** | Your initials and date |
| **Findings** | Notes, bugs, or observations |

### Status Definitions
| Status | Meaning |
|--------|---------|
| **Pass** | Feature works as expected |
| **Fail** | Feature does not work as expected |
| **Blocked** | Cannot test due to dependency issue |
| **Not Run** | Test not executed yet |
| **Partial** | Some steps pass, some fail |

### Reporting Issues
When a test fails:
1. Note the exact step where failure occurred
2. Take a screenshot
3. Check browser console (F12) for errors
4. Document error messages in Findings column
5. Note browser/device used

---

## 5. Learner Test Scenarios

### 5.1 Account & Authentication

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| L-001 | User Registration | P0 | None | 1. Go to homepage<br>2. Click "Register" or "Get Started"<br>3. Fill in email, username, password<br>4. Select organization (if prompted)<br>5. Submit registration | Account created, welcome screen shown | | | |
| L-002 | User Login | P0 | Registered account | 1. Go to login page<br>2. Enter email and password<br>3. Click "Sign In" | Logged in, redirected to dashboard | | | |
| L-003 | Password Reset | P0 | Registered account | 1. Go to login page<br>2. Click "Forgot Password"<br>3. Enter registered email<br>4. Check email for reset link<br>5. Click link and set new password | Password reset email received, new password works | | | |
| L-004 | Session Persistence | P1 | Logged in | 1. Log in to account<br>2. Close browser completely<br>3. Reopen browser and navigate to site | Still logged in (session maintained) | | | |
| L-005 | Logout | P0 | Logged in | 1. Click user avatar/menu<br>2. Click "Logout" | Logged out, redirected to login/home | | | |
| L-006 | Profile Update | P1 | Logged in | 1. Go to Profile/Settings<br>2. Update display name<br>3. Update avatar<br>4. Save changes | Profile updated, changes visible across platform | | | |
| L-007 | Currency Preference | P1 | Logged in | 1. Go to Settings<br>2. Change currency preference (USD/EUR/ZAR)<br>3. Save changes<br>4. View any pricing page | Prices displayed in selected currency | | | |

### 5.2 Course Discovery & Enrollment

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| L-010 | Browse Courses | P0 | Logged in | 1. Navigate to Courses/Browse<br>2. Scroll through course list<br>3. Use category filters<br>4. Use search function | Courses display with thumbnails, titles, prices | | | |
| L-011 | Course Details View | P0 | Logged in | 1. Click on any course card<br>2. View course details page | Course description, lessons, reviews, price visible | | | |
| L-012 | Free Course Enrollment | P0 | Free course available | 1. Find a free course<br>2. Click "Enroll" or "Start Learning"<br>3. Confirm enrollment | Enrolled successfully, course appears in My Courses | | | |
| L-013 | Paid Course Purchase | P0 | Logged in, has payment method | 1. Find a paid course<br>2. Click "Buy" or "Purchase"<br>3. Complete payment flow<br>4. Confirm purchase | Payment processed, course unlocked, receipt shown | | | |
| L-014 | My Courses View | P1 | Enrolled in courses | 1. Navigate to "My Courses" or "My Learning"<br>2. View enrolled courses | All enrolled courses visible with progress indicators | | | |
| L-015 | Course Progress Tracking | P1 | Partially completed course | 1. Open a partially completed course<br>2. Check progress indicator | Progress percentage accurate, completed lessons marked | | | |
| L-016 | Course Search | P1 | Logged in | 1. Use search bar on courses page<br>2. Enter course name or keyword<br>3. View results | Relevant courses appear in results | | | |
| L-017 | Course Filtering | P1 | Logged in | 1. Go to course browser<br>2. Apply category filter<br>3. Apply difficulty filter<br>4. Apply price filter | Courses filtered correctly | | | |

### 5.3 Lesson Viewing & Learning

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| L-020 | Start Lesson | P0 | Enrolled in course | 1. Open enrolled course<br>2. Click first lesson<br>3. View lesson content | Lesson content loads with text/video/resources | | | |
| L-021 | Video Playback | P0 | Lesson with video | 1. Open lesson with video<br>2. Play video<br>3. Pause, seek, adjust volume | Video plays smoothly with full controls | | | |
| L-022 | Lesson Navigation | P1 | Multi-lesson course | 1. Complete a lesson<br>2. Click "Next Lesson"<br>3. Navigate back to previous lesson | Navigation works, progress saved | | | |
| L-023 | Lesson Tabs | P1 | Lesson with resources | 1. Open lesson<br>2. Check Content tab<br>3. Check Transcript tab<br>4. Check Resources tab | All tabs display appropriate content | | | |
| L-024 | Lesson Completion | P0 | Started lesson | 1. Complete all lesson content<br>2. Mark lesson as complete (if manual)<br>3. Check progress | Lesson marked complete, progress updated | | | |
| L-025 | AI Content Display | P1 | AI-generated lesson | 1. Open an AI-generated lesson<br>2. View content structure<br>3. Check formatting | AI content displays properly formatted | | | |

### 5.4 Quizzes & Assessments

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| L-030 | Start Quiz | P0 | Quiz available | 1. Navigate to quiz section<br>2. Select a quiz<br>3. Click "Start Quiz" | Quiz loads with questions and timer | | | |
| L-031 | Answer Questions | P0 | Quiz started | 1. Read question<br>2. Select answer<br>3. Submit or move to next | Answer registered, feedback shown if immediate | | | |
| L-032 | Quiz Timer | P1 | Timed quiz | 1. Start timed quiz<br>2. Observe timer countdown<br>3. Note warning at low time | Timer visible, changes color when low | | | |
| L-033 | Quiz Completion | P0 | Quiz in progress | 1. Answer all questions<br>2. Submit quiz<br>3. View results | Score displayed, correct answers shown | | | |
| L-034 | Quiz Retry | P1 | Completed quiz with retries allowed | 1. Complete quiz<br>2. Click "Retry" or "Try Again"<br>3. Retake quiz | Quiz resets, new attempt recorded | | | |
| L-035 | Quiz History | P2 | Multiple quiz attempts | 1. Go to quiz history/results<br>2. View past attempts | All attempts listed with scores and dates | | | |

### 5.5 Battle Cards & Gamification

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| L-040 | Battle Card Lobby | P0 | Logged in | 1. Navigate to Battle/Games section<br>2. View lobby | Available games/opponents visible | | | |
| L-041 | Start Single Player Game | P0 | In lobby | 1. Select single player mode<br>2. Choose difficulty<br>3. Start game | Game starts with battle cards | | | |
| L-042 | Battle Card Gameplay | P0 | Game started | 1. View your cards<br>2. Select card to play<br>3. Observe battle outcome<br>4. Continue until game ends | Cards play correctly, winner determined | | | |
| L-043 | Multiplayer Game | P1 | Another player available | 1. Challenge another player<br>2. Wait for acceptance<br>3. Play multiplayer game | Game syncs between players | | | |
| L-044 | 1v1 Challenge | P1 | Opponent available | 1. Select 1v1 mode<br>2. Issue challenge<br>3. Complete match | Match recorded, winner announced | | | |
| L-045 | XP Earning | P0 | Complete activities | 1. Complete a quiz or game<br>2. Check XP notification<br>3. View profile XP total | XP added correctly to account | | | |
| L-046 | Level Up | P1 | Close to level threshold | 1. Complete activity to gain XP<br>2. Cross level threshold | Level up animation/notification shown | | | |
| L-047 | Leaderboard View | P1 | Logged in | 1. Navigate to Leaderboard<br>2. View rankings<br>3. Filter by time period | Leaderboard displays with correct rankings | | | |
| L-048 | Power-Up Usage | P1 | Power-ups owned | 1. Go to inventory<br>2. Select power-up<br>3. Activate during game | Power-up applies effect correctly | | | |
| L-049 | Cosmetics Application | P2 | Cosmetics owned | 1. Go to profile/inventory<br>2. Select cosmetic item<br>3. Apply to avatar/cards | Cosmetic displays correctly | | | |
| L-050 | Season Pass View | P1 | Season active | 1. Navigate to Season Pass<br>2. View tiers and rewards<br>3. Check current progress | Season pass progress accurate | | | |

### 5.6 LP Credits & Wallet

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| L-060 | View LP Credit Balance | P0 | Logged in | 1. Check header/profile for LP credit display<br>2. Navigate to wallet page | Balance displayed correctly | | | |
| L-061 | Purchase LP Credits | P0 | Payment method available | 1. Go to LP Credit purchase page<br>2. Select credit package<br>3. Complete payment | Credits added to balance | | | |
| L-062 | Use LP Credits | P0 | Has LP credits | 1. Start activity requiring credits<br>2. Confirm credit usage<br>3. Check balance after | Credits deducted correctly | | | |
| L-063 | Credit Transaction History | P1 | Previous transactions | 1. Go to wallet/transaction history<br>2. View transactions | All transactions listed with dates and amounts | | | |

### 5.7 Certificates & Achievements

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| L-070 | View Certificates | P1 | Completed course | 1. Go to Certificates section<br>2. View earned certificates | Certificates displayed with course info | | | |
| L-071 | Download Certificate | P1 | Certificate earned | 1. Select certificate<br>2. Click Download/PDF | PDF downloads with proper formatting | | | |
| L-072 | Share Certificate | P2 | Certificate earned | 1. Select certificate<br>2. Click Share<br>3. Copy link or share to social | Shareable link generated | | | |
| L-073 | View Badges/Achievements | P1 | Achievements earned | 1. Go to Achievements/Badges<br>2. View earned badges | All earned achievements displayed | | | |

### 5.8 Notifications & Communication

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| L-080 | View Notifications | P1 | Has notifications | 1. Click notification bell/icon<br>2. View notification list | Notifications displayed with timestamps | | | |
| L-081 | Mark Notification Read | P2 | Unread notifications | 1. Open notification center<br>2. Click on notification<br>3. Check read status | Notification marked as read | | | |
| L-082 | Email Notifications | P1 | Email enabled | 1. Trigger notification event<br>2. Check email inbox | Email received with correct content | | | |

---

## 6. Teacher Test Scenarios

### 6.1 Teacher Dashboard

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| T-001 | Access Teacher Dashboard | P0 | Teacher account | 1. Log in as teacher<br>2. Navigate to dashboard | Dashboard loads with analytics overview | | | |
| T-002 | View Student Analytics | P1 | Students enrolled | 1. Go to analytics section<br>2. View student engagement<br>3. Check completion rates | Analytics data displayed accurately | | | |
| T-003 | View Recent Activity | P1 | Active students | 1. Check recent activity feed | Recent student activities shown | | | |

### 6.2 Course Creation & Management

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| T-010 | Create New Course | P0 | Teacher account | 1. Click "Create Course"<br>2. Enter title and description<br>3. Set category and difficulty<br>4. Add thumbnail<br>5. Save as draft | Course created in draft status | | | |
| T-011 | Course Framework Wizard | P1 | Creating course | 1. Start course creation<br>2. Use framework wizard<br>3. Follow guided steps | Framework generates course structure | | | |
| T-012 | Edit Course Details | P0 | Existing course | 1. Open course<br>2. Click Edit<br>3. Modify details<br>4. Save changes | Changes saved correctly | | | |
| T-013 | Set Course Visibility | P1 | Existing course | 1. Open course settings<br>2. Set to Public or Org-Only<br>3. Save | Visibility enforced correctly | | | |
| T-014 | Set Course Pricing | P0 | Existing course | 1. Open course settings<br>2. Set price or free<br>3. Configure currency<br>4. Save | Pricing applied to course | | | |
| T-015 | Publish Course | P0 | Complete draft course | 1. Review course content<br>2. Click "Publish"<br>3. Confirm publication | Course visible to learners | | | |
| T-016 | Unpublish Course | P1 | Published course | 1. Open published course<br>2. Click "Unpublish"<br>3. Confirm | Course hidden from learners | | | |
| T-017 | Delete Course | P1 | Draft or published course | 1. Select course<br>2. Click Delete<br>3. Confirm deletion | Course removed (with warning for enrolled students) | | | |
| T-018 | Duplicate Course | P2 | Existing course | 1. Select course<br>2. Click Duplicate<br>3. Edit copied course | New course created with same content | | | |

### 6.3 Lesson Creation

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| T-020 | Add Lesson to Course | P0 | Course exists | 1. Open course<br>2. Click "Add Lesson"<br>3. Enter lesson title<br>4. Add content<br>5. Save | Lesson added to course | | | |
| T-021 | Lesson Builder Interface | P0 | Creating lesson | 1. Open lesson builder<br>2. Use text editor<br>3. Add media elements<br>4. Preview lesson | Builder functions correctly | | | |
| T-022 | Upload Video Content | P1 | Lesson builder open | 1. Click video upload<br>2. Select video file<br>3. Wait for processing<br>4. Preview | Video uploaded and plays | | | |
| T-023 | Add Resources to Lesson | P1 | Lesson exists | 1. Open lesson<br>2. Go to Resources tab<br>3. Upload PDF/document<br>4. Save | Resources attached to lesson | | | |
| T-024 | Reorder Lessons | P1 | Multiple lessons | 1. Open course<br>2. Drag lessons to reorder<br>3. Save order | Lesson order updated | | | |
| T-025 | Edit Existing Lesson | P0 | Lesson exists | 1. Open lesson<br>2. Modify content<br>3. Save changes | Changes saved, versioning tracked | | | |
| T-026 | Delete Lesson | P1 | Lesson exists | 1. Select lesson<br>2. Click Delete<br>3. Confirm | Lesson removed from course | | | |

### 6.4 AI Content Generation

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| T-030 | AI Lesson Generation | P0 | LP credits available | 1. Click "AI Generate Lesson"<br>2. Enter topic/prompt<br>3. Select style options<br>4. Generate<br>5. Review and edit | AI generates lesson content | | | |
| T-031 | AI Topic Suggestions | P1 | Creating lesson | 1. Start new lesson<br>2. Use AI topic suggestions<br>3. Select suggested topic | Topics relevant to course | | | |
| T-032 | Gamma Import | P1 | Document available | 1. Click "Import from Gamma"<br>2. Upload PPTX/PDF/Word<br>3. Process document<br>4. Review converted content | Document converted to lesson | | | |
| T-033 | AI Description Generation | P2 | Creating course | 1. Enter course title<br>2. Click "Generate Description"<br>3. Review AI description | Description generated and editable | | | |
| T-034 | AI Thumbnail Generation | P2 | ENABLE_AI_THUMBNAILS on | 1. Open course<br>2. Click "Generate Thumbnail"<br>3. Select style<br>4. Apply thumbnail | AI thumbnail created | | | |

### 6.5 Quiz Creation

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| T-040 | Create Quiz | P0 | Course/lesson exists | 1. Click "Create Quiz"<br>2. Enter quiz title<br>3. Set time limit<br>4. Save | Quiz created in draft | | | |
| T-041 | Add Multiple Choice Question | P0 | Quiz exists | 1. Open quiz editor<br>2. Add question<br>3. Enter question text<br>4. Add answer options<br>5. Mark correct answer<br>6. Save | Question added to quiz | | | |
| T-042 | Add True/False Question | P1 | Quiz exists | 1. Add new question<br>2. Select True/False type<br>3. Enter question<br>4. Set correct answer | True/False question added | | | |
| T-043 | Quiz Wizard | P1 | Creating quiz | 1. Start quiz creation wizard<br>2. Follow guided steps<br>3. Complete quiz | Wizard creates complete quiz | | | |
| T-044 | AI Quiz Generation | P0 | LP credits, topic defined | 1. Click "AI Generate Quiz"<br>2. Enter topic<br>3. Select question count/difficulty<br>4. Generate<br>5. Review and edit | AI generates quiz questions | | | |
| T-045 | Edit Quiz Question | P0 | Quiz with questions | 1. Open quiz<br>2. Edit question<br>3. Save changes | Question updated | | | |
| T-046 | Delete Quiz Question | P1 | Quiz with questions | 1. Open quiz<br>2. Select question<br>3. Delete<br>4. Save | Question removed | | | |
| T-047 | Reorder Quiz Questions | P1 | Multiple questions | 1. Open quiz editor<br>2. Drag to reorder<br>3. Save | Question order updated | | | |
| T-048 | Set Quiz Settings | P1 | Quiz exists | 1. Open quiz settings<br>2. Set pass percentage<br>3. Set retry attempts<br>4. Enable/disable timer<br>5. Save | Settings applied | | | |
| T-049 | Save Quiz as Draft | P1 | Quiz in progress | 1. Edit quiz<br>2. Click "Save Draft" | Quiz saved without publishing | | | |
| T-050 | Publish Quiz | P0 | Complete draft quiz | 1. Review quiz<br>2. Click Publish | Quiz available to students | | | |

### 6.6 Assignments & Grading

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| T-060 | Assignment Wizard | P1 | Course exists | 1. Open assignment wizard<br>2. Select content type<br>3. Set due date<br>4. Assign to students/groups<br>5. Create | Assignment created | | | |
| T-061 | View Submissions | P1 | Assigned work | 1. Open assignment<br>2. View submissions list | All submissions visible | | | |
| T-062 | Grade Submission | P1 | Submission exists | 1. Open submission<br>2. Review work<br>3. Enter grade<br>4. Add feedback<br>5. Submit grade | Grade recorded | | | |
| T-063 | Bulk Grading | P2 | Multiple submissions | 1. Select multiple submissions<br>2. Apply bulk action | Grades applied efficiently | | | |

### 6.7 Student Management

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| T-070 | View Enrolled Students | P0 | Students enrolled | 1. Open course<br>2. View Students tab | Student list displayed | | | |
| T-071 | Student Progress View | P1 | Active students | 1. Select student<br>2. View progress details | Individual progress shown | | | |
| T-072 | Student Insights Modal | P1 | Student activity | 1. Click student name<br>2. View insights modal | Engagement and performance data shown | | | |
| T-073 | Audience Management | P1 | Course with audience | 1. Open audience settings<br>2. Add/remove student groups<br>3. Save | Audience updated | | | |

---

## 7. Organization Admin Test Scenarios

### 7.1 Admin Dashboard & Access

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| O-001 | Access Admin Dashboard | P0 | Org Admin account | 1. Log in as Org Admin<br>2. Navigate to Admin panel | Dashboard loads with org overview | | | |
| O-002 | View Organization Stats | P1 | Active organization | 1. View dashboard metrics<br>2. Check user counts<br>3. Check activity graphs | Stats accurate and current | | | |
| O-003 | Admin Sidebar Navigation | P0 | In admin panel | 1. Click through sidebar items<br>2. Verify each section loads | All admin sections accessible | | | |

### 7.2 User Management

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| O-010 | View All Users | P0 | Organization has users | 1. Go to User Management<br>2. View user list<br>3. Use search/filter | All users displayed with roles | | | |
| O-011 | Add New User | P0 | Admin access | 1. Click "Add User"<br>2. Enter user details<br>3. Assign role<br>4. Send invite | User added, invite sent | | | |
| O-012 | Edit User Role | P0 | User exists | 1. Select user<br>2. Click Edit<br>3. Change role<br>4. Save | Role updated | | | |
| O-013 | Deactivate User | P1 | User exists | 1. Select user<br>2. Click Deactivate<br>3. Confirm | User cannot log in | | | |
| O-014 | Reactivate User | P1 | Deactivated user | 1. Find deactivated user<br>2. Click Reactivate<br>3. Confirm | User can log in again | | | |
| O-015 | Delete User | P1 | User exists | 1. Select user<br>2. Click Delete<br>3. Confirm with data handling choice | User removed | | | |
| O-016 | Bulk User Import | P2 | CSV file ready | 1. Go to Bulk Import<br>2. Upload CSV<br>3. Map columns<br>4. Import | Multiple users created | | | |
| O-017 | View User Activity | P1 | Active user | 1. Select user<br>2. View activity log | User actions logged | | | |

### 7.3 Join Codes & Requests

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| O-020 | Generate Join Code | P0 | Org Admin access | 1. Go to Join Codes<br>2. Click Generate<br>3. Set expiry/limits<br>4. Copy code | Code generated and works | | | |
| O-021 | View Active Join Codes | P1 | Codes exist | 1. View join codes list | All active codes displayed | | | |
| O-022 | Revoke Join Code | P1 | Active code | 1. Select code<br>2. Click Revoke<br>3. Confirm | Code no longer works | | | |
| O-023 | View Join Requests | P1 | Pending requests | 1. Go to Join Requests<br>2. View pending list | Requests displayed | | | |
| O-024 | Approve Join Request | P1 | Pending request | 1. Select request<br>2. Click Approve<br>3. Assign role | User added to org | | | |
| O-025 | Reject Join Request | P1 | Pending request | 1. Select request<br>2. Click Reject<br>3. Optionally add reason | Request rejected | | | |

### 7.4 License Management

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| O-030 | View License Overview | P0 | License exists | 1. Go to License section<br>2. View current license details | License type, seats, expiry shown | | | |
| O-031 | View Seat Usage | P0 | Active license | 1. Check seat allocation<br>2. View used vs available | Accurate seat count | | | |
| O-032 | Purchase License | P0 | No license or upgrading | 1. Go to License Purchase<br>2. Select plan<br>3. Choose seat count<br>4. Complete payment | License activated | | | |
| O-033 | Add License Seats | P1 | Active license | 1. Go to License settings<br>2. Add seats<br>3. Pay for additional seats | Seats added | | | |
| O-034 | License Analytics | P1 | Active license | 1. View license analytics<br>2. Check usage trends | Analytics displayed | | | |
| O-035 | License Settings | P1 | Active license | 1. Open license settings<br>2. Configure auto-renewal<br>3. Set notifications | Settings saved | | | |

### 7.5 Billing & Invoices

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| O-040 | View Billing Dashboard | P0 | Billing history | 1. Go to Billing<br>2. View dashboard | Current balance, payment method shown | | | |
| O-041 | View Invoices | P0 | Invoices exist | 1. Go to Invoices<br>2. View invoice list | All invoices listed | | | |
| O-042 | Download Invoice PDF | P1 | Invoice exists | 1. Select invoice<br>2. Click Download<br>3. Open PDF | PDF downloads correctly | | | |
| O-043 | View Invoice Details | P1 | Invoice exists | 1. Click invoice<br>2. View detail page | Line items, totals, status shown | | | |
| O-044 | Pay Outstanding Invoice | P0 | Unpaid invoice | 1. Select unpaid invoice<br>2. Click Pay<br>3. Complete payment | Invoice marked paid | | | |
| O-045 | View Audit Log | P1 | Actions taken | 1. Go to Audit Log<br>2. Filter by date/action<br>3. View entries | All actions logged | | | |
| O-046 | LP Credit Purchase (Org) | P1 | Org billing enabled | 1. Go to LP Credits<br>2. Purchase credits for org<br>3. Complete payment | Credits added to org pool | | | |
| O-047 | LP Credit Center | P1 | LP credits exist | 1. View LP Credit Center<br>2. Check distribution<br>3. Allocate to users | Credits managed properly | | | |

### 7.6 Branding & Theme Editor

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| O-050 | Access Theme Editor | P0 | Org Admin access | 1. Go to Branding/Theme Editor<br>2. View current theme | Editor loads with current settings | | | |
| O-051 | Upload Organization Logo | P0 | Image file ready | 1. Open Logo section<br>2. Click Upload<br>3. Select PNG/JPG file<br>4. Save | Logo uploaded and displays | | | |
| O-052 | Upload Favicon | P1 | Icon file ready | 1. Open Favicon section<br>2. Upload .ico/.png file<br>3. Save | Favicon updates in browser tab | | | |
| O-053 | Change Primary Color | P0 | In theme editor | 1. Find Primary Color picker<br>2. Select new color<br>3. Preview changes<br>4. Save | Color applied across UI | | | |
| O-054 | Change Secondary Colors | P1 | In theme editor | 1. Adjust background colors<br>2. Adjust text colors<br>3. Preview<br>4. Save | Colors applied consistently | | | |
| O-055 | Select Preset Theme | P0 | Theme gallery available | 1. Open Theme Gallery<br>2. Browse 35 presets<br>3. Select and apply theme | Preset theme applied | | | |
| O-056 | Custom Font Selection | P1 | In theme editor | 1. Open Typography section<br>2. Select heading font<br>3. Select body font<br>4. Save | Fonts applied | | | |
| O-057 | Preview Theme Changes | P0 | Changes made | 1. Make theme changes<br>2. View live preview tabs<br>3. Check different page previews | Preview accurately shows changes | | | |
| O-058 | Reset to Default Theme | P1 | Custom theme active | 1. Click Reset<br>2. Confirm reset<br>3. View result | Returns to default platform theme | | | |
| O-059 | Check Contrast Warnings | P1 | Low contrast colors | 1. Set low contrast color combo<br>2. Check for WCAG warning | Contrast warning displayed | | | |
| O-060 | Theme Applies to All Pages | P0 | Theme saved | 1. Save theme<br>2. Navigate to multiple pages<br>3. Check consistency | Theme consistent everywhere | | | |
| O-061 | Click-to-Edit Token | P1 | In preview | 1. Click element in preview<br>2. Edit token value<br>3. See live update | Direct editing works | | | |

### 7.7 Organization Settings

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| O-070 | Update Org Name | P1 | Org Admin access | 1. Go to Settings<br>2. Edit organization name<br>3. Save | Name updated everywhere | | | |
| O-071 | Set Currency Preference | P1 | In settings | 1. Select default currency<br>2. Save | Currency used in displays | | | |
| O-072 | Configure Notifications | P1 | In settings | 1. Open notification settings<br>2. Enable/disable options<br>3. Save | Notification preferences saved | | | |
| O-073 | Custom Support Links | P2 | In settings | 1. Add support URL<br>2. Add support email<br>3. Add terms/privacy URLs<br>4. Save | Links appear in footer/help | | | |

### 7.8 Analytics & Reporting

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| O-080 | View E-Learning Sales Report | P1 | Sales exist | 1. Go to Sales Reports<br>2. Select date range<br>3. View report | Sales data displayed | | | |
| O-081 | View Marketplace Analytics | P1 | Marketplace active | 1. Go to Marketplace section<br>2. View analytics | Revenue, enrollments shown | | | |
| O-082 | Export Report | P2 | Report generated | 1. Generate report<br>2. Click Export<br>3. Choose format | Report downloads | | | |
| O-083 | View Payout Schedule | P1 | Payouts pending | 1. Go to Payouts<br>2. View upcoming payouts | Schedule displayed | | | |

---

## 8. SuperAdmin Test Scenarios

### 8.1 SuperAdmin Access & Dashboard

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| S-001 | Access SuperAdmin Dashboard | P0 | SuperAdmin account | 1. Log in as SuperAdmin<br>2. Navigate to admin panel | Full admin dashboard loads | | | |
| S-002 | View Platform Overview | P0 | Platform running | 1. Check dashboard metrics<br>2. View org count<br>3. View user count<br>4. View revenue summary | Accurate platform-wide stats | | | |
| S-003 | SuperAdmin Navigation | P0 | In admin panel | 1. Navigate all admin sections<br>2. Verify access to all areas | Full access confirmed | | | |

### 8.2 Organization Management

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| S-010 | View All Organizations | P0 | Orgs exist | 1. Go to Organizations<br>2. View complete list<br>3. Use search/filter | All organizations displayed | | | |
| S-011 | Create Organization | P0 | SuperAdmin access | 1. Click "Create Org"<br>2. Enter org details<br>3. Select org type<br>4. Create | Organization created | | | |
| S-012 | Edit Organization | P1 | Org exists | 1. Select organization<br>2. Edit details<br>3. Save | Changes saved | | | |
| S-013 | Set Demo Organization | P1 | Org exists | 1. Select organization<br>2. Toggle isDemo flag<br>3. Save | Demo mode enabled/disabled | | | |
| S-014 | View Organization Details | P0 | Org exists | 1. Click organization<br>2. View detail page | Full org info displayed | | | |
| S-015 | Delete Organization | P1 | Org exists | 1. Select organization<br>2. Click Delete<br>3. Confirm with data handling | Organization removed | | | |

### 8.3 Impersonation

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| S-020 | Start Impersonation | P0 | Org Admin exists | 1. Find organization<br>2. Click "Impersonate"<br>3. Confirm | View as Org Admin, banner shown | | | |
| S-021 | Impersonation Banner | P0 | Impersonating | 1. Check for impersonation banner<br>2. Verify org name shown | Clear indicator visible | | | |
| S-022 | Navigate While Impersonating | P1 | Impersonating | 1. Navigate various pages<br>2. Check data is org-specific | See impersonated org's data | | | |
| S-023 | End Impersonation | P0 | Impersonating | 1. Click "End Impersonation" or exit<br>2. Confirm return to SuperAdmin | Returns to SuperAdmin view | | | |
| S-024 | Impersonation Audit | P1 | Impersonation performed | 1. Check audit log<br>2. Find impersonation entries | Entry/exit logged | | | |

### 8.4 Platform Configuration

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| S-030 | View Feature Flags | P0 | SuperAdmin access | 1. Go to Feature Flags<br>2. View all flags | All flags displayed with status | | | |
| S-031 | Toggle Feature Flag | P0 | Flag exists | 1. Select feature flag<br>2. Toggle on/off<br>3. Save | Feature enabled/disabled platform-wide | | | |
| S-032 | Create Feature Flag | P1 | SuperAdmin access | 1. Click "Add Flag"<br>2. Enter name and description<br>3. Set default value<br>4. Create | New flag created | | | |
| S-033 | Org-Specific Flag Override | P1 | Flag exists, org exists | 1. Select flag<br>2. Add org override<br>3. Save | Flag has different value for specific org | | | |
| S-034 | View Platform Settings | P1 | SuperAdmin access | 1. Go to Platform Settings<br>2. Review all settings | Settings displayed | | | |

### 8.5 Payment & Revenue Management

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| S-040 | Set YOCO Payment Mode | P0 | SuperAdmin access | 1. Go to Payment Settings<br>2. Select Test or Live mode<br>3. Save | Payment mode changed | | | |
| S-041 | View Platform Revenue | P0 | Revenue data exists | 1. Go to Platform Revenue<br>2. View totals by period<br>3. Filter by date | Revenue data accurate | | | |
| S-042 | View Revenue by Organization | P1 | Multiple orgs with revenue | 1. View revenue breakdown<br>2. Sort by organization | Org-level breakdown shown | | | |
| S-043 | Platform Pricing Management | P0 | SuperAdmin access | 1. Go to Platform Pricing<br>2. View/edit learner costs<br>3. View/edit org costs<br>4. Save | Pricing updated | | | |
| S-044 | Manage Payouts | P0 | Payouts due | 1. Go to Payout Management<br>2. View pending payouts<br>3. Process payout<br>4. Mark complete | Payout processed | | | |
| S-045 | Payout History | P1 | Payouts processed | 1. View payout history<br>2. Filter by date/org | History displayed | | | |

### 8.6 Currency & Exchange Rates

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| S-050 | View Current Exchange Rates | P1 | Rates fetched | 1. Go to Currency Settings<br>2. View current rates | Rates displayed with timestamps | | | |
| S-051 | Manual Rate Refresh | P2 | SuperAdmin access | 1. Click "Refresh Rates"<br>2. Confirm | Rates updated from API | | | |
| S-052 | View Rate History | P2 | Historical data | 1. View rate history<br>2. Check for anomalies | History displayed | | | |

### 8.7 Webhook & Integration Management

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| S-060 | View Webhook Status | P1 | Webhooks configured | 1. Go to Webhook Admin<br>2. Check YOCO webhook status | Status and URL displayed | | | |
| S-061 | View Webhook Logs | P1 | Webhook events | 1. View webhook log<br>2. Check recent events | Events logged with results | | | |
| S-062 | Gamma Theme Sync | P1 | Gamma integration | 1. Go to Theme Management<br>2. Trigger theme sync<br>3. View result | Themes synced from Gamma | | | |

### 8.8 Platform Reports & Analytics

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| S-070 | View Organization Analytics | P0 | Multiple orgs | 1. Go to Org Analytics<br>2. Compare organizations<br>3. View trends | Cross-org analytics displayed | | | |
| S-071 | View Sales Inquiries | P1 | Inquiries exist | 1. Go to Sales Inquiries<br>2. View pending inquiries<br>3. Triage/respond | Inquiries managed | | | |
| S-072 | Platform-Wide Reports | P1 | Data exists | 1. Generate platform report<br>2. Select metrics<br>3. Export | Report generated | | | |

---

## 9. Cross-Role Integration Tests

These tests verify that features work correctly across multiple user roles.

### 9.1 Teacher-to-Learner Flow

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| X-001 | Course Visibility | P0 | Teacher + Learner accounts | 1. Teacher creates and publishes course<br>2. Learner searches for course<br>3. Learner enrolls<br>4. Learner accesses content | Course flows from creation to consumption | | | |
| X-002 | Quiz Assignment Flow | P0 | Teacher + Learner | 1. Teacher creates quiz<br>2. Teacher assigns to students<br>3. Learner sees assignment<br>4. Learner completes quiz<br>5. Teacher views results | Full quiz workflow | | | |
| X-003 | AI Content to Student | P1 | Teacher + Learner | 1. Teacher generates AI lesson<br>2. Teacher publishes<br>3. Learner views AI content | AI content accessible to learners | | | |

### 9.2 Org Admin-to-Teacher Flow

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| X-010 | Teacher Role Assignment | P0 | Org Admin + User | 1. Org Admin creates user<br>2. Assigns Teacher role<br>3. User logs in<br>4. User sees Teacher dashboard | Role properly assigned | | | |
| X-011 | Org Branding for Teacher | P1 | Org Admin + Teacher | 1. Org Admin sets custom branding<br>2. Teacher logs in<br>3. Teacher sees org branding | Branding applies to Teacher view | | | |

### 9.3 SuperAdmin-to-Org Admin Flow

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| X-020 | License Provisioning | P0 | SuperAdmin + New Org | 1. SuperAdmin creates org<br>2. Org Admin purchases license<br>3. SuperAdmin verifies in reports | License flow complete | | | |
| X-021 | Feature Flag Effect | P0 | SuperAdmin + Org Admin | 1. SuperAdmin disables feature<br>2. Org Admin tries to access feature<br>3. Feature unavailable | Flag correctly restricts access | | | |
| X-022 | Impersonation Full Flow | P0 | SuperAdmin + Org | 1. SuperAdmin impersonates Org Admin<br>2. Makes changes to org<br>3. Ends impersonation<br>4. Changes persist | Impersonation works correctly | | | |

### 9.4 Payment Flow End-to-End

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| X-030 | Course Purchase E2E | P0 | Teacher + Learner + Payment | 1. Teacher sets course price<br>2. Learner purchases course<br>3. Payment processes<br>4. Course unlocks<br>5. Teacher sees revenue<br>6. SuperAdmin sees platform cut | Complete purchase flow | | | |
| X-031 | License Purchase E2E | P0 | Org Admin + Payment | 1. Org Admin initiates purchase<br>2. Selects plan and seats<br>3. Completes payment<br>4. License activates<br>5. Users can access features | Complete license flow | | | |
| X-032 | LP Credit Flow E2E | P0 | Admin + Teacher + Learner | 1. Org buys LP credits<br>2. Credits allocated<br>3. Teacher uses for AI generation<br>4. Credits deducted correctly | Credit flow accurate | | | |

---

## 10. Shared Services & Regression Tests

### 10.1 Authentication & Sessions

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| R-001 | Session Timeout | P1 | Logged in | 1. Log in<br>2. Wait for session timeout<br>3. Try to perform action | Redirected to login | | | |
| R-002 | Concurrent Sessions | P1 | Account exists | 1. Log in on Browser A<br>2. Log in on Browser B<br>3. Perform actions on both | Both sessions work OR policy enforced | | | |
| R-003 | Invalid Token Handling | P1 | Logged in | 1. Manually invalidate session<br>2. Try API request | Proper error, redirect to login | | | |

### 10.2 Email Notifications

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| R-010 | Welcome Email | P1 | New registration | 1. Register new account<br>2. Check email | Welcome email received | | | |
| R-011 | Password Reset Email | P0 | Account exists | 1. Request password reset<br>2. Check email<br>3. Click reset link | Email received, link works | | | |
| R-012 | Purchase Receipt Email | P0 | Complete purchase | 1. Purchase course/license<br>2. Check email | Receipt email with PDF attachment | | | |
| R-013 | Invoice Email | P1 | Invoice generated | 1. Generate invoice<br>2. Check email | Invoice email received | | | |

### 10.3 Theme & Branding Propagation

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| R-020 | Theme on Login Page | P0 | Org has custom theme | 1. Navigate to org login URL<br>2. View login page | Org branding displayed | | | |
| R-021 | Theme on Dashboard | P0 | Logged in with org theme | 1. Log in<br>2. View dashboard | Theme applied | | | |
| R-022 | Theme on Public Pages | P0 | Org has theme | 1. View public course page<br>2. Check branding | Org branding on public pages | | | |
| R-023 | Logo on All Pages | P0 | Logo uploaded | 1. Navigate multiple pages<br>2. Check header logo | Logo consistent everywhere | | | |
| R-024 | Dark Mode with Theme | P1 | Dark mode enabled | 1. Enable dark mode<br>2. Check theme colors | Dark mode respects theme | | | |

### 10.4 Multi-Currency Display

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| R-030 | USD Display | P1 | USD selected | 1. Set currency to USD<br>2. View pricing | Prices in USD ($) | | | |
| R-031 | EUR Display | P1 | EUR selected | 1. Set currency to EUR<br>2. View pricing | Prices in EUR (€) | | | |
| R-032 | ZAR Display | P1 | ZAR selected | 1. Set currency to ZAR<br>2. View pricing | Prices in ZAR (R) | | | |
| R-033 | Locked Rate at Checkout | P0 | Multi-currency | 1. Add item to cart<br>2. View checkout<br>3. Check rate lock indicator | Rate locked for 30 minutes | | | |

### 10.5 Object Storage & Media

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| R-040 | Image Upload | P0 | Upload feature | 1. Upload image<br>2. Save<br>3. Refresh page | Image persists | | | |
| R-041 | PDF Download | P1 | PDF attachment | 1. Download certificate/invoice PDF<br>2. Open file | PDF valid and readable | | | |
| R-042 | Video Streaming | P1 | Video lesson | 1. Play video<br>2. Seek to middle<br>3. Play again | Smooth playback | | | |

### 10.6 Error Handling

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| R-050 | 404 Page | P1 | None | 1. Navigate to non-existent URL | Friendly 404 page displayed | | | |
| R-051 | API Error Toast | P1 | None | 1. Trigger API error (e.g., bad input)<br>2. Observe notification | Error toast with message | | | |
| R-052 | Network Offline | P2 | None | 1. Disconnect network<br>2. Try action<br>3. Reconnect | Graceful handling, recovery | | | |

### 10.7 Mobile Responsiveness

| ID | Feature | Priority | Preconditions | Steps | Expected Result | Status | Tester | Findings |
|----|---------|----------|---------------|-------|-----------------|--------|--------|----------|
| R-060 | Mobile Navigation | P0 | Mobile device | 1. Open site on mobile<br>2. Use hamburger menu<br>3. Navigate pages | Menu works, pages readable | | | |
| R-061 | Mobile Forms | P1 | Mobile device | 1. Fill out form on mobile<br>2. Submit | Form submits correctly | | | |
| R-062 | Mobile Touch Targets | P1 | Mobile device | 1. Tap buttons and links<br>2. Check hit areas | All targets easily tappable | | | |
| R-063 | PWA Install Prompt | P2 | Mobile Chrome | 1. Visit site<br>2. Check for install prompt<br>3. Accept/decline | Prompt appears, functions | | | |

---

## 11. Findings Summary Template

Use this section to summarize overall test findings.

### Test Execution Summary

| Date | Tester | Environment | Total Tests | Passed | Failed | Blocked | Not Run |
|------|--------|-------------|-------------|--------|--------|---------|---------|
| | | | | | | | |
| | | | | | | | |
| | | | | | | | |

### Critical Issues Found

| Issue # | Test ID | Severity | Description | Steps to Reproduce | Screenshot/Evidence |
|---------|---------|----------|-------------|-------------------|---------------------|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |

### Severity Definitions
| Severity | Definition |
|----------|------------|
| Critical | Application unusable, data loss, security issue |
| High | Major feature broken, no workaround |
| Medium | Feature broken but has workaround |
| Low | Minor issue, cosmetic problem |

### Blocked Tests

| Test ID | Reason Blocked | Dependency | Expected Resolution |
|---------|----------------|------------|---------------------|
| | | | |
| | | | |

### General Observations

**What worked well:**
1. 
2. 
3. 

**Areas needing improvement:**
1. 
2. 
3. 

**Recommendations:**
1. 
2. 
3. 

### Sign-off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| QA Lead | | | |
| Product Owner | | | |
| Development Lead | | | |

---

## 12. Glossary of Terms

| Term | Definition |
|------|------------|
| **LP Credits** | LearnPlay Credits (LPC) - Virtual currency used for AI content generation and premium features |
| **XP** | Experience Points - Points earned by completing activities that contribute to leveling |
| **Battle Cards** | Gamified learning through card-based gameplay |
| **Season Pass** | Time-limited progression system with tiered rewards |
| **Power-Up** | Temporary boost item (e.g., XP Boost) that enhances gameplay |
| **Cosmetic** | Visual customization item for avatars or cards |
| **Org Admin** | Organization Administrator - Manages users, billing, and settings for an organization |
| **SuperAdmin** | Platform Administrator - Has full access to all platform features and all organizations |
| **Impersonation** | SuperAdmin ability to temporarily view the platform as another user |
| **YOCO** | Payment gateway used for processing payments |
| **Gamma** | Third-party service for document-to-lesson conversion |
| **White-label** | Customizable branding allowing organizations to use their own logos and colors |
| **Feature Flag** | Configuration setting that enables/disables features without code changes |
| **Demo Organization** | Organization with full access without requiring payment |
| **Join Code** | Temporary code allowing users to join an organization |
| **Seat** | License allocation for one user in an organization |
| **Invoice** | Billing document for payment |
| **Payout** | Payment from platform to content creators/sellers |
| **CSS Token** | Customizable style variable (e.g., `--primary` for primary color) |
| **Hard Refresh** | Browser refresh that clears cache (Ctrl+Shift+R) |
| **Toast** | Brief notification message that appears on screen |
| **WCAG** | Web Content Accessibility Guidelines - Standards for accessible design |

---

## Appendix A: Test Data Requirements

### Required Test Data

| Data Type | Quantity | Notes |
|-----------|----------|-------|
| Test Users (Learner) | 5 | Various progress states |
| Test Users (Teacher) | 3 | With different content |
| Test Users (Org Admin) | 2 | Different org types |
| Test Organizations | 3 | School, Business, Demo |
| Test Courses | 10 | Mix of free/paid, published/draft |
| Test Quizzes | 15 | Various question types |
| Test Payments | 5 | Mix of successful/failed |

### Test Data Reset Procedure
1. Contact QA Lead for test data refresh
2. Use "Reset Test Data" function (if available)
3. Or manually reset via admin panel

---

## Appendix B: Browser Console Error Guide

### Common Errors to Watch For

| Error Pattern | Likely Cause | Action |
|---------------|--------------|--------|
| `401 Unauthorized` | Session expired | Log in again |
| `403 Forbidden` | Permission issue | Check role access |
| `404 Not Found` | Missing resource | Report in findings |
| `500 Internal Server Error` | Backend issue | Report immediately |
| `CORS error` | Configuration issue | Report to dev team |
| `Network Error` | Connection issue | Check internet, retry |

### How to Check Console
1. Press F12 to open Developer Tools
2. Click "Console" tab
3. Look for red error messages
4. Copy error text for bug reports

---

**End of Document**

*Document maintained by QA Team. For questions or updates, contact qa@learnplay.co.za*
