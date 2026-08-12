import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocketPlugin from "@fastify/websocket";
import { SignJWT, jwtVerify } from "jose";
import type { WebSocket } from "ws";
import {
  extractLinks,
  type ClientEvent,
  type LoginRequest,
  type LoginResponse,
  type Message,
  type ServerEvent,
} from "@slacker/core";
import { createMessageStore } from "./store/index.js";

/**
 * Minimal WebSocket chat server: `POST /auth/login` exchanges a nickname
 * for a signed JWT (no password — a claim, not an identity check), then
 * `/ws?token=...` accepts `ClientEvent`s, persists the resulting `Message`
 * (see store/), and broadcasts it as a `ServerEvent` to every connected
 * client (including the sender). `Message.author` always comes from the
 * verified token, never from the client, so a connection can't claim to be
 * someone else. Real accounts/passwords are still out of scope — see
 * docs/ARCHITECTURE.md for the planned full-auth layer this is a stepping
 * stone toward.
 */

const PORT = Number(process.env.PORT ?? 8080);
const HISTORY_LIMIT = 50;

// Everything here is real but disposable local state — gitignored (see
// server/.gitignore), safe to delete to reset both sessions and history.
const DATA_DIR = process.env.DATA_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "../data");
mkdirSync(DATA_DIR, { recursive: true });

function loadOrCreateJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const secretPath = path.join(DATA_DIR, ".jwt-secret");
  if (existsSync(secretPath)) {
    return readFileSync(secretPath, "utf-8").trim();
  }
  const generated = randomUUID();
  writeFileSync(secretPath, generated, "utf-8");
  console.warn(
    `JWT_SECRET not set — generated one and saved it to ${secretPath}, so restarting this server won't ` +
      "log everyone out. Delete that file (or set JWT_SECRET) to invalidate existing tokens.",
  );
  return generated;
}
const JWT_SECRET = new TextEncoder().encode(loadOrCreateJwtSecret());

const messageStore = await createMessageStore(DATA_DIR).catch((err) => {
  console.error(`Failed to start message store: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});

const app = Fastify({ logger: true });
await app.register(cors, { origin: true }); // dev-permissive; narrow this for production.
await app.register(websocketPlugin);

// Socket -> the username verified for that connection at auth time.
const clients = new Map<WebSocket, string>();

function broadcast(event: ServerEvent): void {
  const payload = JSON.stringify(event);
  for (const client of clients.keys()) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}

function send(client: WebSocket, event: ServerEvent): void {
  client.send(JSON.stringify(event));
}

app.post<{ Body: LoginRequest }>("/auth/login", async (request, reply) => {
  const username = request.body?.username?.trim();
  if (!username || username.length < 1 || username.length > 32) {
    return reply.status(400).send({ error: "username must be 1-32 characters" });
  }

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(username)
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(JWT_SECRET);

  const body: LoginResponse = { token, username };
  return body;
});

app.get("/ws", { websocket: true }, async (socket, request) => {
  const { token } = request.query as { token?: string };

  let username: string;
  try {
    if (!token) throw new Error("missing token");
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (typeof payload.sub !== "string") throw new Error("token missing subject");
    username = payload.sub;
  } catch {
    socket.close(4001, "unauthorized");
    return;
  }

  clients.set(socket, username);
  send(socket, { type: "history", messages: await messageStore.recent(HISTORY_LIMIT) });

  socket.on("message", (raw) => {
    void (async () => {
      let event: ClientEvent;
      try {
        event = JSON.parse(raw.toString());
      } catch {
        send(socket, { type: "error", reason: "invalid JSON" });
        return;
      }

      if (event.type !== "send" || typeof event.text !== "string") {
        send(socket, { type: "error", reason: "invalid event" });
        return;
      }

      const text = event.text.trim();
      if (text.length === 0) {
        send(socket, { type: "error", reason: "text must not be empty" });
        return;
      }

      const message: Message = {
        id: randomUUID(),
        text,
        links: extractLinks(text),
        author: username,
        createdAt: Date.now(),
      };

      try {
        await messageStore.save(message);
      } catch (err) {
        app.log.error(err, "failed to persist message");
        send(socket, { type: "error", reason: "failed to save message" });
        return;
      }
      // WS frames aren't auto-logged by Fastify the way HTTP requests are
      // (only the initial /ws upgrade shows up on its own), so this is the
      // only visibility into "a message actually arrived" without querying
      // the DB directly.
      app.log.info({ id: message.id, author: message.author }, "message saved and broadcast");
      broadcast({ type: "message", message });
    })();
  });

  socket.on("close", () => {
    clients.delete(socket);
  });
});

app.get("/health", async () => ({ ok: true }));

app.listen({ port: PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
