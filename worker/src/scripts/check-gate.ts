import { config } from "dotenv";

// Root .env lives one level up from the worker's working directory.
config({ path: "../.env" });

import { validateEnv } from "@storyframe/schemas/env";
import { createDb, characters, stories } from "@storyframe/schemas/db";
import { assertCastApproved } from "@storyframe/pipeline";
import { eq } from "drizzle-orm";

const [storyId] = process.argv.slice(2);
if (!storyId) {
  console.error("usage: tsx src/scripts/check-gate.ts <storyId>");
  process.exit(1);
}

const env = validateEnv(process.env);
const db = createDb(env.NEON_CONN_STRING);

async function gateExpectation(label: string, shouldPass: boolean): Promise<void> {
  let passed = false;
  let message = "";
  try {
    await assertCastApproved(db, storyId);
    passed = true;
  } catch (err) {
    message = err instanceof Error ? err.message : String(err);
  }
  console.log(
    `${label}: ${passed ? "PASS (gate allowed)" : "BLOCKED (gate threw)"}` +
      (message ? ` — ${message}` : "")
  );
  const ok = shouldPass === passed;
  console.log(ok ? "  => as expected" : "  => UNEXPECTED");
  if (!ok) process.exitCode = 1;
}

await gateExpectation("BEFORE approval", false);

const rows = await db
  .select({
    character_id: characters.character_id,
    name: characters.name,
    bible: characters.bible,
    version: characters.version,
    approved_at: characters.approved_at,
  })
  .from(characters)
  .where(eq(characters.story_id, storyId));

for (const row of rows) {
  console.log(
    `${row.character_id}: v${row.version} approved=${row.approved_at !== null} name=${row.name}`
  );
}

const approvedCount = rows.filter((r) => r.approved_at !== null).length;
console.log(`approved characters: ${approvedCount} / ${rows.length}`);

const [story] = await db
  .select({ status: stories.status })
  .from(stories)
  .where(eq(stories.id, storyId));
console.log(`story status: ${story?.status}`);