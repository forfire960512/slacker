import { useState, type FormEvent } from "react";
import { useChatStore } from "@slacker/core";

/** Send box. Disabled unless the connection is open. */
export function MessageInput() {
  const status = useChatStore((state) => state.status);
  const send = useChatStore((state) => state.send);
  const [text, setText] = useState("");

  const disabled = status !== "open";

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length === 0 || disabled) return;
    send(trimmed);
    setText("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 border-t border-border p-3">
      <input
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={disabled}
        placeholder={disabled ? "연결 중…" : "메시지를 입력하세요"}
        className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={disabled || text.trim().length === 0}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-40"
      >
        보내기
      </button>
    </form>
  );
}
