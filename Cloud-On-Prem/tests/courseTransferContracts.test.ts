import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('Course transfer export/import contracts', () => {
  it('keeps course transfer available on both cloud and on-prem deployments', () => {
    const routes = readSource('server/routes/courseRoutes.ts');
    const courseBuilder = readSource('client/src/pages/CourseBuilder.tsx');

    expect(routes).toContain("app.post('/api/courses/:id/export-preflight'");
    expect(routes).toContain("app.post('/api/courses/:id/export-job'");
    expect(routes).toContain("app.post('/api/courses/import-job'");
    expect(routes).toContain("app.post('/api/courses/import-analyze'");
    expect(routes).not.toContain('Course transfer is available on on-prem deployments only');

    expect(courseBuilder).toContain('data-testid="button-import-course"');
    expect(courseBuilder).toContain('data-testid={`action-export-${course.id}`}');
    expect(courseBuilder).not.toContain('{onpremMode && (');
  });

  it('preserves directory artifact roots during import instead of flattening files', () => {
    const service = readSource('server/services/courseTransferService.ts');

    expect(service).toContain('function buildImportDirectoryRoot');
    expect(service).toContain('const directoryRootMap = new Map<string, string>();');
    expect(service).toContain('filePathMap[srcRoot] = targetRoot;');
    expect(service).toContain('newPath = path.posix.join(targetRoot, relNorm);');
    expect(service).not.toContain('uploads", "private", "course-transfer-imports"');
  });

  it('exports a portable full-family course clone package by default', () => {
    const service = readSource('server/services/courseTransferService.ts');
    const utils = readSource('server/services/courseTransferUtils.ts');

    expect(service).toContain('function buildCourseFamilySummary');
    expect(service).toContain('collectContentGroupIds');
    expect(service).toContain('...directLessonIds');
    expect(service).toContain('quizContentGroupIds');
    expect(service).toContain('...directQuizIds');
    expect(service).toContain('allQuizCollections');
    expect(service).toContain('clonePolicy');
    expect(service).toContain('fullFamily: true');
    expect(service).toContain('targetOrgResolution: "authenticated_or_impersonated"');
    expect(service).toContain('artifactPortability');
    expect(service).toContain('originalSourcePath');
    expect(service).toContain('sourceStorageClass');
    expect(service).toContain('targetStorageStrategy: "rewrite_to_target_upload_root"');
    expect(utils).toContain('familySummary');
    expect(utils).toContain('artifactPortability');
  });

  it('wraps exported course packages in a protected encrypted payload', () => {
    const service = readSource('server/services/courseTransferService.ts');
    const utils = readSource('server/services/courseTransferUtils.ts');
    const authority = readSource('server/services/courseTransferAuthorityService.ts');
    const portalRoutes = readSource('server/routes/enterprisePortalRoutes.ts');

    expect(utils).toContain('PROTECTED_TRANSFER_DESCRIPTOR');
    expect(utils).toContain('createCipheriv("aes-256-gcm"');
    expect(utils).toContain('wrapCourseTransferDataKey');
    expect(utils).toContain('unwrapCourseTransferDataKeyFromDescriptor');
    expect(utils).toContain('COURSE_TRANSFER_PRIVATE_KEY_PATH');
    expect(utils).toContain('COURSE_TRANSFER_PUBLIC_KEY_PATH');
    expect(utils).toContain('signCourseTransferAuthorization');
    expect(utils).not.toContain('COURSE_TRANSFER_PACKAGE_SECRET');
    expect(utils).not.toContain('LEARNPLAY_COURSE_TRANSFER_SECRET');
    expect(utils).toContain('writeProtectedTransferPackage');
    expect(utils).toContain('decryptProtectedTransferPackageIfNeeded');
    expect(authority).toContain('authorizeCourseTransferExport');
    expect(authority).toContain('unwrapCourseTransferDataKeyForImport');
    expect(authority).toContain('/api/enterprise/public/course-transfer/export-authorize');
    expect(authority).toContain('/api/enterprise/public/course-transfer/decrypt-key');
    expect(portalRoutes).toContain('/api/enterprise/public/course-transfer/export-authorize');
    expect(portalRoutes).toContain('/api/enterprise/public/course-transfer/decrypt-key');
    expect(portalRoutes).toContain('getCourseTransferPublicKeyPem');
    expect(portalRoutes).toContain("onpremImportScope: 'same_enterprise_customer'");
    expect(portalRoutes).toContain("authPayload.enterpriseCustomerId");
    expect(portalRoutes).toContain("targetSystem.enterpriseCustomerId");
    expect(portalRoutes).toContain("licenseStatus !== 'active'");
    expect(service).toContain('writeProtectedTransferPackage({');
    expect(service).toContain('authorizeCourseTransferExport({');
    expect(service).toContain('decryptProtectedTransferPackageIfNeeded({');
    expect(service).toContain('unwrapCourseTransferDataKeyForImport');
    expect(service).toContain('if (packageZip.cleanupDir)');
  });

  it('keeps PPTX-focused lesson opens polling until imported slide images are available', () => {
    const viewer = readSource('client/src/pages/LessonViewer.tsx');

    expect(viewer).toContain('wantsPptxFocus');
    expect(viewer).toContain('setActiveContentTab("slides")');
    expect(viewer).toContain('data?.isLocalPptx');
    expect(viewer).toContain('data?.hasPPTX');
  });

  it('warms imported PPTX slide images so cloned courses are viewer-ready after import', () => {
    const service = readSource('server/services/courseTransferService.ts');

    expect(service).toContain('PptxHtmlConverterService');
    expect(service).toContain('preconvertImportedPptxSlideImages');
    expect(service).toContain('phase: "converting_slide_images"');
    expect(service).toContain('slideImageSummary');
  });

  it('packages extracted PPTX slide images and restores them next to the imported deck', () => {
    const service = readSource('server/services/courseTransferService.ts');

    expect(service).toContain('PptxHtmlConverterService.getSlidesDir(storageKey)');
    expect(service).toContain('associatedPptxStorageKey: pptxSlideDirSourceMap.get(sourcePath)');
    expect(service).toContain('const manifestFiles = [...(params.manifest.files || [])].sort');
    expect(service).toContain('PptxHtmlConverterService.getSlidesDir(importedPptxStorageKey)');
    expect(service).toContain('filePathMap[srcRoot] = targetRoot;');
  });

  it('lets publishing activate a complete draft before learner assignment is created', () => {
    const routes = readSource('server/routes/courseRoutes.ts');

    expect(routes).toContain('validateCourseForPublish(id, { targetLanguageCode: languageCode, skipAssignmentCheck: true })');
    expect(routes).toContain('publishCourse(id, organizationId, { skipAssignmentCheck: true })');
    expect(routes).toContain('CourseService.validateCourseForPublish(draft.id, { skipAssignmentCheck: true })');
  });

  it('keeps publish readiness quiz checks aligned with structural lesson rules', () => {
    const routes = readSource('server/routes/courseRoutes.ts');

    expect(routes).toContain('lessonType: schema.courseLessons.lessonType');
    expect(routes).toContain('const requiresQuiz = !isOverview && !isKeyTakeaways;');
    expect(routes).toContain('if (requiresQuiz && !quizLink)');
  });

  it('surfaces translated quiz artifacts even when the lesson itself has no translated row', () => {
    const routes = readSource('server/routes/languageRoutes.ts');

    expect(routes).toContain('quizLanguagesByLessonId');
    expect(routes).toContain('mergeQuizLanguageState');
    expect(routes).toContain('if (languageCode === sourceLanguageCode)');
    expect(routes).toContain('from(quizCollections)');
  });

  it('keeps lesson progress upserts backed by the required unique database contract', () => {
    const migration = readSource('migrations/0097_lesson_progress_unique_contract.sql');

    expect(migration).toContain('UNQ_lesson_user_org_progress');
    expect(migration).toContain('"lessonId", "userId", "organizationId"');
  });

  it('import analysis tells admins the package will clone into the effective target org as a draft', () => {
    const service = readSource('server/services/courseTransferService.ts');
    const routes = readSource('server/routes/courseRoutes.ts');
    const dialog = readSource('client/src/components/course/CourseTransferDialog.tsx');

    expect(service).toContain('targetOrganizationId: params.organizationId');
    expect(service).toContain('defaultMode: "create_new"');
    expect(service).toContain('importedCourseStatus: "draft"');
    expect(routes).toContain('resolveEffectiveOrganization(req as RequestWithEffectiveOrg)');
    expect(dialog).toContain('Target organization');
    expect(dialog).toContain('Imported courses are created as drafts');
  });

  it('does not strand import users after choosing a zip package', () => {
    const dialog = readSource('client/src/components/course/CourseTransferDialog.tsx');

    expect(dialog).toContain('handleImportFileSelected');
    expect(dialog).toContain('void analyzeImportPackage(file)');
    expect(dialog).toContain('handleImportNext');
    expect(dialog).not.toContain('importStep === "upload"\n                      ? !importAnalyze');
  });

  it('auto-selects merge targets instead of asking admins to manually pick matching courses', () => {
    const service = readSource('server/services/courseTransferService.ts');
    const dialog = readSource('client/src/components/course/CourseTransferDialog.tsx');

    expect(service).toContain('findImportMergeCandidates');
    expect(service).toContain('makeTitleLanguageKey');
    expect(service).toContain('autoMergeTargetCourse');
    expect(service).toContain('No matching target course was found for merge + append mode');
    expect(dialog).toContain('Automated merge target');
    expect(dialog).toContain('auto-selected');
    expect(dialog).not.toContain('Select a target course to continue with merge + append mode.');
  });

  it('uses a slide conversion resolution that avoids timing out imported PPTX decks', () => {
    const converter = readSource('server/services/pptxHtmlConverterService.ts');

    expect(converter).toContain('SLIDE_IMAGE_DPI');
    expect(converter).toContain('PPTX_SLIDE_IMAGE_DPI');
    expect(converter).toContain("'-r', String(SLIDE_IMAGE_DPI)");
    expect(converter).not.toContain("'-r', '200'");
  });

  it('extracts transfer zips through the central directory API for large package reliability', () => {
    const utils = readSource('server/services/courseTransferUtils.ts');

    expect(utils).toContain('const directory = await unzipper.Open.file(params.zipPath);');
    expect(utils).toContain('for (const entry of directory.files');
    expect(utils).not.toContain('unzipper.Parse({ forceStream: true })');
  });

  it('treats course transfer uploads as large streamed transfer traffic', () => {
    const routes = readSource('server/routes/courseRoutes.ts');
    const cloudNginx = readSource('cloud/nginx.conf.template');
    const onpremNginx = readSource('onprem/nginx.conf.template');
    const cloudSsl = readSource('cloud/ssl-mode.sh');
    const onpremSsl = readSource('onprem/ssl-mode.sh');

    expect(routes).toContain('COURSE_TRANSFER_UPLOAD_MAX_BYTES');
    expect(routes).toContain('const COURSE_TRANSFER_UPLOAD_MAX_BYTES = undefined');
    expect(routes).not.toContain('fileSize: 1024 * 1024 * 1024');

    for (const source of [cloudNginx, onpremNginx, cloudSsl, onpremSsl]) {
      expect(source).toContain('location ~ ^/api/courses/(import-analyze|import-job|import)$');
      expect(source).toContain('client_max_body_size 0;');
      expect(source).toContain('proxy_request_buffering off;');
      expect(source).toContain('proxy_read_timeout 86400s;');
    }
  });

  it('does not lose transfer work when the modal is dismissed during long-running actions', () => {
    const dialog = readSource('client/src/components/course/CourseTransferDialog.tsx');

    expect(dialog).toContain('hasRecoverableTransferState');
    expect(dialog).toContain('inlineNotice');
    expect(dialog).toContain('handleDialogOpenChange');
    expect(dialog).toContain('onPointerDownOutside');
    expect(dialog).toContain('onEscapeKeyDown');
    expect(dialog).toContain('readTransferResponse');
    expect(dialog).toContain('res.status === 413');
    expect(dialog).not.toContain('Course transfer work is still running. Use Request Cancel if you need to stop it, or wait for it to finish."');
    expect(dialog).toContain('Transfer still running');
  });

  it('imports through a staged course-domain plan instead of raw package table replay', () => {
    const service = readSource('server/services/courseTransferService.ts');

    expect(service).toContain('type CourseTransferImportPlan');
    expect(service).toContain('function buildCourseTransferImportPlan');
    expect(service).toContain('async function executeCourseTransferImportPlan');
    expect(service).toContain('async function verifyCourseTransferImportPlanResult');
    expect(service).toContain('async function insertCourseShells');
    expect(service).toContain('async function insertLessonShells');
    expect(service).toContain('async function insertQuizCollections');
    expect(service).toContain('async function insertCourseLessonLinks');
    expect(service.indexOf('await insertQuizCollections(tx, plan);')).toBeLessThan(
      service.indexOf('await insertCourseLessonLinks(tx, plan);')
    );
    expect(service).toContain('hardenImportedBundleForeignKeysForInsert');
    expect(service).toContain('primaryQuizId: row.primaryQuizId && hasQuizCollection(row.primaryQuizId) ? row.primaryQuizId : null');
    expect(service).toContain('bundle.lessonQuizLinks = (bundle.lessonQuizLinks || []).filter');
    expect(service).not.toContain('for (const table of TABLE_IMPORT_ORDER)');
  });

  it('rewrites nested course framework references to imported entity ids', () => {
    const service = readSource('server/services/courseTransferService.ts');

    expect(service).toContain('deepRewriteObject(row, { idMap: params.idMap, filePathMap: params.filePathMap })');
  });

  it('exports and imports source documents/assets as first-class course transfer records', () => {
    const service = readSource('server/services/courseTransferService.ts');
    const utils = readSource('server/services/courseTransferUtils.ts');

    expect(utils).toContain('"courseSourceDocuments"');
    expect(utils).toContain('"courseSourceAssets"');
    expect(utils).toContain('"courseSourceAssetLinks"');
    expect(service).toContain('courseSourceDocuments');
    expect(service).toContain('courseSourceAssets');
    expect(service).toContain('courseSourceAssetLinks');
    expect(service).toContain('sourceAssetIdsFromLessonMetadata');
    expect(service).toContain('insertCourseSourceRecords');
    expect(service).toContain('originalStoragePath: rewriteFileReferencesInRecord');
    expect(service).toContain('linkedEntityId: params.idMap[row.linkedEntityId] || row.linkedEntityId');
  });

  it('does not treat source-document metadata package paths as exportable artifacts', () => {
    const service = readSource('server/services/courseTransferService.ts');

    expect(service).toContain('function isExportableArtifactReference');
    expect(service).toContain('INFORMATIONAL_FILE_REFERENCE_KEYS');
    expect(service).toContain('"packagePath"');
    expect(service).toContain('isInternalDocumentPackagePath(value)');
    expect(service).toContain('collectStringFileReferences(item, acc, pathStack)');
    expect(service).toContain('collectStringFileReferences(value, acc, nextPath)');
  });

  it('full draft clones remap source asset ids inside lesson metadata and quiz images', () => {
    const versioning = readSource('server/services/courseVersioningService.ts');

    expect(versioning).toContain('sourceDocumentIdMap');
    expect(versioning).toContain('sourceAssetIdMap');
    expect(versioning).toContain('cloneCourseSourceRecords');
    expect(versioning).toContain('rewriteSourceAssetsInMetadata');
    expect(versioning).toContain('rewriteSourceAssetImageKey');
    expect(versioning).toContain('courseSourceAssetLinks');
  });

  it('self-heals stale framework lesson references from course lesson links', () => {
    const service = readSource('server/services/courseService.ts');

    expect(service).toContain('repairStaleFrameworkLessonIds(courseId');
    expect(service).toContain('await this.repairStaleFrameworkLessonIds(courseId);');
  });
});
