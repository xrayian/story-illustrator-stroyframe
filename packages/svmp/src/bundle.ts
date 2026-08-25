import { Buffer } from "node:buffer";
import yazl from "yazl";
import yauzl from "yauzl-promise";
import {
  characterBibleSchema,
  type CharacterBible,
} from "@storyframe/schemas";
import { sceneManifestSchema, type SceneManifest } from "@storyframe/schemas";
import { sha256, EXCLUDED_PATHS } from "./checksums";

/** Current bundle schema version (see docs/svmp-format.md). */
export const FORMAT_VERSION = 1;

export interface BundleManifest {
  format_version: 1;
  title: string;
  engine: {
    gemini_analysis_model?: string;
    gemini_image_model?: string;
    voice_engine: "elevenlabs" | "edge-tts" | null;
    image_engine: "pruna" | "gemini" | "huggingface" | "pollinations" | null;
  };
  counts: { characters: number; scenes: number; lines: number };
  duration_seconds: number;
  voice_skipped: boolean;
  visual_skipped: boolean;
  created_at: string;
}

/**
 * Provider for binary assets to embed in the bundle. Resolves a bundle path
 * to its bytes. The pipeline implementation streams from R2 one entry at a
 * time so we never hold the whole story in memory at once.
 */
export interface AssetProvider {
  /** Returns the raw bytes for a bundle path, or null if it does not exist. */
  get(path: string): Promise<Uint8Array | null>;
  /** Enumerate every binary path the bundle should include, in order. */
  list(): AsyncIterable<{ path: string }>;
}

export interface BundleInput {
  manifest: BundleManifest;
  characters: CharacterBible[];
  scenes: SceneManifest[];
  /** VTT caption text per scene (already offset-adjusted). */
  captions: { sceneId: string; vtt: string }[];
  /** Binary assets (audio, images) -- streamed in via the provider. */
  assets: AssetProvider;
}

export interface ParsedBundle {
  manifest: BundleManifest;
  characters: CharacterBible[];
  scenes: SceneManifest[];
  checksums: Record<string, string>;
  /** Raw bytes of every other entry keyed by bundle path (audio, images, vtt). */
  files: Map<string, Uint8Array>;
}

/**
 * Assemble a `.svmp` zip buffer from a BundleInput. One source asset is held
 * in memory at a time (yazl streams entries sequentially, so peak memory is
 * roughly (largest asset + zip buffer) instead of the sum of all assets).
 */
export async function writeBundle(input: BundleInput): Promise<Uint8Array> {
  const zip = new yazl.ZipFile();
  const chunks: Buffer[] = [];
  const done = new Promise<Uint8Array>((resolve, reject) => {
    zip.outputStream.on("data", (c: Buffer) => chunks.push(c));
    zip.outputStream.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    zip.outputStream.on("error", reject);
  });

  const checksums: Record<string, string> = {};

  const inline: { path: string; data: Uint8Array }[] = [];
  inline.push({ path: "manifest.json", data: encode(input.manifest) });
  if (input.characters.length > 0) {
    inline.push({ path: "characters.json", data: encode(input.characters) });
  }
  for (const scene of input.scenes) {
    inline.push({ path: `scenes/${scene.id}.json`, data: encode(scene) });
  }
  for (const c of input.captions) {
    inline.push({ path: `captions/${c.sceneId}.vtt`, data: text(c.vtt) });
  }

  for (const entry of inline) addInline(zip, entry.path, entry.data, checksums);

  for await (const { path } of input.assets.list()) {
    const data = await input.assets.get(path);
    if (!data) continue;
    if (!EXCLUDED_PATHS.has(path)) checksums[path] = sha256(data);
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    zip.addBuffer(buf, path);
  }

  addInline(zip, "checksums.json", encode(checksums), checksums);

  zip.end();
  return done;
}

function addInline(
  zip: yazl.ZipFile,
  path: string,
  data: Uint8Array,
  checksums: Record<string, string>
): void {
  if (!EXCLUDED_PATHS.has(path)) checksums[path] = sha256(data);
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  zip.addBuffer(buf, path);
}

function encode(v: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(v, null, 2));
}
function text(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/**
 * Read a `.svmp` buffer back into structured form. Validates format_version
 * and recomputes every checksum; throws if any entry is corrupt.
 */
export async function readBundle(buf: Uint8Array): Promise<ParsedBundle> {
  const zip = await yauzl.fromBuffer(
    Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)
  );
  const entries = await zip.readEntries();

  const files = new Map<string, Uint8Array>();
  for (const entry of entries) {
    const stream = await entry.openReadStream();
    const parts: Buffer[] = [];
    for await (const chunk of stream as NodeJS.ReadableStream) {
      parts.push(Buffer.from(chunk as Uint8Array));
    }
    files.set(entry.fileName, new Uint8Array(Buffer.concat(parts)));
  }
  await zip.close();

  const manifest = parseJson(files.get("manifest.json")) as BundleManifest;
  if (manifest.format_version !== FORMAT_VERSION) {
    throw new Error(`Unsupported bundle format_version: ${manifest.format_version}`);
  }

  const characters = (files.has("characters.json")
    ? (parseJson(files.get("characters.json")!) as CharacterBible[])
    : []
  ).map((c) => characterBibleSchema.parse(c));

  const scenes: SceneManifest[] = [];
  for (const [path, data] of files) {
    if (path.startsWith("scenes/") && path.endsWith(".json")) {
      scenes.push(sceneManifestSchema.parse(parseJson(data)));
    }
  }
  scenes.sort((a, b) => a.order - b.order);

  const storedChecksums = files.has("checksums.json")
    ? (parseJson(files.get("checksums.json")!) as Record<string, string>)
    : {};

  for (const [path, data] of files) {
    if (EXCLUDED_PATHS.has(path)) continue;
    if (!(path in storedChecksums)) {
      throw new Error(`Bundle entry ${path} has no checksum`);
    }
    const recomputed = sha256(data);
    if (recomputed !== storedChecksums[path]) {
      throw new Error(`Checksum mismatch for ${path}`);
    }
  }

  return { manifest, characters, scenes, checksums: storedChecksums, files };
}

function parseJson(data: Uint8Array | undefined): unknown {
  if (!data) throw new Error(`Missing json entry`);
  return JSON.parse(new TextDecoder().decode(data));
}
