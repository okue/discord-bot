import { describe, expect, it } from "vitest";
import { mergeSeenKeys, oldestFirst, toMessages } from "../src/features/rss/poller";

describe("mergeSeenKeys", () => {
  it("puts current keys first, followed by unique previous keys", () => {
    expect(mergeSeenKeys(["c", "b"], ["b", "a"])).toEqual(["c", "b", "a"]);
  });

  it("drops the oldest keys beyond the limit", () => {
    expect(mergeSeenKeys(["d", "c"], ["b", "a"], 3)).toEqual(["d", "c", "b"]);
  });

  it("keeps all current keys even when they exceed the limit", () => {
    expect(mergeSeenKeys(["e", "d", "c"], ["b", "a"], 2)).toEqual(["e", "d", "c"]);
  });

  it("keeps previous keys when the feed is temporarily empty", () => {
    expect(mergeSeenKeys([], ["b", "a"])).toEqual(["b", "a"]);
  });
});

describe("oldestFirst", () => {
  it("sorts by date when every item has one", () => {
    const items = [
      { key: "b", publishedAt: 2 },
      { key: "a", publishedAt: 1 },
    ];
    expect(oldestFirst(items).map((i) => i.key)).toEqual(["a", "b"]);
  });

  it("reverses feed order when a date is missing", () => {
    expect(oldestFirst([{ key: "new", publishedAt: 2 }, { key: "old" }]).map((i) => i.key)).toEqual(["old", "new"]);
  });
});

describe("toMessages", () => {
  it("packs up to 5 items per message", () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ key: `${i}`, title: `T${i}`, link: `https://ex.com/${i}` }));
    const messages = toMessages(items);
    expect(messages).toHaveLength(2);
    expect(messages[1]).toBe("**T5**\nhttps://ex.com/5");
  });
});
