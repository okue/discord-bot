import { describe, expect, it } from "vitest";
import { mergeSeenKeys } from "../src/features/rss/poller";

describe("mergeSeenKeys", () => {
  it("puts current keys first, followed by unique previous keys", () => {
    expect(mergeSeenKeys(["c", "b"], ["b", "a"])).toEqual(["c", "b", "a"]);
  });

  it("drops the oldest keys beyond the limit", () => {
    expect(mergeSeenKeys(["d", "c"], ["b", "a"], 3)).toEqual(["d", "c", "b"]);
  });

  it("keeps previous keys when the feed is temporarily empty", () => {
    expect(mergeSeenKeys([], ["b", "a"])).toEqual(["b", "a"]);
  });
});
