from __future__ import annotations

import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

from app.api.routes.analysis import _build_analysis_detail


def test_build_analysis_detail_normalizes_legacy_int_breakdown() -> None:
    now = datetime.now(UTC)
    analysis = SimpleNamespace(
        id=uuid.uuid4(),
        repository_id=uuid.uuid4(),
        status="completed",
        progress_stage="completed",
        health_score=82,
        health_coverage=0,
        health_breakdown={
            "activity": 100,
            "collaboration": 60,
            "documentation": 80,
            "testing": 100,
            "automation": 100,
        },
        health_findings=None,
        extended_signals=None,
        error_message=None,
        total_commits=12,
        avg_commit_size=15.0,
        commits_per_day=1.2,
        commits_per_month=36.0,
        code_churn_additions=120,
        code_churn_deletions=60,
        avg_time_between_commits_hours=12.0,
        bus_factor=2,
        language_distribution={"Python": 100.0},
        ai_summary=None,
        readme_quality_score=None,
        readme_quality_feedback=None,
        detected_tech_stack=[],
        architecture_analysis=None,
        ai_metadata={},
        created_at=now,
        completed_at=now,
    )
    repo = SimpleNamespace(
        full_name="b3mug1/Diploma-AITU",
        owner="b3mug1",
        name="Diploma-AITU",
    )

    detail = _build_analysis_detail(
        {"analysis": analysis, "contributors": [], "commits": [], "commits_count": 0},
        repo,
    )
    assert detail.health.breakdown["activity"].score == 100
    assert detail.health.breakdown["collaboration"].status == "legacy"
