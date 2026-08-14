import { describe, expect, it } from "vitest";
import type { Message } from "@slacker/core";
import { createSqliteMessageStore } from "./sqliteMessageStore.js";

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "m1",
    text: "hello",
    links: [],
    author: "alice",
    createdAt: 1000,
    ...overrides,
  };
}

describe("createSqliteMessageStore", () => {
  it("returns an empty list from a fresh store", async () => {
    const store = await createSqliteMessageStore(":memory:");

    expect(await store.recent(10)).toEqual([]);
  });

  it("round-trips a saved message, including a non-empty links array", async () => {
    const store = await createSqliteMessageStore(":memory:");
    const message = makeMessage({ text: "check https://example.com", links: ["https://example.com"] });

    await store.save(message);

    expect(await store.recent(10)).toEqual([message]);
  });

  it("returns messages oldest-first regardless of insertion order", async () => {
    const store = await createSqliteMessageStore(":memory:");
    await store.save(makeMessage({ id: "b", createdAt: 2000 }));
    await store.save(makeMessage({ id: "a", createdAt: 1000 }));
    await store.save(makeMessage({ id: "c", createdAt: 3000 }));

    const messages = await store.recent(10);

    expect(messages.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("limits to the N most recent messages, still chronological within that window", async () => {
    const store = await createSqliteMessageStore(":memory:");
    for (let i = 0; i < 5; i++) {
      await store.save(makeMessage({ id: `m${i}`, createdAt: i * 1000 }));
    }

    const messages = await store.recent(2);

    expect(messages.map((m) => m.id)).toEqual(["m3", "m4"]);
  });
});
