from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.auth import router as auth_router
from app.core.auth import (
    create_oauth_state,
    create_session_token,
    decrypt_github_token,
    encrypt_github_token,
    verify_oauth_state,
    verify_session_token,
)
from app.infrastructure.database.session import get_db


def test_token_encryption_and_session_roundtrip() -> None:
    encrypted = encrypt_github_token("gho_secret_token_123")
    assert encrypted != "gho_secret_token_123"
    assert decrypt_github_token(encrypted) == "gho_secret_token_123"
    assert decrypt_github_token("not-valid-fernet") is None

    uid = uuid.uuid4()
    session_token = create_session_token(uid)
    assert verify_session_token(session_token) == uid
    assert verify_session_token(session_token + "tamper") is None

    state = create_oauth_state()
    assert verify_oauth_state(state) is True
    assert verify_oauth_state("bad.state") is False


def test_github_login_returns_authorize_url() -> None:
    app = FastAPI()
    app.include_router(auth_router, prefix="/api/v1")
    client = TestClient(app)

    fake_settings = SimpleNamespace(
        github_oauth_client_id="client_123",
        github_oauth_client_secret="secret_456",
        github_oauth_redirect_uri="http://localhost:5173/auth/callback",
        app_secret_key="a" * 32,
    )
    with patch("app.api.routes.auth.get_settings", return_value=fake_settings):
        resp = client.get("/api/v1/auth/github/login")

    assert resp.status_code == 200
    body = resp.json()
    assert "https://github.com/login/oauth/authorize" in body["authorize_url"]
    assert "client_id=client_123" in body["authorize_url"]
    assert verify_oauth_state(body["state"]) is True


def test_auth_me_requires_valid_bearer_token() -> None:
    app = FastAPI()
    app.include_router(auth_router, prefix="/api/v1")

    uid = uuid.uuid4()
    mock_user = SimpleNamespace(
        id=uid,
        username="octocat",
        avatar_url="https://avatars.githubusercontent.com/u/1",
        github_id=1,
        is_active=True,
    )
    mock_session = AsyncMock()
    mock_session.get.return_value = mock_user

    async def _override_db():
        yield mock_session

    app.dependency_overrides[get_db] = _override_db
    client = TestClient(app)

    unauth = client.get("/api/v1/auth/me")
    assert unauth.status_code == 401

    token = create_session_token(uid)
    ok = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert ok.status_code == 200
    assert ok.json()["username"] == "octocat"


def test_list_user_github_repos_uses_decrypted_token() -> None:
    app = FastAPI()
    app.include_router(auth_router, prefix="/api/v1")

    uid = uuid.uuid4()
    mock_user = SimpleNamespace(
        id=uid,
        username="octocat",
        avatar_url=None,
        github_id=1,
        encrypted_github_token=encrypt_github_token("gho_user_token"),
        is_active=True,
    )
    mock_session = AsyncMock()
    mock_session.get.return_value = mock_user

    async def _override_db():
        yield mock_session

    app.dependency_overrides[get_db] = _override_db
    client = TestClient(app)
    token = create_session_token(uid)

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = [
        {
            "full_name": "octocat/private-app",
            "private": True,
            "language": "Python",
            "stargazers_count": 3,
            "description": "Secret project",
        }
    ]

    with patch("app.api.routes.auth.httpx.AsyncClient") as mock_http_cls:
        mock_http = AsyncMock()
        mock_http.get.return_value = mock_resp
        mock_http_cls.return_value.__aenter__.return_value = mock_http

        resp = client.get(
            "/api/v1/auth/github/repos",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["full_name"] == "octocat/private-app"
    assert data[0]["private"] is True
