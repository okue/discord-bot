import { Routes } from "discord-api-types/v10";
import { DiscordRest } from "../../core/rest";
import type { Env } from "../../env";
import { FeedFetchError, fetchFeed } from "./fetcher";
import { packMessages, toMessageContent } from "./formatter";
import { type FeedItem, FeedParseError, type ParsedFeed, parseFeed } from "./parser";
import { RssRepository, type SubscriptionRow, parseSeenKeys } from "./repository";

export const FETCH_INTERVAL_MS = 10 * 60 * 1000;
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000;
/** Max items posted per fetch. The rest are marked as seen */
const MAX_POSTS_PER_FETCH = 10;
/** Keeps posts per fetch low (queue subrequest limit, Discord rate limit) */
const ITEMS_PER_MESSAGE = 5;
/**
 * Max keys kept in feeds.seen_keys (or the feed size, if larger). Keeping it above the feed size
 * prevents reposting items that briefly drop out of the feed and come back
 */
const MAX_SEEN_KEYS = 200;
/** Queue sendBatch limit */
const CLAIM_LIMIT = 100;
const MAX_CLAIM_ROUNDS = 10;

export interface FeedJob {
  feedId: number;
}

export async function enqueueDueFeeds(env: Env): Promise<void> {
  const repo = new RssRepository(env.DB);
  const now = Date.now();
  for (let round = 0; round < MAX_CLAIM_ROUNDS; round++) {
    const feedIds = await repo.claimDueFeeds(now, now + FETCH_INTERVAL_MS, CLAIM_LIMIT);
    if (feedIds.length === 0) return;
    await env.JOB_QUEUE.sendBatch(
      feedIds.map((feedId) => ({ body: { feature: "rss", body: { feedId } satisfies FeedJob } })),
    );
    if (feedIds.length < CLAIM_LIMIT) return;
  }
}

/**
 * Fetches a feed and posts new items to all subscribed channels.
 * Seen keys are saved before posting, so failed posts are not retried (missed items are acceptable).
 */
export async function processFeed(feedId: number, env: Env): Promise<void> {
  const repo = new RssRepository(env.DB);
  const feed = await repo.getFeed(feedId);
  if (!feed) return;

  const subscriptions = await repo.listSubscriptionsByFeed(feedId);
  if (subscriptions.length === 0) {
    await repo.deleteFeedIfOrphan(feedId);
    return;
  }

  const now = Date.now();
  let parsed: ParsedFeed;
  let etag: string | null;
  let lastModified: string | null;
  try {
    const result = await fetchFeed(feed.url, { etag: feed.etag, lastModified: feed.last_modified });
    if (result.status === "not_modified") {
      if (feed.fail_count > 0) await repo.clearFetchFailure(feedId);
      return;
    }
    parsed = parseFeed(result.body);
    etag = result.etag ?? null;
    lastModified = result.lastModified ?? null;
  } catch (error) {
    if (error instanceof FeedFetchError || error instanceof FeedParseError) {
      await repo.recordFetchFailure(feedId, error.message, now + backoff(feed.fail_count + 1));
      return;
    }
    throw error;
  }

  const previousKeys = parseSeenKeys(feed.seen_keys);
  const seen = new Set(previousKeys);
  const fresh = [...new Map(parsed.items.map((item) => [item.key, item])).values()].filter(
    (item) => !seen.has(item.key),
  );

  await repo.recordFetchSuccess(feedId, {
    title: parsed.title ?? feed.title,
    etag,
    lastModified,
    seenKeys: mergeSeenKeys(parsed.items.map((item) => item.key), previousKeys),
  });

  await postItems(env, subscriptions, oldestFirst(fresh).slice(-MAX_POSTS_PER_FETCH));
}

/**
 * Current keys first, then previous keys, truncated to `limit`.
 * All current keys are always kept, otherwise items beyond the limit in a large feed would be
 * treated as new on every fetch.
 */
export function mergeSeenKeys(
  current: readonly string[],
  previous: readonly string[],
  limit = MAX_SEEN_KEYS,
): string[] {
  return [...new Set([...current, ...previous])].slice(0, Math.max(limit, current.length));
}

async function postItems(
  env: Env,
  subscriptions: readonly SubscriptionRow[],
  items: readonly FeedItem[],
): Promise<void> {
  if (items.length === 0) return;
  const rest = new DiscordRest(env.DISCORD_BOT_TOKEN);
  const messages = toMessages(items);

  for (const sub of subscriptions) {
    try {
      for (const content of messages) {
        await rest.post(Routes.channelMessages(sub.channel_id), {
          content,
          allowed_mentions: { parse: [] },
        });
      }
    } catch (error) {
      // Keep posting to other subscriptions (e.g. missing permission, deleted channel)
      console.error(`cannot post to channel ${sub.channel_id} (subscription ${sub.id})`, error);
    }
  }
}

/** Message contents for items, as posted to channels */
export function toMessages(items: readonly FeedItem[]): string[] {
  // Discord shows a link preview (with thumbnail) for each URL in a message
  return packMessages(items.map(toMessageContent), ITEMS_PER_MESSAGE);
}

/** Sort by date if every item has one; otherwise reverse feed order (usually newest first) */
export function oldestFirst(items: readonly FeedItem[]): FeedItem[] {
  if (items.every((item) => item.publishedAt !== undefined)) {
    return [...items].sort((a, b) => (a.publishedAt ?? 0) - (b.publishedAt ?? 0));
  }
  return [...items].reverse();
}

function backoff(failCount: number): number {
  return Math.min(FETCH_INTERVAL_MS * 2 ** failCount, MAX_BACKOFF_MS);
}
