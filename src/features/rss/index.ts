import type { Feature } from "../../core/feature";
import { rssCommand } from "./commands";
import { type FeedJob, enqueueDueFeeds, processFeed } from "./poller";

export const rssFeature: Feature = {
  name: "rss",
  commands: [rssCommand],
  scheduled: (_controller, ctx) => enqueueDueFeeds(ctx.env),
  job: (body, ctx) => processFeed((body as FeedJob).feedId, ctx.env),
};
