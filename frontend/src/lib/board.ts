import type { BoardData } from "@/lib/kanban";

export const fetchBoard = async (): Promise<BoardData | null> => {
  const response = await fetch("/api/board", { credentials: "include" });
  if (!response.ok) {
    return null;
  }
  return response.json();
};

export const saveBoard = async (board: BoardData): Promise<void> => {
  await fetch("/api/board", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(board),
  });
};
