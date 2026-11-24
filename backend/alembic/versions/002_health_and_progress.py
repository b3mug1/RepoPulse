"""Add repository health score and task progress."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("analyses", sa.Column("health_score", sa.Integer(), server_default="0", nullable=False))
    op.add_column("analyses", sa.Column("health_breakdown", postgresql.JSON(), server_default="{}", nullable=False))
    op.add_column("analyses", sa.Column("health_findings", postgresql.JSON(), server_default="[]", nullable=False))
    op.add_column("analyses", sa.Column("progress_stage", sa.String(length=80), server_default="queued", nullable=False))


def downgrade() -> None:
    op.drop_column("analyses", "progress_stage")
    op.drop_column("analyses", "health_findings")
    op.drop_column("analyses", "health_breakdown")
    op.drop_column("analyses", "health_score")
