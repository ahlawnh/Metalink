from __future__ import annotations

import asyncio
import os
import time
from dataclasses import dataclass
from typing import AsyncIterator, Optional


@dataclass(frozen=True)
class TranscriptChunk:
    timestamp: float
    text: str
    is_final: bool = False
    confidence: Optional[float] = None


def _is_mock() -> bool:
    return os.getenv("MOCK_AI", "true").lower() in {"1", "true", "yes", "on"}


async def mock_transcript_stream(*, interval_s: float = 0.8) -> AsyncIterator[TranscriptChunk]:
    samples = [
        "I just found him he's not responding",
        "He's turning blue what do I do",
        "I have Narcan here",
        "breathe",
        "breathe",
        "please hurry",
    ]
    i = 0
    while True:
        await asyncio.sleep(interval_s)
        yield TranscriptChunk(timestamp=time.time(), text=samples[i % len(samples)], is_final=True, confidence=0.9)
        i += 1


def _results_message_to_chunk(msg: object) -> Optional[TranscriptChunk]:
    """Map Deepgram v6 ListenV1Results (or duck-typed) to TranscriptChunk."""
    ch = getattr(msg, "channel", None)
    if ch is None:
        return None
    alts = getattr(ch, "alternatives", None)
    if not alts:
        return None
    alt = alts[0]
    text = (getattr(alt, "transcript", None) or "").strip()
    if not text:
        return None
    is_final = bool(getattr(msg, "is_final", False))
    conf = getattr(alt, "confidence", None)
    if conf is not None:
        try:
            conf = float(conf)
        except (TypeError, ValueError):
            conf = None
    return TranscriptChunk(timestamp=time.time(), text=text, is_final=is_final, confidence=conf)


async def deepgram_stream_from_pcm16(
    *,
    pcm16_mono_16khz: AsyncIterator[bytes],
    deepgram_api_key: Optional[str] = None,
) -> AsyncIterator[TranscriptChunk]:
    """
    Stream PCM16 mono 16kHz chunks to Deepgram live STT and yield transcript segments.

    Uses Deepgram Python SDK v6+ (AsyncDeepgramClient + listen.v1 WebSocket).
    """
    if _is_mock():
        async for c in mock_transcript_stream():
            yield c
        return

    key = (deepgram_api_key or os.getenv("DEEPGRAM_API_KEY") or "").strip()
    if not key:
        raise RuntimeError("Missing DEEPGRAM_API_KEY. Either set MOCK_AI=true or provide the key.")

    try:
        from deepgram import AsyncDeepgramClient  # type: ignore
        from deepgram.core.events import EventType  # type: ignore
    except Exception as e:  # pragma: no cover
        raise RuntimeError(
            "Deepgram SDK not installed. pip install 'deepgram-sdk>=6,<7'"
        ) from e

    client = AsyncDeepgramClient(api_key=key)
    queue: asyncio.Queue[TranscriptChunk] = asyncio.Queue()
    done = asyncio.Event()
    errors: list[BaseException] = []

    # Use string "true"/"false" for booleans: the v6 SDK's query encoder emits Python
    # True → "True", and Deepgram rejects that with HTTP 400 on the WebSocket handshake.
    async with client.listen.v1.connect(
        model="nova-2",
        encoding="linear16",
        sample_rate=16000,
        channels=1,
        language="en-US",
        punctuate="true",
        smart_format="true",
        interim_results="true",
    ) as connection:

        async def on_message(msg: object) -> None:
            chunk = _results_message_to_chunk(msg)
            if chunk is not None:
                await queue.put(chunk)

        async def on_error(exc: object) -> None:
            if isinstance(exc, BaseException):
                errors.append(exc)
            done.set()

        def on_close(_: object = None) -> None:
            done.set()

        connection.on(EventType.MESSAGE, on_message)
        connection.on(EventType.ERROR, on_error)
        connection.on(EventType.CLOSE, on_close)

        async def run_listen() -> None:
            try:
                await connection.start_listening()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                errors.append(exc)
            finally:
                done.set()

        async def pump_pcm() -> None:
            try:
                async for chunk in pcm16_mono_16khz:
                    await connection.send_media(chunk)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                errors.append(exc)
            finally:
                try:
                    await connection.send_finalize()
                except Exception:
                    pass
                done.set()

        listen_task = asyncio.create_task(run_listen())
        pump_task = asyncio.create_task(pump_pcm())

        try:
            while True:
                if done.is_set() and queue.empty():
                    break
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=0.25)
                    yield item
                except asyncio.TimeoutError:
                    continue
        finally:
            pump_task.cancel()
            listen_task.cancel()
            try:
                await pump_task
            except asyncio.CancelledError:
                pass
            try:
                await listen_task
            except asyncio.CancelledError:
                pass

        if errors:
            raise RuntimeError(f"Deepgram live stream failed: {errors[0]}") from errors[0]
