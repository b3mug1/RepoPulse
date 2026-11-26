"""Unit tests for SVG Health Score badge and multi-repo benchmark endpoint."""

import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.dependencies import get_analysis_detail_use_case
from app.api.routes.repos import render_health_badge_svg
from app.domain.entities import Analysis, AnalysisStatus
from app.infrastructure.database.session import get_db
from app.main import app


def test_render_health_badge_svg_colors_and_unknown():
    high = render_health_badge_svg(88)
    assert "88/100" in high
    assert "#16a34a" in high

    mid = render_health_badge_svg(62)
    assert "62/100" in mid
    assert "#ca8a04" in mid

    low = render_health_badge_svg(30)
    assert "30/100" in low
    assert "#dc2626" in low

    unknown = render_health_badge_svg(None)
    assert "unknown" in unknown
    assert "#64748b" in unknown


class _FakeScalarResult:
    def __init__(self, scalar=None, first_row=None):
        self._scalar = scalar
        self._first = first_row

    def scalar_one_or_none(self):
        return self._scalar

    def first(self):
        return self._first


class _FakeBadgeSession:
    def __init__(self):
        self._calls = 0

    async def execute(self, _stmt):
        self._calls += 1
        if self._calls == 1:
            return _FakeScalarResult(scalar=uuid.uuid4())
        return _FakeScalarResult(first_row=(91, 100))


class _FakeRepoSession:
    def __init__(self, repo):
        self._repo = repo

    async def get(self, _model, _pk):
        return self._repo


@pytest.mark.asyncio
async def test_badge_svg_endpoint_and_benchmark_endpoint():
    app.dependency_overrides[get_db] = lambda: _FakeBadgeSession()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/api/v1/repos/acme/demo/badge.svg")
            assert resp.status_code == 200
            assert "image/svg+xml" in resp.headers["content-type"]
            assert "91/100" in resp.text
    finally:
        app.dependency_overrides.clear()

    aid1 = uuid.uuid4()
    aid2 = uuid.uuid4()
    rid = uuid.uuid4()
    now = datetime(2025, 6, 10, tzinfo=UTC)
    repo = SimpleNamespace(id=rid, owner="acme", name="demo", full_name="acme/demo")

    class FakeGetUC:
        async def execute(self, aid):
            return {
                "analysis": Analysis(
                    id=aid,
                    repository_id=rid,
                    status=AnalysisStatus.COMPLETED,
                    health_score=85,
                    health_coverage=100,
                    created_at=now,
                    completed_at=now,
                ),
                "contributors": [],
                "commits": [],
                "commits_count": 0,
            }

    app.dependency_overrides[get_analysis_detail_use_case] = lambda: FakeGetUC()
    app.dependency_overrides[get_db] = lambda: _FakeRepoSession(repo)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            bad = await ac.get(f"/api/v1/analyses/benchmark?ids={aid1}")
            assert bad.status_code == 422

            ok = await ac.get(f"/api/v1/analyses/benchmark?ids={aid1},{aid2}")
            assert ok.status_code == 200
            items = ok.json()
            assert len(items) == 2
            assert items[0]["repository_full_name"] == "acme/demo"
    finally:
        app.dependency_overrides.clear()
