/**
 * Microsoft Edge TTS — free, unlimited, no API key required.
 * Uses the same neural voices as Edge browser (Aria, Guy, Jenny, etc.).
 * No word-level alignment available, so we return estimated durations
 * that pair with our syntheticSceneToVtt.
 *
 * Protocol: HTTP POST with SSML via the Edge Read Aloud REST endpoint.
 */

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDGE_ORIGIN = "https://speech.platform.bing.com";
const WSS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;

// All available Edge neural voices (subset — English-focused for Storyframe)
export const EDGE_VOICES: Record<string, { name: string; lang: string; gender: "Male" | "Female" }> = {
  "en-US-AriaNeural": { name: "Aria", lang: "en-US", gender: "Female" },
  "en-US-GuyNeural": { name: "Guy", lang: "en-US", gender: "Male" },
  "en-US-JennyNeural": { name: "Jenny", lang: "en-US", gender: "Female" },
  "en-US-JaneNeural": { name: "Jane", lang: "en-US", gender: "Female" },
  "en-US-JasonNeural": { name: "Jason", lang: "en-US", gender: "Male" },
  "en-US-SaraNeural": { name: "Sara", lang: "en-US", gender: "Female" },
  "en-US-TonyNeural": { name: "Tony", lang: "en-US", gender: "Male" },
  "en-US-NancyNeural": { name: "Nancy", lang: "en-US", gender: "Female" },
  "en-US-MichelleNeural": { name: "Michelle", lang: "en-US", gender: "Female" },
  "en-US-DavisNeural": { name: "Davis", lang: "en-US", gender: "Male" },
  "en-US-AndrewNeural": { name: "Andrew", lang: "en-US", gender: "Male" },
  "en-US-EmmaNeural": { name: "Emma", lang: "en-US", gender: "Female" },
  "en-US-BrianNeural": { name: "Brian", lang: "en-US", gender: "Male" },
  "en-US-AvaNeural": { name: "Ava", lang: "en-US", gender: "Female" },
  "en-US-ChristopherNeural": { name: "Christopher", lang: "en-US", gender: "Male" },
  "en-US-SamuelNeural": { name: "Samuel", lang: "en-US", gender: "Male" },
  "en-US-MatthewNeural": { name: "Matthew", lang: "en-US", gender: "Male" },
  "en-GB-SoniaNeural": { name: "Sonia", lang: "en-GB", gender: "Female" },
  "en-GB-RyanNeural": { name: "Ryan", lang: "en-GB", gender: "Male" },
  "en-AU-NatashaNeural": { name: "Natasha", lang: "en-AU", gender: "Female" },
  "en-AU-WilliamNeural": { name: "William", lang: "en-AU", gender: "Male" },
} as const;

export type EdgeVoiceId = keyof typeof EDGE_VOICES;

export interface EdgeSynthesisResult {
  audio: Uint8Array;
  /** Estimated word positions (Edge TTS doesn't provide character-level alignment). */
  characters: string[];
  startTimes: number[];
  endTimes: number[];
}

/** Total chars estimated per line (for synthetic VTT alignment). */
const CHARS_PER_SECOND = 18;

/**
 * Synthesize text using Edge TTS via WebSocket.
 * Falls back to HTTP POST if WebSocket fails.
 */
export async function synthesizeEdgeTts(
  voiceId: EdgeVoiceId,
  text: string,
  opts?: { rate?: string; pitch?: string }
): Promise<EdgeSynthesisResult> {
  // Try HTTP API first (simpler, more reliable in serverless)
  return synthesizeViaHttp(voiceId, text, opts);
}

/**
 * HTTP-based synthesis using the Edge Read Aloud REST endpoint.
 * More reliable in serverless environments than WebSocket.
 */
async function synthesizeViaHttp(
  voiceId: EdgeVoiceId,
  text: string,
  opts?: { rate?: string; pitch?: string }
): Promise<EdgeSynthesisResult> {
  const ssml = buildSsml(voiceId, text, opts);

  const res = await fetch(
    `${EDGE_ORIGIN}/v1/voices/synthesize/readaloud?trustedClientToken=${TRUSTED_CLIENT_TOKEN}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
        Origin: EDGE_ORIGIN,
        Referer: EDGE_ORIGIN,
      },
      body: ssml,
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Edge TTS HTTP failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const audio = new Uint8Array(await res.arrayBuffer());

  // Estimate word positions for synthetic VTT alignment
  const characters = [...text];
  const estimatedDuration = audio.length / (48000 / 8); // rough estimate from bitrate
  const charDuration = Math.max(0.02, estimatedDuration / Math.max(characters.length, 1));

  const startTimes: number[] = [];
  const endTimes: number[] = [];
  for (let i = 0; i < characters.length; i++) {
    startTimes.push(i * charDuration);
    endTimes.push((i + 1) * charDuration);
  }

  return { audio, characters, startTimes, endTimes };
}

function buildSsml(voiceId: EdgeVoiceId, text: string, opts?: { rate?: string; pitch?: string }): string {
  const voice = EDGE_VOICES[voiceId] ?? EDGE_VOICES["en-US-AriaNeural"];
  const rate = opts?.rate ?? "+0%";
  const pitch = opts?.pitch ?? "+0Hz";

  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
    <voice name='${voiceId}'>
      <prosody rate='${rate}' pitch='${pitch}'>
        ${escapeXml(text)}
      </prosody>
    </voice>
  </speak>`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Map a CharacterBible voice_id to an Edge voice.
 * Accepts "edge:en-US-AriaNeural" format or falls back to a default.
 */
export function parseEdgeVoiceId(voiceId: string | null | undefined): EdgeVoiceId {
  if (!voiceId) return "en-US-AriaNeural";
  if (voiceId.startsWith("edge:")) {
    const id = voiceId.slice(5) as EdgeVoiceId;
    return id in EDGE_VOICES ? id : "en-US-AriaNeural";
  }
  // Direct ID
  if (voiceId in EDGE_VOICES) return voiceId as EdgeVoiceId;
  // Try en-US prefix
  const enId = `en-US-${voiceId}` as EdgeVoiceId;
  if (enId in EDGE_VOICES) return enId;
  return "en-US-AriaNeural";
}

/**
 * Select the best Edge voice for a character based on their description.
 * Maps CharacterBible voice_id or name to an Edge voice.
 */
export function selectEdgeVoiceForCharacter(
  characterId: string,
  characterName: string,
  existingVoiceId?: string | null
): EdgeVoiceId {
  // If already assigned, use that
  if (existingVoiceId) return parseEdgeVoiceId(existingVoiceId);

  // Simple heuristic: male names get male voices, female get female
  const femaleNames = ["aria", "jenny", "jane", "sara", "nancy", "michelle", "emma", "ava", "sonia", "natasha"];
  const isFemale = femaleNames.some((n) => characterName.toLowerCase().includes(n));

  const maleVoices: EdgeVoiceId[] = ["en-US-GuyNeural", "en-US-JasonNeural", "en-US-TonyNeural", "en-US-DavisNeural", "en-US-AndrewNeural", "en-US-BrianNeural"];
  const femaleVoices: EdgeVoiceId[] = ["en-US-AriaNeural", "en-US-JennyNeural", "en-US-JaneNeural", "en-US-SaraNeural", "en-US-NancyNeural", "en-US-MichelleNeural", "en-US-EmmaNeural", "en-US-AvaNeural"];

  // Deterministic pick by character ID hash
  const hash = [...characterId].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const pool = isFemale ? femaleVoices : maleVoices;
  return pool[hash % pool.length];
}
