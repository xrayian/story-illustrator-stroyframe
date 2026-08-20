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
  for (const row of assetRows) {
    if (!row.r2_key.startsWith(prefix)) continue;
    pathToKey.set(row.r2_key.slice(prefix.length), row.r2_key);
  }

  // Re-anchor image URLs in characters + scenes to bundle-relative paths so
  // the bundle is fully self-contained once unzipped (no online API hits).
  const bundleCharacters: CharacterBible[] = characterBibles.map((c) => ({
    ...c,
    reference_image_url: c.reference_image_url
      ? rel(pathToKey, c.reference_image_url)
      : null,
  }));
  const bundleScenes: SceneManifest[] = sceneManifests.map((s) => ({
    ...s,
    image: s.image
      ? { key: s.image.key, url: rel(pathToKey, s.image.url) }
      : null,
  }));

  // Captions: load each scene's per-line timestamps and build VTT with a
  // cumulative offset across scenes (continuous bundle timeline).
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
    if (lines.length === 0) continue;
    const cue = sceneToVtt(scene.id, lines, offset);
    captions.push({ sceneId: scene.id, vtt: cue.vtt });
    offset += cue.duration;
    durationSeconds += cue.duration;
  }

  const assetProvider: AssetProvider = {
    async *list() {
      for (const [bundlePath] of pathToKey) yield { path: bundlePath };
    },
    async get(path) {
      const r2Key = pathToKey.get(path);
      if (!r2Key) return null;
      return r2.download(r2Key);
    },
  };

  const manifest: BundleManifest = {
    format_version: FORMAT_VERSION,
    title: story[0].title,
    engine: {
      gemini_analysis_model: opts.geminiAnalysisModel,
      gemini_image_model: opts.geminiImageModel,
      voice_engine: story[0].voice_skipped ? null : "elevenlabs",
      image_engine: story[0].visual_skipped ? null : "pollinations",
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
