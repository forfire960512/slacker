import { DatabaseSync } from "node:sqlite";
import type { Message } from "@slacker/core";
import type { MessageStore } from "./messageStore.js";

interface MessageRow {
  id: string;
  text: string;
  links: string;
  author: string;
  created_at: number;
}

/**
 * SQLite-backed MessageStore using Node's built-in `node:sqlite` (still
 * experimental as of this Node version, but needs no native build step or
 * external service — unlike better-sqlite3 or Postgres — so it's the
 * lowest-friction way to get real persistence in dev). `dbPath` should
 * point somewhere gitignored (see server/.gitignore) since it holds real
 * message content.
 */
export function createSqliteMessageStore(dbPath: string): MessageStore {
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      links TEXT NOT NULL,
      author TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS messages_created_at ON messages (created_at)`);

  const insertStmt = db.prepare(
    "INSERT INTO messages (id, text, links, author, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const recentStmt = db.prepare(
    "SELECT id, text, links, author, created_at FROM messages ORDER BY created_at DESC LIMIT ?",
  );

  return {
    save(message) {
      insertStmt.run(message.id, message.text, JSON.stringify(message.links), message.author, message.createdAt);
    },
    recent(limit) {
      const rows = recentStmt.all(limit) as unknown as MessageRow[];
      return rows
        .map(
          (row): Message => ({
            id: row.id,
            text: row.text,
            links: JSON.parse(row.links) as string[],
            author: row.author,
            createdAt: row.created_at,
          }),
        )
        .reverse(); // rows come back newest-first; flip to chronological
    },
  };
}
