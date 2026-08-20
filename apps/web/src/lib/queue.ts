import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { QUEUE_NAME } from "@storyframe/pipeline";
import { getEnv } from "./env";

let queue: Queue | undefined;
let connection: Redis | undefined;

export function getQueue(): Queue {
  if (!queue) {
    const env = getEnv();
    connection = new Redis(env.UPSTASH_REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    queue = new Queue(QUEUE_NAME, { connection });
  }
  return queue;
}