from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import AIModel, AIStatus


class AIGenerationLog(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Every AI call is logged here. Audit-critical — append-only."""

    __tablename__ = "ai_generation_logs"

    localized_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("localized_assets.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    lu_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("localizable_units.id", ondelete="SET NULL"),
        nullable=True,
    )

    use_case: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    model: Mapped[AIModel] = mapped_column(Enum(AIModel, name="ai_model"), nullable=False)
    provider_model_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Full Prompt Assembly trace (context snapshot, layers applied, final prompt)
    assembly_trace: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    input_hash: Mapped[str] = mapped_column(String(128), nullable=False, index=True)

    output_storage_keys: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    output_text: Mapped[str | None] = mapped_column(String, nullable=True)
    generation_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost_usd: Mapped[Decimal] = mapped_column(Numeric(12, 6), nullable=False, default=0)
    tokens_input: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tokens_output: Mapped[int | None] = mapped_column(Integer, nullable=True)

    verification: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    status: Mapped[AIStatus] = mapped_column(
        Enum(AIStatus, name="ai_status"), nullable=False, default=AIStatus.success
    )
    error_message: Mapped[str | None] = mapped_column(String(4000), nullable=True)

    cache_hit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cache_key: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)


class TranslationMemoryEntry(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "translation_memory_entries"

    cache_key: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)

    source_text: Mapped[str] = mapped_column(String, nullable=False)
    source_language: Mapped[str] = mapped_column(String(20), nullable=False)
    target_text: Mapped[str] = mapped_column(String, nullable=False)
    target_market: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    use_case: Mapped[str] = mapped_column(String(100), nullable=False)

    brand_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("brands.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    brand_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    glossary_version: Mapped[int | None] = mapped_column(Integer, nullable=True)

    original_generation_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("ai_generation_logs.id", ondelete="SET NULL"),
        nullable=True,
    )

    usage_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    approved_by_human: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    invalidated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CostRecord(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "cost_records"

    project_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    localization_job_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("localization_jobs.id", ondelete="SET NULL"), nullable=True
    )
    ai_generation_log_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("ai_generation_logs.id", ondelete="SET NULL"),
        nullable=True,
    )

    model: Mapped[str] = mapped_column(String(50), nullable=False)
    use_case: Mapped[str] = mapped_column(String(100), nullable=False)
    cost_usd: Mapped[Decimal] = mapped_column(Numeric(12, 6), nullable=False, default=0)
    tokens_used: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cache_hit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    billing_period: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
