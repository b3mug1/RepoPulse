
from __future__ import annotations

import asyncio
import re
from datetime import datetime
from typing import Any, Optional

import httpx
import structlog
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.core.config import get_settings
from app.core.exceptions import ExternalServiceError
from app.domain.entities import CommitStats, Repository

logger = structlog.get_logger(__name__)

GITHUB_API = "https://api.github.com"


class GitHubClient:
    """Thin async wrapper around GitHub REST API v3."""

    def __init__(self, token: str | None = None, *, max_requests: int = 150) -> None:
        settings = get_settings()
        self._token = token or settings.github_token
        self._max_requests = max_requests
        self._request_count = 0
        self._headers: dict[str, str] = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self._token:
            self._headers["Authorization"] = f"Bearer {self._token}"

    # ── Low-level request ────────────────────────────────────────────────

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.TransportError, httpx.TimeoutException)),
        reraise=True,
    )
    async def _get(
        self, url: str, params: dict | None = None, *, etag: str | None = None
    ) -> httpx.Response:
        if self._request_count >= self._max_requests:
            raise ExternalServiceError("GitHub", "GitHub API request budget exceeded for this analysis")
        self._request_count += 1
        headers = dict(self._headers)
        if etag:
            headers["If-None-Match"] = etag
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=5.0)) as client:
            resp = await client.get(url, headers=headers, params=params)
            if resp.status_code == 304:
                return resp
            if resp.status_code == 404:
                raise ExternalServiceError("GitHub", "Repository not found")
            if resp.status_code == 401:
                raise ExternalServiceError("GitHub", "Authentication rejected")
            if resp.status_code in (403, 429):
                remaining = resp.headers.get("X-RateLimit-Remaining")
                if resp.status_code == 429 or remaining == "0":
                    raise ExternalServiceError("GitHub", "Rate limit exceeded")
                raise ExternalServiceError("GitHub", "Rate limit exceeded or access forbidden")
            if resp.status_code == 422:
                raise ExternalServiceError("GitHub", "Repository request was rejected")
            resp.raise_for_status()
            return resp

    async def get_conditional(
        self, url: str, params: dict | None = None, *, etag: str | None = None
    ) -> tuple[int, Any, str | None]:
        """Perform a conditional GET with ETag support; returns (status, data, new_etag)."""
        resp = await self._get(url, params=params, etag=etag)
        new_etag = resp.headers.get("ETag") or etag
        if resp.status_code == 304:
            return 304, None, new_etag
        return resp.status_code, resp.json(), new_etag

    # ── Pagination ───────────────────────────────────────────────────────

    async def _get_paginated(
        self, url: str, *, params: dict | None = None, max_pages: int = 10
    ) -> list[dict[str, Any]]:
        """Follow GitHub's Link header pagination up to *max_pages*."""
        params = params or {}
        params.setdefault("per_page", 100)
        all_items: list[dict[str, Any]] = []

        current_url: str | None = url
        page = 0
        while current_url and page < max_pages:
            resp = await self._get(current_url, params if page == 0 else None)
            data = resp.json()
            if isinstance(data, list):
                all_items.extend(data)
            else:
                all_items.append(data)

            # Parse Link header for next page
            current_url = self._parse_next_link(resp.headers.get("Link", ""))
            page += 1

        return all_items

    @staticmethod
    def _parse_next_link(link_header: str) -> str | None:
        if not link_header:
            return None
        match = re.search(r'<([^>]+)>;\s*rel="next"', link_header)
        return match.group(1) if match else None

    # ── Public methods ───────────────────────────────────────────────────

    async def get_repository(self, owner: str, name: str) -> dict[str, Any]:
        """GET /repos/{owner}/{name}"""
        resp = await self._get(f"{GITHUB_API}/repos/{owner}/{name}")
        return resp.json()

    async def get_commits(
        self, owner: str, name: str, *, max_pages: int = 5
    ) -> list[dict[str, Any]]:
        """GET /repos/{owner}/{name}/commits  (paginated)"""
        return await self._get_paginated(
            f"{GITHUB_API}/repos/{owner}/{name}/commits",
            max_pages=max_pages,
        )

    async def get_commit_detail(self, owner: str, name: str, sha: str) -> dict[str, Any]:
        """GET /repos/{owner}/{name}/commits/{sha} — includes file-level stats."""
        resp = await self._get(f"{GITHUB_API}/repos/{owner}/{name}/commits/{sha}")
        return resp.json()

    async def get_languages(self, owner: str, name: str) -> dict[str, int]:
        """GET /repos/{owner}/{name}/languages — bytes per language."""
        resp = await self._get(f"{GITHUB_API}/repos/{owner}/{name}/languages")
        return resp.json()

    async def get_readme(self, owner: str, name: str) -> str | None:
        """Return decoded README content or None if absent."""
        try:
            resp = await self._get(
                f"{GITHUB_API}/repos/{owner}/{name}/readme",
                params={"ref": "HEAD"},
            )
            data = resp.json()
            import base64
            return base64.b64decode(data.get("content", "")).decode("utf-8", errors="replace")
        except ExternalServiceError:
            return None

    async def get_repo_tree(self, owner: str, name: str, branch: str = "HEAD") -> list[str] | None:
        """Return list of file paths (flat) from the repo tree."""
        try:
            resp = await self._get(
                f"{GITHUB_API}/repos/{owner}/{name}/git/trees/{branch}",
                params={"recursive": "1"},
            )
            tree = resp.json().get("tree", [])
            return [item["path"] for item in tree if item["type"] == "blob"]
        except ExternalServiceError:
            # None means unavailable; [] means a successfully inspected empty tree.
            return None

    async def get_pull_requests(self, owner: str, name: str, *, per_page: int = 50) -> list[dict[str, Any]]:
        """GET /repos/{owner}/{name}/pulls (latest updated PRs across states)."""
        try:
            resp = await self._get(
                f"{GITHUB_API}/repos/{owner}/{name}/pulls",
                params={"state": "all", "sort": "updated", "direction": "desc", "per_page": per_page},
            )
            data = resp.json()
            return data if isinstance(data, list) else []
        except ExternalServiceError:
            return []

    async def get_issues(self, owner: str, name: str, *, per_page: int = 50) -> list[dict[str, Any]]:
        """GET /repos/{owner}/{name}/issues (latest updated issues, excluding PRs)."""
        try:
            resp = await self._get(
                f"{GITHUB_API}/repos/{owner}/{name}/issues",
                params={"state": "all", "sort": "updated", "direction": "desc", "per_page": per_page},
            )
            data = resp.json()
            return [item for item in data if "pull_request" not in item] if isinstance(data, list) else []
        except ExternalServiceError:
            return []

    async def get_releases(self, owner: str, name: str, *, per_page: int = 30) -> list[dict[str, Any]]:
        """GET /repos/{owner}/{name}/releases."""
        try:
            resp = await self._get(
                f"{GITHUB_API}/repos/{owner}/{name}/releases",
                params={"per_page": per_page},
            )
            data = resp.json()
            return data if isinstance(data, list) else []
        except ExternalServiceError:
            return []

    async def get_workflow_runs(self, owner: str, name: str, *, per_page: int = 25) -> list[dict[str, Any]] | None:
        """GET /repos/{owner}/{name}/actions/runs."""
        try:
            resp = await self._get(
                f"{GITHUB_API}/repos/{owner}/{name}/actions/runs",
                params={"per_page": per_page},
            )
            runs = resp.json().get("workflow_runs", [])
            return runs if isinstance(runs, list) else []
        except ExternalServiceError:
            return None

    async def get_branch_protection_status(self, owner: str, name: str, branch: str) -> str:
        """Check whether the default branch is marked as protected via public branch metadata."""
        try:
            resp = await self._get(f"{GITHUB_API}/repos/{owner}/{name}/branches/{branch}")
            data = resp.json()
            if "protected" in data:
                return "protected" if data["protected"] else "unprotected"
            return "unknown"
        except ExternalServiceError:
            return "unknown"

    # ── Helpers ──────────────────────────────────────────────────────────

    def parse_repo_metadata(self, data: dict[str, Any]) -> Repository:
        """Map GitHub API response → domain Repository entity."""
        return Repository(
            owner=data.get("owner", {}).get("login", ""),
            name=data.get("name", ""),
            full_name=data.get("full_name", ""),
            description=data.get("description"),
            default_branch=data.get("default_branch", "main"),
            stars=data.get("stargazers_count", 0),
            forks=data.get("forks_count", 0),
            open_issues=data.get("open_issues_count", 0),
            language=data.get("language"),
        )

    def parse_commit(self, data: dict[str, Any], analysis_id) -> CommitStats:
        """Map a single commit detail response → domain CommitStats entity."""
        commit_info = data.get("commit", {})
        author = commit_info.get("author", {})
        gh_author = data.get("author") or {}
        stats = data.get("stats", {})
        return CommitStats(
            analysis_id=analysis_id,
            sha=data.get("sha", ""),
            author_name=author.get("name", "unknown"),
            author_email=author.get("email", ""),
            author_login=gh_author.get("login", "") if isinstance(gh_author, dict) else "",
            message=commit_info.get("message", ""),
            additions=stats.get("additions", 0),
            deletions=stats.get("deletions", 0),
            files_changed=len(data.get("files", [])),
            committed_at=datetime.fromisoformat(
                author.get("date", "2000-01-01T00:00:00Z").replace("Z", "+00:00")
            ),
        )
