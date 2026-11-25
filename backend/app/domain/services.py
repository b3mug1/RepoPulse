"""
Domain services — pure business logic that doesn't belong to a single entity.
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from typing import Sequence

from app.domain.entities import CommitStats, Contributor

HEALTH_FORMULA_VERSION = "1.1"


def to_utc(dt: datetime) -> datetime:
    """Normalize a datetime to timezone-aware UTC."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def calculate_health_confidence(coverage: int, sampled_commit_count: int) -> str:
    """Estimate confidence level of Health Score from signal coverage and sample size."""
    if coverage >= 80 and sampled_commit_count >= 20:
        return "high"
    if coverage >= 45 and sampled_commit_count >= 5:
        return "medium"
    return "low"


def calculate_bus_factor(contributors: Sequence[Contributor], threshold: float = 0.8) -> int:
    """
    Bus factor = minimum number of contributors whose combined commits
    account for ≥ *threshold* (default 80 %) of total commits.

    If a single person wrote 80 %+ of the code, bus factor = 1.
    An empty repo returns bus factor = 0.

    Algorithm: sort contributors by commit count descending, accumulate
    until the running total crosses the threshold.
    """
    if not contributors:
        return 0

    total = sum(c.total_commits for c in contributors)
    if total == 0:
        return 0

    sorted_contributors = sorted(contributors, key=lambda c: c.total_commits, reverse=True)
    cumulative = 0
    for i, contrib in enumerate(sorted_contributors, start=1):
        cumulative += contrib.total_commits
        if cumulative / total >= threshold:
            return i

    return len(sorted_contributors)


def compute_code_churn(commits: Sequence[CommitStats]) -> tuple[int, int]:
    """Return (total_additions, total_deletions)."""
    additions = sum(c.additions for c in commits)
    deletions = sum(c.deletions for c in commits)
    return additions, deletions


def compute_avg_commit_size(commits: Sequence[CommitStats]) -> float:
    if not commits:
        return 0.0
    total_changes = sum(c.additions + c.deletions for c in commits)
    return total_changes / len(commits)


def compute_avg_time_between_commits(commits: Sequence[CommitStats]) -> float:
    """Average hours between consecutive commits. Returns 0.0 for < 2 commits."""
    if len(commits) < 2:
        return 0.0

    sorted_dates = sorted(to_utc(c.committed_at) for c in commits)
    deltas = [
        (sorted_dates[i + 1] - sorted_dates[i]).total_seconds() / 3600
        for i in range(len(sorted_dates) - 1)
    ]
    return sum(deltas) / len(deltas) if deltas else 0.0


def compute_commits_per_day(commits: Sequence[CommitStats]) -> float:
    """Average commits per day over the sampled window (min 1-day denominator).

    Returns 0.0 when fewer than 2 commits are available so a single commit
    is not extrapolated into a daily rate.
    """
    if len(commits) < 2:
        return 0.0
    dates = [to_utc(c.committed_at) for c in commits]
    span_days = max((max(dates) - min(dates)).total_seconds() / 86_400, 1)
    return round(len(commits) / span_days, 2)


def compute_commits_per_month(commits: Sequence[CommitStats]) -> float:
    """Estimate commits per 30 days across the sampled commit date range.

    Short histories (< 30 days) use a 30-day floor so brief bursts are not
    extrapolated into inflated monthly rates. Returns 0.0 for < 2 commits.
    """
    if len(commits) < 2:
        return 0.0
    dates = [to_utc(c.committed_at) for c in commits]
    observed_days = (max(dates) - min(dates)).total_seconds() / 86_400
    return round(len(commits) * 30 / max(observed_days, 30), 2)


def aggregate_contributors(commits: Sequence[CommitStats], analysis_id) -> list[Contributor]:
    """Build contributor summary from raw commit data using a stable author key."""
    from collections import defaultdict
    import uuid

    contrib_map: dict[str, dict] = defaultdict(lambda: {
        "total_commits": 0,
        "additions": 0,
        "deletions": 0,
        "dates": [],
    })

    for c in commits:
        login = (c.author_login or "").strip().lower()
        email = (c.author_email or "").strip().lower()
        name = (c.author_name or "").strip().lower()
        if login:
            key = f"gh:{login}"
        elif email:
            key = f"email:{email}"
        elif name:
            key = f"name:{name}"
        else:
            key = "unknown"

        contrib_map[key]["total_commits"] += 1
        contrib_map[key]["additions"] += c.additions
        contrib_map[key]["deletions"] += c.deletions
        contrib_map[key]["dates"].append(to_utc(c.committed_at))
        if "name" not in contrib_map[key]:
            contrib_map[key]["name"] = c.author_login or c.author_name or "unknown"

    result: list[Contributor] = []
    for _key, data in contrib_map.items():
        dates = sorted(data["dates"])
        result.append(
            Contributor(
                id=uuid.uuid4(),
                analysis_id=analysis_id,
                username=data["name"],
                total_commits=data["total_commits"],
                additions=data["additions"],
                deletions=data["deletions"],
                first_commit_at=dates[0] if dates else None,
                last_commit_at=dates[-1] if dates else None,
            )
        )
    return result


def calculate_repository_health(
    *,
    commits_per_month: float,
    sampled_commit_count: int,
    bus_factor: int,
    contributor_count: int,
    readme_score: float | None,
    file_paths: Sequence[str] | None,
    latest_commit_at: datetime | None,
    now: datetime | None = None,
) -> tuple[int | None, dict[str, dict], list[dict[str, str]], int]:
    """Return a transparent score, component evidence, and actionable findings.

    The score is normalized over available signals. Unknown signals do not count as
    zero; coverage reports how much of the configured 100% weighting is measured.
    """
    weights = {
        "activity": 25,
        "collaboration": 20,
        "documentation": 20,
        "testing": 20,
        "automation": 15,
    }
    paths = {path.replace("\\", "/").lower().lstrip("./") for path in file_paths or []}
    components: dict[str, dict] = {}

    def add_component(key: str, score: int | None, explanation: str, evidence: str) -> None:
        weight = weights[key]
        components[key] = {
            "label": key.replace("_", " ").title(),
            "score": score,
            "weight": weight,
            "weighted_points": round((score or 0) * weight / 100, 2) if score is not None else None,
            "status": "measured" if score is not None else "unknown",
            "explanation": explanation,
            "evidence": evidence,
        }

    if sampled_commit_count >= 2 and latest_commit_at is not None:
        volume_score = min(100, round(max(commits_per_month, 0) / 20 * 100))
        latest_utc = to_utc(latest_commit_at)
        reference = to_utc(now) if now is not None else datetime.now(timezone.utc)
        age_days = max((reference - latest_utc).total_seconds() / 86_400, 0)
        recency_score = (
            100 if age_days <= 14 else
            80 if age_days <= 30 else
            60 if age_days <= 90 else
            35 if age_days <= 180 else
            10 if age_days <= 365 else 0
        )
        activity_score = round(volume_score * 0.7 + recency_score * 0.3)
        add_component(
            "activity",
            activity_score,
            "70% is the estimated commit rate (20 commits per 30 days maps to 100); 30% is recency. This is based only on the sampled commits.",
            f"{sampled_commit_count} sampled commits; estimated {commits_per_month:.2f} commits per 30 days; latest sampled commit {age_days:.0f} days ago.",
        )
    else:
        add_component("activity", None, "At least two dated commits are needed to estimate activity.", f"{sampled_commit_count} dated commits available.")

    if contributor_count > 0 and bus_factor > 0:
        collaboration_score = min(100, 20 + (min(bus_factor, 5) - 1) * 20)
        add_component(
            "collaboration",
            collaboration_score,
            "Based on the number of sampled contributors needed to account for 80% of commits; it does not measure individual performance.",
            f"{contributor_count} sampled contributors; bus factor {bus_factor}.",
        )
    else:
        add_component("collaboration", None, "No attributable commits were available to estimate contributor concentration.", "Contributor sample is empty.")

    if readme_score is not None:
        normalized_readme = max(0, min(float(readme_score), 10))
        add_component("documentation", round(normalized_readme * 10), "README quality is an AI estimate on a 0–10 scale, converted to 0–100.", f"AI README score: {normalized_readme:.1f}/10.")
    else:
        add_component("documentation", None, "README quality was not measured; unavailable AI output is not treated as a zero score.", "No valid README quality score was returned.")

    if file_paths is None:
        add_component("testing", None, "Repository tree could not be inspected, so test-file presence is unknown.", "GitHub tree data unavailable.")
        add_component("automation", None, "Repository tree could not be inspected, so CI configuration presence is unknown.", "GitHub tree data unavailable.")
    else:
        test_patterns = (
            "/tests/", "/test/", "/spec/", "/specs/", "/__tests__/", "/e2e/", "/integration/",
        )
        test_files = [
            path for path in paths
            if any(pattern in f"/{path}/" for pattern in test_patterns)
            or path.endswith((
                "_test.py", ".test.ts", ".test.tsx", ".test.js", ".test.jsx",
                ".spec.ts", ".spec.tsx", ".spec.js", ".spec.jsx",
                "pytest.ini", "jest.config.js", "jest.config.ts", "vitest.config.ts", "vitest.config.js",
            ))
        ]
        add_component(
            "testing",
            100 if test_files else None,
            (
                "Looks for common test/spec directories and filename conventions; this does not verify that tests pass or provide coverage."
                if test_files
                else "No common test/spec paths were detected; absence of matching filenames does not prove tests are absent."
            ),
            f"Detected {len(test_files)} matching test paths among {len(paths)} tree paths." + (f" Examples: {', '.join(test_files[:3])}." if test_files else ""),
        )

        ci_patterns = (
            "github/workflows/", "gitlab-ci.yml", "circleci/config.yml",
            "jenkinsfile", "azure-pipelines.yml", "buildkite.yml", "buildkite/",
            "bitbucket-pipelines.yml", ".travis.yml", ".drone.yml", "woodpecker.yml", ".woodpecker/",
        )
        ci_files = [path for path in paths if any(pattern in path for pattern in ci_patterns)]
        add_component(
            "automation",
            100 if ci_files else None,
            (
                "Looks for common CI configuration paths across multiple providers; presence does not mean workflows are enabled or passing."
                if ci_files
                else "No common CI configuration paths were detected; CI may run externally or in a parent monorepo."
            ),
            f"Detected {len(ci_files)} matching CI paths among {len(paths)} tree paths." + (f" Examples: {', '.join(ci_files[:3])}." if ci_files else ""),
        )

    available_weight = sum(item["weight"] for item in components.values() if item["score"] is not None)
    score = (
        round(sum(item["weighted_points"] or 0 for item in components.values()) * 100 / available_weight)
        if available_weight else None
    )
    findings: list[dict[str, str]] = []

    def add(severity: str, title: str, detail: str) -> None:
        findings.append({"severity": severity, "title": title, "detail": detail})

    if contributor_count and bus_factor == 1:
        add("high", "Concentrated commit ownership", "One sampled contributor accounts for at least 80% of sampled commits. This is a continuity signal, not a developer performance judgment.")
    elif contributor_count and bus_factor == 2:
        add("medium", "Ownership concentrated in two contributors", "Two sampled contributors account for at least 80% of sampled commits.")
    testing = components["testing"]
    if testing["status"] == "unknown" and file_paths is not None:
        add("low", "No common test paths detected", testing["evidence"])
    automation = components["automation"]
    if automation["status"] == "unknown" and file_paths is not None:
        add("low", "No common CI configuration detected", automation["evidence"])
    if latest_commit_at and sampled_commit_count >= 2:
        latest_utc = to_utc(latest_commit_at)
        reference = to_utc(now) if now is not None else datetime.now(timezone.utc)
        age_days = max((reference - latest_utc).total_seconds() / 86_400, 0)
        if age_days > 90:
            add("medium", "Recent activity is limited", f"The latest sampled commit is {age_days:.0f} days old; project activity may happen outside the sampled window.")
    if not findings:
        add("low", "No major issues detected in available signals", "This is a heuristic snapshot, not a full code, security, or quality audit.")
    return score, components, findings, available_weight
