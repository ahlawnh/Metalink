# D/SPATCH

## Backend (D/SPATCH API)

Setup, run commands, env vars, and WebSocket URL for the dispatcher dashboard are documented in [backend/README.md](backend/README.md).

## Repo layout

- **`frontend/`** — Dispatcher dashboard (React + Vite + TypeScript + Tailwind).
- **`backend/`** — FastAPI telemetry / WebSocket service.
- **`metalink_ios/`** (if present) — Native experiments; tactical hybrid demo uses browser/PWA flows per team plan.

## Frontend quick start

From repo root:

```bash
npm install --prefix frontend
npm run dev
```

Then open **`http://127.0.0.1:5173/`** (or the URL Vite prints).

## Smoke checks

- Backend health URL and WebSocket path: see **`backend/README.md`** and **`backend/docs/TELEMETRY_API.md`**.
- Frontend should show session/stream state when the telemetry bridge is running; with backend down it falls back to mock JSON loaded in the SPA.
