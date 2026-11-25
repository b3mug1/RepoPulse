"""Read-only dependency health checks."""

import asyncio

import redis.asyncio as aioredis
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.schemas import HealthResponse
from app.core.config import get_settings
from app.core.metrics import metrics
from app.infrastructure.database.session import async_session_factory
from app.infrastructure.jobs.celery_app import celery_app

router = APIRouter(tags=["Health"])


async def _check_postgres() -> str:
    try:
        async with async_session_factory() as session:
            await session.execute(text("SELECT 1"))
        return "ok"
    except Exception:
        return "unavailable"


async def _check_redis() -> str:
    settings = get_settings()
    redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        await redis.ping()
        return "ok"
    except Exception:
        return "unavailable"
    finally:
        await redis.aclose()


def _check_celery() -> str:
    try:
        responses = celery_app.control.inspect(timeout=0.5).ping() or {}
        return "ok" if responses else "unavailable"
    except Exception:
        return "unavailable"


@router.get("/health", response_model=HealthResponse)
async def health_check() -> JSONResponse:
    postgres, redis = await asyncio.gather(_check_postgres(), _check_redis())
    celery = await asyncio.to_thread(_check_celery)
    services = {"postgres": postgres, "redis": redis, "celery": celery}
    overall = "ok" if all(value == "ok" for value in services.values()) else "degraded"
    code = status.HTTP_200_OK if overall == "ok" else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(
        status_code=code,
        content=HealthResponse(status=overall, services=services).model_dump(),
    )


@router.get("/health/metrics", summary="Operational metrics snapshot")
async def operational_metrics() -> dict:
    settings = get_settings()
    queue_depth: int | None = None
    broker = aioredis.from_url(settings.celery_broker_url, decode_responses=True)
    try:
        queue_depth = int(await broker.llen("celery"))
    except Exception:
        queue_depth = None
    finally:
        await broker.aclose()
    return metrics.snapshot(celery_queue_depth=queue_depth)
