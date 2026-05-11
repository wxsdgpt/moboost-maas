"""initial schema

Revision ID: a252b2b3bb1e
Revises:
Create Date: 2026-04-20

Uses Base.metadata.create_all so dependency ordering across the ~24 V1 tables
is resolved automatically. Subsequent migrations will use explicit op.* calls.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

from app.models import Base

# revision identifiers, used by Alembic.
revision: str = "a252b2b3bb1e"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    # Skip procrastinate's own tables (they live in the same DB but are
    # managed by `procrastinate schema --apply`).
    tables = [
        t for t in Base.metadata.sorted_tables if not t.name.startswith("procrastinate_")
    ]
    Base.metadata.create_all(bind=bind, tables=tables)


def downgrade() -> None:
    bind = op.get_bind()
    tables = [
        t
        for t in reversed(Base.metadata.sorted_tables)
        if not t.name.startswith("procrastinate_")
    ]
    Base.metadata.drop_all(bind=bind, tables=tables)
