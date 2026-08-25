import { validateEnv } from "@storyframe/schemas/env";
import { createDb } from "@storyframe/schemas/db";
import { createR2 } from "@storyframe/storage";
import { narrateStory } from "@storyframe/pipeline";
import type { Job } from "bullmq";

/**
 * Phase 3 narration job: synthesizes audio for every line of an approved
 * story with the cast voices and stores audio + timestamps in R2. Idempotent
 * per line, so retries resume rather than re-charge for finished lines.
 *
 * Voice chain: ElevenLabs → Edge TTS (free, unlimited). When elevenLabsApiKey
 * is absent or ElevenLabs returns 402 (quota exhausted), automatically falls
 * back to Edge TTS which requires no API key.
 */
export async function voiceTtsProcessor(job: Job): Promise<object> {
  const { storyId } = job.data as { storyId: string };
  if (!storyId) throw new Error("voice_tts job missing storyId");

  const env = validateEnv(process.env);

  // ElevenLabs is optional — Edge TTS is the free fallback
  const elevenLabsApiKey = env.ELEVENLABS_API_KEY || undefined;

  const db = createDb(env.NEON_CONN_STRING);
  const r2 = createR2(env);

  const result = await narrateStory(db, r2, storyId, {
    elevenLabsApiKey,
    ttsModel: env.ELEVENLABS_TTS_MODEL,
    edgeRate: env.EDGE_TTS_RATE,
  });
  return { storyId, ...result };
}