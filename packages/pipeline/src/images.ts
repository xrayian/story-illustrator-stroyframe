import { eq } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";
import { InferenceClient } from "@huggingface/inference";
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

/**
 * Hugging Face text-to-image (https://huggingface.co/models?pipeline_tag=text-to-image).
 * Sits between Gemini and the free Pollinations endpoint in the fallback chain:
 * prompt-only (diffusion endpoints accept no reference images, so re-anchoring
 * is not possible there), but higher fidelity than Pollinations. The official
 * SDK routes to whichever provider currently serves the model.
 */
export const HF_IMAGE_MODEL_DEFAULT = "black-forest-labs/flux.1-schnell";

export const PRUNA_DEFAULT_MODEL = "p-image";
export const PRUNA_DEFAULT_BASE_URL = "https://api.pruna.ai";

/** Fixed style bible applied uniformly across every illustration of a story. */
export const STYLE_BIBLE =
  "Children's picture-book illustration, warm and rich palette, soft diffused " +
  "lighting, gentle painterly texture, cinematic composition, consistent character " +
  "design, no text, no speech bubbles, no dialogue bubbles, no thought bubbles, " +
  "no words, no watermarks, no frames.";

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

/**
 * Sniffs an image container's mime type from its magic bytes — used as a
 * fallback when a provider returns bytes without a usable content type, so
 * the right R2 object extension can still be picked.
 */
export function mimeFromBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return "application/octet-stream";
}

/**
 * Sensible diffusion step count per model family: distilled turbo/schnell
 * models cap at 4 steps; full models use a standard 25. Providers reject or
 * waste compute on out-of-range steps, so this must match the chosen model.
 */
export function defaultHfSteps(model: string): number {
  return /schnell|turbo/i.test(model) ? 4 : 25;
}

export interface HfImageOptions {
  /** Deterministic output per seed (stable per character/scene id). */
  seed?: number;
  /** Overrides defaultHfSteps(model). */
  steps?: number;
}

/**
 * Generates one image via the Hugging Face Inference Providers API. The SDK
 * picks a serving provider automatically; the response is a Blob of raw image
 * bytes whose type is used as the mime (magic-byte sniff as fallback).
 */
export async function generateImageHuggingFace(
  token: string,
  model: string,
  prompt: string,
  opts: HfImageOptions = {}
): Promise<GeneratedImage> {
  const client = new InferenceClient(token);
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const blob = await client.textToImage(
        {
          provider: "auto",
          model,
          inputs: prompt,
          parameters: {
            num_inference_steps: opts.steps ?? defaultHfSteps(model),
            ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
          },
        },
        { outputType: "blob" }
      );
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const mimeType =
        blob.type && blob.type !== "" && blob.type !== "application/octet-stream"
          ? blob.type
          : mimeFromBytes(bytes);
      if (mimeType === "application/octet-stream") {
        throw new Error("Hugging Face returned unrecognizable image bytes");
      }
      return { bytes, mimeType };
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const transient = /429|5\d\d|timeout|aborted|fetch failed|loading|warm/i.test(msg);
      if (!transient) throw err;
      await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)));
    }
  }

  throw new Error(
    `Hugging Face image generation failed after 3 attempt(s): ${String(lastError)}`
  );
}

export interface PrunaImageOptions {
  aspectRatio?: string; // "1:1", "16:9", "3:4", etc.
  baseUrl?: string;
}

/**
 * Generates one image via Pruna P-API (https://docs.api.pruna.ai).
 * Uses `POST /v1/predictions` with `apikey` + `Model` headers, `Try-Sync: true`,
 * polls `get_url` if async, then `GET generation_url` with `apikey`.
 *
 * Model: `p-image` (250 req/min, fast sync mode).
 */
export async function generateImagePruna(
  apiKey: string,
  model: string,
  prompt: string,
  opts: PrunaImageOptions
): Promise<GeneratedImage> {
  const baseUrl = (opts.baseUrl ?? PRUNA_DEFAULT_BASE_URL).replace(/\/$/, "");
  const body = {
    input: {
      prompt,
      aspect_ratio: opts.aspectRatio ?? "16:9",
    },
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/v1/predictions`, {
        method: "POST",
        headers: {
          apikey: apiKey,
          Model: model,
          "Try-Sync": "true",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });

      let generationUrl: string | null = null;
      let statusUrl: string | null = null;

      if (res.status === 200 || res.status === 201) {
        const data = (await res.json()) as {
          id?: string;
          get_url?: string;
          generation_url?: string;
          status?: string;
        };
        // Sync response: succeeded immediately
        if (data.status === "succeeded" && data.generation_url) {
          generationUrl = data.generation_url;
        }
        // Async response: need to poll get_url
        else if (data.get_url) {
          statusUrl = data.get_url;
        } else if (data.id) {
          // Fallback: construct status URL from id
          statusUrl = `${baseUrl}/v1/predictions/status/${data.id}`;
        }
      } else {
        const txt = await res.text().catch(() => "");
        throw new Error(`Pruna ${model} failed (${res.status}): ${txt.slice(0, 300)}`);
      }

      // Poll if async
      if (!generationUrl && statusUrl) {
        for (let poll = 0; poll < 30; poll++) {
          await new Promise((r) => setTimeout(r, 2000));
          const statusRes = await fetch(statusUrl, {
            headers: { apikey: apiKey },
            signal: AbortSignal.timeout(30_000),
          });
          if (!statusRes.ok) {
            const t = await statusRes.text().catch(() => "");
            throw new Error(`Pruna status poll failed (${statusRes.status}): ${t.slice(0, 200)}`);
          }
          const statusData = (await statusRes.json()) as {
            status?: string;
            generation_url?: string;
            error?: string;
            message?: string;
          };
          if (statusData.status === "succeeded" && statusData.generation_url) {
            generationUrl = statusData.generation_url;
            break;
          }
          if (statusData.status === "failed" || statusData.status === "canceled") {
            throw new Error(`Pruna prediction ${statusData.status}: ${statusData.error ?? statusData.message ?? "no message"}`);
          }
        }
      }

      if (!generationUrl) throw new Error("Pruna did not return a generation_url");

      // Download the image from delivery URL
      const imgRes = await fetch(generationUrl, {
        headers: { apikey: apiKey },
        signal: AbortSignal.timeout(90_000),
      });
      if (!imgRes.ok) throw new Error(`Pruna delivery failed (${imgRes.status})`);
      const mimeType = imgRes.headers.get("content-type") ?? "image/jpeg";
      const buf = await imgRes.arrayBuffer();
      return { bytes: new Uint8Array(buf), mimeType };
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const transient = /429|5\d\d|timeout|aborted|fetch failed|loading|warm/i.test(msg);
      if (!transient) throw err;
      await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)));
    }
  }

  throw new Error(`Pruna image generation failed after 3 attempt(s): ${String(lastError)}`);
}

/** Prompt for a canonical reference portrait from a locked identity prompt. */
export function buildPortraitPrompt(identityPrompt: string, styleBible = STYLE_BIBLE): string {
  return (
    `${identityPrompt}\n\n` +
    `Character reference sheet: head-and-shoulders portrait, neutral expression, ` +
    `plain background. This image is the canonical anchor for the character and ` +
    `will be used to keep them consistent in every scene illustration.\n` +
    `Strict constraint: do NOT include any speech bubbles, thought bubbles, text, labels, or captions in the image.\n` +
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
    "Compose a single coherent scene; characters must match their reference appearance.\n" +
    "Strict constraint: pure visual illustration only — do NOT render any speech bubbles, thought bubbles, dialogue text, comic callouts, subtitles, or captions inside the image."
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
   * Hugging Face token (env HF_TOKEN). When present, a failed Gemini
   * generation is retried on the Hugging Face text-to-image provider before
   * the free Pollinations fallback.
   */
  hfToken?: string;
  /** Overrides HF_IMAGE_MODEL_DEFAULT (env HF_IMAGE_MODEL). */
  hfModel?: string;
  /**
   * Set false to skip the Hugging Face hop in the fallback chain (HF still
   * only runs when an hfToken is configured). Default true.
   */
  fallbackToHuggingFace?: boolean;
  /**
   * When a Gemini generation fails (quota/billing/other), fall back to the
   * free Pollinations.ai endpoint with a text-only prompt. Default true.
   */
  fallbackToPollinations?: boolean;
  /** Pruna P-API key (env PRUNA_API_KEY) — when present, Pruna is tried first. */
  prunaApiKey?: string;
  /** Overrides PRUNA_DEFAULT_MODEL (env PRUNA_IMAGE_MODEL). */
  prunaModel?: string;
  /** Overrides PRUNA_DEFAULT_BASE_URL (env PRUNA_API_BASE_URL). */
  prunaBaseUrl?: string;
  /** Set false to skip the Pruna hop. Default true (when prunaApiKey is set). */
  fallbackToPruna?: boolean;
}

export type ImageProvider = "pruna" | "gemini" | "huggingface" | "pollinations";

interface GeneratedWithProvider {
  image: GeneratedImage;
  provider: ImageProvider;
}

/**
 * Runs Pruna (primary) → Gemini → Hugging Face → Pollinations fallback chain.
 * Pruna is tried first when `prunaApiKey` is set; all providers after that are
 * fallbacks. Both Hugging Face and Pollinations are text-only (no ref images).
 * Throws an error aggregating every provider that failed.
 */
async function generateWithFallback(
  opts: ImageGenerationOptions,
  geminiCall: () => Promise<GeneratedImage>,
  fallbackPrompt: string,
  pollinationsOpts: PollinationsOptions
): Promise<GeneratedWithProvider> {
  const failures: string[] = [];

  if (opts.prunaApiKey && opts.fallbackToPruna !== false) {
    try {
      // Convert pixel dimensions to Pruna aspect_ratio
      const aspectRatio = pollinationsOpts.width > pollinationsOpts.height ? "16:9" : "3:4";
      const image = await generateImagePruna(
        opts.prunaApiKey,
        opts.prunaModel ?? PRUNA_DEFAULT_MODEL,
        fallbackPrompt,
        {
          aspectRatio,
          baseUrl: opts.prunaBaseUrl,
        }
      );
      return { image, provider: "pruna" };
    } catch (err) {
      failures.push(`Pruna failed (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  try {
    const image = await geminiCall();
    return { image, provider: "gemini" };
  } catch (err) {
    failures.push(`Gemini failed (${err instanceof Error ? err.message : String(err)})`);
  }

  if (opts.hfToken && opts.fallbackToHuggingFace !== false) {
    try {
      const image = await generateImageHuggingFace(
        opts.hfToken,
        opts.hfModel ?? HF_IMAGE_MODEL_DEFAULT,
        fallbackPrompt,
        { seed: pollinationsOpts.seed }
      );
      return { image, provider: "huggingface" };
    } catch (err) {
      failures.push(
        `Hugging Face failed (${err instanceof Error ? err.message : String(err)})`
      );
    }
  }

  if (opts.fallbackToPollinations === false) {
    throw new Error(failures.join("; "));
  }
  try {
    const image = await generateImagePollinations(fallbackPrompt, {
      ...pollinationsOpts,
      model: opts.pollinationsModel ?? POLLINATIONS_MODEL,
    });
    return { image, provider: "pollinations" };
  } catch (err) {
    failures.push(`Pollinations failed (${err instanceof Error ? err.message : String(err)})`);
    throw new Error(failures.join("; "));
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
  providers: { pruna: number; gemini: number; huggingface: number; pollinations: number };
}

/**
 * Phase 4a: one reference portrait per character, from the locked identity
 * prompt. Stored in R2 under images/characters/, url set on the bible.
 * Idempotent per character (portraits already present are skipped). When the
 * Gemini image model is unavailable (free-tier quota), falls back to the
 * Hugging Face text-to-image provider, then the free Pollinations.ai
 * endpoint.
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
  const providers: PortraitsResult["providers"] = { pruna: 0, gemini: 0, huggingface: 0, pollinations: 0 };

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
  providers: { pruna: number; gemini: number; huggingface: number; pollinations: number };
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
  const providers: IllustrationResult["providers"] = { pruna: 0, gemini: 0, huggingface: 0, pollinations: 0 };

  try {
    for (const [index, row] of sceneRows.entries()) {
      const scene = row.data as SceneManifest;
      // Skip only if all 3 beats already exist (idempotent for 3×)
      const hasAllBeats = Array.isArray((scene as unknown as { images?: unknown }).images)
        ? ((scene as unknown as { images: unknown[] }).images.length >= 3)
        : !!scene.image;
      if (hasAllBeats) {
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

      // Dialogue-driven beats: split this scene's lines into start/middle/end thirds
      // so the 3 illustrations are story-related, not just seed variants.
      const manifestScene = manifest.scenes.find((s) => s.id === scene.id);
      const allLines = manifestScene?.lines ?? [];
      const beatCount = 3;
      const beatSize = Math.max(1, Math.ceil(allLines.length / beatCount));
      const beats = [
        { label: "start", lines: allLines.slice(0, beatSize) },
        { label: "middle", lines: allLines.slice(beatSize, beatSize * 2) },
        { label: "end", lines: allLines.slice(beatSize * 2) },
      ];

      const sceneModel = scene.is_key_scene ? model : nonKeyModel;
      const existingImages = (scene as unknown as { images?: { key: string; url: string }[] }).images ?? [];
      const newImages: { key: string; url: string }[] = [...existingImages];

      for (let beatIdx = 0; beatIdx < beatCount; beatIdx++) {
        // Keep the same canonical portraits for all 3 beats of this scene
        if (newImages[beatIdx]) continue; // already generated

        const beat = beats[beatIdx];
        const beatDialogue = beat.lines
          .map((l) => {
            const speaker = charRows.find((c) => c.character_id === l.speaker_id)?.bible as CharacterBible | undefined;
            const name = speaker?.name ?? l.speaker_id;
            return `${name}: "${l.text}"`;
          })
          .join(" ")
          .slice(0, 600);

        // Beat-specific identity lines: only characters who speak in this beat + present cast
        const beatSpeakers = new Set(beat.lines.map((l) => l.speaker_id));
        const beatIdentityLines = identityLines.filter((line) =>
          [...beatSpeakers, ...present].some((id) => {
            const ch = charRows.find((c) => c.character_id === id);
            return ch && line.includes(ch.name);
          })
        );
        const effectiveIdentityLines = beatIdentityLines.length > 0 ? beatIdentityLines : identityLines;

        const beatPrompt = buildScenePrompt({
          title: manifest.title,
          setting: `${scene.setting} — ${beat.label} of scene`,
          timeOfDay: scene.time_of_day,
          mood: scene.mood,
          isKeyScene: scene.is_key_scene,
          identityLines: effectiveIdentityLines,
          attachPortraits,
        });
        const beatPromptWithDialogue = beatDialogue ? `${beatPrompt}\n\nBeat dialogue: ${beatDialogue}` : beatPrompt;

        const fallbackPrompt = buildScenePrompt({
          title: manifest.title,
          setting: `${scene.setting} — ${beat.label} of scene`,
          timeOfDay: scene.time_of_day,
          mood: scene.mood,
          isKeyScene: scene.is_key_scene,
          identityLines: effectiveIdentityLines,
          attachPortraits: false,
        });
        const fallbackWithDialogue = beatDialogue ? `${fallbackPrompt}\n\nBeat dialogue: ${beatDialogue}` : fallbackPrompt;

        const { image, provider } = await generateWithFallback(
          opts,
          () => generateImage(opts.apiKey, sceneModel, beatPromptWithDialogue, refImages, "16:9"),
          fallbackWithDialogue,
          { width: 1280, height: 720, seed: stableSeed(`${scene.id}:beat:${beatIdx}`) }
        );

        const key = storyAssetKey(
          storyId,
          "images",
          scene.id,
          `illustration_${beatIdx}.${extForMime(image.mimeType)}`
        );
        await r2.upload(key, image.bytes, image.mimeType);

        const url = assetPublicPath(storyId, key);
        newImages[beatIdx] = { key, url };

        await db.insert(assets).values({
          story_id: storyId,
          kind: "image",
          r2_key: key,
          content_type: image.mimeType,
          size_bytes: image.bytes.length,
          meta: { purpose: "illustration", sceneId: scene.id, beat: beatIdx, model: sceneModel, provider },
        });
        generated++;
        providers[provider]++;
      }

      // Persist: keep `image` (first) for back-compat, plus `images[]` for 3×
      const updatedScene = {
        ...scene,
        image: newImages[0] ?? scene.image,
        images: newImages,
      } as SceneManifest & { images: { key: string; url: string }[] };
      await db
        .update(scenes)
        .set({ data: updatedScene as unknown as SceneManifest, updated_at: new Date() })
        .where(eq(scenes.id, row.id));
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