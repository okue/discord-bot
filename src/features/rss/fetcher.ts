const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = "discord-bot/0.1";

export type FetchResult =
  | { status: "not_modified" }
  | { status: "ok"; body: string; etag?: string; lastModified?: string };

export class FeedFetchError extends Error {
  override name = "FeedFetchError";
}

/** Fetches a feed with a conditional GET (ETag / Last-Modified) */
export async function fetchFeed(
  url: string,
  cache: { etag?: string | null; lastModified?: string | null } = {},
): Promise<FetchResult> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
  };
  if (cache.etag) headers["If-None-Match"] = cache.etag;
  if (cache.lastModified) headers["If-Modified-Since"] = cache.lastModified;

  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (error) {
    throw new FeedFetchError(`取得に失敗しました: ${String(error)}`);
  }

  if (res.status === 304) return { status: "not_modified" };
  if (!res.ok) throw new FeedFetchError(`HTTP ${res.status}`);

  return {
    status: "ok",
    body: await res.text(),
    etag: res.headers.get("ETag") ?? undefined,
    lastModified: res.headers.get("Last-Modified") ?? undefined,
  };
}

/** Normalizes a user-supplied URL. Returns undefined unless it is http(s) */
export function normalizeFeedUrl(input: string): string | undefined {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  url.hash = "";
  return url.toString();
}
