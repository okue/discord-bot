import type {
  APIApplicationCommandAutocompleteInteraction,
  APIChatInputApplicationCommandInteraction,
  APIInteractionResponse,
  APIMessageComponentInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import type { Env } from "../env";

export interface AppContext {
  env: Env;
  waitUntil(promise: Promise<unknown>): void;
}

export interface Command {
  definition: RESTPostAPIChatInputApplicationCommandsJSONBody;
  execute(
    interaction: APIChatInputApplicationCommandInteraction,
    ctx: AppContext,
  ): Promise<APIInteractionResponse>;
  autocomplete?(
    interaction: APIApplicationCommandAutocompleteInteraction,
    ctx: AppContext,
  ): Promise<APIInteractionResponse>;
}

/** Handler for the `action` part of custom_id `<feature>:<action>:<args...>` */
export type ComponentHandler = (
  interaction: APIMessageComponentInteraction,
  args: string[],
  ctx: AppContext,
) => Promise<APIInteractionResponse>;

/** Queue message, routed to the feature named by `feature` */
export interface JobMessage {
  feature: string;
  body: unknown;
}

export interface Feature {
  name: string;
  commands?: Command[];
  components?: Record<string, ComponentHandler>;
  scheduled?(controller: ScheduledController, ctx: AppContext): Promise<void>;
  job?(body: unknown, ctx: AppContext): Promise<void>;
}
