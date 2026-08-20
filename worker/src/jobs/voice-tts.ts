import { validateEnv } from "@storyframe/schemas/env";
import { createDb } from "@storyframe/schemas/db";
import { createR2 } from "@storyframe/storage";
import { narrateStory } from "@storyframe/pipeline";
import type { Job } from "bullmq";

/**
 * Phase 3 narration job: synthesizes audio for every line of an approved
 * story with the cast voices and stores audio + timestamps in R2. Idempotent
 * per line, so retries resume rather than re-charge for finished lines.
 */
export async function voiceTtsProcessor(job: Job): Promise<object> {
  const { storyId } = job.data as { storyId: string };
  if (!storyId) throw new Error("voice_tts job missing storyId");

  const env = validateEnv(process.env);
  if (!env.ELEVENLABS_API_KEY) {
    throw new Error(
      "voice_tts job requires ELEVENLABS_API_KEY — voice is optional, but this story was narrated"
    );
  }
  const db = createDb(env.NEON_CONN_STRING);
  const r2 = createR2(env);

  const result = await narrateStory(db, r2, storyId, {
    elevenLabsApiKey: env.ELEVENLABS_API_KEY,
    ttsModel: env.ELEVENLABS_TTS_MODEL,
  });
  return { storyId, ...result };
}