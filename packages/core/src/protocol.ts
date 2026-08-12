import type { Message } from "./message.js";

/**
 * Wire protocol between clients and the WebSocket server (see server/).
 * Kept intentionally tiny — one way to send a message in, one way messages
 * come back out — so every client (web/desktop/VSCode/mobile/CLI) can share
 * this exact contract with no platform-specific variants.
 */

/**
 * Sent by a client to post a new chat message. No `author` field — the
 * server derives it from the connection's verified auth token (see
 * `LoginRequest`/`LoginResponse` below), so a client can never claim to be
 * someone else.
 */
export interface SendEvent {
  type: "send";
  text: string;
}

/** Union of all events a client may send to the server. */
export type ClientEvent = SendEvent;

/** Broadcast to all connected clients whenever a message is posted. */
export interface MessageEvent {
  type: "message";
  message: Message;
}

/** Sent to a client when its event could not be processed. */
export interface ErrorEvent {
  type: "error";
  reason: string;
}

/**
 * Pushed once, right after a connection authenticates, with recent message
 * history from the server's message store — lets a (re)connecting client
 * catch up without a separate REST round-trip. Chronological order (oldest
 * first), same as `messages` in core's store.
 */
export interface HistoryEvent {
  type: "history";
  messages: Message[];
}

/** Union of all events the server may send to a client. */
export type ServerEvent = MessageEvent | ErrorEvent | HistoryEvent;

/**
 * REST login contract (`POST /auth/login`) — separate from the WS event
 * union above, but owned by core so every client platform shares the same
 * request/response shape. Nickname-claim only: no password, just proof
 * (a signed token) that a given connection is speaking for `username` for
 * the rest of its session. See docs/ARCHITECTURE.md for the planned
 * full auth/persistence layer this is a stepping stone toward.
 */
export interface LoginRequest {
  username: string;
}

/** Returned on successful login; `token` is presented back as `?token=` on `/ws`. */
export interface LoginResponse {
  token: string;
  username: string;
}
