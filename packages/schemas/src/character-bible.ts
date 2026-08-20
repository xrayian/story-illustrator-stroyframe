import { z } from "zod";

/**
 * Sentinel value for demographic fields the text gives no explicit evidence
 * for. Never replace this with a guess — hard rule, see AGENTS.md.
 */
export const UNSPECIFIED = "unspecified";

export const characterBibleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  apparent_age_range: z.string(),
  gender_expression: z.string(),
  /** Only set when the text explicitly states or clearly implies it. */
  ethnicity_or_culture_cues: z.string(),
  physical_description: z.string(),
  personality_traits: z.array(z.string()),
  /** ElevenLabs voice id, set after the Phase 3 casting step. */
  voice_id: z.string().nullable(),
  /** Locked reference portrait, set after the Phase 4 visual step. */
  reference_image_url: z.string().nullable(),
  /** Frozen identity prompt used for both voice design and image gen. */
  locked_identity_prompt: z.string(),
  version: z.number().int().nonnegative(),
});
export type CharacterBible = z.infer<typeof characterBibleSchema>;

export const characterBibleJsonSchema = z.toJSONSchema(characterBibleSchema, {
  target: "draft-2020-12",
});