import { useChatStore } from "@slacker/core";
import { LoginPrompt } from "./LoginPrompt.js";
import { ChatScreen } from "./ChatScreen.js";

export function App() {
  const username = useChatStore((state) => state.username);
  return username === null ? <LoginPrompt /> : <ChatScreen />;
}
