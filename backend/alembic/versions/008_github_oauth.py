"""Add GitHub OAuth fields to users, is_private to repositories, and user_id to watchlist."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "008"
down_revision: str | None = "007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("github_id", sa.BigInteger(), nullable=True))
    op.add_column("users", sa.Column("avatar_url", sa.String(length=512), nullable=True))
    op.add_column("users", sa.Column("encrypted_github_token", sa.Text(), nullable=True))
    op.create_index("ix_users_github_id", "users", ["github_id"], unique=True)

    op.add_column(
        "repositories",
        sa.Column("is_private", sa.Boolean(), server_default="false", nullable=False),
    )

    op.add_column(
        "watchlist",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_watchlist_user_id",
        "watchlist",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_index("ix_watchlist_repo", table_name="watchlist")
    op.create_index(
        "ix_watchlist_user_repo",
        "watchlist",
        ["user_id", "repository_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_watchlist_user_repo", table_name="watchlist")
    op.create_index("ix_watchlist_repo", "watchlist", ["repository_id"], unique=True)
    op.drop_constraint("fk_watchlist_user_id", "watchlist", type_="foreignkey")
    op.drop_column("watchlist", "user_id")

    op.drop_column("repositories", "is_private")

    op.drop_index("ix_users_github_id", table_name="users")
    op.drop_column("users", "encrypted_github_token")
    op.drop_column("users", "avatar_url")
    op.drop_column("users", "github_id")
