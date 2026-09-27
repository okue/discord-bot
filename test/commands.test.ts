import type { RESTPutAPIApplicationCommandsJSONBody } from "discord-api-types/v10";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncCommands } from "../src/core/commands";
import type { Env } from "../src/env";

/** In-memory stand-in for the app_state table */
function createEnv(): { env: Env; state: Map<string, string> } {
  const state = new Map<string, string>();
  const db = {
    prepare: () => ({
      bind: (...args: string[]) => ({
        first: async () => {
          const value = state.get(args[0] ?? "");
          return value === undefined ? null : { value };
        },
        run: async () => {
          state.set(args[0] ?? "", args[1] ?? "");
        },
      }),
    }),
  };
  const env = {
    DB: db,
    DISCORD_APPLICATION_ID: "app",
    DISCORD_BOT_TOKEN: "token",
  } as unknown as Env;
  return { env, state };
}

const v1: RESTPutAPIApplicationCommandsJSONBody = [{ name: "rss", description: "v1" }];
const v2: RESTPutAPIApplicationCommandsJSONBody = [{ name: "rss", description: "v2" }];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => Response.json([]));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("syncCommands", () => {
  it("registers global commands on first run", async () => {
    const { env, state } = createEnv();

    expect(await syncCommands(env, v1)).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://discord.com/api/v10/applications/app/commands");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual(v1);
    expect(state.has("commands_hash")).toBe(true);
  });

  it("skips when definitions are unchanged", async () => {
    const { env } = createEnv();
    await syncCommands(env, v1);

    expect(await syncCommands(env, v1)).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("re-registers when definitions change", async () => {
    const { env } = createEnv();
    await syncCommands(env, v1);

    expect(await syncCommands(env, v2)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the old hash when Discord rejects the request", async () => {
    const { env, state } = createEnv();
    fetchMock.mockResolvedValueOnce(new Response("bad", { status: 400 }));

    await expect(syncCommands(env, v1)).rejects.toThrow("400");
    expect(state.has("commands_hash")).toBe(false);
  });
});
