import { z } from "zod";

/**
 * Per-scene payload stored in the .svmp bundle (scenes/scene_XXX.json).
 * The .svmp bundle is the downstream consumer of this shape.
 */
export const sceneManifestSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().nonnegative(),
  setting: z.string().min(1),
  time_of_day: z.string(),
  mood: z.string(),
  is_key_scene: z.boolean(),
  characters_present: z.array(z.string()),
  /** Illustrated image asset (set during the Phase 4 visual step). */
  image: z
    .object({
      key: z.string().min(1),
      url: z.string().min(1),
    })
    .nullable(),
  /** StoryLine ids belonging to this scene, in order. */
  line_refs: z.array(z.string()),
});
export type SceneManifest = z.infer<typeof sceneManifestSchema>;

export const sceneManifestJsonSchema = z.toJSONSchema(sceneManifestSchema, {
  target: "draft-2020-12",
});