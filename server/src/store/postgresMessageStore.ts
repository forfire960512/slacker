import postgres from "postgres";
import type { Message } from "@slacker/core";
import type { MessageStore } from "./messageStore.js";

interface MessageRow {
  id: string;
  text: string;
  links: string[];
  author: string;
  // postgres.js returns BIGINT as a string by default, to avoid silent
  // precision loss for values beyond Number.MAX_SAFE_INTEGER. Epoch-ms
  // timestamps are safe to convert back to number (good until year ~275861).
  created_at: string;
}

const SCHEMA_RETRY_ATTEMPTS = 5;
const SCHEMA_RETRY_DELAY_MS = 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Postgres-backed MessageStore — the real backend docs/ARCHITECTURE.md
 * settles on; sqliteMessageStore.ts is the zero-setup default for anyone
 * without a Postgres instance running. `connectionString` is a standard
 * `postgres://user:pass@host:port/db` URL (see server/.env.example and
 * server/docker-compose.yml for a local instance to point it at).
 */
export async function createPostgresMessageStore(connectionString: string): Promise<MessageStore> {
  const sql = postgres(connectionString);

  // `docker compose up -d` returns as soon as the container starts, not
  // once Postgres is actually accepting connections — so the very first
  // query right after bringing it up can legitimately hit ECONNREFUSED for
  // a second or two. Retry a few times before giving up for real.
  let lastError: unknown;
  for (let attempt = 1; attempt <= SCHEMA_RETRY_ATTEMPTS; attempt++) {
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS messages (
          id UUID PRIMARY KEY,
          text TEXT NOT NULL,
          links JSONB NOT NULL DEFAULT '[]'::jsonb,
          author TEXT NOT NULL,
          created_at BIGINT NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages (created_at)`;
      lastError = undefined;
      break;
    } catch (err) {
      lastError = err;
      if (attempt < SCHEMA_RETRY_ATTEMPTS) {
        await sleep(SCHEMA_RETRY_DELAY_MS);
      }
    }
  }
  if (lastError) {
    await sql.end({ timeout: 1 }).catch(() => {});
    throw new Error(
      `Could not reach Postgres at "${connectionString}" after ${SCHEMA_RETRY_ATTEMPTS} attempts. ` +
        "Check that it's actually running (`docker compose up -d` in server/, then `docker ps` to confirm) " +
        "and that DATABASE_URL matches — see server/README.md.",
      { cause: lastError },
    );
  }

  return {
    async save(message) {
      await sql`
        INSERT INTO messages (id, text, links, author, created_at)
        VALUES (
          ${message.id},
          ${message.text},
          ${sql.json(message.links)},
          ${message.author},
          ${message.createdAt}
        )
      `;
    },
    async recent(limit) {
      const rows = await sql<MessageRow[]>`
        SELECT id, text, links, author, created_at
        FROM messages
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      return rows
        .map(
          (row): Message => ({
            id: row.id,
            text: row.text,
            links: row.links,
            author: row.author,
            createdAt: Number(row.created_at),
          }),
        )
        .reverse(); // rows come back newest-first; flip to chronological
    },
  };
}
