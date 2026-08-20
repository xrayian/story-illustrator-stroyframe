import type { Job } from "bullmq";

export async function noopProcessor(job: Job): Promise<{ ok: boolean; at: string }> {
  return { ok: true, at: new Date().toISOString() };
}