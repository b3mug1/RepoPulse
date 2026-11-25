"""Add share_links table for public time-limited report links."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "share_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("analysis_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("include_ai_insights", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("include_contributors", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("revoked", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["analysis_id"], ["analyses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_share_links_token", "share_links", ["token"], unique=True)
    op.create_index("ix_share_links_analysis", "share_links", ["analysis_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_share_links_analysis", table_name="share_links")
    op.drop_index("ix_share_links_token", table_name="share_links")
    op.drop_table("share_links")
