# Backend

## Stack

Python, FastAPI, served by uvicorn. Dependencies managed with `uv` (`pyproject.toml`, no manual venv needed — `uv sync` / `uv run` handle it). Run inside Docker via the root `Dockerfile` / `docker-compose.yml`. SQLite for storage (`sqlite3` from the standard library, no ORM).

## Structure

- `pyproject.toml` — project metadata and dependencies (`fastapi`, `uvicorn[standard]`, `bcrypt`, `httpx`; dev: `pytest`).
- `app/main.py` — FastAPI app. Routes:
  - `GET /api/health` — returns `{"status": "ok"}`.
  - `POST /api/signup` — creates a new account (`username`/`password`, both required non-empty). 409 if the username is taken. Hashes the password with `bcrypt`, creates the user's board (seeded from `app/seed.py`'s `INITIAL_BOARD`), and starts a session.
  - `POST /api/login` — verifies `username`/`password` against the stored hash. 401 if the username is unknown or the password is wrong. Starts a session on success.
  - `POST /api/logout` — invalidates the session and clears the cookie.
  - `GET /api/session` — returns `{"authenticated": bool}` for the current request's cookie.
  - `GET /api/board` — returns the signed-in user's board. 401 if not signed in.
  - `PUT /api/board` — replaces the signed-in user's board with the given JSON body (validated against the `BoardData` shape via Pydantic). 401 if not signed in.
  - `GET /api/ai/ping` — sends "What is 2+2?" to OpenRouter, returns `{"reply": "..."}`. A connectivity sanity check, not used by the UI.
  - `POST /api/ai/chat` — accepts `{message, history}`, loads the signed-in user's board, calls `chat_about_board`, persists `board_update` if present, returns `{reply, board_update}`. 401 if not signed in. Falls back to a friendly canned reply (200, not 500) if the AI call raises `httpx.HTTPStatusError`/`KeyError`/`ValueError`.
  - `/` (and all other paths) — mounted `StaticFiles` serving the built Next.js frontend from `backend/static/` (`html=True`, so `/` resolves to `static/index.html`). This directory is a build artifact: the root `Dockerfile` builds the frontend and copies `frontend/out/` here; it does not exist until that build step has run (gitignored).
- `app/auth.py` — session handling: in-memory `dict[str, int]` mapping session tokens to `user_id` (`secrets.token_urlsafe`), `create_session`/`end_session`/`get_user_id` helpers, and a `require_session` FastAPI dependency (used by `GET`/`PUT /api/board`, `POST /api/ai/chat`) that 401s if there's no valid session.
- `app/db.py` — SQLite access. `init_db()` creates the `users`/`boards` tables if missing (called once at app startup); `get_user_by_username`, `create_user`, `create_board`, `get_board`, `save_board`. Each call opens and closes its own connection — simple, no pooling, fine at this scale. DB file lives at `backend/data/pm.db` (gitignored; created automatically; mounted as a Docker volume so it survives container restarts — see `docker-compose.yml`).
- `app/seed.py` — `INITIAL_BOARD`, the default board content a new account starts with (mirrors `frontend/src/lib/kanban.ts`'s `initialData`).
- `app/ai.py`:
  - `ask_ai(message)` — simple one-off call to OpenRouter (used by `/api/ai/ping`).
  - `chat_about_board(message, history, board)` — builds a system prompt embedding the current board JSON, calls OpenRouter with `response_format: json_schema` (`CHAT_RESPONSE_SCHEMA`, `strict: true`) so the model must return `{reply, board_update}`. `board_update.cards` is an **array** of `{id, title, details}` in the schema, not a dict keyed by id — strict JSON Schema can't express arbitrary object keys. `_board_update_to_board_data` converts that array back into the dict-keyed shape the rest of the app (`BoardData`/`BoardModel`) expects.
  - `OPENROUTER_MODEL` env var, defaulting to `google/gemma-4-31b-it:free`.
- `tests/conftest.py` — `isolate_state` fixture (autouse): points `db.DB_PATH` at a fresh temp file and clears `auth._sessions` before every test, so tests never share data or sessions with each other or with your real local database.
- `tests/test_main.py` — health route and that `/` serves the built frontend (requires `backend/static/` to be populated first — see "Running" below).
- `tests/test_auth.py` — signup creates an account + session; duplicate username → 409; login with correct/wrong/unknown credentials; session reflects state; logout clears it.
- `tests/test_board.py` — board requires a session; a new account gets the seeded board; `PUT` persists and is reflected in a later `GET`; two users have independent boards; data is readable by a brand-new client/session (proving it's read from SQLite, not cached in memory).
- `tests/test_ai.py` — calls `/api/ai/ping` for real and checks the reply contains "4". Skipped automatically (`pytest.mark.skipif`) if `OPENROUTER_API_KEY` isn't set in the environment, so it won't fail in a context without credentials.
- `tests/test_ai_chat.py` — `_board_update_to_board_data` conversion (pure function); `/api/ai/chat` requires a session; a mocked `board_update` persists and is reflected in `GET /api/board`; a mocked `None` `board_update` leaves the board untouched; a mocked upstream failure falls back gracefully without touching the board; one real, unmocked call (skipped without an API key) asks the AI to add a specific card and asserts it exists afterward.

## AI notes

- Model choice: started with `meta-llama/llama-3.3-70b-instruct:free`, but it was actively rate-limited upstream when tested (confirmed via direct `curl` to OpenRouter, error said "temporarily rate-limited upstream... retry shortly"). Queried OpenRouter's live `GET /api/v1/models` to see what free models actually exist right now (free model availability changes over time — don't trust a hardcoded list from memory), and tried a few; settled on `google/gemma-4-31b-it:free`, which returned a clean "4" with `"cost":0`, and was also confirmed (via direct curl) to honor `response_format: json_schema` with `strict: true`, including nullable/`anyOf` fields and nested arrays.
- Override the model without code changes via the `OPENROUTER_MODEL` env var (add to `.env` if you want something else; `os.environ.get` defaults to `google/gemma-4-31b-it:free` if unset).
- `ask_ai` lets `httpx`'s `raise_for_status()` bubble up as an unhandled exception (→ 500) on failure — no retry/fallback logic. Acceptable for the `/api/ai/ping` connectivity check. `chat_about_board` is used in a real user-facing feature though, so its caller (`POST /api/ai/chat`) catches failures and returns a friendly fallback reply instead of a 500 — free models really do get rate-limited in practice (seen firsthand while building this), so this isn't theoretical defensive programming.
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
