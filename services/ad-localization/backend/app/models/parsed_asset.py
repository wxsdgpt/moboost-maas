from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ParsedAsset(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "parsed_assets"

    source_asset_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("source_assets.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    parse_method: Mapped[str] = mapped_column(String(50), nullable=False)
    parse_model_used: Mapped[str | None] = mapped_column(String(100), nullable=True)
    parse_confidence: Mapped[float | None] = mapped_column(Numeric(5, 3), nullable=True)
    parse_warnings: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    structural_metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    parse_duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    parsed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    source_asset = relationship("SourceAsset", back_populates="parsed_asset")
    localizable_units = relationship(
        "LocalizableUnit", back_populates="parsed_asset", cascade="all, delete-orphan"
    )
    compliance_units = relationship(
        "ComplianceUnit", back_populates="parsed_asset", cascade="all, delete-orphan"
    )
