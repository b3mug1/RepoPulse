"""
Pydantic schemas for API request / response serialisation.

These are intentionally decoupled from domain entities so we can
evolve the public API independently.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


# ── Request Schemas ──────────────────────────────────────────────────────────


class AnalyzeRequest(BaseModel):
    """POST /analyze body."""
    owner: str = Field(..., min_length=1, max_length=255, examples=["facebook"])
    name: str = Field(..., min_length=1, max_length=255, examples=["react"])

    @field_validator("owner", "name")
    @classmethod
    def no_slashes(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("owner and name must not be blank")
        if "/" in v or "\\" in v:
            raise ValueError("Use separate owner and name fields, not owner/name")
        if not re.fullmatch(r"[A-Za-z0-9._-]+", v):
            raise ValueError("Use only letters, numbers, dots, underscores, and hyphen")
        return v


class PaginationParams(BaseModel):
    limit: int = Field(20, ge=1, le=100)
    offset: int = Field(0, ge=0)


# ── Response Schemas ─────────────────────────────────────────────────────────


class AnalyzeResponse(BaseModel):
    analysis_id: uuid.UUID
    repository_id: uuid.UUID
    status: str
    message: str = "Analysis queued. Poll GET /analyses/{analysis_id} for results."


class RepositoryOut(BaseModel):
    id: uuid.UUID
    owner: str
    name: str
    full_name: str
    description: Optional[str]
    default_branch: str
    stars: int
    forks: int
    open_issues: int
    language: Optional[str]


class ContributorOut(BaseModel):
    username: str
    total_commits: int
    additions: int
    deletions: int
    first_commit_at: Optional[datetime]
    last_commit_at: Optional[datetime]


class DailyCommit(BaseModel):
    date: str
    commits: int


class MetricsOut(BaseModel):
    total_commits: int
    avg_commit_size: float
    commits_per_day: float
    commits_per_month: float
    code_churn_additions: int
    code_churn_deletions: int
    avg_time_between_commits_hours: float
    bus_factor: int
    language_distribution: dict[str, float]
    commits_per_date: list[DailyCommit]


class HealthFinding(BaseModel):
    severity: str
    title: str
    detail: str


class HealthComponent(BaseModel):
    label: str
    score: Optional[int]
    weight: int
    weighted_points: Optional[float]
    status: str
    explanation: str
    evidence: str


class HealthOut(BaseModel):
    score: Optional[int]
    coverage: int
    confidence: str = "low"
    grade: str
    formula_version: str
    breakdown: dict[str, HealthComponent]
    findings: list[HealthFinding]


class SampleScopeOut(BaseModel):
    sampled_commits: int
    max_commits_limit: int = 100
    max_pages_limit: int = 5
    is_truncated: bool = False
    window_start_at: Optional[datetime] = None
    window_end_at: Optional[datetime] = None
    timezone: str = "UTC"


class AIInsightsOut(BaseModel):
    ai_summary: Optional[str]
    readme_quality_score: Optional[float]
    readme_quality_feedback: Optional[str]
    detected_tech_stack: list[str]
    architecture_analysis: Optional[str]
    ai_metadata: dict = Field(default_factory=dict)


class AnalysisDetailOut(BaseModel):
    id: uuid.UUID
    repository_id: uuid.UUID
    repository_full_name: str = ""
    repository_owner: str = ""
    repository_name: str = ""
    status: str
    progress_stage: str
    health: HealthOut
    sample_scope: SampleScopeOut
    extended_signals: dict = Field(default_factory=dict)
    error_message: Optional[str]
    metrics: MetricsOut
    ai_insights: AIInsightsOut
    contributors: list[ContributorOut]
    commits_count: int
    created_at: datetime
    completed_at: Optional[datetime]


class AnalysisListItem(BaseModel):
    id: uuid.UUID
    status: str
    total_commits: int
    bus_factor: int
    health_score: Optional[int]
    health_coverage: int
    created_at: datetime
    completed_at: Optional[datetime]


class AnalysisHistoryItemOut(BaseModel):
    id: uuid.UUID
    repository_id: uuid.UUID
    repository_full_name: str
    status: str
    total_commits: int
    commits_per_month: float
    bus_factor: int
    health_score: Optional[int]
    health_coverage: int
    created_at: datetime
    completed_at: Optional[datetime]


class AnalysisHistoryPageOut(BaseModel):
    items: list[AnalysisHistoryItemOut]
    total: int
    limit: int
    offset: int


class ComparisonDeltaOut(BaseModel):
    health_score: Optional[int] = None
    total_commits: int = 0
    commits_per_month: float = 0.0
    avg_commit_size: float = 0.0
    bus_factor: int = 0
    code_churn_additions: int = 0
    code_churn_deletions: int = 0
    avg_time_between_commits_hours: float = 0.0


class AnalysisComparisonOut(BaseModel):
    left: AnalysisDetailOut
    right: AnalysisDetailOut
    deltas: ComparisonDeltaOut


class ShareLinkCreateRequest(BaseModel):
    expires_in_hours: int = Field(72, ge=1, le=720)
    include_ai_insights: bool = True
    include_contributors: bool = True


class ShareLinkOut(BaseModel):
    token: str
    analysis_id: uuid.UUID
    expires_at: datetime
    include_ai_insights: bool
    include_contributors: bool
    revoked: bool = False


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "1.0.0"
    services: dict[str, str] = {}


class ErrorResponse(BaseModel):
    error: str
    code: str
    detail: Optional[str] = None
