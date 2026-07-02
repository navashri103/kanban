"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { ChatSidebar } from "@/components/ChatSidebar";
import { createId, moveCard, type BoardData, type Card } from "@/lib/kanban";
import { fetchBoard, saveBoard } from "@/lib/board";
import { logout } from "@/lib/auth";
import { KanbanIcon, LogoutIcon, MinusIcon, PlusIcon } from "@/components/icons";

type KanbanBoardProps = {
  onLogout?: () => void;
};

const MIN_COLUMNS = 1;
const MAX_COLUMNS = 8;

// Per-column accent, harmonised with the brand palette. Indexed by column order.
const COLUMN_ACCENTS = [
  "#209dd7", // blue
  "#753991", // purple
  "#ecad0a", // yellow
  "#0ea5a3", // teal
  "#e0537b", // rose
  "#5b6bd6", // indigo
  "#f97316", // orange
  "#16a34a", // green
];

const accentFor = (index: number) =>
  COLUMN_ACCENTS[index % COLUMN_ACCENTS.length];

export const KanbanBoard = ({ onLogout }: KanbanBoardProps = {}) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  useEffect(() => {
    fetchBoard().then((data) => {
      if (data) {
        setBoard(data);
      } else {
        setLoadFailed(true);
      }
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const cardsById = useMemo(() => board?.cards ?? {}, [board]);

  const persistBoard = async (next: BoardData) => {
    const result = await saveBoard(next);
    if (result === "unauthorized") {
      // Session expired (e.g. backend restart): stop pretending edits save.
      onLogout?.();
      return;
    }
    setSaveFailed(result === "error");
  };

  const updateBoard = (updater: (prev: BoardData) => BoardData) => {
    if (!board) {
      return;
    }
    const next = updater(board);
    if (next === board) {
      return;
    }
    setBoard(next);
    void persistBoard(next);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id) {
      return;
    }

    updateBoard((prev) => ({
      ...prev,
      columns: moveCard(prev.columns, active.id as string, over.id as string),
    }));
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    updateBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    }));
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    const id = createId("card");
    updateBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [id]: { id, title, details: details || "No details yet." },
      },
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    }));
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    updateBoard((prev) => ({
      ...prev,
      cards: Object.fromEntries(
        Object.entries(prev.cards).filter(([id]) => id !== cardId)
      ),
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cardIds: column.cardIds.filter((id) => id !== cardId),
            }
          : column
      ),
    }));
  };

  const handleAddColumn = () => {
    updateBoard((prev) => {
      if (prev.columns.length >= MAX_COLUMNS) {
        return prev;
      }
      const id = createId("col");
      return {
        ...prev,
        columns: [...prev.columns, { id, title: "New Column", cardIds: [] }],
      };
    });
  };

  const handleRemoveColumn = () => {
    updateBoard((prev) => {
      const lastColumn = prev.columns[prev.columns.length - 1];
      if (
        prev.columns.length <= MIN_COLUMNS ||
        !lastColumn ||
        lastColumn.cardIds.length > 0
      ) {
        return prev;
      }
      return { ...prev, columns: prev.columns.slice(0, -1) };
    });
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  const handleLogout = async () => {
    await logout();
    onLogout?.();
  };

  if (loadFailed) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-[var(--gray-text)]">
          Couldn&apos;t load your board. Try refreshing the page.
        </p>
      </main>
    );
  }

  if (!board) {
    return null;
  }

  const totalCards = Object.keys(cardsById).length;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.22)_0%,_rgba(32,157,215,0.04)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.16)_0%,_rgba(117,57,145,0.04)_55%,_transparent_75%)]" />

      <header className="sticky top-0 z-20 border-b border-[var(--stroke)] bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-3">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-[var(--shadow-soft)]"
              style={{ background: "var(--brand-gradient)" }}
            >
              <KanbanIcon className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <h1 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="text-xs text-[var(--gray-text)]">
                {board.columns.length} columns &middot; {totalCards} cards
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-full border border-[var(--stroke)] bg-[var(--surface)] p-1">
              <button
                type="button"
                onClick={handleRemoveColumn}
                disabled={
                  board.columns.length <= MIN_COLUMNS ||
                  (board.columns[board.columns.length - 1]?.cardIds.length ??
                    0) > 0
                }
                aria-label="Remove a column"
                title="Removes the last column (must be empty)"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--navy-dark)] transition hover:bg-white hover:text-[var(--primary-blue)] hover:shadow-[var(--shadow-soft)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:shadow-none"
              >
                <MinusIcon className="h-4 w-4" />
              </button>
              <span className="min-w-[3.5rem] text-center text-xs font-semibold text-[var(--navy-dark)]">
                <span className="text-sm text-[var(--primary-blue)]">
                  {board.columns.length}
                </span>{" "}
                cols
              </span>
              <button
                type="button"
                onClick={handleAddColumn}
                disabled={board.columns.length >= MAX_COLUMNS}
                aria-label="Add a column"
                title={`Up to ${MAX_COLUMNS} columns`}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--navy-dark)] transition hover:bg-white hover:text-[var(--primary-blue)] hover:shadow-[var(--shadow-soft)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:shadow-none"
              >
                <PlusIcon className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Log out"
              className="flex h-10 items-center gap-2 rounded-full border border-[var(--stroke)] px-4 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:border-[var(--secondary-purple)] hover:text-[var(--secondary-purple)]"
            >
              <LogoutIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-[1600px] px-6 pb-16 pt-8">
        <div className="mb-6">
          <h2 className="font-display text-2xl font-semibold text-[var(--navy-dark)]">
            Your board
          </h2>
          <p className="mt-1 text-sm text-[var(--gray-text)]">
            Drag cards between stages, rename columns inline, and capture quick
            notes as you go.
          </p>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="board-scroll flex gap-5 overflow-x-auto pb-4">
            {board.columns.map((column, index) => (
              <div key={column.id} className="min-w-[300px] flex-1">
                <KanbanColumn
                  column={column}
                  accent={accentFor(index)}
                  cards={column.cardIds
                    .map((cardId) => board.cards[cardId])
                    .filter((card): card is Card => Boolean(card))}
                  onRename={handleRenameColumn}
                  onAddCard={handleAddCard}
                  onDeleteCard={handleDeleteCard}
                />
              </div>
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[280px] rotate-2">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>

      {saveFailed ? (
        <div
          role="alert"
          className="fixed bottom-6 left-6 z-30 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 shadow-[var(--shadow)]"
        >
          Changes could not be saved. They will be retried with your next edit.
        </div>
      ) : null}

      <ChatSidebar onBoardUpdate={(updatedBoard) => setBoard(updatedBoard)} />
    </div>
  );
};
