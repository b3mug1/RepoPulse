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


def _parse_iso_utc(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return to_utc(datetime.fromisoformat(raw.replace("Z", "+00:00")))
    except ValueError:
        return None


def compute_pr_metrics(pulls: Sequence[dict], now: datetime | None = None) -> dict:
    """Summarize sampled pull requests: open ratio, close time, open age, drafts."""
    ref = to_utc(now) if now is not None else datetime.now(timezone.utc)
    open_prs = [p for p in pulls if p.get("state") == "open"]
    closed_prs = [p for p in pulls if p.get("state") == "closed"]
    merged_prs = [p for p in closed_prs if p.get("merged_at")]

    close_hours: list[float] = []
    for p in closed_prs:
        created = _parse_iso_utc(p.get("created_at"))
        closed = _parse_iso_utc(p.get("closed_at"))
        if created and closed and closed >= created:
            close_hours.append((closed - created).total_seconds() / 3600)

    open_ages: list[float] = []
    for p in open_prs:
        created = _parse_iso_utc(p.get("created_at"))
        if created and ref >= created:
            open_ages.append((ref - created).total_seconds() / 3600)

    total = len(pulls)
    return {
        "sampled_count": total,
        "open_count": len(open_prs),
        "closed_count": len(closed_prs),
        "merged_count": len(merged_prs),
        "draft_count": sum(1 for p in open_prs if p.get("draft")),
        "open_ratio": round(len(open_prs) / total, 2) if total else None,
        "avg_time_to_close_hours": round(sum(close_hours) / len(close_hours), 1) if close_hours else None,
        "avg_open_age_hours": round(sum(open_ages) / len(open_ages), 1) if open_ages else None,
    }


def compute_issue_metrics(issues: Sequence[dict], now: datetime | None = None) -> dict:
    """Summarize sampled issues (excluding PRs): open/closed counts, open age, resolution time."""
    ref = to_utc(now) if now is not None else datetime.now(timezone.utc)
    pure_issues = [i for i in issues if "pull_request" not in i]
    open_issues = [i for i in pure_issues if i.get("state") == "open"]
    closed_issues = [i for i in pure_issues if i.get("state") == "closed"]

    resolve_hours: list[float] = []
    for i in closed_issues:
        created = _parse_iso_utc(i.get("created_at"))
        closed = _parse_iso_utc(i.get("closed_at"))
        if created and closed and closed >= created:
            resolve_hours.append((closed - created).total_seconds() / 3600)

    open_ages: list[float] = []
    for i in open_issues:
        created = _parse_iso_utc(i.get("created_at"))
        if created and ref >= created:
            open_ages.append((ref - created).total_seconds() / 3600)

    return {
        "sampled_count": len(pure_issues),
        "open_count": len(open_issues),
        "closed_count": len(closed_issues),
        "avg_open_age_hours": round(sum(open_ages) / len(open_ages), 1) if open_ages else None,
        "avg_time_to_close_hours": round(sum(resolve_hours) / len(resolve_hours), 1) if resolve_hours else None,
    }


def compute_release_metrics(releases: Sequence[dict]) -> dict:
    """Summarize sampled releases: count, latest tag, and average interval in days."""
    published = [r for r in releases if not r.get("draft")]
    dates = sorted(
        (d for r in published if (d := _parse_iso_utc(r.get("published_at") or r.get("created_at"))) is not None),
        reverse=True,
    )
    intervals: list[float] = [
        (dates[i] - dates[i + 1]).total_seconds() / 86_400
        for i in range(len(dates) - 1)
    ]
    latest = published[0] if published else None
    return {
        "sampled_count": len(published),
        "latest_tag": latest.get("tag_name") if latest else None,
        "latest_published_at": (latest.get("published_at") or latest.get("created_at")) if latest else None,
        "avg_days_between_releases": round(sum(intervals) / len(intervals), 1) if intervals else None,
    }


def compute_ci_signals(workflow_runs: Sequence[dict] | None, file_paths: Sequence[str] | None) -> dict:
    """Summarize CI config presence across providers and recent GitHub Actions run outcomes."""
    paths = [p.replace("\\", "/").lower() for p in file_paths or []]
    provider_markers = {
        "GitHub Actions": ".github/workflows/",
        "GitLab CI": "gitlab-ci.yml",
        "CircleCI": "circleci/config.yml",
        "Jenkins": "jenkinsfile",
        "Azure Pipelines": "azure-pipelines.yml",
        "Buildkite": "buildkite",
        "Bitbucket Pipelines": "bitbucket-pipelines.yml",
        "Travis CI": ".travis.yml",
        "Drone / Woodpecker": "woodpecker",
    }
    providers = [name for name, marker in provider_markers.items() if any(marker in p for p in paths)]

    completed = [r for r in (workflow_runs or []) if r.get("status") == "completed"]
    successes = [r for r in completed if r.get("conclusion") == "success"]
    latest_run = workflow_runs[0] if workflow_runs else None
    return {
        "providers_detected": providers,
        "actions_runs_sampled": len(workflow_runs) if workflow_runs is not None else None,
        "actions_success_rate": round(len(successes) / len(completed) * 100, 1) if completed else None,
        "latest_run_conclusion": latest_run.get("conclusion") if latest_run else None,
    }


def compute_governance_signals(
    repo_data: dict, file_paths: Sequence[str] | None, branch_protection: str
) -> dict:
    """Summarize license, branch protection, and CODEOWNERS presence."""
    license_info = repo_data.get("license") or {}
    license_spdx = license_info.get("spdx_id") if isinstance(license_info, dict) else None
    if license_spdx == "NOASSERTION":
        license_spdx = license_info.get("name")
    paths = {p.replace("\\", "/").lower().removeprefix("./") for p in file_paths or []}
    has_codeowners = (
        None if file_paths is None
        else any(p in {"codeowners", ".github/codeowners", "docs/codeowners"} for p in paths)
    )
    return {
        "license": license_spdx or None,
        "default_branch": repo_data.get("default_branch", "main"),
        "branch_protection": branch_protection,
        "has_codeowners": has_codeowners,
    }


def compute_activity_windows(commits: Sequence[CommitStats], now: datetime | None = None) -> dict:
    """Count sampled commits in 7d / 30d / 90d UTC windows and compute 30d trend."""
    ref = to_utc(now) if now is not None else datetime.now(timezone.utc)
    c_7 = 0
    c_30 = 0
    c_prev_30 = 0
    c_90 = 0
    for c in commits:
        age_days = (ref - to_utc(c.committed_at)).total_seconds() / 86_400
        if age_days < 0:
            continue
        if age_days <= 7:
            c_7 += 1
        if age_days <= 30:
            c_30 += 1
        elif age_days <= 60:
            c_prev_30 += 1
        if age_days <= 90:
            c_90 += 1

    if len(commits) < 2:
        trend = "insufficient_data"
    elif c_30 > c_prev_30:
        trend = "up"
    elif c_30 < c_prev_30:
        trend = "down"
    else:
        trend = "stable"

    return {
        "last_7_days": c_7,
        "last_30_days": c_30,
        "prev_30_days": c_prev_30,
        "last_90_days": c_90,
        "trend_30d": trend,
    }
