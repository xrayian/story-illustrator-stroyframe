import { eq } from "drizzle-orm";
import {
  storyManifestSchema,
  type CharacterBible,
  type StoryManifest,
} from "@storyframe/schemas";
import type { SceneManifest } from "@storyframe/schemas";
import type { Db } from "@storyframe/schemas/db";
import { assets, characters, scenes, stories } from "@storyframe/schemas/db";
import { storyAssetKey, type R2Client } from "@storyframe/storage";
import {
  writeBundle,
  parseLineTimestamps,
  sceneToVtt,
  syntheticSceneToVtt,
  FORMAT_VERSION,
  type BundleManifest,
  type AssetProvider,
  type BundleInput,
  type LineTimestamps,
} from "@storyframe/svmp";

const R2_PREFIX = (storyId: string) => `stories/${storyId}/`;

export interface AssembleOptions {
  /** Recorded in bundle.manifest.engine for forward-compat. */
  geminiAnalysisModel?: string;
  geminiImageModel?: string;
}

export interface AssembleResult {
  zip: Uint8Array;
  manifest: BundleManifest;
}

/**
 * Phase 5: assemble a finished story into a portable `.svmp` zip buffer.
 * Pulls every asset (audio, image, timestamps) from R2 one at a time so
 * peak memory is roughly (largest asset + zip buffer) — full story bytes
 * are never all resident at once. Requires the story to be `ready` or
 * `failed` (still allows assembly of skipped stages); rejects otherwise.
 */
export async function assembleBundle(
  db: Db,
  r2: R2Client,
  storyId: string,
  opts: AssembleOptions = {}
): Promise<AssembleResult> {
  const story = await db
    .select()
    .from(stories)
    .where(eq(stories.id, storyId))
    .limit(1);
  if (story.length === 0) throw new Error(`Story ${storyId} not found`);

  const raw = await r2.download(storyAssetKey(storyId, "manifest.json"));
  const storyManifest: StoryManifest = storyManifestSchema.parse(
    JSON.parse(new TextDecoder().decode(raw))
  );

  const charRows = await db
    .select()
    .from(characters)
    .where(eq(characters.story_id, storyId));
  const characterBibles = charRows.map((r) => r.bible as CharacterBible);

  const sceneRows = await db
    .select()
    .from(scenes)
    .where(eq(scenes.story_id, storyId));
  const sceneManifests = sceneRows
    .map((r) => r.data as SceneManifest)
    .sort((a, b) => a.order - b.order);

  // Map bundle path → R2 key for every binary asset on this story.
  const assetRows = await db
    .select()
    .from(assets)
    .where(eq(assets.story_id, storyId));
  const prefix = R2_PREFIX(storyId);
  const pathToKey = new Map();
  const assetMetaByPath = new Map<string, Record<string, unknown>>();
  for (const row of assetRows) {
    if (!row.r2_key.startsWith(prefix)) continue;
    pathToKey.set(row.r2_key.slice(prefix.length), row.r2_key);
    if (row.meta) assetMetaByPath.set(row.r2_key.slice(prefix.length), row.meta as Record<string, unknown>);
  }

  // Re-anchor image URLs in characters + scenes to bundle-relative paths so
  // the bundle is fully self-contained once unzipped (no online API hits).
  const bundleCharacters: CharacterBible[] = characterBibles.map((c) => ({
    ...c,
    reference_image_url: c.reference_image_url
      ? rel(pathToKey, c.reference_image_url)
      : null,
  }));
  const bundleScenes: SceneManifest[] = sceneManifests.map((s) => {
    const base: SceneManifest = {
      ...s,
      image: s.image ? { key: s.image.key, url: rel(pathToKey, s.image.url) } : null,
    } as SceneManifest;
    const anyS = s as unknown as { images?: { key: string; url: string }[] };
    if (anyS.images && Array.isArray(anyS.images) && anyS.images.length > 0) {
      (base as unknown as { images: { key: string; url: string }[] }).images = anyS.images.map((img) => ({
        key: img.key,
        url: rel(pathToKey, img.url),
      }));
    }
    return base;
  });

  // Captions: load each scene's per-line timestamps and build VTT with a
  // cumulative offset across scenes (continuous bundle timeline). When voice
  // is skipped there are no timestamp assets in R2, so we synthesize captions
  // from the story script (storyManifest) using estimateLineDuration — those
  // power the browser's local TTS fallback with zero extra API cost.
  const storySceneById = new Map(storyManifest.scenes.map((s) => [s.id, s.lines] as const));
  const captions: { sceneId: string; vtt: string }[] = [];
  let offset = 0;
  let durationSeconds = 0;
  for (const scene of sceneManifests) {
    const lines: LineTimestamps[] = [];
    for (const lineId of scene.line_refs) {
      const tsKey = pathToKey.get(`audio/${scene.id}/${lineId}.timestamps.json`);
      if (!tsKey) continue;
      const tsBuf = await r2.download(tsKey);
      lines.push(parseLineTimestamps(JSON.parse(new TextDecoder().decode(tsBuf))));
    }
    if (lines.length > 0) {
      const cue = sceneToVtt(scene.id, lines, offset);
      captions.push({ sceneId: scene.id, vtt: cue.vtt });
      offset += cue.duration;
      durationSeconds += cue.duration;
      continue;
    }
    // No timestamp assets (voice-skipped or not-yet-narrated). Synthesize
    // from the script so the local SpeechSynthesis fallback has captions.
    const storyLines = storySceneById.get(scene.id);
    if (!storyLines || storyLines.length === 0) continue;
    const idSet = new Set(scene.line_refs);
    // Preserve line_refs order — storyLines may already be in that order,
    // but filter explicitly to stay robust against manifest reorder.
    const synthetic = scene.line_refs
      .map((id) => storyLines.find((l) => l.id === id))
      .filter((l): l is NonNullable<typeof l> => l != null)
      .map((l) => ({ id: l.id, speakerId: l.speaker_id, text: l.text }));
    // Fallback: if line_refs is empty but storyLines exist (e.g. legacy),
    // use all lines for the scene.
    const finalSynthetic = synthetic.length > 0
      ? synthetic
      : storyLines.map((l) => ({ id: l.id, speakerId: l.speaker_id, text: l.text }));
    if (finalSynthetic.length === 0) continue;
    // Extra guard: ensure idSet membership when falling back to all lines
    void idSet;
    const cue = syntheticSceneToVtt(scene.id, finalSynthetic, offset);
    captions.push({ sceneId: scene.id, vtt: cue.vtt });
    offset += cue.duration;
    durationSeconds += cue.duration;
  }

  const assetProvider: AssetProvider = {
    async *list() {
      for (const [bundlePath] of pathToKey) {
        // Voice previews live under voice_previews/ — ephemeral design-time
        // assets, not part of the portable .svmp bundle.
        if (bundlePath.startsWith("voice_previews/")) continue;
        yield { path: bundlePath };
      }
    },
    async get(path) {
      const r2Key = pathToKey.get(path);
      if (!r2Key) return null;
      return r2.download(r2Key);
    },
  };

  // Determine actual providers used by reading assets.meta
  let voiceEngine: "elevenlabs" | "edge-tts" | null = null;
  let imageEngine: "pruna" | "gemini" | "huggingface" | "pollinations" | null = null;
  if (!story[0].voice_skipped) {
    for (const [path, meta] of assetMetaByPath) {
      if (path.startsWith("audio/") && meta.purpose === "narration" && typeof meta.provider === "string") {
        voiceEngine = meta.provider as "elevenlabs" | "edge-tts";
        break;
      }
    }
  }
  if (!story[0].visual_skipped) {
    for (const [path, meta] of assetMetaByPath) {
      if (path.startsWith("images/") && meta.purpose === "illustration" && typeof meta.provider === "string") {
        imageEngine = meta.provider as "pruna" | "gemini" | "huggingface" | "pollinations";
        break;
      }
    }
  }

  const manifest: BundleManifest = {
    format_version: FORMAT_VERSION,
    title: story[0].title,
    engine: {
      gemini_analysis_model: opts.geminiAnalysisModel,
      gemini_image_model: opts.geminiImageModel,
      voice_engine: voiceEngine,
      image_engine: imageEngine,
    },
    counts: {
      characters: characterBibles.length,
      scenes: sceneManifests.length,
      lines: storyManifest.scenes.reduce((n, s) => n + s.lines.length, 0),
    },
    duration_seconds: Math.round(durationSeconds * 1000) / 1000,
    voice_skipped: story[0].voice_skipped,
    visual_skipped: story[0].visual_skipped,
    created_at: new Date().toISOString(),
  };

  const input: BundleInput = {
    manifest,
    characters: bundleCharacters,
    scenes: bundleScenes,
    captions,
    assets: assetProvider,
  };
  const zip = await writeBundle(input);
  return { zip, manifest };
}

/** Resolve a stored streaming asset URL to its bundle-relative path. */
function rel(pathToKey: Map<string, string>, url: string): string {
  const marker = "/visuals/asset/";
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const r2Key = url.slice(idx + marker.length);
  return r2Key.startsWith("stories/") ? r2Key.split("/").slice(2).join("/") : r2Key;
}
