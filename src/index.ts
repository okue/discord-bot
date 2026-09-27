import type { APIInteraction } from "discord-api-types/v10";
import { syncCommands } from "./core/commands";
import { verifyDiscordRequest } from "./core/verify";
import type { AppContext, JobMessage } from "./core/feature";
import { createInteractionHandler } from "./core/router";
import type { Env } from "./env";
import { features } from "./features";

const handleInteraction = createInteractionHandler(features);
const featuresByName = new Map(features.map((f) => [f.name, f]));
const commandDefinitions = features.flatMap((f) => f.commands ?? []).map((c) => c.definition);

function createContext(env: Env, exec: ExecutionContext): AppContext {
  return { env, waitUntil: (promise) => exec.waitUntil(promise) };
}

export default {
  async fetch(request, env, exec) {
    const { pathname } = new URL(request.url);
    if (request.method !== "POST" || pathname !== "/interactions") {
      return new Response("Not Found", { status: 404 });
    }

    const body = await verifyDiscordRequest(request, env.DISCORD_PUBLIC_KEY);
    if (body === null) return new Response("Invalid request signature", { status: 401 });

    const interaction = JSON.parse(body) as APIInteraction;
    return Response.json(await handleInteraction(interaction, createContext(env, exec)));
  },

  async scheduled(controller, env, exec) {
    const ctx = createContext(env, exec);
    const results = await Promise.allSettled([
      syncCommands(env, commandDefinitions),
      ...features.map((f) => f.scheduled?.(controller, ctx)),
    ]);
    for (const result of results) {
      if (result.status === "rejected") console.error("scheduled job failed", result.reason);
    }
  },

  async queue(batch, env, exec) {
    const ctx = createContext(env, exec);
    for (const message of batch.messages) {
      const feature = featuresByName.get(message.body.feature);
      if (!feature?.job) {
        console.error("no job handler", message.body);
        message.ack();
        continue;
      }
      try {
        await feature.job(message.body.body, ctx);
        message.ack();
      } catch (error) {
        console.error(`job failed: ${message.body.feature}`, error);
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env, JobMessage>;
