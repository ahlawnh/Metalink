# D/SPATCH Frontend

Dispatcher dashboard for live emergency telemetry.

## Run
- `npm install`
- `npm run dev -- --host 127.0.0.1 --port 4173`

Open: `http://127.0.0.1:4173/`

## Environment
- Optional: `VITE_TELEMETRY_WS_URL`
  - Default: `ws://127.0.0.1:8000/ws/telemetry`

## Telemetry Contract
The dashboard expects:
- `session`: incident metadata (`id`, `incident_type`, `caller_label`, `started_at`)
- `respiratory`: rate, status, confidence, and source
- `hazards`: detected scene hazards + severity/confidence
- `transcript`: incremental speech chunks
- `video`: stream state metadata

## Verification
- With backend running, stream status should become `connected`.
- Respiratory panel should update every ~2 seconds and pulse red during critical payloads.
- Hazard list should display hazard types with confidence percentages.
- If backend stops, stream status should switch to `fallback` and recover automatically after backend restarts.
