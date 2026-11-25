"""
AI client for repository analysis.

Supports:
1. Token Harbor (OpenAI-compatible API) with models like GLM 5.3 Flash
2. Google Gemini SDK with models like Gemini 1.5 Flash
"""

from __future__ import annotations

import json
from typing import Optional

import httpx
import structlog

from app.core.config import get_settings
from app.core.exceptions import ExternalServiceError

logger = structlog.get_logger(__name__)


class AIClient:
    def __init__(self) -> None:
        settings = get_settings()
        self._tokenharbor_key = settings.tokenharbor_api_key
        self._tokenharbor_base_url = settings.tokenharbor_base_url.rstrip("/")
        self._tokenharbor_model = settings.tokenharbor_model or "glm-5.3-flash"

        self._gemini_key = settings.gemini_api_key
        self._gemini_model = settings.gemini_model or "gemini-1.5-flash"

        if self._tokenharbor_key:
            self._provider = "tokenharbor"
            self._enabled = True
            logger.info("AI client initialized with Token Harbor", model=self._tokenharbor_model)
        elif self._gemini_key:
            import google.generativeai as genai
            self._provider = "gemini"
            genai.configure(api_key=self._gemini_key)
            self._model = genai.GenerativeModel(self._gemini_model)
            self._enabled = True
            logger.info("AI client initialized with Gemini", model=self._gemini_model)
        else:
            logger.warning("No AI API key configured (Token Harbor or Gemini) — AI features disabled")
            self._provider = None
            self._enabled = False

    # ── Public API ───────────────────────────────────────────────────────

    async def analyze_repository(
        self,
        repo_name: str,
        description: str | None,
        languages: dict[str, float],
        file_paths: list[str],
        readme: str | None,
    ) -> dict:
        """
        Single consolidated API call that returns all AI insights at once.
        """
        file_tree_sample = "\n".join(file_paths[:150])
        readme_excerpt = (readme or "N/A")[:3000]

        prompt = (
            "You are an expert software engineer analyzing a GitHub repository.\n"
            "Provide a comprehensive analysis and return ONLY a valid JSON object "
            "with exactly these keys (no markdown fences, no extra text):\n\n"
            '{\n'
            '  "summary": "<concise project summary, max 300 words: purpose, features, tech stack, target audience>",\n'
            '  "architecture_analysis": "<architecture analysis, max 500 words: folder structure, patterns, separation of concerns, quality>",\n'
            '  "readme_score": <float 0-10>,\n'
            '  "readme_feedback": "<brief README quality feedback on completeness, clarity, setup instructions>",\n'
            '  "tech_stack": ["<framework1>", "<library1>", "<tool1>", ...]\n'
            '}\n\n'
            f"Repository: {repo_name}\n"
            f"Description: {description or 'N/A'}\n"
            f"Languages: {languages}\n\n"
            f"File tree (sample):\n{file_tree_sample}\n\n"
            f"README:\n{readme_excerpt}"
        )
        raw = await self._generate(prompt)
        return self._parse_combined_result(raw)

    # ── Private helpers ──────────────────────────────────────────────────

    async def _generate(self, prompt: str) -> str:
        if not self._enabled:
            return "AI analysis unavailable — no API key configured."

        if self._provider == "tokenharbor":
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    response = await client.post(
                        f"{self._tokenharbor_base_url}/chat/completions",
                        headers={
                            "Authorization": f"Bearer {self._tokenharbor_key}",
                            "Content-Type": "application/json",
                        },
                        json={
                            "model": self._tokenharbor_model,
                            "messages": [{"role": "user", "content": prompt}],
                            "temperature": 0.2,
                        },
                    )
                    response.raise_for_status()
                    data = response.json()
                    return data["choices"][0]["message"]["content"] or ""
            except Exception as exc:
                logger.error("Token Harbor API error", error=str(exc))
                raise ExternalServiceError("TokenHarbor", str(exc)) from exc

        if self._provider == "gemini":
            try:
                response = await self._model.generate_content_async(prompt)
                return response.text or ""
            except Exception as exc:
                logger.error("Gemini API error", error=str(exc))
                raise ExternalServiceError("Gemini", str(exc)) from exc

        return ""

    @staticmethod
    def _strip_fences(raw: str) -> str:
        """Remove markdown code fences from LLM output."""
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("```", 1)[0]
        return cleaned.strip()

    @classmethod
    def _parse_combined_result(cls, raw: str) -> dict:
        """Parse the single combined JSON response into all AI insight fields."""
        defaults = {
            "ai_summary": None,
            "readme_quality_score": None,
            "readme_quality_feedback": None,
            "detected_tech_stack": [],
            "architecture_analysis": None,
        }
        try:
            cleaned = cls._strip_fences(raw)
            data = json.loads(cleaned)
            return {
                "ai_summary": data.get("summary") or None,
                "readme_quality_score": float(data["readme_score"]) if data.get("readme_score") is not None else None,
                "readme_quality_feedback": data.get("readme_feedback") or None,
                "detected_tech_stack": data.get("tech_stack", []) if isinstance(data.get("tech_stack"), list) else [],
                "architecture_analysis": data.get("architecture_analysis") or None,
            }
        except (json.JSONDecodeError, ValueError, KeyError) as exc:
            logger.warning("Failed to parse AI JSON response", error=str(exc), raw=raw[:500])
            return {**defaults, "ai_summary": raw[:2000] if raw else None}


# Backward-compatible alias
GeminiClient = AIClient
