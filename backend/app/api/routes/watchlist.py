"""Watchlist endpoints for subscribing repositories to scheduled re-scans."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_analyze_use_case
from app.api.schemas import AnalyzeResponse, WatchlistCreateRequest, WatchlistItemOut
from app.infrastructure.cache.redis_cache import CachedGitHubClient, RedisCache
from app.infrastructure.database.models import RepositoryModel, WatchlistModel
from app.infrastructure.database.repositories import SqlAlchemyRepoRepository
from app.infrastructure.database.session import get_db
from app.infrastructure.external.github_client import GitHubClient
from app.usecases.analyze_repository import AnalyzeRepoRequest, AnalyzeRepositoryUseCase

router = APIRouter(prefix="/watchlist", tags=["Watchlist"])


def _to_out(item: WatchlistModel, full_name: str) -> WatchlistItemOut:
    return WatchlistItemOut(
        id=item.id,
        repository_id=item.repository_id,
        repository_full_name=full_name,
        cadence=item.cadence,
        has_webhook=bool(item.webhook_url),
        is_active=item.is_active,
        last_checked_at=item.last_checked_at,
        next_check_at=item.next_check_at,
        last_analysis_id=item.last_analysis_id,
        last_alerts=item.last_alerts or [],
        created_at=item.created_at,
    )


@router.get("", response_model=list[WatchlistItemOut], summary="List watched repositories")
async def list_watchlist(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[WatchlistItemOut]:
    stmt = (
        select(WatchlistModel, RepositoryModel.full_name)
        .join(RepositoryModel, WatchlistModel.repository_id == RepositoryModel.id)
        .order_by(WatchlistModel.created_at.desc())
    )
    rows = (await session.execute(stmt)).all()
    return [_to_out(item, full_name) for item, full_name in rows]


@router.post("", response_model=WatchlistItemOut, status_code=201, summary="Subscribe repository")
async def subscribe_watchlist(
    body: WatchlistCreateRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> WatchlistItemOut:
    gh_raw = GitHubClient()
    cache = RedisCache()
    try:
        gh_cached = CachedGitHubClient(gh_raw, cache)
        gh_data = await gh_cached.get_repository(body.owner, body.name)
    finally:
        await cache.close()

    repo_entity = gh_raw.parse_repo_metadata(gh_data)
    repo_store = SqlAlchemyRepoRepository(session)
    repo_entity = await repo_store.upsert(repo_entity)

    stmt = select(WatchlistModel).where(WatchlistModel.repository_id == repo_entity.id)
    existing = (await session.execute(stmt)).scalar_one_or_none()
    delta = timedelta(days=1 if body.cadence == "daily" else 7)
    next_check = datetime.now(UTC) + delta

    if existing:
        existing.cadence = body.cadence
        existing.webhook_url = body.webhook_url
        existing.is_active = True
        existing.next_check_at = next_check
        item = existing
    else:
        item = WatchlistModel(
            repository_id=repo_entity.id,
            cadence=body.cadence,
            webhook_url=body.webhook_url,
            is_active=True,
            next_check_at=next_check,
        )
        session.add(item)

    await session.commit()
    await session.refresh(item)
    return _to_out(item, repo_entity.full_name)


@router.post(
    "/{watchlist_id}/run", response_model=AnalyzeResponse, summary="Trigger immediate scan"
)
async def trigger_watchlist_scan(
    watchlist_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    use_case: Annotated[AnalyzeRepositoryUseCase, Depends(get_analyze_use_case)],
) -> AnalyzeResponse:
    item = await session.get(WatchlistModel, watchlist_id)
    if not item:
        raise HTTPException(status_code=404, detail="Watchlist entry not found")
    repo = await session.get(RepositoryModel, item.repository_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    result = await use_case.execute(AnalyzeRepoRequest(owner=repo.owner, name=repo.name))
    item.last_checked_at = datetime.now(UTC)
    item.next_check_at = datetime.now(UTC) + timedelta(days=1 if item.cadence == "daily" else 7)
    await session.commit()
    return AnalyzeResponse(
        analysis_id=result.analysis_id,
        repository_id=result.repository_id,
        status=result.status,
    )


@router.delete("/{watchlist_id}", summary="Unsubscribe repository")
async def unsubscribe_watchlist(
    watchlist_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    item = await session.get(WatchlistModel, watchlist_id)
    if not item:
        raise HTTPException(status_code=404, detail="Watchlist entry not found")
    await session.delete(item)
    await session.commit()
    return {"id": str(watchlist_id), "deleted": True}
