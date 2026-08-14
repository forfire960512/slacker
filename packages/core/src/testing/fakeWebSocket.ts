import { vi } from "vitest";

/**
 * Minimal WebSocket test double covering exactly what WsClient (see
 * ../ws-client.ts) touches: addEventListener/send/close/readyState/OPEN.
 * Shared between ws-client.test.ts and store.test.ts so both drive
 * open/close/message events the same way instead of each hand-rolling one.
 */
export class FakeWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  readonly OPEN = FakeWebSocket.OPEN;
  readonly CLOSED = FakeWebSocket.CLOSED;
  readyState = FakeWebSocket.OPEN;
  readonly url: string;
  private readonly listeners = new Map<string, Array<(event: any) => void>>();
  send = vi.fn();
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: string, cb: (event: any) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(cb);
    this.listeners.set(type, list);
  }

  dispatch(type: string, event: unknown = {}): void {
    for (const cb of this.listeners.get(type) ?? []) cb(event);
  }
}

/**
 * Stubs the global `WebSocket` with a FakeWebSocket subclass that pushes
 * every instance it constructs into `instances` — so a test can grab
 * `instances[0]`, `instances[1]`, ... (typically after clearing the array
 * in `beforeEach`) to drive events by hand and count reconnect attempts.
 * Pair with `vi.unstubAllGlobals()` in `afterEach`.
 */
export function stubFakeWebSocket(instances: FakeWebSocket[]): void {
  vi.stubGlobal(
    "WebSocket",
    class extends FakeWebSocket {
      constructor(url: string) {
        super(url);
        instances.push(this);
      }
    },
  );
}
