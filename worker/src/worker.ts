import { Worker } from "bullmq";
import type { Redis } from "ioredis";
import { QUEUE_NAME, NOOP_JOB, ANALYSIS_JOB, VOICE_TTS_JOB, IMAGE_GENERATION_JOB } from "./queue";
import { noopProcessor } from "./jobs/noop";
import { analysisProcessor } from "./jobs/analysis";
import { voiceTtsProcessor } from "./jobs/voice-tts";
import { imageGenerationProcessor } from "./jobs/images";

export function createWorker(connection: Redis): Worker {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      switch (job.name) {
        case NOOP_JOB:
          return noopProcessor(job);
        case ANALYSIS_JOB:
          return analysisProcessor(job);
        case VOICE_TTS_JOB:
          return voiceTtsProcessor(job);
        case IMAGE_GENERATION_JOB:
          return imageGenerationProcessor(job);
        default:
          throw new Error(`Unknown job type: ${job.name}`);
      }
    },
    { connection, concurrency: 1 }
  );

  worker.on("completed", (job) => {
    console.log(`[worker] job ${job.id} (${job.name}) completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[worker] job ${job?.id} (${job?.name}) failed: ${err.message}`);
  });

  worker.on("error", (err) => {
    console.error(`[worker] error: ${err.message}`);
  });

  return worker;
}