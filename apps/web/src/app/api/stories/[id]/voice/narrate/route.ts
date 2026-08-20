import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { assertCastApproved, VOICE_TTS_JOB } from "@storyframe/pipeline";
import { ensureNarratorRow, speakersMissingVoices } from "@storyframe/pipeline";
import { stories } from "@storyframe/schemas/db";
import { getDb } from "@/lib/db";
import { getQueue } from "@/lib/queue";

/**
 * Phase 3: enqueues the narration job for a fully-cast, approved story.
 * Rejects if voices are still missing; 409 if narration is already running.
 */
export async function POST(
  _request: NextRequest,
  ctx: RouteContext<"/api/stories/[id]/voice/narrate">
): Promise<NextResponse> {
  const { id } = await ctx.params;

  const db = getDb();
  await assertCastApproved(db, id);
  await ensureNarratorRow(db, id);

  const missing = await speakersMissingVoices(db, id);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Voices not cast for: ${missing.join(", ")}` },
      { status: 409 }
    );
  }

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

  await db
    .update(stories)
    .set({ status: "voice_generation", updated_at: new Date() })
    .where(eq(stories.id, id));

  await getQueue().add(VOICE_TTS_JOB, { storyId: id });

  return NextResponse.json({ ok: true });
}