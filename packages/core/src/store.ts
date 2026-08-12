import { create } from "zustand";
import { requestLoginToken } from "./auth.js";
import type { Message } from "./message.js";
import type { ServerEvent } from "./protocol.js";
import { WsClient, type ConnectionStatus } from "./ws-client.js";

export interface ChatState {
  status: ConnectionStatus;
  username: string | null;
  token: string | null;
  messages: Message[];
  lastError: string | null;
  /** Logs in via `authUrl`, then opens a WS connection to `wsUrl` carrying the token. */
  login: (authUrl: string, wsUrl: string, username: string) => Promise<void>;
  /**
   * Opens a WS connection with a token obtained earlier (e.g. from
   * localStorage) — skips the REST call login() makes, since the token
   * doesn't need re-issuing until it expires. Platform-specific storage
   * (localStorage, a config file, …) is the caller's job; core just knows
   * how to resume a session once handed the token back.
   */
  restoreSession: (wsUrl: string, token: string, username: string) => void;
  /** Tears down the connection for good; does not auto-reconnect. */
  logout: () => void;
  send: (text: string) => void;
}

// The live WsClient is a non-serializable side-channel object, so it lives
// outside zustand state (standard zustand pattern) rather than in it.
let client: WsClient | null = null;

export const useChatStore = create<ChatState>((set, get) => {
  function connectWs(wsUrl: string, token: string): void {
    const url = `${wsUrl}?token=${encodeURIComponent(token)}`;
    client = new WsClient({
      url,
      onStatusChange: (status) => set({ status }),
      onEvent: (event: ServerEvent) => {
        if (event.type === "message") {
          set((state) => ({ messages: [...state.messages, event.message] }));
        } else if (event.type === "history") {
          // Replaces rather than merges — sent once right after auth, so
          // this is always the server's current source of truth for the
          // window it covers, including on reconnect.
          set({ messages: event.messages });
        } else {
          set({ lastError: event.reason });
        }
      },
    });
  }

  return {
    status: "closed",
    username: null,
    token: null,
    messages: [],
    lastError: null,

    login: async (authUrl, wsUrl, username) => {
      client?.disconnect();
      client = null;

      let response;
      try {
        response = await requestLoginToken(authUrl, username);
      } catch (err) {
        set({ lastError: err instanceof Error ? err.message : "login failed" });
        return;
      }

      set({
        username: response.username,
        token: response.token,
        messages: [],
        lastError: null,
      });
      connectWs(wsUrl, response.token);
    },

    restoreSession: (wsUrl, token, username) => {
      client?.disconnect();
      client = null;
      set({ username, token, messages: [], lastError: null });
      connectWs(wsUrl, token);
    },

    logout: () => {
      client?.disconnect();
      client = null;
      set({ status: "closed", username: null, token: null });
    },

    send: (text) => {
      const { status, token } = get();
      if (status !== "open" || token === null) return;
      client?.send({ type: "send", text });
    },
  };
});
