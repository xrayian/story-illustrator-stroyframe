import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { assets } from "@storyframe/schemas/db";
import { createR2 } from "@storyframe/storage";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { voicePreviewKey } from "@/lib/voice";

/** Streams a designed voice preview from R2 to an <audio> element. */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/stories/[id]/voice/previews/audio">
): Promise<Response> {
  const { id } = await ctx.params;
  const characterId = request.nextUrl.searchParams.get("characterId");
  const index = Number(request.nextUrl.searchParams.get("index"));

  if (!characterId || !Number.isInteger(index) || index < 0 || index > 5) {
    return NextResponse.json({ error: "Invalid characterId or index" }, { status: 400 });
  }

  const r2 = createR2(getEnv());
  const db = getDb();
  try {
    const key = voicePreviewKey(id, characterId, index);
    const bytes = await r2.download(key);
    const body = new Uint8Array(bytes.byteLength);
    body.set(bytes);
    // Use stored content_type when available (ElevenLabs previews may be audio/wav).
    let contentType = "audio/mpeg";
    try {
      const [row] = await db
        .select({ content_type: assets.content_type })
        .from(assets)
        .where(and(eq(assets.story_id, id), eq(assets.r2_key, key)))
        .limit(1);
      if (row?.content_type) contentType = row.content_type;
    } catch {
      // Fallback to mpeg if DB lookup fails.
    }
    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Preview not found" }, { status: 404 });
  }
}