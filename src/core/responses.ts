import {
  type APIInteractionResponse,
  InteractionResponseType,
  MessageFlags,
  Routes,
} from "discord-api-types/v10";
import type { Env } from "../env";
import { DiscordRest } from "./rest";

export function ephemeral(content: string): APIInteractionResponse {
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content, flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } },
  };
}

/** For work that may exceed 3 seconds. Replace the content later with editOriginalResponse */
export function deferredEphemeral(): APIInteractionResponse {
  return {
    type: InteractionResponseType.DeferredChannelMessageWithSource,
    data: { flags: MessageFlags.Ephemeral },
  };
}

export async function editOriginalResponse(
  env: Env,
  interactionToken: string,
  content: string,
): Promise<void> {
  await new DiscordRest().patch(
    Routes.webhookMessage(env.DISCORD_APPLICATION_ID, interactionToken, "@original"),
    { content, allowed_mentions: { parse: [] } },
  );
}
