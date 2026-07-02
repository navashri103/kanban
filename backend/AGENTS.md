# Backend

## Stack

Python, FastAPI, served by uvicorn. Dependencies managed with `uv` (`pyproject.toml`, no manual venv needed — `uv sync` / `uv run` handle it). Run inside Docker via the root `Dockerfile` / `docker-compose.yml`. SQLite for storage (`sqlite3` from the standard library, no ORM).

## Structure

- `pyproject.toml` — project metadata and dependencies (`fastapi`, `uvicorn[standard]`, `bcrypt`, `httpx`; dev: `pytest`).
- `app/main.py` — FastAPI app. Routes:
  - `GET /api/health` — returns `{"status": "ok"}`.
  - `POST /api/signup` — creates a new account (`username` non-empty, `password` at least 8 characters — 422 otherwise). 409 if the username is taken (including the concurrent-signup race, caught via `sqlite3.IntegrityError` on the `UNIQUE` constraint). Hashes the password with `bcrypt`, creates the user's board (seeded from `app/seed.py`'s `INITIAL_BOARD`), and starts a session.
  - `POST /api/login` — verifies `username`/`password` against the stored hash. 401 if the username is unknown or the password is wrong. Starts a session on success.
  - `POST /api/logout` — invalidates the session and clears the cookie.
  - `GET /api/session` — returns `{"authenticated": bool}` for the current request's cookie.
  - `GET /api/board` — returns the signed-in user's board. 401 if not signed in.
  - `PUT /api/board` — replaces the signed-in user's board with the given JSON body. Validated against the `BoardData` shape via Pydantic plus board invariants (`BoardModel.check_card_references`): 1-8 columns, every `cardId` must exist in `cards`, every `cards` key must match its card's `id`, and no card may appear in more than one column — 422 on violation, so a buggy client or AI can never persist a board the frontend can't render. 401 if not signed in.
  - `GET /api/ai/ping` — sends "What is 2+2?" to the AI provider, returns `{"reply": "..."}`. A connectivity sanity check, not used by the UI. Requires a session (it triggers a quota-consuming upstream call, so it isn't left open to anonymous traffic).
  - `POST /api/ai/chat` — accepts `{message, history}` (history capped at 50 messages; roles restricted to `user`/`assistant` so clients can't inject `system` messages into the LLM conversation), loads the signed-in user's board, calls `chat_about_board`, validates `board_update` through `BoardModel` **before** persisting it, returns `{reply, board_update}`. 401 if not signed in. Falls back to a friendly canned reply (200, not 500) if the AI call raises `httpx.HTTPError` (covers both HTTP status errors and transport errors like timeouts) or the response is malformed (`KeyError`/`ValueError`, which includes Pydantic validation failures on the AI's board).
  - `/` (and all other paths) — mounted `StaticFiles` serving the built Next.js frontend from `backend/static/` (`html=True`, so `/` resolves to `static/index.html`). This directory is a build artifact: the root `Dockerfile` builds the frontend and copies `frontend/out/` here; it does not exist until that build step has run (gitignored).
- `app/auth.py` — session handling: in-memory `dict[str, tuple[int, float]]` mapping session tokens to `(user_id, expires_at)` (`secrets.token_urlsafe`, 7-day TTL — expired entries are rejected and dropped on lookup, and the cookie carries a matching `max_age`), `create_session`/`end_session`/`get_user_id` helpers, and a `require_session` FastAPI dependency (used by `GET`/`PUT /api/board`, `GET /api/ai/ping`, `POST /api/ai/chat`) that 401s if there's no valid session.
- `app/db.py` — SQLite access. `init_db()` creates the `users`/`boards` tables if missing (called from the FastAPI lifespan handler at startup, not at import time, so importing `app.main` has no side effects); `get_user_by_username`, `create_user`, `create_board`, `get_board`, `save_board` (an upsert — `INSERT ... ON CONFLICT(user_id) DO UPDATE` — so it can never silently update zero rows). Each call opens and closes its own connection — simple, no pooling, fine at this scale. DB file lives at `backend/data/pm.db` (gitignored; created automatically; mounted as a Docker volume so it survives container restarts — see `docker-compose.yml`).
- `app/seed.py` — `INITIAL_BOARD`, the default board content a new account starts with (mirrors `frontend/src/lib/kanban.ts`'s `initialData`).
- `app/ai.py`:
  - `ask_ai(message)` — simple one-off call to the Gemini API (used by `/api/ai/ping`).
  - `chat_about_board(message, history, board)` — builds a system prompt embedding the current board JSON, calls the Gemini OpenAI-compatible endpoint with `response_format: json_schema` (`CHAT_RESPONSE_SCHEMA`, `strict: true`) so the model must return `{reply, board_update}`. `board_update.cards` is an **array** of `{id, title, details}` in the schema, not a dict keyed by id — strict JSON Schema can't express arbitrary object keys. `_board_update_to_board_data` converts that array back into the dict-keyed shape the rest of the app (`BoardData`/`BoardModel`) expects.
  - `GEMINI_MODEL` env var, defaulting to `gemini-flash-latest`. See "AI notes" below.
- `tests/conftest.py` — `isolate_state` fixture (autouse): points `db.DB_PATH` at a fresh temp file and clears `auth._sessions` before every test, so tests never share data or sessions with each other or with your real local database.
- `tests/test_main.py` — health route and that `/` serves the built frontend (requires `backend/static/` to be populated first — see "Running" below).
- `tests/test_auth.py` — signup creates an account + session; duplicate username → 409; login with correct/wrong/unknown credentials; session reflects state; logout clears it.
- `tests/test_board.py` — board requires a session; a new account gets the seeded board; `PUT` persists and is reflected in a later `GET`; two users have independent boards; data is readable by a brand-new client/session (proving it's read from SQLite, not cached in memory).
- `tests/test_ai.py` — calls `/api/ai/ping` for real and checks the reply contains "4". Skipped automatically (`pytest.mark.skipif`) if `GEMINI_API_KEY` isn't set in the environment, so it won't fail in a context without credentials.
- `tests/test_ai_chat.py` — `_board_update_to_board_data` conversion (pure function); `/api/ai/chat` requires a session; a mocked `board_update` persists and is reflected in `GET /api/board`; a mocked `None` `board_update` leaves the board untouched; a mocked upstream failure falls back gracefully without touching the board; one real, unmocked call (skipped without an API key) asks the AI to add a specific card and asserts it exists afterward.

## AI notes

- Provider: **Google Gemini** via its OpenAI-compatible endpoint
  (`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`), key in `GEMINI_API_KEY`
  (`.env`). The app previously used OpenRouter's free model pool, which was abandoned after repeated
  production failures (2026-07-02): intermittent upstream 429 bursts, the configured model losing
  structured-output support, providers behind the same model silently dropping `response_format` and
  returning malformed JSON, and a hard ~50 requests/day account cap on free-tier keys. Gemini's free
  tier is a single reliable provider with much higher daily limits, and was verified by direct API
  probe to honor the app's exact strict `json_schema` (including the nullable `anyOf` board_update
  and nested arrays).
- Model: `GEMINI_MODEL` env var, defaulting to `gemini-2.5-flash` — pinned deliberately, not the
  `gemini-flash-latest` alias. The app makes the model echo the full board back in `board_update`,
  and the newer Flash models behind the alias consistently block that with the RECITATION content
  filter, returning an empty message (probed 2026-07-02: `gemini-flash-latest` and
  `gemini-3.1-flash-lite` blocked 3/3; `gemini-2.5-flash` succeeded 3/3; `gemini-2.0-flash` has no
  free-tier quota). If chat ever starts returning only the canned fallback, re-probe recitation
  behavior before blaming the network.
- All calls go through `_chat_completion`, which retries up to 3 attempts (1s/2s backoff) on
  429/500/502/503 and on empty (content-filtered) responses — free-tier per-minute quota 429s
  usually clear quickly. `chat_about_board` additionally re-asks once if the model emits malformed
  JSON (transient model failure).
- `ask_ai` lets `httpx`'s `raise_for_status()` bubble up on final failure. `chat_about_board` is used
  in a real user-facing feature, so its caller (`POST /api/ai/chat`) catches failures and returns a
  friendly fallback reply instead of a 500 — free tiers really do get rate-limited in practice (seen
  firsthand while building this), so this isn't theoretical defensive programming.
- Conversation history is **not stored server-side** — the frontend sends the full history with each request, and the backend treats it as stateless context for that one call. Simplest option for an MVP; if the page reloads, history resets (only the board itself persists, via SQLite).

## Auth notes

- Real authentication: passwords are hashed with `bcrypt` before storage, never stored or logged in plain text. There's no "fake login" anymore — Part 4's original demo login (any non-empty credentials accepted) was replaced once persistence per-account became the actual goal.
- An account must be created via `/api/signup` before `/api/login` will work for that username — there's no signup screen in the UI yet (frontend wiring is a later step), so for now accounts are created by calling the API directly (tests do this via `TestClient`/`page.request`).
- Sessions are still a process-wide in-memory dict (token → `user_id`), not the database — lost on backend restart, won't scale past one process. Acceptable for the MVP; the board data itself (the part that actually needs to survive restarts) is in SQLite, not memory.
- The login/session/logout flow is same-origin by design (frontend is served by this same FastAPI app at `/`), so no CORS configuration was added. Running the frontend standalone via `next dev` on a different port will not be able to log in against this backend without separate CORS/proxy setup — test the full app via Docker (`scripts/start.sh`) instead.

## Running

- Via Docker (recommended, matches production): `../scripts/start.sh` (Mac/Linux) or `../scripts/start.ps1` (Windows) from repo root — builds the image with `uv sync` and runs uvicorn on port 8000. Stop with the matching `stop` script. The SQLite file persists at `../backend/data/pm.db` on the host across `stop`/`start`.
- Locally for fast iteration: `uv sync` then `uv run uvicorn app.main:app --reload` from `backend/`.
- Tests: `uv run pytest` from `backend/` (each test gets an isolated temp database — see `tests/conftest.py`).

## Conventions

- Keep route handlers thin; group related routes into separate modules under `app/` if `main.py` gets crowded rather than letting it become a monolith.
