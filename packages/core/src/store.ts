import { create } from "zustand";
import { requestLoginToken } from "./auth.js";
import type { Message } from "./message.js";
import { WsClient, type ConnectionStatus } from "./ws-client.js";

export interface ChatState {
  status: ConnectionStatus;
  username: string | null;
  token: string | null;
  messages: Message[];
  lastError: string | null;
  /** Logs in via `authUrl`, then opens a WS connection to `wsUrl` carrying the token. */
  login: (authUrl: string, wsUrl: string, username: string) => Promise<void>;
  /** Tears down the connection for good; does not auto-reconnect. */
  logout: () => void;
  send: (text: string) => void;
}

// The live WsClient is a non-serializable side-channel object, so it lives
// outside zustand state (standard zustand pattern) rather than in it.
let client: WsClient | null = null;

export const useChatStore = create<ChatState>((set, get) => ({
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

    const url = `${wsUrl}?token=${encodeURIComponent(response.token)}`;
    client = new WsClient({
      url,
      onStatusChange: (status) => set({ status }),
      onEvent: (event) => {
        if (event.type === "message") {
          set((state) => ({ messages: [...state.messages, event.message] }));
        } else {
          set({ lastError: event.reason });
        }
      },
    });
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
}));
