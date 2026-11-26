"""
FastAPI application factory.

Assembles middleware, exception handlers, routers, and lifecycle events.
"""

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.rate_limit import limiter
from app.api.routes.analysis import router as analysis_router
from app.api.routes.health import router as health_router
from app.api.routes.repos import router as repos_router
from app.core.config import get_settings
from app.core.exceptions import AppError, NotFoundError
from app.core.logging import setup_logging


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Startup / shutdown hooks."""
    setup_logging()
    get_settings().validate_production()
    yield
    # Shutdown: close pools, connections, etc.


def create_app() -> FastAPI:
    settings = get_settings()

    expose_docs = settings.app_env != "production" or settings.app_debug
    app = FastAPI(
        title="RepoPulse API",
        description=(
            "Analyse any public GitHub repository: code metrics, contributor stats, "
            "language distribution, and AI-powered insights."
        ),
        version="1.0.0",
        docs_url="/docs" if expose_docs else None,
        redoc_url="/redoc" if expose_docs else None,
        openapi_url="/openapi.json" if expose_docs else None,
        lifespan=lifespan,
    )

    # ── Middleware ────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
    )

    @app.middleware("http")
    async def limit_request_size(request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and content_length.isdigit():
            if int(content_length) > settings.max_request_body_bytes:
                return JSONResponse(
                    status_code=413,
                    content={"error": "Request body too large", "code": "PAYLOAD_TOO_LARGE"},
                )
        return await call_next(request)

    # Rate limiter
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # ── Exception handlers ───────────────────────────────────────────────
    @app.exception_handler(NotFoundError)
    async def not_found_handler(request: Request, exc: NotFoundError) -> JSONResponse:
        return JSONResponse(
            status_code=404,
            content={"error": exc.message, "code": exc.code},
        )

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=400,
            content={"error": exc.message, "code": exc.code},
        )

    # ── Routers ──────────────────────────────────────────────────────────
    app.include_router(health_router, prefix="/api/v1")
    app.include_router(analysis_router, prefix="/api/v1")
    app.include_router(repos_router, prefix="/api/v1")

    return app


app = create_app()
