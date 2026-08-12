import { useEffect, useRef } from "react";
import { useChatStore } from "@slacker/core";

/** Scrolling message list. Subscribes to the core store directly. */
export function MessageList() {
  const messages = useChatStore((state) => state.messages);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
      {messages.map((message) => (
        <div key={message.id} className="max-w-prose">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-slate-900">{message.author}</span>
            <span className="text-xs text-slate-400">{new Date(message.createdAt).toLocaleTimeString()}</span>
          </div>
          <p className="whitespace-pre-wrap text-slate-700">{message.text}</p>
          {message.links.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {message.links.map((link) => (
                <li key={link}>
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-sky-600 underline underline-offset-2 hover:text-sky-700"
                  >
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
