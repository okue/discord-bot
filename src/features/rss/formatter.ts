import type { APIEmbed } from "discord-api-types/v10";
import type { FeedItem } from "./parser";

const SUMMARY_MAX_LENGTH = 300;
const EMBED_COLOR = 0xf26522;

export function toEmbed(item: FeedItem, feedTitle: string): APIEmbed {
  return {
    title: truncate(item.title ?? item.link ?? "(無題)", 256),
    url: safeUrl(item.link),
    description: item.summary && truncate(item.summary, SUMMARY_MAX_LENGTH),
    timestamp: item.publishedAt === undefined ? undefined : new Date(item.publishedAt).toISOString(),
    author: { name: truncate(feedTitle, 256) },
    color: EMBED_COLOR,
  };
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Discord rejects non-http(s) embed URLs */
function safeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}
