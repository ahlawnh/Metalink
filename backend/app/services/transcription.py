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
    return os.getenv("MOCK_AI", "").lower() in {"1", "true", "yes"}


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


async def deepgram_stream_from_pcm16(
    *,
    pcm16_mono_16khz: AsyncIterator[bytes],
    deepgram_api_key: Optional[str] = None,
) -> AsyncIterator[TranscriptChunk]:
    """
    Minimal Deepgram streaming wrapper.

    We intentionally keep this lightweight; during hackathon you can swap the transport
    based on whatever audio you can get out of LiveKit.

    If Deepgram SDK isn't installed, raise with a helpful message.
    """

    if _is_mock():
        async for c in mock_transcript_stream():
            yield c
        return

    key = deepgram_api_key or os.getenv("DEEPGRAM_API_KEY")
    if not key:
        raise RuntimeError("Missing DEEPGRAM_API_KEY. Either set MOCK_AI=true or provide the key.")

    try:
        # Official Deepgram SDK shape changes; keep this isolated.
        from deepgram import DeepgramClient, LiveTranscriptionEvents, LiveOptions  # type: ignore
    except Exception as e:  # pragma: no cover
        raise RuntimeError("Deepgram SDK not installed. Either set MOCK_AI=true or install deepgram-sdk.") from e

    dg = DeepgramClient(key)
    options = LiveOptions(
        model="nova-2",
        language="en-US",
        encoding="linear16",
        sample_rate=16000,
        channels=1,
        punctuate=True,
        smart_format=True,
        interim_results=True,
    )

    queue: asyncio.Queue[TranscriptChunk] = asyncio.Queue()
    done = asyncio.Event()

    async def on_message(msg: object) -> None:  # Deepgram event payload
        try:
            # Best-effort parse; keep robust.
            channel = getattr(msg, "channel", None)
            if not channel or not getattr(channel, "alternatives", None):
                return
            alt = channel.alternatives[0]
            text = (getattr(alt, "transcript", "") or "").strip()
            if not text:
                return
            is_final = bool(getattr(msg, "is_final", False))
            conf = getattr(alt, "confidence", None)
            await queue.put(TranscriptChunk(timestamp=time.time(), text=text, is_final=is_final, confidence=conf))
        except Exception:
            # Never let parsing kill the stream
            return

    async def run_socket() -> None:
        sock = dg.listen.asynclive.v("1")
        sock.on(LiveTranscriptionEvents.Transcript, on_message)
        sock.on(LiveTranscriptionEvents.Error, lambda *_: done.set())
        await sock.start(options)

        try:
            async for chunk in pcm16_mono_16khz:
                await sock.send(chunk)
        finally:
            try:
                await sock.finish()
            finally:
                done.set()

    task = asyncio.create_task(run_socket())

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
        task.cancel()

