import path from "node:path";
import { createPostgresMessageStore } from "./postgresMessageStore.js";
import { createSqliteMessageStore } from "./sqliteMessageStore.js";

export type { MessageStore } from "./messageStore.js";

/**
 * Picks Postgres when DATABASE_URL is set, otherwise falls back to the
 * zero-setup SQLite store — lets anyone clone the repo and run the server
 * without standing up a database first, while still supporting the real
 * backend docs/ARCHITECTURE.md settles on for production. See
 * postgresMessageStore.ts's NOTE — that path hasn't been run against a
 * real Postgres server in this dev environment, verify it yourself.
 */
export async function createMessageStore(dataDir: string) {
  if (process.env.DATABASE_URL) {
    return createPostgresMessageStore(process.env.DATABASE_URL);
  }
  return createSqliteMessageStore(path.join(dataDir, "slacker.db"));
}
