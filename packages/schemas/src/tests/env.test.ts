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
  GEMINI_IMAGE_MODEL: "nano-banana-pro-preview",
  POLLINATIONS_IMAGE_MODEL: "flux",
};

describe("validateEnv", () => {
  it("accepts a complete env", () => {
    expect(() => validateEnv(fullEnv)).not.toThrow();
    expect(validateEnv(fullEnv).R2_BUCKET).toBe("storyframe");
  });

  it("throws listing every missing var", () => {
    const { GEMINI_API_KEY: _omit, ...incomplete } = fullEnv;
    expect(() => validateEnv(incomplete)).toThrow(/GEMINI_API_KEY/);
  });

  it("accepts a env without ELEVENLABS_API_KEY (voice stage is optional)", () => {
    const { ELEVENLABS_API_KEY: _omit, ...noVoice } = fullEnv;
    expect(() => validateEnv(noVoice)).not.toThrow();
    expect(validateEnv(noVoice).ELEVENLABS_API_KEY).toBeUndefined();
  });

  it("accepts a env without GEMINI_IMAGE_MODEL (visual stage optional/model defaulted)", () => {
    const { GEMINI_IMAGE_MODEL: _omit, ...noImage } = fullEnv;
    expect(() => validateEnv(noImage)).not.toThrow();
  });

  it("accepts a env without POLLINATIONS_IMAGE_MODEL (fallback defaults)", () => {
    const { POLLINATIONS_IMAGE_MODEL: _omit, ...noPollinations } = fullEnv;
    expect(() => validateEnv(noPollinations)).not.toThrow();
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