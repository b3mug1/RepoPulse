"""Unit tests for AIClient validation, demo mode, role summaries, and disclosure."""

import pytest

from app.infrastructure.external.gemini_client import (
    AIClient,
    MAX_FILE_PATHS_FOR_AI,
    MAX_README_CHARS_FOR_AI,
    PROMPT_VERSION,
)


class TestAIClientParsingAndDemo:
    def test_parse_valid_json_with_fences_and_roles(self):
        raw = """```json
        {
          "summary": "FastAPI service for repo metrics.",
          "architecture_analysis": "Clean layered architecture.",
          "readme_score": 8.5,
          "readme_feedback": "Clear setup instructions.",
          "tech_stack": ["FastAPI", "PostgreSQL"],
          "role_summaries": {
            "developer": "Uses FastAPI + SQLAlchemy.",
            "manager": "Healthy CI and docs.",
            "recruiter": "Python backend service."
          },
          "evidence_refs": [
            {"claim": "FastAPI app entrypoint", "source_type": "file", "target": "backend/app/main.py"}
          ]
        }
        ```"""
        parsed = AIClient._parse_combined_result(raw)
        assert parsed["ai_summary"] == "FastAPI service for repo metrics."
        assert parsed["readme_quality_score"] == 8.5
        assert parsed["role_summaries"]["developer"] == "Uses FastAPI + SQLAlchemy."
        assert parsed["evidence_refs"][0]["target"] == "backend/app/main.py"

    def test_parse_invalid_json_returns_safe_defaults(self):
        parsed = AIClient._parse_combined_result("not valid json at all")
        assert parsed["ai_summary"] is None
        assert parsed["readme_quality_score"] is None
        assert parsed["detected_tech_stack"] == []
        assert parsed["evidence_refs"] == []

    def test_parse_out_of_range_readme_score_is_rejected(self):
        raw = '{"summary": "ok", "readme_score": 15}'
        parsed = AIClient._parse_combined_result(raw)
        assert parsed["ai_summary"] is None

    @pytest.mark.asyncio
    async def test_demo_mode_without_keys_includes_disclosure_and_metadata(self, monkeypatch):
        monkeypatch.setattr("app.infrastructure.external.gemini_client.get_settings", lambda: type("S", (), {
            "tokenharbor_api_key": "",
            "tokenharbor_base_url": "https://api.tokenharbor.ai/v1",
            "tokenharbor_model": "glm-5.3-flash",
            "gemini_api_key": "",
            "gemini_model": "gemini-1.5-flash",
        })())
        client = AIClient()
        long_paths = [f"src/file_{i}.py" for i in range(MAX_FILE_PATHS_FOR_AI + 50)]
        long_readme = "# Install\n" + ("a" * (MAX_README_CHARS_FOR_AI + 500))
        result = await client.analyze_repository(
            "owner/repo",
            "Demo repo",
            {"Python": 100.0},
            long_paths,
            long_readme,
        )
        meta = result["ai_metadata"]
        assert meta["status"] == "demo"
        assert meta["prompt_version"] == PROMPT_VERSION
        assert f"{MAX_FILE_PATHS_FOR_AI} file paths" in meta["data_sent_disclosure"]
        assert f"{MAX_README_CHARS_FOR_AI} chars" in meta["data_sent_disclosure"]
        assert "developer" in meta["role_summaries"]
        assert "manager" in meta["role_summaries"]
        assert "recruiter" in meta["role_summaries"]
