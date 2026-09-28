import { describe, expect, it } from "vitest";
import { toMessageContent } from "../src/features/rss/formatter";

describe("toMessageContent", () => {
  it("puts the bold title above the URL", () => {
    expect(toMessageContent({ key: "k", title: "Hello", link: "https://example.com/a" })).toBe(
      "**Hello**\nhttps://example.com/a",
    );
  });

  it("escapes markdown and collapses whitespace in the title", () => {
    expect(toMessageContent({ key: "k", title: " a *b*\n_c_ ", link: "https://example.com/" })).toBe(
      "**a \\*b\\* \\_c\\_**\nhttps://example.com/",
    );
  });

  it("drops non-http URLs", () => {
    expect(toMessageContent({ key: "k", title: "T", link: "javascript:alert(1)" })).toBe("**T**");
  });

  it("falls back to the URL alone when the title is missing", () => {
    expect(toMessageContent({ key: "k", link: "https://example.com/" })).toBe("https://example.com/");
  });

  it("uses a placeholder when both are missing", () => {
    expect(toMessageContent({ key: "k" })).toBe("**(無題)**");
  });
});
