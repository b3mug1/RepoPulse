"""Add watchlist table for scheduled repository re-scans and delta alerts."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "007"
down_revision: str | None = "006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "watchlist",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("repository_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("cadence", sa.String(length=20), server_default="weekly", nullable=False),
        sa.Column("webhook_url", sa.String(length=512), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_check_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_analysis_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "last_alerts",
            postgresql.JSON(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["repository_id"], ["repositories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_watchlist_repo", "watchlist", ["repository_id"], unique=True)
    op.create_index("ix_watchlist_next_check", "watchlist", ["is_active", "next_check_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_watchlist_next_check", table_name="watchlist")
    op.drop_index("ix_watchlist_repo", table_name="watchlist")
    op.drop_table("watchlist")
