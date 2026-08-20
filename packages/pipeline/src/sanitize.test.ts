import { describe, expect, it } from "vitest";
import { sanitizeStory } from "./sanitize";
import { splitByChapterMarkers, needsChunking, MAX_CHUNK_CHARS } from "./chunk";

describe("sanitizeStory", () => {
  it("strips HTML and markdown cruft", () => {
    const raw =
      "<p>Hello <b>world</b>.</p>\n[link](https://example.com)\n![img](x.png)\n# Chapter One";
    const { text } = sanitizeStory(raw);
    expect(text).not.toContain("<");
    expect(text).not.toContain("](https://");
    expect(text).not.toContain("x.png");
    expect(text).toContain("link");
    expect(text).toContain("Chapter One");
  });

  it("drops ad and navigation boilerplate lines", () => {
    const raw = [
      "She opened the door.",
      "Advertisement",
      "Back to top",
      "Next Chapter >",
      "Posted by user123",
      "Subscribe",
    ].join("\n");
    const { text } = sanitizeStory(raw);
    expect(text).toContain("She opened the door.");
    expect(text).not.toContain("Advertisement");
    expect(text).not.toContain("Back to top");
    expect(text).not.toContain("Next Chapter");
    expect(text).not.toContain("Posted by");
    expect(text).not.toContain("Subscribe");
  });

  it("normalizes whitespace and counts words", () => {
    const { text, wordCount } = sanitizeStory("  A   B\n\n\n\nC  \t D  ");
    expect(text).toBe("A B\n\nC D");
    expect(wordCount).toBe(4);
  });

  it("detects language by script", () => {
    expect(sanitizeStory("这是一个故事").language).toBe("zh");
    expect(sanitizeStory("This is a story").language).toBe("en");
  });
});

describe("splitByChapterMarkers", () => {
  it("splits on chapter markers", () => {
    const text = "Chapter 1\nOnce upon a time.\nChapter 2\nThe end.";
    const chunks = splitByChapterMarkers(text);
    expect(chunks).not.toBeNull();
    expect(chunks).toHaveLength(2);
    expect(chunks![0].heading).toBe("Chapter 1");
    expect(chunks![1].text).toContain("The end.");
  });

  it("returns null without two markers", () => {
    expect(splitByChapterMarkers("No markers here at all")).toBeNull();
    expect(splitByChapterMarkers("Chapter 1\nOnly one marker")).toBeNull();
  });
});

describe("needsChunking", () => {
  it("flags text above the limit", () => {
    expect(needsChunking("x".repeat(MAX_CHUNK_CHARS + 1))).toBe(true);
    expect(needsChunking("short")).toBe(false);
  });
});