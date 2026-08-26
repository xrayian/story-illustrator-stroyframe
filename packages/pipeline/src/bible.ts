import {
  UNSPECIFIED,
  type Character,
  type CharacterBible,
} from "@storyframe/schemas";

/**
 * Phase 2: derives a CharacterBible from a StoryManifest character.
 * Uses the demographic fields inferred by the analysis; falls back to
 * UNSPECIFIED/empty only when the manifest field is blank or missing.
 */
export function deriveBible(character: Character): CharacterBible {
  return {
    id: character.id,
    name: character.name,
    role: character.role,
    apparent_age_range: character.apparent_age_range?.trim() || UNSPECIFIED,
    gender_expression: character.gender_expression?.trim() || UNSPECIFIED,
    ethnicity_or_culture_cues: character.ethnicity_or_culture_cues?.trim() || UNSPECIFIED,
    physical_description: character.physical_description?.trim() || "",
    personality_traits: character.personality_traits ?? [],
    voice_id: null,
    reference_image_url: null,
    locked_identity_prompt: "",
    version: 1,
  };
}

/**
 * Builds the frozen identity prompt used by both voice design and image
 * generation. Only fields with actual content (not UNSPECIFIED/empty)
 * are included. Called at cast-approval time; the result is stored in
 * locked_identity_prompt and version-bumped on later edits.
 */
export function buildIdentityPrompt(bible: CharacterBible): string {
  const bits: string[] = [];
  if (bible.name) bits.push(`Name: ${bible.name}`);
  if (bible.role) bits.push(`Role: ${bible.role}`);
  if (bible.apparent_age_range !== UNSPECIFIED) {
    bits.push(`Apparent age: ${bible.apparent_age_range}`);
  }
  if (bible.gender_expression !== UNSPECIFIED) {
    bits.push(`Gender expression: ${bible.gender_expression}`);
  }
  if (bible.ethnicity_or_culture_cues !== UNSPECIFIED) {
    bits.push(`Ethnicity/culture cues: ${bible.ethnicity_or_culture_cues}`);
  }
  if (bible.physical_description) {
    bits.push(`Physical description: ${bible.physical_description}`);
  }
  if (bible.personality_traits.length > 0) {
    bits.push(`Personality: ${bible.personality_traits.join(", ")}`);
  }
  return bits.join("; ");
}