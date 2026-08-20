import { z } from "zod";

const BASE_URL = "https://api.elevenlabs.io";

const previewSchema = z.object({
  audio_base_64: z.string(),
  generated_voice_id: z.string(),
  media_type: z.string().optional(),
  duration_secs: z.number().optional(),
});

const designResponseSchema = z.object({
  previews: z.array(previewSchema),
});

const createVoiceResponseSchema = z.object({
  voice_id: z.string(),
});

const alignmentSchema = z.object({
  characters: z.array(z.string()),
  character_start_times_seconds: z.array(z.number()),
  character_end_times_seconds: z.array(z.number()),
});

const ttsWithTimestampsResponseSchema = z.object({
  audio_base64: z.string(),
  alignment: alignmentSchema,
});

/**
 * ElevenLabs API call with retry/backoff on rate limits (429) and 5xx.
 * Respects Retry-After when present; otherwise exponential backoff + jitter.
 */
async function elevenFetch(
  path: string,
  apiKey: string,
  init: RequestInit,
  retries = 4
): Promise<Response> {
  let attempt = 0;
  for (;;) {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), "xi-api-key": apiKey },
    });
    if (res.ok) return res;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) {
      const body = await res.text().catch(() => "");
      throw new Error(`ElevenLabs ${path} failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    const delay = retryAfter
      ? retryAfter * 1000
      : Math.min(2 ** attempt * 1000, 8000) + Math.random() * 500;
    await new Promise((resolve) => setTimeout(resolve, delay));
    attempt++;
  }
}

export interface VoicePreview {
  generatedVoiceId: string;
  audio: Uint8Array;
  mediaType: string;
  durationSecs?: number;
}

/**
 * Phase 3: Voice Design — POST /v1/text-to-voice/design.
 * Returns up to 3 distinct previews for a 20-1000 char voice description.
 */
export async function designVoice(
  apiKey: string,
  voiceDescription: string,
  model: string
): Promise<VoicePreview[]> {
  const res = await elevenFetch("/v1/text-to-voice/design", apiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ voice_description: voiceDescription, model_id: model }),
  });
  const data = designResponseSchema.parse(await res.json());
  return data.previews.map((p) => ({
    generatedVoiceId: p.generated_voice_id,
    audio: Buffer.from(p.audio_base_64, "base64"),
    mediaType: p.media_type ?? "audio/mpeg",
    durationSecs: p.duration_secs,
  }));
}

/**
 * Phase 3: saves a designed preview as a permanent voice in the library —
 * POST /v1/text-to-voice/create. Returns the voice_id to store on the bible.
 */
export async function createVoiceFromPreview(
  apiKey: string,
  opts: {
    voiceName: string;
    voiceDescription: string;
    generatedVoiceId: string;
  }
): Promise<string> {
  const res = await elevenFetch("/v1/text-to-voice/create", apiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      voice_name: opts.voiceName,
      voice_description: opts.voiceDescription,
      generated_voice_id: opts.generatedVoiceId,
    }),
  });
  const data = createVoiceResponseSchema.parse(await res.json());
  return data.voice_id;
}

export interface SynthesisResult {
  audio: Uint8Array;
  characters: string[];
  startTimes: number[];
  endTimes: number[];
}

/**
 * Phase 3: line-by-line TTS with character-level alignment —
 * POST /v1/text-to-speech/{voiceId}/with-timestamps.
 */
export async function synthesizeWithTimestamps(
  apiKey: string,
  opts: {
    voiceId: string;
    text: string;
    model: string;
    outputFormat?: string;
  }
): Promise<SynthesisResult> {
  const outputFormat = opts.outputFormat ?? "mp3_44100_128";
  const res = await elevenFetch(
    `/v1/text-to-speech/${opts.voiceId}/with-timestamps?output_format=${outputFormat}`,
    apiKey,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: opts.text, model_id: opts.model }),
    }
  );
  const data = ttsWithTimestampsResponseSchema.parse(await res.json());
  return {
    audio: Buffer.from(data.audio_base64, "base64"),
    characters: data.alignment.characters,
    startTimes: data.alignment.character_start_times_seconds,
    endTimes: data.alignment.character_end_times_seconds,
  };
}