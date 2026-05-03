from __future__ import annotations

import os
from typing import Optional

ROLLING_SUMMARY_MODEL = "gpt-5.4-mini"

SUMMARY_SYSTEM_PROMPT = """You are an AI assistant for a 911 dispatcher. Read this raw, chaotic transcript buffer from a live emergency. Summarize the current situation in exactly 1 or 2 concise sentences. Focus on patient vitals, hazards, and bystander actions. If the buffer is empty, return 'Awaiting scene context...'."""

FALLBACK_SUMMARY = "Summary unavailable. Rely on live transcript."
AWAITING_MESSAGE = "Awaiting scene context..."


def _is_mock_ai() -> bool:
    return os.getenv("MOCK_AI", "true").lower() in {"1", "true", "yes", "on"}


def _mock_rolling_summary(transcript_buffer: str) -> str:
    if not transcript_buffer.strip():
        return AWAITING_MESSAGE
    clipped = transcript_buffer.strip()
    if len(clipped) > 160:
        clipped = clipped[:157] + "..."
    return f"Mock rolling summary: {clipped}"


async def generate_rolling_summary(
    transcript_buffer: str,
    *,
    openai_api_key: Optional[str] = None,
) -> str:
    """
    Produce a short dispatcher-facing summary from the live transcript buffer.

    When MOCK_AI is true, returns a local mock string and does not call OpenAI
    (per backend budget-protection rules).
    """
    if not transcript_buffer.strip():
        return AWAITING_MESSAGE

    if _is_mock_ai():
        return _mock_rolling_summary(transcript_buffer)

    try:
        from openai import AsyncOpenAI  # type: ignore
    except Exception as exc:
        print(f"OpenAI SDK import failed for rolling summary: {exc}")
        return FALLBACK_SUMMARY

    api_key = openai_api_key or os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("Rolling summary skipped: missing OPENAI_API_KEY")
        return FALLBACK_SUMMARY

    client = AsyncOpenAI(api_key=api_key, timeout=15.0)

    try:
        resp = await client.responses.create(
            model=ROLLING_SUMMARY_MODEL,
            input=[
                {
                    "role": "system",
                    "content": [{"type": "input_text", "text": SUMMARY_SYSTEM_PROMPT}],
                },
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": transcript_buffer}],
                },
            ],
        )
        text = getattr(resp, "output_text", None)
        if not text:
            try:
                text = resp.output[0].content[0].text  # type: ignore[attr-defined]
            except Exception:
                text = None
        if not text or not str(text).strip():
            return FALLBACK_SUMMARY
        return str(text).strip()
    except Exception as exc:
        print(f"Rolling summary OpenAI call failed: {exc}")
        return FALLBACK_SUMMARY
