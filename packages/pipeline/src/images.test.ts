import { describe, expect, it } from "vitest";
import {
  STYLE_BIBLE,
  assetPublicPath,
  buildPortraitPrompt,
  buildScenePrompt,
  defaultHfSteps,
  extForMime,
  keyFromPublicPath,
  mimeFromBytes,
  pollinationsUrl,
  stableSeed,
} from "./images";

describe("assetPublicPath", () => {
  it("builds the streaming API path for an R2 key", () => {
    expect(assetPublicPath("abc", "stories/abc/images/char_1.png")).toBe(
      "/api/stories/abc/visuals/asset/stories/abc/images/char_1.png"
    );
  });
});

describe("keyFromPublicPath", () => {
  it("extracts the R2 key back out of a public path", () => {
    expect(
      keyFromPublicPath("/api/stories/abc/visuals/asset/stories/abc/images/char_1.jpg")
    ).toBe("stories/abc/images/char_1.jpg");
  });

  it("returns null for a url without the asset marker", () => {
    expect(keyFromPublicPath("https://example.com/foo.png")).toBeNull();
  });
});

describe("extForMime", () => {
  it("maps jpeg/webp/png mimes to file extensions", () => {
    expect(extForMime("image/jpeg")).toBe("jpg");
    expect(extForMime("image/webp")).toBe("webp");
    expect(extForMime("image/png")).toBe("png");
  });
});

describe("stableSeed", () => {
  it("is deterministic and non-negative", () => {
    expect(stableSeed("char_1")).toBe(stableSeed("char_1"));
    expect(stableSeed("char_1")).toBeGreaterThanOrEqual(0);
    expect(stableSeed("char_1")).not.toBe(stableSeed("char_2"));
  });
});

describe("pollinationsUrl", () => {
  it("encodes the prompt and sets size/logo/safety params", () => {
    const url = pollinationsUrl("a warm lantern at night, 2:3", {
      width: 768,
      height: 1024,
      seed: 42,
      model: "flux",
      referrer: "storyframe.app",
    });
    expect(url.startsWith("https://image.pollinations.ai/prompt/")).toBe(true);
    expect(url).toContain(encodeURIComponent("a warm lantern at night, 2:3"));
    expect(url).toContain("width=768");
    expect(url).toContain("height=1024");
    expect(url).toContain("seed=42");
    expect(url).toContain("model=flux");
    expect(url).toContain("nologo=true");
    expect(url).toContain("safe=true");
  });

  it("omits optional params when absent", () => {
    const url = pollinationsUrl("x", { width: 256, height: 256 });
    expect(url).not.toContain("seed=");
    expect(url).not.toContain("model=");
  });
});

describe("defaultHfSteps", () => {
  it("uses the distilled step cap for schnell/turbo models", () => {
    expect(defaultHfSteps("black-forest-labs/flux.1-schnell")).toBe(4);
    expect(defaultHfSteps("stabilityai/sdxl-turbo")).toBe(4);
  });

  it("uses standard steps for full models", () => {
    expect(defaultHfSteps("black-forest-labs/flux.1-dev")).toBe(25);
    expect(defaultHfSteps("stabilityai/stable-diffusion-3.5-large")).toBe(25);
  });
});

describe("mimeFromBytes", () => {
  it("detects png/jpeg/webp magic bytes", () => {
    expect(mimeFromBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe("image/png");
    expect(mimeFromBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(mimeFromBytes(webp)).toBe("image/webp");
  });

  it("falls back to octet-stream for unknown bytes", () => {
    expect(mimeFromBytes(new Uint8Array([1, 2, 3]))).toBe("application/octet-stream");
  });
});

describe("buildPortraitPrompt", () => {
  it("keeps the locked identity prompt and the anchor instruction", () => {
    const p = buildPortraitPrompt("Name: Mae; Role: Grandmother");
    expect(p).toContain("Name: Mae; Role: Grandmother");
    expect(p).toContain("canonical anchor");
    expect(p).toContain("head-and-shoulders portrait");
  });
});

describe("buildScenePrompt", () => {
  it("embeds the scene description and style bible", () => {
    const p = buildScenePrompt({
      title: "The Lantern",
      setting: "a winter market",
      timeOfDay: "night",
      mood: "warm",
      isKeyScene: true,
      identityLines: ["- Mae (Grandmother): Name: Mae"],
      attachPortraits: true,
    });
    expect(p).toContain(STYLE_BIBLE);
    expect(p).toContain('story "The Lantern"');
    expect(p).toContain("Setting: a winter market");
    expect(p).toContain("Key scene: yes");
    expect(p).toContain("reference portraits to keep the characters");
  });

  it("omits the re-anchor sentence when no portraits are attached", () => {
    const p = buildScenePrompt({
      title: "T",
      setting: "s",
      timeOfDay: "d",
      mood: "m",
      isKeyScene: false,
      identityLines: [],
      attachPortraits: false,
    });
    expect(p).not.toContain("reference portraits");
    expect(p).toContain("Key scene: no");
  });
});