from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class PromptOverride(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Admin-editable prompt snippet layered into every matching AI call.

    Natural key: (use_case, market, mode). Any of market / mode may be NULL
    meaning "applies to all markets" / "applies regardless of mode".
    """

    __tablename__ = "prompt_overrides"
    __table_args__ = (
        UniqueConstraint("use_case", "market", "mode", name="uq_prompt_override"),
    )

    # Matches app.prompt_assembly.use_cases.UseCase values.
    use_case: Mapped[str] = mapped_column(String(50), nullable=False, index=True)

    # Parent market ("DE") OR sub-market ("US-NJ", "NG-LA"). Empty string == all markets.
    market: Mapped[str] = mapped_column(String(16), nullable=False, default="", index=True)

    # One of: "", "language", "compliance", "element_replace".
    # Empty == applies for every mode combination.
    mode: Mapped[str] = mapped_column(String(32), nullable=False, default="")

    content: Mapped[str] = mapped_column(String(8000), nullable=False, default="")
    notes: Mapped[str] = mapped_column(String(500), nullable=False, default="")

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
