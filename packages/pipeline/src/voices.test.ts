import { describe, expect, it } from "vitest";
import { NARRATOR_ID, UNSPECIFIED, type CharacterBible } from "@storyframe/schemas";
import { buildVoiceDescription, narratorBible } from "./voices";

function bible(overrides: Partial<CharacterBible>): CharacterBible {
  return {
    id: "char_1",
    name: "Test",
    role: "Protagonist",
    apparent_age_range: UNSPECIFIED,
    gender_expression: UNSPECIFIED,
    ethnicity_or_culture_cues: UNSPECIFIED,
    physical_description: "",
    personality_traits: [],
    voice_id: null,
    reference_image_url: null,
    locked_identity_prompt: "",
    version: 1,
    ...overrides,
  };
}

describe("buildVoiceDescription", () => {
  it("produces a 20-1000 char description for a sparse bible", () => {
    const desc = buildVoiceDescription(bible({}));
    expect(desc.length).toBeGreaterThanOrEqual(20);
    expect(desc.length).toBeLessThanOrEqual(1000);
  });

  it("uses only fields the story gave evidence for", () => {
    const desc = buildVoiceDescription(
      bible({ apparent_age_range: "late fifties", personality_traits: ["quiet", "gentle"] })
    );
    expect(desc).toContain("late fifties");
    expect(desc).toContain("quiet");
    expect(desc).toContain("gentle");
    expect(desc).not.toContain("unspecified");
  });

  it("never leaks an unspecified demographic as a guess", () => {
    const desc = buildVoiceDescription(bible({ physical_description: "tall and gaunt" }));
    expect(desc).not.toContain("unspecified");
    expect(desc).not.toContain("gender");
  });

  it("truncates over-long descriptions to the 1000 char cap", () => {
    const desc = buildVoiceDescription(
      bible({
        apparent_age_range: "ancient",
        gender_expression: "unspecified",
        physical_description: "x".repeat(2000),
        personality_traits: ["a", "b", "c", "d"],
      })
    );
    expect(desc.length).toBeLessThanOrEqual(1000);
  });
});

describe("narratorBible", () => {
  it("is a valid CharacterBible with narrator identity", () => {
    const bibleRow = narratorBible();
    expect(bibleRow.id).toBe(NARRATOR_ID);
    expect(bibleRow.name).toBe("Narrator");
    expect(bibleRow.voice_id).toBeNull();
    expect(bibleRow.version).toBe(1);
  });
});