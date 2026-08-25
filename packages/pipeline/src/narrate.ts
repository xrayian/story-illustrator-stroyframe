import { eq } from "drizzle-orm";
import {
  storyManifestSchema,
  type CharacterBible,
} from "@storyframe/schemas";
import type { Db } from "@storyframe/schemas/db";
import { assets, characters, stories } from "@storyframe/schemas/db";
import { storyAssetKey, type R2Client } from "@storyframe/storage";
import { synthesizeWithTimestamps } from "./elevenlabs";
import { synthesizeEdgeTts, selectEdgeVoiceForCharacter, type EdgeVoiceId } from "./edge-tts";
import { assertCastApproved } from "./gate";
import { ensureNarratorRow, speakersMissingVoices, TTS_MODEL } from "./voices";

export interface NarrateOptions {
  /** ElevenLabs API key (optional — falls back to Edge TTS when absent/402). */
  elevenLabsApiKey?: string;
  /** Overrides TTS_MODEL (env ELEVENLABS_TTS_MODEL). */
  ttsModel?: string;
  /** Edge TTS rate adjustment (default "+0%"). */
  edgeRate?: string;
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
 *
 * Voice chain: ElevenLabs → Edge TTS (free, unlimited). When elevenLabsApiKey
 * is absent or ElevenLabs returns 402 (quota exhausted), automatically falls
 * back to Edge TTS which requires no API key.
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

        // Try ElevenLabs first, fall back to Edge TTS
        let result: { audio: Uint8Array; characters: string[]; startTimes: number[]; endTimes: number[] };
        let provider = "elevenlabs";

        try {
          if (opts.elevenLabsApiKey) {
            result = await synthesizeWithTimestamps(opts.elevenLabsApiKey, {
              voiceId,
              text: line.text,
              model,
            });
          } else {
            throw new Error("No ElevenLabs API key");
          }
        } catch (err) {
          // If ElevenLabs fails (402 quota, 403 feature, no key), fall back to Edge TTS
          const msg = err instanceof Error ? err.message : String(err);
          const isQuotaError = msg.includes("402") || msg.includes("403") || msg.includes("quota") || msg.includes("No ElevenLabs API key");
          if (!isQuotaError) throw err;

          // Fall back to Edge TTS
          const edgeVoiceId = selectEdgeVoiceForCharacter(
            line.speaker_id,
            speakerNameFromBible(voiceRows.find((r) => r.character_id === line.speaker_id)?.bible as CharacterBible | undefined),
            voiceId
          );
          result = await synthesizeEdgeTts(edgeVoiceId, line.text, { rate: opts.edgeRate });
          provider = "edge-tts";
        }

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
            provider,
            model: provider === "edge-tts" ? "edge" : model,
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

function speakerNameFromBible(bible: CharacterBible | undefined): string {
  return bible?.name ?? "Unknown";
}