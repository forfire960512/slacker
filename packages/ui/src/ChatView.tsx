import { useChatStore } from "@slacker/core";
import { StatusBadge } from "./StatusBadge.js";
import { MessageList } from "./MessageList.js";
import { MessageInput } from "./MessageInput.js";

/** Logged-in chat screen: header + message list + send box. */
export function ChatView() {
  const username = useChatStore((state) => state.username);
  const status = useChatStore((state) => state.status);
  const logout = useChatStore((state) => state.logout);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900">{username}</span>
          <StatusBadge status={status} />
        </div>
        <button type="button" onClick={logout} className="text-sm text-slate-500 hover:text-slate-800">
          나가기
        </button>
      </header>
      <MessageList />
      <MessageInput />
    </div>
  );
}
