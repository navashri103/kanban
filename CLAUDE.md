# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-board Kanban project management app ("Kanban Studio"). Users sign up/sign in with a real
username+password (bcrypt-hashed), get one persistent Kanban board (columns + cards, drag-and-drop,
renameable columns, 1-8 columns), and can edit the board via an AI chat sidebar (Google Gemini, structured
outputs). Everything runs as a single Docker container: Next.js is statically exported and served by
FastAPI, which also owns all the API routes and a SQLite database.

Detailed, authoritative docs already exist per area — read them before making changes in that area:
- `AGENTS.md` (repo root) — business requirements, tech decisions, color scheme, coding standards.
- `backend/AGENTS.md` — every backend route, module, and AI/auth implementation detail.
- `frontend/AGENTS.md` — every frontend component/module, conventions, commands.
- `scripts/AGENTS.md` — start/stop scripts.
- `docs/PLAN.md` — part-by-part build log (why things are shaped the way they are).
- `docs/database.md` / `docs/db-schema.json` — DB schema reference.
- `TUTORIAL.md` — full walkthrough of the system end to end; useful for onboarding-level context.

This CLAUDE.md summarizes commands and architecture; the AGENTS.md files are the source of truth for
route-by-route and component-by-component behavior — prefer them over guessing from file names.

## Commands

### Run the full app (Docker, matches production)
From the repo root (`pm/`):
```
scripts/start.sh     # Mac/Linux
scripts/start.ps1    # Windows
```
Visit `http://localhost:8000`. Stop with `scripts/stop.sh` / `scripts/stop.ps1`. The SQLite file at
`backend/data/pm.db` persists on the host across stop/start (Docker volume).

### Backend (from `backend/`)
- Install deps: `uv sync`
- Run dev server: `uv run uvicorn app.main:app --reload`
- Run all tests: `uv run pytest`
- Run a single test file: `uv run pytest tests/test_board.py`
- Run a single test: `uv run pytest tests/test_board.py::test_name`
- Tests needing `GEMINI_API_KEY` (in `tests/test_ai.py`, `tests/test_ai_chat.py`) auto-skip if the
  key isn't set.
- Each test gets an isolated temp SQLite DB and cleared in-memory sessions (`tests/conftest.py`) — tests
  never touch your real local `pm.db`.

### Frontend (from `frontend/`)
- Install deps: `npm install`
- Dev server: `npm run dev`
- Build/serve production: `npm run build` / `npm run start`
- Lint: `npm run lint`
- Unit tests (Vitest): `npm run test` or `npm run test:unit`
- Unit tests, watch mode: `npm run test:unit:watch`
- Single unit test file: `npx vitest run src/lib/kanban.test.ts`
- E2E tests (Playwright): `npm run test:e2e` — by default spawns `next dev` on port 3000, but auth/board
  are real and need a real backend, so set `PLAYWRIGHT_BASE_URL=http://localhost:8000` and run against
  the Dockerized app instead (`scripts/start.sh` first).
- Unit + e2e: `npm run test:all`

Note: `next dev` standalone (no Docker backend behind it) cannot log in — auth is same-origin only, no
CORS is configured. Always test full auth/board/AI flows against the Dockerized backend.

## Architecture

**Two-part app, single deployable artifact.** The `Dockerfile` is a multi-stage build: stage 1 builds
the Next.js frontend as a static export (`output: "export"` in `next.config.ts`) producing `frontend/out/`;
stage 2 is the Python image, which copies that output into `backend/static/` and serves it via FastAPI's
`StaticFiles` mount at `/`. There is no Next.js server in production — everything is one FastAPI/uvicorn
process on port 8000. `backend/static/` is gitignored and only exists after the Docker build runs (or
after copying a frontend build manually) — this is why `tests/test_main.py`'s "serves the frontend" test
requires that build step first.

**Data flow for any board mutation (drag-drop, rename, add/remove card/column, or AI edit)** is always
the same round trip: frontend updates local React state immediately (optimistic UI) → fires
`PUT /api/board` (or the AI chat route persists directly) → FastAPI validates the JSON shape via
Pydantic (`BoardData`) → SQLite `boards` table stores the *entire board as one JSON blob* keyed by
`user_id` (not normalized into rows — the frontend and backend both think of a board as one JSON object,
so no translation layer is needed; see `docs/database.md`).

**Auth is sessions-in-memory + passwords-in-SQLite, deliberately split.** `app/auth.py` holds a
process-wide `dict[str, int]` (session token → user_id) — restarting the backend logs everyone out, but
board data (in SQLite) is untouched. There's no signup UI-less gap: `/api/signup` is the only way to
create the account backing a login. Because the frontend is served by the same FastAPI app, auth is
strictly same-origin (httpOnly cookie) — no CORS layer exists, so anything that talks to the backend
from a different origin (e.g. bare `next dev`) cannot authenticate.

**AI board edits go through structured outputs, with a shape-conversion step.** `POST /api/ai/chat`
(`app/ai.py: chat_about_board`) sends the current board JSON + user message + history to Gemini with
a strict JSON Schema response format, forcing `{reply, board_update}`. Because JSON Schema can't express
"object with arbitrary keys," the schema requires `board_update.cards` as an **array**, and
`_board_update_to_board_data` converts it back into the dict-keyed `BoardData` shape the rest of the app
uses before persisting/returning it. If the upstream call fails (`httpx.HTTPStatusError`/`KeyError`/
`ValueError` — free-tier rate limiting is a real, observed failure mode, not theoretical), the route
catches it and returns a canned 200 fallback reply rather than a 500, so the chat UI never hard-fails on
an AI hiccup. Conversation history is not persisted server-side; the frontend resends the full history
each call.

**Frontend data layer (`src/lib/`) is a thin, side-effect-free boundary.** `kanban.ts` holds all pure
board logic (types, `moveCard`, id generation) with no network calls — it's unit tested directly.
`auth.ts`, `board.ts`, `chat.ts` are the only files that call `fetch()`, each wrapping one concern.
Components (`AuthGate`, `KanbanBoard`, `ChatSidebar`, etc.) own state and orchestrate these lib calls but
don't duplicate fetch logic.

## Conventions worth preserving

- Coding standard from root `AGENTS.md`: keep it simple, no over-engineering, no unnecessary defensive
  programming, no extra features beyond what's asked. No emojis, ever.
- When debugging, identify root cause with evidence before changing code — don't guess-and-check fixes.
- Backend: keep route handlers thin in `app/main.py`; split into new modules under `app/` rather than
  letting it grow into a monolith.
- Frontend: components are arrow-function exports, not `function X()`. `"use client"` only where
  interactivity is actually needed. Tailwind utility classes inline referencing the CSS custom properties
  in `globals.css` for the brand palette — no separate theme layer. `data-testid` attributes
  (`column-<id>`, `card-<id>`) are load-bearing for Playwright — keep them stable.
- Color scheme (see root `AGENTS.md` for full list): accent yellow `#ecad0a`, primary blue `#209dd7`,
  secondary purple `#753991`, dark navy `#032147`, gray text `#888888`.
