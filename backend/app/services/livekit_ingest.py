from __future__ import annotations

import asyncio
import base64
import os
import time
from dataclasses import dataclass
from typing import Any, Optional, Literal

from app.services.telemetry_aggregate import (
    TelemetryState,
    append_transcript_segment,
    publish_telemetry,
    publish_transcript_event,
    record_transcript_side_effects,
)
from app.services.transcription import TranscriptChunk, deepgram_stream_from_pcm16, mock_transcript_stream
from app.services.vision import VisionResult, analyze_frame_with_gpt54

_DG_SAMPLE_RATE = 16000
TranscriptSpeaker = Literal["caller", "dispatcher"]


@dataclass(frozen=True)
class LiveKitConfig:
    url: str
    api_key: str
    api_secret: str
    room: str
    identity: str = "aegis-link-backend"
    frame_sample_interval_s: float = 2.5


def _track_is_screen_share(track: Any) -> bool:
    """Prefer phone camera over screen-share if both exist (e.g. accidental share)."""
    src = getattr(track, "source", None)
    if src is None:
        return False
    label = str(src).upper()
    return "SCREEN" in label


def _pick_preferred_camera_video_track(tracks: list[Any]) -> Optional[Any]:
    if not tracks:
        return None
    cameras = [t for t in tracks if not _track_is_screen_share(t)]
    return cameras[0] if cameras else tracks[0]


def classify_livekit_audio_participant(
    identity: str,
    *,
    backend_identity: str,
    caller_identity: Optional[str] = None,
    dispatcher_identity_prefix: Optional[str] = None,
) -> Optional[TranscriptSpeaker]:
    normalized = (identity or "").strip()
    if not normalized or normalized == backend_identity:
        return None

    caller = (caller_identity or os.getenv("LIVEKIT_CALLER_IDENTITY") or "caller").strip()
    dispatcher_prefix = (
        dispatcher_identity_prefix
        or os.getenv("LIVEKIT_DISPATCHER_IDENTITY_PREFIX")
        or "metalink-operator"
    ).strip()

    if normalized == caller:
        return "caller"
    if dispatcher_prefix and normalized.startswith(dispatcher_prefix):
        return "dispatcher"
    return None


def _identity_from_track_args(args: tuple[Any, ...]) -> str:
    for candidate in reversed(args):
        identity = getattr(candidate, "identity", None)
        if isinstance(identity, str) and identity.strip():
            return identity.strip()
    return ""


def _vision_to_state_dict(vr: VisionResult) -> dict[str, Any]:
    return {
        "hazards": vr.hazards,
        "vitals": vr.vitals,
        "ai_dispatcher_alert": vr.ai_dispatcher_alert,
        "patient_position": vr.patient_position,
        "cyanosis_detected": vr.cyanosis_detected,
        "bystander_action": vr.bystander_action,
    }


async def _downscale_jpeg_to_max_width(jpeg_bytes: bytes, max_width: int = 768, quality: int = 70) -> bytes:
    """
    Optional optimization. If Pillow isn't installed, return original bytes.
    """

    try:
        from PIL import Image  # type: ignore
    except Exception:
        return jpeg_bytes

    from io import BytesIO

    im = Image.open(BytesIO(jpeg_bytes))
    w, h = im.size
    if w <= max_width:
        return jpeg_bytes
    scale = max_width / float(w)
    new_size = (max_width, max(1, int(h * scale)))
    im = im.resize(new_size)
    out = BytesIO()
    im.save(out, format="JPEG", quality=quality, optimize=True)
    return out.getvalue()


async def run_ingestion_loop(
    *,
    state: TelemetryState,
    cfg: LiveKitConfig,
    mock_ai: bool,
    openai_model: str = "gpt-5.4",
    frame_max_width: int = 768,
) -> None:
    """
    Hacker 2: core loop.

    - Join LiveKit room as hidden participant (when not MOCK_AI).
    - Video: expect **phone PWA camera** (Meta glasses are BT audio only for this sprint).
    - Every N seconds: capture latest frame, downscale, base64, send to vision.
    - Stream audio to Deepgram and publish transcript events.
    - After every update, call Hacker 4 broadcaster via publish_* helpers.
    """

    if mock_ai:
        await asyncio.gather(
            _mock_vision_loop(state=state, interval_s=cfg.frame_sample_interval_s),
            _mock_transcript_loop(state=state),
        )
        return

    # Optional dependency: keep isolated so mock mode works without LiveKit.
    # RTC lives in `livekit`; AccessToken/VideoGrants live in `livekit-api` (`from livekit import api`).
    try:
        from livekit import api  # type: ignore
        from livekit import rtc  # type: ignore
    except Exception as e:  # pragma: no cover
        raise RuntimeError(
            "LiveKit packages missing or failed to import. Install `livekit` and `livekit-api`, "
            "or set MOCK_AI=true to skip LiveKit."
        ) from e

    token = (
        api.AccessToken(cfg.api_key, cfg.api_secret)
        .with_identity(cfg.identity)
        .with_grants(api.VideoGrants(room_join=True, room=cfg.room))
        .to_jwt()
    )

    room = rtc.Room()
    await room.connect(cfg.url, token)

    # Collect tracks (multiple video tracks possible; prefer camera over screen-share).
    video_tracks: list[Any] = []
    transcript_tasks: dict[TranscriptSpeaker, asyncio.Task[None]] = {}
    tasks: list[asyncio.Task[None]] = []

    def on_track_subscribed(track: Any, *args: Any) -> None:
        kind = getattr(track, "kind", None)
        # TrackKind stringifies to "1"/"2", not "audio"/"video".
        if kind == rtc.TrackKind.KIND_VIDEO:
            video_tracks.append(track)
        elif kind == rtc.TrackKind.KIND_AUDIO:
            identity = _identity_from_track_args(args)
            speaker = classify_livekit_audio_participant(identity, backend_identity=cfg.identity)
            if speaker is None or speaker in transcript_tasks:
                return
            task = asyncio.create_task(
                _transcript_loop_from_livekit_track(
                    state=state,
                    audio_track=track,
                    speaker_role=speaker,
                )
            )
            transcript_tasks[speaker] = task
            tasks.append(task)

    room.on("track_subscribed", on_track_subscribed)

    # Spin until we have at least video or audio.
    started = time.time()
    while not video_tracks and not transcript_tasks:
        if time.time() - started > 20:
            raise RuntimeError("Timed out waiting for LiveKit tracks.")
        await asyncio.sleep(0.1)

    video_track = _pick_preferred_camera_video_track(video_tracks)

    if video_track is not None:
        tasks.append(
            asyncio.create_task(
                _vision_loop_from_livekit_track(
                    state=state,
                    video_track=video_track,
                    interval_s=cfg.frame_sample_interval_s,
                    openai_model=openai_model,
                    frame_max_width=frame_max_width,
                )
            )
        )

    try:
        await asyncio.gather(*tasks)
    finally:
        await room.disconnect()


def _log_mock_ticks_enabled() -> bool:
    return os.getenv("AEGIS_LOG_MOCK_TICKS", "").lower() in {"1", "true", "yes", "on"}


async def _mock_vision_loop(*, state: TelemetryState, interval_s: float) -> None:
    i = 0
    while True:
        await asyncio.sleep(interval_s)
        vr: VisionResult = await analyze_frame_with_gpt54(frame_b64_jpeg="", mock_ai=True, seed=i)
        state.latest_vision = _vision_to_state_dict(vr)
        await publish_telemetry(state)
        if _log_mock_ticks_enabled():
            print(f"[mock-ingest] vision tick {i} (interval {interval_s}s) -> publish_telemetry / WS broadcast", flush=True)
        i += 1


async def _mock_transcript_loop(*, state: TelemetryState) -> None:
    async for chunk in mock_transcript_stream():
        append_transcript_segment(
            state,
            speaker="caller",
            text=chunk.text,
            timestamp=chunk.timestamp,
            is_final=chunk.is_final,
            confidence=chunk.confidence,
        )
        record_transcript_side_effects(state, text=chunk.text, is_final=chunk.is_final)
        await publish_transcript_event(
            {
                "timestamp": chunk.timestamp,
                "speaker": "caller",
                "text": chunk.text,
                "is_final": chunk.is_final,
                "confidence": chunk.confidence,
            }
        )
        await publish_telemetry(state)


async def _vision_loop_from_livekit_track(
    *,
    state: TelemetryState,
    video_track: Any,
    interval_s: float,
    openai_model: str,
    frame_max_width: int,
) -> None:
    """
    Best-effort: grab frames from LiveKit video track (livekit.rtc.VideoStream).
    """

    from io import BytesIO

    from livekit import rtc  # type: ignore

    stream = rtc.VideoStream(video_track)
    last = 0.0
    try:
        async for event in stream:
            now = time.time()
            if now - last < interval_s:
                continue
            last = now

            vf = event.frame
            try:
                rgb = vf.convert(rtc.VideoBufferType.RGB24)
            except Exception:
                continue

            try:
                from PIL import Image  # type: ignore

                im = Image.frombytes("RGB", (rgb.width, rgb.height), bytes(rgb.data))
                buf = BytesIO()
                im.save(buf, format="JPEG", quality=85, optimize=True)
                jpeg_bytes = buf.getvalue()
            except Exception:
                continue

            jpeg_bytes = await _downscale_jpeg_to_max_width(jpeg_bytes, max_width=frame_max_width)
            frame_b64 = base64.b64encode(jpeg_bytes).decode("ascii")

            vr: VisionResult = await analyze_frame_with_gpt54(frame_b64_jpeg=frame_b64, model=openai_model)
            state.latest_vision = _vision_to_state_dict(vr)
            await publish_telemetry(state)
    finally:
        await stream.aclose()


async def _transcript_loop_from_livekit_track(
    *,
    state: TelemetryState,
    audio_track: Any,
    speaker_role: TranscriptSpeaker,
) -> None:
    """
    Convert LiveKit audio into 16kHz mono PCM16 bytes for Deepgram.

    Uses AudioStream (native 16 kHz mono where supported) + AudioResampler fallback.
    """

    import numpy as np
    from livekit import rtc  # type: ignore

    async def pcm_iter() -> Any:
        # Ask native stream for Deepgram-friendly rate; frames are s16le PCM.
        astream = rtc.AudioStream.from_track(
            track=audio_track,
            sample_rate=_DG_SAMPLE_RATE,
            num_channels=1,
        )
        resampler: Any = None
        resampler_key: tuple[int, int] | None = None
        try:
            async for ev in astream:
                fr = ev.frame
                arr = np.asarray(fr.data, dtype=np.int16).ravel()
                nch = int(fr.num_channels)
                if nch > 1:
                    arr = arr.reshape(-1, nch).mean(axis=1).astype(np.int16)
                pcm = arr.tobytes()
                sr = int(fr.sample_rate)

                if sr == _DG_SAMPLE_RATE:
                    yield pcm
                    continue

                key = (sr, 1)
                if resampler is None or resampler_key != key:
                    resampler = rtc.AudioResampler(sr, _DG_SAMPLE_RATE, num_channels=1)
                    resampler_key = key
                for out_fr in resampler.push(bytearray(pcm)):
                    yield np.asarray(out_fr.data, dtype=np.int16).tobytes()
            if resampler is not None:
                for out_fr in resampler.flush():
                    yield np.asarray(out_fr.data, dtype=np.int16).tobytes()
        finally:
            await astream.aclose()

    async for tchunk in deepgram_stream_from_pcm16(pcm16_mono_16khz=pcm_iter()):
        if not isinstance(tchunk, TranscriptChunk):
            continue
        if tchunk.text:
            append_transcript_segment(
                state,
                speaker=speaker_role,
                text=tchunk.text,
                timestamp=tchunk.timestamp,
                is_final=tchunk.is_final,
                confidence=tchunk.confidence,
            )

        if speaker_role == "caller":
            record_transcript_side_effects(state, text=tchunk.text, is_final=tchunk.is_final)

        await publish_transcript_event(
            {
                "timestamp": tchunk.timestamp,
                "speaker": speaker_role,
                "text": tchunk.text,
                "is_final": tchunk.is_final,
                "confidence": tchunk.confidence,
            }
        )
        await publish_telemetry(state)

