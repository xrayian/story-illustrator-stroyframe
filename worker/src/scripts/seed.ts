import { config } from "dotenv";

// Root .env lives one level up from the worker's working directory.
config({ path: "../.env" });

import { readFile } from "node:fs/promises";
import { Redis } from "ioredis";
import { validateEnv } from "@storyframe/schemas/env";
import { createDb, stories } from "@storyframe/schemas/db";
import { createQueue, ANALYSIS_JOB } from "../queue";

const [file, title] = process.argv.slice(2);
if (!file) {
  console.error("usage: tsx src/scripts/seed.ts <story.txt> [title]");
  process.exit(1);
}

const env = validateEnv(process.env);
const text = await readFile(file, "utf8");

const db = createDb(env.NEON_CONN_STRING);
const [story] = await db
  .insert(stories)
  .values({ title: title ?? "Seeded story", source_text: text })
  .returning({ id: stories.id });

const connection = new Redis(env.UPSTASH_REDIS_URL, { maxRetriesPerRequest: null });
const queue = createQueue(connection);
const job = await queue.add(ANALYSIS_JOB, { storyId: story.id });

console.log(JSON.stringify({ storyId: story.id, jobId: job.id, chars: text.length }));
connection.disconnect();