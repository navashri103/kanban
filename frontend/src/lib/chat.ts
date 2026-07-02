import type { BoardData } from "@/lib/kanban";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatResult = {
  reply: string;
  board_update: BoardData | null;
};

// The backend caps history at 50 messages; send the most recent ones.
const MAX_HISTORY = 50;

export const sendChatMessage = async (
  message: string,
  history: ChatMessage[]
): Promise<ChatResult | null> => {
  const response = await fetch("/api/ai/chat", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history: history.slice(-MAX_HISTORY) }),
  });
  if (!response.ok) {
    return null;
  }
  return response.json();
};
