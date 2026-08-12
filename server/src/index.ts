import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import websocketPlugin from "@fastify/websocket";
import type { WebSocket } from "ws";
import { extractLinks, type ClientEvent, type Message, type ServerEvent } from "@slacker/core";

/**
 * Minimal WebSocket chat server: accepts `ClientEvent`s on `/ws` and
 * broadcasts the resulting `Message` as a `ServerEvent` to every connected
 * client (including the sender). In-memory only for now — no persistence
 * or auth yet; see docs/ARCHITECTURE.md for the planned Postgres/JWT layer.
 */

const PORT = Number(process.env.PORT ?? 8080);

const app = Fastify({ logger: true });
await app.register(websocketPlugin);

const clients = new Set<WebSocket>();

function broadcast(event: ServerEvent): void {
  const payload = JSON.stringify(event);
  for (const client of clients) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}

function send(client: WebSocket, event: ServerEvent): void {
  client.send(JSON.stringify(event));
}

app.get("/ws", { websocket: true }, (socket) => {
  clients.add(socket);

  socket.on("message", (raw) => {
    let event: ClientEvent;
    try {
      event = JSON.parse(raw.toString());
    } catch {
      send(socket, { type: "error", reason: "invalid JSON" });
      return;
    }

    if (event.type !== "send" || typeof event.text !== "string" || typeof event.author !== "string") {
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
      author: event.author,
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
