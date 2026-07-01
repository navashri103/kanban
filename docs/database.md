# Database approach

SQLite, file-based, created automatically on backend startup if it doesn't exist (Part 6). Schema is also saved as JSON at `docs/db-schema.json`.

## Auth model (revised)

The original plan had a fake/demo login (any username/password accepted, no real accounts). That's being replaced with real authentication:
- **Sign up** — pick a username and password; the username must be unique; the password is hashed before storage (never stored in plain text).
- **Sign in** — username + password are checked against the stored hash; wrong password or unknown username is rejected.
- Logging in again with the same username/password returns the same account and the same board — which is the actual goal here (persistent, per-user data).

Password hashing will use the `bcrypt` library (added as a backend dependency in Part 6) — a standard, well-vetted algorithm for this; never roll your own password hashing.

## Tables

**`users`** — one row per registered account.
- `id` — primary key
- `username` — unique
- `password_hash` — bcrypt hash of the password (not the password itself)
- `created_at` — when the account was created

**`boards`** — exactly one row per user (MVP limitation: one board per user).
- `id` — primary key
- `user_id` — unique, foreign key to `users.id` (unique enforces "one board per user")
- `data` — the entire board as a JSON string: `{ "columns": [...], "cards": {...} }`
- `updated_at` — last write time

## Why a JSON blob instead of normalized `columns`/`cards` tables

The frontend already treats the whole board as one JSON object (see `BoardData` in `frontend/src/lib/kanban.ts`). Storing it as one JSON blob means:
- The backend can read/write the exact same shape the frontend already uses — no translation layer between SQL rows and the `BoardData` the UI expects.
- Part 6's API can be as simple as "fetch the blob" / "replace the blob," which matches the MVP's actual needs (no querying individual cards via SQL, no reporting across boards).

Trade-off: you can't filter/query individual cards or columns at the SQL level. Not needed for this MVP (single board, single user-controlled list of cards) — this would be revisited if the app grew multi-board, multi-user querying needs (e.g. "find all cards assigned to X across boards").

## Creation strategy

On backend startup (Part 6), run `CREATE TABLE IF NOT EXISTS` for both tables — idempotent, so the database file and schema are created fresh if missing, and left alone if already present. A new user's board is seeded from `frontend/src/lib/kanban.ts`'s `initialData` at signup time (not at startup, since accounts don't exist until someone signs up).

## Session-to-user link (implementation note for Part 6)

Sessions will map a session token to a `user_id` (instead of Part 4's "just a yes/no flag"), so `GET /api/board` and the board-update routes know *which* user's board to read or write.
