import { describe, expect, it } from "vitest";
import {
  STYLE_BIBLE,
  assetPublicPath,
  buildPortraitPrompt,
  buildScenePrompt,
  keyFromPublicPath,
  extForMime,
  stableSeed,
  pollinationsUrl,
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