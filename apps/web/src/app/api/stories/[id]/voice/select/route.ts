import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { selectVoiceRequestSchema, NARRATOR_ID } from "@storyframe/schemas";
import {
  assertCastApproved,
  buildVoiceDescription,
  createVoiceFromPreview,
} from "@storyframe/pipeline";
import { ensureNarratorRow } from "@storyframe/pipeline";
import { characters } from "@storyframe/schemas/db";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { loadCharacterBible } from "@/lib/voice";

/**
 * Phase 3: saves a chosen preview as a permanent ElevenLabs voice and stores
 * its voice_id on the character's bible. Paid call — gate must have fired.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/stories/[id]/voice/select">
): Promise<NextResponse> {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = selectVoiceRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const db = getDb();
  await assertCastApproved(db, id);

  const env = getEnv();
  const { characterId, generatedVoiceId } = parsed.data;

  try {
    if (characterId === NARRATOR_ID) {
      await ensureNarratorRow(db, id);
    }

    const bible = await loadCharacterBible(db, id, characterId);
    let voiceId: string;

    if (generatedVoiceId.startsWith("edge:")) {
      // Edge TTS: store voice ID directly, no ElevenLabs API call needed
      voiceId = generatedVoiceId;
    } else {
      // ElevenLabs: create voice from preview and get permanent voice ID
      if (!env.ELEVENLABS_API_KEY) {
        return NextResponse.json(
          { error: "ElevenLabs is not configured — no API key" },
          { status: 503 }
        );
      }
      voiceId = await createVoiceFromPreview(env.ELEVENLABS_API_KEY, {
        voiceName: bible.name,
        voiceDescription: buildVoiceDescription(bible),
        generatedVoiceId,
      });
    }

    await db
      .update(characters)
      .set({
        bible: { ...bible, voice_id: voiceId },
        updated_at: new Date(),
      })
      .where(
        and(
          eq(characters.story_id, id),
          eq(characters.character_id, characterId)
        )
      );

    return NextResponse.json({ ok: true, voiceId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}