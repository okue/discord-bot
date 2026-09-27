import {
  type APIApplicationCommandAutocompleteInteraction,
  type APIChatInputApplicationCommandInteraction,
  type APIInteractionResponse,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  InteractionContextType,
  InteractionResponseType,
  PermissionFlagsBits,
  Routes,
} from "discord-api-types/v10";
import { type OptionLike, getFocusedOption, getStringOption, getSubcommand } from "../../core/options";
import { deferredEphemeral, editOriginalResponse, ephemeral } from "../../core/responses";
import { DiscordApiError, DiscordRest } from "../../core/rest";
import type { AppContext, Command } from "../../core/feature";
import type { Env } from "../../env";
import { FeedFetchError, fetchFeed, normalizeFeedUrl } from "./fetcher";
import { truncate } from "./formatter";
import { FeedParseError, parseFeed } from "./parser";
import { FETCH_INTERVAL_MS, mergeSeenKeys } from "./poller";
import { RssRepository } from "./repository";

const MESSAGE_MAX_LENGTH = 2000;

export const rssCommand: Command = {
  definition: {
    name: "rss",
    description: "RSS フィードの購読を管理します",
    type: ApplicationCommandType.ChatInput,
    default_member_permissions: String(PermissionFlagsBits.ManageChannels),
    contexts: [InteractionContextType.Guild],
    options: [
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: "add",
        description: "このチャンネルでフィードを購読します",
        options: [
          {
            type: ApplicationCommandOptionType.String,
            name: "url",
            description: "RSS / Atom フィードの URL",
            required: true,
          },
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: "remove",
        description: "このチャンネルの購読を解除します",
        options: [
          {
            type: ApplicationCommandOptionType.String,
            name: "url",
            description: "解除するフィードの URL",
            required: true,
            autocomplete: true,
          },
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: "list",
        description: "このサーバーの購読一覧を表示します",
      },
    ],
  },

  async execute(interaction, ctx) {
    const guildId = interaction.guild_id;
    if (!guildId) return ephemeral("サーバー内で実行してください。");

    const sub = getSubcommand(interaction.data.options as OptionLike[] | undefined);
    switch (sub?.name) {
      case "add":
        return add(interaction, guildId, sub.options, ctx);
      case "remove":
        return remove(guildId, interaction.channel.id, sub.options, ctx.env);
      case "list":
        return list(guildId, ctx.env);
      default:
        return ephemeral("未対応のサブコマンドです。");
    }
  },

  async autocomplete(interaction, ctx) {
    return {
      type: InteractionResponseType.ApplicationCommandAutocompleteResult,
      data: { choices: await subscriptionChoices(interaction, ctx.env) },
    };
  },
};

function add(
  interaction: APIChatInputApplicationCommandInteraction,
  guildId: string,
  options: OptionLike[],
  ctx: AppContext,
): APIInteractionResponse {
  const url = normalizeFeedUrl(getStringOption(options, "url") ?? "");
  if (!url) return ephemeral("http(s) の URL を指定してください。");

  const channelId = interaction.channel.id;
  const userId = interaction.member?.user.id ?? "unknown";

  // Fetching the feed may exceed 3 seconds, so respond with a deferred message first
  ctx.waitUntil(
    subscribe(ctx.env, { url, guildId, channelId, userId })
      .catch((error: unknown) => {
        console.error("rss add failed", error);
        return "❌ エラーが発生しました。時間をおいて再度お試しください。";
      })
      .then((message) => editOriginalResponse(ctx.env, interaction.token, message)),
  );
  return deferredEphemeral();
}

async function subscribe(
  env: Env,
  req: { url: string; guildId: string; channelId: string; userId: string },
): Promise<string> {
  const repo = new RssRepository(env.DB);
  const now = Date.now();

  let feedId: number;
  let title: string;
  const existing = await repo.findFeedByUrl(req.url);
  if (existing) {
    feedId = existing.id;
    title = existing.title ?? req.url;
  } else {
    let result;
    let parsed;
    try {
      result = await fetchFeed(req.url);
      if (result.status !== "ok") throw new FeedFetchError("unexpected 304");
      parsed = parseFeed(result.body);
    } catch (error) {
      if (error instanceof FeedFetchError || error instanceof FeedParseError) {
        return `❌ フィードを読み込めませんでした: ${error.message}`;
      }
      throw error;
    }

    title = parsed.title ?? req.url;
    const inserted = await repo.insertFeed({
      url: req.url,
      title: parsed.title,
      etag: result.etag,
      lastModified: result.lastModified,
      // Don't post items that already exist
      seenKeys: mergeSeenKeys(parsed.items.map((item) => item.key), []),
      nextFetchAt: now + FETCH_INTERVAL_MS,
      now,
    });
    if (inserted === null) {
      // The same URL was registered concurrently
      const raced = await repo.findFeedByUrl(req.url);
      if (!raced) throw new Error(`feed disappeared: ${req.url}`);
      feedId = raced.id;
    } else {
      feedId = inserted;
    }
  }

  const subscriptionId = await repo.insertSubscription({
    feedId,
    guildId: req.guildId,
    channelId: req.channelId,
    createdBy: req.userId,
    now,
  });
  if (subscriptionId === null) return `ℹ️ <#${req.channelId}> では既に購読しています。`;

  // Post a welcome message to check that the bot can post to the channel
  try {
    await new DiscordRest(env.DISCORD_BOT_TOKEN).post(Routes.channelMessages(req.channelId), {
      content: `📰 **${title}** の購読を開始しました\n<${req.url}>`,
      allowed_mentions: { parse: [] },
    });
  } catch (error) {
    if (error instanceof DiscordApiError && (error.status === 403 || error.status === 404)) {
      await repo.deleteSubscription(subscriptionId, req.guildId);
      await repo.deleteFeedIfOrphan(feedId);
      return `❌ <#${req.channelId}> に投稿できません。Bot にチャンネルの閲覧・送信権限があるか確認してください。`;
    }
    throw error;
  }

  return `✅ <#${req.channelId}> で **${title}** を購読しました。新着は約 ${FETCH_INTERVAL_MS / 60_000} 分ごとに確認します。`;
}

async function remove(
  guildId: string,
  channelId: string,
  options: OptionLike[],
  env: Env,
): Promise<APIInteractionResponse> {
  const value = getStringOption(options, "url") ?? "";
  const repo = new RssRepository(env.DB);

  let feedId: number | null;
  if (/^\d+$/.test(value)) {
    // Autocomplete value for URLs longer than Discord's 100-character limit
    feedId = await repo.deleteSubscription(Number(value), guildId);
  } else {
    const url = normalizeFeedUrl(value);
    if (!url) return ephemeral("http(s) の URL を指定してください。");
    feedId = await repo.deleteSubscriptionByUrl(channelId, url);
  }

  if (feedId === null) return ephemeral("このチャンネルではそのフィードを購読していません。");
  await repo.deleteFeedIfOrphan(feedId);
  return ephemeral("🗑️ 購読を解除しました。");
}

async function list(guildId: string, env: Env): Promise<APIInteractionResponse> {
  const subscriptions = await new RssRepository(env.DB).listSubscriptionsByGuild(guildId);
  if (subscriptions.length === 0) return ephemeral("このサーバーの購読はありません。");

  const lines = subscriptions.map((s) => {
    const warning = s.fail_count > 0 ? `\n  ⚠️ 取得失敗 ${s.fail_count} 回: ${s.last_error ?? ""}` : "";
    return `- <#${s.channel_id}> **${s.title ?? s.url}**\n  <${s.url}>${warning}`;
  });
  return ephemeral(truncate(lines.join("\n"), MESSAGE_MAX_LENGTH));
}

/** Choices for `/rss remove`: subscriptions in the current channel */
async function subscriptionChoices(
  interaction: APIApplicationCommandAutocompleteInteraction,
  env: Env,
): Promise<{ name: string; value: string }[]> {
  const channelId = interaction.channel?.id;
  if (!channelId) return [];

  const sub = getSubcommand(interaction.data.options as OptionLike[] | undefined);
  const query = String(getFocusedOption(sub?.options ?? [])?.value ?? "").toLowerCase();
  const subscriptions = await new RssRepository(env.DB).listSubscriptionsByChannel(channelId);
  return subscriptions
    .filter((s) => `${s.title ?? ""} ${s.url}`.toLowerCase().includes(query))
    .slice(0, 25)
    .map((s) => ({
      name: truncate(`${s.title ?? s.url} (${s.url})`, 100),
      value: s.url.length <= 100 ? s.url : String(s.id),
    }));
}
