import { Queue } from "bullmq";
import type { Redis } from "ioredis";

import { QUEUE_NAME } from "@storyframe/pipeline";
export {
  QUEUE_NAME,
  NOOP_JOB,
  ANALYSIS_JOB,
  VOICE_DESIGN_JOB,
  VOICE_TTS_JOB,
  IMAGE_GENERATION_JOB,
  ASSEMBLE_JOB,
} from "@storyframe/pipeline";

export function createQueue(connection: Redis): Queue {
  return new Queue(QUEUE_NAME, { connection });
}