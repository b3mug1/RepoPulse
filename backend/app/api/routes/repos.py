"""Repository-level public endpoints (e.g., live Health Score SVG badges)."""

from html import escape
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.models import AnalysisModel, RepositoryModel
from app.infrastructure.database.session import get_db

router = APIRouter(prefix="/repos", tags=["Repositories"])


def render_health_badge_svg(score: int | None) -> str:
    """Render a Shields-style SVG badge for a repository Health Score."""
    label = "RepoPulse"
    if score is None:
        value = "unknown"
        color = "#64748b"
    else:
        value = f"{score}/100"
        color = "#16a34a" if score >= 80 else "#ca8a04" if score >= 50 else "#dc2626"

    label_w = 72
    value_w = max(58, len(value) * 7 + 16)
    total_w = label_w + value_w
    label_x = label_w / 2
    value_x = label_w + value_w / 2
    safe_value = escape(value)

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{total_w}" height="20" role="img" '
        f'aria-label="{label}: {safe_value}">'
        f"<title>{label}: {safe_value}</title>"
        f'<clipPath id="r"><rect width="{total_w}" height="20" rx="3" fill="#fff"/></clipPath>'
        f'<g clip-path="url(#r)">'
        f'<rect width="{label_w}" height="20" fill="#18191d"/>'
        f'<rect x="{label_w}" width="{value_w}" height="20" fill="{color}"/>'
        f"</g>"
        f'<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" '
        f'font-size="11">'
        f'<text x="{label_x}" y="14">{label}</text>'
        f'<text x="{value_x}" y="14" font-weight="bold">{safe_value}</text>'
        f"</g>"
        f"</svg>"
    )


@router.get(
    "/{owner}/{name}/badge.svg",
    response_class=Response,
    summary="Live SVG Health Score badge for READMEs",
)
async def get_repo_health_badge(
    owner: str,
    name: str,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    full_name = f"{owner.strip()}/{name.strip()}".lower()
    repo_stmt = select(RepositoryModel.id).where(
        func.lower(RepositoryModel.full_name) == full_name
    )
    repo_id = (await session.execute(repo_stmt)).scalar_one_or_none()

    score: int | None = None
    if repo_id is not None:
        analysis_stmt = (
            select(AnalysisModel.health_score, AnalysisModel.health_coverage)
            .where(
                AnalysisModel.repository_id == repo_id,
                AnalysisModel.status == "completed",
            )
            .order_by(AnalysisModel.created_at.desc())
            .limit(1)
        )
        row = (await session.execute(analysis_stmt)).first()
        if row and row[1]:
            score = row[0]

    svg = render_health_badge_svg(score)
    return Response(
        content=svg,
        media_type="image/svg+xml; charset=utf-8",
        headers={"Cache-Control": "public, max-age=300"},
    )
