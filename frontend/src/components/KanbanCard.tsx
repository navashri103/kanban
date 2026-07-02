import type { CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { Card } from "@/lib/kanban";
import { TrashIcon } from "@/components/icons";

type KanbanCardProps = {
  card: Card;
  accent: string;
  onDelete: (cardId: string) => void;
};

export const KanbanCard = ({ card, accent, onDelete }: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    "--card-accent": accent,
  } as CSSProperties;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "kanban-card group cursor-grab rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3.5 shadow-[0_6px_16px_rgba(3,33,71,0.06)]",
        "transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(3,33,71,0.12)] active:cursor-grabbing",
        isDragging && "opacity-50"
      )}
      {...attributes}
      {...listeners}
      data-testid={`card-${card.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-display text-[15px] font-semibold leading-snug text-[var(--navy-dark)]">
            {card.title}
          </h4>
          <p className="mt-1.5 text-sm leading-6 text-[var(--gray-text)]">
            {card.details}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onDelete(card.id)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--gray-text)] opacity-40 transition hover:bg-red-50 hover:text-red-500 focus-visible:opacity-100 group-hover:opacity-100"
          aria-label={`Delete ${card.title}`}
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
};
