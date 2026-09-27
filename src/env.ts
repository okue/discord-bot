import type { JobMessage } from "./core/feature";

export interface Env {
  DB: D1Database;
  JOB_QUEUE: Queue<JobMessage>;
  DISCORD_APPLICATION_ID: string;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_BOT_TOKEN: string;
}
