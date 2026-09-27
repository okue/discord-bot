const API_BASE = "https://discord.com/api/v10";
const USER_AGENT = "DiscordBot (discord-bot, 0.1.0)";
const MAX_RATE_LIMIT_RETRIES = 3;

export class DiscordApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`Discord API error ${status}: ${body}`);
    this.name = "DiscordApiError";
    this.status = status;
    this.body = body;
  }
}

/** Minimal Discord REST API client. Without a token, requests are unauthenticated (for interaction webhooks) */
export class DiscordRest {
  private readonly token: string | undefined;

  constructor(token?: string) {
    this.token = token;
  }

  get<T>(route: `/${string}`): Promise<T> {
    return this.request("GET", route);
  }

  post<T>(route: `/${string}`, body: unknown): Promise<T> {
    return this.request("POST", route, body);
  }

  patch<T>(route: `/${string}`, body: unknown): Promise<T> {
    return this.request("PATCH", route, body);
  }

  put<T>(route: `/${string}`, body: unknown): Promise<T> {
    return this.request("PUT", route, body);
  }

  private async request<T>(method: string, route: string, body?: unknown, attempt = 0): Promise<T> {
    const headers: Record<string, string> = { "User-Agent": USER_AGENT };
    if (this.token) headers.Authorization = `Bot ${this.token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const res = await fetch(API_BASE + route, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      const data = (await res.json().catch(() => ({}))) as { retry_after?: number };
      await sleep((data.retry_after ?? 1) * 1000);
      return this.request(method, route, body, attempt + 1);
    }
    if (!res.ok) throw new DiscordApiError(res.status, await res.text());
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
