import { randomUUID } from "node:crypto";
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

/**
 * Minimal WebSocket chat server: `POST /auth/login` exchanges a nickname
 * for a signed JWT (no password — a claim, not an identity check), then
 * `/ws?token=...` accepts `ClientEvent`s and broadcasts the resulting
 * `Message` as a `ServerEvent` to every connected client (including the
 * sender). `Message.author` always comes from the verified token, never
 * from the client, so a connection can't claim to be someone else.
 *
 * In-memory only — no persistence, and JWT_SECRET is regenerated on every
 * restart if not set via env, invalidating all outstanding tokens. See
 * docs/ARCHITECTURE.md for the planned Postgres/full-auth layer this is a
 * stepping stone toward.
 */

const PORT = Number(process.env.PORT ?? 8080);

if (!process.env.JWT_SECRET) {
  console.warn("JWT_SECRET not set — using a random secret for this process. Tokens will not survive a restart.");
}
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? randomUUID());

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

  socket.on("message", (raw) => {
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

    broadcast({ type: "message", message });
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
