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
  ELEVENLABS_API_KEY: z.string().min(1),
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