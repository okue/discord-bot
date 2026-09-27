import {
  type APIApplicationCommandAutocompleteInteraction,
  type APIChatInputApplicationCommandInteraction,
  type APIInteraction,
  type APIInteractionResponse,
  ApplicationCommandType,
  InteractionResponseType,
  InteractionType,
} from "discord-api-types/v10";
import { ephemeral } from "./responses";
import type { AppContext, Command, Feature } from "./feature";

export type InteractionHandler = (
  interaction: APIInteraction,
  ctx: AppContext,
) => Promise<APIInteractionResponse>;

export function createInteractionHandler(features: readonly Feature[]): InteractionHandler {
  const commands = new Map<string, Command>();
  for (const command of features.flatMap((f) => f.commands ?? [])) {
    commands.set(command.definition.name, command);
  }
  const featuresByName = new Map(features.map((f) => [f.name, f]));

  return async (interaction, ctx) => {
    switch (interaction.type) {
      case InteractionType.Ping:
        return { type: InteractionResponseType.Pong };

      case InteractionType.ApplicationCommand: {
        const command = commands.get(interaction.data.name);
        if (!command || interaction.data.type !== ApplicationCommandType.ChatInput) {
          return ephemeral("未対応のコマンドです。");
        }
        return runSafely(() =>
          command.execute(interaction as APIChatInputApplicationCommandInteraction, ctx),
        );
      }

      case InteractionType.ApplicationCommandAutocomplete: {
        const command = commands.get(interaction.data.name);
        if (!command?.autocomplete) {
          return { type: InteractionResponseType.ApplicationCommandAutocompleteResult, data: { choices: [] } };
        }
        return command.autocomplete(
          interaction as APIApplicationCommandAutocompleteInteraction,
          ctx,
        );
      }

      case InteractionType.MessageComponent: {
        const [featureName = "", action = "", ...args] = interaction.data.custom_id.split(":");
        const handler = featuresByName.get(featureName)?.components?.[action];
        if (!handler) return ephemeral("未対応の操作です。");
        return runSafely(() => handler(interaction, args, ctx));
      }

      case InteractionType.ModalSubmit:
        return ephemeral("未対応の操作です。");
    }
  };
}

async function runSafely(
  fn: () => Promise<APIInteractionResponse>,
): Promise<APIInteractionResponse> {
  try {
    return await fn();
  } catch (error) {
    console.error("interaction handler failed", error);
    return ephemeral("エラーが発生しました。時間をおいて再度お試しください。");
  }
}
