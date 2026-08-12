import type { Message } from "./message.js";

/**
 * Wire protocol between clients and the WebSocket server (see server/).
 * Kept intentionally tiny — one way to send a message in, one way messages
 * come back out — so every client (web/desktop/VSCode/mobile/CLI) can share
 * this exact contract with no platform-specific variants.
 */

/** Sent by a client to post a new chat message. */
export interface SendEvent {
  type: "send";
  text: string;
  author: string;
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

/** Union of all events the server may send to a client. */
export type ServerEvent = MessageEvent | ErrorEvent;
