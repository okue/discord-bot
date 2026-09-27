# discord-bot

An extensible Discord bot running on Cloudflare Workers.

## Features

### RSS

Posts new articles from RSS / Atom feeds to Discord channels.

| Command | Description |
| --- | --- |
| `/rss add <url>` | Subscribe the current channel to a feed |
| `/rss remove <url>` | Unsubscribe the current channel from a feed (with autocomplete) |
| `/rss list` | List all subscriptions in the server |

- New articles are checked about every 10 minutes.
- Only articles that appear in the feed after subscribing are posted.
- Up to 10 articles are posted per check; any beyond that are skipped.
- Feeds that fail to load are retried less often (down to once a day). `/rss list` shows failing feeds.
- Posting is best-effort: an article may occasionally be missed.
- Supports RSS 2.0, RSS 1.0 (RDF) and Atom.

### Permissions

- Commands require the **Manage Channels** permission by default. Server admins can change this under Server Settings → Integrations.
- The bot needs **View Channels**, **Send Messages** and **Embed Links** in channels where it posts.

## Setup

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications). Note the Application ID, Public Key and Bot Token.
2. Create Cloudflare resources:

   ```sh
   pnpm install
   npx wrangler login
   npx wrangler d1 create discord-bot      # put database_id into wrangler.jsonc
   npx wrangler queues create discord-bot-jobs
   pnpm db:migrate:remote
   ```

3. Set `DISCORD_APPLICATION_ID` and `DISCORD_PUBLIC_KEY` in `wrangler.jsonc`, then deploy:

   ```sh
   npx wrangler secret put DISCORD_BOT_TOKEN
   pnpm run deploy
   ```

4. Set **Interactions Endpoint URL** in the Developer Portal to `https://<worker>.workers.dev/interactions`.
5. Invite the bot via OAuth2 → URL Generator with scopes `bot` + `applications.commands` and permissions View Channels, Send Messages, Embed Links.

Commands appear within 5 minutes of the deploy.

## Development

For `wrangler dev`, copy `.dev.vars.example` to `.dev.vars` and set local secrets.

```sh
pnpm test
pnpm typecheck
pnpm db:migrate:local
pnpm dev             # trigger cron manually: http://localhost:8787/__scheduled
```

See [docs/architecture.md](docs/architecture.md) for design and internals.
