/** BullMQ queue for the whole pipeline; job.name selects the stage processor. */
export const QUEUE_NAME = "pipeline";

/** Phase 0 test job — proves queue + worker + Redis round-trip. */
export const NOOP_JOB = "noop";

/** Pipeline stages. */
export const ANALYSIS_JOB = "analysis";
export const VOICE_DESIGN_JOB = "voice_design";
export const VOICE_TTS_JOB = "voice_tts";
export const IMAGE_GENERATION_JOB = "image_generation";
export const ASSEMBLE_JOB = "assemble";