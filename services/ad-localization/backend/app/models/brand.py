from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Brand(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "brands"

    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    display_name_by_market: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict
    )

    restrictions: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    voice: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Brand-level locks that feed default strategy resolver
    lock_brand_name: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Free-form prompt additions injected into every AI call made under this brand.
    # Used for "brand tone + standing instructions" that don't fit voice/restrictions.
    prompt_additions: Mapped[str] = mapped_column(String(4000), nullable=False, default="")

    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    memberships = relationship("BrandMembership", back_populates="brand", cascade="all, delete-orphan")
    glossary_entries = relationship(
        "GlossaryEntry", back_populates="brand", cascade="all, delete-orphan"
    )
    overrides = relationship(
        "BrandRuleOverride", back_populates="brand", cascade="all, delete-orphan"
    )


class GlossaryEntry(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "glossary_entries"
    __table_args__ = (
        UniqueConstraint("brand_id", "source_term", name="uq_glossary_brand_term"),
    )

    brand_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("brands.id", ondelete="CASCADE"), nullable=False
    )
    source_term: Mapped[str] = mapped_column(String(255), nullable=False)
    source_language: Mapped[str] = mapped_column(String(20), nullable=False, default="en")
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)

    translations: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    locked_transcreations: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    approved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    brand = relationship("Brand", back_populates="glossary_entries")
