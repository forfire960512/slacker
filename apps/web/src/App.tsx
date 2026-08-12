import { useChatStore } from "@slacker/core";
import { LoginForm, ChatView } from "@slacker/ui";
import { AUTH_URL, WS_URL } from "./config.js";
import { useSessionPersistence } from "./useSessionPersistence.js";

export function App() {
  const username = useChatStore((state) => state.username);
  useSessionPersistence();

  return (
    <div className="h-screen bg-app-bg text-fg">
      {username === null ? <LoginForm authUrl={AUTH_URL} wsUrl={WS_URL} /> : <ChatView />}
    </div>
  );
}
