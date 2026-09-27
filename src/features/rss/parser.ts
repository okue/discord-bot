import { XMLParser } from "fast-xml-parser";

export interface FeedItem {
  /** Deduplication key: guid / id, falling back to link */
  key: string;
  title?: string;
  link?: string;
  /** Plain text with HTML stripped */
  summary?: string;
  publishedAt?: number;
}

export interface ParsedFeed {
  title?: string;
  link?: string;
  /** In feed order */
  items: FeedItem[];
}

export class FeedParseError extends Error {
  override name = "FeedParseError";
}

type Node = Record<string, unknown>;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // content:encoded → encoded, dc:date → date, rdf:RDF → RDF
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  htmlEntities: true,
  isArray: (name) => name === "item" || name === "entry" || name === "link",
});

/** Parses RSS 2.0, RSS 1.0 (RDF) and Atom */
export function parseFeed(xml: string): ParsedFeed {
  let doc: Node;
  try {
    doc = xmlParser.parse(xml) as Node;
  } catch (error) {
    throw new FeedParseError(`XML として解釈できません: ${String(error)}`);
  }

  const rss = asNode(doc.rss);
  const rssChannel = asNode(rss?.channel);
  if (rssChannel) return fromRss(rssChannel, toArray(rssChannel.item));

  const rdf = asNode(doc.RDF);
  if (rdf) return fromRss(asNode(rdf.channel) ?? {}, toArray(rdf.item));

  const atom = asNode(doc.feed);
  if (atom) return fromAtom(atom);

  throw new FeedParseError("RSS / Atom フィードとして認識できません");
}

function fromRss(channel: Node, items: unknown[]): ParsedFeed {
  return {
    title: text(channel.title),
    link: pickLink(channel.link),
    items: items.flatMap((raw) => {
      const item = asNode(raw);
      if (!item) return [];
      const link = pickLink(item.link);
      const title = text(item.title);
      const published = parseDate(text(item.pubDate) ?? text(item.date));
      const key = text(item.guid) ?? text(item["@_about"]) ?? link ?? fallbackKey(title, published);
      if (!key) return [];
      return [
        {
          key,
          title,
          link,
          summary: toPlainText(text(item.description) ?? text(item.encoded)),
          publishedAt: published,
        },
      ];
    }),
  };
}

function fromAtom(feed: Node): ParsedFeed {
  return {
    title: text(feed.title),
    link: pickLink(feed.link),
    items: toArray(feed.entry).flatMap((raw) => {
      const entry = asNode(raw);
      if (!entry) return [];
      const link = pickLink(entry.link);
      const title = text(entry.title);
      const published = parseDate(text(entry.published) ?? text(entry.updated));
      const key = text(entry.id) ?? link ?? fallbackKey(title, published);
      if (!key) return [];
      return [
        {
          key,
          title,
          link,
          summary: toPlainText(text(entry.summary) ?? text(entry.content)),
          publishedAt: published,
        },
      ];
    }),
  };
}

function asNode(value: unknown): Node | undefined {
  if (Array.isArray(value)) return asNode(value[0]);
  return typeof value === "object" && value !== null ? (value as Node) : undefined;
}

function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Extracts text from a string node, a node with `#text`, or an array of them */
function text(value: unknown): string | undefined {
  if (Array.isArray(value)) return text(value[0]);
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  const node = asNode(value);
  return node ? text(node["#text"]) : undefined;
}

/** Handles both RSS `<link>url</link>` and Atom `<link href rel>` */
function pickLink(value: unknown): string | undefined {
  const links = toArray(value);
  for (const link of links) {
    const url = text(link);
    if (url) return url;
  }
  const withHref = links.map(asNode).filter((l): l is Node => typeof l?.["@_href"] === "string");
  const alternate = withHref.find((l) => l["@_rel"] === undefined || l["@_rel"] === "alternate");
  return (alternate ?? withHref[0])?.["@_href"] as string | undefined;
}

function parseDate(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : time;
}

function fallbackKey(title: string | undefined, published: number | undefined): string | undefined {
  return title ? `${title}|${published ?? ""}` : undefined;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function toPlainText(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const plain = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
      if (entity.startsWith("#x") || entity.startsWith("#X")) {
        return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      }
      if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      return ENTITIES[entity.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, " ")
    .trim();
  return plain || undefined;
}
