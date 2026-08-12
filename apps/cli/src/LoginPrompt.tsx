import { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { useChatStore } from "@slacker/core";
import { AUTH_URL, WS_URL } from "./config.js";

/** One-time nickname prompt — the terminal counterpart to apps/ui's LoginForm. */
export function LoginPrompt() {
  const [value, setValue] = useState("");
  const login = useChatStore((state) => state.login);
  const status = useChatStore((state) => state.status);
  const lastError = useChatStore((state) => state.lastError);

  const busy = status === "connecting";

  function handleSubmit(name: string) {
    const trimmed = name.trim();
    if (trimmed.length === 0 || busy) return;
    void login(AUTH_URL, WS_URL, trimmed);
  }

  return (
    <Box flexDirection="column">
      <Text bold>slacker</Text>
      <Box>
        <Text>닉네임: </Text>
        <TextInput value={value} onChange={setValue} onSubmit={handleSubmit} />
      </Box>
      {busy && <Text color="yellow">연결 중…</Text>}
      {lastError && <Text color="red">{lastError}</Text>}
    </Box>
  );
}
