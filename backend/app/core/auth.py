"""Authentication, token encryption, and signed session helpers for GitHub OAuth."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
import uuid
from typing import Annotated

from cryptography.fernet import Fernet, InvalidToken
from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: TC002

from app.core.config import get_settings
from app.infrastructure.database.models import UserModel
from app.infrastructure.database.session import get_db

_DEV_FALLBACK_SECRET = "repopulse-dev-only-secret-do-not-use-in-prod"


def _signing_secret() -> bytes:
    secret = get_settings().app_secret_key or _DEV_FALLBACK_SECRET
    return secret.encode("utf-8")


def _fernet() -> Fernet:
    digest = hashlib.sha256(_signing_secret()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_github_token(token: str) -> str:
    """Encrypt a GitHub OAuth token at rest using Fernet."""
    return _fernet().encrypt(token.encode("utf-8")).decode("utf-8")


def decrypt_github_token(ciphertext: str | None) -> str | None:
    """Decrypt a stored GitHub OAuth token, returning None if missing/invalid."""
    if not ciphertext:
        return None
    try:
        return _fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        return None


def _sign_payload(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    body = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    sig = hmac.new(_signing_secret(), body.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def _verify_signed_payload(token: str) -> dict | None:
    if "." not in token:
        return None
    body, sig = token.rsplit(".", 1)
    expected = hmac.new(_signing_secret(), body.encode("ascii"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    padded = body + "=" * (-len(body) % 4)
    try:
        data = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    exp = data.get("exp")
    if not isinstance(exp, (int, float)) or time.time() > exp:
        return None
    return data


def create_oauth_state() -> str:
    """Generate a short-lived HMAC-signed OAuth state parameter."""
    return _sign_payload(
        {
            "kind": "oauth_state",
            "nonce": secrets.token_urlsafe(12),
            "exp": int(time.time()) + 600,
        }
    )


def verify_oauth_state(state: str) -> bool:
    """Validate an OAuth state parameter."""
    data = _verify_signed_payload(state)
    return bool(data and data.get("kind") == "oauth_state")


def create_session_token(user_id: uuid.UUID, *, expires_in_hours: int = 168) -> str:
    """Create a signed bearer session token for an authenticated user."""
    return _sign_payload(
        {
            "kind": "session",
            "sub": str(user_id),
            "exp": int(time.time()) + expires_in_hours * 3600,
        }
    )


def verify_session_token(token: str) -> uuid.UUID | None:
    """Verify a signed bearer session token and return the user UUID."""
    data = _verify_signed_payload(token)
    if not data or data.get("kind") != "session":
        return None
    try:
        return uuid.UUID(str(data.get("sub", "")))
    except ValueError:
        return None


async def get_optional_current_user(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> UserModel | None:
    """Return the authenticated UserModel from Authorization: Bearer, or None."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:].strip()
    user_id = verify_session_token(token)
    if user_id is None:
        return None
    user = await session.get(UserModel, user_id)
    if user is None or not user.is_active:
        return None
    return user


async def get_current_user(
    user: Annotated[UserModel | None, Depends(get_optional_current_user)],
) -> UserModel:
    """Require an authenticated user or raise 401."""
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user
