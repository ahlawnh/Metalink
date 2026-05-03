# D/SPATCH backend

Python **FastAPI** service: LiveKit ingestion, vision + transcription (Hacker 2), WebSocket telemetry (Hacker 4).

## What this backend does (big picture)

1. **Ingestion (Hacker 2)** — A hidden backend participant can join a **LiveKit** room, read the bystander’s **video** and **audio**, sample frames every ~2.5s, and run **OpenAI** vision + **Deepgram** transcription (`app/services/`).
2. **Merge** — `telemetry_aggregate.py` combines the latest vision output + rolling transcript (e.g. “breathe” cadence, keyword hints).
3. **Plumbing (Hacker 4)** — `broadcast.py` turns that into **Pydantic** `TelemetryUpdate` objects and pushes **v2 WebSocket events** to the dispatcher dashboard (`/api/ws/telemetry`).
4. **Mock mode** — With `MOCK_AI=true`, no cloud AI runs; fake loops still drive the same WebSocket shape so the frontend can build the UI cheaply.

**This README** covers running the **API server**. The **mic test** below only checks **Deepgram + your laptop mic**, not the full server.

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

### Troubleshooting: OpenAI usage, vision, vitals

- **No OpenAI usage on the dashboard** while “using the camera”: the **browser / phone** does not call OpenAI. Only the **FastAPI ingest** worker does, using `OPENAI_API_KEY` in the same environment **uvicorn** was started from. Confirm `MOCK_AI=false` in `backend/.env` and restart the server so live vision runs (watch startup logs for the live ingest path).
- **`MOCK_AI=true`**: mock vision and transcript loops — **no** OpenAI billable calls.
- **Vitals on the dispatcher UI**: the vision model is not meant to invent a numeric respiratory rate from a single frame; RR and related fields are merged from transcript and other paths in `app/services/telemetry_aggregate.py`. Heart rate may come from **rPPG / incident feed** when that pipeline is active.
- **“Pipeline Degraded”**: emitted when ingest is unhealthy (e.g. loop errors before retry). On the operator dashboard this appears under **System status**, separate from **scene hazards**.

## Run the server

```bash
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- HTTP base: `http://127.0.0.1:8000`
- OpenAPI docs: `http://127.0.0.1:8000/docs`

### Incident-feed (bystander) + telemetry

- **Operator dashboard** token (subscriber): `GET /api/livekit/token`
- **Bystander / incident_feed** token (publish camera + mic): `GET /api/livekit/broadcaster/token`
- **Incident telemetry** (location + vitals batches): `POST /api/incident/telemetry`

Configure **`BACKEND_INTERNAL_URL=http://127.0.0.1:8000`** in `incident_feed/.env.local` so Next.js API routes can proxy to FastAPI. Requires **`livekit-api`** plus **`LIVEKIT_URL`**, **`LIVEKIT_API_KEY`**, **`LIVEKIT_API_SECRET`**, **`LIVEKIT_ROOM`** for real LiveKit joins.

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

## Stage 3: Mic → Deepgram stress test (local, no server)

Proves **Deepgram** hears you and a tiny **stress heuristic** fires on panic phrases. Uses the same `deepgram_stream_from_pcm16` helper as the LiveKit audio path.

**Requirements:** `DEEPGRAM_API_KEY` in `.env`, **`MOCK_AI=false`** (otherwise the transcription module uses mock text and never calls Deepgram). Uses **deepgram-sdk v6** (`listen.v1` WebSocket API). Optional: `pip install sounddevice numpy` (listed in `requirements.txt`).

```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt
export MOCK_AI=false
python -m scripts.mic_deepgram_stress_test
```

You should see `[interim]` / `[FINAL]` lines, a growing `[buffer]`, and **`STRESS_LEVEL: CRITICAL`** after phrases like *“he’s not breathing”* or *“oh my god … help me”* (see `scripts/mic_deepgram_stress_test.py` for exact triggers). **Ctrl+C** to stop.

Deepgram usage may bill your project; this is not guaranteed “$0” unless your account has free credit.

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
