"use client";

import { useState, type FormEvent } from "react";
import clsx from "clsx";
import { sendChatMessage, type ChatMessage } from "@/lib/chat";
import type { BoardData } from "@/lib/kanban";

type ChatSidebarProps = {
  onBoardUpdate: (board: BoardData) => void;
};

export const ChatSidebar = ({ onBoardUpdate }: ChatSidebarProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || isSending) {
      return;
    }

    const history = messages;
    setError(null);
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setIsSending(true);

    const result = await sendChatMessage(message, history);
    setIsSending(false);

    if (!result) {
      setError("Something went wrong reaching the AI. Please try again.");
      return;
    }

    setMessages((prev) => [...prev, { role: "assistant", content: result.reply }]);
    if (result.board_update) {
      onBoardUpdate(result.board_update);
    }
  };

  const handleOpen = () => {
    try {
      new Audio("/chat-open.wav").play()?.catch(() => {
        // Autoplay can be blocked by the browser; not worth surfacing to the user.
      });
    } catch {
      // Audio unsupported in this environment (e.g. jsdom in tests); ignore.
    }
    setIsOpen(true);
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Open AI chat"
        className="fixed bottom-6 right-6 z-20 h-24 w-24 overflow-hidden rounded-full shadow-[var(--shadow)] transition hover:scale-105 hover:brightness-110"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ai-chat-icon.png" alt="" className="h-full w-full object-cover" />
      </button>
    );
  }

  return (
    <aside className="fixed bottom-6 right-6 z-20 flex h-[480px] w-[360px] flex-col rounded-[28px] border border-[var(--stroke)] bg-white/95 shadow-[var(--shadow)] backdrop-blur">
      <div className="flex items-center justify-between rounded-t-[28px] border-b border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
        <h2 className="font-display text-sm font-semibold text-[var(--navy-dark)]">
          AI Assistant
        </h2>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          aria-label="Close AI chat"
          className="text-xs font-semibold text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
        >
          Close
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <p className="text-xs text-[var(--gray-text)]">
            Ask me to add, edit, move, or remove cards on your board.
          </p>
        ) : null}
        {messages.map((message, index) => (
          <div
            key={index}
            className={clsx(
              "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
              message.role === "user"
                ? "ml-auto bg-[var(--primary-blue)] text-white"
                : "bg-[var(--surface)] text-[var(--navy-dark)]"
            )}
          >
            {message.content}
          </div>
        ))}
        {isSending ? (
          <p className="text-xs text-[var(--gray-text)]">Thinking...</p>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        ) : null}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex gap-2 border-t border-[var(--stroke)] p-4"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask the AI..."
          aria-label="Chat message"
          className="flex-1 rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
        />
        <button
          type="submit"
          disabled={isSending}
          className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
        >
          Send
        </button>
      </form>
    </aside>
  );
};
