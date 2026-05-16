# Course Availability Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cluttered course editor pricing, visibility, publishing, and assignment controls with a guided availability wizard that works across cloud and onprem.

**Architecture:** Keep existing data contracts: `courses` stores visibility/pricing/category, and `courseAssignments` stores org/user/scope/cross-org delivery. Implement a focused client-side wizard in `CourseEdit.tsx` that saves course availability, creates assignments through `/api/course-assignments`, and then publishes through `/api/courses/:id/publish`.

**Tech Stack:** React, TanStack Query, Wouter, existing LearnPlay UI primitives, Express/Drizzle APIs, Jest, TypeScript.

---

### Task 1: Add Wizard Contract Tests

**Files:**
- Create: `client/src/tests/courseAvailabilityWizardContract.test.ts`

- [ ] **Step 1: Write the failing test**

Create a source contract test that checks `CourseEdit.tsx` exposes a `CourseAvailabilityWizard`, has the new primary `Set Availability & Assign` entry point, uses existing APIs, and no longer renders the old inline `Course Assignment Settings` panel.

- [ ] **Step 2: Run the test to verify it fails**

Run: `source "$HOME/.nvm/nvm.sh" && nvm use 20 >/dev/null && npm test -- client/src/tests/courseAvailabilityWizardContract.test.ts`

Expected: FAIL because the wizard and cleaned settings page do not exist yet.

### Task 2: Implement Course Availability Wizard

**Files:**
- Modify: `client/src/pages/CourseEdit.tsx`

- [ ] **Step 1: Add local wizard state and helpers**

Add wizard step state for `audience`, `pricing`, `targets`, and `review`; helper functions for availability summary, assignment payload generation, and readiness messages.

- [ ] **Step 2: Add wizard mutation**

Create one mutation that saves course visibility/pricing/category, creates the selected assignment target if needed, publishes when requested, and invalidates course/assignment caches.

- [ ] **Step 3: Render wizard panel**

Render a compact in-page dialog/card with steps for Audience, Pricing, Targets, and Review. Include own org, public marketplace, showcase, and onprem partner org options. Use existing tokenized UI primitives and do not introduce a new style system.

- [ ] **Step 4: Clean the settings page**

Remove the inline paid/public/assignment controls from the main settings card. Replace them with a summary card and a primary `Set Availability & Assign` action.

### Task 3: Verify And Deploy

**Files:**
- No source modifications unless validation finds a defect.

- [ ] **Step 1: Run focused tests**

Run the new contract test and `server/tests/courseAssignmentService.test.ts`.

- [ ] **Step 2: Run typecheck and schema checks**

Run TypeScript validation and schema/migration contract checks available in `package.json`.

- [ ] **Step 3: Commit and push before deployment**

Commit source changes and push the branch before devtools deployment.

- [ ] **Step 4: Deploy to DEV variants with devtools**

Run `bash scripts/dev-workspace/wsl-devadmin.sh update-dev cloud` and `bash scripts/dev-workspace/wsl-devadmin.sh update-dev onprem`.

- [ ] **Step 5: Verify runtime parity**

Check both health endpoints, migration/schema contract commands for cloud/onprem, and local app status for both variants.

## Self-Review

- Spec coverage: wizard covers visibility, free/paid pricing, showcase, own-org assignment, onprem cross-org assignment, and publish flow.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: all named files and APIs already exist, except the new contract test.
