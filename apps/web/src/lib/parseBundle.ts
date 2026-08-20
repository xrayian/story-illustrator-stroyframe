"use client";

import JSZip from "jszip";
import {
  characterBibleSchema,
  type CharacterBible,
} from "@storyframe/schemas";
import { sceneManifestSchema, type SceneManifest } from "@storyframe/schemas";

/** Subset of BundleManifest the player actually consumes (see packages/svmp). */
export interface PlayerManifest {
  format_version: 1;
  title: string;
  duration_seconds: number;
  voice_skipped: boolean;
  visual_skipped: boolean;
}

export interface VttCue {
  /** Start time on the bundle-wide timeline, seconds. */
  start: number;
  /** End time on the bundle-wide timeline, seconds. */
  end: number;
  /** Speaker id tag (e.g. "narrator" or "char_1") — map to display name via characters. */
  speakerId: string;
  text: string;
}

export interface ParsedScene {
  /** Decoded SceneManifest (id, setting, mood, image ref, line_refs). */
  manifest: SceneManifest;
  /** Blob URL for the illustration image (null if visual_skipped / not generated). */
  imageUrl: string | null;
  /** Blob URL for the scene's first narration audio (null if voice_skipped). */
  audioUrl: string | null;
  /** VTT cues for this scene, in order. Empty if voice_skipped. */
  cues: VttCue[];
  /** Display duration of this scene, seconds (audio duration or a fixed fallback). */
  duration: number;
  /** Bundle-wide start time of this scene, seconds. */
  startOffset: number;
}

export interface ParsedBundle {
  manifest: PlayerManifest;
  characters: CharacterBible[];
  scenes: ParsedScene[];
  /** Total bundle duration, seconds (= sum of scene durations). */
  totalDuration: number;
  /** Pass cleanup to revoke every blob URL. */
  dispose: () => void;
}

/** Default per-scene display length when the bundle has no narration. */
const NO_VOICE_SCENE_SECONDS = 6;

/**
 * Parse a `.svmp` zip buffer fully client-side. Returns structured data +
 * blob URLs for binary assets. Caller must invoke `dispose()` on unload to
 * release the blob URLs (otherwise they leak until tab close).
 */
export async function parseBundle(zip: Uint8Array): Promise<ParsedBundle> {
  const jz = await JSZip.loadAsync(zip);
  const bs = (path: string) => jz.file(path)?.async("uint8array");
  const text = (path: string) => jz.file(path)?.async("string");
  const json = async <T>(path: string): Promise<T | null> => {
    const t = await text(path);
    return t ? (JSON.parse(t) as T) : null;
  };

  const manifest = (await json<PlayerManifest>("manifest.json"));
  if (!manifest || manifest.format_version !== 1) {
    throw new Error("Unsupported bundle: missing manifest.json or wrong format_version.");
  }

  const charactersRaw = (await json<unknown[]>("characters.json")) ?? [];
  const characters = charactersRaw.map((c) => characterBibleSchema.parse(c));

  const scenes: ParsedScene[] = [];
  let offset = 0;
  const sceneFiles = Object.keys(jz.files)
    .filter((p) => p.startsWith("scenes/") && p.endsWith(".json"))
    .sort();
  for (const path of sceneFiles) {
    const data = await json<SceneManifest>(path);
    if (!data) continue;
    const scene = sceneManifestSchema.parse(data);

    const imageUrl = scene.image ? toObjectUrl(await bs(scene.image.url), "image/jpeg") : null;

    let audioUrl: string | null = null;
    let duration = NO_VOICE_SCENE_SECONDS;
    if (!manifest.voice_skipped && scene.line_refs.length > 0) {
      const lines: Uint8Array[] = [];
      const firstKey = `audio/${scene.id}/${scene.line_refs[0]}.mp3`;
      for (const lineId of scene.line_refs) {
        const b = await bs(`audio/${scene.id}/${lineId}.mp3`);
        if (b) lines.push(b);
      }
      if (lines.length > 0) {
        const blobParts: BlobPart[] = lines.map((b) => b.slice());
        audioUrl = URL.createObjectURL(new Blob(blobParts, { type: "audio/mpeg" }));
        const fullDuration = await audioDuration(audioUrl);
        if (Number.isFinite(fullDuration)) duration = fullDuration;
      }
      void firstKey;
    }

    const cues = manifest.voice_skipped ? [] : await readCues(`captions/${scene.id}.vtt`, await text(`captions/${scene.id}.vtt`));

    scenes.push({
      manifest: scene,
      imageUrl,
      audioUrl,
      cues,
      duration,
      startOffset: offset,
    });
    offset += duration;
  }

  const totalDuration = offset;
  return {
    manifest: { format_version: 1, title: manifest.title, duration_seconds: totalDuration, voice_skipped: manifest.voice_skipped, visual_skipped: manifest.visual_skipped },
    characters,
    scenes,
    totalDuration,
    dispose: () => {
      for (const s of scenes) {
        if (s.imageUrl) URL.revokeObjectURL(s.imageUrl);
        if (s.audioUrl) URL.revokeObjectURL(s.audioUrl);
      }
    },
  };
}

/** Robust HTML5 audio duration probe. */
function audioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const a = document.createElement("audio");
    a.preload = "metadata";
    a.onloadedmetadata = () => resolve(a.duration);
    a.onerror = () => resolve(NaN);
    a.src = url;
  });
}

function toObjectUrl(bytes: Uint8Array | undefined, contentType: string): string | null {
  if (!bytes) return null;
  return URL.createObjectURL(new Blob([bytes.slice()], { type: contentType }));
}

/**
 * Parse a WebVTT document into cues. Tolerant: ignores NOTE / STYLE / REGION
 * lines, accepts both `-->` timestamps optionally prefixed with cue id.
 * Speaker id is extracted from the leading `[id]` prefix our writer emits.
 */
async function readCues(path: string, vtt: string | undefined): Promise<VttCue[]> {
  void path;
  if (!vtt) return [];
  const out: VttCue[] = [];
  const lines = vtt.replace("\uFEFF", "").split(/\r?\n/);
  let i = 0;
  if (lines[0] && lines[0].startsWith("WEBVTT")) i++;
  while (i < lines.length) {
    let line = lines[i++].trim();
    if (line === "" || line.startsWith("NOTE") || line.startsWith("STYLE") || line.startsWith("REGION")) {
      continue;
    }
    // Skip a bare cue identifier line (no `-->`): the spec allows it.
    if (!line.includes("-->")) {
      const next = lines[i];
      if (next && next.includes("-->")) line = next;
      i++;
    }
    if (!line.includes("-->")) continue;
    const m = line.match(/^([\d:.]+)\s*-->\s*([\d:.]+)/);
    if (!m) continue;
    const start = parseTime(m[1]);
    const end = parseTime(m[2]);
    const text: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      text.push(lines[i].trim());
      i++;
    }
    const joined = text.join(" ");
    const tagMatch = joined.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (tagMatch) out.push({ start, end, speakerId: tagMatch[1], text: tagMatch[2] });
    else out.push({ start, end, speakerId: "narrator", text: joined });
  }
  return out;
}

function parseTime(hhmmss: string): number {
  const m = hhmmss.trim().match(/^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/);
  if (!m) return 0;
  const h = m[1] ? Number(m[1]) : 0;
  return h * 3600 + Number(m[2]) * 60 + Number(m[3]);
}
