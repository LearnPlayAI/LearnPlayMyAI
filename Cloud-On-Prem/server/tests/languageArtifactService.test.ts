import { describe, expect, it } from "@jest/globals";
import { resolvePodcastScriptDownloadSelection, summarizePodcastArtifacts } from "../services/languageArtifactService";

describe("summarizePodcastArtifacts", () => {
  it("returns unavailable when metadata has no podcast object", () => {
    const result = summarizePodcastArtifacts({});
    expect(result).toEqual({
      hasPodcast: false,
      hasPodcastScript: false,
      activePodcastVersionId: null,
    });
  });

  it("scopes podcast availability to the requested language", () => {
    const metadata = {
      podcast: {
        activeVersionId: "v-en-1",
        versions: [
          { id: "v-en-1", status: "completed", languageCode: "en", scriptId: "s-en-1" },
          { id: "v-fr-1", status: "processing", languageCode: "fr", scriptId: "s-fr-1" },
        ],
        scripts: [
          { id: "s-en-1", languageCode: "en", text: "HOST: Welcome" },
          { id: "s-fr-1", languageCode: "fr", text: "HOST: Bonjour" },
        ],
      },
    };
    const en = summarizePodcastArtifacts(metadata, "en");
    const fr = summarizePodcastArtifacts(metadata, "fr");

    expect(en.hasPodcast).toBe(true);
    expect(en.hasPodcastScript).toBe(true);
    expect(en.activePodcastVersionId).toBe("v-en-1");

    expect(fr.hasPodcast).toBe(false);
    expect(fr.hasPodcastScript).toBe(false);
    expect(fr.activePodcastVersionId).toBeNull();
  });

  it("falls back active version to first completed version in language when active is another language", () => {
    const metadata = {
      podcast: {
        activeVersionId: "v-en-1",
        versions: [
          { id: "v-en-1", status: "completed", languageCode: "en", scriptId: "s-en-1" },
          { id: "v-nl-1", status: "completed", languageCode: "nl", scriptId: "s-nl-1" },
        ],
        scripts: [
          { id: "s-en-1", languageCode: "en", text: "HOST: Welcome" },
          { id: "s-nl-1", languageCode: "nl", text: "HOST: Welkom" },
        ],
      },
    };
    const nl = summarizePodcastArtifacts(metadata, "nl");
    expect(nl.hasPodcast).toBe(true);
    expect(nl.hasPodcastScript).toBe(true);
    expect(nl.activePodcastVersionId).toBe("v-nl-1");
  });

  it("reports script unavailable when completed audio exists but script id is missing", () => {
    const metadata = {
      podcast: {
        activeVersionId: "v-en-1",
        versions: [
          { id: "v-en-1", status: "completed", languageCode: "en", scriptId: "" },
        ],
      },
    };
    const result = summarizePodcastArtifacts(metadata, "en");
    expect(result.hasPodcast).toBe(true);
    expect(result.hasPodcastScript).toBe(false);
    expect(result.activePodcastVersionId).toBe("v-en-1");
  });

  it("reports script unavailable when completed audio exists but the linked script text is missing", () => {
    const metadata = {
      podcast: {
        activeVersionId: "v-nl-1",
        versions: [
          { id: "v-nl-1", status: "completed", languageCode: "nl", scriptId: "script-nl-1" },
        ],
        scripts: [
          { id: "script-nl-1", languageCode: "nl", text: "" },
        ],
      },
    };

    const result = summarizePodcastArtifacts(metadata, "nl");
    expect(result.hasPodcast).toBe(true);
    expect(result.hasPodcastScript).toBe(false);
    expect(result.activePodcastVersionId).toBe("v-nl-1");
  });

  it("advertises script availability when same-language script text exists even if the completed audio version is not linked", () => {
    const metadata = {
      podcast: {
        activeVersionId: "v-nl-1",
        versions: [
          { id: "v-nl-1", status: "completed", languageCode: "nl", scriptId: "" },
        ],
        scripts: [
          { id: "legacy-script", languageCode: "nl", text: "HOST: Hallo" },
        ],
      },
    };

    const result = summarizePodcastArtifacts(metadata, "nl");
    expect(result.hasPodcast).toBe(true);
    expect(result.hasPodcastScript).toBe(true);
    expect(result.activePodcastVersionId).toBe("v-nl-1");
  });

  it("advertises script availability when a same-language script exists before completed audio exists", () => {
    const metadata = {
      podcast: {
        activeVersionId: "",
        versions: [
          { id: "v-nl-1", status: "processing", languageCode: "nl", scriptId: "script-nl-1" },
        ],
        scripts: [
          { id: "script-nl-1", languageCode: "nl", text: "HOST: Welkom" },
        ],
      },
    };

    const result = summarizePodcastArtifacts(metadata, "nl");
    expect(result.hasPodcast).toBe(false);
    expect(result.hasPodcastScript).toBe(true);
    expect(result.activePodcastVersionId).toBeNull();
  });

  it("falls back to another completed version with script text when the requested version is missing text", () => {
    const metadata = {
      podcast: {
        activeVersionId: "v-nl-audio",
        versions: [
          { id: "v-nl-audio", status: "completed", languageCode: "nl", scriptId: "script-nl-missing" },
          { id: "v-nl-script", status: "completed", languageCode: "nl", scriptId: "script-nl-text" },
        ],
        scripts: [
          { id: "script-nl-text", languageCode: "nl", text: "HOST: Welkom" },
        ],
      },
    };

    const resolution = resolvePodcastScriptDownloadSelection(metadata, {
      languageCode: "nl",
      versionId: "v-nl-audio",
    });

    expect(resolution.versionId).toBe("v-nl-script");
    expect(resolution.languageCode).toBe("nl");
    expect(resolution.scriptText).toBe("HOST: Welkom");
    expect(resolution.reason).toBeNull();
  });

  it("resolves same-language legacy script text for an exact version without a scriptId", () => {
    const metadata = {
      podcast: {
        activeVersionId: "v-nl-1",
        versions: [
          { id: "v-nl-1", status: "completed", languageCode: "nl", scriptId: "" },
        ],
        scripts: [
          { id: "legacy-script", languageCode: "nl", text: "HOST: Welkom terug" },
        ],
      },
    };

    const resolution = resolvePodcastScriptDownloadSelection(metadata, {
      languageCode: "nl",
      versionId: "v-nl-1",
    });

    expect(resolution.versionId).toBe("v-nl-1");
    expect(resolution.languageCode).toBe("nl");
    expect(resolution.scriptText).toBe("HOST: Welkom terug");
    expect(resolution.reason).toBeNull();
  });

  it("returns a precise error when no script text exists for the selected language", () => {
    const metadata = {
      podcast: {
        activeVersionId: "v-nl-1",
        versions: [
          { id: "v-nl-1", status: "completed", languageCode: "nl", scriptId: "script-nl-1" },
        ],
        scripts: [
          { id: "script-nl-1", languageCode: "nl", text: "" },
        ],
      },
    };

    const resolution = resolvePodcastScriptDownloadSelection(metadata, {
      languageCode: "nl",
      versionId: "v-nl-1",
    });

    expect(resolution.versionId).toBe("v-nl-1");
    expect(resolution.languageCode).toBe("nl");
    expect(resolution.scriptText).toBeNull();
    expect(resolution.reason).toBe("No script text found for selected podcast version.");
  });
});
