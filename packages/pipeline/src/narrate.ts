import { eq } from "drizzle-orm";
import {
  storyManifestSchema,
  type CharacterBible,
} from "@storyframe/schemas";
import type { Db } from "@storyframe/schemas/db";
import { assets, characters, stories } from "@storyframe/schemas/db";
import { storyAssetKey, type R2Client } from "@storyframe/storage";
import { synthesizeWithTimestamps } from "./elevenlabs";
import { assertCastApproved } from "./gate";
import { ensureNarratorRow, speakersMissingVoices, TTS_MODEL } from "./voices";

export interface NarrateOptions {
  elevenLabsApiKey: string;
  /** Overrides TTS_MODEL (env ELEVENLABS_TTS_MODEL). */
  ttsModel?: string;
}

export interface NarrateResult {
  scenes: number;
  lines: number;
  synthesized: number;
  skipped: number;
}

/**
 * Phase 3: narrates every line of the story with its cast voice.
 * Idempotent per line (existing audio in R2 is skipped), so a failed run
 * resumes where it stopped. Story goes voice_generation -> ready, or failed.
 */
export async function narrateStory(
  db: Db,
  r2: R2Client,
  storyId: string,
  opts: NarrateOptions
): Promise<NarrateResult> {
  await assertCastApproved(db, storyId);
  await ensureNarratorRow(db, storyId);

  const missing = await speakersMissingVoices(db, storyId);
  if (missing.length > 0) {
    throw new Error(`Voices not cast for: ${missing.join(", ")}`);
  }

  const voiceRows = await db
    .select({ character_id: characters.character_id, bible: characters.bible })
    .from(characters)
    .where(eq(characters.story_id, storyId));
  const voiceBySpeaker = new Map(
    voiceRows.map((row) => [row.character_id, (row.bible as CharacterBible).voice_id as string])
  );

  const raw = await r2.download(storyAssetKey(storyId, "manifest.json"));
  const manifest = storyManifestSchema.parse(JSON.parse(new TextDecoder().decode(raw)));

  await db
    .update(stories)
    .set({ status: "voice_generation", updated_at: new Date() })
    .where(eq(stories.id, storyId));

  const model = opts.ttsModel ?? TTS_MODEL;
  let synthesized = 0;
  let skipped = 0;
  let lines = 0;

  try {
    for (const scene of manifest.scenes) {
      for (const line of scene.lines) {
        lines++;
        const audioKey = storyAssetKey(storyId, "audio", scene.id, `${line.id}.mp3`);
        const timestampsKey = storyAssetKey(
          storyId,
          "audio",
          scene.id,
          `${line.id}.timestamps.json`
        );

        if (await r2.exists(audioKey)) {
          skipped++;
          continue;
        }

        const voiceId = voiceBySpeaker.get(line.speaker_id);
        if (!voiceId) {
          throw new Error(`No voice for speaker ${line.speaker_id}`);
        }

        const result = await synthesizeWithTimestamps(opts.elevenLabsApiKey, {
          voiceId,
          text: line.text,
          model,
        });

        await r2.upload(audioKey, result.audio, "audio/mpeg");
        const timestamps = {
          lineId: line.id,
          speakerId: line.speaker_id,
          text: line.text,
          characters: result.characters,
          startTimes: result.startTimes,
          endTimes: result.endTimes,
        };
        await r2.upload(
          timestampsKey,
          new TextEncoder().encode(JSON.stringify(timestamps, null, 2)),
          "application/json"
        );
        await db.insert(assets).values({
          story_id: storyId,
          kind: "audio",
          r2_key: audioKey,
          content_type: "audio/mpeg",
          size_bytes: result.audio.length,
          meta: {
            purpose: "narration",
            sceneId: scene.id,
            lineId: line.id,
            speakerId: line.speaker_id,
            voiceId,
            model,
          },
        });
        synthesized++;
      }
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

  return { scenes: manifest.scenes.length, lines, synthesized, skipped };
}