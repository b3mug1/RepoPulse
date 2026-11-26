from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

_CLI_PATH = Path(__file__).resolve().parents[3] / "cli" / "repopulse_cli.py"
_SPEC = importlib.util.spec_from_file_location("repopulse_cli", _CLI_PATH)
assert _SPEC is not None and _SPEC.loader is not None
repopulse_cli = importlib.util.module_from_spec(_SPEC)
sys.modules["repopulse_cli"] = repopulse_cli
_SPEC.loader.exec_module(repopulse_cli)


def _sample_detail(score: int = 84) -> dict:
    return {
        "id": "11111111-1111-1111-1111-111111111111",
        "repository_full_name": "acme/widget",
        "status": "COMPLETED",
        "health": {
            "score": score,
            "grade": "B",
            "coverage": 92,
            "confidence": "high",
            "findings": [
                {
                    "severity": "warning",
                    "title": "Bus factor is 2",
                    "detail": "Add another active maintainer",
                },
            ],
        },
        "metrics": {
            "bus_factor": 2,
            "commits_per_month": 42.5,
        },
        "extended_signals": {
            "ci": {"has_ci": True, "status": "passing"},
            "security": {
                "has_security_md": True,
                "has_dependabot": True,
                "lockfiles": ["package-lock.json"],
            },
            "pull_requests": {"sampled_prs": 12, "avg_first_review_hours": 4.2},
            "releases": {"total_releases": 6, "has_changelog": True},
        },
    }


def test_parse_repo_and_validate_api_url() -> None:
    assert repopulse_cli.parse_repo("facebook/react") == ("facebook", "react")
    assert repopulse_cli.validate_api_url("https://repopulse.example.com/") == "https://repopulse.example.com"

    with pytest.raises(ValueError):
        repopulse_cli.parse_repo("invalid-repo")

    with pytest.raises(ValueError):
        repopulse_cli.validate_api_url("ftp://repopulse.example.com")


def test_format_markdown_report_contains_key_sections() -> None:
    report = repopulse_cli.format_markdown_report(_sample_detail(84), "https://repopulse.example.com")
    assert repopulse_cli.PR_COMMENT_MARKER in report
    assert "acme/widget" in report
    assert "**84/100** (Grade `B`)" in report
    assert "SECURITY.md" in report
    assert "4.2h" in report
    assert "Bus factor is 2" in report
    assert "https://repopulse.example.com/analysis/11111111-1111-1111-1111-111111111111" in report


def test_evaluate_min_score() -> None:
    assert repopulse_cli.evaluate_min_score(_sample_detail(80), None) is True
    assert repopulse_cli.evaluate_min_score(_sample_detail(80), 80) is True
    assert repopulse_cli.evaluate_min_score(_sample_detail(79), 80) is False
    assert repopulse_cli.evaluate_min_score({"health": {"score": None}}, 50) is False


def test_write_github_outputs(tmp_path: Path) -> None:
    summary = tmp_path / "summary.md"
    outputs = tmp_path / "outputs.txt"
    detail = _sample_detail(91)

    repopulse_cli.write_github_outputs(
        detail,
        "https://repopulse.example.com",
        summary_path=str(summary),
        output_path=str(outputs),
        markdown_report="## Report",
    )

    assert "## Report" in summary.read_text(encoding="utf-8")
    out_text = outputs.read_text(encoding="utf-8")
    assert "health-score=91" in out_text
    assert "grade=B" in out_text
    assert "bus-factor=2" in out_text
    assert "analysis-id=11111111-1111-1111-1111-111111111111" in out_text


def test_main_enforces_min_score(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(tmp_path / "step_summary.md"))
    monkeypatch.setenv("GITHUB_OUTPUT", str(tmp_path / "gh_output.txt"))

    with (
        patch.object(
            repopulse_cli,
            "trigger_analysis",
            return_value="11111111-1111-1111-1111-111111111111",
        ),
        patch.object(repopulse_cli, "poll_analysis", return_value=_sample_detail(65)),
    ):
        rc_pass = repopulse_cli.main(
            [
                "--repo",
                "acme/widget",
                "--api-url",
                "https://repopulse.example.com",
                "--min-score",
                "60",
            ]
        )
        rc_fail = repopulse_cli.main(
            [
                "--repo",
                "acme/widget",
                "--api-url",
                "https://repopulse.example.com",
                "--min-score",
                "70",
            ]
        )

    assert rc_pass == 0
    assert rc_fail == 1
