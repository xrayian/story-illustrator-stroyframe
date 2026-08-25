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
  let cursor = offset;
  let totalDuration = 0;

  for (const line of lines) {
    const startOffset = line.startTimes[0] ?? 0;
    const endOffset = line.endTimes[line.endTimes.length - 1] ?? 0;
    const lineDuration = Math.max(0, endOffset - startOffset);

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
        // Shift chunk from line-local (0..lineDuration) to scene-local (cursor..cursor+lineDuration)
        const cueStart = cursor + (chunkStart - startOffset);
        const cueEnd = cursor + (chunkEnd - startOffset);
        cues.push(
          `${formatVttTime(cueStart)} --> ${formatVttTime(cueEnd)}\n[${line.speakerId}] ${chunkText.join("")}`
        );
        chunkStart = -1;
        chunkEnd = -1;
        chunkText = [];
      }
    }

    if (wordCount === 0) {
      const cueStart = cursor;
      const cueEnd = cursor + lineDuration;
      cues.push(`${formatVttTime(cueStart)} --> ${formatVttTime(cueEnd)}\n[${line.speakerId}] ${line.text}`);
    }

    // Advance cursor for next line in same scene (audio files are concatenated end-to-end)
    cursor += lineDuration;
    totalDuration += lineDuration;
  }

  const header = "WEBVTT\n\n";
  const body = cues.map((c, i) => `${i + 1}\n${c}\n\n`).join("");
  return { sceneId, offset, vtt: header + body, duration: totalDuration };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
function pad3(n: number): string {
  return n < 10 ? `00${n}` : n < 100 ? `0${n}` : `${n}`;
}

// ---------------------------------------------------------------------------
// Synthetic VTT (voice-skipped path)
// ---------------------------------------------------------------------------

/** Approx. speech rate used to estimate cue durations when no audio exists. */
const SYNTH_WORDS_PER_SECOND = 2.4; // ~144 wpm
const SYNTH_CHARS_PER_SECOND = 14;
const SYNTH_GAP_SECONDS = 1.0; // 1s gap between speeches for natural pacing
const SYNTH_MIN_LINE_SECONDS = 0.9;
const SYNTH_MAX_LINE_SECONDS = 12;

export interface SyntheticLine {
  id: string;
  speakerId: string;
  text: string;
}

/**
 * Estimate how long a line of text takes to speak aloud.
 * Heuristic: words/2.4 + 0.35s pause, clamped to [0.9, 12].
 */
export function estimateLineDuration(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return SYNTH_MIN_LINE_SECONDS;
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  const byWords = words / SYNTH_WORDS_PER_SECOND;
  const byChars = trimmed.length / SYNTH_CHARS_PER_SECOND;
  const est = Math.max(byWords, byChars * 0.55) + 0.35;
  return Math.max(SYNTH_MIN_LINE_SECONDS, Math.min(SYNTH_MAX_LINE_SECONDS, est));
}

/**
 * Build a WebVTT document for one scene from plain-text lines (no audio).
 * One cue per line, with synthetic durations derived from estimateLineDuration.
 * `offset` is the bundle-global start of this scene.
 */
export function syntheticSceneToVtt(
  sceneId: string,
  lines: SyntheticLine[],
  offset: number
): SceneCues {
  const cues: string[] = [];
  let cursor = offset;
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const trimmed = line.text.trim();
    if (trimmed.length === 0) continue;
    const dur = estimateLineDuration(trimmed);
    const start = cursor;
    const end = start + dur;
    cues.push(`${formatVttTime(start)} --> ${formatVttTime(end)}\n[${line.speakerId}] ${trimmed}`);
    cursor = end + (idx < lines.length - 1 ? SYNTH_GAP_SECONDS : 0);
  }
  const duration = Math.max(0, cursor - offset);
  // Trim the trailing gap if we added one — actually keep duration as sum including gaps except last
  const header = "WEBVTT\n\n";
  const body = cues.map((c, i) => `${i + 1}\n${c}\n\n`).join("");
  return { sceneId, offset, vtt: header + body, duration };
}
