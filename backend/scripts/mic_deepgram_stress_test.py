#!/usr/bin/env python3
"""
Stage 3 (local): Laptop microphone → Deepgram live STT → rolling transcript + stress heuristic.

What this is NOT:
- It does not start FastAPI or LiveKit. It only exercises `app.services.transcription.deepgram_stream_from_pcm16`,
  the same function the LiveKit audio path will feed in production.

Overall backend picture (Aegis-Link):
1. Bystander phone PWA publishes camera + mic into a LiveKit room.
2. `livekit_ingest.py` joins the room, samples video → `vision.py`, audio PCM → `transcription.py` (Deepgram).
3. `telemetry_aggregate.py` merges text + vision; `broadcast.py` sends JSON to the dispatcher dashboard over WebSockets.

This script skips steps 1–3 and plugs your laptop mic straight into step 2’s Deepgram wrapper so you can
verify API keys, latency, and simple “panic phrase” detection before the full pipeline is wired.

Run from `backend/` with a real Deepgram key and mock mode OFF:

    cd backend
    source .venv/bin/activate
    export MOCK_AI=false
    python -m scripts.mic_deepgram_stress_test

Speak calmly, then yell something like: "Oh my god, he's not breathing, help me!"
You should see [buffer] lines grow, then STRESS_LEVEL: CRITICAL when a trigger phrase hits the buffer.
"""

from __future__ import annotations

import asyncio
import os
import sys
import time
from collections import deque
from pathlib import Path
from typing import AsyncIterator

# Load backend/.env before importing app.*
_backend_root = Path(__file__).resolve().parents[1]
if str(_backend_root) not in sys.path:
    sys.path.insert(0, str(_backend_root))

from dotenv import load_dotenv

load_dotenv(_backend_root / ".env", override=False)
load_dotenv(_backend_root / ".env.local", override=True)


async def _mic_pcm16_mono_16k(*, block_samples: int = 1600) -> AsyncIterator[bytes]:
    """
    Yield int16 mono PCM chunks at 16 kHz (Deepgram linear16).
    block_samples=1600 → 100 ms per chunk at 16 kHz.
    """
    try:
        import numpy as np
        import sounddevice as sd
    except ImportError as e:
        raise RuntimeError(
            "Install mic dependencies: pip install sounddevice numpy"
        ) from e

    loop = asyncio.get_running_loop()
    stream = sd.InputStream(
        samplerate=16000,
        channels=1,
        dtype="int16",
        blocksize=block_samples,
    )
    stream.start()
    try:
        while True:

            def _read() -> bytes:
                data, overflowed = stream.read(block_samples)
                if overflowed:
                    print("[mic] input overflow (drop); speak slightly quieter or increase block size", file=sys.stderr)
                return data.astype(np.int16, copy=False).tobytes()

            yield await loop.run_in_executor(None, _read)
    finally:
        stream.stop()
        stream.close()


async def main() -> None:
    if not (os.getenv("DEEPGRAM_API_KEY") or "").strip():
        print("ERROR: Set DEEPGRAM_API_KEY in backend/.env or the environment.", file=sys.stderr)
        sys.exit(1)

    mock = os.getenv("MOCK_AI", "true").lower() in {"1", "true", "yes", "on"}
    if mock:
        print(
            "ERROR: MOCK_AI is enabled. Deepgram will not run. Use: export MOCK_AI=false",
            file=sys.stderr,
        )
        sys.exit(1)

    from app.services.telemetry_aggregate import transcript_critical_stress
    from app.services.transcription import TranscriptChunk, deepgram_stream_from_pcm16

    print("[info] Deepgram live from default microphone (16 kHz mono PCM). Ctrl+C to stop.")
    print("[info] Try: calm speech, then: “Oh my god, he's not breathing, help me!”")
    print()

    finals: deque[str] = deque(maxlen=24)
    last_critical_at = 0.0
    critical_cooldown_s = 4.0

    async for chunk in deepgram_stream_from_pcm16(pcm16_mono_16khz=_mic_pcm16_mono_16k()):
        if not isinstance(chunk, TranscriptChunk):
            continue

        label = "FINAL" if chunk.is_final else "interim"
        print(f"[{label}] {chunk.text!r}")

        if chunk.is_final and chunk.text.strip():
            finals.append(chunk.text.strip())
            buffer = " ".join(finals)
            print(f"[buffer] {buffer}")

            lower = buffer.lower()
            if transcript_critical_stress(lower):
                now = time.time()
                if now - last_critical_at >= critical_cooldown_s:
                    print("STRESS_LEVEL: CRITICAL")
                    last_critical_at = now


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[info] stopped")
