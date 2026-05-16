# LearnPlay Full User-Facing Feature Set (Structured Master List)

## 1. AI-Grounded Course Creation and Content Production
1.1. All AI generation workflows are grounded in provided source content (Source DB, uploaded DOCX/PDF/PPTX, selected lesson assets), with strict anti-hallucination safeguards.
1.2. AI-assisted course framework and lesson extraction from uploaded PDF, Word, and PowerPoint files.
1.3. AI-assisted topic analysis and topic structuring from source materials.
1.4. AI-assisted topic description generation and regeneration based on the selected source.
1.5. AI-assisted Bloom taxonomy learning objective creation per lesson.
1.6. AI-assisted lesson description generation from lesson/course context.
1.7. Generate course overview lesson from course content context.
1.8. Generate course key takeaways lesson from course content context.
1.9. Per-lesson slideshow generation (PPTX/Gamma pipeline).
1.10. Support for uploading existing PPTX slides per lesson.
1.11. Support for uploading and managing videos per lesson.
1.12. AI-assisted course thumbnail generation.
1.13. AI-assisted lesson content improvement and fix workflows (with user approval before publish).
1.14. AI-assisted abbreviation fixes and content readability support.
1.15. Per-lesson content health and quality scoring support.
1.16. Strict source-version selection for lesson-linked generation to prevent inter-lesson content contamination.
1.17. Course and lesson publishing validation workflows before release.
1.18. Full draft-to-publish workflow for courses and lessons.

## 2. Lesson Authoring, Source Control, and Version Governance
2.1. Lesson library with dedicated lesson authoring and management flows.
2.2. Dedicated Lesson Content Studio for full-page editing/review.
2.3. Source document ingestion and downloadable source content.
2.4. Version history for lesson source content per change.
2.5. Version restore for lessons and lesson content variants.
2.6. Per-language lesson version tracking.
2.7. Presentation version tracking and downloadable presentation versions.
2.8. Podcast version tracking per lesson and per language.
2.9. Source DB feedback preview, itemized guidance, and selective apply.
2.10. User-controlled apply/reject/ignore flow for AI feedback items.
2.11. Lesson archive, unarchive, publish, and unpublish controls.
2.12. Lesson progress tracking including slide-level progress.

## 3. Podcast and Audio Learning Features
3.1. Per-lesson podcast generation fully grounded in selected lesson source content.
3.2. Podcast wizard with structured multi-step flow.
3.3. Source selection for podcast generation (Source DB, Word content, PPTX transcript content).
3.4. Podcast mode options (bulletin/single voice and conversation/host + guest).
3.5. AI-assisted podcast script generation using configured models.
3.6. Script review and editing before audio generation.
3.7. Async podcast generation with status tracking.
3.8. Podcast cost estimate before generation.
3.9. Podcast draft save/resume/select/delete workflows.
3.10. Active podcast version management per lesson/language.
3.11. Podcast playback endpoint support in lesson/course consumption.
3.12. Podcast script download and podcast audio download support.
3.13. Podcast translation support (script + optional generated target-language audio).

## 4. Quiz Creation, Evaluation, and Question Intelligence
4.1. Generate quizzes per lesson based on lesson content.
4.2. Supported question types include:
4.2.1. Multiple choice.
4.2.2. True or false.
4.2.3. Match left to right.
4.2.4. Fill in the blank.
4.3. AI-assisted question generation and regeneration.
4.4. AI-assisted answer regeneration.
4.5. AI-assisted quiz metadata generation.
4.6. AI explain support for question understanding during quiz experiences.
4.7. Context-aware explanation generation with key-term support.
4.8. Quiz draft management and publish workflows.
4.9. Quiz version status, outdated detection, and refresh support when lesson sources change.
4.10. Quiz collection management and question bank editing.
4.11. Quiz verification workflows for answer/explanation consistency.
4.12. Quiz assignment and quiz availability management.

## 5. Language Translation and Localization
5.1. Translate any lesson into target languages through guided translation workflows.
5.2. Translate course metadata and framework structures.
5.3. Translate lesson Source DB content.
5.4. Translate PowerPoint slide text.
5.5. Translate existing quiz content.
5.6. Translate existing podcast scripts.
5.7. Generate new podcast audio files in target languages.
5.8. Translation preflight to select which assets are included.
5.9. Translation job tracking, status checks, and cancellation support.
5.10. Publish control for translated content (not forced auto-publish).
5.11. Translation readiness and translation completeness checks.
5.12. Per-language version governance across lesson assets.

## 6. Course Assignment, Mandatory Training, and Deadlines
6.1. Assign courses to learners through org hierarchy scopes.
6.2. Assignment scopes include:
6.2.1. Organization-level assignment.
6.2.2. Department-level assignment.
6.2.3. Unit-level assignment.
6.2.4. Team-level assignment.
6.2.5. Individual user assignment.
6.3. Mark assignments as mandatory or optional.
6.4. Set due dates per assignment (or leave open).
6.5. Edit assignment deadlines and mandatory flags after creation.
6.6. Assignment visibility and management for teachers/admins.
6.7. Inter-company course assignment (onprem inter-org model) for cross-company distribution.
6.8. Ownership-scoped inter-org governance to protect data boundaries.

## 7. Multi-Company Platform Structure and Data Isolation
7.1. Multiple company registration and onboarding in one platform runtime.
7.2. Each company can operate as a self-contained organization.
7.3. Strong organization isolation controls.
7.4. Hierarchy management by department, unit, and team.
7.5. User placement and movement across hierarchy structures.
7.6. Role-based permission boundaries across all organizational layers.
7.7. Controlled inter-company sharing/assignment (where enabled and approved).

## 8. Learner Experience and Learning Journey
8.1. Student dashboard with progress and learning activity visibility.
8.2. My Courses experience with assigned and enrolled courses.
8.3. Lesson library browsing and lesson viewer experience.
8.4. Free overview/preview lesson support for public course discovery flows.
8.5. Course purchase/enroll flow support for free and paid paths.
8.6. Course completion tracking.
8.7. Quiz attempt experiences (single-player, 1v1, and assigned contexts).
8.8. Notification center and unread tracking.
8.9. Learner profile and preference management.
8.10. Certificate gallery for completed learning recognition.
8.11. Mobile-friendly web experience with PWA install support.

## 9. Learner Reporting and Performance Analytics
9.1. Organization-level learner reporting dashboards.
9.2. Overview analytics for active learners.
9.3. Top learner tracking.
9.4. Course analysis views.
9.5. Quiz performance analysis.
9.6. At-risk learner identification reports.
9.7. Performance distribution and heatmap analytics.
9.8. Individual learner timelines.
9.9. Unit/team/department-filtered reporting.
9.10. Deadline analysis for overdue and upcoming assignments.
9.11. Deadline reminder email workflows from reporting views.

## 10. Certifications and Achievement Outcomes
10.1. Certificate generation for learning completion workflows.
10.2. Branded certificate presentation support.
10.3. Certificate download and verification support.
10.4. Learner certificate gallery.
10.5. Shareable certificate verification links.
10.6. Course/lesson completion recognition pipelines.

## 11. Gamification and Engagement Systems
11.1. Quiz leaderboard and competitive ranking views.
11.2. Challenges and challenge-claim workflows.
11.3. Coins and transaction history.
11.4. Power-up catalog, purchase, inventory, and activation.
11.5. Cosmetic catalog, purchase, ownership, equip/unequip.
11.6. Season pass purchase, activation, progress, and reward claim.
11.7. Achievement and streak visibility.
11.8. Admin-configurable gamification economy controls.

## 12. Commerce, Marketplace, and Monetization Features
12.1. Course pricing support (free and paid models).
12.2. Public course access with free-preview style discovery patterns.
12.3. Paid course checkout and purchase flows.
12.4. Credit package purchase support.
12.5. Subscription purchase and lifecycle management.
12.6. Invoice and receipt generation/download.
12.7. Course purchase history and financial history views.
12.8. Wallet and credit balance visibility.
12.9. Marketplace and org revenue analytics for business users.

## 13. White-Label and Brand Personalization
13.1. White-label branding per registered company.
13.2. Per-organization brand identity (logo, naming, visual style).
13.3. Theme token customization for UI look-and-feel.
13.4. Platform default branding and organization override model.
13.5. Branded emails and communication identity support where enabled.
13.6. Theme and presentation style management for generated assets.
13.7. Branded experience across learner and admin interfaces.

## 14. Integration and AI Configuration (Admin-Controlled)
14.1. Central integration settings for core providers.
14.2. Encrypted secret management in platform settings (no plaintext exposure).
14.3. Gemini, Gamma, ElevenLabs configuration support.
14.4. MailerSend and SMTP configuration support.
14.5. AI model dropdown/catalog-based configuration.
14.6. Provider connectivity tests from admin UI.
14.7. Integration runtime health and logs.
14.8. System change audit visibility for integration changes.
14.9. Cloud/onprem variant-aware provider exposure.

## 15. Enterprise Administration and Governance
15.1. SuperAdmin and CustSuper governance layers.
15.2. Enterprise customer management (where applicable).
15.3. Enterprise systems and licensing operations.
15.4. Build/document/agreement management for enterprise customers.
15.5. License lifecycle management for onprem systems.
15.6. Cross-environment reporting and telemetry views.
15.7. Platform pricing, package, and override controls.
15.8. Audit and compliance-oriented change tracking.

## 16. Security, Data Integrity, and Operational Trust
16.1. Role-based and entitlement-based access enforcement across all major features.
16.2. Top-role-only impersonation policy controls.
16.3. Organization isolation safeguards for multi-company operation.
16.4. Source-grounded AI generation constraints to prevent content pollution.
16.5. User-controlled approval and publish gates for AI outputs.
16.6. Version history and rollback support for key learning assets.
16.7. Monitoring and health visibility for operational reliability.

## 17. Deployment Variants and Enterprise Flexibility
17.1. Shared cloud and onprem platform capabilities with variant-aware controls.
17.2. Dedicated onprem enterprise deployment model for multi-company groups.
17.3. Inter-company training rollout support in onprem enterprise scenarios.
17.4. Extensible platform model for custom enterprise requirements.
17.5. LearnPlay implementation support for new feature requests and special use-case adaptations.

## 18. Conclusion Group Fit (Explicit)
18.1. Supports one umbrella group with many self-contained companies.
18.2. Supports group-wide program distribution (for example IEC AI First) to all companies.
18.3. Supports company-level autonomy in course creation and assignment.
18.4. Supports cross-company assignment and sharing under governed rules.
18.5. Supports enterprise branding per company while retaining platform-wide governance.
18.6. Supports scaling from first adopter (Morgens Conclusion) to full 40-company rollout.

