import { eq } from "drizzle-orm";
import { validateEnv } from "@storyframe/schemas/env";
import { createDb, stories } from "@storyframe/schemas/db";
import { createR2 } from "@storyframe/storage";
import {
  generateStoryVisuals,
  HF_IMAGE_MODEL_DEFAULT,
  IMAGE_MODEL,
  PRUNA_DEFAULT_BASE_URL,
  PRUNA_DEFAULT_MODEL,
} from "@storyframe/pipeline";
import type { Job } from "bullmq";

/**
 * Phase 4 image job: reference portraits + scene illustrations via a Gemini
 * image model (Nano Banana). Image generation is a paid feature — errors
 * (including 429 quota / safety blocks) are surfaced verbatim on the story.
 */
export async function imageGenerationProcessor(job: Job): Promise<object> {
  const { storyId } = job.data as { storyId: string };
  if (!storyId) throw new Error("image_generation job missing storyId");

  const env = validateEnv(process.env);
  const db = createDb(env.NEON_CONN_STRING);
  const r2 = createR2(env);

  try {
    const result = await generateStoryVisuals(db, r2, storyId, {
      apiKey: env.GEMINI_API_KEY,
      imageModel: env.GEMINI_IMAGE_MODEL ?? IMAGE_MODEL,
      hfToken: env.HF_TOKEN,
      hfModel: env.HF_IMAGE_MODEL ?? HF_IMAGE_MODEL_DEFAULT,
      pollinationsModel: env.POLLINATIONS_IMAGE_MODEL,
      prunaApiKey: env.PRUNA_API_KEY,
      prunaModel: env.PRUNA_IMAGE_MODEL ?? PRUNA_DEFAULT_MODEL,
      prunaBaseUrl: env.PRUNA_API_BASE_URL ?? PRUNA_DEFAULT_BASE_URL,
    });
    return {
      storyId,
      portraits: result.portraits.generated,
      illustrations: result.generated,
      scenes: result.scenes,
      providers: {
        portraits: result.portraits.providers,
        illustrations: result.providers,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(stories)
      .set({ status: "failed", updated_at: new Date() })
      .where(eq(stories.id, storyId));
    throw new Error(`image generation failed: ${message}`);
  }
}