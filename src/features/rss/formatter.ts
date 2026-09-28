import type { FeedItem } from "./parser";

const TITLE_MAX_LENGTH = 256;

/**
 * Bold title and a bare URL on the next line, so Discord unfurls the link with its thumbnail.
 * Falls back to the bare URL (or title alone) when the other is missing.
 */
export function toMessageContent(item: FeedItem): string {
  const url = safeUrl(item.link);
  const title = item.title?.replace(/\s+/g, " ").trim();
  const heading = title ? `**${escapeMarkdown(truncate(title, TITLE_MAX_LENGTH))}**` : undefined;
  return [heading ?? (url ? undefined : "**(無題)**"), url].filter(Boolean).join("\n");
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[\\*_~`|]/g, "\\$&");
}

/** Only http(s) URLs are unfurled; anything else is dropped */
function safeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}
