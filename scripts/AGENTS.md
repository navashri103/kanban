# Scripts

Start/stop scripts for the Dockerized app, run from the repo root context (each script `cd`s to the project root itself).

- `start.sh` / `stop.sh` — Mac and Linux (bash). `docker compose up --build -d` / `docker compose down`.
- `start.ps1` / `stop.ps1` — Windows (PowerShell). Same behavior via `docker compose`.

After `start`, the app is available at `http://localhost:8000`.
