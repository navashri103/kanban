# Frontend

## Stack

Next.js 16 (App Router) + React 19 + TypeScript. Tailwind CSS 4 for styling. `@dnd-kit/core` + `@dnd-kit/sortable` for drag and drop. Vitest + React Testing Library for unit tests, Playwright for e2e.

## Current state

The app is built as a static export (`next.config.ts` sets `output: "export"`) and served by the backend's FastAPI `StaticFiles` mount at `/` — see the root `Dockerfile` (multi-stage: builds the frontend with Node, copies `frontend/out/` into the backend image as `backend/static/`). Auth is real (signup + password-checked signin against the backend), and the board is persisted via the backend's SQLite-backed API — there is no more local-only/in-memory board state. An AI chat sidebar can read and modify the board via natural language. This is the complete feature set from the root `AGENTS.md` business requirements.

## Structure

- `src/app/page.tsx` — renders `<AuthGate />` at `/`.
- `src/app/layout.tsx` — root layout, loads Space Grotesk (display font) and Manrope (body font), sets page metadata.
- `src/app/globals.css` — Tailwind setup and CSS variables for the color scheme (`--accent-yellow`, `--primary-blue`, `--secondary-purple`, `--navy-dark`, `--gray-text`, plus `--surface`, `--surface-strong`, `--stroke`, `--shadow`).
- `src/lib/kanban.ts` — pure data layer:
  - Types: `Card { id, title, details }`, `Column { id, title, cardIds }`, `BoardData { columns, cards }`.
  - `initialData` — hardcoded demo board (5 columns: Backlog, Discovery, In Progress, Review, Done; 8 cards). Only used as fallback/reference data now (e.g. in tests) — new accounts get their seeded board from the backend (`backend/app/seed.py`), not from this file directly.
  - `moveCard(columns, activeId, overId)` — pure function computing the new column array after a drag-and-drop move (handles reordering within a column, moving into an empty column, and moving between columns).
  - `createId(prefix)` — generates a pseudo-unique id (`prefix-<random><time>`, base36).
  - Unit-tested in `kanban.test.ts`.
- `src/lib/auth.ts` — `fetchSession`, `login`, `signup`, `logout`. All hit the backend with `credentials: "include"` so the session cookie is sent/received.
- `src/lib/board.ts` — `fetchBoard` (`GET /api/board`, returns `null` on failure) and `saveBoard` (`PUT /api/board`, fire-and-forget from the UI's perspective).
- `src/lib/chat.ts` — `sendChatMessage(message, history)` calls `POST /api/ai/chat`, returns `{reply, board_update}` or `null` on failure.
- `src/components/AuthGate.tsx` — client component owning auth state (`"loading" | "authenticated" | "unauthenticated"`) and which form mode is shown (`"signin" | "signup"`). On mount, calls `GET /api/session`; renders `<LoginForm>` or `<KanbanBoard>` accordingly. Resets mode to `"signin"` on logout (a real bug existed here — see Part 7 in `docs/PLAN.md` — where the mode used to stay on `"signup"` after logout if you'd toggled it).
- `src/components/LoginForm.tsx` — shared form for both sign-in and sign-up (`mode` prop), with a toggle link (`onToggleMode`) switching between them. Branded card (gradient logo mark, radial background blobs, labeled fields, gradient submit). Headings are mode-dependent: "Welcome back" (signin) / "Create your account" (signup) — `AuthGate.test.tsx` asserts these as the signal for which mode is shown. Calls `login`/`signup` accordingly; shows an error on failure, calls `onSuccess()` on success.
- `src/components/KanbanBoard.tsx` — top-level client component (`"use client"`). Fetches the board from `GET /api/board` on mount (renders nothing while loading; a simple error message if the fetch fails). All mutations (drag-and-drop move, rename, add card, delete card, add/remove column) go through an `updateBoard` helper that updates local state immediately and fires off `PUT /api/board` to persist (skips the save entirely if the updater returns the same object reference — used by add/remove column to no-op when a limit blocks the action). Renders a slim sticky top bar (gradient logo mark + "Kanban Studio" wordmark with a live `columns · cards` count, a "Columns" +/- icon stepper, and an icon "Log out" button calling `POST /api/logout` via the optional `onLogout` prop), a "Your board" section heading, and a `DragOverlay` preview of the card being dragged. Each column is assigned an accent color by its order from `COLUMN_ACCENTS` (8 brand-harmonized hues, wrapping past 8) and passed down via an `accent` prop. The columns render in a `board-scroll flex gap-5 overflow-x-auto` row where each column wrapper is `min-w-[300px] flex-1` — with few columns they stretch to fill the full width, and past the container width the board scrolls horizontally (with a styled slim scrollbar, see `globals.css`) instead of crushing columns.
  - Column count is bounded by `MIN_COLUMNS = 1` and `MAX_COLUMNS = 8`. Adding appends an empty `"New Column"`. Removing only ever removes the *last* column, and only if it has no cards — this avoids silently deleting data; the "-" button is simply disabled otherwise (with a `title` tooltip explaining why), no confirmation dialog or force-delete option (kept deliberately simple).
- `src/components/KanbanColumn.tsx` — one column. Takes an `accent` color prop used for its top accent bar, header dot, and count badge (badge background is `${accent}1a`, i.e. ~10% alpha via appended hex). Droppable via `useDroppable` (drag-over shows an inline box-shadow ring in the accent color). Renders a `SortableContext` of cards (accent forwarded to each), an editable title `<input>` (rename inline on change — note: this fires a save on every keystroke, no debouncing), an empty-state placeholder, and `<NewCardForm>`.
- `src/components/KanbanCard.tsx` — one card. Sortable via `useSortable` (drag handle is the whole card, `cursor-grab`). Shows title, details, and an icon-only trash delete button (accessible name stays `Delete <title>` — tests rely on it; kept at low opacity so it's usable on touch, not hover-only). Sets `--card-accent` from the `accent` prop; the `.kanban-card` rule in `globals.css` reveals a matching left border on hover.
- `src/components/KanbanCardPreview.tsx` — static, non-interactive render of a card, used inside `DragOverlay` while dragging (slightly rotated with a heavier shadow to read as "lifted").
- `src/components/icons.tsx` — shared inline SVG icons (trash, plus, minus, logout, x, sparkle stroke icons; `KanbanIcon` is a filled logo glyph): no icon library dependency.
- `src/components/NewCardForm.tsx` — inline form for adding a card to a column (title required, details optional); toggles between a button and an open form. Takes an `accent` prop used for the submit button and input focus rings.
- `src/components/ChatSidebar.tsx` — collapsible AI chat. Collapsed state is a floating circular icon button (`public/ai-chat-icon.png`, bottom-right) instead of a text button — chosen by the user over plain text. The source image had a lot of surrounding white canvas making the artwork look tiny at icon size; it was auto-cropped to its content bounding box (Python/Pillow, `ImageChops`-style threshold + `getbbox()`) and the background outside the circular outline was flood-filled to transparent from each corner, so only the line art shows. Clicking it plays `public/chat-open.wav` (best-effort — wrapped in try/catch since browsers can block autoplay and test environments like jsdom don't implement `HTMLMediaElement.play()`) before expanding into the chat panel. Holds the conversation (`ChatMessage[]`) in local React state only — not persisted, resets on page reload (see `backend/AGENTS.md` "AI notes" on why history isn't stored server-side). Sends each message with the prior history via `sendChatMessage`; on a response with `board_update`, calls the `onBoardUpdate` prop directly with the new board (no extra `PUT /api/board` — the backend already persisted it while handling the chat request). Shows "Thinking..." while waiting and a plain error message on failure.
- `src/test/setup.ts` — Vitest/RTL setup (jest-dom matchers, etc.).
- `tests/kanban.spec.ts` — Playwright e2e: login gating, signup/signin/logout via the real forms, wrong-password rejection, board CRUD, the persistence round-trip (sign up → add card → log out → log back in → card still there), a **real, unmocked** AI chat test (asks the sidebar to add a card by name, asserts it appears on the board with no manual refresh), and the column add/remove min/max bounds.

## Conventions

- Components are arrow-function exports (`export const X = (...) => ...`), not `function X()`.
- `"use client"` only where needed (interactive components); `page.tsx`/`layout.tsx` stay server components.
- Styling is Tailwind utility classes inline, referencing CSS custom properties for the brand palette (no separate theme/config layer beyond `globals.css`).
- `data-testid` attributes (`column-<id>`, `card-<id>`) are used for both Playwright and any DOM queries — keep these stable since e2e tests depend on them.
- `clsx` is used for conditional class composition.

## Commands

- `npm run dev` — dev server.
- `npm run build` / `npm run start` — production build/serve (relevant once this is statically built and served by FastAPI per the root plan).
- `npm run test` / `test:unit` — Vitest unit tests.
- `npm run test:e2e` — Playwright e2e tests; by default spawns `next dev` on port 3000. Set `PLAYWRIGHT_BASE_URL` (e.g. `http://localhost:8000`) to instead run against an already-running server, such as the Dockerized app. Note: tests need a real backend to talk to (signup/login/board are real now) — running against plain `next dev` without the Docker backend behind it will not work for most tests.
- `npm run test:all` — unit then e2e.
- `npm run lint` — ESLint.

## Auth

Real authentication: `signup` creates an account (backend hashes the password), `login` checks it. Auth is same-origin only — see `backend/AGENTS.md` "Auth notes" for why standalone `next dev` can't log in against the backend without extra setup.

## Known gaps relative to the target app (root `AGENTS.md`)

None — all business requirements (sign in, Kanban with renameable columns and drag-and-drop, AI chat sidebar that can create/edit/move cards) are implemented as of Part 10.
