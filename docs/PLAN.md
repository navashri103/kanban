# High level steps for project

This document enriches the original 10-part outline into a detailed, checkable plan. Each part lists substeps, the tests that prove it works, and success criteria. **The agent pauses after each part for user review and sign-off before starting the next part.**

Decisions locked in for this plan (confirmed with user):
- The existing `frontend/` demo (Next.js + dnd-kit Kanban) is reused as-is; later parts wire it to auth and the backend rather than rewriting it.
- Auth is a server-side session: FastAPI sets a session cookie on login; protected API routes check it.
- Approval cadence: stop after every part below for explicit user sign-off.
- This file and all `AGENTS.md` files (root, `backend/`, `frontend/`, `scripts/`) are internal planning/agent docs only — gitignored as of the Part 6/7 commit, so they are not pushed to GitHub. They still exist locally and are kept up to date.

See Part 4 and Part 5 for the auth pivot: the original plan had a hardcoded `user`/`password` login (Part 4), which the user first changed to "accept any non-empty credentials" (still Part 4), then changed again to real signup/signin with hashed passwords (Part 5/6/7) once the actual goal — logging back in and seeing your own saved board — required it.

---

## Part 1: Plan

- [x] Enrich `docs/PLAN.md` with substeps, tests, and success criteria for all parts.
- [x] Create `frontend/AGENTS.md` describing the existing frontend code.
- [ ] User reviews and approves this plan.

**Success criteria:** User has read this document and explicitly approves before Part 2 starts.

---

## Part 2: Scaffolding

Goal: a Dockerized FastAPI backend that serves a static "hello world" HTML page at `/` and exposes one example API route, plus start/stop scripts.

- [ ] Create `backend/` with `uv`-managed Python project (`pyproject.toml`), FastAPI + uvicorn.
- [ ] Add `backend/app/main.py`: FastAPI app that
  - serves a static `index.html` (plain "Hello world" page) at `GET /`
  - exposes `GET /api/health` returning `{"status": "ok"}`
- [ ] Write `Dockerfile` (root or `backend/`) that installs deps via `uv`, copies the backend, and runs uvicorn.
- [ ] Write `docker-compose.yml` (or single-container `docker run` setup — decide based on simplicity) wiring the `.env` file (`OPENROUTER_API_KEY`) into the container.
- [ ] Write `scripts/start.sh` (Mac/Linux), `scripts/start.ps1` or `.bat` (PC), and matching `stop` scripts that build/run/stop the Docker container.
- [ ] Update `backend/AGENTS.md` describing the backend structure.

**Tests:**
- Backend unit test (pytest) hitting `GET /api/health` and asserting 200 + expected JSON.
- Backend unit test hitting `GET /` and asserting 200 + HTML content.
- Manual: run `scripts/start` on the dev machine, confirm `http://localhost:<port>/` loads "Hello world" in a browser and `/api/health` returns ok via curl, then run `scripts/stop` and confirm the container stops.

**Success criteria:** `scripts/start` brings up one Docker container serving a hello-world page and a working health API call at a fixed local port; `scripts/stop` tears it down cleanly; pytest suite passes.

---

## Part 3: Add in Frontend

Goal: the real Kanban demo (not hello-world) is statically built and served by FastAPI at `/`.

- [ ] Add a frontend build step: `npm run build` produces static output (Next.js static export or build output appropriate for serving via FastAPI `StaticFiles`).
- [ ] Update Dockerfile to a multi-stage build: build the frontend, copy the static output into the backend image, serve it via FastAPI.
- [ ] FastAPI serves the built frontend at `/` (replacing the Part 2 hello-world page) and continues to serve `/api/*` routes.
- [ ] Keep existing frontend unit tests (Vitest) and e2e tests (Playwright) passing against the new build.

**Tests:**
- Existing Vitest unit tests (`kanban.test.ts`, `KanbanBoard.test.tsx`) pass unchanged.
- Existing Playwright e2e (`tests/kanban.spec.ts`) passes against the Dockerized app (point `baseURL` at the container).
- New backend test: `GET /` returns the Next.js-built HTML (contains "Kanban Studio"), not the old hello-world page.

**Success criteria:** Running `scripts/start` and visiting `/` shows the full Kanban demo board (drag/drop, add card, rename column all work), served entirely from the Docker container; all unit + e2e tests pass.

---

## Part 4: Add in a fake user sign in experience

Goal: visiting `/` requires login; the Kanban is hidden until authenticated; logout is supported.

Note: this is a fake/demo login by design — any non-empty username and password are accepted (no real credential check). Changed from the original hardcoded `user`/`password`-only spec at the user's request, since the point is to gate the UI behind *some* login step, not to test real auth. `pm/AGENTS.md` reflects this.

**Superseded in Part 6:** the user asked for real accounts (proper signup + password-checked signin) so that logging back in returns your own saved board. Part 6 replaces the fake login with real signup/signin; this section is left as a historical record of what Part 4 originally built.

- [x] Backend: `POST /api/login` sets an httpOnly session cookie for any non-empty username/password (422 if either field is missing).
- [x] Backend: `POST /api/logout` clears the session cookie.
- [x] Backend: `GET /api/session` returns whether the current request has a valid session (used by frontend to decide what to render).
- [x] Backend: `require_session` dependency exists to protect future `/api/*` routes that require auth (not yet applied to any route — no protected routes exist until Part 6).
- [x] Frontend: add a login screen (username/password form) shown when not authenticated; on success, show the existing `KanbanBoard`.
- [x] Frontend: add a logout control (in the board header) that calls `/api/logout` and returns to the login screen.

**Tests:**
- Backend unit tests: login with any credentials → 200 + cookie set; missing fields → 422; `/api/session` reflects logged-in/out state; logout clears session so a subsequent `/api/session` reports logged out.
- Frontend unit tests: login form renders, calls `onSuccess` on a successful response, shows an error and does not call `onSuccess` on a failed response; `AuthGate` shows login vs. board based on session state and returns to login after logout.
- Playwright e2e: fresh visit to `/` shows login, not the board; logging in with any non-empty username/password shows the board; logging out returns to login.

**Success criteria:** No unauthenticated path to view or interact with the Kanban; login/logout works end-to-end in the browser and is covered by automated tests. (Met — verified via pytest, Vitest, and Playwright against the Dockerized app.)

---

## Part 5: Database modeling

Goal: a documented, user-approved schema for real user accounts + a single Kanban board per user, stored as JSON spec, backed by SQLite.

Revised per user request: real authentication (signup creates an account, signin checks a hashed password) instead of the fake login from Part 4, so that logging back in with the same username/password returns your own previously saved board.

- [x] Propose schema: `users(id, username, password_hash, created_at)` and `boards(id, user_id, data JSON, updated_at)`, where `data` matches the existing `BoardData` shape from `frontend/src/lib/kanban.ts`. Passwords are hashed (`bcrypt`, added in Part 6) — never stored in plain text.
- [x] Save the schema as JSON: `docs/db-schema.json`.
- [x] Write `docs/database.md` documenting the approach: tables, relationships, why JSON-blob vs normalized was chosen, the revised auth model, creation strategy (tables created on first run if missing; a new user's board is seeded from `initialData` at signup time).

**Tests:** `python -c "import json; json.load(open('docs/db-schema.json'))"` confirms the file is valid JSON. (Passed.)

**Success criteria:** User explicitly signs off on the schema and `docs/database.md` before Part 6 implementation begins. **(Approved.)**

---

## Part 6 (revised): Real signup/signin + backend board persistence

Goal: replace the fake login with real accounts, and back the Kanban board with the SQLite schema from Part 5, so a user's board survives logout/login and backend restarts. Frontend signup UI is deliberately deferred to Part 7 (backend-only layer first, per the user's request to pause after each layer).

- [x] Add `bcrypt` as a backend dependency.
- [x] On backend startup, create `users` and `boards` tables if they don't exist (idempotent) — `app/db.py`'s `init_db()`.
- [x] `POST /api/signup` — creates a new user (hashes the password with bcrypt), 409 if username is taken, seeds a board from `INITIAL_BOARD`, starts a session.
- [x] `POST /api/login` — verifies username + password against the stored hash, 401 if wrong/unknown, starts a session.
- [x] `POST /api/logout` — ends the session.
- [x] `GET /api/session` — same shape as before, now backed by a real `user_id`.
- [x] `GET /api/board` — returns the signed-in user's board (401 if not signed in).
- [x] `PUT /api/board` — replaces the signed-in user's board with the given data (401 if not signed in; shape validated via Pydantic).
- [x] `docker-compose.yml` — added a volume mount (`./backend/data:/app/data`) so the SQLite file survives container restarts.

**Tests:**
- Backend (14 passing): signup creates a user + seeded board + session; duplicate username → 409; login with correct password → session set; login with wrong password → 401; login with unknown username → 401; `GET /api/board` requires a session and returns the right user's data; `PUT /api/board` persists and is reflected in a subsequent `GET`; two users have independent boards; a brand-new client/session reads the same data back (proves it's in SQLite, not memory).
- Frontend e2e (8 passing, via `page.request` to create accounts since there's no signup UI yet): rejects unknown account; logs out; logging in via the real form works and rejects a wrong password; board loads/add-card/move-card all still work post-login.

**Success criteria:** Sign up, add/move/rename a card, log out, log back in with the same username/password — your board is exactly as you left it. **Verified manually** via PowerShell `Invoke-RestMethod` calls: renamed a column, fully restarted the Docker container (`down` + `up`, not just the app reloading), logged back in, and the renamed column was still there. Also verified a wrong password is correctly rejected with 401.

---

## Part 7 (revised): Frontend uses the real backend board API

Goal: `KanbanBoard` loads from and saves to `GET`/`PUT /api/board` instead of local-only state, so the UI reflects Part 6's persistence. Also adds the signup screen that was deferred from Part 6.

- [x] Replace `KanbanBoard`'s local `useState<BoardData>` initialization with a fetch from `GET /api/board` on mount (`frontend/src/lib/board.ts`).
- [x] Wire move/rename/add/delete handlers to also persist via `PUT /api/board` (`updateBoard` helper wraps every mutation: update local state, fire-and-forget save).
- [x] Handle loading (renders nothing until the board arrives) and error states (a simple message if the initial fetch fails, e.g. expired session).
- [x] `LoginForm` now supports both `signin` and `signup` modes with a toggle link; `AuthGate` manages which mode is shown and resets to `signin` after logout.

**Tests:**
- Frontend unit tests (14 passing): `KanbanBoard` tests mock `GET`/`PUT /api/board`; `LoginForm` tests cover both sign-in and sign-up submission plus the mode-toggle link; `AuthGate` tests mock per-URL responses and cover login/logout/signup-toggle.
- Playwright e2e (10 passing): includes signing up via the real form, and the key round-trip test — **sign up, add a card, log out, log back in via the real form, the card is still there** — proving persistence end-to-end through the actual UI, not API shortcuts.

**Success criteria:** Reloading or logging back in shows the same board — true persistence, not just an in-memory illusion. **Verified** via the e2e test above; this is the original bug report, now fixed and covered by an automated test.

A real bug was caught and fixed during this work: after logging out, the login form stayed in whatever mode (`signin`/`signup`) it was last in, instead of resetting to `signin` — found by the persistence e2e test, fixed in `AuthGate`'s `onLogout` handler.

---

## Part 8: AI connectivity

Goal: backend can call an AI model via OpenRouter; verified with a trivial sanity check.

- [x] Add OpenRouter client config in backend, reading `OPENROUTER_API_KEY` from `.env` (`backend/app/ai.py`, `ask_ai()`).
- [x] Choose a specific free-tier OpenRouter model and document it (see `backend/AGENTS.md`). First choice (`meta-llama/llama-3.3-70b-instruct:free`) was actively rate-limited upstream at the time of testing (confirmed via direct curl to OpenRouter, not assumed) — queried OpenRouter's live `/api/v1/models` endpoint for currently-available free models and settled on `google/gemma-4-31b-it:free`, which returned a clean "4" with zero cost.
- [x] Add `GET /api/ai/ping` that asks the model "What is 2+2?" and returns the response.

**Tests:**
- Backend test (`tests/test_ai.py`, skipped automatically if `OPENROUTER_API_KEY` isn't set) calls the route and asserts the response contains "4". Ran for real (not skipped) since the key is present — passed.
- Manual check: `curl http://localhost:8000/api/ai/ping` against the Dockerized app returned `{"reply":"4"}`.

**Success criteria:** A real OpenRouter call succeeds end-to-end and reliably returns a correct answer to a trivial question. **Met.**

---

## Part 9: AI chat with Kanban-aware Structured Outputs

Goal: the AI call always includes the current board JSON, the user's message, and conversation history; it responds with a structured message + optional board update.

- [x] Defined a Structured Output schema (OpenRouter/OpenAI `response_format: json_schema`, `strict: true`): `{ reply: string, board_update: { columns: [...], cards: [...] } | null }`. `cards` is an **array** of `{id, title, details}` in the schema (not an object keyed by id) — strict JSON Schema can't express "object with arbitrary keys", confirmed by testing the dict-keyed shape directly against OpenRouter before settling on the array form. Converted back to the dict-keyed `BoardData` shape on the backend (`_board_update_to_board_data` in `app/ai.py`) before saving/returning.
- [x] `POST /api/ai/chat` — accepts `{ message: string, history: [...] }`, loads the current user's board, sends board + message + history to the model with the structured schema enforced, returns `{ reply, board_update }`.
- [x] If `board_update` is present, persists it via `db.save_board` (reusing Part 6's storage).
- [x] History is passed in by the frontend on each request (not stored server-side) — simplest option for an MVP; the sidebar component holds the running conversation in React state and resets if the page reloads. Documented as a deliberate simplicity trade-off, not an oversight.
- [x] Graceful failure: if the OpenRouter call errors (e.g. the rate-limiting seen in Part 8), `/api/ai/chat` catches it and returns a normal 200 with a friendly "couldn't reach the AI" reply instead of crashing — confirmed this matters in practice, since free models genuinely do get rate-limited.

**Tests:**
- Backend unit tests with a mocked `chat_about_board` (monkeypatched, not network-mocked): a board update is persisted and returned; no board update leaves the board untouched; an upstream failure (`httpx.HTTPStatusError`) falls back gracefully without crashing or touching the board.
- A real, unmocked integration test (`test_chat_real_call_adds_a_card_end_to_end`, skipped without `OPENROUTER_API_KEY`) that asks the AI to "Add a card called Integration Test Card to the Backlog column" and asserts the card exists in the persisted board afterward. Ran for real — passed.

**Success criteria:** The chat endpoint reliably round-trips board state through the AI and applies valid updates, with thorough tests including failure/edge cases. **Met** — 21/21 backend tests passing, including the real end-to-end one.

---

## Part 10: AI chat sidebar in the UI

Goal: a sidebar widget for full AI chat that can trigger live Kanban updates in the UI.

- [x] `ChatSidebar` component (collapsible — starts as a floating "AI Chat" button, expands into a panel), message history, input box, send button, styled per the project's color scheme.
- [x] Wired to `POST /api/ai/chat` (`src/lib/chat.ts`), displaying the AI's `reply` in the conversation.
- [x] If the response includes a `board_update`, the board updates immediately via `KanbanBoard`'s `onBoardUpdate` callback (`setBoard(updatedBoard)` directly — no extra `PUT /api/board` call, since the backend already persisted it as part of handling the chat request).
- [x] Loading ("Thinking...") and error ("Something went wrong reaching the AI...") states in the chat UI.

**Tests:**
- Frontend unit tests (4, mocked fetch): sidebar starts collapsed and opens on click; sending a message renders the reply; a response with a board update calls `onBoardUpdate`; a failed request shows an error.
- Playwright e2e (`AI chat sidebar can add a card to the board live`) — a **real, unmocked** AI call: opens the sidebar, asks it to add a card by name, and asserts the card appears on the visible board with no manual refresh. Passed (and ran fast — the model responded quickly that time, unlike some of the rate-limiting seen earlier).

**Success criteria:** A user can chat with the AI in the sidebar and watch the Kanban board update live in response to natural-language requests, fully tested. **Met** — verified with a real model call end-to-end through the actual UI, not a mock.

---

## Post-launch enhancements (after Part 10)

User-requested polish after the original 10-part plan was complete:

- **Custom chat sound + icon.** Sound (`frontend/public/chat-open.wav`) plays on click via `new Audio(...).play()`, wrapped in try/catch since browsers can block autoplay and jsdom (tests) doesn't implement it. Icon (`frontend/public/ai-chat-icon.png`) replaced the plain "AI Chat" text button; the source image had a large white margin around the artwork making it look tiny, so it was auto-cropped to its content bounding box and the background outside the circular outline was made transparent (Python/Pillow, run as a one-off script — not part of the app) before being placed in a bigger (96px) circular button.
- **Configurable column count.** A "Columns" +/- stepper in the board header, bounded `MIN_COLUMNS = 1` / `MAX_COLUMNS = 8`. Adding appends an empty column; removing only removes the last column, and only if it's empty (button disabled otherwise, with a tooltip) — chosen over silently deleting cards or a confirmation dialog, to keep it simple while still being safe. The column grid switched from a static Tailwind `lg:grid-cols-5` class to an inline `gridTemplateColumns` style driven by `board.columns.length`, since Tailwind can't generate a class for an arbitrary runtime column count.

**Tests:** 3 new frontend unit tests (add up to max then disabled; remove blocked while last column has cards; remove succeeds once empty) and 1 new Playwright e2e test (add a column, confirm remove becomes enabled, remove it, back to original count). All passing alongside the full existing suite (21 unit, 12 e2e).
