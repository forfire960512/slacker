import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeWebSocket, stubFakeWebSocket } from "./testing/fakeWebSocket.js";
import type { ConnectionStatus } from "./ws-client.js";
import { WsClient } from "./ws-client.js";

let instances: FakeWebSocket[] = [];

beforeEach(() => {
  instances = [];
  stubFakeWebSocket(instances);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("WsClient — connection lifecycle", () => {
  it("connects immediately on construction and reports 'connecting'", () => {
    const statuses: ConnectionStatus[] = [];
    new WsClient({ url: "ws://test", onEvent: vi.fn(), onStatusChange: (s) => statuses.push(s) });

    expect(instances).toHaveLength(1);
    expect(statuses).toEqual(["connecting"]);
  });

  it("reports 'open' when the socket opens", () => {
    const statuses: ConnectionStatus[] = [];
    new WsClient({ url: "ws://test", onEvent: vi.fn(), onStatusChange: (s) => statuses.push(s) });

    instances[0]!.dispatch("open");

    expect(statuses).toEqual(["connecting", "open"]);
  });

  it("parses valid JSON message frames and forwards them via onEvent", () => {
    const onEvent = vi.fn();
    new WsClient({ url: "ws://test", onEvent });
    const event = { type: "history", messages: [] };

    instances[0]!.dispatch("message", { data: JSON.stringify(event) });

    expect(onEvent).toHaveBeenCalledWith(event);
  });

  it("silently ignores malformed message frames instead of throwing", () => {
    const onEvent = vi.fn();
    new WsClient({ url: "ws://test", onEvent });

    expect(() => instances[0]!.dispatch("message", { data: "not json" })).not.toThrow();
    expect(onEvent).not.toHaveBeenCalled();
  });
});

describe("WsClient — send()", () => {
  it("is a no-op when the socket isn't open", () => {
    const client = new WsClient({ url: "ws://test", onEvent: vi.fn() });
    instances[0]!.readyState = FakeWebSocket.CLOSED;

    client.send({ type: "send", text: "hi" });

    expect(instances[0]!.send).not.toHaveBeenCalled();
  });

  it("serializes the event to JSON when the socket is open", () => {
    const client = new WsClient({ url: "ws://test", onEvent: vi.fn() });
    instances[0]!.readyState = FakeWebSocket.OPEN;

    client.send({ type: "send", text: "hi" });

    expect(instances[0]!.send).toHaveBeenCalledWith(JSON.stringify({ type: "send", text: "hi" }));
  });
});

describe("WsClient — reconnect backoff", () => {
  it("schedules a reconnect within [0.5x, 1x] of the base delay after an unexpected close", () => {
    vi.useFakeTimers();
    new WsClient({ url: "ws://test", onEvent: vi.fn(), reconnectBaseDelayMs: 1000 });

    instances[0]!.dispatch("close");

    vi.advanceTimersByTime(499); // below the guaranteed minimum (0.5 * base)
    expect(instances).toHaveLength(1);

    vi.advanceTimersByTime(501); // now past the guaranteed maximum (1.0 * base)
    expect(instances).toHaveLength(2);
  });

  it("escalates backoff exponentially then caps at reconnectMaxDelayMs, staying capped on further failures", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0); // fixes the jitter multiplier at exactly 0.5
    new WsClient({
      url: "ws://test",
      onEvent: vi.fn(),
      reconnectBaseDelayMs: 1000,
      reconnectMaxDelayMs: 30_000,
    });

    // base*2^attempt, jittered to exactly 50% of raw since Math.random is
    // pinned to 0: attempts 0-4 escalate normally, attempt 5+ clamps at
    // maxDelayMs (raw=30000 -> jittered 15000) and stays there.
    const expectedDelays = [500, 1000, 2000, 4000, 8000, 15_000, 15_000];

    for (const [i, delay] of expectedDelays.entries()) {
      instances[i]!.dispatch("close");

      vi.advanceTimersByTime(delay - 1);
      expect(instances).toHaveLength(i + 1); // not yet reconnected

      vi.advanceTimersByTime(1);
      expect(instances).toHaveLength(i + 2); // reconnected right on schedule
    }
  });

  it("resets backoff after a successful open, so the next failure starts from attempt 0 again", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    new WsClient({
      url: "ws://test",
      onEvent: vi.fn(),
      reconnectBaseDelayMs: 1000,
      reconnectMaxDelayMs: 30_000,
    });

    // First failure: attempt 0 -> 500ms jittered delay.
    instances[0]!.dispatch("close");
    vi.advanceTimersByTime(500);
    expect(instances).toHaveLength(2);

    // Reconnect succeeds — resets the attempt counter.
    instances[1]!.dispatch("open");

    // Second failure should again use attempt 0 (500ms), not attempt 1
    // (which would be 1000ms) — proves the reset actually happened.
    instances[1]!.dispatch("close");
    vi.advanceTimersByTime(499);
    expect(instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(instances).toHaveLength(3);
  });
});

describe("WsClient — disconnect()", () => {
  it("closes the socket, reports 'closed', and cancels any pending reconnect", () => {
    vi.useFakeTimers();
    const statuses: ConnectionStatus[] = [];
    const client = new WsClient({ url: "ws://test", onEvent: vi.fn(), onStatusChange: (s) => statuses.push(s) });
    const first = instances[0]!;

    client.disconnect();

    expect(first.close).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toBe("closed");

    // Even after a long time, disconnect() must not lead to a reconnect.
    vi.advanceTimersByTime(60_000);
    expect(instances).toHaveLength(1);
  });

  it("is idempotent — calling it twice doesn't throw and still reports closed", () => {
    const client = new WsClient({ url: "ws://test", onEvent: vi.fn() });

    client.disconnect();
    expect(() => client.disconnect()).not.toThrow();
  });

  it("ignores a close event that arrives after disconnect() (no reconnect scheduled)", () => {
    vi.useFakeTimers();
    const client = new WsClient({ url: "ws://test", onEvent: vi.fn() });
    const first = instances[0]!;

    client.disconnect();
    // Simulates the real socket's close event firing asynchronously, after
    // disconnect() already tore things down — this is the scenario the
    // `!this.manuallyClosed` guard in scheduleReconnect() exists for.
    first.dispatch("close");

    vi.advanceTimersByTime(60_000);
    expect(instances).toHaveLength(1);
  });
});
