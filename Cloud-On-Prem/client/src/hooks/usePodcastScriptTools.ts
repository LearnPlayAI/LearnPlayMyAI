import { useMemo } from "react";

export type ScriptSpeaker = "host" | "guest" | "narrator";
export type ScriptTurn = { speaker: ScriptSpeaker; text: string };
export type PodcastScriptFormat = "bulletin" | "conversation";
type ScriptTextOptions = { preserveWhitespace?: boolean; preserveEmptyTurns?: boolean };

export function parsePodcastScriptTurns(scriptText: string, options: ScriptTextOptions = {}): ScriptTurn[] {
  const input = String(scriptText || "");
  if (!input) return [];

  const normalizedInput = input
    .replace(/\r\n/g, "\n")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s*\*\*(HOST|GUEST|NARRATOR)\*\*\s*[:\-–—]?\s*/gim, "$1: ")
    .replace(/[^\S\r\n]+(HOST|GUEST|NARRATOR)\s*[:\-–—]\s*/gim, "\n$1: ");
  const lines = (options.preserveWhitespace
    ? normalizedInput
    : normalizedInput
  ).split("\n");
  const turns: ScriptTurn[] = [];
  let currentTurn: ScriptTurn | null = null;

  const commitCurrentTurn = () => {
    if (!currentTurn) return;
    const text = options.preserveWhitespace ? String(currentTurn.text || "") : String(currentTurn.text || "").trim();
    if (options.preserveEmptyTurns || String(text || "").trim()) {
      turns.push({ speaker: currentTurn.speaker, text });
    }
    currentTurn = null;
  };

  for (const rawLine of lines) {
    const line = String(rawLine || "");
    if (!line.trim()) continue;
    const match = line.match(/^\s*(HOST|GUEST|NARRATOR)\s*[:\-–—]\s*([\s\S]*)$/i);
    if (!match) {
      if (currentTurn && /^[a-z0-9(]/.test(line.trim())) {
        currentTurn.text = options.preserveWhitespace ? `${currentTurn.text}\n${line}` : `${currentTurn.text} ${line}`.trim();
        continue;
      }
      commitCurrentTurn();
      currentTurn = { speaker: "narrator", text: line };
      continue;
    }
    commitCurrentTurn();
    const who = String(match[1] || "").toUpperCase();
    const text = String(match[2] || "");
    if (who === "HOST") currentTurn = { speaker: "host", text };
    else if (who === "GUEST") currentTurn = { speaker: "guest", text };
    else currentTurn = { speaker: "narrator", text };
  }
  commitCurrentTurn();
  return turns;
}

export function serializePodcastScriptTurns(turns: ScriptTurn[], options: ScriptTextOptions = {}): string {
  return turns
    .map((turn) => {
      const text = options.preserveWhitespace ? String(turn.text || "") : String(turn.text || "").trim();
      if (!options.preserveEmptyTurns && !String(text || "").trim()) return "";
      if (turn.speaker === "host") return `HOST: ${text}`;
      if (turn.speaker === "guest") return `GUEST: ${text}`;
      return `NARRATOR: ${text}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

export function insertPodcastScriptTurnPair(turns: ScriptTurn[], afterIndex: number): ScriptTurn[] {
  const insertAt = Math.max(0, Math.min(afterIndex + 1, turns.length));
  const previousSpeaker = afterIndex >= 0 ? turns[afterIndex]?.speaker : null;
  const firstSpeaker: "host" | "guest" = previousSpeaker === "host" ? "guest" : "host";
  const secondSpeaker: "host" | "guest" = firstSpeaker === "host" ? "guest" : "host";
  return [
    ...turns.slice(0, insertAt),
    { speaker: firstSpeaker, text: "" },
    { speaker: secondSpeaker, text: "" },
    ...turns.slice(insertAt),
  ];
}

export function formatPodcastScriptForEditor(scriptText: string, _format: PodcastScriptFormat): string {
  const turns = parsePodcastScriptTurns(scriptText);
  if (!turns.length) return String(scriptText || "");
  return serializePodcastScriptTurns(turns);
}

export function usePodcastScriptTools() {
  return useMemo(
    () => ({
      parseScriptTurns: parsePodcastScriptTurns,
      serializeTurnsToScript: serializePodcastScriptTurns,
      formatScriptForEditor: formatPodcastScriptForEditor,
      insertScriptTurnPair: insertPodcastScriptTurnPair,
    }),
    []
  );
}
