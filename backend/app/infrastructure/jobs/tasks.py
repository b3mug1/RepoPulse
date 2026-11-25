"""
Celery tasks — the actual background work.

Design decisions
────────────────
• Each task is a *thin wrapper* that sets up a sync DB session (Celery
  workers are synchronous) and delegates to the analysis pipeline.
• We use asyncio.run() inside the task because our GitHub client and
  Gemini client are async. This is a pragmatic choice that avoids
  running a separate async Celery worker.
• The task updates Analysis status at every major phase so the frontend
  can show progress.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

import structlog
from sqlalchemy import create_engine, delete
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.core.exceptions import ExternalServiceError
from app.domain.entities import AnalysisStatus, CommitStats
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
from app.infrastructure.database.models import (
    AnalysisModel,
    CommitStatsModel,
    ContributorModel,
)
from app.infrastructure.external.gemini_client import GeminiClient
from app.infrastructure.external.github_client import GitHubClient
from app.infrastructure.cache.redis_cache import RedisCache, CachedGitHubClient
from app.infrastructure.jobs.celery_app import celery_app

logger = structlog.get_logger(__name__)


def _safe_error_message(exc: Exception) -> str:
    if isinstance(exc, ExternalServiceError):
        detail = str(exc).lower()
        if "not found" in detail:
            return "Repository not found or not accessible. Check the owner and name."
        if "rate limit" in detail:
            return "GitHub is temporarily limiting requests. Please retry later."
        if "authentication" in detail:
            return "GitHub authentication failed. Ask the administrator to check the configured token."
        if "network" in detail or "timeout" in detail:
            return "GitHub could not be reached. Please retry."
        return "A GitHub service error prevented the analysis. Please retry."
    return "The repository could not be analyzed because of an unexpected internal error."


def _get_sync_session() -> Session:
    settings = get_settings()
    engine = create_engine(settings.sync_database_url, pool_pre_ping=True)
    factory = sessionmaker(bind=engine)
    return factory()


@celery_app.task(bind=True, max_retries=2, default_retry_delay=30)
def run_analysis_task(self, analysis_id: str, owner: str, name: str) -> dict:
    """
    Main background job: fetch commits, compute metrics, run AI analysis.

    Returns a summary dict for Celery result backend inspection.
    """
    logger.info("Starting analysis task", analysis_id=analysis_id, repo=f"{owner}/{name}")
    session = _get_sync_session()

    try:
        # Mark IN_PROGRESS
        _update_status(session, analysis_id, AnalysisStatus.IN_PROGRESS)

        # ── Run the async pipeline in a one-shot event loop ──
        result = asyncio.run(_analyze(analysis_id, owner, name, session))

        # ── Persist results ──────────────────────────────────
        _save_results(session, analysis_id, result)
        _update_status(session, analysis_id, AnalysisStatus.COMPLETED)

        logger.info("Analysis completed", analysis_id=analysis_id)
        return {"status": "completed", "analysis_id": analysis_id}

    except Exception as exc:
        logger.error("Analysis failed", analysis_id=analysis_id, error=str(exc), exc_info=True)
        retryable = isinstance(exc, ExternalServiceError)
        detail = str(exc).lower()
        retryable = retryable and not any(term in detail for term in ("not found", "authentication", "forbidden", "rejected"))
        if retryable and self.request.retries < self.max_retries:
            _set_progress(session, analysis_id, f"Retrying ({self.request.retries + 1}/{self.max_retries})")
            raise self.retry(exc=exc)

        user_message = _safe_error_message(exc)
        _update_status(session, analysis_id, AnalysisStatus.FAILED, user_message)
        return {"status": "failed", "analysis_id": analysis_id, "error": user_message}

    finally:
        session.close()


async def _analyze(analysis_id: str, owner: str, name: str, session: Session) -> dict:
    """
    Async pipeline:
    1. Fetch commits + details (with caching)
    2. Compute metrics
    3. AI analysis
    """
    aid = uuid.UUID(analysis_id)

    gh_raw = GitHubClient()
    cache = RedisCache()
    gh = CachedGitHubClient(gh_raw, cache)
    gemini = GeminiClient()

    _set_progress(session, analysis_id, "Fetching GitHub data")
    # ── Step 1: Fetch data ───────────────────────────────────────────────
    repo_data, commits_list, languages_raw, readme, file_paths, pulls, issues, releases, workflow_runs = await asyncio.gather(
        gh.get_repository(owner, name),
        gh.get_commits(owner, name, max_pages=5),
        gh.get_languages(owner, name),
        gh.get_readme(owner, name),
        gh.get_repo_tree(owner, name),
        gh.get_pull_requests(owner, name),
        gh.get_issues(owner, name),
        gh.get_releases(owner, name),
        gh.get_workflow_runs(owner, name),
    )
    default_branch = repo_data.get("default_branch", "main") if isinstance(repo_data, dict) else "main"
    branch_protection = await gh.get_branch_protection_status(owner, name, default_branch)

    # Fetch detail for each commit (concurrent batches to avoid rate limits)
    commit_entities: list[CommitStats] = []
    shas = [c.get("sha", "") for c in commits_list[:100] if c.get("sha")]

    # Fetch in batches of 10 concurrently
    import asyncio
    BATCH_SIZE = 10
    for i in range(0, len(shas), BATCH_SIZE):
        _set_progress(session, analysis_id, f"Loading commit details ({min(i + BATCH_SIZE, len(shas))}/{len(shas)})")
        batch = shas[i : i + BATCH_SIZE]
        details = await asyncio.gather(
            *(gh.get_commit_detail(owner, name, sha) for sha in batch)
        )
        for detail in details:
            commit_entities.append(gh_raw.parse_commit(detail, aid))

    _set_progress(session, analysis_id, "Calculating repository metrics")
    # ── Step 2: Compute metrics ──────────────────────────────────────────
    additions, deletions = compute_code_churn(commit_entities)
    contributors = aggregate_contributors(commit_entities, aid)

    total_bytes = sum(languages_raw.values()) or 1
    language_distribution = {
        lang: round(bytes_ / total_bytes * 100, 2) for lang, bytes_ in languages_raw.items()
    }

    metrics = {
        "total_commits": len(commit_entities),
        "avg_commit_size": compute_avg_commit_size(commit_entities),
        "commits_per_day": compute_commits_per_day(commit_entities),
        "commits_per_month": compute_commits_per_month(commit_entities),
        "code_churn_additions": additions,
        "code_churn_deletions": deletions,
        "avg_time_between_commits_hours": compute_avg_time_between_commits(commit_entities),
        "bus_factor": calculate_bus_factor(contributors),
        "language_distribution": language_distribution,
    }
    latest_commit_at = max((item.committed_at for item in commit_entities), default=None)
    health_score, health_breakdown, health_findings, health_coverage = calculate_repository_health(
        commits_per_month=metrics["commits_per_month"],
        sampled_commit_count=len(commit_entities),
        bus_factor=metrics["bus_factor"],
        contributor_count=len(contributors),
        readme_score=None,
        file_paths=file_paths,
        latest_commit_at=latest_commit_at,
    )

    # ── Step 3: AI analysis — single consolidated call (1 API request) ──
    ai_results = {
        "ai_summary": None,
        "readme_quality_score": None,
        "readme_quality_feedback": None,
        "detected_tech_stack": [],
        "architecture_analysis": None,
    }
    _set_progress(session, analysis_id, "Generating AI insights")
    try:
        ai_results = await gemini.analyze_repository(
            f"{owner}/{name}", None, language_distribution, file_paths or [], readme
        )
        health_score, health_breakdown, health_findings, health_coverage = calculate_repository_health(
            commits_per_month=metrics["commits_per_month"],
            sampled_commit_count=len(commit_entities),
            bus_factor=metrics["bus_factor"],
            contributor_count=len(contributors),
            readme_score=ai_results.get("readme_quality_score"),
            file_paths=file_paths,
            latest_commit_at=latest_commit_at,
        )
    except Exception as ai_err:
        logger.warning("AI analysis skipped (non-fatal)", error=str(ai_err))

    extended_signals = {
        "pull_requests": compute_pr_metrics(pulls),
        "issues": compute_issue_metrics(issues),
        "releases": compute_release_metrics(releases),
        "ci": compute_ci_signals(workflow_runs, file_paths),
        "governance": compute_governance_signals(repo_data if isinstance(repo_data, dict) else {}, file_paths, branch_protection),
        "activity_windows": compute_activity_windows(commit_entities),
        "data_refreshed_at": datetime.now(timezone.utc).isoformat(),
    }

    await cache.close()

    return {
        **metrics,
        **ai_results,
        "health_score": health_score,
        "health_coverage": health_coverage,
        "health_breakdown": health_breakdown,
        "health_findings": health_findings,
        "extended_signals": extended_signals,
        "commit_entities": commit_entities,
        "contributors": contributors,
    }


# ── DB helpers (synchronous, for Celery worker) ─────────────────────────────


def _update_status(
    session: Session, analysis_id: str, status: AnalysisStatus,
    error_message: str | None = None,
) -> None:
    analysis = session.get(AnalysisModel, uuid.UUID(analysis_id))
    if analysis:
        analysis.status = status.value
        if error_message:
            analysis.error_message = error_message
        if status == AnalysisStatus.COMPLETED:
            analysis.completed_at = datetime.utcnow()
            analysis.progress_stage = "Completed"
        elif status == AnalysisStatus.FAILED:
            analysis.progress_stage = "Failed"
        session.commit()


def _set_progress(session: Session, analysis_id: str, stage: str) -> None:
    analysis = session.get(AnalysisModel, uuid.UUID(analysis_id))
    if analysis:
        analysis.progress_stage = stage
        session.commit()


def _save_results(session: Session, analysis_id: str, result: dict) -> None:
    aid = uuid.UUID(analysis_id)
    analysis = session.get(AnalysisModel, aid)
    if not analysis:
        return

    # Metrics
    analysis.total_commits = result["total_commits"]
    analysis.avg_commit_size = result["avg_commit_size"]
    analysis.commits_per_day = result["commits_per_day"]
    analysis.commits_per_month = result["commits_per_month"]
    analysis.code_churn_additions = result["code_churn_additions"]
    analysis.code_churn_deletions = result["code_churn_deletions"]
    analysis.avg_time_between_commits_hours = result["avg_time_between_commits_hours"]
    analysis.bus_factor = result["bus_factor"]
    analysis.language_distribution = result["language_distribution"]
    analysis.health_score = result["health_score"]
    analysis.health_coverage = result["health_coverage"]
    analysis.health_breakdown = result["health_breakdown"]
    analysis.health_findings = result["health_findings"]
    analysis.extended_signals = result.get("extended_signals", {})

    # AI
    analysis.ai_summary = result["ai_summary"]
    analysis.readme_quality_score = result["readme_quality_score"]
    analysis.readme_quality_feedback = result["readme_quality_feedback"]
    analysis.detected_tech_stack = result["detected_tech_stack"]
    analysis.architecture_analysis = result["architecture_analysis"]

    # Commit stats and contributors are replaced, never appended on reruns.
    session.execute(delete(CommitStatsModel).where(CommitStatsModel.analysis_id == aid))
    session.execute(delete(ContributorModel).where(ContributorModel.analysis_id == aid))
    for c in result.get("commit_entities", []):
        model = CommitStatsModel(
            id=c.id, analysis_id=aid, sha=c.sha,
            author_name=c.author_name, author_email=c.author_email,
            message=c.message, additions=c.additions, deletions=c.deletions,
            files_changed=c.files_changed, committed_at=c.committed_at,
        )
        session.add(model)

    # Contributors
    for contrib in result.get("contributors", []):
        model = ContributorModel(
            id=contrib.id, analysis_id=aid, username=contrib.username,
            avatar_url=contrib.avatar_url, total_commits=contrib.total_commits,
            additions=contrib.additions, deletions=contrib.deletions,
            first_commit_at=contrib.first_commit_at,
            last_commit_at=contrib.last_commit_at,
        )
        session.add(model)

    session.commit()
