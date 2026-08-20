import { NextResponse, type NextRequest } from "next/server";
import { createStoryRequestSchema } from "@storyframe/schemas";
import { ANALYSIS_JOB } from "@storyframe/pipeline";
import { stories } from "@storyframe/schemas/db";
import { getDb } from "@/lib/db";
import { getQueue } from "@/lib/queue";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createStoryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const db = getDb();
  const [story] = await db
    .insert(stories)
    .values({
      title: parsed.data.title?.trim() || "Untitled story",
      source_text: parsed.data.text,
      source_url: parsed.data.sourceUrl || null,
    })
    .returning({ id: stories.id });

  await getQueue().add(ANALYSIS_JOB, { storyId: story.id });

  return NextResponse.json({ storyId: story.id }, { status: 201 });
}