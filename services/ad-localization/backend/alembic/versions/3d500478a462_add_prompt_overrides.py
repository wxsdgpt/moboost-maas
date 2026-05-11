"""add prompt_overrides

Revision ID: 3d500478a462
Revises: 05796006b779
Create Date: 2026-04-20 19:31:49.900083

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "3d500478a462"
down_revision: Union[str, None] = "05796006b779"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Guard: initial migration (create_all) may already have created this table
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "prompt_overrides" in inspector.get_table_names():
        return
    op.create_table(
        "prompt_overrides",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("use_case", sa.String(length=50), nullable=False),
        sa.Column("market", sa.String(length=16), nullable=False, server_default=""),
        sa.Column("mode", sa.String(length=32), nullable=False, server_default=""),
        sa.Column("content", sa.String(length=8000), nullable=False, server_default=""),
        sa.Column("notes", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["users.id"], ondelete="SET NULL",
            name="fk_prompt_overrides_updated_by_users",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_prompt_overrides"),
        sa.UniqueConstraint(
            "use_case", "market", "mode", name="uq_prompt_override"
        ),
    )
    op.create_index(
        "ix_prompt_overrides_use_case",
        "prompt_overrides",
        ["use_case"],
    )
    op.create_index(
        "ix_prompt_overrides_market",
        "prompt_overrides",
        ["market"],
    )


def downgrade() -> None:
    op.drop_index("ix_prompt_overrides_market", table_name="prompt_overrides")
    op.drop_index("ix_prompt_overrides_use_case", table_name="prompt_overrides")
    op.drop_table("prompt_overrides")
