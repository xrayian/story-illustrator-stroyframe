import { eq } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";
import {
  storyManifestSchema,
  type CharacterBible,
  type SceneManifest,
} from "@storyframe/schemas";
import type { Db } from "@storyframe/schemas/db";
import { assets, characters, scenes, stories } from "@storyframe/schemas/db";
import { storyAssetKey, type R2Client } from "@storyframe/storage";
import { assertCastApproved } from "./gate";

/** Phase 4: Gemini image model (Nano Banana) — paid feature, gated by billing. */
export const IMAGE_MODEL = "nano-banana-pro-preview";

/** Free Pollinations.ai fallback model (no API key; used when Gemini fails). */
export const POLLINATIONS_MODEL = "flux";
/** Referrer sent to Pollinations for higher anonymous rate limits. */
export const POLLINATIONS_REFERRER = "storyframe.app";

/** Fixed style bible applied uniformly across every illustration of a story. */
export const STYLE_BIBLE =
  "Children's picture-book illustration, warm and rich palette, soft diffused " +
  "lighting, gentle painterly texture, cinematic composition, consistent character " +
  "design, no text, no watermarks, no frames.";

/** Relative web path that streams an R2 object back to the browser. */
export function assetPublicPath(storyId: string, key: string): string {
  return `/api/stories/${storyId}/visuals/asset/${key}`;
}

/** Extracts the R2 object key embedded in a public asset path. */
export function keyFromPublicPath(url: string): string | null {
  const marker = "/visuals/asset/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const key = url.slice(idx + marker.length);
  return key.length > 0 ? key : null;
}

/** File extension matching a mime type (used for R2 object keys). */
export function extForMime(mimeType: string): string {
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  return "png";
}

/** Stable non-negative seed for deterministic Pollinations output per id. */
export function stableSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export interface PollinationsOptions {
  width: number;
  height: number;
  /** Deterministic output per seed (stable per character/scene id). */
  seed?: number;
  model?: string;
  referrer?: string;
  safe?: boolean;
}

/** Builds a Pollinations image URL for a text prompt (free, no API key). */
export function pollinationsUrl(prompt: string, opts: PollinationsOptions): string {
  const params = new URLSearchParams({
    width: String(opts.width),
    height: String(opts.height),
    nologo: "true",
    safe: opts.safe === false ? "false" : "true",
  });
  if (opts.model) params.set("model", opts.model);
  if (opts.seed !== undefined) params.set("seed", String(opts.seed));
  if (opts.referrer) params.set("referrer", opts.referrer);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;
}

/** Generates an image via Pollinations.ai with retry/backoff on transient errors. */
export async function generateImagePollinations(
  prompt: string,
  opts: PollinationsOptions
): Promise<GeneratedImage> {
  const url = pollinationsUrl(prompt, opts);
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(180_000),
        headers: { accept: "image/*" },
      });
      if (!res.ok) {
        throw new Error(`Pollinations returned HTTP ${res.status}`);
      }
      const mimeType = res.headers.get("content-type") ?? "image/jpeg";
      const buf = await res.arrayBuffer();
      return { bytes: new Uint8Array(buf), mimeType };
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const transient = /429|5\d\d|timeout|aborted|fetch failed/i.test(msg);
      if (!transient) throw err;
      await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)));
    }
  }

  throw new Error(
    `Pollinations image generation failed after 3 attempt(s): ${String(lastError)}`
  );
}

/** Prompt for a canonical reference portrait from a locked identity prompt. */
export function buildPortraitPrompt(identityPrompt: string, styleBible = STYLE_BIBLE): string {
  return (
    `${identityPrompt}\n\n` +
    `Character reference sheet: head-and-shoulders portrait, neutral expression, ` +
    `plain background. This image is the canonical anchor for the character and ` +
    `will be used to keep them consistent in every scene illustration.\n` +
    `Style: ${styleBible}`
  );
}

export interface ScenePromptInput {
  title: string;
  setting: string;
  timeOfDay: string;
  mood: string;
  isKeyScene: boolean;
  identityLines: string[];
  attachPortraits: boolean;
}

/** Prompt for one scene illustration (style bible + description + identity lines). */
export function buildScenePrompt(
  scene: ScenePromptInput,
  styleBible = STYLE_BIBLE
): string {
  return (
    `${styleBible}\n\n` +
    `Illustrate this scene of the story "${scene.title}" as a single image.\n` +
    `Setting: ${scene.setting}\nTime of day: ${scene.timeOfDay}\nMood: ${scene.mood}\n` +
    `Key scene: ${scene.isKeyScene ? "yes" : "no"}\n` +
    `Characters present:\n${scene.identityLines.join("\n")}\n\n` +
    (scene.attachPortraits
      ? "Use the attached reference portraits to keep the characters' appearance exactly consistent (this is the re-anchor).\n"
      : "") +
    "Compose a single coherent scene; characters must match their reference appearance."
  );
}

export interface ImageGenerationOptions {
  apiKey: string;
  /** Overrides IMAGE_MODEL (env GEMINI_IMAGE_MODEL). */
  imageModel?: string;
  /** Budget mode: model used for non-key scenes (defaults to imageModel). */
  nonKeySceneModel?: string;
  /**
   * Re-anchor interval: every N scenes, the canonical reference portraits are
   * attached to the request. 1 = every scene (default). The original portrait
   * is always used, never a previously generated scene image.
   */
  reAnchorEvery?: number;
  /** Overrides POLLINATIONS_MODEL (env POLLINATIONS_IMAGE_MODEL). */
  pollinationsModel?: string;
  /**
   * When a Gemini generation fails (quota/billing/other), fall back to the
   * free Pollinations.ai endpoint with a text-only prompt. Default true.
   */
  fallbackToPollinations?: boolean;
}

export type ImageProvider = "gemini" | "pollinations";

interface GeneratedWithProvider {
  image: GeneratedImage;
  provider: ImageProvider;
}

/**
 * Runs the Gemini generation; on failure, if the fallback is enabled, runs
 * the free Pollinations endpoint with a text-only prompt instead. Throws the
 * combined error when both fail.
 */
async function generateWithFallback(
  opts: ImageGenerationOptions,
  geminiCall: () => Promise<GeneratedImage>,
  pollinationsPrompt: string,
  pollinationsOpts: PollinationsOptions
): Promise<GeneratedWithProvider> {
  try {
    const image = await geminiCall();
    return { image, provider: "gemini" };
  } catch (geminiErr) {
    if (opts.fallbackToPollinations === false) throw geminiErr;
    try {
      const image = await generateImagePollinations(pollinationsPrompt, {
        ...pollinationsOpts,
        model: opts.pollinationsModel ?? POLLINATIONS_MODEL,
      });
      return { image, provider: "pollinations" };
    } catch (pollinationsErr) {
      throw new Error(
        `Gemini failed (${geminiErr instanceof Error ? geminiErr.message : String(geminiErr)})` +
          ` and Pollinations fallback failed (${pollinationsErr instanceof Error ? pollinationsErr.message : String(pollinationsErr)})`
      );
    }
  }
}

export interface GeneratedImage {
  bytes: Uint8Array;
  mimeType: string;
}

interface RefImage {
  bytes: Uint8Array;
  mimeType: string;
}

/**
 * Generates one image with a Gemini image model. Retries transient failures
 * (429/5xx). Safety-filtered generations throw with the reason — never
 * silently dropped.
 */
export async function generateImage(
  apiKey: string,
  model: string,
  prompt: string,
  refImages: RefImage[] = [],
  aspectRatio: "16:9" | "3:4" | "1:1" = "16:9"
): Promise<GeneratedImage> {
  const ai = new GoogleGenAI({ apiKey });
  const parts: Array<Record<string, unknown>> = [
    { text: prompt },
    ...refImages.map((img) => ({
      inlineData: {
        mimeType: img.mimeType,
        data: Buffer.from(img.bytes).toString("base64"),
      },
    })),
  ];

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio },
        },
      });

      const candidate = response.candidates?.[0];
      const reason = candidate?.finishReason;
      if (reason && reason !== "STOP") {
        throw new Error(
          `Image generation blocked (${reason}): ${candidate?.finishMessage ?? "no message"}`
        );
      }
      const inline = candidate?.content?.parts?.find((p) => p.inlineData);
      if (!inline?.inlineData?.data) {
        throw new Error("Gemini image generation returned no inline image");
      }
      return {
        bytes: Buffer.from(inline.inlineData.data, "base64"),
        mimeType: inline.inlineData.mimeType ?? "image/png",
      };
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const transient = /429|500|503|RESOURCE_EXHAUSTED/.test(msg);
      if (!transient) throw err;
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }

  throw new Error(
    `Gemini image generation failed after 3 attempt(s): ${String(lastError)}`
  );
}

export interface PortraitsResult {
  characters: number;
  generated: number;
  skipped: number;
  providers: { gemini: number; pollinations: number };
}

/**
 * Phase 4a: one reference portrait per character, from the locked identity
 * prompt. Stored in R2 under images/characters/, url set on the bible.
 * Idempotent per character (portraits already present are skipped). When the
 * Gemini image model is unavailable (free-tier quota), falls back to the free
 * Pollinations.ai endpoint.
 */
export async function generateReferencePortraits(
  db: Db,
  r2: R2Client,
  storyId: string,
  opts: ImageGenerationOptions
): Promise<PortraitsResult> {
  await assertCastApproved(db, storyId);

  const model = opts.imageModel ?? IMAGE_MODEL;
  const rows = await db
    .select()
    .from(characters)
    .where(eq(characters.story_id, storyId));

  let generated = 0;
  let skipped = 0;
  const providers: PortraitsResult["providers"] = { gemini: 0, pollinations: 0 };

  for (const row of rows) {
    const bible = row.bible as CharacterBible;
    if (bible.reference_image_url) {
      skipped++;
      continue;
    }

    const prompt = buildPortraitPrompt(bible.locked_identity_prompt);
    const { image, provider } = await generateWithFallback(
      opts,
      () => generateImage(opts.apiKey, model, prompt, [], "3:4"),
      prompt,
      { width: 768, height: 1024, seed: stableSeed(bible.id) }
    );

    const key = storyAssetKey(
      storyId,
      "images",
      "characters",
      `${bible.id}.${extForMime(image.mimeType)}`
    );
    await r2.upload(key, image.bytes, image.mimeType);

    const url = assetPublicPath(storyId, key);
    await db
      .update(characters)
      .set({
        bible: { ...bible, reference_image_url: url },
        updated_at: new Date(),
      })
      .where(eq(characters.id, row.id));

    await db.insert(assets).values({
      story_id: storyId,
      kind: "image",
      r2_key: key,
      content_type: image.mimeType,
      size_bytes: image.bytes.length,
      meta: { purpose: "portrait", characterId: bible.id, model, provider },
    });
    generated++;
    providers[provider]++;
  }

  return { characters: rows.length, generated, skipped, providers };
}

export interface IllustrationResult {
  scenes: number;
  generated: number;
  skipped: number;
  providers: { gemini: number; pollinations: number };
}

/**
 * Phase 4b: one illustration per scene. Prompt = scene description + style
 * bible + up to 5 present characters with their canonical reference portraits
 * attached (re-anchoring — always the original portrait, never a previous
 * scene image). Idempotent per scene.
 */
export async function illustrateScenes(
  db: Db,
  r2: R2Client,
  storyId: string,
  opts: ImageGenerationOptions
): Promise<IllustrationResult> {
  await assertCastApproved(db, storyId);

  const model = opts.imageModel ?? IMAGE_MODEL;
  const nonKeyModel = opts.nonKeySceneModel ?? model;
  const reAnchorEvery = opts.reAnchorEvery ?? 1;

  const raw = await r2.download(storyAssetKey(storyId, "manifest.json"));
  const manifest = storyManifestSchema.parse(JSON.parse(new TextDecoder().decode(raw)));

  const charRows = await db
    .select()
    .from(characters)
    .where(eq(characters.story_id, storyId));

  const portraitByCharacter = new Map<string, RefImage>();
  for (const row of charRows) {
    const bible = row.bible as CharacterBible;
    if (!bible.reference_image_url) continue;
    const key = keyFromPublicPath(bible.reference_image_url);
    if (!key) continue;
    try {
      const bytes = await r2.download(key);
      const mimeType = key.endsWith(".webp")
        ? "image/webp"
        : key.endsWith(".png")
          ? "image/png"
          : "image/jpeg";
      portraitByCharacter.set(bible.id, { bytes, mimeType });
    } catch {
      // Missing portrait: the scene prompt will fall back to the identity text.
    }
  }

  const sceneRows = await db
    .select()
    .from(scenes)
    .where(eq(scenes.story_id, storyId))
    .orderBy(scenes.order);

  await db
    .update(stories)
    .set({ status: "visual_generation", updated_at: new Date() })
    .where(eq(stories.id, storyId));

  let generated = 0;
  let skipped = 0;
  const providers: IllustrationResult["providers"] = { gemini: 0, pollinations: 0 };

  try {
    for (const [index, row] of sceneRows.entries()) {
      const scene = row.data as SceneManifest;
      if (scene.image) {
        skipped++;
        continue;
      }

      const present = scene.characters_present.slice(0, 5);
      const attachPortraits = index % reAnchorEvery === 0;
      const refImages: RefImage[] = [];
      const identityLines: string[] = [];

      for (const cid of present) {
        const bible = charRows.find((c) => c.character_id === cid)?.bible as
          | CharacterBible
          | undefined;
        if (bible) identityLines.push(`- ${bible.name} (${bible.role}): ${bible.locked_identity_prompt}`);
        const portrait = portraitByCharacter.get(cid);
        if (attachPortraits && portrait) refImages.push(portrait);
      }

      const prompt = buildScenePrompt({
        title: manifest.title,
        setting: scene.setting,
        timeOfDay: scene.time_of_day,
        mood: scene.mood,
        isKeyScene: scene.is_key_scene,
        identityLines,
        attachPortraits,
      });
      const fallbackPrompt = buildScenePrompt({
        title: manifest.title,
        setting: scene.setting,
        timeOfDay: scene.time_of_day,
        mood: scene.mood,
        isKeyScene: scene.is_key_scene,
        identityLines,
        attachPortraits: false,
      });

      const sceneModel = scene.is_key_scene ? model : nonKeyModel;
      const { image, provider } = await generateWithFallback(
        opts,
        () => generateImage(opts.apiKey, sceneModel, prompt, refImages, "16:9"),
        fallbackPrompt,
        { width: 1280, height: 720, seed: stableSeed(scene.id) }
      );

      const key = storyAssetKey(
        storyId,
        "images",
        scene.id,
        `illustration.${extForMime(image.mimeType)}`
      );
      await r2.upload(key, image.bytes, image.mimeType);

      const updatedScene: SceneManifest = {
        ...scene,
        image: { key, url: assetPublicPath(storyId, key) },
      };
      await db
        .update(scenes)
        .set({ data: updatedScene, updated_at: new Date() })
        .where(eq(scenes.id, row.id));

      await db.insert(assets).values({
        story_id: storyId,
        kind: "image",
        r2_key: key,
        content_type: image.mimeType,
        size_bytes: image.bytes.length,
        meta: { purpose: "illustration", sceneId: scene.id, model: sceneModel, provider },
      });
      generated++;
      providers[provider]++;
    }

    await db
      .update(stories)
      .set({ status: "ready", updated_at: new Date() })
      .where(eq(stories.id, storyId));
  } catch (err) {
    await db
      .update(stories)
      .set({ status: "failed", updated_at: new Date() })
      .where(eq(stories.id, storyId));
    throw err;
  }

  return { scenes: sceneRows.length, generated, skipped, providers };
}

export interface VisualsResult extends IllustrationResult {
  portraits: PortraitsResult;
}

/**
 * Phase 4: full visual pass — reference portraits, then scene illustrations.
 */
export async function generateStoryVisuals(
  db: Db,
  r2: R2Client,
  storyId: string,
  opts: ImageGenerationOptions
): Promise<VisualsResult> {
  const portraits = await generateReferencePortraits(db, r2, storyId, opts);
  const illustration = await illustrateScenes(db, r2, storyId, opts);
  return { ...illustration, portraits };
}