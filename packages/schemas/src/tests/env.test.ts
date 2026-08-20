import { describe, expect, it } from "vitest";
import { validateEnv } from "../env";

const fullEnv = {
  NEON_CONN_STRING: "postgresql://user:pass@host/db",
  UPSTASH_REDIS_URL: "rediss://default:pass@host:6379",
  R2_ACCOUNT_ID: "a".repeat(32),
  R2_ACCESS_KEY_ID: "b".repeat(32),
  R2_SECRET_ACCESS_KEY: "c".repeat(64),
  R2_BUCKET: "storyframe",
  GEMINI_API_KEY: "g-key",
  ELEVENLABS_API_KEY: "e-key",
};

describe("validateEnv", () => {
  it("accepts a complete env", () => {
    expect(() => validateEnv(fullEnv)).not.toThrow();
    expect(validateEnv(fullEnv).R2_BUCKET).toBe("storyframe");
  });

  it("throws listing every missing var", () => {
    const { GEMINI_API_KEY: _omit, ELEVENLABS_API_KEY: _omit2, ...incomplete } = fullEnv;
    expect(() => validateEnv(incomplete)).toThrow(/GEMINI_API_KEY/);
    expect(() => validateEnv(incomplete)).toThrow(/ELEVENLABS_API_KEY/);
  });

  it("rejects a non-postgres NEON_CONN_STRING", () => {
    expect(() => validateEnv({ ...fullEnv, NEON_CONN_STRING: "mysql://x" })).toThrow(
      /NEON_CONN_STRING/
    );
  });

  it("rejects a non-redis UPSTASH_REDIS_URL", () => {
    expect(() => validateEnv({ ...fullEnv, UPSTASH_REDIS_URL: "http://x" })).toThrow(
      /UPSTASH_REDIS_URL/
    );
  });

  it("rejects empty strings", () => {
    expect(() => validateEnv({ ...fullEnv, R2_BUCKET: "" })).toThrow(/R2_BUCKET/);
  });
});