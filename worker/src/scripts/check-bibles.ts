import { config } from "dotenv";

config({ path: "../.env" });

import { validateEnv } from "@storyframe/schemas/env";
import { createDb, characters } from "@storyframe/schemas/db";
import type { CharacterBible } from "@storyframe/schemas";
import { eq } from "drizzle-orm";

const [storyId] = process.argv.slice(2);
if (!storyId) {
  console.error("usage: tsx src/scripts/check-bibles.ts <storyId>");
  process.exit(1);
}

const env = validateEnv(process.env);
const db = createDb(env.NEON_CONN_STRING);
const rows = await db
  .select()
  .from(characters)
  .where(eq(characters.story_id, storyId))
  .orderBy(characters.created_at);

for (const r of rows) {
  const b = r.bible as CharacterBible;
  console.log(
    `${r.character_id} | v${r.version} | age=${b.apparent_age_range} | gender=${b.gender_expression} | eth=${b.ethnicity_or_culture_cues} | traits=${JSON.stringify(b.personality_traits)}`
  );
  console.log(`   locked: ${b.locked_identity_prompt?.slice(0, 140)}`);
}