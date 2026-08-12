import type { Message } from "@slacker/core";

/**
 * Message persistence, abstracted behind an interface so backends can be
 * swapped without touching call sites in index.ts. Async because the real
 * backend (Postgres, see postgresMessageStore.ts) is inherently
 * network I/O — sqliteMessageStore.ts's synchronous node:sqlite calls just
 * resolve immediately.
 */
export interface MessageStore {
  save(message: Message): Promise<void>;
  /** Most recent `limit` messages, oldest first (ready to hand straight to a client as history). */
  recent(limit: number): Promise<Message[]>;
}
