import { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { useChatStore, type ConnectionStatus } from "@slacker/core";
import { hyperlink } from "./hyperlink.js";

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  connecting: "yellow",
  open: "green",
  closed: "red",
};

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: "연결 중…",
  open: "연결됨",
  closed: "연결 끊김",
};

// Only the tail is kept on screen — Ink re-renders the whole tree on every
// update, so an unbounded list would get slower as a session goes on.
const VISIBLE_MESSAGES = 20;

/** Chat screen — the terminal counterpart to apps/ui's ChatView. */
export function ChatScreen() {
  const username = useChatStore((state) => state.username);
  const status = useChatStore((state) => state.status);
  const messages = useChatStore((state) => state.messages);
  const send = useChatStore((state) => state.send);
  const logout = useChatStore((state) => state.logout);
  const [value, setValue] = useState("");

  function handleSubmit(text: string) {
    const trimmed = text.trim();
    if (trimmed.length === 0 || status !== "open") return;
    if (trimmed === "/quit") {
      logout();
      return;
    }
    send(trimmed);
    setValue("");
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>{username}</Text>
        <Text> </Text>
        <Text color={STATUS_COLOR[status]}>[{STATUS_LABEL[status]}]</Text>
      </Box>
      <Box flexDirection="column" marginY={1}>
        {messages.slice(-VISIBLE_MESSAGES).map((message) => (
          <Box key={message.id} flexDirection="column">
            <Text>
              <Text bold color="cyan">
                {message.author}
              </Text>
              <Text dimColor> {new Date(message.createdAt).toLocaleTimeString()}</Text>
            </Text>
            <Text>{message.text}</Text>
            {message.links.map((link) => (
              <Text key={link} color="blue" underline>
                {hyperlink(link)}
              </Text>
            ))}
          </Box>
        ))}
      </Box>
      <Box>
        <Text>{"> "}</Text>
        <TextInput value={value} onChange={setValue} onSubmit={handleSubmit} />
      </Box>
    </Box>
  );
}
