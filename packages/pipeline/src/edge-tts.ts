/**
 * Microsoft Edge TTS — free, unlimited, no API key required.
 * Uses the same neural voices as Edge browser (Aria, Guy, Jenny, etc.).
 * Provides word-level timing metadata for VTT alignment.
 *
 * Protocol: WebSocket with SSML via the Edge Read Aloud endpoint.
 * Requires Sec-MS-GEC DRM token (time-based SHA256 hash).
 */

import { randomUUID, createHash } from "crypto";
import WebSocket from "ws";

// ── Constants ───────────────────────────────────────────────────────────────
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const CHROMIUM_MAJOR_VERSION = "143";
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;
const WSS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;
const WIN_EPOCH = 11644473600;
const NS_PER_SEC = 1e9;
const CHUNK_MAX_BYTES = 2 ** 16; // 64KB WebSocket limit

// ── Voice catalog ───────────────────────────────────────────────────────────
export const EDGE_VOICES: Record<string, { name: string; lang: string; gender: "Male" | "Female" }> = {
  "en-US-AriaNeural": { name: "Aria", lang: "en-US", gender: "Female" },
  "en-US-JennyNeural": { name: "Jenny", lang: "en-US", gender: "Female" },
  "en-US-AvaNeural": { name: "Ava", lang: "en-US", gender: "Female" },
  "en-US-EmmaNeural": { name: "Emma", lang: "en-US", gender: "Female" },
  "en-US-MichelleNeural": { name: "Michelle", lang: "en-US", gender: "Female" },
  "en-US-AnaNeural": { name: "Ana", lang: "en-US", gender: "Female" },
  "en-US-GuyNeural": { name: "Guy", lang: "en-US", gender: "Male" },
  "en-US-AndrewNeural": { name: "Andrew", lang: "en-US", gender: "Male" },
  "en-US-BrianNeural": { name: "Brian", lang: "en-US", gender: "Male" },
  "en-US-ChristopherNeural": { name: "Christopher", lang: "en-US", gender: "Male" },
  "en-US-EricNeural": { name: "Eric", lang: "en-US", gender: "Male" },
  "en-US-RogerNeural": { name: "Roger", lang: "en-US", gender: "Male" },
  "en-US-SteffanNeural": { name: "Steffan", lang: "en-US", gender: "Male" },
  "en-GB-SoniaNeural": { name: "Sonia", lang: "en-GB", gender: "Female" },
  "en-GB-LibbyNeural": { name: "Libby", lang: "en-GB", gender: "Female" },
  "en-GB-MaisieNeural": { name: "Maisie", lang: "en-GB", gender: "Female" },
  "en-GB-RyanNeural": { name: "Ryan", lang: "en-GB", gender: "Male" },
  "en-GB-ThomasNeural": { name: "Thomas", lang: "en-GB", gender: "Male" },
  "en-AU-NatashaNeural": { name: "Natasha", lang: "en-AU", gender: "Female" },
  "en-CA-ClaraNeural": { name: "Clara", lang: "en-CA", gender: "Female" },
  "en-CA-LiamNeural": { name: "Liam", lang: "en-CA", gender: "Male" },
} as const;

export type EdgeVoiceId = keyof typeof EDGE_VOICES;

export interface EdgeSynthesisResult {
  audio: Uint8Array;
  characters: string[];
  startTimes: number[];
  endTimes: number[];
}

// ── DRM: Sec-MS-GEC token ──────────────────────────────────────────────────

function generateSecMsGec(): string {
  const nowSec = Date.now() / 1000;
  let ticks = nowSec + WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= NS_PER_SEC / 100;
  return createHash("sha256").update(`${Math.floor(ticks)}${TRUSTED_CLIENT_TOKEN}`, "ascii").digest("hex").toUpperCase();
}

function dateToString(): string {
  const d = new Date();
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    days[d.getUTCDay()] + " " +
    months[d.getUTCMonth()] + " " +
    pad(d.getUTCDate()) + " " +
    d.getUTCFullYear() + " " +
    pad(d.getUTCHours()) + ":" +
    pad(d.getUTCMinutes()) + ":" +
    pad(d.getUTCSeconds()) + " GMT+0000 (Coordinated Universal Time)"
  );
}

// ── Main synthesis via WebSocket ────────────────────────────────────────────

async function synthesizeChunk(
  voiceId: EdgeVoiceId,
  text: string,
  rate: string,
  pitch: string,
): Promise<{ audio: Uint8Array; wordBoundaries: { offset: number; duration: number; text: string }[] }> {
  const secMsGec = generateSecMsGec();
  const connId = randomUUID().replace(/-/g, "");
  const url =
    WSS_URL +
    "&Sec-MS-GEC=" + secMsGec +
    "&Sec-MS-GEC-Version=" + SEC_MS_GEC_VERSION +
    "&ConnectionId=" + connId;

  const ws = new WebSocket(url, {
    headers: {
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      "Sec-WebSocket-Version": "13",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
      Cookie: `muid=${randomUUID().replace(/-/g, "").toUpperCase()};`,
    },
  });

  return new Promise<{ audio: Uint8Array; wordBoundaries: { offset: number; duration: number; text: string }[] }>((resolve, reject) => {
    const audioChunks: Uint8Array[] = [];
    const wordBoundaries: { offset: number; duration: number; text: string }[] = [];
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        reject(new Error("Edge TTS WebSocket timeout (30s)"));
      }
    }, 30_000);

    ws.on("open", () => {
      const ts = dateToString();

      // Send speech config
      const config = '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n';
      ws.send("X-Timestamp:" + ts + "\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n" + config);

      // Send SSML
      const reqId = randomUUID().replace(/-/g, "");
      const escapedText = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='" + voiceId + "'><prosody pitch='" + pitch + "' rate='" + rate + "' volume='+0%'>" + escapedText + "</prosody></voice></speak>";
      ws.send("X-RequestId:" + reqId + "\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:" + ts + "Z\r\nPath:ssml\r\n\r\n" + ssml);
    });

    ws.on("message", (data: any, isBinary: boolean) => {
      if (!isBinary) {
        const text = data.toString();
        if (text.includes("Path:turn.end")) {
          clearTimeout(timeout);
          resolved = true;
          ws.close();
          const totalLen = audioChunks.reduce((s, c) => s + c.length, 0);
          const audio = new Uint8Array(totalLen);
          let off = 0;
          for (const chunk of audioChunks) {
            audio.set(chunk, off);
            off += chunk.length;
          }
          resolve({ audio, wordBoundaries });
        } else if (text.includes("Path:audio.metadata")) {
          const jsonStart = text.indexOf("{");
          if (jsonStart >= 0) {
            try {
              const meta = JSON.parse(text.slice(jsonStart));
              for (const m of meta.Metadata ?? []) {
                if (m.Type === "WordBoundary") {
                  wordBoundaries.push({
                    offset: m.Data.Offset,
                    duration: m.Data.Duration,
                    text: m.Data.text?.Text ?? "",
                  });
                }
              }
            } catch { /* ignore parse errors */ }
          }
        }
      } else {
        const buf = Buffer.from(data);
        if (buf.length >= 2) {
          const headerLen = (buf[0] << 8) | buf[1];
          const audioData = buf.slice(headerLen + 2);
          if (audioData.length > 0) {
            audioChunks.push(audioData);
          }
        }
      }
    });

    ws.on("error", (err: Error) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error("Edge TTS WebSocket error: " + err.message));
      }
    });

    ws.on("close", () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error("Edge TTS WebSocket closed unexpectedly"));
      }
    });
  });
}

/**
 * Synthesize text using Edge TTS via WebSocket.
 * Splits long text into chunks and concatenates audio.
 * Returns audio data + word-level timing for VTT alignment.
 */
export async function synthesizeEdgeTts(
  voiceId: EdgeVoiceId,
  text: string,
  opts?: { rate?: string; pitch?: string },
): Promise<EdgeSynthesisResult> {
  const rate = opts?.rate ?? "+0%";
  const pitch = opts?.pitch ?? "+0Hz";

  const cleaned = text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ")
    .trim();
  if (!cleaned) {
    return {
      audio: new Uint8Array(0),
      characters: [],
      startTimes: [],
      endTimes: [],
    };
  }

  const maxTextBytes = CHUNK_MAX_BYTES - 600;
  const chunks = splitText(cleaned, maxTextBytes);

  const allAudio: Uint8Array[] = [];
  const allWordBoundaries: { offset: number; duration: number; text: string }[] = [];
  let offsetCompensation = 0;

  for (const chunk of chunks) {
    let result: { audio: Uint8Array; wordBoundaries: { offset: number; duration: number; text: string }[] } | undefined;
    let lastErr: Error | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        result = await synthesizeChunk(voiceId, chunk, rate, pitch);
        break;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        if (attempt < 2) {
          const delay = (attempt + 1) * 3000 + Math.random() * 1000;
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    if (!result) throw lastErr ?? new Error("Edge TTS synthesis failed");
    allAudio.push(result.audio);

    for (const wb of result.wordBoundaries) {
      allWordBoundaries.push({
        offset: wb.offset + offsetCompensation,
        duration: wb.duration,
        text: wb.text,
      });
    }

    if (result.wordBoundaries.length > 0) {
      const last = result.wordBoundaries[result.wordBoundaries.length - 1];
      offsetCompensation = last.offset + last.duration + 8_750_000;
    } else {
      offsetCompensation += Math.floor((result.audio.length / 6000) * 1e7);
    }
  }

  const totalLen = allAudio.reduce((s, c) => s + c.length, 0);
  const audio = new Uint8Array(totalLen);
  let pos = 0;
  for (const chunk of allAudio) {
    audio.set(chunk, pos);
    pos += chunk.length;
  }

  const characters: string[] = [];
  const startTimes: number[] = [];
  const endTimes: number[] = [];

  for (const wb of allWordBoundaries) {
    const word = wb.text;
    const startSec = wb.offset / 1e7;
    const durationSec = wb.duration / 1e7;
    const charDuration = word.length > 0 ? durationSec / word.length : 0;

    for (let i = 0; i < word.length; i++) {
      characters.push(word[i]);
      startTimes.push(startSec + i * charDuration);
      endTimes.push(startSec + (i + 1) * charDuration);
    }

    if (word.length > 0) {
      const spaceStart = startSec + word.length * charDuration;
      characters.push(" ");
      startTimes.push(spaceStart);
      endTimes.push(spaceStart + charDuration * 0.5);
    }
  }

  return { audio, characters, startTimes, endTimes };
}

// ── Text chunking ───────────────────────────────────────────────────────────

function splitText(text: string, maxBytes: number): string[] {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(text);
  if (encoded.length <= maxBytes) return [text];

  const chunks: string[] = [];
  let remaining = encoded;
  while (remaining.length > 0) {
    let splitAt = maxBytes;
    while (splitAt > 0 && remaining[splitAt] !== undefined && (remaining[splitAt] & 0xc0) === 0x80) {
      splitAt--;
    }
    const spaceIdx = remaining.lastIndexOf(0x20, splitAt);
    if (spaceIdx > 0) splitAt = spaceIdx;
    else if (splitAt === 0) splitAt = maxBytes;

    const chunk = remaining.slice(0, splitAt);
    const decoded = new TextDecoder().decode(chunk);
    if (decoded.trim()) chunks.push(decoded);
    remaining = remaining.slice(splitAt);
  }
  return chunks;
}

// ── Voice ID utilities ──────────────────────────────────────────────────────

export function parseEdgeVoiceId(voiceId: string | null | undefined): EdgeVoiceId {
  if (!voiceId) return "en-US-AriaNeural";
  if (voiceId.startsWith("edge:")) {
    const id = voiceId.slice(5) as EdgeVoiceId;
    return id in EDGE_VOICES ? id : "en-US-AriaNeural";
  }
  if (voiceId in EDGE_VOICES) return voiceId as EdgeVoiceId;
  const enId = `en-US-${voiceId}` as EdgeVoiceId;
  if (enId in EDGE_VOICES) return enId;
  return "en-US-AriaNeural";
}

export function selectEdgeVoiceForCharacter(
  characterId: string,
  characterName: string,
  existingVoiceId?: string | null,
  bible?: { gender_expression?: string } | null,
): EdgeVoiceId {
  if (existingVoiceId) return parseEdgeVoiceId(existingVoiceId);

  let isFemale = false;
  const genderExpr = bible?.gender_expression?.toLowerCase() ?? "";
  if (genderExpr === "female" || genderExpr === "feminine") {
    isFemale = true;
  } else if (genderExpr === "male" || genderExpr === "masculine") {
    isFemale = false;
  } else {
    const femaleNames = ["aria", "jenny", "jane", "sara", "nancy", "michelle", "emma", "ava", "sonia", "natasha"];
    isFemale = femaleNames.some((n) => characterName.toLowerCase().includes(n));
  }

  const maleVoices: EdgeVoiceId[] = [
    "en-US-GuyNeural", "en-US-AndrewNeural", "en-US-BrianNeural",
    "en-US-ChristopherNeural", "en-US-EricNeural", "en-US-RogerNeural", "en-US-SteffanNeural",
  ];
  const femaleVoices: EdgeVoiceId[] = [
    "en-US-AriaNeural", "en-US-JennyNeural", "en-US-AvaNeural",
    "en-US-EmmaNeural", "en-US-MichelleNeural", "en-US-AnaNeural",
  ];

  const hash = [...characterId].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const pool = isFemale ? femaleVoices : maleVoices;
  return pool[hash % pool.length];
}
