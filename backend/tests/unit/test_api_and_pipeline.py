"""API and end-to-end pipeline tests using dependency overrides and mocked GitHub/Celery."""

import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.dependencies import get_analysis_detail_use_case, get_analyze_use_case
from app.domain.entities import Analysis, AnalysisStatus, CommitStats, Contributor
from app.infrastructure.database.session import get_db
from app.infrastructure.jobs.tasks import _analyze
from app.main import app


class _FakeSession:
    def __init__(self, repo=None):
        self._repo = repo

    async def get(self, _model, _pk):
        return self._repo


@pytest.mark.asyncio
class TestAPIWithDependencyOverrides:
    async def test_analyze_validation_and_dispatch(self, monkeypatch):
        from app.api.rate_limit import limiter

        monkeypatch.setattr(limiter, "enabled", False)
        repo_id = uuid.uuid4()
        analysis_id = uuid.uuid4()

        class FakeAnalyzeUC:
            async def execute(self, req):
                return SimpleNamespace(
                    analysis_id=analysis_id,
                    repository_id=repo_id,
                    status="pending",
                )

        app.dependency_overrides[get_analyze_use_case] = lambda: FakeAnalyzeUC()
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                bad = await ac.post(
                    "/api/v1/analyses/analyze",
                    json={"owner": "..", "name": "react"},
                )
                assert bad.status_code == 422

                ok = await ac.post(
                    "/api/v1/analyses/analyze",
                    json={"owner": "facebook", "name": "react"},
                )
                assert ok.status_code == 202
                body = ok.json()
                assert body["analysis_id"] == str(analysis_id)
                assert body["status"] == "pending"
        finally:
            app.dependency_overrides.clear()

    async def test_get_analysis_and_csv_export(self):
        aid = uuid.uuid4()
        rid = uuid.uuid4()
        now = datetime(2025, 6, 10, 12, 0, tzinfo=UTC)
        analysis = Analysis(
            id=aid,
            repository_id=rid,
            status=AnalysisStatus.COMPLETED,
            total_commits=2,
            avg_commit_size=15.0,
            commits_per_day=1.0,
            commits_per_month=2.0,
            code_churn_additions=20,
            code_churn_deletions=10,
            avg_time_between_commits_hours=24.0,
            bus_factor=1,
            language_distribution={"Python": 100.0},
            health_score=80,
            health_coverage=65,
            health_breakdown={
                "activity": {
                    "label": "Activity",
                    "score": 80,
                    "weight": 25,
                    "weighted_points": 20.0,
                    "status": "measured",
                    "explanation": "ok",
                    "evidence": "2 commits",
                }
            },
            health_findings=[],
            progress_stage="Completed",
            created_at=now,
            completed_at=now,
        )
        commits = [
            CommitStats(
                analysis_id=aid,
                sha="111",
                author_name="=EVIL",
                author_email="a@x.com",
                committed_at=now,
            ),
            CommitStats(
                analysis_id=aid,
                sha="222",
                author_name="Alice",
                author_email="a@x.com",
                committed_at=now,
            ),
        ]
        contribs = [Contributor(analysis_id=aid, username="=EVIL", total_commits=2)]
        repo = SimpleNamespace(id=rid, owner="acme", name="demo", full_name="acme/demo")

        class FakeGetUC:
            async def execute(self, _aid):
                return {
                    "analysis": analysis,
                    "contributors": contribs,
                    "commits": commits,
                    "commits_count": 2,
                }

        app.dependency_overrides[get_analysis_detail_use_case] = lambda: FakeGetUC()
        app.dependency_overrides[get_db] = lambda: _FakeSession(repo=repo)
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                detail = await ac.get(f"/api/v1/analyses/{aid}")
                assert detail.status_code == 200
                data = detail.json()
                assert data["repository_full_name"] == "acme/demo"
                assert data["health"]["confidence"] in {"low", "medium", "high"}
                assert data["sample_scope"]["sampled_commits"] == 2

                csv_resp = await ac.get(f"/api/v1/analyses/{aid}/export.csv")
                assert csv_resp.status_code == 200
                text = csv_resp.text
                assert "https://github.com/acme/demo" in text
                assert "'=EVIL" in text
        finally:
            app.dependency_overrides.clear()


@pytest.mark.asyncio
class TestMockedPipelineE2E:
    async def test_analyze_pipeline_with_mocked_github_and_cache(self, monkeypatch):
        aid = str(uuid.uuid4())

        class FakeGH:
            def parse_commit(self, data, analysis_id):
                from app.infrastructure.external.github_client import GitHubClient

                return GitHubClient(token="dummy").parse_commit(data, analysis_id)

            async def get_repository(self, _o, _n):
                return {"default_branch": "main", "license": {"spdx_id": "MIT"}}

            async def get_commits(self, _o, _n, max_pages=5):
                return [{"sha": "abc1"}, {"sha": "abc2"}]

            async def get_languages(self, _o, _n):
                return {"Python": 1000}

            async def get_readme(self, _o, _n):
                return "# Demo\n## Install\npip install demo"

            async def get_repo_tree(self, _o, _n, branch="HEAD"):
                return ["README.md", "tests/test_app.py", ".github/workflows/ci.yml"]

            async def get_pull_requests(self, _o, _n):
                return [{"state": "open", "created_at": "2025-06-09T00:00:00Z"}]

            async def get_issues(self, _o, _n):
                return [
                    {
                        "state": "closed",
                        "created_at": "2025-06-08T00:00:00Z",
                        "closed_at": "2025-06-09T00:00:00Z",
                    }
                ]

            async def get_releases(self, _o, _n):
                return [
                    {
                        "tag_name": "v1.0.0",
                        "draft": False,
                        "published_at": "2025-06-09T00:00:00Z",
                    }
                ]

            async def get_workflow_runs(self, _o, _n):
                return [{"status": "completed", "conclusion": "success"}]

            async def get_branch_protection_status(self, _o, _n, _b):
                return "protected"

            async def get_commit_detail(self, _o, _n, sha):
                return {
                    "sha": sha,
                    "author": {"login": "alice-gh"},
                    "commit": {
                        "author": {
                            "name": "Alice",
                            "email": "alice@example.com",
                            "date": "2025-06-09T12:00:00Z",
                        },
                        "message": "feat: init",
                    },
                    "stats": {"additions": 10, "deletions": 2},
                    "files": [{"filename": "app.py"}],
                }

        class FakeCache:
            async def close(self):
                return None

        fake_gh = FakeGH()
        settings = type(
            "S",
            (),
            {
                "tokenharbor_api_key": "",
                "tokenharbor_base_url": "https://tokenharbor.ai/v1",
                "tokenharbor_model": "glm-5.3-flash",
                "gemini_api_key": "",
                "gemini_model": "gemini-1.5-flash",
            },
        )()
        monkeypatch.setattr("app.infrastructure.jobs.tasks.GitHubClient", lambda: fake_gh)
        monkeypatch.setattr("app.infrastructure.jobs.tasks.RedisCache", lambda: FakeCache())
        monkeypatch.setattr(
            "app.infrastructure.jobs.tasks.CachedGitHubClient", lambda _gh, _c: fake_gh
        )
        monkeypatch.setattr(
            "app.infrastructure.jobs.tasks._set_progress", lambda *_args, **_kw: None
        )
        monkeypatch.setattr(
            "app.infrastructure.external.gemini_client.get_settings", lambda: settings
        )

        result = await _analyze(aid, "acme", "demo", session=object())
        assert result["total_commits"] == 2
        assert result["bus_factor"] == 1
        assert result["health_score"] is not None
        assert result["extended_signals"]["governance"]["license"] == "MIT"
        assert result["ai_metadata"]["status"] == "demo"
