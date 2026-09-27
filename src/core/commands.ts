import { type RESTPutAPIApplicationCommandsJSONBody, Routes } from "discord-api-types/v10";
import type { Env } from "../env";
import { DiscordRest } from "./rest";

const HASH_KEY = "commands_hash";

/**
 * Registers global commands with Discord if their definitions changed since the last sync.
 * Runs on every cron tick, so command changes go live within 5 minutes of a deploy.
 */
export async function syncCommands(
  env: Env,
  definitions: RESTPutAPIApplicationCommandsJSONBody,
): Promise<boolean> {
  const hash = await sha256(
    JSON.stringify({ applicationId: env.DISCORD_APPLICATION_ID, definitions }),
  );
  const stored = await env.DB.prepare("SELECT value FROM app_state WHERE key = ?")
    .bind(HASH_KEY)
    .first<{ value: string }>();
  if (stored?.value === hash) return false;

  await new DiscordRest(env.DISCORD_BOT_TOKEN).put(
    Routes.applicationCommands(env.DISCORD_APPLICATION_ID),
    definitions,
  );
  await env.DB.prepare(
    "INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
  )
    .bind(HASH_KEY, hash)
    .run();
  console.log(`registered ${definitions.length} command(s)`);
  return true;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
