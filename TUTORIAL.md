# Tutorial: How This Project Works

This document explains the Kanban Studio project end to end — what it does, how it's built, and why it's built that way. It's written for someone who wants to understand the whole system, not just skim a feature list.

## 1. What the app does

It's a single-board Kanban tool:
- You sign up (or sign in) with a username and password.
- You see a board with columns (e.g. Backlog, In Progress, Done) and cards inside them.
- You can rename columns, add/remove cards, and drag cards between columns.
- You can add or remove columns (between 1 and 8).
- There's an AI chat sidebar — you can type things like "Add a card called Buy milk to the Backlog" and the AI edits your board for you, live, no page reload.
- Everything you do is saved. Log out, close the tab, come back tomorrow, log back in — your board is exactly as you left it.

## 2. The big picture: how a click becomes saved data

When you drag a card to a new column, here's the full journey:

1. **Browser**: `@dnd-kit` fires a drag-end event in `KanbanBoard.tsx`.
2. **React state**: the board's local state updates immediately, so the UI feels instant.
3. **Network call**: a `PUT /api/board` request fires in the background with the new board as JSON.
4. **Backend**: FastAPI receives it, checks you're logged in (via a session cookie), and validates the JSON shape.
5. **Database**: the backend writes the new board (as a JSON string) into a `boards` table in a SQLite file on disk.
6. Done. If you reload the page, step-by-step the reverse happens: the frontend asks `GET /api/board`, the backend reads the row back out of SQLite, and your board reappears exactly as saved.

The AI chat does something similar, except instead of you dragging a card, you type a sentence, and the AI decides what the new board JSON should look like.

## 3. The stack, and why each piece was chosen

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | Next.js (React) | Modern, component-based, was already the starting demo |
| Frontend styling | Tailwind CSS | Utility classes, no separate CSS files to maintain |
| Drag and drop | `@dnd-kit` | Already part of the starting demo, works well |
| Backend framework | FastAPI (Python) | Simple to write typed API routes, auto-validates request bodies |
| Backend package manager | `uv` | Much faster than pip, replaces venv+pip+pip-tools with one tool |
| Database | SQLite | Zero setup — it's just a file, no separate database server to run |
| Password hashing | `bcrypt` | Industry-standard; the right way to never store real passwords |
| AI provider | Google Gemini | Free tier, reliable structured outputs (replaced OpenRouter's flaky free pool) |
| Packaging | Docker | The whole app (frontend + backend) runs as one container, same on any machine |
| Testing | pytest (backend), Vitest + Playwright (frontend) | Standard tools for their ecosystems |

## 4. The two halves: frontend and backend

### Frontend (`frontend/`)

This is what you see in the browser. It's a Next.js app, but with a twist: it's **statically exported** (`next build` with `output: "export"`) — meaning Next.js produces plain HTML/CSS/JS files, with no Next.js server running in production. Those static files get served by the *backend* (more on that below).

Key files:
- `src/components/AuthGate.tsx` — decides whether to show the login form or the board, by asking the backend "is this browser currently logged in?"
- `src/components/LoginForm.tsx` — one form that handles both signing in and signing up (a toggle switches which mode it's in).
- `src/components/KanbanBoard.tsx` — the board itself. Loads your board from the backend on page load, and saves it back after every change.
- `src/components/ChatSidebar.tsx` — the AI chat panel.
- `src/lib/*.ts` — small helper files that just wrap `fetch()` calls to the backend (`auth.ts`, `board.ts`, `chat.ts`).

### Backend (`backend/`)

This is the FastAPI app. It does three jobs:
1. **Serves the frontend** — the built static files live in `backend/static/` (copied there by Docker at build time) and FastAPI serves them at `/`.
2. **Handles auth** — `/api/signup`, `/api/login`, `/api/logout`, `/api/session`.
3. **Handles data** — `/api/board` (read/write your Kanban board) and `/api/ai/chat` (talk to the AI).

Key files:
- `app/main.py` — every API route lives here.
- `app/auth.py` — manages sessions. When you log in, the server generates a random token, remembers "this token belongs to user #5", and gives you that token as a cookie. Every request after that, your browser sends the cookie back, and the server looks up which user it belongs to.
- `app/db.py` — all the SQLite reading/writing.
- `app/ai.py` — the OpenRouter integration.

## 5. How login actually works (sessions, not magic)

There's no "logged in" flag stored in the browser that the server trusts blindly. Instead:

1. You submit username + password to `/api/login`.
2. The backend looks up your username in the `users` table, and checks your password against the **hash** stored there (never the real password — `bcrypt.checkpw` compares your typed password against the one-way hash).
3. If it matches, the backend creates a random session token, stores `token → your user id` in memory, and sends the token back as an `httpOnly` cookie (JavaScript in the browser can't read it — only the browser automatically attaches it to requests, which is safer against certain attacks).
4. From then on, every request to `/api/board` etc. includes that cookie. The backend looks up the token, finds your user id, and knows whose board to fetch.

One deliberate simplification: sessions live in a Python dictionary in memory, not in the database. That means if the backend process restarts, everyone gets logged out (but your board data is safe — that's in SQLite, a separate concern from "who's currently logged in").

## 6. How the database is shaped

Two tables:

```
users
  id, username, password_hash, created_at

boards
  id, user_id, data (a JSON string), updated_at
```

The interesting decision: a board's columns and cards are **not** spread across multiple normalized SQL tables. The entire board (all columns, all cards) is stored as one JSON blob in the `data` column. Why? Because the frontend already thinks of the whole board as one JSON object (`{columns: [...], cards: {...}}`). Storing it as one blob means the backend can hand that JSON straight to the frontend with zero translation step. The tradeoff is you can't ask the database "find all cards with this title across every board" — but for a single-board-per-user MVP, nothing needs that.

## 7. How the AI chat actually edits your board

This is the most interesting part. Here's what happens when you type "Add a card called Buy milk to the Backlog":

1. The frontend sends your message, plus the conversation history so far, to `POST /api/ai/chat`.
2. The backend loads your **current board** from SQLite.
3. It builds a prompt for the AI that includes: your current board as JSON, then your message.
4. It asks Gemini for a response, but with a twist: it doesn't just ask for free text. It uses a feature called **Structured Outputs**, which forces the AI to respond in a strict, pre-defined JSON shape:
   ```json
   { "reply": "I've added the card.", "board_update": { "columns": [...], "cards": [...] } }
   ```
   If the AI decided no board change was needed, `board_update` is `null` instead.
5. If `board_update` isn't null, the backend saves it as your new board (just like a normal drag-and-drop save) and sends it back to the frontend.
6. The frontend sees `board_update` in the response and immediately re-renders the board with the new data — no page refresh.

One technical wrinkle worth knowing: AI structured-output schemas can't express "an object with arbitrary keys" (like our `cards: { "card-1": {...}, "card-2": {...} }` shape). So the AI is asked to return cards as a plain **list** instead, and the backend converts that list back into the dictionary shape the rest of the app expects, before saving it.

## 8. Testing philosophy

Three layers, each catching different kinds of bugs:

- **Backend unit tests (pytest)** — fast, test one API route at a time. Things like "does login reject a wrong password" or "does a new account get a default board."
- **Frontend unit tests (Vitest)** — test one component at a time, with the network mocked out (we don't want a real AI call every time we run a quick test).
- **End-to-end tests (Playwright)** — drive an actual Chromium browser against the actual running Docker container. These caught real bugs during development — for example, a test that signed up, added a card, logged out, and logged back in caught a genuine issue where the login form stayed stuck in "sign up" mode after logout.

Some tests make **real** calls to the AI provider (no mocking) specifically to prove the AI integration genuinely works, not just that our code looks plausible.

## 9. Running it yourself

```bash
# from the pm/ directory
scripts/start.sh     # Mac/Linux
scripts/start.ps1    # Windows (PowerShell)
```

This builds a Docker image (Node builds the frontend, then it's copied into a Python image) and runs it. Visit `http://localhost:8000`.

```bash
scripts/stop.sh      # or stop.ps1
```

Stops and removes the container. Your data is safe — `backend/data/pm.db` lives on your actual hard drive (Docker just mounts it into the container), so it survives stopping/restarting.

## 10. The story of how this was built (useful context)

The plan changed shape a few times along the way, on purpose — worth knowing if you're reading the code and wondering "why does this look different from the original plan":

1. Login started **hardcoded** (`user`/`password` only, no real accounts).
2. Then changed to **accept any non-empty credentials** (still fake, just removed the hardcoding).
3. Then changed again to **real accounts with hashed passwords** — because the actual goal ("log back in and see my own saved board") genuinely required real per-account identity, not just a UI gate.
4. The AI model also changed: the first free OpenRouter model tried was actively rate-limited by its provider at the time, discovered by testing directly against OpenRouter's API rather than guessing — so the model was swapped for one that worked reliably.

See `docs/PLAN.md` for the full part-by-part build log, including what was tested and how.
