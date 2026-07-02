# Code Review — Kanban Studio (`pm/`)

Reviewed: backend (`app/main.py`, `app/auth.py`, `app/db.py`, `app/ai.py`, `app/seed.py`) and
frontend (`src/lib/*`, `src/components/*`). Scope: full codebase (single initial commit, no diff to review).

Overall: a clean, well-documented MVP. Route handlers are thin, the pure-logic/fetch-layer split on the
frontend is real (not just claimed in the docs), AI output is validated before it can touch the DB, the
signup username race is handled via `IntegrityError`, and tests get isolated temp DBs. The findings below
are ordered by severity; nothing here is a "drop everything" fire.

---

## Medium

### 1. Network failure during login/signup permanently disables the form
`frontend/src/lib/auth.ts:14-38` — `login()` and `signup()` do not wrap `fetch` in try/catch, unlike
every other function in the lib layer (`fetchSession`, `fetchBoard`, `saveBoard` all do). A network
error rejects the promise, which propagates out of `LoginForm.handleSubmit`
(`LoginForm.tsx:19-36`), so `setIsSubmitting(false)` on line 26 never runs.

**Failure scenario:** backend briefly unreachable (or Docker not started yet), user clicks "Sign in"
→ unhandled rejection, button stuck at "Signing in..." disabled forever; only a page refresh recovers.

**Fix:** catch in `login`/`signup` and return `false` (matching the rest of the file), or use
`try/finally` around the submit handler.

### 2. AI chat can silently revert manual edits made while it is "Thinking..."
`backend/app/main.py:171-200` — `ai_chat` reads the board, spends seconds on the Gemini round trip
(up to 3 retry attempts with backoff, `ai.py:95-127`), then persists the AI's full board built from
that stale snapshot. Meanwhile the UI stays fully interactive during the request.

**Failure scenario:** user sends "add a card to Done", then drags a card between columns while the
sidebar shows "Thinking...". The drag's `PUT /api/board` lands first; the AI reply then saves a board
based on the pre-drag state, and `ChatSidebar`'s `onBoardUpdate` (`KanbanBoard.tsx:303`) overwrites
local state too. The drag is undone in both DB and UI with no error shown.

**Fix options:** cheapest — disable board interaction (or just skip persisting) while a chat request
is in flight; more robust — version the board (e.g. an integer bumped on each save) and have the AI
save reject/merge if the version moved.

### 3. Column rename fires one full-board PUT per keystroke, with out-of-order risk
`frontend/src/components/KanbanColumn.tsx:42-47` — the title `<input>` calls `onRename` on every
`onChange`, and `updateBoard` (`KanbanBoard.tsx:62-72`) persists immediately. Typing a 10-character
title issues ~10 concurrent PUTs of the entire board. Server-side, last write wins by *arrival* order,
not send order, so a slow early request can overwrite a faster later one and persist a truncated title
(the UI won't show it until reload, making it a confusing "my rename didn't stick" bug).

**Fix:** debounce the persist (state update can stay per-keystroke), or persist on blur. A simple
in-flight-request counter that only lets the latest snapshot win would also close the reordering hole
for all edit types.

---

## Low

### 4. Session store grows without bound for abandoned tokens
`backend/app/auth.py:9-11` — the comment says expired entries are "dropped on lookup, so the dict
can't grow unboundedly", but entries are only dropped when *that specific token* is presented again.
Tokens from users who clear cookies or never return are never looked up and live forever. Slow leak;
in practice bounded by restarts, but the comment is wrong and a periodic sweep (or sweep-on-create)
is a three-line fix.

### 5. Signup is not atomic: a user can exist without a board
`backend/app/main.py:56-67` with `db.py` — `create_user` and `create_board` run on separate
connections/transactions. A crash or error between them leaves an account whose `GET /api/board`
404s forever; the frontend shows "Couldn't load your board. Try refreshing" (`KanbanBoard.tsx:168-176`)
with no recovery path. Either do both inserts in one transaction, or make `get_board` lazily create
the initial board on 404.

### 6. Any signup failure is reported as "username already taken"
`frontend/src/components/LoginForm.tsx:30-35` — the error message is chosen by `mode`, not by what
actually failed. A 422, 500, or network error during signup all render "That username is already
taken." Distinguish at least "taken" (409) from "something went wrong."

### 7. ChatSidebar treats session expiry as an AI outage
`frontend/src/lib/chat.ts:23-26` returns `null` for any non-OK response, so a 401 (backend restarted,
sessions wiped) shows "Something went wrong reaching the AI. Please try again" — which will never
work. `board.ts` already distinguishes `unauthorized` and triggers logout; `chat.ts` should do the same.

### 8. Board validator allows orphan cards to accumulate
`backend/app/main.py:116-131` — `check_card_references` verifies every `cardId` points to a real card
and no card sits in two columns, but not the converse: entries in `cards` referenced by no column are
accepted and persisted. The AI path is the realistic source (it re-emits the full board; dropping an
id from `columns` while keeping the card creates an invisible, permanent orphan in the JSON blob).
Either reject orphans in the validator or prune them before save.

### 9. `ai_ping` can return a raw 500
`backend/app/main.py:150-153` — unlike `ai_chat`, this route has no error handling. Missing
`GEMINI_API_KEY` raises `KeyError` (`ai.py:102`), upstream failures raise `httpx` errors; both surface
as 500s. Acceptable for a diagnostic route, but a caught error with a clear "AI not configured"
message would make it a better diagnostic.

---

## Notes / nits (fine for an MVP, listed for awareness)

- **Username enumeration:** `login` (`main.py:71-79`) skips bcrypt entirely for unknown usernames — a
  measurable timing difference — and signup's 409 confirms existence outright. If enumeration ever
  matters, hash a dummy password on the unknown-user path and blur the signup message. For this app,
  probably by design; noting it so it's a decision, not an accident.
- **Cookie flags:** the session cookie (`auth.py:17-23`) has `httponly` and `samesite=lax` but no
  `secure` flag — correct for localhost, must be added before any HTTPS deployment.
- **No payload size limits:** columns are capped at 8, but cards per column and title/details lengths
  are unbounded (`main.py:98-114`). A client can PUT a multi-megabyte board that then rides along in
  every AI prompt (`ai.py:146`), burning tokens. Field `max_length`s would cap this cheaply.
- **`db.create_user` typing:** returns `cursor.lastrowid` (`db.py:62`), which is `int | None` per the
  sqlite3 stubs, declared as `int`. Harmless at runtime (INSERT always sets it), but a type checker
  will eventually complain.
- **`createId` collisions** (`kanban.ts:164-168`): `Math.random` six base36 chars + millisecond
  timestamp. Collision requires two ids in the same millisecond with the same random draw —
  effectively impossible for one user on one board. Fine; use `crypto.randomUUID()` if it ever nags.

## What's genuinely good

- AI board updates are Pydantic-validated *before* persisting, with the correct observation that
  `ValidationError` subclasses `ValueError` (`main.py:185-195`). Many codebases get this wrong.
- The canned fallback reply on AI failure (rather than a 500) matches the documented, observed
  free-tier failure mode instead of a theoretical one.
- Signup race handled properly via `sqlite3.IntegrityError` rather than check-then-insert alone.
- Frontend `lib/` vs `components/` separation is disciplined; `kanban.ts` really is pure and
  unit-testable, and the fetch wrappers really are the only `fetch` call sites.
- The save-failure toast's promise ("retried with your next edit") is actually true, because every
  save sends the full board snapshot.
