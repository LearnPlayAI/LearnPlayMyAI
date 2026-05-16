import { describe, expect, it } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("podcast script versioning contracts", () => {
  it("persists edited draft script text as a versioned podcast script", () => {
    const routes = readSource("server/routes/courseRoutes.ts");
    const service = readSource("server/services/lessonPodcastService.ts");

    expect(routes).toContain("scriptText,");
    expect(service).toContain("scriptText?: string;");
    expect(service).toContain("resolveDraftScriptVersion");
    expect(service).toContain("scriptText: resolvedScriptText");
    expect(service).toContain("textHash: hashPodcastScriptText(scriptText)");
  });

  it("generates audio from the exact saved edited script version", () => {
    const service = readSource("server/services/lessonPodcastService.ts");

    expect(service).toContain("const resolvedScript = await this.resolveGenerationScriptVersion");
    expect(service).toContain("script = resolvedScript.text");
    expect(service).toContain("resolvedScriptId = resolvedScript.id");
    expect(service).toContain("scriptId: resolvedScriptId");
    expect(service).not.toContain("if (script && !resolvedScriptId) {");
  });

  it("preserves whitespace edits as distinct script version text", () => {
    const service = readSource("server/services/lessonPodcastService.ts");
    const page = readSource("client/src/pages/LessonPodcastWizard.tsx");

    expect(service).toContain('createHash("sha256").update(String(scriptText || "").replace(/\\r\\n/g, "\\n"))');
    expect(page).toContain("applyServerDraftScript(response?.state?.draft, { preserveLocalScriptText: true })");
    expect(page).toContain("stepDraftSaveMutation");
    expect(page).not.toContain("setTimeout(() =>");
  });

  it("lets users reopen the active draft from status and edit the script for a new version", () => {
    const page = readSource("client/src/pages/LessonPodcastWizard.tsx");

    expect(page).toContain("Edit Script & Generate New Version");
    expect(page).toContain("setStep(3)");
    expect(page).toContain("scriptText: scriptText || undefined");
  });

  it("lets users load an existing script version before generating audio", () => {
    const page = readSource("client/src/pages/LessonPodcastWizard.tsx");
    const routes = readSource("server/routes/courseRoutes.ts");

    expect(page).toContain("Script Versions");
    expect(page).toContain("loadScriptVersionMutation");
    expect(page).toContain("setScriptText(formatScriptForEditor(String(data.text || \"\"), data.format || podcastFormat))");
    expect(routes).toContain('app.get("/api/lessons/:lessonId/podcast/scripts/:scriptId"');
  });

  it("keeps generated podcast audio active selection scoped per language", () => {
    const service = readSource("server/services/lessonPodcastService.ts");
    const routes = readSource("server/routes/courseRoutes.ts");

    expect(service).toContain("activeVersionIdsByLanguage?: Record<string, string | null>;");
    expect(service).toContain("this.setActiveVersionForLanguage(meta, found.languageCode, versionId)");
    expect(service).toContain("getActiveVersionForLanguage(meta, languageCode)");
    expect(routes).toContain("languageCode: found.languageCode || lesson.languageCode || \"en\"");
  });

  it("opens selected script versions from lesson quick access for editing and regeneration", () => {
    const page = readSource("client/src/pages/CourseLessons.tsx");

    expect(page).toContain("scriptId: active.scriptId");
    expect(page).toContain("scriptId: v.scriptId");
    expect(page).toContain("{ scriptId: selectedScriptId }");
    expect(page).toContain("downloadPodcastScriptFromSelector(artifactSourceLessonId, lang.code, selectedPodcastVersionId || null)");
  });
});
