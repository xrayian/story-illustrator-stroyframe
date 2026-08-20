import { and, eq } from "drizzle-orm";
import type { CharacterBible } from "@storyframe/schemas";
import { assets, characters, type Db } from "@storyframe/schemas/db";
import { storyAssetKey, type R2Client } from "@storyframe/storage";

/** R2 key for a designed voice preview for a character. */
export function voicePreviewKey(
  storyId: string,
  characterId: string,
  index: number
): string {
  return storyAssetKey(storyId, "voice_previews", characterId, `${index}.mp3`);
}

export async function loadCharacterBible(
  db: Db,
  storyId: string,
  characterId: string
): Promise<CharacterBible> {
  const [row] = await db
    .select({ bible: characters.bible })
    .from(characters)
    .where(
      and(
        eq(characters.story_id, storyId),
        eq(characters.character_id, characterId)
      )
    );
  if (!row) {
    throw new Error(`Character ${characterId} not found for this story`);
  }
  return row.bible as CharacterBible;
}

/** Removes a character's previous previews (R2 objects + asset rows). */
export async function clearCharacterPreviews(
  db: Db,
  r2: R2Client,
  storyId: string,
  characterId: string
): Promise<void> {
  const rows = await db
    .select()
    .from(assets)
    .where(and(eq(assets.story_id, storyId), eq(assets.kind, "audio")));

  const stale = rows.filter((row) => {
    const meta = row.meta as { purpose?: string; characterId?: string } | null;
    return meta?.purpose === "voice_preview" && meta.characterId === characterId;
  });

  for (const row of stale) {
    await r2.remove(row.r2_key).catch(() => {});
    await db.delete(assets).where(eq(assets.id, row.id));
  }
}