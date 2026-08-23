import { NextResponse, type NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { createStoryRequestSchema } from "@storyframe/schemas";
import { ANALYSIS_JOB } from "@storyframe/pipeline";
import { scenes, stories } from "@storyframe/schemas/db";
import { getDb } from "@/lib/db";
import { getQueue } from "@/lib/queue";

export async function GET(): Promise<NextResponse> {
  const db = getDb();
  const rows = await db
    .select({
      id: stories.id,
      title: stories.title,
      status: stories.status,
      visual_skipped: stories.visual_skipped,
      voice_skipped: stories.voice_skipped,
      created_at: stories.created_at,
    })
    .from(stories)
    .orderBy(desc(stories.created_at));

  // Attach a thumbnail URL: the first scene's illustration, if any. Drizzle-orm
  // `eq()` takes one value, so for MVP library sizes we issue a small lookup per
  // story (the per-row scene jsonb is cheap — no join needed).
  const thumbs = new Map<string, string>();
  for (const r of rows) {
    const first = await db
      .select({ data: scenes.data })
      .from(scenes)
      .where(eq(scenes.story_id, r.id))
      .orderBy(scenes.order)
      .limit(1);
    const data = first[0]?.data as { image?: { key?: string; url?: string } | null } | undefined;
    if (data?.image?.url) thumbs.set(r.id, data.image.url);
  }

  return NextResponse.json({
    stories: rows.map((r) => ({
      ...r,
      thumb: thumbs.get(r.id) ?? null,
    })),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createStoryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const db = getDb();
  const [story] = await db
    .insert(stories)
    .values({
      title: parsed.data.title?.trim() || "Untitled story",
      source_text: parsed.data.text,
      source_url: parsed.data.sourceUrl || null,
    })
    .returning({ id: stories.id });

  await getQueue().add(ANALYSIS_JOB, { storyId: story.id });

  return NextResponse.json({ storyId: story.id }, { status: 201 });
}