import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { assertCastApproved } from "@storyframe/pipeline";
import { stories } from "@storyframe/schemas/db";
import { getDb } from "@/lib/db";

/**
 * Phase 3 (optional voice): marks the story as narrate-skipped and moves it
 * to ready, or un-skips it back to cast_review. Voice integration is optional —
 * this lets a story proceed without a paid ElevenLabs plan.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/stories/[id]/voice/skip">
): Promise<NextResponse> {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const skip = typeof body === "object" && body !== null && typeof (body as { skip?: unknown }).skip === "boolean"
    ? (body as { skip: boolean }).skip
    : true;

  const db = getDb();
  await assertCastApproved(db, id);

  const [story] = await db
    .select({ status: stories.status })
    .from(stories)
    .where(eq(stories.id, id));
  if (story?.status === "voice_generation") {
    return NextResponse.json(
      { error: "Narration is already in progress" },
      { status: 409 }
    );
  }

  const skipValue = skip;
  await db
    .update(stories)
    .set({
      voice_skipped: skipValue,
      status: skipValue ? "ready" : "cast_review",
      failed_stage: null,
      updated_at: new Date(),
    })
    .where(eq(stories.id, id));

  return NextResponse.json({ ok: true, voice_skipped: skipValue });
}