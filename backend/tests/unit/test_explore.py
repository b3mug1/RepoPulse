from __future__ import annotations

import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.repos import router as repos_router
from app.infrastructure.database.session import get_db


def _build_test_app(rows: list[tuple[SimpleNamespace, SimpleNamespace]]) -> TestClient:
    app = FastAPI()
    app.include_router(repos_router, prefix="/api/v1")

    mock_result = MagicMock()
    mock_result.all.return_value = rows
    mock_session = AsyncMock()
    mock_session.execute.return_value = mock_result

    async def _override_db():
        yield mock_session

    app.dependency_overrides[get_db] = _override_db
    return TestClient(app)


def test_explore_deduplicates_repositories_and_respects_limit() -> None:
    repo_a_id = uuid.uuid4()
    repo_b_id = uuid.uuid4()
    now = datetime.now(UTC)

    repo_a = SimpleNamespace(
        id=repo_a_id,
        full_name="vercel/next.js",
        description="The React Framework",
        language="TypeScript",
        stars=125000,
    )
    repo_b = SimpleNamespace(
        id=repo_b_id,
        full_name="fastapi/fastapi",
        description="FastAPI framework",
        language="Python",
        stars=82000,
    )

    a_latest = SimpleNamespace(
        id=uuid.uuid4(),
        health_score=91,
        health_coverage=100,
        bus_factor=5,
        commits_per_month=180.5,
        completed_at=now,
    )
    a_older = SimpleNamespace(
        id=uuid.uuid4(),
        health_score=80,
        health_coverage=100,
        bus_factor=4,
        commits_per_month=140.0,
        completed_at=now,
    )
    b_latest = SimpleNamespace(
        id=uuid.uuid4(),
        health_score=88,
        health_coverage=95,
        bus_factor=3,
        commits_per_month=95.0,
        completed_at=now,
    )

    client = _build_test_app([(a_latest, repo_a), (a_older, repo_a), (b_latest, repo_b)])
    resp = client.get("/api/v1/repos/explore?limit=6")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["full_name"] == "vercel/next.js"
    assert data[0]["health_score"] == 91
    assert data[0]["stars"] == 125000
    assert data[1]["full_name"] == "fastapi/fastapi"
    assert data[1]["language"] == "Python"


def test_explore_empty_returns_empty_list() -> None:
    client = _build_test_app([])
    resp = client.get("/api/v1/repos/explore")
    assert resp.status_code == 200
    assert resp.json() == []
