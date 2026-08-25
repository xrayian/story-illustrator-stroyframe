import { eq } from "drizzle-orm";
import { validateEnv } from "@storyframe/schemas/env";
import { createDb, stories } from "@storyframe/schemas/db";
import { createR2 } from "@storyframe/storage";
import { analyzeStory } from "@storyframe/pipeline";
import type { Job } from "bullmq";

/**
 * Phase 1 analysis job: runs the Gemini analysis pass on a story and
 * persists the StoryManifest. On failure the story is marked
 * analysis_failed (with the error surfaced in the job).
 */
export async function analysisProcessor(job: Job): Promise<object> {
  const { storyId } = job.data as { storyId: string };
  if (!storyId) throw new Error("analysis job missing storyId");

  const env = validateEnv(process.env);
  const db = createDb(env.NEON_CONN_STRING);
  const r2 = createR2(env);

  try {
    const modalKey =
      env.MODAL_PROXY_TOKEN_ID && env.MODAL_PROXY_TOKEN_SECRET
        ? `${env.MODAL_PROXY_TOKEN_ID}.${env.MODAL_PROXY_TOKEN_SECRET}`
        : undefined;
    const manifest = await analyzeStory(db, r2, storyId, {
      geminiApiKey: env.GEMINI_API_KEY,
      analysisModel: env.GEMINI_ANALYSIS_MODEL,
      qwenApiKey: modalKey,
      qwenBaseUrl: env.MODAL_QWEN_BASE_URL,
      qwenModel: env.MODAL_QWEN_MODEL,
      kimiApiKey: modalKey,
      kimiBaseUrl: env.MODAL_KIMI_BASE_URL,
      kimiModel: env.MODAL_KIMI_MODEL,
    });
    return {
      storyId,
      title: manifest.title,
      characters: manifest.characters.length,
      scenes: manifest.scenes.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(stories)
      .set({ status: "analysis_failed", updated_at: new Date() })
      .where(eq(stories.id, storyId));
    throw new Error(`analysis failed: ${message}`);
  }
}