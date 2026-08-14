import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
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
import { createMessageStore, type MessageStore } from "./store/index.js";

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
 *
 * `buildApp()` assembles everything up through route registration without
 * starting a listener, so tests (see index.test.ts) can spin up an isolated
 * instance — own `clients` map, injectable secret/store — without opening a
 * real port or touching disk. The bottom of this file starts a real server
 * only when it's run directly, not when `buildApp` is imported.
 */

const HISTORY_LIMIT = 50;

function defaultDataDir(): string {
  // Everything under here is real but disposable local state — gitignored
  // (see server/.gitignore), safe to delete to reset both sessions and history.
  return process.env.DATA_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "../data");
}

function loadOrCreateJwtSecret(dataDir: string): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const secretPath = path.join(dataDir, ".jwt-secret");
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

export interface BuildAppOptions {
  /** Where the SQLite DB / generated JWT secret live when no override below is given. Defaults to DATA_DIR env or ../data. */
  dataDir?: string;
  /** Defaults to JWT_SECRET env, or a generated-and-persisted secret under dataDir. */
  jwtSecret?: string;
  /** Defaults to createMessageStore(dataDir). Pass an in-memory store in tests to skip disk/DB entirely. */
  messageStore?: MessageStore;
  /** Fastify's `logger` option — defaults to true; tests typically want false for quiet output. */
  logger?: boolean;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  // Only touches disk (mkdir) if something below actually needs a resolved
  // dataDir — e.g. index.test.ts passes both jwtSecret and messageStore, so
  // this never runs and the test suite never creates a real data directory.
  let resolvedDataDir: string | undefined;
  function resolveDataDir(): string {
    resolvedDataDir ??= opts.dataDir ?? defaultDataDir();
    mkdirSync(resolvedDataDir, { recursive: true });
    return resolvedDataDir;
  }

  const jwtSecret = new TextEncoder().encode(opts.jwtSecret ?? loadOrCreateJwtSecret(resolveDataDir()));

  const messageStore =
    opts.messageStore ??
    (await createMessageStore(resolveDataDir()).catch((err) => {
      console.error(`Failed to start message store: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }));

  const app = Fastify({ logger: opts.logger ?? true });
  await app.register(cors, { origin: true }); // dev-permissive; narrow this for production.
  await app.register(websocketPlugin);

  // Socket -> the username verified for that connection at auth time.
  // Scoped per buildApp() call (not module-level) so multiple app instances
  // — e.g. parallel tests — don't share connection state.
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
      .sign(jwtSecret);

    const body: LoginResponse = { token, username };
    return body;
  });

  app.get("/ws", { websocket: true }, async (socket, request) => {
    const { token } = request.query as { token?: string };

    let username: string;
    try {
      if (!token) throw new Error("missing token");
      const { payload } = await jwtVerify(token, jwtSecret);
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
        app.log.info({ id: message.id, author: message.author, text: message.text }, "message saved and broadcast");
        broadcast({ type: "message", message });
      })();
    });

    socket.on("close", () => {
      clients.delete(socket);
    });
  });

  app.get("/health", async () => ({ ok: true }));

  return app;
}

// Starts a real server only when this file is run directly (`tsx
// src/index.ts`, or the built entrypoint) — not when a test imports
// `buildApp`. Compares resolved file:// URLs (not raw strings) so this
// works on Windows too, where argv[1] uses backslashes.
const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  // Windows consoles (PowerShell, cmd) default to a legacy codepage that
  // mangles Korean/CJK text in the console — pino's JSON log lines are valid
  // UTF-8 either way, this just fixes how the console *displays* them.
  if (process.platform === "win32") {
    try {
      execSync("chcp 65001", { stdio: "ignore" });
    } catch {
      // Best-effort — a console rendering glitch isn't worth failing startup over.
    }
  }

  const PORT = Number(process.env.PORT ?? 8080);
  const app = await buildApp();
  app.listen({ port: PORT, host: "0.0.0.0" }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}
