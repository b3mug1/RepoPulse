"""Unit tests for watchlist alert detection, webhook validation, and API endpoints."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from app.api.schemas import WatchlistCreateRequest
from app.domain.services import detect_watchlist_alerts
from app.infrastructure.database.models import WatchlistModel
from app.infrastructure.database.session import get_db
from app.main import app


def test_detect_watchlist_alerts_on_regressions():
    prev = {
        "health_score": 88,
        "bus_factor": 3,
        "extended_signals": {"ci": {"latest_run_conclusion": "success"}},
    }
    curr = {
        "health_score": 72,
        "bus_factor": 1,
        "extended_signals": {"ci": {"latest_run_conclusion": "failure"}},
    }
    alerts = detect_watchlist_alerts(prev, curr)
    titles = [a["title"] for a in alerts]
    assert "Health Score dropped" in titles
    assert "Bus factor dropped to 1" in titles
    assert "Latest CI run failed" in titles


def test_watchlist_webhook_requires_https():
    with pytest.raises(ValidationError):
        WatchlistCreateRequest(
            owner="acme",
            name="demo",
            cadence="weekly",
            webhook_url="http://insecure.example.com/hook",
        )
    ok = WatchlistCreateRequest(
        owner="acme",
        name="demo",
        cadence="daily",
        webhook_url="https://hooks.slack.com/services/123",
    )
    assert ok.webhook_url == "https://hooks.slack.com/services/123"


class _FakeListResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeWatchlistSession:
    def __init__(self, entry):
        self._entry = entry
        self.deleted = False

    async def execute(self, _stmt):
        return _FakeListResult([(self._entry, "acme/demo")])

    async def get(self, _model, pk):
        return self._entry if pk == self._entry.id else None

    async def delete(self, obj):
        if obj is self._entry:
            self.deleted = True

    async def commit(self):
        return None


@pytest.mark.asyncio
async def test_watchlist_list_and_delete_endpoints():
    now = datetime.now(UTC)
    entry = WatchlistModel(
        id=uuid.uuid4(),
        repository_id=uuid.uuid4(),
        cadence="weekly",
        webhook_url="https://hooks.example.com/secret",
        is_active=True,
        last_checked_at=None,
        next_check_at=now + timedelta(days=7),
        last_analysis_id=None,
        last_alerts=[],
        created_at=now,
    )
    fake_session = _FakeWatchlistSession(entry)
    app.dependency_overrides[get_db] = lambda: fake_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/api/v1/watchlist")
            assert resp.status_code == 200
            items = resp.json()
            assert len(items) == 1
            assert items[0]["repository_full_name"] == "acme/demo"
            assert items[0]["has_webhook"] is True
            assert "webhook_url" not in items[0]

            del_resp = await ac.delete(f"/api/v1/watchlist/{entry.id}")
            assert del_resp.status_code == 200
            assert fake_session.deleted is True
    finally:
        app.dependency_overrides.clear()
