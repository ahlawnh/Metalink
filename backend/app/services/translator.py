from __future__ import annotations

import os
from typing import Optional

TRANSLATION_MODEL = "gpt-5.4-mini"

TRANSLATION_SYSTEM_PROMPT = (
    "You are a 911 emergency translation assistant. "
    "Translate the following text to English. "
    "Output ONLY the translated text, nothing else. "
    "If the text is already in English, output it unchanged."
)


def _is_mock_ai() -> bool:
    return os.getenv("MOCK_AI", "true").lower() in {"1", "true", "yes", "on"}


async def translate_to_english(text: str) -> Optional[str]:
    """
    Translate a transcript chunk to English using OpenAI.

    Returns the English text, or None if:
    - MOCK_AI is true (skip to avoid API calls in demo mode)
    - The text is already English (detected by the model returning it unchanged)
    - The translation call fails (soft failure — caller should fall back to original text)
    """
    if _is_mock_ai():
        return None

    stripped = text.strip()
    if not stripped:
        return None

    try:
        from openai import AsyncOpenAI  # type: ignore
    except Exception:
        return None

    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None

    client = AsyncOpenAI(api_key=api_key, timeout=5.0)

    try:
        resp = await client.responses.create(
            model=TRANSLATION_MODEL,
            input=[
                {
                    "role": "system",
                    "content": [{"type": "input_text", "text": TRANSLATION_SYSTEM_PROMPT}],
                },
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": stripped}],
                },
            ],
        )
        translated = getattr(resp, "output_text", None)
        if not translated:
            try:
                translated = resp.output[0].content[0].text  # type: ignore[attr-defined]
            except Exception:
                return None

        translated = str(translated).strip()
        if not translated:
            return None

        # Return None when the model gave back the same text — no translation occurred.
        if translated == stripped:
            return None

        return translated

    except Exception as exc:
        print(f"[translator] translate_to_english failed: {exc}", flush=True)
        return None
