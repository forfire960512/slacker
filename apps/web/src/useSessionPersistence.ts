import { useEffect, useRef } from "react";
import { useChatStore } from "@slacker/core";
import { WS_URL } from "./config.js";

const STORAGE_KEY = "slacker.session";

interface StoredSession {
  token: string;
  username: string;
}

/**
 * Browser-specific glue around core's session primitives: restores a saved
 * token on mount (so a page refresh doesn't force a re-login) and keeps
 * localStorage in sync with the store afterward. This lives in apps/web,
 * not packages/ui or core, because localStorage is a browser API — core
 * only knows how to *resume* a session once handed a token back (see
 * restoreSession in packages/core/src/store.ts).
 */
export function useSessionPersistence(): void {
  const username = useChatStore((state) => state.username);
  const token = useChatStore((state) => state.token);
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as StoredSession;
      if (saved.token && saved.username) {
        useChatStore.getState().restoreSession(WS_URL, saved.token, saved.username);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (username && token) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ username, token } satisfies StoredSession));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [username, token]);
}
