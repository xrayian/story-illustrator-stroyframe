import { NextResponse, type NextRequest } from "next/server";
import { count, eq } from "drizzle-orm";
import { storyManifestSchema, type CharacterBible } from "@storyframe/schemas";
import { assets, characters, scenes, stories } from "@storyframe/schemas/db";
import { createR2, storyAssetKey } from "@storyframe/storage";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/stories/[id]">
): Promise<NextResponse> {
  const { id } = await ctx.params;

  const db = getDb();
  const [story] = await db
    .select({
      id: stories.id,
      title: stories.title,
      status: stories.status,
      source_url: stories.source_url,
      voice_skipped: stories.voice_skipped,
      visual_skipped: stories.visual_skipped,
      created_at: stories.created_at,
    })
    .from(stories)
    .where(eq(stories.id, id));

  if (!story) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }

  const characterRows = await db
    .select({
      character_id: characters.character_id,
      name: characters.name,
      role: characters.role,
      bible: characters.bible,
      version: characters.version,
      approved_at: characters.approved_at,
    })
    .from(characters)
    .where(eq(characters.story_id, id))
    .orderBy(characters.created_at);

  const [sceneCountRow] = await db
    .select({ count: count(scenes.id) })
    .from(scenes)
    .where(eq(scenes.story_id, id));

  const sceneRows = await db
    .select({ data: scenes.data })
    .from(scenes)
    .where(eq(scenes.story_id, id))
    .orderBy(scenes.order);

  const r2 = createR2(getEnv());
  let manifest: unknown = null;
  try {
    const raw = await r2.download(storyAssetKey(id, "manifest.json"));
    manifest = JSON.parse(new TextDecoder().decode(raw)) as unknown;
    manifest = storyManifestSchema.safeParse(manifest).success ? manifest : null;
  } catch {
    manifest = null;
  }

  return NextResponse.json({
    story,
    voice_enabled: Boolean(getEnv().ELEVENLABS_API_KEY),
    characters: characterRows.map((row) => ({
      characterId: row.character_id,
      name: row.name,
      role: row.role,
      bible: row.bible as CharacterBible,
      version: row.version,
      approved: row.approved_at !== null,
    })),
    sceneCount: sceneCountRow?.count ?? 0,
    scenes: sceneRows.map((row) => row.data as { id: string; image: unknown }),
    manifest,
  });
}

/**
 * Deletes a story: every R2 object under stories/<id>/ (the manifest plus all
 * audio, portrait, illustration, and timestamp assets), then the story row
 * (FK cascade removes characters, scenes, assets rows).
 */
export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/stories/[id]">
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const db = getDb();

  // Pull all asset r2_keys + the manifest key in one pass.
  const assetRows = await db
    .select({ r2_key: assets.r2_key })
    .from(assets)
    .where(eq(assets.story_id, id));
  const r2 = createR2(getEnv());
  const r2Keys = new Set<string>();
  r2Keys.add(storyAssetKey(id, "manifest.json"));
  for (const row of assetRows) if (row.r2_key.startsWith(`stories/${id}/`)) r2Keys.add(row.r2_key);

  // Best-effort R2 cleanup; cascade-deletes DB rows regardless.
  // Continue if some objects are already gone (R2 returns 404 on delete).
  await Promise.allSettled([...r2Keys].map((key) => r2.remove(key)));

  await db.delete(stories).where(eq(stories.id, id));

  return NextResponse.json({ ok: true });
}