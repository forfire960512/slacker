import { useEffect, useRef } from "react";
import { useChatStore, splitTextByLinks } from "@slacker/core";

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
            <span className="font-semibold text-fg">{message.author}</span>
            <span className="text-xs text-fg-muted">{new Date(message.createdAt).toLocaleTimeString()}</span>
          </div>
          <p className="whitespace-pre-wrap text-fg">
            {splitTextByLinks(message.text).map((part, i) =>
              // splitTextByLinks: even indices are plain text, odd are links.
              i % 2 === 1 ? (
                <a
                  key={i}
                  href={part}
                  target="_blank"
                  rel="noreferrer"
                  className="text-link underline underline-offset-2 hover:text-link-hover"
                >
                  {part}
                </a>
              ) : (
                <span key={i}>{part}</span>
              ),
            )}
          </p>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
