# Aegis-Link backend: telemetry API (Hacker 4 contract)

This document is the integration surface for **Hacker 3 (frontend)** and **Alex / Hacker 2 (`app/services`)**.

## Base URL

- Local default: `http://127.0.0.1:8000`
- HTTP routes are mounted under **`/api`**.

## HTTP endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Liveness probe |
| GET | `/api/telemetry/status` | Pipeline mode, `mock_ai`, connected WebSocket count |
| GET | `/api/telemetry/scenarios` | Mock scenario names for the WebSocket `scenario` query param |

## WebSocket

- **URL:** `ws://<host>:<port>/api/ws/telemetry`
- **Optional query:** `?scenario=overdose_case` (or `normal_case`, `scene_hazard_case`, `degraded_pipeline_case`). Falls back to `MOCK_TELEMETRY_SCENARIO` from env.

### Connection sequence

After connect, the client typically receives:

1. `event_type: "pipeline.status"`
2. `event_type: "heartbeat"`
3. `event_type: "telemetry.update"` (initial mock snapshot for the chosen scenario)

While connected, the server sends **`heartbeat`** on idle timeout (`HEARTBEAT_INTERVAL_SECONDS`).  
Alex’s ingestion loop publishes **`telemetry.update`** (and optional **`alert.critical`**) to **all** connected clients.

### Envelope (every WebSocket message)

All frames are JSON objects:

```json
{
  "schema_version": "v2",
  "event_type": "telemetry.update",
  "timestamp": "2026-05-02T12:00:00.000000Z",
  "payload": { }
}
```

- **`schema_version`:** Always **`v2`** for this contract revision.
- **`event_type`:** One of:
  - `telemetry.update` — `payload` is a **TelemetryUpdate**
  - `alert.critical` — `payload` is a **CriticalAlert** (may duplicate alerts also listed inside `telemetry.update.critical_alerts`)
  - `pipeline.status` — `payload` is **PipelineStatusUpdate**
  - `heartbeat` — `payload` is **Heartbeat**

### TelemetryUpdate (payload for `telemetry.update`)

| Field | Type | Notes |
|-------|------|--------|
| `timestamp` | ISO 8601 datetime | |
| `scene_hazards` | `[{ "item", "confidence" }]` | |
| `substances` | same | |
| `patient_position` | enum string | `supine`, `prone`, `slumped`, `side_recovery`, `unknown` |
| `cyanosis_flag` | `{ "detected", "confidence" }` | |
| `resp_rate_estimate` | `{ "value"?, "method", "confidence" }` | |
| `consciousness_level` | enum | `responsive`, `unresponsive`, `unknown` |
| `transcript_snippet` | string | Truncated rolling transcript |
| `pipeline_status` | enum | `mock`, `degraded`, `live` |
| `critical_alerts` | array of CriticalAlert | |
| `bystander_stress` | optional object | `{ "score", "label"?, "confidence" }` |
| `heart_rate_rppg` | optional object | Experimental RPPG hint |
| `agonal_breathing` | optional object | `{ "suspected", "confidence" }` |
| `haptic_cue` | optional object | `{ "active", "pattern", "bpm"? }` — **PWA (Hacker 1)** consumes |

**Rule:** Do not add new top-level `TelemetryUpdate` keys without updating [`app/schemas/telemetry.py`](../app/schemas/telemetry.py).

## Backpressure (server)

High-frequency telemetry from services is **debounced** before broadcast. Only the **latest** `TelemetryUpdate` in each window is sent (`TELEMETRY_COALESCE_MS`, default `100`). Heartbeats and per-connection handshake messages are unaffected.

## Environment variables (vault)

| Variable | Used by | Notes |
|----------|---------|--------|
| `MOCK_AI` | Backend + services | `true`: no paid API calls; mock vision/transcript paths |
| `ENABLE_INGESTION_LOOP` | `app/main.py` | Start LiveKit/mock ingestion task |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_ROOM`, `LIVEKIT_IDENTITY` | `app/services/livekit_ingest.py` | Live room join |
| `OPENAI_API_KEY` | `app/services/vision.py` | When `MOCK_AI=false` |
| `DEEPGRAM_API_KEY` | `app/services/transcription.py` | When `MOCK_AI=false` |
| `CORS_ORIGINS` | `app/main.py` | Comma-separated browser origins |
| `TELEMETRY_COALESCE_MS` | `app/core/outbound_coalesce.py` | Debounce window for telemetry broadcasts |
| `HEARTBEAT_INTERVAL_SECONDS` | `app/api/telemetry.py` | WS keepalive interval |

Never commit `.env`. Use `.env.example` as a template.

## Hacker 2 (Alex) — service → bridge contract

1. Build or update in-memory state in `app/services` (e.g. `TelemetryState`).
2. Call `publish_telemetry(state)` in `telemetry_aggregate.py`, which calls **`broadcast_telemetry`** in [`app/services/broadcast.py`](../app/services/broadcast.py).
3. **`broadcast_telemetry`** accepts either:
   - A **`dict`** shaped like `build_telemetry_payload()` (hazards, vitals, transcription_buffer, ai_dispatcher_alert, optional V3 keys), or
   - A **`TelemetryUpdate`** instance.

**Respiratory rate:** `vitals.estimated_respiratory_rate` is derived in **`telemetry_aggregate`** from final transcript chunks containing the word **“breathe”** (rolling window), not from a single vision frame. Vision contributes **`chest_rise_detected`** and hazards only.

**Bystander stress:** When the rolling transcript matches panic heuristics, `build_telemetry_payload()` may set **`bystander_stress`** (`critical_panic` or `elevated_distress`) for the broadcaster.

### Optional `dict` keys (mapped in `broadcast.py`)

- `bystander_stress`: `{ "score", "label"?, "confidence"? }`
- `heart_rate_rppg`: `{ "value"?, "confidence"?, "disclaimer"? }`
- `agonal_breathing`: `{ "suspected", "confidence" }`  
  Or legacy: `agonal_breathing_suspected` (bool) + `agonal_breathing_confidence` (float)
- `haptic_cue`: `{ "active", "pattern": "none"|"cpr_metronome", "bpm"? }`

## Sample JSON

See [`fixtures/websocket_event_samples.json`](../fixtures/websocket_event_samples.json).

## Automated tests

From the `backend` directory:

```bash
python3 -m pytest tests/ -v
```

For a **5+ minute** WebSocket soak test (optional):

```bash
STABILITY_TEST=1 python3 -m pytest tests/test_smoke.py::test_websocket_five_minute_stability -v
```
