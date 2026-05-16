import { describe, expect, it } from "@jest/globals";
import {
  formatPodcastScriptForEditor,
  insertPodcastScriptTurnPair,
  parsePodcastScriptTurns,
  serializePodcastScriptTurns,
} from "../hooks/usePodcastScriptTools";

describe("podcast script tools", () => {
  it("parses mixed labelled and plain text lines into turns", () => {
    const turns = parsePodcastScriptTurns("HOST: Hello\nGUEST: Hi\nUnlabelled line");
    expect(turns).toHaveLength(3);
    expect(turns[0]).toEqual({ speaker: "host", text: "Hello" });
    expect(turns[1]).toEqual({ speaker: "guest", text: "Hi" });
    expect(turns[2]).toEqual({ speaker: "narrator", text: "Unlabelled line" });
  });

  it("keeps continuation lines attached to the current speaker turn", () => {
    const turns = parsePodcastScriptTurns("HOST: Hello there\nand welcome back.\nGUEST: Thanks for having me.");
    expect(turns).toHaveLength(2);
    expect(turns[0]).toEqual({ speaker: "host", text: "Hello there and welcome back." });
    expect(turns[1]).toEqual({ speaker: "guest", text: "Thanks for having me." });
  });

  it("normalizes compact bold labels into editor-ready turns", () => {
    const formatted = formatPodcastScriptForEditor("**HOST** - Hello there\n  **GUEST**: Glad to be here", "conversation");
    expect(formatted).toContain("HOST: Hello there");
    expect(formatted).toContain("GUEST: Glad to be here");
  });

  it("serializes turns into normalized editor script", () => {
    const script = serializePodcastScriptTurns([
      { speaker: "host", text: "Welcome" },
      { speaker: "guest", text: "Thanks" },
      { speaker: "narrator", text: "Closing note" },
    ]);
    expect(script).toContain("HOST: Welcome");
    expect(script).toContain("GUEST: Thanks");
    expect(script).toContain("NARRATOR: Closing note");
  });

  it("preserves active turn trailing spaces while editing", () => {
    const script = serializePodcastScriptTurns(
      [
        { speaker: "host", text: "Welcome Chris. " },
        { speaker: "guest", text: "Thanks" },
      ],
      { preserveWhitespace: true }
    );

    expect(script).toContain("HOST: Welcome Chris. \n\nGUEST: Thanks");
  });

  it("parses editor text without removing in-progress trailing spaces or empty turns", () => {
    const turns = parsePodcastScriptTurns("HOST: Welcome Chris. \n\nGUEST: ", {
      preserveWhitespace: true,
      preserveEmptyTurns: true,
    });

    expect(turns).toEqual([
      { speaker: "host", text: "Welcome Chris. " },
      { speaker: "guest", text: "" },
    ]);
  });

  it("splits inline speaker labels while preserving editable whitespace", () => {
    const turns = parsePodcastScriptTurns("HOST: Welcome Eric. GUEST: Thanks Liam. HOST: Let's begin.", {
      preserveWhitespace: true,
      preserveEmptyTurns: true,
    });

    expect(turns).toEqual([
      { speaker: "host", text: "Welcome Eric." },
      { speaker: "guest", text: "Thanks Liam." },
      { speaker: "host", text: "Let's begin." },
    ]);
  });

  it("inserts empty host and guest blocks in alternating order without changing existing speakers", () => {
    const turns = insertPodcastScriptTurnPair(
      [
        { speaker: "host", text: "Welcome" },
        { speaker: "guest", text: "Thanks" },
        { speaker: "guest", text: "Existing guest stays guest" },
      ],
      0
    );

    expect(turns).toEqual([
      { speaker: "host", text: "Welcome" },
      { speaker: "guest", text: "" },
      { speaker: "host", text: "" },
      { speaker: "guest", text: "Thanks" },
      { speaker: "guest", text: "Existing guest stays guest" },
    ]);
  });

  it("inserts host then guest after a guest block", () => {
    const turns = insertPodcastScriptTurnPair(
      [
        { speaker: "host", text: "Welcome" },
        { speaker: "guest", text: "Thanks" },
        { speaker: "host", text: "Next topic" },
      ],
      1
    );

    expect(turns).toEqual([
      { speaker: "host", text: "Welcome" },
      { speaker: "guest", text: "Thanks" },
      { speaker: "host", text: "" },
      { speaker: "guest", text: "" },
      { speaker: "host", text: "Next topic" },
    ]);
  });

  it("formats existing script text for editor display", () => {
    const formatted = formatPodcastScriptForEditor("**HOST** - Hello there", "conversation");
    expect(formatted).toBe("HOST: Hello there");
  });
});
