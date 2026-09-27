import { describe, expect, it } from "vitest";
import { FeedParseError, parseFeed } from "../src/features/rss/parser";

describe("parseFeed", () => {
  it("RSS 2.0", () => {
    const feed = parseFeed(`<?xml version="1.0"?>
      <rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <title>Example Blog</title>
          <link>https://example.com/</link>
          <atom:link href="https://example.com/feed" rel="self" />
          <item>
            <title>Second &amp; last</title>
            <link>https://example.com/2</link>
            <guid isPermaLink="false">post-2</guid>
            <pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate>
            <description><![CDATA[<p>Hello <b>world</b> &amp; more</p>]]></description>
          </item>
          <item>
            <title>First</title>
            <link>https://example.com/1</link>
            <content:encoded><![CDATA[<div>Body</div>]]></content:encoded>
          </item>
        </channel>
      </rss>`);

    expect(feed.title).toBe("Example Blog");
    expect(feed.link).toBe("https://example.com/");
    expect(feed.items).toEqual([
      {
        key: "post-2",
        title: "Second & last",
        link: "https://example.com/2",
        summary: "Hello world & more",
        publishedAt: Date.UTC(2024, 0, 2),
      },
      {
        key: "https://example.com/1",
        title: "First",
        link: "https://example.com/1",
        summary: "Body",
        publishedAt: undefined,
      },
    ]);
  });

  it("Atom", () => {
    const feed = parseFeed(`<?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title type="text">Atom Feed</title>
        <link rel="self" href="https://example.org/atom.xml" />
        <link href="https://example.org/" />
        <entry>
          <title type="html">Entry &lt;1&gt;</title>
          <link rel="edit" href="https://example.org/edit/1" />
          <link rel="alternate" href="https://example.org/entries/1" />
          <id>urn:uuid:1</id>
          <updated>2024-03-01T12:00:00Z</updated>
          <summary>Summary text</summary>
        </entry>
      </feed>`);

    expect(feed.title).toBe("Atom Feed");
    expect(feed.link).toBe("https://example.org/");
    expect(feed.items).toEqual([
      {
        key: "urn:uuid:1",
        title: "Entry <1>",
        link: "https://example.org/entries/1",
        summary: "Summary text",
        publishedAt: Date.UTC(2024, 2, 1, 12),
      },
    ]);
  });

  it("RSS 1.0 (RDF)", () => {
    const feed = parseFeed(`<?xml version="1.0"?>
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
        <channel rdf:about="https://example.jp/">
          <title>RDF Feed</title>
          <link>https://example.jp/</link>
        </channel>
        <item rdf:about="https://example.jp/a">
          <title>A</title>
          <link>https://example.jp/a</link>
          <dc:date>2024-05-01T09:00:00+09:00</dc:date>
        </item>
      </rdf:RDF>`);

    expect(feed.title).toBe("RDF Feed");
    expect(feed.items).toEqual([
      {
        key: "https://example.jp/a",
        title: "A",
        link: "https://example.jp/a",
        summary: undefined,
        publishedAt: Date.UTC(2024, 4, 1),
      },
    ]);
  });

  it("allows a channel with no items", () => {
    const feed = parseFeed(`<rss version="2.0"><channel><title>Empty</title></channel></rss>`);
    expect(feed).toEqual({ title: "Empty", link: undefined, items: [] });
  });

  it("throws FeedParseError for non-feed XML", () => {
    expect(() => parseFeed("<html><body>not a feed</body></html>")).toThrow(FeedParseError);
  });
});
