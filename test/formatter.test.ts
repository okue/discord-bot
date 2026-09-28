import { describe, expect, it } from "vitest";
import { MESSAGE_MAX_LENGTH, packMessages, toMessageContent } from "../src/features/rss/formatter";

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

  it("neutralizes masked links and URLs in the title", () => {
    expect(
      toMessageContent({ key: "k", title: "Update [click](https://evil.example/x) <@1>", link: "https://example.com/" }),
    ).toBe("**Update \\[click\\]\\(<https://evil.example/x)> \\<@1\\>**\nhttps://example.com/");
  });

  it("normalizes the URL", () => {
    expect(toMessageContent({ key: "k", title: "T", link: " https://ex.com/a b " })).toBe(
      "**T**\nhttps://ex.com/a%20b",
    );
  });

  it("drops non-http and overly long URLs", () => {
    expect(toMessageContent({ key: "k", title: "T", link: "javascript:alert(1)" })).toBe("**T**");
    expect(toMessageContent({ key: "k", title: "T", link: `https://ex.com/${"a".repeat(2000)}` })).toBe("**T**");
  });

  it("fits in a single message", () => {
    const content = toMessageContent({ key: "k", title: "*".repeat(5000), link: `https://ex.com/${"a".repeat(980)}` });
    expect(content.length).toBeLessThanOrEqual(MESSAGE_MAX_LENGTH);
  });

  it("falls back to the URL alone when the title is missing", () => {
    expect(toMessageContent({ key: "k", link: "https://example.com/" })).toBe("https://example.com/");
  });

  it("uses a placeholder when both are missing", () => {
    expect(toMessageContent({ key: "k" })).toBe("**(無題)**");
  });
});

describe("packMessages", () => {
  it("groups up to perMessage items, separated by blank lines", () => {
    expect(packMessages(["a", "b", "c"], 2)).toEqual(["a\n\nb", "c"]);
  });

  it("starts a new message before exceeding the length limit", () => {
    const big = "x".repeat(900);
    const messages = packMessages([big, big, big], 5);
    expect(messages).toEqual([`${big}\n\n${big}`, big]);
    for (const m of messages) expect(m.length).toBeLessThanOrEqual(MESSAGE_MAX_LENGTH);
  });

  it("returns nothing for no items", () => {
    expect(packMessages([], 5)).toEqual([]);
  });
});
