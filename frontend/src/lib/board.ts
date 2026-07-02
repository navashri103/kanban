import type { BoardData } from "@/lib/kanban";

export type SaveBoardResult = "ok" | "unauthorized" | "error";

export const fetchBoard = async (): Promise<BoardData | null> => {
  try {
    const response = await fetch("/api/board", { credentials: "include" });
    if (!response.ok) {
      return null;
    }
    return response.json();
  } catch {
    return null;
  }
};

export const saveBoard = async (board: BoardData): Promise<SaveBoardResult> => {
  try {
    const response = await fetch("/api/board", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(board),
    });
    if (response.ok) {
      return "ok";
    }
    return response.status === 401 ? "unauthorized" : "error";
  } catch {
    return "error";
  }
};
