import { createHash } from "node:crypto";

/** Minimum duration of a single VTT cue in seconds. Shorter cues are merged. */
const MIN_CUE_SECONDS = 0.4;

export interface LineTimestamps {
  lineId: string;
  speakerId: string;
  text: string;
  characters: string[];
  startTimes: number[];
  endTimes: number[];
}

export interface SceneCues {
  sceneId: string;
  /** Offset (seconds) of this scene's first audio frame in the bundle timeline. */
  offset: number;
  vtt: string;
  /** Duration (seconds) of this scene's audio. */
  duration: number;
}

/**
 * Parse an ElevenLabs `with-timestamps` JSON document (the shape written by
 * `packages/pipeline/src/narrate.ts`) into our `LineTimestamps`.
 */
export function parseLineTimestamps(json: unknown): LineTimestamps {
  const v = json as Record<string, unknown>;
  if (typeof v.lineId !== "string") throw new Error("timestamps: missing lineId");
  if (typeof v.speakerId !== "string") throw new Error("timestamps: missing speakerId");
  if (typeof v.text !== "string") throw new Error("timestamps: missing text");
  if (!Array.isArray(v.characters) || !Array.isArray(v.startTimes) || !Array.isArray(v.endTimes)) {
    throw new Error(`timestamps: malformed arrays in line ${v.lineId}`);
  }
  return {
    lineId: v.lineId,
    speakerId: v.speakerId,
    text: v.text,
    characters: v.characters as string[],
    startTimes: v.startTimes as number[],
    endTimes: v.endTimes as number[],
  };
}

/** Format a number of seconds as a WebVTT timestamp `HH:MM:SS.mmm`. */
export function formatVttTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}.${pad3(millis)}`;
}

/**
 * Build a WebVTT document for one scene from the per-line ElevenLabs
 * timestamps. Cues are aligned to word boundaries; each cue prefixes the
 * speaker id (# "narrator" or a character id) so the player can map it to a
 * display name via characters.json.
 *
 * `offset` is added to every cue's start/end so a player can show a single
 * scrubber bar across the whole story.
 */
export function sceneToVtt(
  sceneId: string,
  lines: LineTimestamps[],
  offset: number
): SceneCues {
  const cues: string[] = [];
  let duration = 0;

  for (const line of lines) {
    const startOffset = line.startTimes[0] ?? 0;
    const endOffset = line.endTimes[line.endTimes.length - 1] ?? 0;
    const lineDuration = endOffset - startOffset;
    if (lineDuration > duration) duration = lineDuration;

    let chunkStart = -1;
    let chunkEnd = -1;
    let chunkText: string[] = [];
    const wordCount = line.characters?.length ?? 0;
    for (let i = 0; i < wordCount; i++) {
      const chars = line.characters[i] ?? "";
      const start = line.startTimes[i] ?? chunkEnd;
      const end = line.endTimes[i] ?? start;
      if (chunkStart < 0) {
        chunkStart = start;
        chunkEnd = end;
      } else {
        chunkEnd = end;
      }
      chunkText.push(chars);
      if (chunkEnd - chunkStart >= MIN_CUE_SECONDS || i === wordCount - 1) {
        const cueStart = offset + chunkStart;
        const cueEnd = offset + chunkEnd;
        cues.push(
          `${formatVttTime(cueStart)} --> ${formatVttTime(cueEnd)}\n[${line.speakerId}] ${chunkText.join("")}`
        );
        chunkStart = -1;
        chunkEnd = -1;
        chunkText = [];
      }
    }

    if (wordCount === 0) {
      cues.push(
        `${formatVttTime(offset + startOffset)} --> ${formatVttTime(offset + endOffset)}\n[${line.speakerId}] ${line.text}`
      );
    }
  }

  const header = "WEBVTT\n\n";
  const body = cues.map((c, i) => `${i + 1}\n${c}\n`).join("");
  return { sceneId, offset, vtt: header + body, duration };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
function pad3(n: number): string {
  return n < 10 ? `00${n}` : n < 100 ? `0${n}` : `${n}`;
}
