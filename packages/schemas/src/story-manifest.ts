import { z } from "zod";

/** Speaker id used for narration lines (any line not attributed to a character). */
export const NARRATOR_ID = "narrator";

export const characterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string().min(1)).default([]),
  role: z.string().min(1),
  /** Inferred from context — leave blank if zero signal. */
  apparent_age_range: z.string().optional().default(""),
  /** Inferred from context — leave blank if zero signal. */
  gender_expression: z.string().optional().default(""),
  /** Inferred from context — leave blank if zero signal. */
  ethnicity_or_culture_cues: z.string().optional().default(""),
  /** Inferred from context — leave blank if zero signal. */
  physical_description: z.string().optional().default(""),
  /** Inferred from context — leave blank if zero signal. */
  personality_traits: z.array(z.string()).optional().default([]),
});
export type Character = z.infer<typeof characterSchema>;

export const lineSchema = z.object({
  id: z.string().min(1),
  /** Character id from the same manifest, or NARRATOR_ID. */
  speaker_id: z.string().min(1),
  text: z.string().min(1),
  emotion_tag: z.string().optional(),
});
export type StoryLine = z.infer<typeof lineSchema>;

export const sceneSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().nonnegative(),
  setting: z.string().min(1),
  time_of_day: z.string(),
  mood: z.string(),
  /** Drives the illustration budget: true = worth illustrating. */
  is_key_scene: z.boolean(),
  /** Character ids present in this scene. */
  characters_present: z.array(z.string()),
  lines: z.array(lineSchema),
});
export type StoryScene = z.infer<typeof sceneSchema>;

export const storyManifestSchema = z.object({
  title: z.string().min(1),
  characters: z.array(characterSchema).min(1),
  scenes: z.array(sceneSchema).min(1),
});
export type StoryManifest = z.infer<typeof storyManifestSchema>;

/** JSON Schema (draft 2020-12) for Gemini `response_format` structured output. */
export const storyManifestJsonSchema = z.toJSONSchema(storyManifestSchema, {
  target: "draft-2020-12",
});