import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import {
  approveCastRequestSchema,
  characterBibleSchema,
  UNSPECIFIED,
  type CharacterBible,
} from "@storyframe/schemas";
import { buildIdentityPrompt } from "@storyframe/pipeline";
import { characters } from "@storyframe/schemas/db";
import { getDb } from "@/lib/db";

function normalizeDemographic(value: string | undefined, prev: string): string {
  if (value === undefined) return prev;
  return value.trim() === "" ? UNSPECIFIED : value.trim();
}

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/stories/[id]/cast/approve">
): Promise<NextResponse> {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = approveCastRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const db = getDb();

  for (const { characterId, edits } of parsed.data.characters) {
    const [row] = await db
      .select()
      .from(characters)
      .where(
        and(
          eq(characters.story_id, id),
          eq(characters.character_id, characterId)
        )
      );
    if (!row) {
      return NextResponse.json(
        { error: `Character ${characterId} not found for this story` },
        { status: 404 }
      );
    }

    const prev = row.bible as CharacterBible;
    const merged = characterBibleSchema.parse({
      ...prev,
      name: edits.name?.trim() || prev.name,
      role: edits.role?.trim() || prev.role,
      apparent_age_range: normalizeDemographic(edits.apparent_age_range, prev.apparent_age_range),
      gender_expression: normalizeDemographic(edits.gender_expression, prev.gender_expression),
      ethnicity_or_culture_cues: normalizeDemographic(
        edits.ethnicity_or_culture_cues,
        prev.ethnicity_or_culture_cues
      ),
      physical_description: edits.physical_description?.trim() ?? prev.physical_description,
      personality_traits: edits.personality_traits ?? prev.personality_traits,
    });

    const locked = buildIdentityPrompt(merged);
    const wasApproved = row.approved_at !== null;

    await db
      .update(characters)
      .set({
        name: merged.name,
        role: merged.role,
        bible: { ...merged, locked_identity_prompt: locked },
        version: wasApproved ? (row.version ?? 1) + 1 : (row.version ?? 1),
        approved_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(characters.id, row.id));
  }

  return NextResponse.json({ ok: true });
}