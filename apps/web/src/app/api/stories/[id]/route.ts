import { NextResponse, type NextRequest } from "next/server";
import { count, eq } from "drizzle-orm";
import { storyManifestSchema, type CharacterBible } from "@storyframe/schemas";
import { stories, characters, scenes } from "@storyframe/schemas/db";
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
    characters: characterRows.map((row) => ({
      characterId: row.character_id,
      name: row.name,
      role: row.role,
      bible: row.bible as CharacterBible,
      version: row.version,
      approved: row.approved_at !== null,
    })),
    sceneCount: sceneCountRow?.count ?? 0,
    manifest,
  });
}