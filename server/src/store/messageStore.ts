import type { Message } from "@slacker/core";

/**
 * Message persistence, abstracted behind an interface so the SQLite
 * implementation (see sqliteMessageStore.ts — picked for zero extra setup
 * in dev, see docs/ARCHITECTURE.md's planned Postgres layer) can be swapped
 * out later without touching call sites in index.ts.
 */
export interface MessageStore {
  save(message: Message): void;
  /** Most recent `limit` messages, oldest first (ready to hand straight to a client as history). */
  recent(limit: number): Message[];
}
