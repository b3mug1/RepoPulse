"""Unit tests for deep analytics: security hygiene, PR size/review, and SemVer/CHANGELOG."""

from datetime import UTC, datetime

from app.domain.services import (
    compute_pr_metrics,
    compute_release_metrics,
    compute_security_hygiene,
)


def test_security_hygiene_detection():
    res = compute_security_hygiene(
        [
            "SECURITY.md",
            ".github/dependabot.yml",
            "frontend/package.json",
            "frontend/package-lock.json",
            "backend/pyproject.toml",
            "backend/uv.lock",
        ]
    )
    assert res["has_security_policy"] is True
    assert res["dependency_automation"] == ["Dependabot"]
    assert res["lockfiles_detected"] == ["package-lock.json", "uv.lock"]
    assert res["manifests_detected"] == ["package.json", "pyproject.toml"]

    unknown = compute_security_hygiene(None)
    assert unknown["has_security_policy"] is None


def test_pr_sizes_and_review_metrics():
    now = datetime(2025, 6, 10, 12, 0, tzinfo=UTC)
    pulls = [
        {
            "number": 1,
            "state": "closed",
            "merged_at": "2025-06-09T18:00:00Z",
            "created_at": "2025-06-09T12:00:00Z",
            "closed_at": "2025-06-09T18:00:00Z",
        },
        {
            "number": 2,
            "state": "closed",
            "merged_at": "2025-06-09T16:00:00Z",
            "created_at": "2025-06-09T12:00:00Z",
            "closed_at": "2025-06-09T16:00:00Z",
        },
    ]
    details = [
        {"number": 1, "additions": 20, "deletions": 10},  # S
        {"number": 2, "additions": 300, "deletions": 100},  # L
    ]
    reviews = {
        1: [{"submitted_at": "2025-06-09T14:00:00Z"}],  # 2h
        2: [],  # unreviewed
    }
    res = compute_pr_metrics(pulls, pr_details=details, pr_reviews=reviews, now=now)
    assert res["size_distribution"] == {"S": 1, "M": 0, "L": 1, "XL": 0}
    assert res["avg_time_to_first_review_hours"] == 2.0
    assert res["unreviewed_merged_ratio"] == 0.5


def test_releases_semver_and_changelog():
    releases = [
        {"tag_name": "v1.2.0", "draft": False, "published_at": "2025-06-10T00:00:00Z"},
        {"tag_name": "release-2025", "draft": False, "published_at": "2025-06-01T00:00:00Z"},
    ]
    res = compute_release_metrics(releases, file_paths=["README.md", "CHANGELOG.md"])
    assert res["has_changelog"] is True
    assert res["semver_compliant_ratio"] == 0.5
