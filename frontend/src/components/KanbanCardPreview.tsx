import type { Card } from "@/lib/kanban";

type KanbanCardPreviewProps = {
  card: Card;
};

export const KanbanCardPreview = ({ card }: KanbanCardPreviewProps) => (
  <article className="cursor-grabbing rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3.5 shadow-[0_22px_40px_rgba(3,33,71,0.22)]">
    <h4 className="font-display text-[15px] font-semibold leading-snug text-[var(--navy-dark)]">
      {card.title}
    </h4>
    <p className="mt-1.5 text-sm leading-6 text-[var(--gray-text)]">
      {card.details}
    </p>
  </article>
);
