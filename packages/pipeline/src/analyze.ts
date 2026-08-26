import { eq } from "drizzle-orm";
import {
  sceneManifestSchema,
  storyManifestJsonSchema,
  storyManifestSchema,
  type SceneManifest,
  type StoryManifest,
  type StoryScene,
} from "@storyframe/schemas";
import type { Db } from "@storyframe/schemas/db";
import { characters, scenes, stories } from "@storyframe/schemas/db";
import { and } from "drizzle-orm";
import { storyAssetKey, type R2Client } from "@storyframe/storage";
import { sanitizeStory } from "./sanitize";
import { needsChunking, splitByChapterMarkers } from "./chunk";
import { generateStructuredJson } from "./gemini";
import {
  generateStructuredJsonWithKimi,
  KIMI_DEFAULT_BASE_URL,
  KIMI_DEFAULT_MODEL,
} from "./kimi";
import {
  generateStructuredJsonWithQwen,
  QWEN_DEFAULT_BASE_URL,
  QWEN_DEFAULT_MODEL,
} from "./qwen";
import { ANALYSIS_MODEL, ANALYSIS_SYSTEM_INSTRUCTION } from "./prompts";
import { deriveBible } from "./bible";

export interface AnalyzeOptions {
  geminiApiKey: string;
  /** Overrides ANALYSIS_MODEL (env GEMINI_ANALYSIS_MODEL). */
  analysisModel?: string;
  /** Qwen via Modal proxy (primary analyzer). */
  qwenBaseUrl?: string;
  qwenApiKey?: string;
  qwenModel?: string;
  /** Kimi K3 via Modal proxy (secondary fallback). */
  kimiBaseUrl?: string;
  kimiApiKey?: string;
  kimiModel?: string;
}

/**
 * Phase 1: sanitize -> (chunk if needed) -> structured analysis -> validate ->
 * persist (stories/characters/scenes rows + manifest.json in R2).
 * Throws on failure; callers flip the story to analysis_failed.
 */
export async function analyzeStory(
  db: Db,
  r2: R2Client,
  storyId: string,
  opts: AnalyzeOptions
): Promise<StoryManifest> {
  const [story] = await db
    .select({ id: stories.id, source_text: stories.source_text })
    .from(stories)
    .where(eq(stories.id, storyId));
  if (!story) throw new Error(`Story ${storyId} not found`);

  await db
    .update(stories)
    .set({ status: "analyzing", updated_at: new Date() })
    .where(eq(stories.id, storyId));

  // Clear old characters and scenes for re-analysis
  await db.delete(characters).where(eq(characters.story_id, storyId));
  await db.delete(scenes).where(eq(scenes.story_id, storyId));

  const sanitized = sanitizeStory(story.source_text);
  if (sanitized.wordCount === 0) {
    throw new Error("Story text is empty after sanitization");
  }

  const input =
    needsChunking(sanitized.text) && splitByChapterMarkers(sanitized.text)
      ? splitByChapterMarkers(sanitized.text)!
          .map((c) => c.text)
          .join("\n\n")
      : sanitized.text;

  // Provider chain (first configured entry wins): Gemini (primary) ->
  // Qwen via Modal -> Kimi via Modal. Modal auth is "ID.SECRET" from the proxy token pair.
  const modalKey =
    process.env.MODAL_PROXY_TOKEN_ID && process.env.MODAL_PROXY_TOKEN_SECRET
      ? `${process.env.MODAL_PROXY_TOKEN_ID}.${process.env.MODAL_PROXY_TOKEN_SECRET}`
      : undefined;

  type Attempt = { provider: string; model: string; run: () => Promise<unknown> };
  const attempts: Attempt[] = [];

  if (opts.geminiApiKey) {
    const model = opts.analysisModel ?? ANALYSIS_MODEL;
    attempts.push({
      provider: "gemini",
      model,
      run: () =>
        generateStructuredJson(
          {
            apiKey: opts.geminiApiKey,
            model,
            systemInstruction: ANALYSIS_SYSTEM_INSTRUCTION,
            jsonSchema: storyManifestJsonSchema,
          },
          input
        ),
    });
  }
  if (opts.qwenApiKey ?? modalKey) {
    const model = opts.qwenModel ?? process.env.MODAL_QWEN_MODEL ?? QWEN_DEFAULT_MODEL;
    attempts.push({
      provider: "qwen",
      model,
      run: () =>
        generateStructuredJsonWithQwen(
          {
            baseUrl: opts.qwenBaseUrl ?? process.env.MODAL_QWEN_BASE_URL ?? QWEN_DEFAULT_BASE_URL,
            apiKey: opts.qwenApiKey ?? modalKey!,
            model,
            systemInstruction: ANALYSIS_SYSTEM_INSTRUCTION,
            jsonSchema: storyManifestJsonSchema,
          },
          input
        ),
    });
  }
  if (opts.kimiApiKey ?? modalKey) {
    const model = opts.kimiModel ?? process.env.MODAL_KIMI_MODEL ?? KIMI_DEFAULT_MODEL;
    attempts.push({
      provider: "kimi",
      model,
      run: () =>
        generateStructuredJsonWithKimi(
          {
            baseUrl: opts.kimiBaseUrl ?? process.env.MODAL_KIMI_BASE_URL ?? KIMI_DEFAULT_BASE_URL,
            apiKey: opts.kimiApiKey ?? modalKey!,
            model,
            systemInstruction: ANALYSIS_SYSTEM_INSTRUCTION,
            jsonSchema: storyManifestJsonSchema,
          },
          input
        ),
    });
  }

  let raw: unknown;
  let analysisProvider: string | null = null;
  let analysisModel = "";
  const failures: string[] = [];
  for (const attempt of attempts) {
    try {
      raw = await attempt.run();
      analysisProvider = attempt.provider;
      analysisModel = attempt.model;
      break;
    } catch (err) {
      failures.push(`${attempt.provider}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (analysisProvider === null) {
    throw new Error(`All analysis providers failed — ${failures.join(" | ")}`);
  }

  const manifest = storyManifestSchema.parse(raw);

  await db
    .update(stories)
    .set({
      sanitized_text: sanitized.text,
      status: "cast_review",
      analysis_model: analysisModel,
      analysis_provider: analysisProvider,
      updated_at: new Date(),
    })
    .where(eq(stories.id, storyId));

  for (const character of manifest.characters) {
    await db.insert(characters).values({
      story_id: storyId,
      character_id: character.id,
      name: character.name,
      role: character.role,
      bible: deriveBible(character),
      version: 1,
    });
  }

  for (const scene of manifest.scenes) {
    await db.insert(scenes).values({
      story_id: storyId,
      scene_id: scene.id,
      order: scene.order,
      data: toSceneManifest(scene),
    });
  }

  await r2.upload(
    storyAssetKey(storyId, "manifest.json"),
    new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
    "application/json"
  );

  return manifest;
}

/** StoryManifest scene -> bundle-scene payload (image/line_refs filled later). */
export function toSceneManifest(scene: StoryScene): SceneManifest {
  return sceneManifestSchema.parse({
    id: scene.id,
    order: scene.order,
    setting: scene.setting,
    time_of_day: scene.time_of_day,
    mood: scene.mood,
    is_key_scene: scene.is_key_scene,
    characters_present: scene.characters_present,
    image: null,
    line_refs: scene.lines.map((line) => line.id),
  });
}