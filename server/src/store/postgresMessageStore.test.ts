import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Message } from "@slacker/core";
import { createPostgresMessageStore } from "./postgresMessageStore.js";

// Matches server/docker-compose.yml + server/.env.example exactly — the
// same default a contributor gets from `docker compose up -d` in server/,
// and what CI's postgres service container is configured with (see
// .github/workflows/ci.yml).
const CONNECTION_STRING = process.env.DATABASE_URL ?? "postgres://slacker:slacker@localhost:5432/slacker";

/**
 * There's no `:memory:` equivalent for Postgres the way
 * sqliteMessageStore.test.ts has, so these tests need a real instance
 * reachable at CONNECTION_STRING. Rather than an opt-in env flag (which
 * would mean even a contributor who already has Docker Desktop running has
 * to remember one) or always running (which would break `pnpm test` for
 * anyone without Postgres up — including this repo's own dev sandbox, which
 * has no reachable Docker daemon), probe reachability once up front with a
 * short connect timeout and skip the whole suite if nothing answers.
 */
async function isPostgresReachable(connectionString: string): Promise<boolean> {
  const probe = postgres(connectionString, { connect_timeout: 2, max: 1 });
  try {
    await probe`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.end({ timeout: 1 }).catch(() => {});
  }
}

const reachable = await isPostgresReachable(CONNECTION_STRING);

if (!reachable) {
  console.warn(
    `[postgresMessageStore.test.ts] Skipping — no Postgres reachable at ${CONNECTION_STRING}. ` +
      "Run `docker compose up -d` in server/ to enable these tests locally.",
  );
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return { id: randomUUID(), text: "hello", links: [], author: "alice", createdAt: 1000, ...overrides };
}

describe.skipIf(!reachable)("createPostgresMessageStore", () => {
  // createPostgresMessageStore()'s returned MessageStore doesn't expose its
  // internal `sql` handle, so cleanup between tests needs its own separate
  // connection. CREATE TABLE IF NOT EXISTS is idempotent (won't wipe rows
  // on its own), so this TRUNCATE is mandatory, not optional.
  let cleanupClient: ReturnType<typeof postgres>;

  beforeAll(() => {
    cleanupClient = postgres(CONNECTION_STRING);
  });

  afterEach(async () => {
    await cleanupClient`TRUNCATE messages`;
  });

  afterAll(async () => {
    await cleanupClient.end();
  });

  it("returns an empty list from a fresh store", async () => {
    const store = await createPostgresMessageStore(CONNECTION_STRING);

    expect(await store.recent(10)).toEqual([]);
  });

  it("round-trips a saved message, including a non-empty links array", async () => {
    const store = await createPostgresMessageStore(CONNECTION_STRING);
    const message = makeMessage({ text: "check https://example.com", links: ["https://example.com"] });

    await store.save(message);

    expect(await store.recent(10)).toEqual([message]);
  });

  it("returns messages oldest-first regardless of insertion order", async () => {
    const store = await createPostgresMessageStore(CONNECTION_STRING);
    const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
    await store.save(makeMessage({ id: b, createdAt: 2000 }));
    await store.save(makeMessage({ id: a, createdAt: 1000 }));
    await store.save(makeMessage({ id: c, createdAt: 3000 }));

    const messages = await store.recent(10);

    expect(messages.map((m) => m.id)).toEqual([a, b, c]);
  });

  it("limits to the N most recent messages, still chronological within that window", async () => {
    const store = await createPostgresMessageStore(CONNECTION_STRING);
    const ids = Array.from({ length: 5 }, () => randomUUID());
    for (let i = 0; i < ids.length; i++) {
      await store.save(makeMessage({ id: ids[i], createdAt: i * 1000 }));
    }

    const messages = await store.recent(2);

    expect(messages.map((m) => m.id)).toEqual([ids[3], ids[4]]);
  });
});
