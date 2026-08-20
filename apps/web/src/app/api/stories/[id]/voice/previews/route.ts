import { NextResponse, type NextRequest } from "next/server";
import {
  designPreviewsRequestSchema,
  NARRATOR_ID,
} from "@storyframe/schemas";
import {
  assertCastApproved,
  buildVoiceDescription,
  VOICE_DESIGN_MODEL,
  designVoice,
} from "@storyframe/pipeline";
import { ensureNarratorRow } from "@storyframe/pipeline";
import { assets } from "@storyframe/schemas/db";
import { createR2 } from "@storyframe/storage";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { clearCharacterPreviews, loadCharacterBible, voicePreviewKey } from "@/lib/voice";

/**
 * Phase 3: designs 3 voice previews for one character via ElevenLabs Voice
 * Design. Paid call — the cast approval gate must have fired. Re-POSTing for
 * the same character re-rolls (replaces the previous previews).
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/stories/[id]/voice/previews">
): Promise<NextResponse> {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = designPreviewsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const db = getDb();
  await assertCastApproved(db, id);

  const env = getEnv();
  const characterId = parsed.data.characterId;

  try {
    if (!env.ELEVENLABS_API_KEY) {
      return NextResponse.json(
        { error: "ElevenLabs is not configured — no API key" },
        { status: 503 }
      );
    }
    if (characterId === NARRATOR_ID) {
      await ensureNarratorRow(db, id);
    }

    const bible = await loadCharacterBible(db, id, characterId);
    const description = buildVoiceDescription(bible);

    const previews = await designVoice(
      env.ELEVENLABS_API_KEY,
      description,
      env.ELEVENLABS_VOICE_DESIGN_MODEL ?? VOICE_DESIGN_MODEL
    );

    const r2 = createR2(env);
    await clearCharacterPreviews(db, r2, id, characterId);
    for (let i = 0; i < previews.length; i++) {
      const preview = previews[i];
      const key = voicePreviewKey(id, characterId, i);
      await r2.upload(key, preview.audio, preview.mediaType);
      await db.insert(assets).values({
        story_id: id,
        kind: "audio",
        r2_key: key,
        content_type: preview.mediaType,
        size_bytes: preview.audio.length,
        meta: {
          purpose: "voice_preview",
          characterId,
          generatedVoiceId: preview.generatedVoiceId,
          index: i,
        },
      });
    }

    return NextResponse.json({
      previews: previews.map((preview, i) => ({
        generatedVoiceId: preview.generatedVoiceId,
        mediaType: preview.mediaType,
        durationSecs: preview.durationSecs,
        url: `/api/stories/${id}/voice/previews/audio?characterId=${encodeURIComponent(characterId)}&index=${i}`,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}