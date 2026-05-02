# Aegis-Link backend

Python **FastAPI** service: LiveKit ingestion, vision + transcription (Hacker 2), WebSocket telemetry (Hacker 4).

## Prerequisites

- Python **3.11+** recommended
- Run all commands from this directory (`backend/`) so `app` imports resolve

## One-time setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Environment

Copy the template and edit locally (never commit secrets):

```bash
cp .env.example .env
```

Variables that matter for **fake data / Hacker 3 UI work**:

| Variable | Purpose |
|----------|---------|
| `MOCK_AI` | `true` — no OpenAI/LiveKit/Deepgram required; mock vision + transcript loops run |
| `ENABLE_INGESTION_LOOP` | `true` — starts ingestion on server startup (required for continuous mock broadcasts) |
| `MOCK_TELEMETRY_SCENARIO` | Initial WS scenario: `overdose_case`, `normal_case`, `scene_hazard_case`, `degraded_pipeline_case` |
| `CORS_ORIGINS` | Comma-separated origins for the Next.js app (e.g. `http://localhost:3000`) |

For **live** mode later: set `MOCK_AI=false` and fill `LIVEKIT_*`, `OPENAI_API_KEY`, `DEEPGRAM_API_KEY` per `.env.example`.

## Run the server

```bash
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- HTTP base: `http://127.0.0.1:8000`
- OpenAPI docs: `http://127.0.0.1:8000/docs`

## Quick health checks

```bash
curl -s http://127.0.0.1:8000/api/health
curl -s http://127.0.0.1:8000/api/telemetry/status
```

## WebSocket (telemetry / fake data for frontend)

Hacker 3 connects here:

```text
ws://127.0.0.1:8000/api/ws/telemetry
```

Optional query: `?scenario=overdose_case` (see `/api/telemetry/scenarios`).

Every WebSocket message uses the v2 envelope:

```json
{
  "schema_version": "v2",
  "event_type": "telemetry.update",
  "timestamp": "2026-05-02T12:00:00.000000Z",
  "payload": {}
}
```

On connect, the server sends `pipeline.status`, `heartbeat`, then an initial `telemetry.update` snapshot. With `MOCK_AI=true` and `ENABLE_INGESTION_LOOP=true`, the ingestion task also **broadcasts** updates from the mock pipeline (vision + transcript aggregation).

**CLI test** (if [websocat](https://github.com/vi/websocat) is installed):

```bash
websocat ws://127.0.0.1:8000/api/ws/telemetry
```

Full frontend contract: `docs/TELEMETRY_API.md`. Sample payloads: `fixtures/websocket_event_samples.json`.

## Tests

```bash
python3 -m pytest tests/ -v
python3 -m compileall app -q
```

Optional 5-minute WebSocket soak:

```bash
STABILITY_TEST=1 python3 -m pytest tests/test_smoke.py::test_websocket_five_minute_stability -v
```

## Project layout (hackathon silos)

- **`app/services/`** — Hacker 2: `livekit_ingest`, `vision`, `transcription`, `telemetry_aggregate`
- **`app/api/`**, **`app/core/`**, **`app/schemas/`**, **`broadcast.py`** — Hacker 4: HTTP/WebSocket, config, Pydantic contracts

## Troubleshooting

- **No streaming updates:** ensure `ENABLE_INGESTION_LOOP=true` and check server logs for `Ingestion loop failed` (retries every 3s).
- **Import errors:** always run `uvicorn` from the `backend/` directory.
- **`.env` not ignored:** confirm `backend/.env` is listed in `backend/.gitignore` and never `git add -f` it.
