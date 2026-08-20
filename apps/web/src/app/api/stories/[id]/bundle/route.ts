import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { assembleBundle } from "@storyframe/pipeline/assemble";
import { stories } from "@storyframe/schemas/db";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { createR2 } from "@storyframe/storage";

/**
 * Phase 5: assembles and streams the `.svmp` bundle for a finished story.
 * On-demand: no bundle is staged in R2. The worker is not involved.
 * 409 unless the story has reached `ready` (or `failed` with skipped stages)
 * — this matches the optional-gated model where skipped voice/visual still
 * reaches `ready`.
 */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/stories/[id]/bundle">
): Promise<NextResponse> {
  const { id } = await ctx.params;

  const db = getDb();
  const [story] = await db
    .select({ status: stories.status, title: stories.title })
    .from(stories)
    .where(eq(stories.id, id));
  if (!story) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }
  if (story.status !== "ready") {
    return NextResponse.json(
      { error: `Story is not ready (status: ${story.status})` },
      { status: 409 }
    );
  }

  const env = getEnv();
  const r2 = createR2(env);
  let zip: Uint8Array;
  try {
    const result = await assembleBundle(db, r2, id, {
      geminiAnalysisModel: env.GEMINI_ANALYSIS_MODEL,
      geminiImageModel: env.GEMINI_IMAGE_MODEL,
    });
    zip = result.zip;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bundle assembly failed" },
      { status: 500 }
    );
  }

  const filename = sanitizeFilename(story.title) + ".svmp";
  const body = new Uint8Array(zip.byteLength);
  body.set(zip);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function sanitizeFilename(title: string): string {
  const base = title.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
  return base.length === 0 ? "story" : base.slice(0, 80);
}
