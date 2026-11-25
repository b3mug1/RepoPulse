"""
Unit tests for domain services (pure logic — no DB, no network).

These are the most valuable tests: fast, deterministic, and they
directly verify the core business rules.
"""

import uuid
from datetime import datetime, timedelta, timezone


from app.domain.entities import CommitStats, Contributor
from app.domain.services import (
    aggregate_contributors,
    calculate_bus_factor,
    calculate_repository_health,
    compute_activity_windows,
    compute_avg_commit_size,
    compute_avg_time_between_commits,
    compute_ci_signals,
    compute_code_churn,
    compute_commits_per_day,
    compute_commits_per_month,
    compute_governance_signals,
    compute_issue_metrics,
    compute_pr_metrics,
    compute_release_metrics,
)


# ── Fixtures ─────────────────────────────────────────────────────────────────

def _make_commit(
    additions: int = 10,
    deletions: int = 5,
    author_name: str = "Alice",
    author_email: str = "alice@example.com",
    author_login: str = "",
    committed_at: datetime | None = None,
) -> CommitStats:
    return CommitStats(
        id=uuid.uuid4(),
        analysis_id=uuid.uuid4(),
        sha="abc123",
        author_name=author_name,
        author_email=author_email,
        author_login=author_login,
        message="test commit",
        additions=additions,
        deletions=deletions,
        files_changed=2,
        committed_at=committed_at or datetime.utcnow(),
    )


def _make_contributor(total_commits: int = 10, username: str = "alice") -> Contributor:
    return Contributor(
        id=uuid.uuid4(),
        analysis_id=uuid.uuid4(),
        username=username,
        total_commits=total_commits,
    )


# ── Bus Factor ───────────────────────────────────────────────────────────────


class TestBusFactor:
    def test_empty_contributors(self):
        assert calculate_bus_factor([]) == 0

    def test_single_contributor(self):
        assert calculate_bus_factor([_make_contributor(100)]) == 1

    def test_bus_factor_one_dominant(self):
        """One person did 90% of commits → bus factor = 1."""
        contribs = [
            _make_contributor(90, "alice"),
            _make_contributor(5, "bob"),
            _make_contributor(5, "charlie"),
        ]
        assert calculate_bus_factor(contribs) == 1

    def test_bus_factor_balanced(self):
        """Four equally-contributing developers → needs 4 for 80%+."""
        contribs = [_make_contributor(25, f"dev{i}") for i in range(4)]
        # 25*4=100, need 80% → 3 devs get to 75%, 4th gets to 100%
        assert calculate_bus_factor(contribs) == 4

    def test_bus_factor_three_needed(self):
        contribs = [
            _make_contributor(40, "alice"),
            _make_contributor(30, "bob"),
            _make_contributor(20, "charlie"),
            _make_contributor(10, "dave"),
        ]
        # 40+30=70 < 80, 40+30+20=90 ≥ 80 → bus factor = 3
        assert calculate_bus_factor(contribs) == 3


# ── Code Churn ───────────────────────────────────────────────────────────────


class TestCodeChurn:
    def test_churn_basic(self):
        commits = [_make_commit(100, 20), _make_commit(50, 30)]
        adds, dels = compute_code_churn(commits)
        assert adds == 150
        assert dels == 50

    def test_churn_empty(self):
        assert compute_code_churn([]) == (0, 0)


# ── Average Commit Size ─────────────────────────────────────────────────────


class TestAvgCommitSize:
    def test_basic(self):
        commits = [_make_commit(10, 5), _make_commit(20, 10)]
        # (10+5 + 20+10) / 2 = 22.5
        assert compute_avg_commit_size(commits) == 22.5

    def test_empty(self):
        assert compute_avg_commit_size([]) == 0.0


# ── Average Time Between Commits ────────────────────────────────────────────


class TestAvgTimeBetweenCommits:
    def test_basic(self):
        now = datetime.utcnow()
        commits = [
            _make_commit(committed_at=now - timedelta(hours=4)),
            _make_commit(committed_at=now - timedelta(hours=2)),
            _make_commit(committed_at=now),
        ]
        avg = compute_avg_time_between_commits(commits)
        assert abs(avg - 2.0) < 0.01

    def test_single_commit(self):
        assert compute_avg_time_between_commits([_make_commit()]) == 0.0


# ── Commits Per Day / Month ─────────────────────────────────────────────────


class TestCommitsPerDay:
    def test_basic(self):
        now = datetime.utcnow()
        commits = [
            _make_commit(committed_at=now - timedelta(days=10)),
            _make_commit(committed_at=now),
        ]
        cpd = compute_commits_per_day(commits)
        assert abs(cpd - 0.2) < 0.01

    def test_per_month(self):
        now = datetime.utcnow()
        commits = [
            _make_commit(committed_at=now - timedelta(days=30)),
            _make_commit(committed_at=now),
        ]
        cpm = compute_commits_per_month(commits)
        assert abs(cpm - 2.0) < 0.01

    def test_per_month_uses_elapsed_window_not_calendar_month_count(self):
        commits = [
            _make_commit(committed_at=datetime(2025, 1, 31)),
            _make_commit(committed_at=datetime(2025, 2, 1)),
        ]
        assert compute_commits_per_month(commits) == 2.0


class TestRepositoryHealth:
    def test_missing_signals_are_unknown_and_score_is_normalized(self):
        score, components, findings, coverage = calculate_repository_health(
            commits_per_month=10,
            sampled_commit_count=10,
            bus_factor=2,
            contributor_count=4,
            readme_score=None,
            file_paths=None,
            latest_commit_at=datetime(2025, 6, 20, tzinfo=timezone.utc),
            now=datetime(2025, 6, 21, tzinfo=timezone.utc),
        )
        assert score is not None
        assert coverage == 45  # activity 25 + collaboration 20
        assert components["documentation"]["score"] is None
        assert components["testing"]["status"] == "unknown"
        assert components["automation"]["score"] is None
        assert any("concentrated" in item["title"].lower() for item in findings)

    def test_no_measurable_signals_has_no_numeric_score(self):
        score, components, _findings, coverage = calculate_repository_health(
            commits_per_month=0,
            sampled_commit_count=0,
            bus_factor=0,
            contributor_count=0,
            readme_score=None,
            file_paths=None,
            latest_commit_at=None,
        )
        assert score is None
        assert coverage == 0
        assert all(component["score"] is None for component in components.values())

    def test_test_paths_and_ci_providers_are_detected(self):
        score, components, _findings, coverage = calculate_repository_health(
            commits_per_month=5,
            sampled_commit_count=4,
            bus_factor=3,
            contributor_count=5,
            readme_score=8,
            file_paths=["src/app.ts", "backend/tests/test_api.py", ".gitlab-ci.yml"],
            latest_commit_at=datetime(2025, 6, 20, tzinfo=timezone.utc),
            now=datetime(2025, 6, 21, tzinfo=timezone.utc),
        )
        assert score is not None
        assert coverage == 100
        assert components["testing"]["score"] == 100
        assert components["automation"]["score"] == 100
        assert "test_api.py" in components["testing"]["evidence"]

    def test_absent_test_and_ci_paths_are_unknown_not_zero(self):
        score, components, findings, coverage = calculate_repository_health(
            commits_per_month=5,
            sampled_commit_count=4,
            bus_factor=3,
            contributor_count=5,
            readme_score=8,
            file_paths=["src/app.ts", "README.md"],
            latest_commit_at=datetime(2025, 6, 20, tzinfo=timezone.utc),
            now=datetime(2025, 6, 21, tzinfo=timezone.utc),
        )
        assert score is not None
        assert coverage == 65  # activity 25 + collaboration 20 + documentation 20
        assert components["testing"]["score"] is None
        assert components["testing"]["status"] == "unknown"
        assert components["automation"]["score"] is None
        assert components["automation"]["status"] == "unknown"
        assert any(f["severity"] == "low" and "test paths" in f["title"].lower() for f in findings)


# ── Aggregate Contributors ──────────────────────────────────────────────────


class TestAggregateContributors:
    def test_groups_by_email(self):
        aid = uuid.uuid4()
        commits = [
            _make_commit(author_name="Alice", author_email="a@x.com"),
            _make_commit(author_name="Alice", author_email="a@x.com"),
            _make_commit(author_name="Bob", author_email="b@x.com"),
        ]
        result = aggregate_contributors(commits, aid)
        assert len(result) == 2
        alice = next(c for c in result if c.username == "Alice")
        assert alice.total_commits == 2

    def test_groups_multiple_emails_by_stable_github_login(self):
        aid = uuid.uuid4()
        commits = [
            _make_commit(author_name="Alice", author_email="alice@work.com", author_login="alice-gh"),
            _make_commit(author_name="Alice M.", author_email="alice@personal.com", author_login="alice-gh"),
            _make_commit(author_name="Bob", author_email="bob@x.com", author_login="bob-gh"),
        ]
        result = aggregate_contributors(commits, aid)
        assert len(result) == 2
        alice = next(c for c in result if c.username == "alice-gh")
        assert alice.total_commits == 2

    def test_short_history_and_mixed_timezones(self):
        assert compute_commits_per_day([_make_commit()]) == 0.0
        tz_plus5 = timezone(timedelta(hours=5))
        commits = [
            _make_commit(committed_at=datetime(2025, 6, 1, 10, 0, tzinfo=timezone.utc)),
            _make_commit(committed_at=datetime(2025, 6, 3, 15, 0, tzinfo=tz_plus5)),
        ]
        # 2025-06-03 15:00+05:00 == 2025-06-03 10:00 UTC -> exactly 2.0 days
        assert compute_commits_per_day(commits) == 1.0


class TestExtendedGitHubSignals:
    def test_pr_and_issue_metrics(self):
        now = datetime(2025, 6, 10, 12, 0, tzinfo=timezone.utc)
        pulls = [
            {"state": "open", "draft": True, "created_at": "2025-06-09T12:00:00Z"},
            {"state": "closed", "merged_at": "2025-06-09T18:00:00Z", "created_at": "2025-06-09T12:00:00Z", "closed_at": "2025-06-09T18:00:00Z"},
        ]
        pr_res = compute_pr_metrics(pulls, now=now)
        assert pr_res["open_count"] == 1
        assert pr_res["merged_count"] == 1
        assert pr_res["avg_time_to_close_hours"] == 6.0
        assert pr_res["avg_open_age_hours"] == 24.0

        issues = [
            {"state": "open", "created_at": "2025-06-09T12:00:00Z"},
            {"state": "closed", "pull_request": {"url": "..."}, "created_at": "2025-06-01T00:00:00Z", "closed_at": "2025-06-02T00:00:00Z"},
        ]
        issue_res = compute_issue_metrics(issues, now=now)
        assert issue_res["sampled_count"] == 1
        assert issue_res["open_count"] == 1

    def test_releases_ci_governance_and_windows(self):
        releases = [
            {"tag_name": "v1.1.0", "draft": False, "published_at": "2025-06-10T00:00:00Z"},
            {"tag_name": "v1.0.0", "draft": False, "published_at": "2025-06-01T00:00:00Z"},
        ]
        rel = compute_release_metrics(releases)
        assert rel["latest_tag"] == "v1.1.0"
        assert rel["avg_days_between_releases"] == 9.0

        ci = compute_ci_signals(
            [{"status": "completed", "conclusion": "success"}, {"status": "completed", "conclusion": "failure"}],
            [".github/workflows/ci.yml", ".gitlab-ci.yml"],
        )
        assert "GitHub Actions" in ci["providers_detected"]
        assert "GitLab CI" in ci["providers_detected"]
        assert ci["actions_success_rate"] == 50.0

        gov = compute_governance_signals({"license": {"spdx_id": "MIT"}, "default_branch": "main"}, [".github/CODEOWNERS"], "protected")
        assert gov["license"] == "MIT"
        assert gov["has_codeowners"] is True
        assert gov["branch_protection"] == "protected"

        now = datetime(2025, 6, 10, 12, 0, tzinfo=timezone.utc)
        win = compute_activity_windows([
            _make_commit(committed_at=now - timedelta(days=2)),
            _make_commit(committed_at=now - timedelta(days=20)),
            _make_commit(committed_at=now - timedelta(days=45)),
        ], now=now)
        assert win["last_7_days"] == 1
        assert win["last_30_days"] == 2
        assert win["last_90_days"] == 3
        assert win["trend_30d"] == "up"
