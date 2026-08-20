import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { assertCastApproved } from "@storyframe/pipeline";
import { stories } from "@storyframe/schemas/db";
import { getDb } from "@/lib/db";

/**
 * Phase 4 (optional visuals): marks the story as visuals-skipped and moves it
 * to ready, or un-skips it back to cast_review. Image generation is a paid
 * feature — this lets a story proceed without image billing.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/stories/[id]/visuals/skip">
): Promise<NextResponse> {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const skip =
    typeof body === "object" && body !== null && typeof (body as { skip?: unknown }).skip === "boolean"
      ? (body as { skip: boolean }).skip
      : true;

  const db = getDb();
  await assertCastApproved(db, id);

  const [story] = await db
    .select({ status: stories.status })
    .from(stories)
    .where(eq(stories.id, id));
  if (story?.status === "visual_generation") {
    return NextResponse.json(
      { error: "Visual generation is already in progress" },
      { status: 409 }
    );
  }

  await db
    .update(stories)
    .set({
      visual_skipped: skip,
      status: skip ? "ready" : "cast_review",
      updated_at: new Date(),
    })
    .where(eq(stories.id, id));

  return NextResponse.json({ ok: true, visual_skipped: skip });
}