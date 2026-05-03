#!/usr/bin/env bash
# From repo root: backend/run_dev.sh — vision-debug branch + uvicorn on :8000
set -euo pipefail
cd "$(dirname "$0")"
if [[ "$(git -C .. branch --show-current 2>/dev/null)" != "fix/livekit-vision-loop-debug" ]]; then
  echo "WARN: expected branch fix/livekit-vision-loop-debug (current: $(git -C .. branch --show-current 2>/dev/null || echo unknown))" >&2
fi
source .venv/bin/activate
exec uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
