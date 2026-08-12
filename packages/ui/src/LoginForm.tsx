import { useState, type FormEvent } from "react";
import { useChatStore } from "@slacker/core";

export interface LoginFormProps {
  /** REST login endpoint, e.g. `http://localhost:8080/auth/login`. */
  authUrl: string;
  /** WS endpoint (without the token query param — that's added internally). */
  wsUrl: string;
}

/** One-time nickname prompt. On submit, logs in and opens the WS connection. */
export function LoginForm({ authUrl, wsUrl }: LoginFormProps) {
  const login = useChatStore((state) => state.login);
  const lastError = useChatStore((state) => state.lastError);
  const status = useChatStore((state) => state.status);
  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = username.trim();
    if (trimmed.length === 0) return;
    setSubmitting(true);
    await login(authUrl, wsUrl, trimmed);
    setSubmitting(false);
  }

  const busy = submitting || status === "connecting";

  return (
    <div className="flex h-full items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-3 rounded-lg border border-slate-200 p-6 shadow-sm"
      >
        <h1 className="text-lg font-semibold text-slate-900">닉네임으로 입장</h1>
        <input
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="닉네임"
          maxLength={32}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        {lastError && <p className="text-sm text-rose-600">{lastError}</p>}
        <button
          type="submit"
          disabled={busy || username.trim().length === 0}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? "입장 중…" : "입장하기"}
        </button>
      </form>
    </div>
  );
}
