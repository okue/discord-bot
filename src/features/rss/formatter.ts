import type { FeedItem } from "./parser";

/** Discord's message content limit */
export const MESSAGE_MAX_LENGTH = 2000;
/** Before escaping; escaping at most doubles it */
const TITLE_MAX_LENGTH = 200;
/** Longer URLs are dropped, keeping each item well under the message limit */
const URL_MAX_LENGTH = 1000;
const URL_IN_TEXT = /https?:\/\/[^\s<>]+/g;

/**
 * Bold title and a bare URL on the next line, so Discord unfurls the link with its thumbnail.
 * Falls back to the bare URL (or title alone) when the other is missing.
 */
export function toMessageContent(item: FeedItem): string {
  const url = safeUrl(item.link);
  const title = item.title?.replace(/\s+/g, " ").trim();
  const heading = title ? `**${formatTitle(truncate(title, TITLE_MAX_LENGTH))}**` : undefined;
  return [heading ?? (url ? undefined : "**(無題)**"), url].filter(Boolean).join("\n");
}

/**
 * Packs item contents into as few messages as possible, at most `perMessage` items each.
 * Each content must fit in a message on its own.
 */
export function packMessages(contents: readonly string[], perMessage: number): string[] {
  const messages: string[][] = [];
  let length = 0;
  for (const content of contents) {
    const last = messages.at(-1);
    const separated = length + 2 + content.length;
    if (last && last.length < perMessage && separated <= MESSAGE_MAX_LENGTH) {
      last.push(content);
      length = separated;
    } else {
      messages.push([content]);
      length = content.length;
    }
  }
  return messages.map((group) => group.join("\n\n"));
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Escapes markdown, and wraps URLs in <> so they are neither masked links nor extra previews */
function formatTitle(text: string): string {
  let result = "";
  let last = 0;
  for (const match of text.matchAll(URL_IN_TEXT)) {
    const url = trimUrl(match[0]);
    result += escapeMarkdown(text.slice(last, match.index)) + `<${url}>`;
    last = match.index + url.length;
  }
  return result + escapeMarkdown(text.slice(last));
}

/** Drops trailing punctuation and unbalanced `)`, like GitHub autolinks: "(see https://a/b)." */
function trimUrl(url: string): string {
  let end = url.length;
  const open = [...url].filter((c) => c === "(").length;
  let close = [...url].filter((c) => c === ")").length;
  while (end > 0) {
    const c = url.charAt(end - 1);
    if (c === ")" && close > open) {
      close--;
    } else if (!".,!?:;'\"".includes(c)) {
      break;
    }
    end--;
  }
  return url.slice(0, end);
}

function escapeMarkdown(text: string): string {
  return text.replace(/[\\*_~`|[\]()<>#:-]/g, "\\$&");
}

/** Only http(s) URLs are unfurled; anything else is dropped. Returns the normalized form */
function safeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const { protocol, href } = new URL(url.trim());
    if (protocol !== "http:" && protocol !== "https:") return undefined;
    return href.length <= URL_MAX_LENGTH ? href : undefined;
  } catch {
    return undefined;
  }
}
