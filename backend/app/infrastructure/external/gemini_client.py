"""
AI client for repository analysis.

Supports:
1. Token Harbor (OpenAI-compatible API) with models like GLM 5.3 Flash
2. Google Gemini SDK with models like Gemini 1.5 Flash
"""

from __future__ import annotations

import json
import re
from typing import Literal, Optional

import httpx
import structlog
from pydantic import BaseModel, Field, ValidationError

from app.core.config import get_settings
from app.core.exceptions import ExternalServiceError

logger = structlog.get_logger(__name__)

PROMPT_VERSION = "2.0"
MAX_FILE_PATHS_FOR_AI = 120
MAX_README_CHARS_FOR_AI = 2500
MAX_LANGUAGES_FOR_AI = 10


class _EvidenceRef(BaseModel):
    claim: str = Field(..., min_length=1, max_length=300)
    source_type: Literal["file", "signal"] = "file"
    target: str = Field(..., min_length=1, max_length=200)


class _RoleSummaries(BaseModel):
    developer: str = ""
    manager: str = ""
    recruiter: str = ""


class _AIResponsePayload(BaseModel):
    summary: Optional[str] = None
    architecture_analysis: Optional[str] = None
    readme_score: Optional[float] = Field(None, ge=0.0, le=10.0)
    readme_feedback: Optional[str] = None
    tech_stack: list[str] = Field(default_factory=list)
    role_summaries: _RoleSummaries = Field(default_factory=_RoleSummaries)
    evidence_refs: list[_EvidenceRef] = Field(default_factory=list)


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
        Falls back to deterministic demo heuristics when no AI API key is configured.
        """
        trimmed_languages = dict(list(languages.items())[:MAX_LANGUAGES_FOR_AI])
        trimmed_paths = file_paths[:MAX_FILE_PATHS_FOR_AI]
        trimmed_readme = (readme or "")[:MAX_README_CHARS_FOR_AI]

        disclosure = (
            f"Sent to provider: repository name, description, top {len(trimmed_languages)} languages, "
            f"{len(trimmed_paths)} file paths (max {MAX_FILE_PATHS_FOR_AI}), and README excerpt "
            f"({len(trimmed_readme)} chars, max {MAX_README_CHARS_FOR_AI}). "
            "No commit diffs, private tokens, or contributor emails are transmitted."
        )

        if not self._enabled:
            result = self._demo_analysis(repo_name, description, trimmed_languages, trimmed_paths, trimmed_readme or None)
            result["ai_metadata"] = {
                "provider": "demo",
                "model": "deterministic-heuristic",
                "prompt_version": PROMPT_VERSION,
                "status": "demo",
                "data_sent_disclosure": disclosure,
                "role_summaries": result.pop("role_summaries", {}),
                "evidence_refs": result.pop("evidence_refs", []),
            }
            return result

        file_tree_sample = "\n".join(trimmed_paths)
        readme_excerpt = trimmed_readme or "N/A"

        prompt = (
            "You are an expert software engineer analyzing a public GitHub repository.\n"
            "Rules:\n"
            "1. Separate observable facts from interpretations. Ground every key claim in a concrete file path or GitHub signal.\n"
            "2. NEVER evaluate individual developers, rank candidates, or judge personal productivity.\n"
            "3. Return ONLY a valid JSON object (no markdown fences, no extra text) matching this exact schema:\n\n"
            '{\n'
            '  "summary": "<3-4 concise bullet points separated by \\n (- ...), max 90 words total: purpose, core features, stack, maturity>",\n'
            '  "architecture_analysis": "<3-5 concise bullet points separated by \\n (- ...), max 110 words total: layout, key modules, tests/CI, strengths/risks>",\n'
            '  "readme_score": <float 0-10>,\n'
            '  "readme_feedback": "<2-3 concise bullet points separated by \\n (- ...), max 60 words total: strengths and gaps>",\n'
            '  "tech_stack": ["<framework1>", "<library1>", "<tool1>"],\n'
            '  "role_summaries": {\n'
            '    "developer": "<technical summary for engineers: stack, structure, testing/CI>",\n'
            '    "manager": "<delivery summary for engineering managers: maturity, bus factor/CI risks, docs>",\n'
            '    "recruiter": "<neutral domain & tech-stack overview for technical hiring; NO candidate evaluation>"\n'
            '  },\n'
            '  "evidence_refs": [\n'
            '    {"claim": "<short claim>", "source_type": "file", "target": "<exact file path or signal name>"}\n'
            '  ]\n'
            '}\n\n'
            f"Repository: {repo_name}\n"
            f"Description: {description or 'N/A'}\n"
            f"Languages: {trimmed_languages}\n\n"
            f"File tree (sample):\n{file_tree_sample}\n\n"
            f"README:\n{readme_excerpt}"
        )
        raw = await self._generate(prompt)
        parsed = self._parse_combined_result(raw)
        model_name = self._tokenharbor_model if self._provider == "tokenharbor" else self._gemini_model
        parsed["ai_metadata"] = {
            "provider": self._provider,
            "model": model_name,
            "prompt_version": PROMPT_VERSION,
            "status": "ok" if parsed.get("ai_summary") else "invalid_response",
            "data_sent_disclosure": disclosure,
            "role_summaries": parsed.pop("role_summaries", {}),
            "evidence_refs": parsed.pop("evidence_refs", []),
        }
        return parsed

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
    def _demo_analysis(
        repo_name: str,
        description: str | None,
        languages: dict[str, float],
        file_paths: list[str],
        readme: str | None,
    ) -> dict:
        """Deterministic heuristic insights used when no Gemini/TokenHarbor key is set."""
        normalized_paths = [p.replace("\\", "/").lower() for p in file_paths]
        stack: list[str] = list(languages.keys())[:5]
        indicators = {
            "package.json": "Node.js",
            "tsconfig.json": "TypeScript",
            "pyproject.toml": "Python",
            "requirements.txt": "Python",
            "dockerfile": "Docker",
            "docker-compose": "Docker Compose",
            "cargo.toml": "Rust",
            "go.mod": "Go",
            "vite.config": "Vite",
            "next.config": "Next.js",
            "alembic": "Alembic",
            "pytest": "pytest",
        }
        for marker, label in indicators.items():
            if any(marker in p for p in normalized_paths) and label not in stack:
                stack.append(label)

        readme_text = (readme or "").strip()
        readme_lower = readme_text.lower()
        readme_score = 0.0
        feedback_parts: list[str] = []
        if readme_text:
            readme_score += 3.0 if len(readme_text) >= 400 else 1.5
            for section, pts, label in (
                ("install", 2.0, "installation steps"),
                ("usage", 2.0, "usage examples"),
                ("license", 1.5, "license information"),
                ("test", 1.5, "testing instructions"),
            ):
                if section in readme_lower:
                    readme_score += pts
                else:
                    feedback_parts.append(f"consider adding {label}")
        else:
            feedback_parts.append("no README file detected")

        top_langs = ", ".join(f"{k} ({v}%)" for k, v in list(languages.items())[:3]) or "unknown languages"
        has_tests = any("/test" in p or ".test." in p or ".spec." in p for p in normalized_paths)
        has_ci = any(".github/workflows/" in p or "gitlab-ci" in p for p in normalized_paths)

        summary = (
            f"[Demo mode — no AI key configured] {repo_name} is a repository primarily using {top_langs}. "
            f"{description or 'No repository description provided.'}"
        )
        architecture = (
            f"[Demo mode] Inspected {len(file_paths)} tree paths. "
            f"{'Detected test directories/files. ' if has_tests else 'No standard test paths detected. '}"
            f"{'Detected CI workflow configuration.' if has_ci else 'No standard CI configuration detected.'}"
        )
        feedback = (
            "Demo heuristic check: " + ("; ".join(feedback_parts) if feedback_parts else "README covers core setup and usage sections.")
        )
        evidence_refs: list[dict[str, str]] = []
        for p in file_paths[:12]:
            pl = p.lower()
            if any(k in pl for k in ("readme", "pyproject.toml", "package.json", "dockerfile", ".github/workflows/")):
                evidence_refs.append({"claim": f"Detected {p}", "source_type": "file", "target": p})
        if languages:
            top_lang = next(iter(languages.keys()))
            evidence_refs.append({"claim": f"Primary language signal: {top_lang}", "source_type": "signal", "target": "GitHub Languages API"})

        return {
            "ai_summary": summary,
            "readme_quality_score": round(min(readme_score, 10.0), 1),
            "readme_quality_feedback": feedback,
            "detected_tech_stack": stack[:10],
            "architecture_analysis": architecture,
            "role_summaries": {
                "developer": f"Stack: {', '.join(stack[:6]) or top_langs}. {architecture}",
                "manager": f"Project uses {top_langs}; {'tests detected' if has_tests else 'no standard test paths'}; {'CI detected' if has_ci else 'no standard CI detected'}.",
                "recruiter": f"Public repository focused on {top_langs} with {', '.join(stack[:5]) or 'standard tooling'}. (Repository overview only; not a candidate assessment.)",
            },
            "evidence_refs": evidence_refs[:6],
        }

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
        """Validate and parse the combined JSON response into all AI insight fields."""
        defaults = {
            "ai_summary": None,
            "readme_quality_score": None,
            "readme_quality_feedback": None,
            "detected_tech_stack": [],
            "architecture_analysis": None,
            "role_summaries": {},
            "evidence_refs": [],
        }
        try:
            cleaned = cls._strip_fences(raw)
            match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
            json_text = match.group(0) if match else cleaned
            payload = _AIResponsePayload.model_validate_json(json_text)
            return {
                "ai_summary": payload.summary or None,
                "readme_quality_score": payload.readme_score,
                "readme_quality_feedback": payload.readme_feedback or None,
                "detected_tech_stack": [str(item) for item in payload.tech_stack[:15]],
                "architecture_analysis": payload.architecture_analysis or None,
                "role_summaries": payload.role_summaries.model_dump(),
                "evidence_refs": [ref.model_dump() for ref in payload.evidence_refs[:10]],
            }
        except (json.JSONDecodeError, ValidationError, ValueError, KeyError) as exc:
            logger.warning("Failed to validate AI JSON response", error=str(exc), raw=raw[:500])
            return {**defaults, "ai_summary": None}


# Backward-compatible alias
GeminiClient = AIClient
