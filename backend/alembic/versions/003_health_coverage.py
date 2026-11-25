"""Persist Health Score coverage for transparent partial data."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("analyses", sa.Column("health_coverage", sa.Integer(), server_default="0", nullable=False))
    op.alter_column("analyses", "health_score", existing_type=sa.Integer(), nullable=True)
    # Scores created by the previous formula did not distinguish missing data from zero.
    op.execute("UPDATE analyses SET health_score = NULL")


def downgrade() -> None:
    op.execute("UPDATE analyses SET health_score = 0 WHERE health_score IS NULL")
    op.alter_column("analyses", "health_score", existing_type=sa.Integer(), nullable=False, server_default="0")
    op.drop_column("analyses", "health_coverage")
