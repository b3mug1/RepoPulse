"""
Rate-limiting middleware using slowapi (backed by Redis).

Approach: per-IP sliding window, configurable via RATE_LIMIT_PER_MINUTE.
"""

from __future__ import annotations

from fastapi import Request
from slowapi import Limiter

from app.core.config import get_settings

settings = get_settings()


def get_client_ip(request: Request) -> str:
    """Resolve client IP without trusting spoofable X-Forwarded-For headers.

    X-Forwarded-For is only consulted when the direct peer IP is explicitly
    listed in TRUSTED_PROXIES.
    """
    peer_ip = request.client.host if request.client else "127.0.0.1"
    trusted = {p.strip() for p in settings.trusted_proxies.split(",") if p.strip()}
    if peer_ip in trusted:
        forwarded_for = request.headers.get("X-Forwarded-For", "")
        if forwarded_for:
            # Take the rightmost IP not in trusted proxies
            hops = [ip.strip() for ip in forwarded_for.split(",") if ip.strip()]
            for ip in reversed(hops):
                if ip not in trusted:
                    return ip
            if hops:
                return hops[0]
    return peer_ip


limiter = Limiter(
    key_func=get_client_ip,
    default_limits=[f"{settings.rate_limit_per_minute}/minute"],
    storage_uri=settings.redis_url,
    strategy="fixed-window",
)
