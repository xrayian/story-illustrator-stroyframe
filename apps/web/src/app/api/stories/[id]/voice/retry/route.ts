import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { stories } from "@storyframe/schemas/db";
import { getDb } from "@/lib/db";

/**
 * Resets a failed story back to cast_review so the user can re-trigger
 * narration from the VoiceDirector. Only valid when the story is in
 * "failed" status with failed_stage === "voice".
 */
export async function POST(
  _request: NextRequest,
  ctx: RouteContext<"/api/stories/[id]/voice/retry">
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const db = getDb();

  const [story] = await db
    .select({ status: stories.status, failed_stage: stories.failed_stage })
    .from(stories)
    .where(eq(stories.id, id));

  if (!story) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }
  if (story.status !== "failed") {
    return NextResponse.json(
      { error: "Story is not in a failed state" },
      { status: 409 }
    );
  }

  await db
    .update(stories)
    .set({
      status: "cast_review",
      failed_stage: null,
      updated_at: new Date(),
    })
    .where(eq(stories.id, id));

  return NextResponse.json({ ok: true });
}
