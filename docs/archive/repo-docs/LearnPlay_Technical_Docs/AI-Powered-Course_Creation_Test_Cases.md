# AI-Powered Course Creation — Test Cases Document

**Document Version:** 1.0  
**Date:** February 6, 2026  
**Module Under Test:** AI-Powered Course Creation (LESSON 1)  
**Methodology:** STLC-Aligned (Software Testing Life Cycle)  
**Requirements Source:** LESSON 1 — AI-Powered Course Creation (10 Slides)  
**Technical Reference:** [`TECHNICAL_AUDIT.md`](./TECHNICAL_AUDIT.md) — Phase 1 Technical Stocktake  
**Author:** QA Engineering Team  

---

## Table of Contents

1. [Document Purpose & Scope](#1-document-purpose--scope)
2. [Test Environment & Prerequisites](#2-test-environment--prerequisites)
3. [Phase 1: Technical Stocktake — Feature-to-Code Mapping](#3-phase-1-technical-stocktake--feature-to-code-mapping)
   - 3.1 [Slide 1 — Title / Overview](#31-slide-1--title--overview)
   - 3.2 [Slide 2 — Traditional Creation (Context)](#32-slide-2--traditional-creation-context)
   - 3.3 [Slide 3 — LearnPlay AI Advantage](#33-slide-3--learnplay-ai-advantage)
   - 3.4 [Slide 4 — Document-to-Course Pipeline](#34-slide-4--document-to-course-pipeline)
   - 3.5 [Slide 5 — Zero Hallucination Guarantee](#35-slide-5--zero-hallucination-guarantee)
   - 3.6 [Slide 6 — AI Quiz Generation](#36-slide-6--ai-quiz-generation)
   - 3.7 [Slide 7 — AI Content Coach](#37-slide-7--ai-content-coach)
   - 3.8 [Slide 8 — Lesson Framework Wizard](#38-slide-8--lesson-framework-wizard)
   - 3.9 [Slide 9 — Manual Creation Option](#39-slide-9--manual-creation-option)
   - 3.10 [Slide 10 — End-to-End Workflow](#310-slide-10--end-to-end-workflow)
4. [Phase 2: Master Test Documentation](#4-phase-2-master-test-documentation)
   - 4.1 [Document-to-Course Pipeline Tests (Slide 4)](#41-document-to-course-pipeline-tests-slide-4)
   - 4.2 [Zero Hallucination Guarantee Tests (Slide 5)](#42-zero-hallucination-guarantee-tests-slide-5)
   - 4.3 [AI Quiz Generation Tests (Slide 6)](#43-ai-quiz-generation-tests-slide-6)
   - 4.4 [AI Content Coach Tests (Slide 7)](#44-ai-content-coach-tests-slide-7)
   - 4.5 [Framework Wizard Tests (Slide 8)](#45-framework-wizard-tests-slide-8)
   - 4.6 [Manual Creation Option Tests (Slide 9)](#46-manual-creation-option-tests-slide-9)
   - 4.7 [End-to-End Workflow Tests (Slide 10)](#47-end-to-end-workflow-tests-slide-10)
5. [Traceability Matrix](#5-traceability-matrix)
6. [Glossary](#6-glossary)

---

## 1. Document Purpose & Scope

This document provides a comprehensive, tester-friendly test case suite for the **AI-Powered Course Creation** module of the LearnPlay e-learning platform. It is derived from the functional requirements outlined in "LESSON 1: AI-Powered Course Creation" (10 slides) and mapped directly to the verified codebase implementation as documented in [`TECHNICAL_AUDIT.md`](./TECHNICAL_AUDIT.md).

**In Scope:**
- Document-to-Course Pipeline (upload, extraction, generation, presentation creation)
- Zero Hallucination Guarantee (source primacy, validation, scoring)
- AI Quiz Generation (all question types, regeneration)
- AI Content Coach (7-dimension rubric, suggestions, Bloom's Taxonomy)
- Lesson Framework Wizard (step-by-step wizard, objectives, topics)
- Manual Creation Option (PPTX upload, video, versioning, export)
- End-to-End Workflow (8-step complete flow)

**Out of Scope:**
- Gamification, marketplace, payments, card trading, user management
- Infrastructure and deployment testing
- Performance and load testing (separate document)

---

## 2. Test Environment & Prerequisites

### 2.1 Required User Roles

| Role | Purpose | Access Level |
|------|---------|-------------|
| **SuperAdmin** | AI configuration management, platform-wide access | All features |
| **OrgAdmin** | Organization-level course creation and management | Organization-scoped |
| **Teacher / Instructor** | Course and lesson creation, quiz generation | Organization-scoped |
| **Student / Learner** | Course consumption, quiz participation | Read-only course access |

### 2.2 Pre-requisites for All Tests

1. Active user session (logged in with appropriate role)
2. User belongs to an active organization
3. Organization has sufficient LP Credits for AI operations
4. AI configuration is active (at least one Gemini model configured under AI Settings)
5. Gamma API integration is configured (for PPTX generation tests)

### 2.3 Test Data Requirements

| Item | Description |
|------|-------------|
| Word Document (.docx) | A 5–20 page document with headings, subheadings, and structured content |
| PowerPoint File (.pptx) | An existing presentation with 5–15 slides |
| Large Document (.docx) | A 50+ page document for boundary testing |
| Empty Document (.docx) | A blank or near-blank document for negative testing |
| Video File (.mp4/.webm) | A short video walkthrough (under 100MB) |

---

## 3. Phase 1: Technical Stocktake — Feature-to-Code Mapping

This section maps each requirement slide to the actual codebase implementation, linking feature descriptions to database tables, API endpoints, backend services, and frontend components.

---

### 3.1 Slide 1 — Title / Overview

**Requirement:** AI-Powered Course Creation overview — AI transforms course development from weeks to minutes.

**Assessment:** This is a title slide providing context. No discrete testable features.

| Requirement | Implementation Status |
|-------------|----------------------|
| AI transforms course development | Implemented across the full pipeline (Slides 4–10) |

---

### 3.2 Slide 2 — Traditional Creation (Context)

**Requirement:** Context slide describing traditional course creation challenges.

**Assessment:** No testable features. Contextual background only.

---

### 3.3 Slide 3 — LearnPlay AI Advantage

**Requirement:** AI-assisted content generation — expert-to-course-creator transformation, intelligent content transformation, consistent quality at scale, dramatic time reduction.

**Assessment:** High-level value proposition. Testable through the features in Slides 4–10.

| Requirement Claim | Validated By |
|--------------------|-------------|
| Expert-to-course-creator transformation | Document-to-Course Pipeline (Slide 4) |
| Intelligent content transformation | AI content extraction + framework generation (Slide 4) |
| Consistent quality at scale | AI Content Coach 7-dimension rubric (Slide 7) |
| Dramatic time reduction | End-to-End Workflow automation (Slide 10) |

---

### 3.4 Slide 4 — Document-to-Course Pipeline

**Requirement:** 5-step pipeline — Upload → AI Extraction → Lesson Generation → Presentation Creation → Review & Refine

| Requirement | DB Tables | API Endpoints | Backend Services | Frontend Components |
|-------------|-----------|---------------|-----------------|---------------------|
| 1. Upload source materials (Word/PPTX) | `courseDraftDocuments` (fileName, storageKey, extractionStatus, extractedContent) | `POST /api/course-drafts/:draftId/documents` | `documentExtractor.ts` (DOCX via mammoth), `pptxExtractor.ts` (PPTX extraction) | `CourseDocumentWizard.tsx` (upload step), `ObjectUploader.tsx` |
| 2. AI content extraction | `courseDraftDocuments.extractedContent` (JSONB), `courseDraftDocuments.extractionStatus` (pending → completed) | `GET /api/course-drafts/:draftId/documents/:docId/content` | `documentExtractionWorker.ts` (async worker), `documentExtractor.ts` | `CourseDocumentWizard.tsx` (extraction progress display) |
| 3. Automatic lesson generation | `courseDraftFrameworks.topics` (JSONB array of topics), `courseDrafts` | `POST /api/course-drafts/:draftId/analyze-topics`, `POST /api/course-drafts/:draftId/generate` | `courseFrameworkAIService.ts`, `courseTopicAIService.ts` | `CourseDocumentWizard.tsx` (framework review step) |
| 4. Presentation creation (Gamma API) | `lessons` (gammaCardId, storageKey), `lessonPresentationVersions`, `pendingGammaJobs` (status: pending/claimed/polling/completed/failed) | `POST /api/lessons/:lessonId/orchestrate` | `gammaService.ts`, `jobQueueService.ts`, `jobQueueWorker.ts`, `lessonOrchestrationService.ts` | `LessonWizard.tsx`, `PresentationConfigurationSection.tsx`, `ThemeGalleryPanel.tsx`, `ImageStyleSelector.tsx` |
| 5. Review and refine | `lessons` (title, inputText, learningAssetContract), `lessonSlides`, `lessonContentVersions` | `PATCH /api/courses/:id`, `GET /api/lessons/:lessonId/extracted-content` | `lessonVersioningService.ts` | `LessonViewer.tsx`, `CourseEdit.tsx`, `LessonVersionHistory.tsx`, `LessonContentDiffModal.tsx` |

---

### 3.5 Slide 5 — Zero Hallucination Guarantee

**Requirement:** Source document primacy, validation against source, source citation tracking, content health scoring, human review integration.

| Requirement | DB Tables | API Endpoints | Backend Services | Frontend Components |
|-------------|-----------|---------------|-----------------|---------------------|
| Source document primacy | `lessons.extractedContent`, `courseDraftDocuments.extractedContent` | `GET /api/lessons/:lessonId/source-document`, `GET /api/lessons/:lessonId/extracted-content` | `aiService.ts` (`ZERO_HALLUCINATION_CONSTRAINTS`, `buildAntiHallucinationPrompt`) | `LearningAssetChainPanel.tsx` |
| Validation against source | `lessons.sourceMap` (JSONB) | Invoked internally during AI generation | `aiService.ts` (`validateAgainstSource` function), `courseFrameworkAIService.ts` | `LearningAssetChainPanel.tsx` |
| Source citation tracking | `lessons.sourceMap`, `courseFrameworks.sourceMap`, `courseDraftFrameworks.sourceMap` | `GET /api/courses/:id/framework` | `courseFrameworkAIService.ts` | `LearningAssetChainPanel.tsx` |
| Content health scoring | `lessons.contentScore10` (decimal 0.0–10.0), `lessons.feedbackReport` (JSONB), `courseLessons.contentHealth`, `courseFrameworks.contentHealth` | `POST /api/course-drafts/:draftId/advisor` | `contentCoachService.ts`, `contentHealthService.ts` | `ContentCoachPanel.tsx` |
| Human review integration | `lessons.isPublished`, `courses.status` (draft → active) | `POST /api/lessons/:lessonId/publish`, `POST /api/courses/:id/publish`, `GET /api/courses/:id/validate-publish` | `courseService.ts`, `lessonService.ts` | `LessonViewer.tsx`, `CourseEdit.tsx` |

---

### 3.6 Slide 6 — AI Quiz Generation

**Requirement:** Intelligent question generation, multiple formats (multiple-choice, true-false, match, fill-in-blank), correct answer identification, difficulty calibration, linked to learning objectives, rapid iteration.

| Requirement | DB Tables | API Endpoints | Backend Services | Frontend Components |
|-------------|-----------|---------------|-----------------|---------------------|
| Question generation from content | `quizQuestions` (questionType, question, answers, correctAnswerIndex) | `POST /api/ai/generate-quiz` | `aiService.ts` (quiz generation via Gemini), `lessonOrchestrationService.ts` | `QuizWizard.tsx` |
| Multiple-choice format | `quizQuestions.questionType` = "multiple-choice", `quizQuestions.answers` (JSONB array), `quizQuestions.correctAnswerIndex` (1-based integer) | `POST /api/ai/generate-quiz` | `aiService.ts` | `QuizWizard.tsx` |
| True-false format | `quizQuestions.questionType` = "true-false" | `POST /api/ai/generate-quiz` | `aiService.ts` | `QuizWizard.tsx` |
| Match format | `quizQuestions.questionType` = "match" | `POST /api/ai/generate-quiz` | `aiService.ts` | `QuizWizard.tsx` |
| Fill-in-blank format | `quizQuestions.questionType` = "fill-blank" | `POST /api/ai/generate-quiz` | `aiService.ts` | `QuizWizard.tsx` |
| Correct answer identification | `quizQuestions.correctAnswerIndex` (1-based in DB), AI returns `correctIndex` (0-based) — converted on save | `POST /api/ai/generate-quiz` | `aiService.ts` | `QuizWizard.tsx` |
| Difficulty calibration | `quizQuestions.difficulty` (varchar: easy/medium/hard), quiz metadata `difficulty` field | `POST /api/ai/generate-quiz`, `POST /api/ai/generate-quiz-metadata` | `aiService.ts` | `QuizWizard.tsx` |
| Linked to learning objectives | `courseLessons.learningObjectives` (text array with Bloom's levels), `lessonQuizLinks` table | `POST /api/courses/:courseId/lessons/:lessonId` | `quizCourseLinkerService.ts` | `CourseLessons.tsx` |
| Regenerate question | `quizQuestions` (updated row) | `POST /api/ai/regenerate-question` | `aiService.ts` | `QuizWizard.tsx` |
| Regenerate answers | `quizQuestions.answers` (updated JSONB) | `POST /api/ai/regenerate-answers` | `aiService.ts` | `QuizWizard.tsx` |

---

### 3.7 Slide 7 — AI Content Coach

**Requirement:** 7-dimensional quality rubric, actionable improvement suggestions, Bloom's Taxonomy integration, learning objectives alignment, continuous quality improvement.

| Requirement | DB Tables | API Endpoints | Backend Services | Frontend Components |
|-------------|-----------|---------------|-----------------|---------------------|
| 7-dimensional quality rubric | `lessons.feedbackReport` (JSONB — stores full `ContentCoachFeedback` object) | `POST /api/course-drafts/:draftId/advisor` | `contentCoachService.ts` (structure, depth, bloomAlignment, terminology, examples, engagement, audienceFit — each 0–100) | `ContentCoachPanel.tsx` |
| Improvement suggestions | `lessons.feedbackReport.allSuggestions` (array of `ImprovementSuggestion`), priority: critical/important/nice-to-have | `POST /api/course-drafts/:draftId/advisor` | `contentCoachService.ts` (prioritized suggestions with effort estimates) | `ContentCoachPanel.tsx` |
| Bloom's Taxonomy integration | `lessons.feedbackReport.bloomLevelsCovered`, `lessons.feedbackReport.missingBloomLevels` | `POST /api/course-drafts/:draftId/advisor` | `contentCoachService.ts` (Bloom's level analysis) | `ContentCoachPanel.tsx` (Bloom's Taxonomy Coverage section) |
| Learning objectives alignment | `courseLessons.learningObjectives` (array with `bloomLevel` and `objective`), `learningObjectiveSchema` (id, bloomLevel, objective, assessmentIdea) | `POST /api/course-drafts/:draftId/lessons/:lessonIndex/objectives` | `courseFrameworkAIService.ts` | `CourseDocumentWizard.tsx`, `CourseLessons.tsx` |
| Continuous re-evaluation | `lessons.feedbackReport` (re-generated with new contentHash), in-memory cache with 30-minute TTL | `POST /api/course-drafts/:draftId/advisor` (called again after edits) | `contentCoachService.ts` (cache with content hash validation) | `ContentCoachPanel.tsx` (refresh button) |

---

### 3.8 Slide 8 — Lesson Framework Wizard

**Requirement:** Structured course design, learning objectives first approach, Bloom's Taxonomy guidance, logical content sequencing, assessment integration prompts, learner-facing objectives display with Bloom's badges.

| Requirement | DB Tables | API Endpoints | Backend Services | Frontend Components |
|-------------|-----------|---------------|-----------------|---------------------|
| Step-by-step wizard | `courseDrafts`, `courseDraftFrameworks`, `courseDraftDocuments` | `POST /api/course-drafts/`, `POST /api/course-drafts/:draftId/generate` | `courseFrameworkAIService.ts` | `CourseDocumentWizard.tsx` (multi-step wizard with progress), `CourseFrameworkWizard.tsx` |
| Learning objectives generation | `courseLessons.learningObjectives` (text array), schema: `learningObjectiveSchema` (id, bloomLevel, objective, assessmentIdea) | `POST /api/course-drafts/:draftId/lessons/:lessonIndex/objectives` | `courseFrameworkAIService.ts` | `CourseDocumentWizard.tsx` |
| Bloom's Taxonomy guidance | `learningObjectiveSchema.bloomLevel` (remember/understand/apply/analyze/evaluate/create) | `POST /api/course-drafts/:draftId/lessons/:lessonIndex/objectives` | `courseFrameworkAIService.ts` | `CourseDocumentWizard.tsx`, `CourseLessons.tsx` (Bloom's badges) |
| Logical content sequencing | `courseDraftFrameworks.topics` (JSONB — ordered array with `order` field), `courseTopicSchema.prerequisiteTopicIds` | `POST /api/course-drafts/:draftId/analyze-topics` | `courseTopicAIService.ts`, `courseFrameworkAIService.ts` | `CourseDocumentWizard.tsx` (drag-and-drop topic reordering) |
| Assessment integration prompts | `courseTopicSchema.assessmentIdeas` (array of strings), `learningObjectiveSchema.assessmentIdea` | `POST /api/course-drafts/:draftId/generate` | `courseFrameworkAIService.ts` | `CourseDocumentWizard.tsx` |
| Learner-facing Bloom's badges | `courseLessons.learningObjectives` displayed with badge UI | `GET /api/courses/:id` (includes course lessons with objectives) | N/A (frontend rendering) | `CourseLessons.tsx` (Badge component with Bloom's level labels) |

---

### 3.9 Slide 9 — Manual Creation Option

**Requirement:** AI-Assisted vs Manual Creation modes, direct PPTX upload, video content support, presentation version control, hybrid approaches, no lock-in (download/export).

| Requirement | DB Tables | API Endpoints | Backend Services | Frontend Components |
|-------------|-----------|---------------|-----------------|---------------------|
| AI-Assisted vs Manual mode | `lessons.generationMode` ("gemini-topics" / "text-input" / "document-upload" / "manual-upload") | `POST /api/lessons` (AI modes), `POST /api/lessons/manual-upload` (manual mode) | `lessonService.ts` | `CourseDocumentWizard.tsx` (Tabs: "AI-Assisted" / "Manual Creation") |
| Direct PPTX upload | `lessons` (storageKey, generationMode = "manual-upload"), `lessonPresentationVersions` | `POST /api/lessons/manual-upload`, `POST /api/lessons/:lessonId/upload-pptx` | `pptxExtractor.ts`, `lessonService.ts` | `CourseDocumentWizard.tsx` (Manual tab), `CourseBuilderUpload.tsx`, `ObjectUploader.tsx` |
| Video content upload | `lessons.videoStorageKey` | `POST /api/lessons/:lessonId/upload-video` | `lessonService.ts` (video storage) | `VideoPlayer.tsx`, `LessonViewer.tsx` |
| Presentation version control | `lessonPresentationVersions` (lessonId, version, gammaCardId, storageKey, isGenerated, isCompressed) | `GET /api/lessons/:lessonId/presentation-versions`, `GET /api/lessons/:lessonId/presentation-versions/:versionId/download` | `lessonVersioningService.ts` (auto-increment, 2-version restore pattern) | `LessonVersionHistory.tsx`, `LessonContentDiffModal.tsx` |
| Download/export (no lock-in) | `lessons.storageKey`, `lessonPresentationVersions.storageKey` | `GET /api/lessons/:lessonId/download`, `GET /api/lessons/:lessonId/download-video` | `lessonService.ts` | `LessonViewer.tsx` (download buttons) |

---

### 3.10 Slide 10 — End-to-End Workflow

**Requirement:** 8-step workflow — Document upload → AI content analysis → Lesson structure generation → Presentation creation → Quiz generation → AI Content Coach review → Creator review & approval → Course activation.

| Workflow Step | DB Tables | API Endpoints | Backend Services | Frontend Components |
|---------------|-----------|---------------|-----------------|---------------------|
| 1. Document upload | `courseDraftDocuments` | `POST /api/course-drafts/:draftId/documents` | `documentExtractor.ts` | `CourseDocumentWizard.tsx` |
| 2. AI content analysis | `courseDraftDocuments.extractedContent`, `extractionStatus` | `GET /api/course-drafts/:draftId/documents/:docId/content` | `documentExtractionWorker.ts`, `documentExtractor.ts` | `CourseDocumentWizard.tsx` |
| 3. Lesson structure generation | `courseDraftFrameworks.topics` | `POST /api/course-drafts/:draftId/analyze-topics`, `POST /api/course-drafts/:draftId/generate` | `courseFrameworkAIService.ts`, `courseTopicAIService.ts` | `CourseDocumentWizard.tsx` |
| 4. Presentation creation | `lessons`, `pendingGammaJobs`, `lessonPresentationVersions` | `POST /api/lessons/:lessonId/orchestrate` | `gammaService.ts`, `jobQueueService.ts`, `jobQueueWorker.ts` | `LessonWizard.tsx` |
| 5. Quiz generation | `quizQuestions` | `POST /api/ai/generate-quiz` | `aiService.ts` | `QuizWizard.tsx` |
| 6. AI Content Coach review | `lessons.feedbackReport`, `lessons.contentScore10` | `POST /api/course-drafts/:draftId/advisor` | `contentCoachService.ts` | `ContentCoachPanel.tsx` |
| 7. Creator review & approval | `lessons.isPublished` | `POST /api/lessons/:lessonId/publish` | `lessonService.ts` | `LessonViewer.tsx` |
| 8. Course activation | `courses.status` (draft → active) | `PATCH /api/courses/:id/status`, `POST /api/courses/:id/publish` | `courseService.ts` | `CourseEdit.tsx` |

---

## 4. Phase 2: Master Test Documentation

This section contains detailed test cases organized by requirement slide. Each test case includes granular, non-technical steps suitable for a human tester, along with expected UI outcomes and expected database states.

---

### 4.1 Document-to-Course Pipeline Tests (Slide 4)

---

#### TC-DCP-001: Upload Word Document as Source Material

**Feature:** Upload a Word document (.docx) as the primary source material for AI-powered course creation.

**Intended Use / Business Case:** Subject matter experts upload their existing Word documents (training manuals, guides, textbooks) so the AI can transform them into structured courses — eliminating the need for instructional design expertise.

**Pre-conditions:**
- User is logged in as Teacher, OrgAdmin, or SuperAdmin
- User belongs to an active organization with sufficient LP Credits
- A Word document (.docx) of 5–20 pages with headings is prepared

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Course Builder section from the main navigation menu. |
| 2 | Click the "AI-Assisted Course Creation" or equivalent option to start the Course Document Wizard. |
| 3 | In the wizard, locate the file upload area (drag-and-drop zone or browse button). |
| 4 | Select a prepared Word document (.docx) file from your computer (or drag it into the upload zone). |
| 5 | Observe the upload progress indicator — it should show the file name, file size, and a progress bar. |
| 6 | Wait for the upload to complete. A success message or green checkmark should appear next to the file name. |
| 7 | Confirm the uploaded file appears in the list of uploaded documents with its file name and status displayed. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | File appears in the uploaded documents list with a success indicator. File name and size are displayed. The wizard allows proceeding to the next step (content extraction). |
| **Database** | A new row is created in `courseDraftDocuments` with: `fileName` = uploaded file name, `storageKey` = non-null (object storage reference), `extractionStatus` = "pending" (initially), `draftId` = the current draft ID. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-DCP-002: Upload Existing PPTX as Source Material

**Feature:** Upload an existing PowerPoint (.pptx) file as source material for course creation.

**Intended Use / Business Case:** Instructors who already have presentation materials can upload them directly, allowing the AI to extract content and build a structured course around existing slides.

**Pre-conditions:**
- User is logged in as Teacher, OrgAdmin, or SuperAdmin
- A PowerPoint file (.pptx) with 5–15 slides is prepared
- User is within the Course Document Wizard flow

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Course Document Wizard (Course Builder → AI-Assisted Course Creation). |
| 2 | In the file upload area, select a PowerPoint (.pptx) file from your computer. |
| 3 | Observe that the system accepts the .pptx file format without error. |
| 4 | Wait for the upload to complete successfully. |
| 5 | Verify the file appears in the document list with the correct file name and a success indicator. |
| 6 | Note: The system should indicate it will extract content from the PPTX slides (text, headings, structure). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The PPTX file is listed among uploaded documents. The wizard allows progression. The supported format tooltip confirms PPTX is accepted. |
| **Database** | A new row in `courseDraftDocuments` with the uploaded PPTX file reference. `storageKey` is populated. `extractionStatus` = "pending". |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-DCP-003: AI Content Extraction from Uploaded Document

**Feature:** The system automatically extracts text content, identifies concepts, detects document structure (headings, sections), and identifies relationships from the uploaded source material.

**Intended Use / Business Case:** After document upload, the AI processes the raw content to identify logical sections, key concepts, and hierarchical structure — forming the foundation for automatic lesson generation.

**Pre-conditions:**
- A Word or PPTX document has been successfully uploaded (TC-DCP-001 or TC-DCP-002 passed)
- The document has recognizable headings and structured content
- Document extraction worker is running

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | After uploading a document in the Course Document Wizard, observe the extraction status indicator. |
| 2 | The system should show an "Extracting content..." or similar progress message with a loading spinner. |
| 3 | Wait for extraction to complete (typically 10–30 seconds depending on document size). |
| 4 | Once complete, the status should change to "Extraction Complete" or show a green success indicator. |
| 5 | Click on the extracted content preview (if available) to review what the AI identified. |
| 6 | Verify the extracted content includes: the document's main text, identified section headings, and word count. |
| 7 | Confirm the section headings detected by the AI match the actual headings in the original document. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Extraction status transitions from "pending" → "extracting" → "completed". Extracted content preview shows recognizable text from the uploaded document. Section headings are listed. Word count is displayed. |
| **Database** | `courseDraftDocuments.extractionStatus` changes from "pending" to "completed". `courseDraftDocuments.extractedContent` (JSONB) is populated with: `text` (full extracted text), `wordCount` (positive integer), `sections` (array of detected sections with heading, content, wordCount). For DOCX: `fileType` = "docx". |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-DCP-004: Automatic Lesson Structure Generation

**Feature:** The AI analyzes extracted content and automatically generates a logical lesson structure with topics organized in a meaningful sequence.

**Intended Use / Business Case:** After content extraction, the AI determines how to break the source material into discrete lessons/topics, each covering a coherent set of concepts — providing a draft course structure that the creator can review and customize.

**Pre-conditions:**
- Document extraction is complete (TC-DCP-003 passed)
- Organization has sufficient LP Credits for AI topic analysis
- AI configuration is active

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | In the Course Document Wizard, after extraction completes, proceed to the "Generate Framework" or "Analyze Topics" step. |
| 2 | If prompted for credit confirmation, review the credit cost displayed and confirm. |
| 3 | Click the "Analyze Topics" or "Generate Framework" button. |
| 4 | Observe the AI processing indicator (loading spinner, progress message). |
| 5 | Wait for the AI to generate the lesson structure (typically 15–60 seconds). |
| 6 | Review the generated topic list. Each topic should have: a title/name, a description, and a logical order number. |
| 7 | Verify that the topics cover the main subjects from the original document. |
| 8 | Confirm you can reorder topics using drag-and-drop or arrow buttons. |
| 9 | Confirm you can edit topic names and descriptions by clicking on them. |
| 10 | Confirm there is an option to add or remove topics manually. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | A list of generated topics/lessons is displayed, each with a name, description, and order number. Topics align with the document's content areas. Drag-and-drop reordering is functional. Edit, add, and delete controls are available for each topic. |
| **Database** | `courseDraftFrameworks` is created/updated with: `topics` (JSONB array of topic objects with id, order, name, description, lessonId). `sourceMap` may be populated with content provenance data. Credits are deducted from the user's or organization's wallet (check `creditTransactions` or `creditUsageLogs`). |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-DCP-005: PPTX Presentation Creation via Gamma API

**Feature:** The system generates a professional PowerPoint presentation for each lesson using the Gamma API, based on the lesson's content and selected theme/style.

**Intended Use / Business Case:** Once lesson content is finalized, the system automatically creates polished PPTX slides with professional design, eliminating the need for manual slide creation and design skills.

**Pre-conditions:**
- A lesson has been created with content (text input, AI-generated, or extracted from document)
- Gamma API integration is configured and operational
- A Gamma theme has been selected (or default theme is available)
- Organization has sufficient LP Credits for presentation generation

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Lesson Wizard for an existing lesson with content, or create a new lesson. |
| 2 | In the Presentation Configuration section, select a theme from the Theme Gallery. |
| 3 | Optionally select an image style from the Image Style selector. |
| 4 | Click the "Generate Presentation" or "Create PPTX" button. |
| 5 | If prompted for credit confirmation, review the cost and confirm. |
| 6 | Observe the generation progress: the system should show a status such as "Creating presentation…" or a progress bar. |
| 7 | Wait for the Gamma API to complete the generation (this may take 30 seconds to 2 minutes). |
| 8 | Once complete, verify the PPTX is available for preview within the Lesson Viewer. |
| 9 | Verify a "Download" button is available to download the generated PPTX file. |
| 10 | Click "Download" and open the downloaded PPTX file to confirm it contains the lesson content with professional formatting. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Generation progress is visible. Upon completion, the PPTX is embedded/previewed in the Lesson Viewer. A download button is available. The presentation contains slides matching the lesson content with the selected theme applied. |
| **Database** | `lessons.gammaCardId` is populated (Gamma's card identifier). `lessons.storageKey` is populated (object storage reference for the PPTX). A new row in `lessonPresentationVersions` with: `version` = 1 (or incremented), `gammaCardId` matching, `storageKey` populated, `isGenerated` = true. The `pendingGammaJobs` row (if created) has `status` = "completed". LP Credits are deducted. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-DCP-006: Review and Refine Generated Content

**Feature:** After AI generates course content and lessons, the creator can review, edit, and refine all generated materials before publishing.

**Intended Use / Business Case:** AI-generated content serves as a high-quality starting point. Creators maintain full control to review accuracy, adjust wording, reorganize structure, and ensure content meets their standards before making it available to learners.

**Pre-conditions:**
- AI has generated a course framework with topics and at least one lesson with content
- User is on the Course Edit or Lesson Viewer page

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Course Edit page for a course with AI-generated content. |
| 2 | Review the list of lessons/topics. Click on a lesson to view its content. |
| 3 | In the Lesson Viewer, review the extracted or generated content displayed. |
| 4 | Click "Edit" or similar control to modify the lesson title. Change it and save. |
| 5 | Review the slide content. If editable, modify the text of a slide bullet point and save. |
| 6 | Navigate to the Version History panel (if available) and confirm a new version was created after your edit. |
| 7 | Navigate back to the course view and confirm the updated lesson title is reflected. |
| 8 | Verify you can rearrange lesson order within the course. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | All generated content is editable. Changes save successfully with visual confirmation (toast notification or inline success indicator). Version history reflects the edit. Updated content is immediately visible across the course view. |
| **Database** | `lessons.title` (or other edited field) is updated. A new row in `lessonVersions` captures the pre-edit state (snapshot). `lessonVersions.versionNumber` is incremented. If slides were edited, `lessonSlides` and/or `lessonContentVersions` are updated. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

### 4.2 Zero Hallucination Guarantee Tests (Slide 5)

---

#### TC-ZH-001: Source Document Primacy (AI Uses Only Uploaded Content)

**Feature:** When generating course content from an uploaded document, the AI is constrained to use only the text and information present in the source document — it does not introduce external facts, statistics, or claims.

**Intended Use / Business Case:** Organizations need assurance that AI-generated training materials accurately reflect their proprietary source documents (policies, procedures, regulations) without the AI inventing or adding content that wasn't in the original material.

**Pre-conditions:**
- A Word document with specific, verifiable facts has been uploaded and extracted
- AI has generated a course framework and lesson content from this document
- The source document contains unique/specific facts that are easy to cross-reference

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Prepare a Word document containing specific, verifiable facts (e.g., "The company was founded in 1987" or "Policy XYZ requires annual reviews"). |
| 2 | Upload the document via the Course Document Wizard and wait for extraction to complete. |
| 3 | Generate a course framework using the AI (Analyze Topics → Generate Framework). |
| 4 | Review each generated topic/lesson description carefully. |
| 5 | For each topic, verify that the description text references ONLY information present in the original document. |
| 6 | Check for any facts, dates, statistics, or claims in the generated content that do NOT appear in the source document. |
| 7 | Open the Learning Asset Chain Panel (if available on the lesson view) to review source traceability. |
| 8 | Document any AI-generated content that appears to be fabricated or not traceable to the source document. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | All AI-generated lesson descriptions and content reference ONLY information from the source document. The Learning Asset Chain Panel (if present) shows source provenance. No fabricated facts, external statistics, or hallucinated claims appear in the generated content. |
| **Database** | `lessons.sourceMap` (JSONB) is populated with source citation data linking generated content back to specific sections of the source document. AI prompts in the backend include `ZERO_HALLUCINATION_CONSTRAINTS`. `validateAgainstSource` function is invoked during generation (verified via logs or monitoring). |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ZH-002: Validation Against Source (sourceMap Tracking)

**Feature:** The system tracks source citations via a `sourceMap` field, linking each piece of generated content back to the specific section of the source document it was derived from.

**Intended Use / Business Case:** Provides an audit trail proving that all AI-generated content is derived from the original source material. This is critical for compliance-sensitive training (financial services, healthcare, legal).

**Pre-conditions:**
- A course has been generated from an uploaded document using the Document-to-Course Pipeline
- The course framework has been successfully generated

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to a course that was generated from an uploaded document. |
| 2 | Open a lesson within the course and locate the Learning Asset Chain Panel or Source Traceability section. |
| 3 | Review the source mapping information displayed. It should show which parts of the original document correspond to the lesson content. |
| 4 | If source section references are clickable, click on one to verify it points to the correct section in the original document. |
| 5 | Check whether the source map covers all major content areas of the lesson. |
| 6 | Navigate to the course framework view and check if framework-level sourceMap data is available. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The Learning Asset Chain Panel displays source provenance data. Each lesson or topic shows which source document section(s) contributed to its content. Source references are accurate when cross-checked with the original document. |
| **Database** | `lessons.sourceMap` (JSONB) contains structured mapping data linking generated content to source sections. `courseFrameworks.sourceMap` and/or `courseDraftFrameworks.sourceMap` are populated for framework-level traceability. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ZH-003: Content Health Scoring Display

**Feature:** Each lesson receives a content quality score (0.0–10.0) and content health assessment, displayed to the creator to indicate how well the content meets quality standards.

**Intended Use / Business Case:** Provides creators with an objective quality metric so they can prioritize which lessons need improvement before publishing. Helps maintain consistent quality across all courses.

**Pre-conditions:**
- A lesson exists with generated or manually entered content
- The Content Coach has been invoked at least once for the lesson (or content health has been calculated)

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to a lesson that has content (either AI-generated or manually created). |
| 2 | Open the Content Coach Panel (look for a "Content Coach" or quality assessment button/tab). |
| 3 | If no score is displayed yet, click "Evaluate" or "Get Feedback" to trigger an AI quality assessment. |
| 4 | Wait for the assessment to complete. |
| 5 | Verify that an overall quality score is displayed (this should be a number, grade, or visual indicator). |
| 6 | Check that the score is within the expected range (0.0 to 10.0 for contentScore10, or 0–100 for the rubric, or letter grade A–F). |
| 7 | Navigate to the Course Lessons list and check if content health indicators appear next to each lesson. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The Content Coach Panel displays: an overall score (0–100 scale or letter grade A–F), a quality grade badge, and individual dimension scores. The course lessons list may show content health indicators (color-coded or badge) next to each lesson. |
| **Database** | `lessons.contentScore10` is populated with a decimal value between 0.0 and 10.0. `lessons.feedbackReport` (JSONB) contains the full feedback object including `overallScore`, `qualityGrade`, and `rubric` data. `courseLessons.contentHealth` (JSONB) may contain health assessment data at the course-lesson level. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-ZH-004: Human Review Integration Workflow

**Feature:** AI-generated content goes through a human review and approval workflow before being made available to learners. Content remains in "draft" status until explicitly published by a creator.

**Intended Use / Business Case:** Ensures that no AI-generated content reaches learners without a human creator reviewing and approving it. This is a critical quality gate, especially for compliance and regulatory training.

**Pre-conditions:**
- A course with AI-generated lessons exists in "draft" status
- User has Teacher/OrgAdmin/SuperAdmin role

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to a course in "draft" status that contains AI-generated lessons. |
| 2 | Verify the course status indicator shows "Draft" prominently. |
| 3 | Review all lessons within the course. Verify each lesson can be opened and its content reviewed. |
| 4 | Attempt to access the course from a student/learner account. Verify the draft course is NOT visible or accessible to students. |
| 5 | Return to the creator account. Click "Validate for Publishing" or equivalent pre-publish check. |
| 6 | Review any validation warnings or requirements (e.g., "All lessons must have content", "At least one lesson required"). |
| 7 | After addressing any issues, click "Publish Course" or "Activate Course". |
| 8 | Confirm the course status changes from "Draft" to "Active". |
| 9 | Verify the course is now accessible to students/learners. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Draft courses are not visible to learners. A "Validate" step highlights any incomplete requirements. After publishing, the status changes to "Active" with visual confirmation. Students can now access the course. |
| **Database** | Before publish: `courses.status` = "draft", `lessons.isPublished` = false. After publish: `courses.status` = "active", relevant `lessons.isPublished` = true. The `GET /api/courses/:id/validate-publish` endpoint returns validation results before the status transition is allowed. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

### 4.3 AI Quiz Generation Tests (Slide 6)

---

#### TC-QUIZ-001: Generate Quiz Questions from Lesson Content

**Feature:** The AI generates quiz questions based on the lesson's content (slides, text, learning objectives), creating a complete quiz automatically.

**Intended Use / Business Case:** After creating lesson content, instructors can instantly generate assessment questions without manually writing them. The AI analyzes the lesson material and creates relevant, pedagogically sound questions.

**Pre-conditions:**
- A lesson exists with content (slides, text, or learning asset contract)
- User is logged in as Teacher/OrgAdmin/SuperAdmin
- AI configuration is active
- Organization has sufficient LP Credits

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Quiz Wizard page (accessible from course management or lesson view). |
| 2 | Select the lesson you want to generate quiz questions from. |
| 3 | Configure quiz parameters if prompted (number of questions, difficulty level, question type distribution). |
| 4 | Click "Generate Quiz" or "Generate Questions". |
| 5 | If prompted for credit confirmation, review the cost and confirm. |
| 6 | Observe the generation progress indicator. |
| 7 | Wait for quiz generation to complete (typically 15–45 seconds). |
| 8 | Review the generated questions. Each question should have: question text, answer options (for applicable types), and a marked correct answer. |
| 9 | Verify the questions are relevant to the lesson content (not generic or unrelated). |
| 10 | Confirm the total number of generated questions matches the requested amount (or is reasonable). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | A list of generated quiz questions is displayed. Each question shows: question text, answer options (where applicable), correct answer indicator, and question type label. The questions are directly relevant to the lesson content. |
| **Database** | New rows in `quizQuestions` table with: `questionType` set to one of the supported types, `question` text populated, `answers` (JSONB array) populated for multiple-choice/true-false, `correctAnswerIndex` (1-based integer) set for applicable types, `difficulty` set if calibration was configured. LP Credits are deducted from wallet. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-QUIZ-002: Multiple Choice Question Generation

**Feature:** The AI generates multiple-choice questions with 3–5 answer options and one correct answer clearly identified.

**Intended Use / Business Case:** Multiple-choice is the most common assessment format. The AI creates well-formed questions with plausible distractors (wrong answers) and a single correct answer.

**Pre-conditions:**
- Quiz generation has been triggered for a lesson with content
- Question type distribution includes multiple-choice questions

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Generate a quiz (as per TC-QUIZ-001) ensuring multiple-choice questions are included. |
| 2 | Identify the multiple-choice questions in the generated quiz. |
| 3 | For each multiple-choice question, verify: (a) the question text is clear and grammatically correct, (b) there are 3–5 answer options listed, (c) exactly one answer is marked as correct (highlighted, checked, or indicated). |
| 4 | Verify the correct answer is factually accurate based on the lesson content. |
| 5 | Verify the incorrect options (distractors) are plausible but clearly wrong when compared to the lesson material. |
| 6 | Check that no two answer options are identical or nearly identical. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Multiple-choice questions display with: a question stem, 3–5 labeled answer options (A, B, C, D…), one answer visually marked as correct. The question type label shows "Multiple Choice". |
| **Database** | `quizQuestions.questionType` = "multiple-choice". `quizQuestions.answers` is a JSONB array with 3–5 string entries. `quizQuestions.correctAnswerIndex` is a 1-based integer pointing to the correct answer in the array (e.g., 1 for the first answer, 2 for the second). |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-QUIZ-003: True/False Question Generation

**Feature:** The AI generates true/false questions based on factual statements from the lesson content.

**Intended Use / Business Case:** True/false questions test comprehension of key facts and concepts. They are quick to answer and effective for knowledge checks.

**Pre-conditions:**
- Quiz generation includes true-false type questions
- Lesson has factual content suitable for true/false statements

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Generate a quiz ensuring true-false questions are included in the type distribution. |
| 2 | Locate the true/false questions in the generated quiz output. |
| 3 | For each true/false question, verify: (a) the statement is clear and unambiguous, (b) two answer options are presented: "True" and "False", (c) the correct answer is marked. |
| 4 | Cross-reference the statement with the lesson content to verify the correct answer is accurate. |
| 5 | Ensure the question type is labeled as "True/False". |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | True/false questions display a declarative statement with exactly two options: "True" and "False". One is marked as correct. The question type label shows "True/False". |
| **Database** | `quizQuestions.questionType` = "true-false". `quizQuestions.answers` contains exactly 2 entries (True, False). `quizQuestions.correctAnswerIndex` is 1 or 2. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-QUIZ-004: Match (Left-to-Right) Question Generation

**Feature:** The AI generates matching questions where learners must pair items from two columns (e.g., terms with definitions, concepts with examples).

**Intended Use / Business Case:** Matching questions assess the ability to associate related concepts, making them effective for vocabulary, definitions, and category-based assessment.

**Pre-conditions:**
- Quiz generation includes "match" type questions
- Lesson content contains pairable concepts (terms and definitions, causes and effects, etc.)

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Generate a quiz ensuring match-type questions are included in the distribution. |
| 2 | Locate the match questions in the generated quiz output. |
| 3 | For each match question, verify: (a) there is a set of items on the "left" side (terms, concepts), (b) there is a corresponding set of items on the "right" side (definitions, examples), (c) the correct pairings are identified. |
| 4 | Verify all pairings are factually correct based on the lesson content. |
| 5 | Confirm the question type is labeled as "Match". |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Match questions display two columns of items with correct pairings indicated. The question type is labeled "Match". Items are relevant to the lesson content. |
| **Database** | `quizQuestions.questionType` = "match". The question data includes match pairs (stored in the JSONB structure, typically as `matchPairs` or within the answers array). |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-QUIZ-005: Fill-in-Blank Question Generation

**Feature:** The AI generates fill-in-the-blank questions where a key term or concept is removed from a sentence, and the learner must supply the missing word or phrase.

**Intended Use / Business Case:** Fill-in-the-blank questions test recall of specific terminology, key concepts, and important details — requiring active recall rather than recognition.

**Pre-conditions:**
- Quiz generation includes "fill-blank" type questions
- Lesson content contains specific terminology or key phrases

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Generate a quiz ensuring fill-in-blank questions are included in the distribution. |
| 2 | Locate the fill-in-blank questions in the generated quiz output. |
| 3 | For each fill-in-blank question, verify: (a) a sentence is displayed with a blank (indicated by an underline, box, or placeholder), (b) the correct answer (missing word/phrase) is identified, (c) the sentence with the correct answer filled in is factually accurate. |
| 4 | Verify the blank is for a meaningful term (not trivial words like "the" or "and"). |
| 5 | Confirm the question type is labeled as "Fill in the Blank". |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Fill-in-blank questions show a sentence with a visible blank/placeholder. The correct answer is indicated (for the quiz creator view). The question type label shows "Fill in the Blank". |
| **Database** | `quizQuestions.questionType` = "fill-blank". The correct answer is stored (typically in `correctAnswer` field within the JSONB structure or in the answers array). |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-QUIZ-006: Correct Answer Auto-Identification

**Feature:** For every generated question, the AI automatically identifies and marks the correct answer. The system converts from the AI's 0-based index to the database's 1-based index transparently.

**Intended Use / Business Case:** Eliminates manual correct-answer selection. Instructors can trust that the AI has identified the right answer, though they should review for accuracy.

**Pre-conditions:**
- Quiz questions have been generated (TC-QUIZ-001 passed)

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Review each generated quiz question. |
| 2 | For every multiple-choice question, verify that exactly one answer is marked as "correct" (visually highlighted or indicated). |
| 3 | For every true/false question, verify that either "True" or "False" is marked as correct. |
| 4 | For fill-in-blank questions, verify the correct answer text is provided. |
| 5 | For match questions, verify all pairings are established. |
| 6 | Cross-check at least 3 correct answers against the lesson content to confirm accuracy. |
| 7 | Verify that the correct answer indicator is clearly visible in the quiz creator/editor view (not just stored internally). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Every question has a clearly marked correct answer. No questions are left without a correct answer designation. The correct answer is visually distinguishable from wrong answers. |
| **Database** | For multiple-choice and true-false: `quizQuestions.correctAnswerIndex` is a positive integer (1-based). The index correctly corresponds to the right answer in the `answers` array. Internally, the AI returns `correctIndex` (0-based) which is converted to `correctAnswerIndex` (1-based) on save. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-QUIZ-007: Quiz Linked to Learning Objectives

**Feature:** Generated quiz questions are linked to the lesson's learning objectives, ensuring assessment aligns with stated learning goals.

**Intended Use / Business Case:** Instructional design best practices require assessments to measure achievement of stated learning objectives. This linkage ensures quizzes test what was intended to be taught.

**Pre-conditions:**
- A course lesson has learning objectives defined (either AI-generated or manually entered)
- A quiz has been generated for the lesson
- The lesson is linked to a course

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Course Lessons view for a course with defined learning objectives. |
| 2 | Locate a lesson that has both learning objectives and a linked quiz. |
| 3 | View the learning objectives displayed for the lesson. |
| 4 | Open the quiz associated with the lesson. |
| 5 | Verify the quiz questions relate to the stated learning objectives. |
| 6 | Check if the quiz or lesson view shows a visual link between quiz and objectives (e.g., the quiz is shown in the lesson card, or a "Primary Quiz" indicator). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Learning objectives are displayed on the Course Lessons page. The quiz associated with the lesson is indicated (e.g., "Primary Quiz" label). Quiz questions test knowledge related to the stated objectives. |
| **Database** | `courseLessons.learningObjectives` (text array) contains the lesson's objectives with Bloom's levels. `courseLessons.primaryQuizId` links to the quiz. `lessonQuizLinks` table connects the lesson and quiz. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-QUIZ-008: Regenerate Specific Question

**Feature:** Instructors can regenerate a single quiz question while keeping all other questions unchanged. The AI creates a new question covering similar content.

**Intended Use / Business Case:** If a specific question is poorly worded, too easy/hard, or inaccurate, the instructor can replace just that question without regenerating the entire quiz.

**Pre-conditions:**
- A quiz with multiple questions exists
- User is in the quiz editing view

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Open an existing quiz in the Quiz Wizard or quiz editor. |
| 2 | Locate a specific question you want to regenerate. |
| 3 | Note the original question text and its position in the quiz. |
| 4 | Click the "Regenerate" or refresh icon button associated with that specific question. |
| 5 | Wait for the AI to generate a replacement question (typically 5–15 seconds). |
| 6 | Verify the regenerated question is different from the original. |
| 7 | Verify the regenerated question is still relevant to the lesson content. |
| 8 | Verify all other questions in the quiz remain unchanged. |
| 9 | Confirm the regenerated question has a correct answer marked. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Only the targeted question is replaced. The new question text differs from the original. The new question maintains the same type (or appropriate type). All other questions remain exactly as they were. A success notification appears. |
| **Database** | The `quizQuestions` row for the regenerated question is updated with new `question` text, new `answers`, and updated `correctAnswerIndex`. All other `quizQuestions` rows for the quiz remain unchanged. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-QUIZ-009: Regenerate Answer Options

**Feature:** Instructors can regenerate just the answer options for a specific question while keeping the question text the same.

**Intended Use / Business Case:** If the answer choices are too obvious, not well-differentiated, or contain errors, the instructor can get new answer options without changing the question itself.

**Pre-conditions:**
- A quiz with multiple-choice questions exists
- User is in the quiz editing view

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Open an existing quiz in the Quiz Wizard or quiz editor. |
| 2 | Locate a multiple-choice question with answer options you want to regenerate. |
| 3 | Note the original question text and the original answer options. |
| 4 | Click the "Regenerate Answers" button for that specific question. |
| 5 | Wait for the AI to generate new answer options. |
| 6 | Verify the question text remains exactly the same as before. |
| 7 | Verify the answer options have changed (at least the distractors). |
| 8 | Verify a correct answer is still marked among the new options. |
| 9 | Verify the correct answer is still factually accurate. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The question text is unchanged. The answer options are different from the original set. One answer is marked as correct. The answer options are plausible and well-differentiated. |
| **Database** | `quizQuestions.question` (text) remains unchanged. `quizQuestions.answers` (JSONB array) is updated with new answer options. `quizQuestions.correctAnswerIndex` is updated to point to the correct answer in the new set. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

### 4.4 AI Content Coach Tests (Slide 7)

---

#### TC-CC-001: 7-Dimensional Quality Rubric Scoring

**Feature:** The AI Content Coach evaluates lesson content across 7 quality dimensions: Structure, Depth, Bloom's Alignment, Terminology, Examples, Engagement, and Audience Fit — each scored from 0 to 100.

**Intended Use / Business Case:** Provides creators with a multi-faceted, objective assessment of their lesson content quality, identifying specific areas of strength and weakness rather than just a single overall grade.

**Pre-conditions:**
- A lesson with substantial content exists (at least several paragraphs or multiple slides)
- User is on the Lesson Viewer or Content Coach Panel
- AI configuration is active

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to a lesson that has content (AI-generated or manual). |
| 2 | Open the Content Coach Panel (look for "Content Coach", "Quality Assessment", or a sparkle/wand icon). |
| 3 | Click "Evaluate", "Get Feedback", or "Analyze Content" to trigger the AI assessment. |
| 4 | Wait for the analysis to complete (typically 15–30 seconds). |
| 5 | Verify an overall quality score is displayed (letter grade: A, B, C, D, or F, and/or a numeric score). |
| 6 | Locate the 7 individual dimension scores. Verify ALL seven are present: Structure, Depth, Bloom's Alignment, Terminology, Examples, Engagement, Audience Fit. |
| 7 | For each dimension, verify: (a) a numeric score is shown (0–100 range), (b) a brief feedback description explains the score, (c) improvement suggestions are listed (if the score is not perfect). |
| 8 | Verify the scores visually make sense (e.g., a well-structured lesson should score higher on "Structure" than a disorganized one). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The Content Coach Panel displays: (1) an overall quality grade (A–F) and/or numeric score, (2) seven individual dimension cards/rows each showing the dimension name, score (0–100), feedback text, and suggestions. Progress bars or visual indicators represent each score. Scores with room for improvement include specific suggestions. |
| **Database** | `lessons.feedbackReport` (JSONB) is populated with the `ContentCoachFeedback` object containing: `overallScore` (0–100), `qualityGrade` (A/B/C/D/F), `rubric` object with 7 keys (structure, depth, bloomAlignment, terminology, examples, engagement, audienceFit), each containing `name`, `score` (0–100), `feedback` (string), and `suggestions` (string array). `lessons.contentScore10` is updated (0.0–10.0 scale). |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-CC-002: Improvement Suggestions Display

**Feature:** The Content Coach provides prioritized, actionable improvement suggestions with effort estimates and impact scores, organized by priority (critical, important, nice-to-have).

**Intended Use / Business Case:** Tells creators exactly what to improve and where to focus their effort for maximum quality impact, transforming abstract quality scores into concrete action items.

**Pre-conditions:**
- Content Coach evaluation has been completed for a lesson (TC-CC-001 passed)
- The lesson content has areas for improvement (not a perfect score)

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | After receiving Content Coach feedback, locate the improvement suggestions section in the panel. |
| 2 | Verify "Top Improvements" or "Priority Suggestions" are shown prominently (typically the top 3). |
| 3 | For each suggestion, verify the following are displayed: (a) a title describing the improvement, (b) a priority level (critical, important, or nice-to-have), (c) a description explaining what to improve and why, (d) an estimated effort indicator (quick, medium, or significant), (e) an impact score (1–10). |
| 4 | Verify critical-priority suggestions appear first or are visually highlighted (e.g., red or warning color). |
| 5 | If an "All Suggestions" expandable section exists, expand it to verify additional suggestions beyond the top 3. |
| 6 | Verify each suggestion is related to one of the 7 rubric dimensions (the category should be indicated). |
| 7 | Check if any suggestion includes a concrete example of what "better" content would look like. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Top 3 improvements are prominently displayed with priority badges (color-coded: critical = red/orange, important = yellow, nice-to-have = blue/gray). Each suggestion shows title, description, priority, effort estimate, and impact score. An expandable section reveals all suggestions. Category labels link suggestions to rubric dimensions. |
| **Database** | `lessons.feedbackReport.topImprovements` contains an array of the top 3 `ImprovementSuggestion` objects. `lessons.feedbackReport.allSuggestions` contains the complete list. Each suggestion has: `id` (UUID), `priority` (critical/important/nice-to-have), `category` (rubric dimension key), `title`, `description`, `estimatedEffort` (quick/medium/significant), `impactScore` (1–10), optional `example`. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-CC-003: Bloom's Taxonomy Integration

**Feature:** The Content Coach evaluates which Bloom's Taxonomy cognitive levels are covered by the lesson content and identifies which levels are missing, helping creators ensure comprehensive cognitive engagement.

**Intended Use / Business Case:** Bloom's Taxonomy (Remember, Understand, Apply, Analyze, Evaluate, Create) ensures lessons engage learners at multiple cognitive levels. The Content Coach identifies gaps so creators can add activities at missing levels.

**Pre-conditions:**
- Content Coach evaluation has been completed (TC-CC-001 passed)
- The lesson has content that can be mapped to Bloom's levels

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | After receiving Content Coach feedback, locate the "Bloom's Taxonomy Coverage" section in the Content Coach Panel. |
| 2 | Verify a list of covered Bloom's levels is displayed (e.g., Remember, Understand, Apply — shown with green/positive badges). |
| 3 | Verify a list of missing Bloom's levels is displayed (e.g., Analyze, Evaluate, Create — shown with yellow/warning badges). |
| 4 | Verify the Bloom's Alignment dimension score (one of the 7 rubric dimensions) reflects the coverage. |
| 5 | If the lesson covers many Bloom's levels, the bloomAlignment score should be higher. If few are covered, it should be lower. |
| 6 | Verify the Bloom's labels use standard taxonomy terminology (Remember, Understand, Apply, Analyze, Evaluate, Create). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | A "Bloom's Taxonomy Coverage" section shows two groups: covered levels (positive/green badges) and missing levels (warning/amber badges). The bloomAlignment rubric dimension score correlates with the coverage. Standard Bloom's level names are used. |
| **Database** | `lessons.feedbackReport.bloomLevelsCovered` is an array of strings listing the covered Bloom's levels. `lessons.feedbackReport.missingBloomLevels` is an array of strings listing the missing levels. `lessons.feedbackReport.rubric.bloomAlignment.score` (0–100) reflects the alignment. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-CC-004: Re-evaluation After Content Updates

**Feature:** After a creator edits lesson content, they can re-run the Content Coach evaluation to get updated scores reflecting the improvements made.

**Intended Use / Business Case:** Enables an iterative improvement cycle: evaluate → improve → re-evaluate → confirm improvement. This ensures the quality metrics reflect the current state of the content after edits.

**Pre-conditions:**
- A lesson has been evaluated by Content Coach with initial scores (TC-CC-001 passed)
- The initial scores indicate areas for improvement

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Note the current Content Coach scores for a lesson (overall score, individual dimension scores). |
| 2 | Edit the lesson content to address one or more of the improvement suggestions (e.g., add more examples if "Examples" scored low, improve structure if "Structure" scored low). |
| 3 | Save the content changes. |
| 4 | Return to the Content Coach Panel. |
| 5 | Click "Re-evaluate", "Refresh", or the refresh icon button to trigger a new assessment. |
| 6 | Wait for the re-evaluation to complete. |
| 7 | Compare the new scores with the previously noted scores. |
| 8 | Verify that the dimensions you improved show higher scores (or at least acknowledge the changes in feedback text). |
| 9 | Verify the overall score reflects the improvements. |
| 10 | Verify the timestamp or "generated at" indicator shows the new evaluation date/time. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The Content Coach Panel refreshes with new scores. Improved dimensions show higher scores than the initial evaluation. The overall grade may improve. The feedback text reflects the current content (not stale/cached feedback from before the edit). A "last evaluated" timestamp is updated. |
| **Database** | `lessons.feedbackReport` is replaced with the new evaluation data (new `contentHash`, new `generatedAt` timestamp). `lessons.contentScore10` is updated. If caching is in effect, the old cached feedback is invalidated because the content hash changed. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

### 4.5 Framework Wizard Tests (Slide 8)

---

#### TC-FW-001: Step-by-Step Wizard Flow

**Feature:** The Course Document Wizard guides creators through a structured, multi-step process for building a course: uploading documents → reviewing extraction → configuring framework → generating lessons → reviewing the framework.

**Intended Use / Business Case:** A wizard interface simplifies the complex process of course creation into manageable steps, guiding even non-technical users through the entire pipeline with progress indicators and contextual help.

**Pre-conditions:**
- User is logged in as Teacher/OrgAdmin/SuperAdmin
- Organization has LP Credits
- AI configuration is active

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to Course Builder and click "AI-Assisted Course Creation" or "Create Course from Documents". |
| 2 | Verify the wizard opens with a clear step indicator (e.g., numbered steps, progress bar, or breadcrumb). |
| 3 | Verify Step 1 focuses on document upload with clear instructions and supported format information. |
| 4 | Upload a document and proceed to the next step. |
| 5 | Verify each subsequent step is clearly labeled and has contextual instructions. |
| 6 | Verify "Back" and "Next" navigation buttons are present and functional. |
| 7 | Click "Back" to return to a previous step and verify your previous inputs are preserved. |
| 8 | Navigate forward again through the steps. |
| 9 | Verify you cannot skip required steps (e.g., cannot proceed to framework generation without uploading a document). |
| 10 | Complete the wizard to the final step and verify a summary or completion screen is shown. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | A multi-step wizard with clear progress indication (step numbers, labels, or progress bar). Each step has contextual instructions and help text. Navigation (Back/Next) works correctly. Data is preserved when navigating between steps. Required steps cannot be skipped. Final step shows a summary or completion state. |
| **Database** | `courseDrafts` is created at the beginning of the wizard flow. As the user progresses, `courseDraftDocuments` and `courseDraftFrameworks` are populated incrementally. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-FW-002: Learning Objectives Generation

**Feature:** For each lesson/topic in the framework, the AI generates Bloom's Taxonomy-aligned learning objectives with assessment ideas.

**Intended Use / Business Case:** Well-crafted learning objectives ensure each lesson has clear, measurable outcomes. The AI generates objectives at appropriate Bloom's levels (Remember, Understand, Apply, Analyze, Evaluate, Create) with corresponding assessment ideas.

**Pre-conditions:**
- A course draft with a generated framework (topics) exists
- The wizard is at the lesson objectives step
- AI configuration is active and LP Credits are available

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | In the Course Document Wizard or Framework view, navigate to a specific lesson/topic. |
| 2 | Locate the "Generate Learning Objectives" button or section. |
| 3 | Click "Generate Objectives" for a specific lesson/topic. |
| 4 | Wait for the AI to generate learning objectives (typically 10–20 seconds). |
| 5 | Review the generated objectives. For each objective, verify: (a) a clear, measurable learning objective statement is provided, (b) a Bloom's Taxonomy level is assigned (e.g., "Remember", "Analyze", "Create"), (c) an assessment idea is suggested (how to test this objective). |
| 6 | Verify the objectives use action verbs aligned with their Bloom's level (e.g., "Define" for Remember, "Analyze" for Analyze, "Design" for Create). |
| 7 | Verify the objectives are relevant to the lesson topic content. |
| 8 | Check that objectives can be edited or removed if needed. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | A list of 2–5 learning objectives is displayed for the lesson. Each objective shows: objective text, Bloom's level badge/label, and optional assessment idea. Objectives are editable. Bloom's levels use standard taxonomy names. |
| **Database** | `courseLessons.learningObjectives` is populated with an array of learning objective objects matching the `learningObjectiveSchema`: `id` (UUID), `bloomLevel` (one of: remember/understand/apply/analyze/evaluate/create), `objective` (string), `assessmentIdea` (optional string). |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-FW-003: Bloom's Taxonomy Badge Display for Learners

**Feature:** Learning objectives with their associated Bloom's Taxonomy levels are displayed to learners on the course/lesson view, with visual badges indicating the cognitive level.

**Intended Use / Business Case:** Learners can see what cognitive skills each lesson targets, helping them understand what they'll be able to do after completing the lesson (e.g., "You will be able to Analyze financial reports" vs "Remember key terms").

**Pre-conditions:**
- A course with lessons has learning objectives set (with Bloom's levels)
- The course is published/active
- User is viewing as a learner or from the course lessons page

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Course Lessons page for a course with defined learning objectives. |
| 2 | Locate a lesson that has learning objectives assigned. |
| 3 | Verify the learning objectives are visible on the lesson card or lesson detail view. |
| 4 | For each objective, verify a Bloom's Taxonomy badge is displayed (e.g., a colored tag showing "Remember", "Analyze", etc.). |
| 5 | Verify the badge color or style differs by Bloom's level (providing visual differentiation). |
| 6 | If viewing as a student, verify the objectives are presented in learner-friendly language. |
| 7 | Verify that the badge text matches one of the six standard Bloom's levels. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Learning objectives are visible on the Course Lessons page. Each objective displays a Badge component with the Bloom's level name (e.g., "Remember", "Apply", "Evaluate"). Badges are color-coded or visually differentiated by level. Objective text is clear and learner-facing. |
| **Database** | `courseLessons.learningObjectives` contains the objectives with `bloomLevel` values from the enum: remember, understand, apply, analyze, evaluate, create. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-FW-004: Topic Analysis and Sequencing

**Feature:** The AI analyzes the extracted document content and generates a logically sequenced set of topics/lessons, considering prerequisite relationships and content flow.

**Intended Use / Business Case:** Ensures course content is organized in a logical learning progression — foundational concepts come before advanced topics, and prerequisite relationships are respected.

**Pre-conditions:**
- A document has been uploaded and extracted in the Course Document Wizard
- The document contains multiple distinct topics/sections
- AI configuration is active and LP Credits available

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | In the Course Document Wizard, after document extraction, click "Analyze Topics" or "Generate Topic Structure". |
| 2 | If prompted, confirm the credit cost for topic analysis. |
| 3 | Wait for the AI to analyze and generate topics. |
| 4 | Review the generated topic list. Verify topics are numbered in a logical order. |
| 5 | Verify foundational/introductory topics appear before advanced topics. |
| 6 | If an "Overview" topic is generated, verify it appears first in the sequence. |
| 7 | Attempt to reorder topics using drag-and-drop (if available). Verify the order updates. |
| 8 | Verify each topic has a name and description that accurately reflects the document section it covers. |
| 9 | Check if prerequisite indicators are shown (e.g., "Requires: Topic 1" for Topic 3). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Topics are displayed in a numbered, ordered list. The sequence is logically progressive. An overview topic (if applicable) appears first. Reordering is possible. Each topic has a name and description. Prerequisite relationships may be indicated. |
| **Database** | `courseDraftFrameworks.topics` (JSONB) contains an ordered array of topic objects, each with: `id`, `order` (sequential integer), `name`, `description`, `isOverview` (boolean for overview topics), `lessonId` (initially null), `prerequisiteTopicIds` (optional array of topic IDs). |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-FW-005: Framework Generation from Documents

**Feature:** The system generates a complete course framework — including title, description, topic structure, and metadata — from uploaded documents in a single AI-powered operation.

**Intended Use / Business Case:** Transforms raw documents into a fully structured course framework with one click, dramatically reducing the time and expertise needed to design a course curriculum.

**Pre-conditions:**
- One or more documents have been uploaded and extracted in the Course Document Wizard
- AI configuration is active and LP Credits are available
- Topic analysis has been completed (or will be part of framework generation)

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | In the Course Document Wizard, after topics have been analyzed, proceed to "Generate Framework" or "Build Course Framework". |
| 2 | If prompted, confirm the credit cost for framework generation. |
| 3 | Click "Generate" to begin AI framework generation. |
| 4 | Observe the generation progress. |
| 5 | Once complete, review the generated framework. It should include: (a) a course title (auto-suggested), (b) a course description, (c) a structured list of topics/lessons with descriptions, (d) suggested learning objectives per topic. |
| 6 | Verify the course title is relevant to the document content. |
| 7 | Verify the course description summarizes the overall content accurately. |
| 8 | Verify each topic description aligns with the corresponding section of the source document. |
| 9 | Verify you can edit the title, description, and individual topics before finalizing. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | A complete course framework is displayed with title, description, and ordered topics. All fields are editable. The content is relevant to the source documents. Estimated credit cost was shown before generation. |
| **Database** | `courseDraftFrameworks` is populated with: `topics` (JSONB array of complete topic objects), `sourceMap` (content provenance), `contentHealth` (quality assessment). `courseDrafts` is updated with title and description. Credits are deducted from the user/org wallet. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

### 4.6 Manual Creation Option Tests (Slide 9)

---

#### TC-MC-001: Choose AI-Assisted vs Manual Creation Mode

**Feature:** The Course Document Wizard offers two distinct creation modes via tabs: "AI-Assisted" (document upload + AI pipeline) and "Manual Creation" (direct content upload without AI processing).

**Intended Use / Business Case:** Gives creators flexibility — those with raw documents use AI-Assisted mode; those with existing polished presentations use Manual mode. No one is forced into a single workflow.

**Pre-conditions:**
- User is logged in as Teacher/OrgAdmin/SuperAdmin
- User navigates to the course creation interface

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to the Course Builder and initiate course creation. |
| 2 | On the Course Document Wizard page, locate the mode selection interface. |
| 3 | Verify two tabs (or options) are displayed: "AI-Assisted" and "Manual Creation". |
| 4 | Click the "AI-Assisted" tab. Verify the interface shows document upload, AI extraction, and framework generation options. |
| 5 | Click the "Manual Creation" tab. Verify the interface shows direct PPTX upload and manual course setup options. |
| 6 | Switch between tabs multiple times and verify the correct content displays for each mode. |
| 7 | Verify the default selected tab is "AI-Assisted". |
| 8 | In "Manual Creation" mode, verify there is a button to start manual course creation (e.g., "Start Manual Course"). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Two clearly labeled tabs: "AI-Assisted" (with AI/sparkle icon) and "Manual Creation". Each tab shows the appropriate creation interface. Switching between tabs works without page reload. Default is "AI-Assisted". |
| **Database** | When a lesson is created via Manual Creation: `lessons.generationMode` = "manual-upload". When via AI-Assisted: `lessons.generationMode` = "document-upload" or "gemini-topics" or "text-input". |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MC-002: Direct PPTX Upload

**Feature:** Creators can upload an existing PPTX presentation directly as a lesson, bypassing the AI generation pipeline entirely.

**Intended Use / Business Case:** Instructors who already have polished presentations can add them to courses immediately without AI processing. This supports hybrid approaches where some lessons are AI-generated and others are manually uploaded.

**Pre-conditions:**
- User is in Manual Creation mode or the direct upload interface
- A prepared PPTX file is available

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to Manual Creation mode in the Course Document Wizard, or use the "Upload PPTX" option in the Lesson Wizard. |
| 2 | Click the upload area or "Browse" button to select a PPTX file. |
| 3 | Select a PPTX file from your computer. |
| 4 | Observe the upload progress indicator. |
| 5 | Wait for the upload to complete. A success notification should appear. |
| 6 | Verify the uploaded presentation is available for preview in the Lesson Viewer. |
| 7 | Verify the lesson is created with the correct generation mode ("manual-upload"). |
| 8 | Open the Lesson Viewer and confirm the slides are displayed correctly. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The PPTX file uploads successfully with a progress indicator. After upload, the presentation is viewable in the Lesson Viewer (embedded viewer or slide thumbnails). The lesson appears in the lesson list with a "Manual Upload" indicator. |
| **Database** | A new row in `lessons` with: `generationMode` = "manual-upload", `storageKey` = non-null (object storage reference to the PPTX file). A row in `lessonPresentationVersions` with `version` = 1, `storageKey` populated, `isGenerated` = false (since it was manually uploaded, not AI-generated). |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MC-003: Video Content Upload

**Feature:** Creators can upload a video walkthrough for a lesson, adding rich media content alongside or instead of the PPTX presentation.

**Intended Use / Business Case:** Video walkthroughs enhance learning by providing instructor narration, demonstrations, and visual explanations that complement the slide content.

**Pre-conditions:**
- A lesson exists (either AI-generated or manually created)
- A video file (.mp4 or supported format) is prepared
- User is on the Lesson Viewer or editing interface

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to a lesson in the Lesson Viewer or lesson editing interface. |
| 2 | Locate the "Upload Video" or "Add Video Walkthrough" button. |
| 3 | Click the button and select a video file from your computer. |
| 4 | Observe the upload progress indicator (video files are larger and may take longer). |
| 5 | Wait for the upload to complete. A success notification should appear. |
| 6 | Verify the video player appears in the lesson view. |
| 7 | Click play on the video player and confirm the video plays correctly. |
| 8 | Verify a "Download Video" option is available. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Video uploads with a progress indicator. After upload, a video player component (`VideoPlayer.tsx`) is displayed in the lesson view. The video plays correctly. A download button is available for the video. |
| **Database** | `lessons.videoStorageKey` is populated with the object storage reference to the uploaded video file. The video can be retrieved via `GET /api/lessons/:lessonId/download-video`. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MC-004: Presentation Version Control (Multiple Versions)

**Feature:** The system maintains multiple versions of a lesson's presentation (PPTX), allowing creators to upload replacement presentations while preserving previous versions for rollback.

**Intended Use / Business Case:** Instructors can iterate on their presentations without losing previous versions. If a new version has issues, they can download or restore a previous version.

**Pre-conditions:**
- A lesson exists with at least one PPTX presentation (either generated or uploaded)
- User is on the Lesson Viewer or editing interface

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to a lesson that already has a PPTX presentation. |
| 2 | Upload a new/replacement PPTX file for the same lesson (use the "Upload PPTX" or "Replace Presentation" option). |
| 3 | Verify the upload completes successfully and the new presentation is displayed. |
| 4 | Navigate to the "Version History" or "Presentation Versions" panel for the lesson. |
| 5 | Verify at least 2 versions are listed (the original and the new upload). |
| 6 | Each version should show: version number, date created, and download option. |
| 7 | Click "Download" on the previous version (version 1) and verify the original PPTX file downloads correctly. |
| 8 | Click "Download" on the current version (version 2) and verify the new PPTX file downloads correctly. |
| 9 | If a "Restore" option is available, click it for the previous version. Verify the lesson reverts to the older presentation. |
| 10 | If restore was performed, check that a new version was created capturing the state before restore (the system creates 2 versions during restore: pre-restore snapshot + restored state). |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Version History panel shows multiple PPTX versions with version numbers, dates, and download buttons. Each version downloads the correct file. Restore functionality (if present) reverts the lesson to the selected version. The current active version is clearly indicated. |
| **Database** | Multiple rows in `lessonPresentationVersions` for the same `lessonId`, each with an incrementing `version` number. Each row has its own `storageKey` pointing to the correct PPTX file. `isGenerated` flag distinguishes AI-generated (true) from manually uploaded (false) versions. After restore: `lessonVersions` contains additional rows (restore creates a pre-restore snapshot version + restored state version). |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

#### TC-MC-005: Download/Export Presentations (No Lock-in)

**Feature:** Creators can download any lesson's PPTX presentation and video content at any time, ensuring no lock-in to the platform.

**Intended Use / Business Case:** Organizations retain full ownership and portability of their content. They can export their presentations for use outside the platform, in offline training, or to migrate to another system.

**Pre-conditions:**
- A lesson exists with a PPTX presentation and/or video content
- User has appropriate access (Teacher/OrgAdmin/SuperAdmin)

**Test Steps:**

| Step | Action |
|------|--------|
| 1 | Navigate to a lesson that has a PPTX presentation. |
| 2 | Locate the "Download" or "Export" button for the presentation. |
| 3 | Click the download button. |
| 4 | Verify a PPTX file is downloaded to your computer. |
| 5 | Open the downloaded PPTX file in PowerPoint or a compatible application. Verify it opens correctly and contains the lesson content. |
| 6 | If the lesson has a video, locate and click the "Download Video" button. |
| 7 | Verify the video file downloads and plays correctly in a standard media player. |
| 8 | If presentation versions exist, verify you can download specific versions from the Version History. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | Download buttons are clearly visible and accessible. PPTX downloads as a valid PowerPoint file. Video downloads as a valid media file. Downloads are prompt (not excessively delayed). The downloaded files are complete and uncorrupted. |
| **Database** | Downloads are served from `lessons.storageKey` (current PPTX) and `lessons.videoStorageKey` (video) via the `GET /api/lessons/:lessonId/download` and `GET /api/lessons/:lessonId/download-video` endpoints. Specific version downloads use `lessonPresentationVersions.storageKey` via `GET /api/lessons/:lessonId/presentation-versions/:versionId/download`. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

### 4.7 End-to-End Workflow Tests (Slide 10)

---

#### TC-E2E-001: Complete 8-Step Workflow from Document Upload to Course Activation

**Feature:** The complete end-to-end workflow covering all 8 steps: Document upload → AI content analysis → Lesson structure generation → Presentation creation → Quiz generation → AI Content Coach review → Creator review & approval → Course activation.

**Intended Use / Business Case:** Validates the entire AI-powered course creation pipeline works as an integrated workflow — a subject matter expert can go from a raw document to a fully active, assessable course with quality-reviewed content in a single session.

**Pre-conditions:**
- User is logged in as Teacher/OrgAdmin/SuperAdmin
- Organization has sufficient LP Credits for the full pipeline (document extraction + topic analysis + framework generation + PPTX creation + quiz generation + Content Coach)
- AI configuration is active
- Gamma API integration is configured
- A Word document (.docx) with structured content (headings, paragraphs, at least 10 pages) is prepared
- No draft courses exist that could cause confusion (clean starting state)

**Test Steps:**

| Step | Action |
|------|--------|
| **STEP 1: Document Upload** | |
| 1.1 | Navigate to Course Builder → AI-Assisted Course Creation. |
| 1.2 | In the wizard, upload a prepared Word document (.docx). |
| 1.3 | Verify the file appears in the uploaded documents list with a success indicator. |
| **STEP 2: AI Content Analysis** | |
| 2.1 | Wait for the extraction status to transition from "pending" to "completed". |
| 2.2 | Review the extracted content preview. Verify sections, headings, and word count are displayed. |
| 2.3 | Verify the extracted text matches the original document content. |
| **STEP 3: Lesson Structure Generation** | |
| 3.1 | Click "Analyze Topics" or proceed to framework generation. |
| 3.2 | Confirm the credit cost if prompted. |
| 3.3 | Wait for the AI to generate topics. |
| 3.4 | Review the generated topic list. Verify topics are logical and cover the document content. |
| 3.5 | Optionally edit a topic name to verify editability. |
| **STEP 4: Presentation Creation** | |
| 4.1 | For at least one lesson, navigate to the Lesson Wizard and trigger PPTX generation. |
| 4.2 | Select a theme from the Theme Gallery. |
| 4.3 | Click "Generate Presentation" and confirm credits. |
| 4.4 | Wait for the Gamma API to complete generation. |
| 4.5 | Verify the PPTX is available in the Lesson Viewer. |
| **STEP 5: Quiz Generation** | |
| 5.1 | Navigate to the Quiz Wizard for the lesson. |
| 5.2 | Configure quiz parameters (e.g., 10 questions, mixed types). |
| 5.3 | Click "Generate Quiz" and confirm credits if prompted. |
| 5.4 | Wait for quiz generation. |
| 5.5 | Review generated questions. Verify multiple question types are present. |
| 5.6 | Verify all questions have correct answers marked. |
| **STEP 6: AI Content Coach Review** | |
| 6.1 | Open the Content Coach Panel for the lesson. |
| 6.2 | Click "Evaluate" to trigger quality assessment. |
| 6.3 | Wait for evaluation to complete. |
| 6.4 | Review the 7-dimension quality rubric scores. |
| 6.5 | Note any improvement suggestions. |
| **STEP 7: Creator Review & Approval** | |
| 7.1 | Review the lesson content in the Lesson Viewer. |
| 7.2 | Make any desired edits based on Content Coach feedback. |
| 7.3 | Publish the lesson (click "Publish Lesson" or equivalent). |
| 7.4 | Repeat for all lessons in the course. |
| **STEP 8: Course Activation** | |
| 8.1 | Navigate to the Course Edit page. |
| 8.2 | Click "Validate for Publishing" to check readiness. |
| 8.3 | Address any validation warnings. |
| 8.4 | Click "Publish Course" or "Activate Course". |
| 8.5 | Verify the course status changes to "Active". |
| 8.6 | Log in as a student/learner and verify the course is now accessible and browsable. |
| 8.7 | As the learner, open the course, view a lesson, and take the quiz to verify end-user experience. |

**Expected Successful Outcome:**

| Aspect | Expected Result |
|--------|----------------|
| **UI** | The complete workflow executes without errors across all 8 steps. Each step transitions smoothly to the next. Progress is visible throughout. The final course is accessible to learners with lessons, presentations, quizzes, and learning objectives all functioning correctly. |
| **Database — Step 1** | `courseDraftDocuments` row created with `fileName`, `storageKey`, `extractionStatus` = "pending". |
| **Database — Step 2** | `courseDraftDocuments.extractionStatus` = "completed", `extractedContent` (JSONB) populated with text, sections, wordCount. |
| **Database — Step 3** | `courseDraftFrameworks.topics` (JSONB) populated with ordered array of topic objects. Credits deducted. |
| **Database — Step 4** | `lessons` row with `gammaCardId` and `storageKey` populated. `lessonPresentationVersions` row created. `pendingGammaJobs.status` = "completed". Credits deducted. |
| **Database — Step 5** | `quizQuestions` rows created with various `questionType` values. `correctAnswerIndex` set for each. Credits deducted. |
| **Database — Step 6** | `lessons.feedbackReport` (JSONB) populated with full `ContentCoachFeedback`. `lessons.contentScore10` set. |
| **Database — Step 7** | `lessons.isPublished` = true for published lessons. `lessonVersions` capture pre-publish state. |
| **Database — Step 8** | `courses.status` = "active". Course is queryable by learners. `courseLessons` rows link all lessons to the course. |

**Testing Result:**

| Status (Pass/Fail) | Actual Outcome | Tester Notes | Timestamp |
|---------------------|----------------|--------------|-----------|
| | | | |

---

## 5. Traceability Matrix

This matrix maps each requirement slide to its corresponding test cases, ensuring complete coverage.

| Requirement Slide | Test Case IDs | Coverage Status |
|-------------------|---------------|-----------------|
| Slide 1 (Title/Overview) | N/A — Context only | N/A |
| Slide 2 (Traditional Creation) | N/A — Context only | N/A |
| Slide 3 (AI Advantage) | Validated through Slides 4–10 tests | Indirect |
| Slide 4 (Document-to-Course Pipeline) | TC-DCP-001, TC-DCP-002, TC-DCP-003, TC-DCP-004, TC-DCP-005, TC-DCP-006 | Full |
| Slide 5 (Zero Hallucination) | TC-ZH-001, TC-ZH-002, TC-ZH-003, TC-ZH-004 | Full |
| Slide 6 (AI Quiz Generation) | TC-QUIZ-001, TC-QUIZ-002, TC-QUIZ-003, TC-QUIZ-004, TC-QUIZ-005, TC-QUIZ-006, TC-QUIZ-007, TC-QUIZ-008, TC-QUIZ-009 | Full |
| Slide 7 (AI Content Coach) | TC-CC-001, TC-CC-002, TC-CC-003, TC-CC-004 | Full |
| Slide 8 (Framework Wizard) | TC-FW-001, TC-FW-002, TC-FW-003, TC-FW-004, TC-FW-005 | Full |
| Slide 9 (Manual Creation) | TC-MC-001, TC-MC-002, TC-MC-003, TC-MC-004, TC-MC-005 | Full |
| Slide 10 (End-to-End Workflow) | TC-E2E-001 | Full |

**Total Test Cases:** 30

---

## 6. Glossary

| Term | Definition |
|------|-----------|
| **Bloom's Taxonomy** | A classification of learning objectives into six cognitive levels: Remember, Understand, Apply, Analyze, Evaluate, Create (from lowest to highest complexity). |
| **Content Coach** | AI-powered quality assessment tool that evaluates lesson content across 7 dimensions and provides improvement suggestions. |
| **contentScore10** | A decimal score (0.0–10.0) stored in the `lessons` table representing overall content quality. |
| **correctAnswerIndex** | 1-based integer in the database indicating which answer option is correct (converted from the AI's 0-based `correctIndex`). |
| **Course Draft** | A preliminary course record created during the wizard flow, before the course is finalized and published. |
| **extractionStatus** | Enum tracking document processing: pending → extracting → completed / failed. |
| **feedbackReport** | JSONB field in the `lessons` table storing the full `ContentCoachFeedback` object from the Content Coach service. |
| **Gamma API** | External API service used to generate professional PPTX presentations from lesson content. |
| **generationMode** | Enum field on lessons indicating how the lesson was created: "gemini-topics", "text-input", "document-upload", or "manual-upload". |
| **LP Credits** | LearnPlay Credits — the platform's internal currency used to pay for AI operations (quiz generation, PPTX creation, etc.). |
| **Learning Asset Contract** | A structured JSON object representing the canonical slide content of a lesson, including positions, titles, key points, and roles. |
| **pendingGammaJobs** | Queue table for asynchronous Gamma API presentation generation jobs, with statuses: pending, claimed, polling, completed, failed. |
| **questionTypeEnum** | Zod enum defining supported quiz question types: "multiple-choice", "true-false", "match", "fill-blank". |
| **sourceMap** | JSONB field tracking the provenance of AI-generated content, linking each piece back to its source in the original document. |
| **STLC** | Software Testing Life Cycle — the systematic process for planning, designing, executing, and evaluating software tests. |
| **validateAgainstSource** | A function in `aiService.ts` that compares AI-generated text against the source document to detect potential hallucinations (content not present in the original). |
| **Zero Hallucination** | The principle that AI-generated course content must be derived exclusively from the source document, with no invented facts, statistics, or claims. |

---

*End of Document*
