export interface FeedRow {
  id: number;
  url: string;
  title: string | null;
  etag: string | null;
  last_modified: string | null;
  /** JSON array. Read with parseSeenKeys */
  seen_keys: string;
  next_fetch_at: number;
  fail_count: number;
  last_error: string | null;
}

export interface SubscriptionRow {
  id: number;
  feed_id: number;
  guild_id: string;
  channel_id: string;
}

export interface SubscriptionWithFeedRow extends SubscriptionRow {
  url: string;
  title: string | null;
  fail_count: number;
  last_error: string | null;
}

export class RssRepository {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  findFeedByUrl(url: string): Promise<FeedRow | null> {
    return this.db.prepare("SELECT * FROM feeds WHERE url = ?").bind(url).first<FeedRow>();
  }

  getFeed(id: number): Promise<FeedRow | null> {
    return this.db.prepare("SELECT * FROM feeds WHERE id = ?").bind(id).first<FeedRow>();
  }

  /** Returns the new id, or null if the URL already exists */
  async insertFeed(feed: {
    url: string;
    title: string | undefined;
    etag: string | undefined;
    lastModified: string | undefined;
    seenKeys: readonly string[];
    nextFetchAt: number;
    now: number;
  }): Promise<number | null> {
    const row = await this.db
      .prepare(
        `INSERT INTO feeds (url, title, etag, last_modified, seen_keys, next_fetch_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (url) DO NOTHING
         RETURNING id`,
      )
      .bind(
        feed.url,
        feed.title ?? null,
        feed.etag ?? null,
        feed.lastModified ?? null,
        JSON.stringify(feed.seenKeys),
        feed.nextFetchAt,
        feed.now,
      )
      .first<{ id: number }>();
    return row?.id ?? null;
  }

  deleteFeedIfOrphan(feedId: number): Promise<D1Result> {
    return this.db
      .prepare(
        "DELETE FROM feeds WHERE id = ? AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE feed_id = ?)",
      )
      .bind(feedId, feedId)
      .run();
  }

  /** Claims up to `limit` due feeds, pushes their next fetch time forward, and returns their ids */
  async claimDueFeeds(now: number, nextFetchAt: number, limit: number): Promise<number[]> {
    const { results } = await this.db
      .prepare(
        `UPDATE feeds SET next_fetch_at = ?
         WHERE id IN (SELECT id FROM feeds WHERE next_fetch_at <= ? ORDER BY next_fetch_at LIMIT ?)
         RETURNING id`,
      )
      .bind(nextFetchAt, now, limit)
      .all<{ id: number }>();
    return results.map((r) => r.id);
  }

  recordFetchSuccess(
    feedId: number,
    feed: {
      title: string | null;
      etag: string | null;
      lastModified: string | null;
      seenKeys: readonly string[];
    },
  ): Promise<D1Result> {
    return this.db
      .prepare(
        `UPDATE feeds
         SET title = ?, etag = ?, last_modified = ?, seen_keys = ?, fail_count = 0, last_error = NULL
         WHERE id = ?`,
      )
      .bind(feed.title, feed.etag, feed.lastModified, JSON.stringify(feed.seenKeys), feedId)
      .run();
  }

  clearFetchFailure(feedId: number): Promise<D1Result> {
    return this.db
      .prepare("UPDATE feeds SET fail_count = 0, last_error = NULL WHERE id = ?")
      .bind(feedId)
      .run();
  }

  recordFetchFailure(feedId: number, error: string, nextFetchAt: number): Promise<D1Result> {
    return this.db
      .prepare(
        "UPDATE feeds SET fail_count = fail_count + 1, last_error = ?, next_fetch_at = ? WHERE id = ?",
      )
      .bind(error, nextFetchAt, feedId)
      .run();
  }

  /** Returns the new id, or null if already subscribed in the channel */
  async insertSubscription(sub: {
    feedId: number;
    guildId: string;
    channelId: string;
    createdBy: string;
    now: number;
  }): Promise<number | null> {
    const row = await this.db
      .prepare(
        `INSERT INTO subscriptions (feed_id, guild_id, channel_id, created_by, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (feed_id, channel_id) DO NOTHING
         RETURNING id`,
      )
      .bind(sub.feedId, sub.guildId, sub.channelId, sub.createdBy, sub.now)
      .first<{ id: number }>();
    return row?.id ?? null;
  }

  /** Returns the feed_id of the deleted subscription, or null if not found */
  async deleteSubscription(id: number, guildId: string): Promise<number | null> {
    const row = await this.db
      .prepare("DELETE FROM subscriptions WHERE id = ? AND guild_id = ? RETURNING feed_id")
      .bind(id, guildId)
      .first<{ feed_id: number }>();
    return row?.feed_id ?? null;
  }

  /** Returns the feed_id of the deleted subscription, or null if not found */
  async deleteSubscriptionByUrl(channelId: string, url: string): Promise<number | null> {
    const row = await this.db
      .prepare(
        `DELETE FROM subscriptions
         WHERE channel_id = ? AND feed_id = (SELECT id FROM feeds WHERE url = ?)
         RETURNING feed_id`,
      )
      .bind(channelId, url)
      .first<{ feed_id: number }>();
    return row?.feed_id ?? null;
  }

  async listSubscriptionsByChannel(channelId: string): Promise<SubscriptionWithFeedRow[]> {
    const { results } = await this.db
      .prepare(
        `SELECT s.id, s.feed_id, s.guild_id, s.channel_id, f.url, f.title, f.fail_count, f.last_error
         FROM subscriptions s JOIN feeds f ON f.id = s.feed_id
         WHERE s.channel_id = ?
         ORDER BY s.id`,
      )
      .bind(channelId)
      .all<SubscriptionWithFeedRow>();
    return results;
  }

  async listSubscriptionsByGuild(guildId: string): Promise<SubscriptionWithFeedRow[]> {
    const { results } = await this.db
      .prepare(
        `SELECT s.id, s.feed_id, s.guild_id, s.channel_id, f.url, f.title, f.fail_count, f.last_error
         FROM subscriptions s JOIN feeds f ON f.id = s.feed_id
         WHERE s.guild_id = ?
         ORDER BY s.channel_id, s.id`,
      )
      .bind(guildId)
      .all<SubscriptionWithFeedRow>();
    return results;
  }

  async listSubscriptionsByFeed(feedId: number): Promise<SubscriptionRow[]> {
    const { results } = await this.db
      .prepare("SELECT id, feed_id, guild_id, channel_id FROM subscriptions WHERE feed_id = ?")
      .bind(feedId)
      .all<SubscriptionRow>();
    return results;
  }
}

export function parseSeenKeys(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
