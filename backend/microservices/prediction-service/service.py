import os
import re
from typing import Optional

import httpx


class PredictionService:
    def __init__(self):
        self.provider = os.getenv("PREDICTION_PROVIDER", "openrouter").strip().lower() or "openrouter"
        self.api_key = (
            os.getenv("PREDICTION_API_KEY", "").strip()
            or os.getenv("OPENROUTER_API_KEY", "").strip()
            or os.getenv("OPENAI_API_KEY", "").strip()
        )
        self.model = (
            os.getenv("PREDICTION_MODEL", "qwen/qwen3-next-80b-a3b-instruct:free").strip()
            or "qwen/qwen3-next-80b-a3b-instruct:free"
        )
        self.base_url = (
            os.getenv("PREDICTION_BASE_URL", "https://openrouter.ai/api/v1").strip().rstrip("/")
        )
        self._last_error: Optional[str] = None

    def start_background_loading(self):
        # External API mode does not need model warm-up.
        return

    def status_payload(self):
        status = "ready"
        if not self.api_key:
            status = "degraded"

        return {
            "status": status,
            "provider": self.provider,
            "model": self.model,
            "configured": bool(self.api_key),
            "error": self._last_error,
        }

    def _clean_text(self, text: str) -> str:
        return re.sub(r"[^a-zA-Z0-9']+", " ", (text or "").lower()).strip()

    def _fallback_word(self, text: str) -> str:
        cleaned = self._clean_text(text)
        if not cleaned:
            return ""

        words = cleaned.split()
        if not words:
            return ""

        common_suffix_map = {
            "how": "to",
            "what": "is",
            "where": "is",
            "when": "you",
            "thank": "you",
            "nice": "work",
            "let": "me",
            "i": "am",
            "we": "can",
            "you": "can",
            "can": "you",
        }
        return common_suffix_map.get(words[-1], "")

    def _normalize_word(self, raw_text: str) -> str:
        for word in self._clean_text(raw_text).split():
            if word:
                return word
        return ""

    def _predict_with_openrouter(self, text: str):
        if not self.api_key:
            self._last_error = "PREDICTION_API_KEY is not set"
            return {"status": "degraded", "word": self._fallback_word(text)}

        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You predict the next word for a collaborative text editor. "
                        "Reply with exactly one likely next word in lowercase ASCII letters only. "
                        "No punctuation. No explanation. No multiple words."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Context: {text}\nNext word:",
                },
            ],
            "max_tokens": 5,
            "temperature": 0.2,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        try:
            with httpx.Client(timeout=12.0) as client:
                response = client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
        except Exception as exc:
            self._last_error = str(exc)
            return {"status": "error", "word": self._fallback_word(text)}

        choices = data.get("choices") or []
        content = ""
        if choices:
            content = (((choices[0] or {}).get("message") or {}).get("content") or "").strip()

        word = self._normalize_word(content)
        if not word:
            self._last_error = "Model returned no usable word"
            return {"status": "error", "word": self._fallback_word(text)}

        self._last_error = None
        return {"status": "ready", "word": word}

    def predict_next_word(self, text: str):
        cleaned = self._clean_text(text)
        if not cleaned:
            return {"status": "ready", "word": ""}

        if self.provider == "openrouter":
            return self._predict_with_openrouter(cleaned)

        self._last_error = f"Unsupported prediction provider: {self.provider}"
        return {"status": "error", "word": self._fallback_word(cleaned)}


prediction_service = PredictionService()
