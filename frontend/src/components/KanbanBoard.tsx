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
import { createId, moveCard, type BoardData } from "@/lib/kanban";
import { fetchBoard, saveBoard } from "@/lib/board";
import { logout } from "@/lib/auth";

type KanbanBoardProps = {
  onLogout?: () => void;
};

const MIN_COLUMNS = 1;
const MAX_COLUMNS = 8;

export const KanbanBoard = ({ onLogout }: KanbanBoardProps = {}) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
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

  const updateBoard = (updater: (prev: BoardData) => BoardData) => {
    setBoard((prev) => {
      if (!prev) {
        return prev;
      }
      const next = updater(prev);
      if (next === prev) {
        return prev;
      }
      saveBoard(next).catch(() => {
        // Best-effort persistence; the UI already reflects the change locally.
      });
      return next;
    });
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

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="flex items-start gap-4">
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Columns
                </p>
                <div className="mt-2 flex items-center gap-3">
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
                    className="rounded-full border border-[var(--stroke)] px-2.5 py-1 text-sm font-semibold text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    -
                  </button>
                  <span className="w-6 text-center text-lg font-semibold text-[var(--primary-blue)]">
                    {board.columns.length}
                  </span>
                  <button
                    type="button"
                    onClick={handleAddColumn}
                    disabled={board.columns.length >= MAX_COLUMNS}
                    aria-label="Add a column"
                    title={`Up to ${MAX_COLUMNS} columns`}
                    className="rounded-full border border-[var(--stroke)] px-2.5 py-1 text-sm font-semibold text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:border-[var(--secondary-purple)] hover:text-[var(--secondary-purple)]"
              >
                Log out
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section
            className="grid gap-6"
            style={{
              gridTemplateColumns: `repeat(${board.columns.length}, minmax(0, 1fr))`,
            }}
          >
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                onRename={handleRenameColumn}
                onAddCard={handleAddCard}
                onDeleteCard={handleDeleteCard}
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[260px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>

      <ChatSidebar onBoardUpdate={(updatedBoard) => setBoard(updatedBoard)} />
    </div>
  );
};
