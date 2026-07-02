import type { CSSProperties } from "react";
import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  accent: string;
  onRename: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, title: string, details: string) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
};

export const KanbanColumn = ({
  column,
  cards,
  accent,
  onRename,
  onAddCard,
  onDeleteCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex h-full min-h-[560px] flex-col overflow-hidden rounded-3xl border bg-[var(--surface-strong)] transition",
        isOver ? "border-transparent" : "border-[var(--stroke)]"
      )}
      style={
        {
          boxShadow: isOver
            ? `0 0 0 2px ${accent}, var(--shadow-soft)`
            : "var(--shadow-soft)",
        } as CSSProperties
      }
      data-testid={`column-${column.id}`}
    >
      <div className="h-1.5 w-full" style={{ backgroundColor: accent }} />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: accent }}
          />
          <input
            value={column.title}
            onChange={(event) => onRename(column.id, event.target.value)}
            className="min-w-0 flex-1 bg-transparent font-display text-base font-semibold text-[var(--navy-dark)] outline-none"
            aria-label="Column title"
          />
          <span
            className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums"
            style={{ backgroundColor: `${accent}1a`, color: accent }}
          >
            {cards.length}
          </span>
        </div>

        <div className="mt-4 flex flex-1 flex-col gap-3">
          <SortableContext
            items={column.cardIds}
            strategy={verticalListSortingStrategy}
          >
            {cards.map((card) => (
              <KanbanCard
                key={card.id}
                card={card}
                accent={accent}
                onDelete={(cardId) => onDeleteCard(column.id, cardId)}
              />
            ))}
          </SortableContext>
          {cards.length === 0 && (
            <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--stroke-strong)] px-3 py-6 text-center text-xs font-medium text-[var(--gray-text)]">
              No cards yet. Add one below.
            </div>
          )}
        </div>

        <NewCardForm
          accent={accent}
          onAdd={(title, details) => onAddCard(column.id, title, details)}
        />
      </div>
    </section>
  );
};
