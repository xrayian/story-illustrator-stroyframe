import { config } from "dotenv";

// Root .env lives one level up from the worker's working directory.
config({ path: "../.env" });

import { Redis } from "ioredis";
import { validateEnv } from "@storyframe/schemas/env";
import { QUEUE_NAME, NOOP_JOB, createQueue } from "./queue";
import { createWorker } from "./worker";

const env = validateEnv(process.env);

const connection = new Redis(env.UPSTASH_REDIS_URL, {
  maxRetriesPerRequest: null,
});

const queue = createQueue(connection);
const worker = createWorker(connection);

const enqueueNoop = process.argv.includes("--enqueue-noop");

if (enqueueNoop) {
  const job = await queue.add(NOOP_JOB, { note: "phase 0 acceptance" });
  console.log(`[worker] enqueued ${job.id} (${NOOP_JOB})`);
  worker.on("completed", async (done) => {
    if (done.id === job.id) {
      console.log("[worker] acceptance job done — exiting");
      await shutdown("acceptance complete");
    }
  });
}

console.log(`[worker] listening on queue '${QUEUE_NAME}'`);

async function shutdown(reason: string): Promise<void> {
  console.log(`[worker] shutting down (${reason})`);
  await worker.close();
  await queue.close();
  connection.disconnect();
  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void shutdown(signal));
}