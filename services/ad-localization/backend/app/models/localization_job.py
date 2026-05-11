from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import JobStatus


class LocalizationJob(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "localization_jobs"

    source_asset_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("source_assets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    requested_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # e.g. ["US", "UK", "DE", "FR", "BR", "IN", "PH", "NG"]
    target_markets: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # strategy_matrix[lu_id][market] = { strategy, user_instructions?, user_provided_content? }
    strategy_matrix: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # { language: bool, compliance: bool, element_replace: bool }
    # Drives what the orchestrator actually runs for this job. All true by default.
    localization_modes: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=lambda: {"language": True, "compliance": True, "element_replace": True},
    )

    status: Mapped[JobStatus] = mapped_column(
        Enum(JobStatus, name="job_status"), nullable=False, default=JobStatus.draft
    )

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(4000), nullable=True)

    estimated_cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    actual_cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)

    localized_assets = relationship(
        "LocalizedAsset", back_populates="job", cascade="all, delete-orphan"
    )
