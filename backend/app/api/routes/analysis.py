"""
API router: Analysis endpoints.

All routes are prefixed with /api/v1 in the main app.
"""

from __future__ import annotations

import uuid
import csv
from io import StringIO

from fastapi import APIRouter, Depends, Query, Request
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
    AnalysisDetailOut,
    AnalysisListItem,
    AnalyzeRequest,
    AnalyzeResponse,
    ContributorOut,
    DailyCommit,
    ErrorResponse,
    MetricsOut,
)
from app.usecases.analyze_repository import AnalyzeRepoRequest, AnalyzeRepositoryUseCase
from app.usecases.get_analysis import GetAnalysisUseCase, ListAnalysesUseCase

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


# ── GET /analyses/{analysis_id} ─────────────────────────────────────────────


@router.get(
    "/{analysis_id}",
    response_model=AnalysisDetailOut,
    responses={404: {"model": ErrorResponse}},
    summary="Get analysis details",
)
async def get_analysis(
    analysis_id: uuid.UUID,
    use_case: GetAnalysisUseCase = Depends(get_analysis_detail_use_case),
) -> AnalysisDetailOut:
    data = await use_case.execute(analysis_id)
    analysis = data["analysis"]
    contributors = data["contributors"]
    commits = data["commits"]

    # Compute daily commit counts from stored commit timestamps
    date_counts = Counter(
        c.committed_at.date().isoformat() for c in commits if c.committed_at
    )
    commits_per_date = sorted(
        [DailyCommit(date=d, commits=n) for d, n in date_counts.items()],
        key=lambda x: x.date,
    )

    return AnalysisDetailOut(
        id=analysis.id,
        repository_id=analysis.repository_id,
        status=analysis.status.value if hasattr(analysis.status, "value") else analysis.status,
        progress_stage=analysis.progress_stage,
        health={
            "score": analysis.health_score if analysis.health_coverage else None,
            "coverage": analysis.health_coverage,
            "grade": "Insufficient data" if not analysis.health_coverage else "Excellent" if analysis.health_score >= 80 else "Healthy" if analysis.health_score >= 60 else "Needs attention" if analysis.health_score >= 40 else "At risk",
            "formula_version": "1.0",
            "breakdown": analysis.health_breakdown,
            "findings": analysis.health_findings,
        },
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
            ai_summary=analysis.ai_summary,
            readme_quality_score=analysis.readme_quality_score,
            readme_quality_feedback=analysis.readme_quality_feedback,
            detected_tech_stack=analysis.detected_tech_stack,
            architecture_analysis=analysis.architecture_analysis,
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
        commits_count=data["commits_count"],
        created_at=analysis.created_at,
        completed_at=analysis.completed_at,
    )


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


@router.get("/{analysis_id}/export.csv", response_class=Response, summary="Export analysis as CSV")
async def export_analysis_csv(
    analysis_id: uuid.UUID,
    use_case: GetAnalysisUseCase = Depends(get_analysis_detail_use_case),
) -> Response:
    data = await use_case.execute(analysis_id)
    analysis = data["analysis"]
    output = StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(["section", "name", "value"])
    for name in (
        "health_score", "total_commits", "avg_commit_size", "commits_per_day",
        "commits_per_month", "code_churn_additions", "code_churn_deletions",
        "avg_time_between_commits_hours", "bus_factor",
    ):
        writer.writerow(["metrics", name, getattr(analysis, name)])
    writer.writerow(["health", "coverage_percent", analysis.health_coverage])
    writer.writerow(["health", "formula_version", "1.0"])
    for name, value in analysis.health_breakdown.items():
        writer.writerow(["health_breakdown", name, value.get("score") if isinstance(value, dict) else value])
        if isinstance(value, dict):
            writer.writerow(["health_evidence", name, value.get("evidence", "")])
    for contributor in data["contributors"]:
        writer.writerow(["contributor", contributor.username, contributor.total_commits])
    for finding in analysis.health_findings:
        writer.writerow(["finding", finding.get("title", ""), finding.get("detail", "")])
    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="repository-analysis-{analysis_id}.csv"'},
    )
