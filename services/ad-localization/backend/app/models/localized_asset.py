from __future__ import annotations

import uuid

from sqlalchemy import Boolean, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import LocalizedAssetStatus, Market


class LocalizedAsset(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "localized_assets"

    localization_job_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("localization_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_asset_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("source_assets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    target_market: Mapped[Market] = mapped_column(Enum(Market, name="market"), nullable=False)
    # e.g. US-NJ, NG-LA, UK-GB, UK-NI; None for federal-only markets without subdivision (DE/FR/PH/BR)
    target_sub_market: Mapped[str | None] = mapped_column(
        String(16),
        ForeignKey("sub_markets.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    output_storage_key: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    output_file_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # unit_outputs[i] = { lu_id, strategy_applied, processing_method, output_content,
    #                     ai_generation_id, change_minimization_verified, score }
    unit_outputs: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    compliance_overlay_applied: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    compliance_report_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("compliance_check_reports.id", ondelete="SET NULL"),
        nullable=True,
    )

    status: Mapped[LocalizedAssetStatus] = mapped_column(
        Enum(LocalizedAssetStatus, name="localized_asset_status"),
        nullable=False,
        default=LocalizedAssetStatus.draft,
    )

    confirmation_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("asset_confirmations.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Distribution metadata (see DATA_MODELS.md LocalizedAsset.platform_metadata)
    platform_metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    job = relationship("LocalizationJob", back_populates="localized_assets")
