import type { ClientEvent, ServerEvent } from "./protocol.js";

export type ConnectionStatus = "connecting" | "open" | "closed";

export interface WsClientOptions {
  /** Full WS URL, including any auth query params (e.g. `?token=...`). */
  url: string;
  onEvent: (event: ServerEvent) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  /** Base delay for exponential backoff reconnects, in ms. Default 1000. */
  reconnectBaseDelayMs?: number;
  /** Cap on backoff delay, in ms. Default 30000. */
  reconnectMaxDelayMs?: number;
}

/**
 * Thin wrapper around the global `WebSocket` that speaks the
 * ClientEvent/ServerEvent JSON protocol and owns reconnect-with-backoff, so
 * no platform (web/desktop/vscode/mobile/cli) has to reimplement it (see
 * "웹소켓 재연결" risk note in docs/ARCHITECTURE.md). Works against the
 * ambient `WebSocket` global available in both browsers and Node 22+, so
 * this same class is reusable from apps/cli later — no `ws` package
 * dependency here.
 *
 * Reconnects automatically on unexpected close; `disconnect()` is terminal
 * and never triggers a reconnect.
 */
export class WsClient {
  private readonly url: string;
  private readonly onEvent: (event: ServerEvent) => void;
  private readonly onStatusChange: (status: ConnectionStatus) => void;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  private socket: WebSocket | null = null;
  private manuallyClosed = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: WsClientOptions) {
    this.url = options.url;
    this.onEvent = options.onEvent;
    this.onStatusChange = options.onStatusChange ?? (() => {});
    this.baseDelayMs = options.reconnectBaseDelayMs ?? 1000;
    this.maxDelayMs = options.reconnectMaxDelayMs ?? 30000;
    this.open();
  }

  send(event: ClientEvent): void {
    if (this.socket !== null && this.socket.readyState === this.socket.OPEN) {
      this.socket.send(JSON.stringify(event));
    }
  }

  /** Closes the connection for good — no further reconnect attempts. */
  disconnect(): void {
    this.manuallyClosed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.onStatusChange("closed");
  }

  private open(): void {
    this.onStatusChange("connecting");
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      this.onStatusChange("open");
    });

    socket.addEventListener("message", (event) => {
      try {
        this.onEvent(JSON.parse(String(event.data)) as ServerEvent);
      } catch {
        // Malformed frame — ignore rather than crash the client.
      }
    });

    // `error` is always followed by `close` per the WebSocket spec, so
    // reconnect scheduling lives only in the close handler below.
    socket.addEventListener("error", () => {});

    socket.addEventListener("close", () => {
      this.socket = null;
      this.onStatusChange("closed");
      if (!this.manuallyClosed) {
        this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect(): void {
    const raw = Math.min(this.baseDelayMs * 2 ** this.reconnectAttempt, this.maxDelayMs);
    const jittered = raw * (0.5 + Math.random() * 0.5);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => this.open(), jittered);
  }
}
