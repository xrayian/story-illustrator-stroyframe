import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { ANALYSIS_JOB } from "@storyframe/pipeline";
import { stories } from "@storyframe/schemas/db";
import { getDb } from "@/lib/db";
import { getQueue } from "@/lib/queue";

export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/stories/[id]/analyze">
): Promise<NextResponse> {
  const { id } = await ctx.params;

  const db = getDb();
  const [story] = await db
    .select({ id: stories.id })
    .from(stories)
    .where(eq(stories.id, id));
  if (!story) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }

  await getQueue().add(ANALYSIS_JOB, { storyId: story.id });
  return NextResponse.json({ ok: true });
}