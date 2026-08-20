import { NextResponse, type NextRequest } from "next/server";
import { createR2 } from "@storyframe/storage";
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
  try {
    const bytes = await r2.download(voicePreviewKey(id, characterId, index));
    const body = new Uint8Array(bytes.byteLength);
    body.set(bytes);
    return new Response(body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Preview not found" }, { status: 404 });
  }
}