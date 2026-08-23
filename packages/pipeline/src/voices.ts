import { and, eq } from "drizzle-orm";
import {
  NARRATOR_ID,
  UNSPECIFIED,
  characterBibleSchema,
  type CharacterBible,
} from "@storyframe/schemas";
import type { Db } from "@storyframe/schemas/db";
import { characters } from "@storyframe/schemas/db";

/** ElevenLabs Voice Design model (init.md: Voice Design v3). */
export const VOICE_DESIGN_MODEL = "eleven_ttv_v3";
/** Default TTS model: cheap flash tier for draft passes. Premium v3 wired in Phase 8. */
export const TTS_MODEL = "eleven_flash_v2_5";

/**
 * Phase 3: turns a locked CharacterBible into the 20-1000 char natural-language
 * description for POST /v1/text-to-voice/design. Only known fields are used;
 * unspecified demographics never leak into the description as guesses.
 */
export function buildVoiceDescription(bible: CharacterBible): string {
  const bits: string[] = [];
  if (bible.apparent_age_range !== UNSPECIFIED) bits.push(`around ${bible.apparent_age_range} years old`);
  if (bible.gender_expression !== UNSPECIFIED) bits.push(bible.gender_expression);
  if (bible.ethnicity_or_culture_cues !== UNSPECIFIED) bits.push(bible.ethnicity_or_culture_cues);
  if (bible.physical_description) bits.push(bible.physical_description);
  if (bible.personality_traits.length > 0) {
    bits.push(`with a ${bible.personality_traits.join(", ")} personality`);
  }

  let desc: string;
  if (bits.length === 0) {
    desc = "A warm, natural speaking voice with clear diction and a steady, unhurried pace.";
  } else {
    desc = `A voice that sounds ${bits.join(", ")}. Natural, expressive speech with clear diction and a pace that fits the personality.`;
  }
  if (desc.length > 1000) desc = `${desc.slice(0, 997)}...`;
  return desc;
}

/** Bible for the narrator pseudo-character (same voice-design flow, not user-cast). */
export function narratorBible(): CharacterBible {
  return characterBibleSchema.parse({
    id: NARRATOR_ID,
    name: "Narrator",
    role: "Narrator",
    apparent_age_range: UNSPECIFIED,
    gender_expression: UNSPECIFIED,
    ethnicity_or_culture_cues: UNSPECIFIED,
    physical_description: "",
    personality_traits: [],
    voice_id: null,
    reference_image_url: null,
    locked_identity_prompt: "A calm, clear, expressive storyteller's voice for the narration.",
    version: 1,
  });
}

/**
 * Creates the narrator row on demand (post-approval). It is marked approved
 * at creation: it is pipeline-internal, not part of the user cast review, so
 * the Phase 2 gate must not block on it.
 */
export async function ensureNarratorRow(db: Db, storyId: string): Promise<void> {
  const [existing] = await db
    .select({ id: characters.id })
    .from(characters)
    .where(
      and(eq(characters.story_id, storyId), eq(characters.character_id, NARRATOR_ID))
    );
  if (existing) return;

  const bible = narratorBible();
  await db.insert(characters).values({
    story_id: storyId,
    character_id: NARRATOR_ID,
    name: bible.name,
    role: bible.role,
    bible,
    version: 1,
    approved_at: new Date(),
  });
}

/**
 * Speakers (character ids incl. narrator) whose bible has no voice_id yet.
 * Callers surface this before enqueueing narration. Narrator row must exist
 * (call ensureNarratorRow first).
 */
export async function speakersMissingVoices(db: Db, storyId: string): Promise<string[]> {
  const rows = await db
    .select({ character_id: characters.character_id, bible: characters.bible })
    .from(characters)
    .where(eq(characters.story_id, storyId));

  return rows
    .filter((row) => {
      const bible = row.bible as CharacterBible;
      return !bible.voice_id;
    })
    .map((row) => row.character_id);
}