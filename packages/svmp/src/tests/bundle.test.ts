import { describe, it, expect } from "vitest";
import { writeBundle, readBundle, FORMAT_VERSION, type BundleInput, type AssetProvider } from "../bundle";
import type { CharacterBible, SceneManifest } from "@storyframe/schemas";
import { sceneToVtt, parseLineTimestamps, formatVttTime } from "../captions";
import { sha256 } from "../checksums";

describe("formatVttTime", () => {
  it("formats zero", () => {
    expect(formatVttTime(0)).toBe("00:00:00.000");
  });
  it("formats hours/minutes/seconds/millis", () => {
    expect(formatVttTime(3661.5)).toBe("01:01:01.500");
  });
  it("clamps negative to zero", () => {
    expect(formatVttTime(-2)).toBe("00:00:00.000");
  });
});

describe("sha256", () => {
  it("produces a 64-char hex digest", () => {
    expect(sha256(new TextEncoder().encode("hello")).length).toBe(64);
  });
  it("is deterministic", () => {
    expect(sha256(new TextEncoder().encode("hello"))).toBe(
      sha256(new TextEncoder().encode("hello"))
    );
  });
});

describe("parseLineTimestamps", () => {
  it("validates required fields", () => {
    const ts = parseLineTimestamps({
      lineId: "line_0001",
      speakerId: "narrator",
      text: "hi",
      characters: ["h", "i"],
      startTimes: [0, 0.1],
      endTimes: [0.1, 0.2],
    });
    expect(ts.lineId).toBe("line_0001");
    expect(ts.characters).toEqual(["h", "i"]);
  });
  it("throws on missing lineId", () => {
    expect(() => parseLineTimestamps({ speakerId: "narrator", text: "x", characters: [], startTimes: [], endTimes: [] })).toThrow();
  });
});

describe("sceneToVtt", () => {
  it("emits a WEBVTT header and one cue per word chunk", () => {
    const lines = [
      parseLineTimestamps({
        lineId: "line_0001",
        speakerId: "narrator",
        text: "Hello world",
        characters: ["Hello ", "world"],
        startTimes: [0, 0.5],
        endTimes: [0.5, 1.0],
      }),
    ];
    const cue = sceneToVtt("scene_001", lines, 0);
    expect(cue.vtt.startsWith("WEBVTT")).toBe(true);
    expect(cue.vtt).toContain("[narrator] Hello ");
    expect(cue.vtt).toContain("[narrator] world");
    expect(cue.vtt).toContain("-->");
    expect(cue.duration).toBeCloseTo(1.0, 5);
  });

  it("applies the bundle-wide offset to every cue", () => {
    const lines = [
      parseLineTimestamps({
        lineId: "line_0001",
        speakerId: "narrator",
        text: "ok",
        characters: ["ok"],
        startTimes: [0],
        endTimes: [0.4],
      }),
    ];
    const cue = sceneToVtt("scene_002", lines, 10);
    expect(cue.vtt).toContain("00:00:10.000 --> 00:00:10.400");
  });
});

describe("writeBundle / readBundle round trip", () => {
  it("writes and re-reads an identical manifest", async () => {
    const characters: CharacterBible[] = [
      {
        id: "char_1",
        name: "Mae",
        role: "protagonist",
        apparent_age_range: "30s",
        gender_expression: "female",
        ethnicity_or_culture_cues: "unspecified",
        physical_description: "tall",
        personality_traits: ["brave"],
        voice_id: "v1",
        reference_image_url: "images/characters/char_1.jpg",
        locked_identity_prompt: "tall brave woman",
        version: 1,
      },
    ];
    const scenes: SceneManifest[] = [
      {
        id: "scene_001",
        order: 0,
        setting: "a market",
        time_of_day: "dusk",
        mood: "tense",
        is_key_scene: true,
        characters_present: ["char_1"],
        image: { key: "stories/x/images/scene_001/illustration.jpg", url: "/api/stories/x/visuals/asset/images/scene_001/illustration.jpg" },
        line_refs: ["line_0001"],
      },
    ];
    const imageBytes = new TextEncoder().encode("fake-jpeg-bytes");
    const audioBytes = new TextEncoder().encode("fake-mp3-bytes");
    const tsBytes = new TextEncoder().encode(
      JSON.stringify({
        lineId: "line_0001",
        speakerId: "narrator",
        text: "ok",
        characters: ["ok"],
        startTimes: [0],
        endTimes: [0.4],
      })
    );
    const vtt = sceneToVtt("scene_001", [parseLineTimestamps(JSON.parse(new TextDecoder().decode(tsBytes)))], 0).vtt;

    const assets: AssetProvider = {
      async *list() {
        yield { path: "images/characters/char_1.jpg" };
        yield { path: "images/scene_001/illustration.jpg" };
        yield { path: "audio/scene_001/line_0001.mp3" };
        yield { path: "audio/scene_001/line_0001.timestamps.json" };
      },
      async get(path) {
        const map: Record<string, Uint8Array> = {
          "images/characters/char_1.jpg": imageBytes,
          "images/scene_001/illustration.jpg": imageBytes,
          "audio/scene_001/line_0001.mp3": audioBytes,
          "audio/scene_001/line_0001.timestamps.json": tsBytes,
        };
        return map[path] ?? null;
      },
    };

    const input: BundleInput = {
      manifest: {
        format_version: FORMAT_VERSION,
        title: "Test Story",
        engine: { voice_engine: "elevenlabs", image_engine: "pollinations" },
        counts: { characters: 1, scenes: 1, lines: 1 },
        duration_seconds: 0.4,
        voice_skipped: false,
        visual_skipped: false,
        created_at: "2026-08-21T00:00:00.000Z",
      },
      characters,
      scenes,
      captions: [{ sceneId: "scene_001", vtt }],
      assets,
    };

    const buf = await writeBundle(input);
    expect(buf.byteLength).toBeGreaterThan(0);

    const parsed = await readBundle(buf);
    expect(parsed.manifest.format_version).toBe(FORMAT_VERSION);
    expect(parsed.manifest.title).toBe("Test Story");
    expect(parsed.characters).toEqual(characters);
    expect(parsed.scenes).toEqual(scenes);
    expect(parsed.files.has("images/characters/char_1.jpg")).toBe(true);
    expect(parsed.files.has("audio/scene_001/line_0001.mp3")).toBe(true);
    expect(parsed.checksums["images/characters/char_1.jpg"]).toBe(sha256(imageBytes));
    expect(parsed.checksums["manifest.json"]).toBeUndefined();
    expect(parsed.checksums["checksums.json"]).toBeUndefined();
  });

  it("supports a voice-skipped bundle with no audio or captions", async () => {
    const assets: AssetProvider = {
      async *list() {
        yield { path: "images/characters/char_1.jpg" };
      },
      async get(p) {
        return p === "images/characters/char_1.jpg"
          ? new TextEncoder().encode("img")
          : null;
      },
    };
    const buf = await writeBundle({
      manifest: {
        format_version: FORMAT_VERSION,
        title: "Silent",
        engine: { voice_engine: null, image_engine: "pollinations" },
        counts: { characters: 1, scenes: 1, lines: 1 },
        duration_seconds: 0,
        voice_skipped: true,
        visual_skipped: false,
        created_at: "2026-08-21T00:00:00.000Z",
      },
      characters: [],
      scenes: [],
      captions: [],
      assets,
    });
    const parsed = await readBundle(buf);
    expect(parsed.manifest.voice_skipped).toBe(true);
    expect(parsed.files.has("audio/scene_001/line_0001.mp3")).toBe(false);
  });
});
