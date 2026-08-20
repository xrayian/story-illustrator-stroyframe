import { eq } from "drizzle-orm";
import type { Db } from "@storyframe/schemas/db";
import { characters } from "@storyframe/schemas/db";

/**
 * Phase 2 hard gate: no paid voice/image generation call may fire until
 * every character's bible has been explicitly approved through the cast
 * review screen. Throws otherwise (AGENTS.md: non-negotiable).
 */
export async function assertCastApproved(db: Db, storyId: string): Promise<void> {
  const rows = await db
    .select({ approved_at: characters.approved_at })
    .from(characters)
    .where(eq(characters.story_id, storyId));

  if (rows.length === 0) {
    throw new Error(`Story ${storyId} has no characters — cast gate cannot pass`);
  }
  const pending = rows.filter((row) => !row.approved_at).length;
  if (pending > 0) {
    throw new Error(
      `Story ${storyId} cast is not approved: ${pending} character(s) still pending review`
    );
  }
}