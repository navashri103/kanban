import type { BoardData } from "@/lib/kanban";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatResult = {
  reply: string;
  board_update: BoardData | null;
};

export const sendChatMessage = async (
  message: string,
  history: ChatMessage[]
): Promise<ChatResult | null> => {
  const response = await fetch("/api/ai/chat", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
  if (!response.ok) {
    return null;
  }
  return response.json();
};
