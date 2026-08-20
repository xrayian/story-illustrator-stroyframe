import { describe, expect, it } from "vitest";
import {
  characterBibleSchema,
  storyManifestSchema,
  storyManifestJsonSchema,
  NARRATOR_ID,
  type StoryManifest,
} from "../index";

const sampleManifest: StoryManifest = {
  title: "The Lighthouse Keeper",
  characters: [
    { id: "char_1", name: "Elena", aliases: ["El"], role: "protagonist" },
    { id: "char_2", name: "Marta", aliases: [], role: "supporting" },
  ],
  scenes: [
    {
      id: "scene_001",
      order: 0,
      setting: "A stone lighthouse at the edge of a cliff",
      time_of_day: "dusk",
      mood: "lonely",
      is_key_scene: true,
      characters_present: ["char_1"],
      lines: [
        { id: "line_0001", speaker_id: NARRATOR_ID, text: "The sea was restless." },
        { id: "line_0002", speaker_id: "char_1", text: "Marta, is that you?", emotion_tag: "hopeful" },
      ],
    },
  ],
};

describe("storyManifestSchema", () => {
  it("parses a valid manifest", () => {
    const parsed = storyManifestSchema.parse(sampleManifest);
    expect(parsed.title).toBe("The Lighthouse Keeper");
    expect(parsed.scenes[0].lines[1].speaker_id).toBe("char_1");
  });

  it("round-trips through JSON losslessly", () => {
    const json = JSON.stringify(sampleManifest);
    const reparsed = storyManifestSchema.parse(JSON.parse(json));
    expect(reparsed).toEqual(sampleManifest);
  });

  it("rejects a manifest with no characters", () => {
    const bad = { ...sampleManifest, characters: [] };
    expect(() => storyManifestSchema.parse(bad)).toThrow();
  });

  it("rejects a scene with a negative order", () => {
    const bad = {
      ...sampleManifest,
      scenes: [{ ...sampleManifest.scenes[0], order: -1 }],
    };
    expect(() => storyManifestSchema.parse(bad)).toThrow();
  });

  it("rejects an empty line text", () => {
    const bad = {
      ...sampleManifest,
      scenes: [
        {
          ...sampleManifest.scenes[0],
          lines: [{ id: "line_x", speaker_id: NARRATOR_ID, text: "" }],
        },
      ],
    };
    expect(() => storyManifestSchema.parse(bad)).toThrow();
  });
});

describe("storyManifestJsonSchema", () => {
  it("is a draft-2020-12 object schema", () => {
    expect(storyManifestJsonSchema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(storyManifestJsonSchema.type).toBe("object");
    expect(storyManifestJsonSchema.required).toContain("characters");
    expect(storyManifestJsonSchema.required).toContain("scenes");
  });
});

describe("characterBibleSchema", () => {
  it("accepts unspecified demographic fields as strings", () => {
    const bible = {
      id: "char_1",
      name: "Elena",
      role: "protagonist",
      apparent_age_range: "30s",
      gender_expression: "female",
      ethnicity_or_culture_cues: "unspecified",
      physical_description: "tall, dark hair",
      personality_traits: ["determined", "quiet"],
      voice_id: null,
      reference_image_url: null,
      locked_identity_prompt: "Elena is...",
      version: 1,
    };
    expect(() => characterBibleSchema.parse(bible)).not.toThrow();
  });
});