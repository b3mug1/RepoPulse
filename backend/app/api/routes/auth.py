"""GitHub OAuth authentication endpoints."""

from __future__ import annotations

from typing import Annotated
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: TC002

from app.api.schemas import (
    AuthSessionOut,
    GitHubCallbackRequest,
    GitHubLoginOut,
    UserOut,
    UserRepoOut,
)
from app.core.auth import (
    create_oauth_state,
    create_session_token,
    decrypt_github_token,
    encrypt_github_token,
    get_current_user,
    verify_oauth_state,
)
from app.core.config import get_settings
from app.infrastructure.database.models import UserModel
from app.infrastructure.database.session import get_db

router = APIRouter(prefix="/auth", tags=["Auth"])

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"
GITHUB_USER_REPOS_URL = "https://api.github.com/user/repos"


def _to_user_out(user: UserModel) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        avatar_url=user.avatar_url,
        github_id=user.github_id,
    )


@router.get("/github/login", response_model=GitHubLoginOut, summary="Start GitHub OAuth flow")
async def github_login() -> GitHubLoginOut:
    settings = get_settings()
    if not settings.github_oauth_client_id or not settings.github_oauth_client_secret:
        raise HTTPException(
            status_code=503,
            detail="GitHub OAuth is not configured on this server.",
        )

    state = create_oauth_state()
    params = urlencode(
        {
            "client_id": settings.github_oauth_client_id,
            "redirect_uri": settings.github_oauth_redirect_uri,
            "scope": "repo read:user",
            "state": state,
        }
    )
    return GitHubLoginOut(authorize_url=f"{GITHUB_AUTHORIZE_URL}?{params}", state=state)


@router.post(
    "/github/callback",
    response_model=AuthSessionOut,
    summary="Exchange GitHub OAuth code for a RepoPulse session",
)
async def github_callback(
    body: GitHubCallbackRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> AuthSessionOut:
    settings = get_settings()
    if not settings.github_oauth_client_id or not settings.github_oauth_client_secret:
        raise HTTPException(status_code=503, detail="GitHub OAuth is not configured.")
    if not verify_oauth_state(body.state):
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state.")

    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
        token_resp = await client.post(
            GITHUB_TOKEN_URL,
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.github_oauth_client_id,
                "client_secret": settings.github_oauth_client_secret,
                "code": body.code,
                "redirect_uri": settings.github_oauth_redirect_uri,
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(status_code=502, detail="GitHub token exchange failed.")
        token_data = token_resp.json()
        gh_access_token = token_data.get("access_token")
        if not gh_access_token:
            raise HTTPException(
                status_code=400,
                detail=(
                    token_data.get("error_description")
                    or "GitHub did not return an access token."
                ),
            )

        user_resp = await client.get(
            GITHUB_USER_URL,
            headers={
                "Authorization": f"Bearer {gh_access_token}",
                "Accept": "application/vnd.github+json",
            },
        )
        if user_resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to fetch GitHub user profile.")
        gh_user = user_resp.json()

    github_id = gh_user.get("id")
    login = str(gh_user.get("login") or "").strip()
    if not github_id or not login:
        raise HTTPException(status_code=502, detail="Incomplete GitHub user profile.")

    avatar_url = gh_user.get("avatar_url")
    email = gh_user.get("email") or f"{github_id}+{login}@users.noreply.github.com"
    encrypted_token = encrypt_github_token(gh_access_token)

    stmt = select(UserModel).where(UserModel.github_id == int(github_id))
    user = (await session.execute(stmt)).scalar_one_or_none()
    if user:
        user.username = login
        user.avatar_url = avatar_url
        user.encrypted_github_token = encrypted_token
    else:
        user = UserModel(
            username=login,
            email=email,
            hashed_password="",
            github_id=int(github_id),
            avatar_url=avatar_url,
            encrypted_github_token=encrypted_token,
            is_active=True,
        )
        session.add(user)

    await session.commit()
    await session.refresh(user)

    session_token = create_session_token(user.id)
    return AuthSessionOut(access_token=session_token, user=_to_user_out(user))


@router.get("/me", response_model=UserOut, summary="Get current authenticated user")
async def get_me(
    current_user: Annotated[UserModel, Depends(get_current_user)],
) -> UserOut:
    return _to_user_out(current_user)


@router.get(
    "/github/repos",
    response_model=list[UserRepoOut],
    summary="List repositories accessible to the signed-in GitHub user",
)
async def list_user_github_repos(
    current_user: Annotated[UserModel, Depends(get_current_user)],
) -> list[UserRepoOut]:
    gh_token = decrypt_github_token(current_user.encrypted_github_token)
    if not gh_token:
        raise HTTPException(
            status_code=401,
            detail="GitHub token unavailable. Please sign in again.",
        )

    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
        resp = await client.get(
            GITHUB_USER_REPOS_URL,
            params={
                "sort": "updated",
                "per_page": 30,
                "affiliation": "owner,collaborator,organization_member",
            },
            headers={
                "Authorization": f"Bearer {gh_token}",
                "Accept": "application/vnd.github+json",
            },
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to load repositories from GitHub.")

    return [
        UserRepoOut(
            full_name=str(item.get("full_name", "")),
            private=bool(item.get("private", False)),
            language=item.get("language"),
            stars=int(item.get("stargazers_count") or 0),
            description=item.get("description"),
        )
        for item in resp.json()
        if item.get("full_name")
    ]
