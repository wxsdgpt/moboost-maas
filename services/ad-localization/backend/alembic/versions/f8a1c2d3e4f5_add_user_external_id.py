"""add external_id to users for moboost-maas proxy auth

Revision ID: f8a1c2d3e4f5
Revises: 3d500478a462
Create Date: 2026-04-23

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "f8a1c2d3e4f5"
down_revision: Union[str, None] = "3d500478a462"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Guard: initial migration (create_all) may already have added this column
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("users")}
    if "external_id" in cols:
        return
    op.add_column("users", sa.Column("external_id", sa.String(255), nullable=True))
    op.create_unique_constraint("uq_users_external_id", "users", ["external_id"])
    op.create_index("ix_users_external_id", "users", ["external_id"])


def downgrade() -> None:
    op.drop_index("ix_users_external_id", table_name="users")
    op.drop_constraint("uq_users_external_id", "users", type_="unique")
    op.drop_column("users", "external_id")
