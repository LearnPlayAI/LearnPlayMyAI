import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "@jest/globals";

const readSource = (relativePath: string) =>
  readFileSync(path.resolve(process.cwd(), relativePath), "utf8");

describe("PodcastPlayer playback coordination", () => {
  it("pauses other podcast players before a newly selected podcast starts", () => {
    const source = readSource("client/src/components/PodcastPlayer.tsx");

    expect(source).toContain("learnplay:podcast-player-play");
    expect(source).toContain("new CustomEvent(PODCAST_PLAYER_PLAY_EVENT");
    expect(source).toContain("audioEl.addEventListener(\"play\", announcePlayback)");
    expect(source).toContain("window.addEventListener(PODCAST_PLAYER_PLAY_EVENT, pauseWhenAnotherPodcastStarts");
    expect(source).toContain("if (event.detail?.playerId === playerIdRef.current) return;");
    expect(source).toContain("audioEl.pause();");
  });
});
