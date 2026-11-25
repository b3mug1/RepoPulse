"""
API router: Analysis endpoints.

All routes are prefixed with /api/v1 in the main app.
"""

from __future__ import annotations

import uuid
import csv
import secrets
from datetime import datetime, timedelta, timezone
from io import StringIO

from fastapi import APIRouter, Depends, Query, Request, HTTPException
from fastapi.responses import Response

from app.api.dependencies import (
    get_analysis_detail_use_case,
    get_analyze_use_case,
    get_list_analyses_use_case,
)
from app.api.rate_limit import limiter
from collections import Counter

from app.api.schemas import (
    AIInsightsOut,
    AnalysisComparisonOut,
    AnalysisDetailOut,
    AnalysisHistoryItemOut,
    AnalysisHistoryPageOut,
    AnalysisListItem,
    AnalyzeRequest,
    AnalyzeResponse,
    ComparisonDeltaOut,
    ContributorOut,
    DailyCommit,
    ErrorResponse,
    MetricsOut,
    ShareLinkCreateRequest,
    ShareLinkOut,
)
from app.domain.services import (
    HEALTH_FORMULA_VERSION,
    calculate_health_confidence,
    to_utc,
)
from app.usecases.analyze_repository import AnalyzeRepoRequest, AnalyzeRepositoryUseCase
from app.usecases.get_analysis import GetAnalysisUseCase, ListAnalysesUseCase
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, update
from app.infrastructure.database.session import get_db
from app.infrastructure.database.models import AnalysisModel, RepositoryModel, ShareLinkModel
from app.infrastructure.jobs.celery_app import celery_app

router = APIRouter(prefix="/analyses", tags=["Analyses"])


# ── POST /analyze ────────────────────────────────────────────────────────────


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    status_code=202,
    responses={422: {"model": ErrorResponse}, 429: {"description": "Rate limit exceeded"}},
    summary="Trigger repository analysis",
    description=(
        "Accepts a GitHub owner/name pair, creates a background analysis job, "
        "and returns immediately with an analysis ID to poll."
    ),
)
@limiter.limit("10/minute")
async def analyze_repository(
    request: Request,
    body: AnalyzeRequest,
    use_case: AnalyzeRepositoryUseCase = Depends(get_analyze_use_case),
) -> AnalyzeResponse:
    result = await use_case.execute(
        AnalyzeRepoRequest(owner=body.owner, name=body.name)
    )
    return AnalyzeResponse(
        analysis_id=result.analysis_id,
        repository_id=result.repository_id,
        status=result.status,
    )


def _csv_safe(value: object) -> str:
    """Escape values to prevent CSV formula injection in spreadsheet apps."""
    if value is None:
        return ""
    text = str(value)
    if text and text[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{text}"
    return text


def _build_analysis_detail(
    data: dict,
    repository: RepositoryModel | None,
    *,
    include_ai: bool = True,
    include_contributors: bool = True,
) -> AnalysisDetailOut:
    analysis = data["analysis"]
    contributors = data["contributors"] if include_contributors else []
    commits = data["commits"]

    utc_dates = [to_utc(c.committed_at) for c in commits if c.committed_at]
    date_counts = Counter(dt.date().isoformat() for dt in utc_dates)
    commits_per_date = sorted(
        [DailyCommit(date=d, commits=n) for d, n in date_counts.items()],
        key=lambda x: x.date,
    )
    sampled_count = data["commits_count"]
    confidence = calculate_health_confidence(analysis.health_coverage, analysis.total_commits)

    return AnalysisDetailOut(
        id=analysis.id,
        repository_id=analysis.repository_id,
        repository_full_name=repository.full_name if repository else "",
        repository_owner=repository.owner if repository else "",
        repository_name=repository.name if repository else "",
        status=analysis.status.value if hasattr(analysis.status, "value") else analysis.status,
        progress_stage=analysis.progress_stage,
        health={
            "score": analysis.health_score if analysis.health_coverage else None,
            "coverage": analysis.health_coverage,
            "confidence": confidence,
            "grade": "Insufficient data" if not analysis.health_coverage else "Excellent" if analysis.health_score >= 80 else "Healthy" if analysis.health_score >= 60 else "Needs attention" if analysis.health_score >= 40 else "At risk",
            "formula_version": HEALTH_FORMULA_VERSION,
            "breakdown": analysis.health_breakdown,
            "findings": analysis.health_findings,
        },
        sample_scope={
            "sampled_commits": sampled_count,
            "max_commits_limit": 100,
            "max_pages_limit": 5,
            "is_truncated": sampled_count >= 100,
            "window_start_at": min(utc_dates) if utc_dates else None,
            "window_end_at": max(utc_dates) if utc_dates else None,
            "timezone": "UTC",
        },
        extended_signals=analysis.extended_signals or {},
        error_message=analysis.error_message,
        metrics=MetricsOut(
            total_commits=analysis.total_commits,
            avg_commit_size=analysis.avg_commit_size,
            commits_per_day=analysis.commits_per_day,
            commits_per_month=analysis.commits_per_month,
            code_churn_additions=analysis.code_churn_additions,
            code_churn_deletions=analysis.code_churn_deletions,
            avg_time_between_commits_hours=analysis.avg_time_between_commits_hours,
            bus_factor=analysis.bus_factor,
            language_distribution=analysis.language_distribution,
            commits_per_date=commits_per_date,
        ),
        ai_insights=AIInsightsOut(
            ai_summary=analysis.ai_summary if include_ai else None,
            readme_quality_score=analysis.readme_quality_score if include_ai else None,
            readme_quality_feedback=analysis.readme_quality_feedback if include_ai else None,
            detected_tech_stack=analysis.detected_tech_stack if include_ai else [],
            architecture_analysis=analysis.architecture_analysis if include_ai else None,
            ai_metadata=analysis.ai_metadata if include_ai else {},
        ),
        contributors=[
            ContributorOut(
                username=c.username,
                total_commits=c.total_commits,
                additions=c.additions,
                deletions=c.deletions,
                first_commit_at=c.first_commit_at,
                last_commit_at=c.last_commit_at,
            )
            for c in contributors
        ],
        commits_count=sampled_count,
        created_at=analysis.created_at,
        completed_at=analysis.completed_at,
    )


# ── GET /analyses/history ────────────────────────────────────────────────────


@router.get(
    "/history",
    response_model=AnalysisHistoryPageOut,
    summary="List all analyses with filters, sorting, and pagination",
)
async def list_analysis_history(
    repository_id: uuid.UUID | None = Query(None),
    status: str | None = Query(None, pattern="^(pending|in_progress|completed|failed|cancelled)$"),
    search: str | None = Query(None, max_length=120),
    sort_by: str = Query("created_at", pattern="^(created_at|health_score|total_commits)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_db),
) -> AnalysisHistoryPageOut:
    filters = []
    if repository_id is not None:
        filters.append(AnalysisModel.repository_id == repository_id)
    if status is not None:
        filters.append(AnalysisModel.status == status)
    if search and search.strip():
        filters.append(RepositoryModel.full_name.ilike(f"%{search.strip()}%"))

    sort_col = {
        "created_at": AnalysisModel.created_at,
        "health_score": AnalysisModel.health_score,
        "total_commits": AnalysisModel.total_commits,
    }[sort_by]
    order_expr = sort_col.asc().nulls_last() if sort_order == "asc" else sort_col.desc().nulls_last()

    count_stmt = (
        select(func.count(AnalysisModel.id))
        .select_from(AnalysisModel)
        .join(RepositoryModel, AnalysisModel.repository_id == RepositoryModel.id)
        .where(*filters)
    )
    total = int((await session.execute(count_stmt)).scalar_one() or 0)

    stmt = (
        select(AnalysisModel, RepositoryModel.full_name)
        .join(RepositoryModel, AnalysisModel.repository_id == RepositoryModel.id)
        .where(*filters)
        .order_by(order_expr)
        .limit(limit)
        .offset(offset)
    )
    rows = (await session.execute(stmt)).all()
    items = [
        AnalysisHistoryItemOut(
            id=a.id,
            repository_id=a.repository_id,
            repository_full_name=full_name,
            status=a.status,
            total_commits=a.total_commits,
            commits_per_month=a.commits_per_month,
            bus_factor=a.bus_factor,
            health_score=a.health_score if a.health_coverage else None,
            health_coverage=a.health_coverage or 0,
            created_at=a.created_at,
            completed_at=a.completed_at,
        )
        for a, full_name in rows
    ]
    return AnalysisHistoryPageOut(items=items, total=total, limit=limit, offset=offset)


# ── GET /analyses/compare ────────────────────────────────────────────────────


@router.get(
    "/compare",
    response_model=AnalysisComparisonOut,
    summary="Compare two analyses (same repo over time or two different repos)",
)
async def compare_analyses(
    left_id: uuid.UUID = Query(...),
    right_id: uuid.UUID = Query(...),
    session: AsyncSession = Depends(get_db),
    use_case: GetAnalysisUseCase = Depends(get_analysis_detail_use_case),
) -> AnalysisComparisonOut:
    left_data = await use_case.execute(left_id)
    right_data = await use_case.execute(right_id)
    left_repo = await session.get(RepositoryModel, left_data["analysis"].repository_id)
    right_repo = await session.get(RepositoryModel, right_data["analysis"].repository_id)
    left_out = _build_analysis_detail(left_data, left_repo)
    right_out = _build_analysis_detail(right_data, right_repo)

    health_delta = (
        right_out.health.score - left_out.health.score
        if left_out.health.score is not None and right_out.health.score is not None
        else None
    )
    deltas = ComparisonDeltaOut(
        health_score=health_delta,
        total_commits=right_out.metrics.total_commits - left_out.metrics.total_commits,
        commits_per_month=round(right_out.metrics.commits_per_month - left_out.metrics.commits_per_month, 2),
        avg_commit_size=round(right_out.metrics.avg_commit_size - left_out.metrics.avg_commit_size, 2),
        bus_factor=right_out.metrics.bus_factor - left_out.metrics.bus_factor,
        code_churn_additions=right_out.metrics.code_churn_additions - left_out.metrics.code_churn_additions,
        code_churn_deletions=right_out.metrics.code_churn_deletions - left_out.metrics.code_churn_deletions,
        avg_time_between_commits_hours=round(
            right_out.metrics.avg_time_between_commits_hours - left_out.metrics.avg_time_between_commits_hours, 2
        ),
    )
    return AnalysisComparisonOut(left=left_out, right=right_out, deltas=deltas)


# ── GET /analyses/shared/{token} ─────────────────────────────────────────────


@router.get(
    "/shared/{token}",
    response_model=AnalysisDetailOut,
    summary="Fetch a publicly shared analysis report by token",
)
async def get_shared_analysis(
    token: str,
    session: AsyncSession = Depends(get_db),
    use_case: GetAnalysisUseCase = Depends(get_analysis_detail_use_case),
) -> AnalysisDetailOut:
    stmt = select(ShareLinkModel).where(ShareLinkModel.token == token)
    link = (await session.execute(stmt)).scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Share link not found")
    if link.revoked:
        raise HTTPException(status_code=410, detail="Share link has been revoked")
    if to_utc(link.expires_at) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Share link has expired")

    data = await use_case.execute(link.analysis_id)
    repository = await session.get(RepositoryModel, data["analysis"].repository_id)
    return _build_analysis_detail(
        data,
        repository,
        include_ai=link.include_ai_insights,
        include_contributors=link.include_contributors,
    )


# ── GET /analyses/{analysis_id} ─────────────────────────────────────────────


@router.get(
    "/{analysis_id}",
    response_model=AnalysisDetailOut,
    responses={404: {"model": ErrorResponse}},
    summary="Get analysis details",
)
async def get_analysis(
    analysis_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    use_case: GetAnalysisUseCase = Depends(get_analysis_detail_use_case),
) -> AnalysisDetailOut:
    data = await use_case.execute(analysis_id)
    repository = await session.get(RepositoryModel, data["analysis"].repository_id)
    return _build_analysis_detail(data, repository)


# ── GET /analyses?repository_id=... ─────────────────────────────────────────


@router.get(
    "/",
    response_model=list[AnalysisListItem],
    summary="List analyses for a repository",
)
async def list_analyses(
    repository_id: uuid.UUID = Query(..., description="Filter by repository UUID"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    use_case: ListAnalysesUseCase = Depends(get_list_analyses_use_case),
) -> list[AnalysisListItem]:
    analyses = await use_case.execute(repository_id, limit=limit, offset=offset)
    return [
        AnalysisListItem(
            id=a.id,
            status=a.status.value if hasattr(a.status, "value") else a.status,
            total_commits=a.total_commits,
            bus_factor=a.bus_factor,
            health_score=a.health_score if a.health_coverage else None,
            health_coverage=a.health_coverage,
            created_at=a.created_at,
            completed_at=a.completed_at,
        )
        for a in analyses
    ]


@router.post("/{analysis_id}/retry", response_model=AnalyzeResponse, summary="Retry a failed analysis")
async def retry_analysis(
    analysis_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    use_case: AnalyzeRepositoryUseCase = Depends(get_analyze_use_case),
) -> AnalyzeResponse:
    analysis = await session.get(AnalysisModel, analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    if analysis.status not in {"failed", "cancelled"}:
        raise HTTPException(status_code=409, detail="Only failed or cancelled analyses can be retried")
    repository = await session.get(RepositoryModel, analysis.repository_id)
    if not repository:
        raise HTTPException(status_code=404, detail="Repository not found")

    result = await use_case.execute(AnalyzeRepoRequest(owner=repository.owner, name=repository.name))
    return AnalyzeResponse(
        analysis_id=result.analysis_id,
        repository_id=result.repository_id,
        status=result.status,
    )


@router.delete("/{analysis_id}", summary="Cancel an analysis")
async def cancel_analysis(
    analysis_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
) -> dict:
    analysis = await session.get(AnalysisModel, analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    if analysis.status in {"completed", "failed", "cancelled"}:
        raise HTTPException(status_code=409, detail="Analysis can no longer be cancelled")

    celery_app.control.revoke(str(analysis_id), terminate=True, signal="SIGTERM")
    await session.execute(
        update(AnalysisModel)
        .where(AnalysisModel.id == analysis_id)
        .values(status="cancelled", error_message="Analysis cancelled by the user", progress_stage="Cancelled")
    )
    await session.commit()
    return {"analysis_id": str(analysis_id), "status": "cancelled"}


@router.post("/{analysis_id}/share", response_model=ShareLinkOut, status_code=201, summary="Create a public share link")
async def create_share_link(
    analysis_id: uuid.UUID,
    body: ShareLinkCreateRequest,
    session: AsyncSession = Depends(get_db),
) -> ShareLinkOut:
    analysis = await session.get(AnalysisModel, analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    token = secrets.token_urlsafe(24)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=body.expires_in_hours)
    link = ShareLinkModel(
        analysis_id=analysis_id,
        token=token,
        include_ai_insights=body.include_ai_insights,
        include_contributors=body.include_contributors,
        expires_at=expires_at,
    )
    session.add(link)
    await session.commit()
    return ShareLinkOut(
        token=link.token,
        analysis_id=link.analysis_id,
        expires_at=link.expires_at,
        include_ai_insights=link.include_ai_insights,
        include_contributors=link.include_contributors,
        revoked=link.revoked,
    )


@router.delete("/{analysis_id}/share/{token}", summary="Revoke a share link")
async def revoke_share_link(
    analysis_id: uuid.UUID,
    token: str,
    session: AsyncSession = Depends(get_db),
) -> dict:
    stmt = select(ShareLinkModel).where(
        ShareLinkModel.analysis_id == analysis_id,
        ShareLinkModel.token == token,
    )
    link = (await session.execute(stmt)).scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Share link not found")
    link.revoked = True
    await session.commit()
    return {"token": token, "revoked": True}


@router.get("/{analysis_id}/export.csv", response_class=Response, summary="Export analysis as CSV")
async def export_analysis_csv(
    analysis_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    use_case: GetAnalysisUseCase = Depends(get_analysis_detail_use_case),
) -> Response:
    data = await use_case.execute(analysis_id)
    analysis = data["analysis"]
    repository = await session.get(RepositoryModel, analysis.repository_id)
    full_name = repository.full_name if repository else str(analysis.repository_id)
    source_url = f"https://github.com/{full_name}" if repository else ""

    output = StringIO(newline="")
    output.write("\ufeff")
    writer = csv.writer(output)
    writer.writerow(["section", "name", "value"])
    writer.writerow(["source", "repository", _csv_safe(full_name)])
    writer.writerow(["source", "github_url", _csv_safe(source_url)])
    writer.writerow(["source", "analysis_id", str(analysis_id)])
    writer.writerow(["source", "exported_at_utc", datetime.now(timezone.utc).isoformat()])
    writer.writerow(["sample_scope", "sampled_commits", data["commits_count"]])
    for name in (
        "health_score", "total_commits", "avg_commit_size", "commits_per_day",
        "commits_per_month", "code_churn_additions", "code_churn_deletions",
        "avg_time_between_commits_hours", "bus_factor",
    ):
        writer.writerow(["metrics", name, _csv_safe(getattr(analysis, name))])
    writer.writerow(["health", "coverage_percent", analysis.health_coverage])
    writer.writerow(["health", "formula_version", HEALTH_FORMULA_VERSION])
    for name, value in analysis.health_breakdown.items():
        writer.writerow(["health_breakdown", _csv_safe(name), _csv_safe(value.get("score") if isinstance(value, dict) else value)])
        if isinstance(value, dict):
            writer.writerow(["health_evidence", _csv_safe(name), _csv_safe(value.get("evidence", ""))])
    for contributor in data["contributors"]:
        writer.writerow(["contributor", _csv_safe(contributor.username), contributor.total_commits])
    for finding in analysis.health_findings:
        writer.writerow(["finding", _csv_safe(finding.get("title", "")), _csv_safe(finding.get("detail", ""))])
    safe_slug = full_name.replace("/", "-")
    return Response(
        content=output.getvalue().encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="repopulse-{safe_slug}-{str(analysis_id)[:8]}.csv"'},
    )
