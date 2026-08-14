import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeWebSocket, stubFakeWebSocket } from "./testing/fakeWebSocket.js";
import { useChatStore } from "./store.js";

let instances: FakeWebSocket[] = [];
const initialState = useChatStore.getInitialState();

beforeEach(() => {
  instances = [];
  stubFakeWebSocket(instances);
});

afterEach(() => {
  useChatStore.setState(initialState, true);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockFetchOnce(response: { ok: boolean; status?: number; statusText?: string; json?: () => unknown }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      status: 200,
      statusText: "OK",
      json: async () => ({}),
      ...response,
    }),
  );
}

describe("useChatStore — send()", () => {
  it("does nothing when status isn't 'open'", async () => {
    mockFetchOnce({ ok: true, json: async () => ({ token: "t", username: "alice" }) });
    await useChatStore.getState().login("http://auth", "ws://chat", "alice");
    instances[0]!.dispatch("open");
    useChatStore.setState({ status: "closed" }); // simulate a dropped connection

    useChatStore.getState().send("hi");

    expect(instances[0]!.send).not.toHaveBeenCalled();
  });

  it("does nothing when there's no token", async () => {
    mockFetchOnce({ ok: true, json: async () => ({ token: "t", username: "alice" }) });
    await useChatStore.getState().login("http://auth", "ws://chat", "alice");
    instances[0]!.dispatch("open");
    useChatStore.setState({ token: null }); // status is "open" but token missing

    useChatStore.getState().send("hi");

    expect(instances[0]!.send).not.toHaveBeenCalled();
  });

  it("sends through the live client once status is open and a token is present", async () => {
    mockFetchOnce({ ok: true, json: async () => ({ token: "t", username: "alice" }) });
    await useChatStore.getState().login("http://auth", "ws://chat", "alice");
    instances[0]!.dispatch("open");

    useChatStore.getState().send("hi");

    expect(instances[0]!.send).toHaveBeenCalledWith(JSON.stringify({ type: "send", text: "hi" }));
  });
});

describe("useChatStore — login()", () => {
  it("on success, sets username/token and opens a WS connection carrying the token", async () => {
    mockFetchOnce({ ok: true, json: async () => ({ token: "the-token", username: "alice" }) });

    await useChatStore.getState().login("http://auth", "ws://chat", "alice");

    const state = useChatStore.getState();
    expect(state.username).toBe("alice");
    expect(state.token).toBe("the-token");
    expect(state.lastError).toBeNull();
    expect(instances).toHaveLength(1);
    expect(instances[0]!.url).toBe("ws://chat?token=the-token");
  });

  it("on failure, sets lastError and does not open a WS connection", async () => {
    mockFetchOnce({ ok: false, status: 401, statusText: "Unauthorized" });

    await useChatStore.getState().login("http://auth", "ws://chat", "alice");

    const state = useChatStore.getState();
    expect(state.lastError).toBeTruthy();
    expect(state.token).toBeNull();
    expect(instances).toHaveLength(0);
  });

  it("tears down an existing connection before opening a new one", async () => {
    mockFetchOnce({ ok: true, json: async () => ({ token: "t1", username: "alice" }) });
    await useChatStore.getState().login("http://auth", "ws://chat", "alice");
    const firstSocket = instances[0]!;

    mockFetchOnce({ ok: true, json: async () => ({ token: "t2", username: "bob" }) });
    await useChatStore.getState().login("http://auth", "ws://chat", "bob");

    expect(firstSocket.close).toHaveBeenCalledTimes(1);
    expect(instances).toHaveLength(2);
    expect(useChatStore.getState().username).toBe("bob");
  });
});

describe("useChatStore — restoreSession()", () => {
  it("skips the REST call and connects directly with the given token", () => {
    vi.stubGlobal("fetch", vi.fn());

    useChatStore.getState().restoreSession("ws://chat", "saved-token", "alice");

    expect(fetch).not.toHaveBeenCalled();
    const state = useChatStore.getState();
    expect(state.username).toBe("alice");
    expect(state.token).toBe("saved-token");
    expect(instances).toHaveLength(1);
    expect(instances[0]!.url).toBe("ws://chat?token=saved-token");
  });
});

describe("useChatStore — logout()", () => {
  it("closes the connection and clears session state", async () => {
    mockFetchOnce({ ok: true, json: async () => ({ token: "t", username: "alice" }) });
    await useChatStore.getState().login("http://auth", "ws://chat", "alice");
    const socket = instances[0]!;

    useChatStore.getState().logout();

    expect(socket.close).toHaveBeenCalledTimes(1);
    const state = useChatStore.getState();
    expect(state.status).toBe("closed");
    expect(state.username).toBeNull();
    expect(state.token).toBeNull();
  });
});
