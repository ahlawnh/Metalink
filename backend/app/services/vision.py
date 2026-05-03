from __future__ import annotations

import json
import logging
import os
import random
from dataclasses import dataclass
from typing import Any, Optional

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class VisionResult:
    hazards: list[dict[str, Any]]
    vitals: dict[str, Any]
    ai_dispatcher_alert: str
    patient_position: str = "unknown"
    cyanosis_detected: bool = False
    bystander_action: str = "unknown"


def _mock_vision(seed: Optional[int] = None) -> VisionResult:
    rng = random.Random(seed)
    hazards: list[dict[str, Any]] = []

    roll = rng.random()
    if roll < 0.33:
        hazards.append(
            {"type": "paraphernalia", "description": "Needles/syringe visible on surface", "confidence": 0.88}
        )
        alert = "Scene hazard: needles visible—advise caution to responders."
    elif roll < 0.66:
        hazards.append({"type": "paraphernalia", "description": "Foil and lighter present", "confidence": 0.77})
        alert = "Possible substance paraphernalia detected; consider Narcan guidance."
    else:
        hazards.append({"type": "paraphernalia", "description": "Unmarked orange pill bottle", "confidence": 0.71})
        alert = "Possible pills present; ask bystander what was taken if safe."

    positions = ["supine", "prone", "side_recovery", "seated", "unknown"]
    vitals = {"estimated_respiratory_rate": 0, "chest_rise_detected": rng.random() < 0.35}
    return VisionResult(
        hazards=hazards,
        vitals=vitals,
        ai_dispatcher_alert=alert,
        patient_position=positions[rng.randint(0, len(positions) - 1)],
        cyanosis_detected=rng.random() < 0.2,
        bystander_action="unknown",
    )


VISION_SYSTEM_PROMPT = """You are D/SPATCH Vision Triage, an AI assistant for emergency dispatch telemetry.
Your job is NOT to diagnose. Your job is to extract scene safety hazards and simple observable cues from a single image frame and produce a compact JSON object for a dispatcher dashboard.

Image context: This frame comes from a bystander's **phone camera** (handheld or shirt-pocket). Expect motion blur, partial framing, glare, and uneven exposure. When in doubt, use "unknown" and lower confidence—do not invent scene details.

Rules:
- Output MUST be valid JSON and MUST match the schema exactly. No markdown, no extra keys, no commentary.
- Be conservative. Prefer "unknown" over guessing.
- Only report what is visually observable in the frame.
- If the frame is too blurry/dark/occluded, return empty hazards and set low-confidence.
- Never identify a person. No age, gender, race, identity. Do not speculate.
- Time budget: optimize for speed and minimal tokens.
- Do NOT estimate breaths-per-minute or any numeric respiratory rate from a single frame; that is computed elsewhere from audio. Only output chest_rise_visible as a boolean visual cue.

Schema (exact):
{
  "hazards": [
    { "type": "paraphernalia|weapon|fire|smoke|blood|pills|needles|unknown", "description": "string", "confidence": 0.0 }
  ],
  "patient_position": "supine|prone|side_recovery|seated|unknown",
  "cyanosis_detected": true,
  "bystander_action": "cpr|narcan_present|none|unknown",
  "chest_rise_visible": true,
  "ai_dispatcher_alert": "string"
}
"""


async def analyze_frame_with_gpt54(
    *,
    frame_b64_jpeg: str,
    model: str = "gpt-5.4",
    openai_api_key: Optional[str] = None,
    mock_ai: bool = False,
    seed: Optional[int] = None,
) -> VisionResult:
    """
    Returns a VisionResult suitable for merging into the shared telemetry contract.

    This stays self-contained in app/services for Hacker 2. It intentionally does not
    depend on Hacker 4 schemas; Hacker 4 can validate at the broadcaster boundary.

    Mock vision is **only** when `mock_ai=True` (caller's intent). Live LiveKit ingest
    passes `mock_ai=False` so this does not double-gate on `MOCK_AI` env and ignore
    `run_ingestion_loop(mock_ai=False)`.
    """

    if mock_ai:
        logger.debug("vision: skipping OpenAI (mock): mock_ai=True")
        return _mock_vision(seed=seed)

    # Optional dependency: do not hard-require OpenAI SDK during early mock phase.
    try:
        from openai import AsyncOpenAI  # type: ignore
    except Exception as e:  # pragma: no cover
        raise RuntimeError(
            "OpenAI SDK not installed. Either set MOCK_AI=true or install openai."
        ) from e

    api_key = openai_api_key or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("Missing OPENAI_API_KEY. Either set MOCK_AI=true or provide the key.")

    client = AsyncOpenAI(api_key=api_key)

    banner = (
        f"[vision-debug] calling OpenAI Responses API model={model!r} jpeg_base64_chars={len(frame_b64_jpeg)} "
        f"(dashboard usage should increment after this)"
    )
    logger.info(banner)
    print(banner, flush=True)

    # NOTE: We keep the request shape intentionally simple. Do not pass response_format here:
    # some openai SDK versions' AsyncResponses.create() reject that kwarg (summarizer omits it too).
    try:
        resp = await client.responses.create(
            model=model,
            input=[
                {
                    "role": "system",
                    "content": [{"type": "input_text", "text": VISION_SYSTEM_PROMPT}],
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": "Analyze this single frame."},
                        {"type": "input_image", "image_url": f"data:image/jpeg;base64,{frame_b64_jpeg}"},
                    ],
                },
            ],
        )
    except Exception:
        logger.exception("[vision-debug] OpenAI responses.create failed model=%r", model)
        raise

    text = getattr(resp, "output_text", None)
    if not text:
        # Fallback: attempt to find a text output segment
        try:
            text = resp.output[0].content[0].text  # type: ignore[attr-defined]
        except Exception as parse_exc:
            logger.exception("[vision-debug] OpenAI response missing output_text")
            raise RuntimeError("OpenAI response missing output_text; cannot parse.") from parse_exc

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        logger.exception("[vision-debug] JSON parse failed on model output (first 200 chars): %s", text[:200])
        raise

    hazards = data.get("hazards") or []
    # RR is not taken from vision (single frame); telemetry_aggregate fills RR from "breathe" cadence.
    vitals = {
        "estimated_respiratory_rate": 0,
        "chest_rise_detected": bool(data.get("chest_rise_visible") or False),
    }
    alert = str(data.get("ai_dispatcher_alert") or "No obvious scene hazards detected.")
    patient_position = str(data.get("patient_position") or "unknown")
    cyanosis_detected = bool(data.get("cyanosis_detected"))
    bystander_action = str(data.get("bystander_action") or "unknown")

    return VisionResult(
        hazards=hazards,
        vitals=vitals,
        ai_dispatcher_alert=alert,
        patient_position=patient_position,
        cyanosis_detected=cyanosis_detected,
        bystander_action=bystander_action,
    )

