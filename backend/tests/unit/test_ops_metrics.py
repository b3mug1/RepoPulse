"""Unit tests for operational metrics and production Swagger restrictions."""

from app.core.metrics import OperationalMetrics
from app.main import create_app


def test_operational_metrics_snapshot_and_rates():
    m = OperationalMetrics()
    m.record_analysis(duration_seconds=2.5, success=True)
    m.record_analysis(duration_seconds=1.5, success=False)
    m.record_github_error()
    m.record_cache_hit()
    m.record_cache_hit()
    m.record_cache_miss()

    snap = m.snapshot(celery_queue_depth=3)
    assert snap["analyses_completed"] == 1
    assert snap["analyses_failed"] == 1
    assert snap["avg_analysis_duration_seconds"] == 2.0
    assert snap["last_analysis_duration_seconds"] == 1.5
    assert snap["github_errors_total"] == 1
    assert snap["cache_hit_rate"] == 0.6667
    assert snap["celery_queue_depth"] == 3


def test_swagger_disabled_in_production_without_debug(monkeypatch):
    prod_settings = type(
        "S",
        (),
        {
            "app_env": "production",
            "app_debug": False,
            "cors_origins": "https://repopulse.example.com",
            "max_request_body_bytes": 65536,
        },
    )()
    monkeypatch.setattr("app.main.get_settings", lambda: prod_settings)
    prod_app = create_app()
    assert prod_app.docs_url is None
    assert prod_app.redoc_url is None
    assert prod_app.openapi_url is None
