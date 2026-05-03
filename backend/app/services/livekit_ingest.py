from __future__ import annotations

import asyncio
import base64
import logging
import os
import time
from dataclasses import dataclass
from typing import Any, Optional, Literal
from urllib.parse import urlparse

from app.services.telemetry_aggregate import (
    TelemetryState,
    append_transcript_segment,
    gate_hazards,
    patch_segment_translation,
    publish_telemetry,
    publish_transcript_event,
    record_transcript_side_effects,
)
from app.services.transcription import TranscriptChunk, deepgram_stream_from_pcm16, mock_transcript_stream
from app.services.vision import VisionResult, analyze_frame_with_gpt54

logger = logging.getLogger(__name__)

_DG_SAMPLE_RATE = 16000
TranscriptSpeaker = Literal["caller", "dispatcher"]


@dataclass(frozen=True)
class LiveKitConfig:
    url: str
    api_key: str
    api_secret: str
    room: str
    identity: str = "d-spatch-backend"
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
    """Map LiveKit participant identities to transcript speaker roles.

    Bystander tokens default to unique `bystander-*` identities, so caller
    audio cannot rely on one exact identity string. After excluding the
    backend participant and known dispatcher prefix, remaining human audio is
    treated as caller audio.
    """
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
    return "caller"


def _identity_from_track_args(args: tuple[Any, ...]) -> str:
    for candidate in reversed(args):
        identity = getattr(candidate, "identity", None)
        if isinstance(identity, str) and identity.strip():
            return identity.strip()
    return ""


def _livekit_connect_debug_line(*, url: str, room: str, identity: str) -> str:
    """Log host + room (no secrets). Compare to your PWA token's `url` + `room` in Network tab."""
    try:
        raw = (url or "").strip()
        if not raw:
            host = "(LIVEKIT_URL empty)"
        else:
            if "://" not in raw:
                raw = "wss://" + raw
            host = urlparse(raw).hostname or raw[:64]
    except Exception:
        host = url[:64] if url else "?"
    env_room_raw = (os.getenv("LIVEKIT_ROOM") or "").strip()
    if not env_room_raw:
        room_note = "env LIVEKIT_ROOM unset (FastAPI uses default d-spatch-demo if applicable)"
    elif env_room_raw == room:
        room_note = "env LIVEKIT_ROOM matches cfg.room"
    else:
        room_note = f"MISMATCH: os.environ LIVEKIT_ROOM={env_room_raw!r} but cfg.room={room!r}"
    return (
        f"[ingest-debug] LiveKit join target: host={host!r} room={room!r} backend_identity={identity!r} "
        f"| env LIVEKIT_URL set={'yes' if (os.getenv('LIVEKIT_URL') or '').strip() else 'NO'} "
        f"| {room_note}"
    )


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

    logger.info(
        "[ingest-debug] live LiveKit path mock_ai=%s env MOCK_AI=%r OPENAI_KEY_set=%s",
        mock_ai,
        os.getenv("MOCK_AI"),
        bool((os.getenv("OPENAI_API_KEY") or "").strip()),
    )
    print(
        f"[ingest-debug] ingest LIVEKIT path MOCK_AI={mock_ai} OPENAI_KEY_set={bool((os.getenv('OPENAI_API_KEY') or '').strip())}",
        flush=True,
    )

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

    connect_banner = _livekit_connect_debug_line(url=cfg.url, room=cfg.room, identity=cfg.identity)
    logger.info(connect_banner)
    print(connect_banner, flush=True)

    token = (
        api.AccessToken(cfg.api_key, cfg.api_secret)
        .with_identity(cfg.identity)
        .with_grants(api.VideoGrants(room_join=True, room=cfg.room))
        .to_jwt()
    )

    room = rtc.Room()
    await room.connect(cfg.url, token)
    logger.info("[ingest-debug] room.connect() returned OK (same process as GET /api/livekit/broadcaster/token room=%s)", cfg.room)
    print(f"[ingest-debug] room.connect() OK room={cfg.room!r}", flush=True)

    # Collect tracks (multiple video tracks possible; prefer camera over screen-share).
    video_tracks: list[Any] = []
    transcript_tasks: dict[TranscriptSpeaker, asyncio.Task[None]] = {}
    tasks: list[asyncio.Task[None]] = []
    vision_loop_started = False

    loop = asyncio.get_running_loop()

    def _try_start_vision_loop(*, deferred: bool) -> None:
        """Start at most one vision task when a camera track is available (early or after audio)."""
        nonlocal vision_loop_started
        if vision_loop_started:
            return
        picked = _pick_preferred_camera_video_track(video_tracks)
        if picked is None:
            return
        vision_loop_started = True
        label = (
            "starting vision loop (deferred, after audio)"
            if deferred
            else f"starting vision loop (sample every {cfg.frame_sample_interval_s}s)"
        )
        vmsg = f"[ingest-debug] {label} openai_model={openai_model!r}"
        logger.info(vmsg)
        print(vmsg, flush=True)
        tasks.append(
            asyncio.create_task(
                _vision_loop_from_livekit_track(
                    state=state,
                    video_track=picked,
                    interval_s=cfg.frame_sample_interval_s,
                    openai_model=openai_model,
                    frame_max_width=frame_max_width,
                )
            )
        )

    def _schedule_try_start_vision_loop(*, deferred: bool) -> None:
        def _run() -> None:
            try:
                _try_start_vision_loop(deferred=deferred)
            except Exception:
                logger.exception("[ingest-debug] _try_start_vision_loop failed")

        loop.call_soon_threadsafe(_run)

    def on_track_subscribed(track: Any, *args: Any) -> None:
        kind = getattr(track, "kind", None)
        # TrackKind stringifies to "1"/"2", not "audio"/"video".
        if kind == rtc.TrackKind.KIND_VIDEO:
            sid = getattr(track, "sid", None)
            name = getattr(track, "name", None)
            pub_identity = _identity_from_track_args(args)
            msg = (
                "[ingest-debug] VIDEO track subscribed: KIND_VIDEO confirmed | "
                f"track_sid={sid!r} track_name={name!r} publisher_identity={pub_identity!r}"
            )
            logger.info(msg)
            print(msg, flush=True)
            video_tracks.append(track)
            # Audio may have unlocked the wait loop first; start vision when video arrives later.
            _schedule_try_start_vision_loop(deferred=True)
        elif kind == rtc.TrackKind.KIND_AUDIO:
            identity = _identity_from_track_args(args)
            speaker = classify_livekit_audio_participant(identity, backend_identity=cfg.identity)
            if speaker is None:
                print(f"LiveKit audio track ignored: unclassified participant identity={identity!r}", flush=True)
                return
            if speaker in transcript_tasks:
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

    if not video_tracks:
        w = (
            "[ingest-debug] No remote VIDEO track yet (audio or other tracks present). "
            "OpenAI vision will start automatically when a camera track is subscribed. "
            "If it never starts: camera off, publisher video not started, or wrong room. "
            f"audio_tracks_started={list(transcript_tasks.keys())!r}"
        )
        logger.warning(w)
        print(w, flush=True)

    # Video may already be in video_tracks (e.g. video before audio). Callback path handles late video.
    _try_start_vision_loop(deferred=False)

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
        state.latest_vision["hazards"] = gate_hazards(state, state.latest_vision.get("hazards", []))
        await publish_telemetry(state)
        if _log_mock_ticks_enabled():
            print(f"[mock-ingest] vision tick {i} (interval {interval_s}s) -> publish_telemetry / WS broadcast", flush=True)
        i += 1


async def _mock_transcript_loop(*, state: TelemetryState) -> None:
    async for chunk in mock_transcript_stream():
        if state.transcript_ingest_paused:
            continue
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
    frame_tick = 0
    logger.info("[ingest-debug] VideoStream opened; waiting for frames -> JPEG -> OpenAI")
    print("[ingest-debug] VideoStream opened; sampling frames for vision", flush=True)
    try:
        async for event in stream:
            print("🚨 RAW FRAME RECEIVED FROM STREAM", flush=True)
            now = time.time()
            if now - last < interval_s:
                continue

            vf = event.frame
            try:
                rgb = vf.convert(rtc.VideoBufferType.RGB24)
            except Exception:
                logger.exception("[ingest-debug] vf.convert(RGB24) failed (skipping frame)")
                print("[ingest-debug] vf.convert(RGB24) FAILED (see logs)", flush=True)
                continue

            try:
                from PIL import Image  # type: ignore

                im = Image.frombytes("RGB", (rgb.width, rgb.height), bytes(rgb.data))
                buf = BytesIO()
                im.save(buf, format="JPEG", quality=85, optimize=True)
                jpeg_bytes = buf.getvalue()
            except Exception:
                logger.exception("[ingest-debug] PIL JPEG encode failed (skipping frame)")
                print("[ingest-debug] PIL JPEG encode FAILED (see logs)", flush=True)
                continue

            jpeg_bytes = await _downscale_jpeg_to_max_width(jpeg_bytes, max_width=frame_max_width)
            frame_b64 = base64.b64encode(jpeg_bytes).decode("ascii")
            frame_tick += 1
            last = now

            pre = (
                f"[ingest-debug] ABOUT TO CALL analyze_frame_with_gpt54 tick={frame_tick} "
                f"jpeg_bytes={len(jpeg_bytes)} b64_len={len(frame_b64)} model={openai_model!r} "
                f"frame_rgb={rgb.width}x{rgb.height}"
            )
            logger.info(pre)
            print(pre, flush=True)

            try:
                vr: VisionResult = await analyze_frame_with_gpt54(
                    frame_b64_jpeg=frame_b64,
                    model=openai_model,
                    mock_ai=False,
                )
            except Exception as vision_exc:
                logger.exception("[ingest-debug] analyze_frame_with_gpt54 FAILED tick=%s", frame_tick)
                print(f"[ingest-debug] analyze_frame_with_gpt54 FAILED tick={frame_tick}: {vision_exc!r}", flush=True)
                raise

            state.latest_vision = _vision_to_state_dict(vr)
            state.latest_vision["hazards"] = gate_hazards(state, state.latest_vision.get("hazards", []))
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
        if state.transcript_ingest_paused:
            continue
        if not isinstance(tchunk, TranscriptChunk):
            continue
        if tchunk.text:
            # Append immediately so the dispatcher sees words with zero added latency.
            append_transcript_segment(
                state,
                speaker=speaker_role,
                text=tchunk.text,
                timestamp=tchunk.timestamp,
                is_final=tchunk.is_final,
                confidence=tchunk.confidence,
            )

            # For final chunks, kick off translation as a background task — no blocking.
            if tchunk.is_final:
                # Grab the id of the segment we just appended.
                seg_id = state.transcript_segments[-1].get("segment_id") if state.transcript_segments else None
                raw_text = tchunk.text

                async def _translate_and_patch(sid: str | None, text: str) -> None:
                    if not sid:
                        return
                    try:
                        from app.services.translator import translate_to_english
                        translated = await translate_to_english(text)
                        if translated and translated != text:
                            patched = patch_segment_translation(
                                state,
                                segment_id=sid,
                                translated_text=translated,
                                original_text=text,
                            )
                            if patched:
                                await publish_telemetry(state)
                    except Exception as exc:
                        print(f"[translator] background task failed: {exc}", flush=True)

                asyncio.create_task(_translate_and_patch(seg_id, raw_text))

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

