import { NextResponse, type NextRequest } from "next/server";
import { createR2 } from "@storyframe/storage";
import { getEnv } from "@/lib/env";

/**
 * Streams a story asset (e.g. a generated image) back from R2 by its object
 * key. The key is taken from the URL path and must belong to this story.
 */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/stories/[id]/visuals/asset/[...key]">
): Promise<NextResponse> {
  const { id, key } = await ctx.params;
  const parts = Array.isArray(key) ? key : [key];
  const objectKey = parts.join("/");

  const prefix = `stories/${id}/`;
  if (!objectKey.startsWith(prefix)) {
    return NextResponse.json({ error: "Key does not belong to this story" }, { status: 403 });
  }

  const r2 = createR2(getEnv());
  let bytes: Uint8Array;
  try {
    bytes = await r2.download(objectKey);
  } catch {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const contentType =
    objectKey.endsWith(".png") ? "image/png"
    : objectKey.endsWith(".webp") ? "image/webp"
    : objectKey.endsWith(".jpg") || objectKey.endsWith(".jpeg") ? "image/jpeg"
    : "application/octet-stream";

  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);

  return new NextResponse(body, {
    headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=3600" },
  });
}