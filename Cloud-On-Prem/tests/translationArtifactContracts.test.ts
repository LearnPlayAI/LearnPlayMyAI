import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('Translation artifact freshness contracts', () => {
  it('stores digest and step guide source hashes directly instead of hashing an existing source hash again', () => {
    const routes = readSource('server/routes/courseRoutes.ts');

    expect(routes).toContain('legacySourceHash');
    expect(routes).toContain('asset === "digest" || asset === "stepGuide"');
    expect(routes).toContain('sourceVersionHash: selectedSourceDbHash || createHash("md5").update(String(lesson.updatedAt || lesson.id)).digest("hex").substring(0, 32)');
    expect(routes).not.toContain('.update(String(selectedSourceDbHash || lesson.updatedAt || lesson.id))');
  });

  it('refresh-from-source selects stale artifacts plus missing target-language artifacts', () => {
    const page = readSource('client/src/pages/TranslateLesson.tsx');

    expect(page).toContain('const staleSet = new Set(staleArtifactKeys)');
    expect(page).toContain("includeDigest: staleSet.has('digest') || isMissingTarget('digest')");
    expect(page).toContain('Only the stale artifact selections have been enabled');
  });

  it('includes Bloom objectives by default when objectives exist on the source lesson', () => {
    const routes = readSource('server/routes/courseRoutes.ts');

    expect(routes).toContain('const sourceObjectiveLinks = await db');
    expect(routes).toContain('objectives: hasObjectives');
    expect(routes).toContain('includeObjectives: shouldIncludeMissing("objectives")');
  });

  it('lets admins start or update translations for existing target languages with missing artifacts', () => {
    const page = readSource('client/src/pages/TranslateLesson.tsx');
    const routes = readSource('server/routes/courseRoutes.ts');

    expect(page).toContain('const targetLanguageOptions = useMemo');
    expect(page).toContain('setRetranslateExisting(Boolean(selectedLanguageJob || translationPreflight?.targetCoverage?.hasTargetLesson))');
    expect(page).toContain('Start or Update Translation');
    expect(page).toContain('No additional target languages are configured.');
    expect(page).not.toContain('All available languages already have translations.');
    expect(page).not.toContain('!activeLanguageCodes.has(lang.code)');

    expect(routes).toContain('const requestedTargetLanguageCode = String(req.query.targetLanguageCode || "").trim().toLowerCase();');
    expect(routes).toContain('const sourceLanguageCode = String(lesson.languageCode || "en").trim().toLowerCase() || "en";');
    expect(routes).toContain('includePodcastScript: shouldIncludeMissing("podcastScript")');
  });

  it('keeps target podcast state during inline translated podcast generation', () => {
    const routes = readSource('server/routes/courseRoutes.ts');
    const worker = readSource('server/workers/translationWorker.ts');

    expect(routes).toContain('const selectedPodcastHasLanguageWork');
    expect(routes).toContain('selectedPodcastSummary.hasPodcastScript');
    expect(routes).toContain('selectedPodcastJobStatus === "processing"');
    expect(routes).toContain('const podcastLesson = selectedPodcastHasLanguageWork ? lesson : sourceLesson;');
    expect(routes).toContain('const podcastLanguageCode = selectedPodcastHasLanguageWork');
    expect(worker).toContain('const freshLesson = await this.reloadLesson(lesson.id);');
    expect(worker).toContain('const baseLesson = freshLesson || lesson;');
    expect(worker).toContain('const metadata = baseLesson.metadata && typeof baseLesson.metadata === "object" ? { ...(baseLesson.metadata as any) } : {};');
  });

  it('keeps lesson viewer podcast state live across refresh while generation is processing', () => {
    const routes = readSource('server/routes/courseRoutes.ts');
    const viewer = readSource('client/src/pages/LessonViewer.tsx');

    expect(routes).toContain('const selectedPodcastHasLanguageWork');
    expect(routes).toContain('selectedPodcastSummary.hasPodcastScript');
    expect(routes).toContain('selectedPodcastJobStatus === "processing"');
    expect(routes).toContain('const podcastLesson = selectedPodcastHasLanguageWork ? selectedLesson : sourceLesson;');
    expect(routes).toContain('const podcastLanguageCode = selectedPodcastHasLanguageWork ? selectedLanguageCode : sourceLanguageCode;');

    expect(viewer).toContain('const isPodcastProcessing = effectivePodcast?.currentJob?.status === "processing";');
    expect(viewer).toContain('if (data?.podcast?.currentJob?.status === "processing") return 3000;');
    expect(viewer).toContain('isPodcastProcessing && podcastVersions.length === 0');
  });

  it('keeps new translation creation available when the runtime language table is empty or source-only', () => {
    const service = readSource('server/services/contentLanguageService.ts');
    const routes = readSource('server/routes/courseRoutes.ts');
    const cloudImporter = readSource('cloud/import-platform-data.sh');
    const onpremImporter = readSource('onprem/import-platform-data.sh');
    const cloudUpdater = readSource('cloud/update.sh');
    const onpremUpdater = readSource('onprem/update.sh');

    expect(service).toContain('const CANONICAL_TRANSLATION_LANGUAGES');
    expect(service).toContain('return this.getCanonicalTranslationLanguages();');
    expect(service).toContain('static getCanonicalTranslationLanguages');
    expect(service).toContain('return supported.some((lang) => String(lang.code || "").trim().toLowerCase() === normalized);');

    expect(routes).toContain('const isSupportedLanguage = await ContentLanguageService.isLanguageSupported(targetLanguageCode);');
    expect(routes).not.toContain('.from(supportedLanguages)\n        .where(eq(supportedLanguages.code, targetLanguageCode))');

    for (const maintenanceScript of [cloudImporter, onpremImporter, cloudUpdater, onpremUpdater]) {
      expect(maintenanceScript).toContain('Ensuring required supported languages');
      expect(maintenanceScript).toContain('INSERT INTO "supportedLanguages"');
      expect(maintenanceScript).toContain('ROW_NUMBER() OVER (PARTITION BY code ORDER BY ctid) AS rn');
      expect(maintenanceScript).toContain('ADD CONSTRAINT "supportedLanguages_pkey" PRIMARY KEY (code)');
      expect(maintenanceScript).toContain("('af', 'Afrikaans', 'Afrikaans', 'Africa', true, 1, NOW())");
      expect(maintenanceScript).toContain('ON CONFLICT (code) DO UPDATE');
      expect(maintenanceScript).toContain('"isActive" = true');
    }
  });
});
