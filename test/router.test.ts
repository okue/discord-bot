import {
  type APIInteraction,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
} from "discord-api-types/v10";
import { describe, expect, it, vi } from "vitest";
import type { AppContext, Feature } from "../src/core/feature";
import { createInteractionHandler } from "../src/core/router";

const ctx = { env: {}, waitUntil: () => {} } as unknown as AppContext;

function interaction(partial: object): APIInteraction {
  return partial as APIInteraction;
}

describe("createInteractionHandler", () => {
  it("responds to PING with PONG", async () => {
    const handle = createInteractionHandler([]);
    expect(await handle(interaction({ type: InteractionType.Ping }), ctx)).toEqual({
      type: InteractionResponseType.Pong,
    });
  });

  it("routes components by the custom_id prefix", async () => {
    const unsub = vi.fn(async () => ({ type: InteractionResponseType.DeferredMessageUpdate }) as const);
    const feature: Feature = { name: "rss", components: { unsub } };
    const handle = createInteractionHandler([feature]);

    await handle(
      interaction({ type: InteractionType.MessageComponent, data: { custom_id: "rss:unsub:42" } }),
      ctx,
    );
    expect(unsub).toHaveBeenCalledWith(expect.anything(), ["42"], ctx);
  });

  it("returns an error message when a command throws", async () => {
    const feature: Feature = {
      name: "boom",
      commands: [
        {
          definition: { name: "boom", description: "boom" },
          execute: async () => {
            throw new Error("boom");
          },
        },
      ],
    };
    const handle = createInteractionHandler([feature]);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await handle(
      interaction({ type: InteractionType.ApplicationCommand, data: { name: "boom", type: 1 } }),
      ctx,
    );
    expect(response).toMatchObject({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { flags: MessageFlags.Ephemeral },
    });
  });
});
