import { describe, expect, it } from "vitest";
import { validateEnv } from "@storyframe/schemas/env";
import { createR2, storyAssetKey } from "./index";

let env: ReturnType<typeof validateEnv> | undefined;
try {
  env = validateEnv(process.env);
} catch {
  // Missing env: tests below skip.
}

describe.skipIf(!env)("r2 smoke", () => {
  const r2 = createR2(env!);

  it("uploads, reads back, and deletes an object", async () => {
    const key = storyAssetKey("smoke", "test.bin");
    const payload = new TextEncoder().encode("hello from storyframe smoke test");

    await r2.upload(key, payload, "application/octet-stream");
    expect(await r2.exists(key)).toBe(true);

    const roundTrip = await r2.download(key);
    expect(new TextDecoder().decode(roundTrip)).toBe(
      "hello from storyframe smoke test"
    );

    await r2.remove(key);
    expect(await r2.exists(key)).toBe(false);
  });

  it("reports a missing key as not existing", async () => {
    expect(await r2.exists(storyAssetKey("smoke", "does-not-exist.bin"))).toBe(false);
  });
});