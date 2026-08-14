import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SignJWT, jwtVerify } from "jose";
import type { FastifyInstance } from "fastify";
import type { Message } from "@slacker/core";
import { buildApp } from "./index.js";
import type { MessageStore } from "./store/index.js";

const JWT_SECRET = "test-secret-key-for-vitest-only";
const encodedSecret = new TextEncoder().encode(JWT_SECRET);

/** Minimal in-memory MessageStore — keeps these tests off disk entirely. */
function createFakeMessageStore(initial: Message[] = []): MessageStore {
  const messages = [...initial];
  return {
    async save(message) {
      messages.push(message);
    },
    async recent(limit) {
      return messages.slice(-limit);
    },
  };
}

async function signToken(username: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(username)
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(encodedSecret);
}

// The `.inject()` route tests don't drive a real WS upgrade — `event: any`
// callbacks below sidestep needing to name undici's global WebSocket event
// types (CloseEvent etc.) explicitly, since they aren't re-exported by
// @types/node the way `WebSocket`/`MessageEvent` are.
function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => socket.addEventListener("open", () => resolve(), { once: true }));
}

function waitForMessage(socket: WebSocket): Promise<any> {
  return new Promise((resolve) => {
    socket.addEventListener("message", (event: any) => resolve(JSON.parse(String(event.data))), { once: true });
  });
}

function waitForClose(socket: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    socket.addEventListener(
      "close",
      (event: any) => resolve({ code: event.code, reason: event.reason }),
      { once: true },
    );
  });
}

describe("buildApp — HTTP routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ jwtSecret: JWT_SECRET, messageStore: createFakeMessageStore(), logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("POST /auth/login issues a JWT whose subject is the username", async () => {
    const res = await app.inject({ method: "POST", url: "/auth/login", payload: { username: "alice" } });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { token: string; username: string };
    expect(body.username).toBe("alice");

    const { payload } = await jwtVerify(body.token, encodedSecret);
    expect(payload.sub).toBe("alice");
  });

  it("rejects an empty/whitespace-only username with 400", async () => {
    const res = await app.inject({ method: "POST", url: "/auth/login", payload: { username: "   " } });

    expect(res.statusCode).toBe(400);
  });

  it("rejects a username over 32 characters with 400", async () => {
    const res = await app.inject({ method: "POST", url: "/auth/login", payload: { username: "a".repeat(33) } });

    expect(res.statusCode).toBe(400);
  });

  it("rejects a malformed JSON body with 400, not a 500", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: "not json",
      headers: { "content-type": "application/json" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("buildApp — /ws (fresh connection)", () => {
  let app: FastifyInstance;
  let wsBase: string;

  beforeAll(async () => {
    app = await buildApp({ jwtSecret: JWT_SECRET, messageStore: createFakeMessageStore(), logger: false });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as AddressInfo;
    wsBase = `ws://127.0.0.1:${port}/ws`;
  });

  afterAll(async () => {
    await app.close();
  });

  it("pushes empty history on first connect, then derives `author` from the token — never the client", async () => {
    const token = await signToken("alice");
    const socket = new WebSocket(`${wsBase}?token=${encodeURIComponent(token)}`);
    await waitForOpen(socket);

    const history = await waitForMessage(socket);
    expect(history).toEqual({ type: "history", messages: [] });

    const messagePromise = waitForMessage(socket);
    // Client tries to claim a different author — the server must ignore it.
    socket.send(JSON.stringify({ type: "send", text: "hi https://example.com", author: "mallory" }));
    const received = await messagePromise;

    expect(received.type).toBe("message");
    expect(received.message.author).toBe("alice");
    expect(received.message.links).toEqual(["https://example.com"]);

    socket.close();
  });
});

describe("buildApp — /ws (further scenarios)", () => {
  let app: FastifyInstance;
  let wsBase: string;

  beforeAll(async () => {
    app = await buildApp({ jwtSecret: JWT_SECRET, messageStore: createFakeMessageStore(), logger: false });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as AddressInfo;
    wsBase = `ws://127.0.0.1:${port}/ws`;
  });

  afterAll(async () => {
    await app.close();
  });

  it("closes with code 4001 for a missing/invalid token", async () => {
    const socket = new WebSocket(`${wsBase}?token=not-a-real-token`);

    const closeEvent = await waitForClose(socket);

    expect(closeEvent.code).toBe(4001);
  });

  it("broadcasts a sent message to every connected client, including the sender", async () => {
    const [tokenA, tokenB] = await Promise.all([signToken("alice"), signToken("bob")]);
    const socketA = new WebSocket(`${wsBase}?token=${encodeURIComponent(tokenA)}`);
    const socketB = new WebSocket(`${wsBase}?token=${encodeURIComponent(tokenB)}`);
    await Promise.all([waitForOpen(socketA), waitForOpen(socketB)]);
    await Promise.all([waitForMessage(socketA), waitForMessage(socketB)]); // drain each client's history frame

    const [receivedA, receivedB] = await Promise.all([
      waitForMessage(socketA),
      waitForMessage(socketB),
      Promise.resolve().then(() => socketA.send(JSON.stringify({ type: "send", text: "hi everyone" }))),
    ]);

    expect(receivedA.message.text).toBe("hi everyone");
    expect(receivedA.message.author).toBe("alice");
    expect(receivedB.message).toEqual(receivedA.message);

    socketA.close();
    socketB.close();
  });

  it("responds with an error frame for empty text and does not broadcast it", async () => {
    const token = await signToken("alice");
    const socket = new WebSocket(`${wsBase}?token=${encodeURIComponent(token)}`);
    await waitForOpen(socket);
    await waitForMessage(socket); // history

    const errorPromise = waitForMessage(socket);
    socket.send(JSON.stringify({ type: "send", text: "   " }));
    const error = await errorPromise;

    expect(error).toEqual({ type: "error", reason: "text must not be empty" });

    socket.close();
  });
});
