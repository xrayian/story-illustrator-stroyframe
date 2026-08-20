import { z } from "zod";

/** POST /api/stories body. rightsAccepted must be true — the one-time copyright notice. */
export const createStoryRequestSchema = z.object({
  text: z.string().min(1, "Paste the story text first"),
  title: z.string().optional(),
  sourceUrl: z.string().url().optional().or(z.literal("")),
  rightsAccepted: z.literal(true, {
    error: "You must acknowledge the copyright notice to continue",
  }),
});
export type CreateStoryRequest = z.infer<typeof createStoryRequestSchema>;

/** Editable CharacterBible fields sent by the cast review screen. */
export const castEditSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  apparent_age_range: z.string().optional(),
  gender_expression: z.string().optional(),
  ethnicity_or_culture_cues: z.string().optional(),
  physical_description: z.string().optional(),
  personality_traits: z.array(z.string()).optional(),
});
export type CastEdit = z.infer<typeof castEditSchema>;

/** POST /api/stories/[id]/cast/approve body: edits for every character. */
export const approveCastRequestSchema = z.object({
  characters: z
    .array(
      z.object({
        characterId: z.string().min(1),
        edits: castEditSchema,
      })
    )
    .min(1),
});
export type ApproveCastRequest = z.infer<typeof approveCastRequestSchema>;