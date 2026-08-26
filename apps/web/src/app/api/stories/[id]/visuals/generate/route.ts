import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { assertCastApproved, IMAGE_GENERATION_JOB } from "@storyframe/pipeline";
import { stories } from "@storyframe/schemas/db";
import { getDb } from "@/lib/db";
import { getQueue } from "@/lib/queue";

/**
 * Phase 4: enqueues the image job (reference portraits + scene illustrations)
 * for an approved story whose voice stage is done or skipped. 409 if already
 * running. Image generation is paid — quota/safety errors surface on the story.
 */
export async function POST(
  _request: NextRequest,
  ctx: RouteContext<"/api/stories/[id]/visuals/generate">
): Promise<NextResponse> {
  const { id } = await ctx.params;

  const db = getDb();
  await assertCastApproved(db, id);

  const [story] = await db
    .select({ status: stories.status, voice_skipped: stories.voice_skipped })
    .from(stories)
    .where(eq(stories.id, id));
  if (!story) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }
  if (story.status === "visual_generation") {
    return NextResponse.json(
      { error: "Visual generation is already in progress" },
      { status: 409 }
    );
  }

  const voiceComplete = story.voice_skipped || story.status === "ready";
  if (!voiceComplete) {
    return NextResponse.json(
      { error: "Finish (or skip) the voice stage before generating visuals" },
      { status: 409 }
    );
  }

  await db
    .update(stories)
    .set({ status: "visual_generation", visual_skipped: false, failed_stage: null, updated_at: new Date() })
    .where(eq(stories.id, id));

  await getQueue().add(IMAGE_GENERATION_JOB, { storyId: id });

  return NextResponse.json({ ok: true });
}