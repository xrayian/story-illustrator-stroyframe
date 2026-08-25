import { z } from "zod";

/**
 * Canonical env var names. All are required: the app and worker refuse to
 * boot without them (fail loudly, see AGENTS.md).
 */
export const envSchema = z.object({
  NEON_CONN_STRING: z.string().min(1).regex(/^postgres(ql)?:\/\//, "must be a postgres:// URL"),
  UPSTASH_REDIS_URL: z.string().min(1).regex(/^rediss?:\/\//, "must be a redis:// or rediss:// URL"),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  /**
   * Optional: without a key the voice stage is skipped per-story in the UI
   * (11labs voice integration is optional). Required otherwise.
   */
  ELEVENLABS_API_KEY: z.string().min(1).optional(),
  /** Optional model overrides; the pipeline supplies sensible defaults. */
  GEMINI_ANALYSIS_MODEL: z.string().min(1).optional(),
  /** Voice design model (default eleven_ttv_v3) and TTS model (default eleven_flash_v2_5). */
  ELEVENLABS_VOICE_DESIGN_MODEL: z.string().min(1).optional(),
  ELEVENLABS_TTS_MODEL: z.string().min(1).optional(),
  /**
   * Image generation model (default nano-banana-pro-preview). Image gen is a
   * paid feature (free tier quotas are 0) — the visual stage is optional and
   * can be skipped per-story; errors surface in the UI.
   */
  GEMINI_IMAGE_MODEL: z.string().min(1).optional(),
  /**
   * Free Pollinations.ai fallback model (default flux). Used automatically
   * when Gemini image generation fails (quota/billing). No API key needed.
   */
  POLLINATIONS_IMAGE_MODEL: z.string().min(1).optional(),
  /**
   * Optional: Hugging Face token (https://huggingface.co/settings/tokens, hf_…).
   * Without a token the Hugging Face image provider is simply skipped in the
   * Gemini -> Hugging Face -> Pollinations fallback chain.
   */
  HF_TOKEN: z.string().min(1).optional(),
  /**
   * Hugging Face text-to-image model repo (default black-forest-labs/flux.1-schnell),
   * routed to a serving provider automatically by @huggingface/inference.
   */
  HF_IMAGE_MODEL: z.string().min(1).optional(),
  /** Modal proxy for Kimi K3 (OpenAI-compatible). Analysis fallback when Qwen is unavailable. */
  MODAL_PROXY_TOKEN_ID: z.string().min(1).optional(),
  MODAL_PROXY_TOKEN_SECRET: z.string().min(1).optional(),
  /** Override for the Modal Kimi endpoint (default https://xrayian--ep-kimi-k3-server.us-west.modal.direct/v1). */
  MODAL_KIMI_BASE_URL: z.string().min(1).optional(),
  /** Model id at the Modal endpoint (default kimi-k3). */
  MODAL_KIMI_MODEL: z.string().min(1).optional(),
  /** Modal proxy for Qwen3.8-2.4T-A95B (OpenAI-compatible). PRIMARY story analyzer. */
  MODAL_QWEN_BASE_URL: z
    .string()
    .min(1)
    .optional(),
  /** Model id at the Modal endpoint (default Qwen/Qwen3.8-2.4T-A95B). */
  MODAL_QWEN_MODEL: z.string().min(1).optional(),
  /** Show the analysis model badge in the UI. Set to "false" to hide. Default true. */
  SHOW_ANALYSIS_MODEL: z.string().optional(),
  NEXT_PUBLIC_SHOW_ANALYSIS_MODEL: z.string().optional(),
  /** Pruna P-API image generation (primary). https://docs.api.pruna.ai */
  PRUNA_API_KEY: z.string().min(1).optional(),
  PRUNA_IMAGE_MODEL: z.string().min(1).optional(),
  PRUNA_API_BASE_URL: z.string().min(1).optional(),
  /** Edge TTS rate adjustment (e.g. "+0%", "+10%", "-5%"). Default "+0%". */
  EDGE_TTS_RATE: z.string().min(1).optional(),
});
export type Env = z.infer<typeof envSchema>;

/**
 * Validates a process-env-shaped record. Throws with the list of missing or
 * invalid variable names so callers can fail loudly at boot.
 */
export function validateEnv(input: Record<string, string | undefined>): Env {
  const parsed = envSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const problems = Object.entries(fieldErrors)
      .flatMap(([key, msgs]) => (msgs ? [`${key}: ${msgs.join("; ")}`] : []))
      .join("\n  ");
    throw new Error(`Invalid environment:\n  ${problems}`);
  }
  return parsed.data;
}